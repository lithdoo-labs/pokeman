#!/usr/bin/env node
/**
 * Read-only unified Map7→Map21 E2E. STATIC-INFERRED. Not RGSS.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { ImportFailure } from "../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/errors.mjs";
import { defaultLocalFsdb } from "./lib/essentials/v21.1/map-event-evidence.mjs";
import { loadOfficialE2eInputs, officialFsdbPresent } from "./lib/essentials/v21.1/terrain-behavior-live.mjs";
import { buildMap21E2eTraces, buildWorldFromEvidence } from "./lib/essentials/v21.1/map21-e2e-replay.mjs";
import { independentBridgeCells, verifyUnifiedTraceIndependently } from "./lib/essentials/v21.1/map21-e2e-independent-check.mjs";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

function printSummary(traces, checks) {
  const lines = [
    `E2E-21 unified STATIC-INFERRED notALiveRun=${traces.notALiveRun}`,
    `outboundEdges=${traces.materializedOutbound.length} returnEdges=${traces.materializedReturn.length} allAvailable=${traces.allAvailable}`,
  ];
  for (const group of traces.groups) {
    if (group.available !== true) {
      lines.push(`  ${group.id} UNAVAILABLE ${group.reason}`);
      continue;
    }
    const check = checks.get(group.id);
    lines.push(
      `  ${group.id} continuous=${group.continuous} walkedTag15=${group.walkedTag15} return7=${group.returnedToMap7} bridgeCleared=${group.returnedBridgeCleared} onStarts=${group.onCounts.starts}/${group.onCounts.executes} offStarts=${group.offCounts.starts}/${group.offCounts.executes} independent=${check?.ok} issues=${(check?.issues ?? []).join(",") || "none"}`,
    );
  }
  return lines.join("\n");
}

try {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
  const sourceIndex = args.indexOf("--source");
  const source = sourceIndex >= 0 ? args[sourceIndex + 1] : defaultLocalFsdb(repoRoot);
  if (!officialFsdbPresent(source)) {
    throw new ImportFailure("MAP_EVENT_EVIDENCE_FAILURE", `official FSDB not present at ${source}`);
  }
  const loaded = await loadOfficialE2eInputs(source);
  const world = buildWorldFromEvidence(loaded);
  const traces = buildMap21E2eTraces(world, loaded.map7, loaded.map21);
  const independentCells = independentBridgeCells(
    loaded.context21.mapData,
    loaded.context21.terrainTags,
    loaded.context21.width,
    loaded.context21.height,
  );
  const edges = [
    ...(loaded.map7.transferAudit?.actual?.edges ?? []),
    ...(loaded.map21.transferAudit?.actual?.edges ?? []),
  ];
  const checks = new Map();
  for (const group of traces.groups) {
    if (group.available !== true) continue;
    checks.set(group.id, verifyUnifiedTraceIndependently(group.unified, {
      edges,
      bridgeCells: independentCells.map((cell) => ({ mapId: 21, x: cell.x, y: cell.y })),
    }));
  }
  const payload = {
    grade: "STATIC-INFERRED",
    notALiveRun: true,
    source: {
      map7: loaded.map7.source?.files?.map,
      map21: loaded.map21.source?.files?.map,
    },
    traces,
    independent: {
      uniqueBridgeCells: independentCells.length,
      collectBridgeCells: loaded.map21.bridgeTerrain?.cellCount,
      checks: Object.fromEntries([...checks.entries()]),
    },
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (output) await writeFile(resolve(output), json);
  else process.stdout.write(json);
  process.stderr.write(`${printSummary(traces, checks)}\n`);
} catch (error) {
  const message = error instanceof ImportFailure
    ? `${error.category}: ${error.message}`
    : error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
