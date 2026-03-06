# Graybox Materials

Use `<GrayboxMaterial>` instead of `<meshStandardMaterial>` on all meshes. It adds noise-based surface detail, triplanar mapping (no UVs needed), and PBR modulation — all from two props.

## Usage

```tsx
import { GrayboxMaterial } from './graybox-material'

<mesh>
  <boxGeometry args={[1, 1, 1]} />
  <GrayboxMaterial color="#8b7d6b" style="rough" />
</mesh>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `color` | `string` | required | Base surface color (hex) |
| `style` | `SurfaceStyle` | required | Noise profile and PBR preset |
| `scale` | `number` | `1.0` | Texture scale — higher = finer detail |
| `bumpStrength` | `number` | per-style | Bump intensity (0 = flat, 1 = full) |
| `noiseTex` | `THREE.Texture` | `undefined` | Baked noise texture — replaces per-fragment noise with texture fetch. See Performance section. |
| `vertexColors` | `boolean` | `false` | Use vertex colors as base color instead of `color` prop. For merged multi-zone meshes. |

## Styles

### Core

| Style | Use for | Character |
|-------|---------|-----------|
| `rough` | Concrete, stone, walls | High-freq fBm bump, matte (roughness 0.85) |
| `smooth` | Player, pickups, UI elements | Minimal noise, reflective (roughness 0.2) |
| `organic` | Terrain, flesh, living things | Domain-warped fBm, medium roughness |
| `crystalline` | Crystals, gems, XP | Voronoi cell edges, slight metalness |
| `metallic` | Weapons, armor, machines | Brushed anisotropic noise, metalness 0.4 |
| `worn` | Aged surfaces, ruins | Layered noise + scratches, mixed roughness |

### Natural

| Style | Use for | Character |
|-------|---------|-----------|
| `wood` | Furniture, structures | sin(x + noise) grain lines |
| `plank` | Floors, crates, docks | Wood grain + board gap divisions |
| `bark` | Trees, logs | Vertically stretched ridges |
| `grass` | Lawns, fields, meadows | Gentle low-frequency variation |
| `dirt` | Paths, farmland | Clumpy medium noise, high roughness |
| `sand` | Desert, beach, dunes | Fine high-freq grain, very matte |
| `moss` | Overgrown surfaces | Patchy threshold noise, organic feel |

### Stone & mineral

| Style | Use for | Character |
|-------|---------|-----------|
| `marble` | Pillars, floors, altars | sin veins warped by turbulence, glossy |
| `cobblestone` | Paths, roads, old floors | Voronoi cells = individual stones |
| `slate` | Roofs, layered rock | Horizontal layers with edge flaking |
| `gravel` | Loose ground, rubble | Coarse quantized noise chunks |
| `ice` | Frozen surfaces, glaciers | Smooth with internal voronoi cracks |
| `obsidian` | Dark glossy stone, portals | Very smooth, glassy, subtle swirls |

### Built

| Style | Use for | Character |
|-------|---------|-----------|
| `brick` | Walls, chimneys, buildings | Offset rectangular grid + mortar |
| `tile` | Bathrooms, kitchens, temples | Square grid + grout, glossy surface |
| `carpet` | Interiors, soft floors | Cross-hatch weave pattern, very matte |

## Palette integration

In pre-production, assign a style to each palette role:

```
| Role       | Hex     | Style       |
|------------|---------|-------------|
| Ground     | #4a6741 | organic     |
| Wall       | #8b7d6b | rough       |
| Player     | #4488ff | smooth      |
| Enemy: Bat | #c23616 | organic     |
| XP gem     | #f1c40f | crystalline |
```

## How it works

`MeshStandardMaterial.onBeforeCompile` injects GLSL into three shader chunks:

1. **normal_fragment_maps** — triplanar blend weights from world normal, noise evaluation (or texture fetch if baked), color override, bump perturbation via noise gradients
2. **roughnessmap_fragment** — noise-driven roughness modulation
3. **metalnessmap_fragment** — noise-driven metalness modulation

Triplanar mapping projects noise in world space along all three axes, blended by surface orientation. No UV unwrapping needed — works on any procedural geometry (boxes, planes, capsules).

When `noiseTex` is provided, the fragment shader skips all procedural noise GLSL and reads from the baked texture instead. Each style has both a `fragmentCode` (procedural) and `bakedFragmentCode` (texture-based) path. The triplanar UV computation stays the same — only the noise evaluation changes.

## Performance

- Simplex noise with analytical gradients (no finite differences except `crystalline`)
- fBm capped at 2 octaves
- `crystalline`, `cobblestone`, `ice` are the most expensive (voronoi = 27-cell neighbor search + finite-difference gradient)
- Pattern-based styles (`brick`, `tile`, `plank`) are cheap — just step/fract math

### Baked noise textures (mobile / fill-rate bound)

Per-fragment noise is the dominant GPU cost on mobile tile-based GPUs. When profiling shows the scene is **fragment-shader bound** (JS tick is fast but FPS drops when zoomed in or more wall pixels are on screen), bake noise to a texture:

```tsx
import { bakeNoiseTexture } from './noise-texture'
import { getStyleConfig } from './graybox-material'
import { useThree } from '@react-three/fiber'

// Inside an R3F component:
const gl = useThree(s => s.gl)
const cfg = getStyleConfig('slate')
const tex = useMemo(() => bakeNoiseTexture(gl, {
  noise: cfg.noiseType,        // 'perlin' | 'value' | 'voronoi' | 'turbulence'
  scale: [cfg.bakedTexScale, cfg.bakedTexScale],
  octaves: cfg.octaves,
  width: 256, height: 256,
}), [gl])

// Pass to material:
<GrayboxMaterial color="#5a6a7a" style="slate" noiseTex={tex} />
```

This replaces hundreds of ALU ops per fragment with a single `texture2D` fetch. Each style has a `bakedFragmentCode` that reads the baked texture (R=noise value, G=dx gradient, B=dz gradient) and applies the same per-style math (color modulation, roughness, bump).

**Trade-off:** Baked noise is 2D (sampled at `triUV.xz`), so the visual character differs slightly from the 3D procedural version. Acceptable for shipped games — the player won't notice.

**When to bake:**
- Mobile targets (iOS Safari, Android Chrome) — always bake
- Desktop — only if profiling shows fragment-bound drops below 60 FPS
- The `createGrayboxMaterial()` function also accepts `noiseTex` in its options

### Other GPU optimization techniques

| Technique | When to use | Impact |
|-----------|------------|--------|
| `BasicShadowMap` | Mobile, or when PCF shadow quality isn't visible | 1 depth sample vs PCF's 9+. Use `shadows="basic"` on R3F `<Canvas>`. |
| Merge meshes with vertex colors | Multiple meshes share the same material but have different colors | Reduces draw calls + shader state switches. Use `mergeGeometries` from three/examples + vertex color attribute. |
| Remove `DoubleSide` | Meshes that already have geometry for both sides (e.g. explicit inner+outer face quads) | Halves fragment work on those meshes. Verify no holes first. |
| Reduce shadow map resolution | When shadow detail isn't critical | `shadow-mapSize-width={512}` instead of 1024. |

### Diagnosis flowchart

1. Run `PROFILE=1 npm run dev <slug>`, read `[profile]` console output
2. If JS tick is fast but FPS drops → **GPU-bound**
3. Check `renderer.info.render.triangles` — if <200k, you're **fragment-bound** not vertex-bound
4. Fragment-bound fixes (in priority order): bake noise textures → BasicShadowMap → merge meshes → reduce shadow map size
5. Vertex-bound fixes: merge geometries, reduce triangle count, LOD
