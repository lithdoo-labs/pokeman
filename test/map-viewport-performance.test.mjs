import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { RenderManager } from "../loom-realm/packages/subsystem/dist/internal/render-manager.js";
import { calculateLayout } from "../game-libs/map/dist/layout.js";
import {
  assertProjectable,
  autotileCorners,
  computeCamera,
  expandTileBounds,
  migrateLegacyTilesetRecord,
  oneDimensionalIndexTable,
  projectTilesInBounds,
  tableAt,
  tileVisualDepth,
  validateMapRecord,
  validateTilesetRecord,
  viewportTileBounds,
} from "../game-libs/map/dist/semantics.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TILE = 32;
const CHUNK = 8;
const CHUNK_CELLS = CHUNK * CHUNK * 3;
const CHUNK_OVERSCAN = 1;
const VIEW_DATA_GUARD = 196_608;
const CANVAS_BUDGET = 128 * 1024 * 1024;
const DECODE_PLUS_BACKING_BUDGET = 256 * 1024 * 1024;
const VIEWPORTS = Object.freeze([
  { width: 320, height: 240 },
  { width: 640, height: 480 },
  { width: 800, height: 600 },
  { width: 960, height: 540 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]);
const VIEW_KEYS = Object.freeze([
  "sceneEpoch", "visualEpoch", "motionId", "viewportWidth", "viewportHeight",
  "mapId", "mapWidth", "mapHeight", "cameraX", "cameraY", "tileset", "autotiles",
  "tileVisuals", "chunks", "cameraMotion", "bridgeLevel",
]);
const SPRITE_KEYS = Object.freeze([
  "sceneEpoch", "visualEpoch", "motionId", "x", "y", "screenX", "screenY",
  "direction", "pattern", "sprite", "motion", "bridgeLevel",
]);
const LOCAL_FSDB_CANDIDATES = [
  process.env.POKEMAN_ESSENTIALS_FSDB,
  path.join(root, "examples", "essentials-v21.1-local", "[FSDB]Essentials v21.1"),
  path.join(root, "loom-realm", "examples", "essentials-v21.1-local", "[FSDB]Essentials v21.1"),
].filter(Boolean);
const LOCAL_FSDB = LOCAL_FSDB_CANDIDATES.find((candidate) => existsSync(candidate))
  ?? LOCAL_FSDB_CANDIDATES[0];
const ARTIFACT_DIR = path.join(root, "artifacts");
const encoder = new TextEncoder();

function utf8Bytes(value) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

function exactKeys(value, expected, label) {
  const keys = Object.keys(value).sort();
  const required = [...expected].sort();
  assert.deepEqual(keys, required, `${label} keys`);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function structurallyEqualJson(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  const leftArray = Array.isArray(left);
  if (leftArray !== Array.isArray(right)) return false;
  if (leftArray) {
    const a = left;
    const b = right;
    return a.length === b.length && a.every((value, index) => structurallyEqualJson(value, b[index]));
  }
  const a = left;
  const b = right;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  return aKeys.length === bKeys.length
    && aKeys.every((key, index) => key === bKeys[index] && structurallyEqualJson(a[key], b[key]));
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

function timeMs(fn, iterations = 30) {
  const samples = [];
  fn();
  for (let index = 0; index < iterations; index += 1) {
    const start = process.hrtime.bigint();
    fn();
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  return {
    n: samples.length,
    min: Math.min(...samples),
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max: Math.max(...samples),
    samples,
  };
}

function denseMap() {
  const width = 128;
  const height = 96;
  const values = new Array(width * height * 3);
  for (let z = 0; z < 3; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = x + y * width + z * width * height;
        if (z === 0) values[index] = 384 + ((x + y) % 8);
        else if (z === 1) values[index] = 48 + ((x + 2 * y) % 48);
        else values[index] = 384 + ((x + 3 * y) % 8);
      }
    }
  }
  const passages = Array(392).fill(0);
  const priorities = Array(392).fill(0);
  for (let tileId = 384; tileId <= 391; tileId += 1) {
    priorities[tileId] = [0, 1, 2, 3, 4, 5, 0, 1][tileId - 384];
  }
  const map = validateMapRecord({
    tileset_id: 1,
    width,
    height,
    data: { dimensions: 3, xSize: width, ySize: height, zSize: 3, values },
  });
  const tileset = validateTilesetRecord({
    id: 1,
    tileset_name: "dense-pr0",
    autotile_names: ["slot0", null, null, null, null, null, null],
    passages: { dimensions: 1, xSize: 392, ySize: 1, zSize: 1, values: passages },
    priorities: { dimensions: 1, xSize: 392, ySize: 1, zSize: 1, values: priorities },
    terrain_tags: { dimensions: 1, xSize: 392, ySize: 1, zSize: 1, values: Array(392).fill(0) },
  }, 1);
  assertProjectable(map, tileset);
  return { map, tileset, mapId: 1 };
}

function resourceRef(key, contentVersion = "pr0") {
  return Object.freeze({ namespace: "resource.Graphics", key, contentVersion });
}

function cameraFor(viewport, map, playerX, playerY) {
  const anchorX = Math.floor((viewport.width - TILE) / 2);
  const anchorY = Math.floor((viewport.height - TILE) / 2);
  return {
    cameraX: clamp(playerX * TILE - anchorX, 0, Math.max(map.width * TILE - viewport.width, 0)),
    cameraY: clamp(playerY * TILE - anchorY, 0, Math.max(map.height * TILE - viewport.height, 0)),
    anchorX,
    anchorY,
  };
}

function requiredTileBounds(map, camera, viewport) {
  return {
    minTileX: Math.max(0, Math.floor(camera.cameraX / TILE)),
    maxTileX: Math.min(map.width - 1, Math.floor((camera.cameraX + viewport.width - 1) / TILE)),
    minTileY: Math.max(0, Math.floor(camera.cameraY / TILE)),
    maxTileY: Math.min(map.height - 1, Math.floor((camera.cameraY + viewport.height - 1) / TILE)),
  };
}

function unionBounds(left, right) {
  return {
    minTileX: Math.min(left.minTileX, right.minTileX),
    maxTileX: Math.max(left.maxTileX, right.maxTileX),
    minTileY: Math.min(left.minTileY, right.minTileY),
    maxTileY: Math.max(left.maxTileY, right.maxTileY),
  };
}

function chunkCoords(map, bounds) {
  const minChunkX = Math.max(0, Math.floor(bounds.minTileX / CHUNK) - CHUNK_OVERSCAN);
  const maxChunkX = Math.min(Math.floor((map.width - 1) / CHUNK), Math.floor(bounds.maxTileX / CHUNK) + CHUNK_OVERSCAN);
  const minChunkY = Math.max(0, Math.floor(bounds.minTileY / CHUNK) - CHUNK_OVERSCAN);
  const maxChunkY = Math.min(Math.floor((map.height - 1) / CHUNK), Math.floor(bounds.maxTileY / CHUNK) + CHUNK_OVERSCAN);
  const coords = [];
  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      coords.push({ chunkX, chunkY });
    }
  }
  return coords;
}

