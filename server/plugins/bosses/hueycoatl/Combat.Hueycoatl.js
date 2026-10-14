/**
 * The Hueycoatl head's combat: free-mix melee/magic/range autos (Rain Fire feathers with
 * the colour tells), glowing symbols, and the hit rules (tail cap lives in modifyHit).
 *
 * As captured: the head mixes all three styles freely (46/119 attempts show each in the
 * same windows); autos land ~+4 ticks after the attack action with the slot-0 charge
 * spotanim, the projectile and the player-slot-2 impact. Correct overhead cuts Rain Fire
 * to 0-2, else up to 14 (Wiki). Symbols (55209 + prayer_02, delay 120) strike standing
 * players for up to 16 after 4 ticks. P4 runs the same kit faster.
 */
const Shared = require("./Shared.Hueycoatl");

const STYLE_ANIMS = Object.freeze({
  melee: { anim: "huey_attack_melee", animId: 11669, spotId: 11708, projId: 11709, impactId: 11710 },
  magic: { anim: "huey_attack_magic", animId: 11671, spotId: 11712, projId: 11713, impactId: 11714 },
  ranged: { anim: "huey_attack_range", animId: 11670, spotId: 11716, projId: 11717, impactId: 11718 },
});
const STYLE_PRAYER = Object.freeze({ melee: "melee", magic: "magic", ranged: "missiles" });
const SYMBOL_RANGE_TILES = 12;

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
  return at ? { x: at.getX(), y: at.getY(), z: at.getZ?.() ?? 0 } : null;
}

/** Crush attack bonus the highest of the three (Wiki tail-cap rule), from bonus maps. */
function crushHighest(bonuses) {
  if (!bonuses) return false;
  return (bonuses.crush ?? -Infinity) >= (bonuses.stab ?? -Infinity)
    && (bonuses.crush ?? -Infinity) >= (bonuses.slash ?? -Infinity);
}

function attackerBonuses(player) {
  try {
    const manager = player?.getBonusManager?.();
    if (manager) {
      return {
        stab: manager.getAttackBonus?.(0) ?? manager.getStabBonus?.() ?? null,
        slash: manager.getAttackBonus?.(1) ?? manager.getSlashBonus?.() ?? null,
        crush: manager.getAttackBonus?.(2) ?? manager.getCrushBonus?.() ?? null,
      };
    }
  } catch (error) { /* fall through */ }
  return null;
}

function prayedAgainst(player, style) {
  try {
    const handler = PrayerHandler;
    const kind = STYLE_PRAYER[style];
    const id = kind === "melee" ? handler.PROTECT_FROM_MELEE
      : kind === "missiles" ? handler.PROTECT_FROM_MISSILES
        : handler.PROTECT_FROM_MAGIC;
    return handler.isActivated(player, id);
  } catch (error) {
    return false;
  }
}

/** One Rain Fire auto in the given style: anim + charge graphic, then the impact. */
function startAuto(npc, target, style) {
  const set = STYLE_ANIMS[style];
  npc.performAnimation?.(new core.Animation(set.animId));
  npc.performGraphic?.(new core.Graphic(set.spotId));
  const session = npc.getAttribute?.(Shared.ATTR_SESSION) ?? null;
  later(Shared.AUTO_DELAY_TICKS, target, () => {
    if (!alive(npc) || npc.getAttribute?.(Shared.ATTR_DYING) === true) return;
    if (!alive(target)) return;
    target.performGraphicInSlot?.(2, new core.Graphic(set.impactId));
    const protect = target.isPlayer?.() && prayedAgainst(target.getAsPlayer(), style);
    const damage = protect
      ? core.Misc.getRandom(2)
      : core.Misc.getRandom(Shared.RAIN_FIRE_MAX);
    if (damage > 0) {
      target.getCombat().getHitQueue().addPendingDamage([new core.HitDamage(damage, core.HitMask.RED)]);
    }
    if (session && typeof session.autos === "number") session.autos += 1;
  });
}

