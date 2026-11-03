import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(root, "presentation/dialogue.browser.js");
const cssPath = path.join(root, "presentation/dialogue.css");
const spritePath = path.join(root, "[FSDB]PokeMan/[resource]Graphics/Characters/Professor.png");
const spriteBytes = await readFile(spritePath);
const spriteVersion = `sha256:${createHash("sha256").update(spriteBytes).digest("hex")}`;
const tags = [
  "lr-dialogue-view",
  "lr-dialogue-characters",
  "lr-dialogue-character",
  "lr-dialogue-conversation",
  "lr-dialogue-text",
  "lr-dialogue-choices",
  "lr-dialogue-choice",
  "lr-dialogue-controls",
  "lr-dialogue-control-hint",
  "lr-dialogue-history",
  "lr-dialogue-history-entry",
];
const actions = ["confirm", "previous", "next", "history", "cancel"];
const version = `sha256:${"a".repeat(64)}`;
const viewports = Object.freeze([
  { width: 1280, height: 720 },
  { width: 800, height: 600 },
  { width: 640, height: 480 },
  { width: 360, height: 480 },
]);

function executablePath() {
  return [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find(existsSync);
}

async function pageFixture(t, { reduced = false } = {}) {
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ path: cssPath });
  await page.addScriptTag({ path: scriptPath });
  await page.evaluate(() => {
    globalThis.setHint = (fixture, action, enabled) => {
      fixture.controls.querySelector(`[action="${action}"]`).setAttribute("enabled", enabled ? "true" : "false");
    };
    globalThis.setHints = (fixture, enabled) => {
      for (const action of ["confirm", "previous", "next", "history", "cancel"]) setHint(fixture, action, enabled);
    };
    // Records the complete hidden transition history of the shell by deriving
    // each mutation's resulting state from the MutationRecord itself. Reading
    // element.hidden inside the callback could only ever see the batch-final
    // state and would miss a same-batch false → true → false flash. For the
    // reflected boolean hidden attribute: oldValue === null means the attribute
    // was added (state true); oldValue !== null means it was removed (false).
    globalThis.observeShellHidden = (view) => {
      const modal = view.shadowRoot.querySelector(".modal");
      const backdrop = view.shadowRoot.querySelector(".backdrop");
      const transitions = { modal: [modal.hidden], backdrop: [backdrop.hidden] };
      const derive = (record) => {
        if (record.type !== "attributes" || record.attributeName !== "hidden") return;
        const key = record.target === modal ? "modal" : "backdrop";
        const next = record.oldValue === null;
        if (transitions[key].at(-1) !== next) transitions[key].push(next);
      };
      const observer = new MutationObserver((records) => {
        for (const record of records) derive(record);
      });
      observer.observe(modal, { attributes: true, attributeFilter: ["hidden"], attributeOldValue: true });
      observer.observe(backdrop, { attributes: true, attributeFilter: ["hidden"], attributeOldValue: true });
      return transitions;
    };
    globalThis.makeDialogueFixture = ({ text = "这是一段用于测试逐字显示的中文长文本。", choices = [], characters = [], historyEntries = [] } = {}) => {
      const emitted = [];
      const view = document.createElement("lr-dialogue-view");
      const characterList = document.createElement("lr-dialogue-characters");
      for (const item of characters) {
        const character = document.createElement("lr-dialogue-character");
        character.setAttribute("character-id", item.id);
        character.setAttribute("display-name", item.name ?? item.id);
        character.setAttribute("active", item.active ? "true" : "false");
        characterList.append(character);
      }
      const conversation = document.createElement("lr-dialogue-conversation");
      conversation.receiveRenderContext({ resources: { resource: async () => { throw new Error("unconfigured resource"); } }, emitCustomEvent(name, data = {}) { emitted.push({ name, data }); } });
      conversation.setAttribute("conversation-id", "conversation-1");
      conversation.setAttribute("speaker-name", "向导");
      const textElement = document.createElement("lr-dialogue-text");
      textElement.setAttribute("text", text);
      const choiceList = document.createElement("lr-dialogue-choices");
      for (const item of choices) {
        const choice = document.createElement("lr-dialogue-choice");
        choice.setAttribute("choice-id", item.id);
        choice.setAttribute("text", item.text ?? item.id);
        choice.setAttribute("enabled", item.enabled === false ? "false" : "true");
        choiceList.append(choice);
      }
      conversation.append(textElement, choiceList);
      const controls = document.createElement("lr-dialogue-controls");
      for (const action of ["confirm", "previous", "next", "history", "cancel"]) {
        const hint = document.createElement("lr-dialogue-control-hint");
        hint.setAttribute("action", action);
        hint.setAttribute("label", action);
        hint.setAttribute("enabled", "false");
        controls.append(hint);
      }
      const history = document.createElement("lr-dialogue-history");
      history.setAttribute("visible", "false");
      for (const item of historyEntries) {
        const entry = document.createElement("lr-dialogue-history-entry");
        entry.setAttribute("entry-id", item.id);
        if (item.speaker) entry.setAttribute("speaker-name", item.speaker);
        entry.setAttribute("text", item.text);
        history.append(entry);
      }
      view.append(characterList, conversation, controls, history);
      document.body.append(view);
      return { view, characterList, conversation, textElement, choiceList, controls, history, emitted };
    };
  });
  return page;
}

function assertNeverHidden(transitions, label) {
  for (const [key, history] of Object.entries({ modal: transitions.modal, backdrop: transitions.backdrop })) {
    const firstVisible = history.indexOf(false);
    assert.notEqual(firstVisible, -1, `${label}: ${key} must become visible (${history})`);
    assert.equal(history.slice(firstVisible).includes(true), false, `${label}: ${key} must never become hidden again after first presentation (${history})`);
  }
}

test("classic artifact registers every canonical tag and collision preflight is atomic", async (t) => {
  const source = await readFile(scriptPath, "utf8");
  assert.doesNotMatch(source, /^\s*(?:import|export)\s/m);
  const page = await pageFixture(t);
  assert.deepEqual(await page.evaluate((names) => names.map((name) => [name, typeof customElements.get(name)]), tags), tags.map((tag) => [tag, "function"]));

  const collisionBrowser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => collisionBrowser.close());
  const collisionPage = await collisionBrowser.newPage();
  await collisionPage.setContent("<!doctype html><html><body></body></html>");
  await collisionPage.evaluate(() => customElements.define("lr-dialogue-choice", class extends HTMLElement {}));
  const failure = collisionPage.waitForEvent("pageerror");
  await collisionPage.addScriptTag({ path: scriptPath });
  assert.match((await failure).message, /collision/);
  assert.equal(await collisionPage.evaluate(() => customElements.get("lr-dialogue-view") === undefined), true);
});

test("initial READY stays hidden and inert without first-connect flash", async (t) => {
  const page = await pageFixture(t);
  const incomplete = await page.evaluate(() => {
    const view = document.createElement("lr-dialogue-view");
    const controls = document.createElement("lr-dialogue-controls");
    for (const action of ["confirm", "previous", "next", "history"]) {
      const hint = document.createElement("lr-dialogue-control-hint");
      hint.setAttribute("action", action);
      hint.setAttribute("enabled", action === "confirm" ? "true" : "false");
      controls.append(hint);
    }
    view.append(controls);
    document.body.append(view);
    const modal = view.shadowRoot.querySelector(".modal");
    const result = { hidden: modal.hidden, backdropHidden: view.shadowRoot.querySelector(".backdrop").hidden, inert: view.inert, modalInert: modal.inert, facts: { complete: view._controlsComplete, interaction: view._interactionActive, shell: view._shellPresented } };
    view.remove();
    return result;
  });
  assert.deepEqual(incomplete, {
    hidden: true,
    backdropHidden: true,
    inert: true,
    modalInert: true,
    facts: { complete: false, interaction: false, shell: false },
  }, "an incomplete canonical control set must remain hidden and inert");

  const initial = await page.evaluate(() => {
    const fixture = makeDialogueFixture({
      characters: [
        { id: "inactive", active: false },
        { id: "first", name: "甲", active: true },
        { id: "second", name: "乙", active: true },
      ],
    });
    globalThis.fixture = fixture;
    fixture.hiddenTransitions = observeShellHidden(fixture.view);
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    return {
      hidden: modal.hidden,
      backdropHidden: fixture.view.shadowRoot.querySelector(".backdrop").hidden,
      inert: fixture.view.inert,
      modalInert: modal.inert,
      conversationActive: fixture.conversation._interactionActive,
      slotDisplay: getComputedStyle(fixture.view.shadowRoot.querySelector("slot")).display,
      presented: [...fixture.characterList.children].map((character) => character._presented),
      facts: { complete: fixture.view._controlsComplete, interaction: fixture.view._interactionActive, shell: fixture.view._shellPresented },
    };
  });
  assert.deepEqual(initial, {
    hidden: true,
    backdropHidden: true,
    inert: true,
    modalInert: true,
    conversationActive: false,
    slotDisplay: "contents",
    presented: [false, true, false],
    facts: { complete: true, interaction: false, shell: false },
  }, "complete-but-disabled facts are the initial READY: hidden, inert, Conversation inactive");
});

