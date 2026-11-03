# PokeMan Map-only 落地执行计划（Local Agent）

> 路径：`examples/PokeMan/doc/70-map-only-implementation-plan.md`
>
> 状态：**Historical execution plan / 部分内容已实现**。本文件保留早期 Map-only 落地过程；不要把其中“新增 package / 新建 sync script”等历史步骤当作当前 controls migration 待办。当前 controls topology 与 exact landing 以 [72-controls-composition.md](./72-controls-composition.md) 和 [Game Control Ports](../../../doc/10-architecture/game-control-ports.md) 为准。
>
> 目标平台：**Windows Desktop / Hostra**。本阶段保持 **Map-only gameplay**，但 controls landing 允许并要求新增一个 product-private `base` infrastructure Subsystem；不得扩展到 World、Dialogue、Battle 等游戏业务。
>
> 验收定义：通过 `examples/PokeMan/play.bat` 启动后，玩家能够在已导入的地图上移动、碰撞、触发地图转场、看到正确的静态 NPC；配套自动化验证能重复运行。
>
> Controls topology 的当前 authority 是 [72-controls-composition.md](./72-controls-composition.md)。本文中任何旧的“单 map topology”表述都以该文件的 `base + map` landing 为准。

## 0. Agent 工作约定

1. 先读本文和所列参考文件，检查当前工作树；不要覆盖或清理用户已有修改。按阶段实施，优先修改 PokeMan 示例本身。
2. 以**实际源码、运行表现和测试结果**为准。文档只是预期；代码行为与计划矛盾时，先定位原因，再做满足目标的最小修复。
3. 允许改动：`examples/PokeMan/**` 和为 npm workspace 注册所必需的根目录 `package-lock.json`。其他目录原则上只读；如必须修框架 Bug，先给出证据、范围和独立测试，不顺带重构。
4. 运行拓扑固定为 **`base + map`**：`base` 仅承载 `<game-controls-input>` producer，`map` 是唯一 gameplay Subsystem。不得接入/实现 `world`、`dialogue`、`battle`、`message`、`system-menu`，不得引入 Story Resolver、Relationship、Contract、Shared State 游戏业务逻辑或 LLM。Controls exact 设计见 [72-controls-composition.md](./72-controls-composition.md)。
5. 不重新导入、删除、替换或批量格式化 Essentials 地图/图片/FSDB 内容；仅在证明 Map-only 链路存在数据错误且有测试保护时做局部更正。不要提交构建产生的 `dist`、临时文件、备份或运行日志。
6. 每完成一个阶段运行对应检查；区分「静态测试通过」「Runtime 集成测试通过」「Windows 实机通过」，未运行的项目不得写成通过。
7. 交付时提供改动文件清单、验证命令与结果、剩余风险及本机启动方法。遇到缺少 Windows、Electron 或 Hostra 等环境限制时，完成可执行的自动化部分，明确列出人工验证步骤，不以 Mock 代替真实运行结论。

## 1. 当前基线及参考实现

### 当前 PokeMan 状态

- `game.json`：注册 product-private `base + map`，初始 `mapId: 3, x: 3, y: 8, characterName: "Player"`。
- `launch.hostra.json`：`base` / `map` 分别绑定 `subsystems/base.mjs` / `subsystems/map.mjs`。
- `subsystems/base.mjs`：只持有统一 controls producer 并调用 Map；`subsystems/map.mjs` 通过 `RPGMapBuilder`、Consumer/Tracker 和 `RPGMapControls` 启动地图并保留静态 NPC placement。
- `[FSDB]PokeMan/`：已有 Map、MapTransfer、Tileset、NPC、Graphics 与 Presentation 数据；单个直接 FSDB 根目录。
- `presentation.json`：当前已引用 controls device-input JS、Map CSS/JS 与 page CSS；controls migration 继续复用这条 Presentation artifact。
- `[FSDB]PokeMan/[resource]Presentation/`：当前已存在 controls device-input、Map CSS/JS 与 page CSS 同步产物。
- `presentation.css` 当前已作为 page CSS source，保持全窗口地图样式。
- `play.bat` 与 `scripts/sync-map-presentation.mjs` 当前已形成 Desktop 启动前 Presentation 同步链；controls migration 需要保证 controls artifact 继续在同步集合中。
- `test/map-smoke.test.mjs` 已覆盖当前 Map-only gameplay / `base + map` 静态入口与资源约束；真实 controls closed loop 由 Game Control Ports qualification 覆盖。
- `examples/PokeMan/package.json` 已包含 `@loomrealm-game/common-controls` dependency。根 `package.json` 使用 `"examples/*"` workspace glob。

