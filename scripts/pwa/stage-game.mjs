#!/usr/bin/env node
/**
 * Prepare the pinned LoomRealm PWA builder for the independently maintained
 * PokeMan project. The legacy builder reads examples/PokeMan and game-libs
 * within LoomRealm. This copies ONLY the current PokeMan main checkout into
 * those temporary locations; it never changes the tracked submodule gitlink.
 *
 * Run after npm ci in loom-realm and before build:staging. No output from this
 * operation is ever committed back to the repository.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const GAME_FILES = Object.freeze([
  "game.json", "launch.pwa.json", "launch.hostra.json",
  "presentation.json", "presentation.css",
]);
export const GAME_DIRECTORIES = Object.freeze(["subsystems", "[FSDB]PokeMan", "presentation"]);
export const LIBRARIES = Object.freeze([
  "battle", "game-common-controls", "map", "rpg-dialogue",
  "schema-form", "tile-presentation",
]);
export const LIBRARY_PATHS = Object.freeze([
  "src", "browser", "scripts", "tsconfig.json", "tsconfig.browser.json",
]);

function git(directory, ...args) {
  return execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
}
async function exists(path) {
  try { await stat(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
async function transfer(source, target, required = false) {
  if (!await exists(source)) {
    if (required) throw new Error("Missing required PokeMan input: " + source);
    return false;
  }
  await rm(target, { recursive: true, force: true });
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true, errorOnExist: false });
  return true;
}
function assertPinnedFramework(game, framework) {
  const approved = git(game, "rev-parse", "HEAD:loom-realm");
  const actual = git(framework, "rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(approved) || actual !== approved) {
    throw new Error("PokeMan LoomRealm gitlink does not match checked-out framework");
  }
  return actual;
}

export async function stagePokeMan({ gameRoot = fileURLToPath(new URL("../../", import.meta.url)),
                                    verifyGitlink = true } = {}) {
  const game = resolve(gameRoot);
  const framework = join(game, "loom-realm");
  const frameworkSha = verifyGitlink ? assertPinnedFramework(game, framework) : null;
  const example = join(framework, "examples", "PokeMan");

  // Do not rewrite the LoomRealm workspace package.json: its dependency
  // addresses are different from PokeMan's standalone package.json.
  await stat(join(example, "package.json"));
  await stat(join(framework, "apps", "pwa", "scripts", "build.mjs"));
  await stat(join(game, "[FSDB]PokeMan"));
  for (const file of GAME_FILES) {
    await transfer(join(game, file), join(example, file),
                   file !== "presentation.css");
  }
  for (const dir of GAME_DIRECTORIES) {
    await transfer(join(game, dir), join(example, dir), dir !== "presentation");
  }
  await transfer(join(game, "scripts", "prepare-pwa-content.mjs"),
                 join(example, "scripts", "prepare-pwa-content.mjs"), true);

  for (const library of LIBRARIES) {
    const target = join(framework, "game-libs", library);
    await stat(join(target, "package.json"));
    await stat(join(game, "game-libs", library, "package.json"));
    for (const part of LIBRARY_PATHS) {
      await transfer(join(game, "game-libs", library, part),
                     join(target, part));
    }
  }

  // Check that the PWA builder's input is an exact copy of PokeMan's
  // canonical manifest, not the stale LoomRealm example.
  for (const file of ["game.json", "launch.pwa.json", "presentation.json"]) {
    const current = await readFile(join(game, file));
    const mirrored = await readFile(join(example, file));
    if (!current.equals(mirrored)) throw new Error("Staging mirror mismatch: " + file);
  }
  return Object.freeze({
    game, frameworkSha, gameSha: verifyGitlink ? git(game, "rev-parse", "HEAD") : null,
    mirroredLibraries: LIBRARIES.length,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await stagePokeMan();
  console.log("Staged canonical PokeMan sources for pinned LoomRealm PWA builder");
  console.log(JSON.stringify(result));
}
