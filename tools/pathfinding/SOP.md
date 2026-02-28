# Game SOP

> Run `npm run new <slug>` to scaffold from template. Then work through this file.

**Notes convention:** When you hit a snag, defer something, or discover a complication, append a note under the relevant checkbox. Keep notes actionable — what was deferred and why, not commentary. Example:

```
- [x] **2.3 Enemies & Waves** — ...
  - [x] Enemies spawn in waves
  - [x] Contact damage works
  > **Note:** Spatial hash cell size 2.0 caused enemies to miss neighbors at high speed. Bumped to 3.0. May need revisiting if enemy sizes vary more in asset phase.
```

Don't delete notes — they're history for the next agent or session. **Before marking any step done, append notes about anything broken, fragile, or deferred.** The next worker has no memory of your session — your notes are the only way to tell them what's shaky.

**The SOP is the shared memory between workers.** Each step is executed by a fresh Claude instance that knows nothing except what it reads from this file, the codebase, and referenced pattern docs. If a later step needs context from an earlier step, that context must be written here — as a filled blank, a note, or a referenced artifact. Anything not in the SOP or on disk doesn't exist.

Read `patterns/game-spec.md` and `patterns/game-architecture.md` before starting.

---

## Pre-production

Draft all sections autonomously — do NOT ask the user for confirmation between steps. Fill every blank, check every box, generate spec.ts and the design doc. Only then present the complete pre-production package to the user for a single review. No game code until user approves.

- [ ] **Concept** — Interpret the user's prompt as a VS-like game.
  > Prompt:
  > Title:
  > Concept:
  > Tone:                (e.g. "frantic and comedic", "dark and oppressive", "chill and meditative")
  > Visual reference:    (one-line description of what the game should look/feel like)
  > Enemy types:
  > Weapons:
  > maxWeapons: ___      (default 6 — forces meaningful choices during upgrades)
  > Run duration:        seconds
  > Arena style:         scrolling / fixed / hybrid
  > Screen transition:   fade / pixelate / wipe-down / dissolve / glitch (pick one that matches tone)
  > Terrain archetype:   natural / structured / mixed / open (see `docs/2026-02-26_00-59-53_Organic terrain from grid data in VS-likes.md`)

- [ ] **Palette** — These are graybox colors, not final art. What matters is **high contrast** — player, enemies, and pickups must be instantly distinguishable from the ground. Don't chase thematic colors; chase readability. From the **project root**, run `npx tsx scripts/preview-palettes.ts ENEMY_COUNT`, pick the best option, fill in table. User reviews with rest of pre-production. (`patterns/game-spec.md` → `palette`)
  > Seed:
  > | Role | Hex | Notes |
  > |------|-----|-------|
  > | Ground | | |
  > | Wall | | |
  > | Player | | |
  > | Accent (UI, XP) | | |
  > | Enemy: ___ | | per type |
  >
  > Mood:

