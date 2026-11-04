/**
 * Original, minimal, redistributable synthetic maps for Terrain Behavior
 * freeze tests. These are not Pokémon Essentials maps and are not Map7/21/47
 * observations.
 */

import {
  buildPassabilityContext,
  collectBridgeCells,
  collectLedgeCells,
  extractMapFacts,
} from "./map-event-evidence.mjs";
import { worldFromMaps } from "./map-world-replay.mjs";

const object = (className, fields) => ({ kind: "RmxpObject", className, fields, extraIvars: {}, rubyObjectId: 1 });
const string = (text) => ({ kind: "RubyString", text, bytes: Buffer.from(text), ivars: {} });
const array = (items) => ({ kind: "Array", items });
const hash = (entries) => ({ kind: "Hash", entries });
const table = (dimensions, xSize, ySize, zSize, values) => ({
  kind: "Table",
  dimensions,
  xSize,
  ySize,
  zSize,
  values: Int16Array.from(values),
});

function condition() {
  return object("RPG::Event::Page::Condition", {
    "@switch1_valid": false,
    "@switch2_valid": false,
    "@variable_valid": false,
    "@self_switch_valid": false,
    "@switch1_id": 1,
    "@switch2_id": 1,
    "@variable_id": 1,
    "@variable_value": 0,
    "@self_switch_ch": string("A"),
  });
}

function graphic(fields = {}) {
  return object("RPG::Event::Page::Graphic", {
    "@tile_id": fields.tileId ?? 0,
    "@character_name": string(fields.characterName ?? ""),
    "@character_hue": 0,
    "@direction": 2,
    "@pattern": 0,
    "@opacity": 255,
    "@blend_type": 0,
  });
}

function command(code, indent, parameters) {
  return object("RPG::EventCommand", {
    "@code": code,
    "@indent": indent,
    "@parameters": array(parameters),
  });
}

function page(fields) {
  return object("RPG::Event::Page", {
    "@condition": fields.condition ?? condition(),
    "@graphic": graphic(fields.graphic ?? {}),
    "@move_type": 0,
    "@move_speed": 3,
    "@move_frequency": 3,
    "@walk_anime": true,
    "@step_anime": false,
    "@direction_fix": false,
    "@through": fields.through ?? false,
    "@always_on_top": fields.alwaysOnTop ?? false,
    "@trigger": fields.trigger ?? 1,
    "@move_route": object("RPG::MoveRoute", {
      "@repeat": false,
      "@skippable": false,
      "@list": array([object("RPG::MoveCommand", { "@code": 0, "@parameters": array([]) })]),
    }),
    "@list": array(fields.commands ?? [command(0, 0, [])]),
  });
}

function event(id, name, x, y, pages) {
  return object("RPG::Event", {
    "@id": id,
    "@name": string(name),
    "@x": x,
    "@y": y,
    "@pages": array(pages),
  });
}

function mapRoot(events, width, height, dataValues, tilesetId = 1) {
  return object("RPG::Map", {
    "@tileset_id": tilesetId,
    "@width": width,
    "@height": height,
    "@data": table(3, width, height, 3, dataValues),
    "@events": hash(events),
  });
}

function fillGround(width, height, groundId = 1) {
  const values = Array(width * height * 3).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      values[x + y * width] = groundId;
    }
  }
  return values;
}

function setTile(values, width, height, x, y, z, tileId) {
  values[x + y * width + z * width * height] = tileId;
}

function tilesetTables(length = 32, apply) {
  const tags = Array(length).fill(0);
  const passages = Array(length).fill(0);
  const priorities = Array(length).fill(0);
  tags[13] = 13;
  tags[15] = 15;
  tags[16] = 1;
  tags[17] = 17;
  passages[2] = 0x0f;
  passages[16] = 0x01;
  apply?.(tags, passages, priorities);
  return {
    terrain_tags: table(1, length, 1, 1, tags),
    passages: table(1, length, 1, 1, passages),
    priorities: table(1, length, 1, 1, priorities),
  };
}

