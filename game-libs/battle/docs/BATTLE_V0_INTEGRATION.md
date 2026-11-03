# Battle v0 集成说明

> 状态：**Simulation baseline（含 Decision availability circuit）、DeepSeek Decision implementation/replaceable DecisionWorkflow boundary、Presentation integration、BATTLE-003 `ResolvedBattleActor.initialHp` 与 BATTLE-004 独立 `BattleArena` amendments 均已完成 closed-loop qualification；PokeMan 已接入 configured DeepSeekTransport、Host lifecycle 与 Message manual recovery；PlayerGuidance concrete feature 明确延期；真实 provider smoke 仍为 credential-gated explicit opt-in**。本文只说明 Battle Core 如何与 LoomRealm Resource、Presentation、Decision Adapter、Host/Frame 生命周期及 workspace 工程集成；Simulation exact Runtime 行为以 BATTLE_V0_SIMULATION.md 为准。
>
> Gameplay 语义只以 [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md) 为准；数据结构以 [BATTLE_V0_CONTRACTS.md](./BATTLE_V0_CONTRACTS.md) 为准。

## 1. 集成职责边界

`game-libs/battle` 的目标是提供可复用 Battle 组件，而不是预先固定一个完整的业务 Subsystem。实现阶段应让三层可以独立导出和替换；exact package export path 属于工程细节，但概念上至少包含：

```text
@loomrealm-game/battle
  contracts
  decision
  simulation
  presentation
```

共享依赖方向：

```text
                    contracts / ports
                  /        |          \
                 /         |           \
          Decision     Simulation     Presentation
```

三层运行职责：

- **Decision / Plan**：v0 消费 Observation/Constraints 并产生 `PlanSubmission`；未来 PlayerGuidance 只能通过 DecisionWorkflow 的 request-scoped typed capability/data 扩展，不改变 Simulation-facing DecisionPort。Mock/Script/Manual/Random/LLM 可以替换。
- **Simulation / Execute**：完整 Battle Runtime。自己拥有 Battle clock、200 ms scheduler、event queue、Tick reducer、Decision lifecycle、accepted-plan execution、Battle State、Result 与 Replay。
- **Presentation / Present**：初始化 Map/Actor 视图并表现 Simulation 已决定的 movement/turn/effect/state；自己拥有插值、camera、viewport 和视觉资源生命周期。

Battle composition 分成两个不同职责：

```text
trusted product/platform composition
  └─ own credential + physical network realization
       ↓
     configured DeepSeekTransport capability

game/business composition / concrete Subsystem
  ├─ receive configured DeepSeekTransport
  ├─ choose/create DeepSeekDecision + Presentation
  ├─ create BattleRuntime and inject required Ports/capabilities
  └─ after injection, only control BattleRuntime lifecycle
```

generic platform app（例如 `apps/desktop`）不得因为提供 physical network/secret capability 而获得 Battle business semantics；game/business composition 也不读取 provider secret 或接管 network bootstrap。

业务 composition 不负责 Battle scheduler，不调用公开 `tick()` 来实施战斗，也不在每个 Decision/Projection 之间承担规则转发。Simulation 根据自己的 Runtime 状态请求 Decision，并把已决定的视觉事实交给 Presentation Port。

### 1.1 Port 的概念边界

PresentationPort / BattlePresentationHandler 的 lifecycle surface 已由 Contracts/Presentation 冻结；这里不再保留另一套 method naming。Decision provider/protocol/error/timeout/transport seam 已由 BATTLE_V0_DECISION.md 冻结；Integration 只保留 Host composition 与未来 PlayerGuidance 等明确外部 wiring：

```ts
DecisionPort
  decide(DecisionRequest, AbortSignal) -> Promise<DecisionCompletion>

PresentationPort
  readonly failure: Promise<PresentationFailure>
  initialize(BattleSceneInit)
  render(RenderProjection)
  pause()
  resume()
  close()

BattleRuntime
  run() -> Promise<BattleResult>
  pause()
  resume()
  cancel()
  close()
  getSnapshot()
  getReplay()
```

`run()` 是 one-shot session entry，命名与现有 Map Handler 的 `run()` 习惯对齐；同一 Runtime 实例不得第二次 run。它在 Presentation 初始化与 initial Projection 发布完成后才启动 Battle clock。

