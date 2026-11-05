# Battle 决策性能与战斗消息流设计方案

> 状态：Design Proposal
>
> 分支：plan/battle-module-optimization
>
> 本文从零重新定义本轮改造目标。此前的 BATTLE_MODULE_OPTIMIZATION_PLAN.md 已被废弃，不应作为实现依据。
>
> 范围：PokeMan Battle 的 Call A 性能优化，以及面向玩家的实时战斗消息流（Battle Message Feed）。

## 1. 设计目标

本轮改造解决两个独立问题：

1. **AI 决策等待过长。** 通过测量和调优 DeepSeek Decision 的 Call A，改善玩家等待角色作出下一步行动的时间；保留性能与 Plan 质量测试记录，据此选择合适的配置，同时维持现有游戏规则与 Plan 校验正确性。
2. **战斗过程缺少即时反馈。** Battle 事实事件与 Call A 已产生的可见策略文本统一进入右侧 Battle Message Feed；每条消息使用角色名称标注与本地字符串模板，按发生顺序记录、最新置顶。

这两个目标相互独立：

- 性能优化不依赖消息窗口。
- 消息窗口不跟踪 AI 请求状态，也不参与 AI 决策。
- 即使不显示消息，Battle 也必须能够完整运行。
- 即使 Call A 很慢，消息流也能即时显示“角色 A 开始分析战场情报”。

## 2. 核心产品定义：消息流，不是状态面板

### 2.1 消息的含义

Battle Message Feed 是一份**战斗过程中发生事件的只读、追加式记录**。

发生一件值得玩家了解的事情，就产生一条独立消息。消息一经产生便成为历史记录，不因后续战斗状态变化而被修改、关闭或删除。

例如，同一个列表中可连续出现：

1. 【小红】开始分析局势……
2. 【小明】发动雷电术。
3. 【小红】受到 15 点伤害。
4. 【小红】思考结束：当前距离敌人三格，应先靠近再进攻。
5. 【小红】决定向敌人移动。

每条消息都是独立的追加式记录，不是持续更新的“角色正在思考”状态。第 4 条中的“思考结束”仅表示 **Call A 已完成并提供可见 Strategy Memo**；Call B 还可能正在处理，只有 Simulation 之后接受 Plan 才能产生第 5 条的 decision.accepted，AI 文本不能冒充已执行的动作或权威战斗事实。不同 Actor 的消息按真实发布顺序自然交错，不人为拼成连续的思考卡片。

### 2.2 明确禁止的设计

本方案不引入以下机制：

- Active Decisions 列表。
- Thinking 状态卡片或持续状态同步。
- AI 请求开始后创建、请求结束后关闭的 UI 对象。
- 思考耗时计时器。
- 因请求成功、失败、取消而修改或删除旧消息。
- 为了清理消息而将 Request ID 与 UI 状态绑定。
- 让 Message Feed 维护 Actor 当前是否正在思考。
- 让消息窗口参与 Decision、Simulation 或 Battle State 的状态转换。

AI 请求的取消、超时、generation 校验和 stale completion 丢弃，仍然由现有 Runtime / Simulation 内部负责。这些属于游戏运行正确性，不属于消息窗口职责。


### 2.3 “开始思考”消息的准确语义

Message Feed 记录的是**玩家可感知的决策轮次**，不是底层 Provider 调用日志。

Runtime 在每次真正调用 DecisionPort 时，都必须知道这次请求由什么原因触发；但只有玩家需要感知的决策轮次才发布一条 decision.started 消息。触发原因由 Simulation command 的内部元数据传递给 Runtime，不加入模型输入，也不要求 DecisionPort 或 LLM 理解 UI 文案。

第一版玩家可感知的触发原因：

- initial：角色开始分析战场。
- damaging_hit：角色受击后重新评估行动。
- plan_exhausted：当前计划执行完毕，角色开始规划下一步。
- plan_failed：原计划无法继续，角色开始重新规划。

以下属于内部执行细节，不单独产生新的“开始思考”消息：

- prefetch_after_materialize：提前准备后续行动。
- correction：模型返回的方案被 Simulation 拒绝后，内部发起的修正请求。
- 同一决策轮次中的自动重试。
- Call A 与 Call B 两个模型调用。

decision.started 表示“系统开始为角色处理一个玩家可感知的决策轮次”，不表示模型的内部推理过程，也不承诺该轮次一定成功。

内部 correction 不创建第二张思考卡片，也不修改第一条消息；第一版同样不为 prefetch、correction、自动重试发布可见 Strategy Memo，以免出现没有“开始分析”的孤立文本。如果修正过程最终导致玩家可感知的失败，才按失败规则发布独立事件。

## 3. 玩家体验与界面行为

### 3.1 布局

**保留 Battle View 原有的上下两部分结构；只将上半部分改为左右并排。在 PokeMan 当前明确支持的游戏分辨率与宽高比范围内，不提供抽屉、覆盖层或布局模式切换。**

- Battle View 下半部分保持现有布局和尺寸计算规则，不因 Message Panel 改造而重新布局。
- 上半部分左侧：原有战斗地图及其现有 HUD / World 内容。
- 上半部分右侧：Battle Message Feed（Activity Panel），高度与上半部分一致。
- Activity Panel 宽度为上半部分可用内容宽度的 **32%**，最大宽度 **600px**。
- 左上战斗地图占用上半部分扣除 Activity Panel 后的全部剩余宽度。
- 上半部分可用内容宽度指扣除该区域自身 padding 与左右列间距后的宽度，不使用整个浏览器窗口宽度，也不使用整个 Battle View（包含下半部分）的尺寸作为两列宽度计算依据。
- 本方案不新增或扩大 PokeMan 的分辨率支持范围；仅对项目当前支持的游戏分辨率与宽高比范围承诺上述布局。未被游戏支持的极端尺寸不属于本功能验收范围，不要求通过压缩布局、抽屉或覆盖层适配。
- Activity Panel 的消息列表独立纵向滚动，不改变地图、下半部分区域的滚动和战斗状态。

上半部分宽度计算：

`panelWidth = min(upperContentWidth × 0.32, 600px)`

`mapWidth = upperContentWidth - panelWidth`

其中 `upperContentWidth` 是上半部分扣除自身 padding 与两列间距后的可分配宽度。左右两列共用上半部分的可用高度；下半部分不参与地图 viewport 的尺寸计算。

地图几何尺寸必须来自**左上战斗地图容器自身的实际内容区域**：

- `mapViewport.width` = 左上战斗地图容器的实际内容宽度（即 `mapWidth`）。
- `mapViewport.height` = 左上战斗地图容器的实际内容高度（即上半部分可用高度）。
- Battle Presentation 的 tile viewport、logical viewport、Camera、scale 和 tile projection 全部基于这组 `mapViewport` 尺寸计算。
- 不得使用整个 Battle View、整个上半部分（尚未扣除 Panel）或浏览器 viewport 的宽高代替左上地图容器尺寸。

布局层级：

```text
Battle View
├── 上半部分（沿用现有上层区域）
│   ├── 左上：原有战斗地图（Map Viewport）
│   └── 右上：Activity Panel
└── 下半部分（现有区域，保持不变）
```

几何尺寸由**组件实际测量并通过现有双向消息机制上报**，而不是子系统自行推算：

1. PokeMan 布局层按 `panelWidth = min(upperContentWidth × 0.32, 600px)` 决定右上 Panel 与左上地图容器的 CSS 几何尺寸；下半部分保持不变。左上地图容器是唯一尺寸观测源，可以是提前建立的布局壳 / 地图容器组件；不得等 BattlePresentation 的首次 RenderProjection 才创建可测量容器。
2. 地图容器组件用 `ResizeObserver` 测量自身实际 **content box**，首次连接且已具备正整数 CSS 逻辑宽高时上报一次；后续尺寸变化时上报。忽略 0 / 非法值、相同尺寸的重复通知；不根据上次 RenderData 的 viewport 字段反向构造测量值。
3. **组件 → 子系统** 复用 LoomRealm Web Presentation v3：`context.emitCustomEvent("battle.viewport.changed", { width, height }, { broadcast: "top-frame", channel: "pokeman.battle.viewport" })`。子系统在 Battle Frame 已就绪时先注册 `scope.presentationEvents.createListener({ frame, channels: ["pokeman.battle.viewport"] })`，并验证来源确属本场 Battle 的地图容器、尺寸合法、Frame 未结束；不把此物理环境事件当成玩家 Input。
4. **子系统 → 组件** 复用 `RenderDomain.emit({ targetKey: "battle:layout", name: "battle.viewport.request", data: {} })`，由地图布局组件的 `receiveRenderEvent` 接收后重新测量并上报。请求仅表示“请重新上报”，不是同步查询或必达 RPC；当前 Live RenderNode 的实际 key 可与 `battle:layout` 对齐，不能把请求投给尚未创建的节点。
5. PokeMan composition 把最后一份有效上报缓存到**仅供本场 Battle Presentation 使用**的 map-scoped Viewport adapter，其 `current / subscribe` 满足现有 Viewport 契约。首次有效地图尺寸到达后再开始依赖它的 BattlePresentation 初始化；如果布局容器依赖 BattlePresentation 的首次渲染才能存在，会发生初始化死锁，必须先建立独立可测量的布局壳。
6. `calculateTileViewportLayout`、Camera、scale、tile projection 与 `lr-battle-view.viewportWidth / viewportHeight` 共用此地图尺寸。当前 `lr-battle-view` CSS 的 `100vw/100vh` 和 `receiveRenderData()` 写入的自身 inline width/height 不得覆盖由外层布局拥有的地图容器尺寸；RenderData 只用于内部绘制。
7. `top-frame` 的反向事件具有 currentness/Frame gating 和 transient/no-replay 语义：子 Frame（如暂停 Message）位于栈顶时的尺寸通知可能丢失。Battle 恢复 Top Frame 后主动发出一次 `battle.viewport.request` 恢复最新值；Frame/RenderNode 已关闭时静默丢弃迟到通知，取消订阅与观察器。不轮询、不假造尺寸，也不以反向通知修改 Battle gameplay authority。
8. Activity Panel 与地图 RenderProjection 分离；消息面板的具体 DOM 容器不能影响 map-scoped 真实 content box 的观测。

