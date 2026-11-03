export type ActorId = string;
export type Team = "ally" | "enemy";
export type Direction = 2 | 4 | 6 | 8;

export interface GridPosition {
  readonly x: number;
  readonly y: number;
}

export interface ResourceRef {
  readonly namespace: string;
  readonly key: string;
  readonly contentVersion?: string;
}

export interface ResolvedResourceRef {
  readonly namespace: string;
  readonly key: string;
  readonly contentVersion: string;
}

export interface BattleArenaRef {
  readonly arenaId: string;
}

export interface BattleActorRenderInit {
  readonly actorId: ActorId;
  readonly team: Team;
  readonly character: ResourceRef;
}

export interface BattleSceneInit {
  readonly battleId: string;
  readonly sceneEpoch: number;
  readonly tickDurationMs: 200;
  readonly map: BattleArenaRef;
  readonly actors: readonly BattleActorRenderInit[];
  readonly effectIds: readonly string[];
}

export interface MovementProjection {
  readonly motionId: number;
  readonly from: GridPosition;
  readonly to: GridPosition;
  readonly startTick: number;
  readonly completeTick: number;
}

export interface ActorRenderProjection {
  readonly actorId: ActorId;
  readonly tile: GridPosition;
  readonly direction: Direction;
  readonly hp: number;
  readonly maxHp: number;
  readonly life: "alive" | "dead";
  readonly movement: MovementProjection | null;
}

export interface SkillEffectProjection {
  readonly effectId: string;
  readonly result: "hit" | "immune" | "miss" | "invalid";
  readonly effect: string;
  readonly tile: GridPosition | null;
  readonly startTick: number;
}

export interface RenderProjection {
  readonly sceneEpoch: number;
  readonly tick: number;
  readonly actors: readonly ActorRenderProjection[];
  readonly effectStarts: readonly SkillEffectProjection[];
}

export type PresentationErrorCode =
  | "PRESENTATION_INVALID_STATE"
  | "PRESENTATION_SCENE_MISMATCH"
  | "PRESENTATION_PROJECTION_CONFLICT"
  | "PRESENTATION_CONTENT_FAILED"
  | "PRESENTATION_COMMIT_FAILED"
  | "PRESENTATION_INVALID_DATA";

export interface PresentationFailure {
  readonly code: PresentationErrorCode;
  readonly message: string;
}

export interface BattleEffectContent {
  readonly id: string;
  readonly image: {
    readonly namespace: "resource.Graphics";
    readonly key: string;
  };
  readonly anchor: "tile-center";
  readonly timing: {
    readonly fade_in_ticks: number;
    readonly hold_ticks: number;
    readonly fade_out_ticks: number;
  };
}

export interface PresentationPort {
  readonly failure: Promise<PresentationFailure>;
  initialize(scene: BattleSceneInit): Promise<void>;
  render(projection: RenderProjection): void;
  pause(): void;
  resume(): void;
  close(): void;
}

export interface ResolvedRangeMatrix {
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  readonly coefficientUnits: readonly (readonly number[])[];
}

export interface PlanConstraints {
  readonly maxPathSteps: number;
  readonly movement: { readonly cardinalOnly: true };
  readonly turn: { readonly allowed: true };
  readonly skills: readonly {
    readonly skillId: string;
    readonly minCoefficients: readonly number[];
  }[];
}

export interface PlanSubmission {
  readonly turn?: Direction;
  readonly path: readonly GridPosition[];
  readonly skill?: {
    readonly skillId: string;
    readonly targetActorId: ActorId;
    readonly minCoefficient: number;
  };
}

export type PlanRejectReason =
  | "invalid_plan_shape"
  | "path_too_long"
  | "path_out_of_bounds"
  | "path_not_adjacent"
  | "terrain_blocked"
  | "invalid_turn"
  | "turn_with_path"
  | "unknown_skill"
  | "invalid_target"
  | "invalid_min_coefficient";

export type SkillResolveResult = "hit" | "immune" | "miss" | "invalid";
export type MovementFailureReason = "blocked" | "occupied" | "reserved" | "contested" | "swap_forbidden";

export type ObservedAction =
  | { readonly type: "idle" }
  | {
      readonly type: "moving";
      readonly from: GridPosition;
      readonly to: GridPosition;
      readonly startTick: number;
      readonly completeTick: number;
    }
  | {
      readonly type: "windup";
      readonly skillId: string;
      readonly targetActorId: ActorId;
      readonly startTick: number;
      readonly resolveTick: number;
    }
  | { readonly type: "recovery"; readonly skillId: string; readonly completeTick: number }
  | { readonly type: "dead" };

export interface ObservedSkill {
  readonly skillId: string;
  readonly baseDamage: number;
  readonly windupTicks: number;
  readonly recoveryTicks: number;
  readonly range: ResolvedRangeMatrix;
}

