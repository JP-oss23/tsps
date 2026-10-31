// Run after `yarn build`: node --test tests/cache-editor.test.cjs
//
// Every assertion here reads the real copied cache, so a wrong field name or a link that resolves in
// theory but not against this revision fails here rather than in the editor.
const assert = require("node:assert/strict");
const { test, before } = require("node:test");
const path = require("node:path");

const { Server } = require("../dist/Server");
Server.installProductionPathResolver();

const { CachePipeline } = require("../dist/game/cache/CachePipeline");
const { CacheDefinitions } = require("../dist/game/cache/CacheDefinitions");
const Fields = require("../plugins/tools/cache-editor/Fields.CacheEditor");
const Inspect = require("../plugins/tools/cache-editor/Inspect.CacheEditor");

const core = { CacheDefinitions, ObjectDefinition: require("../dist/game/definition/ObjectDefinition").ObjectDefinition };
const inspect = (request) => Inspect.describe(core, request);

before(async () => {
  await CachePipeline.initialize(path.resolve(__dirname, ".."));
});

test("the field table is internally consistent", () => {
  for (const kind of Object.keys(Fields.FIELDS)) {
    assert.ok(Fields.KINDS[kind], `${kind} has fields but no kind entry`);
    const seen = new Set();
    for (const field of Fields.FIELDS[kind]) {
      assert.ok(!seen.has(field.name), `${kind}.${field.name} is listed twice`);
      seen.add(field.name);
      if (field.ref) assert.ok(Fields.KINDS[field.ref], `${kind}.${field.name} points at unknown kind ${field.ref}`);
      if (field.multi) assert.ok(Fields.fieldOf(kind, field.multi), `${kind}.${field.name} is gated by ${field.multi}, which must be a field of the same kind`);
    }
  }
  assert.deepEqual(Fields.referencedKinds("loc").includes("seq"), true);
  assert.throws(() => Fields.kindOf("nonsense"), /Unknown cache kind/);
});

test("a loc reports its links with names, and a missing target resolves as unverified, not missing", () => {
  const { objects } = CacheDefinitions.getCounts();
  let sample = null;
  for (let id = 0; id < objects && !sample; id++) {
    const definition = CacheDefinitions.getObject(id);
    if (definition?.seqId >= 0 && definition.models?.length) sample = definition;
  }
  assert.ok(sample, "the cache has a loc with an animation");
  const described = inspect({ kind: "loc", id: sample.id, skipUnset: false });
  const animation = described.links.find((link) => link.field === "seqId");
  assert.ok(animation, "the loc's animation is a link");
  assert.equal(animation.kind, "seq");
  assert.equal(animation.id, sample.seqId);
  assert.equal(animation.exists, "known", "a named sequence resolves");
  assert.match(animation.name ?? "", /.+/);
  const models = described.links.filter((link) => link.field === "objIds");
  assert.ok(models.length > 0, "models are reported as model links");
  assert.equal(models[0].exists, "unverified", "models are archive assets, not resolved definitions");
});

test("a multi-loc is reported as a gated placeholder with its children", () => {
  const { objects } = CacheDefinitions.getCounts();
  let sample = null;
  for (let id = 0; id < objects && !sample; id++) {
    const definition = CacheDefinitions.getObject(id);
    if (definition?.transforms?.length > 1) sample = definition;
  }
  assert.ok(sample, "the cache has a multi-loc");
  const described = inspect({ kind: "loc", id: sample.id });
  assert.ok(described.transforms, "a multi-def exposes its transform block");
  assert.equal(described.transforms.children.length, sample.transforms.filter((child) => child >= 0).length,
    "unset children are padding, not transforms");
  assert.ok(described.transforms.gatedBy, "and the variable that selects between them");
  assert.match(described.transforms.note, /placeholder/);
  assert.equal(described.transforms.children[0].exists, "known");
});

test("an item links to its noted form and a varbit names its varp and width", () => {
  const noted = CacheDefinitions.getItem(4151);
  assert.ok(noted, "item 4151 loads");
  const described = inspect({ kind: "item", id: 4151 });
  assert.equal(described.name, noted.name);
  const link = described.links.find((entry) => entry.field === "notedId" && entry.id === noted.notedId);
  if (noted.notedId >= 0) assert.ok(link, "the noted form is a link when the cache sets one");

  const varbit = CacheDefinitions.getVarbit(1788);
  const describedBit = inspect({ kind: "varbit", id: 1788 });
  assert.equal(describedBit.values.baseVar, varbit.baseVar);
  assert.equal(describedBit.values.startBit, varbit.startBit);
  assert.equal(describedBit.values.endBit, varbit.endBit);
  assert.equal(describedBit.links.find((entry) => entry.field === "baseVar").kind, "varp");
});

