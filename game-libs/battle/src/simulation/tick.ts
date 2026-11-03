import {
  compareActorId,
  type ActorSnapshot,
  type BattleResult,
  type BattleSnapshot,
  type DecisionCompletion,
  type DecisionRequest,
  type GridPosition,
  type MovementFailureReason,
  type ObservedEvent,
  type RenderProjection,
  type SkillEffectProjection,
  type SkillResolveResult,
} from "../contracts.js";
import { coefficientAt, contentionWinner, directionForMove, finalDamage, findSkill } from "./combat.js";
import { checkedAdd, SimulationFailure, takeCounter } from "./numeric.js";
import {
  acceptPlan,
  ensureDecision,
  hasFutureIntent,
  makeCorrection,
  validatePlan,
  type RequestDecisionCommand,
} from "./plan.js";
import type { BattleEvent, DecisionInbox, DecisionInboxEntry, ScheduledEventQueue } from "./queues.js";
import type {
  ReplayDamageFact,
  ReplayDecisionRecord,
  ReplayMovementFact,
  ReplayProtectionFact,
  ReplaySkillFact,
  ReplayTickRecord,
} from "./replay.js";
import {
  tileKey,
  type AcceptedPlan,
  type ActorRuntimeState,
  type BattleState,
  type ResolvedBattleDefinition,
} from "./state.js";

interface MoveIntent {
  actor: ActorRuntimeState;
  plan: AcceptedPlan;
  destination: GridPosition;
}

interface SkillResolveIntent {
  actor: ActorRuntimeState;
  generation: number;
  skillId: string;
  targetActorId: string;
}

interface ResolvedHit {
  intent: SkillResolveIntent;
  result: SkillResolveResult;
  coefficientUnits: number;
  damage: number;
  effectId: string;
}

interface TickFacts {
  movements: ReplayMovementFact[];
  skills: ReplaySkillFact[];
  damage: ReplayDamageFact[];
  protections: ReplayProtectionFact[];
}

type DecisionHealthSignal = "success" | "failure";

export interface TickOutput {
  readonly scheduledEvents: readonly BattleEvent[];
  readonly decisionCommands: readonly RequestDecisionCommand[];
  readonly decisionRecords: readonly ReplayDecisionRecord[];
  readonly decisionHealthSignals: readonly DecisionHealthSignal[];
  readonly replayTick: ReplayTickRecord;
  readonly projection: RenderProjection;
  readonly terminalCandidate: BattleResult | null;
  readonly abortActorIds: readonly string[];
}

function sortedActors(state: BattleState): ActorRuntimeState[] {
  return [...state.actors.values()].sort((left, right) => compareActorId(left.actorId, right.actorId));
}

function increment(value: number): number {
  if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) {
    const error = new Error("BATTLE_COUNTER_OVERFLOW");
    error.name = "SimulationFailure";
    throw error;
  }
  return value + 1;
}

function nextId(state: BattleState, key: "nextEventId" | "nextEffectOccurrenceId", prefix: string): string {
  return `${prefix}:${takeCounter(state as unknown as Record<string, unknown>, key)}`;
}

function terminal(state: BattleState): BattleResult | null {
  const allyAlive = [...state.actors.values()].some((actor) => actor.team === "ally" && actor.hp > 0 && actor.action.type !== "dead");
  const enemyAlive = [...state.actors.values()].some((actor) => actor.team === "enemy" && actor.hp > 0 && actor.action.type !== "dead");
  if (!allyAlive && !enemyAlive) return { type: "simultaneous_defeat" };
  if (!enemyAlive) return { type: "ally_win" };
  if (!allyAlive) return { type: "enemy_win" };
  return null;
}

function replayTick(tick: number, facts: TickFacts): ReplayTickRecord {
  return Object.freeze({
    tick,
    movements: Object.freeze(structuredClone(facts.movements)),
    skills: Object.freeze(structuredClone(facts.skills)),
    damage: Object.freeze(structuredClone(facts.damage)),
    protections: Object.freeze(structuredClone(facts.protections)),
  });
}

function replayView(prior: readonly ReplayTickRecord[], tick: number, facts: TickFacts): readonly ReplayTickRecord[] {
  return [...prior, replayTick(tick, facts)];
}

