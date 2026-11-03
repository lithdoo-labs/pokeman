import {
  compareActorId,
  type BattleObservation,
  type DecisionRequest,
  type Direction,
  type GridPosition,
  type ObservedAction,
  type ObservedEvent,
  type PlanConstraints,
  type PlanRejectReason,
  type PlanSubmission,
} from "../contracts.js";
import type { ReplayTickRecord } from "./replay.js";
import {
  copyPlanSubmission,
  type AcceptedPlan,
  type ActorRuntimeState,
  type BattleState,
  type ResolvedBattleActor,
  type ResolvedBattleDefinition,
} from "./state.js";
import { takeCounter } from "./numeric.js";

export interface RequestDecisionCommand {
  readonly type: "request_decision";
  readonly request: DecisionRequest;
}

export type DecisionReason =
  | "initial"
  | "prefetch_after_materialize"
  | "plan_exhausted"
  | "plan_failed"
  | "damaging_hit"
  | "hold_reobserve"
  | "decision_attempt_failed";

function point(value: GridPosition): GridPosition {
  return Object.freeze({ x: value.x, y: value.y });
}

function observedAction(actor: ActorRuntimeState): ObservedAction {
  switch (actor.action.type) {
    case "idle": return Object.freeze({ type: "idle" });
    case "dead": return Object.freeze({ type: "dead" });
    case "moving": return Object.freeze({
      type: "moving", from: point(actor.action.from), to: point(actor.action.to),
      startTick: actor.action.startTick, completeTick: actor.action.completeTick,
    });
    case "windup": return Object.freeze({
      type: "windup", skillId: actor.action.skillId, targetActorId: actor.action.targetActorId,
      startTick: actor.action.startTick, resolveTick: actor.action.resolveTick,
    });
    case "recovery": return Object.freeze({ type: "recovery", skillId: actor.action.skillId, completeTick: actor.action.completeTick });
  }
}

function recentEvents(ticks: readonly ReplayTickRecord[], currentTick: number): readonly ObservedEvent[] {
  const events: ObservedEvent[] = [];
  for (const tick of ticks) {
    if (tick.tick < currentTick - 1 || tick.tick > currentTick) continue;
    for (const fact of tick.movements) {
      if (fact.type === "move_failed") events.push({ type: "move_failed", tick: tick.tick, actorId: fact.actorId, tile: point(fact.tile), reason: fact.reason });
      if (fact.type === "move_interrupted") events.push({ type: "move_interrupted", tick: tick.tick, actorId: fact.actorId, reason: "damaging_hit" });
    }
    for (const fact of tick.skills) {
      const damage = tick.damage.find((item) => item.sourceActorId === fact.casterActorId && item.targetActorId === fact.targetActorId && item.skillId === fact.skillId)?.amount ?? 0;
      events.push({
        type: "skill_resolved", tick: tick.tick, casterActorId: fact.casterActorId,
        targetActorId: fact.targetActorId, skillId: fact.skillId, result: fact.result,
        coefficientUnits: fact.coefficientUnits, finalDamage: damage,
      });
    }
    for (const fact of tick.protections) {
      events.push({ type: "protection_started", tick: tick.tick, actorId: fact.actorId, protectedUntilTickExclusive: fact.protectedUntilTickExclusive });
    }
  }
  const rank = (event: ObservedEvent): number => event.type === "move_failed" ? 0 : event.type === "move_interrupted" ? 1 : event.type === "skill_resolved" ? 2 : 3;
  const primary = (event: ObservedEvent): string => event.type === "skill_resolved" ? event.casterActorId : event.actorId;
  const secondary = (event: ObservedEvent): string => event.type === "skill_resolved" ? event.targetActorId : "";
  events.sort((left, right) => left.tick - right.tick || rank(left) - rank(right)
    || compareActorId(primary(left), primary(right)) || compareActorId(secondary(left), secondary(right)));
  return Object.freeze(events.map((event) => Object.freeze(event)));
}

export function buildObservation(
  definition: ResolvedBattleDefinition,
  state: BattleState,
  selfActorId: string,
  replayTicks: readonly ReplayTickRecord[],
): BattleObservation {
  const definitions = new Map(definition.actors.map((actor) => [actor.actorId, actor]));
  const actors = [...state.actors.values()].sort((a, b) => compareActorId(a.actorId, b.actorId)).map((actor) => {
    const source = definitions.get(actor.actorId)!;
    return Object.freeze({
      actorId: actor.actorId,
      team: actor.team,
      hp: actor.hp,
      maxHp: actor.maxHp,
      tile: point(actor.tile),
      direction: actor.direction,
      action: observedAction(actor),
      protectedUntilTickExclusive: actor.protectedUntilTickExclusive,
      skills: Object.freeze([...source.skills].sort((a, b) => compareActorId(a.skillId, b.skillId)).map((skill) => Object.freeze({
        skillId: skill.skillId,
        baseDamage: skill.baseDamage,
        windupTicks: skill.windupTicks,
        recoveryTicks: skill.recoveryTicks,
        range: skill.range,
      }))),
    });
  });
  return Object.freeze({
    tick: state.currentTick,
    selfActorId,
    actors: Object.freeze(actors),
    map: Object.freeze({ width: definition.map.width, height: definition.map.height, passable: definition.map.passable }),
    recentEvents: recentEvents(replayTicks, state.currentTick),
  });
}