export interface ObservedActor {
  readonly actorId: ActorId;
  readonly team: Team;
  readonly hp: number;
  readonly maxHp: number;
  readonly tile: GridPosition;
  readonly direction: Direction;
  readonly action: ObservedAction;
  readonly protectedUntilTickExclusive: number;
  readonly skills: readonly ObservedSkill[];
}

export type ObservedEvent =
  | {
      readonly type: "move_failed";
      readonly tick: number;
      readonly actorId: ActorId;
      readonly tile: GridPosition;
      readonly reason: MovementFailureReason;
    }
  | {
      readonly type: "move_interrupted";
      readonly tick: number;
      readonly actorId: ActorId;
      readonly reason: "damaging_hit";
    }
  | {
      readonly type: "skill_resolved";
      readonly tick: number;
      readonly casterActorId: ActorId;
      readonly targetActorId: ActorId;
      readonly skillId: string;
      readonly result: SkillResolveResult;
      readonly coefficientUnits: number;
      readonly finalDamage: number;
    }
  | {
      readonly type: "protection_started";
      readonly tick: number;
      readonly actorId: ActorId;
      readonly protectedUntilTickExclusive: number;
    };

export interface BattleObservation {
  readonly tick: number;
  readonly selfActorId: ActorId;
  readonly actors: readonly ObservedActor[];
  readonly map: {
    readonly width: number;
    readonly height: number;
    readonly passable: readonly (readonly boolean[])[];
  };
  readonly recentEvents: readonly ObservedEvent[];
}

export interface DecisionRequest {
  readonly requestId: string;
  readonly actorId: ActorId;
  readonly generation: number;
  readonly planningOrigin: GridPosition;
  readonly observation: BattleObservation;
  readonly constraints: PlanConstraints;
  readonly correction?: {
    readonly rejectedPlan: PlanSubmission;
    readonly reason: PlanRejectReason;
  };
}

export interface DecisionFailure {
  readonly category: "attempt_failure" | "session_fatal";
  readonly code: string;
  readonly metadata?: unknown;
}

export type DecisionCompletion =
  | {
      readonly type: "completed";
      readonly requestId: string;
      readonly generation: number;
      readonly plan: PlanSubmission;
    }
  | {
      readonly type: "failed";
      readonly requestId: string;
      readonly generation: number;
      readonly error: DecisionFailure;
    };

export interface DecisionPort {
  decide(request: DecisionRequest, signal: AbortSignal): Promise<DecisionCompletion>;
}

export type BattleResult =
  | { readonly type: "ally_win" }
  | { readonly type: "enemy_win" }
  | { readonly type: "simultaneous_defeat" }
  | { readonly type: "cancelled" }
  | {
      readonly type: "failure";
      readonly source: "simulation" | "decision" | "presentation";
      readonly code: string;
    };

export type BattleStatus = "created" | "initializing" | "running" | "paused" | "settled" | "closed";

export interface BattleTransition {
  readonly from: BattleStatus;
  readonly to: BattleStatus;
}

export type BattlePauseReason = "host-background" | "decision-circuit";

export interface BattlePauseEvent {
  readonly reason: BattlePauseReason;
}

export type ActorSnapshotAction =
  | { readonly type: "idle" }
  | {
      readonly type: "moving";
      readonly motionId: number;
      readonly from: GridPosition;
      readonly to: GridPosition;
      readonly startTick: number;
      readonly completeTick: number;
    }
  | {
      readonly type: "windup";
      readonly skillId: string;
      readonly targetActorId: ActorId;
      readonly startTick: number;
      readonly resolveTick: number;
    }
  | { readonly type: "recovery"; readonly skillId: string; readonly completeTick: number }
  | { readonly type: "dead" };

export interface ActorSnapshot {
  readonly actorId: ActorId;
  readonly team: Team;
  readonly hp: number;
  readonly maxHp: number;
  readonly tile: GridPosition;
  readonly direction: Direction;
  readonly action: ActorSnapshotAction;
  readonly decision: "none" | "thinking";
  readonly protectedUntilTickExclusive: number;
}

export interface ReservationSnapshot {
  readonly actorId: ActorId;
  readonly tile: GridPosition;
}

export interface BattleSnapshot {
  readonly battleId: string;
  readonly sceneEpoch: number;
  readonly currentTick: number;
  readonly tickDurationMs: 200;
  readonly status: BattleStatus;
  readonly pauseReason?: BattlePauseReason;
  readonly actors: readonly ActorSnapshot[];
  readonly reservations: readonly ReservationSnapshot[];
  readonly result?: BattleResult;
}

const encoder = new TextEncoder();