function fillChunk(map, chunkX, chunkY) {
  const cells = new Array(CHUNK_CELLS);
  for (let z = 0; z < 3; z += 1) {
    for (let localY = 0; localY < CHUNK; localY += 1) {
      for (let localX = 0; localX < CHUNK; localX += 1) {
        const x = chunkX * CHUNK + localX;
        const y = chunkY * CHUNK + localY;
        const index = ((z * CHUNK + localY) * CHUNK) + localX;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
          cells[index] = 0;
          continue;
        }
        cells[index] = tableAt(map.data, x, y, z);
      }
    }
  }
  return Object.freeze({ chunkX, chunkY, cells: Object.freeze(cells) });
}

function tileVisual(tileId, tileset) {
  const priority = tableAt(tileset.priorities, tileId);
  const depthBias = priority === 0 ? -1 : (priority + 1) * TILE;
  if (tileId >= 384) {
    return Object.freeze([tileId, depthBias, 0, tileId - 384]);
  }
  const slot = Math.floor((tileId - 48) / 48);
  const variant = (tileId - 48) % 48;
  const corners = autotileCorners(variant);
  return Object.freeze([
    tileId, depthBias, 1, slot,
    corners[0].sx, corners[0].sy, corners[1].sx, corners[1].sy,
    corners[2].sx, corners[2].sy, corners[3].sx, corners[3].sy,
  ]);
}

function projectMapView({
  map, tileset, mapId, viewport, playerX, playerY, extraBounds,
  sceneEpoch = 1, visualEpoch = 1, motionId = null, cameraMotion = null,
}) {
  const camera = cameraFor(viewport, map, playerX, playerY);
  let bounds = requiredTileBounds(map, camera, viewport);
  if (extraBounds) bounds = unionBounds(bounds, extraBounds);
  const coords = chunkCoords(map, bounds);
  const chunks = coords.map(({ chunkX, chunkY }) => fillChunk(map, chunkX, chunkY));
  const used = new Set();
  for (const chunk of chunks) {
    for (const tileId of chunk.cells) {
      if (tileId !== 0) used.add(tileId);
    }
  }
  const tileVisuals = [...used].sort((a, b) => a - b).map((tileId) => tileVisual(tileId, tileset));
  const tilesetRef = resourceRef(`Tilesets/${tileset.tileset_name}`);
  const autotiles = tileset.autotile_names.map((name) => (name === null ? null : resourceRef(`Autotiles/${name}`)));
  const data = {
    sceneEpoch,
    visualEpoch,
    motionId,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    mapId,
    mapWidth: map.width,
    mapHeight: map.height,
    cameraX: camera.cameraX,
    cameraY: camera.cameraY,
    tileset: tilesetRef,
    autotiles,
    tileVisuals,
    chunks,
    cameraMotion,
    bridgeLevel: 0,
  };
  exactKeys(data, VIEW_KEYS, "MapViewRenderData");
  return { data, camera, bounds, chunks, tileVisuals };
}

function projectCurrentMapView({
  map, tileset, mapId, viewport, playerX, playerY,
  sceneEpoch = 1, visualEpoch = 1, motionId = null, cameraMotion = null,
}) {
  const layout = calculateLayout(viewport.width, viewport.height);
  const camera = computeCamera(map, playerX, playerY, layout);
  const bounds = expandTileBounds(
    viewportTileBounds(map, camera.cameraX, camera.cameraY, layout),
    4,
    map,
  );
  const tiles = projectTilesInBounds(map, tileset, bounds).map((tile) => Object.freeze([
    tile.x,
    tile.y,
    tile.z,
    tile.tileId,
    tile.depth,
  ]));
  const data = {
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
    mapName: String(mapId),
    mapId,
    mapWidth: map.width,
    mapHeight: map.height,
    cameraX: camera.cameraX,
    cameraY: camera.cameraY,
    tileset: resourceRef(`Tilesets/${tileset.tileset_name}`),
    autotiles: tileset.autotile_names.map((name) => (name === null ? null : resourceRef(`Autotiles/${name}`))),
    projectionBounds: bounds,
    tiles,
    cameraMotion,
    bridgeLevel: 0,
  };
  return { data, camera, bounds, tiles };
}

