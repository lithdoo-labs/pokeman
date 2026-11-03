import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseGameEntryV1 } from "@loomrealm/game-package";
import { parsePwaLaunchManifestV1 } from "@loomrealm/game-launcher-pwa";
import {
  assertUniquePwaContent,
  mapFsdbEntryToPwaIdentity,
  preparePokeManPwaContent,
  requireFsdbEntry,
  validatePokeManContentGraph,
} from "../scripts/prepare-pwa-content.mjs";

const root = new URL("../", import.meta.url);
const identity = (entry) => `${entry.kind}/${entry.namespace}/${entry.key}`;

test("Desktop and PWA manifests bind the full Base/Map/Dialogue/Battle/Message topology", async () => {
  const game = parseGameEntryV1(await readFile(new URL("game.json", root), "utf8"));
  const pwa = parsePwaLaunchManifestV1(await readFile(new URL("launch.pwa.json", root), "utf8"));
  const hostra = JSON.parse(await readFile(new URL("launch.hostra.json", root), "utf8"));
  assert.equal(game.initial.subsystem, "base");
  assert.deepEqual(game.subsystems.map(({ key }) => key), ["base", "map", "dialogue", "battle", "message"]);
  assert.deepEqual(pwa, {
    formatVersion: 1,
    subsystems: [
      { key: "base", module: "subsystems/base.mjs" },
      { key: "map", module: "subsystems/map.mjs" },
      { key: "dialogue", module: "subsystems/dialogue.mjs" },
      { key: "battle", module: "subsystems/battle.mjs" },
      { key: "message", module: "subsystems/message.mjs" },
    ],
  });
  assert.deepEqual(hostra.subsystems, [
    { key: "base", module: "subsystems/base.mjs" },
    { key: "map", module: "subsystems/map.mjs" },
    { key: "dialogue", module: "subsystems/dialogue.mjs" },
    { key: "battle", module: "subsystems/battle.mjs" },
    { key: "message", module: "subsystems/message.mjs" },
  ]);
  assert.deepEqual(pwa.subsystems.map(({ key }) => key), game.subsystems.map(({ key }) => key));
});

test("FSDB identities map to Content API kinds without leaking physical suffixes", () => {
  const descriptor = (kind, table, key, contentType) => ({
    identity: { type: "entry", kind, table, key },
    contentType,
    length: 1n,
  });
  assert.deepEqual(mapFsdbEntryToPwaIdentity(descriptor("struct", "Map", "3", "application/json")), {
    kind: "record", namespace: "struct.Map", key: "3", mime: "application/json",
  });
  assert.deepEqual(mapFsdbEntryToPwaIdentity(descriptor("group", "Items", "all", "application/x-ndjson")), {
    kind: "group", namespace: "group.Items", key: "all", mime: "application/x-ndjson",
  });
  assert.deepEqual(mapFsdbEntryToPwaIdentity(descriptor("resource", "Presentation", "map/map.browser.js", "text/javascript")), {
    kind: "resource", namespace: "resource.Presentation", key: "map/map.browser.js", mime: "text/javascript",
  });
});

