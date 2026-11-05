import type { ActorId, BattleMessage } from "./contracts.js";

/**
 * Append-only, bounded Battle Message Feed (PokeMan composition layer).
 * The Feed stores immutable history for the running battle only; it never
 * owns battle state, AI request state, or gameplay authority.
 */
export interface BattleMessageFeed {
  append(message: BattleMessage): void;
  getSnapshot(): readonly BattleMessage[];
  subscribe(listener: (messages: readonly BattleMessage[]) => void): () => void;
  clear(): void;
}

export interface BattleMessageFeedOptions {
  /** Maximum retained messages; the oldest entries are evicted first. */
  readonly capacity?: number;
}

const DEFAULT_CAPACITY = 100;

export function createBattleMessageFeed(options: BattleMessageFeedOptions = {}): BattleMessageFeed {
  const capacity = options.capacity === undefined ? DEFAULT_CAPACITY : options.capacity;
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new TypeError("Battle message feed capacity must be a safe integer >= 1");
  }
  const messages: BattleMessage[] = [];
  const listeners = new Set<(messages: readonly BattleMessage[]) => void>();
  const notify = (): void => {
    const snapshot = Object.freeze([...messages]);
    for (const listener of [...listeners]) {
      try { listener(snapshot); } catch { /* a broken subscriber must not affect others */ }
    }
  };
  return Object.freeze({
    append(message: BattleMessage): void {
      if (message === null || typeof message !== "object" || typeof message.sequence !== "number") {
        throw new TypeError("Battle message feed append requires a BattleMessage");
      }
      messages.push(message);
      if (messages.length > capacity) messages.splice(0, messages.length - capacity);
      notify();
    },
    getSnapshot(): readonly BattleMessage[] {
      return Object.freeze([...messages]);
    },
    subscribe(listener: (messages: readonly BattleMessage[]) => void): () => void {
      if (typeof listener !== "function") throw new TypeError("Battle message feed listener must be a function");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear(): void {
      messages.length = 0;
      for (const listener of [...listeners]) {
        try { listener(Object.freeze([])); } catch { /* isolated */ }
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Local string formatter: `【{actor}】description` templates. Every template
// is driven by committed Runtime/Simulation facts; only
// decision.analysis_completed embeds the (non-authoritative) visible memo.
// ---------------------------------------------------------------------------

export interface BattleDisplayNameSource {
  readonly actors?: Readonly<Record<string, string>>;
  readonly skills?: Readonly<Record<string, string>>;
  readonly system?: string;
}

const DIRECTION_NAMES: Readonly<Record<number, string>> = Object.freeze({ 2: "面向下方", 4: "面向左方", 6: "面向右方", 8: "面向上方" });

const SKILL_RESULT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  hit: "命中",
  miss: "未命中",
  immune: "被防护",
  invalid: "无效",
});

const BATTLE_RESULT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  ally_win: "我方胜利",
  enemy_win: "敌方胜利",
  simultaneous_defeat: "双方同时倒下",
  cancelled: "战斗被取消",
  failure: "战斗异常终止",
});

/** Hard safety cap for any single formatted message (AI memos included). */
export const MAX_FORMATTED_MESSAGE_CHARS = 8_000;

function sanitizeText(value: string): string {
  // Keep only printable text, spaces, and common line breaks; the UI renders
  // plain text via textContent and must never interpret markup or controls.
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0)!;
    const printable = char === "\n" || char === "\t"
      || (code >= 32 && code !== 127 && !(code >= 0x80 && code <= 0x9f) && code !== 0x2028 && code !== 0x2029);
    out += printable ? char : " ";
  }
  return out.length > MAX_FORMATTED_MESSAGE_CHARS ? `${out.slice(0, MAX_FORMATTED_MESSAGE_CHARS)}…` : out;
}

