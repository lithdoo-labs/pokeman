# emitCustomEvent 调用形状扩展

> 状态：**Historical rollout note（v2，2026-10-21）**
> 位置：`game-libs/game-common-controls/emit-custom-event.md`  
> 所属计划：[设备输入迁移落地顺序](./landing.md)  
> 投递路径仍见：[Web Presentation Custom Event Routing](../../doc/10-architecture/web-presentation-custom-event-routing.md)  
> 当前契约：[Web Presentation API v3](../../doc/15-contracts/web-presentation-api-v3.md)、[Frame-targeted Presentation Event v1](../../doc/15-contracts/frame-targeted-presentation-event-v1.md)、[Session Events v1](../../doc/15-contracts/session-events-v1.md)

本文记录 v2 阶段 `WebPresentationContext.emitCustomEvent` 的调用形状迁移。设备协议与采样规则见 [设备输入 Web Components](./device-input-components.md)，旧 Framework 输入层的删除顺序见 [从 LoomRealm 框架移除 User Input](./remove-framework-user-input.md)。当前 v3 已在 boolean 路径之外增加 `broadcast: "top-frame"`；其权威语义以上述当前契约为准。

## 1. 现行调用

~~~ts
emitCustomEvent(
  name: string,
  data?: InputEventV1["payload"],
): void
~~~

`WebPresentationContext` 的封闭形状只有 `resources` 和这个方法。调用只投给拥有该 RenderNode 的 Subsystem，并进入 InputGate。省略或显式 `undefined` 的 `data` 使用冻结空对象；`null` 不是默认值。

推送侧只认一条保留通道 `x.loomrealm.web-presentation.event`。当前栈顶 Frame 的 Interest 包含这条通道才发送；组件不能改通道。`name` 只放在 payload 里。

## 2. 目标签名

增加一个可扩展的 `options` 对象。它有两个正交字段：`broadcast` 选择接收范围，`channel` 选择推送侧过滤所用的通道。

~~~ts
interface CustomEventOptions {
  readonly broadcast?: boolean;
  readonly channel?: string;
}

interface WebPresentationContext {
  readonly resources: PresentationResourceClient;

  emitCustomEvent(
    name: string,
    data?: JsonObject,
    options?: CustomEventOptions,
  ): void;
}
~~~

第三参数必须是对象，不能把整个第三参数做成布尔值或字符串。以后与 custom event 正交的能力继续加在 `options` 上。

`data` 的长期类型是通用 `JsonObject`，不再由 `InputEventV1["payload"]` 拥有。校验仍是有界纯 JSON。

## 3. broadcast 只选择路径

~~~text
options 省略
    => broadcast = false

{ broadcast: false }
    => owner-only

{ broadcast: true }
    => cross-Subsystem broadcast
~~~

`broadcast` 不改变 `name`、`data` 格式，也不让业务代码覆盖 source、Session、subsystem、generation、`domainId` 或 `targetKey`。通道由 `options.channel` 单独决定，不由 `broadcast` 决定。

## 4. channel 是推送侧过滤键

解析规则：

~~~text
options 省略
channel 省略
channel 为 undefined
    => x.loomrealm.web-presentation.event

channel 已提供
    => 该精确字符串
~~~

默认通道就是现行保留标识：

~~~ts
const WEB_PRESENTATION_EVENT_CHANNEL_V1 =
  "x.loomrealm.web-presentation.event";
~~~

显式传入这个默认字符串与省略等价。

`options.channel` 不使用 User Input 的通道语法，也不排除 `.state` 或标准设备通道。这次扩展就是为了把键盘、指针、手柄从 LoomRealm 架构层拆出去，改由独立 Web Component 生产。这些组件用原来的通道名做推送侧过滤，例如：

~~~text
keyboard.state    keyboard.event
pointer.state     pointer.event
gamepad.state     gamepad.event
~~~

其他精确字符串同样可用。Framework 不维护一份允许通道表，也不把这些名字保留给架构层输入源。

推送侧用解析后的通道做精确过滤：

~~~text
owner-only
    当前栈顶 Frame 的 Interest 含有该通道才发送
    不含则丢弃，不改投到默认通道

broadcast = true
    SessionEvent.channel = 该通道
    只有订阅了这条精确通道的订阅者收到
~~~

`name` 仍然只是业务事件类型，不参与这次过滤。业务代码不能通过 `options` 覆盖 source、Session、subsystem、generation、`domainId` 或 `targetKey`。

示例：

~~~ts
context.emitCustomEvent("submit", { conversationId });
// channel = x.loomrealm.web-presentation.event

context.emitCustomEvent(
  "submit",
  { conversationId },
  { channel: "x.loomrealm.dialogue.event" },
);
// 只有 Interest 或订阅包含 x.loomrealm.dialogue.event 才收到