function evidenceShell(mapId, facts, cells, edges, extra = {}) {
  return {
    map: { mapId, events: facts.events, width: facts.width, height: facts.height, tilesetId: facts.tilesetId },
    transferAudit: { actual: { edges: Object.freeze(edges ?? []), steps: [], contacts: [] } },
    bridgeTerrain: { cells: Object.freeze(cells ?? []) },
    ...extra,
    sampleKind: extra.sampleKind ?? "synthetic",
    notALiveRun: true,
  };
}

export function makeSyntheticBridgeWorld(options = {}) {
  const width7 = 5;
  const height7 = 3;
  const width21 = 6;
  const height21 = 10;
  const data7 = fillGround(width7, height7);
  const data21 = fillGround(width21, height21);
  setTile(data21, width21, height21, 0, 9, 0, 2);
  for (const [x, y] of [[2, 3], [2, 4], [3, 3], [3, 4]]) {
    setTile(data21, width21, height21, x, y, 2, 15);
  }
  if (options.breakLandPath === true) {
    setTile(data21, width21, height21, 2, 8, 0, 2);
    setTile(data21, width21, height21, 3, 8, 0, 2);
    setTile(data21, width21, height21, 1, 8, 0, 2);
    setTile(data21, width21, height21, 4, 8, 0, 2);
    setTile(data21, width21, height21, 5, 8, 0, 2);
    setTile(data21, width21, height21, 0, 8, 0, 2);
  }
  const off = event(23, "EV023 size(2,1)", 2, 6, [page({
    through: true,
    trigger: 1,
    commands: [command(355, 0, [string("pbBridgeOff")]), command(0, 0, [])],
  })]);
  const on = event(25, "EV025 size(2,1)", 2, 5, [page({
    through: true,
    trigger: 1,
    commands: [command(355, 0, [string("pbBridgeOn(2)")]), command(0, 0, [])],
  })]);
  const npc = event(40, "Blocker", 5, 7, [page({
    through: false,
    trigger: 1,
    graphic: { characterName: "NPC 01" },
    commands: [command(101, 0, [string("no")]), command(0, 0, [])],
  })]);
  const facts7 = extractMapFacts(mapRoot([], width7, height7, data7), 7, "Map007.synthetic");
  const facts21 = extractMapFacts(mapRoot([[23, off], [25, on], [40, npc]], width21, height21, data21), 21, "Map021.synthetic");
  const terrain = tilesetTables();
  const context7 = buildPassabilityContext(facts7, terrain, facts7.events);
  const context21 = buildPassabilityContext(facts21, terrain, facts21.events);
  const outbound = options.omitOutbound === true ? [] : [{
    x: 2, y: 0, direction: 8, targetMapId: 21, targetX: 2, targetY: 9,
  }];
  const inbound = options.omitInbound === true ? [] : [{
    x: 2, y: 9, direction: 2, targetMapId: 7, targetX: 2, targetY: 0,
  }];
  const missingTarget = options.missingTarget === true ? [{
    x: 4, y: 0, direction: 8, targetMapId: 99, targetX: 0, targetY: 0,
  }] : [];
  const map7 = evidenceShell(7, facts7, [], [...outbound, ...missingTarget]);
  const bridgeCells = collectBridgeCells(facts21, terrain.terrain_tags).cells;
  const map21 = evidenceShell(21, facts21, bridgeCells, inbound);
  const world = worldFromMaps([
    { mapId: 7, context: context7, edges: map7.transferAudit.actual.edges, bridgeCells: [] },
    { mapId: 21, context: context21, edges: map21.transferAudit.actual.edges, bridgeCells },
  ]);
  return Object.freeze({
    sampleKind: "synthetic",
    notALiveRun: true,
    notOriginalMaps: true,
    world,
    map7,
    map21,
    facts7,
    facts21,
    context7,
    context21,
    terrain,
    bridgeCells,
    start: Object.freeze({
      mapId: 7, x: 2, y: 0, direction: 8, bridgeLevel: 0, pendingExecute: null,
      interpreterBusy: false, nextInputAvailable: true, motion: "idle",
    }),
  });
}

