import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const browserBundle = fileURLToPath(new URL("../dist/browser/device-input.browser.js", import.meta.url));

async function openPage(t, html = "<!doctype html><body></body>") {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(html);
  await page.addScriptTag({ path: browserBundle });
  return page;
}

async function mount(page, tag = "game-controls-input", owner = "controls") {
  await page.evaluate(({ tag, owner }) => {
    globalThis.deviceEvents = globalThis.deviceEvents ?? [];
    const element = document.createElement(tag);
    element.receiveRenderContext({
      emitCustomEvent(name, data, options) { deviceEvents.push({ owner, name, data, options }); },
    });
    document.body.append(element);
  }, { tag, owner });
}

async function sendCustom(page, down, selector = "game-controls-input") {
  await page.evaluate(({ down, selector }) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    element.dispatchEvent(new CustomEvent("loomrealm:debug-input", {
      detail: { version: 1, down },
      bubbles: false,
      composed: false,
      cancelable: false,
    }));
  }, { down, selector });
}

function controls(events, owner = "controls") {
  return events.filter((event) => event.owner === owner);
}

const fullscreenOverlay = "dialog[data-game-controls-fullscreen-overlay]";

async function openFullscreenOverlay(page) {
  await page.keyboard.down("Tab");
  await page.waitForSelector(`${fullscreenOverlay}[open]`, { timeout: 2_000 });
  await page.keyboard.up("Tab");
}

async function installFullscreenMock(page, mode = "success") {
  await page.evaluate((initialMode) => {
    globalThis.fullscreenMock = {
      mode: initialMode,
      element: null,
      enterCalls: 0,
      exitCalls: 0,
      enterInsideClick: [],
      exitInsideClick: [],
      clickDispatch: false,
    };
    document.addEventListener("click", () => { fullscreenMock.clickDispatch = true; }, true);
    document.addEventListener("click", () => { fullscreenMock.clickDispatch = false; });
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      get: () => fullscreenMock.mode !== "unsupported",
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenMock.element,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value() {
        fullscreenMock.enterCalls += 1;
        fullscreenMock.enterInsideClick.push(fullscreenMock.clickDispatch);
        if (fullscreenMock.mode === "reject-enter") return Promise.reject(new Error("enter denied"));
        fullscreenMock.element = document.documentElement;
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      },
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value() {
        fullscreenMock.exitCalls += 1;
        fullscreenMock.exitInsideClick.push(fullscreenMock.clickDispatch);
        if (fullscreenMock.mode === "reject-exit") return Promise.reject(new Error("exit denied"));
        fullscreenMock.element = null;
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      },
    });
    if (initialMode === "unsupported") {
      Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: undefined });
      Object.defineProperty(document, "exitFullscreen", { configurable: true, value: undefined });
    }
  }, mode);
}

test("Select short press stays silent and one 800ms keyboard hold opens only one overlay", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div></body>");
  await installFullscreenMock(page);
  await mount(page);
  await page.locator("#surface").focus();
  await page.keyboard.down("Tab");
  await page.waitForTimeout(300);
  await page.keyboard.up("Tab");
  await page.waitForTimeout(550);
  assert.equal(await page.locator(fullscreenOverlay).count(), 0);

  await openFullscreenOverlay(page);
  await page.waitForTimeout(900);
  const result = await page.evaluate((selector) => ({
    dialogs: document.querySelectorAll(selector).length,
    open: document.querySelector(selector)?.open,
    enterCalls: fullscreenMock.enterCalls,
    exitCalls: fullscreenMock.exitCalls,
  }), fullscreenOverlay);
  assert.deepEqual(result, { dialogs: 1, open: true, enterCalls: 0, exitCalls: 0 });
});

test("keyboard and standard gamepad Select share one hold and gamepad can reopen independently", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div></body>");
  await page.evaluate(() => {
    globalThis.pad = {
      index: 0, connected: true, mapping: "standard", axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [globalThis.pad] });
  });
  await installFullscreenMock(page);
  await mount(page);
  await page.locator("#surface").focus();
  await page.keyboard.down("Tab");
  await page.evaluate(() => { pad.buttons[8].value = 1; });
  await page.waitForSelector(`${fullscreenOverlay}[open]`, { timeout: 2_000 });
  await page.keyboard.up("Tab");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  assert.equal(await page.locator(`${fullscreenOverlay}[open]`).count(), 0, "held gamepad Select must not retrigger");

  await page.evaluate(() => { pad.buttons[8].value = 0; });
  await page.waitForFunction(() => deviceEvents.some((event) =>
    event.options.channel === "controls.event" && event.data.button === "select" && event.data.action === "up"
  ));
  await page.evaluate(() => { pad.buttons[8].value = 1; });
  await page.waitForSelector(`${fullscreenOverlay}[open]`, { timeout: 2_000 });
  assert.equal(await page.locator(fullscreenOverlay).count(), 1);
  assert.deepEqual(await page.evaluate(() => [fullscreenMock.enterCalls, fullscreenMock.exitCalls]), [0, 0]);
});

