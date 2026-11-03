# PokeMan Dialogue Web Component 设计

> 路径：`examples/PokeMan/doc/69-dialogue-web-component.md`
>
> 状态：**Presentation implementation-ready / PokeMan v1 Presentation decisions frozen**
>
> 本文只定义 PokeMan 的 Dialogue Web Presentation：视觉布局、Web Component 行为、Presentation-local state、人物 sprite 展示、Conversation / History 模式以及 Presentation 资源接入。固定 Dialogue 的业务数据模型见 [64-dialogue.md](./64-dialogue.md)；Content / FSDB 物理模型见 [68-content-fsdb.md](./68-content-fsdb.md)。**“implementation-ready”只指 Presentation implementation-ready，不表示 PokeMan 的 NPC → Dialogue gameplay integration 已完成设计或实现。**
>
> 本文不修改 `@loomrealm-game/rpg-dialogue` Runtime、public API 或 Frozen Presentation ABI。PokeMan 实现必须继续兼容现有 canonical `lr-dialogue-*` tags、attrs/data 和 Render Event / Custom Event 语义。
>
> **v1.1 override：**真实产品验证后的连续性、布局与视觉密度修正见 [74-dialogue-presentation-v1.1.md](./74-dialogue-presentation-v1.1.md)。74 在以下内容上是唯一实施权威：shell visibility / interaction readiness、READY 与 History coordination、Conversation reveal gate、active-character 30/70 layout、<=640px compact geometry 与 <=479px stacked breakpoint、sprite load idempotence/retry、visual-density baseline，以及这些内容对应的 browser / product E2E qualification。本文中 §4.5、§5.1–§5.2、§12–§14、Transition table、Local coordination contract、§21.1–§21.2 若仍出现旧的 presented / setPresented、READY hidden、32/68 或 640px stacked 规则，均为 v1.0 历史描述，**不得按旧规则实施**，必须按 74 执行。其他未被 74 明确覆盖的 Frozen contract 继续有效。

# 1. 目标

PokeMan 的 Dialogue Presentation 采用一个覆盖在 Map 等底层画面之上的 **Conversation Modal**。

Modal 外壳在整个 Dialogue session 内保持稳定，但内部布局按模式和当前是否存在 active character 切换：

```text
backdrop
└─ modal
   ├─ Conversation mode
   │  ├─ with active character
   │  │  ├─ character pane
   │  │  └─ content pane
   │  └─ without active character
   │     └─ content pane (100%)
   │
   └─ History mode
      └─ history pane (100%)
```

设计原则：

1. **Modal shell 稳定**：Conversation、Choice、History 切换时，backdrop、modal 的位置、尺寸、边框和 stacking 不重建、不跳动。
2. **有 active character 时人物区稳定**：当前台词、逐字显示和 Choice 切换时，左侧 character stage 保持稳定。
3. **没有 active character 时不保留空人物栏**：旁白、transient speaker 或 caller 无法提供人物视觉时，Conversation content 使用 100% modal 内容宽度。
4. **History 是同一 Modal 的全宽布局模式**：进入 History 后隐藏人物区和当前 Conversation 内容，History 占满 modal 内容区域；不切换 Scene，也不创建第二个 modal。
5. **History 优先可读性而不是人物展示**：历史记录包含多 speaker、多轮消息，不使用单一左侧人物去代表整段历史。
6. **Presentation-local state 留在 Web Component**：逐字显示、当前选项、滚动位置等不进入 gameplay state。
7. **Runtime ABI 保持不变**：PokeMan 只替换默认 Browser Presentation 的具体视觉实现，不向 `rpg-dialogue` 增加 PokeMan-specific API。
8. **数据 producer 与 UI consumer 分离**：PokeMan gameplay / composition 层负责把业务人物外观解析成 versioned Presentation sprite ref；Web Component 只消费最终 ref，不查询 Character / NPC / Story 业务数据。

# 2. 非目标

本阶段不设计或实现：

- Dialogue graph / `Choice.target` 的业务解释；
- `Dialogue.mutation`、Event State、Relationship、Contract；
- NPC → Dialogue 的 Map wiring；
- PokeMan `subsystems/dialogue.mjs` 的 gameplay implementation；
- Character → current NPC appearance 的 Story / World resolver implementation；
- Battle / Message / System Menu；
- 独立人物立绘资源系统；
- 表情、口型、Live2D、Spine；
- 新的 `rpg-dialogue` RenderNode 或新的 Runtime command；
- 对 Frozen `RPG_DIALOGUE_V0_PRESENTATION.md` / v1 public surface 的修改。

本文会冻结 **Presentation 所需的上游数据 producer contract**，使 Web Component Agent 不需要猜输入；但实际 NPC interaction、Dialogue graph 和 Story Resolver wiring 属于后续 gameplay integration。

当前 PokeMan production topology 仍保持现状：

```text
base
map
```

实现本 Presentation 不要求把 `dialogue.mjs` 加入 `game.json` / `launch.*.json`，也不要求把 NPC interaction 接到 RPGDialogue。

# 3. 参考范式

本设计组合两类成熟交互范式：

```text
JRPG / Fire Emblem style
→ 人物展示区 + 对话正文区
→ 强化当前 speaker 的存在感

Visual Novel backlog
→ 当前对话与 History 共用同一视觉上下文
→ History 使用连续 speaker + text 列表
→ 打开时优先定位到最新记录
```

PokeMan 不复制任何具体游戏 UI；只采用这些信息架构原则。人物继续复用 Map sprite 资源，但界面本身采用现代、克制的 JRPG / Visual Novel 视觉语言，不把像素素材的风格扩展成整套像素化 UI。

# 4. 与 RPG Dialogue canonical tree 的关系

现有 `@loomrealm-game/rpg-dialogue` canonical tree 保持：

```text
lr-dialogue-view
├─ lr-dialogue-characters
│  └─ lr-dialogue-character*
├─ lr-dialogue-conversation
│  ├─ lr-dialogue-text
│  └─ lr-dialogue-choices
│     └─ lr-dialogue-choice*
├─ lr-dialogue-controls
│  └─ lr-dialogue-control-hint*
└─ lr-dialogue-history
   └─ lr-dialogue-history-entry*
```

PokeMan Web Component 不重排 Runtime tree identity；视觉布局通过 `lr-dialogue-view` 的 Shadow DOM、slot 和 CSS grid 完成。

建议 `lr-dialogue-view` Shadow DOM：

```html
<div class="backdrop" aria-hidden="true"></div>
<section class="modal">
  <slot></slot>
</section>
```

其中默认 slot 的 canonical direct children 按 mode 投影：

```text
Conversation mode
lr-dialogue-characters    → character
lr-dialogue-conversation  → content
lr-dialogue-history       → hidden
lr-dialogue-controls      → controls / hints

History mode
lr-dialogue-characters    → hidden
lr-dialogue-conversation  → hidden
lr-dialogue-history       → full modal content area
lr-dialogue-controls      → controls / hints
```

`lr-dialogue-history[visible="true"]` 触发 History layout。History mode **不得依赖父级 MutationObserver 做 ordering-critical 切换**；由 `lr-dialogue-history` 在 `visible` attr 的同步 `attributeChangedCallback` 中通知所属 `lr-dialogue-view`，再由 view 同步维护仅供 Presentation 使用的 mode，例如：

```text
data-mode="conversation"
data-mode="history"
```

该 mode 不是 Runtime state，不通过事件回传。

## 4.1 精确 Wireframe：四个 UI state

PokeMan Presentation 把 UI 视图归一为四个互斥状态：

```text
REVEALING
CONVERSATION
CHOICES
HISTORY
```

它们不是四个 Runtime mode。Runtime 仍然只有：

```text
CONVERSATION
HISTORY
```

对应关系固定为：

```text
Runtime CONVERSATION
├─ text reveal incomplete
│  → UI REVEALING
├─ text reveal complete + choices.length === 0
│  → UI CONVERSATION
└─ text reveal complete + choices.length > 0
   → UI CHOICES

Runtime HISTORY
└─ history.visible === "true"
   → UI HISTORY
```

因此：

- `REVEALING / CONVERSATION / CHOICES` 都由 `lr-dialogue-conversation` 的 Presentation-local state 区分；
- `HISTORY` 由 Runtime retained fact `lr-dialogue-history[visible="true"]` 决定；
- `revealing` 不进入 Runtime、Renderer Store 或 Shared State；
- `choices.length` 来自 canonical `lr-dialogue-choices` children，不创建额外状态 authority。

