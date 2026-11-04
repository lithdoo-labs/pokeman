# LoomRealm Map / Battle migration inventory

## Baselines

- LoomRealm: `e76f453f`
- PokeMan: `97babf6c`

The legacy LoomRealm PokeMan example had 479 tracked files. Comparison against
this repository found 472 byte-identical files, seven expected path or package
adjustments, zero LoomRealm-only product files, and 138 PokeMan-only files.
The Map, Battle, and tile-presentation implementations were otherwise
byte-identical.

## Product ownership

- Map source and tests: `game-libs/map` / `@pokeman/game-map`.
- Battle source and tests: `game-libs/battle` / `@pokeman/game-battle`.
- Tile presentation: `game-libs/tile-presentation` / `@pokeman/tile-presentation`.
- Product composition: `subsystems/map.mjs`, `subsystems/battle.mjs`, and
  `subsystems/battle-content.mjs`.
- Content and presentation: repository FSDB content and presentation resources.
- Product PWA qualification: `test/pwa-staging.e2e.mjs` and
  `.github/workflows/pwa-staging.yml`.
- Map performance evidence: `doc/map-performance` and
  `artifacts/map-projection-bench`.

## Framework dependency boundary

PokeMan consumes LoomRealm only through the pinned `loom-realm` submodule and
its generic `@loomrealm/*` and `@loomrealm-game/*` workspaces. LoomRealm is the
single source of truth for `common-controls`, `rpg-dialogue`, and `schema-form`;
PokeMan does not keep source copies of those libraries. Required capabilities
are Subsystem Runtime, Frame/Activation, Shared State and Session Events,
Renderer and Input, Content/FSDB, platform ports, Desktop hosting, and the
generic PWA builder.
No PokeMan package imports LoomRealm's former Map, Battle, or tile-presentation
paths.

## Migrated qualification

Map package unit tests, Battle simulation/decision/settlement tests, browser
layering/depth/performance tests, route-planner helpers, and staging PWA E2E are
owned here. LoomRealm's generic framework suites remain upstream and are not
duplicated.
