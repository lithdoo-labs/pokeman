# RPG Dialogue v0 API

> 层级：`@loomrealm-game/rpg-dialogue` public module contract  
> 状态：Active / Normative / Frozen  
> 稳定程度：Frozen

本文定义 `RPGDialogue` 的 public TypeScript surface、生命周期、Conversation request/result、人物输入、History session state 与 caller authority。

RPG Dialogue 不拥有 Story Flow。`next`、branch、condition、Quest/Inventory mutation、Battle launch、Map transfer 与其他 gameplay side effect 都由调用方普通 TypeScript 代码决定。

## 1. Public type surface

```ts
import type { JsonObject } from "@loomrealm/wire";
import type { Frame, SubsystemScope } from "@loomrealm/subsystem";

export interface RPGDialogueOptionsV0 {
  readonly cancelable?: boolean;
  readonly zIndex?: number;
}

export interface ConversationChoiceV0 {
  readonly choiceId: string;
  readonly text: string;
  readonly enabled?: boolean;
  readonly data: JsonObject;
}

export interface ConversationContentV0 {
  readonly speakerName?: string;
  readonly text: string;
  readonly choices: readonly ConversationChoiceV0[];
  readonly data: JsonObject;
}

export interface DialogueCharacterV0 {
  readonly characterId: string;
  readonly displayName?: string;
  readonly active: boolean;
  readonly data: JsonObject;
}

export interface DialogueHistoryEntryV0 {
  readonly entryId: string;
  readonly speakerName?: string;
  readonly text: string;
}

export interface ConversationRequestV0 {
  readonly conversation: ConversationContentV0;
  readonly characters: readonly DialogueCharacterV0[];
}

export type ConversationResultV0 =
  | {
      readonly type: "submitted";
      readonly choiceId?: string;
    }
  | {
      readonly type: "cancelled";
    };

export class RPGDialogue {
  constructor(
    scope: SubsystemScope,
    frame: Frame,
    options?: RPGDialogueOptionsV0,
  );

  openConversation(
    request: ConversationRequestV0,
  ): Promise<ConversationResultV0>;

  setHistory(entries: readonly DialogueHistoryEntryV0[]): void;
  appendHistory(entry: DialogueHistoryEntryV0): void;
  getHistorySnapshot(): readonly DialogueHistoryEntryV0[];
  close(): void;
}
```

`cancelable` 与 `zIndex` 都是整个 `RPGDialogue` interaction session 的 policy，不是单个 Conversation 的 story fact。

默认值冻结为：

```text
cancelable === undefined
→ false

zIndex === undefined
→ 2_147_483_646
```

只有显式 `cancelable: true` 才允许 user cancel settlement。

`zIndex` 控制该实例唯一 Dialogue RenderDomain 的 stacking value。调用方可以根据自己的业务 Presentation composition 选择任意 Render Update v1 合法 int32；该值只在构造时确定，实例 lifetime 内保持不变。v0 不提供运行中 setter，也不允许单个 Conversation 覆盖 session `zIndex`。

## 2. Lifetime

`RPGDialogue` 绑定 caller 提供的 `Frame` lifetime，并在同一实例中顺序承载多个 Conversation：

```text
Frame
└─ RPGDialogue
   ├─ History session state
   ├─ one persistent Dialogue RenderDomain
   ├─ openConversation(A) → Result A
   ├─ openConversation(B) → Result B
   └─ close()
```

Dialogue RenderDomain 可以延迟到第一次需要 Presentation 时创建；一旦创建，它属于整个 `RPGDialogue` session lifetime，而不是某一次 `openConversation()` lifetime。Conversation settle 不关闭这个 RenderDomain；下一次 Conversation 在同一 RenderDomain 中更新 retained projection。只有 `RPGDialogue.close()`、Frame abort 或其他 session-terminal cleanup 才关闭它。

Public lifecycle：

```text
READY
  │ openConversation(request)
  ▼
ACTIVE
  │ submit / user cancel
  ▼
READY
  │
  └─ close() / Frame abort
      ▼
CLOSED
```

History UI 是 ACTIVE 内部的 interaction mode，不创建第二个 public operation。

