/**
 * Phase 2 pillars and braziers: the seer's charge checks, per-pillar prayer balance and
 * the 30% damage buff while all three braziers stay lit.
 *
 * As captured: fixed pillar tiles (magic (1504, 3287), ranged (1505, 3289), melee
 * (1507, 3290)) with loc chains empty -> s1..s5 -> brazier_off -> brazier_on; blue is
 * Magic, red Melee, green Missiles (Wiki). Required active prayers per pillar scale with
 * team size (1/2/3/4/5/6 at 1-5/6-8/9-11/12-14/15-17/18-20). Draining mid-fill is safe if
 * refilled before the check. No pillar/brazier/seer/buff varp exists: the buff is
 * server-side state from pillar locs. Solos/duos can never light all three.
 */
const Shared = require("./Shared.Hueycoatl");

let api = null;
let PrayerHandler = null;

function activePrayerCount(players, kind) {
  if (!PrayerHandler) return 0;
  const id = kind === "melee" ? PrayerHandler.PROTECT_FROM_MELEE
    : kind === "missiles" ? PrayerHandler.PROTECT_FROM_MISSILES
      : PrayerHandler.PROTECT_FROM_MAGIC;
  let count = 0;
  for (const player of players ?? []) {
    try {
      if (PrayerHandler.isActivated(player?.getAsPlayer?.() ?? player, id)) count += 1;
    } catch (error) { /* ignore */ }
  }
  return count;
}

/** Per-pillar charge stage 0-5 from active prayers (team-size gated). */
function pillarStage(players, kind) {
  const team = (players ?? []).length;
  const need = Math.max(1, Shared.prayersPerPillar(team));
  const active = activePrayerCount(players, kind);
  return Math.max(0, Math.min(5, Math.floor((active / need) * 5)));
}

/** All three pillars full: braziers lit, 30% buff on. */
function braziersLit(players) {
  return ["melee", "magic", "missiles"].every((kind) => pillarStage(players, kind) >= 5);
}

/** Damage multiplier for a player in this session (braziers or 1). */
function damageMultiplier(session) {
  if (!session) return 1;
  if (session.braziersLit === true) return Shared.BRAZIER_BUFF;
  return 1;
}

function attach(pluginApi) {
  api = pluginApi;
  PrayerHandler = pluginApi.getPrayerHandler();
}

module.exports = {
  attach, activePrayerCount, pillarStage, braziersLit, damageMultiplier,
  _test: { activePrayerCount, pillarStage, braziersLit, damageMultiplier },
};
