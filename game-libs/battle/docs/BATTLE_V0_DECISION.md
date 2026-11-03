# Battle v0 Decision Implementation Spec

> 状态：**FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED**。
>
> 本文冻结 Battle v0 concrete Decision implementation。它不重新定义 Simulation gameplay authority：DecisionPort / DecisionRequest / DecisionCompletion / PlanSubmission 以 [BATTLE_V0_CONTRACTS.md](./BATTLE_V0_CONTRACTS.md) 为准；generation、Decision Inbox、Plan validation、correction authority、accepted/pending Plan、Replay 与 BattleResult 以 [BATTLE_V0_SIMULATION.md](./BATTLE_V0_SIMULATION.md) 为准。
>
> v0 的目标不是建立通用 AI framework，而是提供一个最小、明确、可测试的 DeepSeek Decision implementation，使 implementation agent 不需要再自行选择 provider、model、API、prompt pipeline、structured output、failure、timeout/retry 或测试架构。

## 1. Authority boundary

Battle v0 继续保持：

~~~text
Decision
  → propose PlanSubmission

Simulation
  → validate / accept / correct / execute / damage / result / replay

Presentation
  → present Simulation-owned facts
~~~

Concrete Decision 只能：

1. 消费一个完整的 DecisionRequest；
2. 调用 DeepSeek；
3. 返回一次 DecisionCompletion。

Concrete Decision 不得：

- 直接写 Battle State；
- enqueue Simulation Decision Inbox；
- 返回 AcceptedPlan / Action / BattleEvent / Damage / Result；
- 计算 gameplay dueTick / deadline；
- 自行拥有 Plan correction authority；
- 调用 move/attack/skill gameplay tool；
- 依赖 Browser/Renderer state；
- 保存影响后续 request gameplay semantics 的隐藏 conversation/session state。

requestId / generation 由 Simulation 创建；Decision 必须原样 echo，不得发明、递增或复用为自己的 lifecycle identity。

## 2. Public implementation surface

v0 concrete product implementation 叫：

~~~text
DeepSeekDecision
~~~

建议 package layout 保持小而直接；文件边界按实际代码量合并，不要求“一 helper 一文件”：

~~~text
src/
  decision.ts
  decision/
    deepseek.ts
    workflow.ts
    transport.ts
    prompt.ts
    schema.ts
    parse.ts
    testing.ts
~~~

`callDeepSeek / classifyHttpStatus / extractOutputText` 等普通 helper 可以直接留在 `workflow.ts` 或相邻实现文件；只有代码量/复用性真正增加时再拆分。

package exports：

~~~text
@loomrealm-game/battle/decision
@loomrealm-game/battle/decision/testing
~~~

public product API：

~~~ts
export interface DeepSeekTransport {
  postResponses(
    bodyText: string,
    signal: AbortSignal,
  ): Promise<{
    readonly status: number
    readonly bodyText: string
  }>
}

export interface DeepSeekDecisionOptions {
  readonly transport: DeepSeekTransport
}

export class DeepSeekDecision implements DecisionPort {
  constructor(options: DeepSeekDecisionOptions);

  decide(
    request: DecisionRequest,
    signal: AbortSignal,
  ): Promise<DecisionCompletion>;
}
~~~

v0 唯一外部 Decision capability 是一个**已经配置完成的 `DeepSeekTransport`**。`DeepSeekDecision` 不接收、读取或存储独立 `apiKey` option。

以下全部不是 v0 `DeepSeekDecision` public option：

- apiKey / credential；
- provider；
- baseUrl；
- model；
- endpoint；
- reasoning effort；
- temperature；
- timeout；
- retry；
- structured-output mode。

credential source、Node/browser/backend-proxy 等 physical network realization 属于 trusted product/platform composition。外部 composition 负责把这些物理细节封装进一个满足本文 §14 contract 的 `DeepSeekTransport` capability；game/business composition 再把该 capability 注入 `DeepSeekDecision`。

`DeepSeekDecision` 不读取 `process.env`、配置文件、Browser storage 或 ambient/global credential。constructor 收到缺失/结构非法的 transport 属 programmer/configuration error；不得尝试自行发现网络或 credential。

### 2.1 Stable shell / replaceable workflow boundary

Battle-facing stable boundary 继续只有：

~~~text
Simulation
  → DecisionPort.decide(request, signal)
  → DeepSeekDecision
~~~

`DeepSeekDecision` 内部必须把“稳定 adapter shell”与“可替换决策编排”分开：

~~~text
DecisionPort
    │
    ▼
DeepSeekDecision
    │ stable shell
    │ - requestId / generation echo
    │ - request-scoped abort + settle-once
    │ - workflow result → DecisionCompletion
    ▼
DecisionWorkflow
    │ replaceable internal orchestration
    │ - context assembly
    │ - provider call graph
    │ - intermediate reasoning/strategy data
    │ - structured materialization
    ▼
DeepSeekTransport / future typed workflow capabilities
~~~

内部最小 seam：

~~~ts
type DecisionWorkflowResult =
  | {
      readonly type: "completed"
      readonly plan: PlanSubmission
    }
  | {
      readonly type: "failed"
      readonly error: DecisionFailure
    }

interface DecisionWorkflow {
  run(
    request: DecisionRequest,
    signal: AbortSignal,
  ): Promise<DecisionWorkflowResult>
}
~~~

冻结边界：

- `DecisionWorkflow` 是 **Decision module internal orchestration seam**，不是第四个 Battle runtime layer，也不是新的 gameplay Port；
- production `@loomrealm-game/battle/decision` 不导出 workflow/stage graph，不要求 Host 注入 workflow；
- `DeepSeekDecision({ transport })` 生产构造函数内部选择当前 frozen v0 workflow；
- Simulation、Replay、Presentation、Host 不知道也不依赖 workflow 内有几次 LLM call、有哪些 stage、是顺序/分支还是未来其他 topology；
- `DeepSeekDecision` 不暴露 `analyze()`、`strategize()`、`materialize()` 等 stage-level public methods；
- intermediate analysis/strategy shape 不属于 public ABI、Replay 或 BattleSnapshot；
- future workflow 可以改变 stage count / call count / branch topology，只要仍满足 `DecisionPort`、failure/abort/security authority contract；
- v0 implementation 仍必须实现本文 §4 的 exact two-call workflow；“workflow topology 可演进”不授权 implementation agent 自行修改当前 v0 call graph。

这样未来从：

