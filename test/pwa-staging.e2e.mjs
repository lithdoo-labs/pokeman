import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { openProduct } from "./helpers/pwa-browser.mjs";
import { createPokeManRoutePlanner } from "./helpers/pokeman-route-planner.mjs";

const initial = Object.freeze({ mapId: 3, x: 3, y: 8, direction: 2 });
const movements = Object.freeze([
  Object.freeze({ direction: 2, code: "ArrowDown", button: "down", dx: 0, dy: 1 }),
  Object.freeze({ direction: 4, code: "ArrowLeft", button: "left", dx: -1, dy: 0 }),
  Object.freeze({ direction: 6, code: "ArrowRight", button: "right", dx: 1, dy: 0 }),
  Object.freeze({ direction: 8, code: "ArrowUp", button: "up", dx: 0, dy: -1 }),
]);

async function waitForMap(page, target) {
  await page.waitForFunction((state) => {
    const view = document.querySelector("lr-map-view");
    const player = document.querySelector("lr-map-sprite")?._latestData;
    return document.documentElement.dataset.loomrealmProduct === "ready"
      && view?.dataset.mapVisualState === "ready"
      && view?._latestData?.mapId === state.mapId
      && player?.x === state.x
      && player?.y === state.y
      && player?.direction === state.direction
      && player?.motion === null
      && window.__loomrealmPwa.failure === null;
  }, target, { timeout: 25_000 });
}

async function completeDeepSeekGate(page, expectedDraft) {
  await page.locator("lr-schema-form").waitFor({ state: "attached", timeout: 25_000 });
  await page.waitForFunction((value) => document.querySelector("lr-schema-form-field")
    ?.shadowRoot?.querySelector("wa-input")?.value === value, expectedDraft, { timeout: 25_000 });
  assert.equal(await page.locator("lr-map-view").count(), 0, "staging Map must remain behind the DeepSeek Gate");
  await page.evaluate(() => document.querySelector("lr-schema-form").submit());
  await page.locator("lr-schema-form").waitFor({ state: "detached", timeout: 25_000 });
}

async function act(page, steps) {
  for (const step of steps) {
    await page.keyboard.press(step.code);
    await waitForMap(page, step.expected);
  }
  return steps.at(-1)?.expected;
}

async function sendCustomControls(page, down) {
  await page.evaluate((snapshot) => {
    const elements = [...document.querySelectorAll("game-controls-input:not([data-input-disabled])")];
    if (elements.length !== 1) throw new Error(`Expected one active game-controls-input, received ${elements.length}`);
    elements[0].dispatchEvent(new CustomEvent("loomrealm:debug-input", {
      detail: { version: 1, down: snapshot },
      bubbles: false,
      composed: false,
      cancelable: false,
    }));
  }, down);
}

async function actCustomMapStep(page, step) {
  await sendCustomControls(page, [step.button]);
  try {
    await page.waitForFunction((target) => {
      const player = document.querySelector("lr-map-sprite")?._latestData;
      return player?.motion !== null
        || (player?.x === target.x && player?.y === target.y && player?.direction === target.direction);
    }, step.expected, { timeout: 25_000 });
  } finally {
    await sendCustomControls(page, []);
  }
  await waitForMap(page, step.expected);
  return step.expected;
}

function responsiveFacingPlan(planner, state) {
  for (const first of movements) {
    const afterFirst = planner.transition(state, first);
    if (afterFirst.mapId !== state.mapId || Math.abs(afterFirst.x - state.x) + Math.abs(afterFirst.y - state.y) !== 1) continue;
    for (const second of movements) {
      if (first.dx * second.dx + first.dy * second.dy !== 0) continue;
      const afterSecond = planner.transition(afterFirst, second);
      if (afterSecond.mapId === state.mapId && Math.abs(afterSecond.x - afterFirst.x) + Math.abs(afterSecond.y - afterFirst.y) === 1) {
        return { first, second, afterFirst, afterSecond };
      }
    }
  }
  throw new Error(`No perpendicular staging route from ${JSON.stringify(state)}`);
}

