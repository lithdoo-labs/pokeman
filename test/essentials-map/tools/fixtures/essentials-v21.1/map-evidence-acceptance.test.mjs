import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  COMPLETENESS,
  buildEventTriggerMatrix,
  buildPassabilityContext,
  classifyCandidates,
  collectBridgeCells,
  collectMapEvidence,
  defaultLocalFsdb,
  decodeRxdataBytes,
  extractMapFacts,
  extractTilesetTerrain,
  forensicRelPath,
  parseEvidenceArguments,
  scanCoverage,
  walkCommonEventGraph,
} from "./lib/essentials/v21.1/map-event-evidence.mjs";
import { computeCommonEventReachability } from "./lib/essentials/v21.1/common-event-reachability.mjs";
import {
  compareExpectedToActualEdges,
  enumerateConnectionOutcomes,
  parseMapConnectionLines,
  sameCoordinatesDifferentMapsCase,
} from "./lib/essentials/v21.1/map-connection-audit.mjs";
import { overTriggerForEvent, playerPassableTrace, vanillaPassageBit } from "./lib/essentials/v21.1/vanilla-map-rules.mjs";
import { replayInputs } from "./lib/essentials/v21.1/map-route-trace.mjs";
import { independentMapRecount } from "./map-evidence-independent-check.mjs";
import { buildMap21BridgeRoutes, landApproach } from "./lib/essentials/v21.1/map21-bridge-routes.mjs";
import { buildMap47LedgeRoutes } from "./lib/essentials/v21.1/map47-ledge-routes.mjs";

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
    "@move_route": fields.moveRoute ?? object("RPG::MoveRoute", {
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

function mapRoot(events, width, height, dataValues) {
  return object("RPG::Map", {
    "@tileset_id": 1,
    "@width": width,
    "@height": height,
    "@data": table(3, width, height, 3, dataValues ?? Array(width * height * 3).fill(0)),
    "@events": hash(events),
  });
}

function commonEvent(id, name, calls, script, trigger = 0) {
  const commands = [];
  if (script) commands.push(command(355, 0, [string(script)]));
  for (const call of calls) commands.push(command(117, 0, [call]));
  commands.push(command(0, 0, []));
  return {
    id,
    name,
    trigger,
    calledCommonEventIds: calls,
    concatenatedScripts: script ? [{ joinedWithNewlines: `${script}\n` }] : [],
    moveRouteScripts: [],
    conditionalBranchScripts: [],
    hasBridgeScript: /\bpbBridge(?:On|Off)/u.test(script ?? ""),
    scriptUncertainty: [],
    commands: [],
  };
}

test("EV-VALID-01 negative tile IDs are not empty zeros and cannot prove COMPLETE", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "NPC", 0, 0, [page({})])]], 2, 2), 7, "Map007.rxdata");
  const values = Array(2 * 2 * 3).fill(0);
  values[0] = -3;
  const scan = collectBridgeCells(
    { ...facts, data: table(3, 2, 2, 3, values) },
    table(1, 8, 1, 1, Array(8).fill(0)),
  );
  assert.equal(scan.scanStatus, COMPLETENESS.INCOMPLETE);
  assert.equal(scan.provenNegative, false);
  assert.ok(scan.negativeTileIds.some((item) => item.tileId === -3 && item.x === 0 && item.y === 0));
});

test("EV-VALID-02 short Map.data values cannot report COMPLETE", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "NPC", 0, 0, [page({})])]], 2, 2), 7, "Map007.rxdata");
  const scan = collectBridgeCells(
    { ...facts, data: table(3, 2, 2, 3, [1, 2, 3]) },
    table(1, 8, 1, 1, Array(8).fill(0)),
  );
  assert.equal(scan.scanStatus, COMPLETENESS.INCOMPLETE);
  assert.equal(scan.cellCount, 0);
  assert.equal(scan.provenNegative, false);
});

test("EV-VALID-03 terrain_tags that are not 1D cannot prove a zero", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "NPC", 0, 0, [page({})])]], 2, 2), 7, "Map007.rxdata");
  const scan = collectBridgeCells(facts, table(3, 2, 2, 1, Array(4).fill(0)));
  assert.equal(scan.scanStatus, COMPLETENESS.INCOMPLETE);
  assert.ok(scan.issues.some((issue) => /dimensions/.test(issue)));
});