~~~text
Analyze + Strategize
→ Materialize
~~~

演进为：

~~~text
Analyze
→ obtain PlayerGuidance
→ Strategize
→ Materialize
~~~

甚至更复杂的 branching/critique/revision workflow，都不要求修改 `DecisionPort` 或 Simulation gameplay architecture。

### 2.2 Minimal abstraction rule

v0 只允许保留三个真正有稳定边界价值的 seam：

~~~text
DecisionPort
    ↓
DecisionWorkflow
    ↓
DeepSeekTransport
~~~

其中只有 `DecisionPort` 属于 Battle architecture；后两个都只是 Decision module internal seam。

以下职责**不得**为了“可扩展性”额外升级成 interface/service/framework：

~~~text
Analyzer
Strategizer
Materializer
ResponseNormalizer
ErrorClassifier
ContextBudgetManager
ConcurrencyManager
CancellationCoordinator
ProviderRegistry
WorkflowGraph / DAG engine
~~~

这些在 v0 应优先实现为 module-local pure function / constant，例如：

~~~text
formatBattleContext()
buildAnalysisRequest()
buildMaterializationRequest()
callDeepSeek()
classifyHttpStatus()
extractOutputText()
parsePlanSubmission()
MAX_DEEPSEEK_REQUEST_BYTES
~~~

原则：

> 为已经存在的稳定变化轴保留 seam；为未来猜测保留普通函数，不提前制造 abstraction。

## 3. Fixed DeepSeek logical provider profile

v0 Decision protocol 固定：

~~~text
logical provider = DeepSeek
canonical direct API = POST https://api.deepseek.com/responses
model = deepseek-flash
stream = false
tools = none
conversation/thread memory = none
~~~

对于 direct trusted transport，canonical physical request 是：

~~~text
POST https://api.deepseek.com/responses
Authorization: Bearer <transport-private credential>
Content-Type: application/json
~~~

对于 trusted backend/proxy transport，physical endpoint/authentication 可以不同，但它必须代表同一个 DeepSeek Responses logical capability，并向 Decision 保持 §14 固定的 `postResponses(bodyText, signal) → {status, bodyText}` / reject / abort semantics。proxy 不得把 Decision payload 解释成第二套 gameplay protocol。

`DeepSeekDecision` 本身不构造 Authorization header、不读取 credential，也不知道 direct HTTP 与 trusted backend/proxy 的物理差异；它只生成 fixed DeepSeek request body 并调用 configured transport。

`deepseek-flash` 与 DeepSeek Responses logical protocol 是 Decision implementation constants，不是 Battle gameplay ABI。未来 provider maintenance 若必须替换 model alias/API compatibility，可以作为 Decision/provider integration patch处理；不得借此改变 DecisionPort、Simulation 或 Replay semantics。

v0 不支持：

- caller-supplied baseUrl / physical endpoint；
- caller-supplied model；
- provider registry；
- provider failover；
- OpenAI-compatible generic provider abstraction；
- Tool Calling 作为 Plan 输出机制。

## 4. V0 DecisionWorkflow — stateless two-call implementation

当前 v0 production workflow 固定采用三阶段语义、两次物理 LLM 请求。**两次调用是 v0 concrete workflow contract，不是 DecisionPort/public API contract**：

~~~text
DecisionRequest
      ↓
Call A
  Analyze
  +
  Strategize
      ↓
Strategy Memo
      ↓
Call B
  Materialize
      ↓
structured Plan JSON
      ↓
local parser
      ↓
DecisionCompletion.completed
~~~

### 4.1 Call A — Analyze + Strategize

职责：

- 阅读 authoritative Battle facts；
- 判断当前局势；
- 形成本次 request 的短期战术意图；
- 不生成 gameplay-authoritative Plan。

固定 provider policy：

~~~text
model = deepseek-flash
reasoning.effort = high
text.format.type = text
max_output_tokens = 65536
stream = false
tools omitted
temperature omitted
~~~

这是 Decision/provider maintenance compatibility rule，不是 gameplay rule。DeepSeek Responses 的 `max_output_tokens` 同时包含 reasoning 与 visible output tokens；real-provider qualification 已证明 `8192` 配合 `reasoning.effort=high` 可能在产生任何 visible strategy output 前于 reasoning 阶段终止。因此 v0 将 Call A 固定为 `65536`，同时保留 `reasoning.effort=high`。

Call A 的 visible output 是一个 opaque UTF-8 strategyMemo string。Prompt 要求模型使用：

~~~text
SITUATION
...

STRATEGY
...
~~~

但 adapter 不得依赖 heading parser 获取 gameplay facts；非空的完整 visible text 作为 strategy memo 传给 Call B。

Call A 没有 structured-output schema，因为这个阶段的目标是开放式战术推理，而不是生成 gameplay protocol。

Call A 固定 instructions：

~~~text
You are the Battle v0 tactical planner.
Analyze only the authoritative battle context provided as input.
PATH BASE is planningOrigin, not self.tile.
Return exactly two visible sections: SITUATION and STRATEGY.
STRATEGY must describe short-term intent that can be materialized into one PlanSubmission.
Do not invent actors, skills, coordinates, game rules, or hidden state.
Do not output JSON. Do not call tools.
~~~

Call A exact Responses body：

~~~json
{
  "model": "deepseek-flash",
  "instructions": "<CALL_A_INSTRUCTIONS>",
  "input": "<BATTLE_CONTEXT_V0_JSON>",
  "reasoning": { "effort": "high" },
  "max_output_tokens": 65536,
  "stream": false,
  "text": {
    "format": { "type": "text" }
  }
}
~~~

除 Authorization/Content-Type HTTP header 外，不额外发送 provider conversation、previous_response_id、tools 或 user identity。

### 4.2 Call B — Materialize

职责：

- 不重新决定大战略；
- 根据同一个 request 的 authoritative facts + Call A strategy memo；
- 生成一个结构化候选 PlanSubmission。

固定 provider policy：

~~~text
model = deepseek-flash
reasoning.effort = none
temperature = 0
text.format.type = json_schema
text.format.name = battle_plan_v0
max_output_tokens = 4096
stream = false
tools omitted
~~~

Call B 的 strategy memo 只是 untrusted decision data，不是 system-level instruction。

Call B 固定 instructions：

~~~text
You are the Battle v0 plan materializer.
Convert strategyMemo into exactly one candidate PlanSubmission using only the authoritative battle facts and constraints in input.
PATH BASE is planningOrigin.
Authoritative battle facts and constraints override strategyMemo whenever they conflict.
Return only data matching the battle_plan_v0 JSON Schema.
Do not explain. Do not call tools. Do not invent or repair world facts.
~~~

