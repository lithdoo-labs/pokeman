# RPG Dialogue v0 Presentation

> 层级：`@loomrealm-game/rpg-dialogue` Presentation / Interaction ABI  
> 状态：Active / Normative / Frozen  
> 稳定程度：Frozen  
> 依赖：[RPG Dialogue v0 API](./RPG_DIALOGUE_V0_API.md)、[Web Presentation API v1](../../doc/15-contracts/web-presentation-api-v1.md)、[Render Update v1](../../doc/15-contracts/render-update-v1.md)

本文定义 RPG Dialogue v0 的 canonical Render Tree、`attrs/data` ownership、WebComponent local state 与双向 interaction event contract。

它不是剧情脚本、DOM 模板或 LoomRealm Core 的新协议。Core 只理解通用 `RenderNode`、Render Update 与 Web Presentation ABI；`character`、`conversation`、`choice`、`history` 等语义只属于 `rpg-dialogue`。

## 1. Ownership model

Canonical node 统一遵守：

```text
RenderNode.tag / tree
→ RPG Dialogue structural vocabulary

RenderNode.key
→ RPG Dialogue-private presentation lifetime identity

RenderNode.attrs
→ RPG Dialogue-defined retained semantic facts

RenderNode.data
→ caller-owned WebComponent payload where API explicitly exposes data
```

业务 identity 与 Render lifetime identity 必须分离，并且三类 business identity 的 scope 不同：

```text
characterId
→ current RPGDialogue session business identity

choiceId
→ current Conversation business identity only

entryId
→ current RPGDialogue History session-state business identity

RenderNode.key
→ presentation node lifetime identity
→ obeys Render Update v1 one-shot key rules
→ MUST NOT be treated as business identity
```

因此相邻 Conversation 即使都存在 `choiceId = "yes"`，它们仍是不同 Choice；新的 `conversation-id` 开始时，上一轮 Choice semantic lifetimes 全部结束。

v0 暴露 caller-owned `data` 的 canonical nodes 是：

```text
lr-dialogue-conversation
lr-dialogue-character
lr-dialogue-choice
```

映射固定为：

```text
ConversationContentV0.data
→ lr-dialogue-conversation.data

DialogueCharacterV0.data
→ lr-dialogue-character.data

ConversationChoiceV0.data
→ lr-dialogue-choice.data
```

RPG Dialogue 对这些 caller-owned `data` 统一要求：

```text
MUST NOT wrap
MUST NOT interpret
MUST NOT rename keys
MUST NOT inject Dialogue fields
MUST NOT apply defaults inside data
MUST NOT derive gameplay behavior from data
```

其他 canonical nodes 的 Dialogue facts 放在 `attrs`，`data` 保持 `{}`。

## 2. Canonical Render Tree

```text
lr-dialogue-view
├─ lr-dialogue-characters
│  └─ lr-dialogue-character*
│
├─ lr-dialogue-conversation
│  ├─ lr-dialogue-text
│  └─ lr-dialogue-choices
│     └─ lr-dialogue-choice*
│
├─ lr-dialogue-controls
│  └─ lr-dialogue-control-hint*
│
└─ lr-dialogue-history
   └─ lr-dialogue-history-entry*
```

`lr-dialogue-choices` 是稳定 structural container；没有 choices 时它仍存在，只是 children 为空。

这是视觉语义树，不约束具体 HTML/Shadow DOM/Canvas/WebGL 实现。

## 3. Canonical node ABI

| node / key | Dialogue-owned attrs | `data` owner | Subsystem → WC Render Event | WC → Subsystem Custom Event |
| --- | --- | --- | --- | --- |
| `lr-dialogue-view` / `dialogue` | `version` | `{}` | none | none |
| `lr-dialogue-characters` / `characters` | none | `{}` | none | none |
| `lr-dialogue-character` / private live key | `character-id`, `display-name?`, `active` | caller | none | none |
| `lr-dialogue-conversation` / `conversation` | `conversation-id`, `speaker-name?` | caller | `scroll-up`, `scroll-down`, `choice-previous`, `choice-next`, `commit` | `submit` |
| `lr-dialogue-text` / `text` | `text` | `{}` | none | none |
| `lr-dialogue-choices` / `choices` | none | `{}` | none | none |
| `lr-dialogue-choice` / private live key | `choice-id`, `text`, `enabled` | caller | none | none |
| `lr-dialogue-controls` / `controls` | none | `{}` | none | none |
| `lr-dialogue-control-hint` / private live key | `action`, `label`, `enabled` | `{}` | none | none |
| `lr-dialogue-history` / `history` | `visible` | `{}` | `scroll-up`, `scroll-down`, `scroll-to-latest` | none |
| `lr-dialogue-history-entry` / private live key | `entry-id`, `speaker-name?`, `text` | `{}` | none | none |

