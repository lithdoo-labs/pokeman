# Map projection before/after benchmark comparison

- Before summary: `before-fix-2026-10-29T09-17-54-974Z.summary.json`
- After summary: `after-fix-2026-10-29T09-18-16-158Z.summary.json`
- Before table: `before-fix-2026-10-29T09-17-54-974Z.md`
- After table: `after-fix-2026-10-29T09-18-16-158Z.md`
- Browser: 156.0.8078.47
- CPU: Intel(R) Xeon(R) Processor × 4
- Warmup/samples: 10/100

## Verdict

- Correctness fix does **not** remove `getImageData`/`putImageData` overlap copying.
- Overlap pixels / read bytes / write bytes remain proportional to overlap area.
- Copy time grows with overlap size (p50 copy ≈ 0.2ms at 320×240 / 64k px → ≈ 2.5ms at 1920×1080 / 958k px).
- End-to-end update latency in this harness is largely rAF-quantized (~16.6ms); use copyMs for pixel-copy cost.
- Further backend work (fixed-world chunk cache / ring buffer; PR #128) remains open if copy cost is unacceptable.

| Workload | Viewport | Shift | Before copy p50 (ms) | After copy p50 (ms) | Before overlap px | After overlap px | Before read B | After read B | Before write B | After write B |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dense-high-overlap | 320x240 | 1 | 0.200 | 0.200 | 64512 | 64512 | 258048 | 258048 | 258048 | 258048 |
| dense-high-overlap | 640x480 | 1 | 0.800 | 0.700 | 272384 | 272384 | 1089536 | 1089536 | 1089536 | 1089536 |
| dense-mid-overlap | 640x480 | 6 | 0.600 | 0.500 | 200704 | 200704 | 802816 | 802816 | 802816 | 802816 |
| dense-low-overlap | 640x480 | 14 | 0.400 | 0.300 | 86016 | 86016 | 344064 | 344064 | 344064 | 344064 |
| dense-zero-overlap | 640x480 | 20 | 0.000 | 0.000 | 0 | 0 | 0 | 0 | 0 | 0 |
| sparse-high-overlap | 640x480 | 1 | 0.800 | 0.800 | 272384 | 272384 | 1089536 | 1089536 | 1089536 | 1089536 |
| dense-high-overlap | 1280x720 | 1 | 1.300 | 1.400 | 534528 | 534528 | 2138112 | 2138112 | 2138112 | 2138112 |
| dense-high-overlap | 1920x1080 | 1 | 2.600 | 2.500 | 958464 | 958464 | 3833856 | 3833856 | 3833856 | 3833856 |
| delete-churn | 640x480 | 1 | 0.800 | 0.700 | 272384 | 272384 | 1089536 | 1089536 | 1089536 | 1089536 |
| depth-churn | 640x480 | 1 | 0.000 | 0.000 | 0 | 0 | 0 | 0 | 0 | 0 |
| resize-churn | 640x480 | 0 | 0.300 | 0.400 | 106496 | 106496 | 425984 | 425984 | 425984 | 425984 |

| Workload | Viewport | Before latency p50/p95/max | After latency p50/p95/max | Before dirty p50 | After dirty p50 |
|---|---|---|---|---:|---:|
| dense-high-overlap | 320x240 | 16.700/16.800/16.900 | 16.600/16.900/17.000 | 7 | 7 |
| dense-high-overlap | 640x480 | 16.700/16.900/17.100 | 16.700/16.900/21.500 | 14 | 14 |
| dense-mid-overlap | 640x480 | 16.600/16.900/17.100 | 16.600/16.800/16.900 | 84 | 84 |
| dense-low-overlap | 640x480 | 16.600/16.900/17.100 | 16.600/16.900/17.000 | 196 | 196 |
| dense-zero-overlap | 640x480 | 16.700/16.900/17.000 | 16.700/16.900/23.300 | 280 | 280 |
| sparse-high-overlap | 640x480 | 16.600/17.000/17.200 | 16.600/16.900/17.000 | 9 | 9 |
| dense-high-overlap | 1280x720 | 16.700/16.800/17.000 | 16.600/16.800/16.900 | 18 | 18 |
| dense-high-overlap | 1920x1080 | 16.600/16.900/17.100 | 16.600/16.800/16.900 | 24 | 24 |
| delete-churn | 640x480 | 16.700/16.900/21.500 | 16.600/16.900/17.000 | 14 | 14 |
| depth-churn | 640x480 | 16.600/16.900/17.000 | 16.600/16.900/17.000 | 96 | 96 |
| resize-churn | 640x480 | 16.600/16.900/17.100 | 16.700/16.900/21.200 | 21 | 21 |