分辨率范围沿用 PokeMan 现有的游戏支持范围和项目测试基线。本方案不自行指定新的最小 / 最大分辨率或宽高比；实现与验收应覆盖现有支持范围内的代表性尺寸，不能把“所有可能的 viewport 尺寸”当作要求。若仓库没有集中记录该范围，应沿用当前游戏实际运行与 QA 使用的 viewport 预设，不由 Issue Agent 擅自扩展支持承诺。

右上消息面板是上半部分内独立的 UI 区域，不是 RenderProjection 的一部分，也不是 AI 状态面板。

### 3.2 消息排序

- 每条消息拥有单调递增的 sequence。
- UI 按 sequence 从大到小显示，即最新消息在顶部。
- sequence 是排序依据；显示时间仅用于辅助阅读。
- 同一 Tick 内的消息顺序由 Simulation 明确产生，不依赖对象属性顺序或异步 Promise 偶然完成顺序。


### 3.3 历史消息行为

- 消息只追加，不编辑、不关闭、不回写。
- 默认保留最近 100 条；容量可配置，但必须有上限。
- 达到上限时淘汰最旧消息，不影响战斗。
- 用户正在阅读旧消息时，新消息到达不能强制抢回滚动位置。
- 用户位于列表顶部时，新消息可以自然出现在顶部。
- 用户不在顶部时，可以显示轻量“有新消息”提示；这只是列表阅读体验，不是 Battle 或 AI 状态。
- Runtime 发布 battle.ended 时可以向仍存在的 Feed 追加最终消息；不为该消息延长战斗或界面生命周期，也不承诺关闭后仍可查看。
- Battle 关闭（Runtime.close / Battle Frame 清理）时取消订阅并清空 Feed，释放相关 DOM 资源；关闭后不保留消息历史，不另设战后消息阅读阶段。

### 3.4 统一角色标签与字符串模板

**所有战斗事实、生命周期消息和 Call A 可见策略文本只进入同一个 Activity Panel**，按统一的 sequence 排序；不再存在第二个 AI 临时提示区。

消息显示形态为 `【角色名称】描述文字`，无 Actor 的系统消息使用 `【系统】`。Actor 显示名取已有 Battle / Character 的可信映射，未知 ID 安全回退；不把模型输出作为角色名称。统一用本地字符串模板生成前后缀：

| 事件 | 本地描述模板 |
|---|---|
| decision.started | `【{actor}】开始分析局势……` |
| decision.analysis_completed | `【{actor}】思考结束：{visibleStrategyText}` |
| decision.accepted | `【{actor}】决定{planSummary}。` |
| movement.started / completed / interrupted / failed | `【{actor}】开始移动 / 到达目标 / 移动被打断 / 无法移动。` |
| skill.started / resolved | `【{actor}】发动{skillName}。` / `【{actor}】的{skillName}{resultText}。` |
| damage.applied / actor.defeated | `【{actor}】受到{amount}点伤害。` / `【{actor}】被击倒。` |
| decision.failed | `【{actor}】暂时无法制定行动方案。` |
| battle.paused / resumed / ended | `【系统】战斗暂停 / 战斗继续 / 战斗结束：{resultText}。` |

只有 `decision.analysis_completed` 的描述主体包含**已生成的 Call A visible strategyMemo**；其他模板严格依据已提交的 Runtime / Simulation 事实，绝不让 LLM 编写伤害、动作结果或战斗结论。Call A 文本不含 hidden reasoning；原始 strategyMemo 不改写地继续供 Call B 使用，UI 可安全限制展示长度、折叠或换行，但必须按纯文本处理，不解释为 HTML/Markdown，也不得展示密钥、Provider 原始错误或请求内容。推荐单条 AI 文本显示最多约 1200 个 Unicode 字符，可展开查看本场内的更多可见文本（如果实现展开，仍受有界 Feed 内存约束）。

每条消息可使用轻量事件类型区分与 Tick / 显示时间；新消息轻量淡入，遵守 reduced-motion，不播放影响战斗节奏的长动画。

## 4. 消息事件模型


### 4.1 事件来源

**游戏事实仍只有两个权威来源**；额外允许一种明确标注为非权威的已完成 Call A 可见文本，三者统一显示，不得由 Browser 猜测事实：

| 来源 | 提供的信息 | 权威性 |
|---|---|---|
| Battle Runtime | 玩家可感知的决策轮次开始、最终决策失败、Battle 暂停 / 恢复 / 结束 | Runtime 权威 |
| Battle Simulation | Plan 被接受、移动意图、技能、伤害、击倒等已提交的战斗事实 | Simulation 权威 |
| concrete DeepSeekDecision 的 Call A observer | 已产生的 visible `strategyMemo`，对应一次仍有效的玩家可感知请求 | **纯叙事文本，不是 Plan / gameplay 事实** |

边界规则：

- decision.started 属于 Runtime，因为只有 Runtime 知道何时真正调用 DecisionPort，以及这次调用的触发原因。
- decision.accepted 属于 Simulation，因为只有 Simulation 完成 Plan 校验并调用 acceptPlan 后，才能确认方案已被接受。
- 移动、技能、伤害和击倒属于 Simulation；Runtime 和 UI 不得通过 Snapshot / RenderProjection diff 推断这些事实。
- decision.failed 和 Battle 生命周期消息由 Runtime 根据已经消费的 Decision 结果或真实生命周期转换发布。
- Runtime 统一筛选、排序并发布两类权威事件和经过有效请求校验的可见策略文本，不得篡改 Simulation 事实，不得让策略文本成为 Plan 已接受的证据。


### 4.2 第一版消息类型

第一版只覆盖玩家能够理解、对战斗叙事有价值的事件：

| 事件类型 | 权威来源 | 触发事实 | 消息示例 |
|---|---|---|---|
| decision.started | Runtime | 玩家可感知的决策轮次真正开始 | 【小红】开始分析局势…… |
| decision.analysis_completed | Call A visible output，经 Runtime 校验 | 对应的仍有效请求完成 Call A 并得到非空可见策略文本 | 【小红】思考结束：当前距离敌人三格，应先靠近再进攻。 |
| decision.accepted | Simulation | Simulation 验证并接受完整 Plan | 角色 A 决定前往高地，并使用火焰斩攻击角色 B |
| movement.started | Simulation | 一次移动意图的第一段移动正式开始 | 角色 A 开始向目标位置移动 |
| movement.completed | Simulation | 移动意图的最终目的地已抵达 | 角色 A 已抵达目标位置 |
| movement.interrupted | Simulation | 已开始的移动意图未能完成 | 角色 A 的移动被打断 |
| movement.failed | Simulation | 移动意图尚未开始便无法启动 | 角色 A 无法前往目标位置 |
| skill.started | Simulation | Actor 正式进入技能施放 / windup；瞬发技能也要记录开始 | 角色 B 发动雷电术 |
| skill.resolved | Simulation | Simulation 完成技能判定 | 雷电术命中目标 / 未命中 / 被防护 |
| damage.applied | Simulation | HP 伤害结算已提交 | 角色 A 受到 15 点伤害 |
| actor.defeated | Simulation | Actor 首次进入 defeated / dead 状态 | 角色 C 被击倒 |
| decision.failed | Runtime | 决策最终失败，且结果已被 Runtime 确认会影响战斗推进 | 角色 A 暂时无法制定行动方案 |
| battle.paused / resumed | Runtime | Battle 真正进入暂停 / 恢复状态 | 战斗已暂停 / 战斗继续 |
| battle.ended | Runtime | Runtime 提交最终 BattleResult | 战斗结束：我方胜利 |

