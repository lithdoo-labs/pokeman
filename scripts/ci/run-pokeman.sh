#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable npm

(
  cd loom-realm
  npm ci --no-audit --no-fund
  npm run build \
    -w @loomrealm/fsdb \
    -w @loomrealm/foundation \
    -w @loomrealm/wire \
    -w @loomrealm/shared-state \
    -w @loomrealm/session-events \
    -w @loomrealm/game-package \
    -w @loomrealm/platform-ports \
    -w @loomrealm/runtime-control \
    -w @loomrealm/renderer-control \
    -w @loomrealm/data \
    -w @loomrealm/subsystem \
    -w @loomrealm/renderer \
    -w @loomrealm/main \
    -w @loomrealm/game-launcher-pwa
)

mkdir -p node_modules/@loomrealm-game
ln -sfn ../loom-realm/node_modules/@loomrealm node_modules/@loomrealm
ln -sfn ../../game-libs/battle node_modules/@loomrealm-game/battle
ln -sfn ../../game-libs/game-common-controls node_modules/@loomrealm-game/common-controls
ln -sfn ../../game-libs/map node_modules/@loomrealm-game/map
ln -sfn ../../game-libs/rpg-dialogue node_modules/@loomrealm-game/rpg-dialogue
ln -sfn ../../game-libs/schema-form node_modules/@loomrealm-game/schema-form
ln -sfn ../../game-libs/tile-presentation node_modules/@loomrealm-game/tile-presentation

link_dependency() {
  local name="$1"
  if [ ! -e "loom-realm/node_modules/$name" ]; then
    echo "Missing loom-realm dependency: $name" >&2
    exit 1
  fi
  ln -sfn "../loom-realm/node_modules/$name" "node_modules/$name"
}

link_dependency playwright
link_dependency esbuild
link_dependency typescript
link_dependency lit
link_dependency @awesome.me

export PATH="$root/loom-realm/node_modules/.bin:$PATH"
for package in tile-presentation game-common-controls map schema-form rpg-dialogue battle; do
  (cd "game-libs/$package" && npm run build)
done

npx --prefix "$root/loom-realm" playwright install --with-deps chromium
export LOOMREALM_CHROMIUM_PATH="$(node --input-type=module -e 'import { chromium } from "playwright"; process.stdout.write(chromium.executablePath())')"
test -x "$LOOMREALM_CHROMIUM_PATH"

node --test --test-concurrency=1 test/*.test.mjs
node --test --test-concurrency=1 game-libs/map/test/*.test.mjs
