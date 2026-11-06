import { cancelled, completed, defineSubsystem, failed } from "@loomrealm/subsystem";
import { BattlePresentationBuilder } from "@pokeman/game-battle/presentation";
import { BattleSimulationBuilder } from "@pokeman/game-battle/simulation";
import { DeepSeekDecision } from "@pokeman/game-battle/decision";
import { DeepSeekProfiledDecision, DEEPSEEK_CALL_A_PROFILES } from "@pokeman/game-battle/decision-profiled";
import { createBattleMessageFeed, formatActivityEntries } from "@pokeman/game-battle/messages";
import { subscribeHostLifecycle } from "@loomrealm/session-events";
import { DEEPSEEK_SESSION_CONFIG_KEY, isExactDeepSeekSessionConfig } from "./deepseek-config.mjs";
import { readBattleContracts, settleBattleContracts } from "./business-state.mjs";
import { resolveLabTutorialBattle } from "./battle-content.mjs";

export const DEEPSEEK_RESPONSES_ENDPOINT = "https://api.deepseek.com/responses";

// Battle Message Feed wiring (single Activity Panel; design §6.5).
export const BATTLE_VIEWPORT_CHANNEL = "pokeman.battle.viewport";
export const BATTLE_LAYOUT_RENDER_KEY = "battle:layout";
export const BATTLE_ACTIVITY_RENDER_KEY = "battle:activity";
export const BATTLE_VIEWPORT_CHANGED_EVENT = "battle.viewport.changed";
export const BATTLE_VIEWPORT_REQUEST_EVENT = "battle.viewport.request";
export const BATTLE_MESSAGE_FEED_CAPACITY = 100;

/**
 * Selected Call A profile (see test/records/call-a-performance-records.md):
 * `call-a-low` kept the frozen prompt and token ceiling while roughly halving
 * the observed Call A p50 latency of the v0 `high` control, with comparable
 * one-shot Plan acceptance in the recorded small samples. `v0-quality`
 * remains the frozen control profile; `POKEMAN_BATTLE_CALL_A_PROFILE` may
 * override the product default with any known profile id for trials.
 */
export const BATTLE_CALL_A_PROFILE_DEFAULT = "call-a-low";

function selectCallAProfile() {
  const requested = process.env.POKEMAN_BATTLE_CALL_A_PROFILE;
  return typeof requested === "string" && Object.hasOwn(DEEPSEEK_CALL_A_PROFILES, requested)
    ? requested
    : BATTLE_CALL_A_PROFILE_DEFAULT;
}

/**
 * Best-effort decision-metrics observer: receives every provider Call A/Call B
 * metric and every runtime decision metric (request_to_completion,
 * completion_to_acceptance, acceptance_to_action_start). Synchronous throws
 * and async rejections are isolated; observers must never block or affect the
 * battle, and metrics never contain prompts, memos, request bodies, headers,
 * or credentials. Injectable for tests and product telemetry wiring.
 */
function createMetricsSink(observer) {
  if (observer !== undefined && typeof observer !== "function") {
    throw new TypeError("Battle metrics observer must be a function");
  }
  return {
    record(metric) {
      if (observer === undefined) return;
      try {
        const result = observer(metric);
        if (result !== null && typeof result === "object" && typeof result.catch === "function") {
          result.catch(() => { /* isolated */ });
        }
      } catch { /* metrics never affect the battle */ }
    },
  };
}

/**
 * Resolve the display-name source for the whole message stream (Runtime,
 * Simulation facts, and AI strategyMemo narrative alike). Names come from the
 * battle roster's authored Content metadata; actors without a name fall back
 * to stable, readable team labels — never the raw actorId.
 */
function resolveBattleDisplayNames(roster, definition) {
  const authored = roster?.actors && typeof roster.actors === "object" ? roster.actors : {};
  const actors = {};
  for (const actor of definition?.actors ?? []) {
    const name = authored[actor.actorId];
    actors[actor.actorId] = typeof name === "string" && name.length > 0
      ? name
      : actor.team === "ally" ? "我方角色" : "敌方角色";
  }
  const skills = roster?.skills && typeof roster.skills === "object" ? roster.skills : {};
  return Object.freeze({
    actors: Object.freeze(actors),
    skills: Object.freeze(skills),
  });
}

function createBattleActivityDomainState() {
  return Object.freeze({
    zIndex: 0,
    roots: Object.freeze([{
      key: BATTLE_LAYOUT_RENDER_KEY,
      tag: "lr-battle-layout",
      attrs: Object.freeze({}),
      data: Object.freeze({}),
      children: Object.freeze([{
        key: BATTLE_ACTIVITY_RENDER_KEY,
        tag: "lr-battle-activity",
        attrs: Object.freeze({ slot: "panel" }),
        data: Object.freeze({ messages: Object.freeze([]) }),
        children: Object.freeze([]),
      }]),
    }]),
  });
}

