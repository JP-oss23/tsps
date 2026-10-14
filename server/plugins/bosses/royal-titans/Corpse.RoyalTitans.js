/**
 * Titan deaths, the claim-anchored corpse schedule and contribution loot.
 *
 * As captured: the final blows land on one tick and the same tick brings the kill count
 * (varp total_royal_titan_kills, 4648), the duration and "eligible to take loot from
 * either" for each player; both titans swap to their corpse forms on their static tiles.
 * Each player claims ONE corpse with one option; the other (or a second) claim is refused
 * with "not worthy". op1 on Eldric at 1825 turned drops out at 1830 (5 ticks). Everything
 * after the kill is anchored to the claim: reinvigorate +3/+5, drops +5, corpse death
 * anims + floors +23/+26, dels +5 later, fresh spawns +2/+3 after that (both fights).
 *
 * Contribution (Wiki): whole-percent share of combined titan damage (recoil counts,
 * elementals do not; poison/burn/thralls do not). Loot scales linearly above 1%, yields 1
 * of each item below 1% (1-11 damage), nothing at zero. Pet/clue rates ignore contribution.
 * Sacrifice forfeits drops (clues kept — estimate) for a doubled pet rate (miss:
 * "You don't feel lucky..."); Take pages gives 10-19 desiccated pages (possible from 72
 * damage, guaranteed at 120 — estimated thresholds, docs assumption) plus tertiary. Corpse
 * options [Loot, null, Sacrifice, Take pages] confirmed by cache dump and live clicks.
 */
const Shared = require("./Shared.RoyalTitans");
const CombatAchievements = require("./CombatAchievements.RoyalTitans");

/** Desiccated pages (both tables roll this id). */
const PAGES_ITEM_ID = 30640;
const BRAN_ITEM_ID = 30622;
const SACRIFICE_PET_RATE = 1500;
/** Below 1% share (1-11 damage of 1200) rolls twice but yields 1 of each (Wiki). */
const MIN_SHARE_PERCENT = 0.01;
/** Take pages: possible from ~72 damage, guaranteed at 120 (Wiki; estimated mapping). */
const PAGES_MIN_DAMAGE = 72;
const PAGES_FULL_DAMAGE = 120;

let api = null;
let core = null;

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

/** Whole-percent share of one player's combined titan damage (Wiki). */
function shareOf(session, player) {
  if (!session || !player) return 0;
  let mine = 0;
  let total = 0;
  for (const titan of [session.branda, session.eldric]) {
    const dealt = titan?.getAttribute?.(Shared.ATTR_DAMAGE_DEALT) ?? null;
    if (!dealt) continue;
    for (const [key, amount] of Object.entries(dealt)) {
      total += amount;
      if (key === keyOf(player)) mine += amount;
    }
  }
  if (total <= 0 || mine <= 0) return 0;
  return Math.floor((mine * 100) / total) / 100;
}

function keyOf(player) {
  return player?.getUsername?.() ?? String(player);
}

/** Every player-attributed hit on a live titan feeds contribution (Wiki: recoil counts). */
function trackDamage({ attacker, target, hit }) {
  if (!attacker?.isPlayer?.() || !target?.isNpc?.()) return;
  if (!Shared.isLiveTitan(target.getId?.())) return;
  const damage = hit?.getTotalDamage?.() ?? 0;
  if (!(damage > 0)) return;
  const dealt = target.getAttribute?.(Shared.ATTR_DAMAGE_DEALT) ?? {};
  const key = keyOf(attacker.getAsPlayer());
  dealt[key] = (dealt[key] ?? 0) + damage;
  target.setAttribute(Shared.ATTR_DAMAGE_DEALT, dealt);
}

/** First titan down: corpse now, lootable only once both are down (estimate). Deaths are
 * counted on the session's two principals, so order and timing cannot lose the kill. */
