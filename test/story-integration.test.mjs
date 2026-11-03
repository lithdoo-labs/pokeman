import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EVENT_STATE_LIST_KEY } from "../subsystems/business-state.mjs";
import { qualifyStoryContent, resolveStoryScene as resolveQualifiedStoryScene } from "../subsystems/story.mjs";

const fsdb = new URL("../[FSDB]PokeMan/", import.meta.url);
const recordPath = (namespace, key) => new URL(`[struct]${namespace.slice("struct.".length)}/${key}.json`, fsdb);

async function realValue(namespace, key) {
  try { return JSON.parse(await readFile(recordPath(namespace, key), "utf8")); }
  catch (cause) { if (cause?.code === "ENOENT") return undefined; throw cause; }
}

function contentWith(overrides = new Map()) {
  return {
    async record(namespace, key) {
      const identity = `${namespace}/${key}`;
      const value = overrides.has(identity) ? overrides.get(identity) : await realValue(namespace, key);
      return value === undefined ? null : { value: structuredClone(value) };
    },
  };
}

function stateFor(eventStates) {
  return { async read() { return { records: [{ key: EVENT_STATE_LIST_KEY, version: 1, value: structuredClone(eventStates) }] }; } };
}

const validateStoryContent = qualifyStoryContent;
async function resolveStoryScene(content, state, mapId, options) {
  return resolveQualifiedStoryScene(await qualifyStoryContent(content), state, mapId, options);
}

test("default Character scene appears and active Event takeover suppresses it globally", async () => {
  const content = contentWith();
  const defaults = await resolveStoryScene(content, stateFor([]), 8);
  assert.deepEqual(defaults.placements, [{ instanceId: "rival-casual", npcId: "rival-casual", x: 8, y: 6, direction: 2, interactable: true }]);
  assert.equal(defaults.interactions.get("rival-casual"), "lab-rival-intro");

  const takenOver = await resolveStoryScene(content, stateFor([{ eventId: "prologue", stateId: "lab-tutorial" }]), 8);
  assert.deepEqual(takenOver.placements, []);
});

test("ending prologue returns Rival to its default scene and leaves no Map 4 story fallback", async () => {
  const content = contentWith();
  const map4 = await resolveStoryScene(content, stateFor([]), 4);
  assert.deepEqual(map4.placements, []);
  assert.equal(map4.interactions.size, 0);
  const map8 = await resolveStoryScene(content, stateFor([]), 8);
  assert.equal(map8.placements[0].npcId, "rival-casual");
  assert.equal(map8.placements.some(({ npcId }) => npcId === "rival-lab"), false);
});

test("every prologue Map 4 state is wholly Story-owned and emits instanceId equal to npcId", async () => {
  const expectedInteraction = new Map([
    ["lab-tutorial", "professor"],
    ["rival-ready", "rival-lab"],
    ["after-battle", "professor"],
  ]);
  for (const [stateId, interactable] of expectedInteraction) {
    const scene = await resolveStoryScene(contentWith(), stateFor([{ eventId: "prologue", stateId }]), 4);
    assert.deepEqual(scene.placements.map(({ npcId }) => npcId), ["professor", "rival-lab"]);
    assert.equal(scene.placements.every(({ instanceId, npcId }) => instanceId === npcId), true);
    assert.deepEqual([...scene.interactions.keys()], [interactable]);
  }
});

test("an invalid active Event state is an explicit failure", async () => {
  await assert.rejects(
    resolveStoryScene(contentWith(), stateFor([{ eventId: "prologue", stateId: "missing" }]), 4),
    /unknown state prologue\/missing/u,
  );
});

