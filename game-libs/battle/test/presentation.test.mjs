import test from "node:test";
import assert from "node:assert/strict";
import {
  BattlePresentationBuilder, BattlePresentationError, NullPresentation, RecordingPresentation,
  assertActorId, compareActorId, validateBattleEffectContent, validateBattleSceneInit,
  validateRenderProjection,
} from "../dist/index.js";

const version = `sha256:${"1".repeat(64)}`;
const table = (values, xSize, ySize = 1, zSize = 1) => ({ dimensions: zSize === 1 && ySize === 1 ? 1 : 3, xSize, ySize, zSize, values });
const priorities = Array(500).fill(0); priorities[384] = 0; priorities[385] = 2;
const mapValues = Array(8 * 8 * 3).fill(0); mapValues[0] = 384; mapValues[1 + 1 * 8 + 2 * 64] = 385;
const records = new Map([
  ["struct.BattleArena:test", { id: "test", tileset_id: 1, width: 8, height: 8, passable: Array.from({ length: 8 }, () => Array(8).fill(true)), data: table(mapValues, 8, 8, 3) }],
  ["struct.Tileset:1", { id: 1, tileset_name: "field.png", autotile_names: [null, null, null, null, null, null, null], passages: table(Array(500).fill(0), 500), priorities: table(priorities, 500), terrain_tags: table(Array(500).fill(0), 500) }],
  ["struct.BattleEffect:spark", { id: "spark", image: { namespace: "resource.Graphics", key: "BattleEffects/spark.png" }, anchor: "tile-center", timing: { fade_in_ticks: 1, hold_ticks: 2, fade_out_ticks: 1 } }],
]);
const scene = (actors = [
  { actorId: "hero", team: "ally", character: { namespace: "resource.Graphics", key: "Characters/hero.png" } },
  { actorId: "enemy", team: "enemy", character: { namespace: "resource.Graphics", key: "Characters/enemy.png" } },
]) => ({ battleId: "b1", sceneEpoch: 7, tickDurationMs: 200, map: { arenaId: "test" }, actors, effectIds: ["spark"] });
const actor = (actorId, teamX, overrides = {}) => ({ actorId, tile: { x: teamX, y: 2 }, direction: 2, hp: 100, maxHp: 100, life: "alive", movement: null, ...overrides });
const projection = (tick = 0, overrides = {}) => ({ sceneEpoch: 7, tick, actors: [actor("hero", 2), actor("enemy", 5)], effectStarts: [], ...overrides });

class Domain {
  updates = []; replaces = []; closed = 0;
  constructor(state) { this.state = state; }
  update(value) { this.updates.push(value); }
  replace(value) { this.replaces.push(value); }
  emit() {}
  close() { this.closed += 1; }
}
function harness(viewport = { width: 640, height: 480 }, custom = {}) {
  const listeners = new Set(); const domains = [];
  const frameController = new AbortController(), scopeController = new AbortController();
  const scope = {
    signal: scopeController.signal,
    content: {
      async record(namespace, key) { const value = records.get(`${namespace}:${key}`); if (!value) throw new Error(`missing ${namespace}:${key}`); return { value, contentVersion: version }; },
      async resource() { return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion: version }; },
      ...custom.content,
    },
    viewport: {
      current: viewport,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    },
    createRenderDomain(state) { const domain = new Domain(state); domains.push(domain); return domain; },
    ...custom.scope,
  };
  const frame = { id: "f", params: null, signal: frameController.signal, async call() { return { type: "cancelled" }; } };
  return { scope, frame, domains, listeners, emitViewport(value) { scope.viewport.current = value; for (const listener of listeners) listener(value); }, frameController };
}
async function ready(h = harness(), customScene = scene()) { const handler = new BattlePresentationBuilder(h.scope, h.frame).build(); await handler.initialize(customScene); return { h, handler }; }
const updateData = (domain, key, index = -1) => { const update = domain.updates.at(index); return update.nodes.find((node) => node.key === key).data.set; };

test("contracts enforce ActorId bytes, ordinal order, and BattleEffect shape", () => {
  assert.doesNotThrow(() => assertActorId("a".repeat(115)));
  assert.throws(() => assertActorId("a".repeat(116)));
  assert.doesNotThrow(() => assertActorId(`${"😀".repeat(28)}abc`));
  assert.throws(() => assertActorId("😀".repeat(29)));
  assert.throws(() => assertActorId("\ud800"));
  assert.deepEqual(["z", "ä", "A"].sort(compareActorId), ["A", "z", "ä"]);
  assert.equal(validateBattleEffectContent(records.get("struct.BattleEffect:spark"), "spark").timing.hold_ticks, 2);
});

