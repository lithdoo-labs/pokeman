# Map Viewport PR1 — fixed 640 production evidence

> 状态：**PR1 640 PASS**；2026-09-16。Design contract remains [Map Docs Freeze](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md). This ledger is not PR2 720/1080 PASS and is not Product Closed.

## 1. Identity

```text
Base:     b75caf1779a0044e91bf6257f9d8a21e4ebdc953 (Map Docs Freeze stamp)
Branch:   feat/map-viewport-pr1
Node:     v24.19.0
OS:       win32 10.0.26200
CPU:      AMD Ryzen AI 9 365 w/ Radeon 880M
Hostra:   .qualification/hostra @ d863beab (1.0.1-beta.1)
Clock:    same Browser Window performance.now(); input-captured.at → browser-first-motion-paint.at
Commands:
  npm run build -w @loomrealm-game/map                         → exit 0
  npm test -w @loomrealm-game/map                              → 54/54
  node --test --test-timeout=30000 test/map-layering-browser.test.mjs → 33/33
  node --test --test-timeout=30000 test/m14-vertical.test.mjs  → 3/3
  node --test test/map-viewport-pr0.test.mjs                   → 8/8
  HOSTRA_SOURCE_DIR=.qualification/hostra node --test --test-concurrency=1 --test-timeout=600000 test/map-viewport-pr0-hostra.test.mjs
                                                               → 2/2 (474691 ms)
Raw JSON: artifacts/map-viewport-pr0-node.json, artifacts/map-viewport-pr0-hostra.json (working copies)
```

A second concurrent Hostra run timed out at 600s and is discarded. PASS is the completed 2/2 run above.

## 2. Allowed production diff

`game-libs/map/src/runtime.ts`, `game-libs/map/src/semantics.ts`, `game-libs/map/browser/map.browser.js`, `game-libs/map/browser/map.css`. Viewport remains CSS 640×480. Closed §4 MapView/MapSprite schema; ordinary movement omits chunks; camera-only rAF is CSS placement only.

`test/m14-vertical.test.mjs` was updated so the existing Chromium oracles speak the closed schema and sample world-backed canvases in screen space. `test/m15-hostra-product.test.mjs` still classifies refresh via `tiles[]` and is deferred to PR3.

## 3. 640 gates

| Gate | Limit | Actual | Status |
|---|---:|---:|---|
| View UTF-8 JSON bytes (dense 640 center) | <196608 | 19946 | PASS |
| Accepted canvas backing (dense 640) | ≤128MiB | 37081088 B (35.4MiB) | PASS |
| ordinary P95 | ≤50ms | **18ms** (p50 12, max 20.7, n=300) | PASS |
| refresh P95 | ≤50ms | **32.5ms** (p50 25.5, max 33.9, n=90) | PASS |
| camera-only commits on ordinary samples | ≥95% | 300/300 | PASS |
| camera-only tile draw/clear/resize | 0 per ordinary sample | 300/300 zero-draw | PASS |
| dense Chromium camera-only | 0 extra draws | draws 4608→4608, cameraOnly 0→1 | PASS |
| host `style.zIndex` / `style.left` | empty | stacking + raster hostSpriteZ `""` | PASS |
| Pixel oracle | 640 parity | layering 33/33, m14-vertical 3/3 | PASS |

Invalid rate: round1 1/179, round2 1/183, round3 2/188, all ≤5%.

## 4. Not claimed

PR2 dynamic viewport / 720 / 1080, PR3 same-SHA M11/M13/M14/M15/Hostra product closeout, PWA.
