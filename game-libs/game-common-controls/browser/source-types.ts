import type { DeviceInputChange } from "../src/model.js";

export interface DeviceInputSource {
  start(emit: (change: DeviceInputChange) => void): () => void;
}

export function windowUsable(target: Window): boolean {
  return target.document.visibilityState === "visible" && target.document.hasFocus();
}
