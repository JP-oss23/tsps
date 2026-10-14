// node --test tests/hueycoatl.test.cjs
const assert = require("node:assert/strict");
const { test } = require("node:test");

const Shared = require("../plugins/bosses/hueycoatl/Shared.Hueycoatl");
const Combat = require("../plugins/bosses/hueycoatl/Combat.Hueycoatl");
const Pillars = require("../plugins/bosses/hueycoatl/Pillars.Hueycoatl");
const TailPhase = require("../plugins/bosses/hueycoatl/TailPhase.Hueycoatl");
const Corpse = require("../plugins/bosses/hueycoatl/Corpse.Hueycoatl");
const BodyPhase = require("../plugins/bosses/hueycoatl/BodyPhase.Hueycoatl");

const fakePrayers = (active) => ({
  PROTECT_FROM_MELEE: 1, PROTECT_FROM_MISSILES: 2, PROTECT_FROM_MAGIC: 3,
  isActivated: (player, id) => (active[player?.name] ?? []).includes(id),
});
Pillars.attach({ getPrayerHandler: () => fakePrayers({}) });

function fakePlayer(name, store = new Map()) {
  return {
    name,
    getUsername: () => name,
    getAttribute: (k) => store.get(k),
    setAttribute: (k, v) => store.set(k, v),
    sendMessage: () => {},
    getAsPlayer: function () { return this; },
    isRegistered: () => true,
    messages: [],
  };
}

test("shared: tiles, durations, ids, thresholds", () => {
  assert.equal(Shared.tileKey(1528, 3284), "1528,3284");
  assert.equal(Shared.formatTicks(534), "5:20.40");
  assert.equal(Shared.formatTicks(90), "0:54.00");
  assert.equal(Shared.formatTicks(0), "0:00.00");
  assert.ok(Shared.isHead(14009) && Shared.isHead(14011) && !Shared.isHead(14014));
  assert.ok(Shared.isFighter(14017) && !Shared.isFighter(14008));
  assert.equal(Shared.SHIELD_THRESHOLD, 1250);
  assert.equal(Shared.TAIL_CAP, 4);
  assert.equal(Shared.TAIL_CAP_CRUSH, 9);
  assert.deepEqual(Shared.HEAD_SPAWN, [1509, 3290, 0]);
  assert.equal(Shared.BODY_SPAWNS.length, 5);
});

test("shared: pillar prayer table matches the wiki", () => {
  assert.equal(Shared.prayersPerPillar(1), 1);
  assert.equal(Shared.prayersPerPillar(5), 1);
  assert.equal(Shared.prayersPerPillar(6), 2);
  assert.equal(Shared.prayersPerPillar(11), 3);
  assert.equal(Shared.prayersPerPillar(14), 4);
  assert.equal(Shared.prayersPerPillar(17), 5);
  assert.equal(Shared.prayersPerPillar(20), 6);
});

test("combat: crush-highest rule for the tail cap", () => {
  assert.equal(Combat.crushHighest({ stab: 60, slash: 70, crush: 90 }), true);
  assert.equal(Combat.crushHighest({ stab: 90, slash: 70, crush: 60 }), false);
  assert.equal(Combat.crushHighest({ stab: 80, slash: 80, crush: 80 }), true);
  assert.equal(Combat.crushHighest(null), false);
});

test("combat: style mix covers all three", () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(Combat.pickStyle());
  assert.ok(seen.has("melee") && seen.has("magic") && seen.has("ranged"));
});

test("pillars: stage follows its own prayer (captured 0,0,1 -> ranged s5)", () => {
  Pillars.attach({
    getPrayerHandler: () => fakePrayers({ solo: [2] }),
  });
  const players = [{ name: "solo" }];
  assert.equal(Pillars.pillarStage(players, "missiles"), 5);
  assert.equal(Pillars.pillarStage(players, "melee"), 0);
  assert.equal(Pillars.pillarStage(players, "magic"), 0);
  assert.equal(Pillars.braziersLit(players), false);
  assert.equal(Pillars.damageMultiplier({ braziersLit: true }), 1.3);
  assert.equal(Pillars.damageMultiplier({}), 1);
});

test("pillars: trio with one prayer each lights the braziers", () => {
  Pillars.attach({
    getPrayerHandler: () => fakePrayers({ a: [1], b: [2], c: [3] }),
  });
  const players = [{ name: "a" }, { name: "b" }, { name: "c" }];
  assert.equal(Pillars.braziersLit(players), true);
});

test("tail: shockwave tiles ring the slam", () => {
  const tiles = TailPhase.shockwaveTiles(1518, 3281);
  assert.equal(tiles.length, 24);
  assert.ok(tiles.some(([x, y]) => x === 1519 && y === 3281));
  assert.ok(tiles.some(([x, y]) => x === 1518 && y === 3284));
  assert.equal(TailPhase.dodgedShockwave(1), true);
  assert.equal(TailPhase.dodgedShockwave(0), false);
});

