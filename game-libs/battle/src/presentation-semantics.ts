import { TILE_SIZE_PX, type TileViewportLayout } from "@loomrealm-game/tile-presentation";
import type {
  ActorRenderProjection,
  GridPosition,
  MovementProjection,
  RenderProjection,
  ResolvedResourceRef,
  SkillEffectProjection,
} from "./contracts.js";

export interface ProjectedTable { readonly dimensions: number; readonly xSize: number; readonly ySize: number; readonly zSize: number; readonly values: readonly number[] }
export interface BattleArenaRecord { readonly id: string; readonly tileset_id: number; readonly width: number; readonly height: number; readonly passable: readonly (readonly boolean[])[]; readonly data: ProjectedTable }
export interface TilesetRecord { readonly id: number; readonly tileset_name: string; readonly autotile_names: readonly (string | null)[]; readonly priorities: ProjectedTable }
export interface LoadedBattleArena { readonly arena: BattleArenaRecord; readonly tileset: TilesetRecord; readonly tilesetRef: ResolvedResourceRef; readonly autotileRefs: readonly (ResolvedResourceRef | null)[] }
export type TileTuple = readonly [number, number, 0 | 1 | 2, number, number];

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new TypeError(`${label} must be positive`); return Number(value);
}
function table(value: unknown, label: string): ProjectedTable {
  const item = record(value, label);
  if (Reflect.ownKeys(item).length !== 5 || !["dimensions", "xSize", "ySize", "zSize", "values"].every((key) => Object.hasOwn(item, key))) throw new TypeError(`${label} has unsupported fields`);
  const dimensions = positive(item.dimensions, `${label}.dimensions`), xSize = positive(item.xSize, `${label}.xSize`), ySize = positive(item.ySize, `${label}.ySize`), zSize = positive(item.zSize, `${label}.zSize`);
  if (!Array.isArray(item.values) || item.values.length !== xSize * ySize * zSize || item.values.some((entry) => !Number.isSafeInteger(entry))) throw new TypeError(`${label} values are invalid`);
  return Object.freeze({ dimensions, xSize, ySize, zSize, values: Object.freeze(item.values.map(Number)) });
}
export function validateBattleArena(value: unknown, recordKey: string): BattleArenaRecord {
  const item = record(value, "BattleArena");
  if (Reflect.ownKeys(item).length !== 6 || !["id", "width", "height", "passable", "tileset_id", "data"].every((key) => Object.hasOwn(item, key))) throw new TypeError("BattleArena has unsupported fields");
  const width = positive(item.width, "BattleArena.width"), height = positive(item.height, "BattleArena.height"), data = table(item.data, "BattleArena.data");
  if (item.id !== recordKey || !Array.isArray(item.passable) || item.passable.length !== height) throw new TypeError("BattleArena identity/passable shape is invalid");
  const passable = Object.freeze(item.passable.map((row, y) => {
    if (!Array.isArray(row) || row.length !== width || row.some((cell) => typeof cell !== "boolean")) throw new TypeError(`BattleArena.passable[${y}] is invalid`);
    return Object.freeze([...row] as boolean[]);
  }));
  if (data.dimensions !== 3 || data.xSize !== width || data.ySize !== height || data.zSize !== 3) throw new TypeError("BattleArena data shape is invalid");
  return Object.freeze({ id: recordKey, tileset_id: positive(item.tileset_id, "BattleArena.tileset_id"), width, height, passable, data });
}
export function validateTileset(value: unknown, id: number): TilesetRecord {
  const item = record(value, "Tileset");
  if (item.id !== id || typeof item.tileset_name !== "string" || !item.tileset_name || !Array.isArray(item.autotile_names) || item.autotile_names.length !== 7 || item.autotile_names.some((name) => name !== null && (typeof name !== "string" || !name))) throw new TypeError("Tileset identity is invalid");
  const priorities = table(item.priorities, "Tileset.priorities");
  if (priorities.dimensions !== 1 || priorities.ySize !== 1 || priorities.zSize !== 1 || priorities.values.some((entry) => entry < 0 || entry > 5)) throw new TypeError("Tileset priorities are invalid");
  return Object.freeze({ id, tileset_name: item.tileset_name, autotile_names: Object.freeze([...item.autotile_names]) as readonly (string | null)[], priorities });
}
function at(tableValue: ProjectedTable, x: number, y = 0, z = 0): number { return tableValue.values[x + y * tableValue.xSize + z * tableValue.xSize * tableValue.ySize]!; }
export function cameraFor(map: BattleArenaRecord, layout: TileViewportLayout, actors: readonly ActorRenderProjection[]) {
  const alive = actors.filter((actor) => actor.life === "alive"); const targets = alive.length ? alive : actors;
  const centers = targets.map((actor) => actor.movement?.to ?? actor.tile).map((tile) => ({ x: tile.x * TILE_SIZE_PX + TILE_SIZE_PX / 2, y: tile.y * TILE_SIZE_PX + TILE_SIZE_PX / 2 }));
  const focusX = (Math.min(...centers.map((p) => p.x)) + Math.max(...centers.map((p) => p.x))) / 2;
  const focusY = (Math.min(...centers.map((p) => p.y)) + Math.max(...centers.map((p) => p.y))) / 2;
  return Object.freeze({
    cameraX: Math.min(Math.max(Math.round(focusX - layout.logicalWidth / 2), 0), Math.max(map.width * TILE_SIZE_PX - layout.logicalWidth, 0)),
    cameraY: Math.min(Math.max(Math.round(focusY - layout.logicalHeight / 2), 0), Math.max(map.height * TILE_SIZE_PX - layout.logicalHeight, 0)),
  });
}
export function projectTiles(source: LoadedBattleArena, cameraX: number, cameraY: number, layout: TileViewportLayout): readonly TileTuple[] {
  const minX = Math.max(0, Math.floor(cameraX / TILE_SIZE_PX) - 1), minY = Math.max(0, Math.floor(cameraY / TILE_SIZE_PX) - 1);
  const maxX = Math.min(source.arena.width - 1, Math.floor((cameraX + layout.logicalWidth - 1) / TILE_SIZE_PX) + 1), maxY = Math.min(source.arena.height - 1, Math.floor((cameraY + layout.logicalHeight - 1) / TILE_SIZE_PX) + 1);
  const result: TileTuple[] = [];
  for (const z of [0, 1, 2] as const) for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const tileId = at(source.arena.data, x, y, z); if (tileId === 0) continue;
    if (tileId < 48 || (tileId < 384 && source.autotileRefs[Math.floor((tileId - 48) / 48)] === null) || tileId >= source.tileset.priorities.xSize) throw new TypeError(`Unsupported map tile ${tileId}`);
    const priority = at(source.tileset.priorities, tileId); const depth = priority === 0 ? 0 : (y + priority + 1) * TILE_SIZE_PX;
    result.push(Object.freeze([x, y, z, tileId, depth]));
  }
  return Object.freeze(result);
}

