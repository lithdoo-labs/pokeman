import { EVENT_STATE_LIST_KEY, isEventStateList } from "./business-state.mjs";

const DIRECTIONS = new Set([2, 4, 6, 8]);

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function ordinal(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function sortedUniqueStrings(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) throw new TypeError(`Invalid StoryIndex ${label}`);
  const sorted = [...value].sort(ordinal);
  if (new Set(sorted).size !== sorted.length || sorted.some((entry, index) => entry !== value[index])) throw new TypeError(`Non-deterministic StoryIndex ${label}`);
  return sorted;
}

function positiveMapId(value, label) {
  if (!/^[1-9]\d*$/u.test(value)) throw new TypeError(`Invalid ${label} map id`);
  const mapId = Number(value);
  if (!Number.isSafeInteger(mapId)) throw new TypeError(`Invalid ${label} map id`);
  return mapId;
}

function validPlacement(value, label) {
  if (!object(value)
      || Object.keys(value).some((key) => !["x", "y", "direction", "pattern", "instanceId", "npcId"].includes(key))
      || !Number.isSafeInteger(value.x) || value.x < 0
      || !Number.isSafeInteger(value.y) || value.y < 0
      || !DIRECTIONS.has(value.direction)
      || (value.pattern !== undefined && (!Number.isSafeInteger(value.pattern) || value.pattern < 0 || value.pattern > 3))) {
    throw new TypeError(`Invalid ${label} placement`);
  }
}

async function requiredRecord(content, namespace, key, signal) {
  const record = await content.record(namespace, key, { signal });
  if (!object(record) || !object(record.value)) throw new TypeError(`Missing ${namespace}/${key}`);
  return record.value;
}

async function validateNpcAndInteraction(content, npcId, directive, signal, label) {
  await requiredRecord(content, "struct.NPC", npcId, signal);
  if (directive.interaction !== undefined) {
    if (!exact(directive.interaction, ["dialogue"]) || typeof directive.interaction.dialogue !== "string" || directive.interaction.dialogue.length === 0) throw new TypeError(`Invalid ${label} interaction`);
    await requiredRecord(content, "struct.Dialogue", directive.interaction.dialogue, signal);
  }
}

async function validateCharacter(content, characterId, value, signal) {
  if (typeof value.name !== "string" || value.name.length === 0
      || !exact(value.battleActor, ["namespace", "key"])
      || value.battleActor.namespace !== "struct.BattleActor"
      || typeof value.battleActor.key !== "string" || value.battleActor.key.length === 0
      || (value.defaultScenes !== undefined && !object(value.defaultScenes))) throw new TypeError(`Invalid Character ${characterId}`);
  await requiredRecord(content, "struct.BattleActor", value.battleActor.key, signal);
  const defaultMaps = [];
  const defaults = [];
  for (const [rawMapId, scene] of Object.entries(value.defaultScenes ?? {})) {
    const mapId = positiveMapId(rawMapId, `Character ${characterId}`);
    await requiredRecord(content, "struct.Map", rawMapId, signal);
    if (!object(scene)) throw new TypeError(`Invalid Character ${characterId} default scene`);
    defaultMaps.push(mapId);
    for (const [npcId, directive] of Object.entries(scene)) {
      if (!object(directive) || Object.keys(directive).some((key) => !["placement", "interaction"].includes(key)) || directive.placement === undefined) throw new TypeError(`Invalid Character ${characterId} default directive ${npcId}`);
      validPlacement(directive.placement, `Character ${characterId}/${npcId}`);
      await validateNpcAndInteraction(content, npcId, directive, signal, `Character ${characterId}/${npcId}`);
      defaults.push(Object.freeze({ characterId, mapId, npcId, directive }));
    }
  }
  defaultMaps.sort((left, right) => left - right);
  return Object.freeze({ defaultMaps: Object.freeze(defaultMaps), defaults: Object.freeze(defaults) });
}