export function makeSyntheticLedgeWorld(kind = "legal-down") {
  const width = 5;
  const height = 6;
  const values = fillGround(width, height);
  const events = [];
  if (kind === "legal-down" || kind === "with-404" || kind === "mid-event" || kind === "landing-event") {
    setTile(values, width, height, 2, 2, 0, 16);
  }
  if (kind === "start-blocked") {
    setTile(values, width, height, 2, 2, 0, 16);
    setTile(values, width, height, 2, 1, 0, 2);
  }
  if (kind === "landing-blocked") {
    setTile(values, width, height, 2, 2, 0, 16);
    setTile(values, width, height, 2, 3, 0, 2);
  }
  if (kind === "boundary") {
    setTile(values, width, height, 2, 0, 0, 16);
  }
  if (kind === "mid-event") {
    events.push([9, event(9, "Mid", 2, 2, [page({
      through: true,
      trigger: 1,
      commands: [command(101, 0, [string("mid")]), command(0, 0, [])],
    })])]);
  }
  if (kind === "landing-event") {
    events.push([8, event(8, "Land", 2, 3, [page({
      through: true,
      trigger: 1,
      commands: [command(101, 0, [string("land")]), command(0, 0, [])],
    })])]);
  }
  if (kind === "with-404") {
    events.push([7, event(7, "Choices", 0, 0, [page({
      trigger: 0,
      commands: [
        command(102, 0, [array([string("A"), string("B")])]),
        command(402, 0, [0, string("A")]),
        command(0, 1, []),
        command(403, 0, []),
        command(0, 1, []),
        command(404, 0, []),
        command(0, 0, []),
      ],
    })])]);
  }
  const facts = extractMapFacts(mapRoot(events, width, height, values), 47, "Map047.synthetic");
  const terrain = tilesetTables();
  const context = buildPassabilityContext(facts, terrain, facts.events);
  const ledgeCells = collectLedgeCells(facts, terrain.terrain_tags).cells;
  return Object.freeze({
    sampleKind: "synthetic",
    notALiveRun: true,
    notOriginalMap47: true,
    kind,
    facts,
    context,
    terrain,
    evidence: {
      ledgeTerrain: { cells: ledgeCells, cellCount: ledgeCells.length },
      map: { mapId: 47, events: facts.events, width, height },
      sampleKind: "synthetic",
    },
    start: Object.freeze({ x: 2, y: 1, direction: 2 }),
    ledge: Object.freeze({ x: 2, y: 2 }),
    landing: Object.freeze({ x: 2, y: 3 }),
  });
}

export function makeBrokenTilesetRecord(kind) {
  const base = {
    id: 1,
    tileset_name: "synthetic",
    autotile_names: Object.freeze([null, null, null, null, null, null, null]),
    passages: { dimensions: 1, xSize: 8, ySize: 1, zSize: 1, values: [0, 0, 0, 0, 0, 0, 0, 0] },
    priorities: { dimensions: 1, xSize: 8, ySize: 1, zSize: 1, values: [0, 0, 0, 0, 0, 0, 0, 0] },
    terrain_tags: { dimensions: 1, xSize: 8, ySize: 1, zSize: 1, values: [0, 0, 0, 0, 0, 0, 0, 0] },
  };
  if (kind === "missing-autotile-names") {
    const { autotile_names: _drop, ...rest } = base;
    return rest;
  }
  if (kind === "legacy-five-fields") {
    const { terrain_tags: _drop, ...rest } = base;
    return rest;
  }
  if (kind === "short-terrain-tags") {
    return { ...base, terrain_tags: { dimensions: 1, xSize: 2, ySize: 1, zSize: 1, values: [0, 0] } };
  }
  if (kind === "three-d-terrain-tags") {
    return { ...base, terrain_tags: { dimensions: 3, xSize: 8, ySize: 1, zSize: 1, values: Array(8).fill(0) } };
  }
  if (kind === "tag-18") {
    const values = [0, 0, 0, 0, 0, 0, 0, 18];
    return { ...base, terrain_tags: { ...base.terrain_tags, values } };
  }
  if (kind === "negative-tile-map") {
    return { ...base, note: "map data uses tileId -3; validator must fail closed" };
  }
  return base;
}

export const SYNTHETIC_FIXTURE_LICENSE = Object.freeze({
  origin: "original-minimal-synthetic",
  redistributable: true,
  notOriginalEssentialsAssets: true,
  note: "Hand-built RMXP-shaped tables and events. Not copied from Pokémon Essentials or Map007/021/047.",
});
