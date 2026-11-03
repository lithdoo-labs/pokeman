import { copyFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";

const tags = [
  "lr-dialogue-view",
  "lr-dialogue-characters",
  "lr-dialogue-character",
  "lr-dialogue-conversation",
  "lr-dialogue-text",
  "lr-dialogue-choices",
  "lr-dialogue-choice",
  "lr-dialogue-controls",
  "lr-dialogue-control-hint",
  "lr-dialogue-history",
  "lr-dialogue-history-entry",
];

await mkdir(new URL("../dist/browser/", import.meta.url), { recursive: true });

await build({
  entryPoints: ["browser/rpg-dialogue.browser.ts"],
  outfile: "dist/browser/rpg-dialogue.browser.js",
  bundle: true,
  splitting: false,
  platform: "browser",
  format: "iife",
  target: ["es2022"],
  banner: {
    js: `for (const tag of ${JSON.stringify(tags)}) { if (customElements.get(tag) !== undefined) throw new TypeError("RPG Dialogue browser element collision: " + tag); }`,
  },
  logLevel: "info",
});

await copyFile(
  new URL("../browser/rpg-dialogue.browser.css", import.meta.url),
  new URL("../dist/browser/rpg-dialogue.browser.css", import.meta.url),
);
