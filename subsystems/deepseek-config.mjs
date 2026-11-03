import { openSchemaForm } from "@loomrealm-game/schema-form";

export const DEEPSEEK_CONFIG_FIELD = "DEEPSEEK_API_KEY";
export const DEEPSEEK_DRAFT_STORAGE_KEY = "pokeman.deepseek.api-key";
export const DEEPSEEK_PROBE_TIMEOUT_MS = 15_000;
export const DEEPSEEK_MODELS_ENDPOINT = "https://api.deepseek.com/models";
export const DEEPSEEK_REQUIRED_MODEL = "deepseek-flash";
export const DEEPSEEK_SESSION_CONFIG_KEY = Object.freeze({
  namespace: "pokeman.SessionConfig",
  key: "deepseek",
});

const FIELD_ERROR = Object.freeze({
  invalidKey: "API Key 无效，请检查后重试",
  insufficientBalance: "DeepSeek 账户余额不足",
  rateLimited: "DeepSeek 请求受限，请稍后重试",
  unavailable: "DeepSeek 服务暂时不可用，请稍后重试",
  network: "无法连接 DeepSeek，请检查网络后重试",
  malformed: "DeepSeek 返回了无法识别的响应，请重试",
  missingModel: "当前 DeepSeek 账号/服务未提供 Battle 所需模型",
  provider: "DeepSeek 配置验证失败，请稍后重试",
  save: "无法保存当前配置，请重试",
  saveUncertain: "无法确认配置保存，请重试",
});

export class PokeManDeepSeekConfigurationError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "PokeManDeepSeekConfigurationError";
    this.code = code;
  }
}

