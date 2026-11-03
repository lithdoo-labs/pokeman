# Battle v0 核心规范

> 状态：**Core gameplay FROZEN；Simulation gameplay/runtime（含 Decision availability circuit）IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED**。本文仍是 Battle v0 已冻结 gameplay/runtime 语义的唯一权威来源；外部 serialization/provider/physical transport/product composition 状态以 Contracts / Decision / Integration 文档为准。
>
> 统一状态词：
> - **FROZEN / MUST**：v0 实现必须遵守。
> - **SHOULD**：实现建议，不改变核心规则兼容性。
> - **OPEN**：尚未冻结，代码不得自行假设。
> - **NON-GOAL**：明确不进入 v0。

## 1. 范围与权威

Battle v0 是一个独立的**双 Actor 同时行动**战斗系统。核心能力包括：200 ms 固定逻辑 Tick、确定性 reducer/事件队列、短期 Decision Plan、原子格子移动、单目标技能、受击保护、确定性 Replay，以及纯表现 Presentation。

运行时分三层：

- **Simulation**：唯一战斗规则与状态权威。
- **Decision**：产生结构化短期战术计划。
- **Presentation**：只渲染 Simulation 事实与 Projection。

共享的 `battle/contracts` 只是数据边界，不是第四个运行层。

### ARCH-001 — Simulation 唯一权威 — FROZEN

只有 Simulation 可以修改以下权威事实：逻辑时间、Actor committed tile/direction、占位/预约、HP、action state、accepted plan、保护区间、generation、技能结算、BattleResult、Replay 事实。

LLM/Promise 回调、Browser 动画完成、DOM、Sprite 坐标、camera 等都不得直接修改 Simulation。

### ARCH-002 — Decision 决定战术意图 — FROZEN

Decision 负责决定“想做什么”，并直接生成结构化 `PlanSubmission`，包括明确的 path 和可选 skill intent。

Simulation 不得预先枚举战术路线再让 Decision 选择 `planId`。

### ARCH-003 — Presentation 只负责表现 — FROZEN

Presentation 决定“怎样显示”。

屏幕插值坐标、掉帧、动画完成、camera、viewport 等不得反向修改权威位置、伤害、时间或胜负。

`visualEpoch` 是 Presentation-local 的视觉一致性版本，只用于 RenderDomain / Browser fencing。Simulation 不生成、存储或解释 `visualEpoch`；Simulation 跨层发布的是 Battle `sceneEpoch`、逻辑 `tick` 与已经决定的 gameplay facts。

### ARCH-004 — 不复用 RPGMap Runtime — FROZEN

Battle 可以消费 LoomRealm 已有 Map/Tileset/Autotile/Character 的 Content/Resource 形式，但不得把 RPGMap Runtime 的移动、计时器、Transfer/Bridge、探索状态作为 Battle 权威。

### ARCH-005 — 三层模块独立导出，Simulation 自有运行循环 — FROZEN

Decision、Simulation、Presentation 必须可以作为独立模块实现、导出和测试。三者可以依赖共享 Contract/Port，但不得依赖彼此的 concrete implementation。

依赖与运行边界：

- **Decision = Plan**：v0 根据 Simulation 的 `BattleObservation / PlanConstraints` 产生结构化 `PlanSubmission`；不得直接修改 Battle State，也不需要知道 Presentation 如何实现。PlayerGuidance concrete capability 不在 v0；未来若启用，只能通过 request-scoped typed `DecisionWorkflow` capability/data 扩展。
- **Simulation = Execute**：是完整、自驱动的 Battle Runtime，自己拥有 Battle clock、200 ms Tick scheduler、event queue、`TICK-001` reducer、accepted plan execution、authoritative state、BattleResult 与 Replay。业务层不得接管或重写这些运行职责。
- **Presentation = Present**：根据 Scene 初始化数据与 Simulation 已决定的 Projection/表现命令更新视图；不得参与规则判定，也不得通过动画完成、DOM/Sprite 状态或 Browser ACK 反向驱动 Simulation。
- Simulation 可以通过共享的 `DecisionPort` / `PresentationPort` 使用业务注入的实现；这种依赖只针对稳定接口，不得 import 或假设具体 Decision/Browser implementation。
- Simulation Core 只接收所需的窄 capability（例如 Battle clock、AbortSignal、DecisionPort、PresentationPort、已解析 Battle config/content）；不得把 `SubsystemScope`、`Frame`、RenderDomain、Viewport 等 LoomRealm integration object 作为 Core Runtime 必需依赖。
- 使用 Battle 的 game/business composition（通常位于具体业务 Subsystem 一侧）只负责选择 concrete Decision/Presentation、构造/注入 Battle Runtime，并把 Frame abort、pause/background 等外部生命周期映射给 Battle Runtime。trusted product/platform composition 可以提供 credential/network 等物理 capability，但不得因此获得 Battle business authority，也不应直接拥有 concrete Battle topology。

因此，headless Simulation 必须能用 Mock/Script Decision、可控时钟以及 Null/Recording Presentation 跑完整 Battle；Decision 与 Presentation 也必须分别能够使用 synthetic input 独立验证。

### ARCH-006 — Actor identity 使用集合建模，v0 cardinality 仍为 2 — FROZEN

Actor 数量限制属于 Battle Rule / validation，不属于底层存储形状。

跨层 Contract、Simulation Runtime、Presentation projection 与内部遍历必须以 `actorId` 标识 Actor，并使用 collection / map 语义；不得把 Actor identity 编码成固定的 `actorA/actorB`、`allySlot/enemySlot` 或数组下标。

集合顺序不是 gameplay identity，也不得参与规则裁决。需要稳定顺序时必须显式按稳定 key（例如 `actorId`）排序。

这条规则**不开放多人 v0**：`BATTLE-001` 仍要求 v0 BattleConfig 恰好两个 combat Actor。未来若加入组队或 FFA，需要新版本规则明确 hostility/team、Observation、terminal/result 等语义，但不得因此要求重写 Battle clock、event queue、actor-addressed state 或 Presentation actor collection。

N Actor-ready 只表示“初始化 roster 的 cardinality 不写死进基础结构”；它不自动引入 Battle 中途 spawn/despawn。动态 roster mutation 若未来需要，必须作为独立版本规则和 Render Tree structural-change contract 明确定义。

