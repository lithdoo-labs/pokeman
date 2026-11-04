# 地图动态视口与大屏呈现性能改造草案

> 状态：**Draft for review；未冻结，不得直接实施**
>
> 日期：2026-09-16
>
> 生产代码基线：`3c10ae8`（后续 `main` 变更截至本次评审均为文档）
>
> 适用范围：Renderer⇄Subsystem Data capability、`@loomrealm/subsystem` author surface、Desktop viewport physical realization、`game-libs/map` Runtime/Browser presentation
>
> 核心目标：以独立于 Frame / Activation / InputTarget 的 viewport current-state capability 支持动态逻辑视口，并使地图移动、chunk refresh、autotile 与大屏投影的成本不再按每个 camera rAF 的可见 tile 总数增长。

本文是面向执行型 agent 的候选实施合同。评审通过并将状态改为 `Frozen for implementation` 前，不得据此修改生产代码。

本文覆盖两件必须一起闭合的工作：

1. 由真实 map consumer 暴露的 Core capability gap：Subsystem Runtime 需要读取/观察 current Renderer presentation viewport，而该事实不能使用 User Input，因为 User Input 受唯一 `InputTarget(Frame, Activation)` 门控；
2. 地图在动态 viewport 下的 projection/raster 性能：chunk projection、world-space raster、camera placement、dirty autotile 与 player raster/placement separation。

与既有文档关系：

- 覆盖 `M14_02_MAP_GAME_LIBRARY.md` §11 的固定 `640×480` viewport、§14 的旧 `MapViewRenderData` 形状，以及 §15 的每次 paint 全画布重画规则；
- 继承 `../../doc/30-implementation/render-movement-latency-spec.md` 已落地的 `RenderDomain.update()` / Render patch / latest-state / copy-on-write / `zIndex` 语义；本设计新增 Viewport capability，但**不**借此修改 Render Update v1；
- `MAP_MOVEMENT_LATENCY_REFACTOR_DRAFT.md` 中 input latency、movement cadence、turn buffer、collision、transfer trigger 等规则继续独立生效；其中 Browser static backing、camera-only frame、autotile repaint 与 sprite raster/placement 等呈现性能条款由本文统一替代；
- 复用 `MAP_AUTOTILE_ANIMATION_DESIGN_DRAFT.md` 的“一次异步 prepare + 同步 paint”方向，但以本文 dirty-cell raster 规则替代动画帧变化时重画整层；
- 保持 `MAP_LAYERING_DESIGN_DRAFT.md` 已冻结的 tile/player depth 与 equal-depth 规则；
- `Renderer Data Profile v1`、`User Input v1`、`Render Update v1` 均保持 Frozen。Viewport 不作为 v1 的未知扩展塞入现有 Profile，而由本文候选的 `Viewport State v1 + Renderer Data Profile v2` 承载。

如已冻结文档与本文在未明确 reopen 的 authority、碰撞、transfer trigger、资源访问、Input 或 Render 语义上冲突，以已冻结文档为准并停止实施，不允许执行者自行选择。

---

## 1. 决策摘要

目标数据流：

```text
Renderer presentation surface CSS size
  → platform-specific RendererViewportSource
  → Viewport State v1 retained publication
  → Renderer Data Profile v2 current carrier
  → Subsystem Host retained viewport state
  → SubsystemScope.viewport
  → Map Runtime accepted viewport
  → current 8×8 chunk-aligned ProjectionWindow
  → RenderDomain.update / scene replace
  → MapView current-window prepared state + world raster
  → camera rAF placement-only
  → autotile tick dirty-cell-only
```

候选决策：

1. 逻辑 viewport 使用 CSS pixel；tile 仍为 `32×32` logical pixel。
2. **删除** `x.loomrealm.viewport.state` 方案。Viewport 不属于 User Input，不受 Frame、Activation、InputTarget、Input Interest 或 input producer focus gate 控制。
3. Viewport 是 Renderer observed presentation-surface fact；Main 不拥有、解释或转发 viewport value。
4. Frozen `loomrealm.renderer-data/1` 不变。新增候选 `Viewport State v1`，并通过新的 `loomrealm.renderer-data/2` 组合 `Data Connection v1 + User Input v1 + Render Update v1 + Viewport State v1`。
5. `@loomrealm/subsystem` 新增 Runtime-scoped readonly `SubsystemScope.viewport` capability；它可以在任何 Frame 是否 active/suspended、是否 InputTarget 的情况下读取/观察 viewport。
6. Map Runtime 继续是 accepted viewport policy、camera、projection range、scene identity 与 presentation revision 的 business authority；Core 只提供 raw current viewport fact，不知道 tile/camera/chunk/cap。
7. tile 投影从逐 tile 嵌套对象改为 `8×8×3` 稠密 chunk，加 scene 内不可变 `tileVisuals` 表。
8. Runtime 只保留**当前 ProjectionWindow**；重叠 chunk 复用，entering chunk 新投影，leaving chunk 丢弃。不建立 LoadedMap-wide 历史 chunk cache。
9. Browser 只拥有可丢弃 decoded image、当前-window prepared representation、world raster 和 motion timeline；不建立独立长期 scene/cache framework。
10. 同 scene window refresh 必须复用 overlap pixels，并只 raster entering chunks。
11. camera motion 的每个 rAF 禁止 tile validation、full tile traversal、full canvas clear 或 tile `drawImage`。
12. autotile frame 变化只重画受影响 `(depth, cell)`；player raster identity 与 placement 分离。
13. `sceneRevision` 只标识 map scene；`presentationRevision` 只协调 MapView/MapSprite 的 atomic visual baseline。两者是 map Runtime-instance scoped business RenderData identity，不是 Session/Main/Render protocol revision。
14. 第一期 map policy 支持 `320×240` 至 `1920×1080` logical CSS pixel；Core Viewport capability不包含这些 map-specific limits。
15. DPR 不进入 Viewport State v1、Map Runtime authority 或 RenderData；pixel-art backing 保持 `1 logical pixel = 1 canvas backing pixel`。
16. 不新增 public `ViewportManager`、Environment service locator、generic chunk protocol、SceneManager 或 Renderer map-specific fast path。

