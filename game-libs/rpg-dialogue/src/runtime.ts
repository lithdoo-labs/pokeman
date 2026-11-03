import type {
  Frame,
  RenderDomain,
  RenderDomainState,
  RenderNode,
  SessionEvent,
  SessionEventSubscription,
  SubsystemScope,
} from "@loomrealm/subsystem";
import type {
  ConversationRequestV0,
  ConversationResultV0,
  DialogueHistoryEntryV0,
  RPGDialogueControls,
  RPGDialogueOptionsV0,
} from "./model.js";
import {
  plainDataObject,
  validateConstructor,
  validateHistory,
  validateHistoryEntry,
  validateProjection,
  validateRequest,
} from "./internal/validation.js";

type Lifecycle = "READY" | "ACTIVE" | "CLOSED";
type InteractionMode = "CONVERSATION" | "HISTORY";
type SemanticAction = "confirm" | "previous" | "next" | "history" | "cancel";

const ACTIONS = ["confirm", "previous", "next", "history", "cancel"] as const;
const WEB_PRESENTATION_EVENT_CHANNEL = "x.loomrealm.web-presentation.event";

interface ActiveOperation {
  readonly request: ConversationRequestV0;
  readonly conversationId: string;
  readonly resolve: (value: ConversationResultV0) => void;
  readonly reject: (cause: unknown) => void;
  settled: boolean;
}

interface ProjectionPlan {
  readonly request: ConversationRequestV0;
  readonly conversationId: string;
  readonly characterKeys: ReadonlyMap<string, string>;
  readonly choiceKeys: ReadonlyMap<string, string>;
  readonly history: readonly DialogueHistoryEntryV0[];
  readonly historyKeys: ReadonlyMap<string, string>;
  readonly controlKeys: ReadonlyMap<SemanticAction, string>;
  readonly nextNodeSerial: number;
}

interface SessionResources {
  readonly subscription: SessionEventSubscription;
}

function abortError(): Error {
  if (typeof DOMException === "function") return new DOMException("The Frame was aborted", "AbortError");
  const error = new Error("The Frame was aborted");
  error.name = "AbortError";
  return error;
}

function closedError(): Error {
  return new Error("RPGDialogue is closed");
}

function operationClosedError(): Error {
  return new Error("RPGDialogue was closed while a Conversation was active");
}

function emptyData(): Record<string, never> {
  return {};
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
}

export class RPGDialogue {
  readonly controls: RPGDialogueControls;
  private readonly scope: SubsystemScope;
  private readonly frame: Frame;
  private readonly cancelable: boolean;
  private readonly zIndex: number;
  private lifecycle: Lifecycle = "READY";
  private mode: InteractionMode = "CONVERSATION";
  private domain?: RenderDomain;
  private subscription?: SessionEventSubscription;
  private active?: ActiveOperation;
  private retainedRequest?: ConversationRequestV0;
  private retainedConversationId?: string;
  private characterKeys = new Map<string, string>();
  private choiceKeys = new Map<string, string>();
  private history: readonly DialogueHistoryEntryV0[] = [];
  private historyKeys = new Map<string, string>();
  private controlKeys?: Map<SemanticAction, string>;
  private nextNodeSerial = 1;
  private nextConversationSerial = 1;
  private closeReason?: unknown;
  private readonly frameAbort = (): void => this.terminate(abortError());
  private readonly scopeAbort = (): void => this.terminate(abortError());

  constructor(scope: SubsystemScope, frame: Frame, options?: RPGDialogueOptionsV0) {
    const validated = validateConstructor(scope, frame, options);
    this.scope = validated.scope;
    this.frame = validated.frame;
    this.cancelable = validated.cancelable;
    this.zIndex = validated.zIndex;
    this.controls = Object.freeze({
      confirm: () => this.routeSafely("confirm"),
      previous: () => this.routeSafely("previous"),
      next: () => this.routeSafely("next"),
      history: () => this.routeSafely("history"),
      cancel: () => this.routeSafely("cancel"),
    });
    this.frame.signal.addEventListener("abort", this.frameAbort, { once: true });
    this.scope.signal.addEventListener("abort", this.scopeAbort, { once: true });
    if (this.frame.signal.aborted || this.scope.signal.aborted) this.terminate(abortError());
  }

