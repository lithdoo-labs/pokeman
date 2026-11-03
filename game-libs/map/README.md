# Map 游戏库

当前功能、数据流、行为边界和测试入口统一见 [地图模块文档](../../doc/20-modules/loom-map/README.md)。跨角色协议见 [正式契约](../../doc/15-contracts/README.md)；开发/qualification 规则见 [30-development](../../doc/30-development/README.md)。

Terrain Behavior 的正式声明范围由 [Terrain Behavior Contract v1](./TERRAIN_BEHAVIOR_CONTRACT_V1.md) 冻结：Neutral(13)、Bridge(15)、Ledge(1)。原版事实、许可边界与可复现来源见 [evidence](./TERRAIN_BEHAVIOR_EVIDENCE.md)。旧 candidate/freeze-readiness 路径只保留 superseded 兼容说明，不再拥有 current status。

Repository policy 为 `synthetic-only CI + legal-local original qualification + sanitized repository facts/digests`；原始 `.rxdata`、PBS、Graphics、Audio、`Game.exe`、RGSS DLL、截图与 raw observation logs 不进入仓库。

进行中的 Map 工作使用 GitHub Issue/PR；不要重新创建 `todo_docs/` 或 Mxx/逐轮 review 文档。