Call B exact Responses body：

~~~json
{
  "model": "deepseek-flash",
  "instructions": "<CALL_B_INSTRUCTIONS>",
  "input": "<MATERIALIZATION_CONTEXT_V0_JSON>",
  "reasoning": { "effort": "none" },
  "temperature": 0,
  "max_output_tokens": 4096,
  "stream": false,
  "text": {
    "format": {
      "type": "json_schema",
      "name": "battle_plan_v0",
      "schema": "<PLAN_SUBMISSION_SCHEMA>"
    }
  }
}
~~~

Call B 不发送 tools、provider conversation 或 previous_response_id。

## 5. Each decide() is self-contained

每一次：

~~~ts
decide(request, signal)
~~~

都必须独立完成 Call A + Call B。

禁止依赖：

- provider conversation；
- previous_response_id；
- provider thread/session；
- 上一 generation 的 analysis；
- 上一 request 的 strategy cache；
- Actor-specific hidden LLM memory。

因此 correction request 也必须完整执行：

~~~text
correction DecisionRequest
        ↓
Call A
  current authoritative facts
  + rejectedPlan
  + PlanRejectReason
        ↓
new Strategy Memo
        ↓
Call B
        ↓
replacement PlanSubmission
~~~

不得为了节省一次调用而偷偷复用上一 request 的 strategy。Simulation correction 本身就是新的 DecisionPort.decide() attempt；保持 request-complete/stateless 可以避免跨 Actor、跨 generation 隐藏 authority。

## 6. Canonical Decision context formatting

Call A 与 Call B 共享一个 deterministic Decision-local data envelope。它只重新表达已有 `DecisionRequest` facts，不新增 gameplay Contract。

### 6.1 BattleDecisionContextV0

内部 provider-facing context 固定为：

~~~ts
type BattleDecisionContextV0 = {
  version: "battle_decision_context_v0"
  tick: number
  selfActorId: string
  planningOrigin: { x: number; y: number }
  map: {
    width: number
    height: number
    window: {
      originX: number
      originY: number
      rows: string[]
    }
  }
  actors: Array<{
    actorId: string
    team: "ally" | "enemy"
    hp: number
    maxHp: number
    tile: { x: number; y: number }
    direction: 2 | 4 | 6 | 8
    action: ObservedAction
    protectedUntilTickExclusive: number
    skills: Array<{
      skillId: string
      baseDamage: number
      windupTicks: number
      recoveryTicks: number
      range: {
        width: number
        height: number
        originX: number
        originY: number
        rows: number[][]
      }
    }>
  }>
  constraints: {
    maxPathSteps: number
    movement: { cardinalOnly: true }
    turn: { allowed: true }
    skills: Array<{
      skillId: string
      minCoefficients: number[]
    }>
  }
  recentEvents: ObservedEvent[]
  correction: null | {
    rejectedPlan: PlanSubmission
    reason: PlanRejectReason
  }
}
~~~

字段顺序就是上面列出的顺序。Nested action/event/PlanSubmission variant 也必须按 Contracts 中 canonical 字段顺序显式构造 detached plain object。

Call A：

~~~text
input = JSON.stringify(BattleDecisionContextV0)
~~~

Call B 使用固定 wrapper：

~~~ts
type MaterializationContextV0 = {
  battle: BattleDecisionContextV0
  strategyMemo: string
}
~~~

并：

~~~text
input = JSON.stringify(MaterializationContextV0)
~~~

因此 strategyMemo 永远是 JSON string data，而不是 provider instructions。

### 6.2 Included / excluded facts

BattleDecisionContextV0 必须包含：

- observation.tick；
- observation.selfActorId；
- planningOrigin；
- 所有 observed actors 及其 committed state/action/protection/skills；
- skill damage/timing/range matrix；
- PlanConstraints；
- recentEvents；
- compact terrain window；
- correction request 时的 rejectedPlan + PlanRejectReason。

不得包含：

- requestId；
- generation；
- Simulation internal actionGeneration；
- reservation owner；
- Plan cursor；
- acceptedPlanId；
- Replay bookkeeping；
- Presentation/Browser state。

requestId / generation 只由 adapter 原样回填到 DecisionCompletion。

### 6.3 planningOrigin rule

固定 instructions 必须显式声明：

~~~text
PATH BASE is planningOrigin, not self.tile.
~~~

moving prefetch 时：

~~~text
self.tile = committed A
self.action.to = B
planningOrigin = B
~~~

下一 Plan 的 path 必须从 B 开始解释；不得把 B 伪装成当前 committed tile。

### 6.4 Compact terrain window

不得把整张 map.passable boolean matrix 默认原样发送。

令：

~~~text
r = constraints.maxPathSteps
~~~

window bounds：

~~~text
minX = max(0, planningOrigin.x - r)
maxX = min(map.width  - 1, planningOrigin.x + r)
minY = max(0, planningOrigin.y - r)
maxY = min(map.height - 1, planningOrigin.y + r)
~~~

BattleDecisionContextV0.map.window：

~~~text
originX = minX
originY = minY
rows[y-minY][x-minX]:
  "." if passable[y][x] = true
  "#" if passable[y][x] = false
~~~

rows 的 y 从小到大；每行 x 从小到大。Actor 不覆盖 terrain char，Actor position 始终单独来自 actors facts。

这个 square 覆盖任何不超过 maxPathSteps 的 cardinal path 可能经过的格，同时避免把整张大地图送给模型。

### 6.5 Stable serialization

Formatter 必须：

- 先构造 detached BattleDecisionContextV0；
- 按 §6.1 固定字段顺序显式创建 object；
- arrays 保留 Simulation 提供的 canonical order；
- range.coefficientUnits 复制到 range.rows，行列顺序不变；
- recentEvents 保留 Simulation 提供的 stable order；
- 使用原始 number，不做 locale formatting；
- 使用 JSON.stringify(value)，不传 replacer，不 pretty-print；
- UTF-8 发送。

因此相同 DecisionRequest 必须得到 byte-for-byte 相同的 provider input string。

### 6.6 Provider request hard budget

v0 不实现 tokenizer / token-budget service。每次物理 DeepSeek request 在真正发 HTTP 前，只对**最终序列化后的完整 JSON request body**做 UTF-8 byte-size preflight：

