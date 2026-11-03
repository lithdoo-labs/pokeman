# Battle v0 数据契约

> 状态：**Simulation-facing / Presentation contracts 与 BATTLE-003 `ResolvedBattleActor.initialHp`、BATTLE-004 独立 `BattleArena`、CTRL-002 `BattlePauseReason / onPause` amendments 均已 IMPLEMENTED + TESTED + QUALIFIED；Decision provider/prompt/structured-output concrete implementation 已由 BATTLE_V0_DECISION.md 冻结；外部 serialization 与 Host/Guidance wiring 保留明确 OPEN**。本文定义 Battle v0 canonical 数据边界。
>
> 核心 gameplay 语义只以 [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md) 为准；本文不重新定义 reducer 行为。

## 1. Contract 边界

建议提供很薄的共享模块：

```text
battle/contracts
  BattleSceneInit
  BattleSnapshot
  BattleObservation
  PlanConstraints
  PlanSubmission
  RenderProjection
  SkillEffectProjection
  DecisionRequest / DecisionCompletion / DecisionPort

battle/simulation
  ResolvedBattleDefinition
  BattleSimulationBuilder / BattleReplayBuilder
  BattleRuntime
  BattleClock
  ReplayRecord

simulation/internal
  BattleEvent
  AcceptedPlan
  DecisionInboxEntry
  Runtime Tick intents/facts
```

Simulation / Decision / Presentation 可以依赖这些数据类型。

Contracts 自己不拥有运行状态，不是第四个 Runtime Layer。

按 `ARCH-005`，三层共享的是稳定 Contract/Port，而不是彼此的 concrete implementation。Application/Subsystem 可以选择并注入 Decision、Simulation、Presentation 的具体实现，但 Battle clock、scheduler、Tick reducer 与 accepted-plan execution 仍由 Simulation 自己拥有。

## 2. Serialization 状态

### CONTRACT-OPEN-001 — Content subject/version 与命名 — OPEN

尚未冻结：

- 正式 subject/version，例如是否使用 `struct.BattleActor/v1`；
- 全局字段命名风格；
- Content key 是否必须等于对象内 `id`；
- `skills[]`、`effect` 的正式引用编码。

Schema version 应代表**结构兼容性**，不应因为 Fireball damage 从 5 调成 6 就升级。

下面定义的是逻辑语义；正式序列化细节仍可调整。

## 3. Shared primitives

### ActorId

```ts
type ActorId = string
```

v0 `ActorId` 必须是合法 Unicode scalar string，UTF-8 byte length 为 **1..115**。该限制既保证 identity 非空，也保证冻结的 RenderNode key `battle:actor:<actorId>` 永远不超过 Renderer 的 128-byte node-key 上限（固定前缀 `battle:actor:` 占 13 bytes）。

所有 Actor collection 都以 `actorId` 作为语义 identity。数组/迭代顺序不代表 ally/enemy、先后手或裁决优先级；需要 deterministic 顺序时必须显式按稳定 key 排序。排序按 `actorId` 的 ECMAScript ordinal string order（等价于使用普通 `< / >` 比较 UTF-16 code units）执行，不使用 locale-sensitive `localeCompare()`，也不依赖 insertion order。

v0 仍由 `BATTLE-001` 限制为恰好两个 combat Actor。Contract 使用 collection shape 是为了避免把 cardinality 编码进跨层 ABI，不表示 v0 支持多人。

### Team

```ts
type Team = "ally" | "enemy"
```

这是 v0 的两方 team identity，与 collection 顺序无关。未来组队可以在同一 Team 下拥有多个 Actor；FFA/多阵营若需要超过两种 Team，属于新版本 gameplay contract，不在 v0 暗中扩展。

### GridPosition

```ts
type GridPosition = {
  x: integer
  y: integer
}
```

权威位置只能是整数格。

### Direction

```ts
type Direction = 2 | 4 | 6 | 8
```

语义见 `STATE-002`。

### ResourceRef

Battle 直接复用 LoomRealm 已有资源身份概念：

```ts
type ResourceRef = {
  namespace: string
  key: string
  contentVersion?: string
}
```

实现时应优先复用仓库已有公共类型，而不是再定义一套平行结构。

### BattleArenaRef — IMPLEMENTED / BATTLE-004

目标 contract 不再要求 Battle Scene 引用探索 `struct.Map`：

```ts
type BattleArenaRef = {
  arenaId: string
}
```

`arenaId` 必须是非空 Unicode scalar string，并对应 `struct.BattleArena` 的 record key。

现有实现中的 `MapRef { mapId }` 属 BATTLE-004 合并前的 legacy Presentation input。BATTLE-004 落地后，Battle Presentation 不再读取 `struct.Map`；探索 Map 与 Battle grid 没有 identity / coordinate continuity 要求。

## 4. Battle Content

### 4.0 BattleArena — IMPLEMENTED / BATTLE-004