同一实例同时最多一个 active Conversation。第二个并发 `openConversation()` 必须在创建第二套 interaction resources 前失败；v0 不定义 queue、replace、stack 或 nested Conversation。

Conversation settle 只结束当前 `openConversation()`：

```text
Conversation settles
→ Promise resolves
→ RPGDialogue remains READY
→ Dialogue RenderDomain remains alive
→ last successful retained Dialogue projection remains available but inactive
→ History remains alive
→ caller may execute arbitrary business logic
→ caller may mutate History
→ caller may open another Conversation
```

READY 状态没有 active Conversation，因此不得接受 Conversation submit。Conversation completion 不自动关闭 `RPGDialogue`，也不自动写 History。

## 3. `openConversation()` request

每次 request 都完整声明当前 Conversation 的 retained input：

```text
conversation
→ 当前可提交的 Conversation unit

characters
→ 当前完整人物 presentation snapshot
```

Conversation 与 Character 是并列且解耦的 presentation/business input。Conversation 不引用 Character，Character 也不承担“当前 speaker” authority。`speakerName` 只是 Conversation 自己的可选显示文本；即使 `characters` 为空也完全合法。反过来，存在 Character 也不意味着它必须对应 `speakerName`。

调用方不得依赖上一轮 request 隐式保留 conversation/characters business facts。同一 `RPGDialogue` 必须继续使用其 session RenderDomain；新的 request 更新该 Domain 中的 retained Dialogue projection，并通过新的内部 `conversationId` 标记新的 Conversation operation。

业务 identity 与 RenderNode lifetime identity 是不同概念。三类 public business identity 的 scope 明确为：

```text
characterId
→ 当前 RPGDialogue session 内的 Character business identity

choiceId
→ 仅当前 Conversation 内的 Choice business identity

entryId
→ 当前 RPGDialogue History session state 内的 History entry business identity
```

因此：

- 相邻 Conversation 都出现 `choiceId = "yes"` 时，它们仍是两个不同 Choice；新的 `conversationId` 开始时，上一轮所有 Choice semantic lifetime 都结束；
- 同一个 Character 如果在相邻完整 `characters` snapshot 中连续存在，可以继续表示同一 Character business presence；若它离开后再次出现，business `characterId` 可以相同，但新的 presentation node lifetime 必须遵守 Render Update one-shot key 规则；
- `entryId` 在当前 History state 中唯一；被 `setHistory()` 移除后未来重新出现相同 `entryId`，仍须使用新的 presentation node lifetime。

动态 RenderNode 的 `key` 始终是 RPG Dialogue 私有的 presentation-lifetime identity，具体映射见 [RPG Dialogue v0 Presentation](./RPG_DIALOGUE_V0_PRESENTATION.md)。

### 3.1 Caller input immutability

v0 不要求实现对 `openConversation()`、`setHistory()` 或 `appendHistory()` 的 caller-provided object graph 做 defensive deep copy。

Caller MUST 将已经交给 `RPGDialogue`、且仍可能影响当前 Dialogue state / projection 的输入对象视为 immutable：

```text
ConversationRequestV0
ConversationContentV0 / ConversationContentV0.data
ConversationChoiceV0[] / ConversationChoiceV0.data
DialogueCharacterV0[] / DialogueCharacterV0.data
DialogueHistoryEntryV0[] / DialogueHistoryEntryV0
```

Caller 在这些值仍被 `RPGDialogue` 使用期间私自修改它们属于 API misuse；v0 对这种 mutation 之后的行为不作保证。

这里“caller `data` 原样进入 `RenderNode.data`”只保证业务 JSON semantic value 不被 RPG Dialogue 解释或改写，不保证保留 caller JavaScript object identity。

`getHistorySnapshot()` 仍按 §5.3 明确返回 detached snapshot；它不属于上述 borrowed-input 规则。

### 3.2 Conversation content and choices

`ConversationContentV0` 定义当前 Conversation 自己的 retained facts：

```text
speakerName?
text
choices
data
```

`speakerName` 是普通显示文本，不是 Character identity，也不要求与任何 `DialogueCharacterV0.displayName` 或 `characterId` 对应。

`choices` 是有序数组；`choiceId` 只在当前 Conversation 内作为稳定 business identity，数组 index 不是业务 identity。`enabled` 省略时等价于 `true`。