test("real PokeMan FSDB produces a deterministic full-content package", async () => {
  const first = await preparePokeManPwaContent();
  const second = await preparePokeManPwaContent();
  assert.deepEqual(first.map(identity), second.map(identity));
  assert.equal(first.length, second.length);
  for (let index = 0; index < first.length; index += 1) {
    assert.deepEqual(first[index].bytes, second[index].bytes, identity(first[index]));
  }

  const ids = new Set(first.map(identity));
  for (const expected of [
    "record/struct.Map/3",
    "record/struct.MapTransfer/3",
    "record/struct.Tileset/3",
    "record/struct.NPC/professor",
    "resource/resource.Graphics/Characters/Player",
    "resource/resource.Presentation/schema-form/schema-form.browser.js",
    "resource/resource.Presentation/schema-form/schema-form.browser.css",
    "resource/resource.Presentation/map/map.browser.js",
    "resource/resource.Presentation/map/map.css",
    "resource/resource.Presentation/dialogue/dialogue.browser.js",
    "resource/resource.Presentation/dialogue/dialogue.css",
    "record/struct.BattleArena/lab-tutorial",
    "record/struct.BattleSkill/grab",
    "record/struct.BattleEffect/grab",
    "resource/resource.Graphics/BattleEffects/Grab",
    "resource/resource.Presentation/battle/battle.browser.js",
    "resource/resource.Presentation/message/message.browser.js",
    "resource/resource.Presentation/page.css",
  ]) assert.ok(ids.has(expected), `missing ${expected}`);

  for (const entry of first) {
    assert.ok(!entry.key.endsWith(".json") && !entry.key.endsWith(".png") && !entry.key.endsWith(".css.css") && !entry.key.endsWith(".js.js"));
    assert.ok(!entry.key.includes(".meta"));
    if (entry.kind === "record") {
      assert.match(entry.mime, /^application\/json/);
      assert.doesNotThrow(() => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(entry.bytes)));
    }
  }
  const graphics = first.filter((entry) => entry.namespace === "resource.Graphics");
  assert.ok(graphics.length > 0);
  for (const entry of graphics) {
    assert.equal(entry.mime, "image/png");
    assert.deepEqual([...entry.bytes.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  assert.equal(
    first.filter((entry) => entry.namespace === "struct.Map").length,
    first.filter((entry) => entry.namespace === "struct.MapTransfer").length,
  );
  assert.ok(first.reduce((total, entry) => total + entry.bytes.byteLength, 0) < 256 * 1024 * 1024);

  const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
  await assert.rejects(validatePokeManContentGraph([...first, {
    kind: "record", namespace: "struct.Character", key: "unindexed-character", mime: "application/json",
    bytes: encode({ name: "Unindexed", battleActor: { namespace: "struct.BattleActor", key: "player" } }),
  }]), /complete Character source keys/u);
  await assert.rejects(validatePokeManContentGraph([...first, {
    kind: "record", namespace: "struct.Event", key: "unindexed-event", mime: "application/json",
    bytes: encode({ states: { active: { maps: {} } } }),
  }]), /complete Event source keys/u);

  const dialogue = (key, value) => ({
    kind: "record", namespace: "struct.Dialogue", key, mime: "application/json", bytes: encode(value),
  });
  await assert.doesNotReject(validatePokeManContentGraph([...first,
    dialogue("cycle-a", { lines: [{ speaker: "professor", text: "A" }], choices: [{ text: "next", target: "cycle-b" }] }),
    dialogue("cycle-b", { lines: [{ speaker: "rival", text: "B" }], choices: [{ text: "next", target: "cycle-a" }] }),
  ]));
  await assert.rejects(validatePokeManContentGraph([...first,
    dialogue("broken-target", { lines: [{ text: "broken" }], choices: [{ text: "next", target: "missing" }] }),
  ]), /missing target missing/u);
  await assert.rejects(validatePokeManContentGraph([...first,
    dialogue("broken-speaker", { lines: [{ speaker: "ghost", text: "broken" }] }),
  ]), /missing Character ghost/u);
  await assert.rejects(validatePokeManContentGraph([...first,
    dialogue("broken-mutation", { lines: [{ text: "broken" }], mutation: "missing" }),
  ]), /missing mutation missing/u);
});

test("content preparation fails closed on missing references and duplicate PWA identities", () => {
  assert.throws(
    () => requireFsdbEntry(new Map(), "resource", "Graphics", "Characters/Missing"),
    /Missing PokeMan dependency/,
  );
  const entry = {
    kind: "resource",
    namespace: "resource.Graphics",
    key: "Characters/Player",
    mime: "image/png",
    bytes: new Uint8Array([1]),
  };
  assert.throws(() => assertUniquePwaContent([entry, { ...entry }]), /Duplicate PWA Content identity/);
});