test("first ACTIVE presents the shell once; active-character fallback keeps the pane; semantic hints stay physical-glyph-free", async (t) => {
  const page = await pageFixture(t);
  const active = await page.evaluate(async (expectedVersion) => {
    const fixture = makeDialogueFixture({
      characters: [
        { id: "inactive", active: false },
        { id: "first", name: "甲", active: true },
        { id: "second", name: "乙", active: true },
      ],
    });
    globalThis.fixture = fixture;
    const { view, controls, characterList } = fixture;
    const modal = view.shadowRoot.querySelector(".modal");
    const transitions = observeShellHidden(fixture.view);
    const activeCharacter = characterList.children[1];
    activeCharacter.receiveRenderContext({ resources: { resource: async () => { throw new Error("resource failure"); } } });
    activeCharacter.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Missing", contentVersion: expectedVersion } });
    setHint(fixture, "confirm", true);
    while (activeCharacter._spriteStatus === "loading") await new Promise((resolve) => setTimeout(resolve, 0));
    return {
      hidden: modal.hidden,
      backdropHidden: view.shadowRoot.querySelector(".backdrop").hidden,
      inert: view.inert,
      modalInert: modal.inert,
      conversationActive: fixture.conversation._interactionActive,
      withCharacter: modal.classList.contains("with-character"),
      columns: getComputedStyle(modal).gridTemplateColumns.split(" ").map((value) => Number.parseFloat(value)),
      spriteStatus: activeCharacter._spriteStatus,
      fallbackVisible: !activeCharacter.shadowRoot.querySelector(".fallback").hidden,
      label: modal.getAttribute("aria-label"),
      hints: [...controls.children].map((hint) => hint.shadowRoot.querySelector(".hint").textContent),
      physical: controls.shadowRoot.textContent,
      transitions,
      facts: { complete: view._controlsComplete, interaction: view._interactionActive, shell: view._shellPresented },
    };
  }, version);
  assert.equal(active.hidden, false, "first ACTIVE must present the shell");
  assert.equal(active.backdropHidden, false);
  assert.equal(active.inert, false);
  assert.equal(active.modalInert, false);
  assert.equal(active.conversationActive, true);
  assert.equal(active.withCharacter, true, "a failed sprite must not collapse the active-character pane");
  assert.equal(active.spriteStatus, "fallback");
  assert.equal(active.fallbackVisible, true);
  assert.equal(active.label, "对话");
  assert.ok(Math.abs(active.columns[0] / (active.columns[0] + active.columns[1]) - 0.30) < 0.01, "active character uses a ~30/70 split");
  assert.deepEqual(active.hints, ["继续", "上一个", "下一个", "历史", "返回"]);
  assert.doesNotMatch(active.physical, /Enter|Space|Arrow|Gamepad|\[A\]|\[B\]|\[Y\]/i);
  assert.deepEqual(active.transitions, { modal: [true, false], backdrop: [true, false] }, "shell must transition exactly once from hidden to visible");
  assert.deepEqual(active.facts, { complete: true, interaction: true, shell: true });

  const noCharacter = await page.evaluate(() => {
    for (const character of fixture.characterList.children) character.setAttribute("active", "false");
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    return {
      withCharacter: modal.classList.contains("with-character"),
      columns: getComputedStyle(modal).gridTemplateColumns,
    };
  });
  assert.equal(noCharacter.withCharacter, false);
  assert.equal(noCharacter.columns.split(" ").length, 1, "transient speaker/no active character must use full width");
});

test("exact v1.1 truth table: intermediate READY keeps the visible shell inert, ACTIVE+HISTORY keeps the shell interactive", async (t) => {
  const page = await pageFixture(t);
  await page.evaluate(() => {
    globalThis.fixture = makeDialogueFixture({
      text: "真值表验证：第一段对话的逐字文本需要足够长，用于观察 READY 暂停。",
      characters: [{ id: "guide", active: true }],
    });
    fixture.hiddenTransitions = observeShellHidden(fixture.view);
  });
  const initialReady = await page.evaluate(() => {
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    return { hidden: modal.hidden, inert: fixture.view.inert, conversationActive: fixture.conversation._interactionActive };
  });
  assert.deepEqual(initialReady, { hidden: true, inert: true, conversationActive: false }, "initial READY before first ACTIVE");

  await page.waitForFunction(() => {
    setHint(fixture, "confirm", true);
    return fixture.view._interactionActive === true;
  });
  const activeConversation = await page.evaluate(() => {
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    return { hidden: modal.hidden, inert: fixture.view.inert, conversationActive: fixture.conversation._interactionActive };
  });
  assert.deepEqual(activeConversation, { hidden: false, inert: false, conversationActive: true }, "ACTIVE + CONVERSATION");

  const intermediateReady = await page.evaluate(() => {
    setHints(fixture, false);
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    return { hidden: modal.hidden, inert: fixture.view.inert, conversationActive: fixture.conversation._interactionActive };
  });
  assert.deepEqual(intermediateReady, { hidden: false, inert: true, conversationActive: false }, "intermediate READY after an ACTIVE keeps the shell visible but inert");

  const activeHistory = await page.evaluate(() => {
    setHint(fixture, "history", true);
    setHint(fixture, "cancel", true);
    fixture.history.setAttribute("visible", "true");
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    return { hidden: modal.hidden, inert: fixture.view.inert, conversationActive: fixture.conversation._interactionActive, historyMode: modal.classList.contains("history-mode") };
  });
  assert.deepEqual(activeHistory, { hidden: false, inert: false, conversationActive: false, historyMode: true }, "ACTIVE + HISTORY: shell interactive, Conversation paused, History owns interaction");

  const restored = await page.evaluate(() => {
    fixture.history.setAttribute("visible", "false");
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    return { hidden: modal.hidden, inert: fixture.view.inert, conversationActive: fixture.conversation._interactionActive, historyMode: modal.classList.contains("history-mode") };
  });
  assert.deepEqual(restored, { hidden: false, inert: false, conversationActive: true, historyMode: false }, "History close restores the Conversation interaction owner");
});

