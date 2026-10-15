/**
 * The titans' specials and the per-tick fight engine (rows, blast pulses, wall damage).
 *
 * As captured: summon01 lays a 5-wide vfx row (fire 3218, ice 3221) the same tick and five
 * hitbox NPCs (14152/14153) stand on it 4 ticks later; rows live ~40 ticks unless cleared
 * early by the opposite element (fire<-water/ice, ice<-fire), cleared tiles playing the
 * despawn grid (3220/3223). summon02 stands up three elementals 2 ticks later. The 35%
 * teleport moves both titans to their static tiles with the spawn grids, floors and
 * blockers. The blast charges (aoe01 + safe tile 56003 at the convergence) and fires 6
 * ticks later (aoe02 + full-arena grids 3209/3210), landing triple pulses at +1/+3/+5.
 * Sounds: fire rows 10116/10118, ice rows 10146-10148, blast 10119, minions 10172/10190.
 */
const Shared = require("./Shared.RoyalTitans");
const Minions = require("./Minions.RoyalTitans");
const CombatAchievements = require("./CombatAchievements.RoyalTitans");

const ROW_BAND_MIN = 9562;
const ROW_BAND_MAX = 9572;

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

function tileOf(entity) {
  const at = entity?.getLocation?.();
  return at ? { x: at.getX(), y: at.getY() } : null;
}

function graphic(id, delay = 0, height = 0) {
  const gfx = new core.Graphic(id);
  gfx.delay = delay;
  gfx.height = height;
  return gfx;
}

/** A map animation every player in the instance sees; x/y are instance tiles. */
function tileGraphic(session, x, y, id, delay = 0) {
  const first = session?.players?.[0];
  const sender = first?.getPacketSender?.();
  if (!sender) return;
  sender.sendGlobalGraphic(graphic(id, delay), new core.Location(x, y, 0));
}

function areaSounds(session, sounds, x, y) {
  if (!session) return;
  for (const [id, delay] of sounds) {
    core.Sounds.playAreaSound({ soundId: id, x, y, level: 0, delay, radius: 8 });
  }
}

/** The instance spot of an authored arena tile, as {x, y}. */
function arenaSpot(session, x, y) {
  const at = Shared.instanceTile(session?.area, x, y, 0);
  return { x: at.x, y: at.y };
}

/** A map animation on an authored arena tile (translated for the instance). */
function arenaTileGraphic(session, x, y, id, delay = 0) {
  const at = arenaSpot(session, x, y);
  tileGraphic(session, at.x, at.y, id, delay);
}

/** Area sounds at an authored arena tile (translated for the instance). */
function arenaSounds(session, sounds, x, y) {
  const at = arenaSpot(session, x, y);
  areaSounds(session, sounds, at.x, at.y);
}

function maybeShout(npc, kind) {
  if (!npc || Math.random() >= 0.35) return;
  npc.forceChat?.(Shared.pick(Shared.FLAVOR_SHOUTS));
}

/**
 * The captured stomp telegraph: a 5-wide by 3-deep block centred on the target's tile at
 * cast, graphic 3211 from either caster, delay +2 per tile of distance from the caster.
 * Returns the tiles for the damage roll.
 */
function telegraphMelee(npc, target) {
  const session = sessionOf(npc);
  const pos = tileOf(target);
  const base = tileOf(npc);
  if (!pos || !base) return [];
  const tiles = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      tiles.push([pos.x + dx, pos.y + dy]);
    }
  }
  for (const [x, y] of tiles) {
    const distance = Math.max(Math.abs(x - base.x), Math.abs(y - base.y));
    tileGraphic(session, x, y, Shared.MELEE_TELEGRAPH_GFX, distance * 2);
  }
  areaSounds(session, Shared.SOUND.melee, pos.x, pos.y);
  return tiles;
}

