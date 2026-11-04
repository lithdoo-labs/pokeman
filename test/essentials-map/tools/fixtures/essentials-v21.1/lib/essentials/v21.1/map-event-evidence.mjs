import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fail } from "../../../../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/errors.mjs";
import { decodeMarshal } from "../../../../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/marshal/decoder.mjs";
import { decodeRmxpGraph } from "../../../../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/rmxp/decoder.mjs";
import { sha256File } from "../../../../../../../../loom-realm/tools/fixtures/essentials-v21.1/lib/source/fingerprint.mjs";
import { projectMapRecord, projectTilesetRecords } from "./m14-consumer.mjs";
import { projectedD0Passable } from "./map-transfer-consumer.mjs";
import { chainsFromMapEvent, computeCommonEventReachability } from "./common-event-reachability.mjs";
import {
  compareExpectedToActualEdges,
  enumerateConnectionOutcomes,
  parseMapConnectionLines,
} from "./map-connection-audit.mjs";
import {
  hereVersusTouch,
  inferBridgeScriptDelta,
  mapPassableForPlayer,
  overTriggerForEvent,
  selectAlwaysActivePage,
  validateOneDimensionalTilesetTable,
  validateTableShape,
  vanillaPassageBit,
} from "./vanilla-map-rules.mjs";

export const DEFAULT_MAP_ID = 7;
export const ALLOWED_EVIDENCE_MAP_IDS = Object.freeze([7, 21, 47]);
export const BRIDGE_TERRAIN_TAG = 15;
export const LEDGE_TERRAIN_TAG = 1;
export const SCRIPT_START_CODE = 355;
export const SCRIPT_CONTINUE_CODE = 655;
export const TRANSFER_PLAYER_CODE = 201;
export const COMMON_EVENT_CODE = 117;
export const SET_MOVE_ROUTE_CODE = 209;
export const MOVE_ROUTE_CONTINUE_CODE = 509;
export const MOVE_COMMAND_SCRIPT_CODE = 45;
export const CONDITIONAL_BRANCH_CODE = 111;
export const CONDITIONAL_BRANCH_SCRIPT_TYPE = 12;
export const SIZE_NAME_PATTERN = /size\((\d+),(\d+)\)/iu;
export const HIDDEN_ITEM_PATTERN = /hiddenitem/iu;

export const COMPLETENESS = Object.freeze({
  COMPLETE: "COMPLETE",
  INCOMPLETE: "INCOMPLETE",
});

export const VANILLA_SOURCE = Object.freeze({
  tag: "v21.1",
  commit: "ea7b5d56d2436591160983c4e641a2ceee2d875a",
  tree: "https://github.com/Maruno17/pokemon-essentials/tree/ea7b5d56d2436591160983c4e641a2ceee2d875a",
  sizeParser: "Data/Scripts/004_Game classes/007_Game_Event.rb Game_Event#initialize",
  occupiedTiles: "Data/Scripts/004_Game classes/006_Game_Character.rb Game_Character#each_occupied_tile / #at_coordinate?",
  overTrigger: "Data/Scripts/004_Game classes/007_Game_Event.rb Game_Event#over_trigger?",
  playerTouch: "Data/Scripts/004_Game classes/008_Game_Player.rb Game_Player#check_event_trigger_touch / #check_event_trigger_here / #update_event_triggering",
  passableEvents: "Data/Scripts/004_Game classes/006_Game_Character.rb Game_Character#passable?",
  command355: "Data/Scripts/003_Game processing/004_Interpreter_Commands.rb Interpreter#command_355",
  command117: "Data/Scripts/003_Game processing/004_Interpreter_Commands.rb Interpreter#command_117",
  command111: "Data/Scripts/003_Game processing/004_Interpreter_Commands.rb Interpreter#command_111 type 12",
  command209: "Data/Scripts/003_Game processing/004_Interpreter_Commands.rb Interpreter#command_209",
  moveRouteScript: "Data/Scripts/004_Game classes/006_Game_Character.rb Game_Character#move_type_custom code 45",
  pbBridge: "Data/Scripts/012_Overworld/001_Overworld.rb pbBridgeOn / pbBridgeOff",
  transferOff: "Data/Scripts/003_Game processing/002_Scene_Map.rb Scene_Map#transfer_player",
  playerPassable: "Data/Scripts/004_Game classes/004_Game_Map.rb Game_Map#playerPassable?",
  terrainTag: "Data/Scripts/010_Data/001_Hardcoded data/011_TerrainTag.rb",
  gameEventStart: "Data/Scripts/004_Game classes/007_Game_Event.rb Game_Event#start",
  jumpForward: "Data/Scripts/004_Game classes/006_Game_Character.rb Game_Character#jump / #jumpForward",
  moveGeneric: "Data/Scripts/004_Game classes/008_Game_Player.rb Game_Player#move_generic",
});

export const TRIGGER_SEMANTICS = Object.freeze({
  0: "action-button",
  1: "player-touch",
  2: "event-touch",
  3: "autorun",
  4: "parallel-process",
});

export const COMMAND_LABELS = Object.freeze({
  0: "empty-or-end",
  101: "show-text",
  401: "show-text-line",
  102: "show-choices",
  402: "when-choice",
  403: "when-cancel",
  404: "show-choices-branch-end",
  103: "input-number",
  104: "change-text-options",
  105: "button-input",
  106: "wait",
  111: "conditional-branch",
  411: "else",
  412: "branch-end",
  112: "loop",
  413: "repeat-above",
  113: "break-loop",
  115: "exit-event-processing",
  116: "erase-event",
  117: "call-common-event",
  118: "label",
  119: "jump-to-label",
  121: "control-switches",
  122: "control-variables",
  123: "control-self-switch",
  201: "transfer-player",
  202: "set-event-location",
  203: "scroll-map",
  204: "change-map-settings",
  205: "change-fog-color-tone",
  206: "change-fog-opacity",
  207: "show-animation",
  208: "change-transparent-flag",
  209: "set-move-route",
  509: "move-route-continuation",
  210: "wait-for-move-completion",
  221: "prepare-for-transition",
  222: "execute-transition",
  223: "change-screen-color-tone",
  224: "screen-flash",
  225: "screen-shake",
  231: "show-picture",
  232: "move-picture",
  233: "rotate-picture",
  234: "change-picture-color-tone",
  235: "erase-picture",
  236: "set-weather-effects",
  241: "play-bgm",
  242: "fade-out-bgm",
  245: "play-bgs",
  246: "fade-out-bgs",
  247: "memorize-bgm-bgs",
  248: "restore-bgm-bgs",
  249: "play-me",
  250: "play-se",
  251: "stop-se",
  301: "battle-processing",
  601: "if-win",
  602: "if-escape",
  603: "if-lose",
  302: "shop-processing",
  303: "name-input-processing",
  311: "change-hp",
  312: "change-sp",
  313: "change-state",
  314: "recover-all",
  315: "change-exp",
  316: "change-level",
  317: "change-parameters",
  318: "change-skills",
  319: "change-equipment",
  320: "change-actor-name",
  321: "change-actor-class",
  322: "change-actor-graphic",
  331: "change-enemy-hp",
  332: "change-enemy-sp",
  333: "change-enemy-state",
  334: "enemy-recover-all",
  335: "enemy-appear",
  336: "enemy-transform",
  337: "show-battle-animation",
  338: "deal-damage",
  339: "force-action",
  340: "abort-battle",
  351: "call-menu-screen",
  352: "call-save-screen",
  353: "game-over",
  354: "return-to-title",
  355: "script",
  655: "script-continuation",
  108: "comment",
  408: "comment-continuation",
});

const BRIDGE_SCRIPT_PATTERN = /\bpbBridge(?:On|Off)\s*(?:\(|\b)/u;
const BRIDGE_NAME_PATTERN = /bridge/iu;
const MAP_FILE = /^Map(\d+)\.rxdata$/iu;
const FSDB_NAME = /^\[FSDB\].+$/u;

function evidenceFail(message, details) {
  fail("MAP_EVENT_EVIDENCE_FAILURE", message, details);
}

function padMapId(mapId) {
  return `Map${String(mapId).padStart(3, "0")}.rxdata`;
}

function requireInteger(value, label, { positive = false, nonNegative = false } = {}) {
  if (!Number.isSafeInteger(value) || (positive && value <= 0) || (nonNegative && value < 0)) {
    evidenceFail(`${label} must be a ${positive ? "positive " : nonNegative ? "non-negative " : ""}safe integer`);
  }
  return value;
}

export function assertAllowedMapId(mapId, label = "mapId") {
  requireInteger(mapId, label, { positive: true });
  if (!ALLOWED_EVIDENCE_MAP_IDS.includes(mapId)) {
    evidenceFail(`this extractor only reads Maps ${ALLOWED_EVIDENCE_MAP_IDS.join(", ")}; refused map ${mapId}`);
  }
  return mapId;
}

export function forensicRelPath(absPath, _dataDirectory) {
  if (typeof absPath !== "string" || absPath.length === 0) return null;
  const normalized = absPath.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");
  const parts = normalized.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.length === 0) return null;
  const file = parts[parts.length - 1];
  const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
  return parent ? `${parent}/${file}` : file;
}

function rubyStringText(value) {
  if (value?.kind === "RubyString") return value.text ?? "";
  if (typeof value === "string") return value;
  if (value?.kind === "RubyString" || value?.text != null) return String(value.text);
  return null;
}

export function parseEventSize(name) {
  const match = SIZE_NAME_PATTERN.exec(name ?? "");
  if (!match) {
    return Object.freeze({ present: false, width: 1, height: 1, raw: null });
  }
  return Object.freeze({
    present: true,
    width: Number(match[1]),
    height: Number(match[2]),
    raw: match[0],
    source: VANILLA_SOURCE.sizeParser,
  });
}

export function occupiedTiles(x, y, width = 1, height = 1) {
  requireInteger(x, "occupiedTiles.x");
  requireInteger(y, "occupiedTiles.y");
  requireInteger(width, "occupiedTiles.width", { positive: true });
  requireInteger(height, "occupiedTiles.height", { positive: true });
  const tiles = [];
  for (let i = 0; i < width; i += 1) {
    for (let j = 0; j < height; j += 1) {
      tiles.push(Object.freeze({ x: x + i, y: y - height + 1 + j }));
    }
  }
  return Object.freeze(tiles);
}

