# Terrain Behavior：Essentials v21.1 原版证据摘要

> 证据等级：`SOURCE-PROVEN` = 固定原版源码；`FSDB-OBSERVED` = 带 SHA-256 的本地文件观察；`STATIC-INFERRED` = 静态规则/模拟推断；`PRODUCT-OBSERVED` = LoomRealm 产品运行；`DYNAMIC-OBSERVED` = 原版 RGSS 实测。本文件不宣称原版逐帧保真、正式合同冻结或素材再分发许可。当前产品实施状态以 [交付合同](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md) 和实际代码/CI 为准。
>
> **发布边界：** 此版本以结构化事实、指纹、算法和复现入口代替旧附录 A 的完整 Map007 原始事件命令转储。完整原始地图、事件文本和派生 JSON 只在有合法来源的本地、gitignored 工作区读取，不作为仓库或 CI fixture 发布。源项目仓库的许可证不能自动证明其全部第三方游戏素材可再分发；相关权利未核清。

> **2026-10-09 current checkpoint：** Terrain subject 为 `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9`。除合法本地 FSDB/static/product gates 外，已通过仓库 downloader 路径取得 local-only official v21.1 runtime，用 observation-only hook 和外部真实按键采集 Map21 四对 Bridge、held input、Map47 正向/逆向 jump 的 sanitized `DYNAMIC-OBSERVED`。观察发现产品 400ms 与原版 500ms 不一致并已修复。精确 provenance、帧事实、raw digest 和 FG/C/DEC disposition 见[最终资格记录](../../doc/30-implementation/final-performance-terrain-qualification.md)。

## 1. 取证对象及固定版本

固定源码：Pokémon Essentials v21.1，commit `ea7b5d56d2436591160983c4e641a2ceee2d875a`，来源 https://github.com/Maruno17/pokemon-essentials/tree/v21.1 。早期静态取证环境为 Windows 10、Node v22.12.0、本地 Essentials FSDB；2026-10-09 的原版动态环境、Game/data identity 与 observation-only capture 另见最终资格记录。

| 对象 | SHA-256 | 观察范围 |
|---|---|---|
| Map007.rxdata | `c34ddaaec265241fd35149d6d3758f8f08a5503b057c891e396c39b08518c6b7` | Map7 Cedolan City；60×43；11 events、19 pages、521 commands |
| Map021.rxdata | `cd226a09dbf5cbfd2207edd44fb7dd419327ae901a1f1c0f6ad35601df85c575` | Map21 Route 2；39×77；17 events、22 pages、132 commands |
| Map047.rxdata | `5f4ee232e4f4b8b44950f826b13cd601ffecb87e455c1dda92c5908152df043e` | Map47 Route 7；70×43；12 events、17 pages、250 commands |
| MapInfos.rxdata | `8ed090fb27db75e046755896e0d4dbb53fa6de6279d21865315dd60f868d5007` | 原本 69 张地图 corpus 清单 |
| Tilesets.rxdata | `433033b45527c0f07b781c862724df64d6a416c0ac2ed71907f645c0b2219fa6` | 原版 terrain_tags、passages、priorities |
| CommonEvents.rxdata | `196c5ee7f51e656b79514ce203f4077f4b12ff55192ebdf4dd0aefdd7734de12` | 事件调用范围 |

源 FSDB 示例相对路径：`examples/essentials-v21.1-local/[FSDB]Essentials v21.1`。该路径在 gitignore 下，不提交素材。

## 2. 可复现取证入口

从合法本地 FSDB 运行（生成结果留在 gitignored `.local/`）：

```text
node tools/fixtures/essentials-v21.1/map7-bridge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --corpus-scan --output ".local/map7-bridge-evidence.json"
node tools/fixtures/essentials-v21.1/map21-bridge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --output ".local/map21-bridge-evidence.json"
node tools/fixtures/essentials-v21.1/map47-ledge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --output ".local/map47-ledge-evidence.json"
node tools/fixtures/essentials-v21.1/map-evidence-independent-check.mjs 7 21 47
node --test tools/fixtures/essentials-v21.1/map-event-evidence.test.mjs tools/fixtures/essentials-v21.1/map-evidence-acceptance.test.mjs tools/fixtures/essentials-v21.1/map-e2e-21.test.mjs tools/fixtures/essentials-v21.1/map47-ledge-acceptance.test.mjs
```

取证器仅对白名单地图 7/21/47 执行深度观察；`--corpus-scan` 另外读取 MapInfos、Tilesets、CommonEvents。缺表、异常 Table、无效脚本参数或不完整调用图必须报告 `INCOMPLETE`/失败，不能把零命中当完成。355/655 连续脚本、209/509 路线、111 type 12、117 嵌套调用是受检入口；不执行原始 Ruby，不证明任意被调用方法体的行为。独立检查直接重读解码数据，独立性不覆盖原版帧或全部触发分支。

