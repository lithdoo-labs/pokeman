# PokeMan Dialogue Gameplay Vertical Slice

> 状态：**Design / Ready for implementation**
> 范围：PokeMan 产品层最小 Dialogue gameplay vertical slice
> 依赖：
> - [64-dialogue.md](./64-dialogue.md)
> - [69-dialogue-web-component.md](./69-dialogue-web-component.md)
> - [72-controls-composition.md](./72-controls-composition.md)
> - [Game Control Ports](../../../doc/10-architecture/game-control-ports.md)
> - [Frame / Call Protocol v1](../../../doc/15-contracts/frame-call-protocol-v1.md)
> - [RPG Dialogue v1 API](../../../game-libs/rpg-dialogue/RPG_DIALOGUE_V1_API.md)

本文定义下一步 PokeMan 产品验证：使用已经落地的 Map NPC Interaction API、LoomRealm canonical `frame.call(...)`、RPG Dialogue v1 semantic controls 和 PokeMan Dialogue Web Presentation，在真实 PokeMan 中跑通一次标准业务子系统调用。

本阶段明确采用独立 `dialogue` Subsystem，由 Map 通过 `frame.call("dialogue", ...)` 打开 child Frame；不再采用 same-Frame 临时创建 `RPGDialogue` 的方案。

这仍然不是正式 Dialogue graph runner 的最终设计。当前只验证：**Map NPC interaction 能否按正常 Frame / Subsystem 业务边界调用 Dialogue child Frame，并在 child 内完整运行 RPGDialogue + Web Presentation，最后安全返回 Map fresh Activation。**

---

# 1. Target vertical

第一版固定验证：

```text
玩家在 Map 中移动
→ 面向 Professor
→ confirm
→ RPGMap emits NPCInteractEvent
→ Map closes current Activation controls
→ frame.call("dialogue", exact business input)
→ Map Frame A1 suspended
→ Dialogue child Frame becomes Top Active Frame
→ Dialogue Subsystem creates RPGDialogue
→ Dialogue Subsystem owns its own ControlsConsumer
→ resolve Professor sprite + contentVersion
→ Conversation / reveal / choice / history / cancel
→ Dialogue child returns FrameOutcome
→ Dialogue child closes
→ Map Frame resumes with fresh Activation A2
→ Map creates fresh ControlsConsumer + DirectionalControlsTracker
→ Map continues without remount/reload
```

成功后才进入正式：

```text
struct.Dialogue
→ graph runner
→ Choice.target
→ EventStateMutation
→ Story / Relationship / Battle / Quest
```

# 2. Exact scope

本阶段预计修改：

```text
examples/PokeMan/subsystems/map.mjs
examples/PokeMan/subsystems/dialogue.mjs
examples/PokeMan/game.json
examples/PokeMan/launch.hostra.json
examples/PokeMan/launch.pwa.json
examples/PokeMan/package.json
package-lock.json
examples/PokeMan/scripts/prepare-pwa-content.mjs
apps/pwa/scripts/build.mjs
apps/pwa/package.json
apps/pwa/test/pokeman-bundle.test.mjs
apps/pwa/test/pokeman-bundle-id.test.mjs
apps/pwa/test/pokeman-map.e2e.test.mjs
apps/pwa/test/pokeman-staging.e2e.test.mjs
apps/pwa/test/staging-build.test.mjs
PokeMan focused tests / qualification
```

本阶段不修改：

```text
examples/PokeMan/subsystems/base.mjs
@loomrealm-game/map Runtime
@loomrealm-game/rpg-dialogue Runtime
@loomrealm-game/common-controls Runtime
PokeMan Dialogue Web Components
LoomRealm Frame / Call protocol
Frozen Presentation ABI
```

# 3. Composition choice：independent child-Frame Dialogue Subsystem

Production subsystem topology 完成后固定为：

```text
base
├─ map
└─ dialogue
```

一次对话的 Frame stack：

```text
base Frame
  suspended by base → map call
      │
      ▼
map Frame A1
  active
      │
      │ frame.call("dialogue", ...)
      ▼
map Frame suspended
dialogue child Frame active
      │
      │ return
      ▼
dialogue child closed
map Frame A2 active (fresh Activation)
```

职责：

```text
Map
→ 地图 / NPC interaction owner

Dialogue
→ 对话 session / conversation flow owner

Frame.call
→ 业务模块之间的调用边界

Main
→ Frame Stack / Activation / InputTarget authority
```

因此：

- Map 不 import `RPGDialogue`；
- Dialogue 不依赖 Map Runtime；
- Main 自动保证 child Frame 是唯一 Top Active Frame；
- 不使用 same-Frame `mapControlsActive/dialogueControlsActive` flag；
- Dialogue 返回后 Map 获得 fresh Activation；
- 后续正式 `struct.Dialogue` runner 可以自然落在 `dialogue.mjs`。

## 3.1 73 对 72 的 authority override

[72-controls-composition.md](./72-controls-composition.md) 描述的是已经实现并 qualified 的上一阶段 `base + map` Map-only topology。

本 vertical slice 落地后，本文 **只在以下两点 supersede 72**：

```text
production subsystem topology
→ base + map + dialogue

Map controls lifetime around child call
→ Activation-local A1 / A2 Consumers
```

72 继续作为以下事实的 authority：

```text
base owns exactly one <game-controls-input>
controls producer remains live across child Frames
Map direction mapping uses Common Controls
blocked movement semantics remain unchanged
raw Keyboard/Gamepad are not reintroduced
```

实现 Agent 不得因为 topology 增加 Dialogue 就把 controls producer 从 `base` 移走。

# 4. Test NPC：Professor only

当前 Map 4 已有：

```text
instanceId = "professor"
npcId      = "professor"
x          = 10
y          = 6
direction  = 2
```

本阶段只把该 placement 改为：

```js
{
  instanceId: "professor",
  npcId: "professor",
  x: 10,
  y: 6,
  direction: 2,
  interactable: true,
}
```

