/**
 * Executable C-01..08 candidate rules. Not wired into Map Library runtime.
 * PROJECT DECISION until CONTRACT_V1 is signed; freeze remains NOT FROZEN.
 */

export const CONTRACT_CANDIDATE_VERSION = "terrain-behavior-contract-candidate/2026-09-20";
export const TERRAIN_TAG_MIN = 0;
export const TERRAIN_TAG_MAX = 17;
export const VANILLA_COMMIT = "ea7b5d56d2436591160983c4e641a2ceee2d875a";

export const C01_TILESET_KEYS = Object.freeze([
  "id",
  "tileset_name",
  "autotile_names",
  "passages",
  "priorities",
  "terrain_tags",
]);

export const C01_LEGACY_TILESET_KEYS = Object.freeze([
  "id",
  "tileset_name",
  "autotile_names",
  "passages",
  "priorities",
]);

function isProjectedTable(value) {
  return value != null
    && Number.isSafeInteger(value.dimensions)
    && Number.isSafeInteger(value.xSize)
    && Number.isSafeInteger(value.ySize)
    && Number.isSafeInteger(value.zSize)
    && Array.isArray(value.values);
}

function tableIssues(table, label, expected) {
  const issues = [];
  if (!isProjectedTable(table)) {
    issues.push(`${label}: not a ProjectedTable`);
    return issues;
  }
  if (expected.dimensions != null && table.dimensions !== expected.dimensions) {
    issues.push(`${label}: dimensions ${table.dimensions} != ${expected.dimensions}`);
  }
  if (expected.ySize != null && table.ySize !== expected.ySize) issues.push(`${label}: ySize ${table.ySize} != ${expected.ySize}`);
  if (expected.zSize != null && table.zSize !== expected.zSize) issues.push(`${label}: zSize ${table.zSize} != ${expected.zSize}`);
  const length = table.xSize * table.ySize * table.zSize;
  if (table.values.length !== length) issues.push(`${label}: values.length ${table.values.length} != ${length}`);
  return issues;
}

export function validateCandidateTilesetRecord(record, options = {}) {
  const issues = [];
  if (record == null || typeof record !== "object") {
    return Object.freeze({ ok: false, issues: Object.freeze(["record missing"]), error: "TILESET_RECORD_INVALID" });
  }
  const keys = Object.keys(record);
  const extra = keys.filter((key) => !C01_TILESET_KEYS.includes(key));
  if (extra.length > 0) issues.push(`unexpected keys: ${extra.join(",")}`);
  for (const key of C01_TILESET_KEYS) {
    if (!Object.hasOwn(record, key)) {
      if (key === "terrain_tags" && options.legacyFiveFields === true) {
        issues.push("legacy-five-fields-require-explicit-migration");
      } else {
        issues.push(`missing ${key}`);
      }
    }
  }
  if (!Number.isSafeInteger(record.id) || record.id <= 0) issues.push("id must be a positive safe integer");
  if (typeof record.tileset_name !== "string") issues.push("tileset_name must be a string");
  if (!Array.isArray(record.autotile_names) || record.autotile_names.length !== 7) {
    issues.push("autotile_names must be length 7");
  }
  issues.push(...tableIssues(record.passages, "passages", { dimensions: 1, ySize: 1, zSize: 1 }));
  issues.push(...tableIssues(record.priorities, "priorities", { dimensions: 1, ySize: 1, zSize: 1 }));
  issues.push(...tableIssues(record.terrain_tags, "terrain_tags", { dimensions: 1, ySize: 1, zSize: 1 }));
  if (record.passages && record.priorities && record.terrain_tags
    && isProjectedTable(record.passages) && isProjectedTable(record.priorities) && isProjectedTable(record.terrain_tags)) {
    if (record.passages.xSize !== record.priorities.xSize || record.passages.xSize !== record.terrain_tags.xSize) {
      issues.push("passages, priorities, and terrain_tags xSize must match");
    }
    for (const [index, tag] of (record.terrain_tags.values ?? []).entries()) {
      if (!Number.isSafeInteger(tag)) issues.push(`terrain_tags[${index}] is not a safe integer`);
      else if (tag < TERRAIN_TAG_MIN || tag > TERRAIN_TAG_MAX) issues.push(`terrain_tags[${index}]=${tag} outside ${TERRAIN_TAG_MIN}..${TERRAIN_TAG_MAX}`);
    }
  }
  return Object.freeze({
    ok: issues.length === 0,
    issues: Object.freeze(issues),
    error: issues.length === 0 ? null : "TILESET_RECORD_INVALID",
    migration: keys.length === 5 && C01_LEGACY_TILESET_KEYS.every((key) => keys.includes(key))
      ? "reject-legacy-five-fields-pending-explicit-migrator"
      : null,
  });
}

