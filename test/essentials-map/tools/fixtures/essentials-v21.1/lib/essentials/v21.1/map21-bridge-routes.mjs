/**
 * Static Map 21 bridge routes. Inputs are cell-by-cell; not a live RGSS run.
 *
 * Onto-bridge always approaches from the Off (land) outer side toward On
 * (deck). Walking from the On/deck side through Off is an exit, not an
 * onto-bridge route.
 */

import { bfsWalk, replayInputs, traceStep } from "./map-route-trace.mjs";
import { selectAlwaysActivePage } from "./vanilla-map-rules.mjs";

const GROUPS = Object.freeze([
  Object.freeze({ id: "south-canal", onId: 25, offId: 23, label: "EV025 On / EV023 Off" }),
  Object.freeze({ id: "mid-south", onId: 22, offId: 20, label: "EV022 On / EV020 Off" }),
  Object.freeze({ id: "mid-north", onId: 10, offId: 7, label: "EV010 On / EV007 Off" }),
  Object.freeze({ id: "north-span", onId: 4, offId: 28, label: "EV004 On / EV028 Off" }),
]);

const REVERSE = Object.freeze({ up: "down", down: "up", left: "right", right: "left" });

function eventById(events, id) {
  return events.find((event) => event.eventId === id);
}

function mean(tiles, axis) {
  return tiles.reduce((sum, tile) => sum + tile[axis], 0) / tiles.length;
}

/**
 * Stand one tile outside Off, facing On. Off is the land-side band.
 */
export function landApproach(onEvent, offEvent) {
  const onX = mean(onEvent.occupiedTiles, "x");
  const onY = mean(onEvent.occupiedTiles, "y");
  const offX = mean(offEvent.occupiedTiles, "x");
  const offY = mean(offEvent.occupiedTiles, "y");
  const dx = onX - offX;
  const dy = onY - offY;
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy > 0) {
      const minY = Math.min(...offEvent.occupiedTiles.map((tile) => tile.y));
      const tile = offEvent.occupiedTiles.find((item) => item.y === minY);
      return Object.freeze({
        x: tile.x,
        y: minY - 1,
        direction: 2,
        input: "down",
        axis: "ns",
        note: "On is south of Off; land is north of Off",
      });
    }
    const maxY = Math.max(...offEvent.occupiedTiles.map((tile) => tile.y));
    const tile = offEvent.occupiedTiles.find((item) => item.y === maxY);
    return Object.freeze({
      x: tile.x,
      y: maxY + 1,
      direction: 8,
      input: "up",
      axis: "ns",
      note: "On is north of Off; land is south of Off",
    });
  }
  if (dx > 0) {
    const minX = Math.min(...offEvent.occupiedTiles.map((tile) => tile.x));
    const tile = offEvent.occupiedTiles.find((item) => item.x === minX);
    return Object.freeze({
      x: minX - 1,
      y: tile.y,
      direction: 6,
      input: "right",
      axis: "ew",
      note: "On is east of Off; land is west of Off",
    });
  }
  const maxX = Math.max(...offEvent.occupiedTiles.map((tile) => tile.x));
  const tile = offEvent.occupiedTiles.find((item) => item.x === maxX);
  return Object.freeze({
    x: maxX + 1,
    y: tile.y,
    direction: 4,
    input: "left",
    axis: "ew",
    note: "On is west of Off; land is east of Off",
  });
}

export function alongOccupiedInputs(event, fromTile) {
  const occupied = new Set((event.occupiedTiles ?? []).map((tile) => `${tile.x},${tile.y}`));
  const inputs = [];
  let x = fromTile.x;
  let y = fromTile.y;
  const seen = new Set([`${x},${y}`]);
  while (seen.size < occupied.size) {
    const neighbors = [
      { x: x + 1, y, input: "right" },
      { x: x - 1, y, input: "left" },
      { x, y: y + 1, input: "down" },
      { x, y: y - 1, input: "up" },
    ].filter((item) => occupied.has(`${item.x},${item.y}`) && !seen.has(`${item.x},${item.y}`));
    if (neighbors.length === 0) break;
    const next = neighbors[0];
    inputs.push(next.input);
    x = next.x;
    y = next.y;
    seen.add(`${x},${y}`);
  }
  return Object.freeze(inputs);
}