function validEvent(state: BattleState, event: BattleEvent): boolean {
  const actor = state.actors.get(event.actorId);
  if (actor === undefined || actor.action.type === "dead" || actor.actionGeneration !== event.actionGeneration) return false;
  return (event.type === "move_complete" && actor.action.type === "moving" && actor.action.generation === event.actionGeneration)
    || (event.type === "skill_resolve" && actor.action.type === "windup" && actor.action.generation === event.actionGeneration)
    || (event.type === "recovery_complete" && actor.action.type === "recovery" && actor.action.generation === event.actionGeneration);
}

function eventOrder(left: BattleEvent, right: BattleEvent): number {
  const rank = (event: BattleEvent): number => event.type === "move_complete" ? 0 : event.type === "recovery_complete" ? 1 : 2;
  return rank(left) - rank(right) || compareActorId(left.actorId, right.actorId);
}

function invalidateForDamage(
  state: BattleState,
  actor: ActorRuntimeState,
  facts: TickFacts,
  abortActorIds: Set<string>,
): void {
  if (actor.action.type === "moving") {
    state.reservations.delete(tileKey(actor.action.to));
    facts.movements.push({ type: "move_interrupted", actorId: actor.actorId, reason: "damaging_hit" });
  }
  actor.actionGeneration = increment(actor.actionGeneration);
  actor.activePlan = null;
  actor.pendingPlan = null;
  actor.decision = { type: "none" };
  abortActorIds.add(actor.actorId);
}

function resolveBatch(
  definition: ResolvedBattleDefinition,
  state: BattleState,
  intents: readonly SkillResolveIntent[],
  facts: TickFacts,
  effectStarts: SkillEffectProjection[],
  abortActorIds: Set<string>,
  scheduledEvents: BattleEvent[],
): Set<string> {
  const protection = new Map([...state.actors.values()].map((actor) => [actor.actorId, state.currentTick < actor.protectedUntilTickExclusive]));
  const resolved: ResolvedHit[] = [];
  for (const intent of [...intents].sort((a, b) => compareActorId(a.actor.actorId, b.actor.actorId))) {
    const skill = findSkill(definition, intent.actor.actorId, intent.skillId);
    const target = state.actors.get(intent.targetActorId);
    let result: SkillResolveResult = "invalid";
    let coefficientUnits = 0;
    let damage = 0;
    if (target !== undefined && target.actorId !== intent.actor.actorId && target.team !== intent.actor.team && target.hp > 0 && target.action.type !== "dead") {
      coefficientUnits = coefficientAt(skill, intent.actor.tile, intent.actor.direction, target.tile);
      if (coefficientUnits <= 0) result = "miss";
      else if (protection.get(target.actorId)) result = "immune";
      else {
        result = "hit";
        damage = finalDamage(skill.baseDamage, coefficientUnits);
      }
    }
    const effectId = nextId(state, "nextEffectOccurrenceId", "effect");
    resolved.push({ intent, result, coefficientUnits, damage, effectId });
    facts.skills.push({
      effectId,
      casterActorId: intent.actor.actorId,
      targetActorId: intent.targetActorId,
      skillId: intent.skillId,
      result,
      coefficientUnits,
    });
    effectStarts.push(Object.freeze({
      effectId,
      result,
      effect: skill.effect,
      tile: result === "hit" || result === "immune" ? (target === undefined ? null : { ...target.tile }) : null,
      startTick: state.currentTick,
    }));
  }

  const damageByTarget = new Map<string, ResolvedHit[]>();
  for (const hit of resolved) {
    if (hit.result !== "hit" || hit.damage <= 0) continue;
    const bucket = damageByTarget.get(hit.intent.targetActorId);
    if (bucket === undefined) damageByTarget.set(hit.intent.targetActorId, [hit]);
    else bucket.push(hit);
  }
  const damagedSurvivors = new Set<string>();
  for (const targetId of [...damageByTarget.keys()].sort(compareActorId)) {
    const target = state.actors.get(targetId)!;
    let hp = target.hp;
    const hits = damageByTarget.get(targetId)!.sort((a, b) => compareActorId(a.intent.actor.actorId, b.intent.actor.actorId));
    for (const hit of hits) {
      const before = hp;
      hp = Math.max(0, hp - hit.damage);
      facts.damage.push({
        sourceActorId: hit.intent.actor.actorId,
        targetActorId: targetId,
        skillId: hit.intent.skillId,
        amount: hit.damage,
        hpBefore: before,
        hpAfter: hp,
      });
    }
    target.hp = hp;
    invalidateForDamage(state, target, facts, abortActorIds);
    if (hp <= 0) target.action = { type: "dead" };
    else {
      target.action = { type: "idle" };
      target.protectedUntilTickExclusive = checkedAdd(checkedAdd(state.currentTick, definition.protectionTicks), 1);
      facts.protections.push({
        actorId: target.actorId,
        startTick: state.currentTick,
        protectedUntilTickExclusive: target.protectedUntilTickExclusive,
      });
      damagedSurvivors.add(target.actorId);
    }
  }

  for (const hit of resolved) {
    const actor = hit.intent.actor;
    if (actor.action.type !== "windup" || actor.action.generation !== hit.intent.generation || actor.hp <= 0) continue;
    const skill = findSkill(definition, actor.actorId, hit.intent.skillId);
    if (skill.recoveryTicks > 0) {
      const dueTick = checkedAdd(state.currentTick, skill.recoveryTicks);
      actor.action = { type: "recovery", generation: actor.actionGeneration, skillId: skill.skillId, completeTick: dueTick };
      scheduledEvents.push({
        type: "recovery_complete",
        eventId: nextId(state, "nextEventId", "event"),
        dueTick,
        actorId: actor.actorId,
        actionGeneration: actor.actionGeneration,
      });
    } else actor.action = { type: "idle" };
  }
  return damagedSurvivors;
}