## 2. Canonical terminology

整套 Battle 文档统一使用以下术语：

- **tile**：整数格坐标。
- **committed tile**：Actor 当前 Simulation 权威格。
- **path**：`PlanSubmission` 中未来要进入的格子序列，不包含当前格。
- **step**：已经开始的一格原子移动。
- **PlanSubmission**：Decision 已产生、但尚未被 Simulation 接受的计划。
- **accepted plan**：Simulation 已校验并接管执行的计划。
- **Decision Request**：绑定某个 `decisionGeneration` 的一次异步决策请求。
- **Action**：新启动的 move step、原地 `turn`、或 skill windup。
- **windup**：技能前摇。
- **resolve**：技能产生权威 `hit / immune / miss / invalid` 的结算点。
- **recovery**：技能结算后的行动锁。
- **coefficient**：range matrix 中的确定性效果倍率。
- **coefficientUnits**：Runtime 中千分制的 coefficient。
- **protection**：有效受击后的一段免疫区间。

Runtime 字段统一使用 **direction**；不得再用 `facing` 表示同一个状态字段。

## 3. Battle 配置与初始化

### TIME-001 — Tick 固定为 200 ms — FROZEN

`tickDurationMs = 200`。

所有规则持续时间使用整数 Tick。真实异步操作可以任意时刻完成，但只能在确定的逻辑 Tick 成为权威事实。

### BATTLE-001 — v0 只有两个 combat Actor — FROZEN

v0 固定为双方各一个 Actor，每个 Actor 占一个格。

BattleConfig / validator 必须拒绝 combat Actor 数量不是 2 的 v0 Battle，并且两个 Actor 必须恰好包含 **1 个 `ally` + 1 个 `enemy`**。两个 Actor 的 `actorId` 必须唯一；identity/side 必须来自显式字段，不得由 `actors[0] / actors[1]` 的数组位置推导。

实现内部仍遵循 `ARCH-006` 的 actorId-addressed collection；“集合可容纳 N Actor”只是降低未来版本迁移成本，不代表 v0 接受 N>2。

### BATTLE-002 — 默认满血开战 — FROZEN（兼容默认值）

当 `ResolvedBattleActor.initialHp` 未提供时，Actor 初始 HP 等于 `maxHp`。这保留既有 Battle caller 的满血启动语义。`initialHp` 是 Simulation resolved input，不是 `BattleActor` Content 字段。

### BATTLE-003 — 显式初始 HP — IMPLEMENTED + TESTED + QUALIFIED

`ResolvedBattleActor` 增加可选 `initialHp`，用于让调用方在保留 `maxHp` 上限的同时指定本场初始 HP：

- 字段省略：`initialHp = maxHp`，兼容 BATTLE-002。
- 字段提供：必须是 safe integer，且 `1 <= initialHp <= maxHp`。
- Actor Runtime 初始 `hp = initialHp`；`maxHp` 始终保持最大值。
- 初始 Snapshot / RenderProjection / Replay initial definition 必须反映该初始 HP。
- validator 与 deterministic tests 必须覆盖字段省略、满血、受损值、0、超过 maxHp 和非整数等情况。
- 该字段只扩展 Simulation 初始化输入，不改变 Tick reducer、Decision、Movement、Skill、Damage、BattleResult 或 Presentation gameplay semantics。

PokeMan 等 Contract-backed caller 从各自 Relationship Contract 解析 `initialHp`；Battle Core 不读取任何上层业务数据。该 amendment 已完成 validator、Runtime、Snapshot、Projection、Replay 与 regression qualification。

### BATTLE-004 — 独立 BattleArena Content — IMPLEMENTED + TESTED + QUALIFIED

Battle v0 的战斗网格不再要求引用探索 `struct.Map`。目标 contract 引入：

```ts
type BattleArenaRef = {
  arenaId: string
}

type BattleArenaContent = {
  id: string
  width: number
  height: number
  passable: readonly (readonly boolean[])[]
  tileset_id: number
  data: ProjectedTable
}
```

规则：

- `BattleArena` 是 Battle-owned authored Content；不继承 RPGMap movement / transfer / bridge / ledge / terrain / NPC semantics。
- `passable[y][x]` 是 Simulation navigation authority，必须与 width / height 精确匹配。
- `data` 只供 Presentation 绘制，沿用已有 3-layer tile-id ProjectedTable 编码；它不能反向决定 passable。
- `tileset_id` 只用于读取已有 `struct.Tileset` 与 Tileset / Autotile Graphics。
- Battle Presentation 不再要求 `struct.Map`；它从 `struct.BattleArena/<arenaId>` 加载视觉 tile data。
- `ResolvedBattleDefinition.map.ref` 与 `BattleSceneInit.map` 的 target reference 改为 `BattleArenaRef`；字段名 `map` 可继续表示 Battle grid，不代表 RPGMap。
- 该 amendment 不改变 movement、skill、damage、result、Decision 或 Replay gameplay semantics；只去掉 Battle 对探索 Map Content 的依赖。

PokeMan 首场教学战固定使用 `struct.BattleArena/lab-tutorial`。validator、Presentation loading 与 browser qualification 已完成；不得通过读取 Map 4 passage/terrain 来替代该 Arena。
### PLAN-001 — 短期计划长度 — FROZEN

`PlanConstraints.maxPathSteps` 必须存在。

v0 默认值为 **6**；具体 Battle Config 可以调整这个值而不改变 Contract 结构。

### RNG-001 — battleSeed — FROZEN

由于同格冲突使用伪随机裁决，每场 Battle 初始化时必须持有 `battleSeed`，并写入 Replay。

规则随机不得依赖不可回放的 `Math.random()`。

## 4. Actor Runtime State 与不变量

概念状态：

```text
actorId
team
hp
tile
direction
actionState
activePlan?
pendingPlan?
protectedUntilTickExclusive
actionGeneration
decisionGeneration
```

### STATE-001 — 权威位置永远是整数格 — FROZEN

Simulation 中不存在权威“半格位置”。

Actor 移动插值期间仍 committed 在起点格，直到 `move_complete`。

### STATE-002 — direction 是规则输入 — FROZEN

沿用 LoomRealm/RPGMap 数值：

```text
2 = down
4 = left
6 = right
8 = up
```

