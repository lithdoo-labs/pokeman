# PokeMan / RPGMap v1.1 — Motion Responsiveness, Incremental Projection, Atomic Scene Presentation

> 路径：`examples/PokeMan/doc/75-map-presentation-v1.1.md`
>
> 状态：**Design frozen / implementation-ready after merge**
>
> 关联 Issue：
>
> - #123 — RPGMap: make direction changes feel responsive during an active walk step
> - #124 — RPGMap Presentation: eliminate periodic stutter when projection window refreshes
> - #125 — RPGMap Presentation: keep old NPC visuals until map transfer commits atomically
>
> 本文只冻结以上三个问题的 Map v1.1 设计、职责边界、实施顺序和验收标准。未被本文明确覆盖的 RPGMap movement、terrain、transfer、content、Render ABI 与 PokeMan gameplay contract 保持现状。

---

## 1. Problem statement

真实 PokeMan 产品路径暴露了三个彼此相关但根因不同的问题：

1. **方向切换响应慢**
   - 一次 walk step 固定为 250ms。
   - active step 中新的 directional intent 只更新 `moveIntent`。
   - rendered facing 要等 `finishStep()` 后下一步开始才变化。
   - 用户可感知接近一个完整 step 的方向响应延迟。

2. **大地图连续移动存在周期性卡顿**
   - 当前 Runtime 使用 bounded projection window，并带四 tile prefetch margin。
   - 普通移动留在当前 window 内时走 lightweight camera/motion path。
   - 穿过 projection coverage 边界时会产生新的 tile payload / `visualEpoch`。
   - Browser Presentation 为新的 projection 重建 detached tile layer canvases，复制 overlap 后重新 raster dirty cells，再整体提交。
   - 用户因此感知为“顺几步 → 卡一下 → 再顺几步”。

3. **地图切换时 NPC 先消失，地图稍后才切换**
   - Runtime 已经先准备 target Map、NPC definition/resource 和完整 target RenderState，再 `replaceDomain()`，逻辑上是原子的。
   - 但 Browser Presentation 的 tile pixels 由 `lr-map-view` 自己 retained，而 NPC pixels 直接依赖 WebProjector 管理的 canonical `lr-map-sprite` DOM。
   - target reconcile 时旧 NPC canonical node 可先被移除；旧 tile canvas 仍作为 accepted pixels 保留到异步 target prepare 完成。
   - 因而出现“旧地图仍在，但 NPC 已先消失”的 hybrid frame。

这三个问题不能通过三个独立 workaround 修复。v1.1 必须统一回答：

- logical movement authority 是谁；
- active movement trajectory 与 latest facing intent 是否相同事实；
- 谁拥有已经显示在屏幕上的 Map visual scene；
- projection window 改变是否等价于重建视觉 surface；
- canonical Render Tree 的变化何时允许改变 visible pixels。

---

## 2. Design objective

v1.1 的统一目标：

> **Runtime 保持逻辑移动和场景事实的 authority；Map Presentation 独立拥有完整的 accepted visual scene；同 scene movement 使用 persistent/incremental surfaces；跨 scene change 使用 staging → atomic promote；active movement trajectory 与 mutable facing intent 解耦。**

目标状态：

```text
INPUT
  ↓
moveIntent
  ↓
RPGMap Runtime
├─ logical map / x / y
├─ immutable activeMove trajectory
│  └─ travelDirection
├─ mutable facingDirection
├─ transfer authority
├─ NPC desired state
└─ projection-window facts
  ↓
desired Render Tree
  ↓
Map Browser Presentation
├─ acceptedVisualScene
│  ├─ sceneEpoch
│  ├─ projection window
│  ├─ persistent tile surfaces
│  ├─ player visual
│  ├─ NPC visuals
│  └─ accepted resources
│
└─ stagingVisualScene
   └─ exists only while preparing a replacement scene
  ↓
VISIBLE PIXELS
```

核心 invariants：

```text
same scene movement
→ acceptedVisualScene identity remains stable

projection-window shift
→ acceptedVisualScene remains stable
→ surfaces update incrementally

facing change during active move
→ activeMove trajectory and travelDirection remain stable
→ facingDirection may update immediately

map transfer
→ old acceptedVisualScene remains complete
→ target stagingVisualScene prepares
→ one atomic promote when complete
```

---

## 3. Authority boundaries