---

## 2. 为什么 User Input viewport 被否决

Frozen User Input 的 ordinary Effective gate 为：

```text
current Data
× Main InputTarget(Frame, Activation)
× active/current Frame+Activation
× Desired Interest[Frame]
× Producer(channel)
```

因此下面是合法且必须支持的场景：

```text
map Frame visible + map RenderDomain live
  → map calls menu/dialog child Frame
  → map Frame suspended
  → child becomes the only InputTarget
  → Window resized
```

如果 viewport 走 `x.*.state`：

```text
map no longer Effective for that input channel
→ map cannot receive resize
→ visible background map keeps stale viewport
```

这把“当前有无交互 authority”错误地变成“能否观察 presentation surface geometry”。同时 RenderDomain lifetime 本来就独立于 Frame/Activation；可见 map 在 suspended 时仍可继续投影。

因此冻结候选原则：

```text
Viewport lifetime != Input lease lifetime
Viewport currentness != InputTarget
Viewport observation != User Input
```

禁止：

- 给 User Input 增加 viewport 绕过 InputTarget 的特例；
- 把 viewport 伪装成 custom input state；
- 因 viewport 修改 User Input v1 的 frozen authority/lifetime；
- 让 keyboard focus/blur/visibility availability 决定 viewport 是否存在。

---

## 3. Viewport State Core capability

### 3.1 Authority / lifetime

| 事实 | owner | consumer |
|---|---|---|
| current presentation surface CSS size | current Renderer physical realization | Renderer Viewport producer |
| DataAuthority `{S,G,P}` | Main | Renderer / Platform broker / Subsystem binding |
| retained viewport observation | Subsystem Host | business Definition through `scope.viewport` |
| accepted logical viewport policy | Map Runtime | Map camera/projection |
| current Render replica/currentness | existing Renderer | Web Projector |
| DOM/Canvas physical layout | business Web presentation | Browser only |

Viewport capability lifetime：

```text
SubsystemScope.viewport object lifetime
  = Subsystem Runtime / SubsystemScope lifetime

retained viewport value
  = last successfully accepted viewport.state from current/fresh Data carriers

!= Frame lifetime
!= Activation lifetime
!= InputTarget lifetime
!= RenderDomain lifetime
```

Main 只继续拥有 Session/Runtime/Frame/Activation/InputTarget/DataAuthority；它不保存 width/height，也不根据 viewport 修改 Stack/InputTarget/DataAuthority。

### 3.2 Public author surface

候选 exact surface：

```ts
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface Viewport {
  readonly current: ViewportSize | null;

  subscribe(
    listener: (viewport: ViewportSize | null) => void,
  ): () => void;
}

export interface SubsystemScope {
  readonly signal: AbortSignal;
  readonly content: ContentClient;
  readonly viewport: Viewport;

  createInputListener(options: CreateInputListenerOptions): InputListener;
  createRenderDomain(initialState: RenderDomainState): RenderDomain;
}
```

只 root-export `ViewportSize` / `Viewport`；不导出 host manager、wire message、profile implementation 或 physical source。

`current`：

- Runtime construction时在尚未观察任何 viewport baseline 前为 `null`；
- 观察合法 baseline 后为 immutable/detached `{width,height}`；
- Data carrier loss不把它改回 `null`，而是保留最后成功值；
- fresh carrier baseline如果 value structural equal，不制造 author-visible change；
- Runtime terminal 后 capability 不再产生 callback。

`subscribe(listener)`：

```text
validate listener
→ register
→ synchronously deliver exactly one current value (including null)
→ future retained value change再 deliver
```

返回 unsubscribe 必须 idempotent。Listener throw/reject 是 local callback failure：必须 contain，不 terminalize Runtime/Data、不影响其它 listener，不自动 retry同一 value。

这样不存在：

```text
get current
→ resize race
→ subscribe
```

也不需要 EventEmitter/Observable framework。

### 3.3 Viewport State v1 wire candidate

新增一个 Renderer→Subsystem retained-state child protocol：

```ts
interface ViewportStateV1 {
  readonly type: "viewport.state";
  readonly width: number;
  readonly height: number;
}
```

规则：

```text
width/height
  positive safe integer
  represent Renderer presentation-surface logical CSS pixels
```

不携带：

```text
frameId
activationId
subsystem business id
sequence/revision
devicePixelRatio
screen size/display id
focus/visibility
DOM rect
camera/tile/chunk/map policy
```

Viewport State v1 只有 `viewport.state`，不存在：

```text
viewport.event
viewport.reset
viewport.interest
viewport.ack
viewport.request
```

Publication semantics：

```text
State is self-contained current truth
latest wins
MAY coalesce before emitted
must not require earlier viewport state
same value MAY be suppressed
```

`emitted` 沿用 Data Profile ordered-send boundary 定义；已 emitted value 不 replay/undo。Fresh carrier 必须建立 fresh viewport baseline，但不存在跨 carrier revision continuity。

### 3.4 Renderer Data Profile v2

Frozen v1 不修改：

```text
loomrealm.renderer-data/1
├── Data Connection v1
├── User Input v1
└── Render Update v1
```

新增候选：

```text
loomrealm.renderer-data/2
├── Data Connection v1
├── User Input v1
├── Render Update v1
└── Viewport State v1
```

exact namespaces/directions：

```text
Subsystem → Renderer
    input.interest
    render.domains
    render.snapshot
    render.patch
    render.event

Renderer → Subsystem
    input.state
    input.event
    input.reset
    viewport.state
```

