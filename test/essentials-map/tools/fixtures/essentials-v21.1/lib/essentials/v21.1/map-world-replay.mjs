/**
 * Multi-map static replay. One state vector is kept across walk, transfer,
 * event start, and a later interpreter-execute checkpoint.
 *
 * This is STATIC-INFERRED. It is not RGSS and not a gameplay runtime.
 * transfer_player → pbBridgeOff is SOURCE-PROVEN; execute timing is a
 * STATIC-ASSUMPTION for short Wait-free pbBridgeOn/Off scripts.
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

export const DIR = Object.freeze({ down: 2, left: 4, right: 6, up: 8 });
export const INPUT_BY_DIR = Object.freeze({ 2: "down", 4: "left", 6: "right", 8: "up" });

export function directionFromInput(input) {
  if (typeof input === "number") return input;
  return DIR[input] ?? null;
}

export function cloneState(state) {
  return {
    mapId: state.mapId,
    x: state.x,
    y: state.y,
    direction: state.direction,
    bridgeLevel: state.bridgeLevel ?? 0,
    pendingExecute: state.pendingExecute ? { ...state.pendingExecute } : null,
    interpreterBusy: state.interpreterBusy === true,
    nextInputAvailable: state.nextInputAvailable !== false,
    motion: state.motion ?? "idle",
  };
}

export function lookupEdge(edges, x, y, direction) {
  return (edges ?? []).find((edge) => edge.x === x && edge.y === y && edge.direction === direction) ?? null;
}

export function occupyHits(context, x, y, bridgeLevel) {
  return eventsOccupying(context.events, x, y).map((event) => {
    const page = selectAlwaysActivePage(event);
    const over = overTriggerForEvent(context, event, { page, bridgeLevel, pageOf: selectAlwaysActivePage });
    const branch = hereVersusTouch(over.overTrigger, page);
    const start = page && (page.trigger === 1 || page.trigger === 2)
      && ((branch.branch === "here" && over.overTrigger === true) || (branch.branch === "touch" && over.overTrigger === false));
    return Object.freeze({
      eventId: event.eventId,
      name: event.name,
      pageIndex: page?.pageIndex ?? null,
      overTrigger: over.overTrigger,
      overTriggerGrade: over.grade,
      branch: branch.branch,
      wouldStart: start === true,
      listSize: page?.commands?.length ?? 0,
      scriptDelta: page ? inferBridgeScriptDelta(page) : null,
    });
  });
}

function startCheckpoint(hits) {
  const started = [];
  let pendingExecute = null;
  for (const hit of hits) {
    if (!hit.wouldStart) continue;
    const canStart = (hit.listSize ?? 0) > 1;
    started.push(Object.freeze({
      ...hit,
      checkpoint: "start",
      started: canStart,
      execute: false,
      executeGrade: null,
      startFlagRule: "Game_Event#start sets @starting if @list.size > 1; execute is a later interpreter step",
    }));
    if (canStart && pendingExecute == null && hit.scriptDelta?.nextBridgeLevel != null) {
      pendingExecute = Object.freeze({
        eventId: hit.eventId,
        name: hit.name,
        op: hit.scriptDelta.kind,
        nextBridgeLevel: hit.scriptDelta.nextBridgeLevel,
      });
    }
  }
  return Object.freeze({
    started: Object.freeze(started),
    pendingExecute,
    nextInputAvailable: pendingExecute == null,
    interpreterBusy: pendingExecute != null,
  });
}

export function interpreterTick(state) {
  const from = cloneState(state);
  if (state.pendingExecute == null) {
    const actual = cloneState(state);
    actual.motion = "idle";
    actual.nextInputAvailable = true;
    actual.interpreterBusy = false;
    return Object.freeze({
      ok: true,
      kind: "interpreter-execute",
      from,
      input: "interpreter-tick",
      executeCheckpoint: Object.freeze({ occurred: false, reason: "no-pending-execute", grade: "STATIC-INFERRED" }),
      startCheckpoint: Object.freeze({ started: [] }),
      actual,
      transfer: null,
      nextInputAvailable: true,
      grade: "STATIC-INFERRED",
      notALiveRun: true,
    });
  }
  const pending = state.pendingExecute;
  const actual = cloneState(state);
  actual.bridgeLevel = pending.nextBridgeLevel;
  actual.pendingExecute = null;
  actual.interpreterBusy = false;
  actual.nextInputAvailable = true;
  actual.motion = "idle";
  return Object.freeze({
    ok: true,
    kind: "interpreter-execute",
    from,
    input: "interpreter-tick",
    executeCheckpoint: Object.freeze({
      occurred: true,
      eventId: pending.eventId,
      name: pending.name,
      op: pending.op,
      bridgeLevelBefore: from.bridgeLevel,
      bridgeLevelAfter: pending.nextBridgeLevel,
      grade: "STATIC-ASSUMPTION",
      note: "Wait-free pbBridgeOn/Off is assumed to finish before the next directional input because pbMapInterpreterRunning? blocks Game_Player. Not a frame log.",
    }),
    startCheckpoint: Object.freeze({ started: [] }),
    actual,
    transfer: null,
    occupancy: Object.freeze([]),
    nextInputAvailable: true,
    grade: "STATIC-ASSUMPTION",
    notALiveRun: true,
  });
}

function contextOf(world, mapId) {
  return world.byMapId[mapId] ?? world.byMapId[String(mapId)] ?? null;
}

export function traceWorldStep(world, state, input, flags = {}) {
  const from = cloneState(state);
  if (input === "interpreter-tick") return interpreterTick(state);
  const direction = directionFromInput(input);
  if (direction == null) {
    return Object.freeze({
      ok: false,
      kind: "unknown-input",
      from,
      input,
      error: "unknown-input",
      actual: from,
      transfer: null,
      grade: "INCOMPLETE",
      notALiveRun: true,
    });
  }
  const current = contextOf(world, state.mapId);
  if (!current) {
    return Object.freeze({
      ok: false,
      kind: "missing-map",
      from,
      input,
      error: `map-${state.mapId}-not-in-world`,
      actual: from,
      transfer: null,
      grade: "INCOMPLETE",
      notALiveRun: true,
    });
  }
  const options = { bridgeLevel: state.bridgeLevel, pageOf: selectAlwaysActivePage };
  const { dx, dy } = offsetForDirection(direction);
  const destX = state.x + dx;
  const destY = state.y + dy;
  const outOfMap = destX < 0 || destY < 0 || destX >= current.context.width || destY >= current.context.height;
  const edge = lookupEdge(current.edges, state.x, state.y, direction);

  if (outOfMap) {
    if (flags.forbidTransfer === true || edge == null) {
      return Object.freeze({
        ok: false,
        kind: "blocked-or-touch",
        from,
        input,
        direction,
        reason: edge == null ? "out-of-map-without-materialized-edge" : "transfer-forbidden-in-this-search",
        actual: Object.freeze({ ...cloneState(state), direction, motion: "blocked" }),
        occupancy: Object.freeze([]),
        startCheckpoint: Object.freeze({ started: [] }),
        transfer: null,
        nextInputAvailable: true,
        grade: "STATIC-INFERRED",
        notALiveRun: true,
      });
    }
    const target = contextOf(world, edge.targetMapId);
    if (!target) {
      return Object.freeze({
        ok: false,
        kind: "transfer-missing-target-map",
        from,
        input,
        direction,
        transfer: Object.freeze({
          sourceMapId: state.mapId,
          sourceX: state.x,
          sourceY: state.y,
          direction,
          targetMapId: edge.targetMapId,
          targetX: edge.targetX,
          targetY: edge.targetY,
        }),
        actual: Object.freeze({ ...cloneState(state), direction, motion: "blocked" }),
        grade: "INCOMPLETE",
        notALiveRun: true,
      });
    }
    const landingHits = occupyHits(target.context, edge.targetX, edge.targetY, 0);
    const starts = startCheckpoint(landingHits.filter((hit) => hit.branch === "here"));
    const actual = Object.freeze({
      mapId: edge.targetMapId,
      x: edge.targetX,
      y: edge.targetY,
      direction,
      bridgeLevel: 0,
      pendingExecute: starts.pendingExecute,
      interpreterBusy: starts.interpreterBusy,
      nextInputAvailable: starts.nextInputAvailable,
      motion: "transfer",
    });
    return Object.freeze({
      ok: true,
      kind: "transfer",
      from,
      input,
      direction,
      sourcePassable: mapPassableForPlayer(current.context, state.x, state.y, direction, options),
      destPassable: null,
      occupancy: Object.freeze(landingHits),
      startCheckpoint: starts,
      executeCheckpoint: Object.freeze({ occurred: false, note: "execute is a later interpreter-tick" }),
      actual,
      transfer: Object.freeze({
        sourceMapId: state.mapId,
        sourceX: state.x,
        sourceY: state.y,
        direction,
        targetMapId: edge.targetMapId,
        targetX: edge.targetX,
        targetY: edge.targetY,
        bridgeLevelAfter: 0,
        rule: "Scene_Map#transfer_player always pbBridgeOff; SOURCE-PROVEN",
      }),
      nextInputAvailable: starts.nextInputAvailable,
      grade: "STATIC-INFERRED",
      notALiveRun: true,
    });
  }

  const canMove = characterCanLeaveTile(current.context, state.x, state.y, direction, options);
  const facing = facingTerrainTag(current.context, state.x, state.y, direction, options);
  const sourcePassable = mapPassableForPlayer(current.context, state.x, state.y, direction, options);
  const destPassable = mapPassableForPlayer(current.context, destX, destY, 10 - direction, options);

  if (flags.allowLedgeJump === true && canMove.passable && facing.tag?.ledge === true) {
    const jump = ledgeJumpForward2(current.context, state.x, state.y, direction, options);
    const nextX = jump.jumped ? jump.landing.x : state.x;
    const nextY = jump.jumped ? jump.landing.y : state.y;
    const hits = occupyHits(current.context, nextX, nextY, state.bridgeLevel);
    const starts = startCheckpoint(hits.filter((hit) => hit.branch === "here"));
    const actual = Object.freeze({
      ...cloneState(state),
      x: nextX,
      y: nextY,
      direction,
      pendingExecute: starts.pendingExecute,
      interpreterBusy: starts.interpreterBusy,
      nextInputAvailable: starts.nextInputAvailable,
      motion: jump.jumped ? "ledge-jump" : "blocked",
    });
    return Object.freeze({
      ok: jump.jumped,
      kind: "ledge-jump",
      from,
      input,
      direction,
      jump,
      sourcePassable,
      destPassable,
      occupancy: Object.freeze(hits),
      startCheckpoint: starts,
      executeCheckpoint: Object.freeze({ occurred: false, note: "execute is a later interpreter-tick" }),
      actual,
      transfer: null,
      nextInputAvailable: starts.nextInputAvailable,
      grade: "STATIC-INFERRED",
      notALiveRun: true,
    });
  }

  if (!canMove.passable) {
    const frontHits = occupyHits(current.context, destX, destY, state.bridgeLevel);
    const touchHits = frontHits.filter((hit) => hit.branch === "touch");
    const starts = startCheckpoint(touchHits);
    const actual = Object.freeze({
      ...cloneState(state),
      direction,
      pendingExecute: starts.pendingExecute ?? state.pendingExecute,
      interpreterBusy: starts.interpreterBusy || state.interpreterBusy,
      nextInputAvailable: starts.pendingExecute ? false : state.nextInputAvailable,
      motion: "blocked",
    });
    return Object.freeze({
      ok: false,
      kind: "blocked-or-touch",
      from,
      input,
      direction,
      sourcePassable,
      destPassable,
      canMove,
      occupancy: Object.freeze(frontHits),
      startCheckpoint: starts,
      executeCheckpoint: Object.freeze({ occurred: false }),
      actual,
      transfer: null,
      nextInputAvailable: actual.nextInputAvailable,
      grade: "STATIC-INFERRED",
      notALiveRun: true,
    });
  }

  const hits = occupyHits(current.context, destX, destY, state.bridgeLevel);
  const starts = startCheckpoint(hits.filter((hit) => hit.branch === "here"));
  const actual = Object.freeze({
    mapId: state.mapId,
    x: destX,
    y: destY,
    direction,
    bridgeLevel: state.bridgeLevel,
    pendingExecute: starts.pendingExecute,
    interpreterBusy: starts.interpreterBusy,
    nextInputAvailable: starts.nextInputAvailable,
    motion: "walk",
  });
  return Object.freeze({
    ok: true,
    kind: "walk",
    from,
    input,
    direction,
    sourcePassable,
    destPassable,
    canMove,
    occupancy: Object.freeze(hits),
    startCheckpoint: starts,
    executeCheckpoint: Object.freeze({ occurred: false, note: "execute is a later interpreter-tick" }),
    actual,
    transfer: null,
    nextInputAvailable: starts.nextInputAvailable,
    grade: "STATIC-INFERRED",
    notALiveRun: true,
  });
}

export function advance(world, state, input, flags = {}) {
  const steps = [];
  let current = cloneState(state);
  if (current.pendingExecute && input !== "interpreter-tick") {
    const tick = interpreterTick(current);
    steps.push(tick);
    current = cloneState(tick.actual);
  }
  const step = traceWorldStep(world, current, input, flags);
  steps.push(step);
  return Object.freeze({
    steps: Object.freeze(steps),
    actual: cloneState(step.actual),
    ok: step.ok === true || step.kind === "interpreter-execute" || step.kind === "blocked-or-touch",
  });
}

export function replayWorld(world, start, inputs, flags = {}) {
  const steps = [];
  let state = cloneState(start);
  for (let index = 0; index < inputs.length; index += 1) {
    const advanced = advance(world, state, inputs[index], flags);
    for (const step of advanced.steps) {
      steps.push(Object.freeze({ stepIndex: steps.length, ...step }));
    }
    state = advanced.actual;
    if (advanced.ok === false && flags.stopOnBlock === true) break;
  }
  while (state.pendingExecute) {
    const tick = interpreterTick(state);
    steps.push(Object.freeze({ stepIndex: steps.length, ...tick }));
    state = cloneState(tick.actual);
  }
  const continuous = steps.every((step, index) => {
    if (index === 0) return true;
    const prev = steps[index - 1].actual;
    const from = step.from;
    return prev
      && from
      && prev.mapId === from.mapId
      && prev.x === from.x
      && prev.y === from.y
      && prev.direction === from.direction
      && prev.bridgeLevel === from.bridgeLevel;
  });
  return Object.freeze({
    start: Object.freeze(cloneState(start)),
    inputs: Object.freeze([...inputs]),
    steps: Object.freeze(steps),
    final: Object.freeze(state),
    continuous,
    grade: "STATIC-INFERRED",
    notALiveRun: true,
  });
}

export function bfsWalkWorld(world, start, goal, flags = {}) {
  const maxSteps = flags.maxSteps ?? 20000;
  const keyOf = (state) => `${state.mapId},${state.x},${state.y},${state.bridgeLevel},${state.pendingExecute ? state.pendingExecute.eventId : "-"}`;
  const queue = [{ state: cloneState(start), path: [] }];
  const seen = new Set([keyOf(start)]);
  let visited = 0;
  while (queue.length > 0 && visited < maxSteps) {
    const node = queue.shift();
    visited += 1;
    if (node.state.mapId === (goal.mapId ?? node.state.mapId) && node.state.x === goal.x && node.state.y === goal.y) {
      if (goal.bridgeLevel == null || node.state.bridgeLevel === goal.bridgeLevel) {
        return Object.freeze({ found: true, inputs: Object.freeze(node.path), visited, final: cloneState(node.state) });
      }
    }
    for (const input of ["up", "down", "left", "right"]) {
      const advanced = advance(world, node.state, input, {
        allowLedgeJump: false,
        forbidTransfer: flags.forbidTransfer !== false,
      });
      const move = advanced.steps[advanced.steps.length - 1];
      if (!move || move.kind !== "walk" || move.ok !== true) continue;
      if (flags.forbidEventStart === true) {
        const started = (move.startCheckpoint?.started ?? []).some((hit) => hit.started === true);
        if (started) continue;
      }
      const next = advanced.actual;
      const key = keyOf(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ state: next, path: [...node.path, input] });
    }
  }
  return Object.freeze({ found: false, inputs: Object.freeze([]), visited, seen: seen.size });
}

export function worldFromMaps(entries) {
  const byMapId = {};
  for (const entry of entries) {
    byMapId[entry.mapId] = Object.freeze({
      mapId: entry.mapId,
      context: entry.context,
      edges: Object.freeze([...(entry.edges ?? [])]),
      bridgeCells: Object.freeze([...(entry.bridgeCells ?? [])]),
      ledgeCells: Object.freeze([...(entry.ledgeCells ?? [])]),
    });
  }
  return Object.freeze({ byMapId: Object.freeze(byMapId) });
}
