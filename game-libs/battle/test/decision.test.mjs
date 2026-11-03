import assert from "node:assert/strict";
import { test } from "node:test";

import { DeepSeekDecision } from "../dist/decision.js";
import { FakeDeepSeekTransport } from "../dist/decision/testing.js";
import { BattleSimulationBuilder } from "../dist/simulation.js";
import { RecordingPresentation } from "../dist/presentation.js";

const encoder = new TextEncoder();
const MAX_BYTES = 512 * 1024;
const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };

function providerResponse(text, overrides = {}) {
  return JSON.stringify({
    object: "response",
    status: "completed",
    model: "deepseek-flash-2026-09-01",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
    ...overrides,
  });
}

function request(overrides = {}) {
  const passable = [
    [true, false, true, true, true],
    [true, true, true, true, true],
    [true, true, true, true, true],
    [true, true, true, true, true],
  ];
  const range = { width: 1, height: 2, originX: 0, originY: 1, coefficientUnits: [[1000], [0]] };
  const base = {
    requestId: "request:7",
    actorId: "self",
    generation: 4,
    planningOrigin: { x: 1, y: 0 },
    observation: {
      tick: 12,
      selfActorId: "self",
      actors: [
        {
          actorId: "self", team: "ally", hp: 8, maxHp: 10, tile: { x: 0, y: 0 }, direction: 6,
          action: { type: "moving", from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, startTick: 11, completeTick: 13 },
          protectedUntilTickExclusive: 0,
          skills: [{ skillId: "strike", baseDamage: 3, windupTicks: 1, recoveryTicks: 2, range }],
        },
        {
          actorId: "enemy", team: "enemy", hp: 6, maxHp: 6, tile: { x: 3, y: 1 }, direction: 4,
          action: { type: "idle" }, protectedUntilTickExclusive: 14,
          skills: [{ skillId: "jab", baseDamage: 2, windupTicks: 0, recoveryTicks: 1, range }],
        },
      ],
      map: { width: 5, height: 4, passable },
      recentEvents: [{ type: "move_failed", tick: 11, actorId: "enemy", tile: { x: 2, y: 1 }, reason: "occupied" }],
    },
    constraints: {
      maxPathSteps: 1,
      movement: { cardinalOnly: true },
      turn: { allowed: true },
      skills: [{ skillId: "strike", minCoefficients: [0.5, 1] }],
    },
  };
  return { ...base, ...overrides };
}

async function decideWith(firstStep, requestValue = request()) {
  const transport = new FakeDeepSeekTransport();
  if (firstStep.type === "response") transport.enqueueResponse(firstStep.status, firstStep.bodyText);
  else transport.enqueueReject(firstStep.error);
  const completion = await new DeepSeekDecision({ transport }).decide(requestValue, new AbortController().signal);
  return { completion, transport };
}

