# 人物

> 独立技术设计记录。不改写 `../DESIGN.md`。本文定义持久 Character、NPC / Map Instance、Relationship / Contract、Card 与 Battle 数据边界。Shared State 物理结构见 [67-shared-state-records.md](./67-shared-state-records.md)，Content FSDB 编码见 [68-content-fsdb.md](./68-content-fsdb.md)。

归宿总表见 [数据落点](./60-data-placement.md)。

# Character Content

一个持久人物对应一条 `struct.Character` record。

```text
[struct]Character/<characterId>.json
→ namespace = struct.Character
→ key = characterId
```

**Character identity 由 FSDB record key 提供；PokeMan source record 不重复保存 `id`。**

MVP 玩家 Character identity 固定为：

```text
struct.Character / player
```

因此 `[struct]Character/player.json` 是 PokeMan MVP 必需 Content。玩家自己的 Relationship / Contract / CarriedCards 都使用这个 Character identity，不另建 `playerCharacterId` State 字段。

主角、家人、博士、宿敌、店主，以及以后可以建立契约的修行者，都是 Character。随机生成的普通混混、路霸等 transient Encounter NPC 不要求建立 Character。

当前核心数据：

```text
Character
├─ name
├─ description?
├─ aiCharacterText?
├─ battleActor: ContentRef
└─ defaultScenes?
   └─ <mapId decimal key>
      └─ <npcId>
         ├─ placement
         └─ interaction?
            └─ dialogue
```

例如：

```json
{
  "name": "宿敌",
  "description": "从小与主公一起长大的竞争对手。",
  "aiCharacterText": "好胜、自信，不愿轻易服输。",
  "battleActor": {
    "namespace": "struct.BattleActor",
    "key": "rival"
  },
  "defaultScenes": {
    "1": {
      "rival-casual": {
        "placement": {
          "x": 10,
          "y": 6,
          "direction": 2
        },
        "interaction": {
          "dialogue": "rival-default"
        }
      }
    }
  }
}
```

其中：

- `name / description / aiCharacterText` 是 immutable author data；
- `battleActor` 稳定引用这个 Character 的基础 BattleActor，MVP 中 `namespace` 固定为 `struct.BattleActor`；
- `defaultScenes` 是当前 active Event 没有接管该 Character 时的 fallback scene source；
- `<mapId>` 是 Map package 正 safe integer `mapId` 的十进制字符串形式，并且必须对应存在的 `struct.Map`；
- `<npcId>` 是 `struct.NPC` key；
- `interaction.dialogue` 是 `struct.Dialogue` key；
- default scene source 不保存 Runtime `instanceId`。

固定 AI 人物描述回答“这个人本来是什么样的人”。需要被规则读取的长期变化不回写 Character Content，而进入 Shared State Relationship 等结构化事实。

所有持久 Character 都应准备好形成 Card / Battle 表现所需的静态素材与数据。这是 **Content 完备性规则**，不表示存在 `canContract = true`，也不表示当前一定能建立契约。

# BattleActor / BattleSkill

PokeMan 不定义平行 Skill / Battle Profile schema。

BattleActor / BattleSkill 的 gameplay contract 直接复用已经存在的 `@loomrealm-game/battle`：

```text
BattleActor
├─ logical definition identity
├─ name
├─ character graphics reference
├─ max_hp
└─ skills[] → BattleSkill id

BattleSkill
├─ id: string
├─ name
├─ range
├─ damage
├─ timing.windup_ticks
├─ timing.recovery_ticks
└─ effect
```

PokeMan Game Package 对现有 battle Content 的具体 FSDB 绑定固定为：

```text
struct.BattleActor / <battleActorId>
struct.BattleSkill / <battleSkillId>
```

这只是 PokeMan Game Package 的物理 table / namespace 绑定；BattleActor / BattleSkill 的字段与 gameplay 语义仍由 `@loomrealm-game/battle` contract 定义，不在 PokeMan 复制第二套 schema。因为 battle authored contract 自身包含 `id`，PokeMan binding 要求 FSDB record key 与 value 内 `id` 相等。

Battle v0 的 Simulation-facing contract 本身就使用 `skillId: string`，BattleActor 当前 authored shape 也是 `skills: string[]`。因此 PokeMan 不再把 Contract skill identity 当成另一套待设计引用：

