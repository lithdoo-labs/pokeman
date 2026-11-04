import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertMap21BridgeAudit, occupiedTiles, projectMapActionRecord, materializeMapActionRecords } from "./lib/essentials/v21.1/map-action-consumer.mjs";
import { decodeRxdataBytes, defaultLocalFsdb } from "./lib/essentials/v21.1/map-event-evidence.mjs";
import { projectTilesetRecords } from "./lib/essentials/v21.1/m14-consumer.mjs";
import { mapCanonicalDataset } from "../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/fsdb/mapper.mjs";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const table = (dimensions, xSize, ySize, zSize, values) => ({
  kind: "Table",
  dimensions,
  xSize,
  ySize,
  zSize,
  values: Int16Array.from(values),
  rubyObjectId: 1,
  ivars: {},
});
const object = (className, fields) => ({ kind: "RmxpObject", className, fields, extraIvars: {}, rubyObjectId: 2 });
const string = (text) => ({ kind: "RubyString", text, bytes: Buffer.from(text), ivars: {} });
const array = (items) => ({ kind: "Array", items });
const hash = (entries) => ({ kind: "Hash", entries });

function command(code, parameters = []) {
  return object("RPG::EventCommand", {
    "@code": code,
    "@indent": 0,
    "@parameters": array(parameters.map((item) => (typeof item === "string" ? string(item) : item))),
  });
}

function condition(fields = {}) {
  return object("RPG::Event::Page::Condition", {
    "@switch1_valid": fields.switch1 ?? false,
    "@switch2_valid": fields.switch2 ?? false,
    "@variable_valid": fields.variable ?? false,
    "@self_switch_valid": fields.selfSwitch ?? false,
    "@switch1_id": 1,
    "@switch2_id": 1,
    "@variable_id": 1,
    "@variable_value": 0,
    "@self_switch_ch": string("A"),
  });
}

