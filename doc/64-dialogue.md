# 固定对话

> 独立技术设计记录。不改写 `../DESIGN.md`。本文只设计作者写好的固定 Dialogue Content；Card 模式 AI 自由对话不在这里讨论。Dialogue / Event / Map 的完整集成见 [79-story-dialogue-event-integration.md](./79-story-dialogue-event-integration.md)。FSDB 物理编码见 [68-content-fsdb.md](./68-content-fsdb.md)。

归宿总表见 [数据落点](./60-data-placement.md)，人物见 [人物](./61-character.md)，Event / EventStateMutation 见 [事件](./62-event.md)。

# 目标

固定 Dialogue 保持一个很小的模型：

> 一个 Dialogue 是一段线性台词；可以有默认 `speakerName`；末尾可以结束或出现 Choice。Choice 只跳到另一个 Dialogue。没有 Choice 的 Dialogue 可以在完成时引用一个 EventStateMutation。

不设计通用 Node、Flow、脚本命令或任意业务 action。

Content 只定义；真正解释 Dialogue graph 并执行 Mutation 的是 PokeMan Dialogue Subsystem。

# FSDB record

Dialogue 使用：

```text
[struct]Dialogue/<dialogueId>.json
→ namespace = struct.Dialogue
→ key = dialogueId
```

Dialogue identity 由 FSDB key 提供；source 不重复保存 `id`。

当前 shape：

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

固定约束：

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

所以 Dialogue 只有三种形态：

```text
plain terminal
→ lines
→ complete

branching
→ lines
→ choices
→ target Dialogue

state-changing terminal
→ lines
→ mutation
→ EventStateMutation
→ complete
```

# Speaker

持久 Character speaker：

```json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "你来晚了。"
    }
  ]
}
```

`speaker` 固定解释为 `struct.Character` key。

transient/default speaker：

```json
{
  "speakerName": "路霸",
  "lines": [
    {
      "text": "站住。"
    },
    {
      "text": "把值钱的东西留下。"
    }
  ]
}
```

解析规则：

```text
Line.speaker 存在
→ 持久 Character
→ 显示 Character.name
→ richer presentation data 如果未来需要再单独定义

Line.speaker 不存在
+ Dialogue.speakerName 存在
→ 使用默认显示名
→ 不产生 Character identity

Line.speaker 不存在
+ Dialogue.speakerName 不存在
→ narration
```

因此：

```text
speakerName
!= characterId
!= npcId
!= instanceId
```

`speakerName` 只是 presentation fallback，不能参与 Relationship、Contract、Event Character takeover 或 BattleActor identity。

多个 transient NPC 可以复用同一个 Dialogue / `speakerName`，不会因此成为同一个 Character。

如果以后确实需要同一段 Dialogue 内多个 transient speaker、显式旁白 override、头像切换等，再按真实需求扩展；MVP 不建立 participant registry。

# Choice

Choice 只出现在全部 `lines` 播放完以后。

```text
Dialogue A
→ Choice
   ├─ Dialogue B
   └─ Dialogue C
```

Choice 只有：

```text
text
+
target Dialogue key
```

禁止在 Choice 上增加：

```text
mutation
action
result
setEventState
setAffinity
createContract
startBattle
任意 Shared State mutation
```

例如：

```json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "准备好了吗？"
    }
  ],
  "choices": [
    {
      "text": "接受",
      "target": "professor-contract-accept"
    },
    {
      "text": "拒绝",
      "target": "professor-contract-refuse"
    }
  ]
}
```

# Choice 分支后的状态变化

Choice 仍只跳到另一个 Dialogue。需要改变 Event state 的分支通过新的 terminal Dialogue 表达：

```text
professor-intro
→ Choice
   ├─ 接受 → professor-contract-accept
   │          ├─ lines
   │          └─ mutation
   └─ 拒绝 → professor-contract-refuse
              └─ lines
```

接受分支：

```json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "那么，契约成立。"
    }
  ],
  "mutation": "professor-intro-progressed"
}
```

这里 `mutation` 固定解释为 `struct.EventStateMutation` key。

# Dialogue.mutation 的边界

`Dialogue.mutation` **只表示 Event state 推进**。

即使台词内容是“契约成立”，Mutation 也不会创建 `Relationship.contract`：

```text
terminal Dialogue completion
├─ Dialogue.mutation
│  → PokeMan Dialogue Subsystem
│  → pokeman.EventStateList/current only
│
└─ same business interaction establishes Contract
   → PokeMan business Runtime
   → current target NPC Instance
   → resolve base BattleActor
   → create pokeman.Relationship/<holder>:<servant>.contract
      ├─ integrity = BattleActor.max_hp
      └─ skills[] = copy(BattleActor.skills[])
```

