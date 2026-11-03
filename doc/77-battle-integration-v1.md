# PokeMan Battle Integration v1 设计

> 状态：**Implemented + Tested + Browser/PWA Closed-loop Qualified**（真实 DeepSeek provider smoke 仍为 credential-gated explicit opt-in）
>
> 范围：将已完成 closed-loop qualification 的 Battle v0 组合进真实 PokeMan Game Package / Subsystem / Map / Host 流程。
>
> 本文不重新定义 Battle gameplay rules、Decision protocol、Simulation Runtime 或 Presentation ABI。为支持 Contract Integrity 连续性，只提出一项窄范围 Simulation input amendment：`ResolvedBattleActor.initialHp`；该输入不改变 Battle gameplay rules，具体约束见 Battle Core Spec / Simulation 文档。
>
> 本文冻结 PokeMan 侧的组合方式、第一条集成验证路径、数据边界、正常 Battle settlement 规则与验收标准。首场互换角色卡的参战身份、技能矩阵与建议数值见 [80-battle-scenario-design.md](./80-battle-scenario-design.md)。

## 1. 目标

PokeMan 当前已经有 Base、Map、Dialogue 三个实际运行的 Subsystem。第一条 Battle 纵向集成仍然选择 Map 4 研究所，但正式流程以 [79-story-dialogue-event-integration.md](./79-story-dialogue-event-integration.md) 的 Event state 为准：博士教学、劲敌挑战、博士发布外出任务是三个独立的 NPC interaction，不是一次 Professor interaction 自动串起全部剧情。

~~~
Base Subsystem
  └─ frame.call("map")
       └─ Map Subsystem / Map Frame Handler
            ├─ prologue = lab-tutorial
            │    Professor interaction
            │      → frame.call("dialogue", professor-vertical-slice)
            │      → Dialogue mutation commits rival-ready
            │      → Story Resolver refreshes Map scene
            │      → return to Map interaction loop
            │
            ├─ prologue = rival-ready
            │    Rival interaction
            │      → frame.call("dialogue", lab-rival-intro)
            │      → accepted only: Business Runtime commits bilateral Contract / Card
            │      → frame.call("battle", lab-rival-tutorial)
            │      → confirmed BattleResult + Integrity settlement
            │      → frame.call("dialogue", result-specific key)
            │      → Dialogue mutation commits after-battle
            │      → Story Resolver refreshes Map scene
            │      → return to Map interaction loop
            │
            └─ prologue = after-battle
                 Professor interaction
                   → frame.call("dialogue", professor-first-journey)
                   → Dialogue mutation commits prologue-to-route
                   → Story Resolver refreshes Map scene
                   → first-route = active
~~~

Map Frame Handler 是 Map Subsystem 中已经存在的 Frame Handler。它在自己的主 async control flow 中等待 NPC interaction、直接 await child Frame、调用业务 Service 并处理结果。这里的“流程编排”不是新建一个 Orchestrator 类、Subsystem、Frame 或 Workflow Engine。

这次集成至少要证明：

1. 博士教学、劲敌挑战和博士任务交接分别由对应 NPC interaction 触发；战后确认由正常 BattleResult 与 Integrity settlement 驱动，并按 Event state 正确推进。
2. Map Frame Handler 能使用 Loom-realm 现有 `frame.call()` 顺序调用 Dialogue / Battle child Frame；Dialogue 不直接调用 Battle，Battle 不直接调用 Dialogue。
3. Battle Content 能从 PokeMan FSDB / Shared State 正确解析为双方 Battle Manifestation。
4. Battle Simulation 能作为独立 child Frame 运行，而不是由 Map 驱动 Tick。
5. Decision 能替换为 Script / Fake 和真实 DeepSeekDecision。
6. Battle Presentation 能在 PokeMan 的 Browser / PWA / Desktop Presentation topology 中加载。
7. Battle 正常退出时，双方 Contract Integrity 能通过同一个 Shared State transaction 原子结算；final HP = 0 的 Contract-backed 卡片保存为 1 HP。
8. Map 能按 BattleResult 选择战后 Dialogue，并在整条 Rival 挑战序列结束后安全恢复输入。

**第一条产品纵向切片仍是 Map 4 的双向卡片交换与教学 Battle。** Map 5 的 road-bandit 保留为后续普通 Encounter / 本体参战验证，不再作为第一次 Battle 的入口。

Core 已实现并 qualification 显式 `initialHp` 输入。正常 Battle 退出把 final HP = 0 的 Contract-backed 卡片以 1 Integrity 保存，BattleResult 仍按归一化前的 final Snapshot 判定。

## 2. 设计基线与当前闭环

以下表格保留设计时的集成基线，并记录当前闭环结果；不再表示未完成工作：

| 位置 | 设计时事实 | 当前闭环结果 |
| --- | --- | --- |
| PokeMan game.json | 只注册 base / map / dialogue | 已注册 battle 与 message |
| launch.hostra.json | 只显式绑定 base / map / dialogue | 已加入 battle / message module |
| package.json | 没有 Battle package dependency | 已加入 workspace dependency 并锁定 lockfile |
| presentation.json | 只有 Schema Form / controls / Map / Dialogue assets | 已加入 Battle / Message browser assets |
| Story Resolver / Map 4 | professor 与 rival-lab 完全由 prologue Event state 解析；Map 无剧情 NPC fallback | Professor / Rival 交互随 EventStateList 切换并 live refresh |
| map.mjs | 只等待 Professor interaction 并调用 professor-vertical-slice Dialogue | 已按 EventStateList 编排多个 sibling child Frame，并在 mutation 后 live refresh |
| Dialogue/lab-rival-intro.json | 两个 choice 都指向自身 | 已分别接入 accepted-challenge / deferred 分支 |
| BattleActor/player | 已有主角本体基础定义：max_hp 20、firebolt | 作为劲敌调用的主角 Battle Manifestation 基础定义 |
| BattleActor/rival | 已有宿敌本体基础定义：max_hp 18、firebolt / grab | 作为玩家调用的宿敌 Battle Manifestation 基础定义 |
| BattleActor/road-bandit | 已有路霸基础定义 | 后续 Map 5 Encounter 验证再使用 |
| BattleSkill | 已有 firebolt、grab | 可复用现有 skill Content |
| BattleEffect | PokeMan Record 与 Battle v0 contract 不一致 | 已修正并通过 browser qualification |
| DeepSeek Gate | Base 已把验证后的 key 写入 Session-only Shared State | Battle 可以在同一 Session 中读取并构造 PokeMan-private Transport |
| PokeMan prologue design | 已定义玩家与宿敌建立双向 Contract，双方互持对方 Card，教学 Battle 为双方 Battle Manifestation 对战 | 本集成必须按双向 Relationship / Contract 解析，不得再把 road-bandit 当成第一场对手 |

当前已有的关键内容：

- Map 4 的 Professor placement：instanceId = professor，位置 (10, 6)，交互由当前 prologue state 决定。
- Map 4 的 rival-lab placement：instanceId = rival-lab，位置 (8, 5)，在 rival-ready state 接入 Dialogue / Battle 流程。
- Dialogue/lab-rival-intro 已存在，但当前 choice target 还没有表达 Battle 接受 / 延后语义。
- BattleActor/player：max_hp 20，skills 为 firebolt，角色资源 Characters/Player。
- BattleActor/rival：max_hp 18，skills 为 firebolt / grab，角色资源 Characters/RivalCasual。
- BattleSkill/firebolt：damage 7，windup 3 ticks，recovery 2 ticks，effect firebolt。
- BattleSkill/grab：damage 4，windup 1 tick，recovery 1 tick，effect firebolt。
- BattleActor/road-bandit 与 Map 5 的静态 road-bandit placement 仍然存在，但属于后续道路 Encounter 场景。

