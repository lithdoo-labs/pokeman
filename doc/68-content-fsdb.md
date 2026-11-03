# Content FSDB 物理模型

> 独立技术设计记录。不改写 `../DESIGN.md`。本文冻结 PokeMan 当前 Content 的 FSDB 物理组织、record identity、引用编码与跨 record 数据约束。Shared State 物理结构以 [Shared State Record 设计](./67-shared-state-records.md) 为准；业务语义分别见 [人物](./61-character.md)、[事件](./62-event.md)、[固定对话](./64-dialogue.md)。

# FSDB 前提

项目当前 FSDB 对 PokeMan Content 有几个直接约束：

- FSDB root 目录名形如 `[FSDB]PokeMan`；
- `struct` table 目录名形如 `[struct]Character`；
- `struct` record 是 table 同层的 `<key>.json`；
- `struct` record 顶层必须是 JSON object；
- `struct` table 必须提供 `.info.meta`；
- `struct` key 不通过子目录形成层级路径；
- `resource` table 才允许目录层级，因此 `Characters/Mage` 这种 key 属于 resource key；
- Runtime Content namespace 由 FSDB table 投影得到，例如 `struct.Character`、`struct.NPC`、`resource.Graphics`。

因此 PokeMan 不再先定义一套脱离 FSDB 的 `id + object` 模型，再在安装阶段做第二次 identity 映射。

```text
struct record 的 FSDB key
= 该 definition 的 physical identity
```

# 当前目录组织

```text
[FSDB]PokeMan/
├─ [struct]Character/
│  ├─ .info.meta
│  ├─ player.json
│  ├─ rival.json
│  └─ professor.json
│
├─ [struct]NPC/                         # @loomrealm-game/map contract
│  ├─ .info.meta
│  ├─ rival-casual.json
│  ├─ rival-lab.json
│  └─ road-bandit.json
│
├─ [struct]BattleActor/                 # @loomrealm-game/battle contract
│  ├─ .info.meta
│  ├─ player.json
│  ├─ rival.json
│  └─ road-bandit.json
│
├─ [struct]BattleSkill/                 # @loomrealm-game/battle contract
│  ├─ .info.meta
│  ├─ firebolt.json
│  └─ grab.json
│
├─ [struct]BattleEffect/                # @loomrealm-game/battle presentation contract
│  ├─ .info.meta
│  ├─ firebolt.json
│  └─ grab.json
│
├─ [struct]BattleArena/                 # @loomrealm-game/battle arena contract
│  ├─ .info.meta
│  └─ lab-tutorial.json
│
├─ [struct]Dialogue/
│  ├─ .info.meta
│  ├─ lab-rival-intro.json
│  └─ route-bandit-threat.json
│
├─ [struct]Event/
│  ├─ .info.meta
│  └─ prologue.json
│
├─ [struct]EventStateMutation/
│  ├─ .info.meta
│  └─ prologue-to-route.json
│
├─ [struct]Encounter/
│  ├─ .info.meta
│  └─ 2.json
│
├─ [struct]StoryIndex/                  # Builder generated
│  ├─ .info.meta
│  └─ current.json
│
└─ [resource]Graphics/
   ├─ .desc.meta
   └─ Characters/
      ├─ RivalCasual.png
      └─ RivalLab.png
```

对应 identity：

```text
[struct]Character/rival.json
→ namespace = struct.Character
→ key       = rival

[struct]BattleActor/rival.json
→ namespace = struct.BattleActor
→ key       = rival

[struct]BattleSkill/firebolt.json
→ namespace = struct.BattleSkill
→ key       = firebolt

[struct]BattleEffect/firebolt.json
→ namespace = struct.BattleEffect
→ key       = firebolt

[struct]BattleArena/lab-tutorial.json
→ namespace = struct.BattleArena
→ key       = lab-tutorial

[struct]Event/prologue.json
→ namespace = struct.Event
→ key       = prologue

[resource]Graphics/Characters/Rival.png
→ namespace = resource.Graphics
→ key       = Characters/Rival
```

# identity 与引用编码

## PokeMan 自有 struct 不重复保存 id

例如：

```text
[struct]Character/rival.json
```

已经完整表达：

```text
namespace = struct.Character
key       = rival
```

所以 PokeMan 自有 source value 不再写：

```json
{
  "id": "rival"
}
```

同理适用于：

