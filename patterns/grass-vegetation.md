# Vegetation Dressing

Procedural billboard vegetation using the star-pattern quad technique (3 intersecting quads at 60° intervals = 12 tris per clump). Used in SOP step 3.4 (Environmental dressing). The same `InstancedBufferGeometry` + custom shader pipeline handles all vegetation styles — what changes is the fragment shader silhouette, the animation behavior, and the per-zone config.

Reference demo: `games/tool-grass/` — standalone visual testbed with leva controls.

## Vegetation styles

The fragment shader draws the silhouette procedurally from UVs. Each style below changes the shape, animation, and defaults. All use the same star-pattern base geometry and instancing pipeline.

### `grass` — short blades, gentle wind sway
Default choice for natural terrain. 4 thin tapered triangles per quad face, narrow at tip, wide at base. Sways with layered sine wind. Height 0.15–0.4. Reads as textured ground.

### `wheat` — tall stalks with seed heads
Taller than grass (0.4–0.8). Fragment shader draws 2–3 narrow stalks per quad face with a wider bulge near the tip (the seed head — achieved by widening the taper function above y > 0.7). Slower, heavier wind sway (lower frequency sines, higher amplitude). Golden/amber color shift works well: `baseColorShift: 0.9`, `tipColorShift: 1.4`. Good for plains, farmland, post-apocalyptic overgrowth.

### `bushes` — dense rounded clumps
Short and wide (height 0.2–0.4, bladeWidth 0.15–0.25). Fragment shader draws 2 fat rounded shapes per quad face (smooth edges via smoothstep rather than hard taper). Minimal wind — stiff, just a subtle wobble (`windStrength: 0.05–0.1`). Higher density per cell (4–8) but fewer cells get them (scatter with noise threshold). Darker color shift (`baseColorShift: 0.7`, `tipColorShift: 0.95`) — bushes are darker than ground, not lighter. Good for forests, hedgerows, alien terrain.

### `tendrils` — thin curling vines
Very narrow (bladeWidth 0.03–0.05), medium height (0.3–0.6). Fragment shader draws 1–2 ultra-thin lines per quad face. Wind animation uses `sin(uv.y * 3.0 + time)` for a coiling/writhing motion instead of the standard linear bend — the whole stalk undulates. Low density (1–2 per cell). Tip color can shift toward a contrasting hue (e.g. purple tips on green base) for alien/corruption zones. Good for swamps, corruption biomes, alien worlds, caves.

### `crystals` — rigid geometric shards
No wind animation at all (`windStrength: 0`). Fragment shader draws 1–2 hard-edged triangular shapes per quad face with flat tops (discard above a hard cutoff, no taper curve). Height 0.15–0.35. Add a slight emissive boost in the fragment shader (`gl_FragColor.rgb += tipColor * 0.15`) for a faint glow. `tipColorShift: 1.5–2.0` for bright tips. Very sparse (density 0.5–1). Good for caves, magical zones, sci-fi terrain.

### `mushrooms` — short bulbous caps on thin stems
Height 0.1–0.25. Fragment shader draws a thin vertical line (stem, y < 0.6) topped by a wider dome shape (cap, y > 0.6 — semicircle via `1.0 - (localX*localX + (y-0.8)*(y-0.8))` distance field). No wind on the stem, very slight cap wobble. Sparse (density 1–2), placed with noise clustering so they appear in groups of 3–5 with gaps between. Base color darker than ground, cap color can be shifted toward red/orange/purple. Good for forests, caves, fairy-tale, fungal biomes.

### `reeds` — tall thin verticals near water/hazard edges
Similar to wheat but thinner, no seed head. Height 0.5–1.0, bladeWidth 0.03. Fragment shader draws 2–3 perfectly straight thin lines. Placement rule: only spawn within 2–3 cells of HAZARD cells (water edges). Gentle uniform sway. Color: base = ground color, tips slightly lighter. Good for swamps, rivers, lakesides.

### Choosing a style

The style is selected in the SOP dressing choices block. Games can mix styles across zones — e.g. zone 0 gets `grass`, zone 1 gets `mushrooms`, zone 2 gets `crystals`. The fragment shader variant is selected per-zone via a `style` field on `ZoneGrassConfig`.

## Architecture

Grass is a rendering-only layer. No collision, no gameplay logic. It reads the level grid and zone data at generation time, produces `InstancedBufferGeometry` meshes, and animates wind in the vertex shader.

Source: `template/src/level/grass.ts` (lives alongside `terrain-geo.ts`).

### Integration point

