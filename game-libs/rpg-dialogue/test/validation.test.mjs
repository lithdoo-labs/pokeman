import assert from "node:assert/strict";
import test from "node:test";
import { RPGDialogue } from "../dist/index.js";
import { choice, character, harness, history, request, turn } from "./helpers.mjs";

test("constructor validates closed options, booleans, zIndex, scope, and Frame synchronously", () => {
  const frame = { id: "f", params: null, signal: new AbortController().signal, async call() {} };
  const scope = {
    signal: new AbortController().signal,
    events: { async subscribe() { return { closed: new Promise(() => {}), close() {} }; } },
    createRenderDomain() {},
  };
  for (const options of [
    null,
    { unknown: true },
    { cancelable: 1 },
    { zIndex: 1.5 },
    { zIndex: NaN },
    { zIndex: Infinity },
    { zIndex: -2_147_483_649 },
    { zIndex: 2_147_483_648 },
  ]) assert.throws(() => new RPGDialogue(scope, frame, options));
  assert.throws(() => new RPGDialogue({}, frame));
  assert.throws(() => new RPGDialogue(scope, {}));
  assert.doesNotThrow(() => new RPGDialogue(scope, frame, { cancelable: undefined, zIndex: undefined }));
  assert.doesNotThrow(() => new RPGDialogue(scope, frame, { zIndex: -2_147_483_648 }));
  assert.doesNotThrow(() => new RPGDialogue(scope, frame, { zIndex: 2_147_483_647 }));
});

async function rejectsWithoutSynchronousThrow(value) {
  const fixture = harness();
  let pending;
  assert.doesNotThrow(() => { pending = fixture.dialogue.openConversation(value); });
  await assert.rejects(pending);
  assert.equal(fixture.states.length, 0);
  assert.equal(fixture.counts().listenerCreates, 0);
}

test("openConversation rejects invalid closed shapes and missing required members asynchronously", async () => {
  await rejectsWithoutSynchronousThrow(null);
  await rejectsWithoutSynchronousThrow({ conversation: request().conversation, characters: [], unknown: true });
  await rejectsWithoutSynchronousThrow({ characters: [] });
  await rejectsWithoutSynchronousThrow({ conversation: request().conversation });
  await rejectsWithoutSynchronousThrow({ conversation: { text: "x", choices: [], data: {}, unknown: 1 }, characters: [] });
  await rejectsWithoutSynchronousThrow({ conversation: { choices: [], data: {} }, characters: [] });
  await rejectsWithoutSynchronousThrow({ conversation: { text: "x", choices: [] }, characters: [] });
  await rejectsWithoutSynchronousThrow({ conversation: { text: "x", choices: [], data: {} }, characters: {} });
});

test("request validation rejects bad primitive types, unknown members, and array-like coercion", async () => {
  await rejectsWithoutSynchronousThrow(request({ speakerName: 1 }));
  await rejectsWithoutSynchronousThrow(request({ text: false }));
  await rejectsWithoutSynchronousThrow(request({ choices: { 0: choice("a"), length: 1 } }));
  await rejectsWithoutSynchronousThrow(request({ choices: [{ ...choice("a"), enabled: "true" }] }));
  await rejectsWithoutSynchronousThrow(request({ choices: [{ ...choice("a"), unknown: true }] }));
  await rejectsWithoutSynchronousThrow(request({ characters: [{ ...character("a"), active: 1 }] }));
  await rejectsWithoutSynchronousThrow(request({ characters: [{ ...character("a"), unknown: true }] }));
});

test("identity rules use UTF-8 bytes, preserve exact spelling, and reject duplicates", async () => {
  await rejectsWithoutSynchronousThrow(request({ choices: [choice(""), choice("valid")] }));
  await rejectsWithoutSynchronousThrow(request({ choices: [choice("a".repeat(129)), choice("valid")] }));
  await rejectsWithoutSynchronousThrow(request({ choices: [choice("😀".repeat(33)), choice("valid")] }));
  await rejectsWithoutSynchronousThrow(request({ choices: [choice("yes"), choice("yes")] }));
  await rejectsWithoutSynchronousThrow(request({ characters: [character("alice"), character("alice")] }));
  const fixture = harness();
  const pending = fixture.dialogue.openConversation(request({ choices: [choice("Yes"), choice("yes")] }));
  await turn();
  assert.equal(fixture.states.length, 1);
  fixture.dialogue.close();
  await assert.rejects(pending);
});

