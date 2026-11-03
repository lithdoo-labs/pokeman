import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const framework = path.join(projectRoot, "loom-realm");
const workspace = path.resolve(projectRoot, "..");
const qualificationHostra = path.join(framework, ".qualification", "hostra");
const siblingHostra = path.join(workspace, "hostra");
const defaultHostra = existsSync(path.join(qualificationHostra, "packages", "hostra", "scripts", "hostra.js"))
  ? qualificationHostra
  : siblingHostra;
const hostraRoot = process.env.HOSTRA_SOURCE_DIR ? path.resolve(process.env.HOSTRA_SOURCE_DIR) : defaultHostra;
const hostraScript = path.join(hostraRoot, "packages", "hostra", "scripts", "hostra.js");
const desktopEntry = path.join(framework, "apps", "desktop", "dist", "main-entry.js");
const runnerEntry = path.join(framework, "packages", "game-launcher-hostra", "dist", "runner", "entry.js");
const pokemanRoot = projectRoot;
const hostraStackReady = existsSync(hostraScript) && existsSync(desktopEntry) && existsSync(runnerEntry);
const pokemanBase = path.join(pokemanRoot, "subsystems", "base.mjs");
const deepSeekEndpoint = "https://api.deepseek.com/models";

function waitFor(check, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        if (await check()) {
          resolve();
          return;
        }
      } catch {}
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      setTimeout(poll, 25);
    };
    void poll();
  });
}

function childExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForChildExit(child, timeoutMs) {
  if (childExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(childExited(child)), timeoutMs);
    child.once("exit", onExit);
  });
}

async function terminateChild(child) {
  if (childExited(child)) return;
  child.kill("SIGTERM");
  if (await waitForChildExit(child, 3_000)) return;
  child.kill("SIGKILL");
  if (!await waitForChildExit(child, 3_000)) {
    throw new Error(`Child process ${child.pid ?? "unknown"} did not terminate`);
  }
}

async function rmBusy(target) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (cause) {
      if (cause && (cause.code === "EBUSY" || cause.code === "EPERM") && attempt < 11) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      }
      throw cause;
    }
  }
}

function launchHostra(userData) {
  const environment = {
    ...process.env,
    HOSTRA_RPC_PORT: "0",
    HOSTRA_RPC_TOKEN: `pokeman-qualification-${randomUUID()}`,
    HOSTRA_CDP_PORT: "0",
    HOSTRA_CONFIG_DIR: framework,
    HOSTRA_USER_DATA_DIR: userData,
    HOSTRA_SUBCMD: `"${process.execPath}" --inspect=0 "${desktopEntry}"`,
    HOSTRA_APP_NAME: "PokeMan DeepSeek qualification",
    LOOMREALM_DESKTOP_INSTALLATION_ROOT: pokemanRoot,
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, [hostraScript], {
    cwd: framework,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const consume = (chunk) => {
    output += chunk.toString();
    for (const line of output.split(/\r?\n/u)) {
      const match = /^\[hostra:event\] (\{.*\})$/u.exec(line);
      if (!match) continue;
      try {
        const value = JSON.parse(match[1]);
        if (value.type === "hostra.ready") readyResolve(value);
      } catch {}
    }
  };
  child.stdout.on("data", consume);
  child.stderr.on("data", consume);
  child.once("error", readyReject);
  child.once("exit", (code, signal) => {
    readyReject(new Error(`Hostra exited before ready (${code ?? signal})`));
  });
  return { child, ready, output: () => output };
}

async function createProbeObserver() {
  const observations = [];
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/probe") {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4_096) request.destroy();
    });
    request.on("end", () => {
      try {
        const value = JSON.parse(body);
        observations.push(Object.freeze({
          attempt: value.attempt,
          status: value.status,
          authorizationPresent: value.authorizationPresent,
          baseModuleMatches: value.baseModuleMatches,
          method: value.method,
        }));
        response.writeHead(204).end();
      } catch {
        response.writeHead(400).end();
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  return {
    observations,
    url: `http://127.0.0.1:${address.port}/probe`,
    waitForCount(count, timeout = 30_000) {
      return waitFor(() => observations.length >= count, `${count} DeepSeek probe observation(s)`, timeout);
    },
    close() {
      return new Promise((resolve, reject) => server.close((cause) => cause ? reject(cause) : resolve()));
    },
  };
}

function runnerPreloadSource({ mode, observerUrl }) {
  const settings = JSON.stringify({
    mode,
    observerUrl,
    endpoint: deepSeekEndpoint,
    expectedBase: pokemanBase.replaceAll("\\", "/").toLowerCase(),
  });
  return `const settings = Object.freeze(${settings});
const encoded = process.env.LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP;
let bootstrap;
try { bootstrap = JSON.parse(encoded ?? ""); } catch {}
if (bootstrap?.subsystemKey === "base") {
  const originalFetch = globalThis.fetch.bind(globalThis);
  let attempt = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    if (url !== settings.endpoint) return originalFetch(input, init);
    attempt += 1;
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const method = String(init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let providerResponse;
    if (settings.mode === "deterministic") {
      providerResponse = attempt === 1
        ? new Response(JSON.stringify({ error: { message: "synthetic unauthorized" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
        : new Response(JSON.stringify({
          object: "list",
          data: [{ id: "deepseek-flash", object: "model", owned_by: "deepseek" }],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
    } else {
      providerResponse = await originalFetch(input, init);
    }
    try {
      await originalFetch(settings.observerUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attempt,
          status: providerResponse.status,
          authorizationPresent: headers.has("authorization"),
          baseModuleMatches: String(bootstrap.physicalModule).replaceAll("\\\\", "/").toLowerCase() === settings.expectedBase,
          method,
        }),
      });
    } catch {}
    return providerResponse;
  };
}
`;
}

async function installRunnerPreload(settings) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "loomrealm-pokeman-hostra-preload-"));
  const preloadPath = path.join(temporary, "preload.mjs");
  const original = await readFile(runnerEntry);
  await writeFile(preloadPath, runnerPreloadSource(settings));
  const importLine = `import ${JSON.stringify(pathToFileURL(preloadPath).href)};\n`;
  await writeFile(runnerEntry, Buffer.concat([Buffer.from(importLine), original]));
  let restored = false;
  return async () => {
    if (restored) return;
    restored = true;
    await writeFile(runnerEntry, original);
    await rmBusy(temporary);
  };
}

