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

1. **AI 决策等待过长。** 通过测量和调优 DeepSeek Decision 的 Call A，降低玩家等待角色作出下一步行动的时间，同时守住 Plan 正确性和战术质量。
2. **战斗过程缺少即时反馈。** 战斗中发生值得玩家了解的事情时，立即产生一条消息，展示在战斗画面右侧。消息按发生顺序记录，最新消息显示在最上面。

这两个目标相互独立：

- 性能优化不依赖消息窗口。
- 消息窗口不跟踪 AI 请求状态，也不参与 AI 决策。
- 即使不显示消息，Battle 也必须能够完整运行。
- 即使 Call A 很慢，消息流也能即时显示“角色 A 开始分析战场情报”。

## 2. 核心产品定义：消息流，不是状态面板

### 2.1 消息的含义

Battle Message Feed 是一份**战斗过程中发生事件的只读、追加式记录**。

发生一件值得玩家了解的事情，就产生一条独立消息。消息一经产生便成为历史记录，不因后续战斗状态变化而被修改、关闭或删除。

例如：

1. 角色 A 开始分析战场情报。
2. 角色 B 发动雷电术。
3. 角色 A 受到 15 点伤害。
4. 角色 A 根据新的战场情况，开始重新思考下一步行动。
5. 角色 A 决定向目标移动。

这些消息是五件先后发生的事情，不是一个持续更新的“角色 A 正在思考”状态。

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

当 Runtime 真正发起一次 DecisionPort 请求时，发布一条消息：

> 角色 A 开始分析战场情报……

它表示“系统已为角色 A 发起一次决策请求”，是一个已经发生的事实。

它不表示模型的内部推理过程，也不承诺该请求一定会成功。

一次 DecisionPort 请求内部可能包含 Call A 和 Call B。**消息只在整个 Decision 请求发起时产生一次**，不能把 Call A、Call B 分别播报成两次思考。

## 3. 玩家体验与界面行为

### 3.1 布局

**所有设备统一采用左右并排布局，不提供抽屉、覆盖层或布局模式切换。**

- 左侧：战斗地图、角色和现有 HUD（World）。
- 右侧：Battle Message Feed（Activity Panel）。
- Activity Panel 宽度为 Battle View 可用内容宽度的 **32%**，最大宽度 **600px**。
- World 占用扣除 Activity Panel 后的全部剩余宽度。
- 宽度按 Battle View 内 World 与 Activity Panel 可共同使用的内容宽度计算，不按浏览器窗口外框计算。
- 不额外设置固定最小宽度；窄屏下仍保持并排，Panel 内容在自身区域内换行和滚动，不切换成抽屉或覆盖层。
- Activity Panel 的消息列表独立纵向滚动，不改变 World 的滚动和战斗状态。

宽度计算：

`panelWidth = min(availableContentWidth × 0.32, 600px)`

`worldWidth = availableContentWidth - panelWidth`

例如：

| Battle View 可用内容宽度 | Activity Panel | World |
|---:|---:|---:|
| 1000px | 320px | 680px |
| 1600px | 512px | 1088px |
| 2400px | 600px（达到上限） | 1800px |

右侧消息面板是战斗画面的独立 UI 区域，不是 RenderProjection 的一部分，也不是 AI 状态面板。

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
- Battle 实例结束或关闭时，释放该实例的消息 Feed。

### 3.4 消息表现

每条消息至少包含：

- 角色名称或系统来源。
- 简短事件描述。
- 事件类型对应的轻量视觉区分。
- 发生时间或 Tick 信息（视 UI 密度决定）。

新消息使用轻量淡入，不播放影响战斗节奏的长动画。

文案由本地模板根据结构化事实生成，不让 LLM 生成战斗播报。

## 4. 消息事件模型

### 4.1 事件来源

只允许两个权威来源：

| 来源 | 负责发布的事实 |
|---|---|
| Battle Runtime | Decision 请求真正发起、Battle 生命周期中值得玩家看到的事件 |
| Battle Simulation | Plan 被接受、移动开始、技能开始/结算、伤害、击倒等已提交的战斗事实 |

