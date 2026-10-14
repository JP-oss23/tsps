// node --test tests/royal-titans.test.cjs
const assert = require("node:assert/strict");
const { test } = require("node:test");

const Shared = require("../plugins/bosses/royal-titans/Shared.RoyalTitans");
const CombatAchievements = require("../plugins/bosses/royal-titans/CombatAchievements.RoyalTitans");
const Minions = require("../plugins/bosses/royal-titans/Minions.RoyalTitans");
const Specials = require("../plugins/bosses/royal-titans/Specials.RoyalTitans");
const Corpse = require("../plugins/bosses/royal-titans/Corpse.RoyalTitans");

let now = 1000;
const completed = [];
const kills = [];
const fakeApi = {
  core: {
    World: { getProcessCycle: () => now },
    Skill: { PRAYER: 5 },
  },
  getPrayerHandler: () => ({ PROTECT_FROM_MELEE: 1, PROTECT_FROM_MISSILES: 2, PROTECT_FROM_MAGIC: 3 }),
  persistAttribute() {},
  onCombatHitResolved(handler) { fakeApi.hitResolved = handler; },
  onNpcDeath() {},
  onNpcHitModify() {},
  onNpcInteraction() {},
  onNpcsInteraction() {},
  onObjectInteraction() {},
  onPlayerLogin() {},
  onPlayerDeath() {},
  onPlayerDeathItemDrop() {},
  onCustomEvent() {},
  emitCustomEvent(name, payload) {
    if (name === "combat-achievements:complete") completed.push(payload.task);
    if (name === "combat-achievements:kill") {
      kills.push(payload);
      payload.total = (payload.count ?? 0) + 100;
      payload.announce?.(payload.total);
    }
  },
  registerNpcCombatMethodProvider() {},
  sendMultiChatboxPrompt() {},
  getItemOnGroundManager: () => ({ registerLocation() {} }),
};
CombatAchievements.attach(fakeApi);

function fakePlayer(prayer = 10) {
  const store = new Map();
  return {
    getAttribute: (key) => store.get(key),
    setAttribute: (key, value) => store.set(key, value),
    getSkillManager: () => ({ getCurrentLevel: () => prayer }),
    sendMessage() {},
    isRegistered: () => true,
  };
}

function fakeTitan(id, hp = 600) {
  const store = new Map();
  return {
    getId: () => id,
    getHitpoints: () => hp,
    isRegistered: () => true,
    getAttribute: (key) => store.get(key),
    setAttribute: (key, value) => store.set(key, value),
  };
}

test("shared helpers: edges, tiles, durations, ids", () => {
  assert.equal(Shared.edgeDistance(3, 2910, 9571, 2915, 9576), 3);
  assert.equal(Shared.edgeDistance(3, 2910, 9571, 2911, 9573), 0);
  assert.equal(Shared.tileKey(2911, 9567), "2911,9567");
  assert.equal(Shared.formatTicks(534), "5:20.40");
  assert.equal(Shared.formatTicks(90), "0:54.00");
  assert.ok(Shared.isTitanNpc(12596) && Shared.isTitanNpc(14152) && !Shared.isTitanNpc(2085));
});

test("blast safe tile: convergence, or far from the survivor", () => {
  const both = { branda: fakeTitan(12596), eldric: fakeTitan(14147) };
  assert.deepEqual(Specials.blastSafeTile(both), { x: 2912, y: 9567 });
  const brandaDown = { branda: fakeTitan(12596, 0), eldric: fakeTitan(14147) };
  brandaDown.branda.isRegistered = () => false;
  assert.deepEqual(Specials.blastSafeTile(brandaDown), { x: 2911, y: 9563 });
});

test("minion spell helpers: tiers and elements", () => {
  assert.equal(Minions._test.spellTier("WATER_SURGE"), "surge");
  assert.equal(Minions._test.spellTier("FIRE_WAVE"), "wave");
  assert.equal(Minions._test.spellTier("FIRE_BLAST"), "blast");
  assert.equal(Minions._test.spellElement("WATER_WAVE"), "water");
  assert.equal(Minions._test.spellElement("ICE_BARRAGE"), "water");
  assert.equal(Minions._test.spellElement("FIRE_SURGE"), "fire");
});

function fakeRowNpc(id, x, y) {
  const store = new Map();
  return {
    getId: () => id,
    getLocation: () => ({ getX: () => x, getY: () => y }),
    getAttribute: (key) => store.get(key),
    setAttribute: (key, value) => store.set(key, value),
    isRegistered: () => true,
  };
}

