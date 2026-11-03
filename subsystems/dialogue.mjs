import { cancelled, completed, defineSubsystem, failed } from "@loomrealm/subsystem";
import { RPGDialogue } from "@loomrealm-game/rpg-dialogue";
import { createControlsConsumer } from "@loomrealm-game/common-controls/subsystem";
import { applyEventStateMutation } from "./business-state.mjs";

function exactObject(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validGraphInput(input) {
  return exactObject(input, ["dialogueKey", "source"])
    && typeof input.dialogueKey === "string" && input.dialogueKey.length > 0
    && exactObject(input.source, ["mapId", "npc"]) && Number.isSafeInteger(input.source.mapId) && input.source.mapId > 0
    && exactObject(input.source.npc, ["instanceId", "npcId"])
    && typeof input.source.npc.instanceId === "string" && input.source.npc.instanceId.length > 0
    && typeof input.source.npc.npcId === "string" && input.source.npc.npcId.length > 0;
}

export function validateDialogueContent(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some((key) => !["lines", "choices", "mutation", "speakerName"].includes(key))
      || (value.speakerName !== undefined && (typeof value.speakerName !== "string" || value.speakerName.length === 0))
      || !Array.isArray(value.lines) || value.lines.length === 0
      || value.lines.some((line) => line === null || typeof line !== "object" || Array.isArray(line)
        || Object.keys(line).some((key) => !["speaker", "text"].includes(key))
        || typeof line.text !== "string" || line.text.length === 0
        || (line.speaker !== undefined && (typeof line.speaker !== "string" || line.speaker.length === 0)))
      || (value.mutation !== undefined && (typeof value.mutation !== "string" || value.mutation.length === 0))) throw new TypeError("Invalid Dialogue content");
  const choices = value.choices ?? [];
  if (!Array.isArray(choices) || choices.some((choice) => !exactObject(choice, ["text", "target"])
      || typeof choice.text !== "string" || choice.text.length === 0 || typeof choice.target !== "string" || choice.target.length === 0)) throw new TypeError("Invalid Dialogue choices");
  if (value.choices !== undefined && choices.length === 0) throw new TypeError("Dialogue choices must not be empty");
  if (choices.length > 0 && value.mutation !== undefined) throw new TypeError("Dialogue choices and mutation are mutually exclusive");
  return Object.freeze({ ...value, choices: Object.freeze(choices.map((choice) => Object.freeze({ ...choice }))) });
}

async function resolveCharacterName(content, characterId, cache, signal) {
  let name = cache.get(characterId);
  if (name === undefined) {
    const character = (await content.record("struct.Character", characterId, { signal }))?.value;
    if (character === null || typeof character !== "object" || Array.isArray(character)
        || typeof character.name !== "string" || character.name.length === 0) {
      throw new TypeError(`Dialogue references invalid Character ${characterId}`);
    }
    name = character.name;
    cache.set(characterId, name);
  }
  return name;
}

export function createPokeManDialogueGraphSubsystem(scope, dependencies = {}) {
  const Dialogue = dependencies.RPGDialogue ?? RPGDialogue;
  const createConsumer = dependencies.createControlsConsumer ?? createControlsConsumer;
  const applyMutation = dependencies.applyEventStateMutation ?? applyEventStateMutation;
  return {
    async frame(frame) {
      if (!validGraphInput(frame.params)) return failed({ code: "POKEMAN_DIALOGUE_INPUT_INVALID" });
      let dialogue;
      let controls;
      try {
        dialogue = new Dialogue(scope, frame, { cancelable: true });
        controls = createConsumer(scope.presentationEvents, frame, {
          onEvent(event) {
            if (event.action !== "down" || event.repeat) return;
            if (event.button === "south" || event.button === "start") dialogue.controls.confirm();
            else if (event.button === "up") dialogue.controls.previous();
            else if (event.button === "down") dialogue.controls.next();
            else if (event.button === "select") dialogue.controls.history();
            else if (event.button === "east") dialogue.controls.cancel();
          },
        });
        let currentId = frame.params.dialogueKey;
        const records = new Map();
        const characterNames = new Map();
        while (true) {
          let record = records.get(currentId);
          if (record === undefined) {
            record = validateDialogueContent((await scope.content.record("struct.Dialogue", currentId, { signal: frame.signal }))?.value);
            records.set(currentId, record);
          }
          let selectedTarget;
          for (const [index, line] of record.lines.entries()) {
            const final = index === record.lines.length - 1;
            const speakerName = line.speaker === undefined
              ? record.speakerName ?? ""
              : await resolveCharacterName(scope.content, line.speaker, characterNames, frame.signal);
            const result = await dialogue.openConversation({
              conversation: {
                speakerName,
                text: line.text,
                choices: final ? record.choices.map((choice, choiceIndex) => ({ choiceId: String(choiceIndex), text: choice.text, data: {} })) : [],
                data: {},
              },
              characters: [],
            });
            if (result?.type === "cancelled") return cancelled();
            if (result?.type !== "submitted") throw new TypeError("Dialogue presentation returned an invalid result");
            if (final && record.choices.length > 0) {
              const choiceIndex = Number(result.choiceId);
              if (!Number.isSafeInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= record.choices.length) throw new TypeError("Dialogue selected an invalid choice");
              selectedTarget = record.choices[choiceIndex].target;
            }
            dialogue.appendHistory({ entryId: `${currentId}:${index}`, speakerName, text: line.text });
          }
          if (selectedTarget !== undefined) { currentId = selectedTarget; continue; }
          if (record.mutation !== undefined) {
            const mutation = (await scope.content.record("struct.EventStateMutation", record.mutation, { signal: frame.signal }))?.value;
            await applyMutation(scope.state, mutation, { signal: frame.signal, content: scope.content });
          }
          return completed(currentId);
        }
      } catch {
        if (frame.signal.aborted) return cancelled();
        return failed({ code: "POKEMAN_DIALOGUE_GRAPH_FAILED" });
      } finally {
        controls?.close();
        dialogue?.close();
      }
    },
  };
}

export default defineSubsystem((scope) => createPokeManDialogueGraphSubsystem(scope));
