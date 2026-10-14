/**
 * The fire and ice elementals: trios summoned onto adjacent tiles, walking to the player,
 * attacking about every 4 ticks (max 4, Wiki), and detonating ~18 ticks after spawning when
 * unkilled (captured 840 -> explode 858 -> dels 860-864). Player-killed elementals play
 * death01 + the death spotanim instead, all three on one tick when AoE'd.
 *
 * Wiki accuracy: a player's spell hits with (magic accuracy bonus + 30)%, min 30%; the void
 * mage set effect x1.45; Wind Strike always hits. Row tiles clear only to Wave-tier or
 * stronger opposite-element spells (docs assumption 15); anything else (or the wrong
 * element) shows the hint message and does nothing.
 */
const Shared = require("./Shared.RoyalTitans");
const CombatAchievements = require("./CombatAchievements.RoyalTitans");

/** Void mage helms (normal + elite resolutions) for the x1.45 set effect approximation. */
const VOID_MAGE_HELMS = new Set([11663, 11674]);

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

function sessionOf(npc) {
  return npc?.getAttribute?.(Shared.ATTR_ENCOUNTER) ?? null;
}

function tileOf(entity) {
  const at = entity?.getLocation?.();
  return at ? { x: at.getX(), y: at.getY() } : null;
}

const WALKABLE_MASK = 0x1280100;

function isWalkable(x, y) {
  try {
    return (core.RegionManager.getClipping(x, y, 0, null) & WALKABLE_MASK) === 0;
  } catch (error) {
    return true;
  }
}

/** Three elementals on walkable tiles near the caster (falling back around blocked
 * ones, so a trio never spawns half-buried), with spawn anims and a shared fuse group. */
