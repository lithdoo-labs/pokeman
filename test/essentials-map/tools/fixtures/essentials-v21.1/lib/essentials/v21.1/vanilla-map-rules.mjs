/**
 * Branch-faithful static ports of Pokémon Essentials v21.1 map rules used by
 * terrain forensics. These functions do not eval Ruby and are not a gameplay
 * runtime.
 *
 * Vanilla: Maruno17/pokemon-essentials tag v21.1
 * commit ea7b5d56d2436591160983c4e641a2ceee2d875a
 */

export const VANILLA_COMMIT = "ea7b5d56d2436591160983c4e641a2ceee2d875a";
export const VANILLA_TAG = "v21.1";

export const VANILLA_PATHS = Object.freeze({
  terrainTag: "Data/Scripts/010_Data/001_Hardcoded data/011_TerrainTag.rb",
  gameMap: "Data/Scripts/004_Game classes/004_Game_Map.rb",
  gameEvent: "Data/Scripts/004_Game classes/007_Game_Event.rb",
  gameCharacter: "Data/Scripts/004_Game classes/006_Game_Character.rb",
  gamePlayer: "Data/Scripts/004_Game classes/008_Game_Player.rb",
});

/**
 * v21.1 GameData::TerrainTag.register table. try_get(unknown) returns None.
 */
export const VANILLA_TERRAIN_TAGS = Object.freeze({
  0: Object.freeze({ id: "None", idNumber: 0 }),
  1: Object.freeze({ id: "Ledge", idNumber: 1, ledge: true }),
  2: Object.freeze({ id: "Grass", idNumber: 2 }),
  3: Object.freeze({ id: "Sand", idNumber: 3 }),
  4: Object.freeze({ id: "Rock", idNumber: 4 }),
  5: Object.freeze({ id: "DeepWater", idNumber: 5, can_surf: true, can_dive: true }),
  6: Object.freeze({ id: "StillWater", idNumber: 6, can_surf: true }),
  7: Object.freeze({ id: "Water", idNumber: 7, can_surf: true }),
  8: Object.freeze({ id: "Waterfall", idNumber: 8, can_surf: true, waterfall: true }),
  9: Object.freeze({ id: "WaterfallCrest", idNumber: 9, can_surf: true, waterfall_crest: true }),
  10: Object.freeze({ id: "TallGrass", idNumber: 10, must_walk: true }),
  11: Object.freeze({ id: "UnderwaterGrass", idNumber: 11 }),
  12: Object.freeze({ id: "Ice", idNumber: 12, ice: true, must_walk_or_run: true }),
  13: Object.freeze({ id: "Neutral", idNumber: 13, ignore_passability: true }),
  14: Object.freeze({ id: "SootGrass", idNumber: 14 }),
  15: Object.freeze({ id: "Bridge", idNumber: 15, bridge: true }),
  16: Object.freeze({ id: "Puddle", idNumber: 16 }),
  17: Object.freeze({ id: "NoEffect", idNumber: 17 }),
});

const NONE = VANILLA_TERRAIN_TAGS[0];

export function terrainTagFor(id) {
  if (id == null) return NONE;
  return VANILLA_TERRAIN_TAGS[id] ?? NONE;
}

/**
 * Ruby 1.8 Fixnum#<< : a negative count is a right shift.
 * JS `1 << n` uses ToUint32 and is NOT equivalent for d=0.
 * Game_Map: bit = (1 << ((d / 2) - 1)) & 0x0f
 */
export function vanillaPassageBit(d) {
  const shift = Math.trunc(Number(d) / 2) - 1;
  let raw;
  if (shift >= 0) raw = 1 << shift;
  else raw = 1 >> (-shift);
  return raw & 0x0f;
}