补充约束：

- decision.accepted 必须如实表达 Simulation 已接受的完整 Plan，并遵守冻结的 v0 校验规则：移动路径与技能可共存；显式 turn 与非空 path 不能共存（turn_with_path）；path 为空时可包含 turn 与 skill。不得为了消息展示放宽 Plan 校验。
- movement.started / completed / interrupted 描述一次完整移动意图，不描述每个寻路格或每个 Tick 的内部移动片段。
- battle.ended 必须携带最终 BattleResult，以区分胜利、失败、平局式同时击倒、取消和系统失败。
- 第一版不展示每个 Tick、寻路内部步骤、普通 Provider 调用日志，避免消息刷屏；Call A 的可见策略文本是特意开放的一条非权威叙事输出，并非 hidden reasoning 或对每个 HTTP 请求的追踪。


### 4.3 事件触发规则

- decision.started：Runtime 在真正调用 DecisionPort 前发布；仅对第 2.3 节列出的玩家可感知触发原因发布。prefetch、correction 和同一轮次内的自动重试不重复播报“开始分析”；Call A / Call B 不各自创建决策状态卡。
- decision.analysis_completed：concrete DeepSeekDecision 在 Call A 成功取得非空 visible strategyMemo 后，以可选 observer 上报一次；Runtime 必须核对 requestId、generation、仍活跃的请求和玩家可感知的 trigger reason，拒绝 abort、stale、prefetch、correction、retry 及已结束 Battle 的输出。此消息只代表分析完成，不代表 Call B、Plan 接受或 Action 成功。
- decision.accepted：必须在 Simulation 完成 Plan 校验并调用 acceptPlan 后发布。模型返回文本本身不代表 Plan 已接受。
- movement.started：一个已接受 Plan 的 path 第一次真正开始执行时发布一次。移动意图 ID 使用该 AcceptedPlan 的 planId，不为每个移动片段创建新的玩家可见意图。
- movement.completed：只有最终路径片段的 move_complete 事件成功提交、Actor 到达 Plan.path 的最终目的地后发布。中间格抵达不发布。
- movement.interrupted：移动意图已经开始，但在到达最终目的地前被伤害、计划失效或后续路径无法继续而终止时发布。即使 Actor 正好处于两个移动片段之间、当前 action 已是 idle，只要该移动意图尚未完成，也必须能够识别并发布中断。
- movement.failed：移动意图尚未真正开始，第一段路径就无法启动时发布；此时不应先发布 movement.started。
- skill.started：Actor 正式进入 windup 时发布；瞬发技能在同一 Tick 内也必须先记录 skill.started，再记录 skill.resolved。
- skill.resolved：技能判定完成后发布，准确区分 hit、miss、immune、invalid。
- damage.applied：HP 已完成结算后发布，amount 和 hpAfter 使用 Simulation 的最终值。
- actor.defeated：Actor 首次进入死亡状态时发布一次，且必须晚于导致其死亡的 damage.applied。
- decision.failed：仅当 Runtime 消费到 session_fatal 决策失败、并确认该失败将导致 Battle 终止时发布；普通 attempt_failure、超时重试、Abort、stale completion 不显示。
- battle.paused / resumed：只在 Runtime 真正完成对应状态转换时发布。
- battle.ended：在 Runtime 提交最终 BattleResult 时发布一次，携带完整 result；不能把 settled 和后续 close 当成两次结束。

**移动意图与移动片段必须分开建模。** 当前 Simulation 的一个 Plan path 会被拆成多个 Tick / motion segment 执行；而 activePlan 可能在最后一个片段开始时就被清空，Actor 也可能在相邻片段之间短暂处于 idle。因此实现时需要一个轻量的 movement-intent 记录，至少保留 planId、最终目的地和是否已经开始。该记录独立于当前 action segment 和 activePlan 存续，直到移动意图 completed、interrupted 或 failed 才清除。不得只通过 actor.action.type === "moving" 判断整个移动意图是否仍然有效。


### 4.4 受击后重新思考的消息顺序

这是本设计必须通过的核心场景：

1. 角色 A 已经开始一个玩家可感知的决策轮次，消息流显示“角色 A 开始分析战场情报……”。
2. 角色 B 正式开始施放攻击，产生 skill.started。
3. 技能完成判定，产生 skill.resolved（例如命中）。
4. 角色 A 的 HP 完成扣减，产生 damage.applied。
5. 如果角色 A 有尚未完成的移动意图，Simulation 产生 movement.interrupted。该消息必须能够覆盖“Actor 当前不在 moving segment，但路径仍未完成”的情况。
6. Runtime 内部使角色 A 的旧 Decision generation 失效并取消旧请求。**不修改、不关闭、不删除旧思考消息，也不为 UI 产生 request-cancelled 状态。**
7. 如果 Simulation 随后生成 damaging_hit 决策命令，且 Runtime 真正发起新的 DecisionPort 请求，则产生一条新的 decision.started：“角色 A 正在根据新的战况重新评估行动……”。

最终历史记录保留旧思考消息、技能开始、技能结算、受击、可能的移动中断和新思考消息。消息按真实发生顺序追加，UI 按 sequence 倒序显示。

注意：第 7 条不是根据“旧请求已取消”推断出来的。只有 Runtime 确实发起新的、玩家可感知的决策轮次时，才产生新消息。


### 4.5 失败、拒绝与内部取消的展示边界

消息策略是“记录玩家值得知道的事件”，不是“把所有内部技术事件都打印出来”。

| 内部情况 | 第一版展示规则 |
|---|---|
| stale request 被取消 | 不显示，不修改旧消息 |
| AbortSignal 取消 | 不显示，不修改旧消息 |
| prefetch_after_materialize | 不显示开始思考或 AI 策略文本，属于后台提前准备 |
| Plan 被拒绝并自动 correction | 不重复显示“开始思考”，也不显示这次内部 correction 的策略文本；不修改此前历史 |
| 普通 attempt failure 后自动重试 | 不显示 |
| 最终 session_fatal 决策失败并导致 Battle 终止 | 在 battle.ended 前发布一次 decision.failed，使用安全、简短的玩家文案 |
| Battle 因决策故障进入暂停 | 发布 battle.paused；不暴露 Provider 内部错误 |
| Battle 结束 | 发布一次 battle.ended，并携带 BattleResult |
| Presentation / Panel 自身错误 | 不生成伪造的战斗消息；通过隔离的错误处理记录 |

- 不显示 Provider 原始错误、HTTP body、Prompt、API Key 或 hidden reasoning。只将 Call A 明确可见的 strategyMemo 作为非权威玩家叙事文本；用于 Call B 的原文不改变，UI 只作安全纯文本展示。
- 不把 requestId、generation、AbortController 或 active request 状态暴露给 Feed。
- 如果未来产品决定向玩家展示“行动方案需要调整”，应作为明确的玩家可感知事件单独设计；不能把每次内部 correction 自动转换成消息。

## 5. 数据与架构设计

### 5.1 总体数据流

~~~text
Battle Runtime ── Decision 发起 / 生命周期 ──┐
Battle Simulation ── committed messageFacts ────────┤
DeepSeekDecision ── Call A visible strategyMemo ──┐ │
                                                  ▼ ▼
                                   Runtime request/generation gate
                                                  │
                                 Runtime Message Dispatcher
                                     (one ordered sequence)
                                                  │
                                       PokeMan Message Feed
                                                  │
                                     Local Message Formatter
                                                  │
                                    Upper-right Activity Panel
~~~

这是一条只读观察链路：Call A 文本需要通过 Runtime 的请求有效性校验后才发布；消息链路不得反向调用 Decision、修改 Simulation 或推进 Battle Tick。右侧只有一个 Feed，不建立第二个文本提示层。

### 5.2 核心职责

| 模块 | 职责 | 不负责 |
|---|---|---|
| Decision | 根据 Observation 生成候选 Plan；可选 observer 旁路输出已完成 Call A 的原始 visible strategyMemo | 判定 Plan 已接受、维护消息历史 |
| Simulation | 校验并提交游戏事实 | Browser DOM、消息文案 |
| Runtime | 在正确时机发布 Runtime 事件与 Tick 事实；验证 Decision observer 关联请求并统一排序非权威策略文本 | 面板滚动、文案和样式 |
| Message Feed | 接收并追加不可变消息，提供有界历史 | AI 请求状态、Battle State |
| Message Formatter | 将事件类型和参数转为本地化文案 | 推断未发生的事实 |
| Activity Panel | 展示消息、排序和滚动 | 订阅 AI 请求生命周期并维护状态 |


### 5.3 Battle Message 类型草案

建议使用 discriminated union，不把长期公共契约定义为任意 Record。以下是契约形状草案，最终以现有 contracts 和 Simulation fact 为准：

