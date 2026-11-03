# PokeMan PWA Map-only 接入执行计划（Local Agent）

> 路径：`examples/PokeMan/doc/71-pwa-map-implementation-plan.md`
>
> 状态：**Implemented / Qualified**。本文件保留实施约束与验收范围；当前 landing evidence 见 [Game Control Ports v1 qualification](../../../doc/30-implementation/game-control-ports-v1-qualification.md)。
>
> 基线：以执行时最新 `origin/main` 为准；此前 Map-only Desktop 工作已由 PR #93 合并。
>
> 本次交付边界：**让现有 PokeMan Map-only 游戏通过 LoomRealm PWA 安装/运行管线，在 Playwright Chromium 中安装、启动、渲染、移动、转场并显示静态 NPC**。不要求正式用户入口、浏览器“安装到主屏幕”或离线冷启动；这些是后续独立任务。

## 0. Agent 执行约束

1. **先检查工作区，再获取最新 `main`**。不要丢弃、覆盖、混入未提交的用户改动；创建一个新分支，例如 `feat/pokeman-pwa-map-only`，不要直接开发或推送到 `main`。名称冲突时使用新名字，不覆盖既有远端。
2. 完整阅读本计划与第 1 节列出的实际代码。以当前仓库契约和可复现测试为准；若仓库 HEAD 与本文不一致，查明差异后按最小改动实现目标，并在报告说明。
3. **游戏 gameplay 范围必须始终只有 `map`**；运行拓扑是 product-private `base + map`，其中 Base 只拥有 controls producer。不实现 World、Dialogue、Battle、Message、System Menu、Story Resolver、Encounter、Relationship、Contract 或 LLM；不得为“跨平台”复制 Map Library。
4. Desktop 与 PWA 共用 `examples/PokeMan/game.json`、`subsystems/map.mjs`、FSDB 数据和 Presentation 定义。平台差异限定在物理启动清单、构建/安装/宿主适配，不给游戏业务代码加入 `window`、`document`、`Worker`、OPFS、Service Worker 或平台分支。
5. 优先修改 `examples/PokeMan/**` 及完成 PWA 浏览器验证所需的 `apps/pwa/scripts/**`、`apps/pwa/test/**`、必要测试调度。`packages/**`、`game-libs/**`、PWA Platform 核心默认只读；发现真实框架缺陷时单独复现并限制修复范围，不顺带重构。
6. 不改写大批 FSDB 原始资源、产品/剧情文档或已有 Windows 启动行为。`[FSDB]PokeMan/` 的物理位置保持在安装根目录。禁止把测试用的 Qualification 全局 API 作为正式产品 API。
7. **自主完成代码、测试、commit、push 和新 PR**。PR 目标是 `main`；不要自动合并。不得把作者声称通过、静态检查通过、测试桩通过等同于真实浏览器验证通过。
8. 每个阶段都记录 PASS/FAIL/BLOCKED 和实际命令。权限、工具或浏览器环境缺失时交付已完成部分及精确阻塞原因，不伪造成功。

## 1. 当前基线与必读参考

### PokeMan 当前已有

- `examples/PokeMan/game.json`：当前 topology 是 `base + map`；initial params 仍是 Map 3、坐标 `(3,8)`、玩家资源 `Characters/Player`。
- `examples/PokeMan/launch.hostra.json`：当前 Desktop manifest 精确绑定 `base + map`，保留 Desktop 启动能力与 `play.bat` 行为目标。
- `examples/PokeMan/subsystems/map.mjs`：`RPGMapBuilder`、`onMapEntering`、`setNPC` 提供静态 NPC；不要在 PWA 创建第二份游戏逻辑。
- `examples/PokeMan/[FSDB]PokeMan/`：Map、MapTransfer、Tileset、NPC、Graphics、Presentation 等内容。已有 `scripts/sync-map-presentation.mjs` 解决 Desktop 的 Map browser JS/CSS 与 FSDB 资源同步。
- `examples/PokeMan/presentation.json`：引用 `Presentation/map/map.css`、`Presentation/page.css`、`Presentation/map/map.browser.js`。
- `examples/PokeMan/test/map-smoke.test.mjs`、`presentation-sync.test.mjs`：已验证 Desktop Map-only 内容/同步基本性质。
- 目前没有 PokeMan 专用 `launch.pwa.json`、PWA Bundle 准备工具、PokeMan Chromium E2E 或正式 PWA 游戏选择入口。

