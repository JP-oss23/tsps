/**
 * Phase 1: the five passive body segments. They never attack; each death plays
 * huey_body_death(_diag) with the loc removed, and when all five are down the barrier
 * breaks open the summit path (barrier loc 55206 at (1515, 3268): damage anims, then
 * transition 11700). Late joiners past this point take the contribution cut (docs).
 */
const Shared = require("./Shared.Hueycoatl");

let api = null;
let core = null;

function alive(entity) {
  return !!entity?.isRegistered?.() && (entity.getHitpoints?.() ?? 1) > 0;
}

function sessionOf(npc) {
  return npc?.getAttribute?.(Shared.ATTR_SESSION) ?? null;
}

/** All five segments dead in this session's area. */
function allSegmentsDown(session) {
  if (!session || !Array.isArray(session.segments)) return false;
  return session.segments.length > 0 && session.segments.every((npc) => !alive(npc));
}

function openSummit(session) {
  if (!session || session.summitOpen) return;
  session.summitOpen = true;
  for (const player of session.players ?? []) {
    player.sendMessage?.("The tail withdraws, clearing the path to the summit!");
  }
}

function onNpcDeath(event) {
  const npc = event?.npc ?? null;
  if (!npc || npc.getId?.() !== Shared.BODY_ID) return;
  const session = sessionOf(npc);
  if (!session) return;
  if (allSegmentsDown(session)) openSummit(session);
}

function attach(pluginApi) {
  api = pluginApi;
  core = pluginApi.core;
  pluginApi.onNpcDeath(onNpcDeath);
}

module.exports = { attach, allSegmentsDown, openSummit, onNpcDeath };
