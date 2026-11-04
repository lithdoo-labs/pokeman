import { fail } from "../../../../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/errors.mjs";

const MAP_FILE = /^Map(\d+)\.rxdata$/u;

function invalid(message) {
  fail("M14_CONSUMER_PROJECTION_FAILURE", message);
}

export function projectRequiredInteger(value, label, { positive = false, nonNegative = false } = {}) {
  if (!Number.isSafeInteger(value) || (positive && value <= 0) || (nonNegative && value < 0)) {
    invalid(`${label} must be a ${positive ? "positive " : nonNegative ? "non-negative " : ""}safe integer`);
  }
  return value;
}

export function projectRequiredText(value, label) {
  if (value?.kind !== "RubyString" || typeof value.text !== "string" || value.text.length === 0) {
    invalid(`${label} must be a non-empty Ruby string`);
  }
  return value.text;
}

export function projectTable(value, label) {
  if (value?.kind !== "Table") invalid(`${label} must be an RGSS Table`);
  const dimensions = projectRequiredInteger(value.dimensions, `${label}.dimensions`, { positive: true });
  const xSize = projectRequiredInteger(value.xSize, `${label}.xSize`, { positive: true });
  const ySize = projectRequiredInteger(value.ySize, `${label}.ySize`, { positive: true });
  const zSize = projectRequiredInteger(value.zSize, `${label}.zSize`, { positive: true });
  if (!ArrayBuffer.isView(value.values) && !Array.isArray(value.values)) invalid(`${label}.values must be a decoded numeric sequence`);
  const values = Array.from(value.values);
  if (values.length !== xSize * ySize * zSize || values.some((item) => !Number.isSafeInteger(item))) {
    invalid(`${label} has an invalid value count or element`);
  }
  return Object.freeze({ dimensions, xSize, ySize, zSize, values: Object.freeze(values) });
}

export function projectMapRecord(entry) {
  const match = MAP_FILE.exec(entry?.filename ?? "");
  if (!match) return undefined;
  const id = Number(match[1]);
  projectRequiredInteger(id, "Map content key", { positive: true });
  const root = entry.root;
  if (root?.kind !== "RmxpObject" || root.className !== "RPG::Map") invalid(`${entry.filename} root must be RPG::Map`);
  const width = projectRequiredInteger(root.fields["@width"], "Map.width", { positive: true });
  const height = projectRequiredInteger(root.fields["@height"], "Map.height", { positive: true });
  const tileset_id = projectRequiredInteger(root.fields["@tileset_id"], "Map.tileset_id", { positive: true });
  const data = projectTable(root.fields["@data"], "Map.data");
  if (data.dimensions !== 3 || data.xSize !== width || data.ySize !== height || data.zSize !== 3) {
    invalid("Map.data shape does not agree with Map width/height and the required three layers");
  }
  return Object.freeze({ key: String(id), value: Object.freeze({ tileset_id, width, height, data }) });
}

function projectAutotileNames(value, label) {
  if (value?.kind !== "Array") invalid(`${label} must be a Ruby Array`);
  if (value.items.length !== 7) invalid(`${label} must have length 7`);
  return Object.freeze(value.items.map((item, index) => {
    if (item === null || item === undefined) return null;
    if (item?.kind !== "RubyString" || typeof item.text !== "string") {
      invalid(`${label}[${index}] must be nil or a Ruby string`);
    }
    return item.text.length === 0 ? null : item.text;
  }));
}

export function projectTilesetRecords(entry, requiredIds = new Set()) {
  if (entry?.filename !== "Tilesets.rxdata") return undefined;
  if (entry.root?.kind !== "Array") invalid("Tilesets.rxdata root must be an Array");
  if (entry.root.items[0] !== null && entry.root.items[0] !== undefined) invalid("Tilesets.rxdata[0] cannot have a positive consumer identity");
  const records = [];
  for (let index = 1; index < entry.root.items.length; index += 1) {
    const root = entry.root.items[index];
    if (root === null) continue;
    if (root?.kind !== "RmxpObject" || root.className !== "RPG::Tileset") invalid(`Tilesets.rxdata[${index}] must be RPG::Tileset or null`);
    const id = projectRequiredInteger(root.fields["@id"], `Tileset[${index}].id`, { positive: true });
    if (id !== index) invalid(`Tilesets.rxdata[${index}] id ${id} does not match its source index`);
    if (root.fields["@tileset_name"]?.kind === "RubyString" && root.fields["@tileset_name"].text === "" && !requiredIds.has(index)) continue;
    const tileset_name = projectRequiredText(root.fields["@tileset_name"], `Tileset[${index}].tileset_name`);
    const autotile_names = projectAutotileNames(root.fields["@autotile_names"], `Tileset[${index}].autotile_names`);
    const passages = projectTable(root.fields["@passages"], `Tileset[${index}].passages`);
    const priorities = projectTable(root.fields["@priorities"], `Tileset[${index}].priorities`);
    const terrain_tags = projectTable(root.fields["@terrain_tags"], `Tileset[${index}].terrain_tags`);
    for (const [name, table] of [["passages", passages], ["priorities", priorities], ["terrain_tags", terrain_tags]]) {
      if (table.dimensions !== 1 || table.ySize !== 1 || table.zSize !== 1) invalid(`Tileset[${index}].${name} must be a 1D Table`);
    }
    if (passages.xSize !== priorities.xSize || passages.xSize !== terrain_tags.xSize) {
      invalid(`Tileset[${index}] passages, priorities, and terrain_tags xSize must match`);
    }
    for (const [offset, tag] of terrain_tags.values.entries()) {
      if (!Number.isSafeInteger(tag) || tag < 0 || tag > 17) {
        invalid(`Tileset[${index}].terrain_tags[${offset}] must be an integer from 0 through 17`);
      }
    }
    records.push(Object.freeze({ key: String(index), value: Object.freeze({ id, tileset_name, autotile_names, passages, priorities, terrain_tags }) }));
  }
  return Object.freeze(records);
}

export function materializeM14ConsumerDomains(rmxpRoots) {
  const maps = [];
  for (const entry of rmxpRoots) {
    const map = projectMapRecord(entry);
    if (map) maps.push(map);
  }
  const requiredTilesets = new Set(maps.map(({ value }) => value.tileset_id));
  let tilesets;
  for (const entry of rmxpRoots) {
    const projectedTilesets = projectTilesetRecords(entry, requiredTilesets);
    if (projectedTilesets) {
      if (tilesets !== undefined) invalid("Duplicate Tilesets.rxdata roots");
      tilesets = projectedTilesets;
    }
  }
  return Object.freeze({
    Map: Object.freeze(maps),
    Tileset: Object.freeze(tilesets ?? []),
  });
}