BattleArena 是 Battle-owned authored Content：

```ts
type BattleArenaContent = {
  id: string
  width: integer
  height: integer
  passable: readonly (readonly boolean[])[]
  tileset_id: integer
  data: ProjectedTable
}
```

约束：

- record key 必须等于 `id`；
- width / height 为正 safe integer；
- passable 必须是 exact `height × width` boolean matrix；
- `passable` 是 Simulation navigation authority；
- `data` 是 exact 3-layer ProjectedTable，`xSize=width / ySize=height / zSize=3`，只用于 Presentation；
- `tileset_id` 指向已有 `struct.Tileset`，只复用 Tileset / Autotile visual resources；
- BattleArena 不包含 RPGMap behaviors、transfer、bridge、ledge、terrain 或 NPC。

视觉 tile data 与 passable 是两个并列 authored facts；Presentation 不从 tile passage 推导 gameplay passability。
### 4.1 BattleActor

当前概念结构：

```json
{
  "id": "mage",
  "name": "Mage",
  "character": {
    "namespace": "resource.Graphics",
    "key": "Characters/Mage"
  },
  "max_hp": 10,
  "skills": ["firebolt", "grab"]
}
```

逻辑字段：

- definition id；
- display name；
- Character Graphics reference；
- 正整数 max HP；
- BattleSkill reference 列表。

以下属于 Runtime State，**不得**写进静态 BattleActor Content：

```text
currentHp
tile
direction
actionState
activePlan
activeStep
protectedUntilTickExclusive
actionGeneration
decisionGeneration
```

v0 默认满血开战，不需要独立 `initial_hp`。

### 4.2 BattleSkill

当前概念结构：

```json
{
  "id": "firebolt",
  "name": "Firebolt",
  "range": [
    [0, 0.5, 0],
    [0, 1.0, 0],
    [0, "↑", 0]
  ],
  "damage": 7,
  "timing": {
    "windup_ticks": 3,
    "recovery_ticks": 2
  },
  "effect": "firebolt"
}
```

逻辑字段：

```text
id
name
range
damage
timing.windup_ticks
timing.recovery_ticks
effect
```

v0 不包含：

```text
tracking
active_ticks
MP
accuracy
critical
element
armor penetration
universal cooldown
ammo
target/effect type
```

视觉持续时间属于 BattleEffect/Presentation，不属于 BattleSkill Rule timing。

Range Schema 校验遵循 `SKILL-001`。

Simulation-facing resolved range 不保留字符串 `"↑"`，固定规范化为：

```ts
type ResolvedRangeMatrix = {
  width: integer
  height: integer
  originX: integer
  originY: integer
  coefficientUnits: readonly (readonly integer[])[]
}
```

约束：

- `width/height >= 1`；
- `0 <= originX < width`、`0 <= originY < height`；
- `coefficientUnits.length === height` 且每行长度严格等于 width；
- origin cell 的 coefficientUnits 必须为 0；
- 所有 cell 为非负 safe integer；
- authored finite coefficient 按 `round(value * 1000)` 规范化；由于 authored coefficient 最多 3 位小数，该转换必须 exact；
- authored `"↑"` 的唯一坐标成为 `originX/originY`，其 cell 写 0；
- runtime range rotation 只读取该 resolved matrix，不再解析字符串 marker。

### 4.3 BattleEffect — Presentation v0 FROZEN

BattleEffect 只属于 Presentation Content。v0 record subject 固定为 `struct.BattleEffect`，record key 必须等于 `id`。

exact v0 shape：

```ts
type BattleEffectContent = {
  id: string
  image: {
    namespace: "resource.Graphics"
    key: string
  }
  anchor: "tile-center"
  timing: {
    fade_in_ticks: integer
    hold_ticks: integer
    fade_out_ticks: integer
  }
}
```

约束：

- `id` 非空且等于 record key；
- `image.key` 必须以 `BattleEffects/` 开头；
- 三个 timing 字段均为非负 safe integer；
- 三个 timing 之和必须大于 0；
- v0 只有 `"tile-center"` anchor；
- visual duration = 对应 ticks × 本场 `tickDurationMs`；
- BattleEffect timing 只控制视觉，不得改变 Skill windup/recovery/damage timing；
- v0 不支持 outcome-specific image、projectile、particle、shader 或 animation editor。

hit/immune/miss/invalid 是否创建 transient visual 的固定 policy 在 Presentation/Integration FROZEN 规范中定义。

## 5. BattleConfig

概念：

```ts
type BattleConfig = {
  tickDurationMs: 200
  maxPathSteps?: integer   // default 6
  battleSeed: string | integer

  moveTicks: integer
  protectionTicks: integer

  map: BattleArenaRef
  actors: readonly InitialActorPlacement[]
}
```

`actors` 是 actorId-addressed collection；`InitialActorPlacement` 必须携带满足 ActorId 约束的唯一 `actorId` 与显式 v0 side/team identity，数组顺序不承载 side 语义。

