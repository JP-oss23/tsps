/**
 * The Hueycoatl's ground: base camp, the chains, the shared public arena and private
 * flag instances, the exit slide, the scoreboard and Taala's gate dialogue.
 *
 * As captured: the chains (55401) at (1527, 3285) — op1 climbs through to (1528, 3284)
 * with huey_in_area on, multiway on and music 801; op2 plays Taala's first-visit warning;
 * op3 peeks the count/phase box. The slide (55234) exactmoves to (1524, 3290) with the
 * knockdown loop, both slide messages, area off, music 813. The scoreboard (55198) opens
 * interface 884. The flag creator (55203) offers public/solo/join/cancel. Deaths are
 * unsafe with the grave at base camp (tsps has no graves: drops land at the camp tile,
 * Doom precedent); logout inside returns outside the entrance (Yama precedent).
 */
const Shared = require("./Shared.Hueycoatl");

const CAMP_BOUNDS = Object.freeze({ minX: 1495, maxX: 1545, minY: 3265, maxY: 3300 });
const SCOREBOARD_INTERFACE = 884;
const SCOREBOARD_COMPONENT = Object.freeze({
  title: 6, close: 2, pkc: 9, pd: 11, pbt: 13, gkc: 15, gd: 17, gbt: 19,
});
const MINIMAP_VARBIT = 6719;
const MUSIC_ENTRY = 801;
const MUSIC_EXIT = 813;
const TAALA_ID = 14007;
const PRIVATE_FEE = 50000;
const PRIVATE_FEE_CA = 25000;

const ATTR_INSIDE = "hueycoatl:inside";
const ATTR_DEATHS = "hueycoatl:deaths";
const ATTR_PRIVATE = "hueycoatl:private";
const ATTR_SEEN = "hueycoatl:seen";

let api = null;
let core = null;
let HueycoatlArea = null;
/** area -> session { area, players, private, spawnedAt, over } for live areas. */
const sessions = new Map();
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

function nameOf(player) {
  try {
    if (!player || typeof player !== "object") return typeof player === "string" ? player : null;
    if ("player" in player && player.player !== player) return nameOf(player.player);
    return player?.getUsername?.() ?? null;
  } catch (error) {
    return null;
  }
}

function inBounds(player) {
  try {
    const at = player?.getLocation?.();
    if (!at || (at.getZ?.() ?? 0) !== 0) return false;
    const x = at.getX();
    const y = at.getY();
    return x >= CAMP_BOUNDS.minX && x <= CAMP_BOUNDS.maxX && y >= CAMP_BOUNDS.minY && y <= CAMP_BOUNDS.maxY;
  } catch (error) {
    return false;
  }
}

function sessionOfPlayer(player) {
  const name = nameOf(player)?.toLowerCase?.();
  for (const session of sessions.values()) {
    if (session.area?.isDestroyed?.() === true) continue;
    if (name && session.players.some((member) => nameOf(member)?.toLowerCase?.() === name)) return session;
    if (!name && player && inBounds(player)) return session;
  }
  return null;
}

function defineAreaClass() {
  class HueycoatlPrivateArea extends core.PrivateArea {
    constructor(ownerName) {
      super([new core.Boundary(CAMP_BOUNDS.minX, CAMP_BOUNDS.maxX, CAMP_BOUNDS.minY, CAMP_BOUNDS.maxY, 0)]);
      this.ownerName = ownerName ?? "unknown";
    }

    destroy() {
      if (this.isDestroyed?.() === true) return;
      try {
        super.destroy();
      } catch (error) { /* already gone */ }
    }
  }
  HueycoatlArea = HueycoatlPrivateArea;
}

function trackPlayer(session, player) {
  if (!session) return;
  const name = nameOf(player)?.toLowerCase?.();
  if (!name) return;
  if (!session.players.some((member) => nameOf(member)?.toLowerCase?.() === name)) {
    session.players.push(player);
  }
}