export function validateTableShape(table, expected, label) {
  const issues = [];
  if (table == null || table.kind !== "Table") {
    issues.push(`${label}: missing or not a Table`);
    return Object.freeze(issues);
  }
  if (expected.dimensions != null && table.dimensions !== expected.dimensions) {
    issues.push(`${label}: dimensions ${table.dimensions} != ${expected.dimensions}`);
  }
  if (expected.xSize != null && table.xSize !== expected.xSize) {
    issues.push(`${label}: xSize ${table.xSize} != ${expected.xSize}`);
  }
  if (expected.ySize != null && table.ySize !== expected.ySize) {
    issues.push(`${label}: ySize ${table.ySize} != ${expected.ySize}`);
  }
  if (expected.zSize != null && table.zSize !== expected.zSize) {
    issues.push(`${label}: zSize ${table.zSize} != ${expected.zSize}`);
  }
  const expectedLength = table.xSize * table.ySize * table.zSize;
  if (!table.values || table.values.length !== expectedLength) {
    issues.push(`${label}: values.length ${table.values?.length ?? "missing"} != ${expectedLength} (x*y*z)`);
  }
  return Object.freeze(issues);
}

export function validateOneDimensionalTilesetTable(table, label) {
  return validateTableShape(table, { dimensions: 1, ySize: 1, zSize: 1 }, label);
}

function tableValue(table, x, y = 0, z = 0) {
  return table.values[x + y * table.xSize + z * table.xSize * table.ySize];
}

function lookupTilesetScalar(table, tileId, label, issues) {
  if (table?.kind !== "Table") {
    issues.push(`${label} missing`);
    return { ok: false };
  }
  if (!Number.isSafeInteger(tileId)) {
    issues.push(`${label}: tileId ${tileId} is not a safe integer`);
    return { ok: false };
  }
  if (tileId < 0) {
    issues.push(`${label}: negative tileId ${tileId}`);
    return { ok: false, negative: true, tileId };
  }
  if (tileId >= table.xSize) {
    issues.push(`${label}: tileId ${tileId} >= xSize ${table.xSize}`);
    return { ok: false, outOfRange: true, tileId };
  }
  return { ok: true, value: tableValue(table, tileId) };
}

/**
 * Game_Map#playerPassable?(x,y,d,self_event) with walking / not-surfing / not-bicycle.
 * Returns a layer trace; never invents an equivalent shortcut for d=0.
 */
