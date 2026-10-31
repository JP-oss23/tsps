# Cache editor

Two halves, and only the first exists today:

1. **Inspect** — read any cache definition, its values, its links, and what points back at it.
   Done, and verified below.
2. **Author** — the browser page (`?cache=1`), the ref pickers, the overlay writer and the
   per-kind forms. Designed, not built.

Read this before adding a kind: the metadata table, not the UI, is what decides whether the tool
tells the truth.

## The problem this solves

A loc's animation is a **sequence** id. An item's noted form is another **item**. A varbit names its
**varp** and bit range. A multi-loc is a placeholder whose child depends on a live varbit. The cache
stores none of that: a config file is a flat list of opcodes and ids, and only knowledge turns
`seqId: 3206` into "the crate shakes via `quest_mcannon_crate_shake`".

So the editor keeps that knowledge in one place — `server/plugins/tools/cache-editor/Fields.CacheEditor.js`
— and both the inspector and (later) every form read it. Fields are listed by **name**, never by
opcode number, because names survive cache revisions and opcodes do not.

## Inspecting

Agent MCP tools, all read-only:

| Tool | Answers |
| --- | --- |
| `cache_kinds` | every kind, its definition count, how many are named, whether a decoder exists |
| `cache_inspect { kind, id, player? }` | the values, every link with the target's name and whether it resolves, and the multi-def block |
| `cache_search { text, kind?, limit? }` | ids by gameval name (`ent_totems_site_1_base`) or by id, custom items included |
| `cache_used_by { kind, id }` | which locs, npcs and items point at this id |

`cache_inspect` link states are deliberately three-valued:

- `known` — the id resolves (a named gameval entry, or a decoded definition).
- `missing` — a decoded kind has no such definition.
- `unverified` — this server has no decoder for that kind yet (models, sprites, sounds, and the
  not-yet-decoded sequences, spotanims, varps). The id and name are still reported; fields are not
  invented.

Real output for loc 1, which is the whole point of the tool:

```
loc 1  "Crate"
  seqId  3206  → seq quest_mcannon_crate_shake   known       (the loc's animation)
  objIds 15402 → model                          unverified  (a model file, not a definition)

cache_used_by seq 3206 → 3 locs: 1 (Crate), 15599 (Crate), 15600 (Crates)

cache_inspect dbro 14 → table 0, columns 2 (displayname) ["Clock Tower"], 19 (endstate) [8]
```

That last line is the same completion contract the quest work uses: a DB row's column names come
from gamevals, so `endstate` is read by name and survives a cache revision that renumbers columns.

## What is decoded today

`loc`, `npc`, `item`, `varbit`, `struct`, `enum`, `dbro`, `dbtable`, `idk`. Missing: `seq`,
`spotanim`, `varp`, `inv`, `bas` — the four that matter for the link graph are the first three, and
each is a small opcode switch. Until they land, a loc's animation shows as a name and an id, not as
frames.

## The authoring half (next)

Order, because each step is what the next one reads:

1. `seq`, `spotanim`, `varp` decoders — the link targets you actually want to look at.
2. The page at `?cache=1`, lazy-loaded like `?items=1`: browser, inspector tabs, generated form,
   changes tray. Read from the client's loaded cache, write through a loopback authoring endpoint
   with the item editor's guards (revision check, atomic write, origin + loopback check, restart to
   apply).
3. Overlay documents per kind, `{ id, baseId, fields }`, applied over the cache definition at load —
   the item overlay's model, generalised. Note `plugins/world/DefinitionArchives.plugin.js` already
   installs loc/npc/obj definition overlays from bundles at runtime and pushes them to clients;
   the authoring format should emit those rather than invent a second path.
4. Placement, which a loc definition does not give you on its own: reuse the map editor's
   `EditorWorldMap` and loc spawn/change rows, and link the two workbenches by tile.

## What not to do

- Do not resolve a link by guessing. `unverified` is a useful answer; a fabricated kind is not.
- Do not show a multi-def as if it were one definition. The id in hand is a placeholder, and the
  child a player sees depends on a varbit — the same trap quest code kept hitting.
- Do not key metadata by opcode. `Columns can move between revisions` is already a comment in this
  codebase for exactly this reason.
- Do not hand-edit generated cache data. Content authored here is tsps data and belongs in
  `data/definitions/`; anything dumped from the cache goes through
  [RSPSApp/osrsreboxed-db](https://github.com/RSPSApp/osrsreboxed-db) (see `server/AGENTS.md`).

## Verification

`server/tests/cache-editor.test.cjs` runs against the real cache (needs `yarn build`): the field
table's internal consistency, a loc's links and names, a multi-loc's gated children, an item's noted
form, a varbit's varp and width, a DB row's named columns, name and id search, a kind without a
decoder, the reverse index, and that every loc and npc definition describes without throwing.
