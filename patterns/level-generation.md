# Level Generation

## CA-based level generation (template/src/level/)

Level generation code lives in `template/src/level/` — the single source of truth. Games import it via relative path (e.g. `import * as level from '../../../template/src/level/generate'`). **Do not copy these files into game directories.**

### Modules

| Module | Purpose |
|--------|---------|
| `ca.ts` | Cellular automata core: `generateCA`, `generateCAPadded`, `postProcessCA`, `stampMotif`, `assembleArena` (v1). Constants (`FLOOR`, `WALL`, `HAZARD`, `GATE`), types (`ArenaConfig`, `ArenaResult`, `ZoneDef`, `BoundaryDef`, `Gate`, `GateCondition`, `DestructibleBarrier`), `DEMO_CONFIG`, `mulberry32` PRNG. |
| `corridor.ts` | MST corridor network: `placeZoneLandmarks` (one per chunk), `buildMSTEdges` (Kruskal + extras), `carveCorridors` (A* + noisy circles), `stampVault` (blob vaults with polar noise), `connectOrphanCaves`. |
| `generate.ts` | Full arena assembly: `assembleArenaV2()` (main entry point), `makeDebugArena()`, `generateHeightmap()`, `buildSpeedGrid()`, `findLandmarkPosition()`, `carveLandmarkClearing()`, `sampleHeight()`. |
| `marching.ts` | Marching squares contour extraction: `extractContours()`, `smoothContour()`. |
| `terrain-geo.ts` | Three.js geometry: `buildWallGeo()`, `buildFloorGeo()` (supports optional `heightmap`), `buildWallFillGeo()`, `buildWallFillGeoMerged()`, `buildWallRoofGeo()`, `buildWallCapGeo()`, debug overlays (`buildSpeedOverlayGeo()`, `buildHeightmapOverlayGeo()`). |
| `props.ts` | Prop scattering at wall-floor transitions. |
| `grass.ts` | Instanced billboard vegetation per zone. See `patterns/grass-vegetation.md`. |
| `gate.ts` | Gate/barrier system: `createGate()`, `checkGate()`, `openGate()`, `createDestructibleBarrier()`, `damageBarrier()`, `destroyBarrier()`. |
| `zones.ts` | Zone queries: `getZoneAtCell()`, `getEnemyPool()`, `getSpeedAt()` (bilinear interpolation). |
| `index.ts` | Barrel re-export of all modules. |

### Usage

```ts
import { assembleArenaV2, DEMO_CONFIG } from '../../../template/src/level/generate'
import type { ArenaConfig } from '../../../template/src/level/ca'

const result = assembleArenaV2({ ...DEMO_CONFIG, seed: 42 })
// result.grid, result.zoneMap, result.worldSize, result.stats
// result.heightmap, result.speedGrid, result.gates, result.barriers, result.landmark
```

---

## Design Pipeline

Level design is **graph-first**. The SOP agent fills in these steps:

1. **Arena graph** — 5-7 nodes (zones), edges with boundary types, at least one loop, gate constraints
2. **Zone map** — 8x8 ASCII grid mapping zone IDs to chunks. Adjacency must match graph topology
3. **Zone tactical identities** — each zone gets a combat personality
4. **Boundaries** — how zones connect/separate
5. **Landmark** — a hero set-piece near spawn
6. **Micro-cycles** — 2-3 per arena
7. **Per-zone enemy pools** — soft power gating via enemy composition

### Zone Map

An 8x8 grid of zone IDs (0-indexed). Each cell = one chunk. Adjacency on the grid must match edges in the arena graph.

```
0 0 1 1 2 2 2 2
0 0 1 1 2 2 2 2
0 0 1 1 3 3 2 2
0 0 1 1 3 3 2 2
4 4 4 4 3 3 3 3
4 4 4 4 3 3 3 3
4 4 4 4 4 4 4 4
4 4 4 4 4 4 4 4
```

### Zone Tactical Identities

| Identity | Obstacle density | Combat feel |
|----------|-----------------|-------------|
| `inner` | 20-30% | Tight corridors, chokepoints, kiting paths |
| `open` | 8-15% | Wide arenas, swarm combat, nowhere to hide |
| `dense` | 15-25% | Heavy cover, ambush terrain, slow traversal |
| `hazard` | 10-20% | Hazard cells mixed in, environmental damage risk |

Set via `ZoneDef.tacticalIdentity`. The density multiplier adjusts the zone's base `density` value.

### Landmark

