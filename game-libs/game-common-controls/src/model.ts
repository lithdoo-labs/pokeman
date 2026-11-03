export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface JsonObject { readonly [key: string]: JsonValue; }

export const DEVICE_INPUT_CHANNELS = Object.freeze([
  "keyboard.state", "keyboard.event", "pointer.state", "pointer.event",
  "gamepad.state", "gamepad.event",
] as const);
export type DeviceInputChannel = typeof DEVICE_INPUT_CHANNELS[number];
export type DeviceStateChannel = "keyboard.state" | "pointer.state" | "gamepad.state";
export type DeviceEventChannel = "keyboard.event" | "pointer.event" | "gamepad.event";

export const KEYBOARD_CODES_V1 = Object.freeze([
  "KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyI", "KeyJ",
  "KeyK", "KeyL", "KeyM", "KeyN", "KeyO", "KeyP", "KeyQ", "KeyR", "KeyS", "KeyT",
  "KeyU", "KeyV", "KeyW", "KeyX", "KeyY", "KeyZ",
  "Digit0", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
  "F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24",
  "Numpad0", "Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad5", "Numpad6", "Numpad7", "Numpad8", "Numpad9",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "Escape", "Tab", "Backspace",
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "CapsLock",
  "Insert", "Delete", "Home", "End", "PageUp", "PageDown", "Minus", "Equal", "BracketLeft", "BracketRight", "Backslash",
  "Semicolon", "Quote", "Backquote", "Comma", "Period", "Slash", "NumpadAdd", "NumpadSubtract", "NumpadMultiply",
  "NumpadDivide", "NumpadDecimal", "NumpadEnter",
] as const);
export type KeyboardCodeV1 = typeof KEYBOARD_CODES_V1[number];
export interface KeyboardStatePayloadV1 extends JsonObject { readonly down: readonly KeyboardCodeV1[]; }
export interface KeyboardEventPayloadV1 extends JsonObject { readonly action: "down" | "up"; readonly code: KeyboardCodeV1; readonly repeat: boolean; }
export type PointerKindV1 = "mouse" | "touch" | "pen";
export type PointerButtonV1 = "primary" | "auxiliary" | "secondary" | "back" | "forward";
export interface PointerSampleV1 extends JsonObject { readonly pointerId: number; readonly kind: PointerKindV1; readonly x: number; readonly y: number; readonly buttons: readonly PointerButtonV1[]; }
export interface PointerStatePayloadV1 extends JsonObject { readonly pointers: readonly PointerSampleV1[]; }
export interface PointerEventPayloadV1 extends JsonObject { readonly action: "down" | "up" | "cancel"; readonly pointer: PointerSampleV1; readonly button: PointerButtonV1 | null; }
export interface GamepadAxesV1 extends JsonObject { readonly leftX: number; readonly leftY: number; readonly rightX: number; readonly rightY: number; }
export interface GamepadButtonsV1 extends JsonObject {
  readonly south: number; readonly east: number; readonly west: number; readonly north: number;
  readonly leftBumper: number; readonly rightBumper: number; readonly leftTrigger: number; readonly rightTrigger: number;
  readonly select: number; readonly start: number; readonly leftStick: number; readonly rightStick: number;
  readonly dpadUp: number; readonly dpadDown: number; readonly dpadLeft: number; readonly dpadRight: number; readonly home: number;
}
export interface GamepadSampleV1 extends JsonObject { readonly gamepadId: number; readonly axes: GamepadAxesV1; readonly buttons: GamepadButtonsV1; }
export interface GamepadStatePayloadV1 extends JsonObject { readonly gamepads: readonly GamepadSampleV1[]; }
export type GamepadButtonNameV1 =
  | "south" | "east" | "west" | "north" | "leftBumper" | "rightBumper" | "leftTrigger" | "rightTrigger"
  | "select" | "start" | "leftStick" | "rightStick" | "dpadUp" | "dpadDown" | "dpadLeft" | "dpadRight" | "home";
export interface GamepadEventPayloadV1 extends JsonObject { readonly action: "down" | "up"; readonly gamepadId: number; readonly button: GamepadButtonNameV1; readonly value: number; }

export type DeviceInputChange =
  | { readonly kind: "state"; readonly channel: DeviceStateChannel; readonly payload: JsonObject }
  | { readonly kind: "event"; readonly channel: DeviceEventChannel; readonly payload: JsonObject };

export const DEVICE_STATE_REFRESH_MS = 1_000;
export const DEVICE_STATE_STALE_MS = 2_500;

export function emptyDeviceState(channel: DeviceStateChannel): JsonObject {
  if (channel === "keyboard.state") return Object.freeze({ down: Object.freeze([]) });
  if (channel === "pointer.state") return Object.freeze({ pointers: Object.freeze([]) });
  return Object.freeze({ gamepads: Object.freeze([]) });
}

export function isNonEmptyDeviceState(channel: DeviceStateChannel, payload: JsonObject): boolean {
  const value = channel === "keyboard.state" ? payload.down : channel === "pointer.state" ? payload.pointers : payload.gamepads;
  return Array.isArray(value) && value.length > 0;
}

export const CONTROLS_INPUT_CHANNELS = Object.freeze([
  "controls.state",
  "controls.event",
] as const);
export type ControlsInputChannel = typeof CONTROLS_INPUT_CHANNELS[number];

export const CONTROLS_BUTTONS_V1 = Object.freeze([
  "up", "down", "left", "right",
  "south", "east", "west", "north",
  "leftBumper", "rightBumper", "leftTrigger", "rightTrigger",
  "start", "select",
] as const);
export type ControlsButtonV1 = typeof CONTROLS_BUTTONS_V1[number];

export interface ControlsStatePayloadV1 extends JsonObject {
  readonly down: readonly ControlsButtonV1[];
}

export interface ControlsEventPayloadV1 extends JsonObject {
  readonly action: "down" | "up";
  readonly button: ControlsButtonV1;
  readonly repeat: boolean;
}

export const EMPTY_CONTROLS_STATE_V1: ControlsStatePayloadV1 = Object.freeze({
  down: Object.freeze([]),
});
export const CONTROLS_STATE_REFRESH_MS = 1_000;
export const CONTROLS_STATE_STALE_MS = 2_500;
