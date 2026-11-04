import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import test from "node:test";
import { ImportFailure } from "../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/errors.mjs";
import {
  BRIDGE_TERRAIN_TAG,
  COMPLETENESS,
  classifyCandidates,
  collectBridgeCells,
  collectMap7Evidence,
  collectMapEvidence,
  concatenateScriptCommands,
  defaultLocalFsdb,
  extractMapFacts,
  occupiedTiles,
  parseEvidenceArguments,
  parseEventSize,
  scanCoverage,
  walkCommonEventGraph,
  wouldProjectEventAsTransfer,
} from "./lib/essentials/v21.1/map-event-evidence.mjs";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
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

function condition(flags = {}) {
  return object("RPG::Event::Page::Condition", {
    "@switch1_valid": flags.switch1 === true,
    "@switch2_valid": flags.switch2 === true,
    "@variable_valid": flags.variable === true,
    "@self_switch_valid": flags.selfSwitch === true,
    "@switch1_id": flags.switch1Id ?? 1,
    "@switch2_id": flags.switch2Id ?? 1,
    "@variable_id": flags.variableId ?? 1,
    "@variable_value": flags.variableValue ?? 0,
    "@self_switch_ch": string(flags.selfSwitchCh ?? "A"),
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
    "@move_route": fields.moveRoute ?? object("RPG::MoveRoute", {
      "@repeat": false,
      "@skippable": false,
      "@list": array([object("RPG::MoveCommand", { "@code": 0, "@parameters": array([]) })]),
    }),
    "@list": array(fields.commands ?? [command(0, 0, [])]),
  });
}

function moveCommand(code, parameters = []) {
  return object("RPG::MoveCommand", {
    "@code": code,
    "@parameters": array(parameters),
  });
}

