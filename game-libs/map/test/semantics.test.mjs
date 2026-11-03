import assert from "node:assert/strict";
import test from "node:test";
import { AUTOTILE_QUARTERS, assertProjectable, assertRenderableTileId, autotileCorners, boundsContain, canMove, clampViewport, computeCamera, DEFAULT_VIEWPORT, expandTileBounds, mapTilePassable, MAX_VIEWPORT, MIN_VIEWPORT, projectTileBlit, projectTilesInBounds, projectVisibleTiles, tableAt, tileVisualDepth, unionTileBounds, validateMapRecord, validateMapTransferRecord, validateTable, validateTilesetRecord, viewportTileBounds } from "../dist/semantics.js";

const table = (dimensions, xSize, ySize, zSize, values) => ({ dimensions, xSize, ySize, zSize, values });
function fixture() {
  const values = Array(24 * 18 * 3).fill(0);
  for (let y = 0; y < 18; y += 1) for (let x = 0; x < 24; x += 1) values[x + y * 24] = 384;
  values[12 + 8 * 24] = 385;
  const passages = Array(386).fill(0); passages[385] = 0x02;
  const priorities = Array(386).fill(0); priorities[0] = 5;
  return {
    map: { tileset_id: 1, width: 24, height: 18, data: table(3, 24, 18, 3, values) },
    tileset: { id: 1, tileset_name: "m14_tileset", autotile_names: [null,null,null,null,null,null,null], passages: table(1, 386, 1, 1, passages), priorities: table(1, 386, 1, 1, priorities), terrain_tags: table(1, 386, 1, 1, Array(386).fill(0)) },
  };
}

test("tileVisualDepth matches the frozen RMXP vectors", () => {
  assert.equal(tileVisualDepth(0, 0), 0);
  assert.equal(tileVisualDepth(0, 1), 64);
  assert.equal(tileVisualDepth(1, 1), 96);
  assert.equal(tileVisualDepth(0, 2), 96);
});

test("Map clamps Core viewport samples to 320x240 through 1920x1080", () => {
  assert.deepEqual(clampViewport(null), DEFAULT_VIEWPORT);
  assert.deepEqual(clampViewport({ width: 10, height: 10 }), MIN_VIEWPORT);
  assert.deepEqual(clampViewport({ width: 4000, height: 4000 }), MAX_VIEWPORT);
  assert.deepEqual(clampViewport({ width: 1280, height: 720 }), { width: 1280, height: 720 });
});

test("Table, camera and visible projection follow frozen ordering", () => {
  const { map: raw, tileset: rawTileset } = fixture();
  const map = validateMapRecord(raw);
  const tileset = validateTilesetRecord(rawTileset, 1);
  assert.equal(tableAt(map.data, 12, 8, 0), 385);
  assert.deepEqual(computeCamera(map, 10, 8), { cameraX: 16, cameraY: 32 });
  const tiles = projectVisibleTiles(map, tileset, 16, 32);
  assert.deepEqual(tiles[0], { x: 0, y: 0, z: 0, tileId: 384, depth: 0, blit: { kind: "regular", sourceIndex: 0 } });
  assert.ok(tiles.find((tile) => tile.x === 12 && tile.y === 8 && tile.tileId === 385));
});

test("visible projection clamps one-tile overscan to map bounds", () => {
  const { map: raw, tileset: rawTileset } = fixture();
  const map = validateMapRecord(raw);
  const tileset = validateTilesetRecord(rawTileset, 1);
  const origin = projectVisibleTiles(map, tileset, 0, 0);
  assert.equal(origin[0].x, 0);
  assert.equal(origin[0].y, 0);
  assert.equal(origin.some((tile) => tile.x < 0 || tile.y < 0), false);
  const far = projectVisibleTiles(map, tileset, map.width * 32, map.height * 32);
  assert.equal(far.some((tile) => tile.x >= map.width || tile.y >= map.height), false);
  assert.ok(far.find((tile) => tile.x === map.width - 1 && tile.y === map.height - 1));
});