export function playerPassableTrace(context, x, y, d, options = {}) {
  const bridgeLevel = options.bridgeLevel ?? 0;
  const surfing = options.surfing === true;
  const bicycle = options.bicycle === true;
  const issues = [];
  const layers = [];
  const bit = vanillaPassageBit(d);
  const { mapData, terrainTags, passages, priorities, width, height } = context;

  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
    return Object.freeze({
      passable: false,
      reason: "invalid-coordinates",
      bit,
      d,
      bridgeLevel,
      layers: Object.freeze([]),
      issues: Object.freeze([`(${x},${y}) outside ${width}x${height}`]),
      grade: "SOURCE-PROVEN-BRANCH",
    });
  }

  for (const z of [2, 1, 0]) {
    const tileId = tableValue(mapData, x, y, z);
    const layer = { z, tileId, action: "inspect" };
    if (tileId === 0) {
      layer.action = "skip-empty-tile-id-0";
      layers.push(Object.freeze(layer));
      continue;
    }
    if (!Number.isSafeInteger(tileId)) {
      issues.push(`data[${x},${y},${z}] is not a safe integer`);
      layer.action = "abort-non-integer-tile";
      layers.push(Object.freeze(layer));
      return finish(false, "non-integer-tile", bit, d, bridgeLevel, layers, issues);
    }
    if (tileId < 0) {
      issues.push(`data[${x},${y},${z}] negative tileId ${tileId}`);
      layer.action = "abort-negative-tile";
      layers.push(Object.freeze(layer));
      return finish(false, "negative-tile", bit, d, bridgeLevel, layers, issues, "INCOMPLETE");
    }
    const tagLookup = lookupTilesetScalar(terrainTags, tileId, "terrain_tags", issues);
    const passageLookup = lookupTilesetScalar(passages, tileId, "passages", issues);
    const priorityLookup = lookupTilesetScalar(priorities, tileId, "priorities", issues);
    if (!tagLookup.ok || !passageLookup.ok || !priorityLookup.ok) {
      layer.action = "abort-tileset-lookup";
      layers.push(Object.freeze(layer));
      return finish(false, "tileset-lookup-failed", bit, d, bridgeLevel, layers, issues, "INCOMPLETE");
    }
    const terrain = terrainTagFor(tagLookup.value);
    const passage = passageLookup.value;
    const priority = priorityLookup.value;
    layer.terrainTag = tagLookup.value;
    layer.terrainId = terrain.id;
    layer.passage = passage;
    layer.priority = priority;
    layer.bit = bit;

    if (terrain.bridge && bridgeLevel === 0) {
      layer.action = "skip-bridge-while-bridgeLevel-0";
      layers.push(Object.freeze(layer));
      continue;
    }
    if (surfing && terrain.can_surf && !terrain.waterfall) {
      layer.action = "return-true-surfing-water";
      layers.push(Object.freeze(layer));
      return finish(true, "surfing-water", bit, d, bridgeLevel, layers, issues);
    }
    if (bicycle && (terrain.must_walk || terrain.must_walk_or_run)) {
      layer.action = "return-false-bicycle-must-walk";
      layers.push(Object.freeze(layer));
      return finish(false, "bicycle-must-walk", bit, d, bridgeLevel, layers, issues);
    }
    if (terrain.bridge && bridgeLevel > 0) {
      const ok = (passage & bit) === 0 && (passage & 0x0f) !== 0x0f;
      layer.action = ok ? "return-true-on-bridge-layer" : "return-false-on-bridge-layer";
      layers.push(Object.freeze(layer));
      return finish(ok, ok ? "bridge-layer-passable" : "bridge-layer-blocked", bit, d, bridgeLevel, layers, issues);
    }
    if (terrain.ignore_passability) {
      layer.action = "skip-ignore-passability";
      layers.push(Object.freeze(layer));
      continue;
    }
    if ((passage & bit) !== 0 || (passage & 0x0f) === 0x0f) {
      layer.action = "return-false-passage";
      layers.push(Object.freeze(layer));
      return finish(false, "passage-blocked", bit, d, bridgeLevel, layers, issues);
    }
    if (priority === 0) {
      layer.action = "return-true-priority-0";
      layers.push(Object.freeze(layer));
      return finish(true, "priority-0", bit, d, bridgeLevel, layers, issues);
    }
    layer.action = "continue-higher-priority";
    layers.push(Object.freeze(layer));
  }
  return finish(true, "default-true-after-layers", bit, d, bridgeLevel, layers, issues);
}

function finish(passable, reason, bit, d, bridgeLevel, layers, issues, completeness = "COMPUTED") {
  return Object.freeze({
    passable,
    reason,
    bit,
    d,
    bridgeLevel,
    layers: Object.freeze(layers),
    issues: Object.freeze(issues),
    completeness,
    grade: completeness === "INCOMPLETE" ? "INCOMPLETE" : "STATIC-INFERRED",
    source: Object.freeze({
      method: "Game_Map#playerPassable?",
      path: VANILLA_PATHS.gameMap,
      commit: VANILLA_COMMIT,
      passageBit: "Ruby 1.8 1<<(d/2-1) with negative shift as right shift, then & 0x0f",
    }),
  });
}

function eventTilePassable(events, x, y, bit, options = {}) {
  const hits = [];
  for (const event of events ?? []) {
    const page = options.pageOf?.(event);
    if (!page) continue;
    const tileId = page.graphic?.tile_id ?? 0;
    if (!(tileId > 0)) continue;
    if (page.through === true) continue;
    const occupied = event.occupiedTiles ?? [];
    if (!occupied.some((tile) => tile.x === x && tile.y === y)) continue;
    hits.push(Object.freeze({ eventId: event.eventId, tileId, through: page.through }));
  }
  return Object.freeze(hits);
}

/**
 * Game_Map#passable?(x,y,d, $game_player): event tiles then playerPassable?.
 */
