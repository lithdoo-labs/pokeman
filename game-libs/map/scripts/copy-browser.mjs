import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/browser/", import.meta.url), { recursive: true });
await Promise.all([
  cp(new URL("../browser/map.browser.js", import.meta.url), new URL("../dist/browser/map.browser.js", import.meta.url)),
  cp(new URL("../browser/map.css", import.meta.url), new URL("../dist/browser/map.css", import.meta.url)),
]);