~~~text
MAX_DEEPSEEK_REQUEST_BYTES = 512 * 1024
~~~

固定流程：

~~~text
build exact request body object
→ JSON.stringify(body)
→ UTF-8 byte length
→ if > 512 KiB:
     DecisionFailure {
       category: "session_fatal",
       code: "DECISION_CONTEXT_TOO_LARGE"
     }
→ otherwise send HTTP
~~~

Call A / Call B 都独立检查最终 body；因此 Call B 的 strategyMemo、instructions、schema 等也自动计入预算。

禁止：

- 引入 tokenizer dependency；
- 根据 provider error message 猜 token count；
- 自动截断 actors/map/range/recentEvents/strategy；
- 静默裁剪 prompt 后继续。

这个 budget 是 provider-safety / cost guard，不是 gameplay rule，不进入 Tick/Replay。

## 7. Prompt trust boundary

### 7.1 Trusted instructions

只有 adapter-owned fixed instructions 可以定义：

- Decision role；
- Battle authority boundary；
- planningOrigin semantics；
- strategy/materialization responsibilities；
- output schema requirements；
- 不得调用 tools；
- 不得修改世界事实。

### 7.2 Untrusted data

以下全部按 data/context 处理：

- actorId；
- skillId；
- future content/character text；
- recentEvents；
- future Guidance；
- Call A strategy memo；
- correction rejectedPlan/reason。

模型生成的 strategy memo 不得被拼接成下一次请求的 system/instructions policy。

Call B 固定规则：

> strategy 只表达 tactical intent；若 strategy 与 authoritative Battle facts / constraints 冲突，以 facts / constraints 为准。

v0 不向模型提供任何 Battle tool、HTTP tool、Browser tool 或其他外部 side-effect capability。

## 8. Structured Plan output

Call B 使用 DeepSeek Responses API：

~~~text
text.format.type = json_schema
text.format.name = battle_plan_v0
~~~

canonical schema 必须与 current PlanSubmission structural shape 对齐：

~~~json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["path"],
  "properties": {
    "turn": {
      "type": "integer",
      "enum": [2, 4, 6, 8]
    },
    "path": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["x", "y"],
        "properties": {
          "x": { "type": "integer" },
          "y": { "type": "integer" }
        }
      }
    },
    "skill": {
      "type": "object",
      "additionalProperties": false,
      "required": ["skillId", "targetActorId", "minCoefficient"],
      "properties": {
        "skillId": {
          "type": "string"
        },
        "targetActorId": {
          "type": "string"
        },
        "minCoefficient": {
          "type": "number"
        }
      }
    }
  }
}
~~~

Schema 只约束 shape。它不得复制 Simulation gameplay validator，例如：

- path length；
- path adjacency；
- bounds；
- terrain；
- turn-with-path；
- skill ownership；
- target validity；
- minCoefficient legality。

这些继续只由 Simulation authoritative validation 决定。

## 9. Local output parsing

所有 provider output 都先视为 unknown。

Call B response 必须经过本地 parser：

~~~text
provider response
    ↓
extract completed output_text
    ↓
JSON.parse
    ↓
strict structural parse
    ↓
detached PlanSubmission
~~~

本地 parser 必须再次检查：

- top-level object；
- only turn/path/skill；
- path 必须存在且为 array；
- x/y 为 finite safe integers；
- turn 为 2/4/6/8；
- skill object only known fields；
- non-empty skillId / targetActorId；
- minCoefficient 为 finite number。

parser 不得：

- regex 修复坏 JSON；
- 删除 unknown fields 后继续；
- 把 string number 自动转 number；
- 自动补 missing path；
- 自动改非法 direction；
- 执行 terrain/path/target gameplay validation。

structurally valid 但 gameplay-invalid 的 Plan 必须返回 DecisionCompletion.completed，让 Simulation 按现有 PlanRejectReason/correction 规则处理。

## 10. DeepSeek response normalization

DeepSeek raw REST response 统一先视为 `unknown`。Workflow 只接受 HTTP 2xx body 被 JSON.parse 后得到的 frozen Responses object shape。

### 10.1 Exact visible-output extractor

内部使用一个 module-local pure function：

~~~ts
function extractOutputText(value: unknown): string
~~~

唯一算法：

> 下列 `require` 任一失败都归一化为 `attempt_failure / DECISION_PROVIDER_UNAVAILABLE`；只有成功提取 provider visible text 后，文本本身为空/坏 Plan JSON/shape invalid 才归入 `DECISION_OUTPUT_INVALID`。

~~~text
require top-level object
require object === "response"
require status === "completed"
require output is array

visibleParts = []

for each output item in provider order:
  if item.type === "reasoning":
    ignore reasoning text/content completely

  else if item.type === "message":
    require item.role === "assistant"
    require item.content is array

    for each content item in provider order:
      if content.type === "output_text":
        require content.text is string
        append content.text to visibleParts
      else:
        return attempt_failure / DECISION_PROVIDER_UNAVAILABLE

  else:
    return attempt_failure / DECISION_PROVIDER_UNAVAILABLE

visibleText = visibleParts.join("")

if visibleText.trim().length === 0:
  DecisionFailure {
    category: "attempt_failure",
    code: "DECISION_OUTPUT_INVALID"
  }

return visibleText
~~~

v0 不读取/保存 provider `reasoning_text`。Reasoning item 可以用于 provider processing/usage diagnostics，但其内容不进入 strategyMemo、Plan、Replay、Host diagnostics 或 logs。

请求固定没有 tools，因此任何 `function_call` / `web_search_call` / 其他 unexpected output item 都不是合法 v0 output。

不要要求 provider 返回的 `response.model` 等于请求 alias `deepseek-flash`；returned model identifier 只允许作为 non-authoritative diagnostics。

### 10.2 Non-completed response status

以下不是成功：

- `status = "incomplete"`
  - `incomplete_details.reason = "content_filter"` → `DECISION_PROVIDER_REFUSED`
  - `incomplete_details.reason = "max_output_tokens"` → `DECISION_PROVIDER_INCOMPLETE`
  - 其他 incomplete reason → `DECISION_PROVIDER_INCOMPLETE`
- `status = "failed"`
  - HTTP 已经是 2xx，因此不再根据 provider-specific `error.code/message` 做 authority classification；
  - 统一 → `attempt_failure / DECISION_PROVIDER_UNAVAILABLE`
