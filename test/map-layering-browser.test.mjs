import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { calculateLayout } from "../game-libs/map/dist/layout.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mapBrowserPath = path.join(root, "game-libs", "map", "dist", "browser", "map.browser.js");

function executablePath() {
  return [process.env.LOOMREALM_CHROMIUM_PATH, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(existsSync);
}

const tilesetRef = (contentVersion) => ({ namespace: "resource.Graphics", key: "Tilesets/blue", contentVersion });
const spriteRef = Object.freeze({ namespace: "resource.Graphics", key: "Characters/red", contentVersion: "v1" });
const NULL_AUTOTILES = Object.freeze([null, null, null, null, null, null, null]);
const identityOf = (ref) => `${ref.namespace}\u0000${ref.key}\u0000${ref.contentVersion}`;
const autotileRef = (key, contentVersion = "v1") => ({ namespace: "resource.Graphics", key, contentVersion });
const AUTOTILE_CORNERS = Object.freeze([
  Object.freeze({ sx: 0, sy: 0 }),
  Object.freeze({ sx: 16, sy: 0 }),
  Object.freeze({ sx: 0, sy: 16 }),
  Object.freeze({ sx: 16, sy: 16 }),
]);

function autotilesAt(entries) {
  const list = [null, null, null, null, null, null, null];
  for (const [slot, ref] of entries) list[slot] = ref;
  return list;
}

function autotileTile({ x = 0, y = 0, z = 0, tileId = 48, depth = 0, slot = 0, corners = AUTOTILE_CORNERS } = {}) {
  return { x, y, z, tileId, depth, blit: { kind: "autotile", slot, corners } };
}

function regularTile({ x = 0, y = 0, z = 0, tileId = 384, depth = 0 } = {}) {
  return { x, y, z, tileId, depth, blit: { kind: "regular", sourceIndex: tileId - 384 } };
}

function viewData({
  depth = 0, tileset = tilesetRef("v1"), autotiles = NULL_AUTOTILES, tiles,
  cameraX = 0, cameraY = 0, cameraMotion = null, sceneEpoch = 1, visualEpoch = 1,
  mapId = 1, viewportWidth = 640, viewportHeight = 480, mapWidth = 24, mapHeight = 18,
  bridgeLevel = 0, columns = 20, rows = 14, projectionBounds,
} = {}) {
  const tileList = tiles ?? [regularTile({ depth })];
  const barHeight = viewportHeight < 480 ? 24 : viewportHeight < 720 ? 32 : 48;
  const contentWidth = viewportWidth;
  const contentHeight = viewportHeight - barHeight;
  const logicalWidth = columns * 32;
  const logicalHeight = rows * 32;
  return {
    sceneEpoch,
    visualEpoch,
    motionId: cameraMotion?.id ?? null,
    viewportWidth,
    viewportHeight,
    barHeight,
    contentWidth,
    contentHeight,
    columns,
    rows,
    logicalWidth,
    logicalHeight,
    scaleX: contentWidth / logicalWidth,
    scaleY: contentHeight / logicalHeight,
    mapName: String(mapId),
    mapId,
    mapWidth,
    mapHeight,
    cameraX,
    cameraY,
    tileset,
    autotiles,
    projectionBounds: projectionBounds ?? { minTileX: 0, minTileY: 0, maxTileX: mapWidth - 1, maxTileY: mapHeight - 1 },
    tiles: [...tileList]
      .sort((left, right) => left.z - right.z || left.y - right.y || left.x - right.x)
      .map((tile) => [tile.x, tile.y, tile.z, tile.tileId, tile.depth]),
    cameraMotion,
    bridgeLevel,
  };
}

function responsiveViewData(options = {}) {
  return viewData(options);
}

function spriteData(y = 0) {
  return {
    sceneEpoch: 1, visualEpoch: 1, motionId: null,
    x: 0, y, screenX: 0, screenY: y * 32, direction: 2, pattern: 0, sprite: spriteRef, motion: null,
    bridgeLevel: 0,
  };
}

function matchingSprite(view, extra = {}) {
  const base = view.motionId === null ? spriteData(0) : walkingSprite({ id: view.motionId });
  return { ...base, sceneEpoch: view.sceneEpoch, visualEpoch: view.visualEpoch, motionId: view.motionId, bridgeLevel: view.bridgeLevel ?? 0, ...extra };
}

function walkingSprite({ y = 1, fromY = 0, screenX = 0, screenY = 32, fromScreenX = 0, fromScreenY = 0, pattern = 1, id = 1, sprite = spriteRef, direction = 2 } = {}) {
  return {
    sceneEpoch: 1, visualEpoch: 1, motionId: id,
    x: 0, y, screenX, screenY, direction, pattern, sprite,
    motion: { id, durationMs: 250, fromY, fromScreenX, fromScreenY },
    bridgeLevel: 0,
  };
}

let browser;
let origin;
let server;

before(async () => {
  const source = await readFile(mapBrowserPath);
  server = http.createServer((request, response) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname === "/map.browser.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(source);
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><html><head></head><body style=\"margin:0\"></body></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test("Browser renders 0/1/N independent sprites, preserves static pattern, and removes stale nodes", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const payload = viewData({ depth: 0 });
  await page.evaluate(({ viewPayload, player, npcA, npcB }) => {
    const view = window.__view;
    const first = window.__sprite;
    const second = document.createElement("lr-map-sprite");
    const third = document.createElement("lr-map-sprite");
    view.append(second, third);
    const resources = first._resources;
    second.receiveRenderContext({ resources });
    third.receiveRenderContext({ resources });
    view.receiveRenderData(viewPayload);
    first.receiveRenderData(player);
    second.receiveRenderData(npcA);
    third.receiveRenderData(npcB);
    window.__npcA = second;
    window.__npcB = third;
  }, {
    viewPayload: payload,
    player: matchingSprite(payload),
    npcA: matchingSprite(payload, { x: 1, y: 1, screenX: 32, screenY: 32, motionId: null, motion: null, pattern: 2 }),
    npcB: matchingSprite(payload, { x: 2, y: 2, screenX: 64, screenY: 64, motionId: null, motion: null, pattern: 3 }),
  });
  await waitUntil(page, () => [...document.querySelectorAll("lr-map-sprite")].every((sprite) => sprite._lastPaintedScreen), "three sprites painted");
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("lr-map-sprite")].map((sprite) => ({ left: sprite.style.left, top: sprite.style.top, crop: sprite._cropKey }))), [
    { left: "0px", top: "0px", crop: `${identityOf(spriteRef)}|2|0|32x32` },
    { left: "32px", top: "32px", crop: `${identityOf(spriteRef)}|2|2|32x32` },
    { left: "64px", top: "64px", crop: `${identityOf(spriteRef)}|2|3|32x32` },
  ]);
  await page.evaluate(() => { window.__npcA.remove(); window.__npcB.remove(); });
  await waitUntil(page, () => document.querySelectorAll("lr-map-sprite").length === 1, "NPC nodes removed");
  await page.evaluate(() => window.__sprite.remove());
  await waitUntil(page, () => document.querySelectorAll("lr-map-sprite").length === 0, "zero sprites supported");
  assert.equal(await page.evaluate(() => window.__view.dataset.mapVisualState), "ready");
});

test("scene replacement retains complete view-owned 0/1/N sprite sets until one atomic promote", { timeout: 60_000 }, async (t) => {
  for (const [oldCount, targetCount] of [[0, 1], [1, 3], [3, 0]]) {
    const page = await openPage();
    t.after(() => page.close());
    const first = viewData({ sceneEpoch: 1, visualEpoch: 1 });
    const targetTileset = tilesetRef(`scene-2-${oldCount}-${targetCount}`);
    const target = viewData({ sceneEpoch: 2, visualEpoch: 2, tileset: targetTileset, mapId: 2 });
    await page.evaluate(({ viewPayload, player, npcs }) => {
      const resources = window.__sprite._resources;
      window.__expectedOldCount = npcs.length + 1;
      for (const data of npcs) {
        const node = document.createElement("lr-map-sprite");
        node.receiveRenderContext({ resources });
        window.__view.append(node);
        node.receiveRenderData(data);
      }
      window.__view.receiveRenderData(viewPayload);
      window.__sprite.receiveRenderData(player);
    }, {
      viewPayload: first,
      player: matchingSprite(first),
      npcs: Array.from({ length: oldCount }, (_, index) => matchingSprite(first, { x: index + 2, y: 2, screenX: (index + 2) * 32, screenY: 64, pattern: index % 4 })),
    });
    await waitUntil(page, () => window.__view._acceptedVisualScene?.sprites.length === window.__expectedOldCount, `old ${oldCount}-NPC scene accepted`);
    await delayTileset(page, targetTileset);
    await page.evaluate(({ viewPayload, player, npcs }) => {
      const view = window.__view;
      window.__oldAcceptedVisuals = view._acceptedVisualScene.sprites.map((entry) => entry.visual);
      for (const node of [...view.children].slice(1)) node.remove();
      view.receiveRenderData(viewPayload);
      window.__sprite.receiveRenderData(player);
      const resources = window.__sprite._resources;
      for (const data of npcs) {
        const node = document.createElement("lr-map-sprite");
        node.receiveRenderContext({ resources });
        view.append(node);
        node.receiveRenderData(data);
      }
    }, {
      viewPayload: target,
      player: matchingSprite(target),
      npcs: Array.from({ length: targetCount }, (_, index) => matchingSprite(target, { x: index + 3, y: 3, screenX: (index + 3) * 32, screenY: 96, pattern: (index + 1) % 4 })),
    });
    await waitForPendingImage(page, targetTileset);
    const staged = await page.evaluate(() => ({
      acceptedEpoch: window.__view._acceptedVisualScene.view.sceneEpoch,
      stagingEpoch: window.__view._stagingVisualScene?.sceneEpoch,
      oldVisualsConnected: window.__oldAcceptedVisuals.every((visual) => visual.isConnected && !visual.hidden),
      visibleVisualCount: window.__view.shadowRoot.querySelectorAll("canvas.sprite-visual:not([hidden])").length,
      canonicalCount: window.__view.querySelectorAll("lr-map-sprite").length,
    }));
    assert.deepEqual(staged, {
      acceptedEpoch: 1,
      stagingEpoch: 2,
      oldVisualsConnected: true,
      visibleVisualCount: oldCount + 1,
      canonicalCount: targetCount + 1,
    });
    await settlePendingImage(page, targetTileset, "resolve");
    await waitUntil(page, () => window.__view._acceptedVisualScene?.view.sceneEpoch === 2, `target ${targetCount}-NPC scene promoted`);
    const promoted = await page.evaluate(() => ({
      acceptedCount: window.__view._acceptedVisualScene.sprites.length,
      visibleVisualCount: window.__view.shadowRoot.querySelectorAll("canvas.sprite-visual:not([hidden])").length,
      oldVisualsReleased: window.__oldAcceptedVisuals.every((visual) => !visual.isConnected),
      staging: window.__view._stagingVisualScene,
    }));
    assert.equal(promoted.acceptedCount, targetCount + 1);
    assert.equal(promoted.visibleVisualCount, targetCount + 1);
    assert.equal(promoted.oldVisualsReleased, true);
    assert.equal(promoted.staging, undefined);
  }
});

test("same-scene NPC add, slow replacement, and remove patch only the accepted sprite set", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const viewPayload = viewData({ sceneEpoch: 1, visualEpoch: 1 });
  await page.evaluate(({ viewPayload: view, player }) => {
    window.__view.receiveRenderData(view);
    window.__sprite.receiveRenderData(player);
  }, { viewPayload, player: matchingSprite(viewPayload) });
  await waitUntil(page, () => window.__view._acceptedVisualScene?.sprites.length === 1, "player-only scene accepted");
  const slowRef = { namespace: "resource.Graphics", key: "Characters/slow-npc", contentVersion: "v1" };
  await delayTileset(page, slowRef);
  await page.evaluate(({ npc }) => {
    const node = document.createElement("lr-map-sprite");
    node.receiveRenderContext({ resources: window.__sprite._resources });
    window.__view.append(node);
    node.receiveRenderData(npc);
    window.__sameSceneNpc = node;
    window.__sameSceneTile = window.__view._layers[0].canvas;
    window.__oldSameSceneVisuals = window.__view._acceptedVisualScene.sprites.map((entry) => entry.visual);
  }, { npc: matchingSprite(viewPayload, { x: 2, y: 2, screenX: 64, screenY: 64, sprite: slowRef }) });
  await waitForPendingImage(page, slowRef);
  assert.deepEqual(await page.evaluate(() => ({
    acceptedCount: window.__view._acceptedVisualScene.sprites.length,
    oldComplete: window.__oldSameSceneVisuals.every((visual) => visual.isConnected && !visual.hidden),
    staging: window.__view._stagingVisualScene,
    tileSame: window.__view._layers[0].canvas === window.__sameSceneTile,
  })), { acceptedCount: 1, oldComplete: true, staging: undefined, tileSame: true });
  await settlePendingImage(page, slowRef, "resolve");
  await waitUntil(page, () => window.__view._acceptedVisualScene?.sprites.length === 2, "same-scene NPC add committed");
  const replacementRef = { namespace: "resource.Graphics", key: "Characters/replacement", contentVersion: "v2" };
  await delayTileset(page, replacementRef);
  await page.evaluate((data) => {
    window.__oldNpcVisual = window.__view._acceptedVisualScene.sprites[1].visual;
    window.__expectedReplacementId = `${data.sprite.namespace}\u0000${data.sprite.key}\u0000${data.sprite.contentVersion}`;
    window.__sameSceneNpc.receiveRenderData(data);
  }, matchingSprite(viewPayload, { x: 3, y: 2, screenX: 96, screenY: 64, sprite: replacementRef, direction: 6 }));
  await waitForPendingImage(page, replacementRef);
  assert.equal(await page.evaluate(() => window.__oldNpcVisual.isConnected && !window.__oldNpcVisual.hidden), true);
  await settlePendingImage(page, replacementRef, "resolve");
  await waitUntil(page, () => window.__view._acceptedVisualScene?.sprites[1]?.resourceId === window.__expectedReplacementId, "same-scene NPC replacement committed");
  assert.equal(await page.evaluate(() => window.__view._layers[0].canvas === window.__sameSceneTile && !window.__oldNpcVisual.isConnected), true);
  await page.evaluate(() => window.__sameSceneNpc.remove());
  await waitUntil(page, () => window.__view._acceptedVisualScene?.sprites.length === 1, "same-scene NPC remove committed");
  assert.equal(await page.evaluate(() => window.__view._layers[0].canvas === window.__sameSceneTile && window.__view._stagingVisualScene === undefined), true);
});

test("same target scene coalesces newer revisions and recovers from a failed preparation", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const first = viewData({ sceneEpoch: 1, visualEpoch: 1 });
  await page.evaluate(({ viewPayload, player }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(player);
  }, { viewPayload: first, player: matchingSprite(first) });
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.sceneEpoch === 1, "scene A accepted");
  const failedRef = tilesetRef("target-fails");
  await delayTileset(page, failedRef);
  const target1 = viewData({ sceneEpoch: 2, visualEpoch: 2, mapId: 2, tileset: failedRef });
  await page.evaluate(({ viewPayload, player }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(player);
  }, { viewPayload: target1, player: matchingSprite(target1) });
  await waitForPendingImage(page, failedRef);
  const owner = await page.evaluate(() => window.__view._stagingVisualScene.owner);
  const target2 = viewData({ sceneEpoch: 2, visualEpoch: 3, mapId: 2, tileset: failedRef, cameraX: 32 });
  await page.evaluate(({ viewPayload, player }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(player);
  }, { viewPayload: target2, player: matchingSprite(target2, { screenX: 32 }) });
  assert.equal(await page.evaluate(() => window.__view._stagingVisualScene.owner), owner);
  await settlePendingImage(page, failedRef, "reject");
  await waitUntil(page, () => window.__view._stagingVisualScene?.state === "FAILED", "target staging failure observed");
  assert.equal(await page.evaluate(() => window.__view._acceptedVisualScene.view.sceneEpoch), 1);
  const recoveredRef = tilesetRef("target-recovers");
  const target3 = viewData({ sceneEpoch: 2, visualEpoch: 4, mapId: 2, tileset: recoveredRef, cameraX: 32 });
  await page.evaluate(({ viewPayload, player }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(player);
  }, { viewPayload: target3, player: matchingSprite(target3, { screenX: 32 }) });
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 4, "recovered target revision promoted");
  assert.deepEqual(await page.evaluate(() => ({
    sceneEpoch: window.__view._acceptedVisualScene.view.sceneEpoch,
    staging: window.__view._stagingVisualScene,
    state: window.__view.dataset.mapVisualState,
  })), { sceneEpoch: 2, staging: undefined, state: "ready" });
});

