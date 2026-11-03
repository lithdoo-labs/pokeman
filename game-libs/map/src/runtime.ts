import { cancelled, failed, type Frame, type FrameOutcome, type RenderDomain, type RenderDomainState, type RenderDomainUpdate, type SubsystemScope } from "@loomrealm/subsystem";
import {
  assertProjectable,
  boundsContain,
  computeCamera,
  evaluatePassability,
  expandTileBounds,
  JUMP_DURATION_MS,
  planMovement,
  projectTilesInBounds,
  RESIZE_SETTLE_MS,
  unionTileBounds,
  validateMapRecord,
  validateMapTransferRecord,
  validateTilesetRecord,
  VIEW_DATA_GUARD,
  viewportTileBounds,
  WALK_DURATION_MS,
  type BridgeLevel,
  type ContactTransfer,
  type Direction,
  type EdgeTransfer,
  type MapBehavior,
  type MapRecord,
  type MapTransferRecord,
  type MovementPlan,
  type TileProjectionBounds,
  type StepTransfer,
  type TilesetRecord,
} from "./semantics.js";
import { calculateLayout, type MapLayout } from "./layout.js";

interface ResourceRef { readonly [name: string]: string; namespace: string; key: string; contentVersion: string }
export type Pattern = 0 | 1 | 2 | 3;
export type MapEntry = Readonly<{ mapId: number; x: number; y: number; direction?: Direction }>;
export type NPCPlacement = Readonly<{ instanceId: string; npcId: string; x: number; y: number; direction: Direction; pattern?: Pattern | null; interactable?: boolean }>;
export type NormalizedNPCPlacement = Readonly<{ instanceId: string; npcId: string; x: number; y: number; direction: Direction; pattern: Pattern; interactable: boolean }>;
export type MapEnteringContext = Readonly<{ mapId: number; fromMapId: number | null; signal: AbortSignal; setNPC(npcs: readonly NPCPlacement[]): void }>;
export type MapEnteredEvent = Readonly<{ mapId: number; fromMapId: number | null; player: Readonly<{ x: number; y: number; direction: Direction }> }>;
export type NPCInteractEvent = Readonly<{
  mapId: number;
  npc: Readonly<{ instanceId: string; npcId: string; x: number; y: number }>;
  player: Readonly<{ x: number; y: number; direction: Direction }>;
}>;
export type MapSnapshot = Readonly<{ mapId: number; player: Readonly<{ x: number; y: number; direction: Direction }>; npcs: readonly NormalizedNPCPlacement[] }>;
export type RPGMapErrorCode = "MAP_INVALID_ARGUMENT" | "MAP_INVALID_STATE" | "MAP_ALREADY_RUN" | "MAP_BUSY" | "MAP_CONTENT_FAILED" | "MAP_NPC_INVALID" | "MAP_STALE_SCENE" | "MAP_CANCELLED" | "MAP_COMMIT_FAILED";

export class RPGMapError extends Error {
  readonly code: RPGMapErrorCode;
  constructor(code: RPGMapErrorCode, message: string = code) { super(message); this.name = "RPGMapError"; this.code = code; }
}

interface RenderNPC extends NormalizedNPCPlacement { readonly renderKey: string; readonly spriteRef: ResourceRef }
interface ActiveMove {
  readonly id: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly travelDirection: Direction;
  readonly startPattern: 1 | 3;
  readonly durationMs: number;
  readonly kind: "walk" | "jump";
  readonly peakPx?: number;
}
interface LoadedMap {
  readonly mapId: number;
  readonly map: MapRecord;
  readonly tileset: TilesetRecord;
  readonly tilesetRef: ResourceRef;
  readonly autotileRefs: readonly (ResourceRef | null)[];
  readonly transfers: MapTransferRecord;
}

type TransferRule = StepTransfer | ContactTransfer | EdgeTransfer;

type TileTuple = readonly [x: number, y: number, z: 0 | 1 | 2, tileId: number, depth: number];

interface TileProjectionWindow {
  readonly source: LoadedMap;
  readonly bounds: TileProjectionBounds;
  readonly tiles: readonly TileTuple[];
}

interface RenderFacts {
  readonly loaded: LoadedMap;
  readonly window: TileProjectionWindow;
  readonly x: number;
  readonly y: number;
  readonly facingDirection: Direction;
  readonly activeMove: ActiveMove | null;
  readonly playerRef: ResourceRef;
  readonly sceneEpoch: number;
  readonly visualEpoch: number;
  readonly layout: MapLayout;
  readonly bridgeLevel: BridgeLevel;
  readonly npcs: readonly RenderNPC[];
}

function assertBridgeLevel(value: number): asserts value is BridgeLevel {
  if (value !== 0 && value !== 2) throw new TypeError("MAP_BRIDGE_LEVEL_INVALID: legal values are 0 and 2");
}

function occupies(action: Pick<MapBehavior, "occupied">, tileX: number, tileY: number): boolean {
  return action.occupied.some((tile) => tile.x === tileX && tile.y === tileY);
}

function playerMotionPayload(activeMove: ActiveMove, fromScreenX: number, fromScreenY: number) {
  if (activeMove.kind === "jump") {
    return Object.freeze({
      id: activeMove.id,
      durationMs: activeMove.durationMs,
      fromY: activeMove.fromY,
      fromScreenX,
      fromScreenY,
      kind: "jump",
      peakPx: activeMove.peakPx ?? 0,
    });
  }
  return Object.freeze({
    id: activeMove.id,
    durationMs: activeMove.durationMs,
    fromY: activeMove.fromY,
    fromScreenX,
    fromScreenY,
  });
}

type RenderDataSet = NonNullable<NonNullable<NonNullable<RenderDomainUpdate["nodes"]>[number]["data"]>["set"]>;
const VIEWPORT_KEY = "viewport";
const PLAYER_KEY = "player";
const stepDelta: Record<Direction, { readonly dx: number; readonly dy: number }> = {
  2: { dx: 0, dy: 1 },
  4: { dx: -1, dy: 0 },
  6: { dx: 1, dy: 0 },
  8: { dx: 0, dy: -1 },
};
function mapEntry(value: MapEntry, defaultDirection: Direction): Required<MapEntry> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new RPGMapError("MAP_INVALID_ARGUMENT");
  if (!Number.isSafeInteger(value.mapId) || value.mapId <= 0 || !Number.isSafeInteger(value.x) || value.x < 0 || !Number.isSafeInteger(value.y) || value.y < 0) throw new RPGMapError("MAP_INVALID_ARGUMENT");
  const direction = value.direction ?? defaultDirection;
  if (![2, 4, 6, 8].includes(direction)) throw new RPGMapError("MAP_INVALID_ARGUMENT");
  return Object.freeze({ mapId: value.mapId, x: value.x, y: value.y, direction });
}

