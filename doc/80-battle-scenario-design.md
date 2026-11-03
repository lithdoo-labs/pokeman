# PokeMan 首场互换角色卡 Battle 场景与参数设计

> 状态：**Implemented + Tested + Scenario Qualified**
>
> 范围：冻结 Map 4 研究所首场双向角色卡教学 Battle 的参战身份、参数来源、技能数值、场景配置与结算规则。
>
> 本文沿用 Battle v0 gameplay rules，并冻结两项窄范围 Core / Content 输入扩展：`ResolvedBattleActor.initialHp` 与独立 `BattleArena`。BattleArena 不读取探索 Map Content，只复用已有 Tileset / Autotile / Graphics 视觉素材；目标契约见 Battle Core Spec / Contracts / Simulation / Presentation 文档。所有标为“建议初值”的参数必须经过 ScriptDecision / FakeClock 确定性测试和产品试玩后，才能转为产品冻结值。

关联文档：

- [30-battle.md](./30-battle.md)：Battle 产品语义、Contract Integrity 与长期方向。
- [67-shared-state-records.md](./67-shared-state-records.md)：Relationship / Contract / CarriedCards authority。
- [68-content-fsdb.md](./68-content-fsdb.md)：Character / BattleActor / BattleSkill / BattleEffect Content binding。
- [77-battle-integration-v1.md](./77-battle-integration-v1.md)：Battle Subsystem 与 Map Frame Handler 集成。
- [79-story-dialogue-event-integration.md](./79-story-dialogue-event-integration.md)：Map 4 序章 Event / NPC interaction。
- Battle Core：[BATTLE_V0_SPEC.md](../../../game-libs/battle/docs/BATTLE_V0_SPEC.md)、[BATTLE_V0_CONTRACTS.md](../../../game-libs/battle/docs/BATTLE_V0_CONTRACTS.md)、[BATTLE_V0_SIMULATION.md](../../../game-libs/battle/docs/BATTLE_V0_SIMULATION.md)、[BATTLE_V0_DECISION.md](../../../game-libs/battle/docs/BATTLE_V0_DECISION.md)。

## 1. 首场 Battle 的角色身份

### 1.1 互换的是角色卡，不是角色本体

本场 Battle 必须严格区分：

- Character：世界中真实存在的人物。
- Card：holder 当前携带的 servant Character 身份；Card 本身没有独立 Record。
- Contract：holder → servant 的有向 Relationship 中保存的长期契约状态。
- Battle Manifestation：由 servant 的基础 BattleActor、该方向 Contract 和本场 Battle placement 解析出来的临时参战单位。

固定关系：

~~~text
CarriedCards(holder)
  → servantCharacterId

Relationship(holder → servant)
  → contract.integrity
  → contract.skills[]

Character(servant)
  → Character.battleActor
  → struct.BattleActor

BattleActor + Contract + placement
  → ResolvedBattleActor
  → Battle Manifestation
~~~

Card 不保存 HP、Integrity、skills、BattleActor 或 Character 静态资料。Battle HP 是对应方向 Contract 的 Integrity，不是角色本体生命值。

### 1.2 Map 4 首场 1v1 roster

| Battle actorId | Team | 显现角色 | 卡片持有人 | Contract authority | 基础 BattleActor |
| --- | --- | --- | --- | --- | --- |
| rival | ally | 宿敌显现体 | player | Relationship(player → rival) | BattleActor/rival |
| player | enemy | 主角显现体 | rival | Relationship(rival → player) | BattleActor/player |

因此：

- 玩家阵营使用宿敌卡；宿敌显现体的 actorId 是 rival，team 是 ally。
- 劲敌阵营使用玩家卡；主角显现体的 actorId 是 player，team 是 enemy。
- actorId 表示显现角色身份；team 表示本场阵营。二者不能互相推导。
- actors collection 的数组顺序不代表 ally / enemy，也不代表先手顺序。
- Battle v0 固定恰好两个 Actor：一个 ally、一个 enemy。

本场不参战的角色：

| 角色 | 本场职责 | 原因 |
| --- | --- | --- |
| Professor | 观察者、讲解者、战后结果对白 | 不持有本场参战 Contract Manifestation |
| Road Bandit | 不进入本场 | 属于 Map 5 后续本体 Encounter |
| rival / player 本体 | 留在世界场景中 | 参战的是他们各自的角色卡显现体 |