Profile v2 继续只有 one inbound reader/dispatcher + one serialized writer；child protocols共享 carrier ordering/terminal boundary，但不建立 cross-child transaction/revision/ACK。

Profile replacement仍遵循既有规则：

```text
P1 → P2
→ DataAuthority replacement
→ fresh generation
```

Main Renderer Control v1 的 `dataProfile: string` surface不需要版本升级；Main policy/hosting只需能选择并实现 v2。现有 v1 consumer 必须继续合法，不能原地把 `viewport.state` 加进 `loomrealm.renderer-data/1`。

### 3.5 Fresh carrier / loss / reconnect

Subsystem-side retained model：

```text
Runtime start
  current = null

first successful viewport.state(V)
  current = V
  notify if changed

Data carrier lost
  keep current = last V
  no null callback

same/fresh-generation carrier installed
  viewport publication baseline is fresh
  Renderer promptly sends current viewport.state
  if V equal retained current → no author callback
  if V differs             → update + notify
```

原因：Data carrier loss不等于 presentation surface authority removal；在断线期间保留最后 observation 与既有 Render/DOM“preserve last successful state”方向一致。Fresh baseline负责最终收敛。

Viewport malformed/schema-invalid 属于 Viewport child protocol fatal → retire current Data carrier；不等于 Runtime/Frame automatic failure。

---

## 4. Physical Renderer viewport source

Core 不读取 DOM。Concrete platform composition提供窄 physical source，例如概念 surface：

```ts
export interface RendererViewportSource {
  start(emit: (viewport: ViewportSize) => void): () => void;
}
```

该 surface 是 trusted Renderer integration，不是 business author API；exact constructor wiring在 Core implementation closure时冻结，本文不要求 public manager/registry。

Desktop first realization读取当前 Renderer Window 的逻辑 CSS viewport：

```ts
{
  width: Math.floor(window.innerWidth),
  height: Math.floor(window.innerHeight),
}
```

规则：

- 只发送正 safe integer；0/invalid sample 不覆盖最后合法值；
- start 时立即采样当前合法值；
- resize 使用至多一个 pending rAF 合并，latest wins，同值不重复 publish；
- blur/focus 不改变 viewport availability；keyboard producer availability与 viewport 无关；
- hidden 不发送 null/unavailable；回到 visible MAY/SHOULD 重新采样用于收敛；
- stop 取消 pending rAF；
- 不发送 DPR、screen size、display id、focus、visibility、DOM element rect。

PWA 后续 physical realization必须产生相同 CSS logical-pixel semantics；Hostra/PWA 可使用不同 physical event source，但 author-visible Viewport semantics相同。

---

## 5. Map Runtime accepted viewport

Core只提供 raw positive CSS size；map package拥有自己的支持范围和 settle policy。

```ts
const DEFAULT_VIEWPORT = Object.freeze({ width: 640, height: 480 });
const MIN_VIEWPORT_WIDTH = 320;
const MIN_VIEWPORT_HEIGHT = 240;
const MAX_VIEWPORT_WIDTH = 1920;
const MAX_VIEWPORT_HEIGHT = 1080;
const VIEWPORT_RESIZE_SETTLE_MS = 100;
```

Map Runtime state：

```text
acceptedViewport
pendingViewport?    // latest normalized observation only
resizeTimer?
```

Map Frame 建立业务 Render state时：

```text
scope.viewport.current ?? DEFAULT_VIEWPORT
→ normalize/clamp
→ initial acceptedViewport
```

同时建立 Runtime-scoped viewport subscription。该 subscription不绑定 map Frame 的 Input listener，也不因为 map Frame suspended 而停止。

normalization：

```text
Core viewport must already be positive safe integer
Map clamps width  to [320,1920]
Map clamps height to [240,1080]
```

transition：

```text
subscription baseline/current observation different from accepted
  → first business baseline can commit immediately when map is ready

later changed observation
  → pendingViewport = latest
  → reset 100ms trailing timer

timer fires while standing
  → tryCommitViewport

timer fires while moving
  → keep pending only

movement step boundary
  → if pending, tryCommitViewport before next motion baseline

map Frame suspended by child
  → viewport subscription remains active
  → standing commit is still allowed
  → background map may resize/reproject while not InputTarget
```

相同 normalized size不产生新 commit。timer/subscription callback受 Runtime/map lifetime guard；map teardown必须 unsubscribe + cancel timer。

resize candidate 超 map projection budget时：

```text
acceptedViewport unchanged
current ProjectionWindow unchanged
Render state unchanged
pending candidate rejected
```

后续较小 viewport observation仍可继续尝试。

---

## 6. Camera 与 viewport 公式

```ts
export function computeCamera(
  map: MapRecord,
  playerX: number,
  playerY: number,
  viewport: ViewportSize = DEFAULT_VIEWPORT,
): Readonly<{ cameraX: number; cameraY: number }>;

export function viewportTileBounds(
  map: MapRecord,
  cameraX: number,
  cameraY: number,
  viewport: ViewportSize = DEFAULT_VIEWPORT,
): TileProjectionBounds;
```

camera：

```text
anchorX=floor((viewport.width-32)/2)
anchorY=floor((viewport.height-32)/2)

cameraX=clamp(playerX*32-anchorX,0,max(map.width*32-viewport.width,0))
cameraY=clamp(playerY*32-anchorY,0,max(map.height*32-viewport.height,0))
```

bounds：

```text
minTileX=max(0,floor(cameraX/32))
maxTileX=min(map.width-1,floor((cameraX+viewport.width-1)/32))
minTileY=max(0,floor(cameraY/32))
maxTileY=min(map.height-1,floor((cameraY+viewport.height-1)/32))
```

`640×480` 必须严格退化为当前 `304/224` 公式。walking coverage使用 source/target viewport bounds union。

