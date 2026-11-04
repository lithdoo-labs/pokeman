#!/usr/bin/env node
/**
 * Independent Map 21 / Map 7 / Map 47 table+event recount.
 * Uses Marshal/RMXP decode + tableAt, not collectMapEvidence's JSON.
 * Never evals Ruby. Never writes the FSDB.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRIDGE_TERRAIN_TAG,
  LEDGE_TERRAIN_TAG,
  decodeRxdataBytes,
  defaultLocalFsdb,
  extractMapFacts,
  extractTilesetTerrain,
  occupiedTiles,
  parseEventSize,
  tableAt,
} from "./lib/essentials/v21.1/map-event-evidence.mjs";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const BRIDGE_SCRIPT = /\bpbBridge(?:On|Off)\s*(?:\(|\b)/u;

export async function independentMapRecount(fsdb, mapId) {
  const dataDir = join(fsdb, "[resource]Data");
  const filename = `Map${String(mapId).padStart(3, "0")}.rxdata`;
  const mapPath = join(dataDir, filename);
  const tilesetsPath = join(dataDir, "Tilesets.rxdata");
  if (!existsSync(mapPath) || !existsSync(tilesetsPath)) {
    return Object.freeze({ present: false, mapId, mapPathExists: existsSync(mapPath), tilesetsPathExists: existsSync(tilesetsPath) });
  }
  const mapBytes = await readFile(mapPath);
  const tilesetBytes = await readFile(tilesetsPath);
  const mapDecoded = decodeRxdataBytes(mapBytes, filename);
  const tilesetDecoded = decodeRxdataBytes(tilesetBytes, "Tilesets.rxdata");
  const facts = extractMapFacts(mapDecoded.root, mapId, filename);
  const terrain = extractTilesetTerrain(tilesetDecoded.root, facts.tilesetId);
  const cells = [];
  const ledgeCells = [];
  const tagLimit = terrain.terrain_tags.xSize;
  for (let y = 0; y < facts.height; y += 1) {
    for (let x = 0; x < facts.width; x += 1) {
      const bridgeLayers = [];
      const ledgeLayers = [];
      for (const z of [2, 1, 0]) {
        const tileId = tableAt(facts.data, x, y, z);
        if (!Number.isSafeInteger(tileId) || tileId <= 0 || tileId >= tagLimit) continue;
        const tag = tableAt(terrain.terrain_tags, tileId);
        if (tag === BRIDGE_TERRAIN_TAG) bridgeLayers.push({ z, tileId });
        if (tag === LEDGE_TERRAIN_TAG) ledgeLayers.push({ z, tileId });
      }
      if (bridgeLayers.length) cells.push({ x, y, layers: bridgeLayers });
      if (ledgeLayers.length) ledgeCells.push({ x, y, layers: ledgeLayers });
    }
  }
  const scriptEvents = [];
  for (const event of facts.events) {
    const size = parseEventSize(event.name);
    const occupied = occupiedTiles(event.x, event.y, size.width, size.height);
    const scripts = event.pages.flatMap((page) => page.concatenatedScripts.map((group) => group.joinedWithNewlines));
    if (scripts.some((text) => BRIDGE_SCRIPT.test(text))) {
      scriptEvents.push({
        eventId: event.eventId,
        name: event.name,
        x: event.x,
        y: event.y,
        occupied,
        size,
      });
    }
  }
  return Object.freeze({
    present: true,
    mapId,
    filename,
    sha256: createHash("sha256").update(mapBytes).digest("hex"),
    size: mapBytes.length,
    width: facts.width,
    height: facts.height,
    tilesetId: facts.tilesetId,
    eventCount: facts.events.length,
    pageCount: facts.events.reduce((sum, event) => sum + event.pageCount, 0),
    commandCount: facts.events.reduce((sum, event) => sum + event.pages.reduce((pageSum, page) => pageSum + page.commands.length, 0), 0),
    uniqueBridgeCells: cells.length,
    placedBridgeLayers: cells.reduce((sum, cell) => sum + cell.layers.length, 0),
    uniqueLedgeCells: ledgeCells.length,
    placedLedgeLayers: ledgeCells.reduce((sum, cell) => sum + cell.layers.length, 0),
    bridgeScriptEventIds: Object.freeze(scriptEvents.map((item) => item.eventId).sort((left, right) => left - right)),
    bridgeScriptEvents: Object.freeze(scriptEvents),
    sampleBridgeCells: Object.freeze(cells.slice(0, 5)),
    sampleLedgeCells: Object.freeze(ledgeCells.slice(0, 5)),
  });
}

const asCli = process.argv[1] && basename(process.argv[1]).includes("independent-check");
if (asCli) {
  const fsdb = defaultLocalFsdb(repoRoot);
  const ids = process.argv.slice(2).map(Number).filter((id) => id > 0);
  const maps = ids.length > 0 ? ids : [7, 21, 47];
  const rows = [];
  for (const mapId of maps) rows.push(await independentMapRecount(fsdb, mapId));
  process.stdout.write(`${JSON.stringify({ fsdbPresent: existsSync(join(fsdb, "[resource]Data")), rows }, null, 2)}\n`);
}
