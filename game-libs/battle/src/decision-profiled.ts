import type {
  DecisionCompletion,
  DecisionFailure,
  DecisionMetricsSink,
  DecisionPort,
  DecisionRequest,
  PlanSubmission,
  ProviderCallMetric,
  ProviderCallOutcome,
  ProviderUsage,
} from "./contracts.js";
import {
  CALL_A_INSTRUCTIONS,
  CALL_B_INSTRUCTIONS,
  DEEPSEEK_MODEL,
  DEEPSEEK_PROVIDER_TIMEOUT_MS,
  MAX_DEEPSEEK_REQUEST_BYTES,
  PLAN_SUBMISSION_SCHEMA,
  formatBattleContext,
  type DeepSeekProcessMessageObserver,
  type DeepSeekTransport,
} from "./decision.js";

/**
 * Versioned, instrumented Decision implementation ("v1"). The frozen v0
 * DeepSeekDecision remains the untouched control; this evolution adds:
 *   - explicit, versioned Call A profiles (reasoning effort / token ceiling /
 *     instruction variant) with `v0-quality` reproducing v0 byte-for-byte;
 *   - segmented Call A / Call B timing plus real Provider usage extraction
 *     (missing usage fields are recorded as "unknown");
 *   - the optional Call A visible-memo processMessageObserver bypass.
 * Call B stays byte-identical to v0 for every profile, Plan validation is
 * untouched, and Metrics Sink failures can never affect a Decision.
 */
export type DeepSeekCallAProfileId =
  | "v0-quality"
  | "call-a-low"
  | "call-a-none"
  | "call-a-low-tight"
  | "call-a-lean";

export type DeepSeekReasoningEffort = "high" | "low" | "none";

export interface DeepSeekCallAProfile {
  readonly reasoningEffort: DeepSeekReasoningEffort;
  readonly maxOutputTokens: number;
  readonly instructions: string;
}

/** Lean Call A instruction variant: same contract, fewer tokens of guidance. */
const CALL_A_INSTRUCTIONS_LEAN = `You are the Battle v0 tactical planner.
Analyze only the authoritative input context. PATH BASE is planningOrigin, not self.tile.
Return exactly two visible sections: SITUATION and STRATEGY.
STRATEGY must be short-term intent materializable into one PlanSubmission.
Never invent actors, skills, coordinates, or rules. No JSON. No tools.`;

export const DEEPSEEK_CALL_A_PROFILES: Readonly<Record<DeepSeekCallAProfileId, DeepSeekCallAProfile>> = Object.freeze({
  "v0-quality": Object.freeze({ reasoningEffort: "high", maxOutputTokens: 65_536, instructions: CALL_A_INSTRUCTIONS }),
  "call-a-low": Object.freeze({ reasoningEffort: "low", maxOutputTokens: 65_536, instructions: CALL_A_INSTRUCTIONS }),
  "call-a-none": Object.freeze({ reasoningEffort: "none", maxOutputTokens: 65_536, instructions: CALL_A_INSTRUCTIONS }),
  "call-a-low-tight": Object.freeze({ reasoningEffort: "low", maxOutputTokens: 4_096, instructions: CALL_A_INSTRUCTIONS }),
  "call-a-lean": Object.freeze({ reasoningEffort: "low", maxOutputTokens: 65_536, instructions: CALL_A_INSTRUCTIONS_LEAN }),
});

export interface DeepSeekProfiledDecisionOptions {
  readonly transport: DeepSeekTransport;
  readonly profile: DeepSeekCallAProfileId;
  readonly metricsSink?: DecisionMetricsSink;
}

type DeepSeekTransportResponse = Awaited<ReturnType<DeepSeekTransport["postResponses"]>>;

type ProfiledWorkflowResult =
  | { readonly type: "completed"; readonly plan: PlanSubmission }
  | { readonly type: "failed"; readonly error: DecisionFailure };