test("EV-VALID-04 orphan 655 is a decodeError and blocks provenNegative", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "Odd", 0, 0, [page({
    commands: [command(655, 0, [string("pbBridgeOn")]), command(0, 0, [])],
  })])]], 2, 2), 7, "Map007.rxdata");
  const coverage = scanCoverage(facts.events);
  assert.ok(coverage.decodeErrors.some((item) => item.decodeError === "script-655-without-preceding-355-or-655"));
  const candidates = classifyCandidates(facts.events, { cells: [] });
  assert.ok(candidates[0].reasons.includes("page-has-decode-error"));
});

test("EV-VALID-05 111 type 12 missing script parameter is a decodeError, not an empty script", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "Gate", 0, 0, [page({
    commands: [command(111, 0, [12]), command(0, 0, [])],
  })])]], 2, 2), 7, "Map007.rxdata");
  assert.equal(facts.events[0].pages[0].conditionalBranchScripts[0].decodeError, "conditional-branch-type-12-missing-script-parameter");
  const coverage = scanCoverage(facts.events);
  assert.ok(coverage.decodeErrors.length >= 1);
});

test("EV-VALID-06 117 non-integer target is not a silent miss", () => {
  const facts = extractMapFacts(mapRoot([[1, event(1, "Caller", 0, 0, [page({
    commands: [command(117, 0, [string("eval-id")]), command(0, 0, [])],
  })])]], 2, 2), 7, "Map007.rxdata");
  assert.ok(facts.events[0].pages[0].decodeErrors.some((item) => item.decodeError === "common-event-117-target-not-positive-integer"));
});

test("EV-CALL-01 Map Event → Common A → B → C → pbBridgeOn is confirmed with the full chain", () => {
  const commons = [
    commonEvent(1, "A", [2], ""),
    commonEvent(2, "B", [3], ""),
    commonEvent(3, "C", [], "pbBridgeOn"),
  ];
  const reach = computeCommonEventReachability(commons);
  assert.equal(reach.byId[1].canReachBridge, true);
  assert.deepEqual(reach.byId[1].paths[0], [1, 2, 3]);
  assert.equal(reach.byId[3].hasOwnBridgeScript, true);
  const facts = extractMapFacts(mapRoot([[9, event(9, "Entry", 1, 1, [page({
    commands: [command(117, 0, [1]), command(0, 0, [])],
  })])]], 2, 2), 7, "Map007.rxdata");
  const candidates = classifyCandidates(facts.events, { cells: [] }, new Set(reach.idsThatCanReachBridge), { reachability: reach });
  assert.equal(candidates[0].status, "confirmed-bridge-script");
  assert.equal(candidates[0].commonEventChains[0].canReachBridge, true);
  assert.deepEqual(candidates[0].commonEventChains[0].paths[0], [1, 2, 3]);
});

test("EV-CALL-02 a cycle without a bridge script is not a confirmed candidate", () => {
  const commons = [
    commonEvent(1, "A", [2], ""),
    commonEvent(2, "B", [1], ""),
  ];
  const reach = computeCommonEventReachability(commons);
  assert.equal(reach.byId[1].canReachBridge, false);
  const facts = extractMapFacts(mapRoot([[9, event(9, "Entry", 1, 1, [page({
    commands: [command(117, 0, [1]), command(0, 0, [])],
  })])]], 2, 2), 7, "Map007.rxdata");
  const candidates = classifyCandidates(facts.events, { cells: [] }, new Set(reach.idsThatCanReachBridge), { reachability: reach });
  assert.equal(candidates.length, 0);
});

test("EV-CALL-03 a cycle that still reaches pbBridgeOn is confirmed", () => {
  const commons = [
    commonEvent(1, "A", [2], ""),
    commonEvent(2, "B", [1, 3], ""),
    commonEvent(3, "C", [], "pbBridgeOff"),
  ];
  const reach = computeCommonEventReachability(commons);
  assert.equal(reach.byId[1].canReachBridge, true);
  const graph = walkCommonEventGraph([1], commons);
  assert.equal(graph.reachableHasBridge, true);
});

