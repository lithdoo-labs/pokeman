import { calculateTileViewportLayout, RESIZE_SETTLE_MS, TILE_SIZE_PX, type TileViewportLayout } from "@loomrealm-game/tile-presentation";
import type { Frame, RenderDomain, RenderDomainState, RenderDomainUpdate, SubsystemScope, ViewportSize } from "@loomrealm/subsystem";
import {
  compareActorId, validateBattleEffectContent, validateBattleSceneInit, validateRenderProjection,
  type ActorRenderProjection, type BattleEffectContent, type BattleSceneInit, type PresentationPort,
  type PresentationErrorCode, type PresentationFailure, type RenderProjection,
  type ResolvedResourceRef, type SkillEffectProjection,
} from "./contracts.js";
import {
  cameraFor, projectTiles, sameEffectProjection, sameLayout, sameMovement, sameProjection,
  validateBattleArena, validateTileset, type LoadedBattleArena,
} from "./presentation-semantics.js";

export type { PresentationErrorCode } from "./contracts.js";
export { validateBattleArena } from "./presentation-semantics.js";

export class BattlePresentationError extends Error {
  constructor(readonly code: PresentationErrorCode, message: string = code, options?: ErrorOptions) { super(message, options); this.name = "BattlePresentationError"; }
}
export interface BattlePresentationHandler extends PresentationPort {}
type State = "NEW" | "INITIALIZING" | "INITIALIZED" | "READY" | "PAUSED" | "CLOSED";
type EffectAsset = Readonly<{ content: BattleEffectContent; image: ResolvedResourceRef }>;
const encoder = new TextEncoder();
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).byteLength;
const textBytes = (value: string) => encoder.encode(value).byteLength;
const RENDER_MAX_NODES = 16_384;
const RENDER_MAX_NODE_OPS = 4_096;
const RENDER_MAX_NODE_DATA_BYTES = 262_144;
const RENDER_MAX_KEY_BYTES = 128;
const BATTLE_MAX_VIEW_DATA_BYTES = 196_608;
const BATTLE_MAX_COMMIT_BYTES = 1_000_000;
const safeProduct = (left: number, right: number, label: string): number => {
  const value = left * right;
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} exceeds the safe integer range`);
  return value;
};
const safeSum = (left: number, right: number, label: string): number => {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} exceeds the safe integer range`);
  return value;
};
const resolved = (namespace: string, key: string, contentVersion: string): ResolvedResourceRef => {
  if ([namespace, key, contentVersion].some((value) => typeof value !== "string" || value.length === 0)) {
    throw new TypeError("Resolved resource identity must contain non-empty strings");
  }
  return Object.freeze({ namespace, key, contentVersion });
};
function contentFailure(error: unknown): BattlePresentationError { return error instanceof BattlePresentationError ? error : new BattlePresentationError("PRESENTATION_CONTENT_FAILED", error instanceof Error ? error.message : "Content preparation failed", { cause: error }); }
function invalidData(error: unknown): BattlePresentationError { return error instanceof BattlePresentationError ? error : new BattlePresentationError("PRESENTATION_INVALID_DATA", error instanceof Error ? error.message : "Invalid presentation data", { cause: error }); }

