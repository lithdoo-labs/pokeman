# 统一操控输入 Web Component

> 状态：**Active / Normative / Frozen / Implemented**
> 位置：`game-libs/game-common-controls/game-controls-input.md`
> 所属包：`@loomrealm-game/common-controls`
> 发送路径：[emitCustomEvent 扩展](./emit-custom-event.md)、[Web Presentation API v3](../../doc/15-contracts/web-presentation-api-v3.md)、[Frame-targeted Presentation Event v1](../../doc/15-contracts/frame-targeted-presentation-event-v1.md)
> 相邻实现：[设备输入 Web Components](./device-input-components.md)、[Game Common Controls Input v1](../../doc/15-contracts/game-common-controls-input-v1.md)

本文定义业务 Web Component：把键盘和手柄收成同一套数字按键，再以一对 Frame-targeted Presentation 频道发给当前 Top Active Frame。现行六个设备频道保持不变。本文不改写已冻结的 Game Common Controls Input v1。

## 1. 组件

~~~html
<game-controls-input></game-controls-input>
~~~

它是普通业务 Custom Element，挂载路径与现有设备组件相同：

~~~text
Subsystem RenderDomain
    -> RenderNode
    -> WebProjector
    -> game-controls-input
    -> WebPresentationContext.emitCustomEvent
~~~

游戏自己决定是否把这个节点放进 RenderDomain。框架不默认创建它。Pointer 仍由 `game-pointer-input` 单独采集，不进入这里。

同一 Window 里只允许一个活动的 `game-controls-input`。后挂上的重复实例设置 `data-input-disabled="duplicate"`，不采集、不发送。先挂的实例断开后，后来的实例可以重新挂载并开始采集。

组件内部自己监听键盘、自己轮询手柄。它不挂载 `game-keyboard-input` 或 `game-gamepad-input`，也不把采集结果转发到 `keyboard.*` 或 `gamepad.*`。同一 Window 上如果再挂那两个原始设备组件，同一下物理输入会进入两套频道；这个互斥由游戏的 RenderDomain 保证。

推荐把这些组件理解为两层不同抽象，而不是四个都应默认挂载的输入源：

~~~text
普通数字操控
    -> game-controls-input
    -> controls.state / controls.event

需要原始键盘 code
    -> game-keyboard-input
    -> keyboard.*

需要原始手柄 id / 摇杆 / 压力
    -> game-gamepad-input
    -> gamepad.*

需要坐标或 Pointer identity
    -> game-pointer-input
    -> pointer.*
~~~

`game-controls-input` 可以与 Pointer 同时使用。只有业务明确需要两套语义时，才同时挂载 `game-controls-input` 与原始 Keyboard/Gamepad 组件；否则同一次物理操作会分别进入统一频道和原始频道，消费方若同时监听两边就会得到两份逻辑输入。这属于游戏 composition 责任，Framework 不额外建立互斥 authority。

## 2. 对外只有一套按键

对外词汇是手柄按键。键盘是这套按键的别名，订阅者看不到 `KeyboardCode`、手柄序号、轴值或压力。

v1 只承认这 14 个按键。名字表示它在 standard mapping 上的位置，规范顺序固定为：

~~~text
up down left right
south east west north
leftBumper rightBumper leftTrigger rightTrigger
start select
~~~

右侧四个面键按菱形位置命名，肩键和扳机按上下位置命名。A/B/X/Y、L1/L2 以及各厂商丝印只出现在下表的对照列里，不进入载荷。键盘一键对应一键。

