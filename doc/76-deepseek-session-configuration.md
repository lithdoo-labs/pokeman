# PokeMan DeepSeek Session 配置与启动 Gate 设计

> 状态：Proposed / Design-only
> 适用范围：examples/PokeMan 当前产品集成
> 不修改 Framework / Battle Core public contract；当前 PokeMan 明确接受 credential placement / direct provider network 的 product-private 阶段性例外
> 目标：在接入 PokeMan Battle 前，为当前 Session 建立一个已验证可用的 DeepSeek API Key，并阻止未完成配置的游戏继续进入后续 Frame。

## 1. 背景

PokeMan 当前 Game Entry 以 base subsystem 作为入口：

~~~text
Game Entry
→ Base Frame
   → create game-controls-input
   → frame.call("map", initial params)
~~~

未来 PokeMan 接入 @loomrealm-game/battle 时，Battle v0 的 concrete Decision implementation 使用 DeepSeek。Battle 已经冻结：

~~~text
Simulation
→ DecisionPort
→ DeepSeekDecision
→ DeepSeekTransport
→ DeepSeek Responses API
~~~

DeepSeekDecision 的 public constructor 只接收 configured DeepSeekTransport，不接收 apiKey。Battle Core、Simulation、Replay 与 Presentation 都不应获得 credential source/storage 语义。

当前 PokeMan 尚未提供 DeepSeek credential 的产品级配置入口，因此在 Battle 接入前增加一个启动配置 Gate。

本设计选择当前阶段的最小产品实现：

~~~text
Browser localStorage
→ 记住用户上一次提交的 DEEPSEEK_API_KEY 草稿

Base
→ 读取用户提交的 raw key
→ 直接请求 DeepSeek provider 做启动 probe
→ probe success 后写 PokeMan Shared State

PokeMan Shared State
→ 保存当前 Session 已经验证成功的 DEEPSEEK_API_KEY

future Battle composition
→ 从 PokeMan Session State 读取 key
→ 构造 PokeMan-private DeepSeekTransport
→ 由该 transport 完成 Battle provider HTTP
→ 注入 DeepSeekDecision
~~~

该方案是 PokeMan 当前阶段的 product-private integration decision，不建立 Framework 通用 credential storage pattern。它保留 Battle Core 的 `DeepSeekDecision({ transport })` public boundary，但明确偏离当前 architecture 对“credential / physical network 默认归 Platform binding”的推荐 ownership；该偏离必须局限在 PokeMan concrete integration。

## 2. 目标

本改造必须满足：

1. PokeMan 启动进入 base Frame 后，在进入 Map 或其他 gameplay Frame 前保证 DeepSeek credential 已配置。
2. 配置 UI 使用 @loomrealm-game/schema-form。
3. 表单只有一个字段：DEEPSEEK_API_KEY。
4. 表单不可取消。
5. localStorage 记住用户上一次提交的内容，避免重新输入。
6. 用户提交后必须实际验证 DeepSeek credential / provider connectivity。
7. 只有远程验证成功并且 Session Shared State 写入成功，表单才能关闭。
8. Base 只有在配置 Gate 完成后才允许调用后续 Frame。
9. future Battle 不修改 DeepSeekDecision public API，而是继续通过 DeepSeekTransport 注入。
10. API Key 不进入 Frame params、Session Events、Content、Battle Simulation state、Replay 或 Presentation retained business state。
11. future Save/Load 明确不持久化该 Session credential Record。
12. 当前阶段由 Base concrete subsystem 直接完成 DeepSeek startup HTTP probe；future Battle concrete integration 再从 State 读取 key 构造自己的 PokeMan-private DeepSeekTransport。

## 3. 非目标

当前阶段明确不解决：

~~~text
password-style input masking
localStorage encryption
OS keychain / secure enclave
server-side credential proxy
generic Framework credential capability
generic secret store
provider registry
multiple provider selection
multiple DeepSeek API keys
account/profile credential management
credential rotation UI
Save/Load implementation
Battle gameplay integration implementation
~~~