### PWA 现有能力（必须复用）

| 源码 / 文档 | 应参考的能力 |
| --- | --- |
| `apps/pwa/src/installation-bundle.ts` | `PwaInstallationBundleV1` 精确字段：`gameEntryText`、`launchManifestText`、`content`、`executables` |
| `apps/pwa/src/installer.ts` | 安装前的 Game/Manifest/Executable/Content 校验、SHA-256、发布与存储限制 |
| `apps/pwa/src/qualification-window-entry.ts` | 仅用于 Qualification 的 `install(bundle)`、`launch(installationId, presentation)` |
| `apps/pwa/src/window-product.ts` | 现有产品默认启动 Demo；支持选择指定安装并 `restart` |
| `apps/pwa/src/renderer-host.ts` | PWA Presentation resource 准备与 Browser Renderer |
| `apps/pwa/scripts/build.mjs` | `--qualification` 时打包 Essentials Map ESM；可沿用这条构建路径 |
| `apps/pwa/scripts/run-e2e.mjs` | 启动本地测试 HTTP 服务，指定 E2E 测试文件 |
| `apps/pwa/test/m17-product.e2e.test.mjs` | **最直接的参考**：真实 Essentials Map FSDB/ESM 安装，Render、键盘输入和 Session 重启 |
| `apps/pwa/test/installation-content.e2e.test.mjs` | 已安装 Content/Executable 的 Service Worker 路由与离线读取 |
| `packages/game-launcher-pwa/src/index.ts` | `launch.pwa.json`、可执行 ESM graph 的校验 |
| `packages/fsdb/src/index.ts` | `openFsdb`、`listFsdbEntries`、`openFsdbObject`；用于 FSDB 身份和内容读取 |
| `doc/15-contracts/pwa-launcher-profile-v1.md` | Frozen PWA Worker Runner / PREPARE / executable 安全边界 |
| `doc/20-modules/pwa-host/README.md` | PWA Window、Session Worker、Subsystem Worker、Service Worker Authority |

尤其注意：现有 `m17-product.e2e.test.mjs` 已证明 **Map Library 可以运行于 PWA**。本任务目标是验证 **PokeMan 这份游戏** 可复用该链路，不能重新实现底层平台能力。

## 2. 本次交付架构

```text
examples/PokeMan/game.json --------------------┐
examples/PokeMan/launch.pwa.json ---------------┤
examples/PokeMan/[FSDB]PokeMan/ ----------------┼─ Node 端资格/打包工具
examples/PokeMan/subsystems/base.mjs -- esbuild --┐
examples/PokeMan/subsystems/map.mjs  -- esbuild --┘
                                                ↓
                               PwaInstallationBundleV1
                               ├── gameEntryText
                               ├── launchManifestText
                               ├── content[] (record / group / resource)
                               └── executables[] (browser ESM)
                                                ↓
                             apps/pwa Qualification install
                                                ↓
                                installationId / OPFS
                                                ↓
                          existing PWA Launcher + Session Worker
                                                ↓
                          existing Subsystem Workers (base + map; only map is gameplay)
                                                ↓
                            existing Renderer/Input/Viewport
```

**禁止**直接在 PWA 中访问本地 FSDB 文件路径，或让浏览器 Worker 从 npm 包名解析 `@loomrealm-game/map`。必须先转换 Content identity 并构建安装时可枚举的浏览器 ESM。

## 3. 执行阶段及完成门槛

### P0 — 同步仓库并建立基线

1. 检查 `git status --short`、Node/npm、Chromium/Playwright 是否已就绪；保护所有现存用户改动。
2. `git fetch origin`，从最新 `origin/main` 创建独立任务分支；确认已包含合并后的 Desktop Map-only 实现。
3. 阅读上述参考源和文档，记录 PokeMan 对 Map / Graphics / Presentation 的实际依赖、可运行地图链路与现有测试脚本。
4. 尽可能运行基线：
   ```bash
   npm ci
   npm run build:m17
   npm test -w @loomrealm-example/pokeman
   npm run test:m17 -w @loomrealm/pwa
   ```
5. 区分测试所需的 Chromium 安装、Hostra/桌面参考测试与 PWA 本身缺陷。缺少环境时具体指出哪个命令/可执行文件不可用。