`BattleRuntime` 的 public surface 不暴露“由业务每 200 ms 调一次”的 `tick()`。实现内部可以有可测试的 `processTick(currentTick)`、FakeClock 或 scheduler seam，但 Tick ownership 仍属于 Simulation。

Runtime 对注入的 Decision/Presentation lifecycle 负责：业务注入完成后不直接调用 `presentation.pause/resume/close`。

Simulation 依赖 `DecisionPort / PresentationPort` 并不意味着依赖 concrete implementation：业务可以注入 ScriptDecision、DeepSeekDecision、BrowserPresentation、NullPresentation 或 RecordingPresentation，而 Simulation reducer 不随之改变。

`BattlePresentationHandler` 应直接实现 `PresentationPort`；不需要额外建立一个只做 method forwarding 的 adapter。

`failure` 是最小的 Presentation async fatal channel：Runtime 在 active session 中观察它，但 Presentation 只报告 failure fact，不创建或选择 `BattleResult`。channel one-shot；Presentation 在报告前先停止自己的 visual authority/cleanup；Runtime 才拥有停止 gameplay authority并把它归约为 `failure` 的职责。显式 close 后迟到 callback 不得完成该 channel。

Actor collection 同样遵循 `ARCH-006`：Runtime/Port 以唯一 `actorId` 寻址，不使用 `actorA/actorB` 或数组下标表达 identity。v0 Config validator 严格要求两个 combat Actor，并且恰好为 1 个 `ally` + 1 个 `enemy`；未来 N Actor 版本只扩展规则语义，不改变三层组合方式。

### 1.1.1 Simulation execution pipeline

Simulation exact implementation contract 见 [BATTLE_V0_SIMULATION.md](./BATTLE_V0_SIMULATION.md)。本节只保留集成层摘要；若与 Simulation implementation spec 存在解释空间，以后者为准。

Simulation implementation 应保持一条有界 pipeline，而不是通用 Task/Command framework：

```text
DecisionCompletion
      ↓
Decision Inbox
      ↓ Tick snapshot / validation
active or pending AcceptedPlan
      ↓ one intent at a time
ActionState
      ↓ dueTick
Scheduled Event Queue
      ↓
next Tick reducer
```

关键约束：

- path 不预展开成整串 scheduled tasks；只有当前 movement step 真正获得 reservation 后才 schedule 对应 `move_complete`；
- active plan 仍有 future intent 时不预取下一 Plan；
- active plan 的最后一个 intent 已 materialize 后，允许 Action execution 与 next Decision Thinking 重叠；
- next Plan 最多暂存一份 pending accepted plan；它不能绕过当前 action lock；
- Decision Inbox 与 Scheduled Event Queue 保持两套结构，不把 completion 转换成 `dueTick` event；
- Runtime shell 负责 async Ports / clock / lifecycle；Tick authoritative mutation 不等待 Decision、Browser 或其他外部 Promise。

`ready` Decision state、独立于 `ActionState.moving` 的第二份 `activeStep` authority、以及无界 accepted-plan FIFO 都不是 v0 implementation requirement。

### 1.2 Simulation 只依赖窄 capability

Presentation concrete implementation 可以依赖 `SubsystemScope / Frame`，因为它确实需要 Content、Viewport、RenderDomain；`DeepSeekDecision` 不直接依赖整个 Host/Platform/SubsystemScope，只依赖一个 externally configured `DeepSeekTransport` 窄 capability。

Simulation Core 不应直接接收整个 `SubsystemScope / Frame`。构造方式可按仓库惯例命名；Simulation-facing capability 与 resolved input 形状已由 BATTLE_V0_SIMULATION.md 冻结。概念：

```ts
const battle = new BattleSimulationBuilder({
  clock,
  signal,
  decision,
  presentation,
}).build(config)
```

其中 Simulation 只知道：

```text
BattleClock
AbortSignal
DecisionPort
PresentationPort
BattleConfig / resolved Battle content
```

它不知道 RenderDomain、Viewport、DOM、InputListener 或 `frame.call()`。测试环境可直接注入 FakeClock + ScriptDecision + RecordingPresentation，不需要模拟整个 LoomRealm Subsystem。

## 2. BattleArena 与 Map 视觉资源复用

