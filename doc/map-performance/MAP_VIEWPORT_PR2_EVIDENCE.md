# Map Viewport PR2 — dynamic viewport production evidence

> 状态：**PR2 720/1080 Chromium PASS**；2026-09-17。Design contract remains [Map Docs Freeze](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md). This ledger is not Product Closed and is not the official Hostra 640/720/1080 P95 table.

## 1. Identity

```text
Base:     109d08d Merge Core Viewport C1 so Map can consume scope.viewport
Branch:   feat/map-viewport-pr2
Node:     v24.19.0
OS:       win32 10.0.26200
CPU:      AMD Ryzen AI 9 365 w/ Radeon 880M
Clock:    same Browser Window performance.now(); receive-to-paint excludes screenshot
Commands:
  npm run build:m14                                            → exit 0 (data/subsystem/desktop + map)
  npm test -w @loomrealm-game/map                              → 59/59
  npm test -w @loomrealm-example/essentials-v21.1              → 3/3
  node --test --test-timeout=30000 test/map-layering-browser.test.mjs → 34/34
  node --test --test-timeout=30000 test/m14-vertical.test.mjs  → 3/3
  node --test --test-timeout=180000 test/map-viewport-pr0.test.mjs → 9/9
Raw JSON: artifacts/map-viewport-pr0-node.json
```

A first PR0 run failed `RenderDomain.update` residual because it shared the CPU with `m14-vertical`. That run is discarded. PASS is the sequential 9/9 rerun above.

## 2. Allowed production diff

`game-libs/map/src/runtime.ts`, `game-libs/map/src/semantics.ts`, `game-libs/map/browser/map.browser.js`, `game-libs/map/browser/map.css`, plus current Example page CSS (`examples/essentials-v21.1/presentation.css` and the installed `page.css.css` copy). Map consumes C1 `scope.viewport`: null keeps Frozen 640, first legal different size commits immediately, later bursts 100ms trailing latest wins, active step stores pending until completion. `:host` width/height come from `viewportWidth`/`viewportHeight`. Page CSS letterboxes and no longer pins 640×480. Document `map.css` no longer pins size so it cannot override `:host`.

`packages/**` / framework / wire / importer / Content were not edited in this PR. Official Hostra 640/720/1080 P95 and `m15-hostra-product` `tiles[]` harness remain PR3.

## 3. Chromium 720 / 1080 gates

| Gate | Limit | 1280×720 | 1920×1080 | Status |
|---|---|---:|---:|---|
| View UTF-8 JSON bytes | <196608 | 37667 | 61296 | PASS |
| Host CSS box / bounding rect | payload size | 1280×720 | 1920×1080 | PASS |
| Host `style.width` | empty | (layering 34/34) | (same) | PASS |
| First visible canvas pixel | opaque, not black | `[0,0,255,255]` | `[0,0,255,255]` | PASS |
| Accepted canvas backing | ≤128MiB | 74502144 B (71.1MiB) | 124506112 B (118.7MiB) | PASS |
| Camera-only extra draws/clears/resizes | 0 | 9216→9216 | 15360→15360 | PASS |
| Camera-only commit | +1 | 0→1 | 0→1 | PASS |
| receive-to-paint (Chromium, recorded) | recorded | 68.5ms | 96.9ms | PASS |

Node `RenderDomain.update` residual (sequential rerun): 640 full p95 29.6 / camera 15.0; 720 full 51.5 / camera 20.1; 1080 full 70.8 / camera 28.5. All under per-size refresh 50/75/100 and ordinary 50. `independentBottleneck: false`.

M14 vertical remains DEFAULT 640 because that harness never sends Viewport State: 3/3.

## 4. Not claimed

Official Hostra product P95 at 640/720/1080, same-SHA M11/M13/M14/M15 closeout, Node 20 cohort, Product Closed, PWA.
