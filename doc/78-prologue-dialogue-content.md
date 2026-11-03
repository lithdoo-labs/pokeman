# PokeMan 序章教学 Dialogue 内容设计

> 状态：**Narrative / Content Design**
> 范围：Map 4 研究所的博士教学、劲敌互换卡片、教学 Battle 结果确认，以及博士发布第一条道路任务
> 关联：[79-story-dialogue-event-integration.md](./79-story-dialogue-event-integration.md)、[77-battle-integration-v1.md](./77-battle-integration-v1.md)、[64-dialogue.md](./64-dialogue.md)、[62-event.md](./62-event.md)、[50-mvp-prologue.md](./50-mvp-prologue.md)

本文冻结第一条 Battle vertical slice 的固定 Dialogue 文案与分支语义。它定义“人物说什么、玩家能选什么、终点 Dialogue key 表达什么业务意图”，不扩展 Dialogue schema，也不把 Relationship / Contract / Card / Battle 操作塞进 Dialogue Content。

---

## 1. 叙事目标

序章的四段对话分别承担不同职责：

| 阶段 | 人物 | 玩家应该理解 / 完成什么 | 对话结束后的业务 |
| --- | --- | --- | --- |
| 玩法科普 | 主角 ↔ 博士 | 角色卡、契约、战斗显现、完整度、修复和自主行动 | 玩家选择准备好，或暂时离开 |
| 互换卡片 | 主角 ↔ 劲敌 | 双方自愿建立双向契约，互相持有对方的卡 | 成功原子建立两份 Contract 和两张随身 Card，然后进入 Battle |
| 结果确认 | 主角 ↔ 劲敌 ↔ 博士 | 确认谁赢、卡片完整度发生什么、人物本体没有受伤 | 展示 Battle 数值结果，推进到 after-battle |\n| 任务交接 | 主角 ↔ 博士 | 理解下一段旅行目标与出发地点 | 接受后结束 prologue 并激活 first-route |

叙事基调：

- 博士耐心、清晰、像研究者，但不把对话写成系统说明书。
- 劲敌好胜、直接、带一点挑衅；他尊重主角的选择，不强迫交换。
- 主角保持少台词 / 无配音的主角表现。玩家的 Choice 就是主角当下的回应，不额外伪造一段主角独白。
- 玩法规则通过角色之间的交流自然讲清楚；重要规则只解释一次，战后再用短句确认。
- 不提前承诺尚未实现的技能成长、卡片升级、复杂队伍或 Battle 内手动指令。

## 2. 核心规则必须说清楚

玩家完成这段序章后，至少应该记住：

1. 角色卡代表一份契约，不是把人物本体装进卡片。
2. 持有对方的卡，才能以这份契约调用对方的 Battle Manifestation。
3. 契约有方向；玩家持有宿敌卡与宿敌持有主角卡，是两份独立关系。
4. Battle 中行动的是显现体；人物本体仍留在现实世界。
5. 显现体会依据自身能力和战局自主行动，玩家不是逐帧操纵每个动作。
6. Battle HP 在产品上表现为这份契约的显现完整度；本场 HP 归零代表显现体被击败，正常退出 Battle 结算后会保留最低 1 点 Integrity，因此仍可再次显现，但非常脆弱。
7. Integrity 是长期 Contract 状态，不会在下一场 Battle 自动恢复；城镇中心可以修复。
8. 交换卡片必须双方同意；接受挑战后才建立双向契约并开始 Battle。

## 3. 对话流程

~~~text
开局：
EventStateList = prologue:lab-tutorial
Map 4 / Professor interaction
  ↓
professor-vertical-slice
  ├─ 我明白了 → professor-tutorial-ready
  │                 → Dialogue.mutation = prologue-tutorial-ready
  │                 → prologue = rival-ready
  │                 → Story Resolver refresh
  ├─ 再解释一次 → professor-tutorial-repeat
  │                 ├─ 明白了 → professor-tutorial-ready
  │                 └─ 稍后再说 → professor-tutorial-not-yet
  └─ 我先准备一下 → professor-tutorial-not-yet
                       → no mutation，保持 lab-tutorial

