import { RESIZE_SETTLE_MS, TILE_SIZE_PX } from "@loomrealm-game/tile-presentation";

export { RESIZE_SETTLE_MS, TILE_SIZE_PX } from "@loomrealm-game/tile-presentation";

export type Direction = 2 | 4 | 6 | 8;

export interface ProjectedTable {
  readonly dimensions: number;
  readonly xSize: number;
  readonly ySize: number;
  readonly zSize: number;
  readonly values: readonly number[];
}

export interface MapRecord {
  readonly tileset_id: number;
  readonly width: number;
  readonly height: number;
  readonly data: ProjectedTable;
  readonly behaviors: readonly MapBehavior[];
}

export type MapBehavior = Readonly<{
  kind: "bridge";
  operation: "on" | "off";
  occupied: readonly Readonly<{ x: number; y: number }>[];
}>;

export interface TilesetRecord {
  readonly id: number;
  readonly tileset_name: string;
  readonly autotile_names: readonly (string | null)[];
  readonly passages: ProjectedTable;
  readonly priorities: ProjectedTable;
  readonly terrain_tags: ProjectedTable;
}

export type TargetDirection = Direction | null;

export interface StepTransfer {
  readonly x: number;
  readonly y: number;
  readonly targetMapId: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly targetDirection: TargetDirection;
}

export interface ContactTransfer {
  readonly x: number;
  readonly y: number;
  readonly direction: Direction;
  readonly targetMapId: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly targetDirection: TargetDirection;
}

export interface EdgeTransfer {
  readonly x: number;
  readonly y: number;
  readonly direction: Direction;
  readonly targetMapId: number;
  readonly targetX: number;
  readonly targetY: number;
}

export interface MapTransferRecord {
  readonly id: number;
  readonly steps: readonly StepTransfer[];
  readonly contacts: readonly ContactTransfer[];
  readonly edges: readonly EdgeTransfer[];
}

export type Corner = Readonly<{ sx: number; sy: number }>;
export type AutotileCorners = readonly [Corner, Corner, Corner, Corner];
type AutotileQuarterRow = readonly [number, number, number, number];

export type TileBlit =
  | Readonly<{ kind: "regular"; sourceIndex: number }>
  | Readonly<{ kind: "autotile"; slot: number; corners: AutotileCorners }>;

export interface VisibleTile {
  readonly x: number;
  readonly y: number;
  readonly z: 0 | 1 | 2;
  readonly tileId: number;
  readonly depth: number;
  readonly blit: TileBlit;
}

export interface TileProjectionBounds {
  readonly minTileX: number;
  readonly minTileY: number;
  readonly maxTileX: number;
  readonly maxTileY: number;
}

export const TILESET_SCHEMA_SUBJECT = "map-tileset-terrain-tags-v1";
export const TILESET_SCHEMA_VERSION = "struct.Tileset/v2-terrain-tags";
/** PROJECT-DECISION-PROVISIONAL: single Runtime→Browser motion/event ABI. Not vanilla RGSS. */
export const MOTION_ABI_VERSION = "map-motion/v1-walk-jump-bridge";
export const TERRAIN_TAG_MIN = 0;
export const TERRAIN_TAG_MAX = 17;
export const TERRAIN_NONE = 0;
export const TERRAIN_LEDGE = 1;
export const TERRAIN_NEUTRAL = 13;
export const TERRAIN_BRIDGE = 15;
export const TERRAIN_NO_EFFECT = 17;
export const WALK_DURATION_MS = 250;
/** Vanilla Essentials v21.1 Map47 dynamic observation: speed-3 two-tile jump is 0.5s. */
export const JUMP_DURATION_MS = 500;
/** PROJECT-DECISION-PROVISIONAL: the product formula generalizes the observed 24px Map47 peak. */
export const JUMP_PEAK_RULE = "distancePx * 3 / 8";
export const TILE_SIZE = TILE_SIZE_PX;
export const LEGAL_BRIDGE_LEVELS = Object.freeze([0, 2] as const);
export type BridgeLevel = 0 | 2;
export const VIEW_DATA_GUARD = 196_608;
export const DEFAULT_VIEWPORT = Object.freeze({ width: 640, height: 480 });
export const MIN_VIEWPORT = Object.freeze({ width: 320, height: 240 });
export const MAX_VIEWPORT = Object.freeze({ width: 1920, height: 1080 });

