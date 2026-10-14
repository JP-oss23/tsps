# The Hueycoatl

Giant draconic serpent coiled around the Darkfrost, Varlamore. Group boss (up to 20, or private instance), four phases across mountainside and summit.

**Status: plan only, not implemented.** Captures: 196 recordings (`hueycoatl.sqlite`), a handful of real fights plus lobby/bank/entrance clicks (see Sources). Data present: NPC identifiers (14009-14017). Data to add: monster stats, drop tables, collection log wiring. Open assumptions: 24, all listed at the bottom with how to confirm each.

## Sources and honesty labels

Every claim below carries one label:

| Label   | Meaning                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [WIKI]  | The OSRS Wiki (The Hueycoatl, The Hueycoatl/Strategies, Fire/Ice elemental pages, Fire/Icicles hazard pages; fetched Oct 2026).                                                                                                                                          |
| [LOG]   | rsprox captures in osrs-captures (`hueycoatl.sqlite`, revs 226-237). Best fights: 234/03274, 235/03399, 235/03400, 237/04052, 237/04054 (head/tail/body actions). The other ~190 are lobby clicks, bank buffalo sessions and single mentions. Ticks are recording ticks. |
| [EST]   | Our reasoned assumption where neither source speaks. Each one says what would confirm it.                                                                                                                                                                                |
| [CACHE] | Verifiable from the game cache (`dump_ops.ts`, dump scripts, identifiers). Not yet run (no tsps cache on disk; `link-cache` pending).                                                                                                                                    |

**World caveat [LOG]: every Hueycoatl fact sheet reports "Only recorded on Leagues, event or beta worlds."** All 17 recordings mentioning `huey_head`/`huey_body_part` carry special-world flags (many are 2025 Forestry/Grid-Master sessions that wander past the Darkfrost). Positions, anims, messages and sequencing transfer directly; treat exact damage numbers, XP and league-flavoured rows (ayak projectiles, league masteries, transmutation spotanims in the sheets) as suspect until confirmed on a live world.

The plugin will be `server/plugins/bosses/Hueycoatl.plugin.js`, with one unit per part of
the fight in `server/plugins/bosses/hueycoatl/`.

