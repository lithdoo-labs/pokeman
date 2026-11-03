import type {
  DecisionCompletion,
  DecisionFailure,
  DecisionPort,
  DecisionRequest,
  PlanSubmission,
} from "./contracts.js";

export interface DeepSeekTransport {
  postResponses(
    bodyText: string,
    signal: AbortSignal,
  ): Promise<{
    readonly status: number;
    readonly bodyText: string;
  }>;
}

type DeepSeekTransportResponse = Awaited<ReturnType<DeepSeekTransport["postResponses"]>>;

export interface DeepSeekDecisionOptions {
  readonly transport: DeepSeekTransport;
}

type DecisionWorkflowResult =
  | { readonly type: "completed"; readonly plan: PlanSubmission }
  | { readonly type: "failed"; readonly error: DecisionFailure };

interface DecisionWorkflow {
  run(request: DecisionRequest, signal: AbortSignal): Promise<DecisionWorkflowResult>;
}

const MODEL = "deepseek-flash";
const PROVIDER_TIMEOUT_MS = 60_000;
const MAX_DEEPSEEK_REQUEST_BYTES = 512 * 1024;

const CALL_A_INSTRUCTIONS = `You are the Battle v0 tactical planner.
Analyze only the authoritative battle context provided as input.
PATH BASE is planningOrigin, not self.tile.
Return exactly two visible sections: SITUATION and STRATEGY.
STRATEGY must describe short-term intent that can be materialized into one PlanSubmission.
Do not invent actors, skills, coordinates, game rules, or hidden state.
Do not output JSON. Do not call tools.`;

const CALL_B_INSTRUCTIONS = `You are the Battle v0 plan materializer.
Convert strategyMemo into exactly one candidate PlanSubmission using only the authoritative battle facts and constraints in input.
PATH BASE is planningOrigin.
Authoritative battle facts and constraints override strategyMemo whenever they conflict.
Return only data matching the battle_plan_v0 JSON Schema.
Do not explain. Do not call tools. Do not invent or repair world facts.`;

const PLAN_SUBMISSION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze(["path"]),
  properties: Object.freeze({
    turn: Object.freeze({ type: "integer", enum: Object.freeze([2, 4, 6, 8]) }),
    path: Object.freeze({
      type: "array",
      items: Object.freeze({
        type: "object",
        additionalProperties: false,
        required: Object.freeze(["x", "y"]),
        properties: Object.freeze({
          x: Object.freeze({ type: "integer" }),
          y: Object.freeze({ type: "integer" }),
        }),
      }),
    }),
    skill: Object.freeze({
      type: "object",
      additionalProperties: false,
      required: Object.freeze(["skillId", "targetActorId", "minCoefficient"]),
      properties: Object.freeze({
        skillId: Object.freeze({ type: "string" }),
        targetActorId: Object.freeze({ type: "string" }),
        minCoefficient: Object.freeze({ type: "number" }),
      }),
    }),
  }),
});

class WorkflowFailure extends Error {
  constructor(readonly failure: DecisionFailure) {
    super(failure.code);
    this.name = "WorkflowFailure";
  }
}