### 1.3 两份 Contract 的方向不可颠倒

玩家持有宿敌卡：

~~~text
pokeman.CarriedCards / player
  [{ slot: 0, servantCharacterId: "rival" }]

pokeman.Relationship / player:rival
  contract.integrity
  contract.skills[]
  → ally / actorId = rival
~~~

宿敌持有玩家卡：

~~~text
pokeman.CarriedCards / rival
  [{ slot: 0, servantCharacterId: "player" }]

pokeman.Relationship / rival:player
  contract.integrity
  contract.skills[]
  → enemy / actorId = player
~~~

两条 Relationship 是两个独立 authority。不能把 Relationship(player → rival) 的 Contract 同时用于双方，也不能把两份 Contract 合并成一份“交换记录”。

只有双向 Contract / Card transaction 已原子提交，且双方引用都通过验证，才允许构造 Battle。

## 2. 参数 Authority：每类参数应该放在哪里

| 参数类别 | 唯一来源 | 说明 |
| --- | --- | --- |
| Character identity / name / personality text | struct.Character | 世界人物身份与叙事资料 |
| BattleActor max_hp / baseline skills / character graphics | struct.BattleActor | 稳定基础战斗定义 |
| 当前 HP / Integrity | Relationship(holder → servant).contract.integrity | 长期有向 Contract 状态 |
| 当前实际技能列表 | Relationship(holder → servant).contract.skills[] | 建立 Contract 后由 Contract 持有 |
| 单个技能的伤害 / range / windup / recovery | struct.BattleSkill | Battle gameplay 参数 |
| 技能特效资源与显示时长 | struct.BattleEffect | Presentation-only 参数 |
| Battle arena width / height / passable / visual tiles | struct.BattleArena | 独立战斗场地；不从探索 Map 派生 |
| team / tile / direction / moveTicks / protectionTicks / seed | ResolvedBattleDefinition | 本场 Battle 初始化参数；Actor spawn 由 scenario 决定 |
| 实时 HP / tile / action / result | Battle Simulation | 本场唯一 Runtime authority |
| 移动、转向、技能与目标意图 | DecisionPort | 只提交 PlanSubmission，不直接修改 Simulation |

禁止把所有数据堆进 BattleActor。尤其：

- BattleActor.max_hp 是 Contract Integrity 上限，不是本场动态 HP。
- Relationship.contract.integrity 是当前 Contract 状态，不修改 BattleActor.max_hp。
- BattleActor.skills[] 是新 Contract 的 baseline；已有 Contract 的实际技能以 contract.skills[] 为准。
- BattleEffect 只影响视觉，不参与伤害或命中计算。
- Map / Dialogue / Story 不得直接写 Battle HP 或决定技能命中。

## 3. 首场角色基础参数

### 3.1 当前已有 BattleActor

以下数值来自当前 PokeMan FSDB 的实际 BattleActor Content：

| BattleActor | max_hp | baseline skills | Graphics | 本场用途 |
| --- | ---: | --- | --- | --- |
| player | 20 | firebolt | Characters/Player | enemy：劲敌调用的主角显现体 |
| rival | 18 | firebolt、grab | Characters/RivalCasual | ally：玩家调用的宿敌显现体 |
| road-bandit | 12 | grab | Characters/RoadBandit | 后续 Map 5 本体 Encounter |

这里不把 20 / 18 解释为人物本体的生命值。它们是各自基础 BattleActor 对应的 Contract Integrity 上限。

### 3.2 首次 Contract 初始化

新 Contract 的固定初始化规则：

~~~text
Relationship(holder → servant).contract.integrity
  = BattleActor(servant).max_hp

Relationship(holder → servant).contract.skills
  = copy(BattleActor(servant).skills[])
~~~

因此首场新交换完成后，预期数据为：

| Contract | servant | 初始 Integrity / maxHp | 初始 skills |
| --- | --- | ---: | --- |
| player → rival | rival | 18 / 18 | firebolt、grab |
| rival → player | player | 20 / 20 | firebolt |

这组值是当前 BattleActor baseline 的结果，不应在 Map Handler 中再硬编码一份。

### 3.3 已有 Contract 的优先级

如果 Contract 已存在：

