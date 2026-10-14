/**
 * Defeat: kill count, durations, MVP-gated Big bones, respawn placeholder and the live
 * set's return. Loot tables (docs/hueycoatl.md) roll per player through NpcDrops; group
 * distribution and contribution scaling are unwitnessed (docs assumption 9).
 *
 * As captured: varp total_huey_kills (4404) + "Your Hueycoatl kill count is: N.",
 * "Fight duration: m:ss.cc (new personal best)" / ". Personal best: m:ss.cc";
 * ground loot spawns the same tick at (1513, 3287) (reveal 100, despawn 400,
 * self-owned), Take is op3; Big bones go to the MVP only (Wiki). After cleanup the
 * placeholder (14010) marks the head tile until the live set respawns (~30s).
 */
const Shared = require("./Shared.Hueycoatl");

const BIG_BONES_ITEM = 532;

let api = null;
let core = null;

function alive(entity) {
  return !!entity?.isRegistered?.() && (entity.getHitpoints?.() ?? 1) > 0;
}

function nameOf(player) {
  try {
    return player?.getUsername?.() ?? null;
  } catch (error) {
    return null;
  }
}

function trackDamage(session, attacker, amount) {
  if (!session || !attacker || !(amount > 0)) return;
  const player = attacker?.isPlayer?.() ? (attacker.getAsPlayer?.() ?? attacker) : attacker;
  const name = nameOf(player)?.toLowerCase?.();
  if (!name) return;
  session.damage = session.damage ?? {};
  const entry = session.damage[name] ?? { amount: 0, player: null };
  entry.amount += amount;
  entry.player = entry.player ?? player;
  session.damage[name] = entry;
}

function mvpOf(session) {
  let best = null;
  let top = -1;
  for (const [name, entry] of Object.entries(session?.damage ?? {})) {
    const amount = typeof entry === "number" ? entry : entry?.amount ?? 0;
    if (amount > top) {
      top = amount;
      best = name;
    }
  }
  return best;
}

/** Players to credit: session members, else damagers as fallback. */
function killPlayers(session) {
  if (session?.players?.length > 0) return session.players.filter(Boolean);
  const fallback = [];
  for (const entry of Object.values(session?.damage ?? {})) {
    if (entry && typeof entry === "object" && entry.player) fallback.push(entry.player);
  }
  return fallback;
}

function recordKill(player, session, durationTicks) {
  const kills = (player.getAttribute?.(Shared.ATTR_KILLS) ?? 0) + 1;
  player.setAttribute?.(Shared.ATTR_KILLS, kills);
  player.getPacketSender?.().sendConfig?.(Shared.TOTAL_KILLS_VARP, kills);
  player.sendMessage?.(`Your Hueycoatl kill count is: <col=ff0000>${kills}</col>.`);
  const line = `Fight duration: <col=ff0000>${Shared.formatTicks(durationTicks)}</col>`;
  const best = player.getAttribute?.(Shared.ATTR_BEST);
  if (best == null || durationTicks < best) {
    player.setAttribute?.(Shared.ATTR_BEST, durationTicks);
    player.sendMessage?.(`${line} (new personal best)`);
  } else {
    player.sendMessage?.(`${line}. Personal best: ${Shared.formatTicks(best)}`);
  }
  return kills;
}

/** Big bones are MVP-only (Wiki): strip them from everyone else's roll. */
function gateMvpBones(event) {
  const { npcId, player, drops } = event ?? {};
  if (npcId !== Shared.HEAD_ID || !Array.isArray(drops)) return;
  const npc = event?.npc ?? null;
  const session = npc?.getAttribute?.(Shared.ATTR_SESSION) ?? null;
  const mvp = session ? mvpOf(session) : null;
  const name = nameOf(player)?.toLowerCase?.();
  if (mvp && name && name !== mvp) {
    event.drops = drops.filter((drop) => drop?.itemId !== BIG_BONES_ITEM);
  }
}

function onNpcDeath(event) {
  const npc = event?.npc ?? null;
  if (!npc || npc.getId?.() !== Shared.HEAD_ID) return;
  const session = npc.getAttribute?.(Shared.ATTR_SESSION) ?? null;
  const duration = session && session.spawnedAt != null
    ? core.World.getProcessCycle() - session.spawnedAt
    : 0;
  try {
    npc.setNpcTransformationId?.(Shared.HEAD_DEFEATED_ID);
  } catch (error) { /* engine without transforms keeps going */ }
  for (const player of killPlayers(session)) {
    if (!player) continue;
    recordKill(player, session, duration);
    try {
      require("./CombatAchievements.Hueycoatl").fightKilled(player, session, duration);
    } catch (error) { /* CA optional */ }
  }
}

function onHit(event) {
  const { npc, hit, attacker } = event ?? {};
  if (!npc) return;
  const id = npc.getId?.();
  if (id !== Shared.HEAD_ID && id !== Shared.TAIL_ID && id !== Shared.BODY_ID) return;
  const amount = (hit?.getHits?.() ?? []).reduce((sum, part) => sum + (part.getDamage?.() ?? 0), 0);
  trackDamage(npc.getAttribute?.(Shared.ATTR_SESSION) ?? null, attacker, amount);
}

function attach(pluginApi) {
  api = pluginApi;
  core = pluginApi.core;
  pluginApi.persistAttribute(Shared.ATTR_KILLS);
  pluginApi.persistAttribute(Shared.ATTR_BEST);
  pluginApi.onNpcDeath(onNpcDeath);
  pluginApi.onNpcHitModify(onHit);
  pluginApi.onCustomEvent("npc-drops:generated", gateMvpBones);
}

module.exports = {
  attach, recordKill, gateMvpBones, trackDamage, mvpOf, killPlayers, onNpcDeath, onHit,
  BIG_BONES_ITEM,
  _test: { recordKill, gateMvpBones, trackDamage, mvpOf },
};
