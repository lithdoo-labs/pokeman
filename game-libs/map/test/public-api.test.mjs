import assert from "node:assert/strict";
import test from "node:test";
import { RPGMapBuilder, RPGMapError } from "@loomrealm-game/map";

const table = (dimensions, xSize, ySize, zSize, values) => ({ dimensions, xSize, ySize, zSize, values });
const png = () => {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71], 0);
  new DataView(bytes.buffer).setUint32(16, 128);
  new DataView(bytes.buffer).setUint32(20, 128);
  return bytes;
};

async function createHarness(hook = (context) => context.setNPC([]), options = {}) {
  const aborter = new AbortController();
  const width = 10; const height = 10;
  const values = Array(width * height * 3).fill(384);
  const records = new Map([
    ["struct.Map/1", { tileset_id: 1, width, height, data: table(3, width, height, 3, values), behaviors: [] }],
    ["struct.MapTransfer/1", { id: 1, steps: [], contacts: [], edges: [] }],
    ["struct.Tileset/1", { id: 1, tileset_name: "tiles", autotile_names: [null, null, null, null, null, null, null], passages: table(1, 385, 1, 1, Array(385).fill(0)), priorities: table(1, 385, 1, 1, Array(385).fill(0)), terrain_tags: table(1, 385, 1, 1, Array(385).fill(0)) }],
    ["struct.NPC/guide", { name: "Guide", sprite: { namespace: "resource.Graphics", key: "Characters/guide" } }],
    ["struct.NPC/huge", { name: "Huge", sprite: { namespace: "resource.Graphics", key: `Characters/${"x".repeat(1_000_000)}` } }],
  ]);
  const states = [];
  let closed = false;
  const scope = {
    signal: aborter.signal,
    viewport: { current: { width: 640, height: 480 }, subscribe(listener) { listener(this.current); return () => {}; } },
    content: {
      async record(namespace, key) { const value = records.get(`${namespace}/${key}`); if (!value) throw new Error("missing record"); return { value, contentVersion: "record" }; },
      async resource(namespace, key) {
        if (options.resource) return await options.resource(namespace, key);
        return { bytes: png(), mime: "image/png", contentVersion: "image" };
      },
    },
    events: { async subscribe() { throw new Error("Map Runtime must not subscribe to input"); } },
    createRenderDomain(initial) {
      states.push(structuredClone(initial));
      return { replace(state) { states.push(structuredClone(state)); }, update() {}, emit() {}, close() { closed = true; } };
    },
  };
  const frame = { id: "public-api", params: {}, signal: aborter.signal, async call() { throw new Error("unused"); } };
  const handler = new RPGMapBuilder(scope, frame).build({ player: { characterName: "player" } });
  const directions = { ArrowDown: 2, ArrowLeft: 4, ArrowRight: 6, ArrowUp: 8 };
  let held = [];
  handler.onMapEntering(hook);
  const enteredUnsubscribers = (options.enteredListeners ?? []).map((listener) => handler.onMapEntered(listener));
  const interactionUnsubscribers = (options.interactionListeners ?? []).map((listener) => handler.onNPCInteract(listener));
  const pending = handler.run({ mapId: 1, x: 1, y: 1 });
  for (let attempt = 0; attempt < 20 && states.length === 0; attempt += 1) await new Promise((resolve) => setImmediate(resolve));
  return {
    aborter,
    closed: () => closed,
    emit(channel, value) {
      if (channel !== "keyboard.event" || directions[value.code] === undefined || value.repeat) return;
      const direction = directions[value.code];
      if (value.action === "down") {
        held = held.filter((item) => item !== direction);
        held.push(direction);
      } else if (value.action === "up") {
        held = held.filter((item) => item !== direction);
      }
      handler.controls.setMoveIntent(held.at(-1) ?? null);
    },
    enteredUnsubscribers,
    interactionUnsubscribers,
    handler,
    pending,
    states,
  };
}

