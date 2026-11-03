import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { completed } from "@loomrealm/subsystem";
import { createHostLifecyclePublisher, createSessionEventHub } from "@loomrealm/session-events";
import {
  BASELINE_EVENT_STATES, BASELINE_PLAYER_WORLD, EVENT_STATE_LIST_KEY, PLAYER_CARDS_KEY, PLAYER_WORLD_KEY,
  PLAYER_TO_RIVAL_KEY, RIVAL_CARDS_KEY, RIVAL_TO_PLAYER_KEY, applyEventStateMutation,
  ensurePokeManBaseline, exchangeRivalCards, readBattleContracts, settleBattleContracts,
  equalJsonValue,
} from "../subsystems/business-state.mjs";
import { runBaseFrame } from "../subsystems/base.mjs";
import { resolveLabTutorialBattle } from "../subsystems/battle-content.mjs";
import { createDeepSeekTransport, createPokeManBattleSubsystem, DEEPSEEK_RESPONSES_ENDPOINT } from "../subsystems/battle.mjs";
import { createPokeManMessageSubsystem, validateMessageInput } from "../subsystems/message.mjs";
import { qualifyStoryContent, resolveStoryScene } from "../subsystems/story.mjs";

const id = (key) => `${key.namespace}/${key.key}`;
const clone = (value) => structuredClone(value);
const eventContent = (events = {
  prologue: { states: { "lab-tutorial": {}, "rival-ready": {}, "after-battle": {} } },
  "first-route": { states: { active: {} } },
}) => ({ async record(namespace, key) { return namespace === "struct.Event" && events[key] !== undefined ? { value: clone(events[key]) } : null; } });

class FakeState {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values).map(([key, value]) => [key, { value: clone(value), version: value === null ? 0 : 1 }]));
    this.commits = [];
    this.nextError = undefined;
  }
  async read(keys) {
    return { revision: this.commits.length, records: keys.map((key) => {
      const record = this.values.get(id(key)) ?? { value: null, version: 0 };
      return { key, value: clone(record.value), version: record.version };
    }) };
  }
  async list({ namespace } = {}) {
    return {
      revision: this.commits.length,
      records: [...this.values.entries()]
        .filter(([identity]) => namespace === undefined || identity.startsWith(`${namespace}/`))
        .map(([identity, record]) => {
          const separator = identity.indexOf("/");
          return { key: { namespace: identity.slice(0, separator), key: identity.slice(separator + 1) }, version: record.version };
        }),
    };
  }
  async commit(transaction) {
    this.commits.push(clone(transaction));
    for (const condition of transaction.conditions) {
      const current = this.values.get(id(condition.key)) ?? { value: null, version: 0 };
      if (current.version !== condition.version) throw Object.assign(new Error("conflict"), { code: "CONFLICT" });
    }
    for (const write of transaction.writes) {
      const current = this.values.get(id(write.key)) ?? { version: 0 };
      this.values.set(id(write.key), { value: clone(write.value), version: current.version + 1 });
    }
    if (this.nextError) { const code = this.nextError; this.nextError = undefined; throw Object.assign(new Error(code), { code }); }
    return { revision: this.commits.length, records: [] };
  }
}

test("baseline bootstrap is one two-record transaction and preserves an existing valid baseline", async () => {
  const state = new FakeState();
  assert.equal((await ensurePokeManBaseline(state)).status, "created");
  assert.equal(state.commits.length, 1);
  assert.deepEqual(state.commits[0].writes.map(({ value }) => value), [BASELINE_PLAYER_WORLD, BASELINE_EVENT_STATES]);
  assert.equal((await ensurePokeManBaseline(state)).status, "existing");
  assert.equal(state.commits.length, 1);
});

test("baseline bootstrap rejects a single missing record and structural equality ignores object key order", async () => {
  const partial = new FakeState({ [id(PLAYER_WORLD_KEY)]: BASELINE_PLAYER_WORLD });
  await assert.rejects(() => ensurePokeManBaseline(partial), { code: "POKEMAN_STATE_INVALID" });
  assert.equal(partial.commits.length, 0);
  assert.equal(equalJsonValue({ a: 1, nested: { x: true, y: null } }, { nested: { y: null, x: true }, a: 1 }), true);
  assert.equal(equalJsonValue([1, 2], [2, 1]), false);
});

