#!/usr/bin/env bash
# Source from run-pokeman.sh only for tests that require a real Chromium.
# The pinned GitHub-hosted Ubuntu image already provides system libraries.
# Installing OS packages per job caused 6–8 minute Ubuntu mirror stalls.
set -euo pipefail

if [ -z "${LOOMREALM_CHROMIUM_PATH:-}" ] || [ ! -x "$LOOMREALM_CHROMIUM_PATH" ]; then
  (cd "$root/loom-realm" && npx --no-install playwright install chromium)
  export LOOMREALM_CHROMIUM_PATH="$(cd "$root/loom-realm" && node --input-type=module -e 'import { chromium } from "playwright"; process.stdout.write(chromium.executablePath())')"
fi
test -x "$LOOMREALM_CHROMIUM_PATH"
# Fail if the pinned runner image no longer contains required Chromium libraries.
(cd "$root/loom-realm" && node --input-type=module -e 'import { chromium } from "playwright"; const browser = await chromium.launch({ headless: true, executablePath: process.env.LOOMREALM_CHROMIUM_PATH }); await browser.close();')