export type ViewportSize = Readonly<{ width: number; height: number }>;
export type LogicalViewport = Readonly<{
  width?: number;
  height?: number;
  logicalWidth?: number;
  logicalHeight?: number;
}>;

export function clampViewport(size: ViewportSize | null | undefined): ViewportSize {
  if (size == null) return DEFAULT_VIEWPORT;
  const width = Math.min(MAX_VIEWPORT.width, Math.max(MIN_VIEWPORT.width, Math.floor(Number(size.width))));
  const height = Math.min(MAX_VIEWPORT.height, Math.max(MIN_VIEWPORT.height, Math.floor(Number(size.height))));
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return DEFAULT_VIEWPORT;
  return Object.freeze({ width, height });
}

export function viewportsEqual(left: ViewportSize, right: ViewportSize): boolean {
  return left.width === right.width && left.height === right.height;
}
export const AUTOTILE_QUARTERS = [
  [27, 28, 33, 34], [5, 28, 33, 34], [27, 6, 33, 34], [5, 6, 33, 34],
  [27, 28, 33, 12], [5, 28, 33, 12], [27, 6, 33, 12], [5, 6, 33, 12],

  [27, 28, 11, 34], [5, 28, 11, 34], [27, 6, 11, 34], [5, 6, 11, 34],
  [27, 28, 11, 12], [5, 28, 11, 12], [27, 6, 11, 12], [5, 6, 11, 12],

  [25, 26, 31, 32], [25, 6, 31, 32], [25, 26, 31, 12], [25, 6, 31, 12],
  [15, 16, 21, 22], [15, 16, 21, 12], [15, 16, 11, 22], [15, 16, 11, 12],

  [29, 30, 35, 36], [29, 30, 11, 36], [5, 30, 35, 36], [5, 30, 11, 36],
  [39, 40, 45, 46], [5, 40, 45, 46], [39, 6, 45, 46], [5, 6, 45, 46],

  [25, 30, 31, 36], [15, 16, 45, 46], [13, 14, 19, 20], [13, 14, 19, 12],
  [17, 18, 23, 24], [17, 18, 11, 24], [41, 42, 47, 48], [5, 42, 47, 48],

  [37, 38, 43, 44], [37, 6, 43, 44], [13, 18, 19, 24], [13, 14, 43, 44],
  [37, 42, 43, 48], [17, 18, 47, 48], [13, 18, 43, 48], [1, 2, 7, 8],
] as const satisfies readonly AutotileQuarterRow[];

export function tileVisualDepth(y: number, priority: number, tag: number = TERRAIN_NONE, bridgeLevel: number = 0): number {
  if (tag === TERRAIN_BRIDGE && bridgeLevel === 2) return 0;
  if (priority === 0) return 0;
  return (y + priority + 1) * TILE_SIZE;
}

const passageBits: Record<Direction, number> = { 2: 0x01, 4: 0x02, 6: 0x04, 8: 0x08 };

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string, positive = true): number {
  if (!Number.isSafeInteger(value) || (positive ? Number(value) <= 0 : Number(value) < 0)) throw new TypeError(`${label} must be a ${positive ? "positive" : "non-negative"} safe integer`);
  return value as number;
}

function occupiedPoint(value: unknown, label: string): Readonly<{ x: number; y: number }> {
  const point = exactObject(value, label, ["x", "y"]);
  if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) {
    throw new TypeError(`${label} coordinates must be safe integers`);
  }
  return Object.freeze({ x: point.x as number, y: point.y as number });
}

export function validateTable(value: unknown, label: string): ProjectedTable {
  const input = object(value, label);
  const fields = ["dimensions", "xSize", "ySize", "zSize", "values"];
  if (!fields.every((key) => key in input) || Object.keys(input).length !== fields.length) throw new TypeError(`${label} has an invalid field set`);
  if (!Array.isArray(input.values)) throw new TypeError(`${label}.values must be an array`);
  const table = {
    dimensions: integer(input.dimensions, `${label}.dimensions`),
    xSize: integer(input.xSize, `${label}.xSize`),
    ySize: integer(input.ySize, `${label}.ySize`),
    zSize: integer(input.zSize, `${label}.zSize`),
    values: Object.freeze(input.values.map((item, index) => {
      if (!Number.isSafeInteger(item)) throw new TypeError(`${label}.values[${index}] must be a safe integer`);
      return item as number;
    })),
  };
  if (table.values.length !== table.xSize * table.ySize * table.zSize) throw new TypeError(`${label}.values has the wrong length`);
  return Object.freeze(table);
}

