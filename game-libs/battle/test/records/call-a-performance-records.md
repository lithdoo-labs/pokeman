# Call A 性能对照试验记录

> 本文件是 Battle 决策 Call A 调参的**实际测试记录**（主设计 §7.3–§7.5）。
> 真实 DeepSeek 试验显式 opt-in：需要执行进程环境变量 `DEEPSEEK_API_KEY`
> 与 `BATTLE_DEEPSEEK_PERF=1`（密钥只从 `process.env.DEEPSEEK_API_KEY` 读取，
> 绝不写入源码、fixture、命令参数或日志）。普通 CI 无凭据或未 opt-in 时按设计
> 跳过，`test/decision-performance.test.mjs` 会把当次跳过原因写到同目录
> `call-a-performance-skip.md`，本文件的真实记录不被覆盖。

## 一、Call A 分段延迟 / usage 对照（真实 Provider，交错轮转）

- 执行时间：2026-11-05T18:32:44.162Z（UTC）
- 数据来源：真实 DeepSeek Responses API（`deepseek-flash`，显式 opt-in）
- 每个 profile 样本数：5（同一固定 Observation/Prompt/battle seed 下的两个局面交错轮转：`request:trial:approach` / `request:trial:finisher`）
- 说明：小样本观测记录，不构成统计显著性结论；不设 p50/p95/胜率硬门槛。

| profile | 样本 | Call A 成功 | Call A p50 (ms) | Call A p90 (ms) | Call A p95 (ms) | input tokens | output tokens | reasoning tokens | Plan 结果（一次性校验） |
|---|---|---|---|---|---|---|---|---|---|
| v0-quality | 5 | 5 | 18538.7 | 23066.9 | 23066.9 | 482 | 2906 | 2766 | accepted×2, rejected:path_not_adjacent×2, rejected:turn_with_path×1 |
| call-a-low | 5 | 5 | 10497.5 | 13537.6 | 13537.6 | 482 | 1610 | 1351 | accepted×2, rejected:path_not_adjacent×2, rejected:turn_with_path×1 |
| call-a-none | 5 | 5 | 3080.0 | 3324.4 | 3324.4 | 457 | 381 | 0 | accepted×1, rejected:turn_with_path×3, rejected:path_not_adjacent×1 |
| call-a-low-tight | 5 | 5 | 8677.8 | 10463.4 | 10463.4 | 482 | 1334 | 1084 | accepted×1, rejected:path_not_adjacent×2, rejected:turn_with_path×2 |
| call-a-lean | 5 | 5 | 11754.6 | 20273.3 | 20273.3 | 467 | 1891 | 1671 | accepted×1, rejected:path_not_adjacent×2, rejected:turn_with_path×2 |

Provider 确认支持 `reasoning.effort: "none"`（`call-a-none` 全部成功且 reasoning tokens 为 0）。
原始逐条记录（含每条 Call A/Call B 延迟、usage、outcome）见同目录
`call-a-performance-records.json`。usage 缺失字段一律记为 `unknown`，未做任何推算。

## 二、真实完整 AI vs AI 战斗观察（每 profile 1 场，n=1，仅记录）

工具：`test/tools/real-battle-trial.mjs`（同样的 opt-in 凭据约定）。
固定 8×9 图、双方 HP 8、`firebolt` 基础伤害 8、`maxPathSteps=4`、seed 相同。

| profile | 结果 | 墙钟 (s) | Tick | Decision 数 | accepted/rejected | correction | 总伤害 | Call A 中位 (ms) |
|---|---|---|---|---|---|---|---|---|
| v0-quality | ally_win | 18.3 | 72 | 1 | 1/0 | 0 | 8 | 15875.6 |
| call-a-low | ally_win | 14.8 | 58 | 1 | 1/0 | 0 | 8 | 12676.7 |
| call-a-none | enemy_win | 6.0 | 23 | 2 | 1/1 | 0 | 8 | 2736.7 |
| call-a-lean | enemy_win | 14.5 | 57 | 2 | 1/1 | 0 | 8 | 12219.9 |
| call-a-low-tight | failure(decision:DECISION_PROVIDER_QUOTA) | 99.5 | 396 | 14 | 3/10 | 6 | 0 | 12599.1 |

说明与异常：

- 每场只有 1 个样本，胜负差异不构成任何结论；两场 `enemy_win` 与 `ally_win`
  的差别来自一次性 Plan 内容差异，属于正常波动。
- `call-a-low-tight` 一场在试验中途遇到 Provider 402（账户额度耗尽，
  `DECISION_PROVIDER_QUOTA`），按冻结失败分类终止；其 10 次 rejected /
  6 次 correction 发生在额度耗尽前的漂移中，不能归因于 profile 本身。
- Provider 额度在该场后耗尽，无法继续加样本；以上即本轮全部真实观测。

## 三、选定配置与理由

**选定：`call-a-low`（产品默认，见 `subsystems/battle.mjs` 的
`BATTLE_CALL_A_PROFILE_DEFAULT`）。**

理由（基于上述记录，非统计显著性）：

1. 延迟：交错对照下 `call-a-low` 的 Call A p50 ≈ 10.5s，相比 `v0-quality`
   的 ≈ 18.5s 约降低 43%；完整战斗墙钟 14.8s vs 18.3s。Prompt、input
   tokens（482）与 token 上限完全不变，唯一变量是 reasoning effort
   `high→low`，收益来源明确。
2. 质量：一次性 Plan 校验接受率与 v0 持平（2/5 vs 2/5，样本极小仅作观察）；
   完整战斗干净结束（单个 accepted Plan 直接走位+击倒），未出现额外 correction。
3. 保守性：`call-a-none`（p50 ≈ 3.1s）收益最大且 Provider 明确支持，但其
   可见 strategyMemo 明显更薄（output 381 vs 1610 tokens）、本组小样本一次性
   接受率最低（1/5），行为跨度大（完全关闭推理），在缺乏更大样本与多场景
   验证前不作为默认；它是后续最有价值的候选。`call-a-low-tight` 的
   max_output_tokens=4096 虽在本组未触发 incomplete，但余量小于观测到的
   v0 输出（曾达 3516），存在截断风险；`call-a-lean` 无延迟优势。
4. `v0-quality` 完整保留为对照组（`POKEMAN_BATTLE_CALL_A_PROFILE=v0-quality`
   可随时切回），Simulation Plan 校验、Replay、Battle 权威未做任何放宽。

## 四、复现方式

```bash
# 无密钥：普通 CI，真实项自动跳过并记录原因
npm test -w @pokeman/game-battle

# 真实对照（显式 opt-in；密钥仅来自进程环境变量）
DEEPSEEK_API_KEY=… BATTLE_DEEPSEEK_PERF=1 \
BATTLE_DEEPSEEK_PERF_SAMPLES=5 \
node --test game-libs/battle/test/decision-performance.test.mjs

# 真实完整战斗观察（每 profile 一场）
DEEPSEEK_API_KEY=… node game-libs/battle/test/tools/real-battle-trial.mjs \
  v0-quality call-a-low call-a-none call-a-low-tight call-a-lean
```