function titanDied(event) {
  const { npc } = event;
  if (!npc || !Shared.isLiveTitan(npc.getId?.())) return;
  const session = sessionOf(npc);
  if (!session || session.over === true) return;
  if (npc !== session.branda && npc !== session.eldric) {
    // Stray duplicate from a raced spawn: remove it, it is not part of the fight.
    if (npc.isRegistered?.()) core.World.getRemoveNPCQueue().push(npc);
    return;
  }
  event.remains = { ticks: 200 };
  npc.setAttribute?.(Shared.ATTR_DYING, true);
  npc.getCombat?.().reset?.();
  const corpseId = npc.getId() === Shared.BRANDA_ID ? Shared.BRANDA_CORPSE_ID : Shared.ELDRIC_CORPSE_ID;
  npc.setNpcTransformationId(corpseId);
  npc.performAnimation(new core.Animation(npc.getId() === Shared.BRANDA_ID ? Shared.BRANDA_ANIMATIONS.inactive : Shared.ELDRIC_ANIMATIONS.inactive));
  npc.setHitpoints?.(1);
  if (npc === session.branda) session.brandaDown = true;
  else session.eldricDown = true;
  if (!session.brandaDown || !session.eldricDown) return;
  killPair(session);
}

/** Both titans down: messages now, claims open, fallback schedule for no claim (estimate). */
function killPair(session) {
  if (!session || session.over === true) return;
  session.over = true;
  session.killId = (session.killId ?? 0) + 1;
  session.claims = null;
  session.claimedBy = null;
  session.corpses = [session.branda, session.eldric].filter(Boolean);
  for (const npc of session.corpses) npc.__royalKillId = session.killId;
  const now = core.World.getProcessCycle();
  const ticks = Math.max(0, now - (session.spawnedAt ?? now) - 3);
  require("./Specials.RoyalTitans").endFight(session);
  require("./Hud.RoyalTitans").killed(session);
  // Base respawn even if nobody claims (the claim chain brings it forward).
  session.respawnAt = now + 19 + Shared.CLAIM_SPAWN_TICKS;
  for (const player of [...session.players]) {
    if (!alive(player)) continue;
    recordKill(player, session, ticks);
  }
  const Area = require("./Area.RoyalTitans");
  Area.world.kills += 1;
  if (Area.world.best <= 0 || ticks < Area.world.best) Area.world.best = ticks;
  // Unclaimed fallback (estimate): same offsets from kill+19, minus message and drops.
  later(19 + Shared.CLAIM_DEATH_TICKS, session.branda, () => {
    if (session.claimedBy || session.area?.isDestroyed?.() === true) return;
    corpseDeathAnims(session);
  });
  later(19 + Shared.CLAIM_REMOVE_TICKS, session.branda, () => {
    if (session.claimedBy || session.area?.isDestroyed?.() === true) return;
    removeCorpses(session);
  });
  later(19 + Shared.CLAIM_SPAWN_TICKS, session.branda, () => {
    if (session.claimedBy || session.area?.isDestroyed?.() === true) return;
    session.respawnAt = core.World.getProcessCycle();
  });
}

function recordKill(player, session, ticks) {
  const own = (Number(player.getAttribute?.(Shared.ATTR_KILLS)) || 0) + 1;
  const total = CombatAchievements.killed(player, session, own, (kills) => announceKill(player, kills, ticks));
  player.setAttribute?.(Shared.ATTR_KILLS, Math.max(own, total ?? 0));
  if (total == null) player.getPacketSender().sendConfig(Shared.TOTAL_KILLS_VARP, own);
}

function announceKill(player, kills, ticks) {
  player.sendMessage(`Your Royal Titans kill count is: <col=ff0000>${kills}</col>.`);
  const best = Number(player.getAttribute(Shared.ATTR_BEST_TICKS)) || 0;
  if (!best || ticks < best) {
    player.setAttribute(Shared.ATTR_BEST_TICKS, ticks);
    player.sendMessage(`Fight duration: <col=ff0000>${Shared.formatTicks(ticks)}</col> (new personal best)`);
  } else {
    player.sendMessage(`Fight duration: <col=ff0000>${Shared.formatTicks(ticks)}</col>. Personal best: ${Shared.formatTicks(best)}`);
  }
  player.sendMessage(Shared.ELIGIBLE_MESSAGE);
}

