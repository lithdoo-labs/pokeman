/**
 * Static cell-by-cell route tracing for terrain forensics.
 * Every step is STATIC-INFERRED unless marked otherwise. This is not an RGSS run.
 */

import {
  characterCanLeaveTile,
  eventsOccupying,
  facingTerrainTag,
  hereVersusTouch,
  inferBridgeScriptDelta,
  ledgeJumpForward2,
  mapPassableForPlayer,
  offsetForDirection,
  overTriggerForEvent,
  selectAlwaysActivePage,
} from "./vanilla-map-rules.mjs";

const DIR = Object.freeze({ down: 2, left: 4, right: 6, up: 8 });

export function directionFromInput(input) {
  if (typeof input === "number") return input;
  return DIR[input] ?? null;
}

function occupyHits(context, x, y) {
  return eventsOccupying(context.events, x, y).map((event) => {
    const page = selectAlwaysActivePage(event);
    const over = overTriggerForEvent(context, event, { page, bridgeLevel: context.bridgeLevel, pageOf: selectAlwaysActivePage });
    const branch = hereVersusTouch(over.overTrigger, page);
    const start = page && (page.trigger === 1 || page.trigger === 2)
      && ((branch.branch === "here" && over.overTrigger === true) || (branch.branch === "touch" && over.overTrigger === false));
    return Object.freeze({
      eventId: event.eventId,
      name: event.name,
      overTrigger: over.overTrigger,
      overTriggerGrade: over.grade,
      branch: branch.branch,
      wouldStart: start === true,
      listSize: page?.commands?.length ?? 0,
      startFlagRule: "Game_Event#start sets @starting if @list.size > 1; interpreter execute is a later step",
      scriptDelta: page ? inferBridgeScriptDelta(page) : null,
    });
  });
}

function applyStarts(hits, bridgeLevel, interpreterBusy) {
  const started = [];
  let nextLevel = bridgeLevel;
  let busy = interpreterBusy;
  let nextInputAvailable = true;
  for (const hit of hits) {
    if (!hit.wouldStart) continue;
    if (busy) {
      started.push(Object.freeze({ ...hit, started: false, execute: false, reason: "interpreter-already-running" }));
      continue;
    }
    const canStart = (hit.listSize ?? 0) > 1;
    const execute = canStart;
    if (execute && hit.scriptDelta?.nextBridgeLevel != null) nextLevel = hit.scriptDelta.nextBridgeLevel;
    busy = execute;
    nextInputAvailable = !execute;
    started.push(Object.freeze({
      ...hit,
      started: canStart,
      execute,
      executeGrade: "STATIC-INFERRED",
      reason: canStart ? "list-size-gt-1" : "empty-list-start-noop",
    }));
    busy = false;
    nextInputAvailable = true;
  }
  return Object.freeze({
    started: Object.freeze(started),
    bridgeLevel: nextLevel,
    interpreterBusy: false,
    nextInputAvailable,
    note: "Short pbBridgeOn/Off scripts are inferred to finish before the next step; this is not a frame-accurate interpreter log.",
  });
}