v0 serialization/schema 必须同时约束：

- `actors.length === 2`；
- 两个 `actorId` 唯一；
- team 恰好为 **1 个 `ally` + 1 个 `enemy`**。

validator 必须按 `BATTLE-001` 拒绝其他 cardinality、重复 actorId、双 ally 或双 enemy。这里使用 collection 而不是 TypeScript tuple，是为了不把“2”扩散到 Runtime/Presentation 的数据结构。

`tickDurationMs=200` 和默认 `maxPathSteps=6` 已冻结。

以下属于可调平衡参数，不属于 Contract 版本变化：

- `moveTicks`，且 v0 必须为整数 `>= 1`；movement 不支持 0-Tick completion；
- `protectionTicks`，整数 `>= 0`；
- Skill damage/range/windup/recovery；其中 `windup_ticks / recovery_ticks` 必须为整数 `>= 0`；
- map size。

## 6. PlanConstraints

`PlanConstraints` 告诉 Decision“允许生成什么”，不是给它列战术菜单。

exact v0 shape：

```ts
type PlanConstraints = {
  maxPathSteps: integer
  movement: {
    cardinalOnly: true
  }
  turn: {
    allowed: true
  }
  skills: readonly {
    skillId: string
    minCoefficients: readonly number[]
  }[]
}
```

约束：

- `maxPathSteps` 为非负 safe integer；
- `movement.cardinalOnly` 与 `turn.allowed` 固定为 literal `true`；
- skills 按 `skillId` ECMAScript ordinal稳定排序；
- 每个 skill 的 `minCoefficients` 来自 ResolvedRangeMatrix 中去重后的正 `coefficientUnits`，转换回 `units / 1000`，按数值升序排列；
- 不包含 occupancy、目标推荐、可走路径或策略菜单；这些是 Observation/Decision自己的推理输入。

## 7. PlanSubmission

逻辑结构由 `PLAN-003` 冻结：

```ts
type PlanSubmission = {
  readonly turn?: Direction
  readonly path: readonly GridPosition[]
  readonly skill?: {
    readonly skillId: string
    readonly targetActorId: ActorId
    readonly minCoefficient: number
  }
}
```

Runtime validation 先做 exact structural validation：顶层只允许 `turn/path/skill`；`path` 必须存在且为数组；GridPosition 只允许 integer `x/y`；skill只允许 `skillId/targetActorId/minCoefficient`。缺字段、额外字段、错误类型、非整数坐标、NaN/Infinity 等统一 reject `invalid_plan_shape`，再进入下述语义校验。

Contract 语义：

- `turn` 表示原地转向；
- 出现 `turn` 时 path 必须为空；
- path 不重复 `DecisionRequest.planningOrigin`；
- path 第一格从 planningOrigin 起算，之后只允许 cardinal step；moving prefetch 时 path 可包含旧 committed origin，只要它是 planningOrigin 之后的合法 future destination；
- empty path + no turn + no skill = hold/reobserve；
- empty path + no turn + skill = direct cast；
- empty path + turn + no skill = pure turn；
- empty path + turn + skill = turn-first plan；turn 消耗本 Tick Action，skill intent 留到后续 Tick；
- 不包含自由执行字段；
- skill target 在 submission validation 时必须：存在于当前 Battle、不是 self、team 与 self 不同、且当前 `hp > 0 / action != dead`；v0 恰好双 Actor，因此合法 target 就是当前存活的对方 Actor；
- path adjacency/static terrain 校验**不隐式使用 Observation.self.tile**，而从 `DecisionRequest.planningOrigin` 开始；这使 moving prefetch 可以基于成功提交后的 destination 规划下一段 path。

### PlanRejectReason — FROZEN

exact v0 union：

```ts
type PlanRejectReason =
  | "invalid_plan_shape"
  | "path_too_long"
  | "path_out_of_bounds"
  | "path_not_adjacent"
  | "terrain_blocked"
  | "invalid_turn"
  | "turn_with_path"
  | "unknown_skill"
  | "invalid_target"
  | "invalid_min_coefficient"
```

不得把 dynamic execution 的 `blocked / occupied / reserved / contested / swap_forbidden / target_invalid` 混入 submission reject union；这些发生在 accepted Plan执行阶段，属于 Plan failure / Replay facts。

## 8. Plan validation result — Simulation internal

`PlanAcceptance` 不是 public/cross-layer API；DecisionPort只返回 PlanSubmission。Simulation内部 validation 可以使用等价结果：

```ts
type PlanValidationResult =
  | { accepted: true }
  | {
      accepted: false
      reason: PlanRejectReason
      correctionAllowed: boolean
    }
```

`correctionAllowed = true` 仅当当前 request `attempt === 0` 且 reason 属于：

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

authority/lifecycle stale 不属于 PlanRejectReason，也不进入 correction；attempt=1 任意真正 Plan reject 都结束当前 generation。