test("blur, hidden page, disconnected input, and unmount cancel pending Select holds", async (t) => {
  const blurPage = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div></body>");
  await mount(blurPage);
  await blurPage.locator("#surface").focus();
  await blurPage.keyboard.down("Tab");
  await blurPage.waitForTimeout(150);
  await blurPage.evaluate(() => {
    document.hasFocus = () => false;
    window.dispatchEvent(new Event("blur"));
  });
  await blurPage.waitForTimeout(700);
  assert.equal(await blurPage.locator(fullscreenOverlay).count(), 0, "blur");

  const hiddenPage = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div></body>");
  await hiddenPage.evaluate(() => {
    globalThis.visibleState = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibleState });
  });
  await mount(hiddenPage);
  await hiddenPage.locator("#surface").focus();
  await hiddenPage.keyboard.down("Tab");
  await hiddenPage.waitForTimeout(150);
  await hiddenPage.evaluate(() => {
    globalThis.visibleState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await hiddenPage.waitForTimeout(700);
  assert.equal(await hiddenPage.locator(fullscreenOverlay).count(), 0, "hidden page");

  const padPage = await openPage(t);
  await padPage.evaluate(() => {
    globalThis.pad = {
      index: 4, connected: true, mapping: "standard", axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, index) => ({ value: index === 8 ? 1 : 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => pad.connected ? [globalThis.pad] : [] });
  });
  await mount(padPage);
  await padPage.waitForFunction(() => deviceEvents.some((event) => event.data.down?.includes("select")));
  await padPage.waitForTimeout(150);
  await padPage.evaluate(() => { pad.connected = false; });
  await padPage.waitForFunction(() => deviceEvents.some((event) =>
    event.options.channel === "controls.state" && event.data.down?.length === 0
  ));
  await padPage.waitForTimeout(700);
  assert.equal(await padPage.locator(fullscreenOverlay).count(), 0, "disconnected input");

  const unmountPage = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div></body>");
  await mount(unmountPage);
  await unmountPage.locator("#surface").focus();
  await unmountPage.keyboard.down("Tab");
  await unmountPage.waitForTimeout(150);
  await unmountPage.evaluate(() => document.querySelector("game-controls-input").remove());
  await unmountPage.waitForTimeout(700);
  assert.equal(await unmountPage.locator(fullscreenOverlay).count(), 0, "unmount");
});

test("overlay is a viewport modal dialog, closes explicitly, and unmount removes DOM and listeners", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div></body>");
  await page.evaluate(() => {
    globalThis.overlayProbe = { show: 0, close: 0, fullscreenListeners: new Set() };
    const showModal = HTMLDialogElement.prototype.showModal;
    const close = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.showModal = function () {
      overlayProbe.show += 1;
      return showModal.call(this);
    };
    HTMLDialogElement.prototype.close = function () {
      overlayProbe.close += 1;
      return close.call(this);
    };
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = (type, listener, options) => {
      if (type === "fullscreenchange" || type === "fullscreenerror") overlayProbe.fullscreenListeners.add(listener);
      return add(type, listener, options);
    };
    document.removeEventListener = (type, listener, options) => {
      if (type === "fullscreenchange" || type === "fullscreenerror") overlayProbe.fullscreenListeners.delete(listener);
      return remove(type, listener, options);
    };
  });
  await installFullscreenMock(page);
  await mount(page);
  await page.locator("#surface").focus();
  await openFullscreenOverlay(page);
  const modal = await page.evaluate((selector) => {
    const dialog = document.querySelector(selector);
    return {
      tag: dialog.tagName,
      open: dialog.open,
      role: dialog.getAttribute("role"),
      modal: dialog.getAttribute("aria-modal"),
      position: dialog.style.position,
      inset: dialog.style.inset,
      width: dialog.style.width,
      height: dialog.style.height,
      zIndex: dialog.style.zIndex,
      buttons: [...dialog.querySelectorAll("button")].map((button) => button.textContent),
      active: document.activeElement?.textContent,
      showCalls: overlayProbe.show,
      listeners: overlayProbe.fullscreenListeners.size,
    };
  }, fullscreenOverlay);
  assert.deepEqual(modal, {
    tag: "DIALOG", open: true, role: "dialog", modal: "true", position: "fixed", inset: "0px",
    width: "100vw", height: "100vh", zIndex: "2147483647", buttons: ["进入全屏", "退出全屏"],
    active: "进入全屏", showCalls: 1, listeners: 2,
  });
  await page.locator(fullscreenOverlay).click({ position: { x: 4, y: 4 } });
  assert.equal(await page.locator(`${fullscreenOverlay}[open]`).count(), 0);

  await page.locator("#surface").focus();
  await openFullscreenOverlay(page);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(`${fullscreenOverlay}[open]`).count(), 0);

  await page.locator("#surface").focus();
  await openFullscreenOverlay(page);
  await page.evaluate(() => document.querySelector("game-controls-input").remove());
  const cleanup = await page.evaluate((selector) => ({
    dialogs: document.querySelectorAll(selector).length,
    listeners: overlayProbe.fullscreenListeners.size,
  }), fullscreenOverlay);
  assert.deepEqual(cleanup, { dialogs: 0, listeners: 0 });
  await page.waitForTimeout(850);
  assert.equal(await page.locator(fullscreenOverlay).count(), 0);
});

