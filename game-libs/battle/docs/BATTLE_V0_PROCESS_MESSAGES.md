# Battle v0 AI 过程文本：统一消息流补充说明

> 状态：**ADDITIVE PROPOSAL / NON-AUTHORITATIVE / NOT YET IMPLEMENTED**
>
> 主设计：[Battle 决策性能与战斗消息流设计方案](./BATTLE_DECISION_PERFORMANCE_AND_MESSAGE_FEED_DESIGN.md)。
>
> 本文只规定如何复用 Call A 已产生的 visible `strategyMemo`，并把它与 Runtime / Simulation 的玩家可感知事件写进**同一条 Battle Message Feed**。它不修订 Battle gameplay、DecisionPort、Simulation Plan、Replay 或 Presentation v0 权威契约；遇到 v0 冻结 gameplay 冲突时以冻结契约为准。

## 1. 唯一消息面板

Battle View 上半部分右侧只有一个 Activity Panel：

```text
【小红】开始分析局势……
【小明】发动雷电术。
【小红】受到 15 点伤害。
【小红】思考结束：当前距离敌人三格，应先靠近再进攻。
【小红】决定向敌人移动。
```

每条是独立追加的历史事件，统一按 Runtime Message Dispatcher 的 `sequence` 排序，最新置顶；各 Actor 的文字自然交错。显示采用本地 `【{actorName}】{description}` 字符串模板，系统消息用 `【系统】`。具体模板、滚动、容量和 Battle 关闭后立即清理的规则由主设计定义。

**不创建第二个临时 AI 提示层，不把 Call A 文字当作 Thinking 状态卡，也不通过 RenderEvent 单独投递一份过程消息。**

## 2. 直接复用已存在的 Call A 输出

现有冻结工作流保持不变：

```text
DecisionPort.decide(request, signal)
  → Call A: Analyze + Strategize
  → visible assistant output_text / strategyMemo: string
       ├─ 原样传入既有 Call B
       └─ 可选 processMessageObserver(request, strategyMemo)
              → Runtime 检查仍有效、玩家可见的 request
              → decision.analysis_completed
              → 同一 Runtime Message Dispatcher / Feed / Panel
  → Call B: Materialize
  → 既有 PlanSubmission parser
  → 既有 DecisionCompletion
  → Simulation Inbox / 校验 / correction / execution
```

- 不增加 LLM call，不改变 Call A / Call B 的顺序、prompt、schema、参数和 `stream: false` 策略。
- `strategyMemo` 为 Call A 已生成的**可见** `SITUATION` / `STRATEGY` 文本；不得读取 provider hidden `reasoning` / `reasoning_text`。
- Call B 继续接收与原实现**字节内容一致**的完整字符串；不得为 UI 的文案模板、长度限制或换行而修改它。
- `decision.analysis_completed` 只表示 Call A 获得了可见策略文本。字符串模板中的“思考结束”是分析阶段结束，不代表 Call B 已结束、Plan 已被接受或动作已执行。
- UI 只按**纯文本**展示非权威内容，过滤不适当的控制字符，提供长度/溢出保护；不将它解释成 HTML/Markdown，也不显示凭据、Prompt、原始 Provider body 或内部 reasoning。
- `decision.accepted` 仍仅由 Simulation 在 `acceptPlan` 后生成，不能从文本推断；不能根据策略文本推进 Battle。

## 3. 最小可选 observer 接口

既有以下接口及结构原样保留：

```ts
DecisionPort.decide(request, signal): Promise<DecisionCompletion>
DecisionRequest
DecisionCompletion
PlanSubmission
PlanRejectReason
DecisionFailure
```

只对 concrete `DeepSeekDecision` 增加一个**可选的第二构造参数**：

```ts
const processMessageObserver = (request: DecisionRequest, message: string): void => {
  runtime?.reportDecisionAnalysis(request, message);
};
new DeepSeekDecision({ transport }, processMessageObserver);
```

`processMessageObserver` 是 concrete Decision 的旁路输出，不属于 `DecisionPort`，不得增加 `DecisionCompletion`、`PlanSubmission`、`DecisionWorkflowResult` 字段或调整 `DeepSeekDecisionOptions` 的现有必填键。

- observer 缺省时，Decision 行为与当前 v0 完全一致。
- 只在 Call A 成功获得非空完整 visible strategyMemo、且自身 AbortSignal 未取消后调用一次。
- Call A 失败、abort 或空输出时不调用；observer 同步执行、不得 await；throw 必须隔离，不影响 Call B / Decision 结果。
- correction attempt 虽然仍使用同一个 concrete Decision workflow，但它属于内部修正；主设计第一版**不将 correction / prefetch / retry 的 Strategy Memo 显示给玩家**。可在 observer 层交付给 Runtime，由 Runtime 按该 request 的 trigger reason 统一筛选，避免两处建立不一致的展示逻辑。