这些后续能力不得改变本设计中已经固定的启动 Gate 和 Battle transport seam。

## 4. Base 的职责

PokeMan 当前 base 是 example/product-private infrastructure subsystem。它已经承担长期 controls producer composition，并位于初始 Frame 链最前端。

因此 DeepSeek startup Gate 放在 Base 是合适的：

~~~text
Base Frame begins
    ↓
ensureDeepSeekConfiguration()
    ↓
DeepSeek Session config READY
    ↓
create game-controls-input
    ↓
frame.call("map", frame.params)
~~~

Base 拥有的是“是否允许游戏继续启动”的产品流程，不因此成为 Battle gameplay authority。

建议 controls RenderDomain 在配置 Gate 完成后再创建，因为 API Key 配置阶段还没有 gameplay controls producer 的必要。

目标结构：

~~~text
Base.frame(frame)
│
├─ ensureDeepSeekConfiguration(frame)
│
├─ create game-controls-input RenderDomain
│
├─ await frame.call("map", frame.params)
│
└─ finally close inputHost
~~~

配置逻辑应提取成 PokeMan-private helper，而不是把所有逻辑堆在 base.frame()：

~~~text
examples/PokeMan/
└─ subsystems/
   ├─ base.mjs
   └─ deepseek-config.mjs
~~~

文件名不是 public contract；重点是该逻辑保持 PokeMan-private，不创建新的通用 game library。

### 4.1 当前 DeepSeek network ownership

本设计明确决定：**启动校验由 Base concrete subsystem 自己发起 provider HTTP**。

~~~text
Base / deepseek-config helper
→ raw DEEPSEEK_API_KEY
→ direct HTTPS request to DeepSeek
→ validate response
→ state.commit(SessionConfig/deepseek)
~~~

当前阶段不新增 generic NetworkClient、CredentialService、Platform Secret Store 或 product service locator。Base 可以使用当前 PokeMan host 可用的 direct HTTPS/fetch realization。

这是一个需要真实 host qualification 的实现前提，而不是默认假设：

~~~text
PWA Subsystem Worker
→ direct cross-origin fetch is still subject to Browser network/CORS policy

Hostra / other host
→ must separately prove its direct HTTPS realization
~~~

实现 PR MUST 在当前受支持的 PokeMan launch profile 上证明 `https://api.deepseek.com/models` 能从 Base Runtime 的真实执行环境发起并得到可观察 HTTP response。若某个必须支持的 profile 因 CORS/host policy 无法 direct probe，implementation MUST NOT 偷偷引入 backend/proxy 或 Framework network API；应重新打开本文 network ownership design。

这是一项有意识的 PokeMan 阶段性例外：

~~~text
Framework / Subsystem architecture recommendation
→ credential + physical network belong to Platform binding

current PokeMan exception
→ Base concrete subsystem owns startup credential probe
→ future Battle concrete integration owns PokeMan-private DeepSeekTransport realization
~~~

该例外只允许存在于 PokeMan concrete integration。它不得反向改变 `@loomrealm/subsystem` author API，也不得把 raw network/credential surface加入 Battle Core。

## 5. Session Shared State Record

当前设计新增一个非 gameplay-core、Session-only 的 PokeMan Shared State Record：

~~~text
namespace = pokeman.SessionConfig
key       = deepseek
~~~

value 的 exact schema：

~~~json
{
  "apiKey": "..."
}
~~~

固定约束：

~~~text
value MUST be a non-null plain JSON object
own property set MUST equal exactly ["apiKey"]
apiKey MUST be a non-empty valid Unicode scalar-value string
apiKey MUST NOT be trim/normalize/case-folded
generic Shared State JsonValue / byte / depth limits still apply
unknown properties are invalid
~~~

语义：

`pokeman.SessionConfig/deepseek` **存在且满足上述 exact schema**，表示当前 live Session 已经获得一个通过启动 probe 的 DeepSeek API Key。单纯“Record 已 materialize”不够形成 READY。

