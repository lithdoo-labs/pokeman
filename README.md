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

## Issue 驱动的 OpenCode 2 开发

PokeMan 支持独立的 GitHub Issue Agent，使用组织级 `opencode-lithdoo-labs` Runner。该流程与现有 `CI`（LoomRealm + PokeMan/Map 测试）并行运行，不替代 CI。

1. 使用 `lithdoo` 账号创建普通 Issue，写明需求和验收标准。
2. 在 Issue 评论 `/agent start`，经授权后由 OpenCode 2 完成代码、生成 `agent/issue-N` 分支与 Draft PR，随后自动回复原 Issue。
3. 审查 PR 后，在 Issue 或 PR 留修改意见，再回到同一 Issue 评论 `/agent revise`；系统恢复**同一个 OpenCode Session**并更新**同一个 PR**。
4. 所有 PR 由人工审查和合并，Agent 不会自动合并。

默认禁止 Agent 修改 `[FSDB]PokeMan/` 资源、`loom-realm` Submodule、`.github/`、`scripts/ci/` 和权限配置。详细配置、权限需求与验收方法见 [docs/issue-agent.md](docs/issue-agent.md)。

## PWA 部署（组织级 labs Runner）

PokeMan 的 PWA Staging 构建与部署 CI 由本仓库管理。PokeMan 自己生成 `installation-bundle v1`，再调用固定 LoomRealm Submodule 的通用 `build:bundle`；构建不再把游戏源码镜像到 `loom-realm/examples/PokeMan` 或 `loom-realm/game-libs`。主分支的游戏 `CI` 通过后，`PokeMan PWA Staging` 在 GitHub-hosted Runner 上构建和执行 Chromium 验收，最终由组织级 `pwa-runner-labs` 发布已经验收的 Bundle。

发布默认关闭（`PWA_STAGING_DEPLOY_ENABLED` 未启用），必须先按 [PWA 迁移文档](doc/pwa-deployment-migration.md) 完成 Runner Group、宿主机注册及旧部署入口退役。旧 `loom-realm/examples/PokeMan` 不再作为游戏发布源；`loom-realm` 只提供固定版本的构建框架。