| File                     | What it owns                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Shared.Hueycoatl.js`    | Ids, tiles, captured anim/projectile/sound shapes, pure helpers.                                                                                   |
| `Area.Hueycoatl.js`      | Public chain + private flag entry, exit slide, bank buffalo proximity, base-camp NPCs (spawns + wander), logout/death handling, respawn knockback. |
| `Combat.Hueycoatl.js`    | Head autos (melee/magic/range), glowing symbols, Rain Fire prayer mapping.                                                                         |
| `BodyPhase.Hueycoatl.js` | Five passive segments, deaths, barrier break, summit opening.                                                                                      |
| `Pillars.Hueycoatl.js`   | Seer charge bar, pillar/prayer balance, brazier 30% buff.                                                                                          |
| `TailPhase.Hueycoatl.js` | Shield, tail damage cap, side swaps, shockwaves.                                                                                                   |
| `Corpse.Hueycoatl.js`    | Defeat, kill count, loot distribution, respawn.                                                                                                    |
| `Commands.Hueycoatl.js`  | Developer commands for testing (proposal, see Testing).                                                                                            |

Boss-HUD behaviour reuses the `BossHud` plugin events (`boss-hud:show/update/hide/reset`); no dedicated Hud unit (the HUD follows the head, standard `hp_hud_open` captured on attacks [LOG]).

## Stats [WIKI]

| Part          | NPC id | Combat | Size | HP   | Max hit | Style              |
| ------------- | ------ | ------ | ---- | ---- | ------- | ------------------ |
| Head (normal) | 14009  | 642    | 7    | 2500 | 14      | Melee/Magic/Ranged |

  Id discrepancy [LOG vs WIKI]: the wiki infobox lists head versions as 14009, 14010, 14013, but logs show **14010 = `huey_head_respawn_placeholder`** (intermission marker) and **14013 was never observed** (0 /api/search hits, 0 samples in 196 recs). Treat 14009 as the only live head until the cache says otherwise.
| Head (shielded) | 14011 | 642 | 7 | — (same pool) | — | — |
| Head (defeated) | 14012 | — | — | — | — | — |
| Body segment ×5 | 14017 | 642 | 1 | 250 each | 13 | None (passive) |
| Tail (normal) | 14014 | 642 | 5 | 300 | 25 typeless | Varies (shockwave) |
| Tail (broken) | 14015 | — | — | — | — | — |

Shared block: att 150, str 50, def 125, mage 50, range 50; attbns 100, strbns 50, amagic 200, mbns 50, arange 250, rngbns 50. Defences: stab/slash 100, **crush 0** (weakest — DH lance BiS barring scythe), magic 200, light/standard/heavy 350. **60% earth weakness** [WIKI]. Immune cannon, poison, venom, freeze; thralls NOT immune. Zero poison/venom/burn/cannon events touch any boss part across 196 recs (cannon references are inventory/varp noise from the owners' sessions) [LOG absence, consistent]. Defence drain caps at −5 (don't bring drains; bring damaging specs) [WIKI]. Attack speed is listed as "Varies" [WIKI] — captures show head autos landing +4 ticks after the attack action [LOG]. Slayer-style xp bonuses: head 60, body 15, tail 17.5 [WIKI]. Total encounter damage: 5×250 + 2500 + 300 = **4050**. Respawn 30 s; anyone still at the summit on full recovery is knocked back to the start [WIKI].

All three combat entries are missing from `server/data/definitions/monsters-complete.json` (only identifier constants exist: `THE_HUEYCOATL` 14009 … `HUEYCOATL_BODY` 14017 in `NpcIdentifiers.ts`). Stats, drops and collection log are data work. Elementals do not exist here (player thralls only).

## Instance, entry, exit [LOG] [WIKI]

- **Public + private** [WIKI]: climb the chain any time (up to 20 in the arena); private via meeting flag by the bank buffalo, 50k (25k with hard CA). Ironmen get drops in groups. Requirement: Children of the Sun + spoken to Taala at base camp. Below 85 combat / 43 Prayer shows a warning dialogue, still enterable [WIKI]. Recommended [WIKI, player-side, no wiring]: 60 Atk/Str/Def, 70 HP, 43 Prayer; Heart of Darkness for the Pendant of Ates.

- **The chains** [LOG + WIKI]: `huey_fight_entrance` (55401) at **(1527, 3285)**, a few tiles north-west of the bank/flag cluster — the whole bank-to-boss trip is: bank buffalo → meeting flag (private) → a short walk → climb the chains. `op1` climbs through, `op3` peeks, `op2` triggers the Taala first-visit warning (option names [CACHE]).

- **Entrance op1** [LOG 10 attempts/6 recs]:
  
  | Tick                  | What happens                                                                                                                                                   |
  | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | +2                    | Teleport to **(1529, 3284, 0)** (×3) or (1528, 3284, 0) (×2); `huey_in_area` 0→1, `multiway_indicator` 0→1, music 801, `set_player_op 2` cleared               |
  | +0 (first visit only) | Taala dialogue ("Excuse me, human! Perhaps you shouldn't just go wandering through there…") plus music unlock "The Feathered Serpent" (`huey_encountered` 0→1) |
  
  The full Taala tree is captured verbatim in the Taala dialogue section below (single sample — confirm option ids live).

- **Entrance op3 = quick-peek** [LOG 1 attempt]: messagebox "There are # adventurers ascending the mountain. / The Hueycoatl has been subdued!" (5 seen). Peek states per wiki: preparing / phase 1 (body) / phase 2 (summit) / phase 3 (tail) / phase 4 (final stand) [WIKI].

- **Exit shortcut op2** [LOG `huey_fight_exit_shortcut` 55234, 4 attempts/4 recs]:
  
  | Tick | What happens                                                                                                                                             |
  | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | +2.5 | `exactmove` (1520, 3290)→(1524, 3290) delay 100, `human_knockdown_loop_nodelay`, sound 7572 (loops 2); "You slide down the slope..."; `huey_in_area` 1→0 |
  | +5.5 | Standing anim resumes, sound 2485, "... and land skillfully."; multiway 1→0, music 813                                                                   |
  
  Resupply at the bank buffalo below [WIKI].

- **Death** [WIKI]: grave at base camp (standard retrieval, not the arena). No Group-Ironman prestige rule was found on the wiki (unlike Royal Titans) — unchecked, see Assumption 14.

- **Bank buffalo op1** [LOG 55199, 175 attempts/11 recs]: standard bankmain+bankside open. No boss wiring; document for the pre-fight loop only.

- **Scoreboard [LOG]:** loc `huey_scoreboard` (55198) at (1533, 3287), op1 opens interface 884 as main modal with `title_text` ("The Hueycoatl - Statistics"), `pkc/pd/pbt_content` + `gkc/gd/gbt_content`, `close` — same shape as the Titans' 909 board. Values by KC/deaths/best plumbing (persist per player, mirror RoyalTitans scoreboard wiring).

- **Private flag menu resolved [LOG `huey_holding_instance_creator` 55203 at (1525, 3295), 5 attempts/5 recs]:** op1 → chatmenu "Select an option": `Start a public/friends fight (based on privacy setting).|Start a solo fight.|Join a public/friends fight.|Cancel.` Instanced variants `huey_holding_entrance_instanced` (55205 at (1522, 3295)) and `huey_holding_instance_creator_instanced` (55204) swap in for private groups. First-visit flags: varbit `huey_intro` (11413) 0→1 alongside `huey_encountered` [LOG].

- **Rewards varp [LOG, semantics open]:** `huey_rewards_int` (4446) 0→2560 seen — likely reward-points plumbing; read live before wiring (Assumption 9).

### Base-camp NPCs [LOG positions; roles/dialogue unsourced — Assumption 18]

They do walk around you — ambient wandering in camp (1-tile steps captured), not an escort: every sample is at camp coords, none inside the arena.

| Id          | Gameval                                         | Spawn tile [LOG]                                                               | Observed behaviour                                                                                                                                                                                 |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14000       | `huey_lobby_guard`                              | (1531, 3287)                                                                   | Standing (samples only)                                                                                                                                                                            |
| 14102/14001 | `huey_lobby_guard_viero_multibase` / `_unknown` | (1523, 3293)                                                                   | Standing                                                                                                                                                                                           |
| 14007       | `huey_nelta`                                    | (1526, 3291)                                                                   | Wandering (south, west, north steps)                                                                                                                                                               |
| 13996       | `huey_lobby_leader`                             | (1528, 3293)                                                                   | Stationary, facing the player (`face_pathingentity`)                                                                                                                                               |
| 13997       | `huey_lobby_seer`                               | (1531, 3292)                                                                   | Standing                                                                                                                                                                                           |
| 14003/14004 | `huey_lobby_worker_1/2`                         | (1531, 3291) / (1528, 3290)                                                    | Wandering (north-east, north-west steps)                                                                                                                                                           |
| 14008       | `huey_seer` (arena seer)                        | Spawns (1530, 3284), runs to (1527, 3276), also seen (1506, 3288)              | Post = pillar side; full run + idle facing per Seer section                                                                                                                                        |
| 14018       | `huey_body_part_broken`                         | —                                                                              | Broken segment state (samples only); transition timing unsourced                                                                                                                                   |
| 14010       | `huey_head_respawn_placeholder`                 | Head tile (1509, 3290), `awaken_reset` on add                                  | Intermission marker; one sample shows add→del in 3 ticks (likely render-distance, not the full 30 s window — record a full idle respawn to place the live-set swap) [LOG 234/03274, single sample] |
| 14101/13998 | `huey_lobby_chef_multibase` / `_unknown`        | (1534, 3289), faces south                                                      | Kitchen staff; zero clicks/dialogue/shop links in 196 recs — role unsourced                                                                                                                        |
| 14045       | `huey_pet`                                      | Seen once as another player's follower at (3566, 3297), far from the Darkfrost | Follower behavior standard; drop wiring with loot tables                                                                                                                                           |
| —           | `huey_victory_worker_1/2`                       | (1517–1519, 3281–3285), running                                                | Post-kill crew (samples only); role unsourced                                                                                                                                                      |

## Transport and ::teleports

Fastest live routes are existing content [WIKI]: Pendant of Ates teleport (after activating the Statue of Ates west of camp), Quetzal to Quetzacalli Gorge then run. There is **no agility shortcut** to the camp — the wiki transport section lists only pendant/quetzal/running, and no shortcut loc appears in any capture [WIKI + LOG absence].

`::teleports` omission was wrong — add it (Araxxor pattern): `Royal Titans` got a boss-menu entry and Hueycoatl should too, landing at base camp. Proposed: `Hueycoatl` on a boss page with a camp destination; the slide landing **(1524, 3290)** is proven walkable live [LOG] and sits by the bank buffalo/flag, so use it unless the live survey finds a better tile. The dialogue button id must be read from the cache (28151–28159 are taken) [CACHE]. No pending-instance attribute needed (entry is via the chain loc) [EST, Araxxor precedent]. Verify the Pendant of Ates exists in tsps [CACHE].

## Options observed (op numbers [LOG], names [CACHE]/[WIKI])

| NPC / loc                               | op1                                                                        | op2                                                | op3+     |
| --------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- | -------- |
| Head/body/tail (14009/14017/14014)      | ? [CACHE]                                                                  | Attack (opnpc2 seen, all facts)                    | —        |
| Tail broken (14015)                     | **no recorded actions** [LOG: 8 recs mention it, 0 actions] — passive prop | —                                                  | —        |
| Shielded head (14011), defeated (14012) | ? [CACHE] (shielded: almost certainly no Attack; defeated: loot?)          | —                                                  | —        |
| Entrance chains (55401)                 | Climb through (enter)                                                      | Taala warning, no teleport (1 sample, first visit) | op3 Peek |
| Exit shortcut (55234)                   | ? [CACHE]                                                                  | Slide down                                         | —        |
| Bank buffalo (55199)                    | Bank                                                                       | —                                                  | —        |
| Lobby (leader/workers/Nelta/seer)       | Talk (assumed) [CACHE]                                                     | —                                                  | —        |

## Boss HUD [LOG]

Standard `hp_hud_open`/`hp_hud_fade_in` on head, body and tail attacks with `hpbar_hud_hp` tracking (e.g. 2495→2468 on head hits). Follows the attacked part; reuse `BossHud` show/update/hide/reset. Hueycoatl-specific [LOG 235/03399]: varp `hpbar_hud_npc` (1683) switches 14009→14011 at the shield (head→invulnerable) and back on unshield, →-1 on death/leave. HUD components touched: 303:0/1/10/11/13–18 (same set as Royal Titans).

## Cache elements used

Recorded ids are rev 226-237 [LOG]. Server cache is newer; ids assumed stable — spot-check each kind at implementation (`dump-seq`, `dump-spotanim`, `dump-loc`, `dump_ops.ts`; AGENTS.md rule 9). Hooks use **names**, numerics only in constants (rule 4).

### NPCs [LOG ids + gamevals; display/ops/size [CACHE]]

| Id                      | Gameval                                                    | Role                                                                         |
| ----------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 14009                   | `huey_head`                                                | Head, normal (14010 = respawn placeholder, 14013 never observed — see Stats) |
| 14011                   | `huey_head_invulnerable` (transform)                       | Head, shielded (P3)                                                          |
| 14012                   | (defeated)                                                 | Head, defeated                                                               |
| 14017                   | `huey_body_part`                                           | Body segment ×5                                                              |
| 14014                   | `huey_tail`                                                | Tail, normal                                                                 |
| 14015                   | `huey_tail_broken`                                         | Tail, broken (passive)                                                       |
| 14008                   | `huey_seer`                                                | Seer (brazier charging)                                                      |
| 13996/14003/14004/14007 | `huey_lobby_leader`, `huey_lobby_worker_1/2`, `huey_nelta` | Base-camp NPCs (full camp table above)                                       |

Sizes [WIKI]: head 7, tail 5, body 1.

### Locs (objects) [LOG]

| Gameval                                                                        | Role                                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `huey_fight_entrance` (55401)                                                  | Chain entrance                                              |
| `huey_fight_exit_shortcut` (55234)                                             | Slide back to camp                                          |
| `bank_buffalo` (55199)                                                         | Bank by the flag                                            |
| `huey_prayer_pillar_melee/magic/ranged_*` (`_empty`, `_s5`, `..._brazier_off`) | Pillars + braziers west of head                             |
| `huey_attack_tiles_loc`                                                        | Symbol tiles (spawn ~+3 ticks after attacks)                |
| `df_cave_snow01_entrance03_huey` / `..._diag`                                  | P2 barrier pieces (damage anim `huey_p2_barrier_damage_01`) |

Brazier lit locs, charge-stage locs and barrier locs all captured above with ids; only their cache-side names/ops remain [CACHE].

### Seqs (animations) [LOG names; numeric ids [CACHE]]

Head: `huey_attack_melee/magic/range`, `huey_shield_activation` (+5 ticks after the shield message). Body: `huey_body_death`, `huey_body_death_diag`. Barrier: `huey_p2_barrier_damage_01`. Shielded head: `huey_shield_attack_melee/magic/range` (11673/11674/11675), idle 11672. Thrall summon orb: `npc_dwarf_summon_orb`/`_end` (11698/11699) play live on resummon [LOG] — the wiring point for the P2 resummon tip. Tail: appear 11720, disappear 11721, idle 11722, break 11723 (all precache + break live). Body: spawn/idle/death (+diag) 11683–11690. Walk/idles for head/tail beyond these [CACHE].

### Spotanims (graphics) [LOG, counts in 235/03402]

On-NPC slot 0: `vfx_huey_attack_melee/magic/ranged_spotanim_01` (+ impact `..._impactanim_01` on players slot 2). Prayer charge: `vfx_hueycoatl_prayer_02` (map anim at symbol tiles). Tail shockwaves (map anims, 8 directions + impacts): `vfx_huey_tail_slam_shockwave_north/south/...` (~4.9k each in top logs), `..._impact_east` etc. Player spells seen: earth surge casting/travel/impact, ayak normal (league worlds — ignore for live), miss graphic 85. Fire Wave impact 157 seen once (works [LOG]).

### Sounds (full inventory, 6 fight recs) [LOG counts; per-attack mapping TODO — Assumption 22]

synth: 958 ×7495, 178 ×493, 2526 ×485, 2566 ×386, 2608 ×320, 4025 ×255 (surge cast [EST]), 2577 ×222, 9901/9905/9906/9914 ×170 each (tail-phase set, rev ≤235), 9607 ×91, 9664-family (rev ≤235), 2401 ×68. area: 9594 ×1523 (impact), 9568 ×1312, 9596 ×794, 227 ×568 (rev 235+), 9612 ×180, 4029 ×403, 9573 ×81. Slide: 7572 (loops 2) + 2485. Miss/ambient: standard. (League-ambient ids excluded.)

### Interfaces, varps/varbits, music [LOG]

- Varbits (ids captured) [LOG]: `huey_in_area` (11362) 0↔1 (enter/exit), `huey_encountered` (11363), `huey_intro` (11413), `multiway_indicator` (4605), `busy` (bank). Flick-timing note: prayer flips are symmetric in counts (~16–19 each way) but per-attack switch timing was not isolated in these logs — flick behavior rests on counts + wiki, not tick correlation (audit 20).
- Music: 801 on entry ("The Feathered Serpent", unlockable), 813 on slide-out.
- Standard: bankmain/bankside, chatmenu/chat Left head (`huey_lobby_leader`), messagebox (peek), boss HUD 303, `set_player_op 2` cleared on entry. Full interface inventory over the 6 fight recs (audit 8): boss-relevant opens are chatmenu/chat_left/messagebox/objectbox(dialogue flows), huey_scoreboard mainmodal, fade_overlay ×22 (entry/exit/transitions), hpbar_hud, buff_bar, quetzalwhistle_menu (transport). `shopmain` (9×) and dismantle `objectbox`es (revenant ether) in the same sessions trace to unrelated league activity, not camp content — no Hueycoatl shop evidenced; confirm live before adding one (Assumption 18).
- Varps: `music_current_track`, `musicmulti_25`, `tracking_damage_dealt_to_npcs`, `tracking_monsters_killed`, `sa_energy`, `last_npc_target_distance` (ambient/processing, not boss state).

## Placement [LOG samples; bounds EST]

- Base camp: bank buffalo area; meeting flag beside it (private instance) [WIKI].
- Arena entry landing: **(1528–1529, 3284)** [LOG]. Exit slide landing: **(1524, 3290)** [LOG].
- Summit fight: player coords cluster ~(1507–1513, 3282–3289); pillars/braziers west of the head; seer nearby; tail emerges from the western cave in P3 [LOG + WIKI].
- **Spawn tiles (exact, multi-sample) [LOG]:** body segments (1520, 3273), (1524, 3277), (1527, 3273), (1530, 3276), (1524, 3270) (~60–80 sightings each); head (1509, 3290) ×67 — unanimous across 12 recs, revs 232–237 (fixed spawn); tail east (1518, 3281) ×19 vs west (1502, 3281) ×2 — side spawns confirmed in coords, east heavily favoured in this sample (verify live whether first spawn is fixed east).
- Body phase: 5 segments on the mountainside path; tail blocks summit access until all five die [WIKI] [LOG deaths: `huey_body_death(_diag)` + `tracking_monsters_killed` increments].

## Attacks (all phases) [LOG] [WIKI]

- **Head autos (+4 ticks after the attack action):** `huey_attack_melee/magic/range` with matching slot-0 spotanims and player-slot-2 impacts; area sounds 9594/9612; `npc hit` + headbar on the head. All three styles appear in the same windows (46/119 attempts show each [LOG]) — the head mixes styles freely.

- **Glowing symbols:** `huey_attack_tiles_loc` (55209, shape 10) adds + `vfx_hueycoatl_prayer_02` (3001, delay 120) map anims on the same tiles at ~+3 ticks; lightning ≤16 after 4 ticks if stood on [WIKI; packet corroboration: the prayer_02 map anim carries delay=120 = 4 ticks at 30 cycles/tick, uniform over 640 samples [LOG]]. Mapped area [LOG, 4798 tiles over 196 recs]: **x 1505–1529, y 3270–3289, plane 0** (215 distinct tiles, median 13 hits each) — the whole mountainside-to-summit floor. **Caveat: observed envelope only, no interpolation** — tiles nobody stood near may simply never have triggered (symbols spawn "near players" [WIKI]), so absence proves nothing; unwalked corners and behind-barrier tiles are likely missing from the sample. That said, the evidence leans fixed-pattern over player-anchored: in 235/03399 the top symbol tiles all hit exactly 27× on a 3-spaced grid (1513/1516 × 3281/3284/3287) while the player camped elsewhere (1510,3283 ×109), and only 54/135 symbol tiles were ever stood on. Full analysis under Assumption 20.

- **Rain Fire (implementation table):** one row per style; head anim ~+4 ticks after the attack action, player impact ~+2 ticks later (ranges — confirm live). Per-style damage split attempted and abandoned: a ±12-tick attribution window in these 20-player league logs catches hits up to 297 (relics/other sources), so no clean per-style maxima exist here — wiki's uniform ≤14 stands [WIKI; LOG inconclusive, leagues-inflated]. Pray the matching overhead or eat ≤14 (0–2 correct) [WIKI damage; LOG timing].
  
  | Style  | Colour tell [WIKI]          | Head anim [LOG]     | Slot-0 spotanim [LOG]                | Projectile [LOG]                     | Player impact (slot 2) [LOG]           |
  | ------ | --------------------------- | ------------------- | ------------------------------------ | ------------------------------------ | -------------------------------------- |
  | Melee  | Red, smoking tail           | `huey_attack_melee` | `vfx_huey_attack_melee_spotanim_01`  | `vfx_huey_attack_melee_projanim_01`  | `vfx_huey_attack_melee_impactanim_01`  |
  | Ranged | Green, no visible animation | `huey_attack_range` | `vfx_huey_attack_ranged_spotanim_01` | `vfx_huey_attack_ranged_projanim_01` | `vfx_huey_attack_ranged_impactanim_01` |
  | Magic  | Blue, spinning              | `huey_attack_magic` | `vfx_huey_attack_magic_spotanim_01`  | `vfx_huey_attack_magic_projanim_01`  | `vfx_huey_attack_magic_impactanim_01`  |
  
  Flight packets [LOG 235/03399, `projanim_specific_v4`, starttime=0]: endtime=150 typical (magic 20×, ranged 20×, melee 14×), endtime=210 rare (melee 3×, ranged 1×) — longer flight at longer range [EST from 4 samples]. Cycle→tick conversion unconfirmed (compare Royal Titans' per-tile delays before wiring) — Assumption 23.
  
  Numeric ids are runtime-remapped per recording (e.g. ranged spotanim shows as 2971 live vs precache id) — hook by **name** (AGENTS.md rule 4); recorded cache ids: autos 11669/11670/11671, spotanims 11708/11716/11712, projanims 11709/11717/11713, impacts 11710/11718/11714 [LOG precache script1846, revs 226-237, no name-conflicts; full table: `huey-precache-ids.txt` in osrs-captures — verify against rev 241].

- **Body segments:** passive, no attacks [LOG + WIKI]. Deaths play `huey_body_death(_diag)` with `loc_del` on the tile [LOG].

- **P4:** same autos + symbols + feathers at sharply higher rate, plus tail shockwaves every ~15 s (below).

## Phases (encounter flow) [WIKI + LOG]

| Phase                    | State                                                                                                       | Live mechanics                                                                                                                                 | Ends when                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P1 — body**            | Tail blocks the summit; 5 segments (250 HP each) on the mountainside path, passive, no attacks [LOG + WIKI] | Symbols + feathers only (no autos — nothing to auto with); barrier takes damage anims as segments die                                          | All five segments dead (`huey_body_death(_diag)` + `loc_del` each [LOG]) → barrier breaks, tail visibly clears the path (clearing anims unsourced — Assumption 17) |
| **P2 — head + braziers** | Head attackable at the summit; pillars/seer active                                                          | Full kit: autos (melee/magic/range mixed [LOG]), symbols, feathers; pillars charge → braziers → 30% buff if balanced                           | Head at 50% HP → shield sequence (below)                                                                                                                           |
| **P3 — shield + tail**   | Head invulnerable (14011); tail (300 HP, capped) out of the western cave                                    | Head keeps attacking (shielded autos captured [LOG]) but takes no damage; tail shockwaves every side swap (~20 s); symbols + feathers continue | Tail at 0 (`huey_tail_broken`, passive [LOG]) → unshield (feedback unsourced — Assumption 15)                                                                      |
| **P4 — final**           | Head attackable again, no shield, no tail                                                                   | Same kit at sharply higher rate + tail shockwaves periodic (~15 s) with far-side safespots                                                     | Head at 0 → defeated (14012) → loot (Assumptions 9/16) → 30 s respawn with summit knockback [WIKI]                                                                 |

Seer cues track the flow: pillars lines in P2, "Go for the tail!" at the shield, "Watch out for its slam!" at shockwaves (table above). Late joiners (after P1) take a contribution cut [WIKI].

## Shouts (seer only; boss silent) [LOG]

The boss herself has no `[say]` rows in any fact sheet (unlike Royal Titans' teleport table) — but the **seer talks through the fight** [LOG, 235/03399 counts]:

| Seer line                                                                                                                 | n         | Moment                  |
| ------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------- |
| "We need to charge all of the pillars using our prayers!"                                                                 | 26        | Pillars phase           |
| "Keep praying to charge the pillars!"                                                                                     | 12        | Pillars phase           |
| "Go for the tail! It's a weakspot!"                                                                                       | 12        | Shield phase            |
| "Watch out for its slam!"                                                                                                 | 9         | Tail shockwaves         |
| "Let's make this beastie move!"                                                                                           | 7         | Phase transitions       |
| "Let's go!" / "Steady now!" / "Nicely done!" / "We did it! Well done!" / "Well done! Now, let's weaken it a little more!" | 5/4/4/4/4 | Transitions/clear calls |

Assumed: seer lines are phase cues, no gameplay effect [EST — confirm live]. Taala tree captured (section above); leader/worker/Nelta lobby dialogue still unsourced (Assumption 12).

## Specials

- **Barrier (P1→P2) [LOG 234/03274]:** single barrier loc at (1515, 3268) cycling base (55206) ↔ `barrier_respawn` (55208) ↔ `barrier_retracted` (55207) per run; damage anim 11706 repeats as segments die (4–5 hits per volley), then `transition` (11700). Precache proves `transition_start/end/end_idle` + `respawn_01` variants exist but only base 11700 + damage 11706 play in these logs. `df_cave_snow01_entrance03_*` changes accompany segment deaths; path opens when all five are down [LOG + WIKI].
- **Braziers (P2):** pillars charge from balanced active protection prayers — **blue pillar = Protect from Magic, red = Melee, green = Missiles** [WIKI] — (table below); all three full at a seer check = braziers lit = **30% damage buff**, kept while pillars stay full at each re-check. Draining mid-fill is safe if refilled before the bar completes. Solos/duos cannot light all three — ignore seer/pillars, just flick [WIKI]. Single-client proof [LOG 235/03399]: with only Missiles active (0,0,1), ranged pillar sits at s5 (391x) while melee/magic stay empty/off — stage follows its own prayer (multi-player counting still live-only). Observed arena teams in fight recs: 1–4 players (no 20-masses captured) [LOG]. If a thrall is lingering from P1, resummon at the summit so it repositions to the head instead of walking up slowly [WIKI]. Log corroboration [LOG 3 fight recs]: protect-melee/missiles/magic flip symmetrically (~16–19 on/off each) — players flick constantly, matching the design.
  - **Seer behaviour [LOG 235/03399]:** spawns at the entrance (1530, 3284), *runs* to his post (1527, 3276), then idles and talks (shout table above). No sequence, spotanim or headbar was ever captured on him — the wiki's "yellow charge bar" has **no observed packet form** (possibly a headbar type RSProx doesn't decode). Treat bar visuals + fill rate as unsourced — Assumption 5.
  - **Pillar tiles and loc chains (fixed, ids captured) [LOG]:** magic (1504, 3287): empty 55212 → s1–s5 55213–55217 → brazier_off 55211 → brazier_on 55210; ranged (1505, 3289): empty 55220 → s1–s5 55221–55225 → off 55219 → on 55218; melee (1507, 3290): empty 55228 → s1–s5 55229–55233 → off 55227 → on 55226. Charge stages s1–s5 appear live (78–106 sightings each; s5 ranged 1047 vs magic 513 vs melee 465 — prayer imbalance visible); during imbalance the melee pillar visibly flickers off↔empty every 2 ticks [LOG 235/03399 ticks 652–670], matching the drain/refill dynamic; `brazier_on` only 26× per pillar across 196 recs, i.e. these groups rarely lit the buff.
  - **Charge stages [LOG precache]:** `phase_empty` → `phase_1` → … → `phase_5` (6 visible levels, `pillar_zema01_prayer01_*`). Which stage maps to how many active prayers, and the seer check period in ticks, are unsourced — Assumption 5.

| Team  | Prayers per pillar |
| ----- | ------------------ |
| 1–5   | 1+                 |
| 6–8   | 2+                 |
| 9–11  | 3+                 |
| 12–14 | 4+                 |
| 15–17 | 5+                 |
| 18–20 | 6+                 |

Team size counts everyone in the arena, idle or not (join/leave applies instantly — the alt-at-entrance exploit) [WIKI]. Exploit detail [WIKI]: alts parked near the entrance take only Rain Fire damage (never lightning or shockwaves), so gear them to tank the two styles they aren't praying. No pillar/brazier/seer/buff varp exists in the logs — the 30% buff must be tracked server-side from pillar states, not read from a varp [LOG absence over 196 recs]. Teams commonly call prayers in chat when running up, then camp overheads and tank feathers while the seer bar is near full (flick only when it isn't), since her chip damage is cheaper than losing the buff [WIKI].

- **Shield (50% HP):** message `<col=#f#f>The Hueycoatl shields itself!</col>` at +5 ticks → `huey_shield_activation` → `[transformation] huey_head_invulnerable` (14011) [LOG 3/119 attempts across 3 recs — rare because few recordings reach P3]. Head unattackable until the tail breaks. The unshield feedback (message? anim? shielded→normal swap) is unsourced — Assumption 15.
- **Tail shockwaves:** 8 direction map anims at +0–1 ticks around tail attacks — north 2979, south 2977, east 2980, west 2978, NE 2984, NW 2983, SE 2981, SW 2982 — plus impact variants 2994–3000 [LOG live ids; precache seq ids 11724–11729 are the same graphics]. Direction counts skew hard (SE 4968 vs north 434): waves favour the tail's facing side — verify live rather than assuming uniform. 20–25 on failure [WIKI]. Dodge by running through/diagonally at the right moment. P3: a slam every side swap (measured in 235/03400: visible ~34–36 ticks ≈ 20–21 s ✓ wiki, hidden 2 ticks mid-swap; attacks during transition deal nothing [LOG]). P4: periodic ~every 15 s through the whole phase; two far-side tiles in front of the head are safespots for bad timers [WIKI].