Browser / Panel 不得自行推断游戏事实。

### 4.2 第一版消息类型

第一版只覆盖玩家能够理解、对战斗叙事有价值的事件：

| 事件类型 | 触发事实 | 消息示例 |
|---|---|---|
| decision.started | Runtime 即将调用 DecisionPort | 角色 A 开始分析战场情报…… |
| decision.accepted | Simulation 验证并接受 Plan | 角色 A 决定使用火焰斩 |
| movement.started | Simulation 提交一次有意义的移动开始 | 角色 A 向目标位置移动 |
| movement.completed | Simulation 确认到达该次移动的最终目的地 | 角色 A 已抵达目标位置 |
| movement.interrupted | Simulation 确认移动被打断 | 角色 A 的移动被打断 |
| skill.started | Actor 正式进入技能施放 / windup | 角色 B 发动雷电术 |
| skill.resolved | Simulation 完成技能判定 | 雷电术命中目标 / 未命中 / 被防护 |
| damage.applied | HP 伤害结算已提交 | 角色 A 受到 15 点伤害 |
| actor.defeated | Actor 正式进入 defeated / dead 状态 | 角色 C 被击倒 |
| battle.paused / resumed / ended | Battle Runtime 完成对应生命周期转换 | 战斗已暂停 / 战斗继续 / 战斗结束 |

事件类型应按实际游戏事实精简。第一版不要求把每一个 Tick、每一次寻路内部步骤、每一个数值变化都展示成消息，避免消息刷屏。

### 4.3 事件触发规则

- decision.started：在 Runtime 真正调用 DecisionPort 前发布，不在 Simulation 预先生成 command 时发布。
- decision.accepted：必须在 Simulation 完成 Plan 校验并接受之后发布。模型返回文本本身不代表 Plan 已接受。
- movement.started：在 Simulation 正式提交移动动作时发布。
- movement.completed：只有 Actor 到达本次移动意图的最终目的地时发布；路径中的每个中间格不重复播报。
- movement.interrupted：以 Simulation 确认的中断事实为准。
- skill.started：在 Actor 正式进入 windup / 技能动作时发布，不以 AI 计划使用技能为依据。
- skill.resolved：在技能判定完成后发布，准确区分 hit、miss、immune 等结果。
- damage.applied：HP 已完成结算后发布，damage 和 hpAfter 使用 Simulation 的最终值。
- actor.defeated：Actor 首次进入死亡状态时发布一次。

不要将“决定使用技能”“开始施放技能”“技能命中”“造成伤害”合并成一个未经区分的事件。它们是不同时间发生的事实。

### 4.4 受击后重新思考的消息顺序

这是本设计必须通过的核心场景：

战斗中：

1. 角色 A 已经发起过一次 AI 请求，消息流显示“角色 A 开始分析战场情报……”。
2. 角色 B 正式开始施放攻击，产生 skill.started。
3. 技能结算，角色 A 受到伤害，产生 damage.applied。
4. 受击使角色 A 原有的 Decision generation 失效，Runtime 内部取消旧请求。**不修改、不关闭、不删除第 1 条消息，也不需要为 UI 产生 request-cancelled 状态。**
5. 如果 Runtime 随后为角色 A 发起新的 DecisionPort 请求，再产生一条新的 decision.started：“角色 A 正在根据新的战况重新评估行动……”。

最终历史记录中会同时保留旧思考消息、攻击消息、受击消息和新思考消息。它们按真实发生顺序排列。

最新消息置顶时，视觉顺序是第 5、4、3、2、1 条的倒序展示（若取消本身不是玩家可见事件，则不显示第 4 条）。

### 4.5 失败、拒绝与内部取消的展示边界