test("baseline bootstrap never overwrites materialized null records", async () => {
  const bothNull = new FakeState({ [id(PLAYER_WORLD_KEY)]: null, [id(EVENT_STATE_LIST_KEY)]: null });
  bothNull.values.get(id(PLAYER_WORLD_KEY)).version = 2;
  bothNull.values.get(id(EVENT_STATE_LIST_KEY)).version = 3;
  await assert.rejects(() => ensurePokeManBaseline(bothNull), { code: "POKEMAN_STATE_INVALID" });
  assert.equal(bothNull.commits.length, 0);

  const oneInitialNull = new FakeState({ [id(PLAYER_WORLD_KEY)]: null });
  await assert.rejects(() => ensurePokeManBaseline(oneInitialNull), { code: "POKEMAN_STATE_INVALID" });
  assert.equal(oneInitialNull.commits.length, 0);
});

test("Base validates the durable checkpoint but launches Map from frame params", async () => {
  const checkpoint = { mapId: 7, x: 20, y: 18, direction: 4 };
  const state = new FakeState({
    [id(PLAYER_WORLD_KEY)]: checkpoint,
    [id(EVENT_STATE_LIST_KEY)]: BASELINE_EVENT_STATES,
  });
  const params = Object.freeze({ mapId: 3, x: 3, y: 8, direction: 2, characterName: "Player" });
  let childInput;
  const result = await runBaseFrame({
    state,
    createRenderDomain() { return { close() {} }; },
  }, {
    params,
    signal: new AbortController().signal,
    async call(name, input) { assert.equal(name, "map"); childInput = input; return "map"; },
  }, { ensureConfiguration: async () => {} });
  assert.equal(result, "map");
  assert.equal(childInput, params);
  assert.deepEqual(state.values.get(id(PLAYER_WORLD_KEY)).value, checkpoint);
  assert.equal(state.commits.length, 0);
});

test("bilateral exchange atomically preserves relationship facts and is idempotent", async () => {
  const state = new FakeState({
    [id(PLAYER_TO_RIVAL_KEY)]: { affinity: 7, hostile: false, relationshipText: "trusted" },
    [id(RIVAL_TO_PLAYER_KEY)]: { affinity: -2, hostile: true, relationshipText: "competitive" },
  });
  assert.equal((await exchangeRivalCards(state)).status, "committed");
  assert.equal(state.commits[0].writes.length, 4);
  const authority = await readBattleContracts(state);
  assert.equal(authority.playerToRival.value.affinity, 7);
  assert.equal(authority.playerToRival.value.contract.integrity, 18);
  assert.deepEqual(state.values.get(id(PLAYER_CARDS_KEY)).value, [{ slot: 0, servantCharacterId: "rival" }]);
  assert.equal((await exchangeRivalCards(state)).status, "existing");
  assert.equal(state.commits.length, 1);

  const absent = new FakeState();
  await exchangeRivalCards(absent);
  assert.deepEqual(absent.values.get(id(PLAYER_TO_RIVAL_KEY)).value, {
    affinity: 0, hostile: false, relationshipText: "", contract: { integrity: 18, skills: ["firebolt", "grab"] },
  });
  assert.deepEqual(absent.values.get(id(RIVAL_TO_PLAYER_KEY)).value, {
    affinity: 0, hostile: false, relationshipText: "", contract: { integrity: 20, skills: ["firebolt"] },
  });
});

test("bilateral exchange rejects partial or conflicting CarriedCards instead of last-wins repair", async () => {
  const state = new FakeState({ [id(PLAYER_CARDS_KEY)]: [{ slot: 0, servantCharacterId: "professor" }] });
  await assert.rejects(() => exchangeRivalCards(state), { code: "POKEMAN_EXCHANGE_CONFLICT" });
  assert.equal(state.commits.length, 0);
});