export function traceStep(context, state, input) {
  const direction = directionFromInput(input);
  const from = Object.freeze({
    mapId: state.mapId,
    x: state.x,
    y: state.y,
    direction: state.direction,
    bridgeLevel: state.bridgeLevel,
  });
  if (direction == null) {
    return Object.freeze({
      ok: false,
      from,
      input,
      error: "unknown-input",
      grade: "INCOMPLETE",
    });
  }
  const options = { bridgeLevel: state.bridgeLevel, pageOf: selectAlwaysActivePage };
  const sourcePassable = mapPassableForPlayer(context, state.x, state.y, direction, options);
  const { dx, dy } = offsetForDirection(direction);
  const destX = state.x + dx;
  const destY = state.y + dy;
  const destPassable = mapPassableForPlayer(context, destX, destY, 10 - direction, options);
  const canMove = characterCanLeaveTile(context, state.x, state.y, direction, options);
  const facing = facingTerrainTag(context, state.x, state.y, direction, options);

  if (canMove.passable && facing.tag?.ledge === true) {
    const jump = ledgeJumpForward2(context, state.x, state.y, direction, options);
    const next = jump.jumped
      ? { x: jump.landing.x, y: jump.landing.y, direction, bridgeLevel: state.bridgeLevel }
      : { x: state.x, y: state.y, direction, bridgeLevel: state.bridgeLevel };
    const hits = jump.jumped ? occupyHits({ ...context, bridgeLevel: state.bridgeLevel }, next.x, next.y) : occupyHits({ ...context, bridgeLevel: state.bridgeLevel }, destX, destY);
    const after = applyStarts(hits.filter((hit) => hit.branch === "here"), state.bridgeLevel, false);
    return Object.freeze({
      ok: jump.jumped,
      kind: "ledge-jump",
      from,
      input,
      direction,
      sourcePassable,
      destPassable,
      canMove,
      facing,
      jump,
      midSkipped: jump.mid,
      actual: Object.freeze({ mapId: state.mapId, x: next.x, y: next.y, direction, bridgeLevel: after.bridgeLevel }),
      occupancy: Object.freeze(hits),
      starts: after,
      nextInputAvailable: after.nextInputAvailable,
      transfer: null,
      grade: "STATIC-INFERRED",
    });
  }

  if (!canMove.passable) {
    const frontHits = occupyHits({ ...context, bridgeLevel: state.bridgeLevel }, destX, destY)
      .map((hit) => Object.freeze({ ...hit, wouldStart: hit.branch === "touch" && hit.overTrigger === false && (hit.wouldStart || hit.branch === "touch") }));
    const touchHits = frontHits.filter((hit) => hit.branch === "touch");
    const after = applyStarts(touchHits, state.bridgeLevel, false);
    return Object.freeze({
      ok: false,
      kind: "blocked-or-touch",
      from,
      input,
      direction,
      sourcePassable,
      destPassable,
      canMove,
      facing,
      actual: Object.freeze({ mapId: state.mapId, x: state.x, y: state.y, direction, bridgeLevel: after.bridgeLevel }),
      occupancy: Object.freeze(frontHits),
      starts: after,
      nextInputAvailable: after.nextInputAvailable,
      transfer: null,
      grade: "STATIC-INFERRED",
    });
  }

  const nextX = destX;
  const nextY = destY;
  const hits = occupyHits({ ...context, bridgeLevel: state.bridgeLevel }, nextX, nextY);
  const hereHits = hits.filter((hit) => hit.branch === "here");
  const after = applyStarts(hereHits, state.bridgeLevel, false);
  return Object.freeze({
    ok: true,
    kind: "walk",
    from,
    input,
    direction,
    sourcePassable,
    destPassable,
    canMove,
    facing,
    actual: Object.freeze({ mapId: state.mapId, x: nextX, y: nextY, direction, bridgeLevel: after.bridgeLevel }),
    occupancy: Object.freeze(hits),
    starts: after,
    nextInputAvailable: after.nextInputAvailable,
    transfer: null,
    grade: "STATIC-INFERRED",
  });
}

export function replayInputs(context, start, inputs) {
  const steps = [];
  let state = {
    mapId: start.mapId,
    x: start.x,
    y: start.y,
    direction: start.direction ?? 2,
    bridgeLevel: start.bridgeLevel ?? 0,
  };
  for (let index = 0; index < inputs.length; index += 1) {
    const step = traceStep(context, state, inputs[index]);
    steps.push(Object.freeze({ stepIndex: index, ...step }));
    if (step.actual) {
      state = {
        mapId: state.mapId,
        x: step.actual.x,
        y: step.actual.y,
        direction: step.actual.direction,
        bridgeLevel: step.actual.bridgeLevel,
      };
    }
    if (step.ok === false && step.kind !== "blocked-or-touch") break;
  }
  return Object.freeze({
    start: Object.freeze(start),
    inputs: Object.freeze([...inputs]),
    steps: Object.freeze(steps),
    final: Object.freeze(state),
    continuous: steps.every((step, index) => {
      if (index === 0) return true;
      const prev = steps[index - 1].actual;
      const from = step.from;
      return prev && from && prev.x === from.x && prev.y === from.y && prev.mapId === from.mapId;
    }),
    grade: "STATIC-INFERRED",
    notALiveRun: true,
  });
}

export function bfsWalk(context, start, goal, options = {}) {
  const maxSteps = options.maxSteps ?? 4000;
  const keyOf = (x, y, bridgeLevel) => `${x},${y},${bridgeLevel}`;
  const queue = [{ x: start.x, y: start.y, bridgeLevel: start.bridgeLevel ?? 0, direction: start.direction ?? 2, path: [] }];
  const seen = new Set([keyOf(start.x, start.y, start.bridgeLevel ?? 0)]);
  let visited = 0;
  while (queue.length > 0 && visited < maxSteps) {
    const node = queue.shift();
    visited += 1;
    if (node.x === goal.x && node.y === goal.y && (goal.bridgeLevel == null || node.bridgeLevel === goal.bridgeLevel)) {
      return Object.freeze({ found: true, inputs: Object.freeze(node.path), visited, final: Object.freeze(node) });
    }
    for (const input of ["up", "down", "left", "right"]) {
      const step = traceStep(context, node, input);
      if (!step.ok || !step.actual) continue;
      const key = keyOf(step.actual.x, step.actual.y, step.actual.bridgeLevel);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({
        x: step.actual.x,
        y: step.actual.y,
        bridgeLevel: step.actual.bridgeLevel,
        direction: step.actual.direction,
        path: [...node.path, input],
      });
    }
  }
  return Object.freeze({ found: false, inputs: Object.freeze([]), visited, seen: seen.size });
}

export function assertContinuousCells(steps) {
  for (let index = 1; index < steps.length; index += 1) {
    const prev = steps[index - 1];
    const cur = steps[index];
    if (prev.actual.x !== cur.from.x || prev.actual.y !== cur.from.y || prev.actual.mapId !== cur.from.mapId) {
      return false;
    }
  }
  return true;
}