## 4. 统一 Runtime 分发与过期检查

主设计定义非权威接入口：

```ts
interface BattleRuntime {
  onMessage(listener: (message: BattleMessage) => void): () => void;
  reportDecisionAnalysis(request: DecisionRequest, strategyMemo: string): void;
}
```

`reportDecisionAnalysis` 是供受信任的 PokeMan composition 传入 Decision 观察结果的 best-effort 接口，不是 Simulation gameplay command；它不修改 Battle State、Decision Inbox、Replay、RenderProjection 或 Request 生命周期。

Runtime 在追加 `decision.analysis_completed` 前，必须校验：

1. Battle 仍然存活且尚未结束，当前 requestId、actorId 与 generation 对应仍有效的 Decision 请求。
2. 请求未 abort、未 stale，确实属于已发布 `decision.started` 的玩家可感知轮次（initial、damaging_hit、plan_exhausted、plan_failed）。
3. 同一有效请求没有重复发布过分析完成消息，策略文本为完整、非空的 visible 输出。
4. 该事件与既有 Runtime Events、Simulation Facts 由**同一个 Dispatcher 分配 sequence / id / elapsedMs**，观察者异常被隔离。

不满足条件则静默丢弃；旧请求受击取消后即使 Call A 迟到，也不能写入 Feed，不需要更新或删除旧的“开始分析”消息。策略消息与其他 Actor 的已提交攻击、伤害和移动事件可以交错；以真实发布顺序记录，不能事后插回旧位置。

`processMessageObserver` 只把已经完成的可见文本转交 Runtime，**不会**触发一次新的决策、改变 Reason、创建额外 Request 或影响任何已有 Plan 校验。

## 5. 与 Presentation、Message Frame 和关闭生命周期的关系

- PokeMan composition 在 `runtime.run()` 前订阅 `onMessage`，把三类来源统一写进同一个有界、追加式 Message Feed；在 Subsystem 侧通过 `Feed.subscribe` 把有界快照转成 PokeMan-owned UI-only RenderDomain 的**单个稳定 Panel RenderNode** 的 RenderData，Browser Activity Panel 只读取这些展示数据。不得假定 Browser Web Component 可直接访问 Subsystem 的内存 Feed；不得为每条消息新增 RenderNode。
- 过程文本不再通过 `BattlePresentationHandler.emitProcessMessage`、`battle.process-message` 或 `lr-battle-view.receiveRenderEvent` 建立**单独的瞬时提示**；这些是被主设计统一 Feed 取代的旧提案路径，不作为本轮实现要求。
- Activity Panel 不属于 Battle gameplay RenderProjection，也不修改 Battle State；表现层故障不得影响 Simulation、Decision、BattleResult 或正常 Battle 关闭。
- 现有 `frame.call("message", prompt)` 仅保留 Host background / Decision circuit 等需要玩家操作的暂停、继续、退出交互。战斗日志和策略文字不创建 Message Frame、不等待玩家点击、不改变 Battle pause 状态。
- 本轮只保存 Battle 运行期间的有界消息历史。Battle 关闭（`Runtime.close` / Frame 清理）时取消订阅并清空 Feed，不提供战后历史阅读或 Replay 重建。

## 6. 最低验证要求

1. observer 缺省、抛错、Call A 失败 / abort / 空输出时，原 DecisionCompletion 与 Call B 行为不变。
2. Call A 成功时 observer 收到与传给 Call B 字节一致的 strategyMemo；不暴露 hidden reasoning。
3. 每次玩家可感知、仍有效的 Call A 最多一条 `decision.analysis_completed`；prefetch / correction / retry 不显示孤立策略文本。
4. stale generation、Request abort、Battle close 后迟到的文本被丢弃，不在 Feed 中插入新的“思考结束”消息。
5. 战斗事实与策略消息共用同一 sequence、同一 `【Actor】` 模板及右侧 Activity Panel，不出现第二个临时 UI。
6. `decision.analysis_completed` 不得替代 `decision.accepted`；Plan 校验、Replay v1、pause / resume、BattleResult 不变。
7. UI 以 textContent 等安全纯文本方式显示 AI 输出；长文本、未知 Actor ID 和消息面板故障不影响 Battle。
8. Battle 关闭后消息与订阅全部释放；不修改已有 `Message Frame` 的交互语义。

> **实施状态：未落地。** 当前代码尚无可选 observer、`reportDecisionAnalysis` 或统一 Feed 事件桥接；不得将本文当成已完成资格验证的实现说明。
