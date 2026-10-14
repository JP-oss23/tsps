/**
 * The Royal Titans: Branda the Fire Queen and Eldric the Ice King in the Asgarnian Ice
 * Dungeon (https://oldschool.runescape.wiki/w/Royal_Titans). A 1-2 player instance behind
 * the entrance tunnel: melee stomps with a shared 5x3 telegraph, elemental rows and
 * elementals while mobile, the teleport onto the arena at 35% with the arena-wide
 * Elemental Blast, and one corpse claim (Loot / Sacrifice / Take pages) per player per
 * kill with contribution-scaled drops. Combat Achievements are decided by the fight
 * (CombatAchievements.RoyalTitans.js). Full behaviour in docs/royal-titans.md.
 */
const Area = require("./royal-titans/Area.RoyalTitans");
const Combat = require("./royal-titans/Combat.RoyalTitans");
const Specials = require("./royal-titans/Specials.RoyalTitans");
const Minions = require("./royal-titans/Minions.RoyalTitans");
const Corpse = require("./royal-titans/Corpse.RoyalTitans");
const Hud = require("./royal-titans/Hud.RoyalTitans");
const Commands = require("./royal-titans/Commands.RoyalTitans");
const CombatAchievements = require("./royal-titans/CombatAchievements.RoyalTitans");

module.exports = {
  name: "RoyalTitans",
  members: true,
  register(api) {
    Combat.attach(api);
    Specials.attach(api);
    Minions.attach(api);
    Corpse.attach(api);
    Area.attach(api);
    Hud.attach(api);
    CombatAchievements.attach(api);
    Commands(api);
  },
};