function normalizeNPCs(values: readonly NPCPlacement[], map: MapRecord, playerX: number, playerY: number): readonly NormalizedNPCPlacement[] {
  if (!Array.isArray(values)) throw new RPGMapError("MAP_NPC_INVALID");
  const ids = new Set<string>();
  const cells = new Set<string>();
  return Object.freeze(values.map((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new RPGMapError("MAP_NPC_INVALID");
    const keys = Object.keys(value);
    if (keys.some((key) => !["instanceId", "npcId", "x", "y", "direction", "pattern", "interactable"].includes(key))) throw new RPGMapError("MAP_NPC_INVALID");
    if (typeof value.instanceId !== "string" || value.instanceId.length === 0 || typeof value.npcId !== "string" || value.npcId.length === 0) throw new RPGMapError("MAP_NPC_INVALID");
    if (ids.has(value.instanceId)) throw new RPGMapError("MAP_NPC_INVALID", "Duplicate NPC instanceId");
    if (!Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.y) || !inBounds(map, value.x, value.y)) throw new RPGMapError("MAP_NPC_INVALID");
    if (![2, 4, 6, 8].includes(value.direction)) throw new RPGMapError("MAP_NPC_INVALID");
    const pattern = value.pattern == null ? 0 : value.pattern;
    if (![0, 1, 2, 3].includes(pattern)) throw new RPGMapError("MAP_NPC_INVALID");
    if (value.interactable !== undefined && typeof value.interactable !== "boolean") throw new RPGMapError("MAP_NPC_INVALID");
    const cell = `${value.x},${value.y}`;
    if (cells.has(cell) || (value.x === playerX && value.y === playerY)) throw new RPGMapError("MAP_NPC_INVALID", "NPC placement collision");
    ids.add(value.instanceId); cells.add(cell);
    return Object.freeze({ instanceId: value.instanceId, npcId: value.npcId, x: value.x, y: value.y, direction: value.direction, pattern, interactable: value.interactable ?? false }) as NormalizedNPCPlacement;
  }));
}

function validateNPCDefinition(value: unknown): { readonly name: string; readonly sprite: { readonly namespace: "resource.Graphics"; readonly key: string } } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new RPGMapError("MAP_NPC_INVALID");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "name,sprite" || typeof record.name !== "string" || record.name.length === 0 || record.sprite === null || typeof record.sprite !== "object" || Array.isArray(record.sprite)) throw new RPGMapError("MAP_NPC_INVALID");
  const sprite = record.sprite as Record<string, unknown>;
  if (Object.keys(sprite).sort().join(",") !== "key,namespace" || sprite.namespace !== "resource.Graphics" || typeof sprite.key !== "string" || !sprite.key.startsWith("Characters/") || sprite.key.length <= 11) throw new RPGMapError("MAP_NPC_INVALID");
  return Object.freeze({ name: record.name, sprite: Object.freeze({ namespace: "resource.Graphics" as const, key: sprite.key }) });
}

