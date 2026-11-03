import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const browserBundle = fileURLToPath(new URL("../dist/browser/device-input.browser.js", import.meta.url));

test("device components register, route trusted keyboard input, and disable duplicates", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({ path: browserBundle });
  await page.evaluate(() => {
    globalThis.deviceEvents = [];
    const first = document.createElement("game-keyboard-input");
    first.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ owner: "first", name, data, options }); } });
    document.body.append(first);
    const duplicate = document.createElement("game-keyboard-input");
    duplicate.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ owner: "duplicate", name, data, options }); } });
    document.body.append(duplicate);
  });
  await page.keyboard.down("KeyA");
  await page.keyboard.up("KeyA");
  const result = await page.evaluate(() => ({
    tags: ["game-keyboard-input", "game-pointer-input", "game-gamepad-input"].map((tag) => customElements.get(tag) !== undefined),
    disabled: document.querySelectorAll("game-keyboard-input")[1].getAttribute("data-input-disabled"),
    events: deviceEvents,
  }));
  assert.deepEqual(result.tags, [true, true, true]);
  assert.equal(result.disabled, "duplicate");
  assert.equal(result.events.some(({ owner }) => owner === "duplicate"), false);
  const transitions = result.events.filter(({ name }) => name === "input.event");
  assert.deepEqual(transitions.map(({ data }) => [data.action, data.code, data.repeat]), [["down", "KeyA", false], ["up", "KeyA", false]]);
  for (const event of result.events) {
    assert.equal(event.options.broadcast, true);
    assert.ok(event.options.channel === "keyboard.state" || event.options.channel === "keyboard.event");
  }
});

test("pointer component emits State before edge Event on exact channels", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 200, height: 100 } });
  await page.setContent("<!doctype html><body style='margin:0;width:100vw;height:100vh'></body>");
  await page.addScriptTag({ path: browserBundle });
  await page.evaluate(() => {
    globalThis.deviceEvents = [];
    const pointer = document.createElement("game-pointer-input");
    pointer.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ name, data, options }); } });
    document.body.append(pointer);
  });
  await page.mouse.move(100, 25);
  await page.mouse.down();
  await page.mouse.up();
  const events = await page.evaluate(() => deviceEvents);
  const down = events.findIndex(({ name, data }) => name === "input.event" && data.action === "down");
  assert.ok(down > 0);
  assert.equal(events[down - 1].name, "input.state");
  assert.equal(events[down - 1].options.channel, "pointer.state");
  assert.equal(events[down].options.channel, "pointer.event");
  assert.equal(events[down].options.broadcast, true);
});

test("gamepad component preserves normalization, threshold, ordering, and exact channels", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent("<!doctype html><body></body>");
  await page.evaluate(() => {
    const values = Array(17).fill(0);
    globalThis.padValues = values;
    globalThis.pad = {
      index: 7, connected: true, mapping: "standard",
      axes: [-1, -0.25, 0.5, 2],
      buttons: values.map((value) => ({ value })),
    };
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [globalThis.pad] });
  });
  await page.addScriptTag({ path: browserBundle });
  await page.evaluate(() => {
    globalThis.deviceEvents = [];
    const gamepad = document.createElement("game-gamepad-input");
    gamepad.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ name, data, options }); } });
    document.body.append(gamepad);
  });
  await page.evaluate(() => { padValues[0] = 0.5; pad.buttons[0].value = 0.5; });
  await page.waitForFunction(() => deviceEvents.some(({ name }) => name === "input.event"));
  const events = await page.evaluate(() => deviceEvents);
  const edge = events.findIndex(({ name }) => name === "input.event");
  assert.ok(edge > 0);
  assert.equal(events[edge - 1].options.channel, "gamepad.state");
  assert.equal(events[edge].options.channel, "gamepad.event");
  assert.deepEqual(events[edge].data, { action: "down", gamepadId: 1, button: "south", value: 500000 });
  const sample = events[edge - 1].data.gamepads[0];
  assert.deepEqual(sample.axes, { leftX: -1000000, leftY: -250000, rightX: 500000, rightY: 1000000 });
  assert.equal(events.every(({ options }) => options.broadcast === true), true);
});