async function validateEvent(content, eventId, value, characters, signal) {
  if (!exact(value, ["states"]) || !object(value.states) || Object.keys(value.states).length === 0) throw new TypeError(`Invalid Event ${eventId}`);
  const maps = new Set();
  const mentioned = new Set();
  const states = new Map();
  for (const [stateId, state] of Object.entries(value.states)) {
    if (!exact(state, ["maps"]) || !object(state.maps)) throw new TypeError(`Invalid Event ${eventId}/${stateId}`);
    const directives = [];
    for (const [rawMapId, mapScene] of Object.entries(state.maps)) {
      const mapId = positiveMapId(rawMapId, `Event ${eventId}/${stateId}`);
      await requiredRecord(content, "struct.Map", rawMapId, signal);
      if (!exact(mapScene, ["npcs"]) || !object(mapScene.npcs)) throw new TypeError(`Invalid Event scene ${eventId}/${stateId}/${mapId}`);
      maps.add(mapId);
      for (const [npcId, directive] of Object.entries(mapScene.npcs)) {
        if (!object(directive) || Object.keys(directive).some((key) => !["character", "placement", "absent", "battleActor", "interaction"].includes(key))) throw new TypeError(`Invalid Event directive ${eventId}/${stateId}/${mapId}/${npcId}`);
        const absent = directive.absent === true;
        if (absent) {
          if (!exact(directive, ["character", "absent"]) || typeof directive.character !== "string" || directive.character.length === 0) throw new TypeError(`Invalid absent directive ${eventId}/${stateId}/${mapId}/${npcId}`);
        } else validPlacement(directive.placement, `Event ${eventId}/${stateId}/${mapId}/${npcId}`);
        if (directive.character !== undefined) {
          if (typeof directive.character !== "string" || !characters.has(directive.character) || directive.battleActor !== undefined) throw new TypeError(`Invalid Character reference ${eventId}/${stateId}/${npcId}`);
          mentioned.add(directive.character);
        } else if (!absent && directive.battleActor !== undefined) {
          if (!exact(directive.battleActor, ["namespace", "key"]) || directive.battleActor.namespace !== "struct.BattleActor" || typeof directive.battleActor.key !== "string" || directive.battleActor.key.length === 0) throw new TypeError(`Invalid BattleActor reference ${eventId}/${stateId}/${npcId}`);
          await requiredRecord(content, "struct.BattleActor", directive.battleActor.key, signal);
        }
        await validateNpcAndInteraction(content, npcId, directive, signal, `Event ${eventId}/${stateId}/${npcId}`);
        directives.push(Object.freeze({ eventId, stateId, mapId, npcId, directive }));
      }
    }
    states.set(stateId, Object.freeze(directives));
  }
  return Object.freeze({
    maps: Object.freeze([...maps].sort((left, right) => left - right)),
    characters: Object.freeze([...mentioned].sort(ordinal)),
    states,
  });
}

function assertArraySame(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) throw new TypeError(`StoryIndex drift at ${label}`);
}

