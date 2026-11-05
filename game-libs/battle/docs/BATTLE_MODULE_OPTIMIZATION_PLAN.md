# Battle 模块性能与战斗活动面板改造计划

> 状态：Proposal / Implementation Plan，尚未冻结为实现契约。
>
> 目标分支：\`plan/battle-module-optimization\`
>
> 适用范围：\`game-libs/battle\`，以及 PokeMan Battle Subsystem / Browser Presentation 的必要集成改造。
>
> 基线：从 \`main\` 创建本分支。本文只定义改造计划，不修改 Battle v0 的既有规则、Decision Workflow 或 Replay ABI。

## 1. 背景与问题定义

当前试玩反馈包含两个相互关联、但必须分别解决的问题：

1. **战斗推进等待过长。** 实测已经将主要瓶颈定位到 DeepSeek Decision Workflow 的 Call A（Analyze + Strategize）。当前 Call A 使用高强度 reasoning，完整响应返回后才会进入 Call B。不能再把这类等待笼统归因于 Simulation Tick 或动画。
2. **等待过程对玩家不可见。** AI 角色在远程决策期间，战斗画面缺少足够的过程反馈。玩家无法判断角色是在思考、请求失败，还是战斗已经停止推进。

本计划分为两条工作流：

- **Track A — Decision Latency：** 通过测量和受控调参降低 Call A 的完成时间，同时验证策略质量。
- **Track B — Battle Activity Feed：** 把已经发生的决策生命周期和 Simulation 事实转化为实时消息，在战斗画面右侧展示，最新消息置顶。

两条工作流可以并行开发，但验收标准独立。Activity Feed 不能掩盖性能回归；性能优化也不能成为向玩家展示模型内部推理文本的理由。

## 2. 目标、非目标与设计原则

### 2.1 目标

- 建立 Call A 的可重复基准和分阶段耗时数据。
- 验证较低 reasoning effort 是否能显著缩短 Call A，同时保持可接受的 Plan 合法率和战术质量。
- 将 Decision started、Plan accepted、Movement、Skill、Damage、Defeat 等事实转换为稳定、可排序的 Battle Activity Event。
- 在 Battle View 右侧增加独立消息 Panel；桌面端与 PWA 均可用，小屏幕不挤压战场。
- 让活动消息成为只读观察能力，不影响 Simulation、Replay、HP、Action、BattleResult 或 Contract Settlement。
- 保持 v0 规则权威和既有测试基线，所有新行为有明确的契约与测试。

### 2.2 非目标

本轮不做以下事情：

- 不重写 Battle Simulation，不调整伤害、移动、技能范围、前摇、后摇、保护帧或胜负规则。
- 不合并 Call A / Call B，不改变 Call B 的 Structured Output / JSON Schema 生成职责。
- 不允许 LLM 直接修改 HP、位置、Actor Action 或 BattleResult。
- 不把模型的 hidden reasoning、逐 token 思维过程、完整 Prompt 或 API 响应原文展示给玩家。
- 不把 Activity Event 当作新的 Gameplay Command、Replay authority 或 Event Sourcing 写模型。
- 不引入通用 Event Bus、通用 Task Framework 或新的大型调度抽象。
- 不在没有实测证据时，直接降低 Token 上限、缩短超时或增加自动重试。
- 不在本轮实现多人战斗、Player Guidance、通用剧情日志或跨游戏分析平台。

### 2.3 必须保持的原则

1. **Decision proposes, Simulation disposes。** AI 只提出候选 Plan，Simulation 负责验证和执行。
2. **Gameplay facts are authoritative。** 消息只能描述已经提交的游戏事实，不能把模型意图提前描述成已发生的动作。
3. **Observation is non-authoritative。** Activity Feed 是旁路观察能力，失败时不得改变战斗结果。
4. **No chain-of-thought exposure。** 玩家看到角色“正在分析战局”以及被接受的行动摘要，不看到模型内部推理。
5. **v0 compatibility first。** 当前 v0 冻结契约不应被隐式改写；需要新行为时，通过明确的版本化策略和文档演进。

## 3. 当前实现基线

以下是本计划对应的代码结构和约束。实现前应以目标分支最新代码再次核对行号和具体签名。

| 层次 | 现有位置 | 当前职责 / 约束 |
|---|---|---|
| Decision Workflow | \`game-libs/battle/src/decision.ts\` | DeepSeek 两阶段请求；Call A 先返回 Strategy Memo，随后 Call B 生成结构化 Plan |
| Decision Runtime | \`game-libs/battle/src/simulation/runtime.ts\` | 管理 DecisionPort 调用、请求取消、异步 completion inbox、Battle 生命周期 |
| Simulation Reducer | \`game-libs/battle/src/simulation/tick.ts\` | 同步处理 Tick、验证 Plan、提交移动/技能/伤害事实 |
| Replay | \`game-libs/battle/src/simulation/replay.ts\` | 记录 Decision completion、Movement、Skill、Damage、Protection 等可确定性事实 |
| Public Contracts | \`game-libs/battle/src/contracts.ts\` | 定义 DecisionPort、PresentationPort、RenderProjection、BattleRuntime 等跨层契约 |
| Presentation | \`game-libs/battle/src/presentation.ts\` | 将 RenderProjection 翻译为稳定 RenderDomain 更新 |
| Browser | \`game-libs/battle/browser/battle.browser.js\`、\`battle.css\` | Battle View、Actor、Effects、HUD 的浏览器呈现 |
| PokeMan composition | \`subsystems/battle.mjs\` | 组装 Definition、DeepSeek Decision、Presentation、Simulation Runtime，并负责战后结算 |

### 3.1 Call A 的当前行为

当前 v0 Decision Workflow 的语义为：

~~~text
DecisionRequest
  → Call A: Analyze + Strategize
  → Strategy Memo
  → Call B: Materialize
  → structured Plan JSON
  → local parsing / DecisionCompletion
  → Simulation Tick consumes completion
~~~

当前 Call A 的主要配置：

| 配置 | 当前基线 |
|---|---|
| Model | \`deepseek-flash\` |
| Reasoning effort | \`high\` |
| Output format | 普通文本 |
| Max output tokens | \`65536\` |
| Stream | \`false\` |
| Provider timeout | \`60000 ms\` |
| 请求关系 | Call A 完成后才执行 Call B |

当前 v0 Decision 设计文档还记录了一项重要兼容性事实：曾尝试在 \`reasoning.effort=high\` 时把 \`max_output_tokens\` 降到 \`8192\`，但请求可能在产生任何 visible strategy output 前就因 reasoning token 消耗而终止。因此，不能把“65536 很大”直接等同于“每次都生成了 65536 tokens”，也不能在没有 usage 数据时直接把上限砍到 8192。

本轮调参应遵循：

- 先固定 Token 上限，只比较 reasoning effort。
- \`high\` 作为当前对照组。
- \`low\` 作为第一候选组。
- \`none\` 仅在 Provider 当前模型能力确认支持且策略质量测试通过时纳入候选。
- 不把 \`medium\` 当作低成本档位；当前 Provider 兼容说明指出其映射行为不能达到降低 reasoning 的目的。
- reasoning effort 确认后，再根据真实 reasoning / output usage 调整 Token 上限。
- Call B 保持不变，以免实验同时改变两个变量。

### 3.2 Simulation / Presentation 的现有边界

- Battle Tick 固定为 200 ms；Simulation 使用自己的 Clock 和 scheduler 推进。
- Decision Promise completion 只进入 inbox，在后续 Tick 边界被消费；Promise callback 不直接修改权威 Battle State。
- Runtime 已有 \`#invokeDecision()\`、\`onPause()\`、\`onTransition()\` 等生命周期入口，可以作为 Activity 观察事件的来源。
- Tick 输出已包含 Replay Tick facts 和 Decision records。Replay facts 已覆盖移动开始/失败/中断、技能结算、伤害和保护等事实。
- \`RenderProjection\` 当前只表达 Scene/Actor/Effect 视觉事实，不包含 LLM completion timing。
- 现有 Presentation 设计明确排除 Decision inbox / LLM completion timing；不应把 Decision latency 塞进 RenderProjection。
- 当前 Presentation 使用稳定 Render Tree：正常战斗变化通过已有节点的 data update 表达，不应每产生一条消息就创建一个 RenderNode。
- 当前 Battle View 主要包含 world 和 HUD 区域；右侧 Activity Panel 需要明确扩展布局契约，而不是临时叠加一个 DOM 旁路。

## 4. Track A：Call A 性能优化

### 4.1 先补齐测量，再开始调参

新增 Call A / Call B 分阶段耗时统计。每次 Decision 至少记录：

~~~ts
type DecisionTimingMetric = {
  requestId: string;
  actorId: string;
  attempt: 0 | 1;
  stage: "call_a" | "call_b" | "local_parse";
  startedAtMs: number;
  completedAtMs: number;
  durationMs: number;
  outcome: "success" | "provider_error" | "timeout" | "aborted" | "invalid_response";
  inputTokens?: number;
  reasoningTokens?: number;
  outputTokens?: number;
};
~~~

以上为计划形状，不要求一次性冻结成公共 ABI。计时使用可注入的 monotonic clock；不要用系统墙钟计算 duration。

**最小测量要求：**

- Call A：请求开始、HTTP 首响应（若 transport 可观测）、完整响应、解析完成。
- Call B：请求开始、完整响应、结构化结果解析完成。
- 整体：DecisionRequest 发起到 DecisionCompletion 入 inbox 的总时长。
- Provider usage：input / reasoning / output tokens；字段缺失时记录 unknown，不猜测。
- 结果：Plan accepted / rejected、correction attempt、Decision failure。
- 统计：p50 / p90 / p95 / max；按场景、Actor、reasoning profile 分组。

**日志与隐私：**

- 允许记录 requestId、actorId、profile、耗时、HTTP status、Provider error code 和 token usage。
- 禁止记录 API Key、Authorization header、完整 Prompt、原始模型响应和 hidden reasoning。
- 默认只做本地/开发环境诊断；是否接入远端 telemetry 另行决策。
- 诊断回调自身必须是 best-effort，抛错不能影响 Decision 结果。

### 4.2 建立可复现基准

准备固定的 Decision Observation 样本集，至少覆盖：

1. 双方距离较远，需要寻路。
2. 已在技能射程内，可以直接攻击。
3. 目标移动或受到保护，当前攻击窗口无效。
4. 自身 HP 较低，需要调整行动。
5. 路径受阻或前一次 Plan 被 Simulation 拒绝。
6. 同一 Tick 双方并发请求。

每个样本固定 authoritative facts、输入顺序和场景配置。对真实 Provider 的延迟测试应分批、交错运行不同 profile，避免某一组恰好遇到 Provider 高负载时段。

建议每个 profile / 样本组合至少采集 30 次；对最终候选配置再扩大到 50 次以上。单次试玩结果不作为调参结论。

### 4.3 调参实验矩阵

采用单变量实验，不要同时改 reasoning、Prompt、Token 上限和请求模式。

| 实验 | Reasoning | Max output tokens | Prompt | 目的 |
|---|---|---:|---|---|
| A0 基线 | high | 65536 | 当前 | 建立对照 |
| A1 候选 | low | 65536 | 当前 | 单独验证降低 reasoning 的效果 |
| A2 候选 | none（Provider 支持时） | 65536 | 当前 | 验证关闭 reasoning 的速度与质量边界 |
| A3 Token 调优 | 通过 A1/A2 选出的档位 | 根据 usage 分布确定 | 当前 | 在不截断的前提下减少过大的预算 |
| A4 Prompt 精简 | 已选 reasoning / token 配置 | 已选值 | 精简版 | 验证减少冗余输入是否进一步改善延迟 |

**实验约束：**

- A0/A1/A2 必须使用完全相同的输入样本和 Prompt。
- A0/A1/A2 期间不改 Call B、不改 Simulation、不改动画。
- A3 根据 reasoning + visible output 的真实 usage 分布确定上限，并保留足够安全余量；必须测试 truncated / incomplete response。
- A4 只能移除重复说明、无用序列化冗余或不影响决策的重复字段；不能静默丢弃合法技能、地图通行性、Actor 状态、planningOrigin、recentEvents 等 authoritative facts。
- 任何 profile 都必须处理 Provider 超时、取消、HTTP error、空 Strategy Memo、截断响应和 malformed response。
- 不增加盲目重试；重试策略的任何变化都需要单独测量并测试成本与取消语义。

### 4.4 Prompt 与输入体积优化

在 A0 基线完成后，检查 Call A 的输入：

- 统计序列化前后字节数和 Provider input token 数。
- 检查是否存在重复的 Actor / Skill / PlanConstraints 描述。
- 保持明确的 planningOrigin 语义，不能将其误写为 self.tile。
- 保持 authoritative battle facts 与模型建议的边界。
- 让输出目标更短、更可物化：只要求短期战术意图，不要求冗长战况复述。
- 限制 visible Strategy Memo 的目标长度，但不要通过低质量截断字符串实现。
- Prompt 版本应可识别，便于把质量与延迟指标关联到具体配置。

### 4.5 Streaming 的定位

当前 Call A 使用非流式响应。可以在 reasoning profile 实验之后，单独评估 Provider streaming：

- Streaming 的主要潜在收益是降低首个可见输出时间（TTFT），不保证缩短完整响应时间。
- Call B 仍然需要完整 Strategy Memo，因此不能因为首 token 提前到达就认定下一步行动已可执行。
- 不向玩家逐 token 输出分析文本或 hidden reasoning。
- 如启用 streaming，只允许把它用于内部进度观测、完整响应拼装和安全取消；必须验证断流、取消、部分响应、超时和最终 usage。
- 玩家侧的“角色正在思考”由 Activity Feed 即时提供，不依赖模型 streaming。

### 4.6 Fast Profile 的启用门槛

通过实测选出候选配置后，再定义正式 profile，例如 \`responsive\` 与 \`quality\`。profile 名称和默认值在实现阶段确认，不在本计划中预先冻结。

建议的初始验收目标：

- 候选 profile 的 Call A p50 相比 A0 至少降低 30%。
- p95 相比 A0 至少降低 20%，且不能靠大量超时或失败换取较低的成功请求耗时。
- Plan 首次接受率相对基线下降不超过 2 个百分点。
- correction attempt 比例不出现显著恶化。
- 固定场景集中的关键战术行为无明显退化；对战结果差异必须结合样本量分析，不用单场胜负判断。
- 空 memo、截断响应、Schema 失败和 Provider error 均有可诊断的失败结果。

如果低 reasoning 无法达到质量门槛，保留 high 作为默认；可以继续优化输入、Prompt 或 Provider 连接，但不能为了速度绕过 Simulation 校验。

## 5. Track B：Battle Activity Feed

### 5.1 产品目标与布局

在 Battle View 右侧增加常驻 Activity Panel：

- 桌面端：左侧战场为主体，右侧显示消息流。
- Panel 顶部显示当前正在思考/等待决策的 Actor。
- 下方显示历史事件，最新消息在最上面。
- 消息区内部滚动，不带动整个 Battle View 滚动。
- 新消息使用轻量淡入，不遮挡技能动画和 HP 表现。
- 小屏幕 / 窄视口：改为可展开的抽屉或覆盖层，不强制挤压地图宽度。
- Panel 不提供任何可改变 Battle State 的交互；第一版只读。

桌面端初始宽度建议从 300–360 px 作为设计试验值，不作为硬性 ABI。需要根据实际 viewport、tile 尺度和现有 camera/layout 计算验证。

### 5.2 事件来源与真实性规则

消息必须由 Runtime / Simulation 已经知道的事实产生，不能让 LLM 生成事件消息。

| 玩家看到的消息 | 事件来源 | 发布时机 |
|---|---|---|
| 角色 A 开始思考 | Runtime Decision lifecycle | 调用 DecisionPort 前立即发布 |
| 角色 A 决定使用某技能 / 采取某路线 | Simulation Decision record | Plan 通过 validatePlan 并被 acceptPlan 接受后 |
| 角色 A 的行动方案无效，正在重新规划 | Simulation validation outcome | Plan 被拒绝且进入 correction attempt 后 |
| 角色 A 开始移动 | Simulation movement fact | 移动动作在 reducer 中正式提交时 |
| 角色 A 抵达目标位置 | Simulation scheduled movement completion | Actor committed tile 更新后 |
| 角色 A 开始施放某技能 | Simulation action transition | windup/action 在 reducer 中正式开始时 |
| 角色 B 命中角色 C | Simulation skill resolution | 技能 resolve 结果已提交后 |
| 角色 C 受到 N 点伤害 | Simulation damage fact | HP 结算已提交后 |
| 角色 C 被击倒 | Simulation terminal actor state | HP 首次降至 0 并提交 dead 状态后 |
| Battle 暂停 / 恢复 / 结束 | Runtime lifecycle | 对应状态转换完成后 |

**严格禁止提前播报：**

- 模型返回文本，不等于 Plan 已接受。
- Plan 被接受，不等于移动已经开始。
- 角色进入 windup，不等于命中。
- 技能命中，不等于目标一定受到伤害（例如免疫或伤害为 0）。
- 只有 HP 结算确认后才能播报伤害；只有 Actor 进入 dead 状态后才能播报击倒。

同一 Tick 内多个事实必须使用稳定顺序。建议优先遵循 reducer / Replay fact 的确定性顺序；不能依赖 Promise completion 的偶然到达顺序。

### 5.3 事件模型

建议新增独立的 Battle Activity Contract，采用 discriminated union，不使用无约束的 \`Record<string, unknown>\` 作为长期公共契约。

初步 envelope：

~~~ts
type BattleActivityBase = {
  readonly eventId: string;
  readonly sequence: number;
  readonly battleId: string;
  readonly tick: number | null;
  readonly actorId?: string;
};

type BattleActivityEvent =
  | (BattleActivityBase & {
      readonly type: "decision.started";
      readonly actorId: string;
      readonly requestId: string;
    })
  | (BattleActivityBase & {
      readonly type: "decision.plan_accepted";
      readonly actorId: string;
      readonly requestId: string;
      readonly plan: {
        readonly destination?: { readonly x: number; readonly y: number };
        readonly skillId?: string;
        readonly targetActorId?: string;
      };
    })
  | (BattleActivityBase & {
      readonly type: "decision.plan_rejected";
      readonly actorId: string;
      readonly requestId: string;
      readonly reason: string;
    })
  | (BattleActivityBase & {
      readonly type: "decision.failed";
      readonly actorId: string;
      readonly requestId: string;
      readonly code: string;
    })
  | (BattleActivityBase & {
      readonly type: "movement.started" | "movement.completed";
      readonly actorId: string;
      readonly from?: { readonly x: number; readonly y: number };
      readonly to: { readonly x: number; readonly y: number };
    })
  | (BattleActivityBase & {
      readonly type: "skill.started" | "skill.resolved";
      readonly actorId: string;
      readonly skillId: string;
      readonly targetActorId?: string;
      readonly result?: "hit" | "immune" | "miss" | "invalid";
    })
  | (BattleActivityBase & {
      readonly type: "damage.applied";
      readonly actorId: string;
      readonly targetActorId: string;
      readonly skillId: string;
      readonly amount: number;
      readonly hpAfter: number;
    })
  | (BattleActivityBase & {
      readonly type: "actor.defeated";
      readonly actorId: string;
      readonly sourceActorId?: string;
    })
  | (BattleActivityBase & {
      readonly type: "battle.paused" | "battle.resumed" | "battle.ended";
      readonly reason?: string;
    });
~~~

这是用于讨论的类型草案。实现时应以最小必要字段为准：

- \`eventId\` 用于去重；同一事实重复提交不能显示两次。
- \`sequence\` 在单场 Battle 内单调递增，决定消息排序。
- \`tick\` 表示游戏逻辑时间；Decision 开始等 Tick 外事件可为 null 或最近 committed Tick，最终语义需要在契约评审时统一。
- \`requestId\` 用于关联 thinking 与 decision completion，不能只按 actorId 关联，因为同一 Actor 可能先失败再发起 correction。
- \`reason\` / \`code\` 只能使用面向 UI 的安全错误分类，不包含原始 Provider 响应或 Prompt。
- 不把 wall-clock latency 写入 Replay authority；UI 可以在收到 thinking.started 后本地显示经过时间。

### 5.4 事件发布 API 与架构边界

推荐以 Runtime observer API 暴露事件，例如：

~~~ts
interface BattleRuntime {
  // Existing methods remain unchanged.
  onActivity(listener: (event: BattleActivityEvent) => void): () => void;
}
~~~

发布路径：

~~~text
Runtime / Simulation committed facts
          ↓
BattleActivityEvent (typed, ordered)
          ↓
BattleRuntime observer
          ↓
PokeMan Battle composition subscribes
          ↓
Battle Activity Feed adapter
          ↓
stable Browser RenderNode
          ↓
right-side Activity Panel
~~~

职责边界：

- Runtime 在 \`#invokeDecision()\` 前发布 \`decision.started\`。
- Tick reducer 只产生本 Tick 已提交的 Activity facts；Runtime 在同步 reducer 结束后统一分配 sequence 并通知 observers。
- Activity observer 不得在 reducer 调用栈内执行异步操作，也不得回写 Simulation。
- listener 抛错必须被隔离；单个 UI listener 失败不能让 Runtime reject 或改变 BattleResult。
- Activity adapter 负责有限缓存、格式化和 UI 更新；它不负责判定技能是否命中或 Plan 是否有效。
- 不将 Activity events 添加到当前 \`RenderProjection\`。Decision timing 与 gameplay projection 继续保持分离。
- 不为每条消息创建 RenderNode；Activity Panel 应使用一个稳定节点和一个有界 collection payload。

需要评审的实现选择：Activity Panel 与现有 Battle Presentation 共用一个 RenderDomain，但事件接口保持独立；不要为了共享 RenderDomain 而把 Activity 语义塞入 PresentationPort / RenderProjection 的既有 v0 ABI。

### 5.5 Activity Feed 的状态管理

Feed 至少包含两部分：

1. **Active Decisions：** 正在等待响应的 Actor 列表，按 requestId 管理。
2. **Recent Events：** 最近 100 条已完成事件，按 sequence 倒序展示。

状态转换：

- \`decision.started\`：创建 active entry，展示“角色 A 正在分析战局……”。
- \`decision.plan_accepted\`：关闭对应 requestId 的 active entry，追加已接受行动摘要。
- \`decision.plan_rejected\`：关闭旧 request entry，追加“行动方案未通过规则校验”；如果 Runtime 发起 correction，新 request 的 started 事件会建立新的 active entry。
- \`decision.failed\`：关闭对应 active entry，展示简洁错误状态；具体是否暂停由既有 Decision failure policy 决定，Feed 不做决策。
- Battle pause：停止 active entry 的 elapsed display 或标记为暂停；不能继续显示成正在正常推进。
- Battle resume：对仍有效的 request 恢复等待展示。
- Battle terminal / close：清理 active entries，保留最终消息直到 Scene 被关闭。

UI 行为：

- 新消息始终插入列表顶部。
- 玩家停留在顶部时自动跟随新消息；玩家向下阅读旧消息时不强制跳回顶部。
- 有新消息但未跟随时显示“有 N 条新消息 / 回到最新”提示。
- 不每秒追加“仍在思考”消息；elapsed timer 只更新 active entry 的显示。
- 对同一 Tick、同一目标的多段伤害，可在 UI 层合并成简短摘要，但底层事件仍保持可追踪的事实粒度。
- 历史条数有上限，默认 100；达到上限删除最旧记录。
- Actor / Skill 显示名称从 Content / roster 映射；缺失时使用稳定 ID fallback。
- 所有文本由本地 formatter 生成并支持后续本地化；不依赖 LLM 生成播报。

### 5.6 事件类型与文案

第一版只做简短、事实性文案：

| 类型 | 示例文案 |
|---|---|
| THINKING | 角色 A 正在分析战局…… |
| DECISION | 角色 A 决定使用「火焰斩」 |
| MOVEMENT | 角色 A 向目标位置移动 |
| SKILL | 角色 B 开始施放「雷电术」 |
| COMBAT | 角色 B 命中角色 C |
| DAMAGE | 角色 C 受到 12 点伤害（HP 28/40） |
| DEFEAT | 角色 C 被击倒 |
| STATUS | 战斗已暂停 / 战斗继续 / 战斗结束 |

文案不要夸大事实：

- \`decision.plan_accepted\` 只能表达“决定 / 计划”，不能写“成功攻击”。
- \`skill.started\` 表达“开始施放”，不能写“命中”。
- \`skill.resolved\` 的 miss / immune / invalid 必须与 hit 区分。
- \`damage.applied\` 显示 Simulation 最终计算的 damage / hpAfter，不自行计算。
- \`actor.defeated\` 每个 Actor 每场 Battle 只出现一次。

### 5.7 Browser 布局与稳定 Render Tree

涉及文件预计包括：

- \`game-libs/battle/browser/battle.browser.js\`
- \`game-libs/battle/browser/battle.css\`
- \`game-libs/battle/src/presentation.ts\`
- \`game-libs/battle/src/contracts.ts\`
- \`game-libs/battle/docs/BATTLE_V0_PRESENTATION.md\` 的后续版本化说明或新增 Activity Presentation 设计文档

建议为 Activity Panel 增加一个固定 visual slot / RenderNode，例如：

- key：\`battle:activity\`
- tag：\`lr-battle-activity\`
- view slot：\`activity\`

最终名称需在实现前核对现有 RenderNode naming convention，并统一写入契约。

要求：

- 在初始 RenderDomain tree 创建时建立 Activity 节点。
- 后续只更新该节点的 data，不增删节点，不调用 \`domain.replace()\`。
- Activity data 只包含最近有限条消息和 active decisions；不把整个 Replay 或 DecisionRequest 塞进 Browser payload。
- 对 Browser payload 设置明确容量上限，避免长战斗导致 RenderData 无限增长。
- Panel 更新与 World / HUD 更新解耦；Activity 更新失败只产生 diagnostic，不得触发 Presentation fatal 或 Battle failure。
- 视口宽度变化时重新计算 world 可用区域和 camera；右侧 Panel 不得覆盖关键地图区域。
- Footer HUD 继续保持原有语义，不把 Activity 消息塞进 HUD。

桌面端建议采用 World + Activity 两列；窄屏采用折叠 Drawer / Overlay。具体断点由现有 viewport/layout 规则和 E2E 实测确定，不在 Core Simulation 中引入屏幕尺寸判断。

## 6. Replay、Pause、Cancel 与异常语义

### 6.1 Replay

- Activity Event 是运行时观察数据，不是当前 Replay v1 的新增权威字段。
- Replay 的 gameplay event 可以从 Replay Tick facts / Decision records 重新生成。
- Live Decision 的实际等待时长不进入 Replay；Replay 不重放真实网络 latency。
- Replay 模式不应伪造真实 LLM thinking duration。可以只展示被重放的已接受决策和 Simulation 事实，或展示瞬时的“重放决策”提示。
- 如果未来需要保存完整可回放的 Activity transcript，应单独设计 Replay version amendment，不在本轮顺手扩展。

### 6.2 Pause / Resume

- Host background 或 decision-circuit pause 时，Panel 应显示明确暂停状态。
- Pause 期间不追加正常进行中的 Simulation 事件。
- 如果 Provider completion 在 pause 期间进入 inbox，既有 Runtime 仍在 resume 后的 Tick 边界消费；Feed 不得提前宣称 Plan 已接受。
- Resume 后继续显示仍有效的 active request；已经取消或过期的 request 必须关闭。

### 6.3 Cancel / Close

- Battle cancel / Frame abort 后停止接收新事件。
- 清理 observer subscription、timer、DOM listener 和缓存引用。
- 已经排队但属于旧 session 的迟到事件必须被 session/battle identity 丢弃。
- Activity Feed close 不得影响既有 Contract Settlement 和取消语义。

### 6.4 Activity 失败降级

- Activity listener / formatter / Browser node 更新失败只影响消息区域。
- 失败可通过 diagnostics 记录，但不允许抛到 Simulation 主路径。
- Panel 无法初始化时，Battle Arena / HUD 仍可正常运行。
- 不因 Activity Feed 容量达到上限而暂停或失败战斗；只淘汰最旧展示消息。

## 7. 实施阶段与交付物

### Phase 0 — Baseline & Observability

**目的：** 建立可比较的 Call A 基线，不改行为。

交付物：

- Call A / Call B / local parse timing instrumentation。
- usage / status / outcome 采集。
- 固定 Observation 样本集和真实 Provider smoke 测试说明。
- 基线报告：p50 / p90 / p95、token usage、Plan acceptance、failure / correction rate。

验收：

- 统计数据能按 requestId / actorId / stage 关联。
- 不记录 API Key、Prompt 或模型内部推理。
- Instrumentation 异常不影响战斗。
- 当前 high / 65536 基线可重复测量。

### Phase 1 — Call A Responsive Profile

**目的：** 找到速度与策略质量之间可接受的配置。

交付物：

- 可明确选择的 Decision profile / provider policy。
- low / none（如支持）对照实验。
- Token 上限基于真实 usage 的二次实验。
- Prompt 精简实验与配置版本标识。
- Fast candidate 的质量与延迟报告。

验收：

- 达到 §4.6 的延迟目标或形成明确的未达标结论。
- Plan 仍必须通过原有 Simulation validation。
- Call B 请求体和职责无非必要变化。
- high fallback 可用；不符合质量门槛的 profile 不作为默认。
- Decision timeout / abort / malformed response 测试通过。

### Phase 2 — Activity Contract & Runtime Events

**目的：** 从 Core 输出可信、稳定、只读的活动事件。

交付物：

- Typed BattleActivityEvent contract。
- Runtime observer API（如 \`onActivity\`）。
- Decision started / accepted / rejected / failed 事件。
- Simulation movement / skill / damage / defeat 事件。
- sequence、eventId、requestId 关联与 listener failure isolation。

验收：

- 所有事件只在对应事实提交后发布。
- 同一事实不重复发布。
- 多 Actor 并发时顺序稳定。
- listener 抛错不改变 BattleResult / Replay。
- 没有把 Decision completion timing 加入 RenderProjection。
- Replay v1 schema 不发生无意变化。

### Phase 3 — Activity Feed & Browser Panel

**目的：** 完成玩家可见的实时消息体验。

交付物：

- 有界 Activity Feed state。
- active thinking 列表。
- 本地 formatter / Actor / Skill 名称映射。
- 固定 Activity RenderNode。
- 右侧 Panel、滚动、最新消息置顶、未读提示。
- Desktop / PWA / narrow viewport 适配。

验收：

- 最新消息位于顶部，sequence 严格递减展示。
- 同时两个 Actor 思考时，两条 active entry 都能正确显示。
- Plan reject / correction 不会错误地关闭新 request 的 thinking 状态。
- 玩家滚动阅读旧消息时不会被新消息强制拉回顶部。
- 长战斗中消息缓存始终有界。
- Panel 更新不会造成 World / HUD Render Tree structural churn。
- Activity Panel 故障不会中断战斗。

### Phase 4 — End-to-end Qualification & Documentation

**目的：** 证明性能、业务规则和 UI 观察能力协同工作。

交付物：

- 固定场景的真实 DeepSeek qualification 结果。
- Simulation / Presentation / Browser / PWA E2E 结果。
- Replay / pause / cancel / stale event 回归结果。
- 更新后的 Decision profile、Activity Contract、Presentation 与测试矩阵文档。

验收：

- Fast profile 的延迟和质量门槛通过。
- AI vs AI 战斗能持续推进，thinking / action / damage 事件顺序正确。
- Pause、resume、cancel、battle terminal 都能正确结束 active entries。
- PWA 与 Desktop 行为一致。
- 既有 Battle v0 gameplay / settlement qualification 无回归。

## 8. 测试计划

### 8.1 Decision 单元与 Provider 测试

目标文件：\`game-libs/battle/test/decision.test.mjs\`

- reasoning profile 正确写入 Call A request body。
- A0/A1/A2 使用相同 Prompt 和 Observation。
- Token cap 不被误认为实际 token usage。
- usage 字段缺失、异常、Provider 不返回 usage 时可安全处理。
- 空 memo、截断响应、incomplete response、malformed response 均正确失败。
- Call A / Call B timeout 与 AbortSignal 语义正确。
- instrumentation callback 抛错不影响 DecisionCompletion。
- Call B Structured Output Schema 与现有 Plan parser 不回归。
- 真实 Provider smoke 为显式 opt-in，不进入普通 credential-free CI。

### 8.2 Simulation Activity 测试

建议新增 \`game-libs/battle/test/activity.test.mjs\`，或按现有测试组织合并到 simulation 测试。

- Decision invocation 前立即发布 thinking.started。
- Plan 只有在 validate + accept 后才发布 plan_accepted。
- Plan reject 后发布 rejection；correction request 有独立 requestId。
- movement started / completed / interrupted 的发布时机与 committed state 一致。
- skill started 与 skill resolved 不混淆。
- miss / immune / invalid 不产生 damage.applied。
- damage.applied 的 amount / hpAfter 与 ReplayDamageFact 完全一致。
- hpAfter 首次为 0 时只发布一次 actor.defeated。
- 同一 Tick 多事件 sequence 稳定。
- duplicate eventId 被 Feed 去重。
- observer 抛错、unsubscribe、close、迟到事件不影响 Simulation。
- Replay 模式不调用真实 Provider，不重放 live latency。

### 8.3 Browser / Presentation 测试

目标文件：\`game-libs/battle/test/presentation.test.mjs\`、\`browser-e2e.test.mjs\`

- 初始 RenderDomain 一次性创建 Activity 节点。
- 新消息只更新已有节点 data。
- Feed 达到容量上限时淘汰最旧消息。
- 新消息插入顶部。
- scroll-at-top 自动跟随；scroll-away 不抢焦点并显示 unread。
- 多 Actor thinking 状态并列显示。
- 长 Actor / Skill 名称、缺失 Content fallback、错误文案长度安全。
- resize 后 world / camera / panel 不重叠。
- 低高度、小宽度、触屏布局可用。
- Activity 节点更新失败时 World / HUD 继续可用。
- pause / resume / cancel / close 后无残留 timer / listener / stale event。

### 8.4 E2E 场景

至少覆盖：

1. 正常 AI vs AI：thinking → accepted decision → movement → skill → damage → defeat。
2. Call A 延迟较长：Panel 立即显示 thinking，战场保持可见，响应后消息更新。
3. Call A 失败 / timeout：不显示虚假的行动成功消息；既有 failure / pause policy 生效。
4. Plan 被拒绝并 correction：旧 request 状态关闭，新 request 状态正确建立。
5. 双方同时思考：两个 active entries 独立计时、独立结束。
6. 一方攻击另一方：skill started、skill resolved、damage、defeat 的顺序正确。
7. Host background / decision-circuit pause：暂停标记正确，不产生虚假进度。
8. 退出 Battle：feed 订阅和 UI 资源全部清理。
9. Replay：只重放确定性事实，不伪造真实模型耗时。

## 9. 主要风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| low / none reasoning 战术质量下降 | 角色行动质量变差、Plan reject 增多 | 固定样本 A/B、记录 acceptance / correction、保留 high fallback |
| 仅降低 max_output_tokens 导致截断 | Call A 失败或空 memo | 先调 reasoning，后依据 usage 调 Token cap；增加 incomplete response 测试 |
| 把模型返回误当成已执行动作 | 玩家看到错误消息 | 只在 Simulation commit 后发布决策/动作/伤害事件 |
| Activity listener 阻塞 Tick | 战斗推进变慢 | observer best-effort、同步轻量分发、UI 更新批处理 |
| 消息过多导致 Render payload 膨胀 | 浏览器卡顿、RenderDomain update 失败 | 有界 Feed、单节点 collection、限制文本长度 |
| Panel 挤压战场 | 地图可视范围缩小、镜头异常 | 重新计算 viewport/camera；窄屏 Drawer |
| Replay 引入 wall-clock 差异 | 无法确定性复现 | Activity 不进入 Replay v1 authority；live latency 不持久化 |
| Pause / cancel 后迟到消息 | 旧 Battle 污染新 UI | battleId/session generation/requestId fencing |
| Provider telemetry 泄露信息 | API Key / Prompt 暴露 | 仅记录白名单字段，不记录请求正文和响应原文 |

## 10. 预计涉及的文件

| 文件 | 预计改动 |
|---|---|
| \`game-libs/battle/src/decision.ts\` | Call A profile、阶段耗时与 usage 采集；Call B 保持原职责 |
| \`game-libs/battle/src/contracts.ts\` | BattleActivityEvent 类型与 Runtime observer surface |
| \`game-libs/battle/src/simulation/runtime.ts\` | Decision lifecycle 发布、Tick Activity dispatch、observer isolation |
| \`game-libs/battle/src/simulation/tick.ts\` | 生成与 committed reducer facts 对应的活动事件 |
| \`game-libs/battle/src/simulation/replay.ts\` | 原则上不改 Replay v1 schema；如需改变必须单独提出 version amendment |
| \`game-libs/battle/src/presentation.ts\` | 固定 Activity visual node 的初始化和更新适配 |
| \`game-libs/battle/browser/battle.browser.js\` | Activity custom element / message list / active decisions |
| \`game-libs/battle/browser/battle.css\` | 右侧布局、窄屏 Drawer、消息样式 |
| \`game-libs/battle/test/decision.test.mjs\` | profile、timing、usage、failure / abort tests |
| \`game-libs/battle/test/simulation.test.mjs\` 或新增 activity test | 事件时机、排序、去重、observer isolation |
| \`game-libs/battle/test/presentation.test.mjs\` | stable node / feed update / failure isolation |
| \`game-libs/battle/test/browser-e2e.test.mjs\` | Panel、scroll、responsive、lifecycle E2E |
| \`subsystems/battle.mjs\` | 订阅 Runtime Activity 并接入 Activity Presentation adapter |
| \`game-libs/battle/docs/\` | 新增版本化 Activity / Decision profile 设计与 qualification 文档 |

以上是预计影响面，不表示所有文件都必须修改。实现时应优先复用现有模块，不为满足清单而制造无必要的抽象。

## 11. 实施检查清单

### 性能

- [ ] 建立 Call A / Call B / parse 分段 latency baseline。
- [ ] 记录 token usage 和 provider outcome。
- [ ] 完成 high / low / none 对照（none 仅在支持时）。
- [ ] 基于 usage 完成 Token cap 实验。
- [ ] 完成 Prompt 精简实验。
- [ ] 确认 Call A 候选 profile 的质量门槛。
- [ ] 保留 high fallback 和失败可诊断性。

### Activity Contract

- [ ] 定义 typed event union。
- [ ] 明确 eventId / sequence / tick / requestId 语义。
- [ ] 定义 thinking / accepted / rejected / failed 生命周期。
- [ ] 定义 movement / skill / damage / defeat 事件触发点。
- [ ] listener failure 不影响 Battle。
- [ ] Replay v1 不被隐式扩展。

### UI / Presentation

- [ ] 建立 active decisions 与 bounded history。
- [ ] 右侧 Panel 在桌面端布局完成。
- [ ] 最新消息置顶。
- [ ] 用户阅读历史时不自动抢滚动位置。
- [ ] 小屏 Drawer / Overlay 完成。
- [ ] 固定 RenderNode，无逐消息结构变化。
- [ ] pause / resume / cancel / close 清理完整。

### Qualification

- [ ] Unit tests。
- [ ] Simulation deterministic tests。
- [ ] Presentation tests。
- [ ] Browser E2E。
- [ ] PWA / Desktop qualification。
- [ ] 真实 Provider opt-in test。
- [ ] 更新文档状态与实际实现状态。

## 12. 推荐执行顺序

推荐先完成 Phase 0，再并行推进 Phase 1 与 Phase 2：

~~~text
Phase 0 — Baseline / Metrics
          │
          ├───────────────┐
          ▼               ▼
Phase 1 — Fast Profile   Phase 2 — Activity Contract / Runtime
          │               │
          │               ▼
          │             Phase 3 — Browser Activity Panel
          │               │
          └───────┬───────┘
                  ▼
          Phase 4 — E2E Qualification
                  │
                  ▼
          Select default profile / rollout
~~~

这样可以尽快让玩家看到 thinking 状态，而不必等性能调参全部完成；同时，UI 反馈不会被误当成真正的性能优化。

## 13. 完成定义

本改造只有在以下条件同时满足时才算完成：

1. Call A 的性能变化有基准数据和可重复实验支持，而不是凭主观感觉选参数。
2. 新默认 profile 达到约定的 latency / strategy quality 门槛；否则保留 high。
3. 玩家能在右侧 Panel 看到真实的 thinking、accepted decision、movement、skill、damage 和 defeat 消息，最新消息置顶。
4. 消息严格对应 Runtime / Simulation 的已提交事实，不显示未经接受的 Plan 或未经结算的伤害。
5. Activity Feed 不影响 Battle Tick、HP、BattleResult、Replay、Pause / Cancel 和战后 Settlement。
6. Desktop / PWA / narrow viewport 的 E2E qualification 通过。
7. 相关设计文档、测试矩阵和实际实现状态一致。

---

## 参考文档与代码

- [Battle README](../README.md)
- [Battle v0 Contracts](./BATTLE_V0_CONTRACTS.md)
- [Battle v0 Decision](./BATTLE_V0_DECISION.md)
- [Battle v0 Simulation](./BATTLE_V0_SIMULATION.md)
- [Battle v0 Presentation](./BATTLE_V0_PRESENTATION.md)
- [Battle v0 Test Matrix](./BATTLE_V0_TEST_MATRIX.md)
- [Decision implementation](../src/decision.ts)
- [Simulation Runtime](../src/simulation/runtime.ts)
- [Simulation Tick](../src/simulation/tick.ts)
- [Presentation implementation](../src/presentation.ts)
- [Browser implementation](../browser/battle.browser.js)
- [PokeMan Battle Subsystem](../../../subsystems/battle.mjs)
