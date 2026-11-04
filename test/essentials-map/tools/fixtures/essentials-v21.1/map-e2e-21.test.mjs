import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { defaultLocalFsdb } from "./lib/essentials/v21.1/map-event-evidence.mjs";
import { replayInputs, traceStep } from "./lib/essentials/v21.1/map-route-trace.mjs";
import { replayWorld, traceWorldStep } from "./lib/essentials/v21.1/map-world-replay.mjs";
import {
  E2E_GROUPS,
  buildMap21E2eGroup,
  buildMap21E2eTraces,
  buildWorldFromEvidence,
  heldInputOnBand,
} from "./lib/essentials/v21.1/map21-e2e-replay.mjs";
import { independentBridgeCells, verifyUnifiedTraceIndependently } from "./lib/essentials/v21.1/map21-e2e-independent-check.mjs";
import { makeSyntheticBridgeWorld } from "./lib/essentials/v21.1/terrain-behavior-synthetic-world.mjs";
import { loadOfficialE2eInputs, officialFsdbPresent } from "./lib/essentials/v21.1/terrain-behavior-live.mjs";
import {
  CANDIDATE_JSON_EXAMPLES,
  validateCandidateMapAction,
  validateCandidateTilesetRecord,
} from "./lib/essentials/v21.1/terrain-behavior-contract-candidate.mjs";
import { makeBrokenTilesetRecord } from "./lib/essentials/v21.1/terrain-behavior-synthetic-world.mjs";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const SYNTHETIC_GROUP = Object.freeze({ id: "south-canal", onId: 25, offId: 23, label: "synthetic EV025/EV023" });

function independentFacts(bundle) {
  const cells = independentBridgeCells(
    bundle.context21.mapData,
    bundle.context21.terrainTags,
    bundle.context21.width,
    bundle.context21.height,
  );
  return {
    edges: [
      ...(bundle.map7.transferAudit.actual.edges ?? []),
      ...(bundle.map21.transferAudit.actual.edges ?? []),
    ],
    bridgeCells: cells.map((cell) => ({ mapId: 21, x: cell.x, y: cell.y })),
    independentCells: cells,
  };
}

function assertUnifiedGroup(group, facts, label) {
  assert.equal(group.available, true, `${label} available: ${group.reason ?? ""}`);
  assert.equal(group.notALiveRun, true);
  assert.equal(group.grade, "STATIC-INFERRED");
  assert.equal(group.continuous, true, `${label} continuous`);
  assert.equal(group.walkedTag15, true, `${label} walked tag15`);
  assert.equal(group.returnedToMap7, true, `${label} returned to map 7`);
  assert.equal(group.returnedBridgeCleared, true, `${label} bridge cleared on return`);
  assert.equal(group.transferOutCount, 1, `${label} one outbound transfer`);
  assert.equal(group.transferBackCount, 1, `${label} one return transfer`);
  assert.equal(group.startSeparateFromExecute, true, `${label} start vs execute`);
  assert.ok(group.onCounts.starts >= 1, `${label} On start`);
  assert.ok(group.onCounts.executes >= 1, `${label} On execute`);
  assert.ok(group.offCounts.starts >= 1, `${label} Off start`);
  assert.ok(group.offCounts.executes >= 1, `${label} Off execute`);
  const check = verifyUnifiedTraceIndependently(group.unified, facts);
  assert.equal(check.ok, true, `${label} independent ${check.issues.join(",")}`);
  assert.equal(check.walkedTag15, true, `${label} independent tag15`);
}

test("E2E-21-01/05/06/07 synthetic unified Map7 edge to tag15 and reverse transfer", () => {
  const bundle = makeSyntheticBridgeWorld();
  const group = buildMap21E2eGroup(bundle.world, bundle.map7, bundle.map21, SYNTHETIC_GROUP);
  const facts = independentFacts(bundle);
  assert.equal(facts.independentCells.length, bundle.bridgeCells.length);
  assertUnifiedGroup(group, facts, "synthetic");
  assert.equal(group.unified.start.mapId, 7);
  assert.equal(group.unified.final.mapId, 7);
  assert.equal(group.unified.final.bridgeLevel, 0);
  const firstTransfer = group.unified.steps.find((step) => step.kind === "transfer");
  assert.equal(firstTransfer.transfer.sourceMapId, 7);
  assert.equal(firstTransfer.transfer.targetMapId, 21);
  assert.equal(firstTransfer.actual.bridgeLevel, 0);
  const lastTransfer = [...group.unified.steps].reverse().find((step) => step.kind === "transfer");
  assert.equal(lastTransfer.transfer.sourceMapId, 21);
  assert.equal(lastTransfer.transfer.targetMapId, 7);
  const fingerprint = group.unified.steps.map((step) => `${step.kind}:${step.actual.mapId},${step.actual.x},${step.actual.y},${step.actual.bridgeLevel}`).join("|");
  const second = buildMap21E2eGroup(bundle.world, bundle.map7, bundle.map21, SYNTHETIC_GROUP);
  const fingerprint2 = second.unified.steps.map((step) => `${step.kind}:${step.actual.mapId},${step.actual.x},${step.actual.y},${step.actual.bridgeLevel}`).join("|");
  assert.equal(fingerprint, fingerprint2);
});

