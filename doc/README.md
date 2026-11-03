# PokeMan / 口袋从者 文档

`../DESIGN.md` 保持原样，作为此前单文件概念设计基线。本目录把其中内容按主题拆分，便于后续分别维护产品规则、场景和技术设计。

- [00-product.md](./00-product.md) — 项目定位、素材来源、构建与分发边界
- [10-session-frames.md](./10-session-frames.md) — Game Session、System Menu、Message Frame
- [20-world-cards.md](./20-world-cards.md) — 世界角色、契约、角色卡、口袋与中心管理器
- [30-battle.md](./30-battle.md) — Battle、Card Integrity、1v1 与长期养成方向
- [40-encounter-loop.md](./40-encounter-loop.md) — Visible Encounter、Challenge、Hostile 与核心游戏循环
- [50-mvp-prologue.md](./50-mvp-prologue.md) — MVP 序章场景与验证循环
- [60-data-placement.md](./60-data-placement.md) — Content、Shared State 与 Runtime Memory 的模块归宿和业务边界
- [61-character.md](./61-character.md) — Character、Relationship、Contract、Card 与 Map NPC Instance
- [62-event.md](./62-event.md) — Event、EventStateMutation、EventStateList、场景 directive 与 Story Index
- [63-world-data-model.md](./63-world-data-model.md) — Character / NPC / Story / Relationship / Card / Battle 整体数据模型
- [64-dialogue.md](./64-dialogue.md) — 固定 Dialogue 的线性台词、末尾 Choice、分支、Mutation 与 FSDB identity
- [65-data-model-diagram.md](./65-data-model-diagram.md) — 当前数据 authority、FSDB identity 与关键链路 Mermaid 总览
- [66-data-authority.md](./66-data-authority.md) — Content / Shared State / Runtime Memory 三层 authority 清单
- [67-shared-state-records.md](./67-shared-state-records.md) — MVP 核心 Shared State 的 Record 粒度、namespace/key、value shape 与约束
- [68-content-fsdb.md](./68-content-fsdb.md) — PokeMan Content 的 FSDB table、record identity、引用编码与 JSON shape
- [69-dialogue-web-component.md](./69-dialogue-web-component.md) — PokeMan Dialogue Presentation 的精确 Wireframe、canonical/Shadow DOM、四状态机、人物资源 producer contract、同步 History/READY coordination 与 Presentation 落地边界
- [70-map-only-implementation-plan.md](./70-map-only-implementation-plan.md) — Local Agent 的 Map-only 实施步骤、测试与验收计划
- [71-pwa-map-implementation-plan.md](./71-pwa-map-implementation-plan.md) — Local Agent 的 PokeMan PWA Map-only 接入、Bundle/ESM 构建与 Chromium E2E 验收计划
- [72-controls-composition.md](./72-controls-composition.md) — Map-only gameplay 的 private `base + map` controls composition
- [73-dialogue-gameplay-vertical-slice.md](./73-dialogue-gameplay-vertical-slice.md) — Professor NPC 的独立 Dialogue Subsystem / child-Frame 垂直切片：Map call、Activation controls、RPGDialogue、History/Choice、人物资源解析与 Map fresh resume
- [74-dialogue-presentation-v1.1.md](./74-dialogue-presentation-v1.1.md) — Issue #118 的 Dialogue Presentation v1.1 优化：连续 session shell、READY inert-retain、30/70 横向人物布局、窄屏 breakpoint、紧凑 spacing 与人物 sprite 连续性
- [75-map-presentation-v1.1.md](./75-map-presentation-v1.1.md) — Issues #123/#124/#125 的 Map v1.1 统一设计：responsive facing、accepted/staging visual scene、persistent incremental projection 与 atomic map-transfer presentation
- [76-deepseek-session-configuration.md](./76-deepseek-session-configuration.md) — DeepSeek API Key 的 Base 启动 Gate、Schema Form draft restore、Session-only Shared State、provider probe 与 future Battle transport 集成边界
- [77-battle-integration-v1.md](./77-battle-integration-v1.md) — PokeMan Battle v0 的 Map child-Frame 接入、Content / Decision / Simulation / Presentation 组合、Contract Integrity 缺口与端到端验收设计
- [78-prologue-dialogue-content.md](./78-prologue-dialogue-content.md) — Map 4 序章博士玩法科普、劲敌互换双向卡片、三种 Battle 结果确认对白与业务边界
- [90-scope-principles.md](./90-scope-principles.md) — MVP 非要求、设计原则与当前非目标

`00`–`50` 与 `90` 是从 `DESIGN.md` 拆出的产品规则。`60`–`77` 是其后新增的技术设计；`78` 是序章固定 Dialogue 的内容设计。它们都不回写 `DESIGN.md`。

当前 physical data canonical sources：

```text
Gameplay-core Shared State
→ 67-shared-state-records.md

Session-only DeepSeek configuration
→ 76-deepseek-session-configuration.md
→ pokeman.SessionConfig/deepseek exact Record

Content / FSDB
→ 68-content-fsdb.md
```

如果 `60`–`66` 中仍出现早期的 Record / namespace / key / Content identity 表述，gameplay-core Shared State 以 `67`、Session-only DeepSeek configuration 以 `76`、Content/FSDB 以 `68` 的最新结论为准。Runtime / gameplay policy 仍由对应模块文档定义，不因为 physical schema 已冻结就自动转成数据问题。