下面 REVEALING / CONVERSATION / CHOICES 的 Wireframe 默认画“存在 active character”的双栏形态；**没有 active character 时，状态语义完全相同，只是 characters pane 隐藏、conversation pane 变为 100% 宽度。**

### REVEALING

条件：

```text
history.visible = false
AND revealComplete = false
```

Wireframe：

```text
┌──────────────────────────────────────────────────────────────┐
│                      lr-dialogue-view                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ modal                                                  │  │
│  │                                                        │  │
│  │ ┌──────────────────┐  ┌─────────────────────────────┐ │  │
│  │ │ characters       │  │ conversation                │ │  │
│  │ │                  │  │ Professor                   │ │  │
│  │ │   active sprite  │  │                             │ │  │
│  │ │                  │  │ 你终于来▌                  │ │  │
│  │ │                  │  │                             │ │  │
│  │ │                  │  │ choices*                    │ │  │
│  │ └──────────────────┘  └─────────────────────────────┘ │  │
│  │                                                        │  │
│  │ controls                                               │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

`choices*` 表示 canonical choices 如果存在仍然存在并可显示。原因是 Frozen Runtime 在 Conversation mode 中只要 `choices.length > 0`，`previous / next` 就是 enabled，并可能向 Conversation 发出 `choice-previous / choice-next`；Presentation 必须能够履行 selection 语义，不能因为文字仍在 reveal 就丢弃这些事件。

此状态：

- character pane：仅在存在 active character 时 visible，否则 hidden / no grid space；
- conversation pane：visible；
- text：partial；
- choices：若存在则 visible，可导航；
- continue indicator：hidden；
- history：hidden；
- `commit`：立即 reveal all，**不得 submit**。

### CONVERSATION

条件：

```text
history.visible = false
AND revealComplete = true
AND choices.length === 0
```

Wireframe：

```text
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────────┐  ┌───────────────────────────────────┐ │
│ │ characters       │  │ conversation                      │ │
│ │                  │  │ Professor                         │ │
│ │   active sprite  │  │                                   │ │
│ │                  │  │ 你终于来了。                      │ │
│ │                  │  │                                   │ │
│ │                  │  │                              ⌄    │ │
│ └──────────────────┘  └───────────────────────────────────┘ │
│ controls                                                     │
└──────────────────────────────────────────────────────────────┘
```

此状态：

- text：完整；
- choices container：仍然存在，但 children 为空；
- continue indicator：visible；
- `commit`：发出 `submit({ conversationId })`。

### CHOICES

条件：

```text
history.visible = false
AND revealComplete = true
AND choices.length > 0
```

Wireframe：

```text
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────────┐  ┌───────────────────────────────────┐ │
│ │ characters       │  │ conversation                      │ │
│ │                  │  │ Professor                         │ │
│ │   active sprite  │  │                                   │ │
│ │                  │  │ 你愿意接受吗？                    │ │
│ │                  │  │                                   │ │
│ │                  │  │ ┌───────────────────────────────┐ │ │
│ │                  │  │ │ 接受                      ›   │ │ │
│ │                  │  │ ├───────────────────────────────┤ │ │
│ │                  │  │ │ 拒绝                          │ │ │
│ │                  │  │ └───────────────────────────────┘ │ │
│ └──────────────────┘  └───────────────────────────────────┘ │
│ controls                                                     │
└──────────────────────────────────────────────────────────────┘
```

此状态：

- continue indicator：hidden；
- `selectedChoiceId` 可以为 `null`；
- `choice-next`：选择第一个 enabled 或下一个 enabled；
- `choice-previous`：选择最后一个 enabled 或上一个 enabled；
- `commit + selectedChoiceId = null`：no-op；
- `commit + selected enabled choice`：发出 `submit({ conversationId, choiceId })`。

### HISTORY

条件：

```text
history.visible = true
```

Wireframe：

```text
┌──────────────────────────────────────────────────────────────┐
│                      lr-dialogue-view                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ modal                                                  │  │
│  │                                                        │  │
│  │ HISTORY                                                │  │
│  │ ────────────────────────────────────────────────────── │  │
│  │                                                        │  │
│  │ Professor                                              │  │
│  │ 你终于来了。                                           │  │
│  │                                                        │  │
│  │ Rival                                                  │  │
│  │ 我已经等很久了。                                       │  │
│  │                                                        │  │
│  │ Professor                                              │  │
│  │ 现在开始吧。                                           │  │
│  │                                                        │  │
│  │ controls                                               │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

此状态：

- `lr-dialogue-characters`：layout / a11y hidden；
- `lr-dialogue-conversation`：layout / a11y hidden，但 HTMLElement 与 local state 保留；
- `lr-dialogue-history`：100% modal content width；
- `previous / next`：只滚动 History；
- `confirm`：Runtime disabled / no-op；
- `history`：返回 Runtime CONVERSATION；
- `cancel`：返回 Runtime CONVERSATION；
- 打开后按 retained-before-event 顺序处理 `visible=true`，随后响应 `scroll-to-latest`。

## 4.2 Canonical DOM 与 Shadow DOM 分区

Runtime materialize 的 light DOM **不得改形**：

```html
<lr-dialogue-view version="0">
  <lr-dialogue-characters>
    <lr-dialogue-character
      character-id="..."
      display-name="..."
      active="true|false">
    </lr-dialogue-character>
  </lr-dialogue-characters>

  <lr-dialogue-conversation
    conversation-id="..."
    speaker-name="...">
    <lr-dialogue-text text="..."></lr-dialogue-text>

    <lr-dialogue-choices>
      <lr-dialogue-choice
        choice-id="..."
        text="..."
        enabled="true|false">
      </lr-dialogue-choice>
    </lr-dialogue-choices>
  </lr-dialogue-conversation>

  <lr-dialogue-controls>
    <lr-dialogue-control-hint action="confirm" ...></lr-dialogue-control-hint>
    <lr-dialogue-control-hint action="previous" ...></lr-dialogue-control-hint>
    <lr-dialogue-control-hint action="next" ...></lr-dialogue-control-hint>
    <lr-dialogue-control-hint action="history" ...></lr-dialogue-control-hint>
    <lr-dialogue-control-hint action="cancel" ...></lr-dialogue-control-hint>
  </lr-dialogue-controls>

  <lr-dialogue-history visible="false|true">
    <lr-dialogue-history-entry
      entry-id="..."
      speaker-name="..."
      text="...">
    </lr-dialogue-history-entry>
  </lr-dialogue-history>
</lr-dialogue-view>
```

PokeMan 只定义每个 canonical element 自己的 Shadow DOM。

### `lr-dialogue-view`

```text
#shadow-root
├─ .backdrop
└─ .modal[role=dialog]
   ├─ .surface
   └─ <slot class="canonical-root">
```

`.modal` 是唯一稳定外框。canonical slot 使用 layout flattening，使四个 canonical direct children 直接参与 modal grid；实现不得把 canonical nodes 从 `lr-dialogue-view` reparent 到别处。

第一版固定：

```css
.modal {
  position: relative;
  display: grid;
}

.surface {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

slot.canonical-root {
  display: contents;
}

::slotted(lr-dialogue-characters)   { grid-area: characters; }
::slotted(lr-dialogue-conversation) { grid-area: conversation; }
::slotted(lr-dialogue-controls)     { grid-area: controls; }
::slotted(lr-dialogue-history)      { grid-area: history; }
```

`.surface` 只能承担背景 / border / shadow，不能成为额外 layout item。

Conversation + active character：

```css
grid-template-columns: 30% minmax(0, 70%);
grid-template-rows: minmax(0, 1fr) auto;
grid-template-areas:
  "characters conversation"
  "characters controls";
```

Conversation + no active character：

```css
grid-template-columns: minmax(0, 1fr);
grid-template-rows: minmax(0, 1fr) auto;
grid-template-areas:
  "conversation"
  "controls";
```

此时 `lr-dialogue-characters` 视觉与 a11y 隐藏，不占 grid space。

History：

```css
grid-template-columns: minmax(0, 1fr);
grid-template-rows: minmax(0, 1fr) auto;
grid-template-areas:
  "history"
  "controls";
```

### ordering-critical local coordination

LoomRealm Web Projector 对 retained attrs 的 `setAttribute()` 是同步的，而后续 Render Event 也会同步投递给 live element；`MutationObserver` callback 是后续 microtask。因此下列两个 ordering-critical 状态 **禁止依赖 MutationObserver**：

```text
history.visible → view mode
control-hint facts → derive interactionActive; latch shellPresented after first ACTIVE
```

