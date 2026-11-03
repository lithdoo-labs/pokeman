# PokeMan Story / Dialogue / Event 集成设计

> 状态：**Implemented + Tested + Story Authority / Map 4 Browser Closed-loop Qualified**
> 范围：固定 Dialogue、Event state、Map 场景解析、业务 Runtime 与 Battle 的协作
> 关联：[62-event.md](./62-event.md)、[64-dialogue.md](./64-dialogue.md)、[73-dialogue-gameplay-vertical-slice.md](./73-dialogue-gameplay-vertical-slice.md)、[78-prologue-dialogue-content.md](./78-prologue-dialogue-content.md)、[50-mvp-prologue.md](./50-mvp-prologue.md)、[67-shared-state-records.md](./67-shared-state-records.md)

本文把序章实际需要的 Story / Dialogue / Event 集成关系固定下来。它不新增通用剧情 DSL，也不改变已经冻结的 Content / Shared State physical schema。

## 1. 核心决策

保持现有数据模型，不增加新的剧情业务 Record：

- Dialogue 负责固定台词、Choice 和 Dialogue graph 跳转。
- Event 负责剧情阶段，以及当前阶段对地图 NPC / Character 的场景与交互定义。
- EventStateMutation 只负责检查并推进 Event current state。
- EventStateList 是当前 Event state 的唯一持久化 authority。
- Relationship / Contract 与 CarriedCards 分别保存关系契约和随身编队事实。
- Battle Runtime 拥有本场 Battle 与结算结果。
- Story Resolver 根据 StoryIndex、EventStateList 和 Character.defaultScenes 解析当前地图场景。
- Map Subsystem 中现有的 Map Frame Handler 负责等待 NPC interaction、调用 Dialogue / Battle child Frame、调用 PokeMan 业务 Service，并在 Event state 改变后刷新当前 Map scene。它是 Map Subsystem 的 Frame Handler，不是独立架构组件。

因此：

**Dialogue graph 不是剧情状态机；Event state 不是通用任务脚本；Map Frame Handler 不解释对白文本。**

所有跨模块推进都通过明确的 terminal Dialogue key、BattleResult 或 EventStateMutation 完成。

## 2. Authority 与职责边界

| 数据 / Runtime | 唯一职责 | 不负责 |
| --- | --- | --- |
| struct.Dialogue | 台词、speaker、Choice、target、可选 Event mutation 引用 | Contract、Card、Battle |
| struct.Event | Event state 与地图 NPC directive | 当前剧情进度 |
| struct.EventStateMutation | Event state 前置条件与赋值 | 任意 Shared State mutation |
| pokeman.EventStateList/current | 当前所有 active Event state | Dialogue 当前行、临时 Battle 状态 |
| Relationship | 有向人物关系与可选 Contract | 随身编队 |
| CarriedCards | holder 当前携带哪些 servant Card | Contract Integrity / Skill 定义 |
| Dialogue Subsystem | 执行 Dialogue graph，并在 terminal completion 时执行可选 mutation | 启动 Battle、创建 Contract |
| PokeMan Business Runtime | 双向契约 / 卡片等 PokeMan 业务事务 | 解释 Dialogue 台词 |
| Battle Subsystem | Battle Simulation、BattleResult、Contract Integrity 结算 | 直接调用战后 Dialogue |
| Story Resolver | 从当前 Story state 解析场景 | 推进 Event state |
| Map Subsystem 的 Map Frame Handler | 调用 child Frames、调用业务 Service、消费业务结果、恢复 Map 场景 | 自己维护第二份剧情进度、解析对白文本、直接修改其他业务 authority |

禁止建立平行 authority，例如 Dialogue 自己保存一份剧情进度、Event 再保存一份，或把 Contract / Card 写进 EventStateMutation。

## 2.1 Base startup bootstrap — FROZEN

当前 MVP 没有 Save / Load 恢复路径，因此 Base 是 New Game baseline materialization 的唯一 owner。启动顺序固定：

~~~text
ensureDeepSeekConfiguration
→ ensurePokeManBaseline
→ create input host
→ frame.call("map", frame.params)
~~~

`ensurePokeManBaseline` 只处理两条 singleton Record：

