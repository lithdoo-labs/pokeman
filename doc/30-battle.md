# Battle

> 从 `../DESIGN.md` 拆分；原文档保持不变。

## Battle 的产品定位

从者不是被逐步遥控的棋子。主公不直接提交“左移两格 → 使用技能 A → 指定敌人 B”这样的细粒度命令，而是逐渐获得表达高层战术意图的能力，例如：

```text
“先拉开距离，找机会反击。”
“别管防守，尽快解决对方。”
“保护自己，不要冒险。”
“把对方逼到墙边。”
“尽量不要下重手。”
```

Battle 基本结构保持：

```text
Battle Observation / Constraints
          ↓
Decision / LLM
          ↓
PlanSubmission
          ↓
Simulation validation / execution
          ↓
Battle Result
```

未来加入 Player Guidance 后：

```text
主公战术指令 / Guidance
          ↓
角色能力 + 性格 + 战斗经验 + 好感 / 信赖 + 当前战局
          ↓
Decision / LLM
          ↓
PlanSubmission
          ↓
Simulation
          ↓
实际战斗结果
```

**Decision 决定想做什么；Simulation 决定能不能做、什么时候发生以及结果是什么。**

## HP 对契约关系意味着 Contract Integrity

对于通过角色卡形成的 **Battle Manifestation**，Battle 中的 `HP` 不表示角色本体生命值，而表示：

> **这份有向 Relationship 中 Contract 的战斗完整度 / 显现稳定度。**

MVP Contract 是 Relationship 内的长期状态：

```text
Relationship(holder → servant)
└─ contract
   ├─ integrity
   └─ skills[]
```

当前 Card 只表示这份已成立契约是否被编入随身队伍以及所在 slot。

内部 Simulation 可以继续使用连续数值 `hp`，产品上把它解释为角色卡完整度；技术 authority 始终是 `Relationship.contract.integrity`。例如概念上：

| 卡片状态 | Battle HP / Integrity | 产品语义 |
| --- | ---: | --- |
| 完好 | 较高 | 显现稳定，可以正常继续战斗 |
| 受损 | 中等 | 这份契约的战斗显现已经出现明显损耗 |
| 残破 | 很低但大于 0 | 显现非常不稳定，接近无法继续战斗 |
| 战斗中归零 | 0（仅为本场 Simulation terminal 状态） | 本场显现体被击败；正常 Battle 结算时，Contract Integrity 最低保存为 1 |

具体状态名称、视觉效果和百分比阈值以后再调；当前只固定 **Battle HP 映射 `Relationship.contract.integrity`，而不是角色本体生命值**。

例如：

```text
宿敌本体：仍然在研究所正常生活

Relationship(player → rival):
contract:
  integrity: 35
  skills: [firebolt, grab]

Card(player, rival):
slot = 0        // 当前随身
```

这些可以同时成立。

`Battle Simulation 中 HP = 0` 表示该显现体在本场战斗中被击败，并不意味着角色本人昏迷、死亡或受到同等物理伤害。对 Contract-backed Manifestation，正常 Battle 结果结算时，持久化值使用 `max(1, finalSnapshot.hp)`：非零 HP 原样保存，归零的卡片保存为 1 HP。因此正常 Battle 不会把 Contract 持久化为 0；若读取到历史或外部写入的 `integrity = 0`，该 Contract 仍不能形成新的 Battle Manifestation，必须先由业务修复。

长期 Integrity 在 Battle 结束后写回同一 Contract，因此即使随后把 Card 从随身队伍移除，损耗也不会消失：

```text
正常受损的情况：

Relationship(player → rival).contract.integrity = 100
↓
Card(player, rival, slot=0) 进入 Battle
↓
Battle hp 100 → 48
↓
Battle 正常结束并结算
↓
Relationship(player → rival).contract.integrity = max(1, 48) = 48
↓
Card 可以继续随身，也可以从随身队伍移除
↓
Integrity 仍然是 48
↓
到达中心
↓
修复 contract.integrity → BattleActor.max_hp

本场被击败的情况：

Battle finalSnapshot.hp = 0
↓
BattleResult 先按原始 final Snapshot 判定胜负
↓
正常退出 Battle 时结算
↓
Relationship(player → rival).contract.integrity = max(1, 0) = 1
```

这样道路上的连续战斗会产生类似传统 Pokémon 的旅行资源压力，但设定上消耗的是契约关系的战斗显现能力，而不是远处角色本人的生命值。

### 本体直接参战时

普通敌对人物、独立从者等可以由世界本体直接进入同一个 Battle Simulation。此时 Simulation 中的 HP 可以表达**本场战斗内的体力 / 战斗状态 / 被击败程度**，不要求把这份数值保存成角色长期生命条。

```text
契约关系调用的 Battle Manifestation HP
→ 从 Relationship.contract.integrity 初始化
→ Battle 结束后写回 Relationship.contract.integrity
→ 可跨 Battle / 随身切换持续，并由中心修复

世界本体直接参战 HP
→ 本场 Battle 的战斗状态
→ 0 表示被击败 / 制服 / 无法继续战斗
```

二者共用 Battle 机制，但产品语义不同。

## 基础 BattleActor 与 NPC Instance

MVP 不设计 NPC Instance 专属的 BattleActor variant。

对于持久 Character：

```text
Character
→ stable BattleActor Content
```

同一个 Character 即使在不同 Map、不同 Event state、不同服装 / NPC Definition 下出现：

```text
Character rival
├─ NPC Instance A
├─ NPC Instance B
└─ NPC Instance C
```

这些实例解析到的基础 BattleActor identity 仍然相同。NPC Instance 只表示“当前世界中具体出现的是谁 / 哪个实例”，不改变这个 Character 的 BattleActor identity。

