/**
 * Unified Map7→Map21→tag15→off→Map7 E2E. One state vector. Not RGSS.
 *
 * Segmented BFS/onto/off helpers are probes only. The acceptance object is
 * `unified` from a single replayWorld call starting on a materialized Map7 edge.
 */

import { landApproach, alongOccupiedInputs } from "./map21-bridge-routes.mjs";
import {
  bfsWalkWorld,
  INPUT_BY_DIR,
  replayWorld,
  worldFromMaps,
} from "./map-world-replay.mjs";
import { selectAlwaysActivePage } from "./vanilla-map-rules.mjs";

export const E2E_GROUPS = Object.freeze([
  Object.freeze({ id: "south-canal", onId: 25, offId: 23, label: "EV025 On / EV023 Off" }),
  Object.freeze({ id: "mid-south", onId: 22, offId: 20, label: "EV022 On / EV020 Off" }),
  Object.freeze({ id: "mid-north", onId: 10, offId: 7, label: "EV010 On / EV007 Off" }),
  Object.freeze({ id: "north-span", onId: 4, offId: 28, label: "EV004 On / EV028 Off" }),
]);

const REVERSE = Object.freeze({ up: "down", down: "up", left: "right", right: "left" });

function eventById(events, id) {
  return events.find((event) => event.eventId === id);
}

function materializedEdges(evidence, targetMapId) {
  return (evidence.transferAudit?.actual?.edges ?? []).filter((edge) => edge.targetMapId === targetMapId);
}

function nearestCell(cells, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const cell of cells ?? []) {
    const dist = Math.abs(cell.x - x) + Math.abs(cell.y - y);
    if (dist < bestDist) {
      best = cell;
      bestDist = dist;
    }
  }
  return best;
}

function neighborTag15(cells, x, y) {
  return (cells ?? []).find((cell) => Math.abs(cell.x - x) + Math.abs(cell.y - y) === 1) ?? null;
}

export function countEventCheckpoints(steps, eventId) {
  let starts = 0;
  let executes = 0;
  for (const step of steps) {
    for (const hit of step.startCheckpoint?.started ?? []) {
      if (hit.eventId === eventId && hit.started) starts += 1;
    }
    if (step.executeCheckpoint?.occurred && step.executeCheckpoint.eventId === eventId) executes += 1;
  }
  return Object.freeze({ starts, executes });
}

export function buildWorldFromEvidence({ map7, map21, context7, context21 }) {
  return worldFromMaps([
    {
      mapId: 7,
      context: context7,
      edges: map7.transferAudit?.actual?.edges ?? [],
      bridgeCells: map7.bridgeTerrain?.cells ?? [],
    },
    {
      mapId: 21,
      context: context21,
      edges: map21.transferAudit?.actual?.edges ?? [],
      bridgeCells: map21.bridgeTerrain?.cells ?? [],
    },
  ]);
}

function failGroup(groupSpec, reason, extra = {}) {
  return Object.freeze({
    ...groupSpec,
    available: false,
    reason,
    grade: extra.grade ?? "INCOMPLETE",
    notALiveRun: true,
    ...extra,
  });
}

