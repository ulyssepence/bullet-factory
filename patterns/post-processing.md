# Post-Processing

Full-screen shader pass that reads the rendered scene buffer and outputs a modified image.

## Architecture

`template/src/postfx.ts` exports `GamePostFX` (a `postprocessing` Effect) with:

- **`SHADER_PREAMBLE`** — ~370 lines of GLSL helpers (noise, SDF, color, blend modes, coordinates, waves)
- **`wrapFragment(body)`** — wraps a shader body into a full fragment. Pre-declares `vec3 color = scene(uv).rgb;` and appends `outputColor = vec4(color, 1.0);`. The user's body just modifies `color`.
- **`DEFAULT_BODY`** — vignette darken
- **`setBody(body)`** — hot-reload a new shader body at runtime
- **Feedback buffer** — `prev(uv)` returns previous frame's scene via ping-pong blit
- **Uniforms** — `time`, `resolution`, `mouse`, `frame`, `previousFrame`

### Gotchas

- **`#define PI` conflict**: Three.js's `#include <common>` defines `PI`. Never use `const float PI = ...` in shader code — it'll be macro-expanded into `const float 3.14... = ...`. The preamble uses `#ifndef PI` / `#define PI` / `#endif`.
- **`scene(uv)` / `prev(uv)` return `vec3`**, not `vec4`. They apply `fract(uv)` internally so out-of-range UVs tile.
- **Test-compile needs `void main()`**: The postprocessing library provides `mainImage()`, not `main()`. When test-compiling against a raw WebGL context (outside the library), append a stub `void main()` that calls `mainImage`.
- **`copyTextureToTexture` fails silently on render target textures**. Use a fullscreen quad blit (`renderer.setRenderTarget(dst)` + `renderer.render(blitScene, blitCamera)`) instead.
- **Compounding darkness:** Vignette + contrast boost + tint + fog multiply together. Budget one darkening operation. Test by checking player visibility at screen edges where vignette is strongest.
- **Color tint hue-locks the palette:** A saturated tint (e.g. `mix(color, blue, 0.3)`) makes all palette diversity unreadable. Keep tint strength ≤ 0.15 or use a neutral warm.

## Shader body contract

The user writes only the **body** — the middle part that transforms `color`:

```glsl
// These are pre-declared by wrapFragment():
//   vec3 color = scene(uv).rgb;   ← available, sample the scene
//   outputColor = vec4(color, 1.0); ← appended after body

// Available uniforms:
//   float time, vec2 resolution, vec2 mouse, int frame
//   sampler2D previousFrame (via prev(uv))

// Example body (vignette):
float vig = 1.0 - smoothstep(0.4, 0.8, length(uv - 0.5));
color *= mix(0.5, 1.0, vig);
```

## Available helpers (SHADER_PREAMBLE)

| Category | Functions |
|----------|-----------|
| Sampling | `scene(uv)`, `prev(uv)` |
| Noise | `random`, `simple_noise`, `perlin_noise`, `voronoi_noise`, `turbulence_noise`, `white_noise` |
| SDF | `line_sdf`, `rect_sdf`, `circle_sdf`, `sphere_sdf`, `triangle_sdf`, `box_sdf`, `menger_sponge_sdf`, `smin` |
| Color | `rgb2hsv`, `hsv2rgb`, `rainbow_gradient`, `palette` (IQ cosine), `replace_rgb`, `lit` |
| Blend | `blend_darken`, `blend_multiply`, `blend_screen`, `blend_overlay`, `blend_soft_light`, `blend_hard_light`, `blend_color_dodge`, `blend_color_burn`, `blend_linear_dodge`, `blend_linear_burn`, `blend_lighten`, `blend_vivid_light`, `blend_linear_light`, `blend_pin_light`, `blend_difference`, `blend_exclusion` (float + vec3 overloads) |
| Blur | `blur_gaussian(uv, radius)` |
| Coords | `xy_to_r_theta`, `r_theta_to_xy`, `rotate`, `cartesian_to_polar_long_lat` |
| Waves | `sin01`, `sin01ma`, `stay01`, `stay`, `triangle`, `square` |
| Utility | `one_minus`, `clamp01`, `map_range`, `map01`, `floor_to_nearest`, `with_u`, `with_v` |

## Effect library

Pick 2-4 effects per game. Keep them subtle — enhance mood, don't obscure gameplay.

### UV effects

