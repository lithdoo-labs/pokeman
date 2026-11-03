import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { live } from "lit/directives/live.js";
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/textarea/textarea.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import "@awesome.me/webawesome/dist/components/option/option.js";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import type { WebPresentationContext } from "@loomrealm/renderer/web-presentation";
import type {
  SchemaFormFieldRenderDataV1,
  SchemaFormPresentationValueV1,
  SchemaFormPresentationValuesV1,
  SchemaFormRenderDataV1,
} from "../src/model.js";

type DataObject = Record<string, unknown>;

function plainData(value: unknown): value is DataObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  const names = Object.getOwnPropertyNames(value);
  return names.length === Object.keys(value).length && names.every((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

function exact(value: DataObject, required: readonly string[], optional: readonly string[]): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
}

function finiteOptional(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function scalarString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function validateRootData(value: unknown): SchemaFormRenderDataV1 {
  if (!plainData(value) || !exact(value, ["cancelable", "fieldCount", "restorePending"], ["title", "description"]) ||
      typeof value.cancelable !== "boolean" ||
      !Number.isInteger(value.fieldCount) || (value.fieldCount as number) < 0 || (value.fieldCount as number) > 128 ||
      typeof value.restorePending !== "boolean" ||
      (value.title !== undefined && !scalarString(value.title)) ||
      (value.description !== undefined && !scalarString(value.description))) {
    throw new TypeError("Invalid Schema Form root RenderData");
  }
  return value as unknown as SchemaFormRenderDataV1;
}

function validateFieldData(value: unknown): SchemaFormFieldRenderDataV1 {
  if (!plainData(value) || typeof value.kind !== "string") throw new TypeError("Invalid Schema Form field RenderData");
  const baseRequired = ["key", "kind", "label", "required", "restoreAllowed"];
  const baseOptional = ["description", "error", "localstorageKey"];
  const kindRequired = value.kind === "string" ? ["value", "multiline"]
    : value.kind === "number" ? ["integer"]
    : value.kind === "boolean" ? ["value"]
    : value.kind === "select" ? ["options"] : [];
  const kindOptional = value.kind === "string" ? ["placeholder", "minLength", "maxLength"]
    : value.kind === "number" ? ["value", "min", "max"]
    : value.kind === "select" ? ["value"] : [];
  if (!["string", "number", "boolean", "select"].includes(value.kind) ||
      !exact(value, [...baseRequired, ...kindRequired], [...baseOptional, ...kindOptional]) ||
      !scalarString(value.key) || !scalarString(value.label) || typeof value.required !== "boolean" ||
      typeof value.restoreAllowed !== "boolean" ||
      (value.localstorageKey !== undefined && (!scalarString(value.localstorageKey) || value.localstorageKey.length === 0 ||
        new TextEncoder().encode(value.localstorageKey).byteLength > 256)) ||
      (value.restoreAllowed === true && value.localstorageKey === undefined) ||
      (value.description !== undefined && !scalarString(value.description)) ||
      (value.error !== undefined && (!scalarString(value.error) || value.error.length === 0))) {
    throw new TypeError("Invalid Schema Form field RenderData");
  }
  if (value.kind === "string") {
    if (!scalarString(value.value) || typeof value.multiline !== "boolean" ||
        (value.placeholder !== undefined && !scalarString(value.placeholder)) ||
        (value.minLength !== undefined && (!Number.isInteger(value.minLength) || (value.minLength as number) < 0)) ||
        (value.maxLength !== undefined && (!Number.isInteger(value.maxLength) || (value.maxLength as number) < 0)) ||
        (typeof value.minLength === "number" && typeof value.maxLength === "number" && value.minLength > value.maxLength)) {
      throw new TypeError("Invalid string field RenderData");
    }
  } else if (value.kind === "number") {
    if (typeof value.integer !== "boolean" || !finiteOptional(value.value) || !finiteOptional(value.min) || !finiteOptional(value.max) ||
        (typeof value.min === "number" && typeof value.max === "number" && value.min > value.max)) {
      throw new TypeError("Invalid number field RenderData");
    }
  } else if (value.kind === "boolean") {
    if (typeof value.value !== "boolean") throw new TypeError("Invalid boolean field RenderData");
  } else {
    if (!Array.isArray(value.options) || (value.value !== undefined && typeof value.value !== "string")) {
      throw new TypeError("Invalid select field RenderData");
    }
    const seen = new Set<string>();
    for (const option of value.options) {
      if (!plainData(option) || !exact(option, ["value", "label"], []) ||
          !scalarString(option.value) || !scalarString(option.label) || seen.has(option.value)) {
        throw new TypeError("Invalid select option RenderData");
      }
      seen.add(option.value);
    }
    if (value.value !== undefined && (!scalarString(value.value) || !seen.has(value.value))) throw new TypeError("Invalid select value RenderData");
  }
  return value as unknown as SchemaFormFieldRenderDataV1;
}

function controlValue(event: Event): string {
  const target = event.currentTarget as HTMLElement & { value?: unknown };
  return typeof target.value === "string" ? target.value : "";
}

function eventFits(data: unknown): boolean {
  try { return new TextEncoder().encode(JSON.stringify(data)).byteLength <= 131_072; } catch { return false; }
}

function denseDataArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
  return value.every((_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

export class SchemaFormFieldElement extends LitElement {
  static styles = css`
    :host { display: block; min-width: 0; max-width: 100%; }
    .field { min-width: 0; display: grid; gap: .35rem; }
    .label { font-weight: 600; overflow-wrap: anywhere; }
    .required { color: var(--wa-color-danger-60); }
    .hint { color: var(--wa-color-neutral-60); font-size: .875rem; overflow-wrap: anywhere; }
    .error { color: var(--wa-color-danger-60); font-size: .875rem; overflow-wrap: anywhere; }
    wa-input, wa-textarea, wa-select { box-sizing: border-box; min-width: 0; width: 100%; max-width: 100%; }
  `;

  private current?: SchemaFormFieldRenderDataV1;
  private displayedError?: string;
  private disabled = false;
  private overrideActive = false;
  private overrideValue: SchemaFormPresentationValueV1 = null;
  private draft = "";
  private dirty = false;

  receiveRenderData(data: Readonly<Record<string, unknown>>): void {
    const validated = validateFieldData(data);
    if (this.current !== undefined && this.current.kind !== validated.kind) throw new TypeError("Schema Form field kind changed");
    if (validated.kind === "number") {
      if (!this.dirty) this.draft = validated.value === undefined ? "" : String(validated.value);
    }
    this.current = validated;
    this.displayedError = validated.error;
    this.overrideActive = false;
    this.requestUpdate();
    const parent = this.parentElement as (HTMLElement & { fieldReady?: (field: SchemaFormFieldElement) => void }) | null;
    if (typeof parent?.fieldReady === "function") parent.fieldReady(this);
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (this.current !== undefined) {
      const parent = this.parentElement as (HTMLElement & { fieldReady?: (field: SchemaFormFieldElement) => void }) | null;
      if (typeof parent?.fieldReady === "function") parent.fieldReady(this);
    }
  }

  hasRenderData(): boolean { return this.current !== undefined; }

  setFormDisabled(disabled: boolean): void {
    if (this.disabled === disabled) return;
    this.disabled = disabled;
    this.requestUpdate();
  }

  setDisplayedError(error: string): void {
    this.displayedError = error;
    this.requestUpdate();
  }

  fieldKey(): string | undefined { return this.current?.key; }

  storageMetadata(): { readonly key: string; readonly restoreAllowed: boolean } | undefined {
    const data = this.current;
    return data?.localstorageKey === undefined
      ? undefined
      : { key: data.localstorageKey, restoreAllowed: data.restoreAllowed };
  }

  renderDataValue(): SchemaFormPresentationValueV1 {
    const data = this.current;
    if (data === undefined) throw new TypeError("Schema Form field has no RenderData");
    if (this.overrideActive) return this.overrideValue;
    if (data.kind === "number" || data.kind === "select") return data.value ?? null;
    return data.value;
  }

  restoredValue(value: unknown): { readonly accepted: boolean; readonly value?: SchemaFormPresentationValueV1 } {
    const data = this.current;
    if (data === undefined) return { accepted: false };
    if (data.kind === "string") return scalarString(value) ? { accepted: true, value } : { accepted: false };
    if (data.kind === "boolean") return typeof value === "boolean" ? { accepted: true, value } : { accepted: false };
    if (data.kind === "number") {
      return value === null || (typeof value === "number" && Number.isFinite(value))
        ? { accepted: true, value: value as number | null }
        : { accepted: false };
    }
    return value === null || (scalarString(value) && data.options.some((option) => option.value === value))
      ? { accepted: true, value: value as string | null }
      : { accepted: false };
  }

  applyRestoredValue(value: SchemaFormPresentationValueV1): void {
    const data = this.current;
    if (data === undefined) return;
    this.overrideActive = true;
    this.overrideValue = value;
    if (data.kind === "number") {
      this.draft = value === null ? "" : String(value);
      this.dirty = false;
    }
    this.requestUpdate();
  }

  readFormValue(): { readonly key: string; readonly value: SchemaFormPresentationValueV1 } {
    const data = this.current;
    if (data === undefined) throw new TypeError("Schema Form field has no RenderData");
    if (data.kind === "string") {
      const control = this.renderRoot.querySelector("wa-input, wa-textarea") as (HTMLElement & { value?: unknown }) | null;
      return { key: data.key, value: typeof control?.value === "string" ? control.value : this.renderDataValue() };
    }
    if (data.kind === "boolean") {
      const control = this.renderRoot.querySelector("wa-checkbox") as (HTMLElement & { checked?: unknown }) | null;
      return { key: data.key, value: typeof control?.checked === "boolean" ? control.checked : this.renderDataValue() };
    }
    if (data.kind === "number") {
      const lexical = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
      if (!lexical.test(this.draft)) return { key: data.key, value: null };
      const parsed = Number(this.draft);
      return { key: data.key, value: Number.isFinite(parsed) ? parsed : null };
    }
    const control = this.renderRoot.querySelector("wa-select") as (HTMLElement & { value?: unknown }) | null;
    const token = typeof control?.value === "string" ? control.value : "";
    if (control === null) return { key: data.key, value: this.renderDataValue() };
    if (token === "") return { key: data.key, value: null };
    const match = /^o:(0|[1-9][0-9]*)$/.exec(token);
    const index = match === null ? -1 : Number(match[1]);
    return { key: data.key, value: data.options[index]?.value ?? null };
  }

  private changed(event: Event): void {
    const data = this.current;
    const parent = this.parentElement as (HTMLElement & {
      fieldChanged?: (field: SchemaFormFieldElement) => void;
      interactionDisabled?: () => boolean;
    }) | null;
    if (data === undefined || this.disabled || parent?.interactionDisabled?.() === true) return;
    if (data.kind === "number") {
      this.draft = controlValue(event);
      this.dirty = true;
    }
    const currentValue = this.readFormValue().value;
    this.overrideActive = true;
    this.overrideValue = currentValue;
    this.displayedError = undefined;
    this.requestUpdate();
    if (typeof parent?.fieldChanged === "function") parent.fieldChanged(this);
  }

  protected render(): TemplateResult {
    const data = this.current;
    if (data === undefined) return html``;
    const displayValue = this.renderDataValue();
    return html`
      <div class="field">
        <div class="label">${data.label}${data.required ? html`<span class="required"> *</span>` : nothing}</div>
        ${data.kind === "string" && !data.multiline ? html`
          <wa-input .value=${live(displayValue as string)} .placeholder=${data.placeholder ?? ""} .disabled=${this.disabled} @input=${this.changed}></wa-input>
        ` : nothing}
        ${data.kind === "string" && data.multiline ? html`
          <wa-textarea .value=${live(displayValue as string)} .placeholder=${data.placeholder ?? ""} .disabled=${this.disabled} @input=${this.changed}></wa-textarea>
        ` : nothing}
        ${data.kind === "number" ? html`
          <wa-input type="text" inputmode="decimal" .value=${live(this.draft)} .disabled=${this.disabled} @input=${this.changed}></wa-input>
        ` : nothing}
        ${data.kind === "boolean" ? html`
          <wa-checkbox .checked=${live(displayValue as boolean)} .disabled=${this.disabled} @change=${this.changed}></wa-checkbox>
        ` : nothing}
        ${data.kind === "select" ? html`
          <wa-select with-clear .value=${live(displayValue === null ? "" : `o:${data.options.findIndex((option) => option.value === displayValue)}`)} .disabled=${this.disabled} @change=${this.changed}>
            ${data.options.map((option, index) => html`<wa-option value=${`o:${index}`}>${option.label}</wa-option>`)}
          </wa-select>
        ` : nothing}
        ${data.description === undefined ? nothing : html`<div class="hint">${data.description}</div>`}
        ${this.displayedError === undefined ? nothing : html`<div class="error" role="alert">${this.displayedError}</div>`}
      </div>
    `;
  }
}

export class SchemaFormElement extends LitElement {
  static get observedAttributes(): string[] {
    return [...new Set([...super.observedAttributes, "loading"])];
  }

  static styles = css`
    wa-dialog { --width: min(600px, 80vw); --spacing: 0; }
    wa-dialog::part(body) { padding: 0; overflow: hidden; }
    .shell {
      box-sizing: border-box;
      min-width: 0;
      min-height: 0;
      width: 100%;
      max-width: 100%;
      max-height: 80vh;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }
    header, footer { min-width: 0; display: flex; align-items: center; gap: .75rem; padding: 1rem; }
    header { justify-content: space-between; border-bottom: 1px solid var(--wa-color-neutral-30); }
    header h2 { min-width: 0; margin: 0; overflow-wrap: anywhere; }
    .body {
      min-width: 0;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 1rem;
    }
    .description { min-width: 0; margin: 0 0 1rem; color: var(--wa-color-neutral-60); overflow-wrap: anywhere; }
    ::slotted(lr-schema-form-field) { min-width: 0; max-width: 100%; margin-bottom: 1rem; }
    footer { justify-content: flex-end; border-top: 1px solid var(--wa-color-neutral-30); }
    .size-error { min-width: 0; color: var(--wa-color-danger-60); margin-right: auto; overflow-wrap: anywhere; }
  `;

  private context?: WebPresentationContext;
  private current?: SchemaFormRenderDataV1;
  private sizeError = false;
  private restoreAttempted = false;
  private restoreBarrier = false;
  private previousFocus?: HTMLElement;

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "loading" && oldValue !== newValue) {
      this.syncDisabled();
      this.requestUpdate();
    }
  }

  connectedCallback(): void {
    const active = document.activeElement;
    this.previousFocus = active instanceof HTMLElement && active !== document.body && active !== document.documentElement
      ? active
      : undefined;
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    const previousFocus = this.previousFocus;
    this.previousFocus = undefined;
    super.disconnectedCallback();
    queueMicrotask(() => {
      if (previousFocus === undefined || !previousFocus.isConnected ||
          previousFocus.matches(":disabled, [inert], [hidden]") || previousFocus.closest("[inert]") !== null ||
          previousFocus.getClientRects().length === 0) return;
      try { previousFocus.focus({ preventScroll: true }); } catch { /* detached or no longer focusable */ }
    });
  }

  receiveRenderContext(context: WebPresentationContext): void {
    if (context === null || typeof context !== "object" || typeof context.emitCustomEvent !== "function") {
      throw new TypeError("Invalid WebPresentationContext");
    }
    this.context = context;
  }

  receiveRenderData(data: Readonly<Record<string, unknown>>): void {
    const validated = validateRootData(data);
    this.current = validated;
    this.restoreBarrier = validated.restorePending && !this.restoreAttempted;
    this.syncDisabled();
    this.maybeRestore();
    this.requestUpdate();
  }

  receiveRenderEvent(event: Readonly<{ readonly name: string; readonly data: Readonly<Record<string, unknown>> }>): void {
    if (event === null || typeof event !== "object" || event.name !== "validate-error") return;
    const data = event.data;
    if (!plainData(data) || !exact(data, ["errors"], []) || !denseDataArray(data.errors) || !eventFits(data)) {
      throw new TypeError("Invalid Schema Form validate-error event");
    }
    const fields = this.directFields();
    const byKey = new Map(fields.map((field) => [field.fieldKey(), field]));
    const seen = new Set<string>();
    const updates: Array<{ field: SchemaFormFieldElement; error: string }> = [];
    for (const entry of data.errors) {
      if (!plainData(entry) || !exact(entry, ["field", "errorMsg"], []) ||
          !scalarString(entry.field) || seen.has(entry.field) ||
          !scalarString(entry.errorMsg) || entry.errorMsg.length === 0) {
        throw new TypeError("Invalid Schema Form validate-error event");
      }
      const field = byKey.get(entry.field);
      if (field === undefined) throw new TypeError("Invalid Schema Form validate-error field");
      seen.add(entry.field);
      updates.push({ field, error: entry.errorMsg });
    }
    for (const update of updates) update.field.setDisplayedError(update.error);
  }

  interactionDisabled(): boolean {
    return this.getAttribute("loading") === "true" || this.restoreBarrier;
  }

  private directFields(): SchemaFormFieldElement[] {
    return Array.from(this.children).filter((child): child is SchemaFormFieldElement =>
      child instanceof SchemaFormFieldElement);
  }

  private syncDisabled(): void {
    const disabled = this.interactionDisabled();
    for (const field of this.directFields()) field.setFormDisabled(disabled);
  }

  fieldReady(field: SchemaFormFieldElement): void {
    if (field.parentElement !== this) return;
    field.setFormDisabled(this.interactionDisabled());
    this.maybeRestore();
  }

  protected updated(): void { this.syncDisabled(); }

  private maybeRestore(): void {
    const data = this.current;
    if (data?.restorePending !== true || this.restoreAttempted) return;
    const fields = this.directFields();
    if (fields.length !== data.fieldCount || fields.some((field) => !field.hasRenderData())) return;
    this.restoreAttempted = true;
    const baseline: Record<string, SchemaFormPresentationValueV1> = {};
    for (const field of fields) {
      const entry = field.readFormValue();
      Object.defineProperty(baseline, entry.key, { value: field.renderDataValue(), enumerable: true, writable: true, configurable: true });
    }
    const candidate: Record<string, SchemaFormPresentationValueV1> = { ...baseline };
    const substitutions = new Map<SchemaFormFieldElement, SchemaFormPresentationValueV1>();
    for (const field of fields) {
      const metadata = field.storageMetadata();
      if (metadata === undefined || !metadata.restoreAllowed) continue;
      try {
        const stored = globalThis.localStorage.getItem(metadata.key);
        if (stored === null) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(stored); } catch { continue; }
        const restored = field.restoredValue(parsed);
        if (!restored.accepted) continue;
        const value = restored.value as SchemaFormPresentationValueV1;
        const key = field.fieldKey();
        if (key === undefined) continue;
        Object.defineProperty(candidate, key, { value, enumerable: true, writable: true, configurable: true });
        substitutions.set(field, value);
      } catch { /* Browser-local storage is best effort. */ }
    }
    let accepted = candidate;
    if (!eventFits({ values: candidate })) {
      accepted = baseline;
      substitutions.clear();
    }
    if (eventFits({ values: accepted })) {
      for (const [field, value] of substitutions) field.applyRestoredValue(value);
      try {
        this.context?.emitCustomEvent("restore", { values: accepted });
      } finally {
        this.restoreBarrier = false;
        this.syncDisabled();
        this.requestUpdate();
      }
      return;
    }
    this.restoreBarrier = false;
    this.syncDisabled();
    this.requestUpdate();
  }

  fieldChanged(field: SchemaFormFieldElement): void {
    if (field.parentElement !== this || this.interactionDisabled()) return;
    this.emitSnapshot("change");
  }

  collectValues(): SchemaFormPresentationValuesV1 {
    const values: Record<string, SchemaFormPresentationValueV1> = {};
    for (const child of Array.from(this.children)) {
      if (!(child instanceof SchemaFormFieldElement)) continue;
      const entry = child.readFormValue();
      Object.defineProperty(values, entry.key, { value: entry.value, enumerable: true, configurable: true, writable: true });
    }
    return values;
  }

  submit(): void {
    if (this.interactionDisabled()) return;
    this.emitSnapshot("submit");
  }

  cancel(): void {
    if (!this.interactionDisabled() && this.current?.cancelable === true) this.context?.emitCustomEvent("cancel");
  }

  private emitSnapshot(name: "change" | "submit"): void {
    const data = { values: this.collectValues() };
    const fits = eventFits(data);
    if (!fits) {
      this.sizeError = true;
      this.requestUpdate();
      return;
    }
    if (this.sizeError) {
      this.sizeError = false;
      this.requestUpdate();
    }
    if (name === "submit") this.saveDraft(data.values);
    this.context?.emitCustomEvent(name, data);
  }

  private saveDraft(values: SchemaFormPresentationValuesV1): void {
    for (const field of this.directFields()) {
      const metadata = field.storageMetadata();
      const key = field.fieldKey();
      if (metadata === undefined || key === undefined) continue;
      try { globalThis.localStorage.setItem(metadata.key, JSON.stringify(values[key])); } catch { /* best effort */ }
    }
  }

  private hideRequested(event: Event): void {
    event.preventDefault();
    if (!this.interactionDisabled() && this.current?.cancelable === true) this.cancel();
  }

  private stop(event: Event): void { event.stopPropagation(); }

  protected render(): TemplateResult {
    const data = this.current;
    const cancelable = data?.cancelable === true;
    const disabled = this.interactionDisabled();
    const loading = this.getAttribute("loading") === "true";
    return html`
      <wa-dialog open without-header .label=${data?.title ?? "Form"} @wa-hide=${this.hideRequested}
        @keydown=${this.stop} @keyup=${this.stop}
        @pointerdown=${this.stop} @pointermove=${this.stop} @pointerup=${this.stop} @pointercancel=${this.stop}
        @click=${this.stop}>
        <form class="shell" novalidate @submit=${(event: Event) => { event.preventDefault(); this.submit(); }}>
          <header>
            <h2>${data?.title ?? ""}</h2>
            ${cancelable ? html`<wa-button type="button" aria-label="Close" .disabled=${disabled} @click=${this.cancel}>Close</wa-button>` : nothing}
          </header>
          <div class="body">
            ${data?.description === undefined ? nothing : html`<p class="description">${data.description}</p>`}
            <slot></slot>
          </div>
          <footer>
            ${this.sizeError ? html`<div class="size-error" role="alert">Form data is too large</div>` : nothing}
            ${cancelable ? html`<wa-button type="button" .disabled=${disabled} @click=${this.cancel}>Cancel</wa-button>` : nothing}
            <wa-button type="submit" variant="brand" .disabled=${disabled} .loading=${loading}>Submit</wa-button>
          </footer>
        </form>
      </wa-dialog>
    `;
  }
}

if (customElements.get("lr-schema-form") !== undefined || customElements.get("lr-schema-form-field") !== undefined) {
  throw new TypeError("Schema Form custom element collision");
}
customElements.define("lr-schema-form-field", SchemaFormFieldElement);
customElements.define("lr-schema-form", SchemaFormElement);