固定协调路径：

```text
lr-dialogue-history.attributeChangedCallback("visible")
→ synchronously notify closest lr-dialogue-view
→ view updates mode
→ view synchronously pauses/resumes conversation presentation
→ attribute reconciliation returns
→ later scroll-to-latest Render Event sees final History geometry
```

以及：

```text
lr-dialogue-control-hint.attributeChangedCallback("action" | "enabled")
→ synchronously notify parent lr-dialogue-controls
→ controls re-read its five direct canonical hints
→ synchronously notify closest lr-dialogue-view
→ view updates interactionActive / shellPresented
```

内部方法名可实现为例如：

```text
view.syncHistoryFrom(historyElement)
controls.syncFactsToView()
view.syncControlsFrom(controlFacts)
Conversation private interaction-active gate
```

这些方法是 **bundle-private / Window-local implementation seam**：

- 不是 `rpg-dialogue` public ABI；
- 不进入 Render Tree；
- 不 emit Session Event；
- 不 emit WebPresentation Custom Event；
- 不修改 managed attrs；
- 不可被 gameplay code 当作 command surface。

非 ordering-critical 的纯视觉派生（例如 character children reorder 后重新计算 first active）可以使用 local MutationObserver / slotchange；但 History mode 与 ACTIVE/READY visibility 不可以。

### `lr-dialogue-characters`

```text
#shadow-root
└─ .character-stage
   └─ <slot>
```

规则：

- 多个 `lr-dialogue-character` 可以同时存在；
- PokeMan v1 的 character stage **只显示一个人物**；
- `active="true"` 为 0 个时：view 切为 no-character Conversation layout，character stage 不占空间；
- `active="true"` 为 1 个时：显示该 character；
- `active="true"` 多于 1 个时：按 canonical light-DOM 顺序显示第一个 active character，其余 active character 视觉隐藏；
- inactive characters 保留在 DOM，但不占主要视觉空间；
- 多 active 不视为 Runtime / Presentation error，不抛异常；
- 不根据 `speaker-name` 猜测 active character。

active character 存在但 sprite data / resource 无效时，仍然认为“有 active character”，保留 character pane，并显示 §8.1 定义的 fallback。只有 **没有 active character** 时才 collapse pane。

`lr-dialogue-character[active]` 的同步 attribute callback 应通知 `lr-dialogue-characters` 重新计算 first active；children reorder/removal 可通过 container-local child observation 补充，因为它不参与 Render Event ordering。

### `lr-dialogue-character`

```text
#shadow-root
└─ .character
   ├─ canvas.sprite[aria-hidden=true]
   └─ .fallback[aria-hidden=true]
```

`display-name` 可用于 accessibility / fallback，不要求在左侧重复显示姓名；当前 speaker 文本由 Conversation 右侧 header 表达。

### `lr-dialogue-conversation`

```text
#shadow-root
└─ .conversation
   ├─ header.speaker
   ├─ .body
   │  └─ <slot>
   │     ├─ lr-dialogue-text
   │     └─ lr-dialogue-choices
   └─ footer.status
      └─ .continue-indicator
```

`lr-dialogue-conversation` 是唯一 Conversation interaction owner，持有：

```text
observedConversationId
revealText
revealIndex
revealComplete
selectedChoiceId
conversationScroll
revealTimer
interactionActive = true|false (drives Conversation event/reveal gate)
```

v1.1 不再使用 `setPresented()` 作为 visibility / interaction seam。Conversation 的 reveal timer 与 Render Event gate 由 private interaction-active gate 控制；gate 关闭时暂停并保留 `revealIndex`，重新打开时在同一 conversation 内继续。

它根据 private state 在自己的 Shadow DOM 内计算：

```text
REVEALING | CONVERSATION | CHOICES
```

不通过 LoomRealm Custom Event 上报该 phase。

### `lr-dialogue-text`

```text
#shadow-root
└─ span.text
```

canonical `text` attr 永远保存完整文本；可见 partial text 只由 Conversation 通过 local coordination 写入 WC-local rendering state。

### `lr-dialogue-choices`

```text
#shadow-root
└─ .choice-list[role=listbox]
   └─ <slot>
```

容器始终存在；没有 choice 时为空。

### `lr-dialogue-choice`

```text
#shadow-root
└─ .choice[role=option]
   ├─ .label
   └─ .selection-marker
```

`selected` 不是 canonical attr。Conversation 通过 private method / local DOM coordination 设置 WC-local selection。

### `lr-dialogue-controls`

```text
#shadow-root
└─ footer.control-hints
   └─ <slot>
```

五个 canonical hint node 始终存在。Controls 汇总完整 action set：

```text
confirm
previous
next
history
cancel
```

只有五个 action 都已 materialize 后才允许推导 controlsComplete / interactionActive；未完整 materialize 时 interactionActive=false 且初始 shellPresented=false，防止 first-connect flash。shellPresented 的 latch/reset 规则以 74 §4 为准。

### `lr-dialogue-control-hint`

必须观察：

```text
action
label
enabled
```

`action / enabled` 的 attr callback 同步触发 parent controls facts reconciliation；`label` 只更新显示文本。

### `lr-dialogue-history`

```text
#shadow-root
└─ section.history
   ├─ header.history-header
   │  └─ h2 "History"
   ├─ .history-scroll
   │  └─ <slot>
   └─ .empty-state
      └─ "暂无历史记录"
```

History 自己持有：

```text
pixel scroll position
local focus
virtualization state (future)
```

`visible` 必须是 observed attr，并按本节 synchronous coordination 通知 view。

`.empty-state` 是 Presentation-local 派生：没有 `lr-dialogue-history-entry` children 时显示，有 entry 时隐藏。

### `lr-dialogue-history-entry`

```text
#shadow-root
└─ article.entry
   ├─ .speaker
   └─ .text
```

不显示人物大图，不把 `speaker-name` 解析成 Character reference。


## 4.3 State ownership

~~~text
RPGDialogue Runtime
├─ lifecycle: READY | ACTIVE | CLOSED
├─ interaction mode: CONVERSATION | HISTORY
├─ history.visible
├─ choices / enabled facts
└─ canonical control-hint enabled facts

lr-dialogue-view (Presentation-local only)
├─ mode: conversation | history
├─ controlsComplete: boolean
├─ interactionActive: boolean
├─ shellPresented: boolean (one-way latch per connection/session epoch)
└─ hasActiveCharacter: boolean

lr-dialogue-conversation
├─ reveal progress
├─ selectedChoiceId
├─ conversation pixel scroll
└─ UI phase: REVEALING | CONVERSATION | CHOICES

lr-dialogue-history
└─ history pixel scroll / local focus
~~~

interactionActive is derived from a complete canonical control-hint set with at least one enabled action. shellPresented becomes true after the first interactionActive=true in the current Presentation connection/session epoch and remains true across intermediate READY projections.

The exact derivation, shell visibility, inertness, event gates, and reset rules are frozen in [74-dialogue-presentation-v1.1.md](./74-dialogue-presentation-v1.1.md) §4. Do not reintroduce a single presented boolean as both shell visibility and interaction authority.

严禁形成以下反向 authority：

~~~text
WC local phase
→ Runtime mode

selectedChoiceId
→ Renderer Store

History pixel scroll
→ Shared State
~~~


## 4.4 Input / event routing matrix

| UI state | Runtime mode | `confirm` | `previous` | `next` | `history` | `cancel` |
| --- | --- | --- | --- | --- | --- | --- |
| REVEALING | CONVERSATION | `conversation.commit` → reveal all | 有 choices 时 `choice-previous` | 有 choices 时 `choice-next` | → HISTORY | 按 session cancelable |
| CONVERSATION | CONVERSATION | `conversation.commit` → submit | no event | no event | → HISTORY | 按 session cancelable |
| CHOICES | CONVERSATION | commit；无 selection no-op，有 selection submit | `choice-previous` | `choice-next` | → HISTORY | 按 session cancelable |
| HISTORY | HISTORY | no-op | `history.scroll-up` | `history.scroll-down` | → CONVERSATION | → CONVERSATION |

其中 REVEALING 如果当前 Conversation 自带 choices，selection navigation 仍必须工作；`commit` 永远先结束 reveal，不得在同一次 command 中继续 submit。



## 4.5 READY / ACTIVE 的 Modal visibility — superseded by v1.1

本节旧版 “any enabled hint → presented=true / all disabled → hidden” 规则已由 [74 §4](./74-dialogue-presentation-v1.1.md) 完整取代，**不得据本节旧规则实施**。

