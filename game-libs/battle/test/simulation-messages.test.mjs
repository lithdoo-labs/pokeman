import assert from "node:assert/strict";
import { test } from "node:test";

import { BattleReplayBuilder, BattleSimulationBuilder } from "../dist/simulation.js";
import { RecordingPresentation } from "../dist/presentation.js";

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
}

class ScriptDecision {
  constructor(handler) { this.handler = handler; this.requests = []; }
  decide(request, signal) {
    this.requests.push(request);
    const value = this.handler(request, this.requests.length - 1);
    return Promise.resolve(value?.type ? value : {
      type: "completed",
      requestId: request.requestId,
      generation: request.generation,
      plan: value,
    });
  }
}

const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };
const point = (x, y) => ({ x, y });
const beam3 = () => ({ width: 1, height: 4, originX: 0, originY: 3, coefficientUnits: [[1000], [1000], [1000], [0]] });
const forwardRange = (units = 1000) => ({ width: 1, height: 2, originX: 0, originY: 1, coefficientUnits: [[units], [0]] });

function definition(overrides = {}) {
  const passable = Array.from({ length: 7 }, () => Array(7).fill(true));
  const base = {
    battleId: "battle:messages",
    sceneEpoch: 1,
    battleSeed: "seed",
    tickDurationMs: 200,
    moveTicks: 2,
    protectionTicks: 0,
    maxPathSteps: 6,
    map: { ref: { arenaId: "test" }, width: 7, height: 7, passable },
    actors: [
      {
        actorId: "a", team: "ally", tile: point(2, 3), direction: 6, maxHp: 10,
        character: { namespace: "resource.Graphics", key: "Characters/A" },
        skills: [{ skillId: "strike", baseDamage: 2, windupTicks: 0, recoveryTicks: 0, range: forwardRange(), effect: "strike" }],
      },
      {
        actorId: "b", team: "enemy", tile: point(4, 3), direction: 4, maxHp: 10,
        character: { namespace: "resource.Graphics", key: "Characters/B" },
        skills: [{ skillId: "bolt", baseDamage: 3, windupTicks: 2, recoveryTicks: 0, range: beam3(), effect: "bolt" }],
      },
    ],
  };
  return { ...base, ...overrides };
}

/** Collect battle messages while driving a scripted battle. */
async function runMessages(handler, { ticks = 8, def, analysisText } = {}) {
  const decision = new ScriptDecision(handler);
  const presentation = new RecordingPresentation();
  const clock = new FakeBattleClock();
  const runtime = new BattleSimulationBuilder({ clock, signal: new AbortController().signal, decision, presentation })
    .build(def ?? definition());
  const messages = [];
  runtime.onMessage((message) => messages.push(message));
  const run = runtime.run();
  await flush();
  if (analysisText !== undefined) {
    // Feed one visible Call A memo through the Runtime gate while the first
    // request is still thinking.
    runtime.reportDecisionAnalysis(decision.requests.find((request) => request.actorId === "a"), analysisText);
  }
  for (let index = 0; index < ticks; index += 1) {
    clock.advance(200);
    await flush();
  }
  runtime.cancel();
  await run;
  return { messages, runtime, decision };
}

/** Script N specific plans for an actor's first N requests; then empty paths. */
function scriptedPlans(plansByActor) {
  const seen = new Map();
  return (request) => {
    const script = plansByActor[request.actorId];
    if (script !== undefined) {
      const index = seen.get(request.actorId) ?? 0;
      seen.set(request.actorId, index + 1);
      if (index < script.length) return script[index];
    }
    return { path: [] };
  };
}

test("accepted plans produce faithful decision.accepted facts and Replay v1 stays message-free", async () => {
  const { messages, runtime } = await runMessages(scriptedPlans({ a: [{ path: [point(1, 3), point(0, 3)] }] }), { ticks: 2 });
  const accepted = messages.filter((message) => message.type === "decision.accepted");
  const aAccepted = accepted.find((message) => message.actorId === "a");
  assert.deepEqual(aAccepted.plan, { movement: { destination: { x: 0, y: 3 }, stepCount: 2 }, skill: null });
  assert.equal(aAccepted.tick, 1);
  assert.equal(accepted.some((message) => message.actorId === "b"), true);
  const replay = runtime.getReplay();
  assert.equal(JSON.stringify(replay).includes("messageFacts"), false);
  assert.equal(JSON.stringify(replay).includes("movementIntent"), false);
});

test("turn+skill with empty path is accepted; plan validation semantics are untouched", async () => {
  const def = definition({
    actors: [
      definition().actors[0],
      {
        ...definition().actors[1], tile: point(3, 3),
        skills: [{ skillId: "jab", baseDamage: 1, windupTicks: 0, recoveryTicks: 0, range: forwardRange(), effect: "jab" }],
      },
    ],
  });
  const { messages } = await runMessages(scriptedPlans({
    a: [{ path: [], turn: 8, skill: { skillId: "strike", targetActorId: "b", minCoefficient: 1 } }],
  }), { ticks: 2, def });
  const aAccepted = messages.find((message) => message.type === "decision.accepted" && message.actorId === "a");
  assert.deepEqual(aAccepted.plan, { movement: null, turn: 8, skill: { skillId: "strike", targetActorId: "b" } });
});

