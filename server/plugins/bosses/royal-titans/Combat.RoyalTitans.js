/**
 * The titans' combat method: the crush stomp with its shared 5x3 telegraph, the 7-tick
 * attack cycle, and the teleport trip at 210 HP. Specials (rows, minions, blast) and the
 * walk-between-attacks belong to Specials; this method only picks melee vs special.
 *
 * As captured: each titan attacks about every 7 ticks, interleaved with the other's cycle.
 * Mobile mix is roughly melee .42 / rows .48 / minions .10 (228/02283 pre-teleport), melee
 * only adjacent. The stomp telegraphs a 5-wide by 3-deep block centred on the target's tile
 * at cast, graphic 3211 from either caster, per-tile delay +2 per tile from the caster; the
 * hit is fully blocked by Protect from Melee (Wiki), crush, max 26. Post-teleport there are
 * no rows: melee, minions and the blast. When one titan is down first, the survivor's melee
 * pierces protection prayers (Wiki; unwitnessed, docs assumption).
 */
const Shared = require("./Shared.RoyalTitans");
const Specials = require("./Specials.RoyalTitans");
const CombatAchievements = require("./CombatAchievements.RoyalTitans");

const MELEE_WEIGHT = 0.42;
const ROW_WEIGHT = 0.48;

let api = null;
let core = null;
let PrayerHandler = null;

function later(ticks, target, execFunc) {
  class DelayedTask extends core.Task {
    constructor() {
      super(Math.max(1, ticks), target, false);
    }

    execute() {
      this.stop();
      execFunc();
    }
  }
  core.TaskManager.submit(new DelayedTask());
}

function alive(entity) {
  return !!entity?.isRegistered?.() && (entity.getHitpoints?.() ?? 1) > 0;
}

function tileOf(entity) {
  const at = entity?.getLocation?.();
  return at ? { x: at.getX(), y: at.getY() } : null;
}

function isAdjacent(npc, target) {
  const base = tileOf(npc);
  const pos = tileOf(target);
  if (!base || !pos) return false;
  return Shared.edgeDistance(Shared.SIZE, base.x, base.y, pos.x, pos.y) <= 1;
}

function protectedMelee(target) {
  if (!target?.isPlayer?.()) return false;
  return PrayerHandler.isActivated(target.getAsPlayer(), PrayerHandler.PROTECT_FROM_MELEE);
}

/**
 * The captured stomp: face the target, telegraph the 5x3 block around its tile with the
 * caster-distance delays, then roll once a tick later. Leaving the block dodges; Protect
 * from Melee blocks it fully (Wiki) unless the partner titan is down (pierce, Wiki).
 */
function startMelee(npc, target) {
  const anims = Shared.animationsFor(npc.getId());
  npc.setPositionToFace?.(target.getLocation());
  npc.performAnimation(new core.Animation(anims.melee));
  const blocks = Specials.telegraphMelee(npc, target);
  const session = npc.getAttribute?.(Shared.ATTR_ENCOUNTER) ?? null;
  const pierce = session ? Specials.survivorEnraged(session, npc) : false;
  later(1, target, () => {
    if (!alive(npc) || npc.getAttribute?.(Shared.ATTR_DYING) === true) return;
    if (!alive(target)) return;
    const pos = tileOf(target);
    const inside = pos && blocks.some(([x, y]) => x === pos.x && y === pos.y);
    const protect = protectedMelee(target);
    let damage = 0;
    if (inside && (!protect || pierce)) {
      damage = core.Misc.getRandom(Shared.MELEE_MAX);
    }
    if (damage > 0) {
      target.getCombat().getHitQueue().addPendingDamage([new core.HitDamage(damage, core.HitMask.RED)]);
      if (target.isPlayer?.()) {
        if (!protect || pierce) CombatAchievements.avoidableDamage(target.getAsPlayer(), damage, "melee");
      }
    }
  });
}

/** Mobile mix: melee when adjacent, else rows/minions (captured shares). */
function pickSpecial(npc, target) {
  const teleported = npc.getAttribute?.(Shared.ATTR_TELEPORTED) === true;
  if (!teleported) {
    if (isAdjacent(npc, target)) {
      const roll = Math.random();
      if (roll < MELEE_WEIGHT) return "melee";
      if (roll < MELEE_WEIGHT + ROW_WEIGHT) return "row";
      return "minions";
    }
    return Math.random() < 0.85 ? "row" : "minions";
  }
  return Math.random() < 0.6 ? "melee" : "minions";
}

