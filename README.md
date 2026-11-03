# PokeMan / 口袋从者

PokeMan 当前运行切片由 **DeepSeek Session 配置 Gate + Map + Dialogue** 组成，用于验证 Game Package、FSDB Content、Schema Form、Session-only Shared State、Map Runtime、Dialogue、Renderer/Input 与 Essentials 地图资源能够在 Desktop/Hostra 和 PWA 中真实跑通。

- 产品文档：[`doc/`](./doc/README.md)
- 原单文件设计基线：[`DESIGN.md`](./DESIGN.md)（保留不变）
- Game Package 入口：`game.json`
- Hostra launch composition：`launch.hostra.json`
- Base / DeepSeek Gate：`subsystems/base.mjs`、`subsystems/deepseek-config.mjs`
- Map Subsystem：`subsystems/map.mjs`
- Dialogue Subsystem：`subsystems/dialogue.mjs`
- Content FSDB：`[FSDB]PokeMan/`
- 启动：Windows 下运行 `play.bat`

当前启动点：

```text
Map 3 = 玩家家
spawn = (3, 8)
player sprite = resource.Graphics / Characters/Player
```

当前 Hostra launch composition 精确注册 product-private **`base + map + dialogue`**。`base` 先执行不可取消的 DeepSeek Session 配置 Gate；只有 provider probe 成功且配置提交到 Session Shared State 后，才关闭 Schema Form、创建唯一的 `<game-controls-input>` producer 并调用 `map`。`map` 可通过 child Frame 调用 `dialogue`。system-menu / message / world / battle 占位文件仍保留在仓库中，但不参与当前运行拓扑。

Controls composition 的 canonical landing 见 [`doc/72-controls-composition.md`](./doc/72-controls-composition.md)，DeepSeek Gate 与 credential 边界见 [`doc/76-deepseek-session-configuration.md`](./doc/76-deepseek-session-configuration.md)。Desktop/Hostra 与 PWA 使用同一 `base + map + dialogue` 逻辑 topology；API Key 只作为本机 draft 和当前 Session 的 Shared State 配置，不进入 Content、launch manifest 或诊断输出。

当前切片的 NPC placement 暂时由 `subsystems/map.mjs` 在 `onMapEntering` 中静态提供，只用于验证 Map NPC 渲染、碰撞与 Dialogue 链路；后续接入 Story Resolver 后，应由 Character / Event / Encounter Content 解析结果替代，不把这份临时 placement 作为业务 authority。

最小检查：

```bat
npm test -w @loomrealm-example/pokeman
node --test --test-concurrency=1 test/pokeman-hostra-deepseek.test.mjs
```

真实 DeepSeek HTTPS 401 资格测试默认跳过，需显式启用（只使用测试生成的无效 synthetic key）：

```bat
set LOOMREALM_DEEPSEEK_HOSTRA_QUALIFICATION=1
node --test --test-name-pattern="direct HTTPS" test/pokeman-hostra-deepseek.test.mjs
```
