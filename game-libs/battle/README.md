# Battle 游戏库

`@loomrealm-game/battle` 是独立的双 Actor 同时行动战斗系统。

核心职责分工：

> **Decision 决定想做什么；Simulation 决定能不能做、什么时候发生、结果是什么；Presentation 决定怎么显示。**

Battle 使用 200 ms/Tick 的确定性 Simulation，不复用 RPGMap Runtime；Map 与 Battle 只共享可复用的 tile presentation/layout 能力与兼容素材形式。

## 规范入口

当前规则按职责拆分：

- [BATTLE_V0_SPEC.md](./docs/BATTLE_V0_SPEC.md) — gameplay/runtime Rule IDs 与核心行为。
- [BATTLE_V0_CONTRACTS.md](./docs/BATTLE_V0_CONTRACTS.md) — Content、Observation、PlanSubmission、Snapshot、Event、Projection 等数据契约。
- [BATTLE_V0_SIMULATION.md](./docs/BATTLE_V0_SIMULATION.md) — Runtime state、clock/scheduler、Decision pipeline、Tick transaction、pause、Snapshot/Replay。
- [BATTLE_V0_DECISION.md](./docs/BATTLE_V0_DECISION.md) — `DecisionPort`、DeepSeek concrete Decision、workflow/transport/failure contract。
- [BATTLE_V0_INTEGRATION.md](./docs/BATTLE_V0_INTEGRATION.md) — Host/Frame、RPGMap 素材兼容与 product composition boundary。
- [BATTLE_V0_PRESENTATION.md](./docs/BATTLE_V0_PRESENTATION.md) — Presentation API、Render Tree/Browser ABI、camera/viewport/effects/lifecycle。
- [BATTLE_V0_TEST_MATRIX.md](./docs/BATTLE_V0_TEST_MATRIX.md) — Rule ID → scenario → expected result。

权威顺序：

```text
SPEC
→ CONTRACTS
→ SIMULATION
→ DECISION
→ INTEGRATION
→ PRESENTATION
→ TEST_MATRIX
```

README 不复制具体 Rule；旧单体设计、迁移矩阵和阶段状态由 Git 历史保存，不属于 Current normative source。

## 当前系统边界

- v0 严格 1 ally + 1 enemy，双 Actor 同时行动；Actor identity 不由数组 slot 表达。
- Simulation 是唯一 Battle gameplay authority；Decision 与 Presentation 不反向拥有 Simulation state。
- Simulation 自己拥有 200 ms Battle clock、scheduler、event queue、Tick reducer 与 accepted-plan execution。
- `DecisionPort.decide()` 是 Simulation-facing stable Decision boundary；concrete provider/workflow 可以在该边界后替换。
- Decision completion 不直接推进 gameplay；Simulation 在 Tick snapshot boundary 消费 outcome 并执行 validation、stale 判定与 bounded plan pipeline。
- provider-neutral availability circuit 在连续 Decision attempt failure 达到规范阈值后复用 Battle PAUSED lifecycle；恢复需要显式 `resume()`。
- accepted Plan 按 Action materialize；多格 movement 逐格 reservation/commit，不提前生成未来 step event。
- moving Actor 可以被 damaging hit interrupt；direction、turn、recovery、protection、same-Tick damage 与 simultaneous defeat 均由 Simulation Rule 决定。
- Presentation 只消费 Scene/Projection/Event；browser/camera/animation 不反向推进 Tick 或修改 Simulation。
- `game-libs/tile-presentation` 提供 Map/Battle 共用的纯 layout/viewport implementation；Battle 不依赖 `@loomrealm-game/map` Runtime。

具体规则、边界条件与 deterministic ordering 只查对应 current spec。

## Product integration boundary

Battle package 不拥有 product credential、网络 secret 或平台 lifecycle source。具体产品负责提供 configured capabilities，例如：

```text
DeepSeekTransport
Host suspend/resume mapping
product-specific pause/retry UI
optional future PlayerGuidance inputs
```

这些 capability 不得改变 Simulation-facing authority：Decision 仍通过 `DecisionPort` 工作，Presentation 仍不成为 gameplay authority。

PlayerGuidance、产品级 credential/network composition 与具体 UX 属于产品/后续 capability 范围，不属于 Battle v0 core gameplay contract。

## Workspace / qualification

根 workspace 通过 `game-libs/*` 识别 Battle package。标准 Battle gate：

```text
npm run test:battle
```

该 gate 构建/运行 Battle Simulation、Decision、Presentation 及相关 browser/acceptance coverage。Qualification 的 exact subject、环境与历史 PASS 属于 evidence，不在 README 复制。

进行中的 Battle 工作使用 GitHub Issue/PR；完成后的 durable facts 合入对应 SPEC/Contract/Integration/Presentation/Test 文档。