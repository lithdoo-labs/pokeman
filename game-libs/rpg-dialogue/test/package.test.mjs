import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("published package exposes runtime and built Browser artifacts", async () => {
  const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(metadata.name, "@loomrealm-game/rpg-dialogue");
  assert.equal(metadata.exports["./browser/rpg-dialogue.browser.js"], "./dist/browser/rpg-dialogue.browser.js");
  assert.equal(metadata.exports["./browser/rpg-dialogue.browser.css"], "./dist/browser/rpg-dialogue.browser.css");
  assert.equal(existsSync(path.join(root, "dist/index.js")), true);
  assert.equal(existsSync(path.join(root, "dist/index.d.ts")), true);
  assert.equal(existsSync(path.join(root, "dist/browser/rpg-dialogue.browser.js")), true);
  assert.equal(existsSync(path.join(root, "dist/browser/rpg-dialogue.browser.css")), true);
});

test("current v1 Runtime has no physical or unified controls protocol ownership", async () => {
  const source = await readFile(path.join(root, "src/runtime.ts"), "utf8");
  assert.doesNotMatch(source, /keyboard\.|gamepad\.|controls\.(?:state|event)|ControlsButton/);
  assert.match(source, /\[WEB_PRESENTATION_EVENT_CHANNEL\]/);
});
