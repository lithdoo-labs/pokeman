import assert from "node:assert/strict";
import test from "node:test";
import { runBaseFrame } from "../subsystems/base.mjs";
import {
  createDeepSeekConfigurationRequest,
  DEEPSEEK_CONFIG_FIELD,
  DEEPSEEK_DRAFT_STORAGE_KEY,
  DEEPSEEK_MODELS_ENDPOINT,
  DEEPSEEK_PROBE_TIMEOUT_MS,
  DEEPSEEK_SESSION_CONFIG_KEY,
  ensureDeepSeekConfiguration,
  isExactDeepSeekSessionConfig,
  probeDeepSeekApiKey,
  submitDeepSeekConfigurationAttempt,
} from "../subsystems/deepseek-config.mjs";

const candidate = "synthetic-test-key";
const successModels = Object.freeze({
  object: "list",
  data: Object.freeze([
    Object.freeze({ id: "deepseek-flash", object: "model", owned_by: "deepseek" }),
  ]),
});

function response(status, value = {}) {
  return {
    status,
    async text() {
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  };
}

function readResult(value, version = 0) {
  return {
    revision: version,
    records: [{ key: { ...DEEPSEEK_SESSION_CONFIG_KEY }, value, version }],
  };
}

function failure(code) {
  return Object.assign(new Error(`state-${code}`), { code });
}

function sequenceState(reads, commitImpl = async () => ({ revision: 1, records: [] })) {
  const calls = { reads: [], commits: [] };
  return {
    calls,
    async read(keys, options) {
      calls.reads.push({ keys, options });
      if (reads.length === 0) throw new Error("unexpected State read");
      const next = reads.shift();
      if (next instanceof Error) throw next;
      return readResult(next.value, next.version);
    },
    async commit(transaction) {
      calls.commits.push(transaction);
      return commitImpl(transaction, calls.commits.length);
    },
  };
}

function controlRecorder() {
  const events = [];
  return {
    events,
    control: {
      setLoading() { events.push({ type: "loading" }); },
      cancelLoading() { events.push({ type: "cancel-loading" }); },
      sendValidateError(errors) { events.push({ type: "validate-error", errors }); },
      close() { events.push({ type: "close" }); },
    },
  };
}

function frame(controller = new AbortController(), params = Object.freeze({ mapId: 3 })) {
  return { signal: controller.signal, params };
}

const successFetch = async (url, init) => {
  assert.equal(url, DEEPSEEK_MODELS_ENDPOINT);
  assert.equal(init.method, "GET");
  assert.equal(init.headers.Authorization, `Bearer ${candidate}`);
  return response(200, successModels);
};

test("SessionConfig exact validator rejects malformed Records without normalizing the key", () => {
  assert.equal(isExactDeepSeekSessionConfig({ apiKey: candidate }), true);
  assert.equal(isExactDeepSeekSessionConfig({ apiKey: "  exact whitespace  " }), true);
  assert.equal(isExactDeepSeekSessionConfig(Object.assign(Object.create(null), { apiKey: candidate })), true);
  for (const value of [
    null,
    [],
    {},
    { apiKey: "" },
    { apiKey: 1 },
    { apiKey: candidate, unknown: true },
    { apiKey: "\ud800" },
    { apiKey: "\udc00" },
  ]) assert.equal(isExactDeepSeekSessionConfig(value), false, JSON.stringify(value));
  const hidden = { apiKey: candidate };
  Object.defineProperty(hidden, "unknown", { value: true });
  assert.equal(isExactDeepSeekSessionConfig(hidden), false);
});

test("the Schema Form request has the exact single non-cancelable credential field", () => {
  const scope = { state: {} };
  const request = createDeepSeekConfigurationRequest(scope, frame());
  assert.deepEqual(request.schema.fields, [{
    key: DEEPSEEK_CONFIG_FIELD,
    kind: "string",
    label: DEEPSEEK_CONFIG_FIELD,
    required: true,
    localstorageKey: DEEPSEEK_DRAFT_STORAGE_KEY,
  }]);
  assert.equal(request.cancelable, false);
  assert.equal(request.schema.fields.length, 1);
  assert.equal(DEEPSEEK_PROBE_TIMEOUT_MS, 15_000);
});

test("initial valid State skips the form while absent State opens it before continuing", async () => {
  const configured = sequenceState([{ value: { apiKey: candidate }, version: 4 }]);
  let formCalls = 0;
  await ensureDeepSeekConfiguration({ state: configured }, frame(), {
    openForm: async () => { formCalls += 1; },
  });
  assert.equal(formCalls, 0);

  const absent = sequenceState([
    { value: null, version: 0 },
    { value: null, version: 7 },
  ]);
  const lifecycle = [];
  await ensureDeepSeekConfiguration({ state: absent }, frame(), {
    fetchImpl: successFetch,
    openForm: async (_scope, _frame, request) => {
      formCalls += 1;
      lifecycle.push("form-open");
      const recorder = controlRecorder();
      recorder.control.setLoading = () => { lifecycle.push("loading"); recorder.events.push({ type: "loading" }); };
      recorder.control.close = () => { lifecycle.push("close"); recorder.events.push({ type: "close" }); };
      await request.onSubmit({ [DEEPSEEK_CONFIG_FIELD]: candidate }, recorder.control);
      assert.deepEqual(recorder.events.map((entry) => entry.type), ["loading", "close"]);
      return { type: "submitted", value: { [DEEPSEEK_CONFIG_FIELD]: candidate } };
    },
  });
  assert.equal(formCalls, 1);
  assert.deepEqual(lifecycle, ["form-open", "loading", "close"]);
  assert.equal(absent.calls.commits.length, 1);
});

test("malformed initial State and initial read failure stop the Gate instead of opening the form", async () => {
  for (const [state, expectedCode] of [
    [sequenceState([{ value: { apiKey: candidate, extra: true }, version: 1 }]), "POKEMAN_DEEPSEEK_INVARIANT_FAILED"],
    [sequenceState([failure("BINDING_UNAVAILABLE")]), "POKEMAN_DEEPSEEK_STATE_OPERATION_FAILED"],
  ]) {
    let opened = false;
    await assert.rejects(
      ensureDeepSeekConfiguration({ state }, frame(), {
        openForm: async () => { opened = true; },
      }),
      { code: expectedCode },
    );
    assert.equal(opened, false);
  }
});

test("provider HTTP and network failures remain recoverable form validation errors", async () => {
  const cases = [
    [401, "API Key 无效"],
    [402, "余额不足"],
    [429, "请求受限"],
    [500, "暂时不可用"],
    [503, "暂时不可用"],
    [204, "配置验证失败"],
    [400, "配置验证失败"],
  ];
  for (const [status, expected] of cases) {
    const state = sequenceState([]);
    const recorder = controlRecorder();
    const result = await submitDeepSeekConfigurationAttempt({
      state,
      frame: frame(),
      candidate,
      control: recorder.control,
      fetchImpl: async () => response(status),
    });
    assert.equal(result.type, "recoverable");
    assert.deepEqual(recorder.events.map((entry) => entry.type), ["loading", "validate-error", "cancel-loading"]);
    assert.match(recorder.events[1].errors[0].errorMsg, new RegExp(expected));
    assert.doesNotMatch(recorder.events[1].errors[0].errorMsg, new RegExp(candidate));
    assert.equal(state.calls.reads.length, 0);
    assert.equal(state.calls.commits.length, 0);
  }

  const recorder = controlRecorder();
  const result = await submitDeepSeekConfigurationAttempt({
    state: sequenceState([]),
    frame: frame(),
    candidate,
    control: recorder.control,
    fetchImpl: async () => { throw new Error("offline"); },
  });
  assert.equal(result.type, "recoverable");
  assert.match(recorder.events[1].errors[0].errorMsg, /无法连接/);
});

test("only an exact legal 200 model list containing deepseek-flash passes the probe", async () => {
  const malformed = [
    "not-json",
    {},
    { object: "list", data: {} },
    { object: "list", data: [{ id: "deepseek-flash" }] },
    { object: "list", data: [{ id: "deepseek-flash", object: "model", owned_by: "" }] },
  ];
  for (const body of malformed) {
    const result = await probeDeepSeekApiKey(candidate, {
      signal: new AbortController().signal,
      fetchImpl: async () => response(200, body),
    });
    assert.deepEqual(result, { ok: false, errorMsg: "DeepSeek 返回了无法识别的响应，请重试" });
  }
  const missing = await probeDeepSeekApiKey(candidate, {
    signal: new AbortController().signal,
    fetchImpl: async () => response(200, {
      object: "list",
      data: [{ id: "another-model", object: "model", owned_by: "deepseek" }],
    }),
  });
  assert.match(missing.errorMsg, /未提供 Battle 所需模型/);
  assert.deepEqual(await probeDeepSeekApiKey(candidate, {
    signal: new AbortController().signal,
    fetchImpl: successFetch,
  }), { ok: true });
});

test("probe timeout is recoverable while Frame abort rejects as AbortError", async () => {
  const pendingFetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const timedOut = await probeDeepSeekApiKey(candidate, {
    signal: new AbortController().signal,
    fetchImpl: pendingFetch,
    timeoutMs: 5,
  });
  assert.match(timedOut.errorMsg, /无法连接/);

  const controller = new AbortController();
  const aborted = probeDeepSeekApiKey(candidate, {
    signal: controller.signal,
    fetchImpl: pendingFetch,
    timeoutMs: 1_000,
  });
  controller.abort(new DOMException("frame stopped", "AbortError"));
  await assert.rejects(aborted, { name: "AbortError", message: "frame stopped" });
});

test("a successful attempt fresh-reads, commits with that version, then closes", async () => {
  const order = [];
  const state = sequenceState([{ value: null, version: 9 }], async () => {
    order.push("commit-resolved");
    return { revision: 10, records: [] };
  });
  const recorder = controlRecorder();
  recorder.control.setLoading = () => order.push("loading");
  recorder.control.close = () => order.push("close");
  const result = await submitDeepSeekConfigurationAttempt({
    state,
    frame: frame(),
    candidate,
    control: recorder.control,
    fetchImpl: successFetch,
  });
  assert.equal(result.type, "submitted");
  assert.deepEqual(order, ["loading", "commit-resolved", "close"]);
  assert.deepEqual(state.calls.commits, [{
    conditions: [{ key: DEEPSEEK_SESSION_CONFIG_KEY, version: 9 }],
    writes: [{ type: "put", key: DEEPSEEK_SESSION_CONFIG_KEY, value: { apiKey: candidate } }],
  }]);
});

test("every retry uses a fresh post-probe State version", async () => {
  const state = sequenceState([
    { value: null, version: 3 },
    { value: null, version: 8 },
  ], async (_transaction, attempt) => {
    if (attempt === 1) throw failure("BINDING_UNAVAILABLE");
    return { revision: 9, records: [] };
  });
  const first = controlRecorder();
  const second = controlRecorder();
  assert.equal((await submitDeepSeekConfigurationAttempt({
    state, frame: frame(), candidate, control: first.control, fetchImpl: successFetch,
  })).type, "recoverable");
  assert.equal((await submitDeepSeekConfigurationAttempt({
    state, frame: frame(), candidate, control: second.control, fetchImpl: successFetch,
  })).type, "submitted");
  assert.deepEqual(state.calls.commits.map((commit) => commit.conditions[0].version), [3, 8]);
});

test("fresh exact candidate is already READY, while different or malformed values are invariant failures", async () => {
  const exact = sequenceState([{ value: { apiKey: candidate }, version: 2 }]);
  const exactControl = controlRecorder();
  assert.equal((await submitDeepSeekConfigurationAttempt({
    state: exact, frame: frame(), candidate, control: exactControl.control, fetchImpl: successFetch,
  })).type, "submitted");
  assert.equal(exact.calls.commits.length, 0);
  assert.equal(exactControl.events.at(-1).type, "close");

  for (const value of [{ apiKey: "different" }, { apiKey: candidate, extra: true }]) {
    const state = sequenceState([{ value, version: 2 }]);
    await assert.rejects(
      submitDeepSeekConfigurationAttempt({
        state, frame: frame(), candidate, control: controlRecorder().control, fetchImpl: successFetch,
      }),
      { code: "POKEMAN_DEEPSEEK_INVARIANT_FAILED" },
    );
    assert.equal(state.calls.commits.length, 0);
  }
});

test("State failure codes keep infrastructure, design, and terminal paths distinct", async () => {
  const recoverable = sequenceState([{ value: null, version: 1 }], async () => { throw failure("BINDING_UNAVAILABLE"); });
  const recorder = controlRecorder();
  assert.equal((await submitDeepSeekConfigurationAttempt({
    state: recoverable, frame: frame(), candidate, control: recorder.control, fetchImpl: successFetch,
  })).type, "recoverable");
  assert.match(recorder.events[1].errors[0].errorMsg, /无法保存/);
  assert.doesNotMatch(recorder.events[1].errors[0].errorMsg, /API Key 无效/);

  for (const code of ["INVALID_REQUEST", "LIMIT_EXCEEDED"]) {
    const state = sequenceState([{ value: null, version: 1 }], async () => { throw failure(code); });
    await assert.rejects(
      submitDeepSeekConfigurationAttempt({
        state, frame: frame(), candidate, control: controlRecorder().control, fetchImpl: successFetch,
      }),
      { code: "POKEMAN_DEEPSEEK_INVARIANT_FAILED" },
    );
  }

  const terminal = failure("TERMINAL");
  await assert.rejects(
    submitDeepSeekConfigurationAttempt({
      state: sequenceState([{ value: null, version: 1 }], async () => { throw terminal; }),
      frame: frame(), candidate, control: controlRecorder().control, fetchImpl: successFetch,
    }),
    (error) => error === terminal,
  );
  await assert.rejects(
    submitDeepSeekConfigurationAttempt({
      state: sequenceState([{ value: null, version: 1 }], async () => { throw new Error("unknown"); }),
      frame: frame(), candidate, control: controlRecorder().control, fetchImpl: successFetch,
    }),
    { code: "POKEMAN_DEEPSEEK_STATE_OPERATION_FAILED" },
  );
});

for (const code of ["CONFLICT", "OUTCOME_UNKNOWN"]) {
  test(`${code} reconciles only the exact submitted candidate and never retries the mutation`, async () => {
    const exact = sequenceState([
      { value: null, version: 1 },
      { value: { apiKey: candidate }, version: 2 },
    ], async () => { throw failure(code); });
    const exactControl = controlRecorder();
    assert.equal((await submitDeepSeekConfigurationAttempt({
      state: exact, frame: frame(), candidate, control: exactControl.control, fetchImpl: successFetch,
    })).type, "submitted");
    assert.equal(exact.calls.commits.length, 1);
    assert.equal(exact.calls.reads.length, 2);
    assert.equal(exactControl.events.at(-1).type, "close");

    const absent = sequenceState([
      { value: null, version: 1 },
      { value: null, version: 1 },
    ], async () => { throw failure(code); });
    const absentControl = controlRecorder();
    assert.equal((await submitDeepSeekConfigurationAttempt({
      state: absent, frame: frame(), candidate, control: absentControl.control, fetchImpl: successFetch,
    })).type, "recoverable");
    assert.equal(absent.calls.commits.length, 1);
    assert.match(
      absentControl.events[1].errors[0].errorMsg,
      code === "OUTCOME_UNKNOWN" ? /无法确认/ : /无法保存/,
    );

    for (const value of [{ apiKey: "other" }, { apiKey: candidate, extra: true }]) {
      const state = sequenceState([
        { value: null, version: 1 },
        { value, version: 2 },
      ], async () => { throw failure(code); });
      await assert.rejects(
        submitDeepSeekConfigurationAttempt({
          state, frame: frame(), candidate, control: controlRecorder().control, fetchImpl: successFetch,
        }),
        { code: "POKEMAN_DEEPSEEK_INVARIANT_FAILED" },
      );
      assert.equal(state.calls.commits.length, 1);
    }
  });
}

test("reconciliation read failure is an operation failure with no blind retry", async () => {
  const state = sequenceState([
    { value: null, version: 1 },
    failure("BINDING_UNAVAILABLE"),
  ], async () => { throw failure("OUTCOME_UNKNOWN"); });
  await assert.rejects(
    submitDeepSeekConfigurationAttempt({
      state, frame: frame(), candidate, control: controlRecorder().control, fetchImpl: successFetch,
    }),
    { code: "POKEMAN_DEEPSEEK_STATE_OPERATION_FAILED" },
  );
  assert.equal(state.calls.commits.length, 1);
  assert.equal(state.calls.reads.length, 2);
});

test("Frame abort before commit dispatch prevents mutation", async () => {
  const controller = new AbortController();
  const state = sequenceState([{ value: null, version: 1 }]);
  const originalRead = state.read;
  state.read = async (...args) => {
    const result = await originalRead(...args);
    controller.abort(new DOMException("stop before commit", "AbortError"));
    return result;
  };
  await assert.rejects(
    submitDeepSeekConfigurationAttempt({
      state, frame: frame(controller), candidate, control: controlRecorder().control, fetchImpl: successFetch,
    }),
    { name: "AbortError" },
  );
  assert.equal(state.calls.commits.length, 0);
});

test("Frame abort after commit dispatch respects commit evidence but never closes the form", async () => {
  const controller = new AbortController();
  let resolveCommit;
  const dispatched = new Promise((resolve) => { resolveCommit = resolve; });
  let commitStarted;
  const started = new Promise((resolve) => { commitStarted = resolve; });
  const state = sequenceState([{ value: null, version: 1 }], async () => {
    commitStarted();
    return dispatched;
  });
  const recorder = controlRecorder();
  const attempt = submitDeepSeekConfigurationAttempt({
    state, frame: frame(controller), candidate, control: recorder.control, fetchImpl: successFetch,
  });
  await started;
  controller.abort(new DOMException("late frame abort", "AbortError"));
  resolveCommit({ revision: 2, records: [] });
  await assert.rejects(attempt, { name: "AbortError" });
  assert.equal(state.calls.commits.length, 1);
  assert.equal(recorder.events.some((entry) => entry.type === "close"), false);
});

test("a late successful commit after Base abort cannot create controls or enter Map", async () => {
  const controller = new AbortController();
  let resolveCommit;
  const commitResult = new Promise((resolve) => { resolveCommit = resolve; });
  let announceCommit;
  const commitStarted = new Promise((resolve) => { announceCommit = resolve; });
  const state = sequenceState([
    { value: null, version: 0 },
    { value: null, version: 0 },
  ], async () => {
    announceCommit();
    return commitResult;
  });
  let controls = 0;
  let mapCalls = 0;
  const scope = {
    state,
    createRenderDomain() { controls += 1; return { close() {} }; },
  };
  const baseFrame = {
    ...frame(controller),
    async call() { mapCalls += 1; },
  };
  const openForm = (_scope, activeFrame, request) => new Promise((resolve, reject) => {
    activeFrame.signal.addEventListener("abort", () => reject(activeFrame.signal.reason), { once: true });
    const control = {
      setLoading() {},
      cancelLoading() {},
      sendValidateError() {},
      close() { resolve({ type: "submitted", value: { [DEEPSEEK_CONFIG_FIELD]: candidate } }); },
    };
    request.onSubmit({ [DEEPSEEK_CONFIG_FIELD]: candidate }, control).catch(reject);
  });
  const running = runBaseFrame(scope, baseFrame, {
    ensureConfiguration: (activeScope, activeFrame) => ensureDeepSeekConfiguration(activeScope, activeFrame, {
      fetchImpl: successFetch,
      openForm,
    }),
  });
  await commitStarted;
  controller.abort(new DOMException("Base aborted after dispatch", "AbortError"));
  resolveCommit({ revision: 1, records: [] });
  await assert.rejects(running, { name: "AbortError" });
  await Promise.resolve();
  assert.equal(state.calls.commits.length, 1);
  assert.equal(controls, 0);
  assert.equal(mapCalls, 0);
});

test("Base creates controls and calls Map exactly once only after the Gate", async () => {
  const order = [];
  const params = Object.freeze({ mapId: 3, nested: Object.freeze({ value: 1 }) });
  const domains = [];
  const scope = {
    createRenderDomain(value) {
      order.push("controls");
      domains.push(value);
      return { close() { order.push("controls-close"); } };
    },
  };
  const baseFrame = {
    ...frame(new AbortController(), params),
    async call(name, value) {
      order.push(`call:${name}`);
      assert.equal(value, params);
      return "map-result";
    },
  };
  const result = await runBaseFrame(scope, baseFrame, {
    ensureConfiguration: async () => { order.push("gate"); },
  });
  assert.equal(result, "map-result");
  assert.deepEqual(order, ["gate", "controls", "call:map", "controls-close"]);
  assert.equal(domains[0].roots[0].tag, "game-controls-input");
  assert.deepEqual(params, { mapId: 3, nested: { value: 1 } });

  const rejectedScope = {
    createRenderDomain() { throw new Error("controls must not be created"); },
  };
  let mapCalls = 0;
  await assert.rejects(runBaseFrame(rejectedScope, {
    ...frame(),
    async call() { mapCalls += 1; },
  }, {
    ensureConfiguration: async () => { throw new DOMException("gate aborted", "AbortError"); },
  }), { name: "AbortError" });
  assert.equal(mapCalls, 0);
});

test("credential text is confined to probe authorization and SessionConfig write", async () => {
  const secret = "synthetic-secret-never-project";
  const params = Object.freeze({ mapId: 3, characterName: "Player" });
  const state = sequenceState([{ value: null, version: 0 }]);
  const recorder = controlRecorder();
  const requests = [];
  await submitDeepSeekConfigurationAttempt({
    state,
    frame: frame(new AbortController(), params),
    candidate: secret,
    control: recorder.control,
    fetchImpl: async (_url, init) => {
      requests.push(init);
      return response(200, successModels);
    },
  });
  assert.equal(requests[0].headers.Authorization, `Bearer ${secret}`);
  assert.equal(state.calls.commits[0].writes[0].value.apiKey, secret);
  assert.equal(JSON.stringify(params).includes(secret), false);
  assert.equal(JSON.stringify(recorder.events).includes(secret), false);
  assert.equal(JSON.stringify(state.calls.commits[0].conditions).includes(secret), false);
});
