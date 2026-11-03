import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BattleReplayBuilder,
  BattleSimulationBuilder,
  validateResolvedBattleDefinition,
} from "../dist/simulation.js";
import { NullPresentation, RecordingPresentation } from "../dist/presentation.js";
import { coefficientAt, contentionWinner } from "../dist/simulation/combat.js";
import { takeCounter } from "../dist/simulation/numeric.js";
import { createInitialState } from "../dist/simulation/state.js";
import { buildObservation, validatePlan } from "../dist/simulation/plan.js";

class FakeBattleClock {
  now = 0;
  nextId = 1;
  tasks = [];
  nowMs() { return this.now; }
  schedule(delayMs, callback) {
    const task = { id: this.nextId++, due: this.now + delayMs, callback, cancelled: false };
    this.tasks.push(task);
    return () => { task.cancelled = true; };
  }
  advance(ms) {
    const target = this.now + ms;
    while (true) {
      const task = this.tasks.filter((item) => !item.cancelled && item.due <= target).sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!task) break;
      task.cancelled = true;
      this.now = task.due;
      task.callback();
    }
    this.now = target;
  }
  jump(ms) {
    this.now += ms;
    const task = this.tasks.filter((item) => !item.cancelled && item.due <= this.now).sort((a, b) => a.due - b.due || a.id - b.id)[0];
    if (task) { task.cancelled = true; task.callback(); }
  }
}

class ScriptDecision {
  constructor(handler) { this.handler = handler; }
  requests = [];
  signals = [];
  decide(request, signal) {
    this.requests.push(request);
    this.signals.push(signal);
    const value = this.handler(request, this.requests.length - 1);
    return Promise.resolve(value?.type ? value : {
      type: "completed",
      requestId: request.requestId,
      generation: request.generation,
      plan: value,
    });
  }
}

class DeferredDecision {
  requests = [];
  decide(request, signal) {
    return new Promise((resolve, reject) => this.requests.push({ request, signal, resolve, reject }));
  }
  complete(index, plan) {
    const { request, resolve } = this.requests[index];
    resolve({ type: "completed", requestId: request.requestId, generation: request.generation, plan });
  }
}

class FailingPresentation extends RecordingPresentation {
  constructor(code, tick = 1) { super(); this.code = code; this.tick = tick; }
  render(projection) {
    super.render(projection);
    if (projection.tick === this.tick) throw Object.assign(new Error(this.code), { code: this.code });
  }
}

const flush = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };
const point = (x, y) => ({ x, y });
const forwardRange = (units = 1000) => ({ width: 1, height: 2, originX: 0, originY: 1, coefficientUnits: [[units], [0]] });

function definition(overrides = {}) {
  const passable = Array.from({ length: 7 }, () => Array(7).fill(true));
  const base = {
    battleId: "battle:test",
    sceneEpoch: 1,
    battleSeed: "seed",
    tickDurationMs: 200,
    moveTicks: 2,
    protectionTicks: 0,
    maxPathSteps: 6,
    map: { ref: { arenaId: "test" }, width: 7, height: 7, passable },
    actors: [
      {
        actorId: "a", team: "ally", tile: point(2, 3), direction: 6, maxHp: 5,
        character: { namespace: "resource.Graphics", key: "Characters/A" },
        skills: [{ skillId: "strike", baseDamage: 5, windupTicks: 0, recoveryTicks: 0, range: forwardRange(), effect: "strike" }],
      },
      {
        actorId: "b", team: "enemy", tile: point(3, 3), direction: 4, maxHp: 5,
        character: { namespace: "resource.Graphics", key: "Characters/B" },
        skills: [{ skillId: "strike", baseDamage: 5, windupTicks: 0, recoveryTicks: 0, range: forwardRange(), effect: "strike" }],
      },
    ],
  };
  return { ...base, ...overrides };
}

function runtimeFor(def, decision, { clock = new FakeBattleClock(), presentation = new RecordingPresentation(), signal = new AbortController().signal } = {}) {
  const runtime = new BattleSimulationBuilder({ clock, signal, decision, presentation }).build(def);
  return { runtime, clock, presentation };
}

test("ResolvedBattleDefinition validation detaches and freezes all gameplay arrays", () => {
  const source = definition();
  const resolved = validateResolvedBattleDefinition(source);
  source.map.passable[0][0] = false;
  source.actors[0].skills[0].range.coefficientUnits[0][0] = 500;
  assert.equal(resolved.map.passable[0][0], true);
  assert.equal(resolved.actors[0].skills[0].range.coefficientUnits[0][0], 1000);
  assert.ok(Object.isFrozen(resolved.map.passable[0]));
  assert.throws(() => validateResolvedBattleDefinition({ ...definition(), moveTicks: 0 }));
  assert.throws(() => validateResolvedBattleDefinition({ ...definition(), actors: definition().actors.slice(0, 1) }));
  assert.throws(() => validateResolvedBattleDefinition({ ...definition(), actors: definition().actors.map((actor) => ({ ...actor, team: "ally" })) }));
});

test("T-INIT-001..004: explicit initialHp is optional, bounded, immutable, and preserves maxHp", () => {
  const omitted = validateResolvedBattleDefinition(definition());
  assert.equal(createInitialState(omitted).actors.get("a").hp, 5);
  const explicitActors = definition().actors.map((actor, index) => ({ ...actor, initialHp: index === 0 ? 2 : actor.maxHp }));
  const explicit = validateResolvedBattleDefinition(definition({ actors: explicitActors }));
  const state = createInitialState(explicit);
  assert.deepEqual([state.actors.get("a").hp, state.actors.get("a").maxHp], [2, 5]);
  assert.deepEqual([state.actors.get("b").hp, state.actors.get("b").maxHp], [5, 5]);
  for (const initialHp of [0, -1, 6, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateResolvedBattleDefinition(definition({
      actors: definition().actors.map((actor, index) => index === 0 ? { ...actor, initialHp } : actor),
    })));
  }
});