/** The engine's death roll, stashed per titan until its claim (Araxxor pattern). */
function stashGenerated(event) {
  const session = sessionOf(event?.npc);
  if (!session || !Array.isArray(event.drops)) return;
  const id = event.npcId ?? event.npc?.getId?.();
  if (id !== Shared.BRANDA_ID && id !== Shared.ELDRIC_ID) return;
  event.handled = true;
  session.stash = session.stash ?? {};
  session.stash[id] = event.drops ?? [];
}

function validCorpse(npc, session) {
  if (!npc || !Shared.isCorpse(npc.getId()) || !session || session.over !== true) return false;
  if (!npc.isRegistered?.()) return false;
  // Stamped at the kill: lingering corpses from a previous kill are never claimable.
  if (npc.__royalKillId !== session.killId) return false;
  return true;
}

function unworthy(player, npc, option) {
  const name = npc.getId() === Shared.BRANDA_CORPSE_ID ? "Branda the Fire Queen" : "Eldric the Ice King";
  const verb = option === "Loot" ? "loot" : option === "Sacrifice" ? "sacrifice" : "take pages from";
  player.sendMessage(`You do not feel worthy enough to ${verb} ${name}.`);
}

/** Scale a stash by contribution share (Wiki); pet/clues pass through untouched. */
function scaleDrops(drops, share, keepAlways) {
  const out = [];
  for (const drop of drops ?? []) {
    if (drop.itemId === PAGES_ITEM_ID) {
      if (keepAlways) out.push({ ...drop });
      continue;
    }
    if (share <= 0) continue;
    if (drop.itemId === BRAN_ITEM_ID || /clue scroll/i.test(drop.name ?? "")) {
      out.push({ ...drop });
      continue;
    }
    const scaled = share >= MIN_SHARE_PERCENT ? Math.max(1, Math.round(drop.amount * share)) : 1;
    if (scaled > 0) out.push({ ...drop, amount: scaled });
  }
  return out;
}

/** Turns drops into the player's inventory, excess to the floor (Araxxor pattern). */
function spawnDrops(player, session, drops) {
  const { Item, ItemDefinition } = core;
  const manager = api.getItemOnGroundManager();
  const corpse = session.branda?.isRegistered?.() ? session.branda : session.eldric;
  const where = corpse?.getLocation?.() ?? player.getLocation?.();
  if (!where) return;
  const area = session.area ?? null;
  const inventory = player.getInventory?.() ?? null;
  for (const drop of drops ?? []) {
    if (!Number.isInteger(drop.itemId) || drop.amount <= 0) continue;
    const noteId = ItemDefinition.forId(drop.itemId).getNoteId();
    const itemId = drop.noted && noteId >= 0 && ItemDefinition.forId(noteId).isNoted() ? noteId : drop.itemId;
    const stackable = ItemDefinition.forId(itemId).isStackable();
    if (inventory) {
      if (stackable && (inventory.contains(itemId) || inventory.getFreeSlots() > 0)) {
        inventory.adds(itemId, drop.amount);
        continue;
      }
      if (!stackable && inventory.getFreeSlots() >= drop.amount) {
        inventory.adds(itemId, drop.amount);
        continue;
      }
    }
    if (stackable) {
      manager.registerLocation(player, new Item(itemId, drop.amount), where, area);
    } else {
      for (let index = 0; index < drop.amount; index++) {
        manager.registerLocation(player, new Item(itemId, 1), where, area);
      }
    }
  }
}

