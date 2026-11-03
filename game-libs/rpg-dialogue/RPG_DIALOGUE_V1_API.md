# RPG Dialogue v1 API

> 层级：`@loomrealm-game/rpg-dialogue` public module contract
> 状态：**Implemented / Qualified / Frozen**
> 兼容基线：[RPG Dialogue v0 API](./RPG_DIALOGUE_V0_API.md)
> Control-port architecture：[Game Control Ports](../../doc/10-architecture/game-control-ports.md)
> Qualification evidence：[RPG Dialogue v1](../../doc/30-implementation/rpg-dialogue-v1-qualification.md)

v1 保留 v0 的 Conversation、History、constructor、result、validation、Render/Presentation semantics，并 additive 增加 semantic Control Port。v1 不把 physical Keyboard/Gamepad/unified-controls vocabulary 放进 Dialogue Runtime。

## Public additive surface

v0 public surface保持兼容，并增加：

```ts
export interface RPGDialogueControls {
  confirm(): void;
  previous(): void;
  next(): void;
  history(): void;
  cancel(): void;
}

export class RPGDialogue {
  readonly controls: RPGDialogueControls;

  // all v0 public members remain
}
```

`dialogue.controls` 在实例 lifetime 内 identity 稳定。

## Control semantics

Control methods 是 transient semantic command：

```text
confirm
previous
next
history
cancel
```

它们直接进入 Dialogue 既有 semantic routing，不携带 physical device identity。

Lifecycle：

```text
READY
→ command no-op

ACTIVE
→ route according to current interaction mode

CLOSED
→ command no-op
```

Commands：

- synchronous invocation；
- no queue；
- no replay；
- no retained command state；
- user timing race 不抛 lifecycle error。

Conversation completion仍由 `openConversation(...)` Promise 表达。

## Existing semantic routing preserved

```text
CONVERSATION + confirm
→ conversation.commit

CONVERSATION + previous / next
→ conversation.choice-previous / choice-next

HISTORY + previous / next
→ history.scroll-up / scroll-down

history
→ toggle CONVERSATION / HISTORY

HISTORY + cancel
→ return to CONVERSATION

CONVERSATION + cancel + cancelable=true
→ { type: "cancelled" }

CONVERSATION + cancel + cancelable=false
→ no settlement
```

v0 Conversation/History/RenderDomain/failure semantics otherwise保持。

## Input ownership change

v1 Runtime MUST NOT subscribe to：

```text
keyboard.event
keyboard.state
gamepad.event
gamepad.state
controls.event
controls.state
```

v1 Runtime MUST NOT know：

```text
Keyboard code
Gamepad button
ControlsButtonV1
product key binding
```

Physical/unified-controls mapping belongs to product composition outside the module。

The v0 shipped default physical mapping was implementation policy, not v0 cross-implementation Presentation compatibility surface. Removing that mapping from current v1 Runtime therefore does not rewrite v0 historical contract/evidence.

## Version / qualification rule

Historical：

```text
RPG_DIALOGUE_V0_API.md
RPG_DIALOGUE_V0_PRESENTATION.md
doc/30-implementation/rpg-dialogue-v0-qualification.md
```

remain unchanged and continue to describe/prove the old exact subject.

Current v1 landing：

```text
test/rpg-dialogue-v1/qualification.test.mjs
→ semantic controls -> Render/Web Presentation -> submit -> result

test/game-control-ports-v1/qualification.test.mjs
→ unified controls product composition -> dialogue.controls -> observable effect
```

Current root Dialogue qualification scripts target v1. The current-tree v0 raw-input closed-loop executable test is retired; Git history and the v0 evidence record retain the old proof.

The current v1 implementation and executable evidence match this exact Frozen surface.
