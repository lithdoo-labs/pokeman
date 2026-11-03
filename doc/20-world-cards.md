# 世界、角色与角色卡

> 从 `../DESIGN.md` 拆分；原文档保持不变。

## 主公、从者与角色卡

- **主公**：某段角色卡关系中持有并组织对方角色卡的一方。玩家在主要冒险视角中首先以主公身份探索、选择、收服、携带和组织从者。
- **从者**：某段角色卡关系中被角色卡代表、能够被持卡者持续连接并调用力量的一方。
- **角色卡**：角色与另一方建立正式关系后，用于表达角色身份、契约、持续连接、口袋陪伴和力量调用的可持有媒介。
- **好感度 / 关系**：人与人之间的关系事实，影响 Dialogue、事件、收服、挑战、战术协作和后续成长。

**主公 / 从者首先是关系位置，而不是固定职业、阶级、物种或永久身份。**

同一个人物可以：

```text
作为 A 的从者
+
作为 B、C 的主公
+
继续拥有自己的世界身份、职业和生活
```

“收服从者”是玩家视角下对建立正式角色卡关系的表达，不意味着世界把人物永久转换成某种“从者物种”。

## 收服不是统一捕获动作

从者首先是世界中的人物。玩家通过具体人物内容推进关系：

```text
认识角色
→ 建立关系
→ Dialogue / Event / Battle / 共同经历
→ 获得角色认可
→ 建立正式关系
→ 获得代表该角色的角色卡
```

不同人物可以拥有不同收服路线：关系型、挑战型、事件型、复合型、条件型。

**收服本身就是角色 RPG 内容的一部分。**

当前不设计“契约结束”系统。正式建立的契约默认持续有效；把角色卡移出随身位、放回中心管理器，不会解除契约或取消收服。

## 双向契约真实成立

序章中，玩家和宿敌建立真实双向关系：

```text
玩家获得：宿敌角色卡
宿敌获得：玩家角色卡
```

两张卡都是真实契约结果，不是临时教学道具。

因此：

```text
玩家相对宿敌：是主公，同时也是宿敌的从者
宿敌相对玩家：是主公，同时也是玩家的从者
```

双向契约不会让任何一方本体消失，也不会妨碍双方继续建立其他主公 / 从者关系。

玩家自己的角色卡在序章之后是否成为可持续主动分发的长期系统，暂不在序章阶段决定。

## 同一人物可以对应多份独立契约

同一个人物可以与不同主公分别建立独立契约：

```text
Character B
├─ Relationship(A → B)
│  └─ Contract A
├─ Relationship(C → B)
│  └─ Contract C
└─ Relationship(D → B)
   └─ Contract D
```

这些关系共享同一个人物的核心事实，例如：

- identity；
- personality；
- 世界中的本体与剧情；
- 基础人物设定与能力来源；
- BattleActor / BattleSkill 静态 Content。

但每一份有向 Relationship / Contract 独立拥有这段契约长期存在的业务状态。

MVP 当前 Contract 只需要：

```text
Relationship(A → B)
├─ affinity
├─ hostile
├─ dynamic relationship text
└─ contract?
   ├─ integrity
   └─ skills[]
```

这里：

- `integrity` 是这份契约的 Battle Manifestation 长期完整度；
- `skills[]` 是这份契约当前实际拥有的 BattleSkill ids；
- 每个持久 Character 稳定引用一个基础 BattleActor Content；同一 Character 的不同 NPC Instance 不改变这个 BattleActor identity；
- transient Encounter / Story NPC 则由自身静态来源指定基础 BattleActor；
- 建立 Contract 时，Runtime 先从当前目标 NPC Instance 找到它的基础 BattleActor，然后初始化：`contract.integrity = BattleActor.max_hp`、`contract.skills[] = copy(BattleActor.skills[])`；
- MVP 的 Contract Integrity 上限同样来自这份基础 BattleActor 的 `max_hp`，不额外保存第二份 max；
- Contract 创建完成后，`integrity / skills[]` 成为这份 Contract 的长期状态；后续真的加入技能学习时，可以改变 `skills[]`。

Contract Integrity 的初始化不是“这名 NPC 刚打完一场本体 Battle 后剩余多少 HP”。本体 Battle HP 与 Contract Integrity 是不同产品语义。

**MVP 不定义独立 `progression / training` State。** 训练、等级、技能成长等仍是长期产品方向，但等真实玩法出现以后再扩展 Contract，不提前冻结成长 schema。

是否当前随身不是 Relationship / Contract 的长期属性，而由当前 `Card` State 表示。

因此，同一场 Battle 中允许双方使用代表同一个 Character 的角色卡，不增加“同一人物只能有一个 Battle Manifestation”的唯一性限制。例如：

```text
Relationship(A → rival).contract
├─ integrity = 80
└─ skills = [...]
→ A 当前随身的 rival Card
→ 宿敌 Battle Manifestation A
                         VS
Relationship(B → rival).contract
├─ integrity = 45
└─ skills = [...]
→ B 当前随身的 rival Card
→ 宿敌 Battle Manifestation B
```

这不解释为角色本体被复制成两个真人，而是**不同契约关系分别调用同一个人物的战斗显现**。

# 角色卡管理与“口袋”

## Relationship、Contract 与随身 Card 是不同事实

