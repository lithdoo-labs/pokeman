# 地图数据格式 / Autotile 动画实现设计

> 状态：Product Closed（2026-09-15；`--force` 重导入后 play.bat 真人走通 Map066↔Map067、Map002 Flowers1 多帧、Map069 Waterfall/crest/bottom 与水面多帧）
> 目录：`examples/essentials-v21.1-local`  
> 文件名沿用 `MAP_DATA_FORMAT_REQUIREMENTS.md`，本文语义已从“需求清单”升级为“基于当前实现的实现设计”。
> 证据基线：本地 Essentials v21.1 FSDB（`[FSDB]Essentials v21.1`，由官方 ZIP `--force` 导入）+ `Maruno17/pokemon-essentials@ea7b5d56` + 当前 `docs/map-autotile-adaptation` 分支实现。  
> 前置：layering / walking / map-transfer 已落地；`MAP_AUTOTILE_DESIGN_DRAFT.md` first-slice 已支持 `tileId 48..383`、48 variant、block / single-cell 两类 bitmap layout。本刀把 Browser 从固定 frame 0 升级为 presentation-only 多帧动画。

本文设计目标只有两项：

1. 把已经能静态显示的 RMXP autotile 升级为 **Browser presentation-only 多帧动画**；
2. 对当前 Essentials v21.1 素材做一轮 **全地图数据格式闭环审计**，证明本存档实际出现的 tile/autotile 形态不会再因为格式不认识而关窗或整图失败。

本设计不重开 Runtime authority、MapTransfer、walking、layering，不新增通用 TileEngine，也不把动画帧写入 save/runtime state。

---

## 0. 当前实现与缺口

### 0.1 已经具备的数据链

当前 first-slice 已经形成：

```text
struct.Tileset.autotile_names[7]
  ↓
Runtime tileId partition
  ↓
TileBlit
  regular   → sourceIndex
  autotile  → slot + 48-variant corners
  ↓
MapViewRenderData
  tileset ResourceRef
  autotiles ResourceRef[7]
  visible tiles
  cameraMotion
  ↓
Browser
  decode current request resources
  classify autotile bitmap
  block | cell | invalid
  ↓
Canvas paint
```

其中：

- Runtime 已经知道某格属于哪个 autotile slot、哪个 48 variant；
- Browser 已经知道该 slot 对应的实际 PNG；
- Browser 已经能通过 bitmap 几何区分：
  - block：`height === 128 && width >= 96 && width % 96 === 0`；
  - single-cell：`height === 32 && width >= 32 && width % 32 === 0`；
- Browser 当前 block path 使用 Runtime 下发的四个 `16×16` corner；
- Browser 当前 single-cell path 直接画整格 `32×32`；
- 当前两条路径都固定从 `x = 0` 取样，因此永远停在 frame 0。

### 0.2 当前 Browser 生命周期

当前 `LoomRealmMapView.receiveRenderData()`：

```text
cancel current RAF
→ latestData = data
→ paintEpoch++
→ receivedAt = performance.now()
→ _paintLatest(data, receivedAt, epoch)
```

当前 `_paintLatest()`：

```text
collect currently required tileset/autotile refs
→ Promise.all decode
→ latest + epoch + connected check
→ classify layouts
→ calculate camera interpolation
→ paint all tile layers
→ cameraMotion 未结束时 requestAnimationFrame
   → 再次进入 _paintLatest()
```

这套 stale protection 是正确基础，但有两个缺口：

1. camera 每个 rAF 都重新进入 async decode path（虽然 `_images` 有 Promise cache）；
2. camera 停止后无 rAF，因此 autotile 无独立 presentation clock。

本设计把它收敛为：

```text
async prepare once
→ synchronous prepared paint loop
```

walking camera 和 autotile animation 共用同一个 `_raf`。

---

## 1. 本地真实数据边界

### 1.1 tileId 分区（当前 69 张 Map）

| 分区 | 含义 | 本存档出现量 | 设计处理 |
|---|---|---:|---|
| `tileId === 0` | empty | 103470 | 已支持，保持跳过 |
| `tileId 1..47` | RMXP 保留 / 本包未用 | 0 | 继续 fail closed |
| `tileId 48..383` | 7 槽 × 48 variant autotile | 6160 | 已支持静态；本刀补动画 |
| `tileId >= 384` | regular tileset | 61739 | 已支持，不改 |

69 张 Map 实际引用 23 个 Tileset 中的 13 个：`1, 2, 3, 4, 5, 6, 7, 10, 12, 14, 15, 20, 22`。

