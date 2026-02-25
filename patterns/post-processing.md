# Post-Processing

Full-screen shader pass that reads the rendered scene buffer and outputs a modified image. The pipeline has three stages executed in order:

```
Scene buffer → UV warp → Sample → Color adjust → Screen
```

## Architecture

A single GLSL fragment shader with two sections:

1. **UV stage** — transform `uv` before sampling. Distortion, warping, noise displacement. Order matters — effects don't commute.
2. **Color stage** — modify `color` after sampling. Contrast, tint, posterize, vignette, chromatic aberration.

Some effects span both stages (e.g. chromatic aberration samples the buffer 3 times with offset UVs).

```glsl
uniform sampler2D sceneBuffer;
uniform float time;
uniform vec2 resolution;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;

  // --- UV stage ---
  // (effects modify uv here)

  // --- Sample ---
  vec3 color = texture2D(sceneBuffer, uv).rgb;

  // --- Color stage ---
  // (effects modify color here)

  gl_FragColor = vec4(color, 1.0);
}
```

## Effect library

Pick 2-4 effects per game. Keep them subtle — enhance mood, don't obscure gameplay. All effects are code-only GLSL snippets.

### UV effects

**Vignette warp** — subtle barrel distortion, darker edges:
```glsl
vec2 centered = uv - 0.5;
float dist = length(centered);
uv = 0.5 + centered * (1.0 + 0.1 * dist * dist);
```

**Wave** — gentle sinusoidal displacement:
```glsl
uv.x += sin(uv.y * 10.0 + time * 2.0) * 0.003;
uv.y += cos(uv.x * 10.0 + time * 2.0) * 0.003;
```

**Noise displacement** — organic wobble:
```glsl
// requires a noise function (simplex, perlin, etc.)
uv += noise(uv * 5.0 + time * 0.5) * 0.005;
```

### Color effects

**Vignette darken** — darken edges:
```glsl
float vig = 1.0 - smoothstep(0.4, 0.8, length(uv - 0.5));
color *= mix(0.3, 1.0, vig);
```

**Chromatic aberration** — RGB channel offset:
```glsl
float ca = 0.003;
color.r = texture2D(sceneBuffer, uv + vec2(ca, 0.0)).r;
color.b = texture2D(sceneBuffer, uv - vec2(ca, 0.0)).b;
```

**Color grading / tint** — push toward a mood color:
```glsl
float luma = dot(color, vec3(0.299, 0.587, 0.114));
vec3 tint = vec3(0.9, 0.8, 0.6); // warm
color = mix(color, vec3(luma) * tint, 0.15);
```

**Posterize** — reduce color bands:
```glsl
float bands = 8.0;
color = floor(color * bands) / (bands - 1.0);
```

**Contrast** — punch up:
```glsl
color = (color - 0.5) * 1.3 + 0.5;
```

**Scanlines** — CRT feel:
```glsl
float scan = 0.95 + 0.05 * sin(uv.y * resolution.y * 1.5);
color *= scan;
```

**Bloom (fake)** — bright areas glow:
```glsl
float d = 0.003;
vec3 blur = (
  texture2D(sceneBuffer, uv + vec2(-d, 0.0)).rgb +
  texture2D(sceneBuffer, uv + vec2(d, 0.0)).rgb +
  texture2D(sceneBuffer, uv + vec2(0.0, -d)).rgb +
  texture2D(sceneBuffer, uv + vec2(0.0, d)).rgb
) / 4.0;
vec3 bright = max(blur - 0.5, 0.0) * 2.0;
color += bright * 0.3;
```

## Suggested combos by mood

| Mood | Effects | Notes |
|------|---------|-------|
| Dark/horror | vignette darken + chromatic aberration + contrast | oppressive edges, color fringing |
| Cyberpunk | scanlines + chromatic aberration + posterize | CRT retro feel |
| Dreamy | wave + fake bloom + tint (warm) | soft, floaty |
| Clean/minimal | vignette darken + contrast | just polish |
| Psychedelic | noise displacement + chromatic aberration + color cycle | for when you want to go wild |

## R3F integration

Use a custom `Effect` from `postprocessing` (the library that `@react-three/postprocessing` wraps):

```tsx
import { Effect } from 'postprocessing'
import { Uniform } from 'three'

const fragmentShader = `
  uniform float time;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 st = uv;
    // UV stage...
    vec3 color = texture2D(inputBuffer, st).rgb;
    // Color stage...
    outputColor = vec4(color, 1.0);
  }
`

class GamePostFX extends Effect {
  constructor() {
    super('GamePostFX', fragmentShader, {
      uniforms: new Map([['time', new Uniform(0)]]),
    })
  }
  update(_renderer: any, _inputBuffer: any, deltaTime: number) {
    this.uniforms.get('time')!.value += deltaTime
  }
}
```

Then in the component tree:
```tsx
import { EffectComposer } from '@react-three/postprocessing'

<EffectComposer>
  <primitive object={new GamePostFX()} />
</EffectComposer>
```

## Performance budget

Target: <2ms for the post-processing pass. At 1080p that's ~2M fragments. Keep texture lookups to ≤5 per fragment. Avoid loops. Test on mobile (where fill rate is the bottleneck).
