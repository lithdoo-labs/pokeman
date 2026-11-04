import { fail } from "../../../../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/errors.mjs";

const MAP_FILE = /^Map(\d+)\.rxdata$/u;
const HIDDEN_ITEM = /hiddenitem/iu;
const SIZE_EVENT = /size\((\d+),(\d+)\)/iu;
const EDGE_NAMES = Object.freeze({
  N: "N", North: "N",
  S: "S", South: "S",
  E: "E", East: "E",
  W: "W", West: "W",
});
const EDGE_PAIRS = Object.freeze({ N: "S", S: "N", E: "W", W: "E" });
const DIRECTIONS = Object.freeze([2, 4, 6, 8]);
const DELTA = Object.freeze({
  2: Object.freeze({ dx: 0, dy: 1 }),
  4: Object.freeze({ dx: -1, dy: 0 }),
  6: Object.freeze({ dx: 1, dy: 0 }),
  8: Object.freeze({ dx: 0, dy: -1 }),
});

function invalid(message) {
  fail("MAP_TRANSFER_CONSUMER_PROJECTION_FAILURE", message);
}

function tableAt(table, x, y = 0, z = 0) {
  return table.values[x + y * table.xSize + z * table.xSize * table.ySize];
}

export function projectedD0Passable(map, tileset, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  for (const z of [2, 1, 0]) {
    const tileId = tableAt(map.data, x, y, z);
    if (tileId === 0) continue;
    if (!Number.isSafeInteger(tileId) || tileId < 0 || tileId >= tileset.passages.xSize || tileId >= tileset.priorities.xSize) {
      invalid(`tile id ${tileId} is outside Tileset passages/priorities`);
    }
    const passage = tableAt(tileset.passages, tileId);
    const priority = tableAt(tileset.priorities, tileId);
    if ((passage & 0x0f) === 0x0f) return false;
    if (priority === 0) return true;
  }
  return true;
}

function text(value, label) {
  if (value?.kind !== "RubyString" || typeof value.text !== "string") invalid(`${label} must be a RubyString`);
  return value.text;
}

function integer(value, label, { positive = false, nonNegative = false } = {}) {
  if (!Number.isSafeInteger(value) || (positive && value <= 0) || (nonNegative && value < 0)) {
    invalid(`${label} must be a ${positive ? "positive " : nonNegative ? "non-negative " : ""}safe integer`);
  }
  return value;
}

function boolean(value, label) {
  if (typeof value !== "boolean") invalid(`${label} must be a boolean`);
  return value;
}

function inBounds(map, x, y) {
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
}

function targetDirection(raw) {
  if (raw === 0) return null;
  if (raw === 2 || raw === 4 || raw === 6 || raw === 8) return raw;
  invalid("Transfer Player direction must be 0, 2, 4, 6, or 8");
}

function commands(list) {
  if (list?.kind !== "Array") invalid("RPG::Event::Page @list must be an Array");
  return list.items.map((item, index) => {
    if (item?.kind !== "RmxpObject" || item.className !== "RPG::EventCommand") {
      invalid(`EventCommand[${index}] must be RPG::EventCommand`);
    }
    return item;
  });
}

function parameters(command) {
  const list = command.fields["@parameters"];
  if (list?.kind !== "Array") invalid("EventCommand.parameters must be an Array");
  return list.items;
}

function alwaysActive(condition) {
  if (condition?.kind !== "RmxpObject" || condition.className !== "RPG::Event::Page::Condition") {
    invalid("RPG::Event::Page @condition must be RPG::Event::Page::Condition");
  }
  return boolean(condition.fields["@switch1_valid"], "condition.switch1_valid") === false
    && boolean(condition.fields["@switch2_valid"], "condition.switch2_valid") === false
    && boolean(condition.fields["@variable_valid"], "condition.variable_valid") === false
    && boolean(condition.fields["@self_switch_valid"], "condition.self_switch_valid") === false;
}

