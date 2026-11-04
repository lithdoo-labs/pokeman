/**
 * Load official local FSDB maps for Terrain Behavior E2E. Read-only.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildPassabilityContext,
  collectMapEvidence,
  decodeRxdataBytes,
  extractMapFacts,
  extractTilesetTerrain,
} from "./map-event-evidence.mjs";

export function officialFsdbPresent(fsdb) {
  return existsSync(join(fsdb, "[resource]Data", "Map007.rxdata"))
    && existsSync(join(fsdb, "[resource]Data", "Map021.rxdata"));
}

export async function loadOfficialE2eInputs(fsdb) {
  const data = join(fsdb, "[resource]Data");
  const map7 = await collectMapEvidence(fsdb, { mapId: 7 });
  const map21 = await collectMapEvidence(fsdb, { mapId: 21 });
  const tilesets = decodeRxdataBytes(await readFile(join(data, "Tilesets.rxdata")), "Tilesets.rxdata").root;
  const facts7 = extractMapFacts(decodeRxdataBytes(await readFile(join(data, "Map007.rxdata")), "Map007.rxdata").root, 7, "Map007.rxdata");
  const facts21 = extractMapFacts(decodeRxdataBytes(await readFile(join(data, "Map021.rxdata")), "Map021.rxdata").root, 21, "Map021.rxdata");
  const terrain7 = extractTilesetTerrain(tilesets, facts7.tilesetId);
  const terrain21 = extractTilesetTerrain(tilesets, facts21.tilesetId);
  return Object.freeze({
    sampleKind: "official-fsdb",
    map7,
    map21,
    facts7,
    facts21,
    terrain7,
    terrain21,
    context7: buildPassabilityContext(facts7, terrain7, facts7.events),
    context21: buildPassabilityContext(facts21, terrain21, facts21.events),
  });
}

export async function loadOfficialMap47(fsdb) {
  const data = join(fsdb, "[resource]Data");
  const mapPath = join(data, "Map047.rxdata");
  if (!existsSync(mapPath)) return null;
  const map47 = await collectMapEvidence(fsdb, { mapId: 47 });
  const tilesets = decodeRxdataBytes(await readFile(join(data, "Tilesets.rxdata")), "Tilesets.rxdata").root;
  const facts47 = extractMapFacts(decodeRxdataBytes(await readFile(mapPath), "Map047.rxdata").root, 47, "Map047.rxdata");
  const terrain47 = extractTilesetTerrain(tilesets, facts47.tilesetId);
  return Object.freeze({
    sampleKind: "official-fsdb",
    map47,
    facts47,
    terrain47,
    context47: buildPassabilityContext(facts47, terrain47, facts47.events),
  });
}