```text
Character
Dialogue
Event
EventStateMutation
Encounter
StoryIndex
```

BattleActor / BattleSkill / BattleEffect / BattleArena 是 **package-owned contract 的 PokeMan FSDB binding**，不是 PokeMan 自有 schema.其 value 是否包含 `id` 由 battle contract 决定；PokeMan 只额外要求 record key 与 package contract 的 definition `id` 一致。

## Character key 的额外业务约束

`struct.Character` key 还会进入 `pokeman.Relationship` 与 `pokeman.CarriedCards` 的 Shared State Record key，因此额外固定为：

```text
[a-z0-9][a-z0-9._-]{0,119}
```

即 1–120 个 ASCII 字符。`:` 不允许出现在 Character key 中，因此 Relationship 可以稳定编码为：

```text
<fromCharacterId>:<toCharacterId>
```

最大长度为 241 bytes，满足 Shared State v1 的 256-byte key 上限。

MVP 玩家 Character identity 固定为：

```text
namespace = struct.Character
key       = player
file      = [struct]Character/player.json
```

`struct.Character/player` 必须存在。PokeMan 不增加第二个 `playerCharacterId` authority。

## PokeMan 自有固定目标 table：只保存 key

如果 PokeMan 自有字段 schema 已唯一确定目标 table，则只保存 key：

```json
{
  "speaker": "rival",
  "mutation": "prologue-to-route"
}
```

解释为：

```text
speaker
→ struct.Character / rival

mutation
→ struct.EventStateMutation / prologue-to-route
```

其他固定引用：

```text
npc
→ struct.NPC key

dialogue / Choice.target
→ struct.Dialogue key

eventId
→ struct.Event key
```

## Battle package Content 的 PokeMan FSDB binding

PokeMan 不重新定义 BattleActor / BattleSkill / BattleEffect 字段。它把现有 `@loomrealm-game/battle` contract 具体绑定到以下 FSDB table：

```text
BattleActor  → struct.BattleActor / <battleActorId>
BattleSkill  → struct.BattleSkill / <battleSkillId>
BattleEffect → struct.BattleEffect / <battleEffectId>
BattleArena  → struct.BattleArena / <battleArenaId>
```

固定：

```text
struct.BattleActor record key
= BattleActor.id

struct.BattleSkill record key
= BattleSkill.id

struct.BattleEffect record key
= BattleEffect.id

struct.BattleArena record key
= BattleArena.id
```

BattleActor authored contract 已有：

```text
skills: string[]
```

PokeMan Game Package 将其中每个字符串解释为：

```text
struct.BattleSkill / <skillId>
```

并要求引用存在。

BattleSkill authored contract 已有：

```text
effect: string
```

PokeMan Game Package 将它解释为：

```text
struct.BattleEffect / <effectId>
```

并要求引用存在。

这只是 PokeMan Game Package 的 concrete serialization binding；battle package 的 gameplay contract 仍是唯一 schema authority。

## BattleArena

`struct.BattleArena` 是 Battle package 的独立战斗场地 Content，不是 `struct.Map` 的别名，也不参与探索 Map topology。

目标 exact shape：

```json
{
  "id": "lab-tutorial",
  "width": 7,
  "height": 7,
  "passable": [
    [true, true, true, true, true, true, true],
    [true, true, true, true, true, true, true],
    [true, true, true, true, true, true, true],
    [true, true, true, true, true, true, true],
    [true, true, true, true, true, true, true],
    [true, true, true, true, true, true, true],
    [true, true, true, true, true, true, true]
  ],
  "tileset_id": 3,
  "data": {
    "dimensions": 3,
    "xSize": 7,
    "ySize": 7,
    "zSize": 3,
    "values": ["<7×7 layer0 tile ids, then layer1, then layer2>"]
  }
}
```

规则：

- record key 必须等于 `BattleArena.id`；
- `width / height` 是正 safe integer；
- `passable` 必须恰好是 `height × width` boolean matrix；它是 Battle Simulation 的 authored navigation authority；
- `data` 沿用 Map 的 3-layer ProjectedTable tile-id 编码，仅供 Battle Presentation；`xSize === width`、`ySize === height`、`zSize === 3`；
- `tileset_id` 必须对应存在的 `struct.Tileset`；Presentation 可以继续读取该 Tileset 及其 Tileset / Autotile Graphics；
- BattleArena 不包含 `behaviors / passages / terrain_tags / bridge / transfer / NPC`；这些探索语义不进入 Battle；
- Battle passability 不从 visual tile、Tileset passages 或 Map Runtime 推导。