v1.1 的唯一规则：

- initial READY（当前 epoch 尚未 ACTIVE）：shell hidden、view inert、Conversation inactive；
- 首次 ACTIVE：shellPresented=true，显示 shell；
- 后续 intermediate READY：shell 保持显示，但 modal/view inert，Conversation 事件被忽略且 reveal timer 暂停；
- ACTIVE + HISTORY：shell 保持可见且可交互，Conversation inactive，由 History 接管交互；
- RenderDomain / Dialogue close：shell 被移除；新的 session 从 initial hidden baseline 开始。

modal.hidden / backdrop.hidden 只由 shellPresented 控制；inert、Conversation Render Event gate 与 reveal timer 由 interactionActive 和 mode 控制。不得新增 public active / ready / presented canonical attr，也不得改变 Runtime、Render ABI 或 control-hint 语义。


# 5. Modal 布局

## 5.1 桌面 / 横屏掌机

Modal 外部几何在 Conversation / History 间不变：

```text
modal width  = min(88vw, 960px)
modal height = min(68vh, 520px)
```

Conversation **有 active character**：

```text
character pane = 30%
content pane   = 70%
```

```text
┌────────────────────────────────────────────────────────────┐
│   ┌──────────────────┐  ┌──────────────────────────────┐   │
│   │                  │  │ Professor                    │   │
│   │   CHARACTER      │  │ ──────────────────────────── │   │
│   │                  │  │ 你终于来了。                 │   │
│   │                  │  │                              │   │
│   └──────────────────┘  └──────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

Conversation **没有 active character**：

```text
content pane = 100%
character pane = hidden / no grid space
```

```text
┌────────────────────────────────────────────────────────────┐
│ 路霸                                                       │
│ ────────────────────────────────────────────────────────── │
│ 站住！                                                     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

该规则覆盖：

- narration；
- 只有 `speakerName` 的 transient speaker；
- caller 当前无法提供合法 Character presentation participant；
- characters array 为空；
- characters 存在但没有任何 `active="true"`。

如果存在 active character，但其 sprite data/resource 失败，则 **不 collapse**：保留 30/70，并显示 character fallback。

History 始终单列全宽：

```text
history pane = 100%
```

History 不保留左侧人物区。


## 5.2 窄屏 fallback — responsive rules superseded by v1.1

本节原有“640px 可堆叠”的建议已被 [74 §7](./74-dialogue-presentation-v1.1.md) 取代。不要把所有 max-width: 640px 规则一起移动到 479px。

固定规则：

- >640px：normal shell geometry，active character 使用水平 30/70；
- 480px–640px：保留 compact modal/font/stage geometry，仍使用水平 30/70；
- <=479px：保留 compact geometry，active character 才允许切换为 stacked；
- 无 active character：全宽 Conversation，不创建空 stage；
- History：全宽 History，不保留人物栏。

必须校验 1280×720、800×600、640×480、360×480 的 geometry、正文可用高度、Choice 与 controls 可见性；详见 74 §14.7。


# 6. Backdrop 与层级

Dialogue modal 应明显高于 Map，但仍允许玩家感知底层场景。

推荐：

```css
backdrop background: rgb(0 0 0 / 0.52);
```

`backdrop-filter: blur(2px)` 只能作为可选 enhancement，不能作为可读性前提。

Modal 本体应接近不透明，避免地图纹理穿透正文。

最终 stacking 仍由 RPG Dialogue RenderDomain 的 `zIndex` authority 决定；PokeMan Web Component 不自行建立跨 RenderDomain 的全局层级规则。

# 7. 视觉语言

PokeMan Dialogue UI **不采用像素风格**。

人物素材仍然来自现有 Map character sprite sheet，但：

```text
pixel character asset
≠
pixel-style interface
```

界面本身采用现代、克制的 JRPG / Visual Novel modal 语言：

- soft / high-opacity surface；
- moderate radius；
- subtle shadow；
- 清晰、舒适的 typography；
- restrained accent color；
- 轻量分隔线；
- 短促、平滑的 opacity / transform transition；
- 不依赖 hover；
- focus / selection 对手柄操作必须明显可见。

Modal 不使用：

- hard pixel border；
- square-corner retro frame；
- pixel shadow；
- 模拟 8-bit / 16-bit UI palette；
- 为了“复古感”而降低文字可读性的装饰；
- 把每个控件都做成像素菜单。

人物 sprite 可以与现代 UI surface 并置，形成“现代界面 + 复古人物素材”的视觉反差；这种反差是允许的，也是第一版推荐方向。

推荐 surface 层级：

```text
backdrop
→ dimmed game world

modal
→ high-opacity primary surface

character pane
→ quiet secondary surface / neutral stage

content pane
→ primary reading surface

selected choice
→ subtle accent surface + border / marker
```

推荐基本尺寸：

| 项目 | 初始建议 |
| --- | --- |
| Modal 最大宽度 | 960px |
| Modal 宽度 | 88vw |
| Modal 高度 | 58–68vh |
| Conversation 左区 | 30–34% |
| Conversation 右区 | 66–70% |
| History 内容区 | 100% |
| 外层 padding | 20–28px |
| 内容区 padding | 24–32px |
| 中文正文 | 18–22px |
| speaker | 16–18px / semibold |
| 行高 | 1.6–1.75 |
| Modal radius | 12–20px 起步验证 |
| Choice row | >= 44px |
| mode transition | 120–180ms |

建议：

- Modal shadow 柔和，不做高对比硬边阴影；
- border 若存在，只作为低对比分隔，不承担“像素框”造型；
- accent color 用于 speaker、selected choice、focus marker 等少量位置；
- History 以阅读密度为优先，不把每条 entry 做成厚重 card；
- `prefers-reduced-motion` 下关闭非必要位移和 pulse。

具体色值、字体、radius 和 shadow 在实现阶段通过 PokeMan screenshot qualification 调整，不冻结为 compatibility surface。

# 8. Character pane

Character pane **只属于 Conversation mode 且只有存在 active character 时出现**。进入 History 后该区域隐藏；没有 active character 时 Conversation 自动全宽。

## 8.1 PokeMan v1 Character Presentation data contract

第一版不新增 portrait table。

最终交给 `RPGDialogue.openConversation(...).characters[].data` 的 PokeMan Presentation payload 固定为：

```ts
type PokeManDialogueCharacterDataV1 = Readonly<{
  sprite: Readonly<{
    namespace: "resource.Graphics";
    key: string;
    contentVersion: string;
  }>;
}>;
```

exact contract：

```text
character.data
→ exactly { sprite }

sprite
→ exactly { namespace, key, contentVersion }

namespace
→ exactly "resource.Graphics"

key
→ non-empty hierarchical resource key
→ PokeMan current character assets SHOULD use "Characters/..."

contentVersion
→ ^sha256:[0-9a-f]{64}$
```

generic `@loomrealm-game/rpg-dialogue` Runtime 不解释该 data；该 schema 只属于 PokeMan Presentation consumer contract。

### 8.1.1 authored NPC sprite 与 Presentation ref 不是同一 shape

当前 PokeMan authored `struct.NPC.sprite` 是：

```ts
{
  namespace: "resource.Graphics";
  key: string;
}
```

它 **没有** `contentVersion`，不能直接传给 `lr-dialogue-character`。

LoomRealm Web Presentation `PresentationResourceClient.resource()` 强制要求 expected `contentVersion`。因此 version 必须在 **Subsystem / product composition side** 通过 Content API resolve，不能由 Web Component 猜测。

固定 producer chain：

```text
PokeMan gameplay/composition 已解析的当前人物外观
→ appearance npcId
→ scope.content.record("struct.NPC", npcId)
→ NPC.sprite { namespace, key }
→ scope.content.resource(namespace, key)
→ resource.contentVersion
→ {
     namespace,
     key,
     contentVersion
   }
→ DialogueCharacterV0.data.sprite
→ RPGDialogue
→ RenderNode.data
→ lr-dialogue-character.receiveRenderData(...)
```

这与 Map Runtime 当前把 authored sprite ref 补成 versioned Render ref 的方式一致。

### 8.1.2 Character → NPC appearance responsibility

PokeMan `struct.Character` **没有 sprite 字段**，而一个 Character 可以对应多个 NPC Definition，例如不同服装。因此禁止：

```text
lr-dialogue-character
→ query struct.Character
→ 猜 npcId
```

也禁止：

```text
Character.defaultScenes
→ 随便选第一个 npcId
```

正确责任：

