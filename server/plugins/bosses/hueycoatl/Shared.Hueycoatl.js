/**
 * Shared Hueycoatl constants: ids, tiles, captured anim/graphic/sound shapes and helpers.
 *
 * Behaviour: https://oldschool.runescape.wiki/w/The_Hueycoatl (stats, 60% earth weakness,
 * dragonbane, immunities, 2500/250/300 HP pools) and
 * https://oldschool.runescape.wiki/w/The_Hueycoatl/Strategies (glowing symbols, Rain Fire
 * prayer mapping, four phases, pillars/braziers 30% buff, tail damage cap, shockwaves).
 *
 * Checked against rsprox captures (https://rsprox.net/database; hueycoatl.sqlite, revs
 * 226-237; facts in docs/hueycoatl.md): chain entry (teleport + Taala gate + peek),
 * slide exit, bank buffalo, scoreboard 884, private flag menu, spawn tiles (5 body, head,
 * tail sides), head autos (melee/magic/range +4 ticks), symbol tiles (55209 bounds),
 * pillar loc chains, shield sequence (message +5, activation, invulnerable transform),
 * tail cap hit clusters (1/4/5), shockwave map anims, KC varp 4404 + messages, seer
 * shouts, lobby NPC spawns. All 196 recordings carry special-world flags (docs caveat).
 */
const HEAD_ID = 14009;
const HEAD_INVULNERABLE_ID = 14011;
const HEAD_DEFEATED_ID = 14012;
const HEAD_PLACEHOLDER_ID = 14010;
const BODY_ID = 14017;
const BODY_BROKEN_ID = 14018;
const TAIL_ID = 14014;
const TAIL_BROKEN_ID = 14015;
const SEER_ID = 14008;

const HEAD_HITPOINTS = 2500;
const BODY_HITPOINTS = 250;
const TAIL_HITPOINTS = 300;
const BODY_COUNT = 5;
/** P2 ends and the shield goes up at half head health. */
const SHIELD_THRESHOLD = 1250;
/** Head size 7, body 1, tail 5 (Wiki). */
const HEAD_SIZE = 7;
const TAIL_SIZE = 5;

/** Recorded anim/graphic ids (precache script1846, revs 226-237; verify rev 241). */
const ANIMS = Object.freeze({
  headMelee: 11669, headRange: 11670, headMagic: 11671,
  shieldActivation: 11676, shieldIdle: 11672,
  shieldMelee: 11673, shieldRange: 11674, shieldMagic: 11675,
  tailBreak: 11723, bodyDeath: 11687,
  spotMelee: 11708, spotRange: 11716, spotMagic: 11712,
  projMelee: 11709, projRange: 11717, projMagic: 11713,
  impactMelee: 11710, impactRange: 11718, impactMagic: 11714,
  symbolTile: 3001, knockdown: 7211,
});

const HEAD_MAX = 14;
const BODY_MAX = 13;
const TAIL_MAX = 25;
const SYMBOL_MAX = 16;
const RAIN_FIRE_MAX = 14;
const SHOCKWAVE_MAX = 25;
/** Tail damage cap 4, 9 with crush-highest bonus, misses floored to 1 (Wiki). */
const TAIL_CAP = 4;
const TAIL_CAP_CRUSH = 9;

const ENTRANCE_OBJECT = 55401;
const EXIT_SHORTCUT_OBJECT = 55234;
const BANK_BUFFALO_OBJECT = 55199;
const SCOREBOARD_OBJECT = 55198;
const FLAG_CREATOR_OBJECT = 55203;
const FLAG_CREATOR_INSTANCED_OBJECT = 55204;
const FLAG_ENTRANCE_INSTANCED_OBJECT = 55205;
const SYMBOL_OBJECT = 55209;
const BARRIER_OBJECT = 55206;
const BARRIER_RESPAWN_OBJECT = 55208;
const BARRIER_RETRACTED_OBJECT = 55207;