test("T-ARENA-002/003/005: definition owns detached arena passability independent from visual/map facts", () => {
  const source = definition();
  source.map.passable[0][0] = false;
  const resolved = validateResolvedBattleDefinition(source);
  source.map.passable[0][0] = true;
  assert.equal(resolved.map.ref.arenaId, "test");
  assert.equal(resolved.map.passable[0][0], false);
  assert.throws(() => validateResolvedBattleDefinition({ ...definition(), map: { ...definition().map, passable: [[true]] } }));
  assert.throws(() => validateResolvedBattleDefinition({ ...definition(), map: { ...definition().map, ref: { mapId: 4 } } }));
});

test("Builder validation failure does not consume it, while successful build is one-shot", () => {
  const deps = { clock: new FakeBattleClock(), signal: new AbortController().signal, decision: new ScriptDecision(() => ({ path: [] })), presentation: new NullPresentation() };
  const builder = new BattleSimulationBuilder(deps);
  assert.throws(() => builder.build({ ...definition(), tickDurationMs: 100 }));
  builder.build(definition());
  assert.throws(() => builder.build(definition()));
});

test("Plan exact shape, semantics, and moving planningOrigin are validated in frozen order", () => {
  const resolved = validateResolvedBattleDefinition(definition());
  const state = createInitialState(resolved);
  const actor = state.actors.get("a");
  assert.equal(validatePlan(resolved, state, actor, point(2, 3), { path: [point(3, 4)] }).reason, "path_not_adjacent");
  assert.equal(validatePlan(resolved, state, actor, point(2, 3), { path: [], extra: true }).reason, "invalid_plan_shape");
  assert.equal(validatePlan(resolved, state, actor, point(2, 3), { path: [], skill: { skillId: "strike", targetActorId: "b", minCoefficient: 0.73 } }).reason, "invalid_min_coefficient");
  assert.equal(validatePlan(resolved, state, actor, point(3, 3), { path: [point(2, 3)] }).accepted, true);
});

test("range rotation and canonical seeded contention fixture are exact", () => {
  const skill = definition().actors[0].skills[0];
  const origin = point(3, 3);
  assert.equal(coefficientAt(skill, origin, 8, point(3, 2)), 1000);
  assert.equal(coefficientAt(skill, origin, 2, point(3, 4)), 1000);
  assert.equal(coefficientAt(skill, origin, 4, point(2, 3)), 1000);
  assert.equal(coefficientAt(skill, origin, 6, point(4, 3)), 1000);
  assert.equal(contentionWinner("seed", 10, point(2, 4), ["a", "b"]), "b");
  assert.equal(contentionWinner("seed", 10, point(2, 4), ["b", "a"]), "b");
});

test("scheduler waits for 200ms and late wake emits every catch-up Projection", async () => {
  const decision = new DeferredDecision();
  const { runtime, clock, presentation } = runtimeFor(definition(), decision);
  runtime.run();
  await flush();
  assert.equal(presentation.projections.length, 1);
  clock.advance(199);
  assert.equal(runtime.getSnapshot().currentTick, 0);
  clock.jump(601);
  assert.equal(runtime.getSnapshot().currentTick, 4);
  assert.deepEqual(presentation.projections.map((item) => item.tick), [0, 1, 2, 3, 4]);
  runtime.cancel();
});

test("wake loop recomputes elapsed time when Tick processing crosses another deadline", async () => {
  const clock = new FakeBattleClock();
  const presentation = new RecordingPresentation();
  const baseRender = presentation.render.bind(presentation);
  presentation.render = (projection) => {
    baseRender(projection);
    if (projection.tick === 1) clock.advance(200);
  };
  const live = runtimeFor(definition(), new DeferredDecision(), { clock, presentation });
  const run = live.runtime.run(); await flush();
  clock.advance(200);
  assert.equal(live.runtime.getSnapshot().currentTick, 2);
  assert.deepEqual(presentation.projections.map((projection) => projection.tick), [0, 1, 2]);
  live.runtime.cancel();
  assert.deepEqual(await run, { type: "cancelled" });
});

test("pause freezes logical time and queued Decision until resume", async () => {
  const decision = new DeferredDecision();
  const { runtime, clock } = runtimeFor(definition(), decision);
  const run = runtime.run();
  await flush();
  clock.advance(350);
  assert.equal(runtime.getSnapshot().currentTick, 1);
  runtime.pause();
  decision.complete(0, { path: [] });
  await flush();
  clock.advance(30_000);
  assert.equal(runtime.getSnapshot().currentTick, 1);
  runtime.resume();
  clock.advance(49);
  assert.equal(runtime.getSnapshot().currentTick, 1);
  clock.advance(1);
  assert.equal(runtime.getSnapshot().currentTick, 2);
  runtime.cancel();
  assert.deepEqual(await run, { type: "cancelled" });
});

test("T-CTRL-016..020: pause reason, transition notification, legacy default, and unsubscribe are exact", async () => {
  const live = runtimeFor(definition(), new DeferredDecision());
  const events = [];
  const unsubscribe = live.runtime.onPause((event) => events.push(event));
  const run = live.runtime.run(); await flush();
  live.runtime.pause();
  assert.equal(live.runtime.getSnapshot().pauseReason, "host-background");
  assert.deepEqual(events, [{ reason: "host-background" }]);
  live.runtime.pause("host-background");
  assert.equal(events.length, 1);
  live.runtime.resume();
  assert.equal(live.runtime.getSnapshot().status, "running");
  assert.equal("pauseReason" in live.runtime.getSnapshot(), false);
  unsubscribe();
  live.runtime.pause("host-background");
  assert.equal(events.length, 1);
  assert.equal(live.runtime.getSnapshot().pauseReason, "host-background");
  live.runtime.cancel();
  assert.deepEqual(await run, { type: "cancelled" });
});

test("scheduler wake and pause cannot leave a partially committed Tick", async () => {
  const clock = new FakeBattleClock();
  const presentation = new RecordingPresentation();
  let runtime;
  const baseRender = presentation.render.bind(presentation);
  presentation.render = (projection) => {
    baseRender(projection);
    if (projection.tick === 1) runtime.pause();
  };
  runtime = new BattleSimulationBuilder({
    clock,
    signal: new AbortController().signal,
    decision: new DeferredDecision(),
    presentation,
  }).build(definition());
  const run = runtime.run(); await flush();

  clock.advance(200);
  assert.equal(runtime.getSnapshot().currentTick, 1);
  assert.equal(runtime.getSnapshot().status, "paused");
  assert.deepEqual(presentation.projections.map((projection) => projection.tick), [0, 1]);
  clock.advance(1_000);
  assert.equal(runtime.getSnapshot().currentTick, 1);

  runtime.cancel();
  assert.deepEqual(await run, { type: "cancelled" });
});

