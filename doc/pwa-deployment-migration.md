# PokeMan PWA 部署迁移

LoomRealm 项目已将 PokeMan 游戏代码迁移至本仓库。PWA **游戏构建、验收、发布触发**也统一由 lithdoo-labs/pokeman 管理，保留 loom-realm 作为**固定 Git Submodule 框架**，不再部署 loom-realm/examples/PokeMan 旧示例。

## 流水线

1. PokeMan 原有 CI 在 Github-hosted Runner 上验证游戏与 Map。
2. main 的 CI push 成功，自动触发 PokeMan PWA Staging。也可以在 main 手动触发，默认只做 Hosted Qualification。
3. Hosted Qualification 在精确提交的 PokeMan checkout 上安装 Submodule，使用 scripts/pwa/stage-game.mjs **把当前 PokeMan 代码和 FSDB 原样暂存到工作区内的 LoomRealm Builder 兼容位置**，再调用固定 LoomRealm PWA Builder 构建。该镜像副本是 CI 临时产物，不改 gitlink，不推送 submodule。
4. verify-staging.mjs 比较 Bundle 的 game/launch/presentation 与 PokeMan 仓库的当前源文件，并记录 source-provenance.json（PokeMan SHA、LoomRealm SHA、Bundle ID）；Chromium E2E 必须通过。
5. Hosted job 上传构建产物。仅当当前提交属于受信任的 main 且仓库变量 PWA_STAGING_DEPLOY_ENABLED=true 时，组织级 pwa-runner-labs 才会下载同次验收的 Artifact，验证 PokeMan commit/框架 gitlink 与 provenance 一致，复用 LoomRealm 的 deploy-staging.mjs。
6. 部署先使用候选端口 8790 做内部 HTTP smoke，再更新共用的 loomrealm-pwa Web Compose 项目（127.0.0.1:8787）；失败按上一个 active.env release 回滚。候选和正式 HTTP smoke 不替代 Windows 主机浏览器验收。

## 为什么需要 stage-game.mjs

固定 LoomRealm PWA Builder 仍读取 loom-realm/examples/PokeMan 和 loom-realm/game-libs 中的示例源码。直接照搬旧 YAML 会把**旧游戏而不是本仓库的 PokeMan**发布到 8787。

stage-game.mjs 用于填充固定构建器的既有路径：从当前 PokeMan 仓库复制 game、launch、presentation、subsystems、FSDB、六个 game-libs 的源文件。LoomRealm 的 Package/Workspace Manifest 仍保留框架原值，避免破坏 npm workspace。CI 在产物级别重新验证 PokeMan 源码身份。未来框架 PWA Builder 支持参数化外部游戏目录时，可替换此临时适配层。

## 安全要求

- **PR 只在 GitHub-hosted Runner 上构建和运行测试。** PR 不得使用 Docker Socket Runner。
- GitHub 组织 Runner Group: pwa-deploy-labs。允许仓库仅 lithdoo-labs/pokeman，Selected workflows 仅：
  - lithdoo-labs/pokeman/.github/workflows/pwa-staging.yml@refs/heads/main
  - lithdoo-labs/pokeman/.github/workflows/pwa-runner-smoke.yml@refs/heads/main
- GitHub Runner 名称 pwa-runner-labs，标签 self-hosted, linux, x64, pwa, pwa-labs。
- 已通过 PokeMan CI 的 main SHA 触发部署资格检查，运行之前和部署前都做 SHA 核验；构建和浏览器测试全部在 Hosted Runner，只有部署最后一步有 Docker Socket 权限。
- 容器以 root 运行并能控制整个 Docker Engine。Docker 操作仅限受信任 main 的发布脚本，不运行用户 Issue / PR 指令。
- **仓库变量 PWA_STAGING_DEPLOY_ENABLED 默认不存在/false，即使 CI Success 也不调度 Docker Runner。** Runner Group 切换、旧部署停用、Smoke 通过之后再设为 true。
- 新发布工作流、旧 LoomRealm 发布工作流不允许同时部署 8787。具体 Windows 操作顺序见 lab-server/projects/pwa-runner/docs/labs-migration.md。
- 使用固定 LoomRealm gitlink；不要直接升级 Submodule。
- 不在 Actions Workflow 或 Artifact 中记录 PAT / Docker 主机凭据。

## 发布验收

- [ ] PokeMan PWA Staging 在 PR 下 **Hosted Qualification 成功**（build + Chromium）。
- [ ] 官方 PokeMan main CI 成功。
- [ ] LoomRealm 旧 PWA 部署工作流已关闭，不再尝试调度个人仓库 Runner。
- [ ] 组织 pwa-deploy-labs Runner Group 创建，仓库和 Selected workflows 白名单已配置。
- [ ] Windows Runner 容器用全新的组织注册目录重新注册，GitHub 显示 Online / Idle。
- [ ] PWA Runner Smoke (labs) 在 main 上手动运行成功。
- [ ] 打开 PWA_STAGING_DEPLOY_ENABLED 并在 main 手动触发 PWA Staging 的 publish=true，或由新的可信 main CI Success 自动部署。
- [ ] 部署 Artifact 的 source-provenance.json 是本仓库 main 的 SHA。
- [ ] Windows 主机从 http://localhost:8787/pwa/pokeman/ 访问且游戏行为、Map、Dialogue、浏览器刷新和 Service Worker 正常。
- [ ] 未变更其他容器、端口、持久化文件；保留旧 releases 及回滚记录。

## 应急处理

Hosted Bundle/Chromium 失败时不能放宽部署门槛，先修复 PokeMan 源码适配。若新 Runner Queued，检查 Runner Group/标签/Selected workflows；若发布失败，保留 F:/lab-data/pwa/releases 和 deploy-state/active.env 的原活动版本。手动主机验证失败时暂时关闭部署变量，排查而不重复触发危险部署。
