#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

# Full remains the default for existing callers.
mode="${1:-full}"
scope="${2:-battle}"
usage() {
  cat <<'USAGE'
PokeMan verification:
  bash scripts/ci/run-pokeman.sh fast battle          # Battle unit tests
  bash scripts/ci/run-pokeman.sh fast battle-browser  # Battle Chromium tests
  bash scripts/ci/run-pokeman.sh fast map             # Map unit tests
  bash scripts/ci/run-pokeman.sh fast product         # Focused product integration
  bash scripts/ci/run-pokeman.sh full                 # Complete regression
  bash scripts/ci/run-pokeman.sh release              # PWA preparation and unit checks
Release workflow builds the PWA bundle and executes real staging Chromium E2E.
USAGE
}
case "$mode" in
  -h|--help|help) usage; exit 0 ;;
  fast)
    case "$scope" in battle|battle-browser|map|product) ;; *) echo "Invalid fast scope: $scope" >&2; usage >&2; exit 2 ;; esac
    if (( $# > 2 )); then usage >&2; exit 2; fi
    ;;
  full|release)
    if (( $# > 1 )); then usage >&2; exit 2; fi
    ;;
  *) echo "Invalid verification mode: $mode" >&2; usage >&2; exit 2 ;;
esac

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable npm

(
  cd loom-realm
  npm ci --no-audit --no-fund
  npm run build \
    -w @loomrealm/fsdb \
    -w @loomrealm/fsdb-http \
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

mkdir -p node_modules/@loomrealm-game node_modules/@pokeman
ln -sfn ../loom-realm/node_modules/@loomrealm node_modules/@loomrealm
ln -sfn ../../game-libs/battle node_modules/@pokeman/game-battle
ln -sfn ../../loom-realm/game-libs/game-common-controls node_modules/@loomrealm-game/common-controls
ln -sfn ../../game-libs/map node_modules/@pokeman/game-map
ln -sfn ../../loom-realm/game-libs/rpg-dialogue node_modules/@loomrealm-game/rpg-dialogue
ln -sfn ../../loom-realm/game-libs/schema-form node_modules/@loomrealm-game/schema-form
ln -sfn ../../game-libs/tile-presentation node_modules/@pokeman/tile-presentation

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
# Fast skips unrelated PokeMan packages and browser setup.
if [ "$mode" = "fast" ]; then
  case "$scope" in
    battle|battle-browser) package_builds=(tile-presentation battle) ;;
    map) package_builds=(tile-presentation map) ;;
    product) package_builds=(tile-presentation map battle) ;;
  esac
else
  for package in game-common-controls schema-form rpg-dialogue; do
    (cd "loom-realm/game-libs/$package" && npm run build)
  done
  package_builds=(tile-presentation map battle)
fi
for package in "${package_builds[@]}"; do
  (cd "game-libs/$package" && npm run build)
done

case "$mode" in
  fast)
    case "$scope" in
      battle)
        # Discover new Battle unit files; do not accidentally run browser E2E.
        mapfile -d '' -t tests < <(find game-libs/battle/test -maxdepth 1 -type f -name '*.test.mjs' ! -name '*browser*' -print0 | sort -z)
        if (( ${#tests[@]} == 0 )); then echo "No Battle unit tests found" >&2; exit 1; fi
        node --test --test-concurrency=1 "${tests[@]}"
        ;;
      battle-browser)
        source "$root/scripts/ci/setup-playwright.sh"
        mapfile -d '' -t tests < <(find game-libs/battle/test -maxdepth 1 -type f -name '*browser*.test.mjs' -print0 | sort -z)
        if (( ${#tests[@]} == 0 )); then echo "No Battle browser tests found" >&2; exit 1; fi
        node --test --test-concurrency=1 "${tests[@]}"
        ;;
      map) node --test --test-concurrency=1 game-libs/map/test/*.test.mjs ;;
      product)
        node --test --test-concurrency=1 \
          test/battle-integration.test.mjs \
          test/deepseek-config.test.mjs \
          test/presentation-sync.test.mjs
        ;;
    esac
    ;;
  full)
    source "$root/scripts/ci/setup-playwright.sh"
    node --test --test-concurrency=1 test/*.test.mjs
    node --test --test-concurrency=1 game-libs/map/test/*.test.mjs
    node --test --test-concurrency=1 "test/essentials-map/tools/fixtures/essentials-v21.1/*.test.mjs"
    node --test --test-concurrency=1 game-libs/battle/test/*.test.mjs
    ;;
  release)
    source "$root/scripts/ci/setup-playwright.sh"
    node --test --test-concurrency=1 scripts/pwa/test/*.test.mjs
    ;;
esac