function assertCharacterPng(bytes: Uint8Array, mime: string): void {
  if (mime !== "image/png" || bytes.length < 24 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) throw new RPGMapError("MAP_NPC_INVALID", "NPC sprite must be PNG");
  const width = (bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!;
  const height = (bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!;
  if (width <= 0 || height <= 0 || width % 4 !== 0 || height % 4 !== 0) throw new RPGMapError("MAP_NPC_INVALID", "NPC sprite must use a 4x4 atlas");
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

function ref(namespace: string, key: string, contentVersion: string): ResourceRef {
  if (typeof contentVersion !== "string" || contentVersion.length === 0) throw new TypeError("Resource contentVersion must be non-empty");
  return Object.freeze({ namespace, key, contentVersion });
}

function inBounds(map: MapRecord, x: number, y: number) {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

function projectionBoundsPayload(bounds: TileProjectionBounds): Readonly<Record<string, number>> {
  return Object.freeze({
    minTileX: bounds.minTileX,
    minTileY: bounds.minTileY,
    maxTileX: bounds.maxTileX,
    maxTileY: bounds.maxTileY,
  });
}

function viewportPayload(
  loaded: LoadedMap,
  window: TileProjectionWindow,
  cameraX: number,
  cameraY: number,
  cameraMotion: unknown,
  sceneEpoch: number,
  visualEpoch: number,
  motionId: number | null,
  layout: MapLayout,
  bridgeLevel: BridgeLevel,
): RenderDomainState["roots"][number]["data"] {
  return {
    sceneEpoch,
    visualEpoch,
    motionId,
    viewportWidth: layout.windowWidth,
    viewportHeight: layout.windowHeight,
    barHeight: layout.barHeight,
    contentWidth: layout.contentWidth,
    contentHeight: layout.contentHeight,
    columns: layout.columns,
    rows: layout.rows,
    logicalWidth: layout.logicalWidth,
    logicalHeight: layout.logicalHeight,
    scaleX: layout.scaleX,
    scaleY: layout.scaleY,
    mapName: String(loaded.mapId),
    mapId: loaded.mapId,
    mapWidth: loaded.map.width,
    mapHeight: loaded.map.height,
    cameraX,
    cameraY,
    tileset: loaded.tilesetRef,
    autotiles: loaded.autotileRefs,
    projectionBounds: projectionBoundsPayload(window.bounds),
    tiles: window.tiles,
    cameraMotion,
    bridgeLevel,
  } as unknown as RenderDomainState["roots"][number]["data"];
}

function playerPayload(
  facts: RenderFacts,
  cameraX: number,
  cameraY: number,
  motionId: number | null,
): RenderDomainState["roots"][number]["children"][number]["data"] {
  const { x, y, facingDirection, activeMove, playerRef, sceneEpoch, visualEpoch, layout, bridgeLevel } = facts;
  if (activeMove) {
    const fromCamera = computeCamera(facts.loaded.map, activeMove.fromX, activeMove.fromY, layout);
    return {
      sceneEpoch,
      visualEpoch,
      motionId,
      x,
      y,
      screenX: x * 32 - cameraX,
      screenY: y * 32 - cameraY,
      direction: facingDirection,
      pattern: activeMove.startPattern,
      sprite: playerRef,
      motion: playerMotionPayload(activeMove, activeMove.fromX * 32 - fromCamera.cameraX, activeMove.fromY * 32 - fromCamera.cameraY),
      bridgeLevel,
    } as unknown as RenderDomainState["roots"][number]["children"][number]["data"];
  }
  return {
    sceneEpoch,
    visualEpoch,
    motionId,
    x,
    y,
    screenX: x * 32 - cameraX,
    screenY: y * 32 - cameraY,
    direction: facingDirection,
    pattern: 0,
    sprite: playerRef,
    motion: null,
    bridgeLevel,
  } as unknown as RenderDomainState["roots"][number]["children"][number]["data"];
}

function npcPayload(npc: RenderNPC, facts: RenderFacts, cameraX: number, cameraY: number) {
  return {
    sceneEpoch: facts.sceneEpoch,
    visualEpoch: facts.visualEpoch,
    motionId: null,
    x: npc.x,
    y: npc.y,
    screenX: npc.x * 32 - cameraX,
    screenY: npc.y * 32 - cameraY,
    direction: npc.direction,
    pattern: npc.pattern,
    sprite: npc.spriteRef,
    motion: null,
    bridgeLevel: facts.bridgeLevel,
  } as unknown as RenderDomainState["roots"][number]["children"][number]["data"];
}

function projectionBytes(data: unknown): number {
  return new TextEncoder().encode(JSON.stringify(data)).byteLength;
}

function layoutFromViewport(value: { readonly width: number; readonly height: number } | null | undefined): MapLayout | null {
  if (value === null || value === undefined) return null;
  try {
    return calculateLayout(value.width, value.height);
  } catch {
    return null;
  }
}

function layoutsEqual(left: MapLayout, right: MapLayout): boolean {
  return left.windowWidth === right.windowWidth && left.windowHeight === right.windowHeight;
}

function windowCovers(window: TileProjectionWindow, map: MapRecord, required: ReturnType<typeof viewportTileBounds>): boolean {
  return window.source.map === map && boundsContain(window.bounds, required);
}

function selectProjectionWindow(
  loaded: LoadedMap,
  required: ReturnType<typeof viewportTileBounds>,
  cameraX: number,
  cameraY: number,
  cameraMotion: unknown,
  sceneEpoch: number,
  visualEpoch: number,
  motionId: number | null,
  layout: MapLayout,
  bridgeLevel: BridgeLevel,
): TileProjectionWindow {
  for (const margin of [4, 3, 2, 1]) {
    const bounds = expandTileBounds(required, margin, loaded.map);
    const tiles = Object.freeze(projectTilesInBounds(loaded.map, loaded.tileset, bounds, bridgeLevel).map((tile) => Object.freeze([
      tile.x,
      tile.y,
      tile.z,
      tile.tileId,
      tile.depth,
    ]) as TileTuple));
    const candidate: TileProjectionWindow = Object.freeze({ source: loaded, bounds, tiles });
    if (projectionBytes(viewportPayload(loaded, candidate, cameraX, cameraY, cameraMotion, sceneEpoch, visualEpoch, motionId, layout, bridgeLevel)) < VIEW_DATA_GUARD) {
      return candidate;
    }
  }
  throw new RangeError("Map projection budget exceeded");
}

function renderState(facts: RenderFacts): RenderDomainState {
  const { loaded, window, activeMove, sceneEpoch, visualEpoch, layout, bridgeLevel } = facts;
  const motionId = activeMove?.id ?? null;
  const camera = computeCamera(loaded.map, facts.x, facts.y, layout);
  const cameraMotion = activeMove === null ? null : Object.freeze({
    id: activeMove.id,
    durationMs: activeMove.durationMs,
    fromCameraX: computeCamera(loaded.map, activeMove.fromX, activeMove.fromY, layout).cameraX,
    fromCameraY: computeCamera(loaded.map, activeMove.fromX, activeMove.fromY, layout).cameraY,
  });
  return {
    zIndex: 0,
    roots: [{
      key: VIEWPORT_KEY, tag: "lr-map-view", attrs: {},
      data: viewportPayload(loaded, window, camera.cameraX, camera.cameraY, cameraMotion, sceneEpoch, visualEpoch, motionId, layout, bridgeLevel),
      children: [{
        key: PLAYER_KEY, tag: "lr-map-sprite", attrs: {},
        data: playerPayload(facts, camera.cameraX, camera.cameraY, motionId),
        children: [],
      }, ...facts.npcs.map((npc) => ({
        key: npc.renderKey, tag: "lr-map-sprite", attrs: {},
        data: npcPayload(npc, facts, camera.cameraX, camera.cameraY),
        children: [],
      }))],
    }],
  };
}

function assertRenderCapacity(state: RenderDomainState, npcOwned: boolean): void {
  const nodeCount = 1 + (state.roots[0]?.children.length ?? 0);
  if (nodeCount > 16_384) throw new RPGMapError(npcOwned ? "MAP_NPC_INVALID" : "MAP_CONTENT_FAILED", "Render node limit exceeded");
  const bytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;
  if (bytes > 1_000_000) throw new RPGMapError(npcOwned ? "MAP_NPC_INVALID" : "MAP_CONTENT_FAILED", "Render message limit exceeded");
}

interface RuntimeBridge {
  readonly initial: Required<MapEntry>;
  readonly characterName: string;
  readonly moveIntent: Direction | null;
  prepareNPC(mapId: number, fromMapId: number | null, signal: AbortSignal): Promise<readonly NPCPlacement[]>;
  entered(event: MapEnteredEvent, snapshot: MapSnapshot): void;
  updateSnapshot(snapshot: MapSnapshot): void;
  setCommands(commands: { enter(entry: MapEntry): Promise<void>; setNPC(npcs: readonly NPCPlacement[]): Promise<void> }): void;
  setMoveIntentSink(sink: ((intent: Direction | null) => void) | undefined): void;
  setConfirmSink(sink: (() => void) | undefined): void;
  npcInteract(event: NPCInteractEvent): void;
  clear(): void;
}

export interface RPGMapControls {
  setMoveIntent(direction: Direction | null): void;
  confirm(): void;
}

export interface RPGMapHandler {
  readonly controls: RPGMapControls;
  onMapEntering(listener: (context: MapEnteringContext) => void | Promise<void>): () => void;
  onMapEntered(listener: (event: MapEnteredEvent) => void): () => void;
  onNPCInteract(listener: (event: NPCInteractEvent) => void): () => void;
  run(initial: MapEntry): Promise<FrameOutcome>;
  enterMap(target: MapEntry): Promise<void>;
  setNPC(npcs: readonly NPCPlacement[]): Promise<void>;
  getSnapshot(): MapSnapshot | null;
}

class RPGMapHandlerImpl implements RPGMapHandler, RuntimeBridge {
  initial!: Required<MapEntry>;
  readonly characterName: string;
  readonly controls: RPGMapControls;
  private runCalled = false;
  private running = false;
  private terminal = false;
  private currentMoveIntent: Direction | null = null;
  private moveIntentSink?: (intent: Direction | null) => void;
  private confirmSink?: () => void;
  private entering?: (context: MapEnteringContext) => void | Promise<void>;
  private readonly enteredListeners = new Set<(event: MapEnteredEvent) => void>();
  private readonly npcInteractListeners = new Set<(event: NPCInteractEvent) => void>();
  private commands?: { enter(entry: MapEntry): Promise<void>; setNPC(npcs: readonly NPCPlacement[]): Promise<void> };
  private snapshot: MapSnapshot | null = null;

  constructor(private readonly scope: SubsystemScope, private readonly frame: Frame, characterName: string) {
    if (typeof characterName !== "string" || characterName.length === 0) throw new RPGMapError("MAP_INVALID_ARGUMENT");
    this.characterName = characterName;
    this.controls = Object.freeze({
      setMoveIntent: (direction: Direction | null) => this.setMoveIntent(direction),
      confirm: () => this.confirm(),
    });
  }
  get moveIntent(): Direction | null { return this.currentMoveIntent; }
  private setMoveIntent(direction: Direction | null): void {
    if (direction !== null && direction !== 2 && direction !== 4 && direction !== 6 && direction !== 8) {
      throw new TypeError("Invalid RPGMap movement direction");
    }
    if (this.terminal || direction === this.currentMoveIntent) return;
    this.currentMoveIntent = direction;
    this.moveIntentSink?.(direction);
  }
  private confirm(): void {
    if (this.terminal) return;
    this.confirmSink?.();
  }
  setMoveIntentSink(sink: ((intent: Direction | null) => void) | undefined): void {
    this.moveIntentSink = sink;
  }
  setConfirmSink(sink: (() => void) | undefined): void {
    this.confirmSink = sink;
  }
  onMapEntering(listener: (context: MapEnteringContext) => void | Promise<void>): () => void {
    if (this.runCalled || typeof listener !== "function" || this.entering) throw new RPGMapError("MAP_INVALID_STATE");
    this.entering = listener;
    return () => { if (!this.runCalled && this.entering === listener) this.entering = undefined; };
  }
  onMapEntered(listener: (event: MapEnteredEvent) => void): () => void {
    if (this.runCalled || typeof listener !== "function") throw new RPGMapError("MAP_INVALID_STATE");
    this.enteredListeners.add(listener);
    return () => { this.enteredListeners.delete(listener); };
  }
  onNPCInteract(listener: (event: NPCInteractEvent) => void): () => void {
    if (this.runCalled || typeof listener !== "function") throw new RPGMapError("MAP_INVALID_STATE");
    this.npcInteractListeners.add(listener);
    return () => { this.npcInteractListeners.delete(listener); };
  }
  async prepareNPC(mapId: number, fromMapId: number | null, signal: AbortSignal): Promise<readonly NPCPlacement[]> {
    if (!this.entering) return Object.freeze([]);
    let called = false;
    let placements: readonly NPCPlacement[] = [];
    let valid = true;
    const context: MapEnteringContext = Object.freeze({ mapId, fromMapId, signal, setNPC: (values) => {
      if (!valid) throw new RPGMapError("MAP_STALE_SCENE");
      if (called) throw new RPGMapError("MAP_INVALID_STATE", "setNPC must be called exactly once");
      called = true; placements = values;
    } });
    const work = Promise.resolve(this.entering(context));
    const cancelledWork = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new RPGMapError("MAP_CANCELLED")), { once: true }));
    try { await Promise.race([work, cancelledWork]); } finally { valid = false; void work.catch(() => undefined); }
    if (!called) throw new RPGMapError("MAP_INVALID_STATE", "onMapEntering must call context.setNPC exactly once");
    return placements;
  }
  entered(event: MapEnteredEvent, snapshot: MapSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.enteredListeners) {
      try { listener(event); } catch (error) { console.error("[RPGMap] MAP_ENTERED_LISTENER_FAILED", { mapId: event.mapId, message: error instanceof Error ? error.message : "listener failed" }); }
    }
  }
  updateSnapshot(snapshot: MapSnapshot): void { this.snapshot = snapshot; }
  npcInteract(event: NPCInteractEvent): void {
    if (this.terminal) return;
    for (const listener of this.npcInteractListeners) {
      try { listener(event); } catch (error) {
        console.error("[RPGMap] NPC_INTERACT_LISTENER_FAILED", {
          mapId: event.mapId,
          npcId: event.npc.npcId,
          instanceId: event.npc.instanceId,
          message: error instanceof Error ? error.message : "listener failed",
        });
      }
    }
  }
  setCommands(commands: { enter(entry: MapEntry): Promise<void>; setNPC(npcs: readonly NPCPlacement[]): Promise<void> }): void { this.commands = commands; }
  clear(): void {
    this.running = false;
    this.commands = undefined;
    this.snapshot = null;
    this.currentMoveIntent = null;
    this.moveIntentSink = undefined;
    this.confirmSink = undefined;
    this.terminal = true;
  }
  async run(initial: MapEntry): Promise<FrameOutcome> {
    if (this.runCalled) throw new RPGMapError("MAP_ALREADY_RUN");
    this.runCalled = true; this.running = true; this.initial = mapEntry(initial, 2);
    try { return await runMapRuntime(this.scope, this.frame, this); } finally { this.clear(); }
  }
  enterMap(target: MapEntry): Promise<void> {
    if (!this.running || !this.commands) return Promise.reject(new RPGMapError("MAP_INVALID_STATE"));
    return this.commands.enter(target);
  }
  setNPC(npcs: readonly NPCPlacement[]): Promise<void> {
    if (!this.running || !this.commands) return Promise.reject(new RPGMapError("MAP_INVALID_STATE"));
    return this.commands.setNPC(npcs);
  }
  getSnapshot(): MapSnapshot | null {
    if (!this.snapshot) return null;
    return Object.freeze({ mapId: this.snapshot.mapId, player: Object.freeze({ ...this.snapshot.player }), npcs: Object.freeze(this.snapshot.npcs.map((npc) => Object.freeze({ ...npc }))) });
  }
}

