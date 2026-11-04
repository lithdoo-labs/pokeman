# 地图游戏库：当前产品行为

> 实现入口：`game-libs/map` / `@pokeman/game-map`。System/framework boundary 由 [ADR0032](../../decisions/0032-game-library-example-boundary.md) 与 Current Architecture/Contracts 定义；本文拥有 Map game-library 的 Current realization summary。

Current developer references：

- [公开 API 与生命周期](./api.md)
- [Runtime / 数据 / Presentation 语义](./runtime-and-presentation.md)
- [Control Port v1 candidate](./control-port-v1.md) — **Normative Candidate / Ready for implementation**
- [Control Port / Activation-scoped Common Controls Consumer 改造设计](../../10-architecture/game-control-ports.md) — 跨模块 wiring / landing 设计；落地前不覆盖当前 Map Runtime
- [Terrain Behavior Contract v1](../../game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_V1.md)
- [Terrain provenance / legal boundary](../../game-libs/map/TERRAIN_BEHAVIOR_EVIDENCE.md)

Terrain Behavior v1 已冻结，支持范围为 Neutral(13)、Bridge(15)、Ledge(1)。2026-10-09 的 original RGSS dynamic qualification 已完成；该历史 PASS 只对记录的 subject/input 有效，未来相关行为或 qualification input 改变仍按[subject/staleness](../../30-development/qualification.md)重新判断。

## 责任与数据流

```text
legal-local Essentials / RMXP source (readonly)
→ selective importer + validation
→ prepared FSDB
   - struct.Map (including narrow bridge behaviors)
   - struct.Tileset
   - struct.MapTransfer
   - struct.NPC where used
   - logical Graphics resources
→ ContentClient
→ map-owned Runtime
→ RenderDomain
→ Renderer current replica / Web Presentation
→ game-owned lr-map-view / lr-map-sprite
```

`game-libs/map` 是 reusable game business，不是 framework protocol package。Importer 不进入 Runtime；Browser 不决定 passage/event/bridge authority；concrete Game Entry、资源和页面组合归 example/product。Current Runtime **不读取独立 `struct.MapAction` 作为运行时协议**；Bridge 的 narrow behavior projection 属于 `struct.Map.behaviors`。

## 数据与运动语义

- RMXP map 保持三层 Table；Tileset 包含 `autotile_names`、`passages`、`priorities`、`terrain_tags`；非法输入 fail-closed。
- Transfer 是独立 `struct.MapTransfer`，包含 Step / Contact / Edge 三类已投影事实；Importer 负责 source-specific event/connection 解释，Runtime 不执行原始 Ruby。
- Terrain 原值 0–17 保留；正式支持 slice 只承诺 Neutral(13)、Bridge(15)、Ledge(1)。None(0)/NoEffect(17) 不可冒充 Neutral。
- `resolveEffectiveTerrainTag` 与 passage evaluation 分离；一次方向输入只得到 `blocked | walk | jump` 之一。
- narrow Bridge behavior 只投影有证据的 `pbBridgeOn` / `pbBridgeOff` 语义、占用和触发，不按固定 map/event/tile ID 写玩法逻辑。
- Runtime 唯一持有坐标、方向、事件调度、`bridgeLevel∈{0,2}`、motion/scene/visual epoch。Bridge state 改变时人物、terrain depth 和必要 camera projection 在同一次 RenderDomain authoritative update 中收敛。
- ordinary walk 为 250ms。正式 Ledge slice 是单次两格 jump / one motionId；official v21.1 动态观察确认当前支持案例为 500ms、24px 峰值；cross-map jump 不在 v1 slice。
- Browser 只验证/播放 Runtime payload；resize、transfer、取消和过期 motion completion 不得回写 authority。
- 当前 Map View 已实现 small-map presentation geometry：地图像素尺寸小于 logical viewport 时按轴居中，地图外区域为白色；这只改变 presentation，不改变 gameplay 坐标、passability、transfer 或 Runtime authority。

精确 Builder/Handler/Error surface、NPC 规则和命令生命周期见 [API](./api.md)；autotile、layering、transfer transaction、RenderDomain topology、small-map geometry 与 Browser latest-wins 见 [Runtime / Presentation reference](./runtime-and-presentation.md)。

## 场景与验证

Map7 覆盖普通行走/Transfer 与 bridge negative；Map21 覆盖四组 Bridge On/Off 场景；Map47 覆盖两格 Ledge jump 及逆向/阻挡/边界负例。具体事件 ID 只属于 evidence/fixture identity，产品逻辑不可硬编码。

主要验证入口包括 map workspace tests、importer fixture tests、browser/product E2E，以及需要合法本地 runtime/material 的 original-behavior qualification。CI synthetic fixture、产品 E2E 与 original dynamic observation 是不同证据等级。

两份 2026-09-21 的 Essentials entity/sprite 真实数据调查因包含不可替代 external provenance、真实 corpus 统计和 legal-local boundary，作为 Historical Evidence 保留在 [`doc/history/evidence/map`](../../history/evidence/map/README.md)；它们不是 Current schema 或产品支持声明。

## 当前/未来边界

Current v1 behavior 由正式 Terrain Contract、本文及两个 Current Map reference、源码/tests 共同投影；冲突时以 formal contract / actual public source surface 为准，文档必须同步修正。

Future product work 使用 GitHub Issue/PR 追踪；已经存在于 current source/tests 的行为不得为了“清理旧 draft”重新登记成未实现需求。完成后的 durable facts 回到本模块/Contract/Development，而不是新建 milestone roadmap。

相关规范：[User Input v1](../../15-contracts/user-input-v1.md) · [Render Update v1](../../15-contracts/render-update-v1.md) · [Content API v1](../../15-contracts/content-api-v1.md) · [Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)。