```text
BattleActor.skills[]
= struct.BattleSkill record key string[]

Relationship.contract.skills[]
= ordered unique BattleSkill id string[]
```

新 Contract 直接复制 `BattleActor.skills[]`。这里不增加 `BattleSkillRef`、`ContentRef[]` 或 PokeMan 自己的第二套 Skill identity。

`Character.battleActor` 自身仍使用 `{ namespace, key }` ContentRef；在 PokeMan MVP 中 `namespace` 必须为 `struct.BattleActor`，`key` 必须存在。它定位的是一条基础 BattleActor Content definition；这与 `skills[]` 保存 BattleSkill id 是两件不同的事。

MVP 不增加 `attack / defense / speed / MP / accuracy / critical / element / universal cooldown / ammo` 等 Battle v0 没有的字段。

# Character、NPC 与 Map Instance

```text
Character
= “这个人是谁”

NPC Definition / npcId
= “地图上以哪种表现模板出现”

Map NPC Instance
= “当前场景里这次具体出现”
```

Character identity 与 `npcId` 不要求相同。一个 Character 可以使用多个 NPC Definition，例如不同服装：

```text
Character rival
├─ npcId = rival-casual
└─ npcId = rival-lab
```

PokeMan 不扩展 Map package 已有的 `struct.NPC`：

```text
struct.NPC/<npcId>
├─ name
└─ sprite → resource.Graphics
```

Character identity、Dialogue、BattleActor、Relationship 等都不塞进 `struct.NPC`。

## 基础 BattleActor 解析

持久 Character：

```text
Persistent NPC Instance
→ characterId
→ struct.Character/<characterId>
→ Character.battleActor
→ struct.BattleActor/<battleActorId>
→ base BattleActor
```

transient Encounter / Story NPC：

```text
Transient NPC Instance
→ Encounter / Event static source
→ battleActor ContentRef
→ struct.BattleActor/<battleActorId>
→ base BattleActor
```

**同一个持久 Character 的不同 NPC Definition / NPC Instance 不改变 BattleActor identity。** 不因为不同 Map、Event state、服装或 `npcId` 产生新的 BattleActor variant。

PokeMan World-side NPC Instance 可以比 Map package 的 `NPCPlacement` 丰富，保存 `characterId?`、source context 等 Runtime 信息；但不拥有独立 Battle profile / resolved battle data authority。

最终传给 Map package：

```text
NPCPlacement
├─ instanceId
├─ npcId
├─ x
├─ y
├─ direction
└─ pattern?
```

`instanceId` 是 Runtime instance identity，不写回 Character / Event Content。

# Map 场景唯一性

当前最终场景固定：

> 同一个 `npcId` 可以同时出现在不同 Map，但同一张 Map 的最终解析结果中，一个 `npcId` 最多出现一次。

```text
(mapId, npcId)
= final business uniqueness
```

不同 Event source 可以都引用相同 `npcId`；跨 source 不做 author-time 全局唯一。Story Resolver 合并当前 active sources 后，如果同一 Map 得到重复 `npcId`，必须 deterministic conflict，不做 last-wins。

# Character default scene / Event takeover

Character 的 `defaultScenes` 是纯 fallback。

Story Resolver 对持久 Character `X`：

```text
当前没有任何 active Event State 提到 X
→ 使用 Character X.defaultScenes

至少一个 active Event State 提到 X
→ X 的全部 defaultScenes 退出解析
→ X 当前 scene 完全由 Event sources 决定
```

这里 Event “提到 Character”要求 directive 明确保存：

```text
character = X
```

只有 `npcId`、没有 `character` 的 transient NPC source 不接管任何 Character default scene。

## absent

```json
{
  "character": "rival",
  "absent": true
}
```

表示：

> 这个 Event 当前明确提到 Character `rival`，但本 Event 不贡献 placement。

固定：`absent:true` 必须同时有 `character`，且不得同时出现 `placement / battleActor / interaction`。

`absent` 不压制其他 Event 的 placement，也不建立 Event priority。

如果 active Event 已经接管 X，而所有相关 source 都不贡献 placement，则 X 当前不出现。

# Relationship

Relationship 是 Shared State 中两个 Character 之间的有向长期关系。

物理 identity 已冻结：

```text
namespace = pokeman.Relationship
key       = <fromCharacterId>:<toCharacterId>
```

例如：

```text
pokeman.Relationship / player:rival
```