export function validateMapRecord(value: unknown): MapRecord {
  const input = object(value, "Map");
  const allowed = ["tileset_id", "width", "height", "data", "behaviors"];
  if (!(["tileset_id", "width", "height", "data"].every((key) => key in input)) || Object.keys(input).some((key) => !allowed.includes(key))) throw new TypeError("Map has an invalid field set");
  const width = integer(input.width, "Map.width");
  const height = integer(input.height, "Map.height");
  const data = validateTable(input.data, "Map.data");
  if (data.dimensions !== 3 || data.xSize !== width || data.ySize !== height || data.zSize !== 3) throw new TypeError("Map.data has an invalid 3D shape");
  const source = input.behaviors === undefined ? [] : input.behaviors;
  if (!Array.isArray(source)) throw new TypeError("Map.behaviors must be an array");
  const occupiedAcrossBehaviors = new Set<string>();
  const behaviors = Object.freeze(source.map((value, index) => {
    const label = `Map.behaviors[${index}]`;
    const behavior = exactObject(value, label, ["kind", "operation", "occupied"]);
    if (behavior.kind !== "bridge") throw new TypeError(`${label}.kind must be bridge`);
    if (behavior.operation !== "on" && behavior.operation !== "off") throw new TypeError(`${label}.operation must be on or off`);
    if (!Array.isArray(behavior.occupied) || behavior.occupied.length === 0) throw new TypeError(`${label}.occupied must be non-empty`);
    const local = new Set<string>();
    const occupied = Object.freeze(behavior.occupied.map((point, pointIndex) => {
      const result = occupiedPoint(point, `${label}.occupied[${pointIndex}]`);
      if (result.x < 0 || result.y < 0 || result.x >= width || result.y >= height) throw new TypeError(`${label}.occupied is outside Map bounds`);
      const key = `${result.x},${result.y}`;
      if (local.has(key)) throw new TypeError(`${label}.occupied contains a duplicate coordinate`);
      if (occupiedAcrossBehaviors.has(key)) throw new TypeError("Map bridge behaviors overlap");
      local.add(key);
      occupiedAcrossBehaviors.add(key);
      return result;
    }));
    return Object.freeze({ kind: "bridge" as const, operation: behavior.operation, occupied });
  }));
  return Object.freeze({ tileset_id: integer(input.tileset_id, "Map.tileset_id"), width, height, data, behaviors });
}

function transferDirection(value: unknown, label: string): Direction {
  if (value !== 2 && value !== 4 && value !== 6 && value !== 8) throw new TypeError(`${label} must be 2, 4, 6, or 8`);
  return value;
}

function targetDirection(value: unknown, label: string): TargetDirection {
  if (value === null) return null;
  return transferDirection(value, label);
}

function exactObject(value: unknown, label: string, fields: readonly string[]): Record<string, unknown> {
  const input = object(value, label);
  if (!fields.every((key) => key in input) || Object.keys(input).length !== fields.length) throw new TypeError(`${label} has an invalid field set`);
  return input;
}

function addUnique(seen: Set<string>, key: string, label: string) {
  if (seen.has(key)) throw new TypeError(`${label} has a duplicate source key`);
  seen.add(key);
}

