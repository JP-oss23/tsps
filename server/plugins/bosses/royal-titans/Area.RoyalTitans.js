/**
 * One Royal Titans instance per party (1-2 players). Entering happens only through the
 * entrance loc: op1 offers Start a fight / Join a fight / Do nothing (captured chatmenu),
 * op2 is the Quick-start straight to the warning box (captured). Both show the captured
 * unsafe-death warning (messagebox 229) and set royal_titans_enter_warning (16089), then
 * move the player to (2911, 9573) in a fresh (Start) or the partner's (Join) dynamic
 * region built from the ice-dungeon base, with the fade in, minimap off and "In the Pits".
 *
 * Join is allowed while both titans are above 450 HP and neither has teleported (docs
 * assumptions 1-2); later the critical-stage box refuses. Leaving (exit op2 to
 * (2950, 9574), teleport, logout, death, disconnect) ends that player's session; an empty
 * instance is destroyed with its NPCs and drops. Deaths are unsafe: drops land at the
 * grave tile outside the entrance (tsps has no graves — Doom precedent), and logging out
 * inside rejoins the live fight on login, else puts the player back outside (Yama precedent).
 */
const Shared = require("./Shared.RoyalTitans");
const Hud = require("./Hud.RoyalTitans");
const CombatAchievements = require("./CombatAchievements.RoyalTitans");

const SCOREBOARD_INTERFACE = 909;
const SCOREBOARD_COMPONENT = Object.freeze({
  title: 6, close: 2, pkc: 9, pd: 11, pbt: 13, gkc: 15, gd: 17, gbt: 19,
});
const MINIMAP_VARBIT = 6719;
const MINIMAP_OFF = 0;
const MINIMAP_ON = 2;
const MUSIC_IN_THE_PITS = 469;
const OVERLAY_ATMOSPHERE_UID = (161 << 16) | 1;
const FADE_OVERLAY = 174;
const FADE_SCRIPT = 948;
const FADE_CYCLES = 50;

const ATTR_INSIDE = "royal-titans:inside";
const ATTR_DEATHS = "royal-titans:deaths";
const ATTR_SESSION_OWNER = "royal-titans:session-owner";

let api = null;
let core = null;
let TitansArea = null;
/** area -> session { area, players, branda, eldric, spawnedAt, fight, over } for live areas. */
const sessions = new Map();
/** server-wide scoreboard numbers (live shows global KC/deaths/best; ours accumulate). */
const world = { kills: 0, deaths: 0, best: 0 };

function uid(component) {
  return (SCOREBOARD_INTERFACE << 16) | component;
}

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

function locationOf(entity) {
  return entity?.getLocation?.() ?? null;
}

function tileOf(entity) {
  const at = locationOf(entity);
  return at ? { x: at.getX(), y: at.getY(), z: at.getZ?.() ?? 0 } : null;
}

function nameOf(player) {
  try {
    if (!player || typeof player !== "object") return typeof player === "string" ? player : null;
    if ("player" in player && player.player !== player) return nameOf(player.player);
    return player?.getUsername?.() ?? null;
  } catch (error) {
    return null;
  }
}

/** An authored arena spot as a real (instance) Location. */
function arenaLocation(area, x, y, z = 0) {
  const at = Shared.instanceTile(area, x, y, z);
  return new core.Location(at.x, at.y, at.z);
}