表示 `player → rival`。

会进入 Relationship / CarriedCards Record key 的 Character business id 固定为：

```text
[a-z0-9][a-z0-9._-]{0,119}
```

`:` 不属于 Character id，因此 `A:B` 可无歧义拆回两个 Character identity；最大复合 key 为 241 bytes，满足 Shared State v1 的 256-byte key 上限。

Relationship key 中的 from / to 都必须对应存在的 `struct.Character`。

value 不重复保存 from / to：

```text
RelationshipValue
├─ affinity
├─ hostile
├─ relationshipText
└─ contract?
   ├─ integrity
   └─ skills[]
```

`A → B` 与 `B → A` 是独立 Relationship，不要求对称。

MVP 对“Relationship Record 不存在，但业务现在需要首次建立该方向关系”的初始化规则固定为：

```json
{
  "affinity": 0,
  "hostile": false,
  "relationshipText": ""
}
```

也就是：不存在的 Relationship 从中性关系开始；不得由调用者临时编造 affinity 或叙事文本。若同一业务动作同时建立 Contract，则在以上默认 value 上原子增加 `contract` 字段。已有 Relationship 则必须保留原有 `affinity / hostile / relationshipText`，只按业务规则增加或更新允许修改的字段。

**Relationship Record 存在不表示 Contract 已成立。** Record 可以保存 affinity / hostile / relationshipText，而 `contract` 缺失。

`affinity` 是有限整数。`hostile` 与 affinity 是独立事实。

`relationshipText` 是 dynamic relationship text 的最终字段名，主要给 AI 自由对话理解这一局形成的关系语境，不替代规则字段。

# Contract

存在：

```text
pokeman.Relationship / A:B
value.contract
```

表示：

> A 已作为主公与 B 这个从者建立正式契约。

Contract 不建立独立 Shared State Record，而是 Relationship value 内的可选对象。

MVP Contract：

```text
contract
├─ integrity: integer >= 0
└─ skills: ordered unique string[]
```

建立 Contract 时，从当前交互目标 NPC Instance 解析基础 BattleActor：

```text
目标 NPC Instance
↓
base BattleActor
├─ max_hp
└─ skills[]
↓
Relationship.contract
├─ integrity = BattleActor.max_hp
└─ skills[] = copy(BattleActor.skills[])
```

Contract Integrity 上限也来自同一 `BattleActor.max_hp`；不保存 `maxIntegrity`。因此任意合法持久状态满足：

```text
0 <= contract.integrity <= servant Character base BattleActor.max_hp
```

`contract.skills[]` 中每个 id 必须对应存在的 `struct.BattleSkill` record。

目标 NPC 本体某一场 Battle 的当前 HP 与 Contract Integrity 是不同产品语义。

Contract 成立后，当前实际拥有技能以 `Relationship.contract.skills[]` 为长期 authority。基础 BattleActor.skills 不会自动覆盖已有 Contract。

MVP 不定义：

```text
level
exp
training
skill tree
skill point
learnedSkillIds
baseSkills + learnedSkills merge
```

同一个 Character 可以与多个主公分别建立 Contract；它们共享 Character / base BattleActor Content，但 Contract 状态独立。

# Card / CarriedCards

Card 是 Shared State 当前随身事实，但没有独立 `cardId`。

物理 Record 已冻结为按 holder 聚合：

```text
namespace = pokeman.CarriedCards
key       = <holderCharacterId>
value     = [{ slot, servantCharacterId }]
```

例如：

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

固定约束：

- holder Character 必须存在；
- `slot >= 0`；
- 同一 holder 内 slot 唯一；
- 同一 holder 内 servantCharacterId 唯一；
- 每个 servantCharacterId 必须对应存在的 `struct.Character`；
- 数组按 slot 升序保存；
- 空编队使用 `[]`；
- holder 已在 Record key 中，不在 entry 重复保存。

核心 invariant：

```text
CarriedCards(A) contains B
→ Relationship(A → B).contract exists
```

Card 不保存：

```text
integrity
skills
BattleActor
BattleSkill
Character name
人格
AI character text
```

中心里的“已管理角色卡”只是对已成立 Relationship / Contract 的管理视图，不建立 `ManagedCard` State authority。

# Card Battle

当前随身从者进入 Battle：