| 统一按键 | 位置 | 常见丝印 | 键盘 | standard 下标 |
| --- | --- | --- | --- | --- |
| `up` | 十字键上 | — | `↑` `ArrowUp` | 12 |
| `down` | 十字键下 | — | `↓` `ArrowDown` | 13 |
| `left` | 十字键左 | — | `←` `ArrowLeft` | 14 |
| `right` | 十字键右 | — | `→` `ArrowRight` | 15 |
| `south` | 右侧菱形下 | Xbox A、任天堂 B、PS × | `Z` `KeyZ` | 0 |
| `east` | 右侧菱形右 | Xbox B、任天堂 A、PS ○ | `X` `KeyX` | 1 |
| `west` | 右侧菱形左 | Xbox X、任天堂 Y、PS □ | `C` `KeyC` | 2 |
| `north` | 右侧菱形上 | Xbox Y、任天堂 X、PS △ | `V` `KeyV` | 3 |
| `leftBumper` | 左上方肩键 | LB、L、L1 | `Q` `KeyQ` | 4 |
| `rightBumper` | 右上方肩键 | RB、R、R1 | `E` `KeyE` | 5 |
| `leftTrigger` | 左下方扳机 | LT、ZL、L2 | 左 `Shift` `ShiftLeft` | 6 |
| `rightTrigger` | 右下方扳机 | RT、ZR、R2 | 左 `Ctrl` `ControlLeft` | 7 |
| `start` | 开始 | Start、Menu、+ | `Enter` | 9 |
| `select` | 选择 | Back、Select、− | `Tab` | 8 |

左右摇杆、摇杆按下和 Home 不在这套词汇里。摇杆推到尽头也不产生 `up` / `down` / `left` / `right`。方向只来自十字键，以及上表的键盘列。

### 2.1 公开 ABI

实现必须在 `@loomrealm-game/common-controls` 根导出下面这些名字；这是 v1 的公开形状，不由实现者另起别名：

~~~ts
export const CONTROLS_INPUT_CHANNELS = Object.freeze([
  "controls.state",
  "controls.event",
] as const);
export type ControlsInputChannel = typeof CONTROLS_INPUT_CHANNELS[number];

export const CONTROLS_BUTTONS_V1 = Object.freeze([
  "up", "down", "left", "right",
  "south", "east", "west", "north",
  "leftBumper", "rightBumper", "leftTrigger", "rightTrigger",
  "start", "select",
] as const);
export type ControlsButtonV1 = typeof CONTROLS_BUTTONS_V1[number];

export interface ControlsStatePayloadV1 extends JsonObject {
  readonly down: readonly ControlsButtonV1[];
}

export interface ControlsEventPayloadV1 extends JsonObject {
  readonly action: "down" | "up";
  readonly button: ControlsButtonV1;
  readonly repeat: boolean;
}

export const EMPTY_CONTROLS_STATE_V1: ControlsStatePayloadV1;
export const CONTROLS_STATE_REFRESH_MS = 1_000;
export const CONTROLS_STATE_STALE_MS = 2_500;

export interface FreshControlsStateTracker {
  accept(payload: ControlsStatePayloadV1): void;
  close(): void;
}

export function createFreshControlsStateTracker(
  deliver: (payload: ControlsStatePayloadV1) => void,
  options?: { readonly staleAfterMs?: number },
): FreshControlsStateTracker;
~~~

`EMPTY_CONTROLS_STATE_V1` 的值固定为冻结的 `{ down: [] }`；fresh tracker 默认 2500ms 无新 State 时向 consumer 交付该 empty State。

现有 `DEVICE_INPUT_CHANNELS` 继续**恰好只有六个** `keyboard.* / pointer.* / gamepad.*` 频道；不得把 `controls.*` 塞进去。现有 `createFreshDeviceStateTracker` 也保持原签名，`controls.state` 使用上面的独立 `createFreshControlsStateTracker`。这样 raw device contract 与 unified controls contract 不互相扩张。

## 3. 手柄采集

只读取 `mapping === "standard"` 的手柄，沿用现有手柄源的轮询方式：`requestAnimationFrame` 加上 `navigator.getGamepads()`。按下阈值是 `500_000`，和现有 `gamepad.event` 的越阈一致。`leftTrigger` / `rightTrigger` 在硬件上常常是模拟扳机，这里越过阈值之后只当作数字键，载荷里不保留压力。

面键和肩键的名字与现有 `GamepadButtonNameV1` 相同，下标见第 2 节。下标 10、11、16（左右摇杆按下、Home）以及四根轴只在本地丢掉。非 standard mapping 的手柄整只忽略。

v1 是一名本地玩家。所有已连接的 standard 手柄先按按键做 OR，再进入第 5 节的合并。订阅者看不到 `gamepadId`。某一只手柄中途接入时，已经按住的支持键进入 State，不为它们补 `down` Event；这与现有手柄源的 baseline 相同。

## 4. 键盘捕获