Event ABI identity 是：

```text
(target node kind, direction, event name, payload shape)
```

Event 不得投到未声明该 event 的 canonical node。

## 4. RenderDomain and identity lifetime

一个 `RPGDialogue` session 使用一个长期 Dialogue RenderDomain。它可以在第一次 `openConversation()` 时延迟创建；创建后跨 READY / ACTIVE 和多个顺序 Conversation 保持存活，直到 `RPGDialogue.close()`、Frame abort 或其他 session-terminal cleanup。

Dialogue RenderDomain 的默认 stacking value 是：

```ts
const DEFAULT_RPG_DIALOGUE_Z_INDEX = 2_147_483_646;
```

实际值来自构造 options：

```text
effective zIndex
= options.zIndex ?? DEFAULT_RPG_DIALOGUE_Z_INDEX
```

`options.zIndex` 由 API contract 校验为 Render Update v1 合法 int32。调用方拥有本业务 Presentation composition 的 stacking policy，可以显式选择任意合法 int32；Dialogue 不替业务推断 Map、Battle、overlay 或其他 RenderDomain 的相对层级。

第一次创建 Domain 时必须使用该 effective `zIndex` 建立 retained state；同一 `RPGDialogue` instance lifetime 内不得改变。v0 不提供运行中 `zIndex` setter，也不允许单个 Conversation 覆盖它。默认值保留 `2_147_483_647` 作为更高一级 stacking 空间只是默认 composition convenience；调用方显式覆盖后由调用方自己承担相对 stacking 语义。

```text
RPGDialogue
└─ one Dialogue RenderDomain (zIndex = instance effective zIndex)
   ├─ openConversation(A)
   ├─ READY
   ├─ openConversation(B)
   ├─ READY
   └─ close / abort → RenderDomain.close()
```

Conversation settle 不关闭 RenderDomain。READY 期间保留最后一次成功的 retained Dialogue projection，但不存在 active Conversation，Conversation submit 必须被拒绝。下一次 `openConversation()` 在同一个 Domain 中更新 retained projection，并分配新的 `conversation-id`。

### 4.1 Stable structural nodes

第一次 materialize Dialogue tree 后，以下 structural nodes 在该 RenderDomain lifetime 内保持 live，不因 Conversation 切换而删除：

```text
dialogue
characters
conversation
text
choices
controls
history
```

因此这些固定 key 可以安全作为稳定 RenderNode identity：

```text
dialogue
characters
conversation
text
choices
controls
history
```

`lr-dialogue-view` 表示整个 `RPGDialogue` Presentation session：

```ts
{
  key: "dialogue",
  tag: "lr-dialogue-view",
  attrs: { version: "0" },
  data: {},
  children: [...],
}
```

### 4.2 Collection item nodes

以下节点是 collection item：

```text
lr-dialogue-character
lr-dialogue-choice
lr-dialogue-control-hint
lr-dialogue-history-entry
```

它们的 `RenderNode.key` 由 RPG Dialogue 私有分配。v0 不冻结 key 字符串格式，也不允许 business WebComponent 从 key 推导 `characterId`、`choiceId`、`action` 或 `entryId`。

Character 与 History entry 在同一 semantic presence 连续存在时 MAY 保留同一 private Render key，从而保持同一个 HTMLElement / presentation-local state。例如 Alice 连续出现在相邻完整 `characters` snapshot 中时，可以继续使用当前 live character node。

Choice 的 lifetime 更窄：Choice 只属于当前 Conversation。每次新的 `conversation-id` 开始时，上一轮所有 Choice semantic lifetimes 都结束；下一轮所有 Choice nodes MUST 使用 fresh private Render keys，即使新的 Conversation 复用了相同 `choiceId` 字符串：

```text
Conversation A
choiceId = "yes" → private key K1

Conversation B starts
previous Choice lifetime ends
choiceId = "yes" → private key K2
K2 != K1
```

Control hint 使用 §13 固定的五个 semantic action。第一次 materialize controls 后，每个 action 分配一个 private live key，并在当前 RenderDomain lifetime 内持续保留该 node/key；mode/state 变化只更新其 attrs，不 remove/reinsert control hint node。

