/**
 * The Royal Titans' Combat Achievements that the fight decides (docs/royal-titans.md).
 * Kill-count tasks (Champion 10, Adept 25) finish themselves in the CA system off the kill
 * reports; everything else is decided here. Task names are the Wiki's (cache enums confirm).
 *
 * Per-fight state: avoidable damage by category (melee unprayed, rows, blast pulses,
 * minion explosions), damage dealt to each titan (One by one), minions attacked (Elemental
 * Company), rows spawned vs spell-cleared (I need room), elementals felled by titan damage
 * (Let them fight), blast charge windows (It takes too long), prayer points (No time to
 * pray). Titan Killer streaks count kills in one instance: joining resets to 0, anyone
 * leaving fails the stayers too (Wiki).
 */
const Shared = require("./Shared.RoyalTitans");

const SPEED_RUNNER_TICKS = 150;
const TITAN_KILLER_KILLS = 15;
const LET_THEM_FIGHT_KILLS = 10;
const MONSTER = "Royal Titans";

const MINION_IDS = new Set([Shared.FIRE_MINION_ID, Shared.ICE_MINION_ID]);

/** player -> { fight, } while they are in an instance. */
const states = new WeakMap();
let api = null;
let core = null;
let PrayerHandler = null;

const tick = () => core.World.getProcessCycle();
const complete = (player, task) => api.emitCustomEvent("combat-achievements:complete", { player, task });

function stateOf(player) {
  if (!states.has(player)) {
    states.set(player, {
      fight: null,
      prayerStart: 0,
    });
  }
  return states.get(player);
}

function fightOf(player) {
  return states.get(player)?.fight ?? null;
}

function prayerPoints(player) {
  try {
    return player?.getSkillManager?.()?.getCurrentLevel?.(core.Skill.PRAYER) ?? 0;
  } catch (error) {
    return 0;
  }
}

/** A fight starts for this player (called for every party member on spawn). */
function spawned(player, session) {
  stateOf(player).fight = {
    session,
    spawnedAt: tick(),
    damageToBranda: 0,
    damageToEldric: 0,
    minionsAttacked: false,
    rowsSpawned: 0,
    rowsCleared: 0,
    rowsExpired: false,
    titanMinionKills: 0,
    charges: [],
    openCharge: null,
    avoidable: 0,
    prayerStart: prayerPoints(player),
    prayed: false,
  };
}

/** Each tick in the instance: prayer points must never drop (No time to pray). */
function tickPlayer(player) {
  const fight = fightOf(player);
  if (!fight) return;
  if (prayerPoints(player) < fight.prayerStart) fight.prayed = true;
}

/** Damage the Perfect task forbids, by category (called with already-filtered damage). */
function avoidableDamage(player, amount, kind) {
  const fight = player ? fightOf(player) : null;
  if (!fight || !(amount > 0)) return;
  if (kind === "melee" || kind === "row" || kind === "blast" || kind === "explode") {
    fight.avoidable += amount;
  }
}

/** Player-attributed damage to a titan (One by one; also feeds Corpse contribution). */
function hitResolved({ attacker, target, hit }) {
  if (!attacker?.isPlayer?.() || !target?.isNpc?.()) return;
  const player = attacker.getAsPlayer?.() ?? attacker;
  const fight = fightOf(player);
  const damage = hit?.getTotalDamage?.() ?? 0;
  if (Shared.isMinion(target.getId?.())) {
    if (fight && damage >= 0) fight.minionsAttacked = true;
    return;
  }
  if (!Shared.isLiveTitan(target.getId?.())) return;
  if (fight && damage > 0) {
    if (target.getId() === Shared.BRANDA_ID) fight.damageToBranda += damage;
    else fight.damageToEldric += damage;
  }
}

/** A minion died to titan damage (blast pulses): Let them fight. */
function minionHitByTitan(session, minion, damage) {
  if (!session) return;
  minion.__royalTitanDamage = (minion.__royalTitanDamage ?? 0) + damage;
}

/** A minion died with a player killer (or not): attribute Let-them-fight kills. */
function minionKilledBy(player, session, npc) {
  if (!session) return;
  if ((npc.__royalTitanDamage ?? 0) > 0 && !player) {
    for (const member of session.players) {
      const fight = fightOf(member);
      if (fight) fight.titanMinionKills += 1;
    }
    return;
  }
  if (player) {
    const fight = fightOf(player);
    if (fight && (npc.__royalTitanDamage ?? 0) > 0) fight.titanMinionKills += 1;
  }
}

/** Any resolved player -> elemental hit marks Elemental Company as failed. */
function minionAttacked(player) {
  const fight = player ? fightOf(player) : null;
  if (fight) fight.minionsAttacked = true;
}

/** Row lifecycle for I need room: every tile spell-cleared before natural despawn. */
function rowSpawned(session) {
  for (const player of session?.players ?? []) {
    const fight = fightOf(player);
    if (fight) fight.rowsSpawned += 1;
  }
}

function rowCleared(session) {
  for (const player of session?.players ?? []) {
    const fight = fightOf(player);
    if (fight) fight.rowsCleared += 1;
  }
}

function rowExpired(session) {
  for (const player of session?.players ?? []) {
    const fight = fightOf(player);
    if (fight) fight.rowsExpired = true;
  }
}

