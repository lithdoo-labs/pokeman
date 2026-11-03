# 数据 Authority 清单

> 独立技术设计记录。不改写 `../DESIGN.md`。本文把当前 PokeMan 数据按 **Content / Shared State / Runtime Memory** 三类 authority 统一梳理。Shared State 物理 Record 结构见 [67-shared-state-records.md](./67-shared-state-records.md)，Content FSDB 物理结构见 [68-content-fsdb.md](./68-content-fsdb.md)。

# 三类 Authority

```text
Content
= 这个游戏本来怎么定义
= 安装后只读

Shared State
= 这一局已经形成、需要跨 Subsystem 共享的 mutable business facts

Runtime Memory
= 当前 Subsystem / Frame / Map / Dialogue / Battle 正在执行的 live working set
```

判断顺序：

```text
安装后只读定义？
→ Content

当前某个 Subsystem 的 live execution authority？
→ Runtime Memory

这一局已经发生，而且以后其他 Subsystem 必须继续知道？
→ Shared State

可以由 Content + authoritative State 稳定重建？
→ 不建立新的 authority
```

“将来可能要存档”本身不是把 live Runtime 数据提前复制进 Shared State 的理由。

# Content

Content 回答“游戏原本怎么定义”。

## Character

```text
struct.Character / <characterId>
├─ name
├─ description?
├─ aiCharacterText?
├─ battleActor: ContentRef             # namespace = struct.BattleActor
└─ defaultScenes?
```

MVP 玩家 identity 固定为：

```text
struct.Character / player
```

Character identity 由 FSDB record key 提供；PokeMan source 不重复保存 `id`。

Character 不保存当前 affinity、hostile、Contract、Card 或 Battle Runtime HP。

## NPC / Graphics

```text
struct.NPC / <npcId>
├─ name
└─ sprite → resource.Graphics
```

NPC Definition 表示地图表现模板，不是 Character identity，也不是当前 Map 上的 NPC Instance。

当前不建立独立 `struct.Visual`；地图人物视觉直接通过 `resource.Graphics` 表达。

## BattleActor / BattleSkill / BattleEffect

PokeMan 直接复用 `@loomrealm-game/battle` Content contract，不定义第二套 Battle profile / skill / effect schema。

PokeMan Game Package 只冻结物理绑定：

```text
BattleActor  → struct.BattleActor / <id>
BattleSkill  → struct.BattleSkill / <id>
BattleEffect → struct.BattleEffect / <id>
```

其中 FSDB record key 必须与 package contract value 内 definition `id` 相等。

```text
Persistent Character
→ Character.battleActor
→ struct.BattleActor

Transient Encounter / Story source
→ battleActor ContentRef
→ struct.BattleActor

BattleActor.skills[]
→ struct.BattleSkill keys

BattleSkill.effect
→ struct.BattleEffect key
```

新 Contract 初始化：

```text
integrity = BattleActor.max_hp
skills[]  = copy(BattleActor.skills[])  # BattleSkill id string[]
```

Contract 不保存 `maxIntegrity`，也不建立另一套 Skill reference。

## Dialogue

```text
struct.Dialogue / <dialogueId>
├─ speakerName?
├─ lines[]
│  ├─ speaker? → Character key
│  └─ text
├─ choices?[]
│  └─ target → Dialogue key
└─ mutation? → EventStateMutation key
```

`speakerName` 只是 presentation fallback，不是 Character identity。`choices` 与 `mutation` 互斥，允许两者都不存在。

## Event / EventStateMutation

```text
struct.Event / <eventId>
└─ states.<stateId>.maps.<mapId>.npcs.<npcId>
   ├─ character?
   ├─ placement XOR absent:true
   ├─ battleActor?        # transient Story NPC only
   └─ interaction.dialogue?
```

Event mapId 必须对应存在的 `struct.Map`。transient `battleActor` 存在时必须指向 `struct.BattleActor`。

`absent:true` 必须有 `character`，且不得同时出现 `placement / battleActor / interaction`。

```text
struct.EventStateMutation / <mutationId>
├─ from: eventId → stateId | null
└─ to: eventId → stateId | null
```

Event current state 本身不在 Content，而在 Shared State `EventStateList`。Mutation 只要求 `to` 非空，不增加 semantic no-op proof。

## Encounter

```text
struct.Encounter / <decimal-mapId>
├─ count
├─ spawnPoints[]
└─ templates
   └─ <templateId>
      ├─ weight
      ├─ npc
      ├─ engagement
      ├─ dialogue?
      └─ battleActor → struct.BattleActor ContentRef
```

Encounter record key 必须对应存在的 `struct.Map`。

`count` 和 `weight` 是 authored Content：前者定义每次生成数量，后者定义 template 之间的相对选择权重。

固定数据语义：

```text
count <= spawnPoints.length
count <= number of templates
spawnPoints (x,y) unique
one Encounter record: template.npc unique
generation: weighted selection without replacement by template
```

因此单个 Encounter record 自身不会因为重复抽取同一 template 产生重复 `npcId`。当前某次 Map Enter 实际抽到哪些 template、使用哪些 spawn point，以及 concrete weighted sampling 算法属于 Runtime。

## StoryIndex

```text
struct.StoryIndex / current
├─ byMap
├─ byCharacter
└─ byEvent
```

它是 Builder-generated read model，可由源 Content 重建，不进入 Shared State。精确派生字段是实现细节，不形成新的业务 authority。

# Shared State

Shared State 回答“这一局已经形成哪些跨 Subsystem 的长期业务事实”。物理结构以 `67-shared-state-records.md` 为 canonical source。