context.emitCustomEvent(
  "input.state",
  { down: [...] },
  { broadcast: true, channel: "keyboard.state" },
);
// 键盘 Web Component 用原设备通道过滤，不再由架构层输入源生产
~~~

`"submit"` 和 `"input.state"` 都是业务事件名，不是 Channel。`keyboard.state` 在这个例子里才是推送侧过滤通道。

## 5. 迁移期调用

| 调用 | 迁移期 |
| --- | --- |
| `emitCustomEvent(name, data)` | 现行 owner-only 行为，通道为 `x.loomrealm.web-presentation.event` |
| `emitCustomEvent(name, data, { broadcast: false })` | 与上一行相同 |
| `emitCustomEvent(name, data, { channel })` | owner-only，按该 channel 做推送侧过滤 |
| `emitCustomEvent(name, data, { broadcast: true })` | 跨 Subsystem 路径，不经过 InputGate，通道仍是默认保留通道 |
| `emitCustomEvent(name, data, { broadcast: true, channel })` | 跨 Subsystem 路径，SessionEvent.channel 为该 channel |

owner-only 路径离开 InputGate 是后续独立版本，不在这次调用形状里解决。

## 6. 逻辑事件

~~~text
SessionEvent.channel
    = 解析后的 channel
      默认 x.loomrealm.web-presentation.event

SessionEvent.type
    = emitCustomEvent 的 name

SessionEvent.payload
    = { domainId, targetKey, data }

SessionEvent.source
    = 可信的 RenderNode 拥有者
~~~

`broadcast=true` 才进入 Session Events。`broadcast=false` 仍走 owner-only InputGate，但使用同一个解析后的 channel 作为 Interest 过滤键。

职责分开：

~~~text
channel     推送侧按哪条精确通道过滤
name/type   这条业务事件是什么
data        业务协议数据
broadcast   是否进入跨 Subsystem 路径
~~~

`domainId`、`targetKey`、Session、subsystemKey、generation 与 source 由 Framework 按当前 live RenderNode 绑定。`broadcast=true` 按 Session Events 现有的精确 Channel 规则投递，不新增 owner 或 session 接收者过滤。

设备 Web Component 把原来的标准通道放进 `options.channel`，用来替代架构层的推送侧过滤。载荷仍是对应设备的 v1 payload，见 [设备输入 Web Components](./device-input-components.md)。

~~~ts
context.emitCustomEvent(
  "input.state",
  { down: [...] },
  { broadcast: true, channel: "keyboard.state" },
);
~~~

这里 `input.state` 是事件名。`keyboard.state` 是推送侧过滤通道。省略 `options.channel` 时，过滤通道仍是 `x.loomrealm.web-presentation.event`。

## 7. 校验与接受

先判断来源是否仍然当前，再校验参数。

~~~text
attachment、Control、Data、Store、RenderNode 仍当前
    → 校验 options
    → 解析 channel
    → 校验 name
    → 校验 data
    → 按 broadcast 与解析后的 channel 进入对应路径
~~~

- `options` 可以省略。提供时 `broadcast` 只能是 `boolean` 或 `undefined`，不做 truthy 转换。
- `channel` 可以省略或为 `undefined`，解析为 `x.loomrealm.web-presentation.event`。`null` 和空字符串不是默认值。
- 提供的 `channel` 是精确过滤字符串。`keyboard.state`、`keyboard.event`、`pointer.state`、`pointer.event`、`gamepad.state`、`gamepad.event` 以及其他非空字符串都合法。
- 已卸下、Session 或 generation 过期、连接退役、目标已不在当前 Store：在参数校验前丢弃，不抛错。
- `name` 是 1..128 个 UTF-8 字节的 Unicode 标量字符串，按事件类型校验，不按 Channel 解释。
- 省略或显式 `undefined` 的 `data` 使用冻结空对象；`null` 不是默认值。
- 当前来源上的非法 `options`、`channel`、`name` 或 `data` 同步失败，不进入 InputGate，也不进入 broadcast 发布。
- 通道语法合法、但 owner-only 的当前 Interest 不含该通道：推送侧丢弃，不抛错，也不回退到默认通道。
- 返回 `void` 只表示本地接受。没有 ACK、回放或恰好一次。

正向 `receiveRenderEvent` 回调里的反向调用，仍先按调用顺序暂存，回调结束之后才发布。已经接受的调用不因回调随后抛错而回滚。

## 8. 版本边界

现行 `WebPresentationContext` 是冻结的封闭形状。`options`、可选 `channel` 和本文的分流语义必须通过新的契约版本发布，不能静默写进 Web Presentation API v1。

尚未决定的事项：

- 新 context 形状的正式版本号。
- 默认通道常量迁到哪个 package / contract。
- `SessionEvent.type` 已经等于 `name` 之后，payload 是否还保留一份 `name`。本文目标映射不放。
- `data` 与 `InputEventV1["payload"]` 脱钩时，深度、成员数和字节上限沿用哪一版数字。
