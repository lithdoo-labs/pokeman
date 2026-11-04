# Map Viewport PR0 — 冻结前可行性证据账本

> 状态：**PR0 PASS / Map Docs Freeze APPROVED as design contract only**；2026-09-16。本文只记录实测结果，不定义schema/规则；唯一规范为[Map机械实施主合同](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md) §0–§14，motion细节见同目录子规范。Freeze 签署见 [Map Docs Freeze review](./MAP_VIEWPORT_DOCS_FREEZE_REVIEW_2026-09-16.md)。本文件不是 Implemented，也不是 640/720/1080 产品性能 PASS。

## 1. 证据身份（运行时必须完整填写）

```text
Owner / recorder: engineering agent (Cursor Grok 4.6)
Design owner recovery: project owner continuation 2026-09-16 (“继续”) after dense 720/1080 STOP
Map Docs Freeze reviewer: Cursor Grok 4.6 (design contract only; conflict noted in freeze review)
Timestamp: 2026-09-16
Git base / production SHA: 4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9 (origin/main; production zero diff)
PR0 harness files: test/map-viewport-pr0.test.mjs, test/map-viewport-pr0-hostra.test.mjs, this ledger
Build mode: npm run build:m14 (exit 0) then node --test
Node: v24.19.0 (C:\Program Files\nodejs\node.exe)
npm: workspace 0.1.0-alpha.0
OS: win32 10.0.26200
CPU: AMD Ryzen AI 9 365 w/ Radeon 880M
GPU: Radeon 880M (integrated); DPR=1 in Chromium harness
Chromium/Edge: msedge.exe 153.0.4234.32 via Playwright
Hostra source: .qualification/hostra @ d863beab3c59c3bd4f271514a228fa8fee0bf5b6 (1.0.1-beta.1 freeze pin)
Electron: packages/hostra/electron_bin/electron.exe present
Local FSDB: examples/essentials-v21.1-local/[FSDB]Essentials v21.1
Local Map+Tileset checksum SHA-256: f49cf7267c9f920ca52eceb1a5017eee56b9c472b5e97fdde3f77aed8ebba7ed
Commands:
  npm run build:m14                                    → exit 0
  node --test test/map-viewport-pr0.test.mjs           → exit 0 (8 pass / 0 fail)
  HOSTRA_SOURCE_DIR=.qualification/hostra node --test --test-concurrency=1 test/map-viewport-pr0-hostra.test.mjs
                                                       → exit 0 (2 pass / 0 fail; 293451 ms)
Raw JSON: artifacts/map-viewport-pr0-node.json, artifacts/map-viewport-pr0-hostra.json (working copies of stdout)
```

本文件不得因设计已书写就打PASS。正式提交真实数据时为每次运行固定一个exact executable/cohort SHA；任何代码/fixture变化更新subject，旧证据不可挪用。找不到local FSDB或真正的production Hostra/Chromium时标`EVIDENCE MISSING`，不可用synthetic proxy推断真实素材通过。

PWA / M16 / M17 = OUT OF SCOPE。本账本不记录 PWA PASS 或 FAIL。

## 2. 不改生产代码的固定 hosted dense fixture

按主合同§10生成 Map(width128,height96,z0..2均填充)：`z0=384+((x+y)%8); z1=48+((x+2*y)%48); z2=384+((x+3*y)%8)`，有效Tileset indexes 0..391，regular384..391 priorities依次0,1,2,3,4,5,0,1，autotile48..95使用有效slot0资源。完整shape/byte guard、128/256MiB、CSS `::slotted` stacking的pixel oracle必须覆盖：

```text
320x240, 640x480, 800x600, 960x540, 1280x720, 1920x1080
center player (64,48); 4 edges; center -> right one tile
priority0..5 / equal depth / tall sprite / autotile / source-target union
```

