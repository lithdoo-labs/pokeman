# PokeMan / 口袋从者 概念设计

> 状态：Draft
>
> 本文档是 PokeMan（中文名：口袋从者）的持续概念设计文档。产品设计优先回答“这是否让口袋从者成为更成立的游戏”；LoomRealm Core 与 `game-libs` 的演进由真实游戏需求推动，而不是反过来让游戏成为框架演示。

## 项目定位

**PokeMan** 是游戏英文名，中文名为 **口袋从者**。

游戏在体验结构上对标 GBA 时代的 Pokémon RPG：以俯视角 Tile Map 探索为主要世界空间，通过地图人物、事件和 Dialogue 推进 RPG 内容，并通过独立 Battle 进入战斗体验。

但口袋从者不复刻传统 Pokémon 的角色关系、捕获过程或战斗控制。玩家主要以 **主公** 身份旅行，在世界中认识、接触、影响并最终与不同人物建立角色卡契约，使其成为能够通过角色卡随身携带、持续互动并用于 Battle 的 **从者**。

Battle 是 PokeMan 的核心差异化系统之一：从者不是等待玩家逐步遥控的棋子，而是具有自身判断的人物。Battle 通过 Decision / LLM 形成具体战术行为，由 Simulation 决定行为是否合法、何时发生以及实际结果；未来主公通过高层战术指令影响从者 Decision，而不是绕过 Decision 直接控制 Simulation。

## 素材来源、构建与分发边界

PokeMan 当前计划以 **非商业发布** 为前提，并把 Pokémon / Pokémon Essentials 素材与 PokeMan 自身代码、规则和内容定义分离。

公开项目主要提供：

- PokeMan 游戏逻辑与配置；
- Dialogue / Event；
- Battle 定义；
- 角色、关系与世界状态定义；
- 从 `essentials-v21.1` 映射到 PokeMan Content 的规则；
- 本地 Builder / Import tooling。

用户在自己的本地环境中提供一份可用的 `essentials-v21.1`：

```text
PokeMan source / definitions
          +
用户本地 essentials-v21.1
          ↓
PokeMan Builder / Importer
          ↓
选择、转换并映射所需 Map / Graphics / Content
          ↓
用户本地可运行的 PokeMan Game Package
```

因此：

> **PokeMan 分发自己的游戏逻辑和构建手段；原版 Pokémon / Essentials 素材由用户本地提供，并在用户环境中参与构建。**

生成出来的素材与派生 Game Package 属于本地构建产物，不因为开发 PokeMan 而反向提交原版资源到项目仓库。Importer 校验、版本识别、资源映射格式、输出目录和构建命令属于后续工程设计。

# Game Session 与基础 Frame

PokeMan 除 World / Dialogue / Battle 等玩法 Frame 外，还需要两个基础交互 Frame：**System Menu** 与 **Message**。

## System Menu Frame

System Menu 是可重复实例化的 Frame 类型，不是整个 Session 中唯一的固定 Frame 实例。

游戏刚启动、尚未进入任何 World 时，首先创建一个 System Menu 实例作为当前 Frame 栈的最底层实例，使游戏即使还没有进入存档 / 世界，也始终能够展示基础系统入口：

```text
栈顶
┌────────────────────────┐
│ System Menu #root      │
│                        │
│ New Game               │
│ Load Game              │
│ Settings               │
│ Exit                   │
└────────────────────────┘
栈底
```

玩家选择进入游戏后，由这个 root System Menu 调用 World：

```text
栈顶
┌────────────────────────┐
│ World                  │
├────────────────────────┤
│ System Menu #root      │
└────────────────────────┘
栈底
```

**“System Menu 位于栈底”只描述启动时这个 root 实例的位置，不表示 System Menu subsystem 只能出现在栈底。Frame 栈位置属于 Frame 实例，而不属于 subsystem 类型。**