export function buildConstraints(definition: ResolvedBattleDefinition, actorDefinition: ResolvedBattleActor): PlanConstraints {
  return Object.freeze({
    maxPathSteps: definition.maxPathSteps,
    movement: Object.freeze({ cardinalOnly: true as const }),
    turn: Object.freeze({ allowed: true as const }),
    skills: Object.freeze([...actorDefinition.skills].sort((a, b) => compareActorId(a.skillId, b.skillId)).map((skill) => {
      const units = new Set<number>();
      for (const row of skill.range.coefficientUnits) for (const value of row) if (value > 0) units.add(value);
      return Object.freeze({ skillId: skill.skillId, minCoefficients: Object.freeze([...units].sort((a, b) => a - b).map((value) => value / 1000)) });
    })),
  });
}

export function ensureDecision(
  definition: ResolvedBattleDefinition,
  state: BattleState,
  actor: ActorRuntimeState,
  replayTicks: readonly ReplayTickRecord[],
  reason: DecisionReason,
  earliestTick: number,
): RequestDecisionCommand | null {
  if (actor.action.type === "dead" || actor.hp <= 0 || actor.pendingPlan !== null || actor.decision.type === "thinking"
    || hasFutureIntent(actor.activePlan) || state.currentTick < earliestTick || state.result !== null) return null;
  actor.decisionGeneration = incrementGeneration(actor.decisionGeneration);
  const requestId = `request:${takeCounter(state as unknown as Record<string, unknown>, "nextRequestId")}`;
  const planningOrigin = reason === "prefetch_after_materialize" && actor.action.type === "moving" ? point(actor.action.to) : point(actor.tile);
  actor.decision = {
    type: "thinking",
    generation: actor.decisionGeneration,
    requestId,
    attempt: 0,
    requestTick: state.currentTick,
    planningOrigin,
  };
  const actorDefinition = definition.actors.find((item) => item.actorId === actor.actorId)!;
  return {
    type: "request_decision",
    request: Object.freeze({
      requestId,
      actorId: actor.actorId,
      generation: actor.decisionGeneration,
      planningOrigin,
      observation: buildObservation(definition, state, actor.actorId, replayTicks),
      constraints: buildConstraints(definition, actorDefinition),
    }),
  };
}

export function makeCorrection(
  definition: ResolvedBattleDefinition,
  state: BattleState,
  actor: ActorRuntimeState,
  replayTicks: readonly ReplayTickRecord[],
  rejectedPlan: unknown,
  reason: PlanRejectReason,
): RequestDecisionCommand {
  if (actor.decision.type !== "thinking") throw new Error("Correction requires a thinking decision");
  const previous = actor.decision;
  const requestId = `request:${takeCounter(state as unknown as Record<string, unknown>, "nextRequestId")}`;
  actor.decision = { ...previous, requestId, attempt: 1, requestTick: state.currentTick };
  const actorDefinition = definition.actors.find((item) => item.actorId === actor.actorId)!;
  return {
    type: "request_decision",
    request: Object.freeze({
      requestId,
      actorId: actor.actorId,
      generation: previous.generation,
      planningOrigin: point(previous.planningOrigin),
      observation: buildObservation(definition, state, actor.actorId, replayTicks),
      constraints: buildConstraints(definition, actorDefinition),
      correction: Object.freeze({ rejectedPlan: structuredClone(rejectedPlan) as PlanSubmission, reason }),
    }),
  };
}

function incrementGeneration(value: number): number {
  if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) {
    const error = new Error("BATTLE_COUNTER_OVERFLOW");
    error.name = "SimulationFailure";
    throw error;
  }
  return value + 1;
}

function ownKeys(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key)) && allowed.every((key) => key.endsWith("?") || true);
}