test("held movement cannot starve staging; stale and disconnected staging results never promote", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const first = viewData({ sceneEpoch: 1, visualEpoch: 1 });
  await page.evaluate(({ viewPayload, player }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(player);
  }, { viewPayload: first, player: matchingSprite(first) });
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.sceneEpoch === 1, "source scene accepted");
  const delayedB = tilesetRef("held-b");
  await delayTileset(page, delayedB);
  const b1 = viewData({ sceneEpoch: 2, visualEpoch: 2, mapId: 2, tileset: delayedB });
  await page.evaluate(({ viewPayload, player }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(player);
  }, { viewPayload: b1, player: matchingSprite(b1) });
  await waitForPendingImage(page, delayedB);
  const stagingOwner = await page.evaluate(() => window.__view._stagingVisualScene.owner);
  for (let motionId = 1; motionId <= 3; motionId += 1) {
    const next = viewData({
      sceneEpoch: 2,
      visualEpoch: 2,
      mapId: 2,
      tileset: delayedB,
      cameraX: motionId * 16,
      cameraMotion: { id: motionId, durationMs: 250, fromCameraX: (motionId - 1) * 16, fromCameraY: 0 },
    });
    await page.evaluate(({ viewPayload, player }) => {
      window.__view.receiveRenderData(viewPayload);
      window.__sprite.receiveRenderData(player);
    }, { viewPayload: next, player: matchingSprite(next, { ...walkingSprite({ id: motionId, screenX: motionId * 16, fromScreenX: (motionId - 1) * 16 }), sceneEpoch: 2, visualEpoch: 2 }) });
  }
  assert.deepEqual(await page.evaluate(() => ({
    owner: window.__view._stagingVisualScene.owner,
    acceptedEpoch: window.__view._acceptedVisualScene.view.sceneEpoch,
    latestMotion: window.__view._desiredView.data.motionId,
  })), { owner: stagingOwner, acceptedEpoch: 1, latestMotion: 3 });
  await settlePendingImage(page, delayedB, "resolve");
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.motionId === 3, "latest held-movement target revision promoted");

  const delayedC = tilesetRef("stale-c");
  await delayTileset(page, delayedC);
  const c = viewData({ sceneEpoch: 3, visualEpoch: 3, mapId: 3, tileset: delayedC });
  await page.evaluate(({ viewPayload, player }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(player);
  }, { viewPayload: c, player: matchingSprite(c) });
  await waitForPendingImage(page, delayedC);
  const d = viewData({ sceneEpoch: 4, visualEpoch: 4, mapId: 4, tileset: tilesetRef("fresh-d") });
  await page.evaluate(({ viewPayload, player }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(player);
  }, { viewPayload: d, player: matchingSprite(d) });
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.sceneEpoch === 4, "newer scene D promoted");
  await settlePendingImage(page, delayedC, "resolve");
  assert.equal(await page.evaluate(() => window.__view._acceptedVisualScene.view.sceneEpoch), 4);

  const delayedE = tilesetRef("disconnect-e");
  await delayTileset(page, delayedE);
  const e = viewData({ sceneEpoch: 5, visualEpoch: 5, mapId: 5, tileset: delayedE });
  await page.evaluate(({ viewPayload, player }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(player);
  }, { viewPayload: e, player: matchingSprite(e) });
  await waitForPendingImage(page, delayedE);
  await page.evaluate(() => window.__view.remove());
  await settlePendingImage(page, delayedE, "resolve");
  await waitUntil(page, () => window.__view._state === "DISPOSED", "staging view disposed");
  assert.deepEqual(await page.evaluate(() => ({
    accepted: window.__view._acceptedVisualScene,
    staging: window.__view._stagingVisualScene,
    resources: window.__view._owners.size,
  })), { accepted: undefined, staging: undefined, resources: 0 });
});

test("static NPC follows the current camera at animation start, midpoint, and end", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const viewPayload = viewData({
    depth: 0,
    cameraX: 32,
    cameraMotion: { id: 41, durationMs: 250, fromCameraX: 0, fromCameraY: 0 },
  });
  await page.evaluate(({ viewPayload: view, player, npc }) => {
    const npcElement = document.createElement("lr-map-sprite");
    window.__view.append(npcElement);
    npcElement.receiveRenderContext({ resources: window.__sprite._resources });
    window.__view.receiveRenderData(view);
    window.__sprite.receiveRenderData(player);
    npcElement.receiveRenderData(npc);
    window.__cameraNpc = npcElement;
  }, {
    viewPayload,
    player: { ...walkingSprite({ id: 41, y: 1, fromY: 0, screenX: 0, screenY: 32, fromScreenX: 0, fromScreenY: 0 }), x: 1 },
    npc: matchingSprite(viewPayload, { x: 5, y: 2, screenX: 128, screenY: 64, motionId: null, motion: null, pattern: 3 }),
  });
  await waitUntil(page, () => window.__view._accepted?.sprites?.length === 2, "camera motion with static NPC accepted");
  const samples = await page.evaluate(() => {
    const view = window.__view;
    const prepared = view._accepted;
    if (view._raf !== undefined) cancelAnimationFrame(view._raf);
    view._activeMotion = { ...view._activeMotion, startedAt: 1_000, durationMs: 250 };
    const sample = (elapsed) => {
      view._activeMotion.startedAt = performance.now() - elapsed;
      view._tickAccepted(prepared, view._sequence, false);
      if (view._raf !== undefined) cancelAnimationFrame(view._raf);
      view._raf = undefined;
      for (const child of view._spriteChildren()) child._raf = undefined;
      return {
        npc: { ...window.__cameraNpc._lastPaintedScreen },
        player: { ...window.__sprite._lastPaintedScreen },
        crop: window.__cameraNpc._cropKey,
        tileLeft: view.shadowRoot.querySelector("canvas.tile-layer:not([hidden])")?.style.left,
      };
    };
    return [sample(-1), sample(125), sample(300)];
  });
  assert.deepEqual(samples.map((sample) => sample.npc), [{ x: 160, y: 64 }, { x: 144, y: 64 }, { x: 128, y: 64 }]);
  assert.deepEqual(samples.map((sample) => sample.player.x), [0, 0, 0], "Player retains its existing motion interpolation");
  assert.deepEqual(samples.map((sample) => sample.tileLeft), ["0px", "-16px", "-32px"]);
  assert.equal(samples.every((sample) => sample.crop === `${identityOf(spriteRef)}|2|3|32x32`), true);
});

async function openPage({ clock = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  if (clock) await page.clock.install({ time: Date.now() });
  await page.goto(origin);
  if (clock) {
    await page.clock.pauseAt(Date.now() + 24 * 60 * 60 * 1000);
    await page.evaluate(() => {
      // Playwright fake rAF is 16ms-quantized and cannot hit exact duration
      // boundaries; clock tests still drive time with runFor via 0-delay timeouts.
      const scheduled = new Map();
      let nextId = 1;
      window.requestAnimationFrame = (callback) => {
        const id = nextId++;
        const timer = window.setTimeout(() => {
          scheduled.delete(id);
          callback(performance.now());
        }, 0);
        scheduled.set(id, timer);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        const timer = scheduled.get(id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          scheduled.delete(id);
        }
      };
      window.__mapLayeringFakeClock = true;
    });
  }
  await page.addScriptTag({ url: `${origin}/map.browser.js` });
  await page.evaluate(async () => {
    const pngBytes = async (width, height, r, g, b) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      context.fillStyle = `rgb(${r}, ${g}, ${b})`;
      context.fillRect(0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      return new Uint8Array(await blob.arrayBuffer());
    };
    window.__mapLayering = {
      resourceBytes: new Map(),
      fetchCount: 0,
      tilesetBytes: await pngBytes(32, 32, 0, 0, 255),
      characterBytes: await (async () => {
        const canvas = new OffscreenCanvas(128, 128);
        const context = canvas.getContext("2d");
        const colors = ["rgb(255, 0, 0)", "rgb(0, 255, 0)", "rgb(0, 0, 255)", "rgb(255, 255, 0)"];
        for (let column = 0; column < 4; column += 1) {
          context.fillStyle = colors[column];
          context.fillRect(column * 32, 0, 32, 128);
        }
        const blob = await canvas.convertToBlob({ type: "image/png" });
        return new Uint8Array(await blob.arrayBuffer());
      })(),
      delayed: new Map(),
    };
    const resources = {
      async resource(namespace, key, contentVersion) {
        const id = `${namespace}\u0000${key}\u0000${contentVersion}`;
        window.__mapLayering.fetchCount += 1;
        if (window.__mapLayering.delayed.has(id)) return window.__mapLayering.delayed.get(id).promise;
        if (window.__mapLayering.resourceBytes.has(key)) return { bytes: window.__mapLayering.resourceBytes.get(key), mime: "image/png" };
        if (key.startsWith("Tilesets/")) return { bytes: window.__mapLayering.tilesetBytes, mime: "image/png" };
        if (key.startsWith("Characters/")) return { bytes: window.__mapLayering.characterBytes, mime: "image/png" };
        throw new Error(`missing resource ${namespace}/${key}`);
      },
    };
    const view = document.createElement("lr-map-view");
    const sprite = document.createElement("lr-map-sprite");
    view.append(sprite);
    document.body.replaceChildren(view);
    view.receiveRenderContext({ resources });
    sprite.receiveRenderContext({ resources });
    window.__view = view;
    window.__sprite = sprite;
    window.__tileDestX = () => {
      const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])");
      if (!canvas) return null;
      const left = Number.parseFloat(canvas.style.left);
      if (!Number.isFinite(left) || left <= -32) return null;
      return left;
    };
  });
  return page;
}

async function waitUntil(page, predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!(await page.evaluate(predicate))) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function waitPainted(page, tileZIndex, spriteZIndex = "65") {
  const deadline = Date.now() + 10_000;
  while (!(await page.evaluate(({ tileZ, spriteZ }) => {
    const view = document.querySelector("lr-map-view");
    const sprite = document.querySelector("lr-map-sprite");
    const visible = [...(view?.shadowRoot?.querySelectorAll("canvas.tile-layer") ?? [])].filter((canvas) => !canvas.hidden);
    return visible.some((canvas) => canvas.style.zIndex === tileZ) && getComputedStyle(sprite).zIndex === spriteZ;
  }, { tileZ: String(tileZIndex), spriteZ: String(spriteZIndex) }))) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for tile z-index ${tileZIndex} and sprite z-index ${spriteZIndex}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function waitForPendingImage(page, ref, host = "__view") {
  const id = identityOf(ref);
  const deadline = Date.now() + 10_000;
  while (!(await page.evaluate(({ imageId, host: name }) => window[name === "__sprite" ? "__view" : name]._images.has(imageId), { imageId: id, host }))) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for pending image ${id}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function settlePendingImage(page, ref, outcome, host = "__view") {
  const id = identityOf(ref);
  await page.evaluate(async ({ imageId, outcome: next, host: name }) => {
    const pending = window[name === "__sprite" ? "__view" : name]._images.get(imageId);
    const delayed = window.__mapLayering.delayed.get(imageId);
    if (!delayed) throw new Error(`delayed resource missing for ${imageId}`);
    if (next === "resolve") delayed.resolve({ bytes: imageId.includes("Characters/") ? window.__mapLayering.characterBytes : window.__mapLayering.tilesetBytes, mime: "image/png" });
    else delayed.reject(new Error("stale tileset failed"));
    if (pending) await pending.then(() => undefined, () => undefined);
    else await delayed.promise.then(() => undefined, () => undefined);
  }, { imageId: id, outcome, host });
}

async function tilePixel(page, x = 8, y = 8) {
  return page.evaluate(({ x: sampleX, y: sampleY }) => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])");
    if (!canvas) return null;
    return [...canvas.getContext("2d").getImageData(sampleX, sampleY, 1, 1).data];
  }, { x, y });
}

async function makeStrip(page, frameWidth, frameHeight, colors) {
  return page.evaluate(async ({ frameWidth: width, frameHeight: height, colors: fills }) => {
    const canvas = new OffscreenCanvas(width * fills.length, height);
    const context = canvas.getContext("2d");
    for (let index = 0; index < fills.length; index += 1) {
      context.fillStyle = fills[index];
      context.fillRect(index * width, 0, width, height);
    }
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, { frameWidth, frameHeight, colors });
}

async function installAutotile(page, key, bytes) {
  await page.evaluate(({ key: resourceKey, bytes: raw }) => {
    window.__mapLayering.resourceBytes.set(resourceKey, Uint8Array.from(raw));
  }, { key, bytes });
}

const stackTilesetRef = (contentVersion = "v1") => ({ namespace: "resource.Graphics", key: "Tilesets/stack", contentVersion });

async function makeIndexedTileset(page) {
  return page.evaluate(async () => {
    const canvas = new OffscreenCanvas(256, 32);
    const context = canvas.getContext("2d");
    context.fillStyle = "rgb(255, 0, 255)";
    context.fillRect(0, 0, 32, 32);
    context.fillStyle = "rgb(255, 255, 0)";
    context.fillRect(32, 0, 32, 32);
    context.fillStyle = "rgb(255, 255, 0)";
    context.fillRect(64, 0, 16, 16);
    context.fillStyle = "rgb(0, 255, 255)";
    context.fillRect(96, 0, 32, 32);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
}

async function installTileset(page, key, bytes) {
  await page.evaluate(({ key: resourceKey, bytes: raw }) => {
    window.__mapLayering.resourceBytes.set(resourceKey, Uint8Array.from(raw));
  }, { key, bytes });
}

async function paintPair(page, viewPayload) {
  await page.evaluate(({ viewPayload: view, spritePayload }) => {
    window.__view.receiveRenderData(view);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload, spritePayload: matchingSprite(viewPayload) });
  if (await page.evaluate(() => window.__mapLayeringFakeClock === true)) await page.clock.runFor(0);
  await waitUntil(page, () => {
    const view = document.querySelector("lr-map-view");
    return view?._state === "VISIBLE" && view.shadowRoot.querySelector("canvas.tile-layer:not([hidden])");
  }, "paired map paint");
}

async function cellPixel(page, tileX, tileY, sampleX = 8, sampleY = 8) {
  return page.evaluate(({ tileX: x, tileY: y, sampleX: sx, sampleY: sy }) => {
    const view = document.querySelector("lr-map-view");
    const worldX = x * 32 + sx;
    const worldY = y * 32 + sy;
    let found = [0, 0, 0, 0];
    for (const layer of view._layers ?? []) {
      if (!layer.canvas || layer.canvas.hidden) continue;
      const dx = worldX - layer.worldX;
      const dy = worldY - layer.worldY;
      if (dx < 0 || dy < 0 || dx >= layer.canvas.width || dy >= layer.canvas.height) continue;
      const pixel = [...layer.context.getImageData(dx, dy, 1, 1).data];
      if (pixel[3] !== 0) found = pixel;
    }
    return found;
  }, { tileX, tileY, sampleX, sampleY });
}

async function paintAutotile(page, viewPayload) {
  await page.evaluate(({ viewPayload: view, spritePayload }) => {
    window.__view.receiveRenderData(view);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload, spritePayload: matchingSprite(viewPayload) });
  if (await page.evaluate(() => window.__mapLayeringFakeClock === true)) await page.clock.runFor(0);
  await waitUntil(page, () => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])");
    if (!canvas) return false;
    const data = canvas.getContext("2d").getImageData(0, 0, 32, 32).data;
    for (let index = 3; index < data.length; index += 4) if (data[index] === 255) return true;
    return false;
  }, "autotile first paint");
}

async function spritePixel(page, x = 5, y = 5) {
  return page.evaluate(({ x: sampleX, y: sampleY }) => {
    const canvas = window.__view._acceptedVisualScene.sprites[0].visual;
    return [...canvas.getContext("2d").getImageData(sampleX, sampleY, 1, 1).data];
  }, { x, y });
}

async function spriteBox(page) {
  return page.evaluate(() => {
    const sprite = document.querySelector("lr-map-sprite");
    return { left: getComputedStyle(sprite).left, top: getComputedStyle(sprite).top, zIndex: getComputedStyle(sprite).zIndex, raf: sprite._raf };
  });
}

async function compositeCenter(page) {
  const pngBytes = await page.locator("lr-map-view").screenshot();
  return page.evaluate(async (b64) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const [r, g, b, a] = context.getImageData(16, 16, 1, 1).data;
    return [r, g, b, a];
  }, pngBytes.toString("base64"));
}

async function compositePixels(page, points) {
  const pngBytes = await page.locator("lr-map-view").screenshot();
  return page.evaluate(async ({ b64, samples }) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    return samples.map(({ x, y }) => [...context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data]);
  }, { b64: pngBytes.toString("base64"), samples: points });
}