对于没有 Character 的 transient Encounter / Story NPC：

```text
Encounter / Story static source
→ BattleActor Content
→ transient NPC Instance
```

也就是说，NPC Instance 在 Runtime 中可以**解析到一个基础 BattleActor**，但 MVP 不另外生成 `resolved BattleActor`、`battle profile variant` 或一份覆盖后的 actor definition。

## Contract 建立时的 Battle 默认值

建立 Contract 时，Runtime 以当前交互目标 NPC Instance 为对象，并通过它解析到对应基础 BattleActor：

```text
目标 NPC Instance
↓
基础 BattleActor Content
├─ max_hp
└─ skills[]
↓ create Contract
Relationship.contract
├─ integrity = BattleActor.max_hp
└─ skills[] = copy(BattleActor.skills[])
```

MVP 同时固定：

```text
Contract 初始 Integrity = BattleActor.max_hp
Contract Integrity 上限 = BattleActor.max_hp
```

Contract 不额外保存 `maxIntegrity`；需要完整值 / 修复上限时，通过这名 servant 的稳定基础 BattleActor 读取 `max_hp`。

这里读取的是**基础 BattleActor 静态默认值**，不是目标 NPC 刚结束某场本体 Battle 后剩余的当前 HP。本体 Battle HP 与 Contract Integrity 仍是不同语义。

Contract 建立完成以后，`contract.integrity / skills[]` 成为这份 Contract 的长期状态。BattleActor 的 `skills[]` 仍是初始 baseline；已有 Contract 的 `skills[]` 不会因为之后重新读取基础 BattleActor 而被自动覆盖。

## MVP 技能来源

PokeMan 不定义平行 Skill schema，技能定义仍然来自 `@loomrealm-game/battle` 的 BattleSkill Content。

没有 Contract 的本体 / transient actor：

```text
NPC Instance
→ 基础 BattleActor
→ BattleActor.skills[]
→ 本场 Battle Runtime Actor
```

建立 Contract：

```text
NPC Instance
→ 基础 BattleActor.skills[]
→ copy
→ Relationship.contract.skills[]
```

Contract 对应的 Card Battle：

```text
Relationship.contract.skills[]
→ 当前实际可用技能
```

也就是说，`BattleActor.skills[]` 是人物 / 临时 actor 的基础技能定义，也是新 Contract 的初始化 baseline；Contract 建立以后，该契约当前实际技能集由自己的 `contract.skills[]` 持有。

MVP 不增加：

```text
experience
skill points
unlock tree
learnedSkillIds
baseSkills + learnedSkills merge
forget skill
skill slot progression
```

以后真的做技能学习时，可以直接修改 / 扩展 `contract.skills[]` 的业务规则，不要求现在先设计完整成长系统。

## 多随身卡后的默认 Battle 使用方式

当剧情以后解锁多个随身角色卡位时，**默认仍保持单场 1v1 Battle**。主公在进入 Battle 时从当前随身角色卡中选择一张作为本场出战卡：

```text
多个随身 Card
↓
Battle 开始前选择 1 张
↓
通过 holder / servant 找到对应 Relationship.contract
↓
读取 servant Character 的基础 BattleActor
↓
读取 contract.integrity / skills[]
↓
形成 Battle Manifestation
↓
默认 1v1 Battle
```

这样“携带多张卡”首先扩大旅行队伍和出战选择，而不会因为第二个随身位解锁就立即要求基础 Battle 改造成多人战。

长期可以在真实玩法需要时继续扩展：

```text
Battle 中换卡
→ 特殊规则 2v2
→ 多人协同 Battle
```

这些扩展不在序章阶段实现，也不改变当前默认 1v1 的基础规则。

## 角色性格真实影响战斗

产品目标：同一句 Guidance，不同人物应产生不同理解和执行方式。角色性格、能力、关系和当前战局共同影响 Decision，避免所有从者最终表现为同一种通用 AI。

同一个 Character 被不同主公契约时，各自有向 Relationship 的 affinity、Contract Integrity、技能集以及未来 Guidance / 成长状态可以不同，因此同一人物的不同契约 Battle Manifestation 也可以形成不同表现。

**当前 v0 实现边界：** 这仍是产品目标，不代表当前 Battle v0 已经接入人物性格。canonical BattleDecisionContextV0 只包含 actorId / team、实时战斗状态、技能、地图窗口、近期事件和 PlanConstraints；不包含 Character.aiCharacterText、Relationship.affinity 或 relationshipText。PlayerGuidance 也尚未实现。当前不能声称角色性格或主公战术指令已经影响首场 Battle 的决策。未来必须通过 typed、request-scoped DecisionWorkflow extension 实现，不得用全局 mutable prompt state 绕过 Battle contract。

Map 4 首场互换角色卡的实际 roster 与参数见 [80-battle-scenario-design.md](./80-battle-scenario-design.md)。

## 长期养成方向

序章 / MVP **不实现也不冻结完整 progression / training State schema**。

长期仍可以有：

- **训练**：提高这份契约关系能够发挥的战斗能力；
- **技能学习**：改变该 Contract 当前拥有的 `skills[]`；
- **好感度 / 信赖**：影响从者理解、信任和采纳主公战术意图的程度；
- **关系成长**：来自 Dialogue、Event、选择和共同经历；
- **随行成长**：来自一起旅行、Pocket Dialogue 和角色事件；
- **主公成长**：提升组织、携带、调用和表达复杂 Guidance 的能力。

这些是未来产品方向，不要求 MVP 先引入 `progression` 字段、等级系统或通用训练模型。当前 Contract 只需要：

```text
contract
├─ integrity
└─ skills[]
```

等真实玩法出现以后，再扩展 Contract 的长期状态。