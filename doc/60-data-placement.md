# 数据落点

> 独立技术设计记录。不改写 `../DESIGN.md`。本文只定义 Content / Shared State / Runtime Memory 的 authority 边界；Shared State 物理结构见 [67-shared-state-records.md](./67-shared-state-records.md)，Content FSDB 物理结构见 [68-content-fsdb.md](./68-content-fsdb.md)。

## 三处归宿

| 归宿 | 是什么 | 这一局会不会变 |
| --- | --- | --- |
| Content | 安装包里的只读定义、剧情内容、派生索引与资源 | 不会 |
| Shared State | 这一局里跨 Subsystem 共享的可变业务事实 | 会 |
| Runtime Memory | 当前 Subsystem / Frame / Battle / Map 的运行工作集 | 会，但不是跨模块长期 authority |

基本判断：

- 所有新游戏安装后都相同的规则、角色定义、剧情定义和资源，放 Content。
- 这一局已经发生并且需要跨 Subsystem 共享的业务事实，放 Shared State。
- 当前某个 Subsystem 自己正在执行的 live 状态，留在该 Subsystem Runtime Memory。
- 能由 Content + 最小 Shared State 事实稳定重建的派生结果，不为了方便重复存一份 State。
- 某个玩法“未来可能需要持久化”本身不是提前建立 Shared State shape 的理由。

需要特别避免一个常见误区：

```text
可存档
!= 一定属于 Shared State live authority
```

Shared State 的首要判断是 **session-level shared mutable business fact**，而不是“以后会不会写进存档文件”。Save / Load 可以把某个 Runtime 当前值投影成 durable checkpoint，但不能因此建立两个并行 live authority。

# Content

PokeMan 当前主要 Content：

```text
Content
├─ struct.Character
│  ├─ name / description / fixed AI text
│  ├─ stable base BattleActor ContentRef
│  └─ default scene definitions
├─ struct.NPC                         # @loomrealm-game/map contract
│  └─ name + resource.Graphics sprite
├─ struct.BattleActor                 # @loomrealm-game/battle contract
├─ struct.BattleSkill                 # @loomrealm-game/battle contract
├─ struct.BattleEffect                # @loomrealm-game/battle presentation contract
├─ struct.Dialogue
├─ struct.Event
├─ struct.EventStateMutation
├─ struct.Encounter
├─ struct.StoryIndex                  # Builder generated
├─ Map Content
└─ resource.*
```

PokeMan 自有 Content 直接按 FSDB 组织。详细规则见 [68-content-fsdb.md](./68-content-fsdb.md)：

- `struct` record 的 FSDB key 就是 identity；PokeMan 自有 source 不重复保存 `id`；
- 固定目标 PokeMan table 的引用只保存 key；
- battle 模块现有 contract 在 PokeMan Game Package 中具体绑定为 `struct.BattleActor / struct.BattleSkill / struct.BattleEffect`，不复制第二套 Battle schema；
- `battleActor` 继续使用 ContentRef shape，但 MVP `namespace` 固定为 `struct.BattleActor`；
- BattleSkill identity 直接复用 battle 模块既有的 `id / skillId: string`；
- `resource` key 可以有 `Characters/Mage` 这样的层级路径，`struct` key 不靠子目录形成层级；
- `mapId` 业务值统一是正 safe integer；JSON object / FSDB key 中使用其十进制字符串形式；所有 authored map references 必须对应存在的 `struct.Map`。

MVP 玩家身份固定为：

```text
struct.Character / player
```

不另建 `playerCharacterId` State authority。

## Character / NPC / BattleActor

```text
Character
= 谁

NPC Definition
= 地图上怎么表现

NPC Instance
= 当前场景里这一次具体出现

BattleActor
= Battle package 的静态战斗定义
```

持久 Character 稳定引用一个基础 BattleActor：

```text
Persistent Character
→ Character.battleActor
→ struct.BattleActor
→ base BattleActor
```