当前 PokeMan 的真实启动拓扑仍然是 base → map，Map 可以通过 child Frame 调用 dialogue。新增 Battle 不应改变 Base 的 controls producer ownership，也不应让 Map 直接依赖 Battle Simulation / Presentation concrete classes。

## 3. 第一条集成验证场景

### 3.1 Map 4：由 prologue Event state 驱动的独立 NPC interaction

第一条技术与产品验证固定在研究所 Map 4。三段剧情按 Event state 依次开放，但由玩家分别与对应 NPC 交互：

~~~
prologue = lab-tutorial
  ↓ Professor interaction
Dialogue / professor-vertical-slice
  ├─ professor-tutorial-ready
  │    → Dialogue mutation commits rival-ready
  │    → Story Resolver refreshes current Map scene
  │    → return to Map interaction loop
  ├─ professor-tutorial-not-yet
  │    → no mutation，保持 lab-tutorial
  │    → return to Map interaction loop
  └─ child failed / lifecycle cancelled
       → 不推进后续阶段

prologue = rival-ready
  ↓ Rival interaction
Dialogue / lab-rival-intro
  ├─ lab-rival-exchange-accept
  │    → Business Runtime 原子交换双向 Contract / Card
  │    → transaction confirmed
  │    → Battle / lab-rival-tutorial
  │    → normal BattleResult + Integrity settlement
  │    → result-specific Dialogue
  │    → prologue-battle-resolved commits after-battle
  │    → Story Resolver refreshes current Map scene
  │    → return to Map interaction loop
  ├─ lab-rival-defer
  │    → no transaction / no Battle / no mutation
  │    → return to Map interaction loop
  └─ child failed / lifecycle cancelled
       → 不进入 Battle

prologue = after-battle
  ↓ Professor interaction
Dialogue / professor-first-journey
  ├─ professor-first-journey-accept
  │    → prologue-to-route commits
  │    → prologue removed，first-route = active
  │    → Story Resolver refreshes current Map scene
  └─ professor-first-journey-not-yet
       → no mutation，保持 after-battle
       → return to Map interaction loop
~~~

博士教学完成后，玩家回到 Map 自由交互；劲敌不会由博士对白自动触发。劲敌接受挑战后，双向交换、Battle 与结果确认对白才组成一段连续的 child-call 序列。Battle 结束并确认结果后，玩家再与博士交互领取第一条道路任务。

这是由固定 Event state 驱动的序章流程，不是通用 Story Graph。Map Frame Handler 只负责调用顺序和分支选择，不承载对话内容、战斗规则或 Contract mutation。

### 3.2 Dialogue 的职责与返回值

Dialogue Content 的物理结构、固定台词和 Choice target 见 [64-dialogue.md](./64-dialogue.md)；序章具体内容见 [78-prologue-dialogue-content.md](./78-prologue-dialogue-content.md)。

正式 Dialogue Graph Runner 的 Frame 输入只携带业务 key 和来源身份，不携带台词、Choice 数组、Sprite、Presentation 或 Controls 对象：

~~~ts
type PokeManDialogueFrameInputV1 = {
  dialogueKey: string;
  source: {
    mapId: number;
    npc: {
      instanceId: string;
      npcId: string;
    };
  };
};
~~~

正式 Dialogue graph 正常到达 terminal 时，Dialogue Subsystem 返回 terminalDialogueId。Map Frame Handler 根据固定 terminal id 映射业务含义：

| terminalDialogueId | Map 侧业务含义 | 后续动作 |
| --- | --- | --- |
| professor-tutorial-ready | 博士教学完成 | Dialogue mutation 已提交 rival-ready；刷新 Map scene |
| professor-tutorial-not-yet | 玩家暂缓 | 不改变 Event state；回到 Map |
| lab-rival-exchange-accept | 劲敌接受挑战 | Business Runtime 原子交换；成功后调用 Battle |
| lab-rival-defer | 劲敌暂缓 | 不交换、不 Battle；回到 Map |
| lab-rival-after-ally-win / enemy-win / draw | 战斗结果确认 | 对应 Dialogue mutation 已提交 after-battle；刷新 Map scene |
| professor-first-journey-accept | 接受外出任务 | Dialogue mutation 已提交 prologue-to-route；刷新 Map scene |
| professor-first-journey-not-yet | 暂缓外出任务 | 不改变 Event state；回到 Map |

terminalDialogueId 是 Dialogue graph 的 terminal identity，不是 Event state，也不是通用业务 action。Dialogue Subsystem 在 terminal Dialogue 声明 mutation 时，必须先成功提交 EventStateList，再以成功 terminal result 返回；Map 不重复提交 mutation。

73 中的 `dialogueKey / conclusion` 是已退役 professor-only validation slice 的历史专用返回值，不是正式 Dialogue Graph Runner 的生产 contract；该 hard-coded Runtime 已删除。真实 child Frame failed 或 lifecycle cancelled 不能映射成任何正常剧情结论。

### 3.3 第一场 Battle：双方互相调用对方的 Battle Manifestation

这场教学 Battle 不是宿敌本体对路霸，而是序章既定的双向角色卡对战：

~~~text
玩家持有宿敌 Card
  → Relationship(player → rival).contract
  → BattleActor/rival
  → ally / 玩家一方的 Battle Manifestation

宿敌持有玩家 Card
  → Relationship(rival → player).contract
  → BattleActor/player
  → enemy / 劲敌一方的 Battle Manifestation
~~~

因此本场固定：

- ally Actor identity：rival，使用玩家持有的宿敌 Card 对应 Contract。
- enemy Actor identity：player，使用宿敌持有的主角 Card 对应 Contract。
- 两边都是 Battle Manifestation；战斗 HP 表示各自方向 Contract 的 Integrity，不是两个人物本体受到物理伤害。
- BattleActor/rival 与 BattleActor/player 只提供基础 max HP / baseline skills / character resource；已有 Contract 的实际 Integrity 和 skills 来自各自 Relationship。

### 3.4 Battle 前置业务状态

进入 Battle 前必须验证双向关系与随身事实：

~~~text
CarriedCards(player)
  contains servantCharacterId = rival

Relationship(player → rival)
  exists
  contract exists
  contract.integrity is valid
  contract.skills[] references valid BattleSkill ids

CarriedCards(rival)
  contains servantCharacterId = player

Relationship(rival → player)
  exists
  contract exists
  contract.integrity is valid
  contract.skills[] references valid BattleSkill ids
~~~

博士 / 劲敌阶段的序章状态推进必须建立这两份 Relationship Contract 和双方 Card。该业务 mutation 不属于 Battle，也不应隐藏在 Map 的 NPC callback 中；应由 PokeMan 当前正式的 Dialogue outcome / Event / Shared State business owner 完成。若现有 Dialogue slice 尚未具备该 mutation 能力，应将其作为本 vertical slice 的显式前置工作，不得通过 Battle Frame params 伪造已成立的 Contract。

第一场教学 Battle 使用刚建立的满 Integrity Contract，因此当前 Battle v0 默认 initialHp = maxHp 的行为可以正确启动首战。首战后的 Integrity 写回和后续 Battle 恢复规则见第 8 节。

### 3.5 后续场景：Map 5 road-bandit

Map 5 的 road-bandit 仍然是很好的第二条 Battle 验证路径，但它验证的是不同语义：

- enemy 是 road-bandit 本体，不是 Contract Battle Manifestation。
- 本体 HP 是本场战斗状态，不写入 rival / player Contract。
- 需要 Encounter / Story source 提供合法的 NPC instance 与 BattleActor identity。
- 当前 Map 5 只有静态 placement，尚没有 Encounter/5 Content。

因此 road-bandit 不再作为第一次 Battle 的入口；等 Map 4 教学链通过后，再用它验证普通 NPC 本体参战。

## 4. 目标组合结构