async function installAtomicPromoteProbe(page) {
  await page.evaluate(() => {
    const view = document.querySelector("lr-map-view");
    const originalCommit = view._commitAtomic.bind(view);
    window.__stagingAtomicPromotes = [];
    view._commitAtomic = function (prepared, sequence) {
      const oldScene = this._acceptedVisualScene;
      const replacement = oldScene && oldScene.view.sceneEpoch !== prepared.view.sceneEpoch;
      const oldVisuals = oldScene?.sprites.map((entry) => entry.visual).filter(Boolean) ?? [];
      const incomingVisuals = prepared.sprites.map((entry) => entry.visual).filter(Boolean);
      const before = replacement ? {
        oldMapId: oldScene.view.mapId,
        targetMapId: prepared.view.mapId,
        oldNpcCount: Math.max(0, oldVisuals.length - 1),
        oldCount: oldVisuals.length,
        targetCount: incomingVisuals.length,
        oldVisible: oldVisuals.every((visual) => visual.isConnected && !visual.hidden),
        targetDetached: incomingVisuals.length === this._spriteChildren().length && incomingVisuals.every((visual) => !visual.isConnected),
        visibleBefore: this.shadowRoot.querySelectorAll("canvas.sprite-visual:not([hidden])").length,
      } : null;
      const result = originalCommit(prepared, sequence);
      if (before && this._acceptedVisualScene === prepared) {
        window.__stagingAtomicPromotes.push({
          ...before,
          visibleAfter: this.shadowRoot.querySelectorAll("canvas.sprite-visual:not([hidden])").length,
          oldReleased: oldVisuals.every((visual) => !visual.isConnected),
          targetVisible: incomingVisuals.every((visual) => visual.isConnected && !visual.hidden),
        });
      }
      return result;
    };
  });
}

async function qualifyResponsiveFacing(page, planner, state) {
  const plan = responsiveFacingPlan(planner, state);
  await page.keyboard.down(plan.first.code);
  await page.waitForFunction((target) => {
    const player = document.querySelector("lr-map-sprite")?._latestData;
    return player?.motion !== null && player.x === target.x && player.y === target.y && player.direction === target.direction;
  }, plan.afterFirst, { timeout: 25_000 });
  const before = await page.evaluate(() => {
    const view = document.querySelector("lr-map-view");
    const visual = view._acceptedVisualScene.sprites[0].visual;
    window.__stagingFacingVisual = visual;
    return {
      player: structuredClone(document.querySelector("lr-map-sprite")._latestData),
      view: structuredClone(view._latestData),
      startedAt: view._activeMotion.startedAt,
    };
  });
  await page.keyboard.down(plan.second.code);
  await page.waitForFunction(({ direction, motionId }) => {
    const view = document.querySelector("lr-map-view");
    const player = document.querySelector("lr-map-sprite")?._latestData;
    return player?.direction === direction && player.motionId === motionId
      && view?._acceptedVisualScene?.sprites[0]?.visual?._cropKey.includes(`|${direction}|`);
  }, { direction: plan.second.direction, motionId: before.player.motionId }, { timeout: 25_000 });
  const facing = await page.evaluate(() => {
    const view = document.querySelector("lr-map-view");
    return {
      player: structuredClone(document.querySelector("lr-map-sprite")._latestData),
      view: structuredClone(view._latestData),
      startedAt: view._activeMotion.startedAt,
      sameVisual: view._acceptedVisualScene.sprites[0].visual === window.__stagingFacingVisual,
    };
  });
  assert.deepEqual({ ...facing.player, direction: before.player.direction }, before.player);
  assert.deepEqual(facing.view, before.view);
  assert.equal(facing.startedAt, before.startedAt);
  assert.equal(facing.sameVisual, true);
  await page.keyboard.up(plan.first.code);
  await page.waitForFunction(({ motionId, target }) => {
    const player = document.querySelector("lr-map-sprite")?._latestData;
    return player?.motionId !== null && player.motionId !== motionId && player.x === target.x && player.y === target.y;
  }, { motionId: before.player.motionId, target: plan.afterSecond }, { timeout: 25_000 });
  await page.keyboard.up(plan.second.code);
  await waitForMap(page, plan.afterSecond);
  return plan.afterSecond;
}

async function waitForDialogue(page, text) {
  await page.waitForFunction((expected) => {
    const view = document.querySelector("lr-dialogue-view");
    return view?.shadowRoot.querySelector(".modal")?.hidden === false
      && view.querySelector("lr-dialogue-text")?.getAttribute("text") === expected;
  }, text, { timeout: 25_000 });
}

async function revealAndConfirm(page) {
  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true, null, { timeout: 25_000 });
  await page.keyboard.press("KeyZ");
}

