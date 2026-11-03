# 数据模型图

> 独立技术设计记录。不改写 `../DESIGN.md`。本文只提供当前 data authority / FSDB identity 的总览图；Shared State 物理结构以 [67-shared-state-records.md](./67-shared-state-records.md) 为准，Content FSDB 结构以 [68-content-fsdb.md](./68-content-fsdb.md) 为准。

# Content / State / Runtime

```mermaid
flowchart TB
  subgraph Content[Content / FSDB]
    Character["struct.Character / <characterId>"]
    NPC["struct.NPC / <npcId>"]
    BattleActor["struct.BattleActor / <battleActorId>"]
    BattleSkill["struct.BattleSkill / <battleSkillId>"]
    BattleEffect["struct.BattleEffect / <battleEffectId>"]
    Dialogue["struct.Dialogue / <dialogueId>"]
    Event["struct.Event / <eventId>"]
    Mutation["struct.EventStateMutation / <mutationId>"]
    Encounter["struct.Encounter / <mapId>"]
    StoryIndex["struct.StoryIndex / current"]
    Graphics["resource.Graphics / ..."]
  end

  subgraph State[Shared State]
    PlayerWorld["pokeman.PlayerWorld / current\ndurable checkpoint"]
    EventStateList["pokeman.EventStateList / current"]
    Relationship["pokeman.Relationship / <from>:<to>"]
    Contract["contract? { integrity, skills[] }"]
    Carried["pokeman.CarriedCards / <holder>"]
  end

  subgraph Runtime[Runtime Memory]
    StoryResolver["Story Resolver"]
    NPCInstance["World-side NPC Instance"]
    MapRuntime["Map Runtime\nlive map / player pose / motion / scene"]
    DialogueRuntime["Dialogue Runtime\ncurrent dialogue / line / choice"]
    BattleRuntime["Battle Runtime Actor"]
    EncounterRuntime["generated Encounter set"]
  end

  NPC --> Graphics
  Character --> BattleActor
  BattleActor --> BattleSkill
  BattleSkill --> BattleEffect
  Character --> NPC
  Character --> Dialogue

  Dialogue --> Mutation
  Event --> Character
  Event --> NPC
  Event --> Dialogue
  Event -. transient .-> BattleActor
  Encounter --> NPC
  Encounter --> Dialogue
  Encounter --> BattleActor

  EventStateList --> StoryResolver
  StoryIndex --> StoryResolver
  Character --> StoryResolver
  Event --> StoryResolver
  Encounter --> StoryResolver
  StoryResolver --> NPCInstance
  NPCInstance --> MapRuntime

  Relationship --> Contract
  Carried --> Relationship
  Character --> Relationship
  Contract --> BattleRuntime
  Character --> BattleRuntime
  BattleActor --> BattleRuntime

  Dialogue --> DialogueRuntime
  Mutation --> DialogueRuntime
  DialogueRuntime --> EventStateList

  MapRuntime -. explicit save/checkpoint .-> PlayerWorld
  PlayerWorld -. load / resume .-> MapRuntime
  Encounter --> EncounterRuntime
```

# FSDB identity

```mermaid
flowchart LR
  PFile["[struct]Character/player.json"] --> PId["struct.Character / player\nMVP player identity"]
  CFile["[struct]Character/rival.json"] --> CId["struct.Character / rival"]
  AFile["[struct]BattleActor/rival.json"] --> AId["struct.BattleActor / rival"]
  SFile["[struct]BattleSkill/firebolt.json"] --> SId["struct.BattleSkill / firebolt"]
  FFile["[struct]BattleEffect/firebolt.json"] --> FId["struct.BattleEffect / firebolt"]
  DFile["[struct]Dialogue/lab-rival-intro.json"] --> DId["struct.Dialogue / lab-rival-intro"]
  EFile["[struct]Event/prologue.json"] --> EId["struct.Event / prologue"]
  MFile["[struct]EventStateMutation/prologue-to-route.json"] --> MId["struct.EventStateMutation / prologue-to-route"]
  XFile["[struct]Encounter/2.json"] --> XId["struct.Encounter / 2\nmapId = 2"]
  GFile["[resource]Graphics/Characters/Rival.png"] --> GId["resource.Graphics / Characters/Rival"]
```

