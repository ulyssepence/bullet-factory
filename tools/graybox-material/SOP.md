# Game SOP

> Run `npm run new <slug>` to scaffold from template. Then work through this file.

**Notes convention:** When you hit a snag, defer something, or discover a complication, append a note under the relevant checkbox. Keep notes actionable — what was deferred and why, not commentary. Example:

```
- [x] **2.3 Enemies & Waves** — ...
  - [x] Enemies spawn in waves
  - [x] Contact damage works
  > **Note:** Spatial hash cell size 2.0 caused enemies to miss neighbors at high speed. Bumped to 3.0. May need revisiting if enemy sizes vary more in asset phase.
```

Don't delete notes — they're history for the next agent or session.

Read `patterns/game-spec.md` and `patterns/game-architecture.md` before starting.

---

## Pre-production

Draft all sections autonomously — do NOT ask the user for confirmation between steps. Fill every blank, check every box, generate spec.ts and the design doc. Only then present the complete pre-production package to the user for a single review. No game code until user approves.

- [ ] **Concept** — Interpret the user's prompt as a VS-like game.
  > Prompt:
  > Title:
  > Concept:
  > Enemy types:
  > Weapons:
  > Run duration:        seconds
  > Arena style:         scrolling / fixed / hybrid

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

- [ ] **Enemies** — Vary archetypes: walker, runner, tank, ranged, swarm. (`patterns/game-spec.md` → `EnemyDef`)
  > ```
  > Enemy 1:  type=  health=  speed=  damage=  size=  xpValue=
  > Enemy 2:
  > ...
  > ```

- [ ] **Weapons** — VS forms: melee swing, nearest-enemy projectile, radial burst, orbital, etc. Mark starting weapon. (`patterns/game-spec.md` → `WeaponDef`)
  > ```
  > Weapon 1 (starting):  type=  category=  damage=  cooldown=  projectileSpeed=  pierce=  count=
  > Weapon 2:
  > ...
  > ```

- [ ] **Upgrades** — One sequence per weapon + 2-3 stat sequences (health, speed, magnet). Sequence-front model. (`patterns/game-spec.md` → `UpgradeSequence`)
  > ```
  > Sequence: (id)
  >   1. label=  weight=  change=
  >   2.
  >
  > Sequence: (id)
  >   1.
  > ```

- [ ] **Map** — Chunk templates themed to setting. (`patterns/level-generation.md` → design rules: open edges, flood-fill connected, 15-25% obstacles, 1-2 destructibles/chunk, 0-1 shrines)
  > Grid: ___×___ cells/chunk, ___×___ chunks
  >
  > ```
  > Chunk 1: (name)
  > ................................
  > ................................
  > ```
  >
  > Destructibles (`DestructibleDef`): id, name, health, size, loot
  > ```
  > 1.
  > 2.
  > ```
  >
  > Shrines (`ShrineDef`): type, name, description
  > ```
  > 1.
  > 2.
  > ```

- [ ] **Waves** — Ramp enemy types and counts over run duration. (`patterns/spawn-waves.md` → accumulator model)
  > ```
  > Wave 1:  duration=___s  spawns: type=___ count=___
  > Wave 2:  duration=___s  spawns: type=___ count=___, type=___ count=___
  > ...
  > ```

- [ ] **Audio palette** — Pick placeholder sounds for: hit, enemy death, player hurt, XP pickup, level up, weapon fire. Optionally a looping ambient track. Customize `static/audio/` if defaults don't fit.

- [ ] **Spec generation** — Generate `src/spec.ts` (`GameSpec` object) from above. Save design doc to `docs/<timestamp>_design.md`.
- [ ] Design doc saved

### User review

Present the complete pre-production to the user: concept, palette (show swatches via `npx tsx scripts/preview-palettes.ts`), enemies, weapons, upgrades, map, waves, audio choices. Include the palette terminal preview so they can see colors. Wait for approval or change requests before proceeding to Graybox.

---

## Graybox

Build all steps autonomously without stopping for user input. Work through each step in order, verifying sub-gates as you go. Only present the complete playable graybox to the user after all steps pass. Read `patterns/game-architecture.md`, `patterns/graybox-materials.md`, and `patterns/particles.md` before starting. Use `<GrayboxMaterial>` on all meshes instead of `<meshStandardMaterial>` — use each palette role's color and style.

Every step must include at least one **juice** item — a small code-only feel touch (easing, camera effect, transform animation, screen flash, etc.) that makes the graybox feel alive. Invent something fitting for each step. No assets required, just code. Don't skip this.

