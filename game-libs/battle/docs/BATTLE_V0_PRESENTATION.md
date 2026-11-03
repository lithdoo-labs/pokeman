# Battle v0 Presentation Implementation Spec

> 状态：**FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED**。
>
> 本文是 Battle v0 Presentation 的规范性实现合同。Presentation 与 BATTLE-004 独立 BattleArena loading 已 FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED。实现 agent 不得自行更换 public API、Render Tree、Node data ABI、坐标模型、camera、viewport policy、effect policy 或 lifecycle 语义。
>
> - gameplay/runtime 权威语义仍以 [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md) 为准；
> - cross-layer 数据字段以 [BATTLE_V0_CONTRACTS.md](./BATTLE_V0_CONTRACTS.md) 中已冻结的 Presentation contracts 为准；
> - LoomRealm/Host/LLM 外部 wiring 仍以 [BATTLE_V0_INTEGRATION.md](./BATTLE_V0_INTEGRATION.md) 为准；
> - 本文中的 **MUST / MUST NOT / FROZEN** 为 v0 强制要求；实现若无法满足，必须先修改规范，不得在代码中暗自选择另一套行为。

## 1. 目标

Presentation 的职责只有一句话：

> **把 Simulation 已经决定的视觉事实翻译成 LoomRealm RenderDomain / Browser 表现。**

Presentation 不解释 Battle Rule，不决定 gameplay transition。

因此它可以决定：

- BattleArena / Tileset / Autotile 怎样画；
- Actor Sprite 怎样显示；
- committed move step 怎样插值；
- HP、死亡、技能效果怎样表现；
- camera、viewport、layout 怎样变化；
- Browser resource / animation 生命周期如何清理。

它不得决定：

- Actor 是否可以移动；
- damaging hit 是否中断 move；
- HP 应扣多少；
- Actor 是否死亡；
- protection / recovery / generation 是否变化；
- skill 是 hit / immune / miss / invalid；
- BattleResult。

这些事实必须先由 Simulation 决定，再进入 Presentation。

Decision completion / Decision Inbox / Plan acceptance Tick 都属于 Decision↔Simulation 内部协议，不进入 Presentation ABI。Presentation 不观察 LLM completion timing，只消费 Simulation 已发布的 `RenderProjection`；因此 Decision inbox 模型的变化不得要求 Browser/Render Tree 增加反馈或 timing 字段。

## 2. 参考现有 Map 包的工程模式

Battle Presentation 应优先沿用已经实现的 `game-libs/map` 工程惯例，而不是另建一套渲染基础设施。

Map 当前的核心形态是：

```text
@loomrealm-game/map
    │
    ├─ RPGMapBuilder(scope, frame)
    │        ↓
    │   RPGMapHandler
    │
    ├─ map-owned Runtime
    │        ↓
    │   RenderDomain
    │
    └─ browser/map.browser.js + map.css
         lr-map-view
         lr-map-sprite
```

Battle 不复用 RPGMap Runtime，但复用这套**模块接入方式**：

- game-lib 可以直接依赖 `@loomrealm/subsystem`；
- Builder/Handler 接收现有 `SubsystemScope / Frame`；
- game-lib 内部使用 `scope.content`、`scope.viewport`、`scope.createRenderDomain()`；
- Browser 表现继续通过 game-lib 自带 browser assets/custom elements；
- Presentation 对上只暴露 Battle 语义，不向 Simulation 暴露 `RenderDomain` / DOM。

### 2.1 BATTLE-004：Presentation 只加载 BattleArena，不加载探索 Map

BATTLE-004 目标实现中，`BattleSceneInit.map` 携带 `BattleArenaRef { arenaId }`。Presentation 初始化时：

1. 读取 `struct.BattleArena/<arenaId>`；
2. 校验 width / height / passable / tileset_id / 3-layer tile data；
3. 读取 Arena 的 `struct.Tileset/<tileset_id>` 与 Tileset / Autotile Graphics；
4. 使用 Arena.data 绘制 tile；
5. 不读取 `struct.Map`，也不读取 passages / terrain / bridge / transfer 来决定 gameplay。

Arena.passable 属 Simulation input；Presentation 不需要使用它做 movement 判定。BattleArena 的 visual tile data 与 gameplay passable 可以独立 author。
## 3. 模块与 Session 生命周期

必须区分“长期复用的 Battle 库”与“一场 Battle 的 session”。

### 3.1 长期复用

以下对象/代码可以跨多场 Battle 复用：

```text
@loomrealm-game/battle package
SubsystemScope
ContentClient / content cache
Renderer infrastructure
Browser custom element definitions
battle.browser.js / battle.css
Builder / factory class definitions
```

### 3.2 每场 Battle 独立

每一场 Battle 创建独立 session：

```text
BattleSession
├─ Simulation Runtime
├─ Decision session
├─ PresentationHandler
├─ RenderDomain
├─ scheduler / event queue
├─ Battle state
├─ visual state
└─ session cancellation authority
```

一个已经 `close()` 的 PresentationHandler 不重新 `initialize()` 承载下一场 Battle。

新的 Battle 创建新的 Handler。

这样避免上一场残留的：

- RenderDomain；
- viewport subscription；
- `sceneEpoch / visualEpoch / motionId`；
- transient effect state；
- animation/timer；
- resource Promise；
- stale Browser completion；

污染下一场 Battle。

## 4. 并发模型

“每场 Battle 一个实例”不是并发限制，反而是并发基础。

同一个 Battle library / Subsystem environment 可以同时持有多个互不共享可变状态的 session：

```text
Battle environment
    │
    ├─ Battle A
    │    ├─ Simulation A
    │    ├─ Decision A
    │    ├─ Presentation A
    │    └─ RenderDomain A
    │
    └─ Battle B
         ├─ Simulation B
         ├─ Decision B
         ├─ Presentation B
         └─ RenderDomain B
```

因此实现禁止 package-global：

```text
currentBattle
currentDomain
currentProjection
currentMotionId
```

这类单例可变状态。

所有 session-local 状态必须保存在各自实例内。

### 4.1 同时运行与同时可见不是同一个问题

多个 Battle Runtime 同时运行不要求多个 Battle 同时显示。

如果产品要在一个 viewport 同时显示多场 Battle，例如：

```text
┌──────────────┬──────────────┐
│   Battle A   │   Battle B   │
└──────────────┴──────────────┘
```

则还需要额外的 viewport region / mount rect / layout ownership 设计。

当前 `SubsystemScope.viewport` 只描述整个 viewport；本文不自行假设已有 sub-viewport API。

因此：

- **多 Battle session 并发**：Presentation 设计本身支持；
- **多 Battle 同屏布局**：v0 NON-GOAL；不通过共享一个 PresentationHandler 解决，也不阻塞本 Presentation freeze。

## 5. FROZEN 导出形态

Battle Presentation v0 MUST 提供：

```ts
import {
  BattlePresentationBuilder,
  type BattlePresentationHandler,
} from "@loomrealm-game/battle/presentation"
```

Builder 参考 Map：

```ts
export class BattlePresentationBuilder {
  constructor(
    scope: SubsystemScope,
    frame: Frame,
  )

  build(): BattlePresentationHandler
}
```

一个 Builder 对应一个 session build。Builder 的 `build()` 是 one-shot；重复 build MUST 抛 programmer error。需要第二场 Battle 时创建新的 Builder/Handler。

不同 Builder/Handler 可以同时存在，因此该约束不限制并发。