```ts
type BattleMessageBase = {
  readonly id: string;
  readonly sequence: number;
  readonly tick: number | null;
  readonly elapsedMs: number;
};

type PlayerVisibleDecisionReason =
  | "initial"
  | "damaging_hit"
  | "plan_exhausted"
  | "plan_failed";

type BattleMessage =
  | (BattleMessageBase & {
      readonly type: "decision.started";
      readonly actorId: string;
      readonly reason: PlayerVisibleDecisionReason;
    })
  | (BattleMessageBase & {
      readonly type: "decision.analysis_completed";
      readonly actorId: string;
      readonly text: string; // visible Call A strategyMemo, never hidden reasoning
    })
  | (BattleMessageBase & {
      readonly type: "decision.accepted";
      readonly actorId: string;
      readonly plan: {
        readonly movement: {
          readonly destination: GridPosition;
          readonly stepCount: number;
        } | null;
        readonly turn?: Direction;
        readonly skill: {
          readonly skillId: string;
          readonly targetActorId: string;
        } | null;
      };
    })
  | (BattleMessageBase & {
      readonly type: "decision.failed";
      readonly actorId: string;
      readonly reason: "unavailable";
    })
  | (BattleMessageBase & {
      readonly type: "movement.started";
      readonly actorId: string;
      readonly movementIntentId: string;
      readonly from: GridPosition;
      readonly destination: GridPosition;
    })
  | (BattleMessageBase & {
      readonly type: "movement.completed";
      readonly actorId: string;
      readonly movementIntentId: string;
      readonly destination: GridPosition;
    })
  | (BattleMessageBase & {
      readonly type: "movement.interrupted";
      readonly actorId: string;
      readonly movementIntentId: string;
      readonly destination: GridPosition;
      readonly reason: "damaging_hit" | "blocked" | "invalidated";
    })
  | (BattleMessageBase & {
      readonly type: "movement.failed";
      readonly actorId: string;
      readonly destination: GridPosition;
      readonly reason: MovementFailureReason;
    })
  | (BattleMessageBase & {
      readonly type: "skill.started";
      readonly actorId: string;
      readonly skillId: string;
      readonly targetActorId: string;
    })
  | (BattleMessageBase & {
      readonly type: "skill.resolved";
      readonly actorId: string;
      readonly skillId: string;
      readonly targetActorId: string;
      readonly result: SkillResolveResult;
    })
  | (BattleMessageBase & {
      readonly type: "damage.applied";
      readonly sourceActorId?: string;
      readonly targetActorId: string;
      readonly skillId?: string;
      readonly amount: number;
      readonly hpAfter: number;
    })
  | (BattleMessageBase & {
      readonly type: "actor.defeated";
      readonly actorId: string;
      readonly sourceActorId?: string;
    })
  | (BattleMessageBase & {
      readonly type: "battle.paused";
      readonly reason: BattlePauseReason;
    })
  | (BattleMessageBase & {
      readonly type: "battle.resumed";
    })
  | (BattleMessageBase & {
      readonly type: "battle.ended";
      readonly result: BattleResult;
    });
```

说明：

- decision.accepted 使用已接受 Plan 的完整摘要，而不是 move / skill 二选一。path 为空时 movement 为 null；存在 path 时 destination 为最后一个路径点，skill 可与 movement 同时存在；非空 path 时不得同时存在显式 turn，保持现有 turn_with_path 校验语义。
- movementIntentId 在第一版直接复用 AcceptedPlan.planId；它用于关联同一条路径的开始、完成和中断，不展示给玩家。
- decision.failed 只表示最终且玩家可感知的失败；不携带 Provider 原始 code 或响应内容。
- battle.ended 携带 BattleResult，避免 UI 通过 Snapshot 或状态推断胜负。
- Runtime 发布时补齐 id、sequence、elapsedMs；SimulationMessageFact 本身不负责分配这些字段。


### 5.4 ID、顺序与时间

- sequence 由单场 Battle 的 Runtime Message Dispatcher 统一分配，严格递增；Runtime Events 与 Simulation Facts 共用同一个序列。
- id 由 battleId 与 sequence 确定性组合生成，保证单场 Battle 唯一；不依赖随机数或时间戳。
- tick 对 Simulation 事实填写对应 Tick；Tick 外的 Runtime 事件可以为 null。
- elapsedMs 表示本场 Battle 从开始运行至事件发布时经过的单调运行时间，使用 Runtime 的 monotonic clock 计算，并排除暂停期间；它只用于 UI 辅助显示，不作为 Gameplay authority。
- sequence 是唯一排序依据；tick 和 elapsedMs 不决定消息顺序。
- 同一 Tick 的 Simulation 事实顺序由 TickOutput.messageFacts 数组显式给出，Runtime 按数组顺序发布。
- Runtime Events 在其真实触发点同步发布；例如 Tick facts 发布完毕后才调用新的 DecisionPort，因此新的 decision.started 必须排在该 Tick 的伤害 / 中断事实之后。
- Call A observer 的文本按 Runtime **实际确认其有效并接收**的时刻分配 sequence，可能与另一 Actor 的技能、伤害等消息交错，不强制紧邻同角色的 decision.started；已取消的过期文本不补发、不回插旧序列。
- 不依赖对象属性顺序、Replay 数组分组顺序或异步 Promise 偶然完成顺序推导消息顺序。


### 5.5 不可变、有界的 Message Feed

Feed 只需要简单的追加式接口：

```ts
interface BattleMessageFeed {
  append(message: BattleMessage): void;
  getSnapshot(): readonly BattleMessage[];
  subscribe(listener: (messages: readonly BattleMessage[]) => void): () => void;
  clear(): void;
}
```

要求：

- append 只追加，不提供 update / resolve / close / remove 单条消息的 API。
- Feed 对消息对象及 payload 做必要的不可变保护。
- Feed 只保留最近 N 条消息，默认 N = 100。
- 超过容量时只淘汰最旧消息。
- append 由 PokeMan composition 中的 Runtime observer 调用；Activity Panel 只有 getSnapshot / subscribe 权限，不直接写入 Feed。
- 单个 Feed subscriber 抛错不得阻断其他 subscriber，也不得向 Runtime 传播。
- Runtime observer 抛错同样必须被隔离，不得影响 Runtime、Simulation 或 BattleResult；concrete Decision observer 失败也不得改变策略提交或 Call B 输入。
- clear 用于 Battle 关闭（Runtime.close / Battle Frame 清理）或明确重置；不用于 AI 请求完成、Battle settled 或单次消息结束。关闭时必须释放本场 Feed，不作战后持久化。
- Feed 不保存 activeRequest、thinkingActors、requestStatus 等字段。
- Feed 不拥有 Battle State，也不能通过消息反向改变游戏。

如果未来需要持久化战斗日志或跨场景历史，另行设计存储能力；本轮只要求单场 Battle 的内存消息流。

## 6. 与现有 Battle Core 的集成


### 6.1 Runtime 事件

当前 Runtime 已有 Decision command invocation、Decision abort、Tick wake 和生命周期转换等明确入口。

建议在现有 BattleRuntime observer surface 上增加消息订阅能力：

```ts
interface BattleRuntime {
  onMessage(listener: (message: BattleMessage) => void): () => void;
  reportDecisionAnalysis(request: DecisionRequest, strategyMemo: string): void; // trusted, non-authoritative observation only
}
```

Runtime 负责发布：

- decision.started：在真正调用 DecisionPort 前发布；先检查 command 携带的内部 trigger reason，只对玩家可感知原因发布。
- decision.analysis_completed：仅接受 concrete Decision observer 对仍有效、未 abort、未过期且属于可见决策轮次的 request 发出的完整 Call A visible strategyMemo；同步赋予 sequence，最多一次，永不作为 accepted Plan。这个非权威入口是 Runtime 的观察通道，不修改 DecisionPort、PlanSubmission 或 Simulation gameplay。
- decision.failed：仅在 Runtime 消费到 session_fatal 失败记录、即将以 source: "decision" 结束 Battle 时发布一次；普通 attempt_failure 只参与现有重试 / circuit-breaker 逻辑。
- battle.paused：仅在 Runtime 从 running 真正转换到 paused 时发布，并携带实际 pause reason。
- battle.resumed：仅在 Runtime 从 paused 真正转换回 running 时发布；created / initializing 首次进入 running 不算 resumed。
- battle.ended：在 #finish 提交最终 BattleResult 后发布一次，早于 PresentationPort.close() 和 run() Promise resolve；payload 携带完整 result。若 View 此时仍存在，可观察到该事件；不为展示最终消息而阻止正常 close 或延迟 Frame 退出。

实现约束：

