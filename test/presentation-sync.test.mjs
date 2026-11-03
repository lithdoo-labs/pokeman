import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { syncMapPresentation } from "../scripts/sync-map-presentation.mjs";

const targetRelative = Object.freeze({
  schemaFormJs: join("[resource]Presentation", "schema-form", "schema-form.browser.js.js"),
  schemaFormCss: join("[resource]Presentation", "schema-form", "schema-form.browser.css.css"),
  controlsJs: join("[resource]Presentation", "controls", "device-input.browser.js.js"),
  js: join("[resource]Presentation", "map", "map.browser.js.js"),
  css: join("[resource]Presentation", "map", "map.css.css"),
  dialogueJs: join("[resource]Presentation", "dialogue", "dialogue.browser.js.js"),
  dialogueCss: join("[resource]Presentation", "dialogue", "dialogue.css.css"),
  battleJs: join("[resource]Presentation", "battle", "battle.browser.js.js"),
  battleCss: join("[resource]Presentation", "battle", "battle.css.css"),
  messageJs: join("[resource]Presentation", "message", "message.browser.js.js"),
  messageCss: join("[resource]Presentation", "message", "message.css.css"),
  pageCss: join("[resource]Presentation", "page.css.css"),
});

async function makeFixture(t) {
  const temp = await mkdtemp(join(tmpdir(), "pokeman-presentation-sync-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const repoRoot = join(temp, "repo");
  const exampleRoot = join(repoRoot, "examples", "PokeMan");
  const fsdbRoot = join(exampleRoot, "[FSDB]Fixture");
  const source = {
    schemaFormJs: join(repoRoot, "game-libs", "schema-form", "dist", "browser", "schema-form.browser.js"),
    schemaFormCss: join(repoRoot, "game-libs", "schema-form", "dist", "browser", "schema-form.browser.css"),
    controlsJs: join(repoRoot, "game-libs", "game-common-controls", "dist", "browser", "device-input.browser.js"),
    js: join(repoRoot, "game-libs", "map", "browser", "map.browser.js"),
    css: join(repoRoot, "game-libs", "map", "browser", "map.css"),
    dialogueJs: join(exampleRoot, "presentation", "dialogue.browser.js"),
    dialogueCss: join(exampleRoot, "presentation", "dialogue.css"),
    battleJs: join(repoRoot, "game-libs", "battle", "dist", "browser", "battle.browser.js"),
    battleCss: join(repoRoot, "game-libs", "battle", "dist", "browser", "battle.css"),
    messageJs: join(exampleRoot, "presentation", "message.browser.js"),
    messageCss: join(exampleRoot, "presentation", "message.css"),
    pageCss: join(exampleRoot, "presentation.css"),
  };
  const dist = {
    schemaFormJs: source.schemaFormJs,
    schemaFormCss: source.schemaFormCss,
    controlsJs: source.controlsJs,
    js: join(repoRoot, "game-libs", "map", "dist", "browser", "map.browser.js"),
    css: join(repoRoot, "game-libs", "map", "dist", "browser", "map.css"),
    battleJs: source.battleJs,
    battleCss: source.battleCss,
  };
  const target = Object.fromEntries(Object.entries(targetRelative).map(([key, path]) => [key, join(fsdbRoot, path)]));
  await Promise.all([
    mkdir(join(repoRoot, "game-libs", "map", "browser"), { recursive: true }),
    mkdir(join(repoRoot, "game-libs", "map", "dist", "browser"), { recursive: true }),
    mkdir(join(repoRoot, "game-libs", "schema-form", "dist", "browser"), { recursive: true }),
    mkdir(join(repoRoot, "game-libs", "game-common-controls", "dist", "browser"), { recursive: true }),
    mkdir(join(repoRoot, "game-libs", "battle", "dist", "browser"), { recursive: true }),
    mkdir(join(exampleRoot, "presentation"), { recursive: true }),
    mkdir(join(fsdbRoot, "[resource]Presentation", "controls"), { recursive: true }),
    mkdir(join(fsdbRoot, "[resource]Presentation", "schema-form"), { recursive: true }),
    mkdir(join(fsdbRoot, "[resource]Presentation", "map"), { recursive: true }),
    mkdir(join(fsdbRoot, "[resource]Presentation", "dialogue"), { recursive: true }),
    mkdir(join(fsdbRoot, "[resource]Presentation", "battle"), { recursive: true }),
    mkdir(join(fsdbRoot, "[resource]Presentation", "message"), { recursive: true }),
  ]);
  const expected = {
    schemaFormJs: Buffer.from("customElements.define('lr-schema-form', class extends HTMLElement {});\n"),
    schemaFormCss: Buffer.from("lr-schema-form { display: block; }\n"),
    controlsJs: Buffer.from("customElements.define('game-keyboard-input', class extends HTMLElement {});\n"),
    js: Buffer.from("export const presentation = 'map';\n"),
    css: Buffer.from("lr-map-view { display: block; }\n"),
    dialogueJs: Buffer.from("(function () { customElements.define('lr-dialogue-view', class extends HTMLElement {}); })();\n"),
    dialogueCss: Buffer.from("lr-dialogue-view { display: block; }\n"),
    battleJs: Buffer.from("customElements.define('lr-battle-view', class extends HTMLElement {});\n"),
    battleCss: Buffer.from("lr-battle-view { display: block; }\n"),
    messageJs: Buffer.from("customElements.define('pokeman-message', class extends HTMLElement {});\n"),
    messageCss: Buffer.from("pokeman-message { display: block; }\n"),
    pageCss: Buffer.from("lr-map-view { width: 100vw; height: 100vh; }\n"),
  };
  await Promise.all([
    writeFile(source.schemaFormJs, expected.schemaFormJs),
    writeFile(source.schemaFormCss, expected.schemaFormCss),
    writeFile(source.controlsJs, expected.controlsJs),
    writeFile(source.js, expected.js),
    writeFile(source.css, expected.css),
    writeFile(source.dialogueJs, expected.dialogueJs),
    writeFile(source.dialogueCss, expected.dialogueCss),
    writeFile(source.battleJs, expected.battleJs),
    writeFile(source.battleCss, expected.battleCss),
    writeFile(source.messageJs, expected.messageJs),
    writeFile(source.messageCss, expected.messageCss),
    writeFile(source.pageCss, expected.pageCss),
    writeFile(dist.js, expected.js),
    writeFile(dist.css, expected.css),
    ...Object.values(target).map((path) => writeFile(path, "old presentation\n")),
  ]);
  return { repoRoot, exampleRoot, fsdbRoot, source, dist, target, expected };
}

function instrumentedFileOps(counters = {}) {
  counters.opens ??= 0;
  counters.renames ??= 0;
  return {
    readFile,
    writeFile,
    unlink,
    readdir,
    lstat,
    mkdir,
    async open(...args) {
      counters.opens += 1;
      return open(...args);
    },
    async rename(...args) {
      counters.renames += 1;
      return rename(...args);
    },
  };
}

test("sync copies built Map artifacts and the PokeMan page CSS idempotently", async (t) => {
  const fixture = await makeFixture(t);
  const counters = {};
  const fileOps = instrumentedFileOps(counters);
  await syncMapPresentation({ ...fixture, runBuild: false, fileOps });
  for (const key of Object.keys(fixture.target)) {
    assert.deepEqual(await readFile(fixture.target[key]), fixture.expected[key]);
  }
  assert.equal(counters.opens, 12);
  const renamesAfterFirstSync = counters.renames;

  await syncMapPresentation({ ...fixture, runBuild: false, fileOps });
  assert.equal(counters.opens, 12, "an idempotent sync must not create staging files");
  assert.equal(counters.renames, renamesAfterFirstSync, "an idempotent sync must not replace targets");

  await syncMapPresentation({ ...fixture, runBuild: false, checkOnly: true, fileOps });
  assert.equal(counters.opens, 12, "--check must be read-only");
});

test("--check detects missing and corrupted FSDB artifacts without repairing them", async (t) => {
  const fixture = await makeFixture(t);
  await syncMapPresentation({ ...fixture, runBuild: false });

  await writeFile(fixture.target.css, "corrupted\n");
  await assert.rejects(
    syncMapPresentation({ ...fixture, runBuild: false, checkOnly: true }),
    /FSDB hash \(map CSS\)/,
  );
  assert.equal(await readFile(fixture.target.css, "utf8"), "corrupted\n");

  await unlink(fixture.target.js);
  await assert.rejects(
    syncMapPresentation({ ...fixture, runBuild: false, checkOnly: true }),
    /ENOENT/,
  );
  await assert.rejects(lstat(fixture.target.js), { code: "ENOENT" });
});

test("a replacement failure restores the complete previous Presentation set", async (t) => {
  const fixture = await makeFixture(t);
  const originals = Object.fromEntries(await Promise.all(Object.entries(fixture.target).map(async ([key, path]) => [key, await readFile(path)])));
  const fileOps = instrumentedFileOps();
  const realRename = fileOps.rename;
  fileOps.rename = async (from, to) => {
    if (String(from).endsWith(".tmp") && to === fixture.target.css) {
      throw new Error("injected rename failure");
    }
    return realRename(from, to);
  };

  await assert.rejects(
    syncMapPresentation({ ...fixture, runBuild: false, fileOps }),
    /injected rename failure/,
  );
  for (const [key, path] of Object.entries(fixture.target)) {
    assert.deepEqual(await readFile(path), originals[key], `${key} was not restored`);
  }
  const leftovers = [
    ...await readdir(join(fixture.fsdbRoot, "[resource]Presentation")),
    ...await readdir(join(fixture.fsdbRoot, "[resource]Presentation", "controls")),
    ...await readdir(join(fixture.fsdbRoot, "[resource]Presentation", "schema-form")),
    ...await readdir(join(fixture.fsdbRoot, "[resource]Presentation", "dialogue")),
    ...await readdir(join(fixture.fsdbRoot, "[resource]Presentation", "map")),
    ...await readdir(join(fixture.fsdbRoot, "[resource]Presentation", "battle")),
    ...await readdir(join(fixture.fsdbRoot, "[resource]Presentation", "message")),
  ].filter((name) => name.includes(".loomrealm-sync."));
  assert.deepEqual(leftovers, []);
});

test("source/dist drift fails before changing FSDB artifacts", async (t) => {
  const fixture = await makeFixture(t);
  const before = await readFile(fixture.target.js);
  await writeFile(fixture.dist.js, "stale build output\n");
  await assert.rejects(
    syncMapPresentation({ ...fixture, runBuild: false }),
    /source\/dist hash \(map browser JS\)/,
  );
  assert.deepEqual(await readFile(fixture.target.js), before);
});

test("presentation.json preserves the ordered classic Presentation bootstrap", async () => {
  const presentation = JSON.parse(await readFile(new URL("../presentation.json", import.meta.url), "utf8"));
  assert.deepEqual(presentation, {
    formatVersion: 1,
    styles: [
      { namespace: "Presentation", key: "schema-form/schema-form.browser.css" },
      { namespace: "Presentation", key: "map/map.css" },
      { namespace: "Presentation", key: "dialogue/dialogue.css" },
      { namespace: "Presentation", key: "battle/battle.css" },
      { namespace: "Presentation", key: "message/message.css" },
      { namespace: "Presentation", key: "page.css" },
    ],
    scripts: [
      { namespace: "Presentation", key: "schema-form/schema-form.browser.js" },
      { namespace: "Presentation", key: "controls/device-input.browser.js" },
      { namespace: "Presentation", key: "map/map.browser.js" },
      { namespace: "Presentation", key: "dialogue/dialogue.browser.js" },
      { namespace: "Presentation", key: "battle/battle.browser.js" },
      { namespace: "Presentation", key: "message/message.browser.js" },
    ],
  });
});

test("a build failure stops synchronization before changing FSDB artifacts", async (t) => {
  const fixture = await makeFixture(t);
  const before = await readFile(fixture.target.pageCss);
  await writeFile(join(fixture.repoRoot, "package.json"), JSON.stringify({
    private: true,
    scripts: { "build:m15": "node -e \"process.exit(9)\"" },
  }));
  await assert.rejects(
    syncMapPresentation({ ...fixture, runBuild: true }),
    /npm run build:m15 failed/,
  );
  assert.deepEqual(await readFile(fixture.target.pageCss), before);
});
