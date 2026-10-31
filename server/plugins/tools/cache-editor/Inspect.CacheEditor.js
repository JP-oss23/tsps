"use strict";

// Reads the loaded cache into the shapes an agent or an editor needs: one definition with its values
// and outbound links, a name search, and the reverse question ("what references this id?").
//
// Everything here is read-only. Nothing resolves a link by guessing: a target is `known`, `missing`
// or `unverified` (no decoder for that kind yet), and a multi-def says so instead of pretending the
// id it was asked about is the thing a player sees.

const { KINDS, kindOf, fieldsOf, referenceFields, referencedKinds, readField } = require("./Fields.CacheEditor");

/** Name maps the cache exposes, by kind. Missing entries mean "this server has no reverse map yet". */
function namesOf(core, kind) {
  const cache = core.CacheDefinitions;
  switch (kind) {
    case "loc": return cache.getLocNames();
    case "npc": return cache.getNpcNames();
    case "item": return cache.getObjNames();
    case "seq": return cache.getSeqNames();
    case "spotanim": return cache.getSpotanimNames?.();
    case "varp": return cache.getVarpNames?.();
    default: return undefined;
  }
}

function customItems(core) {
  try {
    return core.CacheDefinitions.getCustomItems() ?? [];
  } catch {
    return [];
  }
}

/** The definition object for a kind, or null when this server has no decoder for it. */
function definitionOf(core, kind, id) {
  const cache = core.CacheDefinitions;
  switch (kind) {
    case "loc": return cache.getObject(id);
    case "npc": return cache.getNpc(id);
    case "item": return cache.getItem(id);
    case "varbit": return cache.getVarbit(id);
    case "struct": return { params: cache.getStructParams(id) };
    case "enum": return { values: cache.getEnumValues(id) };
    case "dbro": return cache.getDbRow(id);
    case "dbtable": {
      const columns = cache.getDbColumns(id);
      const rows = cache.getDbTableRows(id);
      return { columns, rowCount: rows.length, rows };
    }
    default: return null;
  }
}

/** A display name: the definition's own name, the cache's gameval name, or null. */
function nameOf(core, kind, id) {
  const definition = definitionOf(core, kind, id);
  if (definition?.name) return definition.name;
  const names = namesOf(core, kind);
  const named = names?.get?.(id);
  if (named) return named;
  if (kind === "item") {
    const custom = customItems(core).find((row) => row.id === id);
    if (custom?.objType?.name) return custom.objType.name;
  }
  return null;
}

/** `known` / `missing` / `unverified` for one id in one kind. */
function resolveId(core, kind, id) {
  if (!Number.isInteger(id) || id < 0) return "missing";
  const entry = KINDS[kind] ?? {};
  const names = namesOf(core, kind);
  if (names) return names.has(id) ? "known" : "unverified";
  if (entry.decoded) {
    const definition = definitionOf(core, kind, id);
    if (definition === undefined || definition === null) return "missing";
    return "known";
  }
  return "unverified";
}

const values = (value) => (Array.isArray(value) ? value : [value]).filter((entry) => Number.isInteger(entry) && entry >= 0);

/**
 * One cache entry: its values, every link it holds, and its multi-def, if any.
 * `player` adds the resolved child for a logged-in player, which is what a tile actually shows.
 */
function describe(core, { kind, id, player = null, skipUnset = true }) {
  const entry = kindOf(kind);
  if (!Number.isInteger(id) || id < 0) throw new Error(`A ${kind} id must be a non-negative integer`);
  const definition = definitionOf(core, kind, id);
  const fields = fieldsOf(kind);
  const out = {
    kind,
    id,
    name: nameOf(core, kind, id),
    label: entry.label,
    custom: kind === "item" && id >= 50000 ? customItems(core).some((row) => row.id === id) : false,
  };
  if (!definition) {
    out.note = `No ${kind} decoder on this server yet; the id and its name resolve, its fields do not.`;
    out.exists = resolveId(core, kind, id) !== "missing";
    return out;
  }
  const list = Array.isArray(definition) ? definition : null;
  if (list) out.rows = list.length;
  out.values = {};
  out.links = [];
  for (const field of fields ?? []) {
    const value = readField(kind, definition, field.name);
    if (value === undefined || value === null) continue;
    if (skipUnset && !field.ref && (value === -1 || value === "" || (Array.isArray(value) && value.length === 0))) continue;
    out.values[field.name] = Array.isArray(value) ? value : value instanceof Map ? Object.fromEntries(value) : value;
    if (!field.ref) continue;
    for (const target of values(value)) {
      if (target === -1) continue;
      out.links.push({
        field: field.name,
        kind: field.ref,
        id: target,
        name: nameOf(core, field.ref, target),
        exists: resolveId(core, field.ref, target),
        ...(field.note ? { note: field.note } : {}),
      });
    }
  }
  const transforms = definition.transforms;
  if (Array.isArray(transforms) && transforms.length) {
    const gatedBy = definition.transformVarbit >= 0
      ? { kind: "varbit", id: definition.transformVarbit, name: nameOf(core, "varbit", definition.transformVarbit) }
      : definition.transformVarp >= 0
        ? { kind: "varp", id: definition.transformVarp, name: nameOf(core, "varp", definition.transformVarp) }
        : null;
    out.transforms = {
      gatedBy,
      children: transforms.filter((child) => Number.isInteger(child) && child >= 0)
        .map((child) => ({ id: child, name: nameOf(core, kind, child), exists: resolveId(core, kind, child) })),
      note: "This id is a placeholder: a player sees the child its gating variable selects.",
    };
    if (player && kind === "loc") {
      try {
        const resolved = core.ObjectDefinition.forPlayer(id, player);
        out.transforms.resolvedForPlayer = resolved?.id ?? null;
      } catch {
        out.transforms.resolvedForPlayer = null;
      }
    }
  }
  if (kind === "dbro" && definition.columns) {
    const tableId = Number(out.values.tableId);
    const columns = Number.isInteger(tableId) ? core.CacheDefinitions.getDbColumns(tableId) : [];
    out.values.columns = Object.fromEntries([...definition.columns].map(([column, values]) => [
      `${column}${columns[column] ? ` (${columns[column]})` : ""}`, values,
    ]));
  }
  return out;
}

