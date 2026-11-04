# RPGMap public API / lifecycle reference

> Current source surface: `game-libs/map/src/index.ts` + `src/runtime.ts`. This page documents the implemented `@pokeman/game-map` author-facing API. It is not a framework protocol and does not recreate the retired milestone/todo document model.

## Package root

The package root currently exposes **named exports only**:

```ts
export {
  RPGMapBuilder,
  RPGMapError,
  type MapEnteredEvent,
  type MapEnteringContext,
  type MapEntry,
  type MapSnapshot,
  type NPCPlacement,
  type Pattern,
  type RPGMapErrorCode,
  type RPGMapHandler,
} from "./runtime.js";

export type { Direction } from "./semantics.js";
```

There is no current package-root default export and no current `mapDefinition` compatibility export. Historical documents that mention those exports describe an earlier realization and must not override the actual package root.

## Public shapes

```ts
type Direction = 2 | 4 | 6 | 8;
type Pattern = 0 | 1 | 2 | 3;

type MapEntry = Readonly<{
  mapId: number;
  x: number;
  y: number;
  direction?: Direction;
}>;

type NPCPlacement = Readonly<{
  instanceId: string;
  npcId: string;
  x: number;
  y: number;
  direction: Direction;
  pattern?: Pattern | null;
}>;

type MapEnteringContext = Readonly<{
  mapId: number;
  fromMapId: number | null;
  signal: AbortSignal;
  setNPC(npcs: readonly NPCPlacement[]): void;
}>;

type MapEnteredEvent = Readonly<{
  mapId: number;
  fromMapId: number | null;
  player: Readonly<{ x: number; y: number; direction: Direction }>;
}>;

type MapSnapshot = Readonly<{
  mapId: number;
  player: Readonly<{ x: number; y: number; direction: Direction }>;
  npcs: readonly Readonly<{
    instanceId: string;
    npcId: string;
    x: number;
    y: number;
    direction: Direction;
    pattern: Pattern;
  }>[];
}>;

interface RPGMapHandler {
  onMapEntering(listener: (context: MapEnteringContext) => void | Promise<void>): () => void;
  onMapEntered(listener: (event: MapEnteredEvent) => void): () => void;
  run(initial: MapEntry): Promise<FrameOutcome>;
  enterMap(target: MapEntry): Promise<void>;
  setNPC(npcs: readonly NPCPlacement[]): Promise<void>;
  getSnapshot(): MapSnapshot | null;
}
```

`RPGMapBuilder` is constructed from the current `SubsystemScope` and `Frame`, then `build({ player: { characterName } })` returns one Handler. A Builder is single-use. A Handler is frame-scoped and `run()` is single-use.

## Run / command lifecycle

- `run(initial)` validates the initial entry, defaults an omitted initial direction to `2`, enters the first scene and then owns the map Runtime for the enclosing Frame lifetime. It does not create a second Frame lifecycle.
- `enterMap(target)` is an explicit map-entry command for an already running stable Handler. Omitted explicit target direction preserves the current committed direction. Commands issued in an invalid phase reject rather than creating a hidden queue.
- `setNPC(npcs)` replaces the static NPC set for the current stable scene. It is an all-or-nothing operation; invalid placements/resources or deterministic pre-commit validation failures do not partially install a new set.
- Movement, map entry and NPC replacement are mutually fenced where required by the current Runtime. A busy operation is reported through `MAP_BUSY`; stale scene work cannot commit into a newer scene.
- `getSnapshot()` returns the last committed business snapshot as a detached immutable copy. Before the first committed scene and after Runtime cleanup/fatal termination it is `null`.

## Entering / entered hooks

`onMapEntering` supplies the business-owned initial NPC set for a scene before that scene is committed. The current Runtime allows at most one entering listener. When a listener exists it must call `context.setNPC(...)` exactly once for that invocation; late/stale context use is rejected. With no entering hook, the scene defaults to an empty NPC set.

`onMapEntered` is a post-commit notification. Multiple listeners may be registered. Listener failure is diagnostic only: it does not roll back the already committed map and does not prevent later listeners from running.

`mapEntered` therefore means that map Runtime authority and the synchronous RenderDomain commit have succeeded. It does **not** mean that Browser resource decode or pixels have already become visible; Browser presentation is verified separately.

## Error surface

```ts
type RPGMapErrorCode =
  | "MAP_INVALID_ARGUMENT"
  | "MAP_INVALID_STATE"
  | "MAP_ALREADY_RUN"
  | "MAP_BUSY"
  | "MAP_CONTENT_FAILED"
  | "MAP_NPC_INVALID"
  | "MAP_STALE_SCENE"
  | "MAP_CANCELLED"
  | "MAP_COMMIT_FAILED";
```

External callers branch on `RPGMapError.code`, not on implementation-specific message text.

Broad meaning:

| Code | Meaning |
| --- | --- |
| `MAP_INVALID_ARGUMENT` | invalid map entry / field / range |
| `MAP_INVALID_STATE` | command is not legal in the current Handler phase |
| `MAP_ALREADY_RUN` | the one-shot Handler `run()` was invoked again |
| `MAP_BUSY` | another map/NPC/motion/event operation owns the relevant mutation boundary |
| `MAP_CONTENT_FAILED` | required Map/Tileset/Transfer/resource content could not be prepared |
| `MAP_NPC_INVALID` | NPC identity/placement/definition/resource/candidate validation failed |
| `MAP_STALE_SCENE` | async work/context belongs to a retired scene |
| `MAP_CANCELLED` | Frame/scene preparation was cancelled |
| `MAP_COMMIT_FAILED` | authoritative RenderDomain commit failed and the Runtime cannot safely continue |

Frame-level failures continue to use the enclosing Subsystem `FrameOutcome` model. In particular, an unrecoverable authoritative RenderDomain failure is fail-stop rather than “log and keep mutating”.

## NPC contract

Current static NPC placement rules:

- `instanceId` and `npcId` are non-empty identities; `instanceId` is unique within one candidate set;
- coordinates are in-bounds safe integers and NPC cells do not overlap each other or the Player committed/spawn cell;
- direction is one of `2/4/6/8`;
- omitted / `null` pattern normalizes to `0`; explicit pattern is `0..3`;
- `[struct]NPC/<npcId>` is a narrow definition with `name` and a `resource.Graphics/Characters/...` sprite reference;
- current NPC sprite resources must be PNG data compatible with the current 4×4 character-atlas consumer;
- NPCs are static blockers in v1. They do not independently move, execute dialogue/AI, trigger Terrain/Transfer, or become a generic Entity system.

Business `instanceId` is not the RenderNode key. Internal render identity is private and follows RenderDomain node-lifetime constraints; see [Runtime / Presentation](./runtime-and-presentation.md).

## Content and ownership boundary

RPGMap consumes logical Content through `SubsystemScope.content`; it does not install/open FSDB itself and does not expose filesystem paths or Content credentials. Current Runtime preparation reads the logical records/resources it needs, including `struct.Map`, `struct.MapTransfer`, `struct.Tileset`, optional `struct.NPC`, and Graphics resources.

System-wide Frame, Render Update, Content and Input semantics remain owned by the framework contracts. This page documents only the game-library author surface and map-local lifecycle.