首场 `lab-tutorial` 固定 7×7、全 passable、tileset_id=3；layer 0 使用 tile id 624 铺满，layer 1 / 2 为 0。Map 4 只负责剧情触发，不是 BattleArena 的数据源。

## battleActor ContentRef

Character / transient Event / Encounter 的 `battleActor` 字段保留 ContentRef shape：

```ts
type ContentRef = {
  namespace: string
  key: string
}
```

PokeMan MVP 对该字段进一步固定：

```text
namespace MUST equal "struct.BattleActor"
key MUST resolve to an existing struct.BattleActor record
```

例如：

```json
{
  "battleActor": {
    "namespace": "struct.BattleActor",
    "key": "rival"
  }
}
```

保留 ContentRef 是为了继续使用 LoomRealm 的跨 package Content identity shape，不表示存在多个 BattleActor namespace，也不允许 PokeMan 创建平行 Battle schema。

Battle v0 的 Simulation / Decision contract 已使用 `skillId: string`。因此：

```text
BattleActor.skills[]
= struct.BattleSkill record key string[]

Relationship.contract.skills[]
= ordered unique BattleSkill id string[]
```

PokeMan 不建立 `BattleSkillRef`、`ContentRef[]` 或第二套 Skill identity。

作者 source 不手写 `contentVersion`；版本由 Content API / resolved reference 处理。

# MVP 序章 Map binding

当前 MVP 对已导入 `struct.Map` 固定以下业务用途：

```text
struct.Map/2 → 初始城镇
struct.Map/3 → 玩家家
struct.Map/4 → 博士研究所
struct.Map/5 → 第一条道路
struct.Map/7 → 第一个城镇
struct.Map/8 → 宿敌家
```

这些 mapId 是现有 Map Content identity，不新增 `Scene` / `Location` table，也不在 Character / Event / Encounter 中重复保存场景名称。

对应 authored Content 约束：

```text
home-family placement
→ mapId 3

prologue 中博士 / 宿敌研究所 scene
→ mapId 4

第一条道路普通 Encounter
→ struct.Encounter/5

route-trainee placement / Challenge
→ mapId 5

town-resident / center-servant
→ mapId 7
```

当前 FSDB 中早期样例 `struct.Encounter/2` 与 `struct.Event/prologue` 中使用 mapId 1 的研究所 scene 属于待同步的 Content 数据，不改变本文 schema；同步后应分别使用 mapId 5 与 mapId 4。

# Character

物理 identity：

```text
namespace = struct.Character
key       = <characterId>
file      = [struct]Character/<characterId>.json
```

示例：

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

当前核心 shape：

```text
Character
├─ name: string
├─ description?: string
├─ aiCharacterText?: string
├─ battleActor: ContentRef              # namespace = struct.BattleActor
└─ defaultScenes?: object
   └─ <mapId decimal key>
      └─ <npcId>
         ├─ placement
         │  ├─ x
         │  ├─ y
         │  ├─ direction
         │  └─ pattern?
         └─ interaction?
            └─ dialogue: Dialogue key
```

规则：

- Character identity 来自 FSDB key；
- Character key 必须满足 `[a-z0-9][a-z0-9._-]{0,119}`；
- `struct.Character/player` 必须存在并作为 MVP 玩家 identity；
- `battleActor.namespace` 固定为 `struct.BattleActor`，key 必须存在；
- `defaultScenes` 是 Event 未接管该 Character 时的 fallback source；
- `<mapId>` 是 Map package 正 safe integer `mapId` 的十进制字符串形式，并且必须对应存在的 `struct.Map` record；
- `<npcId>` 是存在的 `struct.NPC` key；
- `interaction.dialogue` 是存在的 `struct.Dialogue` key；
- placement `x / y` 使用非负 safe integer；
- default scene source 不保存 Runtime `instanceId`。

Character 不保存 Relationship、Contract、Card 或 Battle Runtime state。

# NPC

PokeMan 不扩展 `@loomrealm-game/map` 已有的 `struct.NPC` record。

```text
namespace = struct.NPC
key       = <npcId>
```

当前 Map contract：

```json
{
  "name": "宿敌",
  "sprite": {
    "namespace": "resource.Graphics",
    "key": "Characters/RivalCasual"
  }
}
```