其他 NPC 保持现状，不因为本验证统一变成 interactable。

特别是：

```text
rival-lab
road-bandit
route-trainee
...
```

本阶段不接 Dialogue。

因此：

```text
Map confirm
+ facing Professor directly
+ Map not busy
→ NPCInteractEvent
```

其他 NPC 不产生本 slice 的 Dialogue。

---

# 5. Why Professor

Professor 是第一轮最合适的 fixture：

- 已有 `struct.NPC/professor`；
- 已有 `struct.Character/professor`；
- 已有真实 4×4 sprite；
- NPC key 与 Character key 在这个特例中相同；
- Map 4 已有真实 placement；
- 不需要先解决 rival 的多 appearance 选择问题。

注意：

> **Professor 中 `npcId === characterId` 只是这个 fixture 的已知事实，不允许从本 slice 推导“所有 NPC 的 npcId 都等于 Character key”。**

以后像：

```text
rival-lab
rival-casual
→ Character rival
```

仍然需要正式 Story / World appearance resolver。

---

# 6. Dependency landing

`dialogue.mjs` production import：

```js
import { RPGDialogue } from "@loomrealm-game/rpg-dialogue";
import { createControlsConsumer } from "@loomrealm-game/common-controls/subsystem";
```

因此 `@loomrealm-game/rpg-dialogue` 从 PokeMan `devDependencies` 移到 `dependencies`。

`@loomrealm-game/common-controls` 已经是 production dependency。

Map 不 import RPGDialogue。

# 7. Map → Dialogue exact business input

Map 不传 RPGDialogue request，也不传 Presentation data。

第一版 exact input：

```ts
type PokeManDialogueFrameInputV1 = {
  dialogueKey: "professor-vertical-slice";
  source: {
    mapId: number;
    npc: {
      instanceId: "professor";
      npcId: "professor";
    };
  };
};
```

调用：

```js
await frame.call("dialogue", {
  dialogueKey: "professor-vertical-slice",
  source: {
    mapId: event.mapId,
    npc: {
      instanceId: event.npc.instanceId,
      npcId: event.npc.npcId,
    },
  },
});
```

Map 不传 speaker、text、choices、sprite、contentVersion、RPGDialogue instance、controls object 或 Render data。

# 8. Dialogue Frame output

正常业务返回值 exact shape：

```ts
type PokeManDialogueFrameResultV1 = {
  dialogueKey: "professor-vertical-slice";
  conclusion: "ready" | "not-yet" | "cancelled";
};
```

closed shape：

```text
exactly { dialogueKey, conclusion }
no unknown fields

dialogueKey → exactly "professor-vertical-slice"
conclusion  → exactly "ready" | "not-yet" | "cancelled"
```

RPGDialogue 的 user cancel 是 child 内部普通业务结果，应转换成：

```text
completed({
  dialogueKey: "professor-vertical-slice",
  conclusion: "cancelled"
})
```

真正运行失败才返回 `failed(...)`。

## 8.1 Map 对 FrameOutcome 的 exact policy

`frame.call("dialogue", ...)` resolve 后，先应用 §11.2 的 Map terminal precedence。

只有没有 latched Map terminal outcome 时，才按三种 child FrameOutcome 分支：

```text
completed(value)
→ validate exact PokeManDialogueFrameResultV1
→ valid:
     resume normal Map gameplay under fresh A2
→ invalid:
     return failed({ code: "POKEMAN_DIALOGUE_RESULT_INVALID" })

failed(error)
→ return failed({
     code: "POKEMAN_DIALOGUE_CHILD_FAILED",
     data: { childCode: error.code }
   })
→ do NOT start normal A2 controls

cancelled
→ unexpected for this product call
→ return failed({ code: "POKEMAN_DIALOGUE_CHILD_CANCELLED" })
→ do NOT start normal A2 controls
```

这里必须区分：

```text
RPGDialogue user cancel
→ child completed({ conclusion:"cancelled" })

outer FrameOutcome.cancelled
→ unexpected child-frame lifecycle outcome
→ Map fail-stop
```

Map 第一版不解释 `ready/not-yet` 的 Story 含义；只验证 exact result 后恢复 gameplay。

# 9. Frame / Activation semantics

`frame.call` 被 Main 接受后：

```text
Map A1
→ permanently revoked
→ Map Frame suspended
→ no ordinary input
→ Dialogue child becomes Top Active Frame
```

Dialogue 返回后：

```text
Map does NOT regain A1
→ Main creates fresh A2
→ frame.resume(...)
→ code after await frame.call runs under A2
```

因此禁止：

```text
carry A1 ControlsConsumer across the call
carry A1 DirectionalControlsTracker into A2
reuse A1 heldOrder
reuse A1 freshness timer
```

# 10. Map Controls lifecycle and semantic mapping

`map.mjs` controls wiring 从 Frame-lifetime 一次创建改为 Activation-local：

```text
startMapControlsActivation()
stopMapControlsActivation()
```

每次 `startMapControlsActivation()`：

```text
new DirectionalControlsTracker
new ControlsConsumer
initial neutral State
```

Map Consumer exact behavior：

```text
onState(state)
→ directions.acceptState(state)
→ applyMoveIntent()

onEvent(event)
→ directions.acceptEvent(event)
→ applyMoveIntent()

→ if event.action === "down"
     AND event.repeat === false
     AND event.button in {"south","start"}
   then handler.controls.confirm()

all other semantic buttons
→ no Map command in this slice
```

因此真实产品链：

```text
KeyZ / Gamepad south
→ controls.event south
→ RPGMapControls.confirm()
→ adjacent interactable Professor
→ NPCInteractEvent
```

每次 `stopMapControlsActivation()` exact order：

```text
handler.controls.setMoveIntent(null)
directions.reset()
consumer.close()
discard directions / consumer references
```

close/reset 必须 idempotent-safe；A1 references 不得被 A2 复用。

# 11. Map frame-handler-owned interaction rendezvous