const PILLAR_TILES = Object.freeze({
  magic: [1504, 3287, 0],
  ranged: [1505, 3289, 0],
  melee: [1507, 3290, 0],
});
const PILLAR_LOCS = Object.freeze({
  magic: { empty: 55212, stages: [55213, 55214, 55215, 55216, 55217], off: 55211, on: 55210 },
  ranged: { empty: 55220, stages: [55221, 55222, 55223, 55224, 55225], off: 55219, on: 55218 },
  melee: { empty: 55228, stages: [55229, 55230, 55231, 55232, 55233], off: 55227, on: 55226 },
});
/** Pillar colour to prayer (Wiki): blue magic, red melee, green missiles. */
const PILLAR_PRAYERS = Object.freeze({ magic: "magic", ranged: "missiles", melee: "melee" });
/** Active prayers per pillar by team size (Wiki table). */
function prayersPerPillar(teamSize) {
  if (teamSize >= 18) return 6;
  if (teamSize >= 15) return 5;
  if (teamSize >= 12) return 4;
  if (teamSize >= 9) return 3;
  if (teamSize >= 6) return 2;
  return 1;
}
/** 30% damage buff while the braziers stay lit (Wiki). */
const BRAZIER_BUFF = 1.3;

/** Chain entrance tile; the bank-to-boss trip ends here. */
const ENTRANCE_TILE = [1527, 3285, 0];
/** Arena landing through the chains (captured 1528/1529). */
const ARENA_ENTRY = [1528, 3284, 0];
/** Slide landing east of camp (captured); the ::teleports destination. */
const CAMP_LANDING = [1524, 3290, 0];

/** Exact spawn tiles, multi-sample (docs/hueycoatl.md). */
const BODY_SPAWNS = Object.freeze([
  [1520, 3273, 0],
  [1524, 3277, 0],
  [1527, 3273, 0],
  [1530, 3276, 0],
  [1524, 3270, 0],
]);
/** Head spawn, unanimous across 12 recs (revs 232-237). */
const HEAD_SPAWN = [1509, 3290, 0];
/** Tail sides: east favoured in captures (19 vs 2). */
const TAIL_SPAWN_EAST = [1518, 3281, 0];
const TAIL_SPAWN_WEST = [1502, 3281, 0];
/** Seer walk: entrance to post. */
const SEER_SPAWN = [1530, 3284, 0];
const SEER_POST = [1527, 3276, 0];

/** Symbol tiles live in x1505-1529, y3270-3289, plane 0 (observed envelope). */
const SYMBOL_BOUNDS = Object.freeze({ x0: 1505, x1: 1529, y0: 3270, y1: 3289, z: 0 });
/** Symbols fully form 4 ticks after manifesting (Wiki; delay=120 uniform). */
const SYMBOL_FORM_TICKS = 4;
/** Tail visible ~34-36 ticks per side, hidden 2 mid-swap (235/03400). */
const TAIL_VISIBLE_TICKS = 35;
const TAIL_SWAP_HIDDEN_TICKS = 2;
/** Head autos land ~+4 ticks after the attack action (captured). */
const AUTO_DELAY_TICKS = 4;
/** Rain Fire flight: endtime 150 typical, 210 at range (packet cycles). */
const PROJECTILE_ENDTIME_NEAR = 150;
const PROJECTILE_ENDTIME_FAR = 210;
/** Shield: message, then activation + invulnerable transform +5 ticks. */
const SHIELD_DELAY_TICKS = 5;
/** Respawn 30s; grave substitutes at base camp (no graves in tsps). */
const RESPAWN_TICKS = 50;
/** Ground loot reveal/despawn (captured 100/400). */
const LOOT_REVEAL_TICKS = 100;
const LOOT_DESPAWN_TICKS = 400;

const TOTAL_KILLS_VARP = 4404;
const REWARDS_VARP = 4446;
const HUEY_IN_AREA_VARBIT = 11362;
const HUEY_ENCOUNTERED_VARBIT = 11363;
const HUEY_INTRO_VARBIT = 11413;