accepted 只表示当前可以进入 active/pending pipeline，不保证未来 path/skill 一定成功。

### 8.1 Accepted Plan runtime pipeline — FROZEN boundary

`PlanSubmission` 被接受后必须先复制/规范化为 Simulation-owned immutable plan facts，Decision 返回对象本身不得成为 mutable Runtime authority。

v0 的 accepted-plan pipeline 是**有界**的：

```text
active accepted plan
        +
at most one pending accepted plan
```

语义：

- active plan 持有尚未 materialize 的 turn/path/skill intent 及执行 cursor；
- 每次只把一个 intent materialize 成当前 Action；多格 path 不预先转换成整串 future move tasks；
- 一格 movement 只有在前一格 `move_complete` 成功提交后，才允许推进 cursor 并重新评估 skill / next move；
- 当前 Plan 的最后一个 intent 已 materialize 后，Action 可以继续执行，同时按 `STATE-006` 预取下一 Decision；
- 下一 Plan 若在 action lock 解除前被接受，只占用唯一 pending slot；
- pending Plan 不得覆盖仍有 future intent 的 active Plan，也不得在 moving/windup/recovery lock 解除前启动 Action；
- damaging interruption / death / cancel 等 authority invalidation 必须同时处理 active/pending Plan 的 stale fencing。

这一区分避免两种错误实现：一是把整条 path 一次性预排进 Scheduled Event Queue；二是把 accepted-plan queue 泛化成无界 FIFO。

## 9. BattleObservation — FROZEN

Decision 看到的是 Simulation committed facts，不是 Render State。canonical v0 contract：

```ts
type BattleObservation = {
  tick: integer
  selfActorId: ActorId
  actors: readonly ObservedActor[]
  map: ObservationMap
  recentEvents: readonly ObservedEvent[]
}

type ObservationMap = {
  width: integer
  height: integer
  passable: readonly (readonly boolean[])[]
}

type ObservedActor = {
  actorId: ActorId
  team: Team
  hp: integer
  maxHp: integer
  tile: GridPosition
  direction: Direction
  action: ObservedAction
  protectedUntilTickExclusive: integer
  skills: readonly ObservedSkill[]
}

type ObservedAction =
  | { type: "idle" }
  | {
      type: "moving"
      from: GridPosition
      to: GridPosition
      startTick: integer
      completeTick: integer
    }
  | {
      type: "windup"
      skillId: string
      targetActorId: ActorId
      startTick: integer
      resolveTick: integer
    }
  | {
      type: "recovery"
      skillId: string
      completeTick: integer
    }
  | { type: "dead" }

type ObservedSkill = {
  skillId: string
  baseDamage: integer
  windupTicks: integer
  recoveryTicks: integer
  range: ResolvedRangeMatrix
}

type ObservedEvent =
  | {
      type: "move_failed"
      tick: integer
      actorId: ActorId
      tile: GridPosition
      reason: "blocked" | "occupied" | "reserved" | "contested" | "swap_forbidden"
    }
  | {
      type: "move_interrupted"
      tick: integer
      actorId: ActorId
      reason: "damaging_hit"
    }
  | {
      type: "skill_resolved"
      tick: integer
      casterActorId: ActorId
      targetActorId: ActorId
      skillId: string
      result: SkillResolveResult
      coefficientUnits: integer
      finalDamage: integer
    }
  | {
      type: "protection_started"
      tick: integer
      actorId: ActorId
      protectedUntilTickExclusive: integer
    }
```

约束：

- `actors` 恰好包含本场两个 Actor，按 actorId ordinal稳定排序；`selfActorId` 必须命中其中一个；
- `skills` 按 skillId ordinal稳定排序；dead Actor 仍保留其静态 skill facts；
- `map.passable` 是 resolved gameplay passability 的 detached readonly view，不包含 Presentation tile/sprite/camera facts；
- moving Actor 的 `tile` 仍是 committed origin；`action.to` 只是当前 active movement目标；
- 不暴露 `actionGeneration / decisionGeneration / requestId / Plan cursor / reservation owner` 等 Runtime fencing 细节；
- `recentEvents` 是 deterministic bounded history：只包含 observation Tick `tick` 与 `tick - 1` 两个 Tick中产生的上述事件；排序 key 固定为 `(event.tick, kindRank, primaryActorId, secondaryActorId)`，其中 kindRank 为 `move_failed=0 / move_interrupted=1 / skill_resolved=2 / protection_started=3`；move/protection 的 primaryActorId 是 actorId、secondary 为空串，skill 的 primary= casterActorId、secondary=targetActorId；字符串均按 ECMAScript ordinal 比较；
- initial tick 0 没有 prior gameplay event，`recentEvents = []`；
- Observation builder 不持有无界历史；这些 event 可从最近两个 ReplayTick facts/当前 Tick facts派生；
- Future PlayerGuidance **不属于 canonical BattleObservation**，当前 v0 不实现其 concrete contract。未来若启用，必须通过 BATTLE_V0_DECISION.md 冻结的 request-scoped typed `DecisionWorkflow` capability/data 进入某一次 workflow run；Simulation Core 不解析、不存储、不回放 Guidance，也不因此修改 `DecisionPort`。