Skill range 旋转读取 Simulation direction，而不是 Presentation Sprite 朝向。

### STATE-003 — 每个 Actor 同时最多一个有效 Decision Request — FROZEN

同一 `decisionGeneration` 最多一个有效 pending Decision Request。

`ensureDecision(actorId, reason)` 在同 generation 内必须幂等；同 Tick 多个重规划原因不得重复创建请求。

### STATE-004 — 每 Actor 每 Tick 最多启动一个新 Action — FROZEN

即使 windup/recovery 为 0，一个 Actor 在一个逻辑 Tick 内也最多启动一次新的主动 Action。

### STATE-005 — Action lifecycle 与 Decision lifecycle 正交 — FROZEN

Actor 的“身体正在做什么”和“Decision Request 是否正在进行”是两条独立状态轴。

因此以下组合都是合法的：

```text
moving   + thinking
recovery + thinking
idle     + thinking
protected + thinking
```

`thinking` 不得作为与 `moving / windup / recovery` 互斥的 `ActionState` 分支。ActionState 只描述 gameplay Action lifecycle；DecisionState 单独描述尚未完成的 Decision Request。异步 completion 在被 Tick reducer 消费前只存在于 Decision Inbox，不建立额外的 Actor `ready` authority state。

### STATE-006 — Decision 预取是有界的 — FROZEN

Decision 与 Action 可以流水重叠，但 v0 不允许无界 Plan 排队。

- Actor 同时最多一个有效 pending Decision Request；
- 当前 accepted plan 仍有尚未 materialize 的 turn / path step / skill intent 时，不为“下一 Plan”提前开启新的 generation；
- 当当前 Plan 的最后一个 future intent 已经 materialize 成正在执行的 Action 后，即使该 Action 仍处于 moving / windup / recovery，Simulation 可以为后续行为提前进入 Thinking；
- 提前返回且被 reducer 接受的下一 Plan 只能作为**至多一个 pending accepted plan** 暂存；它在当前 Action lock 解除前不得启动 Action；
- current/pending 之外不得继续接受第三份 Plan，也不得建立通用无界 FIFO；
- damaging hit、death、cancel 或其他使当前 Decision/Plan authority 失效的事实，必须同时 fence 掉不再合法的 pending Plan。

这里的“Plan intent 已 materialize”表示该 intent 已经转化为当前权威 Action（例如 active movement / windup / recovery 链），不是指该 Action 已经完成。

## 5. 时间、事件队列与异步完成

### TIME-002 — Simulation 自有定时事件队列与 Decision Inbox — FROZEN

Simulation 同时拥有两类异步输入结构，它们语义不同：

```text
Scheduled Event Queue
  dueTick-addressed
  ├─ move_complete
  ├─ skill_resolve
  └─ recovery_complete

Decision Inbox
  arrival-addressed, no dueTick
  └─ DecisionCompletion
```

定时事件按 `dueTick` 排序。Decision Completion **不得转换成 dueTick 事件**。

异步 Decision callback 唯一允许做的事是把 `DecisionCompletion` 追加到 Simulation-owned Decision Inbox；它不得直接修改 Actor/Plan/Battle State、不得直接校验/接受 Plan、不得启动 Action。

每个 Tick reducer 开始时必须原子截取：

1. `dueTick === currentTick` 的 scheduled-event snapshot；
2. **在本 Tick snapshot 边界之前已经进入 inbox** 的 DecisionCompletion snapshot。

snapshot 之后才到达的 DecisionCompletion 不得重入当前 reducer，只能等待下一逻辑 Tick。

### TIME-003 — 积压 Tick 必须逐 Tick 归约 — FROZEN

Battle clock 正常运行期间，如果调度器晚醒：

```text
while lastProcessedTick < targetTick:
  lastProcessedTick += 1
  processTick(lastProcessedTick)
```

不同 `dueTick` 绝不能压成同一个“同时事件批次”。每个 catch-up Tick 都有自己的 Decision Inbox snapshot 边界；异步 callback 不得插入已经开始处理的 Tick。

### TIME-004 — Pause / Background 冻结 Battle Clock — FROZEN

当 App/Host 进入 background 状态时，产品 composition 必须映射为 `battle.pause("host-background")`：

- Battle monotonic clock 冻结；
- `currentTick` 不推进；
- move、windup、recovery、protection 等 gameplay Tick 生命周期不推进；
- Decision/LLM 可以在现实时间继续完成并把 completion 放进 Decision Inbox，但 pause 期间不会消费 inbox、不会接受 Plan、不会启动 Action；
- Runtime 公开 `pauseReason = "host-background"`；
- Host foreground **不得自动 resume**；只有产品层收到玩家显式确认后调用 `battle.resume()`；
- 恢复后从原逻辑时刻继续，不补算暂停期间对应的 Tick；已排队 completion 在 resume 后第一个实际 reducer Tick 才有机会被消费。

TIME-003 的 catch-up 只用于**Battle clock 仍在运行时** scheduler/event loop 晚醒等情况。

### DEC-001 — Decision Completion 即时入 Inbox、Tick 边界生效 — FROZEN

Decision/LLM 完成后，completion **立即进入 Simulation-owned Decision Inbox**。这一步不是 gameplay mutation。

Plan 的权威生效点固定在 Tick reducer：

```text
async Decision completion
        ↓
Simulation Decision Inbox
        ↓
next reducer snapshot that can see it
        ↓
generation check
        ↓
Plan validation / failure handling
        ↓
accepted plan / correction request
        ↓
same reducer later Action phase may execute accepted plan
```

因此：

- completion 在 Tick N reducer **开始前**已经入 inbox → 可在 Tick N 的 Decision phase 被消费；
- completion 在 Tick N reducer **snapshot 之后**到达 → Tick N 不可见，最早 Tick N+1 消费；
- Promise callback、worker message、provider callback 都不得直接触发 Plan execution；
- v0 gameplay 不记录或比较 LLM wall-clock completion timestamp；
- v0 不存在由 LLM wall-clock completion 推导的 Decision dueTick 或 gameplay Decision deadline。

Replay 的确定性边界是“completion 被哪个 Tick reducer 消费 / Plan 被哪个 Tick 接受”，不是真实世界 completion timestamp。

### DEC-002 — 旧 generation 无提交权 — FROZEN

Decision Request 绑定 `decisionGeneration`。