function moveRoute(commands) {
  return object("RPG::MoveRoute", {
    "@repeat": false,
    "@skippable": true,
    "@list": array(commands),
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

function mapRoot(events, width = 4, height = 3, tilesetId = 1) {
  return object("RPG::Map", {
    "@tileset_id": tilesetId,
    "@width": width,
    "@height": height,
    "@data": table(3, width, height, 3, Array(width * height * 3).fill(0)),
    "@events": hash(events),
  });
}

test("CLI defaults to Map 7, allows Map 21 and Map 47, and refuses any other map id", () => {
  assert.deepEqual(parseEvidenceArguments([]), { source: undefined, output: undefined, mapId: 7, corpusScan: false });
  assert.deepEqual(parseEvidenceArguments(["--source", "fsdb", "--output", "out.json"]), {
    source: "fsdb",
    output: "out.json",
    mapId: 7,
    corpusScan: false,
  });
  assert.deepEqual(parseEvidenceArguments(["--corpus-scan"]), {
    source: undefined,
    output: undefined,
    mapId: 7,
    corpusScan: true,
  });
  assert.deepEqual(parseEvidenceArguments(["--map", "21"]), {
    source: undefined,
    output: undefined,
    mapId: 21,
    corpusScan: false,
  });
  assert.deepEqual(parseEvidenceArguments(["--map", "47"]), {
    source: undefined,
    output: undefined,
    mapId: 47,
    corpusScan: false,
  });
  assert.throws(
    () => parseEvidenceArguments(["--map", "27"]),
    (error) => error instanceof ImportFailure && error.category === "MAP_EVENT_EVIDENCE_FAILURE" && /only reads Maps 7, 21, 47/.test(error.message),
  );
  assert.throws(
    () => parseEvidenceArguments(["--unknown"]),
    (error) => error instanceof ImportFailure && error.category === "MAP_EVENT_EVIDENCE_FAILURE",
  );
});

test("extracts every page in original order and concatenates 355/655 scripts like v21.1 command_355", () => {
  const root = mapRoot([[2, event(2, "Later", 1, 0, [page({ trigger: 0, commands: [command(0, 0, [])] })])], [1, event(1, "BridgeEnd", 2, 1, [
    page({
      trigger: 1,
      through: true,
      commands: [
        command(355, 0, [string("pbBridgeOn")]),
        command(655, 0, [string("(2)")]),
        command(355, 0, [string("pbBridgeOff")]),
        command(0, 0, []),
      ],
    }),
    page({
      condition: condition({ switch1: true, switch1Id: 9 }),
      trigger: 3,
      commands: [command(201, 0, [0, 13, 4, 29, 8]), command(0, 0, [])],
    }),
  ])]]);
  const facts = extractMapFacts(root, 7, "Map007.rxdata");
  assert.deepEqual(facts.events.map((item) => item.eventId), [1, 2]);
  assert.equal(facts.events[0].pageCount, 2);
  assert.deepEqual(facts.events[0].pages.map((item) => item.pageIndex), [0, 1]);
  assert.equal(facts.events[0].pages[0].triggerSemantics, "player-touch");
  assert.equal(facts.events[0].pages[0].through, true);
  assert.deepEqual(facts.events[0].pages[0].commands.map((item) => item.code), [355, 655, 355, 0]);
  assert.deepEqual(facts.events[0].pages[0].concatenatedScripts, [
    { startCommandIndex: 0, endCommandIndex: 2, joinedWithNewlines: "pbBridgeOn\n(2)\npbBridgeOff\n" },
  ]);
  assert.equal(facts.events[0].pages[1].condition.switch1_valid, true);
  assert.equal(facts.events[0].pages[1].condition.switch1_id, 9);
  assert.equal(facts.events[0].pages[1].condition.alwaysActive, false);
  assert.equal(facts.events[0].pages[1].commands[0].label, "transfer-player");
  const coverage = scanCoverage(facts.events);
  assert.equal(coverage.eventCount, 2);
  assert.equal(coverage.pageCount, 3);
  assert.equal(coverage.allPagesScanned, true);
  assert.equal(coverage.scriptCommandCount, 3);
  assert.equal(coverage.scripts.length, 1);
  assert.equal(coverage.scripts[0].joinedWithNewlines, "pbBridgeOn\n(2)\npbBridgeOff\n");
  assert.equal(coverage.scripts[0].matchesBridgePattern, true);
  assert.equal(coverage.scripts[0].kind, "event-command-355-655");
  assert.ok(coverage.scannedEntrances.includes("move-route-209-509-and-page-autonomous-list-code-45"));
});

test("concatenateScriptCommands keeps original command order and does not eval Ruby", () => {
  const groups = concatenateScriptCommands([
    { index: 0, code: 355, scriptText: "raise 'no'" },
    { index: 1, code: 655, scriptText: "pbBridgeOn(2)" },
    { index: 2, code: 0, scriptText: undefined },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].joinedWithNewlines, "raise 'no'\npbBridgeOn(2)\n");
});

test("unknown command codes are preserved rather than dropped", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "Odd", 0, 0, [page({ commands: [command(999, 2, [string("keep")]), command(0, 0, [])] })])]]), 7, "Map007.rxdata");
  assert.equal(facts.events[0].pages[0].commands[0].code, 999);
  assert.equal(facts.events[0].pages[0].commands[0].label, "unknown-code-999");
  assert.equal(facts.events[0].pages[0].commands[0].indent, 2);
});

test("command 404 is labeled show-choices-branch-end and is not treated as empty", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "Choices", 0, 0, [page({ commands: [command(404, 0, []), command(0, 0, [])] })])]]), 47, "Map047.rxdata");
  assert.equal(facts.events[0].pages[0].commands[0].code, 404);
  assert.equal(facts.events[0].pages[0].commands[0].label, "show-choices-branch-end");
});

test("RMXP move-route continuation code 509 is labeled and kept in order", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "Door", 0, 0, [page({ commands: [command(209, 0, []), command(509, 0, []), command(0, 0, [])] })])]]), 7, "Map007.rxdata");
  assert.deepEqual(facts.events[0].pages[0].commands.map((item) => [item.code, item.label]), [
    [209, "set-move-route"],
    [509, "move-route-continuation"],
    [0, "empty-or-end"],
  ]);
});

