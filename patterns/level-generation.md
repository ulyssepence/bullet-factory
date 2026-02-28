# Level Generation

## CA-based level generation (DEFAULT — template/src/level/)

Level generation code lives in `template/src/level/` — the single source of truth. Games import it via relative path (e.g. `import * as level from '../../../template/src/level/generate'`). **Do not copy these files into game directories.**

### Modules

| Module | Purpose |
|--------|---------|
| `ca.ts` | Cellular automata core: `generateCA`, `generateCAPadded`, `postProcessCA`, `stampMotif`, `assembleArena` (v1). Constants (`FLOOR`, `WALL`, `HAZARD`), types (`ArenaConfig`, `ArenaResult`, `ZoneDef`, `BoundaryDef`), `DEMO_CONFIG` (default 4x4 zone grid), `mulberry32` PRNG. |
| `corridor.ts` | MST corridor network: `placeZoneLandmarks` (one per chunk), `buildMSTEdges` (Kruskal + extras), `carveCorridors` (A* + noisy circles), `stampVault` (blob vaults with polar noise), `connectOrphanCaves`. |
| `generate.ts` | Full arena assembly: `assembleArenaV2()` (main entry point — takes `ArenaConfig`, returns `ArenaResult` with grid + zoneMap + stats), `makeDebugArena()` (tiny 12x12 test arena). Re-exports `FLOOR`, `WALL`, `HAZARD`, `DEMO_CONFIG`, `ArenaConfig`, `ArenaResult` from ca.ts. |
| `marching.ts` | Marching squares contour extraction: `extractContours()`, `smoothContour()`. |
| `terrain-geo.ts` | Three.js geometry builders: `buildWallGeo()` (contour ribbon walls), `buildFloorGeo()` (vertex-colored ground plane), `buildWallFillGeo()` (per-zone wall cap fill). |
| `props.ts` | Prop scattering: `scatterProps()` (places props at wall-floor transitions). |
| `grass.ts` | Vegetation dressing: `build()` (instanced billboard vegetation per zone — grass, wheat, bushes, tendrils, crystals, mushrooms, reeds). Reads grid + zoneMap, derives colors from zone palettes. See `patterns/grass-vegetation.md`. |
| `index.ts` | Barrel re-export of all modules. |

### Usage

```ts
import { assembleArenaV2, DEMO_CONFIG } from '../../../template/src/level/generate'
import type { ArenaConfig } from '../../../template/src/level/ca'

const result = assembleArenaV2({ ...DEMO_CONFIG, seed: 42 })
// result.grid, result.zoneMap, result.worldSize, result.stats
```

`DEMO_CONFIG` is a 4x4 zone grid (3 zones, chunkSize=32, seed=42). Games override zones, boundaries, chunkSize, corridors, and seed.

### ZoneDef fields

| Field | Type | Description |
|-------|------|-------------|
| `density` | `number` | Wall fill probability (0.50–0.65 typical). Higher = more walls. |
| `motifs` | `string[][]` | ASCII art stamps placed at chunk centers (`#`=wall, `.`=floor). |
| `hue` | `number` | Zone color hue (0–360). Used by palette/rendering. |
| `smoothingPasses` | `number?` | Wall contour smoothing (default 2). 0 = angular/crystalline, 1 = slightly softened, 3+ = organic/blobby. Set per zone to vary feel — e.g. a cave zone at 3, a fortress zone at 0. |

---

## Chunk-based toroidal map (LEGACY — do not use for new games)

> **Use CA-based generation above for all new games.** The chunk-based approach below is retained as reference only. It requires hand-authoring 6-12 chunk templates at design time, which is error-prone and produces less variety than CA.

Chunk-based toroidal map with flow field enemy navigation. The LLM designs chunk templates at game creation time (Phase 1). The runtime assembles them into a fixed repeating grid, activates a ring around the player, and computes flow fields for enemy pathfinding.

## Overview

