import {
  CONTROLS_BUTTONS_V1, EMPTY_CONTROLS_STATE_V1,
  type ControlsButtonV1, type ControlsEventPayloadV1, type ControlsStatePayloadV1,
} from "./model.js";

export const CONTROLS_KEYBOARD_CODE_V1: Readonly<Record<string, ControlsButtonV1>> = Object.freeze({
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyZ: "south",
  KeyX: "east",
  KeyC: "west",
  KeyV: "north",
  KeyQ: "leftBumper",
  KeyE: "rightBumper",
  ShiftLeft: "leftTrigger",
  ControlLeft: "rightTrigger",
  Enter: "start",
  Tab: "select",
});

const GAMEPAD_INDEX: readonly (ControlsButtonV1 | null)[] = Object.freeze([
  "south", "east", "west", "north",
  "leftBumper", "rightBumper", "leftTrigger", "rightTrigger",
  "select", "start",
  null, null,
  "up", "down", "left", "right",
  null,
]);

export const CONTROLS_GAMEPAD_PRESS_THRESHOLD = 500_000;

export function controlsButtonFromKeyboardCode(code: string): ControlsButtonV1 | null {
  return CONTROLS_KEYBOARD_CODE_V1[code] ?? null;
}

export function controlsButtonFromGamepadIndex(index: number): ControlsButtonV1 | null {
  return GAMEPAD_INDEX[index] ?? null;
}

export function gamepadControlPressed(raw: number): boolean {
  const normalized = Math.round(Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0)) * 1_000_000);
  return normalized >= CONTROLS_GAMEPAD_PRESS_THRESHOLD;
}

export interface ControlsPadSample {
  readonly index: number;
  readonly pressed: readonly ControlsButtonV1[];
}

export interface ControlsPublication {
  readonly state: ControlsStatePayloadV1 | null;
  readonly events: readonly ControlsEventPayloadV1[];
}

export interface ControlsMachine {
  readonly windowUsable: boolean;
  readonly keyboardCapture: boolean;
  keydown(button: ControlsButtonV1, domRepeat: boolean): ControlsPublication;
  keyup(button: ControlsButtonV1): ControlsPublication;
  applyGamepadFrame(samples: readonly ControlsPadSample[]): ControlsPublication;
  applyCustomState(pressed: readonly ControlsButtonV1[]): ControlsPublication;
  setWindowUsable(usable: boolean, baseline?: readonly ControlsPadSample[]): ControlsPublication;
  setKeyboardCapture(available: boolean): ControlsPublication;
}

const NONE: ControlsPublication = Object.freeze({ state: null, events: Object.freeze([]) });

function edge(action: "down" | "up", button: ControlsButtonV1, repeat: boolean): ControlsEventPayloadV1 {
  return Object.freeze({ action, button, repeat });
}

function statePayload(down: readonly ControlsButtonV1[]): ControlsStatePayloadV1 {
  if (down.length === 0) return EMPTY_CONTROLS_STATE_V1;
  return Object.freeze({ down: Object.freeze([...down]) });
}

function publish(state: ControlsStatePayloadV1 | null, events: readonly ControlsEventPayloadV1[]): ControlsPublication {
  if (state === null && events.length === 0) return NONE;
  return Object.freeze({ state, events: Object.freeze([...events]) });
}

function sameDown(left: readonly ControlsButtonV1[], right: readonly ControlsButtonV1[]): boolean {
  return left.length === right.length && left.every((button, index) => button === right[index]);
}

function pressedSet(pressed: readonly ControlsButtonV1[]): Set<ControlsButtonV1> {
  const result = new Set<ControlsButtonV1>();
  for (const button of CONTROLS_BUTTONS_V1) if (pressed.includes(button)) result.add(button);
  return result;
}