function enterArena(player, session) {
  try {
    require("./CombatAchievements.Hueycoatl").fightStarted(player, session);
  } catch (error) { /* CA optional */ }
  player.moveTo(new core.Location(Shared.ARENA_ENTRY[0], Shared.ARENA_ENTRY[1], Shared.ARENA_ENTRY[2]));
  player.getPacketSender?.().sendVarbit?.(Shared.HUEY_IN_AREA_VARBIT, 1);
  player.getPacketSender?.().sendVarbit?.(MINIMAP_VARBIT, 0);
  player.getPacketSender?.().sendSong?.(MUSIC_ENTRY);
  player.setAttribute(ATTR_INSIDE, true);
  if (session) trackPlayer(session, player);
  if (player.getAttribute?.(ATTR_SEEN) !== 1) {
    player.setAttribute(ATTR_SEEN, 1);
    player.getPacketSender?.().sendVarbit?.(Shared.HUEY_ENCOUNTERED_VARBIT, 1);
    player.getPacketSender?.().sendVarbit?.(Shared.HUEY_INTRO_VARBIT, 1);
  }
}

function leaveArena(player, session) {
  player.setAttribute(ATTR_INSIDE, false);
  player.getPacketSender?.().sendVarbit?.(Shared.HUEY_IN_AREA_VARBIT, 0);
  player.getPacketSender?.().sendVarbit?.(MINIMAP_VARBIT, 2);
  const name = nameOf(player)?.toLowerCase?.();
  if (session && name) {
    session.players = session.players.filter((member) => nameOf(member)?.toLowerCase?.() !== name);
    if (session.private && session.players.length === 0) {
      try {
        session.area?.destroy?.();
      } catch (error) { /* already gone */ }
      sessions.delete(session.area);
    }
  }
}

/** Taala's gate line (captured verbatim, 234/03274). */
function taalaGate({ player }) {
  const { DialogueChainBuilder, NpcDialogue } = core;
  player.getDialogueManager().startDialogues(new DialogueChainBuilder().add(
    new NpcDialogue(0, TAALA_ID, "Excuse me, human! Perhaps you shouldn't just go wandering through there without knowing what you're dealing with!"),
  ));
  return true;
}

function entranceEnter({ player }) {
  let session = sessionOfPlayer(player);
  if (!session) session = ensureSession(player, false);
  enterArena(player, session);
  return true;
}

/** Quick-climb: first visit gets Taala's gate, afterwards straight in. */
function entranceQuick({ player }) {
  if (player.getAttribute?.(ATTR_SEEN) !== 1) return taalaGate({ player });
  return entranceEnter({ player });
}

function entrancePeek({ player }) {
  const text = "There are 0 adventurers ascending the mountain.<br>The Hueycoatl is preparing itself!";
  const manager = player.getDialogueManager?.();
  if (manager) {
    player.getDialogueManager().startDialogues(new core.DialogueChainBuilder().add(
      new core.StatementDialogue(0, text),
    ));
  } else {
    try {
      player.sendMessage(text);
    } catch (error) { /* ignore */ }
  }
  return true;
}

function exitSlide({ player }) {
  const session = sessionOfPlayer(player);
  player.performAnimation?.(new core.Animation(7211));
  later(3, player, () => {
    player.moveTo(new core.Location(Shared.CAMP_LANDING[0], Shared.CAMP_LANDING[1], Shared.CAMP_LANDING[2]));
    player.sendMessage?.("You slide down the slope...");
    player.sendMessage?.("... and land skillfully.");
    player.getPacketSender?.().sendSong?.(MUSIC_EXIT);
    leaveArena(player, session);
  });
  return true;
}