test("intermediate READY ignores Conversation events, pauses reveal, and preserves retained local state", async (t) => {
  const page = await pageFixture(t);
  await page.evaluate(() => {
    globalThis.fixture = makeDialogueFixture({
      text: `READY 暂停验证：${"这段文字足够长，用于确保正文区域可以滚动，".repeat(24)}`,
      choices: [{ id: "one" }, { id: "two" }],
    });
    setHint(fixture, "confirm", true);
    fixture.conversation.receiveRenderEvent({ name: "choice-next", data: {} });
  });
  await page.waitForFunction(() => fixture.conversation._revealIndex > 0);
  const result = await page.evaluate(async () => {
    const { view, conversation } = fixture;
    setHints(fixture, false);
    const index = conversation._revealIndex;
    conversation.receiveRenderEvent({ name: "commit", data: {} });
    conversation.receiveRenderEvent({ name: "choice-next", data: {} });
    conversation.receiveRenderEvent({ name: "scroll-up", data: {} });
    await new Promise((resolve) => setTimeout(resolve, 120));
    return {
      index,
      laterIndex: conversation._revealIndex,
      revealComplete: conversation._revealComplete,
      emitted: structuredClone(fixture.emitted),
      selectedChoiceId: conversation._selectedChoiceId,
      retained: document.querySelector("lr-dialogue-conversation") === conversation,
      hidden: view.shadowRoot.querySelector(".modal").hidden,
      inert: view.inert,
      interactionActive: conversation._interactionActive,
    };
  });
  assert.equal(result.index > 0, true);
  assert.equal(result.laterIndex, result.index, "READY must stop the reveal timer");
  assert.equal(result.revealComplete, false, "READY must ignore commit and must not force-reveal");
  assert.deepEqual(result.emitted, [], "READY must ignore Conversation interaction events");
  assert.equal(result.selectedChoiceId, "one", "READY must preserve the retained selection");
  assert.equal(result.retained, true);
  assert.equal(result.hidden, false, "intermediate READY keeps the shell visible");
  assert.equal(result.inert, true);
  assert.equal(result.interactionActive, false);

  const resumed = await page.evaluate(async () => {
    setHint(fixture, "confirm", true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { index: fixture.conversation._revealIndex, active: fixture.conversation._interactionActive };
  });
  assert.equal(resumed.active, true);
  assert.ok(resumed.index > result.index, "the same Conversation resumes reveal from its retained index after ACTIVE returns");
});

test("shell hidden-transition observer detects a same-batch transient flash", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async () => {
    const fixture = makeDialogueFixture({ text: "观察者自检：必须能捕获同批次的瞬时隐藏闪烁。" });
    setHint(fixture, "confirm", true);
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    if (modal.hidden !== false) throw new Error("precondition: shell must be presented before the probe");
    const transitions = observeShellHidden(fixture.view);
    // Inject the exact bug class the observer exists to catch: a transient
    // hidden flash whose two attribute mutations land in ONE MutationObserver
    // batch. A callback that only sampled element.hidden would see just [false].
    modal.hidden = true;
    modal.hidden = false;
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { history: structuredClone(transitions), finalHidden: modal.hidden };
  });
  assert.deepEqual(result.history.modal, [false, true, false],
    "the record-based observer must capture the intermediate hidden=true of a same-batch flash");
  assert.deepEqual(result.history.backdrop, [false], "an untouched sibling stays unrecorded");
  assert.equal(result.finalHidden, false);
});