## 6. FROZEN Handler 接口

```ts
export interface BattlePresentationHandler extends PresentationPort {
  readonly failure: Promise<PresentationFailure>

  initialize(
    scene: BattleSceneInit,
  ): Promise<void>

  render(
    projection: RenderProjection,
  ): void

  pause(): void

  resume(): void

  close(): void
}
```

语义：

- `initialize()`：一次性建立本场 Battle 的视觉 Scene；
- `render()`：正常运行期唯一主要入口，只表现 Simulation 已决定的视觉事实；
- `pause()/resume()`：冻结/恢复视觉时间，不产生任何 Battle Rule；
- `close()`：终止本 session 的视觉生命周期并释放 RenderDomain/resource/listener。

这五个 lifecycle verbs 是 v0 Presentation canonical surface；`BattlePresentationHandler` 本身就是业务注入 Simulation 的 `PresentationPort` concrete implementation，不增加转发 adapter，也不允许 `apply/dispose` 第二套术语。

`failure` 不是第六个 lifecycle verb，也不是 Browser ACK。它是每个 Handler session 独立的 one-shot async terminal channel：resize timer、resource completion 或其他 internal callback 中的 fatal 无法从原始 Runtime 调用栈同步抛出时，Handler 必须立即关闭自身 visual authority并通过该 Promise 暴露已分类 `PresentationFailure`。Runtime 观察它并独占最终 Battle failure mapping；Presentation 不决定 `BattleResult`。显式 close 后 channel 不得完成，同一 fatal 不得重复发送；同步 `render()/pause()/resume()` fatal 仍直接 throw。

### 6.1 Handler 状态机 — FROZEN

```text
NEW
 │ initialize()
 ▼
INITIALIZING
 │ success
 ▼
INITIALIZED
 │ first render()
 ▼
READY ⇄ PAUSED
 │        │
 └── close() ──→ CLOSED

initialize failure / first-render failure / close during initialize
→ cleanup
→ CLOSED
```

规则：

- `initialize()` 只允许从 NEW 调用；重复调用 MUST throw；
- first `render()` 只允许从 INITIALIZED 调用并负责创建唯一 RenderDomain；
- subsequent `render()` 只允许从 READY/PAUSED 调用；
- `render()` 在 NEW/INITIALIZING 调用 MUST throw；
- `pause()`：READY → PAUSED；PAUSED 重复调用 no-op；
- `resume()`：PAUSED → READY；READY 重复调用 no-op；
- `pause()/resume()` 在 NEW/INITIALIZING/INITIALIZED 属于 programmer error；CLOSED 后 no-op；
- `close()` 可从任何状态调用且 MUST idempotent；
- CLOSED 后 `render()` no-op，用于吸收 teardown race；不得重新创建 RenderDomain；
- close during INITIALIZING 必须使所有迟到资源 Promise / viewport callback 失去提交权；
- initialize 或首次 render fatal 后 Handler 进入 CLOSED，不允许复用。
- async callback fatal 必须进入 CLOSED，并且 `failure` 恰好完成一次；不得成为 unhandled timer exception；

实现至少提供以下机器可识别错误语义：

```text
PRESENTATION_INVALID_STATE
PRESENTATION_SCENE_MISMATCH
PRESENTATION_PROJECTION_CONFLICT
PRESENTATION_CONTENT_FAILED
PRESENTATION_COMMIT_FAILED
PRESENTATION_INVALID_DATA
```

错误 class/字段可按仓库惯例实现，但 code 语义不得合并。

## 7. initialize(scene)

Scene Init 只包含建立稳定 Scene/资源身份所需事实；所有会变化的 Actor visual state 统一从 RenderProjection 进入。

FROZEN cross-layer shape：

```ts
type BattleSceneInit = {
  battleId: string
  sceneEpoch: number
  tickDurationMs: 200
  map: BattleArenaRef
  actors: readonly BattleActorRenderInit[]
  effectIds: readonly string[]
}

type BattleActorRenderInit = {
  actorId: string
  team: Team
  character: ResourceRef
}
```

Actor collection 的语义要求：

- 每个 `actorId` 必须满足 Contracts 的 ActorId 非空/Unicode/1..115 UTF-8 byte 约束，且 roster 内唯一；
- collection 顺序不表示 ally/enemy 或优先级；
- v0 Simulation 按 `BATTLE-001` 只产生两个 Actor；
- Presentation 本身按 collection 建节点/更新，不把两个固定 slot 写进 renderer；合法 v0 Simulation 仍只会提供两个 Actor；
- 同一 Battle session 的 roster 在 v0 初始化后保持稳定；
- `effectIds` 是本场所有可引用 BattleEffect id 的去重、按 ECMAScript ordinal string order 稳定排列数组。

不进入 Scene Init 的 Simulation 内部字段包括：

```text
acceptedPlanId
decisionGeneration
actionGeneration
reservation
battleSeed
PlanConstraints
minCoefficient
```

### 7.1 初始化内部流程 — FROZEN

`initialize(scene)` MUST：

```text
validate scene identity / ActorId bounds+uniqueness / stable effectIds
    ↓
创建 session AbortController，并与 frame.signal 共同作为资源取消 authority
    ↓
并行加载：
  struct.BattleArena
  struct.Tileset
  Tileset/Autotile Graphics identity
  Character Graphics identity
  struct.BattleEffect(effectIds[])
  BattleEffect Graphics identity
    ↓
等待首个非 null scope.viewport.current / viewport event
    ↓
calculateTileViewportLayout(width, height)
    ↓
subscribe viewport
    ↓
READY_FOR_INITIAL_PROJECTION
```

`initialize()` 可以异步，但 **MUST NOT 在缺少首次 RenderProjection 时创建半完整 RenderDomain**。这样不需要 placeholder tile/HP/direction data。

Runtime 启动顺序固定：

```text
await presentation.initialize(scene)
        ↓
presentation.render(initialProjection)
        ↓
first render 创建完整 stable RenderDomain
        ↓
start Battle clock / scheduler
```

如果 `scope.viewport.current === null`，initialize 等待第一个非 null viewport；close/frame abort 必须终止等待。

第一次 `render()` 创建一次完整 RenderDomain；之后 v0 正常路径只使用 `domain.update()`，MUST NOT 使用 `domain.replace()` 重建普通 gameplay 画面。新 Battle scene 必须创建新 Handler。

因此 SceneInit 不复制 initial tile/direction/HP；所有动态 visual facts 从第一次 RenderProjection 开始只有一个数据来源。

## 8. render(projection)

`render()` 是正常运行阶段唯一主要入口。

FROZEN cross-layer Projection：

```ts
type RenderProjection = {
  sceneEpoch: number
  tick: number

  actors: readonly ActorRenderProjection[]
  effectStarts: readonly SkillEffectProjection[]
}
```

Actor：

```ts
type ActorRenderProjection = {
  actorId: string

  tile: GridPosition
  direction: Direction

  hp: number
  maxHp: number
  life: "alive" | "dead"

  movement: MovementProjection | null
}
```

Movement：

```ts
type MovementProjection = {
  motionId: number

  from: GridPosition
  to: GridPosition

  startTick: number
  completeTick: number
}
```

Effect：

```ts
type SkillEffectProjection = {
  effectId: string
  effect: string

  result:
    | "hit"
    | "immune"
    | "miss"
    | "invalid"

  tile: GridPosition | null
  startTick: number
}
```

