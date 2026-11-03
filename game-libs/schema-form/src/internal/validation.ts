import type {
  SchemaFormDataV1,
  SchemaFormExternalValidationErrorV1,
  SchemaFormFieldV1,
  SchemaFormPresentationValuesV1,
  SchemaFormV1,
  SchemaFormValueV1,
} from "../model.js";
import { SchemaFormError } from "../model.js";

export const SCHEMA_FORM_DOCUMENT_LIMIT = 65_536;
export const SCHEMA_FORM_EVENT_LIMIT = 131_072;

export type CompiledValidator = (data: SchemaFormDataV1) => unknown;

export interface CompiledValidators {
  readonly change?: CompiledValidator;
  readonly submit?: CompiledValidator;
}

export function ownDataObject(value: unknown): value is Record<string, unknown> {
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

function exactMembers(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length <= allowed.length && keys.every((key) => allowed.includes(key));
}

function unknownMember(value: Record<string, unknown>, allowed: readonly string[]): string | undefined {
  return Object.keys(value).find((key) => !allowed.includes(key));
}

function denseArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) schemaFailure(path);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) schemaFailure(path);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) schemaFailure(`${path}[${index}]`);
  }
  return value;
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

export function compactJsonBytes(value: unknown): number {
  const active = new Set<object>();
  const encode = (current: unknown): string => {
    if (current === null) return "null";
    if (typeof current === "string") return JSON.stringify(current);
    if (typeof current === "boolean") return current ? "true" : "false";
    if (typeof current === "number" && Number.isFinite(current)) return JSON.stringify(current);
    if (typeof current !== "object") throw new TypeError("Value is not JSON encodable");
    if (active.has(current)) throw new TypeError("Cyclic JSON value");
    active.add(current);
    try {
      if (Array.isArray(current)) {
        const values: string[] = [];
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
            throw new TypeError("Array must be dense data");
          }
          values.push(encode(descriptor.value));
        }
        return `[${values.join(",")}]`;
      }
      const entries: string[] = [];
      for (const key of Object.keys(current)) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError("Object must contain data properties");
        }
        entries.push(`${JSON.stringify(key)}:${encode(descriptor.value)}`);
      }
      return `{${entries.join(",")}}`;
    } finally {
      active.delete(current);
    }
  };
  return new TextEncoder().encode(encode(value)).byteLength;
}

function schemaFailure(path: string): never {
  throw new SchemaFormError("SCHEMA_FORM_INVALID_SCHEMA", "Invalid SchemaFormV1", path);
}

function initialFailure(path: string): never {
  throw new SchemaFormError("SCHEMA_FORM_INVALID_INITIAL_VALUE", "Invalid initialValue", path);
}

function requireString(value: unknown, path: string): asserts value is string {
  if (!unicodeScalarString(value)) schemaFailure(path);
}

function validateOptionalString(object: Record<string, unknown>, name: string, path: string): void {
  if (Object.hasOwn(object, name)) requireString(object[name], `${path}.${name}`);
}