function fail(category: DecisionFailure["category"], code: string): never {
  throw new WorkflowFailure(Object.freeze({ category, code }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function copyAction(action: DecisionRequest["observation"]["actors"][number]["action"]): Record<string, unknown> {
  switch (action.type) {
    case "idle":
    case "dead":
      return { type: action.type };
    case "moving":
      return {
        type: "moving",
        from: copyPoint(action.from),
        to: copyPoint(action.to),
        startTick: action.startTick,
        completeTick: action.completeTick,
      };
    case "windup":
      return {
        type: "windup",
        skillId: action.skillId,
        targetActorId: action.targetActorId,
        startTick: action.startTick,
        resolveTick: action.resolveTick,
      };
    case "recovery":
      return { type: "recovery", skillId: action.skillId, completeTick: action.completeTick };
  }
}

function copyObservedEvent(event: DecisionRequest["observation"]["recentEvents"][number]): Record<string, unknown> {
  switch (event.type) {
    case "move_failed":
      return {
        type: "move_failed",
        tick: event.tick,
        actorId: event.actorId,
        tile: copyPoint(event.tile),
        reason: event.reason,
      };
    case "move_interrupted":
      return { type: "move_interrupted", tick: event.tick, actorId: event.actorId, reason: event.reason };
    case "skill_resolved":
      return {
        type: "skill_resolved",
        tick: event.tick,
        casterActorId: event.casterActorId,
        targetActorId: event.targetActorId,
        skillId: event.skillId,
        result: event.result,
        coefficientUnits: event.coefficientUnits,
        finalDamage: event.finalDamage,
      };
    case "protection_started":
      return {
        type: "protection_started",
        tick: event.tick,
        actorId: event.actorId,
        protectedUntilTickExclusive: event.protectedUntilTickExclusive,
      };
  }
}

function formatBattleContext(request: DecisionRequest): Record<string, unknown> {
  const { observation, constraints, planningOrigin } = request;
  const radius = constraints.maxPathSteps;
  const minX = Math.max(0, planningOrigin.x - radius);
  const maxX = Math.min(observation.map.width - 1, planningOrigin.x + radius);
  const minY = Math.max(0, planningOrigin.y - radius);
  const maxY = Math.min(observation.map.height - 1, planningOrigin.y + radius);
  const rows: string[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    let row = "";
    for (let x = minX; x <= maxX; x += 1) row += observation.map.passable[y]?.[x] === true ? "." : "#";
    rows.push(row);
  }

  return {
    version: "battle_decision_context_v0",
    tick: observation.tick,
    selfActorId: observation.selfActorId,
    planningOrigin: copyPoint(planningOrigin),
    map: {
      width: observation.map.width,
      height: observation.map.height,
      window: { originX: minX, originY: minY, rows },
    },
    actors: observation.actors.map((actor) => ({
      actorId: actor.actorId,
      team: actor.team,
      hp: actor.hp,
      maxHp: actor.maxHp,
      tile: copyPoint(actor.tile),
      direction: actor.direction,
      action: copyAction(actor.action),
      protectedUntilTickExclusive: actor.protectedUntilTickExclusive,
      skills: actor.skills.map((skill) => ({
        skillId: skill.skillId,
        baseDamage: skill.baseDamage,
        windupTicks: skill.windupTicks,
        recoveryTicks: skill.recoveryTicks,
        range: {
          width: skill.range.width,
          height: skill.range.height,
          originX: skill.range.originX,
          originY: skill.range.originY,
          rows: skill.range.coefficientUnits.map((row) => [...row]),
        },
      })),
    })),
    constraints: {
      maxPathSteps: constraints.maxPathSteps,
      movement: { cardinalOnly: true },
      turn: { allowed: true },
      skills: constraints.skills.map((skill) => ({
        skillId: skill.skillId,
        minCoefficients: [...skill.minCoefficients],
      })),
    },
    recentEvents: observation.recentEvents.map(copyObservedEvent),
    correction: request.correction === undefined ? null : {
      rejectedPlan: copyPlan(request.correction.rejectedPlan),
      reason: request.correction.reason,
    },
  };
}

function buildAnalysisRequest(battle: Record<string, unknown>): Record<string, unknown> {
  return {
    model: MODEL,
    instructions: CALL_A_INSTRUCTIONS,
    input: JSON.stringify(battle),
    reasoning: { effort: "high" },
    max_output_tokens: 65_536,
    stream: false,
    text: { format: { type: "text" } },
  };
}

function buildMaterializationRequest(battle: Record<string, unknown>, strategyMemo: string): Record<string, unknown> {
  return {
    model: MODEL,
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

function normalizeProviderResponse(response: DeepSeekTransportResponse): string {
  if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599 || typeof response.bodyText !== "string") {
    throw new Error("DeepSeekTransport returned an invalid response");
  }
  if (response.status === 401 || response.status === 403) fail("session_fatal", "DECISION_PROVIDER_AUTH");
  if (response.status === 402) fail("session_fatal", "DECISION_PROVIDER_QUOTA");
  if (response.status === 429) fail("attempt_failure", "DECISION_PROVIDER_RATE_LIMITED");
  if (response.status >= 500) fail("attempt_failure", "DECISION_PROVIDER_UNAVAILABLE");
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`DeepSeek Responses contract rejected with HTTP ${response.status}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(response.bodyText);
  } catch {
    fail("attempt_failure", "DECISION_PROVIDER_UNAVAILABLE");
  }
  return extractOutputText(value);
}

async function callDeepSeek(
  transport: DeepSeekTransport,
  body: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) fail("attempt_failure", "DECISION_ABORTED");
  const bodyText = JSON.stringify(body);
  if (new TextEncoder().encode(bodyText).byteLength > MAX_DEEPSEEK_REQUEST_BYTES) {
    fail("session_fatal", "DECISION_CONTEXT_TOO_LARGE");
  }

  const transportController = new AbortController();
  let timeoutFired = false;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return new Promise<string>((resolve, reject) => {
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const settleResolve = (value: string): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const settleReject = (error: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
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
      settleReject(abortFailure());
    };

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    timer = setTimeout(() => {
      timeoutFired = true;
      transportController.abort();
      settleReject(signal.aborted ? abortFailure() : timeoutFailure());
    }, PROVIDER_TIMEOUT_MS);

    let request: Promise<DeepSeekTransportResponse>;
    try {
      request = transport.postResponses(bodyText, transportController.signal);
    } catch (error) {
      request = Promise.reject(error);
    }
    Promise.resolve(request).then((response) => {
      if (settled) return;
      if (signal.aborted) {
        settleReject(abortFailure());
        return;
      }
      if (timeoutFired) {
        settleReject(timeoutFailure());
        return;
      }
      try {
        settleResolve(normalizeProviderResponse(response));
      } catch (error) {
        settleReject(error);
      }
    }, () => {
      if (settled) return;
      if (signal.aborted) settleReject(abortFailure());
      else if (timeoutFired) settleReject(timeoutFailure());
      else settleReject(new WorkflowFailure(Object.freeze({
        category: "attempt_failure",
        code: "DECISION_PROVIDER_NETWORK",
      })));
    });
  });
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

class DeepSeekDecisionWorkflow implements DecisionWorkflow {
  constructor(private readonly transport: DeepSeekTransport) {}

  async run(request: DecisionRequest, signal: AbortSignal): Promise<DecisionWorkflowResult> {
    try {
      const battle = formatBattleContext(request);
      const strategyMemo = await callDeepSeek(this.transport, buildAnalysisRequest(battle), signal);
      if (signal.aborted) fail("attempt_failure", "DECISION_ABORTED");
      const planText = await callDeepSeek(this.transport, buildMaterializationRequest(battle, strategyMemo), signal);
      return Object.freeze({ type: "completed", plan: parsePlanSubmission(planText) });
    } catch (error) {
      if (error instanceof WorkflowFailure) return Object.freeze({ type: "failed", error: error.failure });
      throw error;
    }
  }
}

export class DeepSeekDecision implements DecisionPort {
  readonly #workflow: DecisionWorkflow;

  constructor(options: DeepSeekDecisionOptions) {
    if (!isRecord(options) || Object.keys(options).length !== 1 || !Object.hasOwn(options, "transport")
      || !isRecord(options.transport) || typeof options.transport.postResponses !== "function") {
      throw new TypeError("DeepSeekDecision requires exactly one configured transport");
    }
    this.#workflow = new DeepSeekDecisionWorkflow(options.transport as unknown as DeepSeekTransport);
  }

  async decide(request: DecisionRequest, signal: AbortSignal): Promise<DecisionCompletion> {
    const result = await this.#workflow.run(request, signal);
    return result.type === "completed"
      ? Object.freeze({ type: "completed", requestId: request.requestId, generation: request.generation, plan: result.plan })
      : Object.freeze({ type: "failed", requestId: request.requestId, generation: request.generation, error: result.error });
  }
}
