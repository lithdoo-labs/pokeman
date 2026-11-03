import assert from "node:assert/strict";
import test from "node:test";
import {
  JUMP_DURATION_MS,
  JUMP_PEAK_RULE,
  MOTION_ABI_VERSION,
  TERRAIN_BRIDGE,
  TERRAIN_LEDGE,
  TERRAIN_NEUTRAL,
  TERRAIN_NO_EFFECT,
  TERRAIN_NONE,
  TILESET_SCHEMA_SUBJECT,
  TILESET_SCHEMA_VERSION,
  WALK_DURATION_MS,
  canMove,
  evaluatePassability,
  jumpPeakPx,
  migrateLegacyTilesetRecord,
  oneDimensionalIndexTable,
  planMovement,
  projectTilesInBounds,
  resolveEffectiveTerrainTag,
  tileVisualDepth,
  validateMapRecord,
  validateTilesetRecord,
} from "../dist/semantics.js";

const table = (dimensions, xSize, ySize, zSize, values) => ({ dimensions, xSize, ySize, zSize, values });

function ground(width, height, fill = 1) {
  const values = Array(width * height * 3).fill(0);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) values[x + y * width] = fill;
  return validateMapRecord({ tileset_id: 1, width, height, data: table(3, width, height, 3, values) });
}

function tilesetWith(length, apply) {
  const passages = Array(length).fill(0);
  const priorities = Array(length).fill(0);
  const tags = Array(length).fill(0);
  apply?.(passages, priorities, tags);
  return validateTilesetRecord({
    id: 1,
    tileset_name: "terrain",
    autotile_names: [null, null, null, null, null, null, null],
    passages: table(1, length, 1, 1, passages),
    priorities: table(1, length, 1, 1, priorities),
    terrain_tags: table(1, length, 1, 1, tags),
  }, 1);
}

function paint(map, x, y, z, tileId) {
  const values = map.data.values.slice();
  values[x + y * map.width + z * map.width * map.height] = tileId;
  return validateMapRecord({ tileset_id: 1, width: map.width, height: map.height, data: table(3, map.width, map.height, 3, values) });
}

test("DATA-01 six-field Tileset shares tileId indexes and schema subject", () => {
  const tileset = tilesetWith(8, (_p, _r, tags) => { tags[1] = 1; tags[5] = 15; });
  assert.equal(TILESET_SCHEMA_SUBJECT, "map-tileset-terrain-tags-v1");
  assert.equal(TILESET_SCHEMA_VERSION, "struct.Tileset/v2-terrain-tags");
  assert.deepEqual(Object.keys(tileset), ["id", "tileset_name", "autotile_names", "passages", "priorities", "terrain_tags"]);
  assert.equal(tileset.passages.xSize, tileset.terrain_tags.xSize);
  assert.equal(tileset.terrain_tags.values[1], TERRAIN_LEDGE);
  assert.equal(tileset.terrain_tags.values[5], TERRAIN_BRIDGE);
});

test("DATA-02 legacy five-field Tileset is rejected and migrates only through migrateLegacyTilesetRecord", () => {
  const legacy = {
    id: 1,
    tileset_name: "legacy",
    autotile_names: [null, null, null, null, null, null, null],
    passages: table(1, 4, 1, 1, [0, 0, 0, 0]),
    priorities: table(1, 4, 1, 1, [0, 0, 0, 0]),
  };
  assert.throws(() => validateTilesetRecord(legacy, 1), /migrateLegacyTilesetRecord/);
  const migrated = migrateLegacyTilesetRecord(legacy, oneDimensionalIndexTable([0, 0, 0, 0]), 1);
  assert.equal(migrated.terrain_tags.xSize, 4);
  assert.throws(() => migrateLegacyTilesetRecord(legacy, oneDimensionalIndexTable([0, 0]), 1), /xSize must match/);
});