当玩家已经处于 World、Battle 或其他允许打开菜单的游戏状态时，当前 Frame 可以再次调用同一个 System Menu subsystem，产生一个新的菜单 Frame 实例并压到当前栈顶：

```text
栈顶
┌────────────────────────┐
│ System Menu #in-game   │
├────────────────────────┤
│ World                  │
├────────────────────────┤
│ System Menu #root      │
└────────────────────────┘
栈底
```

此时下层 caller 按正常 Frame call 语义暂停；菜单关闭后，当前菜单 Frame 完成并返回 caller，caller 以新的 Activation 继续。

System Menu 可以根据调用上下文展示不同操作，但仍是同一个 subsystem。例如：

```text
root mode
├─ New Game
├─ Load Game
├─ Settings
└─ Exit

in-game mode
├─ Resume
├─ Save
├─ Load
├─ Settings
├─ Return to Title
└─ Exit
```

具体 Save persistence、Load 后如何替换当前游戏状态、Return to Title / Exit 如何影响更下层 Frame 与 Session 生命周期，属于后续架构设计；System Menu 的产品职责是承载这些系统操作的交互入口，而不是把所有生命周期 authority 都收进菜单自身。

## Message Frame

Message 是统一的**模态消息 Frame**。它不承担 toast / 后台非阻塞通知；当业务需要向玩家显示消息、警告、确认或可恢复异常时，由当前活动 Frame 直接调用 Message：

```text
World / Dialogue / Battle / System Menu
                ↓
          call(Message)
                ↓
      caller Activation 暂停
                ↓
        Message 位于栈顶
                ↓
      玩家确认 / 选择 / 取消
                ↓
         Message 完成
                ↓
          返回 caller
```

当前 MVP Message Frame 的最小业务 contract 冻结为：

```ts
type PokeManMessageFrameInputV1 = {
  messageKey: string;
  text: string;
  actions: readonly {
    id: string;
    label: string;
  }[];
};

type PokeManMessageFrameResultV1 = {
  messageKey: string;
  actionId: string;
};
```

约束：

- `messageKey` 非空，用于 caller correlation / 测试，不是 Shared State identity；
- `text` 是本次模态消息正文；
- `actions` 至少 1 项，action id 非空且唯一；
- Message 只返回玩家选择，不执行 caller 的业务 mutation；
- caller 根据 `actionId` 决定 resume / cancel / retry 等行为；
- Message Frame 自己拥有本次模态 UI / Controls activation，完成后释放并返回 caller；
- cancelled / failed Frame 不能伪装成某个 action。

Battle pause 当前正是该 contract 的直接 consumer；`battle-host-background-paused` 与 `battle-decision-circuit-paused` 的 exact text/actions 由 77 冻结。
典型用途包括：

- 获得角色卡等需要玩家明确确认的业务消息；
- “无法携带更多角色卡”等业务提示；
- 存档 / 读取失败等可恢复错误；
- Battle 因 Host background 暂停后的“继续战斗 / 退出战斗”确认；
- Battle 因 Decision circuit 暂停后的“重试决策 / 退出战斗”确认；
- 警告信息；
- `确认 / 取消`、`是 / 否` 等模态选择；
- 退出游戏、覆盖存档等危险操作前的确认。

例如 System Menu 自己也可以继续调用 Message：

```text
栈顶
┌────────────────────────┐
│ Message                │
├────────────────────────┤
│ System Menu #in-game   │
├────────────────────────┤
│ World                  │
├────────────────────────┤
│ System Menu #root      │
└────────────────────────┘
栈底
```

因此当前基础 Frame 关系可以概括为：

```text
System Menu #root
│
└─ World
   │
   ├─ Dialogue
   │  └─ Message
   │
   ├─ Battle
   │  ├─ System Menu #in-game
   │  │  └─ Message
   │  └─ Message
   │
   ├─ System Menu #in-game
   │  └─ Message
   │
   └─ Message
```