async function layerInfo(page) {
  return page.evaluate(() => {
    const root = document.querySelector("lr-map-view").shadowRoot;
    const world = root.querySelector(".map-world");
    const slot = root.querySelector("slot");
    const canvases = [...root.querySelectorAll("canvas.tile-layer")];
    const children = [...world.children];
    return {
      entities: Boolean(root.querySelector(".entities")),
      slotDisplay: getComputedStyle(slot).display,
      tileLayersDirect: canvases.every((canvas) => canvas.parentNode === world),
      canvasesBeforeSlot: canvases.every((canvas) => children.indexOf(canvas) >= 0 && children.indexOf(canvas) < children.indexOf(slot)),
      canvasCount: canvases.length,
      hidden: canvases.map((canvas) => canvas.hidden),
      zIndex: canvases.map((canvas) => canvas.style.zIndex),
      spriteZIndex: getComputedStyle(document.querySelector("lr-map-sprite")).zIndex,
    };
  });
}

async function secondLayerCleared(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("lr-map-view").shadowRoot.querySelectorAll("canvas.tile-layer")[1];
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < data.length; index += 1) if (data[index] !== 0) return false;
    return canvas.hidden === true;
  });
}

async function delayTileset(page, ref) {
  await page.evaluate((id) => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    window.__mapLayering.delayed.set(id, { promise, resolve, reject });
  }, identityOf(ref));
}

async function warmPresentation(page) {
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0 }), spritePayload: spriteData(0) });
  await waitPainted(page, "0");
  await page.evaluate(async ({ tilesetId, spriteId }) => {
    const tileset = window.__view._images.get(tilesetId);
    const sprite = window.__view._images.get(spriteId);
    if (!tileset || !sprite) throw new Error("warmPresentation missing decoded images");
    await tileset;
    await sprite;
  }, { tilesetId: identityOf(tilesetRef("v1")), spriteId: identityOf(spriteRef) });
}

test("A. MapView shadow DOM has no entities wrapper and canvases precede slot", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0 }), spritePayload: spriteData(0) });
  await waitPainted(page, "0");
  const info = await layerInfo(page);
  assert.equal(info.entities, false);
  assert.equal(info.slotDisplay, "contents");
  assert.equal(info.tileLayersDirect, true);
  assert.equal(info.canvasesBeforeSlot, true);
  assert.ok(info.canvasCount >= 1);
});

test("responsive tuple payload commits DOM content, world transform and footer atomically", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const viewPayload = responsiveViewData({ tiles: [regularTile({ x: 1, y: 1, depth: 0 })] });
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload, spritePayload: matchingSprite(viewPayload, { screenX: 32, screenY: 32 }) });
  await waitPainted(page, "0");
  const result = await page.evaluate(() => {
    const view = window.__view;
    const root = view.shadowRoot;
    return {
      state: view.dataset.mapVisualState,
      content: [root.querySelector(".map-content").clientWidth, root.querySelector(".map-content").clientHeight],
      world: [root.querySelector(".map-world").clientWidth, root.querySelector(".map-world").clientHeight],
      footer: [root.querySelector("footer").clientHeight, root.querySelector(".map-name").textContent],
      canvasParent: root.querySelector("canvas.tile-layer").parentElement.className,
    };
  });
  assert.deepEqual(result, { state: "ready", content: [640, 448], world: [640, 448], footer: [32, "1"], canvasParent: "map-world" });
});

test("presentation geometry centers each small axis and partitions the matrix with half-open rectangles", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const cases = [
    { logicalWidth: 21 * 32, logicalHeight: 18 * 32, mapWidth: 20, mapHeight: 15, cameraX: 0, cameraY: 0, origin: [16, 48] },
    { logicalWidth: 20 * 32, logicalHeight: 14 * 32, mapWidth: 10, mapHeight: 8, cameraX: 0, cameraY: 0, origin: [160, 96] },
    { logicalWidth: 20 * 32, logicalHeight: 14 * 32, mapWidth: 20, mapHeight: 14, cameraX: 0, cameraY: 0, origin: [0, 0] },
    { logicalWidth: 20 * 32, logicalHeight: 14 * 32, mapWidth: 25, mapHeight: 12, cameraX: 80, cameraY: 0, origin: [0, 32] },
    { logicalWidth: 20 * 32, logicalHeight: 14 * 32, mapWidth: 19, mapHeight: 20, cameraX: 0, cameraY: 96, origin: [16, 0] },
    { logicalWidth: 60 * 32, logicalHeight: 33 * 32, mapWidth: 1, mapHeight: 1, cameraX: 0, cameraY: 0, origin: [944, 512] },
    { logicalWidth: 20 * 32, logicalHeight: 14 * 32, mapWidth: 18, mapHeight: 12, cameraX: 0, cameraY: 0, origin: [32, 32] },
  ];
  const geometries = await page.evaluate((inputs) => inputs.map((input) => window.__view._presentationGeometry(input)), cases);
  const area = (rect) => (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
  const overlap = (left, right) => Math.max(0, Math.min(left.x1, right.x1) - Math.max(left.x0, right.x0))
    * Math.max(0, Math.min(left.y1, right.y1) - Math.max(left.y0, right.y0));
  for (let index = 0; index < cases.length; index += 1) {
    const geometry = geometries[index];
    const input = cases[index];
    assert.deepEqual([geometry.originX, geometry.originY], input.origin);
    const rectangles = [geometry.visibleMap, ...geometry.fillRects].filter(Boolean);
    assert.equal(rectangles.reduce((sum, rect) => sum + area(rect), 0), input.logicalWidth * input.logicalHeight);
    for (let left = 0; left < rectangles.length; left += 1) {
      for (let right = left + 1; right < rectangles.length; right += 1) assert.equal(overlap(rectangles[left], rectangles[right]), 0);
    }
  }
  assert.equal(geometries[1].fillRects.length, 4);
  assert.equal(geometries[2].fillRects.length, 0);
  assert.equal(2 * geometries[0].originX + cases[0].mapWidth * 32, cases[0].logicalWidth);
  assert.equal(2 * geometries[6].originX + cases[6].mapWidth * 32, cases[6].logicalWidth);
  const invalid = await page.evaluate(() => {
    try {
      window.__view._presentationGeometry({ logicalWidth: 640, logicalHeight: 448, mapWidth: Number.MAX_SAFE_INTEGER, mapHeight: 1, cameraX: 0, cameraY: 0 });
      return false;
    } catch { return true; }
  });
  assert.equal(invalid, true);
});

test("small-map fill, transparent interior, tile depths, and slotted sprite share one scaled origin", { timeout: 90_000 }, async (t) => {
  const windows = [[640, 480], [800, 600], [1280, 720], [1920, 1080], [1920, 480], [640, 1080], [801, 601]];
  const evidence = [];
  const evidenceDirectory = process.env.LOOMREALM_MAP_CENTERING_EVIDENCE_DIR;
  if (evidenceDirectory) await mkdir(evidenceDirectory, { recursive: true });
  for (const [width, height] of windows) {
    const page = await openPage();
    t.after(() => page.close());
    await page.setViewportSize({ width, height });
    const layout = calculateLayout(width, height);
    const tiles = [
      regularTile({ x: 0, y: 0, z: 0, depth: 0 }),
      regularTile({ x: 0, y: 0, z: 1, depth: 64 }),
    ];
    const payload = responsiveViewData({
      viewportWidth: width,
      viewportHeight: height,
      columns: layout.columns,
      rows: layout.rows,
      mapWidth: 10,
      mapHeight: 8,
      tiles,
    });
    await page.evaluate(({ viewPayload, spritePayload }) => {
      window.__view.receiveRenderData(viewPayload);
      window.__sprite.receiveRenderData(spritePayload);
    }, { viewPayload: payload, spritePayload: matchingSprite(payload, { x: 1, y: 1, screenX: 32, screenY: 32 }) });
    await waitPainted(page, "128", "129");
    const result = await page.evaluate(() => {
      const view = window.__view;
      const root = view.shadowRoot;
      const content = root.querySelector(".map-content").getBoundingClientRect();
      const world = root.querySelector(".map-world").getBoundingClientRect();
      const canvases = [...root.querySelectorAll("canvas.tile-layer:not([hidden])")]
        .map((item) => item.getBoundingClientRect())
        .map((rect) => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }));
      const sprite = window.__sprite.getBoundingClientRect();
      const footer = root.querySelector("footer").getBoundingClientRect();
      return {
        geometry: view._accepted.geometry,
        content: { left: content.left, top: content.top, width: content.width, height: content.height },
        world: { left: world.left, top: world.top, width: world.width, height: world.height },
        canvases,
        sprite: { left: sprite.left, top: sprite.top, width: sprite.width, height: sprite.height },
        footer: { top: footer.top, width: footer.width, height: footer.height },
        background: getComputedStyle(root.querySelector(".map-world")).backgroundColor,
      };
    });
    const { originX, originY } = result.geometry;
    const scaleX = layout.scaleX;
    const scaleY = layout.scaleY;
    const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 0.02, JSON.stringify({ width, height, actual, expected }));
    near(result.world.width, width);
    near(result.world.height, layout.contentHeight);
    assert.equal(result.canvases.length, 2);
    for (const canvas of result.canvases) {
      near(canvas.left, originX * scaleX);
      near(canvas.top, originY * scaleY);
    }
    near(result.sprite.left, (originX + 32) * scaleX);
    near(result.sprite.top, (originY + 32) * scaleY);
    near(result.footer.top, layout.contentHeight);
    near(result.footer.width, width);
    near(result.footer.height, layout.barHeight);
    assert.equal(result.background, "rgb(255, 255, 255)");
    const mapLeft = originX * scaleX;
    const mapTop = originY * scaleY;
    const mapWidth = 10 * 32 * scaleX;
    const mapHeight = 8 * 32 * scaleY;
    const pixels = await compositePixels(page, [
      { x: mapLeft / 2, y: mapTop + mapHeight / 2 },
      { x: mapLeft + mapWidth / 2, y: mapTop + mapHeight / 2 },
      { x: mapLeft + 8 * scaleX, y: mapTop + 8 * scaleY },
    ]);
    assert.deepEqual(pixels[0], [255, 255, 255, 255]);
    assert.deepEqual(pixels[1], [0, 0, 0, 255]);
    assert.deepEqual(pixels[2], [0, 0, 255, 255]);
    const right = width - (mapLeft + mapWidth);
    const bottom = layout.contentHeight - (mapTop + mapHeight);
    assert.ok(Math.abs(mapLeft - right) <= 0.02);
    assert.ok(Math.abs(mapTop - bottom) <= 0.02);
    evidence.push({ width, height, layout, result, pixels, margins: { left: mapLeft, right, top: mapTop, bottom } });
    if (evidenceDirectory && width === 800 && height === 600) {
      await page.locator("lr-map-view").screenshot({ path: path.join(evidenceDirectory, "map-centering-800x600.png") });
    }
  }
  if (evidenceDirectory) {
    await writeFile(path.join(evidenceDirectory, "map-centering-browser.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  }
});

test("B. equal depth stacks character above tile", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 32 }), spritePayload: spriteData(0) });
  await waitPainted(page, "64", "65");
  const info = await layerInfo(page);
  assert.equal(info.zIndex[0], "64");
  assert.equal(info.spriteZIndex, "65");
});

test("C. high tile composites above the character", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 64 }), spritePayload: spriteData(0) });
  await waitPainted(page, "128", "65");
  const info = await layerInfo(page);
  assert.equal(info.zIndex[0], "128");
  assert.equal(info.spriteZIndex, "65");
  assert.ok(Number(info.zIndex[0]) > Number(info.spriteZIndex));
  assert.deepEqual(await compositeCenter(page), [0, 0, 255, 255]);
});

test("D. low tile composites below the character", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0 }), spritePayload: spriteData(0) });
  await waitPainted(page, "0", "65");
  const info = await layerInfo(page);
  assert.equal(info.zIndex[0], "0");
  assert.equal(info.spriteZIndex, "65");
  assert.ok(Number(info.zIndex[0]) < Number(info.spriteZIndex));
  assert.deepEqual(await compositeCenter(page), [255, 0, 0, 255]);
});

test("E. stale buckets hide and clear leftover canvases", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ first, second, spritePayload }) => {
    window.__view.receiveRenderData(first);
    window.__sprite.receiveRenderData(spritePayload);
    window.__firstPayload = first;
    window.__secondPayload = second;
  }, {
    first: viewData({
      tiles: [
        regularTile({ depth: 0 }),
        regularTile({ x: 1, tileId: 385, depth: 64 }),
      ],
    }),
    second: viewData({ tiles: [regularTile({ depth: 0 })] }),
    spritePayload: spriteData(0),
  });
  await waitUntil(page, () => {
    const canvases = [...document.querySelector("lr-map-view").shadowRoot.querySelectorAll("canvas.tile-layer")].filter((canvas) => !canvas.hidden);
    return canvases.length === 2 && canvases[0].style.zIndex === "0" && canvases[1].style.zIndex === "128";
  }, "two visible depth buckets");
  await page.evaluate(() => window.__view.receiveRenderData(window.__secondPayload));
  await waitUntil(page, () => window.__view._accepted?.view === window.__secondPayload, "second depth bucket commit");
  const info = await layerInfo(page);
  const visible = info.hidden.map((hidden, index) => ({ hidden, z: info.zIndex[index] })).filter((entry) => !entry.hidden);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].z, "0");
});

test("F. stale async success cannot overwrite a newer tileset identity", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const firstRef = tilesetRef("old");
  const secondRef = tilesetRef("new");
  await delayTileset(page, firstRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 64, tileset: firstRef }), spritePayload: spriteData(0) });
  await waitForPendingImage(page, firstRef);
  await page.evaluate(({ viewPayload }) => {
    window.__view.receiveRenderData(viewPayload);
  }, { viewPayload: viewData({ depth: 0, tileset: secondRef }) });
  await waitPainted(page, "0", "65");
  await settlePendingImage(page, firstRef, "resolve");
  const info = await layerInfo(page);
  const visibleZ = info.zIndex.filter((_, index) => info.hidden[index] === false);
  assert.deepEqual(visibleZ, ["0"]);
  assert.deepEqual(await compositeCenter(page), [255, 0, 0, 255]);
});

test("G. stale async failure cannot clear a newer tileset identity", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const firstRef = tilesetRef("old");
  const secondRef = tilesetRef("new");
  await delayTileset(page, firstRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0, tileset: firstRef }), spritePayload: spriteData(0) });
  await waitForPendingImage(page, firstRef);
  await page.evaluate(({ viewPayload }) => {
    window.__view.receiveRenderData(viewPayload);
  }, { viewPayload: viewData({ depth: 64, tileset: secondRef }) });
  await waitPainted(page, "128", "65");
  const before = await layerInfo(page);
  await settlePendingImage(page, firstRef, "reject");
  const after = await layerInfo(page);
  assert.equal(after.hidden[0], false);
  assert.equal(after.zIndex[0], before.zIndex[0]);
  assert.equal(after.zIndex[0], "128");
  assert.deepEqual(await compositeCenter(page), [0, 0, 255, 255]);
});

test("H. tile depth and player y validate synchronously", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const result = await page.evaluate(({ validView, sprite }) => {
    const throwsSync = (run) => {
      try {
        run();
        return { threw: false };
      } catch (error) {
        return { threw: true, name: error.name, message: error.message };
      }
    };
    const negativeDepth = throwsSync(() => window.__view.receiveRenderData({
      ...validView,
      tiles: [[0, 0, 0, 384, -1]],
    }));
    const nonIntegerDepth = throwsSync(() => window.__view.receiveRenderData({
      ...validView,
      tiles: [[0, 0, 0, 384, 0.5]],
    }));
    const negativeY = throwsSync(() => window.__sprite.receiveRenderData({ ...sprite, y: -1 }));
    const nonIntegerY = throwsSync(() => window.__sprite.receiveRenderData({ ...sprite, y: 0.5 }));
    return { negativeDepth, nonIntegerDepth, negativeY, nonIntegerY };
  }, { validView: viewData({ depth: 0 }), sprite: spriteData(0) });
  for (const key of ["negativeDepth", "nonIntegerDepth", "negativeY", "nonIntegerY"]) {
    assert.equal(result[key].threw, true, key);
    assert.equal(result[key].name, "TypeError", key);
  }
});

