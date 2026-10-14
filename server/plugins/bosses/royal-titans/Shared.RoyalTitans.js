/**
 * Shared Royal Titans constants: ids, tiles, captured anim/graphic/sound shapes and helpers.
 *
 * Behaviour: https://oldschool.runescape.wiki/w/Royal_Titans (mechanics, 1-2 players, the
 * 35% teleport, the arena-wide blast, contribution, the eleven combat tasks),
 * https://oldschool.runescape.wiki/w/Branda_the_Fire_Queen and
 * https://oldschool.runescape.wiki/w/Eldric_the_Ice_King (both: combat 350, 3x3, 600 HP,
 * 7-tick crush, max 26 melee / 12 wall, +700 magic with a 50% elemental weakness, +700
 * ranged with the player's x6 accuracy out of melee distance, immune poison/venom/cannon/
 * freeze, burn works), and the Fire/Ice elemental pages (37, 1x1, 40 HP, max 4, speed 4,
 * 100% weakness, spell hit chance = magic accuracy bonus + 30, min 30%).
 *
 * Checked against rsprox captures (https://rsprox.net/database; royal_titans.sqlite, revs
 * 223-235; facts in docs/royal-titans.md): only 228/02283, 235/03398 and 235/03402 hold
 * arena fights (all solo). Captured: instance build, spawn tiles/anims, the 7-tick cycles
 * with steps between attacks, the 5x3 melee telegraph (graphic 3211, +2 delay per tile
 * from the caster), rows (spawn vfx + hitbox NPCs +4 ticks, ~40-tick life, spell-cleared
 * early), minion trios (+2 ticks, ~4-tick attacks, ~18-tick fuse then explode), the 35%
 * teleport pair, the blast (charge + safe tile, fire +6 ticks, triple pulses +1/+3/+5),
 * the claim-anchored corpse schedule, kill/duration/eligibility messages, HUD switching,
 * sounds, entrance/exit/scoreboard/shortcut flows.
 */
const SIZE = 3;
const MAX_HITPOINTS = 600;
const TELEPORT_THRESHOLD = 210;
const JOIN_MIN_HITPOINTS = 450;

const BRANDA_ID = 12596;
const ELDRIC_ID = 14147;
const BRANDA_CORPSE_ID = 14148;
const ELDRIC_CORPSE_ID = 14149;
const FIRE_MINION_ID = 14150;
const ICE_MINION_ID = 14151;
const FIRE_ROW_ID = 14152;
const ICE_ROW_ID = 14153;
const BRANDA_PET_ID = 12593;
const ELDRIC_PET_ID = 12595;

const ENTRANCE_OBJECT = 55986;
const EXIT_OBJECT = 55987;
const SHORTCUT_EAST_OBJECT = 55988;
const SHORTCUT_WEST_OBJECT = 55989;
const SCOREBOARD_OBJECT = 56004;
const BRANDA_FLOOR_1 = 55993;
const BRANDA_FLOOR_2 = 55994;
const ELDRIC_FLOOR_1 = 55997;
const ELDRIC_FLOOR_2 = 55998;
const BRANDA_DEATH_FLOOR_1 = 55995;
const BRANDA_DEATH_FLOOR_2 = 55996;
const ELDRIC_DEATH_FLOOR_1 = 55999;
const ELDRIC_DEATH_FLOOR_2 = 56000;
const FIRE_ROW_OBJECT = 56001;
const ICE_ROW_OBJECT = 56002;
const SAFE_TILE_OBJECT = 56003;
const BLOCKING_OBJECT = 26209;
const CLEARED_OBJECT = 29733;

/** Live spawn tiles and facings, as captured (Branda, then Eldric a tick later). */
const BRANDA_SPAWN = [2906, 9566, 0];
const ELDRIC_SPAWN = [2914, 9566, 0];
/** Static tiles after the teleport. */
const BRANDA_STATIC = [2910, 9571, 0];
const ELDRIC_STATIC = [2910, 9561, 0];
/** The player lands here on entering the instance. */
const ARENA_ENTRY = [2911, 9573, 0];
/** Live's own exit lands here, outside by the entrance: the ::teleports destination. */
const OUTSIDE_LANDING = [2950, 9574, 0];
const ENTRANCE_TILE = [2948, 9573, 0];
/** Agility shortcut: click east, walk here, then +5 ticks to the west landing. */
const SHORTCUT_WALK_TO = [2991, 9547, 0];
const SHORTCUT_LANDING = [2969, 9551, 0];
const SHORTCUT_DELAY_TICKS = 5;