class IntegrationClock {
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

function integrationDefinition() {
  const range = { width: 1, height: 2, originX: 0, originY: 1, coefficientUnits: [[1000], [0]] };
  return {
    battleId: "battle:deepseek-integration", sceneEpoch: 1, battleSeed: "seed", tickDurationMs: 200,
    moveTicks: 2, protectionTicks: 0, maxPathSteps: 6,
    map: { ref: { arenaId: "test" }, width: 7, height: 7, passable: Array.from({ length: 7 }, () => Array(7).fill(true)) },
    actors: [
      {
        actorId: "a", team: "ally", tile: { x: 2, y: 3 }, direction: 6, maxHp: 5,
        character: { namespace: "resource.Graphics", key: "Characters/A" },
        skills: [{ skillId: "strike", baseDamage: 5, windupTicks: 0, recoveryTicks: 0, range, effect: "strike" }],
      },
      {
        actorId: "b", team: "enemy", tile: { x: 3, y: 3 }, direction: 4, maxHp: 5,
        character: { namespace: "resource.Graphics", key: "Characters/B" },
        skills: [{ skillId: "strike", baseDamage: 5, windupTicks: 0, recoveryTicks: 0, range, effect: "strike" }],
      },
    ],
  };
}

test("DeepSeekDecision sends the exact two-call profiles and deterministic canonical context", async () => {
  const transport = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse("SITUATION\nsteady\n\nSTRATEGY\nadvance"))
    .enqueueResponse(200, providerResponse(JSON.stringify({ turn: 6, path: [{ x: 2, y: 0 }], skill: { skillId: "strike", targetActorId: "enemy", minCoefficient: 1 } })));
  const completion = await new DeepSeekDecision({ transport }).decide(request(), new AbortController().signal);

  assert.deepEqual(completion, {
    type: "completed", requestId: "request:7", generation: 4,
    plan: { turn: 6, path: [{ x: 2, y: 0 }], skill: { skillId: "strike", targetActorId: "enemy", minCoefficient: 1 } },
  });
  assert.equal(transport.requests.length, 2);
  const callA = JSON.parse(transport.requests[0].bodyText);
  const callB = JSON.parse(transport.requests[1].bodyText);
  assert.deepEqual(Object.keys(callA), ["model", "instructions", "input", "reasoning", "max_output_tokens", "stream", "text"]);
  assert.equal(callA.model, "deepseek-flash");
  assert.deepEqual(callA.reasoning, { effort: "high" });
  assert.equal(callA.max_output_tokens, 65_536);
  assert.equal(callA.stream, false);
  assert.deepEqual(callA.text, { format: { type: "text" } });
  assert.equal("temperature" in callA, false);
  assert.equal("tools" in callA, false);

  const battle = JSON.parse(callA.input);
  assert.deepEqual(Object.keys(battle), ["version", "tick", "selfActorId", "planningOrigin", "map", "actors", "constraints", "recentEvents", "correction"]);
  assert.deepEqual(battle.planningOrigin, { x: 1, y: 0 });
  assert.deepEqual(battle.actors[0].tile, { x: 0, y: 0 });
  assert.deepEqual(battle.actors[0].action.to, { x: 1, y: 0 });
  assert.deepEqual(battle.map, { width: 5, height: 4, window: { originX: 0, originY: 0, rows: [".#.", "..."] } });
  assert.deepEqual(battle.actors[0].skills[0].range.rows, [[1000], [0]]);
  assert.equal(battle.correction, null);

  assert.deepEqual(Object.keys(callB), ["model", "instructions", "input", "reasoning", "temperature", "max_output_tokens", "stream", "text"]);
  assert.deepEqual(callB.reasoning, { effort: "none" });
  assert.equal(callB.temperature, 0);
  assert.equal(callB.max_output_tokens, 4096);
  assert.equal(callB.text.format.type, "json_schema");
  assert.equal(callB.text.format.name, "battle_plan_v0");
  assert.deepEqual(callB.text.format.schema.required, ["path"]);
  const materialization = JSON.parse(callB.input);
  assert.deepEqual(materialization.battle, battle);
  assert.equal(materialization.strategyMemo, "SITUATION\nsteady\n\nSTRATEGY\nadvance");
  assert.equal(callB.instructions.includes(materialization.strategyMemo), false);
});

test("identical authoritative request data serializes byte-for-byte identically", async () => {
  const transport = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse("same strategy"))
    .enqueueResponse(200, providerResponse('{"path":[]}'))
    .enqueueResponse(200, providerResponse("same strategy"))
    .enqueueResponse(200, providerResponse('{"path":[]}'));
  const decision = new DeepSeekDecision({ transport });
  await decision.decide(request({ requestId: "request:first", generation: 1 }), new AbortController().signal);
  await decision.decide(request({ requestId: "request:second", generation: 99 }), new AbortController().signal);
  assert.equal(transport.requests[0].bodyText, transport.requests[2].bodyText);
  assert.equal(transport.requests[1].bodyText, transport.requests[3].bodyText);
});

test("correction decide is self-contained and re-runs both provider calls", async () => {
  const transport = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse("first strategy"))
    .enqueueResponse(200, providerResponse('{"path":[]}'))
    .enqueueResponse(200, providerResponse("replacement strategy"))
    .enqueueResponse(200, providerResponse('{"path":[{"x":2,"y":0}]}'));
  const decision = new DeepSeekDecision({ transport });
  await decision.decide(request(), new AbortController().signal);
  const correction = request({
    requestId: "request:8",
    correction: { rejectedPlan: { path: [] }, reason: "invalid_target" },
  });
  const completion = await decision.decide(correction, new AbortController().signal);
  assert.equal(transport.requests.length, 4);
  assert.deepEqual(JSON.parse(JSON.parse(transport.requests[2].bodyText).input).correction, {
    rejectedPlan: { path: [] }, reason: "invalid_target",
  });
  assert.equal(JSON.parse(JSON.parse(transport.requests[3].bodyText).input).strategyMemo, "replacement strategy");
  assert.equal(completion.requestId, "request:8");
  assert.equal(completion.generation, 4);
});