test("DATA-03 short Table, 3D tags, negative tile, tag 18, and missing field fail closed", () => {
  const baseNames = [null, null, null, null, null, null, null];
  assert.throws(() => validateTilesetRecord({
    id: 1, tileset_name: "t", autotile_names: baseNames,
    passages: table(1, 4, 1, 1, [0, 0, 0, 0]),
    priorities: table(1, 4, 1, 1, [0, 0, 0, 0]),
    terrain_tags: table(1, 3, 1, 1, [0, 0, 0]),
  }, 1), /xSize must match/);
  assert.throws(() => validateTilesetRecord({
    id: 1, tileset_name: "t", autotile_names: baseNames,
    passages: table(1, 4, 1, 1, [0, 0, 0, 0]),
    priorities: table(1, 4, 1, 1, [0, 0, 0, 0]),
    terrain_tags: table(3, 2, 2, 1, [0, 0, 0, 0]),
  }, 1), /must be a 1D Table/);
  assert.throws(() => validateTilesetRecord({
    id: 1, tileset_name: "t", autotile_names: baseNames,
    passages: table(1, 4, 1, 1, [0, 0, 0, 0]),
    priorities: table(1, 4, 1, 1, [0, 0, 0, 0]),
    terrain_tags: table(1, 4, 1, 1, [0, 18, 0, 0]),
  }, 1), /0 through 17/);
  assert.throws(() => validateTilesetRecord({
    id: 1, tileset_name: "t", autotile_names: baseNames,
    passages: table(1, 4, 1, 1, [0, 0, 0, 0]),
    priorities: table(1, 4, 1, 1, [0, 0, 0, 0]),
  }, 1), /migrateLegacyTilesetRecord/);
  assert.throws(() => validateTilesetRecord({
    id: 1, tileset_name: "t", autotile_names: baseNames,
    passages: table(1, 4, 1, 1, [0, 0, 0, 0]),
    terrain_tags: table(1, 4, 1, 1, [0, 0, 0, 0]),
  }, 1), /invalid field set/);
  const map = validateMapRecord({
    tileset_id: 1, width: 1, height: 1,
    data: table(3, 1, 1, 3, [-1, 0, 0]),
  });
  const tileset = tilesetWith(8);
  assert.equal(evaluatePassability(map, tileset, 0, 0, 2, 0).status, "invalid");
  assert.match(evaluatePassability(map, tileset, 0, 0, 2, 0).reason, /negative tile/);
});

test("resolveEffectiveTerrainTag and evaluatePassability stay separate", () => {
  let map = ground(3, 3, 1);
  const tileset = tilesetWith(20, (passages, priorities, tags) => {
    passages[1] = 0;
    tags[2] = TERRAIN_NEUTRAL;
    passages[2] = 0x0f;
    tags[3] = TERRAIN_NO_EFFECT;
    passages[3] = 0x0f;
    tags[4] = TERRAIN_BRIDGE;
    passages[4] = 0;
    tags[5] = TERRAIN_NONE;
    passages[5] = 0x0f;
    tags[6] = TERRAIN_LEDGE;
  });
  map = paint(map, 1, 1, 1, 2);
  map = paint(map, 1, 1, 0, 1);
  const tag = resolveEffectiveTerrainTag(map, tileset, 1, 1, 0);
  assert.equal(tag.status, "known");
  assert.equal(tag.tag, TERRAIN_NONE);
  assert.equal(evaluatePassability(map, tileset, 1, 1, 2, 0).passable, true);

  let blocked = paint(ground(3, 3, 1), 1, 1, 2, 3);
  assert.equal(evaluatePassability(blocked, tileset, 1, 1, 2, 0).passable, false);
  assert.equal(resolveEffectiveTerrainTag(blocked, tileset, 1, 1, 0).tag, TERRAIN_NO_EFFECT);

  let noneBlocked = paint(ground(3, 3, 1), 1, 1, 2, 5);
  assert.equal(evaluatePassability(noneBlocked, tileset, 1, 1, 2, 0).passable, false);

  let bridge = paint(ground(3, 3, 1), 1, 1, 2, 4);
  assert.equal(evaluatePassability(bridge, tileset, 1, 1, 2, 0).passable, true);
  assert.equal(evaluatePassability(bridge, tileset, 1, 1, 2, 2).passable, true);
  assert.equal(resolveEffectiveTerrainTag(bridge, tileset, 1, 1, 0).tag, TERRAIN_NONE);
  assert.equal(resolveEffectiveTerrainTag(bridge, tileset, 1, 1, 2).tag, TERRAIN_BRIDGE);

  assert.equal(evaluatePassability(map, tileset, 1, 1, 3, 0).status, "invalid");
  assert.equal(evaluatePassability(map, tileset, 1, 1, 2, 1).status, "invalid");
  assert.equal(evaluatePassability(map, tileset, -1, 0, 2, 0).passable, false);
});