Contracts 不定义 provider prompt 文本；Battle v0 concrete DeepSeekDecision 的 prompt/context formatting 已在 BATTLE_V0_DECISION.md 冻结。任何 concrete formatter 都不得改变上述结构化 input facts。
## 10. BattleResult / BattleStatus / BattleSnapshot

Simulation public result contract 冻结为：

```ts
type BattleResult =
  | { type: "ally_win" }
  | { type: "enemy_win" }
  | { type: "simultaneous_defeat" }
  | { type: "cancelled" }
  | {
      type: "failure"
      source: "simulation" | "decision" | "presentation"
      code: string
    }

type BattleStatus =
  | "created"
  | "initializing"
  | "running"
  | "paused"
  | "settled"
  | "closed"

type BattlePauseReason =
  | "host-background"
  | "decision-circuit"

type BattlePauseEvent = {
  reason: BattlePauseReason
}
```

当前 v0 只公开两种产品需要区分的 pause reason：

- `host-background`：Host / App 进入后台导致的 external pause；
- `decision-circuit`：连续 Decision availability failure 达到 circuit threshold。

稳定 Contract 不携带 raw `Error`、stack、provider response 或 Browser internal object；这些只进入 diagnostics/logging。

BattleSnapshot 是 detached authoritative state view：

```ts
type BattleSnapshot = {
  battleId: string
  sceneEpoch: integer

  currentTick: integer
  tickDurationMs: 200
  status: BattleStatus
  pauseReason?: BattlePauseReason

  actors: readonly ActorSnapshot[]
  reservations: readonly ReservationSnapshot[]
  result?: BattleResult
}
```

ActorSnapshot / ReservationSnapshot exact public shape：

```ts
type ActorSnapshot = {
  actorId: ActorId
  team: Team
  hp: integer
  maxHp: integer
  tile: GridPosition
  direction: Direction
  action:
    | { type: "idle" }
    | {
        type: "moving"
        motionId: integer
        from: GridPosition
        to: GridPosition
        startTick: integer
        completeTick: integer
      }
    | {
        type: "windup"
        skillId: string
        targetActorId: ActorId
        startTick: integer
        resolveTick: integer
      }
    | {
        type: "recovery"
        skillId: string
        completeTick: integer
      }
    | { type: "dead" }
  decision: "none" | "thinking"
  protectedUntilTickExclusive: integer
}

type ReservationSnapshot = {
  actorId: ActorId
  tile: GridPosition
}
```

ActorSnapshot 的 canonical 字段必须叫 `direction`，不得再并行使用 `facing`。Public Snapshot 不暴露 action/decision generation、requestId、Plan cursor 或 queue state。

Snapshot ordering 固定：`actors` 按 actorId ECMAScript ordinal排序；`reservations` 按 actorId ordinal排序。v0 不使用 `Record<ActorId, ...>` 作为 public actor collection，避免开放字符串 key 的普通 JS object 特殊语义。

`pauseReason` exact invariant：只有 `status === "paused"` 时字段存在；其他 status 必须 absent。进入 PAUSED 的 transition 必须先确定 reason，再发布 Snapshot / operational pause event；`resume()` 成功进入 RUNNING 时清除 reason。重复 pause no-op 不得覆盖原 reason，尤其 `decision-circuit` pause 期间发生 Host background 时仍保持 `decision-circuit`。

BattleSnapshot 与 RenderProjection 是两类不同数据。v0 不公开没有明确 consumer/递增语义的 `battleEpoch / stateVersion`；late async fencing 使用 Runtime lifecycle、AbortSignal、`actionGeneration / decisionGeneration`。内部实现若需要诊断 revision，不得因此扩张 public Snapshot ABI。

## 11. ActorRuntimeState

概念内部结构：

```ts
type ActorRuntimeState = {
  actorId: string
  team: Team
  hp: integer
  maxHp: integer
  tile: GridPosition
  direction: Direction

  action: ActionState
  decision: DecisionState

  activePlan: AcceptedPlan | null
  pendingPlan: AcceptedPlan | null

  protectedUntilTickExclusive: integer

  actionGeneration: integer
  decisionGeneration: integer
  nextMotionId: integer
}
```

两条状态轴必须分开：

```ts
type ActionState =
  | { type: "idle" }
  | {
      type: "moving"
      generation: integer
      motionId: integer
      from: GridPosition
      to: GridPosition
      startTick: integer
      completeTick: integer
    }
  | { type: "windup"; /* exact skill action payload */ }
  | { type: "recovery"; /* exact recovery payload */ }
  | { type: "dead" }

type DecisionState =
  | { type: "none" }
  | {
      type: "thinking"
      requestId: string
      generation: integer
      attempt: 0 | 1
      requestTick: integer
    }
```

