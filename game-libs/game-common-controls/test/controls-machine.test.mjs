import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTROLS_BUTTONS_V1, CONTROLS_INPUT_CHANNELS, CONTROLS_STATE_REFRESH_MS, CONTROLS_STATE_STALE_MS,
  DEVICE_INPUT_CHANNELS, EMPTY_CONTROLS_STATE_V1, createFreshControlsStateTracker, createFreshDeviceStateTracker,
} from "../dist/index.js";
import {
  CONTROLS_KEYBOARD_CODE_V1, controlsButtonFromGamepadIndex, controlsButtonFromKeyboardCode,
  createControlsMachine, gamepadControlPressed,
} from "../dist/controls-machine.js";

const KEYBOARD = [
  ["ArrowUp", "up"], ["ArrowDown", "down"], ["ArrowLeft", "left"], ["ArrowRight", "right"],
  ["KeyZ", "south"], ["KeyX", "east"], ["KeyC", "west"], ["KeyV", "north"],
  ["KeyQ", "leftBumper"], ["KeyE", "rightBumper"], ["ShiftLeft", "leftTrigger"], ["ControlLeft", "rightTrigger"],
  ["Enter", "start"], ["Tab", "select"],
];
const GAMEPAD = [
  [0, "south"], [1, "east"], [2, "west"], [3, "north"],
  [4, "leftBumper"], [5, "rightBumper"], [6, "leftTrigger"], [7, "rightTrigger"],
  [8, "select"], [9, "start"], [12, "up"], [13, "down"], [14, "left"], [15, "right"],
];

function ready() {
  const machine = createControlsMachine();
  machine.setWindowUsable(true);
  machine.setKeyboardCapture(true);
  return machine;
}

function names(publication) {
  return {
    state: publication.state?.down ?? null,
    events: publication.events.map((event) => [event.action, event.button, event.repeat]),
  };
}

test("public controls ABI stays beside the unchanged six raw channels", () => {
  assert.deepEqual([...DEVICE_INPUT_CHANNELS], [
    "keyboard.state", "keyboard.event", "pointer.state", "pointer.event", "gamepad.state", "gamepad.event",
  ]);
  assert.equal(DEVICE_INPUT_CHANNELS.includes("controls.state"), false);
  assert.deepEqual([...CONTROLS_INPUT_CHANNELS], ["controls.state", "controls.event"]);
  assert.deepEqual([...CONTROLS_BUTTONS_V1], [
    "up", "down", "left", "right", "south", "east", "west", "north",
    "leftBumper", "rightBumper", "leftTrigger", "rightTrigger", "start", "select",
  ]);
  assert.equal(CONTROLS_STATE_REFRESH_MS, 1000);
  assert.equal(CONTROLS_STATE_STALE_MS, 2500);
  assert.deepEqual(EMPTY_CONTROLS_STATE_V1, { down: [] });
  assert.equal(Object.isFrozen(EMPTY_CONTROLS_STATE_V1), true);
  assert.equal(Object.isFrozen(EMPTY_CONTROLS_STATE_V1.down), true);
  assert.equal(typeof createFreshDeviceStateTracker, "function");
  assert.equal(typeof createFreshControlsStateTracker, "function");
});

test("controls fresh tracker falls back to the frozen empty State and close fences it", async () => {
  const seen = [];
  const tracker = createFreshControlsStateTracker((payload) => seen.push(payload), { staleAfterMs: 20 });
  tracker.accept({ down: ["south"] });
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(seen[1], EMPTY_CONTROLS_STATE_V1);
  tracker.accept({ down: ["up"] });
  tracker.close();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(seen.map((payload) => payload.down), [["south"], [], ["up"]]);
});

test("keyboard and gamepad maps cover exactly the 14 unified buttons", () => {
  assert.deepEqual(KEYBOARD.map(([code]) => controlsButtonFromKeyboardCode(code)), KEYBOARD.map(([, button]) => button));
  assert.deepEqual(KEYBOARD.map(([, button]) => button), [...CONTROLS_BUTTONS_V1]);
  assert.equal(controlsButtonFromKeyboardCode("KeyA"), null);
  assert.equal(controlsButtonFromKeyboardCode("ShiftRight"), null);
  assert.deepEqual(GAMEPAD.map(([, button]) => button), [
    "south", "east", "west", "north", "leftBumper", "rightBumper", "leftTrigger", "rightTrigger",
    "select", "start", "up", "down", "left", "right",
  ]);
  for (const [index, button] of GAMEPAD) assert.equal(controlsButtonFromGamepadIndex(index), button);
  for (const index of [10, 11, 16, 17]) assert.equal(controlsButtonFromGamepadIndex(index), null);
  assert.equal(gamepadControlPressed(0.5), true);
  assert.equal(gamepadControlPressed(0.4), false);
  assert.equal(Object.keys(CONTROLS_KEYBOARD_CODE_V1).length, 14);
});