Battle v0 的战斗网格是独立 BattleArena，不再读取探索 `struct.Map`。

### 2.1 Battle-owned Arena

BattleArena 提供：

```text
width / height
passable[y][x]          # Simulation navigation authority
tileset_id
3-layer tile data       # Presentation-only visual facts
```

BattleArena 不包含：

```text
Map behaviors
passages / terrain_tags gameplay derivation
bridge / ledge
MapTransfer
NPC collision
RPGMap Runtime state
```

因此无需 Map → Battle passability projection。探索 Map 当前 tile、NPC placement 或 movement rules 的变化，不得改变已经 author 的 BattleArena。

### 2.2 只复用视觉素材

Battle Presentation 可以继续读取：

```text
struct.Tileset
resource.Graphics/Tilesets/...
resource.Graphics/Autotiles/...
resource.Graphics/Characters/...
```

tile size 继续为 32×32；Character 继续使用现有 4×4 atlas；BattleArena.data 沿用 3-layer tile-id 编码。这里复用的是视觉资源与 tile 编码，不是 RPGMap navigation semantics。

### 2.3 明确不复用的 Runtime

Battle 不得把以下模块当作 Battle 权威：

- `struct.Map`；
- `RPGMapBuilder` / `RPGMapHandler`；
- RPGMap movement/timer；
- Map passage / terrain / bridge / transfer；
- RPGMap Browser movement completion。

`lr-map-view` / `lr-map-sprite` 仍属于 RPGMap Browser/Runtime 细节，不进入 Battle Core。Battle Presentation 继续使用自己的 `lr-battle-view`。

如果未来 Battle 需要复杂 terrain gameplay，应明确扩展 BattleArena / Simulation contract，而不是重新从 RPGMap 隐式继承。

## 3. Presentation 集成

Presentation 的规范性实现合同见 [BATTLE_V0_PRESENTATION.md](./BATTLE_V0_PRESENTATION.md)。该文档当前状态为 **FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED**，负责 Render Tree、Browser ABI、坐标/camera/viewport/effect/lifecycle 的 exact v0 行为；本 Integration 文档负责其外部 LoomRealm/Host 组合边界，不再把 Presentation exact ABI 留给实现自行决定。

Presentation 只负责显示，并且必须可以脱离 Decision/Simulation concrete implementation 独立初始化与测试。

业务在构造阶段选择 Presentation implementation；Simulation 通过共享 PresentationPort 提供 `BattleSceneInit` 与已经决定的 RenderProjection/表现命令。Presentation 不需要知道 Decision protocol 或 Simulation reducer 的内部实现。

职责包括：

- Map/Tileset/Autotile 绘制；
- Character Sprite；
- authoritative A→B step 的插值；
- BattleEffect；
- v0 fixed camera framing（无 zoom/focusHint/camera animation）；
- viewport/layout；
- resource load/dispose 生命周期。

### 3.1 Position Projection

active move step 期间：

```text
Simulation committed tile = origin
Presentation screen position = interpolated origin→destination
```

Presentation 不得把插值坐标 reverse-sync 回 Simulation。

### 3.2 Presentation diagnostics

Presentation 可以产生：

```text
animationFinished
assetFailed
viewportChanged
```

这些默认都不是 Battle Rule ACK。

Simulation 不得等待动画完成后才提交移动、扣血、死亡或 BattleResult。

Simulation 可以在权威状态已经由 reducer 决定后调用 `PresentationPort.render(RenderProjection)`。这只发布表现事实；Simulation 不得等待动画完成、Promise 顺序或 Browser ACK 后才推进 Battle Rule。

Simulation 不发布 `visualEpoch`。Presentation 将 RenderProjection 或本地 viewport/camera/layout 变化转换成 RenderDomain visual commit 时，自行维护 `visualEpoch`。

### 3.3 Camera

Camera 完全属于 Presentation。

Simulation 不拥有：

```text
cameraX
cameraY
zoom
focusHint
```

v0 RenderProjection 不携带 camera focus hint。Presentation 按 FROZEN spec 使用 alive actors（若无 alive 则全部 actors）的 movement.to-or-tile bounding midpoint 计算固定 camera，并 clamp 到 Map bounds；无 zoom、camera animation。collection 顺序不承载 camera priority。未来版本可以改变 framing 算法，但必须先修订 Presentation spec，不修改 Simulation authority。