- 内部 stale request 被取消：默认不显示消息。
- Promise 被 AbortSignal 取消：默认不显示消息。
- Plan 被拒绝并自动 correction：不必为每次内部校验失败刷屏；如果确实影响玩家理解，可发布一条简短的“行动方案需要调整”消息。
- 最终 Decision 失败且影响战斗推进：可以发布一条安全、简短的失败消息，例如“角色 A 暂时无法制定行动方案”。
- 不显示 Provider 原始错误、HTTP body、Prompt、API Key 或 hidden reasoning。
- Battle 结束、暂停等玩家可感知的生命周期事件可以显示。

消息策略是“玩家值得知道的事件”，不是“把所有内部技术事件都打印出来”。

## 5. 数据与架构设计

### 5.1 总体数据流

~~~text
Battle Runtime
  ├─ Decision 请求发起
  └─ Battle 生命周期事件
           │
           ├─────────────────────┐
           │                     │
Battle Simulation               │
  └─ committed message facts    │
           │                     │
           └──────────┬──────────┘
                      ▼
              Battle Message Event
                      │
                      ▼
              Runtime Message Dispatcher
                      │
                      ▼
              PokeMan Message Feed
                      │
                      ▼
              Message Formatter
                      │
                      ▼
              Right Activity Panel
~~~

这是一条单向观察链路。消息链路不得反向调用 Decision、修改 Simulation 或推进 Battle Tick。

### 5.2 核心职责

| 模块 | 职责 | 不负责 |
|---|---|---|
| Decision | 根据 Observation 生成候选 Plan | 生成 UI 消息、维护消息历史 |
| Simulation | 校验并提交游戏事实 | Browser DOM、消息文案 |
| Runtime | 在正确时机发布 Runtime 事件，汇总 Tick 消息事实 | 面板滚动和样式 |
| Message Feed | 接收并追加不可变消息，提供有界历史 | AI 请求状态、Battle State |
| Message Formatter | 将事件类型和参数转为本地化文案 | 推断未发生的事实 |
| Activity Panel | 展示消息、排序和滚动 | 订阅 AI 请求生命周期并维护状态 |

### 5.3 Battle Message 类型草案

建议使用 discriminated union，不把长期公共契约定义为任意 Record。

~~~ts
type BattleMessageBase = {
  readonly id: string;
  readonly sequence: number;
  readonly tick: number | null;
  readonly occurredAtMs: number;
};

type BattleMessage =
  | (BattleMessageBase & {
      readonly type: "decision.started";
      readonly actorId: string;
    })
  | (BattleMessageBase & {
      readonly type: "decision.accepted";
      readonly actorId: string;
      readonly intent:
        | { readonly type: "move"; readonly destination: GridPosition }
        | {
            readonly type: "skill";
            readonly skillId: string;
            readonly targetActorId: string;
          };
    })
  | (BattleMessageBase & {
      readonly type: "movement.started" | "movement.completed" | "movement.interrupted";
      readonly actorId: string;
      readonly from?: GridPosition;
      readonly to?: GridPosition;
    })
  | (BattleMessageBase & {
      readonly type: "skill.started";
      readonly actorId: string;
      readonly skillId: string;
      readonly targetActorId?: string;
    })
  | (BattleMessageBase & {
      readonly type: "skill.resolved";
      readonly actorId: string;
      readonly skillId: string;
      readonly targetActorId: string;
      readonly result: "hit" | "miss" | "immune" | "invalid";
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
      readonly type: "battle.paused" | "battle.resumed" | "battle.ended";
    });
~~~

这是概念类型，落地时以现有 contracts 和 Simulation fact 形状为准。不要为了追求类型完整而复制一份 Battle State。

### 5.4 ID、顺序与时间

- sequence 由单场 Battle 的 Runtime 统一分配，严格递增。
- id 可以由 Battle 实例内的消息序号生成，保证单场唯一。
- tick 对 Simulation 事实填写对应 Tick；Tick 外的 Runtime 事件可以为 null。
- occurredAtMs 用于 UI 显示时间，不作为 Gameplay authority。
- sequence 决定顺序，timestamp 不决定顺序。
- 同一 Tick 的事实顺序由 Simulation 的 messageFacts 数组显式给出。
- 不依赖 Promise 完成顺序推导战斗事件顺序。