test("contract validators return immutable snapshots and reject non-exact ABI data", () => {
  const mutableScene = scene(); const acceptedScene = validateBattleSceneInit(mutableScene);
  mutableScene.actors[0].actorId = "changed"; mutableScene.effectIds[0] = "changed";
  assert.equal(acceptedScene.actors[0].actorId, "hero"); assert.deepEqual(acceptedScene.effectIds, ["spark"]);
  assert.equal(Object.isFrozen(acceptedScene.actors), true); assert.equal(Object.isFrozen(acceptedScene.actors[0].character), true);
  const mutableProjection = projection(); const acceptedProjection = validateRenderProjection(mutableProjection);
  mutableProjection.actors[0].tile.x = 7; assert.equal(acceptedProjection.actors[0].tile.x, 2); assert.equal(Object.isFrozen(acceptedProjection), true);
  assert.throws(() => validateBattleSceneInit({ ...scene(), extra: true }));
  assert.throws(() => validateRenderProjection({ ...projection(), visualEpoch: 1 }));
});

test("builder, initialize and first render create the exact stable tree once", async () => {
  const h = harness(); const builder = new BattlePresentationBuilder(h.scope, h.frame); const handler = builder.build(); assert.throws(() => builder.build(), { code: "PRESENTATION_INVALID_STATE" });
  assert.throws(() => handler.render(projection()), { code: "PRESENTATION_INVALID_STATE" }); await handler.initialize(scene().actors.reverse ? scene([...scene().actors].reverse()) : scene());
  assert.equal(h.domains.length, 0); handler.render(projection()); assert.equal(h.domains.length, 1);
  const root = h.domains[0].state.roots[0]; assert.deepEqual([root.key, root.tag, root.attrs], ["battle:view", "lr-battle-view", {}]);
  assert.deepEqual(root.children.map((node) => [node.key, node.tag, node.attrs.slot]), [["battle:actor:enemy", "lr-battle-actor", "world"], ["battle:actor:hero", "lr-battle-actor", "world"], ["battle:effects", "lr-battle-effects", "world"], ["battle:hud", "lr-battle-hud", "hud"]]);
  assert.equal(root.data.visualEpoch, 1); assert.equal(root.children.every((node) => node.data.visualEpoch === 1), true);
});

test("presentation projector accepts collection-shaped four-actor fixtures and 115-byte keys", async () => {
  const longId = "x".repeat(115); const actors = [
    { actorId: longId, team: "ally", character: { namespace: "resource.Graphics", key: "Characters/long.png" } },
    { actorId: "b", team: "enemy", character: { namespace: "resource.Graphics", key: "Characters/b.png" } },
    { actorId: "a", team: "ally", character: { namespace: "resource.Graphics", key: "Characters/a.png" } },
    { actorId: "c", team: "enemy", character: { namespace: "resource.Graphics", key: "Characters/c.png" } },
  ]; const { h, handler } = await ready(harness(), scene(actors));
  handler.render(projection(0, { actors: [actor(longId, 1), actor("b", 2), actor("a", 3), actor("c", 4)] }));
  const keys = h.domains[0].state.roots[0].children.slice(0, 4).map((node) => node.key);
  assert.deepEqual(keys, ["battle:actor:a", "battle:actor:b", "battle:actor:c", `battle:actor:${longId}`]);
  assert.equal(new TextEncoder().encode(keys.at(-1)).byteLength, 128);
});

test("new projections use update, preserve actor-local world motion, reconcile interruption and HUD", async () => {
  const { h, handler } = await ready(); handler.render(projection());
  const moving = projection(10, { actors: [actor("hero", 2, { movement: { motionId: 17, from: { x: 2, y: 2 }, to: { x: 3, y: 2 }, startTick: 10, completeTick: 12 } }), actor("enemy", 5, { movement: { motionId: 9, from: { x: 5, y: 2 }, to: { x: 4, y: 2 }, startTick: 10, completeTick: 13 } })] });
  handler.render(moving); const d = h.domains[0]; assert.equal(d.replaces.length, 0); assert.deepEqual(updateData(d, "battle:actor:hero").motion, { id: 17, fromWorldX: 64, fromWorldY: 64, toWorldX: 96, toWorldY: 64, durationMs: 400 }); assert.equal(updateData(d, "battle:actor:enemy").motion.id, 9);
  assert.equal("screenX" in updateData(d, "battle:actor:hero"), false);
  h.emitViewport({ width: 800, height: 600 }); await new Promise((resolve) => setTimeout(resolve, 120)); assert.equal(updateData(d, "battle:actor:hero").motion.id, 17);
  handler.render(projection(11, { actors: [actor("hero", 2, { hp: 70 }), actor("enemy", 5)] })); assert.equal(updateData(d, "battle:actor:hero").motion, null); assert.equal(updateData(d, "battle:hud").actors.find((a) => a.actorId === "hero").hp, 70);
  handler.render(projection(12, { actors: [actor("hero", 3, { direction: 6 }), actor("enemy", 5)] })); assert.deepEqual([updateData(d, "battle:actor:hero").tileX, updateData(d, "battle:actor:hero").direction], [3, 6]);
});