**Vignette warp** — subtle barrel distortion:
```glsl
vec2 centered = uv - 0.5;
float dist = length(centered);
vec2 warped = 0.5 + centered * (1.0 + 0.1 * dist * dist);
color = scene(warped);
```

**Wave** — gentle sinusoidal displacement:
```glsl
vec2 w = uv;
w.x += sin(uv.y * 10.0 + time * 2.0) * 0.003;
w.y += cos(uv.x * 10.0 + time * 2.0) * 0.003;
color = scene(w);
```

### Color effects

**Vignette darken**:
```glsl
float vig = 1.0 - smoothstep(0.4, 0.8, length(uv - 0.5));
color *= mix(0.3, 1.0, vig);
```

**Chromatic aberration**:
```glsl
float ca = 0.003;
color.r = scene(uv + vec2(ca, 0.0)).r;
color.b = scene(uv - vec2(ca, 0.0)).b;
```

**Color grading / tint**:
```glsl
float luma = dot(color, vec3(0.299, 0.587, 0.114));
vec3 tint = vec3(0.9, 0.8, 0.6);
color = mix(color, vec3(luma) * tint, 0.15);
```

**Posterize**:
```glsl
float bands = 8.0;
color = floor(color * bands) / (bands - 1.0);
```

**Scanlines**:
```glsl
float scan = 0.95 + 0.05 * sin(uv.y * resolution.y * 1.5);
color *= scan;
```

**Feedback trail**:
```glsl
color = mix(prev(uv), color, 0.1);
```

## Depth fog

`template/src/fog.ts` exports `FogEffect` — a depth-based post-process fog that reads the depth buffer and blends the scene toward a fog color gradient based on distance from camera. Uses `EffectAttribute.DEPTH`.

### Config

```ts
type FogConfig = {
  colorNear: string   // hex — fog tint for nearby objects
  colorFar: string    // hex — fog tint at max distance
  start: number       // distance where fog begins (world units)
  end: number         // distance where fog reaches full density
  intensity: number   // overall strength 0-1
  noiseScale: number  // noise texture break-up (0 = smooth gradient)
}
```

### Usage

```tsx
import { EffectComposer } from '@react-three/postprocessing'
import { FogEffect } from './fog'
import { GamePostFX } from './postfx'

const fogEffect = useMemo(() => new FogEffect({
  colorNear: '#1a0830', colorFar: '#0a0418',
  start: 5, end: 30, intensity: 0.4, noiseScale: 8,
}), [])
const postfx = useMemo(() => new GamePostFX(), [])

<EffectComposer>
  <primitive object={fogEffect} />
  <primitive object={postfx} />
</EffectComposer>
```

Fog and `GamePostFX` share a single `EffectPass` (no attribute conflict). Fog runs first → scene fades to fog color → then color grading/vignette applies on top.

### Key insight

Two-color gradient (near vs far) instead of a single fog color. This is what makes it look like Firewatch/INSIDE — warm haze nearby transitioning to cool darkness at distance, rather than flat uniform tinting.

### Constraint

Only one `DEPTH` effect per `EffectPass`. If a game also needs DOF or SSAO, use separate `EffectPass` instances (not just separate effects in the same composer).

## Suggested combos by mood

| Mood | Effects | Notes |
|------|---------|-------|
| Dark/horror | vignette darken + chromatic aberration + depth fog | oppressive edges, darkness closing in |
| Cyberpunk | scanlines + chromatic aberration + posterize | CRT retro feel |
| Dreamy | wave + blur_gaussian + tint (warm) + depth fog | soft, floaty, atmospheric |
| Clean/minimal | vignette darken + contrast | just polish |
| Survival/exploration | depth fog + vignette darken + tint | limited visibility, tension |

## R3F integration

```tsx
import { EffectComposer } from '@react-three/postprocessing'
import { GamePostFX } from './postfx'

const effect = useMemo(() => new GamePostFX(), [])
// or: new GamePostFX('color = blend_overlay(color, vec3(0.2, 0.1, 0.05));')

<EffectComposer>
  <primitive object={effect} />
</EffectComposer>
```

## Performance budget

Target: <2ms for the post-processing pass. At 1080p that's ~2M fragments. Keep texture lookups to ≤5 per fragment. Avoid loops. Test on mobile (where fill rate is the bottleneck).

## Live editor

`npm run dev post-processing` — ACE editor + live 3D preview. Shaders hot-reload with 300ms debounce and test-compile validation.