- 当前 DecisionReason 定义在 Simulation plan command 层。实现时让 RequestDecisionCommand 携带内部 reason 元数据；makeCorrection 使用 correction reason。该 reason 不加入传给模型的 DecisionRequest，不作为 LLM 输入。
- decision.started 的发布点位于 Runtime 已确认请求有效、AbortController 已建立之后，紧邻 DecisionPort.decide() 调用之前。
- 每次真正的玩家可感知决策轮次最多发布一次；Call A / Call B、prefetch 和 correction 不重复发布。
- Runtime 仍然负责 AbortController、generation、stale completion 和 Decision Inbox；这些内部机制不向 Feed 暴露状态同步接口。PokeMan 在创建 DeepSeekDecision 时注入可选 `processMessageObserver(request, text)`，回调把完整 strategyMemo 交给 Runtime 的 `reportDecisionAnalysis`，不得直接写 Feed 绕过请求有效性与统一 sequence；observer 异常不得改变 Decision 结果。
- #finish 发布 battle.ended 不额外留存 Feed；PokeMan 在 Battle 关闭 / Frame 清理时取消监听并清空 Feed。Runtime 自身不持有 PokeMan Feed。
- listener 抛错必须逐个隔离，不得影响 Runtime、Simulation 或 BattleResult。
- PokeMan 必须在 runtime.run() 之前注册 onMessage listener，避免初始化期间的第一条消息丢失。


### 6.2 Simulation 消息事实

当前 TickOutput 已经包含 Replay Tick、Decision records、RenderProjection 等输出，但现有 Replay facts 不覆盖所有消息需求，例如技能开始和移动意图最终抵达。

建议为 TickOutput 增加独立的 Simulation-only 事实集合：

```ts
interface TickOutput {
  // Existing outputs remain unchanged.
  readonly messageFacts: readonly SimulationMessageFact[];
}
```

SimulationMessageFact 只包含 Simulation 权威事实，不是完整 BattleMessage：

- 包含 decision.accepted、movement、skill、damage、defeat 等 Simulation 事件。
- **不包含 decision.started、decision.failed、battle.paused、battle.resumed、battle.ended**；这些由 Runtime 发布。
- 不包含 id、sequence、elapsedMs；这些由 Runtime Dispatcher 统一补齐。
- 不包含 DOM 文案，不依赖 Browser。
- 只有已提交的事实才能进入 messageFacts；模型返回、候选 Plan 或未执行意图不能冒充已发生事实。
- messageFacts 在 reducer 的真实状态转换位置按顺序 push，不能在 reducer 结束后按类型分组拼接。
- 如果 Tick 处理失败、输出被判定为未提交，则不得发布该次 Tick 的部分 messageFacts。
- messageFacts 与 ReplayTickRecord 分离，不修改 Replay v1 schema。
- messageFacts 与 RenderProjection 分离，不把消息塞入渲染投影。
- 不从 UI 对 Actor state 做 diff 来猜测“发生了什么”。

具体事实时机：

1. decision.accepted：validatePlan 成功且 acceptPlan 已创建 AcceptedPlan 后产生；payload 如实保留已接受的合法 movement、turn、skill 字段组合，禁止 turn 与非空 path 共存。
2. movement.started：第一段移动正式提交时产生；同一 planId 的后续 path segment 不再产生 started。
3. movement.completed：最终 path segment 的 move_complete 事件提交、Actor 到达最终 destination 后产生。
4. movement.interrupted：已开始的 movement intent 被伤害或其他失效原因终止时产生，包括当前 Actor action 已短暂回到 idle、但路径尚未走完的情况。
5. movement.failed：移动 intent 尚未开始，第一段移动就无法启动时产生。
6. skill.started：Actor 进入 windup 时产生；瞬发技能在同一 Tick 内也要先产生 started。
7. skill.resolved：技能判定完成后产生。
8. damage.applied：HP 更新完成后产生，amount 与 hpAfter 必须来自最终结算。
9. actor.defeated：Actor 首次进入 dead 状态后产生，顺序晚于造成击倒的 damage.applied。

**移动意图状态必须独立于单段移动动作。** 建议在 ActorRuntimeState 或等价 Simulation 内部结构中保留一个轻量 movementIntent：planId、finalDestination、started。它必须跨越多个 motion segment、segment 间 idle 空隙，以及 activePlan 在最后一个 segment 开始时被清空的时刻；仅在 completed / interrupted / failed 时清除。不要为了消息系统改变 Replay v1 或 RenderProjection 的 authority。


### 6.3 Runtime 发布顺序

一次 Tick 的消息发布必须遵循“Simulation 先提交事实，Runtime 再发布新决策”的顺序：

1. 调用 processOneTick，得到 Simulation 输出。
2. 持久化现有 Replay Tick / Decision records，并完成现有 Replay 校验。
3. 将本 Tick 已提交的 messageFacts 按数组顺序发布；Runtime Dispatcher 为每条事实分配 id、sequence 和 elapsedMs。
4. 如果本 Tick 的 decisionRecords 中包含 consumeOutcome = session_fatal，在 battle.ended 之前发布一次 decision.failed；不暴露内部错误码。
5. 处理失效请求的内部 abort；不产生 UI 状态清理消息。
6. 更新现有 World / HUD Presentation。
7. 处理 terminal / Decision health。
8. 调用新的 Decision commands。每个玩家可感知的新决策轮次，在真正调用 DecisionPort 前发布 decision.started。

关键约束：

- 先发布受击、伤害、技能结算和移动中断等已提交事实，再发布受击后新发起的思考消息。
- Runtime 事件和 Simulation facts 使用同一个 Dispatcher / sequence。
- 同一 Tick 内以 messageFacts 数组顺序为准；跨 Tick 以 Runtime 实际提交顺序为准。
- 若 Tick 处理失败或没有形成有效 TickOutput，不得发布半个 Tick 的消息。
- 若 Panel listener 出错，只影响该 listener；不得中断上述顺序或影响 Battle。
- 如果实际 Runtime 顺序需要调整，应以这里的业务顺序作为约束，并用测试固定下来。

### 6.4 与 Replay 的关系

- Battle Message Feed 不是 Replay。
- 本轮不修改 Replay v1 schema。
- 不将 message timestamp、浏览器展示顺序或 UI 文案写入 Replay authority。
- Replay v1 仍然负责确定性战斗事实。
- Message Feed 是本次运行中的玩家叙事视图；本轮不承诺从 Replay 完整重建相同消息。
- 如果未来需要 Replay 也显示完整消息，再单独设计 Replay version amendment。


### 6.5 与 Presentation / Browser 的关系

- Message Feed 不属于 gameplay RenderProjection；AI 可见策略文本也不是 RenderProjection 或 Battle State。
- 不通过每条消息创建 RenderNode。
- 不让 Message Feed 的 DOM 更新调用 Simulation 或 Decision。
- Activity Panel 是 Battle View 的唯一战斗消息 UI，由 PokeMan composition 管理，接受同一个 Feed 中的事实事件与 AI 策略文本；不再另外创建 Decision 文本临时覆盖层。外层布局与 map-scoped 尺寸观测组件要能先于 BattlePresentation 初始化而存在，Battle 关闭时统一销毁。
- Panel 通过 Feed subscription 接收有界消息快照或增量；Panel 只读，不拥有消息写入权。
- World / HUD 与 Activity Panel 不共享必须原子成功的更新事务。
- Panel 的格式化、DOM 更新和滚动逻辑失败时，只影响 Panel。
- 消息监听器应只做轻量入队；实际 DOM 更新由 UI 自己批量调度，避免同步渲染阻塞 Runtime。
- Panel 不参与 Battle 结果提交，不阻止现有 Runtime / Presentation / Frame 的正常关闭。Battle 关闭（Runtime.close / Battle Frame 清理）时，PokeMan composition 取消消息订阅并清空 Feed，销毁对应 Panel；不保留战后最后一屏，也不要求增加等待玩家离开的界面流程。

在 PokeMan 当前支持的游戏分辨率与宽高比范围内，保留 Battle View 原有上下结构，只将上半部分划分为左右两列：

- 上半部分左侧：原有战斗地图及其现有 HUD / World 内容。
- 上半部分右侧：Activity Panel，与上半部分等高。
- 下半部分：保持现有布局、尺寸计算和行为，不因 Message Panel 改造而改变。
- Activity Panel 宽度为上半部分可用内容宽度的 32%，最大 600px；左上地图使用剩余宽度。
- 计算规则：panelWidth = min(upperContentWidth × 0.32, 600px)；mapWidth = upperContentWidth - panelWidth。upperContentWidth 是扣除上半部分自身 padding 与列间距后的可分配宽度。
- 左上地图的 viewport width / height 必须取左上地图容器自身的实际内容宽高；不得使用整个 Battle View、未扣除 Panel 的上半部分宽度或浏览器 viewport 尺寸。
- 当前 BattlePresentationBuilder 从 `scope.viewport` 读取尺寸并订阅变化；PokeMan composition 必须将地图组件通过 `battle.viewport.changed` 实测上报的尺寸转换成局部 Viewport adapter，注入 BattlePresentation。若现有 `scope.viewport` 仍是全局窗口尺寸，不得直接复用它代替地图局部尺寸。子系统可以向预先存在的布局组件发送 `battle.viewport.request` 重新获取报告；它不要求 Framework 新增通用 Viewport RPC。
- `calculateTileViewportLayout`、Camera、scale、tile projection，以及 `lr-battle-view` 的 `viewportWidth / viewportHeight` 必须使用同一份 map-scoped viewport 尺寸；所有 resize 更新都来自左上地图容器的 ResizeObserver / request-report，且布局不得被 `lr-battle-view` 的内联渲染尺寸反向覆盖。
- 在上述受支持范围内，不提供抽屉、覆盖层、移动端替代布局或断点切换；不为未支持的极端分辨率增加额外适配。

