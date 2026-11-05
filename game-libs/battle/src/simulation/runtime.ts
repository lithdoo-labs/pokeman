import {
  compareActorId,
  type BattleMessage,
  type BattlePauseEvent,
  type BattlePauseReason,
  type BattleResult,
  type BattleStatus,
  type BattleTransition,
  type BattleSceneInit,
  type BattleSnapshot,
  type DecisionCompletion,
  type DecisionMetric,
  type DecisionMetricsSink,
  type DecisionPort,
  type DecisionRequest,
  type PlayerVisibleDecisionReason,
  type PresentationFailure,
  type PresentationPort,
} from "../contracts.js";
import { checkedMultiply, SimulationFailure } from "./numeric.js";
import { ensureDecision, type RequestDecisionCommand } from "./plan.js";
import { DecisionInbox, ScheduledEventQueue } from "./queues.js";
import { ReplayRecorder, type ReplayDecisionRecord, type ReplayRecord } from "./replay.js";
import { createInitialState, type BattleState, type ResolvedBattleDefinition } from "./state.js";
import { createInitialProjection, createSnapshot, processOneTick, type SimulationMessageFact } from "./tick.js";

export interface BattleClock {
  nowMs(): number;
  schedule(delayMs: number, callback: () => void): () => void;
}

export interface BattleRuntime {
  run(): Promise<BattleResult>;
  pause(reason?: "host-background"): void;
  resume(): void;
  cancel(): void;
  close(): void;
  getSnapshot(): BattleSnapshot;
  getReplay(): ReplayRecord;
  onPause(listener: (event: BattlePauseEvent) => void): () => void;
  onTransition(listener: (event: BattleTransition) => void): () => void;
  /**
   * Observe the ordered, append-only battle message stream (Runtime events,
   * committed Simulation facts, and validated non-authoritative Call A
   * analysis text) through one strictly increasing sequence. Listener errors
   * are isolated and never affect battle authority. Register before run().
   */
  onMessage(listener: (message: BattleMessage) => void): () => void;
  /**
   * Trusted, best-effort, non-authoritative observation entry for a concrete
   * Decision's optional Call A processMessageObserver. Invalid, stale,
   * aborted, superseded, or duplicated reports are silently dropped; this
   * never mutates Decision/Simulation/Replay state.
   */
  reportDecisionAnalysis(request: DecisionRequest, strategyMemo: string): void;
}

export interface BattleSimulationDependencies {
  readonly clock: BattleClock;
  readonly signal: AbortSignal;
  readonly decision: DecisionPort;
  readonly presentation: PresentationPort;
  /** Optional best-effort decision metrics sink; failures are isolated. */
  readonly metricsSink?: DecisionMetricsSink;
}

export interface BattleReplayDependencies {
  readonly clock: BattleClock;
  readonly signal: AbortSignal;
  readonly presentation: PresentationPort;
}

interface RequestHandle {
  readonly requestId: string;
  readonly controller: AbortController;
}

interface RequestTiming {
  readonly invokedAtMs: number;
  enqueuedAtMs?: number;
  enqueuedTick?: number;
}

interface PlanAcceptanceMarker {
  readonly actorId: string;
  readonly acceptedTick: number;
}

interface RuntimeOptions {
  readonly clock: BattleClock;
  readonly signal: AbortSignal;
  readonly presentation: PresentationPort;
  readonly decision?: DecisionPort;
  readonly replaySource?: ReplayRecord;
  readonly metricsSink?: DecisionMetricsSink;
}

interface DecisionAvailabilityGuard {
  consecutiveFailures: number;
  circuitOpen: boolean;
}

const MAX_CONSECUTIVE_DECISION_FAILURES = 3;

const PLAYER_VISIBLE_DECISION_REASONS: ReadonlySet<string> = new Set([
  "initial",
  "damaging_hit",
  "plan_exhausted",
  "plan_failed",
]);

/** Hard safety bound for non-authoritative analysis text payloads. */
const MAX_ANALYSIS_TEXT_CHARS = 10_000;

function isPlayerVisibleDecisionReason(value: string): value is PlayerVisibleDecisionReason {
  return PLAYER_VISIBLE_DECISION_REASONS.has(value);
}

function isClassifiedPresentation(code: unknown): code is "PRESENTATION_CONTENT_FAILED" | "PRESENTATION_COMMIT_FAILED" {
  return code === "PRESENTATION_CONTENT_FAILED" || code === "PRESENTATION_COMMIT_FAILED";
}

function errorCode(error: unknown): unknown {
  return error !== null && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
}