  openConversation(request: ConversationRequestV0): Promise<ConversationResultV0> {
    return new Promise<ConversationResultV0>((resolve, reject) => {
      queueMicrotask(async () => {
        try {
          await this.beginConversation(request, resolve, reject);
        } catch (cause) {
          reject(cause);
        }
      });
    });
  }

  setHistory(entries: readonly DialogueHistoryEntryV0[]): void {
    this.requireReady("setHistory");
    const validated = validateHistory(entries);
    const keyPlan = this.planHistoryKeys(validated);
    this.preflightHistoryWithoutConversation(validated, keyPlan.keys, keyPlan.nextSerial);
    if (this.domain !== undefined) {
      const state = this.currentState("READY", "CONVERSATION", validated, keyPlan.keys);
      validateProjection(state);
      this.domain.replace(state);
    }
    this.history = validated;
    this.historyKeys = keyPlan.keys;
    this.nextNodeSerial = keyPlan.nextSerial;
  }

  appendHistory(entry: DialogueHistoryEntryV0): void {
    this.requireReady("appendHistory");
    const validated = validateHistoryEntry(entry);
    if (this.history.some((current) => current.entryId === validated.entryId)) {
      throw new TypeError("Duplicate Dialogue History entryId");
    }
    const history = [...this.history, validated];
    const keys = new Map(this.historyKeys);
    const allocation = this.allocateKey(this.nextNodeSerial);
    keys.set(validated.entryId, allocation.key);
    this.preflightHistoryWithoutConversation(history, keys, allocation.nextSerial);
    if (this.domain !== undefined) {
      const state = this.currentState("READY", "CONVERSATION", history, keys);
      validateProjection(state);
      this.domain.replace(state);
    }
    this.history = history;
    this.historyKeys = keys;
    this.nextNodeSerial = allocation.nextSerial;
  }

  getHistorySnapshot(): readonly DialogueHistoryEntryV0[] {
    if (this.lifecycle === "CLOSED") throw closedError();
    return Object.freeze(this.history.map((entry) => Object.freeze({
      entryId: entry.entryId,
      ...(entry.speakerName === undefined ? {} : { speakerName: entry.speakerName }),
      text: entry.text,
    })));
  }

  close(): void {
    if (this.lifecycle === "CLOSED") return;
    this.terminate(operationClosedError());
  }

  private async beginConversation(
    requestValue: unknown,
    resolve: (value: ConversationResultV0) => void,
    reject: (cause: unknown) => void,
  ): Promise<void> {
    if (this.lifecycle === "CLOSED") throw this.closeReason ?? closedError();
    if (this.lifecycle === "ACTIVE") throw new Error("An RPG Dialogue Conversation is already active");
    const request = validateRequest(requestValue);
    const plan = this.planConversation(request);
    const state = this.stateFor(plan, "ACTIVE", "CONVERSATION");
    validateProjection(state);

    if (this.domain === undefined) {
      const resources = await this.createSessionResources();
      let domain: RenderDomain;
      try {
        domain = this.scope.createRenderDomain(state);
      } catch (cause) {
        this.cleanupResources(resources.subscription);
        throw cause;
      }
      this.subscription = resources.subscription;
      this.domain = domain;
    } else {
      this.domain.replace(state);
    }

    this.retainedRequest = plan.request;
    this.retainedConversationId = plan.conversationId;
    this.characterKeys = new Map(plan.characterKeys);
    this.choiceKeys = new Map(plan.choiceKeys);
    this.historyKeys = new Map(plan.historyKeys);
    this.controlKeys = new Map(plan.controlKeys);
    this.nextNodeSerial = plan.nextNodeSerial;
    this.nextConversationSerial += 1;
    this.mode = "CONVERSATION";
    this.lifecycle = "ACTIVE";
    this.active = { request, conversationId: plan.conversationId, resolve, reject, settled: false };
  }