test("walking uses four pattern source rects and swaps at half step", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  assert.deepEqual(await spritePixel(page), [255, 0, 0, 255]);

  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({ pattern: 1, screenY: 0, fromScreenY: 0, y: 0, fromY: 0 }),
  });
  await waitUntil(page, () => {
    const canvas = window.__view._acceptedVisualScene?.sprites[0]?.visual;
    if (!canvas) return false;
    const [r, g] = canvas.getContext("2d").getImageData(5, 5, 1, 1).data;
    return r === 0 && g === 255;
  }, "startPattern 1 first half");
  await waitUntil(page, () => {
    const [r, g, b] = window.__view._acceptedVisualScene.sprites[0].visual.getContext("2d").getImageData(5, 5, 1, 1).data;
    return r === 0 && g === 0 && b === 255;
  }, "startPattern 1 second half");

  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraMotion: { id: 2, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({ pattern: 3, screenY: 0, fromScreenY: 0, y: 0, fromY: 0, id: 2 }),
  });
  await waitUntil(page, () => {
    const [r, g] = window.__view._acceptedVisualScene.sprites[0].visual.getContext("2d").getImageData(5, 5, 1, 1).data;
    return r === 255 && g === 255;
  }, "startPattern 3 first half");
  await waitUntil(page, () => {
    const [r, g, b] = window.__view._acceptedVisualScene.sprites[0].visual.getContext("2d").getImageData(5, 5, 1, 1).data;
    return r === 255 && g === 0 && b === 0;
  }, "startPattern 3 second half");
});

test("walking interpolates integer pixels then snaps to target and stops rAF", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraX: 32, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({}),
  });
  await waitUntil(page, () => {
    const destX = window.__tileDestX();
    const top = Number.parseFloat(getComputedStyle(document.querySelector("lr-map-sprite")).top);
    return Number.isInteger(destX) && destX >= -31 && destX <= -1
      && Number.isInteger(top) && top > 0 && top < 32;
  }, "integer camera and sprite mid-step");
  await waitUntil(page, () => {
    const view = document.querySelector("lr-map-view");
    const sprite = document.querySelector("lr-map-sprite");
    return window.__tileDestX() === null
      && getComputedStyle(sprite).top === "32px"
      && view?._raf === undefined
      && sprite?._raf === undefined;
  }, "progress 1 camera and sprite target and rAF stop");
  const box = await spriteBox(page);
  assert.equal(box.top, "32px");
  assert.equal(Number.isInteger(Number.parseFloat(box.left)), true);
  assert.equal(box.raf, undefined);
  assert.equal(await page.evaluate(() => window.__view._raf), undefined);
  assert.equal(await page.evaluate(() => window.__tileDestX()), null);
});

test("standing latest state snaps pattern 0 and cancels motion", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }), spritePayload: walkingSprite({}) });
  await waitUntil(page, () => getComputedStyle(document.querySelector("lr-map-sprite")).top !== "auto" && getComputedStyle(document.querySelector("lr-map-sprite")).top !== "0px" || document.querySelector("lr-map-sprite")._lastPaintedScreen, "walking paint started");
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0 }), spritePayload: spriteData(1) });
  await waitUntil(page, () => {
    const sprite = document.querySelector("lr-map-sprite");
    const canvas = window.__view._acceptedVisualScene?.sprites[0]?.visual;
    if (!sprite || !canvas) return false;
    const [r, g, b] = canvas.getContext("2d").getImageData(5, 5, 1, 1).data;
    return getComputedStyle(sprite).top === "32px" && sprite._raf === undefined && r === 255 && g === 0 && b === 0;
  }, "standing snap");
});

test("moving depth is below the tile before the boundary pixel and above at it", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 48, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({ y: 1, fromY: 0, screenY: 0, fromScreenY: 0, pattern: 3 }),
  });
  await waitUntil(page, () => {
    const z = Number(getComputedStyle(document.querySelector("lr-map-sprite")).zIndex);
    const tileZ = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])")?.style.zIndex;
    return z > 0 && z < 97 && tileZ === "96";
  }, "character still below tile depth 48");
  let belowPixel;
  const belowDeadline = Date.now() + 200;
  while (Date.now() < belowDeadline) {
    const z = await page.evaluate(() => Number(getComputedStyle(document.querySelector("lr-map-sprite")).zIndex));
    if (z > 0 && z < 97) {
      belowPixel = await compositeCenter(page);
      if (belowPixel[2] === 255 && belowPixel[0] === 0) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.deepEqual(belowPixel, [0, 0, 255, 255]);
  await waitUntil(page, () => Number(getComputedStyle(document.querySelector("lr-map-sprite")).zIndex) >= 97, "character reached tile depth 48");
  assert.deepEqual(await compositeCenter(page), [255, 0, 0, 255]);
});

test("newer walking replaces old motion and standing cancel still wins", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  await page.evaluate(({ firstView, secondView, first, second }) => {
    window.__view.receiveRenderData(firstView);
    window.__sprite.receiveRenderData(first);
    window.__view.receiveRenderData(secondView);
    window.__sprite.receiveRenderData(second);
  }, {
    firstView: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    secondView: viewData({ depth: 0, cameraMotion: { id: 2, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    first: walkingSprite({ id: 1, screenY: 32 }),
    second: walkingSprite({ id: 2, y: 2, fromY: 1, screenY: 64, fromScreenY: 32, pattern: 3 }),
  });
  await waitUntil(page, () => {
    const top = Number.parseFloat(getComputedStyle(document.querySelector("lr-map-sprite")).top);
    return Number.isInteger(top) && top > 32 && top < 64;
  }, "newer walking in progress");
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0 }), spritePayload: spriteData(2) });
  await waitUntil(page, () => {
    const sprite = document.querySelector("lr-map-sprite");
    const canvas = window.__view._acceptedVisualScene?.sprites[0]?.visual;
    if (!sprite || !canvas) return false;
    const [r, g, b] = canvas.getContext("2d").getImageData(5, 5, 1, 1).data;
    return getComputedStyle(sprite).top === "64px" && sprite._raf === undefined && r === 255 && g === 0 && b === 0;
  }, "standing latest state");
});

test("disconnect cancels rAF so a stale callback cannot paint", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }), spritePayload: walkingSprite({}) });
  await waitUntil(page, () => document.querySelector("lr-map-sprite")?._raf !== undefined, "rAF started");
  await page.evaluate(() => {
    const sprite = window.__sprite;
    sprite.remove();
    window.__disconnectedRaf = sprite._raf;
  });
  await waitUntil(page, () => window.__sprite._raf === undefined, "rAF cancelled after disconnect");
  assert.equal(await page.evaluate(() => window.__sprite.isConnected), false);
});

test("stale sprite image success and failure do not override newer walking", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const firstRef = { namespace: "resource.Graphics", key: "Characters/red", contentVersion: "old" };
  const secondRef = { namespace: "resource.Graphics", key: "Characters/red", contentVersion: "new" };
  await delayTileset(page, firstRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }), spritePayload: walkingSprite({ sprite: firstRef, screenY: 32 }) });
  await waitForPendingImage(page, firstRef, "__sprite");
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraMotion: { id: 2, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({ sprite: secondRef, id: 2, y: 2, fromY: 1, screenY: 64, fromScreenY: 32, pattern: 3 }),
  });
  await waitUntil(page, () => getComputedStyle(document.querySelector("lr-map-sprite")).top === "64px", "newer sprite painted");
  await settlePendingImage(page, firstRef, "resolve", "__sprite");
  assert.equal((await spriteBox(page)).top, "64px");

  const failRef = { namespace: "resource.Graphics", key: "Characters/red", contentVersion: "fail" };
  await delayTileset(page, failRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraMotion: { id: 3, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({ sprite: failRef, id: 3, y: 3, fromY: 2, screenY: 96, fromScreenY: 64, pattern: 1 }),
  });
  await waitForPendingImage(page, failRef, "__sprite");
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraMotion: { id: 4, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({ sprite: secondRef, id: 4, y: 2, fromY: 1, screenY: 64, fromScreenY: 32, pattern: 3 }),
  });
  await waitUntil(page, () => window.__view._accepted?.view.motionId === 4
    && window.__sprite._raf === undefined
    && getComputedStyle(document.querySelector("lr-map-sprite")).top === "64px", "replacement after failed stale request");
  const before = await spriteBox(page);
  await settlePendingImage(page, failRef, "reject", "__sprite");
  assert.equal((await spriteBox(page)).top, before.top);
});

test("late decode catches up from receivedAt and skips rAF after 250ms", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const delayedRef = { namespace: "resource.Graphics", key: "Characters/red", contentVersion: "late" };
  await delayTileset(page, delayedRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }), spritePayload: walkingSprite({ sprite: delayedRef }) });
  await waitForPendingImage(page, delayedRef, "__sprite");
  await page.evaluate(async () => {
    const started = performance.now();
    while (performance.now() - started < 260) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  await settlePendingImage(page, delayedRef, "resolve", "__sprite");
  await waitUntil(page, () => {
    const sprite = document.querySelector("lr-map-sprite");
    return getComputedStyle(sprite).top === "32px" && sprite._raf === undefined;
  }, "late decode lands on target without rAF");
  assert.deepEqual(await spritePixel(page), [0, 0, 255, 255]);
});

test("late tileset decode catches up from receivedAt and skips MapView rAF", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const delayedRef = { namespace: "resource.Graphics", key: "Tilesets/blue", contentVersion: "late" };
  await delayTileset(page, delayedRef);
  const viewPayload = viewData({
    depth: 0,
    tileset: delayedRef,
    cameraX: 32,
    cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 },
    projectionBounds: { minTileX: 1, minTileY: 0, maxTileX: 23, maxTileY: 17 },
    tiles: [regularTile({ x: 1, depth: 0 })],
  });
  await page.evaluate(({ viewPayload: view, spritePayload }) => {
    window.__view.receiveRenderData(view);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload, spritePayload: matchingSprite(viewPayload) });
  await waitForPendingImage(page, delayedRef, "__view");
  await page.evaluate(async () => {
    const started = performance.now();
    while (performance.now() - started < 260) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  await settlePendingImage(page, delayedRef, "resolve", "__view");
  await waitUntil(page, () => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])");
    if (!canvas) return false;
    const [r, g, b, a] = canvas.getContext("2d").getImageData(5, 5, 1, 1).data;
    return a === 255 && r === 0 && g === 0 && b === 255 && document.querySelector("lr-map-view")._raf === undefined;
  }, "late tileset decode lands on target camera without rAF");
  assert.equal(await page.evaluate(() => window.__tileDestX()), 0);
});

test("late source tileset decode cannot overwrite a newer map-transfer target", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const sourceRef = tilesetRef("source");
  const targetRef = tilesetRef("target");
  await delayTileset(page, sourceRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: { ...viewData({
      depth: 64,
      tileset: sourceRef,
      tiles: [regularTile({ depth: 64 })],
    }), mapId: 66, mapName: "66" },
    spritePayload: spriteData(0),
  });
  await waitForPendingImage(page, sourceRef);
  await page.evaluate(({ viewPayload }) => {
    window.__view.receiveRenderData(viewPayload);
  }, {
    viewPayload: { ...viewData({
      depth: 0,
      tileset: targetRef,
      tiles: [regularTile({ depth: 0 })],
    }), mapId: 2, mapName: "2" },
  });
  await waitPainted(page, "0", "65");
  await settlePendingImage(page, sourceRef, "resolve");
  const info = await layerInfo(page);
  const visibleZ = info.zIndex.filter((_, index) => info.hidden[index] === false);
  assert.deepEqual(visibleZ, ["0"]);
  assert.deepEqual(await compositeCenter(page), [255, 0, 0, 255]);
});

const CELL_COLORS = ["rgb(255, 0, 0)", "rgb(0, 255, 0)", "rgb(0, 0, 255)", "rgb(255, 255, 0)", "rgb(255, 0, 255)"];
const CELL_PIXELS = [
  [255, 0, 0, 255],
  [0, 255, 0, 255],
  [0, 0, 255, 255],
  [255, 255, 0, 255],
  [255, 0, 255, 255],
];

function cellView(ref, extra = {}) {
  return viewData({
    autotiles: autotilesAt([[0, ref]]),
    tiles: [autotileTile({ slot: 0, tileId: 48 })],
    ...extra,
  });
}

test("single-cell autotile advances one 32px frame per duration on a paused clock", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Flowers [1]");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, cellView(ref));
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[0]);
  for (const expected of [1, 2, 3, 4, 0]) {
    await page.clock.runFor(50);
    assert.deepEqual(await tilePixel(page), CELL_PIXELS[expected]);
  }
  const sample = await page.evaluate(() => {
    const canvas = document.querySelector("lr-map-view").shadowRoot.querySelector("canvas.tile-layer:not([hidden])");
    const data = canvas.getContext("2d").getImageData(0, 0, 32, 32).data;
    const colors = new Set();
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] !== 255) continue;
      colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
    }
    return [...colors];
  });
  assert.deepEqual(sample, ["255,0,0"]);
});

test("single-cell autotile smoke observes two frames under real rAF", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Flowers [1]");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, cellView(ref));
  const first = await tilePixel(page);
  await page.evaluate((pixel) => { window.__firstAutotilePixel = pixel; }, first);
  await waitUntil(page, () => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])");
    if (!canvas) return false;
    const [r, g, b, a] = canvas.getContext("2d").getImageData(8, 8, 1, 1).data;
    const firstPixel = window.__firstAutotilePixel;
    return a === 255 && (r !== firstPixel[0] || g !== firstPixel[1] || b !== firstPixel[2]);
  }, "a second autotile frame");
});

test("block autotile keeps variant corners and only shifts the 96px frame base", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Sea [1]");
  const corners = [
    { sx: 0, sy: 0 },
    { sx: 16, sy: 0 },
    { sx: 0, sy: 16 },
    { sx: 16, sy: 16 },
  ];
  await installAutotile(page, ref.key, await makeStrip(page, 96, 128, ["rgb(255, 0, 0)", "rgb(0, 255, 0)", "rgb(0, 0, 255)"]));
  await paintAutotile(page, viewData({
    autotiles: autotilesAt([[3, ref]]),
    tiles: [autotileTile({ slot: 3, tileId: 192, corners })],
  }));
  const samples = async () => page.evaluate(() => {
    const canvas = document.querySelector("lr-map-view").shadowRoot.querySelector("canvas.tile-layer:not([hidden])");
    const context = canvas.getContext("2d");
    return {
      tl: [...context.getImageData(4, 4, 1, 1).data],
      tr: [...context.getImageData(20, 4, 1, 1).data],
      bl: [...context.getImageData(4, 20, 1, 1).data],
      br: [...context.getImageData(20, 20, 1, 1).data],
    };
  });
  const first = await samples();
  assert.deepEqual(first.tl, [255, 0, 0, 255]);
  assert.deepEqual(first.tr, first.tl);
  assert.deepEqual(first.bl, first.tl);
  assert.deepEqual(first.br, first.tl);
  await page.clock.runFor(50);
  const second = await samples();
  assert.deepEqual(second.tl, [0, 255, 0, 255]);
  assert.deepEqual(second.tr, second.tl);
  assert.deepEqual(second.bl, second.tl);
  assert.deepEqual(second.br, second.tl);
});

test("different slots modulo their own frameCount", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const five = autotileRef("Autotiles/Five [1]");
  const four = autotileRef("Autotiles/Four [1]");
  await installAutotile(page, five.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await installAutotile(page, four.key, await makeStrip(page, 32, 32, CELL_COLORS.slice(0, 4)));
  await paintAutotile(page, viewData({
    autotiles: autotilesAt([[0, five], [1, four]]),
    tiles: [
      autotileTile({ slot: 0, tileId: 48 }),
      autotileTile({ x: 1, slot: 1, tileId: 96 }),
    ],
  }));
  await page.clock.runFor(200);
  assert.deepEqual(await tilePixel(page, 8, 8), CELL_PIXELS[4]);
  assert.deepEqual(await tilePixel(page, 40, 8), CELL_PIXELS[0]);
});

test("aliased ResourceRef decodes once and paints every used slot", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const shared = autotileRef("Autotiles/Shared [1]");
  await installAutotile(page, shared.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await page.evaluate(() => { window.__mapLayering.fetchCount = 0; });
  await paintAutotile(page, viewData({
    autotiles: autotilesAt([[2, shared], [5, shared]]),
    tiles: [
      autotileTile({ slot: 2, tileId: 144 }),
      autotileTile({ x: 1, slot: 5, tileId: 288 }),
    ],
  }));
  assert.equal(await page.evaluate(() => window.__mapLayering.fetchCount), 2);
  assert.equal(await page.evaluate(() => [...window.__view._images.keys()].filter((id) => id.includes("Autotiles/Shared")).length), 1);
  await page.clock.runFor(50);
  assert.deepEqual(await tilePixel(page, 8, 8), CELL_PIXELS[1]);
  assert.deepEqual(await tilePixel(page, 40, 8), CELL_PIXELS[1]);
});

async function assertAutotileDuration(t, key, holdMs) {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef(key);
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, cellView(ref));
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[0]);
  await page.clock.runFor(holdMs);
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[0]);
  await page.clock.runFor(1);
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[1]);
}

test("autotile duration uses default 250ms, [1], [ 2 ], and unmatched names", { timeout: 60_000 }, async (t) => {
  await assertAutotileDuration(t, "Autotiles/PlainSea", 249);
  await assertAutotileDuration(t, "Autotiles/Tick [1]", 49);
  await assertAutotileDuration(t, "Autotiles/Spaced [ 2 ]", 99);
  await assertAutotileDuration(t, "Autotiles/Name[2]tail", 249);
});