/** One claim per player per kill: which corpse and option, or the refusal. */
function claim({ player, npc, option }) {
  player = Shared.resolvePlayer(core, player);
  const session = sessionOf(npc);
  if (!validCorpse(npc, session)) return false;
  session.claims = session.claims ?? new Map();
  if (session.claims.has(keyOf(player))) {
    unworthy(player, npc, option);
    return true;
  }
  session.claims.set(keyOf(player), { corpse: npc.getId(), option });
  if (!session.claimedBy) {
    session.claimedBy = keyOf(player);
    startClaimSchedule(session);
  }
  const share = shareOf(session, player);
  if (option === "Loot") loot(player, session, npc, share);
  else if (option === "Sacrifice") sacrifice(player, session, npc);
  else pages(player, session, npc, share);
  return true;
}

/** Loot: two primary rolls (death roll + one extra), scaled; no pages; tertiary as rolled. */
function loot(player, session, npc, share) {
  const id = npc.getId() === Shared.BRANDA_CORPSE_ID ? Shared.BRANDA_ID : Shared.ELDRIC_ID;
  const stash = (session.stash ?? {})[id] ?? [];
  const extra = { player, npc, npcId: id, rolls: 1, drops: [] };
  api.emitCustomEvent("npc-drops:extra-rolls", extra);
  const drops = scaleDrops([...stash, ...extra.drops], share, false);
  player.performAnimation(new core.Animation(2282));
  later(Shared.CLAIM_LOOT_TICKS, npc, () => {
    if (!player.isRegistered?.()) return;
    api.emitCustomEvent("npc-drops:roll", { player, npc, npcId: id, drops });
    spawnDrops(player, session, drops);
  });
}

/** Sacrifice: forfeit drops (clues kept), Bran at 1/1500. */
function sacrifice(player, session, npc) {
  const id = npc.getId() === Shared.BRANDA_CORPSE_ID ? Shared.BRANDA_ID : Shared.ELDRIC_ID;
  const stash = (session.stash ?? {})[id] ?? [];
  const clues = stash.filter((drop) => /clue scroll/i.test(drop.name ?? ""));
  player.performAnimation(new core.Animation(2282));
  later(Shared.CLAIM_LOOT_TICKS, npc, () => {
    if (!player.isRegistered?.()) return;
    const drops = [...clues];
    if (Math.random() < 1 / SACRIFICE_PET_RATE) {
      drops.push({ itemId: BRAN_ITEM_ID, amount: 1 });
    } else {
      player.sendMessage(Shared.SACRIFICE_MISS);
    }
    api.emitCustomEvent("npc-drops:roll", { player, npc, npcId: id, drops });
    spawnDrops(player, session, drops);
  });
}

/** Take pages: 10-19 desiccated pages (estimated scaling) plus tertiary as rolled. */
function pages(player, session, npc, share) {
  const id = npc.getId() === Shared.BRANDA_CORPSE_ID ? Shared.BRANDA_ID : Shared.ELDRIC_ID;
  const stash = (session.stash ?? {})[id] ?? [];
  const tertiary = stash.filter((drop) =>
    drop.itemId === BRAN_ITEM_ID || /clue scroll/i.test(drop.name ?? ""));
  const dealt = combinedDamage(session, player);
  let amount = 0;
  if (dealt >= PAGES_FULL_DAMAGE) {
    amount = Math.max(1, Math.round(Shared.randomBetween(10, 19) * Math.max(share, 0.2)));
  } else if (dealt >= PAGES_MIN_DAMAGE) {
    amount = 1;
  }
  player.performAnimation(new core.Animation(2282));
  later(Shared.CLAIM_LOOT_TICKS, npc, () => {
    if (!player.isRegistered?.()) return;
    const drops = [...tertiary];
    if (amount > 0) drops.push({ itemId: PAGES_ITEM_ID, amount });
    api.emitCustomEvent("npc-drops:roll", { player, npc, npcId: id, drops });
    spawnDrops(player, session, drops);
  });
}

function combinedDamage(session, player) {
  let total = 0;
  for (const titan of [session.branda, session.eldric]) {
    const dealt = titan?.getAttribute?.(Shared.ATTR_DAMAGE_DEALT) ?? {};
    total += dealt[keyOf(player)] ?? 0;
  }
  return total;
}