test("invalid event structure fails closed", () => {
  assert.throws(
    () => extractMapFacts(object("RPG::Actor", {}), 7, "Map007.rxdata"),
    (error) => error instanceof ImportFailure && error.category === "MAP_EVENT_EVIDENCE_FAILURE",
  );
  assert.throws(
    () => extractMapFacts(mapRoot([[1, object("RPG::Event", { "@id": 1, "@name": string("x"), "@x": 0, "@y": 0, "@pages": "nope" })]]), 7, "Map007.rxdata"),
    (error) => error instanceof ImportFailure && error.category === "MAP_EVENT_EVIDENCE_FAILURE",
  );
});

test("bridge scan keeps unnamed script events and does not silently drop adjacent unknown events", () => {
  const facts = extractMapFacts(mapRoot([
    [10, event(10, "NPC", 0, 0, [page({ commands: [command(0, 0, [])] })])],
    [11, event(11, "", 1, 1, [page({ through: true, trigger: 1, commands: [command(355, 0, [string("pbBridgeOn(2)")]), command(0, 0, [])] })])],
    [12, event(12, "CanalEdge", 2, 1, [page({ commands: [command(108, 0, [string("maybe related")]), command(0, 0, [])] })])],
  ], 4, 3), 7, "Map007.rxdata");
  const values = Array(4 * 3 * 3).fill(0);
  values[1 + 1 * 4 + 2 * 4 * 3] = 900;
  const bridgeCells = collectBridgeCells({ ...facts, data: table(3, 4, 3, 3, values) }, table(1, 1000, 1, 1, Array.from({ length: 1000 }, (_, id) => id === 900 ? BRIDGE_TERRAIN_TAG : 0)));
  assert.equal(bridgeCells.cellCount, 1);
  assert.deepEqual(bridgeCells.cells[0], { x: 1, y: 1, layers: [{ z: 2, tileId: 900, terrainTag: 15 }] });
  const candidates = classifyCandidates(facts.events, bridgeCells);
  const byId = new Map(candidates.map((item) => [item.eventId, item]));
  assert.equal(byId.get(11).status, "confirmed-bridge-script");
  assert.ok(byId.get(11).reasons.includes("page-script-calls-pbBridgeOn-or-pbBridgeOff"));
  assert.equal(byId.get(12).status, "unconfirmed-candidate");
  assert.ok(byId.get(12).reasons.includes("event-occupied-tile-orthogonally-adjacent-to-bridge-terrain"));
  assert.equal(byId.has(10), false);
});