test("real button click handlers call fullscreen APIs synchronously and reorder the top layer", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div></body>");
  await page.evaluate(() => {
    globalThis.dialogOrder = [];
    const showModal = HTMLDialogElement.prototype.showModal;
    const close = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.showModal = function () {
      dialogOrder.push("show");
      return showModal.call(this);
    };
    HTMLDialogElement.prototype.close = function () {
      dialogOrder.push("close");
      return close.call(this);
    };
  });
  await installFullscreenMock(page);
  await mount(page);
  await page.locator("#surface").focus();
  await openFullscreenOverlay(page);
  await page.getByRole("button", { name: "进入全屏" }).click();
  let state = await page.evaluate((selector) => {
    const dialog = document.querySelector(selector);
    return {
      open: dialog.open,
      order: [...dialogOrder],
      calls: fullscreenMock.enterCalls,
      insideClick: fullscreenMock.enterInsideClick,
      enterDisabled: dialog.querySelector("button:nth-of-type(1)").disabled,
      exitDisabled: dialog.querySelector("button:nth-of-type(2)").disabled,
      active: document.activeElement?.textContent,
      status: dialog.querySelector('[role="status"]').textContent,
    };
  }, fullscreenOverlay);
  assert.deepEqual(state, {
    open: true, order: ["show", "close", "show"], calls: 1, insideClick: [true],
    enterDisabled: true, exitDisabled: false, active: "退出全屏", status: "当前处于全屏状态。",
  });

  await page.getByRole("button", { name: "退出全屏" }).click();
  state = await page.evaluate((selector) => {
    const dialog = document.querySelector(selector);
    return {
      open: dialog.open,
      order: [...dialogOrder],
      calls: fullscreenMock.exitCalls,
      insideClick: fullscreenMock.exitInsideClick,
      enterDisabled: dialog.querySelector("button:nth-of-type(1)").disabled,
      exitDisabled: dialog.querySelector("button:nth-of-type(2)").disabled,
      active: document.activeElement?.textContent,
      status: dialog.querySelector('[role="status"]').textContent,
    };
  }, fullscreenOverlay);
  assert.deepEqual(state, {
    open: true, order: ["show", "close", "show", "close", "show"], calls: 1, insideClick: [true],
    enterDisabled: false, exitDisabled: true, active: "进入全屏", status: "当前未处于全屏状态。",
  });
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => dialogOrder), ["show", "close", "show", "close", "show"]);

  const beforeKeyboardActivation = await page.evaluate(() => deviceEvents.length);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  const keyboardActivation = await page.evaluate((from) => ({
    enterCalls: fullscreenMock.enterCalls,
    exitCalls: fullscreenMock.exitCalls,
    enterInsideClick: fullscreenMock.enterInsideClick,
    exitInsideClick: fullscreenMock.exitInsideClick,
    controlEvents: deviceEvents.slice(from).filter((event) => event.options.channel === "controls.event").length,
  }), beforeKeyboardActivation);
  assert.deepEqual(keyboardActivation, {
    enterCalls: 2,
    exitCalls: 2,
    enterInsideClick: [true, true],
    exitInsideClick: [true, true],
    controlEvents: 0,
  });
});