test("A → READY → B → READY → C keeps one continuous shell with no hidden flash", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async () => {
    const fixture = makeDialogueFixture({
      text: "第一段对话内容，用于验证连续会话外壳的视觉连续性。",
      characters: [{ id: "professor", name: "博士", active: true }],
    });
    globalThis.fixture = fixture;
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    const backdrop = fixture.view.shadowRoot.querySelector(".backdrop");
    const stage = fixture.characterList.shadowRoot.querySelector(".character-stage");
    const transitions = observeShellHidden(fixture.view);
    const conversationA = fixture.conversation;
    const characterElement = fixture.characterList.children[0];

    setHint(fixture, "confirm", true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const rectA = modal.getBoundingClientRect().toJSON();
    const stageRectA = stage.getBoundingClientRect().toJSON();
    const afterActive = { hidden: modal.hidden, transitions: structuredClone(transitions) };
    setHints(fixture, false);
    const afterReady = { hidden: modal.hidden, rect: modal.getBoundingClientRect().toJSON(), stageRect: stage.getBoundingClientRect().toJSON() };

    conversationA.setAttribute("conversation-id", "conversation-2");
    fixture.textElement.setAttribute("text", "第二段对话内容：同一外壳内原子更新正文。");
    setHint(fixture, "confirm", true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterB = {
      hidden: modal.hidden,
      sameModal: fixture.view.shadowRoot.querySelector(".modal") === modal,
      sameBackdrop: fixture.view.shadowRoot.querySelector(".backdrop") === backdrop,
      sameConversation: document.querySelector("lr-dialogue-conversation") === conversationA,
      sameCharacter: fixture.characterList.children[0] === characterElement,
      observedId: conversationA._observedConversationId,
      revealRestarted: conversationA._revealIndex === 0 && conversationA._revealText === "第二段对话内容：同一外壳内原子更新正文。",
      transitions: structuredClone(transitions),
    };
    await new Promise((resolve) => setTimeout(resolve, 90));

    setHints(fixture, false);
    fixture.conversation.setAttribute("conversation-id", "conversation-3");
    fixture.textElement.setAttribute("text", "第三段对话内容：B 到 C 依然保持连续。");
    setHint(fixture, "confirm", true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterC = {
      hidden: modal.hidden,
      observedId: fixture.conversation._observedConversationId,
      rect: modal.getBoundingClientRect().toJSON(),
      stageRect: stage.getBoundingClientRect().toJSON(),
      transitions,
    };
    return { afterActive, afterReady, afterB, afterC, rectA, stageRectA };
  });

  assert.equal(result.afterActive.hidden, false);
  assert.deepEqual(result.afterActive.transitions, { modal: [true, false], backdrop: [true, false] }, "first ACTIVE shows the shell exactly once");
  assert.equal(result.afterReady.hidden, false, "A settle → READY keeps the modal visible");
  assert.deepEqual(pickRect(result.afterReady.rect), pickRect(result.rectA), "READY must not change modal geometry");
  assert.deepEqual(pickRect(result.afterReady.stageRect), pickRect(result.stageRectA), "READY must not change the character stage geometry");
  assert.equal(result.afterB.hidden, false);
  assert.equal(result.afterB.sameModal, true, "Conversation B must reuse the same modal element");
  assert.equal(result.afterB.sameBackdrop, true, "Conversation B must reuse the same backdrop element");
  assert.equal(result.afterB.sameConversation, true, "Conversation B must reuse the same conversation element");
  assert.equal(result.afterB.sameCharacter, true, "the same character must keep the same element identity");
  assert.equal(result.afterB.observedId, "conversation-2");
  assert.equal(result.afterB.revealRestarted, true, "Conversation B restarts reveal from the beginning");
  assertNeverHidden(result.afterB.transitions, "A → READY → B");
  assert.equal(result.afterC.hidden, false);
  assert.equal(result.afterC.observedId, "conversation-3");
  assertNeverHidden(result.afterC.transitions, "A → READY → B → READY → C");
  assert.deepEqual(pickRect(result.afterC.rect), pickRect(result.rectA), "C keeps the same modal geometry");
  assert.deepEqual(pickRect(result.afterC.stageRect), pickRect(result.stageRectA), "C keeps the same character stage geometry");
});

function pickRect(rect) {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

test("History stays interactive while the Conversation is paused and preserves reveal, selection, and scroll", async (t) => {
  const page = await pageFixture(t);
  await page.evaluate(() => {
    globalThis.fixture = makeDialogueFixture({
      text: `这段文字足够长，用于观察打开历史记录时逐字显示会暂停。${"正文内容持续追加，".repeat(40)}`,
      choices: [{ id: "one" }, { id: "two" }],
      characters: [{ id: "guide", active: true }],
      historyEntries: [{ id: "intro", speaker: "博士", text: "欢迎" }],
    });
    setHint(fixture, "confirm", true);
    setHint(fixture, "history", true);
    setHint(fixture, "cancel", true);
    fixture.hiddenTransitions = observeShellHidden(fixture.view);
    fixture.conversation.receiveRenderEvent({ name: "choice-next", data: {} });
  });
  await page.waitForFunction(() => fixture.conversation._revealIndex > 0);
  const state = await page.evaluate(async () => {
    const { view, conversation, characterList, history } = fixture;
    const modal = view.shadowRoot.querySelector(".modal");
    const beforeRect = modal.getBoundingClientRect().toJSON();
    const beforeIndex = conversation._revealIndex;
    history.setAttribute("visible", "true");
    const synchronous = {
      mode: view._mode,
      conversationActive: conversation._interactionActive,
      viewInert: view.inert,
      historyMode: modal.classList.contains("history-mode"),
    };
    history.receiveRenderEvent({ name: "scroll-to-latest", data: {} });
    history.receiveRenderEvent({ name: "scroll-up", data: {} });
    history.receiveRenderEvent({ name: "scroll-down", data: {} });
    await new Promise((resolve) => setTimeout(resolve, 90));
    const pausedIndex = conversation._revealIndex;
    const duringRect = modal.getBoundingClientRect().toJSON();
    const historyRect = history.getBoundingClientRect();
    const contentWidth = modal.clientWidth - 32;
    const displays = {
      character: getComputedStyle(characterList).display,
      conversation: getComputedStyle(conversation).display,
      history: getComputedStyle(history).display,
    };
    const empty = history.shadowRoot.querySelector(".empty");
    history.setAttribute("visible", "false");
    await new Promise((resolve) => setTimeout(resolve, 70));
    return {
      beforeRect, duringRect, beforeIndex, pausedIndex, resumedIndex: conversation._revealIndex,
      synchronous, displays, emptyHidden: empty.hidden, emptyText: empty.textContent,
      eventMode: history._lastEventMode, events: history._events,
      historyFullWidth: Math.abs(historyRect.width - contentWidth) < 2,
      transitions: structuredClone(fixture.hiddenTransitions),
      viewInertAfterClose: view.inert,
    };
  });
  assert.deepEqual(state.synchronous, { mode: "history", conversationActive: false, viewInert: false, historyMode: true },
    "History is the interaction owner: shell not inert, Conversation paused");
  assert.equal(state.eventMode, "history", "visible reconciliation must finish before scroll-to-latest");
  assert.equal(state.pausedIndex, state.beforeIndex, "reveal pauses while History owns interaction");
  assert.ok(state.resumedIndex > state.pausedIndex, "reveal resumes after History closes");
  assert.deepEqual(state.displays, { character: "none", conversation: "none", history: "block" });
  assert.equal(state.historyFullWidth, true, "History occupies the full modal content width");
  assert.equal(state.emptyHidden, true, "entries exist, so the empty state stays hidden");
  assert.equal(state.emptyText, "暂无历史记录");
  assert.deepEqual(state.events, ["scroll-to-latest", "scroll-up", "scroll-down"]);
  assert.deepEqual(pickRect(state.duringRect), pickRect(state.beforeRect), "History must not change modal geometry");
  assertNeverHidden(state.transitions, "History open/close during ACTIVE");
  assert.equal(state.viewInertAfterClose, false, "Conversation mode restores interactivity");

  const retained = await page.evaluate(async () => {
    const { conversation, history } = fixture;
    // Finish reveal so the long text makes the body scrollable, then record
    // reveal/selection/scroll state and prove History open/close retains it.
    conversation.receiveRenderEvent({ name: "commit", data: {} });
    const body = conversation.shadowRoot.querySelector(".body");
    body.scrollTop = 40;
    const scrollBefore = body.scrollTop;
    const selectionBefore = conversation._selectedChoiceId;
    const completeBefore = conversation._revealComplete;
    history.setAttribute("visible", "true");
    await new Promise((resolve) => setTimeout(resolve, 30));
    history.setAttribute("visible", "false");
    return {
      scrollBefore,
      scrollAfter: body.scrollTop,
      selectionBefore,
      selectionAfter: conversation._selectedChoiceId,
      completeBefore,
      completeAfter: conversation._revealComplete,
    };
  });
  assert.ok(retained.scrollBefore > 0, "precondition: the completed long text makes the conversation body scrollable");
  assert.equal(retained.selectionBefore, "one", "precondition: selection from the ACTIVE phase is retained");
  assert.equal(retained.scrollAfter, retained.scrollBefore, "History open/close preserves the Conversation scroll");
  assert.equal(retained.selectionAfter, retained.selectionBefore, "History open/close preserves the selection");
  assert.equal(retained.completeAfter, retained.completeBefore, "History open/close preserves the reveal state");
});

test("domain close removes the shell; a fresh second session and a manual reconnect re-arm initial hidden READY", async (t) => {
  const page = await pageFixture(t);
  const first = await page.evaluate(() => {
    const fixture = makeDialogueFixture({ text: "第一个会话。", characters: [{ id: "guide", active: true }] });
    globalThis.firstFixture = fixture;
    setHint(fixture, "confirm", true);
    setHints(fixture, false);
    return {
      readyVisible: !fixture.view.shadowRoot.querySelector(".modal").hidden,
      detachedShell: null,
    };
  });
  assert.equal(first.readyVisible, true, "intermediate READY before close");

  const closed = await page.evaluate(() => {
    const view = globalThis.firstFixture.view;
    view.remove();
    return {
      removed: document.querySelector("lr-dialogue-view") === null,
      hiddenAfterRemove: view.shadowRoot.querySelector(".modal").hidden,
      facts: { shell: view._shellPresented, interaction: view._interactionActive },
    };
  });
  assert.deepEqual(closed, { removed: true, hiddenAfterRemove: true, facts: { shell: false, interaction: false } },
    "removing the Dialogue RenderDomain removes the shell and cleans up Presentation-local state");

  const second = await page.evaluate(() => {
    document.body.replaceChildren();
    const fixture = makeDialogueFixture({ text: "第二个全新会话。", characters: [{ id: "guide", active: true }] });
    globalThis.secondFixture = fixture;
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    const initialHidden = modal.hidden;
    const initialInert = fixture.view.inert;
    setHint(fixture, "confirm", true);
    return {
      initialHidden,
      initialInert,
      visibleAfterActive: !modal.hidden,
      freshElement: document.querySelector("lr-dialogue-view") === fixture.view,
    };
  });
  assert.deepEqual(second, { initialHidden: true, initialInert: true, visibleAfterActive: true, freshElement: true },
    "a fresh second session starts from initial hidden READY again");

  const reconnected = await page.evaluate(() => {
    const fixture = globalThis.secondFixture;
    setHints(fixture, false);
    const view = fixture.view;
    view.remove();
    const hiddenWhileDetached = view.shadowRoot.querySelector(".modal").hidden;
    document.body.append(view);
    const hiddenAfterReconnect = view.shadowRoot.querySelector(".modal").hidden;
    setHint(fixture, "confirm", true);
    return {
      hiddenWhileDetached,
      hiddenAfterReconnect,
      visibleAfterActive: !view.shadowRoot.querySelector(".modal").hidden,
    };
  });
  assert.deepEqual(reconnected, { hiddenWhileDetached: true, hiddenAfterReconnect: true, visibleAfterActive: true },
    "a defensive reconnect resets the Presentation-local latch and re-arms initial hidden READY");
});

test("every sprite-load trigger converges on one idempotent coordinator", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async (expectedVersion) => {
    const calls = [];
    const signals = [];
    const closed = [];
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    HTMLCanvasElement.prototype.getContext = () => ({ imageSmoothingEnabled: true, clearRect() {}, drawImage() {} });
    globalThis.createImageBitmap = async () => ({ width: 16, height: 16, close() { closed.push("closed"); } });
    const context = {
      resources: {
        resource(namespace, key, contentVersion, { signal }) {
          calls.push([namespace, key, contentVersion]);
          signals.push(signal);
          return pending;
        },
      },
    };
    const ref = { sprite: { namespace: "resource.Graphics", key: "Characters/Guide", contentVersion: expectedVersion } };
    const characters = document.createElement("lr-dialogue-characters");
    const character = document.createElement("lr-dialogue-character");
    character.setAttribute("character-id", "guide");
    character.setAttribute("display-name", "向导");
    character.setAttribute("active", "true");
    characters.append(character);
    document.body.append(characters);
    character.receiveRenderContext(context);
    const afterContext = { status: character._spriteStatus, calls: calls.length };
    character.receiveRenderData(structuredClone(ref));
    const attemptStarted = { status: character._spriteStatus, calls: calls.length };
    character.receiveRenderData(structuredClone(ref));
    character.receiveRenderContext(context);
    character.setPresentationActive(true);
    character.setAttribute("active", "true");
    characters.syncActiveToView();
    const whileLoading = {
      status: character._spriteStatus,
      calls: calls.length,
      aborted: signals.map((signal) => signal.aborted),
      fallbackVisible: !character.shadowRoot.querySelector(".fallback").hidden,
      canvasHidden: character.shadowRoot.querySelector("canvas").hidden,
    };
    release({ bytes: new Uint8Array([1]), mime: "image/png", contentVersion: expectedVersion });
    while (character._spriteStatus === "loading") await new Promise((resolve) => setTimeout(resolve, 0));
    character.receiveRenderData(structuredClone(ref));
    character.receiveRenderContext(context);
    character.setPresentationActive(true);
    character.setAttribute("active", "true");
    characters.syncActiveToView();
    const whileReady = {
      status: character._spriteStatus,
      calls: calls.length,
      aborted: signals.map((signal) => signal.aborted),
      fallbackVisible: !character.shadowRoot.querySelector(".fallback").hidden,
      canvasVisible: !character.shadowRoot.querySelector("canvas").hidden,
    };
    character.setPresentationActive(false);
    const whileInactive = {
      status: character._spriteStatus,
      calls: calls.length,
      paneHidden: character.shadowRoot.querySelector(".character").hidden,
      canvasVisible: !character.shadowRoot.querySelector("canvas").hidden,
    };
    character.setPresentationActive(true);
    const whileActiveAgain = { status: character._spriteStatus, calls: calls.length };
    characters.remove();
    return { afterContext, attemptStarted, whileLoading, whileReady, whileInactive, whileActiveAgain };
  }, version);
  assert.deepEqual(result.afterContext, { status: "empty", calls: 0 }, "a context without data must not acquire");
  assert.deepEqual(result.attemptStarted, { status: "loading", calls: 1 });
  assert.deepEqual(result.whileLoading, {
    status: "loading",
    calls: 1,
    aborted: [false],
    fallbackVisible: true,
    canvasHidden: true,
  }, "repeating data/context/active/attr triggers during loading must not abort or restart the request");
  assert.deepEqual(result.whileReady, {
    status: "ready",
    calls: 1,
    aborted: [false],
    fallbackVisible: false,
    canvasVisible: true,
  }, "the same successful attempt must not reload, clear the canvas, or re-show fallback");
  assert.deepEqual(result.whileInactive, {
    status: "ready",
    calls: 1,
    paneHidden: true,
    canvasVisible: true,
  }, "setPresentationActive(false) only hides the pane; it must not destroy the ready canvas");
  assert.deepEqual(result.whileActiveAgain, { status: "ready", calls: 1 });
});