Map 4 / Rival interaction（仅 rival-ready）
  ↓
lab-rival-intro
  ├─ 交换卡片，开始对战 → lab-rival-exchange-accept
  │                        → no Dialogue mutation
  │                        → Business Runtime 原子交换双向 Contract / Card
  │                        → 成功后调用 Battle child Frame
  │                        → Battle 正常结算后选择结果 Dialogue
  └─ 我还没准备好       → lab-rival-defer
                           → no mutation，保持 rival-ready

Battle terminal：
  ├─ ally_win             → lab-rival-after-ally-win
  ├─ enemy_win            → lab-rival-after-enemy-win
  └─ simultaneous_defeat  → lab-rival-after-draw
                              → 三者共用 prologue-battle-resolved
                              → prologue = after-battle
                              → Story Resolver refresh

Map 4 / Professor interaction（仅 after-battle）
  ↓
professor-first-journey
  ├─ 我这就出发 → professor-first-journey-accept
  │                  → Dialogue.mutation = prologue-to-route
  │                  → prologue = null，first-route = active
  └─ 我还想准备一下 → professor-first-journey-not-yet
                         → no mutation，保持 after-battle
~~~

Map 只根据 terminalDialogueId 选择必要的业务操作，不读取对白文本，也不猜测玩家意图。Dialogue.mutation 由 Dialogue Subsystem 在 terminal completion 时执行；Map 不重复提交同一 Mutation。场景刷新由 Map Subsystem 的 Map Frame Handler 在 Dialogue child 正常完成且 EventStateList 已成功变化后触发，具体集成约束见 79。

## 4. 博士：玩法科普

### 4.1 professor-vertical-slice

入口 Dialogue。博士把关键概念压缩成一段可读的解释，最后让玩家决定继续、重听或暂缓。

~~~json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "来了。今天先不谈远方的事，我想让你亲手弄明白角色卡究竟是什么。"
    },
    {
      "speaker": "professor",
      "text": "角色卡不是把一个人装进卡片里。它代表你和那个人建立的一份契约。"
    },
    {
      "speaker": "professor",
      "text": "持有对方的卡，你就能在战斗中调用对方的战斗显现。对方本人仍然留在原来的世界里，不会被拉进战场。"
    },
    {
      "speaker": "professor",
      "text": "显现体会根据自己的能力和眼前的战局作出行动。你不是逐帧操纵它的每一步，先观察它如何判断和应对。"
    },
    {
      "speaker": "professor",
      "text": "每份契约都有自己的技能和完整度。战斗中的损耗会降低这份契约的显现完整度，而不是伤害人物本体。"
    },
    {
      "speaker": "professor",
      "text": "本场完整度归零代表显现体被击败；正常退出 Battle 结算后，这份契约会保留最低 1 点完整度，因此仍能再次显现，只是非常脆弱。契约和你们之间的关系始终存在。"
    },
    {
      "speaker": "professor",
      "text": "这些损耗会保留到下一场战斗，不会自动恢复。到了城镇，可以去中心修复。"
    },
    {
      "speaker": "professor",
      "text": "还有一点：契约是有方向的。你持有劲敌的卡，和劲敌持有你的卡，是两份分别成立的契约。"
    },
    {
      "speaker": "professor",
      "text": "今天你们要互相交换卡片。你调用他的显现体，他调用你的显现体。这样才能真正体验一次双方都参与的 Battle。"
    },
    {
      "speaker": "professor",
      "text": "听明白了吗？"
    }
  ],
  "choices": [
    {
      "text": "我明白了，去找劲敌",
      "target": "professor-tutorial-ready"
    },
    {
      "text": "再解释一次",
      "target": "professor-tutorial-repeat"
    },
    {
      "text": "我想先准备一下",
      "target": "professor-tutorial-not-yet"
    }
  ]
}
~~~