Choice cardinality 必须在创建任何新的 Conversation interaction side effect 前完成 preflight：

```text
choices.length === 0
→ legal text-only Conversation

choices.length > 0
→ MUST contain at least one enabled choice
```

因此 v0 不允许“存在 choices 但全部 disabled”的 Conversation。违反该规则的 `openConversation()` 必须在发布新的 Render state、注册新的 active input interaction 或改变当前 operation state 前失败。

`ConversationContentV0.data` 与每个 `ConversationChoiceV0.data` 的字段结构完全由 caller 与业务 WebComponent 定义。RPG Dialogue 只要求它们满足 LoomRealm `JsonObject` transport shape，并分别原样投影到 conversation / choice RenderNode 的 `data`。

对 caller-defined `data`，RPG Dialogue 统一遵守：

```text
MUST NOT wrap
MUST NOT interpret
MUST NOT rename keys
MUST NOT inject Dialogue fields
MUST NOT apply defaults inside data
MUST NOT derive gameplay behavior from data
```

业务可以用这些 `data` 表达 voice/resource key、窗口样式、choice icon、业务 metadata 或其他 WebComponent-specific schema，而无需扩展 RPG Dialogue API。

`RPGDialogue` 为每次成功开始的 `openConversation()` 分配新的内部 `conversationId`。它只用于当前 interaction correlation 与 Presentation-local reset，不由 caller 提供，也不出现在 `ConversationResultV0` 中。

`conversationId` 在同一个 `RPGDialogue` instance lifetime 内 MUST NOT 复用。具体字符串格式、分配算法与 counter/UUID 选择属于 private implementation；只要满足当前 Render attr limits 与 lifetime 内 non-reuse 即可。

新的 `conversationId` 至少重置：

```text
reveal/typewriter progress
current choice selection
conversation-local scroll
```

### 3.3 Characters

`characterId` 在当前 `characters` snapshot 内必须唯一，并作为当前 `RPGDialogue` session 内的 Character business identity。

Dialogue-owned character semantics 只保留跨 Presentation 实现普遍有意义的事实：

```text
characterId
displayName
active
```

这些字段映射到 character RenderNode 的 `attrs`。

具体立绘布局、表情、动画、模型状态等不是 RPG Dialogue canonical vocabulary；业务需要这些能力时放入 `DialogueCharacterV0.data`，由自己的 WebComponent 解释。例如：

```ts
{
  placement: "left",
  expression: "angry",
  live2dModel: "alice"
}
```

`DialogueCharacterV0.data` 的字段结构完全由 caller 与业务 WebComponent 定义，并遵守 §3.2 的统一 caller-defined `data` 规则。RPG Dialogue 将它原样放入对应 character RenderNode 的 `data`。

因此业务可以使用静态头像、sprite animation、Canvas、WebGL、Live2D、Spine 或其他 schema，而无需扩展 RPG Dialogue API。

Character Presentation 与 Conversation speaker 完全解耦。`active` 只描述 Character 自己的通用 presentation emphasis fact；RPG Dialogue 不从 `speakerName` 查找、创建、激活或改写 Character。

## 4. Conversation result

普通文本提交：

```ts
{ type: "submitted" }
```

带 choice 的提交：

```ts
{ type: "submitted", choiceId: "yes" }
```

用户主动取消且 session `cancelable` 时：

```ts
{ type: "cancelled" }
```

Result 只代表当前 Conversation 的 interaction result。收到 Result 后，caller 才决定 History、Shared State、Quest、Inventory、Battle、Map 或下一次 `openConversation()`。

Presentation → Subsystem 的 `submit` payload 会携带内部 `conversationId`；`RPGDialogue` 必须验证它仍等于当前 active operation，再验证当前 interaction mode 与 `choiceId` legality。该内部 correlation 不泄漏到 public Result。

## 5. History

History 是 `RPGDialogue` instance 内部持有的 session-level retained state，不属于 `ConversationRequestV0`。

Authority：

```text
caller
→ 决定 transcript 内容语义
→ 决定何时 append / replace
→ 决定 Conversation、choice、旁白、系统提示是否进入 History

RPGDialogue
→ 持有当前 session History
→ 验证并投影 History
→ 管理 History modal interaction state

Shared State（可选）
→ 当游戏需要 save/load、cross-map、cross-session persistence 时
   承担 durable history authority
```