## durable PlayerWorld checkpoint

```text
pokeman.PlayerWorld / current
→ { mapId, x, y, direction }
```

这里保存的是 **durable resume/checkpoint location**，不是 live player pose。

```text
live current map / position / direction / motion
→ Map Runtime

explicit saved/checkpoint location
→ pokeman.PlayerWorld/current
```

`mapId` 是正 safe integer，与 Map package identity 一致，并且必须对应存在的 `struct.Map`。

## EventStateList

```text
pokeman.EventStateList / current
→ [{ eventId, stateId }]
```

```text
entry exists → current state = stateId
entry absent → current state = null
```

列表不保存 `stateId:null`。

## Relationship / Contract

```text
pokeman.Relationship / <from>:<to>
→ {
    affinity,
    hostile,
    relationshipText,
    contract?: {
      integrity,
      skills[]
    }
  }
```

进入 Relationship / CarriedCards key 的 Character business id 使用 `[a-z0-9][a-z0-9._-]{0,119}`；Relationship 以 `:` 组合两个 Character id，最大 241 bytes，满足 Shared State v1 key 限制。

`A → B` 与 `B → A` 独立。

Relationship Record 可以存在而 `contract` 缺失。存在 `contract` 才表示正式契约成立。

Contract 嵌在 Relationship 中，不建立独立 Record。

固定跨 Content invariant：

```text
Relationship A:B
→ struct.Character/A exists
→ struct.Character/B exists

contract.integrity
→ 0 <= integrity <= B base BattleActor.max_hp

contract.skills[]
→ existing struct.BattleSkill ids
```

## CarriedCards

```text
pokeman.CarriedCards / <holder>
→ [{ slot, servantCharacterId }]
```

Card 只表示当前随身编队，不保存 Integrity、skills、BattleActor 或 Character 静态资料。

MVP 不建立 `cardId`。

固定跨 Content invariant：

```text
CarriedCards(A) contains B
→ struct.Character/A exists
→ struct.Character/B exists
→ Relationship(A:B).contract exists
```

## Record-level absence

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

# Runtime Memory

Runtime Memory 回答“当前正在执行什么”。

## Frame / Session control

例如：

```text
Frame stack
Activation
Input target
Abort signal
current Menu / Message frame instance
```

这些属于 Main / Frame control plane，不进入 Shared State。

## Map Runtime

live authority：

```text
current mapId
player x / y
direction
motion
scene
current NPCPlacement[]
```

Map Runtime live state 不与 `pokeman.PlayerWorld/current` 双写成两个实时 authority。只有明确 save/checkpoint workflow 才把当前位置投影成 durable resume point。

## Story Resolver / NPC Instance

```text
Content
+ EventStateList
↓
Story Resolver
↓
World-side NPC Instances
├─ instanceId
├─ npcId
├─ characterId? / source context
└─ placement
```

这些当前场景实例是 Runtime projection。

## Dialogue Runtime

```text
current dialogue id
current line index
pending choice
terminalDialogueId completion result
```

不进入 Shared State。

## Battle Runtime

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

Battle 完成以后，只有需要长期持续的 Contract Integrity 等结果写回 Shared State。

## Encounter Runtime

```text
current generated Encounter set
spawn assignments
transient body battle state
```

re-entry reroll、defeated 是否保持消失、何时清理生成结果等属于 Runtime / gameplay policy。只有真实 policy 需要长期共享事实时，再设计最小 State。

# Derived / read model 不是第四 authority

以下数据可以存在，但不形成新的业务 authority：

```text
StoryIndex
Renderer current replica
UI view model
Center "managed cards" view
resolved Map scene projection
```

它们都应能追溯到已有 Content / Shared State / Runtime authority。

# Authority 对照

| 数据 | Authority |
| --- | --- |
| Character definition | Content |
| NPC definition / sprite | Content |
| BattleActor / BattleSkill / BattleEffect | Content |
| Dialogue / Event / Mutation | Content |
| Encounter definition | Content |
| StoryIndex | generated Content / read model |
| durable resume/checkpoint | Shared State |
| Event current state | Shared State |
| Relationship / Contract | Shared State |
| current carried Card party | Shared State |
| live map / player pose | Map Runtime |
| current NPC Instances | World / Map Runtime |
| current Dialogue cursor | Dialogue Runtime |
| current Battle actor state | Battle Runtime |
| current generated Encounter set | Encounter / World Runtime |

# 当前冻结结论

```text
Content
= immutable installation definitions
= PokeMan FSDB shape / battle binding / reference graph in 68-content-fsdb.md

Shared State
= cross-Subsystem mutable business facts
= physical records / referential invariants in 67-shared-state-records.md

Runtime Memory
= current live execution authority
```

特别固定：

```text
MVP player identity → struct.Character/player

live player pose → Map Runtime
PlayerWorld Shared State → durable resume/checkpoint only

NPC Instance → Runtime
Event / Character scene source → Content

BattleActor / BattleSkill / BattleEffect → Content
Battle live state → Battle Runtime
Contract integrity / skills → Shared State

Dialogue cursor → Runtime
Dialogue definition / Mutation definition → Content

Encounter count / template weight / unique template.npc → Content
weighted selection without replacement → generation semantic
actual generated Encounter set → Runtime
```

当前 MVP 核心业务数据 physical schema 与跨 record reference graph 已经收口。`.info.meta`、Builder validator、concrete random algorithm、Save / Load、Encounter persistence、future progression 等属于实现或后续产品设计，不建立额外通用 State bag。