import type {
  DeviceInputChange, GamepadButtonNameV1, GamepadButtonsV1, GamepadSampleV1,
} from "../src/model.js";
import { supportsCanonicalGamepadButtons } from "./gamepad-layout.js";
import { windowUsable, type DeviceInputSource } from "./source-types.js";

const buttonNames: readonly GamepadButtonNameV1[] = Object.freeze([
  "south", "east", "west", "north", "leftBumper", "rightBumper", "leftTrigger", "rightTrigger",
  "select", "start", "leftStick", "rightStick", "dpadUp", "dpadDown", "dpadLeft", "dpadRight", "home",
]);
interface TrackedGamepad { readonly canonicalId: number; sample: GamepadSampleV1; pressed: ReadonlySet<GamepadButtonNameV1>; }
function normalized(value: number, minimum: number, maximum: number): number {
  return Math.round(Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0)) * 1_000_000);
}
function sample(gamepad: Gamepad, canonicalId: number): GamepadSampleV1 {
  const value = (index: number) => normalized(gamepad.buttons[index]?.value ?? 0, 0, 1);
  const buttons: GamepadButtonsV1 = Object.freeze({
    south: value(0), east: value(1), west: value(2), north: value(3), leftBumper: value(4), rightBumper: value(5),
    leftTrigger: value(6), rightTrigger: value(7), select: value(8), start: value(9), leftStick: value(10), rightStick: value(11),
    dpadUp: value(12), dpadDown: value(13), dpadLeft: value(14), dpadRight: value(15), home: value(16),
  });
  return Object.freeze({
    gamepadId: canonicalId,
    axes: Object.freeze({
      leftX: normalized(gamepad.axes[0] ?? 0, -1, 1), leftY: normalized(gamepad.axes[1] ?? 0, -1, 1),
      rightX: normalized(gamepad.axes[2] ?? 0, -1, 1), rightY: normalized(gamepad.axes[3] ?? 0, -1, 1),
    }),
    buttons,
  });
}
function pressedOf(value: GamepadSampleV1): ReadonlySet<GamepadButtonNameV1> {
  return new Set(buttonNames.filter((name) => value.buttons[name] >= 500_000));
}
function same(left: GamepadSampleV1, right: GamepadSampleV1): boolean {
  return buttonNames.every((name) => left.buttons[name] === right.buttons[name]) && left.axes.leftX === right.axes.leftX &&
    left.axes.leftY === right.axes.leftY && left.axes.rightX === right.axes.rightX && left.axes.rightY === right.axes.rightY;
}

export function createGamepadInputSource(target: Window): DeviceInputSource {
  let subscribed = false;
  const read = typeof target.navigator.getGamepads === "function" ? target.navigator.getGamepads.bind(target.navigator) : null;
  return Object.freeze({
    start(emit: (change: DeviceInputChange) => void): () => void {
      if (subscribed) throw new TypeError("Gamepad input source already started");
      subscribed = true;
      let active = true;
      let usable: boolean | null = null;
      let frame: number | null = null;
      let nextId = 1;
      const gamepads = new Map<number, TrackedGamepad>();
      const send = (change: DeviceInputChange) => { if (active) emit(change); };
      const state = () => send({ kind: "state", channel: "gamepad.state", payload: { gamepads: Object.freeze([...gamepads.values()].map(({ sample }) => sample).sort((a, b) => a.gamepadId - b.gamepadId)) } });
      const stopPolling = () => { if (frame !== null) target.cancelAnimationFrame(frame); frame = null; };
      const baseline = () => {
        gamepads.clear();
        if (read === null) return;
        for (const pad of read()) {
          if (!pad || !supportsCanonicalGamepadButtons(pad) || gamepads.size >= 16) continue;
          const value = sample(pad, nextId++);
          gamepads.set(pad.index, { canonicalId: value.gamepadId, sample: value, pressed: pressedOf(value) });
        }
      };
      const poll = () => {
        if (!active || usable !== true || read === null) return;
        const seen = new Set<number>();
        let changed = false;
        const crossings: Array<{ tracked: TrackedGamepad; button: GamepadButtonNameV1; action: "down" | "up" }> = [];
        for (const pad of read()) {
          if (!pad || !supportsCanonicalGamepadButtons(pad)) continue;
          let tracked = gamepads.get(pad.index);
          if (tracked === undefined && gamepads.size >= 16) continue;
          seen.add(pad.index);
          if (tracked === undefined) {
            const value = sample(pad, nextId++);
            gamepads.set(pad.index, { canonicalId: value.gamepadId, sample: value, pressed: pressedOf(value) });
            changed = true;
            continue;
          }
          const value = sample(pad, tracked.canonicalId);
          const pressed = pressedOf(value);
          if (!same(value, tracked.sample)) changed = true;
          for (const button of buttonNames) if (pressed.has(button) !== tracked.pressed.has(button)) {
            crossings.push({ tracked, button, action: pressed.has(button) ? "down" : "up" });
          }
          tracked.sample = value; tracked.pressed = pressed;
        }
        for (const [index] of gamepads) if (!seen.has(index)) { gamepads.delete(index); changed = true; }
        if (changed) state();
        crossings.sort((a, b) => a.tracked.canonicalId - b.tracked.canonicalId || buttonNames.indexOf(a.button) - buttonNames.indexOf(b.button));
        for (const crossing of crossings) send({ kind: "event", channel: "gamepad.event", payload: {
          action: crossing.action, gamepadId: crossing.tracked.canonicalId, button: crossing.button,
          value: crossing.tracked.sample.buttons[crossing.button],
        } });
        frame = target.requestAnimationFrame(poll);
      };
      const reconcile = () => {
        const next = windowUsable(target);
        if (next === usable) return;
        usable = next; stopPolling(); gamepads.clear();
        if (next) baseline();
        state();
        if (next && read !== null) frame = target.requestAnimationFrame(poll);
      };
      target.addEventListener("focus", reconcile); target.addEventListener("blur", reconcile);
      target.document.addEventListener("visibilitychange", reconcile); reconcile();
      return () => {
        if (!active) return;
        active = false; subscribed = false; stopPolling();
        target.removeEventListener("focus", reconcile); target.removeEventListener("blur", reconcile);
        target.document.removeEventListener("visibilitychange", reconcile); gamepads.clear();
      };
    },
  });
}
