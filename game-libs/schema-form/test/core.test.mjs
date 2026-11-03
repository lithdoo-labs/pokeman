import assert from "node:assert/strict";
import test from "node:test";
import {
  SchemaFormError,
  openSchemaForm,
} from "../dist/index.js";

const baseSchema = (fields = []) => ({ version: 1, fields });
const stringField = (overrides = {}) => ({ key: "text", kind: "string", label: "Text", ...overrides });

function harness(overrides = {}) {
  const abort = new AbortController();
  const domains = [];
  const listeners = [];
  const updates = [];
  const emits = [];
  const sequence = [];
  let handler;
  const frame = {
    id: "frame",
    params: null,
    signal: abort.signal,
    async call() { throw new Error("not used"); },
  };
  const scope = {
    createRenderDomain(state) {
      if (overrides.renderFailure) throw overrides.renderFailure;
      const domain = {
        state,
        closed: 0,
        replace() {},
        update(update) {
          updates.push(update);
          sequence.push({ type: "update", value: update });
          if (overrides.updateFailure) throw overrides.updateFailure;
        },
        emit(event) {
          emits.push(event);
          sequence.push({ type: "emit", value: event });
          if (overrides.emitFailure) throw overrides.emitFailure;
        },
        close() { domain.closed += 1; if (overrides.closeDomainFailure) throw overrides.closeDomainFailure; },
      };
      domains.push(domain);
      return domain;
    },
    events: { async subscribe(options, next) {
      if (overrides.listenerFailure) throw overrides.listenerFailure;
      handler = next;
      const listener = {
        options,
        closed: 0,
        closedPromise: new Promise(() => {}),
        close() { handler = undefined; listener.closed += 1; if (overrides.closeListenerFailure) throw overrides.closeListenerFailure; },
      };
      listeners.push(listener);
      return { closed: listener.closedPromise, close: listener.close };
    } },
  };
  return {
    abort, domains, emits, frame, listeners, scope, sequence, updates,
    event(name, data = {}, targetKey = domains[0]?.state.roots[0].key) {
      handler?.({ channel: "x.loomrealm.web-presentation.event", type: name,
        payload: { domainId: "ignored", targetKey, data }, source: { subsystemKey: "form" } });
    },
  };
}

async function rejectedWithoutSync(scope, frame, request) {
  let promise;
  assert.doesNotThrow(() => { promise = openSchemaForm(scope, frame, request); });
  await assert.rejects(promise);
}

test("SchemaFormError exposes frozen public shape", () => {
  const cause = new Error("cause");
  const error = new SchemaFormError("SCHEMA_FORM_INVALID_SCHEMA", undefined, "schema", { cause });
  assert.equal(error.name, "SchemaFormError");
  assert.equal(error.message, "SCHEMA_FORM_INVALID_SCHEMA");
  assert.equal(error.code, "SCHEMA_FORM_INVALID_SCHEMA");
  assert.equal(error.path, "schema");
  assert.equal(error.cause, cause);
});

test("outer failures are Promise TypeError rejections", async () => {
  const h = harness();
  await rejectedWithoutSync(null, h.frame, { schema: baseSchema() });
  await rejectedWithoutSync(h.scope, null, { schema: baseSchema() });
  await rejectedWithoutSync(h.scope, h.frame, null);
  await assert.rejects(openSchemaForm(h.scope, h.frame, { schema: baseSchema(), cancelable: "yes" }), TypeError);
  assert.equal(h.domains.length, 0);
  assert.equal(h.listeners.length, 0);
});