test("public Builder/Handler normalizes NPCs and never reuses a retired RenderNode key", async () => {
  const harness = await createHarness();
  assert.equal(harness.handler.controls, harness.handler.controls);
  assert.throws(() => harness.handler.controls.setMoveIntent(1), TypeError);
  assert.throws(() => harness.handler.controls.setMoveIntent("up"), TypeError);
  assert.deepEqual(harness.handler.getSnapshot()?.npcs, []);
  const placement = { instanceId: "guide-1", npcId: "guide", x: 2, y: 2, direction: 6, pattern: 3 };
  await harness.handler.setNPC([placement]);
  const firstKey = harness.states.at(-1).roots[0].children[1].key;
  await harness.handler.setNPC([{ ...placement, x: 3 }]);
  assert.equal(harness.states.at(-1).roots[0].children[1].key, firstKey);
  await harness.handler.setNPC([]);
  await harness.handler.setNPC([placement]);
  assert.notEqual(harness.states.at(-1).roots[0].children[1].key, firstKey);
  assert.equal(harness.handler.getSnapshot().npcs[0].pattern, 3);
  assert.equal(harness.handler.getSnapshot().npcs[0].interactable, false);
  await assert.rejects(harness.handler.setNPC([{ ...placement, x: 1, y: 1 }]), (error) => error instanceof RPGMapError && error.code === "MAP_NPC_INVALID");
  const statesBeforeCapacityFailure = harness.states.length;
  const snapshotBeforeCapacityFailure = harness.handler.getSnapshot();
  await assert.rejects(harness.handler.setNPC([{ ...placement, npcId: "huge" }]), (error) => error instanceof RPGMapError && error.code === "MAP_NPC_INVALID");
  assert.equal(harness.states.length, statesBeforeCapacityFailure, "capacity failure must occur before Domain.replace");
  assert.deepEqual(harness.handler.getSnapshot(), snapshotBeforeCapacityFailure);
  harness.aborter.abort();
  assert.deepEqual(await harness.pending, { type: "cancelled" });
  assert.equal(harness.closed(), true);
  assert.equal(harness.handler.getSnapshot(), null);
  const stateCount = harness.states.length;
  harness.handler.controls.setMoveIntent(6);
  assert.equal(harness.states.length, stateCount, "controls are inert after terminal cleanup");
});


test("confirm emits an interaction only for an interactable NPC directly in front of the player", async () => {
  const seen = [];
  const harness = await createHarness(undefined, {
    interactionListeners: [(event) => seen.push(event)],
  });
  const placement = { instanceId: "guide-1", npcId: "guide", x: 2, y: 1, direction: 4, interactable: true };

  await harness.handler.setNPC([placement]);
  harness.handler.controls.confirm();
  assert.deepEqual(seen, [], "an NPC outside the facing tile must not be targeted");

  await harness.handler.setNPC([{ ...placement, x: 1, y: 3 }]);
  harness.handler.controls.confirm();
  assert.deepEqual(seen, [], "an NPC more than one tile away must not be targeted");

  await harness.handler.setNPC([{ ...placement, x: 1, y: 2, interactable: false }]);
  harness.handler.controls.confirm();
  assert.deepEqual(seen, [], "non-interactable NPCs must not emit events");

  const snapshotBeforeInvalidReplacement = harness.handler.getSnapshot();
  const statesBeforeInvalidReplacement = harness.states.length;
  await assert.rejects(
    harness.handler.setNPC([{ ...placement, x: 1, y: 2, interactable: "yes" }]),
    (error) => error instanceof RPGMapError && error.code === "MAP_NPC_INVALID",
  );
  assert.deepEqual(harness.handler.getSnapshot(), snapshotBeforeInvalidReplacement);
  assert.equal(harness.states.length, statesBeforeInvalidReplacement);
  harness.handler.controls.confirm();
  assert.deepEqual(seen, [], "a failed replacement must preserve the previous non-interactable NPC");

  await assert.rejects(
    harness.handler.setNPC([{ ...placement, x: 1, y: 2, unexpected: true }]),
    (error) => error instanceof RPGMapError && error.code === "MAP_NPC_INVALID",
  );
  assert.deepEqual(harness.handler.getSnapshot(), snapshotBeforeInvalidReplacement);
  assert.equal(harness.states.length, statesBeforeInvalidReplacement);

  await harness.handler.setNPC([{ ...placement, x: 1, y: 2 }]);
  assert.equal(harness.handler.getSnapshot().npcs[0].interactable, true);
  harness.handler.controls.confirm();
  assert.deepEqual(seen, [{
    mapId: 1,
    npc: { instanceId: "guide-1", npcId: "guide", x: 1, y: 2 },
    player: { x: 1, y: 1, direction: 2 },
  }]);
  assert.equal(Object.isFrozen(seen[0]), true);
  assert.equal(Object.isFrozen(seen[0].npc), true);
  assert.equal(Object.isFrozen(seen[0].player), true);

  harness.aborter.abort();
  await harness.pending;
  harness.handler.controls.confirm();
  assert.equal(seen.length, 1, "confirm must be inert after terminal cleanup");
});