/** Attack cadence: each titan runs its own ~7-tick cycle, stepping between attacks. */
const ATTACK_SPEED_TICKS = 7;
/** First attack comes a few ticks after the spawn animations. */
const ARM_TICKS = 4;
/** Minions attack about every 4 ticks (Wiki). */
const MINION_SPEED_TICKS = 4;
const MINION_HITPOINTS = 40;
const MINION_MAX = 4;
/** Unkilled elementals detonate ~18 ticks after spawning (captured 840 -> 858). */
const MINION_FUSE_TICKS = 18;
/** Rows live ~40 ticks unless cleared early (captured lives 34-40). */
const ROW_LIFETIME_TICKS = 40;
/** Row hitbox NPCs stand up 4 ticks after the summon01 anim. */
const ROW_SPAWN_TICKS = 4;
/** Minions stand up 2 ticks after the summon02 anim. */
const MINION_SPAWN_TICKS = 2;
/** The blast fires 6 ticks after the charge; pulses land +1/+3/+5 after the fire. */
const BLAST_FIRE_TICKS = 6;
const BLAST_PULSE_OFFSETS = Object.freeze([1, 3, 5]);
/** Post-teleport the blast cycles about every 28 ticks (captured gaps 22-30). */
const BLAST_INTERVAL_TICKS = 28;

const MELEE_MAX = 26;
const WALL_MAX = 12;
const BLAST_MAX = 26;
/** Small explode damage (1-12 captured); exact max is an estimate (docs assumption 6). */
const EXPLODE_MAX = 12;
/** Ranged accuracy x6 while the titan is out of melee distance (Wiki). */
const RANGED_ACCURACY_MULTIPLIER = 6;
/** Elemental spell hit chance = magic accuracy bonus + 30, min 30% (Wiki). */
const ELEMENTAL_HIT_BONUS = 30;
const ELEMENTAL_HIT_MIN = 30;
/** Row clearing needs Wave-tier or stronger of the opposite element (docs assumption 15). */
const ROW_CLEAR_MIN_TIER = "wave";

/** Claim-anchored corpse schedule, ticks after the corpse click (captured +3/+5, +23/+26,
 * +28/+31, +31/+34 across the two fights). */
const CLAIM_MESSAGE_TICKS = 4;
const CLAIM_LOOT_TICKS = 5;
const CLAIM_DEATH_TICKS = 24;
const CLAIM_REMOVE_TICKS = 29;
const CLAIM_SPAWN_TICKS = 32;

/** Kill/duration messages go out on the kill tick itself (captured). */
const TOTAL_KILLS_VARP = 4648;
const ENTER_WARNING_VARBIT = 16089;

const BRANDA_ANIMATIONS = Object.freeze({
  spawn: 11966, idle: 11970, walk: 11972, melee: 11974,
  row: 11976, minions: 11978, blastCharge: 11981, blastFire: 11982,
  teleport: 11984, inactive: 11990, death: 11992,
});
const ELDRIC_ANIMATIONS = Object.freeze({
  spawn: 11963, idle: 11969, walk: 11971, melee: 11973,
  row: 11975, minions: 11977, blastCharge: 11979, blastFire: 11980,
  teleport: 11983, inactive: 11985, death: 11987,
});
const MINION_ANIMATIONS = Object.freeze({
  fire: Object.freeze({ attack: 11947, spawn: 11956, death: 11957, explode: 11961 }),
  ice: Object.freeze({ attack: 11950, spawn: 11954, death: 11951, explode: 11959 }),
});