## Lifecycle anims (mostly unobserved live) [LOG precache + snapshots]

Precache (script1846) proves these exist: `huey_awaken`/`_reset` (11681/11682), `huey_screech`/`_reset` (11677/11678), `huey_knockout`/`_idle` (11679/11680). Live evidence is one `huey_awaken_reset` on the head at a rebuild snapshot [LOG 234/00837] — i.e. awaken plays at spawn/unrender and resets to idle. Screech and knockout never play in 196 recordings. Hypothesized (verify live): awaken at fight start, screech at phase changes, knockout at kill. Do not wire blind — Assumption 24.

Observed swaps [LOG]: tail break = `npc_huey_tail_break_01` (11723) + same-tick `[transformation] → huey_tail_broken` (14015); kill cleanup dels head-defeated (14012) and broken segments (14018) together. Camp login snapshot [LOG 234/00837]: leader/workers/seer/guard/chef/Viero/arena-seer/head all spawn facing south in one `creationcycle` block.

## Tail damage cap [WIKI] [LOG shape]

300 HP behind a heavy cap: hits land as **1–5** in the captures (`npc hit` value=1 ×130, 4 ×91, 5 ×85 on tail attacks [LOG]) — consistent with cap 4 (9 when crush bonus is highest, misses floored to 1) [WIKI]. Multi-hit weapons win: dual macuahuitl / glacial temotli (4-tick), Blood Moon set proc, thralls; claws/ursine specs only in small teams (pillars-buffed specs beat them in big groups) [WIKI]. Log corroboration: `wild_cave_chainmace_crush` ×217 in one fight log [LOG 235/03399] — players really do bring crush to the tail; no DH lance/scythe/mac sightings isolated (20-player attribution noise) — gear picks otherwise rest on [WIKI]. no DH lance/scythe/mac sightings isolated (20-player attribution noise) — gear picks rest on [WIKI]. Keep HP >40 in P3 (shockwave + auto + lightning overlap kills) [WIKI].