async function openPokeManWindow(ready) {
  const browser = await chromium.connectOverCDP(ready.data.cdpEndpoint);
  const context = browser.contexts()[0];
  await waitFor(
    () => context.pages().some((candidate) => /\/_lr\/window\//u.test(candidate.url())),
    "PokeMan Hostra Window",
  );
  const page = context.pages().find((candidate) => /\/_lr\/window\//u.test(candidate.url()));
  assert.ok(page);
  await page.waitForFunction(
    () => document.documentElement.dataset.loomrealmRenderer === "installed",
    null,
    { timeout: 30_000 },
  );
  return { browser, page };
}

async function waitForGate(page) {
  await page.locator("lr-schema-form").waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector("lr-schema-form-field")
    ?.shadowRoot?.querySelector("wa-input") !== null, null, { timeout: 30_000 });
}

async function assertSchemaFormPresentation(page) {
  const presentation = await page.evaluate(() => {
    let schemaCssAvailable = false;
    for (const sheet of document.styleSheets) {
      try {
        schemaCssAvailable ||= [...sheet.cssRules].some((rule) => rule.cssText.includes("lr-schema-form"));
      } catch {}
    }
    return {
      rootDefined: customElements.get("lr-schema-form") !== undefined,
      fieldDefined: customElements.get("lr-schema-form-field") !== undefined,
      schemaCssAvailable,
      loadedStyles: [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter((element) => element.href.startsWith("blob:")).length,
      loadedScripts: [...document.querySelectorAll("script[src]")]
        .filter((element) => element.src.startsWith("blob:")).length,
    };
  });
  assert.deepEqual(presentation, {
    rootDefined: true,
    fieldDefined: true,
    schemaCssAvailable: true,
    loadedStyles: 6,
    loadedScripts: 6,
  });
}

async function assertGateClosed(page) {
  assert.equal(await page.locator("lr-schema-form").count(), 1);
  assert.equal(await page.locator("game-controls-input").count(), 0);
  assert.equal(await page.locator("lr-map-view").count(), 0);
}

async function editDeepSeekDraft(page, value) {
  await page.evaluate((next) => {
    const input = document.querySelector("lr-schema-form-field")?.shadowRoot?.querySelector("wa-input");
    if (input === null || input === undefined) throw new Error("DeepSeek Schema Form input is unavailable");
    input.value = next;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
  }, value);
}

async function submitDeepSeekForm(page) {
  await page.evaluate(() => {
    const form = document.querySelector("lr-schema-form");
    if (form === null) throw new Error("DeepSeek Schema Form is unavailable");
    form.submit();
  });
}

async function runHostraQualification(mode, body) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "loomrealm-pokeman-hostra-"));
  const observer = await createProbeObserver();
  const restoreRunner = await installRunnerPreload({ mode, observerUrl: observer.url });
  const hostra = launchHostra(path.join(temporary, "user-data"));
  let browser = null;
  try {
    const ready = await hostra.ready;
    const opened = await openPokeManWindow(ready);
    browser = opened.browser;
    await body({ page: opened.page, observer });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.stack ?? cause.message : String(cause);
    throw new Error(`${detail}\nHostra diagnostics:\n${hostra.output()}`, { cause });
  } finally {
    try {
      await browser?.close().catch(() => {});
      await terminateChild(hostra.child);
    } finally {
      try {
        await restoreRunner();
      } finally {
        try {
          await observer.close();
        } finally {
          await rmBusy(temporary);
        }
      }
    }
  }
}

