import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/browser/", import.meta.url), { recursive: true });
await Promise.all([
  cp(new URL("../browser/battle.browser.js", import.meta.url), new URL("../dist/browser/battle.browser.js", import.meta.url)),
  cp(new URL("../browser/battle.css", import.meta.url), new URL("../dist/browser/battle.css", import.meta.url)),
]);