键盘只接受第 2 节那 14 个 `code`，并且必须是 `isTrusted` 的 `keydown` / `keyup`。一颗统一按键只对应一个键，表以外的键忽略。对应关系在 v1 写死，组件不读取属性或配置。

键盘侧维护一个本地的 capture availability；它不是 Framework authority，也不进入线协议：

~~~text
windowUsable
    = document.visibilityState === "visible"
      && document.hasFocus()

keyboardCaptureAvailable
    = windowUsable
      && 当前焦点不属于浏览器交互区域
~~~

v1 的浏览器交互区域使用**封闭集合**，不允许实现者自行扩大。先从 `document.activeElement` 开始，沿 open Shadow Root 的 `shadowRoot.activeElement` 向内找到 deepest active element；再从该元素沿 composed ancestor 向外检查。composed ancestor 的下一跳是 `parentElement`，没有 `parentElement` 且 root 是 `ShadowRoot` 时跳到 `root.host`。

只要 deepest active element 或其 composed ancestor 满足下面任一条件，Keyboard capture 就是 unavailable：

~~~text
HTMLInputElement
HTMLTextAreaElement
HTMLSelectElement
HTMLButtonElement
HTMLAnchorElement 且带 href 属性
HTMLElement.isContentEditable === true
~~~

v1 **不因为**任意 `tabindex`、ARIA `role` 或普通自定义元素而额外 blocked；以后如要扩展必须改契约。

availability 的重算时机也固定：

~~~text
start                         -> 立即 reconcile
document focusin              -> 同步 reconcile
document focusout             -> queueMicrotask(reconcile)
Window focus / blur           -> 同步 reconcile
document visibilitychange     -> 同步 reconcile
~~~

`focusout` 延迟一个 microtask 是为了让 `document.activeElement` 先稳定到新的目标。

capture 状态转换定义为：

~~~text
available -> unavailable
    清空全部 keyboard held
    重新计算 effective controls
    effective 若变化，只发送新的 controls.state
    不为被清掉的按键补 controls.event up

unavailable -> available
    keyboard held 从 empty 开始
    不主动查询物理键盘，也不补 down Event
~~~

capture unavailable 时，映射键完全交给浏览器：组件不改变 keyboard held、不发送 controls、不调用 `preventDefault()`。这只屏蔽 Keyboard；Gamepad 仍按第 3 节采集。

capture available 时，任何 trusted、mapped 的 `keydown` 都属于游戏 controls；若 `event.cancelable`，先调用 `preventDefault()`，不让方向键、`Tab` 等同时触发浏览器默认行为。未映射按键完全交给浏览器。mapped `keyup` 只处理本地已经 held 的键，不依赖 `preventDefault()`。

键盘状态机固定为：

~~~text
keydown，keyboardDown=false
    -> keyboardDown=true
    -> 忽略 DOM event.repeat，逻辑上视为新的按下
    -> 若 effective false->true：先 State，再 down Event repeat=false
    -> 若 effective 本来已因 Gamepad=true：不发 State/Event

keydown，keyboardDown=true
    -> 只有 DOM event.repeat=true 且 gamepadDown=false 时
       发送 down Event repeat=true
    -> 其他情况忽略

keyup，keyboardDown=true
    -> keyboardDown=false
    -> 若 effective true->false：先 State，再 up Event repeat=false
    -> 若 Gamepad 仍按住：不发 State/Event

keyup，keyboardDown=false
    -> 忽略
~~~

因此 capture 丢失后即使物理键仍按着，焦点回到游戏后收到的第一个 repeat-keydown 也会重新建立本地 held，并在需要时作为新的 `repeat=false` 逻辑按下；不会因为浏览器的 repeat 标志留下灰区。

手柄轮询不制造 `repeat`；`repeat:true` 只来自上面的 Keyboard held-repeat 分支。

## 5. 有效状态机

原始 Keyboard/Gamepad 组件暴露设备事实；本组件只暴露统一的数字 controls。Pointer 保持独立。

`controls.state` 对外只有一份数字集合：

~~~ts
{ down: readonly ControlsButtonV1[] }
~~~

`down` 里的名字仍然是第 2 节的位置名，用来区分 14 颗键。快照里不放来源设备、`gamepadId`、摇杆轴、压力或指针坐标。组件内部可以记两份布尔值，它们不进入载荷。

每一颗键的有效值是两边的或：

