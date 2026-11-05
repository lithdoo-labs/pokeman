import { DeepSeekProfiledDecision, DEEPSEEK_CALL_A_PROFILES } from "../../dist/decision-profiled.js";
import { validatePlan } from "../../dist/simulation/plan.js";
import { createInitialState, validateResolvedBattleDefinition } from "../../dist/simulation/state.js";

/**
 * Shared Call A performance-trial harness.
 *
 * Trials run every profile against the SAME fixed DecisionRequest fixtures
 * (identical Observation / Prompt / battle seed) in interleaved rounds, so
 * provider load differences between two points in time hit all profiles
 * equally. Results are plain observations with no pass/fail thresholds and no
 * statistical-significance claims; small samples describe this run only.
 */

const range = (units = 1000) => ({ width: 1, height: 2, originX: 0, originY: 1, coefficientUnits: [[units], [0]] });

export function trialDefinition() {
  const passable = Array.from({ length: 9 }, () => Array(9).fill(true));
  passable[4][4] = false;
  return validateResolvedBattleDefinition({
    battleId: "battle:call-a-trials", sceneEpoch: 1, battleSeed: "call-a-trials-seed", tickDurationMs: 200,
    moveTicks: 2, protectionTicks: 1, maxPathSteps: 4,
    map: { ref: { arenaId: "trials" }, width: 9, height: 9, passable },
    actors: [
      {
        actorId: "player", team: "ally", tile: { x: 2, y: 4 }, direction: 6, maxHp: 18,
        character: { namespace: "resource.Graphics", key: "Characters/player.png" },
        skills: [{ skillId: "firebolt", baseDamage: 6, windupTicks: 1, recoveryTicks: 1, range: range(), effect: "spark" }],
      },
      {
        actorId: "rival", team: "enemy", tile: { x: 6, y: 4 }, direction: 4, maxHp: 16,
        character: { namespace: "resource.Graphics", key: "Characters/rival.png" },
        skills: [{ skillId: "firebolt", baseDamage: 5, windupTicks: 1, recoveryTicks: 1, range: range(), effect: "spark" }],
      },
    ],
  });
}

function fixedRequest(overrides) {
  const definition = trialDefinition();
  const state = createInitialState(definition);
  const request = {
    requestId: "request:trial", actorId: "player", generation: 1, planningOrigin: { x: 2, y: 4 },
    observation: {
      tick: 3, selfActorId: "player",
      actors: [...state.actors.values()].map((actor) => ({
        actorId: actor.actorId, team: actor.team, hp: actor.hp, maxHp: actor.maxHp,
        tile: { ...actor.tile }, direction: actor.direction, action: { type: "idle" },
        protectedUntilTickExclusive: 0,
        skills: definition.actors.find((item) => item.actorId === actor.actorId).skills.map((skill) => ({
          skillId: skill.skillId, baseDamage: skill.baseDamage, windupTicks: skill.windupTicks,
          recoveryTicks: skill.recoveryTicks, range: skill.range,
        })),
      })),
      map: { width: definition.map.width, height: definition.map.height, passable: definition.map.passable },
      recentEvents: [],
    },
    constraints: {
      maxPathSteps: definition.maxPathSteps,
      movement: { cardinalOnly: true },
      turn: { allowed: true },
      skills: [{ skillId: "firebolt", minCoefficients: [1] }],
    },
  };
  return { ...request, ...overrides };
}

/** Two fixed observation fixtures: an approach situation and a close-range finisher. */
export function fixedTrialRequests() {
  return Object.freeze([
    Object.freeze(fixedRequest({ requestId: "request:trial:approach" })),
    Object.freeze(fixedRequest({
      requestId: "request:trial:finisher",
      planningOrigin: { x: 5, y: 4 },
      observation: {
        ...fixedRequest().observation,
        actors: fixedRequest().observation.actors.map((actor) => actor.actorId === "player"
          ? { ...actor, tile: { x: 5, y: 4 } }
          : { ...actor, tile: { x: 6, y: 4 }, hp: 3 }),
      },
    })),
  ]);
}

export function createTrialMetricsSink(limit = 100_000) {
  const records = [];
  return {
    records,
    sink: {
      record(metric) {
        if (records.length < limit) records.push(structuredClone(metric));
      },
    },
  };
}

/**
 * Interleaved trial rounds. Each round runs one decide() per profile against a
 * rotating fixed request, records provider metrics plus the local Plan
 * validation outcome for the produced plan, and never lets a single profile
 * failure abort the run.
 */