## 4. BattleEffect 表现 — FROZEN

BattleEffect 是 Presentation-only Content。cross-layer 与 Browser 行为已经冻结，实施时不得重新选择另一套 effect model。

Content：

```text
subject = struct.BattleEffect
record key = effect id

image.namespace = resource.Graphics
image.key       = BattleEffects/<...>
anchor          = tile-center
timing          = fade_in_ticks / hold_ticks / fade_out_ticks
```

Simulation 只输出 one-shot `effectStarts[]`：

```ts
type SkillEffectProjection = {
  effectId: string
  result: "hit" | "immune" | "miss" | "invalid"
  effect: string
  tile: GridPosition | null
  startTick: number
}
```

Presentation v0 policy：

```text
hit
→ tile 必须非 null
→ 播放对应 BattleEffect
→ max opacity = 1.0

immune
→ tile 必须非 null
→ 播放同一 BattleEffect
→ max opacity = 0.6

miss / invalid
→ 消费 effectId
→ 不创建 visual
```

fade-in / hold / fade-out 使用 BattleEffect ticks × `tickDurationMs`；Browser 自己维护 ActiveVisualEffect、pause/resume elapsed time、natural cleanup。后续 Simulation Tick 不重复发送“仍在播放”的 effect，Browser 也不向 Simulation 回 ACK。

Browser effect image decode/load 失败只跳过该 transient visual并可发 diagnostic；`struct.BattleEffect` record/资源 identity 在 initialize 阶段无法解析则属于 Presentation fatal，Battle 不启动。

## 5. Decision implementation / composition

Decision 的 gameplay-facing Port 仍是共享的 `DecisionPort`。Simulation 必须在没有 Browser、没有真实网络 provider 时，也能由 Script/Deferred/Fake Decision 驱动完成 headless Battle。

Battle v0 的 concrete Decision 已单独冻结在：

- **[BATTLE_V0_DECISION.md](./BATTLE_V0_DECISION.md) — FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED**

v0 Decision product surface：

```text
DeepSeekDecision
  provider protocol = DeepSeek only
  external Decision capability = configured DeepSeekTransport only
  model = deepseek-flash
  logical provider API = Responses

  public Battle-facing call:
    decide(request, signal)

  internal v0 workflow:
    Call A + Call B
```

两次 provider call 属于当前 v0 `DecisionWorkflow` implementation，不属于 product/platform/Simulation public contract。外部 composition 不得调用或依赖 Analyze/Strategize/Materialize stage；未来 workflow 拆分、增加 Guidance、增加分支或改变 provider-call topology 时，外部仍通过同一个 `DecisionPort.decide()` 使用 Decision。

Decision module 只负责“一次 request 如何通过 configured transport 得到一次 Plan/failure completion”。`decisionGeneration`、何时创建 Decision Request、Decision Inbox、stale generation fencing、Plan validation、Simulation correction、bounded active/pending accepted-plan pipeline 与 Replay consume/accept Tick 都继续属于 Simulation Runtime lifecycle。

game/business composition 只负责：

```text
receive configured DeepSeekTransport
→ construct DeepSeekDecision({ transport })
→ inject as DecisionPort
```

它不得读取 provider credential，也不得接管 provider callback、Plan validation 或 Tick lifecycle。

## 6. DeepSeekTransport / credential / product integration

Concrete model/prompt/schema/parser/failure/timeout/retry/Abort semantics 与 `DeepSeekTransport` logical contract 已在 **BATTLE_V0_DECISION.md** 唯一化，本 Integration 文档不重复维护另一份 provider implementation spec。

职责拆分固定：

```text
trusted product/platform composition
  ├─ obtain/store credential
  ├─ choose physical realization
  │    direct trusted Node HTTPS
  │    or trusted backend/proxy
  └─ produce configured DeepSeekTransport
             ↓
game/business composition
  └─ new DeepSeekDecision({ transport })
             ↓
Simulation
  └─ only sees DecisionPort
```

credential boundary：