## 7. Call A 性能优化方案

此工作流与 Message Feed 完全独立。

### 7.1 当前基线

现有 Battle v0 Decision 实现位于：

- game-libs/battle/src/decision.ts
- game-libs/battle/docs/BATTLE_V0_DECISION.md
- game-libs/battle/src/simulation/runtime.ts

当前 Decision Workflow 是两阶段：

~~~text
DecisionPort.decide()
  → Call A: Analyze + Strategize
  → Strategy Memo
  → Call B: Materialize
  → structured Plan
  → DecisionCompletion
  → Simulation validation / acceptance
~~~

已知当前 Call A 基线使用 DeepSeek Flash、高 reasoning effort、非流式响应和较大的 max_output_tokens 上限。具体配置以代码与已冻结的 v0 Decision 文档为准。

特别注意：max_output_tokens 是允许生成的上限，不代表每次请求实际消耗了同样数量的 Token。必须先收集 Provider usage。

### 7.2 保留 v0 基线

现有 BATTLE_V0_DECISION.md 已冻结 v0 concrete implementation。

本轮不得直接静默修改已冻结的 v0 行为：

- 保留原有 v0-quality 配置作为可重复对照组。
- 新的 reasoning / token / prompt 实验必须有明确版本或 profile 标识。
- 如果需要新增可配置实现，应作为新的 Decision implementation / version 演进，并继续实现现有 DecisionPort。
- 不通过修改 Call B、Simulation validation 或 Plan authority 来掩盖 Call A 性能问题。
- 不为了提速而跳过 Plan validation 或允许模型直接输出 HP / Damage / BattleResult。


### 7.3 先测量，再调参

每个 Decision 至少记录：

- Call A 请求开始、响应完成、解析完成时间。
- Call B 请求开始、响应完成、解析完成时间。
- 整体 Decision 请求到 completion 入 inbox 的耗时。
- Provider input / reasoning / output tokens（如果 Provider 提供）。
- HTTP status、timeout、abort、incomplete response、parse failure。
- Plan 首次被 Simulation 接受与否。
- 是否发生 correction，以及最终是否执行成功。

**指标采集必须有明确的代码入口。**

当前 DeepSeekTransport.postResponses() 返回 status 和 bodyText；当前 Decision Workflow 解析响应文本后主要返回 Strategy Memo / Plan 文本，没有把 Provider usage 传递到观测层。新版本 Decision 实现应在解析响应时提取 Provider 实际返回的 usage，并将 Call A / Call B 分开记录。Provider 未返回某项 usage 时记录 unknown，不得根据 max_output_tokens 推算实际消耗。

建议在新的、版本化的 Decision implementation 中注入 best-effort Metrics Sink：

```ts
type ProviderCallStage = "call_a" | "call_b";

interface ProviderUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
}

interface ProviderCallMetric {
  readonly scope: "provider";
  readonly profileId: string;
  readonly stage: ProviderCallStage;
  readonly durationMs: number;
  readonly outcome: "success" | "provider_error" | "timeout" | "abort" | "incomplete_response" | "parse_error";
  readonly httpStatus?: number;
  readonly usage: ProviderUsage | null; // null means the Provider did not return usage.
}

interface RuntimeDecisionMetric {
  readonly scope: "runtime";
  readonly stage: "request_to_completion" | "completion_to_acceptance" | "acceptance_to_action_start";
  readonly durationMs?: number;
  readonly tickDelay?: number;
  readonly outcome?: "completed" | "failed" | "aborted" | "accepted" | "rejected" | "stale";
}

type DecisionMetric = ProviderCallMetric | RuntimeDecisionMetric;

interface DecisionMetricsSink {
  record(metric: DecisionMetric): void | Promise<void>;
}
```

Runtime 侧使用同一个观测边界记录：

- DecisionPort 调用开始到 completion 入 inbox 的时间（request_to_completion）。
- completion 入 inbox 到 Simulation 接受 / 拒绝 Plan 的 Tick 延迟（completion_to_acceptance）。
- Plan 被接受到第一次实际移动或技能动作开始的 Tick 延迟（acceptance_to_action_start）。

Provider Call 与 Runtime Decision 两类指标共用 DecisionMetricsSink，但由各自所属层产生；Runtime 不测量或猜测 Provider 内部 Call A / Call B 的耗时。

这样可以区分 Provider 慢、Runtime 等待 Tick、Plan 校验失败和行动调度延迟，避免把所有等待都归因于 Call A。

Metrics Sink 必须是非阻塞、best-effort：record 可以同步返回或返回 Promise；调用方不得 await 它来推进战斗，必须隔离同步 throw 和异步 rejection。任何指标写入失败都不得影响 Decision、Simulation 或 BattleResult。不得记录 API Key、Authorization header、完整 Prompt、原始模型响应或 hidden reasoning。

本轮性能 profile 和 Metrics Sink 必须通过新的 Decision implementation / version 演进；不得为了加指标而静默改变已冻结的 v0-quality 实现。

### 7.4 单变量实验

按以下顺序测试：

| 阶段 | 变量 | 保持不变的内容 |
|---|---|---|
| A0 | 原有 high 配置 | 当前 Prompt、Token 上限、Call B |
| A1 | Call A reasoning 降为 low | Prompt、Token 上限、Call B |
| A2 | Provider 明确支持时测试 none | Prompt、Token 上限、Call B |
| A3 | 根据真实 usage 调整 max_output_tokens | 已选 reasoning、Prompt、Call B |
| A4 | 精简 Call A Prompt | 已选 reasoning、Token 配置、Call B |

不要同时改变多个变量，否则无法判断收益来源。

不要假设某个 reasoning 档位的 Provider 语义；以当前 DeepSeek API / 模型能力为准。不要把一个实际会映射到高推理的档位误当作低成本档位。

### 7.5 测试记录与配置选择

性能优化保留实际测试记录以便后续调参；选择合适配置时不只看请求耗时，尽可能同时观察：

- Call A p50 / p90 / p95。
- Call B p50 / p95。
- Decision 总耗时和请求到下一次可执行行动的时间。
- Plan 结构合法率。
- Simulation 首次接受率。
- correction 比例。
- 已接受行动完成率。
- 固定场景集中的伤害效率、战斗时长和胜率。

实验应使用固定 Observation / Battle Seed，交错运行不同 profile，避免 Provider 不同时段负载差异造成误判。

记录实际样本数、测试场景、所用 profile、延迟与质量数据及异常现象。小样本记录仅表示本次观测，不宣称具有统计显著性；无需把置信区间或统计非劣性证明设为本轮完成前提。

根据实测延迟、调用成本、Plan 接受情况与战术表现，选择一个实际使用中性能合适的 profile，并记录选择理由和对照结果。**不设置固定的耗时改善百分比、p95、胜率或非劣性硬门槛**；完成依据是有测试记录、有明确选择、现有功能与确定性校验回归通过，而不是达到某个数字。

### 7.6 Streaming 的边界

Streaming 可以作为后续独立实验：

- 它可能改善首 token 时间，不保证缩短完整响应时间。
- 不把部分 Strategy Memo 当成可执行 Plan。
- 不向玩家输出模型逐 token 推理或 hidden reasoning。
- “角色开始思考”的玩家消息由 Decision 请求发起事件提供，不依赖 streaming。
- 只有完整响应通过解析和后续 Simulation 校验后，才可能产生 decision.accepted 消息。


## 8. 实施阶段

### Phase 0 — 设计契约冻结

交付：