```
Design time (LLM):
  Design 6-12 chunk templates → 48-96 variants via rotation/mirror
  Place destructibles and shrines inside chunks
  Theme everything to match the game's aesthetic

Runtime:
  Assemble chunks into NxN toroidal grid (seeded, deterministic)
  Activate 5x5 ring around player (render, physics, flow field)
  Enemies: LOS → beeline, no LOS → flow field, off-ring → sleep
  Player wraps at grid edges (toroidal)
```

## Chunk templates

Each chunk is a square cell grid designed by the LLM during Phase 1. The LLM authors these as part of the design doc, themed to the game's setting and palette.

```ts
interface ChunkTemplate {
  id: string
  size: number                          // cells per side (e.g. 32)
  cells: CellType[][]                   // row-major, size×size
  destructibles: DestructiblePlacement[]
  shrines: ShrinePlacement[]
}

type CellType = 'floor' | 'wall'

interface DestructiblePlacement {
  cell: [number, number]                // row, col within chunk
  type: string                          // game-themed (e.g. 'rusted_car', 'barrel', 'crystal')
}

interface ShrinePlacement {
  cell: [number, number]
  type: ShrineType
}

type ShrineType = 'gamble' | 'curse' | 'challenge' | 'reroll'
```

### Design rules for chunks

- **All edges are open.** Walls and obstacles stay interior — never touch the border row/column. This means any chunk connects to any chunk with no compatibility checking.
- **Connectivity guaranteed.** Every floor cell must be reachable from every border cell. The LLM should verify this when designing chunks (flood fill from any border cell must reach all floor cells).
- **Obstacle density ~15-25%.** Enough to create interesting navigation without choking movement. Survivors-likes need open space for kiting.
- **1-2 destructibles per chunk, 0-1 shrines.** Not every chunk has a shrine. Shrines are rare — maybe 2-3 across the entire grid.

### Rotation and mirroring

Each template produces 8 variants: 4 rotations × 2 mirror states. The cell grid is rotated/mirrored, and destructible/shrine positions transform with it. This means 6-12 authored templates → 48-96 effective variants.

```ts
function rotateChunk(cells: CellType[][]): CellType[][] {
  const n = cells.length
  const out: CellType[][] = Array.from({ length: n }, () => new Array(n))
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      out[c][n - 1 - r] = cells[r][c]
  return out
}

function mirrorChunk(cells: CellType[][]): CellType[][] {
  return cells.map(row => [...row].reverse())
}
```

## Map assembly

The map is a fixed toroidal grid of chunks — e.g. 16×16 chunks = 512×512 cells at chunk size 32. At game start, each grid slot is assigned a chunk variant deterministically:

```ts
function assignChunk(gridX: number, gridY: number, seed: number, variants: ChunkTemplate[]): ChunkTemplate {
  const hash = hashCoords(gridX, gridY, seed)
  return variants[hash % variants.length]
}
```

The grid wraps: moving off the east edge puts the player on the west edge (modulus on world position). With 16×16 chunks at 32 cells each, the world is 512 units across — at speed 5, it takes ~100 seconds to traverse, so the player is unlikely to notice the wrap in a 10-minute run.

All chunk data is materialized at game start into one flat collision grid (`Uint8Array`, 0=floor, 1=wall) for the entire map. This is cheap — 512×512 = 262,144 bytes.

## Chunk activation ring

A 5×5 ring of chunks around the player is "active" (2 chunks in each direction). This is generous enough that chunks never pop in/out within the camera's view, even at steep angles.
- **Rendered**: graybox meshes (floor plane + wall boxes) are created/destroyed as chunks activate/deactivate
- **Flow field**: covers the active 5×5 area
- **Enemy spawning**: new enemies spawn at the perimeter of the active ring, on floor cells
- **Enemy sleep**: enemies beyond the active ring are not ticked (no movement, no collision). When a chunk deactivates, its enemies are despawned and their count is recycled into the spawn budget.

