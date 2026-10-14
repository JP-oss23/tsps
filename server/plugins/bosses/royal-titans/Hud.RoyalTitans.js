/**
 * The boss health bar through the shared BossHud plugin (boss-hud:* events). As captured
 * (varp hpbar_hud_npc, 1683): it follows the player's engagement, switching between Eldric
 * (14147) and Branda (12596) as they change target, and clears on leaving (-1). Minions
 * and rows never show it.
 */
const Shared = require("./Shared.RoyalTitans");

let api = null;
let core = null;
/** username (lowercase) -> { player, titan, current } for each bar on show. */
const bars = new Map();

function barKey(player) {
  try {
    return player?.getUsername?.()?.toLowerCase?.() ?? null;
  } catch (error) {
    return null;
  }
}

function sessionOf(player) {
  return require("./Area.RoyalTitans").sessionOfPlayer(player);
}

function engagedTitan(player, session) {
  const target = player?.getCombat?.()?.getTarget?.() ?? null;
  if (target?.isNpc?.() && Shared.isLiveTitan(target.getId?.())) {
    const member = target.getAsNpc?.() ?? target;
    if (member === session.branda || member === session.eldric) return member;
  }
  for (const npc of [session.branda, session.eldric]) {
    if (npc && Shared.isLiveTitan(npc.getId()) && npc.isRegistered?.()
      && (npc.getHitpoints?.() ?? 0) > 0) return npc;
  }
  return null;
}

function showFor(player, session) {
  if (!player || !session) return;
  const key = barKey(player);
  if (!key) return;
  const titan = engagedTitan(player, session);
  if (!titan) return;
  bars.set(key, { player, titan, current: Math.max(0, titan.getHitpoints?.() ?? 0) });
  api.emitCustomEvent("boss-hud:show", {
    player,
    npcId: titan.getId(),
    current: Math.max(0, titan.getHitpoints?.() ?? 0),
    maximum: Shared.MAX_HITPOINTS,
  });
}

function show(npc, player) {
  const session = sessionOf(player);
  if (session) showFor(player, session);
}

/** Follows engagement and hitpoints; sends only what changed. */
function tickPlayer(player, session) {
  const key = barKey(player);
  if (!player?.isRegistered?.()) {
    if (key) bars.delete(key);
    return;
  }
  if (!key) return;
  const titan = engagedTitan(player, session);
  const bar = bars.get(key);
  if (!titan) {
    if (bar) {
      bars.delete(player);
      api.emitCustomEvent("boss-hud:hide", { player });
    }
    return;
  }
  const current = Math.max(0, titan.getHitpoints?.() ?? 0);
  if (!bar) {
    showFor(player, session);
    return;
  }
  if (bar.titan !== titan) {
    bar.titan = titan;
    bar.current = current;
    api.emitCustomEvent("boss-hud:update", { player, npcId: titan.getId(), current, maximum: Shared.MAX_HITPOINTS, force: true });
    return;
  }
  if (current === bar.current) return;
  bar.current = current;
  api.emitCustomEvent("boss-hud:update", { player, current });
}

function later(ticks, action) {
  core.TaskManager.submit(new (class extends core.Task {
    constructor() {
      super(Math.max(1, ticks), null, false);
    }
    execute() {
      this.stop();
      action();
    }
  })());
}

function killed(session) {
  if (!session) return;
  for (const player of session.players) {
    const key = barKey(player);
    const bar = key ? bars.get(key) : undefined;
    if (!bar) continue;
    bars.delete(key);
    later(4, () => api.emitCustomEvent("boss-hud:hide", { player: bar.player ?? player }));
  }
}

function dropFor(player) {
  const key = barKey(player);
  const bar = key ? bars.get(key) : undefined;
  if (!bar) return;
  bars.delete(key);
  api.emitCustomEvent("boss-hud:hide", { player: bar.player ?? player, fade: false, afterTicks: 0 });
}

function dropSession(session) {
  if (!session) return;
  const names = new Set((session.players ?? []).map((member) => {
    try {
      return member?.getUsername?.()?.toLowerCase?.();
    } catch (error) {
      return null;
    }
  }).filter(Boolean));
  for (const [key, bar] of [...bars.entries()]) {
    if (names.has(key)) {
      bars.delete(key);
      api.emitCustomEvent("boss-hud:hide", { player: bar.player, fade: false, afterTicks: 0 });
    }
  }
}

function attach(pluginApi) {
  api = pluginApi;
  core = pluginApi.core;
}

module.exports = {
  attach, show, showFor, tickPlayer, killed, dropFor, dropSession, bars,
  _test: { bars },
};