### 5.5 不可变、有界的 Message Feed

Feed 只需要简单的追加式接口：

~~~ts
interface BattleMessageFeed {
  append(message: BattleMessage): void;
  getSnapshot(): readonly BattleMessage[];
  subscribe(listener: (messages: readonly BattleMessage[]) => void): () => void;
  clear(): void;
}
~~~

要求：

- append 只追加，不提供 update / resolve / close / remove 单条消息的 API。
- 对消息对象及 payload 做必要的不可变保护。
- Feed 只保留最近 N 条消息，默认 N = 100。
- 超过容量时只淘汰最旧消息。
- clear 仅用于 Battle 实例销毁或明确重置，不用于 AI 请求完成。
- Feed 不保存 activeRequest、thinkingActors、requestStatus 等字段。
- Feed 不拥有 Battle State，也不能通过消息反向改变游戏。

如果未来需要持久化战斗日志或跨场景历史，另行设计存储能力；本轮只要求单场 Battle 的内存消息流。

## 6. 与现有 Battle Core 的集成

### 6.1 Runtime 事件

当前 Runtime 已有 Decision command invocation、Decision abort、Tick wake 和生命周期转换等明确入口。

建议在现有 BattleRuntime observer surface 上增加消息订阅能力，例如：

~~~ts
interface BattleRuntime {
  onMessage(listener: (message: BattleMessage) => void): () => void;
}
~~~

具体命名可以按现有 contracts 风格调整。

- 在真正调用 DecisionPort.decide() 前发布 decision.started。
- 每个新的 DecisionPort 请求最多发布一次，不为内部 Call A / Call B 分别发布。
- Runtime 仍然负责 AbortController、generation、stale completion 和 Decision Inbox。
- 这些内部机制不向 Feed 暴露状态同步接口。
- listener 抛错必须被隔离，不得影响 Runtime、Simulation 或 BattleResult。

### 6.2 Simulation 消息事实

当前 TickOutput 已经包含 Replay Tick、Decision records、RenderProjection 等输出，但现有 Replay facts 不覆盖所有消息需求，例如技能开始和移动最终抵达。

建议为 TickOutput 增加独立的只读事实集合：

~~~ts
interface TickOutput {
  // Existing outputs remain unchanged.
  readonly messageFacts: readonly BattleMessageFact[];
}
~~~

要求：

- messageFacts 在 Simulation reducer 内产生。
- 只有已经提交的事实才能进入 messageFacts。
- messageFacts 不包含 DOM 文案，不依赖 Browser。
- messageFacts 与 ReplayTickRecord 分离，不修改 Replay v1 schema。
- messageFacts 与 RenderProjection 分离，不把消息塞入渲染投影。
- 同一 Tick 内的事实按真实 reducer 发生顺序排列。
- 不从 UI 对 Actor state 做 diff 来猜测“发生了什么”。

### 6.3 Runtime 发布顺序

建议 Runtime 在一次 Tick 处理完成后按以下次序处理：

1. 调用 processOneTick，得到 Simulation 输出。
2. 持久化现有 Replay Tick / Decision records。
3. 将本 Tick 已提交的 messageFacts 按数组顺序发布。
4. 处理失效请求的内部 abort（不产生 UI 状态清理）。
5. 更新现有 World / HUD Presentation。
6. 处理 terminal / Decision health。
7. 调用新的 Decision commands；每个真正启动的请求在调用 DecisionPort 前发布 decision.started。

关键是：**先发布受击等已提交事实，再发布受击后新发起的思考消息。**

如果实际 Runtime 顺序需要调整，应以该顺序作为产品事件顺序约束，并用测试固定下来。

### 6.4 与 Replay 的关系