/** Slot-2 cast graphics: only Branda's exist in the captures (Eldric casts with none). */
const BRANDA_CAST_GFX = Object.freeze({ row: 3212, minions: 3213, blastCharge: 3214, blastFire: 3215, teleport: 3216, spawn: 3217, death: 3224 });
const MINION_SPAWN_GFX = Object.freeze({ fire: 3204, ice: 3202 });
const MINION_DEATH_GFX = Object.freeze({ fire: 3205, ice: 3203 });
const MINION_EXPLODE_GFX = Object.freeze({ fire: 3207, ice: 3206 });
/** The stomp telegraph both titans share (3211), and the blast grids. */
const MELEE_TELEGRAPH_GFX = 3211;
const BLAST_FIRE_GFX = 3209;
const BLAST_ICE_GFX = 3210;
/** Row spawn/despawn grids and teleport grids. */
const ROW_SPAWN_GFX = Object.freeze({ fire: 3218, ice: 3221 });
const ROW_DESPAWN_GFX = Object.freeze({ fire: 3220, ice: 3223 });
const TELEPORT_GRID_GFX = Object.freeze({ fire: 3219, ice: 3222 });

/** Captured area sounds as [id, delay]. */
const SOUND = Object.freeze({
  fireRow: Object.freeze([[10116, 5], [10118, 122]]),
  iceRow: Object.freeze([[10146, 0], [10147, 5], [10148, 120]]),
  blast: Object.freeze([[10119, 0]]),
  minions: Object.freeze([[10172, 0], [10190, 0]]),
  melee: Object.freeze([[227, 56], [4029, 56], [4031, 56]]),
});

const WARNING_MESSAGE = "You are about to begin an encounter with the Royal Titans. Dying during this encounter will not be considered a safe death. To leave, you'll need to use <col=ff0000>'Quick-escape'</col> via the tunnel";
const CRITICAL_MESSAGE = "The fight with the Royal Titans is in a critical stage. You'll have to wait until the next fight begins.";
const ELIGIBLE_MESSAGE = "You are eligible to take loot from either Branda the Fire Queen or Eldric the Ice King.";
const REINVIGORATE_MESSAGE = "<col=ef1020>The Royal Titans will reinvigorate themselves in 18 seconds.</col>";
const ESCAPE_HINT = "You should be able to escape from here.";
const FIRE_HINT = "You'll need to use a water or ice spell that is strong enough to put out the fire.";
const ICE_HINT = "You'll need to use a fire spell that is strong enough to melt the ice.";
const SAFESPOT_EXAMINE = "This looks like a safe spot.";
const SACRIFICE_MISS = "You don't feel lucky during your sacrifice";

const MENU_TITLE = "Select an option";
const MENU_OPTIONS = Object.freeze([
  "Start a fight (Your friends will be able to join you).",
  "Join a fight.",
  "Do nothing.",
]);

/** Deterministic shouts: teleport lines always precede that titan's teleport. */
const TELEPORT_SHOUTS = Object.freeze([
  "Your time is up!", "The real battle begins now!", "Let's end this fight!",
  "Time to finish this!", "This is no game anymore!", "Time to meet your end!",
  "No more holding back!", "You'll regret provoking me!",
]);
/** Blast charge (aoe01) shouts. */
const BLAST_CHARGE_SHOUTS = Object.freeze([
  "Be prepare for the true power of fire!", "Be prepare for the true power of ice!",
  "At last, I can unleash my true power!", "Finally I can unleash my true power!",
  "Now, there's nothing holding me back!", "Time to show you my full strength!",
  "Feel the full strength of my wrath now!",
]);
/** Blast firing (aoe02) shouts. */
const BLAST_FIRE_SHOUTS = Object.freeze([
  "Face the force of my fury!", "Time to face your doom!", "Time to taste my wrath!",
  "Can you withstand this power?", "Let's see how you handle this!",
  "Behold the power of fire!", "Behold the power of ice!", "Feel the wrath of the ice!",
  "Time to feel my flames!", "Prepare to be scorched!", "Feel the heat of my wrath!",
]);
/** Flavor shouts before any mobile-phase attack. */
const FLAVOR_SHOUTS = Object.freeze([
  "You can't escape me!", "No more running, face me now!", "Ready to face my power!",
  "I'm coming for you!", "I'll crush you now!", "Here I come!",
  "Time to feel the strength of fire!", "Time to feel the strength of ice!",
  "Time to see the power of ice!", "Time to feel my strength!",
]);