test("bilateral exchange rejects materialized null Relationship and CarriedCards records", async () => {
  const relationship = new FakeState({ [id(PLAYER_TO_RIVAL_KEY)]: null });
  relationship.values.get(id(PLAYER_TO_RIVAL_KEY)).version = 2;
  await assert.rejects(() => exchangeRivalCards(relationship), { code: "POKEMAN_RELATIONSHIP_INVALID" });
  assert.equal(relationship.commits.length, 0);

  const cards = new FakeState({ [id(PLAYER_CARDS_KEY)]: null });
  cards.values.get(id(PLAYER_CARDS_KEY)).version = 2;
  await assert.rejects(() => exchangeRivalCards(cards), { code: "POKEMAN_EXCHANGE_CONFLICT" });
  assert.equal(cards.commits.length, 0);
});

test("settlement uses original authority versions, applies the 1 HP floor, and reconciles uncertain evidence", async () => {
  const state = new FakeState();
  await exchangeRivalCards(state);
  const authority = await readBattleContracts(state);
  state.nextError = "OUTCOME_UNKNOWN";
  const evidence = await settleBattleContracts(state, authority, { rival: 0, player: 9 });
  assert.equal(evidence.status, "reconciled");
  assert.equal(evidence.rivalIntegrity, 1);
  assert.equal(evidence.playerIntegrity, 9);
  assert.equal(state.commits.at(-1).writes.length, 2);
});

test("simultaneous defeat persists both Contracts at the 1 HP floor in one transaction", async () => {
  const state = new FakeState();
  await exchangeRivalCards(state);
  const evidence = await settleBattleContracts(state, await readBattleContracts(state), { rival: 0, player: 0 });
  assert.deepEqual(evidence, { status: "committed", rivalIntegrity: 1, playerIntegrity: 1 });
  assert.equal(state.commits.at(-1).writes.length, 2);
});

test("EventStateMutation validates from and atomically replaces EventStateList", async () => {
  const state = new FakeState({ [id(EVENT_STATE_LIST_KEY)]: BASELINE_EVENT_STATES });
  const content = eventContent();
  const result = await applyEventStateMutation(state, { from: { prologue: "lab-tutorial" }, to: { prologue: "rival-ready" } }, { content });
  assert.deepEqual(result.eventStates, [{ eventId: "prologue", stateId: "rival-ready" }]);
  assert.equal(state.commits.at(-1).writes.length, 1);
  await assert.rejects(() => applyEventStateMutation(state, { from: { prologue: "lab-tutorial" }, to: { prologue: "after-battle" } }, { content }), { code: "POKEMAN_EVENT_MUTATION_MISMATCH" });
});

test("EventStateMutation validates Event and state Content before any Shared State commit", async () => {
  const state = new FakeState({ [id(EVENT_STATE_LIST_KEY)]: [{ eventId: "prologue", stateId: "rival-ready" }] });
  await assert.rejects(
    () => applyEventStateMutation(state, { from: { prologue: "rival-ready" }, to: { prologue: "after-battle-misspelled" } }, { content: eventContent() }),
    { code: "POKEMAN_EVENT_MUTATION_CONTENT_INVALID" },
  );
  await assert.rejects(
    () => applyEventStateMutation(state, { from: { missing: null }, to: { missing: "active" } }, { content: eventContent() }),
    { code: "POKEMAN_EVENT_MUTATION_CONTENT_INVALID" },
  );
  await assert.rejects(
    () => applyEventStateMutation(state, { from: { prologue: "rival-ready" }, to: { "first-route": "active" } }, { content: eventContent() }),
    { code: "POKEMAN_EVENT_MUTATION_INVALID" },
  );
  assert.equal(state.commits.length, 0);
});

test("Story Resolver makes exactly the Event-state owner interactable on Map 4", async () => {
  const fsdb = new URL("../[FSDB]PokeMan/", import.meta.url);
  const content = { async record(namespace, key) {
    return { value: JSON.parse(await readFile(new URL(`[struct]${namespace.slice(7)}/${key}.json`, fsdb), "utf8")) };
  } };
  const state = new FakeState({ [id(EVENT_STATE_LIST_KEY)]: [{ eventId: "prologue", stateId: "rival-ready" }] });
  const scene = await resolveStoryScene(await qualifyStoryContent(content), state, 4);
  assert.equal(scene.interactions.get("rival-lab"), "lab-rival-intro");
  assert.equal(scene.interactions.has("professor"), false);
  assert.deepEqual(scene.placements.find(({ instanceId }) => instanceId === "rival-lab"), {
    instanceId: "rival-lab", npcId: "rival-lab", x: 8, y: 5, direction: 2, interactable: true,
  });
});