禁止塞入：

```text
character
characterId
battleActor
dialogue
relationship
contract
```

当前也不建立独立 `struct.Visual`。地图人物视觉由 `struct.NPC.sprite → resource.Graphics` 表达。

# Dialogue

物理 identity：

```text
namespace = struct.Dialogue
key       = <dialogueId>
file      = [struct]Dialogue/<dialogueId>.json
```

持久 Character speaker：

```json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "总算来了。"
    }
  ],
  "choices": [
    {
      "text": "接受挑战",
      "target": "lab-rival-accept"
    },
    {
      "text": "再等等",
      "target": "lab-rival-wait"
    }
  ]
}
```

transient speaker：

```json
{
  "speakerName": "路霸",
  "lines": [
    {
      "text": "站住！"
    }
  ],
  "mutation": "route-bandit-cleared"
}
```

shape：

```text
Dialogue
├─ speakerName?: string
├─ lines: Line[]
│  ├─ speaker?: Character key
│  └─ text: string
├─ choices?: Choice[]
│  ├─ text: string
│  └─ target: Dialogue key
└─ mutation?: EventStateMutation key
```

约束：

```text
lines.length >= 1

choices 存在
→ choices.length >= 1
→ mutation 不存在

mutation 存在
→ choices 不存在

choices 与 mutation
→ 最多存在一个
→ 允许两者都不存在
```

# EventStateMutation

物理 identity：

```text
namespace = struct.EventStateMutation
key       = <mutationId>
file      = [struct]EventStateMutation/<mutationId>.json
```

示例：

```json
{
  "from": {
    "prologue": "lab-complete",
    "first-route": null
  },
  "to": {
    "prologue": null,
    "first-route": "active"
  }
}
```

shape：

```text
EventStateMutation
├─ from: object
│  └─ <eventId>: stateId | null
└─ to: object
   └─ <eventId>: stateId | null
```

`null` 是 Mutation 语义，不是 Shared State 内部 entry 编码：

```text
from[eventId] = null
→ 要求 EventStateList 当前没有该 eventId entry

to[eventId] = null
→ 应用后删除该 eventId entry
```

物理约束：

```text
from
→ 必须存在
→ 可以是 {}

to
→ 必须存在
→ 至少一个 member
```

允许：

```json
{
  "from": {},
  "to": {
    "prologue": "active"
  }
}
```

这里只禁止 `to: {}` 这种空赋值。schema 不额外比较 `from / to` 来证明一次执行一定改变当前值；这种“语义 no-op”不值得增加数据结构复杂度。

Mutation 不保存：

```text
id
trigger
action
command
generic Shared State path mutation
```

# Event

物理 identity：

```text
namespace = struct.Event
key       = <eventId>
file      = [struct]Event/<eventId>.json
```

示例：

```json
{
  "states": {
    "lab": {
      "maps": {
        "1": {
          "npcs": {
            "rival-lab": {
              "character": "rival",
              "placement": {
                "x": 8,
                "y": 5,
                "direction": 2
              },
              "interaction": {
                "dialogue": "lab-rival-intro"
              }
            }
          }
        }
      }
    },
    "after-lab": {
      "maps": {
        "1": {
          "npcs": {
            "rival-lab": {
              "character": "rival",
              "absent": true
            }
          }
        }
      }
    }
  }
}
```

identity 层级：

```text
Event identity
= FSDB record key

stateId
= states object key

mapId
= maps object key，解释为十进制正 safe integer

npcId
= npcs object key
```

source 不重复保存：

```text
id
eventId
stateId
mapId
npcId
```

Event NPC directive：

```text
EventNPCDirective
├─ character?: Character key
├─ placement?: Placement
├─ absent?: true
├─ battleActor?: ContentRef             # transient only; namespace = struct.BattleActor
└─ interaction?
   └─ dialogue: Dialogue key
```

Placement：

```text
Placement
├─ x: non-negative safe integer
├─ y: non-negative safe integer
├─ direction: 2 | 4 | 6 | 8
└─ pattern?: 0 | 1 | 2 | 3
```

固定：

```text
placement XOR absent:true

absent:true
→ character 必须存在
→ placement 不存在
→ battleActor 不存在
→ interaction 不存在
```

不额外引入 `absentCharacters[]` 或第二套 Character takeover schema。

`instanceId` 不属于 Event Content。

## 持久 Character 与 transient Story NPC

