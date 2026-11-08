# Battle 决策性能与消息流实现记录（Issue #13）

> 状态：**IMPLEMENTED（含第二轮 review 修正）**。本文是 [`BATTLE_DECISION_PERFORMANCE_AND_MESSAGE_FEED_DESIGN.md`](./BATTLE_DECISION_PERFORMANCE_AND_MESSAGE_FEED_DESIGN.md)
> 与 [`BATTLE_V0_PROCESS_MESSAGES.md`](./BATTLE_V0_PROCESS_MESSAGES.md) 的落地记录：
> 设计条目 → 实现位置 → 对应测试 → 实际结果。权威契约仍以两份设计文档与冻结的
> v0 契约为准；本文不修订任何冻结行为。
>
> **第二轮（REQUEST CHANGES）修正摘要**：
> 1. **P0 布局重构**：真实地图组件现在是布局组件 map slot 内的内容（同一
>    RenderDomain、同一实际 DOM 布局树），`lr-battle-view` 不再携带独立
>    viewport 几何公式；E2E 直接断言 DOM 嵌套关系并读取真实 map/panel/HUD rect。
> 2. **P1 指标可观测**：subsystem 增加可注入 `metricsObserver` 回调（同步
>    throw/异步 reject 隔离）；`#recordProviderFailure` 记录真实单调耗时，
>    失败指标保留 Provider 实际返回的 usage。
> 3. **P1 角色显示名**：消息流使用本场 roster 的 authored Content 名称
>    （`struct.BattleActor.name` / `struct.BattleSkill.name`，如 宿敌/主公），
>    同一 resolver 用于 Runtime/Simulation/AI 文本；无名称时用稳定可读的
>    队伍标签 fallback，不以 actorId 兜底。
> 4. **P2 证据**：见「验收证据与 CI 状态」一节的如实记录。

## A. Call A 性能测量、调参、正确性