function readScoreboard({ player }) {
  const sender = player.getPacketSender?.();
  if (!sender) return false;
  sender.sendInterface?.(SCOREBOARD_INTERFACE);
  const text = (component, value) => sender.sendString?.(String(value), uid(component));
  text(SCOREBOARD_COMPONENT.title, "The Hueycoatl - Statistics");
  const kills = player.getAttribute?.(Shared.ATTR_KILLS) ?? 0;
  const deaths = player.getAttribute?.(ATTR_DEATHS) ?? 0;
  const best = player.getAttribute?.(Shared.ATTR_BEST);
  text(SCOREBOARD_COMPONENT.pkc, kills > 0 ? kills.toLocaleString("en-US") : "0");
  text(SCOREBOARD_COMPONENT.pd, deaths > 0 ? deaths.toLocaleString("en-US") : "0");
  text(SCOREBOARD_COMPONENT.pbt, best > 0 ? Shared.formatTicks(best) : "-");
  text(SCOREBOARD_COMPONENT.gkc, world.kills.toLocaleString("en-US"));
  text(SCOREBOARD_COMPONENT.gd, world.deaths.toLocaleString("en-US"));
  text(SCOREBOARD_COMPONENT.gbt, world.best > 0 ? Shared.formatTicks(world.best) : "-");
  return true;
}

function startPublic({ player }) {
  const session = ensureSession(player, false);
  enterArena(player, session);
}

function startSolo({ player }) {
  try {
    const area = new HueycoatlArea(nameOf(player));
    const session = { area, players: [], private: true, spawnedAt: 0, over: false, segments: [], head: null, tail: null, summitOpen: false, braziersLit: false, damage: {} };
    sessions.set(area, session);
    spawnFightSet(session, area);
    enterArena(player, session);
  } catch (error) {
    const session = ensureSession(player, false);
    enterArena(player, session);
  }
}

function flagMenu({ player }) {
  api.sendMultiChatboxPrompt?.(player, "Select an option",
    "Start a public/friends fight (based on privacy setting).", () => startPublic({ player }),
    "Start a solo fight.", () => startSolo({ player }),
    "Join a public/friends fight.", () => startPublic({ player }),
    "Cancel.", () => {});
  return true;
}

function interact(event) {
  const id = event?.object?.getId?.() ?? event?.definition?.getId?.() ?? null;
  const click = Number(event?.clickType) || 0;
  const player = event?.player ?? null;
  if (id === Shared.ENTRANCE_OBJECT) {
    if (click === 3) return entrancePeek({ player });
    if (click === 2) return entranceQuick({ player });
    return entranceEnter({ player });
  }
  if (id === Shared.EXIT_SHORTCUT_OBJECT) {
    if (click === 1 || click === 2) return exitSlide({ player });
    return false;
  }
  if (id === Shared.SCOREBOARD_OBJECT) return readScoreboard({ player });
  if (id === Shared.FLAG_CREATOR_OBJECT) return flagMenu({ player });
  return false;
}

function recoverOnLogin(event) {
  const player = event?.player ?? event;
  if (!player) return;
  if (player.getAttribute?.(ATTR_INSIDE) === true) {
    player.setAttribute(ATTR_INSIDE, false);
    player.getPacketSender?.().sendVarbit?.(Shared.HUEY_IN_AREA_VARBIT, 0);
  }
}

function redirectDeathDrops(event) {
  const player = event?.player ?? null;
  if (!player || !inBounds(player) || !event?.dropEligible) return;
  world.deaths += 1;
  try {
    const { ItemOnGroundManager } = core;
    ItemOnGroundManager?.registerLocation?.(player, event.item, new core.Location(1528, 3289, 0));
  } catch (error) { /* fall through to default handling */ return; }
  event.handled = true;
}

function countDeath(event) {
  const player = event?.player ?? null;
  if (!player || !inBounds(player)) return;
  player.setAttribute(ATTR_DEATHS, (player.getAttribute?.(ATTR_DEATHS) ?? 0) + 1);
}

function ensureSession(player, isPrivate) {
  if (!isPrivate) {
    let session = sessions.get("public") ?? null;
    if (!session || session.area?.isDestroyed?.() === true) {
      session = { area: null, players: [], private: false, spawnedAt: 0, over: false, segments: [], head: null, tail: null, summitOpen: false, braziersLit: false, damage: {} };
      sessions.set("public", session);
      bindNearby(session);
      spawnFightSet(session, null);
    }
    return session;
  }
  return null;
}