export function buildMap21E2eGroup(world, map7, map21, groupSpec) {
  const events = world.byMapId[21]?.context.events ?? map21.map?.events ?? [];
  const onEvent = eventById(events, groupSpec.onId);
  const offEvent = eventById(events, groupSpec.offId);
  if (!onEvent || !offEvent) return failGroup(groupSpec, "event-missing");
  const outbound = materializedEdges(map7, 21);
  const inbound = materializedEdges(map21, 7);
  if (outbound.length === 0) {
    return failGroup(groupSpec, "no-materialized-map7-to-21-edge", {
      note: "PBS sampleIncoming is not a substitute for MapTransfer/7.json edges",
      outboundEdges: outbound,
    });
  }
  const enter = landApproach(onEvent, offEvent);
  const bridgeCells = world.byMapId[21].bridgeCells;
  let chosen = null;
  for (const edge of outbound) {
    const start = {
      mapId: 7,
      x: edge.x,
      y: edge.y,
      direction: edge.direction,
      bridgeLevel: 0,
      pendingExecute: null,
      interpreterBusy: false,
      nextInputAvailable: true,
      motion: "idle",
    };
    const afterTransfer = replayWorld(world, start, [INPUT_BY_DIR[edge.direction] ?? "up"], { forbidTransfer: false });
    if (afterTransfer.final.mapId !== 21) continue;
    const toEnter = bfsWalkWorld(world, afterTransfer.final, { mapId: 21, x: enter.x, y: enter.y }, {
      forbidTransfer: true,
    });
    if (!toEnter.found) continue;
    chosen = { edge, start, afterTransfer, toEnter };
    break;
  }
  if (!chosen) {
    return failGroup(groupSpec, "no-walk-path-from-materialized-landing-to-land-approach", {
      outboundEdges: outbound,
      enter,
      grade: "STATIC-INFERRED",
    });
  }

  const ontoInputs = [enter.input, enter.input];
  const afterOnto = replayWorld(world, chosen.afterTransfer.final, [...chosen.toEnter.inputs, ...ontoInputs], { forbidTransfer: true });
  if (afterOnto.final.bridgeLevel !== 2) {
    return failGroup(groupSpec, "onto-bridge-did-not-end-at-bridgeLevel-2", {
      enter,
      final: afterOnto.final,
      grade: "STATIC-INFERRED",
    });
  }

  const along = alongOccupiedInputs(onEvent, { x: afterOnto.final.x, y: afterOnto.final.y });
  const afterAlong = replayWorld(world, afterOnto.final, along, { forbidTransfer: true });
  const tag15 = nearestCell(bridgeCells, afterAlong.final.x, afterAlong.final.y);
  if (!tag15) return failGroup(groupSpec, "no-tag15-cell-on-map-21");
  const toDeck = bfsWalkWorld(world, afterAlong.final, { mapId: 21, x: tag15.x, y: tag15.y }, { forbidTransfer: true });
  if (!toDeck.found) {
    return failGroup(groupSpec, "tag15-cell-unreachable-at-current-bridgeLevel", {
      tag15,
      from: afterAlong.final,
      grade: "STATIC-INFERRED",
    });
  }
  const afterToDeck = replayWorld(world, afterAlong.final, toDeck.inputs, { forbidTransfer: true });
  const extra = neighborTag15(bridgeCells, afterToDeck.final.x, afterToDeck.final.y);
  const extraSearch = extra
    ? bfsWalkWorld(world, afterToDeck.final, { mapId: 21, x: extra.x, y: extra.y }, { forbidTransfer: true })
    : { found: false, inputs: [] };
  const extraInputs = extraSearch.found === true ? extraSearch.inputs : [];
  const afterDeck = extraInputs.length > 0
    ? replayWorld(world, afterToDeck.final, extraInputs, { forbidTransfer: true })
    : afterToDeck;

  const toOn = bfsWalkWorld(world, afterDeck.final, { mapId: 21, x: afterOnto.final.x, y: afterOnto.final.y }, { forbidTransfer: true });
  if (!toOn.found) {
    return failGroup(groupSpec, "cannot-return-from-deck-to-on-tile", {
      onTile: { x: afterOnto.final.x, y: afterOnto.final.y },
      from: afterDeck.final,
      grade: "STATIC-INFERRED",
    });
  }
  const offInputs = [REVERSE[enter.input], REVERSE[enter.input]];
  const afterOff = replayWorld(world, afterDeck.final, [...toOn.inputs, ...offInputs], { forbidTransfer: true });
  if (afterOff.final.bridgeLevel !== 0) {
    return failGroup(groupSpec, "retrace-off-did-not-clear-bridgeLevel", {
      final: afterOff.final,
      grade: "STATIC-INFERRED",
    });
  }

  const returnEdge = inbound.find((edge) => edge.x === chosen.edge.targetX && edge.y === chosen.edge.targetY)
    ?? inbound[0];
  if (!returnEdge) return failGroup(groupSpec, "no-materialized-map21-to-7-edge");
  const toBorder = bfsWalkWorld(world, afterOff.final, { mapId: 21, x: returnEdge.x, y: returnEdge.y }, {
    forbidTransfer: true,
  });
  if (!toBorder.found) {
    return failGroup(groupSpec, "cannot-return-to-map21-border-from-land", {
      returnEdge,
      from: afterOff.final,
      grade: "STATIC-INFERRED",
    });
  }

  const userInputs = [
    INPUT_BY_DIR[chosen.edge.direction] ?? "up",
    ...chosen.toEnter.inputs,
    ...ontoInputs,
    ...along,
    ...toDeck.inputs,
    ...extraInputs,
    ...toOn.inputs,
    ...offInputs,
    ...toBorder.inputs,
    INPUT_BY_DIR[returnEdge.direction] ?? "down",
  ];
  const unified = replayWorld(world, chosen.start, userInputs, { forbidTransfer: false });
  const onCounts = countEventCheckpoints(unified.steps, onEvent.eventId);
  const offCounts = countEventCheckpoints(unified.steps, offEvent.eventId);
  const transferOut = unified.steps.filter((step) => step.kind === "transfer" && step.transfer?.targetMapId === 21);
  const transferBack = unified.steps.filter((step) => step.kind === "transfer" && step.transfer?.targetMapId === 7);
  const walkedTag15 = unified.steps.some((step) => (
    step.kind === "walk"
    && step.actual.mapId === 21
    && step.actual.bridgeLevel === 2
    && bridgeCells.some((cell) => cell.x === step.actual.x && cell.y === step.actual.y)
  ));
  const startMarkedExecute = unified.steps.some((step) => (
    (step.startCheckpoint?.started ?? []).some((hit) => hit.execute === true)
  ));
  const maxBridge = Math.max(0, ...unified.steps.map((step) => step.actual?.bridgeLevel ?? 0));
  const executeAfterStart = unified.steps.every((step, index) => {
    if (step.kind !== "interpreter-execute" || step.executeCheckpoint?.occurred !== true) return true;
    const pendingFrom = step.from?.pendingExecute?.eventId === step.executeCheckpoint.eventId;
    const priorStart = unified.steps.slice(0, index).some((prior) => (
      (prior.startCheckpoint?.started ?? []).some((hit) => hit.started && hit.eventId === step.executeCheckpoint.eventId)
    ));
    return pendingFrom || priorStart;
  });

  return Object.freeze({
    ...groupSpec,
    available: true,
    onEvent: Object.freeze({
      id: onEvent.eventId,
      origin: { x: onEvent.x, y: onEvent.y },
      occupied: onEvent.occupiedTiles,
      page: selectAlwaysActivePage(onEvent)?.pageIndex,
    }),
    offEvent: Object.freeze({
      id: offEvent.eventId,
      origin: { x: offEvent.x, y: offEvent.y },
      occupied: offEvent.occupiedTiles,
      page: selectAlwaysActivePage(offEvent)?.pageIndex,
    }),
    enter,
    materializedOutbound: chosen.edge,
    materializedReturn: returnEdge,
    tag15,
    extraTag15: extra,
    userInputs: Object.freeze(userInputs),
    ontoInputs: Object.freeze(ontoInputs),
    offInputs: Object.freeze(offInputs),
    ontoInputIndex: 1 + chosen.toEnter.inputs.length,
    unified,
    onCounts,
    offCounts,
    transferOutCount: transferOut.length,
    transferBackCount: transferBack.length,
    walkedTag15,
    maxBridge,
    ontoEndsOnBridge: maxBridge === 2,
    returnedToMap7: unified.final.mapId === 7,
    returnedBridgeCleared: unified.final.mapId === 7 && unified.final.bridgeLevel === 0,
    continuous: unified.continuous,
    startMarkedExecute,
    executeAfterStart,
    startSeparateFromExecute: startMarkedExecute === false && executeAfterStart === true,
    grade: "STATIC-INFERRED",
    notALiveRun: true,
  });
}

export function buildMap21E2eTraces(world, map7, map21) {
  const groups = E2E_GROUPS.map((spec) => buildMap21E2eGroup(world, map7, map21, spec));
  return Object.freeze({
    groups: Object.freeze(groups),
    materializedOutbound: materializedEdges(map7, 21),
    materializedReturn: materializedEdges(map21, 7),
    allAvailable: groups.every((group) => group.available === true),
    grade: "STATIC-INFERRED",
    notALiveRun: true,
  });
}

export function heldInputOnBand(world, afterOnto, onEvent, repeats = 3) {
  const tiles = onEvent.occupiedTiles ?? [];
  if (tiles.length < 2) {
    return replayWorld(world, afterOnto, Array.from({ length: repeats }, () => "up"), { forbidTransfer: true });
  }
  const axis = tiles.every((tile) => tile.x === tiles[0].x) ? "ns" : "ew";
  const input = axis === "ns" ? "down" : "right";
  return replayWorld(world, afterOnto, Array.from({ length: repeats }, () => input), { forbidTransfer: true });
}