test("closed schema validation covers field kinds and boundary declarations", async () => {
  const valid = baseSchema([
    stringField({ key: "", label: "bad" }),
  ]);
  await assert.rejects(openSchemaForm(harness().scope, harness().frame, { schema: valid }), { code: "SCHEMA_FORM_INVALID_SCHEMA", path: "schema.fields[0].key" });

  for (const [schema, path] of [
    [{ version: 2, fields: [] }, "schema"],
    [{ version: 1, fields: [], extra: true }, "schema.extra"],
    [baseSchema([stringField({ extra: true })]), "schema.fields[0].extra"],
    [baseSchema([stringField(), stringField()]), "schema.fields[1].key"],
    [baseSchema([{ key: "x", kind: "future", label: "" }]), "schema.fields[0].kind"],
    [baseSchema([{ key: "x", kind: "select", label: "", options: [{ value: "a", label: "", extra: 1 }] }]), "schema.fields[0].options[0].extra"],
    [baseSchema([{ key: "x", kind: "string", label: "", minLength: 2, maxLength: 1 }]), "schema.fields[0].minLength"],
    [baseSchema([{ key: "x", kind: "number", label: "", default: Infinity }]), "schema.fields[0].default"],
  ]) {
    const h = harness();
    await assert.rejects(openSchemaForm(h.scope, h.frame, { schema }), { code: "SCHEMA_FORM_INVALID_SCHEMA", path });
    assert.equal(h.domains.length, 0);
  }

  const longKey = "😀".repeat(32);
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, {
    schema: baseSchema([
      stringField({ key: longKey, label: "", description: "", placeholder: "", default: "" }),
      { key: "n", kind: "number", label: "", default: 0, min: 0, max: 1, integer: true },
      { key: "b", kind: "boolean", label: "", default: false, required: true },
      { key: "s", kind: "select", label: "", default: "", options: [{ value: "", label: "" }] },
    ]),
    cancelable: true,
  });
  assert.equal(h.domains[0].state.roots[0].children.length, 4);
  assert.deepEqual(h.domains[0].state.roots[0].children.map((node) => node.key).slice(0, 2), [
    h.domains[0].state.roots[0].key + ":f:0",
    h.domains[0].state.roots[0].key + ":f:1",
  ]);
  assert.equal(h.domains[0].state.roots[0].children[0].key.includes(longKey), false);
  h.event("cancel");
  assert.deepEqual(await pending, { type: "cancelled" });
});

test("schema accepts 0/128 fields, empty options, byte budget and Unicode boundaries", async () => {
  for (const fields of [[], Array.from({ length: 128 }, (_, index) => stringField({ key: `f${index}` }))]) {
    const h = harness();
    const pending = openSchemaForm(h.scope, h.frame, { schema: baseSchema(fields), cancelable: true });
    h.event("cancel");
    await pending;
  }
  await assert.rejects(openSchemaForm(harness().scope, harness().frame, {
    schema: baseSchema(Array.from({ length: 129 }, (_, index) => stringField({ key: `f${index}` }))),
  }), { code: "SCHEMA_FORM_INVALID_SCHEMA", path: "schema" });
  const emptyOptions = harness();
  const emptyPending = openSchemaForm(emptyOptions.scope, emptyOptions.frame, {
    schema: baseSchema([{ key: "s", kind: "select", label: "", options: [] }]), cancelable: true,
  });
  emptyOptions.event("cancel");
  await emptyPending;

  await assert.rejects(openSchemaForm(harness().scope, harness().frame, { schema: baseSchema([stringField({ key: "\ud800" })]) }), {
    code: "SCHEMA_FORM_INVALID_SCHEMA", path: "schema.fields[0].key",
  });
  await assert.rejects(openSchemaForm(harness().scope, harness().frame, { schema: baseSchema([stringField({ key: "a".repeat(129) })]) }), {
    code: "SCHEMA_FORM_INVALID_SCHEMA", path: "schema.fields[0].key",
  });

  const exact = { version: 1, title: "", fields: [] };
  exact.title = "x".repeat(65_536 - Buffer.byteLength(JSON.stringify(exact)));
  assert.equal(Buffer.byteLength(JSON.stringify(exact)), 65_536);
  const exactHarness = harness();
  const exactPending = openSchemaForm(exactHarness.scope, exactHarness.frame, { schema: exact, cancelable: true });
  exactHarness.event("cancel");
  await exactPending;
  await assert.rejects(openSchemaForm(harness().scope, harness().frame, { schema: { ...exact, title: exact.title + "x" } }), {
    code: "SCHEMA_FORM_INVALID_SCHEMA", path: "schema",
  });
});