function validateOptionalBoolean(object: Record<string, unknown>, name: string, path: string): void {
  if (Object.hasOwn(object, name) && typeof object[name] !== "boolean") schemaFailure(`${path}.${name}`);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateFieldValue(field: SchemaFormFieldV1, value: unknown): boolean {
  switch (field.kind) {
    case "string":
      return unicodeScalarString(value) &&
        (field.minLength === undefined || value.length >= field.minLength) &&
        (field.maxLength === undefined || value.length <= field.maxLength);
    case "number":
      return finiteNumber(value) &&
        (field.min === undefined || value >= field.min) &&
        (field.max === undefined || value <= field.max) &&
        (field.integer !== true || Number.isInteger(value));
    case "boolean":
      return typeof value === "boolean";
    case "select":
      return unicodeScalarString(value) && field.options.some((option) => option.value === value);
  }
}

function validateField(
  value: unknown,
  index: number,
  keys: Set<string>,
  localstorageKeys: Set<string>,
): SchemaFormFieldV1 {
  const path = `schema.fields[${index}]`;
  if (!ownDataObject(value)) schemaFailure(path);
  const kind = value.kind;
  const base = ["key", "kind", "label", "description", "required", "localstorageKey"];
  const allowed = kind === "string" ? [...base, "default", "placeholder", "multiline", "minLength", "maxLength"]
    : kind === "number" ? [...base, "default", "min", "max", "integer"]
    : kind === "boolean" ? [...base, "default"]
    : kind === "select" ? [...base, "default", "options"]
    : base;
  if (!exactMembers(value, allowed)) {
    const unknown = Object.keys(value).find((key) => !allowed.includes(key));
    schemaFailure(unknown === undefined ? path : `${path}.${unknown}`);
  }
  requireString(value.key, `${path}.key`);
  if (value.key.length === 0 || new TextEncoder().encode(value.key).byteLength > 128) schemaFailure(`${path}.key`);
  if (keys.has(value.key)) schemaFailure(`${path}.key`);
  keys.add(value.key);
  requireString(value.label, `${path}.label`);
  validateOptionalString(value, "description", path);
  validateOptionalBoolean(value, "required", path);
  if (Object.hasOwn(value, "localstorageKey")) {
    requireString(value.localstorageKey, `${path}.localstorageKey`);
    if (value.localstorageKey.length === 0 ||
        new TextEncoder().encode(value.localstorageKey).byteLength > 256 ||
        localstorageKeys.has(value.localstorageKey)) {
      schemaFailure(`${path}.localstorageKey`);
    }
    localstorageKeys.add(value.localstorageKey);
  }

  if (kind === "string") {
    validateOptionalString(value, "default", path);
    validateOptionalString(value, "placeholder", path);
    validateOptionalBoolean(value, "multiline", path);
    for (const name of ["minLength", "maxLength"] as const) {
      if (Object.hasOwn(value, name) && (!Number.isInteger(value[name]) || (value[name] as number) < 0)) {
        schemaFailure(`${path}.${name}`);
      }
    }
    if (typeof value.minLength === "number" && typeof value.maxLength === "number" && value.minLength > value.maxLength) {
      schemaFailure(`${path}.minLength`);
    }
  } else if (kind === "number") {
    for (const name of ["default", "min", "max"] as const) {
      if (Object.hasOwn(value, name) && !finiteNumber(value[name])) schemaFailure(`${path}.${name}`);
    }
    validateOptionalBoolean(value, "integer", path);
    if (typeof value.min === "number" && typeof value.max === "number" && value.min > value.max) schemaFailure(`${path}.min`);
  } else if (kind === "boolean") {
    if (Object.hasOwn(value, "default") && typeof value.default !== "boolean") schemaFailure(`${path}.default`);
  } else if (kind === "select") {
    const options = denseArray(value.options, `${path}.options`);
    const optionValues = new Set<string>();
    for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
      const option = options[optionIndex];
      const optionPath = `${path}.options[${optionIndex}]`;
      if (!ownDataObject(option)) schemaFailure(optionPath);
      const unknown = unknownMember(option, ["value", "label"]);
      if (unknown !== undefined) schemaFailure(`${optionPath}.${unknown}`);
      if (!Object.hasOwn(option, "value")) schemaFailure(`${optionPath}.value`);
      if (!Object.hasOwn(option, "label")) schemaFailure(`${optionPath}.label`);
      requireString(option.value, `${optionPath}.value`);
      requireString(option.label, `${optionPath}.label`);
      if (optionValues.has(option.value)) schemaFailure(`${optionPath}.value`);
      optionValues.add(option.value);
    }
    validateOptionalString(value, "default", path);
  } else {
    schemaFailure(`${path}.kind`);
  }

  if (Object.hasOwn(value, "default") && !validateFieldValue(value as unknown as SchemaFormFieldV1, value.default)) {
    schemaFailure(`${path}.default`);
  }
  return value as unknown as SchemaFormFieldV1;
}