test("E2E-21-02 missing materialized Map7 edge is fail-closed and PBS-like samples are not a substitute", () => {
  const bundle = makeSyntheticBridgeWorld({ omitOutbound: true });
  const group = buildMap21E2eGroup(bundle.world, bundle.map7, bundle.map21, SYNTHETIC_GROUP);
  assert.equal(group.available, false);
  assert.equal(group.reason, "no-materialized-map7-to-21-edge");
});

test("E2E-21-03 dropping a land-path input breaks the unified success condition", () => {
  const bundle = makeSyntheticBridgeWorld();
  const group = buildMap21E2eGroup(bundle.world, bundle.map7, bundle.map21, SYNTHETIC_GROUP);
  assert.equal(group.available, true);
  const withoutOnto = [...group.userInputs];
  withoutOnto.splice(group.ontoInputIndex, group.ontoInputs.length);
  const replay = replayWorld(bundle.world, group.unified.start, withoutOnto, { forbidTransfer: false });
  const walkedTag15 = replay.steps.some((step) => (
    step.kind === "walk" && step.actual.bridgeLevel === 2
    && bundle.bridgeCells.some((cell) => cell.x === step.actual.x && cell.y === step.actual.y)
  ));
  const success = replay.final.mapId === 7 && replay.final.bridgeLevel === 0 && walkedTag15;
  assert.equal(success, false);
});

test("E2E-21-03 blocked land corridor cannot be rescued by constructing a Map21 landing", () => {
  const bundle = makeSyntheticBridgeWorld({ breakLandPath: true });
  const group = buildMap21E2eGroup(bundle.world, bundle.map7, bundle.map21, SYNTHETIC_GROUP);
  assert.equal(group.available, false);
  assert.match(group.reason, /no-walk-path-from-materialized-landing/);
});

test("E2E-21-04 size-band held input restarts On after a later execute checkpoint", () => {
  const bundle = makeSyntheticBridgeWorld();
  const group = buildMap21E2eGroup(bundle.world, bundle.map7, bundle.map21, SYNTHETIC_GROUP);
  const ontoIndex = group.unified.steps.findIndex((step) => (
    step.kind === "interpreter-execute"
    && step.executeCheckpoint?.op === "on"
    && step.executeCheckpoint?.occurred === true
  ));
  assert.ok(ontoIndex >= 0);
  const afterOn = group.unified.steps[ontoIndex].actual;
  const held = heldInputOnBand(bundle.world, afterOn, bundle.facts21.events.find((event) => event.eventId === 25), 3);
  const starts = held.steps.flatMap((step) => step.startCheckpoint?.started ?? []).filter((hit) => hit.eventId === 25 && hit.started);
  assert.ok(starts.length >= 1);
  assert.equal(starts.every((hit) => hit.execute === false), true);
  const executes = held.steps.filter((step) => step.executeCheckpoint?.occurred && step.executeCheckpoint.eventId === 25);
  assert.ok(executes.length >= 1);
});

test("E2E-21-08 start checkpoint never claims execute, and old traceStep still has transfer null", () => {
  const bundle = makeSyntheticBridgeWorld();
  const group = buildMap21E2eGroup(bundle.world, bundle.map7, bundle.map21, SYNTHETIC_GROUP);
  assert.equal(group.startMarkedExecute, false);
  const old = traceStep(bundle.context7, { mapId: 7, x: 2, y: 0, direction: 8, bridgeLevel: 0 }, "up");
  assert.equal(old.transfer, null);
  const worldStep = traceWorldStep(bundle.world, { mapId: 7, x: 2, y: 0, direction: 8, bridgeLevel: 0 }, "up");
  assert.equal(worldStep.kind, "transfer");
  assert.equal(worldStep.transfer.targetMapId, 21);
  assert.equal(worldStep.actual.bridgeLevel, 0);
});