| 设计条目 | 实现位置 | 对应测试 | 结果 |
|---|---|---|---|
| Call A / Call B 分段耗时 + Provider usage（缺失记 unknown）| `src/decision-profiled.ts`（版本化 `DeepSeekProfiledDecision`，`extractProviderUsage`、`callProfiledDeepSeek`）| `test/decision-profiled.test.mjs`（usage 提取、分段指标、未知字段）| 通过 |
| Metrics Sink 同步 throw / 异步 reject 隔离，不影响战斗 | `src/decision-profiled.ts` `#emitMetric`；`src/simulation/runtime.ts` `#recordMetric`；`subsystems/battle.mjs` `createMetricsSink`（对 `metricsObserver` 同步 throw / Promise reject 双向隔离）| `test/decision-profiled.test.mjs`；`test/runtime-messages.test.mjs`；`test/battle-integration.test.mjs`（真实接线下 flaky observer 的完整战斗）| 通过 |
| Runtime 请求→completion、completion→accept、accept→action start 观测 | `src/simulation/runtime.ts`（`RequestTiming`、`PlanAcceptanceMarker`、`#recordConsumptionMetric`）| `test/runtime-messages.test.mjs`；`test/battle-integration.test.mjs`（observer 实际收到全部五类 stage）| 通过 |
| 失败指标记录真实耗时与 Provider 实际 usage | `decision-profiled.ts`（`#recordProviderFailure(stage, error, startedAt)` 单调时钟；HTTP/解析失败附带 body 内实际 usage，缺失为 null/unknown，绝不推算）| `test/decision-profiled.test.mjs`（fake monotonic clock 下 provider_error=45ms / abort=30ms / timeout=60000ms 精确断言 + 真实时钟 ≥20ms；incomplete 失败携带 usage、非 JSON 错误体 usage=null）| 通过 |
| v0 冻结实现保持不变 + `v0-quality` 对照组字节一致 | `src/decision.ts`（仅新增可选 observer 与导出）；`test/decision-profiled.test.mjs` 首测断言 Call A/B 请求与冻结 `DeepSeekDecision` 逐字节一致 | `test/decision.test.mjs`（原有全量）+ 新增 profiled 对照 | 通过 |
| 候选 profile（A0/A1/A2/A3/A4 单变量）| `DEEPSEEK_CALL_A_PROFILES`：`v0-quality`/`call-a-low`/`call-a-none`/`call-a-low-tight`/`call-a-lean`；Call B 全 profile 冻结 | `test/decision-profiled.test.mjs`（单变量断言）| 通过 |
| 相同 Observation/Prompt/Seed 交错对照试验 + 记录样本量、延迟、usage、acceptance | `test/tools/call-a-trials.mjs` + `test/decision-performance.test.mjs`（离线管线）+ 真实 opt-in 试验 | `test/decision-performance.test.mjs`；记录在 [`test/records/call-a-performance-records.md`](../test/records/call-a-performance-records.md)（含真实 JSON）| 真实试验已执行（见记录）；CI 无凭据时显式跳过并写回原因 |
| 不设 p50/p95/胜率硬门槛；不改 Plan 校验；不宣称显著性 | 记录文档与 harness 均为纯观测；`validatePlan` 未改动（`test/simulation*.test.mjs` 全量回归）| — | 满足 |
| `DEEPSEEK_API_KEY` 仅从 `process.env` 读取 | `test/decision-performance.test.mjs`（与既有 `BATTLE_DEEPSEEK_SMOKE` 相同模式：flag+key 双重 opt-in）；不写入任何文件/参数/日志 | 测试断言记录文件不含凭据 | 通过 |
| 选定配置与理由 | 产品默认 `call-a-low`（`subsystems/battle.mjs` 只传入常量 `BATTLE_CALL_A_PROFILE_DEFAULT`；试验脚本自行选择其他 profile）| `test/battle-integration.test.mjs`（走真实 Profiled 决策的完整接线）| 记录见性能记录文档第三节 |

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
| 三类来源同一 Feed、统一 sequence 最新置顶、`【角色名】` 本地模板；**角色名来自本场 roster 的 authored Content 元数据** | `src/messages.ts`（`createBattleMessageFeed`、`formatBattleMessage`）；`subsystems/battle-content.mjs`（返回 `displayNames`：`struct.BattleActor.name`/`struct.BattleSkill.name`，如 宿敌/主公、Firebolt/Grab）；`subsystems/battle.mjs` `resolveBattleDisplayNames`（同一 resolver 供 Runtime/Simulation/AI 文本；无名称时用稳定的 我方角色/敌方角色 队伍标签，formatter 末级 fallback 为 未知角色，不以 actorId 兜底）| `test/messages.test.mjs`；`test/simulation-messages.test.mjs`（小红/小明 fixture 全消息类型格式化）；`test/battle-integration.test.mjs`（FSDB authored 名称 + 小红/小明 wiring 全链路）| 通过 |
| Feed 有界（默认 100）、append-only、subscriber 隔离、close 清空 | `src/messages.ts` | `test/messages.test.mjs` | 通过 |
| 面板纯文本安全（不执行 HTML；控制字符过滤；长文折叠≈1200 字符可展开；阅读旧消息滚动稳定 + 新消息提示）| `browser/battle.browser.js` `lr-battle-activity`（textContent、`overflow-wrap:anywhere`、展开按钮、scrollTop 保持、pill）| `test/browser-e2e.test.mjs`（`<img onerror>` 注入不执行、展开、滚动稳定）| 通过 |
| Battle close 清空 Feed/DOM/订阅，无第二 AI 提示区 | `subsystems/battle.mjs` finally（unregister、feed.clear、listener.close、uiDomain.close）；单一面板节点 | `test/battle-integration.test.mjs`（close 后 domain 关闭）；`test/browser-e2e.test.mjs`（domain close 移除 layout+panel）| 通过 |

## D. Battle View 组件布局与地图视口尺寸闭环

