import type {
  Frame,
  RenderDomain,
  RenderDomainState,
  SessionEvent,
  SessionEventSubscription,
  SubsystemScope,
} from "@loomrealm/subsystem";
import type {
  SchemaFormDataV1,
  SchemaFormExternalValidationErrorV1,
  SchemaFormFieldRenderDataV1,
  SchemaFormRequestV1,
  SchemaFormResultV1,
  SchemaFormSubmitControlV1,
  SchemaFormV1,
  SchemaFormValueV1,
} from "../model.js";
import { SchemaFormError } from "../model.js";
import {
  builtInErrors,
  canonicalInitial,
  compileValidators,
  isEmptyData,
  ownDataObject,
  runValidator,
  validateEventData,
  validateExternalValidationErrors,
  validateInitialValue,
  validateSchema,
  type CompiledValidator,
  type CompiledValidators,
} from "./validation.js";

const activeForms = new WeakMap<Frame, Session>();
const THEME_CLASSES =
  "wa-theme-default wa-palette-default wa-brand-blue wa-neutral-gray " +
  "wa-success-green wa-warning-yellow wa-danger-red";
const SCHEMA_FORM_Z_INDEX = 2_147_483_647;
const WEB_PRESENTATION_EVENT_CHANNEL = "x.loomrealm.web-presentation.event";
let nextFormSerial = 1;

function isAbortSignal(value: unknown): value is AbortSignal {
  return value !== null && typeof value === "object" &&
    typeof (value as AbortSignal).aborted === "boolean" &&
    typeof (value as AbortSignal).addEventListener === "function" &&
    typeof (value as AbortSignal).removeEventListener === "function";
}

function validateOuter(scope: unknown, frame: unknown, request: unknown): asserts scope is SubsystemScope {
  if (scope === null || typeof scope !== "object" ||
      typeof (scope as SubsystemScope).createRenderDomain !== "function" ||
      typeof (scope as SubsystemScope).events?.subscribe !== "function") {
    throw new TypeError("Invalid SubsystemScope");
  }
  if (frame === null || typeof frame !== "object" || !isAbortSignal((frame as Frame).signal)) {
    throw new TypeError("Invalid Frame");
  }
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("Invalid SchemaFormRequestV1");
  }
  const cancelable = (request as { cancelable?: unknown }).cancelable;
  if (cancelable !== undefined && typeof cancelable !== "boolean") throw new TypeError("Invalid cancelable");
  const onSubmit = (request as { onSubmit?: unknown }).onSubmit;
  if (onSubmit !== undefined && typeof onSubmit !== "function") throw new TypeError("Invalid onSubmit");
}

function allocateSerial(): number {
  if (!Number.isSafeInteger(nextFormSerial)) throw new Error("Schema Form identity space exhausted");
  const serial = nextFormSerial;
  nextFormSerial += 1;
  return serial;
}

function abortError(): Error {
  if (typeof DOMException === "function") return new DOMException("The Frame was aborted", "AbortError");
  const error = new Error("The Frame was aborted");
  error.name = "AbortError";
  return error;
}