function playerSprite(projection, playerX, playerY) {
  const data = {
    sceneEpoch: 1,
    visualEpoch: 1,
    motionId: null,
    x: playerX,
    y: playerY,
    screenX: playerX * TILE - projection.camera.cameraX,
    screenY: playerY * TILE - projection.camera.cameraY,
    direction: 2,
    pattern: 0,
    sprite: resourceRef("Characters/red"),
    motion: null,
    bridgeLevel: 0,
  };
  exactKeys(data, SPRITE_KEYS, "MapSpriteRenderData");
  return data;
}

function assertViewSchema(data, map, tileset) {
  exactKeys(data, VIEW_KEYS, "MapView");
  assert.equal(Number.isSafeInteger(data.sceneEpoch) && data.sceneEpoch >= 1, true);
  assert.equal(Number.isSafeInteger(data.visualEpoch) && data.visualEpoch >= 1, true);
  for (const chunk of data.chunks) {
    exactKeys(chunk, ["chunkX", "chunkY", "cells"], "ProjectedChunk");
    assert.equal(chunk.cells.length, CHUNK_CELLS);
    assert.equal(chunk.cells.length, 192);
  }
  const seen = new Set();
  for (let index = 1; index < data.chunks.length; index += 1) {
    const prev = data.chunks[index - 1];
    const next = data.chunks[index];
    const ordered = prev.chunkY < next.chunkY || (prev.chunkY === next.chunkY && prev.chunkX < next.chunkX);
    assert.equal(ordered, true, "chunks Y/X order");
  }
  for (const chunk of data.chunks) {
    const key = `${chunk.chunkX},${chunk.chunkY}`;
    assert.equal(seen.has(key), false, "duplicate chunk");
    seen.add(key);
    for (const tileId of chunk.cells) {
      if (tileId === 0) continue;
      assert.equal(tileId >= 1 && tileId <= 47, false, `unsupported tile ${tileId}`);
    }
  }
  const used = new Set();
  for (const chunk of data.chunks) {
    for (const tileId of chunk.cells) if (tileId !== 0) used.add(tileId);
  }
  assert.deepEqual(data.tileVisuals.map((item) => item[0]), [...used].sort((a, b) => a - b));
  for (const visual of data.tileVisuals) {
    const [tileId, depthBias, kind] = visual;
    const priority = tableAt(tileset.priorities, tileId);
    const expectedBias = priority === 0 ? -1 : (priority + 1) * TILE;
    assert.equal(depthBias, expectedBias);
    if (priority === 0) assert.equal(tileVisualDepth(0, 0), 0);
    else assert.equal(tileVisualDepth(3, priority), 3 * TILE + expectedBias);
    if (kind === 0) {
      assert.equal(visual.length, 4);
      assert.equal(visual[3], tileId - 384);
    } else {
      assert.equal(kind, 1);
      assert.equal(visual.length, 12);
      assert.equal(visual[3], Math.floor((tileId - 48) / 48));
    }
  }
}

function estimateBacking(map, tileset, view) {
  const buckets = new Map();
  for (const chunk of view.chunks) {
    for (let z = 0; z < 3; z += 1) {
      for (let localY = 0; localY < CHUNK; localY += 1) {
        for (let localX = 0; localX < CHUNK; localX += 1) {
          const tileId = chunk.cells[((z * CHUNK + localY) * CHUNK) + localX];
          if (tileId === 0) continue;
          const x = chunk.chunkX * CHUNK + localX;
          const y = chunk.chunkY * CHUNK + localY;
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
          const priority = tableAt(tileset.priorities, tileId);
          const depth = tileVisualDepth(y, priority);
          const minX = x * TILE;
          const minY = y * TILE;
          const maxX = minX + TILE;
          const maxY = minY + TILE;
          const bucket = buckets.get(depth);
          if (bucket === undefined) buckets.set(depth, { minX, minY, maxX, maxY });
          else {
            bucket.minX = Math.min(bucket.minX, minX);
            bucket.minY = Math.min(bucket.minY, minY);
            bucket.maxX = Math.max(bucket.maxX, maxX);
            bucket.maxY = Math.max(bucket.maxY, maxY);
          }
        }
      }
    }
  }
  let visibleBytes = 0;
  for (const bucket of buckets.values()) {
    visibleBytes += (bucket.maxX - bucket.minX) * (bucket.maxY - bucket.minY) * 4;
  }
  const spriteBytes = 32 * 64 * 4;
  const detachedBytes = visibleBytes;
  return {
    uniqueDepths: buckets.size,
    visibleBytes,
    spriteBytes,
    peakCanvasBytes: visibleBytes + detachedBytes + spriteBytes * 2,
  };
}

function pngSize(bytes) {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), fileBytes: bytes.length };
}

function renderState(view, sprite) {
  return {
    zIndex: 0,
    roots: [{
      key: "viewport",
      tag: "lr-map-view",
      attrs: {},
      data: view,
      children: [{
        key: "player",
        tag: "lr-map-sprite",
        attrs: {},
        data: sprite,
        children: [],
      }],
    }],
  };
}