### 必须参考的已实现文件

| 参考文件 | 用途 |
| --- | --- |
| `examples/essentials-v21.1/subsystems/map.mjs` | 最小 Map-only Subsystem |
| `examples/essentials-v21.1/game.json`、`launch.hostra.json` | 逻辑/物理启动配置 |
| `examples/essentials-v21.1/test/example.test.mjs` 和 `test/prepare.mjs` | Game Entry / Presentation 验证 |
| `examples/essentials-v21.1-local/subsystems/map.mjs` | `onMapEntering` / NPC placement 使用方式 |
| `examples/essentials-v21.1-local/scripts/sync-map-presentation.mjs` | Map JS/CSS 资源同步、SHA-256 校验、备份恢复和 `--check` 模式 |
| `examples/essentials-v21.1-local/play.bat` | Desktop 启动前 Presentation 同步 |
| `game-libs/map/src/runtime.ts`、`game-libs/map/src/semantics.ts` | Map 运行时 API、转场/位置/朝向语义 |
| `test/terrain-behavior-live-product.test.mjs`、`test/m15-hostra-product.test.mjs` | 现有产品集成测试模式 |

优先使用框架已经开放的 `@loomrealm/subsystem`、`@loomrealm-game/map` 作者 API；不要绕过公开边界调用 `dist/internal` 或复制 Map Library 逻辑。

## 2. 实施步骤及完成门槛

### P0 — 建立基线（只读诊断）

1. 运行 `git status --short`、`node --version`、`npm --version`，记录现有改动、Node 版本及环境。`play.bat` 声明要求 Node 20+。
2. 阅读参考文件、根 `package.json` 的 `build:m15` 任务，以及 Map Library 运行时 API。
3. 在修改前尽可能运行：
   ```powershell
   node --test examples/PokeMan/test/map-smoke.test.mjs
   npm run build:m15
   ```
4. 确认 Hostra 查找方式：`HOSTRA_SOURCE_DIR`、仓库 `.qualification/hostra`、或仓库相邻的 `../hostra`。区分框架构建失败与外部 Hostra 环境缺失。
5. 查看 FSDB 中必要地图、转场、NPC 与 Presentation 文件是否存在，不修改大型导入资源。

**门槛：** 提交简短基线诊断，列明已有失败与外部依赖；不得先动业务逻辑来掩盖启动环境问题。

### P1 — Historical workspace step / current controls dependency amendment

1. `examples/PokeMan/package.json` 已存在；当前 controls landing 只需保证依赖集合包含：
   ```json
   {
     "name": "@loomrealm-example/pokeman",
     "version": "0.1.0-alpha.0",
     "private": true,
     "type": "module",
     "dependencies": {
       "@loomrealm-game/map": "0.1.0-alpha.0",
       "@loomrealm/subsystem": "0.1.0-alpha.0"
     },
     "devDependencies": {
       "@loomrealm/game-package": "0.1.0-alpha.0"
     },
     "scripts": {
       "test": "node --test test/*.test.mjs"
     }
   }
   ```
2. 用 npm 更新根 `package-lock.json` 中 workspace 与链接信息；不要手工编辑锁文件或在 root workspaces 中重复添加显式路径。
3. 重新执行 `npm ci`（有条件时），以及 `npm test -w @loomrealm-example/pokeman`。

**门槛：** 依赖可安装、workspace 可识别、现有 Smoke Test 可通过；锁文件与包声明一致。

### P2 — Map-only gameplay + Base controls infrastructure