含 autotile 格子的地图：

```text
2, 5, 7, 21, 23, 28, 31, 35, 39, 40,
41, 44, 45, 52, 68, 69, 70, 71, 72, 73
```

### 1.2 Autotile bitmap 几何

当前本地 `Graphics/Autotiles` 共 40 张 PNG，只有两类：

```text
block:
  height === 128
  width >= 96
  width % 96 === 0
  frameWidth = 96

single-cell:
  height === 32
  width >= 32
  width % 32 === 0
  frameWidth = 32
```

精确 inventory：

```text
block                       28
single-cell                 12
unsupported geometry        0
文件名以 [x] 结尾            0
实际被地图引用的素材          12
被引用 Tileset 会加载的素材    15
实际引用名以 [x] 结尾          0
```

当前真实代表素材：

| 素材 | layout | 代表场景 |
|---|---|---|
| Sea / Sea deep / Sea without shore / Water rock / Fountain1 / Underwater dark | block | 海岸、喷泉、水下 |
| Flowers1 | single-cell `160×32` | Map002 |
| Waterfall / crest / bottom | single-cell `128×32` | Map069 |
| Seaweed dark / light | single-cell `128×32` | Map070 |

`Brown cave sand`、`Fountain2`、`Sand shore` 当前没有对应 tile，但存在于被地图引用的 Tileset 中。Runtime 会加载其全部非空 `autotile_names`，所以这 3 个资源仍属于阻断性资源闭包。其余 25 个全库 autotile 才只做 informational inventory；layout/animation 算法不得按 name 特判。

### 1.3 Regular Tileset bitmap

13 个被引用 Tileset 对应 12 个唯一 `Graphics/Tilesets` PNG（Tileset 1/2 共享 `Outside`）。当前全部宽 256px、高度为 32px 的正整数倍；各 Tileset 在 69 张 Map 中实际出现的最大 `tileId - 384` 均小于 `8 × height / 32`，不存在 source rectangle 越界。

---

## 2. 架构决定

### 2.1 动画 authority 只在 Browser presentation

Autotile 动画帧不是 gameplay authority，不进入：

```text
Main Runtime state
Map runtime state
Frame outcome
MapTransfer
Save data
RenderData schema
TileBlit schema
```

authority 仍然是：

```text
Runtime:
  “这个可见格是 slot 4 / variant 34”

Browser:
  “slot 4 当前 bitmap 有 5 帧；此刻画第 N 帧”
```

因此：

- walking 不因为环境动画产生额外 Runtime tick；
- transfer 不需要转移动画状态；
- save/load 不保存海面当前帧；
- 同一 RenderData 在 Browser 端可随 presentation time 重画，但 logical state 没变化。

### 2.2 本刀不改 schema

以下 shape 继续保持 first-slice Frozen 合同：

```text
struct.Map
struct.Tileset
TileBlit
VisibleTile
MapViewRenderData
MapSpriteRenderData
```

特别是 `TileBlit.autotile.corners` 继续描述 **一帧内部** 的 48-variant quarter 组合；动画只改变源图横向 frame offset。

### 2.3 只允许一个 presentation scheduler

继续复用 `ResourceElement._raf`。

禁止新增：

```text
setInterval autotile timer
第二个 requestAnimationFrame controller
Runtime scheduler tick
AnimationTimeline
AutotileAnimator service
Browser→Runtime animation feedback
```

walking camera 与 autotile animation 都由同一个 MapView `_raf` 驱动。

---

## 3. Essentials v21.1 动画语义

权威基线：`pokemon-essentials@ea7b5d56` 的 `TilemapRenderer::AutotileBitmaps`。

### 3.1 默认节奏

Essentials v21.1：

```text
AUTOTILE_FRAME_DURATION = 5   // 1/20 秒单位
```

因此默认：

```text
5 / 20 second = 250ms per frame
```

本实现冻结为：

```js
const AUTOTILE_TICK_MS = 50;
const DEFAULT_AUTOTILE_FRAME_TICKS = 5;
```

### 3.2 文件名 `[x]` 覆盖

Essentials v21.1 支持 autotile 文件名末尾：

```text
[x]
```

表示每帧持续：

```text
x / 20 second
= x * 50ms
```

Browser 从 `ResourceRef.key` 的 basename 解析，不改 importer/schema。

推荐 helper：