History 的 `speakerName?` 与 Conversation 一样只是文本事实，不引用 Character Presentation。RPG Dialogue 不自动把 Conversation 或 choice 写入 History。

### 5.1 `setHistory()`

`setHistory(entries)` 是完整 replace，不是 patch API：调用后当前 session transcript 就是给定 entries。

典型用途包括从 Shared State 恢复、切换业务 conversation context、测试建立初始状态或业务完成过滤/重排后的完整替换。

若 session RenderDomain 已存在，成功的 READY-state History mutation 同步改变下一份 retained Dialogue projection；它不创建新的 RenderDomain。

### 5.2 `appendHistory()`

`appendHistory(entry)` 只追加 caller 已经决定应进入 History 的 entry。它不从当前 Conversation 自动补 speaker、choice、文本或其他业务语义。

如果 `entry.entryId` 已存在于当前 History state，`appendHistory()` 必须在 mutation / projection 前同步失败；v0 不定义 overwrite、merge 或 duplicate-entry semantics。

### 5.3 `getHistorySnapshot()`

返回当前 History 的 readonly detached snapshot；修改返回值不得改变 `RPGDialogue` 内部状态。

需要 durable 保存时：

```text
getHistorySnapshot()
→ caller commits selected history to Shared State
→ later create new RPGDialogue
→ setHistory(savedHistory)
```

### 5.4 Mutation timing

v0 的 History mutation 只允许在 `READY` 状态：

```text
READY
→ setHistory / appendHistory legal

ACTIVE
→ setHistory / appendHistory rejected before mutation
```

这样 History modal 正在交互时不会发生 transcript replacement/append 与 local scroll/focus 的并发语义。

`getHistorySnapshot()` 不修改状态，可在实例未 CLOSED 时调用。

## 6. Cancel / close / abort and failure delivery

User cancel、programmatic close 与 Frame abort 是不同语义：

```text
user cancel
→ resolve current operation with { type: "cancelled" }

programmatic close while ACTIVE
→ reject current openConversation()
→ cleanup Dialogue-owned resources
→ CLOSED

Frame abort
→ reject current openConversation() with AbortError semantics
→ cleanup Dialogue-owned resources
→ CLOSED
```

`openConversation()` 是异步 operation。它的 request validation、preflight、concurrency 与 lifecycle failure 都必须通过 returned Promise rejection 暴露；不得在调用 `openConversation()` 的同一同步栈中把这些 operation failure 作为同步 throw 暴露。

```text
invalid Conversation request
second concurrent openConversation()
openConversation() after CLOSED
presentation/input establishment failure
→ reject returned Promise

Frame abort
→ reject returned Promise with AbortError semantics
```

具体非-abort Error constructor / numeric code 不属于 v0 compatibility surface；caller 不应依赖其 message 文本。

同步 public API 保持同步 failure semantics：

```text
constructor invalid arguments
setHistory() invalid input / illegal state
appendHistory() invalid input / illegal state
getHistorySnapshot() after CLOSED
→ synchronous throw before observable mutation
```

`close()` 幂等；重复调用不得因实例已 CLOSED 而抛错。CLOSED 后不得再打开 Conversation 或修改 History。

所有 terminal path 都必须 settle-once，并 best-effort cleanup InputListener、session RenderDomain、abort listener 与内部 callbacks。

## 7. Validation

### 7.1 Closed public shapes

除 caller-owned `data` 内部字段外，RPG Dialogue v0 的 public value objects 都是 closed shape。未知 own enumerable member 必须拒绝；实现不得静默忽略、保留或 reinterpret 未声明字段。

Frozen shapes：

```text
RPGDialogueOptionsV0
required: none
optional: cancelable, zIndex

ConversationRequestV0
required: conversation, characters
optional: none

ConversationContentV0
required: text, choices, data
optional: speakerName

ConversationChoiceV0
required: choiceId, text, data
optional: enabled

DialogueCharacterV0
required: characterId, active, data
optional: displayName

DialogueHistoryEntryV0
required: entryId, text
optional: speakerName
```