export function mapPassableForPlayer(context, x, y, d, options = {}) {
  const { width, height } = context;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
    return Object.freeze({
      passable: false,
      reason: "invalid-coordinates",
      eventTiles: Object.freeze([]),
      player: null,
    });
  }
  const bit = vanillaPassageBit(d);
  const eventTiles = eventTilePassable(context.events, x, y, bit, options);
  const eventIssues = [];
  for (const hit of eventTiles) {
    const tagLookup = lookupTilesetScalar(context.terrainTags, hit.tileId, "terrain_tags", eventIssues);
    const passageLookup = lookupTilesetScalar(context.passages, hit.tileId, "passages", eventIssues);
    const priorityLookup = lookupTilesetScalar(context.priorities, hit.tileId, "priorities", eventIssues);
    if (!tagLookup.ok || !passageLookup.ok || !priorityLookup.ok) {
      return Object.freeze({
        passable: false,
        reason: "event-tile-lookup-failed",
        eventTiles,
        player: null,
        issues: Object.freeze(eventIssues),
        completeness: "INCOMPLETE",
      });
    }
    const terrain = terrainTagFor(tagLookup.value);
    if (terrain.ignore_passability) continue;
    const passage = passageLookup.value;
    if ((passage & bit) !== 0) {
      return Object.freeze({ passable: false, reason: "event-tile-direction-blocked", eventTiles, player: null, hit });
    }
    if ((passage & 0x0f) === 0x0f) {
      return Object.freeze({ passable: false, reason: "event-tile-fully-blocked", eventTiles, player: null, hit });
    }
    if (priorityLookup.value === 0) {
      return Object.freeze({ passable: true, reason: "event-tile-priority-0", eventTiles, player: null, hit });
    }
  }
  const player = playerPassableTrace(context, x, y, d, options);
  return Object.freeze({
    passable: player.passable,
    reason: player.reason,
    eventTiles,
    player,
    issues: player.issues,
    completeness: player.completeness,
  });
}

export function selectAlwaysActivePage(event) {
  for (let index = event.pages.length - 1; index >= 0; index -= 1) {
    if (event.pages[index].condition?.alwaysActive === true) return event.pages[index];
  }
  return undefined;
}

/**
 * Game_Event#over_trigger?
 * return false if character_name != "" && !through
 * return false if name[/hiddenitem/i]
 * each occupied tile: return true if map.passable?(i,j,0,player)
 */
export function overTriggerForEvent(context, event, options = {}) {
  const page = options.page ?? selectAlwaysActivePage(event);
  if (!page) {
    return Object.freeze({
      overTrigger: null,
      reason: "no-always-active-page",
      grade: "INCOMPLETE",
      occupied: Object.freeze([]),
    });
  }
  const characterName = page.graphic?.character_name ?? "";
  const through = page.through === true;
  if (characterName !== "" && through === false) {
    return Object.freeze({
      overTrigger: false,
      reason: "nonempty-graphic-and-not-through",
      characterName,
      through,
      grade: "SOURCE-PROVEN-BRANCH",
      occupied: Object.freeze([]),
    });
  }
  if (/hiddenitem/iu.test(event.name ?? "")) {
    return Object.freeze({
      overTrigger: false,
      reason: "hiddenitem-name",
      grade: "SOURCE-PROVEN-BRANCH",
      occupied: Object.freeze([]),
    });
  }
  const occupied = event.occupiedTiles ?? [];
  const tiles = [];
  let anyPassable = false;
  let incomplete = false;
  for (const tile of occupied) {
    const passable = mapPassableForPlayer(context, tile.x, tile.y, 0, {
      ...options,
      pageOf: (other) => (other === event ? page : selectAlwaysActivePage(other)),
    });
    tiles.push(Object.freeze({ x: tile.x, y: tile.y, passable }));
    if (passable.completeness === "INCOMPLETE") incomplete = true;
    if (passable.passable === true) anyPassable = true;
  }
  if (incomplete) {
    return Object.freeze({
      overTrigger: null,
      reason: "passable-incomplete",
      characterName,
      through,
      occupied: Object.freeze(tiles),
      grade: "INCOMPLETE",
      pageIndex: page.pageIndex,
    });
  }
  if (anyPassable) {
    return Object.freeze({
      overTrigger: true,
      reason: "occupied-tile-passable-d0",
      characterName,
      through,
      occupied: Object.freeze(tiles),
      grade: "STATIC-INFERRED",
      pageIndex: page.pageIndex,
      trigger: page.trigger,
    });
  }
  return Object.freeze({
    overTrigger: false,
    reason: "no-occupied-tile-passable-d0",
    characterName,
    through,
    occupied: Object.freeze(tiles),
    grade: "STATIC-INFERRED",
    pageIndex: page.pageIndex,
    trigger: page.trigger,
  });
}

