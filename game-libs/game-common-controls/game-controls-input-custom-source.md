# game-controls-input 组件内 CustomEvent 输入源

> 状态：**Active / Normative Extension / Implemented**
> 位置：`game-libs/game-common-controls/game-controls-input-custom-source.md`
> 所属包：`@loomrealm-game/common-controls`
> 相邻实现：[统一操控输入 Web Component](./game-controls-input.md)
> 现行契约：[Game Common Controls Input v1](../../doc/15-contracts/game-common-controls-input-v1.md)
> 现行资格证据：[Unified Controls Input Qualification](../../doc/30-implementation/game-controls-input-qualification.md)
> executable implementation subject：[`37940e76c811ddc7052e6592e9aa3d9419f1ed07`](https://github.com/lithdoo/loom-realm/commit/37940e76c811ddc7052e6592e9aa3d9419f1ed07)
> 本扩展资格证据：[Custom Controls Input Qualification](../../doc/30-implementation/game-controls-custom-input-qualification.md)

本文给现有 `<game-controls-input>` 增加第三种、**仅存在于组件内部的 Controls 输入源**：测试驱动通过 DOM `CustomEvent` 把一份完整的 14 键按下快照交给组件，组件把它与现有 Keyboard / Gamepad 状态一起送入同一个 Controls Machine，最后仍然只产生现有的 `controls.state` / `controls.event`。

这不是新的 Subsystem 输入协议。CustomEvent 不进入 Session Events，不经过 `WebPresentationContext.emitCustomEvent`，不增加 Presentation channel，也不要求 Map、Dialogue、Battle 或其他 Subsystem 知道输入来自测试驱动。

本文作为现行 [统一操控输入 Web Component](./game-controls-input.md) 的 additive normative extension 已实现；实现与 qualification subject 只由上方记录及专属资格证据声明，不改写原 Controls v1 的历史 subject。

## 1. 规范关系与冻结决策

### 1.1 与现行 Frozen 文档的关系

[统一操控输入 Web Component](./game-controls-input.md) 继续拥有现行 Controls v1 的公开 ABI、14 键词汇、`controls.state` / `controls.event`、State-before-Event、Top Active Frame routing、refresh / stale fallback、Keyboard capture 与物理 Gamepad 行为。

**本文在实现后成为它的 additive normative extension**，只扩展下面三类内部语义：

1. input source enumeration：从 Keyboard + Gamepad 增加为 Keyboard + Gamepad + Custom；
2. effective held calculation：从 `keyboard || gamepad` 增加为 `keyboard || gamepad || custom`；
3. edge-producing source mutation：除既有 Keyboard / Gamepad physical edge 外，接受的 Custom snapshot delta 也可以产生正常的 `controls.event` edge。

因此实现后遇到以下旧文档句子时，以本文为增量补充：

```text
组件内部自己监听键盘、自己轮询手柄
effective = keyboardDown || gamepadDown
physical edge = accepted Keyboard / tracked Gamepad edge
```

解释为：

```text
组件内部监听 Keyboard、轮询 Gamepad，并监听本文定义的 element-local CustomEvent
effective = keyboardDown || gamepadDown || customDown
edge-producing source mutation = existing physical edge + accepted Custom snapshot delta
```

除此之外，旧文档继续生效。本文**不修改** `ControlsButtonV1`、两条 Controls channel、公开 payload、Frame routing 或任何 Subsystem contract，也不把旧文档的历史 implementation / qualification subject 改写成新代码证据。

实现 PR 已完成源码、测试、纵向 E2E 与专属 qualification evidence，本文状态因此为 `Active / Normative Extension / Implemented`。

### 1.2 第一版冻结决策

后续实现 Agent 不需要重新做架构选择，按下面六项直接落地：

1. **只增加一个第三输入源**，名称为本文中的 Custom / Automation source；不伪装成 Keyboard，也不伪装成浏览器 Gamepad。
2. **组件内只有一份 Custom held 状态**；不支持 `sourceId`、多虚拟设备、多玩家或多个并发注入源。
3. DOM 入口固定为元素自身的 `loomrealm:debug-input` CustomEvent，detail 固定为 `{ version: 1, down: ControlsButtonV1[] }`。
4. Custom source 与 Keyboard、Gamepad 按 OR 合并；它的显式快照变化按正常用户边沿处理，产生现有 State-before-Event publication。
5. 不增加构建 profile、第二份 browser bundle、运行时 debug flag、HTML attribute 或 Subsystem 配置。监听器随 `game-controls-input` 一起存在，但只有主动向该元素 direct-dispatch 精确事件才生效。
6. 不改冻结的 Controls v1 公开 ABI、两条 Controls channel、14 键集合、raw device channel、PokeMan consumer 或 Framework。

如果后续需要多注入源、模拟 raw Gamepad axes、生产环境移除测试钩子或安全隔离，另开设计；第一版不预留半成品机制。

## 2. 背景

当前统一控制链路是：

```text
Physical Keyboard
      │
      ▼
Keyboard adapter ───┐
                    │
Physical Gamepad    │
      │             │
      ▼             │
Gamepad adapter ────┼──> Controls Machine
                    │          │
                    │          ▼
                    │   controls.state/event
                    │          │
                    │          ▼
                    │    Top Active Frame
                    │          │
                    │          ▼
                    │      Subsystem
```

Android 掌机存在一个自动化空洞：页面 navigate / reload 后，Chrome 可能在真实手柄发生一次物理按键前不把设备暴露给 `navigator.getGamepads()`。ADB / CDP 可以控制页面，但不能替代该硬件唤醒。

本提案只补 LoomRealm 组件入口：

```text
CDP / Playwright
      │
      ▼
CustomEvent on <game-controls-input>
      │
      ▼
Custom adapter ─────┐
                    │
Keyboard adapter ───┼──> same Controls Machine
                    │
Gamepad adapter ────┘
```

因此它可以自动验证“组件 → Controls Machine → Top Active Frame → Map / Dialogue”等 LoomRealm 链路，但**不能**证明 Android input driver、Chrome Gamepad enumeration、AYANEO mapping 或实体按键本身正确；这些仍由独立的真实硬件 smoke test 负责。

## 3. DOM 输入契约

### 3.1 事件名、目标与传播边界

事件名固定：

`loomrealm:debug-input`

事件必须 direct-dispatch 到当前活动的 `game-controls-input` 元素：

```js
const controls = document.querySelector("game-controls-input");
if (!controls) throw new Error("game-controls-input is not mounted");

controls.dispatchEvent(new CustomEvent("loomrealm:debug-input", {
  detail: { version: 1, down: ["up"] },
  bubbles: false,
  composed: false,
  cancelable: false
}));
```

监听器只安装在该元素实例上，不安装到 `window`、`document` 或全局 event bus。handler 必须首先要求：

```ts
event instanceof CustomEvent
&& event.target === eventTarget
&& event.bubbles === false
&& event.composed === false
&& event.cancelable === false
```

任一条件不满足就静默忽略。

这里的边界是 **direct target + non-bubbling + non-composed**，不是“DOM 私有事件”。DOM capture phase 会先经过祖先，因此本文**不承诺**祖先 capture listener 看不到事件，也不要求用 `stopPropagation()` 伪造这种保证。组件只保证：

- 它自己只接受直接发给自己的精确事件；
- 默认 helper 产生 non-bubbling / non-composed event；
- 它绝不把原始 CustomEvent 转成 LoomRealm Session Event、Presentation Event 或 Subsystem API；
- 事件没有任何 Framework destination 字段。

现有 duplicate ownership 继续生效：只有成功取得 `"controls"` ownership 的 `game-controls-input` 会启动 source，也只有它会安装监听器。带 `data-input-disabled="duplicate"` 的重复实例没有监听器。

### 3.2 detail 形状

v1 detail 是封闭形状：

```ts
interface DebugControlsInputDetailV1 {
  readonly version: 1;
  readonly down: readonly ControlsButtonV1[];
}
```

校验规则固定：

- `detail` 必须是当前页面 Realm 的 plain object（prototype 为 `Object.prototype` 或 `null`），且非 null、非 Array。
- 自有 enumerable key 必须恰好为 `version`、`down`，不接受额外字段。
- `version === 1`。
- `down` 必须是 Array。
- 每个成员必须属于现有 `CONTROLS_BUTTONS_V1`。
- 不允许重复按钮。
- 最多 14 个按钮。
- 接受后按 `CONTROLS_BUTTONS_V1` 的规范顺序 canonicalize，再交给 Controls Machine。
- 非法 detail **静默忽略**：不修改状态、不发布 State/Event，也不依赖 DOM listener 异常传播。

不加入 ACK。自动化测试通过后续可观察游戏状态或现有 Controls publication 判断动作是否生效；不要发明第二条回执协议。

### 3.3 快照语义

每个事件携带 **Custom source 当前完整 held 快照**，不是一条 `keydown` / `keyup` 命令：

```js
send([]);                  // neutral
send(["up"]);              // Custom: press up
send(["up", "south"]);     // keep up, press south
send(["south"]);           // release up, keep south
send([]);                  // release all
```

固定规则：

- Custom source 初始永远是空集合。
- 第一份非空快照从 neutral 计算正常 down edge。
- 相同快照重复发送是 no-op。
- 空快照释放 Custom source 当前全部按钮，并产生真正导致 effective 变化的 up edge。
- 不模拟 Keyboard DOM repeat；Custom source 自己产生的 event 始终 `repeat: false`。
- 不维护 source identity、设备 id、轴值、压力或 vendor mapping。

完整快照比独立 down/up 指令更适合自动化：每次接受都能修复 Custom source 的完整状态，测试 finally 只需发送一次 `[]` 即可回到 neutral。

## 4. Controls Machine 的精确改造

### 4.1 私有接口

在现有内部 `ControlsMachine` 增加一个方法；它仍然不从 package root 导出：

```ts
applyCustomState(
  pressed: readonly ControlsButtonV1[],
): ControlsPublication;
```

内部新增且只新增一份：

```ts
let custom = new Set<ControlsButtonV1>();
```

### 4.2 effective 状态与 backward-compatibility invariant

现有 effective 计算扩成：

```text
effective(button)
  = keyboard.has(button)
 || anyPhysicalGamepadHas(button)
 || custom.has(button)
```

保持现有规范顺序：

```ts
CONTROLS_BUTTONS_V1.filter((button) => effective(button))
```

为了避免三个 Keyboard 分支各自漂移，内部固定一条辅助语义：

```ts
otherSourceDown(button)
  = gamepadDown(button) || custom.has(button)
```

Keyboard 的首次 down、repeat、up 三处统一使用它：

- 首次 `keydown`：如果 `otherSourceDown(button)` 已经为 true，Keyboard 加入 held 但不能再发第二个 down。
- held Keyboard 的 `domRepeat === true`：**只有** `otherSourceDown(button) === false` 才允许现有 `repeat:true` down Event。
- `keyup`：如果 `otherSourceDown(button)` 仍为 true，Keyboard 释放不能发 up。

这不是修改既有 Keyboard + Gamepad 行为，而是把已有“Gamepad 同键占用时抑制 Keyboard 重复/边沿”的规则推广到第三个 source。

实现必须维持下面的兼容性不变式：

```text
对任意只包含现有 Keyboard / Gamepad 操作的输入序列 S：

当 Custom 始终为空时，
newMachine(S) 的所有 ControlsPublication
必须与 oldMachine(S) 完全相同。
```

尤其：

```text
Keyboard held + Gamepad not down + Custom empty
    -> 原有 repeat:true 仍然产生

Keyboard held + Gamepad down + Custom empty
    -> 原有 repeat suppression 仍然成立

Keyboard held + Gamepad not down + Custom down
    -> 新增场景：repeat 被同样抑制

Custom release while Keyboard still held
    -> 不产生 up；之后新的 DOM repeat 可恢复 repeat:true
```

现有 Gamepad 多设备 OR 规则保持不变；Gamepad snapshot 更新时，`effectiveDown()` 自然包含 Custom held，所以物理 Gamepad 释放也不能错误释放仍由 Custom 持有的按键。

### 4.3 applyCustomState

行为固定为：

1. 如果 `windowUsable !== true`，返回现有 `NONE`，不保存该快照。
2. 记录变更前的 effective button 集合。
3. 用 canonicalized `pressed` 替换整份 `custom`。
4. 计算变更后的 effective 集合。
5. effective 集合变化时只发布一份完整 State。
6. 对真正发生 false→true / true→false 的 effective transition，按 `CONTROLS_BUTTONS_V1` 顺序生成 down/up Event，全部 `repeat: false`。
7. 没有 effective 变化则不发 State/Event。

例如：

```text
Custom up down
  -> state [up]
  -> event down up false

Physical Keyboard ArrowUp down
  -> effective 已经是 up
  -> no publication

Custom []
  -> Keyboard 仍持有 up
  -> no publication

Keyboard ArrowUp up
  -> state []
  -> event up up false
```

Custom snapshot 同时改变多个按钮时：

```text
custom [up, south]
  -> custom [left, east]

先：
  state [left, east]

再按 CONTROLS_BUTTONS_V1 顺序：
  up up false
  down left false
  up south false
  down east false
```

Event 顺序只看现有 button canonical order，不按输入数组顺序。

### 4.4 reconciliation / lifecycle

Custom source 是第三个 Controls source，不属于 Keyboard capture。因此：

| 转换 | Custom source |
| --- | --- |
| `Keyboard capture available -> unavailable` | **不清除 Custom** |
| `Keyboard capture unavailable -> available` | **不恢复、不修改 Custom** |
| `Window usable -> unusable` | **清空 Custom**，与现有 Window reconciliation 一起只发布 State，不合成 up Event |
| `Window unusable -> usable` | Custom 从 empty 开始，不恢复旧状态 |
| component stop / disconnect | 停止 listener 后清空内存，不补 State/Event，沿用现有 stop 语义 |

这项选择是刻意的：Custom source 是自动化 Controls 输入，不是在伪造可信 KeyboardEvent；把焦点放到 button/input 上不应该让 CDP 失去控制。Window 是否 visible + focused 仍然是统一的总可用性门。

## 5. Browser adapter 的精确改造

当前签名：

```ts
createControlsInputSource(target: Window)
```

改成：

```ts
createControlsInputSource(
  target: Window,
  eventTarget: HTMLElement,
)
```

`GameControlsInputElement.startIfReady()` 在取得 `"controls"` ownership 后调用：

```ts
createControlsInputSource(target, this)
```

`controls-source.ts` 新增：

- 常量 `DEBUG_CONTROLS_EVENT = "loomrealm:debug-input"`，只在该模块内部使用。
- 私有 event/detail validator + canonicalizer。
- `eventTarget.addEventListener(DEBUG_CONTROLS_EVENT, handler)`。
- stop 时对应 `removeEventListener`。

handler 顺序固定：

```text
收到 loomrealm:debug-input
  -> validate CustomEvent + direct target + flags
  -> invalid: return
  -> validate + canonicalize detail
  -> invalid: return
  -> send(machine.applyCustomState(down))
```

不要：

- 构造或 dispatch `KeyboardEvent`。
- 修改或 monkey-patch `navigator.getGamepads()`。
- 调用 raw `game-keyboard-input` / `game-gamepad-input`。
- 直接调用 `this.context.emitCustomEvent(...)` 绕过 Controls Machine。
- 暴露 package root helper。
- 新增另一个 Custom Element。
- 依赖 `stopPropagation()` 建立不可实现的 capture 隐私保证。

现有 Keyboard `event.isTrusted === true` 校验必须原样保留；Custom source 不得通过放宽该条件实现。

## 6. 暴露边界

第一版**不做 build-time debug gating**。

原因不是把它当成产品 API，而是避免为一个 DOM 测试 seam 引入新的构建 profile、第二 bundle、PokeMan 专属开关或 Subsystem 配置。当前目标只是让页面级 CDP / Playwright 能把 normalized Controls 状态送入已经存在的组件。

边界仍然清晰：

- 入口只存在于浏览器页面里的活动 `game-controls-input` 元素。
- 不进入 Subsystem process。
- 不进入 Session Events。
- 不新增 Controls / Framework channel。
- 不增加网络端口或宿主 RPC。
- 不自动采集；没有精确 direct CustomEvent 就没有行为。

同一页面 Realm 中已经执行的 JavaScript 本来就不是 LoomRealm 的安全隔离边界；如果未来需要把 Presentation script 视为不可信代码，必须整体设计浏览器 Realm / capability 隔离，不能把本输入 seam 的 build flag 当成安全边界。

如果产品未来明确要求 production bundle 不含该测试 seam，再单独设计构建变体；不把该复杂度塞进第一版。

## 7. 实现 PR 的固定文件范围

实现 Agent 的允许范围固定如下；其中最后三项是**必须的文档收尾**，不是可选项：

```text
Runtime
    game-libs/game-common-controls/src/controls-machine.ts
    game-libs/game-common-controls/browser/controls-source.ts
    game-libs/game-common-controls/browser/device-input.browser.ts

Tests
    game-libs/game-common-controls/test/controls-machine.test.mjs
    game-libs/game-common-controls/test/controls-browser.test.mjs
    apps/pwa/test/pokeman-staging.e2e.test.mjs

Generated installed resources
    [FSDB]PokeMan/[resource]Presentation/controls/device-input.browser.js.js
    examples/essentials-v21.1/[FSDB]essentials-v21.1/[resource]Presentation/controls/device-input.browser.js.js

Documentation closure
    game-libs/game-common-controls/game-controls-input-custom-source.md
    game-libs/game-common-controls/landing.md
    doc/30-implementation/game-controls-custom-input-qualification.md
```

运行时代码职责：

```text
controls-machine.ts
    增加 custom held + applyCustomState
    effective OR 纳入 custom
    Keyboard first-down / repeat / up 统一使用 otherSourceDown

controls-source.ts
    createControlsInputSource(target, eventTarget)
    监听/移除 loomrealm:debug-input
    event/direct-target/flags/detail validation + canonicalization
    调 machine.applyCustomState

device-input.browser.ts
    仅把 this 作为 eventTarget 传给 createControlsInputSource
```

仍然禁止修改：

- `src/model.ts`
- `CONTROLS_BUTTONS_V1`
- `CONTROLS_INPUT_CHANNELS`
- `game-controls-input.md` 正文
- `doc/15-contracts/game-common-controls-input-v1.md`
- raw `keyboard-source.ts` / `gamepad-source.ts` / `pointer-source.ts`
- Map / Dialogue / PokeMan Subsystem consumer
- Framework / Main / Renderer / Session Events
- PWA launcher protocol

本文本身负责声明 additive normative extension，因此不需要改写旧 Frozen 正文。

如果实现过程中发现必须修改上述禁止范围，停止扩 scope，先回到设计评审，不自行扩大 PR。

## 8. 必须覆盖的测试

### 8.1 Controls Machine

至少新增这些断言：

1. `applyCustomState(["up"])` 从 neutral 产生 State + down。
2. 相同 snapshot 重复是 no-op。
3. `applyCustomState([])` 产生 State + up。
4. 多按钮一次变化只发一份 State，Event 按 canonical order。
5. Keyboard 与 Custom 同按一键只产生一个 effective down；任一侧先释放不产生 up。
6. Physical Gamepad 与 Custom 同按一键只产生一个 effective down；任一侧先释放不产生 up。
7. Custom 与 Keyboard / Gamepad 按不同按钮时 State 正确合并。
8. `setKeyboardCapture(false)` 不清 Custom。
9. `setWindowUsable(false)` 清 Custom，只发 reconciliation State，不合成 up。
10. Window regain 后 Custom 仍为空，必须收到新 CustomEvent 才再次按下。
11. Keyboard held + Custom 同键 held 时，DOM `repeat:true` 被抑制。
12. Custom 释放、Keyboard 仍 held 后，下一次 DOM `repeat:true` 恢复现有 repeat event。
13. **Backward compatibility invariant**：至少用一组覆盖 first-down / repeat / up / Gamepad overlap / disconnect / reconciliation 的既有 Keyboard+Gamepad 序列证明 Custom 从未使用时 publication 与改造前既有断言完全一致。

### 8.2 Browser component

至少新增这些断言：

1. 活动 `game-controls-input` 接受合法 direct `loomrealm:debug-input`。
2. `window`、`document`、其他元素 dispatch 同名事件没有输入效果。
3. target 不是活动 component、或者 `bubbles/composed/cancelable` flags 不符合契约时原子忽略。
4. duplicate-disabled controls element 不接受事件。
5. 默认 non-bubbling event 不会到达 ancestor bubble listener；**不测试/不承诺 ancestor capture listener 不观察到事件**。
6. 非法 detail（null、额外字段、错误 version、未知按钮、重复按钮、非数组）全部原子忽略。
7. blocked Keyboard focus 下 Custom source 仍可工作。
8. Window blur / hidden 后 Custom held 被清，且不合成 up Event。
9. disconnect 后 listener 被移除，后续 dispatch 无 publication。
10. 现有 trusted Keyboard、standard Gamepad、Pocket Block mapping、Select overlay 回归保持通过。
11. Custom 按住 `select` 时沿现有 effective State 正常触发现有长按逻辑；不要给 Custom source 建第二套 Select 行为。

### 8.3 PokeMan staging E2E

不要把现有 Keyboard E2E 全部替换掉。保留 Keyboard 回归，再增加最小 Custom seam 纵向验证：

1. Staging PokeMan boot 后找到唯一活动 `game-controls-input`。
2. 用页面内 helper dispatch `["direction"]`，等待一次真实 Map movement，随后 dispatch `[]`。
3. 路由到 Professor 后，在 Dialogue 成为 Top Active Frame 时用 `["south"]` / `[]` 完成至少一次 Dialogue action。
4. 断言 Map 不同时消费这次 Dialogue action，证明仍走现有 Top Active Frame publication。
5. reload 后不需要物理 Gamepad wake-up，Custom seam 仍能再次完成一次 Map action。

这组 E2E 才是“Android CDP 可以复用同一个入口”的浏览器侧证据。

## 9. Bundle 与安装快照

`device-input.browser.ts` 或其依赖发生变化后，bundle 字节必然改变。

实现时必须：

1. 执行 `npm run build -w @loomrealm-game/common-controls`。
2. 将生成的
   `game-libs/game-common-controls/dist/browser/device-input.browser.js`
   **字节级复制**到：
   - `[FSDB]PokeMan/[resource]Presentation/controls/device-input.browser.js.js`
   - `examples/essentials-v21.1/[FSDB]essentials-v21.1/[resource]Presentation/controls/device-input.browser.js.js`
3. 不手工编辑两份 bundle copy。
4. 现有 `apps/pwa/test/presentation-controls-identity.test.mjs` 必须继续证明两份安装资源与 built bundle SHA-256 相同。

这一步是落地闭环的一部分，不是“最后有空再同步”的文档工作。漏掉会让 PWA 重复执行不同 hash 的 Custom Element bundle，并触发现有 collision guard。

## 10. 实现完成后的验证命令

实现 Agent 在同一个 PR 中至少执行：

```text
npm run build -w @loomrealm-game/common-controls
npm test -w @loomrealm-game/common-controls

npm run build:staging -w @loomrealm/pwa
npm run test:unit -w @loomrealm/pwa
node apps/pwa/scripts/run-e2e.mjs staging

npm run test:game-controls-input:qualification
npm run test:game-common-controls-input:qualification

npm run docs:check-links
npm run docs:build
git diff --check
```

其中 staging E2E 必须实际走新增 Custom seam；不能只证明旧 Keyboard 路径仍能工作。

如果仓库现有测试因为实现改动暴露真实回归，必须修到通过；不得通过删测试、放宽既有断言、跳过测试或把失败标成 expected 来收尾。

真实 Android Pocket Block 的 CDP 测试是后续设备 smoke，不阻塞纯代码实现完成，但它必须明确标记为：

```text
证明：页面级 Custom controls seam 在目标 Android Chrome 上可用
不证明：实体 Gamepad wake / enumeration / kernel input
```

## 11. 实现 PR 的强制收尾

为了符合仓库现有 `Frozen != Implemented != Qualified` 的做法，以下步骤全部必做：

1. 完成源码、unit/browser tests、staging E2E 和两份 bundle copy。
2. 跑第 10 节全部门禁。
3. 在源码、测试、E2E 与两份 bundle copy 都已提交后，固定该 commit SHA 为 **executable implementation subject**；第 10 节运行时门禁必须针对这份代码状态执行。随后新增 `doc/30-implementation/game-controls-custom-input-qualification.md`，记录：
   - 该 executable implementation subject SHA；
   - 本文作为 additive normative extension 的关系；
   - 实际执行的命令和 PASS 结果；
   - Custom seam 能证明与不能证明的边界；
   - 旧 `2333fea8` 只作为 Controls v1 历史 qualification，不是本实现 subject。
4. 将本文状态从 `Proposed / Design / Not Implemented` 改为 `Active / Normative Extension / Implemented`，并写入实际 implementation subject 与 qualification evidence 链接。
5. 更新 `landing.md`，把该项从 Proposed 改为已实现，并链接新的 qualification evidence。
6. evidence / proposal / landing 属于 executable subject 之后的文档提交，不改变已经验证的运行时代码 subject。完成这些文档后再次执行 `npm run docs:check-links`、`npm run docs:build` 与 `git diff --check`，并把这次文档复核结果写进 evidence。
7. 不把“CDP CustomEvent 自动化通过”描述成“真实 Android 手柄通过”。

专属 qualification evidence 是**必做**，不是“如有需要”。不用为了它新增公开协议或修改旧 Controls v1 qualification subject。最终 PR 可以包含 executable implementation commit 之后的 evidence/documentation commit；qualification 文档必须清楚区分两者。

## 12. CDP / Playwright helper 形状

实现完成后，自动化端统一使用这一种 helper：

```js
function sendControls(down) {
  const element = document.querySelector("game-controls-input");
  if (!element || element.hasAttribute("data-input-disabled")) {
    throw new Error("active game-controls-input not found");
  }
  element.dispatchEvent(new CustomEvent("loomrealm:debug-input", {
    detail: { version: 1, down },
    bubbles: false,
    composed: false,
    cancelable: false
  }));
}
```

典型动作：

```js
try {
  sendControls(["up"]);
  // wait for game-observable movement / state
  sendControls([]);

  sendControls(["south"]);
  // wait for dialogue / confirm result
  sendControls([]);
} finally {
  sendControls([]);
}
```

测试驱动负责在动作结束和异常清理时发送 `[]`。Window blur / page hide / component teardown 仍有组件侧清理作为第二层 fail-safe。

## 13. 非目标

第一版明确不做：

- 多 Custom source / `sourceId`。
- `device: "keyboard" | "gamepad"` 模式。
- raw Keyboard code、Gamepad id、axes、trigger pressure。
- repeat 注入。
- 指针注入。
- build-time debug variant 或第二 bundle。
- query parameter / localStorage / HTML attribute 开关。
- Subsystem debug API。
- Session Event debug channel。
- Android `sendevent`、UHID、Accessibility/InputManager 注入。
- 修改 `navigator.getGamepads()`。

这些需求出现时分别设计，不在本 proposal 中预埋未使用的抽象。

## 14. 结论

落地后的权威链路只有一条：

```text
Keyboard ─┐
Gamepad ──┼─> Controls Machine ─> existing controls.state/event ─> Top Active Frame
Custom ───┘
```

CustomEvent 只负责把第三份 held 快照送进组件；从 Controls Machine 往后的所有行为继续复用现有实现。Subsystem 无法区分输入来源，也不需要区分。

本文作为 additive normative extension 只扩展 source enumeration、effective OR 和 edge-producing source mutation；所有现有公开 Controls v1 语义继续保持。Custom 未使用时，既有 Keyboard / Gamepad 行为必须完全不变。

这就是第一版的完整边界。实现 Agent 不应再增加额外协议、来源 identity、构建 profile 或业务侧适配。