**门槛：** 基线与外部环境状态已记录；不在未确认构建成功前修改大量原始数据。

### P1 — 新增 PokeMan PWA 启动清单

在 `examples/PokeMan/launch.pwa.json` 新增：

```json
{
  "formatVersion": 1,
  "subsystems": [
    { "key": "base", "module": "subsystems/base.mjs" },
    { "key": "map", "module": "subsystems/map.mjs" }
  ]
}
```

1. 使用 `@loomrealm/game-launcher-pwa` 已有 parser 校验该清单，不仅比较 JSON 文本。
2. 校验 `game.json` 的 Subsystem key 集合与 `launch.pwa.json` 精确一致；Desktop/PWA 都声明 `base + map`，且只有 `map` 是 gameplay subsystem。
3. `module` 是 **PWA 安装内的逻辑路径**，不是 URL、Desktop 绝对路径或外部 Worker Entry。
4. Controls landing 允许并要求同步修改 `game.json`、`launch.hostra.json`、新增 `base.mjs`、修改 `map.mjs`；除这组已批准 composition 变更外，不扩大 gameplay scope。

**门槛：** 桌面与 PWA 入口共享同一逻辑游戏定义，物理绑定正确且平台无关。

### P2 — 构造真实 PokeMan Content 安装数据

实现可重复执行的 **Node 端** FSDB → PWA 内容准备工具/测试 fixture，建议归在 `examples/PokeMan/scripts/` 或 `apps/pwa/test/helpers/`；工具应可测试、稳定排序、无人工枚举的大段硬编码列表。

1. 通过 `@loomrealm/fsdb` 的扫描/身份/对象读取 API 获取记录和资源；不要仅凭物理扩展名推断 PWA logical key。不要包含任何 `.meta` / 描述文件作为 Content 条目。
2. 将 FSDB identity 明确映射成 `PwaBundleContentEntryV1`：
   - FSDB `struct.Map/3` → `{kind:"record",namespace:"struct.Map",key:"3"}`
   - FSDB `struct.MapTransfer/3` → `record / struct.MapTransfer / 3`
   - FSDB `struct.Tileset/3` → `record / struct.Tileset / 3`
   - FSDB `struct.NPC/professor` → `record / struct.NPC / professor`
   - FSDB `resource.Graphics/Characters/Player` → `resource / resource.Graphics / Characters/Player`
   - FSDB `resource.Presentation/map/map.browser.js` → `resource / resource.Presentation / map/map.browser.js`
   - 其他 FSDB `group` 类型若实际存在，应正确映射 `kind:"group"` / NDJSON；不擅自把 `struct` 当 PWA `kind`。
3. 二进制 PNG 按原样传递字节及 `image/png`；JSON / JS / CSS 的 MIME 必须与安装器限制一致。`Presentation` 的源文件名 `map.browser.js.js`、`map.css.css` 不能泄漏到逻辑 key。
4. 内容范围至少覆盖可运行路线 `3→2→4`、`2→8`、`2→5→7` 及其 MapTransfer/Map/Tileset/Autotile/Graphics、玩家与 NPC 定义、三份 Presentation 资源。不得为满足测试构造与真实 FSDB 脱节的手写资源。
5. 可以选择将整个现有 PokeMan FSDB 安装为 Content（静态文件规模目前看不大），但必须先检查 PWA Installer 的数量、单项、总大小与 MIME/JSON 校验限制；对于不需要的剧情/Battle 内容，不改变其 Authority 或业务解释。若选择“地图可达依赖闭包”，必须验证引用完整并写出明确的 selection policy。
6. 防止重复 `kind+namespace+key`，不存在引用、错误 MIME、损坏字节和越界尺寸时必须失败。排序/打包结果应稳定，便于校验。
7. 浏览器安装需要原生 `Blob`。若 fixture 从 Node 注入 Playwright 的 `page.evaluate`，可通过 UTF-8 文本或 base64 bytes 传递并**在浏览器端构造 Blob**；不得依赖把 Node `Blob` 直接结构化克隆过去。
8. `presentation.json` 不属于 `PwaInstallationBundleV1` 的顶层字段；应在安装成功后作为现有 `launch(installationId, presentation)` 的独立参数。