export async function qualifyStoryContent(content, { signal, sourceIds } = {}) {
  const cache = new Map();
  const qualifiedReader = Object.freeze({
    record(namespace, key) {
      const identity = `${namespace}\0${key}`;
      let pending = cache.get(identity);
      if (pending === undefined) {
        pending = Promise.resolve(content.record(namespace, key, { signal }));
        cache.set(identity, pending);
      }
      return pending;
    },
  });
  const index = await requiredRecord(qualifiedReader, "struct.StoryIndex", "current", signal);
  if (!exact(index, ["byMap", "byEvent", "byCharacter"]) || !object(index.byMap) || !object(index.byEvent) || !object(index.byCharacter)) throw new TypeError("Invalid StoryIndex/current");
  const characterIds = Object.keys(index.byCharacter).sort(ordinal);
  const eventIds = Object.keys(index.byEvent).sort(ordinal);
  if (sourceIds !== undefined) {
    if (!exact(sourceIds, ["characters", "events"])) throw new TypeError("Invalid complete Story source identity set");
    assertArraySame(characterIds, sortedUniqueStrings(sourceIds.characters, "complete Character sources"), "complete Character source keys");
    assertArraySame(eventIds, sortedUniqueStrings(sourceIds.events, "complete Event sources"), "complete Event source keys");
  }
  const characters = new Map();
  for (const characterId of characterIds) characters.set(characterId, await validateCharacter(qualifiedReader, characterId, await requiredRecord(qualifiedReader, "struct.Character", characterId, signal), signal));
  const events = new Map();
  for (const eventId of eventIds) events.set(eventId, await validateEvent(qualifiedReader, eventId, await requiredRecord(qualifiedReader, "struct.Event", eventId, signal), characters, signal));

  const characterEvents = new Map(characterIds.map((id) => [id, []]));
  const expectedByMap = new Map();
  const mapEntry = (mapId) => {
    let entry = expectedByMap.get(mapId);
    if (entry === undefined) { entry = { events: new Set(), characters: new Set() }; expectedByMap.set(mapId, entry); }
    return entry;
  };
  for (const [eventId, event] of events) {
    const indexed = index.byEvent[eventId];
    if (!exact(indexed, ["maps", "characters"])) throw new TypeError(`Invalid StoryIndex byEvent/${eventId}`);
    if (!Array.isArray(indexed.maps) || indexed.maps.some((mapId) => !Number.isSafeInteger(mapId) || mapId <= 0) || indexed.maps.some((mapId, indexInArray) => indexInArray > 0 && indexed.maps[indexInArray - 1] >= mapId)) throw new TypeError(`Invalid StoryIndex byEvent/${eventId}/maps`);
    assertArraySame(indexed.maps, event.maps, `byEvent/${eventId}/maps`);
    assertArraySame(sortedUniqueStrings(indexed.characters, `byEvent/${eventId}/characters`), event.characters, `byEvent/${eventId}/characters`);
    for (const mapId of event.maps) {
      mapEntry(mapId).events.add(eventId);
      for (const characterId of event.characters) mapEntry(mapId).characters.add(characterId);
    }
    for (const characterId of event.characters) characterEvents.get(characterId).push(eventId);
  }
  for (const [characterId, character] of characters) {
    const indexed = index.byCharacter[characterId];
    if (!exact(indexed, ["events", "defaultMaps"])) throw new TypeError(`Invalid StoryIndex byCharacter/${characterId}`);
    assertArraySame(sortedUniqueStrings(indexed.events, `byCharacter/${characterId}/events`), characterEvents.get(characterId).sort(ordinal), `byCharacter/${characterId}/events`);
    if (!Array.isArray(indexed.defaultMaps) || indexed.defaultMaps.some((mapId) => !Number.isSafeInteger(mapId) || mapId <= 0) || indexed.defaultMaps.some((mapId, indexInArray) => indexInArray > 0 && indexed.defaultMaps[indexInArray - 1] >= mapId)) throw new TypeError(`Invalid StoryIndex byCharacter/${characterId}/defaultMaps`);
    assertArraySame(indexed.defaultMaps, character.defaultMaps, `byCharacter/${characterId}/defaultMaps`);
    for (const mapId of character.defaultMaps) mapEntry(mapId).characters.add(characterId);
  }
  const indexedMapIds = Object.keys(index.byMap).map((raw) => positiveMapId(raw, "StoryIndex byMap")).sort((left, right) => left - right);
  const expectedMapIds = [...expectedByMap.keys()].sort((left, right) => left - right);
  assertArraySame(indexedMapIds, expectedMapIds, "byMap keys");
  for (const mapId of expectedMapIds) {
    const indexed = index.byMap[String(mapId)];
    if (!exact(indexed, ["events", "characters"])) throw new TypeError(`Invalid StoryIndex byMap/${mapId}`);
    const expected = expectedByMap.get(mapId);
    assertArraySame(sortedUniqueStrings(indexed.events, `byMap/${mapId}/events`), [...expected.events].sort(ordinal), `byMap/${mapId}/events`);
    assertArraySame(sortedUniqueStrings(indexed.characters, `byMap/${mapId}/characters`), [...expected.characters].sort(ordinal), `byMap/${mapId}/characters`);
  }
  return Object.freeze({ index, characters, events });
}

export async function readEventStates(state, signal) {
  const snapshot = await state.read([EVENT_STATE_LIST_KEY], { signal });
  const record = snapshot?.records?.find((candidate) => candidate?.key?.namespace === EVENT_STATE_LIST_KEY.namespace && candidate?.key?.key === EVENT_STATE_LIST_KEY.key);
  if (!record || !isEventStateList(record.value)) throw new TypeError("Invalid PokeMan EventStateList");
  return record.value;
}

function runtimePlacement(npcId, directive) {
  return Object.freeze({ instanceId: npcId, npcId, x: directive.placement.x, y: directive.placement.y, direction: directive.placement.direction,
    ...(directive.placement.pattern === undefined ? {} : { pattern: directive.placement.pattern }),
    ...(directive.interaction === undefined ? {} : { interactable: true }) });
}