/**
 * Create the map-scoped Viewport adapter fed by the layout component's
 * battle.viewport.changed reports. Returns null when presentation events or
 * render domains are unavailable (tests / degraded hosts) so the
 * presentation falls back to the legacy whole-window viewport.
 */
function createMapViewportBridge(scope, frame) {
  if (typeof scope.createRenderDomain !== "function") return null;
  if (scope.presentationEvents === null || typeof scope.presentationEvents !== "object"
    || typeof scope.presentationEvents.createListener !== "function") return null;
  const listeners = new Set();
  let current = null;
  let listener;
  try {
    listener = scope.presentationEvents.createListener({ frame, channels: [BATTLE_VIEWPORT_CHANNEL] });
  } catch {
    return null;
  }
  try {
    listener.on(BATTLE_VIEWPORT_CHANNEL, (event) => {
      if (event === null || typeof event !== "object" || event.name !== BATTLE_VIEWPORT_CHANGED_EVENT) return;
      const source = event.source;
      if (source === null || typeof source !== "object" || source.targetKey !== BATTLE_LAYOUT_RENDER_KEY) return;
      const width = event.data?.width;
      const height = event.data?.height;
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return;
      if (current !== null && current.width === width && current.height === height) return;
      current = Object.freeze({ width, height });
      for (const notify of [...listeners]) {
        try { notify(current); } catch { /* viewport observers are isolated */ }
      }
    });
  } catch {
    try { listener.close(); } catch { /* best effort */ }
    return null;
  }
  const adapter = Object.freeze({
    get current() { return current; },
    subscribe(notify) {
      if (typeof notify !== "function") throw new TypeError("Viewport listener must be a function");
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
  });
  return { adapter, listener };
}

const PAUSE_PROMPTS = Object.freeze({
  "host-background": Object.freeze({
    messageKey: "battle-host-background-paused",
    text: "战斗已暂停。游戏曾进入后台。",
    actions: Object.freeze([
      Object.freeze({ id: "continue", label: "继续战斗" }),
      Object.freeze({ id: "exit", label: "退出战斗" }),
    ]),
  }),
  "decision-circuit": Object.freeze({
    messageKey: "battle-decision-circuit-paused",
    text: "AI 决策连续失败，战斗已暂停。",
    actions: Object.freeze([
      Object.freeze({ id: "retry", label: "重试决策" }),
      Object.freeze({ id: "exit", label: "退出战斗" }),
    ]),
  }),
});

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validInput(value) {
  return exact(value, ["scenarioId", "source"]) && value.scenarioId === "lab-rival-tutorial"
    && exact(value.source, ["mapId", "rival"]) && value.source.mapId === 4
    && exact(value.source.rival, ["instanceId", "npcId"])
    && value.source.rival.instanceId === "rival-lab" && value.source.rival.npcId === "rival-lab";
}

export function createBattleClock(host = globalThis) {
  return Object.freeze({
    nowMs: () => host.performance?.now?.() ?? Date.now(),
    schedule(delayMs, callback) {
      const handle = host.setTimeout(callback, delayMs);
      return () => host.clearTimeout(handle);
    },
  });
}

export function createDeepSeekTransport(apiKey, fetchImpl = globalThis.fetch) {
  if (typeof apiKey !== "string" || apiKey.length === 0 || typeof fetchImpl !== "function") throw new TypeError("A configured DeepSeek transport is required");
  return Object.freeze({
    async postResponses(bodyText, signal) {
      const response = await fetchImpl(DEEPSEEK_RESPONSES_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: bodyText,
        signal,
      });
      return Object.freeze({ status: response.status, bodyText: await response.text() });
    },
  });
}

async function readDeepSeekConfiguration(state, signal) {
  const snapshot = await state.read([DEEPSEEK_SESSION_CONFIG_KEY], { signal });
  const record = snapshot?.records?.[0];
  if (!exact(snapshot, ["revision", "records"]) || snapshot.records.length !== 1
      || !exact(record, ["key", "version", "value"])
      || record.key?.namespace !== DEEPSEEK_SESSION_CONFIG_KEY.namespace || record.key?.key !== DEEPSEEK_SESSION_CONFIG_KEY.key
      || !Number.isSafeInteger(record.version) || record.version < 0 || !isExactDeepSeekSessionConfig(record.value)) {
    throw new TypeError("DeepSeek SessionConfig is unavailable or malformed");
  }
  return record.value;
}

