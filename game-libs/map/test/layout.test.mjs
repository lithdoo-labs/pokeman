import test from "node:test";
import assert from "node:assert/strict";
import { calculateLayout } from "../dist/layout.js";

const cases = [
  [640, 480, 32, 640, 448, 20, 14],
  [800, 600, 32, 800, 568, 25, 18],
  [1280, 720, 48, 1280, 672, 40, 21],
  [1920, 1080, 48, 1920, 1032, 60, 33],
  [1920, 480, 32, 1920, 448, 60, 14],
  [640, 1080, 48, 640, 1032, 20, 33],
];

test("calculateLayout implements the frozen viewport matrix", () => {
  for (const [w, h, bar, cw, ch, columns, rows] of cases) {
    const value = calculateLayout(w, h);
    assert.deepEqual([value.barHeight, value.contentWidth, value.contentHeight, value.columns, value.rows], [bar, cw, ch, columns, rows]);
    assert.equal(value.logicalWidth, columns * 32);
    assert.equal(value.logicalHeight, rows * 32);
    assert.ok(Math.abs(value.scaleX * value.logicalWidth - cw) < 1e-9);
    assert.ok(Math.abs(value.scaleY * value.logicalHeight - ch) < 1e-9);
    assert.ok(Object.isFrozen(value));
  }
});

test("calculateLayout uses the exact footer thresholds", () => {
  assert.equal(calculateLayout(640, 479).barHeight, 24);
  assert.equal(calculateLayout(640, 480).barHeight, 32);
  assert.equal(calculateLayout(640, 719).barHeight, 32);
  assert.equal(calculateLayout(640, 720).barHeight, 48);
});

test("calculateLayout only uses the proportional branch strictly outside row bounds", () => {
  assert.deepEqual([calculateLayout(320, 344, 10, 20).columns, calculateLayout(320, 344, 10, 20).rows], [10, 10]);
  assert.deepEqual([calculateLayout(321, 376, 10, 20).columns, calculateLayout(321, 376, 10, 20).rows], [11, 11]);
  const below = calculateLayout(1000, 100, 14, 33);
  assert.equal(below.rows, 14);
  assert.equal(below.columns, Math.round(14 * 1000 / 76));
  const above = calculateLayout(641, 2000, 14, 33);
  assert.equal(above.rows, 33);
  assert.equal(above.columns, Math.round(33 * 641 / 1952));
});

test("calculateLayout preserves Math.round and non-uniform scale", () => {
  const value = calculateLayout(101, 100, 2, 2, 32);
  assert.equal(value.columns, 3);
  assert.notEqual(value.scaleX, value.scaleY);
});

test("calculateLayout rejects invalid and overflowing inputs", () => {
  for (const args of [[0, 480], [-1, 480], [640, NaN], [640.5, 480], [640, 24], [640, 480, 0], [640, 480, 3, 2], [640, 480, 14, 33, Number.MAX_SAFE_INTEGER]]) {
    assert.throws(() => calculateLayout(...args));
  }
});
