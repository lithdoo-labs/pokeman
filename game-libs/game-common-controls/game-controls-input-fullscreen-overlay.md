# game-controls-input 全屏控制遮罩层提案

> 状态：**Proposed / Design / Not Implemented**
> 位置：`game-libs/game-common-controls/game-controls-input-fullscreen-overlay.md`
> 所属包：`@loomrealm-game/common-controls`
> 关联实现：[统一操控输入 Web Component](./game-controls-input.md)、[Game Common Controls Input v1](../../doc/15-contracts/game-common-controls-input-v1.md)

本文提议在现有 `game-controls-input` 组件内部增加一个轻量的全屏控制遮罩层。本文只定义设计和验收边界，不代表功能已经实现或通过资格验证。

## 1. 背景与目标

`game-controls-input` 已将键盘和标准映射手柄统一为 14 个数字按键，其中 `select` 对应键盘 `Tab` 和标准手柄按钮索引 8。手柄由 `navigator.getGamepads()` 配合 `requestAnimationFrame` 轮询，因此检测到手柄长按本身不是浏览器认可的 DOM 用户激活事件。

浏览器的 `Element.requestFullscreen()` 通常要求调用时存在有效的瞬态用户激活。不能假设在长按计时器、手柄轮询或 `window.confirm()` 回调中调用全屏 API 一定会成功。

本提案采用两阶段交互：

1. 键盘或手柄长按 `select`，由组件显示全屏控制遮罩层。
2. 用户通过触摸、鼠标，或可触发原生按钮激活行为的键盘操作，点击遮罩层上的“进入全屏”或“退出全屏”按钮。按钮的同步事件处理函数直接调用浏览器全屏 API。

长按只负责显示 UI，绝不直接调用 `requestFullscreen()` 或 `exitFullscreen()`。

### 目标

- 复用现有统一 `select` 语义，键盘和手柄都能唤出遮罩层。
- 通过真实按钮交互执行全屏动作，满足浏览器对用户激活的要求。
- 遮罩层、状态同步、错误反馈和清理都由 `game-controls-input` 自己管理。
- 不改变现有 Controls ABI、Session Event 通道、Framework 或其他输入组件。

### 非目标

- 不承诺仅靠 Gamepad API 轮询就能进入浏览器全屏。
- 不新增 Framework 全局全屏服务或宿主窗口协议。
- 不调用 `window.confirm()`，不合成 `click`，不通过延迟任务间接请求全屏。
- 不修改冻结的 `Game Common Controls Input v1` 或 `ControlsEventPayloadV1`。
- 不在本提案中实现代码。

## 2. 交互状态与规则

### 2.1 长按识别

- 监听组件已有的统一有效按键状态；只有 `select` 从未按下变为按下时才开始计时。
- 建议初始阈值为 **800ms**。第一版不新增 HTML 属性或公开配置 API。
- 在阈值到达前释放，取消计时，不显示遮罩层。
- 连续按住达到阈值，显示一次遮罩层，并标记本次按压已经触发。
- 同一按压持续更久不能重复显示；释放后才允许下一次长按触发。
- 键盘和手柄同时按住同一 `select` 时，以现有 effective state（Keyboard OR Gamepad）为准，不重复触发。
- 长按结束后的释放只重置本次按压状态，不自动进入或退出全屏。
- 窗口失焦、页面隐藏、组件卸载或输入源失效时，取消尚未触发的计时，避免稍后意外弹出遮罩层。

长按计时只用于显示 UI。即使计时器触发时仍有用户激活状态，也不得在该回调中调用全屏 API。

### 2.2 遮罩层

遮罩层必须使用原生 `<dialog>`，并通过 `showModal()` 打开，使其进入浏览器 top layer。**不能只依赖普通 DOM 的高 `z-index`**：`z-index` 受 stacking context 限制，无法让普通元素越过浏览器 top layer 中的 modal dialog、popover 或 fullscreen element。

样式仍需设置足够高的防御性层级值，例如 `z-index: 2147483647`，并使用 `position: fixed; inset: 0` 覆盖视口；但这个数值不是“高于所有元素”的保证，top-layer 顺序才是关键。dialog 应覆盖整个可视区域，背景遮罩和内容均属于 dialog 自身。不要把遮罩层作为普通 `div` 仅挂到 `document.body` 后就认为它能压过所有堆叠上下文。