```text
PokeMan 自有 struct record key
= definition identity

PokeMan 自有 source value
!= 再保存一份 id

BattleActor / BattleSkill / BattleEffect
= package-owned contract
= PokeMan binding 要求 FSDB key = value.id
```

固定目标 PokeMan table 的引用只保存 key；`battleActor` 使用 `{namespace,key}` ContentRef，但 MVP namespace 固定为 `struct.BattleActor`。BattleSkill / Contract skill identity 直接复用 battle 模块的 string id，不建立第二套引用。

# Character / NPC / Battle

```mermaid
flowchart LR
  Character["struct.Character / rival"] -->|battleActor ContentRef| BaseActor["struct.BattleActor / rival"]
  Character -->|defaultScenes mapId + npcId| NPCDef["struct.NPC / rival-casual"]
  NPCDef --> Sprite["resource.Graphics / Characters/RivalCasual"]

  PersistentInstance["persistent NPC Instance"] --> Character
  TransientSource["Encounter / Event transient source"] --> BaseActor
  TransientInstance["transient NPC Instance"] --> TransientSource

  BaseActor --> Skills["struct.BattleSkill / <skillId>"]
  Skills --> Effect["struct.BattleEffect / <effectId>"]
```

固定：

```text
MVP player Character
→ struct.Character/player

Persistent NPC Instance
→ Character
→ same base BattleActor

Transient NPC Instance
→ Encounter / Story source
→ base BattleActor

BattleActor.skills[]
→ existing struct.BattleSkill ids

BattleSkill.effect
→ existing struct.BattleEffect id
```

不建立 NPC Instance BattleActor variant / resolved Battle profile authority。

# Character default scene / Event takeover

```mermaid
flowchart TD
  Check{"Any active Event directive\ncharacter = X ?"}
  Default["Use Character X.defaultScenes"]
  EventOnly["Exclude all defaults\nUse Event sources only"]
  Result["Merge scene sources"]

  Check -->|No| Default
  Check -->|Yes| EventOnly
  Default --> Result
  EventOnly --> Result
```

`absent:true` 只表示该 Event 明确提到 Character 但不贡献 placement；它不压制其他 Event placement，也不建立 priority。`absent:true` 必须带 `character`，且不允许同时有 `placement / battleActor / interaction`。

# Event FSDB shape

```mermaid
flowchart LR
  EventRecord["struct.Event / prologue"] --> States["states.<stateId>"]
  States --> Maps["maps.<decimal-mapId>\n→ existing struct.Map"]
  Maps --> Npcs["npcs.<npcId>"]
  Npcs --> CharacterRef["character? → Character key"]
  Npcs --> Placement["placement XOR absent:true"]
  Npcs --> DialogueRef["interaction.dialogue? → Dialogue key"]
  Npcs -. transient only .-> BattleRef["battleActor? → struct.BattleActor ContentRef"]
```

`eventId / stateId / mapId / npcId` 都由 FSDB / object key 表达，不在 value 里重复保存。

# Dialogue

```mermaid
flowchart LR
  Dialogue["struct.Dialogue / <dialogueId>"] --> Lines["lines[]"]
  Lines --> Speaker["speaker? → Character key"]
  Dialogue --> SpeakerName["speakerName?\npresentation only"]
  Dialogue --> Choice["choices?[]"]
  Choice --> Target["target → Dialogue key"]
  Dialogue --> Mutation["mutation? → EventStateMutation key"]
```

```text
choices 与 mutation 互斥
允许两者都不存在
```

# Event state

```mermaid
flowchart LR
  EventContent["struct.Event / <eventId>"] --> LegalStates["legal stateIds"]
  EventStateList["pokeman.EventStateList / current"] --> Current["eventId → current non-null stateId"]
  Mutation["struct.EventStateMutation / <mutationId>"] --> From["from: eventId → stateId | null"]
  Mutation --> To["to: eventId → stateId | null"]
  From --> Commit["Runtime validates all from"]
  Current --> Commit
  To --> Commit
  Commit --> EventStateList
```

