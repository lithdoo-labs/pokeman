# RPGMap runtime / data / presentation reference

> Current realization reference for `game-libs/map`. Formal Terrain semantics remain owned by [`TERRAIN_BEHAVIOR_CONTRACT_V1.md`](../../game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_V1.md); framework Render/Input/Content semantics remain owned by `doc/15-contracts`. This page preserves map-local durable invariants that would otherwise be lost with retired implementation drafts.

## Data model

Current Runtime consumes prepared logical records, not RMXP/RGSS objects directly.

```text
struct.Map/<mapId>
  tileset_id
  width / height
  three-layer projected Table
  behaviors[]        # narrow map-local behaviors such as Bridge on/off

struct.Tileset/<tilesetId>
  id
  tileset_name
  autotile_names[7]
  passages
  priorities
  terrain_tags

struct.MapTransfer/<mapId>
  id
  steps[]
  contacts[]
  edges[]

struct.NPC/<npcId>   # when static NPCs are used
  name
  sprite
```

The importer owns source-specific RMXP/PBS interpretation. Runtime consumes these already projected facts and never executes original Ruby.

## Authority and transaction boundary

The map Runtime owns current map identity, Player tile coordinates/direction, motion, scene/visual epochs, Bridge level, static NPC placements and map-local event scheduling. Browser presentation is not an authority.

Scene entry follows prepare-before-commit semantics:

```text
validate target entry
→ read/validate Map + MapTransfer + Tileset
→ validate projectability and logical resources
→ obtain business NPC candidate
→ validate/load NPC definitions/resources
→ build complete authoritative render candidate
→ deterministic pre-commit checks
→ one authoritative RenderDomain commit
→ publish committed map/snapshot
→ notify mapEntered
```

A preparation failure before the authoritative Domain commit does not partially install the candidate scene. Once a synchronous Domain mutation fails and no rollback guarantee exists, the Runtime is fail-stop and converges through `MAP_COMMIT_FAILED` rather than continuing with uncertain authority.

Frame cancellation, scene replacement and terminal state invalidate late async work. A stale completion cannot commit into a newer scene or a closed Domain.

## Movement and transfer ordering

One direction attempt has one map-local outcome: blocked, ordinary walk, Ledge jump, or transfer according to the current projected rules.

Important ordering invariants:

1. If the Runtime/scene is not in a state that accepts movement, the attempt does not create a parallel mutation path.
2. A current-cell + attempted-direction **Contact Transfer** has precedence over walking into the forward cell.
3. Otherwise Runtime plans terrain movement (`blocked | walk | jump`).
4. For a legal movement, static NPC collision is checked at the actual final destination. A two-cell Ledge jump does not treat the skipped middle cell as an ordinary arrival.
5. After successful ordinary/jump arrival, **Step Transfer** is considered before Bridge arrival behavior.
6. An attempted move beyond the map boundary may use a projected **Edge Transfer**; absence of such a rule remains blocked.
7. A target map is prepared before current-map authority is swapped. Transfer does not recreate the enclosing Frame or create a second Runtime.

Ordinary walk duration is 250ms. The formal v1 Ledge slice is one two-cell jump / one motion identity; current original-Essentials qualification established 500ms and a 24px presentation peak for the supported Map47 case.

## Terrain / Bridge

`terrain_tags` retain the projected source values. The formal v1 supported Terrain slice is Neutral(13), Bridge(15), Ledge(1); other tags are not silently interpreted as one of these semantics.

`resolveEffectiveTerrainTag` and passability are separate operations. Bridge level is Runtime authority with legal current values `0` or `2`. Bridge state changes converge the relevant terrain depth, Player/NPC presentation and camera projection through the same authoritative RenderDomain stream; Browser z-index is not a substitute for Bridge business state.

Exact supported original behavior and intentional scope differences are frozen in the Terrain Behavior Contract v1.

## Autotile and regular-tile presentation

The importer/runtime preserves the seven RMXP autotile slots. Current tile partition is fail-closed:

```text
0          empty
1..47      unsupported
48..383    autotile; slot=floor((tileId-48)/48), variant=(tileId-48)%48
>=384      regular tileset tile
```

Autotile projection uses the current 48-variant quarter table. Browser presentation supports the source bitmap layouts required by the supported Essentials corpus:

- standard block layout: 96×128 per animation frame, composed from 16×16 quarters;
- single-cell layout: 32px-high horizontal 32×32 frames;
- default animation frame duration is 250ms (`5 × 50ms` ticks);
- a trailing `[N]` in the logical autotile resource name selects `N × 50ms`; `N` must be a positive safe integer or preparation fails.

Browser presentation owns the animation phase. The Runtime does not turn presentation animation time into gameplay state, and receiving a new RenderData value does not reset authority simply because an autotile frame advances.

Malformed/unsupported presentation resources fail through the Browser preparation boundary; they do not retroactively rewrite a committed Runtime scene.

