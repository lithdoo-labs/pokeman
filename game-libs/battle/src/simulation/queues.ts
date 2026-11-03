import type { ActorId, DecisionCompletion } from "../contracts.js";

export type BattleEvent =
  | { type: "move_complete"; eventId: string; dueTick: number; actorId: ActorId; actionGeneration: number }
  | { type: "skill_resolve"; eventId: string; dueTick: number; actorId: ActorId; actionGeneration: number }
  | { type: "recovery_complete"; eventId: string; dueTick: number; actorId: ActorId; actionGeneration: number };

export interface DecisionInboxEntry {
  readonly actorId: ActorId;
  readonly completion: DecisionCompletion;
}

export class ScheduledEventQueue {
  readonly #events = new Map<number, BattleEvent[]>();

  schedule(event: BattleEvent): void {
    const bucket = this.#events.get(event.dueTick);
    if (bucket === undefined) this.#events.set(event.dueTick, [event]);
    else bucket.push(event);
  }

  takeDue(tick: number): BattleEvent[] {
    const events = this.#events.get(tick) ?? [];
    this.#events.delete(tick);
    return events;
  }

  clear(): void {
    this.#events.clear();
  }
}

export class DecisionInbox {
  #entries: DecisionInboxEntry[] = [];
  #accepting = true;

  enqueue(entry: DecisionInboxEntry): void {
    if (this.#accepting) this.#entries.push(entry);
  }

  snapshotAndDrain(): DecisionInboxEntry[] {
    const snapshot = this.#entries;
    this.#entries = [];
    return snapshot;
  }

  clear(): void {
    this.#accepting = false;
    this.#entries = [];
  }
}