真正导致 Session / Runtime 已经无法继续工作的 fatal failure 不能依赖 Message Frame 才能显示，因为此时对应 Subsystem / Frame 可能已经无法运行；这类失败仍由更底层的 Main / Platform failure presentation 处理。Message 面向的是游戏仍可运行时的模态业务消息和可恢复异常。

# 世界与角色规则

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

不同人物可以拥有不同收服路线：

- **关系型**：多次 Dialogue、选择和关系推进；
- **挑战型**：需要 Battle 证明实力；
- **事件型**：完成人物自己的地图或剧情事件；
- **复合型**：Dialogue、Event、Battle、多次相遇组合；
- **条件型**：要求地点、世界状态、已拥有角色或其他前置条件。

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

## 同一人物可以对应多张角色卡

同一个人物可以与不同主公分别建立独立契约，因此可以同时存在多张代表同一人物的角色卡：

```text
Character
├─ Contract A → Card A
├─ Contract B → Card B
└─ Contract C → Card C
```

这些卡共享同一个人物的核心事实，例如：

- identity；
- personality；
- 世界中的本体与剧情；
- 基础人物设定与能力来源。

但每一张卡属于不同契约实例，可以独立拥有：

- holder；
- 对应关系 / affinity / trust；
- Card Integrity；
- 卡片侧训练与成长；
- 当前是否随身携带。

因此，同一场 Battle 中允许双方使用代表同一个 Character 的角色卡，不增加“同一人物只能有一个 Battle Manifestation”的唯一性限制。例如：

```text
主公 A 的宿敌卡 → 宿敌 Battle Manifestation A
                         VS
主公 B 的宿敌卡 → 宿敌 Battle Manifestation B
```

这不解释为角色本体被复制成两个真人，而是**不同契约通过各自角色卡，对同一个人物形成各自的战斗显现**。

不同契约的 Battle Manifestation 可以因为持卡者关系、卡片成长、Card Integrity 和 Guidance 不同而产生不同 Decision。多人持卡时更复杂的远程信息同步、Pocket 感知和剧情表现以后再设计，不影响“同一人物可对应多张卡、同场可同时显现”这一基础规则。

# 角色卡管理与“口袋”

## 契约、已管理卡与随身卡是不同事实

```text
Contract / 契约关系
= 玩家与该角色的正式关系已经成立

Managed Card / 已管理角色卡
= 该卡已经进入中心管理器中的角色卡集合

Carried Card / 随身角色卡
= 本次旅行中实际被主公带在身上的角色卡
```

所以：

> **已收服多少人物，与本次旅行能够携带多少人物，是两个独立概念。**

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

中心管理器中的其他角色卡
→ 契约继续存在
→ 关系继续存在
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

未编入随身位的角色卡统一由 **中心管理器** 管理。该名称仍是工作概念，正式世界观名称和设施形态以后再定。

中心定位为标准化的角色卡服务设施，整体旅行节奏参考传统 Pokémon Center + PC。原则上主要城镇都可以存在这种服务节点，玩家在旅行过程中通过中心完成恢复与队伍整理。

中心承担：

- 查看所有已管理角色卡；
- 核实角色卡完整属性、能力、技能、训练状态和关系资料；
- 调整随身角色卡；
- 修复 / 恢复角色卡的 Battle 状态；
- 后续根据需要承担训练管理、契约记录等功能。

PokeMan **不提供类似 Pokédex 的随身全角色完整数据库**。旅途中可以显示当前随身卡必要的即时信息，但要查看全部角色卡和完整属性，需要回到中心管理器核实。

```text
旅行 / 探索
↓
到达中心
↓
修复角色卡
↓
查看完整资料
↓
调整随身队伍
↓
重新出发
```

中心由谁运营、为什么能够修复角色卡、是否属于某种统一机构等世界观解释暂不锁定；当前只固定它作为稳定旅行节点的产品职责。

# 人物本体与不同显现

## 角色本体不会因为收服而消失