function combatClass() {
  const { CombatMethod, CombatType } = core;

  return class RoyalTitansCombat extends CombatMethod {
    start(character, target) {
      const npc = character?.getAsNpc?.();
      this.npc = npc ?? null;
      if (!npc || !Shared.isLiveTitan(npc.getId()) || !target) return;
      if (npc.getAttribute?.(Shared.ATTR_DYING) === true) {
        character.getCombat().setAttackDelay(1);
        return;
      }
      if (core.World.getProcessCycle() < (npc.getAttribute?.(Shared.ATTR_ARMED_AT) ?? 0)) {
        character.getCombat().setAttackDelay(1);
        return;
      }
      const attacks = (npc.getAttribute?.(Shared.ATTR_ATTACKS) ?? 0) + 1;
      npc.setAttribute(Shared.ATTR_ATTACKS, attacks);
      if (Specials.takeBlastTurn(npc, target)) return;
      const choice = pickSpecial(npc, target);
      if (choice === "melee") {
        if (!isAdjacent(npc, target)) {
          Specials.startRow(npc, target);
        } else {
          startMelee(npc, target);
        }
        Specials.maybeShout(npc, "melee");
        return;
      }
      if (choice === "row") {
        Specials.startRow(npc, target);
        Specials.maybeShout(npc, "row");
        return;
      }
      Specials.startMinions(npc, target);
      Specials.maybeShout(npc, "minions");
    }

    hits() {
      return [];
    }

    type() {
      return CombatType.MELEE;
    }

    attackDistance() {
      return 12;
    }

    attackSpeed() {
      return Shared.ATTACK_SPEED_TICKS;
    }
  };
}

/**
 * Damage rules for everything hitting a live titan: poison/venom immunity (Wiki), hits
 * during the death sequence are discarded, and crossing 210 HP teleports both titans
 * (Specials.teleportTitans) unless the hit is lethal.
 */
function modifyHit(event) {
  const { npc, hit } = event;
  if (!npc || !Shared.isLiveTitan(npc.getId?.())) return;
  if (npc.isVenomed?.() || npc.isPoisoned?.()) {
    npc.setVenomed?.(false);
    npc.setPoisonDamage?.(0);
  }
  if (npc.getAttribute?.(Shared.ATTR_DYING) === true) {
    for (const part of hit.getHits?.() ?? []) part.setDamage(0);
    hit.updateTotalDamage?.();
    return;
  }
  const incoming = (hit.getHits?.() ?? []).reduce((sum, part) => sum + (part.getDamage?.() ?? 0), 0);
  const hp = npc.getHitpoints?.() ?? 0;
  const projected = hp - (Number.isFinite(incoming) ? incoming : 0);
  if (projected <= 0) return;
  if (projected <= Shared.TELEPORT_THRESHOLD) Specials.teleportTitans(npc);
}

/**
 * The player's x6 ranged accuracy while the titan is out of melee distance (Wiki): the
 * engine's own roll, six times as likely to land.
 */
function rangedAccuracy(roll) {
  const { attacker, target } = roll;
  if (!attacker?.isPlayer?.() || !target?.isNpc?.()) return;
  if (!Shared.isLiveTitan(target.getId?.())) return;
  const style = roll.combatType;
  const ranged = style === core.CombatType.RANGED
    || (style && style.name === "RANGED");
  if (!ranged) return;
  const base = tileOf(target);
  const pos = tileOf(attacker);
  if (!base || !pos) return;
  if (Shared.edgeDistance(Shared.SIZE, base.x, base.y, pos.x, pos.y) <= 1) return;
  const calculator = core.AccuracyFormulasDpsCalc;
  let accurate = false;
  try {
    accurate = calculator.rollFixedAccuracy(attacker, target, core.CombatType.RANGED, Shared.RANGED_ACCURACY_MULTIPLIER, core.CombatType.RANGED);
  } catch (error) {
    accurate = false;
  }
  if (accurate) roll.forceAccurate = true;
}

function attach(pluginApi) {
  api = pluginApi;
  core = pluginApi.core;
  PrayerHandler = pluginApi.getPrayerHandler();
  pluginApi.onNpcHitModify(modifyHit);
  pluginApi.onCombatHitRoll(rangedAccuracy);
  pluginApi.registerNpcCombatMethodProvider(
    [core.NpcIdentifiers.BRANDA_THE_FIRE_QUEEN, core.NpcIdentifiers.ELDRIC_THE_ICE_KING],
    combatClass(),
    { singleton: false },
  );
}

module.exports = {
  attach, modifyHit, rangedAccuracy, combatClass, isAdjacent, pickSpecial, startMelee,
  _test: { isAdjacent, pickSpecial },
};