function fieldRenderData(
  field: SchemaFormV1["fields"][number],
  canonical: SchemaFormDataV1,
  errors: Readonly<Record<string, string>>,
  restoreAllowed: boolean,
): SchemaFormFieldRenderDataV1 {
  const error = Object.hasOwn(errors, field.key) ? errors[field.key] : undefined;
  const base = {
    key: field.key,
    label: field.label,
    ...(field.description === undefined ? {} : { description: field.description }),
    required: field.required === true,
    ...(error === undefined ? {} : { error }),
    restoreAllowed,
    ...(field.localstorageKey === undefined ? {} : { localstorageKey: field.localstorageKey }),
  };
  if (field.kind === "string") return {
    ...base,
    kind: "string",
    value: canonical[field.key] as string,
    ...(field.placeholder === undefined ? {} : { placeholder: field.placeholder }),
    multiline: field.multiline === true,
    ...(field.minLength === undefined ? {} : { minLength: field.minLength }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
  };
  if (field.kind === "number") return {
    ...base,
    kind: "number",
    ...(Object.hasOwn(canonical, field.key) ? { value: canonical[field.key] as number } : {}),
    ...(field.min === undefined ? {} : { min: field.min }),
    ...(field.max === undefined ? {} : { max: field.max }),
    integer: field.integer === true,
  };
  if (field.kind === "boolean") return {
    ...base,
    kind: "boolean",
    value: canonical[field.key] as boolean,
  };
  return {
    ...base,
    kind: "select",
    ...(Object.hasOwn(canonical, field.key) ? { value: canonical[field.key] as string } : {}),
    options: field.options.map((option) => ({ ...option })),
  };
}

function initialState(
  schema: SchemaFormV1,
  canonical: SchemaFormDataV1,
  request: SchemaFormRequestV1,
  restoreAllowed: readonly boolean[],
  restorePending: boolean,
  serial: number,
): RenderDomainState {
  return {
    zIndex: SCHEMA_FORM_Z_INDEX,
    roots: [{
      key: `sf:${serial}`,
      tag: "lr-schema-form",
      attrs: { class: THEME_CLASSES },
      data: {
        ...(schema.title === undefined ? {} : { title: schema.title }),
        ...(schema.description === undefined ? {} : { description: schema.description }),
        cancelable: request.cancelable === true,
        fieldCount: schema.fields.length,
        restorePending,
      },
      children: schema.fields.map((field, index) => ({
        key: `sf:${serial}:f:${index}`,
        tag: "lr-schema-form-field",
        attrs: {},
        data: fieldRenderData(field, canonical, {}, restoreAllowed[index]) as never,
        children: [],
      })),
    }],
  };
}

interface SubmitAttempt {
  readonly identity: number;
  readonly snapshot: SchemaFormDataV1;
  state: "CALLBACK_ACTIVE" | "LOADING";
}

function sameCanonical(
  left: Readonly<Record<string, SchemaFormValueV1>>,
  right: Readonly<Record<string, SchemaFormValueV1>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && left[key] === right[key]);
}

class Session {
  readonly rootKey: string;
  private canonical: Record<string, SchemaFormValueV1>;
  private errors: Record<string, string> = {};
  private fieldRender: SchemaFormFieldRenderDataV1[];
  private restorePending: boolean;
  private attempt?: SubmitAttempt;
  private nextAttemptIdentity = 1;
  private domain?: RenderDomain;
  private subscription?: SessionEventSubscription;
  private settled = false;
  private resolve!: (value: SchemaFormResultV1) => void;
  private reject!: (cause: unknown) => void;
  readonly result: Promise<SchemaFormResultV1>;
  private readonly abort = (): void => this.finishReject(abortError());