export function parsePlanSubmission(value: unknown): PlanSubmission | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!Object.hasOwn(source, "path") || Object.keys(source).some((key) => !["turn", "path", "skill"].includes(key)) || !Array.isArray(source.path)) return null;
  if (Object.hasOwn(source, "turn") && (typeof source.turn !== "number" || !Number.isSafeInteger(source.turn))) return null;
  const path: GridPosition[] = [];
  for (const raw of source.path) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).length !== 2 || !Object.hasOwn(item, "x") || !Object.hasOwn(item, "y")
      || !Number.isSafeInteger(item.x) || !Number.isSafeInteger(item.y)) return null;
    path.push({ x: Number(item.x), y: Number(item.y) });
  }
  let skill: PlanSubmission["skill"];
  if (Object.hasOwn(source, "skill")) {
    if (source.skill === null || typeof source.skill !== "object" || Array.isArray(source.skill)) return null;
    const item = source.skill as Record<string, unknown>;
    if (Object.keys(item).length !== 3 || !Object.hasOwn(item, "skillId") || !Object.hasOwn(item, "targetActorId")
      || !Object.hasOwn(item, "minCoefficient") || typeof item.skillId !== "string" || item.skillId.length === 0
      || typeof item.targetActorId !== "string" || item.targetActorId.length === 0
      || typeof item.minCoefficient !== "number" || !Number.isFinite(item.minCoefficient)) return null;
    skill = { skillId: item.skillId, targetActorId: item.targetActorId, minCoefficient: item.minCoefficient };
  }
  return {
    ...(source.turn === undefined ? {} : { turn: source.turn as Direction }),
    path,
    ...(skill === undefined ? {} : { skill }),
  };
}

export function validatePlan(
  definition: ResolvedBattleDefinition,
  state: BattleState,
  actor: ActorRuntimeState,
  planningOrigin: GridPosition,
  rawPlan: unknown,
): { accepted: true; plan: PlanSubmission } | { accepted: false; reason: PlanRejectReason; parsed?: PlanSubmission } {
  const plan = parsePlanSubmission(rawPlan);
  if (plan === null) return { accepted: false, reason: "invalid_plan_shape" };
  if (plan.path.length > definition.maxPathSteps) return { accepted: false, reason: "path_too_long", parsed: plan };
  let previous = planningOrigin;
  for (const tile of plan.path) {
    if (tile.x < 0 || tile.y < 0 || tile.x >= definition.map.width || tile.y >= definition.map.height) return { accepted: false, reason: "path_out_of_bounds", parsed: plan };
    if (Math.abs(tile.x - previous.x) + Math.abs(tile.y - previous.y) !== 1) return { accepted: false, reason: "path_not_adjacent", parsed: plan };
    if (!definition.map.passable[tile.y]![tile.x]) return { accepted: false, reason: "terrain_blocked", parsed: plan };
    previous = tile;
  }
  if (plan.turn !== undefined && plan.turn !== 2 && plan.turn !== 4 && plan.turn !== 6 && plan.turn !== 8) return { accepted: false, reason: "invalid_turn", parsed: plan };
  if (plan.turn !== undefined && plan.path.length > 0) return { accepted: false, reason: "turn_with_path", parsed: plan };
  if (plan.skill !== undefined) {
    const actorDefinition = definition.actors.find((item) => item.actorId === actor.actorId)!;
    const skill = actorDefinition.skills.find((item) => item.skillId === plan.skill!.skillId);
    if (skill === undefined) return { accepted: false, reason: "unknown_skill", parsed: plan };
    const target = state.actors.get(plan.skill.targetActorId);
    if (target === undefined || target.actorId === actor.actorId || target.team === actor.team || target.hp <= 0 || target.action.type === "dead") {
      return { accepted: false, reason: "invalid_target", parsed: plan };
    }
    const units = plan.skill.minCoefficient * 1000;
    const validUnits = new Set(skill.range.coefficientUnits.flat().filter((value) => value > 0));
    if (!Number.isSafeInteger(units) || !validUnits.has(units)) return { accepted: false, reason: "invalid_min_coefficient", parsed: plan };
  }
  return { accepted: true, plan: copyPlanSubmission(plan) };
}

export function acceptPlan(state: BattleState, actor: ActorRuntimeState, submission: PlanSubmission, planningOrigin: GridPosition): AcceptedPlan {
  const planId = `plan:${takeCounter(state as unknown as Record<string, unknown>, "nextPlanId")}`;
  return {
    planId,
    decisionGeneration: actor.decisionGeneration,
    planningOrigin: point(planningOrigin),
    ...(submission.turn === undefined ? {} : { turn: submission.turn }),
    path: Object.freeze(submission.path.map(point)),
    ...(submission.skill === undefined ? {} : {
      skill: Object.freeze({
        skillId: submission.skill.skillId,
        targetActorId: submission.skill.targetActorId,
        minCoefficientUnits: submission.skill.minCoefficient * 1000,
      }),
    }),
    turnConsumed: submission.turn === undefined,
    pathCursor: 0,
    skillConsumed: submission.skill === undefined,
  };
}

export function hasFutureIntent(plan: AcceptedPlan | null): boolean {
  return plan !== null && (!plan.turnConsumed || plan.pathCursor < plan.path.length || !plan.skillConsumed);
}
