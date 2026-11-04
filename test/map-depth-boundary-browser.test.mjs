import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserAsset = path.join(root, "game-libs", "map", "dist", "browser", "map.browser.js");
const version = "v1";

function executablePath() {
  return [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find(existsSync);
}

const tileset = Object.freeze({ namespace: "resource.Graphics", key: "Tilesets/blue", contentVersion: version });
const sprite = Object.freeze({ namespace: "resource.Graphics", key: "Characters/red", contentVersion: version });
const tilesetRef = (contentVersion) => ({ namespace: "resource.Graphics", key: "Tilesets/blue", contentVersion });
const identityOf = (ref) => `${ref.namespace}\u0000${ref.key}\u0000${ref.contentVersion}`;

function viewData() {
  return {
    sceneEpoch: 1,
    visualEpoch: 1,
    motionId: 1,
    viewportWidth: 640,
    viewportHeight: 480,
    barHeight: 32,
    contentWidth: 640,
    contentHeight: 448,
    columns: 20,
    rows: 14,
    logicalWidth: 640,
    logicalHeight: 448,
    scaleX: 1,
    scaleY: 1,
    mapName: "1",
    mapId: 1,
    mapWidth: 24,
    mapHeight: 18,
    cameraX: 0,
    cameraY: 0,
    tileset,
    autotiles: [null, null, null, null, null, null, null],
    projectionBounds: { minTileX: 0, minTileY: 0, maxTileX: 23, maxTileY: 17 },
    tiles: [[0, 0, 0, 384, 48]],
    cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 },
    bridgeLevel: 0,
  };
}

function spriteData() {
  return {
    sceneEpoch: 1,
    visualEpoch: 1,
    motionId: 1,
    x: 0,
    y: 1,
    screenX: 0,
    screenY: 0,
    direction: 2,
    pattern: 3,
    sprite,
    motion: { id: 1, durationMs: 250, fromY: 0, fromScreenX: 0, fromScreenY: 0 },
    bridgeLevel: 0,
  };
}

function staticViewData(ref, visualEpoch) {
  return {
    ...viewData(),
    visualEpoch,
    motionId: null,
    tileset: ref,
    tiles: [[0, 0, 0, 384, 0]],
    cameraMotion: null,
  };
}

function staticSpriteData(visualEpoch) {
  return {
    ...spriteData(),
    visualEpoch,
    motionId: null,
    y: 0,
    pattern: 0,
    motion: null,
  };
}