### 3.1 Runtime authority

RPGMap Runtime 继续拥有：

```text
current map identity
logical player x / y
activeMove trajectory / travelDirection
moveIntent
facingDirection
collision / passability
MapTransfer semantics
terrain behavior
bridgeLevel
NPC desired scene state
projection-window desired data
sceneEpoch / visualEpoch / motionId semantics
```

Runtime 不负责：

```text
canvas allocation
pixel retention
visual-scene double buffering
resource bitmap ownership inside Browser Presentation
DOM retention workaround
frame scheduling policy beyond existing Render facts
```

### 3.2 Presentation authority

Map Browser Presentation 负责：

```text
accepted visual scene
staging target scene
decoded image / bitmap ownership
persistent tile surfaces
incremental projection raster
visible player/NPC surfaces
scene-level atomic visual commit
RAF interpolation
autotile visual scheduling
```

Presentation 不得反向决定：

```text
logical x / y
collision
transfer target
NPC gameplay state
Runtime move intent
sceneEpoch semantics
```

### 3.3 Renderer boundary

`packages/renderer` / WebProjector 继续拥有 canonical Render Tree reconcile。

v1.1 **不得通过 WebProjector 特判 Map tags** 来修复 NPC continuity。

禁止：

```text
if tag === "lr-map-sprite" then delay remove
Map-specific grace timer in WebProjector
Renderer-level scene transaction only for Map
Map-specific DOM cloning in projector
```

如果实现证明 Browser Presentation 无法在现有 canonical node lifecycle 下持有 accepted visual snapshot，必须先提交独立 framework evidence/design；不得在本改造中静默扩大边界。

---

## 4. Frozen state model


### 4.1 Runtime movement facts

v1.1 明确区分：

```text
moveIntent
activeMove
activeMove.travelDirection
facingDirection
```

定义：

```text
moveIntent
= latest directional gameplay intent, or null

activeMove
= immutable logical/visual trajectory of the current committed grid step

activeMove.travelDirection
= immutable direction actually used to plan and commit the current grid step

facingDirection
= current player-facing direction exposed to Presentation
```

`activeMove` 一旦开始，以下 trajectory facts 不得因新的 input 在中途改变：

```text
id
kind
durationMs
fromX / fromY
target logical x / y
travelDirection
fromScreenX / fromScreenY
jump parameters when applicable
camera trajectory for that step
```

`facingDirection` 可在 active step 中响应新的 directional intent，但不得反向改变当前 step 的 logical trajectory、transfer attempted direction 或 collision plan。

冻结语义：

```text
current step movement / step-transfer attemptedDirection
→ activeMove.travelDirection

player visual facing
→ facingDirection

next step planning
→ latest moveIntent
```

例如：

```text
activeMove:
  (10,8) → (10,9)
  travelDirection = down

mid-step:
  moveIntent = right
  facingDirection = right

current step:
  still finishes down

step transfer at completion:
  attemptedDirection = down

next movement opportunity:
  plan from latest moveIntent = right
```

`MapSnapshot.player.direction` 继续表示当前 player facing，即 `facingDirection`；`travelDirection` 保持 Runtime-private trajectory fact，不新增 public snapshot 字段，也不要求新增 generic Render ABI 字段。

### 4.2 Presentation scene facts

Map Presentation 至少维护以下 private conceptual state：

```text
acceptedVisualScene: VisualScene | null
stagingVisualScene: VisualScene | null
desiredSceneEpoch: number | null
```

`VisualScene` 概念上包括：

```text
sceneEpoch
visualEpoch baseline
map/resource identity
geometry
projection window
persistent-but-bounded depth surfaces
player visual
NPC visual snapshots
accepted resource identities
autotile state
```

这是 Presentation-private state，不是 public Render ABI。

### 4.3 Accepted scene rule

屏幕上任何时刻只能存在一个 authoritative accepted scene。

```text
acceptedVisualScene
= last complete scene successfully promoted to visible pixels
```

canonical Render Tree 变化、target resources 到达、staging scene 创建都不能单独改变这一事实。


### 4.4 Staging scene rule

只有 **scene replacement** 才建立新的 staging scene。

典型条件：

```text
incoming sceneEpoch != acceptedVisualScene.sceneEpoch
```

staging scene 的 identity 由目标 `sceneEpoch` 决定，而不是由每一条 Render revision 决定。

