# Map Viewport — Product Closed (Desktop, this machine)

> 状态：**Product Closed**；2026-09-17 remediation requalification on `cursor/main` executable `66d4ea3`。PWA / M16 / M17 = OUT OF SCOPE (not PASS, not FAIL).
> 前一版 2026-09-17 “Product Closed”数字仍是 `26fc25a` 的历史 evidence，不得改写成从未发生。本文件关闭的是 **remediation SHA** 在本机 + frozen Hostra `1.0.1-beta.1` (`d863beab`) 上的 requalification。
> Hosted GitHub Actions：**NOT RUN**。Secondary hardware (i5-11500)：**NOT RUN**。

This is **not** a redesign. Mechanical contract gaps were remediating on `cursor/main`, then the same Desktop product gates were rerun on the new executable.

## Gaps closed on this subject

- detached complete candidate stage + one synchronous atomic pair commit (no live Shadow DOM canvas mutation during prepare)
- bounded ImageBitmap ownership / stale decode eviction (`bitmap.close()`)
- exact Browser closed-schema validation (ResourceRef / TileVisual / chunks / camera)
- pair single-endpoint fencing (View-only / Sprite-only must stay OLD/EMPTY)
- refresh overlap-copy alignment with the frozen Map contract (implemented; not a contract amendment)
- Core viewport sender / fresh-Renderer / sample defense
- requalification on the remediation SHA (hosted CI and secondary hardware remain NOT RUN)

Evidence: [MAP_VIEWPORT_REMEDIATION_EVIDENCE.md](./MAP_VIEWPORT_REMEDIATION_EVIDENCE.md).

## Subject chain

| Stage | SHA / branch | Claim |
|---|---|---|
| Baseline | `4cbf620` origin/main | production start |
| Core C1 | `6147944` on `feat/core-viewport-v1` | Desktop Viewport State `/1` |
| Map Docs Freeze | `b75caf1` / `fc0f05c` | design/test contract only |
| PR1 | `164d88b` | fixed 640 chunk schema + 640 Hostra P95 |
| PR2 | `947e9b3` | dynamic viewport + Chromium 720/1080 |
| PR3 | `26fc25a` on `feat/map-viewport-pr2` | harness + official Hostra 640/720/1080 table |
| Remediation executable | `66d4ea3` on `cursor/main` | Core + Map contract gaps |
| Requalification docs | `59fba24` on `cursor/main` | Hostra `1.0.1-beta.1` 640/720/1080 P95 |

Contract: [MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md). Evidence: [PR0](./MAP_VIEWPORT_PR0_EVIDENCE.md), [PR1](./MAP_VIEWPORT_PR1_EVIDENCE.md), [PR2](./MAP_VIEWPORT_PR2_EVIDENCE.md), [PR3](./MAP_VIEWPORT_PR3_EVIDENCE.md), [remediation](./MAP_VIEWPORT_REMEDIATION_EVIDENCE.md).

## Product gates (this SHA — official Hostra)

Official Hostra table, frozen pin `d863beab` / `1.0.1-beta.1` / Electron 44.1.1, same Browser Window `performance.now()`, input-captured → first-motion-paint. Cyclic product Map 900001 (512×8). Three rounds × 100 ordinary + 30 refresh per size. Command: `HOSTRA_SOURCE_DIR=.qualification/hostra node --test --test-concurrency=1 --test-timeout=3600000 --test-name-pattern='640/720/1080' test/m15-hostra-product.test.mjs` → **1/1, 1249257 ms**. Raw JSON: `artifacts/map-viewport-pr3-hostra.json` (harness path; this file is the **remediation** table, not a rewrite of historical PR3).

| Viewport | Ordinary P95 | Refresh P95 | Camera-only ordinary | Status |
|---|---:|---:|---:|---|
| 640×480 | 14.7 ≤ 50 | 22.8 ≤ 50 | 300/300 zero extra draws | PASS |
| 1280×720 | 15.0 ≤ 50 | 28.4 ≤ 75 | 300/300 zero extra draws | PASS |
| 1920×1080 | 15.2 ≤ 50 | 29.7 ≤ 100 | 300/300 zero extra draws | PASS |

Ordinary n=300, refresh n=90. Discarded invalid samples during collection (not in the P95 sets): 640×480 = 2, 1280×720 = 0, 1920×1080 = 1.

Dense Chromium 720/1080 host box, opaque pixels, backing ≤128MiB, camera-only +1: PR2 historical PASS; PR0 file on this SHA **9/9**. Byte guard max 61296 < 196608. Accepted canvas ≤128MiB / live+decode ≤256MiB: held (1080 accepted 118.7MiB / live+decode 237.5MiB).

Same-tree Node 24 this session: `test:m15:desktop` with `HOSTRA_SOURCE_DIR=.qualification/hostra` **14/14** (sibling `../hostra` is still `1.0.0`; pin test must use the freeze tree), Hostra product lifecycle **9/9**, official P95 **1/1**, `docs:check-links` 683 links / 114 files.

## Historical PR3 table (`26fc25a`, not this SHA)

| Viewport | Ordinary P95 | Refresh P95 | Camera-only ordinary | Status |
|---|---:|---:|---:|---|
| 640×480 | 15.0 ≤ 50 | 23.2 ≤ 50 | 300/300 zero extra draws | PASS |
| 1280×720 | 14.8 ≤ 50 | 28.3 ≤ 75 | 300/300 zero extra draws | PASS |
| 1920×1080 | 15.2 ≤ 50 | 30.7 ≤ 100 | 300/300 zero extra draws | PASS |

## Out of scope / not claimed

- PWA, M16, M17
- Hosted GitHub Actions umbrellas on this SHA (**NOT RUN**)
- Secondary hardware i5-11500 (**NOT RUN**)
- Exact Essentials v21.1 zip `test:m14:essentials-local` (archive not in the worktree)
- Changing Frozen `/1`, Main size mirror, Input/Frame bypass, Environment framework, or Map-specific Core fast path