任何用减小density、空z layer或静态fake byte估算替换均不合格。Map-private data每一字段/tuple/chunk集按主合同§4，真实bytes只认`TextEncoder().encode(JSON.stringify(fullMapViewData)).byteLength`；记录最大和所有尺寸/position样本，要求 `<196608`。另单测完整`RenderDomain.update` author total/full-state+snapshot residual、M13 recursive structural equality（固定large chunks仅camera变）、Browser当前640 baseline raster+candidate private-shadow stacking与peak backings/decode；不得通过跳过Frozen validation/修改M13测试来减时间。

### 2.1 Schema + UTF-8 bytes — PASS

640×480 camera anchors degenerate to Frozen 304/224. Max dense MapView bytes **61296** at 1920×1080 center/union (80 chunks, 56 TileVisuals). All six sizes, four edges, and center→right union are strictly `< 196608`.

| Viewport | Center chunks | Center bytes | Unique depths | Visible backing B | Peak visible+detached B |
|---|---:|---:|---:|---:|---:|
| 320×240 | 16 | 14038 | 37 | 24494080 | 49004544 |
| 640×480 | 24 | 19946 | 37 | 37076992 | **74170368** (under 128MiB) |
| 800×600 | 36 | 28804 | 53 | 55623680 | 111263744 |
| 960×540 | 30 | 24375 | 45 | 46350336 | 92717056 |
| 1280×720 | 48 | 37667 | 53 | 74498048 | **149012480** |
| 1920×1080 | 80 | 61296 | 69 | 124502016 | **249020416** |

Old per-tile `tiles[]` 640 payload is 107959 B vs new chunk schema 19946 B at the same window.

### 2.2 Canvas / decode memory — PASS (revised §5)

Owner continuation after the original STOP split the budget: **accepted/visible** canvas Σ ≤128MiB; **accepted + detached canvases + decoded ImageBitmaps** same-instant peak ≤256MiB. Estimator unchanged: one Canvas per `tileDepth`, backing = per-depth world-pixel bbox of tiles in the current chunk window, `Σ(w×h×4)`, plus an equal detached candidate and two 32×64 sprite crops. Fixture and packing were not thinned.

| Viewport | Accepted visible B | Live visible+detached B | vs 128 / 256 MiB |
|---|---:|---:|---|
| 640×480 center | 37076992 (35.4 MiB) | 74170368 (70.7 MiB) | PASS / PASS |
| 1280×720 center | 74498048 (71.0 MiB) | 149012480 (142.1 MiB) | PASS / PASS |
| 1920×1080 center | **124502016 (118.7 MiB)** | **249020416 (237.5 MiB)** | PASS / PASS |

Synthetic decode 147456 B. `maxLivePlusDecode` 249167872. `canvasBudgetOk: true`, `decodePlusBackingOk: true`, `overVisible: []`, `overLive: []`. Dense 1080 accepted stays under 128MiB. The previous STOP (dense 720/1080 live backing counted against a single 128MiB cap, including the 2× detached candidate) is **real STOP evidence under that then-current contract interpretation**, not a test/harness error. The later design revision split **accepted/visible ≤128MiB** from **accepted + detached candidate + current-scene decode ≤256MiB**. Independent-review-branch numbers such as GLM `178.13MiB > 128MiB` are not Cursor-host measurements and must not be rewritten as Cursor data.

### 2.3 Core `RenderDomain.update` residual — PASS vs per-size refresh gates

Real `RenderManager.update` (merged node data + snapshot probe). Node `process.hrtime`; 15 samples after warmup per size. Full visualEpoch path compared to accepted nonresize refresh P95 (640≤50 / 720≤75 / 1080≤100). Camera-only compared to 50ms ordinary gate.

| Viewport | Refresh gate | Full p95 ms | Camera-only p95 ms | Blocked |
|---|---:|---:|---:|---|
| 640×480 | 50 | 14.524 | 8.010 | no |
| 1280×720 | 75 | 26.091 | 18.523 | no |
| 1920×1080 | 100 | 42.773 | 24.268 | no |