test("initial value validation and canonical precedence preserve false, zero and empty string", async () => {
  const schema = baseSchema([
    stringField({ default: "default" }),
    { key: "n", kind: "number", label: "N", default: 9 },
    { key: "b", kind: "boolean", label: "B", default: true },
    { key: "s", kind: "select", label: "S", default: "x", options: [{ value: "", label: "Empty" }, { value: "x", label: "X" }] },
  ]);
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, { schema, initialValue: { text: "", n: 0, b: false, s: "" } });
  h.event("submit", { values: { text: "", n: 0, b: false, s: "" } });
  assert.deepEqual(await pending, { type: "submitted", value: { text: "", n: 0, b: false, s: "" } });

  for (const initialValue of [{ extra: 1 }, { n: NaN }, { b: 0 }, { s: "no" }]) {
    const failure = harness();
    await assert.rejects(openSchemaForm(failure.scope, failure.frame, { schema, initialValue }), { code: "SCHEMA_FORM_INVALID_INITIAL_VALUE" });
    assert.equal(failure.domains.length, 0);
  }
  const initial = { text: "" };
  initial.text = "x".repeat(65_536 - Buffer.byteLength(JSON.stringify(initial)));
  const boundarySchema = baseSchema([stringField()]);
  const boundary = harness();
  const open = openSchemaForm(boundary.scope, boundary.frame, { schema: boundarySchema, initialValue: initial, cancelable: true });
  boundary.event("cancel");
  await open;
  await assert.rejects(openSchemaForm(harness().scope, harness().frame, { schema: boundarySchema, initialValue: { text: initial.text + "x" } }), {
    code: "SCHEMA_FORM_INVALID_INITIAL_VALUE", path: "initialValue",
  });
});

test("prototype-like field keys remain own data properties through validation and submission", async () => {
  const keys = ["constructor", "toString", "__proto__"];
  const ownValues = (values) => Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  const schema = {
    ...baseSchema(keys.map((key) => stringField({ key, label: key, required: true }))),
    validateOnChange: `(data) => {
      for (const key of ["constructor", "toString", "__proto__"]) {
        if (!Object.hasOwn(data, key)) throw new Error("missing own key");
      }
      return data.toString === "script"
        ? Object.fromEntries([
            ["constructor", "Scripted constructor error"],
            ["toString", "Scripted toString error"],
            ["__proto__", "Scripted __proto__ error"],
          ])
        : null;
    }`,
  };
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, {
    schema,
    initialValue: ownValues(["initial-constructor", "initial-toString", "initial-proto"]),
  });
  const initialFields = h.domains[0].state.roots[0].children.map((node) => node.data);
  assert.deepEqual(initialFields.map((data) => data.value), ["initial-constructor", "initial-toString", "initial-proto"]);
  assert.ok(initialFields.every((data) => !Object.hasOwn(data, "error")), "prototype properties must not become phantom errors");

  h.event("change", { values: ownValues(["", "", ""]) });
  const builtIn = h.updates.at(-1).nodes.map((node) => node.data.set);
  assert.deepEqual(builtIn.map((data) => data.error), ["Required", "Required", "Required"]);

  h.event("change", { values: ownValues(["valid", "script", "valid"]) });
  const scripted = h.updates.at(-1).nodes;
  assert.deepEqual(scripted.map((node) => node.data.set.error), [
    "Scripted constructor error",
    "Scripted toString error",
    "Scripted __proto__ error",
  ]);

  h.event("change", { values: ownValues(["clean-constructor", "clean-toString", "clean-proto"]) });
  const cleared = h.updates.at(-1).nodes;
  assert.ok(cleared.every((node) => node.data.remove.includes("error")));
  assert.ok(cleared.every((node) => !Object.hasOwn(node.data.set, "error")));

  h.event("submit", { values: ownValues(["submitted-constructor", "submitted-toString", "submitted-proto"]) });
  const result = await pending;
  assert.equal(result.type, "submitted");
  for (const key of keys) assert.equal(Object.hasOwn(result.value, key), true);
  assert.equal(result.value.constructor, "submitted-constructor");
  assert.equal(result.value.toString, "submitted-toString");
  assert.equal(result.value.__proto__, "submitted-proto");
  assert.equal(Object.getPrototypeOf(result.value), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test("required is interaction-only and built-in text/precedence are exact", async () => {
  const schema = baseSchema([
    stringField({ required: true, minLength: 2, maxLength: 3 }),
    { key: "n", kind: "number", label: "N", required: true, min: 2, max: 3, integer: true },
    { key: "s", kind: "select", label: "S", required: true, options: [] },
  ]);
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, { schema, cancelable: true });
  h.event("change", { values: { text: "", n: null, s: null } });
  const data = h.updates.at(-1).nodes.map((node) => node.data.set);
  assert.equal(data[0].error, "Required");
  assert.equal(data[1].error, "Required");
  assert.equal(data[2].error, "Required");
  h.event("change", { values: { text: "a", n: 1, s: null } });
  const next = h.updates.at(-1).nodes.map((node) => node.data.set);
  assert.equal(next[0].error, "Must be at least 2 characters");
  assert.equal(next[1].error, "Must be at least 2");
  h.event("cancel");
  await pending;
});

test("validators compile and execute synchronously with detached frozen snapshots", async () => {
  for (const source of ["(", "42"]) {
    const h = harness();
    await assert.rejects(openSchemaForm(h.scope, h.frame, { schema: { ...baseSchema(), validateOnSubmit: source } }), {
      code: "SCHEMA_FORM_VALIDATOR_FAILED", path: "schema.validateOnSubmit",
    });
    assert.equal(h.domains.length, 0);
  }
  const schema = {
    ...baseSchema([stringField({ required: true }), { key: "other", kind: "string", label: "Other" }]),
    validateOnChange: `(data) => { if (!Object.isFrozen(data)) throw new Error("not frozen"); return { text: "script", other: "cross" }; }`,
    validateOnSubmit: `() => Promise.resolve(null)`,
  };
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, { schema, cancelable: true });
  h.event("change", { values: { text: "", other: "ok" } });
  const latest = h.updates.at(-1).nodes.map((node) => node.data.set);
  assert.equal(latest[0].value, "");
  assert.equal(latest[0].error, "Required");
  assert.equal(latest[1].error, "cross");
  h.event("submit", { values: { text: "ok", other: "ok" } });
  await assert.rejects(pending, { code: "SCHEMA_FORM_INVALID_VALIDATOR_RESULT", path: "schema.validateOnSubmit" });
  assert.equal(h.domains[0].closed, 1);
  assert.equal(h.listeners[0].closed, 1);
});