/** Name or id search within one kind, or across every named kind when `kind` is omitted. */
function search(core, { kind = null, text = "", limit = 20 }) {
  const needle = String(text ?? "").trim();
  if (!needle) throw new Error("Give some text to search for, or an id");
  const numeric = /^\d+$/.test(needle) ? Number(needle) : null;
  const lower = needle.toLowerCase();
  const kinds = kind ? [kindOf(kind) && kind] : Object.keys(KINDS).filter((entry) => KINDS[entry].gameval);
  const hits = [];
  for (const entry of kinds) {
    const names = namesOf(core, entry) ?? new Map();
    for (const [id, name] of names) {
      if (hits.length >= limit) break;
      if (numeric !== null ? id === numeric : String(name).toLowerCase().includes(lower)) {
        hits.push({ kind: entry, id, name });
      }
    }
    if (entry === "item" && hits.length < limit) {
      for (const row of customItems(core)) {
        const name = row.objType?.name ?? "";
        if (numeric !== null ? row.id === numeric : name.toLowerCase().includes(lower)) {
          hits.push({ kind: "item", id: row.id, name, custom: true });
        }
      }
    }
  }
  return hits.slice(0, limit);
}

// Reverse index, built once per loaded cache: target kind -> id -> who points at it.
let index;

function buildIndex(core, sourceKinds) {
  const cache = core.CacheDefinitions;
  if (index?.cache === cache && sourceKinds.every((kind) => index.done.has(kind))) return index;
  if (index?.cache !== cache) index = { cache, done: new Set(), map: new Map() };
  for (const source of sourceKinds) {
    if (index.done.has(source)) continue;
    const refs = referenceFields(source);
    const count = { loc: "objects", npc: "npcs", item: "items" }[source];
    const total = count ? cache.getCounts()[count] : 0;
    for (let id = 0; id < total; id++) {
      const definition = definitionOf(core, source, id);
      if (!definition) continue;
      for (const field of refs) {
        for (const target of values(readField(source, definition, field.name))) {
          if (target === -1) continue;
          const key = `${field.ref}:${target}`;
          const list = index.map.get(key) ?? [];
          list.push({ kind: source, id, name: nameOf(core, source, id), field: field.name });
          index.map.set(key, list);
        }
      }
    }
    index.done.add(source);
  }
  return index;
}

/** Which locs, npcs and items point at this id. Scans the definitions, so it is memoised. */
function usedBy(core, { kind, id, limit = 50 }) {
  kindOf(kind);
  const sources = ["loc", "npc", "item"].filter((source) => referencedKinds(source).includes(kind));
  if (!sources.length) return { kind, id, sources: [], note: `Nothing in loc/npc/item points at a ${kind}.` };
  const found = buildIndex(core, sources).map.get(`${kind}:${id}`) ?? [];
  return { kind, id, count: found.length, sources: found.slice(0, limit), scanned: sources };
}

/** Every kind the editor knows, with counts where the cache reports them. */
function kinds(core) {
  const counts = core.CacheDefinitions.getCounts();
  return Object.entries(KINDS).map(([kind, entry]) => ({
    kind,
    label: entry.label,
    archive: entry.archive,
    decoded: entry.decoded !== false,
    ...(entry.count ? { count: counts[entry.count] } : {}),
    ...(namesOf(core, kind) ? { named: namesOf(core, kind).size } : {}),
  }));
}

module.exports = { describe, search, usedBy, kinds, nameOf, resolveId, definitionOf };