test("StoryIndex drift and broken Character/Event references fail qualification", async () => {
  const index = await realValue("struct.StoryIndex", "current");
  const drift = structuredClone(index);
  drift.byCharacter.rival.defaultMaps = [1];
  await assert.rejects(validateStoryContent(contentWith(new Map([["struct.StoryIndex/current", drift]]))), /StoryIndex drift/u);

  const missingCharacter = structuredClone(index);
  missingCharacter.byCharacter.ghost = { events: [], defaultMaps: [] };
  await assert.rejects(validateStoryContent(contentWith(new Map([["struct.StoryIndex/current", missingCharacter]]))), /Missing struct.Character\/ghost/u);

  const prologue = await realValue("struct.Event", "prologue");
  prologue.states["lab-tutorial"].maps["4"].npcs.professor.character = "ghost";
  await assert.rejects(validateStoryContent(contentWith(new Map([["struct.Event/prologue", prologue]]))), /Invalid Character reference/u);

  await assert.rejects(validateStoryContent(contentWith(), { sourceIds: {
    characters: ["center-servant", "ghost", "player", "professor", "rival", "route-trainee"],
    events: ["first-route", "prologue"],
  } }), /complete Character source keys/u);
});

test("Story qualification reads each immutable Content identity at most once", async () => {
  const reads = new Map();
  const content = contentWith();
  await qualifyStoryContent({ async record(namespace, key, options) {
    const identity = `${namespace}/${key}`;
    reads.set(identity, (reads.get(identity) ?? 0) + 1);
    return content.record(namespace, key, options);
  } });
  assert.equal(Math.max(...reads.values()), 1);
});

test("two active Events producing the same Map npcId fail deterministically instead of last-wins", async () => {
  const index = await realValue("struct.StoryIndex", "current");
  index.byEvent.collision = { maps: [4], characters: [] };
  index.byMap["4"].events = ["collision", "prologue"];
  const collision = { states: { active: { maps: { "4": { npcs: { professor: { placement: { x: 1, y: 1, direction: 2 } } } } } } } };
  const content = contentWith(new Map([["struct.StoryIndex/current", index], ["struct.Event/collision", collision]]));
  await assert.rejects(
    resolveStoryScene(content, stateFor([{ eventId: "prologue", stateId: "lab-tutorial" }, { eventId: "collision", stateId: "active" }]), 4),
    /duplicate npcId professor/u,
  );
});

test("occupied cells and incompatible Character takeover are deterministic failures", async () => {
  const index = await realValue("struct.StoryIndex", "current");
  index.byEvent.collision = { maps: [4], characters: [] };
  index.byMap["4"].events = ["collision", "prologue"];
  const occupied = { states: { active: { maps: { "4": { npcs: { "town-resident": { placement: { x: 10, y: 6, direction: 2 } } } } } } } };
  await assert.rejects(resolveStoryScene(
    contentWith(new Map([["struct.StoryIndex/current", index], ["struct.Event/collision", occupied]])),
    stateFor([{ eventId: "prologue", stateId: "lab-tutorial" }, { eventId: "collision", stateId: "active" }]), 4,
  ), /occupied cell 10,6/u);

  index.byEvent.collision.characters = ["rival"];
  index.byMap["4"].characters = ["professor", "rival"];
  index.byCharacter.rival.events = ["collision", "prologue"];
  const takeover = { states: { active: { maps: { "4": { npcs: { "rival-casual": { character: "rival", placement: { x: 1, y: 1, direction: 2 } } } } } } } };
  await assert.rejects(resolveStoryScene(
    contentWith(new Map([["struct.StoryIndex/current", index], ["struct.Event/collision", takeover]])),
    stateFor([{ eventId: "prologue", stateId: "lab-tutorial" }, { eventId: "collision", stateId: "active" }]), 4,
  ), /Incompatible Character takeover for rival/u);

  const absence = { states: { active: { maps: { "4": { npcs: { "rival-casual": { character: "rival", absent: true } } } } } } };
  await assert.rejects(resolveStoryScene(
    contentWith(new Map([["struct.StoryIndex/current", index], ["struct.Event/collision", absence]])),
    stateFor([{ eventId: "prologue", stateId: "lab-tutorial" }, { eventId: "collision", stateId: "active" }]), 4,
  ), /Incompatible Character takeover for rival/u);
});
