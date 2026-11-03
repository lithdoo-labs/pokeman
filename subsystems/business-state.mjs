export const PLAYER_WORLD_KEY = Object.freeze({ namespace: "pokeman.PlayerWorld", key: "current" });
export const EVENT_STATE_LIST_KEY = Object.freeze({ namespace: "pokeman.EventStateList", key: "current" });
export const PLAYER_TO_RIVAL_KEY = Object.freeze({ namespace: "pokeman.Relationship", key: "player:rival" });
export const RIVAL_TO_PLAYER_KEY = Object.freeze({ namespace: "pokeman.Relationship", key: "rival:player" });
export const PLAYER_CARDS_KEY = Object.freeze({ namespace: "pokeman.CarriedCards", key: "player" });
export const RIVAL_CARDS_KEY = Object.freeze({ namespace: "pokeman.CarriedCards", key: "rival" });

export const BASELINE_PLAYER_WORLD = Object.freeze({ mapId: 3, x: 3, y: 8, direction: 2 });
export const BASELINE_EVENT_STATES = Object.freeze([Object.freeze({ eventId: "prologue", stateId: "lab-tutorial" })]);

const RELATIONSHIP_DEFAULT = Object.freeze({ affinity: 0, hostile: false, relationshipText: "" });
const PLAYER_TO_RIVAL_CONTRACT = Object.freeze({ integrity: 18, skills: Object.freeze(["firebolt", "grab"]) });
const RIVAL_TO_PLAYER_CONTRACT = Object.freeze({ integrity: 20, skills: Object.freeze(["firebolt"]) });
const PLAYER_CARDS = Object.freeze([Object.freeze({ slot: 0, servantCharacterId: "rival" })]);
const RIVAL_CARDS = Object.freeze([Object.freeze({ slot: 0, servantCharacterId: "player" })]);

export class PokeManStateError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "PokeManStateError";
    this.code = code;
  }
}

function fail(code, message, cause) {
  throw new PokeManStateError(code, message, cause === undefined ? undefined : { cause });
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value, keys) {
  return object(value) && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function equalJsonValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((entry, index) => equalJsonValue(entry, right[index]));
  }
  if (!object(left) || !object(right)) return false;
  const leftKeys = Object.keys(left).sort(ordinalStringCompare);
  const rightKeys = Object.keys(right).sort(ordinalStringCompare);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && equalJsonValue(left[key], right[key]));
}

export function ordinalStringCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stateCode(error) {
  return object(error) && typeof error.code === "string" ? error.code : undefined;
}

function validDirection(value) {
  return value === 2 || value === 4 || value === 6 || value === 8;
}

export function isPlayerWorld(value) {
  return exact(value, ["mapId", "x", "y", "direction"])
    && Number.isSafeInteger(value.mapId) && value.mapId > 0
    && Number.isSafeInteger(value.x) && value.x >= 0
    && Number.isSafeInteger(value.y) && value.y >= 0
    && validDirection(value.direction);
}

export function isEventStateList(value) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  return value.every((entry) => exact(entry, ["eventId", "stateId"])
    && typeof entry.eventId === "string" && entry.eventId.length > 0
    && typeof entry.stateId === "string" && entry.stateId.length > 0
    && !ids.has(entry.eventId) && Boolean(ids.add(entry.eventId)));
}