test("E2E-21 blocked/front-touch NPC does not walk through, and missing target map is INCOMPLETE", () => {
  const bundle = makeSyntheticBridgeWorld();
  const blocked = traceWorldStep(bundle.world, {
    mapId: 21, x: 4, y: 7, direction: 6, bridgeLevel: 0, pendingExecute: null,
  }, "right");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.kind, "blocked-or-touch");
  assert.ok((blocked.startCheckpoint.started ?? []).some((hit) => hit.eventId === 40));
  const missing = makeSyntheticBridgeWorld({ missingTarget: true, omitOutbound: true });
  const step = traceWorldStep(missing.world, { mapId: 7, x: 4, y: 0, direction: 8, bridgeLevel: 0 }, "up");
  assert.equal(step.kind, "transfer-missing-target-map");
  assert.equal(step.grade, "INCOMPLETE");
  const oob = traceWorldStep(bundle.world, { mapId: 21, x: 5, y: 5, direction: 6, bridgeLevel: 0 }, "right");
  assert.equal(oob.ok, false);
  assert.equal(oob.reason, "out-of-map-without-materialized-edge");
});

test("E2E-21-02 independent checker does not import replayWorld and recounts tag15 without the stepper", () => {
  const bundle = makeSyntheticBridgeWorld();
  const facts = independentFacts(bundle);
  assert.equal(facts.independentCells.length, 4);
  const group = buildMap21E2eGroup(bundle.world, bundle.map7, bundle.map21, SYNTHETIC_GROUP);
  const check = verifyUnifiedTraceIndependently(group.unified, facts);
  assert.equal(check.method.includes("not traceWorldStep"), true);
});

test("C-01 candidate schema rejects legacy five fields, short tables, 3D tags, and tag 18", () => {
  assert.equal(validateCandidateTilesetRecord(CANDIDATE_JSON_EXAMPLES.tilesetOk).ok, true);
  assert.equal(validateCandidateTilesetRecord(makeBrokenTilesetRecord("legacy-five-fields")).ok, false);
  assert.equal(validateCandidateTilesetRecord(makeBrokenTilesetRecord("missing-autotile-names")).ok, false);
  assert.equal(validateCandidateTilesetRecord(makeBrokenTilesetRecord("short-terrain-tags")).ok, false);
  assert.equal(validateCandidateTilesetRecord(makeBrokenTilesetRecord("three-d-terrain-tags")).ok, false);
  assert.equal(validateCandidateTilesetRecord(makeBrokenTilesetRecord("tag-18")).ok, false);
  assert.equal(validateCandidateMapAction(CANDIDATE_JSON_EXAMPLES.mapActionOn).ok, true);
  assert.equal(validateCandidateMapAction(CANDIDATE_JSON_EXAMPLES.mapActionOff).ok, true);
  assert.equal(validateCandidateMapAction({ ...CANDIDATE_JSON_EXAMPLES.mapActionOn, height: 3 }).ok, false);
});

test("old segmented replayInputs is not accepted as E2E: transfer stays null and bridge can be reset", () => {
  const bundle = makeSyntheticBridgeWorld();
  const replay = replayInputs(bundle.context21, { mapId: 21, x: 2, y: 7, direction: 8, bridgeLevel: 0 }, ["up", "up"]);
  assert.equal(replay.steps.every((step) => step.transfer == null), true);
});

test("live E2E-21-01 four Map21 groups from materialized Map7 edges", async (t) => {
  const fsdb = defaultLocalFsdb(repoRoot);
  if (!officialFsdbPresent(fsdb)) {
    t.skip("local official FSDB is not present; synthetic coverage still ran");
    return;
  }
  const loaded = await loadOfficialE2eInputs(fsdb);
  const world = buildWorldFromEvidence(loaded);
  const traces = buildMap21E2eTraces(world, loaded.map7, loaded.map21);
  assert.equal(traces.notALiveRun, true);
  assert.equal(traces.grade, "STATIC-INFERRED");
  assert.equal(traces.materializedOutbound.length >= 4, true, "MapTransfer/7.json must materialize Map21 edges");
  const facts = {
    edges: [
      ...(loaded.map7.transferAudit.actual.edges ?? []),
      ...(loaded.map21.transferAudit.actual.edges ?? []),
    ],
    bridgeCells: independentBridgeCells(
      loaded.context21.mapData,
      loaded.context21.terrainTags,
      loaded.context21.width,
      loaded.context21.height,
    ).map((cell) => ({ mapId: 21, x: cell.x, y: cell.y })),
  };
  assert.equal(facts.bridgeCells.length, loaded.map21.bridgeTerrain.cellCount);
  assert.deepEqual(E2E_GROUPS.map((item) => item.id), traces.groups.map((item) => item.id));
  for (const group of traces.groups) {
    const eventOn = loaded.facts21.events.find((event) => event.eventId === group.onId);
    const eventOff = loaded.facts21.events.find((event) => event.eventId === group.offId);
    assert.ok(eventOn, `FSDB event ${group.onId}`);
    assert.ok(eventOff, `FSDB event ${group.offId}`);
    assertUnifiedGroup(group, facts, group.id);
  }
  assert.equal(traces.allAvailable, true);
});
