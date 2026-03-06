# Game Spec

Phase 1 produces a typed `GameSpec` object alongside the design doc. Phase 2 code imports and consumes it directly. This eliminates the "prose → code" translation step where the agent misinterprets its own design doc.

The spec lives at `games/<slug>/src/spec.ts` and is the single source of truth for all game parameters.

## The spec

```ts
interface GameSpec {
  meta: {
    title: string
    slug: string
    seed: number
    runDuration: number                   // seconds (e.g. 600 for 10 min)
  }

  palette: {
    ground: string                        // hex
    wall: string
    player: string
    accent: string                        // UI highlights, XP gems
    enemy: Record<string, string>         // enemyType → hex color
  }
  // All downstream colors (zone tints, grass, UI bg) derive from these 5 roles.
  // See patterns/palette.md. No hardcoded hex elsewhere in game code.

  map: {
    chunkSize: number                     // cells per side (e.g. 32)
    gridWidth: number                     // chunks per side (e.g. 16)
    chunks: ChunkDef[]                    // 6-12 templates
  }

  player: {
    maxHealth: number
    speed: number
    magnetRadius: number
    startingWeapon: WeaponDef
  }

  enemies: EnemyDef[]

  bosses: BossDef[]

  weapons: WeaponDef[]                    // full pool (player discovers via level-up)

  evolutions: EvolutionRecipe[]

  characters: CharacterDef[]

  waves: WaveDef[]

  destructibles: DestructibleDef[]

  shrines: ShrineDef[]

  pickups: PickupDef[]

  killMilestones: KillMilestone[]

  elites: EliteConfig

  font: {
    displayFamily: string                     // e.g. 'Bungee Shade'
    hudFamily: string                         // e.g. 'Press Start 2P' (can be same as display)
    baseSizePx: number                        // base font size for body text
  }

  screenTransition: 'fade' | 'pixelate' | 'wipe-down' | 'dissolve' | 'glitch'

  musicDirection: MusicDirection

  metaProgression: MetaProgressionDef

  progression: {
    xpToNextBase: number                  // XP for level 2
    xpScaling: number                     // multiplier per level (e.g. 1.4)
    upgrades: UpgradeSequence[]           // vending machine rows
    choicesPerLevel: number               // how many choices to offer (typically 3)
    maxWeapons: number                    // weapon slot cap (default 6)
    rerollCharges: number                 // starting reroll charges per run
    banishSlots: number                   // max upgrades banishable per run
  }
}
```

## Sub-definitions