A 2-4 chunk set-piece placed in a prominent zone. Always rendered. Y >= 3 (tall mesh). Near spawn. Contains vault.

- `findLandmarkPosition()` picks the largest floor region centroid in the preferred zone
- `carveLandmarkClearing()` carves a circular clearing (radius ~10) for the landmark mesh

### Boundary Types

| Type | Effect | Gameplay role |
|------|--------|---------------|
| `dense` | Re-generates border chunk at 1.5x density | Visual/tactical separation, maze-like |
| `river` | HAZARD strip with ford gaps (1/8 chance) | Directional constraint, funneling |
| `hazard` | Solid HAZARD cell strip | Hard environmental barrier |
| `elevation` | Heightmap difference at boundary | Visual separation, speed modifier |
| `path` | 2-cell floor strip with flanking walls | Controlled corridor through dense border |
| `destructible` | GATE cells along boundary, breakable | Player-triggered zone access |

### Gate Types

| Type | Condition | Implementation |
|------|-----------|----------------|
| Soft power | Enemy pool difficulty | NO gate code — handled via `ZoneDef.enemyPool` |
| Timer | `{ type: 'timer', seconds: N }` | `checkGate()` evaluates against elapsed time |
| Kills | `{ type: 'kills', count: N }` | `checkGate()` evaluates against kill count |
| Boss | `{ type: 'boss', bossType: 'name' }` | `checkGate()` checks bossesKilled list |

Soft power gates require no code — they work through enemy composition. Zone 0 has easy enemies, zone 2 has hard ones. The player can enter zone 2 at any time but will struggle until powered up.

### Terrain Archetypes

| Archetype | smoothingPasses | Wall style | Ground | Props |
|-----------|----------------|------------|--------|-------|
| natural | 2-3 | Organic contours | Perlin noise + grass | Rocks, plants |
| structured | 0-1 | Angular, blocky | Clean with accent tiles | Pillars, crates |
| mixed | 1-2 | Zone-dependent | Zone-dependent | Mixed |
| open | 0 | Minimal | Wide + flat | Sparse |

### Performance: Smoothing

Chaikin subdivision doubles contour points per pass. Combined with GrayboxMaterial fragment cost, each additional smoothing pass has non-trivial cost. Default: 1 pass. Use 2+ only for organic natural zones. 0 for structured/angular.

---

## Anti-patterns

- **No Voronoi.** CA + marching squares gives better results with less complexity.
- **No PhantomGrammar.** Graph-first design with simple CA generation is sufficient.
- **No over-smoothing.** More than 3 Chaikin passes on contours kills FPS for minimal visual gain.

---

## Micro-cycles

Small gameplay loops within the arena that reward exploration:

| Type | Trigger | Reward | Visual cue |
|------|---------|--------|------------|
| Timed chest | Timer expires | Weapons/items | Glowing container |
| Kill-threshold shrine | Kill count reached | Stat boost | Pulsing shrine |
| Terrain change | Zone transition | New enemy types | Color/height shift |
| NPC/vendor | Proximity | Shop/dialogue | Distinct mesh |
| Challenge arena | Enter zone | Survival reward | Enclosed space |

2-3 per arena. Each tied to a specific zone.

---

## Per-zone Enemy Spawning

Each zone defines an `enemyPool: string[]` in its `ZoneDef`. When spawning:

1. Pick spawn position at ring edge (existing logic)
2. Look up zone at position via `getZoneAtCell()`
3. Filter enemy types to zone's pool (if defined)
4. If pool excludes the requested type, substitute from pool

This creates soft power gating — early zones have weak enemies, late zones have strong ones.

---

## Post-processing

`postProcessCA` validates each chunk:
- Floor ratio must be 0.60-0.90 (density 10-40%)
- Border cells cleared for inter-chunk connectivity
- Up to 3 retry attempts before accepting

Global flood fill keeps only the largest connected FLOOR component. Connectivity ratio > 95% = connected.

---

## Heightmap Terrain

Optional per-zone elevation. Enabled when any `ZoneDef.height > 0`.

- `generateHeightmap()` — reads `zone.height` values, blends boundaries (radius 6), adds noise
- Returns `Float32Array` per cell
- `buildFloorGeo()` accepts optional `heightmap` parameter for Y positions
- Backward compatible — absent heightmap = flat (Y=0)
- `sampleHeight(heightmap, worldSize, wx, wz)` — bilinear interpolation for placing objects at correct Y

### Speed Modifier Grid