```text
pokeman.CarriedCards / A
→ servant B
+
pokeman.Relationship / A:B
→ contract.integrity / skills[]
+
struct.Character / B
→ struct.BattleActor / <battleActorId>
↓
@loomrealm-game/battle Runtime Actor
```

Battle Simulation 拥有本场 live authority：

- 初始 HP 来自 Contract Integrity；
- 当前可用技能来自 Contract skills；
- max HP / repair target 来自 base BattleActor.max_hp；
- BattleActor 提供静态 actor definition / graphics / BattleSkill definitions；
- 战斗结束后需要长期保留的结果写回 Relationship.contract。

普通剧情本体或 transient 敌方不要求为了 Battle 制造 Relationship / Contract / Card。

所以：

```text
Character
!= NPC Definition
!= NPC Instance
!= Relationship
!= Contract
!= Card
!= Battle Runtime Actor
```

# Card 自由对话

对于 holder A / servant B：

```text
Character B
→ fixed AI character text

Relationship B → A
→ B 当前怎么看 A

Relationship A → B
→ A 与 B 的契约状态（需要时）

+
当前剧情 / Card context
↓
LLM
```

LLM 一次生成的台词默认只是输出，不自动修改 Character Content、Relationship 或其他 Shared State。长期关系变化必须由游戏业务明确提交。

当前不建立独立 Conversation Memory。

# Map Enter

```text
StoryIndex 查找该 Map 相关 Character / Event
→ 读取 EventStateList
→ 找到相关 active Event State
→ 收集 Event 明确提到的 Character
→ 未被 Event 提到：Character.defaultScenes
→ 被 Event 提到：Event directives only
→ 合并 transient Story / Encounter sources
→ 校验 final npcId uniqueness
→ 生成 World-side NPC Instances
→ 生成 Runtime instanceId
→ 映射 NPCPlacement[]
→ context.setNPC(...)
```

# Builder 检查

Builder 应检查：

- `struct.Character` identity 来自 FSDB key，source 不重复保存 `id`；
- `struct.Character/player` 必须存在；
- Character `battleActor.namespace === "struct.BattleActor"`，且 key 指向存在的 BattleActor；
- `struct.BattleActor/<id>` 与 `struct.BattleSkill/<id>` 的 record key 必须等于 battle contract value 内 `id`；
- BattleActor `skills[]` 的每个 skill id 指向存在的 `struct.BattleSkill`；
- Character `defaultScenes` map key 是合法正 safe integer，并指向存在的 `struct.Map`；
- `defaultScenes` npcId 指向存在的 `struct.NPC`；
- `interaction.dialogue` 指向存在的 `struct.Dialogue`；
- placement 坐标 / direction / pattern 合法；
- 进入 Relationship / CarriedCards key 的 Character identity 满足 `[a-z0-9][a-z0-9._-]{0,119}` 且对应存在的 Character；
- Contract `integrity` 不超过 servant Character 基础 BattleActor 的 `max_hp`；
- Contract `skills[]` 中每个 id 指向存在的 `struct.BattleSkill`；
- CarriedCards 的 holder / servant 存在，slot / servant 唯一并满足对应 Contract invariant；
- StoryIndex 与 Character / Event 源 Content 一致。

Builder 不因为以下情况失败：

```text
同一个 npcId 被多个不同 Event 引用
同一个 npcId 在不同 Map 出现
同一个 Character 被多个 Event 引用
同一个 Character 在多个 Map 出现
同一个 Character 被多个不同主公的 Relationship / Contract 引用
Event A 对 X absent + Event B 对 X placement
```

跨 source 合并后的同 Map `npcId` 冲突由 Story Resolver deterministic reject。

# 当前冻结结论

Character / Battle Content binding / Relationship / Contract / CarriedCards 的 MVP 物理结构已经分别由 `68` / `67` 冻结。

当前没有 BattleSkill identity / Contract.skills physical gap：`Contract.skills[]` 直接复用 battle 模块既有的 `skillId: string`；PokeMan Game Package 的 Battle Content table 绑定也已经固定为 `struct.BattleActor` / `struct.BattleSkill`。

当前 MVP 的 Runtime `instanceId` 已由 62 冻结为 `instanceId = npcId`；因为每张 Map 的最终 npcId 唯一，不再保留单独的 instanceId 生成算法 OPEN。未来只有在同一 Map 允许多个相同 npcId 实例时才需要版本化扩展该 identity contract。