```text
no EventStateList entry
= logical current state null
```

Mutation 只改变 Event current state，不创建 Contract / Card / Battle。数据结构只要求 `to` 非空，不额外证明每次执行都一定改变值。

# Relationship / Contract / Card

```mermaid
flowchart LR
  A["struct.Character / A"] --> Rel["pokeman.Relationship / A:B"]
  B["struct.Character / B"] --> Rel
  Rel --> Affinity["affinity / hostile / relationshipText"]
  Rel --> Contract["contract?\nintegrity / skills[]"]
  Contract --> Carried["pokeman.CarriedCards / A\nslot + servant B"]
  B --> BaseActor["struct.BattleActor / base actor"]
  BaseActor --> ContractInit["new Contract init"]
  ContractInit --> Contract
```

```text
Relationship Record exists
!= Contract exists

Contract exists
!= currently carried
```

Contract initialization / invariant：

```text
integrity = BattleActor.max_hp
0 <= integrity <= BattleActor.max_hp
skills[]  = copy(BattleActor.skills[])
skills[]  → existing struct.BattleSkill ids
```

MVP 不保存 `maxIntegrity`，也不建立 `cardId`。

# Shared State absence

```text
PlayerWorld/current absent
→ invalid PokeMan State

EventStateList/current absent
→ invalid PokeMan State
→ empty active set = []

Relationship/A:B absent
→ no persisted Relationship

CarriedCards/A absent
→ business []
→ equivalent to materialized [] for party semantics
```

# Card Battle

```mermaid
flowchart TD
  Carried["pokeman.CarriedCards / A\nservant B"] --> Select["Select servant B"]
  Contract["pokeman.Relationship / A:B\ncontract.integrity / skills[]"] --> Build["Build Battle Runtime Actor"]
  Character["struct.Character / B"] --> ActorRef["battleActor ContentRef"]
  ActorRef --> BaseActor["struct.BattleActor\nmax_hp / definitions"]
  BaseActor --> Build
  Select --> Build
  Build --> Battle["Battle Simulation"]
  Battle --> Persist["Persist long-lived integrity result"]
  Persist --> Contract
```

Battle live HP / tile / action / plan 等只属于 Battle Runtime。

# Map live state / durable resume

```mermaid
flowchart LR
  MapRuntime["Map Runtime\nlive mapId / x / y / direction / motion"] -->|explicit save/checkpoint| Resume["pokeman.PlayerWorld / current\nmapId → existing struct.Map"]
  Resume -->|Load / start new Map Runtime| MapRuntime2["new Map Runtime"]
```

不允许 Map Runtime 与 Shared State 同时成为“当前 live player pose”的 authority。

# Encounter

```mermaid
flowchart LR
  Encounter["struct.Encounter / <mapId>\n→ existing struct.Map"] --> Count["count"]
  Encounter --> Spawn["spawnPoints[]\nunique (x,y)"]
  Encounter --> Templates["templates.<templateId>"]
  Templates --> Weight["weight"]
  Templates --> NPC["npc → struct.NPC\nunique per Encounter record"]
  Templates --> Dialogue["dialogue? → struct.Dialogue"]
  Templates --> Actor["battleActor → struct.BattleActor"]
  Encounter --> Runtime["weighted selection\nwithout replacement"]
```

```text
count = 每次生成数量
weight = template 相对选择权重
count <= spawnPoints.length
count <= number of templates
template.npc unique per Encounter record
one template selected at most once per generation
```

具体 weighted sampling 实现、spawn selection、seed、re-entry reroll、respawn、defeated persistence、清理时机属于 Runtime/gameplay policy，不建立额外 Content / Shared State 字段。

# 一句话总览

```text
Content
= 安装后只读定义；FSDB identity / package binding 已闭环

Shared State
= 这一局跨 Subsystem 共享的长期 mutable facts

Runtime Memory
= 当前 Subsystem 正在执行的 live authority / working set
```

当前 MVP 核心业务数据 physical schema 与跨 record reference graph 已收口；后续 `.info.meta` / validator / Runtime 实现属于落地工作。