全屏元素本身也会进入 top layer；若在 dialog 已打开时请求全屏，浏览器可能把 fullscreen element 排在现有 dialog 之上。因此，在 dialog 仍需显示的情况下，`fullscreenchange` 处理必须重新确认 dialog 的 top-layer 顺序：若全屏切换使游戏全屏元素覆盖了 dialog，则关闭并立即重新调用 `showModal()`，再恢复到当前有效按钮的焦点。实现时应避免把该内部重排误判为用户关闭面板；不要在 `close` 事件里无条件销毁遮罩状态。

这能让遮罩层处于页面 DOM 和组件管理的 top-layer 元素之上；网页仍无法覆盖浏览器/操作系统的界面，也无法保证压过之后由其他代码新加入 top layer 的元素。组件卸载时必须关闭并移除 dialog，清理相关监听器。

遮罩层包含两个原生按钮：

- **进入全屏**：当页面未处于全屏且 Fullscreen API 可用时启用。
- **退出全屏**：当页面处于全屏时启用。

不得通过切换自维护的布尔值来推断全屏状态。按钮启用状态以 `document.fullscreenElement` 和 `document.fullscreenEnabled` 为依据。建议使用 `role="dialog"`、`aria-modal="true"`、可见的按钮名称和清晰的焦点样式。

键盘可访问性：

- 遮罩层显示后，将焦点移至当前可用的操作按钮；若页面已全屏，优先聚焦“退出全屏”。
- 使用原生 `button`，允许 Tab 切换焦点、Enter/Space 激活。
- 现有 Keyboard capture 会把按钮焦点视为浏览器交互区域；此时游戏键盘采集应按既有规则暂停，不应与按钮操作争抢按键。
- 可以通过 Escape 或点击遮罩背景关闭面板；不额外增加第三个可见按钮。关闭面板不改变全屏状态。

### 2.3 执行全屏

“进入全屏”按钮的 `click` 处理函数必须同步调用：

```ts
// 示意代码：实际实现必须在按钮 click handler 内直接调用
void document.documentElement
  .requestFullscreen()
  .catch(showFullscreenError);
```

在该调用之前不得 `await` 其他 Promise、等待计时器或排队到另一个任务。处理函数应先做同步能力检查；若 API 不存在或 `document.fullscreenEnabled` 为 false，显示明确的不可用说明，而不是尝试延迟执行。

“退出全屏”按钮同样在其 `click` 处理函数中直接调用：

```ts
// 示意代码：实际实现必须在按钮 click handler 内直接调用
void document.exitFullscreen().catch(showFullscreenError);
```

按钮操作使用 Promise rejection 处理失败。失败时保留遮罩层并展示可读错误状态，不应吞掉错误，也不能假设点击一定成功。浏览器策略、Permissions Policy、平台差异或用户代理限制仍可能导致请求失败。

### 2.4 状态同步与关闭

- 监听 `document.fullscreenchange`，以 `document.fullscreenElement` 为唯一权威状态。
- 用户按钮操作成功导致状态变化后，遮罩层保持显示，直到用户通过 Escape 或点击背景明确关闭；fullscreenchange 后同步进入/退出按钮状态。
- 同时检查 dialog 是否仍在 top layer 最上方；必要时调用 `close()` 后立即 `showModal()` 以重新排到 fullscreen element 之上，并恢复当前可用按钮焦点。该重排不得被当作用户主动关闭。
- 如果用户通过浏览器 Esc 等方式改变全屏状态，先同步实际全屏状态，再按上述规则确保 dialog 的层级正确；用户可通过 Escape 或背景点击明确关闭面板。
- 监听 `fullscreenerror`（若支持）并处理 Promise rejection；错误时遮罩层保持可见，供用户重试或关闭。
- 不把全屏状态写入 `controls.state`、`controls.event` 或任何游戏业务状态。

## 3. 浏览器用户激活与支持边界

### 可以依赖的路径

- 用户通过触摸或鼠标真实点击原生按钮，按钮处理函数立即调用全屏 API。
- 用户通过键盘操作原生按钮（例如焦点在按钮上时按 Enter/Space），由浏览器执行按钮激活行为，再在对应的 `click` 处理函数中直接调用 API。

这些路径仍受浏览器实现、页面策略和平台支持限制；调用必须处理失败。

### 不能承诺的路径

