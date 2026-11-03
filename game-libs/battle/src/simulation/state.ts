import {
  assertActorId,
  type ActorId,
  type BattleResult,
  type BattlePauseReason,
  type BattleStatus,
  type BattleArenaRef,
  type Direction,
  type GridPosition,
  type PlanSubmission,
  type ResourceRef,
  type ResolvedRangeMatrix,
  type Team,
  validateBattleArenaRef,
  validateResourceRef,
} from "../contracts.js";

export interface ResolvedBattleSkill {
  readonly skillId: string;
  readonly baseDamage: number;
  readonly windupTicks: number;
  readonly recoveryTicks: number;
  readonly range: ResolvedRangeMatrix;
  readonly effect: string;
}

export interface ResolvedBattleActor {
  readonly actorId: ActorId;
  readonly team: Team;
  readonly tile: GridPosition;
  readonly direction: Direction;
  readonly maxHp: number;
  readonly initialHp?: number;
  readonly character: ResourceRef;
  readonly skills: readonly ResolvedBattleSkill[];
}

export interface ResolvedBattleDefinition {
  readonly battleId: string;
  readonly sceneEpoch: number;
  readonly battleSeed: string | number;
  readonly tickDurationMs: 200;
  readonly moveTicks: number;
  readonly protectionTicks: number;
  readonly maxPathSteps: number;
  readonly map: {
    readonly ref: BattleArenaRef;
    readonly width: number;
    readonly height: number;
    readonly passable: readonly (readonly boolean[])[];
  };
  readonly actors: readonly ResolvedBattleActor[];
}

export type ActionState =
  | { type: "idle" }
  | {
      type: "moving";
      generation: number;
      motionId: number;
      from: GridPosition;
      to: GridPosition;
      startTick: number;
      completeTick: number;
    }
  | {
      type: "windup";
      generation: number;
      skillId: string;
      targetActorId: ActorId;
      startTick: number;
      resolveTick: number;
    }
  | { type: "recovery"; generation: number; skillId: string; completeTick: number }
  | { type: "dead" };

export type DecisionState =
  | { type: "none" }
  | {
      type: "thinking";
      generation: number;
      requestId: string;
      attempt: 0 | 1;
      requestTick: number;
      planningOrigin: GridPosition;
    };

export interface AcceptedPlan {
  readonly planId: string;
  readonly decisionGeneration: number;
  readonly planningOrigin: GridPosition;
  readonly turn?: Direction;
  readonly path: readonly GridPosition[];
  readonly skill?: {
    readonly skillId: string;
    readonly targetActorId: ActorId;
    readonly minCoefficientUnits: number;
  };
  turnConsumed: boolean;
  pathCursor: number;
  skillConsumed: boolean;
}

export interface ActorRuntimeState {
  actorId: ActorId;
  team: Team;
  hp: number;
  maxHp: number;
  tile: GridPosition;
  direction: Direction;
  action: ActionState;
  decision: DecisionState;
  activePlan: AcceptedPlan | null;
  pendingPlan: AcceptedPlan | null;
  protectedUntilTickExclusive: number;
  actionGeneration: number;
  decisionGeneration: number;
  nextMotionId: number;
  nextDecisionTick: number;
}

export interface Reservation {
  actorId: ActorId;
  tile: GridPosition;
  actionGeneration: number;
}

export interface BattleState {
  battleId: string;
  sceneEpoch: number;
  currentTick: number;
  status: BattleStatus;
  pauseReason: BattlePauseReason | null;
  actors: Map<ActorId, ActorRuntimeState>;
  reservations: Map<string, Reservation>;
  result: BattleResult | null;
  nextPlanId: number;
  nextRequestId: number;
  nextEventId: number;
  nextEffectOccurrenceId: number;
}

function exact(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== fields.length || fields.some((field) => !Object.hasOwn(record, field))) {
    throw new TypeError(`${label} has an invalid field set`);
  }
  return record;
}

function unicodeString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new TypeError(`${label} must contain Unicode scalar values`);
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError(`${label} must contain Unicode scalar values`);
    }
  }
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
  }
  return Number(value);
}

function position(value: unknown, label: string): GridPosition {
  const record = exact(value, ["x", "y"], label);
  return Object.freeze({ x: integer(record.x, `${label}.x`), y: integer(record.y, `${label}.y`) });
}