test("keyboard and gamepad OR emits one effective edge and keeps canonical State order", () => {
  const machine = ready();
  assert.deepEqual(names(machine.keydown("south", false)), { state: ["south"], events: [["down", "south", false]] });
  assert.deepEqual(names(machine.keydown("up", false)), { state: ["up", "south"], events: [["down", "up", false]] });
  assert.deepEqual(names(machine.applyGamepadFrame([{ index: 0, pressed: ["south", "select"] }])), {
    state: ["up", "south", "select"],
    events: [],
  });
  assert.deepEqual(names(machine.keyup("south")), { state: null, events: [] });
  assert.deepEqual(names(machine.applyGamepadFrame([{ index: 0, pressed: ["select"] }])), {
    state: ["up", "select"],
    events: [["up", "south", false]],
  });
  assert.deepEqual(names(machine.applyGamepadFrame([])), {
    state: ["up"],
    events: [["up", "select", false]],
  });
});

test("tracked gamepad crossings, baseline pads, and same-frame edges share one State", () => {
  const machine = ready();
  assert.deepEqual(names(machine.applyGamepadFrame([{ index: 1, pressed: ["down", "north"] }])), {
    state: ["down", "north"],
    events: [],
  });
  assert.deepEqual(names(machine.applyGamepadFrame([
    { index: 1, pressed: [] },
    { index: 2, pressed: ["up", "north"] },
  ])), {
    state: ["up", "north"],
    events: [["up", "down", false]],
  });
  assert.deepEqual(names(machine.applyGamepadFrame([
    { index: 1, pressed: ["south", "select"] },
    { index: 2, pressed: ["north"] },
  ])), {
    state: ["south", "north", "select"],
    events: [["up", "up", false], ["down", "south", false], ["down", "select", false]],
  });
});

test("multiple gamepads OR and a disconnect releases only the last effective hold", () => {
  const machine = ready();
  machine.applyGamepadFrame([{ index: 0, pressed: ["left"] }]);
  assert.deepEqual(names(machine.applyGamepadFrame([
    { index: 0, pressed: ["left"] },
    { index: 1, pressed: ["left", "start"] },
  ])), { state: ["left", "start"], events: [] });
  assert.deepEqual(names(machine.applyGamepadFrame([{ index: 1, pressed: ["left", "start"] }])), {
    state: null,
    events: [],
  });
  assert.deepEqual(names(machine.applyGamepadFrame([])), {
    state: [],
    events: [["up", "left", false], ["up", "start", false]],
  });
});

test("window regain republishes the current State when effective stays empty", () => {
  const machine = createControlsMachine();
  assert.deepEqual(names(machine.setWindowUsable(false)), { state: null, events: [] });
  assert.deepEqual(names(machine.setWindowUsable(true, [])), { state: [], events: [] });
  assert.deepEqual(names(machine.setWindowUsable(false)), { state: [], events: [] });
  assert.deepEqual(names(machine.setWindowUsable(true, [{ index: 0, pressed: ["south"] }])), {
    state: ["south"],
    events: [],
  });
});

test("window and capture reconciliation never synthesize edges", () => {
  const machine = ready();
  machine.keydown("south", false);
  machine.applyGamepadFrame([{ index: 4, pressed: ["up"] }]);
  assert.deepEqual(names(machine.setKeyboardCapture(false)), { state: ["up"], events: [] });
  assert.deepEqual(names(machine.keyup("south")), { state: null, events: [] });
  assert.deepEqual(names(machine.keydown("south", true)), { state: null, events: [] });
  assert.deepEqual(names(machine.setKeyboardCapture(true)), { state: null, events: [] });
  assert.deepEqual(names(machine.keydown("south", true)), { state: ["up", "south"], events: [["down", "south", false]] });
  assert.deepEqual(names(machine.setWindowUsable(false)), { state: [], events: [] });
  assert.deepEqual(names(machine.setWindowUsable(true, [{ index: 4, pressed: ["up"] }])), { state: ["up"], events: [] });
  assert.deepEqual(names(machine.setWindowUsable(true, [{ index: 9, pressed: ["start"] }])), { state: null, events: [] });
});

test("held keyboard repeat is event-only and is suppressed while the gamepad holds the button", () => {
  const machine = ready();
  machine.keydown("east", false);
  assert.deepEqual(names(machine.keydown("east", false)), { state: null, events: [] });
  assert.deepEqual(names(machine.keydown("east", true)), { state: null, events: [["down", "east", true]] });
  machine.applyGamepadFrame([{ index: 0, pressed: ["east"] }]);
  assert.deepEqual(names(machine.keydown("east", true)), { state: null, events: [] });
  assert.deepEqual(names(machine.keyup("east")), { state: null, events: [] });
  assert.deepEqual(names(machine.applyGamepadFrame([{ index: 0, pressed: [] }])), {
    state: [],
    events: [["up", "east", false]],
  });
});

