# Vegetation Dressing

Procedural billboard vegetation using the star-pattern quad technique (3 intersecting quads at 60° intervals = 12 tris per clump). Used in SOP step 3.4 (Environmental dressing). The same `InstancedBufferGeometry` + custom shader pipeline handles all vegetation styles — what changes is the fragment shader silhouette, the animation behavior, and the per-zone config.

Reference demo: `tools/grass/` — standalone visual testbed with leva controls and 10 example shaders to switch between.

## Custom shaders

The grass system accepts custom vertex and fragment shaders per zone via `ZoneGrassConfig.vertexShader` and `ZoneGrassConfig.fragmentShader`. When omitted, it falls back to the default 4-blade grass shader. This lets each game create bespoke vegetation — wheat fields, crystal shards, mushroom forests, firefly swarms — whatever fits the world.

The fragment shader draws the silhouette procedurally from UVs using `discard`. Write a new fragment shader for each zone's vegetation to make it unique to the game. Don't limit yourself to the examples below — combine techniques, invent new shapes, match the game's atmosphere.

### Fragment shader contract

Your custom fragment shader receives these varyings and uniforms:

```glsl
// Varyings (from vertex shader)
varying vec2 vUv;         // 0–1 across each quad face
varying float vColorVar;  // 0–1 random per instance (use for color/height variation)

// Uniforms (always available)
uniform vec3 uBaseColor;
uniform vec3 uTipColor;
uniform float uBladeWidth;
uniform float uTime;      // accumulated time (for animation)
```

You can declare additional uniforms and pass them via `extraUniforms` on the config.

### Vertex shader contract

The default vertex shader handles wind via layered sine waves. Override it via `vertexShader` for different animation (floating, static, undulating). It must declare and use these instance attributes:

```glsl
attribute vec3 aOffset;    // world position
attribute float aRotation; // Y-axis rotation
attribute float aScale;    // scale multiplier
attribute float aColorVar; // 0–1 random seed
```

And these uniforms: `uTime`, `uWindSpeed`, `uWindStrength`, `uWindDirection` (vec2), `uBladeHeight`, `uBladeHeightVar`.

### Shader techniques

Key fragment shader techniques for vegetation silhouettes:

| Technique | How | Good for |
|-----------|-----|----------|
| **Tapered blades** | `halfWidth = (1.0 - y) * scale`, discard outside | Grass, reeds, thorns |
| **Seed heads / bulges** | `sin(headY * PI)` widens shape at top | Wheat, cattails |
| **Dome caps** | `sqrt(1 - (capY*2-1)^2)` semicircle discard | Mushrooms, toadstools |
| **Petal disc** | Polar coords: `cos(angle * N)` modulates radius | Flowers, dandelions |
| **Sawtooth edges** | `fract(y * toothCount)` modulates width | Ferns, palm fronds |
| **Sine-edge ribbon** | `sin(y * freq + time)` offsets discard boundary | Seaweed, kelp, tendrils |
| **Noise sphere** | `noise2d(uv * scale) > threshold` inside circle SDF | Dandelion puffs, spores |
| **Angular shards** | Hard asymmetric triangle boundaries, no taper curve | Crystals, ice, spikes |
| **Circle SDF glow** | `smoothstep(size, 0, length(uv - 0.5))` + additive blend | Fireflies, embers, sparks |

### Example shaders

10 working example shaders are in `tools/grass/src/shaders.ts` — browse them for reference or preview them live with `npm run dev grass`. They cover: classic grass, wheat, wildflowers, mushrooms, crystal spikes, fireflies, seaweed/kelp, ferns, thorns/spikes, dandelion puffs.

### Inspiration (not a menu)

These are starting points. A horror game might combine the thorn silhouette with pulsing red emissive. A fairy-tale might use the mushroom dome with iridescent HSV cycling. A sci-fi game might write an entirely new shader with hexagonal grid patterns. The system takes any valid GLSL fragment shader — be creative.

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
  density: number           // clumps per floor cell (e.g. 3-8)
  bladeHeight: number       // base height in world units (0.15-0.4 for gameplay)
  bladeHeightVar: number    // ±variation (0.05-0.15)
  bladeWidth: number        // fragment shader width (0.06-0.12)
  baseColorShift: number    // multiplier on ground color for blade base (0.8-0.95 = darken)
  tipColorShift: number     // multiplier for blade tip (1.1-1.3 = lighten)
  windStrength: number      // 0-1 displacement amplitude
  vertexShader?: string     // custom GLSL vertex shader (defaults to wind shader)
  fragmentShader?: string   // custom GLSL fragment shader (defaults to 4-blade grass)
  extraUniforms?: Record<string, { value: any }>  // additional uniforms for custom shaders
  materialConfig?: Partial<{ blending: number; depthWrite: boolean; transparent: boolean; alphaTest: number }>
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