**门槛：** 真实 FSDB 能稳定转化成 PWA Content entries；安装器能正确验证、存储并通过 PWA Content API 找回所需身份。

### P3 — 构建 PokeMan 浏览器 Base + Map ESM

1. 使用仓库已安装的 esbuild，分别以 **`examples/PokeMan/subsystems/base.mjs`** 与 **`examples/PokeMan/subsystems/map.mjs`** 为两个 logical executable entry，目标 `bundle:true`、`platform:"browser"`、`format:"esm"`。Base 只包含 product controls producer composition；Map 仍是唯一 gameplay entry。
2. 建议扩展 `apps/pwa/scripts/build.mjs` 的 `--qualification` 分支，为 PokeMan 生成命名明确的 base/map 两个产物（例如 `pokeman-base.mjs`、`pokeman-map.mjs`）。如封装为独立 Node 构建脚本，必须无缝接入既有构建命令，不要求测试人员手工执行 `npx esbuild`。
3. `executables` 精确包含与 `launch.pwa.json` 绑定的 `subsystems/base.mjs` 与 `subsystems/map.mjs` 两个 logical module，MIME 均为 `text/javascript`。
4. PWA Executable Graph 必须不含 bare npm imports、绝对/跨源 import、未枚举的 dynamic imports；通过现有 `buildPwaExecutableIndexV1` / PREPARE 校验。不要靠运行时 import map 或为 PWA Worker 安装 npm resolver。
5. 不能修改 `game-libs/map` 的公共 API 或拆一份 `map.pwa.mjs` 业务副本以规避构建问题。
6. 验证生成产物与当前源/依赖构建一致，并避免提交 `apps/pwa/dist` 一类生成物。
7. 同步把 PokeMan staging/qualification fixture 从单一 `executable` 改为 plural executable collection；`pokeman-window-entry.ts`、bundle identity、bundle unit test 与 Chromium E2E 必须共同消费 `base + map`，不得在不同路径保留单-map特例。

**门槛：** 用真实 `subsystems/base.mjs` 与 `subsystems/map.mjs` 打包所得两个 ESM 都可被 PWA Launcher 完整校验；Base 负责 product controls producer，Map 仍是唯一 gameplay Runtime。

### P4 — PokeMan Chromium 真实 E2E（本次主要验收）

参考 `apps/pwa/test/m17-product.e2e.test.mjs`，新增 `apps/pwa/test/pokeman-map.e2e.test.mjs`，不要仅复制文件存在性检查。

1. 通过现有本地 PWA 测试 HTTP 服务打开带 Service Worker 的 Chromium Qualification Window。
2. 使用 P2 准备的真实 Content 和 P3 打包的真实 ESM 构造 `PwaInstallationBundleV1`；经现有 Qualification `install` 获得 `installationId`，以 `launch(installationId, presentation)` 启动。
3. 等待 `lr-map-view` 与 `lr-map-sprite` 真实渲染就绪，核验首次进入 Map 3 `(3,8)`、主角 sprite / `mapVisualState=ready`。
4. 验证键盘移动及碰撞（对比移动前后的地图坐标）；包括 NPC 阻挡或明确的地图地形阻挡，不以按键事件触发次数代替游戏状态变化。
5. 验证静态 NPC 投影：Map 3 家人、Map 4 博士与宿敌、Map 5 道路 NPC、Map 7 城镇 NPC、Map 8 宿敌等。以实际 Render/Runtime 投影事实为准，不仅检查 NPC 定义文件。
6. 验证地图路线：`3→2→4→2→8` 与 `2→5→7`，并重点回归 Map 3 初始 `(3,8)` contact transfer 不会进入立即往返循环。可根据实际地图几何合理驱动输入/等待状态，不修改业务地图来迁就测试。
7. 检查多次转场后仍能输入、没有 `pageerror` / 业务 fatal、Renderer 不出现持续空白画面。
8. 验证已安装 Bundle 的 Content 与 Executable 可由 Service Worker 路由读取、MIME 和版本正确。必要时在已加载页面关闭网络，验证**安装资源的离线读取**；不要声称这等于浏览器重新启动离线可运行。
9. 通过一次 Window/Session restart 检查已安装资源可复用、DOM 自定义元素不会重复注册，以及 Map 可重新启动。若设计要求 fresh session 重置起点，应按现有 `game.json` 验证。
10. 测试失败时保存可复现操作序列、mapId/玩家坐标/关键状态和 Console/Page error；不使用 Demo fixture 假冒 PokeMan，不把 Playwright Mock Render 当真实游戏。
11. 将新 E2E 纳入 `apps/pwa/scripts/run-e2e.mjs` 的 `m17/all` 运行列表及相关 CI 的 PWA qualification 路径；避免只在单机手动运行，而 CI 后续完全不覆盖。