test("multi-segment movement publishes exactly one started and one completed intent message", async () => {
  const { messages } = await runMessages(scriptedPlans({ a: [{ path: [point(1, 3), point(0, 3)] }] }), { ticks: 7 });
  const movement = messages.filter((message) => message.type.startsWith("movement."));
  assert.deepEqual(movement.map((message) => [message.type, message.tick]), [
    ["movement.started", 1],
    ["movement.completed", 5],
  ]);
  const started = movement[0];
  assert.equal(started.movementIntentId, "plan:1");
  assert.deepEqual(started.from, { x: 2, y: 3 });
  assert.deepEqual(started.destination, { x: 0, y: 3 });
  assert.deepEqual(movement[1].movementIntentId, "plan:1");
  // Intermediate segment arrival (tick 3) publishes nothing.
  assert.equal(messages.some((message) => message.tick === 3 && message.type.startsWith("movement.")), false);
});

test("a damaging hit between two segments interrupts the open intent while the actor idles", async () => {
  // a walks a two-step path; b's bolt (windup 2) resolves on the exact tick
  // a completes its first segment and idles before the second segment starts.
  const { messages } = await runMessages(scriptedPlans({
    a: [{ path: [point(1, 3), point(0, 3)] }],
    b: [{ path: [], skill: { skillId: "bolt", targetActorId: "a", minCoefficient: 1 } }],
  }), { ticks: 6 });
  const interrupted = messages.find((message) => message.type === "movement.interrupted");
  assert.notEqual(interrupted, undefined, "idle-gap interruption must be reported");
  assert.equal(interrupted.tick, 3);
  assert.equal(interrupted.reason, "damaging_hit");
  assert.deepEqual(interrupted.destination, { x: 0, y: 3 });
  const tick3 = messages.filter((message) => message.tick === 3).map((message) => message.type);
  assert.deepEqual(tick3, ["skill.resolved", "damage.applied", "movement.interrupted"]);
  const damage = messages.find((message) => message.type === "damage.applied");
  assert.deepEqual({ source: damage.sourceActorId, target: damage.targetActorId, amount: damage.amount, hpAfter: damage.hpAfter }, {
    source: "b", target: "a", amount: 3, hpAfter: 7,
  });
  assert.equal(messages.some((message) => message.type === "movement.completed"), false);
});

test("lethal damage reports defeat exactly once, after the final damage fact", async () => {
  const def = definition({
    actors: definition().actors.map((actor) => actor.actorId === "a"
      ? { ...actor, maxHp: 5 }
      : { ...actor, skills: [{ ...actor.skills[0], baseDamage: 10 }] }),
  });
  const { messages } = await runMessages(scriptedPlans({
    b: [{ path: [], skill: { skillId: "bolt", targetActorId: "a", minCoefficient: 1 } }],
  }), { ticks: 5, def });
  const kinds = messages.filter((message) => ["skill.resolved", "damage.applied", "actor.defeated"].includes(message.type)).map((message) => message.type);
  assert.deepEqual(kinds, ["skill.resolved", "damage.applied", "actor.defeated"]);
  const defeated = messages.find((message) => message.type === "actor.defeated");
  assert.deepEqual({ actorId: defeated.actorId, sourceActorId: defeated.sourceActorId }, { actorId: "a", sourceActorId: "b" });
  assert.equal(messages.filter((message) => message.type === "actor.defeated").length, 1);
});

test("a first segment that cannot start publishes movement.failed without movement.started", async () => {
  const def = definition({
    actors: [definition().actors[0], { ...definition().actors[1], tile: point(1, 3) }],
  });
  const { messages } = await runMessages(scriptedPlans({ a: [{ path: [point(1, 3)] }] }), { ticks: 3, def });
  const failed = messages.find((message) => message.type === "movement.failed");
  assert.notEqual(failed, undefined);
  assert.equal(failed.reason, "occupied");
  assert.deepEqual(failed.destination, { x: 1, y: 3 });
  assert.equal(messages.some((message) => message.type === "movement.started"), false);
});

test("instant skills publish started before resolved within one tick", async () => {
  const def = definition({
    actors: [
      definition().actors[0],
      {
        ...definition().actors[1], tile: point(3, 3),
        skills: [{ skillId: "jab", baseDamage: 1, windupTicks: 0, recoveryTicks: 0, range: forwardRange(), effect: "jab" }],
      },
    ],
  });
  const { messages } = await runMessages(scriptedPlans({
    a: [{ path: [], skill: { skillId: "strike", targetActorId: "b", minCoefficient: 1 } }],
  }), { ticks: 3, def });
  const kinds = messages.filter((message) => message.type.startsWith("skill.") || message.type === "damage.applied").map((message) => message.type);
  assert.deepEqual(kinds, ["skill.started", "skill.resolved", "damage.applied"]);
});