async function waitUntil(page, predicate, label, timeoutMs = 10_000) {
  try {
    await page.waitForFunction(predicate, { timeout: timeoutMs, polling: 25 });
  } catch (cause) {
    assert.fail(`Timed out waiting for ${label}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

async function closeBrowser(browser) {
  if (!browser) return;
  try {
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("browser.close timed out")), 5_000)),
    ]);
  } catch {
    try { browser.process()?.kill("SIGKILL"); } catch { /* already gone */ }
  }
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
    return [...context.getImageData(16, 16, 1, 1).data];
  }, pngBytes.toString("base64"));
}

async function freezeAt(page, elapsedMs) {
  return page.evaluate((elapsed) => {
    const view = window.__view;
    const actor = window.__sprite;
    const prepared = view?._accepted;
    if (!view || !actor || !prepared || !view._activeMotion) throw new Error("moving map pair is not accepted");

    const cancelFrame = () => {
      if (view._raf !== undefined) cancelAnimationFrame(view._raf);
      view._raf = undefined;
      for (const child of view._spriteChildren()) child._raf = undefined;
    };

    cancelFrame();
    view._activeMotion.startedAt = performance.now() - elapsed;
    view._activeMotion.durationMs = 250;
    view._tickAccepted(prepared, view._sequence, false);
    cancelFrame();

    return {
      spriteZ: Number(getComputedStyle(actor).zIndex),
      tileZ: view.shadowRoot.querySelector("canvas.tile-layer:not([hidden])")?.style.zIndex,
      viewRaf: view._raf,
      spriteRaf: actor._raf,
    };
  }, elapsedMs);
}

async function serveMapBrowser(t) {
  const source = await readFile(browserAsset);
  const server = http.createServer((request, response) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname === "/map.browser.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(source);
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><html><body style=\"margin:0\"></body></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(() => resolve())));

  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => closeBrowser(browser));
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(10_000);
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  await page.addScriptTag({ url: `${origin}/map.browser.js` });
  return page;
}

async function installMapPair(page, { delayOldTileset = false } = {}) {
  await page.evaluate(async ({ delayOld }) => {
    const png = async (width, height, paint) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      paint(context);
      return new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
    };
    const tileBytes = await png(256, 32, (context) => {
      context.fillStyle = "rgb(0, 0, 255)";
      context.fillRect(0, 0, 256, 32);
    });
    const spriteBytes = await png(128, 128, (context) => {
      const colors = ["rgb(255, 0, 0)", "rgb(0, 255, 0)", "rgb(0, 0, 255)", "rgb(255, 255, 0)"];
      for (let column = 0; column < 4; column += 1) {
        context.fillStyle = colors[column];
        context.fillRect(column * 32, 0, 32, 128);
      }
    });

    let resolveOld;
    const oldTileset = delayOld ? new Promise((resolve) => { resolveOld = resolve; }) : null;
    window.__resolveOldTileset = () => resolveOld?.({ bytes: tileBytes, mime: "image/png" });

    const originalCreateImageBitmap = createImageBitmap.bind(globalThis);
    window.__bitmapCloses = 0;
    globalThis.createImageBitmap = async function trackedCreateImageBitmap(...args) {
      const bitmap = await originalCreateImageBitmap(...args);
      const close = bitmap.close.bind(bitmap);
      bitmap.close = function trackedClose() {
        window.__bitmapCloses += 1;
        return close();
      };
      return bitmap;
    };

    const resources = {
      async resource(_namespace, key, contentVersion) {
        if (key.startsWith("Tilesets/")) {
          if (delayOld && contentVersion === "old") return oldTileset;
          return { bytes: tileBytes, mime: "image/png" };
        }
        if (key.startsWith("Characters/")) return { bytes: spriteBytes, mime: "image/png" };
        throw new Error(`missing resource ${key}`);
      },
    };
    const view = document.createElement("lr-map-view");
    const actor = document.createElement("lr-map-sprite");
    view.append(actor);
    document.body.replaceChildren(view);
    view.receiveRenderContext({ resources });
    actor.receiveRenderContext({ resources });
    window.__view = view;
    window.__sprite = actor;
  }, { delayOld: delayOldTileset });
}

test("moving depth composites below the tile before the boundary and above it after crossing", { timeout: 30_000 }, async (t) => {
  const page = await serveMapBrowser(t);
  await installMapPair(page);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData(), spritePayload: spriteData() });

  await waitUntil(page, () => {
    const view = window.__view;
    return view?._accepted?.view.motionId === 1
      && Boolean(view._activeMotion)
      && Boolean(view.shadowRoot.querySelector("canvas.tile-layer:not([hidden])"))
      && Boolean(window.__sprite?._lastPaintedScreen);
  }, "accepted moving map pair");

  const before = await freezeAt(page, 120);
  assert.equal(before.tileZ, "96");
  assert.ok(before.spriteZ > 0 && before.spriteZ < 97, JSON.stringify(before));
  assert.equal(before.viewRaf, undefined);
  assert.equal(before.spriteRaf, undefined);
  assert.deepEqual(await compositeCenter(page), [0, 0, 255, 255]);

  const after = await freezeAt(page, 130);
  assert.equal(after.tileZ, "96");
  assert.ok(after.spriteZ >= 97, JSON.stringify(after));
  assert.equal(after.viewRaf, undefined);
  assert.equal(after.spriteRaf, undefined);
  assert.deepEqual(await compositeCenter(page), [255, 0, 0, 255]);
});

test("superseded delayed candidate closes its stale bitmap after decode without replacing accepted", { timeout: 30_000 }, async (t) => {
  const page = await serveMapBrowser(t);
  await installMapPair(page, { delayOldTileset: true });

  const oldRef = tilesetRef("old");
  const newRef = tilesetRef("new");
  const oldView = staticViewData(oldRef, 1);
  const newView = staticViewData(newRef, 2);

  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: oldView, spritePayload: staticSpriteData(1) });

  await waitUntil(page, () => window.__view._images.has("resource.Graphics\u0000Tilesets/blue\u0000old"), "old tileset decode pending");

  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: newView, spritePayload: staticSpriteData(2) });

  await waitUntil(page, () => {
    const view = window.__view;
    return view?._accepted?.view.visualEpoch === 2
      && view._accepted.view.tileset.contentVersion === "new"
      && [...view._images.keys()].some((id) => id.includes("Tilesets/blue") && id.endsWith("\u0000new"))
      && [...view._images.keys()].every((id) => !id.endsWith("\u0000old"));
  }, "new candidate accepted before old decode completes");

  const beforeResolve = await page.evaluate(() => ({
    visualEpoch: window.__view._accepted.view.visualEpoch,
    tilesetVersion: window.__view._accepted.view.tileset.contentVersion,
    images: [...window.__view._images.keys()],
    bitmaps: [...window.__view._bitmaps.keys()],
    closes: window.__bitmapCloses,
  }));
  assert.equal(beforeResolve.visualEpoch, 2);
  assert.equal(beforeResolve.tilesetVersion, "new");
  assert.ok(beforeResolve.images.every((id) => !id.endsWith("\u0000old")), JSON.stringify(beforeResolve));
  assert.ok(beforeResolve.bitmaps.every((id) => !id.endsWith("\u0000old")), JSON.stringify(beforeResolve));
  assert.equal(beforeResolve.closes, 0);

  await page.evaluate(() => window.__resolveOldTileset());
  await waitUntil(page, () => window.__bitmapCloses >= 1, "stale old bitmap close after decode");

  const after = await page.evaluate(() => ({
    visualEpoch: window.__view._accepted.view.visualEpoch,
    tilesetVersion: window.__view._accepted.view.tileset.contentVersion,
    images: [...window.__view._images.keys()],
    bitmaps: [...window.__view._bitmaps.keys()],
    closes: window.__bitmapCloses,
  }));
  assert.equal(after.visualEpoch, 2);
  assert.equal(after.tilesetVersion, "new");
  assert.ok(after.images.every((id) => !id.endsWith("\u0000old")), JSON.stringify(after));
  assert.ok(after.bitmaps.every((id) => !id.endsWith("\u0000old")), JSON.stringify(after));
  assert.ok(after.closes >= 1, JSON.stringify(after));
  assert.equal(after.images.includes(identityOf(oldRef)), false);
  assert.equal(after.bitmaps.includes(identityOf(oldRef)), false);
});