test("MovementPlan JSON examples cover blocked, walk, and jump without executing jump here", () => {
  const tileset = tilesetWith(20, (passages, _p, tags) => {
    passages[2] = 0x0f;
    tags[6] = TERRAIN_LEDGE;
    passages[6] = 0x01;
  });
  const open = ground(5, 5, 1);
  const walk = planMovement(open, tileset, 2, 2, 6, 0);
  assert.deepEqual(walk, {
    kind: "walk", fromX: 2, fromY: 2, toX: 3, toY: 2, direction: 6, durationMs: WALK_DURATION_MS,
  });
  const wall = paint(open, 3, 2, 0, 2);
  assert.deepEqual(planMovement(wall, tileset, 2, 2, 6, 0), { kind: "blocked", direction: 6 });

  let ledgeMap = paint(open, 2, 3, 0, 6);
  const jump = planMovement(ledgeMap, tileset, 2, 2, 2, 0);
  assert.equal(jump.kind, "jump");
  assert.equal(jump.toX, 2);
  assert.equal(jump.toY, 4);
  assert.equal(jump.skippedX, 2);
  assert.equal(jump.skippedY, 3);
  assert.equal(jump.durationMs, JUMP_DURATION_MS);
  assert.equal(jump.peakPx, jumpPeakPx(2));
  assert.equal(jump.peakRule, JUMP_PEAK_RULE);
  assert.equal(WALK_DURATION_MS, 250);
  // Vanilla Essentials v21.1 Map47 reports a ~500ms two-tile speed-3 jump.
  assert.equal(JUMP_DURATION_MS, 500);
  assert.notEqual(JUMP_DURATION_MS, WALK_DURATION_MS);

  const reverse = planMovement(ledgeMap, tileset, 2, 4, 8, 0);
  assert.equal(reverse.kind, "blocked");
  const landingBlocked = paint(ledgeMap, 2, 4, 0, 2);
  assert.equal(planMovement(landingBlocked, tileset, 2, 2, 2, 0).kind, "blocked");
  const edgeMap = ground(3, 3, 1);
  const edgeLedge = paint(edgeMap, 2, 1, 0, 6);
  assert.equal(planMovement(edgeLedge, tileset, 1, 1, 6, 0).kind, "blocked");
  assert.equal(MOTION_ABI_VERSION, "map-motion/v1-walk-jump-bridge");
});

test("canMove uses source direction and target reverse with bridgeLevel", () => {
  const tileset = tilesetWith(20, (passages, _p, tags) => {
    passages[2] = 0x0f;
    tags[4] = TERRAIN_BRIDGE;
    passages[4] = 0x0f;
  });
  const open = ground(3, 3, 1);
  assert.equal(canMove(open, tileset, 1, 1, 2, 0, 1, 0), true);
  const dirBlocked = paint(open, 1, 1, 0, 2);
  assert.equal(canMove(dirBlocked, tileset, 1, 1, 2, 0, 1, 0), false);
  const bridge = paint(open, 1, 2, 2, 4);
  assert.equal(canMove(bridge, tileset, 1, 1, 2, 0, 1, 0), true);
  assert.equal(canMove(bridge, tileset, 1, 1, 2, 0, 1, 2), false);
});

test("Bridge tiles drop to depth 0 at bridgeLevel 2 and non-bridge priority is unchanged", () => {
  const tileset = tilesetWith(400, (_passages, priorities, tags) => {
    tags[385] = TERRAIN_BRIDGE;
    priorities[385] = 4;
    priorities[384] = 4;
  });
  const bounds = { minTileX: 1, maxTileX: 1, minTileY: 1, maxTileY: 1 };
  const bridge = paint(ground(3, 3, 384), 1, 1, 2, 385);
  const under = projectTilesInBounds(bridge, tileset, bounds, 0).find((tile) => tile.tileId === 385);
  const on = projectTilesInBounds(bridge, tileset, bounds, 2).find((tile) => tile.tileId === 385);
  assert.equal(under.depth, (1 + 4 + 1) * 32);
  assert.equal(under.depth, tileVisualDepth(1, 4, TERRAIN_BRIDGE, 0));
  assert.equal(on.depth, 0);
  assert.equal(tileVisualDepth(1, 4, TERRAIN_BRIDGE, 2), 0);
  const roof = projectTilesInBounds(ground(3, 3, 384), tileset, bounds, 0).find((tile) => tile.tileId === 384);
  const roofOnBridge = projectTilesInBounds(ground(3, 3, 384), tileset, bounds, 2).find((tile) => tile.tileId === 384);
  assert.equal(roof.depth, (1 + 4 + 1) * 32);
  assert.equal(roofOnBridge.depth, roof.depth);
});