function page(fields) {
  return object("RPG::Event::Page", {
    "@condition": fields.condition ?? condition(),
    "@through": fields.through ?? false,
    "@trigger": fields.trigger ?? 1,
    "@graphic": object("RPG::Event::Page::Graphic", {
      "@tile_id": fields.tileId ?? 0,
      "@character_name": string(fields.characterName ?? ""),
      "@character_hue": 0,
      "@direction": 2,
      "@pattern": 0,
      "@opacity": 255,
      "@blend_type": 0,
    }),
    "@list": array(fields.commands ?? []),
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

function mapEntry(id, events) {
  return {
    filename: `Map${String(id).padStart(3, "0")}.rxdata`,
    root: object("RPG::Map", {
      "@tileset_id": 1,
      "@width": 8,
      "@height": 8,
      "@data": table(3, 8, 8, 3, Array(8 * 8 * 3).fill(0)),
      "@events": hash(events),
    }),
  };
}

test("occupiedTiles uses bottom-left origin and size(1,4) covers four cells", () => {
  assert.deepEqual(occupiedTiles(20, 49, 1, 4).map((tile) => `${tile.x},${tile.y}`), ["20,46", "20,47", "20,48", "20,49"]);
  assert.deepEqual(occupiedTiles(14, 32, 3, 1).map((tile) => `${tile.x},${tile.y}`), ["14,32", "15,32", "16,32"]);
});

test("projects confirmable pbBridgeOn/Off and omits unrelated NPCs", () => {
  const on = event(4, "size(1,4)", 20, 49, [page({
    commands: [command(355, ["pbBridgeOn"]), command(0)],
  })]);
  const off = event(28, "size(1,4)", 19, 49, [page({
    commands: [command(355, ["pbBridgeOff"]), command(0)],
  })]);
  const npc = event(99, "NPC", 1, 1, [page({
    through: false,
    commands: [command(101, ["hello"]), command(0)],
  })]);
  const projected = projectMapActionRecord(mapEntry(21, [[4, on], [28, off], [99, npc]]));
  assert.equal(projected.key, "21");
  assert.equal(projected.value.schemaVersion, "struct.MapAction/v1-bridge");
  assert.equal(projected.value.opaqueRelated.length, 0);
  assert.equal(projected.value.actions.length, 2);
  assert.equal(projected.value.actions[0].op, "bridge-on");
  assert.equal(projected.value.actions[0].height, 2);
  assert.equal(projected.value.actions[0].eventId, 4);
  assert.equal(projected.value.actions[0].through, false);
  assert.equal(projected.value.actions[0].emptyGraphic, true);
  assert.equal(projected.value.actions[1].op, "bridge-off");
  assert.equal(projected.value.actions[1].eventId, 28);
  assert.deepEqual(projected.value.actions[0].occupied.map((tile) => `${tile.x},${tile.y}`), ["20,46", "20,47", "20,48", "20,49"]);
});

test("confirmable Off is a single script page; mixed bridge scripts are opaque-related", () => {
  const mixed = event(28, "size(1,4)", 19, 49, [page({
    commands: [command(355, ["pbBridgeOn(2)"]), command(655, ["pbBridgeOff"]), command(0)],
  })]);
  const off = event(7, "size(3,1)", 14, 31, [page({
    commands: [command(355, ["pbBridgeOff"]), command(0)],
  })]);
  const projected = projectMapActionRecord(mapEntry(21, [[28, mixed], [7, off]]));
  assert.equal(projected.value.actions.length, 1);
  assert.equal(projected.value.actions[0].op, "bridge-off");
  assert.equal(projected.value.actions[0].height, null);
  assert.equal(projected.value.opaqueRelated.length, 1);
  assert.equal(projected.value.opaqueRelated[0].eventId, 28);
  assert.equal(projected.value.opaqueRelated[0].reason, "bridge-script-not-statically-confirmable");
  assert.ok(projected.value.opaqueRelated[0].occupied.length > 0);
});

test("comment commands remain whitelisted but a non-empty Bridge graphic fails closed", () => {
  const commented = event(4, "size(1,1)", 2, 2, [page({
    through: false,
    commands: [command(108, ["bridge on"]), command(355, ["pbBridgeOn(2)"]), command(0)],
  })]);
  const named = event(5, "size(1,1)", 3, 3, [page({
    through: false,
    characterName: "NPC",
    commands: [command(355, ["pbBridgeOff"]), command(0)],
  })]);
  const projected = projectMapActionRecord(mapEntry(21, [[4, commented], [5, named]]));
  assert.equal(projected.value.actions.length, 1);
  assert.equal(projected.value.actions.find((action) => action.eventId === 4).emptyGraphic, true);
  assert.equal(projected.value.opaqueRelated.length, 1);
  assert.equal(projected.value.opaqueRelated[0].eventId, 5);
  assert.equal(projected.value.opaqueRelated[0].reason, "bridge-candidate-graphic-must-be-empty");
});

test("unrelated NPCs do not fail the map; related opaque scripts fail closed per page", () => {
  const npc = event(2, "Villager", 3, 3, [page({
    trigger: 0,
    commands: [command(101, ["hi"]), command(0)],
  })]);
  const dynamic = event(10, "Bridge?", 5, 5, [page({
    commands: [command(355, ["pbBridgeOn(eval(2))"]), command(0)],
  })]);
  const wrongTrigger = event(11, "size(1,1)", 6, 6, [page({
    trigger: 2,
    commands: [command(355, ["pbBridgeOff"]), command(0)],
  })]);
  const extraCommand = event(12, "size(1,1)", 7, 7, [page({
    commands: [command(355, ["pbBridgeOff"]), command(101, ["no"]), command(0)],
  })]);
  const projected = projectMapActionRecord(mapEntry(8, [[2, npc], [10, dynamic], [11, wrongTrigger], [12, extraCommand]]));
  assert.equal(projected.value.actions.length, 0);
  assert.equal(projected.value.opaqueRelated.length, 3);
  assert.ok(projected.value.opaqueRelated.some((item) => item.reason === "dynamic-ruby"));
  assert.ok(projected.value.opaqueRelated.some((item) => item.reason === "bridge-candidate-trigger-is-not-player-touch"));
  assert.ok(projected.value.opaqueRelated.some((item) => item.reason.startsWith("bridge-page-contains-non-whitelist-command-")));
});

test("Bridge candidates fail closed on extra Ruby, dynamic condition, through, graphic, and orphan commands", () => {
  const cases = [
    event(1, "size(1,1)", 1, 1, [page({ commands: [command(355, ["pbBridgeOn"]), command(355, ["puts 'side effect'"]), command(0)] })]),
    event(2, "size(1,1)", 2, 1, [page({ condition: condition({ switch1: true }), commands: [command(355, ["pbBridgeOff"]), command(0)] })]),
    event(3, "size(1,1)", 3, 1, [page({ through: true, commands: [command(355, ["pbBridgeOff"]), command(0)] })]),
    event(4, "size(1,1)", 4, 1, [page({ characterName: "NPC 01", commands: [command(355, ["pbBridgeOn"]), command(0)] })]),
    event(5, "size(1,1)", 5, 1, [page({ commands: [command(655, ["pbBridgeOn"]), command(0)] })]),
  ];
  const projected = projectMapActionRecord(mapEntry(21, cases.map((item, index) => [index + 1, item])));
  assert.equal(projected.value.actions.length, 0);
  assert.deepEqual(projected.value.opaqueRelated.map((item) => item.reason), [
    "bridge-page-contains-additional-ruby",
    "bridge-candidate-page-condition-is-dynamic",
    "bridge-candidate-through-must-be-false",
    "bridge-candidate-graphic-must-be-empty",
    "bridge-page-contains-non-whitelist-command-655",
  ]);
});

function exactMap21Events() {
  const specs = [
    [4, "size(1,4)", 20, 49, "pbBridgeOn"],
    [28, "size(1,4)", 19, 49, "pbBridgeOff"],
    [7, "size(3,1)", 14, 31, "pbBridgeOff"],
    [10, "size(3,1)", 14, 32, "pbBridgeOn"],
    [20, "size(2,1)", 22, 58, "pbBridgeOff"],
    [22, "size(2,1)", 22, 57, "pbBridgeOn"],
    [23, "size(2,1)", 14, 69, "pbBridgeOff"],
    [25, "size(2,1)", 14, 68, "pbBridgeOn"],
  ];
  return specs.map(([id, name, x, y, script]) => [id, event(id, name, x, y, [page({ commands: [command(355, [script]), command(0)] })])]);
}

test("Map21 audit verifies every event id, operation, position, page shape, and occupied route", () => {
  const evidence = projectMapActionRecord(mapEntry(21, exactMap21Events())).value;
  assert.equal(assertMap21BridgeAudit(evidence), evidence);
  assert.throws(() => assertMap21BridgeAudit({ ...evidence, actions: evidence.actions.slice(1) }), /mapId=21 eventId=4 pageIndex=unknown: missing/u);
  assert.throws(() => assertMap21BridgeAudit({ ...evidence, actions: [...evidence.actions, evidence.actions[0]] }), /mapId=21 eventId=4 pageIndex=0: duplicate/u);
  const wrongPosition = projectMapActionRecord(mapEntry(21, exactMap21Events().map(([id, item]) => id === 4 ? [id, event(4, "size(1,4)", 21, 49, item.fields["@pages"].items)] : [id, item]))).value;
  assert.throws(() => assertMap21BridgeAudit(wrongPosition), /mapId=21 eventId=4 pageIndex=0: event position mismatch/u);
});

test("maps without events still retain empty MapAction conversion evidence", () => {
  const projected = projectMapActionRecord({
    filename: "Map007.rxdata",
    root: object("RPG::Map", {
      "@tileset_id": 1,
      "@width": 2,
      "@height": 2,
      "@data": table(3, 2, 2, 3, Array(12).fill(0)),
    }),
  });
  assert.deepEqual(projected.value, {
    id: 7,
    schemaVersion: "struct.MapAction/v1-bridge",
    actions: [],
    opaqueRelated: [],
  });
});

test("mapper retains MapAction evidence internally but never writes the legacy runtime table", async () => {
  const records = materializeMapActionRecords([mapEntry(21, [])]);
  const plan = mapCanonicalDataset({ domains: { MapAction: records } });
  assert.equal(records.length, 1);
  assert.equal(plan.objects.some((item) => item.table === "MapAction"), false);
  assert.equal(plan.tables.some((item) => item.name === "MapAction"), false);
});

test("live Map7/21/47 source sample: terrain_tags and MapAction (SKIP when FSDB missing)", async (t) => {
  const fsdb = defaultLocalFsdb(repoRoot);
  const tilesetsPath = join(fsdb, "[resource]Data", "Tilesets.rxdata");
  if (!existsSync(tilesetsPath)) {
    t.skip("local official FSDB is not present; synthetic MapAction/Tileset tests still ran");
    return;
  }
  const tilesets = decodeRxdataBytes(await readFile(tilesetsPath), tilesetsPath).root;
  const projectedTilesets = projectTilesetRecords({ filename: "Tilesets.rxdata", root: tilesets });
  assert.ok(projectedTilesets.length > 0);
  for (const record of projectedTilesets) {
    assert.deepEqual(Object.keys(record.value), ["id", "tileset_name", "autotile_names", "passages", "priorities", "terrain_tags"]);
    assert.equal(record.value.passages.xSize, record.value.terrain_tags.xSize);
    assert.ok(record.value.terrain_tags.values.every((tag) => tag >= 0 && tag <= 17));
  }
  const map21 = decodeRxdataBytes(await readFile(join(fsdb, "[resource]Data", "Map021.rxdata")), "Map021.rxdata").root;
  const actions21 = projectMapActionRecord({ filename: "Map021.rxdata", root: map21 });
  const ops = new Map(actions21.value.actions.map((action) => [action.eventId, action.op]));
  assert.equal(ops.get(4), "bridge-on");
  assert.equal(ops.get(28), "bridge-off");
  assert.equal(ops.get(10), "bridge-on");
  assert.equal(ops.get(7), "bridge-off");
  assert.equal(ops.get(22), "bridge-on");
  assert.equal(ops.get(20), "bridge-off");
  assert.equal(ops.get(25), "bridge-on");
  assert.equal(ops.get(23), "bridge-off");
  assert.equal(actions21.value.actions.length, 8);
  assert.ok(actions21.value.actions.every((action) => action.through === false && action.emptyGraphic === true));
  const map7 = projectMapActionRecord({
    filename: "Map007.rxdata",
    root: decodeRxdataBytes(await readFile(join(fsdb, "[resource]Data", "Map007.rxdata")), "Map007.rxdata").root,
  });
  assert.equal(map7.value.actions.some((action) => action.op === "bridge-on" || action.op === "bridge-off"), false);
  const map47 = projectMapActionRecord({
    filename: "Map047.rxdata",
    root: decodeRxdataBytes(await readFile(join(fsdb, "[resource]Data", "Map047.rxdata")), "Map047.rxdata").root,
  });
  assert.equal(map47.value.actions.length, 0);
});
