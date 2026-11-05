# Battle 决策性能与消息流实现记录（Issue #13）

> 状态：**IMPLEMENTED**。本文是 [`BATTLE_DECISION_PERFORMANCE_AND_MESSAGE_FEED_DESIGN.md`](./BATTLE_DECISION_PERFORMANCE_AND_MESSAGE_FEED_DESIGN.md)
> 与 [`BATTLE_V0_PROCESS_MESSAGES.md`](./BATTLE_V0_PROCESS_MESSAGES.md) 的落地记录：
> 设计条目 → 实现位置 → 对应测试 → 实际结果。权威契约仍以两份设计文档与冻结的
> v0 契约为准；本文不修订任何冻结行为。

## A. Call A 性能测量、调参、正确性

| 设计条目 | 实现位置 | 对应测试 | 结果 |
|---|---|---|---|
| Call A / Call B 分段耗时 + Provider usage（缺失记 unknown）| `src/decision-profiled.ts`（版本化 `DeepSeekProfiledDecision`，`extractProviderUsage`、`callProfiledDeepSeek`）| `test/decision-profiled.test.mjs`（usage 提取、分段指标、未知字段）| 通过 |
| Metrics Sink 同步 throw / 异步 reject 隔离，不影响战斗 | `src/decision-profiled.ts` `#emitMetric`；`src/simulation/runtime.ts` `#recordMetric` | `test/decision-profiled.test.mjs`；`test/runtime-messages.test.mjs`（含坏 sink 的完整战斗）| 通过 |
| Runtime 请求→completion、completion→accept、accept→action start 观测 | `src/simulation/runtime.ts`（`RequestTiming`、`PlanAcceptanceMarker`、`#recordConsumptionMetric`）| `test/runtime-messages.test.mjs` | 通过 |
| v0 冻结实现保持不变 + `v0-quality` 对照组字节一致 | `src/decision.ts`（仅新增可选 observer 与导出）；`test/decision-profiled.test.mjs` 首测断言 Call A/B 请求与冻结 `DeepSeekDecision` 逐字节一致 | `test/decision.test.mjs`（原有全量）+ 新增 profiled 对照 | 通过 |
| 候选 profile（A0/A1/A2/A3/A4 单变量）| `DEEPSEEK_CALL_A_PROFILES`：`v0-quality`/`call-a-low`/`call-a-none`/`call-a-low-tight`/`call-a-lean`；Call B 全 profile 冻结 | `test/decision-profiled.test.mjs`（单变量断言）| 通过 |
| 相同 Observation/Prompt/Seed 交错对照试验 + 记录样本量、延迟、usage、acceptance | `test/tools/call-a-trials.mjs` + `test/decision-performance.test.mjs`（离线管线）+ 真实 opt-in 试验 | `test/decision-performance.test.mjs`；记录在 [`test/records/call-a-performance-records.md`](../test/records/call-a-performance-records.md)（含真实 JSON）| 真实试验已执行（见记录）；CI 无凭据时显式跳过并写回原因 |
| 不设 p50/p95/胜率硬门槛；不改 Plan 校验；不宣称显著性 | 记录文档与 harness 均为纯观测；`validatePlan` 未改动（`test/simulation*.test.mjs` 全量回归）| — | 满足 |
| `DEEPSEEK_API_KEY` 仅从 `process.env` 读取 | `test/decision-performance.test.mjs`（与既有 `BATTLE_DEEPSEEK_SMOKE` 相同模式：flag+key 双重 opt-in）；不写入任何文件/参数/日志 | 测试断言记录文件不含凭据 | 通过 |
| 选定配置与理由 | 产品默认 `call-a-low`（`subsystems/battle.mjs` `BATTLE_CALL_A_PROFILE_DEFAULT`，`POKEMAN_BATTLE_CALL_A_PROFILE` 可覆盖）| `test/battle-integration.test.mjs`（走真实 Profiled 决策的完整接线）| 记录见性能记录文档第三节 |

## B. Runtime / Simulation 权威战斗消息