test("browser fullscreen exit, fullscreenerror, unsupported API, and rejected promises keep UI truthful", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div></body>");
  await installFullscreenMock(page, "reject-enter");
  await mount(page);
  await page.locator("#surface").focus();
  await openFullscreenOverlay(page);
  await page.getByRole("button", { name: "进入全屏" }).click();
  await page.waitForFunction((selector) => document.querySelector(selector)?.textContent.includes("enter denied"), fullscreenOverlay);
  assert.match(await page.locator(`${fullscreenOverlay} [role="status"]`).textContent(), /进入全屏失败.*enter denied/);
  assert.equal(await page.locator(`${fullscreenOverlay}[open]`).count(), 1);

  await page.evaluate(() => { fullscreenMock.mode = "success"; });
  await page.getByRole("button", { name: "进入全屏" }).click();
  await page.evaluate(() => {
    fullscreenMock.element = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  assert.equal(await page.getByRole("button", { name: "进入全屏" }).isEnabled(), true);
  assert.equal(await page.getByRole("button", { name: "退出全屏" }).isDisabled(), true);
  assert.equal(await page.locator(`${fullscreenOverlay}[open]`).count(), 1);
  await page.evaluate(() => document.dispatchEvent(new Event("fullscreenerror")));
  assert.equal(await page.locator(`${fullscreenOverlay} [role="status"]`).textContent(), "浏览器未能完成全屏操作。");

  await page.evaluate(() => { fullscreenMock.mode = "success"; });
  await page.getByRole("button", { name: "进入全屏" }).click();
  await page.evaluate(() => { fullscreenMock.mode = "reject-exit"; });
  await page.getByRole("button", { name: "退出全屏" }).click();
  await page.waitForFunction((selector) => document.querySelector(selector)?.textContent.includes("exit denied"), fullscreenOverlay);
  assert.match(await page.locator(`${fullscreenOverlay} [role="status"]`).textContent(), /退出全屏失败.*exit denied/);
  assert.equal(await page.locator(`${fullscreenOverlay}[open]`).count(), 1);

  const unsupported = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div></body>");
  await installFullscreenMock(unsupported, "unsupported");
  await mount(unsupported);
  await unsupported.locator("#surface").focus();
  await openFullscreenOverlay(unsupported);
  assert.equal(await unsupported.getByRole("button", { name: "进入全屏" }).isDisabled(), true);
  assert.equal(await unsupported.getByRole("button", { name: "退出全屏" }).isDisabled(), true);
  assert.equal(await unsupported.locator(`${fullscreenOverlay} [role="status"]`).textContent(), "此浏览器不支持全屏功能。");
});

test("controls element publishes top-frame keyboard edges and prevents mapped defaults", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div><button id='next'>next</button></body>");
  await mount(page);
  await page.evaluate(() => document.querySelector("#surface").focus());
  const untrusted = await page.evaluate(() => {
    const before = deviceEvents.length;
    const event = new KeyboardEvent("keydown", { code: "KeyZ", bubbles: true, cancelable: true });
    const continued = window.dispatchEvent(event);
    return { continued, added: deviceEvents.length - before, prevented: event.defaultPrevented };
  });
  assert.equal(untrusted.continued, true);
  assert.equal(untrusted.prevented, false);
  assert.equal(untrusted.added, 0);
  await page.keyboard.down("KeyZ");
  await page.keyboard.down("KeyZ");
  await page.keyboard.down("Tab");
  const result = await page.evaluate(() => ({
    active: document.activeElement.id,
    tags: ["game-keyboard-input", "game-pointer-input", "game-gamepad-input", "game-controls-input"].map((tag) => customElements.get(tag) !== undefined),
    events: deviceEvents,
  }));
  assert.deepEqual(result.tags, [true, true, true, true]);
  assert.equal(result.active, "surface");
  const published = controls(result.events);
  assert.deepEqual(published.map((event) => [event.options.channel, event.name, event.data.action, event.data.button, event.data.repeat, event.data.down]), [
    ["controls.state", "input.state", undefined, undefined, undefined, []],
    ["controls.state", "input.state", undefined, undefined, undefined, ["south"]],
    ["controls.event", "input.event", "down", "south", false, undefined],
    ["controls.event", "input.event", "down", "south", true, undefined],
    ["controls.state", "input.state", undefined, undefined, undefined, ["south", "select"]],
    ["controls.event", "input.event", "down", "select", false, undefined],
  ]);
  assert.equal(published.every((event) => event.options.broadcast === "top-frame"), true);
});

test("direct Custom snapshots work with blocked Keyboard focus and retain canonical State-before-Event", async (t) => {
  const page = await openPage(t, "<!doctype html><body><section id='ancestor'><input id='field'></section></body>");
  await mount(page);
  await page.evaluate(() => {
    deviceEvents.length = 0;
    globalThis.ancestorBubbles = 0;
    document.querySelector("#ancestor").addEventListener("loomrealm:debug-input", () => { ancestorBubbles += 1; });
    document.querySelector("#field").focus();
  });
  await sendCustom(page, ["select", "up"]);
  await sendCustom(page, ["up", "select"]);
  await page.evaluate(() => {
    const detail = Object.create(null);
    detail.version = 1;
    detail.down = ["east"];
    document.querySelector("game-controls-input").dispatchEvent(new CustomEvent("loomrealm:debug-input", { detail }));
  });
  const result = await page.evaluate(() => ({ events: deviceEvents, ancestorBubbles }));
  assert.equal(result.ancestorBubbles, 0);
  assert.deepEqual(result.events.map((event) => [event.options.channel, event.data.down, event.data.action, event.data.button, event.data.repeat]), [
    ["controls.state", ["up", "select"], undefined, undefined, undefined],
    ["controls.event", undefined, "down", "up", false],
    ["controls.event", undefined, "down", "select", false],
    ["controls.state", ["east"], undefined, undefined, undefined],
    ["controls.event", undefined, "up", "up", false],
    ["controls.event", undefined, "down", "east", false],
    ["controls.event", undefined, "up", "select", false],
  ]);
  assert.equal(result.events.every((event) => event.options.broadcast === "top-frame"), true);
});