export function validateMapTransferRecord(value: unknown, contentMapId: number): MapTransferRecord {
  const input = exactObject(value, "MapTransfer", ["id", "steps", "contacts", "edges"]);
  const id = integer(input.id, "MapTransfer.id");
  if (id !== contentMapId) throw new TypeError("MapTransfer.id does not equal its Content key");
  if (!Array.isArray(input.steps) || !Array.isArray(input.contacts) || !Array.isArray(input.edges)) {
    throw new TypeError("MapTransfer steps/contacts/edges must be arrays");
  }
  const stepKeys = new Set<string>();
  const contactKeys = new Set<string>();
  const edgeKeys = new Set<string>();
  const steps = Object.freeze(input.steps.map((item, index) => {
    const label = `MapTransfer.steps[${index}]`;
    const record = exactObject(item, label, ["x", "y", "targetMapId", "targetX", "targetY", "targetDirection"]);
    const x = integer(record.x, `${label}.x`, false);
    const y = integer(record.y, `${label}.y`, false);
    addUnique(stepKeys, `${x},${y}`, label);
    return Object.freeze({
      x,
      y,
      targetMapId: integer(record.targetMapId, `${label}.targetMapId`),
      targetX: integer(record.targetX, `${label}.targetX`, false),
      targetY: integer(record.targetY, `${label}.targetY`, false),
      targetDirection: targetDirection(record.targetDirection, `${label}.targetDirection`),
    });
  }));
  const contacts = Object.freeze(input.contacts.map((item, index) => {
    const label = `MapTransfer.contacts[${index}]`;
    const record = exactObject(item, label, ["x", "y", "direction", "targetMapId", "targetX", "targetY", "targetDirection"]);
    const x = integer(record.x, `${label}.x`, false);
    const y = integer(record.y, `${label}.y`, false);
    const direction = transferDirection(record.direction, `${label}.direction`);
    addUnique(contactKeys, `${x},${y},${direction}`, label);
    return Object.freeze({
      x,
      y,
      direction,
      targetMapId: integer(record.targetMapId, `${label}.targetMapId`),
      targetX: integer(record.targetX, `${label}.targetX`, false),
      targetY: integer(record.targetY, `${label}.targetY`, false),
      targetDirection: targetDirection(record.targetDirection, `${label}.targetDirection`),
    });
  }));
  const edges = Object.freeze(input.edges.map((item, index) => {
    const label = `MapTransfer.edges[${index}]`;
    const record = exactObject(item, label, ["x", "y", "direction", "targetMapId", "targetX", "targetY"]);
    const x = integer(record.x, `${label}.x`, false);
    const y = integer(record.y, `${label}.y`, false);
    const direction = transferDirection(record.direction, `${label}.direction`);
    addUnique(edgeKeys, `${x},${y},${direction}`, label);
    return Object.freeze({
      x,
      y,
      direction,
      targetMapId: integer(record.targetMapId, `${label}.targetMapId`),
      targetX: integer(record.targetX, `${label}.targetX`, false),
      targetY: integer(record.targetY, `${label}.targetY`, false),
    });
  }));
  return Object.freeze({ id, steps, contacts, edges });
}

export function validateTilesetRecord(value: unknown, contentId: number): TilesetRecord {
  const keys = value !== null && typeof value === "object" && !Array.isArray(value) ? Object.keys(value as object) : [];
  if (keys.length === 5 && ["id", "tileset_name", "autotile_names", "passages", "priorities"].every((key) => keys.includes(key))) {
    throw new TypeError("TILESET_RECORD_INVALID: legacy five-field Tileset requires migrateLegacyTilesetRecord");
  }
  const input = exactObject(value, "Tileset", ["id", "tileset_name", "autotile_names", "passages", "priorities", "terrain_tags"]);
  const id = integer(input.id, "Tileset.id");
  if (id !== contentId) throw new TypeError("Tileset.id does not equal its Content key");
  if (typeof input.tileset_name !== "string" || input.tileset_name.length === 0) throw new TypeError("Tileset.tileset_name must be non-empty");
  if (!Array.isArray(input.autotile_names) || input.autotile_names.length !== 7) throw new TypeError("Tileset.autotile_names must be an array of length 7");
  const autotile_names = Object.freeze(input.autotile_names.map((item, index) => {
    if (item === null) return null;
    if (typeof item !== "string" || item.length === 0) throw new TypeError(`Tileset.autotile_names[${index}] must be null or a non-empty string`);
    return item;
  }));
  const passages = validateTable(input.passages, "Tileset.passages");
  const priorities = validateTable(input.priorities, "Tileset.priorities");
  const terrain_tags = validateTable(input.terrain_tags, "Tileset.terrain_tags");
  for (const [name, table] of [["passages", passages], ["priorities", priorities], ["terrain_tags", terrain_tags]] as const) {
    if (table.dimensions !== 1 || table.ySize !== 1 || table.zSize !== 1) throw new TypeError(`Tileset.${name} must be a 1D Table`);
  }
  if (passages.xSize !== priorities.xSize || passages.xSize !== terrain_tags.xSize) {
    throw new TypeError("TILESET_RECORD_INVALID: passages, priorities, and terrain_tags xSize must match");
  }
  if (priorities.values.some((entry) => entry < 0 || entry > 5)) {
    throw new TypeError("Tileset.priorities values must be integers from 0 through 5");
  }
  if (terrain_tags.values.some((entry) => !Number.isSafeInteger(entry) || entry < TERRAIN_TAG_MIN || entry > TERRAIN_TAG_MAX)) {
    throw new TypeError("TILESET_RECORD_INVALID: terrain_tags values must be integers from 0 through 17");
  }
  return Object.freeze({ id, tileset_name: input.tileset_name, autotile_names, passages, priorities, terrain_tags });
}

