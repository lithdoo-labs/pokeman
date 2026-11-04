import assert from "node:assert/strict";
import test from "node:test";
import { projectMapRecord, projectTable, projectTilesetRecords } from "./lib/essentials/v21.1/m14-consumer.mjs";
import { mapCanonicalDataset } from "../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/fsdb/mapper.mjs";

const table = (dimensions, xSize, ySize, zSize, values) => ({ kind: "Table", dimensions, xSize, ySize, zSize, values: Int16Array.from(values), rubyObjectId: 1, ivars: {} });
const object = (className, fields) => ({ kind: "RmxpObject", className, fields, extraIvars: {}, rubyObjectId: 2 });
const string = (text) => ({ kind: "RubyString", text, bytes: Buffer.from(text), ivars: {} });
const autotileNames = (...names) => ({
  kind: "Array",
  items: names.map((name) => (name === null ? null : string(name))),
});
const NULL_AUTOTILES = [null, null, null, null, null, null, null];

test("projects MapNNN and Tables to exact ordinary JSON consumer records", () => {
  const values = Array(4 * 3 * 3).fill(0);
  values[2 + 1 * 4] = 385;
  const result = projectMapRecord({ filename: "Map001.rxdata", root: object("RPG::Map", {
    "@tileset_id": 1, "@width": 4, "@height": 3, "@data": table(3, 4, 3, 3, values), "@events": { forbidden: true },
  }) });
  assert.equal(result.key, "1");
  assert.deepEqual(Object.keys(result.value), ["tileset_id", "width", "height", "data"]);
  assert.deepEqual(Object.keys(result.value.data), ["dimensions", "xSize", "ySize", "zSize", "values"]);
  assert.equal(result.value.data.values[2 + 1 * 4], 385);
  assert.ok(Array.isArray(result.value.data.values));
});

test("projects Tilesets by source index and rejects id mismatch", () => {
  const make = (id, names = NULL_AUTOTILES) => object("RPG::Tileset", {
    "@id": id, "@tileset_name": string("m14_tileset"),
    "@autotile_names": autotileNames(...names),
    "@passages": table(1, 386, 1, 1, Array(386).fill(0)),
    "@priorities": table(1, 386, 1, 1, Array(386).fill(0)),
    "@terrain_tags": table(1, 386, 1, 1, Array(386).fill(0)),
  });
  const projected = projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, make(1)] } });
  assert.deepEqual(Object.keys(projected[0].value), ["id", "tileset_name", "autotile_names", "passages", "priorities", "terrain_tags"]);
  assert.deepEqual(projected[0].value.autotile_names, NULL_AUTOTILES);
  assert.throws(() => projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, make(2)] } }), /does not match/);
});

test("projects Outside-style autotile_names and normalizes empty strings to null", () => {
  const outside = object("RPG::Tileset", {
    "@id": 1, "@tileset_name": string("Outside"),
    "@autotile_names": autotileNames("Sea", "Sea without shore", "Sea deep", "Sand shore", "Flowers1", "Water rock", "Fountain1"),
    "@passages": table(1, 1, 1, 1, [0]), "@priorities": table(1, 1, 1, 1, [0]), "@terrain_tags": table(1, 1, 1, 1, [0]),
  });
  const projected = projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, outside] } });
  assert.deepEqual(projected[0].value.autotile_names, [
    "Sea", "Sea without shore", "Sea deep", "Sand shore", "Flowers1", "Water rock", "Fountain1",
  ]);
  const withEmpty = object("RPG::Tileset", {
    "@id": 1, "@tileset_name": string("Outside"),
    "@autotile_names": autotileNames("Sea", "", null, "Sand shore", "Flowers1", "Water rock", "Fountain1"),
    "@passages": table(1, 1, 1, 1, [0]), "@priorities": table(1, 1, 1, 1, [0]), "@terrain_tags": table(1, 1, 1, 1, [0]),
  });
  assert.deepEqual(
    projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, withEmpty] } })[0].value.autotile_names,
    ["Sea", null, null, "Sand shore", "Flowers1", "Water rock", "Fountain1"],
  );
});