**门槛：** 真实 Chromium Playwright E2E 可重复通过，能够证明 Map 3 初始展示、玩家输入移动、跨地图转场、NPC 可见与重启保持可用。

### P4.5 — Clean build orchestration

Controls migration 已删除 `@loomrealm-game/map` 通过 `prebuild` 隐式构建 `@loomrealm-game/common-controls` 的耦合。顶层 build lane 显式保证依赖顺序：

```text
build:m14
→ build common-controls
→ build tile-presentation / map / Essentials

build:m15
→ inherit corrected m14 graph

build:m17 / @loomrealm/pwa build:qualification
→ common-controls built before:
   - reading dist/browser/device-input.browser.js
   - bundling example map.mjs imports from common-controls/subsystem
```

必须至少做一次 clean-dist 验证，证明没有依赖旧 workspace `dist/`：

```text
remove affected generated dist outputs
run canonical build / qualification commands
→ PASS
```

不得通过恢复 Map package `prebuild` 来修复构建顺序；build dependency 属于 root/product orchestration。

### P5 — 回归、报告与 PR

1. 在适用环境执行（实际命令以修改后脚本为准）：
   ```bash
   npm ci
   npm run build:m17
   npm test -w @loomrealm-example/pokeman
   npm test -w @loomrealm-game/map
   npm run test:m17 -w @loomrealm/pwa
   ```
2. 新增针对 P2/P3 的 Node 单元或 fixture 测试，覆盖 FSDB identity 映射、资源 bytes/MIME、重复身份、缺失引用、Bundle 安装边界与打包 ESM 合法性。不能只靠一个体积庞大的 E2E 覆盖所有错误处理。
3. 检查 Desktop 的 `play.bat`、`launch.hostra.json`、`game.json` 与原 `presentation.json` 未被破坏；必要时额外运行现有 Hostra qualification。
4. 检查 `git diff`，不要提交构建目录、playwright 临时报告、缓存、下载的浏览器、额外的图片拷贝或用户已有修改。
5. 用语义明确的 Conventional Commits 提交、推送新分支，在 GitHub 创建新的 PR；PR 标题可使用 `feat(pokeman): run map-only game in PWA qualification`，**不合并 PR**。
6. PR 描述列出真实执行的命令、Chromium/E2E 结果、跨地图/NPC 验收结果、未解决风险、与后续正式 PWA 产品化的区别。

**门槛：** 代码已提交推送、新 PR 已创建、已运行的自动化与浏览器验收有证据；未覆盖环境要写 BLOCKED，不得宣称已发布正式 PWA。

## 4. 推荐改动清单

```text
examples/PokeMan/
├── launch.pwa.json                   # PWA 绑定 base + map
├── game.json                         # initial=base，注册 base + map
├── launch.hostra.json                # Desktop 同样绑定 base + map
├── subsystems/
│   ├── base.mjs                      # product-private controls producer
│   └── map.mjs                       # shared Map gameplay + controls adapter
├── presentation.json                 # 保持 controls/map/page shared display definition
├── scripts/
│   ├── sync-map-presentation.mjs     # 继续复用
│   └── <PWA 内容准备工具>.mjs        # 视实际实现新增
└── test/
    └── <PWA 打包测试>.test.mjs       # 视需要新增

apps/pwa/
├── scripts/build.mjs                 # qualification 构建 PokeMan ESM
├── scripts/run-e2e.mjs               # 注册新 PokeMan 浏览器 E2E
└── test/
    ├── pokeman-map.e2e.test.mjs      # 新增：真实 Map PWA 运行
    └── helpers/<fixture>.mjs         # 可选：Bundle fixture

scripts/ci/run-capability.mjs          # 若现有 CI 任务注册需要，最小接入
package-lock.json                     # 仅在依赖声明发生变化时更新
```

如果使用已有 npm workspaces 不需要新增依赖，避免不必要修改 lockfile。具体文件组织允许依据现有惯例调整，但必须保留单一职责及明确归属。