test("corpse: kill count, best and MVP bones", () => {
  const store = new Map();
  const sent = [];
  const player = { ...fakePlayer("Zed", store), getPacketSender: () => ({ sendVarp: () => {} }), sendMessage: (m) => sent.push(m) };
  Corpse.recordKill(player, { players: [] }, 534);
  assert.equal(store.get(Shared.ATTR_KILLS), 1);
  assert.equal(store.get(Shared.ATTR_BEST), 534);
  assert.ok(sent.some((m) => m.includes("kill count is: <col=ff0000>1</col>")));
  assert.ok(sent.some((m) => m.includes("5:20.40") && m.includes("new personal best")));
  Corpse.recordKill(player, { players: [] }, 600);
  assert.equal(store.get(Shared.ATTR_BEST), 534);
  const session = { damage: { zed: 4000, amy: 9000 } };
  assert.equal(Corpse.mvpOf(session), "amy");
  const event = { npcId: 14009, player: fakePlayer("zed"), npc: { getAttribute: () => session }, drops: [{ itemId: 532, amount: 1 }, { itemId: 557, amount: 100 }] };
  Corpse.gateMvpBones(event);
  assert.deepEqual(event.drops.map((d) => d.itemId), [557]);
  const mvpEvent = { npcId: 14009, player: fakePlayer("amy"), npc: { getAttribute: () => session }, drops: [{ itemId: 532, amount: 1 }] };
  Corpse.gateMvpBones(mvpEvent);
  assert.equal(mvpEvent.drops.length, 1);
  const mixed = { players: [], damage: { zed: { amount: 5, player: "ZED" } } };
  assert.deepEqual(Corpse.killPlayers(mixed), ["ZED"]);
  assert.deepEqual(Corpse.killPlayers({ players: ["A"], damage: {} }), ["A"]);
});

test("combat: tail damage cap (4, floor 1)", () => {
  const part = (dmg) => {
    let damage = dmg;
    return { getDamage: () => damage, setDamage: (v) => { damage = v; } };
  };
  const parts = [part(50), part(0), part(3)];
  const hit = { getHits: () => parts, updateTotalDamage: () => {} };
  const npc = { getId: () => 14014, isVenomed: () => false, isPoisoned: () => false, getAttribute: () => null };
  Combat.modifyHit({ npc, hit, attacker: null });
  assert.deepEqual(parts.map((p) => p.getDamage()), [4, 1, 3]);
});

test("ca: speed, pillar lover, son, wizard, bird, perfect", () => {
  const CA = require("../plugins/bosses/hueycoatl/CombatAchievements.Hueycoatl");
  const done = [];
  CA.attach({ onCombatHitResolved() {}, emitCustomEvent: (n, p) => { if (n === "combat-achievements:complete") done.push(p.task); } });
  const player = { getEquipment: () => ({ get: () => null, getItem: () => null }) };
  CA.fightStarted(player, { players: [player], braziersLit: true });
  CA.noteDamage(player, "magic", 10, false);
  CA.fightKilled(player, { players: [player], braziersLit: true }, 200);
  assert.ok(done.includes("Hueycoatl Speed-Trialist"));
  assert.ok(done.includes("Hueycoatl Speed-Chaser"));
  assert.ok(done.includes("Hueycoatl Speed-Runner"));
  assert.ok(done.includes("Pillar Lover"));
  assert.ok(done.includes("You're a wizard"));
  assert.ok(!done.includes("I'm your son"));
  assert.ok(!done.includes("Is it a bird?"));
  const geared = { getEquipment: () => ({ get: (s) => (s === 4 || s === 6 ? { getId: () => 30076 } : null), getItem: () => null }) };
  CA.fightStarted(geared, { players: [geared], braziersLit: false });
  CA.noteDamage(geared, "melee", 10, false);
  CA.fightKilled(geared, { players: [geared], braziersLit: false }, 900);
  assert.ok(done.includes("I'm your son"));
  assert.ok(!done.includes("Perfect Hueycoatl"));
  for (let i = 0; i < 5; i++) {
    CA.fightStarted(player, { players: [player], braziersLit: false });
    CA.fightKilled(player, { players: [player], braziersLit: false }, 900);
  }
  assert.ok(done.includes("Perfect Hueycoatl"));
});

test("combat: live encounter suppresses engine regen", () => {
  let reset = 0;
  const fighter = { isNpc: () => true, getId: () => 14009, getAttribute: () => null, getCombat: () => ({ getLastAttack: () => ({ reset: () => { reset += 1; } }) }) };
  const Combat2 = require("../plugins/bosses/hueycoatl/Combat.Hueycoatl");
  const api = { core: { NpcIdentifiers: { THE_HUEYCOATL: 14009, HUEYCOATL_TAIL: 14014, HUEYCOATL_BODY: 14017 }, CombatMethod: class {}, CombatType: { MELEE: 0 } }, onNpcHitModify() {}, onCombatHitRoll(h) { api.roll = h; }, getPrayerHandler: () => ({}), registerNpcCombatMethodProvider() {} };
  Combat2.attach(api);
  api.roll({ attacker: fighter, target: {} });
  assert.equal(reset, 1);
});

test("body: summit opens when all five segments are down", () => {
  const down = (hp) => ({ isRegistered: () => true, getHitpoints: () => hp });
  assert.equal(BodyPhase.allSegmentsDown({ segments: [down(0), down(0), down(0), down(0), down(0)] }), true);
  assert.equal(BodyPhase.allSegmentsDown({ segments: [down(0), down(10), down(0), down(0), down(0)] }), false);
  assert.equal(BodyPhase.allSegmentsDown({ segments: [] }), false);
  const session = { players: [{ sendMessage: () => {} }], summitOpen: false };
  BodyPhase.openSummit(session);
  assert.equal(session.summitOpen, true);
});