| 设计条目 | 实现位置 | 对应测试 | 结果 |
|---|---|---|---|
| `BattleMessage` union（含非权威 `decision.analysis_completed`）| `src/contracts.ts` | `test/messages.test.mjs`（formatter 覆盖每类）| 通过 |
| `TickOutput.messageFacts`（仅 Simulation 权威事实，失败 Tick 不发半份）| `src/simulation/tick.ts`（`SimulationMessageFact`；`simulationFailureOutput` 清空）| `test/simulation-messages.test.mjs` | 通过 |
| `decision.accepted` 仅在 `acceptPlan` 后，忠实表达 movement/turn/skill 组合 | `tick.ts` completions 分支 | `test/simulation-messages.test.mjs`（path+skill、turn+skill 空 path）| 通过 |
| movement intent 独立于 motion segment（跨 segment、跨 idle 空隙、activePlan 清空后仍存活）| `state.ts` `MovementIntentState`；`tick.ts`（首段创建、末段 `move_complete` 完成、伤害/弃案中断）| `test/simulation-messages.test.mjs`（多段一始一终、**segment 间 idle 空隙被打断**、首段失败 movement.failed 无 started）| 通过 |
| skill.started（含瞬发先 started 后 resolved）/ skill.resolved（hit/miss/immune/invalid）/ damage.applied（最终结算值）/ actor.defeated（仅一次、晚于致命伤害）| `tick.ts` materialization + `resolveBatch` | `test/simulation-messages.test.mjs` | 通过 |
| Runtime 生命周期消息（decision.started 仅玩家可感知原因；decision.failed 仅 session_fatal 且早于 battle.ended；paused/resumed/ended 各一次，ended 早于 run() resolve）| `src/simulation/runtime.ts`（`#dispatchMessage`、`#invokeCommands`、`#commitPause`、`resume`、`#finish`）| `test/runtime-messages.test.mjs` | 通过 |
| 受击后旧请求失效、新请求的 decision.started 排在本 Tick 事实之后 | runtime `#wake` 发布顺序（facts → decision.failed → presentation → 新 commands）| `test/runtime-messages.test.mjs`（damaging_start.sequence > interrupted.sequence）| 通过 |
| prefetch / correction / 内部重试不播报、不产生伪消息 | command reason 元数据（`plan.ts` `RequestDecisionCommand.reason`，`makeCorrection` 用 `correction`）| `test/runtime-messages.test.mjs` | 通过 |
| 统一 sequence/id/elapsedMs；Replay v1 不变 | runtime dispatcher；`messageFacts` 不进 `ReplayTickRecord` | `test/simulation-messages.test.mjs`（Replay 重放消息流逐条一致 + replay JSON 无 messageFacts）| 通过 |

## C. AI 可见策略文本进入同一消息流

| 设计条目 | 实现位置 | 对应测试 | 结果 |
|---|---|---|---|
| concrete `DeepSeekDecision` 可选 Call A `processMessageObserver`（第二构造参数；成功+未 abort+非空才调一次；throw 隔离；Call B 原文不变）| `src/decision.ts`（workflow 内、abort 检查后同步调用）| `test/decision.test.mjs`（字节一致、失败/abort/空不调、throw 隔离、构造校验）| 通过 |
| Runtime `reportDecisionAnalysis` 有效性闸门（requestId/generation/活跃/玩家可见/去重/未结束）| `runtime.ts`（`#visibleStartedRequests`、`#reportedAnalysis`、facts 校验）| `test/runtime-messages.test.mjs`（有效一次、重复、幽灵、错误 generation、迟到、correction、结束后全部丢弃）| 通过 |
| 三类来源同一 Feed、统一 sequence 最新置顶、`【角色名】` 本地模板 | `src/messages.ts`（`createBattleMessageFeed`、`formatBattleMessage`）；`subsystems/battle.mjs` 接线 | `test/messages.test.mjs`；`test/browser-e2e.test.mjs`（面板最新在上）| 通过 |
| Feed 有界（默认 100）、append-only、subscriber 隔离、close 清空 | `src/messages.ts` | `test/messages.test.mjs` | 通过 |
| 面板纯文本安全（不执行 HTML；控制字符过滤；长文折叠≈1200 字符可展开；阅读旧消息滚动稳定 + 新消息提示）| `browser/battle.browser.js` `lr-battle-activity`（textContent、`overflow-wrap:anywhere`、展开按钮、scrollTop 保持、pill）| `test/browser-e2e.test.mjs`（`<img onerror>` 注入不执行、展开、滚动稳定）| 通过 |
| Battle close 清空 Feed/DOM/订阅，无第二 AI 提示区 | `subsystems/battle.mjs` finally（unregister、feed.clear、listener.close、uiDomain.close）；单一面板节点 | `test/battle-integration.test.mjs`（close 后 domain 关闭）；`test/browser-e2e.test.mjs`（domain close 移除 layout+panel）| 通过 |

## D. Battle View 组件布局与地图视口尺寸闭环