```js
function autotileFrameDurationMs(ref) {
  const name = ref.key.slice(ref.key.lastIndexOf("/") + 1);
  const match = /\[\s*(\d+)\s*\]\s*$/.exec(name);
  if (!match) return DEFAULT_AUTOTILE_FRAME_TICKS * AUTOTILE_TICK_MS;
  const ticks = Number(match[1]);
  if (!Number.isSafeInteger(ticks) || ticks <= 0) return null;
  return ticks * AUTOTILE_TICK_MS;
}
```

Frozen 规则：`[0]`、超出 safe integer 的数字以及其他能匹配方括号 duration 语法但不能产生正 safe integer tick 的 suffix，均视为 presentation-invalid。不得静默回退默认值、除零或制造 0ms busy loop。

当前真实 material 的 40 个文件名及 12 个实际引用名均没有 `[x]` suffix；因此真实素材 audit 只能证明 inventory，Browser regression 必须独立证明默认值、合法覆盖和非法值路径。

### 3.3 每个 slot 自己决定 frameCount

```text
block:
  frameWidth = 96
  frameCount = image.width / 96

cell:
  frameWidth = 32
  frameCount = image.width / 32
```

因为 layout classifier 已要求整除，所以 `frameCount` 必须是正整数。

不同 slot 不共享 frameCount。

### 3.4 所有 slot 共享 presentation epoch

在 `LoomRealmMapView` 构造时：

```js
this._animationStartedAt = performance.now();
```

不要用每次 `receiveRenderData()` 的 `receivedAt` 作为 autotile 起点。

原因：walking 每步都会带来新 RenderData；若使用 `receivedAt`：

```text
走一步
→ receivedAt 重置
→ 所有 autotile 回到 frame 0
```

会产生明显卡顿/跳帧。

共享 presentation epoch 对齐 Essentials 的 renderer-lifetime `timer_start` 思路，也允许不同 duration / frameCount 的 slot 各自按公式推进。

### 3.5 frame 公式

```js
function autotileFrameIndex(now, startedAt, frameCount, durationMs) {
  if (frameCount <= 1) return 0;
  return Math.floor((now - startedAt) / durationMs) % frameCount;
}
```

动画只向前循环：

```text
0 → 1 → ... → N-1 → 0
```

不做 ping-pong、不做随机 phase、不按地图进入时间重置。

---

## 4. Browser 改造

生产实现唯一允许修改：

```text
game-libs/map/browser/map.browser.js
```

### 4.1 局部计算

只有 duration 解析和 frame index 具有独立规则，保留为局部 helper：

```text
autotileFrameDurationMs(ref)
autotileFrameIndex(now, startedAt, frameCount, durationMs)
```

`frameWidth` 和 `frameCount` 在 prepare 时根据 layout 直接计算，不为单行表达式增加 helper；不创建新 class/service。

### 4.2 `LoomRealmMapView` 新增长生命周期字段

constructor 增加：

```js
this._animationStartedAt = performance.now();
this._lastPaintToken = undefined;
```

继续复用继承来的：

```text
_latestData
_raf
_images
```

继续复用现有：

```text
_paintEpoch
```

不新增 animationId / animationEpoch / frame timer object。

### 4.3 `receiveRenderData()` 保持 authority 语义

现有 validation 完全保留。

接收新 RenderData 后：

```text
_cancelRaf()
_latestData = data
_paintEpoch++
_lastPaintToken = undefined
receivedAt = performance.now()       // 只给 camera motion
_paintLatest(data, receivedAt, epoch)
```

不要修改 `_animationStartedAt`。

### 4.4 `_paintLatest()` 只做 async prepare

当前 `_paintLatest()` 中以下逻辑保留：

```text
ensure first layer
collect current request actual required refs
Promise.all decode
latest/epoch/isConnected check
bitmap layout classification
```

这里的“保留”只冻结 transaction/currentness 语义，不冻结当前 `seen identity -> first slot` 的中间表示。当前 schema 允许多个 slot 引用同一个 `ResourceRef`；实现必须支持这种 alias。

精确规则：

```text
used autotile slots
→ 按 ResourceRef identity 去重 image fetch/decode Promise
→ Promise.all 等待全部唯一 identity
→ 将 decode 结果回填到引用该 identity 的每一个 used slot
→ 每个 used slot 都必须拥有完整 PreparedAutotile entry
```

禁止只把 decoded image 绑定到首次遇到的 slot。资源 decode 可以共享，但每个 slot 必须得到一个完整 prepared entry。