### 4.2 professor-tutorial-repeat

这是一个短复习分支，不重复整段长说明，只重新强调三个最容易误解的规则。

~~~json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "记住三件事就够了。第一，卡片代表契约，不代表人物本体。"
    },
    {
      "speaker": "professor",
      "text": "第二，战斗中受损的是契约显现完整度；本场归零后，正常退出时会保留最低 1 点，所以仍能再次显现，但非常脆弱。"
    },
    {
      "speaker": "professor",
      "text": "第三，完整度会持续保留，可以在城镇中心修复。你和劲敌交换卡片后，就能亲眼看到这一切。"
    },
    {
      "speaker": "professor",
      "text": "现在，你准备好了吗？"
    }
  ],
  "choices": [
    {
      "text": "明白了，去找劲敌",
      "target": "professor-tutorial-ready"
    },
    {
      "text": "我还是想稍后再说",
      "target": "professor-tutorial-not-yet"
    }
  ]
}
~~~

### 4.3 professor-tutorial-ready

terminal Dialogue。它是教学完成的唯一入口：Dialogue Subsystem 在返回成功 terminal result 前执行 prologue-tutorial-ready。Map 不再把 terminal id 映射成剧情状态，也不重复提交 Mutation。

~~~json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "很好。去找研究所另一边的劲敌吧。他也要亲自决定是否与你交换卡片。"
    },
    {
      "speaker": "professor",
      "text": "等你们双方都点头，再开始测试。记住，真正的契约不能靠任何一方单方面决定。"
    }
  ],
  "mutation": "prologue-tutorial-ready"
}
~~~

### 4.4 professor-tutorial-not-yet

terminal Dialogue，不附加 Mutation。玩家暂缓时不调用劲敌 Dialogue，也不开始 Battle；Event 保持 lab-tutorial，因此玩家之后仍能重新与博士交互。

~~~json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "不急。卡片交换不是必须立刻完成的事，更不是别人替你做的决定。"
    },
    {
      "speaker": "professor",
      "text": "准备好了再来找我。你也可以先在研究所里看看，想清楚以后再去找劲敌。"
    }
  ]
}
~~~

### 4.5 professor-first-journey

入口：prologue Event 进入 after-battle 后，博士仍在 Map 4，交互入口切换为 professor-first-journey。该段对话负责发布第一条道路 / 第一个城镇的外出任务。

~~~json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "你们已经亲自体验过契约显现。刚才的结果不会伤害任何人的本体，但契约完整度会持续保留。"
    },
    {
      "speaker": "professor",
      "text": "接下来，我想请你去第一条道路尽头的城镇，替我确认一件研究所需要的事。路上也要学会照顾自己的随身卡片。"
    },
    {
      "speaker": "professor",
      "text": "你准备现在出发吗？"
    }
  ],
  "choices": [
    {
      "text": "我这就出发",
      "target": "professor-first-journey-accept"
    },
    {
      "text": "我还想准备一下",
      "target": "professor-first-journey-not-yet"
    }
  ]
}
~~~

### 4.6 professor-first-journey-accept

terminal Dialogue。只有这个分支推进到 first-route。Dialogue Subsystem 执行 prologue-to-route；该 Mutation 要求 prologue 当前为 after-battle，且 first-route 尚未 active。

~~~json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "好。沿着出生镇外的道路前进，抵达第一个城镇后再完成我交代的事。一路小心。"
    }
  ],
  "mutation": "prologue-to-route"
}
~~~

### 4.7 professor-first-journey-not-yet

terminal Dialogue，不附加 Mutation。Event 保持 after-battle，博士仍可再次交互；不启动 first-route。

~~~json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "没关系。准备好以后再来找我，我会把路线和要确认的事项再告诉你。"
    }
  ]
}
~~~

## 5. 劲敌：互换卡片，建立双向契约

### 5.1 lab-rival-intro