- 当前 integrity 必须来自该 Relationship 的 contract.integrity。
- 当前技能必须来自该 Relationship 的 contract.skills[]。
- 不得在每次进入 Battle 时重新复制 BattleActor.skills[] 覆盖已有 Contract。
- 不得把当前 Contract Integrity 反向写成 BattleActor.max_hp。
- Shared State 的结构范围是 `0 <= integrity <= BattleActor.max_hp`；但构造 Battle Manifestation 时必须满足 `1 <= integrity <= maxHp`。
- `integrity = 0` 表示该方向 Contract 当前不能形成 Manifestation；不得启动该 Actor。正常 Battle 结算会把归零的最终 HP 按最低 1 Integrity 保存，因此新流程不会因正常战斗产生持久化 0。
- `maxHp` 永远来自 BattleActor.max_hp；`initialHp` 来自对应 Relationship.contract.integrity。

**Core 输入契约扩展（待实现）：** 为 ResolvedBattleActor 增加可选 `initialHp`。提供时要求 `1 <= initialHp <= maxHp`；省略时继续兼容旧调用，以 `maxHp` 开战。PokeMan 对 Contract-backed Manifestation 必须显式传入 Contract Integrity。不得通过伪造 maxHp 绕过。

## 4. 技能参数设计

### 4.1 当前技能配置

| Skill | 当前使用者 | baseDamage | windup | recovery | 主要定位 |
| --- | --- | ---: | ---: | ---: | --- |
| firebolt | rival、player | 7 | 3 ticks / 600 ms | 2 ticks / 400 ms | 中距离、较慢、稳定输出 |
| grab | rival | 4 | 1 tick / 200 ms | 1 tick / 200 ms | 近身、快速打断压力 |

Tick 固定为 200 ms。windup / recovery 是 Simulation 逻辑时间，不是动画时长。

### 4.2 Firebolt range

当前 firebolt range matrix：

~~~json
[
  [0, 0.5, 0],
  [0, 1.0, 0],
  [0, "↑", 0]
]
~~~

唯一的 ↑ 是施法者位置，矩阵按施法者朝上编写。

效果：

| 目标相对位置 | coefficient | damage 计算 | 最终伤害 |
| --- | ---: | --- | ---: |
| 正前方 1 格 | 1.0 | floor(7 × 1000 / 1000) | 7 |
| 正前方 2 格 | 0.5 | floor(7 × 500 / 1000) | 3 |
| 其他方向 / 矩阵外 | 0 | miss | 0 |

伤害公式由 Battle Core 固定：

~~~text
finalDamage = floor(baseDamage × coefficientUnits / 1000)
~~~

v0 不暗加 minimum 1。0 damage 不触发受击中断或 protection。

Firebolt 前摇 3 ticks，意味着施法开始后 600 ms 才 resolve；前摇期间目标可以移动。resolve 时重新读取双方当前 committed tile 与 caster direction，不追踪起手时的位置：

- 目标仍在 1 格正前方：造成 7。
- 目标移动到 2 格正前方：造成 3。
- 目标离开有效矩阵：miss。
- 目标处于 protection：immune，0 damage。

### 4.3 Grab range：现有 Content 必须修正

当前 FSDB 的 grab.range 是一维 [0, 1, 0]，没有唯一的 ↑ origin marker，不满足 Battle v0 SKILL-001 的 range matrix contract。不得把当前 shape 当成已通过 v0 validator 的内容。

建议修正为单格正前方近身范围：

~~~json
[
  [0, 1.0, 0],
  [0, "↑", 0]
]
~~~

建议保留当前数值：

~~~json
{
  "id": "grab",
  "name": "Grab",
  "damage": 4,
  "timing": {
    "windup_ticks": 1,
    "recovery_ticks": 1
  },
  "range": [
    [0, 1.0, 0],
    [0, "↑", 0]
  ],
  "effect": "grab"
}
~~~

语义：

- 只命中正前方 1 格。
- coefficient = 1.0，基础伤害 4。
- 200 ms windup，200 ms recovery。
- 不具备远距离追踪。
- 受保护目标仍为 immune。
- 宿敌拥有 Grab，主角当前没有 Grab；这是角色基础技能差异，不在 Map Handler 中补技能。

以上 range 修正和 effect id 是待落实的 Content correction，不代表当前 FSDB 已经通过 validator。

### 4.4 命中、免疫与 Miss 不等于随机命中率