test("projectTilesInBounds is the only traversal and matches visible overscan", () => {
  const { map: raw, tileset: rawTileset } = fixture();
  const map = validateMapRecord(raw);
  const tileset = validateTilesetRecord(rawTileset, 1);
  const camera = computeCamera(map, 10, 8);
  const visible = projectVisibleTiles(map, tileset, camera.cameraX, camera.cameraY);
  const bounds = expandTileBounds(viewportTileBounds(map, camera.cameraX, camera.cameraY), 1, map);
  assert.deepEqual(projectTilesInBounds(map, tileset, bounds), visible);
  assert.equal(bounds.minTileX, Math.max(0, Math.floor(camera.cameraX / 32) - 1));
});

test("viewport union margin and clamp formulas are inclusive integer bounds", () => {
  const { map: raw, tileset: rawTileset } = fixture();
  const map = validateMapRecord(raw);
  const tileset = validateTilesetRecord(rawTileset, 1);
  const origin = viewportTileBounds(map, 0, 0);
  assert.deepEqual(origin, { minTileX: 0, minTileY: 0, maxTileX: 19, maxTileY: 14 });
  const unaligned = viewportTileBounds(map, 1, 1);
  assert.deepEqual(unaligned, { minTileX: 0, minTileY: 0, maxTileX: 20, maxTileY: 15 });
  const far = viewportTileBounds(map, map.width * 32, map.height * 32);
  assert.equal(far.maxTileX, map.width - 1);
  assert.equal(far.maxTileY, map.height - 1);
  const expanded = expandTileBounds(origin, 4, map);
  assert.deepEqual(expanded, { minTileX: 0, minTileY: 0, maxTileX: 23, maxTileY: 17 });
  const source = viewportTileBounds(map, 16, 32);
  const target = viewportTileBounds(map, 48, 32);
  const union = unionTileBounds(source, target);
  assert.equal(union.minTileX, Math.min(source.minTileX, target.minTileX));
  assert.equal(union.maxTileX, Math.max(source.maxTileX, target.maxTileX));
  assert.equal(boundsContain(expandTileBounds(union, 1, map), union), true);
  assert.equal(boundsContain(origin, expandTileBounds(origin, 1, map)), false);
  const tiles = projectTilesInBounds(map, tileset, origin);
  assert.equal(tiles.every((tile) => tile.z === 0 || tile.z === 1 || tile.z === 2), true);
  assert.ok(tiles[0].blit);
});

test("target camera overscan covers the previous step's source camera edge", () => {
  const { map: raw, tileset: rawTileset } = fixture();
  const map = validateMapRecord(raw);
  const tileset = validateTilesetRecord(rawTileset, 1);
  const source = computeCamera(map, 10, 8);
  const target = computeCamera(map, 11, 8);
  assert.deepEqual(source, { cameraX: 16, cameraY: 32 });
  assert.deepEqual(target, { cameraX: 48, cameraY: 32 });
  const sourceEdgeX = Math.floor(source.cameraX / 32);
  const tiles = projectVisibleTiles(map, tileset, target.cameraX, target.cameraY);
  assert.ok(tiles.find((tile) => tile.x === sourceEdgeX && tile.y === Math.floor(source.cameraY / 32)));
  assert.ok(tiles.find((tile) => tile.x === Math.min(map.width - 1, Math.floor((target.cameraX + 639) / 32) + 1)));
});

test("Tileset.priorities accepts 0 through 5 and rejects the rest", () => {
  const accepted = fixture();
  accepted.tileset.priorities.values[384] = 0;
  accepted.tileset.priorities.values[385] = 5;
  assert.doesNotThrow(() => validateTilesetRecord(accepted.tileset, 1));

  const tooLow = fixture();
  tooLow.tileset.priorities.values[384] = -1;
  assert.throws(() => validateTilesetRecord(tooLow.tileset, 1), /priorities/);

  const tooHigh = fixture();
  tooHigh.tileset.priorities.values[384] = 6;
  assert.throws(() => validateTilesetRecord(tooHigh.tileset, 1), /priorities/);
});