~~~
Game Entry
└─ Base Subsystem
   ├─ DeepSeek Session Configuration Gate
   ├─ game-controls-input producer
   └─ frame.call("map")
      └─ Map Subsystem
         └─ Map Frame Handler（现有 Frame Handler）
            ├─ RPGMapBuilder / Map Runtime
            ├─ NPC interaction rendezvous
            ├─ Story Resolver（普通 Service）
            ├─ frame.call("dialogue", ...)
            ├─ PokeMan Business Runtime（普通 Service）
            ├─ frame.call("battle", ...)
            └─ frame.call("dialogue", result-specific key)

Battle Subsystem
  ├─ Bilateral Contract / Card Resolver
  ├─ Battle Content Resolver
  ├─ PokeMan DeepSeekTransport
  ├─ DeepSeekDecision
  ├─ BattlePresentationBuilder
  ├─ PokeMan BattleClock
  └─ BattleSimulationBuilder
     └─ BattleRuntime
~~~

依赖方向：

~~~
Base Frame
  → frame.call("map")

Map Frame Handler
  → frame.call("dialogue")
  → PokeMan Business Runtime functions
  → frame.call("battle")
  → frame.call("dialogue")

Dialogue Subsystem
  → Dialogue Content / EventStateMutation / EventStateList
  → 不调用 Battle，不创建 Contract / Card

Battle Subsystem
  → Content / Shared State / Frame / SubsystemScope
  → Battle Decision / Simulation / Presentation public APIs
  → 不调用 Dialogue，不推进 Event

Story Resolver
  → 纯场景解析 Service；不拥有 Frame，不修改 Shared State
~~~

这里不增加 Orchestrator class、Subsystem、Frame 或通用 Workflow Engine。Map Frame Handler 是现有 Map Subsystem 的 Frame Handler；Story Resolver、Business Runtime 和 Content Resolver 是由各自 owner 调用的普通 Service，不拥有 Frame 生命周期。

职责固定：

| 组件 | 职责 | 不负责 |
| --- | --- | --- |
| Base Subsystem | Session 初始化、全局 Controls ownership、启动 Map Frame | 序章剧情编排 |
| Map Subsystem / Map Frame Handler | 等待 NPC interaction、顺序 await child Frames、调用业务 Service、根据 BattleResult 选择结果 Dialogue、刷新 Map scene、恢复 Map controls | 对话内容、战斗规则、Contract HP 写入 |
| Dialogue Subsystem | 当前对话 session、Choice / graph、terminalDialogueId、可选 EventStateMutation commit | 直接调用 Battle 或修改 Battle Runtime |
| Battle Subsystem | 双向 Card / Contract 解析、Content 解析、构造三层、Battle 生命周期、双方 Integrity 结算 | 自己决定剧情台词或调用 Dialogue |
| Story Resolver | 根据 StoryIndex / EventStateList / Character scene 解析当前 Map NPC scene | 推进 Event state、拥有 Frame |
| PokeMan Business Runtime | 双向 Relationship / Contract 与 CarriedCards 业务事务 | 解释 Dialogue 台词、拥有 Frame |
| Content Resolver | 将 FSDB Content / Resource / Shared State facts 转成各业务 Runtime 的合法输入 | 创建第二套 Content schema |
| DeepSeekTransport | 封装当前 Session credential 与 HTTP transport | 读取或改变 Battle State |
| DeepSeekDecision | 消费 DecisionRequest 并返回 DecisionCompletion | 执行移动、伤害、胜负判定 |
| Simulation | Tick、Plan validation、movement、skill、damage、BattleResult、Replay | 读取 FSDB、DOM、Host lifecycle |
| Presentation | Map / Actor / Effect 的视觉呈现、插值、camera、viewport、资源释放 | 决定任何 Battle Rule |

## 5. Map → Dialogue → Battle → Dialogue child Frame

### 5.1 Map Frame Handler 的交互循环与顺序调用

Map Frame Handler 持有 Map Frame 的主 async control flow。NPC interaction callback 只向当前 waiter / rendezvous 投递事件；真正的 child Frame 调用由 Map Frame Handler 自己执行并 await。

三个 NPC interaction 分别由 prologue Event state 开放：

1. `lab-tutorial`：等待 Professor interaction，调用 `professor-vertical-slice`。Dialogue mutation 成功提交 `rival-ready` 后，Map Frame Handler 重新读取 EventStateList、调用 Story Resolver、更新当前 Map NPC scene，再回到普通 Map interaction loop。
2. `rival-ready`：等待 Rival interaction，调用 `lab-rival-intro`。defer 时不产生业务副作用并回到 Map；accept 时调用 Business Runtime 原子交换双向 Contract / Card，确认成功后连续调用 Battle，再按 BattleResult 调用战后 Dialogue。战后 mutation 成功提交 `after-battle` 后刷新 Map scene，再回到普通 Map interaction loop。
3. `after-battle`：等待 Professor interaction，调用 `professor-first-journey`。接受任务的 Dialogue mutation 提交 `prologue-to-route` 后刷新 Map scene；暂缓则保持当前状态。

因此，博士教学、劲敌挑战和博士任务交接是三个独立的 NPC interaction，不是一次 Professor interaction 自动触发的完整长链。

Controls / Frame 生命周期约束：

- 在调用 child Frame 前，Map 先清空 move intent、reset directional tracker 并关闭当前 ControlsConsumer。
- Map Frame Handler 自己依次 `await frame.call(...)`；NPC callback 不直接调用 `frame.call()`，也不允许 detached async task 持有 child call。
- Map controls 在 Rival 接受挑战后的 Dialogue → Battle → Result Dialogue 连续序列期间始终关闭；中间不短暂开放输入。
- Child 返回后，Main 恢复 Map 的 fresh Activation；旧 Activation 的 Consumer / Tracker 不得复用。
- 普通 Dialogue 返回后可以恢复新的 Map Controls activation；Event mutation 已提交时必须先刷新当前 Map scene。
- Child failed / lifecycle cancelled 不得被解释为正常剧情结论；按 73 与 Loom-realm Frame Call Protocol 的失败、取消和 cleanup 规则处理。
- Map Frame Handler 的 finally 仍需 disarm waiter 并幂等关闭当前 activation。

### 5.2 Dialogue Frame 输入 / 输出

Map 只传业务 key 和交互来源身份，不传 RPGDialogue request、台词、Choice 数组、Sprite、Presentation data 或 Controls object。

生产输入：

~~~ts
type PokeManDialogueFrameInputV1 = {
  dialogueKey: string;
  source: {
    mapId: number;
    npc: {
      instanceId: string;
      npcId: string;
    };
  };
};
~~~

Dialogue Content 的物理结构保持 [64-dialogue.md](./64-dialogue.md) 冻结的 lines / speaker / choices / target。具体台词与分支见 [78-prologue-dialogue-content.md](./78-prologue-dialogue-content.md)。

正式 Dialogue Graph Runner 正常完成时返回 terminalDialogueId。Map Frame Handler 在自身控制流中消费 terminalDialogueId，并按本文件 §3.2 的固定映射决定是否调用 Business Runtime、Battle 或刷新 Map scene。

73 的 professor-only hard-coded vertical slice 使用 `dialogueKey / conclusion` 结果，是验证切片的专用 contract；它不是正式 Dialogue graph runner 的最终业务结果 contract。真实 child Frame failed 或 lifecycle cancelled 不得被解释为正常剧情结论。

### 5.3 Battle Frame 输入

Battle Frame 输入只表达受支持的场景请求与世界侧来源身份，不携带 Battle 坐标。首场 Battle 使用独立 BattleArena，spawn 由 scenario 固定：

~~~ts
type PokeManBattleFrameInput = {
  scenarioId: "lab-rival-tutorial";
  source: {
    mapId: 4;
    rival: {
      instanceId: "rival-lab";
      npcId: "rival-lab";
    };
  };
};
~~~

