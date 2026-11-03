import assert from "node:assert/strict";
import test from "node:test";
import { createFreshDeviceStateTracker } from "../dist/index.js";

test("fresh State tracker falls back to the channel empty State after silence", async () => {
  const seen = [];
  const tracker = createFreshDeviceStateTracker("keyboard.state", (payload) => seen.push(payload), { staleAfterMs: 20 });
  tracker.accept({ down: ["KeyA"] });
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(seen, [{ down: ["KeyA"] }, { down: [] }]);
  tracker.close();
});

test("fresh State tracker resets its deadline and close prevents fallback", async () => {
  const seen = [];
  const tracker = createFreshDeviceStateTracker("pointer.state", (payload) => seen.push(payload), { staleAfterMs: 25 });
  tracker.accept({ pointers: [{ pointerId: 1 }] });
  await new Promise((resolve) => setTimeout(resolve, 15));
  tracker.accept({ pointers: [{ pointerId: 1 }] });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(seen.length, 2);
  tracker.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(seen.length, 2);
});