**`frame.call()` 必须由 Map Frame handler 的主 async control flow 自己 await。**

禁止：

```text
onNPCInteract()
→ detached async task
→ task owns frame.call()
→ outer frame handler only races/observes a failure promise
```

因为 child call commit 后 Map Frame 处于 `awaiting-resume`；如果 outer Frame handler 在 child return 前 settle，Subsystem Runtime 会触发：

```text
SUBSYSTEM_FRAME_HANDLER_CONTROL_FLOW_INVALID
```

正确模型是 synchronous NPC callback 只写入一个 **one-slot rendezvous**，真正的 `frame.call` 由 Frame handler loop 执行：

```text
RPGMapHandler.onNPCInteract(event)
→ synchronous only
→ if Professor and current waiter is armed:
     resolve waiter(event)
→ never await
→ never call frame.call directly
```

Map Frame handler 创建一次：

```text
mapRun = handler.run(initial)
```

然后驱动 loop：

```text
while Map Frame is healthy:

  arm one-shot Professor interaction waiter
  startMapControlsActivation()

  next = await Promise.race(
    mapRun,
    professorInteractionWaiter
  )

  stopMapControlsActivation()

  if next is mapRun outcome:
      disarm waiter
      return that exact Map FrameOutcome

  if next is Professor interaction:
      if map terminal outcome was latched before call commit:
          return exact Map outcome
          do not call Dialogue

      childOutcome = await frame.call("dialogue", exactInput)

      if Map terminal outcome became latched while child was active:
          return exact Map outcome
          do not create A2 controls

      validate childOutcome per §8.1

      if childOutcome is valid completed:
          loop
          → caller is already under fresh Activation
          → next iteration creates A2 Consumer/Tracker

      otherwise:
          return failed(...) per §8.1
```

关键 invariant：

> 从 `frame.call` 发起到其 Promise resolve 的整个时间段，Map Frame handler 自身必须仍在 `await frame.call(...)`，绝不能完成。

`handler.run()` 在 child active 期间继续 pending；Frame suspension本身不 abort `frame.signal`，因此 Map RenderDomain保持 live。

如果 Map runtime在等待 Professor interaction期间先产生 terminal outcome：

```text
mapRun wins race
→ disarm interaction waiter
→ stop current controls
→ return mapRun outcome
```

如果 Map Frame因为 child failure决定 return failed，SDK 后续 Frame return/close 会 abort `frame.signal`，RPGMap按既有 abort path清理；不要另外关闭 Map RenderDomain。

## 11.1 Rendezvous rules

one-slot waiter必须满足：

```text
at most one pending Professor event
no unbounded queue
no replay across Activation
no retained A1 event after child return
```

每次 loop arm 一个新的 waiter。

`onNPCInteract` 只接受：

```text
event.npc.instanceId === "professor"
AND
event.npc.npcId === "professor"
```

其他事件 no-op。waiter 已 settled / disarmed 时，再来的重复 callback no-op。

## 11.2 Map terminal while Dialogue child is active

`handler.run(initial)` 的 terminal outcome必须被 latch：

```text
mapRun settles while Map is waiting for child
→ remember exact Map FrameOutcome
→ DO NOT complete Map Frame yet
→ DO NOT race the committed frame.call against mapRun
→ continue awaiting frame.call until child return/resume completes
```

如果 Professor waiter赢得 race，但 `frame.call` 尚未 commit 前 `mapRun` 已经 terminal，也先返回 exact Map outcome，不启动 Dialogue。

如果 call已经 commit，child return后再检查 latched Map terminal outcome：

```text
latched Map outcome exists
→ do not create A2 ControlsConsumer/Tracker
→ return the exact latched Map outcome

no latched Map outcome
→ continue loop
→ create fresh A2 controls
```

这样同时满足：

```text
Frame handler never settles while child call is pending
Map runtime terminal is not lost
Map terminal outcome has precedence over child outcome
no Dialogue starts after Map already terminalled pre-call
no transient A2 gameplay authority after Map has already terminalled
```

# 12. frame.call rejection and commit boundary

Map implementation应从 `@loomrealm/subsystem` 使用现有 public exports：

```js
import { defineSubsystem, failed, FrameCallRejectedError } from "@loomrealm/subsystem";
```

调用前：

```text
A1 moveIntent = null
A1 tracker reset
A1 consumer closed
```

然后：

```js
await frame.call("dialogue", exactInput)
```

只允许显式 recoverable pre-commit rejection：

```text
FrameCallRejectedError
- FRAME_CALL_TARGET_NOT_FOUND
- FRAME_CALL_TARGET_UNAVAILABLE
```

它们表示 child call **没有 commit**，A1仍是 current Activation；但本 product topology已声明 Dialogue 必须存在，所以不重建 A1 controls继续游戏。

Map返回：

```text
failed({
  code: "POKEMAN_DIALOGUE_CALL_REJECTED",
  data: { callCode: error.code }
})
```

其他 `FrameBusyError / FrameInactiveError / FrameClosedError / TypeError` 都是 product/programming invariant violation。

本 slice固定映射为：

```text
failed({ code: "POKEMAN_DIALOGUE_MAP_INVARIANT_FAILED" })
```

不得 catch 后恢复旧 controls。

call success commit 后：

```text
A1 permanently revoked
Map awaiting-resume
```

只有 child return + Main fresh resume 后，`await frame.call(...)` 才 resolve。

因此：

```text
valid completed child
→ A2 normal controls may start

failed / cancelled / invalid child result
→ Map returns failed
→ no normal A2 controls
```

# 13. Map remains rendered while suspended

Frame lifecycle 不拥有 Render lifecycle：

```text
Map Frame suspended
≠ Map RenderDomain closed
≠ Map HTMLElement removed
```

call 前 `moveIntent=null`，Map runtime保持 idle。

Dialogue child active 时：

```text
Map remains rendered underneath
+
Dialogue RenderDomain overlays Map
```

# 14. Independent dialogue.mjs

