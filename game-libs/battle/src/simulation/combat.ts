import { compareActorId, type ActorId, type Direction, type GridPosition } from "../contracts.js";
import { checkedMultiply } from "./numeric.js";
import type { ResolvedBattleDefinition, ResolvedBattleSkill } from "./state.js";

export function coefficientAt(
  skill: ResolvedBattleSkill,
  casterTile: GridPosition,
  direction: Direction,
  targetTile: GridPosition,
): number {
  for (let y = 0; y < skill.range.height; y += 1) {
    for (let x = 0; x < skill.range.width; x += 1) {
      const value = skill.range.coefficientUnits[y]![x]!;
      if (value <= 0) continue;
      const dx = x - skill.range.originX;
      const dy = y - skill.range.originY;
      const rotated = direction === 8 ? { dx, dy }
        : direction === 2 ? { dx: -dx, dy: -dy }
          : direction === 4 ? { dx: dy, dy: -dx }
            : { dx: -dy, dy: dx };
      if (casterTile.x + rotated.dx === targetTile.x && casterTile.y + rotated.dy === targetTile.y) return value;
    }
  }
  return 0;
}

export function finalDamage(baseDamage: number, coefficientUnits: number): number {
  return Math.floor(checkedMultiply(baseDamage, coefficientUnits) / 1000);
}

export function directionForMove(from: GridPosition, to: GridPosition): Direction {
  if (to.x === from.x && to.y === from.y + 1) return 2;
  if (to.x === from.x - 1 && to.y === from.y) return 4;
  if (to.x === from.x + 1 && to.y === from.y) return 6;
  if (to.x === from.x && to.y === from.y - 1) return 8;
  throw new Error("Move is not cardinal");
}

export function contentionWinner(
  battleSeed: string | number,
  tick: number,
  target: GridPosition,
  competitors: readonly ActorId[],
): ActorId {
  const sorted = [...competitors].sort(compareActorId);
  if (sorted.length === 1) return sorted[0]!;
  if (sorted.length !== 2) throw new Error("Battle v0 contention requires one or two competitors");
  const seedTag = typeof battleSeed === "number" ? `n:${battleSeed}` : `s:${battleSeed}`;
  const key = JSON.stringify([seedTag, tick, target.x, target.y, ...sorted]);
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(key)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return sorted[hash & 1]!;
}

export function findSkill(definition: ResolvedBattleDefinition, actorId: ActorId, skillId: string): ResolvedBattleSkill {
  const skill = definition.actors.find((actor) => actor.actorId === actorId)?.skills.find((item) => item.skillId === skillId);
  if (skill === undefined) throw new Error(`Unknown authoritative skill ${skillId}`);
  return skill;
}
