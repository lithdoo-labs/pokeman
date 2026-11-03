(function registerLoomRealmMapElements() {
  "use strict";

  const AUTOTILE_TICK_MS = 50;
  const DEFAULT_AUTOTILE_FRAME_TICKS = 5;
  const VIEW_KEYS = [
    "sceneEpoch", "visualEpoch", "motionId", "viewportWidth", "viewportHeight",
    "barHeight", "contentWidth", "contentHeight", "columns", "rows",
    "logicalWidth", "logicalHeight", "scaleX", "scaleY", "mapName",
    "mapId", "mapWidth", "mapHeight", "cameraX", "cameraY", "tileset", "autotiles",
    "projectionBounds", "tiles", "cameraMotion", "bridgeLevel",
  ];
  const SPRITE_KEYS = [
    "sceneEpoch", "visualEpoch", "motionId", "x", "y", "screenX", "screenY",
    "direction", "pattern", "sprite", "motion", "bridgeLevel",
  ];
  const RETRY_MS = [100, 200, 400];
  const SURFACE_POOL_BUDGET = 4;
  const TILE = 32;
  const AUTOTILE_QUARTERS = [
    [27, 28, 33, 34], [5, 28, 33, 34], [27, 6, 33, 34], [5, 6, 33, 34],
    [27, 28, 33, 12], [5, 28, 33, 12], [27, 6, 33, 12], [5, 6, 33, 12],
    [27, 28, 11, 34], [5, 28, 11, 34], [27, 6, 11, 34], [5, 6, 11, 34],
    [27, 28, 11, 12], [5, 28, 11, 12], [27, 6, 11, 12], [5, 6, 11, 12],
    [25, 26, 31, 32], [25, 6, 31, 32], [25, 26, 31, 12], [25, 6, 31, 12],
    [15, 16, 21, 22], [15, 16, 21, 12], [15, 16, 11, 22], [15, 16, 11, 12],
    [29, 30, 35, 36], [29, 30, 11, 36], [5, 30, 35, 36], [5, 30, 11, 36],
    [39, 40, 45, 46], [5, 40, 45, 46], [39, 6, 45, 46], [5, 6, 45, 46],
    [25, 30, 31, 36], [15, 16, 45, 46], [13, 14, 19, 20], [13, 14, 19, 12],
    [17, 18, 23, 24], [17, 18, 11, 24], [41, 42, 47, 48], [5, 42, 47, 48],
    [37, 38, 43, 44], [37, 6, 43, 44], [13, 18, 19, 24], [13, 14, 43, 44],
    [37, 42, 43, 48], [17, 18, 47, 48], [13, 18, 43, 48], [1, 2, 7, 8],
  ];

  function resourceIdentity(ref) {
    return `${ref.namespace}\u0000${ref.key}\u0000${ref.contentVersion}`;
  }

  function tileStackValue(depth) {
    return depth * 2;
  }

  function characterStackValue(depth) {
    return depth * 2 + 1;
  }

  function lerp(from, to, progress) {
    return from + (to - from) * progress;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function intersectHalfOpen(left, right) {
    const result = {
      x0: Math.max(left.x0, right.x0),
      y0: Math.max(left.y0, right.y0),
      x1: Math.min(left.x1, right.x1),
      y1: Math.min(left.y1, right.y1),
    };
    return result.x0 < result.x1 && result.y0 < result.y1 ? Object.freeze(result) : null;
  }

  function subtractRect(outer, inner) {
    if (!inner) return Object.freeze([outer]);
    const candidates = [
      { x0: outer.x0, y0: outer.y0, x1: outer.x1, y1: inner.y0 },
      { x0: outer.x0, y0: inner.y1, x1: outer.x1, y1: outer.y1 },
      { x0: outer.x0, y0: inner.y0, x1: inner.x0, y1: inner.y1 },
      { x0: inner.x1, y0: inner.y0, x1: outer.x1, y1: inner.y1 },
    ];
    return Object.freeze(candidates
      .filter((rect) => rect.x0 < rect.x1 && rect.y0 < rect.y1)
      .map((rect) => Object.freeze(rect)));
  }

  function presentationGeometry(view) {
    const logicalWidth = view.logicalWidth ?? view.viewportWidth;
    const logicalHeight = view.logicalHeight ?? view.viewportHeight;
    const mapPixelWidth = view.mapWidth * TILE;
    const mapPixelHeight = view.mapHeight * TILE;
    if (!Number.isSafeInteger(logicalWidth) || logicalWidth <= 0
      || !Number.isSafeInteger(logicalHeight) || logicalHeight <= 0
      || !Number.isSafeInteger(mapPixelWidth) || mapPixelWidth <= 0
      || !Number.isSafeInteger(mapPixelHeight) || mapPixelHeight <= 0
      || !Number.isSafeInteger(view.cameraX) || view.cameraX < 0
      || !Number.isSafeInteger(view.cameraY) || view.cameraY < 0) {
      throw new TypeError("Invalid map presentation geometry");
    }
    const viewport = Object.freeze({ x0: 0, y0: 0, x1: logicalWidth, y1: logicalHeight });
    const originX = Math.max(0, (logicalWidth - mapPixelWidth) / 2);
    const originY = Math.max(0, (logicalHeight - mapPixelHeight) / 2);
    const mapRect = Object.freeze({
      x0: originX - view.cameraX,
      y0: originY - view.cameraY,
      x1: originX - view.cameraX + mapPixelWidth,
      y1: originY - view.cameraY + mapPixelHeight,
    });
    const visibleMap = intersectHalfOpen(viewport, mapRect);
    return Object.freeze({
      originX,
      originY,
      viewport,
      mapRect,
      visibleMap,
      fillRects: subtractRect(viewport, visibleMap),
    });
  }

  function qualify(name, detail) {
    const hook = globalThis.__loomrealmMovementQualification;
    if (typeof hook === "function") {
      try { hook({ name, at: performance.now(), detail }); } catch { /* qualification must not change product behavior */ }
    }
  }

  function fault(phase, detail) {
    const hook = globalThis.__loomrealmMapTestFault;
    if (typeof hook === "function") hook(phase, detail);
  }

  function exactObject(value, keys) {
    return Boolean(value) && typeof value === "object" && keys.every((key) => key in value) && Object.keys(value).length === keys.length;
  }

  function validRef(value) {
    return exactObject(value, ["namespace", "key", "contentVersion"])
      && [value.namespace, value.key, value.contentVersion].every((part) => typeof part === "string" && part.length > 0);
  }

  function validDuration(value) {
    return value === 250 || value === 500;
  }

  function validCameraMotion(value) {
    if (value === null) return true;
    if (!exactObject(value, ["id", "durationMs", "fromCameraX", "fromCameraY"])) return false;
    return Number.isSafeInteger(value.id) && value.id > 0
      && validDuration(value.durationMs)
      && Number.isSafeInteger(value.fromCameraX) && value.fromCameraX >= 0
      && Number.isSafeInteger(value.fromCameraY) && value.fromCameraY >= 0;
  }

  function validPlayerMotion(value) {
    if (value === null) return true;
    if (value.kind === "jump") {
      if (!exactObject(value, ["id", "durationMs", "fromY", "fromScreenX", "fromScreenY", "kind", "peakPx"])) return false;
      return Number.isSafeInteger(value.id) && value.id > 0
        && value.durationMs === 500
        && Number.isSafeInteger(value.fromY) && value.fromY >= 0
        && Number.isFinite(value.fromScreenX)
        && Number.isFinite(value.fromScreenY)
        && Number.isFinite(value.peakPx) && value.peakPx >= 0;
    }
    if (!exactObject(value, ["id", "durationMs", "fromY", "fromScreenX", "fromScreenY"])) return false;
    return Number.isSafeInteger(value.id) && value.id > 0
      && value.durationMs === 250
      && Number.isSafeInteger(value.fromY) && value.fromY >= 0
      && Number.isFinite(value.fromScreenX)
      && Number.isFinite(value.fromScreenY);
  }

  function autotileCornerTuple(variant) {
    const row = AUTOTILE_QUARTERS[variant];
    if (!row) return null;
    return row.flatMap((quarter) => {
      const index = quarter - 1;
      return [(index % 6) * 16, Math.floor(index / 6) * 16];
    });
  }

  function validTileTuple(tile, data) {
    if (!Array.isArray(tile) || tile.length !== 5) return false;
    const [x, y, z, tileId, depth] = tile;
    if (!Number.isSafeInteger(x) || x < 0 || x >= data.mapWidth
      || !Number.isSafeInteger(y) || y < 0 || y >= data.mapHeight
      || ![0, 1, 2].includes(z)
      || !Number.isSafeInteger(tileId) || tileId <= 0 || (tileId >= 1 && tileId <= 47)
      || !Number.isSafeInteger(depth) || depth < 0) return false;
    if (tileId >= 48 && tileId <= 383) {
      const slot = Math.floor((tileId - 48) / 48);
      if (slot < 0 || slot > 6 || !validRef(data.autotiles[slot])) return false;
    }
    return true;
  }

  function validProjectionBounds(bounds, data) {
    return exactObject(bounds, ["minTileX", "minTileY", "maxTileX", "maxTileY"])
      && Number.isSafeInteger(bounds.minTileX) && bounds.minTileX >= 0
      && Number.isSafeInteger(bounds.minTileY) && bounds.minTileY >= 0
      && Number.isSafeInteger(bounds.maxTileX) && bounds.maxTileX >= bounds.minTileX && bounds.maxTileX < data.mapWidth
      && Number.isSafeInteger(bounds.maxTileY) && bounds.maxTileY >= bounds.minTileY && bounds.maxTileY < data.mapHeight;
  }

  function assertMapViewData(data) {
    if (
      !exactObject(data, VIEW_KEYS)
      || !Number.isSafeInteger(data.sceneEpoch) || data.sceneEpoch <= 0
      || !Number.isSafeInteger(data.visualEpoch) || data.visualEpoch <= 0
      || !(data.motionId === null || (Number.isSafeInteger(data.motionId) && data.motionId > 0))
      || !Number.isSafeInteger(data.viewportWidth) || data.viewportWidth <= 0
      || !Number.isSafeInteger(data.viewportHeight) || data.viewportHeight <= 0
      || !Number.isSafeInteger(data.mapId) || data.mapId <= 0
      || !Number.isSafeInteger(data.mapWidth) || data.mapWidth <= 0
      || !Number.isSafeInteger(data.mapHeight) || data.mapHeight <= 0
      || !Number.isSafeInteger(data.cameraX) || data.cameraX < 0
      || !Number.isSafeInteger(data.cameraY) || data.cameraY < 0
      || !validRef(data.tileset)
      || !Array.isArray(data.autotiles) || data.autotiles.length !== 7
      || !data.autotiles.every((item) => item === null || validRef(item))
      || !validProjectionBounds(data.projectionBounds, data)
      || !Array.isArray(data.tiles)
      || !validCameraMotion(data.cameraMotion)
      || (data.cameraMotion === null) !== (data.motionId === null)
      || (data.cameraMotion !== null && data.cameraMotion.id !== data.motionId)
      || (data.bridgeLevel !== 0 && data.bridgeLevel !== 2)
    ) throw new TypeError("Invalid MapViewRenderData");
    const expectedBar = data.viewportHeight < 480 ? 24 : data.viewportHeight < 720 ? 32 : 48;
    if (!Number.isSafeInteger(data.barHeight) || data.barHeight !== expectedBar
      || data.contentWidth !== data.viewportWidth || data.contentHeight !== data.viewportHeight - data.barHeight
      || !Number.isSafeInteger(data.columns) || data.columns <= 0
      || !Number.isSafeInteger(data.rows) || data.rows < 14 || data.rows > 33
      || data.logicalWidth !== data.columns * TILE || data.logicalHeight !== data.rows * TILE
      || !Number.isFinite(data.scaleX) || data.scaleX <= 0
      || !Number.isFinite(data.scaleY) || data.scaleY <= 0
      || Math.abs(data.scaleX * data.logicalWidth - data.contentWidth) > 1e-7
      || Math.abs(data.scaleY * data.logicalHeight - data.contentHeight) > 1e-7
      || typeof data.mapName !== "string" || data.mapName.length === 0
      || data.mapName !== String(data.mapId)) throw new TypeError("Invalid MapViewRenderData");
    const logicalWidth = data.logicalWidth ?? data.viewportWidth;
    const logicalHeight = data.logicalHeight ?? data.viewportHeight;
    const maxCameraX = Math.max(data.mapWidth * TILE - logicalWidth, 0);
    const maxCameraY = Math.max(data.mapHeight * TILE - logicalHeight, 0);
    if (data.cameraX > maxCameraX || data.cameraY > maxCameraY) throw new TypeError("Invalid MapViewRenderData");
    presentationGeometry(data);
    let previous = null;
    for (const tile of data.tiles) {
      if (!validTileTuple(tile, data)) throw new TypeError("Invalid MapViewRenderData");
      if (tile[0] < data.projectionBounds.minTileX || tile[0] > data.projectionBounds.maxTileX
        || tile[1] < data.projectionBounds.minTileY || tile[1] > data.projectionBounds.maxTileY) throw new TypeError("Invalid MapViewRenderData");
      if (previous && (tile[2] < previous[2]
        || (tile[2] === previous[2] && tile[1] < previous[1])
        || (tile[2] === previous[2] && tile[1] === previous[1] && tile[0] <= previous[0]))) {
        throw new TypeError("Invalid MapViewRenderData");
      }
      previous = tile;
    }
  }

  function assertMapSpriteData(data) {
    if (
      !exactObject(data, SPRITE_KEYS)
      || !Number.isSafeInteger(data.sceneEpoch) || data.sceneEpoch <= 0
      || !Number.isSafeInteger(data.visualEpoch) || data.visualEpoch <= 0
      || !(data.motionId === null || (Number.isSafeInteger(data.motionId) && data.motionId > 0))
      || !Number.isSafeInteger(data.x) || data.x < 0
      || !Number.isSafeInteger(data.y) || data.y < 0
      || ![2, 4, 6, 8].includes(data.direction)
      || ![0, 1, 2, 3].includes(data.pattern)
      || !Number.isFinite(data.screenX)
      || !Number.isFinite(data.screenY)
      || !validRef(data.sprite)
      || !validPlayerMotion(data.motion)
      || (data.motion !== null && data.pattern !== 1 && data.pattern !== 3)
      || (data.motion === null) !== (data.motionId === null)
      || (data.motion !== null && data.motion.id !== data.motionId)
      || (data.bridgeLevel !== 0 && data.bridgeLevel !== 2)
    ) throw new TypeError("Invalid MapSpriteRenderData");
  }

  function classifyAutotileLayout(image) {
    if (image.height === 128 && image.width >= 96 && image.width % 96 === 0) return "block";
    if (image.height === 32 && image.width >= 32 && image.width % 32 === 0) return "cell";
    return "invalid";
  }

  function autotileFrameDurationMs(ref) {
    const name = ref.key.slice(ref.key.lastIndexOf("/") + 1);
    const match = /\[\s*(\d+)\s*\]\s*$/.exec(name);
    if (!match) return DEFAULT_AUTOTILE_FRAME_TICKS * AUTOTILE_TICK_MS;
    const ticks = Number(match[1]);
    if (!Number.isSafeInteger(ticks) || ticks <= 0) return null;
    return ticks * AUTOTILE_TICK_MS;
  }

  function autotileFrameIndex(now, startedAt, frameCount, durationMs) {
    if (frameCount <= 1) return 0;
    return Math.floor((now - startedAt) / durationMs) % frameCount;
  }

  function expandTiles(data) {
    return data.tiles.map(([x, y, z, tileId, depth]) => {
      const depthBias = depth === 0 ? -1 : depth - y * TILE;
      const visual = tileId >= 384
        ? [tileId, depthBias, 0, tileId - 384]
        : [tileId, depthBias, 1, Math.floor((tileId - 48) / 48), ...autotileCornerTuple((tileId - 48) % 48)];
      return { x, y, z, tileId, depth, visual };
    });
  }

  function bucketTiles(tiles) {
    const buckets = new Map();
    for (const tile of tiles) {
      let list = buckets.get(tile.depth);
      if (!list) {
        list = [];
        buckets.set(tile.depth, list);
      }
      list.push(tile);
    }
    return buckets;
  }

  function depthBounds(tiles) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const tile of tiles) {
      minX = Math.min(minX, tile.x * 32);
      minY = Math.min(minY, tile.y * 32);
      maxX = Math.max(maxX, tile.x * 32 + 32);
      maxY = Math.max(maxY, tile.y * 32 + 32);
    }
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }

  function usedResources(data, tiles) {
    const uniqueRefs = new Map();
    const usedSlots = [];
    const seenSlots = new Set();
    let needsTileset = false;
    for (const tile of tiles) {
      if (tile.visual[2] === 0) {
        needsTileset = true;
        continue;
      }
      const slot = tile.visual[3];
      const ref = data.autotiles[slot];
      if (!seenSlots.has(slot)) {
        seenSlots.add(slot);
        usedSlots.push({ slot, ref });
      }
      uniqueRefs.set(resourceIdentity(ref), ref);
    }
    if (needsTileset) uniqueRefs.set(resourceIdentity(data.tileset), data.tileset);
    return { uniqueRefs, usedSlots, needsTileset };
  }

  function tokensEqual(view, sprite) {
    return view.sceneEpoch === sprite.sceneEpoch
      && view.visualEpoch === sprite.visualEpoch
      && view.motionId === sprite.motionId
      && view.bridgeLevel === sprite.bridgeLevel;
  }

  function motionFingerprint(view, sprite) {
    if (view.cameraMotion === null && sprite.motion === null) return null;
    return JSON.stringify([
      view.motionId,
      view.cameraMotion,
      sprite.motion,
      view.cameraX,
      view.cameraY,
      sprite.x,
      sprite.y,
      sprite.screenX,
      sprite.screenY,
      sprite.pattern,
    ]);
  }

  function autotileIdentitiesEqual(left, right) {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      const a = left[index];
      const b = right[index];
      if (a === b) continue;
      if (!a || !b) return false;
      if (resourceIdentity(a) !== resourceIdentity(b)) return false;
    }
    return true;
  }

  function projectedTilesEqual(left, right) {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      const a = left[index];
      const b = right[index];
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (let field = 0; field < a.length; field += 1) if (a[field] !== b[field]) return false;
    }
    return true;
  }

  function projectionBoundsEqual(left, right) {
    return left === right || Boolean(left && right
      && left.minTileX === right.minTileX && left.minTileY === right.minTileY
      && left.maxTileX === right.maxTileX && left.maxTileY === right.maxTileY);
  }

  function sameProjectedTile(left, right) {
    if (!left || !right || left.tileId !== right.tileId) return false;
    if (left.visual === right.visual) return true;
    if (!left.visual || !right.visual || left.visual.length !== right.visual.length) return false;
    for (let index = 0; index < left.visual.length; index += 1) {
      if (left.visual[index] !== right.visual[index]) return false;
    }
    return true;
  }

  function cellKey(depth, x, y) {
    return `${depth}:${x}:${y}`;
  }

  function stacksByCell(buckets) {
    const stacks = new Map();
    if (!buckets) return stacks;
    for (const tiles of buckets.values()) {
      for (const tile of tiles) {
        const key = cellKey(tile.depth, tile.x, tile.y);
        let list = stacks.get(key);
        if (!list) {
          list = [];
          stacks.set(key, list);
        }
        list.push(tile);
      }
    }
    for (const list of stacks.values()) {
      list.sort((left, right) => left.z - right.z || left.y - right.y || left.x - right.x);
    }
    return stacks;
  }

  function sameTileStack(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      const previous = left[index];
      const next = right[index];
      if (previous.z !== next.z || !sameProjectedTile(previous, next)) return false;
    }
    return true;
  }

  function autotileFramesMatch(stack, previousFrames, nextFrames) {
    for (const tile of stack) {
      if (tile.visual[2] !== 1) continue;
      if (!previousFrames || previousFrames.get(tile.visual[3]) !== nextFrames.get(tile.visual[3])) return false;
    }
    return true;
  }

  class ResourceHost extends HTMLElement {
    constructor() {
      super();
      this._resources = undefined;
      this._images = new Map();
      this._bitmaps = new Map();
      this._owners = new Map();
    }

    receiveRenderContext(context) {
      if (!context || !context.resources || typeof context.resources.resource !== "function") throw new TypeError("Map presentation requires PresentationResourceClient");
      this._resources = context.resources;
    }

    _own(identity, owner) {
      let owners = this._owners.get(identity);
      if (!owners) {
        owners = new Set();
        this._owners.set(identity, owners);
      }
      owners.add(owner);
    }

    _disown(owner) {
      for (const [identity, owners] of [...this._owners]) {
        if (!owners.delete(owner)) continue;
        if (owners.size === 0) this._release(identity);
      }
    }

    _release(identity) {
      this._owners.delete(identity);
      const bitmap = this._bitmaps.get(identity);
      this._bitmaps.delete(identity);
      this._images.delete(identity);
      if (bitmap && typeof bitmap.close === "function") {
        try { bitmap.close(); } catch { /* already closed */ }
      }
    }

    _releaseAll() {
      for (const identity of [...this._owners.keys()]) this._release(identity);
      this._images.clear();
    }

    async _image(ref) {
      if (!validRef(ref)) throw new TypeError("Invalid map resource reference");
      if (!this._resources) throw new TypeError("Map presentation has no resource context");
      const identity = resourceIdentity(ref);
      let pending = this._images.get(identity);
      if (!pending) {
        pending = (async () => {
          const resource = await this._resources.resource(ref.namespace, ref.key, ref.contentVersion);
          if (resource.mime !== "image/png") throw new TypeError("M14 map resources must be image/png");
          const bitmap = await createImageBitmap(new Blob([resource.bytes], { type: resource.mime }));
          if (this._images.get(identity) !== pending) {
            if (typeof bitmap.close === "function") {
              try { bitmap.close(); } catch { /* stale */ }
            }
            throw new TypeError("stale map image decode");
          }
          const owners = this._owners.get(identity);
          if (!owners || owners.size === 0) {
            if (typeof bitmap.close === "function") {
              try { bitmap.close(); } catch { /* unowned */ }
            }
            this._images.delete(identity);
            throw new TypeError("unowned map image decode");
          }
          this._bitmaps.set(identity, bitmap);
          return bitmap;
        })();
        this._images.set(identity, pending);
        pending.catch(() => {
          if (this._images.get(identity) === pending) this._images.delete(identity);
        });
      }
      return pending;
    }
  }

  class LoomRealmMapView extends ResourceHost {
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{display:flex;flex-direction:column;position:relative;overflow:hidden;width:100vw;height:100vh;background:#000;color:#fff;font:14px/1.2 system-ui,sans-serif}.map-content{position:relative;flex:none;overflow:hidden;background:#000}.map-world{position:relative;transform-origin:0 0}.map-footer{box-sizing:border-box;flex:none;display:flex;align-items:center;padding:0 12px;background:#171717;color:#fff;white-space:nowrap;overflow:hidden}.map-name{overflow:hidden;text-overflow:ellipsis}.map-error{position:absolute;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.72);color:#ffb4b4;text-align:center}.map-error[aria-hidden=false]{display:flex}canvas.tile-layer,canvas.sprite-visual{position:absolute;display:block;image-rendering:pixelated;pointer-events:none}canvas.tile-layer[hidden],canvas.sprite-visual[hidden]{display:none}slot{display:contents}::slotted(lr-map-sprite){display:block;position:absolute;visibility:hidden;image-rendering:pixelated;pointer-events:none}";
      this._style = style;
      this._layers = [];
      this._content = document.createElement("div");
      this._content.className = "map-content";
      this._world = document.createElement("div");
      this._world.className = "map-world";
      this._slot = document.createElement("slot");
      this._error = document.createElement("div");
      this._error.className = "map-error";
      this._error.setAttribute("role", "status");
      this._error.setAttribute("aria-hidden", "true");
      this._error.textContent = "Map visual failed to load";
      this._footer = document.createElement("footer");
      this._footer.className = "map-footer";
      this._mapName = document.createElement("span");
      this._mapName.className = "map-name";
      this._footer.append(this._mapName);
      this._world.append(this._slot);
      this._content.append(this._world, this._error);
      shadow.append(style, this._content, this._footer);
      this._slot.addEventListener("slotchange", () => {
        const children = new Set(this._spriteChildren());
        for (const sprite of this._desiredSprites?.keys() ?? []) if (!children.has(sprite)) this._desiredSprites.delete(sprite);
        this._sequence += 1;
        void this._prepare(this._sequence);
      });
      this._animationStartedAt = performance.now();
      this._sequence = 0;
      this._desiredView = undefined;
      this._desiredSprites = new Map();
      this._accepted = undefined;
      this._acceptedVisualScene = undefined;
      this._stagingVisualScene = undefined;
      this._raf = undefined;
      this._retry = undefined;
      this._autotileTimer = undefined;
      this._retryAttempts = 0;
      this._activeMotion = null;
      this._latestData = undefined;
      this._lastPaintedCamera = undefined;
      this._paintEpoch = 0;
      this._state = "EMPTY";
      this._tileDrawCount = 0;
      this._tileClearCount = 0;
      this._tileResizeCount = 0;
      this._surfaceAllocations = 0;
      this._surfaceResizes = 0;
      this._fullRasterPasses = 0;
      this._fullRasterScenePasses = 0;
      this._fullRasterNoOverlapPasses = 0;
      this._fullRasterResizePasses = 0;
      this._fullRasterFallbackPasses = 0;
      this._incrementalRasterPasses = 0;
      this._dirtyCellDraws = 0;
      this._projectionShifts = 0;
      this._cameraOnlyCommits = 0;
      this._overlapSnapshots = 0;
      this._overlapSnapshotPixels = 0;
      this._overlapSnapshotMaxPixels = 0;
      this._overlapReadBytes = 0;
      this._overlapWriteBytes = 0;
      this._overlapGetImageDataMs = 0;
      this._overlapPutImageDataMs = 0;
      this._overlapCopyMs = 0;
      this._surfacePool = [];
      this._liveSurfaces = new Set();
      this._liveSurfaceCount = 0;
      this._acceptedIds = new Set();
    }

    _hostRule() {
      const sheet = this._style.sheet;
      if (!sheet) return undefined;
      return [...sheet.cssRules].find((rule) => rule.selectorText === ":host");
    }

    _applyViewportBox(width, height) {
      const rule = this._hostRule();
      if (!rule) return;
      rule.style.width = `${width}px`;
      rule.style.height = `${height}px`;
    }

    _applyLayout(view, geometry) {
      this._applyViewportBox(view.viewportWidth, view.viewportHeight);
      const contentWidth = view.contentWidth ?? view.viewportWidth;
      const contentHeight = view.contentHeight ?? view.viewportHeight;
      const logicalWidth = view.logicalWidth ?? contentWidth;
      const logicalHeight = view.logicalHeight ?? contentHeight;
      this._content.style.width = `${contentWidth}px`;
      this._content.style.height = `${contentHeight}px`;
      this._world.style.width = `${logicalWidth}px`;
      this._world.style.height = `${logicalHeight}px`;
      this._world.style.transform = `scale(${view.scaleX ?? 1}, ${view.scaleY ?? 1})`;
      this._world.style.backgroundColor = "#fff";
      if (geometry.visibleMap) {
        const rect = geometry.visibleMap;
        this._world.style.backgroundImage = "linear-gradient(#000,#000)";
        this._world.style.backgroundPosition = `${rect.x0}px ${rect.y0}px`;
        this._world.style.backgroundSize = `${rect.x1 - rect.x0}px ${rect.y1 - rect.y0}px`;
        this._world.style.backgroundRepeat = "no-repeat";
      } else {
        this._world.style.backgroundImage = "none";
      }
      this._footer.style.width = `${view.viewportWidth}px`;
      this._footer.style.height = `${view.barHeight ?? 0}px`;
      this._footer.hidden = !(view.barHeight > 0);
      this._mapName.textContent = view.mapName ?? String(view.mapId);
    }

    _presentationGeometry(view) {
      return presentationGeometry(view);
    }

    _spriteRule() {
      const sheet = this._style.sheet;
      if (!sheet) return undefined;
      return [...sheet.cssRules].find((rule) => rule.selectorText && rule.selectorText.includes("lr-map-sprite"));
    }

    _cancelRaf() {
      if (this._raf !== undefined) {
        cancelAnimationFrame(this._raf);
        this._raf = undefined;
      }
      for (const sprite of this._spriteChildren()) sprite._raf = undefined;
    }

    _cancelAutotileTimer() {
      if (this._autotileTimer !== undefined) {
        clearTimeout(this._autotileTimer);
        this._autotileTimer = undefined;
      }
    }

    _cancelRetry() {
      if (this._retry !== undefined) {
        clearTimeout(this._retry);
        this._retry = undefined;
      }
    }

    _spriteChild() {
      return this._spriteChildren()[0];
    }

    _spriteChildren() {
      const assigned = this._slot.assignedElements ? this._slot.assignedElements() : [...this.children];
      return assigned.filter((node) => node.tagName === "LR-MAP-SPRITE");
    }

    _candidateOwner(sequence) {
      return `c:${sequence}`;
    }

    _preparationOwner(sceneEpoch, sequence) {
      const acceptedEpoch = this._acceptedVisualScene?.view.sceneEpoch;
      if (acceptedEpoch === undefined || acceptedEpoch === sceneEpoch) return this._candidateOwner(sequence);
      if (this._stagingVisualScene?.sceneEpoch !== sceneEpoch) {
        if (this._stagingVisualScene) this._disown(this._stagingVisualScene.owner);
        this._stagingVisualScene = {
          sceneEpoch,
          owner: `staging:${sceneEpoch}`,
          latestSequence: sequence,
          state: "PREPARING",
        };
      } else {
        this._stagingVisualScene.latestSequence = sequence;
        this._stagingVisualScene.state = "PREPARING";
      }
      return this._stagingVisualScene.owner;
    }

    _releasePreparationOwner(owner) {
      if (this._stagingVisualScene?.owner === owner) return;
      this._disown(owner);
    }

    disconnectedCallback() {
      queueMicrotask(() => {
        if (!this.isConnected) {
          this._sequence += 1;
          this._cancelRaf();
          this._cancelAutotileTimer();
          this._cancelRetry();
          this._activeMotion = null;
          this._state = "DISPOSED";
          this._accepted = undefined;
          this._acceptedVisualScene = undefined;
          this._stagingVisualScene = undefined;
          this._releaseAll();
          for (const layer of [...this._liveSurfaces]) layer.canvas.remove();
          this._layers = [];
          this._surfacePool = [];
          this._liveSurfaces.clear();
          this._liveSurfaceCount = 0;
          for (const sprite of this._spriteChildren()) if (typeof sprite._releaseAll === "function") sprite._releaseAll();
        }
      });
    }

    receiveRenderData(data) {
      assertMapViewData(data);
      this._latestData = data;
      this._desiredView = { data, receivedAt: performance.now() };
      this._sequence += 1;
      this._paintEpoch = this._sequence;
      this._cancelRetry();
      this._cancelAutotileTimer();
      this._retryAttempts = 0;
      this._disown(this._candidateOwner(this._sequence - 1));
      qualify("presentation-received", { element: "map-view", motionId: data.motionId });
      void this._prepare(this._sequence);
    }

    _receiveSprite(sprite, data, receivedAt) {
      this._desiredSprites.set(sprite, { sprite, data, receivedAt });
      this._sequence += 1;
      this._paintEpoch = this._sequence;
      this._cancelRetry();
      this._cancelAutotileTimer();
      this._retryAttempts = 0;
      this._disown(this._candidateOwner(this._sequence - 1));
      void this._prepare(this._sequence);
    }

    async _prepare(sequence) {
      const view = this._desiredView;
      if (!view || sequence !== this._sequence || !this.isConnected) return;
      const spriteChildren = this._spriteChildren();
      const spriteEntries = spriteChildren.map((child) => this._desiredSprites.get(child));
      if (spriteEntries.length === 0 || spriteEntries.some((entry) => !entry)) return;
      const player = spriteEntries[0];
      for (const entry of spriteEntries) {
        if (entry.data.sceneEpoch !== view.data.sceneEpoch || entry.data.visualEpoch !== view.data.visualEpoch || entry.data.bridgeLevel !== view.data.bridgeLevel) return;
      }
      // Nodes arrive one at a time. A shared epoch whose motion is not paired yet
      // must wait for the sibling update instead of failing the presentation.
      if (player && ((view.data.cameraMotion === null) !== (player.data.motion === null) || view.data.motionId !== player.data.motionId || view.data.bridgeLevel !== player.data.bridgeLevel)) {
        return;
      }
      const geometry = presentationGeometry(view.data);
      this._state = "PREPARING";
      if (
        this._accepted
        && this._accepted.view.sceneEpoch === view.data.sceneEpoch
        && this._accepted.view.visualEpoch === view.data.visualEpoch
        && this._accepted.view.tiles === view.data.tiles
        && resourceIdentity(this._accepted.view.tileset) === resourceIdentity(view.data.tileset)
        && (this._accepted.sprites?.length ?? 0) === spriteEntries.length
        && spriteEntries.every((entry) => this._accepted.sprites?.some((old) => old.sprite === entry.sprite && resourceIdentity(old.data.sprite) === resourceIdentity(entry.data.sprite)))
      ) {
        const prepared = {
          ...this._accepted,
          view: view.data,
          sprites: spriteEntries.map((entry) => ({ ...this._accepted.sprites.find((old) => old.sprite === entry.sprite), sprite: entry.sprite, data: entry.data })),
          pairReceivedAt: player ? Math.min(view.receivedAt, player.receivedAt) : view.receivedAt,
          layers: this._layers,
          geometry,
        };
        this._cameraOnlyCommits += 1;
        this._commitMotion(prepared, sequence);
        this._accepted = prepared;
        this._acceptedVisualScene = prepared;
        this._state = "VISIBLE";
        this._cancelRaf();
        this._cancelAutotileTimer();
        this._tickAccepted(prepared, sequence, false);
        return;
      }
      const owner = this._preparationOwner(view.data.sceneEpoch, sequence);
      let tiles;
      try {
        tiles = expandTiles(view.data);
      } catch {
        this._failPrepare(sequence);
        return;
      }
      const resources = usedResources(view.data, tiles);
      for (const { ref } of resources.usedSlots) {
        if (autotileFrameDurationMs(ref) === null) {
          this._failPrepare(sequence);
          return;
        }
      }
      let decoded = new Map();
      let preparedSprites = [];
      try {
        for (const identity of resources.uniqueRefs.keys()) this._own(identity, owner);
        if (resources.uniqueRefs.size > 0) {
          decoded = new Map(await Promise.all([...resources.uniqueRefs.entries()].map(async ([identity, ref]) => [identity, await this._image(ref)])));
        }
        preparedSprites = await Promise.all(spriteEntries.map(async (entry) => {
          const spriteId = resourceIdentity(entry.data.sprite);
          this._own(spriteId, owner);
          return { sprite: entry.sprite, data: entry.data, receivedAt: entry.receivedAt, image: await this._image(entry.data.sprite), resourceId: spriteId };
        }));
      } catch {
        this._releasePreparationOwner(owner);
        if (this._stagingVisualScene?.owner === owner) this._stagingVisualScene.state = "FAILED";
        this._failPrepare(sequence);
        return;
      }
      if (sequence !== this._sequence || !this.isConnected || this._desiredView !== view) {
        this._releasePreparationOwner(owner);
        return;
      }
      const autotiles = new Map();
      for (const { slot, ref } of resources.usedSlots) {
        const image = decoded.get(resourceIdentity(ref));
        const layout = classifyAutotileLayout(image);
        const durationMs = autotileFrameDurationMs(ref);
        if (layout === "invalid" || durationMs === null) {
          this._releasePreparationOwner(owner);
          if (this._stagingVisualScene?.owner === owner) this._stagingVisualScene.state = "FAILED";
          this._failPrepare(sequence);
          return;
        }
        const frameWidth = layout === "block" ? 96 : 32;
        autotiles.set(slot, { image, layout, frameCount: image.width / frameWidth, frameWidth, durationMs });
      }
      const prepared = {
        tilesetImage: resources.needsTileset ? decoded.get(resourceIdentity(view.data.tileset)) : undefined,
        autotiles,
        buckets: bucketTiles(tiles),
        view: view.data,
        sprites: preparedSprites,
        pairReceivedAt: player ? Math.min(view.receivedAt, player.receivedAt) : view.receivedAt,
        resourceIds: new Set([...resources.uniqueRefs.keys(), ...preparedSprites.map((entry) => entry.resourceId)]),
        owner,
        geometry,
      };
      try {
        prepared.reusesAcceptedLayers = Boolean(
          this._acceptedVisualScene
          && this._acceptedVisualScene.view.sceneEpoch === prepared.view.sceneEpoch
          && this._acceptedVisualScene.view.visualEpoch === prepared.view.visualEpoch
          && resourceIdentity(this._acceptedVisualScene.view.tileset) === resourceIdentity(prepared.view.tileset)
          && autotileIdentitiesEqual(this._acceptedVisualScene.view.autotiles, prepared.view.autotiles)
          && projectionBoundsEqual(this._acceptedVisualScene.view.projectionBounds, prepared.view.projectionBounds)
          && projectedTilesEqual(this._acceptedVisualScene.view.tiles, prepared.view.tiles)
          && this._acceptedVisualScene.view.bridgeLevel === prepared.view.bridgeLevel,
        );
        if (prepared.reusesAcceptedLayers) {
          prepared.layers = this._layers;
          prepared.buckets = this._acceptedVisualScene.buckets;
          prepared.tilesetImage = this._acceptedVisualScene.tilesetImage;
          prepared.autotiles = this._acceptedVisualScene.autotiles;
        } else {
          prepared.layers = this._rasterDetached(prepared, sequence);
        }
        prepared.sprites = prepared.sprites.map((entry) => ({ ...entry, visual: this._rasterSpriteDetached(entry) }));
      } catch {
        this._releasePreparationOwner(owner);
        if (this._stagingVisualScene?.owner === owner) this._stagingVisualScene.state = "FAILED";
        this._failPrepare(sequence);
        return;
      }
      if (sequence !== this._sequence || !this.isConnected || this._desiredView !== view) {
        this._releasePreparationOwner(owner);
        return;
      }
      this._commitAtomic(prepared, sequence);
    }

    _failPrepare(sequence) {
      if (sequence !== this._sequence) return;
      this._cancelRaf();
      this._cancelAutotileTimer();
      if (!this._accepted) this._state = "EMPTY";
      else this._state = "VISIBLE";
      if (this._retryAttempts >= RETRY_MS.length) {
        this.dataset.mapVisualState = "failed";
        this._error.setAttribute("aria-hidden", "false");
        qualify("map-prepare-exhausted", { element: "map-view" });
        return;
      }
      const delay = RETRY_MS[this._retryAttempts];
      this._retryAttempts += 1;
      this._state = "RETRY_WAIT";
      this._retry = setTimeout(() => {
        this._retry = undefined;
        void this._prepare(this._sequence);
      }, delay);
    }

    _resizeLayer(layer, bounds, exact = false) {
      const width = Math.max(1, exact ? bounds.width : Math.max(layer.canvas.width, bounds.width));
      const height = Math.max(1, exact ? bounds.height : Math.max(layer.canvas.height, bounds.height));
      const resized = layer.canvas.width !== width || layer.canvas.height !== height;
      if (resized) {
        this._tileResizeCount += 1;
        this._surfaceResizes += 1;
        layer.canvas.width = width;
        layer.canvas.height = height;
        layer.context = layer.canvas.getContext("2d", { alpha: true });
        layer.context.imageSmoothingEnabled = false;
      }
      layer.worldX = bounds.minX;
      layer.worldY = bounds.minY;
      return resized;
    }

    _makeLayer(depth, bounds) {
      let layer = this._surfacePool.pop();
      if (!layer) {
        const canvas = document.createElement("canvas");
        canvas.className = "tile-layer";
        layer = { canvas, context: canvas.getContext("2d", { alpha: true }), worldX: bounds.minX, worldY: bounds.minY, depth };
        layer.context.imageSmoothingEnabled = false;
        this._surfaceAllocations += 1;
        this._liveSurfaces.add(layer);
        this._liveSurfaceCount = this._liveSurfaces.size;
      }
      layer.depth = depth;
      layer.canvas.hidden = true;
      this._resizeLayer(layer, bounds, layer.canvas.width === 300 && layer.canvas.height === 150);
      layer.context.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
      layer.projectionBounds = undefined;
      layer.frames = undefined;
      return layer;
    }

    _recycleLayer(layer) {
      layer.canvas.hidden = true;
      layer.canvas.remove();
      layer.context.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
      layer.frames = undefined;
      layer.projectionBounds = undefined;
      if (this._surfacePool.length < SURFACE_POOL_BUDGET) {
        this._surfacePool.push(layer);
      } else {
        this._liveSurfaces.delete(layer);
        this._liveSurfaceCount = this._liveSurfaces.size;
      }
    }

    _rasterDetached(prepared, sequence) {
      const now = performance.now();
      const frames = new Map();
      for (const [slot, item] of prepared.autotiles.entries()) {
        frames.set(slot, autotileFrameIndex(now, this._animationStartedAt, item.frameCount, item.durationMs));
      }
      const groups = [...prepared.buckets.entries()].sort(([left], [right]) => left - right);
      const sameScene = Boolean(
        this._acceptedVisualScene
        && this._acceptedVisualScene.view.sceneEpoch === prepared.view.sceneEpoch
        && resourceIdentity(this._acceptedVisualScene.view.tileset) === resourceIdentity(prepared.view.tileset)
        && autotileIdentitiesEqual(this._acceptedVisualScene.view.autotiles, prepared.view.autotiles),
      );
      for (let index = 0; index < groups.length; index += 1) {
        const [depth, tiles] = groups[index];
        for (const tile of tiles) fault("draw", { sequence, index, depth, tile, connected: false, hostHasCanvas: false });
      }
      if (sameScene) return this._rasterIncremental(prepared, groups, frames);
      this._fullRasterPasses += 1;
      this._fullRasterScenePasses += 1;
      const layers = [];
      const currentStacks = stacksByCell(prepared.buckets);
      for (const [depth, tiles] of groups) {
        const bounds = depthBounds(tiles);
        const layer = this._makeLayer(depth, bounds);
        const seen = new Set();
        for (const tile of tiles) {
          const key = cellKey(depth, tile.x, tile.y);
          if (seen.has(key)) continue;
          seen.add(key);
          const stack = currentStacks.get(key) ?? [tile];
          for (const item of stack) this._blitTile(layer, item, prepared, frames);
        }
        layer.projectionBounds = prepared.view.projectionBounds;
        layer.frames = frames;
        layers.push(layer);
      }
      return layers;
    }

    _recordOverlapSnapshot(pixels, getMs) {
      this._overlapSnapshots += 1;
      this._overlapSnapshotPixels += pixels;
      if (pixels > this._overlapSnapshotMaxPixels) this._overlapSnapshotMaxPixels = pixels;
      this._overlapReadBytes += pixels * 4;
      this._overlapGetImageDataMs += getMs;
      this._overlapCopyMs += getMs;
    }

    _recordOverlapRestore(pixels, putMs) {
      this._overlapWriteBytes += pixels * 4;
      this._overlapPutImageDataMs += putMs;
      this._overlapCopyMs += putMs;
    }

    _cellIntersectsRect(x, y, rect) {
      if (!rect) return false;
      const x0 = x * TILE;
      const y0 = y * TILE;
      const x1 = x0 + TILE;
      const y1 = y0 + TILE;
      return x0 < rect.x1 && x1 > rect.x0 && y0 < rect.y1 && y1 > rect.y0;
    }

    _rasterIncremental(prepared, groups, frames) {
      const previousByDepth = new Map(this._layers.map((layer) => [layer.depth, layer]));
      const previousStacks = stacksByCell(this._acceptedVisualScene.buckets);
      const currentStacks = stacksByCell(prepared.buckets);
      const previousBounds = this._acceptedVisualScene.view.projectionBounds;
      const nextBounds = prepared.view.projectionBounds;
      const shifted = !projectionBoundsEqual(previousBounds, nextBounds);
      if (shifted) this._projectionShifts += 1;
      const projectionOverlap = {
        x0: Math.max(previousBounds.minTileX, nextBounds.minTileX) * TILE,
        y0: Math.max(previousBounds.minTileY, nextBounds.minTileY) * TILE,
        x1: (Math.min(previousBounds.maxTileX, nextBounds.maxTileX) + 1) * TILE,
        y1: (Math.min(previousBounds.maxTileY, nextBounds.maxTileY) + 1) * TILE,
      };
      const hasProjectionOverlap = projectionOverlap.x0 < projectionOverlap.x1 && projectionOverlap.y0 < projectionOverlap.y1;
      const layers = [];
      let reusedAnyCell = false;
      let sawResize = false;
      let sawRestoredOverlap = false;
      let drewAnyCell = false;
      for (const [depth, tiles] of groups) {
        const nextPixels = depthBounds(tiles);
        let layer = previousByDepth.get(depth);
        const previous = layer;
        if (layer) previousByDepth.delete(depth);
        else layer = this._makeLayer(depth, nextPixels);
        const oldWorldX = layer.worldX;
        const oldWorldY = layer.worldY;
        // depthBounds can move the layer origin even when projectionBounds are
        // unchanged (e.g. deleting the left/top edge tile). Canvas size may stay
        // put via max(old,new), so pixels must be remapped before reuse.
        const originChanged = Boolean(previous)
          && (oldWorldX !== nextPixels.minX || oldWorldY !== nextPixels.minY);
        const needsPixelRemap = shifted || originChanged;
        const overlap = previous && hasProjectionOverlap ? {
          x0: Math.max(projectionOverlap.x0, oldWorldX, nextPixels.minX),
          y0: Math.max(projectionOverlap.y0, oldWorldY, nextPixels.minY),
          x1: Math.min(projectionOverlap.x1, oldWorldX + layer.canvas.width, nextPixels.minX + nextPixels.width),
          y1: Math.min(projectionOverlap.y1, oldWorldY + layer.canvas.height, nextPixels.minY + nextPixels.height),
        } : null;
        const hasOverlap = Boolean(overlap && overlap.x0 < overlap.x1 && overlap.y0 < overlap.y1);
        let snapshot = null;
        let restoredThisLayer = false;
        if (previous && needsPixelRemap && hasOverlap) {
          const width = overlap.x1 - overlap.x0;
          const height = overlap.y1 - overlap.y0;
          const pixels = width * height;
          const getStarted = performance.now();
          snapshot = layer.context.getImageData(
            overlap.x0 - oldWorldX,
            overlap.y0 - oldWorldY,
            width,
            height,
          );
          this._recordOverlapSnapshot(pixels, performance.now() - getStarted);
        }
        const resized = this._resizeLayer(layer, nextPixels, false);
        if (resized) sawResize = true;
        if (!previous || needsPixelRemap || resized) {
          layer.context.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
          if (snapshot && !resized) {
            const putStarted = performance.now();
            layer.context.putImageData(snapshot, overlap.x0 - layer.worldX, overlap.y0 - layer.worldY);
            this._recordOverlapRestore(snapshot.width * snapshot.height, performance.now() - putStarted);
            restoredThisLayer = true;
            sawRestoredOverlap = true;
          }
        }
        // Depth+cell membership: clear stale pixels restored from an overlap
        // snapshot (or still present on an unshifted canvas) when the cell is
        // no longer present at this depth in the new projection.
        if (previous && !resized) {
          const restoredRect = restoredThisLayer && hasOverlap ? overlap : null;
          for (const [key, stack] of previousStacks) {
            const sample = stack[0];
            if (!sample || sample.depth !== depth || currentStacks.has(key)) continue;
            if (needsPixelRemap) {
              if (!restoredRect || !this._cellIntersectsRect(sample.x, sample.y, restoredRect)) continue;
            }
            this._clearCell(layer, sample.x, sample.y);
          }
        }
        const seen = new Set();
        for (const tile of tiles) {
          const key = cellKey(depth, tile.x, tile.y);
          if (seen.has(key)) continue;
          seen.add(key);
          const stack = currentStacks.get(key) ?? [tile];
          const inOverlap = hasOverlap
            && tile.x * TILE >= overlap.x0 && tile.y * TILE >= overlap.y0
            && (tile.x + 1) * TILE <= overlap.x1 && (tile.y + 1) * TILE <= overlap.y1;
          const reusable = previous && !resized && Boolean(snapshot || !needsPixelRemap) && inOverlap
            && sameTileStack(previousStacks.get(key), stack)
            && autotileFramesMatch(stack, previous.frames, frames);
          if (reusable) {
            reusedAnyCell = true;
            continue;
          }
          this._clearCell(layer, tile.x, tile.y);
          this._dirtyCellDraws += 1;
          drewAnyCell = true;
          for (const item of stack) this._blitTile(layer, item, prepared, frames);
        }
        layer.projectionBounds = nextBounds;
        layer.frames = frames;
        layers.push(layer);
      }
      if (reusedAnyCell) {
        this._incrementalRasterPasses += 1;
      } else if (sawResize) {
        this._fullRasterResizePasses += 1;
      } else if (shifted && !sawRestoredOverlap) {
        this._fullRasterNoOverlapPasses += 1;
      } else if (drewAnyCell) {
        this._fullRasterFallbackPasses += 1;
      } else {
        this._incrementalRasterPasses += 1;
      }
      prepared.incrementalLayers = true;
      prepared.retiredLayers = [...previousByDepth.values()];
      return layers;
    }

    _rasterSpriteDetached(entry) {
      const image = entry?.image;
      const data = entry?.data;
      if (!image || !data) return undefined;
      const motion = data.motion;
      const now = performance.now();
      const active = this._activeMotion;
      const duration = active?.durationMs ?? motion?.durationMs ?? 250;
      const progress = active && motion ? clamp((now - active.startedAt) / duration, 0, 1) : 1;
      const pattern = motion ? (progress < 0.5 ? data.pattern : (data.pattern + 1) % 4) : data.pattern;
      const canvas = document.createElement("canvas");
      canvas.className = "sprite-visual";
      const frameWidth = image.width / 4;
      const frameHeight = image.height / 4;
      if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) throw new TypeError("Character sheet must be 4 by 4");
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      const context = canvas.getContext("2d", { alpha: true });
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, frameWidth, frameHeight);
      context.drawImage(image, pattern * frameWidth, ((data.direction - 2) / 2) * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
      canvas._context = context;
      canvas._cropKey = `${resourceIdentity(data.sprite)}|${data.direction}|${pattern}|${frameWidth}x${frameHeight}`;
      return canvas;
    }

    _promoteResources(prepared) {
      const nextIds = prepared.resourceIds ?? new Set();
      for (const identity of nextIds) this._own(identity, "accepted");
      for (const identity of [...this._acceptedIds]) {
        if (nextIds.has(identity)) continue;
        const owners = this._owners.get(identity);
        owners?.delete("accepted");
        if (!owners || owners.size === 0) {
          this._release(identity);
          this._images.delete(identity);
        }
      }
      this._acceptedIds = nextIds;
      this._disown(prepared.owner);
    }

    _commitAtomic(prepared, sequence) {
      if (sequence !== this._sequence || !this.isConnected) {
        this._releasePreparationOwner(prepared.owner);
        if (!prepared.reusesAcceptedLayers && !prepared.incrementalLayers) {
          for (const layer of prepared.layers ?? []) this._recycleLayer(layer);
        }
        return;
      }
      this._commitMotion(prepared, sequence);
      const incoming = prepared.layers;
      const outgoing = this._layers.slice();
      const incomingSprites = prepared.sprites.map((entry) => entry.visual).filter(Boolean);
      const outgoingSprites = (this._acceptedVisualScene?.sprites ?? []).map((entry) => entry.visual).filter(Boolean);
      if (prepared.incrementalLayers) {
        for (const layer of prepared.retiredLayers ?? []) this._recycleLayer(layer);
      } else if (!prepared.reusesAcceptedLayers) {
        for (const layer of outgoing) {
          layer.canvas.hidden = true;
          layer.canvas.remove();
          if (!incoming.includes(layer)) this._recycleLayer(layer);
        }
      }
      for (const visual of outgoingSprites) visual.hidden = true;
      if (!prepared.reusesAcceptedLayers) {
        for (const layer of incoming) {
          layer.canvas.hidden = false;
          if (!layer.canvas.isConnected) this._world.insertBefore(layer.canvas, this._slot);
        }
      }
      for (const visual of incomingSprites) {
        visual.hidden = false;
        this._world.insertBefore(visual, this._slot);
      }
      for (const visual of outgoingSprites) if (!incomingSprites.includes(visual)) visual.remove();
      this._layers = incoming;
      this._liveSurfaceCount = this._liveSurfaces.size;
      this._promoteResources(prepared);
      this._accepted = prepared;
      this._acceptedVisualScene = prepared;
      if (this._stagingVisualScene?.sceneEpoch === prepared.view.sceneEpoch) this._stagingVisualScene = undefined;
      this._state = "VISIBLE";
      this.dataset.mapVisualState = "ready";
      this._error.setAttribute("aria-hidden", "true");
      this._cancelRaf();
      this._cancelAutotileTimer();
      this._tickAccepted(prepared, sequence, true);
    }

    _commitMotion(prepared, sequence) {
      const player = prepared.sprites[0]?.data;
      const fingerprint = player ? motionFingerprint(prepared.view, player) : JSON.stringify([prepared.view.motionId, prepared.view.cameraMotion]);
      const now = performance.now();
      const duration = player?.motion?.durationMs ?? prepared.view.cameraMotion?.durationMs ?? 250;
      if (this._activeMotion && prepared.view.motionId === this._activeMotion.id && fingerprint !== this._activeMotion.fingerprint) {
        const previous = this._accepted;
        const sameVisual = previous
          && previous.view.visualEpoch === prepared.view.visualEpoch
          && previous.view.viewportWidth === prepared.view.viewportWidth
          && previous.view.viewportHeight === prepared.view.viewportHeight;
        if (sameVisual) throw new TypeError("Invalid map motion identity");
        const remaining = Math.max(0, this._activeMotion.startedAt + (this._activeMotion.durationMs ?? duration) - now);
        const visibleCamera = this._lastPaintedCamera;
        const visibleSprite = this._acceptedVisualScene?.sprites[0]?.visual?._lastPaintedScreen;
        if (prepared.view.cameraMotion && visibleCamera) {
          prepared.view = {
            ...prepared.view,
            cameraMotion: { ...prepared.view.cameraMotion, fromCameraX: visibleCamera.x, fromCameraY: visibleCamera.y },
          };
        }
        if (player?.motion && visibleSprite) {
          prepared.sprites[0] = {
            ...prepared.sprites[0],
            data: { ...player, motion: { ...player.motion, fromScreenX: visibleSprite.x, fromScreenY: visibleSprite.y } },
          };
        }
        this._activeMotion = remaining === 0
          ? { id: prepared.view.motionId, fingerprint, startedAt: now - duration, durationMs: duration }
          : { id: prepared.view.motionId, fingerprint, startedAt: now, durationMs: remaining };
      } else if (!this._activeMotion && prepared.view.motionId !== null) {
        this._activeMotion = { id: prepared.view.motionId, fingerprint, startedAt: prepared.pairReceivedAt, durationMs: duration };
      } else if (prepared.view.motionId === null) {
        this._activeMotion = null;
      } else if (this._activeMotion && prepared.view.motionId !== this._activeMotion.id) {
        this._activeMotion = { id: prepared.view.motionId, fingerprint, startedAt: prepared.pairReceivedAt, durationMs: duration };
      }
    }

    _tickAccepted(prepared, sequence, justCommitted) {
      if (sequence !== this._sequence || this._accepted !== prepared || !this.isConnected) return;
      const now = performance.now();
      const view = prepared.view;
      const player = prepared.sprites[0]?.data;
      const motion = view.cameraMotion;
      const active = this._activeMotion;
      const duration = active?.durationMs ?? motion?.durationMs ?? player?.motion?.durationMs ?? 250;
      const progress = active && (motion || player?.motion) ? clamp((now - active.startedAt) / duration, 0, 1) : 1;
      const cameraX = motion ? Math.round(lerp(motion.fromCameraX, view.cameraX, progress)) : view.cameraX;
      const cameraY = motion ? Math.round(lerp(motion.fromCameraY, view.cameraY, progress)) : view.cameraY;
      this._applyLayout(view, prepared.geometry);
      const frames = new Map();
      let hasAnimatedAutotile = false;
      for (const [slot, item] of prepared.autotiles.entries()) {
        if (item.frameCount > 1) hasAnimatedAutotile = true;
        frames.set(slot, autotileFrameIndex(now, this._animationStartedAt, item.frameCount, item.durationMs));
      }
      for (const layer of this._layers) {
        const tiles = prepared.buckets.get(layer.depth) ?? [];
        const bounds = { minX: layer.worldX, minY: layer.worldY };
        if (!justCommitted && this._autotileFrameDirty(layer, frames, tiles)) {
          this._drawDirtyAutotiles(layer, tiles, prepared, frames);
        }
        layer.frames = frames;
        layer.canvas.hidden = false;
        layer.canvas.style.zIndex = String(tileStackValue(layer.depth));
        layer.canvas.style.left = `${bounds.minX - cameraX + prepared.geometry.originX}px`;
        layer.canvas.style.top = `${bounds.minY - cameraY + prepared.geometry.originY}px`;
      }
      for (const [index, entry] of prepared.sprites.entries()) {
        this._paintSprite(entry.data, prepared, index === 0 ? progress : 1, entry.visual, entry.image, cameraX, cameraY, index !== 0, entry.sprite);
      }
      const previous = this._lastPaintedCamera;
      if (!previous || previous.x !== cameraX || previous.y !== cameraY) {
        qualify("browser-first-motion-paint", {
          element: "map-view",
          motionId: motion?.id ?? null,
          visualX: cameraX,
          visualY: cameraY,
        });
        this._lastPaintedCamera = { x: cameraX, y: cameraY };
      }
      if (motion && progress >= 1) qualify("browser-motion-complete", { element: "map-view", motionId: motion.id, visualX: cameraX, visualY: cameraY });
      this._cancelAutotileTimer();
      const needsMotionFrame = Boolean((motion || player?.motion) && progress < 1);
      if (needsMotionFrame) {
        this._raf = requestAnimationFrame(() => {
          this._raf = undefined;
          this._tickAccepted(prepared, sequence, false);
        });
        for (const child of this._spriteChildren()) child._raf = this._raf;
        return;
      }
      this._raf = undefined;
      for (const child of this._spriteChildren()) child._raf = undefined;
      if (hasAnimatedAutotile) this._scheduleAutotileTick(prepared, sequence, now);
    }

    _nextAutotileDelayMs(prepared, now) {
      let next = Infinity;
      for (const item of prepared.autotiles.values()) {
        if (item.frameCount <= 1 || !item.durationMs) continue;
        const elapsed = Math.max(0, now - this._animationStartedAt);
        const remainder = elapsed % item.durationMs;
        const delay = remainder === 0 ? item.durationMs : item.durationMs - remainder;
        if (delay < next) next = delay;
      }
      return Number.isFinite(next) ? Math.max(1, next) : null;
    }

    _scheduleAutotileTick(prepared, sequence, now) {
      const delay = this._nextAutotileDelayMs(prepared, now);
      if (delay === null) return;
      this._autotileTimer = setTimeout(() => {
        this._autotileTimer = undefined;
        this._tickAccepted(prepared, sequence, false);
      }, delay);
    }

    _autotileFrameDirty(layer, frames, tiles) {
      if (!layer.frames) return true;
      for (const tile of tiles) {
        if (tile.visual[2] !== 1) continue;
        if (layer.frames.get(tile.visual[3]) !== frames.get(tile.visual[3])) return true;
      }
      return false;
    }

    _drawDirtyAutotiles(layer, tiles, prepared, frames) {
      const stacks = new Map();
      for (const tile of tiles) {
        const key = `${tile.x}:${tile.y}`;
        let list = stacks.get(key);
        if (!list) {
          list = [];
          stacks.set(key, list);
        }
        list.push(tile);
      }
      for (const stack of stacks.values()) {
        stack.sort((left, right) => left.z - right.z || left.y - right.y || left.x - right.x);
        let dirty = false;
        for (const tile of stack) {
          if (tile.visual[2] !== 1) continue;
          if (!layer.frames || layer.frames.get(tile.visual[3]) !== frames.get(tile.visual[3])) {
            dirty = true;
            break;
          }
        }
        if (!dirty) continue;
        this._clearCell(layer, stack[0].x, stack[0].y);
        for (const tile of stack) this._blitTile(layer, tile, prepared, frames);
      }
    }

    _clearCell(layer, x, y) {
      this._tileClearCount += 1;
      layer.context.clearRect(x * 32 - layer.worldX, y * 32 - layer.worldY, 32, 32);
    }

    _blitTile(layer, tile, prepared, frames) {
      this._tileDrawCount += 1;
      const dx = tile.x * 32 - layer.worldX;
      const dy = tile.y * 32 - layer.worldY;
      const visual = tile.visual;
      if (visual[2] === 0) {
        const source = visual[3];
        layer.context.drawImage(prepared.tilesetImage, (source % 8) * 32, Math.floor(source / 8) * 32, 32, 32, dx, dy, 32, 32);
        return;
      }
      const item = prepared.autotiles.get(visual[3]);
      const frameIndex = frames.get(visual[3]);
      if (item.layout === "cell") {
        layer.context.drawImage(item.image, frameIndex * 32, 0, 32, 32, dx, dy, 32, 32);
        return;
      }
      const frameX = frameIndex * 96;
      layer.context.drawImage(item.image, frameX + visual[4], visual[5], 16, 16, dx, dy, 16, 16);
      layer.context.drawImage(item.image, frameX + visual[6], visual[7], 16, 16, dx + 16, dy, 16, 16);
      layer.context.drawImage(item.image, frameX + visual[8], visual[9], 16, 16, dx, dy + 16, 16, 16);
      layer.context.drawImage(item.image, frameX + visual[10], visual[11], 16, 16, dx + 16, dy + 16, 16, 16);
    }

    _paintSprite(data, prepared, progress, spriteOverride, imageOverride, cameraX = prepared.view.cameraX, cameraY = prepared.view.cameraY, worldAnchored = false, desiredNode) {
      const sprite = spriteOverride;
      const spriteImage = imageOverride ?? prepared.sprites[0]?.image;
      if (!sprite || !spriteImage) return;
      const motion = data.motion;
      const pattern = motion ? (progress < 0.5 ? data.pattern : (data.pattern + 1) % 4) : data.pattern;
      const arc = motion?.kind === "jump" ? 4 * (motion.peakPx ?? 0) * progress * (1 - progress) : 0;
      const screenX = motion ? Math.round(lerp(motion.fromScreenX, data.screenX, progress)) : worldAnchored ? data.x * TILE - cameraX : data.screenX;
      const screenY = motion ? Math.round(lerp(motion.fromScreenY, data.screenY, progress) - arc) : worldAnchored ? data.y * TILE - cameraY : data.screenY;
      const visualPixelY = motion ? Math.round(lerp(motion.fromY * 32, data.y * 32, progress)) : data.y * 32;
      const frameWidth = spriteImage.width / 4;
      const frameHeight = spriteImage.height / 4;
      if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) throw new TypeError("Character sheet must be 4 by 4");
      const cropKey = `${resourceIdentity(data.sprite)}|${data.direction}|${pattern}|${frameWidth}x${frameHeight}`;
      if (sprite._cropKey !== cropKey) {
        const facingChanged = sprite._paintedDirection !== undefined && sprite._paintedDirection !== data.direction;
        sprite.width = frameWidth;
        sprite.height = frameHeight;
        const context = sprite._context ?? sprite.getContext("2d", { alpha: true });
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, frameWidth, frameHeight);
        context.drawImage(spriteImage, pattern * frameWidth, ((data.direction - 2) / 2) * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
        sprite._context = context;
        sprite._cropKey = cropKey;
        if (facingChanged) qualify("browser-facing-paint", { element: "map-sprite", motionId: motion?.id ?? null, direction: data.direction });
      }
      sprite._paintedDirection = data.direction;
      const depth = visualPixelY + 32 + (frameHeight > 32 ? 31 : 0);
      const left = screenX + prepared.geometry.originX + (32 - frameWidth) / 2;
      const top = screenY + prepared.geometry.originY + 32 - frameHeight;
      sprite.style.left = `${left}px`;
      sprite.style.top = `${top}px`;
      sprite.style.width = `${frameWidth}px`;
      sprite.style.height = `${frameHeight}px`;
      sprite.style.zIndex = String(characterStackValue(depth));
      sprite._lastPaintedScreen = { x: screenX, y: screenY };
      if (desiredNode) {
        desiredNode._lastPaintedScreen = { x: screenX, y: screenY };
        desiredNode._cropKey = cropKey;
        desiredNode.style.left = `${left}px`;
        desiredNode.style.top = `${top}px`;
        desiredNode.style.width = `${frameWidth}px`;
        desiredNode.style.height = `${frameHeight}px`;
        desiredNode.style.zIndex = String(characterStackValue(depth));
      }
      if (!sprite._reportedMotion || sprite._reportedMotion !== `${screenX},${screenY}`) {
        qualify("browser-first-motion-paint", {
          element: "map-sprite",
          motionId: motion?.id ?? null,
          visualX: screenX,
          visualY: screenY,
        });
        sprite._reportedMotion = `${screenX},${screenY}`;
      }
      if (motion && progress >= 1) qualify("browser-motion-complete", { element: "map-sprite", motionId: motion.id, visualX: screenX, visualY: screenY });
    }
  }

  class LoomRealmMapSprite extends ResourceHost {
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{position:absolute;display:block;image-rendering:pixelated;pointer-events:none}canvas{display:block;image-rendering:pixelated}";
      this._canvas = document.createElement("canvas");
      shadow.append(style, this._canvas);
      this._context = this._canvas.getContext("2d", { alpha: true });
      this._context.imageSmoothingEnabled = false;
      this._latestData = undefined;
      this._activeMotion = null;
      this._raf = undefined;
      this._paintEpoch = 0;
      this._cropKey = undefined;
      this._acceptedIds = new Set();
    }

    disconnectedCallback() {
      queueMicrotask(() => {
        if (!this.isConnected) {
          this._paintEpoch += 1;
          this._activeMotion = null;
          this._raf = undefined;
          this._releaseAll();
          const parent = this._viewParent();
          if (parent) parent._sequence += 1;
        }
      });
    }

    _viewParent() {
      const parent = this.parentElement;
      return parent && parent.tagName === "LR-MAP-VIEW" ? parent : undefined;
    }

    _installCanvas(canvas, cropKey) {
      if (this._canvas === canvas) {
        this._cropKey = cropKey;
        return;
      }
      this._canvas.replaceWith(canvas);
      this._canvas = canvas;
      this._context = canvas.getContext("2d", { alpha: true });
      this._context.imageSmoothingEnabled = false;
      this._cropKey = cropKey;
    }

    receiveRenderData(data) {
      assertMapSpriteData(data);
      const fingerprint = data.motion === null ? null : JSON.stringify([
        data.motion,
        data.x, data.y, data.screenX, data.screenY, data.pattern,
      ]);
      if (this._activeMotion && data.motion && data.motion.id === this._activeMotion.id && fingerprint !== this._activeMotion.fingerprint) {
        throw new TypeError("Invalid map motion identity");
      }
      if (data.motion === null) this._activeMotion = null;
      else if (!this._activeMotion || this._activeMotion.id !== data.motion.id) {
        this._activeMotion = { id: data.motion.id, fingerprint, startedAt: performance.now() };
      }
      this._latestData = data;
      this._paintEpoch += 1;
      qualify("presentation-received", { element: "map-sprite", motionId: data.motionId });
      const parent = this._viewParent();
      if (parent) parent._receiveSprite(this, data, performance.now());
    }

    _blitPatternSync(image, direction, pattern, identity) {
      const frameWidth = image.width / 4;
      const frameHeight = image.height / 4;
      if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) throw new TypeError("Character sheet must be 4 by 4");
      const key = `${identity}|${direction}|${pattern}|${frameWidth}x${frameHeight}`;
      if (this._cropKey !== key) {
        this._canvas.width = frameWidth;
        this._canvas.height = frameHeight;
        this._context.imageSmoothingEnabled = false;
        this._context.clearRect(0, 0, frameWidth, frameHeight);
        this._context.drawImage(image, pattern * frameWidth, ((direction - 2) / 2) * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
        this._cropKey = key;
      }
      return { width: frameWidth, height: frameHeight };
    }
  }

  customElements.define("lr-map-view", LoomRealmMapView);
  customElements.define("lr-map-sprite", LoomRealmMapSprite);
})();