- Battle Message Feed 不是 Replay。
- 本轮不修改 Replay v1 schema。
- 不将 message timestamp、浏览器展示顺序或 UI 文案写入 Replay authority。
- Replay v1 仍然负责确定性战斗事实。
- Message Feed 是本次运行中的玩家叙事视图；本轮不承诺从 Replay 完整重建相同消息。
- 如果未来需要 Replay 也显示完整消息，再单独设计 Replay version amendment。

### 6.5 与 Presentation / Browser 的关系

- Message Feed 不属于 RenderProjection。
- 不通过每条消息创建 RenderNode。
- 不让 Message Feed 的 DOM 更新调用 Simulation 或 Decision。
- Activity Panel 作为 Battle View 的独立 UI 子组件 / slot，由 PokeMan composition 挂载。
- Panel 通过 Feed subscription 接收有界消息快照或增量。
- World / HUD 与 Activity Panel 不共享必须原子成功的更新事务。
- Panel 的格式化、DOM 更新和滚动逻辑失败时，只影响 Panel。
- 消息监听器应只做轻量入队；实际 DOM 更新由 UI 自己批量调度，避免同步渲染阻塞 Runtime。

现有 Battle View 当前以 world / HUD 为主要区域。实现时扩展为固定的左右并排布局：左侧 world + HUD，右侧 activity。Activity 不成为新的 Simulation PresentationPort。Activity Panel 宽度按 Battle View 可用内容宽度的 32% 计算，最大 600px；World 使用剩余宽度。所有视口尺寸都保持这一布局，不增加抽屉、覆盖层或断点切换。

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

使用 monotonic clock 测量 duration。metrics sink 出错不得影响 Decision。

禁止记录 API Key、Authorization header、完整 Prompt、原始模型响应或 hidden reasoning。

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

### 7.5 质量验收

性能不能只看请求耗时。至少同时观察：

- Call A p50 / p90 / p95。
- Call B p50 / p95。
- Decision 总耗时和请求到下一次可执行行动的时间。
- Plan 结构合法率。
- Simulation 首次接受率。
- correction 比例。
- 已接受行动完成率。
- 固定场景集中的伤害效率、战斗时长和胜率。

实验应使用固定 Observation / Battle Seed，交错运行不同 profile，避免 Provider 不同时段负载差异造成误判。

小样本可用于初步筛选，不可用 30 或 50 次测试就宣称 p95 和胜率非劣性已经得到证明。正式验收应依据预实验波动估算样本量，并报告置信区间。

初始优化目标可以设为 Call A p50 明显下降（例如目标 30%），同时 Plan acceptance、correction 和战术表现没有超出预先定义的可接受退化范围。最终阈值在基线数据出来后冻结。

### 7.6 Streaming 的边界

Streaming 可以作为后续独立实验：

- 它可能改善首 token 时间，不保证缩短完整响应时间。
- 不把部分 Strategy Memo 当成可执行 Plan。
- 不向玩家输出模型逐 token 推理或 hidden reasoning。
- “角色开始思考”的玩家消息由 Decision 请求发起事件提供，不依赖 streaming。
- 只有完整响应通过解析和后续 Simulation 校验后，才可能产生 decision.accepted 消息。

## 8. 实施阶段

### Phase 0 — 设计契约确认

交付：

- 确认 Message Feed 是追加式历史消息，而不是状态面板。
- 确认消息类型、触发时机和不展示的内部事件。
- 确认 Runtime / Simulation / Feed / Panel 的责任边界。
- 确认 Call A v0 基线与实验实现的版本边界。

Gate：不得出现 Active Decisions、thinking state、request lifecycle UI 等状态面板设计。

### Phase 1 — Call A 基线与调参

交付：

- Call A / Call B 分段耗时。
- Token usage / Provider outcome。
- 固定 Observation / Battle Seed 测试集。
- high / low / none（如支持）对照报告。
- responsive candidate 与质量验收结论。

Gate：新 profile 未通过质量门槛时，不替换 v0-quality 默认值。

### Phase 2 — Message Contract 与 Simulation Facts

交付：