同一 Character 的不同 NPC Definition / NPC Instance 可以换地图表现、服装和位置，但不改变基础 BattleActor identity。

transient Encounter / Story NPC 没有持久 Character 时，可以由 Encounter / Event 静态 source 直接引用基础 BattleActor：

```text
Transient NPC Instance
→ Encounter / Story static source
→ struct.BattleActor
→ base BattleActor
```

PokeMan 不建立 NPC Instance 专属 Battle profile / variant / resolved battle data authority。

Battle 静态引用链固定为：

```text
struct.BattleActor
→ skills[]
→ struct.BattleSkill
→ effect
→ struct.BattleEffect
```

建立 Contract 时：

```text
目标 NPC Instance
↓ resolve base BattleActor
BattleActor
├─ max_hp
└─ skills[]              # BattleSkill id string[]
↓
Relationship.contract
├─ integrity = BattleActor.max_hp
└─ skills[] = copy(BattleActor.skills[])
```

`Relationship.contract.skills[]` 直接复用 battle 模块的 BattleSkill id string，不建立第二套 Skill reference。

Contract Integrity 上限同样来自 `BattleActor.max_hp`，不额外保存 `maxIntegrity`。

## Dialogue

固定 Dialogue 是 Content：

```text
struct.Dialogue
├─ speakerName?
├─ lines[]
│  ├─ speaker? → Character key
│  └─ text
├─ choices?[]
│  ├─ text
│  └─ target → Dialogue key
└─ mutation? → EventStateMutation key
```

固定规则：

```text
Line.speaker 存在
→ 持久 Character

Line.speaker 不存在 + speakerName 存在
→ transient/default display name

两者都没有
→ narration
```

`choices` 与 `mutation` 互斥，允许两者都不存在。Choice 只跳到另一个 Dialogue；需要改变 Event state 的分支跳到新的 terminal Dialogue，再由那个 Dialogue 引用 EventStateMutation。

Dialogue.mutation 只表示 Event state 变化，不创建 Contract / Card / Relationship。

## Event / EventStateMutation

Event 是剧情阶段及其当前场景 / 交互定义：

```text
struct.Event/<eventId>
└─ states
   └─ <stateId>
      └─ maps
         └─ <mapId>
            └─ npcs
               └─ <npcId>
                  ├─ character?
                  ├─ placement XOR absent:true
                  ├─ battleActor?        # 仅 transient Story NPC
                  └─ interaction?
                     └─ dialogue
```

`absent:true` 只在明确 `character` 时合法，并且不得同时带 `placement / battleActor / interaction`；不额外建立另一套 absent/takeover 数据结构。

EventStateMutation：

```text
struct.EventStateMutation/<mutationId>
├─ from
│  └─ eventId → stateId | null
└─ to
   └─ eventId → stateId | null
```

当前物理规则：

- `from` 可以是 `{}`；
- `to` 至少有一个成员；
- `null` 表示逻辑 Event 空状态；
- EventStateMutation 只改变 Event current state；
- 不增加 trigger / action / command / generic state path mutation；
- 不要求 schema 证明 `from / to` 在任何执行上下文下一定造成值变化。

## Encounter

Encounter 是 Content，但 re-entry / defeated persistence 等是 Runtime / gameplay policy。

```text
struct.Encounter/<decimal-mapId>
├─ count
├─ spawnPoints[]
└─ templates
   └─ <templateId>
      ├─ weight
      ├─ npc → struct.NPC
      ├─ engagement
      ├─ dialogue? → struct.Dialogue
      └─ battleActor → struct.BattleActor ContentRef
```

固定：

```text
count
→ positive safe integer
→ count <= spawnPoints.length
→ count <= number of templates

weight
→ positive safe integer

spawnPoints
→ (x,y) 在同一 Encounter record 内不重复

templates
→ template.npc 在同一 Encounter record 内唯一
→ 每次 generation 对 template 做加权、不放回选择
```