test("instant simultaneous damage produces simultaneous defeat and deterministic live replay", async () => {
  const decision = new ScriptDecision((request) => ({ path: [], skill: { skillId: "strike", targetActorId: request.actorId === "a" ? "b" : "a", minCoefficient: 1 } }));
  const presentation = new RecordingPresentation();
  const clock = new FakeBattleClock();
  const runtime = new BattleSimulationBuilder({ clock, signal: new AbortController().signal, decision, presentation }).build(definition());
  const run = runtime.run();
  await flush();
  clock.advance(200);
  assert.deepEqual(await run, { type: "simultaneous_defeat" });
  const liveSnapshot = runtime.getSnapshot();
  const record = runtime.getReplay();
  assert.equal(record.replayability.type, "deterministic");
  assert.equal(record.ticks[0].skills.length, 2);

  const replayClock = new FakeBattleClock();
  const replayPresentation = new RecordingPresentation();
  const replay = new BattleReplayBuilder({ clock: replayClock, signal: new AbortController().signal, presentation: replayPresentation }).build(record);
  const replayRun = replay.run();
  await flush();
  replayClock.advance(200);
  assert.deepEqual(await replayRun, { type: "simultaneous_defeat" });
  assert.deepEqual(replay.getSnapshot(), liveSnapshot);
  assert.deepEqual(replayPresentation.projections, presentation.projections);
});

test("T-INIT-003/005: damaged initialHp reaches Snapshot, Projection, Replay, and deterministic replay", async () => {
  const actors = definition().actors.map((actor, index) => ({ ...actor, initialHp: index === 0 ? 3 : 4 }));
  const def = definition({ actors });
  const decision = new ScriptDecision(() => ({ path: [] }));
  const live = runtimeFor(def, decision);
  const run = live.runtime.run(); await flush();
  assert.deepEqual(live.runtime.getSnapshot().actors.map((actor) => [actor.hp, actor.maxHp]), [[3, 5], [4, 5]]);
  assert.deepEqual(live.presentation.projections[0].actors.map((actor) => [actor.hp, actor.maxHp]), [[3, 5], [4, 5]]);
  live.clock.advance(200); live.runtime.cancel(); await run;
  const record = live.runtime.getReplay();
  assert.deepEqual(record.initial.actors.map((actor) => actor.initialHp), [3, 4]);
  assert.equal(record.replayability.type, "audit_only");

  const terminalDecision = new ScriptDecision((request) => ({ path: [], skill: { skillId: "strike", targetActorId: request.actorId === "a" ? "b" : "a", minCoefficient: 1 } }));
  const terminal = runtimeFor(def, terminalDecision);
  const terminalRun = terminal.runtime.run(); await flush(); terminal.clock.advance(200); await terminalRun;
  const replayClock = new FakeBattleClock();
  const replay = new BattleReplayBuilder({ clock: replayClock, signal: new AbortController().signal, presentation: new RecordingPresentation() }).build(terminal.runtime.getReplay());
  assert.deepEqual(replay.getSnapshot().actors.map((actor) => [actor.hp, actor.maxHp]), [[3, 5], [4, 5]]);
  const replayRun = replay.run(); await flush(); replayClock.advance(200); await replayRun;
  assert.deepEqual(replay.getSnapshot(), terminal.runtime.getSnapshot());
});

test("multi-step path materializes one step at a time", async () => {
  const def = definition({
    actors: [
      { ...definition().actors[0], tile: point(1, 1), skills: [] },
      { ...definition().actors[1], tile: point(5, 5), skills: [] },
    ],
  });
  const decision = new ScriptDecision((request) => request.actorId === "a" && request.generation === 1
    ? { path: [point(2, 1), point(3, 1)] }
    : { path: [] });
  const { runtime, clock } = runtimeFor(def, decision);
  runtime.run(); await flush(); clock.advance(200);
  assert.deepEqual(runtime.getSnapshot().actors.find((actor) => actor.actorId === "a").action.to, point(2, 1));
  clock.advance(200);
  assert.deepEqual(runtime.getSnapshot().actors.find((actor) => actor.actorId === "a").action.to, point(2, 1));
  await flush(); clock.advance(200);
  const actor = runtime.getSnapshot().actors.find((item) => item.actorId === "a");
  assert.deepEqual(actor.tile, point(2, 1));
  assert.deepEqual(actor.action.to, point(3, 1));
  runtime.cancel();
});

test("moving prefetch exposes destination planningOrigin but committed origin in Observation", async () => {
  const def = definition({ actors: [
    { ...definition().actors[0], tile: point(1, 1), skills: [] },
    { ...definition().actors[1], tile: point(5, 5), skills: [] },
  ] });
  const decision = new DeferredDecision();
  const { runtime, clock } = runtimeFor(def, decision);
  runtime.run(); await flush();
  decision.complete(0, { path: [point(2, 1)] });
  decision.complete(1, { path: [] });
  await flush(); clock.advance(200); await flush();
  const prefetch = decision.requests.find((item) => item.request.actorId === "a" && item.request.generation === 2).request;
  assert.deepEqual(prefetch.planningOrigin, point(2, 1));
  const self = prefetch.observation.actors.find((actor) => actor.actorId === "a");
  assert.deepEqual(self.tile, point(1, 1));
  assert.deepEqual(self.action.to, point(2, 1));
  runtime.cancel();
});

test("invalid attempt receives exactly one correction with same generation and origin", async () => {
  const decision = new ScriptDecision((request) => request.actorId === "a"
    ? (request.correction ? { path: [] } : { path: [point(3, 4)] })
    : { path: [] });
  const { runtime, clock } = runtimeFor(definition(), decision);
  runtime.run(); await flush(); clock.advance(200); await flush();
  const first = decision.requests.find((request) => request.actorId === "a" && !request.correction);
  const correction = decision.requests.find((request) => request.actorId === "a" && request.correction);
  assert.equal(correction.generation, first.generation);
  assert.notEqual(correction.requestId, first.requestId);
  assert.deepEqual(correction.planningOrigin, first.planningOrigin);
  assert.equal(correction.correction.reason, "path_not_adjacent");
  clock.advance(200);
  assert.equal(runtime.getReplay().decisions.filter((item) => item.actorId === "a").length, 2);
  runtime.cancel();
});