test("illegal autotile duration fail-closed clears layers and stops RAF", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const key of ["Autotiles/Bad [0]", "Autotiles/Huge [9007199254740992]"]) {
    const ref = autotileRef(key);
    await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
    await page.evaluate(({ viewPayload, spritePayload }) => {
      window.__view.receiveRenderData(viewPayload);
      window.__sprite.receiveRenderData(spritePayload);
    }, { viewPayload: cellView(ref), spritePayload: matchingSprite(cellView(ref)) });
    await waitUntil(page, () => {
      const view = document.querySelector("lr-map-view");
      const canvases = [...(view?.shadowRoot?.querySelectorAll("canvas.tile-layer") ?? [])];
      const visible = canvases.filter((canvas) => !canvas.hidden);
      return visible.length === 0 && view._raf === undefined && view._state !== "PREPARING";
    }, `fail-closed ${key}`);
  }
  assert.deepEqual(errors, []);
});

test("walking RenderData does not reset autotile phase", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Flowers [1]");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, cellView(ref));
  await page.clock.runFor(50);
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[1]);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: cellView(ref, {
      cameraX: 32,
      cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 },
    }),
    spritePayload: matchingSprite(cellView(ref, {
      cameraX: 32,
      cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 },
    })),
  });
  await waitUntil(page, () => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])");
    if (!canvas) return false;
    const [r, g, b, a] = canvas.getContext("2d").getImageData(8, 8, 1, 1).data;
    return a === 255 && r === 0 && g === 255 && b === 0;
  }, "same autotile frame after walking RenderData");
  await page.clock.runFor(50);
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[2]);
});

test("stale animated prepared loop cannot paint after a newer map", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Flowers [1]");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, { ...cellView(ref), mapId: 66, mapName: "66" });
  await page.clock.runFor(50);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: { ...viewData({ depth: 0, visualEpoch: 2 }), mapId: 2, mapName: "2" }, spritePayload: { ...spriteData(0), visualEpoch: 2 } });
  await page.clock.runFor(1);
  await waitPainted(page, "0");
  await page.clock.runFor(200);
  assert.deepEqual(await tilePixel(page), [0, 0, 255, 255]);
  assert.deepEqual(await compositeCenter(page), [255, 0, 0, 255]);
});

test("single-frame idle autotile does not keep a permanent RAF", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Still");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, ["rgb(0, 128, 0)"]));
  await paintAutotile(page, cellView(ref));
  assert.equal(await page.evaluate(() => window.__view._raf), undefined);
  assert.equal(await page.evaluate(() => window.__view._autotileTimer), undefined);
});

test("standing animated autotile uses a slot timer instead of permanent rAF", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Flowers [1]");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, cellView(ref));
  assert.equal(await page.evaluate(() => window.__view._raf), undefined);
  assert.notEqual(await page.evaluate(() => window.__view._autotileTimer), undefined);
  await page.clock.runFor(50);
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[1]);
  assert.equal(await page.evaluate(() => window.__view._raf), undefined);
});

test("synchronous reparent keeps the original animated prepared loop", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Flowers [1]");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, cellView(ref));
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[0]);
  await page.evaluate(() => {
    const view = window.__view;
    view.remove();
    document.body.append(view);
  });
  await page.clock.runFor(50);
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[1]);
  assert.equal(await page.evaluate(() => window.__view._raf), undefined);
  assert.notEqual(await page.evaluate(() => window.__view._autotileTimer), undefined);
});

test("motion state machine keeps startedAt for same id/fingerprint and rejects drift", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  const walking = walkingSprite({ id: 1, screenY: 32, fromScreenY: 0 });
  const drifted = walkingSprite({ id: 1, screenY: 64, fromScreenY: 0, y: 2, fromY: 0 });
  const standing = spriteData(1);
  const result = await page.evaluate(async ({ walking: first, drifted: second, standing: rest }) => {
    const throwsSync = (run) => {
      try {
        run();
        return { threw: false };
      } catch (error) {
        return { threw: true, name: error.name };
      }
    };
    window.__sprite.receiveRenderData(first);
    const startedAt = window.__sprite._activeMotion.startedAt;
    const epoch = window.__sprite._paintEpoch;
    window.__sprite.receiveRenderData(first);
    const same = {
      startedAtUnchanged: window.__sprite._activeMotion.startedAt === startedAt,
      epochAdvanced: window.__sprite._paintEpoch === epoch + 1,
      id: window.__sprite._activeMotion.id,
    };
    const drift = throwsSync(() => window.__sprite.receiveRenderData(second));
    const afterDrift = {
      startedAt: window.__sprite._activeMotion.startedAt,
      latestY: window.__sprite._latestData.y,
      epoch: window.__sprite._paintEpoch,
    };
    window.__sprite.receiveRenderData(rest);
    return {
      same,
      drift,
      afterDrift,
      cleared: window.__sprite._activeMotion === null,
      latestY: window.__sprite._latestData.y,
    };
  }, { walking, drifted, standing });
  assert.equal(result.same.startedAtUnchanged, true);
  assert.equal(result.same.epochAdvanced, true);
  assert.equal(result.same.id, 1);
  assert.equal(result.drift.threw, true);
  assert.equal(result.drift.name, "TypeError");
  assert.equal(result.afterDrift.latestY, 1);
  assert.equal(result.cleared, true);
  assert.equal(result.latestY, 1);
});

test("facing-only update paints a new sprite row before the active motion completes", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  const viewPayload = viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } });
  const walking = walkingSprite({ id: 1, direction: 2 });
  await page.evaluate(({ viewPayload: view, spritePayload }) => {
    window.__facingRecords = [];
    window.__loomrealmMovementQualification = (record) => window.__facingRecords.push(record);
    window.__view.receiveRenderData(view);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload, spritePayload: walking });
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.motionId === 1, "walking scene accepted");
  await page.evaluate(() => {
    const futureStart = performance.now() + 1_000;
    window.__view._activeMotion.startedAt = futureStart;
    window.__sprite._activeMotion.startedAt = futureStart;
    window.__facingBefore = {
      futureStart,
      fingerprint: window.__view._activeMotion.fingerprint,
      spriteFingerprint: window.__sprite._activeMotion.fingerprint,
      visual: window.__view._acceptedVisualScene.sprites[0].visual,
      view: structuredClone(window.__view._acceptedVisualScene.view),
      motion: structuredClone(window.__view._acceptedVisualScene.sprites[0].data.motion),
    };
    window.__facingRecords.length = 0;
  });
  const acceptedSynchronously = await page.evaluate((spritePayload) => {
    try {
      window.__sprite.receiveRenderData({ ...spritePayload, direction: 6 });
      return true;
    } catch {
      return false;
    }
  }, walking);
  assert.equal(acceptedSynchronously, true);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.sprites[0]?.data.direction === 6
    && window.__view._acceptedVisualScene.sprites[0].visual._cropKey.includes("|6|"), "right-facing row painted");
  const result = await page.evaluate(() => {
    const scene = window.__view._acceptedVisualScene;
    const received = window.__facingRecords.find((record) => record.name === "presentation-received" && record.detail.element === "map-sprite");
    const painted = window.__facingRecords.find((record) => record.name === "browser-facing-paint");
    return {
      sameVisual: scene.sprites[0].visual === window.__facingBefore.visual,
      sameView: JSON.stringify(scene.view) === JSON.stringify(window.__facingBefore.view),
      sameMotion: JSON.stringify(scene.sprites[0].data.motion) === JSON.stringify(window.__facingBefore.motion),
      startedAtUnchanged: window.__view._activeMotion.startedAt === window.__facingBefore.futureStart,
      spriteStartedAtUnchanged: window.__sprite._activeMotion.startedAt === window.__facingBefore.futureStart,
      fingerprintUnchanged: window.__view._activeMotion.fingerprint === window.__facingBefore.fingerprint,
      spriteFingerprintUnchanged: window.__sprite._activeMotion.fingerprint === window.__facingBefore.spriteFingerprint,
      direction: scene.sprites[0].data.direction,
      cropKey: scene.sprites[0].visual._cropKey,
      receivedAt: received?.at,
      paintedAt: painted?.at,
      completesAt: window.__view._activeMotion.startedAt + window.__view._activeMotion.durationMs,
    };
  });
  assert.equal(result.sameVisual, true);
  assert.equal(result.sameView, true);
  assert.equal(result.sameMotion, true);
  assert.equal(result.startedAtUnchanged, true);
  assert.equal(result.spriteStartedAtUnchanged, true);
  assert.equal(result.fingerprintUnchanged, true);
  assert.equal(result.spriteFingerprintUnchanged, true);
  assert.equal(result.direction, 6);
  assert.match(result.cropKey, /\|6\|1\|32x32$/);
  assert.equal(Number.isFinite(result.receivedAt), true);
  assert.equal(Number.isFinite(result.paintedAt), true);
  assert.equal(result.receivedAt <= result.paintedAt, true);
  assert.equal(result.paintedAt < result.completesAt, true);
});

test("null to null motion snaps without a timeline", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ firstView, secondView, first, second }) => {
    window.__view.receiveRenderData(firstView);
    window.__sprite.receiveRenderData(first);
    window.__view.receiveRenderData(secondView);
    window.__sprite.receiveRenderData(second);
  }, {
    firstView: viewData({ depth: 0 }),
    secondView: viewData({ depth: 0 }),
    first: spriteData(0),
    second: spriteData(2),
  });
  await waitUntil(page, () => getComputedStyle(document.querySelector("lr-map-sprite")).top === "64px", "standing snap to y=2");
  assert.equal(await page.evaluate(() => window.__sprite._activeMotion), null);
  assert.equal(await page.evaluate(() => window.__sprite._raf), undefined);
});

test("camera-only update keeps tile canvas backing", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const tiles = [regularTile({ depth: 0 })];
  const first = viewData({ tiles, cameraX: 0, visualEpoch: 1 });
  const refreshed = viewData({ tiles, tileset: tilesetRef("v2"), cameraX: 32, visualEpoch: 2 });
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: first, spritePayload: matchingSprite(first) });
  await waitUntil(page, () => {
    const view = document.querySelector("lr-map-view");
    return (view?._tileDrawCount ?? 0) > 0 && view.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])")?.width > 0;
  }, "first raster");
  const info = await page.evaluate(async (next) => {
    const view = window.__view;
    const canvas = view.shadowRoot.querySelector("canvas.tile-layer:not([hidden])");
    const snapshot = () => ({
      width: canvas.width,
      height: canvas.height,
      left: canvas.style.left,
      draws: view._tileDrawCount,
      clears: view._tileClearCount,
      resizes: view._tileResizeCount,
      cameraOnly: view._cameraOnlyCommits,
    });
    const before = snapshot();
    const accepted = view._latestData;
    view.receiveRenderData({
      ...accepted,
      cameraX: accepted.cameraX + 32,
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const afterCamera = snapshot();
    view.receiveRenderData(next);
    window.__sprite.receiveRenderData({
      sceneEpoch: next.sceneEpoch,
      visualEpoch: next.visualEpoch,
      motionId: next.motionId,
      x: 0, y: 0, screenX: 0, screenY: 0, direction: 2, pattern: 0,
      sprite: { namespace: "resource.Graphics", key: "Characters/red", contentVersion: "v1" },
      motion: null,
      bridgeLevel: accepted.bridgeLevel ?? 0,
    });
    const deadline = performance.now() + 2_000;
    while (view._tileDrawCount === afterCamera.draws && performance.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { before, afterCamera, afterRefresh: snapshot() };
  }, refreshed);
  assert.equal(info.before.draws > 0, true);
  assert.equal(info.afterCamera.draws, info.before.draws);
  assert.equal(info.afterCamera.clears, info.before.clears);
  assert.equal(info.afterCamera.resizes, info.before.resizes);
  assert.equal(info.afterCamera.width, info.before.width);
  assert.equal(info.afterCamera.height, info.before.height);
  assert.equal(info.afterCamera.cameraOnly, info.before.cameraOnly + 1);
  assert.equal(info.afterCamera.left, "-32px");
  assert.ok(info.afterRefresh.draws > info.afterCamera.draws, JSON.stringify(info));
  assert.ok(info.afterRefresh.resizes > info.afterCamera.resizes, JSON.stringify(info));
});

test("exact sparse projectionBounds drive persistent incremental surfaces with bounded structural work", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const makeWindow = (minTileX, visualEpoch, depth = 0) => {
    const projectionBounds = { minTileX, minTileY: 0, maxTileX: minTileX + 4, maxTileY: 4 };
    const tiles = [];
    for (let y = 0; y <= 4; y += 1) {
      for (let x = minTileX; x <= minTileX + 4; x += 1) tiles.push(regularTile({ x, y, depth }));
    }
    return viewData({ mapWidth: 40, mapHeight: 10, cameraX: minTileX * 32, visualEpoch, projectionBounds, tiles });
  };
  const first = makeWindow(0, 1);
  await page.evaluate(({ viewPayload, player }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(player);
  }, { viewPayload: first, player: matchingSprite(first) });
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 1, "first exact projection accepted");
  const before = await page.evaluate(() => {
    window.__persistentSurface = window.__view._layers[0].canvas;
    const view = window.__view;
    return {
      shifts: view._projectionShifts,
      allocations: view._surfaceAllocations,
      resizes: view._surfaceResizes,
      full: view._fullRasterPasses,
      dirty: view._dirtyCellDraws,
      live: view._liveSurfaceCount,
      size: [view._layers[0].canvas.width, view._layers[0].canvas.height],
    };
  });
  for (let shift = 1; shift <= 20; shift += 1) {
    const next = makeWindow(shift, shift + 1);
    await page.evaluate(({ viewPayload, player, expected }) => {
      window.__expectedProjectionEpoch = expected;
      window.__view.receiveRenderData(viewPayload);
      window.__sprite.receiveRenderData(player);
    }, { viewPayload: next, player: matchingSprite(next), expected: shift + 1 });
    await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === window.__expectedProjectionEpoch, `projection shift ${shift}`);
  }
  const after = await page.evaluate(() => {
    const view = window.__view;
    const layer = view._layers[0];
    const sample = [...layer.context.getImageData(4 * 32 + 8, 4 * 32 + 8, 1, 1).data];
    return {
      shifts: view._projectionShifts,
      allocations: view._surfaceAllocations,
      resizes: view._surfaceResizes,
      full: view._fullRasterPasses,
      dirty: view._dirtyCellDraws,
      live: view._liveSurfaceCount,
      sameSurface: layer.canvas === window.__persistentSurface,
      bounds: view._acceptedVisualScene.view.projectionBounds,
      sample,
    };
  });
  assert.deepEqual(before.size, [160, 160]);
  assert.equal(after.shifts - before.shifts, 20);
  assert.equal(after.allocations, before.allocations);
  assert.equal(after.resizes, before.resizes);
  assert.equal(after.full, before.full);
  assert.equal(after.live, 1);
  assert.equal(after.sameSurface, true);
  assert.equal(after.dirty - before.dirty, 20 * 5, "only each entering five-cell strip is redrawn");
  assert.deepEqual(after.bounds, { minTileX: 20, minTileY: 0, maxTileX: 24, maxTileY: 4 });
  assert.deepEqual(after.sample, [0, 0, 255, 255]);
});

test("depth churn recycles through a fixed surface pool instead of growing with traversal distance", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const payload = (index) => viewData({
    mapWidth: 40,
    mapHeight: 10,
    cameraX: index * 32,
    visualEpoch: index + 1,
    projectionBounds: { minTileX: index, minTileY: 0, maxTileX: index + 2, maxTileY: 2 },
    tiles: [regularTile({ x: index, y: 0, depth: index * 32 })],
  });
  const first = payload(0);
  await page.evaluate(({ viewPayload, player }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(player);
  }, { viewPayload: first, player: matchingSprite(first) });
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 1, "first depth accepted");
  for (let index = 1; index <= 20; index += 1) {
    const next = payload(index);
    await page.evaluate(({ viewPayload, player, expected }) => {
      window.__expectedDepthEpoch = expected;
      window.__view.receiveRenderData(viewPayload);
      window.__sprite.receiveRenderData(player);
    }, { viewPayload: next, player: matchingSprite(next), expected: index + 1 });
    await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === window.__expectedDepthEpoch, `depth churn ${index}`);
  }
  const counters = await page.evaluate(() => ({
    shifts: window.__view._projectionShifts,
    allocations: window.__view._surfaceAllocations,
    resizes: window.__view._surfaceResizes,
    full: window.__view._fullRasterPasses,
    live: window.__view._liveSurfaceCount,
    active: window.__view._layers.length,
    pool: window.__view._surfacePool.length,
  }));
  assert.deepEqual(counters, { shifts: 20, allocations: 2, resizes: 2, full: 1, live: 2, active: 1, pool: 1 });
});