```text
PokeMan gameplay / Story / World composition
→ 知道“当前这次对话里该 Character 使用哪个 resolved NPC appearance”
→ 把该 appearance npcId 交给上游 Dialogue request builder
→ request builder resolve versioned sprite ref
→ Web Component 只显示
```

对由 Map NPC interaction 发起的对话，后续 gameplay integration 应优先使用 **当前 resolved/interacted NPC Instance 对应的 npcId** 作为当前人物外观，而不是重新从 Character Content 猜服装。

如果当前 composition 无法提供明确 appearance binding：

```text
不要猜 sprite
→ 不创建 active visual character
→ characters 可为空 / 无 active
→ Conversation 使用 §5 的全宽 no-character layout
```

这保证 Presentation implementation 可以独立落地，同时不提前发明 Story Resolver / Character↔NPC authority。

### 8.1.3 transient speaker / narration

PokeMan Dialogue 允许：

```text
speakerName 有值、Line.speaker 无值
→ transient/default speaker

speakerName 与 Line.speaker 都无值
→ narration
```

第一版不为它们制造假的 Character identity，也不从 speakerName 反查 NPC。

默认：

```text
transient speaker / narration
→ no active DialogueCharacter
→ full-width Conversation
```

以后若需要 transient speaker 的人物视觉，应增加显式 Presentation participant data，而不是根据显示姓名推断业务 identity。

### 8.1.4 invalid/failure fallback

如果一个 **已经存在的 active character** 的 data 非法或资源失败：

```text
invalid/missing sprite data
OR resource fetch/decode failure
OR non-PNG
OR invalid 4×4 sheet
→ character pane 保留
→ 显示 presentation fallback
→ Conversation 继续可读、可操作
```

fallback 优先级：

```text
display-name 首个 Unicode code point
→ character-id 首个 Unicode code point
→ neutral placeholder
```

不要把 `npcId`、`instanceId`、Relationship identity 塞进 Presentation payload。

## 8.2 Map sprite sheet 约束

当前 PokeMan Map Presentation 使用：

```text
character sheet = 4 columns × 4 rows
column = pattern 0..3
row    = direction 2 / 4 / 6 / 8
```

Dialogue 第一版固定显示正面静止帧：

```text
direction = 2
pattern   = 0
```

裁图：

```text
frameWidth  = image.width / 4
frameHeight = image.height / 4
sourceX     = pattern * frameWidth
sourceY     = ((direction - 2) / 2) * frameHeight
```

宽高不能整除 4 时进入 fallback。

## 8.3 Rendering

人物素材是低分辨率 sprite，因此：

```css
image-rendering: pixelated;
```

canvas 必须 `imageSmoothingEnabled = false`。

该要求只针对 sprite，不表示 UI 使用像素风。

人物 frame 在 character pane 中水平/垂直居中，显示高度目标约 pane 的 45–60%。

## 8.4 PresentationResourceClient

`lr-dialogue-character` 通过 `receiveRenderContext(context)` 获取：

```text
context.resources.resource(
  namespace,
  key,
  contentVersion,
  { signal? }
)
```

实现要求：

- 对 §8.1 exact ref 做本地校验；
- MIME 必须是 `image/png`；
- 使用 per-load `AbortController`；
- 新 data 到来时 abort 旧 load；
- disconnected 时 abort in-flight load；
- stale async result 不覆盖新人物；
- 可释放 ImageBitmap 在失去 owner 后 `close()`；
- resource rejection 属于 presentation failure，不改变 Runtime / gameplay state；
- fallback 后仍可继续对话。

# 9. Conversation mode

右侧结构：

```text
content pane
├─ speaker
├─ separator
├─ text viewport
├─ choices
└─ continue indicator
```

## 9.1 Speaker

`lr-dialogue-conversation[speaker-name]` 决定当前 display speaker。

speaker 只是显示文本，不推导 Character identity。

推荐视觉：

```text
Professor
────────────────────────
```

如果没有 `speaker-name`，speaker 行隐藏，正文获得对应空间。

## 9.2 Text reveal

`lr-dialogue-text[text]` 保留 Presentation-local reveal state：

```text
REVEALING
REVEALED
```

初始逐字显示。推荐基线约 24ms / Unicode code point，但实际速度属于 Presentation policy，可在实现时调优。

`commit` 行为必须兼容当前 ABI：

```text
REVEALING + commit
→ 立即 reveal all
→ 不 emit submit

REVEALED + no choices + commit
→ emitCustomEvent("submit", { conversationId })

REVEALED + choices + commit
→ 仅在存在有效当前选择时 submit
```

Conversation identity 变化必须重置 reveal state、选择状态和正文滚动位置。

## 9.3 Continue indicator

仅满足以下条件时显示：

```text
mode = conversation
AND reveal = REVEALED
AND 当前 conversation 可以继续提交
```

视觉建议使用右下角轻量 chevron / arrow indicator，例如细线 `⌄` 或等价图标。可以使用低幅 opacity 或 translateY 微动效表达可继续，周期约 600–800ms。

该提示应与现代 modal 视觉一致，不使用像素箭头或复古菜单光标。History 模式不显示该 indicator。

# 10. Choice

Choice 不弹第二个窗口，直接位于正文下方，使用现代 selectable row。

示意：

```text
你愿意接受这个任务吗？

┌──────────────────────────────┐
│ 接受                      ›  │
├──────────────────────────────┤
│ 拒绝                         │
└──────────────────────────────┘
```

状态：

```text
normal
selected
disabled
```

视觉建议：

- row 使用轻量 surface / divider，而不是像素菜单框；
- selected 使用 accent background、border、leading marker 或 chevron 中至少两种可见信号；
- disabled 降低对比度并保留明确的 disabled 语义；
- radius 与 modal 整体一致；
- 不使用 `▶` 作为固定的复古像素光标要求；
- 不依赖 hover。

规则：

- `choice-next` / `choice-previous` 只在 enabled choices 间导航；
- 当前没有 selection 时，第一次 next 选第一个 enabled，第一次 previous 选最后一个 enabled；
- **PokeMan v1 固定 wrap-around**：
  - 当前是最后一个 enabled choice + next → 第一个 enabled choice；
  - 当前是第一个 enabled choice + previous → 最后一个 enabled choice；
- disabled choice 保留显示，但不可成为 selection；
- selection 不能只靠颜色表达；
- `choiceId` 只用于 Custom Event payload，不展示给玩家。

# 11. History mode

## 11.1 核心原则

History 不创建新的 modal，但改变 modal 内部布局：

```text
Conversation with character
┌──────────────┬───────────────────────────┐
│ character    │ speaker + current text    │
└──────────────┴───────────────────────────┘

Conversation without character
┌──────────────────────────────────────────┐
│ speaker + current text                   │
└──────────────────────────────────────────┘

History
┌──────────────────────────────────────────┐
│ HISTORY + entries                        │
└──────────────────────────────────────────┘
```

保持不变：

- backdrop；
- modal position；
- modal size；
- modal border / shadow；
- overall stacking；
- 当前 Dialogue session。

History 打开后：

- 隐藏 `lr-dialogue-characters`；
- 隐藏当前 `lr-dialogue-conversation` 的视觉内容；
- `lr-dialogue-history` 占满 modal 内容宽度；
- Conversation 的 reveal / selection / scroll local state 保留。

这里稳定的是 **Modal shell**，不是内部列结构。

## 11.2 History entry

`lr-dialogue-history-entry`：

```text
Professor
你终于来了。

Rival
我已经等很久了。
```

不为每条记录重复大人物 sprite。entry 使用 spacing / separator 区分，不做厚重 card。

## 11.3 打开位置与 ordering

Runtime 打开 History 的 causal order 是：

```text
retained visible=true commit
→ presentation reconcile
→ scroll-to-latest Render Event
```

PokeMan WC 必须确保：

```text
visible attr set
→ synchronous view layout switch
→ synchronous conversation pause
→ then receive scroll-to-latest
```

因此 ordering-critical mode switch 使用 §4.2 synchronous local coordination，不使用 MutationObserver。

History 首次打开默认定位最新记录：

```text
scrollTop = scrollHeight
```

## 11.4 History header

显示：

```text
HISTORY
────────────────────────
```

或本地化等价标题。Conversation mode 恢复 speaker header。

## 11.5 人物区

History mode 明确不显示人物区。History 可能包含多个 speaker；固定大人物既占空间又产生归属歧义。

第一版不实现 History → character stage 绑定。

## 11.6 Empty History

Runtime 允许 History mode 下 entries 为空。

固定 UI：

```text
HISTORY
────────────────────────

暂无历史记录
```