持久 Character directive：

```json
{
  "character": "rival",
  "placement": {
    "x": 8,
    "y": 5,
    "direction": 2
  }
}
```

其 BattleActor 必须经：

```text
Character
→ Character.battleActor
→ struct.BattleActor/<battleActorId>
→ base BattleActor
```

因此：

```text
character 存在
→ battleActor 禁止存在
```

transient Story NPC 可以直接保存基础 BattleActor：

```json
{
  "placement": {
    "x": 8,
    "y": 5,
    "direction": 2
  },
  "battleActor": {
    "namespace": "struct.BattleActor",
    "key": "road-bandit"
  },
  "interaction": {
    "dialogue": "route-bandit-threat"
  }
}
```

```text
character 不存在
→ battleActor 可选
```

Event `maps.<mapId>` 中每个 mapId 都必须对应存在的 `struct.Map`。

# Encounter

每张 Map 一条 record：

```text
namespace = struct.Encounter
key       = decimal mapId
file      = [struct]Encounter/<mapId>.json
```

例如：

```text
[struct]Encounter/2.json
```

record value 不重复保存 `mapId`。record key 必须对应存在的 `struct.Map`。

MVP 最终 shape：

```json
{
  "count": 2,
  "spawnPoints": [
    {
      "x": 7,
      "y": 12,
      "direction": 2
    },
    {
      "x": 13,
      "y": 8,
      "direction": 4
    },
    {
      "x": 20,
      "y": 6,
      "direction": 8
    }
  ],
  "templates": {
    "road-bandit": {
      "weight": 3,
      "npc": "road-bandit",
      "engagement": "hostile",
      "dialogue": "route-bandit-threat",
      "battleActor": {
        "namespace": "struct.BattleActor",
        "key": "road-bandit"
      }
    },
    "rogue-trainee": {
      "weight": 1,
      "npc": "rogue-trainee",
      "engagement": "hostile",
      "battleActor": {
        "namespace": "struct.BattleActor",
        "key": "rogue-trainee"
      }
    }
  }
}
```

shape：

```text
Encounter
├─ count: positive safe integer
├─ spawnPoints[]
│  ├─ x
│  ├─ y
│  └─ direction
└─ templates
   └─ <templateId>
      ├─ weight: positive safe integer
      ├─ npc: NPC key
      ├─ engagement
      ├─ dialogue?: Dialogue key
      └─ battleActor: ContentRef          # namespace = struct.BattleActor
```

`templateId` 是该 Encounter record 内部 identity，不建立新的 FSDB record。

`count` 表示这张 Map 每次生成的 Encounter NPC 数量；`weight` 只表示 template 之间的相对选择权重。例如 `3` 与 `1` 表示前者相对后者有三倍权重，不规定具体随机数实现。

为了保证最终 Map 的 `npcId` 唯一，Encounter generation 的数据语义固定为 **按 template identity 加权、不放回选择**：同一次 generation 中同一个 template 最多选择一次。

固定约束：

```text
count
→ positive safe integer
→ count <= spawnPoints.length
→ count <= number of templates

weight
→ positive safe integer

spawnPoints
→ x / y 是 non-negative safe integer
→ 同一 record 内 (x,y) 不重复

templates
→ 每个 template.npc 必须存在于 struct.NPC
→ 同一 Encounter record 内 template.npc 必须唯一
→ battleActor.namespace = struct.BattleActor
→ battleActor.key 必须存在
```

因此任意一次 generation 只要按 distinct template 选择，就不会仅因为同一 Encounter record 重复抽中 template 而制造同 Map 重复 `npcId`。不同 Story / Event / Character source 与 Encounter 合并后若仍产生 `npcId` 冲突，继续由最终 Story Resolver deterministic reject，不做 last-wins。

当前 MVP 已明确需要：

```text
engagement = "hostile"
```

不增加 `minCount / maxCount`；当前没有“同一张 Map 每次生成数量本身也随机”的产品需求。

以下不作为当前 Content schema gap：

```text
seed
weighted-sampling concrete algorithm
spawn selection algorithm
re-entry reroll
respawn
defeated persistence
```

它们默认属于 Runtime / gameplay policy。只有未来产品明确需要作者配置时，才重新进入 Content 数据设计。

# StoryIndex

StoryIndex 是 Builder 从 Character / Event 等源 Content 生成的派生只读 Content，不是作者业务 authority，也不进入 Shared State。

