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

1. **normal_fragment_maps** — triplanar blend weights from world normal, noise evaluation, color override, bump perturbation via noise gradients
2. **roughnessmap_fragment** — noise-driven roughness modulation
3. **metalnessmap_fragment** — noise-driven metalness modulation

Triplanar mapping projects noise in world space along all three axes, blended by surface orientation. No UV unwrapping needed — works on any procedural geometry (boxes, planes, capsules).

## Performance

- Simplex noise with analytical gradients (no finite differences except `crystalline`)
- fBm capped at 2 octaves
- Noise computed per-fragment; on mobile, ~1-2ms overhead for full-screen coverage
- `crystalline`, `cobblestone`, `ice` are the most expensive (voronoi = 27-cell neighbor search + finite-difference gradient)
- If perf is tight, use `smooth` (single noise eval) or drop `bumpStrength` to 0
- Pattern-based styles (`brick`, `tile`, `plank`) are cheap — just step/fract math