test("Pocket Block unmapped AYANEO pad publishes raw canonical D-pad State before Event", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent("<!doctype html><body></body>");
  await page.evaluate(() => {
    globalThis.pocketPad = {
      index: 2, connected: true, id: "AYANEO Controller (Vendor: 4001 Product: 0428)",
      mapping: "", axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0 })),
    };
    const unknown = {
      index: 3, connected: true, id: "Unknown non-standard controller", mapping: "",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({ value: i === 12 ? 1 : 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true, value: () => [globalThis.pocketPad, unknown],
    });
  });
  await page.addScriptTag({ path: browserBundle });
  await page.evaluate(() => {
    globalThis.deviceEvents = [];
    const gamepad = document.createElement("game-gamepad-input");
    gamepad.receiveRenderContext({
      emitCustomEvent(name, data, options) { deviceEvents.push({ name, data, options }); },
    });
    document.body.append(gamepad);
  });
  await page.waitForFunction(() => deviceEvents.some((event) => event.options.channel === "gamepad.state"));
  const baseline = await page.evaluate(() =>
    deviceEvents.find((event) => event.options.channel === "gamepad.state").data.gamepads
  );
  assert.equal(baseline.length, 1, "unknown unmapped pad must not be interpreted as canonical");
  assert.equal(baseline[0].gamepadId, 1);
  assert.equal(baseline[0].buttons.dpadUp, 0);

  for (const [index, button] of [[12, "dpadUp"], [13, "dpadDown"], [14, "dpadLeft"], [15, "dpadRight"]]) {
    for (const [value, action] of [[1, "down"], [0, "up"]]) {
      const before = await page.evaluate(() => deviceEvents.length);
      await page.evaluate(({ index, value }) => { pocketPad.buttons[index].value = value; }, { index, value });
      await page.waitForFunction(({ before, button, action }) =>
        deviceEvents.slice(before).some((event) =>
          event.options.channel === "gamepad.event"
          && event.data.button === button
          && event.data.action === action
        ), { before, button, action });
      const batch = await page.evaluate((from) => deviceEvents.slice(from), before);
      const edgeIndex = batch.findIndex((event) =>
        event.options.channel === "gamepad.event"
        && event.data.button === button
        && event.data.action === action
      );
      assert.ok(edgeIndex > 0, button + " " + action + " must follow gamepad.state");
      assert.equal(batch[edgeIndex - 1].options.channel, "gamepad.state");
      assert.equal(batch[edgeIndex - 1].data.gamepads.length, 1);
      assert.equal(batch[edgeIndex - 1].data.gamepads[0].buttons[button], value * 1_000_000);
      assert.equal(batch[edgeIndex].data.value, value * 1_000_000);
      assert.equal(batch[edgeIndex].data.gamepadId, 1);
    }
  }
});

test("non-neutral State refreshes and disconnect stops publication while releasing the duplicate claim", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({ path: browserBundle });
  await page.evaluate(() => {
    globalThis.deviceEvents = [];
    const keyboard = document.createElement("game-keyboard-input");
    keyboard.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ name, data, options }); } });
    document.body.append(keyboard);
  });
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1100);
  const refreshed = await page.evaluate(() => deviceEvents.filter(({ name, data }) => name === "input.state" && data.down?.includes("KeyW")).length);
  assert.ok(refreshed >= 2);
  await page.evaluate(() => document.querySelector("game-keyboard-input").remove());
  const before = await page.evaluate(() => deviceEvents.length);
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(() => deviceEvents.length), before);
  assert.equal(await page.evaluate(() => {
    const replacement = document.createElement("game-keyboard-input");
    replacement.receiveRenderContext({ emitCustomEvent() {} });
    document.body.append(replacement);
    return replacement.hasAttribute("data-input-disabled");
  }), false);
});
