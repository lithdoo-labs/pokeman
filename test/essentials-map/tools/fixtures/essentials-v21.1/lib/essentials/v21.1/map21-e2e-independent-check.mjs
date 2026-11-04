/**
 * Independent E2E-21 checks. Does not import traceWorldStep, replayWorld, or
 * bfsWalkWorld. Expected facts come from MapTransfer JSON, Table terrain tags,
 * and event occupancy extracted separately.
 */

import { tableAt } from "./map-event-evidence.mjs";

const TAG15 = 15;

export function independentBridgeCells(mapData, terrainTags, width, height) {
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (const z of [2, 1, 0]) {
        const tileId = tableAt(mapData, x, y, z);
        if (!Number.isSafeInteger(tileId) || tileId <= 0) continue;
        const tag = tableAt(terrainTags, tileId);
        if (tag === TAG15) {
          cells.push(Object.freeze({ x, y, z, tileId }));
          break;
        }
      }
    }
  }
  return Object.freeze(cells);
}

function edgeKey(edge) {
  return `${edge.x},${edge.y},${edge.direction}->${edge.targetMapId},${edge.targetX},${edge.targetY}`;
}

export function verifyUnifiedTraceIndependently(trace, facts) {
  const issues = [];
  const edges = new Set((facts.edges ?? []).map(edgeKey));
  const tag15 = new Set((facts.bridgeCells ?? []).map((cell) => `${cell.mapId ?? 21},${cell.x},${cell.y}`));
  const steps = trace.steps ?? [];
  if (steps.length === 0) issues.push("empty-trace");
  let walkedTag15 = false;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (index > 0) {
      const prev = steps[index - 1].actual;
      const from = step.from;
      if (!prev || !from
        || prev.mapId !== from.mapId
        || prev.x !== from.x
        || prev.y !== from.y
        || prev.direction !== from.direction
        || prev.bridgeLevel !== from.bridgeLevel) {
        issues.push(`state-break-at-${index}`);
      }
    }
    if (step.kind === "walk") {
      const dx = Math.abs((step.actual?.x ?? 0) - (step.from?.x ?? 0));
      const dy = Math.abs((step.actual?.y ?? 0) - (step.from?.y ?? 0));
      if (step.actual?.mapId !== step.from?.mapId) issues.push(`walk-changed-map-at-${index}`);
      if (dx + dy !== 1) issues.push(`walk-not-adjacent-at-${index}`);
      if (step.actual?.bridgeLevel === 2 && tag15.has(`${step.actual.mapId},${step.actual.x},${step.actual.y}`)) {
        walkedTag15 = true;
      }
    }
    if (step.kind === "ledge-jump") {
      issues.push(`unexpected-ledge-jump-at-${index}`);
    }
    if (step.kind === "transfer") {
      const record = step.transfer;
      if (!record) {
        issues.push(`transfer-null-at-${index}`);
      } else if (!edges.has(edgeKey({
        x: record.sourceX,
        y: record.sourceY,
        direction: record.direction,
        targetMapId: record.targetMapId,
        targetX: record.targetX,
        targetY: record.targetY,
      }))) {
        issues.push(`transfer-not-in-materialized-edges-at-${index}:${record.sourceMapId},${record.sourceX},${record.sourceY}`);
      }
      if (step.actual?.bridgeLevel !== 0) issues.push(`transfer-did-not-clear-bridge-at-${index}`);
      if (record && (step.from?.mapId !== record.sourceMapId || step.actual?.mapId !== record.targetMapId)) {
        issues.push(`transfer-mapId-mismatch-at-${index}`);
      }
    }
    if (step.kind === "interpreter-execute" && step.executeCheckpoint?.occurred) {
      const pendingMatches = step.from?.pendingExecute?.eventId === step.executeCheckpoint.eventId;
      if (!pendingMatches) issues.push(`execute-without-pending-at-${index}`);
    }
    const started = step.startCheckpoint?.started ?? [];
    if (started.some((hit) => hit.execute === true)) issues.push(`start-checkpoint-marked-execute-true-at-${index}`);
  }
  return Object.freeze({
    ok: issues.length === 0,
    issues: Object.freeze(issues),
    walkedTag15,
    stepCount: steps.length,
    method: "materialized-edges + Table terrain_tags via tableAt + adjacency; not traceWorldStep/replayWorld/bfsWalkWorld",
  });
}