test("the authored Arena, actors, skills, effects and graphics resolve to initial contract HP", async () => {
  const fsdb = new URL("../[FSDB]PokeMan/", import.meta.url);
  const content = {
    async record(namespace, key) {
      const table = namespace.slice("struct.".length);
      return { value: JSON.parse(await readFile(new URL(`[struct]${table}/${key}.json`, fsdb), "utf8")) };
    },
    async resource() { return { contentVersion: `sha256:${"a".repeat(64)}` }; },
  };
  const state = new FakeState(); await exchangeRivalCards(state);
  const definition = await resolveLabTutorialBattle(content, await readBattleContracts(state));
  assert.deepEqual(definition.map.ref, { arenaId: "lab-tutorial" });
  assert.deepEqual(definition.actors.map(({ actorId, hp = undefined, initialHp, tile }) => ({ actorId, hp, initialHp, tile })), [
    { actorId: "rival", hp: undefined, initialHp: 18, tile: { x: 1, y: 3 } },
    { actorId: "player", hp: undefined, initialHp: 20, tile: { x: 5, y: 3 } },
  ]);
  assert.deepEqual(definition.actors[0].skills.map(({ skillId }) => skillId), ["firebolt", "grab"]);
});

test("PokeMan-private DeepSeek transport confines credentials to Authorization and forwards cancellation", async () => {
  const calls = [];
  const transport = createDeepSeekTransport("secret", async (url, init) => {
    calls.push({ url, init }); return { status: 200, async text() { return "ok"; } };
  });
  const controller = new AbortController();
  assert.deepEqual(await transport.postResponses("{}", controller.signal), { status: 200, bodyText: "ok" });
  assert.equal(calls[0].url, DEEPSEEK_RESPONSES_ENDPOINT);
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret");
  assert.equal(calls[0].init.signal, controller.signal);
});

test("Message Frame validates exact input, returns only a selected action, and cleans up", async () => {
  const input = { messageKey: "pause", text: "Paused", actions: [{ id: "continue", label: "Continue" }, { id: "exit", label: "Exit" }] };
  assert.equal(validateMessageInput(input), true);
  assert.equal(validateMessageInput({ ...input, extra: true }), false);
  let handlers; let closed = 0; let domainClosed = 0;
  const subsystem = createPokeManMessageSubsystem({
    presentationEvents: {},
    createRenderDomain() { return { replace() {}, close() { domainClosed += 1; } }; },
  }, { createControlsConsumer(_events, _frame, value) { handlers = value; return { close() { closed += 1; } }; } });
  const pending = subsystem.frame({ params: input, signal: new AbortController().signal });
  await Promise.resolve();
  handlers.onEvent({ action: "down", button: "down", repeat: false });
  handlers.onEvent({ action: "down", button: "south", repeat: false });
  assert.deepEqual(await pending, completed({ messageKey: "pause", actionId: "exit" }));
  assert.equal(closed, 1); assert.equal(domainClosed, 1);
});

test("Battle Frame settles the raw final snapshot before returning a normal business result", async () => {
  let closed = 0; let settlement;
  const runtime = {
    onPause() { return () => {}; },
    onTransition() { return () => {}; },
    async run() { return { type: "ally_win" }; },
    getSnapshot() { return { battleId: "battle-1", status: "settled", actors: [{ actorId: "rival", hp: 8 }, { actorId: "player", hp: 0 }] }; },
    close() { closed += 1; }, pause() {}, resume() {}, cancel() {},
  };
  const subsystem = createPokeManBattleSubsystem({ state: {}, content: {}, events: {} }, {
    readBattleContracts: async () => ({ authority: true }), resolveLabTutorialBattle: async () => ({}),
    readDeepSeekConfiguration: async () => ({ apiKey: "secret" }), decision: {}, presentation: {}, runtime,
    settleBattleContracts: async (_state, _authority, hp) => { settlement = hp; return { status: "committed" }; },
    subscribeLifecycle: async (_scope, listener) => { listener("foreground"); return { close() {} }; },
  });
  const outcome = await subsystem.frame({
    params: { scenarioId: "lab-rival-tutorial", source: { mapId: 4, rival: { instanceId: "rival-lab", npcId: "rival-lab" } } },
    signal: new AbortController().signal, async call() { throw new Error("unexpected"); },
  });
  assert.deepEqual(settlement, { rival: 8, player: 0 });
  assert.deepEqual(outcome, completed({ battleId: "battle-1", result: "ally_win", settlement: "committed" }));
  assert.equal(closed, 1);
});