/** Glowing symbols: arena-wide fixed-pattern picks (captured: weak player anchoring,
 * 3-spaced hot grid). Up to 8 tiles per cast inside the mapped bounds. */
function startSymbols(npc, target) {
  const picked = [];
  const seen = new Set();
  let guard = 0;
  while (picked.length < 8 && guard++ < 60) {
    const x = Shared.SYMBOL_BOUNDS.x0 + Math.floor(Math.random() * (Shared.SYMBOL_BOUNDS.x1 - Shared.SYMBOL_BOUNDS.x0 + 1));
    const y = Shared.SYMBOL_BOUNDS.y0 + Math.floor(Math.random() * (Shared.SYMBOL_BOUNDS.y1 - Shared.SYMBOL_BOUNDS.y0 + 1));
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push([x, y]);
  }
  for (const [x, y] of picked) {
    try {
      target.getPacketSender?.().sendGraphic?.(new core.Graphic(Shared.ANIMS.symbolTile), new core.Location(x, y, 0));
    } catch (error) { /* headless */ }
  }
  later(Shared.SYMBOL_FORM_TICKS, target, () => {
    if (!alive(npc)) return;
    const here = tileOf(target);
    if (!here) return;
    if (!picked.some(([x, y]) => x === here.x && y === here.y)) return;
    const damage = core.Misc.getRandom(Shared.SYMBOL_MAX);
    if (damage > 0 && alive(target)) {
      target.getCombat().getHitQueue().addPendingDamage([new core.HitDamage(damage, core.HitMask.RED)]);
    }
  });
}

function pickStyle() {
  const roll = Math.random();
  if (roll < 0.34) return "melee";
  if (roll < 0.67) return "magic";
  return "ranged";
}

function combatClass() {
  const { CombatMethod, CombatType } = core;

  return class HueycoatlCombat extends CombatMethod {
    start(character, target) {
      const npc = character?.getAsNpc?.();
      this.npc = npc ?? null;
      if (!npc || !target) return;
      if (npc.getId?.() === Shared.TAIL_ID) {
        const TailPhase = require("./TailPhase.Hueycoatl");
        TailPhase.startShockwave(npc, target);
        return;
      }
      if (npc.getId?.() !== Shared.HEAD_ID && npc.getId?.() !== Shared.HEAD_INVULNERABLE_ID) return;
      if (npc.getAttribute?.(Shared.ATTR_DYING) === true) {
        character.getCombat().setAttackDelay(1);
        return;
      }
      const phase = npc.getAttribute?.(Shared.ATTR_PHASE) ?? 2;
      if (phase !== 2 && phase !== 4) {
        character.getCombat().setAttackDelay(2);
        return;
      }
      if (Math.random() < 0.25) startSymbols(npc, target);
      else startAuto(npc, target, pickStyle());
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
      const phase = this.npc?.getAttribute?.(Shared.ATTR_PHASE) ?? 2;
      return phase === 4 ? 3 : 4;
    }
  };
}

/**
 * Hit rules: poison/venom immunity (Wiki), dying hits discarded, the 50% shield trip,
 * and the tail damage cap (4, 9 with crush-highest, misses floored to 1).
 */