1. 当前 `game.json` / `launch.hostra.json` 已按 [72-controls-composition.md](./72-controls-composition.md) 使用 `base + map`；`subsystems/base.mjs` 只创建 `game-controls-input` RenderDomain 并 `frame.call("map", frame.params)`，不承载 Map business mapping。
2. 在 `subsystems/map.mjs` 中接入 `@loomrealm-game/common-controls/subsystem` 的 Consumer/Directional Tracker，并映射到 `RPGMapControls`；同时核实 `RPGMapBuilder`、`onMapEntering`、`setNPC` 与 `run` 的契约。
3. 保留现有 `MAP_ONLY_NPC_PLACEMENTS`。NPC 不从 Event、StoryIndex、Encounter、Shared State 或 Relationship 动态计算；这份 placement 明确仅供 Map-only 验证。
4. 验证主要地图绑定：`3` 玩家家、`2` 初始城镇、`4` 博士研究所、`5` 道路、`7` 第一个城镇、`8` 宿敌家；这些数字只用于地图链路，不接入剧情。
5. 检查 `MapTransfer/3.json` 中初始坐标 `(3,8)` 恰与一个 contact transfer 位置重合：重点验证首次进入不会异常立刻弹出、反复转场或卡死。必须依据实际 Map Library 的触发语义判断；不要未经复现就随意更改起点。
6. 若 NPC placement 恰与墙、门、玩家出生点或转场格冲突，优先查证坐标/碰撞规则，附最小复现和测试再调整。

**门槛：** 精确注册 `base + map`；只有 `map` 是 gameplay Subsystem。Base 只拥有 unified controls producer；静态 NPC 渲染与地图转场不依赖其他 PokeMan 业务 Subsystem。

### P3 — 构建并同步 Presentation 资源（主要工程缺口）

1. 继续使用当前 `examples/PokeMan/scripts/sync-map-presentation.mjs`；controls landing 只需确保 `controls/device-input.browser.js` 与 Map/page artifacts 一起被构建、校验和同步，不重新发明第二套同步脚本。
2. 保留既有的关键安全性质：定位唯一的直接 `[FSDB]*` 根目录、拒绝意外符号链接/非普通文件、比较 source/dist/FSDB 资源哈希、原子替换、失败恢复与中断遗留备份处理、重复执行幂等、支持 `--check`。
3. 对应关系必须是：
   ```text
   game-libs/map/dist/browser/map.browser.js
     → [FSDB]PokeMan/[resource]Presentation/map/map.browser.js.js
   game-libs/map/dist/browser/map.css
     → [FSDB]PokeMan/[resource]Presentation/map/map.css.css
   examples/PokeMan/presentation.css
     → [FSDB]PokeMan/[resource]Presentation/page.css.css
   ```
4. 将 `presentation.css` 从占位文件改为全窗口地图样式，以当前 FSDB `page.css.css` 中已存在的规则为基线，确保页面不固定为 `640×480`。同步后的 FSDB 文件内容应来自这一明确 source。
5. 保持 `presentation.json` 的 controls/map/page Presentation 引用及其逻辑 resource key；`controls/device-input.browser.js` 必须继续可用以注册 `game-controls-input`。不要把物理双扩展名写进逻辑配置。
6. 同步脚本在执行/检查前须确保 Map build 产物与源码一致（现有 Essentials 本地脚本会运行 `npm run build:m15` 后对 source/dist 做哈希校验）；不要默默采用过期 dist。
7. 在 `play.bat` 中于启动 Hostra **之前**执行 Presentation 同步，出现错误立即中止。整理既有「dist 不存在才构建」的分支，避免同步跳过必要构建，也避免同一次启动无意义地重复构建。只要行为正确，可以让同步脚本统一负责构建。
8. 验证首次运行、重复运行、`--check`、缺文件、资源损坏、构建失败时的正确退出码和失败信息；同步失败不得留下半更新的三件 Presentation 资源。

**门槛：** 修改 Map browser JS/CSS 后能在下一次启动前同步为最新正确内容；`--check` 能检测 FSDB 漂移；启动不会在旧 Presentation 状态下悄悄继续。