test("camera-only resize fast path commits new origin, underlay, canvases, and sprite together", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const first = responsiveViewData({ mapWidth: 20, mapHeight: 14, tiles: [regularTile({ depth: 0 })] });
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: first, spritePayload: matchingSprite(first) });
  await waitUntil(page, () => window.__view._accepted?.geometry.originX === 0, "equal-size origin commit");
  const result = await page.evaluate(async () => {
    const view = window.__view;
    const before = {
      draws: view._tileDrawCount,
      resizes: view._tileResizeCount,
      cameraOnly: view._cameraOnlyCommits,
    };
    const accepted = view._accepted.view;
    view.receiveRenderData({
      ...accepted,
      viewportWidth: 800,
      viewportHeight: 600,
      barHeight: 32,
      contentWidth: 800,
      contentHeight: 568,
      columns: 25,
      rows: 18,
      logicalWidth: 800,
      logicalHeight: 576,
      scaleX: 1,
      scaleY: 568 / 576,
    });
    const deadline = performance.now() + 2_000;
    while ((view._accepted.geometry.originX !== 80 || view._accepted.geometry.originY !== 64) && performance.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const canvas = view.shadowRoot.querySelector("canvas.tile-layer:not([hidden])");
    const sprite = window.__sprite;
    const world = view.shadowRoot.querySelector(".map-world");
    return {
      before,
      after: { draws: view._tileDrawCount, resizes: view._tileResizeCount, cameraOnly: view._cameraOnlyCommits },
      origin: [view._accepted.geometry.originX, view._accepted.geometry.originY],
      canvas: [canvas.style.left, canvas.style.top],
      sprite: [getComputedStyle(sprite).left, getComputedStyle(sprite).top],
      background: [world.style.backgroundPosition, world.style.backgroundSize, world.style.backgroundColor],
    };
  });
  assert.deepEqual(result.origin, [80, 64]);
  assert.deepEqual(result.canvas, ["80px", "64px"]);
  assert.deepEqual(result.sprite, ["80px", "64px"]);
  assert.deepEqual(result.background, ["80px 64px", "640px 448px", "rgb(255, 255, 255)"]);
  assert.equal(result.after.draws, result.before.draws);
  assert.equal(result.after.resizes, result.before.resizes);
  assert.equal(result.after.cameraOnly, result.before.cameraOnly + 1);
});

test("viewportWidth/Height set host CSS box without host style attributes", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const first = viewData({ depth: 0 });
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: first, spritePayload: matchingSprite(first) });
  await waitUntil(page, () => document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])"), "first raster");
  const before = await page.evaluate(() => ({
    size: [getComputedStyle(document.querySelector("lr-map-view")).width, getComputedStyle(document.querySelector("lr-map-view")).height],
    hostWidth: document.querySelector("lr-map-view").style.width,
  }));
  assert.deepEqual(before.size, ["640px", "480px"]);
  assert.equal(before.hostWidth, "");
  const next = viewData({ depth: 0, visualEpoch: 2, viewportWidth: 1280, viewportHeight: 720 });
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: next, spritePayload: matchingSprite(next) });
  await waitUntil(page, () => getComputedStyle(document.querySelector("lr-map-view")).width === "1280px", "720p host box");
  const after = await page.evaluate(() => ({
    size: [getComputedStyle(document.querySelector("lr-map-view")).width, getComputedStyle(document.querySelector("lr-map-view")).height],
    hostWidth: document.querySelector("lr-map-view").style.width,
  }));
  assert.deepEqual(after.size, ["1280px", "720px"]);
  assert.equal(after.hostWidth, "");
});

test("disconnect increments paint epoch so stale rAF cannot paint", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({}),
  });
  await waitUntil(page, () => document.querySelector("lr-map-sprite")?._raf !== undefined, "rAF started");
  const before = await page.evaluate(() => window.__sprite._paintEpoch);
  await page.evaluate(() => window.__sprite.remove());
  await waitUntil(page, () => window.__sprite._raf === undefined, "rAF cancelled after disconnect");
  assert.ok(await page.evaluate((epoch) => window.__sprite._paintEpoch > epoch && window.__sprite._activeMotion === null, before));
});

function throwsReceive(page, viewPayload, spritePayload) {
  return page.evaluate(({ viewPayload: view, spritePayload: sprite }) => {
    const run = (fn) => {
      try {
        fn();
        return { threw: false };
      } catch (error) {
        return { threw: true, name: error.name, message: error.message };
      }
    };
    if (view) {
      const result = run(() => window.__view.receiveRenderData(view));
      if (result.threw) return { ...result, side: "view" };
    }
    if (sprite) {
      const result = run(() => window.__sprite.receiveRenderData(sprite));
      if (result.threw) return { ...result, side: "sprite" };
    }
    return { threw: false };
  }, { viewPayload, spritePayload });
}

test("initial View-only and Sprite-only stay EMPTY until the matching pair arrives", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const first = viewData({ depth: 0 });
  await page.evaluate((viewPayload) => window.__view.receiveRenderData(viewPayload), first);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const viewOnly = await page.evaluate(() => ({
    canvases: document.querySelector("lr-map-view").shadowRoot.querySelectorAll("canvas.tile-layer").length,
    accepted: window.__view._accepted,
    state: window.__view._state,
  }));
  assert.equal(viewOnly.canvases, 0);
  assert.equal(viewOnly.accepted, undefined);
  assert.equal(viewOnly.state, "EMPTY");
  const page2 = await openPage();
  t.after(() => page2.close());
  await page2.evaluate((spritePayload) => window.__sprite.receiveRenderData(spritePayload), matchingSprite(first));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const spriteOnly = await page2.evaluate(() => ({
    canvases: document.querySelector("lr-map-view").shadowRoot.querySelectorAll("canvas.tile-layer").length,
    accepted: window.__view._accepted,
    state: window.__view._state,
  }));
  assert.equal(spriteOnly.canvases, 0);
  assert.equal(spriteOnly.accepted, undefined);
  await page.evaluate((spritePayload) => window.__sprite.receiveRenderData(spritePayload), matchingSprite(first));
  await waitPainted(page, "0", "65");
  assert.equal(await page.evaluate(() => window.__view._state), "VISIBLE");
});

test("old accepted pair stays when only one newer endpoint arrives", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const first = viewData({ depth: 0, visualEpoch: 1 });
  const newer = viewData({ depth: 64, visualEpoch: 2 });
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: first, spritePayload: matchingSprite(first) });
  await waitPainted(page, "0", "65");
  const before = await page.evaluate(() => {
    const canvas = window.__view.shadowRoot.querySelector("canvas.tile-layer:not([hidden])");
    window.__acceptedCanvas = canvas;
    return {
      pixel: [...canvas.getContext("2d").getImageData(8, 8, 1, 1).data],
      z: canvas.style.zIndex,
      spriteZ: getComputedStyle(window.__sprite).zIndex,
    };
  });
  await page.evaluate((viewPayload) => window.__view.receiveRenderData(viewPayload), newer);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const after = await page.evaluate(() => {
    const canvas = window.__view.shadowRoot.querySelector("canvas.tile-layer:not([hidden])");
    return {
      sameCanvas: canvas === window.__acceptedCanvas,
      pixel: [...canvas.getContext("2d").getImageData(8, 8, 1, 1).data],
      z: canvas.style.zIndex,
      spriteZ: getComputedStyle(window.__sprite).zIndex,
      visualEpoch: window.__view._accepted.view.visualEpoch,
    };
  });
  assert.equal(after.sameCanvas, true);
  assert.deepEqual(after.pixel, before.pixel);
  assert.equal(after.z, before.z);
  assert.equal(after.spriteZ, before.spriteZ);
  assert.equal(after.visualEpoch, 1);
  await page.evaluate((spritePayload) => window.__sprite.receiveRenderData(spritePayload), matchingSprite(newer));
  await waitPainted(page, "128", "65");
  assert.equal(await page.evaluate(() => window.__view._accepted.view.visualEpoch), 2);
});

test("candidate raster exception leaves the accepted pair byte-identical", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const first = responsiveViewData({ mapWidth: 10, mapHeight: 8, tiles: [regularTile({ depth: 0 })] });
  const second = responsiveViewData({
    visualEpoch: 2,
    mapWidth: 12,
    mapHeight: 10,
    tiles: [
      regularTile({ depth: 0 }),
      regularTile({ x: 1, tileId: 385, depth: 64 }),
    ],
  });
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: first, spritePayload: matchingSprite(first) });
  await waitPainted(page, "0", "65");
  const before = await page.evaluate(() => {
    const canvas = window.__view.shadowRoot.querySelector("canvas.tile-layer:not([hidden])");
    window.__acceptedCanvas = canvas;
    window.__loomrealmMapTestFault = (phase, detail) => {
      if (phase === "draw" && detail.index === 1) throw new Error("injected candidate draw failure");
    };
    return {
      pixel: [...canvas.getContext("2d").getImageData(8, 8, 1, 1).data],
      count: window.__view.shadowRoot.querySelectorAll("canvas.tile-layer").length,
      background: window.__view.shadowRoot.querySelector(".map-world").getAttribute("style"),
    };
  });
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: second, spritePayload: matchingSprite(second) });
  await waitUntil(page, () => window.__view._state === "RETRY_WAIT" || window.__view._state === "VISIBLE", "prepare failed closed");
  const after = await page.evaluate(() => {
    const canvas = window.__view.shadowRoot.querySelector("canvas.tile-layer:not([hidden])");
    return {
      sameCanvas: canvas === window.__acceptedCanvas,
      pixel: [...canvas.getContext("2d").getImageData(8, 8, 1, 1).data],
      count: window.__view.shadowRoot.querySelectorAll("canvas.tile-layer").length,
      visualEpoch: window.__view._accepted.view.visualEpoch,
      background: window.__view.shadowRoot.querySelector(".map-world").getAttribute("style"),
    };
  });
  assert.equal(after.sameCanvas, true);
  assert.deepEqual(after.pixel, before.pixel);
  assert.equal(after.count, before.count);
  assert.equal(after.background, before.background);
  assert.equal(after.visualEpoch, 1);
});

test("detached candidate canvases are not connected until atomic commit", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(() => {
    window.__drawObservations = [];
    window.__loomrealmMapTestFault = (phase, detail) => {
      if (phase !== "draw") return;
      window.__drawObservations.push({
        index: detail.index,
        connected: detail.connected,
        hostHasCanvas: detail.hostHasCanvas,
      });
    };
  });
  const first = viewData({ depth: 0 });
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: first, spritePayload: matchingSprite(first) });
  await waitPainted(page, "0", "65");
  const observations = await page.evaluate(() => window.__drawObservations);
  assert.ok(observations.length >= 1);
  assert.ok(observations.every((entry) => entry.connected === false && entry.hostHasCanvas === false));
  assert.equal(await page.evaluate(() => window.__view.shadowRoot.querySelector("canvas.tile-layer:not([hidden])").isConnected), true);
});

test("completed detached raster commits atomically without waiting an extra animation frame", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const payload = viewData();
  await page.evaluate(({ viewPayload, spritePayload }) => {
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.__scheduledFrames = 0;
    window.requestAnimationFrame = (callback) => {
      window.__scheduledFrames += 1;
      return nativeRequestAnimationFrame(callback);
    };
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: payload, spritePayload: matchingSprite(payload) });
  await waitUntil(page, () => window.__view._accepted?.view.visualEpoch === 1, "immediate detached candidate commit");
  const result = await page.evaluate(() => ({
    scheduledFrames: window.__scheduledFrames,
    visibleLayers: [...window.__view.shadowRoot.querySelectorAll("canvas.tile-layer")].filter((canvas) => !canvas.hidden).length,
    state: window.__view.dataset.mapVisualState,
  }));
  assert.deepEqual(result, { scheduledFrames: 0, visibleLayers: 1, state: "ready" });
});

test("scene A to B to C evicts stale bitmaps and keeps the resource cache bounded", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(() => {
    const original = createImageBitmap;
    window.__bitmapCloses = 0;
    window.createImageBitmap = async function trackedCreateImageBitmap(...args) {
      const bitmap = await original.apply(this, args);
      const close = bitmap.close.bind(bitmap);
      bitmap.close = function trackedClose() {
        window.__bitmapCloses += 1;
        return close();
      };
      return bitmap;
    };
  });
  const scene = (version, sceneEpoch) => viewData({ tileset: tilesetRef(version), sceneEpoch, visualEpoch: 1 });
  for (const [version, sceneEpoch] of [["v1", 1], ["v2", 2], ["v3", 3]]) {
    const viewPayload = scene(version, sceneEpoch);
    await page.evaluate(({ viewPayload: view, spritePayload }) => {
      window.__expectedSceneEpoch = view.sceneEpoch;
      window.__view.receiveRenderData(view);
      window.__sprite.receiveRenderData(spritePayload);
    }, { viewPayload, spritePayload: matchingSprite(viewPayload) });
    await waitUntil(page, () => window.__view._accepted?.view.sceneEpoch === window.__expectedSceneEpoch, `scene ${sceneEpoch} commit`);
  }
  const cache = await page.evaluate(() => ({
    images: [...window.__view._images.keys()],
    bitmaps: [...window.__view._bitmaps.keys()],
    owners: [...window.__view._owners.entries()].map(([identity, owners]) => [identity, [...owners]]),
    closes: window.__bitmapCloses,
  }));
  assert.equal(cache.images.length, 2);
  assert.equal(cache.bitmaps.length, 2);
  assert.ok(cache.images.some((identity) => identity.includes("Tilesets/blue") && identity.includes("v3")));
  assert.ok(cache.bitmaps.some((identity) => identity.includes("Tilesets/blue") && identity.includes("v3")));
  assert.ok(cache.images.some((identity) => identity.includes("Characters/red")), "accepted sprite resources are view-owned");
  assert.ok(cache.closes >= 2, JSON.stringify(cache));
  assert.ok(cache.owners.every(([, owners]) => owners.includes("accepted")));
});

test("stale superseded candidate bitmap is closed and cannot overwrite accepted", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const firstRef = tilesetRef("old");
  const secondRef = tilesetRef("new");
  await page.evaluate(() => {
    const original = createImageBitmap;
    window.__bitmapCloses = 0;
    window.createImageBitmap = async function trackedCreateImageBitmap(...args) {
      const bitmap = await original.apply(this, args);
      const close = bitmap.close.bind(bitmap);
      bitmap.close = function trackedClose() {
        window.__bitmapCloses += 1;
        return close();
      };
      return bitmap;
    };
  });
  await delayTileset(page, firstRef);
  const first = viewData({ tileset: firstRef, visualEpoch: 1 });
  const second = viewData({ tileset: secondRef, visualEpoch: 2 });
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: first, spritePayload: matchingSprite(first) });
  await waitForPendingImage(page, firstRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: second, spritePayload: matchingSprite(second) });
  await waitPainted(page, "0", "65");
  await settlePendingImage(page, firstRef, "resolve");
  const after = await page.evaluate(() => ({
    images: [...window.__view._images.keys()],
    visualEpoch: window.__view._accepted.view.visualEpoch,
    closes: window.__bitmapCloses,
  }));
  assert.equal(after.visualEpoch, 2);
  assert.ok(after.images.some((identity) => identity.includes("Tilesets/blue") && identity.includes("new")));
  assert.equal(after.images.some((identity) => identity.includes("old")), false);
  assert.ok(after.closes >= 1, JSON.stringify(after));
});

test("closed Map schema rejects extra keys, illegal or unordered tiles, and camera bounds", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const base = viewData({ depth: 0 });
  const extraRef = await throwsReceive(page, {
    ...base,
    tileset: { ...base.tileset, extra: "nope" },
  });
  assert.equal(extraRef.threw, true);
  const tile47 = { ...base, tiles: [[0, 0, 0, 47, 0]] };
  const illegalTile = await throwsReceive(page, tile47);
  assert.equal(illegalTile.threw, true);
  const autotile = { ...cellView(autotileRef("Autotiles/schema")), tiles: [[0, 0, 0, 96, 0]] };
  const slotMismatch = await throwsReceive(page, autotile);
  assert.equal(slotMismatch.threw, true);
  const duplicate = { ...base, tiles: [[0, 0, 0, 384, 0], [0, 0, 0, 385, 0]] };
  assert.equal((await throwsReceive(page, duplicate)).threw, true);
  const unsorted = { ...base, tiles: [[1, 0, 0, 385, 0], [0, 0, 0, 384, 0]] };
  assert.equal((await throwsReceive(page, unsorted)).threw, true);
  const wrongTuple = { ...base, tiles: [[0, 0, 0, 384]] };
  assert.equal((await throwsReceive(page, wrongTuple)).threw, true);
  const legacyField = { ...base, chunks: [] };
  assert.equal((await throwsReceive(page, legacyField)).threw, true);
  const { projectionBounds: omittedBounds, ...missingBounds } = base;
  assert.equal((await throwsReceive(page, missingBounds)).threw, true);
  assert.equal((await throwsReceive(page, { ...base, projectionBounds: { ...base.projectionBounds, extra: 1 } })).threw, true);
  assert.equal((await throwsReceive(page, { ...base, projectionBounds: { minTileX: 1, minTileY: 0, maxTileX: 2, maxTileY: 2 } })).threw, true, "sparse tiles outside exact bounds are rejected rather than used to infer a rectangle");
  const camera = await throwsReceive(page, { ...base, cameraX: base.mapWidth * 32 });
  assert.equal(camera.threw, true);
  assert.equal(await page.evaluate(() => window.__view._accepted), undefined);
});

