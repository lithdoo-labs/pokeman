import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT = 30_000;
const spritePath = path.join(repoRoot, "[FSDB]PokeMan/[resource]Graphics/Characters/Professor.png");
const spriteBytes = await readFile(spritePath);
const spriteVersion = `sha256:${createHash("sha256").update(spriteBytes).digest("hex")}`;
const importMap = JSON.stringify({
  imports: {
    "@loomrealm/foundation": "/loom-realm/packages/foundation/dist/index.js",
    "@loomrealm/foundation/testing": "/loom-realm/packages/foundation/dist/testing/index.js",
    "@loomrealm/wire": "/loom-realm/packages/wire/dist/index.js",
    "@loomrealm/platform-ports": "/loom-realm/packages/platform-ports/dist/index.js",
    "@loomrealm/runtime-control": "/loom-realm/packages/runtime-control/dist/index.js",
    "@loomrealm/shared-state": "/loom-realm/packages/shared-state/dist/index.js",
    "@loomrealm/session-events": "/loom-realm/packages/session-events/dist/index.js",
    "@loomrealm/renderer-control": "/loom-realm/packages/renderer-control/dist/index.js",
    "@loomrealm/data": "/loom-realm/packages/data/dist/index.js",
    "@loomrealm/subsystem": "/loom-realm/packages/subsystem/dist/index.js",
    "@loomrealm/subsystem/host": "/loom-realm/packages/subsystem/dist/host/index.js",
    "@loomrealm/renderer": "/loom-realm/packages/renderer/dist/index.js",
    "@loomrealm/renderer/web-presentation": "/loom-realm/packages/renderer/dist/web-presentation.js",
    "@loomrealm-game/rpg-dialogue": "/loom-realm/game-libs/rpg-dialogue/dist/index.js"
  }
});