上述 cross-layer shape 已由 Contracts FROZEN；Presentation 不得添加 screen coordinate、camera 或 visualEpoch 回写字段。

### 8.1 Projection acceptance / fencing — FROZEN

Handler 绑定 initialize 时的单一 `sceneEpoch` 和 roster。

每次 render：

1. `sceneEpoch` 不等于当前 scene → throw `PRESENTATION_SCENE_MISMATCH`；
2. actors 的 actorId 集合必须与 SceneInit roster 完全一致，否则 throw `PRESENTATION_INVALID_DATA`；
3. effect 的 `effect` 必须存在于 SceneInit.effectIds，否则 throw `PRESENTATION_INVALID_DATA`；
4. `tick < lastAcceptedTick` → stale，直接 ignore，不推进 visualEpoch；
5. `tick === lastAcceptedTick`：
   - actors 等动态事实经 actorId 稳定排序后必须与上次一致；
   - 重复 effectId 且 payload 相同只做 idempotent no-op；
   - 同 tick 出现冲突 actor fact 或相同 effectId 不同 payload → throw `PRESENTATION_PROJECTION_CONFLICT`；
6. `tick > lastAcceptedTick` → 接受并进行新的 visual commit。

第一次 render 建立 `lastAcceptedTick`，不要求 hard-code tick 0。

`effectId` 一旦见过即写入 session-local seen set；hit/immune/miss/invalid 都算已消费，保证重复 render 不会重复产生 one-shot visual。

### 8.2 RenderDomain 转换

内部路径：

```text
Simulation
    ↓ RenderProjection
BattlePresentationHandler.render()
    ↓
Battle-specific projection/reconciliation
    ↓
RenderDomainState / RenderDomainUpdate
    ↓
RenderDomain
    ↓
Browser renderer / lr-battle-*
```

Simulation 不直接接触：

```text
RenderDomain
RenderNode
domain.update()
domain.replace()
DOM
custom elements
```

## 9. Simulation 操作如何映射 Presentation

原则：

> Simulation 先完成规则，再发布已经归约好的视觉事实。

| Simulation 已决定的事实 | Presentation 输入 | Presentation 行为 |
| --- | --- | --- |
| Battle 初始化 | `initialize(scene)` | 加载/解析静态资源并等待首次 viewport；不创建半完整 RenderDomain |
| 初始 Projection | first `render(projection)` | 创建唯一完整 RenderDomain 与稳定 view/actor/effects/HUD tree |
| Actor 原地 turn | 新 Projection 的 `direction` 改变 | 更新 Sprite 朝向 |
| `move_start` | committed `tile=origin` + `movement={from,to,...}` | 开始视觉插值 |
| movement 进行中 | 同一 `motionId` 仍存在 | 继续视觉插值 |
| `move_complete` | `tile=destination`，`movement` 消失 | 收敛到 destination |
| move 被规则中断 | Simulation 已保留 origin；新 Projection 中 `movement` 消失 | 终止旧 visual motion 并收敛到当前 Projection |
| HP 改变 | `hp` 改变 | 更新 HP 表现 |
| Actor 死亡 | `life="dead"` | 表现死亡状态 |
| skill resolve | 新的 `effectStarts[]` entry | 播放对应 transient effect |
| protection/recovery | 如果没有专门视觉，则无 Presentation 字段 | 不做任何额外推导 |
| Battle pause | `pause()` | 冻结插值/effect/camera 的视觉时间 |
| Battle resume | `resume()` | 恢复视觉时间 |
| Battle 正常 terminal | final `render(projection)` | 发布最终视觉状态；Simulation 停止规则推进，但 Presentation 保持画面直到上层离开 Battle scene |
| Battle cancel / Frame abort | `close()` | 立即清理本 session，不等待动画 |

关键禁止：

```ts
if (damage > 0 && actorIsMoving) {
  cancelMovement()
}
```

这种代码不得存在于 Presentation，因为它重新实现了 `MOVE-007 / HIT-003`。

正确模型是：

```text
Simulation:
  规则已经决定 movement 不再有效
        ↓
Projection:
  movement 不存在
        ↓
Presentation:
  reconcile 到新的视觉事实
```

Presentation 可以看到 HP 改变、movement 消失、hit effect 同时出现，但不得推断三者之间的 gameplay 因果。

## 10. visualEpoch / motionId

Battle Presentation 使用与 Map 一致的视觉 fencing 原则，但 actor motion identity 必须保持 actor-local，不能照搬 Map 的“单 player motion”假设。

Ownership 明确区分：

```text
Simulation → sceneEpoch + tick + gameplay facts
Presentation → visualEpoch
Actor movement → actor-local motionId
```

`visualEpoch` 不出现在 RenderProjection 中。Presentation 自己维护一个正 safe integer counter：

```text
first render / createRenderDomain → visualEpoch = 1
accepted newer-tick Projection   → visualEpoch++
accepted resize commit           → visualEpoch++
pause READY→PAUSED               → visualEpoch++
resume PAUSED→READY              → visualEpoch++
same-tick idempotent replay      → no commit / no increment
stale older tick                 → no commit / no increment
close                            → no commit
```

每个 visual commit MUST 在 view / all actors / effects / HUD 使用同一个 visualEpoch。counter 若无法安全递增属于 `PRESENTATION_COMMIT_FAILED`.

Actor movement identity 则属于各 Actor 自己：

```text
actor A → motionId=17
actor B → motionId=9
```

v0 camera 没有 animation，因此不存在 camera motion identity。

Battle 允许双方同时行动；同一个 visualEpoch 可以同时存在多个不同 actor-local motionId 和多个 effectId。

这些 identity 的目的不是创建 gameplay generation，而是防止旧视觉工作污染新画面。

例如：

```text
Actor A motionId=17 正在 Browser 插值
        ↓
Simulation 中该 move 已经失效
        ↓
收到更新的 Simulation Projection；Actor A 不再含 motionId=17，Presentation 随本次 visual commit 推进 visualEpoch
        ↓
Presentation/Browser 旧 motion completion 变成 stale visual fact
        ↓
不得反向提交 Battle 状态
```

因此 Battle 不应设计一个 scene-global `motionId` 来代表整场画面的唯一运动。即使没有 Browser completion callback，scene/visual epoch 与 actor-local motion identity 仍有利于幂等 reconciliation 和测试。

## 11. pause / resume

`TIME-004` 已冻结 Battle clock 在 pause/background 时停止。

Presentation 的 `pause()/resume()` 只负责同步视觉时间：

```text
movement interpolation
BattleEffect animation
Autotile animation
Presentation-local animation clock
```

v0 camera 没有动画。

`pause()` / `resume()` MUST 通过新的 Presentation visual commit 把 `paused` 写入 view/actor/effects data；Browser 在 pause 期间冻结已经开始的 motion/effect/autotile elapsed time，resume 后从冻结点继续，不允许按现实经过时间跳帧。

viewport resize settlement 属于 Host layout control，不属于 Battle animation time：即使 PAUSED，viewport 仍可在 100 ms settlement 后提交新 layout，但 commit 中 `paused` 继续保持 true。

这些操作不修改 Simulation。

Runtime lifecycle mapping MUST 保持：

```text
battle.pause()
  ├─ freeze Simulation Battle clock
  └─ presentation.pause()

battle.resume()
  ├─ resume Simulation Battle clock
  └─ presentation.resume()
```