---

## 7. 稠密 projection contract

### 7.1 常量与 ordering

```ts
const TILE_SIZE = 32;
const CHUNK_TILES = 8;
const CHUNK_CELL_COUNT = CHUNK_TILES * CHUNK_TILES * 3; // 192
const CHUNK_OVERSCAN = 1;
const MAX_PROJECTED_DATA_BYTES = 196_608;
```

chunk 坐标：

```text
chunkX=floor(tileX/8)
chunkY=floor(tileY/8)
```

`chunks` canonical order：`chunkY` ascending，再 `chunkX` ascending。

`cells` 固定 192：

```text
((z*8+localY)*8)+localX
z=0,1,2; localY=0..7; localX=0..7
```

地图外 cell 为 `0`；非空值是原始 tileId。

### 7.2 跨 Runtime→Browser exact RenderData

```ts
type ProjectedChunk = Readonly<{
  chunkX: number;
  chunkY: number;
  cells: readonly number[]; // exact length 192
}>;

type TileVisual =
  | null
  | readonly [depthBias: number, kind: 0, sourceIndex: number]
  | readonly [
      depthBias: number,
      kind: 1,
      slot: number,
      tlSx: number, tlSy: number,
      trSx: number, trSy: number,
      blSx: number, blSy: number,
      brSx: number, brSy: number,
    ];

type MapViewRenderData = Readonly<{
  sceneRevision: number;
  presentationRevision: number;
  viewportWidth: number;
  viewportHeight: number;
  mapId: number;
  mapWidth: number;
  mapHeight: number;
  cameraX: number;
  cameraY: number;
  tileset: ResourceRef;
  autotiles: readonly (ResourceRef | null)[];
  tileVisuals: readonly TileVisual[];
  chunks: readonly ProjectedChunk[];
  cameraMotion: CameraMotion | null;
}>;
```

`MapSpriteRenderData` 新增：

```ts
presentationRevision: number;
```

`sceneRevision` 不进入 Sprite。`presentationRevision` 是两个 map-owned element 的 atomic visual baseline id，不是 framework generation、Main revision或 Render Update domain revision。

Revision scope：

```text
one live map Runtime instance
```

不得描述成 Session-scoped authority，也不得读取 Main Session/generation material来生成。

### 7.3 `tileVisuals`

每次 `loadMap()` 为当前 Tileset 构建并冻结一次：

- index = tileId；
- `0` 与不可渲染保留位为 `null`；
- regular tile 使用既有 `sourceIndex`；
- autotile 使用既有 `slot` 与预计算四组 `sx/sy`；
- `priority===0` → `depthBias=-1`；
- `priority>0` → `depthBias=(priority+1)*32`。

Browser只执行已投影 blit/depth instruction，不读取 Tileset table、不决定 priority、不调用 `autotileCorners()`。

### 7.4 Current ProjectionWindow 就是 Runtime chunk cache

Runtime 不维护 LoadedMap-wide `(chunkX,chunkY) → ProjectedChunk` 历史表。当前 window内部可按 coordinate 索引现有 chunks，仅用于 refresh diff：

```text
new required window
  ∩ old window → reuse existing frozen ProjectedChunk object
  - old window → project entering chunk once
old - new       → drop
```

内存为 `O(current window)`。chunk 离开后再进入允许重新 project；若以后 profiling证明 revisit projection 是独立瓶颈，重新评审 cache policy。

### 7.5 Window selection

从 source/target union tile bounds 得到 required chunk bounds，再各方向扩一 chunk并 clamp：

```text
requiredMinChunkX=floor(required.minTileX/8)
requiredMaxChunkX=floor(required.maxTileX/8)
requiredMinChunkY=floor(required.minTileY/8)
requiredMaxChunkY=floor(required.maxTileY/8)

window=min/max(required ± CHUNK_OVERSCAN, map chunk bounds)
```

当前 window仍包含新的 required bounds时，ordinary movement不包含 `chunks`。越界时确定性选择新 window，不按 payload动态改变 overscan。

map-side explicit byte preflight只在 initial baseline、scene transfer、accepted viewport commit、chunk window refresh运行；ordinary author update不重复自己的 `JSON.stringify` guard。

---

## 8. Runtime publication

### 8.1 Revision semantics

```text
sceneRevision
  changes only when a new map scene successfully becomes authoritative

presentationRevision
  changes whenever MapView must commit a new raster baseline together with MapSprite:
  - chunk window refresh
  - accepted viewport change
  - successful scene transfer
```

ordinary movement within retained window不增加 `presentationRevision`。两 revision 为 positive safe integer、map Runtime-instance 内单调、禁止 wrap；无法递增时 map fail closed，不复用旧 identity。

### 8.2 Ordinary movement

retained window命中：

```text
viewport set cameraX/cameraY/cameraMotion
player   set x/y/screenX/screenY/direction/pattern/motion
```

不重复 set `chunks`、`tileVisuals`、resource refs、viewport size或 revisions。

### 8.3 Chunk refresh

跨 chunk coverage boundary：

```text
construct new window
→ reuse overlap chunks
→ project entering chunks
→ map payload preflight
→ presentationRevision += 1
→ one domain.update()
```

同一个 update：

```text
viewport set presentationRevision/cameraX/cameraY/cameraMotion/chunks
player   set presentationRevision/x/y/screenX/screenY/direction/pattern/motion
```

同 accepted viewport 的 chunk refresh若超 `196,608 B`，不得缩 overscan或发布不完整 picture。这属于 map-library projection capacity/invariant failure，不称为 Browser presentation failure；不得先提交 player/camera authoritative state再留下旧 chunks。

### 8.4 Viewport commit

pending viewport通过 projection budget后：

```text
presentationRevision += 1
→ one domain.update()
```