function viewSet(view) {
  const set = {};
  for (const key of VIEW_KEYS) set[key] = view[key];
  return set;
}

const report = {
  env: {
    node: process.version,
    os: `${process.platform} ${os.release()}`,
    cpu: os.cpus()[0]?.model ?? "unknown",
    executableShaCommand: "git rev-parse HEAD",
  },
  samples: [],
  local: null,
  renderDomain: null,
  m13: null,
  stacking: null,
  raster: null,
};

test("640x480 camera anchors degenerate to Frozen 304/224", () => {
  const { map } = denseMap();
  const camera = cameraFor({ width: 640, height: 480 }, map, 64, 48);
  assert.equal(camera.anchorX, 304);
  assert.equal(camera.anchorY, 224);
});

test("synthetic dense MapView schema, bytes, and memory for six sizes", async () => {
  const loaded = denseMap();
  const positions = [
    { name: "center", x: 64, y: 48 },
    { name: "west", x: 0, y: 48 },
    { name: "east", x: 127, y: 48 },
    { name: "north", x: 64, y: 0 },
    { name: "south", x: 64, y: 95 },
  ];
  let maxBytes = 0;
  let maxCanvas = 0;
  let maxVisible = 0;
  for (const viewport of VIEWPORTS) {
    for (const position of positions) {
      const projection = projectMapView({
        ...loaded,
        viewport,
        playerX: position.x,
        playerY: position.y,
      });
      assertViewSchema(projection.data, loaded.map, loaded.tileset);
      const sprite = playerSprite(projection, position.x, position.y, viewport);
      exactKeys(sprite, SPRITE_KEYS, "sprite");
      const bytes = utf8Bytes(projection.data);
      assert.equal(bytes < VIEW_DATA_GUARD, true, `${viewport.width}x${viewport.height} ${position.name} bytes ${bytes}`);
      const backing = estimateBacking(loaded.map, loaded.tileset, projection.data);
      maxBytes = Math.max(maxBytes, bytes);
      maxCanvas = Math.max(maxCanvas, backing.peakCanvasBytes);
      maxVisible = Math.max(maxVisible, backing.visibleBytes);
      report.samples.push({
        viewport: `${viewport.width}x${viewport.height}`,
        position: position.name,
        player: [position.x, position.y],
        camera: { x: projection.camera.cameraX, y: projection.camera.cameraY },
        chunkCount: projection.data.chunks.length,
        tileVisualCount: projection.data.tileVisuals.length,
        bytes,
        ...backing,
      });
    }
    const source = requiredTileBounds(loaded.map, cameraFor(viewport, loaded.map, 64, 48), viewport);
    const target = requiredTileBounds(loaded.map, cameraFor(viewport, loaded.map, 65, 48), viewport);
    const union = projectMapView({
      ...loaded,
      viewport,
      playerX: 64,
      playerY: 48,
      extraBounds: unionBounds(source, target),
    });
    const unionBytes = utf8Bytes(union.data);
    assert.equal(unionBytes < VIEW_DATA_GUARD, true, `union ${viewport.width}x${viewport.height} ${unionBytes}`);
    report.samples.push({
      viewport: `${viewport.width}x${viewport.height}`,
      position: "center-right-union",
      player: [64, 48],
      chunkCount: union.data.chunks.length,
      tileVisualCount: union.data.tileVisuals.length,
      bytes: unionBytes,
      ...estimateBacking(loaded.map, loaded.tileset, union.data),
    });
    maxBytes = Math.max(maxBytes, unionBytes);
  }
  const decoded = (256 * 32 + 96 * 128 + 128 * 128) * 4;
  report.maxBytes = maxBytes;
  report.maxCanvas = maxCanvas;
  report.maxVisibleCanvas = maxVisible;
  report.decodedBytes = decoded;
  report.decodePlusBackingOk = maxCanvas + decoded <= DECODE_PLUS_BACKING_BUDGET;
  assert.equal(maxBytes < VIEW_DATA_GUARD, true, `max bytes ${maxBytes}`);
  assert.equal(maxVisible <= CANVAS_BUDGET, true, `accepted canvas ${maxVisible}`);
  assert.equal(maxCanvas + decoded <= DECODE_PLUS_BACKING_BUDGET, true, `live+decode ${maxCanvas + decoded}`);
});

test("dense accepted canvas ≤128MiB and live+decode ≤256MiB", () => {
  const loaded = denseMap();
  const overVisible = [];
  const overLive = [];
  let maxVisible = 0;
  let maxLive = 0;
  const decoded = (256 * 32 + 96 * 128 + 128 * 128) * 4;
  for (const viewport of VIEWPORTS) {
    const projection = projectMapView({ ...loaded, viewport, playerX: 64, playerY: 48 });
    const backing = estimateBacking(loaded.map, loaded.tileset, projection.data);
    maxVisible = Math.max(maxVisible, backing.visibleBytes);
    maxLive = Math.max(maxLive, backing.peakCanvasBytes + decoded);
    if (backing.visibleBytes > CANVAS_BUDGET) {
      overVisible.push({
        viewport: `${viewport.width}x${viewport.height}`,
        visibleBytes: backing.visibleBytes,
        uniqueDepths: backing.uniqueDepths,
      });
    }
    if (backing.peakCanvasBytes + decoded > DECODE_PLUS_BACKING_BUDGET) {
      overLive.push({
        viewport: `${viewport.width}x${viewport.height}`,
        peakCanvasBytes: backing.peakCanvasBytes,
        decoded,
      });
    }
  }
  report.maxVisibleCanvas = maxVisible;
  report.maxLivePlusDecode = maxLive;
  report.canvasBudgetOk = overVisible.length === 0 && overLive.length === 0;
  report.canvasOverBudget = { overVisible, overLive };
  assert.equal(overVisible.length, 0, `accepted canvas ${maxVisible} over 128MiB; ${JSON.stringify(overVisible)}`);
  assert.equal(overLive.length, 0, `live+decode ${maxLive} over 256MiB; ${JSON.stringify(overLive)}`);
});