test("fails closed for malformed autotile_names", () => {
  const badLength = object("RPG::Tileset", {
    "@id": 1, "@tileset_name": string("Outside"),
    "@autotile_names": { kind: "Array", items: [null, null] },
    "@passages": table(1, 1, 1, 1, [0]), "@priorities": table(1, 1, 1, 1, [0]), "@terrain_tags": table(1, 1, 1, 1, [0]),
  });
  assert.throws(
    () => projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, badLength] } }),
    /length 7/,
  );
  const badElement = object("RPG::Tileset", {
    "@id": 1, "@tileset_name": string("Outside"),
    "@autotile_names": { kind: "Array", items: [null, null, null, null, 4, null, null] },
    "@passages": table(1, 1, 1, 1, [0]), "@priorities": table(1, 1, 1, 1, [0]), "@terrain_tags": table(1, 1, 1, 1, [0]),
  });
  assert.throws(
    () => projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, badElement] } }),
    /nil or a Ruby string/,
  );
});

test("omits only unreferenced empty-name v21.1 placeholders and rejects referenced ones", () => {
  const empty = object("RPG::Tileset", {
    "@id": 1, "@tileset_name": string(""),
    "@autotile_names": autotileNames(...NULL_AUTOTILES),
    "@passages": table(1, 1, 1, 1, [0]), "@priorities": table(1, 1, 1, 1, [0]), "@terrain_tags": table(1, 1, 1, 1, [0]),
  });
  const entry = { filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, empty] } };
  assert.deepEqual(projectTilesetRecords(entry), []);
  assert.throws(() => projectTilesetRecords(entry, new Set([1])), /non-empty Ruby string/);
});

test("fails closed for malformed required Table facts", () => {
  assert.throws(() => projectTable(table(3, 2, 2, 3, [1]), "bad"), /invalid value count/);
});

test("projects terrain_tags with matching 1D tables and rejects illegal tags", () => {
  const tags = Array(386).fill(0);
  tags[15] = 15;
  const make = (terrain) => object("RPG::Tileset", {
    "@id": 1, "@tileset_name": string("m14_tileset"),
    "@autotile_names": autotileNames(...NULL_AUTOTILES),
    "@passages": table(1, 386, 1, 1, Array(386).fill(0)),
    "@priorities": table(1, 386, 1, 1, Array(386).fill(0)),
    "@terrain_tags": terrain,
  });
  const ok = projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, make(table(1, 386, 1, 1, tags))] } });
  assert.equal(ok[0].value.terrain_tags.values[15], 15);
  assert.throws(
    () => projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, make(table(1, 8, 1, 1, Array(8).fill(0)))] } }),
    /xSize must match/,
  );
  const outOfRange = Array(386).fill(0);
  outOfRange[0] = 18;
  assert.throws(
    () => projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, make(table(1, 386, 1, 1, outOfRange))] } }),
    /0 through 17/,
  );
  assert.throws(
    () => projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, make(table(3, 2, 2, 2, Array(8).fill(0)))] } }),
    /must be a 1D Table/,
  );
  const missing = object("RPG::Tileset", {
    "@id": 1, "@tileset_name": string("m14_tileset"),
    "@autotile_names": autotileNames(...NULL_AUTOTILES),
    "@passages": table(1, 386, 1, 1, Array(386).fill(0)),
    "@priorities": table(1, 386, 1, 1, Array(386).fill(0)),
  });
  assert.throws(
    () => projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, missing] } }),
    /terrain_tags must be an RGSS Table/,
  );
});

test("production FSDB plan writes M14 consumer values as ordinary JSON", async () => {
  const map = projectMapRecord({ filename: "Map001.rxdata", root: object("RPG::Map", {
    "@tileset_id": 1, "@width": 1, "@height": 1, "@data": table(3, 1, 1, 3, [384, 0, 0]),
  }) });
  const plan = mapCanonicalDataset({ domains: { Map: [map] } });
  const chunks = []; for await (const chunk of plan.objects[0].open()) chunks.push(chunk);
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.deepEqual(Object.keys(value), ["tileset_id", "width", "height", "data"]);
  assert.equal(JSON.stringify(value).includes("$id"), false);
  assert.equal(JSON.stringify(value).includes("$array"), false);
});