输入约束：

- scenarioId 必须是受支持的 PokeMan Battle scenario key。
- source.mapId 必须为 4，rival 必须对应当前 Map 4 的 rival-lab interaction source；这些字段只证明剧情来源，不用于 Battle navigation。
- Map caller 不传玩家 tile、Rival tile、direction、passability 或 Arena tile data。
- 不接受调用方直接传入 BattleActor / Skill / Effect 的可变对象。
- 不接受 apiKey、transport、DecisionRequest、ResolvedBattleDefinition 或 BattleRuntime。
- Battle Subsystem 根据固定 scenario mapping 和 Shared State 解析 arena=lab-tutorial、ally=rival、enemy=player；Map caller 不是 Content / Contract / Arena authority。

未来 Encounter Battle 可以由 Encounter / Story source 提供受验证的 source identity；不把 lab-rival-tutorial 的固定映射提升为通用 Map 规则。

### 5.4 BattleArena 与 Actor 初始位置

第一场 Battle 与探索 Map 坐标彻底解耦：

- 使用 `struct.BattleArena/lab-tutorial`。
- Arena 固定 7 × 7，passable 全 true。
- ally rival manifestation 固定 spawn = (1,3)，direction = 6 / right。
- enemy player manifestation 固定 spawn = (5,3)，direction = 4 / left。
- 两个 spawn 必须在 Arena bounds 内且 `passable[y][x] === true`。
- 不读取 RPGMap Runtime player pose、NPC placement、passage、terrain、bridge、ledge、transfer 或 collision。
- Map 4 只决定 Battle 在什么剧情上下文被触发，不决定 Battle grid。
- Presentation 可以复用研究所 Tileset / Autotile / Graphics 视觉素材，但视觉 tile 不反向决定 Battle passability。

这样实现后，Battle 不需要 Map → Battle passability projection，也不需要扩展 Map public movement contract。

## 6. Battle Subsystem 组合

### 6.1 Content / Contract Resolver

Battle Subsystem 负责把 FSDB Content 和 Shared State 转成 Battle v0 的纯数据输入：

1. 根据 scenarioId 解析 `struct.BattleArena/lab-tutorial`。
2. 验证 Arena 的 width / height / passable / tileset_id / visual tile data；不读取 `struct.Map/4`。
3. 读取 Arena 引用的 `struct.Tileset`、Tileset / Autotile Graphics 与 Battle Presentation 所需资源。
4. 读取 CarriedCards(player)，确认宿敌 Card 在随身位。
5. 读取 Relationship(player → rival)，验证 Contract Integrity / skills；解析为 ally BattleActor/rival。
6. 读取 CarriedCards(rival)，确认主角 Card 在劲敌随身位。
7. 读取 Relationship(rival → player)，验证 Contract Integrity / skills；解析为 enemy BattleActor/player。
8. 读取双方 Contract 实际使用的 BattleSkill；对每个 Skill.effect 读取对应 BattleEffect。
9. 使用 scenario 固定 spawn 构造两个 Actor；验证 spawn 在 Arena bounds 内且 passable。
10. 验证 Record key 与 definition id 一致、所有 ContentRef / ResourceRef 存在、资源 contentVersion 合法。
11. 生成 detached、immutable 的 ResolvedBattleDefinition。

PokeMan 直接复用 Battle v0 的 BattleActor / BattleSkill / BattleEffect / BattleArena contracts，不建立 PokeMan 私有的 BattleProfile、Skill、Effect 或探索 Map projection schema。

Simulation 只接收纯数据；Battle Presentation 仍由 BattlePresentationBuilder 使用 SubsystemScope / Frame 读取 Arena 视觉资源。Battle Subsystem 不得把 RPGMap Handler、Map timer、Map passability 或 Map movement completion 注入 Battle Core。

Battle passability 直接来自 BattleArena authored data。Tileset / Autotile 只负责视觉；不得调用 Map package 的 `evaluatePassability()` / `planMovement()` 来推导 Battle grid。

### 6.2 三层构造顺序

推荐组合顺序：

~~~ts
const presentation =
  new BattlePresentationBuilder(scope, frame).build()

const decision =
  new DeepSeekDecision({ transport })

const runtime =
  new BattleSimulationBuilder({
    clock,
    signal: frame.signal,
    decision,
    presentation,
  }).build(resolvedDefinition)

const result = await runtime.run()
~~~

这是概念调用顺序，不是要求把所有代码写在一个函数中。Content / Shared State 验证应在启动 Runtime 前完成；每场 Battle 必须创建新的 Builder / Handler / Runtime。Presentation Builder 和 Simulation Builder 都是 one-shot，不得跨 Battle 复用。

Simulation 自己拥有 BattleClock、200 ms scheduler、Tick reducer 和 Decision lifecycle。业务层不得建立第二个 setInterval，也不得在 Map callback 中调用公开 tick。

Runtime 注入 Presentation 后，pause / resume / close 的 lifecycle ownership 归 Runtime。Application 不直接操作 Presentation Handler。

### 6.3 BattleClock

PokeMan 提供最薄的 BattleClock adapter：

~~~ts
interface BattleClock {
  nowMs(): number
  schedule(delayMs: number, callback: () => void): () => void
}
~~~

生产实现使用 monotonic time source 和可取消的 scheduler wake；测试使用 FakeBattleClock。Scheduler callback 只唤醒 Simulation 自己的调度器，不承载 Battle Rule，也不把 wall-clock calendar time 作为 gameplay authority。

## 7. Content 与 Presentation 资源

### 7.1 首场 BattleActor / Skill

首场互换角色卡的完整角色映射、参数来源与数值建议见 [80-battle-scenario-design.md](./80-battle-scenario-design.md)。当前 FSDB 实际定义：

| Content | 已有定义 | 本场用途 |
| --- | --- | --- |
| BattleActor/rival | max_hp 18、firebolt / grab、Characters/RivalCasual | Ally：玩家调用的宿敌 Manifestation，actorId=rival |
| BattleActor/player | max_hp 20、firebolt、Characters/Player | Enemy：劲敌调用的主角 Manifestation，actorId=player |
| BattleActor/road-bandit | max_hp 12、grab、Characters/RoadBandit | 后续 Map 5 本体 Encounter，不用于首场教学战 |
| BattleSkill/firebolt | damage 7、range 1.0 / 0.5、3 windup / 2 recovery、effect firebolt | 双方可用技能 |
| BattleSkill/grab | damage 4、当前 1 windup / 1 recovery；当前 range shape 不符合 SKILL-001 | 宿敌基础技能；需修正 range matrix，建议独立 grab effect |

双方的实际技能来源遵循各自 Contract 语义：

- 玩家持有的宿敌 Contract：Relationship(player → rival).contract.skills[]。
- 劲敌持有的主角 Contract：Relationship(rival → player).contract.skills[]。

BattleActor.skills[] 是基础 baseline / 新 Contract 初始化来源；不得每场 Battle 都用基础 Actor skills 覆盖已经成立 Contract 的技能集。

本场建议 BattleConfig：tickDurationMs=200（Core frozen）、maxPathSteps=6（Core default）、moveTicks=2、protectionTicks=2（后两项是待试玩确认的 scenario proposed values）。完整定义与计算例见 80。

### 7.2 BattleEffect 当前不符合 v0 contract

这是当前内容层的明确阻塞：

- PokeMan 的 BattleEffect/.info.meta 目前仍是旧的 graphics / name / id shape。
- BattleEffect/firebolt.json 目前只有 id / name。
- Battle v0 要求 exact fields：id、image、anchor、timing。
- image 必须指向 resource.Graphics，key 必须位于 BattleEffects/ 前缀。
- anchor 固定为 tile-center。
- timing 必须包含 fade_in_ticks、hold_ticks、fade_out_ticks；总时长不能为零。
- 当前 PokeMan Graphics 还没有 BattleEffects 资源目录。

