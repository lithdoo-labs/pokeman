import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildPokeManInstallationBundle, SUBSYSTEMS } from "../build-installation-bundle.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("PokeMan adapter emits a generic v1 payload from product-owned sources without mirroring", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pokeman-pwa-generic-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const framework = join(root, "loom-realm");
  const outputFile = join(root, "runner-temp", "installation-bundle.json");
  await mkdir(join(root, "subsystems"), { recursive: true });
  await mkdir(join(framework, "examples", "PokeMan"), { recursive: true });
  await writeFile(join(framework, "examples", "PokeMan", "sentinel.txt"), "must remain untouched");
  for (const name of SUBSYSTEMS) {
    await writeFile(join(root, "subsystems", name + ".mjs"), "export const subsystem = " + JSON.stringify(name) + ";");
  }

  const buildCalls = [];
  const buildExecutable = async (options) => {
    buildCalls.push(options);
    const source = await readFile(options.entryPoints[0], "utf8");
    assert.equal(options.absWorkingDir, root);
    assert.equal(options.bundle, true);
    assert.equal(options.format, "esm");
    assert.equal(options.platform, "browser");
    assert.equal(options.target, "chrome140");
    await writeFile(options.outfile, "/* bundled */\n" + source);
  };
  const fixtureFactory = async ({ exampleRoot, fsdbRoot, executablePaths }) => {
    assert.equal(exampleRoot, root);
    assert.equal(fsdbRoot, join(root, "[FSDB]PokeMan"));
    const executables = await Promise.all(SUBSYSTEMS.map(async (name) => {
      const source = await readFile(executablePaths[name], "utf8");
      return {
        logicalModule: "subsystems/" + name + ".mjs",
        mime: "text/javascript",
        source,
        contentVersion: "sha256:" + sha256(source),
      };
    }));
    return {
      gameEntryText: JSON.stringify({
        formatVersion: 1,
        initial: { subsystem: "base", input: {} },
        subsystems: SUBSYSTEMS.map((key) => ({ key })),
      }),
      launchManifestText: JSON.stringify({
        formatVersion: 1,
        subsystems: SUBSYSTEMS.map((key) => ({ key, module: "subsystems/" + key + ".mjs" })),
      }),
      presentation: { formatVersion: 1, scripts: [], styles: [] },
      executables,
      content: [{
        kind: "record",
        namespace: "struct.Map",
        key: "3",
        mime: "application/json",
        encoding: "base64",
        body: "eyJvayI6dHJ1ZX0=",
      }],
    };
  };

  const result = await buildPokeManInstallationBundle({
    gameRoot: root,
    frameworkRoot: framework,
    outputFile,
    verifyGitlink: false,
    buildExecutable,
    fixtureFactory,
  });
  assert.equal(result.executableCount, 5);
  assert.equal(result.contentCount, 1);
  assert.equal(buildCalls.length, 5);
  const payload = JSON.parse(await readFile(outputFile, "utf8"));
  assert.equal(payload.formatVersion, 1);
  assert.deepEqual(payload.executables.map((entry) => entry.logicalModule), SUBSYSTEMS.map((name) => "subsystems/" + name + ".mjs"));
  for (const entry of payload.executables) {
    assert.match(entry.source, /^\/\* bundled \*\//);
    assert.equal(entry.contentVersion, "sha256:" + sha256(entry.source));
  }
  assert.equal(await readFile(join(framework, "examples", "PokeMan", "sentinel.txt"), "utf8"), "must remain untouched");
  await assert.rejects(readFile(join(framework, "examples", "PokeMan", "game.json")));
});

test("PokeMan adapter rejects an incomplete executable graph", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pokeman-pwa-incomplete-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "subsystems"), { recursive: true });
  for (const name of SUBSYSTEMS.slice(0, -1)) {
    await writeFile(join(root, "subsystems", name + ".mjs"), "export default {};");
  }
  const buildExecutable = async ({ entryPoints, outfile }) => {
    const source = await readFile(entryPoints[0], "utf8");
    await writeFile(outfile, source);
  };
  await assert.rejects(buildPokeManInstallationBundle({
    gameRoot: root,
    frameworkRoot: join(root, "loom-realm"),
    outputFile: join(root, "out.json"),
    verifyGitlink: false,
    buildExecutable,
    fixtureFactory: async () => ({
      gameEntryText: "{}",
      launchManifestText: "{}",
      presentation: {},
      executables: [],
      content: [],
    }),
  }), /exactly five subsystem executables/);
});