Optional member omitted or explicitly `undefined` is equivalent to absent。若 optional member 提供非-`undefined` 值，则必须满足其声明类型。Required member 缺失或为 `undefined` 必须拒绝；尤其 `data` 不自动 default 为 `{}`。

`choices`、`characters` 以及 `setHistory()` 的 `entries` 必须是数组；RPG Dialogue 不接受 array-like/object coercion。`active` 必须是 boolean；`enabled` 提供时必须是 boolean；`cancelable` 提供时必须是 boolean。`zIndex` 提供时必须是 `-2_147_483_648..2_147_483_647` 范围内的 integer。v0 不做 string/number/boolean coercion，也不 clamp/round `zIndex`。

### 7.2 String and identity rules

所有 Dialogue-owned public string 都必须是 valid Unicode scalar sequence；v0 不做 trim、case folding、Unicode normalization 或其他隐式文本 normalization。

Business identity strings：

```text
choiceId
characterId
entryId
```

统一要求：

```text
1..128 UTF-8 bytes
case-sensitive exact identity
no normalization
```

因此空 identity 非法。

直接投影到 `RenderNode.attrs` 的 display strings：

```text
ConversationContentV0.speakerName
ConversationContentV0.text
ConversationChoiceV0.text
DialogueCharacterV0.displayName
DialogueHistoryEntryV0.speakerName
DialogueHistoryEntryV0.text
```

允许空字符串；提供时必须满足 Render Update v1 attr value 的 `0..4096` UTF-8-byte limit。RPG Dialogue 必须在自身 boundary 提前拒绝超限值，而不是依赖 Renderer protocol failure。

### 7.3 Collection and data rules

业务 identity uniqueness：

```text
characterId unique within current characters snapshot
choiceId unique within current Conversation
entryId unique within current History state
```

`setHistory()` 输入自身必须满足 `entryId` uniqueness；`appendHistory()` 不得引入与当前 History 重复的 `entryId`。

Choice cardinality：

```text
choices.length === 0
→ legal text-only Conversation

choices.length > 0
→ MUST contain at least one enabled choice
```

Caller-owned `ConversationContentV0.data`、`ConversationChoiceV0.data`、`DialogueCharacterV0.data` 都是 required plain `JsonObject` transport value，并必须满足 Render Update v1 对 RenderNode `data` 的 JSON validity、depth/member/byte limits。RPG Dialogue 不检查业务 schema 意义，但必须检查其 transport legality。

完整 retained projection 还必须满足 Render Update v1 的 node count、key/tag/attrs、tree depth 与 message/payload limits；超限 request / History replacement 必须在发布对应新的 Render state 前失败。

### 7.4 Atomic preflight

所有 request / History structural validation 必须在对应 observable mutation 前完成：

```text
invalid openConversation(request)
→ returned Promise rejects
→ no new active operation
→ no new retained Conversation publication
→ no new Dialogue input interaction

invalid setHistory / appendHistory
→ synchronous throw
→ History unchanged
→ retained History projection unchanged
```

实现可以私有拆分 validator，但不得通过“先部分接受再回滚”改变上述 observable behavior。

## 8. Authority and non-goals

RPG Dialogue v0 不定义：

```text
Dialogue Program / Story Graph
next / goto / branch / condition evaluator
variable store
quest/inventory mutation nodes
battle/map transition nodes
automatic transcript policy
durable story transcript authority
Conversation speaker ↔ Character reference relation
provider-specific conversation/choice/character presentation schema
canonical placement / expression vocabulary
```

这些不是待实现的隐含功能；它们明确不属于 v0 API。

Presentation Tree、WebComponent interaction 与 event vocabulary 见 [RPG Dialogue v0 Presentation](./RPG_DIALOGUE_V0_PRESENTATION.md)。

## 9. Compatibility rule

本文的 public request/result/model、`cancelable`/`zIndex` 默认值与 session policy、closed-shape/validation rules、business identity scope、lifecycle、History mutation timing、settlement/failure delivery 与 validation semantics 是 RPG Dialogue v0 compatibility surface。

不兼容修改必须显式修改 contract；implementation private refactor 不得重新解释这些 observable semantics。

实现状态与 qualification evidence 由当前 source/tests 和仓库 qualification records 给出；本文不承载实现计划或进度状态。