test("RenderDomain.update indexed COW cost stays below current gates", () => {
  const loaded = denseMap();
  const gates = [
    { width: 640, height: 480, refreshMs: 50 },
    { width: 1280, height: 720, refreshMs: 75 },
    { width: 1920, height: 1080, refreshMs: 100 },
  ];
  const perSize = [];
  let independentBottleneck = false;
  for (const gate of gates) {
    const viewport = { width: gate.width, height: gate.height };
    const projection = projectMapView({ ...loaded, viewport, playerX: 64, playerY: 48 });
    const sprite = playerSprite(projection, 64, 48);
    const manager = new RenderManager();
    const domain = manager.createDomain(renderState(projection.data, sprite));
    const next = projectMapView({ ...loaded, viewport, playerX: 64, playerY: 48, visualEpoch: 2 });
    const fullUpdateMs = timeMs(() => {
      domain.update({ nodes: [{ key: "viewport", data: { set: viewSet(next.data) } }] });
    }, 15);
    const cameraOnlyUpdateMs = timeMs(() => {
      domain.update({ nodes: [{ key: "viewport", data: { set: { cameraX: next.data.cameraX + 1 } } }] });
    }, 15);
    const refreshBlocked = fullUpdateMs.p95 >= gate.refreshMs;
    const ordinaryBlocked = cameraOnlyUpdateMs.p95 >= 50;
    if (refreshBlocked || ordinaryBlocked) independentBottleneck = true;
    perSize.push({
      viewport: `${gate.width}x${gate.height}`,
      refreshGateMs: gate.refreshMs,
      fullUpdateMs,
      cameraOnlyUpdateMs,
      refreshBlocked,
      ordinaryBlocked,
    });
  }
  report.renderDomain = {
    perSize,
    residualNote: "Core RenderDomain.update validates only the authored delta, uses indexed target-to-root COW, and does not stringify/probe a Snapshot. Compared to each size's accepted nonresize refresh P95 gate; camera-only compared to the 50ms ordinary gate.",
    independentBottleneck,
  };
  assert.equal(report.renderDomain.independentBottleneck, false, JSON.stringify(report.renderDomain));
});

test("M13 structural equality cost for camera-only changes on current tiles", () => {
  const loaded = denseMap();
  const viewport = { width: 1920, height: 1080 };
  const projection = projectCurrentMapView({ ...loaded, viewport, playerX: 64, playerY: 48 });
  const left = projection.data;
  const right = { ...left, cameraX: left.cameraX + 1 };
  assert.equal(left.tiles, right.tiles);
  const equalSelf = timeMs(() => structurallyEqualJson(left, left), 20);
  const cameraOnly = timeMs(() => structurallyEqualJson(left, right), 20);
  report.m13 = {
    equalSelfMs: equalSelf,
    cameraOnlyMs: cameraOnly,
    independentBottleneck: cameraOnly.p95 >= 50,
  };
  assert.equal(structurallyEqualJson(left, right), false);
  assert.equal(report.m13.independentBottleneck, false, JSON.stringify(report.m13));
});