generation 失效后，迟到 completion 即使已经进入 inbox，在 reducer 消费时也只能丢弃/记录诊断，不能提交计划。

### DEC-003 — 一次 Decision 调用只完成一次 attempt — FROZEN

一次 `DecisionPort.decide(...)` 只代表一次 Decision attempt。Decision implementation 返回 Plan 或 infrastructure/service failure；它不得自行决定：

```text
generation 是否 stale
Plan 是否被 Simulation 接受
是否还有 correction retry
Plan 从哪个 Tick 开始执行
```

stale generation fencing、Plan validation、`PLAN-006` 的一次 correction retry、active/pending accepted-plan pipeline 与 Replay consume/accept tick 都由 Simulation 决定。

Provider/network timeout 可以作为 concrete Decision implementation 的基础设施 policy，并产生一次 failed DecisionCompletion；它不是 Battle gameplay deadline，也不拥有 Battle Tick。具体 provider/model/timeout/retry/error code 由 concrete Decision implementation spec 冻结，不属于 Simulation gameplay contract。

### DEC-004 — Decision failure authority classification — FROZEN

Decision failure 对 Simulation 只有两种 authority category：

- `attempt_failure`：结束当前 Decision attempt/generation，本身不是 Battle terminal result；
- `session_fatal`：该 failure 是 Battle terminal candidate，由 Runtime 归约为 `BattleResult.failure`。

Simulation 只能按 `DecisionCompletion.type`、`DecisionFailure.category` 与 request lifecycle authority 分支；不得解释 concrete `DecisionFailure.code`、provider HTTP status 或 provider metadata。对于 `session_fatal`，Runtime 可以把 opaque `error.code` 原样传播到 `BattleResult.failure.code`，但不得按其具体值改变 gameplay/runtime authority。

### DEC-005 — Live Decision availability circuit — FROZEN

Live Runtime 对 authority-valid Decision completion 使用 provider-neutral availability policy：

~~~text
completed
→ availability success
→ consecutiveFailures = 0

attempt_failure
→ availability failure
→ consecutiveFailures += 1

session_fatal
→ terminal candidate

stale / lifecycle-invalid completion
→ no availability signal
~~~

连续 3 个 authority-valid `attempt_failure` 后，当前 Tick完整提交，再通过 Runtime 既有 pause control path 进入 `PAUSED`：

- 在当前已提交 Tick 边界冻结 Battle logical clock；
- 本 Tick reducer 已生成的合法 Decision request command **仍按正常顺序调用**；circuit 不撤销、不 suppress 该 Tick 已建立的 request lifecycle；
- 已经 in-flight 的 Decision request **不因 circuit pause 被 abort/revoke**；它们可以在 pause 期间完成并把 completion 放入 Decision Inbox，等 resume 后的真实 Tick消费；
- PAUSED 期间没有后续 Tick，因此自然不会继续产生新的 Tick-driven Decision generation/request；
- 不自动 cooldown/resume；
- 进入 PAUSED 时公开 `pauseReason = "decision-circuit"`；
- 必须由产品层在玩家显式选择“重试决策”后调用 `battle.resume()` 才恢复，并把 availability streak 清零；
- Replay 不执行该 live availability circuit，因为 circuit pause 不改变 requestId / decisionGeneration / Actor decision authority / Decision record trace。

Circuit 本身不得修改 Actor `decision` state、`decisionGeneration`、requestId 或 accepted-plan authority，也不得调用 request AbortController。Decision request 只有既有 lifecycle 原因（例如 damaging hit/death、cancel/close、session fatal、request replacement）才会按原规则失效/abort。

该 circuit 是 operational control state，不进入 Replay 或 Actor gameplay facts；但 public BattleSnapshot 在 PAUSED 时必须公开 `pauseReason="decision-circuit"`，供产品选择正确提示文案。它不改变 Plan validation、Actor state 或 Battle Tick规则。

## 6. Decision Protocol 与 PlanSubmission

### PLAN-002 — Decision 读取 Observation + Constraints — FROZEN

Decision 的 gameplay input 只读取 Simulation 提供的：

```text
BattleObservation（内含 bounded RecentEvents）
PlanConstraints
```

PlayerGuidance concrete capability **不在 v0 实现范围**，也不进入 Simulation authoritative Observation、Replay 或 Tick state。未来若启用，只能作为 request-scoped typed DecisionWorkflow capability/data 进入某一次 Decision workflow run，不改变 `DecisionPort` 或 Simulation authority。Presentation DOM/Sprite/camera/动画进度不得作为战斗事实。

### PLAN-003 — 最小 PlanSubmission — FROZEN

逻辑结构：

```text
PlanSubmission
├── turn?: Direction
├── path: GridPosition[]
└── skill?: {
      skillId
      targetActorId
      minCoefficient
    }
```

规则：

- `path` 只包含 future destination，不重复该 Decision Request 的 `planningOrigin`；
- path 第一格必须与 `planningOrigin` Manhattan distance = 1；后续每一步也必须上下左右四方向相邻；
- moving prefetch 时 `planningOrigin` 可以是 active move destination，而 Observation 的 committed tile 仍是 origin；因此 future path 可以合法走回旧 committed origin。
- `path.length <= PlanConstraints.maxPathSteps`；
- `turn` 只表达**原地转向**，因此出现 `turn` 时 `path` 必须为空；
- `path: []`、无 turn、无 skill = hold/reobserve；
- `path: []`、无 turn、有 skill = direct cast；
- `path: []`、有 turn、无 skill = pure turn；
- `path: []`、有 turn、有 skill = 先原地 turn；本 Tick Action 配额耗尽，skill intent 保留到后续 Tick重新校验；
- v0 不增加自由执行字段 `strategy/reason/priority/fallback/moveGoal`。

### PLAN-004 — minCoefficient 的合法值 — FROZEN

`minCoefficient` 必须等于该 Skill range matrix 中实际存在的某个**去重正 coefficient**（规范化后比较）。

例如 Skill 只有 `0.5 / 1.0`，则 `0.73` 非法。

### PLAN-005 — 提交时校验 — FROZEN

Simulation 在提交时校验：

