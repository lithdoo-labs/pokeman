import {
  CONTROLS_STATE_STALE_MS, DEVICE_STATE_STALE_MS, EMPTY_CONTROLS_STATE_V1, emptyDeviceState,
  type ControlsStatePayloadV1, type DeviceStateChannel, type JsonObject,
} from "./model.js";

export interface FreshDeviceStateTracker {
  accept(payload: JsonObject): void;
  close(): void;
}

export function createFreshDeviceStateTracker(
  channel: DeviceStateChannel,
  deliver: (payload: JsonObject) => void,
  options: { readonly staleAfterMs?: number } = {},
): FreshDeviceStateTracker {
  if (typeof deliver !== "function") throw new TypeError("Invalid device State sink");
  const staleAfterMs = options.staleAfterMs ?? DEVICE_STATE_STALE_MS;
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs <= 0) throw new TypeError("Invalid device State stale timeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const expire = () => {
    timer = undefined;
    if (!closed) deliver(emptyDeviceState(channel));
  };
  return Object.freeze({
    accept(payload: JsonObject) {
      if (closed || payload === null || typeof payload !== "object" || Array.isArray(payload)) return;
      if (timer !== undefined) clearTimeout(timer);
      deliver(payload);
      timer = setTimeout(expire, staleAfterMs);
    },
    close() {
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  });
}

export interface FreshControlsStateTracker {
  accept(payload: ControlsStatePayloadV1): void;
  close(): void;
}

export function createFreshControlsStateTracker(
  deliver: (payload: ControlsStatePayloadV1) => void,
  options: { readonly staleAfterMs?: number } = {},
): FreshControlsStateTracker {
  if (typeof deliver !== "function") throw new TypeError("Invalid controls State sink");
  const staleAfterMs = options.staleAfterMs ?? CONTROLS_STATE_STALE_MS;
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs <= 0) throw new TypeError("Invalid controls State stale timeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const expire = () => {
    timer = undefined;
    if (!closed) deliver(EMPTY_CONTROLS_STATE_V1);
  };
  return Object.freeze({
    accept(payload: ControlsStatePayloadV1) {
      if (closed || payload === null || typeof payload !== "object" || Array.isArray(payload)) return;
      if (timer !== undefined) clearTimeout(timer);
      deliver(payload);
      timer = setTimeout(expire, staleAfterMs);
    },
    close() {
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  });
}