`examples/PokeMan/subsystems/dialogue.mjs` 从 empty subsystem 改为真实 `defineSubsystem(...)`。

它独立拥有：

```text
frame.params validation
RPGDialogue lifetime
Dialogue ControlsConsumer
Professor participant resolver
hard-coded vertical-slice flow
History policy
child business result
cleanup
```

## 14.1 Dialogue input validation and atomicity

`dialogue.mjs` 在任何 Content read、ControlsConsumer、RPGDialogue 或 RenderDomain 建立前先验证 `frame.params`。

closed schema exact：

```text
frame.params
→ plain object
→ exactly { dialogueKey, source }

dialogueKey → exactly "professor-vertical-slice"

source
→ plain object
→ exactly { mapId, npc }

mapId → positive safe integer

npc
→ plain object
→ exactly { instanceId, npcId }

instanceId → exactly "professor"
npcId      → exactly "professor"
```

unknown field、missing field、wrong type、wrong literal都：

```text
→ return failed({
     code: "POKEMAN_DIALOGUE_INPUT_INVALID"
   })
→ before any Dialogue side effect
```

validation helper保持 product-private；不要上升成 RPG Dialogue public API。

## 14.2 Dialogue child resource/session cleanup

输入通过后，Dialogue Subsystem负责全部 child-local资源，并从 `@loomrealm/subsystem` 使用现有 public outcomes：

```js
import { defineSubsystem, completed, failed } from "@loomrealm/subsystem";
```

error boundary固定为：

```text
validate input
→ invalid:
   failed({ code: "POKEMAN_DIALOGUE_INPUT_INVALID" })

resolve Professor participant
→ Content read / shape / version failure:
   failed({ code: "POKEMAN_DIALOGUE_CONTENT_FAILED" })

new RPGDialogue + create ControlsConsumer + run A/B/C
→ unexpected session/flow failure:
   failed({ code: "POKEMAN_DIALOGUE_SESSION_FAILED" })

normal business completion:
→ completed(PokeManDialogueFrameResultV1)
```

使用 `try/finally` 保证：

```text
consumer?.close()
dialogue?.close()
```

在 completed / failed / frame abort / unexpected exception下都执行。

不要依赖 child Frame close自动替代业务对象自己的 `close()`。

# 15. Dialogue Subsystem controls

Dialogue child Frame 创建自己的：

```js
createControlsConsumer(
  scope.presentationEvents,
  frame,
  { onEvent(...) { ... } }
)
```

不创建 DirectionalControlsTracker。

| Controls button | Dialogue command |
| --- | --- |
| `south` | `dialogue.controls.confirm()` |
| `start` | `dialogue.controls.confirm()` |
| `up` | `dialogue.controls.previous()` |
| `down` | `dialogue.controls.next()` |
| `select` | `dialogue.controls.history()` |
| `east` | `dialogue.controls.cancel()` |

只处理 `action="down"` 且 `repeat=false`。

# 16. Controls naturally switch Frames

`<game-controls-input>` 继续由 `base` 挂载；它的 RenderDomain 可在 base/map/dialogue child calls 之间保持 live。

Main 决定 Top Active Frame / Activation / Presentation Interest：

```text
Map A1 active
→ controls → Map consumer

Map calls Dialogue
→ A1 revoked
→ old Map consumer already closed

Dialogue child active
→ controls → Dialogue consumer

Dialogue returns
→ child consumer closes
→ Map A2
→ fresh Map consumer
```

Map A2 必须从 neutral 开始。即使玩家仍按住方向，也只能由 A2 下新收到的 `controls.state` 重建 held truth；不能直接恢复 A1 direction。

# 17. Professor presentation participant resolver

Dialogue Subsystem真实执行 PokeMan Presentation producer chain：

```text
scope.content.record(
  "struct.NPC",
  "professor",
  { signal: frame.signal }
)
→ name + sprite

scope.content.resource(
  sprite.namespace,
  sprite.key,
  { signal: frame.signal }
)
→ resource.contentVersion
```

构造：

```js
{
  characterId: "professor",
  displayName: "博士",
  active: true,
  data: {
    sprite: {
      namespace: "resource.Graphics",
      key: "Characters/Professor",
      contentVersion: resource.contentVersion,
    },
  },
}
```

禁止 hard-code SHA。

当前 fixture只冻结：

```text
dialogueKey = "professor-vertical-slice"
→ Character identity = "professor"
→ appearance npcId = "professor"
```

不得把 `npcId === characterId` 推广成通用规则；`rival-lab/rival-casual → Character rival` 仍属于后续 appearance resolver。

## 17.1 Professor producer exact validation

`scope.content.record("struct.NPC", "professor", ...)` 的 `value` 必须是 closed shape：

```text
exactly { name, sprite }

name
→ non-empty string

sprite
→ exactly { namespace, key }

namespace → exactly "resource.Graphics"
key       → exactly "Characters/Professor"
```

然后 `scope.content.resource(sprite.namespace, sprite.key, ...)` 必须返回：

```text
contentVersion
→ ^sha256:[0-9a-f]{64}$
```

任一 Content read失败、record shape错误、sprite ref错误或 contentVersion错误：

```text
→ failed({ code: "POKEMAN_DIALOGUE_CONTENT_FAILED" })
```

不得 fallback 到硬编码 SHA、其他 NPC、Character record 或无版本 resource ref。

# 18. Hard-coded validation script

第一版不读取：

```text
struct.Dialogue/*
```

不解释：

```text
Choice.target
mutation
Story Index
```

使用 product-local hard-coded Conversations，只验证 RPGDialogue API、History、choice 和 Dialogue Subsystem 内部 branching。

固定流程：

## 18.1 Conversation A

```text
speaker: 博士
text:    你终于来了。
choices: none
character: Professor active
```

request：

```js
{
  conversation: {
    speakerName: "博士",
    text: "你终于来了。",
    choices: [],
    data: {},
  },
  characters: [professorCharacter],
}
```

result：