## 3. Map7 地图基本事实

Map7 是桥行为**负例**：有完整地图数据的限定扫描中 11 events / 19 pages / 521 commands；355/655 拼接脚本 32；111 type12 共 8；117 调用 0；实际 Bridge tag15 放置格 0，确认 Bridge 事件 0。`COMPLETE`、`provenNegativeBridge=true` 仅针对声明的 corpus、入口与素材指纹，不保证所有 autorun、动态 eval 或被调用方法体无副作用。原版地形标签表含 Bridge 定义，不等于本图实际铺设桥。

## 4. Map7 桥相关扫描

11 个事件全部 19 页和 521 条命令均进入限定扫描；命中候选 0。纳入依据包括事件名、邻接 tag15、桥脚本、117 可达调用和邻桥 Transfer；缺数据则不报告证明性零值。历史取证记录 Map7 无桥结论与新取证结果一致。

## 5. Map7 事件结构事实

Map7 有门类事件 IDs 1、2、3、4、7、8、9、12，坐标依次 `(11,13)`、`(15,13)`、`(11,29)`、`(22,28)`、`(47,10)`、`(34,20)`、`(35,28)`、`(39,19)`；分别可转向地图 14、14、10、12、9、13、11、13。另有招牌 IDs 5、6、10；ID 10 为 `size(2,1)`。这些记录只支持分类/排除，与 Bridge 正例无关。完整原始命令及文本不随本仓库分发；需要独立审查时按 §2 从合法本地素材再生成。

## 6. 页面选择与触发

固定 v21.1 源码中，事件从后向前选择满足条件的页面；`Game_Event#start` 设置 starting 标记，**不**同步执行脚本。成功到达检查 here；失败阻挡触碰检查 front。Map7 门页有开关/autorun 变体，不能将所有页面当作同一时刻有效。

## 7. 原版时序事实边界

`can_move` 对当前输入先评估通行；成功写入目标位置并完成一步，再进行 arrival/here 事件启动；之后解释器执行脚本。official v21.1 动态 trace 在 Map21 四对事件上确认：坐标准入早于到达后的 event start，解释器 execute 与 bridge 0↔2 transition 位于下一观察帧；同一次输入不因桥状态变化重算已准入移动。产品只承诺该可观察顺序，不承诺与 RGSS 使用相同绝对帧号。

## 8. 碰撞与有效地形

`terrain_tags`、`passages`、`priorities` 是按 tile ID 索引的不同原始表。有效标签查询不等于通行判定；双向移动需分别检查源格方向和目标格逆向。`None(0)`、`Neutral(13)`、`Bridge(15)`、`NoEffect(17)` 语义不得混同。此段为源码分析与项目合同的事实背景，最终产品规则依实际实现及回归测试。

## 9. Bridge 与转图状态

原版桥脚本 `pbBridgeOn` / `pbBridgeOff` 对桥层的作用与转图清桥由固定源码推导；是否同帧/下一帧生效仍待原版实测。LoomRealm 的产品状态和数值由 Runtime 自行持有，见 [交付合同](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)。

## 10. 取证边界与未解决项目

真实桥正例是 Map21，不是 Map7 或 Map27。Map21 事件时序、held input 和 Map47 jump 已取得原版结构化动态日志；真实 Map47 corpus 不含 source/destination blocked、边界或 skipped-cell event 样本，这些仍只由明确标注的合成测试覆盖。素材再分发和正式审查另外记录为 FG-05/06，动态证据不能替代 policy approval 或授权签署。

## 11. 事实到验收案例

| 事实 | 验收主题 |
|---|---|
| Map7 无 Bridge | `BR-EVENT-MAP7-NEG-*` |
| Map21 8 个确认 On/Off | `BR-EVENT-MAP21-*` |
| start 不等于 execute | `BR-EVENT-ORDER-*` |
| 占用格与 over_trigger 分支必须一致 | `BR-EVENT-SIZE-*` |
| Map47 两格跳和逆向阻挡 | `LD47-*` |
| 带 mapId 的源/目标传送 | `EV-TRANSFER-*` |

## 12. 覆盖结论

Map7 桥负例、Map21 桥正例、Map47 Ledge 均有带 digest 的静态证据；Map21 四对 Bridge 与 Map47 正向/逆向 Ledge 另有带 digest 的原版 RGSS 动态观察。未采样的 Map47 synthetic-only 边界不得提升为 `DYNAMIC-OBSERVED`。

## 13. Map21 桥基本事实