| 设计条目 | 实现位置 | 对应测试 | 结果 |
|---|---|---|---|
| **同一实际 DOM 布局树**：真实地图组件是布局组件 map slot 的内容（上左地图/右面板、下面 HUD）| `src/presentation.ts`（`BattlePresentationOptions.domain` 注入模式：首次 render 把完整 world 子树嫁接到 `battle:layout` 的 `battle:view`(slot=map) 下，与 `battle:activity`(slot=panel) 同域）；`subsystems/battle.mjs`（先创建 UI-only domain 再注入 PresentationBuilder）| `test/presentation.test.mjs`（注入 domain 的组合树/不重复建域/不代关域）；`test/browser-e2e.test.mjs`（**DOM 嵌套断言**：`view.parentElement === layout` 且分配在 `.map` slot；activity 分配在 `.panel` slot）| 通过 |
| 面板宽 = 上半可用内容宽 32%、最大 600px；下半 HUD 位置/内容/交互不变 | `lr-battle-layout`（唯一几何来源：`.upper`/`.map`/`.panel`/`.lower` shadow CSS）| `test/browser-e2e.test.mjs` 在 **1024×768 / 800×600 / 1280×720** 三个代表性 viewport 直接读取真实 DOM rect：panel=320/248.32/401.92，map=680×704/527.68×552/854.08×656，HUD 全宽贴底、高 48/32/48 | 通过 |
| **删除重复 viewport 公式**：地图组件不自行计算布局 | `lr-battle-view` :host 仅 `width/height:100%` 填充 map slot 容器；无 fixed/percent 公式；HUD 保持 fixed 底部 | `browser-e2e`（view rect ≡ `.map` rect；scaled stage ≡ map 盒；render data 不写 host 内联尺寸 `style.width===""`）| 通过 |
| 地图容器 ResizeObserver 实测 content box；首次/变化上报；重复与非法尺寸去重 | `lr-battle-layout`（ResizeObserver→`battle.viewport.changed`，`broadcast:"top-frame"`，channel `pokeman.battle.viewport`）| `test/browser-e2e.test.mjs`（首次 680×704、request 重报携带当前实测盒、未知事件忽略）| 通过 |
| 子系统经 `scope.presentationEvents` 校验来源后注入 map-scoped viewport | `subsystems/battle.mjs` `createMapViewportBridge`（targetKey=`battle:layout`、正整数尺寸、去重）| `test/battle-integration.test.mjs`（非法来源/尺寸被忽略，合法报告驱动 Presentation）| 通过 |
| `RenderDomain.emit` `battle.viewport.request` → 组件重测重报；暂停恢复后补报 | `subsystems/battle.mjs`（paused→running 转换时 emit）；`lr-battle-layout.receiveRenderEvent` | `test/browser-e2e.test.mjs`；`test/battle-integration.test.mjs` | 通过 |
| 纯地图高度不被 `calculateTileViewportLayout` 重复扣 HUD | `src/presentation-semantics.ts` `calculateMapGeometry`（contentHeight=实测全高）；`presentation.ts` map-scoped 模式 + 窗口 viewport 单独供 barHeight | `test/presentation.test.mjs`（map 模式 contentHeight=实测值、窗口 resize 只改 barHeight、双订阅清理）；`browser-e2e`（render data `contentHeight === viewportHeight` 且 `barHeight` 来自窗口高度）| 通过 |
| UI-only RenderDomain 作为单一 Feed 稳定 RenderNode 数据桥（每条消息不新增 RenderNode；Browser 只读）| `subsystems/battle.mjs`（`battle:layout` 根 + `battle:activity` 子节点，update 仅 data.set）| `test/battle-integration.test.mjs`；`test/browser-e2e.test.mjs` | 通过 |
| 兼容性：无注入 domain 时保持 v0 独立 world 域树（`battle:view` 单根）| `presentation.ts` 默认路径不变 | `test/presentation.test.mjs` 既有 21 项断言原样通过 | 通过 |

## E. 完整闭环验收对照

| 验收项 | 测试 | 结果 |
|---|---|---|
| 类型检查 + 构建 | `npm run build:game`（tsc strict）| 通过 |
| 完整 AI vs AI 战斗（真实决策 + 消息流 + 面板 + 关闭清理）| `test/battle-integration.test.mjs`「Battle Frame wires feed…」（含：注入 UI domain 的组合树、真实角色名、flaky metrics observer、viewport bridge 验证、close 清理）| 通过 |
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

## E2-1. 指标观测出口（P1）

**从哪里读取**：`createPokeManBattleSubsystem(scope, { metricsObserver })` 的可注入
`metricsObserver(metric)` 回调是唯一产品观测出口。项目当前没有既有
diagnostics/telemetry 通道（`SubsystemScope` 仅暴露
signal/state/events/content/viewport/presentationEvents/createRenderDomain），
因此按 review 要求提供该 best-effort 回调；未来接入平台 telemetry 时只需在
宿主侧传入该回调，无需改动 Battle 代码。

**何时发出**：每条指标在其产生点同步发出一次——
- provider 指标（`scope:"provider"`，`stage:"call_a"|"call_b"`）：每次物理
  Provider 调用结束后（成功含 `durationMs`/`parseMs`/实际 usage；失败含真实
  耗时、outcome 分类、失败 code、以及 Provider 在失败响应体里实际返回的
  usage，缺失为 `null`/`"unknown"`，绝不推算）。
