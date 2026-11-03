# PokeMan Dialogue Presentation v1.1 优化方案

> 路径：`examples/PokeMan/doc/74-dialogue-presentation-v1.1.md`
>
> 状态：**Design frozen / implementation-ready**
>
> 对应问题：[Issue #118 — PokeMan Dialogue Presentation v1.1: keep sessions visually continuous and tighten layout](https://github.com/lithdoo/loom-realm/issues/118)
>
> 本文是 [69-dialogue-web-component.md](./69-dialogue-web-component.md) 的 **有限 authority override**。本文只修正连续 Conversation 的 shell 可见性、active-character 响应式布局、视觉密度与人物 stage 连续性；其余 canonical tree、History、Reveal、Choice、sprite producer、Presentation resource、collision preflight 与 Runtime ABI 继续由 69 负责。

# 1. 背景

真实 PokeMan 产品验证发现当前 Dialogue Presentation 存在三个 UX 问题：

1. 连续 Conversation 在 `ACTIVE → READY → ACTIVE` 之间会让整个 modal/backdrop 消失再出现；
2. `<= 640px` 时人物区与正文被强制改成上下结构，对 640×480 等正常游戏 viewport 过早；
3. modal、人物区、正文、speaker 与 controls 的多层 padding 累积过大，整体更像网页 modal，而不是紧凑的 JRPG / VN 对话框。

另外，当前人物 element 在相同 sprite data 被重复投影时会重新进入 load/fallback 流程，可能造成不必要的 sprite 闪动。v1.1 把它纳入“人物 pane 连续性”一起处理。

本文 **不处理 Conversation 正文的 `↑/↓` 滚动语义**。该问题属于 semantic routing，应单独设计，不与本 PR 混合。

# 2. Authority override

69 继续是 PokeMan Dialogue Presentation 的主设计文档，但以下条款由本文覆盖：

```text
69 §4.2 / §4.3 / §4.5
→ control-hint facts 与 view visibility 的关系
→ READY 不再等价于“已打开 shell 必须 hidden”

69 §5.1
→ active character 双栏比例由 32/68 调整为 30/70

69 §5.2
→ 640px 不再是 stacked layout breakpoint
→ stacked layout 仅用于真正窄屏

69 中与 visual density 相关的建议值
→ 由本文的 v1.1 spacing baseline 覆盖
```

以下内容 **不被本文改写**：

```text
canonical lr-dialogue-* tree
Web Component tag / attr / data ABI
RPGDialogue Runtime public API
Render Event / Custom Event 语义
REVEALING / CONVERSATION / CHOICES / HISTORY 四 UI state
History full-width mode
first active character 选择规则
sprite versioned ref producer contract
sprite fallback contract
reveal first-confirm-only rule
choice selection / submit rule
pointer/touch gameplay boundary
semantic control hints 不显示 physical key glyph
Presentation source / FSDB sync
customElements collision preflight
```

# 3. v1.1 目标

最终体验固定为：

```text
Dialogue session open
→ shell 出现一次

Conversation A ACTIVE
→ reveal / submit

A settle → Runtime READY
→ shell 保持
→ backdrop 保持
→ character pane 保持
→ modal geometry 保持
→ interaction disabled

Conversation B ACTIVE
→ 同一 shell 原位更新内容
→ 新 Conversation 从头 reveal

B → READY → C
→ 同样保持 shell 连续

RPGDialogue.close() / RenderDomain close
→ shell 才真正消失
```

因此用户视觉上看到的是一个连续 Dialogue session，而不是每段台词都重新打开一次 modal。


# 4. Shell visibility 与 interaction readiness 解耦

## 4.1 问题

当前实现把五个 canonical control hint 的 enabled facts 同时当作：

```text
Runtime ACTIVE/READY evidence
+
整个 Dialogue shell 的 visibility authority
```

于是：

```text
all five hints disabled
→ presented=false
→ modal.hidden=true
→ backdrop.hidden=true
```

而 RPGDialogue 每个 Conversation settle 后都会进入 READY，因此连续 A/B/C 必然闪隐。

## 4.2 v1.1 private facts

`lr-dialogue-view` 固定维护以下 Presentation-local private facts：

```text
controlsComplete: boolean
interactionActive: boolean
shellPresented: boolean
mode: conversation | history
hasActiveCharacter: boolean
```

定义：

```text
controlsComplete
= 五个 canonical action hints 已完整 materialize

interactionActive
= controlsComplete
  AND 至少一个 hint enabled=true

shellPresented
= 当前 view connection/session presentation epoch 内
  是否曾观察到 interactionActive=true
```

其中 `shellPresented` 是 **WC-local one-way latch**：

```text
initial = false

first interactionActive=true
→ shellPresented=true

later READY / all hints disabled
→ interactionActive=false
→ shellPresented remains true
```

不得新增 public `active` / `ready` / `presented` canonical attr。

不得把这些 private facts 写入 Runtime、Renderer Store、Shared State 或 Session Event。

## 4.3 Exact derivation and rendering

固定计算顺序：

```text
sync canonical control facts
→ derive controlsComplete
→ derive interactionActive
→ if interactionActive=true:
     latch shellPresented=true
→ render shell / inert / Conversation activity
```

精确规则：

```text
five hints incomplete
AND shellPresented=false
→ shell hidden
→ interaction inactive

five hints complete
AND all false
AND shellPresented=false
→ initial READY
→ shell hidden
→ interaction inactive

five hints complete
AND any true
→ interactionActive=true
→ shellPresented=true
→ shell visible

later five hints complete
AND all false
AND shellPresented=true
→ intermediate READY
→ shell remains visible
→ interaction inactive

five hints temporarily incomplete
AND shellPresented=true
→ shell remains visible
→ interaction inactive
```

Presentation rendering 必须按两个不同 authority 执行：

```text
modal.hidden
backdrop.hidden
→ controlled only by !shellPresented

modal.inert
view.inert
→ controlled by !interactionActive

Conversation interaction/reveal
→ controlled by interactionActive && mode === "conversation"
```

不得再用一个 `presented` boolean 同时表达“shell visible”和“Conversation 可交互”。

## 4.4 State truth table

v1.1 固定：

| Runtime / Presentation condition | shell | view/modal inert | Conversation interaction | active content |
| --- | --- | --- | --- | --- |
| initial READY before first ACTIVE | hidden | true | false | none exposed |
| ACTIVE + CONVERSATION | visible | false | true | Conversation |
| ACTIVE + HISTORY | visible | false | false | History |
| intermediate READY after an ACTIVE | visible | true | false | retained Conversation shell |
| RenderDomain / Dialogue close | removed | n/a | false | none |

因此：

- READY 不新增第五个用户可交互 UI state；
- History 不能因为 Conversation 被暂停而把整个 view 设为 inert；
- intermediate READY 只保留视觉 shell，不获得任何 command authority；
- retained Conversation 在 intermediate READY 中可以继续显示最后一帧内容，但 reveal timer 必须停止。

## 4.5 Conversation event / reveal gate

原来的 `conversation.setPresented(boolean)` 不再适合同时表达 visibility 与 interaction。

推荐 private seam：

```text
conversation.setInteractionActive(boolean)
```

或语义完全等价的 private implementation。

固定：

```text
interactionActive=true
AND mode=conversation
→ Conversation may:
   - run reveal timer
   - process commit
   - process choice navigation
   - process Presentation-local Render Events

interactionActive=false
OR mode=history
→ Conversation must:
   - stop reveal timer
   - ignore interactive Render Events
   - preserve revealIndex
   - preserve selectedChoiceId
   - preserve conversation scroll
```

`DialogueConversationElement.receiveRenderEvent()` 的 gate 必须绑定 Conversation interaction-active fact，而不是 shell visibility。

## 4.6 Fresh session / connection reset

正常产品路径的真实 session boundary 是：

```text
RPGDialogue RenderDomain close
→ Web Projector removes lr-dialogue-view
→ old Presentation-local latch no longer participates

later new Dialogue child/session
→ new projected view
→ shellPresented starts false again
→ initial READY remains hidden until first ACTIVE
```

实现还必须对同一 custom-element object 的异常/manual reconnect 做 defensive reset：

```text
disconnectedCallback
→ stop local timers/resources as applicable
→ interactionActive=false
→ shellPresented=false

next connectedCallback
→ start a fresh Presentation connection epoch
→ synchronize canonical facts from initial=false baseline
```

这只是 WC-local defensive lifecycle；不得把 `disconnectedCallback` 解释成新的 Runtime lifecycle authority。

# 5. Conversation 切换必须保持视觉连续

## 5.1 Shell / element continuity

同一个 RPGDialogue instance 的 A/B/C：

```text
lr-dialogue-view HTMLElement
modal HTMLElement
backdrop HTMLElement
lr-dialogue-characters HTMLElement
active lr-dialogue-character HTMLElement (same canonical key when same character)
```

应尽可能保持同一 identity。

Runtime retained projection 在 READY 已存在，下一次 `openConversation()` 只更新 canonical projection。Presentation 不得主动 teardown/recreate shell。

## 5.2 Atomic visual transition

Conversation identity 变化时：

```text
old conversation settled
→ READY shell retained
→ new conversation-id/data reconciled
→ local selection/reveal reset
→ new text reveal begins
```

允许正文瞬时更新；不允许：

```text
modal fade out
backdrop fade out
character pane collapse
modal resize
page/scene transition
```

不要求在 READY 显示 loading spinner。正常 A→B 的 READY 时间应作为短暂 inert retained state。


# 6. Character sprite 连续性

当前 `lr-dialogue-character` 的加载入口不只来自 `receiveRenderData()`。现有实现中的：

```text
connectedCallback()
receiveRenderContext()
receiveRenderData()
setPresentationActive(true)
```

都可能触发 `_startLoad()`。

因此 v1.1 **禁止只在 receiveRenderData() 局部去重**；否则重复 active synchronization 仍可能 abort 当前请求、显示 fallback、重新获取相同资源。

## 6.1 Single load coordinator

所有触发路径必须汇入一个统一的 idempotent load coordinator，例如：

```text
_ensureSpriteLoad()
```

方法名不是 ABI，但语义必须统一。

它至少维护：

```text
current context identity
current parsed sprite ref
connection epoch
current attempt key
sprite status: empty | loading | ready | fallback
```

exact attempt key：

```text
connectionEpoch
+
renderContext object identity
+
namespace
+
key
+
contentVersion
```

ref equality 必须比较 exact：

```text
namespace
key
contentVersion
```

## 6.2 Idempotence

当：

```text
new attempt key === current attempt key
AND status in {loading, ready}
```

固定：

```text
do not abort current request
do not start a second resource request
do not show fallback
do not clear a ready canvas
```

因此以下重复动作都必须是资源层 no-op：

```text
receiveRenderData(same exact ref)
receiveRenderContext(same exact context)
setPresentationActive(true) when already active
repeated canonical active="true" synchronization
syncActiveToView() selecting the same character again
```

`setPresentationActive(false)` 只控制视觉 active state，不应因为人物暂时 inactive 就破坏已经 ready 的 canvas，也不应无条件 abort 相同资源 acquisition。

## 6.3 Reload triggers

只有以下情况允许生成新的 attempt key 并重新 load：

```text
namespace changes
key changes
contentVersion changes
renderContext object identity changes
disconnect → reconnect creates a new connection epoch
previous data was invalid/null and later becomes a valid different effective ref
```

## 6.4 Failure retry boundary

同一 connection epoch + 同一 render context + 同一 exact sprite ref 如果已经以 fallback 结束，普通 projection reconciliation **不得自动重试**。

以下动作不是 retry authority：

```text
repeat receiveRenderData(same ref)
repeat setPresentationActive(true)
repeat active attr synchronization
repeat syncActiveToView()
```

同一个失败 attempt 只有在以下真实新 acquisition opportunity 到来时才可重试：

```text
exact sprite ref changes
render context identity changes
disconnect → reconnect creates a new connection epoch
```

这样可以避免坏资源或暂时失败导致 reconcile loop / repeated activation 触发无界请求。

## 6.5 Existing resource safety remains frozen

仍保留 69 的：

```text
AbortController
stale result rejection
disconnect abort
ImageBitmap cleanup
exact contentVersion match
PNG MIME validation
4x4 sheet validation
imageSmoothingEnabled=false
fallback behavior
```

新的 idempotence 只能减少无意义 acquisition，不能放宽资源校验。


# 7. Active-character layout v1.1

## 7.1 Normal game viewport

有 active character 时固定双栏：

```text
character = 30%
conversation = 70%
```

CSS 等价：

```css
.modal.with-character {
  grid-template-columns: 30% minmax(0, 70%);
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas:
    "characters conversation"
    "characters controls";
}
```

必须保持水平布局的 qualification viewport：

```text
1280×720
800×600
640×480
```

其中 800×600 是当前 Hostra/Desktop 默认窗口的重要产品基线。

## 7.2 No active character

继续沿用 69：

```text
no active character
→ character pane hidden / no grid space
→ conversation 100% width
```

transient speaker / narration 不创建 fake character。

## 7.3 History

继续沿用 69：

```text
History
→ character hidden
→ conversation hidden
→ history 100% modal content width
```

## 7.4 Responsive responsibilities must be split

现有 `max-width: 640px` 同时承担了：

```text
small-viewport modal geometry
font/radius compaction
character stage min-height
Conversation spacing
active-character stacked layout
```

v1.1 禁止把这些职责机械地全部移动到 479px。

必须拆成两类独立响应式规则：

```text
small-viewport density / geometry breakpoint
→ <= 640px

layout-orientation breakpoint
→ <= 479px
```

因此：

```text
viewport > 640px
→ normal shell geometry
→ horizontal 30/70

480px <= viewport <= 640px
→ compact small-viewport shell/font/stage geometry
→ STILL horizontal 30/70

viewport <= 479px
→ compact small-viewport shell/font/stage geometry
→ stacked active-character layout allowed
```

## 7.5 Small-viewport geometry remains at <=640px

v1.1 保留当前小视口中有价值的 compact behavior，独立于 stacked layout：

```text
@media (max-width: 640px)

modal width  = min(94vw, 960px)
modal height = min(82vh, 520px)
modal padding = 16px
modal radius = 14px

PokeMan dialogue font
= 400 16px/1.6 system-ui...

character stage compact min-height
≈ 92px

Conversation/body spacing
→ use the v1.1 compact spacing baseline
```

640×480 必须因此同时得到：

```text
more usable vertical modal area
+
compact typography
+
horizontal 30/70 character/conversation layout
```

不得为了“取消 640px stacked”而把 640×480 回退到 desktop 的较矮 68vh modal、18px font 或 140px stage minimum。

## 7.6 Stacked layout only at <=479px

真正 stacked 的第一版固定：

```css
@media (max-width: 479px) {
  .modal.with-character {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(88px, 30%) minmax(0, 1fr) auto;
    grid-template-areas:
      "characters"
      "conversation"
      "controls";
  }
}
```

同时 stacked mode 必须把 character-host spacing 转成纵向 spacing，例如：

```text
characters padding
→ 0 0 8px
```

并保证：

```text
character-stage min-height <= character grid row effective height
stage does not overflow/crop the conversation
controls remain visible
choice rows remain usable
```

360×480 作为 stacked qualification viewport。

# 8. Visual density / spacing baseline

v1.1 使用统一紧凑 spacing scale：

```text
4 / 8 / 12 / 16
```

第一版固定 baseline：

```text
modal padding                 = 16px
characters padding            = 4px 12px 4px 0
conversation top/left         = 2px / 8px
speaker bottom padding        = 8px
body padding                  = 10px 4px 6px 0
choice list top margin        = 12px
choice row padding            = 8px 12px
controls host top             = 8px
control hints internal top    = 8px
history header bottom         = 8px
history scroll top            = 8px
history entry vertical        = 10px / 12px
```

这些值可以在 implementation PR 中因真实 geometry 做 ±2px 的小调整，但如果超出该范围或重新回到现有宽松密度，需要更新本文，而不是 Agent 自行发散。

## 8.1 Modal geometry

不要求为了“紧凑”大幅缩小 modal。v1.1 主要通过减少内部空白增加有效内容面积。

第一版保持：

```text
width  = min(88vw, 960px)
height = min(68vh, 520px)
```

这样降低 layout 风险，同时修掉真正的 padding 浪费。

# 9. Character stage visual weight

人物 stage 继续存在，但降低“card inside card”感觉。

固定：

```text
stage remains a stable pane
background contrast softer than current
no extra border
radius <= modal radius - 4px
sprite remains centered
```

sprite visual scale 从当前约 55% stage height 提高到：

```text
70% stage height target
acceptable qualification band: 68%–72%
```

同时：

```text
max-width 仍限制在 pane 内
max-height 不得溢出
aspect ratio preserved
image-rendering: pixelated
canvas intrinsic frame remains 32×48 for Professor
```

# 10. Controls visual weight

canonical 五个 hint 继续全部存在，semantic contract 不变。

v1.1 只改视觉：

```text
controls region geometry remains stable
enabled hint readable
disabled hint visually quieter
READY does not collapse controls row
```

disabled opacity 建议：

```text
0.16–0.20
```

不得只因为 disabled 就从 canonical DOM 删除 hint。

不得显示 `Enter` / `ArrowUp` / Gamepad glyph 等 physical binding。

# 11. Accessibility / inert boundary

ACTIVE：

```text
shell visible
view/modal interactive according to existing semantics
```

intermediate READY：

```text
shell visible
view/modal inert
controls aria-disabled reflect canonical facts
Conversation reveal paused
```

History：

```text
shell visible
history is active content
character/conversation layout+a11y hidden
```

initial READY before first ACTIVE：

```text
shell hidden
inert
not exposed as an empty modal
```

Domain close：

```text
view removed
no retained hidden shell outside domain lifetime
```

# 12. Explicit non-goals

本文不实现：

```text
Conversation ↑/↓ text scrolling
RPGDialogue control routing changes
new semantic actions
RPGDialogue public API changes
Frame / Call changes
Render ABI changes
PokeMan gameplay subsystem changes
Dialogue graph / Story changes
physical key hints
pointer/touch gameplay authority
new portrait asset system
```


# 13. Implementation landing

## 13.1 Allowed implementation files

The implementation PR must remain within this allowlist unless a concrete blocker is demonstrated and separately approved.

Production source:

~~~text
examples/PokeMan/presentation/dialogue.browser.js
examples/PokeMan/presentation/dialogue.css
~~~

Focused browser test:

~~~text
examples/PokeMan/test/dialogue-presentation.browser.test.mjs
~~~

Generated FSDB outputs, produced only by the existing sync script:

~~~text
[FSDB]PokeMan/[resource]Presentation/dialogue/dialogue.browser.js.js
[FSDB]PokeMan/[resource]Presentation/dialogue/dialogue.css.css
~~~

Required real-product regression tests:

~~~text
apps/pwa/test/pokeman-map.e2e.test.mjs
apps/pwa/test/pokeman-staging.e2e.test.mjs
~~~

Do not create a second E2E harness. Extend the existing Professor route and staging path.

## 13.2 Source → FSDB synchronization

Source and FSDB Presentation must remain byte-for-byte synchronized through the existing script:

~~~text
examples/PokeMan/scripts/sync-map-presentation.mjs
~~~

Run the script using its repository-defined invocation; do not manually edit generated FSDB files as the source of truth.

## 13.3 Forbidden files / boundaries

The following are forbidden implementation targets for this UX fix:

~~~text
packages/renderer
game-libs/rpg-dialogue Runtime / public API
packages/subsystem
packages/main
common-controls
examples/PokeMan/subsystems/dialogue.mjs
examples/PokeMan/subsystems/map.mjs
Dialogue graph / Story / Content business logic
Frame / Call / Render ABI
~~~

Do not broaden scope to fix unrelated framework behavior. If a reproducible blocker cannot be fixed within the allowed Presentation files and existing test files, stop and report the evidence before changing the design or expanding scope.

# 14. Required browser qualification

`examples/PokeMan/test/dialogue-presentation.browser.test.mjs` 至少新增/修改以下证明。

**现有旧测试：**

```text
READY hides and inerts retained DOM while stopping background reveal
```

必须被替换/重命名为 v1.1 continuity contract；不得保留一个同时要求 intermediate READY hidden 的旧断言，再另外添加相反的新断言。

## 14.1 Initial READY remains hidden

```text
fresh view / fresh connection epoch
five hints complete + all false
shellPresented has never latched
→ modal hidden
→ backdrop hidden
→ view inert
→ Conversation interaction inactive
```

防止 first-connect flash。

## 14.2 Exact state truth table

浏览器测试必须分别证明：

```text
initial READY
→ shell hidden
→ inert
→ Conversation inactive

ACTIVE + CONVERSATION
→ shell visible
→ not inert
→ Conversation active

ACTIVE + HISTORY
→ shell visible
→ not inert
→ Conversation inactive
→ History active/full-width

intermediate READY after ACTIVE
→ shell visible
→ inert
→ Conversation inactive

domain/view removal
→ shell removed
```

## 14.3 ACTIVE → READY continuity

```text
first ACTIVE
→ modal visible

all hints become false
→ modal still visible
→ backdrop still visible
→ view/modal inert
→ Conversation interaction inactive
→ modal rect unchanged
→ character stage rect unchanged
```

并等待至少一个 reveal interval，证明 READY 不后台推进 reveal。

测试应观察 `hidden` attribute/property 的整个 transition，证明中间没有 `true` flash。

## 14.4 READY → next ACTIVE continuity

模拟下一 `conversation-id` / text 更新并重新 enabled controls：

```text
same lr-dialogue-view
same modal HTMLElement
same backdrop HTMLElement
same character element/key when character unchanged
same outer rect
new reveal state resets
shell hidden never becomes true
```

## 14.5 Fresh session re-arms initial hidden

必须建立第二个 fresh view/session：

```text
first session:
ACTIVE → intermediate READY → close/remove

second fresh view/session:
all hints initially false
→ modal hidden again
→ shellPresented=false baseline restored

second ACTIVE
→ shell visible
```

如果测试人工 remove/reappend 同一 element，也要证明 reconnect 按 fresh Presentation connection epoch 重置 latch。

## 14.6 Sprite idempotence covers every trigger

不能只测试重复 `receiveRenderData()`。

同一 exact attempt key 下分别重复：

```text
receiveRenderData(same ref)
receiveRenderContext(same context)
setPresentationActive(true)
active="true" resynchronization / syncActiveToView()
```

都必须证明：

```text
resource acquisition count remains 1
loading request is not aborted/restarted
ready canvas remains visible
fallback does not reappear
```

另外必须证明：

```text
contentVersion/ref change
→ new acquisition

context identity change
→ new acquisition

disconnect/reconnect
→ new connection epoch + new acquisition

same attempt previously failed to fallback
+ ordinary repeated reconciliation
→ no automatic retry
```

## 14.7 Layout geometry and responsive split

至少验证：

```text
1280×720
→ horizontal ~30/70
→ normal shell geometry

800×600
→ horizontal ~30/70
→ normal shell geometry

640×480
→ horizontal ~30/70
→ compact <=640 shell geometry/font/stage rules still active

360×480
→ stacked
→ compact <=640 rules still active
```

不能只断言 `gridTemplateColumns`。

还必须检查：

```text
modal is inside viewport
modal height/width follows the correct responsive branch
character stage stays inside its grid area
Conversation has positive usable height
choice rows are not clipped
controls remain visible
no active character → single full-width Conversation
History → full-width History
```

## 14.8 Density

对 computed geometry 做稳定断言，而不是 screenshot-only：

```text
modal padding ≈ 16px
character/content effective gap substantially below old ~38px
body / controls padding match compact baseline
Professor sprite rendered height / stage height within 0.68–0.72
```


# 15. Product E2E qualification — REQUIRED

Real PWA continuity is a required acceptance gate, not a recommendation. The original defect was observed in the actual product path, so browser-component tests alone are insufficient.

## 15.1 Required Professor A → B → C continuity observation

MUST extend the existing test in:

~~~text
apps/pwa/test/pokeman-map.e2e.test.mjs
~~~

On the real Professor route:

~~~text
open A
→ install observer on lr-dialogue-view modal/backdrop hidden state
→ complete A
→ wait for B
→ assert no hidden=true transition

choose ready / not-yet
→ complete B
→ wait for C
→ assert no hidden=true transition

complete/cancel final C
→ Dialogue element/domain finally disappears
~~~

Observe the full transition history, not only the final visible state. A test that checks only “modal is visible after B” does not satisfy this requirement.

## 15.2 Required staging regression

MUST retain or extend at least one real Dialogue continuity path in:

~~~text
apps/pwa/test/pokeman-staging.e2e.test.mjs
~~~

It must qualify the real staging build and assert that:

~~~text
same lr-map-view stays mounted
Dialogue still overlays Map
History full-width behavior unchanged
second interaction creates a fresh Dialogue session
fresh session initial READY is hidden
ACTIVE → intermediate READY → ACTIVE does not hide the shell
~~~

Do not substitute a unit-only or component-only test for the staging regression, and do not create a separate harness.

## 15.3 Failure handling

If the current E2E path cannot deterministically reach A → B → C, the implementation PR must report the exact blocker and evidence. Do not silently downgrade the required assertion to optional or remove the acceptance criterion.

# 16. Required commands

实现后至少运行：

```text
npm test -w @loomrealm-example/pokeman
npm run test:rpg-dialogue
npm run build:qualification -w @loomrealm/pwa
npm run test:unit -w @loomrealm/pwa
node apps/pwa/scripts/run-e2e.mjs m17
npm run build:staging -w @loomrealm/pwa
node apps/pwa/scripts/run-e2e.mjs staging
```

如果实现时仓库脚本已变化，使用当前真实等价命令并在 PR 中报告 exact command；不得引用不存在的 script。


# 17. Exit criteria

```text
[ ] #118 的 continuity/layout/density/sprite-continuity scope 全部覆盖
[ ] initial READY still hidden
[ ] first ACTIVE opens shell once
[ ] shell visibility and interaction readiness are separate private facts
[ ] A→READY does not hide modal/backdrop
[ ] READY remains inert
[ ] READY ignores Conversation interaction events
[ ] READY does not advance reveal in background
[ ] ACTIVE History keeps shell interactive while Conversation is inactive
[ ] READY→B keeps same shell geometry
[ ] B→READY→C keeps same shell geometry
[ ] final domain close removes Dialogue shell
[ ] second fresh session re-arms initial hidden state
[ ] disconnect/reconnect defensively resets Presentation latch
[ ] sprite loading uses one idempotent coordinator across all trigger paths
[ ] same sprite attempt key does not reload/fallback flash
[ ] same failed sprite attempt does not auto-retry on ordinary reconciliation
[ ] ref/context/reconnect changes create a new sprite acquisition opportunity
[ ] <=640 compact shell/font/stage rules remain independent of layout orientation
[ ] 1280×720 horizontal ~30/70
[ ] 800×600 horizontal ~30/70
[ ] 640×480 horizontal ~30/70 with compact <=640 geometry
[ ] 360×480 stacked with compact <=640 geometry
[ ] stacked character stage does not overflow/crop content
[ ] no active character remains full-width Conversation
[ ] History remains full width
[ ] compact spacing baseline landed
[ ] character/content gap substantially reduced
[ ] Professor sprite stage ratio 68–72%
[ ] semantic control hints unchanged
[ ] reveal/choice/history behavior unchanged
[ ] old READY-hidden browser assertion is replaced, not left contradictory
[ ] source/FSDB Presentation exact sync preserved
[ ] packages/renderer remains unchanged
[ ] no RPGDialogue Runtime/public API change
[ ] no Frame/Render ABI change
[ ] no PokeMan gameplay subsystem change
[ ] focused browser qualification passes
[ ] required real PWA Professor A→B→C hidden-transition observer passes
[ ] required staging Dialogue continuity regression passes
```

# 18. What this proves

完成后，PokeMan Dialogue Presentation 将证明：

```text
one Dialogue session
→ one visually continuous shell
→ stable character pane
→ atomic Conversation changes
→ compact game-oriented layout
→ no READY flash
```

同时保持：

```text
Runtime lifecycle authority unchanged
canonical Presentation ABI unchanged
gameplay child-Frame architecture unchanged
History / Choice / Reveal semantics unchanged
```

这是一项 Presentation UX contract 修正，不是 Dialogue Runtime v2。