`buildSpeedGrid()` generates a `Float32Array` where each cell = `1.0 - 0.3 * (h/maxH)`.

- Applied per-entity per-tick via `getSpeedAt()` (bilinear interpolation)
- Higher terrain = slower movement
- Navigation uses weighted Dijkstra with cost = `1 + (1 - speedGrid[n]) * 3`

### Wall Fill Merge

`buildWallFillGeoMerged(grid, zoneMap, worldSize, height, zoneCount, opts?)` — calls `buildWallFillGeo` per zone and concatenates into one geometry. Pass per-zone colors via `opts.colors`.

### Debug Overlays

For dev-mode visualization of heightmap and speed grids:

- `buildSpeedOverlayGeo(speedGrid, grid, heightmap, worldSize)` — colored flat planes per cell: blue = fast, red = slow
- `buildHeightmapOverlayGeo(heightmap, grid, worldSize)` — grayscale planes showing height values

Use with `vertexColors: true` material, rendered slightly above the floor.

---

## CA Pipeline

1. `generateCAPadded()` — CA generation with 2-cell padding (cropped after)
2. `postProcessCA()` — density validation + border clearing
3. `assembleArenaV2()` — chunk assembly, boundary overlays, flood fill, corridor pipeline, zone warping
4. `extractContours()` → `smoothContour()` — marching squares contour extraction
5. `buildWallGeo()` / `buildFloorGeo()` / `buildWallFillGeo()` / `buildWallFillGeoMerged()` — Three.js geometry
6. `scatterProps()` / `build()` (grass) — environmental dressing

---

## Worked Example: "Ruined Castle" (3 zones)

### Arena Graph
```
Nodes:
  node 0: id=courtyard  tacticalIdentity=open
  node 1: id=dungeons    tacticalIdentity=inner
  node 2: id=ramparts    tacticalIdentity=dense
Edges:
  edge: from=0 to=1  boundary=path
  edge: from=0 to=2  boundary=dense
  edge: from=1 to=2  boundary=hazard
Loop path: courtyard -> dungeons -> ramparts -> courtyard
Gate edge: from=0 to=1 condition=timer:60s
```

### Zone Map (4x4)
```
0 0 1 1
0 0 1 1
2 2 0 0
2 2 0 0
```

### Landmark
```
name=Fallen Tower  zone=0  meshPrompt="crumbling stone tower, broken top, medieval ruins"
vaultContents="rare weapon upgrade"
```

### Micro-cycles
```
cycle 1: type=timed-chest  zone=1  trigger=90s  reward=weapon  visualCue=glowing iron chest
cycle 2: type=kill-shrine  zone=2  trigger=kills:150  reward=+10% damage  visualCue=pulsing gargoyle
```

### Per-zone Enemy Pools
```
zone 0 (courtyard): [skeleton, rat]
zone 1 (dungeons): [skeleton, ghost, mimic]
zone 2 (ramparts): [archer, knight, ghost]
```

### ZoneDefs
```ts
const zones: ZoneDef[] = [
  { density: 0.50, hue: 40, motifs: [MOTIF_CLEARING], tacticalIdentity: 'open', enemyPool: ['skeleton', 'rat'], height: 0 },
  { density: 0.60, hue: 260, motifs: [MOTIF_CHOKEPOINT], tacticalIdentity: 'inner', enemyPool: ['skeleton', 'ghost', 'mimic'], height: -0.5 },
  { density: 0.58, hue: 120, motifs: [MOTIF_COVER], tacticalIdentity: 'dense', enemyPool: ['archer', 'knight', 'ghost'], height: 1.5 },
]
```

---

## Validation

Run `scripts/validate-arena.ts` on any `ArenaResult`:

1. **Connectivity** — flood-fill from spawn reaches >95% of FLOOR cells
2. **Graph-map consistency** — every boundary edge has spatial adjacency in zone map
3. **Unintended adjacencies** — zones adjacent on map but not declared in boundaries
4. **Loop traversal** — BFS each leg of `loopPath` when provided
5. **Gate edge warning** — warns if no gates declared (soft power gates have no code representation)
6. **Navigable width** — eroded map still connected (no single-cell chokepoints)
7. **Gate achievability** — timer < 10min, kill count < 5000, boss in spawn pool
8. **Traverse time** — diagonal walk < 120s at base speed

Failure policy (degrade gracefully):
1. Reduce micro-cycle count
2. Simplify boundaries (elevation -> hazard, destructible -> dense)
3. Remove gate
4. Reduce zone count
5. Fall back to single-zone bounded arena