同一个 target scene 在 prepare 期间继续收到新的 desired revision 时：

```text
same staging sceneEpoch
→ coalesce into the existing stagingVisualScene
→ advance latest desired revision
→ preserve already-valid decoded resources / surfaces when identities remain valid
→ do not restart the whole scene merely because visualEpoch/motion/facing changed
```

这条规则用于避免 held movement 或连续 Render updates 造成 staging starvation。

staging scene 必须在 offscreen/private surfaces 中具备可提交的完整 target visual：

```text
target tile resources
target bounded reusable depth surfaces
target player visual
complete target NPC visual set for the latest coherent revision
required geometry
first valid paint state
```

任何一项未完成都不得 promote。

### 4.5 Runtime commit vs Presentation promote

Runtime 的 target scene commit 和 Presentation 的 visual promote 是两个不同 authority：

```text
Runtime replaceDomain(target)
→ target logical scene is authoritative

Presentation promoteVisualScene(target)
→ target pixels become authoritative
```

因此 target prepare 期间允许暂时存在：

```text
Runtime logical scene = B
acceptedVisualScene = A
stagingVisualScene = B
```

这是有意的 visual-lag boundary，不得通过 Presentation 回滚 Runtime 来消除。

如果 target staging 在 Browser Presentation 层失败：

- 不新增 Presentation → Runtime ACK/FAIL ABI；
- 不回滚 Runtime logical scene；
- old accepted pixels 可继续作为 last-good visual fallback；
- Presentation 必须进入明确的 failed visual state，并继续遵守其 bounded retry policy；
- 后续同 `sceneEpoch` 的有效 desired revision 可以继续合并到同一 staging acquisition opportunity；
- retry exhausted 后不得把 old pixels 宣称为当前 logical scene。

如果实现发现现有 Presentation failure surface 无法表达这一状态，应在 Map Browser Presentation 内补齐明确 failed-state contract；不得为此修改 generic Frame/Render ABI。

---

## 5. Issue #125 — Atomic map-transfer visual scene

### 5.1 Existing defect

当前视觉 lifecycle 实际上是：

```text
old tile canvases
→ owned/retained by lr-map-view

old NPC visual
→ owned by canonical lr-map-sprite node

target Render Tree reconcile
→ old NPC node removed
→ old tile canvases still visible
→ target _prepare() async
→ target _commitAtomic()
```

所以“Runtime atomic replace”不等于“pixel atomic replace”。

### 5.2 v1.1 rule: lr-map-view owns committed sprite pixels

v1.1 后，canonical `lr-map-sprite` 仍然保留：

- canonical tag；
- RenderData validation；
- desired sprite facts；
- resource reference input；
- parent coordination seam。

但 canonical sprite element **不得再是 accepted scene pixels 的唯一 owner**。

`lr-map-view` 必须能够在 canonical old sprite node 被移除后，仍保留 old accepted sprite pixels，直到 scene promote。

可接受实现包括：

- view-owned sprite canvas snapshot；
- view-owned sprite visual object/surface；
- equivalent retained render surface。

不冻结具体 class/name，但冻结 ownership：

```text
canonical sprite
→ desired input

accepted sprite visual
→ owned by lr-map-view acceptedVisualScene
```

### 5.3 Transfer transaction

目标 transfer 视觉流程：

```text
T0
accepted scene A visible
├─ A tiles
├─ A player
└─ A NPCs

T1
canonical desired scene changes to B

T2
staging B starts
accepted A remains visually unchanged

T3
B resources + tiles + player + NPCs ready

T4
promoteVisualScene(B)

T5
visible scene is B
├─ B tiles
├─ B player
└─ B NPCs

release visual resources owned only by A
```

T1–T4 期间不允许任何 hybrid：

```text
A tiles + missing A NPC
A tiles + B NPC
B tiles + A NPC
B tiles + partial B NPC set
```


### 5.4 Transfer / staging failure

分两类：

#### Runtime target preparation fails before `replaceDomain()`

```text
Runtime remains on scene A
acceptedVisualScene A remains complete
```

继续使用既有 Runtime transfer failure policy。

#### Runtime has committed B, but Browser staging B fails

```text
Runtime logical scene = B
acceptedVisualScene = A (last-good pixels only)
stagingVisualScene = B failed/retrying
```

此时：