export function hereVersusTouch(overTrigger, page) {
  const trigger = page?.trigger;
  const playerTouch = trigger === 1 || trigger === 2;
  if (overTrigger === true && playerTouch) {
    return Object.freeze({
      branch: "here",
      source: "Game_Player#check_event_trigger_here requires over_trigger?; update_event_triggering after step/jump settles",
      touchAlso: false,
      note: "check_event_trigger_touch skips events with over_trigger?",
    });
  }
  if (overTrigger === false && playerTouch) {
    return Object.freeze({
      branch: "touch",
      source: "Game_Player#check_event_trigger_touch when can_move_in_direction? fails; skips over_trigger? events",
      hereAlso: false,
    });
  }
  if (overTrigger == null) {
    return Object.freeze({ branch: "unknown", source: "over_trigger could not be computed" });
  }
  return Object.freeze({
    branch: "neither-player-touch",
    trigger,
    source: "trigger is not 1 or 2; here/touch player paths do not start this page",
  });
}

export function offsetForDirection(d) {
  if (d === 2) return { dx: 0, dy: 1 };
  if (d === 4) return { dx: -1, dy: 0 };
  if (d === 6) return { dx: 1, dy: 0 };
  if (d === 8) return { dx: 0, dy: -1 };
  return { dx: 0, dy: 0 };
}

/**
 * Game_Character#passable?(x,y,d) then Game_Player map-edge wrapper is not
 * applied here. Landing checks for jump use d=0.
 */
export function characterCanLeaveTile(context, x, y, d, options = {}) {
  const { dx, dy } = offsetForDirection(d);
  const newX = x + dx;
  const newY = y + dy;
  if (newX < 0 || newY < 0 || newX >= context.width || newY >= context.height) {
    return Object.freeze({ passable: false, reason: "destination-out-of-map", newX, newY });
  }
  const from = mapPassableForPlayer(context, x, y, d, options);
  if (!from.passable) return Object.freeze({ passable: false, reason: "source-blocked", from, newX, newY });
  const reverse = d === 0 ? 10 : 10 - d;
  const onto = mapPassableForPlayer(context, newX, newY, reverse, options);
  if (!onto.passable) return Object.freeze({ passable: false, reason: "destination-blocked", from, onto, newX, newY });
  const blockingEvents = (context.events ?? []).filter((event) => {
    const page = selectAlwaysActivePage(event);
    if (!page || page.through === true) return false;
    if ((page.graphic?.character_name ?? "") === "") return false;
    return (event.occupiedTiles ?? []).some((tile) => tile.x === newX && tile.y === newY);
  }).map((event) => event.eventId);
  if (blockingEvents.length > 0) {
    return Object.freeze({ passable: false, reason: "blocking-named-event", blockingEvents, newX, newY });
  }
  return Object.freeze({ passable: true, reason: "character-passable", from, onto, newX, newY });
}

