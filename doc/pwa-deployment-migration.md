# PokeMan PWA 构建与部署

PokeMan 是独立产品仓库；LoomRealm 作为固定 Git Submodule 提供通用 PWA Runtime、Installer、Bundle Builder 和部署框架。**游戏源码、FSDB、game-libs 与产品 Bundle 输入均由 PokeMan 自己管理。** 构建过程不再把源码复制到 `loom-realm/examples/PokeMan` 或 `loom-realm/game-libs`。

## 构建流水线

1. PokeMan 的 CI 在 GitHub-hosted Runner 上运行 `scripts/ci/run-pokeman.sh`，安装并构建固定 LoomRealm 依赖、建立 PokeMan 自己的 workspace links，编译 PokeMan 的 game-libs 并运行产品测试。
2. `PokeMan PWA Staging` 在 PR 上只使用 GitHub-hosted Runner。它先核验 `HEAD:loom-realm` 与已检出的 Submodule SHA 一致。
3. `scripts/pwa/build-installation-bundle.mjs` 从 PokeMan 仓库读取 `game.json`、`launch.pwa.json`、`presentation.json`、五个 Subsystem 和 `[FSDB]PokeMan/`。五个 Subsystem 由 esbuild 在 PokeMan 自己的 workspace 中打包为自包含 ESM；FSDB Content 被编码为规范 Base64。该脚本只在系统临时目录生成中间 executable，不写入或改动 LoomRealm 源码。
4. PokeMan 脚本输出版本化的 `installation-bundle v1` JSON 到 Runner 临时目录。随后调用固定 Submodule 暴露的通用接口：

   ```sh
   cd loom-realm
   npm run build:bundle -w @loomrealm/pwa -- \
     --bundle "$RUNNER_TEMP/pokeman-installation-bundle.json" \
     --app-id pokeman \
     --base-path /pwa/pokeman/
   ```

5. LoomRealm Builder 只构建 PWA Shell、校验通用 Bundle Contract，并生成 `apps/pwa/dist/staging/pwa/pokeman/`。它不查找 PokeMan 目录、不读取游戏源码，也不依赖旧 `examples/PokeMan`。
6. `verify-staging.mjs` 比较 Bundle 的 manifests / presentation 与 PokeMan 当前源文件，验证五个模块的 SHA-256、Content Base64、输出资源、gitlink，并记录 `source-provenance.json`（PokeMan SHA、LoomRealm SHA、Bundle ID）。
7. Chromium E2E 在 GitHub-hosted Runner 对 `/pwa/pokeman/` 执行真实游戏验收。PR 不会触发 Docker Runner。
8. 受信任 main 的 CI 成功后，Hosted job 上传同次验收的 Artifact。只有仓库变量 `PWA_STAGING_DEPLOY_ENABLED=true` 时，组织级 `pwa-runner-labs` 才会下载该 Artifact，重新核验 commit / gitlink / provenance，再调用 Submodule 中的 `deploy-staging.mjs`。

## Bundle 边界

- PokeMan 拥有：Game Entry、PWA Launch Manifest、Presentation、Subsystem ESM、FSDB Content、产品级校验和产品来源证明。
- LoomRealm 拥有：PWA Shell、Service Worker、安装协议、通用 Bundle Contract、Bundle Identity、通用构建器和部署原语。
- PokeMan 的五个 Subsystem 在进入 Bundle 前必须已打包为自包含 ESM；不允许留下 `@loomrealm/*` 或 `@loomrealm-game/*` 的运行时裸模块导入。
- `bundleId` 由 LoomRealm 通用 Builder 计算，覆盖 Shell Generation 与完整 payload；只更新游戏代码、Presentation 或 FSDB Content 也会产生新安装身份。
- 不允许从旧 `loom-realm/examples/PokeMan` 读取产品源码；不允许把 PokeMan 的源码、manifest 或 FSDB 写回 Submodule 工作树。

## 安全与部署约束

- **PR 只在 GitHub-hosted Runner 上构建和运行测试。** PR 不得使用 Docker Socket Runner。
- GitHub 组织 Runner Group: `pwa-deploy-labs`。允许仓库仅 `lithdoo-labs/pokeman`，Selected workflows 仅：
  - `lithdoo-labs/pokeman/.github/workflows/pwa-staging.yml@refs/heads/main`
  - `lithdoo-labs/pokeman/.github/workflows/pwa-runner-smoke.yml@refs/heads/main`
- Runner 名称 `pwa-runner-labs`，标签 `self-hosted, linux, x64, pwa, pwa-labs`。
- 容器以 root 运行并能控制整个 Docker Engine。Docker 操作仅限受信任 main 的发布脚本，不运行用户 Issue / PR 指令。
- **仓库变量 `PWA_STAGING_DEPLOY_ENABLED` 默认不存在/false。** 即使 CI Success 也不调度 Docker Runner；Runner Group、宿主机注册和 Smoke 完成后再单独启用。
- 新发布工作流与旧 LoomRealm 发布工作流不允许同时部署 8787。Windows 操作顺序见 `lab-server/projects/pwa-runner/docs/labs-migration.md`。
- Submodule 只更新到已审查、已合并并通过 CI 的 LoomRealm commit；不要浮动跟随 main。
- 不在 Actions Workflow 或 Artifact 中记录 PAT / Docker 主机凭据。

## 发布验收

- [ ] PokeMan PWA Staging 在 PR 下 Hosted Qualification 成功（产品构建 + generic Bundle build + Chromium）。
- [ ] 官方 PokeMan main CI 成功。
- [ ] Artifact 的 `installation-bundle.json` 与 `source-provenance.json` 对应本仓库和固定 LoomRealm SHA。
- [ ] LoomRealm 旧 PWA 部署工作流已关闭，不再尝试调度个人仓库 Runner。
- [ ] 组织 `pwa-deploy-labs` Runner Group 创建，仓库和 Selected workflows 白名单已配置。
- [ ] Windows Runner 容器用全新的组织注册目录重新注册，GitHub 显示 Online / Idle。
- [ ] PWA Runner Smoke (labs) 在 main 上手动运行成功。
- [ ] 打开 `PWA_STAGING_DEPLOY_ENABLED` 并在 main 手动触发 `publish=true`，或由新的可信 main CI Success 自动部署。
- [ ] Windows 主机从 `http://localhost:8787/pwa/pokeman/` 访问，游戏行为、Map、Dialogue、刷新和 Service Worker 正常。
- [ ] 未变更其他容器、端口、持久化文件；保留旧 releases 及回滚记录。

## 应急处理

Hosted Bundle / Chromium 失败时不能放宽部署门槛。先修复 PokeMan Bundle 输入或通用 Builder。若 Runner Queued，检查 Runner Group / 标签 / Selected workflows；若发布失败，保留 `F:/lab-data/pwa/releases` 和 `deploy-state/active.env` 的原活动版本。手动主机验证失败时关闭部署变量并排查，不重复触发危险部署。