~~~text
effective = keyboardDown || gamepadDown
~~~

一边按下、另一边没按，这颗键就在 `down` 里。只有两边都松开，它才离开 `down`。手柄没按并不否决键盘；键盘没按也不否决手柄。不同的键各自计算，所以手柄按住 `up`、键盘按住 `south` 时，State 是 `["up", "south"]`。上下或左右同时按下都保留，不做对向抵消。

| 键盘 | 手柄 | 这颗键在 `down` 中 |
| --- | --- | --- |
| 松开 | 松开 | 否 |
| 按下 | 松开 | 是 |
| 松开 | 按下 | 是 |
| 按下 | 按下 | 是，只出现一次 |

State 在 effective 集合发生变化时重发整份 `down`，顺序始终是第 2 节。effective 没变就不发 State，但第 7 节的 Window 可用性切换除外：usable 与 unusable 互切时，即使 `down` 与上一份相同，也发送当前 `controls.state`。非空 State 每 1000ms 刷新同一份 effective 集合。

Event 不等于“所有 effective 变化”。v1 把变化来源分成两类：

~~~text
physical edge
    accepted Keyboard keydown / keyup
    已跟踪 standard Gamepad 的阈值 crossing
    live polling 中 standard Gamepad 消失造成的释放

reconciliation / baseline
    组件启动时的初始状态
    新接入 Gamepad 的首次 baseline
    Window usable -> unusable
    Window unusable -> usable 后的 Gamepad rescan
    Keyboard capture available -> unavailable
    Keyboard capture unavailable -> available
~~~

规则固定为：

~~~text
physical edge 造成 effective 改变
    -> 先发送一份完整 State
    -> 再发送对应 down/up Event

reconciliation / baseline 造成 effective 改变
    -> 只发送 State
    -> 不合成 down/up Event

Window usable <-> unusable
    -> 无论 effective 是否改变，都发送当前 State
    -> 不合成 down/up Event

Keyboard repeat
    -> 只发送 repeat=true 的 down Event
    -> 不发送 State
~~~

Gamepad 一次 animation-frame 采样可能同时改变多个设备/按键。实现先应用整批采样并按所有 standard Gamepad 做 OR，得到新的 effective 集合；若有 effective 改变，只发送**一份**完整 State，然后按第 2 节 `CONTROLS_BUTTONS_V1` 的规范顺序发送真正发生的 effective edge Event。某一只手柄松开或断开，但另一只手柄/Keyboard 仍按着同一统一按键时，不产生该按键的 Event。

新接入的 standard Gamepad 即使已经按住支持键，也只通过 baseline 进入 State，不补 `down` Event。运行中的已跟踪 Gamepad 从系统消失属于 physical edge；只有因此使某个 effective button 从 true 变 false 时才产生对应 `up` Event。

例子：

~~~text
KeyZ down
    state [south]
    event down south repeat=false

Gamepad south down
    effective 仍为 true
    不发

KeyZ up
    Gamepad 仍按着 south
    不发

Gamepad south up / 该已跟踪 Gamepad 断开
    state []
    event up south repeat=false

窗口失焦 / capture 进入 input
    若因此 effective 改变
    只发 State
    不补 up Event
~~~

## 6. 发送

组件拥有一对精确频道，用 `emitCustomEvent(..., { broadcast: "top-frame" })` 投递给接受时的 Top Active Frame。physical edge 按第 5 节保持 State-before-Event；reconciliation/baseline 只发 State。指针不进入这里，也不转发 `keyboard.*` 或 `gamepad.*`。

~~~text
controls.state
controls.event
~~~

~~~ts
context.emitCustomEvent(
  "input.state",
  { down },
  { broadcast: "top-frame", channel: "controls.state" },
);

context.emitCustomEvent(
  "input.event",
  { action, button, repeat },
  { broadcast: "top-frame", channel: "controls.event" },
);
~~~

| 频道 | 事件名 | data | 何时发送 |
| --- | --- | --- | --- |
| `controls.state` | `input.state` | `{ down: readonly ControlsButtonV1[] }` | 有效集合变化（含 keyboard capture loss）；Window 不可用时发 neutral；重新可用时发当前快照；非空时每 1000ms 再发同一份 |
| `controls.event` | `input.event` | `{ action: "down" \| "up"; button: ControlsButtonV1; repeat: boolean }` | physical edge 使 effective 改变；或 Keyboard 已 held 时产生允许的 `repeat:true` |

