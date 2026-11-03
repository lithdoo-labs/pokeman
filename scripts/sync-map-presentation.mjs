#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BACKUP_SUFFIX = ".loomrealm-sync.backup";
const TARGET_RELATIVE = Object.freeze({
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
const DIST_RELATIVE = Object.freeze({
  schemaFormJs: join("game-libs", "schema-form", "dist", "browser", "schema-form.browser.js"),
  schemaFormCss: join("game-libs", "schema-form", "dist", "browser", "schema-form.browser.css"),
  controlsJs: join("game-libs", "game-common-controls", "dist", "browser", "device-input.browser.js"),
  js: join("game-libs", "map", "dist", "browser", "map.browser.js"),
  css: join("game-libs", "map", "dist", "browser", "map.css"),
  battleJs: join("game-libs", "battle", "dist", "browser", "battle.browser.js"),
  battleCss: join("game-libs", "battle", "dist", "browser", "battle.css"),
});
const GAME_LIB_SOURCE_RELATIVE = Object.freeze({
  schemaFormJs: join("game-libs", "schema-form", "dist", "browser", "schema-form.browser.js"),
  schemaFormCss: join("game-libs", "schema-form", "dist", "browser", "schema-form.browser.css"),
  controlsJs: join("game-libs", "game-common-controls", "dist", "browser", "device-input.browser.js"),
  js: join("game-libs", "map", "browser", "map.browser.js"),
  css: join("game-libs", "map", "browser", "map.css"),
  battleJs: join("game-libs", "battle", "dist", "browser", "battle.browser.js"),
  battleCss: join("game-libs", "battle", "dist", "browser", "battle.css"),
});
const PRODUCT_SOURCE_RELATIVE = Object.freeze({
  dialogueJs: join("presentation", "dialogue.browser.js"),
  dialogueCss: join("presentation", "dialogue.css"),
  messageJs: join("presentation", "message.browser.js"),
  messageCss: join("presentation", "message.css"),
  pageCss: "presentation.css",
});
const RESOURCE_LABELS = Object.freeze({
  schemaFormJs: "Schema Form browser JS",
  schemaFormCss: "Schema Form browser CSS",
  controlsJs: "device input browser JS",
  js: "map browser JS",
  css: "map CSS",
  dialogueJs: "dialogue browser JS",
  dialogueCss: "dialogue CSS",
  battleJs: "battle browser JS",
  battleCss: "battle CSS",
  messageJs: "message browser JS",
  messageCss: "message CSS",
  pageCss: "page CSS",
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function defaultFileOps() {
  return {
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    rename: fs.rename,
    unlink: fs.unlink,
    readdir: fs.readdir,
    lstat: fs.lstat,
    mkdir: fs.mkdir,
    open: fs.open,
  };
}

function fail(phase, details, cause) {
  const resourceLines = Object.keys(RESOURCE_LABELS).flatMap((key) => {
    const resource = details.resources[key];
    return [
      `source ${RESOURCE_LABELS[key]}: ${resource.source}`,
      `dist ${RESOURCE_LABELS[key]}: ${resource.dist ?? "(source is authoritative)"}`,
      `target ${RESOURCE_LABELS[key]}: ${resource.target ?? "(unresolved)"}`,
      `expected ${RESOURCE_LABELS[key]} SHA-256: ${resource.expected ?? "(uncomputed)"}`,
      `actual ${RESOURCE_LABELS[key]} SHA-256: ${resource.actual ?? "(uncomputed)"}`,
    ];
  });
  const error = new Error([
    `Map presentation sync failed during ${phase}`,
    `repo: ${details.repoRoot}`,
    `example: ${details.exampleRoot}`,
    `FSDB: ${details.fsdbRoot ?? "(unresolved)"}`,
    ...resourceLines,
    `retry: node "${join(details.exampleRoot, "scripts", "sync-map-presentation.mjs")}"`,
    cause instanceof Error ? cause.message : cause ? String(cause) : "",
  ].filter(Boolean).join("\n"));
  error.cause = cause;
  throw error;
}

async function exists(fileOps, path) {
  try {
    await fileOps.lstat(path);
    return true;
  } catch (cause) {
    if (cause && cause.code === "ENOENT") return false;
    throw cause;
  }
}

async function runNpmBuild(repoRoot) {
  const commands = Object.freeze([
    Object.freeze({ args: Object.freeze(["run", "build:m15"]), label: "npm run build:m15" }),
    Object.freeze({
      args: Object.freeze(["run", "build", "-w", "@loomrealm-game/schema-form"]),
      label: "Schema Form browser build",
    }),
    Object.freeze({
      args: Object.freeze(["run", "build", "-w", "@loomrealm-game/battle"]),
      label: "Battle browser build",
    }),
  ]);
  for (const command of commands) {
    await new Promise((resolvePromise, reject) => {
      const windows = process.platform === "win32";
      const executable = windows ? process.env.ComSpec ?? "cmd.exe" : "npm";
      const args = windows
        ? ["/d", "/s", "/c", `npm.cmd ${command.args.join(" ")}`]
        : command.args;
      const child = spawn(executable, args, {
        cwd: repoRoot,
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) resolvePromise();
        else reject(new Error(`${command.label} failed (${code ?? signal})`));
      });
    });
  }
}

async function discoverFsdb(exampleRoot, fileOps) {
  const entries = await fileOps.readdir(exampleRoot, { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    if (!entry.name.startsWith("[FSDB]")) continue;
    const full = join(exampleRoot, entry.name);
    const stat = await fileOps.lstat(full);
    if (stat.isSymbolicLink()) throw new Error("FSDB path must not be a symlink");
    if (!stat.isDirectory()) continue;
    matches.push(full);
  }
  if (matches.length !== 1) {
    throw new Error(`example root must contain exactly one [FSDB]* directory, found ${matches.length}`);
  }
  const presentation = join(matches[0], "[resource]Presentation");
  const presentationStat = await fileOps.lstat(presentation).catch((cause) => {
    throw new Error(`missing [resource]Presentation: ${cause instanceof Error ? cause.message : String(cause)}`);
  });
  if (presentationStat.isSymbolicLink() || !presentationStat.isDirectory()) {
    throw new Error("[resource]Presentation must be a regular directory");
  }
  return matches[0];
}

async function readRegularFile(fileOps, path, label) {
  const stat = await fileOps.lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
  return fileOps.readFile(path);
}

async function writeStaging(fileOps, path, bytes) {
  const handle = await fileOps.open(path, "w");
  try {
    await handle.write(bytes);
    if (typeof handle.sync === "function") await handle.sync();
  } finally {
    await handle.close();
  }
}

async function restoreBackup(fileOps, target) {
  const backup = `${target}${BACKUP_SUFFIX}`;
  if (!await exists(fileOps, backup)) return;
  if (await exists(fileOps, target)) await fileOps.unlink(target);
  await fileOps.rename(backup, target);
}

async function removeStaleStaging(fileOps, directory) {
  let entries = [];
  try {
    entries = await fileOps.readdir(directory);
  } catch (cause) {
    if (cause && cause.code === "ENOENT") return;
    throw cause;
  }
  await Promise.all(entries.filter((name) => name.includes(".loomrealm-sync.") && name.endsWith(".tmp")).map((name) =>
    fileOps.unlink(join(directory, name)).catch(() => undefined)));
}

async function replaceSet(fileOps, targets, staging, verify) {
  const backups = targets.map((target) => `${target}${BACKUP_SUFFIX}`);
  const hadTargets = await Promise.all(targets.map((target) => exists(fileOps, target)));
  try {
    for (const [index, target] of targets.entries()) {
      if (hadTargets[index]) await fileOps.rename(target, backups[index]);
      await fileOps.rename(staging[index], target);
    }
    await verify();
  } catch (cause) {
    for (const [index, target] of targets.entries()) {
      try {
        if (hadTargets[index]) await restoreBackup(fileOps, target);
        else if (await exists(fileOps, target)) await fileOps.unlink(target);
      } catch { /* keep attempting the set */ }
      try { await fileOps.unlink(staging[index]); } catch { /* staging may already be gone */ }
    }
    throw cause;
  }
  for (const backup of backups) {
    try { await fileOps.unlink(backup); } catch { /* backup already consumed */ }
  }
}

export async function syncMapPresentation({
  repoRoot,
  exampleRoot,
  runBuild = true,
  checkOnly = false,
  fileOps = defaultFileOps(),
} = {}) {
  const details = {
    repoRoot,
    exampleRoot,
    fsdbRoot: undefined,
    resources: Object.fromEntries(Object.keys(RESOURCE_LABELS).map((key) => [key, {
      source: PRODUCT_SOURCE_RELATIVE[key]
        ? join(exampleRoot, PRODUCT_SOURCE_RELATIVE[key])
        : join(repoRoot, GAME_LIB_SOURCE_RELATIVE[key]),
      dist: DIST_RELATIVE[key] ? join(repoRoot, DIST_RELATIVE[key]) : undefined,
      target: undefined,
      expected: undefined,
      actual: undefined,
    }])),
  };
  try {
    if (runBuild) await runNpmBuild(repoRoot);
    const fsdbRoot = await discoverFsdb(exampleRoot, fileOps);
    details.fsdbRoot = fsdbRoot;
    const keys = Object.keys(RESOURCE_LABELS);
    const targets = keys.map((key) => join(fsdbRoot, TARGET_RELATIVE[key]));
    for (const [index, key] of keys.entries()) details.resources[key].target = targets[index];
    if (!checkOnly) {
      for (const target of targets) await restoreBackup(fileOps, target);
      for (const directory of new Set(targets.map(dirname))) {
        await fileOps.mkdir(directory, { recursive: true });
        await removeStaleStaging(fileOps, directory);
      }
    }

    const expectedBytes = [];
    for (const key of keys) {
      const resource = details.resources[key];
      const source = await readRegularFile(fileOps, resource.source, `${RESOURCE_LABELS[key]} source`);
      if (resource.dist === undefined) {
        expectedBytes.push(source);
        resource.expected = sha256(source);
        continue;
      }
      const dist = await readRegularFile(fileOps, resource.dist, `${RESOURCE_LABELS[key]} dist`);
      expectedBytes.push(dist);
      resource.expected = sha256(dist);
      resource.actual = sha256(source);
      if (resource.actual !== resource.expected) fail(`source/dist hash (${RESOURCE_LABELS[key]})`, details);
    }

    for (const [index, key] of keys.entries()) {
      if (!await exists(fileOps, targets[index])) {
        if (checkOnly) await readRegularFile(fileOps, targets[index], `FSDB ${RESOURCE_LABELS[key]}`);
        details.resources[key].actual = undefined;
        continue;
      }
      const bytes = await readRegularFile(fileOps, targets[index], `FSDB ${RESOURCE_LABELS[key]}`);
      details.resources[key].actual = sha256(bytes);
    }
    const mismatched = keys.filter((key) => details.resources[key].actual !== details.resources[key].expected);
    if (checkOnly && mismatched.length > 0) {
      fail(`FSDB hash (${mismatched.map((key) => RESOURCE_LABELS[key]).join(", ")})`, details);
    }
    if (checkOnly || mismatched.length === 0) return;

    const staging = targets.map((target) => `${target}.loomrealm-sync.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
    try {
      for (const [index, path] of staging.entries()) await writeStaging(fileOps, path, expectedBytes[index]);
    } catch (cause) {
      for (const path of staging) {
        try { await fileOps.unlink(path); } catch { /* best-effort staging cleanup */ }
      }
      throw cause;
    }
    await replaceSet(fileOps, targets, staging, async () => {
      for (const [index, key] of keys.entries()) {
        const bytes = await readRegularFile(fileOps, targets[index], `FSDB ${RESOURCE_LABELS[key]}`);
        details.resources[key].actual = sha256(bytes);
        if (details.resources[key].actual !== details.resources[key].expected) {
          fail(`post-replace hash (${RESOURCE_LABELS[key]})`, details);
        }
      }
    });
  } catch (cause) {
    if (cause && cause.message?.startsWith("Map presentation sync failed")) throw cause;
    fail("discover/build/replace", details, cause);
  }
}

function parseArgs(argv) {
  if (argv.length === 0) return { checkOnly: false };
  if (argv.length === 1 && argv[0] === "--check") return { checkOnly: true };
  const error = new Error(`Unknown argument: ${argv.join(" ")}`);
  error.exitCode = 2;
  throw error;
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const exampleRoot = dirname(scriptDir);
  const repoRoot = exampleRoot;
  try {
    const { checkOnly } = parseArgs(process.argv.slice(2));
    await syncMapPresentation({ repoRoot, exampleRoot, runBuild: true, checkOnly });
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = cause && cause.exitCode === 2 ? 2 : 1;
  }
}

function isCliEntry() {
  try {
    return fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1] ?? "").toLowerCase();
  } catch {
    return false;
  }
}

if (isCliEntry()) {
  await main();
}