从者首先是持续存在于 Map 世界中的人物。被收服后，角色本体仍然保留位置、职业、NPC 功能、剧情与社会关系。

同一个人物可以同时是：

- 功能 NPC；
- 剧情人物；
- 好感度 / 关系对象；
- 可收服从者；
- 口袋陪伴角色；
- Battle 单位；
- 其他关系中的主公。

例如商店老板被收服后仍可以继续经营商店。

## 契约不是物理占有

角色卡不是装着人物本人的容器，也不以写实复制 / 克隆解释 Pocket 或 Battle 中出现的角色。

角色卡更接近：

- 身份凭证；
- 关系证明；
- 持续连接媒介；
- 口袋陪伴媒介；
- Battle 力量调用媒介；
- 持卡者侧的战斗与成长载体。

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
   - 承载当前角色卡能够调用的战斗能力。

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

但是：

> **角色卡拥有属于这张卡 / 这段持有关系的 Battle 运行状态；这不等于角色本人拥有同一份持久战斗状态。**

剧情中如果人物本体就在现场，也允许直接以本体参战，不需要建立第二套 Battle 系统。

# Battle

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

## HP 对角色卡意味着 Card Integrity

对于通过角色卡形成的 **Battle Manifestation**，Battle 中的 `HP` 不表示角色本体生命值，而表示：

> **角色卡当前的战斗完整度 / 显现稳定度（Card Integrity）。**

内部 Simulation 可以继续使用连续数值 `hp`，产品上把它解释为卡片状态。例如概念上：

| 卡片状态 | Card HP | 产品语义 |
| --- | ---: | --- |
| 完好 | 较高 | 显现稳定，可以正常继续战斗 |
| 受损 | 中等 | 卡片已经出现明显战斗损耗 |
| 残破 | 很低但大于 0 | 显现非常不稳定，接近无法继续战斗 |
| 本场被击败 | 0（仅本场 terminal） | 本场显现体被击败；正常退出 Battle 时 Contract 最低保存为 1 |

具体状态名称、视觉效果和百分比阈值以后再调；当前只固定 **HP 数值映射角色卡完整度，而不是角色生命值**。

因此：

```text
宿敌本体：仍然在研究所正常生活

玩家持有的宿敌卡：
Card HP = 35%
状态 = 受损 / 接近残破
```

两者可以同时成立。

`Battle final HP = 0` 表示这张角色卡的显现体在本场被击败，并不意味着角色本人昏迷、死亡或受到同等物理伤害。正常退出 Battle 结算时，Contract Integrity 使用 `max(1, final HP)` 持久化，因此正常 Battle 后卡片最低保留 1 点，可再次显现但非常脆弱。

角色卡的 Battle 状态在战斗结束后继续保留，直到被中心等恢复手段修复：

```text
Battle A
Card HP 100 → 48
↓
返回 Map
Card HP 仍为 48
↓
遇到下一次 Challenge
↓
玩家决定是否继续应战
↓
到达中心
↓
修复 Card HP → 100
```

这样道路上的连续战斗会产生类似传统 Pokémon 的旅行资源压力，但设定上消耗的是卡片显现能力，而不是远处角色本人的生命值。

### 本体直接参战时

普通敌对人物、独立从者等可以由世界本体直接进入同一个 Battle Simulation。此时 Simulation 中的 HP 可以表达**本场战斗内的体力 / 战斗状态 / 被击败程度**，不要求把这份数值保存成角色长期生命条。

也就是说：

```text
角色卡调用的战斗化身 HP
→ Card Integrity，可跨 Battle 持续并由中心修复

世界本体直接参战 HP
→ 本场 Battle 的战斗状态，0 表示被击败 / 制服 / 无法继续战斗
```

二者共用 Battle 机制，但产品语义不同。

## 多随身卡后的默认 Battle 使用方式

当剧情以后解锁多个随身角色卡位时，**默认仍保持单场 1v1 Battle**。主公在进入 Battle 时从当前随身角色卡中选择一张作为本场出战卡：