test("strict local Plan parser rejects malformed output but leaves gameplay validation to Simulation", async () => {
  for (const planText of ["not json", "{}", '{"path":[],"extra":true}', '{"path":[{"x":"1","y":0}]}']) {
    const transport = new FakeDeepSeekTransport()
      .enqueueResponse(200, providerResponse("strategy"))
      .enqueueResponse(200, providerResponse(planText));
    const completion = await new DeepSeekDecision({ transport }).decide(request(), new AbortController().signal);
    assert.deepEqual(completion.error, { category: "attempt_failure", code: "DECISION_OUTPUT_INVALID" });
  }

  const transport = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse("strategy"))
    .enqueueResponse(200, providerResponse('{"path":[{"x":99,"y":99}],"skill":{"skillId":"missing","targetActorId":"ghost","minCoefficient":-4}}'));
  const completion = await new DeepSeekDecision({ transport }).decide(request(), new AbortController().signal);
  assert.equal(completion.type, "completed");
  assert.deepEqual(completion.plan.path, [{ x: 99, y: 99 }]);
});

test("provider status, envelope, visible output, and network failures use the frozen taxonomy without retry", async () => {
  const cases = [
    [{ type: "response", status: 429, bodyText: "rate" }, "attempt_failure", "DECISION_PROVIDER_RATE_LIMITED"],
    [{ type: "response", status: 503, bodyText: "<html>down</html>" }, "attempt_failure", "DECISION_PROVIDER_UNAVAILABLE"],
    [{ type: "response", status: 401, bodyText: "secret" }, "session_fatal", "DECISION_PROVIDER_AUTH"],
    [{ type: "response", status: 403, bodyText: "secret" }, "session_fatal", "DECISION_PROVIDER_AUTH"],
    [{ type: "response", status: 402, bodyText: "quota" }, "session_fatal", "DECISION_PROVIDER_QUOTA"],
    [{ type: "response", status: 200, bodyText: "not-json" }, "attempt_failure", "DECISION_PROVIDER_UNAVAILABLE"],
    [{ type: "response", status: 200, bodyText: JSON.stringify({ object: "response", status: "failed", error: { code: "private" } }) }, "attempt_failure", "DECISION_PROVIDER_UNAVAILABLE"],
    [{ type: "response", status: 200, bodyText: JSON.stringify({ object: "response", status: "incomplete", incomplete_details: { reason: "content_filter" } }) }, "attempt_failure", "DECISION_PROVIDER_REFUSED"],
    [{ type: "response", status: 200, bodyText: JSON.stringify({ object: "response", status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }) }, "attempt_failure", "DECISION_PROVIDER_INCOMPLETE"],
    [{ type: "response", status: 200, bodyText: providerResponse("   ") }, "attempt_failure", "DECISION_OUTPUT_INVALID"],
    [{ type: "response", status: 200, bodyText: providerResponse("ignored", { output: [{ type: "function_call" }] }) }, "attempt_failure", "DECISION_PROVIDER_UNAVAILABLE"],
    [{ type: "response", status: 200, bodyText: providerResponse("ignored", { output: [{ type: "web_search_call" }] }) }, "attempt_failure", "DECISION_PROVIDER_UNAVAILABLE"],
    [{ type: "response", status: 200, bodyText: providerResponse("ignored", { output: [{ type: "future_unknown_item" }] }) }, "attempt_failure", "DECISION_PROVIDER_UNAVAILABLE"],
    [{ type: "reject", error: new Error("socket") }, "attempt_failure", "DECISION_PROVIDER_NETWORK"],
  ];
  for (const [step, category, code] of cases) {
    const { completion, transport } = await decideWith(step);
    assert.deepEqual(completion.error, { category, code });
    assert.equal(transport.requests.length, 1);
    assert.equal("metadata" in completion.error, false);
  }

  for (const status of [400, 422]) {
    const invariantTransport = new FakeDeepSeekTransport().enqueueResponse(status, "bad request");
    await assert.rejects(
      new DeepSeekDecision({ transport: invariantTransport }).decide(request(), new AbortController().signal),
      new RegExp(`contract rejected with HTTP ${status}`),
    );
  }

  const callBIncomplete = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse("strategy"))
    .enqueueResponse(200, JSON.stringify({ object: "response", status: "incomplete", incomplete_details: { reason: "content_filter" } }));
  const callBCompletion = await new DeepSeekDecision({ transport: callBIncomplete }).decide(request(), new AbortController().signal);
  assert.deepEqual(callBCompletion.error, { category: "attempt_failure", code: "DECISION_PROVIDER_REFUSED" });
  assert.equal(callBIncomplete.requests.length, 2);
});

