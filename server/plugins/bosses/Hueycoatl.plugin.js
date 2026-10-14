/**
 * The Hueycoatl: the draconic serpent atop the Darkfrost in Varlamore
 * (https://oldschool.runescape.wiki/w/The_Hueycoatl). A shared public arena for up to
 * 20 plus private flag instances: five passive body segments, the head with mixed
 * melee/magic/range autos, glowing symbols and Rain Fire, pillar braziers for a 30%
 * buff, the 50% shield with the capped tail and its shockwaves, kill count and loot.
 * Full behaviour in docs/hueycoatl.md.
 */
const Area = require("./hueycoatl/Area.Hueycoatl");
const Combat = require("./hueycoatl/Combat.Hueycoatl");
const BodyPhase = require("./hueycoatl/BodyPhase.Hueycoatl");
const Pillars = require("./hueycoatl/Pillars.Hueycoatl");
const TailPhase = require("./hueycoatl/TailPhase.Hueycoatl");
const Corpse = require("./hueycoatl/Corpse.Hueycoatl");
const CombatAchievements = require("./hueycoatl/CombatAchievements.Hueycoatl");
const Commands = require("./hueycoatl/Commands.Hueycoatl");

module.exports = {
  name: "Hueycoatl",
  members: true,
  register(api) {
    Combat.attach(api);
    BodyPhase.attach(api);
    Pillars.attach(api);
    TailPhase.attach(api);
    Corpse.attach(api);
    Area.attach(api);
    CombatAchievements.attach(api);
    Commands(api);
  },
};
