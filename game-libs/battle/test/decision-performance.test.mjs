import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createTrialMetricsSink, fixedTrialRequests, renderTrialReportMarkdown, runProfileTrials, summarizeTrials,
} from "./tools/call-a-trials.mjs";
import { DEEPSEEK_CALL_A_PROFILES } from "../dist/decision-profiled.js";
import { FakeDeepSeekTransport } from "../dist/decision/testing.js";

const recordsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "records");
const recordFiles = {
  markdown: path.join(recordsDirectory, "call-a-performance-records.md"),
  json: path.join(recordsDirectory, "call-a-performance-records.json"),
  skip: path.join(recordsDirectory, "call-a-performance-skip.md"),
};

const REAL_TRIALS_OPT_IN = process.env.BATTLE_DEEPSEEK_PERF === "1";
const hasCredential = typeof process.env.DEEPSEEK_API_KEY === "string" && process.env.DEEPSEEK_API_KEY.length > 0;
const skipReason = !hasCredential
  ? "process.env.DEEPSEEK_API_KEY 未提供：真实 DeepSeek 对照试验按设计跳过（密钥只能来自执行进程环境变量）"
  : REAL_TRIALS_OPT_IN ? undefined : "未设置 BATTLE_DEEPSEEK_PERF=1：真实对照试验未显式 opt-in，跳过";

function providerResponse(text, overrides = {}) {
  return JSON.stringify({
    object: "response",
    status: "completed",
    model: "deepseek-flash",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
    ...overrides,
  });
}

function planForBattle(battle) {
  const self = battle.planningOrigin;
  const rival = battle.actors.find((actor) => actor.actorId !== battle.selfActorId);
  const adjacent = Math.abs(self.x - rival.tile.x) + Math.abs(self.y - rival.tile.y) === 1;
  return adjacent
    ? { path: [], skill: { skillId: "firebolt", targetActorId: rival.actorId, minCoefficient: 1 } }
    : { path: [{ x: self.x + 1, y: self.y }] };
}

function offlineTransportFactory(profileId, round) {
  return {
    async postResponses(bodyText) {
      const body = JSON.parse(bodyText);
      const isCallA = body.text?.format?.type === "text";
      const requestInput = JSON.parse(body.input);
      void profileId; void round;
      const text = isCallA
        ? "SITUATION\nround fixture\n\nSTRATEGY\nengage rival"
        : JSON.stringify(planForBattle(requestInput.battle));
      return {
        status: 200,
        bodyText: providerResponse(text, isCallA
          ? { usage: { input_tokens: 420, output_tokens: 96, output_tokens_details: { reasoning_tokens: 40 } } }
          : { usage: { input_tokens: 900, output_tokens: 24 } }),
      };
    },
  };
}

test("offline harness records interleaved per-profile observations without thresholds", async () => {
  const { records, sink } = createTrialMetricsSink();
  const profiles = ["v0-quality", "call-a-low"];
  const trials = await runProfileTrials({
    profiles, samplesPerProfile: 2, transportFactory: offlineTransportFactory, metricsSink: sink,
  });
  assert.equal(trials.length, 4);
  // Interleaving: round 0 covers both profiles before round 1 starts.
  assert.deepEqual(trials.map((trial) => [trial.round, trial.profile]).map(String), [
    "0,v0-quality", "0,call-a-low", "1,v0-quality", "1,call-a-low",
  ]);
  assert.ok(trials.every((trial) => trial.completion === "completed"));
  assert.ok(trials.every((trial) => trial.planOutcome === "accepted" || trial.planOutcome.startsWith("rejected")));

  const summary = summarizeTrials(trials, records);
  for (const profileId of profiles) {
    const profile = summary.profiles[profileId];
    assert.equal(profile.samples, 2);
    assert.equal(profile.callASuccessful, 2);
    assert.equal(typeof profile.callA.p50, "number");
    assert.equal(profile.callA.medianInputTokens, 420);
    assert.equal(profile.callA.medianOutputTokens, 96);
    assert.equal(profile.callA.medianReasoningTokens, 40);
    assert.equal(profile.callAOutcomeCounts.success?.length ?? 0, 2);
  }
  const markdown = renderTrialReportMarkdown(summary, { executedAt: "test", real: false, reason: "unit test", samplesPerProfile: 2 });
  assert.match(markdown, /# Call A 性能对照试验记录/);
  assert.match(markdown, /\| v0-quality \| 2 \|/);
  assert.match(markdown, /不构成统计显著性结论/);
});

test("harness isolates per-profile failures and records usage as unknown when omitted", async () => {
  const failingFactory = (profileId) => ({
    async postResponses(bodyText) {
      const body = JSON.parse(bodyText);
      const isCallA = body.text?.format?.type === "text";
      if (profileId === "call-a-none" && isCallA) return { status: 429, bodyText: "rate limited" };
      return { status: 200, bodyText: providerResponse(isCallA ? "memo" : '{"path":[]}') };
    },
  });
  const { records, sink } = createTrialMetricsSink();
  const trials = await runProfileTrials({
    profiles: ["call-a-none", "call-a-low"], samplesPerProfile: 1,
    transportFactory: (profileId) => failingFactory(profileId), metricsSink: sink,
  });
  assert.equal(trials.find((trial) => trial.profile === "call-a-none").planOutcome.startsWith("failed:"), true);
  assert.equal(trials.find((trial) => trial.profile === "call-a-low").planOutcome, "accepted");
  const summary = summarizeTrials(trials, records);
  assert.equal(summary.profiles["call-a-low"].callASuccessful, 1);
  assert.equal(summary.profiles["call-a-none"].callASuccessful, 0);
  assert.equal(summary.profiles["call-a-low"].callA.medianInputTokens, "unknown", "usage omitted → unknown, never inferred");
});

test("fixed trial fixtures are stable, seed-identical, and Plan-validatable", () => {
  const requests = fixedTrialRequests();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((request) => request.requestId), ["request:trial:approach", "request:trial:finisher"]);
  for (const request of requests) {
    assert.deepEqual(
      JSON.stringify(requests.find((item) => item.requestId === request.requestId)),
      JSON.stringify(fixedTrialRequests().find((item) => item.requestId === request.requestId)),
      "fixtures are deterministic",
    );
  }
  assert.deepEqual(Object.keys(DEEPSEEK_CALL_A_PROFILES).sort(), ["call-a-lean", "call-a-low", "call-a-low-tight", "call-a-none", "v0-quality"]);
});