function samePoint(left: { x: number; y: number }, right: { x: number; y: number }): boolean {
  return left.x === right.x && left.y === right.y;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type BattleMessagePayload = DistributiveOmit<BattleMessage, "id" | "sequence" | "tick" | "elapsedMs">;

function deepFreezeMessage<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreezeMessage(child);
    Object.freeze(value);
  }
  return value;
}

function normalizeCompletion(value: unknown, expected: DecisionRequest): DecisionCompletion {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("DecisionPort returned malformed completion");
  const item = value as Record<string, unknown>;
  if (item.type !== "completed" && item.type !== "failed") throw new Error("DecisionPort returned malformed completion");
  const expectedKeys = item.type === "completed" ? ["type", "requestId", "generation", "plan"] : ["type", "requestId", "generation", "error"];
  if (Object.keys(item).length !== expectedKeys.length || expectedKeys.some((key) => !Object.hasOwn(item, key))) throw new Error("DecisionPort returned malformed completion");
  if (item.requestId !== expected.requestId || item.generation !== expected.generation) throw new Error("DecisionPort correlation mismatch");
  if (item.type === "completed") return item as unknown as DecisionCompletion;
  if (item.error === null || typeof item.error !== "object" || Array.isArray(item.error)) throw new Error("DecisionPort returned malformed failure");
  const failure = item.error as Record<string, unknown>;
  if ((failure.category !== "attempt_failure" && failure.category !== "session_fatal") || typeof failure.code !== "string" || failure.code.length === 0
    || Object.keys(failure).some((key) => !["category", "code", "metadata"].includes(key))) throw new Error("DecisionPort returned malformed failure");
  return item as unknown as DecisionCompletion;
}

function sceneFor(definition: ResolvedBattleDefinition): BattleSceneInit {
  const effectIds = [...new Set(definition.actors.flatMap((actor) => actor.skills.map((skill) => skill.effect)))].sort(compareActorId);
  return Object.freeze({
    battleId: definition.battleId,
    sceneEpoch: definition.sceneEpoch,
    tickDurationMs: 200,
    map: definition.map.ref,
    actors: Object.freeze([...definition.actors].sort((a, b) => compareActorId(a.actorId, b.actorId)).map((actor) => Object.freeze({
      actorId: actor.actorId,
      team: actor.team,
      character: actor.character,
    }))),
    effectIds: Object.freeze(effectIds),
  });
}

export class BattleRuntimeImpl implements BattleRuntime {
  readonly #definition: ResolvedBattleDefinition;
  readonly #clock: BattleClock;
  readonly #signal: AbortSignal;
  readonly #decision?: DecisionPort;
  readonly #presentation: PresentationPort;
  readonly #replaySource?: ReplayRecord;
  readonly #state: BattleState;
  readonly #events = new ScheduledEventQueue();
  readonly #inbox = new DecisionInbox();
  readonly #recorder: ReplayRecorder;
  readonly #requests = new Map<string, RequestHandle>();
  readonly #requestFacts = new Map<string, DecisionRequest>();
  readonly #matchedReplayRequests = new Set<string>();
  readonly #verifiedReplayTicks = new Set<number>();
  readonly #verifiedReplayDecisions = new Set<string>();
  readonly #decisionAvailabilityGuard: DecisionAvailabilityGuard | null;
  readonly #pauseListeners = new Set<(event: BattlePauseEvent) => void>();
  readonly #transitionListeners = new Set<(event: BattleTransition) => void>();
  readonly #messageListeners = new Set<(message: BattleMessage) => void>();
  readonly #metricsSink?: DecisionMetricsSink;
  readonly #requestTimings = new Map<string, RequestTiming>();
  readonly #planAcceptance = new Map<string, PlanAcceptanceMarker>();
  readonly #visibleStartedRequests = new Set<string>();
  readonly #reportedAnalysis = new Set<string>();
  #messageSequence = 0;
  #runCalled = false;
  #runResolve: ((result: BattleResult) => void) | null = null;
  #runReject: ((error: unknown) => void) | null = null;
  #wakeCancel: (() => void) | null = null;
  #accumulatedRunningMs = 0;
  #runningAnchorMs = 0;
  #lastClockMs: number | null = null;
  #processingTick = false;
  #terminalCommitted = false;
  #signalListening = false;
  readonly #onAbort = (): void => this.cancel();

  constructor(definition: ResolvedBattleDefinition, options: RuntimeOptions) {
    this.#definition = definition;
    this.#clock = options.clock;
    this.#signal = options.signal;
    this.#decision = options.decision;
    this.#presentation = options.presentation;
    this.#replaySource = options.replaySource;
    this.#metricsSink = options.metricsSink;
    this.#decisionAvailabilityGuard = options.replaySource === undefined
      ? { consecutiveFailures: 0, circuitOpen: false }
      : null;
    this.#state = createInitialState(definition);
    this.#recorder = new ReplayRecorder(definition);
  }