function range(value: unknown, label: string): ResolvedRangeMatrix {
  const record = exact(value, ["width", "height", "originX", "originY", "coefficientUnits"], label);
  const width = integer(record.width, `${label}.width`, 1);
  const height = integer(record.height, `${label}.height`, 1);
  const originX = integer(record.originX, `${label}.originX`);
  const originY = integer(record.originY, `${label}.originY`);
  if (originX >= width || originY >= height || !Array.isArray(record.coefficientUnits) || record.coefficientUnits.length !== height) {
    throw new TypeError(`${label} dimensions/origin are invalid`);
  }
  const rows = Object.freeze(record.coefficientUnits.map((rawRow, y) => {
    if (!Array.isArray(rawRow) || rawRow.length !== width) throw new TypeError(`${label}.coefficientUnits[${y}] has invalid width`);
    return Object.freeze(rawRow.map((cell, x) => integer(cell, `${label}.coefficientUnits[${y}][${x}]`)));
  }));
  if (rows[originY]![originX] !== 0) throw new TypeError(`${label} origin coefficient must be zero`);
  return Object.freeze({ width, height, originX, originY, coefficientUnits: rows });
}

function direction(value: unknown, label: string): Direction {
  if (value !== 2 && value !== 4 && value !== 6 && value !== 8) throw new TypeError(`${label} must be 2, 4, 6, or 8`);
  return value;
}

export function validateResolvedBattleDefinition(value: unknown): ResolvedBattleDefinition {
  const record = exact(value, [
    "battleId", "sceneEpoch", "battleSeed", "tickDurationMs", "moveTicks", "protectionTicks", "maxPathSteps", "map", "actors",
  ], "ResolvedBattleDefinition");
  const battleId = unicodeString(record.battleId, "battleId");
  const sceneEpoch = integer(record.sceneEpoch, "sceneEpoch", 1);
  const battleSeed = typeof record.battleSeed === "string"
    ? unicodeString(record.battleSeed, "battleSeed")
    : (() => {
        if (!Number.isSafeInteger(record.battleSeed)) throw new TypeError("battleSeed must be a non-empty string or safe integer");
        return Number(record.battleSeed);
      })();
  if (record.tickDurationMs !== 200) throw new TypeError("tickDurationMs must be 200");
  const moveTicks = integer(record.moveTicks, "moveTicks", 1);
  const protectionTicks = integer(record.protectionTicks, "protectionTicks");
  const maxPathSteps = integer(record.maxPathSteps, "maxPathSteps");

  const rawMap = exact(record.map, ["ref", "width", "height", "passable"], "map");
  const width = integer(rawMap.width, "map.width", 1);
  const height = integer(rawMap.height, "map.height", 1);
  if (!Array.isArray(rawMap.passable) || rawMap.passable.length !== height) throw new TypeError("map.passable height is invalid");
  const passable = Object.freeze(rawMap.passable.map((rawRow, y) => {
    if (!Array.isArray(rawRow) || rawRow.length !== width || rawRow.some((cell) => typeof cell !== "boolean")) {
      throw new TypeError(`map.passable[${y}] is invalid`);
    }
    return Object.freeze([...rawRow] as boolean[]);
  }));

  if (!Array.isArray(record.actors) || record.actors.length !== 2) throw new TypeError("actors must contain exactly two actors");
  const actorIds = new Set<string>();
  const teams = new Set<Team>();
  const tiles = new Set<string>();
  const actors = Object.freeze(record.actors.map((rawActor, actorIndex): ResolvedBattleActor => {
    const label = `actors[${actorIndex}]`;
    const hasInitialHp = rawActor !== null
      && typeof rawActor === "object"
      && !Array.isArray(rawActor)
      && Object.hasOwn(rawActor, "initialHp");
    const actor = exact(rawActor, hasInitialHp
      ? ["actorId", "team", "tile", "direction", "maxHp", "initialHp", "character", "skills"]
      : ["actorId", "team", "tile", "direction", "maxHp", "character", "skills"], label);
    assertActorId(actor.actorId);
    if (actorIds.has(actor.actorId)) throw new TypeError("actorId must be unique");
    actorIds.add(actor.actorId);
    if (actor.team !== "ally" && actor.team !== "enemy") throw new TypeError(`${label}.team is invalid`);
    teams.add(actor.team);
    const tile = position(actor.tile, `${label}.tile`);
    if (tile.x >= width || tile.y >= height || !passable[tile.y]![tile.x]) throw new TypeError(`${label}.tile is not passable and in bounds`);
    const tileKey = `${tile.x},${tile.y}`;
    if (tiles.has(tileKey)) throw new TypeError("initial actor tiles must be unique");
    tiles.add(tileKey);
    if (!Array.isArray(actor.skills)) throw new TypeError(`${label}.skills must be an array`);
    const skillIds = new Set<string>();
    const skills = Object.freeze(actor.skills.map((rawSkill, skillIndex): ResolvedBattleSkill => {
      const skillLabel = `${label}.skills[${skillIndex}]`;
      const skill = exact(rawSkill, ["skillId", "baseDamage", "windupTicks", "recoveryTicks", "range", "effect"], skillLabel);
      const skillId = unicodeString(skill.skillId, `${skillLabel}.skillId`);
      if (skillIds.has(skillId)) throw new TypeError(`${label}.skillId must be unique`);
      skillIds.add(skillId);
      return Object.freeze({
        skillId,
        baseDamage: integer(skill.baseDamage, `${skillLabel}.baseDamage`),
        windupTicks: integer(skill.windupTicks, `${skillLabel}.windupTicks`),
        recoveryTicks: integer(skill.recoveryTicks, `${skillLabel}.recoveryTicks`),
        range: range(skill.range, `${skillLabel}.range`),
        effect: unicodeString(skill.effect, `${skillLabel}.effect`),
      });
    }));
    const maxHp = integer(actor.maxHp, `${label}.maxHp`, 1);
    const initialHp = hasInitialHp ? integer(actor.initialHp, `${label}.initialHp`, 1) : undefined;
    if (initialHp !== undefined && initialHp > maxHp) throw new TypeError(`${label}.initialHp must be <= maxHp`);
    return Object.freeze({
      actorId: actor.actorId,
      team: actor.team,
      tile,
      direction: direction(actor.direction, `${label}.direction`),
      maxHp,
      ...(initialHp === undefined ? {} : { initialHp }),
      character: validateResourceRef(actor.character, `${label}.character`),
      skills,
    });
  }));
  if (!teams.has("ally") || !teams.has("enemy")) throw new TypeError("actors must contain exactly one ally and one enemy");

  return Object.freeze({
    battleId,
    sceneEpoch,
    battleSeed,
    tickDurationMs: 200,
    moveTicks,
    protectionTicks,
    maxPathSteps,
    map: Object.freeze({ ref: validateBattleArenaRef(rawMap.ref), width, height, passable }),
    actors,
  });
}