export async function runProfileTrials({
  profiles = Object.keys(DEEPSEEK_CALL_A_PROFILES),
  samplesPerProfile = 3,
  transportFactory,
  metricsSink,
  processMessageObserver,
}) {
  const requests = fixedTrialRequests();
  const trials = [];
  for (let round = 0; round < samplesPerProfile; round += 1) {
    for (const profileId of profiles) {
      const request = requests[round % requests.length];
      const trial = { profile: profileId, request: request.requestId, round, callA: null, callB: null, planOutcome: null, completion: null };
      try {
        const decision = new DeepSeekProfiledDecision(
          { transport: transportFactory(profileId, round), profile: profileId, ...(metricsSink === undefined ? {} : { metricsSink }) },
          processMessageObserver,
        );
        const completion = await decision.decide(request, new AbortController().signal);
        trial.completion = completion.type;
        if (completion.type === "completed") {
          const definition = trialDefinition();
          const state = createInitialState(definition);
          const actor = state.actors.get("player");
          const planningOrigin = request.planningOrigin;
          const validation = validatePlan(definition, state, actor, planningOrigin, completion.plan);
          trial.planOutcome = validation.accepted ? "accepted" : `rejected:${validation.reason}`;
        } else {
          trial.planOutcome = `failed:${completion.error.category}:${completion.error.code}`;
        }
      } catch (error) {
        trial.completion = "threw";
        trial.planOutcome = `threw:${error instanceof Error ? error.message : String(error)}`;
      }
      trials.push(trial);
    }
  }
  return trials;
}

function quantile(sortedValues, q) {
  if (sortedValues.length === 0) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(q * sortedValues.length) - 1));
  return sortedValues[index];
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Pure observation summary: no thresholds, no significance claims. */
export function summarizeTrials(trials, metrics) {
  const byProfile = new Map();
  for (const profileId of new Set(trials.map((trial) => trial.profile))) {
    const profileTrials = trials.filter((trial) => trial.profile === profileId);
    const profileMetrics = metrics.filter((metric) => metric.scope === "provider" && metric.profileId === profileId);
    const callA = profileMetrics.filter((metric) => metric.stage === "call_a");
    const callB = profileMetrics.filter((metric) => metric.stage === "call_b");
    const latencies = (stage) => stage.filter((metric) => metric.outcome === "success").map((metric) => metric.durationMs).sort((left, right) => left - right);
    const callALatencies = latencies(callA);
    const callBLatencies = latencies(callB);
    const usageValue = (values) => (values.length === 0 ? "unknown" : median(values));
    const numericUsage = (stage, field) => stage.filter((metric) => metric.usage !== null).map((metric) => metric.usage[field]).filter((value) => typeof value === "number");
    byProfile.set(profileId, {
      samples: profileTrials.length,
      callASuccessful: callALatencies.length,
      callAOutcomeCounts: Object.groupBy(callA, (metric) => metric.outcome),
      callBLatencies,
      callA: {
        p50: quantile(callALatencies, 0.5),
        p90: quantile(callALatencies, 0.9),
        p95: quantile(callALatencies, 0.95),
        min: callALatencies[0] ?? null,
        max: callALatencies.at(-1) ?? null,
        medianInputTokens: usageValue(numericUsage(callA, "inputTokens")),
        medianOutputTokens: usageValue(numericUsage(callA, "outputTokens")),
        medianReasoningTokens: usageValue(numericUsage(callA, "reasoningTokens")),
      },
      planOutcomes: Object.groupBy(profileTrials, (trial) => trial.planOutcome ?? "none"),
    });
  }
  return { profiles: Object.fromEntries(byProfile) };
}

export function renderTrialReportMarkdown(summary, { executedAt, real, reason, samplesPerProfile, selection } = {}) {
  const lines = [];
  lines.push("# Call A 性能对照试验记录");
  lines.push("");
  lines.push(`- 执行时间：${executedAt ?? "unknown"}`);
  lines.push(`- 数据来源：${real ? "真实 DeepSeek Responses API（显式 opt-in）" : "未执行真实 Provider 试验"}`);
  if (!real && reason) lines.push(`- 跳过原因：${reason}`);
  lines.push(`- 每个 profile 样本数：${samplesPerProfile ?? "unknown"}（交错轮转，固定 Observation / Prompt / battle seed）`);
  lines.push("- 说明：小样本观测记录，不构成统计显著性结论；不设 p50/p95/胜率硬门槛。");
  lines.push("");
  lines.push("| profile | 样本 | Call A 成功 | Call A p50 (ms) | Call A p90 (ms) | Call A p95 (ms) | input tokens | output tokens | reasoning tokens | Plan 结果 |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const [profileId, profile] of Object.entries(summary.profiles)) {
    const planOutcomes = Object.entries(profile.planOutcomes).map(([outcome, items]) => `${outcome}×${items.length}`).join(", ");
    lines.push(`| ${profileId} | ${profile.samples} | ${profile.callASuccessful} | ${profile.callA.p50 ?? "-"} | ${profile.callA.p90 ?? "-"} | ${profile.callA.p95 ?? "-"} | ${profile.callA.medianInputTokens ?? "unknown"} | ${profile.callA.medianOutputTokens ?? "unknown"} | ${profile.callA.medianReasoningTokens ?? "unknown"} | ${planOutcomes} |`);
  }
  if (selection) {
    lines.push("");
    lines.push(`## 选定配置：${selection.profileId}`);
    lines.push("");
    lines.push(selection.reason);
  }
  return `${lines.join("\n")}\n`;
}