```text
submitted
→ continue

cancelled
→ child completed({
     dialogueKey: "professor-vertical-slice",
     conclusion: "cancelled"
   })
→ return Map through normal child Frame completion
```

Conversation A settle 后，Dialogue 是 READY，因此 append：

```js
dialogue.appendHistory({
  entryId: "professor-greeting",
  speakerName: "博士",
  text: "你终于来了。",
});
```

---

# 19. Conversation B：Choice

第二段：

```text
speaker: 博士
text:    准备好出发了吗？

choices:
ready     → 准备好了
not-yet   → 还没有
```

request：

```js
{
  conversation: {
    speakerName: "博士",
    text: "准备好出发了吗？",
    choices: [
      {
        choiceId: "ready",
        text: "准备好了",
        data: {},
      },
      {
        choiceId: "not-yet",
        text: "还没有",
        data: {},
      },
    ],
    data: {},
  },
  characters: [professorCharacter],
}
```

在该 Conversation ACTIVE 期间：

```text
history()
→ History 应显示 Conversation A 的 entry
```

这真实验证：

```text
Dialogue Subsystem appendHistory
→ RPGDialogue History
→ PokeMan History Web Component
```

而不是 test-only fake History。

---

# 20. Dialogue-owned branching

Conversation B result 由 **Dialogue Subsystem** 自己处理：

```text
{ type: "cancelled" }
→ child conclusion = "cancelled"
→ return completed(...)

{ type: "submitted", choiceId: "ready" }
→ open Conversation C-ready

{ type: "submitted", choiceId: "not-yet" }
→ open Conversation C-not-yet
```

Map caller不解释 choiceId，也不决定 C。

这里仍然故意不使用 Dialogue graph；只是把当前 hard-coded flow 放在正确的业务 owner 中。

```text
RPGDialogue
→ 提供 Conversation interaction result

PokeMan Dialogue Subsystem
→ 拥有当前 Dialogue flow

Map
→ 只负责 NPC interaction → call Dialogue
```

# 21. Conversation C

## ready

```text
博士：
很好，出发吧。
```

## not-yet

```text
博士：
准备好以后再来找我。
```

均无 choices。

C 正常提交后，Dialogue Subsystem返回：

```text
ready
→ completed({
     dialogueKey: "professor-vertical-slice",
     conclusion: "ready"
   })

not-yet
→ completed({
     dialogueKey: "professor-vertical-slice",
     conclusion: "not-yet"
   })
```

任一 Conversation 的用户 cancel：

```text
→ completed({
     dialogueKey: "professor-vertical-slice",
     conclusion: "cancelled"
   })
```

随后 child Frame return/close；Map由 Main resume到 fresh Activation。

本 slice 不写 Shared State，不记录“玩家准备好了”，不发 Quest/Event mutation。

# 22. History policy for this slice

本 slice History 只用于验证 session API。

固定：

```text
A submitted
→ append A

B submitted
→ append B

C
→ no need to append before closing session
```

B settle 后、打开 C 前可以追加：

```js
dialogue.appendHistory({
  entryId: "professor-question",
  speakerName: "博士",
  text: "准备好出发了吗？",
});
```

不要把 choice text 自动写成 History entry。

这不是正式 transcript policy。

正式游戏以后由 Dialogue/Story owner 单独定义。

---

# 23. Cancel behavior

RPGDialogue 使用：

```text
cancelable: true
```

固定语义：

```text
Conversation + east
→ current openConversation()
   resolves { type: "cancelled" }
→ Dialogue Subsystem maps to
   completed({
     dialogueKey: "professor-vertical-slice",
     conclusion: "cancelled"
   })
→ child closes
→ Map resumes fresh Activation
```

History 中：

```text
east
→ close History
→ return same Conversation
```

不会直接取消 Conversation，因为 RPGDialogue v1 已拥有该 precedence。

PokeMan composition 不重复实现 History cancel precedence。

---

# 24. Controls ownership across Frame call

不再存在同一 ControlsConsumer 内的 Map / Dialogue router。

Map A1：

```text
controls.state / event
→ Map Activation-local Consumer
→ Directional Tracker / map.controls.confirm()
```

call 前：

```text
moveIntent = null
tracker.reset()
consumer.close()
```

Dialogue child：

```text
controls.event
→ Dialogue child Consumer
→ RPGDialogueControls
```

Dialogue return后 Map A2：

```text
new Consumer
new Directional Tracker
initial neutral
new controls.state rebuilds truth
```

这由 Frame authority切换 controls destination，而不是 product local active flag。

# 25. Interaction race rules

## 25.1 repeated confirm

一旦 child call accepted：

```text
Map A1 suspended
→ no ordinary controls delivery to Map
→ south/start只可能进入 Dialogue child Consumer
```

所以 Dialogue 中确认不会重新触发 Professor NPC interaction。

## 25.2 movement in progress

RPGMap 已保证：

```text
confirm while active movement
→ ignored
```

PokeMan 不复制 Map busy logic。

Professor interaction被接受后，call 前必须先 `moveIntent=null`。

## 25.3 duplicate NPC event

重复保护只由当前 Activation 的 one-slot rendezvous承担：

```text
waiter armed + no event accepted yet
→ first matching Professor NPCInteractEvent wins

waiter already settled / disarmed
→ duplicate callback no-op
```

不维护 detached `dialogueTask` gate。call accepted 后 Map 已 suspended，本身也不会再收到 ordinary confirm。

## 25.4 stale / terminal cleanup

如果 Map Frame terminal、Runtime failure或 child-call unwind发生：

```text
old Map Consumer remains closed
old tracker remains discarded
child Dialogue owns its own cleanup
```

不得在 terminal path 私自重建 Map controls。

只有正常 child return + valid Map resume 后，才创建 A2 controls wiring。

# 26. Render / Presentation composition

本 slice 真实运行两个 RenderDomain：

```text
Map RenderDomain
+
RPGDialogue RenderDomain
```

