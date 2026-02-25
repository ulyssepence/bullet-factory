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

| Style | Use for | Character |
|-------|---------|-----------|
| `rough` | Ground, walls, stone | High-freq noise bump, matte (roughness 0.85) |
| `smooth` | Player, pickups, UI elements | Minimal noise, reflective (roughness 0.2) |
| `organic` | Terrain, flesh, bark | Domain-warped fBm, medium roughness |
| `crystalline` | Crystals, ice, gems, XP | Voronoi cell edges, slight metalness |
| `metallic` | Weapons, armor, machines | Brushed anisotropic noise, metalness 0.4 (safe without env map) |
| `worn` | Aged surfaces, crates, ruins | Layered noise + scratches, mixed roughness |

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
- `crystalline` is the most expensive style (voronoi = 27-cell neighbor search + finite-difference gradient)
- If perf is tight, use `smooth` (single noise eval) or drop `bumpStrength` to 0