Map21/Route 2 是唯一经此次 69 图 corpus 限定扫描发现的 Bridge 地图：93 个实际 tag15 桥格；确认脚本事件 IDs `4,7,10,20,22,23,25,28`。邻接事件 IDs `1,2` 为进化相关而非桥脚本。Map27 不能作为桥正例。地图源文件指纹见 §1。

## 14. Map21 正例完整性与传送审计

### 14.1 来源

固定 Map021 digest 与尺寸、事件总数见 §1。原版源码版本固定，样本是 `FSDB-OBSERVED` 加 `STATIC-INFERRED` 而非动态日志。

### 14.2 桥图块

实际 Bridge tag15 格 93，已核对 placed=unique=93，图块 IDs 1616、1617、1618、1627、1635、1643。不能把未放置的 Tileset tag15 定义当实际桥。

### 14.3 事件

八个确认的脚本是窄范围 Bridge On/Off；事件占用来自 `size()`，邻接进化事件不能误投影为桥。

### 14.4 时序

成功到达、start、解释器 execute 各为单独检查点；原版四对 trace 确认 move admission 早于 start，execute/state transition 随后发生。不允许同一次输入因事件状态变化重新通行判定。

### 14.5 Bridge 层

桥下=0、桥上=2 是本轮支持的两种状态；源/目标方向与实际地形表共同决定通行。不能把单次静态 `D0` 的假设当跨图永久结论。

### 14.6 连接

涉及 Map21 的 PBS 连接三条，已物化边七条。Map7 北缘可从 `(40,0)` 转入 Map21 `(19,76)`；每个跨图边需用源/目标 mapId 分别获取尺寸与 Tileset。

### 14.7 审计结果

`21,E,77,47,W,0` 对应几何越界、物化 0 边。67/93 桥格在 D0 假设下不可通过只是潜在误过滤风险，**尚无已证实连接误删**。

### 14.8 未验证事项

被调用 Ruby 方法体、自动公共事件、原版 held input/帧序不在静态完整性声明中。

## 附录 L. 许可证据和仓库保留边界

固定上游仓库公开 LICENSE 标为 CC BY-NC-SA 4.0，但该许可证对第三方 Pokémon 内容、编译地图数据和其它素材的适用范围不能仅由仓库存在许可证推定。未获得完整 Map007/021/047 命令文本和 rxdata 的独立再分发证据。故本仓库仅保留原创测试夹具、短标识符、结构化事实、指纹和再生成命令；受限源文件和完整转储留在合法本地环境。历史版本曾附有完整 Map7 事件命令，当前发布版本删除该附录内容，不应复制到 main 的提交树；从当前合并基线使用 squash，避免将旧取证提交历史连同原始附录引入 main。历史公开引用仍可能存在，不能称其已从所有 Git 历史删除。

## 附录 A. Map7 事件索引（原始命令已删去）

原先的全部原始事件命令、嵌套移动路线、对话文本不作为本仓库内可再分发证据。Map7 原始事件数量、类型、坐标、统计和 hash 见 §1、§3～5；完整逐条审查在合法本地运行 §2 的 CLI，输出留在 `.local/`。该调整不改变 Map7 无 Bridge 的限定扫描结论。

## 15. 本轮 REVIEW-01～04 静态复核

### 15.1 复现与独立检查

在合法本地 FSDB 上运行 §2 命令；`map21-e2e-independent-check.mjs` 直接核对物化边成员、邻接、Bridge tag15 与部分 start/execute 检查点。旧分段路线工具不能代替统一 E2E。完整追踪输出保存在 gitignored `.local/`。

### 15.2 Map21 八事件矩阵

| ID | 动作 | 原点 | 占用格 | bridgeLevel 0/2 over_trigger | 预测分支 |
|---:|---|---|---|---|---|
| 4 | On | (20,49) | x20, y46–49 | true/true | here |
| 28 | Off | (19,49) | x19, y46–49 | true/true | here |
| 7 | Off | (14,31) | x14–16, y31 | true/true | here |
| 10 | On | (14,32) | x14–16, y32 | true/true | here |
| 20 | Off | (22,58) | x22–23, y58 | true/true | here |
| 22 | On | (22,57) | x22–23, y57 | true/true | here |
| 23 | Off | (14,69) | x14–15, y69 | true/true | here |
| 25 | On | (14,68) | x14–15, y68 | true/true | here |

这些值来自逐占用格 `map.passable?(d=0,player)` 静态重算，不是原版运行日志；blocked/front touch 不得启动 `over_trigger=true` 的事件。相关事件同一行的事件优先级与 `start≠execute` 均需在产品 Runtime 中验收。

### 15.3 路线与完整闭环