test("validator result shape and error-map byte budget fail closed", async () => {
  const invalidSources = [
    `() => "error"`, `() => false`, `() => []`, `() => ({ text: 1 })`,
    `() => ({ unknown: "bad" })`, `() => ({ text: "" })`,
    `() => Object.create({ inherited: "bad" })`,
    `() => { const x = {}; Object.defineProperty(x, "text", { get() { return "bad"; }, enumerable: true }); return x; }`,
  ];
  for (const source of invalidSources) {
    const h = harness();
    const pending = openSchemaForm(h.scope, h.frame, { schema: { ...baseSchema([stringField()]), validateOnSubmit: source } });
    h.event("submit", { values: { text: "x" } });
    await assert.rejects(pending, { code: "SCHEMA_FORM_INVALID_VALIDATOR_RESULT" });
  }
  const empty = { text: "" };
  const exactLength = 65_536 - Buffer.byteLength(JSON.stringify(empty));
  const pass = harness();
  const passPending = openSchemaForm(pass.scope, pass.frame, {
    schema: { ...baseSchema([stringField()]), validateOnSubmit: `() => ({ text: "x".repeat(${exactLength}) })` },
    cancelable: true,
  });
  pass.event("submit", { values: { text: "x" } });
  assert.equal(pass.updates.at(-1).nodes[0].data.set.error.length, exactLength);
  pass.event("cancel");
  await passPending;
  const over = harness();
  const overPending = openSchemaForm(over.scope, over.frame, {
    schema: { ...baseSchema([stringField()]), validateOnSubmit: `() => ({ text: "x".repeat(${exactLength + 1}) })` },
  });
  over.event("submit", { values: { text: "x" } });
  await assert.rejects(overPending, { code: "SCHEMA_FORM_INVALID_VALIDATOR_RESULT" });
});

test("one active form, cancel, abort, cleanup failures and registration release", async () => {
  const h = harness({ closeDomainFailure: new Error("domain cleanup"), closeListenerFailure: new Error("listener cleanup") });
  const first = openSchemaForm(h.scope, h.frame, { schema: baseSchema(), cancelable: true });
  await assert.rejects(openSchemaForm(h.scope, h.frame, { schema: baseSchema(), validateOnSubmit: "(" }), {
    code: "SCHEMA_FORM_ALREADY_OPEN", path: undefined,
  });
  h.event("cancel");
  assert.deepEqual(await first, { type: "cancelled" });
  const reopened = openSchemaForm(h.scope, h.frame, { schema: baseSchema(), cancelable: true });
  h.abort.abort();
  await assert.rejects(reopened, { name: "AbortError" });
  assert.equal(h.domains.at(-1).closed, 1);
  assert.equal(h.listeners.at(-1).closed, 1);
});