### P4 — 自动化测试

扩充 `test/map-smoke.test.mjs`；新增测试文件请按职责拆分，避免只有大量硬编码路径字符串断言。

最低自动化覆盖：

1. 使用 `@loomrealm/game-package` 的实际 parser 校验 Game Entry（不仅比较原始 JSON），并断言精确 **`base + map`**、initial subsystem 为 `base`、原 Map initial params 原样传入 Base，以及 Launch Manifest 两个 module 绑定正确。
2. 检查唯一 FSDB 根、所需 `Map/MapTransfer/Tileset` 与 player/NPC sprite 引用存在。
3. 对关键地图 `2,3,4,5,7,8`，校验地图尺寸为合法正整数、NPC placement 坐标在地图边界内、`npcId` 指向实际 `struct.NPC`、资源 key 能解析；朝向满足 Map Library 契约。
4. 对关键的 `MapTransfer` 数据校验 source/target map identity 与目标坐标边界。区分 `contacts`、`steps`、`edges` 的语义，不把任意双向拓扑当作固定真理，也不因源数据合法的 `targetDirection: null` 误报失败。
5. 校验 PokeMan Presentation CSS 实际填满 viewport，JS/CSS 与 `presentation.json` 引用相符。
6. 给 Presentation 同步增加正常/幂等/`--check` 检测失败/替换失败后恢复的测试；优先复用现有脚本公开的可注入 fileOps 接口。
7. 尽可能利用现有 Map 或 Desktop 集成测试 harness，覆盖地图加载、输入与转场。**不能把纯 JSON 检查命名或宣称为 Runtime E2E 测试**。
8. 如需改变 `game-libs/map` 的实现，须在该库的既有测试中先构造失败用例；未经明确复现不要修改其公共 API。

建议验证命令（从仓库根目录执行）：

```powershell
npm ci
npm run build:m15
npm test -w @loomrealm-example/pokeman
node examples/PokeMan/scripts/sync-map-presentation.mjs
node examples/PokeMan/scripts/sync-map-presentation.mjs --check
```

可在满足运行环境时进一步执行已有 Map、Desktop、Hostra 回归测试；如果某个测试依赖外部可执行文件或平台，报告其环境前提与实际执行结果。

**门槛：** 自动化测试能检测缺失资源、非法坐标、错误配置和 Presentation 漂移，失败时给出可定位的信息。

### P5 — Windows Desktop 手工验收

在已安装 Node/npm 且具备可用 Hostra/Electron 的 Windows 环境中：

```powershell
.\examples\PokeMan\play.bat
```

记录如下项目的 Pass/Fail/Blocked 和复现信息：

- [ ] Hostra 成功打开游戏窗口，首屏不是空白或纯黑错误界面。
- [ ] 起始位置为 Map 3 玩家家，玩家精灵正确显示。
- [ ] 方向键可移动，墙壁和 NPC 阻挡行为符合 Map Library。
- [ ] 可从 Map 3 转场到 Map 2，返回时不会卡在 contact 循环。
- [ ] 可从 Map 2 进入 Map 4；研究所中博士与宿敌 NPC 可见。
- [ ] 可从 Map 2 进入 Map 8，显示宿敌的另一种静态场景形象。
- [ ] 可沿 Map 2 → Map 5 → Map 7 移动，看到道路和城镇 NPC。
- [ ] 多次转场后仍可输入，无持续空白画面、未处理异常或错误终止。
- [ ] 重新运行后仍从约定初始地图进入；未无意引入 Session 存档或剧情系统。
- [ ] 修改/重建 Map Presentation 后，下次启动使用同步的新产物。

如果无法到达某一地图，先区分地图数据本身、碰撞/转场语义与 Runtime 缺陷；报告可复现路径和日志，不修改内容以假装测试通过。

**门槛：** 上述运行行为实际验证通过；若没有 Windows/Hostra 环境，则本阶段状态为 **Blocked / 未验证**，不得宣称任务全部完成。

## 3. 推荐的目标文件变更清单