test("seeded contention has one winner and one contested loser", async () => {
  const base = definition();
  const def = definition({ actors: [
    { ...base.actors[0], tile: point(1, 2), direction: 6, skills: [] },
    { ...base.actors[1], tile: point(3, 2), direction: 4, skills: [] },
  ] });
  const decision = new ScriptDecision(() => ({ path: [point(2, 2)] }));
  const { runtime, clock } = runtimeFor(def, decision);
  runtime.run(); await flush(); clock.advance(200);
  const tick = runtime.getReplay().ticks[0];
  assert.equal(tick.movements.filter((item) => item.type === "contention").length, 1);
  assert.equal(tick.movements.filter((item) => item.type === "move_started").length, 1);
  assert.equal(tick.movements.filter((item) => item.type === "move_failed" && item.reason === "contested").length, 1);
  runtime.cancel();
});

test("direct reciprocal movement is swap_forbidden before occupied", async () => {
  const base = definition();
  const def = definition({ actors: [
    { ...base.actors[0], tile: point(1, 2), direction: 6, skills: [] },
    { ...base.actors[1], tile: point(2, 2), direction: 4, skills: [] },
  ] });
  const decision = new ScriptDecision((request) => ({ path: [request.actorId === "a" ? point(2, 2) : point(1, 2)] }));
  const { runtime, clock } = runtimeFor(def, decision);
  runtime.run(); await flush(); clock.advance(200);
  const failures = runtime.getReplay().ticks[0].movements.filter((item) => item.type === "move_failed");
  assert.deepEqual(failures.map((item) => item.reason), ["swap_forbidden", "swap_forbidden"]);
  runtime.cancel();
});

test("damaging hit interrupts movement at committed origin and protectionTicks=0 ends next Tick", async () => {
  const base = definition();
  const def = definition({ moveTicks: 3, actors: [
    { ...base.actors[0], tile: point(1, 1), direction: 2, skills: [] },
    { ...base.actors[1], tile: point(2, 1), direction: 4, skills: [{ ...base.actors[1].skills[0], windupTicks: 1 }] },
  ] });
  const decision = new ScriptDecision((request) => request.actorId === "a" && request.generation === 1
    ? { path: [point(1, 2)] }
    : request.actorId === "b" && request.generation === 1
      ? { path: [], skill: { skillId: "strike", targetActorId: "a", minCoefficient: 1 } }
      : { path: [] });
  const { runtime, clock } = runtimeFor(def, decision);
  runtime.run(); await flush(); clock.advance(200); await flush(); clock.advance(200);
  const actor = runtime.getSnapshot().actors.find((item) => item.actorId === "a");
  assert.deepEqual(actor.tile, point(1, 1));
  assert.equal(actor.action.type, "dead");
  assert.equal(runtime.getSnapshot().reservations.length, 0);
  assert.equal(runtime.getReplay().ticks[1].movements.some((item) => item.type === "move_interrupted"), true);
});

test("zero-damage hit does not interrupt movement or create protection", async () => {
  const base = definition();
  const def = definition({ moveTicks: 3, actors: [
    { ...base.actors[0], tile: point(1, 1), direction: 2, maxHp: 5, skills: [] },
    { ...base.actors[1], tile: point(2, 1), direction: 4, skills: [{ ...base.actors[1].skills[0], baseDamage: 0, windupTicks: 1 }] },
  ] });
  const decision = new ScriptDecision((request) => request.actorId === "a" && request.generation === 1
    ? { path: [point(1, 2)] }
    : request.actorId === "b" && request.generation === 1
      ? { path: [], skill: { skillId: "strike", targetActorId: "a", minCoefficient: 1 } }
      : { path: [] });
  const { runtime, clock } = runtimeFor(def, decision);
  runtime.run(); await flush(); clock.advance(200); await flush(); clock.advance(200);
  const actor = runtime.getSnapshot().actors.find((item) => item.actorId === "a");
  assert.equal(actor.action.type, "moving");
  assert.equal(actor.protectedUntilTickExclusive, 0);
  assert.equal(runtime.getReplay().ticks[1].damage.length, 0);
  runtime.cancel();
});

test("pre-aborted signal cancels without initialize, Decision, or clock", async () => {
  const abort = new AbortController(); abort.abort();
  const clock = new FakeBattleClock();
  const decision = new ScriptDecision(() => ({ path: [] }));
  const presentation = new RecordingPresentation();
  const runtime = new BattleSimulationBuilder({ clock, signal: abort.signal, decision, presentation }).build(definition());
  assert.deepEqual(await runtime.run(), { type: "cancelled" });
  assert.equal(presentation.scenes.length, 0);
  assert.equal(decision.requests.length, 0);
  assert.equal(clock.tasks.length, 0);
  assert.equal(runtime.getReplay().replayability.type, "audit_only");
});

test("cancel aborts request-scoped signals and late completion cannot mutate state", async () => {
  const decision = new DeferredDecision();
  const { runtime } = runtimeFor(definition(), decision);
  const run = runtime.run(); await flush();
  runtime.cancel();
  assert.equal(decision.requests.every((item) => item.signal.aborted), true);
  const before = runtime.getSnapshot();
  decision.complete(0, { path: [] }); await flush();
  assert.deepEqual(runtime.getSnapshot(), before);
  assert.deepEqual(await run, { type: "cancelled" });
  assert.throws(() => new BattleReplayBuilder({ clock: new FakeBattleClock(), signal: new AbortController().signal, presentation: new NullPresentation() }).build(runtime.getReplay()));
});