test("camera midpoint, clamp and small-map origin inputs are deterministic", async () => {
  const { h, handler } = await ready(harness({ width: 320, height: 240 })); handler.render(projection(0, { actors: [actor("hero", 0), actor("enemy", 7)] }));
  const view = h.domains[0].state.roots[0].data; assert.ok(view.cameraX >= 0); assert.ok(view.cameraY >= 0); assert.equal(view.mapWidth, 8); assert.equal(view.logicalWidth > view.mapWidth * 32, true); assert.equal(view.cameraX, 0);
});

test("effects consume all outcomes and emit only hit/immune with frozen opacity policy in browser data", async () => {
  const { h, handler } = await ready(); handler.render(projection()); const effects = [
    { effectId: "e1", effect: "spark", result: "hit", tile: { x: 2, y: 2 }, startTick: 1 },
    { effectId: "e2", effect: "spark", result: "immune", tile: { x: 3, y: 2 }, startTick: 1 },
    { effectId: "e3", effect: "spark", result: "miss", tile: null, startTick: 1 },
    { effectId: "e4", effect: "spark", result: "invalid", tile: null, startTick: 1 },
  ]; handler.render(projection(1, { effectStarts: effects })); const starts = updateData(h.domains[0], "battle:effects").effectStarts; assert.deepEqual(starts.map((e) => e.result), ["hit", "immune"]); assert.deepEqual(starts.map((e) => [e.fadeInMs, e.holdMs, e.fadeOutMs]), [[200,400,200],[200,400,200]]);
  handler.render(projection(2)); assert.deepEqual(updateData(h.domains[0], "battle:effects").effectStarts, []);
  handler.render(projection(3, { effectStarts: [effects[0]] })); assert.deepEqual(updateData(h.domains[0], "battle:effects").effectStarts, []);
});

test("projection fencing handles stale, replay, conflict, scene/roster/effect mismatches", async () => {
  const { h, handler } = await ready(); handler.render(projection(5)); const d = h.domains[0]; handler.render(projection(4)); handler.render(projection(5)); assert.equal(d.updates.length, 0);
  assert.throws(() => handler.render(projection(5, { actors: [actor("hero", 2, { hp: 99 }), actor("enemy", 5)] })), { code: "PRESENTATION_PROJECTION_CONFLICT" });
  assert.throws(() => handler.render({ ...projection(6), sceneEpoch: 8 }), { code: "PRESENTATION_SCENE_MISMATCH" });
  assert.throws(() => handler.render(projection(6, { actors: [actor("hero", 2)] })), { code: "PRESENTATION_INVALID_DATA" });
  assert.throws(() => handler.render(projection(6, { effectStarts: [{ effectId: "x", effect: "unknown", result: "miss", tile: null, startTick: 6 }] })), { code: "PRESENTATION_INVALID_DATA" });
});

test("pause/resume and resize atomically advance visualEpoch without replace", async () => {
  const { h, handler } = await ready(); handler.render(projection()); const d = h.domains[0]; handler.pause(); handler.pause(); assert.equal(updateData(d, "battle:view").paused, true); const afterPause = d.updates.length; handler.resume(); handler.resume(); assert.equal(d.updates.length, afterPause + 1); assert.equal(updateData(d, "battle:view").paused, false);
  handler.pause(); h.emitViewport({ width: 800, height: 600 }); h.emitViewport({ width: 900, height: 700 }); await new Promise((resolve) => setTimeout(resolve, 130)); assert.equal(updateData(d, "battle:view").viewportWidth, 900); assert.equal(updateData(d, "battle:view").paused, true); assert.equal(d.replaces.length, 0);
  const epochs = d.updates.map((u) => u.nodes[0].data.set.visualEpoch); assert.deepEqual(epochs, [...epochs].sort((a,b)=>a-b));
});