test("exact-local Essentials Map002/Map066 MapView bytes and resources", async (t) => {
  if (!existsSync(LOCAL_FSDB)) {
    report.local = { status: "EVIDENCE MISSING", path: LOCAL_FSDB };
    if (process.env.POKEMAN_REQUIRE_EXACT_ESSENTIALS === "1") {
      assert.fail(`LOCAL EVIDENCE MISSING: ${LOCAL_FSDB}`);
    }
    t.skip("set POKEMAN_ESSENTIALS_FSDB for exact local-corpus qualification");
    return;
  }
  const local = { path: LOCAL_FSDB, maps: [] };
  const hash = createHash("sha256");
  for (const mapId of [2, 66]) {
    const mapJson = await readFile(path.join(LOCAL_FSDB, "[struct]Map", `${mapId}.json`));
    hash.update(mapJson);
    const map = validateMapRecord(JSON.parse(mapJson.toString("utf8")));
    const tilesetJson = await readFile(path.join(LOCAL_FSDB, "[struct]Tileset", `${map.tileset_id}.json`));
    hash.update(tilesetJson);
    const rawTileset = JSON.parse(tilesetJson.toString("utf8"));
    const tileset = Object.hasOwn(rawTileset, "terrain_tags")
      ? validateTilesetRecord(rawTileset, map.tileset_id)
      : migrateLegacyTilesetRecord(
        rawTileset,
        oneDimensionalIndexTable(Array(rawTileset.passages.xSize).fill(0)),
        map.tileset_id,
      );
    assertProjectable(map, tileset);
    const tilesetPngPath = path.join(LOCAL_FSDB, "[resource]Graphics", "Tilesets", `${tileset.tileset_name}.png`);
    const tilesetPng = pngSize(await readFile(tilesetPngPath));
    const autotileResources = [];
    let decoded = tilesetPng.width * tilesetPng.height * 4;
    for (const name of tileset.autotile_names) {
      if (name === null) {
        autotileResources.push(null);
        continue;
      }
      const file = path.join(LOCAL_FSDB, "[resource]Graphics", "Autotiles", `${name}.png`);
      assert.equal(existsSync(file), true, `missing autotile ${name}`);
      const size = pngSize(await readFile(file));
      decoded += size.width * size.height * 4;
      autotileResources.push({ name, ...size });
    }
    const positions = [
      { name: "center", x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) },
      { name: "west", x: 0, y: Math.floor(map.height / 2) },
      { name: "east", x: map.width - 1, y: Math.floor(map.height / 2) },
      { name: "north", x: Math.floor(map.width / 2), y: 0 },
      { name: "south", x: Math.floor(map.width / 2), y: map.height - 1 },
    ];
    const mapReport = {
      mapId,
      width: map.width,
      height: map.height,
      tileset: tileset.tileset_name,
      tilesetPng,
      autotileResources,
      decodedBytes: decoded,
      windows: [],
    };
    for (const viewport of [{ width: 640, height: 480 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      for (const position of positions) {
        const projection = projectMapView({
          map, tileset, mapId, viewport, playerX: position.x, playerY: position.y,
        });
        assertViewSchema(projection.data, map, tileset);
        const bytes = utf8Bytes(projection.data);
        assert.equal(bytes < VIEW_DATA_GUARD, true, `Map${String(mapId).padStart(3, "0")} ${viewport.width}x${viewport.height} ${bytes}`);
        const backing = estimateBacking(map, tileset, projection.data);
        assert.equal(backing.visibleBytes <= CANVAS_BUDGET, true);
        assert.equal(backing.peakCanvasBytes + decoded <= DECODE_PLUS_BACKING_BUDGET, true);
        mapReport.windows.push({
          viewport: `${viewport.width}x${viewport.height}`,
          position: position.name,
          player: [position.x, position.y],
          chunkCount: projection.data.chunks.length,
          tileVisualCount: projection.data.tileVisuals.length,
          bytes,
          ...backing,
        });
      }
    }
    local.maps.push(mapReport);
  }
  local.checksumSha256 = hash.digest("hex");
  local.status = "RECORDED";
  report.local = local;
});

function executablePath() {
  return [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find(existsSync);
}

let browser;
let origin;
let server;
const mapBrowserPath = path.join(root, "game-libs", "map", "dist", "browser", "map.browser.js");

before(async () => {
  const source = existsSync(mapBrowserPath) ? await readFile(mapBrowserPath) : Buffer.from("");
  server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/map.browser.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(source);
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><html><head></head><body style=\"margin:0;background:#000\"></body></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    ...(executablePath() ? { executablePath: executablePath() } : {}),
  });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(path.join(ARTIFACT_DIR, "map-viewport-pr0-node.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`MAP_VIEWPORT_PR0 ${JSON.stringify(report)}\n`);
});

test("Chromium private ::slotted sprite stacking pixel oracle", { timeout: 60_000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 200, height: 120 }, deviceScaleFactor: 1 });
  await page.goto(origin);
  await page.evaluate(() => {
    class ProbeView extends HTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        this._style = document.createElement("style");
        this._stage = document.createElement("div");
        this._stage.className = "stage";
        this._slot = document.createElement("slot");
        this._style.textContent = `
          :host { display: block; width: 32px; height: 32px; }
          .stage { position: relative; width: 32px; height: 32px; isolation: isolate; }
          canvas.depth { position: absolute; left: 0; top: 0; }
          ::slotted(lr-map-sprite-probe) { position: absolute; left: 0; top: 0; display: block; width: 32px; height: 32px; }
        `;
        root.append(this._style, this._stage);
        this._stage.append(this._slot);
      }
      setSpriteZ(zIndex) {
        const sheet = this._style.sheet;
        const rule = [...sheet.cssRules].find((item) => String(item.selectorText).includes("lr-map-sprite-probe"));
        rule.style.zIndex = String(zIndex);
      }
      addCanvas(zIndex, r, g, b) {
        const canvas = document.createElement("canvas");
        canvas.className = "depth";
        canvas.width = 32;
        canvas.height = 32;
        canvas.style.zIndex = String(zIndex);
        const context = canvas.getContext("2d");
        context.fillStyle = `rgb(${r}, ${g}, ${b})`;
        context.fillRect(0, 0, 32, 32);
        this._stage.insertBefore(canvas, this._slot);
        return canvas;
      }
    }
    class ProbeSprite extends HTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        canvas.style.position = "absolute";
        canvas.style.left = "0px";
        canvas.style.top = "0px";
        const context = canvas.getContext("2d");
        context.fillStyle = "rgb(0, 255, 0)";
        context.fillRect(0, 0, 32, 32);
        root.append(canvas);
      }
    }
    customElements.define("lr-map-view-probe", ProbeView);
    customElements.define("lr-map-sprite-probe", ProbeSprite);
  });
  const sampleCase = async (name, tileZ, tileRgb, spriteZ) => {
    const meta = await page.evaluate(({ tileZ: z, tileRgb: rgb, spriteZ: sprite }) => {
      const view = document.createElement("lr-map-view-probe");
      const host = document.createElement("lr-map-sprite-probe");
      view.append(host);
      document.body.replaceChildren(view);
      view.addCanvas(z, rgb[0], rgb[1], rgb[2]);
      view.setSpriteZ(sprite);
      return { hostSpriteZ: host.style.zIndex, hostSpriteLeft: host.style.left };
    }, { tileZ, tileRgb, spriteZ });
    const pngBytes = await page.locator("lr-map-view-probe").screenshot();
    const pixel = await page.evaluate(async (b64) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      return [...context.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data];
    }, pngBytes.toString("base64"));
    return { name, pixel, ...meta };
  };
  const result = [
    await sampleCase("priority0-sprite-on-top", 0, [255, 0, 0], 1),
    await sampleCase("priority5-tile-covers-sprite", 384, [0, 0, 255], 65),
    await sampleCase("equal-depth-sprite-on-top", 64, [255, 0, 0], 65),
    await sampleCase("tall-sprite-above-priority0", 0, [255, 0, 0], 127),
  ];
  await page.close();
  const expectRgb = (pixel, rgb, name) => {
    assert.equal(pixel[0], rgb[0], `${name} r ${pixel}`);
    assert.equal(pixel[1], rgb[1], `${name} g ${pixel}`);
    assert.equal(pixel[2], rgb[2], `${name} b ${pixel}`);
    assert.equal(pixel[3], 255, `${name} a`);
  };
  expectRgb(result[0].pixel, [0, 255, 0], "priority0-sprite-on-top");
  expectRgb(result[1].pixel, [0, 0, 255], "priority5-tile-covers-sprite");
  expectRgb(result[2].pixel, [0, 255, 0], "equal-depth-sprite-on-top");
  expectRgb(result[3].pixel, [0, 255, 0], "tall-sprite-above-priority0");
  for (const item of result) {
    assert.equal(item.hostSpriteZ, "", JSON.stringify(item));
    assert.equal(item.hostSpriteLeft, "", JSON.stringify(item));
  }
  report.stacking = { status: "PASS", cases: result };
});

