# Shared State Record 设计

> 独立技术设计记录。不改写 `../DESIGN.md`。本文冻结 PokeMan MVP 核心 Shared State 的物理 Record 粒度、namespace/key 编码、value shape 与数据约束。Content FSDB 物理结构见 [Content FSDB 物理模型](./68-content-fsdb.md)。本文只讨论数据结构，不讨论谁提交、何时提交、事务、冲突或失败处理。Map 4 首场互换角色卡的具体 roster 与参数见 [80-battle-scenario-design.md](./80-battle-scenario-design.md)。

# Authority 前提

Shared State 记录的是 session-level shared mutable business facts。

需要特别区分：

```text
live player map / x / y / direction / motion
→ Map Runtime authority

durable resume/checkpoint location
→ Shared State pokeman.PlayerWorld/current
```

`pokeman.PlayerWorld/current` **不是第二份 live player pose authority**。它只表示产品 Save / Load / checkpoint workflow 需要的恢复位置；Runtime 可以在明确的 save/checkpoint 时机把 Map Runtime 当前位置提交为新的 resume point。

# 总体结构

MVP 核心 Shared State 固定为四类 Record：

| 业务事实 | namespace | key | value |
| --- | --- | --- | --- |
| durable world resume/checkpoint | `pokeman.PlayerWorld` | `current` | `{ mapId, x, y, direction }` |
| Event current state | `pokeman.EventStateList` | `current` | `[{ eventId, stateId }]` |
| 有向 Relationship / Contract | `pokeman.Relationship` | `<fromCharacterId>:<toCharacterId>` | `{ affinity, hostile, relationshipText, contract? }` |
| 当前随身 Card 编队 | `pokeman.CarriedCards` | `<holderCharacterId>` | `[{ slot, servantCharacterId }]` |

不建立一个巨大的全局 `GameState` Record，也不为每张 Card 建立独立 Record。

# ID 与 key 编码

Shared State v1 的 Record key 禁止包含 `/`，并限制 UTF-8 编码长度不超过 256 bytes。因此 Relationship 不能使用 `<from>/<to>` 编码。

会直接进入 Relationship / CarriedCards Record key 的 Character business id 固定为 ASCII token：

```text
[a-z0-9][a-z0-9._-]{0,119}
```

也就是 1–120 个 ASCII 字符。`:` 不属于合法 Character id 字符，因此可以作为 Relationship 复合 identity 的无歧义分隔符。

Relationship key 固定编码为：

```text
<fromCharacterId>:<toCharacterId>
```

最大长度：

```text
120 + 1 + 120 = 241 bytes
```

因此稳定落在 Shared State v1 的 256-byte key 上限内。

例如：

```text
namespace = pokeman.Relationship
key       = player:rival
```

表示：

```text
Relationship(player → rival)
```

`player:rival` 与 `rival:player` 是两个不同 key。

`pokeman.CarriedCards/<holderCharacterId>` 直接使用同一 Character business id，因此也天然满足 Shared State key 长度限制。

Content FSDB record key 作为 Character identity 并进入这些 Shared State key 时，必须满足上述 Character business id 约束。Event id 不参与 Relationship / CarriedCards key 编码，继续按其 Content identity 规则处理。

# PlayerWorld Record

## Record identity

```text
namespace = pokeman.PlayerWorld
key       = current
```

## 业务含义

它表示：

> **如果现在从已提交的 durable world checkpoint 恢复游戏，应从哪里重新创建 Map Runtime。**

它不表示 Map Runtime 当前每一帧 / 每一步的 live player pose。

## Value

```json
{
  "mapId": 3,
  "x": 3,
  "y": 8,
  "direction": 2
}
```

最终字段：

```text
PlayerWorldValue
├─ mapId: positive safe integer
├─ x: non-negative safe integer
├─ y: non-negative safe integer
└─ direction: 2 | 4 | 6 | 8
```

`mapId` 与 `@loomrealm-game/map` 使用同一业务 identity：正 safe integer，并且必须对应存在的 `struct.Map` record。Content 中 Event / Character defaultScenes / Encounter 等因为 JSON object key 或 FSDB key 必须是字符串，会使用其十进制字符串形式；Shared State value 直接保存整数。

该 Record 不保存：

```text
playerCharacterId
npcId
instanceId
motion
scene epoch
Character name / sprite / static data
```

MVP 玩家 Character identity 固定为 `struct.Character/player`，因此不需要在 `PlayerWorld` 内重复保存 `playerCharacterId`。

## Runtime 关系

```text
Load / New Session
→ read pokeman.PlayerWorld/current
→ create / enter Map Runtime at checkpoint

live movement
→ Map Runtime only

explicit save/checkpoint
→ project current Map Runtime location
→ replace pokeman.PlayerWorld/current
```

