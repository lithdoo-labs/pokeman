# Map Viewport — Closeout Remediation Evidence

> 状态：**Product Closed (this machine)**；2026-09-17。本文记录 `cursor/main` 上针对独立评审缺口的整改，不是新功能设计。PWA / M16 / M17 / npm consumer verification = OUT OF SCOPE。
> Hosted GitHub Actions：**NOT RUN**（不得写 PASS）。Secondary hardware：**NOT RUN**。

## 1. Subject

```text
Branch: cursor/main
Remediation start HEAD: 0d694bc6c99289914ab6ef30e9f2e2e8fdfae0fe
Merge-base with local main: 75f5370 (origin/main 4cbf620)
Final executable SHA: 66d4ea35f76a25e4eb556bf41572c91362ff2e0a
Qualification docs SHA: 59fba24cb5ecfeec33a99ccec90dbc7756916b88
Hostra freeze: .qualification/hostra @ d863beab / 1.0.1-beta.1 / Electron 44.1.1
Machine: win32 10.0.26200; Node v24.19.0; AMD Ryzen AI 9 365 w/ Radeon 880M
```

## 2. Gaps being closed

| Gap | Production change | Tests |
|---|---|---|
| Fresh Renderer must not wire-republish previous Renderer observation | existing `RendererViewportPublisher.clear()` retained; silent-B regression added | `@loomrealm/renderer` viewport tests |
| Viewport sender terminal / duplicate `{kind:"sent"}` | live-only duplicate suppression; `noteTerminal` / `peekTerminal` | `@loomrealm/data` viewport tests |
| Sample defense | `normalizeViewportSample` explicit finite/floor/safe-integer | renderer + subsystem unit tests |
| Detached candidate + atomic pair commit | prepare on detached canvases; hide/remove old then install candidate in one sync task | `test/map-layering-browser.test.mjs` |
| Bounded ImageBitmap ownership | owner sets `accepted` / `c:<seq>`; stale `bitmap.close()` | scene A→B→C + stale candidate tests |
| Exact Browser closed schema | `assertMapViewData` / `assertMapSpriteData` fail closed | negative schema test |
| Single-endpoint pair fence | sprite child present ⇒ wait for matching tokens | View-only / Sprite-only / one-newer-endpoint |
| Overlap refresh reuse | same-scene/same-tileset `drawImage` overlap; skip unchanged regular tiles; autotile dirty local redraw | implemented in `map.browser.js` (not a contract amendment) |
| Runtime resize vs movement | `commitViewportResize` still after successful `domain.update`; finishStep does not clear `activeMove` until resize/standing commit succeeds | map runtime tests |

## 3. Memory budget (do not relitigate numbers this round)

Implemented against the **revised** rule already written on this branch:

```text
accepted / visible canvases ≤ 128 MiB
accepted + detached candidate canvases + current scene decoded ImageBitmap ≤ 256 MiB
```

Cursor PR0 dense 720/1080 STOP against a single 128MiB cap (2× detached counted as visible) remains historical evidence. Independent GLM `178.13MiB > 128MiB` is **independent implementation/review branch evidence** on a different machine and then-current interpretation; it is not Cursor-host data and is not a test error.

This SHA PR0 file: byte guard max 61296; accepted 1080 118.7MiB / live+decode 237.5MiB; `canvasBudgetOk` / `decodePlusBackingOk` true.

## 4. Historical performance (not this SHA)

PR1/PR2/PR3 PASS tables stay in their ledgers. They are not this remediation’s P95.

## 5. Frozen Hostra pin (this session)

Sibling `../hostra` is still `17cdea6` / `1.0.0`. M15 pin and product harness used `HOSTRA_SOURCE_DIR=.qualification/hostra`.

| Command | Result |
|---|---|
| `HOSTRA_SOURCE_DIR=.qualification/hostra npm run test:m15:desktop` | **14/14** (pin `1.0.1-beta.1`) |
| `HOSTRA_SOURCE_DIR=.qualification/hostra node --test --test-concurrency=1 --test-name-pattern='syncMapPresentation\|Runner fatal\|startup failure\|latency harness\|frozen Hostra owns' test/m15-hostra-product.test.mjs` | **9/9** |
| `HOSTRA_SOURCE_DIR=.qualification/hostra node --test --test-concurrency=1 --test-timeout=3600000 --test-name-pattern='640/720/1080' test/m15-hostra-product.test.mjs` | **1/1**, 1249257 ms |
| `npm run docs:check-links` | 683 relative links / 114 files OK |

Without `HOSTRA_SOURCE_DIR`, desktop pin follows sibling `1.0.0` and fails the freeze assertion. That is discovery, not a product FAIL.

## 6. PR0 residual probe (this machine, this session)

Isolated `RenderDomain.update full-state validation and snapshot residual` can FAIL under Node hrtime noise (1080 camera-only p95 53.2 > 50 on one isolated run). Frozen Render / M13 were **not** changed.

Recorded **full-file** run on this SHA: `node --test test/map-viewport-pr0.test.mjs` → **9/9 PASS**. `independentBottleneck: false`. Raw: `artifacts/map-viewport-pr0-node.json`.

| Viewport | Refresh gate | Full p95 | Camera-only p95 | vs gate |
|---|---:|---:|---:|---|
| 640×480 | 50 | 16.0 | 8.9 | PASS / PASS |
| 1280×720 | 75 | 29.7 | 17.5 | PASS / PASS |
| 1920×1080 | 100 | 57.0 | 25.9 | PASS / PASS |

Schema/bytes/memory/Chromium 640/720/1080 raster tests in the same file **PASS**. Isolated FAIL remains diagnostic noise on the Frozen Core update probe, not a Map Browser contract defect, and is not treated as Product Closed STOP after the full-file PASS.

## 7. Official Hostra 640/720/1080 (this SHA)

Clock: same Browser Window `performance.now()`; input-captured → first-motion-paint. Pin `d863beab` / `1.0.1-beta.1`. Raw: `artifacts/map-viewport-pr3-hostra.json` (harness filename; contents are this remediation run).

| Viewport | Ordinary p50/p95/max (n=300) | Ordinary gate | Refresh p50/p95/max (n=90) | Refresh gate | Camera-only / zero-draw | Discarded invalid | Status |
|---|---|---|---|---|---|---:|---|
| 640×480 | 12.2 / **14.7** / 16.2 | ≤50 | 19.8 / **22.8** / 27.8 | ≤50 | 300/300 / 300/300 | 2 | PASS |
| 1280×720 | 13.0 / **15.0** / 15.6 | ≤50 | 22.0 / **28.4** / 29.2 | ≤75 | 300/300 / 300/300 | 0 | PASS |
| 1920×1080 | 13.5 / **15.2** / 21.5 | ≤50 | 27.4 / **29.7** / 32.9 | ≤100 | 300/300 / 300/300 | 1 | PASS |

## 8. Not claimed

- Hosted GitHub Actions Node 20/24 umbrellas: **NOT RUN**
- Secondary hardware i5-11500: **NOT RUN**
- Exact Essentials zip `test:m14:essentials-local`
- PWA / M16 / M17
