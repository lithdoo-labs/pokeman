#!/usr/bin/env node
/**
 * Read-only Map 21 Route 2 bridge evidence extractor.
 * Whitelist: Map 21 only. Never eval Ruby. Never modify the FSDB.
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
const MAP_21 = 21;

function printSummary(evidence) {
  const confirmed = evidence.candidates.filter((item) => item.status === "confirmed-bridge-script");
  const unconfirmed = evidence.candidates.filter((item) => item.status === "unconfirmed-candidate");
  const lines = [
    `Map ${evidence.map.mapId} ${evidence.map.name ?? "(name unknown)"}`,
    `completeness=${evidence.completeness.status} provenNegative=${evidence.completeness.provenNegativeBridge}`,
    `rxdata: ${evidence.source.files.map.path}`,
    `SHA-256: ${evidence.source.files.map.sha256}`,
    `size: ${evidence.map.width}x${evidence.map.height} tileset ${evidence.map.tilesetId}`,
    `events=${evidence.coverage.eventCount} pages=${evidence.coverage.pageCount} commands=${evidence.coverage.commandCount} scripts=${evidence.coverage.scriptCommandCount} moveRouteScripts=${evidence.coverage.moveRouteScriptCount} condScripts=${evidence.coverage.conditionalBranchScriptCount}`,
    `bridge terrain scan=${evidence.bridgeTerrain.scanStatus} cells=${evidence.bridgeTerrain.cellCount} placed=${evidence.bridgeTerrain.placedBridgeTaggedTiles} tileIds=${evidence.bridgeTerrain.tileIds.join(",") || "(none)"}`,
    `candidates=${evidence.candidates.length} confirmed=${confirmed.length} unconfirmed=${unconfirmed.length}`,
    `scriptsMatchingPbBridge=${evidence.coverage.scripts.filter((item) => item.matchesBridgePattern).length}`,
    `transferAudit steps=${evidence.transferAudit.actual.stepCount} contacts=${evidence.transferAudit.actual.contactCount} edges=${evidence.transferAudit.actual.edgeCount} d0FalseBridgeCells=${evidence.transferAudit.bridgeCellD0.d0False}`,
  ];
  for (const row of evidence.triggerMatrix ?? []) {
    const d0 = row.byBridgeLevel?.[0];
    lines.push(`  trigger event ${row.eventId} overTrigger@bridge0=${d0?.overTrigger} branch=${d0?.branch} grade=${d0?.grade}`);
  }
  if (evidence.completeness.issues.length > 0) {
    for (const issue of evidence.completeness.issues) lines.push(`  INCOMPLETE: ${issue}`);
  }
  for (const candidate of evidence.candidates) {
    lines.push(
      `  event ${candidate.eventId} "${candidate.name}" @${candidate.x},${candidate.y} size=${candidate.size?.raw ?? "1x1"} ${candidate.status} reasons=${candidate.reasons.join("|")}`,
    );
  }
  for (const finding of evidence.transferAudit.findings) {
    lines.push(`  transfer ${finding.status}: ${finding.detail}`);
  }
  return lines.join("\n");
}

try {
  const raw = process.argv.slice(2);
  const options = parseEvidenceArguments(raw.includes("--map") ? raw : ["--map", String(MAP_21), ...raw]);
  if (options.mapId !== MAP_21) {
    throw new ImportFailure("MAP_EVENT_EVIDENCE_FAILURE", `map21-bridge-evidence.mjs only reads Map ${MAP_21}`);
  }
  const source = options.source ?? defaultLocalFsdb(repoRoot);
  const evidence = await collectMapEvidence(source, { mapId: MAP_21, corpusScan: options.corpusScan });
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