实施时必须同步修正 BattleEffect schema / Record，并提供至少一个可加载的 BattleEffects/firebolt 资源。不要通过放宽 Battle Core validator 或把 BattleEffect 改成 Skill-local animation 来绕过跨层合同。

### 7.3 Browser artifact

PokeMan Presentation 需要注册 Battle package 已发布的 browser artifacts：

~~~text
@loomrealm-game/battle/browser/battle.browser.js
@loomrealm-game/battle/browser/battle.css
~~~

在 PokeMan：

- presentation.json 增加 Battle CSS / JS resource entries。
- [resource]Presentation 增加对应同步产物。
- 现有 scripts/sync-map-presentation.mjs 扩展 Battle browser artifact 的 build / copy / SHA-256 verification；不要建立一条与现有同步流程竞争的旁路。
- sync script 的 check-only 路径必须验证 Battle source / dist / FSDB target 一致。
- Desktop / play.bat 和 PWA build 都使用同一组 Presentation resource identity。

Battle package 已提供 browser JS/CSS exports；PokeMan 只消费 package exports，不复制或 fork Battle Browser implementation。

## 8. 双向 Contract Integrity、initialHp 与正常退出结算

### 8.1 双方 Manifestation 的 HP authority

首场 Battle 两个 Actor 分别来自相反方向的 Relationship Contract：

~~~text
BattleActor/rival.max_hp
  = Relationship(player → rival).contract Integrity 上限

Relationship(player → rival).contract.integrity
  = ally rival manifestation 本场初始 HP

Relationship(player → rival).contract.skills[]
  = ally 本场实际可用 Skill ids

BattleActor/player.max_hp
  = Relationship(rival → player).contract Integrity 上限

Relationship(rival → player).contract.integrity
  = enemy player manifestation 本场初始 HP

Relationship(rival → player).contract.skills[]
  = enemy 本场实际可用 Skill ids

BattleSnapshot ally.rival.hp
  = player → rival Contract 的原始 final HP
  → 正常退出 settlement 后写入 max(1, final HP)

BattleSnapshot enemy.player.hp
  = rival → player Contract 的原始 final HP
  → 正常退出 settlement 后写入 max(1, final HP)
~~~

BattleResult 本身只表示 ally_win / enemy_win / simultaneous_defeat / cancelled / failure；最终双方 HP 必须从 BattleRuntime.getSnapshot() 读取，不得从 BattleResult 推导。

这里的 HP 是两份有向 Contract 各自的 Battle Manifestation Integrity，不是主角或宿敌本体的生命值。

### 8.2 Core 输入契约扩展：ResolvedBattleActor.initialHp

当前 ResolvedBattleActor 只有 maxHp，Simulation 初始化时固定：

~~~text
ActorRuntimeState.hp = ActorRuntimeState.maxHp
ActorRuntimeState.maxHp = ResolvedBattleActor.maxHp
~~~

目标是增加可选 `initialHp` 输入，而不是改变 BattleActor Content：

~~~ts
type ResolvedBattleActor = {
  actorId: ActorId;
  team: Team;
  tile: GridPosition;
  direction: Direction;
  maxHp: number;
  initialHp?: number;
  // character / skills unchanged
};
~~~

约束：

- `maxHp` 仍来自 `BattleActor.max_hp`，表示稳定上限。
- PokeMan 的 `initialHp` 必须来自对应方向 `Relationship(<holder> → <servant>).contract.integrity`。
- 提供 `initialHp` 时必须是 safe integer，且 `1 <= initialHp <= maxHp`；0 Integrity 不允许构造新的 Battle Manifestation。
- 省略 `initialHp` 的既有 Battle caller 继续以 `maxHp` 初始化，保持兼容。
- Simulation 初始化使用 `initialHp ?? maxHp`；initial Snapshot、RenderProjection、Replay 的 `record.initial` 必须反映真实初始 HP。
- validator、Snapshot、Replay definition / validation 和 deterministic tests 同步覆盖该字段。
- Battle Core 不读取 Relationship、Contract 或 PokeMan Content；它只接收已解析数值。

这是一个 Simulation input contract amendment，不改变 Tick reducer、Decision protocol、Damage、BattleResult 或 Presentation ABI。该 amendment 在当前文档中是目标设计，尚不代表 Runtime 已实现。不得通过伪造 `maxHp = contract.integrity` 绕过；否则 HUD 最大值会错误地变成当前 HP。

### 8.3 双向结算与 Shared State transaction

正常 Battle terminal 时，Battle Subsystem 必须先读取未经归一化的 final Snapshot，并保留原始 BattleResult。正常退出 Battle、向 Map 返回 child outcome 之前，对两份 Contract-backed Actor 分别计算：

~~~text
persistedIntegrity = max(1, finalSnapshot.hp)
~~~

- final HP 大于 0：原样保存。
- final HP 等于 0：保存为 1。
- 双方同 Tick 归零：BattleResult 仍是 `simultaneous_defeat`，两份 Contract 都保存为 1。
- 1 HP 下限只作用于 Shared State settlement，不修改 Simulation Snapshot、BattleResult、Replay 或胜负对白。
- 该规则只作用于 Contract-backed Manifestation；普通本体 / transient Actor 的本场 HP 不因此获得长期持久化。

双向业务事务：

1. Battle 开始前读取 Relationship(player → rival) 与 Relationship(rival → player)，记录两者 version，并验证 Card / Contract / BattleActor invariant。
2. 正常 Battle 结束后，读取 ally rival 与 enemy player 的 final Snapshot HP；不得从 BattleResult 推导剩余 HP。
3. 使用同一个 Shared State transaction：
   - conditions 同时要求两份 Relationship 仍是 Battle 开始前读取到的 version；
   - writes 同时替换两份 Relationship Record，保留各自 affinity、hostile、relationshipText、skills 等其他字段，只更新对应 `contract.integrity = max(1, finalSnapshot.hp)`。
4. 两份 Relationship 必须原子提交；不允许先写一边、再单独写另一边，避免双向契约出现半结算。
5. COMMITTED：直接视为 settlement 成功。
6. CONFLICT：不做 blind retry。fresh-read 两份 Relationship；若两份当前 authoritative value 都已经精确等于本次 expected value，则按幂等 reconciliation 视为成功；否则 settlement 失败并停止正常战后剧情。
7. OUTCOME_UNKNOWN：同样 fresh-read 两份 Relationship。两份都精确等于 expected value则视为 reconciled success；否则视为未确认，不自动重试，也不播放胜负 Dialogue。
8. 不新增 operation-marker Record、operation id 或第二套 settlement state machine。当前 settlement 是幂等的“把两份 Relationship 设置成 expected final values”，OCC + authoritative read-back 已足够。
9. cancelled / failure 不提交本场部分 HP 损耗；Frame abort 不得留下半提交 Contract。

Shared State 写入只发生在正常 Battle 退出结算时，不按 Tick 写入。不得新增 BattleRuntime HP Record，也不得把 live BattleSnapshot 变成 Shared State 的第二份 authority。只有双向 settlement 确认提交后，Battle child 才能向 Map 返回正常 BattleOutcome，Map 才能启动结果 Dialogue。

## 9. DeepSeek Decision 与 credential 边界

### 9.1 当前有意采用 AI vs AI

本次 Battle Integration 中，Ally 与 Enemy 都由各自的 DecisionPort 自主决策；真实 provider 集成时双方都可以使用 DeepSeekDecision。Headless / deterministic 测试使用 ScriptDecision 或 fake DecisionPort。

AI vs AI 是当前有意选择的验证范围，用来先验证 Battle Actor、Decision、Simulation、Presentation、BattleResult 和 Contract settlement 的闭环；不是当前缺口，也不要求玩家在本阶段提交战术 Plan。PlayerGuidance、直接操控、Character personality / Relationship affinity 对 Decision 的影响属于后续玩法阶段，不阻塞本次集成。