export function oneDimensionalIndexTable(values: readonly number[]): ProjectedTable {
  return validateTable({
    dimensions: 1,
    xSize: values.length,
    ySize: 1,
    zSize: 1,
    values,
  }, "index-table");
}

export function migrateLegacyTilesetRecord(value: unknown, terrain_tags: ProjectedTable, contentId: number): TilesetRecord {
  const input = exactObject(value, "legacy Tileset", ["id", "tileset_name", "autotile_names", "passages", "priorities"]);
  return validateTilesetRecord({ ...input, terrain_tags }, contentId);
}

export function tableAt(table: ProjectedTable, x: number, y = 0, z = 0): number {
  for (const [coordinate, size] of [[x, table.xSize], [y, table.ySize], [z, table.zSize]]) {
    if (!Number.isSafeInteger(coordinate) || coordinate < 0 || coordinate >= size) throw new RangeError("Table coordinate is out of bounds");
  }
  return table.values[x + y * table.xSize + z * table.xSize * table.ySize]!;
}

export function mapTilePassable(map: MapRecord, tileset: TilesetRecord, x: number, y: number, direction: Direction): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  const bit = passageBits[direction];
  for (const z of [2, 1, 0] as const) {
    const tileId = tableAt(map.data, x, y, z);
    if (!Number.isSafeInteger(tileId) || tileId < 0 || tileId >= tileset.passages.xSize || tileId >= tileset.priorities.xSize || tileId >= tileset.terrain_tags.xSize) return false;
    const passage = tableAt(tileset.passages, tileId);
    const priority = tableAt(tileset.priorities, tileId);
    if ((passage & bit) !== 0 || (passage & 0x0f) === 0x0f) return false;
    if (priority === 0) return true;
  }
  return true;
}

function logicalDimensions(viewport: LogicalViewport): Readonly<{ width: number; height: number }> {
  const width = viewport.logicalWidth ?? viewport.width;
  const height = viewport.logicalHeight ?? viewport.height;
  if (!Number.isSafeInteger(width) || Number(width) <= 0 || !Number.isSafeInteger(height) || Number(height) <= 0) {
    throw new TypeError("Logical viewport dimensions must be positive safe integers");
  }
  return { width: Number(width), height: Number(height) };
}

export function computeCamera(map: MapRecord, playerX: number, playerY: number, viewport: LogicalViewport = DEFAULT_VIEWPORT) {
  const logical = logicalDimensions(viewport);
  const anchorX = (logical.width - TILE_SIZE) / 2;
  const anchorY = (logical.height - TILE_SIZE) / 2;
  return Object.freeze({
    cameraX: Math.min(Math.max(playerX * TILE_SIZE - anchorX, 0), Math.max(map.width * TILE_SIZE - logical.width, 0)),
    cameraY: Math.min(Math.max(playerY * TILE_SIZE - anchorY, 0), Math.max(map.height * TILE_SIZE - logical.height, 0)),
  });
}

export function autotileCorners(variant: number): AutotileCorners {
  if (!Number.isSafeInteger(variant) || variant < 0 || variant > 47) throw new TypeError("autotile variant must be an integer from 0 through 47");
  const row = AUTOTILE_QUARTERS[variant]!;
  return Object.freeze(row.map((quarter) => {
    const index = quarter - 1;
    return Object.freeze({ sx: (index % 6) * 16, sy: Math.floor(index / 6) * 16 });
  })) as AutotileCorners;
}

export function assertRenderableTileId(tileId: number, tileset: TilesetRecord): void {
  if (!Number.isSafeInteger(tileId) || tileId <= 0) throw new TypeError(`Unsupported map tile id ${tileId}`);
  if (tileId >= tileset.passages.xSize || tileId >= tileset.priorities.xSize || tileId >= tileset.terrain_tags.xSize) {
    throw new TypeError(`MAP_TILE_INDEX_INVALID: Tileset has no entry for tile id ${tileId}`);
  }
  if (tileId >= 1 && tileId <= 47) throw new TypeError(`Unsupported map tile id ${tileId}`);
  if (tileId >= 48 && tileId <= 383) {
    const slot = Math.floor((tileId - 48) / 48);
    if (slot < 0 || slot > 6 || tileset.autotile_names[slot] === null) {
      throw new TypeError(`Unsupported map tile id ${tileId}`);
    }
  }
}