对于会被删除的 dynamic item，一旦 RenderNode 被删除，其 key 就按 Render Update v1 规则永久 consumed 于当前 wire Domain lifetime。以后即使相同 business identity 再次出现，也必须分配 fresh Render key：

```text
same continuous eligible semantic presence
→ MAY preserve RenderNode.key

removed semantic presence, then later returns
→ MUST use fresh RenderNode.key
```

`setHistory()` 的 replace 同样遵守这个规则；被移除的 History entry 以后即使以相同 `entryId` 再出现，也不能复用已 consumed 的旧 Render key。

`RPGDialogue` 不拥有 Quest、Inventory、Battle、Map 或 Shared State gameplay authority。

## 5. Characters

`characterId` 是当前 `RPGDialogue` session 内的 Character business identity，通过 `character-id` attr 暴露；RenderNode key 是模块私有 live identity。

概念映射：

```ts
{
  key: characterNodeKey,
  tag: "lr-dialogue-character",
  attrs: {
    "character-id": character.characterId,
    "active": character.active ? "true" : "false",
    ...(character.displayName === undefined
      ? {}
      : { "display-name": character.displayName }),
  },
  data: character.data,
  children: [],
}
```

`characterNodeKey` 是 RPG Dialogue private implementation identity，不是 public ABI 字符串。

Character canonical attrs 只保留跨 Presentation 实现普遍有意义的 `character-id`、`display-name?` 与 `active`。具体立绘布局、表情、动画、模型状态等属于 caller-defined `character.data`，例如：

```ts
{
  placement: "left",
  expression: "angry",
  live2dModel: "alice"
}
```

RPG Dialogue 不解释这些字段；业务 `lr-dialogue-character` 通过 `receiveRenderData(character.data)` 消费 caller schema，并可使用 `WebPresentationContext.resources` 读取资源。

Character 与 Conversation speaker 完全解耦。`active` 只描述该 Character 自己的通用 presentation emphasis fact；RPG Dialogue 不依据 `speakerName` 查找、创建、激活或改写 Character。`characters` 可以为空，即使 Conversation 同时存在 `speakerName`。

## 6. Conversation

Conversation 是一次 `openConversation()` 对应的当前可提交 interaction unit：

```text
lr-dialogue-conversation
├─ lr-dialogue-text
└─ lr-dialogue-choices
   └─ lr-dialogue-choice*
```

Conversation structural node：

```ts
{
  key: "conversation",
  tag: "lr-dialogue-conversation",
  attrs: {
    "conversation-id": internalConversationId,
    ...(conversation.speakerName === undefined
      ? {}
      : { "speaker-name": conversation.speakerName }),
  },
  data: conversation.data,
  children: [...],
}
```

`speaker-name` 是当前 Conversation 自己的显示文本，不是 Character reference。它可以在 `characters=[]` 时存在，也不要求与任何 `display-name` 相等。

`conversation-id` 由 `RPGDialogue` 为每次成功开始的 `openConversation()` 分配；它不是 Story identity，也不由 caller 提供。同一个 `RPGDialogue` instance lifetime 内不得复用已经成功分配过的 `conversation-id`；具体格式不是 public ABI。

当 `conversation-id` 改变时，Conversation WC 必须重置至少：

```text
reveal/typewriter progress
selectedChoiceId
conversation-local scroll
local focus/animation associated with previous Conversation
```

同时，新的 `conversation-id` 定义新的 Choice identity scope；上一轮 Choice semantic lifetimes 在这里全部结束。

Conversation settle 后 structural node 继续存活；READY 期间它只是最后一次 retained projection，不代表仍有 active operation。

业务 `lr-dialogue-conversation` 可以通过 `receiveRenderData(conversation.data)` 消费 caller-defined Conversation schema，例如 voice/resource key、窗口样式或其他 presentation metadata。RPG Dialogue 不解释这些字段。

## 7. Text and choices

完整文本事实始终通过 `lr-dialogue-text.attrs.text` 提供：

```ts
{
  key: "text",
  tag: "lr-dialogue-text",
  attrs: { text: conversation.text },
  data: {},
  children: [],
}
```

Runtime/Render Tree 不通过持续发布 partial string 实现 typewriter；逐字显示进度属于 Presentation-local state。

Choice 的 `choiceId` 只在当前 Conversation 内作为 business identity；对应 RenderNode 使用 private live key：

```ts
{
  key: choiceNodeKey,
  tag: "lr-dialogue-choice",
  attrs: {
    "choice-id": choice.choiceId,
    text: choice.text,
    enabled: choice.enabled === false ? "false" : "true",
  },
  data: choice.data,
  children: [],
}
```