```text
多个随身角色卡
↓
Battle 开始前选择 1 张
↓
该卡形成 Battle Manifestation
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

同一句 Guidance，不同人物应产生不同理解和执行方式。角色性格、能力、经验、关系和当前战局共同影响 Decision，避免所有从者最终表现为同一种通用 AI。

## 长期养成方向

序章不实现完整养成系统，但长期方向已确认：

- **训练**：提高从者 / 角色卡实际可发挥的战斗能力；
- **好感度 / 信赖**：提高从者理解、信任和采纳主公战术意图的程度；
- **关系成长**：来自 Dialogue、Event、选择和共同经历；
- **随行成长**：来自一起旅行、Pocket Dialogue 和角色事件；
- **主公成长**：提升组织、携带、调用和表达复杂 Guidance 的能力。

核心语义是：

```text
训练 = “能做到什么”
好感 / 信赖 = “愿意多大程度采纳主公意图”
```

具体 Level、属性、技能成长、训练方式、契约阶段和 Guidance UX 均不在序章阶段设计。

# Encounter、Challenge 与敌对行为

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

具体生成数量、概率、Spawn Point、随机 seed、重新进入地图是否完全重新 roll 等属于后续内容与技术设计；当前只固定“**地图进入时生成，生成后可见**”这一产品规则。

Persistent Character 和剧情人物不要求通过随机生成产生，它们可以由世界状态和剧情决定位置与是否出现。

## Encounter Entity 与 Persistent Character

不是每个路边人物都需要进入完整长期关系系统：

```text
Visible Encounter Entity
├─ ordinary / transient
│    → 本次或本区域使用
│    → 有本次 Dialogue / Battle identity
│    → 不要求永久 affinity / contract / story
│
└─ persistent character
     → stable characterId
     → affinity / hostile
     → contract / card relationship
     → story progress
     → 可以反复相遇、发展关系甚至收服
```

普通混混、一般帮派成员、普通挑战者可以是 transient；宿敌、重要从者、功能 NPC、剧情人物和重要主公更适合作为 persistent character。

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

MVP 关系模型先保持最小：

```text
relation / affinity
+
hostile
```

# 核心游戏循环

```text
System Menu #root
      ↓
进入 / 读取游戏
      ↓
中心管理角色卡 / 修复卡片 / 选择随身从者
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
卡片 Battle 状态 + Relationship / World State 返回世界
      ↓
满足人物自己的收服条件
      ↓
建立角色卡关系并进入中心管理体系
      ↓
编入有限随身位
      ↓
Pocket Dialogue / Event / Battle
      ↓
继续旅行或返回中心整理
```

System Menu 可以在允许的游戏状态中再次作为新 Frame 入栈；Message 则作为需要玩家处理的模态 Frame 临时压到当前栈顶。

# MVP 序章

## 序章目标

序章不是完整养成展示，而是建立世界观和核心产品认知。

序章结束时，玩家应该理解：

- 游戏启动时由基础 System Menu 提供 New Game / Load / Settings / Exit 等系统入口；
- 游戏过程中允许再次压入新的 System Menu Frame，并在关闭后回到原 caller；
- 重要业务提示、确认和可恢复错误通过模态 Message Frame 展示；
- 自己主要以主公身份冒险，但主公 / 从者是关系位置；
- 人与人可以建立真实角色卡关系，并且可以双向成立；
- 玩家本人也能被角色卡代表；
- 角色本体不会因为角色卡或 Battle Manifestation 消失；
- 已收服卡与当前随身卡是不同概念；
- 序章随身上限为 1，宿敌卡占据唯一随身位；
- 随身角色才是本次旅行的 Pocket Companion 和主要 Battle 调用对象；
- Battle Manifestation 的 HP 表示角色卡完整度，不是角色本体生命；
- 卡片损耗可以跨 Battle 持续，并在中心修复；
- 从者在 Battle 中具有自己的 Decision；
- 道路 Encounter 以可见人物为基础；
- 普通 Encounter 可以在进入地图时随机生成，但生成以后真实可见；
- 道路存在敌对 Battle、可选 Challenge 和未来可收服人物；
- 离开出生地之后还有更大的世界。

## MVP 空间边界

```text
【游戏启动】
System Menu #root
→ New Game / Load / Settings / Exit
→ New Game 进入序章

        ↓