windup/recovery exact payload、AcceptedPlan cursor 与 Runtime-only counters 已在 BATTLE_V0_SIMULATION.md 冻结；Contracts 这里只保留跨文档 authority 关系：

- `thinking` 不得进入 ActionState；因此 `moving + thinking`、`recovery + thinking` 等 `STATE-005` 组合可直接表达；
- Decision completion 在 reducer 消费前只存在于 Decision Inbox，不建立独立的 Actor `ready` state；
- active movement step 的权威 payload 直接属于 `ActionState { type: "moving" }`，不再并行维护第二份 `activeStep` authority；
- `activePlan` 是当前 Simulation-owned Plan；`pendingPlan` 只用于 `STATE-006` 允许的唯一下一 Plan，v0 不要求通用 Plan FIFO；
- `actionGeneration` 是 move/windup/recovery scheduled-event 的统一 stale fence，不再为 movement/skill/recovery 各自创造重复 generation；
- `decisionGeneration` 是 Decision authority generation；`requestId` 只做某次异步 attempt 的 correlation identity，二者不得合并。

`turn` 是同 Tick 即时 Action，不需要持久化 `turning` ActionState 或 `turn_complete` 事件；accepted plan 内部只需能记录 pending/completed turn intent。

## 12. BattleEvent — Simulation internal

`BattleEvent` 只属于 ScheduledEventQueue，不是 root `battle/contracts` export，也没有跨层 consumer。Simulation core scheduled event union 冻结为：

```ts
type BattleEvent =
  | {
      type: "move_complete"
      eventId: string
      dueTick: integer
      actorId: ActorId
      actionGeneration: integer
    }
  | {
      type: "skill_resolve"
      eventId: string
      dueTick: integer
      actorId: ActorId
      actionGeneration: integer
    }
  | {
      type: "recovery_complete"
      eventId: string
      dueTick: integer
      actorId: ActorId
      actionGeneration: integer
    }
```

Event 不重复保存 movement from/to、skill target 等 authoritative action payload；消费时从当前 ActionState 读取并用 actionGeneration fencing。

DecisionCompletion 不属于 BattleEvent，也没有 `dueTick`；它进入 Simulation-owned Decision Inbox。

原地 `turn` 即时完成，不需要 `turn_complete` 事件。

Protection 过期由 `protectedUntilTickExclusive` 推导，不需要 `protection_expire` 业务事件。

## 13. SkillResolveResult

共享 outcome：

```ts
type SkillResolveResult =
  | "hit"
  | "immune"
  | "miss"
  | "invalid"
```

语义只由 `HIT-001` 定义。

相关 Event/Replay 应携带实际 resolve coefficient（Runtime 内优先使用 normalized units）。

## 14. Presentation 数据边界

PresentationPort 的 v0 surface 包含一个只读、one-shot 的异步 terminal failure channel：

```ts
interface PresentationPort {
  readonly failure: Promise<PresentationFailure>
  initialize(scene: BattleSceneInit): Promise<void>
  render(projection: RenderProjection): void
  pause(): void
  resume(): void
  close(): void
}
```

`failure` 只暴露 Presentation 在 resize/resource/internal callback 中发生、无法由调用栈捕获的 terminal fatal 事实。它不决定 `BattleResult`，不授予 Browser gameplay authority；Presentation 必须立即停止自己的 visual authority 并 cleanup，Runtime 观察后负责停止 Battle authority、映射最终 `BattleResult.failure`。该 channel 每 session 最多完成一次；显式 `close()` 后不得再完成。同步 `render()/pause()/resume()` fatal 仍直接 throw，由 Runtime 的同步调用边界处理。

### 14.1 BattleSceneInit — FROZEN + BATTLE-004 IMPLEMENTED

Presentation 初始化只依赖纯数据描述，不要求知道 Simulation 或 Decision concrete implementation。下面 shape 是 v0 exact Presentation ABI：

```ts
type BattleSceneInit = {
  battleId: string
  sceneEpoch: integer
  tickDurationMs: 200
  map: BattleArenaRef
  actors: readonly Array<{
    actorId: ActorId
    team: Team
    character: ResourceRef
  }>
  effectIds: readonly string[]
}
```

这里描述的是**本 Battle Scene 的稳定视觉资源/identity**，不重复携带会随 Runtime 改变的 tile、direction、HP 或 movement。Actor identity 只由 `actorId` 决定，collection 顺序不承载 team/side 语义。v0 Simulation 只会产生两个 Actor，但 Presentation 的 collection/reconciliation 不应硬编码固定两个 slot。