export function compareActorId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isUnicodeScalarString(value: string): boolean {
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

export function assertActorId(value: unknown): asserts value is ActorId {
  if (typeof value !== "string" || !isUnicodeScalarString(value)) {
    throw new TypeError("ActorId must be a Unicode scalar string of 1..115 UTF-8 bytes");
  }
  const byteLength = encoder.encode(value).byteLength;
  if (byteLength < 1 || byteLength > 115) {
    throw new TypeError("ActorId must be a Unicode scalar string of 1..115 UTF-8 bytes");
  }
}

function exact(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== fields.length || fields.some((field) => !Object.prototype.hasOwnProperty.call(record, field))) {
    throw new TypeError(`${label} has an invalid field set`);
  }
  return record;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
  }
  return Number(value);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || !isUnicodeScalarString(value)) {
    throw new TypeError(`${label} must be a non-empty Unicode scalar string`);
  }
  return value;
}

function point(value: unknown, label: string): GridPosition {
  const item = exact(value, ["x", "y"], label);
  return Object.freeze({
    x: safeInteger(item.x, `${label}.x`),
    y: safeInteger(item.y, `${label}.y`),
  });
}

export function validateResourceRef(value: unknown, label = "ResourceRef"): ResourceRef {
  const hasContentVersion = value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.prototype.hasOwnProperty.call(value, "contentVersion");
  const item = exact(
    value,
    hasContentVersion ? ["namespace", "key", "contentVersion"] : ["namespace", "key"],
    label,
  );
  const namespace = nonEmptyString(item.namespace, `${label}.namespace`);
  const key = nonEmptyString(item.key, `${label}.key`);
  if (!hasContentVersion) return Object.freeze({ namespace, key });
  return Object.freeze({
    namespace,
    key,
    contentVersion: nonEmptyString(item.contentVersion, `${label}.contentVersion`),
  });
}

export function validateBattleArenaRef(value: unknown): BattleArenaRef {
  const item = exact(value, ["arenaId"], "BattleArenaRef");
  return Object.freeze({ arenaId: nonEmptyString(item.arenaId, "BattleArenaRef.arenaId") });
}

export function validateBattleEffectContent(value: unknown, recordKey: string): BattleEffectContent {
  const item = exact(value, ["id", "image", "anchor", "timing"], "BattleEffect");
  const image = exact(item.image, ["namespace", "key"], "BattleEffect.image");
  const timing = exact(
    item.timing,
    ["fade_in_ticks", "hold_ticks", "fade_out_ticks"],
    "BattleEffect.timing",
  );
  const id = nonEmptyString(item.id, "BattleEffect.id");
  const imageKey = nonEmptyString(image.key, "BattleEffect.image.key");
  const fadeInTicks = safeInteger(timing.fade_in_ticks, "fade_in_ticks");
  const holdTicks = safeInteger(timing.hold_ticks, "hold_ticks");
  const fadeOutTicks = safeInteger(timing.fade_out_ticks, "fade_out_ticks");
  if (
    id !== recordKey
    || image.namespace !== "resource.Graphics"
    || !imageKey.startsWith("BattleEffects/")
    || item.anchor !== "tile-center"
    || fadeInTicks + holdTicks + fadeOutTicks === 0
  ) {
    throw new TypeError("Invalid BattleEffect content");
  }
  return Object.freeze({
    id,
    image: Object.freeze({ namespace: "resource.Graphics", key: imageKey }),
    anchor: "tile-center",
    timing: Object.freeze({
      fade_in_ticks: fadeInTicks,
      hold_ticks: holdTicks,
      fade_out_ticks: fadeOutTicks,
    }),
  });
}

export function validateBattleSceneInit(value: unknown): BattleSceneInit {
  const item = exact(
    value,
    ["battleId", "sceneEpoch", "tickDurationMs", "map", "actors", "effectIds"],
    "BattleSceneInit",
  );
  const battleId = nonEmptyString(item.battleId, "BattleSceneInit.battleId");
  const sceneEpoch = safeInteger(item.sceneEpoch, "BattleSceneInit.sceneEpoch", 1);
  if (item.tickDurationMs !== 200) {
    throw new TypeError("BattleSceneInit.tickDurationMs must be 200");
  }
  if (!Array.isArray(item.actors) || item.actors.length === 0 || !Array.isArray(item.effectIds)) {
    throw new TypeError("BattleSceneInit actors must be non-empty and effectIds must be an array");
  }

  const actorIds = new Set<string>();
  const actors = Object.freeze(item.actors.map((raw, index) => {
    const label = `BattleSceneInit.actors[${index}]`;
    const actor = exact(raw, ["actorId", "team", "character"], label);
    assertActorId(actor.actorId);
    if (actorIds.has(actor.actorId)) throw new TypeError("Duplicate actorId");
    actorIds.add(actor.actorId);
    if (actor.team !== "ally" && actor.team !== "enemy") {
      throw new TypeError(`${label}.team must be ally or enemy`);
    }
    return Object.freeze({
      actorId: actor.actorId,
      team: actor.team,
      character: validateResourceRef(actor.character, `${label}.character`),
    });
  }));

  let previous: string | undefined;
  const effectIds = Object.freeze(item.effectIds.map((raw, index) => {
    const id = nonEmptyString(raw, `BattleSceneInit.effectIds[${index}]`);
    if (previous !== undefined && compareActorId(previous, id) >= 0) {
      throw new TypeError("effectIds must be unique and ordinal-sorted");
    }
    previous = id;
    return id;
  }));

  return Object.freeze({
    battleId,
    sceneEpoch,
    tickDurationMs: 200,
    map: validateBattleArenaRef(item.map),
    actors,
    effectIds,
  });
}