export function facingTerrainTag(context, x, y, d, options = {}) {
  const { dx, dy } = offsetForDirection(d);
  const fx = x + dx;
  const fy = y + dy;
  if (fx < 0 || fy < 0 || fx >= context.width || fy >= context.height) {
    return Object.freeze({ tag: NONE, x: fx, y: fy, outOfMap: true });
  }
  const countBridge = options.countBridge === true;
  const bridgeLevel = options.bridgeLevel ?? 0;
  for (const z of [2, 1, 0]) {
    const tileId = tableValue(context.mapData, fx, fy, z);
    if (tileId === 0) continue;
    const tagId = tableValue(context.terrainTags, tileId);
    const terrain = terrainTagFor(tagId);
    if (terrain.id === "None" || terrain.ignore_passability) continue;
    if (!countBridge && terrain.bridge && bridgeLevel === 0) continue;
    return Object.freeze({ tag: terrain, tagId, tileId, z, x: fx, y: fy });
  }
  return Object.freeze({ tag: NONE, tagId: 0, x: fx, y: fy });
}

/**
 * Game_Player#move_generic ledge branch: if can_move and facing ledge, jumpForward(2).
 * Game_Character#jump uses passable?(landing, 0) per occupied tile (player 1x1).
 */
export function ledgeJumpForward2(context, x, y, d, options = {}) {
  const canMove = characterCanLeaveTile(context, x, y, d, options);
  const facing = facingTerrainTag(context, x, y, d, options);
  const { dx, dy } = offsetForDirection(d);
  const midX = x + dx;
  const midY = y + dy;
  const landX = x + dx * 2;
  const landY = y + dy * 2;
  if (!canMove.passable) {
    return Object.freeze({
      attempted: false,
      jumped: false,
      reason: "can-move-failed-before-ledge-check",
      canMove,
      facing,
      mid: Object.freeze({ x: midX, y: midY }),
      landing: Object.freeze({ x: landX, y: landY }),
    });
  }
  if (facing.tag?.ledge !== true) {
    return Object.freeze({
      attempted: false,
      jumped: false,
      reason: "facing-is-not-ledge",
      canMove,
      facing,
      mid: Object.freeze({ x: midX, y: midY }),
      landing: Object.freeze({ x: landX, y: landY }),
    });
  }
  const landingPassable = characterCanLeaveTile(context, landX, landY, 0, options);
  const jumped = landingPassable.passable === true
    && landX >= 0 && landY >= 0 && landX < context.width && landY < context.height;
  return Object.freeze({
    attempted: true,
    jumped,
    reason: jumped ? "jump-landing-passable-d0" : "jump-landing-blocked-or-invalid",
    canMove,
    facing,
    mid: Object.freeze({ x: midX, y: midY, note: "jumped over; Game_Player returns without walking onto the ledge tile" }),
    landing: Object.freeze({ x: landX, y: landY, passable: landingPassable }),
    motion: Object.freeze({
      jump_peakRule: "distance * TILE_HEIGHT * 3 / 8",
      duration: "Game_Character#jump sets jump_timer; not executed here",
      skippedMiddleTriggers: "player coordinates jump from start to landing; middle tile is not occupied",
      grade: "SOURCE-PROVEN-BRANCH",
    }),
  });
}

export function eventsOccupying(events, x, y) {
  return Object.freeze((events ?? []).filter((event) => (
    (event.occupiedTiles ?? []).some((tile) => tile.x === x && tile.y === y)
  )));
}

export function inferBridgeScriptDelta(page) {
  const texts = [
    ...(page.concatenatedScripts ?? []).map((group) => group.joinedWithNewlines),
    ...(page.moveRouteScripts ?? []).filter((item) => item.isScript).map((item) => item.scriptText),
    ...(page.conditionalBranchScripts ?? []).map((item) => item.scriptText),
  ].join("\n");
  const on = /\bpbBridgeOn\s*(?:\(|\b)/u.test(texts);
  const off = /\bpbBridgeOff\s*(?:\(|\b)/u.test(texts);
  if (on && !off) return Object.freeze({ kind: "on", nextBridgeLevel: 2, note: "pbBridgeOn default height=2; STATIC-INFERRED execute" });
  if (off && !on) return Object.freeze({ kind: "off", nextBridgeLevel: 0, note: "pbBridgeOff; STATIC-INFERRED execute" });
  if (on && off) return Object.freeze({ kind: "both", nextBridgeLevel: null, note: "both On and Off present; execute order not simulated" });
  return Object.freeze({ kind: "none", nextBridgeLevel: null });
}