`choiceNodeKey` 不是 `choiceId`，也不属于 public ABI。数组 index 不是 identity。下一次 Conversation 即使再次出现相同 `choiceId`，也不是上一轮 Choice 的延续，并且必须使用 fresh RenderNode key。

业务 `lr-dialogue-choice` 可以通过 `receiveRenderData(choice.data)` 消费 caller-defined Choice schema，例如 icon、样式提示或业务 presentation metadata；RPG Dialogue 不解释这些字段。

v0 不发布 retained `selected` attr/data。当前 selection 属于 Conversation WC local state：

```text
selectedChoiceId = null | choiceId
```

新 Conversation 初始必须为 `null`；不默认选择第一项。

API preflight 保证：只要当前 Conversation 的 `choices` 非空，就至少存在一个 enabled choice。因此 choice navigation 不需要处理“有 choices 但没有任何合法 selection target”的状态。

## 8. Conversation local coordination

`conversation` 是当前 Conversation 唯一 interaction owner。Descendant `text` / choice nodes 只提供 retained presentation facts。

Conversation WC 可以使用 Window-local 机制协调 descendants，例如 light-DOM traversal、private controller、local DOM event 或 shared local object，但这些机制不得通过 LoomRealm custom event 来同步 reveal、selection 或 pixel scroll。

Presentation-local state 至少包括：

```text
reveal/typewriter progress
selectedChoiceId
conversation scroll position
local focus / animation state
```

它们不是 Renderer Store、Subsystem 或 Shared State authority。

## 9. Conversation inbound events

所有以下 Render Event 的 target 都是稳定 structural key：

```text
targetKey = "conversation"
```

### `scroll-up` / `scroll-down`

表示方向性阅读导航，不是 DOM `scrollTop` command。WC 决定 smooth/paged/line-based scrolling、滚动距离与 selection 可见性策略。

### `choice-previous` / `choice-next`

只要求改变当前 enabled choice selection。

若当前无 selection：

```text
choice-next     → first enabled choice
choice-previous → last enabled choice
```

selection 改变不向 Subsystem 发业务事件。

是否 wrap-around 不属于跨实现 ABI；实现可以选择，但不能改变 choice identity、enabled legality 或最终 submit shape。

### `commit`

`commit` 的行为由当前 Presentation-local reveal/selection state 决定：

```text
text reveal incomplete
→ reveal immediately
→ no submit

text complete + no choices
→ submit current conversation

text complete + choices + no selection
→ no submit

text complete + selected enabled choice
→ submit current conversation + choiceId
```

Subsystem 不维护 typewriter progress，因此不能提前替 WC 决定一次 confirm 是 reveal 还是 submit。

## 10. Conversation outbound event: `submit`

只有 `conversation` node 可以向 Subsystem 发业务 custom event：

```text
name = "submit"
```

Payload 必须携带当前内部 `conversationId` 作为 correlation token：

```ts
// no choices
{ conversationId: string }

// selected choice
{ conversationId: string, choiceId: string }
```

Child choice node 不直接向 Subsystem 发 submit。

`RPGDialogue` 收到 submit 后必须重新验证：

```text
active Conversation still exists
current interaction mode === CONVERSATION
payload.conversationId === current internal conversationId
current Conversation has zero choices
→ choiceId MUST be absent
current Conversation has one or more choices
→ choiceId MUST be present
→ choiceId MUST identify a current choice in this Conversation
→ identified choice MUST be enabled
current Session / generation / Render target is still current
```

如果当前 mode 是 `HISTORY`，即使 `conversationId` 仍等于当前 active operation，Conversation submit 也必须被拒绝 / drop，且不得 settle `openConversation()`。

验证成功只 settle 当前 `openConversation()`；不会自动写 History、关闭 `RPGDialogue` 或决定下一 Conversation。

## 11. History

History entries 来自 `RPGDialogue` session-level History state，而不是当前 `ConversationRequestV0`。

```text
caller
→ transcript content semantics / mutation decision

RPGDialogue
→ current session History state / validation / projection

Shared State (optional)
→ durable persistence

WebComponent
→ local scroll / focus / virtualization / animation
```

History structural node：

```ts
{
  key: "history",
  tag: "lr-dialogue-history",
  attrs: {
    visible: historyVisible ? "true" : "false",
  },
  data: {},
  children: [...],
}
```

History entry 的 `entryId` 是当前 History session state 内的 business identity；对应 RenderNode 使用 private live key：