function selectStaticPage(pages) {
  if (pages?.kind !== "Array") invalid("RPG::Event @pages must be an Array");
  let selected;
  for (const [pageIndex, page] of pages.items.entries()) {
    if (page?.kind !== "RmxpObject" || page.className !== "RPG::Event::Page") invalid("event page must be RPG::Event::Page");
    if (alwaysActive(page.fields["@condition"])) selected = { page, pageIndex };
  }
  return selected;
}

function uniqueDirectTransfer(page) {
  const list = commands(page.fields["@list"]);
  const indent0 = [];
  for (const command of list) {
    const code = command.fields["@code"];
    const indent = command.fields["@indent"];
    if (code !== 201) continue;
    integer(indent, "EventCommand.indent", { nonNegative: true });
    if (indent !== 0) return undefined;
    indent0.push(command);
  }
  if (indent0.length !== 1) return undefined;
  const params = parameters(indent0[0]);
  if (params[0] !== 0) return undefined;
  return {
    targetMapId: integer(params[1], "Transfer Player map id", { positive: true }),
    targetX: integer(params[2], "Transfer Player x", { nonNegative: true }),
    targetY: integer(params[3], "Transfer Player y", { nonNegative: true }),
    targetDirection: targetDirection(params[4]),
  };
}

function graphicInfo(page) {
  const graphic = page.fields["@graphic"];
  if (graphic?.kind !== "RmxpObject" || graphic.className !== "RPG::Event::Page::Graphic") {
    invalid("RPG::Event::Page @graphic must be RPG::Event::Page::Graphic");
  }
  const name = graphic.fields["@character_name"];
  if (name?.kind !== "RubyString" || typeof name.text !== "string") invalid("page graphic.character_name must be a RubyString");
  return {
    characterName: name.text,
    tileId: integer(graphic.fields["@tile_id"], "page graphic.tile_id", { nonNegative: true }),
  };
}

function emitStep(transfer, sourceMap, tileset, x, y) {
  if (projectedD0Passable(sourceMap, tileset, x, y) !== true) return { steps: [], contacts: [] };
  if (!inBounds(sourceMap, x, y)) invalid("StepTransfer source coordinate is out of bounds");
  return {
    steps: [Object.freeze({
      x,
      y,
      targetMapId: transfer.targetMapId,
      targetX: transfer.targetX,
      targetY: transfer.targetY,
      targetDirection: transfer.targetDirection,
    })],
    contacts: [],
  };
}

function emitContacts(transfer, sourceMap, x, y) {
  const contacts = [];
  for (const direction of DIRECTIONS) {
    const { dx, dy } = DELTA[direction];
    const playerX = x - dx;
    const playerY = y - dy;
    if (!inBounds(sourceMap, playerX, playerY)) continue;
    contacts.push(Object.freeze({
      x: playerX,
      y: playerY,
      direction,
      targetMapId: transfer.targetMapId,
      targetX: transfer.targetX,
      targetY: transfer.targetY,
      targetDirection: transfer.targetDirection,
    }));
  }
  return { steps: [], contacts };
}