规则：

- empty state 只属于 Presentation-local 派生；
- 不创建新的 canonical RenderNode；
- `scroll-to-latest` / `scroll-up` / `scroll-down` 在空列表上安全 no-op；
- empty History 仍可通过 `history` 或 `cancel` 返回 Conversation。


# 12. Conversation / History mode transition

本节保留 History 的产品行为约束；旧版 setPresented / 32/68 的实现细节由 [74 §4、§7](./74-dialogue-presentation-v1.1.md) 取代。

History 切换固定在同一 shell 内完成：

~~~text
ACTIVE + CONVERSATION
→ History becomes active
→ shell stays visible and non-inert
→ Conversation interaction/reveal pauses
→ character + Conversation hidden from layout/a11y
→ History receives 100% content geometry

History closes while Runtime remains ACTIVE
→ same shell / modal geometry remains
→ Conversation layout restored (30/70 if active character, otherwise full width)
→ Conversation resumes from the same revealIndex / selection / scroll
~~~

约束：

- History 不能把整个 view/modal 设为 inert；History 是当前 ACTIVE mode 的交互 owner；
- Conversation 暂停使用 v1.1 private interaction gate，不再通过旧 setPresented 推导；
- layout switch 同步完成；transition 只负责视觉淡入淡出；
- modal/backdrop 不移动、不缩放、不重新 mount；
- 不做 page slide、scene fade 或第二个 modal。



# 13. Reveal 与 History 的组合状态

本节旧版 view.presented reveal gate 已由 [74 §4.4–§4.5](./74-dialogue-presentation-v1.1.md) 取代。v1.1 使用正交的 mode 与 interaction readiness：

~~~text
mode = CONVERSATION | HISTORY
interactionActive = true | false
~~~

固定：

~~~text
ACTIVE + CONVERSATION
→ interactionActive=true
→ Conversation may reveal / process Conversation Render Events

ACTIVE + HISTORY
→ shell visible, view not inert
→ Conversation interactionActive=false
→ stop reveal timer; preserve revealIndex, selectedChoiceId, scroll
→ History owns active interaction

intermediate READY after first ACTIVE
→ shell remains visible but inert
→ Conversation interactionActive=false
→ stop reveal timer; ignore Conversation Render Events

next ACTIVE + CONVERSATION
→ same shell resumes
→ same Conversation resumes from retained local state unless conversation-id changed

new conversation-id
→ reset reveal / selection according to existing 69 Conversation identity contract
~~~

不要将 shell visibility 当成 reveal/interaction authority。唯一状态真值表与事件 gate 见 74 §4.4–§4.5。



# 14. Canonical element 职责

| Element | PokeMan 职责 |
| --- | --- |
| lr-dialogue-view | backdrop、modal geometry、shellPresented / interactionActive / mode、character/no-character layout、同步 local coordination |
| lr-dialogue-characters | first-active selection、是否存在 active character 的视觉派生 |
| lr-dialogue-character | exact Presentation sprite data、resource load、4×4 crop、fallback、pixel render |
| lr-dialogue-conversation | speaker、reveal timer、choice selection、commit、正文 scroll、private interaction-active gate |
| lr-dialogue-text | 当前可见文本 |
| lr-dialogue-choices | choice list structural container |
| lr-dialogue-choice | row visual、selected / enabled state |
| lr-dialogue-controls | 汇总完整五 action facts、semantic hints、同步通知 view |
| lr-dialogue-control-hint | action / label / enabled visual，并同步通知 controls |
| lr-dialogue-history | visible attr 同步通知 view、全宽 viewport、scroll events、empty state |
| lr-dialogue-history-entry | speaker + text entry |

canonical tags 必须全部注册；不增加 PokeMan-only RenderNode tag。v1.1 private facts 和方法名不是 public ABI。


# 15. Interaction ABI

PokeMan Web Component 必须完整保持现有 Render Event / Custom Event ABI。

Conversation 接收：

```text
choice-next
choice-previous
commit
scroll-up
scroll-down
```

History 接收：

```text
scroll-up
scroll-down
scroll-to-latest
```

Conversation 发出：

```text
submit
```

无 choices：

```js
emitCustomEvent("submit", {
  conversationId
});
```

有 choices：

```js
emitCustomEvent("submit", {
  conversationId,
  choiceId
});
```

不得新增 PokeMan-only Custom Event 来表达 graph、mutation 或 NPC interaction。

# 16. Control hints

`lr-dialogue-controls` 只显示 **semantic action hint**，第一版不得显示物理键位 glyph。

PokeMan 可以根据 canonical `action` 做本地化，例如：

```text
confirm   → 继续
previous  → 上一个
next      → 下一个
history   → 历史
cancel    → 返回
```

有 choices 时可以把 previous / next 合并成视觉上的“选择”提示，但 underlying canonical hint nodes 仍保持五个，不能改变 Runtime facts。

第一版明确禁止由 Dialogue Web Component 自行显示：

```text
[A]
[B]
[Y]
Enter
Space
ArrowUp
gamepad south
任何其他 physical binding
```

原因是 physical Keyboard / Gamepad / unified-controls mapping 属于 product composition，不属于 Dialogue Runtime 或当前 Presentation data authority。

只有未来 Common Controls 明确提供独立、可消费的 device-hint Presentation contract 后，才允许把 semantic hint 与当前物理 glyph 组合。

小屏空间不足时，control hints 可以压缩或只显示当前 enabled 的关键动作；不得遮挡正文和 choice。

## 16.1 Pointer / touch boundary

现代 selectable row 只是一种视觉呈现，不代表第一版获得 pointer / touch gameplay authority。

PokeMan v1 固定：

```text
pointer / touch
→ MAY drive hover / pressed visual feedback
→ MUST NOT directly emit submit
→ MUST NOT toggle History
→ MUST NOT cancel Conversation
→ MUST NOT mutate selectedChoiceId as a gameplay navigation path
```

业务交互仍只能来自 Runtime 已定义的 semantic controls / Render Events。

如果以后需要鼠标或触屏直接选择 / 提交，必须先扩展统一 controls / Dialogue interaction contract，不能由 Web Component 私自形成第二条 authority path。

# 17. Accessibility

即使主要目标是掌机，也应保证基本 Web accessibility：

- modal 使用 `role="dialog"` 或等价语义；
- active Dialogue 时提供可辨识 label；
- History header 可作为 section heading；
- disabled choice 暴露 `aria-disabled="true"`；
- selected choice 暴露 `aria-selected="true"`；
- History 隐藏时不能继续暴露为可交互可访问内容；
- History 打开时 Conversation visual content 与 character stage 应被隐藏并从交互语义中移除；
- 动画应尊重 `prefers-reduced-motion`；
- 颜色不是 selection / disabled 的唯一信息源。

Web Component 不抢占 product 的 raw keyboard focus mapping；semantic controls 仍从 Runtime Render Event 进入。

# 18. Failure behavior

## 18.1 Bootstrap / registration

PokeMan Dialogue bundle 在任何 `customElements.define()` 前必须先检查全部 canonical tags：

```text
lr-dialogue-view
lr-dialogue-characters
lr-dialogue-character
lr-dialogue-conversation
lr-dialogue-text
lr-dialogue-choices
lr-dialogue-choice
lr-dialogue-controls
lr-dialogue-control-hint
lr-dialogue-history
lr-dialogue-history-entry
```

任一已注册：

```text
→ throw before first Dialogue customElements.define()
→ 禁止留下半注册状态
```

这与 generic RPG Dialogue browser bundle 的 fail-before-partial-registration policy 一致。

## 18.2 Character presentation failure

以下统一降级到 §8.1 fallback：

- invalid/missing Presentation sprite data；
- Content resource rejection；
- MIME 非 PNG；
- PNG decode 失败；
- sprite sheet 非 4×4；
- stale load；
- load 被 abort。

不得：

- 自动 submit；
- 自动 cancel；
- 修改 Runtime；
- 反向修正 Render attrs/data。

## 18.3 Ordinary WC failure

普通 Presentation failure 遵循 LoomRealm Web Presentation contract：

```text
presentation-local failure/report
→ no Store rollback
→ no Runtime gameplay mutation
→ best-effort continuation
```

实现应尽量局部退化而不是让整个 Dialogue 不可读。

# 19. Presentation 资源落地

## 19.1 Bootstrap 形态：classic script

LoomRealm `presentation.json` scripts 通过 ordered classic：

```html
<script src="..."></script>
```

加载，不是 ESM。