- 不回滚 Runtime；
- 不新增 Render acknowledgement；
- 不先破坏 A；
- Presentation failed/retry state 必须可观察；
- 如果同一 B scene 后续 revision 到来，按 §4.4 coalescing 规则处理；
- 只有完整 coherent B scene 可 promote。

这条 contract 明确避免把 Browser resource/raster failure 错误解释为“Runtime 仍然处于 A”。


### 5.5 Canonical node removal

old canonical sprite disconnected 时：

- 可以停止继续接收该 canonical element 的 desired updates；
- 不得立即释放 accepted scene 仍引用的 bitmap/surface；
- resource release 必须遵守 visual-scene ownership；
- 最后一个 visual/resource owner 消失后才能真正 close/release。

不得使用固定毫秒数 retention timer。

### 5.6 Same-scene NPC revisions

RPGMap 已支持在 `sceneEpoch` 不变时通过 `setNPC(...)` 改变 NPC desired state，因此 v1.1 必须显式支持：

```text
same scene
→ NPC add
→ NPC remove
→ NPC position change
→ NPC direction/pattern change
→ npcId / sprite resource replacement
```

这些不是 scene replacement，也不能要求重新 staging 整张地图。

处理规则：

```text
same sceneEpoch
→ acceptedVisualScene remains the same scene
→ prepare only changed sprite visuals/resources
→ atomically patch the accepted sprite set for one coherent desired revision
→ tile surfaces remain untouched
```

如果某个 changed NPC resource 尚未 ready：

- 旧 accepted sprite set 保持完整；
- 不允许先移除旧 sprite 再等待 replacement；
- changed sprite patch ready 后再一次提交；
- unrelated player/tile/projection updates 继续按其各自 update class 处理。

因此 `stagingVisualScene` 仍只用于 **sceneEpoch replacement**；same-scene NPC changes 使用 bounded same-scene visual revision，不创建第二个 full-scene staging state。

---

## 6. Issue #124 — Persistent incremental projection


### 6.1 Keep the projection-window model and expose exact bounds

v1.1 不删除：

- bounded viewport projection；
- prefetch margin；
- `VIEW_DATA_GUARD`；
- Runtime-owned tile selection；
- `visualEpoch` 更新。

当前四 tile prefetch margin 可以继续作为首选 margin，但 Runtime 仍可因 projection byte guard 降级到更小 margin。

禁止把 margin 调大作为主修复。

Browser incremental projection **不得从 sparse `tiles[]` 反推 projection rectangle**。空白 cells、不同 depth 和动态 margin 会让这种推导不可靠。

因此 Map-specific Runtime → Browser RenderData 必须提供精确的 projection bounds，例如概念 shape：

```text
projectionBounds = {
  minTileX,
  minTileY,
  maxTileX,
  maxTileY
}
```

具体字段命名可在实现中保持与现有 Map data schema 风格一致，但以下 contract 冻结：

- bounds 直接沿用现有 `TileProjectionBounds` 语义：`minTileX/minTileY/maxTileX/maxTileY` **全部为 inclusive tile indices**；
- bounds 必须与 Runtime 实际选中的 `TileProjectionWindow.bounds` 完全一致；
- Browser 用 bounds 计算 entering / leaving / overlap region；
- `tiles[]` 只表达该 bounds 内实际 projected tile tuples，不承担 rectangle identity。

这是 **RPGMap 自己的 RenderData schema 演进**，不属于 generic Render ABI 变化，不需要修改 `packages/renderer`。

### 6.2 Window change is not scene replacement

同一 `sceneEpoch` 中：

```text
projection window A
→ projection window B
```

必须解释为：

```text
same acceptedVisualScene
+ projection-window shift
```

而不是：

```text
new visual scene
```

因此不应触发完整 scene staging/promotion。


### 6.3 Persistent but bounded depth surfaces

同一 scene 中，应持有可复用的 depth surfaces：

```text
acceptedVisualScene.depthSurfaces
├─ active surfaces required by current projection
└─ small bounded reusable pool
```

这里：

```text
persistent
!= immortal
```

tile visual depth 可随 world y / priority 变化，因此 surface 不能“见过一次就保留到 scene close”。

projection shift 不应反复：

```text
document.createElement("canvas")
canvas.width = ...
canvas.height = ...
replace old canvas
```

正常窗口滚动目标：