当前公开 `@loomrealm/subsystem` 的 Frame API 尚没有业务层的 suspend/resume callback；Host/Runtime Control 到 Battle `pause()/resume()` 的 exact wiring 仍属于 Integration OPEN。

## 12. close()

`close()` 是 terminal 生命周期操作，并且 MUST idempotent。

内部至少清理：

```text
viewport subscription
visual timers / RAF
active/transient effects
pending Presentation resource work
RenderDomain.close()
session-local visual state
```

`close()` 后实例不可重新 initialize。

Presentation 被注入 `BattleRuntime` 后，生命周期 ownership 归 Runtime；Application 不再直接驱动 `presentation.pause/resume/close`。

Frame abort / Battle cancel / fatal Presentation failure 由 Runtime 进入即时 cleanup。

正常 BattleResult 不等于立即关闭 Presentation：Simulation 先发布 final Projection 并停止规则推进；Runtime 进入 settled 状态并保持 final visual。真正离开 Battle scene 时，Application 调用 `battle.close()`，再由 Runtime 调用 `presentation.close()`。这样最后一击、死亡状态和 HUD 最终 HP 不会因 Result 产生的同一时刻 cleanup 被直接抹掉。

`presentation.close()` 自身保持幂等，以便 Runtime 的 cancel/failure/close 路径安全收敛。BattleResult 与失败语义仍由 Simulation/业务 composition 决定，不由 Presentation 决定。

## 13. 与 Subsystem 的实际联动

v0 调用方式固定为：

```ts
const presentation =
  new BattlePresentationBuilder(
    scope,
    frame,
  ).build()
```

Handler 内部直接使用：

| Subsystem surface | Presentation 用途 |
| --- | --- |
| `scope.content` | BattleArena/Tileset/Autotile/Character/BattleEffect 资源 |
| `scope.viewport` | layout / camera / resize |
| `scope.createRenderDomain()` | 创建本场 RenderDomain |
| `frame.signal` | 本场外部取消/资源读取取消 |
| `scope.createInputListener()` | 默认不属于纯 Presentation；Guidance/ManualDecision 另行接入 |
| `frame.call()` | 默认不属于 Presentation |

Presentation 不需要持有 Simulation 或 Decision concrete instance。

## 14. Render Tree — FROZEN

Battle v0 MUST 使用以下唯一 Render Tree：

```text
RenderDomain (zIndex = 0)
└── key = battle:view
    tag = lr-battle-view
    attrs = {}
    │
    ├── key = battle:actor:<actorId>
    │   tag = lr-battle-actor
    │   attrs = { slot: "world" }
    │   ... one node per scene actor, ActorId ordinal string order
    │
    ├── key = battle:effects
    │   tag = lr-battle-effects
    │   attrs = { slot: "world" }
    │
    └── key = battle:hud
        tag = lr-battle-hud
        attrs = { slot: "hud" }
```

规则：

- root 永远只有 `battle:view`；
- actor key 只由 `actorId` 构造，不含 ally/enemy slot；`ActorId` 的 1..115 UTF-8 byte Contract 保证 `battle:actor:<actorId>` 不超过 Renderer 128-byte node-key 上限；
- actor children 按 Contracts 定义的 ActorId ordinal string order 稳定排列；
- `battle:effects` 位于所有 actor node 之后；
- `battle:hud` 最后；
- roster 在 session 中不变，所以 tree structure 在 first render 后不变；
- v0 ordinary render/pause/resume/resize MUST 只用 `domain.update()`；
- `domain.replace()` 不属于 v0 normal path；
- custom-element tag/key 不再是示例，以上名称就是 v0 ABI。

`lr-battle-view` 的 Shadow DOM MUST 提供：
- `slot="world"`：位于 battlefield logical world transform 内；
- `slot="hud"`：位于 footer，不接受 camera/world transform。

### 14.1 为什么树必须稳定

当前 `@loomrealm/subsystem` 的 `RenderDomain.update()` surface 只支持更新**已有节点**的 attrs/data：

```ts
interface RenderDomainUpdate {
  zIndex?: number
  nodes?: readonly {
    key: string
    attrs?: RenderStringDelta
    data?: RenderDataDelta
  }[]
}
```

结构变化不通过该 `update()` surface 完成；当前 Map 在需要重建结构时使用 `domain.replace(state)`。

因此 Battle MUST NOT 把高频 gameplay/visual 变化建模成 Render Tree structural change：

```text
一个 Tile 一个动态 RenderNode
一个 HP bar 一个动态 RenderNode
一个 SkillEffect 一个 RenderNode
一帧动画一个 RenderNode
```

Battle v0 gameplay 固定两个 Actor，但 Presentation tree 的 actor child 是按初始化 roster collection 创建的；tree shape 不使用固定 ally/enemy slot。v0 roster 在 session 内稳定，因此整场 Battle 的正常路径 MUST 是：

```text
createRenderDomain(initial stable tree)
        ↓
大量 domain.update(...)
        ↓
domain.close()
```

`domain.replace()` 应保留给真正的 Scene/结构重建，而不是 move、damage、turn、skill effect 等普通运行操作。

### 14.2 屏幕适配与 Footer：复用 Map 已实现的几何规则

Battle v0 不再单独发明一套 viewport layout 算法。目标是让 Map → Battle 切换时 tile 尺度、逻辑可视区域、缩放方式和 footer 高度保持一致。

当前 Map Runtime 实际用于 Presentation layout 的核心是 `calculateLayout(width, height)`：

```text
tileSize = 32

barHeight:
  height < 480  → 24
  height < 720  → 32
  otherwise     → 48

contentWidth  = windowWidth
contentHeight = windowHeight - barHeight

rawColumns = ceil(contentWidth / 32)
rawRows    = ceil(contentHeight / 32)

rows = clamp(rawRows, 14, 33)

columns =
  rawRows < 14 || rawRows > 33
    ? max(1, round(rows * contentWidth / contentHeight))
    : rawColumns

logicalWidth  = columns * 32
logicalHeight = rows * 32

scaleX = contentWidth / logicalWidth
scaleY = contentHeight / logicalHeight
```

Map 的 `semantics.ts` 另外定义并测试了：

```text
DEFAULT_VIEWPORT = 640 × 480
MIN_VIEWPORT     = 320 × 240
MAX_VIEWPORT     = 1920 × 1080
clampViewport(...)
```

但**当前 Map Runtime 的 `layoutFromViewport()` 并不会先调用 `clampViewport()`**；它把 `SubsystemScope.viewport` 提供的正整数宽高直接传给 `calculateLayout()`。因此 Battle 文档不能把上述 clamp/default/min/max 描述成当前 Map Presentation Runtime 已经统一执行的入口规则。

Battle v0 当前冻结的是：

- 复用 Map 的 32×32 tile；
- 复用 `calculateLayout` 的 `barHeight` breakpoint；
- 复用 `contentWidth / contentHeight`；
- 复用 `minRows=14 / maxRows=33`；
- 复用 columns/rows 计算；
- 复用 `logicalWidth / logicalHeight`；
- 复用 `scaleX / scaleY`；
- Browser logical world 到实际 viewport 的缩放语义。

**Battle v0 明确不启用 viewport clamp/default/min/max normalization。**

输入 policy FROZEN：

```text
non-null SubsystemScope.viewport
→ width/height 原值
→ calculateTileViewportLayout(width, height)
```