The collision grid is global (always available for pathfinding), but rendering and entity simulation are bounded to the active ring.

## Flow field navigation

One flow field covers the active chunks (~160×160 cells for size-32 chunks in a 5×5 ring). It stores a direction vector per cell pointing toward the player.

### Computation

BFS from the player's cell outward, respecting walls in the collision grid. Each visited cell stores the direction toward its lowest-cost (nearest-to-player) neighbor.

```ts
interface FlowField {
  width: number
  height: number
  originX: number                       // world-cell offset of the flow field's top-left
  originY: number
  dirs: Int8Array                       // 2 bytes per cell: dx (-1/0/1), dz (-1/0/1)
}

function computeFlowField(grid: Uint8Array, gridWidth: number, playerCell: [number, number], field: FlowField): void {
  // BFS from playerCell, write direction to each reachable cell
  // Use pre-allocated typed arrays and queue — no allocations per recompute
}
```

### When to recompute

Recompute when the player moves ≥3 cells from the last computation origin. This balances accuracy with cost. A 96×96 BFS takes <1ms with typed arrays.

### Toroidal wrapping in flow field

The flow field covers a 3×3 chunk window. At grid edges, the window wraps. The BFS must handle wrapping — when checking neighbors of a cell at the east boundary, the neighbor is on the west side of the grid. Use modulus on cell coordinates.

## Enemy navigation

Priority system, cheapest first:

1. **Bresenham LOS check** — walk the cell grid from enemy to player. If no wall cells are hit, the enemy beelines directly toward the player. This is a grid walk, not a Three.js raycast. Cost: O(cells between enemy and player), typically 10-30 cells.

2. **Flow field lookup** — if LOS is blocked, read the direction for the enemy's current cell from the flow field. One array lookup. The enemy moves in that direction.

3. **Off-screen skip** — enemies outside the active 5×5 ring skip LOS checks entirely and use flow field only (or sleep if beyond the flow field).

```ts
function hasLOS(grid: Uint8Array, gridWidth: number, x0: number, y0: number, x1: number, y1: number): boolean {
  // Bresenham line from (x0,y0) to (x1,y1)
  // Return false if any cell along the line is a wall
}
```

LOS checks are skipped for enemies beyond a distance threshold (e.g. 30 cells). Those enemies just use the flow field.

## Enemy collision avoidance

Enemies must not stack on top of each other. Without avoidance, all enemies converge to a single point on the player.

Use simple separation steering (not full RVO — too expensive for 200+ enemies):

```ts
// Per enemy per frame: check nearby enemies, push apart
for (const other of nearbyEnemies) {
  const dx = enemy.x - other.x
  const dz = enemy.z - other.z
  const dist = Math.sqrt(dx * dx + dz * dz)
  const minDist = enemy.radius + other.radius
  if (dist < minDist && dist > 0.001) {
    const overlap = minDist - dist
    const pushX = (dx / dist) * overlap * 0.5
    const pushZ = (dz / dist) * overlap * 0.5
    enemy.x += pushX
    enemy.z += pushZ
  }
}
```

Use a spatial hash (cell size = largest enemy diameter × 2) to find neighbors efficiently. Only check the 9 cells around each enemy. Run separation every frame — it's cheap with a spatial hash (O(n) amortized). This is the same data structure used for projectile-enemy collision, so share it.

## Destructibles

Breakable objects placed in chunks by the LLM. Themed to match the game — a post-apocalyptic game uses rusted cars and abandoned vending machines; a fantasy game uses barrels and crystal formations.

Destructibles have health and drop loot when destroyed. Player weapons damage them like enemies.

```ts
interface DestructibleState {
  id: EntityId
  position: Vec3
  health: number
  maxHealth: number
  size: number
  lootTable: LootDrop[]
}

interface LootDrop {
  type: 'health' | 'xp' | 'magnet' | 'nuke' | 'shield' | 'speed_boost'
  chance: number                        // 0-1
  value: number                         // amount healed, XP given, duration in seconds, etc.
}
```

