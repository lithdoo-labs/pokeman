import assert from "node:assert/strict";
import test from "node:test";
import { createPokeManDialogueGraphSubsystem, validateDialogueContent } from "../subsystems/dialogue.mjs";

test("Dialogue schema permits omitted choices, rejects empty choices, and keeps choices exclusive with mutation", () => {
  assert.deepEqual(validateDialogueContent({ lines: [{ text: "terminal" }] }).choices, []);
  assert.throws(() => validateDialogueContent({ lines: [{ text: "invalid" }], choices: [] }), /must not be empty/u);
  assert.throws(() => validateDialogueContent({
    lines: [{ text: "invalid" }],
    choices: [{ text: "next", target: "next" }],
    mutation: "advance",
  }), /mutually exclusive/u);
});

test("Dialogue runtime resolves Character names for presentation and history", async () => {
  const conversations = [];
  const history = [];
  class FakeDialogue {
    controls = { confirm() {}, previous() {}, next() {}, history() {}, cancel() {} };
    async openConversation({ conversation }) {
      conversations.push(conversation);
      return { type: "submitted" };
    }
    appendHistory(entry) { history.push(entry); }
    close() {}
  }
  const values = new Map([
    ["struct.Dialogue\0intro", { lines: [{ speaker: "professor", text: "欢迎" }, { speaker: "rival", text: "来对战吧" }] }],
    ["struct.Character\0professor", { name: "博士" }],
    ["struct.Character\0rival", { name: "宿敌" }],
  ]);
  const scope = {
    content: { async record(namespace, key) { const value = values.get(`${namespace}\0${key}`); return value === undefined ? null : { value }; } },
    state: {},
    presentationEvents: {},
  };
  const subsystem = createPokeManDialogueGraphSubsystem(scope, {
    RPGDialogue: FakeDialogue,
    createControlsConsumer: () => ({ close() {} }),
  });
  const outcome = await subsystem.frame({
    params: { dialogueKey: "intro", source: { mapId: 4, npc: { instanceId: "professor", npcId: "professor" } } },
    signal: new AbortController().signal,
  });
  assert.deepEqual(outcome, { type: "completed", value: "intro" });
  assert.deepEqual(conversations.map(({ speakerName }) => speakerName), ["博士", "宿敌"]);
  assert.deepEqual(history.map(({ speakerName }) => speakerName), ["博士", "宿敌"]);
});

test("Dialogue runtime fails closed instead of exposing an unresolved Character key", async () => {
  const conversations = [];
  const history = [];
  class FakeDialogue {
    controls = { confirm() {}, previous() {}, next() {}, history() {}, cancel() {} };
    async openConversation({ conversation }) { conversations.push(conversation); return { type: "submitted" }; }
    appendHistory(entry) { history.push(entry); }
    close() {}
  }
  const scope = {
    content: { async record(namespace) {
      return namespace === "struct.Dialogue" ? { value: { lines: [{ speaker: "ghost", text: "invalid" }] } } : null;
    } },
    state: {},
    presentationEvents: {},
  };
  const subsystem = createPokeManDialogueGraphSubsystem(scope, {
    RPGDialogue: FakeDialogue,
    createControlsConsumer: () => ({ close() {} }),
  });
  const outcome = await subsystem.frame({
    params: { dialogueKey: "intro", source: { mapId: 4, npc: { instanceId: "ghost", npcId: "ghost" } } },
    signal: new AbortController().signal,
  });
  assert.deepEqual(outcome, { type: "failed", error: { code: "POKEMAN_DIALOGUE_GRAPH_FAILED" } });
  assert.deepEqual(conversations, []);
  assert.deepEqual(history, []);
});

test("Dialogue runtime permits a legal cycle and caches immutable records for the Frame", async () => {
  const values = new Map([
    ["a", { lines: [{ text: "A" }], choices: [{ text: "next", target: "b" }] }],
    ["b", { lines: [{ text: "B" }], choices: [{ text: "next", target: "a" }] }],
  ]);
  const reads = new Map();
  let opens = 0;
  class FakeDialogue {
    controls = { confirm() {}, previous() {}, next() {}, history() {}, cancel() {} };
    async openConversation() {
      opens += 1;
      return opens < 3 ? { type: "submitted", choiceId: "0" } : { type: "cancelled" };
    }
    appendHistory() {}
    close() {}
  }
  const scope = {
    content: { async record(_namespace, key) {
      reads.set(key, (reads.get(key) ?? 0) + 1);
      return { value: structuredClone(values.get(key)) };
    } },
    state: {},
    presentationEvents: {},
  };
  const subsystem = createPokeManDialogueGraphSubsystem(scope, {
    RPGDialogue: FakeDialogue,
    createControlsConsumer: () => ({ close() {} }),
  });
  const outcome = await subsystem.frame({
    params: { dialogueKey: "a", source: { mapId: 4, npc: { instanceId: "professor", npcId: "professor" } } },
    signal: new AbortController().signal,
  });
  assert.deepEqual(outcome, { type: "cancelled" });
  assert.deepEqual(Object.fromEntries(reads), { a: 1, b: 1 });
});