function isTargetEligible(state: BattleState, actor: ActorRuntimeState, targetActorId: string): boolean {
  const target = state.actors.get(targetActorId);
  return target !== undefined && target.actorId !== actor.actorId && target.team !== actor.team && target.hp > 0 && target.action.type !== "dead";
}

function buildProjection(state: BattleState, effectStarts: readonly SkillEffectProjection[]): RenderProjection {
  return Object.freeze({
    sceneEpoch: state.sceneEpoch,
    tick: state.currentTick,
    actors: Object.freeze(sortedActors(state).map((actor) => Object.freeze({
      actorId: actor.actorId,
      tile: Object.freeze({ ...actor.tile }),
      direction: actor.direction,
      hp: actor.hp,
      maxHp: actor.maxHp,
      life: actor.action.type === "dead" ? "dead" as const : "alive" as const,
      movement: actor.action.type === "moving" ? Object.freeze({
        motionId: actor.action.motionId,
        from: Object.freeze({ ...actor.action.from }),
        to: Object.freeze({ ...actor.action.to }),
        startTick: actor.action.startTick,
        completeTick: actor.action.completeTick,
      }) : null,
    }))),
    effectStarts: Object.freeze([...effectStarts]),
  });
}

export function createSnapshot(state: BattleState): BattleSnapshot {
  const actors: ActorSnapshot[] = sortedActors(state).map((actor) => {
    const action = actor.action.type === "moving" ? {
      type: "moving" as const, motionId: actor.action.motionId, from: Object.freeze({ ...actor.action.from }), to: Object.freeze({ ...actor.action.to }),
      startTick: actor.action.startTick, completeTick: actor.action.completeTick,
    } : actor.action.type === "windup" ? {
      type: "windup" as const, skillId: actor.action.skillId, targetActorId: actor.action.targetActorId,
      startTick: actor.action.startTick, resolveTick: actor.action.resolveTick,
    } : actor.action.type === "recovery" ? {
      type: "recovery" as const, skillId: actor.action.skillId, completeTick: actor.action.completeTick,
    } : actor.action.type === "dead" ? { type: "dead" as const } : { type: "idle" as const };
    return Object.freeze({
      actorId: actor.actorId, team: actor.team, hp: actor.hp, maxHp: actor.maxHp,
      tile: Object.freeze({ ...actor.tile }), direction: actor.direction, action: Object.freeze(action),
      decision: actor.decision.type === "thinking" ? "thinking" as const : "none" as const,
      protectedUntilTickExclusive: actor.protectedUntilTickExclusive,
    });
  });
  const reservations = [...state.reservations.values()].sort((a, b) => compareActorId(a.actorId, b.actorId)).map((reservation) => Object.freeze({
    actorId: reservation.actorId,
    tile: Object.freeze({ ...reservation.tile }),
  }));
  return Object.freeze({
    battleId: state.battleId,
    sceneEpoch: state.sceneEpoch,
    currentTick: state.currentTick,
    tickDurationMs: 200,
    status: state.status,
    ...(state.status === "paused" ? { pauseReason: state.pauseReason! } : {}),
    actors: Object.freeze(actors),
    reservations: Object.freeze(reservations),
    ...(state.result === null ? {} : { result: Object.freeze(structuredClone(state.result)) }),
  });
}