### 9.2 Credential boundary

当前 PokeMan 已经由 Base Gate 把验证成功的 key 保存到 Session-only Record：

~~~text
pokeman.SessionConfig / deepseek
  { apiKey }
~~~

PokeMan 当前阶段明确采用 product-private transport 例外：

~~~text
Battle Subsystem
  → read pokeman.SessionConfig/deepseek
  → construct PokeMan-private DeepSeekTransport
  → new DeepSeekDecision({ transport })
  → inject DecisionPort into BattleSimulationBuilder
~~~

DeepSeekDecision 的 public constructor 只接收 configured DeepSeekTransport，不接收 apiKey。Transport 实现 provider HTTP / request body / Authorization header；Battle Simulation、Replay、Presentation 和 Frame params 都不能获得 credential。

固定约束：

- 不新增通用 Framework credential service / network service。
- 不把 key 放入 Battle Frame params、ResolvedBattleDefinition、DecisionRequest、Replay、RenderProjection、logs 或 error metadata。
- Transport 使用当前 Frame signal 取消 in-flight request。
- Base startup probe 通过不等于后续每次 Decision 都一定成功；Battle 必须按已冻结的 Decision failure / availability circuit semantics 处理运行期错误。
- PWA Worker 和 Hostra / Desktop 必须分别验证真实 provider request 可达；不得用 Mock 结果声称真实网络已通过。

第一轮 deterministic integration tests 使用 ScriptDecision / fake DecisionPort，不需要真实 key。之后再做真实 DeepSeek qualification。

## 10. Frame、Pause 与 Result 生命周期

### 10.1 Abort / Cancel

Battle Runtime 使用当前 Battle Frame 的 frame.signal：

~~~text
Frame signal abort
  → BattleRuntime cancel authority
  → stop Battle scheduler
  → cancel in-flight Decision best-effort
  → Presentation cleanup
  → run() returns cancelled
~~~

Battle Subsystem 负责观察 run() 的 BattleResult，并将可预期结果映射为 Subsystem Frame outcome。不得让同一个可预期的 Battle failure 一部分通过 BattleResult、另一部分又以普通 Promise rejection 暴露。

Programmer error / contract invariant violation 仍按 Battle Core contract throw / reject，不包装成普通 gameplay outcome。

### 10.2 Normal Result

Normal BattleResult 后，Simulation 进入 SETTLED 并保留 final Projection / Presentation。Battle Subsystem 读取原始 final Snapshot，完成双向 Integrity settlement（归零者保存为 1），然后调用 `battle.close()` 关闭 Battle Presentation，并以已结算的 PokeManBattleOutcome 返回 Map。

本阶段**不设计独立 Battle Result acknowledgement / confirm button / result overlay input**。Map 在 Battle child 正常返回后，立即根据 BattleResult 调用对应 result Dialogue；该 Dialogue 就是唯一的玩家结果确认界面。Battle Presentation 不接收任何“继续”Controls，也不为了等待确认而延长 Battle Frame 生命周期。

固定顺序：

~~~text
Battle terminal
→ get final Snapshot / BattleResult
→ bilateral OCC settlement
→ battle.close() / Presentation cleanup
→ Battle Frame completed(PokeManBattleOutcome)
→ Map frame.call(result Dialogue)
→ Dialogue mutation → after-battle
~~~

Map controls 在整个 Rival accepted → Battle → result Dialogue 连续序列期间保持关闭；只有 result Dialogue 返回后才恢复 fresh Map activation。

### 10.3 Pause reason 与玩家手动恢复 — FROZEN

当前只区分两种产品需要处理的 Battle pause：

Host lifecycle 的当前状态由现有 `SessionEventHub` 持有，不由 Battle Frame 或平台 adapter 复制。每个 session 使用独立 epoch，快照带单调 sequence；`subscribeHostLifecycle()` 原子安装订阅并交付 retained initial snapshot，消除“先读当前状态、再订阅更新”的丢失窗口。PWA Window 与 Desktop Renderer 只负责把物理可见性事实送入该 authority。

Battle Runtime 的合法迁移为 `created → initializing → running ↔ paused → settled → closed`，取消或失败可从活动状态进入 `closed`。`onTransition()` 是初始化期间 background 与 `running` 建立之间的同步点；产品层不得使用 readiness polling 或 pending-pause timer。

| pauseReason | 触发 | 提示 | 玩家动作 |
| --- | --- | --- | --- |
| `host-background` | App / Host 进入后台，product composition 调用 `battle.pause("host-background")` | `战斗已暂停。游戏曾进入后台。` | `继续战斗` / `退出战斗` |
| `decision-circuit` | 连续 3 个 authority-valid Decision attempt_failure 触发 Runtime circuit | `AI 决策连续失败，战斗已暂停。` | `重试决策` / `退出战斗` |

两种 pause **一律不自动恢复**。Host foreground 只表示“现在可以向玩家显示窗口”，不得直接调用 `battle.resume()`。

Battle Runtime 必须通过 public `BattleSnapshot.pauseReason` 与 `onPause()` operational event 暴露当前原因；PokeMan 不根据 HTTP error、Presentation state 或 Host 自己的猜测推断 reason。

Battle Frame 使用现有产品设计中的模态 Message Frame 显示暂停窗口。固定流程：

~~~text
runtime onPause(reason)
→ Battle Frame 保持 runtime PAUSED
→ 若当前 Host 在 foreground：frame.call("message", pause prompt)
→ 若当前 Host 在 background：Snapshot 保持 paused；foreground snapshot 到达后再 call Message
→ 玩家选择 continue / retry
→ Battle Frame 显式 battle.resume()
→ 玩家选择 exit
→ Battle Frame battle.cancel()
~~~

当前 Battle pause prompt 的业务 contract 固定为：

~~~ts
type PokeManBattlePausePrompt =
  | {
      messageKey: "battle-host-background-paused";
      text: "战斗已暂停。游戏曾进入后台。";
      actions: readonly [
        { id: "continue"; label: "继续战斗" },
        { id: "exit"; label: "退出战斗" },
      ];
    }
  | {
      messageKey: "battle-decision-circuit-paused";
      text: "AI 决策连续失败，战斗已暂停。";
      actions: readonly [
        { id: "retry"; label: "重试决策" },
        { id: "exit"; label: "退出战斗" },
      ];
    };
~~~

Message Frame 只返回玩家选择，不拥有 Battle lifecycle authority。`continue / retry` 都由 Battle Frame 调用同一个 `battle.resume()`；区别只在文案与按钮语义。`exit` 调用 `battle.cancel()`，结果走现有 cancelled 路径：不提交本场部分 HP、不播放胜负 Dialogue、不推进 Event。

边界规则：

- Host background 发生时立即 pause；实际后台期间不要求强行显示窗口。
- Host foreground 后如果 Snapshot 仍是 `paused/host-background`，显示“继续战斗”窗口；禁止自动 resume。
- Decision circuit 在 foreground 触发时立即显示“重试决策”窗口；如果触发后又进入 background，则窗口可等 foreground 后显示。
- 已经 `paused/decision-circuit` 时再收到 Host background，不得把 pauseReason 覆盖为 `host-background`。
- 同一次 PAUSED transition 只允许一个 pause prompt activation；重复 lifecycle event 不得叠多个 Message Frame。
- Message child pending 时 Battle Runtime 保持 PAUSED，Battle Frame 不创建第二个 ControlsConsumer 来绕过 Message。
- 玩家选择恢复后如果 Decision 服务仍失败，可以再次达到 threshold、再次进入 `decision-circuit` 并重新提示。

这样 Host lifecycle 和 Decision availability 共用一套简单产品规则：**任何 Battle pause 都必须经过玩家确认才能继续，只是提示文本不同。**