test("local Map 7 FSDB extraction is deterministic when the official corpus is present", async (t) => {
  const fsdb = defaultLocalFsdb(repoRoot);
  const mapPath = join(fsdb, "[resource]Data", "Map007.rxdata");
  if (!existsSync(mapPath)) {
    t.skip("local examples/essentials-v21.1-local/[FSDB]Essentials v21.1 is not present");
    return;
  }
  const first = await collectMap7Evidence(fsdb);
  const second = await collectMap7Evidence(fsdb);
  assert.equal(first.map.mapId, 7);
  assert.equal(first.map.filename, "Map007.rxdata");
  assert.equal(first.map.name, "Cedolan City");
  assert.equal(first.map.width, 60);
  assert.equal(first.map.height, 43);
  assert.equal(first.map.tilesetId, 1);
  assert.equal(first.coverage.allPagesScanned, true);
  assert.equal(first.coverage.eventCount, 11);
  assert.equal(first.coverage.pageCount, 19);
  assert.equal(first.completeness.status, "COMPLETE");
  assert.equal(first.completeness.provenNegativeBridge, true);
  assert.equal(first.bridgeTerrain.scanStatus, "COMPLETE");
  assert.equal(first.bridgeTerrain.cellCount, 0);
  assert.equal(first.candidates.length, 0);
  assert.deepEqual(first.coverage.eventIdsInOrder, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  assert.equal(first.source.files.map.sha256, "c34ddaaec265241fd35149d6d3758f8f08a5503b057c891e396c39b08518c6b7");
  assert.equal(first.coverage.scripts.every((item) => item.matchesBridgePattern === false), true);
  assert.equal(first.corpusScan, null);
  const scanned = await collectMap7Evidence(fsdb, { corpusScan: true });
  assert.equal(scanned.candidates.length, 0);
  assert.equal(scanned.coverage.scripts.every((item) => item.matchesBridgePattern === false), true);
  assert.equal(scanned.corpusScan.mapsWithBridgeScripts.some((item) => item.mapId === 7), false);
  assert.equal(scanned.corpusScan.mapsUsingBridgeTiles.some((item) => item.mapId === 7), false);
  const route2Scripts = scanned.corpusScan.mapsWithBridgeScripts.find((item) => item.mapId === 21);
  assert.equal(route2Scripts?.name, "Route 2");
  assert.equal(route2Scripts.hits.length, 8);
  const route2Tiles = scanned.corpusScan.mapsUsingBridgeTiles.find((item) => item.mapId === 21);
  assert.equal(route2Tiles?.name, "Route 2");
  assert.equal(route2Tiles.uniqueCellCount, 93);
  assert.equal(route2Tiles.placedBridgeTaggedTiles, 93);
  assert.deepEqual(scanned.corpusScan.mapsUsingBridgeTiles.map((item) => item.mapId), [21]);
  assert.deepEqual(scanned.corpusScan.mapsWithBridgeScripts.map((item) => item.mapId), [21]);
  assert.equal(scanned.corpusScan.inventory.length, 1);
  assert.deepEqual(scanned.corpusScan.tilesetsWithBridgeTags.map((item) => item.id), [1, 2, 6]);
  assert.equal(scanned.corpusScan.mapsWithBridgeEventNames.length, 0);
  assert.equal(scanned.corpusScan.mapsWithBridgeComments.length, 0);
  assert.equal(scanned.corpusScan.mapsWithBridgeInfoNames.length, 0);
  assert.equal(scanned.corpusScan.inventory[0].candidates.filter((item) => item.status === "confirmed-bridge-script").length, 8);
  assert.equal(scanned.corpusScan.inventory[0].candidates.filter((item) => item.status === "unconfirmed-candidate").length, 2);
  assert.equal(scanned.corpusScan.completeness.status, "COMPLETE");
  assert.ok(scanned.coverage.scannedEntrances.includes("common-event-117-call-graph-with-cycle-detection"));
  assert.ok(first.coverage.pageCount >= first.coverage.eventCount);
  assert.equal(JSON.stringify(first.candidates.map((item) => item.eventId)), JSON.stringify(second.candidates.map((item) => item.eventId)));
  assert.equal(JSON.stringify(first.coverage), JSON.stringify(second.coverage));
  assert.equal(first.source.files.map.sha256, second.source.files.map.sha256);
});

test("resolveMapSource finds FSDB [resource]Data without depending on a machine-absolute default inside the library", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "map7-evidence-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const data = join(temporary, "[resource]Data");
  await mkdir(data);
  await writeFile(join(data, "Map007.rxdata"), Buffer.from("not-marshal"));
  await assert.rejects(
    () => collectMap7Evidence(temporary),
    (error) => error instanceof ImportFailure && (error.category === "MARSHAL_INVALID" || error.category === "MAP_EVENT_EVIDENCE_FAILURE"),
  );
});

test("size(w,h) occupancy uses vanilla width east and height north from the named origin tile", () => {
  assert.deepEqual(parseEventSize("EV004 size(1,4)"), { present: true, width: 1, height: 4, raw: "size(1,4)", source: parseEventSize("EV004 size(1,4)").source });
  assert.deepEqual(occupiedTiles(20, 49, 1, 4), [
    { x: 20, y: 46 },
    { x: 20, y: 47 },
    { x: 20, y: 48 },
    { x: 20, y: 49 },
  ]);
  assert.deepEqual(occupiedTiles(14, 32, 3, 1), [
    { x: 14, y: 32 },
    { x: 15, y: 32 },
    { x: 16, y: 32 },
  ]);
});