```text
examples/PokeMan/
├── package.json                      # 增加 common-controls dependency
├── game.json                         # 修改：initial=base，注册 base + map
├── launch.hostra.json                # 修改：绑定 base.mjs + map.mjs
├── play.bat                          # 保持/验证启动前同步及校验
├── presentation.css                  # 保持当前全窗口样式
├── presentation.json                 # 保持 controls + map Presentation 引用
├── scripts/
│   └── sync-map-presentation.mjs     # 继续同步 controls/map/page artifacts
├── subsystems/
│   ├── base.mjs                      # 新增：product-private controls producer
│   └── map.mjs                       # 增加 Consumer/Tracker -> RPGMapControls composition
├── test/
│   ├── map-smoke.test.mjs            # 扩充
│   └── *.test.mjs                    # 视需要新增同步/运行时测试
└── [FSDB]PokeMan/
    └── [resource]Presentation/       # 同步产物，改动须说明来源

package-lock.json                     # 随 workspace 注册更新
```

不得为了本任务更新 `doc/60–68` 的人物、剧情、战斗 Authority 设计；`DESIGN.md` 保持不变。`subsystems/_empty.mjs` 与其他占位文件可保留，但不可添加到运行拓扑。

## 4. 验收范围和风险优先级

| 优先级 | 风险 | 必须处理方式 |
| --- | --- | --- |
| P0 | Workspace 新增但 lock 未同步，导致 `npm ci` 不可用 | 更新锁文件并复跑干净安装 |
| P0 | Map Presentation 与构建产物不一致，游戏黑屏或运行异常 | 构建+哈希同步+`--check`+失败即停 |
| P0 | Hostra 环境不可用，却被误认为游戏缺陷 | 先记录环境前提，区分验证层次 |
| P1 | 起点 `(3,8)` 触及 Map 3 contact transfer | 实际检查触发语义与重复转场 |
| P1 | NPC placement 与地图几何冲突 | 测试坐标/碰撞并仅做必要微调 |
| P1 | 地图路径存在但坐标或转场数据错误 | 静态引用验证加真实地图移动 |
| P2 | 早期 Event/StoryIndex 数据与现行序章地图不一致 | **本任务不处理**；尚未被 Map-only Runtime 消费 |
| P2 | 大量现成 Content 中存在暂未消费的业务 schema | **本任务不处理**；不强推完整业务模型 |

## 5. Agent 最终交付报告模板

完成后在回复中按下列结构汇报：

```text
PokeMan Map-only 实施报告

1. 改动文件
   - <路径>：<变更与必要性>
2. 自动化验证
   - <命令> → PASS / FAIL / BLOCKED
   - FAIL 或 BLOCKED：具体日志、根因及后续动作
3. Windows/Hostra 手工验证
   - 地图显示、玩家移动、NPC、3→2→4、2→5→7、2→8 等逐项结果
4. 范围检查
   - game.json/launch.hostra.json 是否精确为 base + map，且只有 map 是 gameplay subsystem
   - 是否未实现或接入其他 Subsystem
   - 是否改动 framework API / 其他 example / FSDB 原始资源
5. 剩余问题
   - 与本次 Map-only 目标直接相关的 blocker
   - 超出目标的后续工作（单独列出，不擅自实施）
```

## 6. 停止条件

只有在 **P1–P4 的适用自动化检查通过、P5 的目标运行行为完成实机验证，并确认 topology 精确为 `base + map`、只有 `map` 是 gameplay subsystem** 时，才可报告「Map-only 已跑通」。

环境缺失时，应交付已完成改动与完整复现命令，结论写「代码/自动化已完成，Windows/Hostra 实机待验收」，不得将环境缺失误报为成功或自行扩大任务范围。

---

关联说明：

- [PokeMan README](../README.md)
- [Essentials Map-only 示例](../../essentials-v21.1/subsystems/map.mjs)
- [Essentials Local Map Subsystem](../../essentials-v21.1-local/subsystems/map.mjs)
- [Essentials Local Presentation Sync](../../essentials-v21.1-local/scripts/sync-map-presentation.mjs)