test("decision-circuit pause opens one Message and resumes only after explicit retry", async () => {
  let pauseListener; let resumeCount = 0; let closeCount = 0; let resolveRun;
  const runResult = new Promise((resolve) => { resolveRun = resolve; });
  const runtime = {
    onPause(listener) { pauseListener = listener; return () => {}; },
    onTransition() { return () => {}; },
    run() { return runResult; },
    getSnapshot() { return { battleId: "battle-pause", status: "paused", pauseReason: "decision-circuit", actors: [] }; },
    close() { closeCount += 1; }, pause() {}, cancel() {},
    resume() { resumeCount += 1; resolveRun({ type: "cancelled" }); },
  };
  let prompt;
  const subsystem = createPokeManBattleSubsystem({ state: {}, content: {}, events: {} }, {
    readBattleContracts: async () => ({}), resolveLabTutorialBattle: async () => ({}), readDeepSeekConfiguration: async () => ({ apiKey: "x" }),
    decision: {}, presentation: {}, runtime, settleBattleContracts: async () => { throw new Error("must not settle"); },
    subscribeLifecycle: async (_scope, listener) => { listener("foreground"); return { close() {} }; },
  });
  const pending = subsystem.frame({
    params: { scenarioId: "lab-rival-tutorial", source: { mapId: 4, rival: { instanceId: "rival-lab", npcId: "rival-lab" } } },
    signal: new AbortController().signal,
    async call(key, value) { prompt = { key, value }; return completed({ messageKey: value.messageKey, actionId: "retry" }); },
  });
  while (pauseListener === undefined) await new Promise((resolve) => setImmediate(resolve));
  pauseListener({ reason: "decision-circuit" });
  assert.equal((await pending).type, "cancelled");
  assert.equal(prompt.key, "message");
  assert.equal(prompt.value.messageKey, "battle-decision-circuit-paused");
  assert.equal(resumeCount, 1); assert.equal(closeCount, 1);
});

test("host background freezes Battle and foreground waits for an explicit Message continue", async () => {
  let pauseListener; let lifecycleListener; let resolveRun; let resolveMessage;
  let status = "running"; let pauseReason; let resumeCount = 0; let settlementCount = 0; let lifecycleClosed = 0;
  const runResult = new Promise((resolve) => { resolveRun = resolve; });
  const messageResult = new Promise((resolve) => { resolveMessage = resolve; });
  const runtime = {
    onPause(listener) { pauseListener = listener; return () => {}; },
    onTransition() { return () => {}; },
    run() { return runResult; },
    getSnapshot() { return { battleId: "battle-background", status, ...(pauseReason === undefined ? {} : { pauseReason }), actors: [] }; },
    pause(reason = "host-background") {
      if (status === "paused") return;
      status = "paused"; pauseReason = reason; pauseListener({ reason });
    },
    resume() { resumeCount += 1; status = "running"; pauseReason = undefined; resolveRun({ type: "cancelled" }); },
    cancel() { resolveRun({ type: "cancelled" }); }, close() {},
  };
  let prompt;
  const subsystem = createPokeManBattleSubsystem({ state: {}, content: {}, events: {} }, {
    readBattleContracts: async () => ({}), resolveLabTutorialBattle: async () => ({}), readDeepSeekConfiguration: async () => ({ apiKey: "x" }),
    decision: {}, presentation: {}, runtime,
    settleBattleContracts: async () => { settlementCount += 1; throw new Error("cancelled Battle must not settle"); },
    subscribeLifecycle: async (_scope, listener) => { lifecycleListener = listener; listener("foreground"); return { close() { lifecycleClosed += 1; } }; },
  });
  const pending = subsystem.frame({
    params: { scenarioId: "lab-rival-tutorial", source: { mapId: 4, rival: { instanceId: "rival-lab", npcId: "rival-lab" } } },
    signal: new AbortController().signal,
    async call(key, value) { prompt = { key, value }; return messageResult; },
  });
  while (lifecycleListener === undefined || pauseListener === undefined) await new Promise((resolve) => setImmediate(resolve));
  lifecycleListener("background");
  assert.equal(status, "paused"); assert.equal(pauseReason, "host-background"); assert.equal(prompt, undefined);
  lifecycleListener("foreground");
  while (prompt === undefined) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(prompt.key, "message"); assert.equal(prompt.value.messageKey, "battle-host-background-paused");
  assert.equal(resumeCount, 0, "foreground alone must not resume Battle");
  resolveMessage(completed({ messageKey: prompt.value.messageKey, actionId: "continue" }));
  assert.equal((await pending).type, "cancelled");
  assert.equal(resumeCount, 1); assert.equal(settlementCount, 0); assert.equal(lifecycleClosed, 1);
});