- 确认 Message Feed 是追加式历史消息，而不是状态面板。
- 冻结 Runtime Events 与 Simulation Facts 的权威边界，以及 Call A visible strategyMemo 作为**非权威**旁路进入同一 Feed 的规则；只保留一个 Activity Panel。
- 冻结玩家可见决策触发原因，以及 prefetch / correction / retry 不重复播报的规则。
- 冻结 movement intent 与 motion segment 的区别、planId 关联方式和中断语义。
- 冻结 BattleMessage union、BattleResult payload、sequence / elapsedMs 语义。
- 冻结 Feed 生命周期：只在 Battle 运行期间保存有界历史；Battle 关闭（Runtime.close / Battle Frame 清理）时清空，不保留战后消息。
- 冻结 Battle View 上下结构不变、上半部分左右并排的布局：右上 Panel 宽度为上半部分可用内容宽度的 32%，最大 600px；左上地图使用剩余宽度；下半部分保持原样。尺寸通过地图组件 ResizeObserver + Frame-targeted Presentation Event 反向上报，子系统用 RenderEvent 请求重报；预先建立可测量布局壳，避免首帧死锁，不增加抽屉或覆盖层模式。
- 冻结 Call A 指标采集边界和 v0 / 新 profile 版本边界。

Gate：所有事件都有唯一权威来源、触发时机、顺序和展示规则；不得出现 Active Decisions、thinking state、request lifecycle UI 等状态面板设计。

### Phase 1 — Call A 基线与调参

交付：

- Call A / Call B 分段耗时。
- Provider usage / outcome（Provider 未提供时标记 unknown）。
- Runtime 请求到 completion、completion 到 Plan accept 的延迟。
- 固定 Observation / Battle Seed 测试集。
- high / low / none（如支持）对照报告。
- 各候选 profile 的测试记录、选定配置及其选择理由。

Gate：具备可查的对照测试记录并明确选择性能合适的 profile，保留 v0-quality 对照配置；不设固定性能或战术统计硬门槛，且 Metrics Sink 失败不能影响战斗。

### Phase 2 — Message Contract 与 Simulation Facts

交付：

- BattleMessage discriminated union（含非权威 decision.analysis_completed）与 SimulationMessageFact。
- TickOutput.messageFacts，只包含 Simulation 权威事实。
- decision.accepted、movement intent、skill、damage、defeat 事实。
- movementIntent 跨 motion segment 和 idle 间隙的状态跟踪。
- sequence 之前的同 Tick 事实顺序规则。

Gate：每一种 Simulation 消息都有明确 reducer 提交点；Runtime 事件不混入 TickOutput；失败 Tick 不发布部分事实。

### Phase 3 — Runtime Dispatcher 与 Feed

交付：

- BattleRuntime.onMessage(listener) observer surface，以及可信、只读的 reportDecisionAnalysis(request, text) 入口；DeepSeekDecision 通过可选 observer 复用完整 Call A visible strategyMemo。
- Runtime sequence / message ID / elapsedMs。
- Decision trigger reason 元数据，但不传给 LLM。
- Runtime lifecycle messages、Tick messageFacts 与 Call A 可见策略消息的统一排序；无效/过期请求不会进入 Feed。
- listener / subscriber 异常隔离。
- PokeMan Message Feed append-only 实现。
- 最近 N 条消息的有界缓存。
- runtime.run() 之前完成消息监听注册。

Gate：Feed 不包含 Active Request / Thinking State / Request Cancellation UI 逻辑；Battle 运行期间可读取有界历史，Battle 关闭时完成取消订阅与清空。

### Phase 4 — 固定并排 Message Panel

交付：

- Battle View 上半部分右侧 Message Panel；原有下半部分保持不变。
- Panel 宽度按上半部分可用内容宽度的 32% 计算，最大 600px；左上地图使用剩余宽度。
- 在 PokeMan 当前支持的分辨率与宽高比范围内，上半部分保持左右并排，不增加抽屉、覆盖层或模式切换；不要求适配游戏未支持的极端尺寸。
- 最新消息置顶。
- 历史滚动和新消息提示。
- 统一的 `【Actor】描述` 字符串模板、Actor / Skill 名称映射；Battle 事实与 Call A 可见策略消息都显示在同一 Panel，不再渲染单独的临时 Decision 文本。
- reduced motion 和基本无障碍支持。
- Camera / logical viewport 按左上地图容器 ResizeObserver 实际测量的内容宽高计算；组件首次报告、变化主动报告，子系统 RenderEvent 请求重报；不得按整个 Battle View 或上半部分未扣除 Panel 前的尺寸计算。

Gate：Panel 不依赖 AI 请求结束事件，不影响地图 / HUD / 下半部分；在项目当前支持范围的代表性 viewport 下，上半部分符合 32% / 600px 规则，地图 Presentation 使用左上地图容器自身的实际宽高。不把未支持的极端尺寸纳入验收，也不因此引入额外布局模式。

### Phase 5 — 完整战斗验收

交付：

- AI vs AI 完整战斗 E2E。
- 受击后旧请求失效、新请求发起的消息顺序测试；旧 Call A 迟到文本不可插入 Feed。
- 多段移动只产生一组 intent 消息的测试。
- 移动在 segment 间 idle 空隙被中断的测试。
- Replay v1 回归。
- Pause / Resume / Cancel / Battle End 回归。
- Panel 故障隔离和 Feed 生命周期测试。
- 固定并排布局的多视口测试、组件尺寸初次上报 / ResizeObserver 变化 / 子系统请求重报 / 子 Frame 遮挡后恢复重报 / 非法尺寸与相同尺寸去重。
- Call A 性能与策略质量测试记录、选定 profile 及理由。

Gate：消息正确性、战斗回归和布局约束通过；保留性能测试记录并完成合适 profile 的选择，不要求达到数值硬门槛。


## 9. 测试矩阵

### 9.1 Message Feed 单元测试

- 每次 append 只新增一条消息。
- 旧消息对象和内容不会被后续事件修改。
- Feed 不存在 update / close / resolve 单条消息的操作。
- sequence 严格递增，id 在单场 Battle 内唯一。
- UI 展示顺序为 sequence 倒序。
- 超出容量时只淘汰最旧消息。
- Battle 运行期间不因单次 AI 请求或消息完成而 clear；Battle 关闭（Runtime.close / Battle Frame 清理）后 Feed 已清空，订阅已解除。
- 单个 subscriber 抛错不影响其他 subscriber。
- formatter 对未知 Actor / Skill ID 有安全 fallback。
- Feed 不包含 requestStatus、activeRequest 或 thinkingActors。

### 9.2 Runtime / Simulation 事件测试

- 玩家可感知的 DecisionPort 请求在实际调用前产生一次 decision.started。
- initial、damaging_hit、plan_exhausted、plan_failed 按规则产生消息。
- prefetch、correction、内部重试不产生重复 decision.started。
- Call A 与 Call B 不分别产生决策状态卡；有效且玩家可感知的 Call A 可见文本只生成一次 decision.analysis_completed，Call B 不产生单独的开始/结束文案。
- Plan 只有在 Simulation acceptPlan 后才产生 decision.accepted。
- decision.accepted 忠实表达现有 v0 允许的 Plan：path 与 skill 可同时存在；非空 path 与显式 turn 不能同时存在；path 为空时允许 turn 与 skill。
- Plan 仅被模型返回但未通过验证时，不显示“已决定”。
- movement.started 只在移动意图第一段真正开始时产生一次。
- 多段路径的中间 segment 不产生额外 movement.started / completed。
- movement.completed 只在最终目的地抵达后产生。
- 移动在 segment 间 idle 空隙被伤害中断时，仍产生 movement.interrupted。
- 第一段移动无法启动时产生 movement.failed，不先产生 movement.started。
- skill.started 只在正式施法动作开始时产生；瞬发技能的 started 先于 resolved。
- damage.applied 的数值与最终 HP 结算完全一致。
- actor.defeated 每个 Actor 每场 Battle 只产生一次，且晚于致命伤害。
- battle.ended 只产生一次，payload 与最终 BattleResult 完全一致。
- 同一 Tick 的 messageFacts 顺序稳定。
- Runtime observer 抛错不影响 BattleResult。
- 内部 request cancellation 不会修改或删除历史消息。
- stale completion 不会产生虚假的 decision.accepted；迟到 Call A strategyMemo 不产生 decision.analysis_completed，prefetch / correction / retry 不刷出没有起始消息的策略文本。
- 受击后如果 Runtime 发起新的玩家可感知 Decision 请求，新的 decision.started 排在该 Tick 的受击事实之后。

### 9.3 核心场景验收

场景：角色 A 思考中，角色 B 攻击 A。

预期消息产生顺序：

1. 角色 A 开始分析战场情报。
2. 角色 B 发动雷电术。
3. 雷电术命中角色 A。
4. 角色 A 受到 15 点伤害。
5. 如果 A 有尚未完成的移动意图，角色 A 的移动被打断。
6. 旧请求在 Runtime 内部失效，不产生取消消息，也不修改第 1 条。
7. 只有 Runtime 确实发起新的 damaging_hit 决策轮次时，才产生“角色 A 根据新的战况重新评估行动”。

UI 最新消息置顶后，按 sequence 反向展示。若第 5 条或第 7 条没有发生，对应消息也不得凭空出现。

### 9.4 Presentation / Browser 测试