- BattleMessage discriminated union。
- TickOutput.messageFacts。
- Decision started / accepted 消息事实。
- movement / skill / damage / defeat 消息事实。
- sequence 和同 Tick 事件顺序规则。

Gate：每一种消息都有明确权威来源和提交时机；没有任何 UI 推断事件。

### Phase 3 — Runtime Dispatcher 与 Feed

交付：

- BattleRuntime.onMessage(listener) 或等价 observer surface。
- Runtime sequence / message ID。
- listener 异常隔离。
- PokeMan Message Feed append-only 实现。
- 最近 N 条消息的有界缓存。

Gate：Feed 不包含 Active Request / Thinking State / Request Cancellation UI 逻辑。

### Phase 4 — 右侧 Message Panel

交付：

- Battle View 右侧消息面板。
- 最新消息置顶。
- 历史滚动和新消息提示。
- 消息模板、Actor / Skill 名称映射。
- 所有视口尺寸下统一的左右并排布局；Activity Panel 宽度为可用内容宽度的 32%，最大 600px，World 使用剩余宽度。
- reduced motion 和基本无障碍支持。

Gate：Panel 不依赖 AI 请求结束事件，不影响 World / HUD。

### Phase 5 — 完整战斗验收

交付：

- AI vs AI 完整战斗 E2E。
- 受击后旧请求失效、新请求发起的消息顺序测试。
- Replay v1 回归。
- Pause / Resume / Cancel / Battle End 回归。
- Panel 故障隔离测试。
- Call A 性能与策略质量报告。

## 9. 测试矩阵

### 9.1 Message Feed 单元测试

- 每次 append 只新增一条消息。
- 旧消息对象和内容不会被后续事件修改。
- Feed 不存在 update / close / resolve 单条消息的操作。
- sequence 严格递增。
- UI 展示顺序为 sequence 倒序。
- 超出容量时只淘汰最旧消息。
- clear 只在 Battle 实例销毁 / 重置时发生。
- formatter 对未知 Actor / Skill ID 有安全 fallback。

### 9.2 Runtime / Simulation 事件测试

- DecisionPort 调用前产生一次 decision.started。
- Call A 和 Call B 不分别产生两条 started 消息。
- Plan 只有在 Simulation accept 后才产生 decision.accepted。
- Plan 仅被模型返回但未通过验证时，不显示“已决定”。
- skill.started 只在进入正式施法动作时产生。
- damage.applied 的数值与最终 HP 结算完全一致。
- actor.defeated 每个 Actor 每场 Battle 只产生一次。
- 同一 Tick 的 messageFacts 顺序稳定。
- Runtime observer 抛错不影响 BattleResult。
- 内部 request cancellation 不会修改或删除历史消息。
- stale completion 不会产生虚假的 decision.accepted。
- 受击后如果发起新 Decision 请求，产生一条新的 decision.started。

### 9.3 核心场景验收

场景：角色 A 思考中，角色 B 攻击 A。

预期消息产生顺序：

1. 角色 A 开始分析战场情报。
2. 角色 B 发动雷电术。
3. 角色 A 受到 15 点伤害。
4. 角色 A 根据新的战况重新评估行动（仅当 Runtime 确实发起新请求时）。

旧的第 1 条消息保留，不更新、不关闭、不删除。

UI 最新消息置顶后，显示顺序为 4、3、2、1。

### 9.4 Presentation / Browser 测试

- 新消息只更新 Message Feed / Activity Panel，不修改 World / HUD 的 Gameplay state。
- 新消息到达后正确插入顶部。
- 用户阅读旧消息时不被强制滚回顶部。
- 长战斗消息缓存始终有界。
- Activity Panel DOM / formatter 出错不会导致 Battle Simulation 失败。
- 不同视口宽度下始终保持左右并排；Panel 宽度符合 32% / 最大 600px 规则，内容可在 Panel 内换行和滚动，不出现抽屉或覆盖层模式。
- Battle close 后清理 subscription、DOM listener 和缓存引用。

### 9.5 性能测试