- path 长度；
- 坐标为整数且不越界；
- 从 `DecisionRequest.planningOrigin` 开始的四方向邻接；
- 静态地形可通行；
- `turn` 必须是合法 Direction，且不能与非空 path 同时出现；
- skill 属于 Actor；
- target 必须存在于当前 Battle、不是 self、team 与 caster 不同、且当前 `hp > 0 / action != dead`；v0 恰好双 Actor，因此唯一合法 target 是当前存活的对方 Actor；
- `minCoefficient` 合法；
- `decisionGeneration` 仍有效；
- Actor 当前状态允许接受计划。

提交时**不要求未来 path 的动态占位一直为空**。

occupied/reserved/contested 等动态条件必须在每一步真正开始前重新检查。

Plan 被接受只表示“当前可以开始”，不保证未来一定走完或成功施法。

### PLAN-006 — Reject 与一次修正机会 — FROZEN

Reject 必须返回机器可读 reason；exact union见 Contracts，包括：

```text
invalid_plan_shape
path_too_long
path_out_of_bounds
path_not_adjacent
terrain_blocked
invalid_turn
turn_with_path
unknown_skill
invalid_target
invalid_min_coefficient
```

旧 generation / dead / terminal 等 authority fencing 在 Plan validation 前完成，不属于 Plan reject reason。

同一 `decisionGeneration` 最多允许**一次修正重试**。

第二次仍非法：

- 当前 generation 失败；
- Actor 保持 idle；
- 最早下一逻辑 Tick 才能新建 Decision generation。

如果修正需要再次调用 LLM，Simulation 在当前 Tick 发起新的明确 attempt；其 completion 同样只进入 Decision Inbox，不能重入当前 reducer，最早由后续 Tick 消费。

### PLAN-007 — Plan 动态执行 — FROZEN

accepted plan 在执行过程中持续面对实时战场：

- 接受计划时用最新状态校验；Decision 思考期间普通敌方移动不会自动令整份战略意图失效；
- 如果存在 pending `turn`，先把 turn 作为一个独立 Action 执行并标记完成；它消耗当前 Tick 的 Action 配额，因此同一 Tick 不能再 move 或 windup；若计划还带 skill intent，则后续 Tick按最新状态重新检查技能起手；
- 每个 move step 开始前重新检查 passability/occupancy/reservation/lifecycle/generation；
- 带 skill 的计划在 plan 起点、每次 `move_complete` 后、以及 protection 结束重新获得攻击资格时检查当前 coefficient；
- coefficient 为 0/矩阵外或低于 `minCoefficient` 时不施法，只要剩余 path 合法就继续移动；
- 达到 `minCoefficient` 且 Actor 可以攻击时，停止尚未使用的 path，进入 windup；
- path 已耗尽仍未达到阈值时，不得自动“降级”为更低 coefficient 攻击；计划结束/保持并进入后续 Decision；
- 尚未 materialize skill windup 前，如果 target 不再满足“存在、非 self、敌对、alive”，以 `target_invalid` 结束计划，并在后续合法 Tick 重规划；
- movement execution 失败只使用 MOVE-005 冻结的 `blocked / swap_forbidden / occupied / reserved / contested` taxonomy；
- 不存在额外的“计划失去意义”catch-all；无法归入 Plan exhausted、上述 exact failure、damaging interruption 或 stale authority 的状态属于 Runtime invariant；
- 不得同 Tick 零时间反复重试。

### PLAN-008 — move-only 不会自动攻击 — FROZEN

没有 skill intent 的 Plan 永远不会因为途中进入某技能合法范围而自动施法。

### PLAN-009 — hold/reobserve 与 Plan 结束后的 redecision — FROZEN

`path: []`、无 turn、无 skill 的 Plan 表示“本 Tick不启动 Action，并在后续 Tick重新观察”，不是永久 idle。

统一规则：

- hold/reobserve 在被接受的当前 Tick立即视为 Plan exhausted，但不得同 Tick创建新的 Decision generation；
- 如果最后一个 move/skill intent 已 materialize 成仍在执行的 Action，可按 STATE-006 在 Action完成前预取下一 Decision；除此之外，move/path最终结束、pure turn完成且无剩余 skill、path耗尽仍未达到 `minCoefficient`、动态阻挡/目标失效等 Plan正常结束或失败后，如果没有已预取的 thinking/pending Plan，最早下一逻辑 Tick才可创建新的 Decision generation；
- damaging hit 仍按 HIT-003 的受击 redecision 规则处理；
- 不得通过 hold/失败/Plan结束在同一 Tick形成零时间 Decision 循环。

## 7. Turn 与 Movement

### TURN-001 — 原地 Turn Action — FROZEN

v0 保留独立 `turn` Action，用于 Actor 在**同一 committed tile** 上主动改变 direction。

规则：

- `turn` 立即把 Simulation `direction` 改为目标 Direction；
- 不改变 committed tile、occupancy 或 reservation；
- 不需要 `turn_complete` future event；
- turn 本身占用 STATE-004 的“本 Tick唯一新 Action”配额；
- 因此 turn 后同一 Tick不能再启动 move 或 skill windup；
- protection 只禁止 skill windup，因此受保护 Actor可以 turn；
- recovery 是 action lock，因此 recovery 中不能 turn；
- pure turn 完成后计划结束；如果同一 Plan 还带 skill intent，则该 intent 留到后续 Tick重新校验。

### MOVE-001 — 单格移动是原子提交 step — FROZEN

A→B：

```text
占用 A
→ 申请/获得 B reservation
→ move_start：direction 立即变为 A→B 的方向
→ 移动期间 committed/occupied tile 仍是 A
→ move_complete
→ 释放 A
→ 占用 B
→ 释放 B reservation
```

这里“原子”表示**只有完整提交到 B 或保持在 A，不存在权威半格位置**；不表示已经启动的移动不可中断。

Presentation 可以平滑插值，但 Simulation 在完成前仍认为 Actor 位于 A。

### MOVE-002 — 多格 path 串行执行 — FROZEN

每个 Actor 同时最多一个 active step。

上一格 `move_complete` 提交前，不得启动下一格。

每次新 step 都重新验证动态占位和预约。

### MOVE-003 — 同 Tick 争同格使用可回放随机 — FROZEN

多个 Actor 同 Tick 申请同一目的格：

- 先统一收集；
- 最多一个成功；
- 所有竞争者等概率；
- 结果由稳定输入派生，例如：
  `battleSeed + currentTick + targetTile + sorted competingActorIds`。

