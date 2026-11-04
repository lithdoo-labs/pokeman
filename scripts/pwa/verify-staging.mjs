#!/usr/bin/env node
/** Verify that the generic installation bundle came from the current PokeMan and pinned LoomRealm commits. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
function sha256(data) { return createHash("sha256").update(data).digest("hex"); }
function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}
function isCanonicalBase64(value) {
  return typeof value === "string" && Buffer.from(value, "base64").toString("base64") === value;
}

export async function verifyStaging({
  gameRoot = root,
  stagingDir = null,
  expectedSha = null,
  writeProvenance = true,
} = {}) {
  const game = resolve(gameRoot);
  const dir = stagingDir ?? join(game, "loom-realm", "apps", "pwa", "dist", "staging", "pwa", "pokeman");
  const [actualGame, actualLaunch, actualPresentation, bundle, generation] = await Promise.all([
    readFile(join(game, "game.json"), "utf8"),
    readFile(join(game, "launch.pwa.json"), "utf8"),
    readFile(join(game, "presentation.json"), "utf8"),
    readFile(join(dir, "installation-bundle.json"), "utf8").then(JSON.parse),
    readFile(join(dir, "generation.json"), "utf8").then(JSON.parse),
  ]);

  assert.equal(bundle.formatVersion, 1, "PWA bundle must use installation-bundle v1");
  assert.deepEqual(JSON.parse(bundle.gameEntryText), JSON.parse(actualGame),
    "Staging bundle must use the independent PokeMan game entry");
  assert.deepEqual(JSON.parse(bundle.launchManifestText), JSON.parse(actualLaunch),
    "Staging bundle must use the independent PokeMan launch manifest");
  assert.deepEqual(bundle.presentation, JSON.parse(actualPresentation),
    "Staging presentation must come from the independent PokeMan repository");
  assert.ok(Array.isArray(bundle.content) && bundle.content.length > 0, "PokeMan Content is missing");
  assert.equal(bundle.executables?.length, 5, "All five PokeMan subsystem bundles are required");
  assert.deepEqual(bundle.executables.map((entry) => entry.logicalModule), [
    "subsystems/base.mjs",
    "subsystems/map.mjs",
    "subsystems/dialogue.mjs",
    "subsystems/battle.mjs",
    "subsystems/message.mjs",
  ]);
  assert.match(bundle.bundleId ?? "", /^loomrealm-pwa-sha256-[0-9a-f]{64}$/);
  assert.equal(generation.appId, "pokeman");
  assert.equal(generation.basePath, "/pwa/pokeman/");

  for (const [index, entry] of bundle.executables.entries()) {
    assert.equal(entry.mime, "text/javascript", "Unexpected executable MIME at index " + index);
    assert.equal(entry.contentVersion, "sha256:" + sha256(entry.source), "Executable digest mismatch at index " + index);
    assert.doesNotMatch(entry.source, /\bfrom\s*["']@loomrealm(?:-game)?\//u,
      "Executable must be bundled before it enters the generic payload");
    assert.doesNotMatch(entry.source, /\bimport\s*\(\s*[^"']/u,
      "Executable must not retain a runtime-computed dynamic import");
  }
  for (const [index, entry] of bundle.content.entries()) {
    assert.ok(isCanonicalBase64(entry.body), "Non-canonical Content encoding at index " + index);
  }
  for (const name of [
    "index.html",
    "window.js",
    "service-worker.js",
    "session-worker.js",
    "worker-runner.js",
    "installation-bundle.json",
  ]) {
    const content = await readFile(join(dir, name));
    assert.ok(content.length > 0, "Missing built PWA resource: " + name);
  }

  const gameSha = git(game, "rev-parse", "HEAD");
  const frameworkSha = git(game, "rev-parse", "HEAD:loom-realm");
  assert.equal(git(join(game, "loom-realm"), "rev-parse", "HEAD"), frameworkSha);
  if (expectedSha) assert.equal(gameSha, expectedSha, "Build does not match approved CI commit");

  const record = Object.freeze({
    version: 1,
    repository: "lithdoo-labs/pokeman",
    gameCommit: gameSha,
    frameworkCommit: frameworkSha,
    gameSha256: sha256(actualGame),
    launchSha256: sha256(actualLaunch),
    presentationSha256: sha256(actualPresentation),
    bundleId: bundle.bundleId,
    contentRecords: bundle.content.length,
    executableCount: bundle.executables.length,
  });
  const provenancePath = join(dir, "source-provenance.json");
  try {
    const existing = JSON.parse(await readFile(provenancePath, "utf8"));
    assert.deepEqual(existing, record, "Downloaded artifact provenance must match the approved source");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (!writeProvenance) throw new Error("PWA artifact is missing its provenance record");
    await mkdir(dirname(provenancePath), { recursive: true });
    await writeFile(provenancePath, JSON.stringify(record, null, 2) + "\n");
  }
  return record;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyStaging({ expectedSha: process.env.EXPECTED_SHA || null });
  console.log("Verified generic installation bundle is built from PokeMan and its exact pinned LoomRealm framework");
  console.log(JSON.stringify(result));
}