function samePoint(left: GridPosition, right: GridPosition): boolean {
  return left.x === right.x && left.y === right.y;
}

export function sameMovement(left: MovementProjection, right: MovementProjection): boolean {
  return left.motionId === right.motionId
    && samePoint(left.from, right.from)
    && samePoint(left.to, right.to)
    && left.startTick === right.startTick
    && left.completeTick === right.completeTick;
}

export function sameActorProjection(left: ActorRenderProjection, right: ActorRenderProjection): boolean {
  return left.actorId === right.actorId
    && samePoint(left.tile, right.tile)
    && left.direction === right.direction
    && left.hp === right.hp
    && left.maxHp === right.maxHp
    && left.life === right.life
    && (left.movement === null
      ? right.movement === null
      : right.movement !== null && sameMovement(left.movement, right.movement));
}

export function sameEffectProjection(left: SkillEffectProjection, right: SkillEffectProjection): boolean {
  return left.effectId === right.effectId
    && left.result === right.result
    && left.effect === right.effect
    && left.startTick === right.startTick
    && (left.tile === null ? right.tile === null : right.tile !== null && samePoint(left.tile, right.tile));
}

export function sameProjection(left: RenderProjection, right: RenderProjection): boolean {
  if (left.sceneEpoch !== right.sceneEpoch || left.tick !== right.tick
    || left.actors.length !== right.actors.length
    || left.effectStarts.length !== right.effectStarts.length) return false;
  const leftActors = new Map(left.actors.map((actor) => [actor.actorId, actor]));
  const leftEffects = new Map(left.effectStarts.map((effect) => [effect.effectId, effect]));
  return right.actors.every((actor) => {
    const previous = leftActors.get(actor.actorId);
    return previous !== undefined && sameActorProjection(previous, actor);
  }) && right.effectStarts.every((effect) => {
    const previous = leftEffects.get(effect.effectId);
    return previous !== undefined && sameEffectProjection(previous, effect);
  });
}

export function sameLayout(a: TileViewportLayout, b: TileViewportLayout): boolean {
  return a.windowWidth === b.windowWidth
    && a.windowHeight === b.windowHeight
    && a.barHeight === b.barHeight
    && a.contentWidth === b.contentWidth
    && a.contentHeight === b.contentHeight
    && a.columns === b.columns
    && a.rows === b.rows
    && a.logicalWidth === b.logicalWidth
    && a.logicalHeight === b.logicalHeight
    && a.scaleX === b.scaleX
    && a.scaleY === b.scaleY;
}
