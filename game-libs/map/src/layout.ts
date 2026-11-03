import {
  TILE_SIZE_PX,
  calculateTileViewportLayout,
  type TileViewportLayout,
} from "@loomrealm-game/tile-presentation";

export type MapLayout = TileViewportLayout;

export function calculateLayout(w: number, h: number, m = 14, n = 33, d = TILE_SIZE_PX): Readonly<MapLayout> {
  return calculateTileViewportLayout(w, h, m, n, d);
}