const ATTR_SESSION = "hueycoatl:session";
const ATTR_PHASE = "hueycoatl:phase";
const ATTR_DYING = "hueycoatl:dying";
const ATTR_ARMED_AT = "hueycoatl:armed-at";
const ATTR_CLAIMED = "hueycoatl:claimed";
const ATTR_BEST = "hueycoatl:best";
const ATTR_KILLS = "hueycoatl:kills";

function tileKey(x, y) {
  return `${x},${y}`;
}

/** m:ss.cc from a tick span (0.6s ticks; matches live's duration lines). */
function formatTicks(ticks) {
  const centis = Math.max(0, Math.floor(ticks)) * 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${Math.floor(centis / 6000)}:${pad(Math.floor((centis % 6000) / 100))}.${pad(centis % 100)}`;
}

function isHead(id) {
  return id === HEAD_ID || id === HEAD_INVULNERABLE_ID || id === HEAD_DEFEATED_ID;
}

function isFighter(id) {
  return isHead(id) || id === BODY_ID || id === TAIL_ID;
}

module.exports = {
  HEAD_ID,
  HEAD_INVULNERABLE_ID,
  HEAD_DEFEATED_ID,
  HEAD_PLACEHOLDER_ID,
  BODY_ID,
  BODY_BROKEN_ID,
  TAIL_ID,
  TAIL_BROKEN_ID,
  SEER_ID,
  HEAD_HITPOINTS,
  BODY_HITPOINTS,
  TAIL_HITPOINTS,
  BODY_COUNT,
  SHIELD_THRESHOLD,
  HEAD_SIZE,
  TAIL_SIZE,
  HEAD_MAX,
  BODY_MAX,
  TAIL_MAX,
  SYMBOL_MAX,
  RAIN_FIRE_MAX,
  SHOCKWAVE_MAX,
  TAIL_CAP,
  TAIL_CAP_CRUSH,
  ENTRANCE_OBJECT,
  EXIT_SHORTCUT_OBJECT,
  BANK_BUFFALO_OBJECT,
  SCOREBOARD_OBJECT,
  FLAG_CREATOR_OBJECT,
  FLAG_CREATOR_INSTANCED_OBJECT,
  FLAG_ENTRANCE_INSTANCED_OBJECT,
  SYMBOL_OBJECT,
  BARRIER_OBJECT,
  BARRIER_RESPAWN_OBJECT,
  BARRIER_RETRACTED_OBJECT,
  PILLAR_TILES,
  PILLAR_LOCS,
  PILLAR_PRAYERS,
  prayersPerPillar,
  BRAZIER_BUFF,
  ENTRANCE_TILE,
  ARENA_ENTRY,
  CAMP_LANDING,
  BODY_SPAWNS,
  HEAD_SPAWN,
  TAIL_SPAWN_EAST,
  TAIL_SPAWN_WEST,
  SEER_SPAWN,
  SEER_POST,
  SYMBOL_BOUNDS,
  SYMBOL_FORM_TICKS,
  TAIL_VISIBLE_TICKS,
  TAIL_SWAP_HIDDEN_TICKS,
  AUTO_DELAY_TICKS,
  PROJECTILE_ENDTIME_NEAR,
  PROJECTILE_ENDTIME_FAR,
  SHIELD_DELAY_TICKS,
  RESPAWN_TICKS,
  LOOT_REVEAL_TICKS,
  LOOT_DESPAWN_TICKS,
  TOTAL_KILLS_VARP,
  REWARDS_VARP,
  HUEY_IN_AREA_VARBIT,
  HUEY_ENCOUNTERED_VARBIT,
  HUEY_INTRO_VARBIT,
  ATTR_SESSION,
  ATTR_PHASE,
  ATTR_DYING,
  ATTR_ARMED_AT,
  ATTR_CLAIMED,
  ATTR_BEST,
  ATTR_KILLS,
  tileKey,
  formatTicks,
  isHead,
  isFighter,
  ANIMS,
};