test("invalid lifecycle, close cleanup, abort and late initialization are fenced", async () => {
  const h = harness(); const handler = new BattlePresentationBuilder(h.scope, h.frame).build(); assert.throws(() => handler.pause(), { code: "PRESENTATION_INVALID_STATE" }); assert.throws(() => handler.resume(), { code: "PRESENTATION_INVALID_STATE" }); await handler.initialize(scene()); await assert.rejects(handler.initialize(scene()), { code: "PRESENTATION_INVALID_STATE" }); assert.throws(() => handler.pause(), { code: "PRESENTATION_INVALID_STATE" }); assert.throws(() => handler.resume(), { code: "PRESENTATION_INVALID_STATE" }); handler.render(projection()); handler.close(); handler.close(); handler.render(projection(1)); assert.equal(h.domains[0].closed, 1); assert.equal(h.listeners.size, 0);
  const delayed = harness(null); const pendingHandler = new BattlePresentationBuilder(delayed.scope, delayed.frame).build(); const pending = pendingHandler.initialize(scene()); pendingHandler.close(); await pending; assert.equal(delayed.domains.length, 0);
  const hostile = harness({ width: 640, height: 480 }, { scope: { createRenderDomain(state) { const domain = new Domain(state); domain.close = () => { throw new Error("teardown failed"); }; return domain; } } }); const bestEffort = new BattlePresentationBuilder(hostile.scope, hostile.frame).build(); await bestEffort.initialize(scene()); bestEffort.render(projection()); assert.doesNotThrow(() => bestEffort.close()); assert.doesNotThrow(() => bestEffort.close()); assert.equal(hostile.listeners.size, 0);
});

test("content and renderer failures are classified and capacity failure has no partial epoch", async () => {
  const missing = harness({ width: 640, height: 480 }, { content: { async record(){ throw new Error("gone"); } } }); const one = new BattlePresentationBuilder(missing.scope, missing.frame).build(); await assert.rejects(one.initialize(scene()), { code: "PRESENTATION_CONTENT_FAILED" });
  const commit = harness({ width: 640, height: 480 }, { scope: { createRenderDomain(){ throw new Error("renderer down"); } } }); const two = new BattlePresentationBuilder(commit.scope, commit.frame).build(); await two.initialize(scene()); assert.throws(() => two.render(projection()), { code: "PRESENTATION_COMMIT_FAILED" });
  const giantValues = Array(10_000 * 16 * 3).fill(384);
  const giant = harness({ width: 10_000_000, height: 480 }, { content: { async record(namespace, key) { if (namespace === "struct.BattleArena") return { value: { id: key, tileset_id: 1, width: 10_000, height: 16, passable: Array.from({ length: 16 }, () => Array(10_000).fill(true)), data: table(giantValues, 10_000, 16, 3) }, contentVersion: version }; const value = records.get(`${namespace}:${key}`); return { value, contentVersion: version }; } } });
  const huge = await ready(giant); assert.throws(() => huge.handler.render(projection()), { code: "PRESENTATION_COMMIT_FAILED" }); assert.equal(huge.h.domains.length, 0);
});

test("Null and Recording Presentation are direct substitutes", async () => {
  const noop = new NullPresentation(); await noop.initialize(scene()); noop.render(projection()); noop.pause(); noop.resume(); noop.close();
  const recording = new RecordingPresentation(); await recording.initialize(scene()); recording.render(projection()); recording.pause(); recording.resume(); recording.close(); assert.equal(recording.scenes.length, 1); assert.equal(recording.projections.length, 1); assert.equal(recording.closed, true);
});

