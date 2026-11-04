#!/usr/bin/env node
/**
 * Build the PokeMan-owned product payload for LoomRealm's generic PWA builder.
 * All game inputs are read from this repository; no files are copied into the
 * LoomRealm example tree or its game-libs workspace.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createPokeManPwaFixture } from "../prepare-pwa-content.mjs";

export const SUBSYSTEMS = Object.freeze(["base", "map", "dialogue", "battle", "message"]);
const root = fileURLToPath(new URL("../../", import.meta.url));

function git(directory, ...args) {
  return execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
}

function assertPinnedFramework(game, framework) {
  const expected = git(game, "rev-parse", "HEAD:loom-realm");
  const actual = git(framework, "rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(expected) || actual !== expected) {
    throw new Error("PokeMan LoomRealm gitlink does not match checked-out framework");
  }
  return actual;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateFixture(fixture) {
  if (!isObject(fixture)) throw new TypeError("PokeMan installation fixture must be an object");
  for (const [label, text] of [["gameEntryText", fixture.gameEntryText], ["launchManifestText", fixture.launchManifestText]]) {
    if (typeof text !== "string") throw new TypeError(label + " must be a string");
    try {
      if (!isObject(JSON.parse(text))) throw new Error();
    } catch {
      throw new TypeError(label + " must contain a JSON object");
    }
  }
  if (!isObject(fixture.presentation)) throw new TypeError("presentation must be a JSON object");
  if (!Array.isArray(fixture.executables) || fixture.executables.length !== SUBSYSTEMS.length) {
    throw new TypeError("PokeMan must provide exactly five subsystem executables");
  }
  const expectedModules = SUBSYSTEMS.map((name) => `subsystems/${name}.mjs`);
  for (const [index, entry] of fixture.executables.entries()) {
    if (entry.logicalModule !== expectedModules[index] || entry.mime !== "text/javascript") {
      throw new TypeError("PokeMan executable order or identity is invalid at index " + index);
    }
    if (typeof entry.source !== "string" || entry.source.length === 0) {
      throw new TypeError("PokeMan executable source is missing at index " + index);
    }
    if (entry.contentVersion !== "sha256:" + sha256(entry.source)) {
      throw new TypeError("PokeMan executable contentVersion does not match its bundled source");
    }
    if (/\bfrom\s*["']@loomrealm(?:-game)?\//u.test(entry.source)
      || /\bimport\s*\(\s*[^"']/u.test(entry.source)) {
      throw new TypeError("PokeMan executable is not self-contained: " + entry.logicalModule);
    }
  }
  if (!Array.isArray(fixture.content)) throw new TypeError("content must be an array");
  for (const [index, entry] of fixture.content.entries()) {
    if (!isObject(entry) || !["record", "group", "resource"].includes(entry.kind)
      || typeof entry.namespace !== "string" || typeof entry.key !== "string"
      || typeof entry.mime !== "string" || entry.encoding !== "base64"
      || typeof entry.body !== "string"
      || Buffer.from(entry.body, "base64").toString("base64") !== entry.body) {
      throw new TypeError("PokeMan Content entry is invalid at index " + index);
    }
  }
}

export async function buildPokeManInstallationBundle({
  gameRoot = root,
  frameworkRoot = join(gameRoot, "loom-realm"),
  outputFile,
  verifyGitlink = true,
  buildExecutable = build,
  fixtureFactory = createPokeManPwaFixture,
} = {}) {
  const game = resolve(gameRoot);
  const framework = resolve(frameworkRoot);
  if (typeof outputFile !== "string" || outputFile.length === 0) {
    throw new TypeError("outputFile is required");
  }
  const frameworkSha = verifyGitlink ? assertPinnedFramework(game, framework) : null;
  const gameSha = verifyGitlink ? git(game, "rev-parse", "HEAD") : null;
  const temporaryRoot = await mkdtemp(join(tmpdir(), "pokeman-pwa-executables-"));
  try {
    const executablePaths = {};
    for (const name of SUBSYSTEMS) {
      const entryPoint = join(game, "subsystems", name + ".mjs");
      const outfile = join(temporaryRoot, name + ".mjs");
      await buildExecutable({
        absWorkingDir: game,
        entryPoints: [entryPoint],
        outfile,
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "chrome140",
        sourcemap: false,
      });
      executablePaths[name] = outfile;
    }
    const fixture = await fixtureFactory({
      exampleRoot: game,
      fsdbRoot: join(game, "[FSDB]PokeMan"),
      executablePaths: Object.freeze(executablePaths),
    });
    validateFixture(fixture);
    const payload = Object.freeze({ ...fixture, formatVersion: 1 });
    const destination = resolve(outputFile);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, JSON.stringify(payload) + "\n", "utf8");
    return Object.freeze({
      gameSha,
      frameworkSha,
      outputFile: destination,
      executableCount: payload.executables.length,
      contentCount: payload.content.length,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function parseOutput(args) {
  if (args.length !== 2 || args[0] !== "--output" || args[1].length === 0 || args[1].startsWith("--")) {
    throw new Error("Usage: node scripts/pwa/build-installation-bundle.mjs --output <absolute-or-relative-json-path>");
  }
  return resolve(args[1]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await buildPokeManInstallationBundle({ outputFile: parseOutput(process.argv.slice(2)) });
  console.log("Prepared PokeMan installation-bundle v1 from canonical product sources");
  console.log(JSON.stringify(result));
}