export function validateCandidateMapAction(record) {
  const issues = [];
  if (record == null || typeof record !== "object") return Object.freeze({ ok: false, issues: Object.freeze(["missing"]), error: "MAP_ACTION_INVALID" });
  for (const key of ["mapId", "eventId", "pageIndex", "commandIndex", "trigger", "occupied", "op"]) {
    if (!Object.hasOwn(record, key)) issues.push(`missing ${key}`);
  }
  if (record.trigger !== 1) issues.push("this round only projects player-touch trigger=1");
  if (record.op !== "bridge-on" && record.op !== "bridge-off") issues.push("op must be bridge-on or bridge-off");
  if (record.op === "bridge-on" && record.height !== 2) issues.push("bridge-on height is exactly 2 in this round");
  if (record.op === "bridge-off" && record.height != null) issues.push("bridge-off height must be null");
  if (!Array.isArray(record.occupied) || record.occupied.length < 1) issues.push("occupied must be a non-empty tile list");
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues), error: issues.length === 0 ? null : "MAP_ACTION_INVALID" });
}

export const CANDIDATE_JSON_EXAMPLES = Object.freeze({
  tilesetOk: Object.freeze({
    id: 1,
    tileset_name: "Outdoor",
    autotile_names: Object.freeze([null, null, null, null, null, null, null]),
    passages: Object.freeze({ dimensions: 1, xSize: 4, ySize: 1, zSize: 1, values: Object.freeze([0, 0, 0, 0]) }),
    priorities: Object.freeze({ dimensions: 1, xSize: 4, ySize: 1, zSize: 1, values: Object.freeze([0, 0, 0, 0]) }),
    terrain_tags: Object.freeze({ dimensions: 1, xSize: 4, ySize: 1, zSize: 1, values: Object.freeze([0, 13, 15, 1]) }),
  }),
  mapActionOn: Object.freeze({
    mapId: 21,
    eventId: 25,
    pageIndex: 0,
    commandIndex: 0,
    trigger: 1,
    occupied: Object.freeze([{ x: 2, y: 5 }]),
    op: "bridge-on",
    height: 2,
  }),
  mapActionOff: Object.freeze({
    mapId: 21,
    eventId: 23,
    pageIndex: 0,
    commandIndex: 0,
    trigger: 1,
    occupied: Object.freeze([{ x: 2, y: 6 }]),
    op: "bridge-off",
    height: null,
  }),
});

export const SUPPORT_MATRIX = Object.freeze({
  Neutral: { tag: 13, promised: true },
  Bridge: { tag: 15, promised: true },
  Ledge: { tag: 1, promised: true },
  otherTags0to17: { promised: false, retainNumericValue: true },
  npcCollision: { promised: false },
  crossMapJump: { promised: false },
  surfingBicycle: { promised: false },
});

export const BRIDGE_LEVEL_VALUES = Object.freeze({
  initial: 0,
  afterOn: 2,
  afterOff: 0,
  afterTransfer: 0,
  legal: Object.freeze([0, 2]),
  otherValues: "unsupported-this-round-fail-closed",
});