## 11. Battle Frame 返回值与 Map 的剧情分支

Battle Subsystem 只返回战斗业务结果和结算证据，不直接选择或调用 Dialogue：

~~~ts
type PokeManBattleOutcome = {
  battleId: string;
  result: "ally_win" | "enemy_win" | "simultaneous_defeat";
  settlement: "committed" | "not-applicable";
};
~~~

对 Map 4 的 lab-rival-tutorial，正常结果必须在双方 Relationship transaction 成功提交后才返回 settlement = committed。若 settlement conflict / outcome unknown 尚未完成 reconciliation，不得把 Battle 当作已完成并启动战后剧情。

Map 收到正常 BattleOutcome 后按固定映射选择 Dialogue key：

~~~text
ally_win
  → lab-rival-after-ally-win

enemy_win
  → lab-rival-after-enemy-win

simultaneous_defeat
  → lab-rival-after-draw
~~~

Map 只需要 result enum；不读取 Snapshot / Replay / Content / provider data。Battle 的 cancelled / failure 不属于正常胜负分支，不得打开胜利、失败或平局剧情；按标准 Frame outcome 返回 / 展示可恢复错误。

## 12. 测试与验收

### 12.1 Content Resolver

- 正确解析 ally = BattleActor/rival、enemy = BattleActor/player。
- ally 必须绑定 Relationship(player → rival) 与玩家持有的 rival Card；enemy 必须绑定 Relationship(rival → player) 与劲敌持有的 player Card。
- 任一方向的 Card / Relationship / Contract 缺失、Integrity 越界或 Contract skill 引用无效时拒绝启动。
- 已有 Contract 使用各自 contract.skills[]；不得被 BattleActor.skills[] 覆盖。
- BattleActor record key 与 value.id 不一致时拒绝。
- Skill 引用缺失、effect 引用缺失、ResourceRef 不存在或 contentVersion 非法时拒绝。
- BattleEffect exact schema 校验通过；旧的 graphics/name shape 被拒绝。
- `struct.BattleArena/lab-tutorial` 缺失、shape 非法、visual tile data 非法，或两个固定 spawn 越界 / 重叠 / 不可通行时拒绝。
- 输出为 detached immutable ResolvedBattleDefinition。

### 12.2 Battle Subsystem

使用 FakeBattleClock、ScriptDecision / fake DecisionPort、RecordingPresentation：

- 满 Integrity 的 rival / player 双 Manifestation 可以启动首场确定性 1v1。
- 正常 ally_win / enemy_win / simultaneous_defeat。
- final Snapshot 的双方 HP 映射到正确方向的 Relationship Contract。
- final Snapshot HP = 0 时，正常退出 settlement 保存为 1；BattleResult 仍依据原始 final Snapshot 判定。
- simultaneous_defeat 时两边都保存 1，但结果仍然是平局。
- 下一场 Battle 从两份 Contract 的保存值传入 initialHp，maxHp 保持 BattleActor 上限。
- 两份 Relationship 更新通过同一个 Shared State transaction 原子提交；验证任一 OCC condition 冲突时两边都零写入。
- 验证 CONFLICT / OUTCOME_UNKNOWN 均只做 fresh-read reconciliation：两份 Relationship 同时等于 expected values 才成功，否则不自动重试、不启动胜负 Dialogue。
- Presentation initialize / render / failure / close 的生命周期。
- Frame signal pre-abort 与 active abort。
- Decision failure、`decision-circuit` pauseReason、onPause 单次通知、Message“重试决策”后显式 resume；Host background 使用 `host-background` reason，foreground 不自动 resume。
- Battle Frame 每次创建新的 Builder / Handler / Runtime。
- close / abort / failure 后不残留 scheduler、resource listener 或 controls consumer。
- 验证 `initialHp` 省略时仍默认 `maxHp`，显式传入时保留受损初值且不改变 maxHp。
- 验证正常退出时 final HP 0 → persisted Integrity 1；正数原样保存；双向结算原子提交。
- 验证 BattleResult 在 1 HP settlement floor 之前确定；simultaneous_defeat 仍然是平局。
- 验证下一场 Battle 从上场持久化 Integrity 初始化双方 HP。

### 12.3 Map child-Frame integration：Map 4 序章链

沿用 dialogue-gameplay-vertical-slice 的测试风格：

- prologue=lab-tutorial 时，Professor interaction 调用 professor-vertical-slice；ready 才提交 rival-ready 并刷新 Map scene；not-yet / cancelled 不推进。
- 教学 Dialogue 正常返回后，Map 恢复 fresh Controls activation，回到普通 NPC interaction loop；不自动触发 Rival。
- prologue=rival-ready 时，Rival interaction 调用 lab-rival-intro；deferred / cancelled 不交换、不启动 Battle。
- Rival accepted 后，Map 先确认双向 Contract / Card transaction，再连续调用 Battle；Battle 期间 Map controls 保持关闭。
- Battle ally_win / enemy_win / simultaneous_defeat 分别只调用对应 post-battle Dialogue key。
- Battle cancelled / failure 不得调用任何正常 post-battle branch。
- Battle `host-background` pause：foreground 后只弹出一次“继续战斗 / 退出战斗” Message；继续才 resume，退出走 cancelled。
- Battle `decision-circuit` pause：弹出一次“重试决策 / 退出战斗” Message；重试才 resume，退出走 cancelled。
- 已经 paused/decision-circuit 时再发生 background 不覆盖 reason、不叠第二个 Message；任何 foreground 事件都不得自动 resume。
- 只有 Battle normal result 与双向 Integrity settlement 都确认后，才允许启动战后 Dialogue。
- 战后 Dialogue 正常完成并提交 after-battle 后刷新 Map scene，再恢复 fresh Controls activation，回到普通 NPC interaction loop。
- prologue=after-battle 时，玩家再次与 Professor interaction，调用 professor-first-journey；accept 才提交 prologue-to-route，not-yet 不推进。
- 两份 Relationship Contract Integrity 通过同一个 Shared State transaction 原子提交；conflict / outcome unknown 不得造成单边更新或提前播放战后 Dialogue。
- Map controls 在 Rival accepted 后的 Dialogue → Battle → result Dialogue 连续序列期间始终关闭；三个独立 NPC interaction 之间允许正常恢复 Map controls。
- south / start 的重复输入不会重复发起同一 interaction 或重复创建 child Frame。
- Map terminal、Frame abort 和任一 child failure 不会产生双重恢复、重复 child call 或残留 controls Consumer。
- Map Handler 仍是原来的 session，不重建地图或重置玩家位置。

后续 Map 5 road-bandit 另建 Encounter / 本体参战测试，不混入本条首要 vertical slice。

### 12.4 Browser / Product qualification

- Battle browser JS/CSS 通过统一 Presentation sync script 进入 FSDB。
- Browser E2E 验证 Map 4 研究所、rival / player 两个 Manifestation、移动、技能效果、双方 HP、BattleResult 和结果对应的战后 Dialogue。
- PWA / Chromium 验证真实 Worker / Presentation 资源路径，并证明 prepared content 包含完整 PokeMan FSDB 与 battle browser assets；不得继续使用 map-only closure。
- Desktop / Hostra 验证 launch manifest、Frame lifecycle、provider transport 和 Browser assets。
- 在同一宿主内重复启动 / 退出 Battle Runtime，验证资源和 listener 正确释放。
- 在真实 DeepSeek qualification 中验证双方 Decision 请求、合法 PlanSubmission、Decision failure 与 circuit pause；circuit 与 Host background 都必须通过 Message 由玩家手动恢复，foreground 不得自动 resume；玩家手动指导不属于本阶段验收。
- 验证进程中断后的 Battle / Dialogue 恢复不在本阶段；它留到 Save / Load 设计阶段。
- Map 5 road-bandit 的 Browser / Product qualification 单独安排在 P6，不与 Map 4 教学链混合。

