#!/usr/bin/env node
/**
 * Read-only Map 47 Route 7 ledge evidence extractor.
 * Whitelist: Map 47 only. Never eval Ruby. Never modify the FSDB.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { ImportFailure } from "../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/errors.mjs";
import {
  collectMapEvidence,
  defaultLocalFsdb,
  parseEvidenceArguments,
} from "./lib/essentials/v21.1/map-event-evidence.mjs";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const MAP_47 = 47;

function sampleLedgeRoutes(evidence) {
  const cells = evidence.ledgeTerrain?.cells ?? [];
  if (cells.length === 0) return Object.freeze({ available: false, reason: "no-ledge-cells" });
  const contextNeed = evidence.map;
  return Object.freeze({
    available: true,
    uniqueCells: cells.length,
    placedLayers: evidence.ledgeTerrain.placedTaggedTiles,
    tileIds: evidence.ledgeTerrain.tileIds,
    bbox: evidence.ledgeTerrain.bbox,
    sample: Object.freeze(cells.slice(0, 12)),
  });
}

function printSummary(evidence) {
  const ledge = evidence.ledgeTerrain;
  const lines = [
    `Map ${evidence.map.mapId} ${evidence.map.name ?? "(name unknown)"}`,
    `completeness=${evidence.completeness.status}`,
    `SHA-256: ${evidence.source.files.map.sha256}`,
    `size: ${evidence.map.width}x${evidence.map.height} tileset ${evidence.map.tilesetId}`,
    `events=${evidence.coverage.eventCount} pages=${evidence.coverage.pageCount} commands=${evidence.coverage.commandCount}`,
    `ledge scan=${ledge?.scanStatus} cells=${ledge?.cellCount ?? 0} placed=${ledge?.placedTaggedTiles ?? 0} tileIds=${(ledge?.tileIds ?? []).join(",") || "(none)"}`,
    `bridge cells=${evidence.bridgeTerrain.cellCount}`,
  ];
  if (evidence.completeness.issues.length > 0) {
    for (const issue of evidence.completeness.issues) lines.push(`  INCOMPLETE: ${issue}`);
  }
  return lines.join("\n");
}

try {
  const raw = process.argv.slice(2);
  const options = parseEvidenceArguments(raw.includes("--map") ? raw : ["--map", String(MAP_47), ...raw]);
  if (options.mapId !== MAP_47) {
    throw new ImportFailure("MAP_EVENT_EVIDENCE_FAILURE", `map47-ledge-evidence.mjs only reads Map ${MAP_47}`);
  }
  const source = options.source ?? defaultLocalFsdb(repoRoot);
  const evidence = await collectMapEvidence(source, { mapId: MAP_47, corpusScan: options.corpusScan });
  const json = `${JSON.stringify({ ...evidence, ledgeRouteSketch: sampleLedgeRoutes(evidence) }, null, 2)}\n`;
  if (options.output) await writeFile(resolve(options.output), json);
  else process.stdout.write(json);
  process.stderr.write(`${printSummary(evidence)}\n`);
} catch (error) {
  const message = error instanceof ImportFailure
    ? `${error.category}: ${error.message}`
    : error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
