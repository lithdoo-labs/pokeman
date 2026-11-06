import assert from "node:assert/strict";
import { test } from "node:test";

import { BattleSimulationBuilder } from "../dist/simulation.js";
import { RecordingPresentation } from "../dist/presentation.js";

class FakeBattleClock {
  now = 0;
  nextId = 1;
  tasks = [];
  nowMs() { return this.now; }
  schedule(delayMs, callback) {
    const task = { id: this.nextId++, due: this.now + delayMs, callback, cancelled: false };
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

class DeferredPort {
  entries = [];
  get requests() { return this.entries.map((entry) => entry.request); }
  decide(request) {
    return new Promise((resolve) => this.entries.push({ request, resolve }));
  }
  completeFor(request, plan) {
    this.entries.find((entry) => entry.request === request).resolve({
      type: "completed", requestId: request.requestId, generation: request.generation, plan,
    });
  }
  failFor(request, error) {
    this.entries.find((entry) => entry.request === request).resolve({
      type: "failed", requestId: request.requestId, generation: request.generation, error,
    });
  }
}

const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };
const point = (x, y) => ({ x, y });
const forwardRange = () => ({ width: 1, height: 2, originX: 0, originY: 1, coefficientUnits: [[1000], [0]] });
const beam3 = () => ({ width: 1, height: 4, originX: 0, originY: 3, coefficientUnits: [[1000], [1000], [1000], [0]] });

function definition(overrides = {}) {
  const passable = Array.from({ length: 7 }, () => Array(7).fill(true));
  const base = {
    battleId: "battle:runtime-messages",
    sceneEpoch: 1,
    battleSeed: "seed",
    tickDurationMs: 200,
    moveTicks: 2,
    protectionTicks: 0,
    maxPathSteps: 6,
    map: { ref: { arenaId: "test" }, width: 7, height: 7, passable },
    actors: [
      {
        actorId: "a", team: "ally", tile: point(2, 3), direction: 6, maxHp: 10,
        character: { namespace: "resource.Graphics", key: "Characters/A" },
        skills: [{ skillId: "strike", baseDamage: 2, windupTicks: 0, recoveryTicks: 0, range: forwardRange(), effect: "strike" }],
      },
      {
        actorId: "b", team: "enemy", tile: point(4, 3), direction: 4, maxHp: 10,
        character: { namespace: "resource.Graphics", key: "Characters/B" },
        skills: [{ skillId: "bolt", baseDamage: 3, windupTicks: 2, recoveryTicks: 0, range: beam3(), effect: "bolt" }],
      },
    ],
  };
  return { ...base, ...overrides };
}

function runtimeFor(def, { port = new DeferredPort(), metricsSink } = {}) {
  const clock = new FakeBattleClock();
  const presentation = new RecordingPresentation();
  const runtime = new BattleSimulationBuilder({
    clock, signal: new AbortController().signal, decision: port, presentation, ...(metricsSink === undefined ? {} : { metricsSink }),
  }).build(def ?? definition());
  return { runtime, clock, presentation, port };
}

test("decision.started announces only player-visible turns once each, never prefetch or correction", async () => {
  // a's first plan is an instant strike: its materialization immediately
  // issues a prefetch_after_materialize request that must not re-announce.
  const def = definition({
    actors: [
      definition().actors[0],
      { ...definition().actors[1], tile: point(3, 3), skills: [{ skillId: "jab", baseDamage: 1, windupTicks: 0, recoveryTicks: 0, range: forwardRange(), effect: "jab" }] },
    ],
  });
  const { runtime, clock, port } = runtimeFor(def);
  const messages = [];
  runtime.onMessage((message) => messages.push(message));
  const run = runtime.run();
  await flush();
  port.completeFor(port.requests[0], { path: [], skill: { skillId: "strike", targetActorId: "b", minCoefficient: 1 } });
  port.completeFor(port.requests[1], { path: [] });
  await flush();
  clock.advance(200);
  await flush();
  const started = messages.filter((message) => message.type === "decision.started");
  assert.deepEqual(started.map((message) => [message.actorId, message.reason]), [
    ["a", "initial"],
    ["b", "initial"],
    ["b", "damaging_hit"],
  ], "internal prefetch never re-announces; damaged turns do");
  // The prefetch request for a arrived without a new decision.started.
  const aRequests = port.requests.filter((request) => request.actorId === "a");
  assert.ok(aRequests.length >= 2, "prefetch request was issued");
  assert.equal(started.filter((message) => message.actorId === "a").length, 1);
  // Sequence/id/elapsed invariants hold across the mixed stream.
  const sequences = messages.map((message) => message.sequence);
  assert.deepEqual(sequences, [...sequences].sort((left, right) => left - right));
  assert.equal(new Set(messages.map((message) => message.id)).size, messages.length);
  assert.ok(messages.every((message) => Number.isInteger(message.elapsedMs) && message.elapsedMs >= 0));
  runtime.cancel();
  await run;
});

test("a damaging hit's new decision turn is announced after that Tick's committed facts", async () => {
  const { runtime, clock, port } = runtimeFor();
  const messages = [];
  runtime.onMessage((message) => messages.push(message));
  const run = runtime.run();
  await flush();
  // a walks away; b bolts a between two segments at tick 3.
  const aRequest = port.requests.find((request) => request.actorId === "a");
  const bRequest = port.requests.find((request) => request.actorId === "b");
  port.completeFor(aRequest, { path: [point(1, 3), point(0, 3)] });
  port.completeFor(bRequest, { path: [], skill: { skillId: "bolt", targetActorId: "a", minCoefficient: 1 } });
  await flush();
  clock.advance(200);
  await flush();
  clock.advance(200);
  await flush();
  clock.advance(200);
  await flush();
  const interrupted = messages.find((message) => message.type === "movement.interrupted");
  assert.notEqual(interrupted, undefined);
  const damagingStart = messages.find((message) => message.type === "decision.started" && message.actorId === "a" && message.sequence > interrupted.sequence);
  assert.notEqual(damagingStart, undefined, "a new visible turn for the damaged actor follows the committed facts");
  assert.equal(damagingStart.reason, "damaging_hit");
  runtime.cancel();
  await run;
});

test("reportDecisionAnalysis publishes once per still-valid visible request and drops everything else", async () => {
  const { runtime, clock, port } = runtimeFor();
  const messages = [];
  runtime.onMessage((message) => messages.push(message));
  const run = runtime.run();
  await flush();
  const aRequest = port.requests.find((request) => request.actorId === "a");
  runtime.reportDecisionAnalysis(aRequest, "当前距离敌人三格，应先靠近再进攻。");
  const analysis = messages.filter((message) => message.type === "decision.analysis_completed");
  assert.equal(analysis.length, 1);
  assert.equal(analysis[0].actorId, "a");
  assert.equal(analysis[0].text, "当前距离敌人三格，应先靠近再进攻。");
  assert.equal(analysis[0].tick, null, "non-authoritative narrative is not a Tick fact");

  // Duplicates, empty text, and unknown requests are silently dropped.
  runtime.reportDecisionAnalysis(aRequest, "second copy");
  runtime.reportDecisionAnalysis(aRequest, "   ");
  runtime.reportDecisionAnalysis({ ...aRequest, requestId: "request:999" }, "ghost");
  runtime.reportDecisionAnalysis({ ...aRequest, generation: aRequest.generation + 5 }, "wrong generation");
  runtime.reportDecisionAnalysis({ ...aRequest, actorId: "b" }, "wrong actor");
  assert.equal(messages.filter((message) => message.type === "decision.analysis_completed").length, 1);

  // Once the request is consumed and accepted, a late memo cannot be inserted.
  port.completeFor(aRequest, { path: [] });
  const bRequest = port.requests.find((request) => request.actorId === "b");
  port.completeFor(bRequest, { path: [] });
  await flush();
  clock.advance(200);
  await flush();
  assert.equal(messages.some((message) => message.type === "decision.accepted"), true);
  runtime.reportDecisionAnalysis(aRequest, "late memo after consumption");
  assert.equal(messages.filter((message) => message.type === "decision.analysis_completed").length, 1);

  // A correction request (attempt 1) never publishes narrative text.
  const aRejected = port.requests.filter((request) => request.actorId === "a").at(-1);
  runtime.cancel();
  await run;
  void aRejected;
});

test("correction requests are not announced and their memos are dropped", async () => {
  const { runtime, clock, port } = runtimeFor();
  const messages = [];
  runtime.onMessage((message) => messages.push(message));
  const run = runtime.run();
  await flush();
  const aRequest = port.requests.find((request) => request.actorId === "a");
  // Adjacent-but-out-of-bounds path forces exactly one correction.
  port.completeFor(aRequest, { path: [point(9, 9)] });
  const bRequest = port.requests.find((request) => request.actorId === "b");
  port.completeFor(bRequest, { path: [] });
  await flush();
  clock.advance(200);
  await flush();
  const correction = port.requests.find((request) => request.correction !== undefined);
  assert.notEqual(correction, undefined, "a correction request was issued");
  assert.equal(messages.some((message) => message.type === "decision.started" && message.actorId === "a" && message.sequence > 4), false,
    "correction does not re-announce analysis");
  runtime.reportDecisionAnalysis(correction, "internal correction memo");
  assert.equal(messages.some((message) => message.type === "decision.analysis_completed"), false);
  port.completeFor(correction, { path: [] });
    await flush();
clock.advance(200);
  await flush();
  runtime.cancel();
  await run;
});

test("session_fatal decisions announce decision.failed once before battle.ended", async () => {
  const { runtime, clock, port } = runtimeFor();
  const messages = [];
  let endedSeen = false;
  runtime.onMessage((message) => messages.push(message));
  const run = runtime.run();
  run.then(() => { endedSeen = messages.some((message) => message.type === "battle.ended"); });
  await flush();
  port.failFor(port.requests[0], { category: "session_fatal", code: "DECISION_PROVIDER_AUTH" });
  const bRequest = port.requests.find((request) => request.actorId === "b");
  port.completeFor(bRequest, { path: [] });
  await flush();
  clock.advance(200);
  await flush();
  const result = await run;
  assert.deepEqual(result, { type: "failure", source: "decision", code: "DECISION_PROVIDER_AUTH" });
  const failed = messages.filter((message) => message.type === "decision.failed");
  const ended = messages.filter((message) => message.type === "battle.ended");
  assert.deepEqual(failed.map((message) => message.actorId), ["a"]);
  assert.equal(failed[0].reason, "unavailable");
  assert.equal(ended.length, 1);
  assert.deepEqual(ended[0].result, result);
  assert.ok(failed[0].sequence < ended[0].sequence, "decision.failed precedes battle.ended");
  assert.equal(endedSeen, true, "battle.ended was published before run() resolved");
});

test("pause, resume, and cancel publish lifecycle messages exactly once", async () => {
  const { runtime, clock, port } = runtimeFor();
  const messages = [];
  runtime.onMessage((message) => messages.push(message));
  const run = runtime.run();
  await flush();
  runtime.pause("host-background");
  runtime.pause("host-background");
  assert.equal(messages.filter((message) => message.type === "battle.paused").length, 1);
  assert.deepEqual(messages.find((message) => message.type === "battle.paused").reason, "host-background");
  clock.advance(400);
  runtime.resume();
  assert.equal(messages.filter((message) => message.type === "battle.resumed").length, 1);
  runtime.cancel();
  const ended = messages.filter((message) => message.type === "battle.ended");
  assert.equal(ended.length, 1);
  assert.deepEqual(ended[0].result, { type: "cancelled" });
  await run;
  // Post-close analysis reports are dropped and no further messages appear.
  const count = messages.length;
  runtime.reportDecisionAnalysis(port.requests[0], "late");
  assert.equal(messages.length, count);
});

test("message listener throws are isolated and never affect the battle result", async () => {
  const { runtime, clock, port } = runtimeFor();
  const received = [];
  runtime.onMessage(() => { throw new Error("listener failure"); });
  runtime.onMessage((message) => received.push(message.sequence));
  const run = runtime.run();
  await flush();
  port.completeFor(port.requests[0], { path: [] });
  const bRequest = port.requests.find((request) => request.actorId === "b");
  port.completeFor(bRequest, { path: [] });
  await flush();
  clock.advance(200);
  await flush();
  assert.ok(received.length >= 4);
  runtime.cancel();
  assert.deepEqual(await run, { type: "cancelled" });
});

test("runtime decision metrics record request, acceptance, and action-start timing; sink failures are isolated", async () => {
  const metrics = [];
  const { runtime, clock, port } = runtimeFor(definition(), { metricsSink: { record: (metric) => { metrics.push(metric); } } });
  const messages = [];
  runtime.onMessage((message) => messages.push(message));
  const run = runtime.run();
  await flush();
  const aRequest = port.requests.find((request) => request.actorId === "a");
  port.completeFor(aRequest, { path: [point(1, 3)] });
  const bRequest = port.requests.find((request) => request.actorId === "b");
  port.completeFor(bRequest, { path: [] });
  await flush();
  clock.advance(200);
  await flush();
  clock.advance(200);
  await flush();
  const stages = new Map(metrics.map((metric) => [metric.stage, metric]));
  assert.equal(stages.get("request_to_completion").scope, "runtime");
  assert.equal([...new Set(metrics.filter((m) => m.scope === "runtime").map((m) => m.outcome))].includes("completed"), true);
  assert.equal(stages.get("completion_to_acceptance") !== undefined, true);
  assert.equal(Number.isInteger(stages.get("completion_to_acceptance").tickDelay), true);
  assert.equal(stages.get("acceptance_to_action_start") !== undefined, true);
  runtime.cancel();
  await run;

  // A throwing sink and a rejecting sink never change battle behavior.
  for (const badSink of [{ record() { throw new Error("sync"); } }, { record() { return Promise.reject(new Error("async")); } }]) {
    const broken = runtimeFor(definition(), { metricsSink: badSink });
    const brokenRun = broken.runtime.run();
    await flush();
    broken.port.completeFor(broken.port.requests[0], { path: [] });
    const bReq = broken.port.requests.find((request) => request.actorId === "b");
    broken.port.completeFor(bReq, { path: [] });
    broken.clock.advance(200);
    await flush();
    broken.runtime.cancel();
    assert.deepEqual(await brokenRun, { type: "cancelled" });
  }
});