PokeMan Dialogue Presentation 已验证：

```text
lr-dialogue-view CSS overlay
→ z-index 20
→ same Window above lr-map-view
```

本 slice 不修改：

```text
presentation/dialogue.browser.js
presentation/dialogue.css
presentation.json
```

除非 implementation 发现与真实 gameplay vertical 有新的 reproducible correctness bug。

不能为了业务接线再次重写组件状态机。

---

# 27. Production topology after this slice

完成后 exact topology：

```json
{
  "initial": { "subsystem": "base" },
  "subsystems": [
    { "key": "base" },
    { "key": "map" },
    { "key": "dialogue" }
  ]
}
```

Hostra：

```text
base     -> subsystems/base.mjs
map      -> subsystems/map.mjs
dialogue -> subsystems/dialogue.mjs
```

PWA 使用相同 topology。

`base` 继续拥有唯一 unified controls producer lifetime；它不承担 Dialogue 流程控制。

## 27.1 Exact PWA executable landing

当前 PWA fixture/build 对 PokeMan executable set 仍硬编码为 `base + map`。实现必须精确扩成：

```text
subsystems/base.mjs
subsystems/map.mjs
subsystems/dialogue.mjs
```

必须修改：

```text
examples/PokeMan/scripts/prepare-pwa-content.mjs
→ createPokeManPwaFixture().specifications 加 dialogue
→ executablePaths 要求 base/map/dialogue

apps/pwa/scripts/build.mjs
→ qualification bundle 增加 pokeman-dialogue-subsystem.mjs
→ staging executablePaths 增加 dialogue
→ staging bundle loop构建三个 PokeMan subsystem

apps/pwa/package.json
→ build:qualification prerequisite 加 @loomrealm-game/rpg-dialogue
→ build:staging prerequisite 加 @loomrealm-game/rpg-dialogue

apps/pwa/test/pokeman-bundle.test.mjs
→ fixture executablePaths 加 dialogue
→ expected executable graph = base/map/dialogue

apps/pwa/test/pokeman-bundle-id.test.mjs
→ fixture 加 dialogue executable
→ changing dialogue executable must change bundleId

apps/pwa/test/staging-build.test.mjs
→ fresh-checkout dependency closure包含 @loomrealm-game/rpg-dialogue
```

PokeMan自己的 `@loomrealm-game/rpg-dialogue` 必须位于 `dependencies`，不再只属于 `devDependencies`。

## 27.2 This test slice PWA Content closure does NOT expand to Dialogue content

本 slice 不读取：

```text
struct.Dialogue/*
```

Professor 的 `struct.NPC/professor` 与 `resource.Graphics/Characters/Professor` 已属于现有 reachable Map/NPC closure。

所以本验证切片的 Content closure 不因 Dialogue graph 扩大。**这是 professor-only hard-coded vertical slice 的边界，不是正式 Story Runtime 的生产 Content 策略。**

正式 Dialogue graph runner 会读取被引用的 `struct.Dialogue` 与 `struct.EventStateMutation`；生产 Content closure 应从实际入口 / Event / Choice target / Mutation 引用递归计算，并包含所需的 Event、Character、NPC 与资源，不应把无关 Dialogue 全表无条件打包。具体集成见 [79-story-dialogue-event-integration.md](./79-story-dialogue-event-integration.md)。

# 28. Initial spawn policy

不要为了方便手工验证修改 production：

```text
game.json initial map
```

正式游戏仍从当前起点启动。

自动 qualification 可以使用 test-only input / fixture 直接把玩家放到 Map 4 Professor 附近。

test-only fixture 不得写回 production Game Entry。

推荐 test setup：

```text
mapId = 4
player adjacent to Professor
player facing Professor
```

具体相邻 tile 必须由测试根据真实 Map passability 验证后选择，不能假设坐标一定可站立。

---

# 29. Required tests and exact landing

## 29.1 PokeMan focused tests

新增或扩展 PokeMan test，建议固定：

```text
examples/PokeMan/test/dialogue-gameplay-vertical-slice.test.mjs
```

覆盖：

```text
topology = base + map + dialogue
Professor interactable=true
other NPC fixtures unchanged

Map:
south/start down repeat=false → map.controls.confirm()
repeat=true → no confirm

A1:
moveIntent neutral before call
consumer closes before call
tracker reset/discard

exact Map → Dialogue input
FrameCallRejectedError → POKEMAN_DIALOGUE_CALL_REJECTED
other frame.call invariant exceptions → POKEMAN_DIALOGUE_MAP_INVARIANT_FAILED

Dialogue:
exact frame.params validation
invalid input atomic failure
real NPC/contentVersion producer
child ControlsConsumer mapping
A / History / B / branching / C
user cancel → completed conclusion cancelled
cleanup

Map child outcome:
valid completed → normal resume
invalid completed → POKEMAN_DIALOGUE_RESULT_INVALID
failed → POKEMAN_DIALOGUE_CHILD_FAILED
outer cancelled → POKEMAN_DIALOGUE_CHILD_CANCELLED
```

Focused harness可以使用受控 fake Frame/Content/PresentationEvent client验证 product-private branching，但不能替代真实 Frame-stack E2E。

## 29.2 Existing PWA qualification fixture

必须更新：

```text
examples/PokeMan/scripts/prepare-pwa-content.mjs
apps/pwa/scripts/build.mjs
apps/pwa/test/pokeman-bundle.test.mjs
apps/pwa/test/pokeman-bundle-id.test.mjs
apps/pwa/test/staging-build.test.mjs
```

使 qualification/staging executable index精确包含 `base / map / dialogue`。

## 29.3 Real Frame-stack gameplay E2E

**复用并扩展现有**：

```text
apps/pwa/test/pokeman-map.e2e.test.mjs
```

不要另造一套平行 PWA harness。

在现有真实 Chromium / real PWA install / real route planner 路径中：