~~~text
pokeman.PlayerWorld/current
= { mapId: 3, x: 3, y: 8, direction: 2 }

pokeman.EventStateList/current
= [{ eventId: "prologue", stateId: "lab-tutorial" }]
~~~

规则：

- Base fresh-read 两条 Record。
- 两条都 absent：在同一个 Shared State transaction 中用两条 fresh-read version condition 原子 put 两个 baseline value。
- 两条都存在且 shape / Content reference 合法：视为 baseline 已 materialize，不覆盖，不重置剧情。
- 只有一条存在、另一条 absent：这是 invalid PokeMan State，禁止自动补一半。
- CONFLICT / OUTCOME_UNKNOWN：fresh-read 两条 authoritative Record；两条都存在且合法则视为 reconciled success，否则失败；不 blind retry。
- Base 不 materialize Relationship / CarriedCards；它们按业务需要产生。
- 当前 Map Frame 仍使用 `game.json initial.input` 启动；PlayerWorld 是 durable checkpoint authority，为未来 Save / Load 保留。本轮不从它恢复 Map。

因此 `PlayerWorld/current` 与 `EventStateList/current` 不再存在“谁创建”的实现歧义，也不需要新增 Bootstrap Subsystem。

## 3. 序章 canonical Event state

出生地序章继续使用一个 Event：**prologue**。它表达研究所教学、劲敌挑战与教学 Battle 的阶段，不为每个 NPC 或每场 Battle 建立独立 Event。

Map 4 是博士研究所。当前 Map Runtime 中已经使用的场景坐标：

| NPC instance / npcId | Character | Placement |
| --- | --- | --- |
| professor | professor | (10, 6), direction 2 |
| rival-lab | rival | (8, 5), direction 2 |

prologue 的 canonical states：

| Event state | 博士 | 劲敌 | 进入方式 |
| --- | --- | --- | --- |
| lab-tutorial | 可交互，入口 professor-vertical-slice | 出现但不可交互 | 新游戏 baseline |
| rival-ready | 出现但不可交互 | 可交互，入口 lab-rival-intro | 博士教学完成 |
| after-battle | 可交互，入口 professor-first-journey | 仍在研究所，但不可交互 | 教学 Battle 结果确认完成 |

状态推进：

~~~text
prologue: lab-tutorial
        |
        | professor-tutorial-ready
        v
prologue: rival-ready
        |
        | Battle 正常结束 + result Dialogue 完成
        v
prologue: after-battle
        |
        | professor-first-journey-accept
        v
prologue: null
first-route: active
~~~

教学 Battle 运行期间不增加 battle-started Event state。Battle 当前是否运行、双方实时 HP 与本场临时数据属于 Battle Runtime；只有正常结束后已经确认的剧情结果才推进 Event。

## 4. Event 场景定义

Event state 对被接管的 Character 必须给出完整场景 directive。不要假设不同 state 会自动继承前一个 state 的 placement 或 interaction。

Map 4 的 prologue Content 目标形状：