test("projection depth follows priority while z/y/x order stays fixed", () => {
  const raw = fixture();
  const map = validateMapRecord(raw.map);
  const tilesetPriority0 = validateTilesetRecord(raw.tileset, 1);
  const tilesPriority0 = projectVisibleTiles(map, tilesetPriority0, 16, 32);
  const sample0 = tilesPriority0.find((tile) => tile.x === 0 && tile.y === 1 && tile.tileId === 384);
  assert.equal(sample0.depth, 0);

  raw.tileset.priorities.values[384] = 1;
  const tilesetPriority1 = validateTilesetRecord(raw.tileset, 1);
  const tilesPriority1 = projectVisibleTiles(map, tilesetPriority1, 16, 32);
  const sample1 = tilesPriority1.find((tile) => tile.x === 0 && tile.y === 1 && tile.tileId === 384);
  assert.equal(sample1.depth, 96);
  assert.notEqual(sample0.depth, sample1.depth);
  assert.deepEqual(
    tilesPriority0.map(({ x, y, z, tileId }) => ({ x, y, z, tileId })),
    tilesPriority1.map(({ x, y, z, tileId }) => ({ x, y, z, tileId })),
  );
});

test("consumer records fail closed instead of accepting alternate shapes", () => {
  const { map, tileset } = fixture();
  assert.throws(() => validateMapRecord({ ...map, events: [] }), /field set/);
  assert.throws(() => validateTilesetRecord({ ...tileset, id: 2 }, 1), /Content key/);
  assert.throws(() => validateTable({ ...map.data, surprise: true }, "Map.data"), /field set/);
});

test("Map.behaviors accepts strict non-overlapping bridges and rejects malformed regions", () => {
  const base = { tileset_id: 1, width: 2, height: 2, data: table(3, 2, 2, 3, Array(12).fill(0)) };
  const record = validateMapRecord({ ...base, behaviors: [{ kind: "bridge", operation: "on", occupied: [{ x: 1, y: 1 }] }] });
  assert.deepEqual(record.behaviors, [{ kind: "bridge", operation: "on", occupied: [{ x: 1, y: 1 }] }]);
  assert.equal(Object.isFrozen(record.behaviors), true);
  assert.throws(() => validateMapRecord({ ...base, behaviors: [{ kind: "ledge", operation: "on", occupied: [{ x: 1, y: 1 }] }] }), /kind must be bridge/u);
  assert.throws(() => validateMapRecord({ ...base, behaviors: [{ kind: "bridge", operation: "on", occupied: [{ x: 2, y: 1 }] }] }), /outside Map bounds/u);
  assert.throws(() => validateMapRecord({ ...base, behaviors: [
    { kind: "bridge", operation: "on", occupied: [{ x: 1, y: 1 }] },
    { kind: "bridge", operation: "off", occupied: [{ x: 1, y: 1 }] },
  ] }), /overlap/u);
});

test("passability covers every direction bit and the all-direction block", () => {
  const directionBits = [[2, 0x01], [4, 0x02], [6, 0x04], [8, 0x08]];
  for (const [direction, bit] of directionBits) {
    const raw = fixture();
    raw.tileset.passages.values[384] = bit;
    const map = validateMapRecord(raw.map);
    const tileset = validateTilesetRecord(raw.tileset, 1);
    assert.equal(mapTilePassable(map, tileset, 10, 8, direction), false, `direction ${direction}`);
    const otherDirection = direction === 2 ? 4 : 2;
    assert.equal(mapTilePassable(map, tileset, 10, 8, otherDirection), true, `non-matching direction ${otherDirection}`);
  }
  const raw = fixture();
  raw.tileset.passages.values[384] = 0x0f;
  const map = validateMapRecord(raw.map);
  const tileset = validateTilesetRecord(raw.tileset, 1);
  for (const [direction] of directionBits) assert.equal(mapTilePassable(map, tileset, 10, 8, direction), false);
});