test("a deterministic battle's message stream replays identically through the Replay builder", async () => {
  const def = definition({
    actors: definition().actors.map((actor) => actor.actorId === "a"
      ? { ...actor, maxHp: 5 }
      : { ...actor, skills: [{ ...actor.skills[0], baseDamage: 10 }] }),
  });
  const handler = scriptedPlans({
    b: [{ path: [], skill: { skillId: "bolt", targetActorId: "a", minCoefficient: 1 } }],
  });
  const decision = new ScriptDecision(handler);
  const presentation = new RecordingPresentation();
  const clock = new FakeBattleClock();
  const runtime = new BattleSimulationBuilder({ clock, signal: new AbortController().signal, decision, presentation }).build(def);
  const messages = [];
  runtime.onMessage((message) => messages.push(message));
  const run = runtime.run();
  await flush();
  for (let index = 0; index < 8; index += 1) {
    clock.advance(200);
    await flush();
  }
  const result = await run;
  assert.equal(result.type, "enemy_win");
  const record = runtime.getReplay();
  assert.equal(record.replayability.type, "deterministic");

  const replayMessages = [];
  const replayClock = new FakeBattleClock();
  const replayRuntime = new BattleReplayBuilder({
    clock: replayClock, signal: new AbortController().signal, presentation: new RecordingPresentation(),
  }).build(record);
  replayRuntime.onMessage((message) => replayMessages.push(message));
  const replayRun = replayRuntime.run();
  await flush();
  for (let index = 0; index < 8; index += 1) {
    replayClock.advance(200);
    await flush();
  }
  assert.deepEqual(await replayRun, result);
  assert.deepEqual(
    replayMessages.map((message) => [message.type, message.tick, message.actorId ?? null, message.sequence, message.id]),
    messages.map((message) => [message.type, message.tick, message.actorId ?? null, message.sequence, message.id]),
  );
  // Sequences are strictly increasing and ids unique in both runs.
  const sequences = messages.map((message) => message.sequence);
  assert.deepEqual(sequences, [...sequences].sort((left, right) => left - right));
  assert.equal(new Set(messages.map((message) => message.id)).size, messages.length);
});

test("the whole message stream formats with the roster's authored display names", async () => {
  const { formatBattleMessage } = await import("../dist/messages.js");
  const def = definition({
    actors: definition().actors.map((actor) => actor.actorId === "b"
      ? { ...actor, skills: [{ ...actor.skills[0], baseDamage: 10 }] }
      : actor),
  });
  const { messages } = await runMessages(scriptedPlans({
    a: [{ path: [point(1, 3), point(0, 3)] }],
    b: [{ path: [], skill: { skillId: "bolt", targetActorId: "a", minCoefficient: 1 } }],
  }), {
    ticks: 6,
    def,
    analysisText: "当前距离敌人三格，应先靠近再进攻。",
  });
  const names = { actors: { a: "小红", b: "小明" }, skills: { bolt: "雷电术", strike: "烈焰斩" } };
  const formatted = messages.map((message) => formatBattleMessage(message, names));
  const textOf = (predicate) => formatted[messages.findIndex(predicate)];
  assert.equal(textOf((message) => message.type === "decision.started" && message.actorId === "a"), "【小红】开始分析局势……");
  assert.equal(textOf((message) => message.type === "decision.started" && message.actorId === "b"), "【小明】开始分析局势……");
  assert.equal(textOf((message) => message.type === "decision.analysis_completed"), "【小红】思考结束：当前距离敌人三格，应先靠近再进攻。");
  assert.equal(textOf((message) => message.type === "decision.accepted" && message.actorId === "a"), "【小红】决定沿路径前往 (0, 3)。");
  assert.equal(textOf((message) => message.type === "movement.started"), "【小红】开始移动。");
  assert.equal(textOf((message) => message.type === "movement.interrupted"), "【小红】移动被打断。");
  assert.equal(textOf((message) => message.type === "skill.started"), "【小明】发动雷电术。");
  assert.equal(textOf((message) => message.type === "skill.resolved"), "【小明】的雷电术命中。");
  assert.equal(textOf((message) => message.type === "damage.applied"), "【小红】受到10点伤害。");
  assert.equal(textOf((message) => message.type === "actor.defeated"), "【小红】被击倒。");
  assert.equal(textOf((message) => message.type === "battle.ended"), "【系统】战斗结束：敌方胜利。");
  // No raw actorId ever leaks into the rendered stream.
  assert.equal(formatted.some((text) => text.includes("【a】") || text.includes("【b】")), false);
});
