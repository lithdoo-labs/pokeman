import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(root, "dist/browser/rpg-dialogue.browser.js");
const cssPath = path.join(root, "dist/browser/rpg-dialogue.browser.css");
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

function executablePath() {
  return [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find(existsSync);
}

async function pageFixture(t) {
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ path: cssPath });
  await page.addScriptTag({ path: bundlePath });
  return page;
}

test("browser artifacts exist and register every canonical tag", async (t) => {
  assert.equal(existsSync(bundlePath), true);
  assert.equal(existsSync(cssPath), true);
  const page = await pageFixture(t);
  assert.deepEqual(await page.evaluate((names) => names.map((name) => [name, typeof customElements.get(name)]), tags), tags.map((tag) => [tag, "function"]));
});

test("browser bundle fails before partial Dialogue registration on tag collision", async (t) => {
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.evaluate(() => customElements.define("lr-dialogue-choice", class extends HTMLElement {}));
  const failure = page.waitForEvent("pageerror");
  await page.addScriptTag({ path: bundlePath });
  assert.match((await failure).message, /collision/);
  assert.equal(await page.evaluate(() => customElements.get("lr-dialogue-view") === undefined), true);
});

test("conversation receives data/events and commit reveals before submitting exact payload", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async () => {
    const events = [];
    const conversation = document.createElement("lr-dialogue-conversation");
    conversation.receiveRenderContext({ resources: {}, emitCustomEvent(name, data = {}) { events.push({ name, data }); } });
    document.body.append(conversation);
    conversation.setAttribute("conversation-id", "c1");
    conversation.setAttribute("speaker-name", "Guide");
    const text = document.createElement("lr-dialogue-text");
    text.setAttribute("text", "A deliberately long line that remains incomplete for the first commit.");
    const choices = document.createElement("lr-dialogue-choices");
    conversation.append(text, choices);
    const data = { voice: "guide" };
    conversation.receiveRenderData(data);
    await Promise.resolve();
    conversation.receiveRenderEvent({ name: "commit", data: {} });
    const afterReveal = { events: structuredClone(events), complete: conversation._revealComplete, text: text.shadowRoot.textContent.trim() };
    conversation.receiveRenderEvent({ name: "commit", data: {} });
    return {
      afterReveal,
      events,
      sameData: conversation._data === data,
      speaker: conversation.shadowRoot.querySelector(".speaker").textContent,
    };
  });
  assert.deepEqual(result.afterReveal.events, []);
  assert.equal(result.afterReveal.complete, true);
  assert.match(result.afterReveal.text, /deliberately long line/);
  assert.deepEqual(result.events, [{ name: "submit", data: { conversationId: "c1" } }]);
  assert.equal(result.sameData, true);
  assert.equal(result.speaker, "Guide");
});

test("choice navigation skips disabled choices, new Conversation resets selection, and data is received", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async () => {
    const events = [];
    const conversation = document.createElement("lr-dialogue-conversation");
    conversation.receiveRenderContext({ resources: {}, emitCustomEvent(name, data = {}) { events.push({ name, data }); } });
    document.body.append(conversation);
    conversation.setAttribute("conversation-id", "c1");
    const text = document.createElement("lr-dialogue-text");
    text.setAttribute("text", "");
    const choices = document.createElement("lr-dialogue-choices");
    const disabled = document.createElement("lr-dialogue-choice");
    disabled.setAttribute("choice-id", "disabled");
    disabled.setAttribute("text", "Disabled");
    disabled.setAttribute("enabled", "false");
    const enabled = document.createElement("lr-dialogue-choice");
    enabled.setAttribute("choice-id", "enabled");
    enabled.setAttribute("text", "Enabled");
    enabled.setAttribute("enabled", "true");
    const choiceData = { icon: "ok" };
    enabled.receiveRenderData(choiceData);
    choices.append(disabled, enabled);
    conversation.append(text, choices);
    await Promise.resolve();
    conversation.receiveRenderEvent({ name: "choice-next", data: {} });
    const selected = [disabled.isSelected(), enabled.isSelected(), conversation._selectedChoiceId];
    conversation.receiveRenderEvent({ name: "commit", data: {} });
    conversation.setAttribute("conversation-id", "c2");
    const reset = [disabled.isSelected(), enabled.isSelected(), conversation._selectedChoiceId, conversation._revealComplete];
    conversation.receiveRenderEvent({ name: "commit", data: {} });
    return { selected, reset, events, sameData: enabled._data === choiceData };
  });
  assert.deepEqual(result.selected, [false, true, "enabled"]);
  assert.deepEqual(result.events, [{ name: "submit", data: { conversationId: "c1", choiceId: "enabled" } }]);
  assert.deepEqual(result.reset.slice(0, 3), [false, false, null]);
  assert.equal(result.sameData, true);
});

