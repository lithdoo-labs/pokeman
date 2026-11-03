import { defineSubsystem, failed } from "@loomrealm/subsystem";
import { RPGMapBuilder } from "@loomrealm-game/map";
import { createControlsConsumer, createDirectionalControlsTracker } from "@loomrealm-game/common-controls/subsystem";
import { exchangeRivalCards } from "./business-state.mjs";
import { qualifyStoryContent, resolveStoryScene } from "./story.mjs";

function toMapDirection(direction) {
  switch (direction) {
    case "up": return 8;
    case "down": return 2;
    case "left": return 4;
    case "right": return 6;
    case null: return null;
    default: throw new TypeError("Invalid controls direction");
  }
}

export const MAP_ONLY_NPC_PLACEMENTS = Object.freeze({
  2: Object.freeze([Object.freeze({ instanceId: "town-resident", npcId: "town-resident", x: 12, y: 10, direction: 2 })]),
  3: Object.freeze([Object.freeze({ instanceId: "home-family", npcId: "home-family", x: 6, y: 8, direction: 4 })]),
  5: Object.freeze([
    Object.freeze({ instanceId: "road-bandit", npcId: "road-bandit", x: 20, y: 12, direction: 4 }),
    Object.freeze({ instanceId: "route-trainee", npcId: "route-trainee", x: 24, y: 15, direction: 4 }),
  ]),
  7: Object.freeze([
    Object.freeze({ instanceId: "town-resident", npcId: "town-resident", x: 20, y: 20, direction: 2 }),
    Object.freeze({ instanceId: "center-servant", npcId: "center-servant", x: 22, y: 20, direction: 4 }),
  ]),
});

const EMPTY_PLACEMENTS = Object.freeze([]);
export function placementsForMap(mapId, placements = MAP_ONLY_NPC_PLACEMENTS) {
  return placements[String(mapId)] ?? EMPTY_PLACEMENTS;
}

const RESULT_DIALOGUE = Object.freeze({
  ally_win: "lab-rival-after-ally-win",
  enemy_win: "lab-rival-after-enemy-win",
  simultaneous_defeat: "lab-rival-after-draw",
});

function validBattleOutcome(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 3 && typeof value.battleId === "string" && value.battleId.length > 0
    && Object.hasOwn(RESULT_DIALOGUE, value.result) && value.settlement === "committed";
}