Common loot types (LLM picks thematic names, these are the mechanical types):
- **health** — restore HP (floor chicken equivalent)
- **xp** — bonus XP gem
- **magnet** — pull all pickups to player for 3s
- **nuke** — damage all on-screen enemies
- **shield** — brief invulnerability (3-5s)
- **speed_boost** — movement speed buff (5-10s)

Destructible placement: 1-2 per chunk. The LLM places them in the chunk template at design time. They respawn when the chunk deactivates and reactivates (since chunk state resets on deactivation).

## Shrines

Rare interactable objects placed in chunks. When the player walks into a shrine's activation radius, the game pauses and shows a choice modal (same UI pattern as level-up).

Shrine types:

- **Gamble** — spend a resource (gold, XP, HP) for a random reward. Outcomes weighted: 40% good, 30% neutral, 30% bad. Risk of Rain 2's Shrine of Chance.
- **Curse** — accept a permanent debuff for a permanent buff. "Take -15% max HP, gain +25% damage." The player sees both sides before choosing accept/decline.
- **Challenge** — triggers a timed enemy wave. Survive 15-20 seconds of intense spawning for a powerful reward (rare weapon upgrade, large XP, permanent stat boost). Risk of Rain 2's Shrine of Combat.
- **Reroll** — swap one equipped weapon for a random one, or reroll the next level-up choices. Useful when the build isn't working.

```ts
interface ShrineState {
  id: EntityId
  position: Vec3
  type: ShrineType
  used: boolean                         // one-time use per run
  activationRadius: number              // typically 1.5 units
}
```

Shrines are one-use per run. The LLM themes them: a post-apocalyptic game has "Scavenger's Cache" (gamble), "Toxic Pool" (curse), "Emergency Broadcast" (challenge); a fantasy game has "Altar of Fortune", "Demon's Bargain", "Arena Gate".

Shrine placement: 0-1 per chunk, rare. Across the full grid, aim for 3-5 shrines total.

## Organic terrain rendering

The raw collision grid looks tile-y. To make it read as natural terrain, apply transformation layers between grid data and visuals. Full details, terrain archetypes, and tiered approach in `docs/2026-02-26_00-59-53_Organic terrain from grid data in VS-likes.md`. Summary: every game gets ground noise + prop scatter (Tier 1). Natural/mixed archetypes add marching-squares contour walls (Tier 2). Exploration-heavy games replace ASCII templates with CA generation (Tier 3).

## Rendering (graybox)

Active chunks render as:
- **Floor**: one plane mesh per chunk, colored per palette
- **Walls**: instanced box meshes per chunk (one InstancedMesh per active chunk, rebuilt on activation)
- **Destructibles**: individual box/sphere meshes, slightly different color from walls
- **Shrines**: distinct colored mesh (e.g. glowing pillar) so the player notices them

When a chunk activates, build its InstancedMesh for walls and spawn entity meshes for destructibles/shrines. When it deactivates, dispose the meshes.

## Integration with spawn system

Enemy spawn positions must land on floor cells within the active ring perimeter. The spawn system (see `patterns/spawn-waves.md`) picks a random position at the ring edge, then checks the collision grid — if the cell is a wall, it tries adjacent cells. After 5 failed attempts, pick a random floor cell on the ring border.

## Phase 1 checklist (for the LLM)

When designing a game, the LLM must produce as part of the design doc:
1. Chunk size (recommend 32×32)
2. Grid dimensions (recommend 16×16 chunks)
3. 6-12 chunk templates as ASCII grids (`.` = floor, `#` = wall, `D` = destructible, `S` = shrine)
4. Destructible types with themed names and loot tables
5. Shrine types with themed names and effect descriptions
6. Verify each chunk: all-open edges, flood-fill connectivity from borders