test("classified final render failure wins normal result; invariant code rejects run", async () => {
  const oneShot = () => new ScriptDecision((request) => request.actorId === "a"
    ? { path: [], skill: { skillId: "strike", targetActorId: "b", minCoefficient: 1 } }
    : { path: [] });
  const clock = new FakeBattleClock();
  const runtime = new BattleSimulationBuilder({ clock, signal: new AbortController().signal, decision: oneShot(), presentation: new FailingPresentation("PRESENTATION_COMMIT_FAILED") }).build(definition());
  const run = runtime.run(); await flush(); clock.advance(200);
  assert.deepEqual(await run, { type: "failure", source: "presentation", code: "PRESENTATION_COMMIT_FAILED" });
  assert.equal(runtime.getReplay().replayability.reason, "presentation_failure");

  const clock2 = new FakeBattleClock();
  const runtime2 = new BattleSimulationBuilder({ clock: clock2, signal: new AbortController().signal, decision: oneShot(), presentation: new FailingPresentation("PRESENTATION_INVALID_DATA") }).build(definition());
  const run2 = runtime2.run(); await flush(); clock2.advance(200);
  await assert.rejects(run2, /PRESENTATION_INVALID_DATA/);
  assert.deepEqual(runtime2.getReplay().replayability, { type: "audit_only", reason: "invariant_rejection" });
});

test("Decision correlation mismatch and rejection are invariant cleanup paths", async () => {
  const bad = new ScriptDecision((request) => ({ type: "completed", requestId: `${request.requestId}:bad`, generation: request.generation, plan: { path: [] } }));
  const { runtime } = runtimeFor(definition(), bad);
  await assert.rejects(runtime.run(), /correlation mismatch/);

  const rejecter = { decide: () => Promise.reject(new Error("adapter rejected")) };
  const second = runtimeFor(definition(), rejecter).runtime;
  await assert.rejects(second.run(), /adapter rejected/);
});

test("turn consumes the Tick action quota and turn+skill casts on a later Tick", async () => {
  const decision = new ScriptDecision((request) => request.actorId === "a" && request.generation === 1
    ? { turn: 6, path: [], skill: { skillId: "strike", targetActorId: "b", minCoefficient: 1 } }
    : { path: [] });
  const { runtime, clock } = runtimeFor(definition({ actors: [
    { ...definition().actors[0], direction: 8 }, definition().actors[1],
  ] }), decision);
  const run = runtime.run(); await flush(); clock.advance(200);
  assert.equal(runtime.getSnapshot().actors.find((actor) => actor.actorId === "a").direction, 6);
  assert.equal(runtime.getReplay().ticks[0].skills.length, 0);
  await flush(); clock.advance(200);
  assert.deepEqual(await run, { type: "ally_win" });
});

test("recovery accepts one pending Plan and promotes it on recovery_complete", async () => {
  const base = definition();
  const def = definition({ actors: [
    { ...base.actors[0], maxHp: 20, skills: [{ ...base.actors[0].skills[0], baseDamage: 1, recoveryTicks: 2 }] },
    { ...base.actors[1], maxHp: 20 },
  ] });
  const decision = new ScriptDecision((request) => {
    if (request.actorId === "a" && request.generation === 1) return { path: [], skill: { skillId: "strike", targetActorId: "b", minCoefficient: 1 } };
    if (request.actorId === "a" && request.generation === 2) return { path: [point(2, 2)] };
    return { path: [] };
  });
  const { runtime, clock } = runtimeFor(def, decision);
  runtime.run(); await flush(); clock.advance(200); await flush();
  assert.equal(runtime.getSnapshot().actors.find((actor) => actor.actorId === "a").action.type, "recovery");
  clock.advance(200);
  assert.equal(runtime.getSnapshot().actors.find((actor) => actor.actorId === "a").action.type, "recovery");
  clock.advance(200);
  const actor = runtime.getSnapshot().actors.find((item) => item.actorId === "a");
  assert.equal(actor.action.type, "moving");
  assert.deepEqual(actor.action.to, point(2, 2));
  runtime.cancel();
});

test("protection uses a half-open interval and repeated resolves are immune until it ends", async () => {
  const base = definition();
  const def = definition({ protectionTicks: 2, actors: [
    { ...base.actors[0], maxHp: 20, skills: [{ ...base.actors[0].skills[0], baseDamage: 1 }] },
    { ...base.actors[1], maxHp: 20 },
  ] });
  const decision = new ScriptDecision((request) => request.actorId === "a"
    ? { path: [], skill: { skillId: "strike", targetActorId: "b", minCoefficient: 1 } }
    : { path: [] });
  const { runtime, clock } = runtimeFor(def, decision);
  runtime.run(); await flush(); clock.advance(200); await flush();
  assert.equal(runtime.getSnapshot().actors.find((actor) => actor.actorId === "b").protectedUntilTickExclusive, 4);
  clock.advance(200); await flush();
  clock.advance(200); await flush();
  assert.deepEqual(runtime.getReplay().ticks.flatMap((tick) => tick.skills).map((skill) => skill.result), ["hit", "immune", "immune"]);
  clock.advance(200);
  assert.deepEqual(runtime.getReplay().ticks.flatMap((tick) => tick.skills).map((skill) => skill.result), ["hit", "immune", "immune", "hit"]);
  runtime.cancel();
});

test("windup resolve uses current committed positions and can miss", async () => {
  const base = definition();
  const def = definition({ moveTicks: 1, actors: [
    { ...base.actors[0], skills: [{ ...base.actors[0].skills[0], windupTicks: 2 }] },
    base.actors[1],
  ] });
  const decision = new ScriptDecision((request) => {
    if (request.actorId === "a" && request.generation === 1) return { path: [], skill: { skillId: "strike", targetActorId: "b", minCoefficient: 1 } };
    if (request.actorId === "b" && request.generation === 1) return { path: [point(3, 4)] };
    return { path: [] };
  });
  const { runtime, clock } = runtimeFor(def, decision);
  runtime.run(); await flush(); clock.advance(600);
  const skill = runtime.getReplay().ticks.flatMap((tick) => tick.skills)[0];
  assert.equal(skill.result, "miss");
  assert.equal(runtime.getSnapshot().actors.find((actor) => actor.actorId === "b").hp, 5);
  runtime.cancel();
});