function executablePath() {
  return [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find(existsSync);
}

async function fixture(t) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    requests.push(url.pathname);
    if (url.pathname === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html><head>
        <script type="importmap">${importMap}</script>
        <link rel="stylesheet" href="/presentation/dialogue.css">
        <script src="/presentation/dialogue.browser.js"></script>
      </head><body></body></html>`);
      return;
    }
    if (url.pathname === "/sprite.png") {
      response.setHeader("content-type", "image/png");
      response.end(spriteBytes);
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(1));
    const allowed = (relative.startsWith("loom-realm/packages/") || relative.startsWith("loom-realm/game-libs/") || relative.startsWith("game-libs/")) && relative.includes("/dist/") ||
      relative === "presentation/dialogue.css" || relative === "presentation/dialogue.browser.js";
    if (allowed) {
      try {
        response.setHeader("content-type", relative.endsWith(".css") ? "text/css" : "text/javascript");
        response.end(await readFile(path.join(repoRoot, relative)));
      } catch {
        response.statusCode = 404;
        response.end();
      }
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { origin: `http://127.0.0.1:${server.address().port}`, requests };
}

async function setup(page, origin, expectedSpriteVersion) {
  await page.goto(origin);
  await page.evaluate(async ({ expectedSpriteVersion }) => {
    const [foundation, runtimeControl, rendererControl, sharedState, sessionEvents, subsystem, subsystemHost, renderer, presentation, dialogueModule] = await Promise.all([
      import("@loomrealm/foundation/testing"),
      import("@loomrealm/runtime-control"),
      import("@loomrealm/renderer-control"),
      import("@loomrealm/shared-state"),
      import("@loomrealm/session-events"),
      import("@loomrealm/subsystem"),
      import("@loomrealm/subsystem/host"),
      import("@loomrealm/renderer"),
      import("@loomrealm/renderer/web-presentation"),
      import("@loomrealm-game/rpg-dialogue"),
    ]);
    const waitFor = async (predicate, label) => {
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const gate = () => {
      let release;
      const promise = new Promise((resolve) => { release = resolve; });
      return { promise, release };
    };
    const firstReadyGate = gate();
    const finalReadyGate = gate();
    const scheduler = {
      schedule(ms, callback) {
        const timer = setTimeout(callback, ms);
        return () => clearTimeout(timer);
      },
    };
    const runtimePair = foundation.createMemoryCarrierPair();
    const dataPair = foundation.createMemoryCarrierPair();
    const rendererPair = foundation.createMemoryCarrierPair();
    const eventHub = sessionEvents.createSessionEventHub();
    const eventsClient = sessionEvents.createSessionEventClient(eventHub.createBinding("dialogue"));
    const presentationPublisher = eventHub.createDelegatedPublisher("web-presentation");
    const statuses = [];
    const returns = [];
    const observations = [];
    const renderEvents = [];
    const nodeEvents = [];
    const mainRuntime = runtimeControl.createMainRuntimeControlPeer({
      carrier: runtimePair.left,
      scheduler,
      frameDeadlineMs: 10_000,
      shutdownDeadlineMs: 5_000,
      authenticateHello: () => ({ kind: "accepted" }),
      handlers: {
        onStatus(status) { statuses.push(status); },
        onFrameCall() { return { kind: "failure", error: { code: "UNEXPECTED_CALL" } }; },
        onFrameReturn(params) { returns.push(params); return { kind: "success", result: {} }; },
      },
    });
    const runtime = subsystemHost.runSubsystem({
      definition: subsystem.defineSubsystem((scope) => ({
        async frame(frame) {
          let dialogue;
          try {
            dialogue = new dialogueModule.RPGDialogue(scope, frame, { cancelable: false, zIndex: 123 });
            globalThis.dialogueControls = dialogue.controls;
            dialogue.setHistory([{ entryId: "intro", speakerName: "向导", text: "欢迎" }]);
            const first = await dialogue.openConversation({
              conversation: {
                speakerName: "博士",
                text: "第一段资格测试文本足够长，第一次确认必须只完成逐字显示而不能提交。",
                choices: [
                  { choiceId: "disabled", text: "不可用", enabled: false, data: {} },
                  { choiceId: "yes", text: "继续", data: {} },
                ],
                data: {},
              },
              characters: [{
                characterId: "professor",
                displayName: "博士",
                active: true,
                data: { sprite: { namespace: "resource.Graphics", key: "Characters/Professor", contentVersion: expectedSpriteVersion } },
              }],
            });
            dialogue.appendHistory({ entryId: "first", speakerName: "博士", text: "继续" });
            globalThis.firstDialogueResult = first;
            await firstReadyGate.promise;
            const second = await dialogue.openConversation({
              conversation: {
                text: "第二段资格测试文本同样足够长，用于验证历史记录暂停与恢复逐字显示。",
                choices: [],
                data: {},
              },
              characters: [],
            });
            const history = dialogue.getHistorySnapshot();
            observations.push({ first, second, history });
            globalThis.secondDialogueResult = second;
            await finalReadyGate.promise;
            return subsystem.completed({ first, second, history });
          } catch (error) {
            globalThis.pokemanDialogueBusinessError = String(error?.stack ?? error);
            throw error;
          } finally {
            delete globalThis.dialogueControls;
            dialogue?.close();
          }
        },
      })),
      runtimeControl: { async acquire() { return runtimePair.right; } },
      runtimePolicy: { scheduler, helloDeadlineMs: 5_000, frameDeadlineMs: 10_000, terminalCleanupDeadlineMs: 1_000 },
      launch: { subsystemKey: "dialogue", bootstrapToken: "secret", controlProtocolVersions: [1] },
      data: { async acquire() { return { carrier: dataPair.left, generation: 1, dataProfile: "loomrealm.renderer-data/3" }; } },
      state: (() => {
        const client = sharedState.createSharedStateClient();
        return Object.freeze({ client, terminate: () => client.terminate() });
      })(),
      events: (() => Object.freeze({ client: eventsClient, terminate: () => { eventsClient.terminate(); eventHub.terminate(); } }))(),
    });
    const runtimeFailures = [];
    runtime.catch((error) => runtimeFailures.push(String(error?.stack ?? error)));

    const holder = renderer.createRendererControlHolder({
      async acquire(subsystemKey, generation, dataProfile) {
        if (subsystemKey !== "dialogue" || generation !== 1 || dataProfile !== "loomrealm.renderer-data/3") throw new Error("Unexpected Data authority");
        return dataPair.right;
      },
    }, undefined, { publish(event) { return presentationPublisher.publish(event.channel, event.type, event.payload, event.ownerSubsystemKey); } });
    const projectorFailures = [];
    const projector = new presentation.WebProjector({
      document,
      resourceClient: {
        async resource(namespace, key, contentVersion, signal) {
          if (namespace !== "resource.Graphics" || key !== "Characters/Professor" || contentVersion !== expectedSpriteVersion) throw new Error("Unexpected sprite request");
          const response = await fetch("/sprite.png", { signal });
          return { bytes: new Uint8Array(await response.arrayBuffer()), mime: "image/png", contentVersion: expectedSpriteVersion };
        },
      },
      reportFailure(error) { projectorFailures.push(String(error)); },
    });
    const detach = presentation.attachRendererPresentation(holder, {
      reevaluate(source, emitNodeEvent) {
        projector.reevaluate(source, (event) => {
          nodeEvents.push(structuredClone(event));
          emitNodeEvent(event);
        });
      },
      deliverRenderEvent(event) {
        renderEvents.push(structuredClone(event));
        projector.deliverRenderEvent(event);
      },
    });
    const snapshot = {
      sessionId: "pokeman-dialogue-qualification",
      revision: 1,
      runtimes: [{ subsystemKey: "dialogue", state: "ready" }],
      stack: [{ frameId: "dialogue-frame", subsystemKey: "dialogue", lifecycle: "active", activationId: "dialogue-activation" }],
      dataAuthorities: [{ subsystemKey: "dialogue", generation: 1, dataProfile: "loomrealm.renderer-data/3" }],
    };
    const publisher = rendererControl.createMainRendererControlPeer({
      carrier: rendererPair.left,
      acceptHello() { return { kind: "accepted", snapshot, preparedHelloText: rendererControl.prepareRendererHelloResultV2(snapshot) }; },
    });
    await holder.connect({ carrier: rendererPair.right, rendererControlToken: "renderer-token" });
    await mainRuntime.identified;
    await waitFor(() => statuses.some((status) => status.state === "ready"), "Subsystem ready");
    const initializeResult = await mainRuntime.frame.initialize({ frameId: "dialogue-frame", input: null });
    const activateResult = await mainRuntime.frame.activate({ frameId: "dialogue-frame", activationId: "dialogue-activation" });
    try {
      await waitFor(() => document.querySelector("lr-dialogue-conversation") !== null, "projected Dialogue");
    } catch (cause) {
      throw new Error(`${cause.message}\nprojector=${JSON.stringify(projectorFailures)}\nruntime=${JSON.stringify(runtimeFailures)}\nbusiness=${globalThis.pokemanDialogueBusinessError}\nstatuses=${JSON.stringify(statuses)}\nreturns=${JSON.stringify(returns)}\ninitialize=${JSON.stringify(initializeResult)}\nactivate=${JSON.stringify(activateResult)}\ncontrols=${typeof globalThis.dialogueControls}\nbody=${JSON.stringify([...document.body.children].map((node) => node.localName))}`);
    }
    globalThis.pokemanDialogueQualification = {
      mainRuntime, runtime, returns, observations, renderEvents, nodeEvents, statuses, publisher, projector, detach,
      projectorFailures, waitFor,
      control(action) { globalThis.dialogueControls[action](); },
      releaseFirst() { firstReadyGate.release(); },
      releaseFinal() { finalReadyGate.release(); },
      async finish() {
        await waitFor(() => returns.length === 1, "Frame return");
        await waitFor(() => document.querySelector("lr-dialogue-view") === null, "Dialogue teardown");
        return {
          returned: structuredClone(returns[0].result),
          observations: structuredClone(observations),
          renderEvents: structuredClone(renderEvents),
          nodeEvents: structuredClone(nodeEvents),
          projectorFailures: [...projectorFailures],
        };
      },
    };
  }, { expectedSpriteVersion });
}

async function control(page, action) {
  await page.evaluate((value) => globalThis.pokemanDialogueQualification.control(value), action);
}

test("PokeMan closes RPGDialogue controls → WebProjector → canonical WC → exact submit → result", { timeout: TIMEOUT }, async (t) => {
  const server = await fixture(t);
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await setup(page, server.origin, spriteVersion);

  const firstElement = await page.locator("lr-dialogue-conversation").elementHandle();
  const firstId = await page.locator("lr-dialogue-conversation").getAttribute("conversation-id");
  assert.ok(firstId);
  await page.waitForFunction(() => document.querySelector("lr-dialogue-character")?._spriteStatus === "ready");
  assert.equal(await page.evaluate(() => document.querySelector("lr-dialogue-view").shadowRoot.querySelector(".modal").classList.contains("with-character")), true);

  await control(page, "confirm");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true);
  assert.equal(await page.evaluate(() => pokemanDialogueQualification.nodeEvents.length), 0, "REVEALING confirm must not submit");
  await control(page, "next");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._selectedChoiceId === "yes");
  await control(page, "confirm");
  await page.waitForFunction(() => globalThis.firstDialogueResult?.type === "submitted");

  const firstReady = await page.evaluate(() => {
    const view = document.querySelector("lr-dialogue-view");
    return {
      retained: document.querySelector("lr-dialogue-conversation") !== null,
      hidden: view.shadowRoot.querySelector(".modal").hidden,
      inert: view.inert,
      result: globalThis.firstDialogueResult,
    };
  });
  // v1.1: an intermediate READY after an ACTIVE keeps the shell visible and inert.
  assert.deepEqual(firstReady, { retained: true, hidden: false, inert: true, result: { type: "submitted", choiceId: "yes" } });

  await page.evaluate(() => pokemanDialogueQualification.releaseFirst());
  await page.waitForFunction((oldId) => document.querySelector("lr-dialogue-conversation")?.getAttribute("conversation-id") !== oldId, firstId);
  const secondId = await page.locator("lr-dialogue-conversation").getAttribute("conversation-id");
  assert.ok(secondId && secondId !== firstId);
  assert.equal(await page.locator("lr-dialogue-conversation").elementHandle().then((handle) => handle.evaluate((element, first) => element === first, firstElement)), true, "retained canonical conversation element must be reused");
  assert.equal(await page.evaluate(() => document.querySelector("lr-dialogue-conversation")._selectedChoiceId), null);
  assert.equal(await page.evaluate(() => document.querySelector("lr-dialogue-view").shadowRoot.querySelector(".modal").classList.contains("with-character")), false);

  await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")._revealIndex > 0);
  await control(page, "history");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-history")?._events.includes("scroll-to-latest"));
  const historyState = await page.evaluate(() => {
    const view = document.querySelector("lr-dialogue-view");
    const history = document.querySelector("lr-dialogue-history");
    const conversation = document.querySelector("lr-dialogue-conversation");
    return {
      mode: view._mode,
      eventMode: history._lastEventMode,
      paused: conversation._interactionActive === false,
      index: conversation._revealIndex,
      historyMode: view.shadowRoot.querySelector(".modal").classList.contains("history-mode"),
      entries: [...history.children].map((entry) => entry.getAttribute("entry-id")),
    };
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(await page.evaluate(() => document.querySelector("lr-dialogue-conversation")._revealIndex), historyState.index);
  assert.deepEqual(historyState, { mode: "history", eventMode: "history", paused: true, index: historyState.index, historyMode: true, entries: ["intro", "first"] });
  await control(page, "cancel");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-history")?.getAttribute("visible") === "false");
  assert.equal(await page.evaluate(() => pokemanDialogueQualification.nodeEvents.length), 1, "History cancel must not submit");
  await page.waitForFunction((index) => document.querySelector("lr-dialogue-conversation")._revealIndex > index, historyState.index);

  await control(page, "confirm");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true);
  await control(page, "confirm");
  await page.waitForFunction(() => globalThis.secondDialogueResult?.type === "submitted");
  assert.deepEqual(await page.evaluate(() => {
    const view = document.querySelector("lr-dialogue-view");
    return { hidden: view.shadowRoot.querySelector(".modal").hidden, inert: view.inert, retainedId: document.querySelector("lr-dialogue-conversation")?.getAttribute("conversation-id") };
  }), { hidden: false, inert: true, retainedId: secondId }, "second intermediate READY keeps the shell visible and inert");

  await page.evaluate(() => pokemanDialogueQualification.releaseFinal());
  const result = await page.evaluate(() => pokemanDialogueQualification.finish());
  assert.deepEqual(result.returned, {
    type: "completed",
    value: {
      first: { type: "submitted", choiceId: "yes" },
      second: { type: "submitted" },
      history: [
        { entryId: "intro", speakerName: "向导", text: "欢迎" },
        { entryId: "first", speakerName: "博士", text: "继续" },
      ],
    },
  });
  assert.deepEqual(result.nodeEvents.map((event) => [event.name, event.data]), [
    ["submit", { conversationId: firstId, choiceId: "yes" }],
    ["submit", { conversationId: secondId }],
  ]);
  assert.deepEqual(result.renderEvents.map((event) => event.name), ["commit", "choice-next", "commit", "scroll-to-latest", "commit", "commit"]);
  assert.deepEqual(result.projectorFailures, []);
  assert.ok(server.requests.includes("/presentation/dialogue.browser.js"));
  assert.ok(server.requests.includes("/presentation/dialogue.css"));
  assert.ok(server.requests.includes("/sprite.png"));
});