BATTLE-004 目标实现中，Presentation 据此加载 BattleArena / Tileset / Autotile / Character / BattleEffect 等静态视觉资源，不读取 `struct.Map`；第一次权威动态视觉状态统一由随后的一次 `RenderProjection` 提供。`effectIds` 必须是本 Battle 可能由 Skill 引用的 BattleEffect id 的去重、按 ECMAScript ordinal string order 稳定排列集合；不得使用 locale-sensitive 排序。Presentation 在 initialize 阶段解析 `struct.BattleEffect` 与其 Graphics。

Runtime 必须在 Battle clock 启动前先完成 `initialize(scene)`，再发布 initial Projection（通常为 tick 0），从而避免 SceneInit 与 RenderProjection 同时维护两份 tile/direction/HP 初值。

### 14.2 RenderProjection — FROZEN

RenderProjection 是非权威视觉数据。下面 shape 是 v0 exact cross-layer ABI：

```ts
type RenderProjection = {
  sceneEpoch: integer
  tick: integer
  actors: readonly ActorRenderProjection[]
  effectStarts: readonly SkillEffectProjection[]
}

type ActorRenderProjection = {
  actorId: ActorId
  tile: GridPosition
  direction: Direction
  hp: integer
  maxHp: integer
  life: "alive" | "dead"
  movement: MovementProjection | null
}

type MovementProjection = {
  motionId: integer
  from: GridPosition
  to: GridPosition
  startTick: integer
  completeTick: integer
}
```

Presentation 可以自行插值和控制 camera，但不得 reverse-sync 回 Simulation。

Movement identity 是 actor-local：不同 Actor 可以同时拥有不同 `motionId`。不再维护独立 `movements[]` 表让 Presentation 二次 join Actor；每个 Actor 的当前 movement 直接附着在对应 Actor projection 上。

`visualEpoch` 不属于跨层 Contract。Presentation 每次把 Simulation Projection、viewport resize 或 camera/layout 变化归约成 Browser visual commit 时，自行推进 Presentation-local `visualEpoch`。

`effectStarts` 只表示**本次 Simulation Projection 新产生的一次性 effect start facts**，不是“当前仍在播放的所有 effect”。Presentation 以 `effectId` 去重并自行维护 fade/hold/cleanup；后续 Projection 不需要重复携带仍在播放的 effect。

v0 不从 Simulation 向 Presentation 发送 camera `focusHint`。Camera framing 只消费 Presentation 已经拥有的 Actor collection / Map / viewport 事实，由 Presentation 自己决定。

Simulation 可以通过 PresentationPort 发布已经由 reducer 决定的 Projection/表现事实；这不赋予 Presentation Rule authority，也不得把动画完成当作 Simulation commit 条件。

### CONTRACT-PRES-003 — Projection / Presentation serialization — FROZEN

v0 固定：

- Actor 以 `actorId` collection 表示，顺序不承载 identity；
- Actor movement 是 actor-local projection，不存在独立 `movements[]` join；
- `BattleSceneInit` 只携带稳定 Scene/Actor/effect identity/resource facts；初始及后续动态状态都走 `RenderProjection`；
- Simulation Projection 携带 `sceneEpoch + tick`；`visualEpoch` 是 Presentation-local，不跨层；
- `effectStarts[]` 是 one-shot effect start facts，不是 active-effect snapshot；
- v0 不输出 camera `focusHint`；
- Presentation lifecycle verbs 固定为 `initialize / render / pause / resume / close`；
- 所有字段均为 required；需要“无值”的字段使用显式 `null`，不得通过字段缺失表达状态。

`ARCH-005` 的边界同时冻结：Presentation module 可独立实现/测试；Simulation 只依赖共享 Port，不依赖 Browser concrete implementation；业务 Subsystem 不承担逐 Tick Projection 转发职责。

## 15. SkillEffectProjection — FROZEN

```ts
type SkillEffectProjection = {
  effectId: string
  result: "hit" | "immune" | "miss" | "invalid"
  effect: string
  tile: GridPosition | null
  startTick: integer
}
```

约束：

- `effectId` 在一个 Battle session 内唯一；
- `effect` 必须存在于 `BattleSceneInit.effectIds`；
- `startTick` 是产生该 outcome 的 Simulation tick；
- 有逻辑 anchor 时 `tile` 为对应格；不存在合法逻辑 anchor 时显式为 `null`；
- Presentation 不从该结构反推 damage、interrupt、death 或其他 gameplay transition；
- hit/immune/miss/invalid 的 v0 可见性 policy 在 Presentation FROZEN spec 中固定。

## 16. DecisionPort / Decision Inbox — FROZEN

DecisionPort 的职责是“一次调用完成一次 attempt”。它不返回 Battle timing，也不拥有 Tick/Plan lifecycle。

```ts
type DecisionRequest = {
  requestId: string
  actorId: ActorId
  generation: integer
  planningOrigin: GridPosition
  observation: BattleObservation
  constraints: PlanConstraints
  correction?: {
    rejectedPlan: PlanSubmission
    reason: PlanRejectReason
  }
}
```