之后不直接把整个 async function 当 animation loop。

构造一个局部 `prepared`：

```ts
interface PreparedAutotile {
  image: ImageBitmap;
  layout: "block" | "cell";
  frameCount: number;
  frameWidth: 96 | 32;
  durationMs: number;
}

interface PreparedMapPaint {
  tilesetImage?: ImageBitmap;
  autotiles: Map<number, PreparedAutotile>;
}
```

这是文档表达 shape；实现保持 plain JS object/Map，不引入 exported type。image、layout 和 animation facts 具有相同的 slot key 与生命周期，禁止拆成多个需要同步维护的平行 Map。

对每个 **当前 request 实际使用且已 decode** 的 autotile slot：

```text
layout      = classifyAutotileLayout(image)
frameWidth  = layout === block ? 96 : 32
frameCount  = image.width / frameWidth
durationMs  = autotileFrameDurationMs(ref)
```

若：

```text
layout === invalid
or durationMs === null
```

则沿用当前 presentation fail-closed：

```text
if request still latest:
  _clearLayers()
return
```

准备完成后唯一调用：

```text
_paintPrepared(requested, receivedAt, epoch, prepared)
```

### 4.5 `_paintPrepared()` 必须是同步 paint loop

`_paintPrepared()` 内禁止 await / resource fetch / image decode。

每次进入先检查：

```text
_latestData === requested
&& epoch === _paintEpoch
&& isConnected
```

否则立即 return。

然后：

```text
now = performance.now()

cameraMotion:
  仍用 now - receivedAt
  仍沿用 250ms lerp

autotile frames:
  用 now - _animationStartedAt
  每 slot 独立 frameCount/durationMs
```

### 4.6 block 绘制

现有 48 variant `corners` 不变。

对当前 slot：

```text
frameX = frameIndex * 96
```

原：

```js
drawImage(image, corner.sx, corner.sy, 16, 16, ...)
```

改为：

```js
drawImage(image, frameX + corner.sx, corner.sy, 16, 16, ...)
```

TL/TR/BL/BR 全部一样只增加 `frameX`。

`corner.sy` 不变。

### 4.7 single-cell 绘制

对当前 slot：

```text
frameX = frameIndex * 32
```

原：

```js
drawImage(image, 0, 0, 32, 32, dx, dy, 32, 32)
```

改为：

```js
drawImage(image, frameX, 0, 32, 32, dx, dy, 32, 32)
```

single-cell 仍然不解释 corners；slot/ResourceRef/validation 仍来自 Runtime RenderData。

### 4.8 一个 RAF 同时服务 camera 与 autotile

本轮是否继续 rAF：

```text
cameraAnimating = cameraMotion && progress < 1
hasAnimatedAutotile = 任一当前实际使用 slot 的 frameCount > 1

needsNextFrame = cameraAnimating || hasAnimatedAutotile
```

若需要：

```js
this._raf = requestAnimationFrame(() => {
  this._raf = undefined;
  this._paintPrepared(requested, receivedAt, epoch, prepared);
});
```

否则：

```js
this._raf = undefined;
```

单帧地图在 camera 停止后不得保持永久 RAF。

### 4.9 paint token：不做无效 60fps Canvas 重画

即使 animated map 要持续 rAF 观察时间，也不需要每个屏幕刷新周期重画 Canvas。

每次 prepared paint 计算：

```text
frameToken = 当前实际使用 slot 的 slot:frameIndex
paintToken = epoch | cameraX,cameraY | frameToken
```

例如：

```text
31|64,96|0:1,3:0,4:2
```

若：

```text
paintToken === _lastPaintToken
```

则：

```text
不 clear canvas
不 bucket/draw/trim
只根据 needsNextFrame 决定是否继续 RAF
```

若不同：

```text
_lastPaintToken = paintToken
执行现有完整同步 paint transaction
```

`epoch` 必须进入 token，确保不同 RenderData 即使 camera/frame 恰好相同也会重画。

### 4.10 clear / disconnect / stale

`_clearLayers()` 增加：

```js
this._lastPaintToken = undefined;
```

Renderer 可能同步 reparent 已有 element，且 RenderData 未变化时不会重新调用 `receiveRenderData()`。因此 `ResourceElement.disconnectedCallback()` 不得立即取消 RAF，固定为：

```js
disconnectedCallback() {
  queueMicrotask(() => {
    if (!this.isConnected) this._cancelRaf();
  });
}
```