只接受 shared layout helper 已要求的正 safe integer；非法 viewport 是 Presentation fatal。Battle 不得单方面调用 Map 的 `clampViewport()`，也不得另行发明 responsive breakpoint/logical grid。未来若 Map/Battle 一起引入 normalization，必须作为新规范变更。

#### Resize settlement — FROZEN

Battle v0 不复制 Map 的 operation-busy resize state machine。固定算法：

```text
initialize:
  first non-null viewport
  → immediate layout calculation

later viewport event:
  → overwrite pending viewport with latest value
  → reset one trailing-edge RESIZE_SETTLE_MS = 100 ms timer

timer fires:
  → calculateTileViewportLayout(latest width, height)
  → if resulting layout equals committed layout: no-op
  → else recompute camera + visible tile window
  → visualEpoch++
  → one atomic domain.update across view / actors / effects / HUD
```

规则：

- active movement/effect MUST NOT block resize；
- resize MUST preserve every actor-local motionId/fingerprint；Browser motion不得重新计时；
- PAUSED 时 resize timer仍运行，但新 data 继续携带 `paused=true`；
- close 必须取消 pending resize timer/subscription；
- resize 不产生 Simulation input，不改变 tick/gameplay state；
- 首次 viewport 不走 100 ms debounce。

### 14.2.1 Footer 的 Battle 内容

Map 的 footer 目前由 `lr-map-view` 自己在 Shadow DOM 中实现，并不是独立 RenderDomain node。Battle **只复用相同的 footer 几何/layout policy**，而采用自己的稳定逻辑 HUD node/slot 来承载 Battle HUD 内容：

```text
┌────────────────────────────────────┐
│                                    │
│          Battle battlefield        │
│                                    │
├────────────────────────────────────┤
│ Ally  87 / 100       Enemy 42 / 80 │
└────────────────────────────────────┘
                ↑
          same barHeight
```

因此 Battle battlefield 的可绘制 content 区域与 Map 一样：

```text
contentHeight = viewportHeight - barHeight
```

`lr-battle-hud` 只负责显示双方：

```text
current HP / max HP
```

FROZEN data：

```ts
type BattleHudRenderData = {
  sceneEpoch: number
  visualEpoch: number

  actors: readonly Array<{
    actorId: string
    team: Team
    hp: number
    maxHp: number
  }>
}
```

字段名与结构如上即为 v0 ABI。固定语义：

- 存在一个稳定的 Battle HUD visual slot/node；
- 它占用与 Map 相同的 footer 几何区域；
- HUD data 是 actorId-addressed collection，不是固定二元素 tuple；
- v0 因 `BATTLE-001` 实际显示两个 Actor 的 current/max HP；
- 它不复用 Map footer 的 RPGMap-specific data contract。

未来 N Actor 版本可以改变 HUD 的排版/滚动/分组策略，但不需要把 HUD Contract 从“两个固定 slot”迁移为 collection。

HUD key/tag/data 已冻结为 `battle:hud / lr-battle-hud / BattleHudRenderData`。Browser v0 按 `team` 排序：ally 在左、enemy 在右；单方内部未来若出现多个 Actor，再按 Contracts 定义的 ActorId ordinal string order 排序。v0 显示文本固定为 `Ally <hp> / <maxHp>` 与 `Enemy <hp> / <maxHp>`。

HP 更新应与本次 visual commit 的其他节点使用同一个 `visualEpoch`。Browser HUD 不根据 HP 数值推导 damage、death、protection 或 interruption。

### 14.2.2 Shared Tile Presentation 边界 — FROZEN

当前仓库实际已共享：

```text
@loomrealm-game/tile-presentation
├─ TILE_SIZE_PX = 32
├─ RESIZE_SETTLE_MS = 100
├─ TileViewportLayout
└─ calculateTileViewportLayout(width, height)
```

Battle v0 MUST 直接使用这些 exports，不复制 layout 算法，也 MUST NOT 依赖 `@loomrealm-game/map`。

为避免把 Presentation v0 扩大成 Map 基础设施重构，本次 freeze **不要求**再抽取新的 shared browser painter。Battle 的 `battle.browser.js` 自己实现与现有 Map 资源格式兼容的纯视觉：

```text
Tileset 32×32 blit
Autotile block/cell projection
4×4 Character atlas crop
pixelated rendering
tile visual depth
```

这些实现只能复制/复现纯视觉数学与资源格式，MUST NOT import 或复用 RPGMap movement、Transfer、Bridge、NPC、input、camera authority。

后续若要继续抽 shared tile/character painter，属于独立 refactor，不是 Battle v0 实现 gate。

### 14.2.3 Camera — FROZEN

v0 camera 没有 zoom、focusHint、camera animation 或 cinematic policy。

每次接受新的 RenderProjection，以及每次 resize commit，Presentation MUST 重新计算 camera：

```text
targets =
  actors where life == "alive"
  if empty: all actors

target tile =
  actor.movement != null ? actor.movement.to : actor.tile

target center px =
  (tile.x * 32 + 16, tile.y * 32 + 16)

focus center =
  midpoint(
    min/max target center X,
    min/max target center Y
  )

cameraX =
  clamp(
    round(focusCenterX - logicalWidth / 2),
    0,
    max(mapWidth * 32 - logicalWidth, 0)
  )

cameraY =
  clamp(
    round(focusCenterY - logicalHeight / 2),
    0,
    max(mapHeight * 32 - logicalHeight, 0)
  )
```

Map 小于 logical viewport 时 camera 对应轴固定为 0；Browser 使用 Map-compatible `originX/originY` 将小 Map 居中。

Camera 只消费 Projection/Map/viewport 视觉事实，不反向产生 gameplay fact。

### 14.2.4 Renderer protocol capacity — FROZEN

Battle Presentation 必须在调用 RenderDomain 前做容量 preflight，不把 Renderer hard limit 留给偶发运行时错误。当前 Render protocol 的关键上限为：

```text
RenderNode key UTF-8 bytes <= 128
single node RenderData JSON <= 262144 bytes
whole render message <= 1048576 bytes
RenderNode count <= 16384
RenderDomainUpdate node operations <= 4096
```

v0 使用与现有 Map 相同方向的保守 guard；这里的 serialized byte length 固定按 `new TextEncoder().encode(JSON.stringify(value)).byteLength` 计算：

```text
serialized BattleViewRenderData < 196608 bytes
serialized initial RenderDomain state / one update candidate < 1000000 bytes
```

规则：

- `ActorId` Contract 已保证 actor RenderNode key 不超 128 bytes；
- initial full `RenderDomainState` 对 node count 使用 16384 hard limit；不得用 update operation limit 4096 代替；
- `RenderDomainUpdate` 对 node operations 使用 4096 hard limit，并同时预检更新后 prospective state；
- view 的 tile projection 仍使用 §14.3 冻结的“可视范围四周扩 1 tile”窗口，不允许为了塞进 payload 而静默缩成 0 margin；
- v0 不引入 tile chunking、多 RenderNode 分片、streaming 或 silent truncation；
- first render 若 required view/state 无法通过容量 guard，必须在创建 RenderDomain 前以 `PRESENTATION_COMMIT_FAILED` 失败；
- subsequent Projection/resize 若 candidate update 无法通过容量 guard，必须整次 commit 失败并由 Runtime 走已冻结的 Presentation fatal → Battle `failure` 路径；不得提交半个 visual epoch；
- 实现可以使用更严格但不得更宽松的内部预检，只要不改变上述 observable failure semantics。

