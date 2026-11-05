# Battle v0 过程消息输出补充说明

> 状态：**ADDITIVE PROPOSAL / NON-AUTHORITATIVE / NOT YET IMPLEMENTED**
>
> 本文只定义如何把现有 Decision 流程中已经产生的可见文本作为过程消息展示给玩家。它不修订 Battle gameplay、DecisionPort、Simulation、Replay 或 Presentation v0 的既有权威契约。若本文与现有冻结文档产生冲突，以现有冻结文档为准。

## 1. 目标与边界

目标只有一个：

> 在现有 Battle / Decision 流程执行期间，把 AI 已经产生的过程文本展示给玩家；不改变这次 Decision 最终返回的 Plan，也不改变 Battle 如何验证、执行或结算 Plan。

本补充**不**引入新的 gameplay contract，不改变现有流程顺序，也不要求增加新的 Battle State。

## 2. 直接复用现有 Decision 输出

当前 `BATTLE_V0_DECISION.md` 已冻结的 workflow：

```text
DecisionRequest
      ↓
Call A — Analyze + Strategize
      ↓
visible assistant output_text
      ↓
strategyMemo: string
      ├─ 传给现有 Call B
      └─ 作为过程消息输出给玩家（新增的旁路）
      ↓
Call B — Materialize
      ↓
existing PlanSubmission parser
      ↓
existing DecisionCompletion
      ↓
Simulation-owned Decision Inbox
      ↓
existing validation / correction / execution
```

Call A 已经要求返回 `SITUATION` 与 `STRATEGY` 两个可见部分；adapter 当前将完整 visible output 保存为一个 opaque UTF-8 `strategyMemo` string，再传给 Call B。

过程消息直接复用这一个 `strategyMemo`：

- 不新增 LLM call；
- 不改变 Call A / Call B 的顺序、prompt、schema 或请求参数；
- 不解析、重写或删减 `strategyMemo`；
- Call B 仍收到原来完全相同的 `strategyMemo`；
- 不把 Call A 输出写入 `PlanSubmission` 或 `DecisionCompletion`；
- 不读取或展示 provider 的 hidden `reasoning` / `reasoning_text` item。

因此，这里展示的是 Call A 已经生成的**可见文本**，不是模型内部隐藏推理。

当前 provider request 固定 `stream = false`。所以本补充输出的是 Call A 完成后的一条完整过程消息，不是 token-by-token streaming；不为实现实时 token streaming 而修改现有 transport 或 provider request。

## 3. 唯一新增的 Decision 接口是可选 observer，不是新的数据结构

保留以下现有接口与数据结构不变：

```ts
DecisionPort.decide(request, signal): Promise<DecisionCompletion>

DecisionRequest
DecisionCompletion
PlanSubmission
PlanRejectReason
DecisionFailure
```

在 concrete `DeepSeekDecision` 上增加一个**可选的第二构造参数**，仅用于接收过程消息：

```ts
new DeepSeekDecision(
  { transport },
  (request, message) => {
    // non-blocking presentation notification
  },
)
```

observer 的概念签名为：

```ts
(request: DecisionRequest, message: string) => void
```

约束：

- 这是 concrete Decision implementation 的可选输出回调，不属于 `DecisionPort`；
- 不改变 `DeepSeekDecisionOptions` 的现有字段；
- 不改变 `decide(request, signal)` 的参数或返回值；
- 不增加 `DecisionWorkflowResult`、`DecisionCompletion` 或任何新的 Battle DTO 字段；
- 现有 `new DeepSeekDecision({ transport })` 调用继续有效；
- observer 缺省时，Decision 行为与当前实现完全一致；
- observer 同步调用、不得被 await；observer throw 必须被隔离，不得改变 Decision 成功/失败结果；
- 只在 Call A 成功提取出非空 visible output 后调用一次；Call A 失败、请求已 abort 或没有合法 visible output 时不发送；
- correction 是新的既有 `DecisionRequest` / `decide()` attempt，因此它可以输出自己的过程消息；不改变 Simulation correction ownership。

observer 只接收现有 request 与一个 string，不定义 `DecisionReason`、`DecisionRationale` 或新的 message DTO。

## 4. 复用现有 RenderEvent 输出到 Battle View

过程消息是 Presentation-only、non-authoritative、transient event。使用 LoomRealm 已有能力：