```text
Relationship
= A → B 当前持续存在的有向关系
= 可以存在而 contract 为空
= 保存 affinity / hostile / dynamic text

Relationship.contract exists
= A 已经以主公身份与 B 建立正式契约
= 保存这份契约长期的 integrity / skills[]

Card / 随身角色卡
= 这份已成立契约当前被编入本次旅行的随身队伍
= 只保存当前随身关系与 slot
```

所以：

> **已收服多少人物，与本次旅行能够携带多少人物，是两个独立概念。**

产品文案仍可以把中心里可查看、可编队的契约称为“已管理角色卡”，但技术上它不是额外的 `ManagedCard` State authority：中心管理器展示的是已成立 Relationship / Contract 及其长期状态；当前真正随身的那一部分再由 `Card` State 表示。

MVP 不为 Card 建立独立 identity / `cardId`。当前 Card 只需要表达：

```text
holderCharacterId
servantCharacterId
slot
```

它没有脱离当前随身状态之外的独立生命周期；长期 identity 与状态来自对应 Relationship / Contract。

## 随身角色卡数量有限

主公不能把所有已经获得的角色卡同时带在身上。

当前确认：

```text
序章随身角色卡上限 = 1
当前随身角色卡 = 宿敌卡
```

后续随身位会随着剧情推进逐步解锁，但具体解锁节奏和最终上限不在序章阶段设计。

原则上只有当前随身角色卡进入本次旅行的 Pocket / Battle 编队：

```text
随身角色卡
→ Pocket Dialogue
→ 环境 / NPC / Event 反应
→ 当前 Battle 可调用角色

其他已契约 Relationship / Contract
→ 契约继续存在
→ affinity / integrity / skills[] 继续存在
→ 不作为当前 Pocket Companion
→ 默认不能直接用于当前野外 Battle
```

这意味着“带谁出门”同时决定：

```text
Battle 编队
+ Dialogue 编队
+ 探索编队
+ 角色事件编队
```

## 中心管理器

未编入随身位的已契约关系统一由 **中心管理器** 提供管理视图。该名称仍是工作概念，正式世界观名称和设施形态以后再定。

中心定位为标准化的角色卡服务设施，整体旅行节奏参考传统 Pokémon Center + PC。原则上主要城镇都可以存在这种服务节点，玩家在旅行过程中通过中心完成恢复与队伍整理。

中心承担：

- 查看所有已成立 Relationship / Contract；
- 核实对应人物、能力、技能、Relationship、Integrity 等资料；
- 调整当前随身 Card；
- 修复 / 恢复 Contract 的 Battle Integrity，MVP 修满目标来自对应基础 BattleActor 的 `max_hp`；
- 后续根据需要承担训练管理、成长记录等未来功能。

PokeMan **不提供类似 Pokédex 的随身全角色完整数据库**。旅途中可以显示当前随身卡必要的即时信息，但要查看全部已契约关系和完整属性，需要回到中心管理器核实。

```text
旅行 / 探索
↓
到达中心
↓
修复 Contract Integrity
↓
查看完整资料 / 当前 skills[]
↓
调整随身 Card / slot
↓
重新出发
```

中心由谁运营、为什么能够修复角色卡、是否属于某种统一机构等世界观解释暂不锁定；当前只固定它作为稳定旅行节点的产品职责。

# 人物本体与不同显现

## 角色本体不会因为收服而消失

从者首先是持续存在于 Map 世界中的人物。被收服后，角色本体仍然保留位置、职业、NPC 功能、剧情与社会关系。

同一个人物可以同时是：功能 NPC、剧情人物、关系对象、可收服从者、口袋陪伴角色、Battle 单位、其他关系中的主公。

例如商店老板被收服后仍可以继续经营商店。

## 契约不是物理占有

角色卡不是装着人物本人的容器，也不以写实复制 / 克隆解释 Pocket 或 Battle 中出现的角色。

角色卡更接近：

- 身份凭证；
- 关系证明；
- 持续连接媒介；
- 口袋陪伴媒介；
- Battle 力量调用媒介；
- 持卡者侧的战斗与未来成长载体。

“契约”、口袋化身、战斗化身以及相关力量的正式世界观名称和来源暂不锁定。

## 同一角色的三个表现层

1. **世界本体（World Character）**
   - 真正在 Map 世界中生活的人；
   - 保留职业、位置、剧情、功能和社会关系；
   - 可面对面 Dialogue / Event。

2. **口袋化身（Pocket Manifestation，工作术语）**
   - 通过随身角色卡与持卡者持续同行的轻量显现；
   - 可 Dialogue、评论地点 / NPC / Event、回应玩家选择；
   - 参与随行和角色事件。

3. **战斗化身（Battle Manifestation，工作术语）**
   - 通过随身角色卡在 Battle 中形成的战斗形态；
   - 承载当前 Contract 能够调用的 `integrity / skills[]`。

```text
                 同一个角色
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      世界本体    口袋化身    战斗化身
      Map/NPC     Companion     Battle
          │          │          │
          └──────────┼──────────┘
                     ▼
              同一个人物身份
```

三者不是三个独立人物：人物身份、核心剧情和人与人的关系不复制成三份。

当前技术边界是：

> **这份有向 Relationship 的 Contract 拥有长期 `integrity / skills[]`；当前 Card 只表示它是否随身以及所在 slot。**

未来训练 / progression 玩法仍可扩展 Contract，但不属于 MVP 当前 schema。

剧情中如果人物本体就在现场，也允许直接以本体参战，不需要建立第二套 Battle 系统。