test("failed sprite attempts do not auto-retry, but ref/context/epoch changes create new acquisition opportunities", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async (expectedVersion) => {
    const calls = [];
    const state = { fail: true };
    HTMLCanvasElement.prototype.getContext = () => ({ imageSmoothingEnabled: true, clearRect() {}, drawImage() {} });
    globalThis.createImageBitmap = async () => ({ width: 16, height: 16, close() {} });
    const resource = async (namespace, key, contentVersion) => {
      calls.push([namespace, key, contentVersion]);
      if (state.fail) throw new Error("resource unavailable");
      return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion };
    };
    const firstContext = { resources: { resource } };
    const secondContext = { resources: { resource } };
    const refA = { sprite: { namespace: "resource.Graphics", key: "Characters/Guide", contentVersion: expectedVersion } };
    const refB = { sprite: { namespace: "resource.Graphics", key: "Characters/Guide", contentVersion: `sha256:${"b".repeat(64)}` } };
    const characters = document.createElement("lr-dialogue-characters");
    const character = document.createElement("lr-dialogue-character");
    character.setAttribute("character-id", "guide");
    character.setAttribute("active", "true");
    characters.append(character);
    document.body.append(characters);
    character.receiveRenderContext(firstContext);
    character.receiveRenderData(structuredClone(refA));
    while (character._spriteStatus === "loading") await new Promise((resolve) => setTimeout(resolve, 0));
    const failed = { status: character._spriteStatus, calls: calls.length };
    character.receiveRenderData(structuredClone(refA));
    character.setPresentationActive(true);
    character.setAttribute("active", "true");
    characters.syncActiveToView();
    const afterOrdinaryReconciliation = { status: character._spriteStatus, calls: calls.length };
    state.fail = false;
    character.receiveRenderData(structuredClone(refB));
    while (character._spriteStatus === "loading") await new Promise((resolve) => setTimeout(resolve, 0));
    const afterRefChange = { status: character._spriteStatus, calls: calls.length };
    character.receiveRenderContext(secondContext);
    while (character._spriteStatus === "loading") await new Promise((resolve) => setTimeout(resolve, 0));
    const afterContextChange = { status: character._spriteStatus, calls: calls.length };
    characters.remove();
    document.body.append(characters);
    while (character._spriteStatus === "loading") await new Promise((resolve) => setTimeout(resolve, 0));
    const afterReconnect = { status: character._spriteStatus, calls: calls.length };
    characters.remove();
    return { failed, afterOrdinaryReconciliation, afterRefChange, afterContextChange, afterReconnect, keys: calls.map((call) => call[2]) };
  }, version);
  assert.deepEqual(result.failed, { status: "fallback", calls: 1 });
  assert.deepEqual(result.afterOrdinaryReconciliation, { status: "fallback", calls: 1 },
    "ordinary reconciliation must not auto-retry the same failed attempt");
  assert.deepEqual(result.afterRefChange, { status: "ready", calls: 2 }, "a contentVersion change allows a new acquisition");
  assert.deepEqual(result.afterContextChange, { status: "ready", calls: 3 }, "a render-context identity change allows a new acquisition");
  assert.deepEqual(result.afterReconnect, { status: "ready", calls: 4 }, "disconnect/reconnect creates a new connection epoch and acquisition");
  assert.deepEqual(result.keys, [version, `sha256:${"b".repeat(64)}`, `sha256:${"b".repeat(64)}`, `sha256:${"b".repeat(64)}`]);
});

test("sprite consumer validates exact versioned PNG data, crops 4x4 without smoothing, and cleans up", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async (expectedVersion) => {
    const calls = [];
    const closed = [];
    const draws = [];
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function () {
      return {
        imageSmoothingEnabled: true,
        clearRect() {},
        drawImage(...args) { draws.push({ args: args.slice(1), smoothing: this.imageSmoothingEnabled }); },
      };
    };
    globalThis.createImageBitmap = async () => ({ width: 16, height: 20, close() { closed.push("closed"); } });
    const character = document.createElement("lr-dialogue-character");
    character.setAttribute("character-id", "guide");
    character.setAttribute("active", "true");
    character.receiveRenderContext({ resources: { async resource(...args) { calls.push(args); return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion: expectedVersion }; } } });
    document.body.append(character);
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Guide", contentVersion: expectedVersion } });
    while (character._spriteStatus === "loading") await new Promise((resolve) => setTimeout(resolve, 0));
    const valid = { status: character._spriteStatus, calls: calls.map(([namespace, key, contentVersion, options]) => [namespace, key, contentVersion, options.signal instanceof AbortSignal]), draws, closed: [...closed], canvas: [character.shadowRoot.querySelector("canvas").width, character.shadowRoot.querySelector("canvas").height] };
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Guide" } });
    await Promise.resolve();
    const invalid = { status: character._spriteStatus, callCount: calls.length };
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    character.remove();
    return { valid, invalid };
  }, version);
  assert.deepEqual(result.valid.calls, [["resource.Graphics", "Characters/Guide", version, true]]);
  assert.equal(result.valid.status, "ready");
  assert.deepEqual(result.valid.canvas, [4, 5]);
  assert.deepEqual(result.valid.draws, [{ args: [0, 0, 4, 5, 0, 0, 4, 5], smoothing: false }]);
  assert.deepEqual(result.valid.closed, ["closed"]);
  assert.deepEqual(result.invalid, { status: "fallback", callCount: 1 });
});