```ts
{
  key: historyEntryNodeKey,
  tag: "lr-dialogue-history-entry",
  attrs: {
    "entry-id": entry.entryId,
    ...(entry.speakerName === undefined
      ? {}
      : { "speaker-name": entry.speakerName }),
    text: entry.text,
  },
  data: {},
  children: [],
}
```

`historyEntryNodeKey` 是 private presentation lifetime identity；History 的 `speaker-name` 与 Conversation 一样只是文本事实，不引用 Character。

RPG Dialogue 不自动生成 transcript entry。

### 11.1 Visibility and history events

History open/close 使用 retained attr：

```text
history.attrs.visible = "true" | "false"
```

不存在 `open-history` / `close-history` transient event。

History transient event 的 target 统一是稳定 structural key：

```text
targetKey = "history"
```

Event names：

```text
scroll-up
scroll-down
scroll-to-latest
```

打开 History 并定位最新记录时顺序必须是：

```text
retained update: visible=true
→ Web Presentation reconcile
→ render.event: scroll-to-latest
```

依赖 Web Presentation API v1 的 retained-before-event ordering。

History 的 pixel scroll、focus、virtualization 与 animation 都是 WC-local state。

## 12. Input mode and default input policy

`RPGDialogue` active interaction 区分：

```text
CONVERSATION
HISTORY
```

History visible 时，方向输入路由到 `history`；Conversation commit/choice navigation 不应继续作用于被遮挡的 Conversation。

Cancel precedence：

```text
HISTORY + cancel
→ close History
→ return to CONVERSATION

CONVERSATION + cancel + cancelable=true
→ settle current operation as { type: "cancelled" }

CONVERSATION + cancel + cancelable=false
→ no business settlement
```

Canonical semantic actions 是：

```text
confirm
previous
next
history
cancel
```

初始默认实现的 keyboard/gamepad mapping 固定为：

```text
Enter / Space / gamepad south
→ confirm

ArrowUp / gamepad dpadUp
→ previous

ArrowDown / gamepad dpadDown
→ next

Tab / gamepad select
→ history

Escape / gamepad east
→ cancel
```

Semantic routing 由当前 interaction mode 决定：

```text
CONVERSATION + confirm
→ conversation.commit

CONVERSATION + previous / next
→ conversation.choice-previous / choice-next

HISTORY + previous / next
→ history.scroll-up / scroll-down

history
→ CONVERSATION opens History / HISTORY closes History

cancel
→ apply Cancel precedence above
```

默认实现只对对应 `keyboard.event` / `gamepad.event` 的按下语义触发 action；具体 key-repeat/debounce 节奏属于 private implementation policy，不是 v0 cross-implementation ABI。

这套默认 physical mapping 是 shipped default implementation policy，不是第三方 Presentation ABI。未来若产品需要可配置键位，可以在不改变本文件 canonical Render/Event ABI 的前提下替换 input mapping policy。

v0 不支持通过 pointer/touch 产生 Dialogue business/session interaction。Canonical v0 interaction 由 Dialogue Input Handler 驱动；第三方 WebComponent MAY 使用 pointer/touch 做 hover、动画或其他纯 presentation-local 行为，但 MUST NOT 因 pointer/touch 直接产生 Conversation submit、History visibility mutation、user cancel 或其他 Dialogue state mutation。

如果未来产品需要 pointer/touch 驱动上述 semantic action，应通过后续明确的 Dialogue ABI 扩展，而不是由第三方 WC 私自形成第二条 authority path。

## 13. Controls

`lr-dialogue-controls` 提供 presentation-only control hints，不是 Story facts。Control hint 的 canonical action vocabulary 与 §12 semantic actions 完全相同：

```text
confirm
previous
next
history
cancel
```

第一次 materialize controls 后，children 固定为上述五个 action，顺序也固定为上述顺序。每个 action 对应一个持续 live 的 `lr-dialogue-control-hint`；其 private Render key 在当前 Dialogue RenderDomain lifetime 内保持不变。`action` 是 semantic fact，不是公开 Render identity。

`lr-dialogue-control-hint` attrs：

```text
action
label
enabled
```

v0 public API 不让 caller 直接注入 control hints；RPG Dialogue 根据当前 lifecycle / interaction mode / session policy 更新 attrs。

默认 label 规则冻结为：

```text
label = action
```

例如 `action="confirm"` 时 `label="confirm"`。`label` 只是 presentation string；业务 Presentation 可以直接显示，也可以把它解释为自己的 i18n key。RPG Dialogue 不拥有业务 localization authority。

