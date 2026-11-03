import {
  controlsButtonFromGamepadIndex, controlsButtonFromKeyboardCode, createControlsMachine,
  gamepadControlPressed,
  type ControlsMachine, type ControlsPadSample, type ControlsPublication,
} from "../src/controls-machine.js";
import { CONTROLS_BUTTONS_V1, type ControlsButtonV1 } from "../src/model.js";
import { supportsCanonicalGamepadButtons } from "./gamepad-layout.js";
import { windowUsable } from "./source-types.js";

export interface ControlsInputSource {
  start(emit: (publication: ControlsPublication) => void): () => void;
}

const DEBUG_CONTROLS_EVENT = "loomrealm:debug-input";

function customControlsState(event: Event, eventTarget: HTMLElement): readonly ControlsButtonV1[] | null {
  try {
    if (
      !(event instanceof CustomEvent)
      || event.target !== eventTarget
      || event.bubbles !== false
      || event.composed !== false
      || event.cancelable !== false
    ) return null;
    const detail: unknown = event.detail;
    if (detail === null || typeof detail !== "object" || Array.isArray(detail)) return null;
    const prototype = Object.getPrototypeOf(detail);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Object.keys(detail);
    if (keys.length !== 2 || !keys.includes("version") || !keys.includes("down")) return null;
    const candidate = detail as { readonly version?: unknown; readonly down?: unknown };
    const version = candidate.version;
    const pressed = candidate.down;
    if (version !== 1 || !Array.isArray(pressed) || pressed.length > CONTROLS_BUTTONS_V1.length) return null;
    const down = new Set<ControlsButtonV1>();
    for (const button of pressed) {
      if (typeof button !== "string" || !CONTROLS_BUTTONS_V1.includes(button as ControlsButtonV1) || down.has(button as ControlsButtonV1)) return null;
      down.add(button as ControlsButtonV1);
    }
    return CONTROLS_BUTTONS_V1.filter((button) => down.has(button));
  } catch {
    return null;
  }
}

export function deepestActiveElement(document: Document): Element | null {
  let current: Element | null = document.activeElement;
  const seen = new Set<Element>();
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    const inner = current.shadowRoot?.activeElement ?? null;
    if (inner === null) return current;
    current = inner;
  }
  return current;
}

function composedParent(element: Element): Element | null {
  if (element.parentElement !== null) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function blockedFocusTarget(element: Element): boolean {
  if (
    element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
    || element instanceof HTMLButtonElement
  ) return true;
  if (element instanceof HTMLAnchorElement && element.hasAttribute("href")) return true;
  return element instanceof HTMLElement && element.isContentEditable;
}

export function keyboardCaptureBlocked(document: Document): boolean {
  let node = deepestActiveElement(document);
  const seen = new Set<Element>();
  while (node !== null && !seen.has(node)) {
    seen.add(node);
    if (blockedFocusTarget(node)) return true;
    node = composedParent(node);
  }
  return false;
}

function readPads(target: Window): ControlsPadSample[] {
  const read = target.navigator.getGamepads;
  if (typeof read !== "function") return [];
  const samples: ControlsPadSample[] = [];
  const seen = new Set<number>();
  for (const pad of read.call(target.navigator)) {
    if (pad === null || !supportsCanonicalGamepadButtons(pad) || seen.has(pad.index)) continue;
    seen.add(pad.index);
    const pressed: ControlsButtonV1[] = [];
    for (let index = 0; index < pad.buttons.length; index += 1) {
      const button = controlsButtonFromGamepadIndex(index);
      if (button !== null && gamepadControlPressed(pad.buttons[index]?.value ?? 0)) pressed.push(button);
    }
    samples.push({ index: pad.index, pressed });
  }
  return samples;
}

function emitPublication(
  active: () => boolean,
  emit: (publication: ControlsPublication) => void,
  publication: ControlsPublication,
): void {
  if (!active() || (publication.state === null && publication.events.length === 0)) return;
  emit(publication);
}

export function createControlsInputSource(target: Window, eventTarget: HTMLElement): ControlsInputSource {
  let subscribed = false;
  return Object.freeze({
    start(emit: (publication: ControlsPublication) => void): () => void {
      if (subscribed) throw new TypeError("Controls input source already started");
      subscribed = true;
      let active = true;
      let frame: number | null = null;
      const machine: ControlsMachine = createControlsMachine();
      const send = (publication: ControlsPublication) => emitPublication(() => active, emit, publication);
      const stopPolling = () => {
        if (frame !== null) target.cancelAnimationFrame(frame);
        frame = null;
      };
      const poll = () => {
        frame = null;
        if (!active || !machine.windowUsable) return;
        send(machine.applyGamepadFrame(readPads(target)));
        if (!active || !machine.windowUsable) return;
        frame = target.requestAnimationFrame(poll);
      };
      const reconcile = () => {
        if (!active) return;
        const nextWindow = windowUsable(target);
        const nextCapture = nextWindow && !keyboardCaptureBlocked(target.document);
        if (nextWindow !== machine.windowUsable) {
          stopPolling();
          send(machine.setWindowUsable(nextWindow, nextWindow ? readPads(target) : []));
          if (active && machine.windowUsable) frame = target.requestAnimationFrame(poll);
        }
        if (!active) return;
        if (nextCapture !== machine.keyboardCapture) send(machine.setKeyboardCapture(nextCapture));
      };
      const keydown = (event: KeyboardEvent) => {
        if (!active || event.isTrusted !== true) return;
        const button = controlsButtonFromKeyboardCode(event.code);
        if (button === null) return;
        if (machine.keyboardCapture && event.cancelable) event.preventDefault();
        if (!machine.keyboardCapture) return;
        send(machine.keydown(button, event.repeat));
      };
      const keyup = (event: KeyboardEvent) => {
        if (!active || event.isTrusted !== true) return;
        const button = controlsButtonFromKeyboardCode(event.code);
        if (button === null || !machine.keyboardCapture) return;
        send(machine.keyup(button));
      };
      const custom = (event: Event) => {
        if (!active) return;
        const down = customControlsState(event, eventTarget);
        if (down !== null) send(machine.applyCustomState(down));
      };
      const focusout = () => { queueMicrotask(reconcile); };
      target.addEventListener("keydown", keydown);
      target.addEventListener("keyup", keyup);
      target.addEventListener("focus", reconcile);
      target.addEventListener("blur", reconcile);
      target.document.addEventListener("focusin", reconcile);
      target.document.addEventListener("focusout", focusout);
      target.document.addEventListener("visibilitychange", reconcile);
      eventTarget.addEventListener(DEBUG_CONTROLS_EVENT, custom);
      reconcile();
      return () => {
        if (!active) return;
        active = false;
        subscribed = false;
        stopPolling();
        machine.setWindowUsable(false);
        target.removeEventListener("keydown", keydown);
        target.removeEventListener("keyup", keyup);
        target.removeEventListener("focus", reconcile);
        target.removeEventListener("blur", reconcile);
        target.document.removeEventListener("focusin", reconcile);
        target.document.removeEventListener("focusout", focusout);
        target.document.removeEventListener("visibilitychange", reconcile);
        eventTarget.removeEventListener(DEBUG_CONTROLS_EVENT, custom);
      };
    },
  });
}