function spawnTrio(session, minionId, tiles) {
  if (!session || session.area?.isDestroyed?.() === true) return;
  const kind = Shared.minionKind(minionId);
  const anims = Shared.MINION_ANIMATIONS[kind];
  const group = core.World.getProcessCycle();
  const spots = [];
  const seen = new Set();
  const take = (x, y) => {
    const key = `${x},${y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (!isWalkable(x, y)) return false;
    spots.push([x, y]);
    return true;
  };
  for (const [x, y] of tiles) {
    if (spots.length >= 3) break;
    if (take(x, y)) continue;
    for (let radius = 1; radius <= 4 && spots.length < 3; radius++) {
      for (let dx = -radius; dx <= radius && spots.length < 3; dx++) {
        for (let dy = -radius; dy <= radius && spots.length < 3; dy++) {
          if (take(x + dx, y + dy)) break;
        }
      }
    }
  }
  while (spots.length < 3 && tiles.length > 0) spots.push(tiles[spots.length % tiles.length]);
  spots.forEach(([x, y], index) => {
    const minion = core.NPC.create(minionId, new core.Location(x, y, 0));
    minion.__skipDefaultRespawn = true;
    minion.setHitpoints?.(Shared.MINION_HITPOINTS);
    minion.getMovementCoordinator?.().setRadius?.(20);
    minion.setFlag?.("combat:close-in");
    minion.setMultiCombat?.(true);
    minion.setAttribute?.(Shared.ATTR_ENCOUNTER, session);
    minion.setAttribute?.(Shared.ATTR_MINION, { kind, group, index });
    minion.setAttribute?.(Shared.ATTR_FUSE_AT, core.World.getProcessCycle() + Shared.MINION_FUSE_TICKS);
    minion.performAnimation(new core.Animation(anims.spawn));
    minion.performGraphic(new core.Graphic(Shared.MINION_SPAWN_GFX[kind]));
    session.area.add(minion);
    core.World.getAddNPCQueue().push(minion);
    session.minions.add(minion);
    // Pin to a player at once: engine aggression would otherwise pick the nearest
    // attackable, which can be a titan standing closer than the player.
    let best = null;
    let bestDistance = Infinity;
    const at = { x, y };
    for (const player of session.players) {
      if (!player?.isRegistered?.()) continue;
      const pos = tileOf(player);
      if (!pos) continue;
      const distance = Math.max(Math.abs(pos.x - at.x), Math.abs(pos.y - at.y));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = player;
      }
    }
    if (best) minion.getCombat?.().attack?.(best);
  });
}

function combatClass() {
  const { CombatMethod, CombatType } = core;

  return class ElementalCombat extends CombatMethod {
    start(character, target) {
      const npc = character?.getAsNpc?.();
      this.npc = npc ?? null;
      if (!npc || !Shared.isMinion(npc.getId()) || !target) return;
      const kind = Shared.minionKind(npc.getId());
      npc.setPositionToFace?.(target.getLocation());
      npc.performAnimation(new core.Animation(Shared.MINION_ANIMATIONS[kind].attack));
    }

    hits(character, target) {
      if (!character || !target) return [];
      const npc = character?.getAsNpc?.() ?? character;
      if (!Shared.isMinion(npc.getId?.())) return [];
      const hit = new core.PendingHit(character, target, this, 0);
      hit.setTotalDamage(Math.min(Shared.MINION_MAX, hit.getTotalDamage()));
      return [hit];
    }

    type() {
      return CombatType.MELEE;
    }

    attackDistance() {
      return 1;
    }

    attackSpeed() {
      return Shared.MINION_SPEED_TICKS;
    }
  };
}

function selectedSpell(player) {
  try {
    const combat = player?.getCombat?.();
    return combat?.getSelectedSpell?.() ?? combat?.getPreviousCast?.() ?? null;
  } catch (error) {
    return null;
  }
}

/** Spell families by identity (CombatSpell carries no name, only spellId). */
let WATER_SPELLS = new Set();
let ICE_SPELLS = new Set();
let FIRE_SPELLS = new Set();
let WAVE_PLUS_SPELLS = new Set();
let WIND_STRIKE_SPELL = null;
/** spellId -> { element, tier }: survives per-cast clones that break identity checks. */
const SPELL_INFO = new Map();

function buildSpellSets() {
  const Spells = core.CombatSpells ?? {};
  const pick = (...names) => new Set(names.map((name) => Spells[name]).filter(Boolean));
  WATER_SPELLS = pick("WATER_STRIKE", "WATER_BOLT", "WATER_BLAST", "WATER_WAVE", "WATER_SURGE");
  ICE_SPELLS = pick("ICE_RUSH", "ICE_BURST", "ICE_BLITZ", "ICE_BARRAGE");
  FIRE_SPELLS = pick("FIRE_STRIKE", "FIRE_BOLT", "FIRE_BLAST", "FIRE_WAVE", "FIRE_SURGE");
  WAVE_PLUS_SPELLS = pick("WATER_WAVE", "WATER_SURGE", "FIRE_WAVE", "FIRE_SURGE", "ICE_BLITZ", "ICE_BARRAGE");
  WIND_STRIKE_SPELL = Spells.WIND_STRIKE ?? null;
  SPELL_INFO.clear();
  try {
    for (const [name, member] of Object.entries(Spells)) {
      const id = member?.spellId?.();
      if (!Number.isInteger(id)) continue;
      let element = null;
      if (/^(WATER|ICE)_/.test(name)) element = "water";
      else if (/^FIRE_/.test(name)) element = "fire";
      if (!element) continue;
      let tier = "other";
      if (/_SURGE$/.test(name)) tier = "surge";
      else if (/_WAVE$/.test(name)) tier = "wave";
      else if (/_BLAST$/.test(name) || /_BLITZ$/.test(name)) tier = "blast";
      else if (/_BOLT$/.test(name) || /_BURST$/.test(name)) tier = "bolt";
      else if (/_STRIKE$/.test(name) || /_RUSH$/.test(name)) tier = "strike";
      SPELL_INFO.set(id, { element, tier });
    }
  } catch (error) {}
}

function spellInfoOf(spell) {
  if (spell == null) return null;
  if (typeof spell === "string") return null;
  try {
    const id = spell.spellId?.();
    if (Number.isInteger(id) && SPELL_INFO.has(id)) return SPELL_INFO.get(id);
  } catch (error) {}
  return null;
}

function spellNameOf(spell) {
  if (typeof spell === "string") return spell;
  if (!spell) return null;
  try {
    for (const [name, member] of Object.entries(core?.CombatSpells ?? {})) {
      if (member === spell) return name;
    }
  } catch (error) {}
  return null;
}

function magicBonus(player) {
  try {
    const bonuses = player?.getBonusManager?.()?.getAttackBonus?.();
    const value = bonuses?.[player?.getCore?.()?.BonusManager?.ATTACK_MAGIC ?? 3] ?? bonuses?.[3];
    return Number.isFinite(value) ? value : 0;
  } catch (error) {
    return 0;
  }
}

function wearingVoidMage(player) {
  try {
    const { Equipment } = core;
    const helm = player?.getEquipment?.()?.get?.(Equipment.HEAD_SLOT)?.getId?.() ?? -1;
    return VOID_MAGE_HELMS.has(helm);
  } catch (error) {
    return false;
  }
}

/**
 * Elemental spell accuracy (Wiki): (magic accuracy bonus + 30)%, min 30%, void mage x1.45,
 * Wind Strike always hits. A failed custom roll zeroes the hit in modifyHit.
 * Also stashes the cast spell on the attacker: by the time a hit lands, the selected
 * spell is already cleared, so row clearing reads the stash (fresh within 6 ticks).
 */
function elementalAccuracy(roll) {
  const { attacker, target } = roll;
  if (!attacker?.isPlayer?.()) return;
  const cast = selectedSpell(attacker);
  if (cast) {
    try {
      attacker.__royalSpell = { spell: cast, tick: core.World.getProcessCycle() };
    } catch (error) {}
  }
  if (!target?.isNpc?.()) return;
  if (!Shared.isMinion(target.getId?.())) return;
  const spell = selectedSpell(attacker);
  if (!spell) return;
  try {
    const windId = WIND_STRIKE_SPELL?.spellId?.();
    if (Number.isInteger(windId) && spell?.spellId?.() === windId) {
      roll.forceAccurate = true;
      return;
    }
  } catch (error) {}
  let chance = magicBonus(attacker) + Shared.ELEMENTAL_HIT_BONUS;
  if (wearingVoidMage(attacker)) chance *= 1.45;
  chance = Math.max(Shared.ELEMENTAL_HIT_MIN, Math.min(100, chance));
  if (Math.random() * 100 < chance) {
    roll.forceAccurate = true;
    // Opposite-element hits on elementals land their max hit (Wiki: one Wave kill).
    const kind = Shared.minionKind(target.getId());
    const element = spellElement(spell);
    if ((kind === "fire" && element === "water") || (kind === "ice" && element === "fire")) {
      roll.forceMaxHit = true;
    }
  } else {
    roll.__royalMiss = true;
  }
}

/**
 * Elemental weakness damage (Wiki): opposite-element spells deal double to elementals
 * (100%) and +50% to titans (50%), rounded down like demonbane. Max-hit forcing for the
 * one-shot Wave kills happens at roll time (elementalAccuracy).
 */
function weaknessDamage(entity, baseHit) {
  try {
    if (!entity?.isPlayer?.() || !Number.isFinite(baseHit)) return baseHit;
    const target = entity.getCombat?.().getTarget?.();
    const id = target?.isNpc?.() ? target.getId?.() : null;
    if (id !== Shared.BRANDA_ID && id !== Shared.ELDRIC_ID
      && id !== Shared.FIRE_MINION_ID && id !== Shared.ICE_MINION_ID) return baseHit;
    const spell = selectedSpell(entity);
    if (!spell) return baseHit;
    const element = spellElement(spell);
    const weakTo = id === Shared.BRANDA_ID || id === Shared.FIRE_MINION_ID ? "water" : "fire";
    if (element !== weakTo) return baseHit;
    if (id === Shared.FIRE_MINION_ID || id === Shared.ICE_MINION_ID) return baseHit * 2;
    return baseHit + Math.floor(baseHit / 2);
  } catch (error) {
    return baseHit;
  }
}

/** The spell stashed at roll time, if the cast is still in flight. */
function recentSpell(attacker) {
  try {
    const noted = attacker?.__royalSpell ?? null;
    if (!noted || !noted.spell) return null;
    if (core.World.getProcessCycle() - (noted.tick ?? -99) > 6) return null;
    return noted.spell;
  } catch (error) {
    return null;
  }
}

function spellTier(spell) {
  const info = spellInfoOf(spell);
  if (info) return info.tier;
  const name = spellNameOf(spell);
  if (!name) return "other";
  if (WAVE_PLUS_SPELLS.has(spell)) return name.endsWith("_SURGE") ? "surge" : "wave";
  if (/_SURGE$/.test(name)) return "surge";
  if (/_WAVE$/.test(name)) return "wave";
  if (/_BLAST$/.test(name) || /_BLITZ$/.test(name)) return "blast";
  if (/_BOLT$/.test(name) || /_BURST$/.test(name)) return "bolt";
  if (/_STRIKE$/.test(name) || /_RUSH$/.test(name)) return "strike";
  return "other";
}

function spellElement(spell) {
  if (!spell) return "other";
  const info = spellInfoOf(spell);
  if (info) return info.element;
  if (FIRE_SPELLS.has(spell)) return "fire";
  if (WATER_SPELLS.has(spell) || ICE_SPELLS.has(spell)) return "water";
  const name = spellNameOf(spell);
  if (!name) return "other";
  if (/^FIRE_/.test(name)) return "fire";
  if (/^WATER_/.test(name) || /^ICE_/.test(name)) return "water";
  return "other";
}

/** Row tiles clear to opposite-element spells (Yama-surge precedent: any tier works).
 * Anything else (or the wrong element) shows the hint message and does nothing. */
function rowClearingHit(event) {
  const { npc, hit } = event;
  try {
    console.info(`[royal-diag] hitmodify id=${npc?.getId?.()} attacker=${hit?.getAttacker?.()?.isPlayer?.()}`);
  } catch (error) {}
  if (!npc || !Shared.isRowHitbox(npc.getId?.())) return;
  const attacker = hit?.getAttacker?.();
  if (!attacker?.isPlayer?.()) return;
  const session = sessionOf(npc);
  const kind = npc.getId() === Shared.FIRE_ROW_ID ? "fire" : "ice";
  const spell = selectedSpell(attacker) ?? recentSpell(attacker);
  const element = spellElement(spell);
  const tier = spellTier(spell);
  const opposite = kind === "fire" ? element === "water" : element === "fire";
  if (!opposite) {
    for (const part of hit.getHits?.() ?? []) part.setDamage(0);
    hit.updateTotalDamage?.();
    if (hit.__royalHint !== true) {
      hit.__royalHint = true;
      attacker.sendMessage(kind === "fire" ? Shared.FIRE_HINT : Shared.ICE_HINT);
    }
    return;
  }
  for (const part of hit.getHits?.() ?? []) part.setDamage(1);
  hit.updateTotalDamage?.();
  hit.__royalClear = true;
}

function rowHitLanded(event) {
  const { npc, hit } = event;
  if (!npc || !Shared.isRowHitbox(npc.getId?.())) return;
  if (hit.__royalClear !== true) return;
  const session = sessionOf(npc);
  if (!session) return;
  hit.__royalClear = false;
  const at = tileOf(npc);
  if (!at || !session.rows.has(Shared.tileKey(at.x, at.y))) return;
  require("./Specials.RoyalTitans").clearRowTile(session, npc, true);
}

/** Custom misses (elemental accuracy) land as zero. */
function applyMiss(event) {
  const { npc, hit } = event;
  if (!npc || !Shared.isMinion(npc.getId?.())) return;
  if (hit.__royalMiss !== true) return;
  for (const part of hit.getHits?.() ?? []) part.setDamage(0);
  hit.updateTotalDamage?.();
}

/** Player-killed elementals burst into their death graphic; expiry is silent. */
function minionDied(event) {
  const { npc, killer } = event;
  if (!npc || !Shared.isMinion(npc.getId?.())) return;
  const session = sessionOf(npc);
  session?.minions?.delete(npc);
  const kind = Shared.minionKind(npc.getId());
  npc.performGraphic(new core.Graphic(Shared.MINION_DEATH_GFX[kind]));
  const player = killer?.isPlayer?.() ? killer.getAsPlayer() : null;
  if (player && session) CombatAchievements.minionKilledBy(player, session, npc);
}

/** Any resolved player -> elemental hit counts as attacking one (Elemental Company). */
function hitResolved({ attacker, target }) {
  if (!attacker?.isPlayer?.() || !target?.isNpc?.()) return;
  if (!Shared.isMinion(target.getId?.())) return;
  const session = sessionOf(target);
  if (session) CombatAchievements.minionAttacked(attacker.getAsPlayer(), session);
}

/**
 * The fuse: the first minion of a trio to expire plays the explode anim + spot graphic and
 * deals small area damage; its trio-mates despawn silently over the next ticks (captured).
 */
function explodeTrio(session, minion) {
  const mine = sessionOf(minion) === session ? minion : null;
  if (!mine) return;
  const group = mine.getAttribute?.(Shared.ATTR_MINION)?.group;
  const kind = Shared.minionKind(mine.getId());
  const anims = Shared.MINION_ANIMATIONS[kind];
  const at = tileOf(mine);
  mine.performAnimation(new core.Animation(anims.explode));
  if (at) {
    const first = session.players[0];
    first?.getPacketSender?.()?.sendGlobalGraphic(
      (() => {
        const gfx = new core.Graphic(Shared.MINION_EXPLODE_GFX[kind]);
        return gfx;
      })(),
      new core.Location(at.x, at.y, 0),
    );
    for (const player of session.players) {
      if (!alive(player)) continue;
      const pos = tileOf(player);
      if (!pos || Math.max(Math.abs(pos.x - at.x), Math.abs(pos.y - at.y)) > 1) continue;
      const damage = core.Misc.getRandom(Shared.EXPLODE_MAX);
      if (damage <= 0) continue;
      player.getCombat().getHitQueue().addPendingDamage([new core.HitDamage(damage, core.HitMask.RED)]);
      CombatAchievements.avoidableDamage(player, damage, "explode");
    }
  }
  session.minions.delete(mine);
  if (mine.isRegistered?.()) core.World.getRemoveNPCQueue().push(mine);
  let delay = 1;
  for (const sibling of [...session.minions]) {
    if (sibling.getAttribute?.(Shared.ATTR_MINION)?.group !== group) continue;
    session.minions.delete(sibling);
    later(delay, sibling, () => {
      if (sibling.isRegistered?.()) core.World.getRemoveNPCQueue().push(sibling);
    });
    delay += 1;
  }
}

function tickSession(session) {
  if (!session) return;
  const now = core.World.getProcessCycle();
  for (const minion of [...session.minions]) {
    if (!alive(minion)) {
      session.minions.delete(minion);
      continue;
    }
    // Elementals attack the player, never the other titan (Wiki): pin them to one.
    const target = minion.getCombat?.().getTarget?.() ?? null;
    const targetPlayer = target?.isPlayer?.() ? target.getAsPlayer?.() ?? target : null;
    if (!targetPlayer || !session.players.some((member) => {
      try {
        return (member?.getUsername?.() ?? member) === (targetPlayer?.getUsername?.() ?? targetPlayer);
      } catch (error) {
        return false;
      }
    })) {
      let best = null;
      let bestDistance = Infinity;
      const at = tileOf(minion);
      for (const player of session.players) {
        if (!alive(player)) continue;
        const pos = tileOf(player);
        if (!pos) continue;
        const distance = Math.max(Math.abs(pos.x - at.x), Math.abs(pos.y - at.y));
        if (distance < bestDistance) {
          bestDistance = distance;
          best = player;
        }
      }
      if (best) minion.getCombat?.().attack?.(best);
    }
    const fuseAt = minion.getAttribute?.(Shared.ATTR_FUSE_AT) ?? Infinity;
    if (now >= fuseAt) explodeTrio(session, minion);
  }
}

function attach(pluginApi) {
  api = pluginApi;
  core = pluginApi.core;
  PrayerHandler = pluginApi.getPrayerHandler();
  pluginApi.onCombatHitRoll(elementalAccuracy);
  pluginApi.onNpcHitModify(rowClearingHit);
  pluginApi.onNpcHitModify(applyMiss);
  pluginApi.onNpcHitModify(rowHitLanded);
  pluginApi.onNpcDeath(minionDied);
  pluginApi.onCombatHitResolved(hitResolved);
  pluginApi.registerMagicHitModifier(weaknessDamage);
  buildSpellSets();
  pluginApi.registerNpcCombatMethodProvider(
    [core.NpcIdentifiers.FIRE_ELEMENTAL_2, core.NpcIdentifiers.ICE_ELEMENTAL],
    combatClass(),
    { singleton: false },
  );
}

module.exports = {
  attach, spawnTrio, tickSession, explodeTrio, elementalAccuracy, rowClearingHit,
  minionDied, hitResolved, weaknessDamage,
  _test: { spellTier, spellElement },
};