/** Static fight locs (teleport floors/blockers, death floors, row markers) tracked for cleanup. */
function trackLoc(session, object) {
  if (!session || !object) return object;
  session.staticLocs = session.staticLocs ?? [];
  session.staticLocs.push(object);
  return object;
}

function addLoc(session, id, x, y, shape, rotation) {
  const area = session?.area;
  if (!area || area?.isDestroyed?.() === true) return null;
  const object = new core.GameObject(id, new core.Location(x, y, 0), shape, rotation, area);
  core.ObjectManager.register(object, true);
  area?.add?.(object);
  return trackLoc(session, object);
}

function clearStaticLocs(session) {
  for (const object of session?.staticLocs ?? []) {
    try {
      core.ObjectManager.deregister(object, true);
    } catch (error) {}
  }
  if (session) session.staticLocs = [];
}

/** Row vfx locs for one cast (shape 10); removed tile by tile as spells clear them.
 * `spots` are instance tiles, one per row tile. */
function spawnRowVfx(session, kind, spots) {
  const id = kind === "fire" ? Shared.FIRE_ROW_OBJECT : Shared.ICE_ROW_OBJECT;
  const objects = [];
  for (const [x, y] of spots) {
    objects.push(addLoc(session, id, x, y, 10, 0));
  }
  return objects;
}

function removeRowVfx(session, x, y) {
  const area = session?.area;
  if (!area) return;
  for (const entity of area.entities ?? []) {
    const loc = entity?.getAsGameObject?.() ?? entity;
    const at = loc?.getLocation?.();
    const id = loc?.getId?.() ?? entity?.getId?.();
    if (at && at.getX() === x && at.getY() === y
      && (id === Shared.FIRE_ROW_OBJECT || id === Shared.ICE_ROW_OBJECT)) {
      core.ObjectManager.deregister(entity, true);
    }
  }
}

/** addLoc/rows take instance tiles: `spots` holds the authored x-range already mapped. */
function startRow(npc, target) {
  const session = sessionOf(npc);
  if (!session || npc.getAttribute?.(Shared.ATTR_DYING) === true) return;
  const kind = npc.getId() === Shared.BRANDA_ID ? "fire" : "ice";
  const anims = Shared.animationsFor(npc.getId());
  npc.setPositionToFace?.(target?.getLocation?.());
  npc.performAnimation(new core.Animation(anims.row));
  if (npc.getId() === Shared.BRANDA_ID) {
    npc.performGraphic(new core.Graphic(Shared.BRANDA_CAST_GFX.row));
  }
  const y = Shared.randomBetween(ROW_BAND_MIN, ROW_BAND_MAX);
  const spots = [];
  for (let x = 2909; x <= 2913; x++) {
    const at = arenaSpot(session, x, y);
    spots.push([at.x, at.y]);
    tileGraphic(session, at.x, at.y, Shared.ROW_SPAWN_GFX[kind]);
  }
  arenaSounds(session, kind === "fire" ? Shared.SOUND.fireRow : Shared.SOUND.iceRow, 2911, y);
  CombatAchievements.rowSpawned(session, kind);
  later(Shared.ROW_SPAWN_TICKS, npc, () => {
    if (!alive(npc) || npc.getAttribute?.(Shared.ATTR_DYING) === true) return;
    if (session.area?.isDestroyed?.() === true) return;
    const vfx = spawnRowVfx(session, kind, spots);
    const rowId = kind === "fire" ? Shared.FIRE_ROW_ID : Shared.ICE_ROW_ID;
    spots.forEach(([x, y], index) => {
      const hitbox = core.NPC.create(rowId, new core.Location(x, y, 0));
      hitbox.__skipDefaultRespawn = true;
      // Cleared by the first qualifying spell hit (clearRowTile), never by damage.
      hitbox.setHitpoints?.(1000);
      hitbox.setAttribute?.(Shared.ATTR_ENCOUNTER, session);
      hitbox.setAttribute?.(Shared.ATTR_ROW, { kind, x, y, vfx: vfx[index], expiresAt: core.World.getProcessCycle() + Shared.ROW_LIFETIME_TICKS });
      session.area.add(hitbox);
      core.World.getAddNPCQueue().push(hitbox);
      const key = Shared.tileKey(x, y);
      session.rows.set(key, hitbox);
    });
  });
}

