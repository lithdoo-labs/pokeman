# MVP 范围、设计原则与当前非目标

> 从 `../DESIGN.md` 拆分；原文档保持不变。

## MVP 明确不要求完成

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

## 设计原则

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
- **Relationship 与 Contract 是长期关系事实；当前 Card 只表示一份已成立 Contract 是否随身以及所在 slot。**
- **中心里的“已管理角色卡”只是已成立 Relationship / Contract 的管理视图，不建立额外 ManagedCard State authority；放回中心不会解除 Contract。**
- **MVP Card 没有独立 `cardId` / Card identity。**
- **序章随身上限为 1，后续随剧情解锁更多随身位。**
- **解锁多随身卡后，默认 Battle 仍为开战前选择一张出战卡的 1v1。**
- **“口袋”意味着当前随身人物持续陪伴，而不只是 Battle 卡槽。**
- **中心管理器作为主要城镇中的标准化角色卡服务节点，展示全部已成立 Relationship / Contract，承担完整资料核实、当前随身 Card 调整与 Contract Integrity 修复。**
- **不提供随身全角色 Pokédex 式完整数据库。**
- **Battle Manifestation 的 HP 在产品上表现为角色卡完整度 / 显现稳定度，技术 authority 是 `Relationship.contract.integrity`，不表示人物本体生命值。**
- **Contract Integrity 可以跨 Battle 持续；`integrity = 0` 表示这份契约暂时无法形成 Battle Manifestation，而非人物死亡。**
- **持久 Character 的基础 BattleActor 是稳定静态定义；同一 Character 的不同 NPC Instance 不改变 BattleActor identity。**
- **Transient Encounter NPC 的基础 BattleActor 由其 Encounter / Story 静态来源指定。**
- **建立 Contract 时，从当前目标 NPC Instance 解析到的基础 BattleActor 初始化：`integrity = BattleActor.max_hp`，`skills[] = BattleActor.skills[]`；Integrity 上限同样来自该基础 BattleActor 的 `max_hp`。**
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

## 当前非目标

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