export function createInitialState(definition: ResolvedBattleDefinition): BattleState {
  const actors = new Map<ActorId, ActorRuntimeState>();
  for (const actor of definition.actors) {
    actors.set(actor.actorId, {
      actorId: actor.actorId,
      team: actor.team,
      hp: actor.initialHp ?? actor.maxHp,
      maxHp: actor.maxHp,
      tile: { ...actor.tile },
      direction: actor.direction,
      action: { type: "idle" },
      decision: { type: "none" },
      activePlan: null,
      pendingPlan: null,
      protectedUntilTickExclusive: 0,
      actionGeneration: 0,
      decisionGeneration: 0,
      nextMotionId: 1,
      nextDecisionTick: 0,
    });
  }
  return {
    battleId: definition.battleId,
    sceneEpoch: definition.sceneEpoch,
    currentTick: 0,
    status: "created",
    pauseReason: null,
    actors,
    reservations: new Map(),
    result: null,
    nextPlanId: 1,
    nextRequestId: 1,
    nextEventId: 1,
    nextEffectOccurrenceId: 1,
  };
}

export function tileKey(tile: GridPosition): string {
  return `${tile.x},${tile.y}`;
}

export function copyPlanSubmission(plan: PlanSubmission): PlanSubmission {
  return Object.freeze({
    ...(plan.turn === undefined ? {} : { turn: plan.turn }),
    path: Object.freeze(plan.path.map((tile) => Object.freeze({ x: tile.x, y: tile.y }))),
    ...(plan.skill === undefined ? {} : {
      skill: Object.freeze({
        skillId: plan.skill.skillId,
        targetActorId: plan.skill.targetActorId,
        minCoefficient: plan.skill.minCoefficient,
      }),
    }),
  });
}