- provider credential 不进入 `DeepSeekDecision` options；
- provider credential 不进入 `DecisionRequest` / `BattleObservation`；
- provider credential 不进入 Simulation state / Replay；
- provider credential 不进入 Browser Presentation；
- game/business composition 只拿 configured `DeepSeekTransport` capability，不拿 secret；
- `DeepSeekDecision` 不读取 `process.env`、Browser storage 或 ambient credential；
- configured transport 自己私有持有 direct credential 或 backend/proxy authentication binding。

generic `apps/desktop` / platform role 不应直接拥有 Battle topology、Plan 或 DecisionWorkflow 语义。若产品需要把 configured `DeepSeekTransport` 交给某个 concrete game/business composition，exact capability handoff 属 product integration wiring，但不得把 Battle semantics下沉进 generic platform package。

固定 authority flow：

```text
Simulation
  → DecisionPort.decide(request, signal)
        ↓ async
DeepSeekDecision
  → DecisionWorkflow
  → configured DeepSeekTransport
  → DecisionCompletion
        ↓
Simulation-owned Decision Inbox
        ↓
next reducer snapshot that can see it
        ↓
generation / validation / correction
        ↓
bounded active/pending accepted-plan pipeline
```

Transport/Promise completion 不直接写 Battle State。DecisionCompletion 仍然没有 gameplay timestamp/dueTick；真实 provider wall-clock latency 不进入 Simulation authority。

### INTEGRATION-OPEN-003 — Configured DeepSeekTransport product wiring — OPEN

Decision implementation 本身已经没有 blocking provider-protocol OPEN。当前只剩 product/platform integration 需要决定：

- provider credential 的产品级 secret storage/source；
- direct trusted HTTPS vs trusted backend/proxy 的 physical realization；
- configured `DeepSeekTransport` 如何交给具体 game/business composition，而不让 generic platform app 拥有 Battle business semantics；
- credential/network capability unavailable 时，产品在启动 Battle 前如何呈现/处理配置缺失。

这些 wiring 不得扩张 `DecisionPort`、让 `DeepSeekDecision`重新接收 apiKey、或修改 frozen Decision/Simulation semantics。
## 7. PlayerGuidance — future capability, not implemented in v0

PlayerGuidance **不进入当前 DeepSeekDecision v0 implementation scope**。本阶段不冻结 Guidance 的 TypeScript contract、UI/InputTarget、消费时机或具体卡牌数据。

但架构扩展方向已冻结：

~~~text
Simulation
  → DecisionPort.decide(request, signal)
        ↓
DeepSeekDecision stable shell
        ↓
DecisionWorkflow
        ├─ current v0:
        │    Analyze + Strategize
        │    → Materialize
        │
        └─ future candidate:
             Analyze
             → request-scoped PlayerGuidance
             → Strategize
             → Materialize
~~~

未来加入 PlayerGuidance 时必须满足：

- 不修改 Simulation Tick/reducer 与 gameplay authority；
- 不要求修改 `DecisionPort.decide(request, signal)`；
- 不增加 `DeepSeekDecision.setGuidance()` / `currentGuidance` 等跨 request mutable state；
- 不依赖 provider conversation/thread 隐藏状态；
- Guidance 只作为 advisory/untrusted Decision workflow data，不直接修改 HP、position、protection、damage、BattleResult；
- Guidance 的来源必须是授权 Host/InputTarget capability；
- Guidance 必须与具体 workflow run/request 明确关联，不能通过“最近一次全局 Guidance”隐式绑定；
- v0 不预建 generic extension/plugin bag；未来出现真实需求后再冻结 typed Guidance capability。

因此当前状态为：

~~~text
PlayerGuidance implementation:
DEFERRED / NOT IN V0

workflow extensibility reservation:
FROZEN

exact PlayerGuidance contract:
FUTURE / NOT FROZEN
~~~

### INTEGRATION-OPEN-004 — Future PlayerGuidance contract / Host wiring — DEFERRED

未来需要 PlayerGuidance 时再冻结：

- authorized Host/InputTarget source；
- request association / consumption / expiry；
- ally/enemy applicability；
- composition capability shape；
- UI/card model；
- failure/absence semantics。

这些未来选择不得要求重构 Simulation 或把 workflow stage 暴露成 Battle public API。

## 8. Frame / Abort / Subsystem 生命周期

Battle 可以被 LoomRealm Frame/Subsystem 组合使用，但 `game-libs/battle` 本身不等于一个预先构建好的独立 Subsystem 进程。