/** Blast charge windows for It takes too long (both die inside one charge phase). */
function blastCharged(session, id) {
  const at = tick();
  for (const player of session?.players ?? []) {
    const fight = fightOf(player);
    if (fight) fight.openCharge = { id, at };
  }
}

function blastResolved(session, id) {
  for (const player of session?.players ?? []) {
    const fight = fightOf(player);
    if (fight && fight.openCharge?.id === id) {
      fight.charges.push(fight.openCharge);
      fight.openCharge = null;
    }
  }
}

/** Teleport happened: joins past this point are refused (Area reads the flags too). */
function teleported() {}

/** A partner joined mid-fight: their streak resets to 0 (Wiki). */
function joined(player) {
  player.setAttribute?.(Shared.ATTR_STREAK, 0);
  player.setAttribute?.(Shared.ATTR_STREAK_FAILED, null);
  spawned(player, null);
}

/** Someone left (or died): leaver fails, stayers lose their streaks (Wiki). */
function left(player, session) {
  states.delete(player);
  try {
    player.setAttribute?.(Shared.ATTR_STREAK_FAILED, true);
  } catch (error) {}
  for (const member of session?.players ?? []) {
    if (member === player) continue;
    try {
      member?.setAttribute?.(Shared.ATTR_STREAK, 0);
    } catch (error) {}
    const fight = fightOf(member);
    if (fight) {
      fight.rowsSpawned = 0;
      fight.rowsCleared = 0;
      fight.rowsExpired = false;
    }
  }
}

function died(player) {
  states.delete(player);
  player.setAttribute?.(Shared.ATTR_STREAK_FAILED, true);
}

/**
 * Both titans down: the kill goes to Combat Achievements, `announce(kills)` tells the
 * player (with CA's total) before any task message, as live orders them, and then the
 * tasks the fight earned are finished. Speed-Runner times spawn-to-second-death (<150).
 */
function killed(player, session, ownKills, announce) {
  let announced = false;
  const request = {
    player,
    monster: MONSTER,
    count: ownKills,
    announce: (kills) => {
      announced = true;
      announce?.(kills);
    },
  };
  api.emitCustomEvent("combat-achievements:kill", request);
  const total = Number.isInteger(request.total) ? request.total : null;
  if (!announced) announce?.(ownKills);

  const state = stateOf(player);
  const fight = state.fight;
  state.fight = null;
  if (!fight) return total;
  const now = tick();
  const duration = now - (fight.spawnedAt ?? now);
  if (duration < SPEED_RUNNER_TICKS) complete(player, "Royal Titan Speed-Runner");
  if (fight.damageToBranda === 0 || fight.damageToEldric === 0) {
    if (fight.damageToBranda + fight.damageToEldric > 0) complete(player, "One by one");
  }
  if (!fight.minionsAttacked) complete(player, "Elemental Company");
  if (fight.titanMinionKills >= LET_THEM_FIGHT_KILLS) complete(player, "Let them fight");
  if (fight.rowsSpawned > 0 && fight.rowsCleared >= fight.rowsSpawned && !fight.rowsExpired) {
    complete(player, "I need room");
  }
  if (fight.avoidable === 0) complete(player, "Perfect Royal Titans");
  if (!fight.prayed) complete(player, "No time to pray");
  // Both titans died inside one charge phase: the kill lands while a charge is open.
  if (fight.openCharge) complete(player, "It takes too long");
  if (player.getAttribute?.(Shared.ATTR_STREAK_FAILED) !== true) {
    const streak = (Number(player.getAttribute?.(Shared.ATTR_STREAK)) || 0) + 1;
    try {
      player.setAttribute?.(Shared.ATTR_STREAK, streak);
    } catch (error) {}
    if (streak >= TITAN_KILLER_KILLS) complete(player, "Titan Killer");
  }
  return total;
}

function answerKillCount({ player, counts }) {
  const kills = Number(player.getAttribute?.(Shared.ATTR_KILLS)) || 0;
  if (kills > 0) counts[MONSTER] = kills;
}

function answerPersonalBest(request) {
  if (request.monster !== MONSTER) return;
  const best = Number(request.player.getAttribute?.(Shared.ATTR_BEST_TICKS)) || 0;
  if (best > 0) request.best = best;
}

function resetBest(request) {
  if (request.monster !== MONSTER) return;
  request.player.setAttribute(Shared.ATTR_BEST_TICKS, null);
  request.handled = true;
}

function attach(pluginApi) {
  api = pluginApi;
  core = pluginApi.core;
  PrayerHandler = pluginApi.getPrayerHandler();
  pluginApi.onCombatHitResolved(hitResolved);
  pluginApi.onCustomEvent("combat-achievements:kill-count", answerKillCount);
  pluginApi.onCustomEvent("combat-achievements:personal-best", answerPersonalBest);
  pluginApi.onCustomEvent("combat-achievements:reset-best", resetBest);
}

module.exports = {
  attach, spawned, tick: tickPlayer, avoidableDamage, hitResolved,
  minionHitByTitan, minionKilledBy, minionAttacked,
  rowSpawned, rowCleared, rowExpired, blastCharged, blastResolved, teleported,
  joined, left, died, killed,
  _test: { states, SPEED_RUNNER_TICKS },
};