test("movement passability does not create LOS and a range-two skill crosses a blocked tile", async () => {
  const base = definition();
  const passable = base.map.passable.map((row) => [...row]);
  passable[3][2] = false;
  const rangeTwo = { width: 1, height: 3, originX: 0, originY: 2, coefficientUnits: [[1000], [0], [0]] };
  const def = definition({ map: { ...base.map, passable }, actors: [
    { ...base.actors[0], tile: point(1, 3), direction: 6, skills: [{ ...base.actors[0].skills[0], range: rangeTwo }] },
    { ...base.actors[1], tile: point(3, 3) },
  ] });
  const decision = new ScriptDecision((request) => request.actorId === "a"
    ? { path: [], skill: { skillId: "strike", targetActorId: "b", minCoefficient: 1 } }
    : { path: [] });
  const { runtime, clock } = runtimeFor(def, decision);
  const run = runtime.run(); await flush(); clock.advance(200);
  assert.deepEqual(await run, { type: "ally_win" });
});

test("occupied and reserved movement failures remain distinct", async () => {
  const base = definition();
  const occupiedDef = definition({ actors: [
    { ...base.actors[0], tile: point(1, 2), skills: [] },
    { ...base.actors[1], tile: point(2, 2), skills: [] },
  ] });
  const occupiedDecision = new ScriptDecision((request) => request.actorId === "a" ? { path: [point(2, 2)] } : { path: [] });
  const occupied = runtimeFor(occupiedDef, occupiedDecision);
  occupied.runtime.run(); await flush(); occupied.clock.advance(200);
  assert.equal(occupied.runtime.getReplay().ticks[0].movements.find((item) => item.type === "move_failed").reason, "occupied");
  occupied.runtime.cancel();

  const reservedDef = definition({ moveTicks: 4, actors: [
    { ...base.actors[0], tile: point(1, 2), skills: [] },
    { ...base.actors[1], tile: point(3, 2), skills: [] },
  ] });
  const reservedDecision = new ScriptDecision((request) => {
    if (request.actorId === "a" && request.generation === 1) return { path: [point(2, 2)] };
    if (request.actorId === "b" && request.generation === 2) return { path: [point(2, 2)] };
    return { path: [] };
  });
  const reserved = runtimeFor(reservedDef, reservedDecision);
  reserved.runtime.run(); await flush(); reserved.clock.advance(200); await flush(); reserved.clock.advance(200); await flush(); reserved.clock.advance(200);
  assert.equal(reserved.runtime.getReplay().ticks[2].movements.find((item) => item.type === "move_failed").reason, "reserved");
  reserved.runtime.cancel();
});

test("attempt_failure retries next Tick while session_fatal is deterministic and replayable", async () => {
  const attemptDecision = new ScriptDecision((request) => request.actorId === "a" && request.generation === 1
    ? { type: "failed", requestId: request.requestId, generation: request.generation, error: { category: "attempt_failure", code: "TEMP" } }
    : { path: [] });
  const attempt = runtimeFor(definition(), attemptDecision);
  attempt.runtime.run(); await flush(); attempt.clock.advance(200); await flush();
  assert.equal(attemptDecision.requests.filter((request) => request.actorId === "a").length, 1);
  attempt.clock.advance(200);
  assert.equal(attemptDecision.requests.filter((request) => request.actorId === "a").length, 2);
  attempt.runtime.cancel();

  const fatalDecision = new ScriptDecision((request) => request.actorId === "a"
    ? { type: "failed", requestId: request.requestId, generation: request.generation, error: { category: "session_fatal", code: "MODEL_DOWN" } }
    : { path: [] });
  const fatal = runtimeFor(definition(), fatalDecision);
  const fatalRun = fatal.runtime.run(); await flush(); fatal.clock.advance(200);
  assert.deepEqual(await fatalRun, { type: "failure", source: "decision", code: "MODEL_DOWN" });
  assert.equal(fatal.runtime.getReplay().replayability.type, "deterministic");
  const replayClock = new FakeBattleClock();
  const replay = new BattleReplayBuilder({ clock: replayClock, signal: new AbortController().signal, presentation: new NullPresentation() }).build(fatal.runtime.getReplay());
  const replayRun = replay.run(); await flush(); replayClock.advance(200);
  assert.deepEqual(await replayRun, { type: "failure", source: "decision", code: "MODEL_DOWN" });
});

test("numeric damage overflow becomes deterministic Simulation failure and replays", async () => {
  const base = definition();
  const huge = { ...base.actors[0].skills[0], baseDamage: Number.MAX_SAFE_INTEGER, range: forwardRange(2000) };
  const def = definition({ actors: [{ ...base.actors[0], skills: [huge] }, base.actors[1]] });
  const decision = new ScriptDecision((request) => request.actorId === "a"
    ? { path: [], skill: { skillId: "strike", targetActorId: "b", minCoefficient: 2 } }
    : { path: [] });
  const live = runtimeFor(def, decision);
  const run = live.runtime.run(); await flush(); live.clock.advance(200);
  assert.deepEqual(await run, { type: "failure", source: "simulation", code: "BATTLE_NUMERIC_OVERFLOW" });
  const record = live.runtime.getReplay();
  assert.equal(record.replayability.type, "deterministic");
  const replayClock = new FakeBattleClock();
  const replay = new BattleReplayBuilder({ clock: replayClock, signal: new AbortController().signal, presentation: new NullPresentation() }).build(record);
  const replayRun = replay.run(); await flush(); replayClock.advance(200);
  assert.deepEqual(await replayRun, { type: "failure", source: "simulation", code: "BATTLE_NUMERIC_OVERFLOW" });
});

test("Snapshot and Replay public values are ordinal-sorted, detached, and deeply immutable", () => {
  const base = definition();
  const def = definition({ actors: [
    { ...base.actors[1], actorId: "__proto__", team: "enemy" },
    { ...base.actors[0], actorId: "10", team: "ally" },
  ] });
  const runtime = runtimeFor(def, new DeferredDecision()).runtime;
  const snapshot = runtime.getSnapshot();
  assert.deepEqual(snapshot.actors.map((actor) => actor.actorId), ["10", "__proto__"]);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.actors[0].tile));
  assert.throws(() => { snapshot.actors[0].tile.x = 99; });
  const replay = runtime.getReplay();
  assert.ok(Object.isFrozen(replay));
  assert.ok(Object.isFrozen(replay.initial.actors));
});