沿用现有 Dialogue key。替换当前两个都指向自身的 Choice，改为明确的接受 / 暂缓分支。

~~~json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "总算来了。我还以为你要让博士替你把所有规则都讲完。"
    },
    {
      "speaker": "rival",
      "text": "我不想只听理论。我们来做一次真正的交换：我把自己的卡交给你，你也把自己的卡交给我。"
    },
    {
      "speaker": "rival",
      "text": "你用我的卡调用我的显现体，我用你的卡调用你的显现体。我们各自站在对面，看看谁更会运用这份力量。"
    },
    {
      "speaker": "rival",
      "text": "这不是把谁收进卡里。我们本人都在这里，进入战场的只是各自契约形成的显现。"
    },
    {
      "speaker": "rival",
      "text": "我知道战斗会损耗契约完整度。输了就去修复，别把责任推给卡片，也别拿本体受伤当借口。"
    },
    {
      "speaker": "rival",
      "text": "怎么样？你愿意和我交换卡片，堂堂正正地比一场吗？"
    }
  ],
  "choices": [
    {
      "text": "交换卡片，开始对战",
      "target": "lab-rival-exchange-accept"
    },
    {
      "text": "我还没准备好",
      "target": "lab-rival-defer"
    }
  ]
}
~~~

### 5.2 lab-rival-exchange-accept

terminal Dialogue，不附加 EventStateMutation。Map / PokeMan Business Runtime 将 terminalDialogueId = lab-rival-exchange-accept 解释为 accepted-challenge，并执行双向交换事务。只有事务确认成功后才启动 Battle。

~~~json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "好，一言为定。你收下我的卡，我也收下你的卡。"
    },
    {
      "speaker": "rival",
      "text": "从现在起，你可以调用我的显现体，我也可以调用你的显现体。"
    },
    {
      "speaker": "rival",
      "text": "别手下留情。我可不会因为这是第一次就放水。"
    }
  ]
}
~~~

### 5.3 lab-rival-defer

terminal Dialogue，不附加 Mutation。Map 将 terminalDialogueId = lab-rival-defer 解释为 deferred；不交换卡片，不调用 Battle，Event 保持 rival-ready。

~~~json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "好，我不会逼你。没有你的同意，这份契约就不会成立。"
    },
    {
      "speaker": "rival",
      "text": "等你准备好了再来找我。到时候，我可不会放水。"
    }
  ]
}
~~~

## 6. 卡片交换的业务边界

Dialogue Choice 只跳转到 Dialogue；Dialogue.mutation 只改变 EventStateList。**不能因为台词说了“交换卡片”，就把 createContract / createCard 塞进 Dialogue 或 EventStateMutation。**

当 Dialogue 以 terminal id = lab-rival-exchange-accept 正常完成后，PokeMan business Runtime 才执行双向交换。Battle 只能在这次业务提交成功后启动。

本场交换必须建立以下四个业务事实：

~~~text
Relationship(player → rival).contract
  integrity = BattleActor/rival.max_hp = 18
  skills    = copy(BattleActor/rival.skills)
              = [firebolt, grab]

Relationship(rival → player).contract
  integrity = BattleActor/player.max_hp = 20
  skills    = copy(BattleActor/player.skills)
              = [firebolt]

CarriedCards(player)
  = [{ slot: 0, servantCharacterId: "rival" }]

CarriedCards(rival)
  = [{ slot: 0, servantCharacterId: "player" }]
~~~

实现约束：