export function projectTileBlit(tileId: number, tileset: TilesetRecord): TileBlit {
  assertRenderableTileId(tileId, tileset);
  if (tileId >= 384) return Object.freeze({ kind: "regular", sourceIndex: tileId - 384 });
  const slot = Math.floor((tileId - 48) / 48);
  const variant = (tileId - 48) % 48;
  return Object.freeze({ kind: "autotile", slot, corners: autotileCorners(variant) });
}

export function assertProjectable(map: MapRecord, tileset: TilesetRecord): void {
  for (const tileId of map.data.values) {
    if (tileId === 0) continue;
    assertRenderableTileId(tileId, tileset);
  }
}

export function viewportTileBounds(
  map: MapRecord,
  cameraX: number,
  cameraY: number,
  viewport: LogicalViewport = DEFAULT_VIEWPORT,
): TileProjectionBounds {
  const logical = logicalDimensions(viewport);
  return Object.freeze({
    minTileX: Math.max(0, Math.floor(cameraX / TILE_SIZE)),
    maxTileX: Math.min(map.width - 1, Math.floor((cameraX + logical.width - 1) / TILE_SIZE)),
    minTileY: Math.max(0, Math.floor(cameraY / TILE_SIZE)),
    maxTileY: Math.min(map.height - 1, Math.floor((cameraY + logical.height - 1) / TILE_SIZE)),
  });
}

export function expandTileBounds(
  bounds: TileProjectionBounds,
  margin: number,
  map: MapRecord,
): TileProjectionBounds {
  return Object.freeze({
    minTileX: Math.max(0, bounds.minTileX - margin),
    maxTileX: Math.min(map.width - 1, bounds.maxTileX + margin),
    minTileY: Math.max(0, bounds.minTileY - margin),
    maxTileY: Math.min(map.height - 1, bounds.maxTileY + margin),
  });
}

export function unionTileBounds(left: TileProjectionBounds, right: TileProjectionBounds): TileProjectionBounds {
  return Object.freeze({
    minTileX: Math.min(left.minTileX, right.minTileX),
    maxTileX: Math.max(left.maxTileX, right.maxTileX),
    minTileY: Math.min(left.minTileY, right.minTileY),
    maxTileY: Math.max(left.maxTileY, right.maxTileY),
  });
}

export function boundsContain(outer: TileProjectionBounds, inner: TileProjectionBounds): boolean {
  return outer.minTileX <= inner.minTileX
    && outer.maxTileX >= inner.maxTileX
    && outer.minTileY <= inner.minTileY
    && outer.maxTileY >= inner.maxTileY;
}

export function projectTilesInBounds(
  map: MapRecord,
  tileset: TilesetRecord,
  bounds: TileProjectionBounds,
  bridgeLevel: number = 0,
): readonly VisibleTile[] {
  const tiles: VisibleTile[] = [];
  for (const z of [0, 1, 2] as const) {
    for (let y = bounds.minTileY; y <= bounds.maxTileY; y += 1) {
      for (let x = bounds.minTileX; x <= bounds.maxTileX; x += 1) {
        const tileId = tableAt(map.data, x, y, z);
        if (tileId === 0) continue;
        assertRenderableTileId(tileId, tileset);
        const blit = projectTileBlit(tileId, tileset);
        const priority = tableAt(tileset.priorities, tileId);
        const tag = tableAt(tileset.terrain_tags, tileId);
        const depth = tileVisualDepth(y, priority, tag, bridgeLevel);
        tiles.push(Object.freeze({ x, y, z, tileId, depth, blit }));
      }
    }
  }
  return Object.freeze(tiles);
}

export function projectVisibleTiles(
  map: MapRecord,
  tileset: TilesetRecord,
  cameraX: number,
  cameraY: number,
  bridgeLevel: number = 0,
): readonly VisibleTile[] {
  return projectTilesInBounds(map, tileset, expandTileBounds(viewportTileBounds(map, cameraX, cameraY), 1, map), bridgeLevel);
}