test("sprite load rejects MIME/grid errors and ignores stale or disconnected completions", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async (expectedVersion) => {
    const pending = [];
    const decoded = [];
    const closed = [];
    HTMLCanvasElement.prototype.getContext = () => ({ imageSmoothingEnabled: true, clearRect() {}, drawImage() {} });
    let decodeFails = false;
    globalThis.createImageBitmap = async (blob) => {
      decoded.push(blob.type);
      if (decodeFails) throw new Error("decode failed");
      return { width: 18, height: 16, close() { closed.push("closed"); } };
    };
    const character = document.createElement("lr-dialogue-character");
    character.setAttribute("active", "true");
    character.receiveRenderContext({ resources: { resource(namespace, key, contentVersion, { signal }) { return new Promise((resolve) => pending.push({ key, signal, resolve, contentVersion })); } } });
    document.body.append(character);
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/First", contentVersion: expectedVersion } });
    await Promise.resolve();
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Second", contentVersion: expectedVersion } });
    await Promise.resolve();
    const firstAborted = pending[0].signal.aborted;
    pending[0].resolve({ bytes: new Uint8Array([1]), mime: "image/png", contentVersion: expectedVersion });
    pending[1].resolve({ bytes: new Uint8Array([1]), mime: "image/png", contentVersion: expectedVersion });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const gridFallback = character._spriteStatus;
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Third", contentVersion: expectedVersion } });
    await Promise.resolve();
    pending[2].resolve({ bytes: new Uint8Array([1]), mime: "text/plain", contentVersion: expectedVersion });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const mimeFallback = character._spriteStatus;
    decodeFails = true;
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Fourth", contentVersion: expectedVersion } });
    await Promise.resolve();
    pending[3].resolve({ bytes: new Uint8Array([1]), mime: "image/png", contentVersion: expectedVersion });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const decodeFallback = character._spriteStatus;
    decodeFails = false;
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Fifth", contentVersion: expectedVersion } });
    await Promise.resolve();
    character.remove();
    const disconnectedAborted = pending[4].signal.aborted;
    pending[4].resolve({ bytes: new Uint8Array([1]), mime: "image/png", contentVersion: expectedVersion });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { firstAborted, disconnectedAborted, keys: pending.map((item) => item.key), decoded, closed, gridFallback, mimeFallback, decodeFallback, finalStatus: character._spriteStatus };
  }, version);
  assert.equal(result.firstAborted, true);
  assert.equal(result.disconnectedAborted, true);
  assert.deepEqual(result.keys, ["Characters/First", "Characters/Second", "Characters/Third", "Characters/Fourth", "Characters/Fifth"]);
  assert.deepEqual(result.decoded, ["image/png", "image/png"], "stale, non-PNG, and disconnected resources must not decode");
  assert.deepEqual(result.closed, ["closed"]);
  assert.equal(result.gridFallback, "fallback");
  assert.equal(result.mimeFallback, "fallback");
  assert.equal(result.decodeFallback, "fallback");
  assert.equal(result.finalStatus, "fallback");
});

test("real Professor sprite renders a scaled 32x48 frame in horizontal and stacked character stages", async (t) => {
  const page = await pageFixture(t, { reduced: true });
  await page.evaluate(async ({ bytes, contentVersion }) => {
    globalThis.fixture = makeDialogueFixture({
      text: "真实博士精灵尺寸资格测试。",
      characters: [{ id: "professor", name: "博士", active: true }],
    });
    const character = fixture.characterList.children[0];
    character.receiveRenderContext({
      resources: {
        async resource(namespace, key, expectedVersion) {
          if (namespace !== "resource.Graphics" || key !== "Characters/Professor" || expectedVersion !== contentVersion) {
            throw new Error("unexpected Professor resource request");
          }
          return { bytes: new Uint8Array(bytes), mime: "image/png", contentVersion };
        },
      },
    });
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Professor", contentVersion } });
    fixture.controls.querySelector('[action="confirm"]').setAttribute("enabled", "true");
    while (character._spriteStatus === "loading") await new Promise((resolve) => setTimeout(resolve, 0));
    if (character._spriteStatus !== "ready") throw new Error(`Professor sprite failed: ${character._spriteStatus}`);
  }, { bytes: [...spriteBytes], contentVersion: spriteVersion });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const character = fixture.characterList.children[0];
      const canvas = character.shadowRoot.querySelector("canvas");
      const canvasRect = canvas.getBoundingClientRect();
      const stageRect = fixture.characterList.shadowRoot.querySelector(".character-stage").getBoundingClientRect();
      const modalRect = fixture.view.shadowRoot.querySelector(".modal").getBoundingClientRect();
      const conversationRect = fixture.conversation.getBoundingClientRect();
      // object-fit: contain letterboxes the 2:3 frame inside the element box when
      // the element is width-clamped; the visual sprite box is the drawn frame.
      const visualHeight = Math.min(canvasRect.height, canvasRect.width * 1.5);
      return {
        intrinsic: { width: canvas.width, height: canvas.height },
        rendered: canvasRect.toJSON(),
        visual: { width: visualHeight * 2 / 3, height: visualHeight },
        stage: stageRect.toJSON(),
        modal: modalRect.toJSON(),
        conversation: conversationRect.toJSON(),
        columns: getComputedStyle(fixture.view.shadowRoot.querySelector(".modal")).gridTemplateColumns.split(" ").length,
        imageRendering: getComputedStyle(canvas).imageRendering,
      };
    });
    assert.deepEqual(geometry.intrinsic, { width: 32, height: 48 }, "the real 128x192 sheet must keep a 32x48 canvas backing store");
    assert.ok(geometry.rendered.width > geometry.intrinsic.width && geometry.rendered.height > geometry.intrinsic.height);
    assert.ok(geometry.rendered.width / geometry.rendered.height <= 2 / 3 + 0.01, "the element box never stretches the frame wider than 2:3");
    assert.ok(Math.abs(geometry.visual.width / geometry.visual.height - 2 / 3) < 0.01, "the drawn frame preserves the sprite aspect ratio");
    const ratio = geometry.visual.height / geometry.stage.height;
    assert.ok(ratio >= 0.68 && ratio <= 0.72, `sprite must target ~70% of the stage height at ${viewport.width}x${viewport.height} (got ${ratio})`);
    assert.ok(geometry.rendered.left >= geometry.stage.left && geometry.rendered.right <= geometry.stage.right);
    assert.ok(geometry.rendered.top >= geometry.stage.top && geometry.rendered.bottom <= geometry.stage.bottom);
    assert.ok(geometry.stage.left >= geometry.modal.left && geometry.stage.right <= geometry.modal.right);
    assert.ok(geometry.stage.top >= geometry.modal.top && geometry.stage.bottom <= geometry.modal.bottom);
    assert.ok(geometry.conversation.width > 0 && geometry.conversation.height > 0);
    assert.equal(geometry.imageRendering, "pixelated");
    const horizontal = viewport.width >= 480;
    assert.equal(geometry.columns, horizontal ? 2 : 1,
      `${viewport.width}x${viewport.height} must use the ${horizontal ? "horizontal 30/70" : "stacked"} character layout`);
    if (!horizontal) {
      assert.ok(geometry.stage.bottom <= geometry.conversation.top + 1, "stacked mode places the stage above the conversation");
    }
  }
});