function fakeCaster(spell, bonus = 70) {
  return {
    isPlayer: () => true,
    getAsPlayer: function () { return this; },
    getCombat: () => ({ getSelectedSpell: () => spell }),
    getBonusManager: () => ({ getAttackBonus: () => [0, 0, 0, bonus] }),
    getEquipment: () => ({ get: () => ({ getId: () => -1 }) }),
    sendMessage() {},
    messages: [],
  };
}

function fakeSpellHit(attacker, damage = 24) {
  const parts = [{ damage, setDamage(value) { this.damage = value; }, getDamage() { return this.damage; } }];
  return {
    __royalClear: false,
    __royalHint: false,
    getAttacker: () => attacker,
    getHits: () => parts,
    updateTotalDamage() {},
  };
}

test("row clearing: water surge clears a fire tile", () => {
  const npc = fakeRowNpc(14152, 2911, 9566);
  const attacker = fakeCaster("WATER_SURGE");
  attacker.sendMessage = function (text) { this.messages.push(text); };
  const hit = fakeSpellHit(attacker);
  Minions.rowClearingHit({ npc, hit });
  assert.equal(hit.__royalClear, true);
  assert.equal(hit.getHits()[0].getDamage(), 1);
  assert.deepEqual(attacker.messages, []);
});

test("row clearing: any opposite-element spell clears, wrong element hints", () => {
  for (const spell of ["WATER_SURGE", "WATER_STRIKE", "ICE_BARRAGE"]) {
    const npc = fakeRowNpc(14152, 2911, 9566);
    const attacker = fakeCaster(spell);
    attacker.sendMessage = function (text) { this.messages.push(text); };
    const hit = fakeSpellHit(attacker);
    Minions.rowClearingHit({ npc, hit });
    assert.equal(hit.__royalClear, true, spell);
    assert.equal(hit.getHits()[0].getDamage(), 1);
    assert.deepEqual(attacker.messages, []);
  }
  for (const spell of ["FIRE_SURGE", "WIND_STRIKE", null]) {
    const npc = fakeRowNpc(14152, 2911, 9566);
    const attacker = fakeCaster(spell);
    attacker.sendMessage = function (text) { this.messages.push(text); };
    const hit = fakeSpellHit(attacker);
    Minions.rowClearingHit({ npc, hit });
    assert.equal(hit.__royalClear !== true, true);
    assert.equal(hit.getHits()[0].getDamage(), 0);
    assert.ok(attacker.messages.some((text) => /strong enough/.test(text)));
  }
});

test("row clearing: fire surge clears an ice tile", () => {
  const npc = fakeRowNpc(14153, 2911, 9566);
  const attacker = fakeCaster("FIRE_SURGE");
  attacker.sendMessage = function (text) { this.messages.push(text); };
  const hit = fakeSpellHit(attacker);
  Minions.rowClearingHit({ npc, hit });
  assert.equal(hit.__royalClear, true);
});

function fakeDuelist(spell, targetId) {
  const target = { isNpc: () => true, getId: () => targetId };
  return {
    isPlayer: () => true,
    getCombat: () => ({ getSelectedSpell: () => spell, getTarget: () => target }),
  };
}

test("weakness damage: double on elementals, +50% on titans, else untouched", () => {
  assert.equal(Minions.weaknessDamage(fakeDuelist("WATER_WAVE", 14150), 20), 40);
  assert.equal(Minions.weaknessDamage(fakeDuelist("FIRE_WAVE", 14151), 20), 40);
  assert.equal(Minions.weaknessDamage(fakeDuelist("WATER_WAVE", 12596), 20), 30);
  assert.equal(Minions.weaknessDamage(fakeDuelist("FIRE_WAVE", 14147), 21), 31);
  assert.equal(Minions.weaknessDamage(fakeDuelist("FIRE_WAVE", 14150), 20), 20);
  assert.equal(Minions.weaknessDamage(fakeDuelist("WATER_WAVE", 2085), 20), 20);
});