`down` 按第 2 节的规范顺序排列，同一按键只出现一次。空 State 是 `{ down: [] }`。`button` 使用同一套位置名。`domainId`、`targetKey` 和 source 仍由 Framework 按当前 live RenderNode 填写。组件必须带上 `options.channel`，避免落到 `x.loomrealm.web-presentation.event`。

到达目标 Frame listener 后：

~~~text
PresentationFrameEvent.channel = controls.state | controls.event
PresentationFrameEvent.name    = input.state | input.event
PresentationFrameEvent.data    = business data
PresentationFrameEvent.source  = { subsystemKey, domainId, targetKey }
~~~

订阅者按 `channel` 区分 State 和 Event。`input.state` / `input.event` 只说明这是整份状态还是一次边沿。

非空 State 的 1000ms 刷新重复当前 `down`，不重复 Event。变为空 State 时立即发送并停止刷新。订阅侧使用 `createFreshControlsStateTracker`；2500ms 没有新的 `controls.state` 时本地退回 `EMPTY_CONTROLS_STATE_V1`。Event 不刷新、不重放。

### 6.1 Activation 边界

State 和 Event 在 Frame 切换时承担不同职责：

~~~text
controls.state
    = “现在仍然按着什么”
    可以在后续刷新中被新的 Top Active Frame 重新观察到

controls.event
    = “刚刚发生了一次按下 / 松开”
    只属于接受该 Event 时绑定的 exact Frame + Activation
    不跨 Activation 继承、不重定向、不重放
~~~

新的 Activation 在业务本地必须先从 neutral `{ down: [] }` 开始，不能把旧 Activation 缓存的 held 状态直接带进来。如果玩家在 Frame 切换后仍然真实按着某颗键，后续 `controls.state` 刷新可以让新 Activation 再次观察到这份“当前事实”；这不是旧 State replay，而是一条在新 Top Frame lease 下重新接受的新 State publication。

因此持续行为应以 State 为依据，例如移动或 held modifier；一次性行为应以 Event 为依据，例如 confirm、cancel、menu。业务不能把旧 Activation 记录的 `down` Event 当成新 Activation 的首个输入。

### 6.2 Interest 建立窗口

`broadcast: "top-frame"` 完全服从 Frame-targeted Presentation Event v1：exact Interest 尚未建立时 Event fail closed；不缓存、不补投、不重放；State 可以通过后续 publication 恢复当前 held fact。

本组件不定义 presentation readiness，也不引入 Interest-ready ACK。业务应在 Frame activation 开始时尽早创建 listener；如果未来某类 UI 要求切换瞬间的首个 tap 也保证必达，应另行设计 readiness，而不是给 controls 增加 replay。

失焦、页面隐藏和组件卸下时的收尾见第 7 节。窗口仍可用而手柄断开，使某颗键的有效值从有到无时，按本节先发 State，再按规范顺序发 `up`。

本组件不发送：

~~~text
keyboard.*  gamepad.*  pointer.*
cancel、指针移动、摇杆轴、按键压力、gamepadId
input.reset、input.availability
~~~

## 7. 可用性与断开

Window 可用性是 `document.visibilityState === "visible" && document.hasFocus()`。它控制 Keyboard 和 Gamepad 的共同采集生命周期；第 4 节的 keyboard capture availability 在此基础上只进一步约束 Keyboard。

~~~text
Window 变为不可用
    清空 keyboard held 和 gamepad 本地表
    重新计算 effective controls
    发送当前 controls.state；即使 down 与上一份相同，通常为 { down: [] }
    不为被清掉的按键补 up Event

Window 重新可用
    keyboard held 从 empty 开始
    重扫 standard gamepad
    已经按下的支持键只进入 State，不补 down Event
    发送当前 controls.state；即使 down 与上一份相同，包括 { down: [] }
    继续轮询

Keyboard capture available -> unavailable
    只清 keyboard held
    gamepad 本地表保持
    重新计算 effective controls
    effective 若变化只发 State，不补 up Event

Keyboard capture unavailable -> available
    keyboard held 保持 empty
    不补 down Event