同一 task 内重新连接时保留原 RAF、prepared closure、camera `receivedAt` 和 animation epoch；microtask 时仍未连接才真正取消。禁止为 reconnect 新增第二套 resume state 或重新下发 RenderData。

prepared loop 仍必须保留 epoch/latest/connected check，因此：

```text
old map prepared RAF
→ new RenderData paintEpoch++
→ old callback sees epoch mismatch
→ return
```

旧 map 的 animation 不得在 transfer 后重新覆盖新 map。

### 4.11 decode transaction 不能退化

必须继续：

```text
collect all resources needed by current request
→ Promise.all complete
→ latest check
→ classify all used autotiles
→ only then first paint
```

禁止：

```text
await 一个 autotile → 先画一点
await 第二个 autotile → 再补
```

因此资源慢返回/失败时，不会留下 half-old / half-new partial stale canvas。

---

## 5. Runtime / Importer 明确 0 改动

Runtime 已提供 slot/corners，Tileset 已提供 7 个 resource name，Browser 又持有 bitmap dimensions；frameCount、duration 和 frameIndex 因此全是 presentation facts。本功能不改 Runtime、semantics、importer、schema 或 `packages/**`，完整文件边界见 Section 8。

---

## 6. 全存档地图格式闭环

动画正确不等于“69 张图格式全部闭环”。本设计额外增加一个 local-only real-material audit。

固定文件：

```text
scripts/map-data-format-essentials-local.mjs
```

它不是 M14/M15 qualification，不写进 protocol contract，也不替代对应 ledger 的 live status。

### 6.1 Audit 必须证明

阻断性审计只回答“当前 69 张地图能否被现有 Runtime/Browser 支持”：

```text
全部 struct.Map
→ Map 结构合法
→ 引用的 13 个 Tileset 存在且结构合法
→ projectability 成立
→ 所有实际使用 autotile slot 有非空 name
→ 13 个 Tileset 的全部非空 autotile_names 可解析为 15 个唯一 Graphics/Autotiles resource
→ 15 个 autotile PNG 的 dimensions 可读取、geometry 合法、frameCount 为正整数
→ 13 个 Tileset 的 tileset_name 可解析为 12 个唯一 Graphics/Tilesets resource
→ 12 个 regular tileset PNG 的 dimensions 与实际 sourceIndex 容量合法
```

autotile 的合法几何沿用 Section 1.2。regular tileset 固定验证：

```text
PNG signature / IHDR 合法
width === 256
height > 0 && height % 32 === 0
capacity = 8 * (height / 32)
每个实际 regular tile 的 sourceIndex = tileId - 384
0 <= sourceIndex < capacity
```

其余 10 个未被地图引用的 Tileset 和 25 个不在 Runtime 加载闭包内的 autotile 不参与 Data-format closed 的成败，只输出 informational inventory。当前全库 inventory 仍是 23 Tilesets、40 autotile PNG、28 block、12 single-cell、0 unsupported；实现算法不得按 name 特判。

并统计：

```text
map count
referenced / total tileset count
autotile map ids
tileId 0 / 1..47 / 48..383 / >=384 counts
实际使用 autotile names
Runtime autotile resource closure、bitmap dimensions / frame counts
regular tileset resource dimensions / capacity / max sourceIndex
全库 bitmap geometry inventory
unsupported count
missing resource count
```

期望当前基线与 Section 1 一致：69 maps、13/23 referenced/total tilesets、20 张含 autotile、12 个 tile-used autotile、15 个 Runtime-loaded autotile、12 个唯一 regular tileset resource，且 `1..47` 使用量为 0。

### 6.2 PNG dimensions

Audit 不需要 decode/render PNG，也不新增图片依赖。

允许直接读 PNG header：

```text
validate 8-byte PNG signature
first chunk type must be IHDR
width  = bytes 16..19 big-endian uint32
height = bytes 20..23 big-endian uint32
```

这只做 material audit；Browser 生产代码仍以 `ImageBitmap.width/height` 为准。

### 6.3 Audit 不能替代 Browser test

Audit 只能证明：

```text
数据/资源形态在支持集合内
```

Browser test 必须另外证明：

```text
实际 frame offset
RAF 生命周期
walking 不重置 phase
stale transfer 不污染 latest
layering 不回退
```

### 6.4 已冻结的 audit seam 与 CLI

本节已经关闭 exact seam，不再留给 implementation 自选。

从仓库根目录运行精确 CLI：

