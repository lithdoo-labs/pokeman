import type { RenderDomainState, RenderNode, SubsystemScope, Frame } from "@loomrealm/subsystem";
import { stringifyJson, utf8ByteLength, type JsonObject, type JsonValue } from "@loomrealm/wire";
import {
  DEFAULT_RPG_DIALOGUE_Z_INDEX,
  type ConversationChoiceV0,
  type ConversationRequestV0,
  type DialogueCharacterV0,
  type DialogueHistoryEntryV0,
} from "../model.js";

const encoder = new TextEncoder();
const MAX_ID_BYTES = 128;
const MAX_ATTR_VALUE_BYTES = 4_096;
const MAX_DATA_KEY_BYTES = 256;
const MAX_DATA_MEMBERS = 16_384;
const MAX_DATA_DEPTH = 32;
const MAX_DATA_BYTES = 262_144;
const MAX_RENDER_NODES = 16_384;
const MAX_RENDER_TREE_DEPTH = 30;
const MAX_RENDER_MESSAGE_BYTES = 1_048_576;

function fail(path: string): never {
  throw new TypeError(`Invalid RPG Dialogue value at ${path}`);
}

export function unicodeScalarString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

export function plainDataObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== Object.keys(value).length) return false;
  return names.every((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

function exactShape(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!plainDataObject(value)) fail(path);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.has(key))) fail(path);
  for (const key of required) {
    if (!Object.hasOwn(value, key) || value[key] === undefined) fail(`${path}.${key}`);
  }
  return value;
}

function denseArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(path);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) fail(path);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      fail(`${path}[${index}]`);
    }
  }
  return value;
}

function validateIdentity(value: unknown, path: string): asserts value is string {
  if (!unicodeScalarString(value)) fail(path);
  const bytes = byteLength(value);
  if (bytes < 1 || bytes > MAX_ID_BYTES) fail(path);
}

function validateDisplay(value: unknown, path: string): asserts value is string {
  if (!unicodeScalarString(value) || byteLength(value) > MAX_ATTR_VALUE_BYTES) fail(path);
}

function validateOptionalDisplay(object: Record<string, unknown>, name: string, path: string): void {
  if (object[name] !== undefined) validateDisplay(object[name], `${path}.${name}`);
}

function validateJsonValue(value: unknown, depth: number, active: Set<object>, path: string): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (!unicodeScalarString(value)) fail(path);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path);
    return;
  }
  if (typeof value !== "object" || depth > MAX_DATA_DEPTH || active.has(value)) fail(path);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      const entries = denseArray(value, path);
      if (entries.length > MAX_DATA_MEMBERS) fail(path);
      entries.forEach((entry, index) => validateJsonValue(entry, depth + 1, active, `${path}[${index}]`));
      return;
    }
    if (!plainDataObject(value)) fail(path);
    const entries = Object.entries(value);
    if (entries.length > MAX_DATA_MEMBERS) fail(path);
    for (const [key, entry] of entries) {
      if (!unicodeScalarString(key) || byteLength(key) > MAX_DATA_KEY_BYTES) fail(path);
      validateJsonValue(entry, depth + 1, active, `${path}.${key}`);
    }
  } finally {
    active.delete(value);
  }
}

export function compactJsonBytes(value: unknown): number {
  return utf8ByteLength(stringifyJson(value as JsonValue));
}

function validateData(value: unknown, path: string): asserts value is JsonObject {
  if (!plainDataObject(value)) fail(path);
  validateJsonValue(value, 1, new Set<object>(), path);
  if (compactJsonBytes(value) > MAX_DATA_BYTES) fail(path);
}

function validateChoice(value: unknown, index: number, ids: Set<string>): ConversationChoiceV0 {
  const path = `request.conversation.choices[${index}]`;
  const object = exactShape(value, ["choiceId", "text", "data"], ["enabled"], path);
  validateIdentity(object.choiceId, `${path}.choiceId`);
  if (ids.has(object.choiceId)) fail(`${path}.choiceId`);
  ids.add(object.choiceId);
  validateDisplay(object.text, `${path}.text`);
  if (object.enabled !== undefined && typeof object.enabled !== "boolean") fail(`${path}.enabled`);
  validateData(object.data, `${path}.data`);
  return value as ConversationChoiceV0;
}

function validateCharacter(value: unknown, index: number, ids: Set<string>): DialogueCharacterV0 {
  const path = `request.characters[${index}]`;
  const object = exactShape(value, ["characterId", "active", "data"], ["displayName"], path);
  validateIdentity(object.characterId, `${path}.characterId`);
  if (ids.has(object.characterId)) fail(`${path}.characterId`);
  ids.add(object.characterId);
  if (typeof object.active !== "boolean") fail(`${path}.active`);
  validateOptionalDisplay(object, "displayName", path);
  validateData(object.data, `${path}.data`);
  return value as DialogueCharacterV0;
}

