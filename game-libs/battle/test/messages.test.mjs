import assert from "node:assert/strict";
import { test } from "node:test";

import { createBattleMessageFeed, formatActivityEntries, formatBattleMessage, MAX_FORMATTED_MESSAGE_CHARS } from "../dist/messages.js";

function message(sequence, overrides = {}) {
  return Object.freeze({
    id: `battle:test:message:${sequence}`,
    sequence,
    tick: sequence,
    elapsedMs: sequence * 100,
    type: "battle.resumed",
    ...overrides,
  });
}

test("feed appends immutable history, evicts only the oldest beyond capacity, and never mutates prior entries", () => {
  const feed = createBattleMessageFeed({ capacity: 4 });
  const second = message(2);
  feed.append(message(1));
  feed.append(second);
  feed.append(message(3));
  feed.append(message(4));
  feed.append(message(5));
  const snapshot = feed.getSnapshot();
  assert.deepEqual(snapshot.map((item) => item.sequence), [2, 3, 4, 5]);
  assert.equal(snapshot[0], second, "retained message objects keep identity");
  const serialized = JSON.stringify(second);
  feed.append(message(6));
  assert.equal(JSON.stringify(feed.getSnapshot().find((item) => item.sequence === 3)), JSON.stringify(message(3)), "older retained entries are unchanged");
  assert.equal(JSON.stringify(second), serialized);
  assert.equal(feed.getSnapshot().length, 4);
});

test("feed exposes only append/getSnapshot/subscribe/clear and rejects malformed appends", () => {
  const feed = createBattleMessageFeed();
  assert.deepEqual(Object.keys(feed).sort(), ["append", "clear", "getSnapshot", "subscribe"]);
  assert.throws(() => feed.append(null), /BattleMessage/);
  assert.throws(() => feed.append({}), /BattleMessage/);
  assert.throws(() => createBattleMessageFeed({ capacity: 0 }), /capacity/);
  assert.throws(() => createBattleMessageFeed({ capacity: 1.5 }), /capacity/);
});

test("feed notifies subscribers with bounded snapshots and isolates a throwing subscriber", () => {
  const feed = createBattleMessageFeed({ capacity: 2 });
  const seen = [];
  let boom = 0;
  feed.subscribe((messages) => {
    if (messages.length === 1) throw new Error("subscriber failure");
    seen.push(messages.map((item) => item.sequence));
  });
  feed.subscribe((messages) => { boom += messages.length; });
  feed.append(message(1));
  feed.append(message(2));
  feed.append(message(3));
  assert.deepEqual(seen, [[1, 2], [2, 3]], "the throwing subscriber never blocks the healthy one");
  assert.equal(boom, 1 + 2 + 2);
  assert.throws(() => feed.subscribe("nope"), /function/);
});

test("feed clear empties history for close and notifies subscribers once with an empty snapshot", () => {
  const feed = createBattleMessageFeed();
  feed.append(message(1));
  const observed = [];
  feed.subscribe((messages) => observed.push(messages.length));
  feed.clear();
  assert.deepEqual(feed.getSnapshot(), []);
  assert.deepEqual(observed, [0]);
});