// Observes the complete hidden transition history of the live Dialogue shell.
// Each mutation's resulting state is derived from the MutationRecord itself
// (oldValue === null → attribute added → hidden true; oldValue !== null →
// removed → false) so a transient false → true → false flash inside a single
// MutationObserver batch cannot pass unnoticed.
async function observeDialogueShell(page) {
  await page.evaluate(() => {
    const view = document.querySelector("lr-dialogue-view");
    const modal = view.shadowRoot.querySelector(".modal");
    const backdrop = view.shadowRoot.querySelector(".backdrop");
    const history = { modal: [modal.hidden], backdrop: [backdrop.hidden] };
    const derive = (record) => {
      if (record.type !== "attributes" || record.attributeName !== "hidden") return;
      const key = record.target === modal ? "modal" : "backdrop";
      const next = record.oldValue === null;
      if (history[key].at(-1) !== next) history[key].push(next);
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) derive(record);
    });
    observer.observe(modal, { attributes: true, attributeFilter: ["hidden"], attributeOldValue: true });
    observer.observe(backdrop, { attributes: true, attributeFilter: ["hidden"], attributeOldValue: true });
    window.__dialogueShellHiddenHistory = history;
  });
}

// Self-check: prove the record-based derivation above catches a same-batch
// transient flash on a scratch element before trusting it for the real shell.
async function verifyDialogueObserverDetectsFlash(page) {
  const probe = await page.evaluate(async () => {
    const scratch = document.createElement("div");
    document.body.append(scratch);
    const transitions = [scratch.hidden];
    const derive = (record) => {
      if (record.type !== "attributes" || record.attributeName !== "hidden") return;
      const next = record.oldValue === null;
      if (transitions.at(-1) !== next) transitions.push(next);
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) derive(record);
    });
    observer.observe(scratch, { attributes: true, attributeFilter: ["hidden"], attributeOldValue: true });
    scratch.hidden = true;
    scratch.hidden = false;
    await new Promise((resolve) => setTimeout(resolve, 0));
    observer.disconnect();
    scratch.remove();
    return transitions;
  });
  assert.deepEqual(probe, [false, true, false],
    "the hidden-transition observer must detect a same-batch transient flash, not only the final state");
}

async function assertDialogueNeverHidden(page, stage) {
  const history = await page.evaluate(() => window.__dialogueShellHiddenHistory);
  for (const [key, transitions] of Object.entries(history)) {
    const firstVisible = transitions.indexOf(false);
    assert.notEqual(firstVisible, -1, `${stage}: Dialogue ${key} must be visible (${transitions})`);
    assert.equal(transitions.slice(firstVisible).includes(true), false,
      `${stage}: Dialogue ${key} must never become hidden between Conversations (${transitions})`);
  }
}