test("Custom event target, flags, duplicate ownership, and closed detail validation fail atomically", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='other'></div></body>");
  await mount(page);
  await page.evaluate(() => {
    const duplicate = document.createElement("game-controls-input");
    duplicate.id = "duplicate";
    duplicate.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ owner: "duplicate", name, data, options }); } });
    document.body.append(duplicate);
    deviceEvents.length = 0;
  });
  await sendCustom(page, ["up"]);
  const accepted = await page.evaluate(() => deviceEvents.length);
  await page.evaluate(() => {
    const eventName = "loomrealm:debug-input";
    const active = document.querySelector("game-controls-input:not([data-input-disabled])");
    const duplicate = document.querySelector("#duplicate");
    const valid = { version: 1, down: ["left"] };
    for (const target of [window, document, document.querySelector("#other"), duplicate]) {
      target.dispatchEvent(new CustomEvent(eventName, { detail: valid }));
    }
    active.dispatchEvent(new Event(eventName));
    for (const flags of [{ bubbles: true }, { composed: true }, { cancelable: true }]) {
      active.dispatchEvent(new CustomEvent(eventName, { detail: valid, ...flags }));
    }
    class Detail { constructor() { this.version = 1; this.down = ["left"]; } }
    const tooMany = Array.from({ length: 15 }, () => "up");
    const invalid = [
      null,
      [],
      { version: 2, down: ["left"] },
      { version: 1, down: ["left"], extra: true },
      { version: 1, down: "left" },
      { version: 1, down: ["unknown"] },
      { version: 1, down: ["left", "left"] },
      { version: 1, down: tooMany },
      new Detail(),
    ];
    const throwing = {};
    Object.defineProperties(throwing, {
      version: { enumerable: true, get() { throw new Error("invalid detail"); } },
      down: { enumerable: true, value: ["left"] },
    });
    invalid.push(throwing);
    for (const detail of invalid) active.dispatchEvent(new CustomEvent(eventName, { detail }));
  });
  assert.equal(await page.evaluate(() => deviceEvents.length), accepted);
  await sendCustom(page, []);
  const released = await page.evaluate((from) => deviceEvents.slice(from), accepted);
  assert.deepEqual(released.map((event) => [event.options.channel, event.data.down, event.data.action, event.data.button]), [
    ["controls.state", [], undefined, undefined],
    ["controls.event", undefined, "up", "up"],
  ]);
  assert.equal(await page.evaluate(() => document.querySelector("#duplicate").getAttribute("data-input-disabled")), "duplicate");
  assert.equal(await page.evaluate(() => deviceEvents.some((event) => event.owner === "duplicate")), false);
});

test("Custom held state clears on blur and hidden reconciliation without up edges or restoration", async (t) => {
  const page = await openPage(t);
  await page.evaluate(() => {
    globalThis.visibleState = "visible";
    globalThis.focused = true;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibleState });
    document.hasFocus = () => focused;
  });
  await mount(page);
  await page.evaluate(() => { deviceEvents.length = 0; });
  await sendCustom(page, ["up"]);
  const beforeBlur = await page.evaluate(() => deviceEvents.length);
  await page.evaluate(() => { focused = false; window.dispatchEvent(new Event("blur")); });
  assert.deepEqual(await page.evaluate((from) => deviceEvents.slice(from).map((event) => [event.options.channel, event.data.down, event.data.action]), beforeBlur), [
    ["controls.state", [], undefined],
  ]);
  await page.evaluate(() => { focused = true; window.dispatchEvent(new Event("focus")); deviceEvents.length = 0; });
  await sendCustom(page, []);
  assert.equal(await page.evaluate(() => deviceEvents.length), 0, "blurred Custom snapshot must not restore");
  await sendCustom(page, ["east"]);
  const beforeHidden = await page.evaluate(() => deviceEvents.length);
  await page.evaluate(() => { visibleState = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
  assert.deepEqual(await page.evaluate((from) => deviceEvents.slice(from).map((event) => [event.options.channel, event.data.down, event.data.action]), beforeHidden), [
    ["controls.state", [], undefined],
  ]);
  const hiddenCount = await page.evaluate(() => deviceEvents.length);
  await sendCustom(page, ["left"]);
  assert.equal(await page.evaluate(() => deviceEvents.length), hiddenCount, "hidden Window must reject and not save Custom state");
});

test("disconnect removes the Custom listener and reclaimed ownership installs a fresh one", async (t) => {
  const page = await openPage(t);
  await mount(page);
  const stoppedAt = await page.evaluate(() => {
    deviceEvents.length = 0;
    const element = document.querySelector("game-controls-input");
    window.detachedControls = element;
    element.remove();
    return deviceEvents.length;
  });
  await page.evaluate(() => {
    detachedControls.dispatchEvent(new CustomEvent("loomrealm:debug-input", { detail: { version: 1, down: ["up"] } }));
  });
  assert.equal(await page.evaluate(() => deviceEvents.length), stoppedAt);
  await page.evaluate(() => {
    const element = document.createElement("game-controls-input");
    element.id = "reclaimed-custom";
    element.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ owner: "reclaimed", name, data, options }); } });
    document.body.append(element);
    deviceEvents.length = 0;
  });
  await sendCustom(page, ["right"], "#reclaimed-custom");
  assert.deepEqual(await page.evaluate(() => deviceEvents.map((event) => [event.owner, event.options.channel, event.data.down, event.data.action])), [
    ["reclaimed", "controls.state", ["right"], undefined],
    ["reclaimed", "controls.event", undefined, "down"],
  ]);
});