Battle v0 当前没有 accuracy / critical / element / armor / MP / ammo / universal cooldown 等字段。

技能结果由以下事实确定：

1. caster 当前 tile；
2. caster 当前 direction；
3. target 当前 committed tile；
4. skill range matrix；
5. target 当前 protection；
6. skill baseDamage 与 range coefficient。

因此不要在 PokeMan 层自行增加命中率百分比、暴击率、护甲减伤或属性克制公式。若未来确实需要这些机制，必须先扩展 Battle Core 的 typed contract 和 deterministic reducer。

## 5. BattleConfig：本场战斗的全局参数

### 5.1 参数表

| 参数 | 首场建议值 | 状态 | 含义 |
| --- | ---: | --- | --- |
| tickDurationMs | 200 ms | Core frozen | 每个逻辑 Tick 的时间 |
| moveTicks | 2 | Scenario proposed | 单格移动需要 2 Tick，即 400 ms |
| protectionTicks | 2 | Scenario proposed | 受击 Tick 后再保护 2 个完整 Tick |
| maxPathSteps | 6 | Core default | 单次 Plan 最多提交 6 个 future path steps |
| battleSeed | battleId | Scenario recommendation | 将唯一 battleId 作为可回放 seed |
| actors.length | 2 | Core frozen | 恰好一个 ally、一个 enemy |
| arena | lab-tutorial | Scenario fixed | 独立 Battle Arena，不引用 Map 4 |
| arena size | 7 × 7 | Scenario fixed | 简单开放式教学场 |
| max battle duration | none | Core frozen / intentionally deferred | 当前验证范围有意不设强制最大时长 |
| stalemate | none | Core frozen / intentionally deferred | 当前验证范围有意不自动判定平局 |

建议初值的理由：

- moveTicks = 2：单格移动为 400 ms；比 600 ms Firebolt 前摇略快，使移动可以成为有效闪避方式。
- protectionTicks = 2：有效受击后仍有短暂保护，避免连续攻击造成无间隔受击锁；同时保护不是永久免疫。
- maxPathSteps = 6：让 Decision 能提交有限短期路径，不等于每次必须移动 6 格，也不等于 6 Tick。
- battleSeed = battleId：同一 Battle 的 contention 可以稳定复现，Replay 不依赖 Math.random()。

当前不设计战斗时长上限或无进展自动结束；这是本阶段有意延后的产品规则，不是当前集成阻塞项。不得在 PokeMan 层另加超时计时器或强制胜负。

protectionTicks = 2 的精确含义：若 Tick 10 受到有效伤害，则 Tick 10 剩余阶段、Tick 11 和 Tick 12 处于保护；Tick 13 恢复可受击。它不是“总共保护 2 Tick”。

moveTicks / protectionTicks 是本场配置参数，不得写入 BattleActor 或 BattleSkill，也不因角色不同而各设一份。若未来需要角色专属移动速度或韧性，应先扩展 Battle Core contract；v0 不做隐式差异。

### 5.2 独立 Battle Arena

首场教学 Battle 不再使用 Map 4 作为 Battle navigation / Presentation map。Map 4 只负责剧情发生地点和 Rival interaction；进入 Battle 后切换到独立 authored arena：

~~~text
Map 4 / Research Lab
  → Rival interaction
  → frame.call("battle", scenarioId = "lab-rival-tutorial")
  → struct.BattleArena / lab-tutorial
~~~

BattleArena 与 RPG Map 的边界固定：

- 不引用 `struct.Map/4`。
- 不读取 RPGMap passability、passages、terrain_tags、bridge、ledge、transfer、NPC collision 或玩家当前 tile。
- 不从 Map Runtime 复制玩家 / Rival 的坐标。
- Arena 自己 author `width / height / passable`。
- Presentation 只复用 `struct.Tileset`、Autotile / Tileset Graphics 的 tile 编码与视觉资源。
- Arena 的 `passable` 是 Battle Simulation authority；视觉 tile 是否看起来像墙不会反向改变通行规则。
- Map 和 Battle Arena 之间没有坐标连续性要求。

BattleArena 目标 Content shape：

~~~ts
type BattleArenaContent = {
  id: string
  width: number
  height: number
  passable: readonly (readonly boolean[])[]
  tileset_id: number
  data: ProjectedTable
}
~~~