export function createInitialProjection(state: BattleState): RenderProjection {
  return buildProjection(state, []);
}

export function processOneTick(
  definition: ResolvedBattleDefinition,
  state: BattleState,
  events: ScheduledEventQueue,
  inbox: DecisionInbox,
  priorReplayTicks: readonly ReplayTickRecord[],
  requestFacts: ReadonlyMap<string, DecisionRequest>,
): TickOutput {
  if (state.currentTick < 1) throw new Error("Tick must be advanced before processing");
  const facts: TickFacts = { movements: [], skills: [], damage: [], protections: [] };
  const scheduledEvents: BattleEvent[] = [];
  const commands: RequestDecisionCommand[] = [];
  const decisionRecords: ReplayDecisionRecord[] = [];
  const decisionHealthSignals: DecisionHealthSignal[] = [];
  const effectStarts: SkillEffectProjection[] = [];
  const abortActorIds = new Set<string>();
  const startedActionActors = new Set<string>();
  const due = events.takeDue(state.currentTick).filter((event) => validEvent(state, event)).sort(eventOrder);
  const completions = inbox.snapshotAndDrain().sort((left, right) => compareActorId(left.actorId, right.actorId)
    || compareActorId(left.completion.requestId, right.completion.requestId));

  const ordinarySkillIntents: SkillResolveIntent[] = [];
  for (const event of due) {
    const actor = state.actors.get(event.actorId)!;
    if (event.type === "move_complete" && actor.action.type === "moving") {
      state.reservations.delete(tileKey(actor.action.to));
      actor.tile = { ...actor.action.to };
      actor.action = { type: "idle" };
    } else if (event.type === "recovery_complete" && actor.action.type === "recovery") {
      actor.action = { type: "idle" };
    } else if (event.type === "skill_resolve" && actor.action.type === "windup") {
      ordinarySkillIntents.push({ actor, generation: actor.action.generation, skillId: actor.action.skillId, targetActorId: actor.action.targetActorId });
    }
  }

  let damaged: Set<string>;
  try {
    damaged = resolveBatch(definition, state, ordinarySkillIntents, facts, effectStarts, abortActorIds, scheduledEvents);
  } catch (error) {
    if (error instanceof SimulationFailure) return simulationFailureOutput(error.code);
    throw error;
  }
  let terminalCandidate = terminal(state);

  if (terminalCandidate === null) {
    for (const actorId of [...damaged].sort(compareActorId)) {
      const actor = state.actors.get(actorId)!;
      const command = ensureDecision(definition, state, actor, replayView(priorReplayTicks, state.currentTick, facts), "damaging_hit", state.currentTick);
      if (command !== null) commands.push(command);
    }

    for (const entry of completions) {
      const actor = state.actors.get(entry.actorId);
      if (actor === undefined || actor.decision.type !== "thinking"
        || actor.decision.requestId !== entry.completion.requestId || actor.decision.generation !== entry.completion.generation) {
        if (actor !== undefined) decisionRecords.push(staleDecisionRecord(actor, entry.completion, state.currentTick, requestFacts.get(entry.completion.requestId)));
        continue;
      }
      const decision = actor.decision;
      if (entry.completion.type === "failed") {
        actor.decision = { type: "none" };
        const outcome = entry.completion.error.category === "session_fatal" ? { type: "session_fatal" as const } : { type: "attempt_failed" as const };
        decisionRecords.push({
          actorId: actor.actorId, generation: decision.generation, attempt: decision.attempt,
          requestId: decision.requestId, requestTick: decision.requestTick, planningOrigin: { ...decision.planningOrigin }, consumedTick: state.currentTick,
          completion: { type: "failed", category: entry.completion.error.category, code: entry.completion.error.code }, consumeOutcome: outcome,
        });
        if (entry.completion.error.category === "session_fatal") {
          terminalCandidate = { type: "failure", source: "decision", code: entry.completion.error.code };
          break;
        }
        decisionHealthSignals.push("failure");
        actor.nextDecisionTick = checkedAdd(state.currentTick, 1);
        continue;
      }
      decisionHealthSignals.push("success");
      const validation = validatePlan(definition, state, actor, decision.planningOrigin, entry.completion.plan);
      if (!validation.accepted) {
        decisionRecords.push({
          actorId: actor.actorId, generation: decision.generation, attempt: decision.attempt,
          requestId: decision.requestId, requestTick: decision.requestTick, planningOrigin: { ...decision.planningOrigin }, consumedTick: state.currentTick,
          completion: { type: "completed", plan: structuredClone(entry.completion.plan) },
          consumeOutcome: { type: "rejected", rejectedTick: state.currentTick, reason: validation.reason },
        });
        if (decision.attempt === 0) {
          commands.push(makeCorrection(definition, state, actor, replayView(priorReplayTicks, state.currentTick, facts), entry.completion.plan, validation.reason));
        } else {
          actor.decision = { type: "none" };
          actor.nextDecisionTick = checkedAdd(state.currentTick, 1);
        }
        continue;
      }
      const accepted = acceptPlan(state, actor, validation.plan, decision.planningOrigin);
      actor.decision = { type: "none" };
      if (actor.action.type === "idle" && actor.activePlan === null) actor.activePlan = accepted;
      else if (actor.pendingPlan === null) actor.pendingPlan = accepted;
      else throw new Error("Accepted plan pipeline overflow");
      decisionRecords.push({
        actorId: actor.actorId, generation: decision.generation, attempt: decision.attempt,
        requestId: decision.requestId, requestTick: decision.requestTick, planningOrigin: { ...decision.planningOrigin }, consumedTick: state.currentTick,
        completion: { type: "completed", plan: validation.plan },
        consumeOutcome: { type: "accepted", acceptedTick: state.currentTick, planId: accepted.planId },
      });
    }
  }

  const movementIntents: MoveIntent[] = [];
  const instantSkills: SkillResolveIntent[] = [];
  if (terminalCandidate === null) {
    for (const actor of sortedActors(state)) {
      if (actor.action.type === "dead") continue;
      if (actor.action.type === "idle" && actor.activePlan === null && actor.pendingPlan !== null) {
        if (actor.tile.x !== actor.pendingPlan.planningOrigin.x || actor.tile.y !== actor.pendingPlan.planningOrigin.y) throw new Error("Pending plan planningOrigin invariant failed");
        actor.activePlan = actor.pendingPlan;
        actor.pendingPlan = null;
      }
      if (actor.action.type === "idle" && actor.activePlan !== null && !startedActionActors.has(actor.actorId)) {
        const plan = actor.activePlan;
        if (!plan.turnConsumed) {
          actor.direction = plan.turn!;
          plan.turnConsumed = true;
          startedActionActors.add(actor.actorId);
          if (!hasFutureIntent(plan)) {
            actor.activePlan = null;
            actor.nextDecisionTick = checkedAdd(state.currentTick, 1);
          }
        } else if (!plan.skillConsumed && !isTargetEligible(state, actor, plan.skill!.targetActorId)) {
          actor.activePlan = null;
          actor.nextDecisionTick = checkedAdd(state.currentTick, 1);
        } else if (!plan.skillConsumed) {
          const skill = findSkill(definition, actor.actorId, plan.skill!.skillId);
          const target = state.actors.get(plan.skill!.targetActorId)!;
          const coefficient = coefficientAt(skill, actor.tile, actor.direction, target.tile);
          if (coefficient >= plan.skill!.minCoefficientUnits && state.currentTick >= actor.protectedUntilTickExclusive) {
            actor.actionGeneration = increment(actor.actionGeneration);
            const resolveTick = checkedAdd(state.currentTick, skill.windupTicks);
            actor.action = {
              type: "windup", generation: actor.actionGeneration, skillId: skill.skillId,
              targetActorId: target.actorId, startTick: state.currentTick, resolveTick,
            };
            plan.skillConsumed = true;
            plan.pathCursor = plan.path.length;
            actor.activePlan = null;
            startedActionActors.add(actor.actorId);
            const command = ensureDecision(definition, state, actor, replayView(priorReplayTicks, state.currentTick, facts), "prefetch_after_materialize", state.currentTick);
            if (command !== null) commands.push(command);
            if (skill.windupTicks === 0) instantSkills.push({ actor, generation: actor.actionGeneration, skillId: skill.skillId, targetActorId: target.actorId });
            else scheduledEvents.push({
              type: "skill_resolve", eventId: nextId(state, "nextEventId", "event"), dueTick: resolveTick,
              actorId: actor.actorId, actionGeneration: actor.actionGeneration,
            });
          } else if (plan.pathCursor < plan.path.length) {
            movementIntents.push({ actor, plan, destination: plan.path[plan.pathCursor]! });
          } else if (coefficient < plan.skill!.minCoefficientUnits) {
            actor.activePlan = null;
            actor.nextDecisionTick = checkedAdd(state.currentTick, 1);
          }
        } else if (plan.pathCursor < plan.path.length) {
          movementIntents.push({ actor, plan, destination: plan.path[plan.pathCursor]! });
        } else {
          actor.activePlan = null;
          actor.nextDecisionTick = checkedAdd(state.currentTick, 1);
        }
      }
    }

    let instantDamaged: Set<string>;
    try {
      instantDamaged = resolveBatch(definition, state, instantSkills, facts, effectStarts, abortActorIds, scheduledEvents);
    } catch (error) {
      if (error instanceof SimulationFailure) return simulationFailureOutput(error.code);
      throw error;
    }
    terminalCandidate = terminal(state);
    if (terminalCandidate === null) {
      for (const actorId of [...instantDamaged].sort(compareActorId)) {
        const actor = state.actors.get(actorId)!;
        const command = ensureDecision(definition, state, actor, replayView(priorReplayTicks, state.currentTick, facts), "damaging_hit", state.currentTick);
        if (command !== null) commands.push(command);
      }
      applyMovement(definition, state, movementIntents, facts, scheduledEvents, commands, priorReplayTicks);
      for (const actor of sortedActors(state)) {
        if (actor.action.type === "idle" && actor.activePlan === null && actor.pendingPlan === null && actor.decision.type === "none" && state.currentTick >= actor.nextDecisionTick) {
          const command = ensureDecision(definition, state, actor, replayView(priorReplayTicks, state.currentTick, facts), "plan_exhausted", actor.nextDecisionTick);
          if (command !== null) commands.push(command);
        }
      }
    }
  }

  if (terminalCandidate !== null) {
    for (const command of commands) {
      const actor = state.actors.get(command.request.actorId);
      if (actor?.decision.type === "thinking" && actor.decision.requestId === command.request.requestId) actor.decision = { type: "none" };
    }
    commands.length = 0;
  }
  const finalReplayTick = replayTick(state.currentTick, facts);
  return Object.freeze({
    scheduledEvents: Object.freeze(scheduledEvents),
    decisionCommands: Object.freeze(commands),
    decisionRecords: Object.freeze(decisionRecords),
    decisionHealthSignals: Object.freeze(decisionHealthSignals),
    replayTick: finalReplayTick,
    projection: buildProjection(state, effectStarts),
    terminalCandidate,
    abortActorIds: Object.freeze([...abortActorIds].sort(compareActorId)),
  });

  function simulationFailureOutput(code: "BATTLE_COUNTER_OVERFLOW" | "BATTLE_NUMERIC_OVERFLOW"): TickOutput {
    for (const command of commands) {
      const actor = state.actors.get(command.request.actorId);
      if (actor?.decision.type === "thinking" && actor.decision.requestId === command.request.requestId) actor.decision = { type: "none" };
    }
    commands.length = 0;
    return Object.freeze({
      scheduledEvents: Object.freeze(scheduledEvents),
      decisionCommands: Object.freeze([]),
      decisionRecords: Object.freeze(decisionRecords),
      decisionHealthSignals: Object.freeze(decisionHealthSignals),
      replayTick: replayTick(state.currentTick, facts),
      projection: buildProjection(state, effectStarts),
      terminalCandidate: Object.freeze({ type: "failure", source: "simulation", code }),
      abortActorIds: Object.freeze([...abortActorIds].sort(compareActorId)),
    });
  }
}