  private planConversation(request: ConversationRequestV0): ProjectionPlan {
    if (!Number.isSafeInteger(this.nextConversationSerial)) throw new Error("Conversation identity space exhausted");
    let serial = this.nextNodeSerial;
    const allocate = (): string => {
      const allocation = this.allocateKey(serial);
      serial = allocation.nextSerial;
      return allocation.key;
    };

    const characterKeys = new Map<string, string>();
    for (const character of request.characters) {
      characterKeys.set(character.characterId, this.characterKeys.get(character.characterId) ?? allocate());
    }
    const choiceKeys = new Map<string, string>();
    for (const choice of request.conversation.choices) choiceKeys.set(choice.choiceId, allocate());
    const historyKeys = new Map(this.historyKeys);
    for (const entry of this.history) {
      if (!historyKeys.has(entry.entryId)) historyKeys.set(entry.entryId, allocate());
    }
    const controlKeys = this.controlKeys === undefined
      ? new Map<SemanticAction, string>(ACTIONS.map((action) => [action, allocate()]))
      : new Map(this.controlKeys);

    return {
      request,
      conversationId: `dialogue-conversation-${this.nextConversationSerial}`,
      characterKeys,
      choiceKeys,
      history: this.history,
      historyKeys,
      controlKeys,
      nextNodeSerial: serial,
    };
  }

  private planHistoryKeys(entries: readonly DialogueHistoryEntryV0[]): { keys: Map<string, string>; nextSerial: number } {
    let serial = this.nextNodeSerial;
    const keys = new Map<string, string>();
    for (const entry of entries) {
      const current = this.historyKeys.get(entry.entryId);
      if (current !== undefined) {
        keys.set(entry.entryId, current);
      } else {
        const allocation = this.allocateKey(serial);
        serial = allocation.nextSerial;
        keys.set(entry.entryId, allocation.key);
      }
    }
    return { keys, nextSerial: serial };
  }

  private allocateKey(serial: number): { readonly key: string; readonly nextSerial: number } {
    if (!Number.isSafeInteger(serial)) throw new Error("Render identity space exhausted");
    return { key: `dialogue-node-${serial}`, nextSerial: serial + 1 };
  }

  private async createSessionResources(): Promise<SessionResources> {
    const subscription = await this.scope.events.subscribe(
      [WEB_PRESENTATION_EVENT_CHANNEL],
      (event: SessionEvent) => {
        if (event.channel === WEB_PRESENTATION_EVENT_CHANNEL) this.receivePresentationEvent(event);
      },
    );
    return { subscription };
  }

  private receivePresentationEvent(event: SessionEvent): void {
    const value = event.payload;
    if (event.type !== "submit" || this.lifecycle !== "ACTIVE" || this.active?.settled !== false || !plainDataObject(value) ||
        !exactKeys(value, ["domainId", "targetKey", "data"], []) ||
        typeof value.domainId !== "string" || value.targetKey !== "conversation" || !plainDataObject(value.data)) return;
    const data = value.data;
    if (!exactKeys(data, ["conversationId"], ["choiceId"]) ||
        typeof data.conversationId !== "string" || data.conversationId !== this.active.conversationId ||
        this.mode !== "CONVERSATION") return;

    const choices = this.active.request.conversation.choices;
    if (choices.length === 0) {
      if (Object.hasOwn(data, "choiceId")) return;
      this.resolveActive({ type: "submitted" });
      return;
    }
    if (typeof data.choiceId !== "string") return;
    const choice = choices.find((candidate) => candidate.choiceId === data.choiceId);
    if (choice === undefined || choice.enabled === false) return;
    this.resolveActive({ type: "submitted", choiceId: choice.choiceId });
  }

  private routeSafely(action: SemanticAction): void {
    try {
      this.route(action);
    } catch (cause) {
      this.terminate(cause);
    }
  }