test("visible output extraction ignores reasoning and concatenates assistant output_text in provider order", async () => {
  const callA = JSON.stringify({
    object: "response", status: "completed", model: "provider-version-not-alias",
    output: [
      { type: "reasoning", content: [{ type: "reasoning_text", text: "private" }] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "STRAT" }] },
      { type: "reasoning", content: [{ type: "reasoning_text", text: "still private" }] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "EGY" }] },
    ],
  });
  const transport = new FakeDeepSeekTransport()
    .enqueueResponse(200, callA)
    .enqueueResponse(200, providerResponse('{"path":[]}'));
  await new DeepSeekDecision({ transport }).decide(request(), new AbortController().signal);
  assert.equal(JSON.parse(JSON.parse(transport.requests[1].bodyText).input).strategyMemo, "STRATEGY");
});

test("AbortSignal settles locally before transport and ignores late provider completion", async () => {
  const before = new AbortController();
  before.abort();
  const untouched = new FakeDeepSeekTransport();
  const preAborted = await new DeepSeekDecision({ transport: untouched }).decide(request(), before.signal);
  assert.deepEqual(preAborted.error, { category: "attempt_failure", code: "DECISION_ABORTED" });
  assert.equal(untouched.requests.length, 0);

  const duringA = new FakeDeepSeekTransport();
  const lateA = duringA.enqueueDeferred();
  const abortA = new AbortController();
  const pendingA = new DeepSeekDecision({ transport: duringA }).decide(request(), abortA.signal);
  abortA.abort();
  assert.deepEqual((await pendingA).error, { category: "attempt_failure", code: "DECISION_ABORTED" });
  assert.equal(duringA.requests[0].signal.aborted, true);
  lateA.resolve(200, providerResponse("late"));
  await flush();
  assert.equal(duringA.requests.length, 1);

  const duringB = new FakeDeepSeekTransport().enqueueResponse(200, providerResponse("strategy"));
  const lateB = duringB.enqueueDeferred();
  const abortB = new AbortController();
  const pendingB = new DeepSeekDecision({ transport: duringB }).decide(request(), abortB.signal);
  await flush();
  assert.equal(duringB.requests.length, 2);
  abortB.abort();
  assert.deepEqual((await pendingB).error, { category: "attempt_failure", code: "DECISION_ABORTED" });
  lateB.reject(new Error("late reject"));
  await flush();

  const between = new FakeDeepSeekTransport();
  const analysis = between.enqueueDeferred();
  between.enqueueResponse(200, providerResponse('{"path":[]}'));
  const abortBetween = new AbortController();
  const pendingBetween = new DeepSeekDecision({ transport: between }).decide(request(), abortBetween.signal);
  analysis.resolve(200, providerResponse("strategy"));
  queueMicrotask(() => abortBetween.abort());
  assert.deepEqual((await pendingBetween).error, { category: "attempt_failure", code: "DECISION_ABORTED" });
  assert.equal(between.requests.length, 1, "abort between stages must prevent Call B");
});

