# Encounter、Challenge 与核心游戏循环

> 从 `../DESIGN.md` 拆分；原文档保持不变。

## Visible Encounter 是长期基础玩法

道路与危险区域以 **Visible Encounter（可见遭遇）** 作为长期基础遭遇形式。

> **人物先真实出现在 Map 上，玩家能够看见对方，然后才因为空间接触、发现、主动交互或剧情冲突进入 Dialogue / Challenge / Hostile Battle。**

```text
Map 上出现 Character / Encounter Entity
↓
玩家提前看见对方
↓
玩家主动接近 / 进入视野 / 发生接触 / 剧情触发
↓
Dialogue / Hostile Action / Challenge / Event
↓
必要时 Battle
↓
返回 Map
```

不以“走若干步后无预兆抽出隐藏敌人并直接切 Battle”作为道路基础玩法。

## 普通可见 Encounter 在进入地图时生成

对于普通、可重复的道路 Encounter，不需要在每一步移动时抽随机事件，而是在 **进入地图时** 根据该地图配置随机决定本次出现哪些普通 Encounter Entity，并把它们直接放到可见 Map 空间中。

概念流程：

```text
Map Enter
↓
读取该地图 Encounter / Spawn 配置
↓
随机决定本次出现的普通 Encounter Entity
↓
放置到合法 Spawn Point
↓
玩家在地图上直接看见它们
↓
绕过 / 接近 / 被发现 / 交互
```

例如同一条道路可以在不同进入实例中出现不同组合：混混、普通挑战者、旅行者、空位等。

当前 MVP authored Encounter 数据已经固定：`count` 定义每次生成数量，`spawnPoints[]` 定义合法出生点，`templates.<templateId>.weight` 定义候选 template 的相对选择权重。具体 weighted selection 实现、随机 seed、重进地图是否重新 roll 等仍属于 Runtime / gameplay policy；产品层只固定“**地图进入时生成，生成后可见**”。

### Re-entry / persistence 属于 Runtime policy

“离开地图再回来是否重新 roll”“已经击败的 Encounter 是否继续消失”“生成结果何时清理”“是否跨 Session 保留”等，不在当前数据物理结构阶段提前决定。

这些首先属于 **Runtime / gameplay behavior policy**：

```text
离开 / 重进 Map
↓
Runtime policy 决定
├─ 重新生成
├─ 复用本次结果
├─ 保留已击败事实
└─ 其他业务行为
```

只有未来这套行为规则真的要求跨 Frame / Map / Session 持续某些事实时，才根据最小需求决定是否需要 Shared State，以及具体保存什么。

因此当前数据设计**不预设**：

```text
EncounterGeneratedState
generatedInstances[]
defeatedIds[]
spawn snapshot
random seed record
```

这些都不是当前数据物理结构的未决阻塞项。

Persistent Character 和剧情人物不要求通过随机生成产生，它们可以由世界状态和剧情决定位置与是否出现。

## Encounter Entity 与 Persistent Character

不是每个路边人物都需要进入完整长期关系系统：

```text
Visible Encounter Entity
├─ ordinary / transient
│    → 本次或本区域使用
│    → 有本次 Dialogue / Battle 表现
│    → 不要求永久 Relationship / Contract / story
│
└─ persistent character
     → stable characterId
     → Relationship: affinity / hostile / dynamic text
     → optional Contract
     → current Card if carried
     → story progress
     → 可以反复相遇、发展关系甚至收服
```

普通混混、一般帮派成员、普通挑战者可以是 transient；宿敌、重要从者、功能 NPC、剧情人物和重要主公更适合作为 persistent character。

Transient Encounter NPC 不需要为了固定 Dialogue 创建一个“通用 Character”。如果一段固定 Dialogue 只需要显示这类临时 NPC 的说话者名字，可以直接使用 Dialogue Content 的默认 `speakerName`：

```text
Dialogue.speakerName = "路霸"
```

这只是说话者显示名，不是 Character identity，也不建立 Relationship / Contract / Event Character 等长期关联。同一段 Dialogue 可以被多个不同 transient NPC Instance 复用，而不会把它们解释成同一个人。

Transient Encounter NPC 需要进入 Battle 时，由 Encounter / Story 静态来源指定一个基础 `BattleActor`；NPC Instance 使用这个基础模板，不生成独立 BattleActor variant。

## Battle 对手不等于从者

常见 Battle actor 可以来自：

1. **敌对普通人物本体**：混混、盗贼、路霸、敌对组织成员等；
2. **独立从者 / 修行者本体**：尚未与玩家建立契约但具有战斗能力；
3. **其他主公调用的战斗化身**：通过自己的随身角色卡参战。

所以：

```text
Battle Actor ≠ Character Card ≠ 从者身份
```

## Hostile 与 Challenge

已经发生敌对行为时：

```text
Visible Encounter
↓
抢劫 / 袭击 / 堵路 / 追杀 / 剧情冲突
↓
Hostile 成立
↓
强制 Battle
```

非敌对人物通过邀请进入 Challenge：

```text
角色邀请 Battle
↓
玩家选择
├─ 应战 → Battle
└─ 拒绝 → 返回 Map / Dialogue
```

玩家也可以主动邀请其他人物，对方根据关系、性格、当前状态和剧情条件接受、拒绝或提出条件。

玩家可以越过对方意愿强制开战，但必须承担关系和世界状态后果。世界不默认玩家永远代表正确的一方。

Battle 对关系的影响由情境决定，不使用统一“胜利 = affinity +N”规则。敌对也是动态关系状态，而不是永久人物类别。

MVP 的长期人物关系统一使用当前 Relationship 模型：

```text
Relationship(A → B)
├─ affinity
├─ hostile
├─ dynamic relationship text
└─ contract?
```

Transient Encounter Entity 不要求为了本次遭遇创建这套长期 Relationship。

# 核心游戏循环

```text
System Menu #root
      ↓
进入 / 读取游戏
      ↓
中心查看已契约 Relationship / Contract、修复 Integrity、选择随身 Card
      ↓
探索世界（Map）
      ↓
看见 Character / Encounter Entity / Event
      ↓
Dialogue / Interaction
      ↓
关系变化 / Challenge / Hostile Encounter
      ↓
Battle（可选或强制）
      ↓
Contract Integrity / Relationship / World State 返回世界
      ↓
满足人物自己的收服条件
      ↓
建立 Relationship.contract
      ↓
按需要编入有限随身 Card slot
      ↓
Pocket Dialogue / Event / Battle
      ↓
继续旅行或返回中心整理
```

System Menu 可以在允许的游戏状态中再次作为新 Frame 入栈；Message 则作为需要玩家处理的模态 Frame 临时压到当前栈顶。