function projectEvent(event, sourceMap, maps, tileset) {
  if (event?.kind !== "RmxpObject" || event.className !== "RPG::Event") invalid("map event must be RPG::Event");
  const name = text(event.fields["@name"], "RPG::Event @name");
  if (HIDDEN_ITEM.test(name) || SIZE_EVENT.test(name)) return { steps: [], contacts: [] };
  const selected = selectStaticPage(event.fields["@pages"]);
  if (!selected) return { steps: [], contacts: [] };
  const page = selected.page;
  if (page.fields["@trigger"] !== 1) return { steps: [], contacts: [] };
  if (boolean(page.fields["@always_on_top"], "page.always_on_top") !== false) return { steps: [], contacts: [] };
  const transfer = uniqueDirectTransfer(page);
  if (!transfer) return { steps: [], contacts: [] };
  const target = maps.get(String(transfer.targetMapId));
  if (!target) invalid(`Transfer Player target map ${transfer.targetMapId} does not exist`);
  if (!inBounds(target, transfer.targetX, transfer.targetY)) invalid("Transfer Player target coordinate is out of bounds");
  const x = integer(event.fields["@x"], "RPG::Event @x", { nonNegative: true });
  const y = integer(event.fields["@y"], "RPG::Event @y", { nonNegative: true });
  const through = boolean(page.fields["@through"], "page.through");
  if (through === false) {
    const graphic = graphicInfo(page);
    if (graphic.characterName.length > 0) return emitContacts(transfer, sourceMap, x, y);
    if (graphic.characterName.length === 0 && graphic.tileId === 0) {
      if (projectedD0Passable(sourceMap, tileset, x, y) === true) return emitStep(transfer, sourceMap, tileset, x, y);
      return emitContacts(transfer, sourceMap, x, y);
    }
    return { steps: [], contacts: [] };
  }
  if (through === true) return emitStep(transfer, sourceMap, tileset, x, y);
  return { steps: [], contacts: [] };
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

function normalizeEdge(value, label) {
  const edge = EDGE_NAMES[value];
  if (!edge) invalid(`${label} must be N/S/E/W or North/South/East/West`);
  return edge;
}

function getMapEdge(map, edge) {
  if (edge === "N" || edge === "W") return 0;
  if (edge === "E") return map.width;
  return map.height;
}

function convertConnection(mapA, edgeA, offsetA, mapB, edgeB, offsetB) {
  const x1 = edgeA === "N" || edgeA === "S" ? offsetA : getMapEdge(mapA, edgeA);
  const y1 = edgeA === "N" || edgeA === "S" ? getMapEdge(mapA, edgeA) : offsetA;
  const x2 = edgeB === "N" || edgeB === "S" ? offsetB : getMapEdge(mapB, edgeB);
  const y2 = edgeB === "N" || edgeB === "S" ? getMapEdge(mapB, edgeB) : offsetB;
  return { x1, y1, x2, y2 };
}

function parseConnectionLine(raw, maps) {
  const fields = raw.split(",").map((item) => item.trim());
  if (fields.length !== 6) invalid(`map_connections line must have 6 fields: ${raw}`);
  const mapAId = integer(Number(fields[0]), "mapA", { positive: true });
  const mapBId = integer(Number(fields[3]), "mapB", { positive: true });
  const edgeA = normalizeEdge(fields[1], "edgeA");
  const edgeB = normalizeEdge(fields[4], "edgeB");
  if (EDGE_PAIRS[edgeA] !== edgeB) invalid(`map_connections edges must be N↔S or E↔W: ${raw}`);
  const offsetA = integer(Number(fields[2]), "offsetA", { nonNegative: true });
  const offsetB = integer(Number(fields[5]), "offsetB", { nonNegative: true });
  const mapA = maps.get(String(mapAId));
  const mapB = maps.get(String(mapBId));
  if (!mapA) invalid(`map_connections map ${mapAId} does not exist`);
  if (!mapB) invalid(`map_connections map ${mapBId} does not exist`);
  return { mapAId, mapBId, mapA, mapB, edgeA, edgeB, offsetA, offsetB, ...convertConnection(mapA, edgeA, offsetA, mapB, edgeB, offsetB) };
}

function land(conn, sourceId, afterX, afterY) {
  if (sourceId === conn.mapAId) {
    return { targetMapId: conn.mapBId, targetX: conn.x2 - conn.x1 + afterX, targetY: conn.y2 - conn.y1 + afterY, target: conn.mapB };
  }
  return { targetMapId: conn.mapAId, targetX: conn.x1 - conn.x2 + afterX, targetY: conn.y1 - conn.y2 + afterY, target: conn.mapA };
}

function expandConnection(conn, tilesets, emitEdge) {
  for (const source of [{ id: conn.mapAId, map: conn.mapA }, { id: conn.mapBId, map: conn.mapB }]) {
    const candidates = [];
    for (let x = 0; x < source.map.width; x += 1) {
      candidates.push({ x, y: 0, direction: 8, afterX: x, afterY: -1 });
      candidates.push({ x, y: source.map.height - 1, direction: 2, afterX: x, afterY: source.map.height });
    }
    for (let y = 0; y < source.map.height; y += 1) {
      candidates.push({ x: 0, y, direction: 4, afterX: -1, afterY: y });
      candidates.push({ x: source.map.width - 1, y, direction: 6, afterX: source.map.width, afterY: y });
    }
    for (const item of candidates) {
      const dest = land(conn, source.id, item.afterX, item.afterY);
      if (!inBounds(dest.target, dest.targetX, dest.targetY)) continue;
      const tileset = tilesets.get(String(dest.target.tileset_id));
      if (!tileset) invalid(`Tileset ${dest.target.tileset_id} is missing for map ${dest.targetMapId}`);
      if (projectedD0Passable(dest.target, tileset, dest.targetX, dest.targetY) !== true) continue;
      emitEdge(source.id, Object.freeze({
        x: item.x,
        y: item.y,
        direction: item.direction,
        targetMapId: dest.targetMapId,
        targetX: dest.targetX,
        targetY: dest.targetY,
      }));
    }
  }
}

function addUnique(bag, key, item, label) {
  if (bag.keys.has(key)) invalid(`duplicate ${label} ${key}`);
  bag.keys.add(key);
  bag.items.push(item);
}

export function materializeMapTransferRecords(rmxpRoots, mapEntries, tilesetEntries, pbsDocuments = []) {
  const maps = new Map(mapEntries.map((entry) => [entry.key, entry.value]));
  const tilesets = new Map(tilesetEntries.map((entry) => [entry.key, entry.value]));
  const byMap = new Map([...maps.keys()].map((id) => [id, {
    steps: { keys: new Set(), items: [] },
    contacts: { keys: new Set(), items: [] },
    edges: { keys: new Set(), items: [] },
  }]));

  const mapFiles = new Map();
  for (const entry of rmxpRoots) {
    const match = MAP_FILE.exec(entry?.filename ?? "");
    if (!match) continue;
    mapFiles.set(String(Number(match[1])), entry);
  }

  for (const [id, map] of maps) {
    const entry = mapFiles.get(id);
    if (!entry) continue;
    const root = entry.root;
    if (root?.kind !== "RmxpObject" || root.className !== "RPG::Map") invalid(`${entry.filename} root must be RPG::Map`);
    const tileset = tilesets.get(String(map.tileset_id));
    if (!tileset) invalid(`Map ${id} tileset ${map.tileset_id} is missing`);
    for (const event of eventsOf(root, entry.filename)) {
      const projected = projectEvent(event, map, maps, tileset);
      for (const step of projected.steps) addUnique(byMap.get(id).steps, `${step.x},${step.y}`, step, "step");
      for (const contact of projected.contacts) addUnique(byMap.get(id).contacts, `${contact.x},${contact.y},${contact.direction}`, contact, "contact");
    }
  }

  for (const document of pbsDocuments) {
    if (document?.family !== "connections") continue;
    if (!Array.isArray(document.lines)) invalid("connections PbsDocument.lines must be an array");
    for (const line of document.lines) {
      const conn = parseConnectionLine(line.value, maps);
      expandConnection(conn, tilesets, (sourceId, edge) => {
        addUnique(byMap.get(String(sourceId)).edges, `${edge.x},${edge.y},${edge.direction}`, edge, "edge");
      });
    }
  }

  return Object.freeze([...maps.keys()].sort((left, right) => Number(left) - Number(right)).map((id) => Object.freeze({
    key: id,
    value: Object.freeze({
      id: Number(id),
      steps: Object.freeze(byMap.get(id).steps.items),
      contacts: Object.freeze(byMap.get(id).contacts.items),
      edges: Object.freeze(byMap.get(id).edges.items),
    }),
  })));
}
