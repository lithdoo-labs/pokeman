# Map projection correctness / performance evidence

This directory records the P1-A / P1-B validation for Map Presentation v1.1 incremental raster.

## Contents

- `pre-fix-regression-failures.txt` — failing delete / depth-migrate / counter tests on the old clear gate
- `COMPARISON.md` — before/after overlap copy cost comparison
- `before-fix-*.summary.json` / `after-fix-*.summary.json` — machine, browser, aggregates
- `before-fix-*.md` / `after-fix-*.md` — per-run result tables

## Harness

```bash
node game-libs/map/scripts/copy-browser.mjs
node scripts/map-projection-benchmark.mjs --label after-fix --warmup 10 --samples 100
```