`count` 表示每次生成几个 Encounter NPC；`weight` 表示 template 之间的相对选择权重。数据只固定“不放回”的合法结果语义，不规定具体 weighted sampling 实现。

这样单个 Encounter record 自身不会因为重复抽到同一 template 产生重复 `npcId`；与其他 Character / Event / Story source 合并后的最终同 Map `npcId` 冲突仍 deterministic reject。

以下不作为当前 Content 数据字段预先设计：

```text
seed
weighted-sampling concrete algorithm
spawn selection algorithm
re-entry reroll
respawn
defeated persistence
```

这些默认属于 Runtime / gameplay policy；只有以后产品明确要求“作者可配置”时才重新进入 Content 设计。

## StoryIndex

StoryIndex 是 Builder-generated Content：

```text
struct.StoryIndex/current
├─ byMap
├─ byCharacter
└─ byEvent
```

它用于避免 Runtime 为查询当前 Map 剧情 source 扫描所有 Character / Event。它不是业务 authority，可以从源 Content 重建。

StoryIndex 的精确派生字段可以跟随 Resolver 实现调整；这属于 generated read model 的实现细节，不作为 MVP 核心业务数据缺口。

# Shared State

Shared State 的 canonical physical records 已冻结在 [67-shared-state-records.md](./67-shared-state-records.md)：

```text
pokeman.PlayerWorld / current
→ durable resume/checkpoint { mapId, x, y, direction }

pokeman.EventStateList / current
→ [{ eventId, stateId }]

pokeman.Relationship / <from>:<to>
→ { affinity, hostile, relationshipText, contract? }

pokeman.CarriedCards / <holder>
→ [{ slot, servantCharacterId }]
```

## durable PlayerWorld checkpoint

`pokeman.PlayerWorld/current` 保存的是 **恢复位置**，不是 live player pose。

```text
live player map / position / direction / motion
→ Map Runtime

explicit durable resume/checkpoint
→ Shared State
```

`PlayerWorld.mapId` 是正 safe integer，并且必须对应存在的 `struct.Map`。

## EventStateList

```text
有 entry
→ current state = entry.stateId

无 entry
→ current state = null
```

Shared State 不保存 `{ stateId:null }` 项。

Mutation 执行时读取 EventStateList + version，校验全部 `from`，在内存生成新列表，再一次 commit 替换整个 Record。

## Relationship / Contract

```text
Relationship(A → B)
├─ affinity
├─ hostile
├─ relationshipText
└─ contract?
   ├─ integrity
   └─ skills[]
```

Relationship 可以存在而 Contract 不存在。存在 `contract` 才表示正式契约成立。

Contract 不建立独立 Shared State authority。

跨 Content 固定：

```text
Relationship A:B exists
→ struct.Character/A exists
→ struct.Character/B exists

contract.integrity
→ 0..B base BattleActor.max_hp

contract.skills[]
→ existing struct.BattleSkill ids
```

## CarriedCards

```text
pokeman.CarriedCards / <holder>
→ [{ slot, servantCharacterId }]
```

Card 只表示已成立契约当前是否进入随身编队。它不保存 Integrity、skills、BattleActor、人格或其他静态数据。

MVP 不建立 `cardId`。

固定 invariant：

```text
CarriedCards(A) contains B
→ struct.Character/A exists
→ struct.Character/B exists
→ Relationship(A → B).contract exists
```

## Record-level absence

Shared State v1 允许 Record 从未 materialize；PokeMan 对四类核心 Record 的业务解释已经冻结：

```text
PlayerWorld/current absent
→ invalid PokeMan State
→ baseline 必须提供

EventStateList/current absent
→ invalid PokeMan State
→ baseline 必须提供
→ 没有 active Event 用 []

Relationship/A:B absent
→ 没有持久化这段 Relationship

CarriedCards/A absent
→ 业务值 []
→ 与 materialized [] 在当前编队业务上等价
```

因此不需要为了“空编队”给所有 Character 预先创建空 `CarriedCards` Record。

