/**
 * Phase 3: the 50% shield (message, activation, invulnerable transform) and the tail
 * with its damage cap, side swaps and shockwaves. P4 keeps the same kit faster with
 * periodic shockwaves.
 *
 * As captured: shield message, then +5 ticks activation (11676) + transform to
 * huey_head_invulnerable (14011); shielded autos (11673/11674/11675) keep firing.
 * Tail spawns east (1518, 3281) favoured over west (1502, 3281); visible ~35 ticks,
 * hidden 2 mid-swap; break is 11723 + same-tick transform to broken (14015).
 * Shockwaves: 8 direction map anims (2977-2984) + impacts (2994-3000), 20-25 on
 * failure, dodged by running through/diagonally. Unshield feedback unsourced (docs 15).
 */
const Shared = require("./Shared.Hueycoatl");

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

function tileOf(entity) {
  const at = entity?.getLocation?.();
  return at ? { x: at.getX(), y: at.getY(), z: at.getZ?.() ?? 0 } : null;
}

function tileOf(entity) {
  const at = entity?.getLocation?.();
  return at ? { x: at.getX(), y: at.getY(), z: at.getZ?.() ?? 0 } : null;
}

/** Shockwave tiles for a slam at (x, y): the 8 directions out from the tail. */
function shockwaveTiles(x, y) {
  const tiles = [];
  for (let r = 1; r <= 3; r++) {
    tiles.push([x + r, y], [x - r, y], [x, y + r], [x, y - r],
      [x + r, y + r], [x - r, y + r], [x + r, y - r], [x - r, y - r]);
  }
  return tiles;
}

/** Map-anim graphic per wave direction from the slam (live ids 2977-2984). */
function shockwaveGraphic(dx, dy) {
  if (dx === 0 && dy < 0) return 2977;
  if (dx === 0 && dy > 0) return 2979;
  if (dx > 0 && dy === 0) return 2980;
  if (dx < 0 && dy === 0) return 2978;
  if (dx > 0 && dy < 0) return 2981;
  if (dx < 0 && dy < 0) return 2982;
  if (dx > 0 && dy > 0) return 2984;
  return 2983;
}

/** True when the player dodges: moved through/diagonally since the slam began. */
function dodgedShockwave(movedTiles) {
  return (movedTiles ?? 0) > 0;
}

function raiseShield(npc) {
  if (!npc || npc.getId?.() !== Shared.HEAD_ID) return false;
  const phase = npc.getAttribute?.(Shared.ATTR_PHASE);
  if (phase !== undefined && phase !== null && phase !== 2) return false;
  npc.setAttribute(Shared.ATTR_PHASE, 3);
  const session = npc.getAttribute?.(Shared.ATTR_SESSION) ?? null;
  if (session) {
    for (const player of session.players ?? []) {
      player.sendMessage?.("<col=#f#f>The Hueycoatl shields itself!</col>");
    }
  }
  later(Shared.SHIELD_DELAY_TICKS, npc, () => {
    if (!alive(npc)) return;
    npc.performAnimation?.(new core.Animation(11676));
    try {
      npc.setNpcTransformationId?.(Shared.HEAD_INVULNERABLE_ID);
    } catch (error) { /* engine without transforms keeps the anim */ }
    try {
      const Area = require("./Area.Hueycoatl");
      Area.spawnTail(session, session?.area ?? null, true);
    } catch (error) { /* tail spawns on next hit */ }
  });
  return true;
}

function breakTail(npc) {
  if (!npc || npc.getId?.() !== Shared.TAIL_ID) return false;
  npc.performAnimation?.(new core.Animation(11723));
  try {
    npc.setNpcTransformationId?.(Shared.TAIL_BROKEN_ID);
  } catch (error) { /* engine without transforms keeps the anim */ }
  const session = npc.getAttribute?.(Shared.ATTR_SESSION) ?? null;
  const head = session?.head ?? null;
  if (head && alive(head)) {
    head.setAttribute(Shared.ATTR_PHASE, 4);
    try {
      head.setNpcTransformationId?.(Shared.HEAD_ID);
    } catch (error) { /* engine without transforms keeps going */ }
  }
  return true;
}

/** Tail slam: shockwave map anims, then damage on wave tiles for players that stood still. */
function startShockwave(npc, target) {
  const at = tileOf(npc);
  if (!at) return;
  const session = npc.getAttribute?.(Shared.ATTR_SESSION) ?? null;
  npc.performAnimation?.(new core.Animation(11723));
  const waves = shockwaveTiles(at.x, at.y);
  for (const [x, y] of waves) {
    try {
      target.getPacketSender?.().sendGraphic?.(new core.Graphic(shockwaveGraphic(x - at.x, y - at.y)), new core.Location(x, y, at.z ?? 0));
    } catch (error) { /* headless */ }
  }
  if (session) {
    session.shockAt = session.shockAt ?? new Map();
    for (const player of session.players ?? []) {
      const pos = tileOf(player);
      if (pos) session.shockAt.set(player, `${pos.x},${pos.y}`);
    }
  }
  later(2, target, () => {
    if (!alive(npc)) return;
    const players = session?.players?.length > 0 ? session.players : [target];
    for (const player of players) {
      const pos = tileOf(player);
      if (!pos) continue;
      const before = session?.shockAt?.get(player) ?? null;
      if (before && before !== `${pos.x},${pos.y}`) continue;
      if (!waves.some(([x, y]) => x === pos.x && y === pos.y)) continue;
      const damage = core.Misc.getRandom(Shared.SHOCKWAVE_MAX);
      if (damage > 0 && alive(player)) {
        player.getCombat().getHitQueue().addPendingDamage([new core.HitDamage(damage, core.HitMask.RED)]);
      }
    }
  });
}

function onNpcDeath(event) {
  const npc = event?.npc ?? null;
  if (!npc || npc.getId?.() !== Shared.TAIL_ID) return;
  breakTail(npc);
}

function attach(pluginApi) {
  api = pluginApi;
  core = pluginApi.core;
  pluginApi.onNpcDeath(onNpcDeath);
}

module.exports = {
  attach, raiseShield, breakTail, shockwaveTiles, dodgedShockwave, startShockwave, shockwaveGraphic, onNpcDeath,
  _test: { shockwaveTiles, dodgedShockwave, shockwaveGraphic },
};