`independentBottleneck: false`. An earlier loaded run saw 1080 full p95 82.6ms against a mistaken 50ms ordinary gate; that is not an independent Core STOP once attributed to the refresh bucket. Residual still exists: Frozen validation/snapshot on visualEpoch refresh. Ordinary movement must not re-stringify chunks.

### 2.4 M13 `structurallyEqualJson` residual — PASS (not a bottleneck)

Copied Frozen projector algorithm. 1920×1080 objects share the same `chunks` array; only `cameraX` differs.

| Path | p95 ms |
|---|---:|
| identity equal | 0.0008 |
| camera-only unequal | 0.0092 |

Not an independent M13 STOP.

### 2.5 Current Browser 640 raster/receive baseline — recorded

Same Chromium window `performance.now()`, current production `map.browser.js` old `tiles[]` payload, no screenshot in the interval.

- receiveMs: 1.2
- receiveToPaintMs: 1.2
- canvasCount: 1 (current single 640×480 layer path)
- backingBytes: 1232896
- host `lr-map-sprite.style.zIndex` still used by production (empty in this sample because paint path differed); this is baseline, not PR1 PASS.

### 2.6 Private `::slotted` stacking pixel oracle — PASS

Real Chromium/Edge, parent Shadow DOM canvases + parent stylesheet `::slotted(lr-map-sprite-probe) { z-index }`. Sprite host `style.zIndex` and `style.left` remained empty. Composite screenshot center pixel:

| Case | Expected | Actual |
|---|---|---|
| priority0 tile z=0 vs sprite z=1 | sprite green | `[0,255,0,255]` |
| priority5 tile z=384 vs sprite z=65 | tile blue | `[0,0,255,255]` |
| equal depth tile z=64 vs sprite z=65 | sprite green | `[0,255,0,255]` |
| tall sprite z=127 vs priority0 | sprite green | `[0,255,0,255]` |

Private-only CSS stack is feasible in this Chromium. Do not revert to host style or M13 Projector changes.

## 3. Real Essentials exact-local evidence（不得从 hosted 推断）

Path: `examples/essentials-v21.1-local/[FSDB]Essentials v21.1`. Map 2.json + 66.json + Tileset 1.json SHA-256 `f49cf7267c9f920ca52eceb1a5017eee56b9c472b5e97fdde3f77aed8ebba7ed`. Validators: `validateMapRecord` / `validateTilesetRecord` / `assertProjectable`. Status: **RECORDED**, not MISSING.

Tileset `Outside` PNG 256×16064 (366061 B). Autotiles: Sea 768×128, Sea without shore 768×128, Sea deep 768×128, Sand shore 768×128, Flowers1 160×32, Water rock 768×128, Fountain1 480×128. Decoded estimate **18681856 B** (~17.8 MiB).

| Map | Size | 640/720/1080 center bytes | TileVisuals | Chunks | Peak canvas B |
|---|---|---:|---:|---:|---:|
| 002 | 32×21, tileset 1 | 9721–9724 | 123 | 12 | 5971968 |
| 066 | 22×21, tileset 1 | 6635–6637 | 53 | 9 | 3915776 |

Whole maps fit inside 720/1080, so all positions share the same chunk window. Local material is **under** byte, 128MiB accepted, and 256MiB live+decode budgets. Unsupported tile ids 1–47: none.

## 4. 调查 harness、唯一时钟

PR0允许新增：`test/map-viewport-pr0.test.mjs`、`test/map-viewport-pr0-hostra.test.mjs`，以及更新本证据文件；不改production/既有Frozen断言。已有命令`npm run build:m14`；新增测试**创建后**执行：

```bash
node --test test/map-viewport-pr0.test.mjs test/map-viewport-pr0-hostra.test.mjs
npm run docs:check-links
```

必须复用现有 `test/map-layering-browser.test.mjs` 的PNG/Chromium及 `test/m15-hostra-product.test.mjs` Hostra product harness。单一window `performance.now()` 记录`input-captured.at→browser-first-motion-paint.at`和非resize refresh trigger→paint（见M15已存在seam）；Browser screenshot/pixel oracle另验实际正确像素，不能把screenshot/CDP往返算到历史P95或拿RenderData receive充当paint。异进程now不相减；720/1080未实现dynamic只能写`prototype-only`，不填product PASS。记录每桶与三轮原始样本（若为当前640基线）及 CPU/memory诊断；缺失数据标MISSING而非0。