export function classifyScriptUncertainty(text) {
  const source = text ?? "";
  const reasons = [];
  if (/\b(eval|instance_eval|instance_exec|class_eval|module_eval|send|__send__|public_send|method|const_get)\s*[\(\[]/u.test(source)) {
    reasons.push("dynamic-ruby-send-or-eval");
  }
  if (/#\{/u.test(source)) reasons.push("string-interpolation");
  if (/\bpbCommonEvent\s*\(/u.test(source)) reasons.push("script-calls-pbCommonEvent");
  if (/\bpbBridge(?!On\b|Off\b)/u.test(source)) reasons.push("pbBridge-identifier-not-On-or-Off");
  return Object.freeze(reasons);
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") evidenceFail(`${label} must be a boolean`);
  return value;
}

function requireRmxp(value, className, label) {
  if (value?.kind !== "RmxpObject" || value.className !== className) {
    evidenceFail(`${label} must be ${className}`);
  }
  return value;
}

function rubyText(value, label) {
  if (value?.kind !== "RubyString") evidenceFail(`${label} must be a RubyString`);
  return value;
}

export function jsonValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) evidenceFail(`non-finite number cannot be serialized: ${value}`);
    return value;
  }
  if (typeof value === "bigint") return Object.freeze({ kind: "bigint", value: value.toString() });
  if (typeof value !== "object") evidenceFail(`unsupported parameter type ${typeof value}`);
  if (seen.has(value)) return Object.freeze({ kind: "cycle-ref" });
  seen.add(value);
  if (Buffer.isBuffer(value)) return Object.freeze({ kind: "bytes", base64: value.toString("base64") });
  if (ArrayBuffer.isView(value)) return Object.freeze({ kind: "typed-array", values: Array.from(value) });
  if (value.kind === "RubyString") {
    return Object.freeze({
      kind: "RubyString",
      text: value.text ?? null,
      bytesBase64: value.text == null ? Buffer.from(value.bytes ?? []).toString("base64") : undefined,
    });
  }
  if (value.kind === "RubySymbol") return Object.freeze({ kind: "RubySymbol", name: value.name });
  if (value.kind === "Tone") {
    return Object.freeze({ kind: "Tone", red: value.red, green: value.green, blue: value.blue, gray: value.gray });
  }
  if (value.kind === "Color") {
    return Object.freeze({ kind: "Color", red: value.red, green: value.green, blue: value.blue, alpha: value.alpha });
  }
  if (value.kind === "Table") {
    return Object.freeze({
      kind: "Table",
      dimensions: value.dimensions,
      xSize: value.xSize,
      ySize: value.ySize,
      zSize: value.zSize,
      values: Object.freeze(Array.from(value.values)),
    });
  }
  if (value.kind === "Array") return Object.freeze({ kind: "Array", items: Object.freeze(value.items.map((item) => jsonValue(item, seen))) });
  if (value.kind === "Hash") {
    return Object.freeze({
      kind: "Hash",
      entries: Object.freeze(value.entries.map(([key, item]) => Object.freeze([jsonValue(key, seen), jsonValue(item, seen)]))),
    });
  }
  if (value.kind === "RmxpObject") {
    const fields = {};
    for (const name of Object.keys(value.fields).sort()) fields[name] = jsonValue(value.fields[name], seen);
    return Object.freeze({ kind: "RmxpObject", className: value.className, fields: Object.freeze(fields) });
  }
  if (value.kind === "GenericRubyObject") {
    const ivars = {};
    for (const name of Object.keys(value.ivars).sort()) ivars[name] = jsonValue(value.ivars[name], seen);
    return Object.freeze({ kind: "GenericRubyObject", className: value.className, ivars: Object.freeze(ivars) });
  }
  evidenceFail(`unserializable RMXP value kind ${value.kind ?? typeof value}`);
}

export function tableAt(table, x, y = 0, z = 0) {
  return table.values[x + y * table.xSize + z * table.xSize * table.ySize];
}

export function concatenateScriptCommands(commands) {
  const groups = [];
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    if (command.code !== SCRIPT_START_CODE) continue;
    const parts = [command.scriptText ?? ""];
    let end = index;
    while (end + 1 < commands.length && [SCRIPT_START_CODE, SCRIPT_CONTINUE_CODE].includes(commands[end + 1].code)) {
      end += 1;
      parts.push(commands[end].scriptText ?? "");
    }
    groups.push(Object.freeze({
      startCommandIndex: index,
      endCommandIndex: end,
      joinedWithNewlines: `${parts.join("\n")}\n`,
    }));
    index = end;
  }
  return Object.freeze(groups);
}

export function extractMoveCommandScript(moveCommand, origin) {
  if (moveCommand?.kind !== "RmxpObject" || moveCommand.className !== "RPG::MoveCommand") {
    return Object.freeze({ origin, isScript: false, decodeError: "not-RPG::MoveCommand" });
  }
  const code = moveCommand.fields["@code"];
  if (code !== MOVE_COMMAND_SCRIPT_CODE) {
    return Object.freeze({ origin, isScript: false, code });
  }
  const parameters = moveCommand.fields["@parameters"];
  if (parameters?.kind !== "Array" || parameters.items?.[0] == null) {
    return Object.freeze({ origin, isScript: true, code, decodeError: "move-command-45-missing-script-parameter" });
  }
  const text = rubyStringText(parameters.items[0]);
  if (text == null) {
    return Object.freeze({ origin, isScript: true, code, decodeError: "move-command-45-script-not-string" });
  }
  return Object.freeze({
    origin,
    isScript: true,
    code,
    scriptText: text,
    matchesBridgePattern: BRIDGE_SCRIPT_PATTERN.test(text),
    uncertainty: classifyScriptUncertainty(text),
  });
}

export function extractMoveRouteScripts(moveRoute, origin) {
  if (moveRoute == null) return Object.freeze([]);
  if (moveRoute?.kind !== "RmxpObject" || moveRoute.className !== "RPG::MoveRoute") {
    return Object.freeze([{ origin, isScript: false, decodeError: "not-RPG::MoveRoute" }]);
  }
  const list = moveRoute.fields["@list"];
  if (list?.kind !== "Array") return Object.freeze([{ origin, isScript: false, decodeError: "MoveRoute.list-not-Array" }]);
  return Object.freeze(list.items.map((item, index) => extractMoveCommandScript(item, `${origin}.list[${index}]`)).filter((item) => item.isScript || item.decodeError));
}

function extractRawCommandScriptExtras(rawCommand, commandIndex) {
  const code = rawCommand.fields["@code"];
  const parameters = rawCommand.fields["@parameters"];
  const extras = { moveRouteScripts: [], conditionalBranchScripts: [] };
  if (code === SET_MOVE_ROUTE_CODE) {
    extras.moveRouteScripts = extractMoveRouteScripts(parameters?.items?.[1], `command[${commandIndex}].move-route`);
  } else if (code === MOVE_ROUTE_CONTINUE_CODE) {
    const extracted = extractMoveCommandScript(parameters?.items?.[0], `command[${commandIndex}].move-command`);
    extras.moveRouteScripts = extracted.isScript || extracted.decodeError ? [extracted] : [];
  } else if (code === CONDITIONAL_BRANCH_CODE) {
    const type = parameters?.items?.[0];
    if (type === CONDITIONAL_BRANCH_SCRIPT_TYPE) {
      const raw = parameters?.items?.[1];
      if (raw == null) {
        extras.conditionalBranchScripts = [Object.freeze({
          origin: `command[${commandIndex}].conditional-branch-script`,
          commandIndex,
          decodeError: "conditional-branch-type-12-missing-script-parameter",
        })];
      } else {
        const text = rubyStringText(raw);
        extras.conditionalBranchScripts = [Object.freeze({
          origin: `command[${commandIndex}].conditional-branch-script`,
          commandIndex,
          scriptText: text ?? "",
          decodeError: text == null ? "conditional-branch-type-12-script-not-string" : undefined,
          matchesBridgePattern: text != null && BRIDGE_SCRIPT_PATTERN.test(text),
          uncertainty: classifyScriptUncertainty(text ?? ""),
        })];
      }
    }
  }
  return extras;
}

function commandFacts(command, index) {
  const code = requireInteger(command.fields["@code"], `EventCommand[${index}].code`, { nonNegative: true });
  const indent = requireInteger(command.fields["@indent"], `EventCommand[${index}].indent`, { nonNegative: true });
  const parameters = command.fields["@parameters"];
  if (parameters?.kind !== "Array") evidenceFail(`EventCommand[${index}].parameters must be an Array`);
  const scriptText = code === SCRIPT_START_CODE || code === SCRIPT_CONTINUE_CODE
    ? rubyText(parameters.items[0], `EventCommand[${index}] script text`).text ?? ""
    : undefined;
  return Object.freeze({
    index,
    code,
    indent,
    label: COMMAND_LABELS[code] ?? `unknown-code-${code}`,
    parameters: Object.freeze(parameters.items.map((item) => jsonValue(item))),
    scriptText,
    extraIvars: Object.freeze(Object.fromEntries(
      Object.keys(command.extraIvars ?? {}).sort().map((name) => [name, jsonValue(command.extraIvars[name])]),
    )),
  });
}

function conditionFacts(condition) {
  requireRmxp(condition, "RPG::Event::Page::Condition", "page condition");
  const switch1Valid = requireBoolean(condition.fields["@switch1_valid"], "condition.switch1_valid");
  const switch2Valid = requireBoolean(condition.fields["@switch2_valid"], "condition.switch2_valid");
  const variableValid = requireBoolean(condition.fields["@variable_valid"], "condition.variable_valid");
  const selfSwitchValid = requireBoolean(condition.fields["@self_switch_valid"], "condition.self_switch_valid");
  return Object.freeze({
    switch1_valid: switch1Valid,
    switch2_valid: switch2Valid,
    variable_valid: variableValid,
    self_switch_valid: selfSwitchValid,
    switch1_id: switch1Valid ? requireInteger(condition.fields["@switch1_id"], "condition.switch1_id", { positive: true }) : condition.fields["@switch1_id"],
    switch2_id: switch2Valid ? requireInteger(condition.fields["@switch2_id"], "condition.switch2_id", { positive: true }) : condition.fields["@switch2_id"],
    variable_id: variableValid ? requireInteger(condition.fields["@variable_id"], "condition.variable_id", { positive: true }) : condition.fields["@variable_id"],
    variable_value: variableValid ? requireInteger(condition.fields["@variable_value"], "condition.variable_value") : condition.fields["@variable_value"],
    self_switch_ch: selfSwitchValid ? rubyText(condition.fields["@self_switch_ch"], "condition.self_switch_ch").text : (
      condition.fields["@self_switch_ch"]?.kind === "RubyString" ? condition.fields["@self_switch_ch"].text : condition.fields["@self_switch_ch"]
    ),
    alwaysActive: switch1Valid === false && switch2Valid === false && variableValid === false && selfSwitchValid === false,
  });
}

function graphicFacts(graphic) {
  requireRmxp(graphic, "RPG::Event::Page::Graphic", "page graphic");
  const name = rubyText(graphic.fields["@character_name"], "graphic.character_name");
  return Object.freeze({
    tile_id: requireInteger(graphic.fields["@tile_id"], "graphic.tile_id", { nonNegative: true }),
    character_name: name.text ?? "",
    character_hue: graphic.fields["@character_hue"],
    direction: graphic.fields["@direction"],
    pattern: graphic.fields["@pattern"],
    opacity: graphic.fields["@opacity"],
    blend_type: graphic.fields["@blend_type"],
  });
}