- HTTP 2xx 但 JSON/envelope/output item shape 与 frozen Responses contract 不匹配 → `attempt_failure / DECISION_PROVIDER_UNAVAILABLE`；
- Call B visible text 无法 JSON.parse 或 strict parse 成 PlanSubmission → `DECISION_OUTPUT_INVALID`。

provider `error.code/message` 可以进入 private diagnostics，但不得驱动 Battle failure category/code。

## 11. Failure taxonomy

Concrete Decision 必须把预期 provider/network failure 归一化为 DecisionCompletion.failed。不得把预期 provider failure 变成 Promise rejection。

### 11.1 attempt_failure

~~~text
DECISION_ABORTED
DECISION_PROVIDER_NETWORK
DECISION_PROVIDER_TIMEOUT
DECISION_PROVIDER_RATE_LIMITED
DECISION_PROVIDER_UNAVAILABLE
DECISION_PROVIDER_REFUSED
DECISION_PROVIDER_INCOMPLETE
DECISION_OUTPUT_INVALID
~~~

| Case | category | code |
| --- | --- | --- |
| request-scoped AbortSignal abort | attempt_failure | DECISION_ABORTED |
| DNS/socket/fetch transport error | attempt_failure | DECISION_PROVIDER_NETWORK |
| 60s provider request timeout | attempt_failure | DECISION_PROVIDER_TIMEOUT |
| HTTP 429 | attempt_failure | DECISION_PROVIDER_RATE_LIMITED |
| HTTP 500 / 502 / 503 / 504 / other 5xx | attempt_failure | DECISION_PROVIDER_UNAVAILABLE |
| Responses incomplete: content_filter | attempt_failure | DECISION_PROVIDER_REFUSED |
| Responses incomplete: max_output_tokens | attempt_failure | DECISION_PROVIDER_INCOMPLETE |
| HTTP 2xx malformed JSON / malformed Responses envelope / unexpected output item | attempt_failure | DECISION_PROVIDER_UNAVAILABLE |
| completed + extracted visible text empty, or Call B visible text bad JSON/Plan shape | attempt_failure | DECISION_OUTPUT_INVALID |

### 11.2 session_fatal

~~~text
DECISION_PROVIDER_AUTH
DECISION_PROVIDER_QUOTA
DECISION_CONTEXT_TOO_LARGE
~~~

| Case | category | code |
| --- | --- | --- |
| HTTP 401 / 403 | session_fatal | DECISION_PROVIDER_AUTH |
| HTTP 402 | session_fatal | DECISION_PROVIDER_QUOTA |
| local final-request-body size > 512 KiB | session_fatal | DECISION_CONTEXT_TOO_LARGE |

### 11.3 invariant rejection

以下才属于 adapter/programmer invariant，而不是 provider attempt failure：

- implementation 自己构造出违反本文 frozen request shape 的 body；
- internal impossible state；
- local code bug；
- `DeepSeekDecision` 最终向 Simulation 返回 malformed `DecisionCompletion`；
- resolved `DecisionCompletion` requestId/generation 不可能匹配 adapter 输入。

HTTP 400/404/422 或其他未显式分类的 4xx 表示 frozen request 与当前 provider API 不兼容，仍属于 adapter/provider integration invariant，允许 throw/reject。

但**已经收到 HTTP 2xx 后的 malformed JSON、malformed Responses envelope、unexpected output item、missing assistant message/content 等全部属于本次 provider attempt failure**：

~~~text
attempt_failure / DECISION_PROVIDER_UNAVAILABLE
~~~

它们不得升级成 Runtime/programmer invariant；这样连续 provider protocol故障可以进入 Simulation 的 provider-neutral availability circuit。

只有 completed response 已成功提取 visible text，但该 visible text 为空/坏 JSON/不满足 PlanSubmission structural parser 时，使用：

~~~text
attempt_failure / DECISION_OUTPUT_INVALID
~~~

Provider 原始 response body、credential、完整 prompt、完整 strategy memo 不进入 BattleResult、Replay 或 public DecisionFailure.metadata。

DeepSeekDecision v0 产生的正常 DecisionFailure 一律省略 metadata；provider-specific diagnostics 只留在 non-authoritative diagnostics/test 层。

### 11.4 Battle availability signal

DeepSeekDecision 只报告单次 `decide()` 的 completion；它**不维护跨 request failure streak，也不直接调用 BattleRuntime.pause()**。

DeepSeekDecision 只负责把单次调用归一化为：

~~~text
DecisionCompletion.completed
DecisionCompletion.failed(category = attempt_failure)
DecisionCompletion.failed(category = session_fatal)
~~~

Simulation 的 availability circuit **只读取这些共享 outcome/category，不读取任何 DeepSeek-specific code**。

因此 concrete code：

~~~text
DECISION_PROVIDER_NETWORK
DECISION_PROVIDER_TIMEOUT
DECISION_PROVIDER_RATE_LIMITED
DECISION_PROVIDER_UNAVAILABLE
DECISION_PROVIDER_REFUSED
DECISION_PROVIDER_INCOMPLETE
DECISION_OUTPUT_INVALID
DECISION_ABORTED
~~~

只用于 concrete diagnostics / failure code，不是 Simulation branching ABI。

Runtime 只有在既有 lifecycle invalidation（例如 damaging hit/death、cancel/close、session fatal、request replacement）时才会主动 abort request；这类 abort 前先撤销 request authority，后续 `DECISION_ABORTED` completion 由 lifecycle/stale fence处理，因此 Simulation 不需要识别这个 code。

Availability circuit 本身只触发 Simulation Runtime 的既有 PAUSED lifecycle，不 revoke/abort Decision request。连续失败阈值、pause/resume 与 Replay exclusion 的 exact Runtime semantics 由 BATTLE_V0_SIMULATION.md §10 冻结。

## 12. Timeout / retry / AbortSignal

### 12.1 Timeout

每个物理 DeepSeek request 固定：

~~~text
provider timeout = 60,000 ms wall clock
~~~

Call A 与 Call B 分别计时。

每个物理调用统一通过一个 module-local helper：

