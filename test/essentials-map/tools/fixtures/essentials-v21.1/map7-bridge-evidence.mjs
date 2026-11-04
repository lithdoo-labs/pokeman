#!/usr/bin/env node
/**
 * Read-only Map 7 Cedolan City event evidence extractor.
 * Default: decode Map007.rxdata only; never eval Ruby; never modify the FSDB.
 * Optional --corpus-scan: also list sibling maps that contain pbBridgeOn/Off or Bridge tiles.
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

function printSummary(evidence) {
  const lines = [
    `Map ${evidence.map.mapId} ${evidence.map.name ?? "(name unknown)"}`,
    `completeness=${evidence.completeness?.status ?? "?"} provenNegative=${evidence.completeness?.provenNegativeBridge ?? "?"}`,
    `rxdata: ${evidence.source.files.map.path}`,
    `SHA-256: ${evidence.source.files.map.sha256}`,
    `size: ${evidence.map.width}x${evidence.map.height} tileset ${evidence.map.tilesetId}`,
    `events=${evidence.coverage.eventCount} pages=${evidence.coverage.pageCount} commands=${evidence.coverage.commandCount} scripts=${evidence.coverage.scriptCommandCount}`,
    `bridge terrain scan=${evidence.bridgeTerrain.scanStatus ?? "?"} cells=${evidence.bridgeTerrain.cellCount} tileIds=${evidence.bridgeTerrain.tileIds.join(",") || "(none)"}`,
    `candidates=${evidence.candidates.length}`,
    `scriptsMatchingPbBridge=${evidence.coverage.scripts.filter((item) => item.matchesBridgePattern).length}`,
  ];
  for (const event of evidence.map.events) {
    lines.push(`  event ${event.eventId} "${event.name}" @${event.x},${event.y} pages=${event.pageCount}`);
  }
  for (const candidate of evidence.candidates) {
    lines.push(
      `  event ${candidate.eventId} "${candidate.name}" @${candidate.x},${candidate.y} ${candidate.status} reasons=${candidate.reasons.join("|")}`,
    );
  }
  if (evidence.corpusScan) {
    const scan = evidence.corpusScan;
    lines.push(`corpusScan maps=${scan.mapsScanned} inventory=${scan.inventory?.length ?? 0} scriptMaps=${scan.mapsWithBridgeScripts.length} tileMaps=${scan.mapsUsingBridgeTiles.length} nameMaps=${scan.mapsWithBridgeEventNames?.length ?? 0} commentMaps=${scan.mapsWithBridgeComments?.length ?? 0}`);
    for (const item of scan.inventory ?? []) {
      lines.push(`  map ${item.mapId} ${item.name ?? ""} tiles=${item.hasBridgeTiles} cells=${item.uniqueCellCount} scripts=${item.hasBridgeScripts} names=${item.hasBridgeEventName} comments=${item.hasBridgeComment}`);
    }
    for (const item of scan.mapsWithBridgeScripts) {
      lines.push(`  scripts map ${item.mapId} ${item.name ?? ""} hits=${item.hits.length}`);
    }
    for (const item of scan.mapsUsingBridgeTiles) {
      lines.push(`  tiles map ${item.mapId} ${item.name ?? ""} cells=${item.uniqueCellCount ?? "?"} placed=${item.placedBridgeTaggedTiles} tileset=${item.tilesetId} bbox=${item.bbox ? `${item.bbox.minX},${item.bbox.minY}-${item.bbox.maxX},${item.bbox.maxY}` : "?"}`);
    }
  }
  return lines.join("\n");
}

try {
  const options = parseEvidenceArguments(process.argv.slice(2));
  const source = options.source ?? defaultLocalFsdb(repoRoot);
  const evidence = await collectMapEvidence(source, { mapId: options.mapId, corpusScan: options.corpusScan });
  const json = `${JSON.stringify(evidence, null, 2)}\n`;
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