物理位置：

```text
namespace = struct.StoryIndex
key       = current
file      = [struct]StoryIndex/current.json
```

概念结构：

```text
StoryIndex
├─ byMap
├─ byCharacter
└─ byEvent
```

示例：

```json
{
  "byMap": {
    "1": {
      "characters": ["professor", "rival"],
      "events": ["prologue"]
    }
  },
  "byCharacter": {
    "rival": {
      "defaultMaps": [1],
      "events": ["prologue"]
    }
  },
  "byEvent": {
    "prologue": {
      "maps": [1],
      "characters": ["rival"]
    }
  }
}
```

派生数组必须 unique，并由 Builder 使用稳定顺序输出。

StoryIndex 的精确字段集合可以随真实 Resolver 查询需要调整。因为它是可重建的 generated read model，这不是 MVP 核心业务数据 schema 缺口，也不形成新的 authority。

# Map id 与跨 record 引用

PokeMan 所有 Content 统一使用 Map package 的业务 `mapId`：

```text
positive safe integer
```

由于 JSON object key / FSDB key 是字符串：

```text
"1"
"2"
```

在 Character `defaultScenes`、Event `maps`、Encounter record key 中都必须可无歧义解析成对应正整数 Map id，并且必须对应存在的 `struct.Map` record。

Shared State 的 `pokeman.PlayerWorld/current` 只作为 durable resume/checkpoint location，不是 live Map authority；其 `mapId` 同样使用整数业务值并必须指向存在的 Map。当前 live map / x / y / direction 仍由 Map Runtime 拥有。

跨 Content / Shared State 的完整 referential invariant：

```text
struct.Character/player
→ MUST exist

Character.defaultScenes.<mapId>
Event.states.*.maps.<mapId>
struct.Encounter/<mapId>
pokeman.PlayerWorld/current.mapId
→ existing struct.Map

Character.battleActor
Event transient battleActor
Encounter template.battleActor
→ namespace = struct.BattleActor
→ existing struct.BattleActor key

BattleActor.skills[]
Relationship.contract.skills[]
→ existing struct.BattleSkill ids

BattleSkill.effect
→ existing struct.BattleEffect key

pokeman.Relationship/A:B
→ existing struct.Character/A
→ existing struct.Character/B

pokeman.CarriedCards/A
→ existing struct.Character/A

CarriedCards(A).servantCharacterId = B
→ existing struct.Character/B
→ Relationship(A:B).contract exists
```

这些是数据合法性约束，不决定由 Builder、baseline validator 还是具体 State 写入路径在何时检查。

# Builder 校验

除业务文档已有语义检查外，Builder / Game Package validation 至少应检查：

- PokeMan 自有 struct identity 使用 FSDB key，source 不接受重复 `id` 字段；
- `struct.Character/player` 存在；
- `struct.Character` key 满足 `[a-z0-9][a-z0-9._-]{0,119}`；
- PokeMan 自有固定-target key 引用存在于目标 table；
- `struct.BattleActor / struct.BattleSkill / struct.BattleEffect / struct.BattleArena` value 满足对应 battle package contract；
- BattleActor / BattleSkill / BattleEffect / BattleArena record key 与其 value 内 definition `id` 相等；
- BattleArena `passable` 与 `data` dimensions 必须与 width / height 一致，tileset_id 指向存在的 struct.Tileset；
- BattleActor `skills[]` 每个 id 指向存在的 `struct.BattleSkill`，且同一 BattleActor 内不重复；
- BattleSkill `effect` 指向存在的 `struct.BattleEffect`；
- Character `battleActor.namespace === "struct.BattleActor"`，且 key 可解析；
- Character `defaultScenes` map key 是合法正 safe integer，且指向存在的 `struct.Map`；
- Character `defaultScenes` placement 的 `x / y` 是非负 safe integer；
- Character `defaultScenes` 的 `npcId` 指向 `struct.NPC`；
- Event state / map / npc object key 合法；
- Event map key 是合法正 safe integer，且指向存在的 `struct.Map`；
- Event directive 满足 `placement XOR absent:true`；
- `absent:true` 时必须有 `character`，且不得同时出现 `placement / battleActor / interaction`；
- Event placement 的 `x / y` 是非负 safe integer；
- Event directive 有 `character` 时禁止 `battleActor`；
- transient Event `battleActor.namespace === "struct.BattleActor"`，且 key 可解析；
- Dialogue `speaker`、Choice `target`、`mutation` 引用存在；
- Dialogue `choices` 与 `mutation` 互斥；
- EventStateMutation `to` 非空；
- EventStateMutation 所有非空 stateId 存在；
- Encounter record key 是合法正 safe integer mapId，且指向存在的 `struct.Map`；
- Encounter `count` 是正 safe integer，且不大于 `spawnPoints.length` 与 template 数量；
- Encounter spawn point `x / y` 是非负 safe integer，且同一 record 内 `(x,y)` 不重复；
- Encounter template `weight` 是正 safe integer；
- Encounter template 的 `npc` 在同一 record 内唯一并指向存在的 `struct.NPC`；
- Encounter template 的 `dialogue`（若有）存在；
- Encounter template `battleActor.namespace === "struct.BattleActor"`，且 key 可解析；
- StoryIndex 与源 Content 一致。