function pageFacts(page, pageIndex, pageCount) {
  requireRmxp(page, "RPG::Event::Page", `event page[${pageIndex}]`);
  const list = page.fields["@list"];
  if (list?.kind !== "Array") evidenceFail(`event page[${pageIndex}].list must be an Array`);
  const moveRouteScripts = [...extractMoveRouteScripts(page.fields["@move_route"], `page[${pageIndex}].autonomous-move-route`)];
  const conditionalBranchScripts = [];
  const commands = list.items.map((item, index) => {
    requireRmxp(item, "RPG::EventCommand", `event page[${pageIndex}] command[${index}]`);
    const extras = extractRawCommandScriptExtras(item, index);
    moveRouteScripts.push(...extras.moveRouteScripts);
    conditionalBranchScripts.push(...extras.conditionalBranchScripts);
    return commandFacts(item, index);
  });
  const trigger = requireInteger(page.fields["@trigger"], `page[${pageIndex}].trigger`, { nonNegative: true });
  const concatenatedScripts = concatenateScriptCommands(commands);
  const orphanContinues = [];
  for (let index = 0; index < commands.length; index += 1) {
    if (commands[index].code !== SCRIPT_CONTINUE_CODE) continue;
    const previous = index === 0 ? null : commands[index - 1];
    if (previous?.code !== SCRIPT_START_CODE && previous?.code !== SCRIPT_CONTINUE_CODE) {
      orphanContinues.push(Object.freeze({
        pageIndex,
        commandIndex: index,
        decodeError: "script-655-without-preceding-355-or-655",
      }));
    }
  }
  const decodeErrors = [
    ...moveRouteScripts.filter((item) => item.decodeError).map((item) => Object.freeze({ origin: item.origin, decodeError: item.decodeError, pageIndex })),
    ...conditionalBranchScripts.filter((item) => item.decodeError).map((item) => Object.freeze({ origin: item.origin, decodeError: item.decodeError, pageIndex })),
    ...orphanContinues,
  ];
  for (const command of commands) {
    if (command.code !== COMMON_EVENT_CODE) continue;
    const id = command.parameters[0];
    if (!Number.isSafeInteger(id) || id <= 0) {
      decodeErrors.push(Object.freeze({
        origin: `page[${pageIndex}].command[${command.index}].common-event`,
        decodeError: "common-event-117-target-not-positive-integer",
        pageIndex,
        commandIndex: command.index,
        value: id ?? null,
      }));
    }
  }
  const allScriptTexts = [
    ...concatenatedScripts.map((group) => group.joinedWithNewlines),
    ...moveRouteScripts.filter((item) => item.isScript && item.scriptText != null).map((item) => item.scriptText),
    ...conditionalBranchScripts.filter((item) => item.scriptText != null).map((item) => item.scriptText),
  ];
  return Object.freeze({
    pageIndex,
    pageCount,
    originalOrder: pageIndex,
    condition: conditionFacts(page.fields["@condition"]),
    graphic: graphicFacts(page.fields["@graphic"]),
    trigger,
    triggerSemantics: TRIGGER_SEMANTICS[trigger] ?? `unknown-trigger-${trigger}`,
    through: requireBoolean(page.fields["@through"], `page[${pageIndex}].through`),
    always_on_top: requireBoolean(page.fields["@always_on_top"], `page[${pageIndex}].always_on_top`),
    move_type: page.fields["@move_type"],
    move_speed: page.fields["@move_speed"],
    move_frequency: page.fields["@move_frequency"],
    walk_anime: page.fields["@walk_anime"],
    step_anime: page.fields["@step_anime"],
    direction_fix: page.fields["@direction_fix"],
    commands: Object.freeze(commands),
    concatenatedScripts,
    moveRouteScripts: Object.freeze(moveRouteScripts),
    conditionalBranchScripts: Object.freeze(conditionalBranchScripts),
    decodeErrors: Object.freeze(decodeErrors),
    hasBridgeScript: allScriptTexts.some((text) => BRIDGE_SCRIPT_PATTERN.test(text)),
    scriptUncertainty: Object.freeze(allScriptTexts.flatMap((text) => [...classifyScriptUncertainty(text)])),
    extraIvars: Object.freeze(Object.fromEntries(
      Object.keys(page.extraIvars ?? {}).sort().map((name) => [name, jsonValue(page.extraIvars[name])]),
    )),
  });
}

function eventFacts(event, mapId) {
  requireRmxp(event, "RPG::Event", "map event");
  const pagesValue = event.fields["@pages"];
  if (pagesValue?.kind !== "Array") evidenceFail("RPG::Event @pages must be an Array");
  const pages = pagesValue.items.map((page, pageIndex) => pageFacts(page, pageIndex, pagesValue.items.length));
  const name = rubyText(event.fields["@name"], "RPG::Event @name");
  const nameText = name.text ?? "";
  const size = parseEventSize(nameText);
  const x = requireInteger(event.fields["@x"], "RPG::Event @x", { nonNegative: true });
  const y = requireInteger(event.fields["@y"], "RPG::Event @y", { nonNegative: true });
  return Object.freeze({
    mapId,
    eventId: requireInteger(event.fields["@id"], "RPG::Event @id", { positive: true }),
    name: nameText,
    x,
    y,
    size,
    occupiedTiles: occupiedTiles(x, y, size.width, size.height),
    pageCount: pages.length,
    pages,
    extraIvars: Object.freeze(Object.fromEntries(
      Object.keys(event.extraIvars ?? {}).sort().map((name) => [name, jsonValue(event.extraIvars[name])]),
    )),
  });
}

export function extractMapFacts(root, mapId, filename) {
  requireRmxp(root, "RPG::Map", `${filename} root`);
  const eventsValue = root.fields["@events"];
  const events = [];
  if (eventsValue != null) {
    if (eventsValue.kind !== "Hash") evidenceFail(`${filename} @events must be a Hash`);
    for (const [key, event] of eventsValue.entries) {
      const fact = eventFacts(event, mapId);
      if (key !== fact.eventId) evidenceFail(`${filename} event hash key ${key} does not equal @id ${fact.eventId}`);
      events.push(fact);
    }
  }
  events.sort((left, right) => left.eventId - right.eventId);
  return Object.freeze({
    mapId,
    filename,
    tilesetId: requireInteger(root.fields["@tileset_id"], "Map.tileset_id", { positive: true }),
    width: requireInteger(root.fields["@width"], "Map.width", { positive: true }),
    height: requireInteger(root.fields["@height"], "Map.height", { positive: true }),
    data: root.fields["@data"],
    events: Object.freeze(events),
  });
}

export function extractMapInfoName(root, mapId) {
  if (root?.kind !== "Hash") evidenceFail("MapInfos.rxdata root must be a Hash");
  for (const [key, info] of root.entries) {
    if (key !== mapId) continue;
    requireRmxp(info, "RPG::MapInfo", `MapInfos[${mapId}]`);
    return rubyText(info.fields["@name"], `MapInfos[${mapId}].name`).text ?? "";
  }
  return null;
}

export function extractTilesetTerrain(root, tilesetId) {
  if (root?.kind !== "Array") evidenceFail("Tilesets.rxdata root must be an Array");
  const tileset = root.items[tilesetId];
  requireRmxp(tileset, "RPG::Tileset", `Tilesets[${tilesetId}]`);
  const id = requireInteger(tileset.fields["@id"], "Tileset.id", { positive: true });
  if (id !== tilesetId) evidenceFail(`Tilesets[${tilesetId}] id ${id} does not match index`);
  const tags = tileset.fields["@terrain_tags"];
  if (tags?.kind !== "Table") evidenceFail("Tileset.terrain_tags must be a Table");
  const name = tileset.fields["@name"]?.kind === "RubyString" ? tileset.fields["@name"].text : null;
  const tilesetName = rubyText(tileset.fields["@tileset_name"], "Tileset.tileset_name").text;
  const tableIssues = Object.freeze([
    ...validateOneDimensionalTilesetTable(tags, `Tilesets[${tilesetId}].terrain_tags`),
    ...validateOneDimensionalTilesetTable(tileset.fields["@passages"], `Tilesets[${tilesetId}].passages`),
    ...validateOneDimensionalTilesetTable(tileset.fields["@priorities"], `Tilesets[${tilesetId}].priorities`),
  ]);
  return Object.freeze({
    id,
    name,
    tileset_name: tilesetName,
    terrain_tags: tags,
    passages: tileset.fields["@passages"],
    priorities: tileset.fields["@priorities"],
    tableIssues,
  });
}

export function extractTilesetBridgeCatalog(root) {
  if (root?.kind !== "Array") evidenceFail("Tilesets.rxdata root must be an Array");
  const catalog = [];
  for (let index = 1; index < root.items.length; index += 1) {
    if (root.items[index] == null) continue;
    const terrain = extractTilesetTerrain(root, index);
    const tileIds = [];
    for (let tileId = 0; tileId < terrain.terrain_tags.xSize; tileId += 1) {
      if (tableAt(terrain.terrain_tags, tileId) === BRIDGE_TERRAIN_TAG) tileIds.push(tileId);
    }
    catalog.push(Object.freeze({
      id: terrain.id,
      name: terrain.name,
      tileset_name: terrain.tileset_name,
      bridgeTileCount: tileIds.length,
      bridgeTileIds: Object.freeze(tileIds),
    }));
  }
  return Object.freeze(catalog);
}

function commentTexts(page) {
  const texts = [];
  for (const command of page.commands) {
    if (command.code !== 108 && command.code !== 408) continue;
    const first = command.parameters[0];
    if (first?.kind === "RubyString" && typeof first.text === "string") texts.push(first.text);
  }
  return texts;
}

function pageSummary(page) {
  return Object.freeze({
    pageIndex: page.pageIndex,
    pageCount: page.pageCount,
    trigger: page.trigger,
    triggerSemantics: page.triggerSemantics,
    through: page.through,
    always_on_top: page.always_on_top,
    condition: page.condition,
    graphic: Object.freeze({
      tile_id: page.graphic.tile_id,
      character_name: page.graphic.character_name,
    }),
    concatenatedScripts: page.concatenatedScripts,
    moveRouteScriptTexts: Object.freeze((page.moveRouteScripts ?? []).filter((item) => item.isScript).map((item) => item.scriptText)),
    conditionalBranchScriptTexts: Object.freeze((page.conditionalBranchScripts ?? []).map((item) => item.scriptText)),
    hasBridgeScript: pageHasBridgeScript(page),
    commentTexts: Object.freeze(commentTexts(page)),
    transferCommands: Object.freeze(page.commands.filter((command) => command.code === TRANSFER_PLAYER_CODE).map((command) => Object.freeze({
      index: command.index,
      parameters: command.parameters,
    }))),
  });
}

function bboxOf(cells) {
  if (cells.length === 0) return null;
  return Object.freeze({
    minX: Math.min(...cells.map((cell) => cell.x)),
    maxX: Math.max(...cells.map((cell) => cell.x)),
    minY: Math.min(...cells.map((cell) => cell.y)),
    maxY: Math.max(...cells.map((cell) => cell.y)),
  });
}