disconnectedCallback / stop
    先停止监听、轮询和刷新
    释放本 Window 的 controls 占用
    不补空 State，也不补 up Event
~~~

手柄从系统里断开，属于一次采样变化：受影响的有效键若从按下变为松开，先发新 State，再按规范顺序发 `up`。

## 8. 订阅

~~~ts
// 在本次 Frame activation 开始时尽早建立 listener。
const listener = scope.presentationEvents.createListener({
  frame,
  channels: ["controls.state", "controls.event"],
});

const unsubscribeState = listener.on("controls.state", (event) => {
    const data = event.data;
    if (event.name === "input.state") {
      // data.down
    }
});

const unsubscribeEvent = listener.on("controls.event", (event) => {
    const data = event.data;
    if (event.name === "input.event") {
      // data.action, data.button, data.repeat
    }
});

// Frame teardown also closes its listeners automatically.
unsubscribeState();
unsubscribeEvent();
listener.close();
~~~

只关心边沿的调用方可以只订阅 `controls.event`。需要在迟到订阅或刷新中断后回到空档的调用方，同时订阅 `controls.state`，并把 State 交给 fresh-state tracker。

每次新的 Frame Activation 都必须重新建立自己的 listener 和本地消费状态；旧 Activation 的 listener 随 Frame teardown 关闭。消费方的 held/down 缓存从 neutral 开始，随后只接受该 Activation 实际收到的 `controls.state`。

## 9. 实现落点

实现范围固定在 `@loomrealm-game/common-controls`，仍打进现有 `./browser/device-input.browser.js`，加载这一份浏览器脚本会注册第四个元素 `game-controls-input`。不新增第二个 browser bundle。

必须完成这些源码层变化：

~~~text
src/model.ts
    增加 §2.1 的 controls public ABI

src/fresh-state.ts
    增加 createFreshControlsStateTracker
    不改变 createFreshDeviceStateTracker 的既有六频道语义

src/controls-machine.ts
    内部纯状态机；不从 `@loomrealm-game/common-controls` 根导出

browser/controls-source.ts
    DOM focus、Keyboard 与 Gamepad sampling adapter；有效状态只交给 controls-machine

browser/device-input.browser.ts
    PresentationContext.broadcast 扩展为 boolean | "top-frame"
    注册 game-controls-input
    duplicate registry 使用独立 key "controls"
    controls publication 使用 broadcast: "top-frame"

scripts/build-browser.mjs
    collision banner 加入 game-controls-input
~~~

现有 `browser/keyboard-source.ts`、`gamepad-source.ts`、`pointer-source.ts` 是已实现的 raw device 行为，**不得为了 unified controls 改写其对外语义**。`controls-source.ts` 只负责浏览器采集，并把变化交给 `controls-machine.ts`。capture 判定留在 adapter；effective、reason 分类和多 Gamepad OR 只有 reducer 一份。adapter 不能把 raw source 的 `keyboard.* / gamepad.*` 输出再转发。

`game-controls-input` 不进入 Main，不读取或指定 Frame/Activation，不发送 `input.reset`。Renderer 从 current Control v2 stack 派生 Top Frame lease；Subsystem listener 显式绑定业务持有的真实 `Frame` object。

## 10. Qualification 重点

实现完成必须至少覆盖下面这些边界用例；这些不是建议，而是 acceptance criteria：

