import type { ControlsEventPayloadV1, ControlsStatePayloadV1 } from "./model.js";

export type ControlsDirection = "up" | "down" | "left" | "right";

export interface DirectionalControlsTracker {
  readonly direction: ControlsDirection | null;
  acceptState(state: ControlsStatePayloadV1): void;
  acceptEvent(event: ControlsEventPayloadV1): void;
  reset(): void;
}

const DIRECTIONS = Object.freeze(["up", "down", "left", "right"] as const);
const directions = new Set<string>(DIRECTIONS);

function isDirection(value: string): value is ControlsDirection {
  return directions.has(value);
}

export function createDirectionalControlsTracker(): DirectionalControlsTracker {
  let freshDown = new Set<ControlsDirection>();
  let heldOrder: ControlsDirection[] = [];

  const tracker: DirectionalControlsTracker = {
    get direction() {
      return heldOrder.at(-1) ?? null;
    },
    acceptState(state) {
      const next = new Set<ControlsDirection>();
      if (state !== null && typeof state === "object" && Array.isArray(state.down)) {
        for (const button of state.down) if (isDirection(button)) next.add(button);
      }
      heldOrder = heldOrder.filter((direction) => next.has(direction));
      for (const direction of DIRECTIONS) {
        if (next.has(direction) && !heldOrder.includes(direction)) heldOrder.push(direction);
      }
      freshDown = next;
    },
    acceptEvent(event) {
      if (event === null || typeof event !== "object" || !isDirection(event.button) || event.repeat) return;
      if (event.action === "up") {
        heldOrder = heldOrder.filter((direction) => direction !== event.button);
        return;
      }
      if (event.action !== "down" || !freshDown.has(event.button)) return;
      heldOrder = heldOrder.filter((direction) => direction !== event.button);
      heldOrder.push(event.button);
    },
    reset() {
      freshDown = new Set();
      heldOrder = [];
    },
  };
  return Object.freeze(tracker);
}