test("EV-CALL-04 missing Common Event target is not a proven negative", () => {
  const reach = computeCommonEventReachability([commonEvent(1, "A", [99], "")]);
  assert.deepEqual(reach.byId[1].missing, [99]);
  assert.equal(reach.byId[1].canReachBridge, false);
});

test("EV-CALL-05 autorun Common Events are a separate entrance", () => {
  const reach = computeCommonEventReachability([commonEvent(4, "Auto", [], "pbBridgeOn", 1)]);
  assert.equal(reach.autorunOrParallel.length, 1);
  assert.equal(reach.autorunOrParallel[0].canReachBridge, true);
});

test("EV-TRIGGER-01 d=0 uses Ruby 1.8 negative shift, not JS 1<<n", () => {
  assert.equal(vanillaPassageBit(0), 0);
  assert.equal(vanillaPassageBit(2), 1);
  assert.equal(vanillaPassageBit(4), 2);
  assert.equal(vanillaPassageBit(6), 4);
  assert.equal(vanillaPassageBit(8), 8);
  assert.equal(vanillaPassageBit(10), 0);
  assert.notEqual(1 << -1, 0);
});

test("EV-TRIGGER-02 empty graphic is walk-on only when an occupied tile is passable?(d=0)", () => {
  const width = 3;
  const height = 3;
  const values = Array(width * height * 3).fill(0);
  values[1 + 1 * width + 0 * width * height] = 1;
  values[2 + 1 * width + 0 * width * height] = 2;
  const facts = extractMapFacts(mapRoot([
    [1, event(1, "OnPath size(1,1)", 1, 1, [page({ through: false, trigger: 1, graphic: { characterName: "" } })])],
    [2, event(2, "OnWall size(1,1)", 2, 1, [page({ through: false, trigger: 1, graphic: { characterName: "" } })])],
  ], width, height, values), 21, "Map021.rxdata");
  const tags = table(1, 8, 1, 1, [0, 0, 0, 0, 0, 0, 0, 0]);
  const passages = table(1, 8, 1, 1, [0, 0, 0x0f, 0, 0, 0, 0, 0]);
  const priorities = table(1, 8, 1, 1, [0, 0, 0, 0, 0, 0, 0, 0]);
  const context = buildPassabilityContext(facts, { terrain_tags: tags, passages, priorities }, facts.events);
  const path = playerPassableTrace(context, 1, 1, 0, { bridgeLevel: 0 });
  const wall = playerPassableTrace(context, 2, 1, 0, { bridgeLevel: 0 });
  assert.equal(path.passable, true);
  assert.equal(wall.passable, false);
  const overPath = overTriggerForEvent(context, facts.events[0], { bridgeLevel: 0 });
  const overWall = overTriggerForEvent(context, facts.events[1], { bridgeLevel: 0 });
  assert.equal(overPath.overTrigger, true);
  assert.equal(overWall.overTrigger, false);
  assert.equal(overPath.occupied.length, 1);
  assert.equal(overWall.occupied.length, 1);
  const matrix = buildEventTriggerMatrix(context, facts.events);
  assert.equal(matrix[0].byBridgeLevel[0].branch, "here");
  assert.equal(matrix[1].byBridgeLevel[0].branch, "touch");
  assert.equal(matrix[1].byBridgeLevel[0].occupied.length, 1);
});