不得依赖遍历顺序、Promise 顺序、`Math.random()` 或“之前已经消费了多少 RNG”。

### MOVE-004 — v0 禁止直接 swap — FROZEN

相邻两个 Actor 不允许在同 Tick 直接穿过彼此交换格子。

### MOVE-005 — movement failure taxonomy 与优先级 — FROZEN

对已经通过 lifecycle/generation fence、准备在本 Tick启动的 MoveIntent，失败 reason 与判定优先级唯一：

1. `blocked`：destination 越界或静态不可通行；
2. `swap_forbidden`：两个 surviving intents 恰好互相以对方 committed origin 为 destination；在普通 occupied 检查前识别；
3. `occupied`：destination 当前由另一个 Actor committed 占用；即使该 Actor 本 Tick也计划离开，在其 move_complete 前 origin 仍占用；
4. `reserved`：destination 已被更早 active movement 持有 reservation；
5. `contested`：通过以上检查后，本 phase 多个新 intents 申请同一原本 free/unreserved destination；seeded winner成功，其余失败；
6. 其余单一申请成功。

同一 MoveIntent只记录第一个命中的 reason。stale/dead/terminal intent 在进入 taxonomy 前被 fence，不产生 `move_failed`。

任何 movement failure：

- Actor 保持原 committed tile；
- 不创建 reservation / active move；
- 当前 Plan结束；
- 记录 exact reason；
- 最早后续合法 Tick重规划；
- 不得同 Tick零时间重试。

### MOVE-006 — move_start 瞬间转向 — FROZEN

移动 step 真正开始时，Actor 的 `direction` **立即**变为移动方向。

位置仍保持原 committed tile，直到 `move_complete`。

如果这次移动随后被受击中断，direction 不回滚；Actor 保持“刚才试图移动的方向”。

### MOVE-007 — 移动中 damaging hit 立即中断 step — FROZEN

Actor 在 active step 中受到 `finalDamage > 0` 的 `hit` 时，当前移动立即失败：

- 取消 active step；
- 取消对应未来 `move_complete` 的提交权；
- 释放 destination reservation；
- Actor 继续占用最后一个 committed origin tile，不会停在半格，也不会提交到 destination；
- 旧 accepted plan / action generation 失效。

如果 Actor **存活**：

- 获得 protection；
- 旧 Decision generation 失效；
- 确保且只创建一个受击后的新 Decision Request；
- 后续计划从该 committed origin tile 开始。

如果 Actor **死亡**：

- 保持 dead 在最后 committed tile；
- 不获得新的行动机会；
- 不创建新的 Decision Request；
- Battle 按 terminal rule 结束或继续处理同时事件。

如果 `move_complete` 已经在同一 Tick 的 reducer 前置阶段成功提交，然后本 Tick后续才受到 hit，则该 step 已经完成，不再属于“移动中受击”。

## 8. Skill Range 与 coefficient

### SKILL-001 — 单一 range matrix — FROZEN

Skill 使用任意 m×n 规则矩形矩阵，并统一按**施法者朝上**编写。

```text
"↑" = caster origin + canonical facing
0   = 无效区域
>0  = 合法目标格 + deterministic coefficient
矩阵外 = 无效
```

校验：

- 每行长度一致；
- 必须且只能有一个 `"↑"`；
- 其他单元格只能是 finite nonnegative number；
- 正 coefficient 最多 3 位小数。

实际方向由 Simulation direction 旋转矩阵。

v0 不需要独立 `origin / shape / front_only / rotate_with_facing`，也不拆 target matrix / effect matrix。

### DAMAGE-001 — coefficient 千分制与伤害取整 — FROZEN

Content coefficient 加载后转成千分制：

```text
1.0  → 1000
0.5  → 500
1.25 → 1250
```

Runtime 比较和 Replay 使用 `coefficientUnits`。

基础伤害：

```text
finalDamage = floor(baseDamage × coefficientUnits / 1000)
```

允许 `finalDamage = 0`；v0 不暗加 minimum 1。

### SKILL-002 — minCoefficient 只负责起手 — FROZEN

`PlanSubmission.skill.minCoefficient` 表示“本计划愿意在多高效果倍率时**开始技能**”。

windup 前：

- current coefficient < min：不出手，能继续 path 就继续；
- current coefficient >= min 且 Actor 可攻击：停止剩余 path，开始 windup。

一旦 windup 已经开始，`minCoefficient` 不再约束 resolve。

### SKILL-003 — 无 tracking；resolve 看当前位置 — FROZEN

v0 没有 `tracking` 字段，也没有“起手后锁定命中”。

resolve 时重新读取：

- caster 当前 committed tile；
- caster 当前 direction；
- target 当前 committed tile。

结果：

- coefficient > 0：按**当前 coefficient** 结算；
- coefficient <= 0 / 矩阵外：`miss`。

例如：

```text
1.0 起手
→ 前摇中目标退到 0.5
→ 按 0.5 结算

目标离开矩阵
→ miss
```

### SKILL-004 — windup / resolve / recovery — FROZEN

普通生命周期：

```text
windup
→ resolve
→ recovery
→ next eligible Action
```

resolve 前受到实际伤害会取消未完成 windup。

Recovery 是**行动锁，不是思考锁**：

- Decision Thinking 可以开始/继续；
- reducer 已接受的下一 Plan 可以按 STATE-006 暂存为唯一 pending accepted plan；
- recovery 中不能启动 move/turn/windup；
- 实际伤害 `hit` 会中断 recovery，并进入正常受击流程；
- `immune` 不会中断 recovery。

### SKILL-005 — windup_ticks = 0 的即时批次 — FROZEN

`windup_ticks = 0` 在**起手同一 Tick**进入一次 bounded instant-resolve batch。

同 Tick 的即时技能必须先统一收集，再批量结算，因此仍允许 simultaneous defeat。

`recovery_ticks = 0` 只表示没有额外 recovery Tick；受 STATE-004 限制，同 Tick 不会获得第二次 Action。

### SKILL-006 — v0 不做 LOS — FROZEN

v0 的技能范围只由 range matrix + caster direction + 当前双方 committed tile 决定。

Tile passability **只控制移动**，不得自动推导“不可通行 Tile 会阻挡技能”。