## Weapons with distinct effects

- **Dragonbane: data-only.** Wiki infoboxes tag head, body and tail `attributes = dragon` [WIKI]; tsps `DragonHunter.js` keys off exactly that attribute (lance ×6/5, wand ×7/4 acc ×7/5 dmg, crossbow ×13/10 acc ×5/4) with no per-NPC list — so wiring is just adding `"dragon"` to the three `monsters-complete.json` entries. Irony to preserve: the **dragon hunter wand is her own drop** (use it back against her). No code changes.
- **Tail-cap weapon choice (not an effect, a constraint):** the 4/9 cap makes multi-hitters (macuahuitl, temotli, Blood Moon procs, thralls) beat slower harder hitters in P3 [WIKI + LOG hit clusters]; document in-game via the normal damage formula, no special-casing.
- **Death Charge: out of scope.** The Arceuus spell does not exist in tsps (no implementation found), and live restricts it anyway: last-hit credit only on body/head, never the tail [WIKI]. If the spellbook ever lands, gate it the same way.

## Death, loot, respawn [WIKI; LOG partial]

- Defeat → head defeated state (14012); bank buffalo resupply via the slide; 30 s respawn with summit knockback [WIKI]. For back-to-back kills, walk back to the start during the downtime so the new run opens on the body segments immediately [WIKI].
- Ground drops seen in captures: `huey_hide`, `huey_chaps`, `huey_vambraces` as obj actions [LOG] — full drop tables (tome of earth, dragon hunter wand, hide, huasca seeds [WIKI]) are **absent from tsps** (`npc-drops.json` has no Hueycoatl entries): data work.
- Kill feedback [LOG 235/03399]: varp `total_huey_kills` (4404) increments with `tracking_monsters_killed`, message "Your Hueycoatl kill count is: <col=ff0000>N</col>." on head HP 0, durations "Fight duration: <col=ff0000>m:ss.cc</col> (new personal best)" / ". Personal best: m:ss.cc" (2:12–12:31 seen). Exact ordering vs drops still to verify live — Assumption 16.
- Joining after phase 1 is cleared significantly reduces contribution [WIKI] — implement the reduction once the loot model is confirmed (Assumption 9).
- Group distribution (roll-per-player? MVP? shared?) is unsourced — Assumption 9. Ironmen eligible in groups [WIKI].
- Drop mechanics [LOG 234/03274]: ground loot (`huey_hide` obj 30085) spawns the **same tick as the KC message** at (1513, 3287) with reveal=100, despawn=400, self-ownership; script7192 links `huey_head_defeated`→drops; pickup is Take (opobj3, first take +14 ticks). Loot table contents still TODO (Assumption 9).