~~~json
{
  "states": {
    "lab-tutorial": {
      "maps": {
        "4": {
          "npcs": {
            "professor": {
              "character": "professor",
              "placement": {
                "x": 10,
                "y": 6,
                "direction": 2
              },
              "interaction": {
                "dialogue": "professor-vertical-slice"
              }
            },
            "rival-lab": {
              "character": "rival",
              "placement": {
                "x": 8,
                "y": 5,
                "direction": 2
              }
            }
          }
        }
      }
    },
    "rival-ready": {
      "maps": {
        "4": {
          "npcs": {
            "professor": {
              "character": "professor",
              "placement": {
                "x": 10,
                "y": 6,
                "direction": 2
              }
            },
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
    "after-battle": {
      "maps": {
        "4": {
          "npcs": {
            "professor": {
              "character": "professor",
              "placement": {
                "x": 10,
                "y": 6,
                "direction": 2
              },
              "interaction": {
                "dialogue": "professor-first-journey"
              }
            },
            "rival-lab": {
              "character": "rival",
              "placement": {
                "x": 8,
                "y": 5,
                "direction": 2
              }
            }
          }
        }
      }
    }
  }
}
~~~

这里的无 interaction directive 是有意设计：人物仍然可见，但当前剧情阶段不能从该 NPC 启动新的 Dialogue。

prologue active 时，Event 对 professor / rival 的 directive 接管对应 Character 的 defaultScenes。prologue 被移除后，Character.defaultScenes 才重新成为 fallback。rival 的默认场景应与 Map 8 宿敌家对齐，而不是继续使用旧 Map 1 配置。

## 5. Dialogue graph 与 terminal 语义

### 5.1 博士教学

~~~text
professor-vertical-slice
  ├─ 我明白了
  │    → professor-tutorial-ready
  │    → mutation: prologue-tutorial-ready
  │    → prologue = rival-ready
  │
  ├─ 再解释一次
  │    → professor-tutorial-repeat
  │         ├─ 明白了 → professor-tutorial-ready
  │         └─ 稍后再说 → professor-tutorial-not-yet
  │
  └─ 我先准备一下
       → professor-tutorial-not-yet
       → no mutation
~~~

只有 professor-tutorial-ready 推进 Event。重听和暂缓都是普通 terminal Dialogue，不改变 EventStateList。

### 5.2 劲敌交换

~~~text
lab-rival-intro
  ├─ 交换卡片，开始对战
  │    → lab-rival-exchange-accept
  │    → no mutation
  │    → Map Business Runtime 执行双向交换
  │    → 事务成功后调用 Battle
  │
  └─ 我还没准备好
       → lab-rival-defer
       → no mutation
       → 返回 Map
~~~

接受交换的 Dialogue terminal key 是业务 adapter 的输入，不是 Event state。Dialogue 不直接创建 Contract / Card，也不直接启动 Battle。

### 5.3 Battle 结果

| BattleResult | 战后 Dialogue | Dialogue mutation |
| --- | --- | --- |
| ally_win | lab-rival-after-ally-win | prologue-battle-resolved |
| enemy_win | lab-rival-after-enemy-win | prologue-battle-resolved |
| simultaneous_defeat | lab-rival-after-draw | prologue-battle-resolved |

三种对白解释不同的胜负结果，但在当前序章都进入同一个 after-battle state。暂时不为了保存胜负差异而拆成三个 Event state；未来只有当胜负会影响后续场景或任务时才增加分支状态。

Battle cancelled、failed 或 Integrity settlement 尚未确认时，不调用上述战后 Dialogue，也不执行 prologue-battle-resolved。

### 5.4 博士发布外出任务

after-battle state 中，博士的交互入口变为 professor-first-journey：

~~~text
professor-first-journey
  ├─ 我这就出发
  │    → professor-first-journey-accept
  │    → mutation: prologue-to-route
  │    → prologue = null
  │    → first-route = active
  │
  └─ 我还想准备一下
       → professor-first-journey-not-yet
       → no mutation
       → 保持 after-battle
~~~

接受任务的 terminal Dialogue 负责提交 Event mutation；不由路霸 Dialogue 或 Battle Runtime 推进 first-route。

## 6. EventStateMutation 定义

当前序章只需要三条 Mutation：

### prologue-tutorial-ready

~~~json
{
  "from": {
    "prologue": "lab-tutorial"
  },
  "to": {
    "prologue": "rival-ready"
  }
}
~~~

### prologue-battle-resolved

~~~json
{
  "from": {
    "prologue": "rival-ready"
  },
  "to": {
    "prologue": "after-battle"
  }
}
~~~

### prologue-to-route

~~~json
{
  "from": {
    "prologue": "after-battle",
    "first-route": null
  },
  "to": {
    "prologue": null,
    "first-route": "active"
  }
}
~~~

prologue-to-route 要求 first-route Event Content 已经存在，且包含 active state。该 Mutation 是一次 EventStateList 原子替换：结束 prologue 并激活 first-route，不拆成两个 commit。

开局 baseline：

~~~json
[
  {
    "eventId": "prologue",
    "stateId": "lab-tutorial"
  }
]
~~~

first-route 在开局时没有 entry；不要保存 stateId 为 null 的 entry。

## 7. Frame 调用与 Map Frame Handler 的流程控制

### 7.1 不新增 Orchestrator 架构组件

Map Subsystem 中已经存在的 Frame Handler 就是当前流程的调用方。这里所说的“流程编排”仅指该 Handler 在自己的主 async control flow 中等待 NPC interaction、调用 child Frame、消费结果并决定下一步；它不是 Loom-realm Framework 中的新概念。

**本设计不新增以下任何东西：**

- `Orchestrator` / `StoryOrchestrator` class；
- `orchestrator.mjs` 或额外的流程管理模块；
- `Orchestrator Subsystem` 或 `Story Subsystem`；
- 通用 Workflow Engine / Story Graph；
- 只为转发一次 `frame.call()` 而增加的 wrapper Frame。

Loom-realm 已有的 Subsystem / Frame / `frame.call()` / FrameOutcome 协议足以承载这条流程。Map Frame Handler 直接使用该协议，不再在它上面叠加第二套调度抽象。

### 7.2 调用关系

Dialogue 与 Battle 是 Map 的兄弟 Child Frame，互相不调用。Base 只负责启动 Map；Map Frame Handler 是本序章中 Dialogue 与 Battle Child Frame 的调用者。

~~~text
Base Subsystem
  └─ frame.call("map")
       └─ Map Subsystem
            └─ Map Frame Handler（现有 Frame Handler）
                 ├─ 等待 Professor interaction
                 │    └─ frame.call("dialogue", professor-vertical-slice)
                 │         └─ terminal mutation commits rival-ready
                 │
                 ├─ 等待 Rival interaction
                 │    ├─ frame.call("dialogue", lab-rival-intro)
                 │    ├─ Business Runtime：双向 Contract / Card transaction
                 │    ├─ frame.call("battle", lab-rival-tutorial)
                 │    └─ frame.call("dialogue", result-specific key)
                 │         └─ terminal mutation commits after-battle
                 │
                 └─ 等待 Professor interaction（after-battle）
                      └─ frame.call("dialogue", professor-first-journey)
                           └─ terminal mutation commits first-route
~~~

三个 NPC 交互发生在各自对应的 Event state 下，不是一次 Professor interaction 自动连续播放全部剧情。每次普通 Dialogue 结束后回到 Map interaction loop；只有 Rival 接受挑战后，Dialogue → Business Runtime → Battle → Result Dialogue 构成一个连续 child-call 序列。

### 7.3 Map Frame Handler 的责任

Map Frame Handler 负责：

1. 从当前 Map NPC interaction 取得 `mapId / instanceId / npcId` 与已解析的 `dialogueKey`。
2. 在发起 child call 前停止当前 Map Controls activation。
3. 自己在主 async control flow 中 `await frame.call("dialogue", input)` 或 `await frame.call("battle", input)`。
4. 验证 FrameOutcome 与业务 Result；根据 terminalDialogueId / BattleResult 选择下一项业务操作。
5. 对劲敌接受分支调用 Business Runtime，只有双向交换 transaction 已确认成功才调用 Battle。
6. 在 Dialogue Subsystem 已提交 EventStateMutation 后，重新读取 EventStateList 并调用 Story Resolver。
7. 在完整 child-call 序列结束后恢复普通 Map gameplay。

NPC interaction callback 只向 Map Frame Handler 当前等待的 waiter / rendezvous 投递事件，不能直接调用 `frame.call()`。Frame Handler 必须自己等待 Child Frame 返回；不得把 child call 放进 detached async task。

Map Frame Handler 不执行 Dialogue graph、不创建 Contract / Card、不模拟 Battle、不提交 Battle Integrity，也不维护第二份剧情状态。它只通过各自 owner 的公开业务接口完成协作。

### 7.4 Frame Activation 与 Controls

Map Frame 在 child Frame 运行期间保持 suspended，Child Frame 成为当前 Active Frame。Child 正常返回后，Main 按 Loom-realm Frame Call Protocol 恢复 Map，并为 Map 安装 fresh Activation。

- 旧 Map Activation 的 ControlsConsumer / DirectionalControlsTracker 不跨 Child Frame 复用。
- 发起 child call 前清空 move intent、reset tracker 并关闭旧 consumer。
- 普通 Dialogue 返回后，Map 用 fresh Activation 创建新的 ControlsConsumer / Tracker。
- Rival 接受挑战后的 Dialogue → Battle → Result Dialogue 是连续流程；中间不得短暂重新开放普通 Map Controls。
- Child failed / cancelled 时按 FrameOutcome 处理，不得伪装成正常 terminal，也不得推进后续剧情。
- Map Frame Handler 在 child call pending 期间必须保持自身 async control flow pending；具体 rendezvous、resume、cleanup 约束以 [73-dialogue-gameplay-vertical-slice.md](./73-dialogue-gameplay-vertical-slice.md) 与 Loom-realm Frame Call Protocol 为准。

### 7.5 Dialogue Mutation 与场景刷新边界

Dialogue Subsystem 在 terminal Dialogue 有 mutation 时，必须先校验并成功提交 EventStateList，再以成功 terminal result 返回。Map Frame Handler 不重复执行 mutation。

Map Frame Handler 只在 Dialogue child 正常完成后消费 terminalDialogueId 中明确约定的业务意图。只有 EventStateList 已成功改变时，才重新读取当前 EventStateList 并调用 Story Resolver 更新当前 Map scene；无 mutation 的普通 terminal 不需要伪造剧情状态变化。

Battle Subsystem 只返回已结算的 BattleResult。Map Frame Handler 根据 BattleResult 选择战后 Dialogue；Battle 不直接调用 Dialogue。

## 8. 双向交换与 Battle 的业务边界

当 lab-rival-exchange-accept 正常完成后，PokeMan Business Runtime 解析当前目标 NPC Instance 的 Character / base BattleActor，并在一个 Shared State transaction 中提交：

- Relationship(player → rival).contract；
- Relationship(rival → player).contract；
- CarriedCards(player)；
- CarriedCards(rival)。

Contract Integrity 与 skills 分别来自被调用角色的基础 BattleActor；CarriedCards 只保存 slot 与 servantCharacterId。已有 Relationship 保留 affinity、hostile、relationshipText；Relationship Record 不存在时固定从 `{ affinity: 0, hostile: false, relationshipText: "" }` 初始化，并在同一原子事务中增加 Contract。

必须满足：

- 两个方向分别建立，不能只创建 player → rival。
- 两份 Contract 和两份 CarriedCards 原子提交，不留下半交换。
- 序章随身上限为 1；任一方 slot 0 已占用时不能静默覆盖。
- Business Runtime fresh-read 两份 Relationship 与两份 CarriedCards，并用四条 version condition 做一个原子 OCC transaction；transaction 未确认成功前不得启动 Battle。
- CONFLICT / OUTCOME_UNKNOWN 都只 fresh-read 四条 authoritative Record；四条都精确等于 expected final values 才视为 reconciled success，否则失败，不 blind retry。
- 已完整存在且内容一致的交换可作为幂等恢复；部分存在或内容冲突必须报告，不得 last-wins，也不新增 operation-marker Record。

Battle 正常结束后，Battle Subsystem 负责把最终 Integrity 写回对应 Contract。只有 BattleResult 与 Integrity settlement 都已确认，Map 才能选择结果 Dialogue。

Battle child Frame cancelled / failed 时：

- 不播放胜负结果 Dialogue；
- 不执行 prologue-battle-resolved；
- prologue 保持 rival-ready；
- 已经成功提交的双向 Contract / Card 不回滚；
- 再次交互时，Business Runtime 必须识别已有交换并支持安全重试，不得重复创建或覆盖。

## 9. Story Resolver 与 Map 场景刷新

Story Resolver 的已实现场景输入：

~~~text
struct.StoryIndex/current
+ pokeman.EventStateList/current
+ Character.defaultScenes
+ 当前 Map 的 transient Story / Encounter sources
~~~

解析规则继续遵守 62：

- active Event state 提到某 Character 时，该 Character 的 defaultScenes 退出 fallback。
- 没有 active Event directive 提到该 Character 时，使用 Character.defaultScenes。
- 合并所有 source 后，同一 Map 的最终 npcId 必须唯一；冲突 deterministic reject，不做 last-wins。
- StoryIndex 是 Builder 派生 Content，不是 Shared State authority。
- Runtime 在 Map Frame 建立时完成一次 operation-scoped Content qualification，并交叉验证 StoryIndex 与 Event / Character 源 Content；同一次 qualification 中每个 immutable record 最多读取一次。后续 Map refresh 只重读 EventStateList，不重复验证整张 Content graph。坏 Event/state/Map/Character/NPC/Dialogue 引用与 derived drift 都显式失败，不由 Map fallback 掩盖。
- PWA Content preparation 会完整枚举 `struct.Character` 与 `struct.Event` identity，再用同一 validator 对比 StoryIndex；遗漏整个 source record 也会阻止构建。Runtime 不获得 namespace 枚举 authority。
- Builder 同时枚举并验证全部 Dialogue、Choice target、Character speaker 与 EventStateMutation 引用；合法 Dialogue cycle 不被拒绝。Runtime 仍在实际消费 record 与 mutation 时执行 trust-boundary shape/target validation。
- Character 的所有 active directive 先合并为 `absent | placement` intent：兼容的全 absent 表示不出现；absent 与 placement 或多个 placement 同时存在时 deterministic reject。
- 多 source 的 duplicate `npcId`、duplicate `instanceId`、occupied cell 与不兼容 Character takeover 都 deterministic reject，不存在 last-wins。

Runtime NPC identity 也已冻结：当前 MVP 每张 Map 的最终 `npcId` 唯一，因此 Story Resolver 输出 placement 时固定 `instanceId = npcId`；不得自行拼接 Event id、Map id 或随机后缀。

Resolver 需要在两个时机执行：

1. Map Enter：解析该 Map 的当前完整 NPC 场景。
2. Dialogue child 正常完成且可能改变 EventStateList 后：重新读取 EventStateList，并重新解析当前 Map 的 NPC 场景。

第二种情况不能只恢复 Controls。否则 EventStateList 已经变为 rival-ready，但 Map 仍保留 lab-tutorial 的旧 interaction，导致剧情状态与可交互场景分离。

场景刷新必须保留当前 Map Frame、RenderDomain 和场景生命周期；不能为了刷新剧情而重启整张 Map 或创建第二个 Map Frame。当前 `RPGMapHandler.setNPC()` 已支持 live NPC replacement，Story Resolver 解析出完整 NPCPlacement[] 后直接调用该 public API；无需扩展 Map package。

Story Resolver 已成为生产 authority；map.mjs 中 Map 4 的 professor / rival-lab 与 Map 8 的 rival-casual 硬编码 placement 已移除。前两者来自 active Event，后者来自 Character.defaultScenes；Map-only placement 只保留明确不受 Story Content 管理的静态 NPC。

## 10. 实现闭环记录

以下表格保留设计时发现的问题与当前闭环结果；不再表示未完成工作。

| 当前文件 / 实现 | 当前问题 | 目标修正 |
| --- | --- | --- |
| struct.Event/prologue | 只有 lab / after-lab，使用 Map 1，只有 rival directive | 改为 Map 4 的 lab-tutorial / rival-ready / after-battle，并包含 professor 与 rival |
| struct.EventStateMutation/prologue-to-route | from 使用 prologue.lab-complete | 改为 prologue.after-battle + first-route absent |
| struct.Event/first-route | 当前缺少该 Event | 在启用 prologue-to-route 前创建 active state 与实际道路场景 |
| struct.StoryIndex/current | 仍索引 Map 1 | 从更新后的 Character / Event source 重新生成 |
| struct.Character/rival.defaultScenes | 曾使用 Map 1 | 已改为 Map 8 宿敌家场景；Map 4 placement 只属于 Event |
| struct.Dialogue/lab-rival-intro | 两个 Choice 都指向自身 | 分别指向 lab-rival-exchange-accept 与 lab-rival-defer |
| struct.Dialogue/route-bandit-threat | 当前引用 prologue-to-route | 移除该 mutation；first-route 应由 professor-first-journey-accept 推进 |
| struct.Dialogue | 当前 FSDB 文件还缺少博士教学 / 战后等目标 Dialogue | 按 78 完成对应 Content records |
| subsystems/map.mjs | 曾硬编码 Map 4 NPC placement | 已由 Story Resolver / Event 场景解析提供，Resolver failure 显式失败 |
| Dialogue / Event / Mutation .info.meta | 嵌套结构 schema 较宽 | Builder 必须完成 62 / 64 规定的深层引用和结构校验 |

闭环事实：Map 4 的目标坐标由 prologue Event Content 持有；Map 8 的 rival-casual 已写入 `Character/rival.defaultScenes`，并由 StoryIndex/current 派生索引。旧 Map 1 示例与 Map-only rival fallback 均已退出生产 authority。

## 11. Builder 与 Runtime 验收

### Builder / Content 验证

- prologue 必须包含 lab-tutorial、rival-ready、after-battle 三个 state。
- 三个 state 的 Map 4 directive 都包含 professor 与 rival-lab，placement 与当前地图坐标一致。
- interaction 中的 Dialogue key 必须存在。
- professor-tutorial-ready、prologue-battle-resolved、prologue-to-route 的 Mutation key 必须存在。
- Mutation 的非空 stateId 必须属于对应 Event；null 必须按 62 解释。
- Mutation 的 `from` 与 `to` 必须覆盖相同 Event identity；每个写入都必须有明确前置条件，禁止无条件覆盖剧情状态。
- Dialogue Runtime 在读取 Mutation 后先验证 schema、全部 Event 引用与非空 stateId，再读取前置状态并执行 OCC；坏目标 Content 不得污染 EventStateList。
- first-route Event 在 prologue-to-route 被引用时必须存在，并有 active state。
- Dialogue Choice target 必须存在；choices 与 mutation 互斥。
- lab-rival-intro 不得有指向自身的无意义 Choice，除非内容明确设计为循环复习。
- StoryIndex 必须与 Character / Event source 一致。
- 最终 Map NPC 合并结果不得存在重复 npcId。

### Runtime / E2E 验收

1. Base 在首次启动 Map 前原子 materialize `PlayerWorld/current={mapId:3,x:3,y:8,direction:2}` 与 `EventStateList/current=[{prologue,lab-tutorial}]`；已存在合法 baseline 时不覆盖，已 materialize 的 `null` 必须失败且不得自动修复。
2. 进入 Map 4，博士在 (10,6)，劲敌在 (8,5)；只有博士可交互。
3. 博士选择重听可循环；选择暂缓不改变 EventStateList。
4. 博士选择准备好后，Dialogue mutation 将 prologue 推进到 rival-ready。
5. 不离开 Map 4，Story Resolver 刷新后劲敌可交互，博士不再提供初始教学入口。
6. 劲敌暂缓不创建 Relationship / Contract / Card，也不调用 Battle。
7. 劲敌接受后，双向 Relationship / Contract 与双向 CarriedCards 原子提交；提交失败不调用 Battle。
8. Battle cancelled / failed 不播放胜负对白、不推进 after-battle；已提交的 Contract / Card 保留。
9. Battle 正常结束且 Integrity 已提交后，三种 BattleResult 进入各自战后 Dialogue。
10. 任一战后 Dialogue 完成后，prologue-battle-resolved 将 Event 推进到 after-battle。
11. Map 4 刷新后博士可交互并启动 professor-first-journey；劲敌仍在场但不可交互。
12. 玩家暂缓外出任务，Event 保持 after-battle；再次与博士交互仍可接受。
13. 玩家接受任务后，prologue-to-route 原子结束 prologue 并激活 first-route。
14. 离开研究所后，Map 5 / Map 7 场景由 first-route 与 Story Resolver 提供；prologue 移除后 Character fallback 按规则恢复。
15. Save / Load 与跨进程恢复不属于本次集成验收；当前只要求同一运行期间 EventStateList、Map scene 与剧情进度一致。未来存档设计再冻结重新载入后的恢复语义。

## 12. 明确不做

当前不增加：

- 通用 Quest / Objective / Trigger / Action / Command / Workflow engine；
- Choice 条件表达式、任意 action 或 Choice mutation；
- EventStateMutation 对 Relationship、Contract、Card、Battle 或 PlayerWorld 的写操作；
- battle-started / battle-running 等临时 Event state；
- 为三种 BattleResult 无条件拆分三个剧情状态；
- Dialogue 当前行、Choice pending、terminalDialogueId 的 Shared State 持久化；
- 由 Dialogue 直接调用 Battle，或由 Battle 直接调用 Dialogue；
- 为 Map scene refresh 重启 Map Frame。

先完成这一条 prologue vertical slice，再由真实内容需求决定是否需要扩展 Story Runtime。