/** NPC attribute keys (kebab-case, namespaced). */
const ATTR_ENCOUNTER = "royal-titans:encounter";
const ATTR_ARMED_AT = "royal-titans:armed-at";
const ATTR_ATTACKS = "royal-titans:attacks";
const ATTR_DYING = "royal-titans:dying";
const ATTR_TELEPORTED = "royal-titans:teleported";
const ATTR_FUSE_AT = "royal-titans:fuse-at";
const ATTR_ROW = "royal-titans:row";
const ATTR_MINION = "royal-titans:minion";
const ATTR_BLAST_AT = "royal-titans:blast-at";
const ATTR_BLAST_SAFE = "royal-titans:blast-safe";
const ATTR_DAMAGE_DEALT = "royal-titans:damage-dealt";
const ATTR_CLAIMED = "royal-titans:claimed";
const ATTR_AREA = "royal-titans:instance-area";
/** Player attribute keys: kills, best fight length (ticks), titan-killer streak. */
const ATTR_KILLS = "royal-titans:kills";
const ATTR_BEST_TICKS = "royal-titans:best-ticks";
const ATTR_STREAK = "royal-titans:streak";
const ATTR_STREAK_FAILED = "royal-titans:streak-failed";

/** Titans: 12596/14147 live, 14148/14149 corpses. Corpses keep 1 HP so clicks route. */
function isLiveTitan(id) {
  return id === BRANDA_ID || id === ELDRIC_ID;
}

function isCorpse(id) {
  return id === BRANDA_CORPSE_ID || id === ELDRIC_CORPSE_ID;
}

function isMinion(id) {
  return id === FIRE_MINION_ID || id === ICE_MINION_ID;
}

function isRowHitbox(id) {
  return id === FIRE_ROW_ID || id === ICE_ROW_ID;
}

function isTitanNpc(id) {
  return isLiveTitan(id) || isCorpse(id) || isMinion(id) || isRowHitbox(id);
}

function animationsFor(id) {
  return id === BRANDA_ID ? BRANDA_ANIMATIONS : ELDRIC_ANIMATIONS;
}

function minionKind(id) {
  return id === FIRE_MINION_ID ? "fire" : "ice";
}

/** Edge-to-edge Chebyshev distance between a size-x-size body and a 1x1 target. */
function edgeDistance(size, bossX, bossY, x, y) {
  const max = bossX + size - 1;
  const maxY = bossY + size - 1;
  const dx = x < bossX ? bossX - x : x > max ? x - max : 0;
  const dy = y < bossY ? bossY - y : y > maxY ? y - maxY : 0;
  return Math.max(dx, dy);
}

function tileKey(x, y) {
  return `${x},${y}`;
}

/** MCP-driven clicks can carry a limited player ref; resolve the real one by name. */
function resolvePlayer(world, player) {
  let current = player;
  for (let guard = 0; guard < 3; guard++) {
    if (!current || typeof current !== "object" || !("player" in current)) break;
    if (current.player === current) break;
    current = current.player;
  }
  if (current && typeof current.getDialogueManager === "function") return current;
  try {
    const inner = current && typeof current === "object" ? current : null;
    const name = typeof inner === "string"
      ? inner
      : inner?.getUsername?.() ?? inner?.username ?? null;
    const real = name ? world?.getPlayerByName?.(name) : null;
    if (real) return real;
  } catch (error) {
    // Fall through to the original reference.
  }
  return player;
}

