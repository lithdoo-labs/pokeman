#!/usr/bin/env node
/** Fail CI if a staging bundle was generated from an obsolete PokeMan example. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pwa = join(root, "loom-realm", "apps", "pwa", "dist", "staging", "pwa", "pokeman");
function sha256(data) { return createHash("sha256").update(data).digest("hex"); }
function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}
export async function verifyStaging({ gameRoot = root, stagingDir = null,
                                       expectedSha = null, writeProvenance = true } = {}) {
  const game = resolve(gameRoot);
  const dir = stagingDir ?? join(game, "loom-realm", "apps", "pwa", "dist", "staging", "pwa", "pokeman");
  const [actualGame, actualLaunch, actualPresentation, bundle, generation] = await Promise.all([
    readFile(join(game, "game.json"), "utf8"),
    readFile(join(game, "launch.pwa.json"), "utf8"),
    readFile(join(game, "presentation.json"), "utf8"),
    readFile(join(dir, "pokeman-bundle.json"), "utf8").then(JSON.parse),
    readFile(join(dir, "generation.json"), "utf8").then(JSON.parse),
  ]);
  assert.deepEqual(JSON.parse(bundle.gameEntryText), JSON.parse(actualGame),
                   "Staging bundle must use the independent PokeMan game entry");
  assert.deepEqual(JSON.parse(bundle.launchManifestText), JSON.parse(actualLaunch),
                   "Staging bundle must use the independent PokeMan launch manifest");
  assert.deepEqual(bundle.presentation, JSON.parse(actualPresentation),
                   "Staging presentation must come from the independent PokeMan repository");
  assert.ok(bundle.content?.length > 0, "PokeMan content is missing");
  assert.equal(bundle.executables?.length, 5, "All 5 PokeMan subsystem bundles are required");
  assert.equal(typeof bundle.bundleId, "string");
  assert.ok(bundle.bundleId.length > 0);
  assert.equal(generation.basePath, "/pwa/pokeman/");
  for (const name of ["index.html", "window.js", "service-worker.js", "session-worker.js"]) {
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
  console.log("Verified staging bundle is built from PokeMan main and the exact pinned LoomRealm framework");
  console.log(JSON.stringify(result));
}
