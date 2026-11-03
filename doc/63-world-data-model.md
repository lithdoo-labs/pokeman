# 世界数据模型

> 独立技术设计记录。不改写 `../DESIGN.md`。本文汇总当前 Character、NPC、Story、Dialogue、Encounter、Relationship、Contract、Card 与 Battle 数据职责。Shared State 物理结构以 [67-shared-state-records.md](./67-shared-state-records.md) 为准；Content FSDB 物理结构以 [68-content-fsdb.md](./68-content-fsdb.md) 为准。

相关文档：

- [数据落点](./60-data-placement.md)
- [人物](./61-character.md)
- [事件](./62-event.md)
- [固定对话](./64-dialogue.md)
- [数据模型图](./65-data-model-diagram.md)
- [数据 Authority 清单](./66-data-authority.md)
- [Shared State Record 设计](./67-shared-state-records.md)
- [Content FSDB 物理模型](./68-content-fsdb.md)

# 当前边界

1. **Character identity 与 Map 表现分离。** Character 不是 NPC；NPC Instance 也不要求对应持久 Character。
2. **PokeMan 自有 struct record identity 直接使用 FSDB key。** Character / Dialogue / Event / EventStateMutation 不在 source value 中重复保存 `id`。
3. **MVP 玩家 identity 固定为 `struct.Character/player`。** 不另建 `playerCharacterId` State authority。
4. **Relationship 保存有向长期关系；Contract 是 Relationship 内可选长期契约状态。** Relationship 可以存在而 Contract 不存在。
5. **Card 与 Relationship / Contract 分离。** Card 只表示当前随身；MVP 不建立 `cardId`。
6. **Battle Runtime 独立。** Battle live state 只由 `@loomrealm-game/battle` Simulation authority 拥有。
7. **PokeMan 不重复定义 BattleActor / BattleSkill / BattleEffect。** PokeMan Game Package 只把 battle contract 绑定到 `struct.BattleActor / struct.BattleSkill / struct.BattleEffect`。
8. **持久 Character 稳定引用一个基础 BattleActor。** 不因不同 NPC Definition / Map / Event 产生 BattleActor variant。
9. **Contract 从基础 BattleActor 初始化。** `integrity = max_hp`，`skills[] = copy(BattleActor.skills[])`，Integrity 上限也来自 `max_hp`。
10. **MVP 不定义 progression / training schema。**
11. **Event 是剧情状态 + scene / interaction definition。** 不扩成通用 Trigger / Action / Command engine。
12. **Event current state 使用一个 EventStateList Shared State Record。** 缺 entry = `null`。
13. **Character default scene 是纯 fallback。** 任一 active Event 提到 Character 后，default 全部退出解析。
14. **EventStateMutation 只拥有 Event state。** Relationship / Contract / Card / Battle 变化由对应业务 Runtime 处理。
15. **Dialogue 只保存线性 lines、末尾 choices 或 terminal mutation。** choices 与 mutation 互斥，但允许两者都不存在。
16. **Transient Dialogue speaker 不创建 Character。** `speakerName` 只是 presentation fallback。
17. **最终 Map scene 每张图 `npcId` 唯一。** 不同 Map 可复用相同 npcId。
18. **Encounter generation 对 template 加权、不放回选择。** 单个 Encounter record 内 template.npc 唯一，从数据层避免重复抽取导致同 Map 重复 npcId。
19. **Encounter re-entry / defeated persistence 是 Runtime policy。** 当前不预设 Encounter persistence State。
20. **live player position 属于 Map Runtime。** `pokeman.PlayerWorld/current` 只保存 durable resume/checkpoint location。

# MVP 序章地图绑定

当前 MVP 把已导入 Map 固定到以下产品场景：

```text
struct.Map/2 → 初始城镇
struct.Map/3 → 玩家家
struct.Map/4 → 博士研究所
struct.Map/5 → 第一条道路
struct.Map/7 → 第一个城镇
struct.Map/8 → 宿敌家
```

这不是第二套 Map identity；业务文档中的“玩家家 / 研究所 / 第一条道路”等场景名直接解释为上述现有 `struct.Map/<mapId>`。

数据引用随之固定：

```text
玩家家 scene / home-family
→ mapId 3

博士、宿敌的研究所序章 scene
→ mapId 4

普通 hostile Visible Encounter
→ mapId 5

route-trainee Challenge
→ mapId 5

第一城镇普通居民 / center-servant
→ mapId 7
```

因此出生镇 Map 2 不承载第一条道路的普通 hostile Encounter；序章 Event 里的研究所场景也不再使用早期占位 mapId 1。

# FSDB Content 总体结构

```text
[FSDB]PokeMan/
├─ [struct]Character/
├─ [struct]NPC/
├─ [struct]BattleActor/
├─ [struct]BattleSkill/
├─ [struct]BattleEffect/
├─ [struct]Dialogue/
├─ [struct]Event/
├─ [struct]EventStateMutation/
├─ [struct]Encounter/
├─ [struct]StoryIndex/
└─ [resource]Graphics/
```