export function createPokeManMapSubsystem(scope, dependencies = {}) {
  const MapBuilder = dependencies.RPGMapBuilder ?? RPGMapBuilder;
  const createConsumer = dependencies.createControlsConsumer ?? createControlsConsumer;
  const createDirections = dependencies.createDirectionalControlsTracker ?? createDirectionalControlsTracker;
  const resolveScene = dependencies.resolveStoryScene ?? resolveStoryScene;
  const qualifyStory = dependencies.qualifyStoryContent ?? (dependencies.resolveStoryScene === undefined ? qualifyStoryContent : async (content) => content);
  const exchange = dependencies.exchangeRivalCards ?? exchangeRivalCards;
  return {
    async frame(frame) {
      const input = frame.params;
      const story = await qualifyStory(scope.content, { signal: frame.signal });
      const handler = new MapBuilder(scope, frame).build({ player: { characterName: input.characterName } });
      let currentMapId = input.mapId;
      let currentScene = { placements: EMPTY_PLACEMENTS, interactions: new Map() };
      const loadScene = async (mapId, signal = frame.signal) => {
        const scene = await resolveScene(story, scope.state, mapId, { signal, staticPlacements: placementsForMap(mapId) });
        if (mapId === currentMapId) currentScene = scene;
        return scene;
      };
      handler.onMapEntering(async (context) => {
        currentMapId = context.mapId;
        const scene = await loadScene(context.mapId, context.signal);
        context.setNPC(scene.placements);
      });
      handler.onMapEntered((event) => { currentMapId = event.mapId; });

      let interactionWaiter;
      handler.onNPCInteract((event) => {
        const dialogueKey = currentScene.interactions.get(event.npc.instanceId);
        if (dialogueKey !== undefined) interactionWaiter?.accept({ event, dialogueKey });
      });
      let activation;
      const startControls = () => {
        const directions = createDirections();
        const apply = () => handler.controls.setMoveIntent(toMapDirection(directions.direction));
        const consumer = createConsumer(scope.presentationEvents, frame, {
          onState(state) { directions.acceptState(state); apply(); },
          onEvent(event) {
            directions.acceptEvent(event); apply();
            if (event.action === "down" && !event.repeat && (event.button === "south" || event.button === "start")) handler.controls.confirm();
          },
        });
        activation = { directions, consumer };
      };
      const stopControls = () => {
        if (activation === undefined) return;
        handler.controls.setMoveIntent(null);
        activation.directions.reset();
        activation.consumer.close();
        activation = undefined;
      };
      const arm = () => {
        let active = true;
        let resolve;
        const promise = new Promise((accept) => { resolve = accept; });
        const waiter = {
          promise,
          accept(value) { if (active) { active = false; interactionWaiter = undefined; resolve(value); } },
          disarm() { active = false; if (interactionWaiter === waiter) interactionWaiter = undefined; },
        };
        interactionWaiter = waiter;
        return waiter;
      };
      const callChild = async (key, params) => {
        try { return await frame.call(key, params); }
        catch { return failed({ code: `POKEMAN_${key.toUpperCase()}_CALL_FAILED` }); }
      };
      const dialogueInput = (dialogueKey, event) => ({
        dialogueKey,
        source: { mapId: event.mapId, npc: { instanceId: event.npc.instanceId, npcId: event.npc.npcId } },
      });
      const refresh = async () => {
        currentScene = await loadScene(currentMapId);
        await handler.setNPC(currentScene.placements);
      };

      const mapRun = handler.run({ mapId: input.mapId, x: input.x, y: input.y, direction: input.direction });
      let mapTerminal;
      const terminal = mapRun.then((outcome) => { mapTerminal = outcome; return { kind: "map", outcome }; });
      try {
        while (true) {
          const waiter = arm();
          startControls();
          const next = await Promise.race([terminal, waiter.promise.then((interaction) => ({ kind: "interaction", interaction }))]);
          waiter.disarm();
          stopControls();
          if (next.kind === "map") return next.outcome;
          if (mapTerminal !== undefined) return mapTerminal;
          const { event, dialogueKey } = next.interaction;
          const dialogue = await callChild("dialogue", dialogueInput(dialogueKey, event));
          if (dialogue.type !== "completed") return dialogue;
          if (typeof dialogue.value !== "string" || dialogue.value.length === 0) return failed({ code: "POKEMAN_DIALOGUE_RESULT_INVALID" });

          if (dialogue.value === "lab-rival-exchange-accept") {
            try { await exchange(scope.state, { signal: frame.signal }); }
            catch { return failed({ code: "POKEMAN_EXCHANGE_FAILED" }); }
            const battle = await callChild("battle", { scenarioId: "lab-rival-tutorial", source: { mapId: 4, rival: { instanceId: "rival-lab", npcId: "rival-lab" } } });
            if (battle.type !== "completed") return battle;
            if (!validBattleOutcome(battle.value)) return failed({ code: "POKEMAN_BATTLE_RESULT_INVALID" });
            const resultDialogue = await callChild("dialogue", dialogueInput(RESULT_DIALOGUE[battle.value.result], event));
            if (resultDialogue.type !== "completed") return resultDialogue;
            if (resultDialogue.value !== RESULT_DIALOGUE[battle.value.result]) return failed({ code: "POKEMAN_DIALOGUE_RESULT_INVALID" });
          }
          try { await refresh(); }
          catch { return failed({ code: "POKEMAN_STORY_REFRESH_FAILED" }); }
        }
      } finally {
        interactionWaiter?.disarm();
        stopControls();
      }
    },
  };
}

export default defineSubsystem((scope) => createPokeManMapSubsystem(scope));