【出生镇】
主角家
→ 小镇
→ 博士研究所
→ 与宿敌建立真实双向角色卡
→ 宿敌卡进入唯一随身位
→ 教学 Battle

        ↓

【第一条道路】
第一次 Pocket Dialogue
→ 环境反馈
→ 地图进入时生成 / 放置可见 Encounter
→ 第一次敌对 Encounter / 强制 Battle
→ 宿敌卡 Battle 状态持续
→ Battle 后 Pocket Dialogue
→ 独立从者 / 修行者
→ 可绕过 / 可选 Challenge

        ↓

【第一个城镇】
进入真正的城镇空间
→ 普通居民与功能 NPC
→ 中心 / 管理设施承担角色卡修复与未来管理入口
→ 完成博士交代的外出目标
→ 发现新的重要人物 / 潜在从者
→ Pocket Dialogue
→ 序章结束
```

**MVP 边界停在第一个城镇。**

## 第一阶段：出生镇

### 1. 家中醒来

- 获得四方向移动；
- 室内外切换；
- 少量家人 / 物件互动；
- 得知博士正在找自己。

### 2. 第一次探索出生镇

- 少量 NPC 可 Dialogue；
- 路牌 / 建筑可互动；
- 有人提到博士研究角色卡；
- 有人提到宿敌也被叫去；
- 玩家自行找到研究所。

### 3. 博士与宿敌登场

博士承担角色卡体系研究者 / 引导者功能，只解释序章所需规则：人与人可以建立正式连接、形成角色卡、持续联系并调用对方力量，而且关系可以双向成立。

### 4. 建立真实双向契约

```text
玩家获得：宿敌卡
宿敌获得：玩家卡
```

宿敌卡直接进入玩家唯一随身位。

### 5. 第一次角色卡反馈

最低需要让玩家明确：

- 宿敌卡已经获得；
- 卡片当前处于随身 / 可用状态；
- 宿敌也真实持有玩家卡；
- 完整管理器 UI 暂不需要。

### 6. 第一次教学 Battle

```text
现实：
玩家本人                    宿敌本人
   │                           │
随身宿敌卡                 持有玩家卡
   │                           │
   ▼                           ▼

Battle：
宿敌 Battle Manifestation VS 玩家 Battle Manifestation
              ↓
        Decision / LLM
              ↓
          Simulation