- 根导出精确包含 §2.1 的公开符号；`DEVICE_INPUT_CHANNELS` 仍严格等于原六频道，`createFreshDeviceStateTracker` 原行为不变。
- Keyboard/Gamepad 同时按住同一统一按键，只产生一个 effective `down`；任一侧先松开不产生 `up`，最后一侧松开才产生 `up`。
- 新 Gamepad baseline 已按住的键只进入 State；已跟踪 Gamepad 运行中断开导致最后一份有效按住消失时，先 State 再按规范顺序发 `up`。
- Window unusable、Gamepad rescan baseline、Keyboard capture loss/regain 都属于 reconciliation：可以修正 State，但绝不合成 down/up Event。
- Window usable 与 unusable 互切时，即使 effective 仍是 `{ down: [] }`，也发送当前 `controls.state`，且不合成 Event。这次空 State 不启动 1000ms refresh。
- 游戏区按住映射键后把焦点移入 blocked focus target：capture loss 立即清 keyboard held，只按 effective 变化发 State；随后在控件中的 keyup 不得造成卡键。
- blocked focus target 的判定严格按 §4 的封闭集合和 deep-active/composed-ancestor 算法；普通 `tabindex` 或 ARIA role 不得自行扩大 blocked 集合。
- capture unavailable 时 mapped 键保持浏览器原生行为；capture available 时 trusted mapped keydown 在可取消时 `preventDefault()`。
- capture loss 后物理键持续按住，重新 available 后收到的第一个 mapped repeat-keydown 在本地未 held 时必须按新的 `repeat=false` logical down 处理。
- Frame 切换时旧 Activation Event 不进入新 Activation；持续 held 可以通过新的 State publication 被新 Activation 重新观察。
- exact Interest 尚未建立时 Event fail closed，不缓存、不重放、不改投后来的 Frame。
- 非空 State 1000ms refresh、`createFreshControlsStateTracker` 默认 2500ms fallback、empty State 停止 refresh、component `disconnectedCallback / stop` 不补消息都成立。
- `game-controls-input` 与 raw Keyboard/Gamepad 组件同时挂载时，两套频道独立；Framework 不去重。
- browser bundle 的 collision guard 包含第四个 tag，且现有三个 raw device 组件回归测试保持通过。

仓库级落地新增 `test/game-controls-input-v1/qualification.test.mjs`，并新增 root script `test:game-controls-input:qualification`。该 script 至少执行：

~~~text
npm run build:game-common-controls-input
npm test -w @loomrealm-game/common-controls
node --test test/game-controls-input-v1/qualification.test.mjs
npm run test:frame-targeted-presentation:qualification
npm run docs:check-links
npm run docs:build
~~~

`test:game-controls-input:qualification` 是本组件的精确门禁，至少执行上面的命令。

`test:game-common-controls-input:qualification` 是产品兼容门禁。同一次执行覆盖 build、`test:game-common-controls-input:qualification:run`（common-controls、Hub/Presentation、Map、Dialogue、Schema Form）、`test/game-controls-input-v1/qualification.test.mjs`、Desktop、PWA M17、frame-targeted 与文档门禁。它不调用精确门禁脚本，避免两条 pipeline 嵌套后漂移。

`npm run test:regression` 单独覆盖 framework 包回归，不并进上述两条脚本。

只有上述 acceptance criteria 和命令全部通过，才把本文状态从 `Draft / Freeze candidate` 改为 `Active / Normative / Frozen / Implemented`。该条件已经满足，记录见第 12 节。`Frozen != Implemented != Qualified`：本文状态停在 Implemented；qualification 证据单独记录，不把本文改写成 Qualified。

## 11. v1 不做的事

- 不读取左右摇杆，也不提供摇杆死区、八向量化或摇杆按下。
- 不输出模拟量、手柄 id、原始 `code` 或设备来源。
- 不合并 Pointer。
- 不按游戏改键盘表，也不在载荷里提供厂商丝印别名。
- 不把多名玩家拆成多套频道。
- 不替换现有 `game-keyboard-input`、`game-pointer-input`、`game-gamepad-input`。

## 12. 实现与 qualification subject

qualified implementation subject：`2333fea8`（`2333fea85e353dd9a0f247d41d8112dc3fa2e048`）

这个 SHA 是实际执行 qualification 的 executable subject。其后的文档 commit 只更新证据，不改变该 subject。

实现位置：

~~~text
src/model.ts
    CONTROLS_INPUT_CHANNELS、14 键、EMPTY_CONTROLS_STATE_V1、1000/2500 常量
src/fresh-state.ts
    createFreshControlsStateTracker
src/controls-machine.ts
    Keyboard / Gamepad effective reducer；不是包的 public ABI
browser/controls-source.ts
    DOM capture、preventDefault、Gamepad polling adapter
browser/device-input.browser.ts
    <game-controls-input>、duplicate key "controls"、broadcast: "top-frame"
scripts/build-browser.mjs
    collision banner 包含 game-controls-input
test/game-controls-input-v1/qualification.test.mjs
    仓库级 qualification
~~~

执行命令、环境、Hostra pin 和实际通过数量见 [qualification evidence](../../doc/30-implementation/game-controls-input-qualification.md)。本文不记录 Qualified 状态。