test("display strings allow empty values but reject invalid scalar sequences and attr overflow", async () => {
  const valid = harness();
  const pending = valid.dialogue.openConversation(request({ text: "", speakerName: "", choices: [] }));
  await turn();
  assert.equal(valid.states.length, 1);
  valid.dialogue.close();
  await assert.rejects(pending);

  await rejectsWithoutSynchronousThrow(request({ text: "x".repeat(4097) }));
  await rejectsWithoutSynchronousThrow(request({ text: "\ud800" }));
  await rejectsWithoutSynchronousThrow(request({ choices: [choice("a", { text: "😀".repeat(1025) })] }));
});

test("choice cardinality accepts zero and requires an enabled choice when non-empty", async () => {
  await rejectsWithoutSynchronousThrow(request({ choices: [choice("a", { enabled: false }), choice("b", { enabled: false })] }));
  const fixture = harness();
  const pending = fixture.dialogue.openConversation(request({ choices: [choice("a", { enabled: false }), choice("b")] }));
  await turn();
  assert.equal(fixture.states.length, 1);
  fixture.dialogue.close();
  await assert.rejects(pending);
});

test("caller data is required plain bounded JSON and is not coerced", async () => {
  await rejectsWithoutSynchronousThrow(request({ conversationData: undefined }));
  await rejectsWithoutSynchronousThrow(request({ conversationData: [] }));
  await rejectsWithoutSynchronousThrow(request({ conversationData: new Date() }));
  await rejectsWithoutSynchronousThrow(request({ conversationData: { value: undefined } }));
  await rejectsWithoutSynchronousThrow(request({ conversationData: { value: NaN } }));
  await rejectsWithoutSynchronousThrow(request({ conversationData: { value: "\udfff" } }));
  await rejectsWithoutSynchronousThrow(request({ conversationData: { ["x".repeat(257)]: true } }));
  await rejectsWithoutSynchronousThrow(request({ conversationData: { value: "x".repeat(262_145) } }));
  const cyclic = {};
  cyclic.self = cyclic;
  await rejectsWithoutSynchronousThrow(request({ conversationData: cyclic }));
  let deep = {};
  for (let index = 0; index < 32; index += 1) deep = { child: deep };
  await rejectsWithoutSynchronousThrow(request({ conversationData: deep }));
});

test("transport byte validation ignores inherited toJSON without weakening limits", async () => {
  const original = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON");
  try {
    Object.defineProperty(Object.prototype, "toJSON", {
      configurable: true,
      value() { return {}; },
    });
    await rejectsWithoutSynchronousThrow(request({ conversationData: { value: "x".repeat(262_145) } }));

    Object.defineProperty(Object.prototype, "toJSON", {
      configurable: true,
      value() { return { value: "x".repeat(262_145) }; },
    });
    const data = { value: "valid" };
    const fixture = harness();
    const pending = fixture.dialogue.openConversation(request({ conversationData: data }));
    await turn();
    assert.equal(fixture.states.length, 1);
    assert.equal(fixture.states[0].roots[0].children[1].data, data);
    fixture.dialogue.close();
    await assert.rejects(pending);
  } finally {
    if (original === undefined) delete Object.prototype.toJSON;
    else Object.defineProperty(Object.prototype, "toJSON", original);
  }
});

test("History validates closed shapes, uniqueness, data types, and retained projection bounds synchronously", () => {
  const fixture = harness();
  assert.throws(() => fixture.dialogue.setHistory({ length: 0 }));
  assert.throws(() => fixture.dialogue.setHistory([{ ...history("a"), unknown: true }]));
  assert.throws(() => fixture.dialogue.setHistory([{ entryId: "a" }]));
  assert.throws(() => fixture.dialogue.setHistory([history("a"), history("a")]));
  assert.throws(() => fixture.dialogue.appendHistory({ entryId: "", text: "x" }));
  assert.deepEqual(fixture.dialogue.getHistorySnapshot(), []);

  const excessive = Array.from({ length: 16_373 }, (_, index) => history(`e${index}`));
  assert.throws(() => fixture.dialogue.setHistory(excessive));
  assert.deepEqual(fixture.dialogue.getHistorySnapshot(), []);
});
