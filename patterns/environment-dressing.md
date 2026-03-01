# Environment Dressing

Non-vegetation procedural atmosphere layers for SOP step 3.4. These are code-only (no assets) — particle systems, instanced quads, and shader effects that make the world feel alive without competing with gameplay elements.

For vegetation (grass, wheat, bushes, crystals, etc.), see `patterns/grass-vegetation.md`.

## Atmosphere particles

Continuously emitting ambient particles that float through the scene. Use the existing particle system (`template/src/particles.ts`) with a dedicated emitter, or a standalone `InstancedBufferGeometry` with a custom shader for higher counts.

### Styles

| Style | Motion | Size | Count | Color | Use for |
|-------|--------|------|-------|-------|---------|
| flies/gnats | erratic jitter + drift toward light | 2-4px | 20-40 | dark (near-black) | swamps, forests, rot |
| floating embers | slow rise + lateral drift, fade out | 3-6px | 30-60 | orange→red, emissive | fire zones, volcanic, post-apocalyptic |
| dust motes | slow random walk, visible in light shafts | 1-3px | 40-80 | warm white, low alpha | interiors, ruins, deserts |
| fireflies | slow drift + intermittent glow pulse | 3-5px | 15-30 | yellow-green, emissive pulse | night, forests, magical |
| spores | slow rise, slight wobble | 2-4px | 20-50 | pale green/white | fungal, forest, alien |

### Implementation

For small counts (<100), use the existing particle pool with a continuous emitter:

```ts
// In useFrame:
emitTimer += dt
if (emitTimer > 1 / emitsPerSecond) {
  emitTimer = 0
  const pos = randomPointInView(camera, range)
  particles.emit('ambient', {
    position: pos,
    velocity: [drift.x, drift.y, drift.z],
    lifetime: 4 + Math.random() * 3,
    size: 0.03,
    color: atmosphereColor,
  })
}
```

For higher counts or custom motion (firefly glow pulse, erratic jitter), use a standalone `InstancedBufferGeometry` with a `ShaderMaterial`:

```ts
// Per-instance attributes: position, phase (random 0-1), speed
// Vertex shader: billboard quad facing camera, position += noise(time + phase)
// Fragment shader: circular point, alpha modulated by glow pulse for fireflies
```

### Spawn region

Particles spawn within a radius around the player (not globally). As the player moves, new particles emit at the edges and old ones naturally expire. This keeps the particle budget constant regardless of arena size.

## Ground scatter

Small flat objects on the ground plane — leaves, pebbles, puddle reflections. These are purely visual and have no collision.

### Styles

| Style | Shape | Size | Density | Color |
|-------|-------|------|---------|-------|
| fallen leaves | random rotated quads | 0.1-0.3 | 2-4/cell | brown/orange/red variation |
| pebbles | small circles (round quads) | 0.05-0.15 | 3-6/cell | gray variation, darker than ground |
| snow patches | soft circles, larger | 0.3-0.8 | 0.5-1/cell | white, slight blue tint |
| puddles | circular quads with reflective shader | 0.2-0.5 | 0.3-0.5/cell | ground color darkened, slight specular |

### Implementation

Use `InstancedBufferGeometry` with a single quad, placed flat on the ground (y = 0.001 to avoid z-fighting). Per-instance attributes: position, rotation, scale, color variation.

```ts
// Scatter during chunk activation, same as grass:
for (let z = 0; z < chunkSize; z++) {
  for (let x = 0; x < chunkSize; x++) {
    if (grid[z * chunkSize + x] !== FLOOR) continue
    for (let i = 0; i < density; i++) {
      // jittered position within cell, random rotation, random scale
    }
  }
}
```

Fragment shader options:
- **Leaves**: irregular shape via noise-distorted circle, color from palette with warm shift
- **Pebbles**: hard circle (`length(uv - 0.5) > 0.4 → discard`), slight normal perturbation for fake lighting
- **Snow**: soft circle with Gaussian falloff alpha
- **Puddles**: circle with darkened ground color, add `reflect(viewDir, normal)` sample for fake specular

## Fog / haze

Post-processing or UV-distortion effects that add depth and atmosphere.

### Styles

| Style | Implementation | Performance | Use for |
|-------|----------------|-------------|---------|
| depth fog | post-processing depth-based blend via `FogEffect` (`template/src/fog.ts`) | <0.5ms | any game needing atmospheric depth |
| heat shimmer | post-processing UV distortion (see `patterns/post-processing.md` → noise displacement) | <1ms | desert, volcanic, hot zones |
| volumetric light shafts | post-processing radial blur from light source (god rays) | <1.5ms | forests, cathedrals, dramatic |

### Depth fog

A post-processing effect that reads the depth buffer and blends distant objects toward a two-color fog gradient. Uses `template/src/fog.ts` (`FogEffect`). Add to the `EffectComposer` alongside `GamePostFX` in SOP step 3.4. See `patterns/post-processing.md` → Depth fog for config and usage.

### Heat shimmer and light shafts

These are post-processing effects. Wire them in step 3.4 (Post-processing) rather than 2.2b, but choose them here for thematic consistency. See `patterns/post-processing.md`.

## Performance budget

All dressing combined must stay under 2ms. Rough allocation:

| Layer | Budget | Notes |
|-------|--------|-------|
| Vegetation | <1ms | See `patterns/grass-vegetation.md` |
| Atmosphere particles | <0.3ms | Keep count low, use instancing |
| Ground scatter | <0.3ms | One draw call per chunk via instancing |
| Fog/haze | <0.5ms | Post-process depth fog (part of postfx budget) |

## Integration with chunks

Ground scatter and vegetation are per-chunk (built on activation, disposed on deactivation). Atmosphere particles are global (follow the player). Fog is a global post-processing effect (not per-chunk).

## What NOT to do

- Don't use atmosphere particles for gameplay-relevant effects (damage, pickups). These are cosmetic only.
- Don't place ground scatter on wall cells.
- Don't make fog opaque enough to obscure enemies or pickups.
- Don't exceed the 2ms combined budget. Cut density before adding complexity.
- Don't use `transparent: true` on vegetation or ground scatter — use `alphaTest`.
