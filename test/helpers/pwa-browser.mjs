import { chromium } from "playwright";

export const productUrl = process.env.LOOMREALM_PWA_URL;
if (!productUrl) throw new Error("LOOMREALM_PWA_URL is required");

export async function openProduct(options = {}) {
  const browser = await chromium.launch({ headless: true });
  const { beforeGoto, ...contextOptions } = options;
  const context = await browser.newContext({ serviceWorkers: "allow", ...contextOptions });
  const page = await context.newPage();
  const diagnostics = [];
  page.on("console", (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on("pageerror", (error) => diagnostics.push(`pageerror:${error.stack ?? error.message}`));
  if (beforeGoto !== undefined) await beforeGoto({ context, page });
  await page.goto(productUrl, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => document.documentElement.dataset.loomrealmProduct === "ready" || document.documentElement.dataset.loomrealmProduct === "failed", null, { timeout: 30_000 });
    const failure = await page.evaluate(() => window.__loomrealmPwa.failure);
    if (failure) throw new Error(`PWA product failed: ${failure}`);
  } catch (cause) {
    await browser.close();
    throw new Error(`${cause instanceof Error ? cause.message : String(cause)}\n${diagnostics.join("\n")}`);
  }
  return { browser, context, page, diagnostics, async close() { await browser.close(); } };
}

export async function waitForDemo(page) {
  try {
    await page.locator("#loomrealm-demo").waitFor({ state: "attached", timeout: 20_000 });
    await page.waitForFunction(() => document.documentElement.dataset.loomrealmRenderer === "installed", null, { timeout: 20_000 });
  } catch (cause) {
    const snapshot = await page.evaluate(() => ({ state: window.__loomrealmPwa, dataset: { ...document.documentElement.dataset }, body: document.body.innerHTML }));
    throw new Error(`${cause instanceof Error ? cause.message : String(cause)}\n${JSON.stringify(snapshot, null, 2)}`);
  }
}
