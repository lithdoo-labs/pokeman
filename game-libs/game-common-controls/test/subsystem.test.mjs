import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as rootApi from "../dist/index.js";
import {
  createControlsConsumer,
  createDirectionalControlsTracker,
} from "../dist/subsystem.js";

function fixture() {
  const controller = new AbortController();
  const listeners = [];
  const presentationEvents = {
    createListener({ frame, channels }) {
      const handlers = new Map();
      const record = {
        frame,
        channels: [...channels],
        closed: false,
        handlers,
        emit(channel, name, data) {
          if (!record.closed) handlers.get(channel)?.({ channel, name, data, source: { subsystemKey: "base", domainId: "input", targetKey: "controls" } });
        },
      };
      listeners.push(record);
      return {
        on(channel, handler) {
          assert.ok(channels.includes(channel));
          handlers.set(channel, handler);
          return () => handlers.delete(channel);
        },
        setChannels() { throw new Error("unused"); },
        close() { record.closed = true; handlers.clear(); },
      };
    },
  };
  const frame = { id: "map", params: {}, signal: controller.signal, async call() { throw new Error("unused"); } };
  return { controller, frame, listeners, presentationEvents };
}

const turn = () => new Promise((resolve) => setImmediate(resolve));

function structuralSignal(controller) {
  return {
    get aborted() { return controller.signal.aborted; },
    addEventListener: controller.signal.addEventListener.bind(controller.signal),
    removeEventListener: controller.signal.removeEventListener.bind(controller.signal),
  };
}

test("package root ABI stays exact and subsystem is a separate exact public surface", async () => {
  assert.deepEqual(Object.keys(rootApi), [
    "CONTROLS_BUTTONS_V1",
    "CONTROLS_INPUT_CHANNELS",
    "CONTROLS_STATE_REFRESH_MS",
    "CONTROLS_STATE_STALE_MS",
    "DEVICE_INPUT_CHANNELS",
    "DEVICE_STATE_REFRESH_MS",
    "DEVICE_STATE_STALE_MS",
    "EMPTY_CONTROLS_STATE_V1",
    "KEYBOARD_CODES_V1",
    "createFreshControlsStateTracker",
    "createFreshDeviceStateTracker",
    "emptyDeviceState",
    "isNonEmptyDeviceState",
  ]);
  const subsystemApi = await import("@loomrealm-game/common-controls/subsystem");
  assert.deepEqual(Object.keys(subsystemApi), ["createControlsConsumer", "createDirectionalControlsTracker"]);
  const metadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(metadata.exports["./subsystem"], {
    types: "./dist/subsystem.d.ts",
    import: "./dist/subsystem.js",
  });
  assert.equal(metadata.dependencies["@loomrealm/subsystem"], "0.1.0-alpha.0");
  assert.equal(metadata.dependencies["@loomrealm-game/map"], undefined);
  assert.equal(metadata.dependencies["@loomrealm-game/rpg-dialogue"], undefined);
});

test("consumer subscribes only requested channels and delivers an activation-local neutral baseline", () => {
  const stateOnly = fixture();
  const states = [];
  const first = createControlsConsumer(stateOnly.presentationEvents, stateOnly.frame, { onState: (state) => states.push(state) });
  assert.deepEqual(stateOnly.listeners[0].channels, ["controls.state"]);
  assert.equal(states[0], rootApi.EMPTY_CONTROLS_STATE_V1);
  first.close();

  const eventOnly = fixture();
  createControlsConsumer(eventOnly.presentationEvents, eventOnly.frame, { onEvent() {} });
  assert.deepEqual(eventOnly.listeners[0].channels, ["controls.event"]);

  const both = fixture();
  createControlsConsumer(both.presentationEvents, both.frame, { onState() {}, onEvent() {} });
  assert.deepEqual(both.listeners[0].channels, ["controls.state", "controls.event"]);
});

test("consumer accepts structural AbortSignal capability and rejects incomplete Frame signals", () => {
  const target = fixture();
  target.frame.signal = structuralSignal(target.controller);
  assert.equal(target.frame.signal instanceof AbortSignal, false);
  const consumer = createControlsConsumer(target.presentationEvents, target.frame, { onState() {} });
  target.controller.abort();
  assert.equal(target.listeners[0].closed, true);
  consumer.close();

  for (const signal of [null, {}, { aborted: false }, { aborted: false, addEventListener() {} }]) {
    const malformed = fixture();
    malformed.frame.signal = signal;
    assert.throws(
      () => createControlsConsumer(malformed.presentationEvents, malformed.frame, {}),
      TypeError,
    );
  }
});

test("consumer validates canonical State/Event payloads and fails malformed delivery closed", () => {
  const target = fixture();
  const states = [];
  const events = [];
  createControlsConsumer(target.presentationEvents, target.frame, {
    onState: (state) => states.push(state),
    onEvent: (event) => events.push(event),
  });
  const listener = target.listeners[0];
  listener.emit("controls.state", "wrong", { down: ["up"] });
  listener.emit("controls.state", "input.state", { down: ["right", "up"] });
  listener.emit("controls.state", "input.state", { down: ["up", "up"] });
  listener.emit("controls.state", "input.state", { down: ["unknown"] });
  listener.emit("controls.state", "input.state", { down: ["up"], extra: true });
  listener.emit("controls.event", "wrong", { action: "down", button: "south", repeat: false });
  listener.emit("controls.event", "input.event", { action: "up", button: "south", repeat: true });
  listener.emit("controls.event", "input.event", { action: "down", button: "unknown", repeat: false });
  listener.emit("controls.event", "input.event", { action: "down", button: "south", repeat: false, extra: true });
  assert.deepEqual(states.map((state) => state.down), [[]]);
  assert.deepEqual(events, []);

  listener.emit("controls.state", "input.state", { down: ["up", "south"] });
  listener.emit("controls.event", "input.event", { action: "down", button: "south", repeat: false });
  assert.deepEqual(states.map((state) => state.down), [[], ["up", "south"]]);
  assert.deepEqual(events, [{ action: "down", button: "south", repeat: false }]);
});