test("camera uses alive movement targets, midpoint, bounds, and all-dead fallback", async () => {
  const width = 100, height = 50, values = Array(width * height * 3).fill(0); values[0] = 384;
  const wide = harness({ width: 640, height: 480 }, { content: { async record(namespace, key) {
    if (namespace === "struct.BattleArena") return { value: { id: key, tileset_id: 1, width, height, passable: Array.from({ length: height }, () => Array(width).fill(true)), data: table(values, width, height, 3) }, contentVersion: version };
    const value = records.get(`${namespace}:${key}`); if (!value) throw new Error("missing"); return { value, contentVersion: version };
  } } });
  const { h, handler } = await ready(wide);
  handler.render(projection(0, { actors: [
    actor("hero", 2, { tile: { x: 2, y: 2 }, movement: { motionId: 1, from: { x: 2, y: 2 }, to: { x: 40, y: 20 }, startTick: 0, completeTick: 2 } }),
    actor("enemy", 60, { tile: { x: 60, y: 10 } }),
  ] }));
  assert.deepEqual([h.domains[0].state.roots[0].data.cameraX, h.domains[0].state.roots[0].data.cameraY], [1296, 272]);
  handler.render(projection(1, { actors: [actor("hero", 10, { tile: { x: 10, y: 10 } }), actor("enemy", 99, { tile: { x: 99, y: 10 }, life: "dead", hp: 0 })] }));
  assert.deepEqual([updateData(h.domains[0], "battle:view").cameraX, updateData(h.domains[0], "battle:view").cameraY], [16, 112]);
  handler.render(projection(2, { actors: [actor("hero", 10, { tile: { x: 10, y: 10 }, life: "dead", hp: 0 }), actor("enemy", 99, { tile: { x: 99, y: 10 }, life: "dead", hp: 0 })] }));
  assert.deepEqual([updateData(h.domains[0], "battle:view").cameraX, updateData(h.domains[0], "battle:view").cameraY], [1440, 112]);
});

test("viewport initialization, trailing settlement, immutable latest value, and no-op layout are exact", async () => {
  const waiting = harness(null); const handler = new BattlePresentationBuilder(waiting.scope, waiting.frame).build(); const initializing = handler.initialize(scene());
  waiting.emitViewport({ width: 200, height: 100 }); await initializing; handler.render(projection());
  const domain = waiting.domains[0]; assert.deepEqual([domain.state.roots[0].data.viewportWidth, domain.state.roots[0].data.viewportHeight], [200, 100]);
  waiting.emitViewport({ width: 200, height: 100 }); await new Promise((resolve) => setTimeout(resolve, 120)); assert.equal(domain.updates.length, 0);
  const mutable = { width: 800, height: 600 }; waiting.emitViewport(mutable); mutable.width = 900; mutable.height = 700;
  await new Promise((resolve) => setTimeout(resolve, 120)); assert.deepEqual([updateData(domain, "battle:view").viewportWidth, updateData(domain, "battle:view").viewportHeight], [800, 600]);
});

test("invalid scene data is distinct from content failure and closes the one-shot handler", async () => {
  const invalid = harness(); const handler = new BattlePresentationBuilder(invalid.scope, invalid.frame).build();
  await assert.rejects(handler.initialize(scene([{ actorId: "x".repeat(116), team: "ally", character: { namespace: "resource.Graphics", key: "Characters/x.png" } }])), { code: "PRESENTATION_INVALID_DATA" });
  assert.doesNotThrow(() => handler.render(projection())); assert.equal(invalid.domains.length, 0);
  const badIdentity = harness({ width: 640, height: 480 }, { content: { async resource() { return { bytes: new Uint8Array(), mime: "image/png", contentVersion: "" }; } } });
  await assert.rejects(new BattlePresentationBuilder(badIdentity.scope, badIdentity.frame).build().initialize(scene()), { code: "PRESENTATION_CONTENT_FAILED" });
});

test("close fences late resource completion and concurrent handlers keep session state isolated", async () => {
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const late = harness(null, { content: { async resource() { await gate; return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion: version }; } } });
  const lateHandler = new BattlePresentationBuilder(late.scope, late.frame).build(); const pending = lateHandler.initialize(scene());
  await new Promise((resolve) => setImmediate(resolve)); lateHandler.close(); release(); await pending;
  assert.equal(late.domains.length, 0); assert.equal(late.listeners.size, 0);

  const shared = harness(); const first = new BattlePresentationBuilder(shared.scope, shared.frame).build(); const second = new BattlePresentationBuilder(shared.scope, shared.frame).build();
  await Promise.all([first.initialize(scene()), second.initialize(scene())]); first.render(projection()); second.render(projection());
  assert.equal(shared.domains.length, 2); assert.equal(shared.domains.every((domain) => domain.state.roots[0].data.visualEpoch === 1), true);
  first.pause(); assert.equal(shared.domains[0].updates.length, 1); assert.equal(shared.domains[1].updates.length, 0);
  first.close(); assert.deepEqual(shared.domains.map((domain) => domain.closed), [1, 0]); second.close();
});