function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Minutes, seconds and hundredths, as the fight-duration message shows them. */
function formatTicks(ticks) {
  const centis = Math.round(ticks * 60);
  const minutes = Math.floor(centis / 6000);
  const seconds = Math.floor((centis % 6000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis % 100).padStart(2, "0")}`;
}

module.exports = {
  SIZE, MAX_HITPOINTS, TELEPORT_THRESHOLD, JOIN_MIN_HITPOINTS,
  BRANDA_ID, ELDRIC_ID, BRANDA_CORPSE_ID, ELDRIC_CORPSE_ID,
  FIRE_MINION_ID, ICE_MINION_ID, FIRE_ROW_ID, ICE_ROW_ID,
  BRANDA_PET_ID, ELDRIC_PET_ID,
  ENTRANCE_OBJECT, EXIT_OBJECT, SHORTCUT_EAST_OBJECT, SHORTCUT_WEST_OBJECT,
  SCOREBOARD_OBJECT, BRANDA_FLOOR_1, BRANDA_FLOOR_2, ELDRIC_FLOOR_1, ELDRIC_FLOOR_2,
  BRANDA_DEATH_FLOOR_1, BRANDA_DEATH_FLOOR_2, ELDRIC_DEATH_FLOOR_1, ELDRIC_DEATH_FLOOR_2,
  FIRE_ROW_OBJECT, ICE_ROW_OBJECT, SAFE_TILE_OBJECT, BLOCKING_OBJECT, CLEARED_OBJECT,
  BRANDA_SPAWN, ELDRIC_SPAWN, BRANDA_STATIC, ELDRIC_STATIC, ARENA_ENTRY, OUTSIDE_LANDING,
  ENTRANCE_TILE, SHORTCUT_WALK_TO, SHORTCUT_LANDING, SHORTCUT_DELAY_TICKS,
  ATTACK_SPEED_TICKS, ARM_TICKS, MINION_SPEED_TICKS, MINION_HITPOINTS, MINION_MAX,
  MINION_FUSE_TICKS, ROW_LIFETIME_TICKS, ROW_SPAWN_TICKS, MINION_SPAWN_TICKS,
  BLAST_FIRE_TICKS, BLAST_PULSE_OFFSETS, BLAST_INTERVAL_TICKS,
  MELEE_MAX, WALL_MAX, BLAST_MAX, EXPLODE_MAX,
  RANGED_ACCURACY_MULTIPLIER, ELEMENTAL_HIT_BONUS, ELEMENTAL_HIT_MIN, ROW_CLEAR_MIN_TIER,
  CLAIM_MESSAGE_TICKS, CLAIM_LOOT_TICKS, CLAIM_DEATH_TICKS, CLAIM_REMOVE_TICKS, CLAIM_SPAWN_TICKS,
  TOTAL_KILLS_VARP, ENTER_WARNING_VARBIT,
  BRANDA_ANIMATIONS, ELDRIC_ANIMATIONS, MINION_ANIMATIONS,
  BRANDA_CAST_GFX, MINION_SPAWN_GFX, MINION_DEATH_GFX, MINION_EXPLODE_GFX,
  MELEE_TELEGRAPH_GFX, BLAST_FIRE_GFX, BLAST_ICE_GFX,
  ROW_SPAWN_GFX, ROW_DESPAWN_GFX, TELEPORT_GRID_GFX,
  SOUND, WARNING_MESSAGE, CRITICAL_MESSAGE, ELIGIBLE_MESSAGE, REINVIGORATE_MESSAGE,
  ESCAPE_HINT, FIRE_HINT, ICE_HINT, SAFESPOT_EXAMINE, SACRIFICE_MISS,
  MENU_TITLE, MENU_OPTIONS,
  TELEPORT_SHOUTS, BLAST_CHARGE_SHOUTS, BLAST_FIRE_SHOUTS, FLAVOR_SHOUTS,
  ATTR_ENCOUNTER, ATTR_ARMED_AT, ATTR_ATTACKS, ATTR_DYING, ATTR_TELEPORTED,
  ATTR_FUSE_AT, ATTR_ROW, ATTR_MINION, ATTR_BLAST_AT, ATTR_BLAST_SAFE,
  ATTR_DAMAGE_DEALT, ATTR_CLAIMED, ATTR_AREA,
  ATTR_KILLS, ATTR_BEST_TICKS, ATTR_STREAK, ATTR_STREAK_FAILED,
  isLiveTitan, isCorpse, isMinion, isRowHitbox, isTitanNpc,
  animationsFor, minionKind, edgeDistance, tileKey, randomBetween, pick, formatTicks,
  resolvePlayer,
  _test: { edgeDistance, tileKey, formatTicks, isTitanNpc },
};