export function validateSchema(value: unknown): SchemaFormV1 {
  if (!ownDataObject(value)) schemaFailure("schema");
  const allowed = ["version", "title", "description", "fields", "validateOnChange", "validateOnSubmit"];
  const unknown = unknownMember(value, allowed);
  if (unknown !== undefined) schemaFailure(`schema.${unknown}`);
  if (value.version !== 1) schemaFailure("schema");
  validateOptionalString(value, "title", "schema");
  validateOptionalString(value, "description", "schema");
  validateOptionalString(value, "validateOnChange", "schema");
  validateOptionalString(value, "validateOnSubmit", "schema");
  const fields = denseArray(value.fields, "schema.fields");
  if (fields.length > 128) schemaFailure("schema");
  const keys = new Set<string>();
  const localstorageKeys = new Set<string>();
  fields.forEach((field, index) => validateField(field, index, keys, localstorageKeys));
  if (compactJsonBytes(value) > SCHEMA_FORM_DOCUMENT_LIMIT) schemaFailure("schema");
  return value as unknown as SchemaFormV1;
}

export function validateInitialValue(value: unknown, schema: SchemaFormV1): SchemaFormDataV1 | undefined {
  if (value === undefined) return undefined;
  if (!ownDataObject(value)) initialFailure("initialValue");
  const fields = new Map(schema.fields.map((field) => [field.key, field]));
  for (const key of Object.keys(value)) {
    const field = fields.get(key);
    if (field === undefined || !validateFieldValue(field, value[key])) initialFailure(`initialValue.${key}`);
  }
  if (compactJsonBytes(value) > SCHEMA_FORM_DOCUMENT_LIMIT) initialFailure("initialValue");
  return value as SchemaFormDataV1;
}

function setValue(target: Record<string, SchemaFormValueV1>, key: string, value: SchemaFormValueV1): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

export function canonicalInitial(schema: SchemaFormV1, initial: SchemaFormDataV1 | undefined): Record<string, SchemaFormValueV1> {
  const output: Record<string, SchemaFormValueV1> = {};
  for (const field of schema.fields) {
    if (initial !== undefined && Object.hasOwn(initial, field.key)) {
      setValue(output, field.key, initial[field.key] as SchemaFormValueV1);
    } else if (field.default !== undefined) {
      setValue(output, field.key, field.default);
    } else if (field.kind === "string") {
      setValue(output, field.key, "");
    } else if (field.kind === "boolean") {
      setValue(output, field.key, false);
    }
  }
  return output;
}

function compileOne(source: string | undefined, path: string): CompiledValidator | undefined {
  if (source === undefined) return undefined;
  try {
    const value = new Function(`"use strict"; return (${source});`)();
    if (typeof value !== "function") throw new TypeError("Validator expression must evaluate to a function");
    return value as CompiledValidator;
  } catch (cause) {
    throw new SchemaFormError("SCHEMA_FORM_VALIDATOR_FAILED", "Validator compilation failed", path, { cause });
  }
}

export function compileValidators(schema: SchemaFormV1): CompiledValidators {
  return {
    change: compileOne(schema.validateOnChange, "schema.validateOnChange"),
    submit: compileOne(schema.validateOnSubmit, "schema.validateOnSubmit"),
  };
}

export function builtInErrors(schema: SchemaFormV1, data: SchemaFormDataV1): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of schema.fields) {
    const present = Object.hasOwn(data, field.key);
    const value = data[field.key];
    let error: string | undefined;
    if (field.kind === "string") {
      if (field.required === true && value === "") error = "Required";
      else if (field.minLength !== undefined && (value as string).length < field.minLength) error = `Must be at least ${field.minLength} characters`;
      else if (field.maxLength !== undefined && (value as string).length > field.maxLength) error = `Must be at most ${field.maxLength} characters`;
    } else if (field.kind === "number") {
      if (field.required === true && !present) error = "Required";
      else if (present && field.min !== undefined && (value as number) < field.min) error = `Must be at least ${field.min}`;
      else if (present && field.max !== undefined && (value as number) > field.max) error = `Must be at most ${field.max}`;
      else if (present && field.integer === true && !Number.isInteger(value)) error = "Must be an integer";
    } else if (field.kind === "select" && field.required === true && !present) {
      error = "Required";
    }
    if (error !== undefined) setValue(errors, field.key, error);
  }
  return errors;
}