/** Bind nearby static fight NPCs (public head/seer) into the session. */
function bindNearby(session) {
  if (!session) return;
  try {
    for (const npc of core.World.getNpcs()) {
      const id = npc?.getId?.();
      if (id !== Shared.HEAD_ID && id !== Shared.BODY_ID && id !== Shared.SEER_ID && id !== Shared.TAIL_ID) continue;
      const at = npc.getLocation?.();
      if (!at || at.getX() < CAMP_BOUNDS.minX || at.getX() > CAMP_BOUNDS.maxX) continue;
      if (at.getY() < CAMP_BOUNDS.minY || at.getY() > CAMP_BOUNDS.maxY) continue;
      npc.setAttribute?.(Shared.ATTR_SESSION, session);
      if (id === Shared.HEAD_ID && !session.head) session.head = npc;
      if (id === Shared.TAIL_ID && !session.tail) session.tail = npc;
      if (id === Shared.BODY_ID && Array.isArray(session.segments) && !session.segments.includes(npc)) session.segments.push(npc);
    }
  } catch (error) { /* best effort */ }
}

/** Spawn the fight set: 5 body segments (+ head/seer already static on public). */
function spawnFightSet(session, area) {
  if (!session || session.segments.length > 0) return;
  for (const [x, y, z] of Shared.BODY_SPAWNS) {
    try {
      const npc = api.spawnNpc({ id: Shared.BODY_ID, x, y, z, wanderRadius: 0 });
      if (!npc) continue;
      npc.__skipDefaultRespawn = true;
      npc.setAttribute?.(Shared.ATTR_SESSION, session);
      if (area?.add) area.add(npc);
      session.segments.push(npc);
    } catch (error) { /* keep the rest */ }
  }
}

function spawnTail(session, area, east) {
  const at = east === false ? Shared.TAIL_SPAWN_WEST : Shared.TAIL_SPAWN_EAST;
  try {
    const npc = api.spawnNpc({ id: Shared.TAIL_ID, x: at[0], y: at[1], z: at[2], wanderRadius: 0 });
    if (!npc) return null;
    npc.__skipDefaultRespawn = true;
    npc.setAttribute?.(Shared.ATTR_SESSION, session);
    npc.setAttribute?.(Shared.ATTR_PHASE, 3);
    if (area?.add) area.add(npc);
    if (session) session.tail = npc;
    return npc;
  } catch (error) {
    return null;
  }
}

function attach(pluginApi) {
  api = pluginApi;
  core = pluginApi.core;
  defineAreaClass();
  pluginApi.persistAttribute(Shared.ATTR_KILLS);
  pluginApi.persistAttribute(Shared.ATTR_BEST);
  pluginApi.persistAttribute(Shared.ATTR_CLAIMED);
  pluginApi.persistAttribute(ATTR_INSIDE);
  pluginApi.persistAttribute(ATTR_DEATHS);
  pluginApi.persistAttribute(ATTR_PRIVATE);
  pluginApi.persistAttribute(ATTR_SEEN);
  pluginApi.onObjectInteraction(interact);
  pluginApi.onPlayerLogin(recoverOnLogin);
  pluginApi.onPlayerDeathItemDrop(redirectDeathDrops);
  pluginApi.onPlayerDeath(countDeath);
}

module.exports = {
  attach,
  sessions,
  world,
  sessionOfPlayer,
  ensureSession,
  bindNearby,
  trackPlayer,
  spawnFightSet,
  spawnTail,
  enterArena,
  leaveArena,
  readScoreboard,
  flagMenu,
  interact,
  CAMP_BOUNDS,
  SCOREBOARD_INTERFACE,
  PRIVATE_FEE,
  PRIVATE_FEE_CA,
  _test: { sessions, world, sessionOfPlayer, inBounds },
};