test("Custom Select hold reuses the existing overlay lifecycle", async (t) => {
  const page = await openPage(t);
  await installFullscreenMock(page);
  await mount(page);
  await sendCustom(page, ["select"]);
  await page.waitForSelector(`${fullscreenOverlay}[open]`, { timeout: 2_000 });
  await sendCustom(page, []);
  await page.keyboard.press("Escape");
  await sendCustom(page, ["select"]);
  await page.waitForSelector(`${fullscreenOverlay}[open]`, { timeout: 2_000 });
  await sendCustom(page, []);
  assert.equal(await page.locator(fullscreenOverlay).count(), 1);
  assert.deepEqual(await page.evaluate(() => [fullscreenMock.enterCalls, fullscreenMock.exitCalls]), [0, 0]);
});

test("blocked focus targets follow the closed set and open shadow ancestry", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0' role='button'></div></body>");
  await mount(page);
  await page.evaluate(() => {
    const add = (element) => document.body.append(element);
    const input = document.createElement("input");
    input.id = "input";
    const area = document.createElement("textarea");
    area.id = "area";
    const select = document.createElement("select");
    select.id = "select";
    const button = document.createElement("button");
    button.id = "button";
    const link = document.createElement("a");
    link.id = "link";
    link.href = "#x";
    const plain = document.createElement("a");
    plain.id = "plain";
    plain.tabIndex = 0;
    const editable = document.createElement("div");
    editable.id = "editable";
    editable.contentEditable = "true";
    const buttonInner = document.createElement("span");
    buttonInner.id = "button-inner";
    buttonInner.tabIndex = 0;
    button.append(buttonInner);
    add(input); add(area); add(select); add(button); add(link); add(plain); add(editable);
    const host = document.createElement("div");
    host.id = "host";
    const shadow = host.attachShadow({ mode: "open" });
    const inner = document.createElement("span");
    inner.id = "inner";
    inner.tabIndex = 0;
    shadow.append(inner);
    add(host);
    const editableHost = document.createElement("div");
    editableHost.id = "editable-host";
    editableHost.contentEditable = "true";
    const editableShadow = editableHost.attachShadow({ mode: "open" });
    const editableInner = document.createElement("span");
    editableInner.id = "editable-inner";
    editableInner.tabIndex = 0;
    editableShadow.append(editableInner);
    add(editableHost);
    const fieldHost = document.createElement("div");
    fieldHost.id = "field-host";
    const fieldShadow = fieldHost.attachShadow({ mode: "open" });
    const field = document.createElement("input");
    field.id = "shadow-field";
    fieldShadow.append(field);
    add(fieldHost);
    globalThis.focusTarget = (id) => {
      const roots = ["#host", "#editable-host", "#field-host"].map((selector) => document.querySelector(selector)?.shadowRoot);
      const found = document.getElementById(id) ?? roots.reduce((match, root) => match ?? root?.getElementById(id) ?? null, null);
      found.focus();
    };
  });
  const probe = async (id) => {
    await page.evaluate((target) => {
      deviceEvents.length = 0;
      focusTarget(target);
    }, id);
    await page.keyboard.down("KeyX");
    await page.keyboard.up("KeyX");
    return page.evaluate(() => deviceEvents.map((event) => event.options.channel));
  };
  assert.deepEqual(await probe("surface"), ["controls.state", "controls.event", "controls.state", "controls.event"]);
  for (const id of ["input", "area", "select", "button", "link", "editable", "shadow-field", "button-inner", "editable-inner"]) {
    assert.deepEqual(await probe(id), [], id);
  }
  assert.deepEqual(await probe("plain"), ["controls.state", "controls.event", "controls.state", "controls.event"]);
  assert.deepEqual(await probe("inner"), ["controls.state", "controls.event", "controls.state", "controls.event"]);
  const tab = await page.evaluate(() => {
    document.querySelector("#link").focus();
    deviceEvents.length = 0;
    return document.activeElement.id;
  });
  assert.equal(tab, "link");
  await page.keyboard.down("Tab");
  const afterTab = await page.evaluate(() => ({ active: document.activeElement.id, events: deviceEvents.length }));
  assert.notEqual(afterTab.active, "link");
  assert.equal(afterTab.events, 0);
});

test("capture loss clears keyboard without an up, and the next repeat is a new logical down", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div><input id='field'></body>");
  await mount(page);
  await page.locator("#surface").focus();
  await page.keyboard.down("KeyZ");
  await page.locator("#field").focus();
  await page.keyboard.up("KeyZ");
  await page.keyboard.down("KeyZ");
  const duringField = await page.evaluate(() => deviceEvents.map((event) => [event.options.channel, event.data.down, event.data.action, event.data.repeat]));
  assert.deepEqual(duringField, [
    ["controls.state", [], undefined, undefined],
    ["controls.state", ["south"], undefined, undefined],
    ["controls.event", undefined, "down", false],
    ["controls.state", [], undefined, undefined],
  ]);
  await page.locator("#surface").focus();
  await page.keyboard.down("KeyZ");
  const regained = await page.evaluate(() => deviceEvents.slice(-2).map((event) => [event.options.channel, event.data.down, event.data.action, event.data.repeat]));
  assert.deepEqual(regained, [
    ["controls.state", ["south"], undefined, undefined],
    ["controls.event", undefined, "down", false],
  ]);
});

