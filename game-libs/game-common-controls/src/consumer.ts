import type { Frame, PresentationEventClient } from "@loomrealm/subsystem";
import { createFreshControlsStateTracker, type FreshControlsStateTracker } from "./fresh-state.js";
import {
  CONTROLS_BUTTONS_V1,
  EMPTY_CONTROLS_STATE_V1,
  type ControlsButtonV1,
  type ControlsEventPayloadV1,
  type ControlsStatePayloadV1,
} from "./model.js";

export interface ControlsConsumerHandlers {
  readonly onState?: (state: ControlsStatePayloadV1) => void | Promise<void>;
  readonly onEvent?: (event: ControlsEventPayloadV1) => void | Promise<void>;
}

export interface ControlsConsumer {
  close(): void;
}

const controlsButtons = new Set<string>(CONTROLS_BUTTONS_V1);
const controlsButtonOrder = new Map<string, number>(
  CONTROLS_BUTTONS_V1.map((button, index) => [button, index]),
);

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function controlsButton(value: unknown): value is ControlsButtonV1 {
  return typeof value === "string" && controlsButtons.has(value);
}

function isAbortSignalLike(value: unknown): value is AbortSignal {
  if (value === null || typeof value !== "object") return false;
  const signal = value as Partial<AbortSignal>;
  return typeof signal.aborted === "boolean"
    && typeof signal.addEventListener === "function"
    && typeof signal.removeEventListener === "function";
}

function validState(value: unknown): ControlsStatePayloadV1 | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Readonly<Record<string, unknown>>;
  if (!exactKeys(record, ["down"]) || !Array.isArray(record.down)) return null;
  let previous = -1;
  const down: ControlsButtonV1[] = [];
  for (const item of record.down) {
    if (!controlsButton(item)) return null;
    const index = controlsButtonOrder.get(item)!;
    if (index <= previous) return null;
    previous = index;
    down.push(item);
  }
  return Object.freeze({ down: Object.freeze(down) });
}

function validEvent(value: unknown): ControlsEventPayloadV1 | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Readonly<Record<string, unknown>>;
  if (!exactKeys(record, ["action", "button", "repeat"])) return null;
  if ((record.action !== "down" && record.action !== "up") || !controlsButton(record.button) || typeof record.repeat !== "boolean") return null;
  if (record.action === "up" && record.repeat) return null;
  return Object.freeze({ action: record.action, button: record.button, repeat: record.repeat });
}

function deliver<T>(handler: ((value: T) => void | Promise<void>) | undefined, value: T): void {
  if (handler === undefined) return;
  try {
    const result = handler(value);
    if (result !== undefined) void Promise.resolve(result).catch(() => undefined);
  } catch {
    // A consumer callback is isolated to this invocation.
  }
}

export function createControlsConsumer(
  presentationEvents: PresentationEventClient,
  frame: Frame,
  handlers: ControlsConsumerHandlers,
): ControlsConsumer {
  if (presentationEvents === null || typeof presentationEvents !== "object" || typeof presentationEvents.createListener !== "function") {
    throw new TypeError("Invalid Presentation Event client");
  }
  if (frame === null || typeof frame !== "object" || !isAbortSignalLike(frame.signal)) {
    throw new TypeError("Invalid Frame");
  }
  if (handlers === null || typeof handlers !== "object" || Array.isArray(handlers)) {
    throw new TypeError("Invalid controls consumer handlers");
  }
  if (handlers.onState !== undefined && typeof handlers.onState !== "function") throw new TypeError("Invalid controls State handler");
  if (handlers.onEvent !== undefined && typeof handlers.onEvent !== "function") throw new TypeError("Invalid controls Event handler");

  const channels = [
    ...(handlers.onState === undefined ? [] : ["controls.state"]),
    ...(handlers.onEvent === undefined ? [] : ["controls.event"]),
  ];
  const listener = presentationEvents.createListener({ frame, channels });
  let tracker: FreshControlsStateTracker | undefined;
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    frame.signal.removeEventListener("abort", close);
    tracker?.close();
    tracker = undefined;
    listener.close();
  };

  if (handlers.onState !== undefined) {
    tracker = createFreshControlsStateTracker((state) => {
      if (!closed) deliver(handlers.onState, state);
    });
    listener.on("controls.state", (event) => {
      if (closed || event.name !== "input.state") return;
      const state = validState(event.data);
      if (state !== null) tracker?.accept(state);
    });
  }
  if (handlers.onEvent !== undefined) {
    listener.on("controls.event", (event) => {
      if (closed || event.name !== "input.event") return;
      const controlsEvent = validEvent(event.data);
      if (controlsEvent !== null) deliver(handlers.onEvent, controlsEvent);
    });
  }

  frame.signal.addEventListener("abort", close, { once: true });
  if (frame.signal.aborted) close();
  else deliver(handlers.onState, EMPTY_CONTROLS_STATE_V1);

  return Object.freeze({ close });
}