export async function resolveStoryScene(story, state, mapId, { signal, staticPlacements = [] } = {}) {
  if (!Number.isSafeInteger(mapId) || mapId <= 0) throw new TypeError("Invalid mapId");
  if (!Array.isArray(staticPlacements)) throw new TypeError("Invalid static placements");
  if (!object(story) || !(story.characters instanceof Map) || !(story.events instanceof Map)) throw new TypeError("Invalid qualified Story content");
  const activeStates = await readEventStates(state, signal);
  const activeDirectives = [];
  const takenOver = new Set();
  const characterIntents = new Map();
  const orderedStates = [...activeStates].sort((left, right) => ordinal(left.eventId, right.eventId) || ordinal(left.stateId, right.stateId));
  for (const { eventId, stateId } of orderedStates) {
    const event = story.events.get(eventId);
    if (event === undefined) throw new TypeError(`EventStateList references unknown Event ${eventId}`);
    const directives = event.states.get(stateId);
    if (directives === undefined) throw new TypeError(`EventStateList references unknown state ${eventId}/${stateId}`);
    for (const source of directives) {
      const characterId = source.directive.character;
      if (characterId !== undefined) {
        takenOver.add(characterId);
        const intents = characterIntents.get(characterId) ?? [];
        intents.push(source);
        characterIntents.set(characterId, intents);
      }
      if (source.mapId === mapId && source.directive.absent !== true) activeDirectives.push(source);
    }
  }
  for (const [characterId, intents] of characterIntents) {
    const absent = intents.filter((source) => source.directive.absent === true);
    const placements = intents.filter((source) => source.directive.absent !== true);
    if ((absent.length > 0 && placements.length > 0) || placements.length > 1) {
      const sources = intents.map((source) => `${source.eventId}/${source.stateId}/${source.npcId}`).join(", ");
      throw new TypeError(`Incompatible Character takeover for ${characterId}: ${sources}`);
    }
  }

  const contributions = [];
  for (const placement of staticPlacements) {
    if (!object(placement) || placement.instanceId !== placement.npcId || typeof placement.npcId !== "string" || placement.npcId.length === 0) throw new TypeError("Invalid static NPC placement");
    validPlacement(placement, `static NPC ${placement.npcId}`);
    contributions.push(Object.freeze({ source: "static", placement: Object.freeze(structuredClone(placement)) }));
  }
  for (const [characterId, character] of story.characters) {
    if (takenOver.has(characterId)) continue;
    for (const source of character.defaults) if (source.mapId === mapId) contributions.push(Object.freeze({ source: `Character/${characterId}`, placement: runtimePlacement(source.npcId, source.directive), interaction: source.directive.interaction }));
  }
  for (const source of activeDirectives) contributions.push(Object.freeze({ source: `Event/${source.eventId}/${source.stateId}`, placement: runtimePlacement(source.npcId, source.directive), interaction: source.directive.interaction }));
  contributions.sort((left, right) => ordinal(left.placement.npcId, right.placement.npcId) || ordinal(left.source, right.source));
  const npcIds = new Map(); const instanceIds = new Map(); const cells = new Map(); const interactions = new Map(); const placements = [];
  for (const contribution of contributions) {
    const placement = contribution.placement;
    const duplicateNpc = npcIds.get(placement.npcId);
    if (duplicateNpc !== undefined) throw new TypeError(`Story scene duplicate npcId ${placement.npcId}: ${duplicateNpc} and ${contribution.source}`);
    const duplicateInstance = instanceIds.get(placement.instanceId);
    if (duplicateInstance !== undefined) throw new TypeError(`Story scene duplicate instanceId ${placement.instanceId}: ${duplicateInstance} and ${contribution.source}`);
    const cell = `${placement.x},${placement.y}`;
    const occupied = cells.get(cell);
    if (occupied !== undefined) throw new TypeError(`Story scene occupied cell ${cell}: ${occupied} and ${contribution.source}`);
    npcIds.set(placement.npcId, contribution.source); instanceIds.set(placement.instanceId, contribution.source); cells.set(cell, contribution.source);
    placements.push(placement);
    if (contribution.interaction !== undefined) interactions.set(placement.instanceId, contribution.interaction.dialogue);
  }
  return Object.freeze({ placements: Object.freeze(placements), interactions });
}