test("real Hostra runs the actual PokeMan Gate before Map and controls", {
  timeout: 120_000,
  skip: hostraStackReady ? false : "frozen Hostra and the built LoomRealm desktop runner are not present",
}, async () => {
  const launchManifest = JSON.parse(await readFile(path.join(pokemanRoot, "launch.hostra.json"), "utf8"));
  assert.deepEqual(launchManifest.subsystems.map(({ key, module }) => ({ key, module })), [
    { key: "base", module: "subsystems/base.mjs" },
    { key: "map", module: "subsystems/map.mjs" },
    { key: "dialogue", module: "subsystems/dialogue.mjs" },
    { key: "battle", module: "subsystems/battle.mjs" },
    { key: "message", module: "subsystems/message.mjs" },
  ]);

  await runHostraQualification("deterministic", async ({ page, observer }) => {
    const rejectedCandidate = `synthetic-rejected-${randomUUID()}`;
    const acceptedCandidate = `synthetic-accepted-${randomUUID()}`;
    await waitForGate(page);
    await assertSchemaFormPresentation(page);
    await assertGateClosed(page);

    await editDeepSeekDraft(page, rejectedCandidate);
    await submitDeepSeekForm(page);
    await observer.waitForCount(1);
    await page.waitForFunction(() => document.querySelector("lr-schema-form-field")
      ?.shadowRoot?.querySelector(".error")?.textContent?.includes("API Key 无效"), null, { timeout: 30_000 });
    await assertGateClosed(page);

    await page.evaluate(() => {
      window.__pokemanGateTransitions = [];
      const capture = () => window.__pokemanGateTransitions.push({
        form: document.querySelectorAll("lr-schema-form").length,
        controls: document.querySelectorAll("game-controls-input").length,
        map: document.querySelectorAll("lr-map-view").length,
      });
      capture();
      new MutationObserver(capture).observe(document.documentElement, { childList: true, subtree: true });
    });
    await editDeepSeekDraft(page, acceptedCandidate);
    await submitDeepSeekForm(page);
    await observer.waitForCount(2);
    await page.locator("lr-schema-form").waitFor({ state: "detached", timeout: 30_000 });
    await page.locator("lr-map-view").waitFor({ state: "attached", timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("game-controls-input").length === 1, null, { timeout: 30_000 });

    assert.deepEqual(observer.observations, [
      { attempt: 1, status: 401, authorizationPresent: true, baseModuleMatches: true, method: "GET" },
      { attempt: 2, status: 200, authorizationPresent: true, baseModuleMatches: true, method: "GET" },
    ]);
    assert.equal(await page.locator("lr-schema-form").count(), 0);
    assert.equal(await page.locator("game-controls-input").count(), 1);
    assert.equal(await page.locator("lr-map-view").count(), 1);
    const transitions = await page.evaluate(() => window.__pokemanGateTransitions);
    assert.deepEqual(transitions[0], { form: 1, controls: 0, map: 0 });
    assert.equal(transitions.some((entry) => entry.form > 0 && (entry.controls > 0 || entry.map > 0)), false);
    assert.equal(transitions.some((entry) => entry.form === 0 && entry.controls === 1 && entry.map === 1), true);
  });
});

test("real Hostra Base Runner observes DeepSeek 401 over direct HTTPS", {
  timeout: 120_000,
  skip: process.env.LOOMREALM_DEEPSEEK_HOSTRA_QUALIFICATION !== "1"
    ? "set LOOMREALM_DEEPSEEK_HOSTRA_QUALIFICATION=1 to run the direct HTTPS check"
    : hostraStackReady ? false : "frozen Hostra and the built LoomRealm desktop runner are not present",
}, async () => {
  await runHostraQualification("real", async ({ page, observer }) => {
    const syntheticInvalidKey = `synthetic-invalid-${randomUUID()}`;
    await waitForGate(page);
    await assertSchemaFormPresentation(page);
    await assertGateClosed(page);
    await editDeepSeekDraft(page, syntheticInvalidKey);
    await submitDeepSeekForm(page);
    await observer.waitForCount(1, 45_000);
    assert.deepEqual(observer.observations, [
      { attempt: 1, status: 401, authorizationPresent: true, baseModuleMatches: true, method: "GET" },
    ]);
    await page.waitForFunction(() => document.querySelector("lr-schema-form-field")
      ?.shadowRoot?.querySelector(".error")?.textContent?.includes("API Key 无效"), null, { timeout: 30_000 });
    await assertGateClosed(page);
  });
});