```text
keep/reuse active surface allocations
→ reuse overlapping pixels/cells
→ clear leaving region
→ raster entering strips / dirty cells
→ update world origin
→ recycle surfaces whose depth band is no longer needed
```

允许 ring buffer、fixed overscan surface、double-buffered persistent surfaces、bounded surface pool 或等价策略，只要满足：

```text
live surface count
→ bounded by current projection needs + fixed small reuse budget

memory
→ does not grow with total traversal distance
```

禁止用“整个 scene lifetime 永不释放 depth canvas”的方式换取 allocation counter 好看。

### 6.4 Dirty work proportionality

设 old/new projection overlap 很大，则 refresh 工作量应与变化区域近似成比例：

```text
dirty work ∝ entering/leaving tiles
```

不得仍近似：

```text
dirty work ∝ entire projected window
```

### 6.5 Autotiles

animated autotile frame 变化仍允许 dirty redraw。

但是：

- autotile tick 不应导致 unrelated surface allocation；
- projection shift 与 autotile tick 组合时不能重复 full raster；
- same-cell tile stack ordering 必须保持；
- frame state 与 resource identity 必须保持正确。

### 6.6 Performance counters / qualification

现有：

```text
_tileResizeCount
_cameraOnlyCommits
```

可保留或替换为更明确 private qualification counters，例如：

```text
surfaceAllocations
surfaceResizes
fullRasterPasses
dirtyCellDraws
projectionShifts
cameraOnlyCommits
```

名称不构成 ABI。

必须能证明：

```text
long same-scene walk
→ projectionShifts grows
→ surfaceAllocations does NOT grow linearly with projectionShifts
→ fullRasterPasses does NOT grow linearly with projectionShifts
→ liveSurfaceCount remains bounded
→ memory/surface ownership does NOT grow with total traversal distance
```

---

## 7. Issue #123 — Responsive facing without mid-step replanning

### 7.1 Do not re-plan active movement

方向切换时，不允许中途改变当前 grid trajectory。

例：

```text
activeMove:
(10,8) → (10,9), down

mid-step input:
right
```

current movement 仍完成：

```text
(10,8) → (10,9)
```

不得改成 diagonal、折线或回滚 logical x/y。


### 7.2 Facing may update immediately

active step 中收到不同 directional intent：

```text
moveIntent = right
facingDirection = right
activeMove = unchanged
activeMove.travelDirection = unchanged
```

Runtime 应发布最小 Render update，使 player facing 可在下一次浏览器 paint 响应。

不得为了 facing update 修改：

```text
sceneEpoch
visualEpoch
motionId
tiles payload
camera target
activeMove id
activeMove.travelDirection
```

当前 step 的 transfer/collision semantics 仍使用 `activeMove.travelDirection`；只有下一次 movement planning 使用 latest `moveIntent`。

### 7.3 Motion fingerprint

当前 Browser motion identity/fingerprint 把 `direction` 包含在不可变 identity 中。

v1.1 必须把 motion identity 限定为 trajectory facts。

原则：

```text
motion identity
= immutable trajectory

direction
= mutable presentation-facing fact
```

因此同一个 `motionId` 内仅 direction 改变不得抛出：

```text
Invalid map motion identity
```


### 7.4 Step completion and transfer authority

current step complete 时：

```text
finishStep()
→ if this completed tile triggers step transfer:
     attemptedDirection = activeMove.travelDirection
→ otherwise read latest moveIntent
→ collision / contact / edge / NPC occupancy / terrain planning
→ start next activeMove if valid
```

`facingDirection` 不得替代 current step 的 travel direction 去决定 step-transfer fallback。

原有 blocked semantics 保持：

- same-value blocked intent 不得自旋重试；
- neutral → direction 是新的真实 input opportunity；
- changed direction 可触发新的尝试；
- contact/step/edge transfer ordering 不变；
- `targetDirection: null` 的 fallback 必须使用该 transfer contract 原本要求的 attempted travel direction，而不是 mid-step 新 facing。

### 7.5 No speed hack

`WALK_DURATION_MS = 250` 本 issue 默认不改。

若未来产品决定改变 walk speed，应独立评审，不以缩短 duration 代替 responsiveness 修复。

---


## 8. Presentation update taxonomy

为了防止实现继续堆条件分支，v1.1 将 incoming updates 分成三个顶层类别。