/** Clicking Douse/Melt (or the wall's own loc) with the right element in hand clears the
 * tile; anything else hints, as captured ("...strong enough to..."). */
function tryRowClear(player, npc) {
  const id = npc?.getId?.();
  if (!Shared.isRowHitbox(id)) return false;
  const row = npc.getAttribute?.(Shared.ATTR_ROW) ?? null;
  const kind = row?.kind ?? (id === Shared.FIRE_ROW_ID ? "fire" : "ice");
  const need = kind === "fire" ? "water" : "fire";
  if (Minions.spellElementOf(player) === need) {
    const session = sessionOf(npc) ?? require("./Area.RoyalTitans").sessionOfPlayer?.(player) ?? null;
    if (session) {
      clearRowTile(session, npc, true);
      return true;
    }
  }
  player?.sendMessage?.(kind === "fire" ? Shared.FIRE_HINT : Shared.ICE_HINT);
  return true;
}

/**
 * A row tile cleared (by a qualifying spell hit, via Minions.clearRowTile, or expired):
 * despawn grid, its own vfx loc out, invisible marker in, NPC gone. Vfx is removed by
 * object reference: rows on the same tiles must clear independently (a tile scan would
 * strip a newer row's graphics with the older row's).
 */
function clearRowTile(session, hitbox, cleared) {
  if (!session || !hitbox) return;
  const row = hitbox.getAttribute?.(Shared.ATTR_ROW);
  const kind = row?.kind ?? (hitbox.getId() === Shared.FIRE_ROW_ID ? "fire" : "ice");
  const at = tileOf(hitbox) ?? { x: row?.x ?? 0, y: row?.y ?? 0 };
  tileGraphic(session, at.x, at.y, Shared.ROW_DESPAWN_GFX[kind]);
  const rowVfx = row?.vfx ?? null;
  if (rowVfx) {
    try {
      core.ObjectManager.deregister(rowVfx, true);
    } catch (error) {}
  } else {
    removeRowVfx(session, at.x, at.y);
  }
  const area = session.area;
  if (area?.isDestroyed?.() !== true) {
    addLoc(session, Shared.CLEARED_OBJECT, at.x, at.y, 10, 0);
  }
  session.rows.delete(Shared.tileKey(at.x, at.y));
  if (hitbox.isRegistered?.()) core.World.getRemoveNPCQueue().push(hitbox);
  if (cleared) CombatAchievements.rowCleared(session);
  else CombatAchievements.rowExpired(session);
}

/** Natural expiry only (spell clears go through clearRowTile with cleared=true). */
function expireRows(session) {
  const now = core.World.getProcessCycle();
  for (const hitbox of [...session.rows.values()]) {
    const row = hitbox.getAttribute?.(Shared.ATTR_ROW);
    if (!hitbox.isRegistered?.() || (row && now >= row.expiresAt)) {
      clearRowTile(session, hitbox, false);
    }
  }
}

/** Standing on a live row tile deals the wall hit (Wiki max 12). */
function tickRows(session) {
  // Contact damage pulses about every 3 ticks (rate estimated [EST]): every tick felt
  // like a shredder and the Wiki only gives the 1-12 max, not the interval.
  if (core.World.getProcessCycle() % 3 === 0) {
  for (const player of session.players) {
    if (!alive(player)) continue;
    const pos = tileOf(player);
    if (!pos) continue;
    const hitbox = session.rows.get(Shared.tileKey(pos.x, pos.y));
    if (!hitbox || !hitbox.isRegistered?.()) continue;
    const damage = 1 + core.Misc.getRandom(Shared.WALL_MAX - 1);
    player.getCombat().getHitQueue().addPendingDamage([new core.HitDamage(damage, core.HitMask.RED)]);
    CombatAchievements.avoidableDamage(player, damage, "row");
  }
  }
  expireRows(session);
}