test("EV-TRANSFER-01 same coordinates on two maps are not interchangeable", () => {
  const demo = sameCoordinatesDifferentMapsCase({ mapA: 21, mapB: 7, x: 19, y: 0, bridgeOnA: true, bridgeOnB: false });
  assert.equal(demo.mapA.hasBridge, true);
  assert.equal(demo.mapB.hasBridge, false);
  const parsed = parseMapConnectionLines("21,S,0,7,N,21\n");
  assert.equal(parsed.connections[0].mapAId, 21);
  assert.equal(parsed.connections[0].mapBId, 7);
  const map21 = { width: 39, height: 77, tileset_id: 1, data: table(3, 39, 77, 3, Array(39 * 77 * 3).fill(0)) };
  const map7 = { width: 60, height: 43, tileset_id: 1, data: table(3, 60, 43, 3, Array(60 * 43 * 3).fill(0)) };
  const tileset = {
    passages: table(1, 8, 1, 1, Array(8).fill(0)),
    priorities: table(1, 8, 1, 1, Array(8).fill(0)),
  };
  const enumerated = enumerateConnectionOutcomes(parsed.connections[0], new Map([[21, map21], [7, map7]]), new Map([[1, tileset]]));
  assert.ok(enumerated.outcomes.every((item) => item.sourceMapId != null && item.targetMapId != null));
  const dropped = enumerateConnectionOutcomes(parsed.connections[0], new Map([[21, map21]]), new Map([[1, tileset]]));
  assert.ok(dropped.blocked.length >= 1);
});

test("EV-TRANSFER-02 D0 drop is classified separately from a present record", () => {
  const expected = [
    { sourceMapId: 21, sourceX: 0, sourceY: 0, direction: 6, targetMapId: 23, targetX: 1, targetY: 1, verdict: "expected-edge-if-importer-ran", wouldEmitEdge: true },
    { sourceMapId: 21, sourceX: 1, sourceY: 0, direction: 6, targetMapId: 23, targetX: 1, targetY: 2, verdict: "d0-would-drop-on-target-cell", wouldEmitEdge: false, d0: false },
  ];
  const present = compareExpectedToActualEdges(expected, [
    { x: 0, y: 0, direction: 6, targetMapId: 23, targetX: 1, targetY: 1 },
  ], 21);
  assert.equal(present.matchedCount, 1);
  assert.equal(present.droppedByD0[0].status, "d0-would-drop-and-record-absent");
  assert.equal(present.missingExpected.length, 0);
});

test("EV-SAFETY-01 extractor refuses unlisted maps and does not put drive paths in forensicRelPath", () => {
  assert.throws(() => parseEvidenceArguments(["--map", "99"]));
  assert.equal(forensicRelPath("E:\\\\Repo\\\\Data\\\\Map021.rxdata"), "Data/Map021.rxdata");
  assert.equal(forensicRelPath("/repo/Data/Map021.rxdata"), "Data/Map021.rxdata");
  assert.equal(forensicRelPath("E:\\\\Repo\\\\Data\\\\Map021.rxdata").includes(":"), false);
});

test("EV-REPLAY-01 synthetic walk stays continuous", () => {
  const width = 4;
  const height = 3;
  const values = Array(width * height * 3).fill(1);
  const facts = extractMapFacts(mapRoot([], width, height, values), 21, "Map021.rxdata");
  const context = buildPassabilityContext(facts, {
    terrain_tags: table(1, 8, 1, 1, Array(8).fill(0)),
    passages: table(1, 8, 1, 1, Array(8).fill(0)),
    priorities: table(1, 8, 1, 1, Array(8).fill(0)),
  }, []);
  const replay = replayInputs(context, { mapId: 21, x: 1, y: 1, direction: 6, bridgeLevel: 0 }, ["right", "right"]);
  assert.equal(replay.continuous, true);
  assert.equal(replay.final.x, 3);
  assert.equal(replay.notALiveRun, true);
});