  run(): Promise<BattleResult> {
    if (this.#runCalled) throw new Error("BattleRuntime.run() is one-shot");
    if (this.#state.status === "closed") throw new Error("Cannot run a closed BattleRuntime");
    this.#runCalled = true;
    const promise = new Promise<BattleResult>((resolve, reject) => {
      this.#runResolve = resolve;
      this.#runReject = reject;
    });
    void this.#initialize();
    return promise;
  }

  async #initialize(): Promise<void> {
    this.#transition("initializing");
    this.#signal.addEventListener("abort", this.#onAbort, { once: true });
    this.#signalListening = true;
    if (this.#signal.aborted) {
      this.cancel();
      return;
    }
    void this.#presentation.failure.then(
      (failure) => this.#onPresentationFailure(failure),
      (error) => this.#rejectInvariant(error),
    );
    try {
      await this.#presentation.initialize(sceneFor(this.#definition));
    } catch (error) {
      this.#handlePresentationThrow(error);
      return;
    }
    if (this.#state.status !== "initializing" || this.#terminalCommitted) return;
    try {
      this.#presentation.render(createInitialProjection(this.#state));
    } catch (error) {
      this.#handlePresentationThrow(error);
      return;
    }
    if (this.#state.status !== "initializing" || this.#terminalCommitted) return;
    const commands: RequestDecisionCommand[] = [];
    for (const actor of [...this.#state.actors.values()].sort((a, b) => compareActorId(a.actorId, b.actorId))) {
      const command = ensureDecision(this.#definition, this.#state, actor, this.#recorder.ticks, "initial", 0);
      if (command !== null) commands.push(command);
    }
    try {
      this.#runningAnchorMs = this.#readClock();
    } catch (error) {
      this.#rejectInvariant(error);
      return;
    }
    this.#invokeCommands(commands);
    this.#transition("running");
    this.#scheduleNextWake();
  }

  pause(reason: "host-background" = "host-background"): void {
    if (this.#state.status === "created") throw new Error("Cannot pause before run");
    if (this.#state.status !== "running") return;
    try {
      const now = this.#readClock();
      const delta = now - this.#runningAnchorMs;
      if (!Number.isFinite(delta) || delta < 0 || this.#accumulatedRunningMs > Number.MAX_SAFE_INTEGER - delta) throw new Error("Invalid BattleClock elapsed time");
      this.#accumulatedRunningMs += delta;
      this.#cancelWake();
      this.#presentation.pause();
      if (this.#state.status === "running") this.#commitPause(reason);
    } catch (error) {
      this.#handlePresentationOrClockThrow(error);
    }
  }

  resume(): void {
    if (this.#state.status === "created") throw new Error("Cannot resume before run");
    if (this.#state.status !== "paused") return;
    try {
      if (this.#decisionAvailabilityGuard?.circuitOpen === true) {
        this.#decisionAvailabilityGuard.consecutiveFailures = 0;
        this.#decisionAvailabilityGuard.circuitOpen = false;
      }
      this.#presentation.resume();
      if (this.#state.status !== "paused") return;
      this.#runningAnchorMs = this.#readClock();
      this.#state.pauseReason = null;
      this.#transition("running");
      this.#dispatchMessage(null, { type: "battle.resumed" });
      this.#scheduleNextWake();
    } catch (error) {
      this.#handlePresentationOrClockThrow(error);
    }
  }

  cancel(): void {
    if (this.#terminalCommitted || this.#state.status === "settled" || this.#state.status === "closed") return;
    this.#finish({ type: "cancelled" }, { type: "audit_only", reason: "cancelled" });
  }

  close(): void {
    if (this.#state.status === "closed") return;
    if (this.#state.status === "created") {
      this.#cleanup();
      this.#transition("closed");
      return;
    }
    if (this.#state.status === "settled") {
      this.#presentation.close();
      this.#transition("closed");
      return;
    }
    this.cancel();
  }

  getSnapshot(): BattleSnapshot {
    return createSnapshot(this.#state);
  }

  getReplay(): ReplayRecord {
    return this.#recorder.snapshot();
  }

  onPause(listener: (event: BattlePauseEvent) => void): () => void {
    if (typeof listener !== "function") throw new TypeError("Battle pause listener must be a function");
    this.#pauseListeners.add(listener);
    return () => this.#pauseListeners.delete(listener);
  }

  onTransition(listener: (event: BattleTransition) => void): () => void {
    if (typeof listener !== "function") throw new TypeError("Battle transition listener must be a function");
    this.#transitionListeners.add(listener);
    return () => this.#transitionListeners.delete(listener);
  }

  onMessage(listener: (message: BattleMessage) => void): () => void {
    if (typeof listener !== "function") throw new TypeError("Battle message listener must be a function");
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  reportDecisionAnalysis(request: DecisionRequest, strategyMemo: string): void {
    if (this.#terminalCommitted || this.#state.status === "closed" || this.#state.status === "settled") return;
    if (request === null || typeof request !== "object") return;
    if (typeof strategyMemo !== "string" || strategyMemo.trim().length === 0) return;
    if (!this.#requestFacts.has(request.requestId)) return;
    if (!this.#visibleStartedRequests.has(request.requestId)) return;
    if (this.#reportedAnalysis.has(request.requestId)) return;
    const actor = this.#state.actors.get(request.actorId);
    if (actor === undefined || actor.decision.type !== "thinking") return;
    if (actor.decision.requestId !== request.requestId || actor.decision.generation !== request.generation) return;
    if (actor.decision.attempt !== 0 || request.correction !== undefined) return;
    this.#reportedAnalysis.add(request.requestId);
    const text = strategyMemo.length > MAX_ANALYSIS_TEXT_CHARS
      ? strategyMemo.slice(0, MAX_ANALYSIS_TEXT_CHARS)
      : strategyMemo;
    this.#dispatchMessage(null, { type: "decision.analysis_completed", actorId: request.actorId, text });
  }

  /**
   * Allocate id/sequence/elapsedMs for one message and notify listeners.
   * `payload` omits the BattleMessageBase fields; tick is null for Runtime
   * lifecycle events outside any Tick.
   */
  #dispatchMessage(tick: number | null, payload: BattleMessagePayload): void {
    this.#messageSequence += 1;
    const sequence = this.#messageSequence;
    const message = deepFreezeMessage({
      id: `${this.#state.battleId}:message:${sequence}`,
      sequence,
      tick,
      elapsedMs: this.#messageElapsedMs(),
      ...payload,
    } as BattleMessage);
    for (const listener of [...this.#messageListeners]) {
      try { listener(message); } catch { /* observers do not own Battle authority */ }
    }
  }

  #publishMessageFacts(facts: readonly SimulationMessageFact[]): void {
    const tick = this.#state.currentTick;
    for (const fact of facts) {
      if (fact.type === "movement.started") this.#recordActionStart(fact.movementIntentId, tick);
      else if (fact.type === "skill.started") this.#recordSkillActionStart(fact.actorId, tick);
      this.#dispatchMessage(tick, fact as BattleMessagePayload);
    }
  }

  #messageElapsedMs(): number {
    if (this.#state.status !== "running") return this.#accumulatedRunningMs;
    try {
      return this.#logicalElapsed();
    } catch {
      return this.#accumulatedRunningMs;
    }
  }

  #safeNowMs(): number {
    try {
      return this.#readClock();
    } catch {
      return this.#lastClockMs ?? 0;
    }
  }

  #recordMetric(metric: DecisionMetric): void {
    const sink = this.#metricsSink;
    if (sink === undefined) return;
    try {
      const outcome = sink.record(metric);
      if (outcome !== null && typeof outcome === "object" && typeof (outcome as Promise<void>).catch === "function") {
        (outcome as Promise<void>).catch(() => { /* isolated */ });
      }
    } catch { /* metrics must never affect battle */ }
  }

  #recordActionStart(planId: string, tick: number): void {
    const marker = this.#planAcceptance.get(planId);
    if (marker === undefined) return;
    this.#planAcceptance.delete(planId);
    this.#recordMetric({
      scope: "runtime",
      stage: "acceptance_to_action_start",
      tickDelay: Math.max(0, tick - marker.acceptedTick),
      outcome: "accepted",
    });
  }

  #recordSkillActionStart(actorId: string, tick: number): void {
    for (const [planId, marker] of [...this.#planAcceptance.entries()]) {
      if (marker.actorId !== actorId) continue;
      this.#planAcceptance.delete(planId);
      this.#recordMetric({
        scope: "runtime",
        stage: "acceptance_to_action_start",
        tickDelay: Math.max(0, tick - marker.acceptedTick),
        outcome: "accepted",
      });
      void planId;
      return;
    }
  }

  #transition(to: BattleStatus): void {
    const from = this.#state.status;
    const legal: Readonly<Record<BattleStatus, readonly BattleStatus[]>> = {
      created: ["initializing", "closed"],
      initializing: ["running", "closed"],
      running: ["paused", "settled", "closed"],
      paused: ["running", "settled", "closed"],
      settled: ["closed"],
      closed: [],
    };
    if (!legal[from].includes(to)) throw new Error(`Illegal Battle transition: ${from} -> ${to}`);
    this.#state.status = to;
    const event = Object.freeze({ from, to });
    for (const listener of [...this.#transitionListeners]) {
      try { listener(event); } catch { /* operational observers do not own Battle authority */ }
    }
  }

  #commitPause(reason: BattlePauseReason): void {
    this.#state.pauseReason = reason;
    this.#transition("paused");
    this.#dispatchMessage(null, { type: "battle.paused", reason });
    const event = Object.freeze({ reason });
    for (const listener of [...this.#pauseListeners]) {
      try { listener(event); } catch { /* operational observers do not own Battle authority */ }
    }
  }

  #readClock(): number {
    const now = this.#clock.nowMs();
    if (!Number.isFinite(now) || now < 0 || (this.#lastClockMs !== null && now < this.#lastClockMs)) throw new Error("BattleClock must be finite, non-negative, and monotonic");
    this.#lastClockMs = now;
    return now;
  }

  #logicalElapsed(): number {
    if (this.#state.status !== "running") return this.#accumulatedRunningMs;
    const now = this.#readClock();
    const delta = now - this.#runningAnchorMs;
    if (!Number.isFinite(delta) || delta < 0 || this.#accumulatedRunningMs > Number.MAX_SAFE_INTEGER - delta) throw new Error("BattleClock elapsed time overflow");
    return this.#accumulatedRunningMs + delta;
  }

  #scheduleNextWake(): void {
    if (this.#state.status !== "running" || this.#wakeCancel !== null) return;
    try {
      if (this.#state.currentTick === Number.MAX_SAFE_INTEGER) {
        this.#finish({ type: "failure", source: "simulation", code: "BATTLE_COUNTER_OVERFLOW" }, { type: "deterministic" });
        return;
      }
      const elapsed = this.#logicalElapsed();
      if (this.#state.currentTick + 1 > Math.floor(Number.MAX_SAFE_INTEGER / 200)) {
        this.#finish({ type: "failure", source: "simulation", code: "BATTLE_NUMERIC_OVERFLOW" }, { type: "deterministic" });
        return;
      }
      const nextDeadline = (this.#state.currentTick + 1) * 200;
      const delay = Math.max(0, nextDeadline - elapsed);
      this.#wakeCancel = this.#clock.schedule(delay, () => {
        this.#wakeCancel = null;
        this.#wake();
      });
    } catch (error) {
      this.#rejectInvariant(error);
    }
  }

  #wake(): void {
    if (this.#state.status !== "running") return;
    if (this.#processingTick) {
      this.#rejectInvariant(new Error("Battle tick reentry"));
      return;
    }
    try {
      while (this.#state.status === "running") {
        const targetTick = Math.floor(this.#logicalElapsed() / 200);
        if (!Number.isSafeInteger(targetTick) || targetTick < 0) throw new Error("Invalid logical target Tick");
        if (this.#state.currentTick >= targetTick) break;
        if (this.#state.currentTick === Number.MAX_SAFE_INTEGER) throw new SimulationFailure("BATTLE_COUNTER_OVERFLOW");
        this.#state.currentTick += 1;
        this.#injectReplayCompletions(this.#state.currentTick);
        this.#processingTick = true;
        const output = processOneTick(this.#definition, this.#state, this.#events, this.#inbox, this.#recorder.ticks, this.#requestFacts);
        this.#processingTick = false;
        for (const event of output.scheduledEvents) this.#events.schedule(event);
        for (const record of output.decisionRecords) {
          this.#recorder.appendDecision(record);
          this.#requestFacts.delete(record.requestId);
          this.#recordConsumptionMetric(record);
        }
        this.#recorder.appendTick(output.replayTick);
        this.#verifyReplayTick(output.replayTick, output.decisionRecords);
        // Simulation facts are published in array order before any new
        // decision turn is announced for this Tick.
        this.#publishMessageFacts(output.messageFacts);
        // A session-fatal decision failure that will terminate the Battle is
        // announced once, before battle.ended and without provider internals.
        for (const record of output.decisionRecords) {
          if (record.consumeOutcome.type === "session_fatal") {
            this.#dispatchMessage(this.#state.currentTick, { type: "decision.failed", actorId: record.actorId, reason: "unavailable" });
          }
        }
        for (const actorId of output.abortActorIds) this.#abortRequest(actorId);
        try {
          this.#presentation.render(output.projection);
        } catch (error) {
          this.#handlePresentationThrow(error);
          break;
        }
        if (output.terminalCandidate !== null) {
          this.#finish(output.terminalCandidate, { type: "deterministic" });
          break;
        }
        const circuitPausePending = this.#processDecisionHealthSignals(output.decisionHealthSignals);
        this.#invokeCommands(output.decisionCommands);
        if (circuitPausePending && this.#state.status === "running") {
          this.#pauseAtCommittedTickBoundary();
        }
      }
    } catch (error) {
      this.#processingTick = false;
      if (error instanceof SimulationFailure || (error instanceof Error && error.name === "SimulationFailure")) {
        this.#finish({ type: "failure", source: "simulation", code: error.message }, { type: "deterministic" });
      } else this.#rejectInvariant(error);
    }
    if (this.#state.status === "running") this.#scheduleNextWake();
  }

  #processDecisionHealthSignals(signals: readonly ("success" | "failure")[]): boolean {
    const guard = this.#decisionAvailabilityGuard;
    if (guard === null) return false;
    let circuitPausePending = false;
    for (const signal of signals) {
      if (guard.circuitOpen) continue;
      if (signal === "success") {
        guard.consecutiveFailures = 0;
        continue;
      }
      guard.consecutiveFailures += 1;
      if (guard.consecutiveFailures >= MAX_CONSECUTIVE_DECISION_FAILURES) {
        guard.circuitOpen = true;
        circuitPausePending = true;
      }
    }
    return circuitPausePending;
  }

  #pauseAtCommittedTickBoundary(): void {
    try {
      this.#accumulatedRunningMs = checkedMultiply(this.#state.currentTick, this.#definition.tickDurationMs);
      this.#cancelWake();
      this.#presentation.pause();
      if (this.#state.status === "running") this.#commitPause("decision-circuit");
    } catch (error) {
      this.#handlePresentationOrClockThrow(error);
    }
  }

  #recordConsumptionMetric(record: ReplayDecisionRecord): void {
    const timing = this.#requestTimings.get(record.requestId);
    if (timing !== undefined) {
      const outcome = record.consumeOutcome.type === "accepted" ? "accepted" as const
        : record.consumeOutcome.type === "rejected" ? "rejected" as const
        : record.consumeOutcome.type === "stale" ? "stale" as const
        : "failed" as const;
      this.#recordMetric({
        scope: "runtime",
        stage: "completion_to_acceptance",
        ...(timing.enqueuedAtMs === undefined ? {} : { durationMs: Math.max(0, this.#safeNowMs() - timing.enqueuedAtMs) }),
        ...(timing.enqueuedTick === undefined ? {} : { tickDelay: Math.max(0, record.consumedTick - timing.enqueuedTick) }),
        outcome,
      });
      this.#requestTimings.delete(record.requestId);
    }
    if (record.consumeOutcome.type === "accepted") {
      this.#planAcceptance.set(record.consumeOutcome.planId, { actorId: record.actorId, acceptedTick: record.consumeOutcome.acceptedTick });
      // Keep the marker table bounded: a battle never has many live plans.
      if (this.#planAcceptance.size > 64) {
        const oldest = this.#planAcceptance.keys().next().value;
        if (oldest !== undefined) this.#planAcceptance.delete(oldest);
      }
    }
  }

  #invokeCommands(commands: readonly RequestDecisionCommand[]): void {
    for (const command of commands) {
      if (this.#state.status !== "running" && this.#state.status !== "initializing") return;
      const actor = this.#state.actors.get(command.request.actorId);
      if (actor === undefined || actor.hp <= 0 || actor.action.type === "dead" || actor.decision.type !== "thinking"
        || actor.decision.requestId !== command.request.requestId
        || actor.decision.generation !== command.request.generation) continue;
      this.#requestFacts.set(command.request.requestId, command.request);
      if (isPlayerVisibleDecisionReason(command.reason)) {
        this.#visibleStartedRequests.add(command.request.requestId);
        this.#dispatchMessage(null, { type: "decision.started", actorId: command.request.actorId, reason: command.reason });
      }
      if (this.#replaySource !== undefined) {
        this.#matchReplayRequest(command.request);
        continue;
      }
      this.#invokeDecision(command.request);
    }
  }

  #invokeDecision(request: DecisionRequest): void {
    if (this.#decision === undefined) throw new Error("Live runtime has no DecisionPort");
    this.#abortRequest(request.actorId);
    const controller = new AbortController();
    this.#requests.set(request.actorId, { requestId: request.requestId, controller });
    this.#requestTimings.set(request.requestId, { invokedAtMs: this.#safeNowMs() });
    let promise: Promise<DecisionCompletion>;
    try {
      promise = this.#decision.decide(request, controller.signal);
    } catch (error) {
      this.#rejectInvariant(error);
      return;
    }
    Promise.resolve(promise).then((raw) => {
      const handle = this.#requests.get(request.actorId);
      if (handle?.requestId === request.requestId) this.#requests.delete(request.actorId);
      if (this.#state.status !== "running" && this.#state.status !== "paused" && this.#state.status !== "initializing") return;
      let completion: DecisionCompletion;
      try {
        completion = normalizeCompletion(raw, request);
      } catch (error) {
        this.#rejectInvariant(error);
        return;
      }
      const timing = this.#requestTimings.get(request.requestId);
      if (timing !== undefined) {
        this.#requestTimings.set(request.requestId, { ...timing, enqueuedAtMs: this.#safeNowMs(), enqueuedTick: this.#state.currentTick });
        this.#recordMetric({
          scope: "runtime",
          stage: "request_to_completion",
          durationMs: Math.max(0, this.#safeNowMs() - timing.invokedAtMs),
          outcome: completion.type === "completed" ? "completed" as const : "failed" as const,
        });
      }
      // Aborted requests release their tombstone immediately. If a provider
      // nevertheless resolves later, restore only the facts needed to record
      // that completion as stale at the next Tick boundary.
      if (!this.#requestFacts.has(request.requestId)) this.#requestFacts.set(request.requestId, request);
      this.#inbox.enqueue({ actorId: request.actorId, completion });
    }, (error) => {
      const handle = this.#requests.get(request.actorId);
      const authoritative = handle?.requestId === request.requestId;
      if (authoritative) this.#requests.delete(request.actorId);
      if (!authoritative || !this.#requestFacts.has(request.requestId)
        || (this.#state.status !== "running" && this.#state.status !== "paused" && this.#state.status !== "initializing")) return;
      this.#rejectInvariant(error);
    });
  }

  #abortRequest(actorId: string): void {
    const handle = this.#requests.get(actorId);
    if (handle === undefined) return;
    this.#requests.delete(actorId);
    this.#requestFacts.delete(handle.requestId);
    const timing = this.#requestTimings.get(handle.requestId);
    if (timing !== undefined && timing.enqueuedAtMs === undefined) {
      this.#requestTimings.delete(handle.requestId);
      this.#recordMetric({
        scope: "runtime",
        stage: "request_to_completion",
        durationMs: Math.max(0, this.#safeNowMs() - timing.invokedAtMs),
        outcome: "aborted",
      });
    }
    this.#visibleStartedRequests.delete(handle.requestId);
    handle.controller.abort();
  }

  #matchReplayRequest(request: DecisionRequest): void {
    const candidate = this.#replaySource!.decisions.find((record) => record.requestId === request.requestId);
    if (candidate === undefined) return;
    if (candidate.actorId !== request.actorId || candidate.generation !== request.generation
      || candidate.requestTick !== request.observation.tick || !samePoint(candidate.planningOrigin, request.planningOrigin)
      || this.#matchedReplayRequests.has(request.requestId)) throw new Error("Replay request invariant mismatch");
    this.#matchedReplayRequests.add(request.requestId);
  }

  #injectReplayCompletions(tick: number): void {
    if (this.#replaySource === undefined) return;
    for (const record of this.#replaySource.decisions.filter((item) => item.consumedTick === tick)
      .sort((a, b) => compareActorId(a.actorId, b.actorId) || compareActorId(a.requestId, b.requestId))) {
      if (!this.#matchedReplayRequests.has(record.requestId)) throw new Error("Replay completion preceded request");
      const completion: DecisionCompletion = record.completion.type === "completed"
        ? { type: "completed", requestId: record.requestId, generation: record.generation, plan: structuredClone(record.completion.plan) }
        : { type: "failed", requestId: record.requestId, generation: record.generation, error: { category: record.completion.category, code: record.completion.code } };
      this.#inbox.enqueue({ actorId: record.actorId, completion });
    }
  }

  #verifyReplayTick(tick: ReplayRecord["ticks"][number], decisions: readonly ReplayDecisionRecord[]): void {
    if (this.#replaySource === undefined) return;
    const expectedTick = this.#replaySource.ticks.find((item) => item.tick === tick.tick);
    if (expectedTick === undefined || JSON.stringify(expectedTick) !== JSON.stringify(tick)) throw new Error("Replay Tick fact mismatch");
    const expectedDecisions = this.#replaySource.decisions.filter((item) => item.consumedTick === tick.tick);
    if (JSON.stringify(expectedDecisions) !== JSON.stringify(decisions)) throw new Error("Replay Decision fact mismatch");
    this.#verifiedReplayTicks.add(tick.tick);
    for (const decision of expectedDecisions) this.#verifiedReplayDecisions.add(decision.requestId);
  }

  #cancelWake(): void {
    this.#wakeCancel?.();
    this.#wakeCancel = null;
  }

  #onPresentationFailure(failure: PresentationFailure): void {
    if (this.#terminalCommitted || this.#state.status === "closed" || this.#state.status === "settled") return;
    if (isClassifiedPresentation(failure.code)) {
      this.#finish({ type: "failure", source: "presentation", code: failure.code }, { type: "audit_only", reason: "presentation_failure" });
    } else this.#rejectInvariant(Object.assign(new Error(failure.message), { code: failure.code }));
  }

  #handlePresentationThrow(error: unknown): void {
    const code = errorCode(error);
    if (isClassifiedPresentation(code)) this.#finish({ type: "failure", source: "presentation", code }, { type: "audit_only", reason: "presentation_failure" });
    else this.#rejectInvariant(error);
  }

  #handlePresentationOrClockThrow(error: unknown): void {
    if (errorCode(error) !== undefined) this.#handlePresentationThrow(error);
    else this.#rejectInvariant(error);
  }

  #finish(result: BattleResult, replayability: ReplayRecord["replayability"]): boolean {
    if (this.#terminalCommitted) return false;
    if (this.#replaySource !== undefined && replayability.type === "deterministic") {
      const complete = JSON.stringify(result) === JSON.stringify(this.#replaySource.result)
        && this.#verifiedReplayTicks.size === this.#replaySource.ticks.length
        && this.#verifiedReplayDecisions.size === this.#replaySource.decisions.length
        && this.#matchedReplayRequests.size === this.#replaySource.decisions.length;
      if (!complete) {
        this.#rejectInvariant(new Error("Replay deterministic record was not fully consumed or final result mismatched"));
        return false;
      }
    }
    this.#terminalCommitted = true;
    this.#state.result = result;
    this.#recorder.finish(result, replayability);
    this.#cancelWake();
    this.#events.clear();
    this.#inbox.clear();
    this.#requestFacts.clear();
    for (const actorId of [...this.#requests.keys()]) this.#abortRequest(actorId);
    this.#removeSignalListener();
    // battle.ended is published exactly once with the final result, before
    // PresentationPort.close() and before run() resolves.
    this.#dispatchMessage(null, { type: "battle.ended", result: Object.freeze(structuredClone(result)) });
    this.#releaseMessageBookkeeping();
    if (result.type === "ally_win" || result.type === "enemy_win" || result.type === "simultaneous_defeat") {
      this.#transition("settled");
    } else {
      this.#clearActiveAuthority();
      this.#presentation.close();
      this.#transition("closed");
    }
    this.#runResolve?.(result);
    this.#runResolve = null;
    this.#runReject = null;
    return true;
  }

  #releaseMessageBookkeeping(): void {
    this.#messageListeners.clear();
    this.#visibleStartedRequests.clear();
    this.#reportedAnalysis.clear();
    this.#requestTimings.clear();
    this.#planAcceptance.clear();
  }

  #rejectInvariant(error: unknown): void {
    if (this.#terminalCommitted || this.#state.status === "closed" || this.#state.status === "settled") return;
    this.#cancelWake();
    this.#events.clear();
    this.#inbox.clear();
    this.#requestFacts.clear();
    for (const actorId of [...this.#requests.keys()]) this.#abortRequest(actorId);
    this.#removeSignalListener();
    this.#recorder.rejectInvariant();
    this.#releaseMessageBookkeeping();
    try { this.#presentation.close(); } catch { /* cleanup is best effort */ }
    this.#transition("closed");
    this.#runReject?.(error);
    this.#runResolve = null;
    this.#runReject = null;
  }

  #cleanup(): void {
    this.#cancelWake();
    this.#events.clear();
    this.#inbox.clear();
    this.#requestFacts.clear();
    for (const actorId of [...this.#requests.keys()]) this.#abortRequest(actorId);
    this.#removeSignalListener();
    this.#releaseMessageBookkeeping();
    this.#presentation.close();
  }

  #clearActiveAuthority(): void {
    this.#state.reservations.clear();
    for (const actor of this.#state.actors.values()) {
      actor.decision = { type: "none" };
      actor.activePlan = null;
      actor.pendingPlan = null;
      actor.movementIntent = null;
      if (actor.action.type !== "dead") actor.action = { type: "idle" };
    }
  }

  #removeSignalListener(): void {
    if (!this.#signalListening) return;
    this.#signal.removeEventListener("abort", this.#onAbort);
    this.#signalListening = false;
  }
}