因此不增加冗余字段：

~~~text
validated: true
connected: true
ready: true
~~~

Valid Record presence 本身就是当前 Session 的 ready fact。

该 Record 不修改 67-shared-state-records.md 已冻结的四类 PokeMan gameplay-core Shared State。它属于 product/session integration configuration，而不是 World、Event、Relationship 或 Card gameplay state。

文档 SSOT 分工固定为：

~~~text
67-shared-state-records.md
→ gameplay-core Shared State physical Records

76-deepseek-session-configuration.md
→ session-only pokeman.SessionConfig/deepseek exact Record

68-content-fsdb.md
→ Content / FSDB
~~~

因此 `pokeman.SessionConfig/deepseek` 的 exact physical schema 以本文为准。

### 5.1 为什么独立 Record

禁止把 API Key 加进：

~~~text
pokeman.PlayerWorld/current
pokeman.EventStateList/current
pokeman.Relationship/*
pokeman.CarriedCards/*
~~~

也禁止为了该配置建立巨大 pokeman.GameState/current。

独立 SessionConfig Record 可以保持：

~~~text
gameplay business records
!=
session-only provider configuration
~~~

并让未来 persistence 通过 Record allowlist 明确排除它。

## 6. Base 启动时的 State 检查

Base 每次进入配置 Gate 时先读取：

~~~text
pokeman.SessionConfig / deepseek
~~~

规则：

~~~text
record value matches Section 5 exact schema
→ 当前 Session 已配置
→ 不打开表单
→ 继续启动

record absent / null
→ 打开 Schema Form

record non-null but malformed
→ invariant/configuration corruption
→ MUST NOT silently overwrite
→ reject startup Gate
~~~

正常情况下初始 Game baseline 不声明该 Record，因此新 Session：

~~~text
value = null
version = 0
~~~

read() 不 materialize unknown Record。

初始 `state.read()` 本身如果失败，Base MUST NOT 把失败解释成 “Record absent”。Gate 无法证明当前 Session readiness 时不得继续 Map；该 read failure 应按 Shared State failure 传播/终止当前启动流程，而不是打开一个可能覆盖未知 authoritative state 的表单。

当前设计不要求 Base 对一个已经存在的 SessionConfig/deepseek 每次重新 probe。Record 的创建规则保证它只在成功 probe 后写入。

如果 Session 存活期间 credential 后续被 provider 撤销，future Battle 仍必须按现有 Decision/provider failure semantics 处理；startup Gate 不承担持续健康监控。

## 7. Schema Form

配置 UI 使用 @loomrealm-game/schema-form。

概念 request：

~~~ts
{
  schema: {
    version: 1,
    title: "DeepSeek API",
    description: "PokeMan 需要 DeepSeek API Key 才能继续。",
    fields: [
      {
        key: "DEEPSEEK_API_KEY",
        kind: "string",
        label: "DEEPSEEK_API_KEY",
        required: true,
        localstorageKey: "pokeman.deepseek.api-key"
      }
    ]
  },
  cancelable: false,
  onSubmit: async (value, control) => {
    // remote validation + Shared State commit
  }
}
~~~

字段业务 key 固定：

~~~text
DEEPSEEK_API_KEY
~~~

localStorage draft key 固定为：

~~~text
pokeman.deepseek.api-key
~~~

这是 PokeMan product-private exact value，不是 Framework ABI。Implementation MUST NOT 自行改名；若未来产品需要迁移 key，必须单独设计 migration，而不是静默替换。

## 8. localStorage 的精确语义

本设计明确选择：

localStorage 记住用户上一次提交的内容，而不是只保存验证成功的 key。

这正好复用 Schema Form 当前 localstorageKey 的 submit-attempt draft semantics。

固定行为：

~~~text
用户填写 key
↓
点击 Submit
↓
Schema Form 在 Browser 侧 best-effort 写 localStorage
↓
Submit event 到 Runtime
↓
onSubmit 开始远程验证
~~~

因此以下行为是预期行为：

~~~text
用户输入错误 key
→ Submit
→ 错误 key 已写入 localStorage
→ DeepSeek probe 返回认证失败
→ 表单显示错误并继续打开
→ 下次新 Session 打开表单时恢复该错误 key
~~~

这样做的产品目的不是证明该 key 已通过验证，而是避免用户反复从空白重新输入。

localStorage 与 Shared State 的意义必须严格分开：

~~~text
Browser localStorage
= last submitted credential draft
= 可以是无效 key
= Browser/origin-local
= Presentation-side best effort

pokeman.SessionConfig/deepseek
= current Session validated credential
= 只在 probe success 后写入
= cross-Subsystem Session authority
~~~

不得因为 localStorage 有值就跳过 DeepSeek probe。

## 9. Submit lifecycle

Schema Form 的 caller-controlled submit lifecycle 正好用于本场景。

提交后的目标顺序固定：

~~~text
valid Submit
↓
onSubmit
↓
control.setLoading()
↓
probe DeepSeek
↓
probe success
↓
commit pokeman.SessionConfig/deepseek
↓
commit success / reconciled success
↓
control.close()
↓
openSchemaForm settles
↓
Base continues
~~~

失败：

~~~text
probe / provider / State write recoverable failure
↓
control.sendValidateError(...)
↓
control.cancelLoading()
↓
form remains active
↓
user edits / retries
~~~

最关键的顺序 invariant：

~~~text
DeepSeek probe success
→ Shared State known-ready
→ control.close()
→ next Frame
~~~

禁止：

~~~text
probe success
→ control.close()
→ state.commit(...)
~~~

否则可能出现 Form 已经 terminal、Base 开始进入 gameplay，但 future Battle 读取不到 credential 的状态分裂。

## 10. DeepSeek credential probe

probe 由 Base concrete subsystem / PokeMan-private helper 直接发起，不经 Battle library 或 generic Framework network capability。

启动 Gate 使用低成本 authenticated endpoint 验证 credential 与 provider connectivity：

~~~text
GET https://api.deepseek.com/models
Authorization: Bearer <DEEPSEEK_API_KEY>
~~~

官方参考：

- https://api-docs.deepseek.com/api/list-models/
- https://api-docs.deepseek.com/quick_start/error_codes/

成功条件建议固定为：

~~~text
HTTP 200
+
response body 是可解析的模型列表
+
data 中存在 Battle v0 当前要求的 model id: deepseek-flash
~~~

这样 probe 不只是证明 API Key 能认证，还证明当前 Battle v0 固定模型对该 provider profile 可见。

probe 不执行实际 Battle Decision，也不调用 POST /responses，因此不会为了启动游戏额外生成一轮 LLM response。

### 10.1 Timeout / abort

probe MUST 有有限 deadline；当前 PokeMan 固定为：

~~~text
15_000 ms
~~~

实现可以使用任意等价的 timer / AbortController 组合，但必须区分两个原因：

~~~text
Base Frame signal aborted
→ abort underlying probe best-effort
→ propagate Frame abort / AbortError semantics
→ MUST NOT 显示成 “网络超时”
→ MUST NOT 继续 State commit

15 s probe deadline reached while Frame remains active
→ cancel underlying request best-effort
→ treat as recoverable provider/network failure
→ show field error
→ cancelLoading()
→ form remains active
~~~

### 10.2 Provider error mapping

预期 provider/network failure 必须作为可恢复表单错误处理，不应让 onSubmit Promise 直接 reject。

建议 mapping：

~~~text
401
→ API Key 无效，请检查后重试

402
→ DeepSeek 账户余额不足

429
→ DeepSeek 请求受限，请稍后重试

500 / 503 / other 5xx
→ DeepSeek 服务暂时不可用，请稍后重试

network failure / timeout
→ 无法连接 DeepSeek，请检查网络后重试

200 but malformed model response
→ DeepSeek 返回了无法识别的响应，请重试

200 but deepseek-flash absent
→ 当前 DeepSeek 账号/服务未提供 Battle 所需模型
~~~

其他 non-2xx 状态可显示 generic provider configuration failure，并保留重试能力。

只有真正的 programmer/invariant failure 才应让 onSubmit throw/reject，从而升级为 Schema Form operation failure。

## 11. Shared State commit

probe 成功后写：

~~~text
pokeman.SessionConfig/deepseek
→ { apiKey }
~~~

写入必须使用 Shared State v1 的普通 OCC transaction。

每一个 submit attempt 在 DeepSeek probe 成功后都 MUST fresh-read 当前 Record；禁止复用 Base startup read 或前一次 submit attempt 的 version：

~~~text
probe success for submittedCandidate
→ fresh state.read(pokeman.SessionConfig/deepseek)
→ validate current value / capture fresh current version
→ commit:
     condition = that fresh current version
     put { apiKey: submittedCandidate }
~~~

State commit 成功后才允许 control.close()。

### 11.1 commit failure taxonomy

State failure 与 provider validation failure 是不同问题，UI 不应混成“API Key 无效”。

固定分类：

~~~text
CONFLICT
→ re-read exact Record
→ if value exactly equals { apiKey: submittedCandidate }
     reconciled success
  else if value is null
     current attempt did not win the conflict
     keep form active; a later user submit may retry from a fresh read
  else if value is a different valid SessionConfig
     invariant/unexpected concurrent writer
     reject startup operation
  else
     malformed authoritative value
     reject startup operation

OUTCOME_UNKNOWN
→ MUST NOT blind retry
→ re-read exact Record
→ if value exactly equals { apiKey: submittedCandidate }
     reconciled success
  else if value is null
     current attempt is not proven committed
     keep form active; report configuration-save uncertainty
  else if value is a different valid SessionConfig
     invariant/unexpected concurrent writer
     reject startup operation
  else
     malformed authoritative value
     reject startup operation

reconciliation read failure
→ operation failure
→ MUST NOT infer commit success
→ MUST NOT blind retry

BINDING_UNAVAILABLE with known no-commit
→ recoverable infrastructure failure
→ report “无法保存当前配置，请重试”
→ cancelLoading()
→ keep form active

INVALID_REQUEST / LIMIT_EXCEEDED
→ programmer/design invariant failure
→ reject onSubmit / startup operation
→ MUST NOT blame API key

TERMINAL
→ propagate terminal/unwind
→ user editing the key cannot repair it

other unknown/unclassified State failure
→ propagate as operation failure
~~~

在正常 PokeMan topology 中 Base 是该启动 Gate 的唯一预期 writer，因此 CONFLICT 不是普通 happy path。只有 read-back 与当前 submit attempt 的 candidate **完全相同** 时，才能把 CONFLICT / OUTCOME_UNKNOWN reconcile 为该 attempt success。

## 12. Abort / Frame lifecycle

probe 必须绑定当前 Base Frame 的 abort lifecycle，并遵守 Section 10.1 对 Frame abort 与 probe timeout 的区分。

目标：

~~~text
Base Frame abort
→ outstanding probe best-effort cancelled
→ Schema Form abort
→ 不进入 Map
~~~

Shared State commit() 按 v1 contract 不接受远程 mutation cancellation。

因此：

~~~text
probe success
→ before dispatching commit, if Frame already aborted: do not begin new commit

commit already dispatched
→ do not pretend abort means no-commit
→ respect commit evidence / OUTCOME_UNKNOWN semantics
~~~

即使迟到 commit 最终写入 SessionConfig，也不得让已经 aborted 的 Base Frame 继续调用 child Frame。

## 13. Base 与后续 Frame 的 Gate invariant

Base 的核心启动 invariant：

~~~text
before frame.call("map", ...)
pokeman.SessionConfig/deepseek MUST match Section 5 exact schema
~~~

因此完整启动拓扑变成：

~~~text
Game Entry
→ Base
   ↓
   read SessionConfig/deepseek
   │
   ├─ present
   │   → ready
   │
   └─ absent
       → non-cancelable Schema Form
       → localStorage restore draft
       → Submit
       → loading
       → GET /models probe
       → Shared State commit
       → close form
       → ready
   ↓
   create game-controls-input
   ↓
   call Map
~~~

配置失败不会创建 Map Frame。

## 14. Future Battle integration

本设计不修改 @loomrealm-game/battle 的 frozen public API。它只在 PokeMan concrete integration 层保留当前阶段的 credential/network ownership 例外。

未来 PokeMan battle subsystem 的 product composition 应保持：

~~~text
scope.state.read(pokeman.SessionConfig/deepseek)
↓
apiKey
↓
construct PokeMan-specific configured DeepSeekTransport
↓
transport uses the State-provided key for provider HTTP
↓
new DeepSeekDecision({ transport })
↓
inject DecisionPort into BattleRuntime
~~~

禁止改成：

~~~ts
new DeepSeekDecision({
  apiKey
})
~~~

DeepSeekDecision 仍然不知道 credential source/storage。

Battle Simulation 仍然只看到 DecisionPort。

### 14.1 credential propagation prohibition

即使当前 API Key 在 Shared State 中，以下路径仍禁止携带 raw key：

~~~text
Frame params
Session Events
Content
RenderData outside active credential form needs
BattleObservation
DecisionRequest
PlanSubmission
Battle Simulation state
BattleSnapshot
Replay
BattleResult
diagnostics / logs
~~~

PokeMan concrete integration 读取 key 的唯一目的，是建立当前 provider transport / startup probe。

## 15. 当前阶段的 authority 例外

Shared State v1 的 general guidance 把 transport credential 默认归为 Platform binding；Battle v0 Integration 也把 credential source/storage 与 physical network realization 放在 trusted product/platform composition。

本设计有意识地选择阶段性 PokeMan product exceptions：

~~~text
Exception A — credential placement
DEEPSEEK_API_KEY
→ pokeman.SessionConfig/deepseek Shared State
→ concrete PokeMan integration may read it

Exception B — physical provider network ownership
Base concrete subsystem
→ direct DeepSeek startup probe

future Battle concrete integration
→ PokeMan-private DeepSeekTransport performs provider HTTP
~~~

理由是：

~~~text
当前优先关闭 PokeMan Battle 接入所需的 credential configuration gap
+
已有 Shared State 已能提供 cross-Subsystem Session fact
+
未来 Save/Load 尚未实现
+
当前安全 hardening 明确延期
~~~

该决定不得推广成：

~~~text
Framework credentials should live in Shared State
Battle library should read Shared State credentials
all games should use SessionConfig
Shared State is a generic secret store
~~~

这只是 PokeMan 当前阶段的 product-private choice。

未来若引入正式 credential capability/store，应只替换：

~~~text
PokeMan key source
+
Base direct startup probe realization
+
DeepSeekTransport construction
~~~

而不修改：

~~~text
DecisionPort
DeepSeekDecision public API
Simulation
Replay
Battle gameplay rules
~~~

## 16. Save / Load 规则

future Save 必须采用明确的 Record allowlist，而不是：

~~~text
state.scan()
→ serialize everything
→ blacklist secret fields
~~~

目标：

~~~text
Save persistence allowlist
├─ pokeman.PlayerWorld
├─ pokeman.EventStateList
├─ pokeman.Relationship
└─ pokeman.CarriedCards

DO NOT persist
└─ pokeman.SessionConfig
~~~

因此 Save 与 Load 的精确语义必须区分 Session lifecycle：

~~~text
fresh Session
→ SessionConfig/deepseek starts absent/null
→ Base Gate runs
→ localStorage may restore last submitted draft
→ user submits / probe
→ current Session gets validated credential

Load into the same live Session
→ restore only allowlisted gameplay Records
→ MUST NOT write/delete pokeman.SessionConfig
→ existing validated Session credential remains unchanged
→ MUST NOT re-open Base Gate solely because a save was loaded

future product chooses “Load = replace entire Session”
→ old Session ends
→ fresh Session starts
→ new Session has no SessionConfig
→ Base Gate runs again
~~~

Save document 不应知道 apiKey 字段，也不应依赖“过滤 JSON 某个字段名”。

Record-level exclusion比字段 blacklist 更稳定；未来 SessionConfig 增加其他 session-only configuration 时，也默认不会进入 save。

## 17. Security / UX deferred work

当前阶段明确接受：

~~~text
Schema Form string field may display key as ordinary text
localStorage stores ordinary Schema Form draft encoding
Shared State stores raw apiKey JSON string
PokeMan concrete Runtime can read raw credential
~~~

这是已知技术债，不在本改造中隐藏或伪装成 secure storage。

Schema Form 当前 README 明确建议不要用 `localstorageKey` 保存 password/token/credential。本设计有意识地对 PokeMan 当前阶段作例外：`localstorageKey` 仍用于保存 last-submitted API-key draft。该例外必须在未来 password/secret field 与 credential-at-rest hardening 落地时重新审查，不得据此修改 Schema Form 的通用安全建议。

后续计划可以分别增加：

~~~text
Schema Form password/secret presentation hint
localStorage encrypted-at-rest encoding
formal credential capability / secret store
platform-specific secure storage
trusted backend/proxy transport
credential replacement / reset UX
~~~

这些是 hardening / architecture migration，不阻塞当前 PokeMan Battle integration。

即使未来 localStorage 增加 encryption，也必须保持本设计已选择的 product semantics：

~~~text
localStorage
= last submitted draft
!= validated credential authority
~~~

## 18. 推荐 implementation boundary

后续实现 PR 建议保持小范围，但必须形成 Runtime + Browser Presentation 的完整闭环：

~~~text
examples/PokeMan/package.json
→ add @loomrealm-game/schema-form dependency
→ ensure schema-form Browser build artifact is available

examples/PokeMan/subsystems/base.mjs
→ add startup Gate call

examples/PokeMan/subsystems/deepseek-config.mjs
→ PokeMan-private form/direct-probe/state helper

examples/PokeMan/presentation.json
→ add Schema Form Browser script/style refs

PokeMan Presentation FSDB resources / sync script
→ copy/sync:
   @loomrealm-game/schema-form/browser/schema-form.browser.js
   @loomrealm-game/schema-form/browser/schema-form.browser.css
→ into stable Presentation resource keys referenced by presentation.json

examples/PokeMan/scripts/prepare-pwa-content.mjs
→ current implementation already includes every presentation.json style/script ref
→ no new selection mechanism is expected
→ tests MUST prove the new Schema Form refs are present in prepared PWA content

PokeMan tests
→ startup Gate + real Browser Schema Form qualification

future battle integration
→ separate PR
~~~

stable Presentation resource identities 固定为：

~~~text
Presentation / schema-form/schema-form.browser.js
Presentation / schema-form/schema-form.browser.css
~~~

Implementation MUST 使用上述 exact resource keys，并同步修改 `presentation.json`、FSDB resource、sync/test evidence；不得自行改名，也不得依赖 Browser 全局或开发环境偶然加载 Schema Form。

本设计不要求修改：

~~~text
@loomrealm/subsystem
@loomrealm/shared-state
@loomrealm-game/schema-form contract
@loomrealm-game/battle contract
Main
Renderer/Data protocol
Session Events
Framework launch protocol
~~~

如果实现发现必须修改这些 frozen surfaces，应停止并重新审查设计，而不是在 implementation PR 中顺带扩展 Framework。

## 19. 最小测试 / qualification 要求

实现阶段至少覆盖：

1. SessionConfig absent 时 Base 在 Map 前打开不可取消表单。
2. valid exact SessionConfig 已存在时不打开表单；malformed non-null value 作为 invariant failure，不静默覆盖。
3. initial Shared State read failure 不被解释成 absent。
4. localStorage 有 draft 时字段恢复该值，但不会跳过 probe。
5. 空值被 Schema Form built-in validation 拦截。
6. valid key Submit 后进入 loading，重复 submit/cancel 被阻止。
7. 401 显示字段错误，Shared State 仍 absent，Map 未启动。
8. network/5xx 显示可恢复错误，Shared State 仍 absent。
9. 15 s probe deadline 显示 recoverable timeout；Base Frame abort 则按 Abort/unwind，不显示成 timeout。
10. probe 200 但模型列表 malformed 时不能完成 Gate。
11. probe 200 但缺少 deepseek-flash 时不能完成 Gate。
12. probe success + State commit success 后才 close form。
13. Gate 完成后 Map 只启动一次。
14. BINDING_UNAVAILABLE known-no-commit 显示配置保存失败，不显示 credential invalid。
15. INVALID_REQUEST / LIMIT_EXCEEDED / TERMINAL 不伪装成用户可修复的 API-key error。
16. 每一次 submit attempt 在 probe success 后都 fresh-read State version；不得复用 startup/previous-attempt version。
17. OUTCOME_UNKNOWN 不 blind retry；只有 read-back exact `{apiKey: submittedCandidate}` 才 reconciled success；null 保持 form，不同 valid credential / malformed value / reconciliation read failure 均按 Section 11.1 终止或失败。
18. CONFLICT read-back 为 null 时可保持 form 等待下一次 fresh submit；不同 valid credential 或 malformed value 必须作为 invariant failure，不能静默 success。
19. API Key 不出现在 Frame params、Session Events、Battle payload 或 Replay 测试快照中。
20. Schema Form JS/CSS 以 exact resource keys `schema-form/schema-form.browser.js` / `schema-form/schema-form.browser.css` 进入 Presentation resources、`presentation.json` 与 prepared PWA content，并在真实 Browser 中完成 restore + async submit。
21. 当前受支持的 PokeMan launch profile 必须证明 Base Runtime 可 direct probe DeepSeek；尤其 PWA 必须用真实 Browser/Worker 路径证明没有被 CORS/host policy 阻断。
22. future Save qualification 证明 SessionConfig 不进入 save document。
23. same-live-Session Load 不修改/删除现有 SessionConfig；fresh Session 才重新运行 Gate。

Browser qualification 应至少有一条真实 Schema Form + localStorage restore + async submit path，避免只用纯 unit test 模拟 caller-controlled submit。

## 20. Acceptance summary

本设计完成后的产品 invariant：

~~~text
Browser localStorage
= last submitted DEEPSEEK_API_KEY draft

pokeman.SessionConfig/deepseek
= current Session successfully validated DeepSeek credential

Base
= startup configuration gate
= owns current PokeMan direct DeepSeek startup probe

PokeMan baseline bootstrap
= runs after DeepSeek Gate success
= atomically materializes PlayerWorld/current + EventStateList/current when both are absent
= does not create Relationship / CarriedCards

Map / later gameplay
= cannot start before Gate success + baseline readiness

future Battle
= reads Session credential only in concrete product composition
→ creates configured DeepSeekTransport
→ keeps DeepSeekDecision({ transport }) unchanged

Save
= allowlist gameplay records
→ never serializes pokeman.SessionConfig
~~~

最重要的状态转换是：

~~~text
UNCONFIGURED
→ FORM_ACTIVE
→ VALIDATING
→ SESSION_CONFIG_COMMITTED
→ CREDENTIAL_READY
→ POKEMAN_BASELINE_READY
→ downstream Map Frame
~~~

失败只能回到可继续编辑/重试的 FORM_ACTIVE；不能在 credential 未验证或 Shared State 未形成 authoritative ready fact 时越过 Gate。

Base 的 baseline bootstrap 不属于 credential Gate 本身，但执行顺序固定在 Gate 之后、`frame.call("map")` 之前。两条 singleton baseline Record 只允许“同时 absent → 原子创建”或“同时存在且合法 → 保留”；单边存在视为 PokeMan invariant failure。具体值与 OCC reconciliation 见 67 / 79。