  private route(action: SemanticAction): void {
    if (this.lifecycle !== "ACTIVE" || this.active?.settled !== false || this.domain === undefined) return;
    if (action === "history") {
      this.setMode(this.mode === "CONVERSATION" ? "HISTORY" : "CONVERSATION");
      return;
    }
    if (action === "cancel") {
      if (this.mode === "HISTORY") {
        this.setMode("CONVERSATION");
      } else if (this.cancelable) {
        this.resolveActive({ type: "cancelled" });
      }
      return;
    }
    if (this.mode === "HISTORY") {
      if (action === "previous") this.domain.emit({ targetKey: "history", name: "scroll-up", data: emptyData() });
      if (action === "next") this.domain.emit({ targetKey: "history", name: "scroll-down", data: emptyData() });
      return;
    }
    if (action === "confirm") {
      this.domain.emit({ targetKey: "conversation", name: "commit", data: emptyData() });
    } else if (action === "previous" && this.active.request.conversation.choices.length > 0) {
      this.domain.emit({ targetKey: "conversation", name: "choice-previous", data: emptyData() });
    } else if (action === "next" && this.active.request.conversation.choices.length > 0) {
      this.domain.emit({ targetKey: "conversation", name: "choice-next", data: emptyData() });
    }
  }

  private setMode(mode: InteractionMode): void {
    if (this.lifecycle !== "ACTIVE" || this.active === undefined || this.domain === undefined || mode === this.mode) return;
    const state = this.currentState("ACTIVE", mode, this.history, this.historyKeys);
    validateProjection(state);
    this.domain.replace(state);
    this.mode = mode;
    if (mode === "HISTORY") {
      this.domain.emit({ targetKey: "history", name: "scroll-to-latest", data: emptyData() });
    }
  }

  private resolveActive(value: ConversationResultV0): void {
    const active = this.active;
    if (active === undefined || active.settled) return;
    active.settled = true;
    try {
      const state = this.currentState("READY", "CONVERSATION", this.history, this.historyKeys);
      validateProjection(state);
      this.domain?.replace(state);
    } catch (cause) {
      this.terminate(cause);
      return;
    }
    this.mode = "CONVERSATION";
    this.lifecycle = "READY";
    this.active = undefined;
    active.resolve(value);
  }

  private requireReady(operation: string): void {
    if (this.lifecycle === "CLOSED") throw closedError();
    if (this.lifecycle !== "READY") throw new Error(`${operation} is only legal while RPGDialogue is READY`);
  }

  private currentState(
    lifecycle: "READY" | "ACTIVE",
    mode: InteractionMode,
    history: readonly DialogueHistoryEntryV0[],
    historyKeys: ReadonlyMap<string, string>,
  ): RenderDomainState {
    if (this.retainedRequest === undefined || this.retainedConversationId === undefined || this.controlKeys === undefined) {
      throw new Error("Dialogue projection has not been materialized");
    }
    return this.buildState({
      request: this.retainedRequest,
      conversationId: this.retainedConversationId,
      characterKeys: this.characterKeys,
      choiceKeys: this.choiceKeys,
      history,
      historyKeys,
      controlKeys: this.controlKeys,
      nextNodeSerial: this.nextNodeSerial,
    }, lifecycle, mode);
  }

  private stateFor(plan: ProjectionPlan, lifecycle: "READY" | "ACTIVE", mode: InteractionMode): RenderDomainState {
    return this.buildState(plan, lifecycle, mode);
  }