export function collectTerrainTaggedCells(mapFacts, terrainTags, tagId, options = {}) {
  const tagLabel = options.tagLabel ?? `tag-${tagId}`;
  const strict = options.strict === true;
  const issues = [];
  if (terrainTags?.kind !== "Table") {
    if (strict) evidenceFail("terrain_tags must be a Table to prove terrain cell counts");
    return Object.freeze({
      tagId,
      cellCount: 0,
      cells: Object.freeze([]),
      tileIds: Object.freeze([]),
      placedTaggedTiles: 0,
      bbox: null,
      scanStatus: COMPLETENESS.INCOMPLETE,
      issues: Object.freeze(["terrain_tags missing or not a Table"]),
      outOfRange: Object.freeze([]),
      negativeTileIds: Object.freeze([]),
      missing: true,
      provenNegative: false,
    });
  }
  issues.push(...validateOneDimensionalTilesetTable(terrainTags, "Tileset.terrain_tags"));
  const data = mapFacts.data;
  if (data?.kind !== "Table") {
    if (strict) evidenceFail("Map.data must be a Table to scan terrain cells");
    issues.push("Map.data missing or not a Table");
  } else {
    issues.push(...validateTableShape(data, {
      dimensions: 3,
      xSize: mapFacts.width,
      ySize: mapFacts.height,
      zSize: 3,
    }, "Map.data"));
  }
  if (strict && issues.length > 0) evidenceFail(issues[0]);

  const cells = [];
  const tileIds = new Set();
  const outOfRange = [];
  const negativeTileIds = [];
  const tagLimit = terrainTags.xSize;
  const height = mapFacts.height;
  const width = mapFacts.width;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const layers = [];
      for (const z of [2, 1, 0]) {
        const tileId = data?.kind === "Table" ? tableAt(data, x, y, z) : undefined;
        if (tileId === 0) continue;
        if (!Number.isSafeInteger(tileId)) {
          issues.push(`Map.data[${x},${y},${z}] is not a safe integer`);
          continue;
        }
        if (tileId < 0) {
          negativeTileIds.push(Object.freeze({ x, y, z, tileId, mapId: mapFacts.mapId }));
          continue;
        }
        if (tileId >= tagLimit) {
          outOfRange.push(Object.freeze({ x, y, z, tileId, tagLimit, mapId: mapFacts.mapId }));
          continue;
        }
        const tag = tableAt(terrainTags, tileId);
        if (tag === tagId) {
          layers.push(Object.freeze({ z, tileId, terrainTag: tag }));
          tileIds.add(tileId);
        }
      }
      if (layers.length > 0) cells.push(Object.freeze({ x, y, layers: Object.freeze(layers) }));
    }
  }
  if (outOfRange.length > 0) issues.push(`${outOfRange.length} placed tile IDs are outside terrain_tags.xSize ${tagLimit}`);
  if (negativeTileIds.length > 0) issues.push(`${negativeTileIds.length} negative tile IDs are distinct from empty tile 0`);
  const scanStatus = issues.length > 0 ? COMPLETENESS.INCOMPLETE : COMPLETENESS.COMPLETE;
  if (strict && scanStatus === COMPLETENESS.INCOMPLETE) {
    evidenceFail(issues[0], outOfRange.slice(0, 8));
  }
  let placed = 0;
  for (const cell of cells) placed += cell.layers.length;
  return Object.freeze({
    tagId,
    tagLabel,
    cellCount: cells.length,
    cells: Object.freeze(cells),
    tileIds: Object.freeze([...tileIds].sort((left, right) => left - right)),
    placedTaggedTiles: placed,
    placedBridgeTaggedTiles: tagId === BRIDGE_TERRAIN_TAG ? placed : undefined,
    bbox: bboxOf(cells),
    scanStatus,
    issues: Object.freeze(issues),
    outOfRange: Object.freeze(outOfRange),
    negativeTileIds: Object.freeze(negativeTileIds),
    provenNegative: scanStatus === COMPLETENESS.COMPLETE && cells.length === 0,
  });
}

export function collectBridgeCells(mapFacts, terrainTags, options = {}) {
  const scan = collectTerrainTaggedCells(mapFacts, terrainTags, BRIDGE_TERRAIN_TAG, { ...options, tagLabel: "Bridge" });
  return Object.freeze({
    ...scan,
    placedBridgeTaggedTiles: scan.placedTaggedTiles,
  });
}

export function collectLedgeCells(mapFacts, terrainTags, options = {}) {
  return collectTerrainTaggedCells(mapFacts, terrainTags, LEDGE_TERRAIN_TAG, { ...options, tagLabel: "Ledge" });
}

export function buildPassabilityContext(mapFacts, terrain, events) {
  return Object.freeze({
    mapId: mapFacts.mapId,
    width: mapFacts.width,
    height: mapFacts.height,
    mapData: mapFacts.data,
    terrainTags: terrain.terrain_tags,
    passages: terrain.passages,
    priorities: terrain.priorities,
    events: events ?? mapFacts.events,
  });
}

export function buildEventTriggerMatrix(context, events, options = {}) {
  const ids = options.eventIds;
  const bridgeLevels = options.bridgeLevels ?? [0, 2];
  const selected = ids ? events.filter((event) => ids.includes(event.eventId)) : events;
  return Object.freeze(selected.map((event) => {
    const page = selectAlwaysActivePage(event);
    const byBridgeLevel = {};
    for (const bridgeLevel of bridgeLevels) {
      const over = overTriggerForEvent(context, event, { page, bridgeLevel });
      const branch = hereVersusTouch(over.overTrigger, page);
      const occupied = (over.occupied ?? []).map((tile) => Object.freeze({
        x: tile.x,
        y: tile.y,
        passable: tile.passable?.passable ?? null,
        reason: tile.passable?.reason ?? null,
        completeness: tile.passable?.completeness ?? tile.passable?.player?.completeness,
        bit: tile.passable?.player?.bit ?? vanillaPassageBit(0),
        layers: tile.passable?.player?.layers ?? Object.freeze([]),
      }));
      byBridgeLevel[bridgeLevel] = Object.freeze({
        overTrigger: over.overTrigger,
        overTriggerReason: over.reason,
        grade: over.grade,
        branch: branch.branch,
        branchSource: branch.source,
        occupied: Object.freeze(occupied),
      });
    }
    const scriptDelta = page ? inferBridgeScriptDelta(page) : null;
    return Object.freeze({
      mapId: event.mapId,
      eventId: event.eventId,
      name: event.name,
      pageIndex: page?.pageIndex ?? null,
      origin: Object.freeze({ x: event.x, y: event.y }),
      size: event.size,
      occupiedTiles: event.occupiedTiles,
      graphic: page ? Object.freeze({ tile_id: page.graphic.tile_id, character_name: page.graphic.character_name }) : null,
      through: page?.through ?? null,
      trigger: page?.trigger ?? null,
      triggerSemantics: page?.triggerSemantics ?? null,
      alwaysActive: page?.condition?.alwaysActive ?? null,
      listSize: page?.commands?.length ?? 0,
      startRule: "Game_Event#start sets @starting only if @list.size > 1",
      interpreterRule: "check_event_trigger_here/touch return immediately if map interpreter is running; execute is not start",
      scriptDelta,
      byBridgeLevel: Object.freeze(byBridgeLevel),
    });
  }));
}

