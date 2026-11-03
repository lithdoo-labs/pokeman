import { build } from "esbuild";

await build({
  entryPoints: ["browser/schema-form.browser.ts"],
  outfile: "dist/browser/schema-form.browser.js",
  bundle: true,
  splitting: false,
  platform: "browser",
  format: "iife",
  target: ["es2022"],
  banner: {
    js: `for (const tag of ["lr-schema-form", "lr-schema-form-field", "wa-input", "wa-icon", "wa-textarea", "wa-checkbox", "wa-select", "wa-tag", "wa-option", "wa-popup", "wa-button", "wa-spinner", "wa-dialog"]) { if (customElements.get(tag) !== undefined) throw new TypeError("Schema Form browser element collision: " + tag); }`,
  },
  logLevel: "info",
});

await build({
  entryPoints: ["browser/schema-form.browser.css"],
  outfile: "dist/browser/schema-form.browser.css",
  bundle: true,
  platform: "browser",
  logLevel: "info",
});
