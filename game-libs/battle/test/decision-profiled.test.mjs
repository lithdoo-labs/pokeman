import assert from "node:assert/strict";
import { test } from "node:test";

import { DeepSeekDecision } from "../dist/decision.js";
import { DeepSeekProfiledDecision, DEEPSEEK_CALL_A_PROFILES, extractProviderUsage } from "../dist/decision-profiled.js";
import { FakeDeepSeekTransport } from "../dist/decision/testing.js";

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
  const range = { width: 1, height: 2, originX: 0, originY: 1, coefficientUnits: [[1000], [0]] };
  const base = {
    requestId: "request:1",
    actorId: "self",
    generation: 1,
    planningOrigin: { x: 1, y: 0 },
    observation: {
      tick: 3,
      selfActorId: "self",
      actors: [
        { actorId: "self", team: "ally", hp: 8, maxHp: 10, tile: { x: 1, y: 0 }, direction: 6, action: { type: "idle" }, protectedUntilTickExclusive: 0, skills: [{ skillId: "strike", baseDamage: 3, windupTicks: 1, recoveryTicks: 2, range }] },
        { actorId: "enemy", team: "enemy", hp: 6, maxHp: 6, tile: { x: 3, y: 1 }, direction: 4, action: { type: "idle" }, protectedUntilTickExclusive: 0, skills: [{ skillId: "jab", baseDamage: 2, windupTicks: 0, recoveryTicks: 1, range }] },
      ],
      map: { width: 5, height: 4, passable: [[true, true, true, true, true], [true, true, true, true, true], [true, true, true, true, true], [true, true, true, true, true]] },
      recentEvents: [],
    },
    constraints: {
      maxPathSteps: 2,
      movement: { cardinalOnly: true },
      turn: { allowed: true },
      skills: [{ skillId: "strike", minCoefficients: [1] }],
    },
  };
  return { ...base, ...overrides };
}

const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };

test("v0-quality profile reproduces the frozen v0 two-call requests byte-for-byte", async () => {
  const v0Transport = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse("memo"))
    .enqueueResponse(200, providerResponse('{"path":[]}'));
  await new DeepSeekDecision({ transport: v0Transport }).decide(request(), new AbortController().signal);

  const profiledTransport = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse("memo"))
    .enqueueResponse(200, providerResponse('{"path":[]}'));
  await new DeepSeekProfiledDecision({ transport: profiledTransport, profile: "v0-quality" })
    .decide(request(), new AbortController().signal);

  assert.equal(profiledTransport.requests[0].bodyText, v0Transport.requests[0].bodyText, "Call A byte-identical");
  assert.equal(profiledTransport.requests[1].bodyText, v0Transport.requests[1].bodyText, "Call B byte-identical");
});

test("profiles vary exactly one Call A dimension and keep Call B frozen", async () => {
  const expectations = {
    "v0-quality": { effort: "high", tokens: 65_536, lean: false },
    "call-a-low": { effort: "low", tokens: 65_536, lean: false },
    "call-a-none": { effort: "none", tokens: 65_536, lean: false },
    "call-a-low-tight": { effort: "low", tokens: 4_096, lean: false },
    "call-a-lean": { effort: "low", tokens: 65_536, lean: true },
  };
  let callBBytes = null;
  for (const [profileId, expected] of Object.entries(expectations)) {
    const transport = new FakeDeepSeekTransport()
      .enqueueResponse(200, providerResponse("memo"))
      .enqueueResponse(200, providerResponse('{"path":[]}'));
    await new DeepSeekProfiledDecision({ transport, profile: profileId }).decide(request(), new AbortController().signal);
    const callA = JSON.parse(transport.requests[0].bodyText);
    assert.equal(callA.reasoning.effort, expected.effort, profileId);
    assert.equal(callA.max_output_tokens, expected.tokens, profileId);
    assert.equal(callA.instructions.includes("Analyze only the authoritative battle context provided as input"), !expected.lean, profileId);
    assert.equal(callA.model, "deepseek-flash");
    assert.equal(callA.stream, false);
    const callB = transport.requests[1].bodyText;
    if (callBBytes === null) callBBytes = callB;
    assert.equal(callB, callBBytes, `Call B identical under ${profileId}`);
  }
  assert.deepEqual(Object.keys(DEEPSEEK_CALL_A_PROFILES).sort(), ["call-a-lean", "call-a-low", "call-a-low-tight", "call-a-none", "v0-quality"]);
});

