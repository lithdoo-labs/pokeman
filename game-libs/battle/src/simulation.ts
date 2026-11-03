import type { DecisionPort, PresentationPort } from "./contracts.js";
import {
  BattleRuntimeImpl,
  type BattleClock,
  type BattleReplayDependencies,
  type BattleRuntime,
  type BattleSimulationDependencies,
} from "./simulation/runtime.js";
import { validateReplayRecord, type ReplayRecord } from "./simulation/replay.js";
import {
  validateResolvedBattleDefinition,
  type ResolvedBattleActor,
  type ResolvedBattleDefinition,
  type ResolvedBattleSkill,
} from "./simulation/state.js";

function assertClock(clock: BattleClock): void {
  if (clock === null || typeof clock !== "object" || typeof clock.nowMs !== "function" || typeof clock.schedule !== "function") {
    throw new TypeError("BattleClock is required");
  }
}

function assertSignal(signal: AbortSignal): void {
  if (signal === null || typeof signal !== "object" || typeof signal.addEventListener !== "function" || typeof signal.aborted !== "boolean") {
    throw new TypeError("AbortSignal is required");
  }
}

function assertPresentation(presentation: PresentationPort): void {
  if (presentation === null || typeof presentation !== "object" || !(presentation.failure instanceof Promise)
    || typeof presentation.initialize !== "function" || typeof presentation.render !== "function"
    || typeof presentation.pause !== "function" || typeof presentation.resume !== "function" || typeof presentation.close !== "function") {
    throw new TypeError("PresentationPort is required");
  }
}

function assertDecision(decision: DecisionPort): void {
  if (decision === null || typeof decision !== "object" || typeof decision.decide !== "function") throw new TypeError("DecisionPort is required");
}

export class BattleSimulationBuilder {
  readonly #dependencies: BattleSimulationDependencies;
  #built = false;

  constructor(dependencies: BattleSimulationDependencies) {
    if (dependencies === null || typeof dependencies !== "object") throw new TypeError("Battle Simulation dependencies are required");
    assertClock(dependencies.clock);
    assertSignal(dependencies.signal);
    assertDecision(dependencies.decision);
    assertPresentation(dependencies.presentation);
    this.#dependencies = dependencies;
  }

  build(definition: ResolvedBattleDefinition): BattleRuntime {
    if (this.#built) throw new Error("BattleSimulationBuilder.build() is one-shot");
    const validated = validateResolvedBattleDefinition(definition);
    const runtime = new BattleRuntimeImpl(validated, this.#dependencies);
    this.#built = true;
    return runtime;
  }
}

export class BattleReplayBuilder {
  readonly #dependencies: BattleReplayDependencies;
  #built = false;

  constructor(dependencies: BattleReplayDependencies) {
    if (dependencies === null || typeof dependencies !== "object") throw new TypeError("Battle Replay dependencies are required");
    assertClock(dependencies.clock);
    assertSignal(dependencies.signal);
    assertPresentation(dependencies.presentation);
    this.#dependencies = dependencies;
  }

  build(record: ReplayRecord): BattleRuntime {
    if (this.#built) throw new Error("BattleReplayBuilder.build() is one-shot");
    const validatedRecord = validateReplayRecord(record);
    const initial = validateResolvedBattleDefinition(validatedRecord.initial);
    const detached: ReplayRecord = Object.freeze({ ...validatedRecord, initial });
    const runtime = new BattleRuntimeImpl(initial, { ...this.#dependencies, replaySource: detached });
    this.#built = true;
    return runtime;
  }
}

export { validateResolvedBattleDefinition } from "./simulation/state.js";
export type {
  BattleClock,
  BattleReplayDependencies,
  BattleRuntime,
  BattleSimulationDependencies,
} from "./simulation/runtime.js";
export type {
  ReplayDamageFact,
  ReplayDecisionRecord,
  ReplayMovementFact,
  ReplayProtectionFact,
  ReplayRecord,
  ReplaySkillFact,
  ReplayTickRecord,
} from "./simulation/replay.js";
export type { ResolvedBattleActor, ResolvedBattleDefinition, ResolvedBattleSkill };
