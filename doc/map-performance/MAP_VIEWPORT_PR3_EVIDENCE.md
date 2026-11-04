# Map Viewport PR3 — same-SHA closeout evidence

> 状态：**PR3 local Product gates PASS**；2026-09-17。Design contract remains [Map Docs Freeze](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md). PWA / M16 / M17 remain OUT OF SCOPE.

## 1. Identity

```text
Base:     947e9b3 Implement Map PR2 dynamic viewport, Essentials letterbox, and 720/1080 Chromium gates
Subject:  26fc25a Close Map dynamic viewport on Desktop with official Hostra 640/720/1080 P95
Branch:   feat/map-viewport-pr2
Node 24:  v24.19.0 (PATH)
Node 20:  v20.19.5 (.qualification/node-v20.19.5-win-x64/node.exe)
OS:       win32 10.0.26200
CPU:      AMD Ryzen AI 9 365 w/ Radeon 880M
Hostra:   .qualification/hostra @ d863beab (1.0.1-beta.1)
Clock:    same Browser Window performance.now(); input-captured.at → browser-first-motion-paint.at
Commands (Node 24):
  npm run test:m11                                                 → exit 0
  npm run test:m13                                                 → exit 0 (58889 ms)
  npm run build:m14 && m14 boundary/projection/vertical/pack
    + npm test -w @loomrealm-game/map                              → 59/59
    + npm test -w @loomrealm-example/essentials-v21.1              → 3/3
  npm run test:m15:desktop                                         → 14/14
  npm run docs:check-links                                         → 680 links / 114 files OK
  HOSTRA_SOURCE_DIR=.qualification/hostra node --test --test-concurrency=1
    --test-name-pattern="syncMapPresentation|Runner fatal|startup failure|latency harness|frozen Hostra owns"
    test/m15-hostra-product.test.mjs                               → 9/9
  HOSTRA_SOURCE_DIR=.qualification/hostra node --test --test-concurrency=1
    --test-timeout=3600000 --test-name-pattern="640/720/1080"
    test/m15-hostra-product.test.mjs                               → 1/1 (1640283 ms)
Commands (Node 20 portable):
  npm run test:viewport:qualification:run                          → 11/11
  npm run test:m11:qualification:run                               → 10/10
  npm run test:m15:desktop                                         → 14/14
  npm test -w @loomrealm/data                                      → exit 0
  npm test -w @loomrealm/subsystem                                 → 61/61
  node --test game-libs/map/test/*.test.mjs (explicit files)       → 59/59
Raw JSON: artifacts/map-viewport-pr3-hostra.json
```

`npm test -w @loomrealm-game/map` on Node 20 fails to expand `test/*.test.mjs` on Windows; the same three files were executed explicitly and passed. That glob quirk is a Node 20 Windows runner difference, not a Map product FAIL.

Exact `npm run test:m14:essentials-local` was **not** executed: no Essentials v21.1 zip/root is present in this worktree. Local FSDB checksum remains `f49cf7267c9f920ca52eceb1a5017eee56b9c472b5e97fdde3f77aed8ebba7ed` from PR0. Hosted CI Node 20/24 umbrellas were not run.

## 2. Allowed PR3 diff

Harness/ledger only plus the Tileset `autotile_names` assertion in `scripts/m14-essentials-local.mjs` (current closed Tileset shape). `m15-hostra-product.test.mjs` classifies refresh by `visualEpoch`, samples world-backed canvases in screen space, CDP-emulates 640/720/1080 logical CSS px, and uses a 512×8 cyclic map so large viewports still produce refresh samples. Production Map/Core files were not edited in PR3.

## 3. Official Hostra P95 table

Cyclic product Map 900001 (512×8), three rounds × 100 ordinary + 30 refresh per size. Camera-only and zero extra tile draws on ordinary samples.

| Viewport | Ordinary p50/p95/max (n=300) | Ordinary gate | Refresh p50/p95/max (n=90) | Refresh gate | Camera-only / zero-draw | Status |
|---|---|---|---|---|---|---|
| 640×480 | 12.5 / **15.0** / 19.3 | ≤50 | 20.4 / **23.2** / 25.7 | ≤50 | 300/300 / 300/300 | PASS |
| 1280×720 | 12.4 / **14.8** / 15.2 | ≤50 | 21.9 / **28.3** / 29.6 | ≤75 | 300/300 / 300/300 | PASS |
| 1920×1080 | 14.1 / **15.2** / 18.4 | ≤50 | 27.3 / **30.7** / 34.1 | ≤100 | 300/300 / 300/300 | PASS |

Invalid rate 0 on recorded rounds. A discarded 1800s timeout used the old 128×8 cyclic map and is not evidence.

## 4. Not claimed

Hosted GitHub Actions Node 20/24 umbrellas, exact Essentials zip `test:m14:essentials-local`, PWA.