test("PR1 Browser 640 raster/camera-only on dense current payload", { timeout: 60_000 }, async () => {
  assert.equal(existsSync(mapBrowserPath), true, "map.browser.js dist missing; run npm run build:m14");
  const loaded = denseMap();
  const viewport = { width: 640, height: 480 };
  const projection = projectCurrentMapView({ ...loaded, viewport, playerX: 64, playerY: 48 });
  const viewPayload = projection.data;
  const spritePayload = playerSprite(projection, 64, 48);
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  await page.goto(origin);
  await page.addScriptTag({ url: `${origin}/map.browser.js` });
  const timing = await page.evaluate(async ({ viewPayload: firstView, spritePayload: firstSprite }) => {
    const pngBytes = async (width, height, r, g, b) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      context.fillStyle = `rgb(${r}, ${g}, ${b})`;
      context.fillRect(0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      return new Uint8Array(await blob.arrayBuffer());
    };
    const tilesetBytes = await pngBytes(256, 32, 0, 0, 255);
    const autotileBytes = await pngBytes(96, 128, 0, 128, 0);
    const characterBytes = await pngBytes(128, 128, 255, 0, 0);
    const resources = {
      async resource(namespace, key) {
        if (key.startsWith("Tilesets/")) return { bytes: tilesetBytes, mime: "image/png" };
        if (key.startsWith("Autotiles/")) return { bytes: autotileBytes, mime: "image/png" };
        if (key.startsWith("Characters/")) return { bytes: characterBytes, mime: "image/png" };
        throw new Error(`missing ${namespace}/${key}`);
      },
    };
    const view = document.createElement("lr-map-view");
    const sprite = document.createElement("lr-map-sprite");
    view.append(sprite);
    document.body.replaceChildren(view);
    view.receiveRenderContext({ resources });
    sprite.receiveRenderContext({ resources });
    const receiveStart = performance.now();
    view.receiveRenderData(firstView);
    sprite.receiveRenderData(firstSprite);
    const receiveEnd = performance.now();
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      const painted = [...(view.shadowRoot?.querySelectorAll("canvas.tile-layer") ?? [])].some((canvas) => !canvas.hidden);
      if (painted && view._tileDrawCount > 0) {
        const paintAt = performance.now();
        const canvases = [...view.shadowRoot.querySelectorAll("canvas.tile-layer")];
        let backing = 0;
        for (const canvas of canvases) backing += canvas.width * canvas.height * 4;
        backing += 32 * 32 * 4;
        const before = {
          draws: view._tileDrawCount,
          clears: view._tileClearCount,
          resizes: view._tileResizeCount,
          cameraOnly: view._cameraOnlyCommits,
        };
        const accepted = view._latestData;
        view.receiveRenderData({
          ...accepted,
          cameraX: accepted.cameraX + 32,
        });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return {
          receiveMs: receiveEnd - receiveStart,
          receiveToPaintMs: paintAt - receiveStart,
          canvasCount: canvases.length,
          backingBytes: backing,
          hostSpriteZ: sprite.style.zIndex,
          cameraOnly: {
            before,
            after: {
              draws: view._tileDrawCount,
              clears: view._tileClearCount,
              resizes: view._tileResizeCount,
              cameraOnly: view._cameraOnlyCommits,
            },
          },
        };
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    throw new Error("PR1 browser did not paint dense 640 chunk payload");
  }, { viewPayload, spritePayload });
  await page.close();
  report.raster = {
    viewBytes: utf8Bytes(viewPayload),
    ...timing,
    clock: "same Browser Window performance.now(); receive-to-paint excludes screenshot",
    note: "Current production tiles schema + camera-only identity path.",
  };
  assert.equal(typeof timing.receiveToPaintMs, "number");
  assert.equal(timing.hostSpriteZ, String(2 * ((48 + 1) * TILE) + 1));
  assert.equal(timing.cameraOnly.after.draws, timing.cameraOnly.before.draws);
  assert.equal(timing.cameraOnly.after.clears, timing.cameraOnly.before.clears);
  assert.equal(timing.cameraOnly.after.resizes, timing.cameraOnly.before.resizes);
  assert.equal(timing.cameraOnly.after.cameraOnly, timing.cameraOnly.before.cameraOnly + 1);
});

test("PR2 Browser 720 and 1080 dense paint, host box, camera-only, and backing", { timeout: 120_000 }, async () => {
  assert.equal(existsSync(mapBrowserPath), true, "map.browser.js dist missing; run npm run build:m14");
  const loaded = denseMap();
  const results = [];
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const projection = projectCurrentMapView({ ...loaded, viewport, playerX: 64, playerY: 48 });
    const viewPayload = projection.data;
    assert.ok(utf8Bytes(viewPayload) < 196608, JSON.stringify({ viewport, bytes: utf8Bytes(viewPayload) }));
    const spritePayload = playerSprite(projection, 64, 48);
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    await page.goto(origin);
    await page.addScriptTag({ url: `${origin}/map.browser.js` });
    const timing = await page.evaluate(async ({ viewPayload: firstView, spritePayload: firstSprite, box }) => {
      const pngBytes = async (width, height, r, g, b) => {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        context.fillStyle = `rgb(${r}, ${g}, ${b})`;
        context.fillRect(0, 0, width, height);
        const blob = await canvas.convertToBlob({ type: "image/png" });
        return new Uint8Array(await blob.arrayBuffer());
      };
      const tilesetBytes = await pngBytes(256, 32, 0, 0, 255);
      const autotileBytes = await pngBytes(96, 128, 0, 128, 0);
      const characterBytes = await pngBytes(128, 128, 255, 0, 0);
      const resources = {
        async resource(namespace, key) {
          if (key.startsWith("Tilesets/")) return { bytes: tilesetBytes, mime: "image/png" };
          if (key.startsWith("Autotiles/")) return { bytes: autotileBytes, mime: "image/png" };
          if (key.startsWith("Characters/")) return { bytes: characterBytes, mime: "image/png" };
          throw new Error(`missing ${namespace}/${key}`);
        },
      };
      const view = document.createElement("lr-map-view");
      const sprite = document.createElement("lr-map-sprite");
      view.append(sprite);
      document.body.replaceChildren(view);
      view.receiveRenderContext({ resources });
      sprite.receiveRenderContext({ resources });
      const receiveStart = performance.now();
      view.receiveRenderData(firstView);
      sprite.receiveRenderData(firstSprite);
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        const painted = [...(view.shadowRoot?.querySelectorAll("canvas.tile-layer") ?? [])].some((canvas) => !canvas.hidden);
        if (painted && view._tileDrawCount > 0) {
          const paintAt = performance.now();
          const canvases = [...view.shadowRoot.querySelectorAll("canvas.tile-layer")];
          let backing = 0;
          for (const canvas of canvases) backing += canvas.width * canvas.height * 4;
          backing += 32 * 32 * 4;
          const visible = canvases.find((canvas) => !canvas.hidden);
          const sample = visible.getContext("2d").getImageData(1, 1, 1, 1).data;
          const boxRect = view.getBoundingClientRect();
          const before = { draws: view._tileDrawCount, clears: view._tileClearCount, resizes: view._tileResizeCount, cameraOnly: view._cameraOnlyCommits };
          const accepted = view._latestData;
          view.receiveRenderData({ ...accepted, cameraX: accepted.cameraX + 32 });
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return {
            receiveToPaintMs: paintAt - receiveStart,
            host: [getComputedStyle(view).width, getComputedStyle(view).height],
            hostBox: [boxRect.width, boxRect.height],
            pixel: [sample[0], sample[1], sample[2], sample[3]],
            backingBytes: backing,
            canvasCount: canvases.length,
            cameraOnly: {
              before,
              after: { draws: view._tileDrawCount, clears: view._tileClearCount, resizes: view._tileResizeCount, cameraOnly: view._cameraOnlyCommits },
            },
            expected: [`${box.width}px`, `${box.height}px`],
          };
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      throw new Error(`PR2 browser did not paint dense ${box.width}x${box.height}`);
    }, { viewPayload, spritePayload, box: viewport });
    await page.close();
    assert.deepEqual(timing.host, timing.expected);
    assert.deepEqual(timing.hostBox, [viewport.width, viewport.height]);
    assert.equal(timing.pixel[3], 255);
    assert.ok(timing.pixel[0] + timing.pixel[1] + timing.pixel[2] > 0, JSON.stringify(timing.pixel));
    assert.equal(timing.cameraOnly.after.draws, timing.cameraOnly.before.draws);
    assert.equal(timing.cameraOnly.after.clears, timing.cameraOnly.before.clears);
    assert.equal(timing.cameraOnly.after.resizes, timing.cameraOnly.before.resizes);
    assert.equal(timing.cameraOnly.after.cameraOnly, timing.cameraOnly.before.cameraOnly + 1);
    assert.ok(timing.backingBytes <= 128 * 1024 * 1024, JSON.stringify({ viewport, backing: timing.backingBytes }));
    assert.equal(typeof timing.receiveToPaintMs, "number");
    results.push({ viewport, ...timing, viewBytes: utf8Bytes(viewPayload) });
  }
  report.pr2Raster = results;
});
