# 设备输入 Web Components

> 状态：**Implemented / Qualified（2026-10-21）**
> 位置：`game-libs/game-common-controls/device-input-components.md`  
> 调用形状：[emitCustomEvent 扩展](./emit-custom-event.md)  
> 设备语义来源：[User Input v1](../../doc/15-contracts/user-input-v1.md) 中的 Keyboard / Pointer / Gamepad 规范载荷，以及迁移前 [browser-input-source.ts](../../packages/renderer/src/browser-input-source.ts) 的采集行为  
> 现行契约：[Game Common Controls Input v1](../../doc/15-contracts/game-common-controls-input-v1.md)、[Web Presentation API v3](../../doc/15-contracts/web-presentation-api-v3.md)、[Session Events v1](../../doc/15-contracts/session-events-v1.md)

本文只定义三个设备 Web Component 如何按 [emitCustomEvent 扩展](./emit-custom-event.md) 生产用户输入。框架输入层的删除范围不在这里重复。本文不修改已冻结契约，也不修改同目录既有设计文档。

## 1. 三个组件

~~~html
<game-keyboard-input></game-keyboard-input>
<game-pointer-input></game-pointer-input>
<game-gamepad-input></game-gamepad-input>
~~~

三者彼此独立。业务可以只挂载其中一个，也可以同时挂载多个。LoomRealm 不内建 GlobalInput Subsystem，也不默认创建这些组件。由游戏的 RenderDomain 决定挂载哪些，以及由哪个 Subsystem 持有对应 RenderNode。

一个 Renderer Window 的同一输入 ownership scope 里，每种设备默认最多一个实例。重复挂载同类型组件必须拒绝、禁用或显式隔离，不能静默发出两份物理事件。

每个组件自己拥有物理当前状态、DOM listener 或轮询、设备本地 id，以及非空 State 的刷新计时器。某个组件断开时只卸下自己的 listener 并清空自己的本地表，不额外补发空 State。这与现有 source 的 `stop()` 相同：它先停止发送，再清表。失焦或表面失效仍走下面的 `leaveUsable`，那一步会发送空 State。不影响另外两个组件。

组件仍是普通业务 Custom Element：

~~~text
Subsystem RenderDomain
    -> RenderNode
    -> WebProjector
    -> device Web Component
    -> WebPresentationContext.emitCustomEvent
~~~

采集实现从现有 `createBrowserRendererInputSource` 按设备机械拆出，再包进组件。不要先重写三套采样算法。

## 2. 发送形状

设备事件始终显式传入 `broadcast: true` 和对应的标准通道。`data` 就是该通道的 User Input v1 载荷，不再包一层 `{ channel, payload }`。

~~~ts
context.emitCustomEvent(
  "input.state" | "input.event",
  payload,
  { broadcast: true, channel },
);
~~~

三个组件共用这一适配：

~~~ts
function emitDeviceInput(
  context: WebPresentationContext,
  change: DeviceInputChange,
): void {
  context.emitCustomEvent(
    change.kind === "state" ? "input.state" : "input.event",
    change.payload,
    { broadcast: true, channel: change.channel },
  );
}

type DeviceInputChange =
  | { kind: "state"; channel: "keyboard.state" | "pointer.state" | "gamepad.state"; payload: JsonObject }
  | { kind: "event"; channel: "keyboard.event" | "pointer.event" | "gamepad.event"; payload: JsonObject };
~~~

因此到达 Session Events 的逻辑事件是：

~~~text
SessionEvent.channel  = keyboard.state | keyboard.event
                        | pointer.state  | pointer.event
                        | gamepad.state  | gamepad.event

SessionEvent.type     = input.state | input.event

SessionEvent.payload  = { domainId, targetKey, data }
SessionEvent.source   = 可信的 RenderNode 拥有者
~~~

`data` 等于上面的 `payload`。`domainId`、`targetKey` 和 source 由 Framework 按当前 live RenderNode 绑定，组件不填写。

设备组件不得省略 `options.channel`。省略时调用会落到默认通道 `x.loomrealm.web-presentation.event`，那是画面自定义事件的默认通道，不是这六个设备通道。

`input.state` / `input.event` 只表示这份载荷是一份自包含状态还是一次瞬时边沿。订阅者按 `SessionEvent.channel` 过滤，不按事件名过滤设备种类。

键盘 State 的例子：