- runtime 指标（`scope:"runtime"`，`stage:"request_to_completion" |
  "completion_to_acceptance" | "acceptance_to_action_start"`）：completion
  入 inbox、Decision 记录被消费（accepted/rejected/stale/failed）、以及
  accepted Plan 首个动作事实发布时。

**如何在测试/运行环境消费**：测试直接注入收集函数（见
`test/battle-integration.test.mjs`「Battle Frame wires feed…」与
`test/decision-profiled.test.mjs`）；运行环境由宿主 wiring 注入。回调同步
throw 与异步 reject 均被 `createMetricsSink` 隔离；battle 侧不积累任何指标
缓冲（无界风险为零）。指标负载只有 stage/outcome/耗时/tick 延迟/usage
数值，绝不包含 prompt、strategyMemo、请求正文、Authorization header 或
API key。

## E2-2. 验收证据与 CI 状态（P2，如实记录）

- **本地测试**：`npm run build:game` 通过（tsc strict）；
  `game-libs/battle`：135 项，133 过 / 0 失败 / 2 跳过（真实 Provider 项，
  凭据门控；第一轮已按 opt-in 实际执行并留存记录）；根目录
  `node --test --test-concurrency=1 test/*.test.mjs`：186 项，182 过 / 1 失败 /
  3 跳过。命令（本沙箱 Chromium 缺系统库，需 LD_LIBRARY_PATH 指向抽取的
  运行库；CI 由 `playwright install --with-deps chromium` 正常安装）：
  `LD_LIBRARY_PATH=/tmp/chromium-libs/root/usr/lib/x86_64-linux-gnu:... node --test --test-concurrency=1 test/*.test.mjs`。
- **唯一失败的基线证据**（非本轮引入）：在 Draft PR 当前 head commit
  `1f8c71c`（turn 1 提交，不含 turn 2 修改）上执行
  `git stash push --include-untracked && node --test test/dialogue-presentation.browser.test.mjs`
  → `not ok 8 - History stays interactive while the Conversation is paused …`
  （`precondition: the completed long text makes the conversation body
  scrollable`），`# pass 18 / # fail 1`。该测试与 `loom-realm/` 组件在本轮
  diff 中完全未触碰（`git diff 1f8c71c --stat -- test/dialogue-presentation.browser.test.mjs loom-realm/` 为空）。
  根因是本沙箱的 headless Chromium 无任何字体：文本以零度量渲染（同因
  导致 Battle 面板条目需显式 `min-height` 才可测），有字体环境不出现。
- **GitHub PR checks**：本轮执行环境无 `gh`/GitHub 网络权限（任务约束禁止
  push/gh），**未能重新确认远端 checks 状态**；第一轮 `action_required` 的
  runner 审批问题是否解决需维护者推送后在 PR 页确认。本地全部可用命令的
  结果如上，不以本地结果冒充 GitHub CI 通过。
- **Call A 记录**：保持第一轮真实试验记录与 `call-a-low` 选择不变
  （[`test/records/call-a-performance-records.md`](../test/records/call-a-performance-records.md)）；
  本轮代码未影响该结论，且 Provider 额度已在第一轮耗尽，未重复采样。

## F. 已知限制

1. `call-a-none` / `call-a-low-tight` 等候选的真实样本量很小（每 profile 5 个
   Call A 样本 + 1 场完整战斗），且 `call-a-low-tight` 的完整战斗中途遇到
   Provider 402 额度耗尽而终止；都不能作为统计结论。
2. Activity Panel 的滚动/长文折叠在无字体的 headless Chromium 中以显式
   min-height/拉丁文本驱动验证；真实浏览器渲染效果需人工确认。
3. 面板消息当前不做本地化文件拆分（模板常量在 `messages.ts`）。
4. 消息流不从 Replay 重建（设计明确本轮不承诺）。
5. E2E 裸 RendererRenderStore harness 无法转发 `emitCustomEvent`（需
   ControlHolder 挂接）与 render event，因此组合树测试中 map viewport 报告
   由测试直接喂给 adapter、`battle.viewport.request` 直接调用组件
   `receiveRenderEvent`；真实 presentation-event 链路由 loom-realm 自身测试
   与根目录 integration 测试（真实 `createListener` 桥）覆盖。