```text
boot Map 3
→ route to Map 4
→ find reachable tile adjacent to Professor
→ face Professor
→ KeyZ
→ real RPGMapControls.confirm()
→ real NPCInteractEvent
→ real frame.call("dialogue")
→ Map A1 suspended
→ Dialogue child active
→ real PokeMan Dialogue WC appears
→ A reveal/submit
→ B choices
→ Tab History
→ X back to B
→ choose ready or not-yet
→ C
→ complete
→ Dialogue disappears
→ same lr-map-view HTMLElement remains
→ same Map scene remains
→ Map A2 receives fresh controls
→ movement succeeds
→ interact again
→ fresh child Dialogue / fresh History
```

E2E还要 fetch/install `subsystems/dialogue.mjs`，并验证其 MIME/contentVersion 与 executable graph。

## 29.4 Real staging E2E

扩展：

```text
apps/pwa/test/pokeman-staging.e2e.test.mjs
```

至少跑一次：

```text
route to Professor
→ open real Dialogue child
→ complete/cancel
→ Map resumes
```

staging不暴露 qualification-only controls的既有要求保持。

## 29.5 Hostra acceptance boundary

当前仓库没有 PokeMan-specific Hostra Chromium E2E。

本 slice不为了对称性新增第二套浏览器 harness。

自动 Hostra侧验证使用：

```text
examples/PokeMan/test/map-smoke.test.mjs
→ exact launch.hostra base/map/dialogue

generic Frame/Call conformance
→ child call lifecycle contract

PokeMan focused tests
→ product routing/input/output contract
```

并保留 §31 的 `play.bat` 手工 acceptance作为真实 Hostra产品验证。

# 30. Required qualification commands

至少运行并通过当前仓库已有的 exact commands：

```text
npm test -w @loomrealm-example/pokeman
npm test -w @loomrealm-game/map
npm run test:rpg-dialogue
npm run test:game-control-ports:qualification
npm test -w @loomrealm/subsystem -w @loomrealm/main -w @loomrealm/game-launcher-hostra

npm run build:qualification -w @loomrealm/pwa
npm run test:unit -w @loomrealm/pwa
node apps/pwa/scripts/run-e2e.mjs m17

npm run build:staging -w @loomrealm/pwa
node apps/pwa/scripts/run-e2e.mjs staging
```

如果实现提交期间仓库脚本名称发生变化，Agent 使用最新等价命令，并在 PR 报告 exact command；不得引用不存在的 qualification script。

关键证据必须实际存在：

```text
Frame call/suspend/return/resume
A1 → child → A2 controls authority
base/map/dialogue executable install
real Professor interaction
real RPGDialogue
real Dialogue Web Presentation
real Map resume
```

现有 `.github/workflows/pokeman-staging-qualification.yml` 的 fresh-checkout build必须继续通过；不能依赖本地残留 `dist/`。

# 31. Manual acceptance path

开发者可用当前 Common Controls keyboard policy手工验证：

```text
1. 启动 PokeMan
2. 前往研究所 Map 4
3. 走到 Professor 正前方
4. 按 Z 或 Enter
5. Dialogue Modal 出现
6. 第一段逐字显示
7. 第一次 confirm 在 revealing 时只 reveal all
8. 再次 confirm 提交第一段
9. 第二段出现 choices
10. ArrowUp/ArrowDown 改变 choice
11. Tab 打开 History
12. History 中能看到“你终于来了。”
13. X 关闭 History，回到同一 choice state
14. 提交 ready / not-yet
15. 出现对应第三段
16. 提交或取消
17. Dialogue Modal 消失
18. Map 没有 reload / remount
19. 玩家可以继续移动
20. 再次面对 Professor 可建立 fresh Dialogue session
```

---

# 32. Observable invariants

```text
Map RenderDomain / HTMLElement
→ child Dialogue期间保持 live

Map A1
→ call前 moveIntent neutral
→ controls wiring closed

Dialogue child
→ 唯一 Top Active Frame
→ own ControlsConsumer
→ own RPGDialogue
→ own Dialogue flow

History
→ remains inside child Dialogue Frame

child completed
→ child closes
→ Map resumes fresh A2

Map A2
→ fresh Consumer / Tracker
→ neutral baseline
→ same Map scene / Handler / RenderDomain

second Professor interaction
→ new child Frame
→ new RPGDialogue
→ fresh History
```

# 33. Failure policy

本 slice冻结以下 product failure codes：

```text
Dialogue child:
POKEMAN_DIALOGUE_INPUT_INVALID
POKEMAN_DIALOGUE_CONTENT_FAILED
POKEMAN_DIALOGUE_SESSION_FAILED

Map caller:
POKEMAN_DIALOGUE_CALL_REJECTED
POKEMAN_DIALOGUE_MAP_INVARIANT_FAILED
POKEMAN_DIALOGUE_RESULT_INVALID
POKEMAN_DIALOGUE_CHILD_FAILED
POKEMAN_DIALOGUE_CHILD_CANCELLED
```

## 33.1 Dialogue child

```text
invalid exact frame.params
→ POKEMAN_DIALOGUE_INPUT_INVALID

NPC/resource producer failure
→ POKEMAN_DIALOGUE_CONTENT_FAILED

RPGDialogue / conversation flow / unexpected choice/result failure
→ POKEMAN_DIALOGUE_SESSION_FAILED
```

不要静默吞异常，也不要让已知 product failure意外退化成 generic `UNHANDLED_BUSINESS_EXCEPTION`。

## 33.2 Map caller

```text
recoverable pre-commit FrameCallRejectedError
→ POKEMAN_DIALOGUE_CALL_REJECTED
→ data.callCode = exact FRAME_CALL_TARGET_* code

other frame.call invariant exception
→ POKEMAN_DIALOGUE_MAP_INVARIANT_FAILED

completed(value) invalid
→ POKEMAN_DIALOGUE_RESULT_INVALID

child failed(error)
→ POKEMAN_DIALOGUE_CHILD_FAILED
→ data.childCode = error.code

outer child cancelled
→ POKEMAN_DIALOGUE_CHILD_CANCELLED
```