- 新消息只更新 Message Feed / Activity Panel，不修改 World / HUD 的 Gameplay state。
- Battle facts 与 Call A 可见策略文本进入同一 Feed 并正确按 sequence 最新置顶，统一 `【Actor】` 模板；非权威文本以 textContent 等纯文本方式呈现，不能执行 HTML。
- 用户阅读旧消息时不被强制滚回顶部。
- 长战斗消息缓存始终有界。
- Activity Panel DOM / formatter 出错不会导致 Battle Simulation 失败。
- 在 PokeMan 当前支持的游戏分辨率与宽高比范围内，Battle View 保持原有上下结构，上半部分始终左右并排。
- 上半部分右侧 Panel 宽度等于上半部分可用内容宽度的 32%，但不超过 600px；左上地图使用剩余宽度；下半部分保持现有布局。
- 不出现抽屉、覆盖层或布局模式切换；未支持的极端尺寸不属于本功能验收范围。
- Camera / logical viewport 使用左上地图容器自身的实际内容宽度和高度；验证初始可测量布局先建立、`battle.viewport.changed` 首次/resize 正向报告、`battle.viewport.request` 反向请求重报及 top-frame 恢复补报，BattlePresentationBuilder 接收的确实是 map-scoped viewport 而非全局 viewport；渲染的自身 inline width/height 不得反向控制实际布局。
- battle.ended 在关闭前按规则发布；Battle 关闭后 Feed 为空、subscription / DOM listener / 缓存引用已清理，不要求战后仍可见最后消息。

### 9.5 性能测试

- A0 / A1 / A2 使用相同 Observation 和 Prompt。
- Call A / Call B / total latency 分开统计。
- Provider usage 缺失时记录 unknown，不推测。
- Metrics Sink 同步抛错或异步失败时，Decision 结果不变。
- incomplete response / timeout / abort / malformed response 均正确处理。
- 保留各 profile 的实际延迟、Plan acceptance、correction、战术表现与样本量记录，记录最终选择理由；不设预设数值及统计显著性门槛。
- 普通 CI 不依赖真实 Provider credential；真实 Provider 测试显式 opt-in。


## 10. 预计代码影响面

以下是候选影响面，实施时应以实际代码为准，不要求为了清单而制造无必要抽象。

| 文件 / 模块 | 预计职责 |
|---|---|
| game-libs/battle/src/contracts.ts | BattleMessage 类型与 Runtime onMessage observer surface |
| game-libs/battle/src/simulation/plan.ts | RequestDecisionCommand 携带内部 trigger reason；correction 使用独立 reason |
| game-libs/battle/src/simulation/state.ts | 维护跨 motion segment 的 movement intent 元数据 |
| game-libs/battle/src/simulation/tick.ts | 生成有序 SimulationMessageFact，并在 TickOutput 暴露 messageFacts |
| game-libs/battle/src/simulation/runtime.ts | Dispatcher、sequence / elapsedMs、Decision started、Battle lifecycle 消息、非权威 Call A observer 的有效请求过滤和 Runtime timing |
| game-libs/battle/src/decision.ts 或新的版本化 Decision 实现 | Call A profile、Call A / B timing、Provider usage 与 Metrics Sink |
| game-libs/battle/browser/battle.browser.js | 唯一右侧 Message Panel、`【Actor】` 字符串模板的纯文本显示；地图组件的实测尺寸消息和尺寸请求处理（布局壳可由独立 UI 组件实现） |
| game-libs/battle/browser/battle.css | 上半部分左右分栏；右上 Panel 宽度 32% / 最大 600px、消息样式、独立滚动；地图容器占上半部分剩余宽度 |
| subsystems/battle.mjs | runtime.run() 前订阅 onMessage、创建 DeepSeek processMessageObserver、组装单 Feed / Panel、接入局部 Viewport 与 Presentation Events、管理 Battle 关闭清理 |
| game-libs/battle/test/decision.test.mjs | 性能 profile、usage、Metrics Sink 和 Provider 测试 |
| game-libs/battle/test/simulation.test.mjs | messageFacts、movement intent、产生时机和顺序 |
| game-libs/battle/test/presentation.test.mjs | Feed / Panel 隔离和固定布局测试 |
| game-libs/battle/test/browser-e2e.test.mjs | 消息排序、滚动、固定并排布局和多视口 E2E |

如果 Feed 逻辑需要独立文件，可在 PokeMan composition 层增加轻量模块；不要把 Feed 放入 Simulation Core，也不要为了它创建新的 PresentationPort。


## 11. 不可妥协的设计约束

1. **Message Feed 是事件历史，不是状态镜像。**
2. **一件值得玩家了解的事情发生一次，就产生一条独立消息；内部重试和后台预取不伪装成玩家事件。**
3. **历史消息不因后续 AI 请求状态而改变。**
4. **AI 请求取消是 Runtime 内部职责，不是 Panel 清理机制。**
5. **Runtime 是 Decision 请求与 Battle 生命周期事件的权威来源。**
6. **Simulation 是 Plan 接受、移动、技能、伤害和击倒事实的唯一权威。**
7. **移动意图与单段 motion segment 分离；多段路径不能刷屏，也不能漏报中断。**
8. **Runtime 统一分配 message ID / sequence / elapsedMs；sequence 决定顺序。**
9. **Call A 性能调参实验与 Message Feed 完全解耦；Feed 仅旁路读取当前已生成的可见 Strategy Memo，不改变 Call A/Call B 调用策略。**
10. **Replay v1 不因消息窗口而被隐式修改。**
11. **在 PokeMan 当前支持的游戏分辨率与宽高比范围内，保留 Battle View 原有上下结构，只将上半部分固定为左右并排；右上 Panel 为上半部分可用内容宽度的 32%，最大 600px；左上地图使用剩余宽度；不提供抽屉或覆盖层模式，也不扩大既有分辨率支持范围。**
12. **Message Feed / Panel 故障不能影响核心战斗。**
13. **不显示模型 hidden reasoning、Provider 原始错误或未经 Simulation 验证的行动结果。**


## 12. 完成定义

本方案完成需要同时满足：

- Call A 有可查的性能测试记录，候选 profile 的延迟、使用量和 Plan 质量观测可供后续调参参考。
- Call A / Call B 分段指标可采集；Provider usage 缺失时明确记录 unknown。
- v0 Decision 基线保持可用；依据测试记录选择性能合适的 profile 并记录理由，不以固定数值门槛决定是否完成。
- Runtime Events 与 Simulation Facts 的来源和责任边界清晰；Call A visible strategyMemo 是独立的非权威 Decision 观察事件，不混入 gameplay / Replay。
- 每一种权威战斗事实消息都有唯一权威来源、触发时机和确定顺序；AI 策略文本明确标记为非权威，统一进入同一有序 Feed。
- decision.accepted 如实表达已接受的合法 Plan：移动可与技能组合，显式 turn 不得与非空移动路径组合。
- 多段移动只展示一次移动意图的开始、完成或中断；segment 间受击不会漏报中断。
- 战斗事实和可见策略文本使用一致的 `【Actor】` 本地字符串模板并在同一 Panel 最新置顶，历史消息不会因为 AI 请求完成、失败或取消而被修改。
- 受击、技能结算、伤害、移动中断和重新发起决策等事件按真实发生顺序展示。
- battle.ended 只发布一次并携带最终 BattleResult。
- Message Feed 不维护 AI request state，不参与 Simulation。
- runtime.run() 前完成消息订阅；Battle 关闭（Runtime.close / Battle Frame 清理）时取消订阅并清空 Feed，不保留战后消息。
- Activity Panel 不与 World / HUD 共用必须原子成功的更新事务；消息文本与 gameplay RenderProjection 不混用。
- 在 PokeMan 当前支持的游戏分辨率与宽高比范围内，Battle View 保留原有上下结构，只将上半部分固定为左右并排；右上 Panel 为上半部分可用内容宽度的 32%，最大 600px，左上地图使用剩余宽度；下半部分保持现状。地图组件首次就绪和尺寸变化时经 Frame-targeted Presentation Event 上报 content box，子系统可经 RenderDomain.emit 请求重新上报，首次初始化无循环等待；不存在抽屉、覆盖层或模式切换。
- Replay v1、BattleResult、Pause / Resume / Cancel 和战后 Settlement 无回归。
- Panel / Feed / Metrics Sink 故障均不会影响核心战斗。

## 参考实现与契约

- [Battle v0 Decision](./BATTLE_V0_DECISION.md)
- [Battle v0 Simulation](./BATTLE_V0_SIMULATION.md)
- [Battle v0 Contracts](./BATTLE_V0_CONTRACTS.md)
- [Battle v0 Presentation](./BATTLE_V0_PRESENTATION.md)
- [Decision implementation](../src/decision.ts)
- [Simulation Runtime](../src/simulation/runtime.ts)
- [Simulation Tick](../src/simulation/tick.ts)
- [PokeMan Battle Subsystem](../../../subsystems/battle.mjs)