test("motion and effect identities reject conflicting reuse across newer projections", async () => {
  const { handler } = await ready();
  const moving = { motionId: 4, from: { x: 2, y: 2 }, to: { x: 3, y: 2 }, startTick: 0, completeTick: 2 };
  handler.render(projection(0, { actors: [actor("hero", 2, { movement: moving }), actor("enemy", 5)] }));
  assert.throws(() => handler.render(projection(1, { actors: [actor("hero", 2, { movement: { ...moving, to: { x: 4, y: 2 } } }), actor("enemy", 5)] })), { code: "PRESENTATION_PROJECTION_CONFLICT" });
  const miss = { effectId: "once", effect: "spark", result: "miss", tile: null, startTick: 1 };
  handler.render(projection(1, { actors: [actor("hero", 2, { movement: moving }), actor("enemy", 5)], effectStarts: [miss] }));
  assert.throws(() => handler.render(projection(2, { actors: [actor("hero", 2, { movement: moving }), actor("enemy", 5)], effectStarts: [{ ...miss, result: "hit", tile: { x: 2, y: 2 } }] })), { code: "PRESENTATION_PROJECTION_CONFLICT" });
});

test("subsequent renderer-capacity failure closes atomically without a partial visual epoch", async () => {
  const { h, handler } = await ready(); handler.render(projection()); const domain = h.domains[0];
  const effectStarts = Array.from({ length: 4000 }, (_, index) => ({ effectId: `large-${index}`, effect: "spark", result: "hit", tile: { x: 2, y: 2 }, startTick: 1 }));
  assert.throws(() => handler.render(projection(1, { effectStarts })), { code: "PRESENTATION_COMMIT_FAILED" });
  assert.equal(domain.updates.length, 0); assert.equal(domain.state.roots[0].data.visualEpoch, 1); assert.equal(domain.closed, 1);
  assert.doesNotThrow(() => handler.render(projection(2)));
});

test("async resize capacity fatal closes once and resolves the Runtime failure channel", async () => {
  const width = 10_000, height = 16, values = Array(width * height * 3).fill(384);
  const oversized = harness({ width: 640, height: 480 }, { content: { async record(namespace, key) {
    if (namespace === "struct.BattleArena") return { value: { id: key, tileset_id: 1, width, height, passable: Array.from({ length: height }, () => Array(width).fill(true)), data: table(values, width, height, 3) }, contentVersion: version };
    const value = records.get(`${namespace}:${key}`); if (!value) throw new Error("missing"); return { value, contentVersion: version };
  } } });
  const { h, handler } = await ready(oversized); handler.render(projection());
  const domain = h.domains[0]; let notifications = 0;
  handler.failure.then(() => { notifications += 1; });
  h.emitViewport({ width: 10_000_000, height: 480 });
  const failure = await Promise.race([
    handler.failure,
    new Promise((_, reject) => setTimeout(() => reject(new Error("failure channel timed out")), 1_000)),
  ]);
  assert.equal(failure.code, "PRESENTATION_COMMIT_FAILED");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(notifications, 1); assert.equal(domain.updates.length, 0); assert.equal(domain.closed, 1); assert.equal(h.listeners.size, 0);
  h.emitViewport({ width: 20_000_000, height: 480 });
  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.equal(notifications, 1); assert.equal(domain.updates.length, 0);
});

test("async resize RenderDomain fatal is classified through the failure channel", async () => {
  const h = harness();
  h.scope.createRenderDomain = (state) => {
    const domain = new Domain(state); domain.update = () => { throw new Error("async renderer down"); }; h.domains.push(domain); return domain;
  };
  const { handler } = await ready(h); handler.render(projection());
  h.emitViewport({ width: 800, height: 600 });
  const failure = await Promise.race([
    handler.failure,
    new Promise((_, reject) => setTimeout(() => reject(new Error("failure channel timed out")), 1_000)),
  ]);
  assert.equal(failure.code, "PRESENTATION_COMMIT_FAILED"); assert.match(failure.message, /async renderer down/);
  assert.equal(h.domains[0].closed, 1); assert.equal(h.listeners.size, 0);
});

test("normal terminal projection remains visible until explicit close", async () => {
  const { h, handler } = await ready(); handler.render(projection());
  handler.render(projection(1, { actors: [actor("hero", 2), actor("enemy", 5, { hp: 0, life: "dead" })] }));
  assert.equal(h.domains[0].closed, 0); assert.equal(updateData(h.domains[0], "battle:hud").actors.find((item) => item.actorId === "enemy").hp, 0);
  handler.close(); assert.equal(h.domains[0].closed, 1);
});