/** The minion trio: three elementals on adjacent tiles near the caster, +2 ticks. */
function startMinions(npc, target) {
  const session = sessionOf(npc);
  if (!session || npc.getAttribute?.(Shared.ATTR_DYING) === true) return;
  const base = tileOf(npc);
  if (!base) return;
  const fire = npc.getId() === Shared.BRANDA_ID;
  const anims = Shared.animationsFor(npc.getId());
  npc.setPositionToFace?.(target?.getLocation?.());
  npc.performAnimation(new core.Animation(anims.minions));
  if (fire) npc.performGraphic(new core.Graphic(Shared.BRANDA_CAST_GFX.minions));
  areaSounds(session, Shared.SOUND.minions, base.x, base.y);
  const minionId = fire ? Shared.FIRE_MINION_ID : Shared.ICE_MINION_ID;
  const tiles = [
    [base.x + (fire ? 2 : -2), base.y - 3],
    [base.x + (fire ? 2 : -2), base.y - 2],
    [base.x + (fire ? 2 : -2), base.y - 1],
  ];
  later(Shared.MINION_SPAWN_TICKS, npc, () => {
    if (!alive(npc) || npc.getAttribute?.(Shared.ATTR_DYING) === true) return;
    if (session.area?.isDestroyed?.() === true) return;
    Minions.spawnTrio(session, minionId, tiles);
  });
}

/**
 * Crossing 210 HP teleports both titans onto the arena (captured): shouts, teleport anims
 * + arrival grids, telejumps 3 ticks later with spawn anims, floors and blockers. Both go
 * static for the rest of the fight; the blast cycle starts.
 */
function teleportTitans(trigger) {
  const session = sessionOf(trigger);
  if (!session || session.over === true) return;
  const { branda, eldric } = session;
  if (!branda || !eldric) return;
  if (branda.getAttribute?.(Shared.ATTR_TELEPORTED) === true) return;
  // Only when a live titan is actually at or below the threshold (commands included).
  const low = [branda, eldric].some((npc) => alive(npc) && (npc.getHitpoints?.() ?? 1) <= Shared.TELEPORT_THRESHOLD);
  if (!low) return;
  branda.setAttribute(Shared.ATTR_TELEPORTED, true);
  eldric.setAttribute(Shared.ATTR_TELEPORTED, true);
  branda.forceChat?.(Shared.pick(["Time to finish this!", "Your time is up!", "The real battle begins now!"]));
  eldric.forceChat?.(Shared.pick(["This is no game anymore!", "Your time is up!", "You'll regret provoking me!"]));
  branda.performAnimation(new core.Animation(Shared.BRANDA_ANIMATIONS.teleport));
  for (let x = 2909; x <= 2913; x++) {
    for (let y = 9571; y <= 9573; y++) arenaTileGraphic(session, x, y, Shared.TELEPORT_GRID_GFX.fire);
  }
  later(1, eldric, () => {
    if (!alive(eldric)) return;
    eldric.performAnimation(new core.Animation(Shared.ELDRIC_ANIMATIONS.teleport));
    for (let x = 2909; x <= 2913; x++) {
      for (let y = 9561; y <= 9563; y++) arenaTileGraphic(session, x, y, Shared.TELEPORT_GRID_GFX.ice);
    }
  });
  later(3, branda, () => landTitan(session, branda, Shared.BRANDA_STATIC, Shared.BRANDA_ANIMATIONS.spawn, Shared.BRANDA_CAST_GFX.spawn, [Shared.BRANDA_FLOOR_1, Shared.BRANDA_FLOOR_2]));
  later(4, eldric, () => landTitan(session, eldric, Shared.ELDRIC_STATIC, Shared.ELDRIC_ANIMATIONS.spawn, null, [Shared.ELDRIC_FLOOR_1, Shared.ELDRIC_FLOOR_2]));
}