业务 composition 负责把 Frame/Host 生命周期映射给 Battle Runtime，例如 `frame.signal` abort → `battle.cancel()`、background → `battle.pause("host-background")`、Frame/session 离开 → `battle.close()`。**foreground 不映射成自动 `battle.resume()`**；它只允许产品层显示暂停 Message，玩家显式选择继续/重试后才调用 `battle.resume()`。真正的 Battle 内部终止/冻结语义仍由 Runtime 执行。

PokeMan composition 在 Battle Frame 异步读取 Shared State / Content 之前即订阅 `host.lifecycle`。Runtime 尚未构造或仍处于 CREATED / INITIALIZING 时收到 background，只记录 `pendingHostPause`；进入 RUNNING 后再合法 pause。readiness 检查只在确有 pending background 时短暂运行，正常 foreground 初始化不做 0 ms 无条件轮询。

Frame abort / Battle cancel 遵循 `CTRL-001`：

```text
abort/cancel
→ 立即失效 Battle active authority
→ 停 scheduler
→ best-effort cancel Decision/resource
→ Runtime 调用 Presentation.close()
→ Runtime 进入 CLOSED
```

不等待下一个 200 ms Tick。

所有迟到 Decision/Event 都必须因 Runtime lifecycle、AbortSignal 与 action/decision generation fencing 失去提交权。

### 8.1 Pause reason 与产品手动恢复

Runtime 对外公开：

~~~ts
type BattlePauseReason = "host-background" | "decision-circuit"

snapshot.status === "paused"
→ snapshot.pauseReason MUST exist
~~~

每次真实 RUNNING → PAUSED transition 还通过 `onPause()` 发出 operational pause event；该事件只供 product composition 唤起 UI，不进入 Replay。

两类 pause 的产品策略统一为“玩家手动恢复”：

| reason | 触发 | 产品行为 | 恢复动作 |
| --- | --- | --- | --- |
| host-background | Host/App 进入后台 | background 时冻结 Battle；foreground 后弹出“战斗已暂停。游戏曾进入后台。” | 玩家点“继续战斗” → `battle.resume()` |
| decision-circuit | 连续 3 次 authority-valid Decision attempt_failure | foreground 时立即弹出“AI 决策连续失败，战斗已暂停。” | 玩家点“重试决策” → `battle.resume()` |

两个窗口都允许“退出战斗”；退出由 Battle Frame 调用 `battle.cancel()`，进入既有 cancelled result，不结算本场部分 HP。

禁止：

- Host foreground 自动 resume；
- 用 provider HTTP code 猜 pause reason；
- PokeMan 自己维护第二份 circuit 状态；
- background 事件覆盖已经存在的 `decision-circuit` pause reason；
- 同一次 PAUSED transition 叠加多个恢复窗口。

Decision circuit 本身仍保持原冻结语义：不 abort/revoke in-flight Decision，不在 pause 中推进 Tick，不自动 cooldown；玩家选择“重试决策”后显式 resume 才清零 availability streak。Host-background pause 也不 abort Decision，玩家“继续战斗”后从冻结逻辑时刻继续。

具体 Message Frame 文案 / action 由 PokeMan 77 固定；Battle Core 只提供 reason、pause transition 与 lifecycle methods。

正常 BattleResult 使用不同的视觉生命周期：

```text
terminal gate
→ Simulation 产生最终 gameplay state + normal result candidate
→ 发布 final RenderProjection
→ render 成功后 terminal arbiter commit BattleResult
→ 停止 Battle scheduler / 新 Action
→ BattleRuntime.run() resolve
→ Runtime 保持 SETTLED + final visual
→ 业务离开 Battle scene
→ battle.close()
→ Runtime 调用 Presentation.close()
→ CLOSED
```

Simulation 不等待 final animation ACK；normal result 的 commit cut 只要求 final `render()` 同步调用成功，不等待动画完成。“保留最终画面”只是 Presentation lifetime，不延长 Battle gameplay authority。这样 normal result 与 abort/cancel 的即时 cleanup 不再混为同一路径。

Runtime exact lifecycle/method matrix 已由 BATTLE_V0_SIMULATION.md 冻结；集成层生命周期摘要：