具体何时 checkpoint、失败怎么处理属于 Runtime / Save workflow，不由本数据 shape 决定。

# EventStateList Record

## Record identity

```text
namespace = pokeman.EventStateList
key       = current
```

## Value

value 直接是稀疏数组：

```json
[
  {
    "eventId": "professor-intro",
    "stateId": "waiting"
  },
  {
    "eventId": "tutorial-battle",
    "stateId": "ready"
  }
]
```

最终结构：

```text
EventStateListValue
= EventStateEntry[]

EventStateEntry
├─ eventId: string
└─ stateId: string
```

数据约束：

- `eventId` 非空且在列表内唯一；
- `stateId` 非空；
- `eventId` 必须对应存在的 `struct.Event` key；
- `stateId` 必须存在于对应 Event Content；
- 不保存 `stateId:null`；
- 空状态使用 `[]`。

业务读取：

```text
存在 eventId entry
→ current state = entry.stateId

不存在 eventId entry
→ current state = null
```

因此 `null` 只是 Event current state 的逻辑语义，不进入物理 entry。

## MVP New Game baseline exact values

当前 PokeMan MVP 的首次 session baseline 固定为：

```text
pokeman.PlayerWorld / current
= { mapId: 3, x: 3, y: 8, direction: 2 }

pokeman.EventStateList / current
= [{ eventId: "prologue", stateId: "lab-tutorial" }]
```

它与当前 `game.json` 的玩家家起点和序章 Story state 对齐。两条 singleton Record 必须一起 materialize；不得只创建其中一条。具体 bootstrap owner 与 OCC 行为由 79 的 Base startup 规则冻结。

# Relationship Record

## Record identity

每条有向 Relationship 使用一条独立 Shared State Record：

```text
namespace = pokeman.Relationship
key       = <fromCharacterId>:<toCharacterId>
```

例如：

```text
pokeman.Relationship / player:rival
pokeman.Relationship / rival:player
pokeman.Relationship / lord-b:rival
```

因为 from / to 已经属于 Record key，value 不重复保存它们。

固定 referential invariant：

```text
pokeman.Relationship / A:B exists
→ struct.Character / A exists
→ struct.Character / B exists
```

## Value

### 首次 Relationship 初始化默认值

当 `pokeman.Relationship/A:B` Record 不存在，而业务需要首次建立该方向 Relationship 时，MVP 固定从以下 exact value 开始：

```json
{
  "affinity": 0,
  "hostile": false,
  "relationshipText": ""
}
```

如果同一原子业务事务同时建立 Contract，则在这个默认 value 上增加 `contract`。不得因为角色是宿敌、朋友或剧情 NPC 就在 Runtime 中硬编码另一组初始 affinity / relationshipText；后续关系变化必须通过明确业务规则修改。

已有 Relationship 时，`affinity / hostile / relationshipText` 保持原值，除非当前业务明确拥有修改它们的 authority。

没有 Contract：

```json
{
  "affinity": 10,
  "hostile": false,
  "relationshipText": "认识不久，但已经开始互相信任。"
}
```

有 Contract：

```json
{
  "affinity": 20,
  "hostile": false,
  "relationshipText": "一起经历了研究所的第一次战斗。",
  "contract": {
    "integrity": 10,
    "skills": [
      "firebolt",
      "grab"
    ]
  }
}
```

最终结构：

```text
RelationshipValue
├─ affinity: integer
├─ hostile: boolean
├─ relationshipText: string
└─ contract?: ContractValue

ContractValue
├─ integrity: integer
└─ skills: string[]
```

`relationshipText` 是 dynamic relationship text 的最终字段名。

## 三种物理状态

```text
Relationship Record 不存在
= 没有持久化这段有向关系

Relationship Record 存在
+ contract field absent
= 有长期关系，没有正式契约

Relationship Record 存在
+ contract field present
= 正式主公 / 从者契约成立
```

不增加：

```text
hasRelationship
hasContract
contracted
```

## affinity

```text
affinity: finite integer
```

MVP 不冻结人为数值范围，例如 `-100..100`。

## hostile

```text
hostile: boolean
```

它与 affinity 独立，不由 affinity 正负推导。

## relationshipText

```text
relationshipText: string
```

字段必需，允许空字符串。

# Contract Value

Contract 嵌在 Relationship value 内，不建立独立 Record。

```text
contract
├─ integrity
└─ skills[]
```

## integrity

```text
integrity: integer >= 0
```

不保存 `maxIntegrity`。

最大值与新 Contract 初始值来自稳定基础 BattleActor：