```text
viewport set presentationRevision/viewportWidth/viewportHeight/
             cameraX/cameraY/cameraMotion/chunks
player   set presentationRevision/screenX/screenY
```

若 boundary同时开始下一步，仍为同一 update，不先发布 viewport再修正 player。

resize candidate超预算：不修改 accepted viewport/current window/revision，不调用 update/replace，保留当前 authoritative Render state。

### 8.5 Scene transfer

成功 map transfer 是明确 scene replacement：

```text
sceneRevision += 1
presentationRevision += 1
accepted viewport保持最新 accepted value
construct new tileVisuals + ProjectionWindow + resources + camera/player
→ domain.replace(full scene)
```

新 scene不复用旧 scene pixels、prepared chunks或 resource-derived raster。旧 async completion必须被 scene/currentness guard丢弃。

---

## 9. Browser world-space raster

### 9.1 三个阶段

```text
validate/prepare
  → exact RenderData validation
  → reuse same-scene decoded resources
  → build/update current-window instructions + animated-cell index

raster
  → build/update world-space depth backing
  → refresh copies overlap + rasters entering chunks only
  → autotile tick repaints dirty cells only

placement
  → camera rAF updates depth canvas placement only
```

prepared representation具体 JS shape 是 implementation detail；不要求独立 `ChunkAnalysisCache`、token class或 manager。

rAF callback禁止 `await`、Content request、image decode、chunk validation、full tile traversal或 full canvas clear。

### 9.2 Depth backing

每个当前实际 visual depth最多一个 live canvas。canvas使用该 depth当前 tile 的最小 world-pixel bounding rectangle：

```text
originX/originY = minimum world pixel
width/height    = exact covered tile rectangle
backing scale   = 1
zIndex          = tileStackValue(depth)
```

placement：

```js
canvas.style.left = `${originX}px`;
canvas.style.top = `${originY}px`;
canvas.style.transform = `translate3d(${-cameraX}px, ${-cameraY}px, 0)`;
```

不得给包住所有 depth canvas 的共同 ancestor 设置 transform，以免共同 stacking context破坏 tile/player交错 z-index。

### 9.3 Window refresh

同 scene refresh：

1. exact validate new chunks；
2. coordinate diff得到 retained/entering/leaving；
3. retained chunk复用 prepared instructions；entering只 prepare一次；
4. 为每 depth计算新 bounds并建立 detached blank backing；
5. 从旧 backing复制 world-bounds overlap；
6. 只 raster entering chunk instructions；
7. 按 current autotile frame修正 retained overlap中过期 animated cells；
8. scene/presentation/currentness检查通过后替换 live layer集合；
9. leaving prepared state与不可见 layer立即丢弃。

Browser状态上限就是 current window。仍 retained 的 `(sceneRevision,chunkX,chunkY)` 若 cells与已接受内容不一致，fail closed；evicted后重新进入重新验证，不保留历史 fingerprint。

### 9.4 Animated autotile dirty cells

prepared state为 animated slot保留：

```text
slot → depth → world cell → canonical ordered draw instructions
```

frame tick：

- frame index未变：0 raster；
- slot变化：只收集该 slot cells；
- 每 `(depth,cell)` clear `32×32`；
- 按原 canonical order重画该 cell/depth全部 instructions；
- 多 slot同 tick命中同 cell先去重；
- single-frame autotile不保持永久 rAF。

### 9.5 Invalidation invariants

```text
camera/motion placement change
  MUST NOT invalidate tile raster

autotile frame change
  MUST NOT rebuild camera motion timeline

same sprite resource + direction + effective pattern
  MUST reuse sprite raster

sprite position/depth change
  MUST NOT resize/clear/redraw same crop
```

不冻结 `rasterToken` / `placementToken` 变量或 cache class shape。

---

## 10. Atomic presentation commit

`presentationRevision` 用于 chunk refresh、viewport commit、scene transfer。

MapView收到更高 revision data：

```text
validate
→ prepare/decode
→ detached raster
→ latest data + scene + revision + connected/currentness checks
→ commit live presentation
→ mark revision accepted locally
```

MapSprite private gate：

```text
sprite.presentationRevision < parent accepted → stale, drop
sprite.presentationRevision > parent accepted → latest pending, do not paint
sprite.presentationRevision = parent accepted → paint/update placement
```

Browser `accepted revision` 只是 business WC private physical-realization cursor，不是 Renderer Store/currentness authority、不是 ACK、不是 Render revision、不可反馈 Runtime。

viewport commit顺序：

1. validate data；
2. prepare/reuse same-scene resources；
3. detached raster；
4. latest/scene/presentation/currentness checks；
5. 同步设置 host/stage accepted width/height；
6. replace live layers；
7. accept presentationRevision；
8. place camera；
9. flush already-managed direct sprite pending data。

MapView↔MapSprite private coordination不得 create/remove/reparent/reorder LoomRealm-managed light-DOM node，不得改 managed attrs/data，不得形成 Window-global component registry，不得 reverse-sync Store。

失败保留上一 accepted stage/layers/player，不先 clear live canvas。**same-generation Data reconnect不是 receiver retry trigger**：M13相同 HTMLElement + structurally equal RenderData不会因 reconnect自动重发。临时 resource/raster failure若要重试，只能由 business WC 对已经交付的 value 做 Window-local private retry，或等待 structurally different data / fresh Window；不得依赖 reconnect。

---

## 11. CSS 与大屏策略

`game-libs/map/browser/map.css` 不再写死 `640×480`：

```css
lr-map-view {
  display: block;
  position: relative;
  overflow: hidden;
  image-rendering: pixelated;
}
```

`examples/essentials-v21.1-local/presentation.css` 保持首帧 `640×480` fallback与居中；首份 accepted RenderData后由 MapView inline width/height成为 live size。超过 `1920×1080` 时 map Runtime cap保持最大 accepted size，外部自然 letterbox。