test("custom snapshots press, release, deduplicate, and publish canonical multi-button edges", () => {
  const machine = ready();
  assert.deepEqual(names(machine.applyCustomState(["south", "up"])), {
    state: ["up", "south"],
    events: [["down", "up", false], ["down", "south", false]],
  });
  assert.deepEqual(names(machine.applyCustomState(["up", "south"])), { state: null, events: [] });
  assert.deepEqual(names(machine.applyCustomState(["east", "left"])), {
    state: ["left", "east"],
    events: [
      ["up", "up", false], ["down", "left", false],
      ["up", "south", false], ["down", "east", false],
    ],
  });
  assert.deepEqual(names(machine.applyCustomState([])), {
    state: [],
    events: [["up", "left", false], ["up", "east", false]],
  });
});

test("keyboard and Custom OR suppresses repeat until Custom releases", () => {
  const machine = ready();
  assert.deepEqual(names(machine.keydown("south", false)), { state: ["south"], events: [["down", "south", false]] });
  assert.deepEqual(names(machine.applyCustomState(["south"])), { state: null, events: [] });
  assert.deepEqual(names(machine.keydown("south", true)), { state: null, events: [] });
  assert.deepEqual(names(machine.applyCustomState([])), { state: null, events: [] });
  assert.deepEqual(names(machine.keydown("south", true)), { state: null, events: [["down", "south", true]] });
  assert.deepEqual(names(machine.keyup("south")), { state: [], events: [["up", "south", false]] });

  assert.deepEqual(names(machine.applyCustomState(["south"])), { state: ["south"], events: [["down", "south", false]] });
  assert.deepEqual(names(machine.keydown("south", false)), { state: null, events: [] });
  assert.deepEqual(names(machine.keyup("south")), { state: null, events: [] });
  assert.deepEqual(names(machine.applyCustomState([])), { state: [], events: [["up", "south", false]] });
});

test("gamepad and Custom OR while different sources merge different buttons", () => {
  const machine = ready();
  assert.deepEqual(names(machine.applyGamepadFrame([{ index: 3, pressed: ["up"] }])), { state: ["up"], events: [] });
  assert.deepEqual(names(machine.applyCustomState(["up", "east"])), {
    state: ["up", "east"], events: [["down", "east", false]],
  });
  assert.deepEqual(names(machine.applyGamepadFrame([{ index: 3, pressed: [] }])), { state: null, events: [] });
  assert.deepEqual(names(machine.applyCustomState(["up"])), {
    state: ["up"], events: [["up", "east", false]],
  });
  assert.deepEqual(names(machine.applyCustomState([])), { state: [], events: [["up", "up", false]] });
});

test("Custom survives keyboard capture loss but clears without edges across Window reconciliation", () => {
  const machine = ready();
  machine.keydown("south", false);
  machine.applyCustomState(["up"]);
  assert.deepEqual(names(machine.setKeyboardCapture(false)), { state: ["up"], events: [] });
  assert.deepEqual(names(machine.applyCustomState(["up", "east"])), {
    state: ["up", "east"], events: [["down", "east", false]],
  });
  assert.deepEqual(names(machine.setWindowUsable(false)), { state: [], events: [] });
  assert.deepEqual(names(machine.applyCustomState(["left"])), { state: null, events: [] });
  assert.deepEqual(names(machine.setWindowUsable(true)), { state: [], events: [] });
  assert.deepEqual(names(machine.setKeyboardCapture(true)), { state: null, events: [] });
  assert.deepEqual(names(machine.keydown("left", false)), { state: ["left"], events: [["down", "left", false]] });
});

test("Custom-empty keeps the established Keyboard and Gamepad publication sequence unchanged", () => {
  const machine = ready();
  const actual = [
    machine.keydown("east", false),
    machine.keydown("east", true),
    machine.applyGamepadFrame([{ index: 1, pressed: ["east", "start"] }]),
    machine.keydown("east", true),
    machine.keyup("east"),
    machine.applyGamepadFrame([]),
    machine.setWindowUsable(false),
    machine.setWindowUsable(true, [{ index: 1, pressed: ["up"] }]),
    machine.setKeyboardCapture(true),
    machine.keydown("south", false),
    machine.setKeyboardCapture(false),
  ].map(names);
  assert.deepEqual(actual, [
    { state: ["east"], events: [["down", "east", false]] },
    { state: null, events: [["down", "east", true]] },
    { state: ["east", "start"], events: [] },
    { state: null, events: [] },
    { state: null, events: [] },
    { state: [], events: [["up", "east", false], ["up", "start", false]] },
    { state: [], events: [] },
    { state: ["up"], events: [] },
    { state: null, events: [] },
    { state: ["up", "south"], events: [["down", "south", false]] },
    { state: ["up"], events: [] },
  ]);
});