test("staging PokeMan boots, runs continuous Professor Dialogue, resumes Map, and reloads", { timeout: 180_000 }, async () => {
  const fixtureDirectory = new URL("../loom-realm/apps/pwa/dist/staging/pwa/pokeman/", import.meta.url);
  const fixture = JSON.parse(await readFile(new URL("installation-bundle.json", fixtureDirectory), "utf8")
    .catch((error) => error.code === "ENOENT"
      ? readFile(new URL("pokeman-bundle.json", fixtureDirectory), "utf8")
      : Promise.reject(error)));
  const planner = createPokeManRoutePlanner(fixture);
  const draft = "synthetic-staging-key";
  const probeAuthorizations = [];
  const product = await openProduct({
    viewport: { width: 960, height: 720 },
    beforeGoto: async ({ context, page }) => {
      await context.route("https://api.deepseek.com/models", async (route) => {
        probeAuthorizations.push(route.request().headers().authorization ?? null);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({
            object: "list",
            data: [{ id: "deepseek-flash", object: "model", owned_by: "deepseek" }],
          }),
        });
      });
      await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
        key: "pokeman.deepseek.api-key",
        value: draft,
      });
    },
  });
  try {
    const { page, context, diagnostics } = product;
    await completeDeepSeekGate(page, draft);
    await waitForMap(page, initial);
    assert.deepEqual(probeAuthorizations, [`Bearer ${draft}`]);
    assert.equal(await page.locator("game-controls-input").count(), 1);
    assert.equal(await page.locator('game-controls-input[data-input-disabled="duplicate"]').count(), 0);
    assert.equal(await page.evaluate(() => typeof window.__loomrealmPwaQualification), "undefined", "Staging must not expose qualification controls");

    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/pwa/pokeman/");
      return registration ? new URL(registration.scope).pathname : null;
    });
    assert.equal(scope, "/pwa/pokeman/");

    const installationId = await page.evaluate(() => window.__loomrealmPwa.installationId);
    assert.match(installationId, /./);
    const map = await page.evaluate(async (id) => {
      const res = await fetch(`/pwa/pokeman/_lr/v1/games/${encodeURIComponent(id)}/records/struct.Map/3`);
      return { status: res.status, value: res.ok ? await res.json() : null };
    }, installationId);
    assert.equal(map.status, 200);
    assert.equal(map.value.tileset_id, 3);
    assert.equal(map.value.width, 31);

    await installAtomicPromoteProbe(page);
    let state = await qualifyResponsiveFacing(page, planner, initial);
    const customMove = movements.map((candidate) => ({ candidate, expected: planner.transition(state, candidate) }))
      .find(({ expected }) => expected.mapId === state.mapId && (expected.x !== state.x || expected.y !== state.y));
    assert.ok(customMove, "staging Map must expose a real movement for the Custom controls seam");
    state = await actCustomMapStep(page, { ...customMove.candidate, expected: customMove.expected });
    const map2 = planner.planToMap(state, 2);
    assert.ok(map2.length > 0);
    state = await act(page, map2);
    assert.equal(state.mapId, 2);

    const collision = planner.planNpcCollision(state);
    if (collision.travel.length > 0) state = await act(page, collision.travel);
    const before = state;
    state = await act(page, [collision.collision]);
    assert.equal(state.mapId, before.mapId);
    assert.equal(state.x, before.x);
    assert.equal(state.y, before.y);

    const toMap4 = planner.planToMap(state, 4);
    state = await act(page, toMap4);
    await page.waitForFunction(() => document.querySelector("lr-map-view")?._acceptedVisualScene?.view.mapId === 4, null, { timeout: 25_000 });
    const atomicPromotes = await page.evaluate(() => window.__stagingAtomicPromotes);
    assert.ok(atomicPromotes.length >= 2, `staging must observe the real 3->2 and 2->4 scene promotes: ${JSON.stringify(atomicPromotes)}`);
    assert.equal(atomicPromotes.some((record) => record.oldNpcCount > 0), true);
    for (const record of atomicPromotes) {
      assert.equal(record.oldVisible, true, `${record.oldMapId}->${record.targetMapId}: old pixels remain visible until promote`);
      assert.equal(record.targetDetached, true, `${record.oldMapId}->${record.targetMapId}: target pixels are complete before promote`);
      assert.equal(record.visibleBefore, record.oldCount);
      assert.equal(record.visibleAfter, record.targetCount);
      assert.equal(record.oldReleased, true);
      assert.equal(record.targetVisible, true);
    }
    const professor = planner.planNpcCollision(state);
    assert.equal(professor.npc.instanceId, "professor");
    if (professor.travel.length > 0) state = await act(page, professor.travel);
    state = await act(page, [professor.collision]);

    // The real staging build must contain the updated v1.1 Presentation.
    const stagedPresentation = await page.evaluate(async (id) => {
      const load = async (key) => {
        const response = await fetch(`/pwa/pokeman/_lr/v1/games/${encodeURIComponent(id)}/resources/resource.Presentation/${key}`);
        return { status: response.status, body: await response.text() };
      };
      return {
        dialogue: await load("dialogue/dialogue.browser.js"),
        map: await load("map/map.browser.js"),
        schemaFormJs: await load("schema-form/schema-form.browser.js"),
        schemaFormCss: await load("schema-form/schema-form.browser.css"),
      };
    }, installationId);
    assert.equal(stagedPresentation.dialogue.status, 200);
    assert.match(stagedPresentation.dialogue.body, /_shellPresented/, "staged Presentation must carry the v1.1 shell latch");
    assert.match(stagedPresentation.dialogue.body, /setInteractionActive/, "staged Presentation must carry the v1.1 interaction gate");
    assert.match(stagedPresentation.dialogue.body, /30% minmax\(0, 70%\)/, "staged Presentation must carry the v1.1 30/70 layout");
    assert.equal(stagedPresentation.map.status, 200);
    assert.match(stagedPresentation.map.body, /_acceptedVisualScene/, "staged Map must own accepted visual scenes");
    assert.match(stagedPresentation.map.body, /projectionBounds/, "staged Map must carry exact projection bounds");
    assert.match(stagedPresentation.map.body, /browser-facing-paint/, "staged Map must carry responsive-facing qualification paint");
    assert.equal(stagedPresentation.schemaFormJs.status, 200);
    assert.match(stagedPresentation.schemaFormJs.body, /customElements\.define\("lr-schema-form"/);
    assert.equal(stagedPresentation.schemaFormCss.status, 200);
    assert.match(stagedPresentation.schemaFormCss.body, /lr-schema-form/);

    await page.evaluate(() => {
      window.__stagingMapBeforeDialogue = document.querySelector("lr-map-view");
      const births = [];
      const originalCreateElement = document.createElement.bind(document);
      document.createElement = function (localName, options) {
        const element = originalCreateElement(localName, options);
        if (localName === "lr-dialogue-view") births.push({ initialHidden: element.shadowRoot.querySelector(".modal").hidden });
        return element;
      };
      window.__dialogueSessionBirths = births;
    });
    await page.keyboard.press("KeyZ");
    await waitForDialogue(page, "来得正好。卡片代表你与角色建立的契约，战斗中显现的是契约力量，不是角色本体。");
    assert.equal((await page.evaluate(() => window.__dialogueSessionBirths)).at(-1).initialHidden, true,
      "a fresh Dialogue session must be created from the initial hidden READY baseline");
    assert.equal(await page.evaluate(() => document.querySelector("lr-map-view") === window.__stagingMapBeforeDialogue), true,
      "Dialogue overlays the Map without replacing the Map view");
    await verifyDialogueObserverDetectsFlash(page);
    await observeDialogueShell(page);

    // Let Conversation A reveal naturally first. The Custom action is qualified
    // only by the non-automatic A -> B transition, not by _revealComplete.
    await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true, null, { timeout: 25_000 });
    const mapBeforeCustomDialogue = await page.evaluate(() => structuredClone(document.querySelector("lr-map-sprite")._latestData));
    await sendCustomControls(page, ["south"]);
    try {
      await waitForDialogue(page, "契约完整度会随战斗消耗并保留到下一场；归零代表显现体被击败，正常结算后最低保留 1 点。");
    } finally {
      await sendCustomControls(page, []);
    }
    assert.deepEqual(
      await page.evaluate(() => structuredClone(document.querySelector("lr-map-sprite")._latestData)),
      mapBeforeCustomDialogue,
      "the Custom Dialogue action must not leak through Top Active Frame routing into Map",
    );

    // A → READY → B must keep one continuous visible shell.
    await assertDialogueNeverHidden(page, "Conversation A → READY → B");

    // History stays interactive and full-width while the Conversation pauses.
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => document.querySelector("lr-dialogue-view")?._mode === "history", null, { timeout: 25_000 });
    const historyLayout = await page.evaluate(() => {
      const view = document.querySelector("lr-dialogue-view");
      const modal = view.shadowRoot.querySelector(".modal");
      const history = view.querySelector("lr-dialogue-history");
      return {
        viewInert: view.inert,
        conversationDisplay: getComputedStyle(view.querySelector("lr-dialogue-conversation")).display,
        characterDisplay: getComputedStyle(view.querySelector("lr-dialogue-characters")).display,
        fullWidth: Math.abs(history.getBoundingClientRect().width - (modal.clientWidth - 32)) < 2,
      };
    });
    assert.deepEqual(historyLayout, { viewInert: false, conversationDisplay: "none", characterDisplay: "none", fullWidth: true },
      "History owns interaction at full modal content width");
    await page.keyboard.press("KeyX");
    await page.waitForFunction(() => document.querySelector("lr-dialogue-view")?._mode === "conversation", null, { timeout: 25_000 });
    await assertDialogueNeverHidden(page, "Conversation B History open/close");

    // Finish the second line, advance to the authored choice line, then select
    // the first formal graph edge (ready).
    await revealAndConfirm(page);
    await waitForDialogue(page, "你和劲敌将互换卡片，各自调用对方的显现体。听明白了吗？");
    await page.keyboard.press("KeyZ");
    await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true, null, { timeout: 25_000 });
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(() => document.querySelector('lr-dialogue-choice[choice-id="0"]')?.isSelected() === true, null, { timeout: 25_000 });
    await page.keyboard.press("KeyZ");
    await waitForDialogue(page, "很好。去找研究所另一边的劲敌吧。等你们双方都同意，再开始测试。");
    await assertDialogueNeverHidden(page, "Conversation B → READY → C");
    await revealAndConfirm(page);
    await page.locator("lr-dialogue-view").waitFor({ state: "detached", timeout: 25_000 });
    planner.setEventStates([{ eventId: "prologue", stateId: "rival-ready" }]);
    await waitForMap(page, state);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.querySelector("lr-map-view") === window.__stagingMapBeforeDialogue), true,
      "the same Map view remains mounted after the Dialogue session closes");

    const move = [
      { direction: 2, code: "ArrowDown", dx: 0, dy: 1 },
      { direction: 4, code: "ArrowLeft", dx: -1, dy: 0 },
      { direction: 6, code: "ArrowRight", dx: 1, dy: 0 },
      { direction: 8, code: "ArrowUp", dx: 0, dy: -1 },
    ].map((candidate) => ({ candidate, expected: planner.transition(state, candidate) }))
      .find(({ expected }) => expected.mapId === state.mapId && (expected.x !== state.x || expected.y !== state.y));
    assert.ok(move, "resumed Map must accept movement");
    state = await act(page, [{ ...move.candidate, expected: move.expected }]);

    // The state mutation immediately replaces the interactable Professor with
    // the Rival, whose fresh Dialogue session starts from READY again.
    const firstSessionElement = await page.evaluate(() => window.__dialogueSessionBirths.length);
    const rival = planner.planNpcCollision(state, "rival-lab");
    assert.equal(rival.npc.instanceId, "rival-lab");
    if (rival.travel.length > 0) state = await act(page, rival.travel);
    state = await act(page, [rival.collision]);
    await page.keyboard.press("KeyZ");
    await waitForDialogue(page, "总算来了。我们来做一次真正的交换：我把自己的卡交给你，你也把自己的卡交给我。");
    assert.equal(await page.evaluate(() => window.__dialogueSessionBirths.length), firstSessionElement + 1,
      "the second interaction must create a fresh Dialogue presentation");
    assert.equal((await page.evaluate(() => window.__dialogueSessionBirths)).at(-1).initialHidden, true,
      "the fresh second session starts with an initial READY hidden shell");
    await revealAndConfirm(page);
    await waitForDialogue(page, "进入战场的只是各自契约形成的显现。怎么样，愿意交换卡片，堂堂正正比一场吗？");
    await page.keyboard.press("KeyZ");
    await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true, null, { timeout: 25_000 });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(() => document.querySelector('lr-dialogue-choice[choice-id="1"]')?.isSelected() === true, null, { timeout: 25_000 });
    await page.keyboard.press("KeyZ");
    await waitForDialogue(page, "好，我不会逼你。没有你的同意，这份契约就不会成立。准备好了再来。");
    await revealAndConfirm(page);
    await page.locator("lr-dialogue-view").waitFor({ state: "detached", timeout: 25_000 });
    await page.waitForFunction(() => document.querySelector("lr-map-view")?.dataset.mapVisualState === "ready"
      && document.documentElement.dataset.loomrealmProduct === "ready"
      && window.__loomrealmPwa.failure === null, null, { timeout: 25_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await completeDeepSeekGate(page, draft);
    await waitForMap(page, initial);
    assert.deepEqual(probeAuthorizations, [`Bearer ${draft}`, `Bearer ${draft}`]);
    assert.equal(await page.locator("game-controls-input").count(), 1);
    assert.equal(await page.locator('game-controls-input[data-input-disabled="duplicate"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__loomrealmPwa.installationId), installationId, "Refresh must reuse installed content");
    const reloadedMove = movements.map((candidate) => ({ candidate, expected: planner.transition(initial, candidate) }))
      .find(({ expected }) => expected.mapId === initial.mapId && (expected.x !== initial.x || expected.y !== initial.y));
    assert.ok(reloadedMove, "reloaded staging Map must expose a movement for Custom controls");
    await actCustomMapStep(page, { ...reloadedMove.candidate, expected: reloadedMove.expected });
    assert.equal(await page.evaluate(() => window.__loomrealmPwa.failure), null);
    const forbidden = await context.request.get(new URL("/service-worker.js", page.url()).href);
    assert.equal(forbidden.status(), 404, "Staging Service Worker must not be exposed at origin root");
    assert.deepEqual(diagnostics.filter((entry) => entry.startsWith("pageerror:")), []);
  } catch (cause) {
    throw new Error(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\nDiagnostics: ${product.diagnostics.join("\n")}`);
  } finally {
    await product.close();
  }
});