本轮不把 canvas backing乘 DPR。DPR不影响 camera、collision、visible tile或 logical viewport；DPR变化不得改变 backing pixel总数。

---

## 12. 文件与契约范围

### 12.1 Core capability production

允许并预期涉及：

```text
packages/data/**
packages/renderer/**
packages/subsystem/**
packages/main/**                  # 仅 profile selection/policy 如当前实现需要
packages/platform-ports/**        # 仅现有 Data binding typing 如 v2 support需要
apps/desktop/**                   # RendererViewportSource physical realization/composition
```

Core reopen严格限定为：

```text
Viewport State v1
Renderer Data Profile v2
Renderer viewport physical-source seam
SubsystemScope.viewport readonly author projection
profile-v2 selection/installation support
```

不得顺带修改 Frame/Input/Render/Content semantics。

候选 formal docs在 Core closure时 materialize：

```text
doc/15-contracts/viewport-state-v1.md
doc/15-contracts/renderer-data-profile-v2.md
matching conformance profile / ADR as governance requires
```

现有 `renderer-data-profile-v1.md`、`user-input-v1.md`、`render-update-v1.md` 保持原 frozen semantics。

### 12.2 Map production

```text
game-libs/map/src/semantics.ts
game-libs/map/src/runtime.ts
game-libs/map/browser/map.browser.js
game-libs/map/browser/map.css
```

FSDB presentation只能通过既有 sync script从 build output同步，不手工编辑。

### 12.3 Tests

至少覆盖：

```text
packages/data/test/**
packages/renderer/test/**
packages/subsystem/test/**
apps/desktop/test/**
game-libs/map/test/semantics.test.mjs
game-libs/map/test/runtime.test.mjs
game-libs/map/test/package.test.mjs
test/map-layering-browser.test.mjs
test/m14-vertical.test.mjs
test/m15-hostra-product.test.mjs
```

允许新增 map browser performance helper，但必须驱动 production Custom Elements，不复制 raster implementation。

### 12.4 Implementation 后需回写

```text
doc/10-architecture/renderer-subsystem-protocol-layers.md
doc/10-architecture/subsystem-model.md
doc/10-architecture/platform-composition-system.md
M10_03_RENDERER_INPUT_PRODUCERS.md        # 明确 viewport 不属于 Input producer
M14_02_MAP_GAME_LIBRARY.md
M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md
doc/30-implementation/m14-qualification.md
doc/30-implementation/m15-qualification.md
```

该实现产生新的 qualification subject。Core profile/capability变更必须重新证明其影响到的 lower-layer contracts；M14/M15必须按新 subject重跑。

### 12.5 本轮仍禁止

```text
packages/wire/**
packages/fsdb/**
packages/fsdb-http/**
tools/fixtures/essentials-v21.1/import.mjs 及 importer implementation
```

`packages/renderer-control/**` 原则上不需要变化，因为 Control v1 `dataProfile` 已是字符串；若实际实现证明必须改 Control wire/schema，STOP并返回单独 Core design review，不在本 refactor顺带 reopen。

---

## 13. 实施顺序

### PR 0：Core contract closure + baseline seam

在生产行为变更前先关闭：

1. Viewport State v1 exact schema/direction/lifetime/loss/reconnect/failure；
2. Renderer Data Profile v2 composition/versioning，与 v1 coexistence；
3. `SubsystemScope.viewport` exact author surface、immediate convergence、listener failure；
4. non-InputTarget / suspended Frame仍可观察 viewport 的 architecture test model；
5. Desktop/PWA logical CSS-pixel equivalence；
6. Hostra product single-clock measurement seam；
7. 640/720/1080现状 payload与 `RenderDomain.update()` residual基线。

Freeze前必须证明没有必要修改 User Input v1、Render Update v1、Main Control v1。

### PR 1：Core Viewport capability

1. `packages/data` 加 Viewport State v1 + Profile v2，v1行为/fixtures保持全绿；
2. Renderer加 narrow viewport source/publication mechanics；
3. Subsystem Host加 retained viewport state + `scope.viewport`；
4. Data loss/reconnect/fresh generation/profile replacement语义闭合；
5. Desktop physical source读取 Window CSS size，不进入 input source；
6. 只证明 capability，不改 map动态 viewport。

### PR 2：固定 640×480，闭合地图性能模型

1. `semantics.ts` 增加 `tileVisuals` 与 8×8 chunk projector；
2. Runtime改为 current ProjectionWindow reuse；
3. RenderData切换 `tileVisuals+chunks`；
4. Browser建 current-window prepared state与 world-space depth backing；
5. overlap pixel copy + entering-only raster；
6. dirty-cell autotile；
7. sprite raster/placement separation；
8. 证明 640×480 pixel/layering baseline相同并通过 refresh gate；
9. 删除 production旧逐-tile projection path。

本 PR 可使用 `scope.viewport` 但 map policy仍固定 640×480，用于隔离 Core capability与动态 layout风险。

### PR 3：动态 viewport + presentation revision

1. Map Runtime订阅 `scope.viewport`，不创建 Input listener；
2. 参数化 camera/bounds；
3. accepted/pending viewport + 100ms settle；
4. `sceneRevision/presentationRevision`；
5. chunk refresh、viewport commit、transfer按 §8 publication；
6. Browser按 §10 atomic presentation gate；
7. MapView commit inline host/stage size；
8. 同步 build output与 local FSDB presentation。

### PR 4：qualification 与规范回写

- 完成 §14矩阵；
- 三轮性能采样；
- materialize/finalize Viewport/Profile v2 formal docs与架构 docs；
- 更新 M10/M14/M15 与 M14/M15 qualification；
- 删除未被 gate使用的临时 hook；
- 不在 qualification PR追加新的优化策略。

---