test("active close resolves cancelled; settled close preserves committed result", async () => {
  const active = runtimeFor(definition(), new DeferredDecision());
  const activeRun = active.runtime.run(); await flush(); active.runtime.close();
  assert.deepEqual(await activeRun, { type: "cancelled" });
  assert.equal(active.runtime.getSnapshot().status, "closed");
  active.runtime.close();

  const decision = new ScriptDecision((request) => request.actorId === "a"
    ? { path: [], skill: { skillId: "strike", targetActorId: "b", minCoefficient: 1 } }
    : { path: [] });
  const settled = runtimeFor(definition(), decision);
  const settledRun = settled.runtime.run(); await flush(); settled.clock.advance(200);
  assert.deepEqual(await settledRun, { type: "ally_win" });
  settled.runtime.cancel();
  assert.deepEqual(settled.runtime.getSnapshot().result, { type: "ally_win" });
  settled.runtime.close(); settled.runtime.close();
  assert.equal(settled.runtime.getSnapshot().status, "closed");
});

test("cancel during initialization fences late initialize completion", async () => {
  let release;
  const presentation = new RecordingPresentation();
  presentation.initialize = async (scene) => {
    presentation.scenes.push(scene);
    await new Promise((resolve) => { release = resolve; });
  };
  const decision = new ScriptDecision(() => ({ path: [] }));
  const setup = runtimeFor(definition(), decision, { presentation });
  const run = setup.runtime.run(); await flush();
  setup.runtime.cancel();
  release(); await flush();
  assert.deepEqual(await run, { type: "cancelled" });
  assert.equal(presentation.projections.length, 0);
  assert.equal(decision.requests.length, 0);
  assert.equal(setup.clock.tasks.length, 0);
});

test("fractional monotonic clocks are supported while NaN, Infinity, and rollback reject", async () => {
  const fractional = new FakeBattleClock();
  fractional.now = 10.5;
  const live = runtimeFor(definition(), new DeferredDecision(), { clock: fractional });
  live.runtime.run(); await flush();
  fractional.advance(199.49);
  assert.equal(live.runtime.getSnapshot().currentTick, 0);
  fractional.advance(0.51);
  assert.equal(live.runtime.getSnapshot().currentTick, 1);
  live.runtime.cancel();

  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const clock = new FakeBattleClock(); clock.now = invalid;
    const runtime = runtimeFor(definition(), new DeferredDecision(), { clock }).runtime;
    await assert.rejects(runtime.run(), /BattleClock/);
  }

  const rollbackClock = new FakeBattleClock(); rollbackClock.now = 10;
  const rollback = runtimeFor(definition(), new DeferredDecision(), { clock: rollbackClock });
  const rollbackRun = rollback.runtime.run(); await flush();
  rollbackClock.now = 9;
  rollback.runtime.pause();
  await assert.rejects(rollbackRun, /BattleClock/);
});

test("same-Tick invalidated prefetch commands are fenced before DecisionPort invocation", async () => {
  const base = definition();
  const def = definition({ actors: [
    { ...base.actors[0], maxHp: 10, skills: [{ ...base.actors[0].skills[0], baseDamage: 1 }] },
    { ...base.actors[1], maxHp: 10, skills: [{ ...base.actors[1].skills[0], baseDamage: 1 }] },
  ] });
  const decision = new ScriptDecision((request) => request.generation === 1
    ? { path: [], skill: { skillId: "strike", targetActorId: request.actorId === "a" ? "b" : "a", minCoefficient: 1 } }
    : { path: [] });
  const live = runtimeFor(def, decision);
  live.runtime.run(); await flush(); live.clock.advance(200); await flush();
  assert.equal(decision.requests.some((request) => request.generation === 2), false);
  assert.deepEqual(decision.requests.filter((request) => request.generation === 3).map((request) => request.actorId).sort(), ["a", "b"]);
  live.runtime.cancel();
});

function interruptedPrefetchSetup() {
  const base = definition();
  const def = definition({ moveTicks: 3, actors: [
    { ...base.actors[0], tile: point(1, 1), direction: 2, maxHp: 10, skills: [] },
    { ...base.actors[1], tile: point(2, 1), direction: 4, maxHp: 10, skills: [{ ...base.actors[1].skills[0], baseDamage: 1, windupTicks: 1 }] },
  ] });
  let abandoned;
  const decision = {
    requests: [],
    decide(request, signal) {
      this.requests.push({ request, signal });
      if (request.actorId === "a" && request.generation === 2) {
        return new Promise((resolve, reject) => { abandoned = { request, signal, resolve, reject }; });
      }
      const plan = request.generation === 1
        ? (request.actorId === "a"
            ? { path: [point(1, 2)] }
            : { path: [], skill: { skillId: "strike", targetActorId: "a", minCoefficient: 1 } })
        : { path: [] };
      return Promise.resolve({ type: "completed", requestId: request.requestId, generation: request.generation, plan });
    },
  };
  const live = runtimeFor(def, decision);
  return { ...live, abandoned: () => abandoned };
}

test("aborted never-settling request releases authority and late rejection is ignored", async () => {
  const live = interruptedPrefetchSetup();
  const run = live.runtime.run(); await flush(); live.clock.advance(200); await flush();
  const abandoned = live.abandoned();
  assert.equal(abandoned.signal.aborted, false);
  live.clock.advance(200);
  assert.equal(abandoned.signal.aborted, true);
  abandoned.reject(new DOMException("aborted", "AbortError"));
  await flush();
  assert.equal(live.runtime.getSnapshot().status, "running");
  live.runtime.cancel();
  assert.deepEqual(await run, { type: "cancelled" });
});

test("late completion after request abort is consumed and recorded as stale", async () => {
  const live = interruptedPrefetchSetup();
  const run = live.runtime.run(); await flush(); live.clock.advance(200); await flush();
  const abandoned = live.abandoned();
  live.clock.advance(200);
  assert.equal(abandoned.signal.aborted, true);
  abandoned.resolve({
    type: "completed",
    requestId: abandoned.request.requestId,
    generation: abandoned.request.generation,
    plan: { path: [] },
  });
  await flush(); live.clock.advance(200);
  assert.equal(live.runtime.getReplay().decisions.some((record) => record.requestId === abandoned.request.requestId
    && record.consumeOutcome.type === "stale"), true);
  live.runtime.cancel();
  assert.deepEqual(await run, { type: "cancelled" });
});

