# Palette System

## Core Palette

Every game's `spec.palette` defines 5 color roles:

| Role | Purpose |
|------|---------|
| `ground` | Arena floor — dark, low-saturation base |
| `wall` | Walls/obstacles — distinct from ground |
| `player` | Player character — high contrast vs ground |
| `accent` | UI highlights, XP gems, level-up effects |
| `enemy` | `Record<string, string>` — one color per enemy type |

These are the only colors that should appear as hex literals in game code. Everything else derives from them.

## Derived Palette

`template/src/palette-derive.ts` exports `derive(palette, enemyNames)` which produces:

| Derived | Source | Transform |
|---------|--------|-----------|
| `zoneFloors[3]` | ground | Hue ±12, luminance ±0.03 |
| `zoneWalls[3]` | wall | Hue ±15, luminance ±0.04 |
| `grassBase` | ground | Luminance -0.08 |
| `grassTip` | ground | Luminance +0.12 |
| `sceneBackground` | ground | Luminance -0.25 |
| `uiBackground` | ground | Luminance -0.35 |
| `uiText` | ground | White if ground is dark, dark if ground is light |
| `xpColor` | accent | Pass-through |
| `healthPickup` | — | Fixed `#e84040` |
| `magnetPickup` | — | Fixed `#f0d020` |

Usage in `level/config.ts`:

```ts
import * as palDerive from '../../template/src/palette-derive'
const derived = palDerive.derive(spec.palette)
export const ZONE_FLOOR_PALETTES = derived.zoneFloors.map(h => new THREE.Color(h))
export const ZONE_WALL_PALETTES = derived.zoneWalls.map(h => new THREE.Color(h))
```

`derive()` accepts both formats: `spec.palette` (with `enemy: Record<string, string>`) and the generator's `Palette` type (with `enemies: string[]`). When using the array format, pass enemy names as the second argument.

## Web Picker

```
npx tsx scripts/preview-palettes.ts <slug>     # web picker for game
npx tsx scripts/preview-palettes.ts [count]    # terminal mode (legacy)
```

The web picker shows ~50 generated candidates. Click to select a whole palette, or click individual color slots to tweak single colors. "Apply Palette" writes directly to `games/<slug>/src/spec.ts`.

## Rules

- **No hardcoded hex values in game code.** All colors come from `spec.palette` or `derived`.
- Props and destructibles should use `spec.palette` roles, not invented hex.
- Feedback emit calls pass `color: spec.palette.accent` (or appropriate role) at call site.
- Grass system receives `derived.zoneFloors` as zone palettes.

## Gotchas

- **Hue clustering:** LLM-generated palettes drift toward a single hue family (commonly blue-cyan). Require ≥3 distinct hue regions across the 5 roles (ground and wall may share a family if their lightness differs by ≥30%). If player, accent, and enemies hues are all within 60°, reject and regenerate.
- **Contrast at game zoom:** At typical camera height (~25 units), silhouettes are small. Player vs ground must have strong value contrast. Use a contrast checker on hex values before finalizing.
