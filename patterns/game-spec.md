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

  weapons: WeaponDef[]                    // full pool (player discovers via level-up)

  waves: WaveDef[]

  destructibles: DestructibleDef[]

  shrines: ShrineDef[]

  progression: {
    xpToNextBase: number                  // XP for level 2
    xpScaling: number                     // multiplier per level (e.g. 1.4)
    upgrades: UpgradeSequence[]           // vending machine rows
    choicesPerLevel: number               // how many choices to offer (typically 3)
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
  | { type: 'stat'; field: 'maxHealth' | 'speed' | 'magnetRadius'; delta: number }
```

## Upgrade selection algorithm

Upgrades are organized as sequences (rows in a vending machine). Each sequence is an ordered track of increasingly powerful items. The player can only be offered the **front** of each sequence — the first item they haven't yet taken.

At level-up:
1. For each sequence, find the front (index = number of items already taken from this sequence)
2. Skip exhausted sequences (all items taken)
3. Collect all fronts with their weights
4. Do `choicesPerLevel` weighted random selections **without replacement** from the fronts
5. Show those as the choices. Player picks one → apply its `change`, advance that sequence's front

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
- `store.ts` — initial player state, run duration, progression config
- `systems.ts` — wave director reads `spec.waves`, enemy spawner reads `spec.enemies`, upgrade selection reads `spec.progression.upgrades`
- `renderer.tsx` — reads `spec.palette` for mesh colors
- `level.ts` — reads `spec.map` for chunk assembly, collision grid, destructible/shrine placement

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
