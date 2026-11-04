import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { defaultLocalFsdb, scanCoverage } from "./lib/essentials/v21.1/map-event-evidence.mjs";
import { ledgeJumpForward2 } from "./lib/essentials/v21.1/vanilla-map-rules.mjs";
import { buildMap47LedgeRoutes, command404Impact } from "./lib/essentials/v21.1/map47-ledge-routes.mjs";
import { makeSyntheticLedgeWorld } from "./lib/essentials/v21.1/terrain-behavior-synthetic-world.mjs";
import { loadOfficialMap47 } from "./lib/essentials/v21.1/terrain-behavior-live.mjs";
import { replayWorld, worldFromMaps } from "./lib/essentials/v21.1/map-world-replay.mjs";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const MAP047_SHA = "5f4ee232e4f4b8b44950f826b13cd601ffecb87e455c1dda92c5908152df043e";

test("LD47-01 synthetic legal jump is one two-tile jump, not two walks", () => {
  const sample = makeSyntheticLedgeWorld("legal-down");
  assert.equal(sample.notOriginalMap47, true);
  const jump = ledgeJumpForward2(sample.context, sample.start.x, sample.start.y, 2, { bridgeLevel: 0 });
  assert.equal(jump.jumped, true);
  assert.equal(jump.landing.x, sample.landing.x);
  assert.equal(jump.landing.y, sample.landing.y);
  assert.equal(Math.abs(jump.landing.y - sample.start.y), 2);
  const world = worldFromMaps([{ mapId: 47, context: sample.context, edges: [], ledgeCells: sample.evidence.ledgeTerrain.cells }]);
  const replay = replayWorld(world, {
    mapId: 47, x: sample.start.x, y: sample.start.y, direction: 2, bridgeLevel: 0,
  }, ["down"], { allowLedgeJump: true, forbidTransfer: true });
  const jumpSteps = replay.steps.filter((step) => step.kind === "ledge-jump");
  const walkSteps = replay.steps.filter((step) => step.kind === "walk");
  assert.equal(jumpSteps.length, 1);
  assert.equal(walkSteps.length, 0);
  assert.equal(replay.final.y, sample.landing.y);
});

test("LD47-02 synthetic reverse jump is not legal", () => {
  const sample = makeSyntheticLedgeWorld("legal-down");
  const reverse = ledgeJumpForward2(sample.context, sample.landing.x, sample.landing.y, 8, { bridgeLevel: 0 });
  assert.equal(reverse.jumped, false);
});

test("LD47-03 synthetic start-blocked and landing-blocked are separate from Map47", () => {
  const start = makeSyntheticLedgeWorld("start-blocked");
  const startJump = ledgeJumpForward2(start.context, start.start.x, start.start.y, 2, { bridgeLevel: 0 });
  assert.equal(startJump.jumped, false);
  assert.equal(startJump.reason, "can-move-failed-before-ledge-check");
  const land = makeSyntheticLedgeWorld("landing-blocked");
  const landJump = ledgeJumpForward2(land.context, land.start.x, land.start.y, 2, { bridgeLevel: 0 });
  assert.equal(landJump.jumped, false);
  assert.equal(land.notOriginalMap47, true);
});

test("LD47-04 synthetic boundary and mid/landing events are labeled synthetic", () => {
  const boundary = makeSyntheticLedgeWorld("boundary");
  const routes = buildMap47LedgeRoutes(boundary.context, boundary.evidence, { sampleKind: "synthetic" });
  assert.equal(routes.sampleKind, "synthetic");
  assert.ok(routes.boundary.length >= 1);
  assert.match(routes.boundary[0].note, /synthetic/);
  const mid = makeSyntheticLedgeWorld("mid-event");
  const midRoutes = buildMap47LedgeRoutes(mid.context, mid.evidence, { sampleKind: "synthetic" });
  assert.ok(midRoutes.midEventReal.some((item) => item.eventIds.includes(9)));
  const landing = makeSyntheticLedgeWorld("landing-event");
  const jump = ledgeJumpForward2(landing.context, landing.start.x, landing.start.y, 2, { bridgeLevel: 0 });
  assert.equal(jump.jumped, true);
});

test("LD47-05 command 404 is show-choices-branch-end, not empty, and does not change jump physics", () => {
  const sample = makeSyntheticLedgeWorld("with-404");
  const coverage = scanCoverage(sample.facts.events);
  assert.equal(coverage.unknownCommandCodes.includes(404), false);
  const labeled = sample.facts.events[0].pages[0].commands.find((command) => command.code === 404);
  assert.equal(labeled.label, "show-choices-branch-end");
  const impact = command404Impact(sample.facts.events, sample.evidence.ledgeTerrain.cells);
  assert.equal(impact.present, true);
  assert.equal(impact.hits[0].treatedAsEmpty, false);
  assert.equal(impact.affectsLedgePhysics, false);
  const jump = ledgeJumpForward2(sample.context, sample.start.x, sample.start.y, 2, { bridgeLevel: 0 });
  assert.equal(jump.jumped, true);
});

test("LD47-06 live Map47 SHA, cells, (16,9)->(16,11), reverse, and 404 inventory", async (t) => {
  const fsdb = defaultLocalFsdb(repoRoot);
  if (!existsSync(join(fsdb, "[resource]Data", "Map047.rxdata"))) {
    t.skip("local official Map047.rxdata is not present; synthetic LD47 tests still ran");
    return;
  }
  const loaded = await loadOfficialMap47(fsdb);
  assert.equal(loaded.map47.source.files.map.sha256, MAP047_SHA);
  assert.equal(loaded.map47.ledgeTerrain.cellCount, 30);
  assert.equal(loaded.map47.completeness.status, "COMPLETE");
  const routes = buildMap47LedgeRoutes(loaded.context47, loaded.map47, { sampleKind: "official-fsdb" });
  assert.equal(routes.notALiveRun, true);
  assert.equal(routes.grade, "STATIC-INFERRED");
  assert.equal(routes.sampleKind, "official-fsdb");
  assert.ok(routes.legal.length > 0);
  const sample = routes.legal.find((item) => item.start.x === 16 && item.start.y === 9 && item.landing.x === 16 && item.landing.y === 11);
  assert.ok(sample, "historical (16,9)->(16,11) must still be a legal static jump on this SHA");
  assert.equal(sample.jumped, true);
  assert.ok(routes.reverse.every((item) => item.jumped === false));
  assert.equal(routes.crossMapJump.supportedInThisTracer, false);
  const coverage = scanCoverage(loaded.facts47.events);
  const impact = routes.command404;
  if (coverage.unknownCommandCodes.includes(404)) {
    assert.fail("404 must be labeled show-choices-branch-end, not unknown-code-404");
  }
  const has404 = routes.commandInventory.some((item) => item.code === 404);
  if (has404) {
    assert.equal(impact.hits.every((hit) => hit.treatedAsEmpty === false), true);
    assert.equal(impact.affectsLedgePhysics, false);
    assert.equal(impact.hits.every((hit) => hit.onLedgeCell === false), true, "Map47 404 events are not on Ledge cells");
  }
});