test("one confirm cannot synchronously re-enter the same NPC interaction", async () => {
  const seen = [];
  let harness;
  harness = await createHarness(undefined, {
    interactionListeners: [(event) => {
      seen.push(event);
      if (seen.length === 1) harness.handler.controls.confirm();
    }],
  });
  await harness.handler.setNPC([{
    instanceId: "guide-1", npcId: "guide", x: 1, y: 2, direction: 2, interactable: true,
  }]);
  harness.handler.controls.confirm();
  assert.equal(seen.length, 1);
  harness.aborter.abort();
  await harness.pending;
});

test("NPC interaction listeners isolate failures and support idempotent unsubscribe", async () => {
  const seen = [];
  const diagnostics = [];
  const originalError = console.error;
  console.error = (...args) => { diagnostics.push(args); };
  try {
    const harness = await createHarness(undefined, {
      interactionListeners: [
        () => seen.push("removed"),
        () => { throw new Error("listener boom"); },
        () => seen.push("kept"),
      ],
    });
    await harness.handler.setNPC([{
      instanceId: "guide-1", npcId: "guide", x: 1, y: 2, direction: 2, interactable: true,
    }]);
    harness.handler.controls.confirm();
    assert.deepEqual(seen, ["removed", "kept"]);
    harness.interactionUnsubscribers[0]();
    harness.interactionUnsubscribers[0]();
    harness.handler.controls.confirm();
    assert.deepEqual(seen, ["removed", "kept", "kept"]);
    assert.equal(diagnostics.length, 2);
    assert.equal(diagnostics.every((entry) => entry[0] === "[RPGMap] NPC_INTERACT_LISTENER_FAILED"), true);
    harness.aborter.abort();
    await harness.pending;
  } finally {
    console.error = originalError;
  }
});

test("confirm is ignored while a movement is active", async () => {
  const seen = [];
  const harness = await createHarness(undefined, {
    interactionListeners: [(event) => seen.push(event)],
  });
  await harness.handler.setNPC([{
    instanceId: "guide-1", npcId: "guide", x: 1, y: 2, direction: 2, interactable: true,
  }]);
  harness.handler.controls.setMoveIntent(6);
  harness.handler.controls.confirm();
  assert.deepEqual(seen, []);
  harness.aborter.abort();
  await harness.pending;
});

test("confirm is not cached during setNPC replacement or map transition", async () => {
  const seen = [];
  let delayNextGuide = false;
  let releaseGuide;
  let guideRequestedResolve;
  let guideRequested = new Promise((resolve) => { guideRequestedResolve = resolve; });
  const harness = await createHarness(undefined, {
    interactionListeners: [(event) => seen.push(event)],
    resource: async () => {
      if (!delayNextGuide) return { bytes: png(), mime: "image/png", contentVersion: "image" };
      guideRequestedResolve();
      return await new Promise((resolve) => {
        releaseGuide = () => resolve({ bytes: png(), mime: "image/png", contentVersion: "replacement" });
      });
    },
  });
  const placement = { instanceId: "guide-1", npcId: "guide", x: 1, y: 2, direction: 2 };
  await harness.handler.setNPC([{ ...placement, interactable: true }]);
  harness.handler.controls.confirm();
  assert.equal(seen.length, 1);

  delayNextGuide = true;
  guideRequested = new Promise((resolve) => { guideRequestedResolve = resolve; });
  const replacement = harness.handler.setNPC([{ ...placement, interactable: false }]);
  await guideRequested;
  harness.handler.controls.confirm();
  assert.equal(seen.length, 1, "confirm during setNPC preparation must be ignored");
  releaseGuide();
  await replacement;
  assert.equal(seen.length, 1, "an ignored confirm must not replay after setNPC completes");
  harness.handler.controls.confirm();
  assert.equal(seen.length, 1, "the replacement interaction flag must take effect immediately");

  delayNextGuide = false;
  await harness.handler.setNPC([{ ...placement, interactable: true }]);
  const transition = harness.handler.enterMap({ mapId: 1, x: 2, y: 2 });
  harness.handler.controls.confirm();
  assert.equal(seen.length, 1, "confirm during map transition must be ignored");
  await transition;
  assert.equal(seen.length, 1, "an ignored confirm must not replay after map transition");

  harness.aborter.abort();
  await harness.pending;
});

test("onMapEntering cancellation releases run even when the listener never settles", async () => {
  const harness = await createHarness(async () => await new Promise(() => {}));
  assert.equal(harness.states.length, 0);
  harness.aborter.abort();
  assert.deepEqual(await harness.pending, { type: "cancelled" });
});