test("background during Battle initialization is remembered and pauses only after RUNNING", async () => {
  let lifecycleListener; let pauseListener; let transitionListener; let resolveRun; let status = "created"; let pauseCalls = 0; let resolveMessage;
  const runResult = new Promise((resolve) => { resolveRun = resolve; });
  const messageResult = new Promise((resolve) => { resolveMessage = resolve; });
  const runtime = {
    onPause(listener) { pauseListener = listener; return () => {}; },
    onTransition(listener) { transitionListener = listener; return () => {}; },
    run() { status = "initializing"; return runResult; },
    getSnapshot() { return { battleId: "battle-initializing", status, ...(status === "paused" ? { pauseReason: "host-background" } : {}), actors: [] }; },
    pause(reason) { assert.equal(status, "running"); assert.equal(reason, "host-background"); pauseCalls += 1; status = "paused"; pauseListener({ reason }); },
    resume() { status = "running"; resolveRun({ type: "cancelled" }); },
    cancel() { resolveRun({ type: "cancelled" }); }, close() {},
  };
  let prompt;
  const subsystem = createPokeManBattleSubsystem({ state: {}, content: {}, events: {} }, {
    readBattleContracts: async () => ({}), resolveLabTutorialBattle: async () => ({}), readDeepSeekConfiguration: async () => ({ apiKey: "x" }),
    decision: {}, presentation: {}, runtime, settleBattleContracts: async () => {},
    subscribeLifecycle: async (_scope, listener) => { lifecycleListener = listener; listener("foreground"); return { close() {} }; },
  });
  const pending = subsystem.frame({
    params: { scenarioId: "lab-rival-tutorial", source: { mapId: 4, rival: { instanceId: "rival-lab", npcId: "rival-lab" } } },
    signal: new AbortController().signal,
    async call(key, value) { prompt = { key, value }; return messageResult; },
  });
  while (lifecycleListener === undefined || status === "created") await new Promise((resolve) => setImmediate(resolve));
  lifecycleListener("background");
  assert.equal(status, "initializing");
  assert.equal(pauseCalls, 0);
  status = "running";
  transitionListener({ from: "initializing", to: "running" });
  while (status !== "paused") await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(pauseCalls, 1);
  assert.equal(prompt, undefined);
  lifecycleListener("foreground");
  while (prompt === undefined) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(prompt.value.messageKey, "battle-host-background-paused");
  resolveMessage(completed({ messageKey: prompt.value.messageKey, actionId: "continue" }));
  assert.equal((await pending).type, "cancelled");
});

