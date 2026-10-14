/**
 * The Hueycoatl's Combat Achievements that the fight decides (docs/hueycoatl.md).
 * Task names/ids/tiers are the Wiki's, read from the cache enums 3981-3986
 * (scripts/dump-huey-ca.ts): 11 tasks, 41 points. Kill-count tasks (Champion 1,
 * Adept 10, Veteran 25) finish themselves in the CA system off the kill reports;
 * everything else is decided here.
 *
 * Per-fight state: damage by attack style (wizard), braziers lit at kill (Pillar
 * Lover), armour worn at kill (I'm your son), duration + team size (speeds),
 * avoidable damage by category (Perfect streak of 5 without leaving).
 */
const Shared = require("./Shared.Hueycoatl");

const SPEED_LIMIT_TICKS = 250;
const CHASER_MAX_PLAYERS = 5;
const RUNNER_MAX_PLAYERS = 3;
const PERFECT_STREAK = 5;
const SON_PIECES = 2;
const DRAGONBANE_WEAPONS = new Set([22978, 30070, 21012, 21013]);
const HUEYCOATL_ARMOUR = new Set([30073, 30074, 30075, 30076, 30077, 30078, 30079, 30080]);

let api = null;

function stateOf(player, states) {
  if (!states.has(player)) {
    states.set(player, { fight: null, perfectStreak: 0 });
  }
  return states.get(player);
}

const states = new WeakMap();

function complete(player, task) {
  api?.emitCustomEvent?.("combat-achievements:complete", { player, task });
}

/** A fight starts for this player. */
function fightStarted(player, session) {
  stateOf(player, states).fight = {
    session,
    nonMagicDamage: false,
    avoidable: false,
  };
}

function noteDamage(player, style, amount, dragonbane) {
  const state = stateOf(player, states);
  if (!state.fight || !(amount > 0)) return;
  if (style !== "magic") state.fight.nonMagicDamage = true;
  if (dragonbane === false) state.fight.nonDragonbaneDamage = true;
}

function noteAvoidable(player) {
  const state = stateOf(player, states);
  if (state.fight) state.fight.avoidable = true;
}

function wornHueycoatlPieces(player) {
  let count = 0;
  try {
    const equipment = player?.getEquipment?.();
    for (let slot = 0; slot < 14; slot++) {
      const item = equipment?.get?.(slot) ?? equipment?.getItem?.(slot);
      if (item && HUEYCOATL_ARMOUR.has(item.getId?.())) count += 1;
    }
  } catch (error) { /* conservative */ }
  return count;
}

/** A kill: decide every task the fight can complete. */
function fightKilled(player, session, durationTicks) {
  const state = stateOf(player, states);
  const fight = state.fight;
  const teamSize = (session?.players ?? [player]).length;
  if (durationTicks <= SPEED_LIMIT_TICKS) {
    complete(player, "Hueycoatl Speed-Trialist");
    if (teamSize <= CHASER_MAX_PLAYERS) complete(player, "Hueycoatl Speed-Chaser");
    if (teamSize <= RUNNER_MAX_PLAYERS) complete(player, "Hueycoatl Speed-Runner");
  }
  if (session?.braziersLit === true) complete(player, "Pillar Lover");
  if (wornHueycoatlPieces(player) >= SON_PIECES) complete(player, "I'm your son");
  // Earth-only is approximated as magic-only: exact spell attribution needs the
  // cast-spell id on each hit (verify live, docs assumption).
  if (fight && !fight.nonMagicDamage) complete(player, "You're a wizard");
  if (fight && !fight.nonDragonbaneDamage) complete(player, "Is it a bird?");
  if (fight && !fight.avoidable) {
    state.perfectStreak += 1;
    if (state.perfectStreak >= PERFECT_STREAK) complete(player, "Perfect Hueycoatl");
  } else {
    state.perfectStreak = 0;
  }
  state.fight = null;
}

function weaponIsDragonbane(player) {
  try {
    const id = player?.getEquipment?.()?.getWeapon?.()?.getId?.();
    return DRAGONBANE_WEAPONS.has(id);
  } catch (error) {
    return false;
  }
}

/** Player-attributed damage: wizard (magic-only) and dragonbane-only tracking. */
function hitResolved({ attacker, target, hit }) {
  if (!attacker?.isPlayer?.() || !target?.isNpc?.()) return;
  if (!Shared.isFighter(target.getId?.())) return;
  const player = attacker.getAsPlayer?.() ?? attacker;
  const damage = hit?.getTotalDamage?.() ?? hit?.getDamage?.() ?? 0;
  if (!(damage > 0)) return;
  let style = "unknown";
  try {
    const type = hit?.getCombatType?.();
    const name = type?.name ?? String(type ?? "");
    style = /magic/i.test(name) ? "magic" : /rang/i.test(name) ? "ranged" : /melee|crush|slash|stab/i.test(name) ? "melee" : "unknown";
  } catch (error) { /* unknown */ }
  noteDamage(player, style, damage, weaponIsDragonbane(player));
}

function attach(pluginApi) {
  api = pluginApi;
  pluginApi.onCombatHitResolved(hitResolved);
}

module.exports = {
  attach, fightStarted, fightKilled, noteDamage, noteAvoidable, wornHueycoatlPieces, stateOf, states, hitResolved, weaponIsDragonbane,
  SPEED_LIMIT_TICKS, HUEYCOATL_ARMOUR,
  _test: { fightStarted, fightKilled, noteDamage, noteAvoidable },
};