```

这一战证明：人物本体仍在现实中、角色卡可以调用战斗化身、战斗化身自主 Decision，而且 Battle HP 属于对应角色卡的显现完整度，不等于人物本体受伤。

### 7. Battle 后再次面对本体

回到研究所后，双方本体仍在原地。通过简短 Dialogue 强化：Battle Manifestation 的损耗和人物本体不是同一份状态。

### 8. 博士给予第一次外出任务

博士给玩家一个目的地位于第一个城镇的小任务。宿敌本体暂时留在研究所，玩家带着唯一随身卡——宿敌卡——独自出发。

## 第二阶段：第一条道路

### 9. 第一次 Pocket Dialogue

玩家离开出生镇后，宿敌通过随身角色卡主动说话，证明“口袋”意味着持续同行而不是只在 Battle 开始时出现。

### 10. 第一次环境反应

宿敌至少主动评论一次地点、路牌、路人或前方危险，证明 Pocket Companion 正在与玩家共同经历当前世界。

### 11. 第一次可见敌对 Encounter

普通 Encounter Entity 可以在进入道路 Map 时由配置随机生成，但生成后玩家必须能够在地图上提前看到。

```text
进入道路
↓
随机生成并放置敌对人物
↓
玩家看到对方
↓
进入发现 / 拦路范围
↓
Dialogue / 威胁 / 抢劫
↓
Hostile
↓
强制 Battle
↓
宿敌卡完整度下降并持续到 Map
```

战斗结束后立即发生 Pocket Dialogue。

### 12. 第一次可见可选 Challenge

道路上出现一个玩家能够提前看到、也可以绕过的非敌对独立从者 / 修行者。

```text
看见修行者
↓
绕过
或
主动接近 / 被邀请
↓
World Dialogue
↓
[应战]
[拒绝]
```

因为宿敌卡可能已在前一场 Battle 中受损，所以“是否接受 Challenge”第一次具有实际资源决策意义。

该人物可以成为序章以后继续发展关系和收服的 persistent character，但 MVP 不要求完成其收服。

## 第三阶段：第一个城镇

### 13. 进入真正的城镇空间

最低展示：

- 城镇入口和明确边界；
- 普通居民；
- 至少一个功能 NPC / 功能地点；
- 中心 / 管理设施的存在；
- 一个值得继续认识的重要人物；
- 通向未来地区的出口或视觉提示。

### 14. 中心与角色卡恢复

第一个城镇开始展示类似 Pokémon 的旅行恢复节奏：玩家可以在中心恢复宿敌卡的 Card Integrity，使受损 / 残破卡重新回到完好状态。

MVP 不要求完整多角色管理 UI，但中心应让玩家理解：以后全部角色卡的完整资料、修复和随身队伍管理都在这里完成。

### 15. 功能 NPC 也是角色

通过一个商店老板、治疗人员、守卫、研究者等人物展示：功能 NPC、剧情人物、关系对象和潜在从者可以是同一个人。

### 16. 完成博士目标并遇见新的潜在从者

玩家完成外出目标，遇见新的重要人物，发生一次有角色感的 World Dialogue / 初始关系变化，并由宿敌产生 Pocket Dialogue 反应。随后序章结束，把自由探索和下一阶段目标交给玩家。

## 序章验证的三层循环

### 角色循环

```text
认识角色
→ 建立角色卡关系
→ 编入随身位
→ Pocket Dialogue
→ Battle
→ 卡片状态与关系继续存在
```

### 遭遇循环

```text
Map Enter
→ 生成 / 放置可见 Encounter Entity
→ 看见对方
→ 接近 / 被发现 / 主动交互
→ Dialogue / Hostile / Challenge
→ Battle、拒绝或绕过
→ 返回 Map
```

### 旅行循环

```text
中心整理 / 修复角色卡
→ 安全区
→ 道路
→ 可见 Encounter
→ 卡片逐渐受损
→ 新城镇
→ 中心恢复
→ 重新出发
```

# MVP 明确不要求完成

序章阶段暂不要求：

- 第二条道路和第二个完整城镇；
- 正式完成第二个从者的收服；
- 完整 Quest 框架；
- 完整商店、旅店等城镇系统；
- 完整中心管理器 UI 与多角色队伍调整；
- 序章之后随身角色卡位的解锁节奏与最终上限；
- 玩家自己的角色卡在序章之后如何继续分发；
- 多人持有同一人物角色卡时的完整远程信息同步、Pocket 感知与剧情表现；
- 契约解除 / 销毁 / 收回系统；
- Battle 中换卡、2v2 与多人协同 Battle；
- 完整训练、等级、属性成长；
- Battle Player Guidance / 战术指令系统；
- 好感度如何具体影响 Decision；
- 复杂 NPC 巡逻、追逐和通用地图 AI；
- 多维复杂关系模型；
- 完整主线故事和长期挑战结构；
- 完整卡片状态视觉表现和最终 HP 阈值调优。

# 设计原则

- **游戏启动时存在一个 root System Menu Frame，保证尚未进入 World 时仍能提供基础系统菜单。**
- **System Menu 是可重复实例化的 Frame 类型；游戏过程中可以再次压入新的 System Menu Frame。**
- **Frame 在栈中的位置属于具体实例，不属于 subsystem 类型。**
- **Message 是模态消息 Frame，由当前活动 Frame 调用并临时位于栈顶，完成后返回 caller。**
- **玩家主要以主公身份冒险，但主公 / 从者是关系位置，不是固定身份。**
- **序章双向契约真实成立。**
- **玩家本人也能被角色卡代表并产生 Battle Manifestation。**
- **同一个人物可以与多个主公分别建立独立角色卡契约。**
- **同一场 Battle 可以同时存在代表同一人物的多个 Battle Manifestation，不设置唯一显现限制。**
- **从者首先是持续存在于世界中的人物。**
- **角色卡表达正式关系和力量调用，不是装着人物的容器。**
- **契约、已管理卡、随身卡是不同事实；放回中心不会解除契约。**
- **序章随身上限为 1，后续随剧情解锁更多随身位。**
- **解锁多随身卡后，默认 Battle 仍为开战前选择一张出战卡的 1v1。**
- **“口袋”意味着当前随身人物持续陪伴，而不只是 Battle 卡槽。**
- **中心管理器作为主要城镇中的标准化角色卡服务节点，承担全量角色卡管理、完整属性核实与卡片修复。**
- **不提供随身全角色 Pokédex 式完整数据库。**
- **Battle Manifestation 的 HP 表示角色卡完整度 / 显现稳定度，不表示人物本体生命值。**
- **Card HP 可以跨 Battle 持续；本场 0 HP 表示显现体被击败，正常退出结算后最低持久化为 1 HP，而非人物死亡。**
- **本体直接参战时的 HP 是本场 Battle condition，不需要成为持久人物生命条。**
- **道路以 Visible Encounter 为基础，普通 Encounter 在进入地图时生成后直接可见。**
- **普通 Encounter Entity 可以是 transient，重要人物才需要完整长期 Character identity。**
- **Battle 对手不等于从者，Battle actor 也不等于角色卡。**
- **敌对行为可以强制 Battle；非敌对 Battle 通过 Challenge 进入。**
- **玩家可以拒绝 Challenge，也可以强制开战并承担后果。**
- **Battle 对关系的影响由情境决定，不采用统一胜负加减好感。**
- **从者在 Battle 中拥有自己的 Decision。**
- **未来主公通过 Guidance 影响 Decision，不绕过 Decision / Simulation。**
- **训练长期提高能力，好感 / 信赖长期提高战术协作。**
- **Map + Dialogue 构成主要 RPG 世界，Battle 构成主要冲突体验。**
- **先让真实游戏闭环成立，再增加复杂系统和公共抽象。**
- **PokeMan 不捆绑分发原版 Pokémon / Essentials 素材。**

# 当前非目标

- 完整复刻 Pokémon 规则；
- Pokémon 式菜单 Battle；
- 无预兆、不可见的步数随机遇敌；
- 玩家逐步直接控制从者每一个 Battle 行动；
- 随身查看所有已获得角色完整属性的 Pokédex 式系统；
- 把收服解释为人物本体从世界消失；
- 用复制 / 克隆解释 Pocket 或 Battle Manifestation；
- 为本体、口袋化身、战斗化身分别维护三套人物成长；
- 在序章提前完成长期养成、Guidance、复杂关系和完整中心系统；
- 在当前阶段设计契约结束机制；
- 为了抽象提前把所有 PokeMan 业务能力做成新的 `game-libs`；
- 把 PokeMan 变成 LoomRealm 的纯技术测试夹具。

PokeMan / 口袋从者首先应该成为一个真正的角色收集、陪伴、战斗与旅行 RPG，然后再由实际产品压力推动系统和框架继续演进。