- 仅凭手柄长按或短按，组件通过 Gamepad polling 检测到按键后直接请求全屏。
- 长按计时器触发后自动请求全屏。
- `window.confirm()` 返回后请求全屏。
- 程序化调用 `button.click()`，或先执行异步工作再调用 API。

Gamepad 可以可靠地用于唤出遮罩层，但 Gamepad API 轮询不等同于可信的页面用户激活。如果玩家只有手柄、没有触摸屏/鼠标/键盘，遮罩层的按钮可能无法通过该手柄获得浏览器认可的激活；本提案不声称解决这一限制。若未来需要纯手柄完成浏览器全屏操作，需要重新评估浏览器平台能力，而不是在轮询回调中伪造点击。

在不支持标准 Fullscreen API 的浏览器或宿主中，本提案只显示不可用反馈；不新增 Hostra / Electron 原生窗口桥接。

## 4. 实现边界

本提案的后续实现只允许修改 `@loomrealm-game/common-controls` 中现有 `game-controls-input` 的实现及其专属测试：

- `browser/device-input.browser.ts`：组件内部的 modal dialog、top-layer 顺序维护、按钮事件、全屏状态监听与清理。
- 如确有必要，可在同一组件内部增加私有辅助函数；不得为此新增第二个 Browser bundle 或公共输入通道。
- 专属测试覆盖长按状态与 DOM 行为。

不修改：

- `src/model.ts`、`ControlsButtonV1`、`ControlsEventPayloadV1` 或其根导出。
- `controls.state` / `controls.event` 的载荷或通道。
- `controls-source.ts` 的键盘映射、手柄轮询和统一状态机语义，除非实现中发现不可避免且经单独评审的缺陷。
- `game-keyboard-input`、`game-gamepad-input`、`game-pointer-input`。
- LoomRealm Framework、Renderer、Main、Hostra launcher 或 PWA launcher。

遮罩层是组件自己的临时 UI，不属于游戏业务状态，不通过 RenderDomain 或 Session Events 发布。

## 5. 验收标准

实现完成后至少验证：

1. 短按 Select 不显示遮罩层；长按达到阈值只显示一次。
2. Keyboard 和 Gamepad 的 Select 都能唤出同一个遮罩层；同时按住同一按键不会重复打开。
3. 松开 Select 不会自动进入或退出全屏。
4. 进入按钮的真实 click handler 直接调用 `document.documentElement.requestFullscreen()`；退出按钮的真实 click handler 直接调用 `document.exitFullscreen()`。
5. 没有在长按计时器、Gamepad polling、`confirm()` 或合成 click 中调用全屏 API。
6. 成功进入/退出、通过 Esc 退出、API 不支持、Promise rejection 等情况下，UI 都与实际 `fullscreenElement` 状态一致。
7. 遮罩层使用 `dialog.showModal()` 进入 top layer，并设置 `z-index: 2147483647` 作为防御性样式；不能只用普通 `div` 和高 `z-index`。
8. 在进入和退出全屏时，验证 fullscreen element 不会把仍打开的 dialog 压到后面；必要时通过 close/showModal 重排 top-layer 顺序，并恢复焦点。
9. API 请求失败时遮罩层保留并显示错误；用户可以关闭或重试。
10. 原生按钮可通过鼠标/触摸点击，也可通过键盘焦点和 Enter/Space 激活；焦点在按钮上时不发生游戏键盘采集冲突。
11. 组件卸载时关闭并移除 dialog、document/window listeners 和计时器；重新挂载不会留下重复遮罩层或监听器。
12. 现有 Controls ABI、六个 raw device channels、`game-controls-input` 的两个现有频道及其资格测试不变。
13. 在目标 PWA 浏览器上分别验证键盘和手柄唤出遮罩层；明确记录纯手柄且无指针/键盘时不能保证进入全屏的限制。

## 6. 参考

- [MDN: Element.requestFullscreen()](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)
- [MDN: Document.exitFullscreen()](https://developer.mozilla.org/en-US/docs/Web/API/Document/exitFullscreen)
- [MDN: Document.fullscreenchange event](https://developer.mozilla.org/en-US/docs/Web/API/Document/fullscreenchange_event)
- [MDN: UserActivation](https://developer.mozilla.org/en-US/docs/Web/API/UserActivation)

本文为设计提案；状态只有在实现、测试和目标平台资格验证完成后才能更新。