```text
Relationship A:B
→ struct.Character / B
→ Character.battleActor
→ struct.BattleActor / <battleActorId>
→ BattleActor.max_hp
```

固定：

```text
new contract.integrity = BattleActor.max_hp
max contract.integrity = BattleActor.max_hp
0 <= contract.integrity <= BattleActor.max_hp
```

结构层仍允许 `integrity = 0`，以表达历史数据或其他业务写入的失效契约；但 PokeMan 不允许用 0 Integrity 构造新的 Battle Manifestation。正常 Battle 结算采用业务规则：对每个 Contract-backed Actor 写入 `max(1, finalSnapshot.hp)`。因此 HP 在本场战斗中归零的卡片，正常退出 Battle 时保存为 1 Integrity；BattleResult 仍依据结算前的原始 final Snapshot 判定。取消 / failure 不提交本场部分 HP。此规则属于 Battle settlement 语义，不改变本节的 Shared State Record shape。

## skills

```text
skills: string[]
```

这里的字符串直接使用现有 `@loomrealm-game/battle` 的 BattleSkill identity：BattleActor authored shape 使用 `skills: string[]`，Simulation / Decision contract 使用 `skillId: string`。PokeMan Game Package 将这些 id 绑定到 `struct.BattleSkill/<skillId>`。

结构约束：

- 每个元素是 BattleSkill id；
- 每个 id 必须对应存在的 `struct.BattleSkill` record；
- 不允许重复；
- 保留数组顺序；
- 空技能集使用 `[]`。

所以 `skills` 是 ordered unique list。

新 Contract 初始化：

```text
contract.skills = copy(BattleActor.skills[])
```

Contract 不保存：

```text
BattleActorRef
maxIntegrity
progression
training
learnedSkillIds
```

# CarriedCards Record

## Record identity

Card 没有独立 identity，不采用“一张 Card 一条 Record”。

当前随身编队按 holder 聚合：

```text
namespace = pokeman.CarriedCards
key       = <holderCharacterId>
```

例如：

```text
pokeman.CarriedCards / player
```

固定 referential invariant：

```text
pokeman.CarriedCards / A exists
→ struct.Character / A exists
```

## Value

```json
[
  {
    "slot": 0,
    "servantCharacterId": "rival"
  }
]
```

多个随身位：

```json
[
  {
    "slot": 0,
    "servantCharacterId": "rival"
  },
  {
    "slot": 1,
    "servantCharacterId": "mage"
  }
]
```

最终结构：

```text
CarriedCardsValue
= CarriedCardEntry[]

CarriedCardEntry
├─ slot: integer
└─ servantCharacterId: string
```

holder 已属于 Record key，所以 entry 不重复保存 `holderCharacterId`。

逻辑上一张当前 Card：

```text
holderCharacterId
= Record key

servantCharacterId
= entry field

slot
= entry field
```

数据约束：

- `slot` 是 `integer >= 0`；
- 同一 Record 内 `slot` 唯一；
- 同一 Record 内 `servantCharacterId` 唯一；
- 每个 `servantCharacterId` 必须对应存在的 `struct.Character`；
- 数组按 `slot` 升序保存；
- 空编队使用 `[]`；
- `null` 不作为空编队第二种编码。

数据一致性 invariant：

```text
CarriedCards(A) 中存在 servant B
→ struct.Character / B exists
→ Relationship(A → B).contract 必须存在
```

Card 不保存：

```text
cardId
integrity
skills[]
BattleActor / BattleSkill
Character name / personality
```

# null 与 absence

这四类 MVP Shared State canonical business value 不使用 `null` 作为内部状态编码。

统一：

```text
optional object
→ field absence

empty collection
→ []

ordinary field
→ actual value
```

具体：

```text
no Contract
→ contract field absent

Event current state = null
→ no EventStateList entry

empty EventStateList
→ []

empty CarriedCards
→ []
```

Shared State 底层 contract 可以允许 record value `null`，但 PokeMan 这四类 canonical value 不使用它。

物理 absence 不能只看 `value`。`read()` 对 never-materialized Record 与显式初始 `null` 都可能返回 `value=null, version=0`；Runtime 必须结合相同或更新 revision 的 `list(namespace)` membership 判定。只有 identity 不在 materialized index 中时才是业务 absence；identity 已 materialize 而 value 为 `null` 时一律是非法 PokeMan State，不得被 baseline 或按需初始化覆盖。

Record 本身从未 materialize 时的 PokeMan 业务语义固定如下：