function findBlockedInput(context, state) {
  for (const input of ["up", "down", "left", "right"]) {
    const step = traceStep(context, state, input);
    if (step.ok === false || step.kind === "blocked-or-touch") {
      return Object.freeze({ input, step, available: true });
    }
  }
  return Object.freeze({ available: false, reason: "no-blocked-neighbor" });
}

export function landingCellsFromConnectionAudit(connectionAudit, sourceMapId, targetMapId) {
  const landings = [];
  for (const conn of connectionAudit?.perConnection ?? []) {
    const pools = [
      ...(conn.sampleIncoming ?? []),
      ...(conn.sampleExpected ?? []),
    ];
    for (const sample of pools) {
      if (sample.sourceMapId === sourceMapId && sample.targetMapId === targetMapId) {
        landings.push(Object.freeze({
          x: sample.targetX,
          y: sample.targetY,
          from: sample,
        }));
      }
    }
  }
  const uniq = new Map();
  for (const item of landings) uniq.set(`${item.x},${item.y}`, item);
  return Object.freeze([...uniq.values()]);
}

export function buildMap21BridgeRoutes(context, evidence, options = {}) {
  const events = evidence.map.events;
  const landings = landingCellsFromConnectionAudit(evidence.transferAudit?.connectionAudit, 7, 21);
  const startLanding = landings[0] ?? options.forcedLanding;
  const groups = [];
  for (const group of GROUPS) {
    const onEvent = eventById(events, group.onId);
    const offEvent = eventById(events, group.offId);
    if (!onEvent || !offEvent) {
      groups.push(Object.freeze({ ...group, available: false, reason: "event-missing" }));
      continue;
    }
    const enter = landApproach(onEvent, offEvent);
    const ontoInputs = [enter.input, enter.input];
    const offInputs = [REVERSE[enter.input], REVERSE[enter.input]];
    let fromLanding = null;
    if (startLanding) {
      fromLanding = bfsWalk(context, {
        mapId: 21,
        x: startLanding.x,
        y: startLanding.y,
        direction: 8,
        bridgeLevel: 0,
      }, { x: enter.x, y: enter.y }, { maxSteps: 8000 });
    }
    const ontoBridge = replayInputs(context, {
      mapId: 21,
      x: enter.x,
      y: enter.y,
      direction: enter.direction,
      bridgeLevel: 0,
    }, ontoInputs);
    const alongOn = alongOccupiedInputs(onEvent, { x: ontoBridge.final.x, y: ontoBridge.final.y });
    const onBand = replayInputs(context, ontoBridge.final, alongOn);
    const offBridge = replayInputs(context, ontoBridge.final, offInputs);
    const retrace = replayInputs(context, {
      mapId: 21,
      x: enter.x,
      y: enter.y,
      direction: enter.direction,
      bridgeLevel: 0,
    }, [...ontoInputs, ...offInputs]);
    const underInputs = enter.axis === "ns" ? ["left", "left"] : ["up", "up"];
    const under = replayInputs(context, {
      mapId: 21,
      x: enter.x,
      y: enter.y,
      direction: enter.direction,
      bridgeLevel: 0,
    }, underInputs);
    const negative = findBlockedInput(context, {
      mapId: 21,
      x: enter.x,
      y: enter.y,
      direction: enter.direction,
      bridgeLevel: 0,
    });
    groups.push(Object.freeze({
      ...group,
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
      }),
      enter,
      fromMap7Landing: startLanding ? Object.freeze({
        landing: startLanding,
        bfs: fromLanding,
        grade: "STATIC-INFERRED",
        continuous: fromLanding?.found === true,
      }) : Object.freeze({
        landing: null,
        note: "no Map 7→21 expected landing was available from PBS/MapTransfer samples",
      }),
      ontoBridge,
      onBand,
      offBridge,
      retrace,
      underAttempt: under,
      negativeBlocked: negative,
      ontoEndsOnBridge: ontoBridge.final.bridgeLevel === 2,
      offEndsOnLand: offBridge.final.bridgeLevel === 0,
      grade: "STATIC-INFERRED",
      notALiveRun: true,
    }));
  }
  const southEdgeNegative = startLanding
    ? findBlockedInput(context, {
      mapId: 21,
      x: startLanding.x,
      y: startLanding.y,
      direction: 2,
      bridgeLevel: 0,
    })
    : Object.freeze({ available: false, reason: "no-landing" });
  return Object.freeze({
    groups: Object.freeze(groups),
    map7LandingsOnto21: landings,
    southEdgeNegative,
    grade: "STATIC-INFERRED",
    notALiveRun: true,
  });
}