因此 PokeMan v1 source 固定为 **self-contained classic IIFE**：

```text
examples/PokeMan/presentation/dialogue.browser.js
```

约束：

- 文件内不得使用 top-level `import` / `export`；
- 不依赖 runtime dynamic module loader；
- bundle/script 自己完成全部 `lr-dialogue-*` registration；
- 顶部先检查全部 canonical tag collision，再开始任何 define；
- 不加载 generic `game-libs/rpg-dialogue/browser/rpg-dialogue.browser.js`。

当前实现不引入额外 TS/esbuild build step；如果未来迁移为 TS，应继续产出相同 classic IIFE runtime artifact，不改变 `presentation.json` contract。

## 19.2 CSS / Shadow DOM responsibility

新增：

```text
examples/PokeMan/presentation/
├─ dialogue.browser.js
└─ dialogue.css
```

职责固定：

```text
dialogue.browser.js
→ Shadow DOM markup
→ Shadow-internal component CSS
→ interaction/presentation-local behavior

dialogue.css
→ canonical host-level styles
→ CSS custom properties / design tokens
→ Window-level composition hooks
→ MUST NOT 假设可以直接选择 Shadow 内部 .modal/.speaker/.choice
```

Shadow-internal style 应使用 CSS variables，例如：

```css
:host {
  --pokeman-dialogue-surface: ...;
  --pokeman-dialogue-radius: ...;
}
```

内部 Shadow CSS 读取这些 variables。除非明确设计 `::part`，外部 `dialogue.css` 不承担 Shadow 内部 class styling。

## 19.3 FSDB Presentation resources

同步到：

```text
[FSDB]PokeMan/[resource]Presentation/dialogue/
├─ dialogue.browser.js.js
└─ dialogue.css.css
```

`presentation.json` 固定变为：

```json
{
  "formatVersion": 1,
  "styles": [
    { "namespace": "Presentation", "key": "map/map.css" },
    { "namespace": "Presentation", "key": "dialogue/dialogue.css" },
    { "namespace": "Presentation", "key": "page.css" }
  ],
  "scripts": [
    { "namespace": "Presentation", "key": "controls/device-input.browser.js" },
    { "namespace": "Presentation", "key": "map/map.browser.js" },
    { "namespace": "Presentation", "key": "dialogue/dialogue.browser.js" }
  ]
}
```

script declaration order必须保证：

```text
controls
→ map
→ dialogue
→ window.onload
→ presentation start
```

generic RPG Dialogue browser script不进入 config。

## 19.4 Sync source-of-truth

第一版 **直接扩展现有**：

```text
examples/PokeMan/scripts/sync-map-presentation.mjs
```

不要同时创建第二个 dialogue sync script，也不要在本实现中重命名旧脚本。

虽然文件名历史上写着 map，但本次把它扩成 PokeMan v1 当前 Presentation 资源的单一同步入口：

```text
controls/device-input.browser.js
map/map.browser.js
map/map.css
dialogue/dialogue.browser.js
dialogue/dialogue.css
page.css
```

继续保留现有安全性质：

- source/dist equality checks（对 generic map/controls）；
- PokeMan authored dialogue source → FSDB byte equality；
- SHA-256 drift check；
- atomic staging / backup / replace；
- rollback；
- symlink rejection；
- `--check`；
- idempotence。

同步测试 `examples/PokeMan/test/presentation-sync.test.mjs` 必须覆盖新增 dialogue JS/CSS。

`play.bat` 继续调用同一个 `sync-map-presentation.mjs`，因此本实现不需要改启动入口。

`prepare-pwa-content.mjs` 已按 `presentation.json` refs 收集 Presentation resources；新增 refs 后只要 FSDB resource 存在即可被闭包包含，不增加第二套 PWA Presentation resource list。

## 19.5 Production topology boundary

Presentation 实现完成后：

```text
game.json
launch.hostra.json
launch.pwa.json
```

仍可保持：

```text
base
map
```

本任务不因为要测试 WC 而把空的 `subsystems/dialogue.mjs` 接入 production topology。

若测试需要直接构造 `RPGDialogue`，`@loomrealm-game/rpg-dialogue` 只作为 qualification/test dependency 使用；这不等价于 PokeMan gameplay Dialogue subsystem 已经集成。

# 20. Interaction state machine

本节只给实现状态机；Runtime / Presentation ownership 以 §4.3 为准。

```text
                         new conversation-id
                                  │
                                  ▼
                      ┌──────────────────────┐
                      │      REVEALING       │
                      │ mode=CONVERSATION    │
                      │ revealComplete=false │
                      └──────────┬───────────┘
                                 │
                    timer complete / commit
                                 │
                 ┌───────────────┴────────────────┐
                 │                                │
          choices.length=0                 choices.length>0
                 │                                │
                 ▼                                ▼
      ┌────────────────────┐            ┌────────────────────┐
      │    CONVERSATION    │            │      CHOICES       │
      │ revealComplete=true│            │ revealComplete=true│
      │ choices=0          │            │ choices>0          │
      └─────────┬──────────┘            └─────────┬──────────┘
                │                                 │
                │ submit                          │ selected + submit
                ▼                                 ▼
          settle operation                  settle operation

REVEALING / CONVERSATION / CHOICES
                │
                │ controls.history()
                ▼
      ┌────────────────────┐
      │      HISTORY       │
      │ mode=HISTORY       │
      │ visible=true       │
      └─────────┬──────────┘
                │
                │ history() or cancel()
                ▼
      restore previous Conversation phase
      (REVEALING / CONVERSATION / CHOICES)
```

History 进入前必须保存的不是一个额外业务 state，而是当前 Conversation WC 已经持有的 local state：

```text
revealIndex
revealComplete
selectedChoiceId
conversationScroll
```


### Transition table

| From | Trigger | Guard | Action | To |
| --- | --- | --- | --- | --- |
| new Conversation | conversation-id changes | text non-empty | reset local state; start reveal | REVEALING |
| new Conversation | conversation-id changes | text empty + no choices | mark revealed | CONVERSATION |
| new Conversation | conversation-id changes | text empty + choices | mark revealed | CHOICES |
| REVEALING | reveal timer completes | no choices | revealComplete=true | CONVERSATION |
| REVEALING | reveal timer completes | has choices | revealComplete=true | CHOICES |
| REVEALING | commit | no choices | reveal all; no submit | CONVERSATION |
| REVEALING | commit | has choices | reveal all; no submit | CHOICES |
| REVEALING | choice-next/previous | has choices | update selectedChoiceId; continue reveal | REVEALING |
| CONVERSATION | commit | no choices | emit submit({conversationId}) | settle |
| CHOICES | choice-next/previous | enabled target exists | update selectedChoiceId | CHOICES |
| CHOICES | commit | no selection | no-op | CHOICES |
| CHOICES | commit | selected enabled | emit submit({conversationId, choiceId}) | settle |
| any Conversation phase | Runtime sets History visible | ACTIVE | shell stays visible; Conversation interaction/reveal pauses; History owns interaction | HISTORY |
| HISTORY | scroll-to-latest | after visible retained reconcile | scroll to newest entry | HISTORY |
| HISTORY | scroll-up/down | history has entries | local scroll | HISTORY |
| HISTORY | Runtime clears History visible | ACTIVE | restore layout; resume Conversation if its interaction gate is active | previous Conversation phase |
| any phase | new conversation-id | — | old reveal/selection/scroll state discarded | recompute from new Conversation |
| initial READY before first ACTIVE | all five hints disabled | shell latch not yet set | keep modal/backdrop hidden and view inert | initial READY |
| active phase | all five hints become disabled | shell was already presented | keep shell visible; set view inert; stop reveal; ignore Conversation events | intermediate READY |
| intermediate READY | any canonical control hint becomes enabled | Runtime ACTIVE projection reconciled | remove inert; show mode-specific interaction owner without hiding shell | ACTIVE |
| any state | Dialogue RenderDomain closes | — | remove Dialogue shell; clear Presentation-local lifecycle state | removed |

### Local coordination contract

History / READY coordination 不向 Conversation 发送新的 LoomRealm Render Event。

固定同步路径：

~~~text
History attr change:
lr-dialogue-history.attributeChangedCallback("visible")
→ view.syncHistoryFrom(history)
→ view recompute mode
→ Conversation interaction active iff interactionActive && mode === "conversation"
~~~