function validMessageResult(value, prompt) {
  return exact(value, ["messageKey", "actionId"]) && value.messageKey === prompt.messageKey
    && prompt.actions.some((action) => action.id === value.actionId);
}

async function defaultSubscribeLifecycle(scope, listener) {
  return subscribeHostLifecycle(scope.events, ({ state }) => listener(state));
}

export function createPokeManBattleSubsystem(scope, dependencies = {}) {
  const readContracts = dependencies.readBattleContracts ?? readBattleContracts;
  const settleContracts = dependencies.settleBattleContracts ?? settleBattleContracts;
  const resolveBattle = dependencies.resolveLabTutorialBattle ?? resolveLabTutorialBattle;
  const readConfiguration = dependencies.readDeepSeekConfiguration ?? readDeepSeekConfiguration;
  const makeTransport = dependencies.createDeepSeekTransport ?? createDeepSeekTransport;
  // dependencies.DeepSeekDecision stays the explicit frozen-v0 escape hatch;
  // the product default is the versioned profiled implementation using the
  // selected Call A profile.
  const PresentationBuilder = dependencies.BattlePresentationBuilder ?? BattlePresentationBuilder;
  const SimulationBuilder = dependencies.BattleSimulationBuilder ?? BattleSimulationBuilder;
  const clockFactory = dependencies.createBattleClock ?? createBattleClock;
  const subscribeLifecycle = dependencies.subscribeLifecycle ?? defaultSubscribeLifecycle;

  return {
    async frame(frame) {
      if (!validInput(frame.params)) return failed({ code: "POKEMAN_BATTLE_INPUT_INVALID" });
      let runtime;
      let lifecycle;
      let removePauseListener;
      let removeTransitionListener;
      let removeMessageListener;
      let childFailure;
      let hostLifecycleState;
      let promptInFlight = false;

      // --- Battle Message Feed + fixed battle layout (single panel) -------
      // The UI-only RenderDomain is created before BattlePresentation
      // initialization so the measurable map container exists before the
      // first RenderProjection; the Activity Panel is its stable child node.
      const feed = createBattleMessageFeed({ capacity: BATTLE_MESSAGE_FEED_CAPACITY });
      let displayNames = Object.freeze({ actors: Object.freeze({}), skills: Object.freeze({}) });
      const metricsSink = createMetricsSink(dependencies.metricsObserver);
      let uiDomain = null;
      if (typeof scope.createRenderDomain === "function") {
        uiDomain = scope.createRenderDomain(createBattleActivityDomainState());
      }
      let activityPushPending = false;
      const pushActivityPanel = () => {
        activityPushPending = false;
        if (uiDomain === null) return;
        try {
          const messages = formatActivityEntries(feed.getSnapshot(), displayNames);
          uiDomain.update({ nodes: [{ key: BATTLE_ACTIVITY_RENDER_KEY, data: { set: { messages } } }] });
        } catch { /* panel updates never affect battle authority */ }
      };
      const scheduleActivityPanel = () => {
        if (uiDomain === null || activityPushPending) return;
        activityPushPending = true;
        queueMicrotask(pushActivityPanel);
      };
      const viewportBridge = createMapViewportBridge(scope, frame);
      const requestViewportReport = () => {
        if (uiDomain === null) return;
        try {
          uiDomain.emit({ targetKey: BATTLE_LAYOUT_RENDER_KEY, name: BATTLE_VIEWPORT_REQUEST_EVENT, data: {} });
        } catch { /* re-report requests are best-effort */ }
      };

      const showPendingPrompt = async () => {
        if (runtime === undefined || hostLifecycleState !== "foreground" || promptInFlight) return;
        const snapshot = runtime.getSnapshot();
        if (snapshot.status !== "paused" || snapshot.pauseReason === undefined) return;
        promptInFlight = true;
        const prompt = PAUSE_PROMPTS[snapshot.pauseReason];
        try {
          const outcome = await frame.call("message", prompt);
          if (outcome.type === "cancelled") { runtime.cancel(); return; }
          if (outcome.type === "failed") { childFailure = outcome.error.code; runtime.cancel(); return; }
          if (!validMessageResult(outcome.value, prompt)) { childFailure = "POKEMAN_MESSAGE_RESULT_INVALID"; runtime.cancel(); return; }
          if (outcome.value.actionId === "exit") runtime.cancel();
          else if (hostLifecycleState === "foreground") runtime.resume();
        } catch {
          childFailure = "POKEMAN_MESSAGE_CALL_FAILED";
          runtime.cancel();
        } finally {
          promptInFlight = false;
        }
      };
      const acceptLifecycle = (state) => {
        hostLifecycleState = state;
        if (state === "background" && runtime?.getSnapshot().status === "running") runtime.pause("host-background");
        if (state === "foreground") void showPendingPrompt();
      };
      try {
        lifecycle = await subscribeLifecycle(scope, acceptLifecycle);
        const authority = await readContracts(scope.state, { signal: frame.signal });
        const resolvedBattle = await resolveBattle(scope.content, authority, { signal: frame.signal });
        // The resolver returns { definition, displayNames }; tolerate legacy
        // bare definitions for injected test doubles.
        const definition = resolvedBattle?.definition ?? resolvedBattle;
        displayNames = resolveBattleDisplayNames(resolvedBattle?.displayNames, definition);
        const config = await readConfiguration(scope.state, frame.signal);
        const transport = makeTransport(config.apiKey, dependencies.fetchImpl);
        const processMessageObserver = (request, strategyMemo) => {
          // Call A visible memo bypass → Runtime request-validity gate.
          try { runtime?.reportDecisionAnalysis?.(request, strategyMemo); } catch { /* isolated */ }
        };
        const decision = dependencies.decision
          ?? (dependencies.DeepSeekDecision !== undefined
            ? new (dependencies.DeepSeekDecision ?? DeepSeekDecision)({ transport }, processMessageObserver)
            : new DeepSeekProfiledDecision({ transport, profile: selectCallAProfile(), metricsSink }, processMessageObserver));
        const presentation = dependencies.presentation
          ?? new PresentationBuilder(scope, frame, {
            ...(viewportBridge === null ? {} : { viewport: viewportBridge.adapter }),
            ...(uiDomain === null ? {} : { domain: uiDomain }),
          }).build();
        runtime = dependencies.runtime ?? new SimulationBuilder({
          clock: dependencies.clock ?? clockFactory(), signal: frame.signal, decision, presentation, metricsSink,
        }).build(definition);

        // Message subscription happens before runtime.run() so the initial
        // decision.started of the very first Tick cannot be missed.
        if (typeof runtime.onMessage === "function") {
          removeMessageListener = runtime.onMessage((message) => {
            try { feed.append(message); } catch { /* feed failures never affect battle */ }
            scheduleActivityPanel();
          });
        }
        removePauseListener = runtime.onPause(() => {
          void showPendingPrompt();
        });
        removeTransitionListener = runtime.onTransition(({ from, to }) => {
          if (to === "running" && hostLifecycleState === "background") runtime.pause("host-background");
          // A child Message Frame may have shadowed the top frame and lost a
          // resize notification; ask the layout component to re-report once
          // the battle becomes the top frame again.
          if (from === "paused" && to === "running") requestViewportReport();
        });
        const run = runtime.run();
        const result = await run;
        if (result.type === "cancelled") {
          return childFailure === undefined ? cancelled() : failed({ code: childFailure });
        }
        if (result.type === "failure") return failed({ code: `POKEMAN_BATTLE_${result.source.toUpperCase()}_FAILED`, data: { battleCode: result.code } });
        const snapshot = runtime.getSnapshot();
        const rival = snapshot.actors.find((actor) => actor.actorId === "rival");
        const player = snapshot.actors.find((actor) => actor.actorId === "player");
        if (rival === undefined || player === undefined) return failed({ code: "POKEMAN_BATTLE_FINAL_SNAPSHOT_INVALID" });
        const settlement = await settleContracts(scope.state, authority, { rival: rival.hp, player: player.hp });
        return completed({ battleId: snapshot.battleId, result: result.type, settlement: settlement.status === "committed" || settlement.status === "reconciled" ? "committed" : "not-applicable" });
      } catch (cause) {
        if (frame.signal.aborted) return cancelled();
        return failed({ code: "POKEMAN_BATTLE_INTEGRATION_FAILED", message: cause instanceof Error ? cause.message.slice(0, 512) : undefined });
      } finally {
        lifecycle?.close();
        removeTransitionListener?.();
        removePauseListener?.();
        removeMessageListener?.();
        // Battle close clears the bounded Feed, the presentation-event
        // subscription and the UI-only layout domain; no post-battle panel.
        feed.clear();
        try { viewportBridge?.listener.close(); } catch { /* best effort */ }
        try { uiDomain?.close(); } catch { /* best effort */ }
        uiDomain = null;
        runtime?.close();
      }
    },
  };
}

export default defineSubsystem((scope) => createPokeManBattleSubsystem(scope));