## Small-map presentation geometry

Small-map centering is **current implemented behavior**, not future work. For the accepted logical viewport and current map dimensions, Browser presentation computes:

```text
mapPixelWidth  = mapWidth  * 32
mapPixelHeight = mapHeight * 32
originX = max(0, (logicalWidth  - mapPixelWidth)  / 2)
originY = max(0, (logicalHeight - mapPixelHeight) / 2)
```

Each axis is centered independently. Therefore a map can be centered horizontally while still scrolling vertically, or vice versa. The map's gameplay coordinates and Runtime camera remain in world/map space; `originX/originY` are presentation offsets only.

The Map View paints the out-of-map world area white and retains the current in-map background/tile composition inside the visible map rectangle. Tile layers and sprites receive the same presentation origin, so centering does not alter passability, transfer coordinates, event semantics, walk/jump timing or RenderDomain authority.

Resize/transfer/new-scene preparation follows the same `sceneEpoch` / `visualEpoch` currentness checks as other Map presentation. A stale preparation cannot install geometry over a newer accepted scene.

## Layering / depth

Current tile depth is computed in the Runtime projection:

```text
if terrain tag == Bridge(15) and bridgeLevel == 2:
  tileDepth = 0
else if priority == 0:
  tileDepth = 0
else:
  tileDepth = (y + priority + 1) * 32
```

Tileset priority is validated in the range `0..5`.

Browser character depth uses the current visible foot position and sprite-frame height:

```text
characterDepth = visualPixelY + 32 + (frameHeight > 32 ? 31 : 0)
```

Stack values are explicit rather than relying on DOM creation order:

```text
tile stack      = tileDepth * 2
character stack = characterDepth * 2 + 1
```

Observable ordering:

```text
tileDepth < characterDepth  → tile behind character
tileDepth > characterDepth  → tile in front of character
tileDepth = characterDepth  → character in front of tile
```

## RenderDomain topology / node identity

The map RenderDomain uses one `viewport` View root, one `player` child and zero or more static NPC sprite children.

Business `NPCPlacement.instanceId` is not a RenderNode key. Internal NPC render keys are private implementation identities constrained by RenderDomain node lifetime. A removed node key must not be resurrected in the same Domain. Surviving same-scene NPC instances may retain their current render key; removed/re-added or new-scene instances receive fresh internal keys.

Topology changes such as map replacement or NPC-set membership changes use a complete authoritative candidate/`replace` path. Fixed-topology movement, Bridge, camera and resize changes can use existing-node `update`. This preserves the framework rule that `update` mutates existing nodes rather than creating/removing topology.

### Map-local capacity guards

Before a predictable authoritative commit, the current game-library implementation applies these map-local guards:

```text
viewport serialized data guard     < 196,608 bytes
complete RenderDomain node count   <= 16,384
complete candidate JSON size       <= 1,000,000 bytes
internal NPC render-key UTF-8      <= 128 bytes
```

The viewport projection window attempts bounded retained margins and accepts the first candidate below the viewport-data guard; inability to produce a legal candidate fails rather than silently dropping tiles.

A deterministic candidate-capacity failure caused by NPC content maps to `MAP_NPC_INVALID`; a map/content-owned deterministic capacity failure maps to `MAP_CONTENT_FAILED`. These are deliberate Product/Developer-owned policies, including `VIEW_DATA_GUARD` and the projection-window strategy; generic RenderManager/Data no longer supplies application-capacity hard limits. The game library must not bypass its own policy by silently truncating NPCs/tiles or splitting one logical truth into hidden partial commits.

## Browser currentness and resource lifetime

`lr-map-view` and `lr-map-sprite` are presentation consumers only. Their durable currentness rules include:

- a candidate view/sprite set must agree on `sceneEpoch`, `visualEpoch` and Bridge level before commit;
- resources for a candidate are decoded/prepared before that candidate is installed;
- async decode/completion re-checks sequence/current scene identity before touching accepted presentation;
- stale success cannot overwrite a newer map/scene;
- stale failure cannot clear a newer successful presentation;
- camera/player motion interpolation presents current Runtime motion facts, not an independent gameplay position;
- current small-map geometry, tile layers and sprites are committed from the same accepted candidate;
- resize and late animation/motion callbacks cannot write business authority back into Runtime;
- resources no longer owned by current presentation are released according to the Browser resource-owner implementation.

`mapEntered` and Browser-visible-pixel success are deliberately separate evidence. Product/browser tests are required for actual visible compositing.

## Provenance retained outside Current docs

The large historical layering/autotile/transfer/walking implementation drafts contained useful source investigation and rollout instructions, but their file whitelists, Agent STOP rules, milestone gates and temporary baseline exceptions are not Current product semantics. Git preserves those drafts.

Two separate real-corpus investigations contain irreplaceable source identity and corpus facts and are intentionally retained under [`doc/history/evidence/map`](../../history/evidence/map/README.md).