test("move-route command 45 scripts are scanned and confirm bridge candidates", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "Hidden", 0, 0, [page({
    commands: [
      command(209, 0, [0, moveRoute([moveCommand(45, [string("pbBridgeOn")]), moveCommand(0, [])])]),
      command(509, 0, [moveCommand(45, [string("pbBridgeOn")])]),
      command(0, 0, []),
    ],
  })])]]), 7, "Map007.rxdata");
  assert.equal(facts.events[0].pages[0].moveRouteScripts.some((item) => item.matchesBridgePattern), true);
  const coverage = scanCoverage(facts.events);
  assert.ok(coverage.scripts.some((item) => item.kind === "move-route-script-45" && item.matchesBridgePattern === true));
  const candidates = classifyCandidates(facts.events, { cells: [] });
  assert.equal(candidates[0].status, "confirmed-bridge-script");
});

test("conditional-branch type 12 scripts are scanned even on inactive pages", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "Gate", 0, 0, [
    page({
      condition: condition({ switch1: true, switch1Id: 99 }),
      commands: [
        command(111, 0, [12, string("pbBridgeOff")]),
        command(0, 0, []),
      ],
    }),
  ])]]), 7, "Map007.rxdata");
  assert.equal(facts.events[0].pages[0].condition.alwaysActive, false);
  assert.equal(facts.events[0].pages[0].conditionalBranchScripts[0].matchesBridgePattern, true);
  const candidates = classifyCandidates(facts.events, { cells: [] });
  assert.equal(candidates[0].status, "confirmed-bridge-script");
});

test("nested common events detect cycles and reachable bridge scripts", () => {
  const graph = walkCommonEventGraph([1], [
    { id: 1, calledCommonEventIds: [2], hasBridgeScript: false, scriptUncertainty: [] },
    { id: 2, calledCommonEventIds: [1, 3], hasBridgeScript: false, scriptUncertainty: [] },
    { id: 3, calledCommonEventIds: [], hasBridgeScript: true, scriptUncertainty: [] },
  ]);
  assert.equal(graph.reachableHasBridge, true);
  assert.ok(graph.cycles.some((cycle) => cycle.includes(1) && cycle.includes(2)));
  assert.deepEqual(graph.reachableIds.slice().sort((left, right) => left - right), [1, 2, 3]);
});

test("missing Tilesets or out-of-range tile IDs cannot be reported as a proven zero Bridge count", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "NPC", 0, 0, [page({ commands: [command(0, 0, [])] })])]], 2, 2), 7, "Map007.rxdata");
  const missing = collectBridgeCells(facts, null);
  assert.equal(missing.scanStatus, COMPLETENESS.INCOMPLETE);
  assert.equal(missing.provenNegative, false);
  assert.ok(missing.issues.length > 0);
  const values = Array(2 * 2 * 3).fill(0);
  values[0] = 9000;
  const bad = collectBridgeCells(
    { ...facts, data: table(3, 2, 2, 3, values) },
    table(1, 10, 1, 1, Array(10).fill(0)),
  );
  assert.equal(bad.scanStatus, COMPLETENESS.INCOMPLETE);
  assert.equal(bad.cellCount, 0);
  assert.ok(bad.outOfRange.length >= 1);
  assert.throws(
    () => collectBridgeCells(
      { ...facts, data: table(3, 2, 2, 3, values) },
      table(1, 10, 1, 1, Array(10).fill(0)),
      { strict: true },
    ),
    (error) => error instanceof ImportFailure && error.category === "MAP_EVENT_EVIDENCE_FAILURE",
  );
});