/** Claim-anchored schedule: message+drops, then death anims, dels, fresh spawn. */
function startClaimSchedule(session) {
  later(Shared.CLAIM_MESSAGE_TICKS, session.branda, () => {
    for (const player of session.players) {
      if (player?.isRegistered?.()) player.sendMessage(Shared.REINVIGORATE_MESSAGE);
    }
  });
  later(Shared.CLAIM_DEATH_TICKS, session.branda, () => {
    if (session.area?.isDestroyed?.() === true) return;
    corpseDeathAnims(session);
  });
  later(Shared.CLAIM_REMOVE_TICKS, session.branda, () => {
    if (session.area?.isDestroyed?.() === true) return;
    removeCorpses(session);
  });
  later(Shared.CLAIM_SPAWN_TICKS, session.branda, () => {
    if (session.area?.isDestroyed?.() === true) return;
    session.respawnAt = core.World.getProcessCycle();
  });
}

function corpseDeathAnims(session) {
  const area = session.area;
  for (const [npc, anims, floors] of [
    [session.branda, Shared.BRANDA_ANIMATIONS, [Shared.BRANDA_DEATH_FLOOR_1, Shared.BRANDA_DEATH_FLOOR_2]],
    [session.eldric, Shared.ELDRIC_ANIMATIONS, [Shared.ELDRIC_DEATH_FLOOR_1, Shared.ELDRIC_DEATH_FLOOR_2]],
  ]) {
    if (!npc?.isRegistered?.()) continue;
    npc.performAnimation(new core.Animation(anims.death));
    if (npc.getId() === Shared.BRANDA_CORPSE_ID) {
      npc.performGraphic(new core.Graphic(Shared.BRANDA_CAST_GFX.death));
    }
    const at = npc.getLocation?.();
    if (at) {
      const Specials = require("./Specials.RoyalTitans");
      [[floors[0], at.getX() - 1], [floors[1], at.getX() + 3]].forEach(([id, x]) => {
        Specials.addLoc(session, id, x, at.getY(), 10, 0);
      });
    }
  }
}

function removeCorpses(session) {
  for (const key of ["branda", "eldric"]) {
    const npc = session[key];
    if (npc?.isRegistered?.()) core.World.getRemoveNPCQueue().push(npc);
    session[key] = null;
  }
  session.respawnAt = core.World.getProcessCycle() + 2;
}

function interact(event) {
  if (event?.handled) return;
  const id = event?.npcId ?? event?.npc?.getId?.();
  if (!Shared.isCorpse(id)) return;
  const player = Shared.resolvePlayer(core, event?.player);
  const option = event.clickType === 1 ? "Loot" : event.clickType === 3 ? "Sacrifice" : event.clickType === 4 ? "Take pages" : null;
  if (!option) return;
  if (claim({ player, npc: event.npc, option })) event.handled = true;
}

/** A corpse has no Attack: swallow the interaction if one is ever attempted. */
function denyAttack(event) {
  if (event?.handled) return;
  const id = event?.npcId ?? event?.npc?.getId?.();
  if (Shared.isCorpse(id)) event.handled = true;
}

function attach(pluginApi) {
  api = pluginApi;
  core = pluginApi.core;
  pluginApi.persistAttribute(Shared.ATTR_KILLS);
  pluginApi.persistAttribute(Shared.ATTR_BEST_TICKS);
  pluginApi.onNpcDeath(titanDied);
  pluginApi.onCustomEvent("npc-drops:generated", stashGenerated);
  pluginApi.onCombatHitResolved(trackDamage);
  pluginApi.onNpcInteraction(interact);
  pluginApi.onNpcInteraction("Branda the Fire Queen", { Attack: denyAttack });
  pluginApi.onNpcInteraction("Eldric the Ice King", { Attack: denyAttack });
}

module.exports = {
  attach, titanDied, killPair, recordKill, announceKill, stashGenerated, claim,
  loot, sacrifice, pages, shareOf, combinedDamage, corpseDeathAnims, removeCorpses,
  scaleDrops, spawnDrops, interact,
  _test: { shareOf, scaleDrops },
};