test("Battle subscribes before asynchronous business and Content initialization", async () => {
  let lifecycleListener; let pauseListener; let transitionListener; let releaseContracts; let resolveRun; let resolveMessage;
  let contractsStarted = false; let status = "created"; let runCalls = 0;
  const contractsReady = new Promise((resolve) => { releaseContracts = resolve; });
  const runResult = new Promise((resolve) => { resolveRun = resolve; });
  const messageResult = new Promise((resolve) => { resolveMessage = resolve; });
  const runtime = {
    onPause(listener) { pauseListener = listener; return () => {}; },
    onTransition(listener) { transitionListener = listener; return () => {}; },
    run() { runCalls += 1; status = "initializing"; return runResult; },
    getSnapshot() { return { battleId: "battle-early-background", status, ...(status === "paused" ? { pauseReason: "host-background" } : {}), actors: [] }; },
    pause(reason) { assert.equal(reason, "host-background"); assert.equal(status, "running"); status = "paused"; pauseListener({ reason }); },
    resume() { status = "running"; resolveRun({ type: "cancelled" }); },
    cancel() { resolveRun({ type: "cancelled" }); }, close() {},
  };
  let prompt;
  const subsystem = createPokeManBattleSubsystem({ state: {}, content: {}, events: {} }, {
    async readBattleContracts() { contractsStarted = true; await contractsReady; return {}; },
    resolveLabTutorialBattle: async () => ({}), readDeepSeekConfiguration: async () => ({ apiKey: "x" }),
    decision: {}, presentation: {}, runtime, settleBattleContracts: async () => {},
    subscribeLifecycle: async (_scope, listener) => { lifecycleListener = listener; listener("foreground"); return { close() {} }; },
  });
  const pending = subsystem.frame({
    params: { scenarioId: "lab-rival-tutorial", source: { mapId: 4, rival: { instanceId: "rival-lab", npcId: "rival-lab" } } },
    signal: new AbortController().signal,
    async call(key, value) { prompt = { key, value }; return messageResult; },
  });
  while (lifecycleListener === undefined || !contractsStarted) await new Promise((resolve) => setImmediate(resolve));
  lifecycleListener("background");
  assert.equal(runCalls, 0, "background is captured before Runtime construction");
  releaseContracts();
  while (status !== "initializing") await new Promise((resolve) => setImmediate(resolve));
  status = "running";
  transitionListener({ from: "initializing", to: "running" });
  while (status !== "paused") await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(prompt, undefined);
  lifecycleListener("foreground");
  while (prompt === undefined) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(prompt.value.messageKey, "battle-host-background-paused");
  resolveMessage(completed({ messageKey: prompt.value.messageKey, actionId: "continue" }));
  assert.equal((await pending).type, "cancelled");
});

test("production Host publisher reaches Battle through Session Events without duplicate prompts", async () => {
  const hub = createSessionEventHub();
  const binding = hub.createBinding("battle");
  const host = createHostLifecyclePublisher(hub, { sessionEpoch: "battle-test", initialState: "foreground" });
  let pauseListener; let status = "running"; let reason; let resolveRun; let resolveMessage; let messageCalls = 0;
  const runtime = {
    onPause(listener) { pauseListener = listener; return () => {}; },
    onTransition() { return () => {}; },
    run() { return new Promise((resolve) => { resolveRun = resolve; }); },
    getSnapshot() { return { battleId: "battle-real-events", status, ...(reason === undefined ? {} : { pauseReason: reason }), actors: [] }; },
    pause(nextReason) { if (status === "paused") return; status = "paused"; reason = nextReason; pauseListener({ reason }); },
    resume() { status = "running"; reason = undefined; resolveRun({ type: "cancelled" }); },
    cancel() { resolveRun({ type: "cancelled" }); }, close() {},
  };
  const subsystem = createPokeManBattleSubsystem({ state: {}, content: {}, events: binding }, {
    readBattleContracts: async () => ({}), resolveLabTutorialBattle: async () => ({}), readDeepSeekConfiguration: async () => ({ apiKey: "x" }),
    decision: {}, presentation: {}, runtime, settleBattleContracts: async () => {},
  });
  const pending = subsystem.frame({
    params: { scenarioId: "lab-rival-tutorial", source: { mapId: 4, rival: { instanceId: "rival-lab", npcId: "rival-lab" } } },
    signal: new AbortController().signal,
    async call(_key, value) { messageCalls += 1; return new Promise((resolve) => { resolveMessage = () => resolve(completed({ messageKey: value.messageKey, actionId: "continue" })); }); },
  });
  while (pauseListener === undefined) await new Promise((resolve) => setImmediate(resolve));
  await host.publish("background");
  while (status !== "paused") await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reason, "host-background");
  await host.publish("background");
  await host.publish("foreground");
  while (resolveMessage === undefined) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(status, "paused");
  assert.equal(messageCalls, 1);
  resolveMessage();
  assert.equal((await pending).type, "cancelled");
  host.close(); binding.close(); hub.terminate();
});