这样“不启用 viewport clamp”与底层 Renderer capacity 可以同时成立：正常尺寸直接渲染，超出协议承载能力则明确失败，而不是由 agent 自行发明新的分页/分块架构。

### 14.3 lr-battle-view — FROZEN

`lr-battle-view` 负责 BattleArena/Tileset/Autotile、logical viewport、camera/world transform、tile depth 与 named slots。

Browser-facing refs MUST 已由 subsystem Presentation resolve 出 `contentVersion`：

```ts
type ResolvedResourceRef = {
  namespace: string
  key: string
  contentVersion: string
}

type TileTuple =
  readonly [
    x: number,
    y: number,
    z: 0 | 1 | 2,
    tileId: number,
    depth: number,
  ]

type BattleViewRenderData = {
  sceneEpoch: number
  visualEpoch: number
  paused: boolean

  viewportWidth: number
  viewportHeight: number

  barHeight: number
  contentWidth: number
  contentHeight: number

  columns: number
  rows: number
  logicalWidth: number
  logicalHeight: number
  scaleX: number
  scaleY: number

  mapWidth: number
  mapHeight: number

  cameraX: number
  cameraY: number

  tileset: ResolvedResourceRef
  autotiles: readonly (ResolvedResourceRef | null)[]
  tiles: readonly TileTuple[]
}
```

字段均 required。Browser element MUST reject missing/extra/invalid members。

Tile projection policy：

- visible tile bounds 按 camera + logicalWidth/logicalHeight 计算，并向四周扩 1 tile 后 clamp 到 Map；
- tuple 按 `z → y → x` 严格升序；
- priority 0 tile depth = 0；
- priority > 0 tile depth = `(y + priority + 1) * 32`；
- Browser tile layer CSS z-index = `tileDepth * 2`；
- Battle v0 不应用 RPGMap bridgeLevel 特例；
- regular/autotile blit 与 Integration 中现有 Map resource format 一致；
- Autotile animation cadence 与当前 Map Browser 保持一致：base animation quantum = **50 ms**；资源 key 文件名末尾存在 `[N]`（允许括号内空白）时，每帧时长 = `N * 50 ms`，其中 N 必须是正 safe integer；没有该 suffix 时默认 `5 * 50 = 250 ms`；匹配到但 N=0/非 safe integer 属于该 Autotile visual preparation failure，该 slot 使用可见 placeholder并可发 diagnostic，不终止/修改 gameplay；
- Autotile frame progress 使用 Presentation-local visual time；pause 冻结、resume 续播，不用 Battle Tick 反向驱动画面；
- world layer logical transform 为 `origin - camera`；外层再按 `scaleX/scaleY` 映射到 physical content；
- `originX = max(0, (logicalWidth - mapWidth*32)/2)`，Y 同理；
- `slot="world"` 位于该 world transform 内；
- `slot="hud"` 位于 footer，不受 camera/scale world transform 影响。

### 14.4 lr-battle-actor — FROZEN

初始化时对每个 scene actor 建立一个稳定 actor node。

```ts
type BattleActorRenderData = {
  sceneEpoch: number
  visualEpoch: number
  paused: boolean

  actorId: string
  tileX: number
  tileY: number

  direction: Direction
  sprite: ResolvedResourceRef
  life: "alive" | "dead"

  motion: BattleActorMotion | null
}

type BattleActorMotion = {
  id: number
  fromWorldX: number
  fromWorldY: number
  toWorldX: number
  toWorldY: number
  durationMs: number
}
```

坐标模型唯一化：

```text
committed tile
→ tileX/tileY

world tile top-left
→ tileX * 32 / tileY * 32

active movement
→ motion.fromWorld* → motion.toWorld*

parent lr-battle-view
→ origin - camera transform
→ scale
→ screen
```

Actor data **MUST NOT**再携带 `screenX/screenY/fromScreenX/fromScreenY`。resize/camera 只改变 parent transform，因此同一 motion 在 resize 时不重启。

Projection → RenderData：

- no movement：`motion=null`；
- active movement：
  - fromWorld = `movement.from * 32`；
  - toWorld = `movement.to * 32`；
  - durationMs = `(completeTick - startTick) * tickDurationMs`；
- same motionId 的 motion payload MUST 完全一致；相同 id 不同 payload → `PRESENTATION_PROJECTION_CONFLICT`。

Browser v0 Character policy：

- 4×4 atlas；
- idle pattern 固定 0；
- active motion 前半段 pattern 1，后半段 pattern 2；
- frame row = `(direction - 2) / 2`；
- Character frame 可以大于 32×32，底部居中于 Actor tile；
- actor logical depth 每帧按 Map-compatible 规则计算：`round(worldY) + 32 + (frameHeight > 32 ? 31 : 0)`；
- actor CSS stack value = `logicalDepth * 2 + 1`；
- tile layer CSS stack value = `tileDepth * 2`，因此同 depth 的 Character 稳定压在 Tile layer 上方；
- dead actor 保留在 committed tile、停止 walking pattern，并使用 opacity `0.5`；
- Presentation/Browser 不根据 HP/effect 推断 movement interruption。

### 14.5 lr-battle-effects — FROZEN

整场 Battle 固定一个 `battle:effects / lr-battle-effects` node；不得“一次 effect 一个 RenderNode”。

```ts
type BattleEffectRenderStart = {
  effectId: string
  result: "hit" | "immune"
  image: ResolvedResourceRef
  worldX: number
  worldY: number
  fadeInMs: number
  holdMs: number
  fadeOutMs: number
}

type BattleEffectsRenderData = {
  sceneEpoch: number
  visualEpoch: number
  paused: boolean
  effectStarts: readonly BattleEffectRenderStart[]
}
```

Projection policy：

```text
hit
→ tile MUST 非 null
→ 创建 visual start，maxOpacity = 1.0

immune
→ tile MUST 非 null
→ 创建同一 BattleEffect image 的 visual start，maxOpacity = 0.6

miss
→ consume effectId
→ 不创建 visual

invalid
→ consume effectId
→ 不创建 visual
```

visual anchor：

```text
worldX = tile.x * 32 + 16
worldY = tile.y * 32 + 16
anchor = image center
```

v0 effect stacking 也固定：

- `lr-battle-effects` 是 **world-space overlay plane**，跟随与 Actor 相同的 `origin - camera` transform 和外层 scale；
- transient BattleEffect **永远绘制在所有 battlefield tile 与 actor visual 之上**；
- effect 不参与 tile priority / actor logical-depth 排序，也不会被高 priority tile 遮挡；
- HUD 仍在独立 `slot="hud"` 中，不属于该 world overlay；
- 具体 CSS z-index 数字是 Browser implementation detail，但必须满足上述稳定 ordering，不得根据 effect/actor 输入顺序改变。

timing 来自 initialize 已解析的 `struct.BattleEffect`：

```text
fadeInMs  = fade_in_ticks  * tickDurationMs
holdMs    = hold_ticks     * tickDurationMs
fadeOutMs = fade_out_ticks * tickDurationMs
```

Browser 内部维护 `Map<effectId, ActiveVisualEffect>`：

- new id → start；
- same id + same payload → no-op；
- same id + conflicting payload → reject/fail fast；
- later RenderData 的 `effectStarts=[]` MUST NOT 清除 active effect；
- pause 冻结 elapsed visual time；
- natural completion 只删除 Browser-local active effect；
- close 删除全部 active effects；
- 不产生 Battle ACK。