## 14. 测试矩阵

### 14.1 Core Viewport capability

必须覆盖：

- Runtime创建时 `viewport.current === null`；
- `subscribe()` 同步交付一次 current，包括 null；
- first baseline更新 current并通知；same value不重复通知；
- listener throw/reject不影响其它 listener、Data或Runtime；unsubscribe idempotent；
- Data loss保留 last viewport，不发 null；
- fresh carrier必须 fresh baseline；equal baseline不通知、different baseline通知；
- malformed `viewport.state` protocol-fatal仅 retire Data；
- Profile v1对 `viewport.state`仍 protocol-invalid，不能偷偷扩展；
- Profile v2 Input/Render observable semantics与 v1对应 child contract相同；
- profile v1→v2需要 fresh DataAuthority generation；
- suspended/non-top map Frame仍可收到 `scope.viewport` change；InputTarget属于 child时 map viewport照常收敛；
- viewport callback不要求 Input Interest/Activation；
- Desktop blur/focus不清 viewport；resize rAF coalesce；zero sample不覆盖；DPR不进入 sample；stop cleanup。

### 14.2 Map semantics / Runtime

尺寸：

```text
320×240
640×480
800×600
960×540
1280×720
1920×1080
```

覆盖：

- null viewport使用 640×480 default；first legal observed value收敛；
- 小 map camera 0、四边 clamp、odd viewport、inclusive `-1` bounds、source/target union；
- chunk edge zero padding、192-cell index/order、tileVisual regular/autotile/priority；
- retained chunk object reused；entering once；leaving dropped；evicted re-enter可重新 project；
- later viewport 100ms trailing、latest pending wins、same size no commit；
- walking boundary viewport commit；suspended standing map可 viewport commit；
- ordinary retained movement no chunks/revision；
- chunk refresh increments presentationRevision并更新 View/Sprite；
- transfer increments sceneRevision+presentationRevision并 full replace；
- budget rejection preserves accepted state；abort/late timer inert；
- collision/contact/edge/step transfer/reconnect行为不变。

### 14.3 Browser correctness

- exact keys/revisions/chunk/tileVisual invalid fail closed；
- retained same chunk identity mutation fail closed；evicted re-enter不要求历史 fingerprint；
- 640×480 pixel oracle相等；所有 supported viewport四边无缝；
- priority0/1..5、tall sprite、equal-depth layering；
- resize standing/walking/autotile active无 blank；
- rapid A→B→C只提交 latest accepted presentation revision；
- chunk refresh期间 Sprite不超前于 parent accepted presentationRevision；
- transfer prepare与 resize/旧 async交错时旧 scene不覆盖新 scene；
- same-generation reconnect本身不被当作 receiver retry trigger；
- DPR `1/1.5/2` logical coverage相同且 backing pixel count不随 DPR增长。

### 14.4 Work invariants

```text
120 camera placement samples after prepare
→ chunk validation 0
→ full tile traversal 0
→ tile drawImage 0 when autotile frame unchanged
→ canvas width/height assignment 0
→ layer placement > 0
```

```text
autotile frame unchanged → drawImage 0
one slot changes          → only affected cells/depth redraw
```

```text
chunk refresh
→ retained semantic projection 0
→ overlap pixels copied
→ entering chunks prepared/rastered once
→ leaving prepared state dropped
→ Browser prepared state bounded by current window
```

### 14.5 Product scenarios

真实 `[FSDB]Essentials v21.1`：

```text
Map066 resize
Map066→Map002 camera-follow long path
Map002 Flowers1 + walking + resize
Map066↔Map067 transfer
map → child menu/dialog Frame while map remains visible → resize → map viewport converges
Data reconnect
rapid 640→720p→1080p→640
window > cap → letterbox
```

---

## 15. 性能与容量 Gates

### 15.1 Canonical measurement seam

跨进程 `performance.now()` 不得直接相减。

正式 product latency gate使用 **Hostra product harness单一 monotonic clock domain**：同一 harness process记录 stimulus dispatch与“目标 presentation 已被 Browser observation hook确认 paint/commit”时刻。Browser/Runtime内部时间戳只做局部诊断。

PR0重新记录 ordinary/refresh baseline；若历史 `42.9/96.3ms` 使用不同 seam，只作历史证据。

采样：release-like build；记录 commit、Node/Electron/Chromium、CPU/GPU、DPR、viewport、map/position；cold/warm分开；每档三轮报告每轮及合并 P50/P95/max；ordinary/chunk refresh/autotile分桶；禁止只报最佳值。

### 15.2 必过指标

| 指标 | 640×480 | 1280×720 | 1920×1080 |
|---|---:|---:|---:|
| ordinary movement Hostra stimulus→paint-observed P95 | `≤50ms` | `≤50ms` | `≤50ms` |
| chunk refresh Hostra stimulus→paint-observed P95 | `≤50ms` | `≤75ms` | `≤100ms` |
| active movement `>33.4ms` frame ratio | `<1%` | `<1%` | `<2%` |
| complete visual step drop | `0` | `0` | `0` |
| camera-only tile drawImage/rAF | `0` | `0` | `0` |
| map node data bytes | `<196,608` | `<196,608` | `<196,608` |

此外：

- Viewport State source→Subsystem retained callback local latency单独记录，但不与跨进程 Browser时钟相减；
- Map002 640×480 refresh在 canonical seam下 `≤50ms`；
- dense synthetic 1920×1080 fixture通过 payload guard；
- backing pixel总数必须报告，DPR改变不得改变 backing pixel总数；
- idle且无 animated autotile时无常驻 rAF。

若 dense 1080p无法满足 `196,608 B`，STOP。可评审 package-private tuple编码；不得提高 framework limit、删除 validation、引入 Content MapVisualChunk或降低 viewport cap。

---

## 16. 已知 residual：RenderDomain full-state validation

