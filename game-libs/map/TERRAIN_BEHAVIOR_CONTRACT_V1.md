# Terrain Behavior Contract v1

Status: Frozen for the declared Terrain slice on 2026-10-09.

Qualification subject: `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9`.

This contract freezes the shipped Terrain Behavior slice for Neutral(13), Bridge(15), and Ledge(1), based on current product tests plus original Pokémon Essentials v21.1 dynamic observations recorded in `TERRAIN_BEHAVIOR_EVIDENCE.md` and `doc/30-implementation/final-performance-terrain-qualification.md`.

## Scope

- `terrain_tags` remains separate from passage and uses explicit validation/migration.
- Runtime owns coordinates, direction, bridgeLevel, motionId, sceneEpoch, visualEpoch, event scheduling, and movement state.
- Bridge behavior is limited to the observed `pbBridgeOn` / `pbBridgeOff` MapAction slice; no generic Ruby/event interpreter is introduced.
- Ledge behavior is one supported-direction two-tile jump with one motionId. The v21.1 observation establishes 500ms duration and a 24px peak; reverse traversal is blocked.
- Water, ice, bike, surf, arbitrary NPC interpreter behavior, and cross-map jump remain outside this contract.
- Browser presentation does not own passage, bridge state, or movement authority.

## Evidence policy

The approved repository policy is synthetic-only CI plus legal-local original qualification plus sanitized repository facts/digests. Original `.rxdata`, PBS, Graphics, Audio, `Game.exe`, RGSS DLLs, screenshots, and raw observation logs are not committed.

## Qualification disposition

FG-01 through FG-06 are closed for the declared slice. C-01 through C-08 and DEC-01 through DEC-07 are accepted within the exact scope and evidence boundary documented by the current qualification records.

Original-source observations and synthetic-only edge cases remain explicitly distinguished; synthetic-only Map47 blocked/boundary/skipped-event cases are not represented as original observations.

Future executable or qualification-input changes affecting this slice require requalification under the repository subject/staleness rules.
