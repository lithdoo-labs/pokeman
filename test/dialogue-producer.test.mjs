import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const VERSION = /^sha256:[0-9a-f]{64}$/;

async function resolveDialogueCharacterFixture({ content, characterId, displayName, appearanceNpcIds }) {
  if (!Array.isArray(appearanceNpcIds) || appearanceNpcIds.length !== 1) return null;
  const npcId = appearanceNpcIds[0];
  const npc = (await content.record("struct.NPC", npcId)).value;
  const authored = npc?.sprite;
  if (authored === null || typeof authored !== "object" || Array.isArray(authored) ||
      Object.keys(authored).sort().join(",") !== "key,namespace" || authored.namespace !== "resource.Graphics" ||
      typeof authored.key !== "string" || authored.key.length === 0 || "contentVersion" in authored) {
    throw new TypeError("Invalid authored NPC sprite ref");
  }
  const resource = await content.resource(authored.namespace, authored.key);
  if (!VERSION.test(resource?.contentVersion ?? "")) throw new TypeError("Invalid resolved sprite contentVersion");
  return Object.freeze({
    characterId,
    displayName,
    active: true,
    data: Object.freeze({
      sprite: Object.freeze({
        namespace: authored.namespace,
        key: authored.key,
        contentVersion: resource.contentVersion,
      }),
    }),
  });
}

test("resolved NPC appearance produces the exact versioned Dialogue character sprite payload", async () => {
  const authoredNpc = JSON.parse(await readFile(new URL("../[FSDB]PokeMan/[struct]NPC/professor.json", import.meta.url), "utf8"));
  const contentVersion = `sha256:${"b".repeat(64)}`;
  const calls = [];
  const content = {
    async record(namespace, key) {
      calls.push(["record", namespace, key]);
      return { value: authoredNpc, contentVersion: `sha256:${"c".repeat(64)}` };
    },
    async resource(namespace, key) {
      calls.push(["resource", namespace, key]);
      return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion };
    },
  };
  assert.equal("contentVersion" in authoredNpc.sprite, false, "authored NPC refs are not PresentationResourceClient refs");
  const character = await resolveDialogueCharacterFixture({
    content,
    characterId: "professor",
    displayName: "Professor",
    appearanceNpcIds: ["professor"],
  });
  assert.deepEqual(character, {
    characterId: "professor",
    displayName: "Professor",
    active: true,
    data: { sprite: { namespace: "resource.Graphics", key: authoredNpc.sprite.key, contentVersion } },
  });
  assert.deepEqual(calls, [
    ["record", "struct.NPC", "professor"],
    ["resource", "resource.Graphics", authoredNpc.sprite.key],
  ]);
});

test("ambiguous or unresolved appearance creates no active visual character and guesses no NPC", async () => {
  const calls = [];
  const content = {
    async record(...args) { calls.push(["record", ...args]); throw new Error("must not be called"); },
    async resource(...args) { calls.push(["resource", ...args]); throw new Error("must not be called"); },
  };
  assert.equal(await resolveDialogueCharacterFixture({ content, characterId: "rival", displayName: "Rival", appearanceNpcIds: [] }), null);
  assert.equal(await resolveDialogueCharacterFixture({ content, characterId: "rival", displayName: "Rival", appearanceNpcIds: ["rival-lab", "rival-casual"] }), null);
  assert.deepEqual(calls, []);
});

test("invalid resolved versions cannot cross the producer boundary", async () => {
  const content = {
    async record() { return { value: { sprite: { namespace: "resource.Graphics", key: "Characters/Professor" } } }; },
    async resource() { return { bytes: new Uint8Array(), mime: "image/png", contentVersion: "latest" }; },
  };
  await assert.rejects(
    resolveDialogueCharacterFixture({ content, characterId: "professor", displayName: "Professor", appearanceNpcIds: ["professor"] }),
    /contentVersion/,
  );
});