核心 identities：

```text
struct.Character/<characterId>
struct.NPC/<npcId>
struct.BattleActor/<battleActorId>
struct.BattleSkill/<battleSkillId>
struct.BattleEffect/<battleEffectId>
struct.Dialogue/<dialogueId>
struct.Event/<eventId>
struct.EventStateMutation/<mutationId>
struct.Encounter/<decimal-mapId>
struct.StoryIndex/current
```

PokeMan 自有 `struct.*` source value 不重复保存 record identity。BattleActor / BattleSkill / BattleEffect 的 value 继续遵守 battle package contract；PokeMan binding 要求 FSDB record key 与其 definition `id` 相等。

固定目标 PokeMan table 的引用只保存 key；`battleActor` 继续使用 `{namespace,key}` ContentRef，但 MVP `namespace` 固定为 `struct.BattleActor`。BattleSkill identity 不另建 PokeMan reference model，直接沿用 battle 模块的 `id / skillId: string`。

# Content

## Character

```text
struct.Character/<characterId>
├─ name
├─ description?
├─ aiCharacterText?
├─ battleActor: ContentRef             # namespace = struct.BattleActor
└─ defaultScenes?
   └─ <mapId>
      └─ <npcId>
         ├─ placement
         └─ interaction?
            └─ dialogue
```

MVP 必须存在：

```text
struct.Character/player
```

Character 不保存 affinity、hostile、Contract、Card、Battle HP 或 Runtime instanceId。

`defaultScenes` 只在当前 active Event 没有提到该 Character 时作为 fallback。所有 `<mapId>` 必须对应存在的 `struct.Map`。

## NPC

```text
struct.NPC/<npcId>
├─ name
└─ sprite → resource.Graphics
```

PokeMan 不把 Character / Dialogue / BattleActor / Relationship 塞进 `struct.NPC`。

当前也不建立独立 `struct.Visual`；NPC 视觉直接通过 `sprite → resource.Graphics` 表达。

## BattleActor / BattleSkill / BattleEffect

PokeMan 不定义第二套 Battle schema，只冻结 PokeMan Game Package 的物理绑定：

```text
BattleActor  → struct.BattleActor/<id>
BattleSkill  → struct.BattleSkill/<id>
BattleEffect → struct.BattleEffect/<id>
```

静态引用链：

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

Battle 模块现有数据语义：

```text
BattleActor.skills[]
→ BattleSkill id string[]

Simulation / Decision
→ skillId: string
```

Contract 建立：

```text
target NPC Instance
→ base BattleActor
→ contract.integrity = BattleActor.max_hp
→ contract.skills[] = copy(BattleActor.skills[])
```

Contract 已建立后：

```text
Relationship.contract.integrity / skills[]
= 当前契约长期 Battle state

base BattleActor
= 静态 actor definition / max_hp / BattleSkill definitions source
```

## Dialogue

```text
struct.Dialogue/<dialogueId>
├─ speakerName?
├─ lines[]
│  ├─ speaker? → Character key
│  └─ text
├─ choices?[]
│  ├─ text
│  └─ target → Dialogue key
└─ mutation? → EventStateMutation key
```

固定：

```text
choices 与 mutation 互斥
允许两者都不存在
```

`speakerName` 不是 Character identity。

Dialogue.mutation 只改变 Event state，不创建 Contract / Card。

## Event

```text
struct.Event/<eventId>
└─ states
   └─ <stateId>
      └─ maps
         └─ <decimal-mapId>
            └─ npcs
               └─ <npcId>
                  ├─ character?
                  ├─ placement XOR absent:true
                  ├─ battleActor?        # transient Story NPC only
                  └─ interaction?
                     └─ dialogue
```

`stateId / mapId / npcId` 都由 object key 表达，不在 value 中重复写 identity。

`absent:true` 只在同时存在 `character` 时合法，并且不得同时出现 `placement / battleActor / interaction`。不建立 `absentCharacters[]` 等第二套 takeover 结构。

每个 Event map key 必须对应存在的 `struct.Map`。

持久 Character directive：

```text
character exists
→ battleActor forbidden
→ resolve Character.battleActor
```

transient Story NPC：

```text
character absent
→ battleActor optional
→ if present: namespace = struct.BattleActor, key must exist
```

`instanceId` 不属于 Event Content。

## EventStateMutation

```text
struct.EventStateMutation/<mutationId>
├─ from
│  └─ eventId → stateId | null
└─ to
   └─ eventId → stateId | null
```

当前物理约束：

```text
from exists, may be {}
to exists, must be non-empty
```

多个 `from` 是 AND；OR 用多条 Mutation。

Mutation 不保存 trigger / action / command。`to` 非空就是当前结构约束；不额外比较 `from/to` 来证明执行后一定发生值变化。

## Encounter

```text
struct.Encounter/<decimal-mapId>
├─ count
├─ spawnPoints[]
└─ templates
   └─ <templateId>
      ├─ weight
      ├─ npc → NPC key
      ├─ engagement
      ├─ dialogue? → Dialogue key
      └─ battleActor → struct.BattleActor ContentRef
```