```text
CREATED
  │ run()
  ▼
INITIALIZING
  │ initialize + initial render
  ▼
RUNNING ⇄ PAUSED
  │ normal result
  ▼
SETTLED
  │ close()
  ▼
CLOSED
```

`cancel()` / abort / fatal failure 可从 INITIALIZING、RUNNING、PAUSED 终止 active authority。`close()` 幂等；如果在仍运行时调用，应等价于“cancel authority + cleanup”，而不是留下半活跃 scheduler。

### 8.1 run() 的单一结果通道

可预期的 session 终止统一通过 `run(): Promise<BattleResult>` 返回：

```text
正常胜负             → ally win / enemy win / simultaneous defeat
cancel / active close → cancelled
已分类 Runtime/Presentation/Decision fatal → failure
```

不要同时维护“同一种失败既可能 `BattleResult.failure` 又可能 Promise rejection”两条业务通道。只有 programmer error / invariant violation（例如非法重复 `run()`、内部不变量被破坏）可以 throw/reject。

Presentation failure 最低分类：

```text
initialize 所需关键资源失败
→ Battle clock 尚未开始
→ Runtime cleanup
→ run() = failure

PRESENTATION_CONTENT_FAILED / PRESENTATION_COMMIT_FAILED
→ stop authority
→ cleanup
→ run() = presentation failure

PRESENTATION_INVALID_STATE / SCENE_MISMATCH / PROJECTION_CONFLICT / INVALID_DATA
→ Runtime/contract invariant or programmer error
→ throw/reject，不包装成 BattleResult.failure

resize/resource/internal callback 的异步 terminal fatal
→ Presentation cleanup + resolve one-shot `presentation.failure`
→ Runtime 观察后 stop authority
→ run() = failure

Browser 可降级的异步视觉资源失败
→ fallback / diagnostic
→ 不改变 gameplay，不终止 Battle
```

## 9. Pause / Background

Pause/background policy 已由 Core `TIME-004` 冻结：

- App/Host 进入 background → `battle.pause("host-background")`，Battle monotonic clock 冻结；
- pause 期间不推进 `currentTick`；
- pause 期间 movement、windup、recovery、protection 等 Tick 生命周期不推进；
- Decision completion 可以在 pause 期间进入 inbox，但不会被消费、不会接受 Plan、不会启动 Action；
- foreground 不自动 resume；产品先显示 Message，玩家显式继续后才 resume；
- resume 后从原逻辑时刻继续，不补算 pause 期间 Tick；已排队 completion 在后续实际 Tick 消费。

Core 的逐 Tick catch-up 仍保留，但只用于 Battle clock **仍在运行**时 scheduler/event loop 晚醒的情况。

## 10. LOS 与 Map 规则

LOS 已由 Core `SKILL-006` 冻结为：**v0 不做 LOS**。

- Tile passability 只影响 movement；
- 不推导 `unwalkable = blocks skill`；
- range matrix + direction + committed tiles 决定技能位置是否合法；
- 即使中间存在不可通行 Tile，只要 target 落在正 coefficient 格，技能范围规则仍成立。

未来如需墙体阻挡、弹道或视线，必须加入新的显式机制。

## 11. Stalemate

Core `RESULT-002` 已冻结：v0 **不设置正式 stalemate，也不设置强制 Battle 最大时长**。

继续记录非权威 diagnostics：

```text
ticksSinceLastDamage
ticksSinceLastPositionChange
decisionCountWithoutProgress
collisionRetryCount
```

这些数据只用于观察实际模拟是否存在长期追逐/无效规划，不改变当前 BattleResult。

如果以后确实需要 stalemate，应作为新版本规则显式加入。

## 12. Workspace / Build 状态

Battle v0 Presentation、Simulation baseline（含 Decision availability circuit）、DeepSeekDecision、BATTLE-003 `ResolvedBattleActor.initialHp`、BATTLE-004 独立 BattleArena 与 CTRL-002 pauseReason / onPause 均已完成 closed-loop qualification；它们不改变已冻结 gameplay reducer rules。PokeMan Host 已接入 background/foreground event、Message Frame 与 configured DeepSeekTransport，并通过 credential-free product/browser E2E。PlayerGuidance 明确延期，真实 provider smoke 仍需显式凭据。

已验证工程状态：