test("gamepad baseline, threshold, OR, disconnect, and keyboard sharing use one controls publication", async (t) => {
  const page = await openPage(t);
  await page.evaluate(() => {
    const pad = (index, mapping, values) => ({
      index, connected: true, mapping, axes: [1, 1, 1, 1],
      buttons: values.map((value) => ({ value })),
    });
    const values = () => Array(17).fill(0);
    globalThis.pads = [
      pad(0, "standard", values()),
      null,
      null,
      pad(3, "", values()),
      pad(4, "standard", values()),
    ];
    globalThis.pads[0].buttons[0].value = 1;
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => globalThis.pads });
  });
  await mount(page);
  await page.waitForFunction(() => deviceEvents.some((event) => event.options.channel === "controls.state"));
  const baseline = await page.evaluate(() => deviceEvents);
  assert.equal(baseline.some((event) => event.name === "input.event"), false);
  assert.deepEqual(baseline.at(-1).data.down, ["south"]);
  await page.evaluate(() => {
    globalThis.pads[0].buttons[0].value = 0.4;
    globalThis.pads[4].buttons[12].value = 0.5;
    globalThis.pads[4].buttons[9].value = 0.5;
  });
  await page.waitForFunction(() => deviceEvents.some((event) => event.name === "input.event" && event.data.action === "up"));
  const crossed = await page.evaluate((from) => deviceEvents.slice(from), baseline.length);
  const state = crossed.find((event) => event.name === "input.state");
  const edges = crossed.filter((event) => event.name === "input.event");
  assert.equal(crossed.indexOf(state), 0);
  assert.deepEqual(state.data.down, ["up", "start"]);
  assert.deepEqual(edges.map((event) => [event.data.action, event.data.button, event.data.repeat]), [
    ["down", "up", false],
    ["up", "south", false],
    ["down", "start", false],
  ]);
  await page.locator("body").focus();
  await page.keyboard.down("KeyZ");
  const beforeDisconnect = await page.evaluate(() => {
    globalThis.disconnectFrom = deviceEvents.length;
    globalThis.pads[4].connected = false;
    return disconnectFrom;
  });
  await page.waitForFunction((from) => deviceEvents.slice(from).some((event) => event.data.action === "up" && event.data.button === "start"), beforeDisconnect);
  const released = await page.evaluate((from) => deviceEvents.slice(from).filter((event) => event.name === "input.event").map((event) => [event.data.action, event.data.button]), beforeDisconnect);
  assert.deepEqual(released, [["up", "up"], ["up", "start"]]);
  const held = await page.evaluate(() => deviceEvents.filter((event) => event.name === "input.state").at(-1).data.down);
  assert.deepEqual(held, ["south"]);
});

test("Pocket Block unmapped AYANEO pad publishes all four canonical D-pad directions", async (t) => {
  const page = await openPage(t);
  await page.evaluate(() => {
    globalThis.pocketPad = {
      index: 2, connected: true, id: "AYANEO Controller (Vendor: 4001 Product: 0428)",
      mapping: "", axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true, value: () => [globalThis.pocketPad],
    });
  });
  await mount(page);
  await page.waitForFunction(() => deviceEvents.some((event) => event.options.channel === "controls.state"));
  assert.deepEqual(
    await page.evaluate(() => deviceEvents.find((event) => event.options.channel === "controls.state").data.down),
    [],
  );

  for (const [index, direction] of [[12, "up"], [13, "down"], [14, "left"], [15, "right"]]) {
    for (const [value, action] of [[1, "down"], [0, "up"]]) {
      const before = await page.evaluate(() => deviceEvents.length);
      await page.evaluate(({ index, value }) => { pocketPad.buttons[index].value = value; }, { index, value });
      await page.waitForFunction(({ before, direction, action }) =>
        deviceEvents.slice(before).some((event) =>
          event.options.channel === "controls.event"
          && event.data.action === action
          && event.data.button === direction
        ), { before, direction, action });
      const batch = await page.evaluate((from) => deviceEvents.slice(from), before);
      const edgeIndex = batch.findIndex((event) =>
        event.options.channel === "controls.event"
        && event.data.action === action
        && event.data.button === direction
      );
      assert.ok(edgeIndex > 0, direction + " " + action + " must follow controls.state");
      const state = batch[edgeIndex - 1];
      assert.equal(state.options.channel, "controls.state");
      assert.equal(state.options.broadcast, "top-frame");
      assert.deepEqual(state.data.down, action === "down" ? [direction] : []);
      assert.equal(batch[edgeIndex].data.repeat, false);
    }
  }

  const beforeFinalPress = await page.evaluate(() => deviceEvents.length);
  await page.evaluate(() => { pocketPad.buttons[12].value = 1; });
  await page.waitForFunction((from) => deviceEvents.slice(from).some((event) =>
    event.options.channel === "controls.event"
    && event.data.action === "down" && event.data.button === "up"
  ), beforeFinalPress);
  const beforeDisconnect = await page.evaluate(() => {
    const from = deviceEvents.length;
    pocketPad.connected = false;
    return from;
  });
  await page.waitForFunction((from) => deviceEvents.slice(from).some((event) =>
    event.options.channel === "controls.event" && event.data.action === "up" && event.data.button === "up"
  ), beforeDisconnect);
  assert.deepEqual(
    await page.evaluate(() => deviceEvents.filter((event) => event.options.channel === "controls.state").at(-1).data.down),
    [],
  );
});