function configurationError(code, message, cause) {
  return new PokeManDeepSeekConfigurationError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isUnicodeScalarString(value) {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function isExactDeepSeekSessionConfig(value) {
  if (!isObject(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === 1
    && keys[0] === "apiKey"
    && typeof value.apiKey === "string"
    && value.apiKey.length > 0
    && isUnicodeScalarString(value.apiKey);
}

function sameSessionConfig(value, candidate) {
  return isExactDeepSeekSessionConfig(value) && value.apiKey === candidate;
}

function abortError(signal) {
  if (signal?.reason instanceof Error && signal.reason.name === "AbortError") return signal.reason;
  return new DOMException("The PokeMan Base Frame was aborted", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function stateOperationError(phase, cause) {
  return configurationError(
    "POKEMAN_DEEPSEEK_STATE_OPERATION_FAILED",
    `DeepSeek Session configuration State ${phase} failed`,
    cause,
  );
}

function invariantError(message, cause) {
  return configurationError("POKEMAN_DEEPSEEK_INVARIANT_FAILED", message, cause);
}

function validateReadSnapshot(snapshot, phase) {
  if (!isObject(snapshot) || !Array.isArray(snapshot.records) || snapshot.records.length !== 1) {
    throw stateOperationError(phase, new TypeError("Shared State read returned an invalid snapshot"));
  }
  const record = snapshot.records[0];
  if (!isObject(record)
    || !isObject(record.key)
    || record.key.namespace !== DEEPSEEK_SESSION_CONFIG_KEY.namespace
    || record.key.key !== DEEPSEEK_SESSION_CONFIG_KEY.key
    || !Number.isSafeInteger(record.version)
    || record.version < 0
    || !Object.hasOwn(record, "value")) {
    throw stateOperationError(phase, new TypeError("Shared State read returned an invalid Record"));
  }
  return Object.freeze({ value: record.value, version: record.version });
}

async function readSessionConfig(state, { signal, phase }) {
  throwIfAborted(signal);
  let snapshot;
  try {
    snapshot = await state.read([DEEPSEEK_SESSION_CONFIG_KEY], signal === undefined ? undefined : { signal });
  } catch (cause) {
    if (signal?.aborted) throw abortError(signal);
    throw stateOperationError(phase, cause);
  }
  throwIfAborted(signal);
  return validateReadSnapshot(snapshot, phase);
}

function isLegalModelList(value) {
  if (!isObject(value) || value.object !== "list" || !Array.isArray(value.data)) return false;
  return value.data.every((model) => isObject(model)
    && typeof model.id === "string"
    && model.id.length > 0
    && model.object === "model"
    && typeof model.owned_by === "string"
    && model.owned_by.length > 0);
}

function providerFailure(status) {
  if (status === 401) return FIELD_ERROR.invalidKey;
  if (status === 402) return FIELD_ERROR.insufficientBalance;
  if (status === 429) return FIELD_ERROR.rateLimited;
  if (status >= 500 && status <= 599) return FIELD_ERROR.unavailable;
  return FIELD_ERROR.provider;
}

export async function probeDeepSeekApiKey(apiKey, {
  signal,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEEPSEEK_PROBE_TIMEOUT_MS,
} = {}) {
  if (typeof apiKey !== "string" || apiKey.length === 0 || !isUnicodeScalarString(apiKey)) {
    throw invariantError("Schema Form submitted an invalid DeepSeek API Key value");
  }
  if (typeof fetchImpl !== "function") {
    return Object.freeze({ ok: false, errorMsg: FIELD_ERROR.network });
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new TypeError("timeoutMs must be a non-negative finite number");
  throwIfAborted(signal);

  const requestController = new AbortController();
  let timedOut = false;
  const onFrameAbort = () => requestController.abort(signal?.reason);
  signal?.addEventListener("abort", onFrameAbort, { once: true });
  if (signal?.aborted) onFrameAbort();
  const timer = setTimeout(() => {
    if (signal?.aborted) {
      requestController.abort(signal.reason);
      return;
    }
    timedOut = true;
    requestController.abort(new DOMException("DeepSeek probe timed out", "TimeoutError"));
  }, timeoutMs);

  let response;
  let bodyText;
  try {
    response = await fetchImpl(DEEPSEEK_MODELS_ENDPOINT, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: requestController.signal,
    });
    if (signal?.aborted) throw abortError(signal);
    if (timedOut) return Object.freeze({ ok: false, errorMsg: FIELD_ERROR.network });
    if (!isObject(response) || !Number.isInteger(response.status)) {
      return Object.freeze({ ok: false, errorMsg: FIELD_ERROR.network });
    }
    if (response.status !== 200) {
      return Object.freeze({ ok: false, errorMsg: providerFailure(response.status) });
    }
    if (typeof response.text !== "function") {
      return Object.freeze({ ok: false, errorMsg: FIELD_ERROR.malformed });
    }
    bodyText = await response.text();
  } catch (cause) {
    if (signal?.aborted) throw abortError(signal);
    if (timedOut || requestController.signal.aborted) {
      return Object.freeze({ ok: false, errorMsg: FIELD_ERROR.network });
    }
    return Object.freeze({ ok: false, errorMsg: FIELD_ERROR.network });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onFrameAbort);
  }

  throwIfAborted(signal);
  if (timedOut) return Object.freeze({ ok: false, errorMsg: FIELD_ERROR.network });
  let value;
  try {
    value = JSON.parse(bodyText);
  } catch {
    return Object.freeze({ ok: false, errorMsg: FIELD_ERROR.malformed });
  }
  if (!isLegalModelList(value)) return Object.freeze({ ok: false, errorMsg: FIELD_ERROR.malformed });
  if (!value.data.some((model) => model.id === DEEPSEEK_REQUIRED_MODEL)) {
    return Object.freeze({ ok: false, errorMsg: FIELD_ERROR.missingModel });
  }
  return Object.freeze({ ok: true });
}

function stateFailureCode(error) {
  return isObject(error) && typeof error.code === "string" ? error.code : undefined;
}

function classifyAuthoritativeValue(value, candidate, phase) {
  if (value === null) return "absent";
  if (!isExactDeepSeekSessionConfig(value)) {
    throw invariantError(`Malformed authoritative DeepSeek SessionConfig during ${phase}`);
  }
  if (value.apiKey === candidate) return "candidate";
  throw invariantError(`Unexpected concurrent DeepSeek SessionConfig writer during ${phase}`);
}

async function reconcileCommit(state, candidate, code) {
  const current = await readSessionConfig(state, { phase: `${code} reconciliation` });
  const classification = classifyAuthoritativeValue(current.value, candidate, `${code} reconciliation`);
  if (classification === "candidate") return Object.freeze({ ok: true });
  return Object.freeze({
    ok: false,
    errorMsg: code === "OUTCOME_UNKNOWN" ? FIELD_ERROR.saveUncertain : FIELD_ERROR.save,
  });
}

async function commitSessionConfig(state, frame, candidate) {
  const current = await readSessionConfig(state, {
    signal: frame.signal,
    phase: "fresh pre-commit read",
  });
  const classification = classifyAuthoritativeValue(current.value, candidate, "fresh pre-commit read");
  if (classification === "candidate") return Object.freeze({ ok: true });
  throwIfAborted(frame.signal);

  try {
    await state.commit({
      conditions: [{ key: DEEPSEEK_SESSION_CONFIG_KEY, version: current.version }],
      writes: [{
        type: "put",
        key: DEEPSEEK_SESSION_CONFIG_KEY,
        value: { apiKey: candidate },
      }],
    });
    return Object.freeze({ ok: true });
  } catch (cause) {
    const code = stateFailureCode(cause);
    if (code === "CONFLICT" || code === "OUTCOME_UNKNOWN") {
      return reconcileCommit(state, candidate, code);
    }
    if (code === "BINDING_UNAVAILABLE") {
      return Object.freeze({ ok: false, errorMsg: FIELD_ERROR.save });
    }
    if (code === "INVALID_REQUEST" || code === "LIMIT_EXCEEDED") {
      throw invariantError(`Shared State rejected the DeepSeek SessionConfig transaction with ${code}`, cause);
    }
    if (code === "TERMINAL") throw cause;
    throw stateOperationError("commit", cause);
  }
}

export async function submitDeepSeekConfigurationAttempt({
  state,
  frame,
  candidate,
  control,
  fetchImpl = globalThis.fetch,
  probeTimeoutMs = DEEPSEEK_PROBE_TIMEOUT_MS,
}) {
  control.setLoading();
  const probe = await probeDeepSeekApiKey(candidate, {
    signal: frame.signal,
    fetchImpl,
    timeoutMs: probeTimeoutMs,
  });
  throwIfAborted(frame.signal);
  if (!probe.ok) {
    control.sendValidateError([{ field: DEEPSEEK_CONFIG_FIELD, errorMsg: probe.errorMsg }]);
    control.cancelLoading();
    return Object.freeze({ type: "recoverable" });
  }

  const committed = await commitSessionConfig(state, frame, candidate);
  throwIfAborted(frame.signal);
  if (!committed.ok) {
    control.sendValidateError([{ field: DEEPSEEK_CONFIG_FIELD, errorMsg: committed.errorMsg }]);
    control.cancelLoading();
    return Object.freeze({ type: "recoverable" });
  }
  control.close();
  return Object.freeze({ type: "submitted" });
}

export function createDeepSeekConfigurationRequest(scope, frame, {
  fetchImpl = globalThis.fetch,
  probeTimeoutMs = DEEPSEEK_PROBE_TIMEOUT_MS,
} = {}) {
  return Object.freeze({
    schema: Object.freeze({
      version: 1,
      title: "DeepSeek API",
      description: "PokeMan 需要 DeepSeek API Key 才能继续。",
      fields: Object.freeze([Object.freeze({
        key: DEEPSEEK_CONFIG_FIELD,
        kind: "string",
        label: DEEPSEEK_CONFIG_FIELD,
        required: true,
        localstorageKey: DEEPSEEK_DRAFT_STORAGE_KEY,
      })]),
    }),
    cancelable: false,
    async onSubmit(value, control) {
      const candidate = value?.[DEEPSEEK_CONFIG_FIELD];
      if (typeof candidate !== "string" || candidate.length === 0 || !isUnicodeScalarString(candidate)) {
        throw invariantError("Schema Form submitted an invalid DeepSeek API Key value");
      }
      await submitDeepSeekConfigurationAttempt({
        state: scope.state,
        frame,
        candidate,
        control,
        fetchImpl,
        probeTimeoutMs,
      });
    },
  });
}

export async function ensureDeepSeekConfiguration(scope, frame, {
  fetchImpl = globalThis.fetch,
  openForm = openSchemaForm,
  probeTimeoutMs = DEEPSEEK_PROBE_TIMEOUT_MS,
} = {}) {
  const initial = await readSessionConfig(scope.state, {
    signal: frame.signal,
    phase: "initial read",
  });
  if (initial.value !== null) {
    if (!isExactDeepSeekSessionConfig(initial.value)) {
      throw invariantError("Malformed authoritative DeepSeek SessionConfig during initial read");
    }
    return;
  }

  const result = await openForm(
    scope,
    frame,
    createDeepSeekConfigurationRequest(scope, frame, { fetchImpl, probeTimeoutMs }),
  );
  throwIfAborted(frame.signal);
  if (!isObject(result) || result.type !== "submitted") {
    throw invariantError("Non-cancelable DeepSeek configuration form ended without submission");
  }
}