```bash
npm run build:m14
node scripts/map-data-format-essentials-local.mjs --source <Essentials-v21.1.zip-or-dir>
```

脚本只接受一个必填参数 `--source`；未知参数、重复参数和缺失值均 non-zero exit。输入可以是 Essentials v21.1 ZIP 或目录。

production CLI 传给 `auditFsdbRoot()` 的 baseline 固定为：

```js
{
  mapCount: 69,
  referencedTilesetIds: [1, 2, 3, 4, 5, 6, 7, 10, 12, 14, 15, 20, 22],
  autotileMapIds: [2, 5, 7, 21, 23, 28, 31, 35, 39, 40, 41, 44, 45, 52, 68, 69, 70, 71, 72, 73],
  tileCounts: { empty: 103470, reserved: 0, autotile: 6160, regular: 61739 },
  tileUsedAutotileCount: 12,
  runtimeLoadedAutotileCount: 15,
  regularTilesetResourceCount: 12,
}
```

测试可以传入与最小 fixture 对应的小 baseline；不得把上述 production 数字硬编码到检查算法内部。

精确读取链：

```text
mkdtemp(os.tmpdir()/loomrealm-map-data-format-*)
→ tools/fixtures/essentials-v21.1/import.mjs 的 run([
    "--source", resolvedSource,
    "--output", temporaryOutput
  ])
→ 使用 run() 返回的 FSDB root
→ @loomrealm/fsdb.openFsdb({ root })
→ @loomrealm/fsdb.listFsdbEntries(db)
→ 只按 entry.identity.kind/table/key 枚举
→ @loomrealm/fsdb.openFsdbObject(db, identity, signal) 读取内容
→ finally: close lease/db，并只删除本次 mkdtemp 创建的 temporaryOutput
```

禁止直接 `readdir` 扫 `[struct]Map`、`[struct]Tileset` 或 `[resource]Graphics` 作为审计数据源；目录只能作为 `openFsdb()` 的 root。无需且禁止为 audit 新增 framework listing API，因为 production `@loomrealm/fsdb` 已提供 `listFsdbEntries()`。

Map 语义验证固定复用本次 `build:m14` 生成的 repo-local `game-libs/map/dist/semantics.js`：

```text
validateMapRecord
validateTilesetRecord
assertProjectable
```

该文件不是新增 public export；local script 通过仓库内绝对 file URL 导入。每个 `struct.Map` 必须读取并验证；Map 引用的 Tileset 必须按 key 读取、验证且 key/id 一致。阻断性 resource closure 包含这些 Tileset 的全部非空 `autotile_names` 和 `tileset_name`，不以 tile 是否实际使用某 autotile slot 为准。每个 name 必须解析到唯一的 `resource/Graphics` identity，并通过 `openFsdbObject()` 读取和验证；其他 Tileset/resource 只参与 informational inventory。

成功时输出稳定排序的汇总；失败时列出具体 map/tileset/slot/resource，并设置 non-zero exit。阻断条件包括实际地图链上的非法 record、不可 project、缺失或重复 resource identity、非法 PNG header、autotile unsupported geometry、regular tileset 非 256px 宽/非整行高度/sourceIndex 越界，以及 Section 1 的 map/tile 基线不符。informational inventory 的变化必须报告，但不单独导致失败。

### 6.5 Audit 自动测试

新增：

```text
test/map-data-format-essentials-local.test.mjs
```

audit script 使用 direct-execution guard，并导出 repo-local `auditFsdbRoot(root, baseline)` 测试 seam；它不是 package/public API。CLI 负责 source import、临时目录和输出，该函数只通过 production FSDB API 检查给定 root：成功返回 summary，存在阻断错误则 reject。

测试用临时最小 FSDB 覆盖：

```text
valid baseline PASS
缺失 referenced Tileset
缺失 Runtime 会加载但地图未使用的 autotile
缺失 regular tileset PNG
截断/非法 PNG header
unsupported autotile geometry
regular tileset width / height / sourceIndex capacity 非法
tileId 1..47
未知、重复、缺失 CLI 参数
informational-only 素材变化会报告但不阻断
```

测试必须验证错误包含具体 identity，不能只验证“任意失败”。

---

## 7. Browser regression 测试

继续使用现有：

```text
test/map-layering-browser.test.mjs
```

不要新造第二套 Playwright harness。

当前 harness 已经能：

- 启动真实 `dist/browser/map.browser.js`；
- 构造 PNG；
- 注入 delayed resource Promise；
- 观察 Canvas、layer z-index、sprite z-index、`_raf`、`_images`；
- 验证 stale image race。

