# Particles

GPU particle system with preset-based API. One shared shader, pool-managed `<points>` elements, uniform-swap checkout.

```ts
import * as particles from './particles'
```

Mount `<particles.ParticlePool />` inside `<Canvas>` once. This pre-allocates all pools.

## Presets

| Preset | Visual | Use cases |
|--------|--------|-----------|
| `burst` | 80 particles exploding outward with gravity | Enemy death, destruction, impacts, damage feedback. Tune `count`/`lifetimeMax` for intensity. |
| `radial` | 60 particles expanding in a ring | Level-up, AoE effects, shockwave |
| `aura` | 40 slow-rising particles, looping | Rare enemies, buffs, status effects, campfire/torches |
| `sparkle` | 15 twinkling particles, looping | Ambient, pickups, collectibles |
| `rain` | 200 falling particles, camera-following volume | Weather, ambient. Origin auto-tracks camera. |

## One-shot API

Fire-and-forget. Pool auto-reclaims after lifetime expires.

```ts
particles.emit('burst', { at: [x, y, z], color: palette.accent })
particles.emit('burst', { at: enemy.position, color: '#ff4444' })
```

## Persistent API

Mounts a looping effect that follows a position. Released on unmount.

```tsx
<particles.ParticleEffect preset="aura" position={pos} color={palette.accent} />
<particles.ParticleEffect preset="rain" position={[0, 8, 0]} color="#aabbff" />
```

Position is read each frame, so pass a ref-like mutable tuple for moving effects.

## Color convention

Use palette colors (`palette.accent`, `palette.player`, `palette.enemies[i]`). White is the default fallback.

## Performance

Each preset has a fixed pool size. If all slots are in use, `emit()` silently drops. Pool sizes are tuned for Vampire Survivors-like games (256 burst slots for mass kills, few rain/aura). No geometry rebuild ever happens — only uniform swaps.

## What particles are NOT for

- **Damage numbers / status text**: Use tweened HTML overlays or drei `<Billboard>` + `<Text>`. These need dynamic content and readability.
- **Connected trails**: Real trails (ribbons behind projectiles) need position-history geometry, not point particles. Not yet implemented.
