# RPGMap Control Port v1

> 层级：`@pokeman/game-map` gameplay contract
> 状态：**Implemented / Qualified / Frozen**
> 上游架构：[Game Control Ports](../../10-architecture/game-control-ports.md)
> Qualification evidence：[Game Control Ports v1](../../30-implementation/game-control-ports-v1-qualification.md)

本文件只拥有 Map-specific control semantics。它不定义 Keyboard/Gamepad/unified-controls protocol，也不定义 product input composition。

## Public additive surface

```ts
export interface RPGMapControls {
  setMoveIntent(direction: Direction | null): void;
}

export interface RPGMapHandler {
  readonly controls: RPGMapControls;

  // existing public members remain
}
```

`handler.controls` 在 Handler lifetime 内 identity 稳定。

合法 intent：

```text
2    down
4    left
6    right
8    up
null neutral
```

非法 runtime value 同步抛 `TypeError`。

## Retained intent

`moveIntent` 是当前意图，不是一步 command：

```text
setMoveIntent(same value)
→ idempotent
→ 不是新的 movement command

setMoveIntent(new value)
→ replace current retained intent
→ no command queue
```

pre-run 写入只保留最新 intent；首个 scene ready 后可以开始消费。

successful movement step 完成后，如果 intent 仍是 direction，可以继续下一步；movement 中改方向只影响后续 attempt。

## Blocked semantics — v1

本次 v1 明确冻结：

```text
attempt(direction)
→ blocked
→ Map may update facing / blocked presentation
→ retain moveIntent
→ stop
→ no automatic retry
→ no retry timer
→ no retry from controls State refresh
→ no retry from same-value setMoveIntent
```

只有 `moveIntent` 真正发生变化后，idle Map 才把它作为新的 movement intent 再次尝试。

因此：

```text
up → blocked
→ still up
→ no retry

up → null → up
→ new intent transition
→ may attempt

up → left
→ new direction
→ may attempt
```

本次 `setNPC`、passability/terrain/bridge 变化不隐式唤醒一个已经 blocked 的 retained intent。未来如果需要“障碍消失后自动继续”，必须作为新的 Map gameplay contract 显式设计 wake-up semantics。

## Authority

以下仍完全由 Map Runtime 拥有：

```text
authoritative x/y
facing
passability
terrain
bridge
NPC collision
transfer
motion timing
blocked/walk/jump outcome
```

Control Port caller 不读取 `getSnapshot()` 计算普通 movement，也不提交目标坐标。

## Lifecycle

```text
Handler constructed
→ moveIntent = null

before run()
→ latest intent may be retained
→ no movement starts

running
→ Runtime consumes current intent

terminal cleanup
→ internal moveIntent = null
→ later controls calls have no gameplay side effect
```

Scene transfer 不自动把 Handler-level intent 改成 null；Frame/Activation relinquish 时是否 neutralize 由外层 composition 按 Game Control Ports contract 执行。

## Qualification

至少覆盖：

- stable `controls` identity；
- initial neutral；
- pre-run retained intent；
- successful held continuation；
- direction change during movement；
- neutral stops future continuation；
- same-value setter idempotent；
- blocked retains intent but performs no automatic retry；
- no timer / controls-refresh retry；
- changed intent can attempt again；
- invalid value `TypeError`；
- terminal inert controls；
- no raw/unified controls dependency in Map core；
- ordinary movement does not depend on `getSnapshot()`。
