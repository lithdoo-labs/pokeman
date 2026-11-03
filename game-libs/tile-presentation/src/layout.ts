export const TILE_SIZE_PX = 32;
export const RESIZE_SETTLE_MS = 100;

export interface TileViewportLayout {
  readonly windowWidth: number;
  readonly windowHeight: number;
  readonly barHeight: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly columns: number;
  readonly rows: number;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

function positiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

export function calculateTileViewportLayout(
  w: number,
  h: number,
  m = 14,
  n = 33,
  d = TILE_SIZE_PX,
): Readonly<TileViewportLayout> {
  const windowWidth = positiveSafeInteger(w, "window width");
  const windowHeight = positiveSafeInteger(h, "window height");
  const minRows = positiveSafeInteger(m, "minimum rows");
  const maxRows = positiveSafeInteger(n, "maximum rows");
  const tileSize = positiveSafeInteger(d, "tile size");
  if (minRows > maxRows) throw new TypeError("minimum rows must not exceed maximum rows");

  const barHeight = windowHeight < 480 ? 24 : windowHeight < 720 ? 32 : 48;
  const contentWidth = windowWidth;
  const contentHeight = windowHeight - barHeight;
  if (contentHeight <= 0) throw new RangeError("Tile viewport content height must be positive");

  const rawColumns = Math.ceil(contentWidth / tileSize);
  const rawRows = Math.ceil(contentHeight / tileSize);
  const rows = Math.min(maxRows, Math.max(minRows, rawRows));
  const columns = rawRows < minRows || rawRows > maxRows
    ? Math.max(1, Math.round(rows * contentWidth / contentHeight))
    : rawColumns;
  const logicalWidth = columns * tileSize;
  const logicalHeight = rows * tileSize;
  if (!Number.isSafeInteger(logicalWidth) || !Number.isSafeInteger(logicalHeight)) {
    throw new RangeError("Tile viewport logical dimensions exceed the safe integer range");
  }
  const scaleX = contentWidth / logicalWidth;
  const scaleY = contentHeight / logicalHeight;
  if (![scaleX, scaleY].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("Tile viewport scale is not renderable");
  }

  return Object.freeze({
    windowWidth,
    windowHeight,
    barHeight,
    contentWidth,
    contentHeight,
    columns,
    rows,
    logicalWidth,
    logicalHeight,
    scaleX,
    scaleY,
  });
}
