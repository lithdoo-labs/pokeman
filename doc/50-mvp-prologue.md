# MVP 序章

> 从 `../DESIGN.md` 拆分；原文档保持不变。
>
> 序章 Event / Dialogue 的状态机与 Runtime 集成见 [79-story-dialogue-event-integration.md](./79-story-dialogue-event-integration.md)，具体对白见 [78-prologue-dialogue-content.md](./78-prologue-dialogue-content.md)。
>
> Map 4 首场互换角色卡的参战身份与数值配置见 [80-battle-scenario-design.md](./80-battle-scenario-design.md)。

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
- 已建立契约与当前随身 Card 是不同概念；
- 序章随身上限为 1，宿敌卡占据唯一随身位；
- 随身角色才是本次旅行的 Pocket Companion 和主要 Battle 调用对象；
- Battle Manifestation 的 HP 在产品上表现为角色卡完整度，但技术 authority 是 `Relationship.contract.integrity`，不是 Card State，也不是角色本体生命；
- Contract Integrity 的损耗可以跨 Battle 持续，并在中心修复；
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
→ 与宿敌建立真实双向角色卡契约
→ 宿敌卡进入唯一随身位
→ 教学 Battle

        ↓

【第一条道路】
第一次 Pocket Dialogue
→ 环境反馈
→ 地图进入时生成 / 放置可见 Encounter
→ 第一次敌对 Encounter / 强制 Battle
→ 宿敌 Contract Integrity 持续
→ Battle 后 Pocket Dialogue
→ 独立从者 / 修行者
→ 可绕过 / 可选 Challenge

        ↓

【第一个城镇】
进入真正的城镇空间
→ 普通居民与功能 NPC
→ 中心 / 管理设施承担 Contract Integrity 修复与未来管理入口
→ 完成博士交代的外出目标
→ 发现新的重要人物 / 潜在从者
→ Pocket Dialogue
→ 序章结束
```

**MVP 边界停在第一个城镇。**

## 序章地图绑定

当前 MVP 序章直接复用已导入的 Essentials Map，并固定以下业务职责：

```text
Map 2 = 初始城镇
Map 3 = 玩家家
Map 4 = 博士研究所
Map 5 = 第一条道路
Map 7 = 第一个城镇
Map 8 = 宿敌家
```

这组绑定与现有 `MapTransfer` 拓扑一致：Map 2 直接连接玩家家、博士研究所和宿敌家，并向 Map 5 离开出生镇；Map 5 继续连接 Map 7，形成序章的主旅行路径。

因此序章主空间链固定为：

```text
Map 3 玩家家
↓
Map 2 初始城镇
├─ Map 8 宿敌家
├─ Map 4 博士研究所
└─ Map 5 第一条道路
   ↓
   Map 7 第一个城镇
```

Map 编号在当前 MVP 中作为 Content 业务绑定使用；后续 NPC placement、Event scene 与 Encounter 配置都应引用这组 mapId。

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

技术上，这意味着两个方向各自建立 `Relationship.contract`；当前 Card 只是随后形成的随身事实。

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

这一战证明：人物本体仍在现实中、角色卡可以调用战斗化身、战斗化身自主 Decision，而且 Battle HP 属于对应 Contract 的显现完整度，不等于人物本体受伤。

产品 UI / 文案可以继续把它称为“角色卡完整度”“卡片受损”；技术上持久值保存于 `Relationship.contract.integrity`。

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
宿敌 Contract Integrity 下降并持续到 Map
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

因为宿敌 Contract Integrity 可能已在前一场 Battle 中受损，所以“是否接受 Challenge”第一次具有实际资源决策意义。

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

第一个城镇开始展示类似 Pokémon 的旅行恢复节奏：玩家可以在中心恢复宿敌契约的 Integrity，使产品上“受损 / 残破”的角色卡重新回到完好状态。

MVP 中修满目标来自宿敌基础 `BattleActor.max_hp`；Card 自身不保存 HP / Integrity。

MVP 不要求完整多角色管理 UI，但中心应让玩家理解：以后全部已契约 Relationship / Contract 的完整资料、修复和随身 Card 管理都在这里完成。

### 15. 功能 NPC 也是角色

通过一个商店老板、治疗人员、守卫、研究者等人物展示：功能 NPC、剧情人物、关系对象和潜在从者可以是同一个人。

### 16. 完成博士目标并遇见新的潜在从者

玩家完成外出目标，遇见新的重要人物，发生一次有角色感的 World Dialogue / 初始关系变化，并由宿敌产生 Pocket Dialogue 反应。随后序章结束，把自由探索和下一阶段目标交给玩家。

## 序章验证的三层循环

### 角色循环

```text
认识角色
→ 建立 Relationship.contract
→ 编入随身 Card slot
→ Pocket Dialogue
→ Battle
→ Contract Integrity / Relationship 继续存在
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
中心整理随身 Card / 修复 Contract Integrity
→ 安全区
→ 道路
→ 可见 Encounter
→ Contract Integrity 逐渐受损
→ 新城镇
→ 中心恢复
→ 重新出发
```