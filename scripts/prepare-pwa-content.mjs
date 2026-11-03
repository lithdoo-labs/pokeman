import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listFsdbEntries, openFsdb, openFsdbObject } from "@loomrealm/fsdb";
import { validateEventStateMutationContent } from "../subsystems/business-state.mjs";
import { qualifyStoryContent } from "../subsystems/story.mjs";
import { validateDialogueContent } from "../subsystems/dialogue.mjs";
import { MAP_ONLY_NPC_PLACEMENTS } from "../subsystems/map.mjs";

const exampleRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultFsdbRoot = join(exampleRoot, "[FSDB]PokeMan");

function codePointCompare(left, right) {
  const a = [...left]; const b = [...right];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function fsdbIdentityKey(identity) { return `${identity.kind}\0${identity.table}\0${identity.key}`; }
function pwaIdentityKey(entry) { return `${entry.kind}\0${entry.namespace}\0${entry.key}`; }

export function mapFsdbEntryToPwaIdentity(entry) {
  const { identity } = entry;
  const kind = identity.kind === "group" ? "group" : identity.kind === "resource" ? "resource" : "record";
  return Object.freeze({ kind, namespace: `${identity.kind}.${identity.table}`, key: identity.key, mime: entry.contentType });
}

export function indexFsdbEntries(entries) {
  const index = new Map();
  for (const entry of entries) {
    const key = fsdbIdentityKey(entry.identity);
    if (index.has(key)) throw new Error(`Duplicate FSDB identity: ${key.replaceAll("\0", "/")}`);
    index.set(key, entry);
  }
  return index;
}

export function requireFsdbEntry(index, kind, table, key) {
  const lookup = `${kind}\0${table}\0${key}`;
  const entry = index.get(lookup);
  if (entry === undefined) throw new Error(`Missing PokeMan dependency: ${lookup.replaceAll("\0", "/")}`);
  return entry;
}

export function assertUniquePwaContent(entries) {
  const seen = new Set();
  for (const entry of entries) {
    const identity = pwaIdentityKey(entry);
    if (seen.has(identity)) throw new Error(`Duplicate PWA Content identity: ${identity.replaceAll("\0", "/")}`);
    seen.add(identity);
  }
}

/** Build-time full-source validation; Runtime intentionally has no namespace enumeration authority. */
export async function validatePokeManContentGraph(entries) {
  if (!Array.isArray(entries)) throw new TypeError("Invalid PokeMan Content entries");
  assertUniquePwaContent(entries);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const records = new Map();
  for (const entry of entries) {
    if (entry.kind !== "record") continue;
    if (typeof entry.namespace !== "string" || typeof entry.key !== "string" || !(entry.bytes instanceof Uint8Array)) throw new TypeError("Invalid PokeMan record entry");
    let value;
    try { value = JSON.parse(decoder.decode(entry.bytes)); }
    catch (cause) { throw new TypeError(`Invalid JSON record ${entry.namespace}/${entry.key}`, { cause }); }
    records.set(`${entry.namespace}\0${entry.key}`, value);
  }
  const content = Object.freeze({
    async record(namespace, key) {
      const value = records.get(`${namespace}\0${key}`);
      return value === undefined ? null : Object.freeze({ value: structuredClone(value) });
    },
  });
  const sourceIds = Object.freeze({
    characters: Object.freeze(entries.filter((entry) => entry.kind === "record" && entry.namespace === "struct.Character").map((entry) => entry.key).sort(codePointCompare)),
    events: Object.freeze(entries.filter((entry) => entry.kind === "record" && entry.namespace === "struct.Event").map((entry) => entry.key).sort(codePointCompare)),
  });
  await qualifyStoryContent(content, { sourceIds });
  const mutations = entries.filter((entry) => entry.kind === "record" && entry.namespace === "struct.EventStateMutation").sort((left, right) => codePointCompare(left.key, right.key));
  for (const mutation of mutations) await validateEventStateMutationContent(content, records.get(`${mutation.namespace}\0${mutation.key}`));
  const dialogues = entries.filter((entry) => entry.kind === "record" && entry.namespace === "struct.Dialogue").sort((left, right) => codePointCompare(left.key, right.key));
  const dialogueIds = new Set(dialogues.map((entry) => entry.key));
  const characterIds = new Set(sourceIds.characters);
  const mutationIds = new Set(mutations.map((entry) => entry.key));
  for (const dialogue of dialogues) {
    const value = validateDialogueContent(records.get(`${dialogue.namespace}\0${dialogue.key}`));
    for (const line of value.lines) if (line.speaker !== undefined && !characterIds.has(line.speaker)) throw new TypeError(`Dialogue ${dialogue.key} references missing Character ${line.speaker}`);
    for (const choice of value.choices) if (!dialogueIds.has(choice.target)) throw new TypeError(`Dialogue ${dialogue.key} references missing target ${choice.target}`);
    if (value.mutation !== undefined && !mutationIds.has(value.mutation)) throw new TypeError(`Dialogue ${dialogue.key} references missing mutation ${value.mutation}`);
  }
  for (const placements of Object.values(MAP_ONLY_NPC_PLACEMENTS)) {
    for (const placement of placements) {
      if (!records.has(`struct.NPC\0${placement.npcId}`)) throw new TypeError(`Map placement references missing NPC ${placement.npcId}`);
    }
  }
}

async function readFsdbEntry(db, entry) {
  const lease = await openFsdbObject(db, entry.identity, new AbortController().signal);
  if (lease === null) throw new Error(`Indexed FSDB entry disappeared: ${fsdbIdentityKey(entry.identity).replaceAll("\0", "/")}`);
  try {
    const chunks = [];
    for await (const chunk of lease.stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    if (BigInt(bytes.byteLength) !== entry.length) throw new Error("FSDB entry length changed while preparing PWA Content");
    return bytes;
  } finally { await lease.close(); }
}

/** Packages every PokeMan FSDB entry. Full-content packaging is intentional for v1. */
export async function preparePokeManPwaContent(options = {}) {
  const fsdbRoot = options.fsdbRoot ?? defaultFsdbRoot;
  const db = await openFsdb({ root: fsdbRoot });
  try {
    const descriptors = listFsdbEntries(db);
    indexFsdbEntries(descriptors);
    const content = await Promise.all(descriptors.map(async (descriptor) => Object.freeze({
      ...mapFsdbEntryToPwaIdentity(descriptor),
      bytes: Uint8Array.from(await readFsdbEntry(db, descriptor)),
    })));
    content.sort((left, right) => codePointCompare(left.kind, right.kind)
      || codePointCompare(left.namespace, right.namespace) || codePointCompare(left.key, right.key));
    await validatePokeManContentGraph(content);
    return Object.freeze(content);
  } finally { await db.close(); }
}

export async function createPokeManPwaFixture(options = {}) {
  const root = options.exampleRoot ?? exampleRoot;
  const executablePaths = options.executablePaths ?? {};
  const specifications = Object.freeze(["base", "map", "dialogue", "battle", "message"].map((key) => Object.freeze({
    logicalModule: `subsystems/${key}.mjs`,
    path: executablePaths[key] ?? join(root, "subsystems", `${key}.mjs`),
  })));
  const [gameEntryText, launchManifestText, presentationText, executableSources, content] = await Promise.all([
    readFile(join(root, "game.json"), "utf8"),
    readFile(join(root, "launch.pwa.json"), "utf8"),
    readFile(join(root, "presentation.json"), "utf8"),
    Promise.all(specifications.map(async (specification) => Object.freeze({
      logicalModule: specification.logicalModule, mime: "text/javascript", source: await readFile(specification.path, "utf8"),
    }))),
    preparePokeManPwaContent(options),
  ]);
  const executables = Object.freeze(executableSources.map((executable) => Object.freeze({
    ...executable, contentVersion: `sha256:${createHash("sha256").update(executable.source).digest("hex")}`,
  })));
  return Object.freeze({
    gameEntryText, launchManifestText, presentation: JSON.parse(presentationText), executables,
    content: Object.freeze(content.map((entry) => Object.freeze({
      kind: entry.kind, namespace: entry.namespace, key: entry.key, mime: entry.mime,
      encoding: "base64", body: Buffer.from(entry.bytes).toString("base64"),
    }))),
  });
}