test("provider usage extraction maps missing fields to unknown and absent usage to null", () => {
  assert.deepEqual(extractProviderUsage({ usage: { input_tokens: 120, output_tokens: 45, output_tokens_details: { reasoning_tokens: 30 } } }), {
    inputTokens: 120, outputTokens: 45, reasoningTokens: 30,
  });
  assert.deepEqual(extractProviderUsage({ usage: { input_tokens: 10 } }), {
    inputTokens: 10, outputTokens: "unknown", reasoningTokens: "unknown",
  });
  assert.deepEqual(extractProviderUsage({ usage: {} }), {
    inputTokens: "unknown", outputTokens: "unknown", reasoningTokens: "unknown",
  });
  assert.equal(extractProviderUsage({}), null);
  assert.equal(extractProviderUsage(null), null);
  assert.equal(extractProviderUsage({ usage: { input_tokens: -4, output_tokens: 1.5 } }).inputTokens, "unknown");
});

test("profiled metrics record per-stage timing, usage, and success outcomes", async () => {
  const metrics = [];
  const transport = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse("memo", { usage: { input_tokens: 200, output_tokens: 80, output_tokens_details: { reasoning_tokens: 64 } } }))
    .enqueueResponse(200, providerResponse('{"path":[]}', { usage: { input_tokens: 300, output_tokens: 20 } }));
  const completion = await new DeepSeekProfiledDecision({
    transport, profile: "call-a-low", metricsSink: { record: (metric) => metrics.push(metric) },
  }).decide(request(), new AbortController().signal);
  assert.equal(completion.type, "completed");
  assert.deepEqual(metrics.map((metric) => [metric.scope, metric.profileId, metric.stage, metric.outcome]), [
    ["provider", "call-a-low", "call_a", "success"],
    ["provider", "call-a-low", "call_b", "success"],
  ]);
  assert.deepEqual(metrics[0].usage, { inputTokens: 200, outputTokens: 80, reasoningTokens: 64 });
  assert.deepEqual(metrics[1].usage, { inputTokens: 300, outputTokens: 20, reasoningTokens: "unknown" });
  assert.ok(metrics.every((metric) => Number.isFinite(metric.durationMs) && metric.durationMs >= 0));
});