`enabled` 规则冻结为：

```text
READY
confirm   = false
previous  = false
next      = false
history   = false
cancel    = false

ACTIVE / CONVERSATION
confirm   = true
previous  = conversation.choices.length > 0
next      = conversation.choices.length > 0
history   = true
cancel    = session.cancelable

ACTIVE / HISTORY
confirm   = false
previous  = history.length > 0
next      = history.length > 0
history   = true
cancel    = true
```

HISTORY mode 的 `cancel=true` 表示“关闭 History 并回到 CONVERSATION”，不表示当前 Conversation 本身可取消，因此与 session `cancelable=false` 不冲突。

CLOSED 后 RenderDomain 已关闭，不再存在 control hint projection。

## 14. WebComponent lifecycle requirements

Web Presentation API v1 的 retained materialization order 是：

```text
construct
→ receiveRenderContext, if implemented
→ first insertion / connectedCallback may occur
→ children / attrs
→ receiveRenderData, if implemented
```

因此第三方 Dialogue WebComponent：

- 不得在 `connectedCallback()` 假设 initial attrs 已完整；
- 应通过 attribute observation 或等价机制响应 managed attrs；
- conversation / character / choice element 在对应 `receiveRenderData(...)` 前可以依赖当次 retained attrs 已被应用；
- `receiveRenderEvent()` 只处理 transient presentation impulse，不把 event 当 retained state 或 replay source；
- 不得把 dynamic node 的 private Render key 当作业务 identity 或持久化标识。

## 15. Attr/data limits

Dialogue-owned semantic strings进入 `RenderNode.attrs`，必须满足 Render Update v1 的 attr validation/UTF-8 limits。RPG Dialogue 应在 Subsystem boundary 提前拒绝会产生非法 RenderNode 的输入。

Caller-owned Conversation / Character / Choice `data` 必须满足对应 RenderNode `data` 的 JSON transport limits。

这些限制属于 transport compatibility，不授权 Dialogue 解释 caller schema。

## 16. Default and third-party presentation

Platform-neutral root module 固定为：

```text
@loomrealm-game/rpg-dialogue
```

默认 Browser Presentation artifact 入口固定为：

```text
@loomrealm-game/rpg-dialogue/browser/rpg-dialogue.browser.js
@loomrealm-game/rpg-dialogue/browser/rpg-dialogue.browser.css
```

默认 Browser JS 注册 canonical tags：

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

这些 tag 名和 artifact entry 是 v0 Browser packaging / Presentation compatibility surface；具体 DOM 结构、Shadow DOM、CSS layout、动画、字体、颜色和视觉 theme 不是 compatibility surface。

产品也可以完全不加载默认 assets，而提供第三方 WebComponents。第三方实现可以自由使用 DOM、Shadow DOM、Canvas、WebGL、Live2D、Spine 等，只要消费相同 structural/semantic/event ABI。

## 17. Non-goals

v0 Presentation ABI 不定义：

```text
Story Graph / Dialogue Document
Conversation speaker ↔ Character reference relation
DOM command protocol
pixel scroll commands
CSS class/style mutation commands
provider-specific conversation/choice/character presentation data schema
canonical placement / expression vocabulary
public dynamic RenderNode key format
business identity encoded in RenderNode.key
selected choice retained state
typewriter progress retained state
durable History persistence
pointer/touch business or session interaction
rich text/localization/voice/auto-advance protocol
configurable input-binding public API
```

这些不是隐藏的待实现 contract；它们明确不属于 v0 cross-implementation ABI。

## 18. Compatibility rule

Canonical Render Tree/tag names、caller-configurable Dialogue RenderDomain effective `zIndex` semantics、Dialogue-owned attrs/control-hint semantics、caller-owned `data` projection、business/Render identity rules、Render Event 与 Custom Event names/payloads、interaction mode semantics、History projection，以及 §16 Browser artifact entry 是 RPG Dialogue v0 compatibility surface。

以下明确不是 cross-implementation compatibility surface：

```text
default physical key mapping
key repeat/debounce policy
choice wrap-around policy
pixel scroll behavior
typewriter speed/effect
DOM/Shadow DOM/CSS/layout/theme
caller-defined data schema interpretation
```

不兼容修改必须显式修改 contract；implementation private refactor 不得重新解释 compatibility surface。

实现状态与 qualification evidence 由当前 source/tests 和仓库 qualification records 给出；本文不承载实现计划或进度状态。