test("Presentation async failure and pause/resume classified fatal use the single result channel", async () => {
  let fail;
  const asyncPresentation = new RecordingPresentation();
  asyncPresentation.failure = new Promise((resolve) => { fail = resolve; });
  const asyncLive = runtimeFor(definition(), new DeferredDecision(), { presentation: asyncPresentation });
  const asyncRun = asyncLive.runtime.run(); await flush();
  fail({ code: "PRESENTATION_COMMIT_FAILED", message: "resize failed" });
  assert.deepEqual(await asyncRun, { type: "failure", source: "presentation", code: "PRESENTATION_COMMIT_FAILED" });

  const pausePresentation = new RecordingPresentation();
  pausePresentation.pause = () => { throw Object.assign(new Error("pause failed"), { code: "PRESENTATION_COMMIT_FAILED" }); };
  const pauseLive = runtimeFor(definition(), new DeferredDecision(), { presentation: pausePresentation });
  const pauseRun = pauseLive.runtime.run(); await flush();
  assert.doesNotThrow(() => pauseLive.runtime.pause());
  assert.deepEqual(await pauseRun, { type: "failure", source: "presentation", code: "PRESENTATION_COMMIT_FAILED" });

  const resumePresentation = new RecordingPresentation();
  resumePresentation.resume = () => { throw Object.assign(new Error("resume failed"), { code: "PRESENTATION_COMMIT_FAILED" }); };
  const resumeLive = runtimeFor(definition(), new DeferredDecision(), { presentation: resumePresentation });
  const resumeRun = resumeLive.runtime.run(); await flush();
  resumeLive.runtime.pause();
  assert.doesNotThrow(() => resumeLive.runtime.resume());
  assert.deepEqual(await resumeRun, { type: "failure", source: "presentation", code: "PRESENTATION_COMMIT_FAILED" });
});

test("counter allocation fails before exceeding the safe-integer domain", () => {
  const holder = { next: Number.MAX_SAFE_INTEGER };
  assert.throws(() => takeCounter(holder, "next"), (error) => error?.code === "BATTLE_COUNTER_OVERFLOW");
  assert.equal(holder.next, Number.MAX_SAFE_INTEGER);
});

test("Observation recentEvents is a two-Tick window and idle Battles do not auto-stalemate", async () => {
  const resolved = validateResolvedBattleDefinition(definition());
  const state = createInitialState(resolved);
  state.currentTick = 4;
  const replayTicks = [1, 2, 3, 4].map((tick) => ({
    tick,
    movements: [{ type: "move_failed", actorId: "a", tile: point(2, 3), reason: "blocked" }],
    skills: [], damage: [], protections: [],
  }));
  assert.deepEqual(buildObservation(resolved, state, "a", replayTicks).recentEvents.map((event) => event.tick), [3, 4]);

  const live = runtimeFor(definition(), new DeferredDecision());
  const run = live.runtime.run(); await flush();
  live.clock.jump(4_000);
  assert.equal(live.runtime.getSnapshot().currentTick, 20);
  assert.equal(live.runtime.getSnapshot().status, "running");
  live.runtime.cancel();
  assert.deepEqual(await run, { type: "cancelled" });
});

async function deterministicContentionRecord() {
  const base = definition();
  const def = definition({ moveTicks: 1, actors: [
    { ...base.actors[0], tile: point(1, 2), direction: 6 },
    { ...base.actors[1], tile: point(3, 2), direction: 4 },
  ] });
  const decision = new ScriptDecision((request) => request.generation === 1
    ? { path: [point(2, 2)] }
    : { path: [], skill: { skillId: "strike", targetActorId: request.actorId === "a" ? "b" : "a", minCoefficient: 1 } });
  const live = runtimeFor(def, decision);
  const run = live.runtime.run(); await flush(); live.clock.advance(200); await flush(); live.clock.advance(200);
  await run;
  return live.runtime.getReplay();
}

test("Replay rejects duplicate IDs/ticks, malformed facts, tail facts, and tampered contention", async () => {
  const record = await deterministicContentionRecord();
  assert.equal(record.ticks[0].movements.some((fact) => fact.type === "contention"), true);
  const dependencies = () => ({ clock: new FakeBattleClock(), signal: new AbortController().signal, presentation: new NullPresentation() });

  const duplicateRequest = structuredClone(record);
  duplicateRequest.decisions.push(structuredClone(duplicateRequest.decisions[0]));
  assert.throws(() => new BattleReplayBuilder(dependencies()).build(duplicateRequest), /requestId must be unique/);

  const duplicateTick = structuredClone(record);
  duplicateTick.ticks.push(structuredClone(duplicateTick.ticks.at(-1)));
  assert.throws(() => new BattleReplayBuilder(dependencies()).build(duplicateTick), /ticks must be unique/);

  const malformed = structuredClone(record);
  malformed.ticks[0].movements[0].actorId = 42;
  assert.throws(() => new BattleReplayBuilder(dependencies()).build(malformed));

  for (const invalidResult of [
    { type: "cancelled" },
    { type: "failure", source: "presentation", code: "PRESENTATION_COMMIT_FAILED" },
    { type: "failure", source: "decision", code: "UNMATCHED_SESSION_FATAL" },
    { type: "failure", source: "simulation", code: "NON_DETERMINISTIC_FAILURE" },
  ]) {
    const invalidScope = structuredClone(record);
    invalidScope.result = invalidResult;
    assert.throws(() => new BattleReplayBuilder(dependencies()).build(invalidScope), /not replayable/);
  }

  const tail = structuredClone(record);
  tail.ticks.push({ tick: tail.ticks.length + 1, movements: [], skills: [], damage: [], protections: [] });
  const tailDeps = dependencies();
  const tailReplay = new BattleReplayBuilder(tailDeps).build(tail);
  const tailRun = tailReplay.run(); await flush(); tailDeps.clock.advance(400);
  await assert.rejects(tailRun, /not fully consumed/);

  const tampered = structuredClone(record);
  const contention = tampered.ticks[0].movements.find((fact) => fact.type === "contention");
  contention.winnerActorId = contention.competitors.find((actorId) => actorId !== contention.winnerActorId);
  const tamperedDeps = dependencies();
  const tamperedReplay = new BattleReplayBuilder(tamperedDeps).build(tampered);
  const tamperedRun = tamperedReplay.run(); await flush(); tamperedDeps.clock.advance(200);
  await assert.rejects(tamperedRun, /Replay Tick fact mismatch/);
});