test("contribution shares are whole percents of combined damage", () => {
  const me = fakePlayer();
  me.getUsername = () => "me";
  const other = fakePlayer();
  other.getUsername = () => "other";
  const branda = fakeTitan(12596);
  const eldric = fakeTitan(14147);
  branda.setAttribute(Shared.ATTR_DAMAGE_DEALT, { me: 300, other: 300 });
  eldric.setAttribute(Shared.ATTR_DAMAGE_DEALT, { me: 300, other: 300 });
  assert.equal(Corpse.shareOf({ branda, eldric }, me), 0.5);
  assert.equal(Corpse.shareOf({ branda, eldric }, fakePlayer()), 0);
});

test("loot scaling: linear above 1%, pet/clues untouched, pages stripped", () => {
  const drops = [
    { itemId: 30640, amount: 14, name: "Desiccated page" },
    { itemId: 12345, amount: 300, name: "Coal" },
    { itemId: 30622, amount: 1, name: "Bran" },
    { itemId: 2722, amount: 1, name: "Clue scroll (hard)" },
  ];
  const half = Corpse.scaleDrops(drops, 0.5, false);
  assert.equal(half.find((d) => d.itemId === 12345).amount, 150);
  assert.equal(half.find((d) => d.itemId === 30622).amount, 1);
  assert.ok(!half.some((d) => d.itemId === 30640));
  const tiny = Corpse.scaleDrops(drops, 0.005, false);
  assert.equal(tiny.find((d) => d.itemId === 12345).amount, 1);
  const none = Corpse.scaleDrops(drops, 0, false);
  assert.deepEqual(none, []);
});

test("a clean kill completes Perfect, No time to pray and counts the streak", () => {
  completed.length = 0;
  const player = fakePlayer();
  CombatAchievements.spawned(player, { players: [player] });
  now += 100;
  const total = CombatAchievements.killed(player, { players: [player] }, 1, () => {});
  assert.equal(total, 101);
  assert.ok(completed.includes("Perfect Royal Titans"));
  assert.ok(completed.includes("No time to pray"));
  assert.equal(player.getAttribute(Shared.ATTR_STREAK), 1);
});

test("avoidable damage blocks Perfect but nothing else", () => {
  completed.length = 0;
  const player = fakePlayer();
  CombatAchievements.spawned(player, { players: [player] });
  CombatAchievements.avoidableDamage(player, 12, "blast");
  now += 100;
  CombatAchievements.killed(player, { players: [player] }, 2, () => {});
  assert.ok(!completed.includes("Perfect Royal Titans"));
  assert.ok(completed.includes("No time to pray"));
});

test("dying inside one charge phase completes It takes too long", () => {
  completed.length = 0;
  const player = fakePlayer();
  const session = { players: [player] };
  CombatAchievements.spawned(player, session);
  CombatAchievements.blastCharged(session, 7);
  now += 100;
  CombatAchievements.killed(player, session, 3, () => {});
  assert.ok(completed.includes("It takes too long"));
});

test("fifteen kills in one instance complete Titan Killer; leaving fails it", () => {
  completed.length = 0;
  const player = fakePlayer();
  const session = { players: [player] };
  for (let kill = 0; kill < 15; kill++) {
    CombatAchievements.spawned(player, session);
    now += 100;
    CombatAchievements.killed(player, session, kill + 1, () => {});
  }
  assert.ok(completed.includes("Titan Killer"));
  completed.length = 0;
  CombatAchievements.left(player, session);
  // A new instance restarts the streak (Area.moveInto resets both attributes).
  player.setAttribute(Shared.ATTR_STREAK, 0);
  player.setAttribute(Shared.ATTR_STREAK_FAILED, null);
  const fresh = { players: [player] };
  CombatAchievements.spawned(player, fresh);
  now += 100;
  CombatAchievements.killed(player, fresh, 16, () => {});
  assert.equal(player.getAttribute(Shared.ATTR_STREAK), 1);
  assert.ok(!completed.includes("Titan Killer"));
});

test("one-sided damage completes One by one; minion attacks fail Elemental Company", () => {
  completed.length = 0;
  const player = fakePlayer();
  const session = { players: [player] };
  CombatAchievements.spawned(player, session);
  CombatAchievements.hitResolved({
    attacker: { isPlayer: () => true, getAsPlayer: () => player },
    target: { isNpc: () => true, getId: () => 12596 },
    hit: { getTotalDamage: () => 50 },
  });
  CombatAchievements.minionAttacked(player, session);
  now += 100;
  CombatAchievements.killed(player, session, 4, () => {});
  assert.ok(completed.includes("One by one"));
  assert.ok(!completed.includes("Elemental Company"));
});