分段 `map21-bridge-routes.mjs` 只用于生成输入，不是 E2E 判定。统一 `map-world-replay.mjs#replayWorld` 从 Map7 `(40,0)` 的实际 MapTransfer edge 进入 Map21 `(19,76)`，单一状态依次跨陆地/Off/On/真实 tag15 桥面/Off/反向 transfer。四组 live 静态 trace 均 `continuous=true`、`walkedTag15=true`、返回 Map7 且 bridgeLevel=0，独立核对通过。中北组从南落点需经过其它桥事件，On start/execute 统计 8/8，不隐瞒路径副作用。等级 `STATIC-INFERRED`。

### 15.4 Map7 负例与 Map47 Ledge

Map7 见 §3～4。Map47：Ledge unique=placed=30，tile IDs 1194/1198/1212，bbox `(14–45,10–18)`。`(16,9)` 向下越过 `(16,10)`，落 `(16,11)`，逆向阻挡。Map47 没有真实中间格事件、边界 Ledge 样本；这类案例用标注的原创合成测试证明一般规则。未知 404 已识别为 `show-choices-branch-end`，Map47 EV007/013 的 404 不在 Ledge 格上；不把它当空指令，也不当物理跳跃事件。跨图 jump 不支持。

### 15.5 MapTransfer 核对

Map21 PBS 三条分别对应 3、4、0 条物化边。南缘 `21,S,0,7,N,21` 的保留落点 x19–22,y76；东缘 `21,E,77,47,W,0` 是越界零边；无已证实的 D0 误删。正确获取源图/目标图的 mapId、尺寸和 Tileset。

### 15.6 CE 与严格校验

本 corpus 的 CommonEvents 无 Bridge On/Off；Map7/21 的 117 调用均为零。合成测试覆盖 A→B→C、循环与缺目标；不排除独立 autorun 或方法体动态调用。坏 Table、负 tile、异常 355/655、111/117 参数按失败或 INCOMPLETE，而非空输入成功。

### 15.7 证明边界

`FSDB-OBSERVED` + `STATIC-INFERRED` 仍不等于原版 `DYNAMIC-OBSERVED`；本轮动态等级只适用于最终资格记录列出的 Map21/47 场景。真实 corpus 没有覆盖的 blocked/boundary/skipped-cell-event 继续保持 synthetic-only。

## 16. 完整静态验证与资格记录

### 16.1 端到端静态结果

Map7→Map21 四组 Off/On→真实桥格→下桥→反向转图均统一 replay。转图 `bridgeLevel` 清零；旧 `traceStep.transfer=null` 仍表示分段工具不足，不代表统一工具未完成。

### 16.2 Map47 校验

30 个合法静态 Ledge 两格样本、30 个逆向失败。Map47 `(16,9)→(16,11)` 是真实地形静态样本；中间事件、落点阻挡和边界反例是 `sampleKind=synthetic`，不冒充原版 Map47 观察。

### 16.3 RGSS 动态环境与边界

历史环境确实没有 runtime；本轮依据仓库 `reimport.bat` / downloader 路径在 gitignored `.local/` 准备了 official v21.1 runtime。observation-only Ruby hook 不覆盖 Input/调度/速度/状态，外部驱动发送真实 Windows 方向键；Game/data/plugin/driver 和 sanitized trace digests 见最终资格记录。原始二进制、数据、素材、截图及 raw logs 均未提交。FG-01/03/04 因此具备 technical evidence，但没有授权 reviewer 前不成为 formal PASS。

### 16.4 CI 与素材许可

旧 CI [35499223917](https://github.com/lithdoo/loom-realm/actions/runs/35499223917) 在 `faf4c649`：99 pass、1 fail、6 skip；修复后的 [35499617524](https://github.com/lithdoo/loom-realm/actions/runs/35499617524) 在 `5b550b43`：100 pass、0 fail、6 live skip。缺原始 FSDB 的 CI 跳过不能写 PASS。当前功能分支的新 CI 结果须以当前 head 对应的 Actions 为准，不能使用此历史证据冒充。

### 16.5 历史本地命令记录

历史取证 Agent 报告本地有 FSDB：组合静态 freeze 测试 54 pass/0 fail/0 skip；修改取证器后两套主要专项 37 pass；`npm run test:fixtures` 106 pass；map 包测试 78 pass；`npm run docs:check-links` 报 693 相对链接有效。这些是历史记录，不是本次合并 SHA 的独立重跑。

**最终界限：** 本文件提供可重生成的结构/静态推论，并由最终资格记录补充窄范围原版动态事实；产品交付事实由实际代码和测试验证。FG-05 policy 与 FG-06 authorized sign-off 仍须独立审查，不能从动态采样或产品合并自动推导正式 `CONTRACT_V1`。