function insideArenaBounds(player) {
  try {
    const at = player?.getLocation?.();
    if (!at) return false;
    for (const session of sessions.values()) {
      if (session.area?.isDestroyed?.() === true) continue;
      if (session.area?.contains?.(at) === true) return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

function sessionOfPlayer(player) {
  const name = nameOf(player)?.toLowerCase?.();
  for (const session of sessions.values()) {
    if (session.area?.isDestroyed?.() === true) continue;
    if (name && session.players.some((member) => nameOf(member)?.toLowerCase?.() === name)) return session;
    // Fallback: anyone standing in the arena bounds belongs to the live session there.
    if (!name && player && insideArenaBounds(player)) return session;
  }
  return null;
}

function sessionOfNpc(npc) {
  return npc?.getAttribute?.(Shared.ATTR_ENCOUNTER) ?? null;
}

function defineAreaClass() {
  class RoyalTitansArea extends core.TemplatedInstanceArea {
    constructor(ownerName) {
      super(Shared.ARENA_CHUNKS, Shared.ARENA_CHUNKS);
      this.ownerName = ownerName ?? "unknown";
      const { x, y } = Shared.ARENA_SOURCE_CHUNK;
      for (let chunkX = 0; chunkX < Shared.ARENA_CHUNKS; chunkX++) {
        for (let chunkY = 0; chunkY < Shared.ARENA_CHUNKS; chunkY++) {
          this.setChunk(0, chunkX, chunkY, {
            sourceChunkX: x + chunkX, sourceChunkY: y + chunkY, sourcePlane: 0, rotation: 0,
          });
        }
      }
    }

    getName() {
      return "Royal Titans Arena";
    }

    destroy() {
      if (this.isDestroyed?.() === true) return;
      const addQueue = core.World.getAddNPCQueue();
      const removeQueue = core.World.getRemoveNPCQueue();
      for (const entity of this.entities) {
        if (!entity?.isNpc?.() || !entity?.getAsNpc) continue;
        const npc = entity.getAsNpc();
        for (let index = addQueue.indexOf(npc); index !== -1; index = addQueue.indexOf(npc)) {
          addQueue.splice(index, 1);
        }
        if (npc.isRegistered?.() && !removeQueue.includes(npc)) {
          removeQueue.push(npc);
        }
      }
      super.destroy();
    }

    process(mobile) {
      if (!mobile?.isPlayer?.()) return;
      const player = mobile.getAsPlayer();
      ensureEncounter(player, this);
      const session = sessions.get(this);
      if (session) {
        CombatAchievements.tick(player, session);
        Hud.tickPlayer(player, session);
        retarget(session);
      }
    }

    postLeave(mobile, logout) {
      if (mobile?.isPlayer?.()) leave(mobile.getAsPlayer(), this, logout);
      super.postLeave(mobile, logout);
    }

    /** Players fight only their own instance's titans, minions and rows. */
    canAttack(attacker, target) {
      if (!attacker?.isPlayer?.() || !target?.isNpc?.()) return null;
      if (!Shared.isTitanNpc(target.getId?.())) return null;
      return attacker.getPrivateArea?.() === target.getPrivateArea?.() ? null : false;
    }

    isMulti() {
      return true;
    }
  }
  TitansArea = RoyalTitansArea;
}

/** A titan engages the nearest player in its instance without a live target. */
function retarget(session) {
  if (!session || session.over === true) return;
  for (const npc of [session.branda, session.eldric]) {
    if (!npc || !Shared.isLiveTitan(npc.getId()) || !alive(npc)) continue;
    const target = npc.getCombat?.().getTarget?.() ?? null;
    const targetName = target?.isPlayer?.() ? nameOf(target.getAsPlayer?.() ?? target)?.toLowerCase?.() : null;
    if (targetName && alive(target) && session.players.some((member) => nameOf(member)?.toLowerCase?.() === targetName)) continue;
    let best = null;
    let bestDistance = Infinity;
    const at = tileOf(npc);
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
    if (best) npc.getCombat?.().attack?.(best);
  }
}

function spawnTitan(session, id, tile, faceTile, anim) {
  const area = session.area;
  const at = Shared.instanceTile(area, tile[0], tile[1], tile[2]);
  const face = Shared.instanceTile(area, faceTile[0], faceTile[1], 0);
  const npc = core.NPC.create(id, new core.Location(at.x, at.y, at.z));
  npc.__skipDefaultRespawn = true;
  npc.setHitpoints?.(Shared.MAX_HITPOINTS);
  npc.getMovementCoordinator?.().setRadius?.(30);
  // Out of melee range they close the distance while attacking (combat:close-in, as
  // Araxxor/ToA Akkha); the 7-tick cycle walks them between attacks (Combat unit).
  npc.setFlag?.("combat:close-in");
  npc.setMultiCombat?.(true);
  npc.performAnimation(new core.Animation(anim));
  npc.setPositionToFace?.(new core.Location(face.x, face.y, 0));
  npc.setAttribute?.(Shared.ATTR_ENCOUNTER, session);
  npc.setAttribute?.(Shared.ATTR_ARMED_AT, core.World.getProcessCycle() + Shared.ARM_TICKS);
  npc.setAttribute?.(Shared.ATTR_ATTACKS, 0);
  area.add(npc);
  core.World.getAddNPCQueue().push(npc);
  return npc;
}

/** Both titans spawn together; Branda's anim first, then Eldric's (captured). */
function spawnEncounter(session) {
  if (session.area?.isDestroyed?.() === true) return;
  if (session.spawnPending) return;
  session.spawnPending = true;
  require("./Specials.RoyalTitans").clearStaticLocs(session);
  session.branda = spawnTitan(session, Shared.BRANDA_ID, Shared.BRANDA_SPAWN, [2912, 9566], Shared.BRANDA_ANIMATIONS.spawn);
  session.eldric = spawnTitan(session, Shared.ELDRIC_ID, Shared.ELDRIC_SPAWN, [2908, 9566], Shared.ELDRIC_ANIMATIONS.spawn);
  session.spawnedAt = core.World.getProcessCycle();
  session.fight = null;
  session.over = false;
  session.claimedBy = null;
  session.claims = null;
  session.stash = null;
  session.brandaDown = false;
  session.eldricDown = false;
  session.respawnAt = 0;
  for (const player of session.players) {
    CombatAchievements.spawned(player, session);
    Hud.showFor(player, session);
  }
  later(Shared.ARM_TICKS, session.branda, () => retarget(session));
}

/** Keeps the party's fight going: spawn on entry, respawn on the claim-anchored timer.
 * Never respawns mid-fight or into a fresh kill: once over, only past respawnAt. */
function ensureEncounter(player, area) {
  const session = sessions.get(area);
  if (!session || !session.players.some((member) => nameOf(member)?.toLowerCase?.() === nameOf(player)?.toLowerCase?.())) return;
  const now = core.World.getProcessCycle();
  if (session.spawnPending) {
    const registered = [session.branda, session.eldric].some((npc) => npc?.isRegistered?.());
    if (registered) session.spawnPending = false;
    return;
  }
  if (session.over) {
    if (!session.respawnAt || now < session.respawnAt) return;
    const corpsesGone = !(session.corpses ?? []).some((npc) => npc?.isRegistered?.());
    if (!corpsesGone) return;
    if (!session.players.some((member) => member?.isRegistered?.())) return;
    session.branda = null;
    session.eldric = null;
    spawnEncounter(session);
    return;
  }
  const live = [session.branda, session.eldric].some((npc) =>
    npc && Shared.isLiveTitan(npc.getId()) && (npc.isRegistered?.() || core.World.getAddNPCQueue().includes(npc)));
  if (live) return;
  const corpses = [session.branda, session.eldric].some((npc) =>
    npc && Shared.isCorpse(npc.getId()) && npc.isRegistered?.());
  if (corpses) return;
  if (!session.players.some((member) => member?.isRegistered?.())) return;
  if (session.respawnAt && now < session.respawnAt) return;
  session.branda = null;
  session.eldric = null;
  spawnEncounter(session);
}

function createSession(owner) {
  const area = new TitansArea(owner.getUsername?.());
  const session = {
    area, players: [owner], branda: null, eldric: null,
    spawnedAt: 0, fight: null, over: false, respawnAt: 0, claimedBy: null,
    rows: new Map(), minions: new Set(),
  };
  sessions.set(area, session);
  return session;
}

function destroySession(session) {
  if (!session) return;
  sessions.delete(session.area);
  Hud.dropSession(session);
  if (session.area?.isDestroyed?.() !== true) session.area.destroy();
}

/** A player leaves: Titan Killer streaks reset. Logout keeps membership so a reconnect
 * lands back in a live fight (the streak still fails); the instance dies with its last
 * logout. */
function leave(player, area, logout = false) {
  const session = area instanceof TitansArea ? sessions.get(area) : sessionOfPlayer(player);
  if (session) {
    CombatAchievements.left(player, session);
    Hud.dropFor(player);
    // The dying haven't left: keep them listed until the respawn move removes them,
    // so death drops still resolve to this session.
    const dead = (player.getHitpoints?.() ?? 1) <= 0 && logout !== true;
    if (logout) {
      player.setAttribute?.(ATTR_INSIDE, true);
    } else if (!dead) {
      session.players = session.players.filter((member) => nameOf(member)?.toLowerCase?.() !== nameOf(player)?.toLowerCase?.());
      player.setAttribute?.(ATTR_INSIDE, null);
    }
    player.getCombat?.().getHitQueue?.()?.clear?.();
    const anyoneOnline = session.players.some((member) => member?.isRegistered?.());
    if (!anyoneOnline) {
      destroySession(session);
      return;
    }
    return;
  }
  player.setAttribute?.(ATTR_INSIDE, null);
}

/** Logging out inside puts the player back in a live fight, else outside (Yama precedent). */
function recoverOnLogin({ player }) {
  if (player.getAttribute?.(ATTR_INSIDE) !== true) return;
  const owner = player.getAttribute?.(ATTR_SESSION_OWNER) ?? nameOf(player);
  for (const session of sessions.values()) {
    if (session.area?.isDestroyed?.() === true) continue;
    const member = session.players.map(nameOf).filter(Boolean).map((name) => name.toLowerCase());
    if (member.includes(String(owner ?? "").toLowerCase()) || member.includes(String(nameOf(player) ?? "").toLowerCase())) {
      player.moveTo(arenaLocation(session.area, Shared.ARENA_ENTRY[0], Shared.ARENA_ENTRY[1], Shared.ARENA_ENTRY[2]));
      CombatAchievements.joined(player, session);
      Hud.showFor(player, session);
      return;
    }
  }
  player.setAttribute?.(ATTR_INSIDE, null);
  player.setAttribute?.(ATTR_SESSION_OWNER, null);
  player.moveTo(new core.Location(Shared.OUTSIDE_LANDING[0], Shared.OUTSIDE_LANDING[1], Shared.OUTSIDE_LANDING[2]));
}

/** Unsafe death in the instance: drops land at the grave tile outside (Colosseum precedent). */
function redirectDeathDrops(event) {
  const player = event?.player;
  if (!player || !event.dropEligible) return;
  const session = sessionOfPlayer(player);
  let inside = !!session;
  if (!inside) {
    try {
      inside = insideArenaBounds(player);
    } catch (error) {
      inside = false;
    }
  }
  if (!inside) return;
  // Explicit null area: the default is the player's (instance) area, which is wiped.
  api.getItemOnGroundManager().registerLocation(
    event.player, event.item,
    new core.Location(Shared.OUTSIDE_LANDING[0], Shared.OUTSIDE_LANDING[1], Shared.OUTSIDE_LANDING[2]), null);
  event.handled = true;
}

function countDeath(event) {
  const player = event?.player;
  if (player && sessionOfPlayer(player)) {
    player.setAttribute?.(ATTR_DEATHS, (Number(player.getAttribute?.(ATTR_DEATHS)) || 0) + 1);
    world.deaths += 1;
    CombatAchievements.died(player);
    Hud.dropFor(player);
  }
}

function moveInto(session, player) {
  const area = session.area;
  player = resolvePlayer(player);
  if (!player || typeof player.setAttribute !== "function" || typeof player.moveTo !== "function") {
    console.info("[royal-diag] moveInto refused: unresolvable player");
    return;
  }
  if (!session.players.some((member) => nameOf(member)?.toLowerCase?.() === nameOf(player)?.toLowerCase?.())) {
    session.players.push(player);
    CombatAchievements.joined(player, session);
    Hud.showFor(player, session);
  }
  player.setAttribute?.(Shared.ATTR_AREA, area);
  player.setAttribute?.(ATTR_INSIDE, true);
  player.setAttribute?.(ATTR_SESSION_OWNER, nameOf(session.players[0] ?? player));
  // A new instance restarts the Titan Killer streak (Wiki: 15 kills in one instance).
  player.setAttribute?.(Shared.ATTR_STREAK, 0);
  player.setAttribute?.(Shared.ATTR_STREAK_FAILED, null);
  area.enter(player);
  player.moveTo(arenaLocation(area, Shared.ARENA_ENTRY[0], Shared.ARENA_ENTRY[1], Shared.ARENA_ENTRY[2]));
  fade(player, true);
  fade(player, false);
  player.getPacketSender?.()?.sendVarbit?.(MINIMAP_VARBIT, MINIMAP_OFF);
  api.emitCustomEvent("music:unlock-track", { player, trackId: MUSIC_IN_THE_PITS });
  player.getPacketSender?.()?.sendSong?.(MUSIC_IN_THE_PITS);
  ensureEncounter(player, area);
}

/** Fresh fight if none is running, else the partner's live one (join rules apply). */
function findJoinable() {
  for (const session of sessions.values()) {
    if (session.area?.isDestroyed?.() === true) continue;
    // Never join a zombie: at least one member must still be online in the fight.
    if (!session.players.some((member) => member?.isRegistered?.())) continue;
    if (!session.branda && !session.eldric) return session;
    const fresh = [session.branda, session.eldric].every((npc) =>
      alive(npc)
      && npc.getAttribute?.(Shared.ATTR_TELEPORTED) !== true
      && (npc.getHitpoints?.() ?? 0) >= Shared.JOIN_MIN_HITPOINTS);
    if (fresh && session.players.length < 2) return session;
  }
  return null;
}

const resolvePlayer = (player) => Shared.resolvePlayer(core, player);

/** Captured fade out (exit) / out-then-in (entry), 50 cycles like the captures. */
function fade(player, out) {
  const args = out ? [0, 255, 0, 0, FADE_CYCLES] : [0, 0, 0, 255, FADE_CYCLES];
  player.getPacketSender?.()?.sendSubInterface?.(OVERLAY_ATMOSPHERE_UID, FADE_OVERLAY, 1, {
    postScripts: [{ scriptId: FADE_SCRIPT, args }],
  });
}

function warnAndEnter(rawPlayer, session) {
  const player = resolvePlayer(rawPlayer);
  const proceed = () => {
    player.getPacketSender().sendInterfaceRemoval();
    player.getPacketSender().sendVarbit(Shared.ENTER_WARNING_VARBIT, 1);
    moveInto(session, player);
  };
  const manager = player.getDialogueManager?.();
  if (manager) {
    player.getDialogueManager().startDialogues(new core.DialogueChainBuilder().add(
      new core.StatementDialogue(0, Shared.WARNING_MESSAGE),
      new core.ActionDialogue(1, { execute: proceed }),
    ));
    return;
  }
  // Headless players (agent MCP) carry no dialogue manager: message, then enter.
  try {
    player.sendMessage(Shared.WARNING_MESSAGE);
  } catch (error) {}
  proceed();
}

function startFight(player) {
  leave(player, null);
  warnAndEnter(player, createSession(player));
}

/** Join a partner's fight, or start a fresh one when none is joinable. */
function joinFight(player) {
  const joinable = findJoinable();
  if (!joinable) {
    startFight(player);
    return;
  }
  leave(player, null);
  warnAndEnter(player, joinable);
}

function entranceMenu({ player }) {
  api.sendMultiChatboxPrompt(player, Shared.MENU_TITLE,
    Shared.MENU_OPTIONS[0], () => startFight(player),
    Shared.MENU_OPTIONS[1], () => joinFight(player),
    Shared.MENU_OPTIONS[2], () => {});
  return true;
}

/** Quick-start skips the menu but never the warning; it always starts your own
 * fresh fight, never a stranger's (Join a fight is the explicit duo path). */
function quickStart({ player }) {
  leave(player, null);
  warnAndEnter(player, createSession(player));
  return true;
}

/** The critical-stage box refuses entry past the join point (docs assumption 2). */
function critical({ player }) {
  player = resolvePlayer(player);
  const manager = player.getDialogueManager?.();
  if (manager) {
    player.getDialogueManager().startDialogues(new core.DialogueChainBuilder().add(
      new core.StatementDialogue(0, Shared.CRITICAL_MESSAGE),
    ));
  } else {
    try {
      player.sendMessage(Shared.CRITICAL_MESSAGE);
    } catch (error) {}
  }
  return true;
}

function entranceOption({ player }) {
  for (const session of sessions.values()) {
    if (session.players.some((member) => nameOf(member)?.toLowerCase?.() === nameOf(player)?.toLowerCase?.())) return true;
  }
  const joinable = findJoinable();
  if (!joinable && [...sessions.values()].some((session) => session.branda || session.eldric)) {
    return critical({ player });
  }
  return entranceMenu({ player });
}

function exitLeave({ player }) {
  const session = sessionOfPlayer(player);
  if (!session) return false;
  fade(player, true);
  player.moveTo(new core.Location(Shared.OUTSIDE_LANDING[0], Shared.OUTSIDE_LANDING[1], Shared.OUTSIDE_LANDING[2]));
  player.getPacketSender?.()?.sendVarbit?.(MINIMAP_VARBIT, MINIMAP_ON);
  return true;
}

/** op1 (Inspect) only ever hints; op2 (Quick-escape) leaves (captured). */
function exitEscape({ player }) {
  const session = sessionOfPlayer(player);
  if (!session) return false;
  player.sendMessage(Shared.ESCAPE_HINT);
  return true;
}

function personal(player) {
  return {
    kills: Number(player.getAttribute?.(Shared.ATTR_KILLS)) || 0,
    deaths: Number(player.getAttribute?.(ATTR_DEATHS)) || 0,
    best: Number(player.getAttribute?.(Shared.ATTR_BEST_TICKS)) || 0,
  };
}

function formatBest(ticks) {
  if (!(ticks > 0)) return "-";
  return Shared.formatTicks(ticks);
}

function number(value) {
  return value > 0 ? value.toLocaleString("en-US") : "0";
}

/** The statistics board by the tunnel (interface 909, captured fields). */
function readScoreboard({ player }) {
  const mine = personal(player);
  const sender = player.getPacketSender();
  sender.sendInterface(SCOREBOARD_INTERFACE);
  sender.sendString("Royal Titans Statistics", uid(SCOREBOARD_COMPONENT.title));
  sender.sendString(number(mine.kills), uid(SCOREBOARD_COMPONENT.pkc));
  sender.sendString(number(mine.deaths), uid(SCOREBOARD_COMPONENT.pd));
  sender.sendString(formatBest(mine.best), uid(SCOREBOARD_COMPONENT.pbt));
  sender.sendString(world.kills.toLocaleString("en-US"), uid(SCOREBOARD_COMPONENT.gkc));
  sender.sendString(world.deaths.toLocaleString("en-US"), uid(SCOREBOARD_COMPONENT.gd));
  sender.sendString(formatBest(world.best), uid(SCOREBOARD_COMPONENT.gbt));
  return true;
}

function interact(event) {
  const id = event?.object?.getId?.() ?? event?.definition?.getId?.() ?? null;
  // Object clicks arrive with clickType (1/2/3); option text is not always set.
  const click = Number(event?.clickType) || 0;
  const player = resolvePlayer(event?.player);
  if (id === Shared.ENTRANCE_OBJECT) {
    if (click === 3) return quickStart({ player });
    if (click === 2) return joinFight({ player });
    return entranceOption({ player });
  }
  if (id === Shared.EXIT_OBJECT) {
    if (click === 1) return exitEscape({ player });
    return exitLeave({ player });
  }
  if (id === Shared.SCOREBOARD_OBJECT) return readScoreboard({ player });
  return false;
}

/** Quick-escape (op2) must work from anywhere: route the click onto the player's own tile
 * so the interaction fires at once instead of pathing to the tunnel (static titans and
 * walls can block the approach). op1 Inspect keeps the normal reach. */
function quickEscapeRoute(event) {
  if (event?.objectId !== Shared.EXIT_OBJECT || event.clickType !== 2) return;
  const at = event.player?.getLocation?.();
  if (!at) return;
  event.destination = { x: at.getX(), y: at.getY(), z: at.getZ() };
}

function attach(pluginApi) {
  api = pluginApi;
  core = pluginApi.core;
  defineAreaClass();
  pluginApi.persistAttribute(Shared.ATTR_KILLS);
  pluginApi.persistAttribute(Shared.ATTR_BEST_TICKS);
  pluginApi.persistAttribute(Shared.ATTR_STREAK);
  pluginApi.persistAttribute(ATTR_INSIDE);
  pluginApi.persistAttribute(ATTR_DEATHS);
  pluginApi.persistAttribute(ATTR_SESSION_OWNER);
  pluginApi.onObjectInteraction(interact);
  pluginApi.onObjectRoute(quickEscapeRoute);
  pluginApi.onPlayerLogin(recoverOnLogin);
  pluginApi.onPlayerDeathItemDrop(redirectDeathDrops);
  pluginApi.onPlayerDeath(countDeath);
}

module.exports = {
  attach, sessions, world, sessionOfPlayer, sessionOfNpc, spawnEncounter, ensureEncounter,
  leave, moveInto, findJoinable, readScoreboard, interact, retarget,
  _test: { personal, findJoinable, sessions },
};