test("a db row resolves its table and column names through gamevals", () => {
  const row = CacheDefinitions.getDbRow(14);
  const table = row.tableId;
  assert.equal(typeof table, "number");
  assert.ok(CacheDefinitions.getDbColumns(table).length > 10, "the table's columns are named");
  const described = inspect({ kind: "dbro", id: 14 });
  assert.equal(described.values.tableId, table);
  assert.equal(described.links.find((entry) => entry.field === "tableId").kind, "dbtable");
  const columns = Object.keys(described.values.columns ?? {});
  assert.ok(columns.some((column) => column.includes("endstate")), `endstate is named: ${columns.join(", ")}`);
  const tableDescription = inspect({ kind: "dbtable", id: table });
  assert.ok(tableDescription.values.columns.includes("endstate"));
});

test("search finds ids by developer name and reports unnamed kinds honestly", () => {
  const loc = CacheDefinitions.getLocId("ent_totems_site_1_base");
  assert.ok(loc !== null);
  const hits = Inspect.search(core, { kind: "loc", text: "ent_totems_site_1_base", limit: 5 });
  assert.equal(hits[0].kind, "loc");
  assert.equal(hits[0].id, loc);
  const byId = Inspect.search(core, { kind: "loc", text: String(loc), limit: 5 });
  assert.ok(byId.some((hit) => hit.id === loc), "a numeric search matches by id");
  assert.throws(() => Inspect.search(core, { text: "  " }), /Give some text/);
  const kinds = Inspect.kinds(core);
  assert.ok(kinds.find((entry) => entry.kind === "loc").named > 1000);
  assert.equal(kinds.find((entry) => entry.kind === "seq").decoded, true, "sequences have a decoder now");
  assert.equal(kinds.find((entry) => entry.kind === "varp").decoded, false, "and a kind without one says so");
});

test("a kind without a decoder still names the id instead of inventing fields", () => {
  const described = inspect({ kind: "varp", id: 29 });
  assert.equal(described.kind, "varp");
  assert.equal(described.exists, true);
  assert.equal(described.values, undefined);
  assert.match(described.note, /no varp decoder/i);
});

test("used_by answers the reverse question from real definitions", () => {
  const { objects } = CacheDefinitions.getCounts();
  let sample = null;
  for (let id = 0; id < objects && !sample; id++) {
    const definition = CacheDefinitions.getObject(id);
    if (definition?.seqId >= 0) sample = definition;
  }
  const reverse = Inspect.usedBy(core, { kind: "seq", id: sample.seqId, limit: 200 });
  assert.ok(reverse.count > 0, "the animation is referenced by at least the loc we found");
  assert.ok(reverse.sources.some((entry) => entry.kind === "loc" && entry.id === sample.id));
  assert.ok(reverse.sources.every((entry) => entry.name !== undefined));
  // Memoised: the second call must not rescan.
  const again = Inspect.usedBy(core, { kind: "seq", id: sample.seqId, limit: 200 });
  assert.equal(again.count, reverse.count);
});

test("browsing every loc and npc definition does not throw", () => {
  const { objects } = CacheDefinitions.getCounts();
  for (let id = 0; id < Math.min(objects, 400); id++) Inspect.describe(core, { kind: "loc", id });
  for (let id = 0; id < 200; id++) Inspect.describe(core, { kind: "npc", id });
  assert.throws(() => Inspect.describe(core, { kind: "loc", id: -1 }), /non-negative/);
});

test("a sequence reports its frames and its held items, and does not pretend frames are definitions", () => {
  const seq = CacheDefinitions.getSeq(3206);
  assert.ok(seq.frameIds.length > 0, "the cache's crate-shake sequence has frames");
  const described = inspect({ kind: "seq", id: 3206 });
  assert.equal(described.name, "quest_mcannon_crate_shake");
  assert.equal(described.values.maxLoops, seq.maxLoops);
  const frames = described.links.filter((entry) => entry.field === "frameIds");
  assert.ok(frames.length > 0, "frames are reported");
  assert.equal(frames[0].exists, "unverified", "a frame is an archive entry, not a definition");
  assert.match(frames[0].note, /frame archive/);
  for (const held of ["leftHandItem", "rightHandItem"]) {
    const link = described.links.find((entry) => entry.field === held);
    if (link) assert.equal(link.kind, "item");
  }
});

test("a graphic links to its model and its animation, which is the loc-to-animation hop", () => {
  const spot = CacheDefinitions.getSpotanim(1);
  assert.ok(spot.modelId > 0);
  const described = inspect({ kind: "spotanim", id: 1 });
  assert.equal(described.name, "firebreath_attack");
  const animation = described.links.find((entry) => entry.field === "animationId");
  assert.ok(animation, "a graphic names the sequence it plays");
  assert.equal(animation.kind, "seq");
  assert.equal(animation.id, spot.animationId);
  assert.equal(animation.exists, "known");
  assert.equal(described.links.find((entry) => entry.field === "modelId").exists, "unverified");
  // The two hops the user asked about: loc -> sequence, graphic -> sequence.
  const loc = inspect({ kind: "loc", id: 1 });
  assert.equal(loc.links.find((entry) => entry.field === "seqId").kind, "seq");
});