## Game messages (boss-relevant, captured) [LOG]

"The Hueycoatl shields itself!", peek box ("There are # adventurers ascending the mountain. / The Hueycoatl has been subdued!"), Taala warning dialogue, "The Feathered Serpent" unlock, slide pair ("You slide down the slope..." / "... and land skillfully."). Food/potion/divine/venom lines in the sheets are ambient (player supplies on league worlds), not boss mechanics.

## Combat Achievements (11 tasks, 41 points) [WIKI count; names TODO]

Sourced: `Combat Achievements/Tasks by boss` gives **11 tasks totalling 41 points** for The Hueycoatl. The names live in a Cargo-backed template (`{{Combat Achievements list|The Hueycoatl}}`) with no API access, so the task list itself is still unsourced — Assumption 13. Wire like `CombatAchievements.RoyalTitans.js` once named: kill-count tasks finish themselves off kill reports (KC varp + `combat-achievements:kill`), the unit tracks per-fight state (segment/body damage shares, tail-phase hits taken, shockwaves taken, symbols stood on, prayer points spent, brazier uptime) and answers kill-count/personal-best at login, Araxxor-style.

## Data and shared changes

- ADD `monsters-complete.json`: head (2500 HP…), body (250), tail (300) with the stat blocks above.
- ADD `npc-drops.json`: head/body/tail tables incl. uniques (tome, wand, hide, huasca) [WIKI].
- PRESENT: identifiers 14009–14017; pendant/quetzal transport (verify [CACHE]).
- Collection log: unsourced — check cache, wire if present [CACHE]. Slayer: infoboxes list no category or master (unlike the Titans' Fire/Ice Giants + Vannaka) [WIKI absence] — assume no Slayer wiring until the cache says otherwise. Burn: no `immuneburn` line in any infobox though poison/venom/freeze/cannon are explicit — do not copy Royal's "burn works"; verify live.
- New test `server/tests/hueycoatl.test.cjs` + `Commands.Hueycoatl.js`.

## Instancing, joining, leaving, death

- **Model:** one shared public arena (up to 20, all visible to each other) plus per-group private instances from the meeting flag [WIKI]. No per-player instancing: the chain drops everyone into the same space, and team size counts every body in the arena, idle or fighting [WIKI].
- **Join any time:** climb the chain in any phase (peek first to see count + phase [LOG + WIKI]). Cost of lateness: entering after P1 is cleared significantly cuts contribution [WIKI]; joiners also shift the pillar prayer math instantly on arrival [WIKI].
- **Leave any time:** exit slide, teleport, or logout — all drop team size instantly with the same immediacy [WIKI].
- **Death flow [LOG 227/00086 + WIKI]:** "Oh dear, you are dead!" with `gravestone_creation_death_coord` (3916) set, `gravestone_duration` (10465) = 1500 ticks, `gravestone_visible` (10464) set, prayers cleared — grave spawns at base camp [WIKI], standard retrieval. (1500 ticks ≈ 15 min on the captured league world; confirm live duration.) Whether dying forfeits the run's contribution/loot eligibility is unsourced — Assumption 21.
- **Logout inside** returns the player outside the entrance on login (Yama-domain precedent) [EST]; rejoin is by chain as normal, subject to the lateness cut [EST].

## Death handling (tsps side) and multicombat

- tsps has no graves (Doom precedent): what would drop lands at the base-camp tile instead [EST, Doom pattern; confirm tile]. Death/logout flow itself is specified above.
- **Multicombat assumed** [LOG `multiway_indicator` 0→1 on entry, 1→0 on exit; 20-player design] [EST for the summit itself — verify the indicator inside].

## Out of scope (separate content)

Tome/wand/hide uses, huasca farming, Pendant of Ates item, Tears of Guthix (n/a), hiscores, hard/elite CA reward tiers. Private-instance fee flow (50k/25k) is IN scope (meeting flag); fee verification is Assumption 12.

## Taala dialogue (complete tree) [LOG 234/03274]

Gate line (chain op2 / first visit): "Excuse me, human! Perhaps you shouldn't just go wandering through there without knowing what you're dealing with!" Full talk tree (player prompts → Taala answers): leader intro ("Indeed I am, human! What's on your mind?") → situation ("Well, the Hueycoatl has awoken.") → name joke ("Huey-co-at... oh, I don't have time for this! ...coiled throughout this entire mountain!") → origins ("We're not sure... details have been lost") → age ("Does it really matter how old it is?" → lineage/ancient-creature) → threat (tunnelling into Cam Torum; lashing out at human villages as "a lesser priority for us") → plan ("keep it in check... wearing it out through combat"; "Don't go killing it, mind you!") → tips ("our prayers can protect us from its shards"; "move its great body out of the way... helpful nudge"; "work with your comrades and the seer to balance your prayers and weaken the beast"; "But I'm sure you'll figure it out!"). Player summaries echo back ("Move the body, then attack the head while keeping prayers balanced. Got it!"). Wire verbatim; option order as captured (single sample — confirm option ids live).

## Examine texts [WIKI infoboxes]

| NPC             | Examine                                       |
| --------------- | --------------------------------------------- |
| Head            | "It's like it's part of the mountain itself." |
| Head (shielded) | "It's shielding itself."                      |
| Head (defeated) | Same as head (infobox repeats it).            |
| Body            | "There's a monster in this mountain..."       |
| Tail            | "I'd best avoid that."                        |
| Tail (broken)   | "The sharp plating has been broken off."      |

## Testing [EST proposal, Yama/Araxxor pattern]

Baselines [WIKI]: solo BiS ≈ 8:20 (tail-gated), trio ≈ 5 min.

`server/tests/hueycoatl.test.cjs` covering segment deaths→barrier→summit, 50% shield→tail→unshield, shockwave dodges, brazier buff on/off, slide/peek/entry tiles against the captures.

## MCP verification (agent-tested, Oct 2026)

Server with `AGENT_MCP=1`; tester account (`::mortal` toggles godmode — without it all damage voids, which cost an hour of debugging).

| Check | Result |
| --- | --- |
| Chain Climb → (1528, 3284) + music unlock + 5 segments at exact tiles | Pass, matches captures |
| Scoreboard → interface 884 | Pass |
| Head autos damage the player (HP 99→66→death unprotected) | Pass |
| `hueyhp 100` → shield message verbatim + 14009→14011 + east tail spawn | Pass |
| Stationary player next to tail dies to shockwaves | Pass |
| Tail break → head back to 14009 (P4) | Pass |
| Kill → KC + duration/PB messages, single loot pile at head tile, engine CA fires | Pass |
| Death drops land at base camp; respawn at Lumbridge | Pass |
| Tail rolls no loot (overrides removeNpcs) | Pass (single pile observed) |
| MVP Big bones gating | Unit-tested; live multi-player untested |
| Braziers 30% buff in combat | Implemented, untested live (needs 3+ praying players) |
| Private flag menu options | Captured verbatim; fee flow untested live |
| Pillar charge stages vs prayers | Unit-tested; live multi-player untested |

Manual checklist (for the human pass): fight P1 properly (barrier gating blocked a walk_to, needs a real clear), shockwave dodge timing feel, seer/pillar visuals, drop-table rates over many kills, duo + contribution, private instance isolation, GIM/ironman paths. Commands: `::hueyhp <n>` (head HP; ≤50% arms shield), `::hueytail` (skip to P3), `::hueyshock` (force shockwave), `::hueybuff` (force braziers lit).

## Assumptions (all [EST]; confirm in implementation via MCP)

1. **Numbers on special worlds.** All damage/XP values above come from league/event recordings. Re-check max hits (14/13/25/16/14/12), HP pools and the 4-tick symbol timings on a live world.
2. **Symbol timing/damage.** 4 ticks → ≤16 captured once each; assumed per-tile independent rolls, not distance-scaled. Confirm live.
3. **Projectile→prayer mapping.** Red=melee, green=ranged, blue=magic with the listed tells [WIKI]; assumed the tell holds at all angles/distances. Confirm live.
4. **Pillar counting.** "Active prayers" = overheads on, counted arena-wide including idle players [WIKI literal]. Confirm the seer check timing (bar period in ticks) live.
5. **Brazier keep/lose.** Lit buff persists across checks while pillars stay full; one drained pillar at a check kills it [WIKI]. Exact re-check period [EST] — measure live.
6. **Tail cap rule.** Cap 4, 9 with crush-highest, floor 1 [WIKI]; captures show 1/4/5 clusters consistent with it. Confirm the crush-bonus condition and spec interactions live.
7. **Shockwave schedule.** ~20 s side swaps (P3), ~15 s periodic (P4), 20–25 damage, diagonal dodge [WIKI]. Confirm periods and whether P4 waves pause during symbols.
8. **Far-side safespots.** Two tiles in front of the head avoid all shockwaves [WIKI]. Confirm coordinates live.
9. **Group loot.** Distribution model unsourced. Assumed per-player rolls with contribution scaling (Titans pattern) until the drops pages say otherwise. Confirm live + fetch drop tables.
10. **Op names.** Head/body/tail op1, shielded/defeated ops, lobby talk ops — all [CACHE] via `dump_ops.ts`.
11. **Tiles.** Entry/exit landings are [LOG]-exact; summit/pillar/seer/cave tiles are samples [EST]. Survey live before wiring.
12. **Private fee and flag flow.** 50k/25k at the flag [WIKI]; menu options and the Taala tree above are [LOG]-exact. Remaining: fee dialogue/confirm and group-size selection (WIKI and LOG silent) — record live before wiring.
13. **CA names.** Count (11) and points (41) are [WIKI]; names sit behind the Cargo template (no API — fetch via browser on the boss page, or read the cache CA enums like RoyalTitans did: "task names are the Wiki's (cache enums confirm)"). Then mirror the RoyalTitans CA unit with per-fight state above.
14. **Respawn overlap and GIM.** Players mid-arena at respawn get knocked to the start [WIKI]; assumed no damage attached (slide knockdown is the analog [LOG]). No GIM prestige rule found on the wiki (WIKI silent; Royal Titans has one) — check live whether outsiders cost prestige.
15. **Unshield feedback (P3→P4).** WIKI and LOG silent on what plays when the tail breaks (message? anim? transform back?). Assumed: reverse of the shield sequence (message + anim + transform to normal) — record live.
16. **Kill ordering.** KC varp (4404), messages and durations above are [LOG]-exact; their tick order relative to drops/corpse swap still to verify live.
17. **Summit path (P1→P2).** The tail clears the way and players walk/run up [WIKI]; the exact clearing anims and path tiles are unsourced (LOG has barrier damage anims only). Survey live before wiring.
18. **Base-camp NPCs.** Spawn tiles above are single/few samples [LOG]; wander radii, facing rules, roles and all dialogue (Taala aside) are unsourced (WIKI and LOG silent). Assumed: standard 1–2 tile wander, leader faces+talks, workers ambience — record live, confirm op names via `dump_ops.ts`.
19. **::teleports entry.** Label `Hueycoatl`, destination (1524, 3290), button id from cache [CACHE/EST, Araxxor precedent]. Confirm the tile is connected (live's own slide lands there, so it is) and pick a free button id.
20. **Symbol placement.** Bounds, counts and the grid-vs-camp mismatch above are [LOG]-exact, but the envelope is player-coverage-biased (no interpolation done) and the rule is unsourced (WIKI says only "near players"). Full-rec audit: 1943 symbols share a tick with arena players; 25% within 3 tiles, 56% within 6 — weak clustering consistent with fixed patterns, not anchoring. Before wiring: (a) check cache collision for x1505–1529/y3270–3289 to drop unwalkable tiles from the candidate set, (b) correlate symbol tiles with player tiles per tick across more recs to confirm fixed-pattern vs anchored, (c) survey live (stand in corners, behind the barrier) to close the gaps.
21. **Death/logout vs contribution.** Grave varps are [LOG]-exact but all 6 captured deaths happened outside the arena (e.g. Dagannoth cave) — zero in-arena deaths in 196 recs, so in-arena death itself (grave at camp per [WIKI]) is unwitnessed. What death or logout does to contribution, pillar counts and loot eligibility is unsourced (WIKI and LOG silent). Assumed: contribution persists through death but not through leaving the arena — confirm live.
22. **Sound→attack mapping.** Inventory above is [LOG]-exact; which id belongs to autos vs symbols vs shockwaves vs UI is unmapped (WIKI and LOG silent on mapping). Same-tick audit: impacts 178/1460/9594/2566 co-occur with all styles (2-8x) — shared impacts, no distinct cast sounds; delay-aware join still open. Before wiring: correlate per-tick sound blocks with the attack anims in the 6 fight recs, then confirm live.
23. **Projectile flight times.** endtime 150/210 above are [LOG]-exact packet values; their tick meaning and the range rule are unconfirmed (WIKI silent). Measure impact delays per distance live before wiring (Royal Titans' per-tile delay pattern is the model to test).
24. **Lifecycle anims.** Precache proves awaken/screech/knockout exist; only awaken_reset observed (once). Record a fresh fight start, phase changes and kill live to place them before wiring.