```ts
import * as grass from '../../../template/src/level/grass'

// After level generation:
const result = assembleArenaV2(config)
const grassMeshes = grass.build({
  grid: result.grid,
  zoneMap: result.zoneMap,
  worldSize: result.worldSize,
  zonePalettes,       // same THREE.Color[] passed to buildFloorGeo
  zoneGrassConfigs,   // per-zone grass params (or null to skip zone)
  seed: config.seed,
})
// grassMeshes is THREE.Group containing one InstancedMesh per zone
```

### Per-zone grass config

Each zone can define grass parameters or opt out entirely. Zones representing walls, hazards, or built environments skip grass. The config derives colors from the zone's ground palette.

```ts
type ZoneGrassConfig = {
  density: number       // clumps per floor cell (e.g. 3-8)
  bladeHeight: number   // base height in world units (0.15-0.4 for gameplay)
  bladeHeightVar: number // ±variation (0.05-0.15)
  bladeWidth: number    // fragment shader width (0.06-0.12)
  baseColorShift: number // multiplier on ground color for blade base (0.8-0.95 = darken)
  tipColorShift: number  // multiplier for blade tip (1.1-1.3 = lighten)
  windStrength: number   // 0-1 displacement amplitude
}
```

Example zone configs by terrain feel:
| Terrain | density | bladeHeight | bladeWidth | wind |
|---------|---------|-------------|------------|------|
| Meadow/grass | 6 | 0.25 | 0.08 | 0.3 |
| Forest floor | 3 | 0.15 | 0.06 | 0.1 |
| Desert/sparse | 1 | 0.12 | 0.05 | 0.5 |
| Stone/built | null (skip) | — | — | — |

## Rendering approach

### Geometry

Three intersecting `PlaneGeometry` quads rotated 0°, 60°, 120° around Y, merged into one `BufferGeometry` (12 tris). Used as the base for `InstancedBufferGeometry`.

Per-instance attributes:
- `aOffset` (vec3): world position on the floor
- `aRotation` (float): random Y rotation per clump
- `aScale` (float): random scale multiplier
- `aColorVar` (float): 0-1 random seed for per-instance color variation

### Placement rules

1. Only place on FLOOR cells (skip WALL, HAZARD)
2. Sub-cell jitter: scatter N clumps randomly within each floor cell
3. Density varies by zone (read from `zoneGrassConfigs`)
4. Optional: value noise modulation for natural clumping within a zone

### Shaders

**Vertex shader**: pins base vertices (uv.y ≈ 0), displaces tip vertices (uv.y ≈ 1) using layered sine waves keyed to world position + time uniform. Uses `uv.y²` for natural bend profile. Wind direction and speed are uniforms.

**Fragment shader**: procedural blade silhouette from UVs — 4 thin tapered triangles side-by-side per quad. Discards fragments outside blade shapes. Color gradient from dark base to bright tip, derived from zone palette.

### Material settings

- `side: THREE.DoubleSide` (backface culling off for billboards)
- `alphaTest: 0.5` (not transparent — correct depth writes, no sorting)
- `depthWrite: true`

Use `alphaTest` in games, not `transparent`. The demo uses transparency for soft edges, but in gameplay with particles/projectiles, depth correctness matters more.

## Color derivation

Grass colors are **derived from the zone ground palette**, not specified independently. This guarantees visual consistency with the ground material.

```
baseColor = zonePalette[zone] * config.baseColorShift  // darker than ground
tipColor  = zonePalette[zone] * config.tipColorShift    // lighter than ground
```

Per-instance `aColorVar` adds slight random tint variation so the field isn't monotone.

The grass should read as "textured ground" — visible but not competing with player, enemies, or projectiles for visual attention.

## Performance

- One draw call per zone (single `InstancedMesh` per zone with grass)
- Target: <2ms total for all grass (part of the 2ms dressing budget in SOP)
- Instance buffers built once at level generation time
- Wind is a time uniform update per frame (no buffer rebuilds)
- Frustum culling per-mesh handles off-screen zones automatically
- No per-frame LOD. If perf is a problem, reduce density — don't add LOD machinery

### Triangle budget

At 12 tris per clump:
- 20K clumps = 240K tris (light)
- 50K clumps = 600K tris (moderate)
- 100K+ clumps = budget risk, reduce density per zone

For a typical 4-zone arena (~128x128 cells), 3-6 clumps per floor cell ≈ 30-60K total clumps across all zones. Well within budget.

## What NOT to do

- Don't give grass its own hardcoded colors. Always derive from zone palette.
- Don't add per-frame LOD distance checks. Frustum culling is enough.
- Don't place grass on wall cells. Filter at generation time.
- Don't use `transparent: true` in games. Use `alphaTest`.
- Don't make grass tall enough to obscure ground-level gameplay. Keep height 0.15-0.4.