export function createControlsMachine(): ControlsMachine {
  let windowUsable = false;
  let keyboardCapture = false;
  const keyboard = new Set<ControlsButtonV1>();
  let pads = new Map<number, Set<ControlsButtonV1>>();
  let custom = new Set<ControlsButtonV1>();

  const gamepadDown = (button: ControlsButtonV1) => {
    for (const pressed of pads.values()) if (pressed.has(button)) return true;
    return false;
  };
  const otherSourceDown = (button: ControlsButtonV1) => gamepadDown(button) || custom.has(button);
  const effectiveDown = () => CONTROLS_BUTTONS_V1.filter((button) => keyboard.has(button) || otherSourceDown(button));
  const changedState = (prev: readonly ControlsButtonV1[]) => {
    const next = effectiveDown();
    return sameDown(prev, next) ? null : statePayload(next);
  };

  return Object.freeze({
    get windowUsable() { return windowUsable; },
    get keyboardCapture() { return keyboardCapture; },
    keydown(button: ControlsButtonV1, domRepeat: boolean): ControlsPublication {
      if (!keyboardCapture || !CONTROLS_BUTTONS_V1.includes(button)) return NONE;
      if (!keyboard.has(button)) {
        const wasEffective = otherSourceDown(button);
        keyboard.add(button);
        if (wasEffective) return NONE;
        return publish(statePayload(effectiveDown()), [edge("down", button, false)]);
      }
      if (domRepeat === true && !otherSourceDown(button)) return publish(null, [edge("down", button, true)]);
      return NONE;
    },
    keyup(button: ControlsButtonV1): ControlsPublication {
      if (!keyboardCapture || !keyboard.delete(button)) return NONE;
      if (otherSourceDown(button)) return NONE;
      return publish(statePayload(effectiveDown()), [edge("up", button, false)]);
    },
    applyGamepadFrame(samples: readonly ControlsPadSample[]): ControlsPublication {
      if (!windowUsable) return NONE;
      const prev = effectiveDown();
      const incoming = new Map<number, Set<ControlsButtonV1>>();
      for (const sample of samples) {
        if (!Number.isInteger(sample.index) || sample.index < 0) continue;
        incoming.set(sample.index, pressedSet(sample.pressed));
      }
      const physicalPress = new Set<ControlsButtonV1>();
      const physicalRelease = new Set<ControlsButtonV1>();
      const nextPads = new Map<number, Set<ControlsButtonV1>>();
      for (const [index, pressed] of incoming) {
        const existing = pads.get(index);
        nextPads.set(index, pressed);
        if (existing === undefined) continue;
        for (const button of CONTROLS_BUTTONS_V1) {
          const before = existing.has(button);
          const after = pressed.has(button);
          if (!before && after) physicalPress.add(button);
          else if (before && !after) physicalRelease.add(button);
        }
      }
      for (const [index, pressed] of pads) {
        if (incoming.has(index)) continue;
        for (const button of pressed) physicalRelease.add(button);
      }
      pads = nextPads;
      const next = effectiveDown();
      const events: ControlsEventPayloadV1[] = [];
      for (const button of CONTROLS_BUTTONS_V1) {
        const was = prev.includes(button);
        const now = next.includes(button);
        if (!was && now && physicalPress.has(button)) events.push(edge("down", button, false));
        else if (was && !now && physicalRelease.has(button)) events.push(edge("up", button, false));
      }
      return publish(sameDown(prev, next) ? null : statePayload(next), events);
    },
    applyCustomState(pressed: readonly ControlsButtonV1[]): ControlsPublication {
      if (!windowUsable) return NONE;
      const prev = effectiveDown();
      custom = pressedSet(pressed);
      const next = effectiveDown();
      if (sameDown(prev, next)) return NONE;
      const events: ControlsEventPayloadV1[] = [];
      for (const button of CONTROLS_BUTTONS_V1) {
        const was = prev.includes(button);
        const now = next.includes(button);
        if (!was && now) events.push(edge("down", button, false));
        else if (was && !now) events.push(edge("up", button, false));
      }
      return publish(statePayload(next), events);
    },
    setWindowUsable(usable: boolean, baseline: readonly ControlsPadSample[] = []): ControlsPublication {
      if (usable === windowUsable) return NONE;
      windowUsable = usable;
      keyboardCapture = false;
      keyboard.clear();
      pads = new Map();
      custom = new Set();
      if (usable) {
        for (const sample of baseline) {
          if (!Number.isInteger(sample.index) || sample.index < 0) continue;
          pads.set(sample.index, pressedSet(sample.pressed));
        }
      }
      // mustPublishState: a Window transition publishes the current snapshot even when down is unchanged.
      return publish(statePayload(effectiveDown()), []);
    },
    setKeyboardCapture(available: boolean): ControlsPublication {
      const next = windowUsable && available;
      if (next === keyboardCapture) return NONE;
      keyboardCapture = next;
      if (next || keyboard.size === 0) return NONE;
      const prev = effectiveDown();
      keyboard.clear();
      return publish(changedState(prev), []);
    },
  });
}
