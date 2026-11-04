/**
 * Static Map 47 ledge routes. Not a live RGSS run.
 */

import { offsetForDirection, facingTerrainTag, ledgeJumpForward2, eventsOccupying } from "./vanilla-map-rules.mjs";

function inBounds(context, x, y) {
  return x >= 0 && y >= 0 && x < context.width && y < context.height;
}

export function inventoryMapCommands(events) {
  const codes = new Map();
  for (const event of events ?? []) {
    for (const page of event.pages ?? []) {
      for (const command of page.commands ?? []) {
        const key = command.code;
        const entry = codes.get(key) ?? { code: key, label: command.label, count: 0, events: [] };
        entry.count += 1;
        if (!entry.events.includes(event.eventId)) entry.events.push(event.eventId);
        codes.set(key, entry);
      }
    }
  }
  return Object.freeze([...codes.values()].sort((left, right) => left.code - right.code));
}

export function command404Impact(events, ledgeCells) {
  const hits = [];
  for (const event of events ?? []) {
    const pages = (event.pages ?? []).filter((page) => (page.commands ?? []).some((command) => command.code === 404));
    if (pages.length === 0) continue;
    const occupied = event.occupiedTiles ?? [];
    const onLedge = occupied.some((tile) => (ledgeCells ?? []).some((cell) => cell.x === tile.x && cell.y === tile.y));
    hits.push(Object.freeze({
      eventId: event.eventId,
      name: event.name,
      occupied,
      onLedgeCell: onLedge,
      pageIndexes: pages.map((page) => page.pageIndex),
      label: "show-choices-branch-end",
      treatedAsEmpty: false,
      note: "404 is Show Choices branch-end, not a no-op. This tracer does not execute choice control flow. Ledge jumpForward(2) is a Game_Player movement rule and does not eval event 404.",
    }));
  }
  return Object.freeze({
    present: hits.length > 0,
    hits: Object.freeze(hits),
    affectsLedgePhysics: false,
    failClosedForChoiceFlow: hits.length > 0,
    grade: "SOURCE-PROVEN-LABEL",
  });
}

export function buildMap47LedgeRoutes(context, evidence, options = {}) {
  const cells = evidence.ledgeTerrain?.cells ?? [];
  const legal = [];
  const reverseFailed = [];
  const startBlocked = [];
  const landingBlocked = [];
  const boundary = [];
  const midEventReal = [];
  for (const cell of cells) {
    for (const dir of [2, 4, 6, 8]) {
      const { dx, dy } = offsetForDirection(dir);
      const start = { x: cell.x - dx, y: cell.y - dy };
      const landing = { x: cell.x + dx, y: cell.y + dy };
      const startOob = !inBounds(context, start.x, start.y);
      const landOob = !inBounds(context, landing.x, landing.y);
      if (startOob || landOob) {
        boundary.push(Object.freeze({
          ledge: { x: cell.x, y: cell.y },
          dir,
          start,
          landing,
          startOob,
          landOob,
          note: (options.sampleKind ?? evidence.sampleKind) === "synthetic"
            ? "synthetic ledge near map edge; not a Map 47 original cell"
            : "Map 47 real ledge near map edge; jump is not taken when start or landing is out of bounds",
        }));
        continue;
      }
      const facing = facingTerrainTag(context, start.x, start.y, dir, { bridgeLevel: 0 });
      if (facing.tag?.ledge !== true) continue;
      const jump = ledgeJumpForward2(context, start.x, start.y, dir, { bridgeLevel: 0 });
      const midEvents = eventsOccupying(context.events ?? [], cell.x, cell.y);
      if (midEvents.length > 0) {
        midEventReal.push(Object.freeze({
          ledge: { x: cell.x, y: cell.y },
          dir,
          eventIds: midEvents.map((event) => event.eventId),
          note: "middle tile is jumped over; player coordinates do not occupy it",
        }));
      }
      const record = Object.freeze({
        ledge: { x: cell.x, y: cell.y, tileIds: (cell.layers ?? []).map((layer) => layer.tileId) },
        start,
        dir,
        landing,
        jumped: jump.jumped,
        attempted: jump.attempted,
        reason: jump.reason,
        motion: jump.motion,
        grade: "STATIC-INFERRED",
      });
      if (jump.jumped) legal.push(record);
      else if (jump.attempted === false && jump.reason === "can-move-failed-before-ledge-check") startBlocked.push(record);
      else if (jump.attempted && !jump.jumped) landingBlocked.push(record);

      if (jump.jumped) {
        const reverse = dir === 2 ? 8 : dir === 8 ? 2 : dir === 4 ? 6 : 4;
        const reverseJump = ledgeJumpForward2(context, landing.x, landing.y, reverse, { bridgeLevel: 0 });
        reverseFailed.push(Object.freeze({
          from: landing,
          reverse,
          original: record,
          jumped: reverseJump.jumped,
          attempted: reverseJump.attempted,
          reason: reverseJump.reason,
          grade: "STATIC-INFERRED",
        }));
      }
    }
  }
  return Object.freeze({
    uniqueCells: cells.length,
    legal: Object.freeze(legal),
    reverse: Object.freeze(reverseFailed),
    startBlocked: Object.freeze(startBlocked),
    landingBlocked: Object.freeze(landingBlocked),
    boundary: Object.freeze(boundary),
    midEventReal: Object.freeze(midEventReal),
    midEventSyntheticNote: "Map 47 sample ledges have no occupying events on the jumped-over tile in this corpus; a synthetic middle-event case is not a Map 47 original event.",
    crossMapJump: Object.freeze({
      supportedInThisTracer: false,
      supportedInVanillaThisRound: false,
      vanillaRule: "Game_Character#jump landing uses passable? on the current map; connection-crossing jump is UNVERIFIED and not promised",
    }),
    commandInventory: inventoryMapCommands(context.events ?? evidence.map?.events ?? []),
    command404: command404Impact(context.events ?? evidence.map?.events ?? [], cells),
    sampleKind: options.sampleKind ?? evidence.sampleKind ?? "unspecified",
    jumpIsNotTwoWalks: Object.freeze({
      rule: "Game_Player#move_generic jumps once by jumpForward(2); logical coordinates skip the middle tile",
      grade: "SOURCE-PROVEN",
    }),
    grade: "STATIC-INFERRED",
    notALiveRun: true,
  });
}