```text
pokeman.PlayerWorld / current
→ baseline MUST materialize
→ absent / never-materialized = invalid PokeMan State

pokeman.EventStateList / current
→ baseline MUST materialize
→ absent / never-materialized = invalid PokeMan State
→ 没有 active Event 使用 []

pokeman.Relationship / A:B
→ absent / never-materialized = 没有持久化这段有向 Relationship

pokeman.CarriedCards / A
→ absent / never-materialized = 业务值 []
→ materialized [] = 业务值 []
```

因此 singleton 基础 Record 使用“必须存在”的编码；按 holder / relationship 按需产生的 Record 可以让 absence 具有领域语义。

`CarriedCards/A` 的 absent 与 materialized `[]` 在 Shared State 物理历史上仍然不同，但在 PokeMan 当前编队业务读取上等价，都表示“当前没有随身 Card”。不要求为每个 Character 预先 materialize 一个空 `CarriedCards` Record。

相反，materialized `null` 不等价于上述任何一种合法空值：Relationship 必须使用 field absence 表达 no Contract，CarriedCards 必须使用 `[]`，两个 baseline singleton 必须使用各自 canonical value。

# 完整示例

## durable PlayerWorld checkpoint

```text
pokeman.PlayerWorld / current
```

```json
{
  "mapId": 3,
  "x": 3,
  "y": 8,
  "direction": 2
}
```

## EventStateList

```text
pokeman.EventStateList / current
```

```json
[
  {
    "eventId": "prologue",
    "stateId": "rival-ready"
  }
]
```

## player → rival

```text
pokeman.Relationship / player:rival
```

```json
{
  "affinity": 0,
  "hostile": false,
  "relationshipText": "",
  "contract": {
    "integrity": 18,
    "skills": [
      "firebolt",
      "grab"
    ]
  }
}
```

## rival → player

```text
pokeman.Relationship / rival:player
```

```json
{
  "affinity": 0,
  "hostile": false,
  "relationshipText": "",
  "contract": {
    "integrity": 20,
    "skills": [
      "firebolt"
    ]
  }
}
```

## player carried cards

```text
pokeman.CarriedCards / player
```

```json
[
  {
    "slot": 0,
    "servantCharacterId": "rival"
  }
]
```

## rival carried cards

```text
pokeman.CarriedCards / rival
```

```json
[
  {
    "slot": 0,
    "servantCharacterId": "player"
  }
]
```

以上双向示例对应 Map 4 首次互换角色卡、且交换前两条 Relationship 都不存在的情况：两边都从中性 Relationship 默认值开始，同时建立各自 Contract；player 持有 rival，rival 持有 player。若 Relationship 已存在，则必须保留其原有关系字段。Integrity / skills 分别属于两条有向 Relationship，不属于 CarriedCards。

# 当前冻结结论

```text
pokeman.PlayerWorld / current
→ durable resume/checkpoint {
    mapId: positive safe integer,
    x: non-negative safe integer,
    y: non-negative safe integer,
    direction
  }

pokeman.EventStateList / current
→ [{
    eventId,
    stateId
  }]

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

pokeman.CarriedCards / <holder>
→ [{
    slot,
    servantCharacterId
  }]
```

同时冻结：

```text
MVP player Character = struct.Character/player
Character business id = [a-z0-9][a-z0-9._-]{0,119}
Relationship key = <from>:<to>
Relationship key max length = 241 bytes
PlayerWorld.mapId → existing struct.Map
Relationship from/to → existing struct.Character
Contract integrity <= servant base BattleActor.max_hp
Contract skills[] → existing struct.BattleSkill ids
CarriedCards holder/servant → existing struct.Character
empty list = []
optional Contract = field absence
business value shape does not use null
Relationship value does not repeat from/to
CarriedCards value does not repeat holder
skills[] = BattleSkill id string[]
skills[] ordered + unique
CarriedCards sorted by slot
slot unique
servantCharacterId unique per holder
Carried Card requires corresponding Contract
PlayerWorld is durable checkpoint, not live Map authority
PlayerWorld.mapId is positive safe integer
PlayerWorld/current baseline must exist
EventStateList/current baseline must exist
Relationship absence = no persisted relationship
CarriedCards absence = business []
```

# 当前仍未解决的数据结构问题

Shared State 核心四类 Record 的粒度、namespace/key、value shape、Record-level absence 与跨 Content referential invariants 已经冻结。

当前 Shared State 侧没有剩余的 MVP 核心 physical-schema gap。Content / Encounter 的 authored 数据结构见 [68-content-fsdb.md](./68-content-fsdb.md)。

当前不建立通用：

```text
StoryFacts
ChoiceFacts
flags: Record<string, unknown>
generic key/value bag
```

只有未来出现无法由现有 domain data 表达、且确实需要长期共享的新业务事实时，再单独设计对应数据结构。