function landTitan(session, npc, tile, spawnAnim, spawnGfx, floors) {
  if (!alive(npc)) return;
  if (session.area?.isDestroyed?.() === true) return;
  const staticTile = Shared.instanceTile(session.area, tile[0], tile[1], tile[2]);
  npc.moveTo(new core.Location(staticTile.x, staticTile.y, staticTile.z));
  npc.performAnimation(new core.Animation(spawnAnim));
  if (spawnGfx != null) npc.performGraphic(new core.Graphic(spawnGfx));
  const floorTiles = [[staticTile.x - 1, staticTile.y], [staticTile.x + 3, staticTile.y]];
  floors.forEach((id, index) => {
    const [x, y] = floorTiles[index] ?? [staticTile.x, staticTile.y];
    addLoc(session, id, x, y, 10, 0);
  });
  for (let dx = 0; dx <= 2; dx++) {
    for (let dy = 0; dy <= 2; dy++) {
      addLoc(session, Shared.BLOCKING_OBJECT, staticTile.x + dx, staticTile.y + dy, 10, 0);
    }
  }
  npc.getMovementCoordinator?.().setRadius?.(30);
  npc.setAttribute?.(Shared.ATTR_BLAST_AT, core.World.getProcessCycle() + 8);
  CombatAchievements.teleported(session);
}

/** Whether the surviving titan is enraged by its partner's death (Wiki; unwitnessed). */
function survivorEnraged(session, npc) {
  if (!session) return false;
  const other = npc.getId() === Shared.BRANDA_ID ? session.eldric : session.branda;
  if (!other || alive(other)) return false;
  return other.getAttribute?.(Shared.ATTR_DYING) === true || !other.isRegistered?.();
}

/** Post-teleport blast turn, about every 28 ticks for both titans together. */
function takeBlastTurn(npc, target) {
  if (npc.getAttribute?.(Shared.ATTR_TELEPORTED) !== true) return false;
  if (npc.getAttribute?.(Shared.ATTR_DYING) === true) return false;
  const now = core.World.getProcessCycle();
  const due = npc.getAttribute?.(Shared.ATTR_BLAST_AT) ?? 0;
  if (now < due) return false;
  const session = sessionOf(npc);
  if (!session || session.blastLock) return false;
  // One shared blast: lock this tick, and move both titans to the next cycle together.
  session.blastLock = npc;
  later(1, npc, () => {
    if (session.blastLock === npc) session.blastLock = null;
  });
  for (const titan of [session.branda, session.eldric]) {
    titan?.setAttribute?.(Shared.ATTR_BLAST_AT, now + Shared.BLAST_INTERVAL_TICKS);
  }
  startBlast(session, target);
  return true;
}

/**
 * The Elemental Blast: charge (aoe01 + safe tile at the convergence) then fire 6 ticks
 * later (aoe02 + full-arena grids), landing triple pulses at +1/+3/+5. Off the safe tile
 * every pulse rolls; on it nothing lands (captured empty windows).
 */