```ts
interface ChunkDef {
  id: string
  cells: string[]                         // row strings: '.' = floor, '#' = wall
  destructibles: [number, number, string][] // [row, col, destructibleId]
  shrines: [number, number, string][]       // [row, col, shrineType]
}

interface EnemyDef {
  type: string
  health: number
  speed: number
  damage: number
  size: number
  xpValue: number
}

interface WeaponDef {
  type: string
  category: 'targeted' | 'radial' | 'orbital'
  damage: number
  cooldown: number                        // seconds
  projectileSpeed: number
  pierce: number
  count: number                           // projectiles per shot or orbitals
}

interface WaveDef {
  duration: number                        // seconds
  spawns: { enemyType: string; count: number }[]
}

interface DestructibleDef {
  id: string
  name: string                            // themed (e.g. "Rusted Car")
  health: number
  size: number
  loot: { type: string; chance: number; value: number }[]
}

interface BossDef {
  name: string
  spawnTime: number                       // seconds into run
  health: number
  speed: number
  damage: number
  attacks: BossAttack[]
  reward: { type: string; value: number } // e.g. { type: 'xp', value: 500 }
}

interface BossAttack {
  name: string
  damage: number
  telegraph: number                       // seconds of warning before hit
  cooldown: number
  pattern: 'radial' | 'aimed' | 'area' | 'summon'
}

interface EvolutionRecipe {
  inputs: [string, string]                // two weapon types, both must be max level
  result: WeaponDef                       // evolved weapon replaces both
  description: string
}

interface CharacterDef {
  id: string
  name: string
  tagline: string                              // one-liner for select screen (e.g. "Steady aim, iron will")
  startingWeapon: string                       // weapon type from weapons pool
  statModifiers: Partial<{ maxHealth: number; speed: number; magnetRadius: number; damage: number; luck: number }>
  statProfile: Record<string, number>          // 1-5 star ratings for select screen display (health, speed, damage, luck)
  description: string
  unlockCondition?: string                     // omit for default character
}

interface PickupDef {
  type: 'health' | 'rosary' | 'magnet'
  dropChance?: number                     // 0-1, for enemy drops (health)
  healAmount?: number                     // for health pickups
  spawnRule?: string                      // e.g. 'floor_120s', 'boss_drop'
  effect?: string                         // e.g. 'kill_all_onscreen', 'vacuum_xp'
}

interface KillMilestone {
  threshold: number                       // kill count
  toast: string                           // e.g. "Century!", "Rampage!"
}

interface MusicDirection {
  bpm: number
  key: string                             // e.g. 'C minor'
  tracks: {
    gameplay: string                      // Suno/ACE-Step prompt (loop)
    boss: string                          // prompt (loop)
    victory: string                       // prompt (sting, not looped)
    death: string                         // prompt (sting, not looped)
  }
}

interface EliteConfig {
  healthMultiplier: number                     // e.g. 3.0
  sizeScale: number                            // e.g. 1.3
  speedMultiplier: number                      // e.g. 0.9
  damageMultiplier: number                     // e.g. 1.5
  xpMultiplier: number                         // e.g. 3.0
  dropBonus: string                            // e.g. 'guaranteed_health'
  spawnStartWave: number                       // no elites before this wave
  spawnChance: number                          // 0-1 chance per spawned enemy
  auraColor: string                            // hex — for particle aura
}

interface PermanentUpgradeDef {
  id: string                                   // e.g. 'perm-might'
  name: string                                 // e.g. 'Might'
  description: string                          // e.g. 'Increases base damage by 5% per rank'
  maxRank: number                              // e.g. 5
  costs: number[]                              // cost per rank, length = maxRank
  effect: {
    field: string                              // stat field or multiplier name
    deltaPerRank: number                       // additive per rank (e.g. 0.05 for 5%)
    type: 'flat' | 'percent'                   // how it applies
  }
}

interface DifficultyModifier {
  id: string                                   // e.g. 'curse-hp'
  name: string                                 // e.g. 'Ironhide'
  description: string                          // e.g. 'Enemies have +30% HP'
  enemyHealthMult: number                      // e.g. 1.3
  enemySpeedMult: number                       // e.g. 1.0
  enemyDamageMult: number                      // e.g. 1.0
  spawnRateMult: number                        // e.g. 1.0
  currencyMultiplier: number                   // e.g. 1.25 — reward for the difficulty
}

interface MetaProgressionDef {
  currency: { name: string; conversionRate: string }
  permanentUpgrades: PermanentUpgradeDef[]     // core between-run power loop
  unlocks: MetaUnlock[]
  refundable: boolean                          // can player re-spec permanent upgrades (default true)
  difficultyModifiers: DifficultyModifier[]    // toggleable pre-run challenges (unlock after first clear)
  asceticBonus: { skipThreshold: number; currencyMultiplier: number }  // reward for skipping level-ups
}

interface MetaUnlock {
  type: 'character' | 'weapon' | 'bonus' | 'reroll_charge'
  name: string
  cost: number
  description: string
}

interface ShrineDef {
  type: 'gamble' | 'curse' | 'challenge' | 'reroll'
  name: string                            // themed (e.g. "Scavenger's Cache")
  description: string
}

interface UpgradeSequence {
  id: string                              // e.g. 'pistol', 'max-hp', 'orbital'
  items: UpgradeItem[]                    // ordered — player gets item 0 before item 1
}

interface UpgradeItem {
  label: string                           // shown in UI (e.g. 'Pistol +Damage')
  weight: number                          // selection weight (same or decreasing for later items)
  change: PlayerChange
}

type PlayerChange =
  | { type: 'add_weapon'; weapon: WeaponDef }
  | { type: 'modify_weapon'; weaponType: string; field: string; delta: number }
  | { type: 'add_orbital'; damage: number; radius: number; orbitRadius: number; speed: number }
  | { type: 'stat'; field: 'maxHealth' | 'speed' | 'magnetRadius' | 'damage' | 'luck'; delta: number }
  | { type: 'evolve'; inputs: [string, string]; result: WeaponDef }
```

## Weapon balancing philosophy

A weapon's base stats should be a *hint* of its identity, not the full fantasy. The upgrade path delivers the payoff — base form just needs to feel distinct and slightly underwhelming. Set base damage/cooldown/count so the weapon barely keeps up with Wave 1 alone. The "this weapon is strong" feeling should come from upgrades 3-4+, not from pickup.

Guidelines by weapon type:
- **High fire-rate** (gatling, spray): base cooldown slow, count=1. Rate ramps via upgrades.
- **High damage** (cannon, smite): base damage = 1-hit-kill on weakest enemy only. Overkill comes from upgrades.
- **AoE** (radial, explosion): base radius small, hits few. Coverage grows via upgrades.
- **Utility** (orbital, shield): base count=1, slow rotation. Density comes from upgrades.

### Range constraint

Projectile range = `projectileLifetime * projectileSpeed`. Range determines how tight the positional feedback loop is — half-screen range forces constant repositioning (tight loop), off-screen range enables passive play (broken loop). At typical camera height, the visible area is ~30 units wide.