export function validateRequest(value: unknown): ConversationRequestV0 {
  const request = exactShape(value, ["conversation", "characters"], [], "request");
  const conversation = exactShape(
    request.conversation,
    ["text", "choices", "data"],
    ["speakerName"],
    "request.conversation",
  );
  validateDisplay(conversation.text, "request.conversation.text");
  validateOptionalDisplay(conversation, "speakerName", "request.conversation");
  validateData(conversation.data, "request.conversation.data");

  const choiceIds = new Set<string>();
  const choices = denseArray(conversation.choices, "request.conversation.choices");
  const validatedChoices = choices.map((choice, index) => validateChoice(choice, index, choiceIds));
  if (validatedChoices.length > 0 && validatedChoices.every((choice) => choice.enabled === false)) {
    fail("request.conversation.choices");
  }

  const characterIds = new Set<string>();
  denseArray(request.characters, "request.characters")
    .forEach((character, index) => validateCharacter(character, index, characterIds));
  return value as ConversationRequestV0;
}

export function validateHistoryEntry(value: unknown, path = "entry"): DialogueHistoryEntryV0 {
  const object = exactShape(value, ["entryId", "text"], ["speakerName"], path);
  validateIdentity(object.entryId, `${path}.entryId`);
  validateDisplay(object.text, `${path}.text`);
  validateOptionalDisplay(object, "speakerName", path);
  return value as DialogueHistoryEntryV0;
}

export function validateHistory(value: unknown): readonly DialogueHistoryEntryV0[] {
  const entries = denseArray(value, "entries");
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    const validated = validateHistoryEntry(entry, `entries[${index}]`);
    if (ids.has(validated.entryId)) fail(`entries[${index}].entryId`);
    ids.add(validated.entryId);
  });
  return value as readonly DialogueHistoryEntryV0[];
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return value !== null && typeof value === "object" &&
    typeof (value as AbortSignal).aborted === "boolean" &&
    typeof (value as AbortSignal).addEventListener === "function" &&
    typeof (value as AbortSignal).removeEventListener === "function";
}

export function validateConstructor(
  scope: unknown,
  frame: unknown,
  options: unknown,
): { readonly scope: SubsystemScope; readonly frame: Frame; readonly cancelable: boolean; readonly zIndex: number } {
  if (scope === null || typeof scope !== "object" ||
      typeof (scope as SubsystemScope).createRenderDomain !== "function" ||
      typeof (scope as SubsystemScope).events?.subscribe !== "function" ||
      !isAbortSignal((scope as SubsystemScope).signal)) {
    throw new TypeError("Invalid SubsystemScope");
  }
  if (frame === null || typeof frame !== "object" || !isAbortSignal((frame as Frame).signal)) {
    throw new TypeError("Invalid Frame");
  }
  const normalized = options === undefined
    ? {}
    : exactShape(options, [], ["cancelable", "zIndex"], "options");
  if (normalized.cancelable !== undefined && typeof normalized.cancelable !== "boolean") fail("options.cancelable");
  const zIndex = normalized.zIndex;
  if (zIndex !== undefined &&
      (typeof zIndex !== "number" || !Number.isInteger(zIndex) || zIndex < -2_147_483_648 || zIndex > 2_147_483_647)) {
    fail("options.zIndex");
  }
  return {
    scope: scope as SubsystemScope,
    frame: frame as Frame,
    cancelable: normalized.cancelable === true,
    zIndex: zIndex === undefined ? DEFAULT_RPG_DIALOGUE_Z_INDEX : zIndex as number,
  };
}

function countNodes(node: RenderNode, depth: number): number {
  if (depth > MAX_RENDER_TREE_DEPTH) fail("projection.roots");
  let count = 1;
  for (const child of node.children) count += countNodes(child, depth + 1);
  return count;
}

export function validateProjection(state: RenderDomainState): void {
  const count = state.roots.reduce((total, root) => total + countNodes(root, 1), 0);
  if (count > MAX_RENDER_NODES) fail("projection.roots");
  const envelope = {
    type: "render.snapshot",
    domainId: "d".repeat(128),
    revision: Number.MAX_SAFE_INTEGER,
    zIndex: state.zIndex,
    roots: state.roots,
  };
  if (compactJsonBytes(envelope) > MAX_RENDER_MESSAGE_BYTES) fail("projection");
}