test("passability respects z=2,1,0 priority layering and bounds", () => {
  const raw = fixture();
  const index = 10 + 8 * 24;
  raw.map.data.values[index + 2 * 24 * 18] = 385;
  raw.tileset.passages.values[385] = 0;
  raw.tileset.priorities.values[385] = 1;
  raw.tileset.passages.values[384] = 0x04;
  let map = validateMapRecord(raw.map);
  let tileset = validateTilesetRecord(raw.tileset, 1);
  assert.equal(mapTilePassable(map, tileset, 10, 8, 6), false, "priority > 0 continues to a blocked lower layer");

  raw.tileset.priorities.values[385] = 0;
  map = validateMapRecord(raw.map);
  tileset = validateTilesetRecord(raw.tileset, 1);
  assert.equal(mapTilePassable(map, tileset, 10, 8, 6), true, "priority == 0 decides pass before the lower layer");
  assert.equal(mapTilePassable(map, tileset, -1, 8, 6), false);
  assert.equal(mapTilePassable(map, tileset, 24, 8, 6), false);
});

test("movement checks both source direction and target reverse direction", () => {
  const sourceBlocked = fixture();
  sourceBlocked.tileset.passages.values[384] = 0x04;
  assert.equal(canMove(validateMapRecord(sourceBlocked.map), validateTilesetRecord(sourceBlocked.tileset, 1), 10, 8, 6, 1, 0), false);

  const targetBlocked = fixture();
  targetBlocked.map.data.values[11 + 8 * 24] = 385;
  targetBlocked.tileset.passages.values[385] = 0x02;
  assert.equal(canMove(validateMapRecord(targetBlocked.map), validateTilesetRecord(targetBlocked.tileset, 1), 10, 8, 6, 1, 0), false);

  const passable = fixture();
  assert.equal(canMove(validateMapRecord(passable.map), validateTilesetRecord(passable.tileset, 1), 10, 8, 6, 1, 0), true);
  assert.equal(canMove(validateMapRecord(passable.map), validateTilesetRecord(passable.tileset, 1), 23, 8, 6, 1, 0), false);
});

test("validateMapTransferRecord accepts empty/step/contact/edge records", () => {
  assert.deepEqual(validateMapTransferRecord({ id: 1, steps: [], contacts: [], edges: [] }, 1), {
    id: 1, steps: [], contacts: [], edges: [],
  });
  const record = validateMapTransferRecord({
    id: 66,
    steps: [{ x: 12, y: 7, targetMapId: 50, targetX: 12, targetY: 7, targetDirection: null }],
    contacts: [{ x: 12, y: 8, direction: 8, targetMapId: 67, targetX: 4, targetY: 7, targetDirection: 8 }],
    edges: [{ x: 21, y: 8, direction: 6, targetMapId: 2, targetX: 0, targetY: 8 }],
  }, 66);
  assert.equal(record.steps[0].targetDirection, null);
  assert.equal(record.contacts[0].direction, 8);
  assert.equal(record.edges[0].targetMapId, 2);
  assert.equal("targetDirection" in record.edges[0], false);
});

test("validateMapTransferRecord rejects unknown fields, wrong ids, directions, duplicates, and extra edge fields", () => {
  assert.throws(() => validateMapTransferRecord({ id: 1, steps: [], contacts: [], edges: [], extra: true }, 1), /field set/);
  assert.throws(() => validateMapTransferRecord({ id: 2, steps: [], contacts: [], edges: [] }, 1), /Content key/);
  assert.throws(() => validateMapTransferRecord({
    id: 1, steps: [], contacts: [{ x: 0, y: 0, direction: 1, targetMapId: 2, targetX: 0, targetY: 0, targetDirection: null }], edges: [],
  }, 1), /direction/);
  assert.throws(() => validateMapTransferRecord({
    id: 1,
    steps: [
      { x: 1, y: 1, targetMapId: 2, targetX: 0, targetY: 0, targetDirection: null },
      { x: 1, y: 1, targetMapId: 3, targetX: 0, targetY: 0, targetDirection: 2 },
    ],
    contacts: [],
    edges: [],
  }, 1), /duplicate/);
  assert.throws(() => validateMapTransferRecord({
    id: 1, steps: [], contacts: [], edges: [{ x: 0, y: 0, direction: 6, targetMapId: 2, targetX: 0, targetY: 0, targetDirection: 6 }],
  }, 1), /field set/);
});

