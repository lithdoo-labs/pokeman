import type {
  DeviceInputChange, PointerButtonV1, PointerKindV1, PointerSampleV1,
} from "../src/model.js";
import { windowUsable, type DeviceInputSource } from "./source-types.js";

const pointerButtons: readonly (readonly [number, PointerButtonV1])[] = Object.freeze([
  [1, "primary"], [4, "auxiliary"], [2, "secondary"], [8, "back"], [16, "forward"],
]);

interface TrackedPointer { readonly canonicalId: number; readonly kind: PointerKindV1; sample: PointerSampleV1; }

function clampInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-2_147_483_648, Math.min(2_147_483_647, Math.round(value)));
}
function coordinate(value: number, extent: number): number {
  return !Number.isFinite(value) || !Number.isFinite(extent) || extent <= 0 ? 0 : clampInteger(value / extent * 1_000_000);
}
function kind(value: string): PointerKindV1 | null { return value === "mouse" || value === "touch" || value === "pen" ? value : null; }
function buttonsOf(bits: number): readonly PointerButtonV1[] {
  return Object.freeze(pointerButtons.filter(([bit]) => (bits & bit) !== 0).map(([, button]) => button));
}
function same(left: PointerSampleV1, right: PointerSampleV1): boolean {
  return left.pointerId === right.pointerId && left.kind === right.kind && left.x === right.x && left.y === right.y &&
    left.buttons.length === right.buttons.length && left.buttons.every((value, index) => value === right.buttons[index]);
}

export function createPointerInputSource(target: Window): DeviceInputSource {
  let subscribed = false;
  return Object.freeze({
    start(emit: (change: DeviceInputChange) => void): () => void {
      if (subscribed) throw new TypeError("Pointer input source already started");
      subscribed = true;
      let active = true;
      let usable: boolean | null = null;
      let available = false;
      let nextPointerId = 1;
      const pointers = new Map<number, TrackedPointer>();
      const send = (change: DeviceInputChange) => { if (active) emit(change); };
      const state = () => send({ kind: "state", channel: "pointer.state", payload: { pointers: Object.freeze([...pointers.values()].map(({ sample }) => sample).sort((a, b) => a.pointerId - b.pointerId)) } });
      const surfaceValid = () => target.innerWidth > 0 && target.innerHeight > 0;
      const reconcile = () => {
        const next = windowUsable(target);
        if (next === usable) return;
        usable = next;
        pointers.clear();
        available = next && surfaceValid();
        state();
      };
      const resize = () => {
        if (usable !== true) return;
        const next = surfaceValid();
        if (next === available) return;
        available = next;
        pointers.clear();
        state();
      };
      const pointer = (event: PointerEvent) => {
        if (usable !== true || !available || !event.isTrusted) return;
        const pointerKind = kind(event.pointerType);
        if (pointerKind === null) return;
        let tracked = pointers.get(event.pointerId);
        if (tracked === undefined) {
          if (event.type !== "pointerdown" || pointers.size >= 32) return;
          const sample: PointerSampleV1 = Object.freeze({
            pointerId: nextPointerId++, kind: pointerKind,
            x: coordinate(event.clientX, target.innerWidth), y: coordinate(event.clientY, target.innerHeight),
            buttons: Object.freeze([]),
          });
          tracked = { canonicalId: sample.pointerId, kind: pointerKind, sample };
          pointers.set(event.pointerId, tracked);
        }
        const nextButtons = event.type === "pointercancel" ? Object.freeze([]) : buttonsOf(event.buttons);
        const next: PointerSampleV1 = Object.freeze({
          pointerId: tracked.canonicalId, kind: tracked.kind,
          x: coordinate(event.clientX, target.innerWidth), y: coordinate(event.clientY, target.innerHeight), buttons: nextButtons,
        });
        if (event.type === "pointercancel") {
          pointers.delete(event.pointerId); state();
          send({ kind: "event", channel: "pointer.event", payload: { action: "cancel", pointer: next, button: null } });
          return;
        }
        const ordered = pointerButtons.map(([, button]) => button);
        const removed = ordered.filter((button) => tracked.sample.buttons.includes(button) && !nextButtons.includes(button));
        const added = ordered.filter((button) => !tracked.sample.buttons.includes(button) && nextButtons.includes(button));
        const changed = !same(tracked.sample, next);
        tracked.sample = next;
        if (nextButtons.length === 0) pointers.delete(event.pointerId);
        if (changed) state();
        for (const button of removed) send({ kind: "event", channel: "pointer.event", payload: { action: "up", pointer: next, button } });
        for (const button of added) send({ kind: "event", channel: "pointer.event", payload: { action: "down", pointer: next, button } });
      };
      target.addEventListener("focus", reconcile);
      target.addEventListener("blur", reconcile);
      target.addEventListener("resize", resize);
      target.addEventListener("pointerdown", pointer);
      target.addEventListener("pointermove", pointer);
      target.addEventListener("pointerup", pointer);
      target.addEventListener("pointercancel", pointer);
      target.document.addEventListener("visibilitychange", reconcile);
      reconcile();
      return () => {
        if (!active) return;
        active = false; subscribed = false;
        target.removeEventListener("focus", reconcile); target.removeEventListener("blur", reconcile);
        target.removeEventListener("resize", resize); target.removeEventListener("pointerdown", pointer);
        target.removeEventListener("pointermove", pointer); target.removeEventListener("pointerup", pointer);
        target.removeEventListener("pointercancel", pointer); target.document.removeEventListener("visibilitychange", reconcile);
        pointers.clear();
      };
    },
  });
}