record key 就是 mapId，不重复保存 mapId 字段，并且必须对应存在的 `struct.Map`。

固定约束：

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
→ 每次 generation 按 template identity 加权、不放回选择
```

`count` 表示每次生成几个 Encounter NPC；`weight` 表示 template 之间的相对选择权重。数据固定“不放回”的结果语义，但 concrete weighted sampling / spawn selection 算法属于 Runtime。

以下不作为当前 Content schema gap：

```text
seed
weighted-sampling concrete algorithm
spawn selection algorithm
re-entry reroll
respawn
defeated persistence
```

## StoryIndex

```text
struct.StoryIndex/current
├─ byMap
├─ byCharacter
└─ byEvent
```

StoryIndex 是 Builder-generated read model，不是业务 authority，可由 Character / Event 等源 Content 重建。精确派生字段可以跟随 Resolver 查询实现调整，不视为 MVP 核心业务数据缺口。

# Shared State

## durable PlayerWorld checkpoint

```text
pokeman.PlayerWorld / current
→ { mapId, x, y, direction }
```

`mapId` 是正 safe integer，且对应存在的 `struct.Map`。

这条 Record 只表示 durable resume/checkpoint location；当前 live map / position / direction / motion 由 Map Runtime authority 拥有。

## EventStateList

```text
pokeman.EventStateList / current
→ [{ eventId, stateId }]
```

```text
entry exists → current = stateId
entry absent → current = null
```

列表只保存非空 state。

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

会进入 Relationship / CarriedCards key 的 Character business id 使用 `[a-z0-9][a-z0-9._-]{0,119}`；`:` 作为 Relationship 复合 key 分隔符，因此 `A:B` 无歧义且最长 241 bytes。

`A → B` 与 `B → A` 独立。

Relationship Record 可以存在而 `contract` 缺失。存在 `contract` 才表示正式契约成立。

固定跨 Content invariant：

```text
Relationship A:B
→ Character A / B exist

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

固定：同一 holder 内 slot 唯一、servant 唯一、按 slot 升序；Card 不保存 Integrity / skills / static Battle data。

```text
CarriedCards(A) contains B
→ Character A / B exist
→ Relationship(A → B).contract exists
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

## Story / Map

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
↓
Map NPCPlacement[]
```

最终每张 Map 要求 `npcId` 唯一。

Map Runtime live authority：

```text
current mapId
player x / y
direction
motion
scene
```

## Dialogue

```text
current dialogue id
current line index
pending choice
terminalDialogueId completion result
```

这些不进入 Shared State。

## Battle

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

Battle Runtime 完成后，只有真正需要长期持续的 Contract Integrity 等结果写回 Shared State。

## Encounter

当前 generated Encounter set / spawn assignment / transient body state 默认是 Runtime Memory。

是否 re-enter reroll、击败后是否保持消失、何时清空，是 Runtime/gameplay policy，不是当前 State schema gap。

# 关键流程

## Map Enter

```text
StoryIndex
+ EventStateList
↓
active Event states
↓
mentioned Characters
├─ mentioned   → Event sources only
└─ unmentioned → Character.defaultScenes
↓
merge transient Story / Encounter sources
↓
validate final npcId uniqueness
↓
Runtime NPC Instances
↓
NPCPlacement[]
```

## Fixed Dialogue

```text
struct.Dialogue
↓
PokeMan Dialogue Subsystem
├─ speaker resolution
├─ Choice target traversal
└─ terminal mutation?
   → struct.EventStateMutation
   → pokeman.EventStateList/current commit
```

如果同一业务交互还建立 Contract，由独立 business Runtime 创建 `Relationship.contract`。

## Card Battle

```text
pokeman.CarriedCards / A
→ servant B
+
pokeman.Relationship / A:B
→ contract.integrity / skills[]
+
struct.Character / B
→ struct.BattleActor
↓
Battle Runtime Actor
↓
Battle Simulation
↓
long-lived integrity result
→ Relationship.contract.integrity
```

# 当前数据结构状态

经过最终闭环复核，当前 MVP Shared State 核心四类 Record、Content 核心业务 shape、Battle Content FSDB binding 与跨 record referential invariants 已经收口；没有剩余的 MVP 核心业务 data physical-schema gap。

其余以下事项不再当作 MVP 核心 data gap：

```text
Battle Content table / namespace binding
BattleSkill identity / Contract.skills[] encoding
player Character identity
Dialogue choices XOR mutation
Event absent 的第二套结构
EventStateMutation semantic no-op proof
Encounter generation count / template weight / duplicate-template semantics
Shared State Record-level absence
StoryIndex 最终派生字段
本地化 / richer presentation metadata
Encounter seed / respawn / persistence
FSDB .info.meta 文件编写本身
```

`.info.meta` / exact schema、Builder validator 和 Runtime 实现仍然要写，但它们是把已冻结模型落地，不代表需要继续发明业务数据结构。