test("setNPC preparation excludes movement and revalidates the stable player cell before commit", async () => {
  let releaseGuide;
  let guideRequestedResolve;
  const guideRequested = new Promise((resolve) => { guideRequestedResolve = resolve; });
  const harness = await createHarness(undefined, {
    resource: async (_namespace, key) => {
      if (key !== "Characters/guide") return { bytes: png(), mime: "image/png", contentVersion: "image" };
      guideRequestedResolve();
      return await new Promise((resolve) => { releaseGuide = () => resolve({ bytes: png(), mime: "image/png", contentVersion: "guide" }); });
    },
  });
  const setting = harness.handler.setNPC([{ instanceId: "guard", npcId: "guide", x: 2, y: 1, direction: 4, pattern: 2 }]);
  await guideRequested;
  harness.emit("keyboard.event", { code: "ArrowRight", action: "down", repeat: false });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(harness.handler.getSnapshot().player, { x: 1, y: 1, direction: 2 });
  assert.equal(harness.states.length, 1, "movement and NPC commit must both wait for preparation");
  releaseGuide();
  await setting;
  assert.deepEqual(harness.handler.getSnapshot(), {
    mapId: 1,
    player: { x: 1, y: 1, direction: 2 },
    npcs: [{ instanceId: "guard", npcId: "guide", x: 2, y: 1, direction: 4, pattern: 2, interactable: false }],
  });
  harness.aborter.abort();
  await harness.pending;
});

test("failed delayed setNPC restores operability without changing NPCs, snapshot, or Domain", async () => {
  let failNextGuide = false;
  let rejectGuide;
  let guideRequestedResolve;
  let guideRequested = new Promise((resolve) => { guideRequestedResolve = resolve; });
  const harness = await createHarness(undefined, {
    resource: async (_namespace, key) => {
      if (key === "Characters/guide" && failNextGuide) {
        guideRequestedResolve();
        return await new Promise((_resolve, reject) => { rejectGuide = reject; });
      }
      return { bytes: png(), mime: "image/png", contentVersion: "image" };
    },
  });
  await harness.handler.setNPC([{ instanceId: "old", npcId: "guide", x: 3, y: 1, direction: 2 }]);
  const oldSnapshot = harness.handler.getSnapshot();
  const oldStateCount = harness.states.length;
  failNextGuide = true;
  guideRequested = new Promise((resolve) => { guideRequestedResolve = resolve; });
  const setting = harness.handler.setNPC([{ instanceId: "new", npcId: "guide", x: 2, y: 1, direction: 6 }]);
  await guideRequested;
  harness.emit("keyboard.event", { code: "ArrowRight", action: "down", repeat: false });
  assert.deepEqual(harness.handler.getSnapshot(), oldSnapshot);
  rejectGuide(new Error("injected NPC resource failure"));
  await assert.rejects(setting, (error) => error instanceof RPGMapError && error.code === "MAP_CONTENT_FAILED");
  assert.deepEqual(harness.handler.getSnapshot(), oldSnapshot);
  assert.equal(harness.states.length, oldStateCount);
  harness.emit("keyboard.event", { code: "ArrowRight", action: "up", repeat: false });
  harness.emit("keyboard.event", { code: "ArrowRight", action: "down", repeat: false });
  assert.equal(harness.handler.getSnapshot().player.x, 2, "movement must be available after preparation failure");
  harness.aborter.abort();
  await harness.pending;
});

test("onMapEntered unsubscribe remains idempotent during run and listener failures stay isolated", async () => {
  const seen = [];
  const diagnostics = [];
  const originalError = console.error;
  console.error = (...args) => { diagnostics.push(args); };
  try {
    const harness = await createHarness(undefined, {
      enteredListeners: [
        (event) => seen.push(`removed:${event.player.x}`),
        () => { throw new Error("listener boom"); },
        (event) => seen.push(`kept:${event.player.x}`),
      ],
    });
    assert.deepEqual(seen, ["removed:1", "kept:1"]);
    harness.enteredUnsubscribers[0]();
    harness.enteredUnsubscribers[0]();
    await harness.handler.enterMap({ mapId: 1, x: 2, y: 2 });
    assert.deepEqual(seen, ["removed:1", "kept:1", "kept:2"]);
    assert.equal(diagnostics.length, 2);
    assert.equal(diagnostics.every((entry) => entry[0] === "[RPGMap] MAP_ENTERED_LISTENER_FAILED"), true);
    harness.aborter.abort();
    await harness.pending;
  } finally {
    console.error = originalError;
  }
});