test("a Map file without Tilesets/MapInfos/CommonEvents is INCOMPLETE, not a proven zero", async (t) => {
  const fsdb = defaultLocalFsdb(repoRoot);
  const official = join(fsdb, "[resource]Data", "Map007.rxdata");
  if (!existsSync(official)) {
    t.skip("local official Map007.rxdata is not present");
    return;
  }
  const temporary = await mkdtemp(join(tmpdir(), "map7-incomplete-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const data = join(temporary, "[resource]Data");
  await mkdir(data);
  await copyFile(official, join(data, "Map007.rxdata"));
  const evidence = await collectMap7Evidence(temporary);
  assert.equal(evidence.completeness.status, COMPLETENESS.INCOMPLETE);
  assert.equal(evidence.completeness.provenNegativeBridge, false);
  assert.equal(evidence.bridgeTerrain.scanStatus, COMPLETENESS.INCOMPLETE);
  assert.ok(evidence.completeness.issues.some((issue) => /Tilesets/.test(issue)));
});

test("unknown indirect Ruby is recorded as UNVERIFIED rather than a silent zero", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "Mystery", 1, 1, [page({
    commands: [command(355, 0, [string("send(:pbBridgeOn)")]), command(0, 0, [])],
  })])]]), 7, "Map007.rxdata");
  const coverage = scanCoverage(facts.events);
  assert.ok(coverage.unverified.some((item) => item.reason === "dynamic-ruby-send-or-eval"));
  const candidates = classifyCandidates(facts.events, { cells: [] });
  assert.equal(candidates[0].status, "confirmed-bridge-script");
  assert.ok(candidates[0].reasons.includes("page-has-unverified-indirect-ruby"));
});

test("size() transfer events are skipped by the MapTransfer projector, matching projectEvent", () => {
  const facts = extractMapFacts(mapRoot([[4, event(4, "EV004 size(1,4)", 20, 49, [page({
    trigger: 1,
    through: false,
    commands: [command(201, 0, [0, 7, 1, 1, 8]), command(0, 0, [])],
  })])]]), 21, "Map021.rxdata");
  const projection = wouldProjectEventAsTransfer(facts.events[0]);
  assert.equal(projection.projected, false);
  assert.equal(projection.reason, "name-matches-hiddenitem-or-size");
});

test("live Map 21 FSDB extraction records Route 2 bridge events when the official corpus is present", async (t) => {
  const fsdb = defaultLocalFsdb(repoRoot);
  const mapPath = join(fsdb, "[resource]Data", "Map021.rxdata");
  if (!existsSync(mapPath)) {
    t.skip("local examples/essentials-v21.1-local/[FSDB]Essentials v21.1 is not present");
    return;
  }
  const evidence = await collectMapEvidence(fsdb, { mapId: 21 });
  assert.equal(evidence.map.mapId, 21);
  assert.equal(evidence.map.name, "Route 2");
  assert.equal(evidence.map.width, 39);
  assert.equal(evidence.map.height, 77);
  assert.equal(evidence.map.tilesetId, 1);
  assert.equal(evidence.completeness.status, "COMPLETE");
  assert.equal(evidence.completeness.provenNegativeBridge, false);
  assert.equal(evidence.bridgeTerrain.scanStatus, "COMPLETE");
  assert.equal(evidence.bridgeTerrain.cellCount, 93);
  assert.equal(evidence.bridgeTerrain.placedBridgeTaggedTiles, 93);
  assert.equal(evidence.source.files.map.sha256, "cd226a09dbf5cbfd2207edd44fb7dd419327ae901a1f1c0f6ad35601df85c575");
  const confirmed = evidence.candidates.filter((item) => item.status === "confirmed-bridge-script");
  const unconfirmed = evidence.candidates.filter((item) => item.status === "unconfirmed-candidate");
  assert.equal(confirmed.length, 8);
  assert.deepEqual(confirmed.map((item) => item.eventId).sort((left, right) => left - right), [4, 7, 10, 20, 22, 23, 25, 28]);
  assert.ok(unconfirmed.some((item) => item.eventId === 1));
  assert.ok(unconfirmed.some((item) => item.eventId === 2));
  assert.equal(evidence.transferAudit.actual.stepCount, 0);
  assert.equal(evidence.transferAudit.actual.contactCount, 0);
  assert.equal(evidence.coverage.allPagesScanned, true);
  const second = await collectMapEvidence(fsdb, { mapId: 21 });
  assert.equal(JSON.stringify(evidence.coverage), JSON.stringify(second.coverage));
  assert.equal(evidence.source.files.map.sha256, second.source.files.map.sha256);
});