  private buildState(plan: ProjectionPlan, lifecycle: "READY" | "ACTIVE", mode: InteractionMode): RenderDomainState {
    const conversation = plan.request.conversation;
    const activeHistory = lifecycle === "ACTIVE" && mode === "HISTORY";
    const controlEnabled = (action: SemanticAction): boolean => {
      if (lifecycle === "READY") return false;
      if (activeHistory) {
        if (action === "previous" || action === "next") return plan.history.length > 0;
        return action === "history" || action === "cancel";
      }
      if (action === "confirm" || action === "history") return true;
      if (action === "previous" || action === "next") return conversation.choices.length > 0;
      return action === "cancel" && this.cancelable;
    };

    const characters: RenderNode = {
      key: "characters",
      tag: "lr-dialogue-characters",
      attrs: {},
      data: {},
      children: plan.request.characters.map((character) => ({
        key: plan.characterKeys.get(character.characterId) as string,
        tag: "lr-dialogue-character",
        attrs: {
          "character-id": character.characterId,
          ...(character.displayName === undefined ? {} : { "display-name": character.displayName }),
          active: character.active ? "true" : "false",
        },
        data: character.data,
        children: [],
      })),
    };
    const choices: RenderNode = {
      key: "choices",
      tag: "lr-dialogue-choices",
      attrs: {},
      data: {},
      children: conversation.choices.map((choice) => ({
        key: plan.choiceKeys.get(choice.choiceId) as string,
        tag: "lr-dialogue-choice",
        attrs: {
          "choice-id": choice.choiceId,
          text: choice.text,
          enabled: choice.enabled === false ? "false" : "true",
        },
        data: choice.data,
        children: [],
      })),
    };
    const conversationNode: RenderNode = {
      key: "conversation",
      tag: "lr-dialogue-conversation",
      attrs: {
        "conversation-id": plan.conversationId,
        ...(conversation.speakerName === undefined ? {} : { "speaker-name": conversation.speakerName }),
      },
      data: conversation.data,
      children: [{ key: "text", tag: "lr-dialogue-text", attrs: { text: conversation.text }, data: {}, children: [] }, choices],
    };
    const controls: RenderNode = {
      key: "controls",
      tag: "lr-dialogue-controls",
      attrs: {},
      data: {},
      children: ACTIONS.map((action) => ({
        key: plan.controlKeys.get(action) as string,
        tag: "lr-dialogue-control-hint",
        attrs: { action, label: action, enabled: controlEnabled(action) ? "true" : "false" },
        data: {},
        children: [],
      })),
    };
    const history: RenderNode = {
      key: "history",
      tag: "lr-dialogue-history",
      attrs: { visible: activeHistory ? "true" : "false" },
      data: {},
      children: plan.history.map((entry) => ({
        key: plan.historyKeys.get(entry.entryId) as string,
        tag: "lr-dialogue-history-entry",
        attrs: {
          "entry-id": entry.entryId,
          ...(entry.speakerName === undefined ? {} : { "speaker-name": entry.speakerName }),
          text: entry.text,
        },
        data: {},
        children: [],
      })),
    };
    return {
      zIndex: this.zIndex,
      roots: [{
        key: "dialogue",
        tag: "lr-dialogue-view",
        attrs: { version: "0" },
        data: {},
        children: [characters, conversationNode, controls, history],
      }],
    };
  }

  private preflightHistoryWithoutConversation(
    history: readonly DialogueHistoryEntryV0[],
    historyKeys: ReadonlyMap<string, string>,
    nextSerial: number,
  ): void {
    if (this.retainedRequest !== undefined) return;
    const controls = new Map<SemanticAction, string>(ACTIONS.map((action, index) => [action, `dialogue-preflight-control-${index}`]));
    validateProjection(this.buildState({
      request: { conversation: { text: "", choices: [], data: {} }, characters: [] },
      conversationId: "dialogue-preflight",
      characterKeys: new Map(),
      choiceKeys: new Map(),
      history,
      historyKeys,
      controlKeys: controls,
      nextNodeSerial: nextSerial,
    }, "READY", "CONVERSATION"));
  }

  private cleanupResources(subscription: SessionEventSubscription): void {
    try { subscription.close(); } catch { /* best-effort */ }
  }

  private cleanupSession(): void {
    const subscription = this.subscription;
    this.subscription = undefined;
    try { subscription?.close(); } catch { /* best-effort */ }
    const domain = this.domain;
    this.domain = undefined;
    try { domain?.close(); } catch { /* best-effort */ }
    try { this.frame.signal.removeEventListener("abort", this.frameAbort); } catch { /* best-effort */ }
    try { this.scope.signal.removeEventListener("abort", this.scopeAbort); } catch { /* best-effort */ }
  }

  private terminate(cause: unknown): void {
    if (this.lifecycle === "CLOSED") return;
    const active = this.active;
    if (active !== undefined) active.settled = true;
    this.active = undefined;
    this.lifecycle = "CLOSED";
    this.closeReason = cause;
    this.cleanupSession();
    this.retainedRequest = undefined;
    this.retainedConversationId = undefined;
    this.characterKeys = new Map();
    this.choiceKeys = new Map();
    this.history = [];
    this.historyKeys = new Map();
    this.controlKeys = undefined;
    active?.reject(cause);
  }
}