```text
DeepSeekDecision optional observer
        ↓
BattlePresentationHandler.emitProcessMessage(text)
        ↓
existing RenderDomain.emit(...)
        ↓
existing render.event
        ↓
WebProjector.deliverRenderEvent(...)
        ↓
lr-battle-view.receiveRenderEvent(...)
        ↓
Battle View 内的临时消息提示
```

约定：

- 目标节点仍是现有 `battle:view`；
- Event name 使用 `battle.process-message`；
- payload 只携带 `{ text: string }`；
- `lr-battle-view` 在自身 Shadow DOM 内显示临时消息；可由新消息替换当前提示；
- 不新增 RenderDomain、RenderNode、slot、Panel 或 HUD node；
- 不改变 `BattleViewRenderData`、`BattleHudRenderData`、Render Tree 或 viewport geometry；
- 不调用 `domain.update()` 来伪造 gameplay/visual state；
- 不递增 `visualEpoch`；RenderEvent 本身不修改 RenderDomain revision/state；
- 不等待 Renderer ACK、paint 或 UI 消费结果。

Render Update v1 的 Event 已经是 ordered / transient / non-authoritative / no-replay。若 view 尚未建立、已关闭或事件不再适用，消息可以丢弃；不重放、不重试，也不影响 Battle。

`BattlePresentationHandler.emitProcessMessage(text)` 是具体 Browser Presentation handler 的 additive helper；它不是 `PresentationPort` 的新必需方法，Simulation 不依赖它。

## 5. 与现有 Message Frame 的区别

现有 PokeMan `Message Frame` 继续只承担需要玩家操作的交互，例如：

- Host background 后的继续 / 退出；
- Decision circuit pause 后的重试 / 退出。

它仍然使用现有：

```text
frame.call("message", prompt)
→ child Message Frame
→ player action
→ { messageKey, actionId }
```

过程消息不调用 `frame.call("message")`，不创建子 Frame，不等待玩家确认，不暂停或恢复 Battle。它只是 Battle View 上的一次性提示。

## 6. 不得改变的既有语义

| 既有部分 | 本补充的处理 |
|---|---|
| `DecisionPort` | 完全不变 |
| `DecisionRequest` / `DecisionCompletion` | 字段与语义完全不变 |
| `PlanSubmission` / `PlanRejectReason` | 完全不变 |
| Call A / Call B | 顺序、次数、prompt、schema、transport policy 完全不变 |
| Simulation Tick / reducer / Decision Inbox | 完全不变 |
| Plan validation / correction / accepted-plan pipeline | 完全不变 |
| Decision availability circuit / pauseReason | 完全不变 |
| Replay / BattleSnapshot / BattleResult | 不保存过程消息 |
| Message Frame | 继续用于阻塞式玩家交互，不承载过程消息 |
| Presentation Render Tree / RenderData ABI | 完全不变 |

尤其禁止：

- 把 message 或 rationale 塞进 `PlanSubmission`；
- 把 message 塞进 `DecisionCompletion.completed`；
- 让 Simulation 根据 message 文本分支；
- 把过程消息当成 Plan 已被接受、行动已执行或 Battle 已结算的证明；
- 用过程消息覆盖 `PlanRejectReason`、`DecisionFailure` 或 `BattlePauseReason`；
- 将过程消息写入 Replay、Shared State 或 authoritative RenderData。

## 7. 最低验证要求

1. observer 缺省时，现有 DeepSeekDecision tests 与输出保持不变；
2. Call A 成功时，observer 收到与传给 Call B **字节内容一致**的完整 `strategyMemo`；
3. Call A 失败 / abort / 空输出时，不发送策略文本；
4. observer throw 不改变最终 `DecisionCompletion`；
5. Call B 仍按原 schema 生成并解析 `PlanSubmission`；
6. correction attempt 仍由 Simulation 发起，并可单独输出对应过程消息；
7. `render.event` 只到现有 `battle:view`，不修改 RenderDomain state/revision、`visualEpoch` 或 Replay；
8. `lr-battle-view` 使用 `receiveRenderEvent` 显示文本，不改变 Render Tree / RenderData ABI；
9. 消息不创建 Message Frame、不等待用户输入，也不暂停 Battle；
10. Frame abort、Presentation close 或事件不适用时，迟到消息被丢弃且不产生 gameplay side effect。

本补充实现完成前，当前代码仍没有 Decision process-message observer，也没有 `lr-battle-view.receiveRenderEvent` 处理器；不得把本文的 proposed behavior 描述成已经实现或通过 qualification。