function stackedView(tiles, extra = {}) {
  return viewData({
    tileset: stackTilesetRef(),
    tiles,
    ...extra,
  });
}

test("same-depth z0 and z1 regular tiles keep the overlay after overlap refresh", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/stack", await makeIndexedTileset(page));
  const tiles = [
    regularTile({ z: 0, tileId: 384, depth: 0 }),
    regularTile({ z: 1, tileId: 385, depth: 0 }),
  ];
  const first = stackedView(tiles, { visualEpoch: 1, cameraX: 0 });
  await paintPair(page, first);
  assert.deepEqual(await cellPixel(page, 0, 0), [255, 255, 0, 255]);
  const refreshed = stackedView(tiles, { visualEpoch: 2, cameraX: 32 });
  await paintPair(page, refreshed);
  assert.deepEqual(await cellPixel(page, 0, 0), [255, 255, 0, 255]);
});

test("same-depth z0 change recomposes the overlay instead of covering it", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/stack", await makeIndexedTileset(page));
  const first = stackedView([
    regularTile({ z: 0, tileId: 384, depth: 0 }),
    regularTile({ z: 1, tileId: 385, depth: 0 }),
  ], { visualEpoch: 1 });
  await paintPair(page, first);
  assert.deepEqual(await cellPixel(page, 0, 0), [255, 255, 0, 255]);
  const changed = stackedView([
    regularTile({ z: 0, tileId: 387, depth: 0 }),
    regularTile({ z: 1, tileId: 385, depth: 0 }),
  ], { visualEpoch: 2, cameraX: 32 });
  await paintPair(page, changed);
  assert.deepEqual(await cellPixel(page, 0, 0), [255, 255, 0, 255]);
});

test("autotile frame change keeps the same-depth regular overlay", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  await installTileset(page, "Tilesets/stack", await makeIndexedTileset(page));
  const ref = autotileRef("Autotiles/OverlayFlowers [1]");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  const view = viewData({
    tileset: stackTilesetRef(),
    autotiles: autotilesAt([[0, ref]]),
    tiles: [
      autotileTile({ z: 0, tileId: 48, depth: 0, slot: 0 }),
      regularTile({ z: 1, tileId: 386, depth: 0 }),
    ],
  });
  await paintPair(page, view);
  assert.deepEqual(await cellPixel(page, 0, 0, 8, 8), [255, 255, 0, 255]);
  assert.deepEqual(await cellPixel(page, 0, 0, 24, 24), CELL_PIXELS[0]);
  await page.clock.runFor(50);
  assert.deepEqual(await cellPixel(page, 0, 0, 8, 8), [255, 255, 0, 255]);
  assert.deepEqual(await cellPixel(page, 0, 0, 24, 24), CELL_PIXELS[1]);
});

test("cross-chunk stacked cells stay composited after overlap refresh", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/stack", await makeIndexedTileset(page));
  const tiles = [
    regularTile({ x: 7, z: 0, tileId: 384, depth: 0 }),
    regularTile({ x: 7, z: 1, tileId: 385, depth: 0 }),
    regularTile({ x: 8, z: 0, tileId: 384, depth: 0 }),
    regularTile({ x: 8, z: 1, tileId: 385, depth: 0 }),
  ];
  await paintPair(page, stackedView(tiles, { visualEpoch: 1, cameraX: 0 }));
  assert.deepEqual(await cellPixel(page, 7, 0), [255, 255, 0, 255]);
  assert.deepEqual(await cellPixel(page, 8, 0), [255, 255, 0, 255]);
  await paintPair(page, stackedView(tiles, { visualEpoch: 2, cameraX: 32 }));
  assert.deepEqual(await cellPixel(page, 7, 0), [255, 255, 0, 255]);
  assert.deepEqual(await cellPixel(page, 8, 0), [255, 255, 0, 255]);
});

test("leaving and re-entering a stacked cell restores the full composite", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/stack", await makeIndexedTileset(page));
  const stacked = [
    regularTile({ z: 0, tileId: 384, depth: 0 }),
    regularTile({ z: 1, tileId: 385, depth: 0 }),
  ];
  const distant = [regularTile({ x: 20, z: 0, tileId: 387, depth: 0 })];
  await paintPair(page, stackedView(stacked, { visualEpoch: 1, cameraX: 0, mapWidth: 64 }));
  assert.deepEqual(await cellPixel(page, 0, 0), [255, 255, 0, 255]);
  await paintPair(page, stackedView(distant, { visualEpoch: 2, cameraX: 512, mapWidth: 64 }));
  assert.deepEqual(await cellPixel(page, 20, 0), [0, 255, 255, 255]);
  await paintPair(page, stackedView(stacked, { visualEpoch: 3, cameraX: 0, mapWidth: 64 }));
  assert.deepEqual(await cellPixel(page, 0, 0), [255, 255, 0, 255]);
});

test("scene A to B to A does not reuse the previous scene composite", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/stack", await makeIndexedTileset(page));
  const stacked = [
    regularTile({ z: 0, tileId: 384, depth: 0 }),
    regularTile({ z: 1, tileId: 385, depth: 0 }),
  ];
  await paintPair(page, stackedView(stacked, { mapId: 1, sceneEpoch: 1, visualEpoch: 1 }));
  assert.deepEqual(await cellPixel(page, 0, 0), [255, 255, 0, 255]);
  await paintPair(page, stackedView([regularTile({ z: 0, tileId: 387, depth: 0 })], {
    mapId: 2, sceneEpoch: 2, visualEpoch: 1,
  }));
  assert.deepEqual(await cellPixel(page, 0, 0), [0, 255, 255, 255]);
  await paintPair(page, stackedView(stacked, { mapId: 1, sceneEpoch: 3, visualEpoch: 1 }));
  assert.deepEqual(await cellPixel(page, 0, 0), [255, 255, 0, 255]);
});

test("multi-depth building layer survives an overlap refresh of the ground", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/stack", await makeIndexedTileset(page));
  const tiles = [
    regularTile({ z: 0, tileId: 384, depth: 0 }),
    regularTile({ z: 1, tileId: 385, depth: 64 }),
  ];
  await paintPair(page, stackedView(tiles, { visualEpoch: 1, cameraX: 0 }));
  assert.deepEqual(await cellPixel(page, 0, 0), [255, 255, 0, 255]);
  await paintPair(page, stackedView(tiles, { visualEpoch: 2, cameraX: 32 }));
  assert.deepEqual(await cellPixel(page, 0, 0), [255, 255, 0, 255]);
  const layers = await page.evaluate(() => window.__view._layers.map((layer) => layer.depth).sort((left, right) => left - right));
  assert.deepEqual(layers, [0, 64]);
});

test("jump motion uses the vanilla-aligned 500ms and a peak arc without two walks", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const viewPayload = viewData({
    cameraMotion: { id: 7, durationMs: 500, fromCameraX: 0, fromCameraY: 0 },
    cameraY: 64,
  });
  const spritePayload = {
    ...matchingSprite(viewPayload),
    y: 2,
    screenY: 64,
    pattern: 1,
    motion: {
      id: 7,
      durationMs: 500,
      fromY: 0,
      fromScreenX: 0,
      fromScreenY: 0,
      kind: "jump",
      peakPx: 24,
    },
  };
  await page.evaluate(({ viewPayload: view, spritePayload: sprite }) => {
    window.__view.receiveRenderData(view);
    window.__sprite.receiveRenderData(sprite);
  }, { viewPayload, spritePayload });
  await page.clock.runFor(0);
  await page.clock.runFor(250);
  const mid = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.querySelector("lr-map-sprite")).top));
  assert.ok(Number.isFinite(mid), "sprite top is numeric during jump");
  await page.clock.runFor(250);
  const end = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.querySelector("lr-map-sprite")).top));
  assert.ok(end > mid, "jump arc is higher at mid-duration than at landing");
});

test("bridgeLevel 2 is painted by lowered tile depth not a raised sprite stack", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/blue", await makeIndexedTileset(page));
  const overlay = regularTile({ depth: 160, tileId: 385 });
  await paintPair(page, viewData({ tiles: [overlay], bridgeLevel: 0 }));
  await waitPainted(page, 320, "65");
  const under = await page.evaluate(() => {
    const sprite = Number.parseInt(getComputedStyle(document.querySelector("lr-map-sprite")).zIndex, 10);
    const tiles = [...document.querySelector("lr-map-view").shadowRoot.querySelectorAll("canvas.tile-layer")]
      .filter((canvas) => !canvas.hidden)
      .map((canvas) => Number.parseInt(canvas.style.zIndex, 10));
    return { sprite, tileMax: Math.max(...tiles) };
  });
  await paintPair(page, viewData({ tiles: [regularTile({ depth: 0, tileId: 385 })], bridgeLevel: 2, visualEpoch: 2 }));
  await waitPainted(page, 0, "65");
  const onBridge = await page.evaluate(() => {
    const sprite = Number.parseInt(getComputedStyle(document.querySelector("lr-map-sprite")).zIndex, 10);
    const tiles = [...document.querySelector("lr-map-view").shadowRoot.querySelectorAll("canvas.tile-layer")]
      .filter((canvas) => !canvas.hidden)
      .map((canvas) => Number.parseInt(canvas.style.zIndex, 10));
    return { sprite, tileMax: Math.max(...tiles) };
  });
  assert.equal(under.sprite, 65);
  assert.ok(under.tileMax > under.sprite, "priority-4 bridge must cover the sprite at bridgeLevel 0");
  assert.equal(onBridge.sprite, 65, "sprite stack must not gain a bridge bonus");
  assert.ok(onBridge.sprite > onBridge.tileMax, "lowered bridge tiles must sit under the sprite");
  assert.ok(onBridge.sprite < 100_000, "must not use a permanent max z-index");
});

const PALETTE = Object.freeze([
  Object.freeze([0, 0, 255, 255]),
  Object.freeze([255, 0, 0, 255]),
  Object.freeze([0, 255, 0, 255]),
  Object.freeze([255, 255, 0, 255]),
  Object.freeze([255, 0, 255, 255]),
  Object.freeze([0, 255, 255, 255]),
  Object.freeze([128, 128, 0, 255]),
  Object.freeze([0, 128, 128, 255]),
]);

async function makePaletteTileset(page) {
  return page.evaluate(async (colors) => {
    const canvas = new OffscreenCanvas(colors.length * 32, 32);
    const context = canvas.getContext("2d");
    for (let index = 0; index < colors.length; index += 1) {
      const [r, g, b] = colors[index];
      context.fillStyle = `rgb(${r}, ${g}, ${b})`;
      context.fillRect(index * 32, 0, 32, 32);
    }
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, PALETTE);
}

function paletteTile({ x, y, colorIndex = 0, depth = 0, z = 0 } = {}) {
  return regularTile({ x, y, z, depth, tileId: 384 + colorIndex });
}

function projectionWindow({ minTileX, minTileY = 0, width = 5, height = 5, visualEpoch, tiles, cameraX, mapWidth = 40, mapHeight = 20, sceneEpoch = 1 }) {
  const projectionBounds = {
    minTileX,
    minTileY,
    maxTileX: minTileX + width - 1,
    maxTileY: minTileY + height - 1,
  };
  return viewData({
    mapWidth,
    mapHeight,
    cameraX: cameraX ?? minTileX * 32,
    cameraY: minTileY * 32,
    visualEpoch,
    sceneEpoch,
    projectionBounds,
    tiles,
  });
}

async function ensureOracleView(page) {
  await page.evaluate(() => {
    if (window.__oracle) return;
    const oracle = document.createElement("lr-map-view");
    const sprite = document.createElement("lr-map-sprite");
    oracle.style.cssText = "position:absolute;left:-12000px;top:0;visibility:hidden;pointer-events:none;";
    oracle.append(sprite);
    document.body.append(oracle);
    const resources = window.__view._resources;
    oracle.receiveRenderContext({ resources });
    sprite.receiveRenderContext({ resources });
    window.__oracle = oracle;
    window.__oracleSprite = sprite;
    window.__oracleSceneEpoch = 10_000;
  });
}

async function paintOracleFullRaster(page, viewPayload) {
  await ensureOracleView(page);
  const sceneEpoch = await page.evaluate(({ view, sprite }) => {
    window.__oracleSceneEpoch += 1;
    const payload = { ...view, sceneEpoch: window.__oracleSceneEpoch };
    const spritePayload = { ...sprite, sceneEpoch: window.__oracleSceneEpoch, visualEpoch: payload.visualEpoch, motionId: payload.motionId, bridgeLevel: payload.bridgeLevel ?? 0 };
    window.__oracle.receiveRenderData(payload);
    window.__oracleSprite.receiveRenderData(spritePayload);
    return window.__oracleSceneEpoch;
  }, { view: viewPayload, sprite: matchingSprite(viewPayload) });
  await waitUntil(page, () => window.__oracle._acceptedVisualScene?.view.sceneEpoch === window.__oracleSceneEpoch
    && window.__oracle._state === "VISIBLE"
    && (window.__oracle._layers?.length ?? 0) > 0, `oracle full raster epoch ${sceneEpoch}`);
}

async function captureNormalizedLayers(page, host = "__view", bounds) {
  return page.evaluate(({ hostName, world }) => {
    const view = window[hostName];
    const layers = [...(view._layers ?? [])]
      .filter((layer) => layer?.canvas && !layer.canvas.hidden)
      .sort((left, right) => left.depth - right.depth);
    return layers.map((layer) => {
      const width = world.width;
      const height = world.height;
      const out = new Uint8ClampedArray(width * height * 4);
      const srcX0 = Math.max(layer.worldX, world.minX);
      const srcY0 = Math.max(layer.worldY, world.minY);
      const srcX1 = Math.min(layer.worldX + layer.canvas.width, world.minX + width);
      const srcY1 = Math.min(layer.worldY + layer.canvas.height, world.minY + height);
      if (srcX0 < srcX1 && srcY0 < srcY1) {
        const data = layer.context.getImageData(srcX0 - layer.worldX, srcY0 - layer.worldY, srcX1 - srcX0, srcY1 - srcY0).data;
        for (let row = 0; row < srcY1 - srcY0; row += 1) {
          const destRow = ((srcY0 - world.minY + row) * width + (srcX0 - world.minX)) * 4;
          const srcRow = row * (srcX1 - srcX0) * 4;
          out.set(data.subarray(srcRow, srcRow + (srcX1 - srcX0) * 4), destRow);
        }
      }
      return {
        depth: layer.depth,
        worldX: world.minX,
        worldY: world.minY,
        width,
        height,
        pixels: [...out],
      };
    });
  }, { hostName: host, world: bounds });
}

function projectionPixelBounds(viewPayload) {
  const bounds = viewPayload.projectionBounds;
  return {
    minX: bounds.minTileX * 32,
    minY: bounds.minTileY * 32,
    width: (bounds.maxTileX - bounds.minTileX + 1) * 32,
    height: (bounds.maxTileY - bounds.minTileY + 1) * 32,
  };
}

function firstPixelDiff(actual, expected) {
  if (actual.depth !== expected.depth) return { kind: "depth", actual: actual.depth, expected: expected.depth };
  if (actual.width !== expected.width || actual.height !== expected.height) {
    return { kind: "size", actual: [actual.width, actual.height], expected: [expected.width, expected.height], depth: actual.depth };
  }
  const { width, pixels } = actual;
  for (let index = 0; index < pixels.length; index += 4) {
    if (
      pixels[index] !== expected.pixels[index]
      || pixels[index + 1] !== expected.pixels[index + 1]
      || pixels[index + 2] !== expected.pixels[index + 2]
      || pixels[index + 3] !== expected.pixels[index + 3]
    ) {
      const pixelIndex = index / 4;
      return {
        kind: "pixel",
        depth: actual.depth,
        x: pixelIndex % width,
        y: Math.floor(pixelIndex / width),
        actual: [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]],
        expected: [
          expected.pixels[index],
          expected.pixels[index + 1],
          expected.pixels[index + 2],
          expected.pixels[index + 3],
        ],
      };
    }
  }
  return null;
}