~~~ts
context.emitCustomEvent(
  "input.state",
  { down: [...held].sort() },
  { broadcast: true, channel: "keyboard.state" },
);

context.emitCustomEvent(
  "input.event",
  { action, code, repeat },
  { broadcast: true, channel: "keyboard.event" },
);
~~~

## 3. 六个通道与载荷

通道名和载荷形状保持 User Input v1。组件不改键名、数值范围、按钮名和数量上限。

| options.channel | name | data |
| --- | --- | --- |
| `keyboard.state` | `input.state` | `{ down: readonly KeyboardCodeV1[] }` |
| `keyboard.event` | `input.event` | `{ action: "down" \| "up"; code: KeyboardCodeV1; repeat: boolean }` |
| `pointer.state` | `input.state` | `{ pointers: readonly PointerSampleV1[] }` |
| `pointer.event` | `input.event` | `{ action: "down" \| "up" \| "cancel"; pointer: PointerSampleV1; button: PointerButtonV1 \| null }` |
| `gamepad.state` | `input.state` | `{ gamepads: readonly GamepadSampleV1[] }` |
| `gamepad.event` | `input.event` | `{ action: "down" \| "up"; gamepadId: number; button: GamepadButtonNameV1; value: number }` |

空 State：

~~~text
keyboard.state -> { down: [] }
pointer.state  -> { pointers: [] }
gamepad.state  -> { gamepads: [] }
~~~

消息里不放 `frameId`、`activationId`、Input Interest 或 InputTarget。组件也不发送 `input.reset` 或 `input.availability`。

## 4. game-keyboard-input

从现有浏览器键盘源拆出 `KEYBOARD_CODES_V1`、held set、focus / blur / visibility，以及 keydown / keyup。

顺序保持：

~~~text
keydown non-repeat -> held.add -> keyboard.state -> keyboard.event
keydown repeat     -> keyboard.event only
keyup              -> held.delete -> keyboard.state -> keyboard.event
~~~

第一次按下 `repeat = false`。按住重复 `repeat = true`，并且不再发 State。抬起 `repeat = false`。无法映射到 `KeyboardCodeV1` 的键不进入这两个通道。

窗口不可用时：`held.clear()`，然后发送 `{ down: [] }`。

## 5. game-pointer-input

从现有浏览器指针源拆出 pointer 身份、mouse / touch / pen、按钮集合、坐标归一化、surface validity、resize，以及 pointerdown / move / up / cancel。

保留：

~~~text
坐标 0 .. 1_000_000，允许画面外的 signed int32
同时最多 32 个 pointer
pointerId 在该组件的一次本地采集生命周期内不复用已结束的 id
buttons 去重并按枚举顺序
down / up 的 button 非空；cancel 的 button 为空
同一变化先发 pointer.state，再发 pointer.event
~~~

窗口或表面不可用时清空指针表，发送 `{ pointers: [] }`。不标准化滚轮、手势、压力、倾斜或 raw motion。

## 6. game-gamepad-input

从现有浏览器手柄源拆出 standard mapping、`requestAnimationFrame` 轮询、`navigator.getGamepads()`、轴与按钮量化，以及连接和断开。

保留：

~~~text
只采集 mapping === "standard" 的手柄
最多 16 个
轴 -1_000_000 .. 1_000_000
按钮 0 .. 1_000_000
按下阈值 500_000
越过阈值时先发 gamepad.state，再按固定按钮顺序发 gamepad.event
整份 State 只在采样变化时发送
~~~

第一阶段不加 deadzone，也不改按钮模型。断开或停止轮询时清空本地手柄表，发送 `{ gamepads: [] }`。

## 7. 可用性、空 State 与迟到订阅

三个组件各自响应 `visible && document.hasFocus()`，不共用一个会同时清掉所有设备的开关。

~~~text
Keyboard unusable -> held.clear -> keyboard.state { down: [] }
Pointer unusable  -> pointers.clear -> pointer.state { pointers: [] }
Gamepad unusable  -> stop polling -> gamepad.state { gamepads: [] }
~~~

可用性丢失只变成该设备的空 State，不另发 availability 消息。

Session Events 不回放。组件用最小补偿保证后来的订阅者仍能看到当前状态：

~~~text
State 发生变化     -> 立即发送整份 State
State 非空         -> 有界的低频整份 State 刷新
State 变为空       -> 立即发送空 State，并停止刷新
订阅者超时未收到   -> 订阅侧本地退回该通道的空 State
~~~