test("window regain with an empty baseline republishes controls.state and no event", async (t) => {
  const page = await openPage(t, "<!doctype html><body></body>");
  await page.evaluate(() => { document.hasFocus = () => false; });
  await mount(page);
  const stillUnusable = await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    return deviceEvents.length;
  });
  assert.equal(stillUnusable, 0);
  await page.evaluate(() => {
    document.hasFocus = () => true;
    window.dispatchEvent(new Event("focus"));
  });
  const regained = await page.evaluate(() => deviceEvents);
  assert.deepEqual(regained.map((event) => [event.name, event.options.channel, event.options.broadcast, event.data.down, event.data.action]), [
    ["input.state", "controls.state", "top-frame", [], undefined],
  ]);
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(() => deviceEvents.length), 1, "empty regain must not start State refresh");
});

test("window blur publishes reconciliation State only, then a gamepad rescan baseline", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div></body>");
  await page.evaluate(() => {
    globalThis.pad = {
      index: 1, connected: true, mapping: "standard", axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0 })),
    };
    pad.buttons[1].value = 1;
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [globalThis.pad] });
  });
  await mount(page);
  await page.locator("#surface").focus();
  await page.keyboard.down("ArrowUp");
  await page.evaluate(() => {
    const before = deviceEvents.length;
    document.hasFocus = () => false;
    window.dispatchEvent(new Event("blur"));
    globalThis.blurEvents = deviceEvents.slice(before);
  });
  const blurred = await page.evaluate(() => blurEvents);
  assert.deepEqual(blurred.map((event) => [event.name, event.data.down, event.data.action]), [
    ["input.state", [], undefined],
  ]);
  await page.evaluate(() => {
    const before = deviceEvents.length;
    document.hasFocus = () => true;
    window.dispatchEvent(new Event("focus"));
    globalThis.focusEvents = deviceEvents.slice(before);
  });
  const restored = await page.evaluate(() => focusEvents);
  assert.equal(restored.some((event) => event.name === "input.event"), false);
  assert.deepEqual(restored.at(-1).data.down, ["east"]);
});

test("refresh, disconnect, duplicate claim, and raw keyboard stay independent", async (t) => {
  const page = await openPage(t);
  await mount(page);
  const duplicate = await page.evaluate(() => {
    const element = document.createElement("game-controls-input");
    element.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ owner: "duplicate", name, data, options }); } });
    document.body.append(element);
    return element.getAttribute("data-input-disabled");
  });
  assert.equal(duplicate, "duplicate");
  await page.keyboard.down("KeyZ");
  await page.waitForTimeout(1100);
  const refreshed = await page.evaluate(() => deviceEvents.filter((event) => event.owner === "controls" && event.name === "input.state" && event.data.down?.includes("south")).length);
  assert.ok(refreshed >= 2);
  await page.keyboard.up("KeyZ");
  const afterEmpty = await page.evaluate(() => deviceEvents.length);
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(() => deviceEvents.length), afterEmpty);
  await page.keyboard.down("KeyX");
  await page.evaluate(() => document.querySelector("game-controls-input").remove());
  const stopped = await page.evaluate(() => deviceEvents.length);
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(() => deviceEvents.length), stopped);
  assert.equal(await page.evaluate(() => deviceEvents.at(-1).name === "input.state" && deviceEvents.at(-1).data.down?.length === 0), false);
  const reclaimed = await page.evaluate(() => {
    const element = document.createElement("game-controls-input");
    element.id = "reclaimed";
    element.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ owner: "reclaimed", name, data, options }); } });
    document.body.append(element);
    return element.hasAttribute("data-input-disabled");
  });
  assert.equal(reclaimed, false);
  await mount(page, "game-keyboard-input", "keyboard");
  await page.keyboard.down("KeyC");
  const both = await page.evaluate(() => deviceEvents.filter((event) => event.name === "input.event" && (event.data.button === "west" || event.data.code === "KeyC")));
  assert.deepEqual(both.map((event) => [event.owner, event.options.broadcast, event.options.channel]).sort(), [
    ["keyboard", true, "keyboard.event"],
    ["reclaimed", "top-frame", "controls.event"],
  ]);
});