其中 `data` 沿用 Map 的 3-layer tile-id 投影格式，仅用于 Battle Presentation；`tileset_id` 只用于定位已有 `struct.Tileset` 与 Tileset / Autotile Graphics，不导入 Map gameplay semantics。

首场 `struct.BattleArena/lab-tutorial` 固定：

- width = 7；
- height = 7；
- passable 全部为 true；
- tileset_id = 3，复用研究所当前使用的 Tileset 视觉素材；
- layer 0 使用研究所已有 floor tile id 624 铺满 7 × 7；
- layer 1 / 2 全部为 0；
- 不包含 Map behaviors、transfer、bridge 或 terrain 规则。

概念布局：

~~~text
.......
.......
.......
.A...E.
.......
.......
.......
~~~

`.` 只是说明该格 Battle-passable；不是从视觉 tile 推导出来的通行结论。

### 5.3 Actor 初始位置

首场 spawn 固定属于 scenario，不读取 Map Runtime pose：

| Actor | tile | direction | 来源 |
| --- | --- | --- | --- |
| rival / ally | (1, 3) | 6 / right | lab-rival-tutorial scenario |
| player / enemy | (5, 3) | 4 / left | lab-rival-tutorial scenario |

要求：

- 两个 tile 必须不同、在 BattleArena bounds 内且 `passable[y][x] === true`。
- 初始 direction 必须为 2 / 4 / 6 / 8。
- Map caller 只传 scenario identity 与 NPC source identity，不传 Battle spawn coordinates。
- Arena / scenario 数据不合法时，在创建 Battle Runtime 前明确拒绝；不得静默搬动 Actor。

### 5.4 ResolvedBattleDefinition 组合示意

`rivalContractIntegrity = Relationship(player → rival).contract.integrity`，`playerContractIntegrity = Relationship(rival → player).contract.integrity`；skills 必须由两份 Contract 解析；Arena width / height / passable 直接来自 `struct.BattleArena/lab-tutorial`：

~~~ts
const definition: ResolvedBattleDefinition = {
  battleId,
  sceneEpoch,
  battleSeed: battleId,
  tickDurationMs: 200,
  moveTicks: 2,
  protectionTicks: 2,
  maxPathSteps: 6,
  map: {
    ref: { arenaId: "lab-tutorial" },
    width: 7,
    height: 7,
    passable: arena.passable,
  },
  actors: [
    {
      actorId: "rival",
      team: "ally",
      tile: { x: 1, y: 3 },
      direction: 6,
      maxHp: 18,
      initialHp: rivalContractIntegrity,
      character: {
        namespace: "resource.Graphics",
        key: "Characters/RivalCasual",
      },
      skills: rivalContractSkills,
    },
    {
      actorId: "player",
      team: "enemy",
      tile: { x: 5, y: 3 },
      direction: 4,
      maxHp: 20,
      initialHp: playerContractIntegrity,
      character: {
        namespace: "resource.Graphics",
        key: "Characters/Player",
      },
      skills: playerContractSkills,
    },
  ],
}
~~~

`initialHp` 与 `BattleArenaRef` 都是本文要求落地的 Core 输入 amendment。`maxHp` 仍保持 BattleActor 基础上限；不得用当前 Integrity 覆盖 maxHp。

## 6. BattleEffect：只定义视觉，不定义战斗规则

BattleSkill.effect 指向 BattleEffect id。BattleEffect 再引用 Graphics resource，并定义 anchor 与视觉 timing。

v0 exact shape：

~~~ts
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
~~~

建议的资源 identity：

| Effect id | Graphics key | 使用技能 |
| --- | --- | --- |
| firebolt | BattleEffects/Firebolt | firebolt |
| grab | BattleEffects/Grab | grab |

建议视觉初值（仍需视觉试玩）：

| Effect | fade_in_ticks | hold_ticks | fade_out_ticks | 总时长 |
| --- | ---: | ---: | ---: | ---: |
| firebolt | 1 | 2 | 1 | 800 ms |
| grab | 1 | 1 | 1 | 600 ms |

视觉 timing = 对应 ticks × 200 ms。它不改变 windup、damage、recovery 或 Skill resolve 时刻。

当前 PokeMan BattleEffect Content 仍是旧 graphics / name / id shape，firebolt Record 也只有 id / name，且当前还没有 BattleEffects Graphics 目录。它们尚未符合 Battle v0 exact contract，必须同步修正 .info.meta、Record 和资源；不能通过放宽 Battle Core validator 解决。