test("profiled failure taxonomy maps provider metrics to frozen outcome classes", async () => {
  const cases = [
    { steps: [{ status: 429, body: "rate" }], expected: [["call_a", "provider_error"]] },
    { steps: [{ status: 503, body: "down" }], expected: [["call_a", "provider_error"]] },
    {
      steps: [{ status: 200, body: JSON.stringify({ object: "response", status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }) }],
      expected: [["call_a", "incomplete_response"]],
    },
    {
      steps: [{ status: 200, body: providerResponse("memo") }, { status: 200, body: providerResponse("not json") }],
      expected: [["call_a", "success"], ["call_b", "parse_error"]],
    },
  ];
  for (const { steps, expected } of cases) {
    const metrics = [];
    const transport = new FakeDeepSeekTransport();
    for (const step of steps) transport.enqueueResponse(step.status, step.body);
    const completion = await new DeepSeekProfiledDecision({
      transport, profile: "v0-quality", metricsSink: { record: (metric) => metrics.push(metric) },
    }).decide(request(), new AbortController().signal);
    assert.equal(completion.type, "failed", JSON.stringify(expected));
    assert.deepEqual(metrics.map((metric) => [metric.stage, metric.outcome]), expected);
    assert.ok(metrics.every((metric) => metric.usage === null || metric.outcome === "success" || metric.usage === null));
  }

  const networkMetrics = [];
  const networkTransport = new FakeDeepSeekTransport().enqueueReject(new Error("socket"));
  await new DeepSeekProfiledDecision({
    transport: networkTransport, profile: "call-a-low", metricsSink: { record: (m) => networkMetrics.push(m) },
  }).decide(request(), new AbortController().signal);
  assert.deepEqual(networkMetrics.map((metric) => [metric.stage, metric.outcome, metric.code]), [["call_a", "provider_error", "DECISION_PROVIDER_NETWORK"]]);

  // Session-fatal provider statuses keep the frozen classification.
  for (const [status, code] of [[401, "DECISION_PROVIDER_AUTH"], [402, "DECISION_PROVIDER_QUOTA"], [403, "DECISION_PROVIDER_AUTH"]]) {
    const fatalTransport = new FakeDeepSeekTransport().enqueueResponse(status, "denied");
    const fatal = await new DeepSeekProfiledDecision({ transport: fatalTransport, profile: "v0-quality" })
      .decide(request(), new AbortController().signal);
    assert.deepEqual(fatal.error, { category: "session_fatal", code });
  }
  const envelopeTransport = new FakeDeepSeekTransport()
    .enqueueResponse(200, JSON.stringify({ object: "response", status: "completed", output: [{ type: "reasoning" }, { type: "web_search_call" }] }));
  const envelope = await new DeepSeekProfiledDecision({ transport: envelopeTransport, profile: "call-a-low" })
    .decide(request(), new AbortController().signal);
  assert.deepEqual(envelope.error, { category: "attempt_failure", code: "DECISION_PROVIDER_UNAVAILABLE" });
});

test("throwing and rejecting metrics sinks never affect the profiled Decision", async () => {
  for (const sink of [{ record() { throw new Error("sync boom"); } }, { record() { return Promise.reject(new Error("async boom")); } }]) {
    const transport = new FakeDeepSeekTransport()
      .enqueueResponse(200, providerResponse("memo"))
      .enqueueResponse(200, providerResponse('{"path":[]}'));
    const completion = await new DeepSeekProfiledDecision({ transport, profile: "call-a-low", metricsSink: sink })
      .decide(request(), new AbortController().signal);
    assert.equal(completion.type, "completed");
    await flush();
  }
});

test("profiled decision supports the optional Call A observer with byte-identical memo", async () => {
  const observed = [];
  const transport = new FakeDeepSeekTransport()
    .enqueueResponse(200, providerResponse("SITUATION x\n\nSTRATEGY y"))
    .enqueueResponse(200, providerResponse('{"path":[]}'));
  await new DeepSeekProfiledDecision({ transport, profile: "call-a-lean" }, (req, memo) => observed.push([req.requestId, memo]))
    .decide(request(), new AbortController().signal);
  assert.deepEqual(observed, [["request:1", "SITUATION x\n\nSTRATEGY y"]]);
  assert.equal(JSON.parse(JSON.parse(transport.requests[1].bodyText).input).strategyMemo, "SITUATION x\n\nSTRATEGY y");
});

test("constructor validates transport, profile, sink, and observer shapes", async () => {
  assert.throws(() => new DeepSeekProfiledDecision({ transport: new FakeDeepSeekTransport() }), /transport and profile/);
  assert.throws(() => new DeepSeekProfiledDecision({ transport: new FakeDeepSeekTransport(), profile: "call-a-ultra" }), /unknown profile/);
  assert.throws(() => new DeepSeekProfiledDecision({ transport: new FakeDeepSeekTransport(), profile: "call-a-low", metricsSink: {} }), /metricsSink/);
  assert.throws(() => new DeepSeekProfiledDecision({ transport: new FakeDeepSeekTransport(), profile: "call-a-low" }, 5), /processMessageObserver/);
  const product = await import("@pokeman/game-battle/decision-profiled");
  assert.equal(product.DeepSeekProfiledDecision, DeepSeekProfiledDecision);
});
