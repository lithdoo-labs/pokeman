import type {
  ActorId,
  BattleResult,
  GridPosition,
  MovementFailureReason,
  PlanRejectReason,
  PlanSubmission,
  SkillResolveResult,
} from "../contracts.js";
import type { ResolvedBattleDefinition } from "./state.js";

export interface ReplayDecisionRecord {
  readonly actorId: ActorId;
  readonly generation: number;
  readonly attempt: 0 | 1;
  readonly requestId: string;
  readonly requestTick: number;
  readonly planningOrigin: GridPosition;
  readonly consumedTick: number;
  readonly completion:
    | { readonly type: "completed"; readonly plan: PlanSubmission }
    | { readonly type: "failed"; readonly category: "attempt_failure" | "session_fatal"; readonly code: string };
  readonly consumeOutcome:
    | { readonly type: "accepted"; readonly acceptedTick: number; readonly planId: string }
    | { readonly type: "rejected"; readonly rejectedTick: number; readonly reason: PlanRejectReason }
    | { readonly type: "attempt_failed" }
    | { readonly type: "session_fatal" }
    | { readonly type: "stale" };
}

export type ReplayMovementFact =
  | { readonly type: "move_started"; readonly actorId: ActorId; readonly from: GridPosition; readonly to: GridPosition; readonly motionId: number }
  | { readonly type: "contention"; readonly tile: GridPosition; readonly competitors: readonly ActorId[]; readonly winnerActorId: ActorId }
  | { readonly type: "move_failed"; readonly actorId: ActorId; readonly tile: GridPosition; readonly reason: MovementFailureReason }
  | { readonly type: "move_interrupted"; readonly actorId: ActorId; readonly reason: "damaging_hit" };

export interface ReplaySkillFact {
  readonly effectId: string;
  readonly casterActorId: ActorId;
  readonly targetActorId: ActorId;
  readonly skillId: string;
  readonly result: SkillResolveResult;
  readonly coefficientUnits: number;
}

export interface ReplayDamageFact {
  readonly sourceActorId: ActorId;
  readonly targetActorId: ActorId;
  readonly skillId: string;
  readonly amount: number;
  readonly hpBefore: number;
  readonly hpAfter: number;
}

export interface ReplayProtectionFact {
  readonly actorId: ActorId;
  readonly startTick: number;
  readonly protectedUntilTickExclusive: number;
}

export interface ReplayTickRecord {
  readonly tick: number;
  readonly movements: readonly ReplayMovementFact[];
  readonly skills: readonly ReplaySkillFact[];
  readonly damage: readonly ReplayDamageFact[];
  readonly protections: readonly ReplayProtectionFact[];
}

export interface ReplayRecord {
  readonly version: 1;
  readonly initial: ResolvedBattleDefinition;
  readonly decisions: readonly ReplayDecisionRecord[];
  readonly ticks: readonly ReplayTickRecord[];
  readonly replayability:
    | { readonly type: "in_progress" }
    | { readonly type: "deterministic" }
    | { readonly type: "audit_only"; readonly reason: "cancelled" | "presentation_failure" | "invariant_rejection" };
  readonly result?: BattleResult;
}

function record(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== fields.length || fields.some((field) => !Object.hasOwn(item, field))) {
    throw new TypeError(`${label} has an invalid field set`);
  }
  return item;
}