function startBlast(session, target) {
  const { branda, eldric } = session;
  if (!branda || !eldric) return;
  const safe = blastSafeTile(session);
  session.blastSafe = safe;
  session.blastId = (session.blastId ?? 0) + 1;
  const id = session.blastId;
  for (const [npc, anims, shout, gfx] of [
    [branda, Shared.BRANDA_ANIMATIONS, Shared.pick(Shared.BLAST_FIRE_SHOUTS), Shared.BRANDA_CAST_GFX.blastCharge],
    [eldric, Shared.ELDRIC_ANIMATIONS, Shared.pick(Shared.BLAST_FIRE_SHOUTS), null],
  ]) {
    if (!alive(npc)) continue;
    npc.performAnimation(new core.Animation(anims.blastCharge));
    if (gfx != null) npc.performGraphic(new core.Graphic(gfx));
    npc.forceChat?.(shout);
  }
  const area = session.area;
  if (area?.isDestroyed?.() !== true) {
    session.safeObject = addLoc(session, Shared.SAFE_TILE_OBJECT, safe.x, safe.y, 22, 0);
  }
  areaSounds(session, Shared.SOUND.blast, safe.x, safe.y);
  CombatAchievements.blastCharged(session, id);
  later(Shared.BLAST_FIRE_TICKS, branda, () => {
    if (session.blastId !== id) return;
    if (area?.isDestroyed?.() === true) return;
    for (const [npc, anims, gfx] of [
      [branda, Shared.BRANDA_ANIMATIONS, Shared.BRANDA_CAST_GFX.blastFire],
      [eldric, Shared.ELDRIC_ANIMATIONS, null],
    ]) {
      if (alive(npc)) {
        npc.performAnimation(new core.Animation(anims.blastFire));
        if (gfx != null) npc.performGraphic(new core.Graphic(gfx));
      }
    }
    for (let x = 2909; x <= 2913; x++) {
      for (let y = 9564; y <= 9567; y++) arenaTileGraphic(session, x, y, Shared.BLAST_ICE_GFX);
      for (let y = 9568; y <= 9570; y++) arenaTileGraphic(session, x, y, Shared.BLAST_FIRE_GFX);
    }
    for (const offset of Shared.BLAST_PULSE_OFFSETS) {
      later(offset, branda, () => blastPulse(session, id));
    }
    later(Shared.BLAST_PULSE_OFFSETS[Shared.BLAST_PULSE_OFFSETS.length - 1] + 2, branda, () => {
      if (session.blastId !== id) return;
      if (session.safeObject) {
        core.ObjectManager.deregister(session.safeObject, true);
        session.safeObject = null;
      }
      CombatAchievements.blastResolved(session, id);
    });
  });
}

/** Safe tile at the blasts' convergence; far from the survivor when one titan is down.
 * Returned in instance tiles (blastPulse compares against player tiles). */
function blastSafeTile(session) {
  const brandaDown = session.branda && !alive(session.branda);
  const eldricDown = session.eldric && !alive(session.eldric);
  let authored = { x: 2912, y: 9567 };
  if (brandaDown && !eldricDown) authored = { x: 2911, y: 9563 };
  else if (eldricDown && !brandaDown) authored = { x: 2911, y: 9571 };
  return arenaSpot(session, authored.x, authored.y);
}

function blastPulse(session, id) {
  if (session.blastId !== id) return;
  if (session.area?.isDestroyed?.() === true) return;
  const safe = session.blastSafe ?? arenaSpot(session, 2912, 9567);
  for (const player of session.players) {
    if (!alive(player)) continue;
    const pos = tileOf(player);
    if (!pos) continue;
    if (pos.x === safe.x && pos.y === safe.y) continue;
    const damage = core.Misc.getRandom(Shared.BLAST_MAX);
    if (damage <= 0) continue;
    player.getCombat().getHitQueue().addPendingDamage([new core.HitDamage(damage, core.HitMask.RED)]);
    CombatAchievements.avoidableDamage(player, damage, "blast");
  }
  for (const minion of [...session.minions]) {
    if (!alive(minion)) continue;
    const damage = core.Misc.getRandom(Shared.BLAST_MAX);
    if (damage <= 0) continue;
    minion.getCombat().getHitQueue().addPendingDamage([new core.HitDamage(damage, core.HitMask.RED)]);
    CombatAchievements.minionHitByTitan(session, minion, damage);
  }
}

/** Per-tick engine: rows damage + expiry; minion fuse handled in Minions via the same tick. */
function tickSession(session) {
  if (!session || session.area?.isDestroyed?.() === true) return;
  tickRows(session);
  Minions.tickSession(session);
}