- 两份 Relationship 是两个方向，不能只创建 player → rival。
- 两份 Contract 的初始 Integrity / skills 分别来自被调用角色的基础 BattleActor。
- 两份 CarriedCards 分别记录持有者当前的随身卡；卡片本身不是独立 Shared State Record。
- 保留已有 Relationship 的 affinity、hostile、relationshipText；如果 Record 不存在，固定初始化为 `{ affinity: 0, hostile: false, relationshipText: "" }`，再在同一原子事务中增加 Contract。Dialogue Content 不拥有这些默认值，Business Runtime 按 61 / 67 的统一规则执行。
- 序章随身上限为 1；若任一方的 slot 0 已被占用，不得静默覆盖。
- Business Runtime 必须 fresh-read 两份 Relationship 与两份 CarriedCards，并记录四条 Record 的 version；absence 是合法 pre-state。
- 两份 Relationship 与两份 CarriedCards 通过同一个 Shared State transaction 原子提交，conditions 覆盖四条 fresh-read version；不能只交换一张卡，也不能留下半成立的双向契约。
- 已有 Relationship 无 Contract时，保留关系字段并增加 Contract；已有完整且 exact-match 的 Contract / Card 允许幂等继续；已有冲突 Contract、slot 0 被其他 Card 占用或部分交换状态不得静默覆盖。
- CONFLICT / OUTCOME_UNKNOWN 都不 blind retry：fresh-read 四条 authoritative Record，只有四条都精确等于本次 expected final values 才视为 reconciled success；否则返回可恢复业务失败，不启动 Battle。
- 不新增 exchange operation-marker Record 或第二套交换状态机。
- Battle cancelled / failed 不回滚已经成功提交的交换，但不得播放胜负对白或推进 after-battle；后续重试不得重复创建或覆盖 Contract / Card。

Battle 双方的含义：

~~~text
玩家调用自己持有的 rival Card
→ ally = BattleActor/rival Manifestation

劲敌调用自己持有的 player Card
→ enemy = BattleActor/player Manifestation
~~~

所以 Battle 的 ally_win 表示主角一方获胜；enemy_win 表示劲敌一方获胜。

## 7. 战后：确认胜负与契约状态

战后 Dialogue 本身就是本阶段唯一的玩家结果确认界面，不再额外设计 Battle Result acknowledgement / confirm button。Battle final Snapshot 仍是数值权威；Battle Subsystem 完成 settlement 后关闭 Battle Presentation并返回结果，Map 随即调用对应 result Dialogue。

Dialogue 不接收动态 HP，也不硬编码剩余数值。它只确认胜负、说明归零者正常结算后最低保留 1 Integrity，并让人物对结果作出反应。未来若需要专门结果统计页，另开 Presentation 功能，不阻塞当前 vertical slice。

### 7.1 lab-rival-after-ally-win

语义：ally_win，主角一方胜出。主角调用的 rival Manifestation 获胜；劲敌调用的 player Manifestation 失去稳定。

~~~json
{
  "mutation": "prologue-battle-resolved",
  "lines": [
    {
      "speaker": "rival",
      "text": "……这次是你赢了。没想到，我的显现体在你的手里，能发挥到这种程度。"
    },
    {
      "speaker": "professor",
      "text": "结果确认：主公一方胜出。"
    },
    {
      "speaker": "professor",
      "text": "劲敌持有的主角卡，本场 HP 已经归零；正常退出结算后，这份契约会保留最低 1 点 Integrity，所以仍能再次显现，但状态非常脆弱。你持有的宿敌卡则保留本场实际剩余完整度。"
    },
    {
      "speaker": "professor",
      "text": "正常退出结算已把双方数值写回各自的契约：非零 HP 原样保存，归零者保存为 1。本场完整度归零不会伤害人物本体；保留的 1 点仍可再次显现，但需要修复才能恢复稳定。"
    },
    {
      "speaker": "professor",
      "text": "之后到城镇中心修复完整度，可以让显现恢复稳定，更好地应对下一场战斗。"
    },
    {
      "speaker": "rival",
      "text": "别得意太早。我会先把自己的契约修复得更稳定，再来一场。"
    }
  ]
}
~~~

### 7.2 lab-rival-after-enemy-win

语义：enemy_win，劲敌一方胜出。劲敌调用的 player Manifestation 获胜；主角调用的 rival Manifestation 失去稳定。

