/**
 * Map connection / MapTransfer audit with explicit (sourceMapId,x,y) and
 * (targetMapId,x,y). Does not treat a theoretical D0 drop as a proven deletion.
 */

import { projectedD0Passable } from "./map-transfer-consumer.mjs";

const EDGE_PAIRS = Object.freeze({ N: "S", S: "N", E: "W", W: "E" });

export function parseMapConnectionLines(text) {
  const issues = [];
  const connections = [];
  const lines = String(text ?? "").split(/\r?\n/);
  for (let line = 0; line < lines.length; line += 1) {
    const stripped = lines[line].replace(/#.*$/u, "").trim();
    if (stripped === "") continue;
    const fields = stripped.split(",").map((item) => item.trim());
    if (fields.length !== 6) {
      issues.push(Object.freeze({ line: line + 1, raw: stripped, decodeError: "map_connections-line-must-have-6-fields" }));
      continue;
    }
    const mapAId = Number(fields[0]);
    const mapBId = Number(fields[3]);
    const offsetA = Number(fields[2]);
    const offsetB = Number(fields[5]);
    const edgeA = fields[1].toUpperCase();
    const edgeB = fields[4].toUpperCase();
    if (!Number.isSafeInteger(mapAId) || mapAId <= 0 || !Number.isSafeInteger(mapBId) || mapBId <= 0) {
      issues.push(Object.freeze({ line: line + 1, raw: stripped, decodeError: "map_connections-map-id-not-positive-integer" }));
      continue;
    }
    if (EDGE_PAIRS[edgeA] !== edgeB) {
      issues.push(Object.freeze({ line: line + 1, raw: stripped, decodeError: "map_connections-edges-must-be-N-S-or-E-W-pairs" }));
      continue;
    }
    if (!Number.isSafeInteger(offsetA) || offsetA < 0 || !Number.isSafeInteger(offsetB) || offsetB < 0) {
      issues.push(Object.freeze({ line: line + 1, raw: stripped, decodeError: "map_connections-offset-not-non-negative-integer" }));
      continue;
    }
    connections.push(Object.freeze({ mapAId, edgeA, offsetA, mapBId, edgeB, offsetB, raw: stripped, line: line + 1 }));
  }
  return Object.freeze({ connections: Object.freeze(connections), issues: Object.freeze(issues) });
}

function edgeCoord(map, edge) {
  if (edge === "N" || edge === "W") return 0;
  if (edge === "E") return map.width;
  return map.height;
}

function convertConnection(mapA, conn, mapB) {
  const x1 = conn.edgeA === "N" || conn.edgeA === "S" ? conn.offsetA : edgeCoord(mapA, conn.edgeA);
  const y1 = conn.edgeA === "N" || conn.edgeA === "S" ? edgeCoord(mapA, conn.edgeA) : conn.offsetA;
  const x2 = conn.edgeB === "N" || conn.edgeB === "S" ? conn.offsetB : edgeCoord(mapB, conn.edgeB);
  const y2 = conn.edgeB === "N" || conn.edgeB === "S" ? edgeCoord(mapB, conn.edgeB) : conn.offsetB;
  return Object.freeze({ x1, y1, x2, y2 });
}

function inBounds(map, x, y) {
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
}

function land(geometry, sourceId, conn, afterX, afterY) {
  if (sourceId === conn.mapAId) {
    return Object.freeze({
      targetMapId: conn.mapBId,
      targetX: geometry.x2 - geometry.x1 + afterX,
      targetY: geometry.y2 - geometry.y1 + afterY,
    });
  }
  return Object.freeze({
    targetMapId: conn.mapAId,
    targetX: geometry.x1 - geometry.x2 + afterX,
    targetY: geometry.y1 - geometry.y2 + afterY,
  });
}

function borderCandidates(map) {
  const items = [];
  for (let x = 0; x < map.width; x += 1) {
    items.push({ x, y: 0, direction: 8, afterX: x, afterY: -1 });
    items.push({ x, y: map.height - 1, direction: 2, afterX: x, afterY: map.height });
  }
  for (let y = 0; y < map.height; y += 1) {
    items.push({ x: 0, y, direction: 4, afterX: -1, afterY: y });
    items.push({ x: map.width - 1, y, direction: 6, afterX: map.width, afterY: y });
  }
  return items;
}

export function enumerateConnectionOutcomes(conn, maps, tilesets) {
  const mapA = maps.get(conn.mapAId);
  const mapB = maps.get(conn.mapBId);
  const outcomes = [];
  if (!mapA || !mapB) {
    return Object.freeze({
      conn,
      outcomes: Object.freeze([]),
      blocked: Object.freeze([{
        reason: !mapA && !mapB ? "both-maps-missing" : !mapA ? `source-or-mapA-${conn.mapAId}-missing` : `mapB-${conn.mapBId}-missing`,
      }]),
    });
  }
  const geometry = convertConnection(mapA, conn, mapB);
  for (const source of [{ id: conn.mapAId, map: mapA }, { id: conn.mapBId, map: mapB }]) {
    const targetId = source.id === conn.mapAId ? conn.mapBId : conn.mapAId;
    const target = maps.get(targetId);
    const tileset = tilesets.get(target?.tileset_id ?? target?.tilesetId);
    for (const item of borderCandidates(source.map)) {
      const dest = land(geometry, source.id, conn, item.afterX, item.afterY);
      const sourceCell = Object.freeze({ sourceMapId: source.id, sourceX: item.x, sourceY: item.y, direction: item.direction });
      const targetCell = Object.freeze({ targetMapId: dest.targetMapId, targetX: dest.targetX, targetY: dest.targetY });
      if (!inBounds(target, dest.targetX, dest.targetY)) {
        outcomes.push(Object.freeze({
          ...sourceCell,
          ...targetCell,
          verdict: "out-of-target-bounds",
          wouldEmitEdge: false,
          d0: null,
        }));
        continue;
      }
      if (!tileset) {
        outcomes.push(Object.freeze({
          ...sourceCell,
          ...targetCell,
          verdict: "target-tileset-missing",
          wouldEmitEdge: false,
          d0: null,
          completeness: "INCOMPLETE",
        }));
        continue;
      }
      let d0;
      try {
        d0 = projectedD0Passable(target, tileset, dest.targetX, dest.targetY);
      } catch (error) {
        outcomes.push(Object.freeze({
          ...sourceCell,
          ...targetCell,
          verdict: "target-d0-error",
          wouldEmitEdge: false,
          d0: `error:${error instanceof Error ? error.message : String(error)}`,
          completeness: "INCOMPLETE",
        }));
        continue;
      }
      outcomes.push(Object.freeze({
        ...sourceCell,
        ...targetCell,
        verdict: d0 === true ? "expected-edge-if-importer-ran" : "d0-would-drop-on-target-cell",
        wouldEmitEdge: d0 === true,
        d0,
      }));
    }
  }
  return Object.freeze({ conn, geometry, outcomes: Object.freeze(outcomes), blocked: Object.freeze([]) });
}

export function compareExpectedToActualEdges(expectedOutcomes, actualEdges, focusMapId) {
  const actualKeys = new Set((actualEdges ?? []).map((edge) => (
    `${edge.targetMapId ?? focusMapId}:${edge.x},${edge.y},${edge.direction}->${edge.targetMapId ?? "?"}:${edge.targetX},${edge.targetY}`
  )));
  const fromFocus = expectedOutcomes.filter((item) => item.sourceMapId === focusMapId);
  const matched = [];
  const missingExpected = [];
  const droppedByD0 = [];
  const oob = [];
  const incomplete = [];
  for (const item of fromFocus) {
    const key = `${item.sourceMapId}:${item.sourceX},${item.sourceY},${item.direction}->${item.targetMapId}:${item.targetX},${item.targetY}`;
    const present = (actualEdges ?? []).some((edge) => (
      edge.x === item.sourceX && edge.y === item.sourceY && edge.direction === item.direction
      && (edge.targetMapId == null || edge.targetMapId === item.targetMapId)
      && edge.targetX === item.targetX && edge.targetY === item.targetY
    ));
    if (item.verdict === "expected-edge-if-importer-ran") {
      if (present) matched.push(item);
      else missingExpected.push({ ...item, key, status: "expected-but-absent-from-MapTransfer" });
    } else if (item.verdict === "d0-would-drop-on-target-cell") {
      droppedByD0.push({ ...item, present, status: present ? "d0-risk-but-record-exists" : "d0-would-drop-and-record-absent" });
    } else if (item.verdict === "out-of-target-bounds") {
      oob.push(item);
    } else {
      incomplete.push(item);
    }
  }
  return Object.freeze({
    actualEdgeCount: actualEdges?.length ?? 0,
    actualKeys: Object.freeze([...actualKeys]),
    matchedCount: matched.length,
    missingExpected: Object.freeze(missingExpected),
    droppedByD0: Object.freeze(droppedByD0),
    oobCount: oob.length,
    incomplete: Object.freeze(incomplete),
    note: "A missing expected edge is '已证实误删' only when the importer ran, the target map/tileset existed, D0 was the dropping rule, and the record is absent. Potential D0 risk is not that proof.",
  });
}

export function sameCoordinatesDifferentMapsCase({ mapA, mapB, x, y, bridgeOnA, bridgeOnB }) {
  return Object.freeze({
    point: Object.freeze({ x, y }),
    mapA: Object.freeze({ mapId: mapA, hasBridge: bridgeOnA === true }),
    mapB: Object.freeze({ mapId: mapB, hasBridge: bridgeOnB === true }),
    lesson: "targetX/targetY without targetMapId cannot distinguish these cells",
  });
}