空 State 不持续心跳。刷新必须有界，允许合并，不能按每一帧无限制广播。瞬时 Event 不自动重试。刷新间隔和超时数值留到 Qualification，不在这里冻结。第一阶段不加 epoch 或 revision 字段。

同一设备内部保持「先 State、后对应边沿 Event」的顺序。键盘、指针、手柄之间不定义全局顺序。

## 8. 订阅

跨 Subsystem 的订阅按六个通道精确订阅，不再订阅 `x.loomrealm.web-presentation.event` 再从 `data.channel` 里拆设备：

~~~ts
const subscription = await scope.events.subscribe(
  [
    "keyboard.state",
    "keyboard.event",
    "pointer.state",
    "pointer.event",
    "gamepad.state",
    "gamepad.event",
  ],
  (event) => {
    // event.channel = keyboard.state 等六个通道之一
    // event.type    = input.state | input.event
    // event.payload.data = 对应的 v1 载荷
  },
);
~~~

可选兼容层仍可以提供 `input.on("keyboard.state", handler)` 这种按通道注册的写法。它内部订阅上面的六个通道，校验 `type` 与 v1 载荷后，把 `event.payload.data` 交给对应 handler。非法载荷在这一层拒绝或忽略。Framework 不解析设备载荷。

跨设备的 move、confirm、cancel 仍由可选 Mapper / Aggregator 在收到这些通道之后合并。设备组件不做这层聚合，Mapper 也不必是 Web Component。

## 9. 组件不承担的框架门

以下逻辑不放进任何一个设备组件：

~~~text
frameId / activationId
InputTarget
Input Interest
Effective 计算
input.reset
Data input.* 发布
~~~

`broadcast: true` 走 Session Events 的精确通道投递。组件不因为某个 Frame 是否声明了 Interest 而改写通道。

Desktop 与 PWA 使用同一套调用和同一套六个通道。浏览器采集留在组件里；Session Event 的进程或 Worker 接线留在平台组合里。组件不引用 ipcRenderer、WebSocket、MessagePort 或 Service Worker。

## 10. 实现方案

不从 `@loomrealm/renderer` 引用 `createBrowserRendererInputSource`。把 `packages/renderer/src/browser-input-source.ts` 的采集实现复制进 `game-libs/game-common-controls`，只改封装和发送口。这样删除框架里的浏览器输入源时，这个包仍然独立。

`KEYBOARD_CODES_V1` 现在由 `@loomrealm/data` 提供。数组本身也复制进本包，避免继续依赖 data 里的 User Input 符号。

复制时保留 `start()` 内部的行为：held、指针表、手柄轮询、`isTrusted`、规范 id、排序，以及先 State 后 Event。去掉对 `RendererInputSource` / `RendererInputSourceChange` 的依赖。

原来的：

~~~ts
send({ kind: "state" | "event", channel, payload })
~~~

改为：

~~~ts
context.emitCustomEvent(
  change.kind === "state" ? "input.state" : "input.event",
  change.payload,
  { broadcast: true, channel: change.channel },
);
~~~

`available(...)` 不再向外发送。`usable`、`pointerAvailable` 仍留在本地，用来决定还采不采。`input.availability` 本来就不是 v1 线消息。

现有函数在一次 `start()` 里同时监听键盘、指针和手柄。三个 Web Component 如果各自跑这份完整拷贝，同一物理输入会发三遍。因此在包内把这份拷贝按设备切开，而不是三个组件各调用整份源：

~~~text
keyboard-source.ts
pointer-source.ts
gamepad-source.ts
~~~

三个 Custom Element 只保存 `context`，并调用对应 source 的 `start` / `stop`。发送都走第 2 节的 `emitDeviceInput`。

窗口可用性保持现有源的两条路径：

~~~text
leaveUsable
    清空该设备本地表，并发送空 State

重新可用
    清空键盘 held 和指针表
    重扫当前手柄，不为已经按下的按钮补 Event
    再发送当前 State

stop()
    先停止发送，再清表
    不额外补空 State
~~~

非空 State 的有界刷新和订阅侧超时退回空 State仍按第 7 节加在发送口之外。迁移期内不要让旧的 Renderer 输入源和这些组件同时采集同一物理输入。