class Handler implements BattlePresentationHandler {
  private state: State = "NEW"; private session = new AbortController(); private generation = 0;
  private scene?: BattleSceneInit; private loaded?: LoadedBattleArena; private actorRefs = new Map<string, ResolvedResourceRef>(); private effects = new Map<string, EffectAsset>();
  private layout?: TileViewportLayout; private domain?: RenderDomain; private unsubscribe?: () => void; private resizeTimer?: ReturnType<typeof setTimeout>; private pendingViewport?: ViewportSize;
  private visualEpoch = 0; private lastTick = -1; private projection?: RenderProjection; private seenEffects = new Map<string, SkillEffectProjection>(); private motionFacts = new Map<string, NonNullable<ActorRenderProjection["movement"]>>();
  private resolveFailure!: (failure: PresentationFailure) => void; private failureReported = false;
  readonly failure: Promise<PresentationFailure>;
  private readonly abortListener = () => this.close();
  constructor(private readonly scope: SubsystemScope, private readonly frame: Frame) {
    this.failure = new Promise<PresentationFailure>((resolveFailure) => { this.resolveFailure = resolveFailure; });
    frame.signal.addEventListener("abort", this.abortListener, { once: true }); scope.signal.addEventListener("abort", this.abortListener, { once: true });
    if (frame.signal.aborted || scope.signal.aborted) this.close();
  }
  async initialize(scene: BattleSceneInit): Promise<void> {
    if (this.state !== "NEW") throw new BattlePresentationError("PRESENTATION_INVALID_STATE");
    this.state = "INITIALIZING"; const generation = ++this.generation;
    try {
      let validatedScene: BattleSceneInit;
      try { validatedScene = validateBattleSceneInit(scene); } catch (error) { throw invalidData(error); }
      this.scene = validatedScene; scene = validatedScene;
      const signal = this.session.signal;
      const mapTask = (async () => {
        const arena = validateBattleArena((await this.scope.content.record("struct.BattleArena", scene.map.arenaId, { signal })).value, scene.map.arenaId);
        const tileset = validateTileset((await this.scope.content.record("struct.Tileset", String(arena.tileset_id), { signal })).value, arena.tileset_id);
        const tilesetKey = `Tilesets/${tileset.tileset_name}`; const tilesetResource = await this.scope.content.resource("resource.Graphics", tilesetKey, { signal });
        const autotileRefs = await Promise.all(tileset.autotile_names.map(async (name) => name === null ? null : resolved("resource.Graphics", `Autotiles/${name}`, (await this.scope.content.resource("resource.Graphics", `Autotiles/${name}`, { signal })).contentVersion)));
        for (const tileId of arena.data.values) {
          if (tileId === 0) continue;
          const slot = tileId >= 48 && tileId < 384 ? Math.floor((tileId - 48) / 48) : -1;
          if (tileId < 48 || tileId >= tileset.priorities.xSize || (slot >= 0 && autotileRefs[slot] === null)) throw new TypeError(`Unsupported map tile ${tileId}`);
        }
        return Object.freeze({ arena, tileset, tilesetRef: resolved("resource.Graphics", tilesetKey, tilesetResource.contentVersion), autotileRefs: Object.freeze(autotileRefs) });
      })();
      const actorTask = Promise.all(scene.actors.map(async (actor) => [actor.actorId, resolved(actor.character.namespace, actor.character.key, (await this.scope.content.resource(actor.character.namespace, actor.character.key, { signal })).contentVersion)] as const));
      const effectTask = Promise.all(scene.effectIds.map(async (id) => {
        const content = validateBattleEffectContent((await this.scope.content.record("struct.BattleEffect", id, { signal })).value, id);
        const resource = await this.scope.content.resource(content.image.namespace, content.image.key, { signal });
        return [id, Object.freeze({ content, image: resolved(content.image.namespace, content.image.key, resource.contentVersion) })] as const;
      }));
      const [loaded, actors, effects] = await Promise.all([mapTask, actorTask, effectTask]);
      const viewport = await this.firstViewport(signal);
      if (this.state !== "INITIALIZING" || generation !== this.generation || signal.aborted) return;
      let layout: TileViewportLayout;
      try { layout = calculateTileViewportLayout(viewport.width, viewport.height); } catch (error) { throw invalidData(error); }
      this.loaded = loaded; this.actorRefs = new Map(actors); this.effects = new Map(effects); this.layout = layout;
      this.unsubscribe = this.scope.viewport.subscribe((value) => this.onViewport(value));
      const current = this.scope.viewport.current;
      if (current !== null && (current.width !== viewport.width || current.height !== viewport.height)) this.onViewport(current);
      this.state = "INITIALIZED";
    } catch (error) {
      if (this.session.signal.aborted) return;
      this.close(); throw error instanceof BattlePresentationError ? error : contentFailure(error);
    }
  }
  render(projection: RenderProjection): void {
    if (this.state === "CLOSED") return;
    if (this.state !== "INITIALIZED" && this.state !== "READY" && this.state !== "PAUSED") throw new BattlePresentationError("PRESENTATION_INVALID_STATE");
    try { projection = validateRenderProjection(projection); } catch (error) { throw invalidData(error); }
    if (projection.sceneEpoch !== this.scene!.sceneEpoch) throw new BattlePresentationError("PRESENTATION_SCENE_MISMATCH");
    const roster = [...this.scene!.actors.map((a) => a.actorId)].sort(compareActorId), incoming = [...projection.actors.map((a) => a.actorId)].sort(compareActorId);
    if (roster.length !== incoming.length || roster.some((actorId, index) => actorId !== incoming[index]) || projection.effectStarts.some((effect) => !this.effects.has(effect.effect))) throw new BattlePresentationError("PRESENTATION_INVALID_DATA");
    const inside = (point: { readonly x: number; readonly y: number }) => point.x < this.loaded!.arena.width && point.y < this.loaded!.arena.height;
    if (projection.actors.some((actor) => !inside(actor.tile) || (actor.movement !== null && (!inside(actor.movement.from) || !inside(actor.movement.to)))) || projection.effectStarts.some((effect) => effect.tile !== null && !inside(effect.tile))) throw new BattlePresentationError("PRESENTATION_INVALID_DATA");
    if (projection.tick < this.lastTick) return;
    if (projection.tick === this.lastTick) {
      if (this.projection !== undefined && sameProjection(projection, this.projection)) return;
      throw new BattlePresentationError("PRESENTATION_PROJECTION_CONFLICT");
    }
    for (const actor of projection.actors) if (actor.movement) {
      const key = `${actor.actorId}\0${actor.movement.motionId}`, previous = this.motionFacts.get(key);
      if (previous !== undefined && !sameMovement(previous, actor.movement)) throw new BattlePresentationError("PRESENTATION_PROJECTION_CONFLICT"); this.motionFacts.set(key, actor.movement);
    }
    const starts = this.consumeEffects(projection.effectStarts);
    const nextEpoch = this.visualEpoch + 1; if (!Number.isSafeInteger(nextEpoch)) throw this.failCommit(new Error("visualEpoch exhausted"));
    let payload: ReturnType<Handler["payloads"]>; try { payload = this.payloads(projection, nextEpoch, starts, this.state === "PAUSED"); } catch (error) { throw this.failCommit(error); }
    if (this.state === "INITIALIZED") {
      const initial = this.renderState(payload); this.preflight(initial, payload.view, initial, "state");
      try { this.domain = this.scope.createRenderDomain(initial); } catch (error) { throw this.failCommit(error); }
      this.state = "READY";
    } else {
      const update = this.renderUpdate(payload); this.preflight(update, payload.view, this.renderState(payload), "update");
      try { this.domain!.update(update); } catch (error) { throw this.failCommit(error); }
    }
    this.visualEpoch = nextEpoch; this.lastTick = projection.tick; this.projection = projection;
  }
  pause(): void {
    if (this.state === "CLOSED" || this.state === "PAUSED") return; if (this.state !== "READY") throw new BattlePresentationError("PRESENTATION_INVALID_STATE");
    this.commitLocal(true); this.state = "PAUSED";
  }
  resume(): void {
    if (this.state === "CLOSED" || this.state === "READY") return; if (this.state !== "PAUSED") throw new BattlePresentationError("PRESENTATION_INVALID_STATE");
    this.commitLocal(false); this.state = "READY";
  }
  close(): void {
    if (this.state === "CLOSED") return; this.state = "CLOSED"; this.generation += 1; this.session.abort();
    this.frame.signal.removeEventListener("abort", this.abortListener); this.scope.signal.removeEventListener("abort", this.abortListener);
    const unsubscribe = this.unsubscribe; this.unsubscribe = undefined; try { unsubscribe?.(); } catch {}
    if (this.resizeTimer) clearTimeout(this.resizeTimer); this.resizeTimer = undefined; this.pendingViewport = undefined;
    const domain = this.domain; this.domain = undefined; try { domain?.close(); } catch {}
    this.effects.clear(); this.actorRefs.clear(); this.seenEffects.clear(); this.motionFacts.clear();
    this.projection = undefined; this.loaded = undefined; this.layout = undefined; this.scene = undefined;
  }
  private firstViewport(signal: AbortSignal): Promise<ViewportSize> {
    if (signal.aborted) return Promise.reject(new DOMException("Presentation closed", "AbortError"));
    if (this.scope.viewport.current !== null) return Promise.resolve(this.scope.viewport.current);
    return new Promise((resolve, reject) => {
      let settled = false; let unsubscribe = () => {};
      const finish = (value: ViewportSize) => {
        if (settled) return; settled = true; unsubscribe(); signal.removeEventListener("abort", aborted); resolve(value);
      };
      const aborted = () => {
        if (settled) return; settled = true; unsubscribe(); reject(new DOMException("Presentation closed", "AbortError"));
      };
      unsubscribe = this.scope.viewport.subscribe((value) => { if (value !== null) finish(value); });
      if (settled) unsubscribe();
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) aborted();
    });
  }
  private onViewport(value: ViewportSize | null) {
    if (this.state === "CLOSED" || value === null) return; this.pendingViewport = Object.freeze({ width: value.width, height: value.height }); if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = undefined;
      try { this.settleResize(); } catch (error) { this.reportAsyncFailure(error); }
    }, RESIZE_SETTLE_MS);
  }
  private settleResize() {
    if (this.state === "CLOSED" || !this.pendingViewport || !this.layout) return;
    let layout: TileViewportLayout; try { layout = calculateTileViewportLayout(this.pendingViewport.width, this.pendingViewport.height); } catch (error) { throw this.failCommit(error); }
    this.pendingViewport = undefined; if (sameLayout(layout, this.layout)) return; this.layout = layout;
    if ((this.state === "READY" || this.state === "PAUSED") && this.projection) this.commitLocal(this.state === "PAUSED");
  }
  private commitLocal(paused: boolean) {
    const nextEpoch = this.visualEpoch + 1; if (!Number.isSafeInteger(nextEpoch)) throw this.failCommit(new Error("visualEpoch exhausted"));
    let payload: ReturnType<Handler["payloads"]>; try { payload = this.payloads(this.projection!, nextEpoch, [], paused); } catch (error) { throw this.failCommit(error); } const update = this.renderUpdate(payload); this.preflight(update, payload.view, this.renderState(payload), "update");
    try { this.domain!.update(update); } catch (error) { throw this.failCommit(error); } this.visualEpoch = nextEpoch;
  }
  private consumeEffects(values: readonly SkillEffectProjection[]) {
    const starts: SkillEffectProjection[] = [];
    for (const effect of values) {
      const previous = this.seenEffects.get(effect.effectId);
      if (previous !== undefined) { if (!sameEffectProjection(previous, effect)) throw new BattlePresentationError("PRESENTATION_PROJECTION_CONFLICT"); continue; }
      this.seenEffects.set(effect.effectId, effect); if (effect.result === "hit" || effect.result === "immune") starts.push(effect);
    }
    return starts;
  }
  private payloads(projection: RenderProjection, visualEpoch: number, effects: readonly SkillEffectProjection[], paused: boolean) {
    const actors = [...projection.actors].sort((a, b) => compareActorId(a.actorId, b.actorId)); const camera = cameraFor(this.loaded!.arena, this.layout!, actors);
    const view = { sceneEpoch: this.scene!.sceneEpoch, visualEpoch, paused, viewportWidth: this.layout!.windowWidth, viewportHeight: this.layout!.windowHeight, barHeight: this.layout!.barHeight, contentWidth: this.layout!.contentWidth, contentHeight: this.layout!.contentHeight, columns: this.layout!.columns, rows: this.layout!.rows, logicalWidth: this.layout!.logicalWidth, logicalHeight: this.layout!.logicalHeight, scaleX: this.layout!.scaleX, scaleY: this.layout!.scaleY, mapWidth: this.loaded!.arena.width, mapHeight: this.loaded!.arena.height, ...camera, tileset: this.loaded!.tilesetRef, autotiles: this.loaded!.autotileRefs, tiles: projectTiles(this.loaded!, camera.cameraX, camera.cameraY, this.layout!) };
    const actorData = actors.map((actor) => ({ sceneEpoch: this.scene!.sceneEpoch, visualEpoch, paused, actorId: actor.actorId, tileX: actor.tile.x, tileY: actor.tile.y, direction: actor.direction, sprite: this.actorRefs.get(actor.actorId)!, life: actor.life, motion: actor.movement === null ? null : { id: actor.movement.motionId, fromWorldX: safeProduct(actor.movement.from.x, TILE_SIZE_PX, "movement.fromWorldX"), fromWorldY: safeProduct(actor.movement.from.y, TILE_SIZE_PX, "movement.fromWorldY"), toWorldX: safeProduct(actor.movement.to.x, TILE_SIZE_PX, "movement.toWorldX"), toWorldY: safeProduct(actor.movement.to.y, TILE_SIZE_PX, "movement.toWorldY"), durationMs: safeProduct(actor.movement.completeTick - actor.movement.startTick, this.scene!.tickDurationMs, "movement.durationMs") } }));
    const effectData = { sceneEpoch: this.scene!.sceneEpoch, visualEpoch, paused, effectStarts: effects.map((effect) => { const asset = this.effects.get(effect.effect)!; return { effectId: effect.effectId, result: effect.result as "hit" | "immune", image: asset.image, worldX: safeSum(safeProduct(effect.tile!.x, TILE_SIZE_PX, "effect.worldX"), TILE_SIZE_PX / 2, "effect.worldX"), worldY: safeSum(safeProduct(effect.tile!.y, TILE_SIZE_PX, "effect.worldY"), TILE_SIZE_PX / 2, "effect.worldY"), fadeInMs: safeProduct(asset.content.timing.fade_in_ticks, this.scene!.tickDurationMs, "effect.fadeInMs"), holdMs: safeProduct(asset.content.timing.hold_ticks, this.scene!.tickDurationMs, "effect.holdMs"), fadeOutMs: safeProduct(asset.content.timing.fade_out_ticks, this.scene!.tickDurationMs, "effect.fadeOutMs") }; }) };
    const hud = { sceneEpoch: this.scene!.sceneEpoch, visualEpoch, actors: actors.map((actor) => ({ actorId: actor.actorId, team: this.scene!.actors.find((item) => item.actorId === actor.actorId)!.team, hp: actor.hp, maxHp: actor.maxHp })) };
    return { view, actors: actorData, effects: effectData, hud };
  }
  private renderState(p: ReturnType<Handler["payloads"]>): RenderDomainState { return { zIndex: 0, roots: [{ key: "battle:view", tag: "lr-battle-view", attrs: {}, data: p.view as never, children: [...p.actors.map((data) => ({ key: `battle:actor:${data.actorId}`, tag: "lr-battle-actor", attrs: { slot: "world" }, data: data as never, children: [] })), { key: "battle:effects", tag: "lr-battle-effects", attrs: { slot: "world" }, data: p.effects as never, children: [] }, { key: "battle:hud", tag: "lr-battle-hud", attrs: { slot: "hud" }, data: p.hud as never, children: [] }] }] } }
  private renderUpdate(p: ReturnType<Handler["payloads"]>): RenderDomainUpdate { return { nodes: [{ key: "battle:view", data: { set: p.view as never } }, ...p.actors.map((data) => ({ key: `battle:actor:${data.actorId}`, data: { set: data as never } })), { key: "battle:effects", data: { set: p.effects as never } }, { key: "battle:hud", data: { set: p.hud as never } }] } }
  private preflight(candidate: unknown, view: unknown, prospective: RenderDomainState, kind: "state" | "update") {
    const updates = (candidate as { nodes?: readonly { key: string; data?: { set?: unknown } }[] }).nodes ?? [];
    const stack = [...prospective.roots]; const keys: string[] = []; const nodeData: unknown[] = [];
    while (stack.length > 0) {
      const node = stack.pop()!; keys.push(node.key); nodeData.push(node.data); stack.push(...node.children);
    }
    if (bytes(view) >= BATTLE_MAX_VIEW_DATA_BYTES
      || keys.length > RENDER_MAX_NODES
      || (kind === "update" && updates.length > RENDER_MAX_NODE_OPS)
      || keys.some((key) => textBytes(key) > RENDER_MAX_KEY_BYTES)
      || nodeData.some((data) => bytes(data) > RENDER_MAX_NODE_DATA_BYTES)
      || bytes(candidate) >= BATTLE_MAX_COMMIT_BYTES
      || bytes(prospective) >= BATTLE_MAX_COMMIT_BYTES) {
      throw this.failCommit(new Error("Renderer capacity exceeded"));
    }
  }
  private failCommit(error: unknown) { const failure = new BattlePresentationError("PRESENTATION_COMMIT_FAILED", error instanceof Error ? error.message : "Render commit failed", { cause: error }); this.close(); return failure; }
  private reportAsyncFailure(error: unknown): void {
    if (this.failureReported) return;
    let failure: BattlePresentationError;
    if (error instanceof BattlePresentationError && error.code === "PRESENTATION_COMMIT_FAILED") failure = error;
    else {
      if (this.state === "CLOSED") return;
      failure = this.failCommit(error);
    }
    this.failureReported = true;
    this.resolveFailure(failure);
  }
}

export class BattlePresentationBuilder {
  private built = false;
  constructor(private readonly scope: SubsystemScope, private readonly frame: Frame) {}
  build(): BattlePresentationHandler { if (this.built) throw new BattlePresentationError("PRESENTATION_INVALID_STATE"); this.built = true; return new Handler(this.scope, this.frame); }
}

const pendingFailure = (): Promise<PresentationFailure> => new Promise(() => {});
export class NullPresentation implements PresentationPort { readonly failure = pendingFailure(); async initialize(_scene: BattleSceneInit) {} render(_projection: RenderProjection) {} pause() {} resume() {} close() {} }
export class RecordingPresentation implements PresentationPort {
  readonly failure = pendingFailure();
  readonly scenes: BattleSceneInit[] = []; readonly projections: RenderProjection[] = []; paused = false; closed = false;
  async initialize(scene: BattleSceneInit) { this.scenes.push(scene); } render(projection: RenderProjection) { this.projections.push(projection); } pause() { this.paused = true; } resume() { this.paused = false; } close() { this.closed = true; }
}