test("resource creation failure cleans partial state and allows reopen", async () => {
  const failure = new Error("listener creation");
  const h = harness({ listenerFailure: failure });
  await assert.rejects(openSchemaForm(h.scope, h.frame, { schema: baseSchema() }), failure);
  assert.equal(h.domains[0].closed, 1);
  const good = harness();
  good.frame = h.frame;
  const pending = openSchemaForm(good.scope, h.frame, { schema: baseSchema(), cancelable: true });
  good.event("cancel");
  await pending;
});

test("malformed snapshots, wrong targets and over-limit events cause zero mutation", async () => {
  const schema = baseSchema([
    stringField(),
    { key: "n", kind: "number", label: "N" },
    { key: "b", kind: "boolean", label: "B" },
    { key: "s", kind: "select", label: "S", options: [{ value: "", label: "Empty" }] },
  ]);
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, { schema, cancelable: true });
  for (const [data, target] of [
    [{ values: { text: "x", n: null, b: false } }],
    [{ values: { text: "x", n: null, b: false, s: null, extra: 1 } }],
    [{ values: { text: null, n: null, b: false, s: null } }],
    [{ values: { text: "x", n: Infinity, b: false, s: null } }],
    [{ values: { text: "x", n: null, b: false, s: "bad" } }],
    [{ values: { text: "x", n: null, b: false, s: null } }, "wrong"],
  ]) h.event("change", data, target);
  assert.equal(h.updates.length, 0);

  const exact = { values: { text: "", n: null, b: false, s: null } };
  exact.values.text = "x".repeat(131_072 - Buffer.byteLength(JSON.stringify(exact)));
  h.event("change", exact);
  assert.equal(h.updates.length, 1);
  h.event("change", { values: { ...exact.values, text: exact.values.text + "x" } });
  assert.equal(h.updates.length, 1);
  h.event("cancel");
  await pending;
});

test("Submit is independent from Change and projection removes unset values", async () => {
  const schema = baseSchema([
    stringField(), { key: "n", kind: "number", label: "N", default: 1 },
    { key: "b", kind: "boolean", label: "B" },
    { key: "s", kind: "select", label: "S", options: [{ value: "", label: "Empty" }] },
  ]);
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, { schema });
  const initial = h.domains[0].state;
  assert.equal(initial.zIndex, 2_147_483_647);
  assert.equal(initial.roots[0].children[0].data.value, "");
  assert.equal(initial.roots[0].children[2].data.value, false);
  assert.equal(Object.hasOwn(initial.roots[0].children[3].data, "value"), false);
  h.event("change", { values: { text: "old", n: 2, b: true, s: "" } });
  h.event("change", { values: { text: "old", n: null, b: true, s: null } });
  assert.ok(h.updates.at(-1).nodes[1].data.remove.includes("value"));
  assert.ok(h.updates.at(-1).nodes[3].data.remove.includes("value"));
  h.event("submit", { values: { text: "fresh", n: 0, b: false, s: "" } });
  const result = await pending;
  assert.deepEqual(result, { type: "submitted", value: { text: "fresh", n: 0, b: false, s: "" } });
  assert.equal(Object.isFrozen(result.value), true);
  h.event("submit", { values: { text: "duplicate", n: null, b: false, s: null } });
  assert.equal(h.domains[0].closed, 1);
});