### A. Motion / facing-only update

条件示意：

```text
same sceneEpoch
same projection bounds/tiles
same resource identities
trajectory unchanged, or facing-only delta
```

处理：

```text
keep acceptedVisualScene
→ keep persistent surfaces
→ update motion/facing
→ RAF paint
```

### B. Same-scene visual revision

条件：

```text
same sceneEpoch
but visual content/layout membership changed
```

它包括三个明确子类：

#### B1. Projection shift

```text
projectionBounds / tiles changed
→ incrementally shift/update persistent tile surfaces
→ no full-scene staging
```

#### B2. Sprite-set/resource revision

例如：

```text
setNPC add/remove/move
NPC sprite resource identity change
same-scene player/NPC visual resource revision
```

处理：

```text
prepare only affected sprite visuals/resources
→ keep old accepted sprite set complete while preparing
→ atomically patch one coherent sprite-set revision
→ tile surfaces untouched
```

#### B3. Layout/global visual invalidation

例如：

```text
viewport/layout change
bridgeLevel/depth interpretation change
other same-scene facts requiring broad surface invalidation
```

可以 rebuild affected visual surfaces，但：

```text
acceptedVisualScene identity remains
sceneEpoch remains
no target-scene staging transaction
```

### C. Scene replacement

条件：

```text
sceneEpoch changed
```

处理：

```text
keep old acceptedVisualScene
→ create/update stagingVisualScene for target sceneEpoch
→ coalesce newer same-scene target revisions
→ atomic promote only when latest coherent target scene is complete
```

不得通过越来越多 ad-hoc conditions 替代 A / B / C，也不得把所有 `visualEpoch` 变化一律当作 scene replacement。

## 9. Resource ownership

ResourceHost/current resource caching 可演进，但必须符合：

```text
desired canonical node ownership
!= accepted visual ownership
```

资源只能在没有任何 owner 时释放。

可能的 owner：

```text
accepted scene
staging scene
current desired preparation
```

old canonical node disconnect 不足以证明 bitmap 可释放。

跨 scene promote：

```text
promote target
→ target becomes accepted owner
→ old accepted ownership released
→ only then close resources no longer referenced
```

same-scene projection shift 不应反复 release/redecode stable tileset/autotile/sprite resources。

surface/resource ownership 必须 bounded：accepted scene、staging scene、in-flight preparation 与固定上限 reuse pool 之外，不得因历史 traversal/projection revisions 永久累积 owner。

---

## 10. Implementation order — frozen

三个 Issue 不并行实现。顺序冻结为：

### Phase 0 — Design merge

合并本文，使 #123/#124/#125 后续实现共享同一 authority。

### Phase 1 — #125 Atomic visual scene

先建立：

- acceptedVisualScene；
- stagingVisualScene；
- view-owned accepted player/NPC pixels；
- scene-level atomic promote；
- same-scene NPC visual revision；
- same target scene revision coalescing；
- Runtime-commit / Presentation-promote failure boundary。

此阶段重点是 ownership，不做 projection 性能重构。

### Phase 2 — #124 Incremental projection

建立在 Phase 1 的 stable accepted scene 上：

- exact inclusive projectionBounds payload；
- persistent but bounded depth surfaces；
- same-scene projection shift；
- entering/leaving dirty regions；
- bounded allocation/reuse pool；
- traversal-distance memory bound；
- performance qualification。

### Phase 3 — #123 Facing responsiveness

最后修改 Runtime movement contract：

- immutable activeMove + travelDirection；
- mutable facingDirection；
- MapSnapshot.player.direction remains facing；
- facing-only Render update；
- step-transfer attemptedDirection remains travelDirection；
- browser motion fingerprint 去除 direction immutability。

### Phase 4 — Integrated product qualification

在 PokeMan 真实路径联合验证：

```text
responsive turn
+
long large-map walk without periodic hitch
+
multiple transfers without NPC-first disappearance
```

只有 Phase 1–4 都通过，Map v1.1 才算完成。

---

## 11. Required implementation boundaries

预计允许修改：

```text
game-libs/map/src/runtime.ts
game-libs/map/src/semantics.ts          # only if contract/type constants need exact adjustment
Map-private MapView/Sprite RenderData payload shape # projectionBounds / exact RPGMap facts only
game-libs/map/browser/map.browser.js
game-libs/map/browser/map.css           # only if visual-surface layout requires it
game-libs/map/test/*
examples/PokeMan test / real-product qualification
synced Map Presentation artifacts
```