test("consumer freshness uses the canonical stale timeout and Event is never replayed", async () => {
  const target = fixture();
  const states = [];
  const events = [];
  const consumer = createControlsConsumer(target.presentationEvents, target.frame, {
    onState: (state) => states.push([...state.down]),
    onEvent: (event) => events.push(event.button),
  });
  target.listeners[0].emit("controls.state", "input.state", { down: ["left"] });
  target.listeners[0].emit("controls.event", "input.event", { action: "down", button: "left", repeat: false });
  await new Promise((resolve) => setTimeout(resolve, rootApi.CONTROLS_STATE_STALE_MS + 100));
  assert.deepEqual(states, [[], ["left"], []]);
  assert.deepEqual(events, ["left"]);
  consumer.close();
});

test("callback throws, rejections, and pending Promises stay local without damaging freshness truth", async () => {
  const target = fixture();
  const states = [];
  const events = [];
  let releasePending;
  let stateCalls = 0;
  const consumer = createControlsConsumer(target.presentationEvents, target.frame, {
    onState(state) {
      stateCalls += 1;
      states.push([...state.down]);
      if (stateCalls === 1) throw new Error("initial boom");
      if (stateCalls === 2) return Promise.reject(new Error("state rejection"));
      if (stateCalls === 3) return new Promise((resolve) => { releasePending = resolve; });
    },
    onEvent(event) {
      events.push(event.button);
      if (events.length === 1) throw new Error("event boom");
      if (events.length === 2) return Promise.reject(new Error("event rejection"));
    },
  });
  const listener = target.listeners[0];
  listener.emit("controls.state", "input.state", { down: ["up"] });
  listener.emit("controls.state", "input.state", { down: ["down"] });
  listener.emit("controls.state", "input.state", { down: ["left"] });
  listener.emit("controls.event", "input.event", { action: "down", button: "south", repeat: false });
  listener.emit("controls.event", "input.event", { action: "down", button: "east", repeat: false });
  listener.emit("controls.event", "input.event", { action: "down", button: "west", repeat: false });
  assert.deepEqual(states, [[], ["up"], ["down"], ["left"]], "pending callback must not block a later State delivery");
  assert.deepEqual(events, ["south", "east", "west"]);
  releasePending();
  await turn();
  consumer.close();
});

test("close is idempotent, Frame abort cleans up, and a fresh Activation starts neutral", () => {
  const target = fixture();
  const firstStates = [];
  const first = createControlsConsumer(target.presentationEvents, target.frame, { onState: (state) => firstStates.push([...state.down]) });
  target.listeners[0].emit("controls.state", "input.state", { down: ["right"] });
  first.close();
  first.close();
  target.listeners[0].emit("controls.state", "input.state", { down: ["left"] });
  assert.deepEqual(firstStates, [[], ["right"]]);

  const secondStates = [];
  const second = createControlsConsumer(target.presentationEvents, target.frame, { onState: (state) => secondStates.push([...state.down]) });
  assert.deepEqual(secondStates, [[]]);
  target.controller.abort();
  assert.equal(target.listeners[1].closed, true);
  target.listeners[1].emit("controls.state", "input.state", { down: ["up"] });
  assert.deepEqual(secondStates, [[]]);
  second.close();
});

test("directional tracker uses State truth, Event recency, deterministic fallback, and reset", () => {
  const tracker = createDirectionalControlsTracker();
  assert.equal(tracker.direction, null);
  tracker.acceptState({ down: ["up"] });
  assert.equal(tracker.direction, "up");
  tracker.acceptState({ down: ["up", "left"] });
  assert.equal(tracker.direction, "left", "new State direction appends in canonical order");
  tracker.acceptEvent({ action: "down", button: "up", repeat: false });
  assert.equal(tracker.direction, "up", "last non-repeat directional press wins");
  tracker.acceptEvent({ action: "down", button: "left", repeat: true });
  assert.equal(tracker.direction, "up", "repeat does not change recency");
  tracker.acceptEvent({ action: "down", button: "south", repeat: false });
  assert.equal(tracker.direction, "up", "non-directional events are ignored");
  tracker.acceptEvent({ action: "up", button: "up", repeat: false });
  assert.equal(tracker.direction, "left");
  tracker.acceptState({ down: ["down", "right"] });
  assert.equal(tracker.direction, "right", "State recovers truth after Event loss using canonical fallback");
  tracker.acceptState({ down: [] });
  assert.equal(tracker.direction, null);
  tracker.acceptState({ down: ["up", "down", "left", "right"] });
  assert.equal(tracker.direction, "right");
  tracker.reset();
  assert.equal(tracker.direction, null);
});