export function isRelationship(value) {
  if (!object(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (!keys.every((key) => ["affinity", "hostile", "relationshipText", "contract"].includes(key))
      || ![3, 4].includes(keys.length)
      || !Number.isFinite(value.affinity) || !Number.isSafeInteger(value.affinity)
      || typeof value.hostile !== "boolean" || typeof value.relationshipText !== "string") return false;
  if (!Object.hasOwn(value, "contract")) return true;
  return exact(value.contract, ["integrity", "skills"])
    && Number.isSafeInteger(value.contract.integrity) && value.contract.integrity >= 0
    && Array.isArray(value.contract.skills)
    && value.contract.skills.every((skill) => typeof skill === "string" && skill.length > 0)
    && new Set(value.contract.skills).size === value.contract.skills.length;
}

export function isCarriedCards(value) {
  if (!Array.isArray(value)) return false;
  let previous = -1;
  const servants = new Set();
  return value.every((entry) => {
    const valid = exact(entry, ["slot", "servantCharacterId"])
      && Number.isSafeInteger(entry.slot) && entry.slot >= 0 && entry.slot > previous
      && typeof entry.servantCharacterId === "string" && entry.servantCharacterId.length > 0
      && !servants.has(entry.servantCharacterId);
    previous = entry?.slot;
    servants.add(entry?.servantCharacterId);
    return valid;
  });
}

async function readRecords(state, keys, signal, phase) {
  let snapshot;
  try {
    snapshot = await state.read(keys, signal === undefined ? undefined : { signal });
  } catch (cause) {
    fail("POKEMAN_STATE_READ_FAILED", `Shared State read failed during ${phase}`, cause);
  }
  if (!object(snapshot) || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0
      || !Array.isArray(snapshot.records) || snapshot.records.length !== keys.length) {
    fail("POKEMAN_STATE_READ_INVALID", `Shared State returned an invalid snapshot during ${phase}`);
  }
  const records = keys.map((key) => {
    const record = snapshot.records.find((candidate) => object(candidate.key)
      && candidate.key.namespace === key.namespace && candidate.key.key === key.key);
    if (!object(record) || !Number.isSafeInteger(record.version) || record.version < 0 || !Object.hasOwn(record, "value")) {
      fail("POKEMAN_STATE_READ_INVALID", `Shared State returned an invalid record during ${phase}`);
    }
    return { key, version: record.version, value: structuredClone(record.value), materialized: record.version > 0 || record.value !== null };
  });
  const ambiguousNamespaces = [...new Set(records.filter((record) => !record.materialized).map((record) => record.key.namespace))];
  for (const namespace of ambiguousNamespaces) {
    let index;
    try {
      index = await state.list({ namespace, ...(signal === undefined ? {} : { signal }) });
    } catch (cause) {
      fail("POKEMAN_STATE_READ_FAILED", `Shared State list failed during ${phase}`, cause);
    }
    if (!object(index) || !Number.isSafeInteger(index.revision) || index.revision < snapshot.revision || !Array.isArray(index.records)
        || index.records.some((record) => !object(record) || !object(record.key)
          || record.key.namespace !== namespace || typeof record.key.key !== "string"
          || !Number.isSafeInteger(record.version) || record.version < 0)) {
      fail("POKEMAN_STATE_READ_INVALID", `Shared State returned an inconsistent materialization index during ${phase}`);
    }
    const materialized = new Set(index.records.map((record) => record.key.key));
    for (const record of records) if (record.key.namespace === namespace && materialized.has(record.key.key)) record.materialized = true;
  }
  return records.map((record) => Object.freeze(record));
}

async function commitOrReconcile(state, records, writes, expected, phase) {
  try {
    await state.commit({
      conditions: records.map((record) => ({ key: record.key, version: record.version })),
      writes: writes.map(({ key, value }) => ({ type: "put", key, value })),
    });
    return Object.freeze({ status: "committed" });
  } catch (cause) {
    const code = stateCode(cause);
    if (code !== "CONFLICT" && code !== "OUTCOME_UNKNOWN") {
      fail("POKEMAN_STATE_COMMIT_FAILED", `Shared State commit failed during ${phase}`, cause);
    }
    const current = await readRecords(state, records.map((record) => record.key), undefined, `${phase} reconciliation`);
    if (current.every((record, index) => equalJsonValue(record.value, expected[index]))) {
      return Object.freeze({ status: "reconciled", cause: code });
    }
    fail("POKEMAN_STATE_CONFLICT", `Shared State ${code} did not reconcile during ${phase}`, cause);
  }
}

export async function ensurePokeManBaseline(state, { signal } = {}) {
  const keys = [PLAYER_WORLD_KEY, EVENT_STATE_LIST_KEY];
  const records = await readRecords(state, keys, signal, "baseline read");
  const present = records.map((record) => record.materialized);
  if (present.every(Boolean)) {
    if (!isPlayerWorld(records[0].value) || !isEventStateList(records[1].value)) fail("POKEMAN_STATE_INVALID", "Existing PokeMan baseline is malformed");
    return Object.freeze({ status: "existing", playerWorld: records[0].value, eventStates: records[1].value });
  }
  if (present.some(Boolean)) fail("POKEMAN_STATE_INVALID", "PokeMan baseline is partially materialized");
  await commitOrReconcile(state, records, [
    { key: PLAYER_WORLD_KEY, value: BASELINE_PLAYER_WORLD },
    { key: EVENT_STATE_LIST_KEY, value: BASELINE_EVENT_STATES },
  ], [BASELINE_PLAYER_WORLD, BASELINE_EVENT_STATES], "baseline materialization");
  return Object.freeze({ status: "created", playerWorld: BASELINE_PLAYER_WORLD, eventStates: BASELINE_EVENT_STATES });
}

export function validateEventStateMutation(mutation) {
  const validSide = (side) => object(side) && Reflect.ownKeys(side).every((key) => typeof key === "string" && key.length > 0
    && ((typeof side[key] === "string" && side[key].length > 0) || side[key] === null));
  if (!exact(mutation, ["from", "to"]) || !validSide(mutation.from) || !validSide(mutation.to)
      || Reflect.ownKeys(mutation.to).length === 0) {
    fail("POKEMAN_EVENT_MUTATION_INVALID", "EventStateMutation is malformed");
  }
  const fromEvents = Object.keys(mutation.from).sort(ordinalStringCompare);
  const toEvents = Object.keys(mutation.to).sort(ordinalStringCompare);
  if (fromEvents.length !== toEvents.length || fromEvents.some((eventId, index) => eventId !== toEvents[index])) {
    fail("POKEMAN_EVENT_MUTATION_INVALID", "EventStateMutation must precondition every changed Event");
  }
  return mutation;
}

export async function validateEventStateMutationContent(content, mutation, { signal } = {}) {
  validateEventStateMutation(mutation);
  if (!object(content) || typeof content.record !== "function") fail("POKEMAN_EVENT_MUTATION_CONTENT_INVALID", "EventStateMutation Content authority is unavailable");
  const eventIds = [...new Set([...Object.keys(mutation.from), ...Object.keys(mutation.to)])].sort(ordinalStringCompare);
  for (const eventId of eventIds) {
    let event;
    try { event = (await content.record("struct.Event", eventId, { signal }))?.value; }
    catch (cause) { fail("POKEMAN_EVENT_MUTATION_CONTENT_INVALID", `EventStateMutation could not resolve Event ${eventId}`, cause); }
    if (!exact(event, ["states"]) || !object(event.states) || Object.keys(event.states).length === 0) {
      fail("POKEMAN_EVENT_MUTATION_CONTENT_INVALID", `EventStateMutation references invalid Event ${eventId}`);
    }
    for (const stateId of [mutation.from[eventId], mutation.to[eventId]]) {
      if (stateId !== undefined && stateId !== null && !Object.hasOwn(event.states, stateId)) {
        fail("POKEMAN_EVENT_MUTATION_CONTENT_INVALID", `EventStateMutation references unknown state ${eventId}/${stateId}`);
      }
    }
  }
  return mutation;
}

export async function applyEventStateMutation(state, mutation, { signal, content } = {}) {
  await validateEventStateMutationContent(content, mutation, { signal });
  const [record] = await readRecords(state, [EVENT_STATE_LIST_KEY], signal, "event mutation read");
  if (!isEventStateList(record.value)) fail("POKEMAN_EVENT_STATE_INVALID", "EventStateList is malformed");
  const current = new Map(record.value.map((entry) => [entry.eventId, entry.stateId]));
  for (const [eventId, expected] of Object.entries(mutation.from)) {
    if ((current.get(eventId) ?? null) !== expected) fail("POKEMAN_EVENT_MUTATION_MISMATCH", `Event ${eventId} is not in the required state`);
  }
  for (const [eventId, next] of Object.entries(mutation.to)) {
    if (next === null) current.delete(eventId); else current.set(eventId, next);
  }
  const expected = [...current.entries()].sort(([left], [right]) => ordinalStringCompare(left, right)).map(([eventId, stateId]) => ({ eventId, stateId }));
  if (!isEventStateList(expected)) fail("POKEMAN_EVENT_MUTATION_INVALID", "EventStateMutation produced an invalid EventStateList");
  if (equalJsonValue(record.value, expected)) return Object.freeze({ status: "existing", eventStates: expected });
  const evidence = await commitOrReconcile(state, [record], [{ key: EVENT_STATE_LIST_KEY, value: expected }], [expected], "event mutation");
  return Object.freeze({ status: evidence.status, eventStates: expected });
}

function relationshipWithContract(record, contract, label) {
  if (!record.materialized) return { ...RELATIONSHIP_DEFAULT, contract: structuredClone(contract) };
  if (!isRelationship(record.value)) fail("POKEMAN_RELATIONSHIP_INVALID", `${label} Relationship is malformed`);
  if (Object.hasOwn(record.value, "contract")) {
    if (!equalJsonValue(record.value.contract, contract)) fail("POKEMAN_EXCHANGE_CONFLICT", `${label} Contract conflicts with the exchange`);
    return structuredClone(record.value);
  }
  return { affinity: record.value.affinity, hostile: record.value.hostile, relationshipText: record.value.relationshipText, contract: structuredClone(contract) };
}

function exactCards(record, expected, label) {
  if (!record.materialized || equalJsonValue(record.value, [])) return structuredClone(expected);
  if (!isCarriedCards(record.value) || !equalJsonValue(record.value, expected)) fail("POKEMAN_EXCHANGE_CONFLICT", `${label} CarriedCards conflicts with slot 0`);
  return structuredClone(record.value);
}

export async function exchangeRivalCards(state, { signal } = {}) {
  const keys = [PLAYER_TO_RIVAL_KEY, RIVAL_TO_PLAYER_KEY, PLAYER_CARDS_KEY, RIVAL_CARDS_KEY];
  const records = await readRecords(state, keys, signal, "bilateral exchange read");
  const expected = [
    relationshipWithContract(records[0], PLAYER_TO_RIVAL_CONTRACT, "player:rival"),
    relationshipWithContract(records[1], RIVAL_TO_PLAYER_CONTRACT, "rival:player"),
    exactCards(records[2], PLAYER_CARDS, "player"),
    exactCards(records[3], RIVAL_CARDS, "rival"),
  ];
  if (records.every((record, index) => equalJsonValue(record.value, expected[index]))) return Object.freeze({ status: "existing" });
  const evidence = await commitOrReconcile(state, records, keys.map((key, index) => ({ key, value: expected[index] })), expected, "bilateral exchange");
  return Object.freeze({ status: evidence.status });
}

export async function readBattleContracts(state, { signal } = {}) {
  const records = await readRecords(state, [PLAYER_TO_RIVAL_KEY, RIVAL_TO_PLAYER_KEY, PLAYER_CARDS_KEY, RIVAL_CARDS_KEY], signal, "battle contract read");
  if (!isRelationship(records[0].value) || !isRelationship(records[1].value)
      || !Object.hasOwn(records[0].value, "contract") || !Object.hasOwn(records[1].value, "contract")
      || !isCarriedCards(records[2].value) || !equalJsonValue(records[2].value, PLAYER_CARDS)
      || !isCarriedCards(records[3].value) || !equalJsonValue(records[3].value, RIVAL_CARDS)) {
    fail("POKEMAN_BATTLE_PRECONDITION_FAILED", "Bilateral Contract/Card state is not ready for Battle");
  }
  return Object.freeze({
    playerToRival: Object.freeze({ value: records[0].value, version: records[0].version }),
    rivalToPlayer: Object.freeze({ value: records[1].value, version: records[1].version }),
  });
}

export async function settleBattleContracts(state, authority, finalHp) {
  if (!object(authority) || !object(authority.playerToRival) || !object(authority.rivalToPlayer)
      || !isRelationship(authority.playerToRival.value) || !Object.hasOwn(authority.playerToRival.value, "contract")
      || !isRelationship(authority.rivalToPlayer.value) || !Object.hasOwn(authority.rivalToPlayer.value, "contract")
      || !Number.isSafeInteger(authority.playerToRival.version) || authority.playerToRival.version < 0
      || !Number.isSafeInteger(authority.rivalToPlayer.version) || authority.rivalToPlayer.version < 0) {
    fail("POKEMAN_BATTLE_SETTLEMENT_INVALID", "Battle settlement authority is invalid");
  }
  if (!exact(finalHp, ["rival", "player"]) || !Number.isSafeInteger(finalHp.rival) || finalHp.rival < 0
      || !Number.isSafeInteger(finalHp.player) || finalHp.player < 0) fail("POKEMAN_BATTLE_SETTLEMENT_INVALID", "Final Battle HP is invalid");
  const records = [
    { key: PLAYER_TO_RIVAL_KEY, version: authority.playerToRival.version },
    { key: RIVAL_TO_PLAYER_KEY, version: authority.rivalToPlayer.version },
  ];
  const expected = [
    { ...structuredClone(authority.playerToRival.value), contract: { ...structuredClone(authority.playerToRival.value.contract), integrity: Math.max(1, finalHp.rival) } },
    { ...structuredClone(authority.rivalToPlayer.value), contract: { ...structuredClone(authority.rivalToPlayer.value.contract), integrity: Math.max(1, finalHp.player) } },
  ];
  const evidence = await commitOrReconcile(state, records, records.map((record, index) => ({ key: record.key, value: expected[index] })), expected, "bilateral Battle settlement");
  return Object.freeze({ status: evidence.status, rivalIntegrity: expected[0].contract.integrity, playerIntegrity: expected[1].contract.integrity });
}