~~~text
Control fact change:
lr-dialogue-control-hint.attributeChangedCallback("action"|"enabled")
→ controls.syncFactsToView()
→ view.syncControlsFrom(facts)
→ derive controlsComplete / interactionActive
→ latch shellPresented=true on first interactionActive=true
→ modal/backdrop visibility follows shellPresented
→ inertness / Conversation event gate / reveal timer follow interactionActive and mode
~~~

这些是 bundle-private Window-local hooks：

- 不是 public ABI；
- 不发 Session Event；
- 不进入 Render Tree；
- 不改变 managed attrs；
- 不改变 Runtime mode；
- 只控制 WC-local layout / timer / visibility。

禁止把 ordering-critical History/READY 切换放进 MutationObserver callback。


# 21. Testing strategy


## 21.1 Web Component browser tests

至少验证：

- canonical tags 全部成功注册；
- 任一 tag collision 时在第一条 Dialogue define 前失败，零 partial registration；
- classic script 无 ESM dependency；
- canonical root slot 使用 display: contents；
- fresh connection epoch 的 initial READY（五 hints 完整且全 disabled）modal/backdrop hidden + inert；
- first ACTIVE 显示 shell，之后的 intermediate READY 保持 shell visible 但 inert；
- intermediate READY 时 Conversation Render Events 被忽略且 reveal timer paused；
- ACTIVE modal visible；ACTIVE + HISTORY 时 shell 不 inert，History 是 interaction owner；
- History visible attr 的同步 callback 在 scroll-to-latest 前完成最终 layout；
- 不使用 MutationObserver 承担 History/READY ordering；
- active character → 30/70 at 1280×720, 800×600, 640×480；
- 640×480 保留 compact modal/font/stage rules；360×480 才使用 stacked layout；
- zero active character → full-width Conversation；
- active character sprite failure → 保留 character pane + fallback；
- 0 / 1 / 多 active 的 deterministic first-active；
- transient speaker / narration 不制造 fake Character，默认 full-width；
- text reveal / reveal-all-first-commit；
- choices next / previous / disabled / fixed wrap；
- exact submit payload；
- History full-width；
- empty History 显示“暂无历史记录”；
- empty History scroll events safe no-op；
- History open/close 保留 reveal / selection / scroll；
- exact Character data schema，包括 sha256 contentVersion；
- PNG / 4×4 crop / no smoothing；
- all sprite-load triggers share one idempotent coordinator；
- same failed sprite attempt does not auto-retry on ordinary reconciliation；
- stale resource result / abort / disconnected cleanup；
- semantic control hints 无 physical key/gamepad glyph；
- pointer/touch 不形成 gameplay authority；
- reduced motion。


## 21.2 LoomRealm ABI closed-loop qualification

不要发明新的测试架构。以现有：

```text
test/rpg-dialogue-v1/qualification.test.mjs
```

为 harness 模板，保留真实：

```text
RPGDialogue
→ Renderer Data /3
→ WebProjector
→ PokeMan lr-dialogue-* bundle
→ Render Event
→ emitCustomEvent("submit")
→ RPGDialogue result
```

qualification 必须至少覆盖：

```text
REVEALING commit → reveal only
choice-next/previous → local selection
CHOICES commit → exact choiceId result
History open → retained visible reconcile → final layout → scroll-to-latest
History cancel → return Conversation without submit
initial READY → retained DOM may exist but modal hidden/inert before first ACTIVE
ACTIVE → intermediate READY → shell stays visible/inert and Conversation reveal pauses
next ACTIVE Conversation → same live tree/shell becomes interactive without hidden flash
fresh second Dialogue session → initial READY hidden baseline is re-armed
```

这是 **Presentation closed loop**。测试可以直接构造 RPGDialogue；不要求 production `dialogue.mjs` 已接线。

## 21.3 PokeMan data-producer fixture

增加一个针对 §8.1 producer boundary 的 fixture/test，证明：

```text
authored NPC.sprite {namespace,key}
+ Content API resource result.contentVersion
→ exact DialogueCharacterV0.data.sprite
```

此测试只验证 resolver helper / fixture contract，不实现 Story graph。

至少验证：

- authored ref 没有 contentVersion 时不能直接作为 Presentation ref；
- resolved contentVersion 满足 `sha256:<64 hex>`；
- unresolved / ambiguous appearance 不猜 npcId，而是产生 no active visual character；
- Web Component 不读取 `struct.Character` / `struct.NPC` record。

## 21.4 Presentation sync tests

更新 `examples/PokeMan/test/presentation-sync.test.mjs`：

- `--check` 覆盖 dialogue JS/CSS；
- source → FSDB byte equality；
- drift detection；
- atomic failure rollback；
- `presentation.json` exact ordered refs；
- PWA content closure包含新增 Presentation resources。

## 21.5 Screenshot / geometry qualification

至少建立：

```text
1280×720 conversation with character
1280×720 conversation without character
1280×720 choices
1280×720 history
1280×720 empty history
640×480 conversation
640×480 history
narrow viewport fallback
```

关注：

- modal 不溢出；
- sprite 清晰；
- no-character 不留空左栏；
- 中文正文可读；
- choice 不截断；
- History 全宽且不显示 character stage；
- Conversation ↔ History 外框几何稳定。

# 22. 第一版验收

**本文的 Done = PokeMan Dialogue Presentation implementation done，不等于 gameplay Dialogue subsystem done。**

实现完成：

- [ ] PokeMan 注册自己的 canonical `lr-dialogue-*` Web Components。
- [ ] bundle 是 presentation.json 可加载的 classic self-contained script。
- [ ] 所有 canonical tag 在任何 define 前统一 collision preflight。
- [ ] 不加载 generic RPG Dialogue browser bundle。
- [ ] 不修改 RPG Dialogue Runtime / public API / Frozen ABI。
- [ ] Dialogue 以 modal 覆盖底层地图。
- [ ] Modal 在 Conversation / History 间保持同一位置和尺寸。
- [ ] READY retained projection 隐藏 modal，并暂停未完成 reveal。
- [ ] History / READY 使用同步 WC-local coordination，不依赖 MutationObserver ordering。
- [ ] 有 active character 时 Conversation 使用人物区 + 正文区。
- [ ] 无 active character 时 Conversation 使用 100% 内容宽度。
- [ ] transient speaker / narration 默认不制造 fake Character identity。
- [ ] active character 的无效 sprite 使用 fallback，不 collapse character pane。
- [ ] `DialogueCharacterV0.data.sprite` 使用 exact versioned PokeMan Presentation schema。
- [ ] 文档规定的 upstream producer chain 明确从 authored NPC.sprite 经 Content API 获取 contentVersion；WC 不查询 Character/NPC records。
- [ ] 0 / 1 / 多 active 按 deterministic first-active policy。
- [ ] sprite 使用正面静止 4×4 frame，no smoothing。
- [ ] Conversation 支持 speaker、reveal、continue、choices、fixed wrap。
- [ ] History 隐藏人物区、全宽显示、默认 scroll latest。
- [ ] Empty History 显示本地 empty state，scroll events no-op。
- [ ] History open/close 保留 Conversation local state。
- [ ] semantic Render Events 与 exact `submit` Custom Event 兼容。
- [ ] Control hints 不自行显示 physical key/gamepad glyph。
- [ ] Pointer/touch 不形成第二条 gameplay authority。
- [ ] Shadow-internal CSS 与外部 `dialogue.css` 职责清楚，不依赖外部 CSS 穿透 Shadow DOM。
- [ ] `presentation.json` ordered refs 包含 Dialogue JS/CSS。
- [ ] 现有 `sync-map-presentation.mjs` 被扩展为唯一同步入口，覆盖 dialogue source → FSDB 与 `--check`。
- [ ] Presentation sync / PWA content closure tests 覆盖新增资源。
- [ ] closed-loop qualification 复用现有 RPG Dialogue qualification harness 结构并运行 PokeMan bundle。
- [ ] production `game.json` / `launch.*.json` / `subsystems/dialogue.mjs` 不因本 Presentation task 被擅自扩 scope。
- [ ] 不引入 Dialogue graph、Event mutation、NPC wiring 等 gameplay 职责。

# 23. 后续可选增强

第一版之后可按真实需求逐项增加：

1. 多 character stage / active character 亮度切换；
2. sprite idle animation（人物资源增强，不改变现代 UI 基调）；
3. speaker-specific accent；
4. 专用 portrait resource；
5. expression / pose Presentation data；
6. History 小型 inline speaker marker（仅在确有识别需求时；不恢复固定人物区）；
7. History 搜索或更长 session virtualization；
8. touch-specific affordance。

这些均不是当前实现前置条件，也不应提前扩展 `rpg-dialogue` Runtime contract。