function staleDecisionRecord(
  actor: ActorRuntimeState,
  completion: DecisionCompletion,
  tick: number,
  request: DecisionRequest | undefined,
): ReplayDecisionRecord {
  if (request === undefined) throw new Error("Missing stale Decision request facts");
  const attempt = request.correction === undefined ? 0 as const : 1 as const;
  return {
    actorId: actor.actorId,
    generation: completion.generation,
    attempt,
    requestId: completion.requestId,
    requestTick: request.observation.tick,
    planningOrigin: { ...request.planningOrigin },
    consumedTick: tick,
    completion: completion.type === "completed"
      ? { type: "completed", plan: structuredClone(completion.plan) }
      : { type: "failed", category: completion.error.category, code: completion.error.code },
    consumeOutcome: { type: "stale" },
  };
}

function applyMovement(
  definition: ResolvedBattleDefinition,
  state: BattleState,
  intents: readonly MoveIntent[],
  facts: TickFacts,
  scheduledEvents: BattleEvent[],
  commands: RequestDecisionCommand[],
  priorReplayTicks: readonly ReplayTickRecord[],
): void {
  const failures = new Map<string, MovementFailureReason>();
  const candidates = [...intents].filter((intent) => intent.actor.hp > 0 && intent.actor.action.type === "idle" && intent.actor.activePlan === intent.plan);
  for (const intent of candidates) {
    const tile = intent.destination;
    if (tile.x < 0 || tile.y < 0 || tile.x >= definition.map.width || tile.y >= definition.map.height || !definition.map.passable[tile.y]![tile.x]) failures.set(intent.actor.actorId, "blocked");
  }
  for (const left of candidates) for (const right of candidates) {
    if (left.actor.actorId >= right.actor.actorId || failures.has(left.actor.actorId) || failures.has(right.actor.actorId)) continue;
    if (left.destination.x === right.actor.tile.x && left.destination.y === right.actor.tile.y
      && right.destination.x === left.actor.tile.x && right.destination.y === left.actor.tile.y) {
      failures.set(left.actor.actorId, "swap_forbidden");
      failures.set(right.actor.actorId, "swap_forbidden");
    }
  }
  for (const intent of candidates) {
    if (failures.has(intent.actor.actorId)) continue;
    if ([...state.actors.values()].some((actor) => actor.actorId !== intent.actor.actorId && actor.tile.x === intent.destination.x && actor.tile.y === intent.destination.y)) {
      failures.set(intent.actor.actorId, "occupied");
    } else if (state.reservations.has(tileKey(intent.destination))) failures.set(intent.actor.actorId, "reserved");
  }
  const groups = new Map<string, MoveIntent[]>();
  for (const intent of candidates) {
    if (failures.has(intent.actor.actorId)) continue;
    const key = tileKey(intent.destination);
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [intent]); else bucket.push(intent);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const competitors = group.map((item) => item.actor.actorId).sort(compareActorId);
    const winner = contentionWinner(definition.battleSeed, state.currentTick, group[0]!.destination, competitors);
    facts.movements.push({ type: "contention", tile: { ...group[0]!.destination }, competitors, winnerActorId: winner });
    for (const intent of group) if (intent.actor.actorId !== winner) failures.set(intent.actor.actorId, "contested");
  }
  for (const intent of candidates.sort((a, b) => compareActorId(a.actor.actorId, b.actor.actorId))) {
    const reason = failures.get(intent.actor.actorId);
    if (reason !== undefined) {
      facts.movements.push({ type: "move_failed", actorId: intent.actor.actorId, tile: { ...intent.destination }, reason });
      intent.actor.activePlan = null;
      intent.actor.nextDecisionTick = checkedAdd(state.currentTick, 1);
      continue;
    }
    const actor = intent.actor;
    actor.actionGeneration = increment(actor.actionGeneration);
    const motionId = actor.nextMotionId;
    actor.nextMotionId = increment(actor.nextMotionId);
    const completeTick = checkedAdd(state.currentTick, definition.moveTicks);
    actor.direction = directionForMove(actor.tile, intent.destination);
    actor.action = {
      type: "moving", generation: actor.actionGeneration, motionId,
      from: { ...actor.tile }, to: { ...intent.destination }, startTick: state.currentTick, completeTick,
    };
    state.reservations.set(tileKey(intent.destination), { actorId: actor.actorId, tile: { ...intent.destination }, actionGeneration: actor.actionGeneration });
    intent.plan.pathCursor += 1;
    scheduledEvents.push({
      type: "move_complete", eventId: nextId(state, "nextEventId", "event"), dueTick: completeTick,
      actorId: actor.actorId, actionGeneration: actor.actionGeneration,
    });
    facts.movements.push({ type: "move_started", actorId: actor.actorId, from: { ...actor.tile }, to: { ...intent.destination }, motionId });
    if (!hasFutureIntent(intent.plan)) {
      actor.activePlan = null;
      const command = ensureDecision(definition, state, actor, replayView(priorReplayTicks, state.currentTick, facts), "prefetch_after_materialize", state.currentTick);
      if (command !== null) commands.push(command);
    }
  }
}