function actorLabel(message: BattleMessage & { actorId?: ActorId }, names: BattleDisplayNameSource): string {
  const id = (message as { actorId?: string }).actorId;
  const mapped = id === undefined ? undefined : names.actors?.[id];
  return mapped === undefined || typeof mapped !== "string" || mapped.length === 0 ? (id ?? "未知角色") : mapped;
}

function skillLabel(skillId: string, names: BattleDisplayNameSource): string {
  const mapped = names.skills?.[skillId];
  return typeof mapped === "string" && mapped.length > 0 ? mapped : skillId;
}

function planSummary(message: Extract<BattleMessage, { type: "decision.accepted" }>, names: BattleDisplayNameSource): string {
  const parts: string[] = [];
  if (message.plan.movement !== null) {
    const destination = message.plan.movement.destination;
    parts.push(message.plan.movement.stepCount > 1
      ? `沿路径前往 (${destination.x}, ${destination.y})`
      : `向 (${destination.x}, ${destination.y}) 移动`);
  } else if (message.plan.turn !== undefined) {
    parts.push(DIRECTION_NAMES[message.plan.turn] ?? "调整朝向");
  }
  if (message.plan.skill !== null) {
    parts.push(`对${actorLabel({ actorId: message.plan.skill.targetActorId } as never, names)}发动${skillLabel(message.plan.skill.skillId, names)}`);
  }
  if (parts.length === 0) return "保持当前行动";
  return parts.join("，");
}

/** Format one BattleMessage into the local `【{actor}】description` template. */
export function formatBattleMessage(message: BattleMessage, names: BattleDisplayNameSource = {}): string {
  switch (message.type) {
    case "decision.started":
      return `【${actorLabel(message, names)}】开始分析局势……`;
    case "decision.analysis_completed":
      return `【${actorLabel(message, names)}】思考结束：${sanitizeText(message.text)}`;
    case "decision.accepted":
      return `【${actorLabel(message, names)}】决定${planSummary(message, names)}。`;
    case "decision.failed":
      return `【${actorLabel(message, names)}】暂时无法制定行动方案。`;
    case "movement.started":
      return `【${actorLabel(message, names)}】开始移动。`;
    case "movement.completed":
      return `【${actorLabel(message, names)}】到达目标。`;
    case "movement.interrupted":
      return `【${actorLabel(message, names)}】移动被打断。`;
    case "movement.failed":
      return `【${actorLabel(message, names)}】无法移动。`;
    case "skill.started":
      return `【${actorLabel(message, names)}】发动${skillLabel(message.skillId, names)}。`;
    case "skill.resolved":
      return `【${actorLabel(message, names)}】的${skillLabel(message.skillId, names)}${SKILL_RESULT_NAMES[message.result] ?? "结束"}。`;
    case "damage.applied":
      return `【${actorLabel({ actorId: message.targetActorId } as never, names)}】受到${message.amount}点伤害。`;
    case "actor.defeated":
      return `【${actorLabel(message, names)}】被击倒。`;
    case "battle.paused":
      return `【${names.system ?? "系统"}】战斗暂停。`;
    case "battle.resumed":
      return `【${names.system ?? "系统"}】战斗继续。`;
    case "battle.ended":
      return `【${names.system ?? "系统"}】战斗结束：${BATTLE_RESULT_NAMES[message.result.type] ?? "战斗结束"}。`;
  }
}

/** A formatted panel entry as delivered to the Activity Panel RenderNode. */
export interface BattleActivityEntry {
  readonly sequence: number;
  readonly kind: BattleMessage["type"];
  readonly text: string;
}

/**
 * Project the bounded feed snapshot into display entries (oldest → newest).
 * Formatting happens subsystem-side; the browser panel only renders plain
 * text and ordering.
 */
export function formatActivityEntries(
  messages: readonly BattleMessage[],
  names: BattleDisplayNameSource = {},
): readonly BattleActivityEntry[] {
  return messages.map((message) => Object.freeze({
    sequence: message.sequence,
    kind: message.type,
    text: formatBattleMessage(message, names),
  }));
}