- 根 `package.json` 通过 `game-libs/*` 识别 Battle 和 `@loomrealm-game/tile-presentation`；
- 根 `package-lock.json` 已通过干净 `npm ci`；
- `npm run test:battle` 明确构建 subsystem、renderer、tile-presentation、battle，并运行 Battle unit/Browser E2E；
- Battle package dry-run tarball 包含 `dist/browser/battle.browser.js` 与 `dist/browser/battle.css`。

## 13. 推荐实施顺序

```text
1. 按 BATTLE_V0_SPEC.md 的 BATTLE-003 / BATTLE-004 / CTRL-002 amendments 扩展 ResolvedBattleDefinition / validator、BattleArena Presentation loading，以及 BattleRuntime pauseReason / onPause operational contract
2. 按 BATTLE_V0_SIMULATION.md 实现自驱动 headless Simulation Runtime，并新增 package `./simulation` export
3. 实现 frozen DecisionPort + Mock/Script/Deferred Decision
4. 跑 frozen-rule deterministic Test Matrix
5. 外部 BattleActor/BattleSkill serialization schema 可并行/随后收口，不阻塞 headless Runtime
6. 已完成：@loomrealm-game/tile-presentation layout 抽取 + Map regression
7. 已完成：按 BATTLE_V0_PRESENTATION.md 的 Agent execution contract 完整实现并闭环验证 Presentation
8. 在业务 Subsystem 中做薄 composition：构造三层并映射 Frame/Host lifecycle
9. 已按 BATTLE_V0_DECISION.md + BATTLE_V0_SIMULATION.md §10/§16/§32 实现 DeepSeekDecision 与 Simulation availability circuit delta（tick.ts health signals；runtime.ts live guard/Tick-boundary pause/resume reset/Replay bypass），并完成 T-DEC-023..036 + T-DDEC-* qualification；下一步做 configured DeepSeekTransport / product Host E2E，PlayerGuidance 留到后续独立阶段
10. Presentation 与 Simulation baseline 已完成；本阶段完成 circuit/Decision 后重新验证 package-lock / build / unit / Browser E2E / package dry-run / Simulation+Decision subpath import；后续真实 configured transport 与 Host composition 再做集成 qualification
```

Presentation implementation 不需要等待真实 LLM、Guidance 或 provider-specific DecisionFailure schema；它只依赖已冻结的 Presentation contracts/ports 与 synthetic Projection fixtures。

## 14. Integration OPEN 汇总

Presentation blocking integration OPEN 已清零。仍未冻结的集成项只包括：

- **INTEGRATION-OPEN-003**：DeepSeek Decision protocol/workflow 已由 BATTLE_V0_DECISION.md 冻结；Integration 只剩 credential/network physical realization、configured DeepSeekTransport capability handoff 与缺失 capability 的产品级 wiring；
- **INTEGRATION-OPEN-004**：PlayerGuidance exact contract / Host/InputTarget wiring 明确延期；DecisionWorkflow 扩展边界已冻结，因此该未来功能不得要求重构 Simulation-facing DecisionPort；
- Host/Runtime Control 的具体平台事件来源仍需接线，但映射已冻结：background → `pause("host-background")`，foreground 不自动 resume；两类 pause 都通过 Message 由玩家手动继续/重试；Presentation 的 pause/resume 行为本身已冻结；
- Runtime 开始后还需处理 package-lock / build 验证。

`@loomrealm-game/tile-presentation` 已落地且 Map 已迁移；Battle v0 明确不启用 viewport clamp/default/min/max normalization。Battle Presentation、Simulation baseline（含 Decision availability circuit）、DeepSeekDecision、BATTLE-003 initialHp 与 BATTLE-004 BattleArena amendments 已完成 qualification；configured DeepSeekTransport 与 PokeMan product/Host composition 已集成并完成 credential-free E2E。

Pause/background、LOS、stalemate 已进入 Core FROZEN 规则，不再属于 Integration OPEN。PokeMan 产品的物理 PWA `visibilitychange` 与 Desktop renderer visibility 已通过 host-owned adapter、`SessionEventHub.createDelegatedPublisher("host")`、`host.lifecycle` 接入 Battle；foreground 仍只开放 Message 手动恢复，不自动 resume。pagehide / navigation 保持 terminal path，不伪装为可恢复 background。
