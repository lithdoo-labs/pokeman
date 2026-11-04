import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { materializeMapTransferRecords, projectedD0Passable } from "./lib/essentials/v21.1/map-transfer-consumer.mjs";
import { buildCanonicalDataset } from "../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/essentials/v21.1/simple-game-data.mjs";
import { mapCanonicalDataset } from "../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/fsdb/mapper.mjs";
import { buildSourceManifest } from "../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/source/manifest.mjs";

const table = (dimensions, xSize, ySize, zSize, values) => ({ kind: "Table", dimensions, xSize, ySize, zSize, values: Int16Array.from(values), rubyObjectId: 1, ivars: {} });
const object = (className, fields) => ({ kind: "RmxpObject", className, fields, extraIvars: {}, rubyObjectId: 2 });
const string = (text) => ({ kind: "RubyString", text, bytes: Buffer.from(text), ivars: {} });
const array = (items) => ({ kind: "Array", items });
const hash = (entries) => ({ kind: "Hash", entries });

function mapValues(width, height, paint) {
  const values = Array(width * height * 3).fill(0);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) values[x + y * width] = 384;
  paint?.(values, width, height);
  return values;
}

function mapEntry(id, width, height, tilesetId = 1, paint) {
  const values = mapValues(width, height, paint);
  return {
    key: String(id),
    value: {
      tileset_id: tilesetId,
      width,
      height,
      data: { dimensions: 3, xSize: width, ySize: height, zSize: 3, values },
    },
  };
}

function tilesetEntry(idOrPaint = 1, paint) {
  const id = typeof idOrPaint === "function" ? 1 : idOrPaint;
  const apply = typeof idOrPaint === "function" ? idOrPaint : paint;
  const passages = Array(386).fill(0);
  const priorities = Array(386).fill(0);
  apply?.(passages, priorities);
  return {
    key: String(id),
    value: {
      id,
      tileset_name: "outside",
      passages: { dimensions: 1, xSize: 386, ySize: 1, zSize: 1, values: passages },
      priorities: { dimensions: 1, xSize: 386, ySize: 1, zSize: 1, values: priorities },
    },
  };
}

function condition(flags = {}) {
  return object("RPG::Event::Page::Condition", {
    "@switch1_valid": flags.switch1 === true,
    "@switch2_valid": false,
    "@variable_valid": false,
    "@self_switch_valid": false,
  });
}

function page(fields) {
  return object("RPG::Event::Page", {
    "@condition": fields.condition ?? condition(),
    "@graphic": object("RPG::Event::Page::Graphic", {
      "@character_name": string(fields.graphic ?? ""),
      "@tile_id": fields.tileId ?? 0,
    }),
    "@through": fields.through ?? false,
    "@always_on_top": fields.alwaysOnTop ?? false,
    "@trigger": fields.trigger ?? 1,
    "@list": array(fields.commands ?? []),
  });
}

function command(code, indent, parameters) {
  return object("RPG::EventCommand", {
    "@code": code,
    "@indent": indent,
    "@parameters": array(parameters),
  });
}