# Runtime Memory

## Map Runtime live authority

```text
Map Runtime
├─ current mapId
├─ player x / y
├─ direction
├─ motion
├─ current scene
└─ current NPCPlacement[]
```

这些 live facts 由 Map Runtime authority 拥有。

如果产品需要 Save / Load 恢复位置，只在明确 checkpoint / save workflow 中把当前位置投影到 `pokeman.PlayerWorld/current`。

## NPC Instance / Story Resolver

```text
Content
+ EventStateList
↓
Story Resolver
↓
World-side NPC Instance
├─ instanceId
├─ npcId
├─ characterId? / source context
├─ x / y / direction / pattern
└─ base BattleActor resolution path
↓
@loomrealm-game/map NPCPlacement[]
```

`instanceId` 不保存到 Character / Event source Content。

最终每张 Map 仍要求：

```text
npcId unique
```

不同 source 在同一 Map 产生同一 `npcId` 是 deterministic conflict，不做 last-wins。

## Dialogue Runtime

```text
current dialogue id
current line index
pending choice interaction
terminalDialogueId completion result
```

这些是当前调用工作状态，不进入 Shared State。

## Battle Runtime

Battle Simulation 自己拥有：

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

Card Battle 开始时由：

```text
Character → struct.BattleActor
+
Relationship.contract.integrity / skills[]
```

构造 Runtime Actor；结束后只有真正需要长期持续的 Contract Integrity 等结果写回 Shared State。

## Encounter Runtime

当前 generated Encounter set / spawn assignments / transient body state 可以留在 Runtime Memory。

是否重进地图重抽、击败后是否保持消失、何时清空等属于 gameplay Runtime policy，不是当前 Shared State schema gap。

# Authority 对照

| 数据 | Authority |
| --- | --- |
| Character definition | Content |
| NPC definition / sprite | Content |
| BattleActor / BattleSkill / BattleEffect | Content |
| Dialogue / Event / Mutation | Content |
| Encounter definition | Content |
| StoryIndex | generated Content |
| durable resume/checkpoint | Shared State |
| Event current state | Shared State |
| Relationship / Contract | Shared State |
| current Card party | Shared State |
| live map / player pose | Map Runtime Memory |
| current NPC Instances | World / Map Runtime Memory |
| current Dialogue cursor | Dialogue Runtime Memory |
| current Battle actor state | Battle Runtime Memory |
| current generated Encounter set | Encounter / World Runtime Memory |

一句话：

```text
Content = 这个游戏本来怎么定义
Shared State = 这一局跨系统共享的长期业务事实
Runtime Memory = 当前系统正在执行什么
```

# 当前数据结构状态

经过最终闭环复核，Shared State 核心四类 Record、MVP Content 核心业务 shape、Battle Content FSDB binding 与跨 record referential invariants 都已经收口；当前没有剩余的 MVP 核心业务 data physical-schema gap。

把冻结 shape 写成各 FSDB table 的 exact `.info.meta` / schema、Builder validator，以及 Runtime 随机/加载/保存逻辑，属于实现工作，不重新算作业务数据模型未决项。

以下不是当前 data physical-schema gap：

```text
Battle Content table / namespace binding
BattleSkill identity / Contract.skills[] encoding
Relationship / Contract Record layout
CarriedCards Record layout / uniqueness constraints
Shared State Record-level absence
EventStateList namespace / key
PlayerWorld mapId type
player Character identity
Dialogue choices / mutation runtime behavior
Event absent 的第二套数据结构
EventStateMutation semantic no-op proof
Encounter count / template weight / duplicate-template semantics
StoryIndex 最终派生字段
本地化 / richer presentation metadata
Encounter seed / re-entry / respawn / defeated persistence
Mutation mismatch / OCC / OUTCOME_UNKNOWN handling
Dialogue / Contract write ordering
non-Dialogue business fact → Mutation Runtime handler
progression / training
Runtime instanceId generation
live player movement control
```