~~~json
{
  "mutation": "prologue-battle-resolved",
  "lines": [
    {
      "speaker": "rival",
      "text": "这次是我赢了。你手里的我的卡，最后还是先撑不住了。"
    },
    {
      "speaker": "professor",
      "text": "结果确认：劲敌一方胜出。主公持有的宿敌卡，本次显现完整度已经归零；正常退出结算后会保留最低 1 点，因此仍能再次显现，但非常脆弱。"
    },
    {
      "speaker": "professor",
      "text": "劲敌持有的主角卡保留本场实际剩余完整度。正常退出结算后，两份数值都已按规则写回各自的契约。"
    },
    {
      "speaker": "professor",
      "text": "本场完整度归零不会伤害宿敌本人；正常退出结算后，这份契约会保留 1 点完整度，仍能再次显现，只是非常脆弱。"
    },
    {
      "speaker": "professor",
      "text": "之后到城镇中心修复完整度，可以让显现恢复稳定，更好地应对下一场战斗。"
    },
    {
      "speaker": "rival",
      "text": "别灰心。把卡片修复好再来挑战我，我可不会因为赢了一次就满足。"
    }
  ]
}
~~~

### 7.3 lab-rival-after-draw

语义：simultaneous_defeat，双方显现同时失去稳定，结果为平局。

~~~json
{
  "mutation": "prologue-battle-resolved",
  "lines": [
    {
      "speaker": "rival",
      "text": "等等……两边怎么一起消散了？"
    },
    {
      "speaker": "professor",
      "text": "结果确认：双方显现同时失去稳定，本场判定为平局。"
    },
    {
      "speaker": "professor",
      "text": "两份契约的本场 HP 都已归零。正常退出结算后，两份契约都会各自保留最低 1 点 Integrity。"
    },
    {
      "speaker": "professor",
      "text": "契约和人物关系仍然存在。两张卡现在都保留 1 点完整度，仍可再次显现，但极其脆弱；到城镇中心修复后，才能以更稳定的状态继续战斗。"
    },
    {
      "speaker": "rival",
      "text": "谁也没赢，谁也别笑谁。修复好再来，这次我可不会让步。"
    }
  ]
}
~~~

## 8. Result 与 Dialogue key 映射

| BattleResult | 产品胜负 | Dialogue key | 必须确认的结果 | 共同 Mutation |
| --- | --- | --- | --- | --- |
| ally_win | 主角胜出 | lab-rival-after-ally-win | rival Card 的 Manifestation 获胜；劲敌持有的 player Card 本场 HP 归零，正常退出后保存为 1 Integrity | prologue-battle-resolved |
| enemy_win | 劲敌胜出 | lab-rival-after-enemy-win | player Card 的 Manifestation 获胜；主角持有的 rival Card 本场 HP 归零，正常退出后保存为 1 Integrity | prologue-battle-resolved |
| simultaneous_defeat | 平局 | lab-rival-after-draw | 两份 Manifestation 本场 HP 同时归零，正常退出后两份 Contract 都保存为 1 Integrity | prologue-battle-resolved |

三段战后 Dialogue 的文本不同，但都表示当前教学 Battle 已结束，因此统一把 prologue 从 rival-ready 推进到 after-battle。不要为了保留暂时不影响后续场景的胜负差异而提前拆分 Event state。

只有 Battle 正常 terminal 且双方 Contract Integrity 已成功结算，Map 才能调用以上三段战后 Dialogue。Battle cancelled / failure 不属于胜负分支，不得播放这些结果确认对白，也不得执行 Mutation。

## 9. Dialogue Content 与 Runtime 的责任边界