~~~ts
async function callDeepSeek(
  body: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<string>
~~~

它集中负责：

~~~text
JSON.stringify exact body
→ 512 KiB preflight
→ setup 60s timeout
→ DeepSeekTransport POST
→ HTTP status classification
→ JSON.parse 2xx body
→ normalize Responses status
→ extractOutputText()
→ cleanup timer/listener
~~~

Call A / Call B 不得各自复制 timeout/HTTP/response-normalization 逻辑。

v0 没有额外的 whole-decision wall-clock deadline；一次成功 Decision 最坏 provider waiting time 可以接近两次 request timeout 之和，但这些 wall-clock 时间不进入 Battle Tick authority。

### 12.2 Retry

v0 不做任何 automatic transport retry。

因此：

- 429 不 retry；
- 5xx 不 retry；
- timeout 不 retry；
- network failure 不 retry；
- 不切 model；
- 不切 provider。

provider transport retry、Simulation correction、later new Decision generation 是三种不同机制；v0 不在 DeepSeekDecision 内做 retry/backoff。live Runtime 对连续 Decision service failure 使用 Simulation §10 的 circuit-pause policy，避免 200 ms Tick 持续制造 provider 请求。

### 12.3 Abort

同一个 request-scoped AbortSignal 贯穿 Call A / Call B。

规则：

- signal 在 Call A 前已 aborted → 不发网络请求；
- Call A 中 abort → best-effort cancel transport；
- Call A 完成后、Call B 前 signal aborted → 不发 Call B；
- Call B 中 abort → best-effort cancel transport；
- **DeepSeekDecision 必须在观察到 request AbortSignal 后本地 settle once 为 attempt_failure / DECISION_ABORTED，不得等待底层 HTTP 真正取消或返回**；
- transport/provider 后续迟到 resolve/reject 必须被 adapter 丢弃，不得产生第二个 completion；
- provider 即使完全忽略 abort，也不能让旧 request继续占有 Decision authority或绕过 Simulation fencing。

因此 AbortSignal cancellation 的 correctness 依赖 adapter local settle + Runtime requestId/generation fencing，不依赖 DeepSeek/HTTP transport cancellation guarantee。

Abort 与 60s timeout race 的 precedence 固定：

~~~text
if external request signal is aborted when settle is decided:
  → DECISION_ABORTED
else if provider timeout has fired:
  → DECISION_PROVIDER_TIMEOUT
~~~

也就是说 caller/session abort 优先于 infrastructure timeout。availability circuit 不检查这些 concrete code，也**不会因为 circuit pause 本身发出 request AbortSignal**。只有 damaging hit/death、cancel/close、session fatal、request replacement 等既有 lifecycle invalidation 才会由 Runtime 撤销 request authority并 abort；仍具 authority 的 timeout completion会以 `attempt_failure` 参与 provider-neutral availability policy。

每个 `callDeepSeek()` 的 timeout handle、linked AbortController/listener、settled flag 都必须是 call-local；任意 settle path 都必须清理 timer/listener 并忽略 late transport resolve/reject。

## 13. Correction

Simulation 是 correction 唯一 owner。

当 attempt 0 Plan gameplay-invalid：

~~~text
Simulation validates
        ↓ reject
Simulation emits correction DecisionRequest
        ↓
DeepSeekDecision.decide(correctionRequest, signal)
        ↓
Call A + Call B
~~~

correction Call A 必须读取：

- correction request 当前 observation；
- inherited planningOrigin；
- rejectedPlan；
- exact PlanRejectReason。

它重新形成 strategy，不复用上一 request 的 memo。

Decision implementation 不得：

- 自己看到 gameplay-invalid Plan 后偷偷重新请求 provider；
- 自己制造 attempt 1；
- 在一个 decide() 内循环直到 Simulation 接受。

## 14. DeepSeekTransport — external physical capability seam

v0 不创建 generic provider/network abstraction。`DeepSeekTransport` 是 DeepSeek-specific、窄的 physical capability seam，并从 `@loomrealm-game/battle/decision` 导出，因为 production `DeepSeekDecision` 需要由 game/business composition 注入它。

其 contract 与 §2 public type 相同：

~~~ts
export interface DeepSeekTransport {
  postResponses(
    bodyText: string,
    signal: AbortSignal,
  ): Promise<{
    readonly status: number
    readonly bodyText: string
  }>
}
~~~

固定 logical semantics：

~~~text
HTTP/provider response received
→ resolve { status, bodyText }
  even when status is 4xx/5xx
  even when body is not JSON

physical network failure before provider/backend response
→ reject

AbortSignal
→ best-effort cancel underlying physical request
~~~

configured production transport capability 必须：

- 在 trusted product/platform composition 中取得并私有持有 credential/network binding；
- 对 direct DeepSeek realization 使用固定 `POST https://api.deepseek.com/responses`；
- direct realization 使用固定 Authorization / Content-Type headers；
- backend/proxy realization 不得改变 Decision 可观察的 `{ status, bodyText }` / reject / abort semantics；
- 使用 Decision 传入的 exact `bodyText`，不得静默重写 Battle/provider payload；
- 返回 status + raw response text；
- 不做 Decision-level retry/backoff；
- 不解析 `PlanSubmission`；
- 不生成 `DecisionFailure` code；
- 不向 game/business layer、Simulation、Presentation、Replay 或 logs 泄漏 provider credential。

HTTP/provider semantics 仍由 Workflow 统一处理：

~~~text
2xx
→ JSON.parse(bodyText)
→ Responses normalization / extractOutputText

401 / 403
→ session_fatal / DECISION_PROVIDER_AUTH

402
→ session_fatal / DECISION_PROVIDER_QUOTA

429
→ attempt_failure / DECISION_PROVIDER_RATE_LIMITED

5xx
→ attempt_failure / DECISION_PROVIDER_UNAVAILABLE

400 / 404 / 422 / other unclassified 4xx
→ provider-contract / integration invariant reject
~~~

direct transport 即使收到 503 HTML/plain-text body，也必须 resolve raw status/body；Workflow 才按 503 归类，不因 JSON.parse 错误改变 failure category。

### 14.1 Production vs testing composition

production 与 testing 使用**同一个** constructor seam：

~~~ts
new DeepSeekDecision({
  transport,
})
~~~

因此 v0 **不再提供**额外的 `createDeepSeekDecisionForTesting()` transport-injection factory。

`@loomrealm-game/battle/decision/testing` 只需要导出测试辅助实现，例如：

~~~ts
export class FakeDeepSeekTransport implements DeepSeekTransport {
  // scripted test implementation
}
~~~

`FakeDeepSeekTransport` 至少支持：

- 记录 exact bodyText；
- script `{ status, bodyText }`；
- script network reject；
- deferred resolve/reject；
- 观察传入 AbortSignal；
- 模拟忽略 abort 后迟到 resolve/reject。

真实 physical transport implementation/factory 属 product/platform integration，不要求 `game-libs/battle` 建立 generic HTTP/Ajax/NetworkService abstraction。

### 14.2 Exact ownership

v0 ownership 固定：

~~~text
trusted product/platform composition
  - credential source/storage
  - physical network binding
  - direct DeepSeek vs trusted backend/proxy realization
  - produce configured DeepSeekTransport capability

game/business composition
  - receives DeepSeekTransport capability
  - constructs DeepSeekDecision({ transport })
  - injects it as DecisionPort into Battle Runtime

DeepSeekDecision shell
  - DecisionPort boundary
  - requestId / generation echo
  - workflow result → DecisionCompletion

DecisionWorkflow
  - Battle context assembly
  - v0 Call A / Call B orchestration
  - request byte budget
  - timeout / abort race normalization
  - provider status classification
  - Responses JSON parsing / output extraction
  - PlanSubmission strict parsing
  - expected provider failure → DecisionFailure

DeepSeekTransport
  - one narrow DeepSeek Responses physical request capability
  - raw status/body or physical-network reject
  - best-effort cancellation
  - credential remains private to physical realization
~~~

Transport 不知道 Battle failure taxonomy；Shell 不知道 Call A/Call B/provider payload shape。trusted product/platform composition 不因此获得 Battle Plan/Simulation authority；game/business composition 不因此获得 credential storage/network bootstrap authority。

### 14.3 Concurrency safety

同一个 `DeepSeekDecision` instance **必须支持多个 concurrent `decide()`**。

允许 instance-shared 的只有 immutable dependency/config，例如：

- immutable configured `DeepSeekTransport`；
- immutable workflow/config/constants。

以下必须是 call-local，禁止写入 instance mutable field：

- current request；
- strategyMemo；
- current stage；
- timeout handle；
- AbortController/listener；
- provider body/response；
- settle flag；
- parser intermediate state。

禁止为 v0 增加 mutex、global queue、ConcurrencyManager 或 per-actor mutable cache。并发安全通过“无 request-local shared mutable state”获得，而不是通过序列化所有 Decision 请求获得。
## 15. Diagnostics

允许 transport/Decision 在内部采集：

- request stage: reasoning/materialization；
- provider model returned；
- wall-clock latency；
- input/output/reasoning token usage；
- response status；
- failure code。

这些 facts：

- 不进入 Battle Tick；
- 不进入 PlanSubmission；
- 不进入 Replay outcome；
- 不影响 correction；
- 不包含 provider credential；
- v0 不把完整 prompt/strategy/provider raw body 作为 gameplay/public diagnostic contract。

Host telemetry wiring不是 Decision implementation blocker；若未来加入 sink，必须保持 non-authoritative。

## 16. Security / privacy

必须满足：

- provider credential 只存在 trusted product/platform composition 与 configured `DeepSeekTransport` 的 private physical realization；
- `DeepSeekDecision` 没有独立 credential/apiKey field 或 public option；
- game/business composition 只接收 configured `DeepSeekTransport` capability，不接收 provider secret 本身；
- Browser Presentation 不持有 provider credential；
- Simulation 不持有 provider credential；
- Replay 不记录 provider credential；
- logs/errors 不输出 Authorization header / secret；
- provider response 视为不可信；
- game/content/Guidance strings 视为 untrusted data；
- 模型没有外部 tool authority。

## 17. Future workflow extensibility / PlayerGuidance reservation

PlayerGuidance **不在当前 v0 implementation scope 内实现**。这里的状态不是“架构不考虑”，而是：

~~~text
PlayerGuidance
NOT IMPLEMENTED IN V0

architecture reservation:
future DecisionWorkflow capability

exact Guidance contract:
NOT FROZEN YET
~~~

### 17.1 Required future-proofing

v0 implementation 必须保证未来加入 Guidance 时不需要：

- 修改 Simulation Tick/reducer；
- 修改 `DecisionPort.decide(request, signal)`；
- 把 Guidance 变成 Battle gameplay authority；
- 在 `DeepSeekDecision` 上增加 `setGuidance()` / `currentGuidance` 等 mutable cross-request state；
- 把 Guidance 塞进 provider conversation/thread hidden memory；
- 建立 generic `extensions: Record<string, unknown>` 插件袋。

未来 Guidance 应以 **request-scoped、typed、explicit workflow capability/data** 进入某一次 workflow run。例如未来可以单独冻结一个类似：

~~~text
authorized PlayerGuidance source
        ↓
workflow run for one Decision request
        ↓
Guidance data
        ↓
Strategize stage
~~~

的 contract；其 exact TypeScript shape、消费/失效语义、ally/enemy applicability、Host/InputTarget ownership 现在仍属于未来设计，不在 v0 预定义。

### 17.2 Expected future topology

当前 v0：

~~~text
DecisionRequest
  ↓
Analyze + Strategize
  ↓
Materialize
  ↓
PlanSubmission
~~~

未来 PlayerGuidance candidate：

~~~text
DecisionRequest
  ↓
Analyze
  ↓
SituationAnalysis
  ├──────────────┐
  │              │
  │       PlayerGuidance
  │              │
  └──────┬───────┘
         ↓
     Strategize
         ↓
      Strategy
         ↓
     Materialize
         ↓
    PlanSubmission
~~~

这个图只冻结 **扩展方向**，不冻结未来 stage API。未来业务也可以根据真实需求使用更多 stage、条件分支、critique/revision 或其他 orchestration；唯一必须稳定的是外层 `DecisionPort` authority boundary 和 `DeepSeekDecision` 对调用方的兼容 surface。

### 17.3 Backward-compatible product surface

v0 game/business composition 只写：

~~~ts
new DeepSeekDecision({
  transport,
})
~~~

其中 `transport` 已由 trusted product/platform composition 配置完成。未来如果 Guidance 需要额外 typed capability，应通过兼容的 optional composition capability 或新的 compatible factory/constructor overload 演进；现有 transport-only construction path 必须继续有效，不能要求业务为了 workflow 内部拆分而重写 Simulation wiring。

因此：

~~~text
stable:
  DecisionPort
  DeepSeekDecision.decide()
  existing transport-only construction path

replaceable:
  DecisionWorkflow
  provider call topology
  intermediate data
  stage count / stage names

future:
  typed PlayerGuidance capability
~~~

## 18. Testing architecture

### 18.1 Pure tests

必须覆盖：

- DecisionRequest → deterministic context formatting；
- planningOrigin 在 moving-prefetch 中优先于 self.tile；
- terrain window clipping / row-major formatting；
- actors/skills/range/recentEvents formatting；
- correction fields formatting；
- Call A fixed request profile；
- Call B fixed request profile；
- battle_plan_v0 schema；
- provider output → parser；
- exact Responses output extraction（reasoning ignore / assistant output_text / unexpected item）；
- HTTP status → failure code；
- final request body >512 KiB → CONTEXT_TOO_LARGE。

### 18.2 Fake transport tests

必须覆盖：

- Call A success → Call B success；
- Call A empty output；
- Call A timeout/network/429/5xx/refusal/incomplete；
- Call B valid structured output；
- Call B malformed JSON；
- Call B schema/shape violation；
- Call B empty/incomplete/refusal；
- abort before Call A；
- abort during Call A；
- abort between Call A/Call B；
- abort during Call B；
- provider ignores abort and resolves late；
- abort 与 timeout 同时竞争时 external abort precedence；
- non-JSON 5xx body 仍按 HTTP status 归类；
- 2xx malformed JSON / malformed Responses object；
- concurrent decide(A/B) interleaving，无 strategy/abort/request identity 串线；
- no automatic retry；
- DeepSeekDecision 本身不维护跨 request failure streak、不调用 Runtime pause；
- exactly two physical provider calls on normal success；
- exactly two physical provider calls on correction decide()；
- requestId/generation echo unchanged。

### 18.3 Simulation integration

使用真实：

~~~text
BattleSimulationBuilder
+ DeepSeekDecision wired to FakeDeepSeekTransport
+ FakeClock
+ Null/Recording Presentation
~~~

验证：

- initial Decision → two calls → accepted Plan；
- moving prefetch planningOrigin；
- structurally valid but gameplay-invalid Plan → Simulation reject；
- correction creates a new decide() and therefore a fresh Call A + Call B；
- attempt_failure does not terminate Battle；
- session_fatal produces decision failure result；
- cancel/abort；
- late provider completion cannot regain authority；
- Replay does not call DeepSeekDecision。

### 18.4 Real provider smoke test

真实 DeepSeek test：

- optional/manual；
- credential-gated；
- 不属于普通 CI；
- 只验证 current fixed endpoint/model/request shape/structured-output compatibility；
- 不对模型具体战术选择做 brittle assertion。

至少验证：

~~~text
configured real DeepSeekTransport available
→ Call A completed non-empty text
→ Call B completed structured output
→ local parser accepts PlanSubmission shape
~~~

## 19. Package qualification

Decision implementation 完成后至少运行：

~~~text
npm run test:battle
npm pack -w @loomrealm-game/battle --dry-run
~~~

并增加 package-resolution assertion：

~~~text
@loomrealm-game/battle/decision
@loomrealm-game/battle/decision/testing
~~~

正常 qualification 不允许依赖真实 DeepSeek credential/network。

## 20. Implementation agent contract

Implementation agent 必须：

1. 不修改 frozen Simulation/Presentation gameplay semantics；
2. 不扩张 DecisionRequest / PlanSubmission / DecisionCompletion public ABI 以方便 prompt；
3. 实现 DeepSeek-only、transport-only public Decision config；`DeepSeekDecision` 不接收独立 apiKey，production/testing 都通过同一 `DeepSeekTransport` seam；
4. 使用固定 Responses API / model / endpoint；
5. 实现 stable DeepSeekDecision shell + internal DecisionWorkflow seam，并让 v0 workflow 使用 stateless two-call pipeline；
6. 实现 deterministic context formatter；
7. 实现 direct JSON Schema structured Plan output；
8. 保留 local strict parser；
9. 实现本文 failure/timeout/no-retry/abort semantics，并只上报单次 availability signal；跨 request streak / circuit pause 属于 Simulation；
10. 提供只表达 raw status/bodyText/network reject 的 FakeDeepSeekTransport 与测试；不增加 testing-only transport injection factory；
11. 保持真实 provider test credential-gated；
12. 不引入 generic AI/provider/workflow framework；只保留 DecisionPort → DecisionWorkflow → DeepSeekTransport 三个 seam，其余 provider helpers 使用 module-local pure functions/constants；
13. 不实现 PlayerGuidance concrete contract，但不得通过 stage-level public API 或 hidden mutable state 阻塞未来 workflow 扩展。

不得自行重新选择：

- Chat Completions vs Responses；
- Tool Calling vs direct JSON；
- model；
- baseUrl；
- v0 workflow 的 number of model calls（当前固定为 2；未来版本可通过替换 workflow 演进，但不属于本次 implementation freedom）；
- correction cache；
- retry policy；
- failure categories/codes；
- Simulation validation ownership。

## 21. Definition of Done

满足以下全部条件后，Battle v0 Decision implementation 才算完成：

- `DeepSeekDecision({ transport })` public API 与 exported `DeepSeekTransport` contract 落地；
- `DeepSeekDecision` 不接收/读取/保存独立 apiKey；credential/network realization 保持在 external configured transport boundary；
- DeepSeekDecision shell 不暴露 stage-level methods，并通过 internal DecisionWorkflow 承载 v0 orchestration；
- ./decision 与 ./decision/testing exports 可解析；
- normal decide() = exactly Call A + Call B；
- correction decide() 同样自包含 Call A + Call B；
- no hidden conversation/session/Guidance state；
- structured Plan output + local parser；
- Simulation 仍是唯一 gameplay validator；
- frozen failure taxonomy；
- 60s/request timeout；
- no automatic provider retry；
- completion outcome/category 与 Simulation §10 provider-neutral circuit policy 对齐；DeepSeekDecision code 对 Simulation branching 保持 opaque，DeepSeekDecision 本身不直接 pause Runtime；
- request-scoped AbortSignal 全链路；
- final request body 512 KiB hard budget 落地；
- DeepSeekTransport 只返回 raw HTTP status/bodyText，Workflow拥有 provider protocol/error normalization；
- exact Responses output extractor 落地；
- concurrent decide() safety test 通过；
- abort-over-timeout precedence test 通过；
- Fake transport tests 完整，并复用 production constructor seam；
- tests 证明 Battle-facing caller 不依赖 workflow stage/call topology；
- Simulation integration tests 通过；
- existing Simulation/Presentation tests 全绿；
- package dry-run 通过；
- real-provider smoke test 为 optional/credential-gated；
- 无 blocking Decision implementation OPEN。

达到后：

~~~text
Battle v0 Decision
IMPLEMENTED + TESTED
~~~