因此即使 caster 与 target 之间存在不可通行地形，只要 target 当前映射到 range matrix 的正 coefficient 格，技能在范围规则上仍然有效。

未来如果需要墙体阻挡、弹道或视线，必须作为新的显式机制加入，而不是复用 movement passability。

## 9. Resolve、伤害、Protection 与中断

### HIT-001 — 四种技能结算结果 — FROZEN

```text
hit
immune
miss
invalid
```

- `hit`：action/target 有效，目标仍在效果区域，且未受保护。
- `immune`：action/target 有效，目标仍在效果区域，但处于 protection。
- `miss`：技能正常结算，但目标已经在 0/矩阵外。
- `invalid`：Battle/action/target 生命周期已不允许正常结算，例如目标已死/消失、action 被取消、Battle 已结束。

`miss` 不能并入 `invalid`。

### HIT-002 — protection 半开区间 — FROZEN

使用 `protectedUntilTickExclusive`：

```text
protected = currentTick < protectedUntilTickExclusive
```

damaging hit 在 Tick `t` 存活后设置：

```text
protectedUntilTickExclusive = t + protectionTicks + 1
```

因此受击 Tick 剩余阶段也处于 protection；`protectionTicks` 表示**受击 Tick之后**额外完整保护的 Tick 数。

例如 Tick 10 受击后 `protectionTicks = 3`：

```text
Tick 10 后续阶段 protected
Tick 11/12/13 protected
protectedUntilTickExclusive = 14
Tick 14 恢复正常
```

若 `protectionTicks = 0`，只保护 Tick 10 的后续阶段，不产生额外完整保护 Tick。

无需 `protection_expire` 业务事件。

### HIT-003 — damaging hit 的 aftermath — FROZEN

`damaging hit` 定义为：

```text
outcome = hit
&& finalDamage > 0
```

batch damage 应用后：

如果 Actor **存活**：

- 当前 Action 被中断：active movement 按 MOVE-007 失败；未结算 windup 取消；recovery 结束；
- 旧 accepted plan / action generation 失效；
- 旧 Decision generation 失效；
- 获得 protection；
- 确保且只确保一个新的 Decision Request。

如果 Actor **死亡**：

- 当前 Action 全部取消；
- active movement 按 MOVE-007 留在最后 committed tile 并释放 reservation；
- 不设置新的 protection；
- 不创建新的 Decision Request。

### HIT-004 — immune 不产生受击 aftermath — FROZEN

`immune`：

- 0 damage；
- 不中断；
- 不失效 Decision；
- 不刷新/延长 protection。

### HIT-005 — protection 中允许什么 — FROZEN

Actor 处于 protection 时：

- 可以继续 Decision Thinking；
- accepted plan 中合法移动可以继续；
- 可以执行合法的原地 turn；
- **不能启动新的 skill windup**；
- 原 attack intent 可以保留；
- protection 结束后，必须用最新 caster tile/direction、target tile、plan generation 和同一 `minCoefficient` 重新检查起手；
- 之前曾经达到阈值不产生未来出手权。

Protection 阻止的是技能起手，不是 Thinking、移动或原地 turn。

### HIT-006 — 同一 hit batch 的 protection 快照 — FROZEN

同一 hit batch 中所有攻击，都按该 batch 开始时的 protection 状态判断。

本 batch 新产生的 protection 不会回溯使同 batch 其他攻击变成 `immune`。

因此允许 simultaneous defeat。

### HIT-007 — zero-damage hit 不触发受击 aftermath — FROZEN

如果技能几何/保护判断得到 `hit`，但 DAMAGE-001 计算出：

```text
finalDamage = 0
```

则 outcome 仍然是 `hit`，可以产生正常 hit Presentation / Replay 事实，但它**不是 damaging hit**：

- HP 不变；
- 不打断 movement / windup / recovery；
- 不失效 accepted plan / Decision；
- 不创建 protection；
- 不触发受击后 redecision。

未来若需要“0 damage 但有硬直/控制”，必须单独增加明确的 control/interrupt 机制。

## 10. Tick Reducer

### TICK-001 — 单 Tick 唯一处理顺序 — FROZEN

每个 `currentTick`：

1. 原子截取 `dueTick === currentTick` 的 scheduled-event snapshot，以及 snapshot 边界前已进入 Decision Inbox 的 completion snapshot。
2. 过滤 scheduled events 的 Battle/Actor 生命周期、已取消 active step 和旧 generation；Decision snapshot 留到第 9 阶段统一处理。
3. 提交仍有效且在本 Tick 到期的 `move_complete`，并处理有效 `recovery_complete`。
4. 收集此前已经启动、在本 Tick 到期的 `skill_resolve`。
5. 用移动完成后的 committed position/direction 和 batch-start protection，把普通技能归约为 `hit / immune / miss / invalid`。
6. 同步批量应用普通 `hit` damage。
7. 对 `finalDamage > 0` 的目标应用 HIT-003 aftermath：包括中断 active movement、释放 reservation、失效 Action/Plan/Decision；死亡者不获得 protection 或新 Decision。
8. 执行普通批次 terminal gate；如果 Battle 已结束，不再启动新的游戏 Action。
9. 消费第 1 步截取的 DecisionCompletion snapshot：按 generation fencing，处理 failure，校验 Plan；合法 Plan 进入 STATE-006 的 active/pending accepted-plan pipeline，非法 Plan 按 PLAN-006 决定是否发起唯一 correction attempt。snapshot 之后到达的 completion 留给下一 Tick。
10. 推进 existing/new plan；每 Actor 最多产生一个“新 Action 意图”。pending turn 在这里立即执行并消耗 Action 配额；skill/move 按规则产生后续意图。
11. 收集第 10 步新启动的 `windup_ticks=0` 技能，组成一次 bounded instant-resolve batch。
12. 用与普通技能相同的 outcome / simultaneous damage / HIT-003 aftermath / terminal 规则结算即时批次。
13. 只对经过即时批次后仍存活、计划仍有效的 movement intent 统一做 next-tile reservation；预约成功即 `move_start`，并按 MOVE-006 立即更新 direction。
14. 安排未来 `move_complete / skill_resolve / recovery_complete`，发布 Snapshot/Projection。

### TICK-002 — 当前 Tick 必须有界 — FROZEN

本 Tick 新产生的事实不得递归重新进入已经处理过的阶段。

