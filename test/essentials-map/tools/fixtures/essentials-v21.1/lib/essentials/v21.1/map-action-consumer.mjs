import { fail } from "../../../../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/errors.mjs";

const MAP_FILE = /^Map(\d+)\.rxdata$/u;
const SIZE_EVENT = /size\((\d+),(\d+)\)/iu;
const SCRIPT_START = 355;
const SCRIPT_CONTINUE = 655;
const COMMAND_END = 0;
const BRIDGE_ON = /^\s*pbBridgeOn\s*(?:\(\s*(2)\s*\)|\(\s*\)|)\s*$/u;
const BRIDGE_OFF = /^\s*pbBridgeOff\s*(?:\(\s*\)|)\s*$/u;
const BRIDGE_MENTION = /\bpbBridge(?:On|Off)?\b/u;
const DYNAMIC_RUBY = /\b(eval|instance_eval|send|__send__|public_send|const_get)\s*[\(\[]|#\{/u;

function invalid(message) {
  fail("MAP_ACTION_CONSUMER_PROJECTION_FAILURE", message);
}

function rubyText(value) {
  if (value?.kind !== "RubyString" || typeof value.text !== "string") return null;
  return value.text;
}

function integer(value, label, { positive = false, nonNegative = false } = {}) {
  if (!Number.isSafeInteger(value) || (positive && value <= 0) || (nonNegative && value < 0)) {
    invalid(`${label} must be a ${positive ? "positive " : nonNegative ? "non-negative " : ""}safe integer`);
  }
  return value;
}

function pageEmptyGraphic(page) {
  const graphic = page.fields["@graphic"];
  if (graphic == null) return false;
  if (graphic.kind !== "RmxpObject" || graphic.className !== "RPG::Event::Page::Graphic") {
    return false;
  }
  const name = rubyText(graphic.fields["@character_name"]) ?? "";
  const tileId = graphic.fields["@tile_id"];
  return name.length === 0 && !(Number.isSafeInteger(tileId) && tileId > 0);
}

function pageAlwaysActive(page) {
  const condition = page.fields["@condition"];
  if (condition?.kind !== "RmxpObject" || condition.className !== "RPG::Event::Page::Condition") return false;
  return condition.fields["@switch1_valid"] === false
    && condition.fields["@switch2_valid"] === false
    && condition.fields["@variable_valid"] === false
    && condition.fields["@self_switch_valid"] === false;
}

export function occupiedTiles(x, y, width = 1, height = 1) {
  integer(x, "occupiedTiles.x", { nonNegative: true });
  integer(y, "occupiedTiles.y", { nonNegative: true });
  integer(width, "occupiedTiles.width", { positive: true });
  integer(height, "occupiedTiles.height", { positive: true });
  const tiles = [];
  for (let i = 0; i < width; i += 1) {
    for (let j = 0; j < height; j += 1) {
      tiles.push(Object.freeze({ x: x + i, y: y - height + 1 + j }));
    }
  }
  return Object.freeze(tiles);
}

function parseSize(name) {
  const match = SIZE_EVENT.exec(name ?? "");
  if (!match) return Object.freeze({ width: 1, height: 1 });
  return Object.freeze({ width: Number(match[1]), height: Number(match[2]) });
}

function commandList(page) {
  const list = page.fields["@list"];
  if (list?.kind !== "Array") invalid("RPG::Event::Page @list must be an Array");
  return list.items.map((item, index) => {
    if (item?.kind !== "RmxpObject" || item.className !== "RPG::EventCommand") {
      invalid(`EventCommand[${index}] must be RPG::EventCommand`);
    }
    return item;
  });
}

function joinScripts(commands) {
  const groups = [];
  for (let index = 0; index < commands.length; index += 1) {
    const code = commands[index].fields["@code"];
    if (code !== SCRIPT_START) continue;
    const parts = [];
    const firstParams = commands[index].fields["@parameters"];
    parts.push(rubyText(firstParams?.items?.[0]) ?? "");
    let end = index;
    while (end + 1 < commands.length && commands[end + 1].fields["@code"] === SCRIPT_CONTINUE) {
      end += 1;
      const params = commands[end].fields["@parameters"];
      parts.push(rubyText(params?.items?.[0]) ?? "");
    }
    groups.push(Object.freeze({ startCommandIndex: index, endCommandIndex: end, joined: parts.join("\n") }));
    index = end;
  }
  return Object.freeze(groups);
}

function classifyScript(text) {
  const trimmed = String(text ?? "").trim();
  if (DYNAMIC_RUBY.test(trimmed)) return Object.freeze({ kind: "opaque-related", reason: "dynamic-ruby" });
  const on = BRIDGE_ON.exec(trimmed);
  if (on) {
    return Object.freeze({ kind: "bridge-on", height: 2 });
  }
  if (BRIDGE_OFF.test(trimmed)) return Object.freeze({ kind: "bridge-off", height: null });
  if (BRIDGE_MENTION.test(trimmed)) return Object.freeze({ kind: "opaque-related", reason: "bridge-script-not-statically-confirmable" });
  return Object.freeze({ kind: "unrelated" });
}

function projectPage(mapId, eventId, eventX, eventY, eventName, page, pageIndex) {
  const trigger = page.fields["@trigger"];
  const commands = commandList(page);
  const codes = commands.map((command) => command.fields["@code"]);
  const COMMENT_START = 108;
  const COMMENT_CONTINUE = 408;
  const groups = joinScripts(commands);
  const classified = groups.map((group) => ({ ...group, ...classifyScript(group.joined) }));
  const related = classified.filter((item) => item.kind !== "unrelated");
  const rawBridgeMention = commands.some((command) => {
    if (![SCRIPT_START, SCRIPT_CONTINUE].includes(command.fields["@code"])) return false;
    return BRIDGE_MENTION.test(rubyText(command.fields["@parameters"]?.items?.[0]) ?? "");
  });
  if (related.length === 0 && !rawBridgeMention) return null;
  const size = parseSize(eventName);
  const occupied = occupiedTiles(eventX, eventY, size.width, size.height);
  const opaque = (reason) => Object.freeze({ kind: "opaque-related", mapId, eventId, pageIndex, occupied, reason });
  if (!pageAlwaysActive(page)) return opaque("bridge-candidate-page-condition-is-dynamic");
  if (trigger !== 1) {
    return opaque("bridge-candidate-trigger-is-not-player-touch");
  }
  if (page.fields["@through"] !== false) return opaque("bridge-candidate-through-must-be-false");
  if (!pageEmptyGraphic(page)) return opaque("bridge-candidate-graphic-must-be-empty");
  if (codes.length === 0 || codes.at(-1) !== COMMAND_END || codes.slice(0, -1).includes(COMMAND_END)) {
    return opaque("bridge-page-command-terminator-is-invalid");
  }
  const scriptIndexes = new Set(groups.flatMap((group) => Array.from(
    { length: group.endCommandIndex - group.startCommandIndex + 1 },
    (_, offset) => group.startCommandIndex + offset,
  )));
  const disallowed = codes
    .map((code, index) => ({ code, index }))
    .filter(({ code, index }) => ![COMMAND_END, COMMENT_START, COMMENT_CONTINUE].includes(code) && !scriptIndexes.has(index));
  if (disallowed.length > 0) {
    return opaque(`bridge-page-contains-non-whitelist-command-${disallowed[0].code}`);
  }
  if (groups.length !== 1 || classified.length !== 1) {
    return opaque("bridge-page-contains-additional-ruby");
  }
  if (related.length !== 1 || (related[0].kind !== "bridge-on" && related[0].kind !== "bridge-off")) {
    return opaque(related[0]?.reason ?? "bridge-page-not-a-single-confirmable-script");
  }
  const hit = related[0];
  return Object.freeze({
    kind: "bridge",
    mapId,
    eventId,
    pageIndex,
    position: Object.freeze({ x: eventX, y: eventY }),
    commandIndex: hit.startCommandIndex,
    trigger: 1,
    occupied,
    op: hit.kind,
    height: hit.height,
    through: false,
    emptyGraphic: true,
  });
}

export const MAP21_BRIDGE_EVENTS = Object.freeze([
  Object.freeze({ eventId: 4, op: "bridge-on", x: 20, y: 49, occupied: Object.freeze([[20, 46], [20, 47], [20, 48], [20, 49]]) }),
  Object.freeze({ eventId: 28, op: "bridge-off", x: 19, y: 49, occupied: Object.freeze([[19, 46], [19, 47], [19, 48], [19, 49]]) }),
  Object.freeze({ eventId: 7, op: "bridge-off", x: 14, y: 31, occupied: Object.freeze([[14, 31], [15, 31], [16, 31]]) }),
  Object.freeze({ eventId: 10, op: "bridge-on", x: 14, y: 32, occupied: Object.freeze([[14, 32], [15, 32], [16, 32]]) }),
  Object.freeze({ eventId: 20, op: "bridge-off", x: 22, y: 58, occupied: Object.freeze([[22, 58], [23, 58]]) }),
  Object.freeze({ eventId: 22, op: "bridge-on", x: 22, y: 57, occupied: Object.freeze([[22, 57], [23, 57]]) }),
  Object.freeze({ eventId: 23, op: "bridge-off", x: 14, y: 69, occupied: Object.freeze([[14, 69], [15, 69]]) }),
  Object.freeze({ eventId: 25, op: "bridge-on", x: 14, y: 68, occupied: Object.freeze([[14, 68], [15, 68]]) }),
]);

export function assertMap21BridgeAudit(evidence) {
  if (!evidence || evidence.id !== 21) invalid("mapId=21 eventId=unknown pageIndex=unknown: missing Bridge audit evidence");
  if (evidence.opaqueRelated.length > 0) {
    const item = evidence.opaqueRelated[0];
    invalid(`mapId=21 eventId=${item.eventId} pageIndex=${item.pageIndex}: ${item.reason}`);
  }
  const byId = new Map();
  for (const action of evidence.actions) {
    if (byId.has(action.eventId)) invalid(`mapId=21 eventId=${action.eventId} pageIndex=${action.pageIndex}: duplicate Bridge event`);
    byId.set(action.eventId, action);
  }
  for (const expected of MAP21_BRIDGE_EVENTS) {
    const action = byId.get(expected.eventId);
    if (!action) invalid(`mapId=21 eventId=${expected.eventId} pageIndex=unknown: missing Bridge event`);
    const actualCells = action.occupied.map(({ x, y }) => [x, y]);
    if (action.op !== expected.op) invalid(`mapId=21 eventId=${expected.eventId} pageIndex=${action.pageIndex}: operation mismatch`);
    if (action.position?.x !== expected.x || action.position?.y !== expected.y) invalid(`mapId=21 eventId=${expected.eventId} pageIndex=${action.pageIndex}: event position mismatch`);
    if (JSON.stringify(actualCells) !== JSON.stringify(expected.occupied)) invalid(`mapId=21 eventId=${expected.eventId} pageIndex=${action.pageIndex}: occupied cells mismatch`);
    if (action.trigger !== 1 || action.through !== false || action.emptyGraphic !== true) invalid(`mapId=21 eventId=${expected.eventId} pageIndex=${action.pageIndex}: page shape mismatch`);
    byId.delete(expected.eventId);
  }
  if (byId.size > 0 || evidence.actions.length !== MAP21_BRIDGE_EVENTS.length) {
    const extra = byId.values().next().value;
    invalid(`mapId=21 eventId=${extra?.eventId ?? "unknown"} pageIndex=${extra?.pageIndex ?? "unknown"}: unexpected Bridge event`);
  }
  return evidence;
}

function eventsOf(root, filename) {
  const events = root.fields["@events"];
  if (events == null) return [];
  if (events.kind !== "Hash") invalid(`${filename} @events must be a Hash`);
  const projected = [];
  for (const [key, event] of events.entries) {
    if (event?.kind !== "RmxpObject" || event.className !== "RPG::Event") invalid(`${filename} event must be RPG::Event`);
    const id = integer(event.fields["@id"], "RPG::Event @id", { positive: true });
    if (key !== id) invalid(`${filename} event hash key ${key} does not equal @id ${id}`);
    projected.push(event);
  }
  return projected;
}

export function projectMapActionRecord(entry) {
  const match = MAP_FILE.exec(entry?.filename ?? "");
  if (!match) return undefined;
  const mapId = Number(match[1]);
  integer(mapId, "MapAction mapId", { positive: true });
  const root = entry.root;
  if (root?.kind !== "RmxpObject" || root.className !== "RPG::Map") invalid(`${entry.filename} root must be RPG::Map`);
  const actions = [];
  const opaqueRelated = [];
  for (const event of eventsOf(root, entry.filename)) {
    const eventId = integer(event.fields["@id"], "RPG::Event @id", { positive: true });
    const x = integer(event.fields["@x"], "RPG::Event @x", { nonNegative: true });
    const y = integer(event.fields["@y"], "RPG::Event @y", { nonNegative: true });
    const name = rubyText(event.fields["@name"]) ?? "";
    const pages = event.fields["@pages"];
    if (pages?.kind !== "Array") invalid("RPG::Event @pages must be an Array");
    for (const [pageIndex, page] of pages.items.entries()) {
      if (page?.kind !== "RmxpObject" || page.className !== "RPG::Event::Page") invalid("event page must be RPG::Event::Page");
      const projected = projectPage(mapId, eventId, x, y, name, page, pageIndex);
      if (projected == null) continue;
      if (projected.kind === "opaque-related") opaqueRelated.push(projected);
      else actions.push(projected);
    }
  }
  return Object.freeze({
    key: String(mapId),
    value: Object.freeze({
      id: mapId,
      schemaVersion: "struct.MapAction/v1-bridge",
      actions: Object.freeze(actions),
      opaqueRelated: Object.freeze(opaqueRelated),
    }),
  });
}

export function materializeMapActionRecords(rmxpRoots) {
  const records = [];
  for (const entry of rmxpRoots) {
    const projected = projectMapActionRecord(entry);
    if (projected) records.push(projected);
  }
  return Object.freeze(records);
}