function transferCommand(mapId, x, y, direction = 0, appointment = 0) {
  return command(201, 0, [appointment, mapId, x, y, direction, 1]);
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

function mapRoot(id, width, height, events, tilesetId = 1, paint) {
  const fields = {
    "@tileset_id": tilesetId,
    "@width": width,
    "@height": height,
    "@data": table(3, width, height, 3, mapValues(width, height, paint)),
  };
  if (events !== undefined) fields["@events"] = events;
  return { filename: `Map${String(id).padStart(3, "0")}.rxdata`, root: object("RPG::Map", fields) };
}

function connections(lines) {
  return [{
    family: "connections",
    file: "PBS/map_connections.txt",
    representation: "ordered-lines",
    lines: lines.map((value) => ({ value, source: { file: "PBS/map_connections.txt" } })),
  }];
}

function byId(records) {
  return new Map(records.map((record) => [record.key, record.value]));
}

function empty(record) {
  return record.steps.length === 0 && record.contacts.length === 0 && record.edges.length === 0;
}

test("projects E-CONTACT-1 door contacts from the static page", () => {
  const maps = [mapEntry(66, 22, 20), mapEntry(67, 10, 10)];
  const tilesets = [tilesetEntry()];
  const door = event(1, "Door", 12, 7, [
    page({ graphic: "door", commands: [transferCommand(67, 4, 7, 8)] }),
    page({ condition: condition({ switch1: true }), trigger: 3, through: true, commands: [transferCommand(67, 0, 0, 0)] }),
  ]);
  const records = byId(materializeMapTransferRecords([
    mapRoot(66, 22, 20, hash([[1, door]])),
    mapRoot(67, 10, 10, hash([])),
  ], maps, tilesets, []));
  assert.deepEqual(records.get("66").contacts.find((item) => item.x === 12 && item.y === 8 && item.direction === 8), {
    x: 12, y: 8, direction: 8, targetMapId: 67, targetX: 4, targetY: 7, targetDirection: 8,
  });
  assert.equal(records.get("66").contacts.length, 4);
  assert.equal(records.get("66").steps.length, 0);
  assert.ok(empty(records.get("67")));
});

test("projects empty-graphic Exit as StepTransfer only when the event tile is d=0 passable", () => {
  const maps = [mapEntry(66, 22, 20), mapEntry(67, 10, 10)];
  const tilesets = [tilesetEntry()];
  const exit = event(1, "Exit", 4, 8, [page({ graphic: "", tileId: 0, commands: [transferCommand(66, 12, 7, 0)] })]);
  const records = byId(materializeMapTransferRecords([
    mapRoot(66, 22, 20, hash([])),
    mapRoot(67, 10, 10, hash([[1, exit]])),
  ], maps, tilesets, []));
  assert.deepEqual(records.get("67").steps, [{
    x: 4, y: 8, targetMapId: 66, targetX: 12, targetY: 7, targetDirection: null,
  }]);
  assert.equal(records.get("67").contacts.length, 0);
});

test("projects Map067-style empty-graphic Exit as ContactTransfer when the event tile is d=0 blocked", () => {
  const paint = (values, width) => { values[4 + 8 * width] = 385; };
  const maps = [mapEntry(66, 22, 20), mapEntry(67, 10, 10, 1, paint)];
  const tilesets = [tilesetEntry((passages) => { passages[385] = 0x0f; })];
  const exit = event(1, "Exit", 4, 8, [page({ graphic: "", tileId: 0, commands: [transferCommand(66, 12, 7, 0)] })]);
  const records = byId(materializeMapTransferRecords([
    mapRoot(66, 22, 20, hash([])),
    mapRoot(67, 10, 10, hash([[1, exit]]), 1, paint),
  ], maps, tilesets, []));
  assert.deepEqual(records.get("67").contacts.find((item) => item.x === 4 && item.y === 7 && item.direction === 2), {
    x: 4, y: 7, direction: 2, targetMapId: 66, targetX: 12, targetY: 7, targetDirection: null,
  });
  assert.equal(records.get("67").contacts.length, 4);
  assert.equal(records.get("67").steps.length, 0);
});

test("projects E-STEP-1 holes when the event tile is d=0 passable", () => {
  const maps = [mapEntry(49, 20, 20), mapEntry(50, 20, 20), mapEntry(34, 30, 40)];
  const tilesets = [tilesetEntry()];
  const hole49 = event(4, "Hole", 12, 7, [page({ through: true, commands: [transferCommand(50, 12, 7, 0)] })]);
  const hole34 = event(6, "Hole", 22, 14, [page({ through: true, commands: [transferCommand(34, 16, 30, 0)] })]);
  const records = byId(materializeMapTransferRecords([
    mapRoot(49, 20, 20, hash([[4, hole49]])),
    mapRoot(50, 20, 20, hash([])),
    mapRoot(34, 30, 40, hash([[6, hole34]])),
  ], maps, tilesets, []));
  assert.deepEqual(records.get("49").steps, [{ x: 12, y: 7, targetMapId: 50, targetX: 12, targetY: 7, targetDirection: null }]);
  assert.deepEqual(records.get("34").steps, [{ x: 22, y: 14, targetMapId: 34, targetX: 16, targetY: 30, targetDirection: null }]);
  assert.equal(records.get("49").contacts.length, 0);
});

test("ignores unsupported events instead of emitting transfers", () => {
  const maps = [mapEntry(1, 8, 8, 1, (values, width) => {
    values[2 + 2 * width] = 385;
    values[3 + 1 * width] = 385;
  }), mapEntry(2, 8, 8)];
  const tilesets = [tilesetEntry((passages) => { passages[385] = 0x0f; })];
  const blocked = mapValues(8, 8, (values, width) => {
    values[2 + 2 * width] = 385;
    values[3 + 1 * width] = 385;
  });
  const events = hash([
    [1, event(1, "hiddenitem", 1, 1, [page({ graphic: "item", commands: [transferCommand(2, 0, 0, 0)] })])],
    [2, event(2, "size(2,2)", 1, 2, [page({ graphic: "rock", commands: [transferCommand(2, 0, 0, 0)] })])],
    [3, event(3, "Action", 1, 3, [page({ trigger: 0, graphic: "npc", commands: [transferCommand(2, 0, 0, 0)] })])],
    [4, event(4, "Top", 1, 4, [page({ alwaysOnTop: true, graphic: "npc", commands: [transferCommand(2, 0, 0, 0)] })])],
    [5, event(5, "BlankTile", 1, 5, [page({ graphic: "", tileId: 1, commands: [transferCommand(2, 0, 0, 0)] })])],
    [6, event(6, "Nested", 3, 3, [page({ graphic: "npc", commands: [command(201, 1, [0, 2, 0, 0, 0, 1])] })])],
    [7, event(7, "Variable", 3, 4, [page({ graphic: "npc", commands: [transferCommand(2, 0, 0, 0, 1)] })])],
    [8, event(8, "BlockedHole", 2, 2, [page({ through: true, commands: [transferCommand(2, 0, 0, 0)] })])],
    [9, event(9, "NoPage", 3, 5, [page({ condition: condition({ switch1: true }), graphic: "npc", commands: [transferCommand(2, 0, 0, 0)] })])],
  ]);
  const records = byId(materializeMapTransferRecords([
    { filename: "Map001.rxdata", root: object("RPG::Map", {
      "@tileset_id": 1, "@width": 8, "@height": 8, "@data": table(3, 8, 8, 3, blocked), "@events": events,
    }) },
    mapRoot(2, 8, 8, hash([])),
  ], maps, tilesets, []));
  assert.ok(empty(records.get("1")));
});

test("fails closed for malformed events, missing targets, out-of-bounds targets, and duplicates", () => {
  const maps = [mapEntry(1, 8, 8), mapEntry(2, 8, 8)];
  const tilesets = [tilesetEntry()];
  const roots = (events) => [mapRoot(1, 8, 8, events), mapRoot(2, 8, 8, hash([]))];
  const fail = (events, message) => {
    assert.throws(
      () => materializeMapTransferRecords(roots(events), maps, tilesets, []),
      (error) => error.category === "MAP_TRANSFER_CONSUMER_PROJECTION_FAILURE" && message.test(error.message),
    );
  };
  fail({ kind: "Array", items: [] }, /@events must be a Hash/);
  fail(hash([[1, event(1, "Door", 1, 1, [page({ graphic: "door", commands: [transferCommand(99, 0, 0, 0)] })])]]), /does not exist/);
  fail(hash([[1, event(1, "Door", 1, 1, [page({ graphic: "door", commands: [transferCommand(2, 20, 0, 0)] })])]]), /out of bounds/);
  const first = event(1, "HoleA", 3, 3, [page({ through: true, commands: [transferCommand(2, 0, 0, 0)] })]);
  const second = event(2, "HoleB", 3, 3, [page({ through: true, commands: [transferCommand(2, 1, 1, 0)] })]);
  fail(hash([[1, first], [2, second]]), /duplicate step/);
});

test("projects frozen connection geometry vectors", () => {
  const maps = [mapEntry(2, 20, 20), mapEntry(66, 22, 20)];
  const tilesets = [tilesetEntry()];
  const records = byId(materializeMapTransferRecords([
    mapRoot(2, 20, 20),
    mapRoot(66, 22, 20),
  ], maps, tilesets, connections(["2,W,0,66,E,0"])));
  assert.deepEqual(records.get("66").edges.find((item) => item.x === 21 && item.y === 8 && item.direction === 6), {
    x: 21, y: 8, direction: 6, targetMapId: 2, targetX: 0, targetY: 8,
  });
  assert.deepEqual(records.get("2").edges.find((item) => item.x === 0 && item.y === 8 && item.direction === 4), {
    x: 0, y: 8, direction: 4, targetMapId: 66, targetX: 21, targetY: 8,
  });
});

test("projects the south/north frozen connection vector", () => {
  const maps = [mapEntry(7, 20, 43), mapEntry(5, 30, 20)];
  const tilesets = [tilesetEntry()];
  const records = byId(materializeMapTransferRecords([
    mapRoot(7, 20, 43),
    mapRoot(5, 30, 20),
  ], maps, tilesets, connections(["7,S,0,5,N,2"])));
  assert.deepEqual(records.get("7").edges.find((item) => item.x === 16 && item.y === 42 && item.direction === 2), {
    x: 16, y: 42, direction: 2, targetMapId: 5, targetX: 18, targetY: 0,
  });
  assert.deepEqual(records.get("5").edges.find((item) => item.x === 18 && item.y === 0 && item.direction === 8), {
    x: 18, y: 0, direction: 8, targetMapId: 7, targetX: 16, targetY: 42,
  });
});

test("empty connection geometry emits zero EdgeTransfers", () => {
  const maps = [mapEntry(7, 20, 43), mapEntry(23, 10, 78)];
  const tilesets = [tilesetEntry()];
  const records = byId(materializeMapTransferRecords([
    mapRoot(7, 20, 43),
    mapRoot(23, 10, 78),
  ], maps, tilesets, connections(["7,E,0,23,W,78"])));
  assert.equal(records.get("7").edges.length, 0);
  assert.equal(records.get("23").edges.length, 0);
});

test("d=0 blocked connection landings emit zero EdgeTransfers", () => {
  const maps = [
    mapEntry(66, 22, 20, 1, (values, width) => { values[18] = 385; }),
    mapEntry(5, 1, 24, 1, (values, width) => { values[0 + 23 * width] = 385; }),
  ];
  const tilesets = [tilesetEntry((passages) => { passages[385] = 0x0f; })];
  const records = byId(materializeMapTransferRecords([
    mapRoot(66, 22, 20, undefined, 1, (values, width) => { values[18] = 385; }),
    mapRoot(5, 1, 24, undefined, 1, (values, width) => { values[0 + 23 * width] = 385; }),
  ], maps, tilesets, connections(["66,N,18,5,S,0"])));
  assert.equal(records.get("66").edges.length, 0);
  assert.equal(records.get("5").edges.length, 0);
});

test("every Map has a MapTransfer record, including empty maps", () => {
  const maps = [mapEntry(1, 4, 4), mapEntry(8, 4, 4)];
  const tilesets = [tilesetEntry()];
  const records = materializeMapTransferRecords([
    mapRoot(1, 4, 4, hash([])),
    mapRoot(8, 4, 4),
  ], maps, tilesets, []);
  assert.deepEqual(records.map((record) => record.key), ["1", "8"]);
  assert.deepEqual(records[0].value, { id: 1, steps: [], contacts: [], edges: [] });
  assert.ok(empty(records[1].value));
});

test("projectedD0Passable follows z=2,1,0 and fails closed on illegal tile ids", () => {
  const map = mapEntry(1, 2, 2).value;
  const tileset = tilesetEntry(1, (passages, priorities) => { passages[385] = 0x0f; priorities[385] = 1; }).value;
  map.data.values[0] = 384;
  assert.equal(projectedD0Passable(map, tileset, 0, 0), true);
  map.data.values[0] = 385;
  assert.equal(projectedD0Passable(map, tileset, 0, 0), false);
  assert.equal(projectedD0Passable(map, tileset, -1, 0), false);
  map.data.values[0] = 400;
  assert.throws(() => projectedD0Passable(map, tileset, 0, 0), /outside Tileset/);
});

test("simple-game-data integration exposes an empty MapTransfer domain", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "map-transfer-canonical-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "PBS"));
  await writeFile(join(root, "PBS", "types.txt"), "[NORMAL]\nName=Normal\n");
  await writeFile(join(root, "PBS", "abilities.txt"), "[OVERGROW]\nName=Overgrow\nDescription=Powers up Grass moves.\n");
  await writeFile(join(root, "PBS", "moves.txt"), "[TACKLE]\nName=Tackle\nType=NORMAL\nCategory=Physical\nTarget=NearFoe\n");
  await writeFile(join(root, "PBS", "items.txt"), "[POTION]\nName=Potion\nNamePlural=Potions\nPocket=1\nPrice=100\n");
  const dataset = await buildCanonicalDataset(await buildSourceManifest(root));
  assert.ok(Array.isArray(dataset.domains.MapTransfer));
  assert.equal(dataset.domains.MapTransfer.length, 0);
});

test("mapCanonicalDataset writes MapTransfer as ordinary JSON without typed markup", async () => {
  const plan = mapCanonicalDataset({
    domains: {
      MapTransfer: [{
        key: "66",
        value: {
          id: 66,
          steps: [],
          contacts: [{ x: 12, y: 8, direction: 8, targetMapId: 67, targetX: 4, targetY: 7, targetDirection: 8 }],
          edges: [{ x: 21, y: 8, direction: 6, targetMapId: 2, targetX: 0, targetY: 8 }],
        },
      }],
    },
  });
  const object = plan.objects.find((item) => item.table === "MapTransfer" && item.key === "66");
  const chunks = [];
  for await (const chunk of object.open()) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  const value = JSON.parse(text);
  assert.deepEqual(Object.keys(value), ["id", "steps", "contacts", "edges"]);
  assert.equal(text.includes("$id"), false);
  assert.equal(text.includes("$array"), false);
  assert.equal(text.includes("$ref"), false);
  assert.equal(text.includes("$typed"), false);
});