  constructor(
    private readonly scope: SubsystemScope,
    private readonly frame: Frame,
    private readonly request: SchemaFormRequestV1,
    private readonly schema: SchemaFormV1,
    initial: Record<string, SchemaFormValueV1>,
    private readonly validators: CompiledValidators,
    private readonly restoreAllowed: readonly boolean[],
    restorePending: boolean,
    private readonly serial: number,
    private readonly state: RenderDomainState,
  ) {
    this.rootKey = `sf:${serial}`;
    this.canonical = initial;
    this.restorePending = restorePending;
    this.fieldRender = schema.fields.map((field, index) =>
      fieldRenderData(field, initial, {}, restoreAllowed[index]));
    this.result = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  start(): Promise<SchemaFormResultV1> {
    void this.initialize();
    return this.result;
  }

  private async initialize(): Promise<void> {
    try {
      this.domain = this.scope.createRenderDomain(this.state);
      this.subscription = await this.scope.events.subscribe(
        [WEB_PRESENTATION_EVENT_CHANNEL],
        (event: SessionEvent) => this.receive(event),
      );
      if (this.settled) { this.subscription.close(); return; }
      this.frame.signal.addEventListener("abort", this.abort, { once: true });
      if (this.frame.signal.aborted) this.abort();
    } catch (cause) {
      this.finishReject(cause);
    }
  }

  private receive(event: SessionEvent): void {
    const payload = event.payload;
    if (this.settled || event.channel !== WEB_PRESENTATION_EVENT_CHANNEL || !ownDataObject(payload) || payload.targetKey !== this.rootKey) return;
    const data = payload.data;
    if (this.attempt?.state === "LOADING") return;
    if (event.type === "cancel") {
      if (this.request.cancelable === true && isEmptyData(data)) this.finishResolve({ type: "cancelled" });
      return;
    }
    if (event.type === "restore") {
      if (!this.restorePending) return;
      const candidate = validateEventData(data, this.schema);
      if (candidate === null) return;
      try { this.applyRestore(candidate); } catch (cause) { this.finishReject(cause); }
      return;
    }
    if (event.type !== "change" && event.type !== "submit") return;
    if (event.type === "submit" && this.attempt !== undefined) return;
    const candidate = validateEventData(data, this.schema);
    if (candidate === null) return;
    try {
      const consumedRestore = this.consumeRestorePending();
      if (event.type === "change") {
        this.applyCandidate(candidate, this.validators.change, "schema.validateOnChange");
        this.refresh(true, consumedRestore);
      } else {
        this.submitCandidate(candidate, consumedRestore);
      }
    } catch (cause) {
      this.finishReject(cause);
    }
  }

  private applyCandidate(
    candidate: Record<string, SchemaFormValueV1>,
    validator: CompiledValidator | undefined,
    path: "schema.validateOnChange" | "schema.validateOnSubmit",
  ): void {
    const builtIn = builtInErrors(this.schema, candidate);
    const scripted = runValidator(validator, candidate, this.schema, path);
    const errors = { ...scripted, ...builtIn };
    this.canonical = candidate;
    this.errors = errors;
  }

  private submitCandidate(
    candidate: Record<string, SchemaFormValueV1>,
    consumedRestore: boolean,
  ): void {
    const builtIn = builtInErrors(this.schema, candidate);
    const scripted = runValidator(this.validators.submit, candidate, this.schema, "schema.validateOnSubmit");
    const errors = { ...scripted, ...builtIn };
    this.canonical = candidate;
    this.errors = errors;
    if (Object.keys(errors).length !== 0) {
      this.refresh(true, consumedRestore);
      return;
    }
    const snapshot = Object.freeze({ ...candidate });
    if (this.request.onSubmit === undefined) {
      this.finishResolve({ type: "submitted", value: snapshot });
      return;
    }
    this.refresh(true, consumedRestore);
    this.beginSubmitAttempt(snapshot);
  }

  private applyRestore(candidate: Record<string, SchemaFormValueV1>): void {
    if (!this.consumeRestorePending()) return;
    if (sameCanonical(this.canonical, candidate)) {
      this.refresh(false, true);
      return;
    }
    this.applyCandidate(candidate, this.validators.change, "schema.validateOnChange");
    this.refresh(true, true);
  }

  private consumeRestorePending(): boolean {
    if (!this.restorePending) return false;
    this.restorePending = false;
    return true;
  }

  private refresh(fields: boolean, root: boolean): void {
    const optional = ["description", "error", "placeholder", "minLength", "maxLength", "min", "max", "value"];
    const nextRender = this.schema.fields.map((field, index) =>
      fieldRenderData(field, this.canonical, this.errors, this.restoreAllowed[index]));
    const nodes = [];
    if (root) {
      nodes.push({
        key: this.rootKey,
        data: { set: { restorePending: this.restorePending } as never },
      });
    }
    if (fields) {
      nodes.push(...nextRender.map((renderData, index) => {
        const data = renderData as unknown as Record<string, unknown>;
        const previous = this.fieldRender[index] as unknown as Record<string, unknown>;
        const remove = optional.filter((key) => Object.hasOwn(previous, key) && !Object.hasOwn(data, key));
        return {
          key: `sf:${this.serial}:f:${index}`,
          data: {
            set: data as never,
            ...(remove.length === 0 ? {} : { remove }),
          },
        };
      }));
    }
    this.domain?.update({
      nodes,
    });
    if (fields) this.fieldRender = nextRender;
  }

  private beginSubmitAttempt(snapshot: SchemaFormDataV1): void {
    if (!Number.isSafeInteger(this.nextAttemptIdentity)) {
      throw new Error("Schema Form submit attempt identity space exhausted");
    }
    const attempt: SubmitAttempt = {
      identity: this.nextAttemptIdentity,
      snapshot,
      state: "CALLBACK_ACTIVE",
    };
    this.nextAttemptIdentity += 1;
    this.attempt = attempt;
    const control: SchemaFormSubmitControlV1 = Object.freeze({
      setLoading: (): void => this.setLoading(attempt),
      cancelLoading: (): void => this.cancelLoading(attempt),
      sendValidateError: (errors: readonly SchemaFormExternalValidationErrorV1[]): void =>
        this.sendValidateError(attempt, errors),
      close: (): void => this.closeAttempt(attempt),
    });
    let callbackResult: void | Promise<void>;
    try {
      callbackResult = this.request.onSubmit!(snapshot, control);
    } catch (cause) {
      this.finishReject(cause);
      return;
    }
    if (callbackResult === undefined) {
      this.completeAttempt(attempt);
      return;
    }
    void Promise.resolve(callbackResult).then(
      () => this.completeAttempt(attempt),
      (cause) => { if (this.isCurrent(attempt)) this.finishReject(cause); },
    );
  }

  private isCurrent(attempt: SubmitAttempt): boolean {
    return !this.settled && this.attempt === attempt;
  }

  private setLoading(attempt: SubmitAttempt): void {
    if (!this.isCurrent(attempt) || attempt.state === "LOADING") return;
    this.domain?.update({ nodes: [{ key: this.rootKey, attrs: { set: { loading: "true" } } }] });
    attempt.state = "LOADING";
  }

  private cancelLoading(attempt: SubmitAttempt): void {
    if (!this.isCurrent(attempt) || attempt.state !== "LOADING") return;
    this.domain?.update({ nodes: [{ key: this.rootKey, attrs: { remove: ["loading"] } }] });
    attempt.state = "CALLBACK_ACTIVE";
  }

  private sendValidateError(attempt: SubmitAttempt, value: unknown): void {
    if (!this.isCurrent(attempt)) return;
    const errors = validateExternalValidationErrors(value, this.schema);
    if (errors.length === 0) return;
    this.domain?.emit({
      targetKey: this.rootKey,
      name: "validate-error",
      data: { errors: errors.map((error) => ({ ...error })) } as never,
    });
  }

  private closeAttempt(attempt: SubmitAttempt): void {
    if (!this.isCurrent(attempt)) return;
    this.finishResolve({ type: "submitted", value: attempt.snapshot });
  }

  private completeAttempt(attempt: SubmitAttempt): void {
    if (!this.isCurrent(attempt)) return;
    if (attempt.state === "LOADING") {
      try {
        this.domain?.update({ nodes: [{ key: this.rootKey, attrs: { remove: ["loading"] } }] });
      } catch (cause) {
        this.finishReject(cause);
        return;
      }
    }
    if (this.isCurrent(attempt)) this.attempt = undefined;
  }

  private cleanup(): void {
    const operations = [
      () => this.subscription?.close(),
      () => this.domain?.close(),
      () => this.frame.signal.removeEventListener("abort", this.abort),
      () => { if (activeForms.get(this.frame) === this) activeForms.delete(this.frame); },
    ];
    for (const operation of operations) {
      try { operation(); } catch { /* best-effort cleanup */ }
    }
  }

  private finishResolve(value: SchemaFormResultV1): void {
    if (this.settled) return;
    this.settled = true;
    this.attempt = undefined;
    this.cleanup();
    this.resolve(value);
  }

  private finishReject(cause: unknown): void {
    if (this.settled) return;
    this.settled = true;
    this.attempt = undefined;
    this.cleanup();
    this.reject(cause);
  }
}

export async function openSchemaForm(
  scope: SubsystemScope,
  frame: Frame,
  request: SchemaFormRequestV1,
): Promise<SchemaFormResultV1> {
  validateOuter(scope, frame, request);
  const schema = validateSchema((request as SchemaFormRequestV1).schema);
  const initial = validateInitialValue(request.initialValue, schema);
  if (activeForms.has(frame)) {
    throw new SchemaFormError("SCHEMA_FORM_ALREADY_OPEN");
  }
  const validators = compileValidators(schema);
  const serial = allocateSerial();
  const canonical = canonicalInitial(schema, initial);
  const restoreAllowed = schema.fields.map((field) =>
    field.localstorageKey !== undefined && !(initial !== undefined && Object.hasOwn(initial, field.key)));
  const restorePending = restoreAllowed.some(Boolean);
  const state = initialState(schema, canonical, request, restoreAllowed, restorePending, serial);
  const session = new Session(
    scope, frame, request, schema, canonical, validators, restoreAllowed, restorePending, serial, state,
  );
  activeForms.set(frame, session);
  return session.start();
}