test("V1 accepts localstorageKey and onSubmit while rejecting invalid declarations", async () => {
  for (const [field, path] of [
    [stringField({ localstorageKey: "" }), "schema.fields[0].localstorageKey"],
    [stringField({ localstorageKey: 1 }), "schema.fields[0].localstorageKey"],
    [stringField({ localstorageKey: "x".repeat(257) }), "schema.fields[0].localstorageKey"],
  ]) {
    await assert.rejects(openSchemaForm(harness().scope, harness().frame, {
      schema: baseSchema([field]),
    }), { code: "SCHEMA_FORM_INVALID_SCHEMA", path });
  }
  await assert.rejects(openSchemaForm(harness().scope, harness().frame, {
    schema: baseSchema([
      stringField({ key: "a", localstorageKey: "shared" }),
      stringField({ key: "b", localstorageKey: "shared" }),
    ]),
  }), { code: "SCHEMA_FORM_INVALID_SCHEMA", path: "schema.fields[1].localstorageKey" });
  await assert.rejects(openSchemaForm(harness().scope, harness().frame, {
    schema: baseSchema(), onSubmit: true,
  }), TypeError);

  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, {
    schema: baseSchema([
      stringField({ localstorageKey: "draft.text" }),
      { key: "n", kind: "number", label: "N", localstorageKey: "draft.number" },
      { key: "b", kind: "boolean", label: "B", localstorageKey: "draft.boolean" },
      { key: "s", kind: "select", label: "S", localstorageKey: "draft.select", options: [] },
    ]),
    initialValue: { text: "", n: 0, b: false },
    cancelable: true,
    onSubmit() {},
  });
  const root = h.domains[0].state.roots[0];
  assert.deepEqual(root.data, { cancelable: true, fieldCount: 4, restorePending: true });
  assert.deepEqual(root.children.map((node) => ({
    restoreAllowed: node.data.restoreAllowed,
    localstorageKey: node.data.localstorageKey,
  })), [
    { restoreAllowed: false, localstorageKey: "draft.text" },
    { restoreAllowed: false, localstorageKey: "draft.number" },
    { restoreAllowed: false, localstorageKey: "draft.boolean" },
    { restoreAllowed: true, localstorageKey: "draft.select" },
  ]);
  h.event("cancel");
  await pending;
});

test("caller-controlled sync close is the only success settlement and freezes its snapshot", async () => {
  const h = harness();
  let observed;
  const pending = openSchemaForm(h.scope, h.frame, {
    schema: baseSchema([stringField()]),
    onSubmit(value, control) {
      observed = value;
      assert.equal(Object.isFrozen(value), true);
      control.close();
    },
  });
  h.event("submit", { values: { text: "submitted" } });
  assert.deepEqual(await pending, { type: "submitted", value: { text: "submitted" } });
  assert.equal(observed.text, "submitted");
});

test("normal callback return keeps the form open and releases the attempt", async () => {
  const h = harness();
  let calls = 0;
  const pending = openSchemaForm(h.scope, h.frame, {
    schema: baseSchema([stringField()]),
    onSubmit(_value, control) {
      calls += 1;
      if (calls === 2) control.close();
    },
  });
  h.event("submit", { values: { text: "first" } });
  assert.equal(calls, 1);
  assert.equal(h.domains[0].closed, 0);
  h.event("submit", { values: { text: "second" } });
  assert.equal(calls, 2);
  assert.deepEqual(await pending, { type: "submitted", value: { text: "second" } });
});

test("caller-controlled Submit projects its snapshot before transient business feedback without Change", async () => {
  const h = harness();
  let callbackCalls = 0;
  const pending = openSchemaForm(h.scope, h.frame, {
    schema: baseSchema([stringField({ default: "old", required: true })]),
    cancelable: true,
    onSubmit(value, control) {
      callbackCalls += 1;
      assert.deepEqual(value, { text: "Alice" });
      const retained = h.sequence.at(-1);
      assert.equal(retained.type, "update", "retained projection must precede caller code");
      assert.equal(retained.value.nodes[0].data.set.value, "Alice");
      assert.equal(Object.hasOwn(retained.value.nodes[0].data.set, "error"), false);
      assert.ok(retained.value.nodes[0].data.remove.includes("error"));
      control.sendValidateError([{ field: "text", errorMsg: "Business error" }]);
    },
  });

  assert.equal(h.domains[0].state.roots[0].children[0].data.value, "old");
  h.event("submit", { values: { text: "" } });
  assert.equal(h.updates.at(-1).nodes[0].data.set.error, "Required");

  const sequenceStart = h.sequence.length;
  h.event("submit", { values: { text: "Alice" } });
  assert.equal(callbackCalls, 1);
  assert.deepEqual(h.sequence.slice(sequenceStart).map((entry) => entry.type), ["update", "emit"]);
  assert.deepEqual(h.emits.at(-1), {
    targetKey: h.domains[0].state.roots[0].key,
    name: "validate-error",
    data: { errors: [{ field: "text", errorMsg: "Business error" }] },
  });

  h.event("cancel");
  assert.deepEqual(await pending, { type: "cancelled" });
});