- A0 / A1 / A2 使用相同 Observation 和 Prompt。
- Call A / Call B / total latency 分开统计。
- Token usage 缺失时记录 unknown，不推测。
- incomplete response / timeout / abort / malformed response 均正确处理。
- 新 profile 的 Plan acceptance 和战术质量满足预设门槛。
- 普通 CI 不依赖真实 Provider credential；真实 Provider 测试显式 opt-in。

## 10. 预计代码影响面

以下是候选影响面，实施时应以实际代码为准，不要求为了清单而制造无必要抽象。

| 文件 / 模块 | 预计职责 |
|---|---|
| game-libs/battle/src/contracts.ts | BattleMessage 类型与 Runtime observer surface |
| game-libs/battle/src/simulation/tick.ts | 生成有序 messageFacts |
| game-libs/battle/src/simulation/runtime.ts | 发布 Decision started、Tick facts 和 Battle lifecycle 消息 |
| game-libs/battle/src/decision.ts 或新的版本化 Decision 实现 | Call A profile / timing / usage |
| game-libs/battle/browser/battle.browser.js | 右侧 Message Panel 组件 |
| game-libs/battle/browser/battle.css | Panel 布局、消息样式、响应式适配 |
| subsystems/battle.mjs | 订阅 Runtime 消息并组装 Feed / Panel |
| game-libs/battle/test/decision.test.mjs | 性能 profile 与 Provider 测试 |
| game-libs/battle/test/simulation.test.mjs | messageFacts 产生时机和顺序 |
| game-libs/battle/test/presentation.test.mjs | Feed / Panel 隔离测试 |
| game-libs/battle/test/browser-e2e.test.mjs | 消息排序、滚动、响应式 E2E |

## 11. 不可妥协的设计约束

1. **Message Feed 是事件历史，不是状态镜像。**
2. **一件值得玩家了解的事情发生一次，就产生一条独立消息。**
3. **历史消息不因后续 AI 请求状态而改变。**
4. **AI 请求取消是 Runtime 内部职责，不是 Panel 清理机制。**
5. **Simulation 是移动、技能、伤害和击倒事实的唯一权威。**
6. **Decision 只提出 Plan，Simulation 决定是否接受和执行。**
7. **Call A 性能实验与 Message Feed 完全解耦。**
8. **Replay v1 不因消息窗口而被隐式修改。**
9. **Message Feed / Panel 故障不能影响核心战斗。**
10. **不显示模型 hidden reasoning 或未经验证的行动结果。**

## 12. 完成定义

本方案完成需要同时满足：

- Call A 有可重复的性能基线，候选优化有延迟与质量数据支持。
- v0 Decision 基线保持可用，未通过质量门槛的候选配置不会成为默认。
- Battle 中的关键事件能生成独立、不可变的消息。
- 消息最新置顶，历史消息不会因为 AI 请求完成、失败或取消而被修改。
- 受击、伤害、重新发起决策等事件按真实发生顺序展示。
- Message Feed 不维护 AI request state，不参与 Simulation。
- Activity Panel 不与 World / HUD 共用必须原子成功的更新事务。
- Replay v1、BattleResult、Pause / Resume / Cancel 和战后 Settlement 无回归。
- 所有视口宽度下的固定并排布局通过测试：Panel 为可用内容宽度的 32%、最大 600px，World 使用剩余宽度；不存在抽屉、覆盖层或模式切换。

## 参考实现与契约

- [Battle v0 Decision](./BATTLE_V0_DECISION.md)
- [Battle v0 Simulation](./BATTLE_V0_SIMULATION.md)
- [Battle v0 Contracts](./BATTLE_V0_CONTRACTS.md)
- [Battle v0 Presentation](./BATTLE_V0_PRESENTATION.md)
- [Decision implementation](../src/decision.ts)
- [Simulation Runtime](../src/simulation/runtime.ts)
- [Simulation Tick](../src/simulation/tick.ts)
- [PokeMan Battle Subsystem](../../../subsystems/battle.mjs)