test("live Map 7/21/47 recount agrees with collectMapEvidence and independent checker", async (t) => {
  const fsdb = defaultLocalFsdb(repoRoot);
  if (!existsSync(join(fsdb, "[resource]Data", "Map007.rxdata"))) {
    t.skip("local official FSDB is not present");
    return;
  }
  const map7 = await collectMapEvidence(fsdb, { mapId: 7 });
  const map21 = await collectMapEvidence(fsdb, { mapId: 21 });
  assert.equal(map7.completeness.status, COMPLETENESS.COMPLETE);
  assert.equal(map7.completeness.provenNegativeBridge, true);
  assert.equal(map7.bridgeTerrain.cellCount, 0);
  assert.match(map7.source.files.map.path, /Map007\.rxdata$/);
  assert.equal(map7.source.files.map.path.includes(":"), false);
  assert.equal(map21.bridgeTerrain.cellCount, 93);
  assert.equal(map21.triggerMatrix.length, 8);
  for (const row of map21.triggerMatrix) {
    assert.equal(row.byBridgeLevel[0].overTrigger, true, `event ${row.eventId} over_trigger`);
    assert.equal(row.byBridgeLevel[2].overTrigger, true, `event ${row.eventId} over_trigger at bridge 2`);
    assert.equal(row.byBridgeLevel[0].branch, "here");
    assert.equal(row.byBridgeLevel[0].occupied.length, row.occupiedTiles.length, `event ${row.eventId} must list every occupied tile`);
  }
  const independent21 = await independentMapRecount(fsdb, 21);
  assert.equal(independent21.sha256, map21.source.files.map.sha256);
  assert.equal(independent21.uniqueBridgeCells, map21.bridgeTerrain.cellCount);
  assert.deepEqual(independent21.bridgeScriptEventIds, [4, 7, 10, 20, 22, 23, 25, 28]);
  const mapBytes = await readFile(join(fsdb, "[resource]Data", "Map021.rxdata"));
  const tilesetBytes = await readFile(join(fsdb, "[resource]Data", "Tilesets.rxdata"));
  const facts21 = extractMapFacts(decodeRxdataBytes(mapBytes, "Map021.rxdata").root, 21, "Map021.rxdata");
  const terrain21 = extractTilesetTerrain(decodeRxdataBytes(tilesetBytes, "Tilesets.rxdata").root, facts21.tilesetId);
  const context21 = buildPassabilityContext(facts21, terrain21, facts21.events);
  const ev10 = facts21.events.find((event) => event.eventId === 10);
  const ev7 = facts21.events.find((event) => event.eventId === 7);
  const midNorthEnter = landApproach(ev10, ev7);
  assert.equal(midNorthEnter.input, "down", "mid-north land is north of Off; onto-bridge walks south");
  const routes = buildMap21BridgeRoutes(context21, { ...map21, map: { ...map21.map, events: facts21.events } });
  assert.equal(routes.notALiveRun, true);
  assert.equal(routes.groups.length, 4);
  for (const group of routes.groups) {
    assert.equal(group.available, true, group.id);
    assert.equal(group.ontoBridge.notALiveRun, true);
    assert.equal(group.ontoBridge.continuous, true, group.id);
    assert.equal(group.ontoEndsOnBridge, true, `${group.id} must finish on bridgeLevel 2`);
    assert.equal(group.offEndsOnLand, true, `${group.id} must finish off-bridge at 0`);
    assert.equal(group.fromMap7Landing.bfs.found, true, `${group.id} Map7→enter path`);
    assert.ok(group.fromMap7Landing.bfs.inputs.length > 0, `${group.id} has continuous landing inputs`);
  }
  assert.equal(routes.southEdgeNegative.available, true, "Map 21 south edge from Map 7 landing has a blocked neighbor");

  if (existsSync(join(fsdb, "[resource]Data", "Map047.rxdata"))) {
    const map47 = await collectMapEvidence(fsdb, { mapId: 47 });
    const independent47 = await independentMapRecount(fsdb, 47);
    assert.equal(independent47.uniqueLedgeCells, map47.ledgeTerrain.cellCount);
    assert.ok(map47.ledgeTerrain.cellCount > 0, "Map 47 should place Ledge tiles");
    const facts47 = extractMapFacts(decodeRxdataBytes(await readFile(join(fsdb, "[resource]Data", "Map047.rxdata")), "Map047.rxdata").root, 47, "Map047.rxdata");
    const terrain47 = extractTilesetTerrain(decodeRxdataBytes(tilesetBytes, "Tilesets.rxdata").root, facts47.tilesetId);
    const context47 = buildPassabilityContext(facts47, terrain47, facts47.events);
    const ledgeRoutes = buildMap47LedgeRoutes(context47, map47);
    assert.equal(ledgeRoutes.notALiveRun, true);
    assert.ok(ledgeRoutes.legal.length > 0, "Map 47 has at least one legal jumpForward(2)");
    assert.ok(ledgeRoutes.reverse.every((item) => item.jumped === false), "reverse jump is not a legal Map 47 sample");
  }
});