class WorkflowFailure extends Error {
  constructor(readonly failure: DecisionFailure, readonly httpStatus?: number) {
    super(failure.code);
    this.name = "WorkflowFailure";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null && typeof value === "object" && typeof (value as PromiseLike<unknown>).then === "function";
}

function fail(category: DecisionFailure["category"], code: string, httpStatus?: number): never {
  throw new WorkflowFailure(Object.freeze({ category, code }), httpStatus);
}

function nowMs(): number {
  const performance = globalThis.performance;
  if (performance !== undefined && typeof performance.now === "function") return performance.now();
  return Date.now();
}

function copyPoint(value: { readonly x: number; readonly y: number }): { x: number; y: number } {
  return { x: value.x, y: value.y };
}

function copyPlan(plan: PlanSubmission): PlanSubmission {
  return Object.freeze({
    ...(plan.turn === undefined ? {} : { turn: plan.turn }),
    path: Object.freeze(plan.path.map(copyPoint)),
    ...(plan.skill === undefined ? {} : {
      skill: Object.freeze({
        skillId: plan.skill.skillId,
        targetActorId: plan.skill.targetActorId,
        minCoefficient: plan.skill.minCoefficient,
      }),
    }),
  });
}

export function buildProfiledAnalysisRequest(
  battle: Record<string, unknown>,
  profile: DeepSeekCallAProfile,
): Record<string, unknown> {
  return {
    model: DEEPSEEK_MODEL,
    instructions: profile.instructions,
    input: JSON.stringify(battle),
    reasoning: { effort: profile.reasoningEffort },
    max_output_tokens: profile.maxOutputTokens,
    stream: false,
    text: { format: { type: "text" } },
  };
}

export function buildProfiledMaterializationRequest(
  battle: Record<string, unknown>,
  strategyMemo: string,
): Record<string, unknown> {
  return {
    model: DEEPSEEK_MODEL,
    instructions: CALL_B_INSTRUCTIONS,
    input: JSON.stringify({ battle, strategyMemo }),
    reasoning: { effort: "none" },
    temperature: 0,
    max_output_tokens: 4096,
    stream: false,
    text: {
      format: {
        type: "json_schema",
        name: "battle_plan_v0",
        schema: PLAN_SUBMISSION_SCHEMA,
      },
    },
  };
}

/** Extract real Provider usage; omitted fields become "unknown". */
export function extractProviderUsage(value: unknown): ProviderUsage | null {
  if (!isRecord(value)) return null;
  const usage = isRecord(value.usage) ? value.usage : null;
  if (usage === null) return null;
  const details = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : null;
  const token = (candidate: unknown): number | "unknown" =>
    Number.isSafeInteger(candidate) && Number(candidate) >= 0 ? Number(candidate) : "unknown";
  return Object.freeze({
    inputTokens: token(usage.input_tokens),
    outputTokens: token(usage.output_tokens),
    reasoningTokens: token(details?.reasoning_tokens),
  });
}

function extractOutputText(value: unknown): string {
  if (!isRecord(value) || value.object !== "response") fail("attempt_failure", "DECISION_PROVIDER_UNAVAILABLE");
  if (value.status === "incomplete") {
    const reason = isRecord(value.incomplete_details) ? value.incomplete_details.reason : undefined;
    fail("attempt_failure", reason === "content_filter" ? "DECISION_PROVIDER_REFUSED" : "DECISION_PROVIDER_INCOMPLETE");
  }
  if (value.status !== "completed" || !Array.isArray(value.output)) fail("attempt_failure", "DECISION_PROVIDER_UNAVAILABLE");
  const visibleParts: string[] = [];
  for (const rawItem of value.output) {
    if (!isRecord(rawItem) || typeof rawItem.type !== "string") fail("attempt_failure", "DECISION_PROVIDER_UNAVAILABLE");
    if (rawItem.type === "reasoning") continue;
    if (rawItem.type !== "message" || rawItem.role !== "assistant" || !Array.isArray(rawItem.content)) {
      fail("attempt_failure", "DECISION_PROVIDER_UNAVAILABLE");
    }
    for (const rawContent of rawItem.content) {
      if (!isRecord(rawContent) || rawContent.type !== "output_text" || typeof rawContent.text !== "string") {
        fail("attempt_failure", "DECISION_PROVIDER_UNAVAILABLE");
      }
      visibleParts.push(rawContent.text);
    }
  }
  const visibleText = visibleParts.join("");
  if (visibleText.trim().length === 0) fail("attempt_failure", "DECISION_OUTPUT_INVALID");
  return visibleText;
}

function normalizeProviderResponse(response: DeepSeekTransportResponse): { text: string; usage: ProviderUsage | null } {
  if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599 || typeof response.bodyText !== "string") {
    throw new Error("DeepSeekTransport returned an invalid response");
  }
  if (response.status === 401 || response.status === 403) fail("session_fatal", "DECISION_PROVIDER_AUTH", response.status);
  if (response.status === 402) fail("session_fatal", "DECISION_PROVIDER_QUOTA", response.status);
  if (response.status === 429) fail("attempt_failure", "DECISION_PROVIDER_RATE_LIMITED", response.status);
  if (response.status >= 500) fail("attempt_failure", "DECISION_PROVIDER_UNAVAILABLE", response.status);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`DeepSeek Responses contract rejected with HTTP ${response.status}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(response.bodyText);
  } catch {
    fail("attempt_failure", "DECISION_PROVIDER_UNAVAILABLE", response.status);
  }
  const usage = extractProviderUsage(value);
  return { text: extractOutputText(value), usage };
}

interface CallOutcome {
  readonly text: string;
  readonly usage: ProviderUsage | null;
  readonly parseMs: number;
}

async function callProfiledDeepSeek(
  transport: DeepSeekTransport,
  body: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<CallOutcome> {
  if (signal.aborted) fail("attempt_failure", "DECISION_ABORTED");
  const bodyText = JSON.stringify(body);
  if (new TextEncoder().encode(bodyText).byteLength > MAX_DEEPSEEK_REQUEST_BYTES) {
    fail("session_fatal", "DECISION_CONTEXT_TOO_LARGE");
  }

  const transportController = new AbortController();
  let timeoutFired = false;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return new Promise<CallOutcome>((resolve, reject) => {
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const abortFailure = (): WorkflowFailure => new WorkflowFailure(Object.freeze({
      category: "attempt_failure",
      code: "DECISION_ABORTED",
    }));
    const timeoutFailure = (): WorkflowFailure => new WorkflowFailure(Object.freeze({
      category: "attempt_failure",
      code: "DECISION_PROVIDER_TIMEOUT",
    }));
    const onAbort = (): void => {
      transportController.abort();
      if (!settled) { settled = true; cleanup(); reject(abortFailure()); }
    };

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    timer = setTimeout(() => {
      timeoutFired = true;
      transportController.abort();
      if (!settled) { settled = true; cleanup(); reject(signal.aborted ? abortFailure() : timeoutFailure()); }
    }, DEEPSEEK_PROVIDER_TIMEOUT_MS);

    let request: Promise<DeepSeekTransportResponse>;
    try {
      request = transport.postResponses(bodyText, transportController.signal);
    } catch (error) {
      request = Promise.reject(error);
    }
    Promise.resolve(request).then((response) => {
      if (settled) return;
      if (signal.aborted) {
        settled = true; cleanup(); reject(abortFailure());
        return;
      }
      if (timeoutFired) {
        settled = true; cleanup(); reject(timeoutFailure());
        return;
      }
      const parseStart = nowMs();
      try {
        const normalized = normalizeProviderResponse(response);
        settled = true; cleanup();
        resolve({ text: normalized.text, usage: normalized.usage, parseMs: Math.max(0, nowMs() - parseStart) });
      } catch (error) {
        settled = true; cleanup(); reject(error);
      }
    }, () => {
      if (settled) return;
      settled = true; cleanup();
      if (signal.aborted) reject(abortFailure());
      else if (timeoutFired) reject(timeoutFailure());
      else reject(new WorkflowFailure(Object.freeze({
        category: "attempt_failure",
        code: "DECISION_PROVIDER_NETWORK",
      })));
    });
  });
}

function outcomeFor(code: string): ProviderCallOutcome {
  if (code === "DECISION_ABORTED") return "abort";
  if (code === "DECISION_PROVIDER_TIMEOUT") return "timeout";
  if (code === "DECISION_PROVIDER_REFUSED" || code === "DECISION_PROVIDER_INCOMPLETE") return "incomplete_response";
  if (code === "DECISION_OUTPUT_INVALID") return "parse_error";
  return "provider_error";
}

function parsePlanSubmission(text: string): PlanSubmission {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail("attempt_failure", "DECISION_OUTPUT_INVALID");
  }
  if (!isRecord(value)) fail("attempt_failure", "DECISION_OUTPUT_INVALID");
  const allowed = new Set(["turn", "path", "skill"]);
  if (Object.keys(value).some((key) => !allowed.has(key)) || !Array.isArray(value.path)) {
    fail("attempt_failure", "DECISION_OUTPUT_INVALID");
  }
  const path = value.path.map((raw) => {
    if (!isRecord(raw) || Object.keys(raw).length !== 2 || !Object.hasOwn(raw, "x") || !Object.hasOwn(raw, "y")
      || !Number.isSafeInteger(raw.x) || !Number.isSafeInteger(raw.y)) {
      fail("attempt_failure", "DECISION_OUTPUT_INVALID");
    }
    return Object.freeze({ x: Number(raw.x), y: Number(raw.y) });
  });
  let turn: 2 | 4 | 6 | 8 | undefined;
  if (Object.hasOwn(value, "turn")) {
    if (value.turn !== 2 && value.turn !== 4 && value.turn !== 6 && value.turn !== 8) fail("attempt_failure", "DECISION_OUTPUT_INVALID");
    turn = value.turn;
  }
  let skill: PlanSubmission["skill"];
  if (Object.hasOwn(value, "skill")) {
    if (!isRecord(value.skill) || Object.keys(value.skill).length !== 3
      || !Object.hasOwn(value.skill, "skillId") || !Object.hasOwn(value.skill, "targetActorId") || !Object.hasOwn(value.skill, "minCoefficient")
      || typeof value.skill.skillId !== "string" || value.skill.skillId.length === 0
      || typeof value.skill.targetActorId !== "string" || value.skill.targetActorId.length === 0
      || typeof value.skill.minCoefficient !== "number" || !Number.isFinite(value.skill.minCoefficient)) {
      fail("attempt_failure", "DECISION_OUTPUT_INVALID");
    }
    skill = Object.freeze({
      skillId: value.skill.skillId,
      targetActorId: value.skill.targetActorId,
      minCoefficient: value.skill.minCoefficient,
    });
  }
  return Object.freeze({
    ...(turn === undefined ? {} : { turn }),
    path: Object.freeze(path),
    ...(skill === undefined ? {} : { skill }),
  });
}

export class DeepSeekProfiledDecision implements DecisionPort {
  readonly #transport: DeepSeekTransport;
  readonly #profile: DeepSeekCallAProfile;
  readonly #profileId: DeepSeekCallAProfileId;
  readonly #metricsSink?: DecisionMetricsSink;
  readonly #processMessageObserver?: DeepSeekProcessMessageObserver;

  constructor(options: DeepSeekProfiledDecisionOptions, processMessageObserver?: DeepSeekProcessMessageObserver) {
    if (!isRecord(options) || Object.keys(options).length < 2 || Object.keys(options).length > 3
      || !Object.hasOwn(options, "transport") || !Object.hasOwn(options, "profile")
      || !isRecord(options.transport) || typeof options.transport.postResponses !== "function") {
      throw new TypeError("DeepSeekProfiledDecision requires a configured transport and profile");
    }
    const profile = DEEPSEEK_CALL_A_PROFILES[options.profile];
    if (profile === undefined) throw new TypeError("DeepSeekProfiledDecision received an unknown profile id");
    if (options.metricsSink !== undefined && (options.metricsSink === null || typeof options.metricsSink.record !== "function")) {
      throw new TypeError("DeepSeekProfiledDecision metricsSink must provide record()");
    }
    if (processMessageObserver !== undefined && typeof processMessageObserver !== "function") {
      throw new TypeError("DeepSeekProfiledDecision processMessageObserver must be a function");
    }
    this.#transport = options.transport as unknown as DeepSeekTransport;
    this.#profileId = options.profile;
    this.#profile = profile;
    this.#metricsSink = options.metricsSink;
    this.#processMessageObserver = processMessageObserver;
  }

  async decide(request: DecisionRequest, signal: AbortSignal): Promise<DecisionCompletion> {
    const result = await this.#run(request, signal);
    return result.type === "completed"
      ? Object.freeze({ type: "completed", requestId: request.requestId, generation: request.generation, plan: result.plan })
      : Object.freeze({ type: "failed", requestId: request.requestId, generation: request.generation, error: result.error });
  }

  async #run(request: DecisionRequest, signal: AbortSignal): Promise<ProfiledWorkflowResult> {
    try {
      const battle = formatBattleContext(request);
      let strategyMemo: string;
      try {
        const startedAt = nowMs();
        const outcome = await callProfiledDeepSeek(this.#transport, buildProfiledAnalysisRequest(battle, this.#profile), signal);
        this.#recordProviderMetric("call_a", startedAt, outcome, "success");
        strategyMemo = outcome.text;
      } catch (error) {
        this.#recordProviderFailure("call_a", error);
        throw error;
      }
      if (signal.aborted) fail("attempt_failure", "DECISION_ABORTED");
      if (this.#processMessageObserver !== undefined) {
        try {
          this.#processMessageObserver(request, strategyMemo);
        } catch { /* observer failures never affect the Decision */ }
      }
      try {
        const startedAt = nowMs();
        const outcome = await callProfiledDeepSeek(this.#transport, buildProfiledMaterializationRequest(battle, strategyMemo), signal);
        const plan = parsePlanSubmission(outcome.text);
        this.#recordProviderMetric("call_b", startedAt, outcome, "success");
        return Object.freeze({ type: "completed", plan: copyPlan(plan) });
      } catch (error) {
        this.#recordProviderFailure("call_b", error);
        throw error;
      }
    } catch (error) {
      if (error instanceof WorkflowFailure) return Object.freeze({ type: "failed", error: error.failure });
      throw error;
    }
  }

  #recordProviderMetric(
    stage: "call_a" | "call_b",
    startedAt: number,
    outcome: CallOutcome,
    outcomeKind: ProviderCallOutcome,
  ): void {
    this.#emitMetric({
      scope: "provider",
      profileId: this.#profileId,
      stage,
      durationMs: Math.max(0, nowMs() - startedAt),
      parseMs: outcome.parseMs,
      outcome: outcomeKind,
      usage: outcome.usage,
    });
  }

  #recordProviderFailure(stage: "call_a" | "call_b", error: unknown): void {
    if (!(error instanceof WorkflowFailure)) return;
    this.#emitMetric({
      scope: "provider",
      profileId: this.#profileId,
      stage,
      durationMs: 0,
      outcome: outcomeFor(error.failure.code),
      ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
      code: error.failure.code,
      usage: null,
    });
  }

  #emitMetric(metric: ProviderCallMetric): void {
    const sink = this.#metricsSink;
    if (sink === undefined) return;
    try {
      const result = sink.record(metric);
      if (isPromiseLike(result)) Promise.resolve(result).catch(() => { /* isolated */ });
    } catch { /* metrics must never affect the Decision */ }
  }
}