Per archetype:
- **Targeted projectiles** (bullet, spray, thrown): level-1 range ≤12 units (~half-screen). Forces the player into the action.
- **Orbital/radial**: validate coverage area and orbit radius, not linear range.
- **Beam/lightning/smite**: may exceed 12 units if cadence is slow, target cap is low, or damage budget compensates.
- **Hard fail**: >15 units for any weapon at level 1.

Example failure: `lifetime=1.0, speed=14` → 14-unit range. Technically under 15 but plays like a sniper. Fix: `lifetime=0.6` → 8.4 units.

## Upgrade selection algorithm

Upgrades are organized as sequences (rows in a vending machine). Each sequence is an ordered track of increasingly powerful items. The player can only be offered the **front** of each sequence — the first item they haven't yet taken.

At level-up:
1. For each sequence, find the front (index = number of items already taken from this sequence)
2. Skip exhausted sequences (all items taken)
3. Skip banished sequences (player banished them this run)
4. If player has `maxWeapons` weapons, skip sequences whose front is `add_weapon`
5. Collect all fronts with their weights
6. Do `choicesPerLevel` weighted random selections **without replacement** from the fronts
7. Show those as the choices with weapon icon/mesh thumbnail next to each option
8. Player can: **pick one** → apply its `change`, advance that sequence's front; **reroll** → spend a reroll charge, go back to step 5 with new random draws; **skip** → dismiss without choosing; **banish** → permanently remove a sequence from this run's pool (limited by `banishSlots`)

```ts
function selectUpgradeChoices(
  sequences: UpgradeSequence[],
  taken: Map<string, number>,          // sequenceId → items taken so far
  count: number,
  rng: () => number,
): { sequenceId: string; item: UpgradeItem }[] {
  const fronts: { sequenceId: string; item: UpgradeItem; weight: number }[] = []
  for (const seq of sequences) {
    const idx = taken.get(seq.id) ?? 0
    if (idx < seq.items.length) {
      const item = seq.items[idx]
      fronts.push({ sequenceId: seq.id, item, weight: item.weight })
    }
  }

  const choices: { sequenceId: string; item: UpgradeItem }[] = []
  for (let i = 0; i < count && fronts.length > 0; i++) {
    const totalWeight = fronts.reduce((sum, f) => sum + f.weight, 0)
    let roll = rng() * totalWeight
    let picked = 0
    for (let j = 0; j < fronts.length; j++) {
      roll -= fronts[j].weight
      if (roll <= 0) { picked = j; break }
    }
    choices.push({ sequenceId: fronts[picked].sequenceId, item: fronts[picked].item })
    fronts.splice(picked, 1)
  }
  return choices
}
```

Applying a choice mutates player state via the `PlayerChange` discriminated union:

```ts
function applyChange(state: GameState, change: PlayerChange): void {
  switch (change.type) {
    case 'add_weapon':
      state.player.weapons.push(weaponFromDef(change.weapon))
      break
    case 'modify_weapon': {
      const w = state.player.weapons.find(w => w.type === change.weaponType)
      if (w) (w as any)[change.field] += change.delta
      break
    }
    case 'add_orbital':
      state.orbitals.push({ id: genId(), angle: state.orbitals.length * Math.PI / 2,
        damage: change.damage, radius: change.radius,
        orbitRadius: change.orbitRadius, speed: change.speed, hitCooldowns: new Map() })
      break
    case 'stat':
      ;(state.player as any)[change.field] += change.delta
      if (change.field === 'maxHealth') state.player.health += change.delta
      break
    case 'evolve':
      state.player.weapons = state.player.weapons.filter(
        w => w.type !== change.inputs[0] && w.type !== change.inputs[1]
      )
      state.player.weapons.push(weaponFromDef(change.result))
      break
  }
}
```

### Example sequences