- [ ] **2.1 & 2.2 Level & Player** — Read `patterns/level-generation.md`. Chunks → toroidal grid → activation ring → rendering → player capsule → WASD + touch → camera follow → wall collision.
  - [ ] Chunks render/unload on boundary crossing
  - [ ] Player moves 4 directions, camera follows
  - [ ] Walls block player
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.3 Enemies & Waves** — Read `patterns/spawn-waves.md` and `patterns/level-generation.md` (enemy navigation + collision avoidance). Accumulator spawning on floor cells at ring perimeter. Navigation: LOS → beeline, blocked → flow field. Separation steering via spatial hash so enemies don't stack. Use object pools (`patterns/game-architecture.md` → object pooling).
  - [ ] Enemies spawn in waves, navigate around walls
  - [ ] Contact damage works
  - [ ] Enemies don't overlap (separation steering with spatial hash)
  - [ ] Enemies use object pool (no allocation on spawn/despawn)
  - [ ] Intensity escalates
  - [ ] `<ParticleEffect preset="aura">` on special/elite enemy types (use enemy palette color)
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.4 Weapons & Combat** — Weapons from spec. Auto-fire on cooldown. Projectile-wall collision via collision grid. Pool projectiles.
  - [ ] Weapons auto-fire
  - [ ] Projectiles kill enemies
  - [ ] XP gems drop
  - [ ] Projectiles use object pool
  - [ ] `particles.emit('burst', ...)` on enemy death, `'radial'` on AoE hits (use palette colors)
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **Perf check** — 200 enemies + 50 projectiles on screen, tick stays <16ms. If not, switch to spatial hash / instanced mesh before continuing.

- [ ] **2.5 Destructibles & Shrines** — Weapons damage destructibles → loot drops. Shrines → pause + choice modal.
  - [ ] Destructibles break and drop pickups
  - [ ] Shrines pause and present choices
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.6 Progression** — XP gems → magnet pull → bar. Level-up → sequence-front weighted selection → apply `PlayerChange`. (`patterns/game-spec.md` → upgrade algorithm). Pool XP gems.
  - [ ] XP bar fills
  - [ ] Level-up modal with correct choices
  - [ ] Selection applies upgrade
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **2.7 HUD & UI** — HTML overlay: health, XP, timer, kills, level. Modals: level-up, shrine, game over, win. Restart.
  - Just use built-in fonts for now
  - [ ] Game should start with main menu
    - [ ] New Game
    - [ ] Options or Settings
      - [ ] Music volume slider or number (whichever fits better with aesthetic)
      - [ ] Sound volume slider or number (whichever fits better with aesthetic)
      - [ ] Screen darkness
  - [ ] HUD updates during gameplay
  - [ ] All modals function
  - [ ] Restart works
  - [ ] Juice: (invent one)
  - [ ] Verified via playwright

- [ ] **Audio** — Wire `audio.play()` calls: weapon fire, enemy death, XP pickup, player hurt, level up. Ambient loop on game start.
  - [ ] All events have sound feedback
  - [ ] Sounds don't stack/clip (debounce rapid fires)

- [ ] **Touch controls** — Virtual joystick overlay for mobile. Touch targets ≥44px. Test in Chrome DevTools mobile emulation.
  - [ ] Joystick moves player
  - [ ] No layout issues at 375×667

### User review

Start the dev server (`npm run dev <slug> -- --serve`). Present the playable graybox to the user: list what works, what each system does, and how to test it. Wait for approval or change requests before proceeding to Asset Generation.

---

## Asset Generation

- [ ] **3.1 3D Meshes** — Replace graybox with themed assets. One entity type at a time. Only after all gameplay gates pass.
  - Enemies
    - (enemy name)
      - [ ] Generate a mesh using Meshy AI's MCP server
  - [ ] Assets render correctly
  - [ ] No gameplay regressions

- [ ] **3.2 Post-processing** — Add a full-screen post-processing pass. Read `patterns/post-processing.md`. Pick effects that fit the game's mood (e.g. bloom + vignette + color grading, CRT scanlines, chromatic aberration). Use R3F `@react-three/postprocessing` (wraps pmndrs/postprocessing). Keep it subtle — enhance, don't obscure.
  - [ ] Post-processing pipeline renders
  - [ ] No significant FPS drop (budget: <2ms)
  - [ ] Effects complement the game's palette/mood

## Playtesting

- [ ] **3.1 Tuning** — Build headless bot runner (random-walk, no rendering). Balance checks (`patterns/game-spec.md`): 10 runs, >80% pass (survive >30s, take damage, level 3 by 2min, enemies <300, tick <16ms). Adjust `spec.ts`, re-run. Then user playtests.
  - [ ] Bot runner implemented
  - [ ] Balance checks pass
  - [ ] User playtest approved
  - [ ] Tuning finalized in `spec.ts`