export class RPGMapBuilder {
  private built = false;
  constructor(private readonly scope: SubsystemScope, private readonly frame: Frame) {}
  build(options: Readonly<{ player: Readonly<{ characterName: string }> }>): RPGMapHandler {
    if (this.built) throw new RPGMapError("MAP_INVALID_STATE");
    this.built = true;
    return new RPGMapHandlerImpl(this.scope, this.frame, options?.player?.characterName);
  }
}

async function runMapRuntime(scope: SubsystemScope, frame: Frame, api: RuntimeBridge): Promise<FrameOutcome> {
    let domain: RenderDomain | undefined;
    let stepTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeViewport: (() => void) | null = null;
    let activeMove: ActiveMove | null = null;
    let transitioning = false;
    let confirmDispatching = false;
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      unsubscribeViewport?.();
      unsubscribeViewport = null;
      if (resizeTimer !== null) {
        clearTimeout(resizeTimer);
        resizeTimer = null;
      }
      api.setMoveIntentSink(undefined);
      api.setConfirmSink(undefined);
      if (stepTimer !== null) {
        clearTimeout(stepTimer);
        stepTimer = null;
      }
      activeMove = null;
      transitioning = false;
      domain?.close();
    };
    try {
      const input = { mapId: api.initial.mapId, x: api.initial.x, y: api.initial.y, characterName: api.characterName };
      let resolveTerminal!: (outcome: FrameOutcome) => void;
      let terminalSettled = false;
      const terminal = new Promise<FrameOutcome>((resolve) => {
        resolveTerminal = resolve;
      });
      const fatalCommit = (error: unknown): RPGMapError => {
        const failure = new RPGMapError("MAP_COMMIT_FAILED", error instanceof Error ? error.message : "Render commit failed");
        if (!terminalSettled) { terminalSettled = true; resolveTerminal(failed({ code: failure.code, message: failure.message })); }
        return failure;
      };
      const runtimeEnded = () => frame.signal.aborted || terminalSettled;
      const operationBusy = () => transitioning || npcSetting || activeMove !== null || eventBusy;
      const assertCommandReady = () => {
        if (frame.signal.aborted) throw new RPGMapError("MAP_CANCELLED");
        if (terminalSettled) throw new RPGMapError("MAP_INVALID_STATE");
        if (operationBusy()) throw new RPGMapError("MAP_BUSY");
      };
      const replaceDomain = (state: RenderDomainState) => {
        if (runtimeEnded() || !domain) throw new RPGMapError("MAP_INVALID_STATE");
        try { domain.replace(state); } catch (error) { throw fatalCommit(error); }
      };
      const updateDomain = (update: RenderDomainUpdate) => {
        if (runtimeEnded() || !domain) throw new RPGMapError("MAP_INVALID_STATE");
        try { domain.update(update); } catch (error) { throw fatalCommit(error); }
      };

      const loadMap = async (mapId: number): Promise<LoadedMap> => {
        const map = validateMapRecord((await scope.content.record("struct.Map", String(mapId), { signal: frame.signal })).value);
        const transfers = validateMapTransferRecord((await scope.content.record("struct.MapTransfer", String(mapId), { signal: frame.signal })).value, mapId);
        const tileset = validateTilesetRecord((await scope.content.record("struct.Tileset", String(map.tileset_id), { signal: frame.signal })).value, map.tileset_id);
        assertProjectable(map, tileset);
        const tilesetResource = await scope.content.resource("resource.Graphics", `Tilesets/${tileset.tileset_name}`, { signal: frame.signal });
        const autotileRefs = Object.freeze(await Promise.all(tileset.autotile_names.map(async (name) => {
          if (name === null) return null;
          const resource = await scope.content.resource("resource.Graphics", `Autotiles/${name}`, { signal: frame.signal });
          return ref("resource.Graphics", `Autotiles/${name}`, resource.contentVersion);
        })));
        return Object.freeze({
          mapId,
          map,
          tileset,
          tilesetRef: ref("resource.Graphics", `Tilesets/${tileset.tileset_name}`, tilesetResource.contentVersion),
          autotileRefs,
          transfers,
        });
      };

      let current!: LoadedMap;
      let window!: TileProjectionWindow;
      let x = 0;
      let y = 0;
      let facingDirection: Direction = 2;
      let nextMoveId = 1;
      let nextStartPattern: 1 | 3 = 1;
      let playerRef!: ResourceRef;
      let sceneEpoch = 1;
      let visualEpoch = 1;
      let bridgeLevel: BridgeLevel = 0;
      let npcs: readonly RenderNPC[] = Object.freeze([]);
      let nextNPCSerial = 1;
      let lastStarted: string | null = null;
      let eventBusy = false;
      let npcSetting = false;
      let latestLayout = layoutFromViewport(scope.viewport.current);
      let acceptedLayout: MapLayout | null = null;
      let pendingLayout: MapLayout | null = null;
      let settledResize = false;
      let resolveFirstLayout!: (layout: MapLayout) => void;
      const firstLayout = new Promise<MapLayout>((resolve) => { resolveFirstLayout = resolve; });

      const facts = (overrides: Partial<RenderFacts> = {}): RenderFacts => ({
        loaded: overrides.loaded ?? current,
        window: overrides.window ?? window,
        x: overrides.x ?? x,
        y: overrides.y ?? y,
        facingDirection: overrides.facingDirection ?? facingDirection,
        activeMove: overrides.activeMove === undefined ? activeMove : overrides.activeMove,
        playerRef: overrides.playerRef ?? playerRef,
        sceneEpoch: overrides.sceneEpoch ?? sceneEpoch,
        visualEpoch: overrides.visualEpoch ?? visualEpoch,
        layout: overrides.layout ?? acceptedLayout!,
        bridgeLevel: overrides.bridgeLevel ?? bridgeLevel,
        npcs: overrides.npcs ?? npcs,
      });

      const loadNPCs = async (placements: readonly NPCPlacement[], loaded: LoadedMap, playerX: number, playerY: number, preserveKeys: boolean): Promise<readonly RenderNPC[]> => {
        const normalized = normalizeNPCs(placements, loaded.map, playerX, playerY);
        const previous = preserveKeys ? new Map(npcs.map((npc) => [npc.instanceId, npc])) : new Map<string, RenderNPC>();
        return Object.freeze(await Promise.all(normalized.map(async (placement) => {
          const definition = validateNPCDefinition((await scope.content.record("struct.NPC", placement.npcId, { signal: frame.signal })).value);
          const resource = await scope.content.resource(definition.sprite.namespace, definition.sprite.key, { signal: frame.signal });
          assertCharacterPng(resource.bytes, resource.mime);
          const existing = previous.get(placement.instanceId);
          const renderKey = existing?.npcId === placement.npcId ? existing.renderKey : `npc:${nextNPCSerial++}`;
          if (new TextEncoder().encode(renderKey).byteLength > 128 || !Number.isSafeInteger(nextNPCSerial)) throw new RPGMapError("MAP_NPC_INVALID", "NPC render key exhausted");
          return Object.freeze({ ...placement, renderKey, spriteRef: ref(definition.sprite.namespace, definition.sprite.key, resource.contentVersion) });
        })));
      };

      const currentSnapshot = (): MapSnapshot => Object.freeze({ mapId: current.mapId, player: Object.freeze({ x, y, direction: facingDirection }), npcs: Object.freeze(npcs.map(({ instanceId, npcId, x, y, direction, pattern, interactable }) => Object.freeze({ instanceId, npcId, x, y, direction, pattern, interactable }))) });
      const publishSnapshot = (fromMapId: number | null) => {
        const snapshot = currentSnapshot();
        api.entered(Object.freeze({ mapId: current.mapId, fromMapId, player: snapshot.player }), snapshot);
      };

      const standingWindow = (
        loaded: LoadedMap,
        tileX: number,
        tileY: number,
        scene: number,
        visual: number,
        layout: MapLayout = acceptedLayout!,
        level: BridgeLevel = bridgeLevel,
      ) => {
        const camera = computeCamera(loaded.map, tileX, tileY, layout);
        return selectProjectionWindow(
          loaded,
          viewportTileBounds(loaded.map, camera.cameraX, camera.cameraY, layout),
          camera.cameraX,
          camera.cameraY,
          null,
          scene,
          visual,
          null,
          layout,
          level,
        );
      };

      const clearResizeTimer = () => {
        if (resizeTimer !== null) {
          clearTimeout(resizeTimer);
          resizeTimer = null;
        }
      };

      const commitViewportResize = (): boolean => {
        if (runtimeEnded() || transitioning || npcSetting || !domain || pendingLayout === null || acceptedLayout === null) return false;
        const nextLayout = pendingLayout;
        if (layoutsEqual(nextLayout, acceptedLayout)) {
          pendingLayout = null;
          clearResizeTimer();
          return true;
        }
        clearResizeTimer();
        try {
          const nextVisual = visualEpoch + 1;
          const camera = computeCamera(current.map, x, y, nextLayout);
          const required = viewportTileBounds(current.map, camera.cameraX, camera.cameraY, nextLayout);
          const nextWindow = selectProjectionWindow(
            current,
            required,
            camera.cameraX,
            camera.cameraY,
            null,
            sceneEpoch,
            nextVisual,
            null,
            nextLayout,
            bridgeLevel,
          );
          const screenX = x * 32 - camera.cameraX;
          const screenY = y * 32 - camera.cameraY;
          updateDomain({
            nodes: [
              {
                key: VIEWPORT_KEY,
                data: {
                  set: {
                    visualEpoch: nextVisual,
                    viewportWidth: nextLayout.windowWidth,
                    viewportHeight: nextLayout.windowHeight,
                    barHeight: nextLayout.barHeight,
                    contentWidth: nextLayout.contentWidth,
                    contentHeight: nextLayout.contentHeight,
                    columns: nextLayout.columns,
                    rows: nextLayout.rows,
                    logicalWidth: nextLayout.logicalWidth,
                    logicalHeight: nextLayout.logicalHeight,
                    scaleX: nextLayout.scaleX,
                    scaleY: nextLayout.scaleY,
                    cameraX: camera.cameraX,
                    cameraY: camera.cameraY,
                    cameraMotion: null,
                    motionId: null,
                    projectionBounds: projectionBoundsPayload(nextWindow.bounds),
                    tiles: nextWindow.tiles,
                    bridgeLevel,
                  },
                },
              },
              {
                key: PLAYER_KEY,
                data: {
                  set: {
                    visualEpoch: nextVisual,
                    screenX,
                    screenY,
                    motion: null,
                    motionId: null,
                    pattern: 0,
                    bridgeLevel,
                  },
                },
              },
              ...npcs.map((npc) => ({
                key: npc.renderKey,
                data: { set: {
                  visualEpoch: nextVisual,
                  screenX: npc.x * 32 - camera.cameraX,
                  screenY: npc.y * 32 - camera.cameraY,
                  motion: null,
                  motionId: null,
                  bridgeLevel,
                } as RenderDataSet },
              })),
            ],
          });
          pendingLayout = null;
          acceptedLayout = nextLayout;
          window = nextWindow;
          visualEpoch = nextVisual;
          settledResize = true;
          return true;
        } catch (error) {
          if (!terminalSettled) {
            terminalSettled = true;
            resolveTerminal(failed({ code: "MAP_COMMIT_FAILED", message: error instanceof Error ? error.message : "Viewport render commit failed" }));
          }
          return false;
        }
      };

      const scheduleSettledResize = () => {
        if (activeMove !== null || transitioning || npcSetting) return;
        if (!settledResize) {
          commitViewportResize();
          return;
        }
        clearResizeTimer();
        resizeTimer = setTimeout(() => {
          resizeTimer = null;
          if (frame.signal.aborted || transitioning || activeMove !== null) return;
          commitViewportResize();
        }, RESIZE_SETTLE_MS);
      };

      const noteViewport = (value: { readonly width: number; readonly height: number } | null) => {
        if (runtimeEnded()) return;
        const next = layoutFromViewport(value);
        if (next === null) return;
        latestLayout = next;
        resolveFirstLayout(next);
        if (!domain || acceptedLayout === null) return;
        if (layoutsEqual(next, acceptedLayout)) {
          pendingLayout = null;
          clearResizeTimer();
          return;
        }
        pendingLayout = next;
        if (transitioning) return;
        scheduleSettledResize();
      };

      const failTransfer = (error: unknown) => {
        if (runtimeEnded()) return;
        terminalSettled = true;
        resolveTerminal(failed({
          code: error instanceof RPGMapError && error.code === "MAP_COMMIT_FAILED" ? "MAP_COMMIT_FAILED" : "MAP_TRANSFER_FAILED",
          message: error instanceof Error ? error.message : "Map transfer failed",
        }));
      };

      const beginTransfer = async (rule: TransferRule, attemptedDirection: Direction): Promise<void> => {
        if (runtimeEnded() || transitioning) return;
        transitioning = true;
        try {
          const target = await loadMap(rule.targetMapId);
          if (frame.signal.aborted || !transitioning) {
            transitioning = false;
            return;
          }
          if (!inBounds(target.map, rule.targetX, rule.targetY)) throw new TypeError("Map transfer target lies outside the loaded Map");
          const nextDirection = "targetDirection" in rule ? rule.targetDirection ?? attemptedDirection : attemptedDirection;
          const requestedNPCs = await api.prepareNPC(target.mapId, current.mapId, frame.signal);
          const nextNPCs = await loadNPCs(requestedNPCs, target, rule.targetX, rule.targetY, false);
          if (runtimeEnded() || !transitioning) return;
          const nextScene = sceneEpoch + 1;
          const nextVisual = visualEpoch + 1;
          const liveLayout = latestLayout ?? acceptedLayout!;
          const nextWindow = standingWindow(target, rule.targetX, rule.targetY, nextScene, nextVisual, liveLayout, 0);
          const nextFacts = facts({
            loaded: target,
            window: nextWindow,
            x: rule.targetX,
            y: rule.targetY,
            facingDirection: nextDirection,
            activeMove: null,
            sceneEpoch: nextScene,
            visualEpoch: nextVisual,
            layout: liveLayout,
            bridgeLevel: 0,
            npcs: nextNPCs,
          });
          const nextState = renderState(nextFacts);
          assertRenderCapacity(nextState, nextNPCs.length > 0);
          replaceDomain(nextState);
          const fromMapId = current.mapId;
          current = target;
          window = nextWindow;
          x = rule.targetX;
          y = rule.targetY;
          facingDirection = nextDirection;
          sceneEpoch = nextScene;
          visualEpoch = nextVisual;
          acceptedLayout = liveLayout;
          pendingLayout = null;
          clearResizeTimer();
          activeMove = null;
          bridgeLevel = 0;
          npcs = nextNPCs;
          lastStarted = null;
          eventBusy = false;
          if (stepTimer !== null) {
            clearTimeout(stepTimer);
            stepTimer = null;
          }
          nextStartPattern = 1;
          transitioning = false;
          publishSnapshot(fromMapId);
          if (frame.signal.aborted) return;
          pumpMoveIntent();
        } catch (error) {
          transitioning = false;
          throw error;
        }
      };

      api.setCommands({
        enter: async (entry) => {
          assertCommandReady();
          const target = mapEntry(entry, facingDirection);
          const rule: StepTransfer = { x, y, targetMapId: target.mapId, targetX: target.x, targetY: target.y, targetDirection: target.direction };
          try { await beginTransfer(rule, facingDirection); } catch (error) {
            if (error instanceof RPGMapError) throw error;
            throw new RPGMapError("MAP_CONTENT_FAILED", error instanceof Error ? error.message : "Map entry failed");
          }
        },
        setNPC: async (placements) => {
          assertCommandReady();
          npcSetting = true;
          const epoch = sceneEpoch;
          const stableMap = current;
          const stableX = x;
          const stableY = y;
          const stableNPCs = npcs;
          try {
            let nextNPCs: readonly RenderNPC[];
            try {
              nextNPCs = await loadNPCs(placements, stableMap, stableX, stableY, true);
            } catch (error) {
              if (error instanceof RPGMapError) throw error;
              throw new RPGMapError("MAP_CONTENT_FAILED", error instanceof Error ? error.message : "NPC content failed");
            }
            if (frame.signal.aborted) throw new RPGMapError("MAP_CANCELLED");
            if (terminalSettled) throw new RPGMapError("MAP_INVALID_STATE");
            if (epoch !== sceneEpoch || current !== stableMap) throw new RPGMapError("MAP_STALE_SCENE");
            if (transitioning || activeMove !== null || eventBusy || x !== stableX || y !== stableY || npcs !== stableNPCs) {
              throw new RPGMapError("MAP_STALE_SCENE");
            }
            const nextState = renderState(facts({ npcs: nextNPCs }));
            assertRenderCapacity(nextState, true);
            replaceDomain(nextState);
            npcs = nextNPCs;
            api.updateSnapshot(currentSnapshot());
          } finally {
            npcSetting = false;
            if (pendingLayout !== null && activeMove === null && !transitioning && !terminalSettled) scheduleSettledResize();
          }
        },
      });

      const startTransfer = (rule: TransferRule, attemptedDirection: Direction) => {
        if (runtimeEnded() || transitioning) return;
        void beginTransfer(rule, attemptedDirection).catch(failTransfer);
      };

      const publishBlocked = (nextDirection: Direction) => {
        const nextWindow = window.source === current ? window : standingWindow(current, x, y, sceneEpoch, visualEpoch);
        replaceDomain(renderState(facts({ facingDirection: nextDirection, window: nextWindow, activeMove: null })));
        facingDirection = nextDirection;
        window = nextWindow;
        activeMove = null;
        api.updateSnapshot(currentSnapshot());
      };

      const publishFacingUpdate = (nextFacingDirection: Direction) => {
        if (runtimeEnded() || activeMove === null || nextFacingDirection === facingDirection) return;
        updateDomain({
          nodes: [{ key: PLAYER_KEY, data: { set: { direction: nextFacingDirection } as RenderDataSet } }],
        });
        facingDirection = nextFacingDirection;
        api.updateSnapshot(currentSnapshot());
      };

      const publishMovementUpdate = (nextX: number, nextY: number, nextDirection: Direction, nextMove: ActiveMove | null) => {
        const fromX = nextMove?.fromX ?? x;
        const fromY = nextMove?.fromY ?? y;
        const sourceCamera = computeCamera(current.map, fromX, fromY, acceptedLayout!);
        const targetCamera = computeCamera(current.map, nextX, nextY, acceptedLayout!);
        const required = nextMove === null
          ? viewportTileBounds(current.map, targetCamera.cameraX, targetCamera.cameraY, acceptedLayout!)
          : unionTileBounds(
            viewportTileBounds(current.map, sourceCamera.cameraX, sourceCamera.cameraY, acceptedLayout!),
            viewportTileBounds(current.map, targetCamera.cameraX, targetCamera.cameraY, acceptedLayout!),
          );
        const motionId = nextMove?.id ?? null;
        const cameraMotion = nextMove === null ? null : Object.freeze({
          id: nextMove.id,
          durationMs: nextMove.durationMs,
          fromCameraX: sourceCamera.cameraX,
          fromCameraY: sourceCamera.cameraY,
        });
        let nextWindow = window;
        let nextVisual = visualEpoch;
        let refresh = false;
        if (!(window.source === current && windowCovers(window, current.map, required))) {
          nextVisual = visualEpoch + 1;
          nextWindow = selectProjectionWindow(
            current,
            required,
            targetCamera.cameraX,
            targetCamera.cameraY,
            cameraMotion,
            sceneEpoch,
            nextVisual,
            motionId,
            acceptedLayout!,
            bridgeLevel,
          );
          refresh = true;
        }
        const screenX = nextX * 32 - targetCamera.cameraX;
        const screenY = nextY * 32 - targetCamera.cameraY;
        const fromScreenX = fromX * 32 - sourceCamera.cameraX;
        const fromScreenY = fromY * 32 - sourceCamera.cameraY;
        const viewportSet: Record<string, unknown> = {
          cameraX: targetCamera.cameraX,
          cameraY: targetCamera.cameraY,
          cameraMotion,
          motionId,
          bridgeLevel,
        };
        const playerSet: Record<string, unknown> = {
          x: nextX,
          y: nextY,
          screenX,
          screenY,
          direction: nextDirection,
          pattern: nextMove === null ? 0 : nextMove.startPattern,
          motion: nextMove === null ? null : playerMotionPayload(nextMove, fromScreenX, fromScreenY),
          motionId,
          bridgeLevel,
        };
        if (refresh) {
          viewportSet.visualEpoch = nextVisual;
          viewportSet.projectionBounds = projectionBoundsPayload(nextWindow.bounds);
          viewportSet.tiles = nextWindow.tiles;
          playerSet.visualEpoch = nextVisual;
        }
        updateDomain({
          nodes: [
            { key: VIEWPORT_KEY, data: { set: viewportSet as RenderDataSet } },
            { key: PLAYER_KEY, data: { set: playerSet as RenderDataSet } },
            ...npcs.map((npc) => ({ key: npc.renderKey, data: { set: {
              screenX: npc.x * 32 - targetCamera.cameraX,
              screenY: npc.y * 32 - targetCamera.cameraY,
              ...(refresh ? { visualEpoch: nextVisual } : {}),
            } as RenderDataSet } })),
          ],
        });
        window = nextWindow;
        visualEpoch = nextVisual;
        x = nextX;
        y = nextY;
        facingDirection = nextDirection;
        activeMove = nextMove;
        api.updateSnapshot(currentSnapshot());
      };

      const behaviorKey = (action: MapBehavior) => action.occupied.map((point) => `${point.x},${point.y}`).join(";");
      const hereActions = (tileX: number, tileY: number) => current.map.behaviors.filter((action) => occupies(action, tileX, tileY));

      const releaseLastStartedIfLeft = () => {
        if (lastStarted === null) return;
        if (hereActions(x, y).some((action) => behaviorKey(action) === lastStarted)) return;
        lastStarted = null;
      };

      const executeAction = (action: MapBehavior) => {
        eventBusy = true;
        try {
          const nextLevel: BridgeLevel = action.operation === "on" ? 2 : 0;
          assertBridgeLevel(nextLevel);
          const levelChanged = nextLevel !== bridgeLevel;
          const nextVisual = levelChanged ? visualEpoch + 1 : visualEpoch;
          let nextWindow = window;
          if (levelChanged) {
            const camera = computeCamera(current.map, x, y, acceptedLayout!);
            const required = viewportTileBounds(current.map, camera.cameraX, camera.cameraY, acceptedLayout!);
            nextWindow = selectProjectionWindow(
              current,
              required,
              camera.cameraX,
              camera.cameraY,
              null,
              sceneEpoch,
              nextVisual,
              null,
              acceptedLayout!,
              nextLevel,
            );
          }
          const viewportSet: Record<string, unknown> = { bridgeLevel: nextLevel };
          const playerSet: Record<string, unknown> = { bridgeLevel: nextLevel };
          if (levelChanged) {
            viewportSet.visualEpoch = nextVisual;
            viewportSet.projectionBounds = projectionBoundsPayload(nextWindow.bounds);
            viewportSet.tiles = nextWindow.tiles;
            viewportSet.cameraMotion = null;
            viewportSet.motionId = null;
            playerSet.visualEpoch = nextVisual;
            playerSet.motion = null;
            playerSet.motionId = null;
          }
          updateDomain({
            nodes: [
              { key: VIEWPORT_KEY, data: { set: viewportSet as RenderDataSet } },
              { key: PLAYER_KEY, data: { set: playerSet as RenderDataSet } },
              ...npcs.map((npc) => ({ key: npc.renderKey, data: { set: {
                bridgeLevel: nextLevel,
                ...(levelChanged ? { visualEpoch: nextVisual, motion: null, motionId: null } : {}),
              } as RenderDataSet } })),
            ],
          });
          bridgeLevel = nextLevel;
          visualEpoch = nextVisual;
          window = nextWindow;
          if (levelChanged) activeMove = null;
        } finally {
          eventBusy = false;
        }
      };

      const startHere = (tileX: number, tileY: number): boolean => {
        releaseLastStartedIfLeft();
        const action = hereActions(tileX, tileY).find((item) => behaviorKey(item) !== lastStarted);
        if (!action) return false;
        lastStarted = behaviorKey(action);
        executeAction(action);
        return true;
      };

      const attemptUnsafe = (next: Direction) => {
        const { dx, dy } = stepDelta[next];
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(current.map, nx, ny)) {
          const contact = current.transfers.contacts.find((rule) => rule.x === x && rule.y === y && rule.direction === next);
          if (contact) {
            startTransfer(contact, next);
            return;
          }
        }
        const plan: MovementPlan = planMovement(current.map, current.tileset, x, y, next, bridgeLevel);
        if (plan.kind === "blocked") {
          if (!inBounds(current.map, nx, ny)) {
            const edge = current.transfers.edges.find((rule) => rule.x === x && rule.y === y && rule.direction === next);
            if (edge) {
              startTransfer(edge, next);
              return;
            }
          }
          if (stepTimer !== null) {
            clearTimeout(stepTimer);
            stepTimer = null;
          }
          nextStartPattern = 1;
          publishBlocked(next);
          return;
        }
        if (npcs.some((npc) => npc.x === plan.toX && npc.y === plan.toY)) {
          if (stepTimer !== null) { clearTimeout(stepTimer); stepTimer = null; }
          nextStartPattern = 1;
          publishBlocked(next);
          return;
        }
        const moveId = nextMoveId;
        const nextMove: ActiveMove = plan.kind === "jump"
          ? { id: moveId, fromX: x, fromY: y, toX: plan.toX, toY: plan.toY, travelDirection: next, startPattern: nextStartPattern, durationMs: JUMP_DURATION_MS, kind: "jump", peakPx: plan.peakPx }
          : { id: moveId, fromX: x, fromY: y, toX: plan.toX, toY: plan.toY, travelDirection: next, startPattern: nextStartPattern, durationMs: WALK_DURATION_MS, kind: "walk" };
        publishMovementUpdate(plan.toX, plan.toY, next, nextMove);
        nextMoveId += 1;
        stepTimer = setTimeout(() => {
          try { finishStep(moveId); } catch (error) {
            if (!(error instanceof RPGMapError && error.code === "MAP_COMMIT_FAILED")) fatalCommit(error);
          }
        }, nextMove.durationMs);
      };

      const attempt = (next: Direction) => {
        try { attemptUnsafe(next); } catch (error) {
          if (!(error instanceof RPGMapError && error.code === "MAP_COMMIT_FAILED")) fatalCommit(error);
        }
      };

      const pumpMoveIntent = (): boolean => {
        if (runtimeEnded() || operationBusy() || api.moveIntent === null) return false;
        attempt(api.moveIntent);
        return true;
      };

      const finishStep = (moveId: number) => {
        if (frame.signal.aborted || activeMove?.id !== moveId) return;
        const completedMove = activeMove;
        stepTimer = null;
        const step = current.transfers.steps.find((rule) => rule.x === x && rule.y === y);
        if (step) {
          startTransfer(step, completedMove.travelDirection);
          return;
        }
        const hadPendingResize = pendingLayout !== null;
        const resizeCommitted = hadPendingResize && commitViewportResize();
        if (terminalSettled) return;
        activeMove = null;
        startHere(x, y);
        if (terminalSettled) return;
        if (api.moveIntent !== null) {
          nextStartPattern = nextStartPattern === 1 ? 3 : 1;
          pumpMoveIntent();
          return;
        }
        nextStartPattern = 1;
        if (!resizeCommitted) publishMovementUpdate(x, y, facingDirection, null);
      };

      unsubscribeViewport = scope.viewport.subscribe((value) => noteViewport(value));
      if (latestLayout === null) {
        const initial = await Promise.race([
          firstLayout,
          waitForAbort(frame.signal).then(() => null),
        ]);
        if (initial === null) throw new Error("Map activation cancelled while waiting for viewport");
        latestLayout = initial;
      }
      acceptedLayout = latestLayout;
      const loaded = await loadMap(input.mapId);
      if (!inBounds(loaded.map, input.x, input.y)) throw new TypeError("Map spawn lies outside the loaded Map");
      const initialDirection = api.initial.direction;
      const requestedNPCs = await api.prepareNPC(loaded.mapId, null, frame.signal);
      const initialNPCs = await loadNPCs(requestedNPCs, loaded, input.x, input.y, false);
      const playerResource = await scope.content.resource("resource.Graphics", `Characters/${input.characterName}`, { signal: frame.signal });
      playerRef = ref("resource.Graphics", `Characters/${input.characterName}`, playerResource.contentVersion);
      latestLayout = layoutFromViewport(scope.viewport.current) ?? latestLayout;
      acceptedLayout = latestLayout!;
      const spawnWindow = standingWindow(loaded, input.x, input.y, 1, 1, acceptedLayout);
      const initial = renderState({
        loaded,
        window: spawnWindow,
        x: input.x,
        y: input.y,
        facingDirection: initialDirection,
        activeMove: null,
        playerRef,
        sceneEpoch: 1,
        visualEpoch: 1,
        layout: acceptedLayout,
        bridgeLevel: 0,
        npcs: initialNPCs,
      });
      assertRenderCapacity(initial, initialNPCs.length > 0);
      try { domain = scope.createRenderDomain(initial); } catch (error) { throw fatalCommit(error); }
      current = loaded;
      window = spawnWindow;
      x = input.x;
      y = input.y;
      facingDirection = initialDirection;
      npcs = initialNPCs;
      sceneEpoch = 1;
      visualEpoch = 1;
      nextMoveId = 1;
      nextStartPattern = 1;
      transitioning = false;
      activeMove = null;
      bridgeLevel = 0;
      lastStarted = null;
      eventBusy = false;
      publishSnapshot(null);
      api.setMoveIntentSink((intent) => {
        try {
          if (activeMove !== null && intent !== null) publishFacingUpdate(intent);
          else pumpMoveIntent();
        } catch (error) {
          if (!(error instanceof RPGMapError && error.code === "MAP_COMMIT_FAILED")) fatalCommit(error);
        }
      });
      api.setConfirmSink(() => {
        if (runtimeEnded() || operationBusy() || confirmDispatching) return;
        const { dx, dy } = stepDelta[facingDirection];
        const targetX = x + dx;
        const targetY = y + dy;
        const target = npcs.find((npc) => npc.interactable && npc.x === targetX && npc.y === targetY);
        if (!target) return;
        const event: NPCInteractEvent = Object.freeze({
          mapId: current.mapId,
          npc: Object.freeze({ instanceId: target.instanceId, npcId: target.npcId, x: target.x, y: target.y }),
          player: Object.freeze({ x, y, direction: facingDirection }),
        });
        confirmDispatching = true;
        try { api.npcInteract(event); } finally { confirmDispatching = false; }
      });
      pumpMoveIntent();
      const outcome = await Promise.race([
        terminal,
        waitForAbort(frame.signal).then(() => cancelled()),
      ]);
      cleanup();
      return outcome;
    } catch (error) {
      cleanup();
      if (frame.signal.aborted) return cancelled();
      if (error instanceof RPGMapError && error.code === "MAP_COMMIT_FAILED") return failed({ code: error.code, message: error.message });
      return failed({ code: "MAP_ACTIVATION_FAILED", message: error instanceof Error ? error.message : "Map activation failed" });
    }
}