```ts
const upgrades: UpgradeSequence[] = [
  { id: 'pistol', items: [
    { label: 'Add Pistol',      weight: 10, change: { type: 'add_weapon', weapon: pistolDef } },
    { label: 'Pistol +Damage',  weight: 8,  change: { type: 'modify_weapon', weaponType: 'pistol', field: 'damage', delta: 5 } },
    { label: 'Pistol +Pierce',  weight: 5,  change: { type: 'modify_weapon', weaponType: 'pistol', field: 'pierce', delta: 1 } },
    { label: 'Pistol +Speed',   weight: 3,  change: { type: 'modify_weapon', weaponType: 'pistol', field: 'cooldown', delta: -0.1 } },
  ]},
  { id: 'pulse', items: [
    { label: 'Add Pulse Wave',  weight: 8,  change: { type: 'add_weapon', weapon: pulseDef } },
    { label: 'Pulse +Damage',   weight: 6,  change: { type: 'modify_weapon', weaponType: 'pulse', field: 'damage', delta: 3 } },
    { label: 'Pulse +Count',    weight: 4,  change: { type: 'modify_weapon', weaponType: 'pulse', field: 'count', delta: 2 } },
  ]},
  { id: 'orbital', items: [
    { label: 'Add Orbital',     weight: 7,  change: { type: 'add_orbital', damage: 15, radius: 0.4, orbitRadius: 2, speed: 2 } },
    { label: 'Orbital +Damage', weight: 5,  change: { type: 'add_orbital', damage: 20, radius: 0.4, orbitRadius: 2.5, speed: 2 } },
  ]},
  { id: 'max-hp', items: [
    { label: 'Max HP +25',      weight: 6,  change: { type: 'stat', field: 'maxHealth', delta: 25 } },
    { label: 'Max HP +25',      weight: 6,  change: { type: 'stat', field: 'maxHealth', delta: 25 } },
    { label: 'Max HP +50',      weight: 4,  change: { type: 'stat', field: 'maxHealth', delta: 50 } },
  ]},
  { id: 'speed', items: [
    { label: 'Speed +0.5',      weight: 5,  change: { type: 'stat', field: 'speed', delta: 0.5 } },
    { label: 'Speed +0.5',      weight: 4,  change: { type: 'stat', field: 'speed', delta: 0.5 } },
  ]},
  { id: 'magnet', items: [
    { label: 'Magnet +1.5',     weight: 5,  change: { type: 'stat', field: 'magnetRadius', delta: 1.5 } },
    { label: 'Magnet +1.5',     weight: 3,  change: { type: 'stat', field: 'magnetRadius', delta: 1.5 } },
  ]},
]
```

## How Phase 2 consumes it

Systems import the spec and use it as config. The spec is never modified at runtime — it's static data.

```ts
// store.ts
import { spec } from './spec'

function createInitialState(): GameState {
  return {
    player: {
      health: spec.player.maxHealth,
      maxHealth: spec.player.maxHealth,
      speed: spec.player.speed,
      magnetRadius: spec.player.magnetRadius,
      weapons: [weaponFromDef(spec.player.startingWeapon)],
      // ...
    },
    run: { elapsed: 0, kills: 0, duration: spec.meta.runDuration },
    // ...
  }
}
```

Modules that import the spec:
- `store.ts` — initial player state, run duration, progression config (including maxWeapons, rerollCharges, banishSlots), character selection
- `systems.ts` — wave director reads `spec.waves` and `spec.bosses`, enemy spawner reads `spec.enemies` and `spec.elites`, upgrade selection reads `spec.progression.upgrades` with weapon cap/reroll/banish, pickup spawner reads `spec.pickups`, kill milestones reads `spec.killMilestones`
- `tuning.ts` — initializes elite multipliers, combat feel parameters, and cheats from spec defaults. Exposed as `window.__tuning` for live tweaking.
- `renderer.tsx` — reads `spec.palette` for mesh colors, `spec.screenTransition` for transition style, `spec.font` for font families
- `level.ts` — reads `spec.map` for chunk assembly, collision grid, destructible/shrine placement
- `audio.ts` — reads `spec.musicDirection` for track names/phases
- `meta.ts` — reads `spec.metaProgression` for permanent upgrades, unlock costs/conditions, difficulty modifiers, ascetic bonus

## Determinism

The spec includes a `seed` field. All randomness in the game derives from this seed via a seeded PRNG (e.g. a simple mulberry32). This makes runs reproducible for debugging and automated testing.

```ts
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const rng = mulberry32(spec.meta.seed)
// Use rng() instead of Math.random() everywhere
```

## Automated balance checks

In step 2.8 the agent implements a headless bot runner (no rendering, random-walk bot) and the balance checks below. This is not a pre-existing tool — the agent builds it as part of the tuning pass.

```ts
interface BalanceCheck {
  name: string
  test: (stats: RunStats) => boolean
}

const checks: BalanceCheck[] = [
  { name: 'not-too-hard-early', test: s => s.timeOfDeath > 30 || !s.died },
  { name: 'not-too-easy',       test: s => s.minHealthPercent < 0.8 },
  { name: 'xp-curve-sane',      test: s => s.levelAt120s >= 3 },
  { name: 'enemy-cap-ok',       test: s => s.peakEnemyCount < 300 },
  { name: 'fps-budget',         test: s => s.peakTickMs < 16 },
]
```

Run 10 simulated games with random-walk bot, check that >80% of runs pass all checks. If not, the agent adjusts tuning values in the spec and re-runs.

## Phase 1 output

When the LLM completes Phase 1, it produces two artifacts:
1. `games/<slug>/docs/<timestamp>_design.md` — prose design doc for human review
2. `games/<slug>/src/spec.ts` — typed GameSpec object, `export const spec: GameSpec = { ... }`

Both must be consistent. The spec is what the code actually reads. The design doc is for human context.