function assertLayersPixelEqual(actualLayers, expectedLayers, label) {
  assert.equal(actualLayers.length, expectedLayers.length, `${label}: depth layer count`);
  for (let index = 0; index < actualLayers.length; index += 1) {
    const diff = firstPixelDiff(actualLayers[index], expectedLayers[index]);
    assert.equal(diff, null, `${label}: ${JSON.stringify(diff)}`);
  }
}

async function assertMatchesFullRasterOracle(page, viewPayload, label) {
  const bounds = projectionPixelBounds(viewPayload);
  await paintOracleFullRaster(page, viewPayload);
  const incremental = await captureNormalizedLayers(page, "__view", bounds);
  const oracle = await captureNormalizedLayers(page, "__oracle", bounds);
  assertLayersPixelEqual(incremental, oracle, label);
}

async function rasterCounters(page) {
  return page.evaluate(() => {
    const view = window.__view;
    return {
      shifts: view._projectionShifts,
      allocations: view._surfaceAllocations,
      resizes: view._surfaceResizes,
      full: view._fullRasterPasses,
      fullScene: view._fullRasterScenePasses,
      fullNoOverlap: view._fullRasterNoOverlapPasses,
      fullResize: view._fullRasterResizePasses,
      fullFallback: view._fullRasterFallbackPasses,
      incremental: view._incrementalRasterPasses,
      dirty: view._dirtyCellDraws,
      overlapSnapshots: view._overlapSnapshots,
      overlapPixels: view._overlapSnapshotPixels,
      overlapMaxPixels: view._overlapSnapshotMaxPixels,
      overlapReadBytes: view._overlapReadBytes,
      overlapWriteBytes: view._overlapWriteBytes,
      overlapGetMs: view._overlapGetImageDataMs,
      overlapPutMs: view._overlapPutImageDataMs,
      overlapCopyMs: view._overlapCopyMs,
      live: view._liveSurfaceCount,
      pool: view._surfacePool.length,
      active: view._layers.length,
    };
  });
}

function filledWindowTiles(minTileX, minTileY, width, height, colorIndex = 0, depth = 0, skip = null) {
  const tiles = [];
  for (let y = minTileY; y < minTileY + height; y += 1) {
    for (let x = minTileX; x < minTileX + width; x += 1) {
      if (skip && skip(x, y)) continue;
      tiles.push(paletteTile({ x, y, colorIndex, depth }));
    }
  }
  return tiles;
}

test("shifted projection clears deleted overlap tiles and matches full-raster oracle", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/blue", await makePaletteTileset(page));
  const firstTiles = [
    ...filledWindowTiles(0, 0, 5, 5, 0, 0, (x, y) => x === 2 && y === 2),
    paletteTile({ x: 2, y: 2, colorIndex: 1, depth: 0 }),
  ];
  const first = projectionWindow({ minTileX: 0, visualEpoch: 1, tiles: firstTiles });
  await paintPair(page, first);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 1, "first shifted-delete window");
  const secondTiles = filledWindowTiles(1, 0, 5, 5, 0, 0, (x, y) => x === 2 && y === 2);
  const second = projectionWindow({ minTileX: 1, visualEpoch: 2, tiles: secondTiles });
  await paintPair(page, second);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 2, "shifted delete accepted");
  const hole = await cellPixel(page, 2, 2, 8, 8);
  assert.deepEqual(hole, [0, 0, 0, 0], `deleted overlap cell must be transparent, got ${hole}`);
  const kept = await cellPixel(page, 3, 2, 8, 8);
  assert.deepEqual(kept, [...PALETTE[0]]);
  await assertMatchesFullRasterOracle(page, second, "shifted delete");
});

test("shifted projection migrates tile depth without leaving stale pixels", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/blue", await makePaletteTileset(page));
  const firstTiles = [
    ...filledWindowTiles(0, 0, 5, 5, 0, 0, (x, y) => x === 2 && y === 1),
    paletteTile({ x: 2, y: 1, colorIndex: 2, depth: 0 }),
  ];
  const first = projectionWindow({ minTileX: 0, visualEpoch: 1, tiles: firstTiles });
  await paintPair(page, first);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 1, "depth migrate first");
  const secondTiles = [
    ...filledWindowTiles(1, 0, 5, 5, 0, 0, (x, y) => x === 2 && y === 1),
    paletteTile({ x: 2, y: 1, colorIndex: 2, depth: 32 }),
  ];
  const second = projectionWindow({ minTileX: 1, visualEpoch: 2, tiles: secondTiles });
  await paintPair(page, second);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 2, "depth migrate second");
  const depthPixels = await page.evaluate(() => {
    const view = window.__view;
    const byDepth = {};
    for (const layer of view._layers) {
      if (!layer.canvas || layer.canvas.hidden) continue;
      const dx = 2 * 32 + 8 - layer.worldX;
      const dy = 1 * 32 + 8 - layer.worldY;
      if (dx < 0 || dy < 0 || dx >= layer.canvas.width || dy >= layer.canvas.height) {
        byDepth[layer.depth] = [0, 0, 0, 0];
        continue;
      }
      byDepth[layer.depth] = [...layer.context.getImageData(dx, dy, 1, 1).data];
    }
    return byDepth;
  });
  assert.deepEqual(depthPixels[0], [0, 0, 0, 0], `old depth must clear migrated cell: ${JSON.stringify(depthPixels)}`);
  assert.deepEqual(depthPixels[32], [...PALETTE[2]], `new depth must draw migrated cell: ${JSON.stringify(depthPixels)}`);
  await assertMatchesFullRasterOracle(page, second, "depth migrate");
});

test("shifted projection replaces cell visuals and sparse holes stay transparent", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/blue", await makePaletteTileset(page));
  const firstTiles = [
    ...filledWindowTiles(0, 0, 5, 5, 0, 0, (x, y) => (x === 1 && y === 1) || (x === 3 && y === 3)),
    paletteTile({ x: 1, y: 1, colorIndex: 1, depth: 0 }),
  ];
  const first = projectionWindow({ minTileX: 0, visualEpoch: 1, tiles: firstTiles });
  await paintPair(page, first);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 1, "replace/sparse first");
  const secondTiles = [
    ...filledWindowTiles(1, 0, 5, 5, 0, 0, (x, y) => (x === 1 && y === 1) || (x === 3 && y === 3)),
    paletteTile({ x: 1, y: 1, colorIndex: 3, depth: 0 }),
  ];
  const second = projectionWindow({ minTileX: 1, visualEpoch: 2, tiles: secondTiles });
  await paintPair(page, second);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 2, "replace/sparse second");
  assert.deepEqual(await cellPixel(page, 1, 1, 8, 8), [...PALETTE[3]]);
  assert.deepEqual(await cellPixel(page, 3, 3, 8, 8), [0, 0, 0, 0]);
  await assertMatchesFullRasterOracle(page, second, "visual replace + sparse hole");
});

test("shifted projection draws entering strip and matches full-raster oracle", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/blue", await makePaletteTileset(page));
  const first = projectionWindow({
    minTileX: 0,
    visualEpoch: 1,
    tiles: filledWindowTiles(0, 0, 5, 5, 0),
  });
  await paintPair(page, first);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 1, "entering strip first");
  const second = projectionWindow({
    minTileX: 1,
    visualEpoch: 2,
    tiles: [
      ...filledWindowTiles(1, 0, 4, 5, 0),
      ...filledWindowTiles(5, 0, 1, 5, 4),
    ],
  });
  await paintPair(page, second);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 2, "entering strip second");
  assert.deepEqual(await cellPixel(page, 5, 2, 8, 8), [...PALETTE[4]]);
  assert.deepEqual(await cellPixel(page, 2, 2, 8, 8), [...PALETTE[0]]);
  await assertMatchesFullRasterOracle(page, second, "entering strip");
});

test("no-overlap projection shift fully redraws without leaking old pixels", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/blue", await makePaletteTileset(page));
  const first = projectionWindow({
    minTileX: 0,
    visualEpoch: 1,
    tiles: filledWindowTiles(0, 0, 5, 5, 1),
  });
  await paintPair(page, first);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 1, "no-overlap first");
  const before = await rasterCounters(page);
  const second = projectionWindow({
    minTileX: 8,
    visualEpoch: 2,
    tiles: filledWindowTiles(8, 0, 5, 5, 2),
  });
  await paintPair(page, second);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 2, "no-overlap second");
  const after = await rasterCounters(page);
  assert.equal(after.shifts - before.shifts, 1);
  assert.ok(after.fullNoOverlap - before.fullNoOverlap >= 1, JSON.stringify({ before, after }));
  assert.deepEqual(await cellPixel(page, 10, 2, 8, 8), [...PALETTE[2]]);
  assert.deepEqual(await cellPixel(page, 2, 2, 8, 8), [0, 0, 0, 0]);
  await assertMatchesFullRasterOracle(page, second, "no-overlap shift");
});

test("overlap snapshot bytes and timings are measured for known geometry", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/blue", await makePaletteTileset(page));
  const first = projectionWindow({
    minTileX: 0,
    visualEpoch: 1,
    tiles: filledWindowTiles(0, 0, 5, 5, 0),
  });
  await paintPair(page, first);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 1, "overlap metric first");
  const before = await rasterCounters(page);
  const second = projectionWindow({
    minTileX: 1,
    visualEpoch: 2,
    tiles: filledWindowTiles(1, 0, 5, 5, 0),
  });
  await paintPair(page, second);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 2, "overlap metric second");
  const after = await rasterCounters(page);
  const overlapTilesX = 4;
  const overlapTilesY = 5;
  const overlapPixels = overlapTilesX * 32 * overlapTilesY * 32;
  assert.equal(after.overlapSnapshots - before.overlapSnapshots, 1);
  assert.equal(after.overlapPixels - before.overlapPixels, overlapPixels);
  assert.equal(after.overlapMaxPixels, Math.max(before.overlapMaxPixels, overlapPixels));
  assert.equal(after.overlapReadBytes - before.overlapReadBytes, overlapPixels * 4);
  assert.equal(after.overlapWriteBytes - before.overlapWriteBytes, overlapPixels * 4);
  assert.ok(after.overlapGetMs - before.overlapGetMs >= 0);
  assert.ok(after.overlapPutMs - before.overlapPutMs >= 0);
  assert.equal(
    Number((after.overlapCopyMs - before.overlapCopyMs).toFixed(6)),
    Number(((after.overlapGetMs - before.overlapGetMs) + (after.overlapPutMs - before.overlapPutMs)).toFixed(6)),
  );
  assert.equal(after.dirty - before.dirty, 5, "only entering strip is dirty-drawn");
  assert.equal(after.incremental - before.incremental, 1);
  assert.equal(after.fullNoOverlap - before.fullNoOverlap, 0);
  await assertMatchesFullRasterOracle(page, second, "overlap metric");
});

test("resize-driven projection redraw is counted separately from scene full raster", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/blue", await makePaletteTileset(page));
  const first = projectionWindow({
    minTileX: 0,
    width: 3,
    height: 3,
    visualEpoch: 1,
    tiles: filledWindowTiles(0, 0, 3, 3, 0),
  });
  await paintPair(page, first);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 1, "resize metric first");
  const before = await rasterCounters(page);
  const second = projectionWindow({
    minTileX: 0,
    width: 8,
    height: 8,
    visualEpoch: 2,
    tiles: filledWindowTiles(0, 0, 8, 8, 1),
  });
  await paintPair(page, second);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 2, "resize metric second");
  const after = await rasterCounters(page);
  assert.ok(after.resizes > before.resizes, JSON.stringify({ before, after }));
  assert.ok(after.fullResize - before.fullResize >= 1 || after.fullFallback - before.fullFallback >= 1, JSON.stringify({ before, after }));
  assert.equal(after.full - before.full, 0, "same scene must not bump scene full-raster counter");
  await assertMatchesFullRasterOracle(page, second, "resize redraw");
});

test("same projectionBounds with left-edge deletion remaps layer origin without shifting leftover tiles", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/blue", await makePaletteTileset(page));
  const bounds = { minTileX: 0, minTileY: 0, maxTileX: 5, maxTileY: 4 };
  const firstTiles = filledWindowTiles(1, 1, 3, 3, 1);
  const first = viewData({
    mapWidth: 20,
    mapHeight: 12,
    visualEpoch: 1,
    projectionBounds: bounds,
    tiles: firstTiles,
  });
  await paintPair(page, first);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 1, "origin-minX first");
  const geometryBefore = await page.evaluate(() => {
    const layer = window.__view._layers[0];
    return {
      worldX: layer.worldX,
      worldY: layer.worldY,
      width: layer.canvas.width,
      height: layer.canvas.height,
      shifts: window.__view._projectionShifts,
      resizes: window.__view._surfaceResizes,
    };
  });
  // Drop the leftmost column so depthBounds.minX moves while canvas size stays via max(old,new).
  const secondTiles = filledWindowTiles(2, 1, 2, 3, 1);
  const second = viewData({
    mapWidth: 20,
    mapHeight: 12,
    visualEpoch: 2,
    projectionBounds: bounds,
    tiles: secondTiles,
  });
  await paintPair(page, second);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 2, "origin-minX second");
  const geometryAfter = await page.evaluate(() => {
    const layer = window.__view._layers[0];
    return {
      worldX: layer.worldX,
      worldY: layer.worldY,
      width: layer.canvas.width,
      height: layer.canvas.height,
      shifts: window.__view._projectionShifts,
      resizes: window.__view._surfaceResizes,
    };
  });
  assert.equal(geometryBefore.worldX, 32);
  assert.equal(geometryAfter.worldX, 64);
  assert.equal(geometryAfter.width, geometryBefore.width, "canvas width must remain pooled/max sized");
  assert.equal(geometryAfter.resizes, geometryBefore.resizes, "origin change alone must not resize the canvas");
  assert.equal(geometryAfter.shifts, geometryBefore.shifts, "projectionBounds stayed equal");
  assert.deepEqual(await cellPixel(page, 1, 2, 8, 8), [0, 0, 0, 0], "deleted left edge must be transparent");
  assert.deepEqual(await cellPixel(page, 2, 2, 8, 8), [...PALETTE[1]], "remaining tile must keep its color at the correct world cell");
  assert.deepEqual(await cellPixel(page, 3, 2, 8, 8), [...PALETTE[1]]);
  await assertMatchesFullRasterOracle(page, second, "origin minX change");
});

test("same projectionBounds with top-edge deletion remaps layer origin without shifting leftover tiles", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await installTileset(page, "Tilesets/blue", await makePaletteTileset(page));
  const bounds = { minTileX: 0, minTileY: 0, maxTileX: 5, maxTileY: 4 };
  const firstTiles = filledWindowTiles(1, 1, 3, 3, 2);
  const first = viewData({
    mapWidth: 20,
    mapHeight: 12,
    visualEpoch: 1,
    projectionBounds: bounds,
    tiles: firstTiles,
  });
  await paintPair(page, first);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 1, "origin-minY first");
  const geometryBefore = await page.evaluate(() => {
    const layer = window.__view._layers[0];
    return {
      worldX: layer.worldX,
      worldY: layer.worldY,
      width: layer.canvas.width,
      height: layer.canvas.height,
      shifts: window.__view._projectionShifts,
      resizes: window.__view._surfaceResizes,
    };
  });
  const secondTiles = filledWindowTiles(1, 2, 3, 2, 2);
  const second = viewData({
    mapWidth: 20,
    mapHeight: 12,
    visualEpoch: 2,
    projectionBounds: bounds,
    tiles: secondTiles,
  });
  await paintPair(page, second);
  await waitUntil(page, () => window.__view._acceptedVisualScene?.view.visualEpoch === 2, "origin-minY second");
  const geometryAfter = await page.evaluate(() => {
    const layer = window.__view._layers[0];
    return {
      worldX: layer.worldX,
      worldY: layer.worldY,
      width: layer.canvas.width,
      height: layer.canvas.height,
      shifts: window.__view._projectionShifts,
      resizes: window.__view._surfaceResizes,
    };
  });
  assert.equal(geometryBefore.worldY, 32);
  assert.equal(geometryAfter.worldY, 64);
  assert.equal(geometryAfter.height, geometryBefore.height, "canvas height must remain pooled/max sized");
  assert.equal(geometryAfter.resizes, geometryBefore.resizes, "origin change alone must not resize the canvas");
  assert.equal(geometryAfter.shifts, geometryBefore.shifts, "projectionBounds stayed equal");
  assert.deepEqual(await cellPixel(page, 2, 1, 8, 8), [0, 0, 0, 0], "deleted top edge must be transparent");
  assert.deepEqual(await cellPixel(page, 2, 2, 8, 8), [...PALETTE[2]]);
  assert.deepEqual(await cellPixel(page, 2, 3, 8, 8), [...PALETTE[2]]);
  await assertMatchesFullRasterOracle(page, second, "origin minY change");
});