test("validateMapTransferRecord returns a detached deep-frozen record", () => {
  const input = {
    id: 1,
    steps: [{ x: 1, y: 2, targetMapId: 2, targetX: 3, targetY: 4, targetDirection: 8 }],
    contacts: [],
    edges: [],
  };
  const record = validateMapTransferRecord(input, 1);
  input.steps[0].x = 99;
  assert.equal(record.steps[0].x, 1);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.steps));
  assert.ok(Object.isFrozen(record.steps[0]));
});


test("autotileCorners covers all 48 variants with the frozen quarter table", () => {
  assert.equal(AUTOTILE_QUARTERS.length, 48);
  for (let variant = 0; variant < 48; variant += 1) {
    const corners = autotileCorners(variant);
    assert.equal(corners.length, 4);
    for (let index = 0; index < 4; index += 1) {
      const q = AUTOTILE_QUARTERS[variant][index] - 1;
      assert.deepEqual(corners[index], { sx: (q % 6) * 16, sy: Math.floor(q / 6) * 16 });
    }
  }
  assert.throws(() => autotileCorners(-1), /0 through 47/);
  assert.throws(() => autotileCorners(48), /0 through 47/);
});

test("Map002 ids project Flowers1 autotile blit", () => {
  const passages = Array(4400).fill(0);
  const priorities = Array(4400).fill(0);
  const tileset = validateTilesetRecord({
    id: 1,
    tileset_name: "Outside",
    autotile_names: ["Sea", "Sea without shore", "Sea deep", "Sand shore", "Flowers1", "Water rock", "Fountain1"],
    passages: table(1, 4400, 1, 1, passages),
    priorities: table(1, 4400, 1, 1, priorities),
    terrain_tags: table(1, 4400, 1, 1, Array(4400).fill(0)),
  }, 1);
  const samples = [
    [260, 20], [268, 28], [274, 34], [276, 36], [278, 38], [280, 40],
  ];
  for (const [tileId, variant] of samples) {
    const blit = projectTileBlit(tileId, tileset);
    assert.equal(blit.kind, "autotile");
    assert.equal(blit.slot, 4);
    assert.deepEqual(blit.corners, autotileCorners(variant));
  }
  assert.throws(() => assertRenderableTileId(1, tileset), /Unsupported map tile id 1/);
  assert.throws(() => projectTileBlit(260, validateTilesetRecord({
    id: 1, tileset_name: "Outside",
    autotile_names: [null, null, null, null, null, null, null],
    passages: table(1, 4400, 1, 1, passages),
    priorities: table(1, 4400, 1, 1, priorities),
    terrain_tags: table(1, 4400, 1, 1, Array(4400).fill(0)),
  }, 1)), /Unsupported map tile id 260/);
});

test("assertProjectable and projectVisibleTiles share the same invalid tile failure", () => {
  const values = Array(2 * 2 * 3).fill(0);
  values[0] = 274;
  const map = validateMapRecord({ tileset_id: 1, width: 2, height: 2, data: table(3, 2, 2, 3, values) });
  const tileset = validateTilesetRecord({
    id: 1, tileset_name: "Outside",
    autotile_names: [null, null, null, null, null, null, null],
    passages: table(1, 4400, 1, 1, Array(4400).fill(0)),
    priorities: table(1, 4400, 1, 1, Array(4400).fill(0)),
    terrain_tags: table(1, 4400, 1, 1, Array(4400).fill(0)),
  }, 1);
  assert.throws(() => assertProjectable(map, tileset), /Unsupported map tile id 274/);
  assert.throws(() => projectVisibleTiles(map, tileset, 0, 0), /Unsupported map tile id 274/);
});