PokeMan `subsystems/map.mjs` 原则上只用于产品 qualification，不应承载 generic workaround。

默认禁止：

```text
packages/renderer
packages/subsystem
packages/main
common-controls
Frame / Call ABI
generic Render ABI
packages/renderer Map-specific lifecycle behavior
PokeMan content topology
MapTransfer content
NPC placement content
Dialogue implementation
```

如果 Phase 实现证明必须跨越默认禁止边界，停止该 Phase，提交证据和独立 design amendment，不静默扩 scope。

---

## 12. Required automated qualification

### 12.1 #125 visual atomicity

Browser test 必须可注入 target preparation delay。

验证：

```text
old scene visible
→ canonical desired target arrives
→ target preparation intentionally delayed
→ every sampled/observed frame before promote still contains complete old scene
→ one promote
→ complete target scene visible
```

至少覆盖：

- old scene 0 / 1 / multiple NPC；
- target scene 0 / 1 / multiple NPC；
- slow NPC resource；
- target resource failure；
- Runtime committed B + Browser staging B failure；
- same target scene receives newer revisions while staging；
- held movement must not starve target scene promotion；
- same-scene setNPC add/remove/resource replacement；
- disconnect/cleanup；
- no stale staging promote。

### 12.2 #124 projection performance

构造足够宽/高的测试地图，连续移动跨多个 projection boundary。

断言：

- projection window 确实变化多次；
- exact projectionBounds 与 Runtime selected window 一致；
- Browser 不从 sparse tiles[] 猜 rectangle；
- surface allocation 不随每次 window shift 增长；
- canvas resize 不随每次 window shift 增长；
- live surface count 有明确上界；
- 长距离 traversal 不造成 surface/memory owner 单调增长；
- dirty work 只覆盖变化 region；
- visual tile result 与 reference projection 完全一致；
- animated autotile 正确；
- no stale window commit。

必须有一个能在旧实现上稳定失败、在新实现上稳定通过的 performance-structure test，不能只依赖 wall-clock threshold。

### 12.3 #123 direction latency

通过 qualification hook / controlled RAF 记录：

```text
input accepted
Runtime intent updated
Render update emitted
Presentation received
first facing paint
current step completed
next move started
```

断言：

```text
first facing paint
< current step completion
```

并验证：

- activeMove trajectory / travelDirection 未改变；
- logical target tile 未改变；
- facingDirection 可以先于 step completion 更新；
- step-transfer attemptedDirection 仍来自 activeMove.travelDirection；
- next step uses latest moveIntent；
- contact/step/edge transfer 与 collision semantics unchanged。

---

## 13. Real PokeMan qualification

自动化之外，PokeMan 真实产品至少覆盖：

### Direction

```text
hold one direction
→ during walk switch to perpendicular direction
→ facing response is visibly prompt
→ no diagonal / teleport / duplicate step
```

### Large map

在 Map 5 / 7 或其他足够大的真实地图连续移动，跨多个 projection window。

确认：

- 不再出现稳定周期的 movement hitch；
- camera/player/NPC movement remains synchronized；
- no tile seam / blank strip。

### Transfer

连续执行多个真实 transfer，例如：

```text
3 → 2
2 → 4
4 → 2
2 → 5
5 → 7
```

观察整个 transition：

- old NPC 不得先于 old map 消失；
- target NPC 不得早于 target map 出现；
- target commit 后 scene 完整；
- failed/injected slow prepare 时 old scene remains intact。

---

## 14. Exit criteria

Map v1.1 完成必须同时满足：

### Architecture

- [ ] Runtime / Presentation authority 符合 §3。
- [ ] activeMove.travelDirection、moveIntent、facingDirection 职责分离。
- [ ] MapSnapshot.player.direction 语义仍是 facingDirection。
- [ ] acceptedVisualScene 是 complete visible scene 的唯一 Presentation authority。
- [ ] stagingVisualScene 只用于 scene replacement。
- [ ] canonical sprite DOM 不再是 accepted NPC pixels 的唯一 owner。
- [ ] projection-window shift 不再被实现为 scene replacement。
- [ ] same-scene NPC/layout/resource changes 归入 bounded visual revision，而不是 full-scene staging。
- [ ] target staging same-scene revisions 可 coalesce，不会因 held movement 饥饿。
- [ ] Runtime commit 与 Presentation promote failure boundary 已按 §4.5 保持单向 authority。