export function runValidator(
  validator: CompiledValidator | undefined,
  canonical: SchemaFormDataV1,
  schema: SchemaFormV1,
  path: "schema.validateOnChange" | "schema.validateOnSubmit",
): Record<string, string> {
  if (validator === undefined) return {};
  let result: unknown;
  try {
    result = validator(Object.freeze({ ...canonical }));
  } catch (cause) {
    throw new SchemaFormError("SCHEMA_FORM_VALIDATOR_FAILED", "Validator execution failed", path, { cause });
  }
  if (result === null || result === undefined) return {};
  const invalid = (): never => {
    throw new SchemaFormError("SCHEMA_FORM_INVALID_VALIDATOR_RESULT", "Invalid validator result", path);
  };
  if (!ownDataObject(result)) invalid();
  const known = new Set(schema.fields.map((field) => field.key));
  for (const [key, message] of Object.entries(result)) {
    if (!known.has(key) || typeof message !== "string" || message.length === 0 || !unicodeScalarString(message)) invalid();
  }
  if (compactJsonBytes(result) > SCHEMA_FORM_DOCUMENT_LIMIT) invalid();
  return { ...result } as Record<string, string>;
}

export function validateCandidate(
  schema: SchemaFormV1,
  value: unknown,
): Record<string, SchemaFormValueV1> | null {
  if (!ownDataObject(value)) return null;
  const expected = new Set(schema.fields.map((field) => field.key));
  const keys = Object.keys(value);
  if (keys.length !== schema.fields.length || keys.some((key) => !expected.has(key))) return null;
  const candidate: Record<string, SchemaFormValueV1> = {};
  for (const field of schema.fields) {
    const presentation = value[field.key];
    if (field.kind === "string") {
      if (typeof presentation !== "string") return null;
      setValue(candidate, field.key, presentation);
    } else if (field.kind === "boolean") {
      if (typeof presentation !== "boolean") return null;
      setValue(candidate, field.key, presentation);
    } else if (field.kind === "number") {
      if (presentation !== null) {
        if (!finiteNumber(presentation)) return null;
        setValue(candidate, field.key, presentation);
      }
    } else if (presentation !== null) {
      if (typeof presentation !== "string" || !field.options.some((option) => option.value === presentation)) return null;
      setValue(candidate, field.key, presentation);
    }
  }
  return candidate;
}

export function validateEventData(
  data: unknown,
  schema: SchemaFormV1,
): Record<string, SchemaFormValueV1> | null {
  if (!ownDataObject(data) || Object.keys(data).length !== 1 || !Object.hasOwn(data, "values")) return null;
  try {
    if (compactJsonBytes(data) > SCHEMA_FORM_EVENT_LIMIT) return null;
  } catch {
    return null;
  }
  return validateCandidate(schema, data.values as SchemaFormPresentationValuesV1);
}

export function validateExternalValidationErrors(
  value: unknown,
  schema: SchemaFormV1,
): readonly SchemaFormExternalValidationErrorV1[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid external validation errors");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length") || value.length > schema.fields.length) {
    throw new TypeError("Invalid external validation errors");
  }
  const known = new Set(schema.fields.map((field) => field.key));
  const seen = new Set<string>();
  const errors: SchemaFormExternalValidationErrorV1[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    const entry = descriptor?.enumerable === true && "value" in descriptor ? descriptor.value : undefined;
    if (!ownDataObject(entry) || !exactMembers(entry, ["field", "errorMsg"]) ||
        Object.keys(entry).length !== 2 || !unicodeScalarString(entry.field) ||
        !known.has(entry.field) || seen.has(entry.field) ||
        !unicodeScalarString(entry.errorMsg) || entry.errorMsg.length === 0) {
      throw new TypeError("Invalid external validation errors");
    }
    seen.add(entry.field);
    errors.push(Object.freeze({ field: entry.field, errorMsg: entry.errorMsg }));
  }
  const output = Object.freeze(errors);
  try {
    if (compactJsonBytes({ errors: output }) > SCHEMA_FORM_EVENT_LIMIT) {
      throw new TypeError("External validation errors are too large");
    }
  } catch (cause) {
    if (cause instanceof TypeError) throw cause;
    throw new TypeError("Invalid external validation errors", { cause });
  }
  return output;
}

export function isEmptyData(data: unknown): boolean {
  return ownDataObject(data) && Object.keys(data).length === 0;
}