## 5. 验收矩阵

| 验证层级 | 必须验证 | 不可混淆为 |
| --- | --- | --- |
| 静态 | `game.json` 与两个平台 manifest 都精确注册 `base + map`，initial 为 `base` | Runtime 已启动 |
| 构建 | PokeMan ESM 无 bare imports，Executable Graph 校验通过 | 浏览器显示正确 |
| Bundle/Installer | 真实 Map/Graphics/Presentation 身份可安装和读取 | 正式游戏安装 UI |
| Browser E2E | Map 3 → Map 2 → Map 4 等路线，NPC、移动、碰撞、重启 | 仅文件存在 |
| 回归 | Desktop 原入口不退化、Map Library 测试正常 | Windows 已实机复测（若未执行） |
| 离线 | 已安装 Content 在当前受控页面可离线读取 | 离线冷启动 |
| 产品化 | **本次不要求** 正式安装选择/版本管理、Web App Manifest、Shell 缓存 | 已经可作为面向用户安装的完整 PWA |

## 6. 非目标与下一阶段

**本 PR 仅负责 PokeMan Map-only 的 PWA 兼容和真实资格验证。** 以下任务应另开 PR，不混入本次实施：

- **后续 PR B — 正式 PokeMan PWA Launch：** 为生产 `window-entry` 提供受支持的安装/选择/启动流程，复用 `installPwaBundle` 与 `installationId`，建立版本更新策略，**不能暴露 Qualification 全局安装接口给生产用户**。
- **后续 PR C — Installable / Offline Cold Start：** Web App Manifest / icons、HTTPS 部署、App Shell 离线缓存/更新一致性、真正断网后从新浏览器上下文重新打开的资格验证。
- 如果后续需要发布不同项目的 PWA，先明确产品级 installation acquisition/UI policy，不因为这一个例子重写通用 Installer 或 Game Launcher。
- 不实现 PokeMan 的 World / Dialogue / Battle / Event / Story / Save 等业务系统。

## 7. 最终交付报告模板

```text
PokeMan PWA Map-only 实施报告

1. 基线
   - origin/main 基线 SHA：
   - 开发分支：
2. 改动
   - 文件 → 变更目的
   - FSDB 到 PWA Content 的映射与纳入范围
   - PokeMan ESM 的构建方式与校验
3. 测试
   - npm ci：
   - npm run build:m17：
   - PokeMan unit：
   - PokeMan Chromium E2E：
   - PWA m17 regression：
   - Desktop regression（如适用）：
4. 浏览器事实
   - Map 3 起点：
   - 地图移动与 NPC 阻挡：
   - 路线/转场：
   - Session restart：
   - 已安装 Content 离线读取：
5. 边界检查
   - topology 是否精确为 base + map，且只有 map 是 gameplay subsystem：是/否
   - 是否改动 Map Library / PWA Platform 内核：是/否及原因
   - 是否保持 Desktop 启动：是/否
   - 是否触及正式 UI/离线冷启动：否（应为非目标）
6. GitHub
   - 分支：
   - Commit SHA：
   - 新 PR URL：
7. 剩余风险和后续 PR B/C：
```

## 8. 停止条件

- **达到本次目标：** P1–P4 的自动化与真实 Chromium Map 游戏 E2E 通过，P5 的适用回归通过，且安装的 executable index 精确为 `base + map`；PR 创建完成后，可以报告「PokeMan Map-only gameplay 已通过 base+map PWA qualification」。
- **不能据此报告：** 「PokeMan 正式 PWA 已上线」「可安装到主屏幕」「断网后可冷启动」，因为正式用户入口、Web App Manifest、Shell 缓存等不在本次范围。
- **环境不满足：** 实现并提交可以验证的部分，明确标记 Browser/Hostra 等实际未完成的验收；不可伪称全部通过。

---

关联资料：

- [此前 Map-only Desktop 计划](./70-map-only-implementation-plan.md)
- [PokeMan README](../README.md)
- [PWA product composition](../../../apps/pwa/README.md)
- [PWA Launcher Profile v1](../../../doc/15-contracts/pwa-launcher-profile-v1.md)
- [现有 PWA Essentials Map E2E](../../../apps/pwa/test/m17-product.e2e.test.mjs)