function safe(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
  return Number(value);
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function point(value: unknown, label: string): void {
  const item = record(value, ["x", "y"], label);
  safe(item.x, `${label}.x`);
  safe(item.y, `${label}.y`);
}

function result(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Replay result must be an object");
  const item = value as Record<string, unknown>;
  if (item.type === "ally_win" || item.type === "enemy_win" || item.type === "simultaneous_defeat" || item.type === "cancelled") {
    record(value, ["type"], "Replay result");
    return;
  }
  const failure = record(value, ["type", "source", "code"], "Replay failure result");
  if (failure.type !== "failure" || (failure.source !== "simulation" && failure.source !== "decision" && failure.source !== "presentation")) {
    throw new TypeError("Replay result is invalid");
  }
  id(failure.code, "Replay failure code");
}

function deterministicResult(value: unknown, decisions: readonly ReplayDecisionRecord[]): void {
  const item = value as Record<string, unknown>;
  if (item.type === "ally_win" || item.type === "enemy_win" || item.type === "simultaneous_defeat") return;
  if (item.type === "failure" && item.source === "simulation"
    && (item.code === "BATTLE_COUNTER_OVERFLOW" || item.code === "BATTLE_NUMERIC_OVERFLOW")) return;
  if (item.type === "failure" && item.source === "decision" && decisions.some((decision) => decision.completion.type === "failed"
    && decision.completion.category === "session_fatal" && decision.completion.code === item.code
    && decision.consumeOutcome.type === "session_fatal")) return;
  throw new TypeError("Deterministic Replay result is not replayable");
}

function validateDecision(value: unknown, index: number, tickSet: ReadonlySet<number>): string {
  const label = `Replay decisions[${index}]`;
  const item = record(value, [
    "actorId", "generation", "attempt", "requestId", "requestTick", "planningOrigin", "consumedTick", "completion", "consumeOutcome",
  ], label);
  id(item.actorId, `${label}.actorId`);
  safe(item.generation, `${label}.generation`, 1);
  if (item.attempt !== 0 && item.attempt !== 1) throw new TypeError(`${label}.attempt is invalid`);
  const requestId = id(item.requestId, `${label}.requestId`);
  const requestTick = safe(item.requestTick, `${label}.requestTick`);
  const consumedTick = safe(item.consumedTick, `${label}.consumedTick`, 1);
  if (requestTick > consumedTick || !tickSet.has(consumedTick)) throw new TypeError(`${label} Tick references are invalid`);
  point(item.planningOrigin, `${label}.planningOrigin`);
  if (item.completion === null || typeof item.completion !== "object" || Array.isArray(item.completion)) throw new TypeError(`${label}.completion is invalid`);
  const completion = item.completion as Record<string, unknown>;
  if (completion.type === "completed") {
    const completed = record(completion, ["type", "plan"], `${label}.completion`);
    if (completed.plan === null || typeof completed.plan !== "object" || Array.isArray(completed.plan)) throw new TypeError(`${label}.completion.plan is invalid`);
  } else {
    const failed = record(completion, ["type", "category", "code"], `${label}.completion`);
    if (failed.type !== "failed" || (failed.category !== "attempt_failure" && failed.category !== "session_fatal")) throw new TypeError(`${label}.completion is invalid`);
    id(failed.code, `${label}.completion.code`);
  }
  if (item.consumeOutcome === null || typeof item.consumeOutcome !== "object" || Array.isArray(item.consumeOutcome)) throw new TypeError(`${label}.consumeOutcome is invalid`);
  const outcome = item.consumeOutcome as Record<string, unknown>;
  if (outcome.type === "accepted") {
    const accepted = record(outcome, ["type", "acceptedTick", "planId"], `${label}.consumeOutcome`);
    safe(accepted.acceptedTick, `${label}.acceptedTick`, 1);
    id(accepted.planId, `${label}.planId`);
  } else if (outcome.type === "rejected") {
    const rejected = record(outcome, ["type", "rejectedTick", "reason"], `${label}.consumeOutcome`);
    safe(rejected.rejectedTick, `${label}.rejectedTick`, 1);
    id(rejected.reason, `${label}.reason`);
  } else if (outcome.type === "attempt_failed" || outcome.type === "session_fatal" || outcome.type === "stale") {
    record(outcome, ["type"], `${label}.consumeOutcome`);
  } else throw new TypeError(`${label}.consumeOutcome is invalid`);
  return requestId;
}

function validateTick(value: unknown, index: number): number {
  const label = `Replay ticks[${index}]`;
  const item = record(value, ["tick", "movements", "skills", "damage", "protections"], label);
  const tick = safe(item.tick, `${label}.tick`, 1);
  for (const field of ["movements", "skills", "damage", "protections"] as const) {
    if (!Array.isArray(item[field])) throw new TypeError(`${label}.${field} must be an array`);
  }
  for (const [factIndex, raw] of (item.movements as unknown[]).entries()) {
    const factLabel = `${label}.movements[${factIndex}]`;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError(`${factLabel} is invalid`);
    const type = (raw as Record<string, unknown>).type;
    if (type === "move_started") {
      const fact = record(raw, ["type", "actorId", "from", "to", "motionId"], factLabel);
      id(fact.actorId, `${factLabel}.actorId`); point(fact.from, `${factLabel}.from`); point(fact.to, `${factLabel}.to`); safe(fact.motionId, `${factLabel}.motionId`, 1);
    } else if (type === "contention") {
      const fact = record(raw, ["type", "tile", "competitors", "winnerActorId"], factLabel);
      point(fact.tile, `${factLabel}.tile`);
      if (!Array.isArray(fact.competitors) || fact.competitors.length !== 2) throw new TypeError(`${factLabel}.competitors is invalid`);
      const competitors = fact.competitors.map((actorId, actorIndex) => id(actorId, `${factLabel}.competitors[${actorIndex}]`));
      if (competitors[0]! >= competitors[1]! || !competitors.includes(id(fact.winnerActorId, `${factLabel}.winnerActorId`))) throw new TypeError(`${factLabel}.competitors is invalid`);
    } else if (type === "move_failed") {
      const fact = record(raw, ["type", "actorId", "tile", "reason"], factLabel);
      id(fact.actorId, `${factLabel}.actorId`); point(fact.tile, `${factLabel}.tile`);
      if (!["blocked", "occupied", "reserved", "contested", "swap_forbidden"].includes(String(fact.reason))) throw new TypeError(`${factLabel}.reason is invalid`);
    } else if (type === "move_interrupted") {
      const fact = record(raw, ["type", "actorId", "reason"], factLabel);
      id(fact.actorId, `${factLabel}.actorId`); if (fact.reason !== "damaging_hit") throw new TypeError(`${factLabel}.reason is invalid`);
    } else throw new TypeError(`${factLabel}.type is invalid`);
  }
  for (const [factIndex, raw] of (item.skills as unknown[]).entries()) {
    const factLabel = `${label}.skills[${factIndex}]`;
    const fact = record(raw, ["effectId", "casterActorId", "targetActorId", "skillId", "result", "coefficientUnits"], factLabel);
    id(fact.effectId, `${factLabel}.effectId`); id(fact.casterActorId, `${factLabel}.casterActorId`);
    id(fact.targetActorId, `${factLabel}.targetActorId`); id(fact.skillId, `${factLabel}.skillId`); safe(fact.coefficientUnits, `${factLabel}.coefficientUnits`);
    if (!["hit", "immune", "miss", "invalid"].includes(String(fact.result))) throw new TypeError(`${factLabel}.result is invalid`);
  }
  for (const [factIndex, raw] of (item.damage as unknown[]).entries()) {
    const factLabel = `${label}.damage[${factIndex}]`;
    const fact = record(raw, ["sourceActorId", "targetActorId", "skillId", "amount", "hpBefore", "hpAfter"], factLabel);
    id(fact.sourceActorId, `${factLabel}.sourceActorId`); id(fact.targetActorId, `${factLabel}.targetActorId`); id(fact.skillId, `${factLabel}.skillId`);
    safe(fact.amount, `${factLabel}.amount`); safe(fact.hpBefore, `${factLabel}.hpBefore`); safe(fact.hpAfter, `${factLabel}.hpAfter`);
  }
  for (const [factIndex, raw] of (item.protections as unknown[]).entries()) {
    const factLabel = `${label}.protections[${factIndex}]`;
    const fact = record(raw, ["actorId", "startTick", "protectedUntilTickExclusive"], factLabel);
    id(fact.actorId, `${factLabel}.actorId`); safe(fact.startTick, `${factLabel}.startTick`, 1); safe(fact.protectedUntilTickExclusive, `${factLabel}.protectedUntilTickExclusive`, 1);
  }
  return tick;
}

export function validateReplayRecord(value: unknown): ReplayRecord {
  const item = record(value, ["version", "initial", "decisions", "ticks", "replayability", "result"], "ReplayRecord");
  if (item.version !== 1 || item.initial === null || typeof item.initial !== "object" || Array.isArray(item.initial)) throw new TypeError("ReplayRecord version/initial is invalid");
  if (!Array.isArray(item.decisions) || !Array.isArray(item.ticks)) throw new TypeError("ReplayRecord decisions/ticks must be arrays");
  const replayability = record(item.replayability, ["type"], "ReplayRecord.replayability");
  if (replayability.type !== "deterministic") throw new TypeError("BattleReplayBuilder requires a deterministic ReplayRecord");
  result(item.result);
  const tickNumbers = item.ticks.map((tick, index) => validateTick(tick, index));
  for (let index = 0; index < tickNumbers.length; index += 1) {
    if (tickNumbers[index] !== index + 1) throw new TypeError("Replay ticks must be unique, contiguous, and start at 1");
  }
  const tickSet = new Set(tickNumbers);
  const requestIds = new Set<string>();
  let lastConsumedTick = 0;
  for (const [index, decision] of item.decisions.entries()) {
    const requestId = validateDecision(decision, index, tickSet);
    if (requestIds.has(requestId)) throw new TypeError("Replay requestId must be unique");
    requestIds.add(requestId);
    const consumedTick = (decision as ReplayDecisionRecord).consumedTick;
    if (consumedTick < lastConsumedTick) throw new TypeError("Replay decisions must be ordered by consumedTick");
    lastConsumedTick = consumedTick;
  }
  deterministicResult(item.result, item.decisions as ReplayDecisionRecord[]);
  return structuredClone(value) as ReplayRecord;
}

export class ReplayRecorder {
  readonly #definition: ResolvedBattleDefinition;
  readonly decisions: ReplayDecisionRecord[] = [];
  readonly ticks: ReplayTickRecord[] = [];
  replayability: ReplayRecord["replayability"] = { type: "in_progress" };
  result: BattleResult | undefined;

  constructor(definition: ResolvedBattleDefinition) {
    this.#definition = definition;
  }

  appendDecision(record: ReplayDecisionRecord): void {
    this.decisions.push(structuredClone(record));
  }

  appendTick(record: ReplayTickRecord): void {
    this.ticks.push(structuredClone(record));
  }

  finish(result: BattleResult, replayability: ReplayRecord["replayability"]): void {
    this.result = structuredClone(result);
    this.replayability = replayability;
  }

  rejectInvariant(): void {
    this.result = undefined;
    this.replayability = { type: "audit_only", reason: "invariant_rejection" };
  }

  snapshot(): ReplayRecord {
    return deepFreeze({
      version: 1,
      initial: this.#definition,
      decisions: structuredClone(this.decisions),
      ticks: structuredClone(this.ticks),
      replayability: structuredClone(this.replayability),
      ...(this.result === undefined ? {} : { result: structuredClone(this.result) }),
    });
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