本刀在该文件追加以下测试。所有需要断言精确动画帧或 duration 边界的 case，固定使用当前 Playwright 版本提供的 `page.clock`：在导航前 `install()`，页面加载完成后、创建 `lr-map-view` 前 `pauseAt()`，再用 `runFor(ms)` 推进 `performance` 和 rAF。`openPage()` 可以增加 harness-only option 复用这条路径；不得向生产代码注入 clock，也不得改写 `_animationStartedAt`。

### 7.1 single-cell 多帧

构造：

```text
160×32 PNG
5 个 32×32 横向 frame
每帧明显不同颜色
ResourceRef key 可使用：Autotiles/Test Flowers [1]
```

`[1]` 使测试 cadence 为 50ms，避免每例等待默认 250ms。该 case 使用上述 paused clock，使 element 构造、资源 decode 和首次 paint 处于同一 presentation time。

断言：

```text
首次 paint 为 frame 0
每次 `page.clock.runFor(50)` 后依次为 1、2、3、4、0
循环后仍只取单个 32×32 frame
```

另保留至少一个不安装 fake clock 的 smoke case，只断言实际 rAF 下最终能观察到两个不同 frame，不断言首次 frame 或精确 wall-clock 边界。

### 7.2 block 多帧

构造：

```text
288×128 PNG
3 个 96×128 frame
每个 frame 对同一 corner 区域填不同颜色
```

给一个确定 autotile `corners`。

断言 frame 切换时四角仍保持 variant 组合，只改变横向 96px frame base。

### 7.3 同图不同 slot 不同 frameCount

至少同时使用：

```text
slot A: 5-frame cell
slot B: 4-frame cell 或 block
```

断言各自 modulo 自己的 frameCount，不使用全局最大帧数。

### 7.4 同一 ResourceRef 被多个 slot 引用

构造两个 autotile slot 指向完全相同的 `namespace/key/contentVersion`，并让两个 slot 都有 visible tile。

断言：

```text
resource fetch/decode 只发生一次
两个 slot 对应位置都绘制正确 frame
不存在 undefined drawImage source 或未处理 rejection
```

`prepared` 是局部对象，测试不得为了观察内部 entry 而增加生产字段或调试 API。

### 7.5 duration 解析与默认节奏

在现有 Browser harness 中以可控 clock/边界采样覆盖：

```text
无 suffix                    250ms/frame
[1]                           50ms/frame
[ 2 ]                        100ms/frame
[0]                           presentation fail-closed
超出 Number safe integer      presentation fail-closed
普通不匹配文件名               使用默认 250ms，不误判
```

非法 duration 的 fail-closed 必须 clear 当前 latest layers、停止该 request 的 RAF，且不得产生未处理异常。真实素材没有 suffix，不能用 local audit 替代这些测试。

### 7.6 walking RenderData 不重置 autotile phase

步骤：

```text
让 autotile 进入非 0 frame
→ 发送带 cameraMotion 的新 RenderData
→ animationStartedAt 不变
→ 环境 frame 按原 timeline 继续
```

禁止走一步就回 frame 0。

### 7.7 transfer/latest stale regression

步骤：

```text
old map animated prepared loop running
→ receive new map RenderData
→ old epoch invalid
→ old RAF callback 不再 paint
```

并保留已有 delayed resource：

```text
old resource late resolve/reject
→ latest canvas 不被覆盖/clear
```

### 7.8 单帧 idle 不永久 RAF

当当前地图：

```text
cameraMotion === null
所有实际使用 autotile frameCount === 1
```

paint 后必须：

```text
_raf === undefined
```

### 7.9 layering 回归

现有：

```text
tile depth
sprite depth
moving depth
multiple tile layer
```

断言继续保留，不因 animation paint loop 改 z-index / canvas order。

### 7.10 disconnect 与同步 reparent

保留“真正 remove 后在 microtask 内取消 RAF”的现有断言，并新增：

```text
animated map 已启动 RAF
→ 同一 page.evaluate task 内 remove() 后 append() 原 element
→ 不再次调用 receiveRenderData()
→ 推进 page.clock
→ autotile frame 继续变化，RAF 仍由原 prepared loop 驱动
```

该测试证明 Section 4.10 的 deferred disconnect 不会把 Renderer 同步 reparent 误判为永久移除。

---

## 8. 实施边界

允许修改的文件只有：

