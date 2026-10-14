/**
 * Developer commands for testing the Hueycoatl (docs/hueycoatl.md Testing).
 * ::hueyhp sets head HP (1250 or less arms the shield); ::hueykill leaves the head
 * and tail at 1 HP so the player lands the final hits; ::hueytail forces the shield;
 * ::hueyshock forces the next shockwave; ::hueybuff lights the braziers.
 */
const Shared = require("./Shared.Hueycoatl");
const Area = require("./Area.Hueycoatl");

let core = null;

function liveFighters(player) {
  let session = Area.sessionOfPlayer(player);
  if (!session) {
    session = Area.ensureSession(player, false);
    Area.bindNearby(session);
  } else {
    Area.bindNearby(session);
  }
  const all = [...(session.segments ?? [])];
  if (session.head) all.push(session.head);
  if (session.tail) all.push(session.tail);
  return { session, npcs: all.filter((npc) => npc && npc.isRegistered?.() && (npc.getHitpoints?.() ?? 0) > 0) };
}

function hueykill({ player }) {
  const { npcs } = liveFighters(player);
  if (npcs.length === 0) {
    player.sendMessage("You have no active Hueycoatl.");
    return true;
  }
  for (const npc of npcs) npc.setHitpoints(1);
  player.sendMessage("The Hueycoatl is down to its last hitpoints. Finish it.");
  return true;
}

function hueyhp({ player, parts }) {
  const { npcs } = liveFighters(player);
  const head = npcs.find((npc) => Shared.isHead(npc.getId?.()));
  if (!head) {
    player.sendMessage("You have no active Hueycoatl head.");
    return true;
  }
  const hitpoints = Number(parts?.[1]);
  if (!Number.isInteger(hitpoints) || hitpoints < 1 || hitpoints > Shared.HEAD_HITPOINTS) {
    player.sendMessage(`Use ::hueyhp <hitpoints 1-${Shared.HEAD_HITPOINTS}>.`);
    return true;
  }
  head.setHitpoints(hitpoints);
  const TailPhase = require("./TailPhase.Hueycoatl");
  const shielded = hitpoints <= Shared.SHIELD_THRESHOLD ? TailPhase.raiseShield(head) : false;
  player.sendMessage(`The Hueycoatl head now has ${hitpoints} hitpoints${shielded ? " (shielded)" : ""} (reads back ${head.getHitpoints?.()}).`);
  return true;
}

function hueytail({ player }) {
  const { npcs } = liveFighters(player);
  const head = npcs.find((npc) => npc.getId?.() === Shared.HEAD_ID);
  if (!head) {
    player.sendMessage("You have no vulnerable Hueycoatl head.");
    return true;
  }
  const TailPhase = require("./TailPhase.Hueycoatl");
  TailPhase.raiseShield(head);
  player.sendMessage("The Hueycoatl shields itself; break the tail.");
  return true;
}

function hueyshock({ player }) {
  const { session } = liveFighters(player);
  if (!session?.tail) {
    player.sendMessage("The tail is not out.");
    return true;
  }
  const TailPhase = require("./TailPhase.Hueycoatl");
  TailPhase.startShockwave(session.tail, player);
  player.sendMessage("The tail slams the ground.");
  return true;
}

function hueybuff({ player }) {
  const session = Area.sessionOfPlayer(player);
  if (!session) {
    player.sendMessage("You have no active Hueycoatl.");
    return true;
  }
  session.braziersLit = true;
  player.sendMessage("The braziers are lit (30% damage).");
  return true;
}

module.exports = function attachCommands(api) {
  core = api.core;
  api.registerCommand("hueykill", hueykill, api.core.PlayerRights.DEVELOPER, "Defeat your active Hueycoatl");
  api.registerCommand("hueyhp", hueyhp, api.core.PlayerRights.DEVELOPER, "Set the Hueycoatl head hitpoints");
  api.registerCommand("hueytail", hueytail, api.core.PlayerRights.DEVELOPER, "Force the Hueycoatl shield phase");
  api.registerCommand("hueyshock", hueyshock, api.core.PlayerRights.DEVELOPER, "Force a tail shockwave");
  api.registerCommand("hueybuff", hueybuff, api.core.PlayerRights.DEVELOPER, "Light the Hueycoatl braziers");
};