test("each physical call uses the 60s timeout and external abort wins the race", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let timerCallback;
  let timeoutDelay;
  globalThis.setTimeout = (callback, delay) => {
    timerCallback = callback;
    timeoutDelay = delay;
    return { fake: true };
  };
  globalThis.clearTimeout = () => {};
  try {
    const timedTransport = new FakeDeepSeekTransport();
    timedTransport.enqueueDeferred();
    const pendingTimeout = new DeepSeekDecision({ transport: timedTransport }).decide(request(), new AbortController().signal);
    assert.equal(timeoutDelay, 60_000);
    timerCallback();
    assert.deepEqual((await pendingTimeout).error, { category: "attempt_failure", code: "DECISION_PROVIDER_TIMEOUT" });

    const callBTimeoutTransport = new FakeDeepSeekTransport().enqueueResponse(200, providerResponse("strategy"));
    callBTimeoutTransport.enqueueDeferred();
    const pendingCallBTimeout = new DeepSeekDecision({ transport: callBTimeoutTransport }).decide(request(), new AbortController().signal);
    await flush();
    assert.equal(callBTimeoutTransport.requests.length, 2);
    assert.equal(timeoutDelay, 60_000);
    timerCallback();
    assert.deepEqual((await pendingCallBTimeout).error, { category: "attempt_failure", code: "DECISION_PROVIDER_TIMEOUT" });

    const abortTransport = new FakeDeepSeekTransport();
    abortTransport.enqueueDeferred();
    const controller = new AbortController();
    const pendingAbort = new DeepSeekDecision({ transport: abortTransport }).decide(request(), controller.signal);
    controller.abort();
    timerCallback();
    assert.deepEqual((await pendingAbort).error, { category: "attempt_failure", code: "DECISION_ABORTED" });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("same instance safely interleaves concurrent decide calls without identity or strategy crossover", async () => {
  const transport = new FakeDeepSeekTransport();
  const aAnalysis = transport.enqueueDeferred();
  const bAnalysis = transport.enqueueDeferred();
  const bMaterialize = transport.enqueueDeferred();
  const aMaterialize = transport.enqueueDeferred();
  const decision = new DeepSeekDecision({ transport });
  const pendingA = decision.decide(request({ requestId: "request:A", generation: 10 }), new AbortController().signal);
  const pendingB = decision.decide(request({ requestId: "request:B", generation: 20 }), new AbortController().signal);

  bAnalysis.resolve(200, providerResponse("strategy B"));
  await flush();
  aAnalysis.resolve(200, providerResponse("strategy A"));
  await flush();
  assert.equal(transport.requests.length, 4);
  assert.equal(JSON.parse(JSON.parse(transport.requests[2].bodyText).input).strategyMemo, "strategy B");
  assert.equal(JSON.parse(JSON.parse(transport.requests[3].bodyText).input).strategyMemo, "strategy A");
  bMaterialize.resolve(200, providerResponse('{"path":[{"x":2,"y":0}]}'));
  aMaterialize.resolve(200, providerResponse('{"path":[]}'));
  assert.deepEqual(await pendingA, { type: "completed", requestId: "request:A", generation: 10, plan: { path: [] } });
  assert.deepEqual(await pendingB, { type: "completed", requestId: "request:B", generation: 20, plan: { path: [{ x: 2, y: 0 }] } });
});

test("final serialized request body accepts exactly 512 KiB and rejects one byte more before transport", async () => {
  const correctionWithSkillId = (skillId) => request({
    correction: {
      rejectedPlan: { path: [], skill: { skillId, targetActorId: "enemy", minCoefficient: 1 } },
      reason: "invalid_target",
    },
  });
  const callABaseline = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse("strategy"))
    .enqueueResponse(200, providerResponse('{"path":[]}'));
  await new DeepSeekDecision({ transport: callABaseline }).decide(correctionWithSkillId(""), new AbortController().signal);
  const callAOverhead = encoder.encode(callABaseline.requests[0].bodyText).byteLength;
  const exactCallASkillId = "x".repeat(MAX_BYTES - callAOverhead);

  const exactCallA = new FakeDeepSeekTransport().enqueueResponse(200, providerResponse("strategy"));
  const exactCallAResult = await new DeepSeekDecision({ transport: exactCallA }).decide(
    correctionWithSkillId(exactCallASkillId), new AbortController().signal,
  );
  assert.equal(encoder.encode(exactCallA.requests[0].bodyText).byteLength, MAX_BYTES);
  assert.deepEqual(exactCallAResult.error, { category: "session_fatal", code: "DECISION_CONTEXT_TOO_LARGE" });

  const overCallA = new FakeDeepSeekTransport();
  const overCallAResult = await new DeepSeekDecision({ transport: overCallA }).decide(
    correctionWithSkillId(`${exactCallASkillId}x`), new AbortController().signal,
  );
  assert.deepEqual(overCallAResult.error, { category: "session_fatal", code: "DECISION_CONTEXT_TOO_LARGE" });
  assert.equal(overCallA.requests.length, 0);

  const baseline = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse("x"))
    .enqueueResponse(200, providerResponse('{"path":[]}'));
  await new DeepSeekDecision({ transport: baseline }).decide(request(), new AbortController().signal);
  const overhead = encoder.encode(baseline.requests[1].bodyText).byteLength - 1;
  const exactMemo = "x".repeat(MAX_BYTES - overhead);

  const exact = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse(exactMemo))
    .enqueueResponse(200, providerResponse('{"path":[]}'));
  const exactResult = await new DeepSeekDecision({ transport: exact }).decide(request(), new AbortController().signal);
  assert.equal(exactResult.type, "completed");
  assert.equal(encoder.encode(exact.requests[1].bodyText).byteLength, MAX_BYTES);

  const over = new FakeDeepSeekTransport().enqueueResponse(200, providerResponse(`${exactMemo}x`));
  const overResult = await new DeepSeekDecision({ transport: over }).decide(request(), new AbortController().signal);
  assert.deepEqual(overResult.error, { category: "session_fatal", code: "DECISION_CONTEXT_TOO_LARGE" });
  assert.equal(over.requests.length, 1);
});

