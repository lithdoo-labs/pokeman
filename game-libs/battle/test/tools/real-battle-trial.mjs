import { BattleSimulationBuilder } from "../../dist/simulation.js";
import { NullPresentation } from "../../dist/presentation.js";
import { DeepSeekProfiledDecision, DEEPSEEK_CALL_A_PROFILES } from "../../dist/decision-profiled.js";

const credential = process.env.DEEPSEEK_API_KEY;
const range = () => ({ width: 1, height: 2, originX: 0, originY: 1, coefficientUnits: [[1000], [0]] });

function definition() {
  const passable = Array.from({ length: 9 }, () => Array(9).fill(true));
  return {
    battleId: `battle:real:${process.argv[2] ?? "x"}`, sceneEpoch: 1, battleSeed: "real-battle-trials", tickDurationMs: 200,
    moveTicks: 2, protectionTicks: 1, maxPathSteps: 4,
    map: { ref: { arenaId: "trials" }, width: 9, height: 9, passable },
    actors: [
      {
        actorId: "player", team: "ally", tile: { x: 3, y: 4 }, direction: 6, maxHp: 8,
        character: { namespace: "resource.Graphics", key: "Characters/player.png" },
        skills: [{ skillId: "firebolt", baseDamage: 8, windupTicks: 0, recoveryTicks: 1, range: range(), effect: "spark" }],
      },
      {
        actorId: "rival", team: "enemy", tile: { x: 6, y: 4 }, direction: 4, maxHp: 8,
        character: { namespace: "resource.Graphics", key: "Characters/rival.png" },
        skills: [{ skillId: "firebolt", baseDamage: 8, windupTicks: 0, recoveryTicks: 1, range: range(), effect: "spark" }],
      },
    ],
  };
}

class ManualClock {
  now = 0; id = 1; tasks = [];
  nowMs() { return this.now; }
  schedule(delayMs, callback) {
    const task = { id: this.id++, due: this.now + delayMs, callback, cancelled: false };
    this.tasks.push(task);
    return () => { task.cancelled = true; };
  }
  advance(ms) {
    const target = this.now + ms;
    while (true) {
      const task = this.tasks.filter((item) => !item.cancelled && item.due <= target).sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!task) break;
      task.cancelled = true;
      this.now = task.due;
      task.callback();
    }
    this.now = target;
  }
}

const transport = {
  async postResponses(bodyText, signal) {
    const response = await fetch("https://api.deepseek.com/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
      body: bodyText,
      signal,
    });
    return { status: response.status, bodyText: await response.text() };
  },
};

async function runBattle(profileId) {
  const clock = new ManualClock();
  const metrics = [];
  const decision = new DeepSeekProfiledDecision({
    transport, profile: profileId, metricsSink: { record: (metric) => metrics.push(metric) },
  });
  const runtime = new BattleSimulationBuilder({
    clock, signal: new AbortController().signal, decision, presentation: new NullPresentation(),
  }).build(definition());
  const messages = [];
  runtime.onMessage((message) => messages.push(message.type));
  const run = runtime.run();
  const startedAt = Date.now();
  const deadline = startedAt + 6 * 60_000;
  let ticks = 0;
  while (!(Date.now() > deadline)) {
    clock.advance(200);
    ticks += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (runtime.getSnapshot().status === "settled" || runtime.getSnapshot().status === "closed") break;
  }
  const result = await Promise.race([run, new Promise((_, reject) => setTimeout(() => reject(new Error("battle timeout")), 5_000).unref?.())]);
  const replay = runtime.getReplay();
  const decisions = replay.decisions;
  const outcome = {
    profileId,
    result,
    wallSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
    ticks: runtime.getSnapshot().currentTick,
    decisions: decisions.length,
    accepted: decisions.filter((item) => item.consumeOutcome.type === "accepted").length,
    rejected: decisions.filter((item) => item.consumeOutcome.type === "rejected").length,
    stale: decisions.filter((item) => item.consumeOutcome.type === "stale").length,
    failed: decisions.filter((item) => item.consumeOutcome.type === "attempt_failed" || item.consumeOutcome.type === "session_fatal").length,
    corrections: decisions.filter((item) => item.attempt === 1).length,
    totalDamage: replay.ticks.reduce((sum, tick) => sum + tick.damage.reduce((inner, item) => inner + item.amount, 0), 0),
    callAMedian: median(metrics.filter((m) => m.scope === "provider" && m.stage === "call_a" && m.outcome === "success").map((m) => m.durationMs)),
    messageStreamSample: messages.length,
  };
  runtime.close();
  return outcome;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const profiles = process.argv.slice(2);
const results = [];
for (const profileId of profiles) {
  if (!(profileId in DEEPSEEK_CALL_A_PROFILES)) continue;
  const outcome = await runBattle(profileId);
  results.push(outcome);
  console.log(JSON.stringify(outcome));
}
console.log("SUMMARY " + JSON.stringify(results));