Hostra 640 基线实际命令与上表 §1 一致；720/1080 产品路径 **prototype-only / not implemented**，不得写成 product PASS。

### 4.1 Current Hostra 640 ordinary/refresh historical-seam baseline — RECORDED

Cyclic 128×8 Map 900001, same Browser Window clock, 20 warmup then 3 rounds × (100 ordinary + 30 refresh). Invalid samples 1/161, 1/164, 1/164 (all ≤5%).

| Bucket | n | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|
| ordinary input → first correct paint | 300 | 17.3 | **21.3** | 23.1 |
| non-resize refresh → first correct paint | 90 | 37.8 | **41.8** | 42.9 |

This is the **current** 640 product baseline, not PR1 camera-only PASS and not 720/1080 product evidence. Historical M15 50ms seam is still met on this machine; PR0 does not treat that as the new Map optimization gate.

## 5. 必填结果

| Evidence | Result | Raw data / artifacts |
|---|---|---|
| Fixed synthetic schema + all sizes + max bytes | **PASS** max 61296 B | `test/map-viewport-pr0.test.mjs`; stdout `MAP_VIEWPORT_PR0` |
| Exact-local Map002 / Map066 true sources + dense1080 | **RECORDED** under 128/256 | FSDB path + checksum above |
| Full `RenderDomain.update` validation and snapshot cost | **PASS** vs per-size refresh gates | §2.3; 1080 full p95 42.8 ms < 100 |
| M13 full structural equality cost for camera-only changes | **PASS** p95 0.009 ms | Frozen algorithm copy |
| Current Browser raster/receive baseline and peak memory | **RECORDED** 640 receive-to-paint 1.2 ms; dense memory **PASS** | §2.2 / §2.5 |
| Shadow-only slotted Sprite, pixel priority0..5/equal/tall | **PASS** | Chromium screenshot oracle |
| Current Hostra 640 ordinary/refresh historical-seam baseline | **RECORDED** ordinary p95 21.3 / refresh p95 41.8 | 3 rounds, 300+90 samples |
| No unresolved Core/M13 independent latency bottleneck | **PASS** (refresh residual recorded, not a STOP) | §2.3–2.4 |
| Reviewer/date/docs subject SHA / Map Docs Freeze | **APPROVED as design contract** | [freeze review](./MAP_VIEWPORT_DOCS_FREEZE_REVIEW_2026-09-16.md) |

PR0要求**设计可行性、数值风险归因、真实输入合法和无未解阻塞**，不要求尚未写出的PR1/PR2已经达到camera-only zero tile draw、目标640/720/1080 P95或动态真实产品PASS。发现任何问题立刻提交expected/actual、resource/input与trace，冻结保持HOLD；负责人修订主合同、重新审查并记录新docs SHA，不能授权低判断力Agent擅自换算法。只有PR1/PR2实施后在PR3同一新executable/cohort SHA通过主合同§10的完整性能/功能/P95/内存门槛，才能称Product Closed。

## 6. Closed STOP (superseded by owner §5 split)

```text
阶段: C PR0 complete / D Map Docs Freeze APPROVED (design only)
closed STOP: dense 720/1080 visible+detached counted against 128MiB accepted cap
owner recovery: 2026-09-16 continuation ("继续") split accepted ≤128MiB vs live+decode ≤256MiB
re-run: node --test test/map-viewport-pr0.test.mjs → 8 pass / 0 fail
actual: maxVisible 124502016 ≤ 134217728; maxLivePlusDecode 249167872 ≤ 268435456
production SHA still 4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9 (PR0 harness-only)
```

This closes the memory STOP. It does **not** claim PR1/PR2 product P95, camera-only zero tile draws, or Implemented.