test("reconnecting the same conversation resumes reveal without resetting selection or submitting", async (t) => {
  const page = await pageFixture(t);
  await page.evaluate(() => {
    const events = [];
    const conversation = document.createElement("lr-dialogue-conversation");
    conversation.receiveRenderContext({ resources: {}, emitCustomEvent(name, data = {}) { events.push({ name, data }); } });
    conversation.setAttribute("conversation-id", "reconnect-c1");
    const text = document.createElement("lr-dialogue-text");
    text.setAttribute("text", "This deliberately long reconnect line must keep revealing after the exact same element returns to the DOM.");
    const choices = document.createElement("lr-dialogue-choices");
    const choice = document.createElement("lr-dialogue-choice");
    choice.setAttribute("choice-id", "selected");
    choice.setAttribute("text", "Selected");
    choice.setAttribute("enabled", "true");
    choices.append(choice);
    conversation.append(text, choices);
    document.body.append(conversation);
    conversation.receiveRenderEvent({ name: "choice-next", data: {} });
    globalThis.reconnectFixture = { conversation, choice, text, events };
  });
  await page.waitForFunction(() => {
    const { conversation, text } = globalThis.reconnectFixture;
    const revealed = text.shadowRoot.querySelector("span").textContent;
    return revealed.length > 0 && conversation._revealComplete === false;
  });
  const detached = await page.evaluate(async () => {
    const { conversation, choice, text, events } = globalThis.reconnectFixture;
    const revealedBeforeDetach = text.shadowRoot.querySelector("span").textContent;
    conversation.remove();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const revealedWhileDetached = text.shadowRoot.querySelector("span").textContent;
    return {
      revealedBeforeDetach,
      revealedWhileDetached,
      selectedChoiceId: conversation._selectedChoiceId,
      selected: choice.isSelected(),
      events: structuredClone(events),
    };
  });
  assert.equal(detached.revealedWhileDetached, detached.revealedBeforeDetach);
  assert.equal(detached.selectedChoiceId, "selected");
  assert.equal(detached.selected, true);
  assert.deepEqual(detached.events, []);

  await page.evaluate(() => document.body.append(globalThis.reconnectFixture.conversation));
  await page.waitForFunction(() => globalThis.reconnectFixture.conversation._revealComplete === true);
  const reconnected = await page.evaluate(() => {
    const { conversation, choice, text, events } = globalThis.reconnectFixture;
    return {
      conversationId: conversation.getAttribute("conversation-id"),
      selectedChoiceId: conversation._selectedChoiceId,
      selected: choice.isSelected(),
      revealed: text.shadowRoot.querySelector("span").textContent,
      full: text.getAttribute("text"),
      events: structuredClone(events),
    };
  });
  assert.equal(reconnected.conversationId, "reconnect-c1");
  assert.equal(reconnected.selectedChoiceId, "selected");
  assert.equal(reconnected.selected, true);
  assert.equal(reconnected.revealed, reconnected.full);
  assert.deepEqual(reconnected.events, []);
});

test("history receives transient events and pointer/touch do not create business events", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async () => {
    const emitted = [];
    const conversation = document.createElement("lr-dialogue-conversation");
    conversation.receiveRenderContext({ resources: {}, emitCustomEvent(name, data = {}) { emitted.push({ name, data }); } });
    conversation.setAttribute("conversation-id", "c1");
    const text = document.createElement("lr-dialogue-text");
    text.setAttribute("text", "");
    const choices = document.createElement("lr-dialogue-choices");
    const choice = document.createElement("lr-dialogue-choice");
    choice.setAttribute("choice-id", "a");
    choice.setAttribute("text", "A");
    choice.setAttribute("enabled", "true");
    choices.append(choice);
    conversation.append(text, choices);
    const history = document.createElement("lr-dialogue-history");
    history.setAttribute("visible", "true");
    const entry = document.createElement("lr-dialogue-history-entry");
    entry.setAttribute("entry-id", "h1");
    entry.setAttribute("speaker-name", "Guide");
    entry.setAttribute("text", "Past");
    history.append(entry);
    document.body.append(conversation, history);
    await Promise.resolve();
    history.receiveRenderEvent({ name: "scroll-to-latest", data: {} });
    history.receiveRenderEvent({ name: "scroll-up", data: {} });
    history.receiveRenderEvent({ name: "scroll-down", data: {} });
    for (const type of ["pointerdown", "pointerup", "click", "touchstart", "touchend"]) {
      choice.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
      conversation.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
      history.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
    }
    return { emitted, historyEvents: history._events, entryText: entry.shadowRoot.textContent.replace(/\s+/g, " ").trim() };
  });
  assert.deepEqual(result.emitted, []);
  assert.deepEqual(result.historyEvents, ["scroll-to-latest", "scroll-up", "scroll-down"]);
  assert.match(result.entryText, /Guide:Past/);
});
