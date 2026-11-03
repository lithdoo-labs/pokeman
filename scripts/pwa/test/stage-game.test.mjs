import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stagePokeMan, LIBRARIES } from "../stage-game.mjs";

test("mirror takes only standalone PokeMan sources, keeps framework manifests", async (t) => {
  const fs = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "pokeman-pwa-migrate-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const framework = join(root, "loom-realm");
  const example = join(framework, "examples", "PokeMan");
  await mkdir(example, { recursive: true });
  await mkdir(join(framework, "apps", "pwa", "scripts"), { recursive: true });
  await writeFile(join(framework, "apps", "pwa", "scripts", "build.mjs"), "pinned builder");
  await writeFile(join(example, "package.json"), '{"name":"legacy-package"}');
  await writeFile(join(example, "game.json"), "stale source");
  await mkdir(join(example, "subsystems"), { recursive: true });
  await writeFile(join(example, "subsystems", "old.mjs"), "stale");
  for (const [name, source] of [
    ["game.json", '{"name":"standalone-pokeman"}'],
    ["launch.pwa.json", '{"formatVersion":1}'],
    ["launch.hostra.json", '{"formatVersion":1}'],
    ["presentation.json", '{"styles":[]}'],
    ["presentation.css", "body{}"],
  ]) await writeFile(join(root, name), source);
  await mkdir(join(root, "subsystems"));
  await writeFile(join(root, "subsystems", "map.mjs"), "export const current = true;");
  await mkdir(join(root, "scripts"));
  await writeFile(join(root, "scripts", "prepare-pwa-content.mjs"), "export const source = 'pokeman';");
  await mkdir(join(root, "[FSDB]PokeMan"));
  await writeFile(join(root, "[FSDB]PokeMan", "current.txt"), "current asset");
  await mkdir(join(root, "presentation"));
  await writeFile(join(root, "presentation", "current.txt"), "current presentation");

  for (const lib of LIBRARIES) {
    const from = join(root, "game-libs", lib);
    const to = join(framework, "game-libs", lib);
    await mkdir(join(from, "src"), { recursive: true });
    await mkdir(join(to, "src"), { recursive: true });
    await writeFile(join(from, "package.json"), '{"name":"standalone"}');
    await writeFile(join(to, "package.json"), '{"name":"pinned-framework"}');
    await writeFile(join(to, "src", "obsolete.ts"), "old code");
    await writeFile(join(from, "src", "current.ts"), "source code");
  }
  const result = await stagePokeMan({ gameRoot: root, verifyGitlink: false });
  assert.equal(result.mirroredLibraries, LIBRARIES.length);
  assert.equal(await readFile(join(example, "game.json"), "utf8"), '{"name":"standalone-pokeman"}');
  assert.equal(await readFile(join(example, "package.json"), "utf8"), '{"name":"legacy-package"}');
  assert.equal(await readFile(join(example, "subsystems", "map.mjs"), "utf8"), "export const current = true;");
  await assert.rejects(readFile(join(example, "subsystems", "old.mjs")));
  assert.equal(await readFile(join(example, "[FSDB]PokeMan", "current.txt"), "utf8"), "current asset");
  assert.equal(await readFile(join(example, "scripts", "prepare-pwa-content.mjs"), "utf8"), "export const source = 'pokeman';");
  for (const lib of LIBRARIES) {
    const target = join(framework, "game-libs", lib);
    assert.equal(await readFile(join(target, "package.json"), "utf8"), '{"name":"pinned-framework"}');
    assert.equal(await readFile(join(target, "src", "current.ts"), "utf8"), "source code");
    await assert.rejects(readFile(join(target, "src", "obsolete.ts")));
  }
  assert.equal(await readFile(join(root, "game.json"), "utf8"), '{"name":"standalone-pokeman"}');
});

test("missing framework input refuses to create a fake PWA build", async (t) => {
  const fs = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "pokeman-pwa-missing-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(stagePokeMan({ gameRoot: root, verifyGitlink: false }),
                       /ENOENT/);
});


test("PWA PR path filter matches the literal FSDB folder and all staging inputs", async () => {
  const workflow = await readFile(new URL("../../../.github/workflows/pwa-staging.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes(String.raw`- '\[FSDB\]PokeMan/**'`),
    "GitHub glob syntax must escape literal FSDB square brackets");
  for (const required of [
    "scripts/prepare-pwa-content.mjs",
    "scripts/sync-map-presentation.mjs",
    "test/**",
    "presentation.css",
    "package.json",
  ]) {
    assert.ok(workflow.includes(required), "PWA PR filter missing input " + required);
  }
});