- [ ] **Font** — Pick a thematic font from the curated font library. The library lives at `fonts/library.json` (built once via `npx tsx scripts/preview-fonts.ts` — not per-game). If `fonts/library.json` doesn't exist yet, run `npx tsx scripts/preview-fonts.ts` from the project root to curate the font library first. Browse the library, pick one display font for titles/menus and optionally a second for HUD numbers based on the game's tone. Copy the `.woff2` files from `fonts/` into the game's `static/fonts/`.
  > Display font:     (e.g. "Bungee Shade")
  > HUD font:         (e.g. same, or "Press Start 2P" for pixel games)
  > Font files:        static/fonts/*.woff2 (copied from fonts/ library)
  > Base size:         px (from library.json — normalized so fonts render at comparable visual size)

- [ ] **Enemies** — Vary archetypes: walker, runner, tank, ranged, swarm. Each enemy needs a `meshPrompt` — a concise visual description for 3D mesh generation (silhouette, distinguishing features, materials). Think about what reads at top-down game zoom. (`patterns/game-spec.md` → `EnemyDef`)
  > ```
  > Enemy 1:  type=  health=  speed=  damage=  size=  xpValue=
  >           meshPrompt=  (e.g. "Stocky animatronic cowboy robot, mechanical joints, cowboy hat, T-pose, game character")
  > (complete one entry per enemy type — minimum 5, covering walker/runner/tank/ranged/swarm)
  > ```

- [ ] **Elites** — Define elite enemy modifiers. Elites are stronger variants of normal enemies that spawn after the early game. They use the same mesh but are visually distinct (larger, aura particle, always show health bar). (`patterns/game-spec.md` → `EliteConfig`)
  > ```
  > Elite config:
  >   healthMultiplier=   (e.g. 3.0)
  >   sizeScale=          (e.g. 1.3 — scaled up mesh)
  >   speedMultiplier=    (e.g. 0.9 — slightly slower, more menacing)
  >   damageMultiplier=   (e.g. 1.5)
  >   xpMultiplier=       (e.g. 3.0)
  >   dropBonus=          (e.g. "guaranteed health drop")
  >   spawnStartWave=     (e.g. 3 — no elites in first N waves)
  >   spawnChance=        (e.g. 0.05 — 5% of spawned enemies become elite)
  >   auraColor=          (hex — for particle aura, usually accent or a unique color)
  > ```

- [ ] **Boss encounters** — At least one boss per run (e.g. spawns at 5-minute mark or as wave finale). Unique behavior, large health pool, telegraphed attacks, reward on kill. Include `meshPrompt` — bosses should be visually imposing and distinct from regular enemies. (`patterns/game-spec.md` → `BossDef`)
  > ```
  > Boss 1:  name=  spawnTime=  health=  speed=  damage=  attacks=  reward=
  >          meshPrompt=  (e.g. "Massive armored mech boss, towering build, glowing weak points, T-pose, game character")
  > (complete one entry per boss — minimum 1, each with unique attacks and meshPrompt)
  > ```

- [ ] **Weapons** — VS forms: melee swing, nearest-enemy projectile, radial burst, orbital, etc. Mark starting weapon. Include `meshPrompt` for the projectile/effect visual (what flies through the air or orbits the player). Read `patterns/game-spec.md` → `WeaponDef` and "Weapon balancing philosophy".
  > ```
  > Weapon 1 (starting):  type=  category=  damage=  cooldown=  projectileSpeed=  pierce=  count=
  >                        meshPrompt=  (e.g. "Small revolver bullet, brass casing, simple shape, game projectile")
  > (complete one entry per weapon — minimum 4, each with all fields + meshPrompt)
  > ```

- [ ] **Weapon evolutions** — Combine two max-level weapons into a stronger form. Each recipe: two input weapons → one evolved weapon with merged/enhanced behavior. (`patterns/game-spec.md` → `EvolutionRecipe`)
  > ```
  > Evolution 1:  inputs=[weapon_a + weapon_b]  result=  description=
  > (complete one entry per evolution — minimum 2, one per weapon pair)
  > ```

- [ ] **Upgrades** — One sequence per weapon + 2-3 stat sequences (health, speed, magnet). Sequence-front model. (`patterns/game-spec.md` → `UpgradeSequence`)
  > ```
  > Sequence: (id)
  >   1. label=  weight=  change=
  >   2.
  > (complete one sequence per weapon + 2-3 stat sequences — every weapon must have its own upgrade track)
  > ```

- [ ] **Characters** — 2-3 playable characters with different starting weapons/stats. One unlocked by default, others via meta-progression. Include `meshPrompt` for each — should be visually distinct from enemies and from each other. Each character needs a short tagline and stat profile for the character select screen. (`patterns/game-spec.md` → `CharacterDef`)
  > ```
  > Character 1 (default):
  >   name=  tagline=  (one-liner, e.g. "Steady aim, iron will")
  >   startingWeapon=  statModifiers=  description=
  >   meshPrompt=
  >   statProfile:  (relative to baseline — show on select screen)
  >     health=  (e.g. "★★★☆☆")  speed=  damage=  luck=
  >
  > Character 2 (unlock):
  >   name=  tagline=  startingWeapon=  statModifiers=  unlockCondition=
  >   meshPrompt=
  >   statProfile:  health=  speed=  damage=  luck=
  >
  > Character 3 (unlock):
  >   name=  tagline=  startingWeapon=  statModifiers=  unlockCondition=
  >   meshPrompt=
  >   statProfile:  health=  speed=  damage=  luck=
  > ```

- [ ] **Meta-progression & unlockables** — Persistent systems between runs. Define currency, permanent stat upgrades (the core between-run power loop), character/weapon unlocks, difficulty modifiers, and convenience items. (`patterns/game-spec.md` → `MetaProgressionDef`)
  > ```
  > Currency:  name=  conversionRate= (e.g. "1 per 10 XP earned, +50 per boss killed")
  >
  > === Permanent stat upgrades (8-12 entries, 3-5 ranks each) ===
  > These are the primary currency sink. Refundable (player can re-spec). Costs escalate.
  > Upgrade 1:  id=  name=  description=  maxRank=  costs=[per rank]  effect= (field + delta/rank)
  >   (e.g. id="perm-might" name="Might" description="Base damage +5%" maxRank=5 costs=[100,300,600,1200,2500] effect=damage+5%/rank)
  > (complete 8-12 entries covering: damage, max HP, move speed, pickup range, cooldown reduction,
  >  XP gain, currency gain, revival, armor/defense, area/radius — not all required, pick what fits)
  >
  > === Content unlocks ===
  > Unlock 1:  type=character/weapon/stage  name=  cost=  description=
  > (complete one entry per unlock — all locked characters, any locked weapons, difficulty modes)
  >
  > === Convenience items ===
  > Reroll charges: ___  (default 1)  Meta-unlock: additional reroll charges  cost=
  > Banish slots: ___    Meta-unlock: additional banish slots  cost=
  > Skip: ___            (default available, no cost)
  >
  > === Difficulty modifiers (unlock after first clear) ===
  > Toggleable pre-run challenges. Each increases enemy difficulty but multiplies currency earned.
  > Multipliers stack when multiple modifiers are active.
  > Modifier 1:  id=  name=  description=  enemyEffect=  currencyMultiplier=
  >   (e.g. id="curse-hp" name="Ironhide" description="Enemies have +30% HP" enemyEffect="health×1.3"
  >    currencyMultiplier=1.25)
  > (complete 3-5 modifiers — can be toggled independently, multipliers stack)
  >
  > === Ascetic bonus ===
  > Reward for skipping level-up choices during a run.
  > Ascetic bonus:  threshold=  multiplier=
  >   (e.g. "Skip 5+ level-ups → 1.5× currency earned")
  > ```

- [ ] **Map** — CA-based procedural terrain using `template/src/level/`. Define zones, density, boundaries, and optional motifs. (`patterns/level-generation.md` → CA-based section). Tunables: `chunkSize` (cells per zone side, default 32), `caIterations` (CA smoothing passes, default from code — higher = smoother caves).
  > Zones (each becomes a region on the map with distinct CA density + palette):
  > ```
  > Zone 1: name=  density=  (0.0=open, 1.0=dense)
  > Zone 2: name=  density=
  > (define 2-4 zones themed to setting)
  > chunkSize=  (default 32)
  > caIterations=  (default from DEMO_CONFIG — tune for cave smoothness)
  > ```
  >
  > Boundaries between zones (optional):
  > ```
  > (e.g. "dense wall between wilderness and mines", "river between towns and wilderness")
  > ```
  >
  > Motifs (optional hand-placed features stamped onto CA output):
  > ```
  > (e.g. "boss arena: 12×12 open circle", "shrine clearing: 8×8 open square")
  > ```
  >
  > Destructibles (`DestructibleDef`): id, name, health, size, loot
  > ```
  > (complete one entry per destructible type — minimum 2)
  > ```
  >
  > Shrines (`ShrineDef`): type, name, description
  > ```
  > (complete one entry per shrine type — minimum 2)
  > ```

- [ ] **Terrain & props** — Define mesh prompts for all static objects (no rig/animation). Include wall variants, destructibles, shrines, pickups/drops, and environmental dressing. Each needs a `meshPrompt` describing the object for 3D generation. Think about what the player sees at game zoom — simple, readable silhouettes matter more than detail.
  > ```
  > Wall:           meshPrompt=  (e.g. "Weathered wooden saloon wall section, plank boards, rustic Western style")
  > Shrine:         meshPrompt=  (e.g. "Glowing mystical totem pole, carved symbols, magical aura")
  > XP gem:         meshPrompt=  (e.g. "Small glowing crystal, simple gem shape, pickup item")
  > Health pickup:  meshPrompt=  (e.g. "Red heart, simple shape, health pickup")
  > Rosary/bomb:    meshPrompt=  (e.g. "Glowing orb with cross symbol, screen-clear item, holy relic")
  > Magnet pickup:  meshPrompt=  (e.g. "Horseshoe magnet, metallic, compact pickup item")
  > (complete one entry per destructible from Map section, each with meshPrompt)
  > (complete 2-4 environmental props with meshPrompt — dressing that fills empty space)
  > ```

- [ ] **Environmental dressing** — Choose procedural atmosphere layers that make the world feel alive. These are code-only (no assets). Pick 2-4 that fit the tone. Implemented in 3.4. Read `patterns/grass-vegetation.md` and `patterns/environment-dressing.md` for options.
  > ```
  > vegetation:  style= (grass | wheat | bushes | tendrils | crystals | mushrooms | reeds | none)
  >              per-zone config: (e.g. "zone 0 = meadow preset, zone 1 = sparse preset, zone 2 = null")
  > ground:      style= (fallen leaves | pebbles | snow patches | puddles | none)
  > atmosphere:  style= (flies/gnats | floating embers | dust motes | fireflies | spores | none)
  >              density=  color=  drift=
  > fog/haze:    style= (ground fog | heat shimmer | volumetric light shafts | none)
  > ```

- [ ] **Pickup types** — Define drops beyond XP gems. Each pickup needs spawn rules and a `meshPrompt` (defined in Terrain & props above).
  > ```
  > Health drop:    dropChance=___% (from enemies)  healAmount=___
  > Rosary/bomb:    spawnRule= (e.g. "floor spawn every 120s" or "boss drop")  effect= "kill all on-screen enemies"
  > Magnet:         spawnRule= (e.g. "floor spawn every 90s" or "rare enemy drop")  effect= "vacuum all XP gems on screen"
  > ```

- [ ] **Kill milestones** — Define kill thresholds and toast messages. Milestones should feel thematic to the game's tone.
  > ```
  > 100 kills:  toast= (e.g. "Century!")
  > 250 kills:  toast=
  > 500 kills:  toast= (e.g. "Rampage!")
  > 1000 kills: toast=
  > ```

- [ ] **Run stats tracking** — Define which stats to track and display on the end-of-run screen. These accumulate during gameplay and are shown on death/victory. Currency name comes from Meta-progression above.
  > ```
  > Stats to track:
  >   - Total kills (by enemy type)
  >   - Total damage dealt (by weapon — DPS breakdown)
  >   - Total damage taken
  >   - XP collected
  >   - Highest level reached
  >   - Time survived
  >   - Pickups collected (by type)
  >   - Elites killed
  >   - Bosses killed
  >   - Destructibles broken
  >   - Shrines activated
  >   - Level-ups skipped (for ascetic bonus)
  >   - (add/remove as fits the game)
  >
  > End-screen sections:
  >   1. Run summary: time, kills, level, grade. Grade formula: S = survived full duration, A ≥ 80% duration, B ≥ 60%, C ≥ 40%, D < 40%. +1 letter for ≥ 50% weapon variety used.
  >   2. Currency earned: show formula breakdown (kills × rate + boss bonus + time bonus + difficulty multiplier + ascetic bonus)
  >   3. Weapon DPS breakdown: bar chart of damage per weapon
  >   4. Unlocks earned this run: any new characters/items/achievements unlocked (with fanfare)
  >   5. "Continue" → shop screen, "Retry" → same character new run, "Menu" → main menu
  > ```

- [ ] **Waves** — Ramp enemy types and counts over run duration. Include boss spawn times. (`patterns/spawn-waves.md` → accumulator model)
  > ```
  > Wave 1:  duration=___s  spawns: type=___ count=___
  > Wave 2:  duration=___s  spawns: type=___ count=___, type=___ count=___
  > (complete one entry per wave covering full run duration — include boss wave timing)
  > ```

- [ ] **Audio palette** — Pick placeholder sounds for each event. **Per-weapon fire sounds**: assign a distinct sound per weapon type (e.g. revolver = sharp crack, shotgun = heavy boom, laser = zap, melee = whoosh). Browse `static/audio/weapon/` for variety. Also pick: hit, enemy death, player hurt, XP pickup, level up, boss spawn, elite spawn, meta-currency tick, unlock fanfare. Optionally a looping ambient track. Read `patterns/audio-palette.md` for the full sound library catalog.
  > ```
  > Per-weapon fire sounds:
  >   weapon_1 (name):  sound=
  >   weapon_2 (name):  sound=
  >   (one entry per weapon from Weapons section)
  >
  > Global sounds:
  >   hit:          sound=
  >   enemy_death:  sound=
  >   player_hurt:  sound=
  >   xp_pickup:    sound=
  >   level_up:     sound=
  >   boss_spawn:   sound=
  >   elite_spawn:  sound=
  >   currency_tick: sound=  (for end-screen count-up)
  >   unlock:       sound=  (fanfare for new unlock reveal)
  >   purchase:     sound=  (shop purchase confirmation)
  >   shrine:       sound=  (shrine activation / reward reveal)
  > ```

- [ ] **Music direction** — Describe the music mood/genre for each game phase. These are prompts for music generation (`npm run generate-music <slug>`). Read `patterns/music.md` for prompt tips and format.
  > BPM: ___  Key: ___
  > ```
  > Gameplay (loop):  (e.g. "120 BPM, C minor, ambient western guitar, driving percussion, seamless loop, no fade in, no fade out")
  > Boss fight (loop):  (e.g. "120 BPM, C minor, menacing orchestral hit, distorted bass, war drums, seamless loop, no fade in, no fade out")
  > Victory (sting):  (e.g. "C major, triumphant brass fanfare, 8 bars")
  > Death (sting):    (e.g. "C minor, somber piano, fading reverb, 4 bars")
  > ```

- [ ] **Spec generation** — Generate `src/spec.ts` (`GameSpec` object) from above. Include all sections: **elites**, bosses, evolutions, characters, meta-progression (with permanent upgrades, difficulty modifiers, ascetic bonus, reroll/banish config), screen transition, maxWeapons, pickup types, kill milestones, music direction, **font**, run stats config. Save design doc to `docs/<timestamp>_design.md`.
- [ ] Design doc saved

### User review

Present the complete pre-production to the user: concept, palette (show swatches via `npx tsx scripts/preview-palettes.ts`), **font choice**, enemies, **elites**, bosses, weapons, evolutions, characters, meta-progression **(including permanent upgrades, difficulty modifiers, ascetic bonus)**, upgrades, map, pickups, kill milestones, waves, **per-weapon audio assignments**, audio choices, music direction, **run stats config**. Include the palette terminal preview so they can see colors. Wait for approval or change requests before proceeding to Graybox.

---

## Graybox

Build all steps autonomously without stopping for user input. Work through each step in order, verifying sub-gates as you go. Only present the complete playable graybox to the user after all steps pass. Read `patterns/game-architecture.md` (especially "Shared systems"), `patterns/graybox-materials.md`, `patterns/particles.md`, `patterns/game-juice.md`, and `patterns/cross-browser-testing.md` before starting. Use `<GrayboxMaterial>` on all meshes instead of `<meshStandardMaterial>` — use each palette role's color and style.

**Shared systems:** `template/src/systems/` contains reusable logic (grid, collision, navigation, enemies, combat, progression). These are imported directly — not copied into the game. Import path: `import * as combat from '../../../template/src/systems/combat'`. Systems are logic-only (no Three.js, no audio); wire side effects via callback parameters. See `patterns/game-architecture.md` → "Shared systems" for the full list.

**Before each step:** Run `npm run build` — if it fails, fix before proceeding.

**"Verified via playwright" gates:** start the dev server (`npm run dev <slug> -- --serve`) and run `npm run smoke-test http://localhost:3000 --browsers=chromium`. All checks must pass before proceeding.

**Tuning module:** All tweakable multipliers live in `src/tuning.ts` (created in 2.1b). Systems apply tuning multipliers on top of spec base values. The tuning object is exposed as `window.__tuning` for live browser-console adjustment. Cheats (immortality, game speed, skip-to-wave) are also in tuning. Never hardcode a feel-parameter — if a developer might want to tweak it, it goes in tuning.

Every step must include at least one **juice** item — a small code-only feel touch from `patterns/game-juice.md` (impact, motion, feedback, or atmosphere). Pick what fits the moment. No assets required, just code. Don't skip this.

- [ ] **2.1 Loading screen** — Simple loading screen with progress indicator. Shows while 3D assets and audio load. Progress bar + game title. Disappears when all assets are ready.
  - [ ] Loading screen renders with game title and progress bar
  - [ ] Progress bar reflects actual asset loading progress
  - [ ] Screen dismisses when loading completes
  - [ ] Juice: (invent one — e.g. pulsing title, animated progress bar)
  - [ ] Verified via playwright

- [ ] **2.1b Tuning module** — Create `src/tuning.ts`. This is the single file a developer tweaks to adjust game feel. It exports a mutable `tuning` object with multipliers and overrides, grouped by system. The spec defines *what exists* (content), tuning defines *how it feels* (numbers). Expose as `window.__tuning` for live console tweaking. Systems read tuning multipliers and apply them on top of spec base values.
  > ```ts
  > export const tuning = {
  >   combat: {
  >     damageMultiplier: 1.0,
  >     cooldownMultiplier: 1.0,
  >     projectileSpeedMultiplier: 1.0,
  >     knockbackForce: 1.5,
  >     iFrameDuration: 0.5,
  >   },
  >   enemies: {
  >     healthMultiplier: 1.0,
  >     speedMultiplier: 1.0,
  >     spawnRateMultiplier: 1.0,
  >     despawnRadius: 60,  // units — enemies beyond this distance from player are recycled
  >   },
  >   elites: {
  >     // These are 1.0-based multipliers applied ON TOP of spec.elites values.
  >     // e.g. 1.0 = use spec as-is, 1.5 = 50% stronger than spec.
  >     healthMultiplier: 1.0,
  >     sizeScale: 1.0,
  >     speedMultiplier: 1.0,
  >     damageMultiplier: 1.0,
  >     xpMultiplier: 1.0,
  >     spawnChance: 1.0,
  >   },
  >   progression: {
  >     xpMultiplier: 1.0,
  >     currencyMultiplier: 1.0,
  >   },
  >   cheats: {
  >     immortal: false,
  >     oneHitKill: false,
  >     infiniteRerolls: false,
  >     showHitboxes: false,
  >     gameSpeed: 1.0,
  >     skipToWave: 0,
  >     unlockAll: false,
  >   },
  > }
  > if (typeof window !== 'undefined') (window as any).__tuning = tuning
  > ```
  - [ ] `tuning.ts` created with all system groups
  - [ ] `window.__tuning` accessible in browser console
  - [ ] Cheats functional: `__tuning.cheats.immortal = true` prevents player death, `__tuning.cheats.gameSpeed = 2` doubles game speed (scales dt)

- [ ] **2.2 Level generation** — Use `assembleArenaV2()` from `template/src/level/generate.ts` (CA-based). Configure zones from Map section. Read `patterns/level-generation.md` (CA section) and `docs/2026-02-26_00-59-53_Organic terrain from grid data in VS-likes.md`. Apply organic terrain tier based on terrain archetype from Concept.
  - [ ] Arena generated via `assembleArenaV2()` with zone configs from spec
  - [ ] Walls render with correct palette color + graybox material style
  - [ ] Ground noise renders (Perlin color variation visible on floor planes)
  - [ ] Wall boundaries smoothed per archetype (contours for natural/mixed, straight for structured)
  - [ ] Props scatter at wall-floor transitions
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.2b Environmental dressing** — Add the procedural atmosphere layers chosen in pre-production. These are code-only — shader-based vegetation, particle effects, and ambient motion. Read `patterns/grass-vegetation.md` for vegetation and `patterns/environment-dressing.md` for the rest. Wire vegetation into chunk activation/deactivation lifecycle (build on activate, dispose on deactivate). Atmosphere particles are global (follow player).
  - [ ] Vegetation renders on walkable floor cells (if chosen) — uses `template/src/level/grass.ts`, `InstancedBufferGeometry`, palette-derived colors. Must not obscure gameplay (keep height ≤0.4, use `alphaTest` not `transparent`)
  - [ ] Atmosphere particles emit continuously (if chosen) — custom shader for drift/glow, pooled
  - [ ] Ground scatter placed via noise (if chosen) — small instanced quads/meshes at floor level
  - [ ] All dressing uses palette colors and complements the game's mood
  - [ ] No significant FPS drop (budget: <2ms total for all dressing)
  - [ ] Juice: (the dressing itself is the juice)
  - [ ] Verified via playwright

- [ ] **2.3 Player** — Player capsule, WASD movement, camera follow, wall collision. Import `systems/collision` for `resolvePlayerCollision` and `wrapPosition`, `systems/grid` for grid utilities.
  - [ ] Player moves 4 directions, camera follows
  - [ ] Walls block player
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.4 Enemy spawning & navigation** — Read `patterns/spawn-waves.md` and `patterns/level-generation.md` (enemy navigation). Import `systems/enemies` for wave director + spawn logic, `systems/navigation` for flow field BFS + LOS. Wire `EnemyConfig` from spec values.
  - [ ] Enemies spawn in waves at ring perimeter
  - [ ] Enemies navigate around walls toward player
  - [ ] Intensity escalates over time
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.5 Enemy behavior & elites** — Contact damage, separation steering, object pooling, elite variants. Import `tickSeparation` and `tickContactDamage` from `systems/enemies`, `createSpatialHash` from `systems/spatial`. Read elite config from spec, apply tuning multipliers from `tuning.elites`.
  - [ ] Contact damage works
  - [ ] Enemies don't overlap (separation steering with spatial hash)
  - [ ] Enemies use object pool (no allocation on spawn/despawn)
  - [ ] Elite system: after `spawnStartWave`, `spawnChance`% of enemies spawn as elite
    - [ ] Elite enemies get: health × `healthMultiplier`, size × `sizeScale`, damage × `damageMultiplier`, XP × `xpMultiplier`, speed × `speedMultiplier`
    - [ ] `<ParticleEffect preset="aura">` with `auraColor` on all elite enemies
    - [ ] Elite enemies always show health bar (same style as 2.8 tanky enemy bars, but always visible)
    - [ ] Elite enemies drop bonus loot per `dropBonus` config
  - [ ] Juice: (invent one — screen flash or brief slow-mo on elite spawn recommended)
  - [ ] Offscreen despawn: enemies beyond `despawnRadius` (tuning parameter, default ~60 units / ~2 screen widths) are returned to pool. Spawn budget recycles them at the ring perimeter ahead of the player. Without this, entity count grows unbounded in scrolling arenas.
  - [ ] Verified via playwright

- [ ] **2.6 Weapons & combat** — Weapons from spec. Import `systems/combat` for `tickWeapons`, `tickProjectiles`, `tickPickups`. Wire `CombatCallbacks` for audio/particles (systems are logic-only). Pool projectiles.
  - [ ] Weapons auto-fire
  - [ ] Projectiles kill enemies
  - [ ] XP gems drop on enemy death
  - [ ] Projectiles use object pool
  - [ ] `particles.emit('burst', ...)` on enemy death, `'radial'` on AoE hits (use palette colors)
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.10 Progression** — XP gems → bar → level-up choices. Import `systems/progression` for `xpToNext`, `selectChoices`, `applyChange`. Read `patterns/progression.md` for UI (weapon cap, reroll/banish). Pool XP gems. (Magnet pull wired later in 2.7 Pickups.)
  - [ ] XP bar fills
  - [ ] Level-up modal with correct choices
  - [ ] Selection applies upgrade
  - [ ] Weapon cap enforced — no new weapons offered when at `maxWeapons`
  - [ ] Weapon icon/mesh thumbnail shown next to each upgrade option
  - [ ] Reroll button spends a charge and re-rolls choices (charge count visible)
  - [ ] Skip button dismisses level-up without choosing
  - [ ] Banish button removes selected upgrade from pool (banish count visible)
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **Perf check** — 200 enemies + 50 projectiles on screen, tick stays <16ms. The profiler is in `src/profile.ts` — it's already imported and wired into `tick()` and the renderer. To use it:
  1. Wrap every system call in `tick()` with `profile.start/stop` pairs using dotted keys (e.g. `tick.enemies`, `tick.weapons`, `tick.projectiles`). For any system >2ms, add sub-keys for inner loops (e.g. `tick.enemies.separation`).
  2. Run `PROFILE=1 npm run dev`. The console prints a tree every 60 frames with avg/max per system. Frames >16ms auto-dump as `[profile:spike]`.
  3. For Playwright automation: `await page.evaluate(() => window.__PROFILE_DATA__)` returns structured JSON — no console parsing needed.
  4. Fix the system the profiler identifies. Don't guess.
  - [ ] Movement stress test: hold one direction for 30s at peak load. Tick <16ms as chunks activate/deactivate, flow field recalculates, enemies despawn/respawn.
  - [ ] If tick is under budget but frames still drop: check `renderer.info` in profiler output — draw calls >200 → instancing/merging, triangles >500k → LOD/culling.

- [ ] **2.6b Stats tracking** — Wire a `RunStats` accumulator into the game manager. Every kill, damage event, pickup, etc. increments the relevant counter. Stats are pure data — no rendering yet (that's 2.14).
  - [ ] `RunStats` object tracks: kills (total + per enemy type), damage dealt (total + per weapon), damage taken, XP collected, pickups collected (per type), elites killed, bosses killed, level-ups skipped (for ascetic bonus)
  - [ ] Stats accumulate correctly during gameplay (verified by logging at end of test run)

- [ ] **2.7 Pickups & screen-clear items** — Health drops from enemies (per `dropChance` in spec), rosary/bomb floor spawns (timed or boss drop), magnet vacuum. Pool all pickup types. Pickups use palette Accent color + graybox material.
  - [ ] Health drops spawn from enemies at configured drop chance
  - [ ] Rosary/bomb spawns on floor per configured rule, kills all on-screen enemies when collected
  - [ ] Magnet pickup vacuums all XP gems on screen when collected
  - [ ] All pickups use object pool
  - [ ] `particles.emit('burst', ...)` on pickup collection
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.8 Combat feedback** — Damage numbers, hit flash, knockback, i-frames with visibility flicker. Read `patterns/game-juice.md` → Impact section.
  - [ ] Damage numbers float up from hit entities
  - [ ] Enemies flash white on hit
  - [ ] Enemies knocked back from damage source
  - [ ] Player has i-frames after taking damage (visibility flickers)
  - [ ] Health bars on tanky enemies: enemies with health > 1 hit show a small HP bar above their mesh when damaged (bar appears on first hit, fades after 3s of no damage). Use palette accent color for bar fill, dark background. Bosses use the larger overlay bar from 2.11 instead.
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.9 Destructibles & shrines** — Weapons damage destructibles → loot drops. Shrines → pause + choice modal.
  - [ ] Destructibles break and drop pickups
  - [ ] Shrines pause and present choices
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.11 Boss encounters** — Boss spawns at configured wave time. Unique mesh (larger, distinct graybox color), health bar overlay, telegraphed attacks, reward drop on kill.
  - [ ] Boss spawns at correct time
  - [ ] Boss health bar visible
  - [ ] Boss attacks are telegraphed (visual warning before damage)
  - [ ] Boss drops reward on death
  - [ ] Juice: (invent one — time dilation on boss spawn recommended)
  - [ ] Verified via playwright

- [ ] **2.12 Weapon evolution** — When two input weapons are both max level, evolution becomes available. Show evolution option in level-up modal. Evolved weapon replaces both inputs.
  - [ ] Evolution option appears when prerequisites are met
  - [ ] Evolved weapon has merged/enhanced behavior
  - [ ] Both input weapons removed on evolution
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.13 HUD & menus** — HTML overlay: health, XP, timer, kills, level, weapon bar. Main menu, pause menu, settings. Kill milestone toasts at configured thresholds (brief screen flash + counter).
  - [ ] Load font from local `static/fonts/*.woff2` via `@font-face` in CSS (no CDN). Apply display font to title, menus, toasts, level-up modal. Apply HUD font to HP/XP/timer/kills. Verify font loads before first paint (`document.fonts.ready`).
  - [ ] Main menu
    - [ ] New Game
    - [ ] Character select screen:
      - [ ] Grid/carousel of all characters (unlocked shown full, locked shown silhouette/grayed with lock icon)
      - [ ] Selected character shows: 3D model preview (graybox: colored capsule; replaced with character mesh in Phase 3) rotating on pedestal, name, tagline, description
      - [ ] Stat comparison bars (health/speed/damage/luck — filled stars or bar segments from `statProfile`)
      - [ ] Starting weapon name + icon shown
      - [ ] Unlock condition text on locked characters (e.g. "Survive 5 minutes")
      - [ ] Confirm button starts run with selected character
    - [ ] Shop / Upgrades (see 2.15)
    - [ ] Challenge modifiers (see 2.15 — hidden until first win)
    - [ ] Options / Settings
      - [ ] Music volume slider or number (whichever fits better with aesthetic)
      - [ ] Sound volume slider or number (whichever fits better with aesthetic)
      - [ ] Screen darkness
  - [ ] HUD updates during gameplay
  - [ ] Weapon HUD: row of weapon icons (bottom or side of screen) showing all currently held weapons
    - [ ] Each weapon shows: icon (graybox = colored shape per weapon category), cooldown ring/overlay that fills as weapon recharges
    - [ ] New weapon acquisition briefly highlights the new icon (pulse + sound)
    - [ ] Weapon count shown as "3/6" (current / maxWeapons cap)
  - [ ] Pause screen shows: weapon details (name, level/upgrade count, base stats), controls, settings
  - [ ] Kill milestone toasts appear at configured thresholds (e.g. "Century!" at 100 kills)
  - [ ] Toast includes brief screen flash + kill counter
  - [ ] Mobile: detect touch device, show pause button in HUD
  - [ ] Settings persist to localStorage
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.14 Win/loss flow & run stats** — Complete game loop with detailed stats screen. Death: slow-mo, multi-section stats screen, meta-currency earned, return to menu. Win: victory variant. Reads `RunStats` accumulated in 2.6b.
  - [ ] Death triggers slow-mo + screen transition to stats screen
  - [ ] Stats screen section 1 — Run summary: time survived, total kills, level reached, grade (S/A/B/C/D)
  - [ ] Stats screen section 2 — Currency earned: animated count-up of meta-currency with breakdown (kills × rate + boss bonus + time bonus + difficulty modifier multiplier + ascetic bonus). Sound effect (`currency_tick`) ticks with each increment. Currency icon/name from spec.
  - [ ] Stats screen section 3 — Weapon DPS breakdown: horizontal bar per weapon showing total damage dealt, sorted highest first. Weapon icon + name + damage number.
  - [ ] Stats screen section 4 — Unlocks: if any new characters/items/achievements were unlocked this run, reveal them with fanfare animation (silhouette → full reveal, sparkle particles, unlock sound). If none, skip this section.
  - [ ] Navigation: "Continue" → shop screen, "Retry" → same character new run, "Menu" → main menu
  - [ ] Victory screen: same sections but with victory header, confetti particles, victory music sting
  - [ ] Juice: make the whole sequence very juicy — count-up sounds, particle bursts on milestones, screen shake on grade reveal, slow-mo currency accumulation
  - [ ] Verified via playwright

- [ ] **2.15 Meta-progression & shop** — Persistent unlock system with a between-run shop screen. Meta-currency accumulates across runs (localStorage). Accessible from main menu.
  - [ ] Meta-currency persists across runs (localStorage)
  - [ ] Shop screen accessible from main menu ("Shop" / "Upgrades" button)
    - [ ] Currency balance displayed prominently (top of screen, with icon)
    - [ ] Permanent stat upgrades shown as grid/list with: name, current rank (filled pips), cost of next rank, effect description. Grayed out if max rank or insufficient currency.
    - [ ] Purchase confirmation (tap upgrade → cost deducted, rank pip fills, brief sparkle/sound)
    - [ ] "NEW!" badge on unpurchased upgrades (first visit after earning enough currency)
    - [ ] Refund/re-spec button (returns all currency spent on permanent upgrades)
  - [ ] Content unlocks section: locked items show silhouette + cost, unlocked items show full icon + "OWNED"
  - [ ] Unlocked characters appear in character select
  - [ ] Permanent upgrades apply as stat modifiers on run start (additive with character modifiers)
  - [ ] Difficulty modifiers (unlocked after first clear — i.e. first time player survives the full run duration; gate stored in localStorage):
    - [ ] "Challenge" button on main menu (hidden until first win)
    - [ ] Toggle screen: list of modifiers with on/off switches, each showing effect + currency bonus
    - [ ] Active modifiers shown as icons on HUD during run
    - [ ] Enemy stats scaled by active modifier multipliers (stacking)
    - [ ] End-of-run currency multiplied by combined active modifier bonus
  - [ ] Ascetic bonus: if player skipped ≥ threshold level-ups, apply currency multiplier on end screen (show "Ascetic bonus: ×1.5" in currency breakdown)
  - [ ] Main menu shows: currency balance, total upgrades purchased (e.g. "12/40"), subtle progress indicator
  - [ ] Juice: coin/currency particle burst on purchase, rank-up sparkle animation
  - [ ] Verified via playwright

- [ ] **2.16 Onboarding** — First 10 seconds of first run: show control hints (WASD/joystick to move, weapons auto-fire). Fade out after player moves. Don't show on subsequent runs.
  - [ ] Control hints appear on first run
  - [ ] Hints fade after player moves
  - [ ] Hints don't reappear on subsequent runs
  - [ ] Verified via playwright

- [ ] **2.17 Screen transitions** — Use the transition style from Concept (fade/pixelate/wipe-down/dissolve/glitch). Apply between: menu → game, game → stats, stats → menu. Transition should match the game's tone.
  - [ ] Transitions play between all screen changes
  - [ ] Transition style matches SOP Concept → Screen transition field
  - [ ] Juice: (built into the transition itself)
  - [ ] Verified via playwright

- [ ] **Audio** — Wire `audio.player.play()` for SFX: **per-weapon fire sounds** (each weapon type uses its own sound from audio palette), enemy death, XP pickup, player hurt, level up, boss spawn, elite spawn, evolution, meta-unlock, currency tick, purchase. Wire `audio.player.playMusic()` for placeholder music transitions (gameplay start, boss spawn, win/loss). Read `patterns/music.md`.
  - [ ] Each weapon type plays its own distinct fire sound (from audio palette per-weapon assignments)
  - [ ] All other events have sound feedback
  - [ ] Sounds don't stack/clip (debounce rapid fires)
  - [ ] Music plays on game start, transitions on boss spawn / game over

- [ ] **Touch controls** — Virtual joystick overlay for mobile. Touch targets ≥44px. Test in Chrome DevTools mobile emulation.
  - [ ] Joystick moves player
  - [ ] No layout issues at 375×667

- [ ] **Cross-browser smoke test** — Run `npm run smoke-test http://localhost:3000 --browsers=chromium` (add `firefox,webkit` if available). All checks must pass. See `patterns/cross-browser-testing.md`.

### User review

Start the dev server (`npm run dev <slug> -- --serve`). Present the playable graybox to the user: list what works, what each system does, and how to test it. Wait for approval or change requests before proceeding to Polish.

---

## Asset Selection/Generation

- [ ] **Audio selection** — Run `npm run pick-audio <slug>` with slots for **every weapon** (using per-weapon names from pre-production) plus all global sound events. Example: `npm run pick-audio <slug> --slot revolver-fire "sharp crack, western six-shooter" --slot shotgun-fire "heavy boom, double barrel" --slot hit "meaty impact" --slot enemy-death "crunch" --slot elite-spawn "menacing rumble" --slot currency-tick "coin clink" --slot purchase "cash register" ...`. This launches a web UI where the user previews sounds from the library and assigns them. Wire per-weapon sounds in combat callbacks: `audio.player.play(weapon.type + '-fire')`.
  - [ ] All sound slots have user-selected audio files
  - [ ] Each weapon type has a distinct fire sound
  - [ ] No placeholder sounds remain

- [ ] **Music generation** — Run `npm run generate-music <slug>`. Generates OGG Opus tracks via fal.ai (ACE-Step). User reviews/selects tracks. Wire into `audio.player.playMusic(track, { fade: 3 })` — one track per phase, crossfade between them on phase transitions. See `patterns/music.md`.
  - [ ] Music tracks generated for each phase (OGG Opus, not MP3)
  - [ ] User reviewed and selected tracks
  - [ ] `playMusic` called on phase transitions (elapsed time thresholds, boss spawn, game over)
  - [ ] Boss fight music triggers on boss spawn with fast fade (~1s)
  - [ ] Victory/defeat stings play with `{ loop: false }`
  - [ ] Verified via playwright: after transition, `__audioPlayer.currentTrack` is correct track name


- [ ] **3.1 Mesh manifest** — Write `mesh-manifest.json` in the game root using `meshPrompt` fields from pre-production. The manifest has two sections: `characters` (enemies, bosses, players — rigged + animated) and `props` (walls, destructibles, shrines, pickups, weapon projectiles, dressing — static only). Weapon projectiles and pickups are props (no rig needed). Each entry can set `targetPolycount` to override the default budget. Include a `role` field describing the mesh's gameplay purpose — the material zone preview tool displays this for context. Polygon budgets (enforced via Meshy remesh): enemy=1500, boss=5000, player=3000, prop=500. See `scripts/generate-meshes.ts` for format.
  > ```json
  > {
  >   "characters": [
  >     {"name": "goblin", "prompt": "Low poly goblin, T-pose, game character", "targetPolycount": 1500, "role": "Fast melee swarm enemy"}
  >   ],
  >   "props": [
  >     {"name": "barrel", "prompt": "Wooden barrel, simple, game prop", "role": "Destructible container"}
  >   ]
  > }
  > ```

- [ ] **3.2 3D Meshes** — Run `npx tsx scripts/generate-meshes.ts <slug>` from the **project root**. Review thumbnails in `static/models/*-preview.png`. Re-run individual entries if quality is poor (edit manifest prompt, delete old files, re-run). Read `patterns/character-animation.md` for file layout, loading, and animation.
  - [ ] All enemies generated and rigged
  - [ ] All bosses generated and rigged
  - [ ] All player characters generated and rigged
  - [ ] All terrain/props generated (static, no rig)
  - [ ] Replace graybox meshes with generated assets in code
  - [ ] Weapon HUD icons replaced: render each weapon's projectile mesh as a small thumbnail (or use a 2D sprite rendered from the 3D model). Cooldown ring still overlays.
  - [ ] Assets render correctly (use `SkeletonUtils.clone` for skinned meshes — see `patterns/character-animation.md`)
  - [ ] Walk/run animations play on moving characters (extract clips from `-walk.glb`/`-run.glb`, crossfade based on speed)
  - [ ] Stopped characters show T-pose or blended-to-zero walk (no idle from Meshy)
  - [ ] No gameplay regressions

- [ ] **3.3 Material zones** — For each character/boss model, write a zone config (`material-zones/<model>.json`). Read `patterns/material-zones.md` for zone format, bone-weight classification, and the iteration loop. Run `npx tsx scripts/preview-material-zones.ts <slug> <model>` from the **project root** to generate debug screenshots. Up to 10 iterations per model.
  - [ ] Zone configs written for all characters and bosses with `bones` arrays (for rigged models)
  - [ ] `[bone-zones]` output shows 0 UNMAPPED bones and <1% fallback per model
  - [ ] Debug previews show correct zone boundaries (inspected from all 6 angles + scatter plot)
  - [ ] Zone colors use palette colors (verified against palette swatches in preview header)
  - [ ] Zone configs integrated into game rendering (multi-style GrayboxMaterial per mesh)

- [ ] **3.4 Post-processing** — Add a full-screen post-processing pass. Read `patterns/post-processing.md`. Pick effects that fit the game's mood/tone (read Concept section). Use R3F `@react-three/postprocessing` (wraps pmndrs/postprocessing). Keep it subtle — enhance, don't obscure.
  - [ ] Post-processing pipeline renders
  - [ ] No significant FPS drop (budget: <2ms)
  - [ ] Effects complement the game's palette/mood

---

## Playtesting

- [ ] **Smoke checks** — Read `patterns/playtesting.md` for thresholds. Run `npx tsx scripts/bot-runner.ts <slug>`. If checks fail, adjust `spec.ts` or `tuning.ts` and re-run. Also test with all difficulty modifiers: set every modifier to enabled in `tuning.ts` cheats (`__tuning.cheats.unlockAll = true`), then re-run the bot.
  - [ ] Balance checks pass (default modifiers)
  - [ ] Balance checks pass with all difficulty modifiers active (harder but survivable past 30s)
  - [ ] Stationary test passes (player dies)
  - [ ] No crashes over full run duration

- [ ] **Regression suite** — Collect all Playwright checks and bot-runner assertions created during graybox into a single `npm run regression <slug>` command. Run it. All must pass.
  - [ ] Regression suite runs green

- [ ] **User playtest** — Present the game to the user. Provide the difficulty chart (`npx tsx scripts/plot-difficulty.ts <slug>` — ASCII visualization of HP/enemies/XP over time from bot runs) so user can see the shape of the experience. User plays, provides tuning feedback.
  - [ ] User playtest approved
  - [ ] Tuning finalized in `spec.ts`

- [ ] **Mobile build** — Run `npm run build-mobile <slug>`. Test in iOS Simulator and/or Android emulator. Verify touch controls, safe areas, orientation lock. See `patterns/mobile-build.md`.
  - [ ] Mobile build succeeds
  - [ ] Game plays correctly on mobile

---

## Polish

- [ ] **Game feel pass** — Dedicated session applying `patterns/game-juice.md` holistically. Play the game, identify moments that feel flat, add juice: screen shake, hit-stop, camera zoom, time dilation, atmosphere particles. Layer effects on big moments (boss kill, level up, near death). This is about cohesion — making the whole game feel consistent, not just individual systems.
  - [ ] Play through a full run and identify flat moments
  - [ ] Add/tune juice for: kills, player damage, level-up, boss encounters, near-death
  - [ ] Verify effects stack well on big moments (not too much, not too little)
  - [ ] Verified via playwright

- [ ] **Performance optimization** — The profiler is already wired into `tick()` and the renderer (`src/profile.ts`). Instrument every system call in `tick()` with `profile.start/stop` pairs, then run `PROFILE=1 npm run dev`. Stress-test peak enemies + projectiles + particles + post-processing. Read the avg/max tree and spike dumps to identify which systems exceed budget (<16ms tick, <16ms render). Fix the actual bottlenecks.
  - [ ] Peak scenario stays within frame budget
  - [ ] No GC pauses during gameplay (check for max >> avg in profiler output)
  - [ ] If tick is under budget but frames still drop: check `renderer.info` — draw calls >200 → instancing/merging, triangles >500k → LOD/culling.