test("caller-controlled direct Submit coherently projects restorePending and accepted fields", async () => {
  const h = harness();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = openSchemaForm(h.scope, h.frame, {
    schema: baseSchema([stringField({ default: "old", localstorageKey: "draft.text" })]),
    cancelable: true,
    onSubmit(value) {
      assert.deepEqual(value, { text: "Alice" });
      const update = h.updates.at(-1);
      assert.equal(update.nodes[0].data.set.restorePending, false);
      assert.equal(update.nodes[1].data.set.value, "Alice");
      return gate;
    },
  });

  assert.equal(h.domains[0].state.roots[0].data.restorePending, true);
  h.event("submit", { values: { text: "Alice" } });
  assert.equal(h.updates.length, 1, "root and fields should converge in one retained update");
  h.event("cancel");
  assert.deepEqual(await pending, { type: "cancelled" });
  release();
  await Promise.resolve();
});

test("loading gates input, cancelLoading preserves the lock, and close returns the immutable attempt snapshot", async () => {
  const h = harness();
  let calls = 0;
  let firstControl;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = openSchemaForm(h.scope, h.frame, {
    schema: baseSchema([stringField()]),
    cancelable: true,
    onSubmit(_value, control) {
      calls += 1;
      if (calls === 1) {
        firstControl = control;
        control.setLoading();
        return gate;
      }
      control.close();
    },
  });
  h.event("submit", { values: { text: "snapshot" } });
  assert.deepEqual(h.updates.at(-1), {
    nodes: [{ key: h.domains[0].state.roots[0].key, attrs: { set: { loading: "true" } } }],
  });
  const updateCount = h.updates.length;
  h.event("change", { values: { text: "blocked" } });
  h.event("submit", { values: { text: "blocked" } });
  h.event("cancel");
  assert.equal(h.updates.length, updateCount);
  assert.equal(calls, 1);

  firstControl.cancelLoading();
  assert.deepEqual(h.updates.at(-1).nodes[0].attrs, { remove: ["loading"] });
  h.event("change", { values: { text: "new canonical" } });
  h.event("submit", { values: { text: "duplicate" } });
  assert.equal(calls, 1, "cancelLoading must not release the active attempt");
  firstControl.close();
  assert.deepEqual(await pending, { type: "submitted", value: { text: "snapshot" } });
  release();
  await Promise.resolve();
});

test("callback resolution auto-clears loading; rejection rejects unless close won first", async () => {
  const auto = harness();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const autoPending = openSchemaForm(auto.scope, auto.frame, {
    schema: baseSchema([stringField()]),
    cancelable: true,
    onSubmit(_value, control) { control.setLoading(); return gate; },
  });
  auto.event("submit", { values: { text: "x" } });
  release();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(auto.updates.at(-1).nodes[0].attrs, { remove: ["loading"] });
  auto.event("cancel");
  assert.deepEqual(await autoPending, { type: "cancelled" });

  const failure = new Error("submit failed");
  const rejected = harness();
  const rejectedPending = openSchemaForm(rejected.scope, rejected.frame, {
    schema: baseSchema([stringField()]), onSubmit: () => Promise.reject(failure),
  });
  rejected.event("submit", { values: { text: "x" } });
  await assert.rejects(rejectedPending, failure);

  const won = harness();
  const wonPending = openSchemaForm(won.scope, won.frame, {
    schema: baseSchema([stringField()]),
    onSubmit(_value, control) {
      control.close();
      return Promise.reject(new Error("late rejection"));
    },
  });
  won.event("submit", { values: { text: "winner" } });
  assert.deepEqual(await wonPending, { type: "submitted", value: { text: "winner" } });
  await Promise.resolve();
});

test("Frame abort terminates immediately while loading and makes every control stale", async () => {
  const h = harness();
  let control;
  const never = new Promise(() => {});
  const pending = openSchemaForm(h.scope, h.frame, {
    schema: baseSchema([stringField()]),
    onSubmit(_value, current) { control = current; current.setLoading(); return never; },
  });
  h.event("submit", { values: { text: "x" } });
  h.abort.abort();
  await assert.rejects(pending, { name: "AbortError" });
  const updateCount = h.updates.length;
  assert.doesNotThrow(() => control.sendValidateError([{ field: "unknown", errorMsg: 1 }]));
  control.setLoading();
  control.cancelLoading();
  control.close();
  assert.equal(h.updates.length, updateCount);
  assert.equal(h.emits.length, 0);
});