本设计**会**为了 Viewport capability进入 `packages/subsystem`，但这不授权修改冻结的 `RenderDomain.update()` validation invariant。

ordinary camera/player小 patch仍可能触发 Core对最终完整 node data的 validation / snapshot representability probe，其成本可能随稳定 `chunks+tileVisuals` 字节增长。

PR0/PR2必须在 640×480、1280×720、1920×1080 payload上单独测：

```text
若 Browser/raster work invariant已满足，
但 RenderDomain full-state validation单独导致 §15 gate失败：
  STOP
  保存 profile / payload bytes / latency evidence
  返回独立 Render Core design review
```

禁止借本次 Viewport Core reopen顺带跳过 validation、增加 map-specific fast path或绕开 RenderDomain。

---

## 17. 风险与明确拒绝的抽象

主要风险：

```text
Profile v1/v2 semantic drift
viewport currentness被错误绑到 InputTarget/focus
fresh-carrier viewport baseline缺失
chunk tuple/index错误
overlap copy残留 leaving pixels
animated overlap stale frame
resize/motion/transfer交错
dense payload超预算
canvas memory
presentation retry错误依赖 reconnect
```

拒绝：

- `x.loomrealm.viewport.state` 或任何 User Input viewport channel；
- 修改 User Input v1让某 custom state绕过 InputTarget；
- 原地扩展 Frozen `loomrealm.renderer-data/1`；
- Main viewport authority / Main保存 Window size；
- public `Environment`, `ViewportManager`, `DisplayManager`, service locator；
- 把 DPR/focus/visibility/orientation/safe-area一起塞进第一版 Viewport API；
- camera rAF继续 full raster，仅靠 throttle；
- full `VisibleTile[]` 提高 limit；
- chunk Render node / `<lr-map-chunk>` / Content MapVisualChunk；
- LoadedMap-wide或无界历史 chunk/raster cache；
- Browser读取 Map/Tileset record；
- Renderer/Data/Subsystem map-specific fast path；
- 为 resize建 ACK/event command queue；
- 把 `rasterToken/placementToken` 或 cache class shape提升为 contract；
- DPR乘所有 layer backing；
- resize/refresh先 clear live canvas再 async prepare；
- 关 autotile、减少 layer、修改 zIndex语义换性能。

允许并需要的核心概念：

```text
Viewport State v1
Renderer Data Profile v2
SubsystemScope.viewport
Map accepted/pending ViewportSize
ProjectedChunk + TileVisual
current ProjectionWindow
sceneRevision + presentationRevision
Browser current-window prepared state + world raster
```

---

## 18. 完成定义与 Freeze Gate

### Implementation Complete

- Viewport State v1 / Data Profile v2 / `SubsystemScope.viewport` production+conformance落地；
- Profile v1完整 regression全绿；
- non-top/suspended Frame viewport场景通过；
- PR2/PR3 map production与 unit/browser tests落地；
- fixed `640/480/304/224/639/479` 不再散落 production camera/paint path；
- camera-only rAF零 tile raster；
- chunk refresh overlap reuse + entering-only raster；
- autotile dirty-cell；sprite raster/placement separation；
- `320×240` 至 `1920×1080` matrix全绿。

### Product Closed

- §14 product scenarios通过；
- §15三轮 metrics与raw results归档；
- source/dist/FSDB presentation hash一致；
- resize/refresh/transfer/reconnect无 blank/ghost/stale layer；
- M14 exact-local prerequisite正式解决，不把旧 blocker混入本 subject“通过”。

### Governance Closed

- Viewport State v1 + Renderer Data Profile v2 formal contract/ADR/conformance已落盘；
- protocol-layers/subsystem/platform architecture回写；
- M10明确 viewport 不属于 Input；M14/M15与 qualification回写到 current subject；
- 本文更新为 `Implemented / Qualified` 或被正式文档取代并标明 superseded；
- 无临时 public API、无 production双轨 viewport path、无未使用 manager/cache abstraction。

### Freeze 前必须 PASS

- [ ] 明确证明 User Input viewport 被否决，非顶层/suspended Frame仍能观察 viewport；
- [ ] Frozen `renderer-data/1` 不变，Profile v2 versioning / fresh generation / coexistence闭合；
- [ ] `SubsystemScope.viewport` lifetime、null/retained/loss/reconnect/subscribe semantics有 exact tests；
- [ ] Main Control v1无需 reopen；Main不拥有 viewport value；
- [ ] Desktop/PWA logical CSS-pixel semantics一致，DPR/focus不进入 capability；
- [ ] `sceneRevision/presentationRevision` publication与 Browser gate tests一一对应；
- [ ] Runtime cache只 bounded by current ProjectionWindow；Browser prepared/raster只 bounded by current window；
- [ ] `8×8`、overscan `1`、viewport cap、100ms settle、196KiB guard单一一致；
- [ ] dense 1080p exact RenderData fit已证明；
- [ ] canonical Hostra single-clock measurement seam已证明；
- [ ] RenderDomain full-state validation residual已测；
- [ ] 当前 baseline map/layering/Desktop/local presentation gates通过；
- [ ] 不需要 Wire/FSDB/importer变更。

全部 PASS 后才可改为：

```text
状态：Frozen for implementation
基线提交：<重新核对后的 production SHA>
```

Freeze后执行 agent无权把 viewport重新塞回 Input、原地修改 Profile v1、扩大 Viewport API为 Environment service locator、改变 chunk size/overscan/viewport cap/settle/payload guard/RenderData shape，或用降画质/关动画/放宽校验通过性能 gate。

遇到合同与代码不符、Profile v2需要 Control v1 wire变更、dense 1080p超预算、Render Core residual单独导致 gate失败或必须修改 §12.5 禁止范围时，停止、记录最小复现与测量证据并返回设计评审。