# 与 Shared State 的衔接

Content physical schema 只定义静态数据。长期业务事实已经由 [67-shared-state-records.md](./67-shared-state-records.md) 冻结：

```text
pokeman.PlayerWorld / current
→ durable resume/checkpoint location

pokeman.EventStateList / current
→ Event current state list

pokeman.Relationship / <from>:<to>
→ affinity / hostile / relationshipText / contract?

pokeman.CarriedCards / <holder>
→ current carried slots
```

其中：

```text
Relationship.contract.integrity
max / initial source
→ Character.battleActor
→ struct.BattleActor
→ BattleActor.max_hp

Relationship.contract.skills[]
initial source
→ copy(BattleActor.skills[])
→ struct.BattleSkill key string[]
```

Content 不复制这些 mutable values。

# MVP PWA packaging policy

当前 Story / Dialogue / Battle vertical slice 不再适合 map-only content closure。MVP PWA preparation 固定采用简单、可验证的全量策略：

```text
[FSDB]PokeMan
→ listFsdbEntries() 的全部 content entries
→ 全部进入 prepared PWA content

presentation.json
→ 所有外部 Presentation resource refs
→ 全部进入 prepared PWA content
```

因此 packager 不负责理解 StoryIndex / Event / Dialogue / Battle dependency graph，也不根据初始 Map 去裁剪 PokeMan FSDB。Content Builder / validator 负责引用正确性，packager 只负责 deterministic identity mapping、读取、去重和排序。

当前 MVP 明确不做 Content tree-shaking。这样可以保证 Runtime 通过合法 key 动态解析到的 Character、Dialogue、Event、Mutation、BattleActor、BattleSkill、BattleEffect、BattleArena、Map/Tileset/Graphics 都实际存在于 PWA 包中。


# 当前冻结结论

经过最终数据闭环复核，PokeMan MVP 的核心 Content physical schema 与跨 record 引用已经收口。

具体冻结：

```text
MVP player Character = struct.Character/player

BattleActor  → struct.BattleActor
BattleSkill  → struct.BattleSkill
BattleEffect → struct.BattleEffect
BattleArena  → struct.BattleArena
BattleActor.skills[] → BattleSkill key string[]
BattleSkill.effect → BattleEffect key string
battleActor ContentRef.namespace = struct.BattleActor

Character / Dialogue / Event / EventStateMutation / Encounter / StoryIndex identity
= 已冻结

Character / Event / Encounter / PlayerWorld map references
→ existing struct.Map

Encounter
→ count
→ unique spawnPoints
→ unique template.npc
→ positive weight
→ weighted selection without replacement by template

Relationship / Contract / CarriedCards cross-Character references
→ existing struct.Character

Contract.skills[]
→ existing struct.BattleSkill
```

以下不再列为 MVP 核心 Content physical-schema gap：

```text
Battle Content namespace / table binding
BattleSkill identity / Contract.skills[] encoding
Dialogue choices / mutation exclusivity
Event absent 的第二套 takeover 结构
EventStateMutation semantic no-op proof
Encounter generation count / template weight / duplicate-template semantics
StoryIndex 最终派生字段
Encounter seed / concrete sampling algorithm / re-entry / respawn / persistence
本地化、头像 / 表情 / 音效等 future presentation metadata
```

每个 struct table 仍需要实际 `.info.meta` / exact schema 文件，但这是把本文已经冻结的 shape 与 package contract 落成 FSDB 可执行校验的实现工作，不代表还需要重新设计业务数据模型。