export function validateRenderProjection(value: unknown): RenderProjection {
  const item = exact(value, ["sceneEpoch", "tick", "actors", "effectStarts"], "RenderProjection");
  const sceneEpoch = safeInteger(item.sceneEpoch, "RenderProjection.sceneEpoch", 1);
  const tick = safeInteger(item.tick, "RenderProjection.tick");
  if (!Array.isArray(item.actors) || !Array.isArray(item.effectStarts)) {
    throw new TypeError("RenderProjection actors/effectStarts must be arrays");
  }

  const actorIds = new Set<string>();
  const actors = Object.freeze(item.actors.map((raw, index): ActorRenderProjection => {
    const label = `RenderProjection.actors[${index}]`;
    const actor = exact(raw, ["actorId", "tile", "direction", "hp", "maxHp", "life", "movement"], label);
    assertActorId(actor.actorId);
    if (actorIds.has(actor.actorId)) throw new TypeError("Duplicate projected actorId");
    actorIds.add(actor.actorId);
    if (actor.direction !== 2 && actor.direction !== 4 && actor.direction !== 6 && actor.direction !== 8) {
      throw new TypeError(`${label}.direction is invalid`);
    }
    const hp = safeInteger(actor.hp, `${label}.hp`);
    const maxHp = safeInteger(actor.maxHp, `${label}.maxHp`, 1);
    if (hp > maxHp || (actor.life !== "alive" && actor.life !== "dead")) {
      throw new TypeError(`${label} health/life is invalid`);
    }

    let movement: MovementProjection | null = null;
    if (actor.movement !== null) {
      const rawMovement = exact(
        actor.movement,
        ["motionId", "from", "to", "startTick", "completeTick"],
        `${label}.movement`,
      );
      const startTick = safeInteger(rawMovement.startTick, `${label}.movement.startTick`);
      const completeTick = safeInteger(rawMovement.completeTick, `${label}.movement.completeTick`);
      if (completeTick <= startTick) throw new TypeError(`${label}.movement ticks are invalid`);
      movement = Object.freeze({
        motionId: safeInteger(rawMovement.motionId, `${label}.movement.motionId`, 1),
        from: point(rawMovement.from, `${label}.movement.from`),
        to: point(rawMovement.to, `${label}.movement.to`),
        startTick,
        completeTick,
      });
    }

    return Object.freeze({
      actorId: actor.actorId,
      tile: point(actor.tile, `${label}.tile`),
      direction: actor.direction,
      hp,
      maxHp,
      life: actor.life,
      movement,
    });
  }));

  const effectIds = new Set<string>();
  const effectStarts = Object.freeze(item.effectStarts.map((raw, index): SkillEffectProjection => {
    const label = `RenderProjection.effectStarts[${index}]`;
    const effect = exact(raw, ["effectId", "result", "effect", "tile", "startTick"], label);
    const effectId = nonEmptyString(effect.effectId, `${label}.effectId`);
    if (effectIds.has(effectId)) throw new TypeError("Duplicate projected effectId");
    effectIds.add(effectId);
    if (effect.result !== "hit" && effect.result !== "immune" && effect.result !== "miss" && effect.result !== "invalid") {
      throw new TypeError(`${label}.result is invalid`);
    }
    const tile = effect.tile === null ? null : point(effect.tile, `${label}.tile`);
    if ((effect.result === "hit" || effect.result === "immune") && tile === null) {
      throw new TypeError("Visible effect requires tile");
    }
    return Object.freeze({
      effectId,
      result: effect.result,
      effect: nonEmptyString(effect.effect, `${label}.effect`),
      tile,
      startTick: safeInteger(effect.startTick, `${label}.startTick`),
    });
  }));

  return Object.freeze({ sceneEpoch, tick, actors, effectStarts });
}