export function rubyPassageBit(direction: number): number {
  const shift = Math.trunc(Number(direction) / 2) - 1;
  const raw = shift >= 0 ? (1 << shift) : (1 >> (-shift));
  return raw & 0x0f;
}

export type TerrainQuery =
  | Readonly<{ status: "known"; tag: number; id: string; sourceLayer: 0 | 1 | 2 | null }>
  | Readonly<{ status: "invalid"; reason: string }>;

export type PassabilityQuery =
  | Readonly<{ status: "decided"; passable: boolean; reason: string; bit: number }>
  | Readonly<{ status: "invalid"; reason: string }>;

const TERRAIN_IDS: Record<number, string> = Object.freeze({
  0: "None",
  1: "Ledge",
  2: "Grass",
  3: "Sand",
  4: "Rock",
  5: "DeepWater",
  6: "StillWater",
  7: "Water",
  8: "Waterfall",
  9: "WaterfallCrest",
  10: "TallGrass",
  11: "UnderwaterGrass",
  12: "Ice",
  13: "Neutral",
  14: "SootGrass",
  15: "Bridge",
  16: "Puddle",
  17: "NoEffect",
});

function readTileIndex(tileset: TilesetRecord, tileId: number, label: string): { ok: true; passage: number; priority: number; tag: number } | { ok: false; reason: string } {
  if (!Number.isSafeInteger(tileId)) return { ok: false, reason: `${label}: tileId is not a safe integer` };
  if (tileId < 0) return { ok: false, reason: `MAP_TILE_INDEX_INVALID: negative tile ${tileId}` };
  if (tileId >= tileset.passages.xSize || tileId >= tileset.priorities.xSize || tileId >= tileset.terrain_tags.xSize) {
    return { ok: false, reason: `MAP_TILE_INDEX_INVALID: tile ${tileId} outside tileset tables` };
  }
  return {
    ok: true,
    passage: tableAt(tileset.passages, tileId),
    priority: tableAt(tileset.priorities, tileId),
    tag: tableAt(tileset.terrain_tags, tileId),
  };
}

export function resolveEffectiveTerrainTag(map: MapRecord, tileset: TilesetRecord, x: number, y: number, bridgeLevel: number): TerrainQuery {
  if (!Number.isSafeInteger(bridgeLevel) || (bridgeLevel !== 0 && bridgeLevel !== 2)) {
    return Object.freeze({ status: "invalid", reason: "unsupported-bridgeLevel" });
  }
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return Object.freeze({ status: "invalid", reason: "invalid-coordinates" });
  }
  for (const z of [2, 1, 0] as const) {
    const tileId = tableAt(map.data, x, y, z);
    if (tileId === 0) continue;
    const lookup = readTileIndex(tileset, tileId, "terrain");
    if (!lookup.ok) return Object.freeze({ status: "invalid", reason: lookup.reason });
    if (lookup.tag === TERRAIN_NONE || lookup.tag === TERRAIN_NEUTRAL) continue;
    if (lookup.tag === TERRAIN_BRIDGE && bridgeLevel === 0) continue;
    return Object.freeze({
      status: "known",
      tag: lookup.tag,
      id: TERRAIN_IDS[lookup.tag] ?? "Unknown",
      sourceLayer: z,
    });
  }
  return Object.freeze({ status: "known", tag: TERRAIN_NONE, id: "None", sourceLayer: null });
}

export function evaluatePassability(map: MapRecord, tileset: TilesetRecord, x: number, y: number, direction: number, bridgeLevel: number): PassabilityQuery {
  if (!Number.isSafeInteger(bridgeLevel) || (bridgeLevel !== 0 && bridgeLevel !== 2)) {
    return Object.freeze({ status: "invalid", reason: "unsupported-bridgeLevel" });
  }
  if (![0, 2, 4, 6, 8].includes(direction)) {
    return Object.freeze({ status: "invalid", reason: "invalid-direction" });
  }
  const bit = rubyPassageBit(direction);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return Object.freeze({ status: "decided", passable: false, reason: "invalid-coordinates", bit });
  }
  for (const z of [2, 1, 0] as const) {
    const tileId = tableAt(map.data, x, y, z);
    if (tileId === 0) continue;
    const lookup = readTileIndex(tileset, tileId, "passability");
    if (!lookup.ok) return Object.freeze({ status: "invalid", reason: lookup.reason });
    if (lookup.tag === TERRAIN_BRIDGE && bridgeLevel === 0) continue;
    if (lookup.tag === TERRAIN_BRIDGE && bridgeLevel > 0) {
      const ok = (lookup.passage & bit) === 0 && (lookup.passage & 0x0f) !== 0x0f;
      return Object.freeze({ status: "decided", passable: ok, reason: ok ? "bridge-layer-passable" : "bridge-layer-blocked", bit });
    }
    if (lookup.tag === TERRAIN_NEUTRAL) continue;
    if ((lookup.passage & bit) !== 0 || (lookup.passage & 0x0f) === 0x0f) {
      return Object.freeze({ status: "decided", passable: false, reason: "passage-blocked", bit });
    }
    if (lookup.priority === 0) {
      return Object.freeze({ status: "decided", passable: true, reason: "priority-0", bit });
    }
  }
  return Object.freeze({ status: "decided", passable: true, reason: "default-true-after-layers", bit });
}