| 设计条目 | 实现位置 | 对应测试 | 结果 |
|---|---|---|---|
| 组件内部完成上半（左地图/右面板）+ 下半 HUD 布局；面板宽 = 上半可用内容宽 32%、最大 600px | `lr-battle-layout`（:host/`.upper`/`.map`/`.panel` CSS）；`lr-battle-view` :host 固定地图区域 + fixed 底部 `.hud` | `test/browser-e2e.test.mjs`（1024×768/800×600 多视口实测 panel=320/248.32、map=680/527.68）| 通过 |
| 地图容器 ResizeObserver 实测 content box；首次/变化上报；重复与非法尺寸去重 | `lr-battle-layout`（ResizeObserver→`battle.viewport.changed`，`broadcast:"top-frame"`，channel `pokeman.battle.viewport`）| `test/browser-e2e.test.mjs`（首次上报 680×704、request 重报、未知事件忽略）| 通过 |
| 子系统经 `scope.presentationEvents` 校验来源后注入 map-scoped viewport | `subsystems/battle.mjs` `createMapViewportBridge`（targetKey=`battle:layout`、正整数尺寸、去重）| `test/battle-integration.test.mjs`（非法来源/尺寸被忽略，合法报告驱动 Presentation）| 通过 |
| `RenderDomain.emit` `battle.viewport.request` → 组件重测重报；暂停恢复后补报 | `subsystems/battle.mjs`（paused→running 转换时 emit）；`lr-battle-layout.receiveRenderEvent` | `test/browser-e2e.test.mjs`（request 事件重报）；`test/battle-integration.test.mjs` | 通过 |
| 纯地图高度不被 `calculateTileViewportLayout` 重复扣 HUD | `src/presentation-semantics.ts` `calculateMapGeometry`（contentHeight=实测全高）；`presentation.ts` map-scoped 模式 + 窗口 viewport 单独供 barHeight | `test/presentation.test.mjs`（map 模式 contentHeight=实测值、窗口 resize 只改 barHeight、双订阅清理）；`test/browser-e2e.test.mjs`（assertView 双模式校验）| 通过 |
| 渲染视图不能用内联宽高反向控制布局 | `lr-battle-view.receiveRenderData` 不再写 host width/height | `test/browser-e2e.test.mjs`（`style.width === ""` + 实测 rect 等于布局 .map 盒）| 通过 |
| UI-only RenderDomain 作为单一 Feed 稳定 RenderNode 数据桥（每条消息不新增 RenderNode；Browser 只读）| `subsystems/battle.mjs`（`battle:layout` 根 + `battle:activity` 子节点，update 仅 data.set）| `test/battle-integration.test.mjs`；`test/browser-e2e.test.mjs` | 通过 |

## E. 完整闭环验收对照

| 验收项 | 测试 | 结果 |
|---|---|---|
| 类型检查 + 构建 | `npm run build:game`（tsc strict）| 通过 |
| 完整 AI vs AI 战斗（真实决策 + 消息流 + 面板 + 关闭清理）| `test/battle-integration.test.mjs`「Battle Frame wires feed…」 | 通过 |
| 受击取消旧请求、产生新请求的消息顺序 | `test/runtime-messages.test.mjs`；`test/simulation-messages.test.mjs`（idle 空隙中断核心场景）| 通过 |
| Call A 文本有效/无效请求判定 | `test/runtime-messages.test.mjs`（闸门矩阵）| 通过 |
| 技能/伤害/死亡 | `test/simulation-messages.test.mjs` | 通过 |
| 移动分段与中断 | `test/simulation-messages.test.mjs` | 通过 |
| Replay v1 回归（含消息流重放一致性）| 原有 `simulation.test.mjs` 全量 + `simulation-messages.test.mjs` 末测 | 通过 |
| Pause/Resume/Cancel/Battle End | 原有回归 + `test/runtime-messages.test.mjs` | 通过 |
| 关闭资源清理 | `runtime-messages`（close 后无消息）；`battle-integration`（listener/domain close）；`browser-e2e`（DOM 移除）| 通过 |
| 受支持尺寸布局与无重复扣高 | `presentation.test.mjs` + `browser-e2e.test.mjs` | 通过 |
| 无 Provider secret 泄漏 | 性能测试断言记录不含凭据；transport 只经 Authorization header（原有测试）| 通过 |
| 性能记录 + profile 选择 + 理由 | `test/records/call-a-performance-records.md`（真实执行，含 quota 异常记录）| 完成 |

## F. 已知限制

1. `call-a-none` / `call-a-low-tight` 等候选的真实样本量很小（每 profile 5 个
   Call A 样本 + 1 场完整战斗），且 `call-a-low-tight` 的完整战斗中途遇到
   Provider 402 额度耗尽而终止；都不能作为统计结论。
2. Activity Panel 的滚动/长文折叠在无字体的 headless Chromium 中以显式
   min-height/拉丁文本驱动验证；真实浏览器渲染效果需人工确认。
3. 面板消息当前不做本地化文件拆分（模板常量在 `messages.ts`）。
4. 消息流不从 Replay 重建（设计明确本轮不承诺）。
