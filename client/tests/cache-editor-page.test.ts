// The cache editor page's pure half: paths, the authoring port, and draft validation.
import assert from "node:assert/strict";
import {
    authoringBase, draftProblems, draftRow, inspectPath, kindsPath, linksByField, searchPath, usedByPath, withField,
} from "../custom/cache-editor/CacheEditorModel";

assert.equal(kindsPath(), "/api/cache-kinds");
assert.equal(inspectPath("loc", 1), "/api/cache-inspect?kind=loc&id=1");
assert.equal(searchPath("crate", "loc", 5), "/api/cache-search?text=crate&kind=loc&limit=5");
assert.equal(searchPath("crate"), "/api/cache-search?text=crate&limit=20", "kind is optional");
assert.equal(usedByPath("seq", 3206), "/api/cache-used-by?kind=seq&id=3206&limit=50");

// The authoring service is one above the game's websocket port, the same offset the server applies.
assert.equal(authoringBase("http://127.0.0.1:43594"), "http://127.0.0.1:44695");
assert.equal(authoringBase("https://worlds.example.com"), undefined, "a remote world has no local authoring service");
assert.equal(authoringBase(undefined), undefined);
assert.equal(authoringBase("nonsense"), undefined);

const base = { kind: "loc", id: 1, exists: true, name: "Crate", label: "Loc (object)" };
const row = draftRow(base, 1, 63307);
assert.deepEqual(row, { kind: "loc", id: 63307, baseId: 1, fields: {} });
assert.deepEqual(draftProblems(row, base, 63307), ["nothing is overridden yet"], "an empty overlay is not a save");
assert.deepEqual(draftProblems({ ...row, id: 12 }, base, 63307), ["id must be 63307 or above (above the cache's own count)", "nothing is overridden yet"]);
assert.deepEqual(draftProblems({ ...row, fields: { seqId: 1 } }, { ...base, exists: false }, 63307), ["base must be a definition that exists in the cache"]);

let edited = withField(row, "seqId", 3206);
assert.deepEqual(edited.fields, { seqId: 3206 });
edited = withField(edited, "models", [1, 2]);
edited = withField(edited, "models", []);
assert.deepEqual(edited.fields, { seqId: 3206 }, "clearing a list removes the override");
edited = withField(edited, "seqId", undefined);
assert.deepEqual(edited.fields, {}, "clearing a value removes the override");

const grouped = linksByField([
    { field: "models", kind: "model", id: 1, name: null, exists: "unverified" },
    { field: "models", kind: "model", id: 2, name: null, exists: "unverified" },
    { field: "seqId", kind: "seq", id: 3206, name: "quest_mcannon_crate_shake", exists: "known" },
]);
assert.deepEqual(grouped.map((group) => group.field), ["models", "seqId"]);
assert.equal(grouped[0].entries.length, 2, "a list field groups its targets");
assert.deepEqual(linksByField(undefined), []);

console.log("cache-editor page model ok");