opacity 使用 linear fade：0 → maxOpacity → hold → 0。

### 14.6 普通 Battle 操作只更新 data

例如双方同时开始移动，Tree 不变，只更新同一 visual epoch 下的节点 data：

```ts
domain.update({
  nodes: [
    {
      key: "battle:view",
      data: {
        set: {
          visualEpoch: 12,
        },
      },
    },
    {
      key: `battle:actor:${actorAId}`,
      data: {
        set: {
          visualEpoch: 12,
          direction: 6,
          motion: allyMotion,
        },
      },
    },
    {
      key: `battle:actor:${actorBId}`,
      data: {
        set: {
          visualEpoch: 12,
          direction: 4,
          motion: enemyMotion,
        },
      },
    },
    {
      key: "battle:effects",
      data: {
        set: {
          visualEpoch: 12,
        },
      },
    },
    {
      key: "battle:hud",
      data: {
        set: {
          visualEpoch: 12,
        },
      },
    },
  ],
})
```

这里每个 Actor 都拥有自己的 actor-local `motion.id`；v0 恰好有两个 Actor，因此可以同时存在两个不同 motion identity。

`move_complete`、turn、HP change、death、move interruption 同样都应该优先表现为 node.data transition，而不是 remove/insert Actor node。

### 14.7 move interruption 的 Tree 行为

当 Simulation 已经根据 Core Rule 决定 move 失效时，Render Tree 不发生结构变化：

```text
before:
  actor node
    tile = origin
    motion = motionId 17

after:
  same actor node
    tile = origin
    motion = null

  same hud node
    actor hp = newHp
```

如果同 Tick 还有受击特效，则同一 visual commit 同时更新固定 `battle:effects` 与 `battle:hud` 节点。

Presentation 只执行 visual reconciliation；不得从“damage > 0”推导“所以 motion 应取消”。

### 14.8 sceneEpoch / visualEpoch 一致性

`sceneEpoch` 来自 Battle session；`visualEpoch` 由 Presentation 自己生成。参考 Map 的 Browser fencing，一次 Presentation visual commit 涉及的固定节点使用一致的：

```text
sceneEpoch
visualEpoch
```

例如：

```text
battle:view                visualEpoch=57
battle:actor:<actorId> *    visualEpoch=57
battle:effects             visualEpoch=57
battle:hud                 visualEpoch=57
```

Browser implementation 可以拒绝/延后组合不一致的候选数据，从而避免同一画面混用不同 visual epoch。

这仍然只是 Presentation consistency，不具有 gameplay commit authority。

### 14.9 Map 复用边界 — FROZEN

Battle v0 的复用边界已经确定：

```text
MUST 直接复用
- @loomrealm-game/tile-presentation:
  TILE_SIZE_PX
  RESIZE_SETTLE_MS
  TileViewportLayout
  calculateTileViewportLayout

Battle Browser 自己实现纯视觉
- 32×32 Tileset blit
- Autotile block/cell projection
- tile depth
- 4×4 Character atlas crop
- pixelated rendering

MUST NOT 依赖
- @loomrealm-game/map Runtime
- lr-map-view / lr-map-sprite data contract
- RPGMap movement / Bridge / Transfer / NPC / MapAction / player input
```

进一步共享 tile/character browser painter 属于 future refactor，agent 在本 v0 实现中不得把它变成前置重构。

## 15. Browser 实现 — FROZEN

Package browser assets 固定为：

```text
browser/battle.browser.js
browser/battle.css
```

必须注册：

```text
lr-battle-view
lr-battle-actor
lr-battle-effects
lr-battle-hud
```

以上 tag 与 §14 key/data 是 v0 ABI，不得自行改名。

Browser elements MUST 使用现有 renderer 的 `receiveRenderContext(context)` / `receiveRenderData(data)` seam；data 是 plain JSON object。每个 element 必须对 required/extra member 做 exact validation，模式参考现有 Map Browser guards。

Browser resource decode/load failure不反向修改 Simulation：

- Character image failure → actor 使用 32×32 placeholder；
- BattleEffect image failure → 该 transient visual 跳过；
- Tileset/Autotile image failure →对应 tile 使用可见 placeholder；
- 均可产生 diagnostics，但不产生 Battle ACK。

同一 Browser session 内，Character/Tileset/Autotile/BattleEffect 必须共用按 `namespace + key + contentVersion` 标识的 image cache。cache 同时保存 in-flight Promise 与 resolved decoded Image：并发请求共享同一个 Promise，完成后复用 decoded Image；失败 entry 必须移除以允许 retry。Blob URL 在单次 decode 完成后必须 revoke；close/disconnect 的迟到结果可进入 session cache，但不得提交到已经失效的 element/session。该 cache 不替代 RendererResourceClient 自己的 bytes cache。

Content record/resource identity 在 subsystem Presentation initialize 阶段无法解析时属于 `PRESENTATION_CONTENT_FAILED`，Battle 不启动。

Battle MUST NOT import/bind `lr-map-view / lr-map-sprite` 或 RPGMap Runtime contract。

## 16. FROZEN 业务组装

业务 Subsystem MUST 只做 composition：

```ts
defineSubsystem((scope) => ({
  async frame(frame) {
    const presentation =
      new BattlePresentationBuilder(
        scope,
        frame,
      ).build()

    const decision =
      new BattleDecisionBuilder(
        scope,
        frame,
      ).build(/* ... */)

    const battle =
      new BattleSimulationBuilder({
        clock,
        signal: frame.signal,
        decision,
        presentation,
      }).build(config)

    try {
      return await battle.run()
    } finally {
      // frame 离开即结束本 Battle session；
      // Runtime 统一释放 Presentation / Decision / scheduler resources。
      battle.close()
    }
  },
}))
```

这里不应该出现：

```text
setInterval(...)
tick()
moveActor()
damageActor()
interruptMovement()
playEffect()
RenderProjection forwarding loop
```

这里的 `clock` 是业务提供给 Core 的窄 BattleClock capability（生产环境可包装 Host monotonic clock，测试使用 FakeClock），不是整个 SubsystemScope。

Battle clock/tick 属于 Simulation；Projection 到 RenderDomain 的翻译属于 Presentation。业务在注入后只操作 `BattleRuntime`，不再直接操作 Presentation lifecycle。

## 17. Presentation 实现 Gate

Battle Browser Presentation / RenderDomain implementation 的 shared primitive Gate 已完成：

1. 已创建 `game-libs/tile-presentation` / `@loomrealm-game/tile-presentation`；
2. 已将 Map 验证过的通用 tile viewport layout primitive 迁入该 package；
3. `@loomrealm-game/map` 已改为依赖并使用 shared implementation；
4. Map layout/runtime regression tests 继续作为集成保障；
5. `@loomrealm-game/battle` Presentation 实现时再依赖同一 package。

这是一项**渲染层实现前置任务**，不是 Battle Core gameplay 的前置任务。headless Simulation、DecisionPort 和 frozen-rule deterministic tests 不需要等待它。

该 Gate 已完成；Battle package 直接消费 shared layout implementation，不复制 `calculateLayout`。Presentation specification、实现、unit/Browser/transport qualification 均已完成。

## 18. 最低测试要求

Presentation 可以完全脱离真实 Simulation/Decision 测试。

至少覆盖：