即时 resolve、0 recovery、新 Decision、受击中断或即时 turn 都不能让同一 Actor回到 Action-start 阶段再启动第二个 Action。

## 11. BattleResult 与控制平面

### RESULT-001 — BattleResult — FROZEN

概念结果：

```text
ally win
enemy win
simultaneous defeat
cancelled
failure
```

死亡/终局检查发生在 TICK-001 的 terminal gate。

### RESULT-002 — v0 不设正式 stalemate / 最大时长 — FROZEN

v0 不因为战斗持续过久或长时间无伤害而自动结束，也不设置强制最大 Battle Tick 数。

只记录 REPLAY-002 的无进展 diagnostics；未来如果模拟数据证明需要，再通过新规则加入 `stalemate`，不得在 v0 Runtime 中暗加超时胜负。

### CTRL-002 — Pause reason 与显式玩家恢复 — IMPLEMENTED + TESTED + QUALIFIED

Runtime target contract 公开两种 pause reason：

```text
host-background
decision-circuit
```

规则：

- 任意成功 RUNNING → PAUSED transition 必须同时形成唯一 pauseReason；
- external `pause()` 的默认 / 唯一 v0 reason 是 `host-background`；
- Decision availability circuit trip 的 reason 固定为 `decision-circuit`；
- PAUSED 时 public Snapshot 必须带 pauseReason，非 PAUSED 时字段 absent；
- Runtime 通过 operational `onPause()` 通知 product composition；该事件不进入 Replay；
- 重复 pause no-op 不重复通知、不覆盖已有 reason；
- `resume()` 成功进入 RUNNING 时清除 pauseReason；
- Runtime 自己不自动 resume；Host foreground 也不得自动 resume，恢复必须由产品层在玩家显式确认后调用 `battle.resume()`。

本规则只扩展 operational control contract，不改变 gameplay reducer / Tick / Decision authority。Runtime 与 PokeMan Message/manual-recovery composition 已完成 automated qualification。
### CTRL-001 — abort/cancel 是即时控制平面 — FROZEN

Frame abort、Battle cancel、Subsystem 退出不是普通 Tick Event。

必须立即：

- 立即失效 Battle active authority；
- 禁止后续规则提交；
- 停止 scheduler；
- best-effort 取消 LLM/资源工作；
- 允许 Presentation/Frame 清理。

迟到 Promise/Event 不得修改已结束 Battle。

## 12. Determinism 与 Replay

### REPLAY-001 — Replay 必须记录的事实 — FROZEN

至少记录：

- 初始 Battle/Map/Actor 配置标识；
- `battleSeed`；
- accepted `PlanSubmission` + 内部 `acceptedPlanId`；
- Decision generation、requestTick、completion consumedTick、Plan accepted/rejected tick 与 correction attempt；
- movement reservation 与 contention 结果；
- skill `hit / immune / miss / invalid` + resolve coefficient；
- 实际伤害与 protection 区间；
- BattleResult。

Replay **不重新调用 LLM**，也不依赖真实世界 LLM completion timestamp；重放按记录的 Tick 注入/恢复对应 Decision 结果与 accepted Plan。

Deterministic Replay 的保证范围只覆盖由 initial resolved facts + recorded Decision completions + deterministic Simulation rules 能重建的 session 结果：

- normal win / defeat / simultaneous defeat；
- recorded Decision `session_fatal`；
- deterministic Simulation failure。

以下 external terminal 不要求 ReplayDriver伪造或重现发生边界，只保留 partial/audit record：

- external `cancel()` / pre-aborted signal；
- Presentation infrastructure failure；
- programmer/invariant rejection。

ReplayRecord 必须显式区分 deterministic 与 audit-only；ReplayDriver 不得把 audit-only record 当作完整 deterministic replay。

### REPLAY-002 — diagnostics 不改变规则 — FROZEN

开发/模拟环境可以记录：

```text
ticksSinceLastDamage
ticksSinceLastPositionChange
decisionCountWithoutProgress
collisionRetryCount
```

除非未来有新规则明确引用，否则这些统计不得改变 gameplay。

## 13. v0 NON-GOAL

明确不进入 v0：

- 传统交替回合；
- RPGMap Runtime 复用；
- 逐格调用 LLM；
- MP / 通用技能资源条；
- 职业/装备/升级；
- 超过两个 combat Actor（底层 collection 可 N-ready，但 v0 validator 仍必须拒绝）；
- 复杂状态系统；
- 地面选点；
- AOE / 第二张 effect matrix；
- projectile/ballistics；
- 粒子/Shader/动画编辑器；
- 探索/Transfer Runtime；
- Prompt 优化/评测作为 Battle Rule；
- 跨战训练记忆 / 模型微调。

## 14. Core OPEN 状态

此前的 6 个 core gameplay OPEN 已全部冻结：

- `OPEN-DIR-001` → TURN-001 + MOVE-006：move_start 瞬间转向，并保留独立原地 turn Action。
- `OPEN-MOVE-001` → MOVE-007 + HIT-003：任何 damaging hit 都立即中断 active movement；死亡留在最后 committed tile。
- `OPEN-HIT-001` → HIT-007：zero-damage hit 保持 `hit` outcome，但不触发 interruption/protection/redecision。
- `OPEN-LOS-001` → SKILL-006：v0 不做 LOS。
- `OPEN-CLOCK-001` → TIME-004：pause/background 冻结 Battle clock。
- `OPEN-STALEMATE-001` → RESULT-002：v0 不设正式 stalemate / 最大战斗时长，只记录 diagnostics。

**当前 Core gameplay 规则没有未冻结 OPEN 项。**三项实现 amendment：`BATTLE-003`（`ResolvedBattleActor.initialHp`）、`BATTLE-004`（独立 `BattleArena`）与 `CTRL-002`（pauseReason / onPause / 显式玩家恢复）均已完成实现与对应 qualification。

Presentation v0 的 BattleEffect、Projection、Browser ABI、camera/viewport/effect lifecycle 已在 Contracts / Presentation 中冻结。仍保持 OPEN 的其他事项主要是非 Presentation Content 的统一 subject/version、真实 Decision provider metadata/cancel/defaults、Guidance/Host wiring 等外部集成项；这些不改变已经冻结的 Core gameplay 或 Presentation 语义。
