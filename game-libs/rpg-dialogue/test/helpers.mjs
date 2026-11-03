import assert from "node:assert/strict";
import { RPGDialogue } from "../dist/index.js";

export function request(overrides = {}) {
  const conversationData = Object.hasOwn(overrides, "conversationData")
    ? overrides.conversationData
    : { windowStyle: "classic" };
  const choices = overrides.choices ?? [];
  const characters = overrides.characters ?? [];
  return {
    conversation: {
      text: overrides.text ?? "Hello",
      choices,
      data: conversationData,
      ...(Object.hasOwn(overrides, "speakerName") ? { speakerName: overrides.speakerName } : { speakerName: "Guide" }),
    },
    characters,
  };
}

export function choice(choiceId, overrides = {}) {
  return {
    choiceId,
    text: overrides.text ?? choiceId,
    data: overrides.data ?? { icon: choiceId },
    ...(Object.hasOwn(overrides, "enabled") ? { enabled: overrides.enabled } : {}),
  };
}

export function character(characterId, overrides = {}) {
  return {
    characterId,
    active: overrides.active ?? true,
    data: overrides.data ?? { portrait: characterId },
    ...(Object.hasOwn(overrides, "displayName") ? { displayName: overrides.displayName } : {}),
  };
}

export function history(entryId, overrides = {}) {
  return {
    entryId,
    text: overrides.text ?? entryId,
    ...(Object.hasOwn(overrides, "speakerName") ? { speakerName: overrides.speakerName } : {}),
  };
}

export function findNode(state, key) {
  const visit = (nodes) => {
    for (const node of nodes) {
      if (node.key === key) return node;
      const child = visit(node.children);
      if (child) return child;
    }
    return undefined;
  };
  return visit(state.roots);
}

export function findTag(state, tag) {
  const found = [];
  const visit = (nodes) => {
    for (const node of nodes) {
      if (node.tag === tag) found.push(node);
      visit(node.children);
    }
  };
  visit(state.roots);
  return found;
}

export async function turn() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

export function harness(options = {}) {
  const frameController = new AbortController();
  const scopeController = new AbortController();
  const handlers = new Map();
  const states = [];
  const events = [];
  const operations = [];
  let listenerCreates = 0;
  let listenerCloses = 0;
  let domainCreates = 0;
  let domainCloses = 0;
  let unsubscribeCount = 0;
  const scope = {
    signal: scopeController.signal,
    state: {},
    content: {},
    viewport: {},
    events: { async subscribe(channels, listener) {
      listenerCreates += 1;
      if (options.subscriptionCreateError) throw options.subscriptionCreateError;
      operations.push({ type: "listener.create", channels: [...channels] });
      for (const channel of channels) handlers.set(channel, (payload) => listener({
        channel,
        type: payload.name,
        payload: { domainId: payload.domainId, targetKey: payload.targetKey, data: payload.data },
        source: { subsystemKey: "game" },
      }));
      return { closed: new Promise(() => {}), close() { listenerCloses += 1; operations.push({ type: "listener.close" }); handlers.clear(); } };
    } },
    createRenderDomain(initial) {
      domainCreates += 1;
      if (options.domainCreateError) throw options.domainCreateError;
      states.push(initial);
      operations.push({ type: "domain.create", state: initial });
      return {
        replace(state) {
          if (options.domainReplaceError) throw options.domainReplaceError;
          states.push(state);
          operations.push({ type: "domain.replace", state });
        },
        update() { throw new Error("Dialogue must not use update in this harness"); },
        emit(event) {
          if (options.domainEmitError) throw options.domainEmitError;
          events.push(event);
          operations.push({ type: "domain.emit", event });
        },
        close() { domainCloses += 1; operations.push({ type: "domain.close" }); },
      };
    },
  };
  const frameObject = {
    id: "dialogue-frame",
    params: null,
    signal: frameController.signal,
    async call() { throw new Error("unused"); },
  };
  const dialogue = new RPGDialogue(scope, frameObject, options.dialogueOptions);
  const emit = (channel, payload) => handlers.get(channel)?.(payload);
  const submit = (conversationId, data = {}) => emit("x.loomrealm.web-presentation.event", {
    domainId: "opaque-domain",
    targetKey: "conversation",
    name: "submit",
    data: { conversationId, ...data },
  });
  return {
    dialogue,
    scope,
    frame: frameObject,
    frameController,
    scopeController,
    states,
    events,
    operations,
    emit,
    submit,
    latest: () => states.at(-1),
    counts: () => ({ listenerCreates, listenerCloses, domainCreates, domainCloses, unsubscribeCount }),
  };
}

export async function openStarted(fixture, value) {
  const pending = fixture.dialogue.openConversation(value);
  await turn();
  assert.ok(fixture.latest(), "expected Dialogue projection");
  return { pending };
}

export function conversationId(fixture) {
  return findNode(fixture.latest(), "conversation").attrs["conversation-id"];
}
