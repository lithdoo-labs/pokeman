# 从 LoomRealm 框架移除 User Input

> 状态：**Implemented / Qualified（2026-10-21）**
> 位置：`game-libs/game-common-controls/remove-framework-user-input.md`  
> 前置：[设备输入 Web Components](./device-input-components.md)、[emitCustomEvent 扩展](./emit-custom-event.md)  
> 现行落点：`packages/renderer`、`packages/data`、`packages/subsystem`、`packages/main`、`packages/renderer-control`、`apps/desktop`、`apps/pwa`

本文只写最后从框架删除原 User Input 实现的顺序。设备组件的采集和发送见同目录的组件文档。本文不修改已冻结契约，也不改同目录既有设计文档。

删除的是框架里的用户输入面：浏览器采集、InputGate、Interest、`input.*` 线协议和 InputTarget。Frame、Activation、`frame.params` 留下。

## 1. 删除前必须已经成立

设备 Web Component 已经按新接口在发：

~~~ts
context.emitCustomEvent(
  "input.state" | "input.event",
  payload,
  { broadcast: true, channel },
);
~~~

`channel` 是 `keyboard.state`、`keyboard.event`、`pointer.state`、`pointer.event`、`gamepad.state`、`gamepad.event` 之一。业务订阅这些 Session Events 通道，不再为设备输入调用 `createInputListener`。

common-controls 里的采集代码是从 `packages/renderer/src/browser-input-source.ts` 复制出来的，不引用 `@loomrealm/renderer`。因此删除框架里的那份源文件不会拆掉组件。

迁移期内不要让旧的 Renderer 输入源和这些组件同时听同一个窗口。

现在还不能把 InputGate 和 `input.*` 一次删掉。现行 `emitCustomEvent(name, data)` 仍把反向事件送到 `x.loomrealm.web-presentation.event`，再由 InputGate 按 Interest 和栈顶 InputTarget 过滤。对话、表单还走这条 owner-only 路径。

## 2. 第一刀：停掉框架采集

产品不再把浏览器输入源装进 Renderer。

~~~text
apps/desktop/src/renderer-entry.ts
    不再创建 createDesktopRendererInputSource

apps/desktop/src/renderer-input-source.ts
    删除

apps/pwa/src/renderer-host.ts
    createRendererControlHolder 不再传入 createBrowserRendererInputSource
~~~

然后删除框架里的采集实现和导出：

~~~text
packages/renderer/src/browser-input-source.ts
packages/renderer/src/browser-window.ts
    去掉 createBrowserRendererInputSource
~~~

`apps/desktop/src/renderer-input-source.ts` 里的 `onKeyboardCapture` 只给方向键资格测试用，不是游戏协议。输入源删除时把这个钩子去掉。若资格测试仍要观察按键时刻，改到复制进 common-controls 的键盘源里，不留在 Desktop 对 Renderer 的包装上。

这一刀之后，`InputGate`、`createInputListener` 和 `input.*` 仍保留。只是不再有框架自己的键盘、指针、手柄生产者。

## 3. 第二刀：删输入运行时

设备输入都改走 Session Events，并且仍依赖 InputGate 的 owner-only 调用已经迁走之后，按下面的顺序删。顺序不能倒过来：Subsystem 和 Renderer 还在发 `input.*` 时，不能先拆 Data 解码。

### 3.1 Subsystem

删除：

~~~text
packages/subsystem/src/input.ts
packages/subsystem/src/internal/input-manager.ts
SubsystemScope.createInputListener
Frame 上只为投递输入而存在的 mutation-gate 分支
~~~

Render、Content、Viewport、Shared State、Session Events 保持原样。

### 3.2 Renderer

删除：

~~~text
InputGate
RendererInputSource / RendererInputSourceChange
startInputSource / stopInputSource
~~~

`createRendererControlHolder` 不再接收输入源参数。Viewport 源仍然传入。

### 3.3 Data

从 `RendererDataMessageV1` 去掉 `UserInputMessageV1`。删除：

~~~text
input.interest
input.state
input.event
input.reset
input-codec
键盘 / 指针 / 手柄载荷类型和 KEYBOARD_CODES_V1 在 @loomrealm/data 中的副本
RendererInputDataPeer / SubsystemInputDataPeer
~~~

Profile 分发不再认识 `input.*`。Render Update 和 Viewport State 仍走原来的 Data 连接。设备载荷的规范副本在删除前已经留在 common-controls，不从这里再 import。

### 3.4 Main 与 Renderer Control

最后删除 `currentInputTarget()` 和权威快照里的 `inputTarget`。

`packages/main/src/internal/main-session.ts` 的 `validateFrameSource` 在栈顶 Frame 和 Activation 之外，还要求当前 InputTarget 与该 Frame 一致。删除 InputTarget 时，这个检查改成只保留：

~~~text
Frame 存在且未关闭
subsystemKey 与调用方一致
该 Frame 是栈顶
lifecycle === active
activationId 一致
~~~

不要把 Frame 栈校验一起删掉。

## 4. owner-only 路径还在时不能删 InputGate

`broadcast: true` 的设备事件不经过 InputGate。下面这些调用在迁走之前仍然需要 Interest、InputTarget 和保留通道 `x.loomrealm.web-presentation.event`：

~~~text
emitCustomEvent(name, data)
emitCustomEvent(name, data, { broadcast: false })
~~~

对话和表单若仍使用这种双参数调用，删除 InputGate 会让它们的反向事件消失。处理方式二选一：

~~~text
改为 broadcast: true，并用 options.channel 做推送侧过滤
或先有一条不经过 InputGate 的 owner-only 替代
~~~

设备组件不依赖这条路径，不为此保留框架输入面。

## 5. 留下的 input

这些名字带 input，但不是用户输入协议，不删除：

~~~text
bootstrap.initial.input
frame.initialize({ input })
作者侧的 frame.params
~~~

Frame、Activation、Session、Runtime、Render、Viewport、Shared State、Session Events 保留。去掉的只是它们和用户输入路由之间的 InputTarget、Interest、InputGate 耦合。

## 6. 契约和资格

User Input v1、Renderer Data Profile 的 `input.*`、Renderer Control 的 `inputTarget` 是冻结面。删除必须作为新的契约版本一起发布，不能在现行 v1 正文里把字段悄悄拿掉。

专门证明输入面的资格用例随这个版本退役。Render、Viewport 和 Frame 的资格要在没有 `input.*` 的 Profile 上再跑一次。