未运行的真实 PWA、Desktop、Hostra 或 DeepSeek 测试不得用 unit / Mock 结果代替。

### 12.5 PWA Content packaging — MVP FROZEN

当前 `prepare-pwa-content.mjs` 的 map-only dependency closure 不再满足 Story / Dialogue / Battle vertical slice。MVP 不设计复杂的按引用裁剪算法，固定采用“PokeMan FSDB 全量 + Presentation refs”策略：

1. `listFsdbEntries()` 返回的 `[FSDB]PokeMan` 全部 content entries 都进入 prepared PWA content；不再根据 initial Map / MapTransfer / MAP_ONLY_NPC_PLACEMENTS 选择子集。
2. 保持 `mapFsdbEntryToPwaIdentity()` 的 identity 映射、唯一性检查和 deterministic sort。
3. `presentation.json` 中声明的外部 `Presentation` resource refs 仍全部加入，包括 schema-form、controls、map、dialogue、battle 与 page browser assets。
4. PWA executable modules 必须包含 `base / map / dialogue / battle / message`；`game.json` 与 `launch.pwa.json` 同步声明 battle 与 message subsystem。Battle pause prompt 使用统一 Message Frame，不在 Battle Presentation 内私造第二套模态 UI。
5. Content / Builder validator 在 packaging 前负责发现坏引用或坏 schema；packager 不通过“没有选中该 record”来隐藏无效 Content。
6. MVP 阶段不做 tree-shaking / dependency closure optimization。等 Content 体量真正成为问题后再独立设计，不阻塞当前闭环。

因此 StoryIndex、Dialogue、Event、EventStateMutation、BattleActor、BattleSkill、BattleEffect、BattleArena、Character、NPC、Map/Tileset 及相关 Graphics 都会可靠进入 PWA，不存在 Runtime 动态解析到某个合法 record 但包内缺失的问题。

## 13. 实施顺序

建议分成以下可独立验收的阶段：

| 阶段 | 内容 | 通过标准 |
| --- | --- | --- |
| P0 — Contract / lifecycle baseline | 冻结 `initialHp`、独立 `BattleArena`、Relationship 默认值、Base baseline bootstrap、1 HP 最低持久化、双向 OCC settlement、result Dialogue confirmation、两类 pauseReason 手动恢复与 PWA full-content packaging | 实现 agent 不需要再决定默认关系、bootstrap owner、结果确认 UI、pause UX、Map passability 或 PWA dependency closure |
| P1 — Core input + Content | Battle Core 实现 `ResolvedBattleActor.initialHp`、`BattleArenaRef` / Presentation loading 与 CTRL-002 `pauseReason / onPause`；PokeMan 新增 `struct.BattleArena/lab-tutorial`，修正 Grab range、BattleEffect schema / Record / Graphics 与 Browser artifact sync | Core / Content validator 通过；两类 pause reason 可观察且不会自动 resume；Arena 不依赖 struct.Map；旧 initialHp caller 省略字段仍默认 maxHp |
| P2 — Headless composition | 新建 Battle Subsystem、双向 Contract Resolver、FakeClock、ScriptDecision composition | 不启动 Browser 即可运行确定性 1v1；验证 initialHp、1 HP floor 与双向原子结算 |
| P3 — Map 4 prologue vertical slice | Map 4 Professor → rival Dialogue → Battle → result-specific post-battle Dialogue；Map controls 整链暂停与最终 fresh resume | 三种 BattleResult 分支正确；settlement 后才触发 Dialogue；取消 / failure 不误触发剧情 |
| P4 — DeepSeek transport | 从 SessionConfig 构造 PokeMan-private transport，接入双方 DeepSeekDecision | PWA / Hostra 的真实 provider request 可观察且可取消；AI vs AI 正常运行 |
| P5 — Product qualification | Browser / PWA / Desktop / Host lifecycle / failure / replay | PWA 使用全量 PokeMan FSDB packaging；Battle 无独立 result acknowledgement；background / decision-circuit 两类 pause 都经 Message 手动恢复；真实宿主端到端证据完整 |
| P6 — Map 5 Encounter follow-up | road-bandit visible Encounter / 本体参战 / Encounter source | 与 Map 4 教学链分离，证明普通 NPC 本体可进入同一 Battle Runtime |

Save / Load 和进程中断后的结果恢复不属于上述阶段；它们留到未来存档设计阶段。当前阶段只验收同一运行期间的 Battle terminal → bilateral settlement → result Dialogue 正常流程。

## 14. 明确非目标

本轮不做：

- PlayerGuidance、手动提交战术 Plan 或 Battle 内玩家操控。
- 多 Actor / 2v2 / 多张随身卡选择。
- Map 5 通用 Encounter generation、随机 spawn / defeated persistence；road-bandit 是后续单独阶段。
- 通用 Story Graph / Story Subsystem；当前只由 Map 编排固定序章链。
- 完整 Relationship / Contract 建立剧情以外的 Card 管理 UI。
- Save / Load、跨进程中断恢复，以及“Battle 已结算但战后 Dialogue 尚未完成”的恢复 / 去重机制；这些与未来存档设计一起确定。
- 跨 Session credential persistence。
- 通用 Framework credential / network capability。
- 修改 Battle movement / skill / damage / LOS 等 Core gameplay rules；本阶段继续沿用 Core 已有的无最大时长 / 无正式 stalemate 规则，不增加强制结束逻辑。
- 为 PokeMan 复制 Battle Simulation、Decision 或 Browser Renderer。
- 把 Map Runtime timer / movement / Browser completion 复用为 Battle authority。
- 让 Dialogue 直接调用 Battle，或让 Battle 直接调用战后 Dialogue。
- 让 Map 自己写入单边 Contract Integrity，或按 Tick 持久化 HP。

## 15. 参考文档

PokeMan：

- [30-battle.md](./30-battle.md) — Battle、Contract Integrity、1v1 与长期产品语义。
- [40-encounter-loop.md](./40-encounter-loop.md) — Visible Encounter、Hostile / Challenge 与 Map 回流。
- [50-mvp-prologue.md](./50-mvp-prologue.md) — 序章地图绑定与第一次 Battle。
- [66-data-authority.md](./66-data-authority.md) — Content / Shared State / Runtime Memory authority。
- [67-shared-state-records.md](./67-shared-state-records.md) — Relationship / Contract / CarriedCards 物理 Record。
- [76-deepseek-session-configuration.md](./76-deepseek-session-configuration.md) — Session credential 与 PokeMan-private DeepSeek Transport 边界。
- [73-dialogue-gameplay-vertical-slice.md](./73-dialogue-gameplay-vertical-slice.md) — Map child Frame / controls activation 参考实现。
- [78-prologue-dialogue-content.md](./78-prologue-dialogue-content.md) — Map 4 序章的博士玩法科普、劲敌双向卡片交换、三种 Battle 结果确认对白与业务边界。
- [80-battle-scenario-design.md](./80-battle-scenario-design.md) — 首场互换角色卡的 actor/team/holder 映射、BattleActor / Contract / Skill 参数、BattleConfig 建议值与实现缺口。

Battle：

- [BATTLE_V0_INTEGRATION.md](../../../game-libs/battle/docs/BATTLE_V0_INTEGRATION.md)
- [BATTLE_V0_CONTRACTS.md](../../../game-libs/battle/docs/BATTLE_V0_CONTRACTS.md)
- [BATTLE_V0_SIMULATION.md](../../../game-libs/battle/docs/BATTLE_V0_SIMULATION.md)
- [BATTLE_V0_DECISION.md](../../../game-libs/battle/docs/BATTLE_V0_DECISION.md)
- [BATTLE_V0_PRESENTATION.md](../../../game-libs/battle/docs/BATTLE_V0_PRESENTATION.md)