export function canMove(
  map: MapRecord,
  tileset: TilesetRecord,
  x: number,
  y: number,
  direction: Direction,
  dx: number,
  dy: number,
  bridgeLevel: number = 0,
): boolean {
  const source = evaluatePassability(map, tileset, x, y, direction, bridgeLevel);
  const target = evaluatePassability(map, tileset, x + dx, y + dy, (10 - direction) as Direction, bridgeLevel);
  return source.status === "decided" && source.passable && target.status === "decided" && target.passable;
}

export type MovementPlan =
  | Readonly<{ kind: "blocked"; direction: Direction }>
  | Readonly<{ kind: "walk"; fromX: number; fromY: number; toX: number; toY: number; direction: Direction; durationMs: typeof WALK_DURATION_MS }>
  | Readonly<{
    kind: "jump";
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    skippedX: number;
    skippedY: number;
    direction: Direction;
    durationMs: typeof JUMP_DURATION_MS;
    peakPx: number;
    peakRule: typeof JUMP_PEAK_RULE;
  }>;

function facingIsLedge(map: MapRecord, tileset: TilesetRecord, x: number, y: number, direction: Direction, bridgeLevel: number): boolean {
  const { dx, dy } = { 2: { dx: 0, dy: 1 }, 4: { dx: -1, dy: 0 }, 6: { dx: 1, dy: 0 }, 8: { dx: 0, dy: -1 } }[direction];
  const facing = resolveEffectiveTerrainTag(map, tileset, x + dx, y + dy, bridgeLevel);
  return facing.status === "known" && facing.tag === TERRAIN_LEDGE;
}

export function planMovement(map: MapRecord, tileset: TilesetRecord, x: number, y: number, direction: Direction, bridgeLevel: number): MovementPlan {
  const delta = { 2: { dx: 0, dy: 1 }, 4: { dx: -1, dy: 0 }, 6: { dx: 1, dy: 0 }, 8: { dx: 0, dy: -1 } }[direction];
  const walkable = canMove(map, tileset, x, y, direction, delta.dx, delta.dy, bridgeLevel);
  if (walkable && facingIsLedge(map, tileset, x, y, direction, bridgeLevel)) {
    const skippedX = x + delta.dx;
    const skippedY = y + delta.dy;
    const toX = x + delta.dx * 2;
    const toY = y + delta.dy * 2;
    const landing = evaluatePassability(map, tileset, toX, toY, 0, bridgeLevel);
    const inMap = toX >= 0 && toY >= 0 && toX < map.width && toY < map.height;
    if (landing.status === "decided" && landing.passable && inMap) {
      return Object.freeze({
        kind: "jump",
        fromX: x,
        fromY: y,
        toX,
        toY,
        skippedX,
        skippedY,
        direction,
        durationMs: JUMP_DURATION_MS,
        peakPx: jumpPeakPx(2),
        peakRule: JUMP_PEAK_RULE,
      });
    }
    return Object.freeze({ kind: "blocked", direction });
  }
  if (walkable) {
    return Object.freeze({
      kind: "walk",
      fromX: x,
      fromY: y,
      toX: x + delta.dx,
      toY: y + delta.dy,
      direction,
      durationMs: WALK_DURATION_MS,
    });
  }
  return Object.freeze({ kind: "blocked", direction });
}

export function jumpPeakPx(tileDistance = 2): number {
  return (tileDistance * TILE_SIZE * 3) / 8;
}