1. synthetic `BattleSceneInit` initialize 只准备资源；随后 first RenderProjection 创建一次完整 Map/Actor/HUD/Effects RenderDomain；
2. direction 改变只改变 visual direction；
3. movement Projection 创建对应 motion；
4. motion 正常结束后收敛 destination；
5. 新 Projection 取消旧 motion 时只做 visual reconciliation，不执行 gameplay rule；
6. `effectStarts` 只携带新 effect；相同 Projection/effectId 重复 render 不重复产生一次性 effect；
7. stale `sceneEpoch / Presentation-local visualEpoch / motionId` 不污染新状态；
8. 与 Map 对相同 viewport 输入产生相同 barHeight/content/rows/columns/logical size/scale；
9. viewport resize 使用 100 ms settle 合并；Actor 正在 movement/effect 时也可提交新 layout，并保持 motionId/progress，不等待全体静止；
10. footer 高度与 Map 一致，并持续显示 v0 两个 Actor 的 current/max HP；
11. HP Projection 到来后，Presentation 在同一个新 visualEpoch 中更新相关 Actor/HUD，不改变 Render Tree 结构；
12. pause/resume 冻结并恢复视觉时间；
13. close 幂等，关闭 RenderDomain 并阻止 stale async write；
14. 两个 PresentationHandler 同时存在时 visual/session state 不串场；
15. 正常 move/turn/damage/effect 更新不改变稳定 Render Tree 结构；
16. 任意 Actor 都有独立 actor-local motion identity；v0 两个 Actor 可在同一 Presentation-local visualEpoch 拥有不同 motionId 并同时插值；
17. Presentation projector/render-tree 的非 v0 结构性 fixture 使用 4 个唯一 actorId 时，可按 collection 生成 4 个 actor node/HUD entry，且不存在固定 ally/enemy slot；public v0 BattleConfig 仍由 BATTLE-001 限制为 2；
18. 重复提交相同 effectId 不重复创建 transient visual；
19. first render 后所有普通运行/resize/pause/resume 路径只使用 domain.update()，不调用 domain.replace()；
20. 正常 Battle terminal 发布 final Projection 后保持最终画面，直到 Application 调用 `battle.close()`、再由 Runtime 调用 Presentation close；cancel/abort 由 Runtime 立即 cleanup；
21. Null/Recording Presentation 可替换 Browser Presentation，而不改变 Simulation reducer；
22. Render Tree key/tag/attrs 与 §14 完全一致，actor children 按 actorId 稳定排序；
23. Actor Browser data 不出现 screenX/screenY/fromScreenX/fromScreenY；resize/camera 只改 parent transform；
24. camera 对 alive actor（无 alive 时全部 actor）使用 movement.to-or-tile midpoint 算法并 clamp map bounds；无 zoom/animation；
25. initial viewport 不 clamp；后续 resize 使用 trailing-edge 100 ms，paused/moving/effect 中均可 commit；
26. hit effect maxOpacity=1.0、immune=0.6、miss/invalid 不创建 visual；四种 outcome 都消费 effectId；
27. initialize twice / pre-init render 等非法状态按 §6.1 失败；CLOSED 后 close/render race-safe；
28. same tick conflicting Projection fail，older tick ignore，same tick equal replay no visualEpoch increment；
29. Character/Tileset/Autotile/BattleEffect Browser decode failure只走 placeholder/skip，不改变 gameplay；
30. 普通 32px 与高于 32px Character 都按 Map-compatible logical depth + odd character stack value 排序，priority tile 使用 even tile stack value，遮挡关系稳定；
31. ActorId 位于 115 UTF-8 bytes 上界时 `battle:actor:<actorId>` 仍可通过 Renderer key validation；超出上界在 Battle/Scene validator 阶段 reject，不进入 RenderDomain；
32. BattleEffect world overlay 在普通 tile、priority tile 与 actor visual 之上稳定绘制，camera/resize 后仍保持 world anchor；HUD 不受该 overlay 影响；
33. required visible tile window 导致 `BattleViewRenderData` 或完整 state/update 超出 §14.2.4 guard 时，整次 commit 以 `PRESENTATION_COMMIT_FAILED` 失败，不 clamp viewport、不截断 tiles、不做 partial visualEpoch；
34. Autotile 无 suffix 时每帧 250 ms，`[N]` suffix 使用 `N*50 ms`；pause/resume 冻结/恢复同一 visual timeline。
35. resize timer/callback 中的 terminal fatal 通过 one-shot `failure` 暴露、Handler 自行关闭且不产生 unhandled exception；Runtime 保留最终 Battle failure ownership；
36. resource/decode 延迟超过 200 ms 且连续收到多个 visual commit 时，同 identity 的 Character 与 Tileset/Autotile 最终仍显示、只共享一次 in-flight/decode，不因 seq fencing starvation；失败 identity 可在后续 commit retry；
37. frozen Handler 创建的 RenderDomain 数据完整穿过 RenderManager → renderer-data → RendererRenderStore → WebProjector 到 `lr-battle-*` DOM，并覆盖 movement/effect/resize/close；
38. `battle.css` 存在于 dist、由 package export 暴露且 Browser/HTTP qualification 可无 404 加载。

## 19. Freeze status / NON-GOALS

**Presentation v0 Blocking OPEN = 0。**

以下事项明确不阻塞本 Implementation Freeze，agent 不得顺手自行扩展：

- 多 Battle 同屏 / sub-viewport：NON-GOAL；
- dynamic roster spawn/despawn：NON-GOAL；
- dynamic zoom / camera animation / cinematic focus：NON-GOAL；
- outcome-specific BattleEffect image、projectile、particle、shader：NON-GOAL；
- viewport clamp/default/min/max normalization：v0 明确不启用；超出 Renderer capacity 时按 §14.2.4 明确失败，不以 clamp/chunking 兜底；
- 进一步抽取 shared tile/character browser painter：future refactor；
- Host/Runtime Control suspend/resume 如何接到 `battle.pause/resume`：Integration OPEN，但 Presentation 的 pause/resume 行为本身已冻结；
- Guidance / real LLM provider wiring：不属于 Presentation implementation。

### 19.1 Agent execution contract

Implementation agent MUST 按以下顺序推进，除非依赖关系要求在同一提交中合并：

```text
1. package src/build/test scaffolding
2. frozen contracts/types/validators
3. BattlePresentationBuilder + Handler state machine
4. initialize resource loader + viewport wait/subscription
5. first-render stable RenderDomain creation
6. lr-battle-view + Map-compatible tile/autotile painter
7. lr-battle-actor + actor-local motion
8. lr-battle-hud
9. lr-battle-effects + one-shot/seen-id lifecycle
10. resize + camera + visualEpoch commits
11. pause/resume visual-time freezing
12. close/failure/stale async fencing
13. synthetic Presentation unit/integration tests
14. Browser E2E / renderer qualification
```

Definition of Done：

- 所有 §17/§18 与 Test Matrix Presentation acceptance 通过；
- normal gameplay/resize/pause 路径无 `domain.replace()`；
- Browser animation timing 永不反馈 Simulation；
- two simultaneous actor motions 不互相覆盖；
- resize during motion 不重启 motion；
- repeated effectId 不重播；
- close 后 resource Promise/RAF/timer/viewport callback 不再提交；
- Null/Recording Presentation 替换 Browser implementation 时 Simulation reducer 无需修改；
- package build/test/browser assets 可被 workspace 正常消费。

若实现发现规范无法满足，必须先提交 spec amendment；不得在代码中引入未记录的替代 architecture。