function adjacentToBridge(tiles, bridgeCells) {
  const hits = [];
  const seen = new Set();
  for (const tile of tiles) {
    for (const cell of bridgeCells.cells) {
      const dx = Math.abs(cell.x - tile.x);
      const dy = Math.abs(cell.y - tile.y);
      let relation = null;
      if (dx === 0 && dy === 0) relation = "on-bridge-cell";
      else if (dx + dy === 1) relation = "orthogonally-adjacent";
      if (!relation) continue;
      const key = `${relation}:${cell.x},${cell.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(Object.freeze({ relation, x: cell.x, y: cell.y, fromEventTile: Object.freeze({ x: tile.x, y: tile.y }) }));
    }
  }
  return Object.freeze(hits);
}

function pageHasBridgeScript(page) {
  if (page.hasBridgeScript === true) return true;
  if (page.concatenatedScripts.some((group) => BRIDGE_SCRIPT_PATTERN.test(group.joinedWithNewlines))) return true;
  if ((page.moveRouteScripts ?? []).some((item) => item.matchesBridgePattern === true)) return true;
  if ((page.conditionalBranchScripts ?? []).some((item) => item.matchesBridgePattern === true)) return true;
  return false;
}

function pageCommonEventIds(page) {
  return page.commands
    .filter((command) => command.code === COMMON_EVENT_CODE)
    .map((command) => command.parameters[0])
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

function pageTransferCommands(page) {
  return page.commands.filter((command) => command.code === TRANSFER_PLAYER_CODE);
}

export function classifyCandidates(events, bridgeCells, commonEventBridgeIds = new Set(), options = {}) {
  const reachability = options.reachability;
  const candidates = [];
  for (const event of events) {
    const reasons = [];
    if (BRIDGE_NAME_PATTERN.test(event.name)) reasons.push("event-name-matches-bridge");
    const tiles = event.occupiedTiles ?? occupiedTiles(event.x, event.y, event.size?.width ?? 1, event.size?.height ?? 1);
    const terrainHits = adjacentToBridge(tiles, bridgeCells);
    if (terrainHits.some((item) => item.relation === "on-bridge-cell")) reasons.push("event-occupied-tile-has-bridge-terrain");
    else if (terrainHits.length > 0) reasons.push("event-occupied-tile-orthogonally-adjacent-to-bridge-terrain");
    const scriptPages = event.pages.filter(pageHasBridgeScript);
    if (scriptPages.length > 0) reasons.push("page-script-calls-pbBridgeOn-or-pbBridgeOff");
    const chains = reachability ? chainsFromMapEvent(event, reachability) : Object.freeze([]);
    const reachableViaCommon = chains.some((chain) => chain.canReachBridge === true)
      || event.pages.some((page) => pageCommonEventIds(page).some((id) => commonEventBridgeIds.has(id)));
    if (reachableViaCommon) reasons.push("page-calls-common-event-reachable-to-pbBridgeOn-or-pbBridgeOff");
    if (chains.some((chain) => chain.parseable === false || chain.dynamic === true)) {
      reasons.push("page-common-event-call-not-statically-resolvable");
    }
    const transferNearBridge = event.pages.some((page) => pageTransferCommands(page).length > 0) && terrainHits.length > 0;
    if (transferNearBridge) reasons.push("transfer-player-near-bridge-terrain");
    const uncertainty = event.pages.flatMap((page) => page.scriptUncertainty ?? []);
    if (uncertainty.length > 0) reasons.push("page-has-unverified-indirect-ruby");
    const decodeErrors = event.pages.flatMap((page) => page.decodeErrors ?? []);
    if (decodeErrors.length > 0) reasons.push("page-has-decode-error");
    if (reasons.length === 0) continue;
    const confirmed = reasons.includes("page-script-calls-pbBridgeOn-or-pbBridgeOff")
      || reasons.includes("page-calls-common-event-reachable-to-pbBridgeOn-or-pbBridgeOff");
    candidates.push(Object.freeze({
      mapId: event.mapId,
      eventId: event.eventId,
      name: event.name,
      x: event.x,
      y: event.y,
      size: event.size,
      occupiedTiles: tiles,
      status: confirmed ? "confirmed-bridge-script" : "unconfirmed-candidate",
      reasons: Object.freeze(reasons),
      terrainHits,
      commonEventChains: chains,
      uncertainty: Object.freeze([...new Set(uncertainty)]),
      decodeErrors: Object.freeze(decodeErrors),
      event,
    }));
  }
  return Object.freeze(candidates);
}

export function extractCommonEventFacts(root) {
  if (root?.kind !== "Array") evidenceFail("CommonEvents.rxdata root must be an Array");
  const events = [];
  for (let index = 1; index < root.items.length; index += 1) {
    const item = root.items[index];
    if (item == null) continue;
    requireRmxp(item, "RPG::CommonEvent", `CommonEvents[${index}]`);
    const list = item.fields["@list"];
    if (list?.kind !== "Array") evidenceFail(`CommonEvents[${index}].list must be an Array`);
    const moveRouteScripts = [];
    const conditionalBranchScripts = [];
    const commands = list.items.map((command, commandIndex) => {
      requireRmxp(command, "RPG::EventCommand", `CommonEvents[${index}] command[${commandIndex}]`);
      const extras = extractRawCommandScriptExtras(command, commandIndex);
      moveRouteScripts.push(...extras.moveRouteScripts);
      conditionalBranchScripts.push(...extras.conditionalBranchScripts);
      return commandFacts(command, commandIndex);
    });
    const concatenatedScripts = concatenateScriptCommands(commands);
    const name = rubyText(item.fields["@name"], `CommonEvents[${index}].name`);
    const calledCommonEventIds = Object.freeze(commands.filter((command) => command.code === COMMON_EVENT_CODE).map((command) => command.parameters[0]).filter((id) => Number.isSafeInteger(id) && id > 0));
    const dynamicCalls = commands.filter((command) => command.code === COMMON_EVENT_CODE && !(Number.isSafeInteger(command.parameters[0]) && command.parameters[0] > 0));
    const allTexts = [
      ...concatenatedScripts.map((group) => group.joinedWithNewlines),
      ...moveRouteScripts.filter((item) => item.isScript && item.scriptText != null).map((item) => item.scriptText),
      ...conditionalBranchScripts.filter((item) => item.scriptText != null).map((item) => item.scriptText),
    ];
    const decodeErrors = [
      ...moveRouteScripts.filter((item) => item.decodeError),
      ...conditionalBranchScripts.filter((item) => item.decodeError),
      ...dynamicCalls.map((command) => Object.freeze({
        origin: `CommonEvents[${index}].command[${command.index}]`,
        decodeError: "common-event-117-target-not-positive-integer",
        value: command.parameters[0] ?? null,
      })),
    ];
    events.push(Object.freeze({
      id: requireInteger(item.fields["@id"], `CommonEvents[${index}].id`, { positive: true }),
      name: name.text ?? "",
      trigger: item.fields["@trigger"],
      switch_id: item.fields["@switch_id"],
      commands: Object.freeze(commands),
      concatenatedScripts,
      moveRouteScripts: Object.freeze(moveRouteScripts),
      conditionalBranchScripts: Object.freeze(conditionalBranchScripts),
      calledCommonEventIds,
      decodeErrors: Object.freeze(decodeErrors),
      hasBridgeScript: allTexts.some((text) => BRIDGE_SCRIPT_PATTERN.test(text)),
      scriptUncertainty: Object.freeze(allTexts.flatMap((text) => [...classifyScriptUncertainty(text)])),
    }));
  }
  return Object.freeze(events);
}

export function walkCommonEventGraph(startIds, commonEvents) {
  const index = new Map(commonEvents.map((event) => [event.id, event]));
  const reachable = [];
  const visited = new Set();
  const missing = [];
  const cycles = [];

  function visit(id, path) {
    if (path.includes(id)) {
      cycles.push(Object.freeze([...path, id]));
      return;
    }
    if (visited.has(id)) return;
    const event = index.get(id);
    if (!event) {
      missing.push(id);
      return;
    }
    visited.add(id);
    reachable.push(event);
    const nextPath = [...path, id];
    for (const child of event.calledCommonEventIds) visit(child, nextPath);
  }

  for (const id of startIds) visit(id, []);
  const bridgeIds = new Set(reachable.filter((event) => event.hasBridgeScript).map((event) => event.id));
  return Object.freeze({
    startIds: Object.freeze([...startIds]),
    reachableIds: Object.freeze(reachable.map((event) => event.id)),
    visitedCount: visited.size,
    missing: Object.freeze(missing),
    cycles: Object.freeze(cycles),
    bridgeIds,
    reachableHasBridge: bridgeIds.size > 0,
    uncertainty: Object.freeze(reachable.flatMap((event) => [...event.scriptUncertainty])),
  });
}

export function commonEventIdsCalledFromEvents(events) {
  const ids = [];
  for (const event of events) {
    for (const page of event.pages) ids.push(...pageCommonEventIds(page));
  }
  return Object.freeze(ids);
}

export function decodeRxdataBytes(bytes, sourceLabel) {
  const marshal = decodeMarshal(bytes, { source: sourceLabel });
  return decodeRmxpGraph(marshal);
}

async function readDecoded(path) {
  const bytes = await readFile(path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const decoded = decodeRxdataBytes(bytes, path);
  return Object.freeze({ path, sha256: digest, size: bytes.length, decoded });
}

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export async function resolveMapSource(sourceInput, mapId = DEFAULT_MAP_ID, options = {}) {
  if (options.allowUnlisted !== true) assertAllowedMapId(mapId);
  const filename = padMapId(mapId);
  const source = resolve(sourceInput);
  const info = await stat(source);
  if (info.isFile()) {
    const match = MAP_FILE.exec(basename(source));
    if (!match || Number(match[1]) !== mapId) evidenceFail(`source file ${source} is not ${filename}`);
    return Object.freeze({
      kind: "rxdata-file",
      source,
      mapRxdata: source,
      dataDirectory: dirname(source),
    });
  }
  if (!info.isDirectory()) evidenceFail(`source is not a file or directory: ${source}`);

  const fsdbChildren = (await readdir(source, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && FSDB_NAME.test(entry.name))
    .map((entry) => join(source, entry.name));
  const mapRxdata = await firstExisting([
    join(source, "[resource]Data", filename),
    join(source, "Data", filename),
    ...fsdbChildren.map((dir) => join(dir, "[resource]Data", filename)),
    ...fsdbChildren.map((dir) => join(dir, "Data", filename)),
  ]);
  if (!mapRxdata) {
    evidenceFail(`could not find ${filename} under ${source}`, [
      join(source, "[resource]Data", filename),
      join(source, "Data", filename),
    ]);
  }
  return Object.freeze({
    kind: "directory",
    source,
    mapRxdata,
    dataDirectory: dirname(mapRxdata),
  });
}

function optionalPath(directory, filename) {
  const path = join(directory, filename);
  return existsSync(path) ? path : undefined;
}

export function scanCoverage(events) {
  let pages = 0;
  let commands = 0;
  let scriptCommands = 0;
  let moveRouteScriptCount = 0;
  let conditionalBranchScriptCount = 0;
  let commonEventCallCount = 0;
  const scripts = [];
  const unknownCommandCodes = new Set();
  const unverified = [];
  const decodeErrors = [];
  for (const event of events) {
    pages += event.pageCount;
    for (const page of event.pages) {
      commands += page.commands.length;
      scriptCommands += page.commands.filter((command) => command.code === SCRIPT_START_CODE || command.code === SCRIPT_CONTINUE_CODE).length;
      moveRouteScriptCount += (page.moveRouteScripts ?? []).filter((item) => item.isScript).length;
      conditionalBranchScriptCount += (page.conditionalBranchScripts ?? []).length;
      commonEventCallCount += pageCommonEventIds(page).length;
      for (const command of page.commands) {
        if (command.label.startsWith("unknown-code-")) unknownCommandCodes.add(command.code);
      }
      for (const group of page.concatenatedScripts) {
        scripts.push(Object.freeze({
          eventId: event.eventId,
          name: event.name,
          pageIndex: page.pageIndex,
          kind: "event-command-355-655",
          startCommandIndex: group.startCommandIndex,
          endCommandIndex: group.endCommandIndex,
          joinedWithNewlines: group.joinedWithNewlines,
          matchesBridgePattern: BRIDGE_SCRIPT_PATTERN.test(group.joinedWithNewlines),
          uncertainty: classifyScriptUncertainty(group.joinedWithNewlines),
        }));
      }
      for (const item of page.moveRouteScripts ?? []) {
        if (!item.isScript) continue;
        scripts.push(Object.freeze({
          eventId: event.eventId,
          name: event.name,
          pageIndex: page.pageIndex,
          kind: "move-route-script-45",
          origin: item.origin,
          joinedWithNewlines: `${item.scriptText}\n`,
          matchesBridgePattern: item.matchesBridgePattern === true,
          uncertainty: item.uncertainty ?? [],
        }));
      }
      for (const item of page.conditionalBranchScripts ?? []) {
        scripts.push(Object.freeze({
          eventId: event.eventId,
          name: event.name,
          pageIndex: page.pageIndex,
          kind: "conditional-branch-script",
          origin: item.origin,
          joinedWithNewlines: `${item.scriptText}\n`,
          matchesBridgePattern: item.matchesBridgePattern === true,
          uncertainty: item.uncertainty ?? [],
        }));
      }
      for (const reason of page.scriptUncertainty ?? []) {
        unverified.push(Object.freeze({ eventId: event.eventId, pageIndex: page.pageIndex, reason }));
      }
      for (const error of page.decodeErrors ?? []) {
        decodeErrors.push(Object.freeze({ eventId: event.eventId, pageIndex: page.pageIndex, ...error }));
        unverified.push(Object.freeze({ eventId: event.eventId, pageIndex: page.pageIndex, reason: error.decodeError }));
      }
    }
  }
  return Object.freeze({
    eventCount: events.length,
    pageCount: pages,
    commandCount: commands,
    scriptCommandCount: scriptCommands,
    moveRouteScriptCount,
    conditionalBranchScriptCount,
    commonEventCallCount,
    allPagesScanned: events.every((event) => event.pages.length === event.pageCount),
    eventIdsInOrder: Object.freeze(events.map((event) => event.eventId)),
    unknownCommandCodes: Object.freeze([...unknownCommandCodes].sort((left, right) => left - right)),
    unverified: Object.freeze(unverified),
    decodeErrors: Object.freeze(decodeErrors),
    scannedEntrances: Object.freeze([
      "all-events",
      "all-pages-original-order",
      "all-commands-original-order",
      "script-355-655-concat-like-command_355",
      "move-route-209-509-and-page-autonomous-list-code-45",
      "conditional-branch-111-type-12",
      "common-event-117-call-graph-with-cycle-detection",
      "common-event-reachability-from-each-map-caller",
      "over-trigger-and-playerPassable-d0",
    ]),
    scripts: Object.freeze(scripts),
  });
}

function bridgeTileIdSet(tilesetsRoot, tilesetId, cache) {
  if (cache.has(tilesetId)) return cache.get(tilesetId);
  const terrain = extractTilesetTerrain(tilesetsRoot, tilesetId);
  const ids = new Set();
  for (let tileId = 0; tileId < terrain.terrain_tags.xSize; tileId += 1) {
    if (tableAt(terrain.terrain_tags, tileId) === BRIDGE_TERRAIN_TAG) ids.add(tileId);
  }
  cache.set(tilesetId, ids);
  return ids;
}

export async function scanSiblingMapsForBridgeEvidence(dataDirectory, options = {}) {
  const files = (await readdir(dataDirectory)).filter((name) => MAP_FILE.test(name)).sort();
  const mapInfosPath = optionalPath(dataDirectory, "MapInfos.rxdata");
  const tilesetsPath = optionalPath(dataDirectory, "Tilesets.rxdata");
  const commonEventsPath = optionalPath(dataDirectory, "CommonEvents.rxdata");
  const completenessIssues = [];
  if (!mapInfosPath) completenessIssues.push("MapInfos.rxdata missing; corpus cannot prove map-name negatives");
  if (!tilesetsPath) completenessIssues.push("Tilesets.rxdata missing; Bridge cell counts are INCOMPLETE and must not be treated as zero");
  if (!commonEventsPath) completenessIssues.push("CommonEvents.rxdata missing; nested common-event bridge scripts are INCOMPLETE");
  const infosRoot = mapInfosPath ? (await readDecoded(mapInfosPath)).decoded.root : null;
  const tilesetsRoot = tilesetsPath ? (await readDecoded(tilesetsPath)).decoded.root : null;
  const commonEvents = commonEventsPath ? extractCommonEventFacts((await readDecoded(commonEventsPath)).decoded.root) : Object.freeze([]);
  const reachability = computeCommonEventReachability(commonEvents);
  const reachableFromAnyCaller = new Set(reachability.idsThatCanReachBridge);
  const tilesetCache = new Map();
  const tilesetCatalog = tilesetsRoot ? extractTilesetBridgeCatalog(tilesetsRoot) : Object.freeze([]);
  const mapsWithBridgeScripts = [];
  const mapsUsingBridgeTiles = [];
  const mapsWithBridgeEventNames = [];
  const mapsWithBridgeComments = [];
  const mapsWithBridgeInfoNames = [];
  const inventoryById = new Map();

  function inventory(mapId) {
    if (!inventoryById.has(mapId)) {
      inventoryById.set(mapId, {
        mapId,
        name: null,
        filename: null,
        tilesetId: null,
        width: null,
        height: null,
        hasBridgeTiles: false,
        hasBridgeScripts: false,
        hasBridgeEventName: false,
        hasBridgeComment: false,
        uniqueCellCount: 0,
        placedBridgeTaggedTiles: 0,
        bbox: null,
        tileIds: [],
        scriptEventCount: 0,
      });
    }
    return inventoryById.get(mapId);
  }

  if (infosRoot?.kind === "Hash") {
    for (const [mapId] of infosRoot.entries) {
      const name = extractMapInfoName(infosRoot, mapId);
      if (name && BRIDGE_NAME_PATTERN.test(name)) {
        mapsWithBridgeInfoNames.push(Object.freeze({ mapId, name }));
        inventory(mapId).name = name;
      }
    }
  }

  for (const file of files) {
    const mapId = Number(MAP_FILE.exec(file)[1]);
    const decoded = decodeRxdataBytes(await readFile(join(dataDirectory, file)), file);
    const facts = extractMapFacts(decoded.root, mapId, file);
    const name = infosRoot ? extractMapInfoName(infosRoot, mapId) : null;
    const row = inventory(mapId);
    row.name = name;
    row.filename = file;
    row.tilesetId = facts.tilesetId;
    row.width = facts.width;
    row.height = facts.height;

    const scriptHits = [];
    const nameHits = [];
    const commentHits = [];
    for (const event of facts.events) {
      if (BRIDGE_NAME_PATTERN.test(event.name)) {
        nameHits.push(Object.freeze({ eventId: event.eventId, name: event.name, x: event.x, y: event.y }));
      }
      for (const page of event.pages) {
        for (const group of page.concatenatedScripts) {
          if (BRIDGE_SCRIPT_PATTERN.test(group.joinedWithNewlines)) {
            scriptHits.push(Object.freeze({
              eventId: event.eventId,
              name: event.name,
              x: event.x,
              y: event.y,
              pageIndex: page.pageIndex,
              kind: "event-command-355-655",
              trigger: page.trigger,
              triggerSemantics: page.triggerSemantics,
              through: page.through,
              always_on_top: page.always_on_top,
              condition: page.condition,
              graphic: Object.freeze({ tile_id: page.graphic.tile_id, character_name: page.graphic.character_name }),
              startCommandIndex: group.startCommandIndex,
              endCommandIndex: group.endCommandIndex,
              joinedWithNewlines: group.joinedWithNewlines,
            }));
          }
        }
        for (const item of page.moveRouteScripts ?? []) {
          if (item.matchesBridgePattern === true) {
            scriptHits.push(Object.freeze({
              eventId: event.eventId,
              name: event.name,
              x: event.x,
              y: event.y,
              pageIndex: page.pageIndex,
              kind: "move-route-script-45",
              origin: item.origin,
              joinedWithNewlines: `${item.scriptText}\n`,
            }));
          }
        }
        for (const item of page.conditionalBranchScripts ?? []) {
          if (item.matchesBridgePattern === true) {
            scriptHits.push(Object.freeze({
              eventId: event.eventId,
              name: event.name,
              x: event.x,
              y: event.y,
              pageIndex: page.pageIndex,
              kind: "conditional-branch-script",
              origin: item.origin,
              joinedWithNewlines: `${item.scriptText}\n`,
            }));
          }
        }
        for (const text of commentTexts(page)) {
          if (BRIDGE_NAME_PATTERN.test(text)) {
            commentHits.push(Object.freeze({
              eventId: event.eventId,
              name: event.name,
              x: event.x,
              y: event.y,
              pageIndex: page.pageIndex,
              text,
            }));
          }
        }
      }
    }
    if (nameHits.length > 0) {
      row.hasBridgeEventName = true;
      mapsWithBridgeEventNames.push(Object.freeze({ mapId, name, filename: file, hits: Object.freeze(nameHits) }));
    }
    if (commentHits.length > 0) {
      row.hasBridgeComment = true;
      mapsWithBridgeComments.push(Object.freeze({ mapId, name, filename: file, hits: Object.freeze(commentHits) }));
    }
    if (scriptHits.length > 0) {
      row.hasBridgeScripts = true;
      row.scriptEventCount = new Set(scriptHits.map((item) => item.eventId)).size;
      mapsWithBridgeScripts.push(Object.freeze({ mapId, name, filename: file, hits: Object.freeze(scriptHits) }));
    }

    let bridgeCells = Object.freeze({
      tagId: BRIDGE_TERRAIN_TAG,
      cellCount: 0,
      cells: Object.freeze([]),
      tileIds: Object.freeze([]),
      scanStatus: tilesetsRoot ? COMPLETENESS.COMPLETE : COMPLETENESS.INCOMPLETE,
      issues: Object.freeze(tilesetsRoot ? [] : ["Tilesets.rxdata missing"]),
      outOfRange: Object.freeze([]),
      placedBridgeTaggedTiles: 0,
      bbox: null,
    });
    if (tilesetsRoot) {
      bridgeTileIdSet(tilesetsRoot, facts.tilesetId, tilesetCache);
      bridgeCells = collectBridgeCells(facts, extractTilesetTerrain(tilesetsRoot, facts.tilesetId).terrain_tags);
      if (bridgeCells.scanStatus === COMPLETENESS.INCOMPLETE) completenessIssues.push(`map ${mapId}: ${bridgeCells.issues.join("; ")}`);
      if (bridgeCells.cellCount > 0) {
        row.hasBridgeTiles = true;
        row.uniqueCellCount = bridgeCells.cellCount;
        row.placedBridgeTaggedTiles = bridgeCells.placedBridgeTaggedTiles;
        row.bbox = bridgeCells.bbox;
        row.tileIds = bridgeCells.tileIds;
        mapsUsingBridgeTiles.push(Object.freeze({
          mapId,
          name,
          filename: file,
          tilesetId: facts.tilesetId,
          width: facts.width,
          height: facts.height,
          uniqueCellCount: bridgeCells.cellCount,
          placedBridgeTaggedTiles: bridgeCells.placedBridgeTaggedTiles,
          bbox: row.bbox,
          tileIds: bridgeCells.tileIds,
          scanStatus: bridgeCells.scanStatus,
          sample: Object.freeze(bridgeCells.cells.slice(0, 8).map((cell) => Object.freeze({
            x: cell.x,
            y: cell.y,
            layers: cell.layers,
          }))),
        }));
      }
    } else {
      row.terrainScanStatus = COMPLETENESS.INCOMPLETE;
    }

    const graph = walkCommonEventGraph(commonEventIdsCalledFromEvents(facts.events), commonEvents);
    const candidates = classifyCandidates(facts.events, bridgeCells, reachableFromAnyCaller, { reachability });
    const confirmedViaCall = candidates.filter((item) => item.status === "confirmed-bridge-script");
    if (confirmedViaCall.some((item) => item.reasons.includes("page-calls-common-event-reachable-to-pbBridgeOn-or-pbBridgeOff"))) {
      row.hasBridgeScripts = true;
      row.indirectCommonEventBridge = true;
    }
    const relevant = row.hasBridgeTiles || row.hasBridgeScripts || row.hasBridgeEventName || row.hasBridgeComment
      || confirmedViaCall.length > 0;
    if (relevant) {
      row.candidates = Object.freeze(candidates.map((candidate) => Object.freeze({
        eventId: candidate.eventId,
        name: candidate.name,
        x: candidate.x,
        y: candidate.y,
        size: candidate.size,
        status: candidate.status,
        reasons: candidate.reasons,
        terrainHits: candidate.terrainHits,
        commonEventChains: candidate.commonEventChains,
        pages: Object.freeze(candidate.event.pages.map(pageSummary)),
      })));
    }
  }

  const inventoryRows = Object.freeze([...inventoryById.values()]
    .filter((row) => row.hasBridgeTiles || row.hasBridgeScripts || row.hasBridgeEventName || row.hasBridgeComment)
    .sort((left, right) => left.mapId - right.mapId)
    .map((row) => Object.freeze(row)));

  return Object.freeze({
    mapsScanned: files.length,
    mapInfoEntries: infosRoot?.kind === "Hash" ? infosRoot.entries.length : 0,
    completeness: Object.freeze({
      status: completenessIssues.length > 0 ? COMPLETENESS.INCOMPLETE : COMPLETENESS.COMPLETE,
      issues: Object.freeze(completenessIssues),
      requiredPresent: Object.freeze({
        mapInfos: Boolean(mapInfosPath),
        tilesets: Boolean(tilesetsPath),
        commonEvents: Boolean(commonEventsPath),
      }),
    }),
    scannedEntrances: Object.freeze([
      "all-Map-star-rxdata",
      "script-355-655",
      "move-route-45",
      "conditional-branch-111-type-12",
      "common-event-117-reachability-from-map-callers",
      "terrain-tag-15-when-tilesets-present",
      "event-name-comment-mapinfo-name",
    ]),
    excludeFullEventDump: true,
    note: "Corpus inventory of Bridge-tagged tiles and pbBridgeOn/Off across 355/655, move-route scripts, conditional-branch scripts, and Common Event reachability from each map's 117 callers. Autorun/parallel Common Events are listed separately and are not map-event negatives. Zero Bridge cells are only proven when completeness.status is COMPLETE.",
    commonEventReachability: Object.freeze({
      idsThatCanReachBridge: reachability.idsThatCanReachBridge,
      autorunOrParallel: reachability.autorunOrParallel,
      note: reachability.note,
    }),
    tilesetsWithBridgeTags: Object.freeze(tilesetCatalog.filter((item) => item.bridgeTileCount > 0)),
    tilesetsWithoutBridgeTags: Object.freeze(tilesetCatalog.filter((item) => item.bridgeTileCount === 0).map((item) => Object.freeze({ id: item.id, name: item.name, tileset_name: item.tileset_name }))),
    mapsWithBridgeInfoNames: Object.freeze(mapsWithBridgeInfoNames),
    mapsWithBridgeScripts: Object.freeze(mapsWithBridgeScripts),
    mapsUsingBridgeTiles: Object.freeze(mapsUsingBridgeTiles),
    mapsWithBridgeEventNames: Object.freeze(mapsWithBridgeEventNames),
    mapsWithBridgeComments: Object.freeze(mapsWithBridgeComments),
    inventory: inventoryRows,
    requestedBy: options.requestedBy ?? "corpus-scan",
  });
}

function uniqueActivePage(event) {
  let selected;
  for (const page of event.pages) {
    if (page.condition.alwaysActive) selected = page;
  }
  return selected;
}

function uniqueDirectTransferFromPage(page) {
  const indent0 = page.commands.filter((command) => command.code === TRANSFER_PLAYER_CODE && command.indent === 0);
  if (indent0.length !== 1) return undefined;
  const params = indent0[0].parameters;
  if (params[0] !== 0) return undefined;
  return Object.freeze({
    targetMapId: params[1],
    targetX: params[2],
    targetY: params[3],
    targetDirection: params[4] === 0 ? null : params[4],
  });
}

export function wouldProjectEventAsTransfer(event) {
  if (HIDDEN_ITEM_PATTERN.test(event.name) || SIZE_NAME_PATTERN.test(event.name)) {
    return Object.freeze({ projected: false, reason: "name-matches-hiddenitem-or-size", mirrors: "map-transfer-consumer.projectEvent" });
  }
  const page = uniqueActivePage(event);
  if (!page) return Object.freeze({ projected: false, reason: "no-always-active-static-page", mirrors: "selectStaticPage" });
  if (page.trigger !== 1) return Object.freeze({ projected: false, reason: "trigger-not-player-touch", pageIndex: page.pageIndex });
  if (page.always_on_top !== false) return Object.freeze({ projected: false, reason: "always_on_top", pageIndex: page.pageIndex });
  const transfer = uniqueDirectTransferFromPage(page);
  if (!transfer) return Object.freeze({ projected: false, reason: "no-unique-indent0-direct-transfer-player", pageIndex: page.pageIndex });
  if (page.through === true) {
    return Object.freeze({ projected: true, kind: "step-if-d0-passable", transfer, pageIndex: page.pageIndex, mirrors: "emitStep" });
  }
  if (page.graphic.character_name.length > 0) {
    return Object.freeze({ projected: true, kind: "contacts", transfer, pageIndex: page.pageIndex, mirrors: "emitContacts" });
  }
  if (page.graphic.character_name.length === 0 && page.graphic.tile_id === 0) {
    return Object.freeze({ projected: true, kind: "step-or-contacts-depending-on-d0", transfer, pageIndex: page.pageIndex, mirrors: "emitStep-or-emitContacts" });
  }
  return Object.freeze({ projected: false, reason: "through-false-nonempty-tile-graphic-without-character", pageIndex: page.pageIndex });
}

export function analyzeImporterRisk(mapRecord, tilesetRecord, candidates, transferRecord, mapId = DEFAULT_MAP_ID) {
  const notes = [];
  for (const candidate of candidates) {
    const d0 = mapRecord && tilesetRecord ? projectedD0Passable(mapRecord, tilesetRecord, candidate.x, candidate.y) : null;
    const projection = wouldProjectEventAsTransfer(candidate.event);
    const staticPage = uniqueActivePage(candidate.event);
    const transfers = candidate.event.pages.flatMap((page) => page.commands.filter((command) => command.code === TRANSFER_PLAYER_CODE));
    notes.push(Object.freeze({
      eventId: candidate.eventId,
      x: candidate.x,
      y: candidate.y,
      size: candidate.size,
      projectedD0Passable: d0,
      staticAlwaysActivePageIndex: staticPage?.pageIndex ?? null,
      staticPageTrigger: staticPage?.trigger ?? null,
      transferCommandCount: transfers.length,
      projection,
      wouldBeMapTransferCandidate: projection.projected === true,
    }));
  }
  return Object.freeze({
    existingMapTransferRecord: transferRecord ?? null,
    candidateTileNotes: Object.freeze(notes),
    distinction: Object.freeze({
      proven: transferRecord
        ? `FSDB MapTransfer/${mapId}.json is the importer output already produced for this corpus`
        : `no FSDB MapTransfer/${mapId}.json was present beside the source`,
      potential: "projectedD0Passable ignores Neutral/Bridge/player bridgeLevel; expandConnection drops an edge when the destination cell is not D0-passable. SIZE_EVENT names are skipped entirely by projectEvent.",
      unproven: "A dropped record is only '已证实误删' when a source transfer/edge exists, the importer omitted it, and the omission is because of D0/size/static-page rules. Potential risk is not a reproduction.",
    }),
  });
}

function passageAndPriority(tilesetRecord, tileId) {
  if (!tilesetRecord || tileId == null) return null;
  if (tileId < 0 || tileId >= tilesetRecord.passages.xSize || tileId >= tilesetRecord.priorities.xSize) {
    return Object.freeze({ tileId, outOfRange: true });
  }
  const passage = tilesetRecord.passages.values[tileId];
  const priority = tilesetRecord.priorities.values[tileId];
  return Object.freeze({
    tileId,
    passage,
    priority,
    blockedAll: (passage & 0x0f) === 0x0f,
    stopsAtPriorityZero: priority === 0,
  });
}

export function auditMapTransferAgainstFacts({ mapId, events, mapRecord, tilesetRecord, transferRecord, bridgeCells }) {
  const eventAudits = events.map((event) => {
    const pagesWithTransfer = event.pages.filter((page) => page.commands.some((command) => command.code === TRANSFER_PLAYER_CODE));
    const projection = wouldProjectEventAsTransfer(event);
    return Object.freeze({
      eventId: event.eventId,
      name: event.name,
      x: event.x,
      y: event.y,
      size: event.size,
      hasTransferPlayer: pagesWithTransfer.length > 0,
      projection,
      verdict: pagesWithTransfer.length === 0
        ? "excluded-no-transfer-player"
        : projection.projected
          ? "projected-or-would-project"
          : `not-projected:${projection.reason}`,
    });
  });
  const transferEvents = eventAudits.filter((item) => item.hasTransferPlayer);
  const skippedBecauseSize = transferEvents.filter((item) => item.projection.reason === "name-matches-hiddenitem-or-size");
  const actualSteps = transferRecord?.steps ?? [];
  const actualContacts = transferRecord?.contacts ?? [];
  const actualEdges = transferRecord?.edges ?? [];

  const bridgeDestRisks = [];
  if (bridgeCells?.cells?.length && mapRecord && tilesetRecord) {
    for (const cell of bridgeCells.cells) {
      let d0;
      try {
        d0 = projectedD0Passable(mapRecord, tilesetRecord, cell.x, cell.y);
      } catch (error) {
        d0 = `error:${error instanceof Error ? error.message : String(error)}`;
      }
      const layers = cell.layers.map((layer) => passageAndPriority(tilesetRecord, layer.tileId));
      bridgeDestRisks.push(Object.freeze({
        x: cell.x,
        y: cell.y,
        projectedD0Passable: d0,
        layers,
        note: d0 === false
          ? "this Bridge cell is D0-impassable; an incoming edge/step targeting it would be dropped"
          : "D0 currently passable; Bridge overlay did not by itself make this cell a static drop",
      }));
    }
  }

  const incomingEdgesOntoBridge = actualEdges.filter((edge) => (
    Number(edge.targetMapId ?? mapId) === Number(mapId)
    && bridgeCells?.cells?.some((cell) => cell.x === edge.targetX && cell.y === edge.targetY) === true
  ));
  const localEdgesFromBridge = actualEdges.filter((edge) => (
    Number(edge.targetMapId ? mapId : mapId) === Number(mapId)
    && bridgeCells?.cells?.some((cell) => cell.x === edge.x && cell.y === edge.y) === true
  ));

  const findings = [];
  if (skippedBecauseSize.length > 0) {
    findings.push(Object.freeze({
      status: "potential-not-reproduced-as-lost-bridge-exit",
      detail: `${skippedBecauseSize.length} Transfer Player event(s) skipped because the name matches size()/hiddenitem. That is projectEvent behavior, independent of Bridge tiles.`,
      eventIds: Object.freeze(skippedBecauseSize.map((item) => item.eventId)),
    }));
  }
  if (incomingEdgesOntoBridge.length > 0) {
    findings.push(Object.freeze({
      status: "needs-dest-check",
      detail: "MapTransfer already contains edges whose destination sits on a Bridge cell; they were not dropped.",
      count: incomingEdgesOntoBridge.length,
    }));
  }
  const d0FalseBridgeCells = bridgeDestRisks.filter((item) => item.projectedD0Passable === false);
  if (d0FalseBridgeCells.length > 0) {
    findings.push(Object.freeze({
      status: "potential-risk-not-reproduced",
      detail: `${d0FalseBridgeCells.length} Bridge cells are D0-impassable. Incoming edges/steps targeting those cells would be dropped by expandConnection/emitStep. This is not by itself a proven omitted MapTransfer record.`,
      sample: Object.freeze(d0FalseBridgeCells.slice(0, 12)),
    }));
  }
  if (transferEvents.length === 0 && actualSteps.length === 0 && actualContacts.length === 0) {
    findings.push(Object.freeze({
      status: "excluded-for-bridge-events",
      detail: `Map ${mapId} has no Transfer Player commands among scanned events, matching empty steps/contacts. Bridge On/Off events are not MapTransfer records.`,
    }));
  }

  return Object.freeze({
    mapId,
    actual: Object.freeze({
      stepCount: actualSteps.length,
      contactCount: actualContacts.length,
      edgeCount: actualEdges.length,
      edges: Object.freeze(actualEdges),
    }),
    transferEvents: Object.freeze(transferEvents),
    skippedBecauseSize: Object.freeze(skippedBecauseSize),
    localEdgesFromBridge: Object.freeze(localEdgesFromBridge),
    incomingEdgesOntoBridge: Object.freeze(incomingEdgesOntoBridge),
    bridgeCellD0: Object.freeze({
      scanned: bridgeDestRisks.length,
      d0False: d0FalseBridgeCells.length,
      sample: Object.freeze(d0FalseBridgeCells.slice(0, 8)),
    }),
    findings: Object.freeze(findings),
  });
}

function publicFileRecord(file, dataDirectory) {
  return Object.freeze({
    path: forensicRelPath(file.path, dataDirectory),
    sha256: file.sha256,
    size: file.size,
  });
}

function emptyBridgeScan(issues) {
  return Object.freeze({
    tagId: BRIDGE_TERRAIN_TAG,
    cellCount: 0,
    cells: Object.freeze([]),
    tileIds: Object.freeze([]),
    placedBridgeTaggedTiles: 0,
    bbox: null,
    scanStatus: COMPLETENESS.INCOMPLETE,
    issues: Object.freeze(issues),
    outOfRange: Object.freeze([]),
    negativeTileIds: Object.freeze([]),
    missing: true,
    provenNegative: false,
  });
}

export async function collectMapEvidence(sourceInput, options = {}) {
  const mapId = assertAllowedMapId(options.mapId ?? DEFAULT_MAP_ID);
  const located = await resolveMapSource(sourceInput, mapId);
  const mapFile = await readDecoded(located.mapRxdata);
  const mapFacts = extractMapFacts(mapFile.decoded.root, mapId, basename(located.mapRxdata));
  const tilesetsPath = optionalPath(located.dataDirectory, "Tilesets.rxdata");
  const mapInfosPath = optionalPath(located.dataDirectory, "MapInfos.rxdata");
  const commonEventsPath = optionalPath(located.dataDirectory, "CommonEvents.rxdata");
  const completenessIssues = [];
  const files = {
    map: publicFileRecord(mapFile, located.dataDirectory),
  };

  let mapName = null;
  if (mapInfosPath) {
    const infos = await readDecoded(mapInfosPath);
    files.mapInfos = publicFileRecord(infos, located.dataDirectory);
    mapName = extractMapInfoName(infos.decoded.root, mapId);
  } else {
    completenessIssues.push("MapInfos.rxdata missing");
  }

  let bridgeCells = emptyBridgeScan(["Tilesets.rxdata missing"]);
  let ledgeCells = Object.freeze({ ...emptyBridgeScan(["Tilesets.rxdata missing"]), tagId: LEDGE_TERRAIN_TAG, tagLabel: "Ledge" });
  let tilesetMeta;
  let mapRecord;
  let tilesetRecord;
  let terrain;
  let tilesetsRoot;
  let projectedTilesetById = new Map();
  if (tilesetsPath) {
    const tilesets = await readDecoded(tilesetsPath);
    files.tilesets = publicFileRecord(tilesets, located.dataDirectory);
    tilesetsRoot = tilesets.decoded.root;
    terrain = extractTilesetTerrain(tilesetsRoot, mapFacts.tilesetId);
    if (terrain.tableIssues.length > 0) completenessIssues.push(...terrain.tableIssues);
    tilesetMeta = Object.freeze({
      id: terrain.id,
      name: terrain.name,
      tileset_name: terrain.tileset_name,
      terrainTagCount: terrain.terrain_tags.xSize,
      passageCount: terrain.passages?.xSize,
      priorityCount: terrain.priorities?.xSize,
    });
    bridgeCells = collectBridgeCells(mapFacts, terrain.terrain_tags);
    ledgeCells = collectLedgeCells(mapFacts, terrain.terrain_tags);
    if (bridgeCells.scanStatus === COMPLETENESS.INCOMPLETE) completenessIssues.push(...bridgeCells.issues);
    if (ledgeCells.scanStatus === COMPLETENESS.INCOMPLETE) completenessIssues.push(...ledgeCells.issues.map((issue) => `ledge: ${issue}`));
    mapRecord = projectMapRecord({ filename: basename(located.mapRxdata), root: mapFile.decoded.root })?.value;
    const projectedTilesets = projectTilesetRecords({ filename: "Tilesets.rxdata", root: tilesetsRoot }, new Set());
    for (const entry of projectedTilesets ?? []) projectedTilesetById.set(Number(entry.key), entry.value);
    tilesetRecord = projectedTilesetById.get(mapFacts.tilesetId);
  } else {
    completenessIssues.push("Tilesets.rxdata missing; Bridge cell count is INCOMPLETE and not a proven zero");
  }

  let commonEvents = Object.freeze([]);
  if (commonEventsPath) {
    const common = await readDecoded(commonEventsPath);
    files.commonEvents = publicFileRecord(common, located.dataDirectory);
    commonEvents = extractCommonEventFacts(common.decoded.root);
    const ceDecode = commonEvents.flatMap((event) => event.decodeErrors ?? []);
    if (ceDecode.length > 0) completenessIssues.push(`CommonEvents decode errors: ${ceDecode.length}`);
  } else {
    completenessIssues.push("CommonEvents.rxdata missing; nested common-event graph is INCOMPLETE");
  }
  const calledIds = commonEventIdsCalledFromEvents(mapFacts.events);
  const commonGraph = walkCommonEventGraph(calledIds, commonEvents);
  if (commonGraph.missing.length > 0) completenessIssues.push(`common event ids missing: ${commonGraph.missing.join(",")}`);
  const reachability = computeCommonEventReachability(commonEvents);
  const mapReachableBridge = calledIds.some((id) => reachability.byId[id]?.canReachBridge === true);
  const reachableBridgeIds = new Set(reachability.idsThatCanReachBridge);
  const candidates = classifyCandidates(mapFacts.events, bridgeCells, reachableBridgeIds, { reachability });

  let transferRecord;
  const transferPath = await firstExisting([
    join(dirname(located.dataDirectory), "[struct]MapTransfer", `${mapId}.json`),
    join(dirname(dirname(located.dataDirectory)), "[struct]MapTransfer", `${mapId}.json`),
    join(located.source, "[struct]MapTransfer", `${mapId}.json`),
  ]);
  if (transferPath) {
    transferRecord = JSON.parse(await readFile(transferPath, "utf8"));
    files.mapTransfer = Object.freeze({
      path: forensicRelPath(transferPath, dirname(transferPath)),
      sha256: await sha256File(transferPath),
    });
  }

  const importer = analyzeImporterRisk(mapRecord, tilesetRecord, candidates, transferRecord, mapId);
  const transferAudit = auditMapTransferAgainstFacts({
    mapId,
    events: mapFacts.events,
    mapRecord,
    tilesetRecord,
    transferRecord,
    bridgeCells,
  });

  let connectionAudit = null;
  const pbsPath = await firstExisting([
    join(dirname(located.dataDirectory), "[resource]PBS", "map_connections.txt"),
    join(dirname(located.dataDirectory), "PBS", "map_connections.txt"),
  ]);
  if (pbsPath) {
    const pbsText = await readFile(pbsPath, "utf8");
    files.mapConnections = Object.freeze({
      path: forensicRelPath(pbsPath, dirname(pbsPath)),
      sha256: createHash("sha256").update(pbsText).digest("hex"),
      size: Buffer.byteLength(pbsText),
    });
    const parsed = parseMapConnectionLines(pbsText);
    const related = parsed.connections.filter((conn) => conn.mapAId === mapId || conn.mapBId === mapId);
    const maps = new Map();
    maps.set(mapId, mapRecord ?? { width: mapFacts.width, height: mapFacts.height, tileset_id: mapFacts.tilesetId, data: mapFacts.data });
    for (const conn of related) {
      for (const otherId of [conn.mapAId, conn.mapBId]) {
        if (maps.has(otherId)) continue;
        const siblingPath = optionalPath(located.dataDirectory, padMapId(otherId));
        if (!siblingPath) continue;
        const sibling = await readDecoded(siblingPath);
        const siblingFacts = extractMapFacts(sibling.decoded.root, otherId, basename(siblingPath));
        const projected = projectMapRecord({ filename: basename(siblingPath), root: sibling.decoded.root });
        maps.set(otherId, projected?.value ?? {
          width: siblingFacts.width,
          height: siblingFacts.height,
          tileset_id: siblingFacts.tilesetId,
          data: siblingFacts.data,
        });
      }
    }
    const perConnection = related.map((conn) => {
      const enumerated = enumerateConnectionOutcomes(conn, maps, projectedTilesetById);
      const comparison = compareExpectedToActualEdges(enumerated.outcomes, transferRecord?.edges ?? [], mapId);
      return Object.freeze({
        raw: conn.raw,
        mapAId: conn.mapAId,
        edgeA: conn.edgeA,
        offsetA: conn.offsetA,
        mapBId: conn.mapBId,
        edgeB: conn.edgeB,
        offsetB: conn.offsetB,
        blocked: enumerated.blocked,
        comparison,
        sampleExpected: Object.freeze(enumerated.outcomes.filter((item) => item.sourceMapId === mapId && item.wouldEmitEdge).slice(0, 8)),
        sampleIncoming: Object.freeze(enumerated.outcomes.filter((item) => item.targetMapId === mapId && item.wouldEmitEdge).slice(0, 12)),
        sampleDroppedD0: Object.freeze(enumerated.outcomes.filter((item) => item.sourceMapId === mapId && item.verdict === "d0-would-drop-on-target-cell").slice(0, 8)),
      });
    });
    connectionAudit = Object.freeze({
      completeness: parsed.issues.length > 0 ? COMPLETENESS.INCOMPLETE : COMPLETENESS.COMPLETE,
      pbsConnectionsInvolvingMap: related.length,
      parseIssues: parsed.issues,
      perConnection: Object.freeze(perConnection),
      note: "Each PBS line is mapped through geometry, target-map bounds, target-tileset D0, then compared to MapTransfer edges. Potential D0 drops are not proven deletions. Missing sibling maps are blocked, not silent zeros.",
    });
  } else {
    connectionAudit = Object.freeze({
      completeness: COMPLETENESS.INCOMPLETE,
      issues: Object.freeze(["PBS map_connections.txt missing beside this FSDB"]),
      note: "Connection audit is INCOMPLETE; this does not by itself make map-event COMPLETE fail.",
    });
  }

  const corpusScan = options.corpusScan === true
    ? await scanSiblingMapsForBridgeEvidence(located.dataDirectory)
    : null;

  const coverage = scanCoverage(mapFacts.events);
  if ((coverage.decodeErrors?.length ?? 0) > 0) {
    completenessIssues.push(`${coverage.decodeErrors.length} command/page decode errors`);
  }
  const completenessStatus = completenessIssues.length > 0 ? COMPLETENESS.INCOMPLETE : COMPLETENESS.COMPLETE;
  const confirmed = candidates.filter((item) => item.status === "confirmed-bridge-script");
  const opaqueCalls = candidates.some((item) => item.reasons.includes("page-common-event-call-not-statically-resolvable"));
  const provenNegative = completenessStatus === COMPLETENESS.COMPLETE
    && bridgeCells.scanStatus === COMPLETENESS.COMPLETE
    && bridgeCells.cellCount === 0
    && confirmed.length === 0
    && mapReachableBridge === false
    && coverage.scripts.every((item) => item.matchesBridgePattern === false)
    && coverage.unverified.length === 0
    && (coverage.decodeErrors?.length ?? 0) === 0
    && opaqueCalls === false;

  let triggerMatrix = Object.freeze([]);
  let passabilityContext = null;
  if (terrain?.terrain_tags && mapFacts.data?.kind === "Table") {
    passabilityContext = buildPassabilityContext(mapFacts, terrain, mapFacts.events);
    const matrixIds = mapId === 21 ? [4, 7, 10, 20, 22, 23, 25, 28] : undefined;
    triggerMatrix = buildEventTriggerMatrix(passabilityContext, mapFacts.events, { eventIds: matrixIds });
  }

  const { data: _omitData, ...mapWithoutTiles } = mapFacts;
  return Object.freeze({
    extractor: Object.freeze({
      id: "map-event-evidence",
      defaultMapId: DEFAULT_MAP_ID,
      allowedMapIds: ALLOWED_EVIDENCE_MAP_IDS,
      mapId,
      doesNotExecuteRuby: true,
      doesNotModifySource: true,
      corpusScan: options.corpusScan === true,
      vanillaSource: VANILLA_SOURCE,
    }),
    source: Object.freeze({
      kind: located.kind,
      mapFile: forensicRelPath(located.mapRxdata, located.dataDirectory),
      dataDirectoryName: basename(located.dataDirectory),
      files: Object.freeze(files),
    }),
    completeness: Object.freeze({
      status: completenessStatus,
      issues: Object.freeze(completenessIssues),
      provenNegativeBridge: provenNegative,
      mapLocalNegativeDoesNotProveGameWideAbsence: reachability.autorunOrParallel.length > 0,
      unscannedEntrances: Object.freeze([
        ...reachability.autorunOrParallel.map((item) => `common-event-${item.id}-${item.triggerSemantics}`),
        "scripted-pbCommonEvent-or-eval-from-unscanned-maps",
      ]),
    }),
    map: Object.freeze({
      ...mapWithoutTiles,
      name: mapName,
      tileset: tilesetMeta,
    }),
    coverage,
    bridgeTerrain: Object.freeze({
      ...bridgeCells,
      provenNegative: provenNegative && bridgeCells.cellCount === 0,
    }),
    ledgeTerrain: Object.freeze({
      ...ledgeCells,
      tagId: LEDGE_TERRAIN_TAG,
    }),
    commonEvents: Object.freeze({
      count: commonEvents.length,
      withBridgeScript: Object.freeze(commonEvents.filter((event) => event.hasBridgeScript)),
      graph: commonGraph,
      reachability: Object.freeze({
        idsThatCanReachBridge: reachability.idsThatCanReachBridge,
        mapCallsReachBridge: mapReachableBridge,
        autorunOrParallel: reachability.autorunOrParallel,
        note: reachability.note,
      }),
    }),
    commonEventsWithBridgeScript: Object.freeze(commonEvents.filter((event) => event.hasBridgeScript)),
    candidates,
    triggerMatrix,
    importer,
    transferAudit: Object.freeze({ ...transferAudit, connectionAudit }),
    corpusScan,
  });
}

export async function collectMap7Evidence(sourceInput, options = {}) {
  return collectMapEvidence(sourceInput, { ...options, mapId: options.mapId ?? DEFAULT_MAP_ID });
}

export function parseEvidenceArguments(argv) {
  const result = { source: undefined, output: undefined, mapId: DEFAULT_MAP_ID, corpusScan: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!["--source", "--output", "--map", "--corpus-scan"].includes(name)) evidenceFail(`Unknown argument: ${name}`);
    if (seen.has(name)) evidenceFail(`Duplicate argument: ${name}`);
    seen.add(name);
    if (name === "--corpus-scan") {
      result.corpusScan = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) evidenceFail(`Missing value for ${name}`);
    if (name === "--source") result.source = value;
    else if (name === "--output") result.output = value;
    else result.mapId = Number(value);
    index += 1;
  }
  assertAllowedMapId(result.mapId, "--map");
  return result;
}

export function defaultLocalFsdb(repoRoot) {
  return join(repoRoot, "examples", "essentials-v21.1-local", "[FSDB]Essentials v21.1");
}
