import { validateBattleEffectContent } from "@loomrealm-game/battle";
import { validateResolvedBattleDefinition } from "@loomrealm-game/battle/simulation";
import { validateBattleArena } from "@loomrealm-game/battle/presentation";

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
const CONTENT_VERSION = /^sha256:[0-9a-f]{64}$/;
function integer(value, minimum, label) { if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${label} is invalid`); return value; }

function validateActor(value, id) {
  if (!exact(value, ["id", "name", "character", "max_hp", "skills"]) || value.id !== id
      || typeof value.name !== "string" || value.name.length === 0
      || !exact(value.character, ["namespace", "key"]) || value.character.namespace !== "resource.Graphics"
      || typeof value.character.key !== "string" || !value.character.key.startsWith("Characters/")
      || !Array.isArray(value.skills) || value.skills.some((skill) => typeof skill !== "string" || skill.length === 0)
      || new Set(value.skills).size !== value.skills.length) throw new TypeError(`Invalid BattleActor/${id}`);
  return { id, maxHp: integer(value.max_hp, 1, `${id}.max_hp`), character: structuredClone(value.character) };
}

function rangeMatrix(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((row) => !Array.isArray(row) || row.length !== value[0].length)) throw new TypeError(`${label}.range is invalid`);
  let originX = -1; let originY = -1;
  const coefficientUnits = value.map((row, y) => row.map((cell, x) => {
    if (cell === "\u2191") { if (originX !== -1) throw new TypeError(`${label}.range has multiple origins`); originX = x; originY = y; return 0; }
    if (typeof cell !== "number" || !Number.isFinite(cell) || cell < 0 || cell > 1 || !Number.isSafeInteger(cell * 1000)) throw new TypeError(`${label}.range coefficient is invalid`);
    return cell * 1000;
  }));
  if (originX === -1) throw new TypeError(`${label}.range has no origin`);
  return { width: value[0].length, height: value.length, originX, originY, coefficientUnits };
}

function validateSkill(value, id) {
  if (!exact(value, ["id", "name", "damage", "effect", "timing", "range"]) || value.id !== id
      || typeof value.name !== "string" || value.name.length === 0 || typeof value.effect !== "string" || value.effect.length === 0
      || !exact(value.timing, ["windup_ticks", "recovery_ticks"])) throw new TypeError(`Invalid BattleSkill/${id}`);
  return {
    skillId: id,
    baseDamage: integer(value.damage, 0, `${id}.damage`),
    windupTicks: integer(value.timing.windup_ticks, 0, `${id}.windup_ticks`),
    recoveryTicks: integer(value.timing.recovery_ticks, 0, `${id}.recovery_ticks`),
    range: rangeMatrix(value.range, id), effect: value.effect,
  };
}

async function record(content, namespace, key, signal) {
  const result = await content.record(namespace, key, { signal });
  if (!object(result) || !Object.hasOwn(result, "value")) throw new TypeError(`Missing ${namespace}/${key}`);
  return result.value;
}

export async function resolveLabTutorialBattle(content, contracts, { battleId = "pokeman:lab-rival-tutorial", sceneEpoch = 1, signal } = {}) {
  const arenaValue = await record(content, "struct.BattleArena", "lab-tutorial", signal);
  const arena = validateBattleArena(arenaValue, "lab-tutorial");
  const rival = validateActor(await record(content, "struct.BattleActor", "rival", signal), "rival");
  const player = validateActor(await record(content, "struct.BattleActor", "player", signal), "player");
  const definitions = new Map();
  const contractSkills = [...contracts.playerToRival.value.contract.skills, ...contracts.rivalToPlayer.value.contract.skills];
  for (const id of [...new Set(contractSkills)]) {
    const skill = validateSkill(await record(content, "struct.BattleSkill", id, signal), id);
    const effect = await record(content, "struct.BattleEffect", skill.effect, signal);
    validateBattleEffectContent(effect, skill.effect);
    const resource = await content.resource(effect.image.namespace, effect.image.key, { signal });
    if (!CONTENT_VERSION.test(resource?.contentVersion ?? "")) throw new TypeError(`Invalid BattleEffect resource ${skill.effect}`);
    definitions.set(id, skill);
  }
  const definition = {
    battleId, sceneEpoch, battleSeed: battleId, tickDurationMs: 200,
    moveTicks: 2, protectionTicks: 2, maxPathSteps: 6,
    map: { ref: { arenaId: "lab-tutorial" }, width: arena.width, height: arena.height, passable: arena.passable },
    actors: [
      {
        actorId: "rival", team: "ally", tile: { x: 1, y: 3 }, direction: 6,
        maxHp: rival.maxHp, initialHp: contracts.playerToRival.value.contract.integrity,
        character: rival.character, skills: contracts.playerToRival.value.contract.skills.map((id) => definitions.get(id)),
      },
      {
        actorId: "player", team: "enemy", tile: { x: 5, y: 3 }, direction: 4,
        maxHp: player.maxHp, initialHp: contracts.rivalToPlayer.value.contract.integrity,
        character: player.character, skills: contracts.rivalToPlayer.value.contract.skills.map((id) => definitions.get(id)),
      },
    ],
  };
  return validateResolvedBattleDefinition(definition);
}