test("optional credential-gated real DeepSeek Call A comparison trials", {
  skip: !REAL_TRIALS_OPT_IN || !hasCredential,
}, async () => {
  // DEEPSEEK_API_KEY is read ONLY from the executing process environment and
  // never written into source, fixtures, command lines, or logs.
  const credential = process.env.DEEPSEEK_API_KEY;
  const samplesPerProfile = Number(process.env.BATTLE_DEEPSEEK_PERF_SAMPLES ?? "3");
  const profiles = (process.env.BATTLE_DEEPSEEK_PERF_PROFILES ?? "v0-quality,call-a-low,call-a-none,call-a-low-tight,call-a-lean").split(",").filter((id) => id in DEEPSEEK_CALL_A_PROFILES);
  const observedMemos = [];
  const { records, sink } = createTrialMetricsSink();
  const transportFactory = () => ({
    async postResponses(bodyText, signal) {
      const response = await fetch("https://api.deepseek.com/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
        body: bodyText,
        signal,
      });
      return { status: response.status, bodyText: await response.text() };
    },
  });
  const trials = await runProfileTrials({
    profiles, samplesPerProfile, transportFactory, metricsSink: sink,
    processMessageObserver: (request, memo) => { if (observedMemos.length < 8) observedMemos.push([request.requestId, memo.slice(0, 40)]); },
  });
  const summary = summarizeTrials(trials, records);
  await mkdir(recordsDirectory, { recursive: true });
  await writeFile(recordFiles.markdown, renderTrialReportMarkdown(summary, {
    executedAt: new Date().toISOString(),
    real: true,
    samplesPerProfile,
    reason: undefined,
  }), "utf8");
  await writeFile(recordFiles.json, JSON.stringify({
    executedAt: new Date().toISOString(),
    samplesPerProfile,
    profiles,
    summary,
    trials: trials.map(({ profile, request, round, planOutcome, completion }) => ({ profile, request, round, planOutcome, completion })),
    metrics: records.map(({ profileId, stage, durationMs, outcome, usage, httpStatus, code }) => ({ profileId, stage, durationMs, outcome, usage, httpStatus, code })),
  }, null, 2), "utf8");
  assert.ok(trials.length >= profiles.length, "at least one sample per profile");
  assert.ok(observedMemos.every(([, memo]) => memo.length > 0), "visible memos observed through the bypass");
  assert.ok(!JSON.stringify(summary).includes(credential), "records never contain the credential");
});

test("real trials skip state is explicit when not opted in", {
  skip: REAL_TRIALS_OPT_IN && hasCredential,
}, async () => {
  // Records WHY the real comparison did not run in this execution without
  // touching curated real-trial records (a separate skip note file).
  await mkdir(recordsDirectory, { recursive: true });
  await writeFile(recordFiles.skip, renderTrialReportMarkdown(
    { profiles: {} },
    { executedAt: new Date().toISOString(), real: false, reason: skipReason, samplesPerProfile: 0 },
  ), "utf8");
  assert.ok(skipReason.length > 0);
});
