import { build } from "esbuild";

await build({
  entryPoints: ["browser/device-input.browser.ts"],
  outfile: "dist/browser/device-input.browser.js",
  bundle: true,
  splitting: false,
  platform: "browser",
  format: "iife",
  target: ["es2022"],
  banner: {
    js: `for (const tag of ["game-keyboard-input", "game-pointer-input", "game-gamepad-input", "game-controls-input"]) { if (customElements.get(tag) !== undefined) throw new TypeError("Game Common Controls element collision: " + tag); }`,
  },
  logLevel: "info",
});