这些 Map failure都结束当前 Map Frame；不得建立正常 A2 gameplay controls继续。

用户在 RPGDialogue 中的 `{ type: "cancelled" }` 仍是正常业务结果，由 Dialogue Subsystem转换成：

```text
completed({
  dialogueKey: "professor-vertical-slice",
  conclusion: "cancelled"
})
```

不是 child failure。

# 34. Explicit non-goals

本 slice 不实现：

```text
struct.Dialogue loader
generic Dialogue graph runner
Choice.target
Dialogue.mutation
EventStateMutation
Story Index
Relationship
Quest
Inventory
Battle launch
persistent transcript
Shared State Dialogue history
generic NPC→Dialogue mapping
generic Character→NPC resolver
rival appearance resolver
multiple NPC Dialogue content
pointer/touch Dialogue gameplay
physical key hint UI
```

但与旧方案不同：

> **独立 `dialogue` Subsystem、child Frame、其 ControlsConsumer 与 hard-coded flow 已属于本 slice 正式实现范围。**

# 35. What this proves

成功后获得的证据是：

```text
RPGMap NPC Interaction
→ canonical frame.call business boundary
→ independent PokeMan Dialogue Subsystem
→ child Frame Input authority
→ RPGDialogue v1
→ PokeMan Dialogue Web Components
→ child return
→ fresh Map Activation
```

同时证明：

```text
Frame lifecycle
Render lifecycle
Controls Activation lifecycle
```

没有被错误混为一谈。

它仍不证明正式 `struct.Dialogue` graph runner / Story mutation设计已经完成。

# 36. Exit criteria

```text
[ ] 73 supersedes 72 only for topology + Activation-local Map controls
[ ] production topology = base + map + dialogue
[ ] dialogue.mjs 不再是 empty subsystem
[ ] Professor interactable=true
[ ] other NPC interaction scope unchanged
[ ] Map 不 import RPGDialogue
[ ] Map south/start repeat=false routes RPGMapControls.confirm()
[ ] NPC callback只做 synchronous rendezvous，不直接 await/call child
[ ] Map Frame handler自己 await frame.call("dialogue", exact input)
[ ] Frame handler绝不在 child call pending时 settle
[ ] @loomrealm-game/rpg-dialogue 是 PokeMan production dependency
[ ] Map A1 moveIntent在 call前 neutral
[ ] Map A1 Consumer在 call前关闭
[ ] A1 tracker reset/discard
[ ] recoverable call rejection → exact product failure，不恢复旧 controls
[ ] other frame.call invariant exceptions → POKEMAN_DIALOGUE_MAP_INVARIANT_FAILED
[ ] Dialogue input closed-schema validation发生在任何 side effect 前
[ ] Dialogue child owns fresh ControlsConsumer
[ ] child 是真实 Top Active Frame
[ ] Map suspended期间不接 ordinary controls
[ ] Professor sprite通过真实 Content API resolve
[ ] no hard-coded contentVersion
[ ] Conversation A works
[ ] History works
[ ] Conversation B choice works
[ ] Dialogue Subsystem owns branching
[ ] Conversation C works
[ ] RPGDialogue user cancel → completed conclusion cancelled
[ ] Dialogue cleanup uses finally + consumer.close/dialogue.close
[ ] Map validates exact completed child value
[ ] child failed / outer cancelled / invalid result均 fail-stop
[ ] child active期间 Map terminal outcome被 latch，不提前 settle caller
[ ] latched Map terminal后 child return不创建 A2 controls
[ ] valid child completed且 Map未terminal后才 resumes fresh A2
[ ] A2 uses new Consumer/Tracker
[ ] A2 starts neutral
[ ] old A1 State/Event不泄漏
[ ] same Map RenderDomain / HTMLElement / scene remain live
[ ] movement after resume works
[ ] second interaction creates fresh child Frame + fresh History
[ ] PWA executable set = base + map + dialogue
[ ] PWA Content closure不引入 struct.Dialogue
[ ] PWA fresh-checkout builds @loomrealm-game/rpg-dialogue before bundling Dialogue executable
[ ] pokeman-map.e2e real Frame-stack vertical passes
[ ] pokeman-staging.e2e real Dialogue interaction passes
[ ] Hostra manifest smoke + manual play acceptance pass
[ ] Map tests pass
[ ] RPG Dialogue v1 tests pass
[ ] Game Control Ports tests pass
[ ] Subsystem/Main/Hostra Frame-call regressions pass
```

# 37. Next step after qualification

本 vertical slice 通过后，不再重新决定 Dialogue graph 的基本数据语义。正式生产设计已经分别由：

- [64-dialogue.md](./64-dialogue.md)：固定 Dialogue graph、Choice.target、terminalDialogueId 与 mutation commit 语义；
- [62-event.md](./62-event.md)：Event state、EventStateMutation、StoryIndex 与 scene takeover；
- [79-story-dialogue-event-integration.md](./79-story-dialogue-event-integration.md)：Map Frame Handler 的 child Frame 调用、场景刷新、序章状态机、业务事务与 Battle 协作；
- [78-prologue-dialogue-content.md](./78-prologue-dialogue-content.md)：序章具体对白与 Dialogue key。

后续实现工作是把当前 professor-only hard-coded validation slice 演进为上述生产 contract：

- 读取并验证 struct.Dialogue Content；
- 执行 Choice.target graph 并返回 terminalDialogueId；
- 在 terminal completion 时执行可选 EventStateMutation；
- 将 Map NPC interaction 与 Story Resolver 的 dialogueKey 连接；
- 在 EventStateList 成功变化后刷新当前 Map scene；
- 将实际可达 Dialogue / Event / Mutation 纳入生产 Content closure；
- 保留 73 已验证的独立 child Frame、Controls ownership、Map suspension 与 cleanup 语义。

**是否使用独立 Dialogue Subsystem / child Frame 已在本 slice 中确定，不再作为后续待决项。**