function modifyHit(event) {
  const { npc, hit, attacker } = event;
  if (!npc) return;
  const id = npc.getId?.();
  if (id !== Shared.HEAD_ID && id !== Shared.TAIL_ID && id !== Shared.BODY_ID) return;
  if (npc.isVenomed?.() || npc.isPoisoned?.()) {
    npc.setVenomed?.(false);
    npc.setPoisonDamage?.(0);
  }
  if (npc.getAttribute?.(Shared.ATTR_DYING) === true) {
    for (const part of hit.getHits?.() ?? []) part.setDamage(0);
    hit.updateTotalDamage?.();
    return;
  }
  if (id === Shared.HEAD_INVULNERABLE_ID) {
    for (const part of hit.getHits?.() ?? []) part.setDamage(0);
    hit.updateTotalDamage?.();
    return;
  }
  if (id === Shared.HEAD_ID) {
    const incoming = (hit.getHits?.() ?? []).reduce((sum, part) => sum + (part.getDamage?.() ?? 0), 0);
    const hp = npc.getHitpoints?.() ?? 0;
    const projected = hp - (Number.isFinite(incoming) ? incoming : 0);
    if (projected > 0 && projected <= Shared.SHIELD_THRESHOLD) {
      const TailPhase = require("./TailPhase.Hueycoatl");
      TailPhase.raiseShield(npc);
    }
    return;
  }
  const Pillars = require("./Pillars.Hueycoatl");
  let session = npc.getAttribute?.(Shared.ATTR_SESSION) ?? null;
  if (attacker?.isPlayer?.()) {
    try {
      const Area = require("./Area.Hueycoatl");
      const player = attacker.getAsPlayer();
      if (!session) {
        session = Area.ensureSession(player, false);
        npc.setAttribute?.(Shared.ATTR_SESSION, session);
        if (id === Shared.HEAD_ID && !session.head) session.head = npc;
      }
      Area.trackPlayer(session, player);
    } catch (error) { /* sessionless */ }
  }
  if (attacker?.isPlayer?.() && session && Pillars.damageMultiplier(session) > 1) {
    for (const part of hit.getHits?.() ?? []) {
      part.setDamage(Math.floor((part.getDamage?.() ?? 0) * Pillars.damageMultiplier(session)));
    }
    hit.updateTotalDamage?.();
  }
  if (id === Shared.TAIL_ID) {
    const cap = crushHighest(attackerBonuses(attacker?.isPlayer?.() ? attacker.getAsPlayer() : attacker)) ? Shared.TAIL_CAP_CRUSH : Shared.TAIL_CAP;
    for (const part of hit.getHits?.() ?? []) {
      const rolled = part.getDamage?.() ?? 0;
      part.setDamage(rolled <= 0 ? 1 : Math.min(rolled, cap));
    }
    hit.updateTotalDamage?.();
  }
}

/** A live encounter must never regenerate (the engine heals an NPC unattacked for 20s). */
function keepAlive(roll) {
  const { attacker, target } = roll ?? {};
  const npc = attacker?.isNpc?.() ? attacker : target?.isNpc?.() ? target : null;
  if (!npc || !Shared.isFighter(npc.getId?.())) return;
  const session = npc.getAttribute?.(Shared.ATTR_SESSION) ?? null;
  const fighters = [];
  if (session) {
    if (session.head) fighters.push(session.head);
    if (session.tail) fighters.push(session.tail);
    for (const segment of session.segments ?? []) fighters.push(segment);
  } else {
    fighters.push(npc);
  }
  for (const fighter of fighters) {
    try {
      fighter?.getCombat?.()?.getLastAttack?.()?.reset?.();
    } catch (error) { /* best effort */ }
  }
}

function attach(pluginApi) {
  api = pluginApi;
  core = pluginApi.core;
  PrayerHandler = pluginApi.getPrayerHandler();
  pluginApi.onCombatHitRoll(keepAlive);
  pluginApi.onNpcHitModify(modifyHit);
  pluginApi.registerNpcCombatMethodProvider(
    [core.NpcIdentifiers.THE_HUEYCOATL, core.NpcIdentifiers.HUEYCOATL_TAIL, core.NpcIdentifiers.HUEYCOATL_BODY],
    combatClass(),
    { singleton: false },
  );
}

module.exports = {
  attach, modifyHit, combatClass, crushHighest, prayedAgainst, startAuto, startSymbols, pickStyle,
  STYLE_ANIMS, STYLE_PRAYER,
  _test: { crushHighest, pickStyle },
};