两条写入的 ordering / failure coordination 是 Runtime 设计，不通过扩展 EventStateMutation action DSL 解决。

# 分支与循环

Choice target 可以形成任意分支，也允许 cycle：

```text
question
→ Choice
   ├─ done
   └─ explanation
        ↓
      question
```

Builder **不能因为合法 Dialogue graph 有 cycle 就失败**。

当前不存在无交互自动 jump，所以允许 cycle 不等于 Runtime 会自动死循环。

# PokeMan Dialogue Subsystem

底层 `@loomrealm-game/rpg-dialogue` 负责当前 Conversation interaction / presentation。

PokeMan Dialogue business runtime 负责：

```text
Dialogue graph
Choice target
speaker resolution
EventStateMutation interpretation
Shared State commit
```

执行概念：

```text
entry Dialogue key
↓
读取 struct.Dialogue
↓
逐行解析 speaker
↓
调用 rpg-dialogue 展示 lines / choices
↓
choices?
├─ yes → 玩家选择 target
│        → load target Dialogue
│        → continue
└─ no  → mutation?
         ├─ no  → complete
         └─ yes → load EventStateMutation
                  → read pokeman.EventStateList/current
                  → validate all from
                  → build new EventStateList
                  → state.commit()
                  → complete
↓
return terminalDialogueId
```

`terminalDialogueId` 是当前 Frame completion result，不进入 Shared State。

## Terminal completion 与 Mutation commit boundary

Dialogue graph 到达 terminal Dialogue 后：

- 如果 terminal Dialogue 没有 mutation，Dialogue Frame 可以正常返回 terminalDialogueId。
- 如果 terminal Dialogue 有 mutation，Dialogue Subsystem 必须先读取 EventStateMutation、读取 EventStateList/version、校验全部 from，并提交新的 EventStateList。
- 只有 Mutation commit 成功后，Dialogue Frame 才能以 completed 返回 terminalDialogueId。
- Mutation Content 读取失败、from mismatch、OCC conflict 或 commit outcome unknown 都不能伪装成成功 terminal；按 Dialogue Frame failure 返回，由 caller 处理。
- Map Subsystem 的 Map Frame Handler 不重复执行 mutation；它只消费 terminalDialogueId 中明确约定的业务意图，并在 child 正常完成、EventStateList 已成功变化后刷新当前 Map scene。

terminalDialogueId 不是剧情进度，也不是业务 action。它只标识当前 graph 最终到达的 terminal Dialogue。Contract / Card / Battle 等业务操作由 Map Subsystem 的 Map Frame Handler 调用对应 owner 的业务 Service 完成，不放入 Dialogue Subsystem；这里不引入额外的 Orchestrator class 或 Frame。

具体序章分支、Mutation 分配和 Battle 协作见 [79-story-dialogue-event-integration.md](./79-story-dialogue-event-integration.md)。

# Runtime Memory

当前 Dialogue 执行状态：

```text
current dialogue id
current line index
pending choice interaction
```

这些都属于 Runtime Memory。

Shared State 不保存：

```text
Dialogue definition copy
current line index
pending choice
terminalDialogueId
EventStateMutation definition
```

# Builder 检查

Builder 应检查：

- `struct.Dialogue` FSDB key 合法；
- source record 不重复保存 `id`；
- `lines` 存在且至少一项；
- Line `text` 合法；
- Line `speaker` 指向存在的 `struct.Character`；
- `choices` 存在时至少一项；
- Choice `text` / `target` 完整；
- Choice `target` 指向存在的 `struct.Dialogue`；
- `choices` 与 `mutation` 互斥；
- `mutation` 指向存在的 `struct.EventStateMutation`；
- Mutation 中非空 Event state reference 有效。

Builder 不因为合法 Dialogue cycle 失败。

# 当前不冻结

以下内容等真实需求出现后再设计，不算当前 physical-schema gap：

- 本地化文本最终组织；
- 头像 / 表情 / 音效等 richer presentation metadata；
- 根据 Shared State 动态隐藏 / 显示 Choice 的条件系统；
- Mutation mismatch / OCC conflict 的 UI / Message 行为；
- 一个 Dialogue 内多个 transient speaker / 显式 narration override。

以下已经冻结，不再算 physical-schema gap：

```text
namespace = struct.Dialogue
identity = FSDB record key
source 不保存 id
speaker = Character key
Choice.target = Dialogue key
mutation = EventStateMutation key
choices 与 mutation 互斥，允许两者都不存在
speakerName = presentation fallback, not identity
Completion = terminalDialogueId runtime result
```