## 7. Decision 与角色性格的当前边界

Battle v0 的 Decision 是每个 Actor 独立请求 PlanSubmission。Simulation 仍是唯一 gameplay authority：

- Decision 可以提交 turn / path / skill intent。
- Simulation 校验 path、skill、target、range、Action lifecycle。
- Simulation 决定何时移动完成、技能何时 resolve、最终伤害和 BattleResult。
- 两个 Actor 都由 DecisionPort 自主决策；真实 provider 集成时，Ally 与 Enemy 都可以使用 DeepSeekDecision。当前采用 AI vs AI 是有意的技术验证范围，用来先验证决策、Simulation、Presentation 和结果结算，不是当前设计缺口。
- PlayerGuidance、玩家手动提交战术 Plan 和角色性格影响决策属于后续玩法阶段，不阻塞本次 Battle Integration。

当前 canonical BattleDecisionContextV0 包含 actorId、team、HP、tile、direction、action、protection、skills、range、map window、recent events 和 constraints；不包含 Character.aiCharacterText、name、Relationship.affinity 或 relationshipText。

所以：

- Character/rival 中已有的 aiCharacterText 目前不会自动进入 Battle Decision。
- 不应宣称首场 v0 Battle 已经实现了“宿敌性格真实影响战斗”。
- PlayerGuidance 仍是未来 capability；不能用一个全局 currentGuidance 或临时 prompt 字符串绕过 Decision contract。
- 未来要实现不同人物的战术风格，应通过 Battle DecisionWorkflow 的 typed、request-scoped extension 设计，并继续让 Simulation 校验所有 Plan。

## 8. 参数调节顺序与平衡验证

不要一次同时修改所有数值。按以下顺序调试：

1. 先验证身份：actorId、team、holder、servant、Relationship key 和 CarriedCards 完全对应。
2. 再验证初始 HP：rival 18 / 18，player 20 / 20；两份 Contract 方向没有颠倒。
3. 验证技能几何：Firebolt 正前方 1 格 / 2 格，Grab 正前方 1 格，其他格必须 miss。
4. 验证数值：Firebolt 造成 7 / 3；Grab 造成 4；受保护目标 immune。
5. 验证时间：Firebolt 600 ms windup / 400 ms recovery；Grab 200 ms / 200 ms；单格移动 400 ms。
6. 验证受击：damaging hit 中断 movement / windup / recovery，获得保护并重新 Decision；immune 和 0 damage 不触发 damaging aftermath。
7. 验证结算：final Snapshot 的 rival HP 写回 player:rival；player HP 写回 rival:player；两边同一 Shared State transaction 原子提交。
8. 最后才调平衡：若玩家阵营过强或过弱，优先调整 BattleSkill 的 damage / range / windup / recovery，或评估 BattleActor max_hp；不要增加 Core 尚不存在的 attack / defense / speed 字段。

必须覆盖的确定性测试：

- Firebolt 在 coefficient 1.0 / 0.5 / 0 时分别造成 7 / 3 / miss。
- Grab 只在正前方 1 格合法，其他格 miss。
- Firebolt windup 中目标移动，resolve 使用目标新位置，不 tracking。
- 受保护目标返回 immune，不扣 Integrity、不刷新保护。
- 两边在同一 instant batch 归零时结果为 simultaneous_defeat。
- BattleResult 必须依据结算前的 final Snapshot 判定；不得先把 0 HP 改成 1 再计算胜负。
- 正常 Battle 退出结算时，每个 Contract-backed Actor 写入 `max(1, finalSnapshot.hp)`；HP > 0 原样保存，HP = 0 保存为 1。
- simultaneous_defeat 时双方 final HP 都为 0，但两份 Contract Integrity 都保存为 1；结果仍然是平局。
- 下一场 Battle 使用保存后的 Contract Integrity 作为 initialHp，同时保留原 maxHp。
- Ally / enemy 的最终 HP 分别写回正确方向的 Contract。
- 任一方向的 OCC conflict 不允许只提交另一方向。
- cancelled / failure 不提交部分 HP，不播放正常胜负对白。

## 9. 当前实现状态与禁止绕过项