test("decision-circuit remains the pause reason across background and foreground with one Message", async () => {
  let pauseListener; let lifecycleListener; let resolveRun; let resolveMessage; let messageCalls = 0;
  const runtime = {
    onPause(listener) { pauseListener = listener; return () => {}; },
    onTransition() { return () => {}; },
    run() { return new Promise((resolve) => { resolveRun = resolve; }); },
    getSnapshot() { return { battleId: "battle-precedence", status: "paused", pauseReason: "decision-circuit", actors: [] }; },
    pause() { throw new Error("paused decision-circuit must not be overwritten"); },
    resume() { resolveRun({ type: "cancelled" }); }, cancel() { resolveRun({ type: "cancelled" }); }, close() {},
  };
  const subsystem = createPokeManBattleSubsystem({ state: {}, content: {}, events: {} }, {
    readBattleContracts: async () => ({}), resolveLabTutorialBattle: async () => ({}), readDeepSeekConfiguration: async () => ({ apiKey: "x" }),
    decision: {}, presentation: {}, runtime, settleBattleContracts: async () => {},
    subscribeLifecycle: async (_scope, listener) => { lifecycleListener = listener; listener("foreground"); return { close() {} }; },
  });
  const pending = subsystem.frame({
    params: { scenarioId: "lab-rival-tutorial", source: { mapId: 4, rival: { instanceId: "rival-lab", npcId: "rival-lab" } } },
    signal: new AbortController().signal,
    async call(_key, value) { messageCalls += 1; return new Promise((resolve) => { resolveMessage = () => resolve(completed({ messageKey: value.messageKey, actionId: "retry" })); }); },
  });
  while (pauseListener === undefined || lifecycleListener === undefined) await new Promise((resolve) => setImmediate(resolve));
  pauseListener({ reason: "decision-circuit" });
  while (resolveMessage === undefined) await new Promise((resolve) => setImmediate(resolve));
  lifecycleListener("background");
  lifecycleListener("foreground");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runtime.getSnapshot().pauseReason, "decision-circuit");
  assert.equal(messageCalls, 1);
  resolveMessage();
  assert.equal((await pending).type, "cancelled");
});

test("pause Message exit cancels without settling Contract HP", async () => {
  let pauseListener; let resolveRun; let cancelCount = 0; let settlementCount = 0;
  const runtime = {
    onPause(listener) { pauseListener = listener; return () => {}; },
    onTransition() { return () => {}; },
    run() { return new Promise((resolve) => { resolveRun = resolve; }); },
    getSnapshot() { return { battleId: "battle-exit", status: "paused", pauseReason: "decision-circuit", actors: [] }; },
    pause() {}, resume() {}, close() {},
    cancel() { cancelCount += 1; resolveRun({ type: "cancelled" }); },
  };
  const subsystem = createPokeManBattleSubsystem({ state: {}, content: {}, events: {} }, {
    readBattleContracts: async () => ({}), resolveLabTutorialBattle: async () => ({}), readDeepSeekConfiguration: async () => ({ apiKey: "x" }),
    decision: {}, presentation: {}, runtime,
    settleBattleContracts: async () => { settlementCount += 1; throw new Error("exit must not settle"); },
    subscribeLifecycle: async (_scope, listener) => { listener("foreground"); return { close() {} }; },
  });
  const pending = subsystem.frame({
    params: { scenarioId: "lab-rival-tutorial", source: { mapId: 4, rival: { instanceId: "rival-lab", npcId: "rival-lab" } } },
    signal: new AbortController().signal,
    async call(_key, value) { return completed({ messageKey: value.messageKey, actionId: "exit" }); },
  });
  while (pauseListener === undefined) await new Promise((resolve) => setImmediate(resolve));
  pauseListener({ reason: "decision-circuit" });
  assert.equal((await pending).type, "cancelled");
  assert.equal(cancelCount, 1); assert.equal(settlementCount, 0);
});