### #125

- [ ] old tiles/player/NPC pixels survive until target scene is complete。
- [ ] one atomic target visual promote。
- [ ] Runtime pre-commit transfer failure leaves scene A intact。
- [ ] Browser staging failure after Runtime commit does not roll Runtime back and preserves last-good pixels as fallback。
- [ ] same-scene setNPC replacement never exposes partial sprite membership。
- [ ] no fixed-delay NPC retention hack。
- [ ] no WebProjector Map special case。

### #124

- [ ] same-scene projection shift uses persistent/incremental surfaces。
- [ ] exact projectionBounds are carried by Map-private RenderData and tested。
- [ ] allocations/resizes/full-raster do not grow linearly with projection shifts。
- [ ] live surfaces/memory remain bounded with traversal distance。
- [ ] 4-tile preferred prefetch / byte-budget fallback model remains valid。
- [ ] long real-product walk no longer shows periodic hitch。

### #123

- [ ] changed facing appears before active step completion。
- [ ] active trajectory and travelDirection remain immutable。
- [ ] step-transfer attemptedDirection uses activeMove.travelDirection。
- [ ] next tile plan uses latest moveIntent。
- [ ] direction is removed from immutable motion identity where necessary。
- [ ] no game-speed workaround。

### Regression

- [ ] Map unit/runtime/browser tests pass。
- [ ] terrain/bridge/ledge behavior passes。
- [ ] transfer tests pass。
- [ ] PokeMan Map tests pass。
- [ ] PWA/staging qualification passes when affected。
- [ ] synced Presentation artifacts exactly match source/dist authority。

---

## 15. Anti-patch stop conditions

如果实现出现下列任一模式，应停止并回到设计，而不是继续叠 workaround：

```text
setTimeout(...retain NPC...)
```

```text
transfer-retained CSS class on old canonical NPC
```

```text
increase projection margin as primary performance fix
```

```text
requestIdleCallback used to hide full-raster architecture
```

```text
PokeMan-only facing workaround in subsystems/map.mjs
```

```text
WebProjector if(tag === "lr-map-*") special cases
```

```text
multiple overlapping fields:
pendingDirection
requestedDirection
visualDirection
nextDirection
without one frozen authority model
```

```text
old scene tiles retained by one owner
old scene sprites retained by unrelated timers/DOM hacks
```

实现应持续收敛到少量核心抽象：

```text
moveIntent
activeMove / travelDirection
facingDirection
acceptedVisualScene
stagingVisualScene
same-scene visual revision
projectionBounds
bounded reusable surfaces
```

---

## 16. PR strategy

建议后续按 Phase 独立 PR：

```text
PR A
#125 atomic visual scene

PR B
#124 incremental projection

PR C
#123 responsive facing

PR D (only if needed)
integrated qualification / documentation cleanup
```

每个实现 PR：

- 只解决对应 Phase；
- 基于前一 Phase 已合并状态；
- 不同时重构无关 Map contract；
- 必须带旧实现失败的新测试；
- 必须报告 exact changed files 和 architecture boundary；
- 不因“顺手优化”扩大到 Renderer / controls / PokeMan gameplay。

---


## 17. Final contract summary

v1.1 最终只需要记住五条：

```text
same-scene movement
→ keep accepted scene
→ lightweight motion paint

direction change
→ keep active trajectory + travelDirection
→ update facingDirection promptly

same-scene visual revision
→ keep accepted scene identity
→ atomically patch projection / sprite set / layout as the affected class requires

projection boundary
→ use exact projectionBounds
→ keep bounded reusable surfaces
→ incrementally update changed regions

map transfer
→ keep complete old accepted scene
→ coalesce target revisions into one staging sceneEpoch
→ atomic promote only when the coherent target scene is complete
```

以及一个 failure rule：

```text
Runtime logical commit
!=
Presentation visual promote

Browser staging failure
→ never rolls Runtime back
→ keeps last-good pixels only as fallback
→ exposes Presentation failure/retry state
```

只要后续实现持续满足这些规则，#123/#124/#125 就是在同一套闭环架构下被解决，而不是三个逐渐堆叠的补丁。