test("responsive layout: 30/70 horizontal at 1280/800/640, stacked only at 360, compact <=640 geometry retained", async (t) => {
  const page = await pageFixture(t, { reduced: true });
  await page.evaluate(() => {
    globalThis.fixture = makeDialogueFixture({
      text: "响应式布局资格测试文本。",
      characters: [{ id: "guide", active: true }],
      choices: [{ id: "one", text: "一个不会被裁切的长选项" }],
    });
    setHint(fixture, "confirm", true);
  });
  const expected = {
    1280: { width: 960, height: 489.6, font: "18px", columns: 2 },
    800: { width: 704, height: 408, font: "18px", columns: 2 },
    640: { width: 601.6, height: 393.6, font: "16px", columns: 2 },
    360: { width: 338.4, height: 393.6, font: "16px", columns: 1 },
  };
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const modal = fixture.view.shadowRoot.querySelector(".modal");
      const modalRect = modal.getBoundingClientRect();
      const columns = getComputedStyle(modal).gridTemplateColumns.split(" ").map((value) => Number.parseFloat(value));
      const stageRect = fixture.characterList.shadowRoot.querySelector(".character-stage").getBoundingClientRect();
      const conversationRect = fixture.conversation.getBoundingClientRect();
      const controlsRect = fixture.controls.getBoundingClientRect();
      const choiceRect = fixture.choiceList.children[0].getBoundingClientRect();
      const bodyRect = fixture.conversation.shadowRoot.querySelector(".body").getBoundingClientRect();
      return {
        modal: modalRect.toJSON(),
        columns,
        characterRatio: columns.length === 2 ? columns[0] / (columns[0] + columns[1]) : null,
        stage: stageRect.toJSON(),
        conversation: conversationRect.toJSON(),
        controls: controlsRect.toJSON(),
        choice: choiceRect.toJSON(),
        body: bodyRect.toJSON(),
        font: getComputedStyle(fixture.conversation).fontSize,
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    const target = expected[viewport.width];
    assert.ok(Math.abs(geometry.modal.width - target.width) < 1, `${viewport.width} modal width ${geometry.modal.width} ≈ ${target.width}`);
    assert.ok(Math.abs(geometry.modal.height - target.height) < 1, `${viewport.width} modal height ${geometry.modal.height} ≈ ${target.height}`);
    assert.equal(geometry.font, target.font, `${viewport.width} uses the ${target.font} typography branch`);
    assert.equal(geometry.columns.length, target.columns, `${viewport.width} column count`);
    if (target.columns === 2) {
      assert.ok(Math.abs(geometry.characterRatio - 0.30) < 0.01, `${viewport.width} character column ≈ 30%`);
      assert.ok(geometry.conversation.left >= geometry.stage.right, `${viewport.width} conversation starts right of the stage`);
    } else {
      assert.ok(geometry.stage.bottom <= geometry.conversation.top + 1, `${viewport.width} stacked layout puts the stage above the conversation`);
      assert.ok(geometry.stage.height >= 88, `${viewport.width} stacked stage row respects the compact minimum`);
    }
    assert.ok(geometry.modal.left >= 0 && geometry.modal.top >= 0 && geometry.modal.right <= viewport.width && geometry.modal.bottom <= viewport.height,
      `${viewport.width} modal stays inside the viewport`);
    assert.ok(geometry.stage.left >= geometry.modal.left && geometry.stage.right <= geometry.modal.right && geometry.stage.top >= geometry.modal.top && geometry.stage.bottom <= geometry.modal.bottom,
      `${viewport.width} character stage stays inside its grid area`);
    assert.ok(geometry.body.height > 0 && geometry.conversation.width > 0, `${viewport.width} conversation keeps positive usable area`);
    assert.ok(geometry.choice.top >= geometry.modal.top && geometry.choice.bottom <= geometry.modal.bottom && geometry.choice.height > 0,
      `${viewport.width} choice rows are not clipped`);
    assert.ok(geometry.controls.top >= geometry.modal.top && geometry.controls.bottom <= geometry.modal.bottom && geometry.controls.height > 0,
      `${viewport.width} controls remain visible`);
    if (viewport.width === 640) {
      assert.ok(geometry.modal.height > 380, "640x480 keeps the compact 82vh modal height, not the desktop 68vh branch");
      assert.ok(geometry.stage.height >= 92, "640x480 keeps the compact stage minimum");
    }
  }
});

test("no-active-character and History layouts remain full width; density follows the compact spacing baseline", async (t) => {
  const page = await pageFixture(t, { reduced: true });
  await page.evaluate(async ({ bytes, contentVersion }) => {
    globalThis.fixture = makeDialogueFixture({
      text: "密度与全宽布局资格测试。",
      characters: [{ id: "guide", name: "向导", active: true }],
      choices: [{ id: "one", text: "选项" }],
      historyEntries: [{ id: "intro", speaker: "博士", text: "欢迎" }],
    });
    const character = fixture.characterList.children[0];
    character.receiveRenderContext({
      resources: {
        async resource(namespace, key, expectedVersion) {
          return { bytes: new Uint8Array(bytes), mime: "image/png", contentVersion };
        },
      },
    });
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Guide", contentVersion } });
    setHint(fixture, "confirm", true);
    setHint(fixture, "history", true);
    setHint(fixture, "cancel", true);
    while (character._spriteStatus === "loading") await new Promise((resolve) => setTimeout(resolve, 0));
    if (character._spriteStatus !== "ready") throw new Error(`density sprite failed: ${character._spriteStatus}`);
  }, { bytes: [...spriteBytes], contentVersion: spriteVersion });
  const density = await page.evaluate(() => {
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    const modalStyle = getComputedStyle(modal);
    const stageRect = fixture.characterList.shadowRoot.querySelector(".character-stage").getBoundingClientRect();
    const conversationRect = fixture.conversation.getBoundingClientRect();
    const choiceStyle = getComputedStyle(fixture.choiceList.children[0].shadowRoot.querySelector(".choice"));
    const controlsStyle = getComputedStyle(fixture.controls);
    const disabledOpacity = Number.parseFloat(getComputedStyle(fixture.controls.querySelector('[action="previous"]').shadowRoot.querySelector(".hint")).opacity);
    const canvas = fixture.characterList.children[0].shadowRoot.querySelector("canvas");
    const canvasRect = canvas.getBoundingClientRect();
    const visualHeight = Math.min(canvasRect.height, canvasRect.width * 1.5);
    return {
      modalPadding: modalStyle.padding,
      gap: conversationRect.left - stageRect.right,
      controlsPaddingTop: controlsStyle.paddingTop,
      choicePadding: `${choiceStyle.paddingTop} ${choiceStyle.paddingRight}`,
      disabledOpacity,
      spriteRatio: visualHeight / stageRect.height,
      modalContentWidth: modal.clientWidth - 32,
      conversationWidth: conversationRect.width,
    };
  });
  assert.equal(density.modalPadding, "16px", "modal padding follows the compact baseline");
  assert.ok(density.gap <= 24, `character/content gap ${density.gap}px must be substantially below the old ~38px`);
  assert.ok(density.gap >= 12, "character/content gap keeps deliberate breathing room");
  assert.equal(density.controlsPaddingTop, "8px");
  assert.equal(density.choicePadding, "8px 12px");
  assert.ok(density.disabledOpacity >= 0.16 && density.disabledOpacity <= 0.20, `disabled hint opacity ${density.disabledOpacity} within 0.16–0.20`);
  assert.ok(density.spriteRatio >= 0.68 && density.spriteRatio <= 0.72, `sprite stage ratio ${density.spriteRatio} within 0.68–0.72`);

  const noCharacter = await page.evaluate(() => {
    for (const character of fixture.characterList.children) character.setAttribute("active", "false");
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    return {
      columns: getComputedStyle(modal).gridTemplateColumns.split(" ").length,
      fullWidth: Math.abs(fixture.conversation.getBoundingClientRect().width - (modal.clientWidth - 32)) < 2,
    };
  });
  assert.deepEqual(noCharacter, { columns: 1, fullWidth: true }, "no active character collapses to a full-width Conversation");

  const history = await page.evaluate(() => {
    fixture.history.setAttribute("visible", "true");
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    return {
      mode: fixture.view._mode,
      columns: getComputedStyle(modal).gridTemplateColumns.split(" ").length,
      fullWidth: Math.abs(fixture.history.getBoundingClientRect().width - (modal.clientWidth - 32)) < 2,
      characterDisplay: getComputedStyle(fixture.characterList).display,
      conversationDisplay: getComputedStyle(fixture.conversation).display,
      historyDisplay: getComputedStyle(fixture.history).display,
    };
  });
  assert.deepEqual(history, {
    mode: "history",
    columns: 1,
    fullWidth: true,
    characterDisplay: "none",
    conversationDisplay: "none",
    historyDisplay: "block",
  }, "History remains full width without a representative character pane");
});