| 内容 / 业务 | Owner |
| --- | --- |
| 台词、speaker、Choice、target Dialogue | struct.Dialogue |
| Choice target graph 执行、terminalDialogueId | PokeMan Dialogue Subsystem |
| Dialogue.mutation 的 EventStateList 校验与 commit | PokeMan Dialogue Subsystem |
| terminalDialogueId → accepted-challenge / deferred 等业务意图 | Map Frame Handler 内的固定映射 |
| 双向 Relationship Contract 创建 | PokeMan Business Runtime |
| 双向 CarriedCards 写入 | PokeMan Business Runtime |
| 两份 Contract Integrity 结算 | Battle Subsystem |
| BattleResult / final HP | Battle Simulation |
| Result-specific Dialogue 选择 | Map Frame Handler |
| Event state 解析后的 NPC scene | Story Resolver |
| Event current state 持久化 | pokeman.EventStateList/current |

固定约束：

- Choice 只跳到另一个 Dialogue，不增加 action / result / mutation 字段。
- Dialogue.mutation 只推进 Event state，不创建 Contract、Card 或启动 Battle。
- 博士教学完成由 professor-tutorial-ready 的 prologue-tutorial-ready mutation 推进。
- 劲敌接受 / 暂缓不改变 Event state；接受后的双向交换由 Business Runtime 原子提交。
- 三种 Battle 结果对白共用 prologue-battle-resolved。
- 博士外出任务接受由 professor-first-journey-accept 的 prologue-to-route mutation 推进。
- prologue-to-route 不属于 route-bandit-threat；路霸对白不得负责启动 first-route。
- 在 Dialogue.mutation commit 成功之前，Dialogue Frame 不得以成功 terminal completion 返回。
- Map 不重复执行 Dialogue.mutation；它只处理 terminalDialogueId 指定的业务操作，并在 child 正常完成后刷新当前 Map 场景。
- Battle 不直接调用战后 Dialogue；由 Map Subsystem 的 Map Frame Handler 根据 BattleResult 选择 Dialogue。
- 不在对白里硬编码胜负数值或假装知道实时剩余 HP。
- 不把 Battle Manifestation 的失稳写成人物本体死亡、昏迷或受伤。

场景状态与对白进度必须一致：Dialogue mutation 成功后，Map 必须重新读取 EventStateList 并解析当前 Map 的 NPC scene，不能只恢复旧的 Controls / interaction activation。完整集成顺序见 [79-story-dialogue-event-integration.md](./79-story-dialogue-event-integration.md)。

## 10. 验收标准

- 博士对白能讲清楚卡片、契约方向、显现体、Integrity 持续和中心修复。
- 新游戏 EventStateList 为 prologue:lab-tutorial；Map 4 中博士可交互、劲敌可见但不可交互。
- 玩家可以选择重听或暂缓；暂缓时 Event state 不变。
- 选择准备好后，Dialogue mutation 将 prologue 推进到 rival-ready；Map 不重载即可刷新出劲敌交互入口。
- 劲敌对白明确表达双方自愿互换卡片；拒绝时不建立任何一边的 Contract。
- 接受后，双向 Relationship / Contract 与双向 CarriedCards 一次原子提交。
- 两张卡的 owner / servant 方向正确：player 持有 rival，rival 持有 player。
- 只有交换事务成功后才进入 Battle。
- Battle cancelled / failed 不播放胜负对白、不推进 after-battle；已提交的双向 Contract / Card 保留，并支持安全重试。
- 三种 BattleResult 各自进入正确的战后 Dialogue，且共用 prologue-battle-resolved。
- 战后对白明确说明本体没有受伤、Integrity 已持久结算；本场 HP 归零的卡片退出 Battle 后保留 1 点完整度，仍可再次显现但非常脆弱，城镇中心用于修复恢复稳定。
- 战后 Dialogue mutation 将 prologue 推进到 after-battle；博士获得 professor-first-journey 交互入口，劲敌仍留在研究所但不再可交互。
- 外出任务暂缓不推进 Event；接受后 prologue-to-route 原子结束 prologue 并激活 first-route。
- 对话不显示虚构 HP 数字，不把动态 Battle state 写入固定 Dialogue Content。
- 每条 Dialogue 都只使用当前冻结的 lines / speaker / choices / target / mutation shape，不扩展通用 Dialogue DSL。
