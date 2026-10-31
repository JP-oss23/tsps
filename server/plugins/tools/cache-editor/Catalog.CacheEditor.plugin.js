// Read-only cache resources for the editor page, on the same origin the client already connects to.
// `api.registerContentEndpoint` is public and read-only by design, and everything served here is
// cache-derived data the browser could read out of its own cache — so nothing player-specific and
// nothing writable belongs in this file.
const path = require("node:path");
const inspect = require("./Inspect.CacheEditor");
const Document = require("./Document.CacheEditor.cjs");

function need(query, name) {
  const value = query.get(name);
  if (value === null || value === "") throw new Error(`Missing ?${name}`);
  return value;
}

function number(query, name) {
  const value = Number(need(query, name));
  if (!Number.isInteger(value) || value < 0) throw new Error(`?${name} must be a non-negative integer`);
  return value;
}

function limitOf(query) {
  const limit = Number(query.get("limit") ?? 20);
  return Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : 20;
}

function register(api) {
  const { core } = api;
  // Apply the overlay document once at startup, so an authored row is live on the next boot without
  // an encoder or a cache repack. Load failures are reported, never silently ignored.
  api.onServerStartup(() => {
    try {
      const document = Document.read(path.resolve(__dirname, "../../../.."));
      const applied = core.CacheDefinitions.registerCustomDefinitions(document.rows);
      if (applied) console.log(`[cache-editor] applied ${applied} overlay definition(s)`);
    } catch (error) {
      console.error("[cache-editor] overlay document not applied:", error.message);
    }
  });
  api.registerContentEndpoint("cache-kinds", () => ({ kinds: inspect.kinds(core) }));
  api.registerContentEndpoint("cache-inspect", (query) => inspect.describe(core, {
    kind: need(query, "kind"),
    id: number(query, "id"),
    skipUnset: query.get("unset") !== "1",
  }));
  api.registerContentEndpoint("cache-search", (query) => ({
    hits: inspect.search(core, {
      kind: query.get("kind") || null,
      text: need(query, "text"),
      limit: limitOf(query),
    }),
  }));
  api.registerContentEndpoint("cache-used-by", (query) => inspect.usedBy(core, {
    kind: need(query, "kind"),
    id: number(query, "id"),
    limit: limitOf(query),
  }));
}

module.exports = { name: "CacheEditorCatalog", register };