test("local formatter renders every template with 【actor】 labels and safe system fallbacks", () => {
  const base = { id: "m", sequence: 1, tick: 0, elapsedMs: 0 };
  const names = { actors: { a: "小红", b: "小明" }, skills: { bolt: "雷电术" } };
  const cases = [
    [{ ...base, type: "decision.started", actorId: "a", reason: "initial" }, "【小红】开始分析局势……"],
    [{ ...base, type: "decision.started", actorId: "a", reason: "damaging_hit" }, "【小红】开始分析局势……"],
    [{ ...base, type: "decision.analysis_completed", actorId: "a", text: "当前距离敌人三格，应先靠近再进攻。" }, "【小红】思考结束：当前距离敌人三格，应先靠近再进攻。"],
    [{ ...base, type: "decision.accepted", actorId: "a", plan: { movement: { destination: { x: 3, y: 4 }, stepCount: 2 }, skill: { skillId: "bolt", targetActorId: "b" } } }, "【小红】决定沿路径前往 (3, 4)，对小明发动雷电术。"],
    [{ ...base, type: "decision.accepted", actorId: "a", plan: { movement: null, turn: 6, skill: null } }, "【小红】决定面向右方。"],
    [{ ...base, type: "decision.accepted", actorId: "a", plan: { movement: null, skill: null } }, "【小红】决定保持当前行动。"],
    [{ ...base, type: "decision.failed", actorId: "a", reason: "unavailable" }, "【小红】暂时无法制定行动方案。"],
    [{ ...base, type: "movement.started", actorId: "a", movementIntentId: "plan:1", from: { x: 0, y: 0 }, destination: { x: 1, y: 0 } }, "【小红】开始移动。"],
    [{ ...base, type: "movement.completed", actorId: "a", movementIntentId: "plan:1", destination: { x: 1, y: 0 } }, "【小红】到达目标。"],
    [{ ...base, type: "movement.interrupted", actorId: "a", movementIntentId: "plan:1", destination: { x: 1, y: 0 }, reason: "damaging_hit" }, "【小红】移动被打断。"],
    [{ ...base, type: "movement.failed", actorId: "a", destination: { x: 1, y: 0 }, reason: "occupied" }, "【小红】无法移动。"],
    [{ ...base, type: "skill.started", actorId: "a", skillId: "bolt", targetActorId: "b" }, "【小红】发动雷电术。"],
    [{ ...base, type: "skill.resolved", actorId: "a", skillId: "bolt", targetActorId: "b", result: "hit" }, "【小红】的雷电术命中。"],
    [{ ...base, type: "skill.resolved", actorId: "a", skillId: "bolt", targetActorId: "b", result: "miss" }, "【小红】的雷电术未命中。"],
    [{ ...base, type: "skill.resolved", actorId: "a", skillId: "bolt", targetActorId: "b", result: "immune" }, "【小红】的雷电术被防护。"],
    [{ ...base, type: "skill.resolved", actorId: "a", skillId: "bolt", targetActorId: "b", result: "invalid" }, "【小红】的雷电术无效。"],
    [{ ...base, type: "damage.applied", targetActorId: "a", sourceActorId: "b", skillId: "bolt", amount: 15, hpAfter: 3 }, "【小红】受到15点伤害。"],
    [{ ...base, type: "actor.defeated", actorId: "a", sourceActorId: "b" }, "【小红】被击倒。"],
    [{ ...base, type: "battle.paused", reason: "host-background" }, "【系统】战斗暂停。"],
    [{ ...base, type: "battle.resumed" }, "【系统】战斗继续。"],
    [{ ...base, type: "battle.ended", result: { type: "ally_win" } }, "【系统】战斗结束：我方胜利。"],
    [{ ...base, type: "battle.ended", result: { type: "failure", source: "decision", code: "X" } }, "【系统】战斗结束：战斗异常终止。"],
  ];
  for (const [value, expected] of cases) {
    assert.equal(formatBattleMessage(value, names), expected);
  }
  // Unknown actor ids fall back to a stable readable label, never the raw id.
  assert.equal(formatBattleMessage({ ...base, type: "decision.started", actorId: "rival", reason: "plan_exhausted" }), "【未知角色】开始分析局势……");
  assert.equal(formatBattleMessage({ ...base, type: "decision.started", actorId: "rival", reason: "plan_exhausted" }, { unknownActorLabel: "不明战士" }), "【不明战士】开始分析局势……");
  assert.equal(formatBattleMessage({ ...base, type: "skill.started", actorId: "a", skillId: "grab", targetActorId: "b" }, { actors: { a: "小明" } }), "【小明】发动grab。");
});

test("formatter sanitizes control characters in AI narrative text and caps pathological length", () => {
  const base = { id: "m", sequence: 1, tick: 0, elapsedMs: 0 };
  const dirty = "思考\u0000结束\u0007：靠近\u2028再打";
  const formatted = formatBattleMessage({ ...base, type: "decision.analysis_completed", actorId: "a", text: dirty });
  assert.match(formatted, /思考 结束 ：靠近 再打/);
  const huge = formatBattleMessage({ ...base, type: "decision.analysis_completed", actorId: "a", text: "x".repeat(MAX_FORMATTED_MESSAGE_CHARS + 500) });
  assert.equal(huge.length <= `【未知角色】思考结束：`.length + MAX_FORMATTED_MESSAGE_CHARS + 1, true);
});

test("formatActivityEntries projects the bounded feed snapshot into ordered plain entries", () => {
  const base = { id: "m", elapsedMs: 0, tick: null };
  const entries = formatActivityEntries([
    { ...base, sequence: 1, type: "decision.started", actorId: "a", reason: "initial" },
    { ...base, sequence: 2, type: "damage.applied", targetActorId: "a", amount: 3, hpAfter: 2 },
  ], { actors: { a: "小红" } });
  assert.deepEqual(entries, [
    { sequence: 1, kind: "decision.started", text: "【小红】开始分析局势……" },
    { sequence: 2, kind: "damage.applied", text: "【小红】受到3点伤害。" },
  ]);
  assert.equal(Object.isFrozen(entries[0]), true);
});
