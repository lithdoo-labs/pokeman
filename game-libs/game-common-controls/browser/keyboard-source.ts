import { KEYBOARD_CODES_V1, type DeviceInputChange, type KeyboardCodeV1 } from "../src/model.js";
import { windowUsable, type DeviceInputSource } from "./source-types.js";

const keyboardCodes = new Set<string>(KEYBOARD_CODES_V1);

export function createKeyboardInputSource(target: Window): DeviceInputSource {
  let subscribed = false;
  return Object.freeze({
    start(emit: (change: DeviceInputChange) => void): () => void {
      if (subscribed) throw new TypeError("Keyboard input source already started");
      subscribed = true;
      let active = true;
      let usable: boolean | null = null;
      const held = new Set<KeyboardCodeV1>();
      const send = (change: DeviceInputChange) => { if (active) emit(change); };
      const state = () => send({ kind: "state", channel: "keyboard.state", payload: { down: Object.freeze([...held].sort()) } });
      const reconcile = () => {
        const next = windowUsable(target);
        if (next === usable) return;
        usable = next;
        held.clear();
        state();
      };
      const keydown = (event: KeyboardEvent) => {
        if (usable !== true || !event.isTrusted || !keyboardCodes.has(event.code)) return;
        const code = event.code as KeyboardCodeV1;
        const repeat = held.has(code);
        if (!repeat) { held.add(code); state(); }
        send({ kind: "event", channel: "keyboard.event", payload: { action: "down", code, repeat } });
      };
      const keyup = (event: KeyboardEvent) => {
        if (usable !== true || !event.isTrusted || !keyboardCodes.has(event.code)) return;
        const code = event.code as KeyboardCodeV1;
        if (!held.delete(code)) return;
        state();
        send({ kind: "event", channel: "keyboard.event", payload: { action: "up", code, repeat: false } });
      };
      target.addEventListener("focus", reconcile);
      target.addEventListener("blur", reconcile);
      target.addEventListener("keydown", keydown);
      target.addEventListener("keyup", keyup);
      target.document.addEventListener("visibilitychange", reconcile);
      reconcile();
      return () => {
        if (!active) return;
        active = false;
        subscribed = false;
        target.removeEventListener("focus", reconcile);
        target.removeEventListener("blur", reconcile);
        target.removeEventListener("keydown", keydown);
        target.removeEventListener("keyup", keyup);
        target.document.removeEventListener("visibilitychange", reconcile);
        held.clear();
      };
    },
  });
}