`planningOrigin` 是该 request 返回 Plan 的 path 校验起点：

- 普通/initial/redecision：等于 request 创建时 Actor committed `tile`；
- moving prefetch：等于当前 `ActionState.moving.to`，即该 move 成功后的预期 committed tile；
- windup/recovery prefetch：仍等于当前 committed `tile`；
- correction attempt 必须继承原 attempt 的同一 planningOrigin，不重新捕获；
- Observation 中 moving Actor 的 `tile` 仍保持 committed origin；Decision 同时看到 `planningOrigin` 与 `observation.action.to`，不得把预测位置伪装成 committed fact。

```ts
type DecisionFailure = {
  category: "attempt_failure" | "session_fatal"
  code: string
  metadata?: unknown
}

type DecisionCompletion =
  | {
      type: "completed"
      requestId: string
      generation: integer
      plan: PlanSubmission
    }
  | {
      type: "failed"
      requestId: string
      generation: integer
      error: DecisionFailure
    }

interface DecisionPort {
  decide(
    request: DecisionRequest,
    signal: AbortSignal,
  ): Promise<DecisionCompletion>
}
```

`requestId / generation` 是 Simulation 生成的 correlation identity；Decision implementation 必须原样返回，不拥有其生命周期。Runtime为每次调用捕获 expected `actorId/requestId/generation`。

`DecisionFailure.category` 是 Simulation authority contract；`DecisionFailure.code` 与 `metadata` 对 Simulation branching 是 opaque concrete-Decision diagnostics。Simulation：

- 可以按 `attempt_failure | session_fatal` 分支；
- 可以在 `session_fatal` terminal result 中原样传播 `error.code`；
- **不得**按具体 code、provider HTTP status 或 metadata 改变 retry/pause/terminal authority；
- live availability circuit 只按 authority-valid completion outcome/category 与 lifecycle fencing 运行。

- resolved completion 的 requestId/generation 与 expected 不一致 → DecisionPort protocol invariant violation；Runtime cleanup并 reject active `run()`，不包装成 Plan reject 或 BattleResult.failure；
- DecisionPort Promise rejection / synchronous throw 表示 adapter/programmer invariant（预期 provider/network failure MUST 归一化成 `DecisionCompletion.failed`）；Runtime cleanup并 reject active `run()`；
- malformed completion object 同样属于 DecisionPort protocol invariant；
- 上述 invariant path 必须被 Runtime 捕获，不能成为 unhandled Promise rejection。

DecisionCompletion 不携带任何 wall-clock/Battle-time timing 字段，也不携带 Decision dueTick / acceptedTick。

异步 completion 到达时只进入 Simulation-owned Decision Inbox。Simulation 在 Tick reducer snapshot 中消费它，并负责：

- stale generation fencing；
- Plan validation；
- STATE-006 的 active/pending accepted-plan pipeline；
- `PLAN-006` correction retry；
- consumedTick / acceptedTick Replay facts。

Provider/network/response failure 属于 concrete Decision implementation 的 infrastructure policy，必须在预期失败路径归一化成 `DecisionCompletion { type: "failed" }`；它不是 Battle gameplay deadline。具体 provider code/timeout 值不属于 Simulation branching contract。

Decision Inbox 是 Simulation internal runtime structure，不属于 Presentation Contract，也不作为 `BattleEvent(dueTick)` 序列化。

## 17. ReplayRecord — Simulation public contract

`ReplayRecord` 从 `@loomrealm-game/battle/simulation` 导出，与 `ResolvedBattleDefinition` 同 module ownership；root shared contracts 不反向依赖 Simulation。

Replay 必须足以在**不重新调用 Decision/LLM**的情况下复现：

```text
detached ResolvedBattleDefinition initial facts（含 battleSeed）
accepted PlanSubmissions + acceptedPlanIds
Decision request/consume/accept Tick + generation facts
movement reservation/contention
skill outcomes + coefficient
damage/protection
BattleResult
```

ReplayRecord exact v0 schema、fact shapes 与 ReplayDriver 执行方式已在 BATTLE_V0_SIMULATION.md §26–27 冻结；Replay 不要求把 Runtime 实现为通用 event-sourcing framework。

## 18. Contracts OPEN

- **CONTRACT-OPEN-001**：BattleActor/BattleSkill 等非 Presentation Content 的统一 subject/version、全局 key/id 与引用编码；Presentation v0 所需 `struct.BattleEffect` subject/key 已冻结。

Decision concrete provider code、prompt/token formatting、structured-output/parser/failure/timeout/retry 已集中冻结在 BATTLE_V0_DECISION.md，不再属于 Contracts OPEN；`attempt_failure | session_fatal` authority classification 与 `BattleObservation.recentEvents` 两-Tick history window 继续保持现有 frozen semantics。

这些 OPEN 不得改变 SPEC 中已冻结的 gameplay 语义。
