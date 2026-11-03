import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const presentationRoot = path.join(repoRoot, "[FSDB]PokeMan/[resource]Presentation");
const mapScriptPath = path.join(presentationRoot, "map/map.browser.js.js");
const mapCssPath = path.join(presentationRoot, "map/map.css.css");
const dialogueScriptPath = path.join(presentationRoot, "dialogue/dialogue.browser.js.js");
const dialogueCssPath = path.join(presentationRoot, "dialogue/dialogue.css.css");
const tilesetPath = path.join(repoRoot, "[FSDB]PokeMan/[resource]Graphics/Tilesets/Poke Centre interior.png");
const tilesetBytes = await readFile(tilesetPath);
const tilesetVersion = `sha256:${createHash("sha256").update(tilesetBytes).digest("hex")}`;

function executablePath() {
  return [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find(existsSync);
}

async function fixture(t) {
  const requests = [];
  const staticFiles = new Map([
    ["/presentation/map.js", [mapScriptPath, "text/javascript"]],
    ["/presentation/map.css", [mapCssPath, "text/css"]],
    ["/presentation/dialogue.js", [dialogueScriptPath, "text/javascript"]],
    ["/presentation/dialogue.css", [dialogueCssPath, "text/css"]],
  ]);
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    requests.push(url.pathname);
    if (url.pathname === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html><head>
        <link rel="stylesheet" href="/presentation/map.css">
        <link rel="stylesheet" href="/presentation/dialogue.css">
        <script src="/presentation/map.js"></script>
        <script src="/presentation/dialogue.js"></script>
      </head><body></body></html>`);
      return;
    }
    if (url.pathname === "/tileset.png") {
      response.setHeader("content-type", "image/png");
      response.end(tilesetBytes);
      return;
    }
    const local = staticFiles.get(url.pathname);
    if (local) {
      response.setHeader("content-type", local[1]);
      response.end(await readFile(local[0]));
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(1));
    if (relative.startsWith("loom-realm/packages/renderer/dist/") && relative.endsWith(".js")) {
      try {
        response.setHeader("content-type", "text/javascript");
        response.end(await readFile(path.join(repoRoot, relative)));
      } catch {
        response.statusCode = 404;
        response.end();
      }
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { origin: `http://127.0.0.1:${server.address().port}`, requests };
}

test("Map and Dialogue coexist through retained WebProjector domains without disturbing Map", { timeout: 30_000 }, async (t) => {
  const dialogueSource = await readFile(dialogueScriptPath, "utf8");
  assert.match(dialogueSource, /pointer-events:\s*none/);
  assert.doesNotMatch(dialogueSource, /addEventListener\(\s*["'](?:pointer|click|touch)/);

  const server = await fixture(t);
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(server.origin);

  await page.evaluate(async ({ expectedTilesetVersion }) => {
    const { WebProjector } = await import("/loom-realm/packages/renderer/dist/internal/web-projector.js");
    const node = (key, tag, attrs = {}, data = {}, children = []) => ({ key, tag, attrs, data, children });
    const actions = ["confirm", "previous", "next", "history", "cancel"];
    const controls = () => node("controls", "lr-dialogue-controls", {}, {}, actions.map((action) =>
      node(`control-${action}`, "lr-dialogue-control-hint", {
        action,
        label: action,
        enabled: action === "confirm" || action === "history" ? "true" : "false",
      })));
    const dialogueRoot = node("dialogue-view", "lr-dialogue-view", {}, {}, [
      node("characters", "lr-dialogue-characters"),
      node("conversation", "lr-dialogue-conversation", { "conversation-id": "coexistence", "speaker-name": "博士" }, {}, [
        node("text", "lr-dialogue-text", { text: "地图与对话共存资格测试。" }),
        node("choices", "lr-dialogue-choices"),
      ]),
      controls(),
      node("history", "lr-dialogue-history", { visible: "false" }, {}, [
        node("history-intro", "lr-dialogue-history-entry", { "entry-id": "intro", "speaker-name": "博士", text: "欢迎" }),
      ]),
    ]);
    const mapResource = { namespace: "resource.Graphics", key: "Tilesets/Poke Centre interior", contentVersion: expectedTilesetVersion };
    const mapRoot = node("viewport", "lr-map-view", {}, {
      sceneEpoch: 1,
      visualEpoch: 1,
      motionId: null,
      viewportWidth: 1280,
      viewportHeight: 720,
      barHeight: 48,
      contentWidth: 1280,
      contentHeight: 672,
      columns: 40,
      rows: 21,
      logicalWidth: 1280,
      logicalHeight: 672,
      scaleX: 1,
      scaleY: 1,
      mapName: "1",
      mapId: 1,
      mapWidth: 40,
      mapHeight: 21,
      cameraX: 0,
      cameraY: 0,
      tileset: mapResource,
      autotiles: [null, null, null, null, null, null, null],
      projectionBounds: { minTileX: 0, minTileY: 0, maxTileX: 39, maxTileY: 20 },
      tiles: [[0, 0, 0, 387, 0]],
      cameraMotion: null,
      bridgeLevel: 0,
    }, [node("player", "lr-map-sprite", {}, {
      sceneEpoch: 1,
      visualEpoch: 1,
      motionId: null,
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      direction: 2,
      pattern: 0,
      sprite: mapResource,
      motion: null,
      bridgeLevel: 0,
    })]);
    let revision = 1;
    let includeDialogue = true;
    const snapshot = () => ({
      sessionId: "pokeman-map-dialogue-coexistence",
      revision,
      subsystems: [
        {
          subsystemKey: "map",
          generation: 1,
          eligible: true,
          domains: [{ domainId: "map-main", zIndex: 0, roots: [mapRoot] }],
        },
        ...(includeDialogue ? [{
          subsystemKey: "dialogue",
          generation: 1,
          eligible: true,
          domains: [{ domainId: "dialogue-main", zIndex: 123, roots: [dialogueRoot] }],
        }] : []),
      ],
    });
    const failures = [];
    const nodeEvents = [];
    const projector = new WebProjector({
      document,
      resourceClient: {
        async resource(namespace, key, contentVersion, signal) {
          if (namespace !== "resource.Graphics" || key !== "Tilesets/Poke Centre interior" || contentVersion !== expectedTilesetVersion) {
            throw new Error("unexpected coexistence resource request");
          }
          const response = await fetch("/tileset.png", { signal });
          return { bytes: new Uint8Array(await response.arrayBuffer()), mime: "image/png", contentVersion };
        },
      },
      reportFailure(error) { failures.push(String(error?.stack ?? error)); },
    });
    const source = { read: snapshot };
    const project = () => projector.reevaluate(source, (event) => nodeEvents.push(structuredClone(event)));
    project();
    const waitFor = async (predicate, label) => {
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      throw new Error(`timed out waiting for ${label}`);
    };
    await waitFor(() => document.querySelector("lr-map-view")?.dataset.mapVisualState === "ready", "real Map presentation");
    await waitFor(() => document.querySelector("lr-dialogue-view")?.shadowRoot.querySelector(".modal")?.hidden === false, "Dialogue presentation");
    const map = document.querySelector("lr-map-view");
    const originalMapParent = map.parentNode;
    let mapRemovalCount = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records) if ([...record.removedNodes].includes(map)) mapRemovalCount += 1;
    });
    observer.observe(document.body, { childList: true });
    globalThis.coexistenceQualification = {
      failures,
      nodeEvents,
      map,
      originalMapParent,
      get mapRemovalCount() { return mapRemovalCount; },
      history(visible) {
        dialogueRoot.children[3].attrs.visible = visible ? "true" : "false";
        revision += 1;
        project();
        if (visible) projector.deliverRenderEvent({
          sessionId: "pokeman-map-dialogue-coexistence",
          subsystemKey: "dialogue",
          generation: 1,
          domainId: "dialogue-main",
          targetKey: "history",
          name: "scroll-to-latest",
          data: {},
        });
      },
      ready() {
        for (const hint of dialogueRoot.children[2].children) hint.attrs.enabled = "false";
        revision += 1;
        project();
      },
      teardownDialogue() {
        includeDialogue = false;
        revision += 1;
        project();
      },
      async settle() { await Promise.resolve(); },
      stop() { observer.disconnect(); projector.teardown(); },
    };
  }, { expectedTilesetVersion: tilesetVersion });

  const initial = await page.evaluate(() => {
    const qualification = coexistenceQualification;
    const map = qualification.map;
    const dialogue = document.querySelector("lr-dialogue-view");
    const backdrop = dialogue.shadowRoot.querySelector(".backdrop");
    const modal = dialogue.shadowRoot.querySelector(".modal");
    const mapRect = map.getBoundingClientRect();
    const dialogueRect = dialogue.getBoundingClientRect();
    const backdropRect = backdrop.getBoundingClientRect();
    const modalRect = modal.getBoundingClientRect();
    return {
      bodyOrder: [...document.body.children].map((element) => element.localName),
      mapReady: map.dataset.mapVisualState,
      mapCanvasCount: map.shadowRoot.querySelectorAll("canvas.tile-layer").length,
      mapRect: mapRect.toJSON(),
      dialogueRect: dialogueRect.toJSON(),
      backdropRect: backdropRect.toJSON(),
      modalRect: modalRect.toJSON(),
      mapStyle: { position: getComputedStyle(map).position, zIndex: getComputedStyle(map).zIndex },
      dialogueStyle: { position: getComputedStyle(dialogue).position, zIndex: getComputedStyle(dialogue).zIndex, pointerEvents: getComputedStyle(dialogue).pointerEvents },
      failures: [...qualification.failures],
    };
  });
  assert.deepEqual(initial.bodyOrder, ["lr-dialogue-view", "lr-map-view"], "coexistence must not rely on Dialogue being the last root");
  assert.equal(initial.mapReady, "ready");
  assert.equal(initial.mapCanvasCount, 1, "the real Map component must rasterize a projected tile");
  assert.deepEqual(initial.failures, []);
  assert.deepEqual(initial.dialogueStyle, { position: "fixed", zIndex: "20", pointerEvents: "none" });
  assert.deepEqual(initial.mapStyle, { position: "relative", zIndex: "auto" });
  assert.ok(Number(initial.dialogueStyle.zIndex) > 0);
  assert.deepEqual(
    { left: initial.backdropRect.left, top: initial.backdropRect.top, width: initial.backdropRect.width, height: initial.backdropRect.height },
    { left: 0, top: 0, width: 1280, height: 720 },
  );
  assert.deepEqual(
    { left: initial.dialogueRect.left, top: initial.dialogueRect.top, width: initial.dialogueRect.width, height: initial.dialogueRect.height },
    { left: 0, top: 0, width: 1280, height: 720 },
  );
  assert.ok(initial.modalRect.left < initial.mapRect.right && initial.modalRect.right > initial.mapRect.left);
  assert.ok(initial.modalRect.top < initial.mapRect.bottom && initial.modalRect.bottom > initial.mapRect.top);

  await page.evaluate(async () => { coexistenceQualification.history(true); await coexistenceQualification.settle(); });
  const history = await page.evaluate(() => ({
    sameMap: document.querySelector("lr-map-view") === coexistenceQualification.map,
    sameParent: coexistenceQualification.map.parentNode === coexistenceQualification.originalMapParent,
    connected: coexistenceQualification.map.isConnected,
    removals: coexistenceQualification.mapRemovalCount,
    mode: document.querySelector("lr-dialogue-view")._mode,
    eventMode: document.querySelector("lr-dialogue-history")._lastEventMode,
    mapReady: coexistenceQualification.map.dataset.mapVisualState,
  }));
  assert.deepEqual(history, { sameMap: true, sameParent: true, connected: true, removals: 0, mode: "history", eventMode: "history", mapReady: "ready" });

  await page.evaluate(async () => { coexistenceQualification.history(false); coexistenceQualification.ready(); await coexistenceQualification.settle(); });
  const ready = await page.evaluate(() => ({
    sameMap: document.querySelector("lr-map-view") === coexistenceQualification.map,
    sameParent: coexistenceQualification.map.parentNode === coexistenceQualification.originalMapParent,
    connected: coexistenceQualification.map.isConnected,
    removals: coexistenceQualification.mapRemovalCount,
    mapReady: coexistenceQualification.map.dataset.mapVisualState,
    dialogueRetained: document.querySelector("lr-dialogue-view") !== null,
    dialogueHidden: document.querySelector("lr-dialogue-view").shadowRoot.querySelector(".modal").hidden,
    dialogueInert: document.querySelector("lr-dialogue-view").inert,
  }));
  assert.deepEqual(ready, {
    sameMap: true,
    sameParent: true,
    connected: true,
    removals: 0,
    mapReady: "ready",
    dialogueRetained: true,
    dialogueHidden: false,
    dialogueInert: true,
  }, "v1.1: intermediate READY after an ACTIVE keeps the shell visible but inert");

  await page.evaluate(async () => { coexistenceQualification.teardownDialogue(); await coexistenceQualification.settle(); });
  const teardown = await page.evaluate(() => ({
    sameMap: document.querySelector("lr-map-view") === coexistenceQualification.map,
    sameParent: coexistenceQualification.map.parentNode === coexistenceQualification.originalMapParent,
    connected: coexistenceQualification.map.isConnected,
    removals: coexistenceQualification.mapRemovalCount,
    mapReady: coexistenceQualification.map.dataset.mapVisualState,
    dialogue: document.querySelector("lr-dialogue-view"),
    failures: [...coexistenceQualification.failures],
  }));
  assert.deepEqual(teardown, {
    sameMap: true,
    sameParent: true,
    connected: true,
    removals: 0,
    mapReady: "ready",
    dialogue: null,
    failures: [],
  });
  await page.evaluate(() => coexistenceQualification.stop());

  assert.ok(server.requests.includes("/presentation/map.js"));
  assert.ok(server.requests.includes("/presentation/map.css"));
  assert.ok(server.requests.includes("/presentation/dialogue.js"));
  assert.ok(server.requests.includes("/presentation/dialogue.css"));
  assert.ok(server.requests.includes("/tileset.png"));
});