| 项目 | 当前事实 / 状态 | 处理规则 |
| --- | --- | --- |
| Core initialHp input | 当前 ResolvedBattleActor 只有 maxHp；目标增加可选 initialHp | 按 Core amendment 实现并验证；PokeMan 显式传 Contract Integrity，旧调用省略时仍默认 maxHp |
| Minimum persisted Integrity | Simulation final HP 可能为 0 | BattleResult 先按原始 Snapshot 判定；正常退出结算写入 `max(1, finalSnapshot.hp)` |
| Grab range | 当前是一维 [0, 1, 0]，缺少 ↑ | 按 SKILL-001 修成合法二维 range matrix |
| BattleEffect schema | 当前仍是旧 graphics/name/id | 按 v0 exact shape 修订 schema、Record 和 Graphics |
| Grab visual | 当前 grab.effect 指向 firebolt | 提供 Grab effect / Graphics，或在视觉资产未就绪前明确记录临时复用，不伪装成独立效果 |
| Character personality | 当前不进入 canonical Decision context；有意留到后续玩法阶段 | 未来通过 typed DecisionWorkflow extension 接入；不是本次集成缺口 |
| PlayerGuidance | 当前有意采用 AI vs AI；玩家战术指导留到后续功能 | 本次不实现，不加入 Map callback 的临时控制通道 |
| Battle duration / stalemate | 当前有意不设强制最大时长或自动平局 | 沿用 Core 现有规则；以后根据实战数据再决定 |
| 多卡 / 多人战 | v0 只有 1v1 | 后续独立扩展，不提前改变 v0 cardinality |

明确禁止：

- 把 player / rival 两个 BattleActor 对调来“匹配”team；team 与 actor identity 是两个维度。
- 把角色本体 HP、NPC 当前状态或 Map Runtime HP 作为 Contract Integrity。
- 用 BattleActor.max_hp = 当前 integrity 伪造 initialHp。
- 在 BattleResult 判定前将 Simulation HP 从 0 改成 1；1 HP 下限只属于正常 Battle 退出时的 Contract settlement。
- 每场 Battle 用 BattleActor.skills 覆盖现有 Contract skills。
- 在 Map Handler 中计算 damage、命中率、暴击、护甲或受击保护。
- 将 BattleEffect 的动画时长用于推迟或提前 Simulation resolve。
- 通过放宽 Battle Core validator 接受无 origin marker 的 Grab range。
- 将教授或 road-bandit 加进首场 1v1，或把 v0 的 2 Actor 扩展成隐式多人战。

## 10. 首场 Battle 的结果与剧情映射

| BattleResult（按原始 final Snapshot） | 胜方 | final HP = 0 的 Contract | 正常退出后持久化 Integrity | 战后 Dialogue |
| --- | --- | --- | --- | --- |
| ally_win | 玩家阵营的 rival Manifestation | rival → player（劲敌持有的主角卡） | rival → player 保存为 1；另一边保存实际剩余 HP | lab-rival-after-ally-win |
| enemy_win | 劲敌阵营的 player Manifestation | player → rival（玩家持有的宿敌卡） | player → rival 保存为 1；另一边保存实际剩余 HP | lab-rival-after-enemy-win |
| simultaneous_defeat | 无 | 两份 Contract | 两份 Contract 都保存为 1 | lab-rival-after-draw |

Battle Subsystem 必须先读取未经归一化的 final Snapshot，并据此保留原始 BattleResult。正常退出 Battle 时，对双方 Contract-backed Actor 分别计算 `persistedIntegrity = max(1, finalSnapshot.hp)`，再将两份 Relationship Contract Integrity 作为一个 Shared State transaction 原子提交。只有 settlement 已确认，Map Frame Handler 才调用对应战后 Dialogue。

1 HP 下限只影响持久化的 Contract Integrity，不修改本场 final Snapshot、BattleResult、Replay 或胜负对白。HP 大于 0 的一方保存实际剩余值；HP 归零的一方保存 1。Contract 和 CarriedCards 均保留，角色本体仍然正常存在。

Battle cancelled / failure 不属于正常胜负结果，不提交本场部分 HP 损耗，不调用上述战后 Dialogue，也不推进 Event。Save / Load、进程中断后从“Battle 已结算但战后 Dialogue 未完成”状态恢复，明确留到未来存档设计阶段，本次不实现恢复凭证或额外状态机。

三种正常结果共用 prologue-battle-resolved，进入 after-battle。
