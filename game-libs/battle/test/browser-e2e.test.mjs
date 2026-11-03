import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BattlePresentationBuilder } from "../dist/index.js";
import { RenderManager } from "../../../loom-realm/packages/subsystem/dist/internal/render-manager.js";
import { RendererRenderStore } from "../../../loom-realm/packages/renderer/dist/internal/render-store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const browserAsset = path.join(root, "game-libs", "battle", "dist", "browser", "battle.browser.js");
const browserCssAsset = path.join(root, "game-libs", "battle", "dist", "browser", "battle.css");
const packageManifest = path.join(root, "game-libs", "battle", "package.json");
const version = `sha256:${"2".repeat(64)}`;
function executablePath() { return [process.env.LOOMREALM_CHROMIUM_PATH, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(existsSync); }
const ref = (key) => ({ namespace: "resource.Graphics", key, contentVersion: version });
const layout = (width = 640, height = 480) => { const barHeight = height < 480 ? 24 : height < 720 ? 32 : 48, contentHeight = height - barHeight, rawRows = Math.ceil(contentHeight / 32), rows = Math.min(33, Math.max(14, rawRows)), columns = rawRows < 14 || rawRows > 33 ? Math.max(1, Math.round(rows * width / contentHeight)) : Math.ceil(width / 32); return { viewportWidth: width, viewportHeight: height, barHeight, contentWidth: width, contentHeight, columns, rows, logicalWidth: columns * 32, logicalHeight: rows * 32, scaleX: width / (columns * 32), scaleY: contentHeight / (rows * 32) }; };
const viewData = (epoch, paused = false, width = 640, height = 480, missingTiles = false, smallMap = false, slowAssets = false) => ({ sceneEpoch: 7, visualEpoch: epoch, paused, ...layout(width, height), mapWidth: smallMap ? 8 : 30, mapHeight: smallMap ? 8 : 20, cameraX: 0, cameraY: 0, tileset: ref(slowAssets ? "Tilesets/slow.png" : missingTiles ? "Tilesets/missing.png" : "Tilesets/test.png"), autotiles: [ref(missingTiles ? "Autotiles/missing[2]" : "Autotiles/water[2]"),ref("Autotiles/calm"),null,null,null,null,null], tiles: [[0,0,0,384,0],[1,0,0,48,0],[2,0,0,96,0],[2,2,2,385,160]] });
const actorData = (id, epoch, x, motion = null, paused = false, hpLife = "alive", sprite = `Characters/${id}.png`) => ({ sceneEpoch: 7, visualEpoch: epoch, paused, actorId: id, tileX: x, tileY: 2, direction: id === "hero" ? 6 : 4, sprite: ref(sprite), life: hpLife, motion });
const effectData = (epoch, starts = [], paused = false) => ({ sceneEpoch: 7, visualEpoch: epoch, paused, effectStarts: starts });
const hudData = (epoch, heroHp = 100) => ({ sceneEpoch: 7, visualEpoch: epoch, actors: [{ actorId: "hero", team: "ally", hp: heroHp, maxHp: 100 }, { actorId: "enemy", team: "enemy", hp: 80, maxHp: 80 }] });
function domain(epoch, { paused = false, width = 640, height = 480, heroHp = 100, effects = [], movingBoth = false, missingHero = false, heroLife = "alive", missingTiles = false, smallMap = false, slowAssets = false } = {}) {
  const heroMotion = movingBoth ? { id: 17, fromWorldX: 64, fromWorldY: 64, toWorldX: 96, toWorldY: 64, durationMs: 400 } : null;
  const enemyMotion = movingBoth ? { id: 9, fromWorldX: 160, fromWorldY: 64, toWorldX: 128, toWorldY: 64, durationMs: 600 } : null;
  return { zIndex: 0, roots: [{ key: "battle:view", tag: "lr-battle-view", attrs: {}, data: viewData(epoch, paused, width, height, missingTiles, smallMap, slowAssets), children: [
    { key: "battle:actor:enemy", tag: "lr-battle-actor", attrs: { slot: "world" }, data: actorData("enemy", epoch, 5, enemyMotion, paused), children: [] },
    { key: "battle:actor:hero", tag: "lr-battle-actor", attrs: { slot: "world" }, data: actorData("hero", epoch, 2, heroMotion, paused, heroLife, slowAssets ? "Characters/slow.png" : missingHero ? "Characters/missing.png" : "Characters/hero.png"), children: [] },
    { key: "battle:effects", tag: "lr-battle-effects", attrs: { slot: "world" }, data: effectData(epoch, effects, paused), children: [] },
    { key: "battle:hud", tag: "lr-battle-hud", attrs: { slot: "hud" }, data: hudData(epoch, heroHp), children: [] },
  ] }] };
}
const updateFor = (state) => ({ nodes: state.roots.flatMap((root) => [root, ...root.children]).map((node) => ({ key: node.key, data: { set: node.data } })) });
async function waitFor(page, predicate, label) { const until = Date.now() + 10_000; while (!(await page.evaluate(predicate))) { if (Date.now() > until) assert.fail(`Timed out waiting for ${label}`); await new Promise((resolve) => setTimeout(resolve, 10)); } }

test("RenderDomain state traverses WebProjector into battle custom elements", { timeout: 30_000 }, async (t) => {
  const [asset, css, manifestText] = await Promise.all([readFile(browserAsset), readFile(browserCssAsset), readFile(packageManifest, "utf8")]);
  assert.equal(JSON.parse(manifestText).exports["./browser/battle.css"], "./dist/browser/battle.css");
  let server;
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/battle.browser.js") { response.setHeader("content-type", "text/javascript"); response.end(asset); return; }
    if (pathname === "/battle.css") { response.setHeader("content-type", "text/css"); response.end(css); return; }
    if (pathname.startsWith("/renderer/") && pathname.endsWith(".js")) { try { response.setHeader("content-type", "text/javascript"); response.end(await readFile(path.join(root, "loom-realm", "packages", "renderer", "dist", "internal", path.basename(pathname)))); } catch { response.statusCode = 404; response.end(); } return; }
    response.setHeader("content-type", "text/html"); response.end("<!doctype html><html><body style='margin:0'></body></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`; const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } }); await page.goto(origin); await page.addStyleTag({ url: `${origin}/battle.css` }); await page.addScriptTag({ url: `${origin}/battle.browser.js` });
  assert.deepEqual(await page.evaluate(async () => { const response = await fetch("/battle.css"); return { ok: response.ok, type: response.headers.get("content-type"), hasViewRule: (await response.text()).includes("lr-battle-view") }; }), { ok: true, type: "text/css", hasViewRule: true });
  await page.evaluate(async ({ origin }) => {
    const { WebProjector } = await import(`${origin}/renderer/web-projector.js`);
    const png = async (w, h, colors) => { const canvas = new OffscreenCanvas(w, h), g = canvas.getContext("2d"); colors.forEach((color, index) => { g.fillStyle = color; g.fillRect(index * (w / colors.length), 0, w / colors.length, h); }); return new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer()); };
    const atlas = async (frameWidth, frameHeight) => { const canvas = new OffscreenCanvas(frameWidth * 4, frameHeight * 4), g = canvas.getContext("2d"); for (let row = 0; row < 4; row += 1) for (let pattern = 0; pattern < 4; pattern += 1) { g.fillStyle = `rgb(${pattern * 60},${row * 60},0)`; g.fillRect(pattern * frameWidth, row * frameHeight, frameWidth, frameHeight); } return new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer()); };
    const tiles = await png(256, 64, ["#294", "#49c", "#fc4", "#a4f", "#e55", "#5ee", "#ddd", "#222"]), autotileCell = await png(64, 32, ["#f00", "#00f"]), autotileBlock = await png(192, 128, ["#0f0", "#ff0"]), character = await atlas(32, 32), tall = await atlas(48, 64), effect = await png(32, 32, ["#fff"]);
    const calls = Object.create(null);
    const resourceClient = { async resource(_namespace, key, contentVersion) { calls[key] = (calls[key] ?? 0) + 1; if (key.includes("slow")) await new Promise((resolve) => setTimeout(resolve, 260)); if (key.includes("missing")) throw new Error("decode failed"); return { bytes: key.startsWith("Tilesets/") ? tiles : key.includes("Autotiles/calm") ? autotileBlock : key.startsWith("Autotiles/") ? autotileCell : key.startsWith("BattleEffects/") ? effect : key.includes("enemy") ? tall : character, mime: "image/png", contentVersion }; } };
    const failures = []; const projector = new WebProjector({ document, resourceClient, reportFailure(error) { failures.push(String(error)); } }); window.applyBattle = (view) => projector.reevaluate({ read: () => view }); window.closeBattle = () => projector.teardown(); window.battleFailures = failures; window.battleResourceCalls = calls;
  }, { origin });

  const store = new RendererRenderStore(1); store.beginCarrier();
  let activeStore = store, activeGeneration = 1;
  const manager = new RenderManager(); const renderDomain = manager.createDomain(domain(1));
  const accepted = (outcome) => assert.deepEqual(outcome, { kind: "accepted" });
  manager.setDataPeer({
    binding: { subsystemKey: "battle", generation: 1, dataProfile: "loomrealm.renderer-data/3" },
    render: {
      async sendDomains(message) { accepted(store.onDomains(message)); return { kind: "sent" }; },
      async sendSnapshot(message) { accepted(store.onSnapshot(message)); return { kind: "sent" }; },
      async sendPatch(message) { accepted(store.onPatch(message)); return { kind: "sent" }; },
      async sendEvent(message) { accepted(store.onEvent(message)); return { kind: "sent" }; },
    },
  });
  const settle = async () => { for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setImmediate(resolve)); };
  const presentationView = () => {
    const facts = activeStore.readPresentationFacts(); const eligible = facts.currentCarrier && facts.registrySeen && facts.domains.every((item) => item.baselined);
    return { sessionId: "session", subsystems: [{ subsystemKey: "battle", generation: activeGeneration, eligible, domains: eligible ? facts.domains.map(({ domainId, zIndex, roots }) => ({ domainId, zIndex, roots })) : [] }] };
  };
  const present = async () => page.evaluate((view) => window.applyBattle(view), presentationView());
  const commit = async (state) => { renderDomain.update(updateFor(state)); await settle(); await present(); };

  await settle(); await present();
  await waitFor(page, () => document.querySelectorAll("lr-battle-view lr-battle-actor").length === 2 && [...document.querySelectorAll("lr-battle-actor")].every((element) => element._img) && document.querySelector("lr-battle-actor")?.style.zIndex === "255", "initial actor tree and tall sprite");
  assert.deepEqual(await page.evaluate(() => ({
    tags: [...document.querySelector("lr-battle-view").children].map((element) => element.tagName),
    hud: [...document.querySelector("lr-battle-hud").shadowRoot.querySelectorAll("span")].map((element) => element.textContent),
    tallStack: document.querySelector("lr-battle-actor").style.zIndex,
    heroPixel: [...[...document.querySelectorAll("lr-battle-actor")].find((element) => element._data.actorId === "hero").shadowRoot.querySelector("canvas").getContext("2d").getImageData(4,4,1,1).data].slice(0,3),
    tileStacks: [...document.querySelector("lr-battle-view").shadowRoot.querySelectorAll(".tiles canvas")].map((canvas) => canvas.style.zIndex),
    failures: window.battleFailures,
  })), { tags: ["LR-BATTLE-ACTOR","LR-BATTLE-ACTOR","LR-BATTLE-EFFECTS","LR-BATTLE-HUD"], hud: ["Ally 100 / 100", "Enemy 80 / 80"], tallStack: "255", heroPixel: [0,120,0], tileStacks: ["0","0","0","320"], failures: [] });

  const autotilePixel = (left) => page.evaluate((x) => { const canvas = [...document.querySelector("lr-battle-view").shadowRoot.querySelectorAll(".tiles canvas")].find((item) => item.style.left === `${x}px` && item.style.top === "0px"); return [...canvas.getContext("2d").getImageData(8,8,1,1).data]; }, left);
  await page.evaluate(() => { const view = document.querySelector("lr-battle-view"); view._animationStart = performance.now(); view._pauseTotal = 0; view._paintTiles(view._sequence); });
  const fastOne = await autotilePixel(32), defaultOne = await autotilePixel(64); await new Promise((resolve) => setTimeout(resolve, 120));
  assert.notDeepEqual(fastOne, await autotilePixel(32), "[2] autotile advances at 2 * 50ms"); assert.deepEqual(defaultOne, await autotilePixel(64), "default autotile remains on its 250ms frame");
  await new Promise((resolve) => setTimeout(resolve, 150)); assert.notDeepEqual(defaultOne, await autotilePixel(64), "default autotile advances at 250ms");

  await commit(domain(2, { movingBoth: true })); await waitFor(page, () => [...document.querySelectorAll("lr-battle-actor")].every((element) => element._motion), "two motions");
  assert.deepEqual(await page.evaluate(() => { const hero = [...document.querySelectorAll("lr-battle-actor")].find((element) => element._data.actorId === "hero"), sample = () => [...hero.shadowRoot.querySelector("canvas").getContext("2d").getImageData(4,4,1,1).data].slice(0,3); hero._motion.started = performance.now(); hero._paint(); const firstHalf = sample(); hero._motion.started = performance.now() - 300; hero._paint(); const secondHalf = sample(); hero._motion.started = performance.now(); hero._paint(); return { firstHalf, secondHalf }; }), { firstHalf: [60,120,0], secondHalf: [120,120,0] });
  const motionBeforeResize = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("lr-battle-actor")].map((element) => [element._data.actorId, { id: element._motion.id, started: element._motion.started }])));
  assert.deepEqual(Object.values(motionBeforeResize).map((item) => item.id).sort((a,b)=>a-b), [9,17]);
  await new Promise((resolve) => setTimeout(resolve, 40)); await commit(domain(3, { movingBoth: true, width: 800, height: 600 }));
  assert.deepEqual(await page.evaluate(() => ({ width: document.querySelector("lr-battle-view").style.width, motions: Object.fromEntries([...document.querySelectorAll("lr-battle-actor")].map((element) => [element._data.actorId, { id: element._motion.id, started: element._motion.started }])) })), { width: "800px", motions: motionBeforeResize });

  await commit(domain(4, { movingBoth: true, paused: true, width: 800, height: 600 }));
  const frozen = await page.evaluate(() => ({ left: document.querySelectorAll("lr-battle-actor")[1].style.left, pixel: [...document.querySelector("lr-battle-view").shadowRoot.querySelectorAll(".tiles canvas")].find((canvas) => canvas.style.left === "32px" && canvas.style.top === "0px").getContext("2d").getImageData(8,8,1,1).data.join(",") }));
  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.deepEqual(await page.evaluate(() => ({ left: document.querySelectorAll("lr-battle-actor")[1].style.left, pixel: [...document.querySelector("lr-battle-view").shadowRoot.querySelectorAll(".tiles canvas")].find((canvas) => canvas.style.left === "32px" && canvas.style.top === "0px").getContext("2d").getImageData(8,8,1,1).data.join(",") })), frozen);
  await commit(domain(5, { movingBoth: true, width: 800, height: 600 })); await new Promise((resolve) => setTimeout(resolve, 70));
  assert.notEqual(await page.evaluate(() => document.querySelectorAll("lr-battle-actor")[1].style.left), frozen.left, "actor motion resumes from frozen elapsed time");

  const hit = { effectId: "hit-1", result: "hit", image: ref("BattleEffects/spark.png"), worldX: 96, worldY: 80, fadeInMs: 50, holdMs: 300, fadeOutMs: 50 };
  const immune = { effectId: "immune-1", result: "immune", image: ref("BattleEffects/spark.png"), worldX: 128, worldY: 80, fadeInMs: 0, holdMs: 200, fadeOutMs: 0 };
  const missing = { effectId: "missing-1", result: "hit", image: ref("BattleEffects/missing.png"), worldX: 160, worldY: 80, fadeInMs: 10, holdMs: 100, fadeOutMs: 10 };
  const once = { effectId: "once-1", result: "hit", image: ref("BattleEffects/spark.png"), worldX: 192, worldY: 80, fadeInMs: 0, holdMs: 20, fadeOutMs: 0 };
  await commit(domain(6, { heroHp: 70, width: 800, height: 600, effects: [hit, immune, missing, once] }));
  await waitFor(page, () => { const effects = document.querySelector("lr-battle-effects"); return effects._active.has("hit-1") && effects._active.has("immune-1") && !effects._active.has("missing-1"); }, "effect load and decode fallbacks");
  assert.match(await page.evaluate(() => document.querySelector("lr-battle-hud").shadowRoot.textContent), /Ally 70 \/ 100/);
  assert.equal(await page.evaluate(() => document.querySelector("lr-battle-effects")._active.get("immune-1").node.style.opacity), "0.6");
  assert.equal(await page.evaluate(() => Number(getComputedStyle(document.querySelector("lr-battle-effects")).zIndex) > Number(document.querySelector("lr-battle-actor").style.zIndex)), true);
  await new Promise((resolve) => setTimeout(resolve, 40)); assert.equal(await page.evaluate(() => document.querySelector("lr-battle-effects")._active.has("once-1")), false);

  const pausedStart = { effectId: "paused-1", result: "hit", image: ref("BattleEffects/spark.png"), worldX: 224, worldY: 80, fadeInMs: 100, holdMs: 100, fadeOutMs: 100 };
  await commit(domain(7, { paused: true, heroHp: 70, width: 800, height: 600, effects: [pausedStart, once] }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(await page.evaluate(() => { const effects = document.querySelector("lr-battle-effects"); return { pausedOpacity: effects._active.get("paused-1").node.style.opacity, duplicateReplayed: effects._active.has("once-1") }; }), { pausedOpacity: "0", duplicateReplayed: false });
  await commit(domain(8, { heroHp: 70, width: 800, height: 600 })); await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(await page.evaluate(() => { const opacity = Number(document.querySelector("lr-battle-effects")._active.get("paused-1").node.style.opacity); return opacity > 0 && opacity < 1; }), true);

  await commit(domain(9, { heroHp: 70, width: 800, height: 600, missingHero: true }));
  await waitFor(page, () => document.querySelectorAll("lr-battle-actor")[1]?.shadowRoot.querySelector(".fallback")?.hidden === false, "character placeholder fallback");
  await commit(domain(10, { heroHp: 0, heroLife: "dead", movingBoth: true, width: 800, height: 600 }));
  assert.deepEqual(await page.evaluate(() => { const hero = [...document.querySelectorAll("lr-battle-actor")].find((element) => element._data.actorId === "hero"); return { motion: hero._motion, left: hero.style.left, opacity: hero.style.opacity }; }), { motion: null, left: "64px", opacity: "0.5" });

  await commit(domain(11, { heroHp: 0, heroLife: "dead", width: 800, height: 600, smallMap: true }));
  assert.equal(await page.evaluate(() => document.querySelector("lr-battle-view")._world.style.transform), "translate(272px, 160px)");

  await commit(domain(12, { heroHp: 0, heroLife: "dead", width: 800, height: 600, missingTiles: true }));
  await waitFor(page, () => { const view = document.querySelector("lr-battle-view"); return view._prepared?.tileset === null && !view._prepared?.autotiles.has(0); }, "tile resource placeholders");
  assert.deepEqual(await page.evaluate(() => { const canvases = [...document.querySelector("lr-battle-view").shadowRoot.querySelectorAll(".tiles canvas")]; const pixel = (left) => [...canvases.find((canvas) => canvas.style.left === left && canvas.style.top === "0px").getContext("2d").getImageData(8,8,1,1).data].slice(0,3); return { regular: pixel("0px"), autotile: pixel("32px") }; }), { regular: [255,63,102], autotile: [180,92,255] });

  await commit(domain(13, { heroHp: 70, width: 800, height: 600, missingHero: true }));
  await waitFor(page, () => window.battleResourceCalls["Characters/missing.png"] === 2, "failed resource retry");

  await commit(domain(14, { heroHp: 70, width: 800, height: 600, slowAssets: true }));
  await commit(domain(15, { heroHp: 69, width: 800, height: 600, slowAssets: true }));
  await commit(domain(16, { heroHp: 68, width: 800, height: 600, slowAssets: true }));
  await waitFor(page, () => {
    const hero = [...document.querySelectorAll("lr-battle-actor")].find((element) => element._data.actorId === "hero");
    const view = document.querySelector("lr-battle-view");
    return hero?._data.sprite.key === "Characters/slow.png" && hero._img && view?._prepared?.tileset;
  }, "slow cached character and tileset resources");
  assert.deepEqual(await page.evaluate(() => ({
    characterLoads: window.battleResourceCalls["Characters/slow.png"],
    tilesetLoads: window.battleResourceCalls["Tilesets/slow.png"],
    heroFallback: [...document.querySelectorAll("lr-battle-actor")].find((element) => element._data.actorId === "hero").shadowRoot.querySelector(".fallback").hidden,
    tileWidth: document.querySelector("lr-battle-view")._prepared.tileset.width,
  })), { characterLoads: 1, tilesetLoads: 1, heroFallback: true, tileWidth: 256 });

  const lateEffect = { effectId: "late-close", result: "hit", image: ref("BattleEffects/late-slow.png"), worldX: 96, worldY: 80, fadeInMs: 10, holdMs: 500, fadeOutMs: 10 };
  await commit(domain(17, { heroHp: 68, width: 800, height: 600, effects: [lateEffect] }));
  await waitFor(page, () => window.battleResourceCalls["BattleEffects/late-slow.png"] === 1, "late resource start");
  await page.evaluate(() => { window.effectsBeforeClose = document.querySelector("lr-battle-effects"); }); renderDomain.close(); await settle(); await present();
  await waitFor(page, () => !document.querySelector("lr-battle-view"), "close cleanup");
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(await page.evaluate(() => ({ active: window.effectsBeforeClose._active.size, seen: window.effectsBeforeClose._seen.size, failures: window.battleFailures })), { active: 0, seen: 0, failures: [] });

  await t.test("BattlePresentationHandler crosses RenderManager, RendererRenderStore, WebProjector, and DOM", async () => {
    const handlerStore = new RendererRenderStore(2); handlerStore.beginCarrier();
    const handlerManager = new RenderManager();
    handlerManager.setDataPeer({
      binding: { subsystemKey: "battle", generation: 2, dataProfile: "loomrealm.renderer-data/3" },
      render: {
        async sendDomains(message) { accepted(handlerStore.onDomains(message)); return { kind: "sent" }; },
        async sendSnapshot(message) { accepted(handlerStore.onSnapshot(message)); return { kind: "sent" }; },
        async sendPatch(message) { accepted(handlerStore.onPatch(message)); return { kind: "sent" }; },
        async sendEvent(message) { accepted(handlerStore.onEvent(message)); return { kind: "sent" }; },
      },
    });
    activeStore = handlerStore; activeGeneration = 2;
    const mapValues = Array(30 * 20 * 3).fill(0); mapValues[0] = 384; mapValues[2 + 2 * 30 + 2 * 600] = 385;
    const table = (values, xSize, ySize = 1, zSize = 1) => ({ dimensions: zSize === 1 && ySize === 1 ? 1 : 3, xSize, ySize, zSize, values });
    const priorities = Array(500).fill(0); priorities[385] = 2;
    const records = new Map([
      ["struct.BattleArena:test", { id: "test", tileset_id: 1, width: 30, height: 20, passable: Array.from({ length: 20 }, () => Array(30).fill(true)), data: table(mapValues, 30, 20, 3) }],
      ["struct.Tileset:1", { id: 1, tileset_name: "test.png", autotile_names: ["water[2]", "calm", null, null, null, null, null], priorities: table(priorities, 500) }],
      ["struct.BattleEffect:spark", { id: "spark", image: { namespace: "resource.Graphics", key: "BattleEffects/spark.png" }, anchor: "tile-center", timing: { fade_in_ticks: 1, hold_ticks: 2, fade_out_ticks: 1 } }],
    ]);
    const viewportListeners = new Set();
    const viewport = { current: { width: 640, height: 480 }, subscribe(listener) { viewportListeners.add(listener); return () => viewportListeners.delete(listener); } };
    const controller = new AbortController();
    const scope = {
      signal: controller.signal,
      content: {
        async record(namespace, key) { const value = records.get(`${namespace}:${key}`); if (!value) throw new Error("missing record"); return { value, contentVersion: version }; },
        async resource() { return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion: version }; },
      },
      viewport,
      createRenderDomain(state) { return handlerManager.createDomain(state); },
    };
    const frame = { id: "handler-e2e", params: null, signal: controller.signal, async call() { return { type: "cancelled" }; } };
    const handler = new BattlePresentationBuilder(scope, frame).build();
    const scene = { battleId: "handler-battle", sceneEpoch: 7, tickDurationMs: 200, map: { arenaId: "test" }, actors: [
      { actorId: "hero", team: "ally", character: { namespace: "resource.Graphics", key: "Characters/hero.png" } },
      { actorId: "enemy", team: "enemy", character: { namespace: "resource.Graphics", key: "Characters/enemy.png" } },
    ], effectIds: ["spark"] };
    const actor = (actorId, x, overrides = {}) => ({ actorId, tile: { x, y: 2 }, direction: actorId === "hero" ? 6 : 4, hp: actorId === "hero" ? 100 : 80, maxHp: actorId === "hero" ? 100 : 80, life: "alive", movement: null, ...overrides });
    await handler.initialize(scene);
    handler.render({ sceneEpoch: 7, tick: 0, actors: [actor("hero", 2), actor("enemy", 5)], effectStarts: [] });
    await settle(); await present();
    await waitFor(page, () => document.querySelectorAll("lr-battle-view lr-battle-actor").length === 2 && document.querySelector("lr-battle-hud")?.shadowRoot.textContent.includes("Ally 100 / 100"), "Handler initial DOM");
    handler.render({ sceneEpoch: 7, tick: 1, actors: [
      actor("hero", 2, { movement: { motionId: 21, from: { x: 2, y: 2 }, to: { x: 3, y: 2 }, startTick: 1, completeTick: 3 } }),
      actor("enemy", 5, { hp: 70 }),
    ], effectStarts: [{ effectId: "handler-hit", result: "hit", effect: "spark", tile: { x: 5, y: 2 }, startTick: 1 }] });
    await settle(); await present();
    await waitFor(page, () => {
      const hero = [...document.querySelectorAll("lr-battle-actor")].find((element) => element._data.actorId === "hero");
      return hero?._motion?.id === 21 && document.querySelector("lr-battle-effects")?._active.has("handler-hit");
    }, "Handler movement and effect DOM");
    viewport.current = { width: 800, height: 600 }; for (const listener of viewportListeners) listener(viewport.current);
    await new Promise((resolve) => setTimeout(resolve, 120)); await settle(); await present();
    await waitFor(page, () => {
      const hero = [...document.querySelectorAll("lr-battle-actor")].find((element) => element._data.actorId === "hero");
      return document.querySelector("lr-battle-view")?.style.width === "800px" && hero?._motion?.id === 21;
    }, "Handler resize DOM");
    assert.match(await page.evaluate(() => document.querySelector("lr-battle-hud").shadowRoot.textContent), /Enemy 70 \/ 80/);
    handler.close(); await settle(); await present();
    await waitFor(page, () => !document.querySelector("lr-battle-view"), "Handler close cleanup");
    assert.equal(viewportListeners.size, 0);
  });
  await page.evaluate(() => window.closeBattle());
});