```text
game-libs/map/browser/map.browser.js
test/map-layering-browser.test.mjs
test/map-data-format-essentials-local.test.mjs
scripts/map-data-format-essentials-local.mjs
examples/essentials-v21.1-local/MAP_DATA_FORMAT_REQUIREMENTS.md
```

以下不变量不得改变：

- Runtime/semantics/importer、`packages/**`、MapTransfer、save 和 Renderer protocol 保持 0 diff；
- animation frame 只属于 Browser presentation，不进入 RenderData 或 Runtime state；
- camera 与 autotile 共用一个 `_raf`，不新增 timer/service/timeline/ACK；
- resource decode 按 identity 共享，但 prepared data 必须覆盖每个实际使用的 slot；
- 新 RenderData、永久 disconnect 和异步资源失败继续服从 latest/epoch fail-closed 语义，同步 reparent 不得终止现有动画。

实现可以自行安排局部语句与函数，只要满足上述边界、Section 4 的数据流和 Section 7 的可观察行为。若必须越过边界，停止实施并回到设计审阅。

---

## 9. 验证与完成条件

### 9.1 自动门禁

开发阶段先跑快速定向门禁：

```bash
npm test -w @loomrealm/fsdb
npm test -w @loomrealm-game/map
node --test test/map-layering-browser.test.mjs
node --test test/map-data-format-essentials-local.test.mjs
```

关闭前再跑完整回归与真实素材审计：

```bash
npm run test:fixtures
npm run test:m14
node scripts/map-data-format-essentials-local.mjs --source <Essentials-v21.1.zip-or-dir>
```

本节命令均从仓库根目录运行。FSDB/map package test 均包含自身 build，分别为 audit test 和 Browser test 准备 production artifact；`test:m14` 已包含 `build:m14`，因此紧随其后的真实素材 audit 无需重复构建。单独运行 audit 时仍使用 Section 6.4 的两条命令。Browser test 必须读取本次生成的 `dist/browser/map.browser.js`。历史 broad-gate 失败只有在 clean base 可复现时才能记录为 baseline exception，本次改动引入的失败不得例外。

### 9.2 Feature implementation complete

- diff 未超出 Section 8；
- Section 7 的动画、alias、clock、RAF、reparent、walking、stale 和 layering 测试通过；
- audit 的 happy-path 与 fail-closed 测试通过；
- map package 与 broader regression gates 无新增失败。

### 9.3 Data-format closed

在 Feature complete 基础上，真实素材 audit 还必须满足：

```text
69 maps 全部 projectable
0 unsupported actual tile formats
13 个 referenced Tileset 的 15 个 Runtime-loaded autotile 全部存在且 geometry 合法
12 个唯一 regular tileset PNG 全部存在且容纳实际 sourceIndex
```

未使用的 Tileset/autotile inventory 变化需要报告，但不单独阻断现有地图闭环。

---

## 10. Product Closed 真人场景

从仓库根目录执行：

```powershell
Set-Location examples/essentials-v21.1-local
node scripts/init-fsdb.mjs --force
.\play.bat
```

重导入真实 FSDB 后，在示例窗口验证：

1. **无 autotile regression**：Map066 ↔ Map067 门往返正常；
2. **single-cell 户外**：Map066 东缘 → Map002，Flowers1 可见、连续动画且可走回；
3. **block 水面**：Map039 一带 Sea / Sea deep 可见且多帧在动；
4. **瀑布**：Map069 Waterfall / crest / bottom 可见且多帧在动；
5. **水下混合**：Map070 Seaweed + Underwater dark 可见，有多帧的 slot 在动；
6. 上述场景的 walking、遮挡和 transfer 均无 regression。

以上场景全部成立即为 Product Closed。无需保存具体 animation phase；未来读档只要求进入目标图后动画继续正常运行。

```text
Product Closed
```

`--force` 重导入后，`play.bat` 真人窗口已走通：

```text
Map066 (12,8) dir8 → Map067 (4,7) → 垫子北侧 dir2 → Map066 (12,7)
Map066 (21,8) dir6 → Map002 (0,8) Flowers1 连续换帧 → 可走回
Map002 南缘 → Map069 Waterfall / crest / bottom 与水池多帧在动
```

Map069 tileset 2 含 Sea / Sea deep，瀑布水池即 block 水面多帧证据。Map070 是 Map069 的 `dive_map_id`，MapTransfer 为空；本刀不实现 dive，walking 不可达。walking / 遮挡 / transfer 在上述路径无 regression。