function tick() {
  for (const session of require("./Area.RoyalTitans").sessions.values()) {
    const live = (session.branda && alive(session.branda)) || (session.eldric && alive(session.eldric));
    if (!live && session.rows.size === 0 && session.minions.size === 0) continue;
    // Never regenerate mid-fight (Araxxor/Zulrah/Doom precedent).
    for (const npc of [session.branda, session.eldric]) {
      npc?.getCombat?.()?.getLastAttack?.()?.reset?.();
    }
    tickSession(session);
  }
}

/** Teardown: rows, vfx, static locs and minions go with the fight. */
function endFight(session) {
  if (!session) return;
  for (const hitbox of [...session.rows.values()]) {
    if (hitbox?.isRegistered?.()) core.World.getRemoveNPCQueue().push(hitbox);
  }
  session.rows.clear();
  for (const minion of [...session.minions]) {
    if (minion?.isRegistered?.()) core.World.getRemoveNPCQueue().push(minion);
  }
  session.minions.clear();
  session.safeObject = null;
  clearStaticLocs(session);
}

/** op1 on a row tile is the hint, by id (display names carry color tags). */
function interact(event) {
  if (event?.handled) return;
  const id = event?.npcId ?? event?.npc?.getId?.();
  if (!Shared.isRowHitbox(id) || event.clickType !== 1) return;
  tryRowClear(Shared.resolvePlayer(core, event?.player), event.npc);
  event.handled = true;
}

/** The wall's visible loc (56001/56002): clicking it behaves like Douse/Melt on its tile. */
function rowObjectClick(event) {
  const id = event?.object?.getId?.() ?? event?.definition?.getId?.();
  if (id !== Shared.FIRE_ROW_OBJECT && id !== Shared.ICE_ROW_OBJECT) return false;
  const player = Shared.resolvePlayer(core, event?.player);
  const at = event?.object?.getLocation?.();
  const session = player ? require("./Area.RoyalTitans").sessionOfPlayer?.(player) ?? null : null;
  const hitbox = at && session ? session.rows?.get?.(Shared.tileKey(at.getX(), at.getY())) ?? null : null;
  if (hitbox) tryRowClear(player, hitbox);
  return true;
}

/**
 * Rows are spell targets, never melee ones: Douse/Melt are registered combat options
 * (Nightmare's Charge precedent) so casts route, and melee is refused with the hint.
 */
function rowCanAttack(event) {
  const { attacker, target, method } = event;
  if (!attacker?.isPlayer?.() || !target?.isNpc?.()) return;
  if (!Shared.isRowHitbox(target.getId?.())) return;
  // Magic casts must reach Minions.rowClearingHit (that is what clears the tile);
  // melee/ranged are refused with the hint.
  let magic = false;
  try {
    const type = method?.type?.() ?? method?.getCombatType?.();
    magic = type === core.CombatType.MAGIC;
  } catch (error) {}
  if (magic) return;
  const kind = target.getId() === Shared.FIRE_ROW_ID ? "fire" : "ice";
  attacker.getAsPlayer().sendMessage(kind === "fire" ? Shared.FIRE_HINT : Shared.ICE_HINT);
  event.allow = false;
}

function attach(pluginApi) {
  api = pluginApi;
  core = pluginApi.core;
  pluginApi.onNpcInteraction(interact);
  pluginApi.onObjectInteraction(rowObjectClick);
  pluginApi.onCanAttack(rowCanAttack);
  pluginApi.registerNpcCombatOption("Douse");
  pluginApi.registerNpcCombatOption("Melt");
  class EngineTask extends core.Task {
    constructor() {
      super(1, null, false);
    }

    execute() {
      tick();
    }
  }
  core.TaskManager.submit(new EngineTask());
}

module.exports = {
  attach, tick, tickSession, tickRows, telegraphMelee, startRow, tryRowClear, clearRowTile,
  startMinions, teleportTitans, survivorEnraged, takeBlastTurn, startBlast, blastPulse,
  blastSafeTile, maybeShout, endFight, addLoc, clearStaticLocs,
  _test: { blastSafeTile },
};