test("non-loading user cancel settles immediately and invalidates an active callback control", async () => {
  const h = harness();
  let control;
  const pending = openSchemaForm(h.scope, h.frame, {
    schema: baseSchema([stringField()]),
    cancelable: true,
    onSubmit(_value, current) {
      control = current;
      return new Promise(() => {});
    },
  });
  h.event("submit", { values: { text: "x" } });
  h.event("cancel");
  assert.deepEqual(await pending, { type: "cancelled" });
  assert.doesNotThrow(() => control.sendValidateError([{ field: "missing", errorMsg: 1 }]));
  control.setLoading();
  control.cancelLoading();
  control.close();
  assert.equal(h.emits.length, 0);
});

test("sendValidateError validates current calls atomically, emits partial errors, and stale calls are no-ops", async () => {
  const h = harness();
  let stale;
  const pending = openSchemaForm(h.scope, h.frame, {
    schema: baseSchema([stringField(), stringField({ key: "other" })]),
    cancelable: true,
    onSubmit(_value, control) {
      stale = control;
      for (const errors of [
        null,
        [{ field: "missing", errorMsg: "bad" }],
        [{ field: "text", errorMsg: "" }],
        [{ field: "text", errorMsg: "a" }, { field: "text", errorMsg: "b" }],
        [{ field: "text", errorMsg: "x".repeat(131_072) }],
      ]) assert.throws(() => control.sendValidateError(errors), TypeError);
      assert.equal(h.emits.length, 0);
      control.sendValidateError([]);
      assert.equal(h.emits.length, 0);
      control.sendValidateError([{ field: "other", errorMsg: "Business error" }]);
    },
  });
  h.event("submit", { values: { text: "x", other: "y" } });
  assert.deepEqual(h.emits, [{
    targetKey: h.domains[0].state.roots[0].key,
    name: "validate-error",
    data: { errors: [{ field: "other", errorMsg: "Business error" }] },
  }]);
  assert.doesNotThrow(() => stale.sendValidateError([{ field: "missing", errorMsg: 1 }]));
  assert.equal(h.emits.length, 1);
  h.event("cancel");
  await pending;
});

test("restore is Session-owned, one-shot, validated, and projects pending=false", async () => {
  const schema = {
    ...baseSchema([stringField({ default: "valid-default", minLength: 9, localstorageKey: "draft.text" })]),
    validateOnChange: `(data) => data.text === "restored" ? { text: "Restored error" } : null`,
  };
  const malformed = harness();
  const malformedPending = openSchemaForm(malformed.scope, malformed.frame, { schema, cancelable: true });
  malformed.event("restore", { values: { text: null } });
  assert.equal(malformed.updates.length, 0);
  malformed.event("restore", { values: { text: "valid-default" } });
  assert.deepEqual(malformed.updates.at(-1), {
    nodes: [{ key: malformed.domains[0].state.roots[0].key, data: { set: { restorePending: false } } }],
  });
  const afterConsume = malformed.updates.length;
  malformed.event("restore", { values: { text: "ignored" } });
  assert.equal(malformed.updates.length, afterConsume);
  malformed.event("cancel");
  await malformedPending;

  const changed = harness();
  const changedPending = openSchemaForm(changed.scope, changed.frame, { schema, cancelable: true });
  changed.event("restore", { values: { text: "restored" } });
  assert.equal(changed.updates.at(-1).nodes[0].data.set.restorePending, false);
  assert.equal(changed.updates.at(-1).nodes[1].data.set.value, "restored");
  assert.equal(changed.updates.at(-1).nodes[1].data.set.error, "Must be at least 9 characters");
  changed.event("cancel");
  await changedPending;
});

test("ordinary change and submit consume pending restore, with no useless update after terminal submit", async () => {
  const schema = baseSchema([stringField({ localstorageKey: "draft.text" })]);
  const change = harness();
  const changePending = openSchemaForm(change.scope, change.frame, { schema, cancelable: true });
  change.event("change", { values: { text: "user" } });
  assert.equal(change.updates.at(-1).nodes[0].data.set.restorePending, false);
  change.event("cancel");
  await changePending;

  const submit = harness();
  const submitPending = openSchemaForm(submit.scope, submit.frame, { schema });
  submit.event("submit", { values: { text: "submitted" } });
  assert.deepEqual(await submitPending, { type: "submitted", value: { text: "submitted" } });
  assert.equal(submit.updates.length, 0);
});
