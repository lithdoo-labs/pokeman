# 设备输入迁移落地顺序

> 状态：**Implemented / Qualified（2026-10-21）**
> 位置：`game-libs/game-common-controls/landing.md`  
> 顺序事实源：本文  
> 分册：  
> [emitCustomEvent 扩展](./emit-custom-event.md)  
> [设备输入 Web Components](./device-input-components.md)  
> [从 LoomRealm 框架移除 User Input](./remove-framework-user-input.md)

本文只规定这三份文档的落地顺序和各自拥有的事实。调用形状、组件行为和删除清单以对应分册为准，不在这里重写。

原先的总体设计草稿已退役；其中「固定通道 `x.loomrealm.web-presentation.event`，设备名放在 `data.channel`」的方案不再作为落地依据。当前以本页和三份分册为实施事实源；设备载荷以 [User Input v1](../../doc/15-contracts/user-input-v1.md) 为基准，采集行为与空 State 规则见 [设备输入 Web Components](./device-input-components.md)。

三份分册已按顺序实现；当前运行时正式化见 [Game Common Controls Input v1](../../doc/15-contracts/game-common-controls-input-v1.md)、[Web Presentation API v3](../../doc/15-contracts/web-presentation-api-v3.md)、[Renderer Data Profile v3](../../doc/15-contracts/renderer-data-profile-v3.md) 与 [Renderer Control v2](../../doc/15-contracts/main-renderer-control-v2.md)。

## 1. 顺序

~~~text
1. emit-custom-event.md
2. device-input-components.md
3. remove-framework-user-input.md
~~~

后一步开始时，前一步要已经能被调用。删除框架输入面分成两刀，第二刀还要等 owner-only 反向事件离开 InputGate。

## 2. 第一份：调用形状

事实源：[emitCustomEvent 扩展](./emit-custom-event.md)。

先实现 `options.broadcast` 和 `options.channel`。`broadcast: true` 进入 Session Events，并用解析后的 channel 做精确过滤。省略 `channel` 时仍发送 `x.loomrealm.web-presentation.event`。

双参数调用保持现行 owner-only 行为，继续走 InputGate。对话和表单在这一步不改。

这一步完成之前，不复制浏览器输入源，也不拆除 Desktop / PWA 上的旧采集。

## 3. 第二份：三个设备组件

事实源：[设备输入 Web Components](./device-input-components.md)。

接口可用之后，把 `packages/renderer/src/browser-input-source.ts` 复制进 common-controls，不引用 `@loomrealm/renderer`。按键盘、指针、手柄拆成三个 source 和三个 Web Component。发送形式固定为：

~~~ts
context.emitCustomEvent(
  "input.state" | "input.event",
  payload,
  { broadcast: true, channel },
);
~~~

`channel` 是六个标准设备通道之一，`payload` 是对应的 User Input v1 载荷。订阅改到这些通道上。非空 State 的有界刷新和超时退回空 State 也在这一步完成。

某个游戏改挂这些组件时，不要再同时跑 Renderer 里的旧输入源。框架里的 InputGate 和 `input.*` 此时仍保留。

## 4. 第三份：移除框架 User Input

事实源：[从 LoomRealm 框架移除 User Input](./remove-framework-user-input.md)。

组件已经在发，并且业务不再为设备输入调用 `createInputListener` 之后，才进入这份文档。

第一刀只停掉 Desktop 和 PWA 对浏览器输入源的装配，并删除框架里的 `browser-input-source`。InputGate、`createInputListener` 和 `input.*` 仍留着。

第二刀再按 Subsystem、Renderer、Data、Main 的顺序删除 `createInputListener`、InputGate、`input.*` 和 `inputTarget`。对话、表单若仍使用双参数 `emitCustomEvent`，要先改成 `broadcast: true` 并带上 `options.channel`，或者先有不经过 InputGate 的 owner-only 替代。`frame.params` 以及 Frame、Activation 不删。

删除触及冻结契约，必须作为新的契约版本发布，不能改写现行 User Input v1 正文。

## 5. 各文档拥有什么

| 文档 | 拥有 | 不拥有 |
| --- | --- | --- |
| [emit-custom-event.md](./emit-custom-event.md) | `options`、`broadcast`、`channel` 的解析和两条发布路径 | 三个设备组件的采集细节、框架删除清单 |
| [device-input-components.md](./device-input-components.md) | 三个 Web Component、复制后的采集行为、六个通道上的载荷 | 调用形状的一般规则、InputGate 的删除步骤 |
| [remove-framework-user-input.md](./remove-framework-user-input.md) | 停掉框架采集和删除输入运行时的顺序 | 设备采样算法、`emitCustomEvent` 的字段语义 |


## 6. 后续能力提案（不属于输入迁移顺序）

[game-controls-input 全屏控制遮罩层提案](./game-controls-input-fullscreen-overlay.md) 描述在现有统一 Select 长按后显示全屏控制遮罩层，并由用户通过真实按钮交互进入或退出浏览器全屏。该提案不修改冻结的 Controls ABI，也不属于上文三份输入迁移分册的实施顺序；文档状态为 Proposed / Design / Not Implemented。

[game-controls-input CustomEvent 输入源](./game-controls-input-custom-source.md) 是一个只存在于 `game-controls-input` 内部的第三 Controls source：CDP / Playwright 把 `{ version: 1, down }` 完整快照 direct-dispatch 到组件元素，组件内部与 Keyboard / Gamepad 做 OR，并继续只发布现有 `controls.state` / `controls.event`。它已作为现行 `game-controls-input.md` 的 additive normative extension 实现，只覆盖 source enumeration、effective OR 与 Custom snapshot edge；公开 Controls v1 ABI、Top Active Frame routing 和 Subsystem consumer 不变。状态为 Active / Normative Extension / Implemented，见 [Custom Controls Input Qualification](../../doc/30-implementation/game-controls-custom-input-qualification.md)。