test("reveal, exact submits, disabled navigation, wrap-around, and pointer boundary work", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async () => {
    const fixture = makeDialogueFixture({
      text: "逐字显示必须先完成，再允许提交。",
      choices: [
        { id: "disabled", enabled: false },
        { id: "one" },
        { id: "two" },
      ],
    });
    globalThis.fixture = fixture;
    setHint(fixture, "confirm", true);
    setHint(fixture, "previous", true);
    setHint(fixture, "next", true);
    fixture.conversation.receiveRenderEvent({ name: "commit", data: {} });
    const revealOnly = { complete: fixture.conversation._revealComplete, emitted: structuredClone(fixture.emitted) };
    fixture.conversation.receiveRenderEvent({ name: "choice-next", data: {} });
    const first = fixture.conversation._selectedChoiceId;
    fixture.conversation.receiveRenderEvent({ name: "choice-previous", data: {} });
    const wrappedBack = fixture.conversation._selectedChoiceId;
    fixture.conversation.receiveRenderEvent({ name: "choice-next", data: {} });
    const wrappedForward = fixture.conversation._selectedChoiceId;
    fixture.conversation.receiveRenderEvent({ name: "commit", data: {} });
    for (const type of ["pointerdown", "pointerup", "click", "touchstart", "touchend"]) {
      fixture.choiceList.children[1].dispatchEvent(new Event(type, { bubbles: true, composed: true }));
      fixture.history.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
    }
    return {
      revealOnly,
      first,
      wrappedBack,
      wrappedForward,
      emitted: fixture.emitted,
      disabledAria: fixture.choiceList.children[0].shadowRoot.querySelector(".choice").getAttribute("aria-disabled"),
      selectedAria: fixture.choiceList.children[1].shadowRoot.querySelector(".choice").getAttribute("aria-selected"),
      marker: fixture.choiceList.children[1].shadowRoot.querySelector(".marker").textContent,
    };
  });
  assert.deepEqual(result.revealOnly, { complete: true, emitted: [] });
  assert.equal(result.first, "one");
  assert.equal(result.wrappedBack, "two");
  assert.equal(result.wrappedForward, "one");
  assert.deepEqual(result.emitted, [{ name: "submit", data: { conversationId: "conversation-1", choiceId: "one" } }]);
  assert.equal(result.disabledAria, "true");
  assert.equal(result.selectedAria, "true");
  assert.equal(result.marker, "✓");

  const noChoice = await page.evaluate(() => {
    document.body.replaceChildren();
    const fixture = makeDialogueFixture({ text: "" });
    fixture.conversation.setInteractionActive(true);
    fixture.conversation.receiveRenderEvent({ name: "commit", data: {} });
    return fixture.emitted;
  });
  assert.deepEqual(noChoice, [{ name: "submit", data: { conversationId: "conversation-1" } }]);
});

test("typewriter text is not a live region while dialog, choice, and history semantics remain intact", async (t) => {
  const page = await pageFixture(t, { reduced: true });
  const semantics = await page.evaluate(() => {
    const fixture = makeDialogueFixture({
      text: "逐字文本只应视觉更新，不应反复触发辅助技术播报。",
      choices: [{ id: "continue", text: "继续" }],
      historyEntries: [{ id: "intro", speaker: "博士", text: "欢迎" }],
    });
    setHint(fixture, "confirm", true);
    const visibleText = fixture.textElement.shadowRoot.querySelector(".text");
    const composedLiveAncestor = (start) => {
      let current = start;
      while (current) {
        if (current instanceof Element && current.hasAttribute("aria-live")) return current.getAttribute("aria-live");
        const root = current.getRootNode();
        current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      }
      return null;
    };
    return {
      visibleText: visibleText.textContent,
      liveAncestor: composedLiveAncestor(visibleText),
      conversationLive: fixture.conversation.shadowRoot.querySelector(".conversation").getAttribute("aria-live"),
      dialog: {
        role: fixture.view.shadowRoot.querySelector(".modal").getAttribute("role"),
        modal: fixture.view.shadowRoot.querySelector(".modal").getAttribute("aria-modal"),
        label: fixture.view.shadowRoot.querySelector(".modal").getAttribute("aria-label"),
      },
      choices: {
        role: fixture.choiceList.shadowRoot.querySelector(".choice-list").getAttribute("role"),
        optionRole: fixture.choiceList.children[0].shadowRoot.querySelector(".choice").getAttribute("role"),
      },
      historyLabelledBy: fixture.history.shadowRoot.querySelector(".history").getAttribute("aria-labelledby"),
      historyHeading: fixture.history.shadowRoot.querySelector("h2").textContent,
    };
  });
  assert.deepEqual(semantics, {
    visibleText: "逐字文本只应视觉更新，不应反复触发辅助技术播报。",
    liveAncestor: null,
    conversationLive: null,
    dialog: { role: "dialog", modal: "true", label: "对话" },
    choices: { role: "listbox", optionRole: "option" },
    historyLabelledBy: "pokeman-dialogue-history-heading",
    historyHeading: "HISTORY",
  });
});

test("reduced motion completes reveal immediately and modal geometry remains inside all qualification viewports", async (t) => {
  const page = await pageFixture(t, { reduced: true });
  await page.evaluate(() => {
    globalThis.fixture = makeDialogueFixture({ text: "减少动态效果时不逐字等待。", characters: [{ id: "guide", active: true }], choices: [{ id: "one", text: "一个不会被裁切的长选项" }] });
    setHint(fixture, "confirm", true);
    setHint(fixture, "history", true);
    setHint(fixture, "cancel", true);
  });
  assert.equal(await page.evaluate(() => fixture.conversation._revealComplete), true);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const modal = fixture.view.shadowRoot.querySelector(".modal");
      const rect = modal.getBoundingClientRect();
      const conversation = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, columns: getComputedStyle(modal).gridTemplateColumns.split(" ").length, choiceWidth: fixture.choiceList.children[0].getBoundingClientRect().width };
      fixture.history.setAttribute("visible", "true");
      fixture.history.receiveRenderEvent({ name: "scroll-to-latest", data: {} });
      const historyRect = modal.getBoundingClientRect();
      const history = {
        left: historyRect.left,
        top: historyRect.top,
        width: historyRect.width,
        height: historyRect.height,
        fullWidth: fixture.history.getBoundingClientRect().width > 0,
        emptyVisible: !fixture.history.shadowRoot.querySelector(".empty").hidden,
        conversationDisplay: getComputedStyle(fixture.conversation).display,
        characterDisplay: getComputedStyle(fixture.characterList).display,
      };
      fixture.history.setAttribute("visible", "false");
      return { conversation, history };
    });
    assert.ok(geometry.conversation.left >= 0 && geometry.conversation.top >= 0 && geometry.conversation.right <= viewport.width && geometry.conversation.bottom <= viewport.height);
    assert.ok(geometry.conversation.width > 0 && geometry.conversation.choiceWidth > 0);
    assert.deepEqual(
      { left: geometry.history.left, top: geometry.history.top, width: geometry.history.width, height: geometry.history.height },
      { left: geometry.conversation.left, top: geometry.conversation.top, width: geometry.conversation.width, height: geometry.conversation.height },
    );
    assert.deepEqual(
      { fullWidth: geometry.history.fullWidth, emptyVisible: geometry.history.emptyVisible, conversationDisplay: geometry.history.conversationDisplay, characterDisplay: geometry.history.characterDisplay },
      { fullWidth: true, emptyVisible: true, conversationDisplay: "none", characterDisplay: "none" },
    );
    assert.equal(geometry.conversation.columns, viewport.width <= 479 ? 1 : 2, `${viewport.width}px must use the v1.1 orientation split`);
  }
});