test("constructor accepts only configured transport and package subpaths resolve", async () => {
  assert.throws(() => new DeepSeekDecision({}), /configured transport/);
  assert.throws(() => new DeepSeekDecision({ transport: {}, apiKey: "secret" }), /configured transport/);
  assert.throws(() => new DeepSeekDecision({ transport: new FakeDeepSeekTransport(), model: "other" }), /configured transport/);
  const product = await import("@loomrealm-game/battle/decision");
  const testing = await import("@loomrealm-game/battle/decision/testing");
  assert.equal(product.DeepSeekDecision, DeepSeekDecision);
  assert.equal(testing.FakeDeepSeekTransport, FakeDeepSeekTransport);
  assert.equal("createDeepSeekDecisionForTesting" in testing, false);
  assert.equal("Analyzer" in product, false);
  assert.equal("DecisionWorkflow" in product, false);
  const decision = new DeepSeekDecision({ transport: new FakeDeepSeekTransport() });
  assert.equal("setGuidance" in decision, false);
  assert.equal("currentGuidance" in decision, false);
  assert.equal("extensions" in decision, false);
});

test("real Simulation consumes DeepSeekDecision output and correction performs a fresh two-call workflow", async () => {
  const transport = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse("a initial strategy"))
    .enqueueResponse(200, providerResponse("b initial strategy"))
    .enqueueResponse(200, providerResponse('{"path":[{"x":99,"y":99}]}'))
    .enqueueResponse(200, providerResponse('{"path":[]}'))
    .enqueueResponse(200, providerResponse("a corrected strategy"))
    .enqueueResponse(200, providerResponse('{"path":[]}'));
  const clock = new IntegrationClock();
  const runtime = new BattleSimulationBuilder({
    clock,
    signal: new AbortController().signal,
    decision: new DeepSeekDecision({ transport }),
    presentation: new RecordingPresentation(),
  }).build(integrationDefinition());
  const run = runtime.run();
  await flush();
  assert.equal(transport.requests.length, 4);
  clock.advance(200);
  await flush();
  assert.equal(transport.requests.length, 6);
  const correctionContext = JSON.parse(JSON.parse(transport.requests[4].bodyText).input);
  assert.equal(correctionContext.correction.reason, "path_out_of_bounds");
  assert.deepEqual(correctionContext.correction.rejectedPlan, { path: [{ x: 99, y: 99 }] });
  assert.equal(JSON.parse(JSON.parse(transport.requests[5].bodyText).input).strategyMemo, "a corrected strategy");

  clock.advance(200);
  const decisions = runtime.getReplay().decisions;
  assert.equal(decisions.some((item) => item.actorId === "a" && item.attempt === 0 && item.consumeOutcome.type === "rejected"), true);
  assert.equal(decisions.some((item) => item.actorId === "a" && item.attempt === 1 && item.consumeOutcome.type === "accepted"), true);
  runtime.cancel();
  assert.deepEqual(await run, { type: "cancelled" });
});

test("optional credential-gated real DeepSeek smoke", {
  skip: process.env.BATTLE_DEEPSEEK_SMOKE !== "1" || !process.env.DEEPSEEK_API_KEY,
}, async () => {
  const credential = process.env.DEEPSEEK_API_KEY;
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
  const completion = await new DeepSeekDecision({ transport }).decide(request(), new AbortController().signal);
  assert.equal(completion.type, "completed");
});
