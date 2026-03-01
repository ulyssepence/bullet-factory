# Game Feel

Mechanical defaults encoded in the template. Read `patterns/game-juice.md` for the full catalogue of code-only effects — this doc covers the *systems* that deliver them.

## Clock Architecture

The template uses a dual clock (`template/src/clock.ts`):

- **`simDt`** — simulation delta. Always real wall-clock time (clamped to 100ms). Used for physics, spawning, cooldowns, run timer.
- **`vizDt`** — visual delta. Scaled to 5% during hitstop. Used for particles, popups, camera shake, animations.

Call `clock.tick(rawDt)` once per frame. Read `clock.getState()` for both deltas.

```ts
clock.tick(dt)
const { simDt, vizDt } = clock.getState()
storeTick(simDt)        // game logic uses real time
shake.tick(vizDt, acc)  // visuals use scaled time
```

### Why 5% not 0%

Setting vizScale to 0 during hitstop causes:
- Shader divide-by-zero on time-based effects
- Particles freezing in a distracting cluster
- Popups stalling mid-animation

At 5%, particles barely drift, popups creep upward — the world feels frozen but alive. This is the Vlambeer technique.

## Feedback Profiles

`template/src/feedback.ts` dispatches multi-channel feedback through named profiles:

| Profile | Shake | Hitstop | Particles | Sound | Popup | Budget |
|---------|-------|---------|-----------|-------|-------|--------|
| `hit` | light | 40ms | burst | hit | — | 15/s |
| `kill` | medium | 60ms | burst | hit | pop-shrink | 10/s |
| `hurt` | heavy | 80ms | — | hurt | — | 3/s |
| `levelup` | medium | 100ms | radial | levelup | slam | 1/s |
| `boss` | heavy | 120ms | radial | hit | — | 1/s |

### Usage

```ts
import * as feedback from './feedback'

// Fire-and-forget — budget, accessibility, and channel dispatch all handled
feedback.emit('hit', { at: enemy.position, color: '#ff4444' })
feedback.emit('kill', { at: enemy.position, text: `+${xp} XP` })
feedback.emit('hurt', { at: player.position })
```

### Customizing Per-Game

```ts
// Override a default
feedback.register('hit', {
  shake: { amplitude: 0.2, durationMs: 200 },
  hitstop: 50,
  particles: { preset: 'burst', color: '#ff0000' },
  sound: 'slash',
  maxPerSecond: 20,
})

// Add a game-specific profile
feedback.register('crit', {
  shake: 'heavy',
  hitstop: 100,
  flash: true,
  particles: { preset: 'radial' },
  sound: 'crit',
  popup: { text: 'CRIT!', curve: 'slam', color: '#ff0000' },
  maxPerSecond: 5,
})
```

### Flash Handler

Flash varies too much across games to have a useful default. Wire your own:

```ts
feedback.setFlashHandler((color, durationMs) => {
  // Option A: mesh emissive flash
  mesh.material.emissive.set(color)
  setTimeout(() => mesh.material.emissive.set('#000000'), durationMs)

  // Option B: postfx uniform
  postfx.setUniform('flashColor', color)
  postfx.setUniform('flashIntensity', 1)

  // Option C: CSS overlay
  overlay.style.background = color
  overlay.style.opacity = '0.15'
  setTimeout(() => overlay.style.opacity = '0', durationMs)
})
```

### Budget System

Each profile has a `maxPerSecond` cap. When 50 enemies die in one frame, only the first 10 `kill` feedbacks fire — the rest are silently dropped. This prevents audio distortion, particle pool exhaustion, and screen shake seizures.

Override per profile: `feedback.register('hit', { ...existing, maxPerSecond: 30 })`.

## Shake Tiers

`template/src/shake.ts` — trauma-based, sine-composition noise.

| Tier | Amplitude | Duration | Use for |
|------|-----------|----------|---------|
| `light` | 0.1 | 150ms | Individual hits, pickups |
| `medium` | 0.3 | 300ms | Kills, level-ups, explosions |
| `heavy` | 0.6 | 500ms | Player hurt, boss attacks, big AoE |

Directional bias: pass `direction: [dx, dy]` for 70% directional + 30% noise. Good for knockback-aligned shake.

Camera position displacement (not UV) gives 3D parallax — nearby objects shake more than distant ones.

## Hitstop Guidelines

| Event | Duration | Notes |
|-------|----------|-------|
| Hit (trash mob) | 40ms | Barely perceptible but adds weight |
| Kill | 60ms | Punctuates the kill |
| Player hurt | 80ms | "What just hit me?" moment |
| Boss hit/phase | 100-120ms | Dramatic emphasis |

Overlapping hitstops extend, don't stack. Two 40ms hitstops 20ms apart = 60ms total freeze, not 80ms.

## Audio Feel

`template/src/audio.ts` applies automatic variation:

- **Pitch**: `playbackRate` randomized 0.9–1.1 per play
- **Volume**: ±2dB random variation
- **Variants**: If `hit_0`, `hit_1`, `hit_2` exist in the manifest, `play('hit')` picks one randomly
- **Debounce**: 50ms per base name (not per variant)

This prevents the "machine gun" effect when many enemies die simultaneously.

## Alpha Caps

Burst and radial particle presets default to `alphaCap: 0.4`. This prevents additive-blended particles from blowing out to solid white when many fire at once (e.g. 50 enemies dying in a cluster).

Override per preset: set `alphaCap: 1.0` for full-brightness effects where appropriate (aura, sparkle already default to 1.0).

## Accessibility

`store.accessibility` gates feedback at the system level:

| Setting | Effect |
|---------|--------|
| `reduceShake` | Shake amplitude × 0.2 |
| `reduceHitstop` | Hitstop duration × 0.3 |
| `disableFlash` | Flash channel skipped entirely |

Wire these to your settings UI. The feedback system reads them automatically.

## Heartbeat Difficulty Curves

Tension should oscillate, not ramp linearly. Target 2:1 tension/release ratio in 60–90 second cycles. A 60s cycle = 40s ramping intensity + 20s breather (fewer spawns, more pickups).

## Onboarding Sequencing

- Zero-threat first 15 seconds (enemies spawn but don't attack, or spawn at distance)
- One new mechanic per minute
- First level-up forced early (30–45s) so the player sees the progression loop
- Boss encounter no earlier than 4 minutes

## Session Length

Target 8–12 minutes per run. End 20% earlier than players expect — leave them wanting more. A 10-minute run that ends at the peak is better than a 15-minute run that drags.

## Telemetry

`store.telemetry` tracks per-run data. Check console output at run end:

| Field | What to look for |
|-------|-----------------|
| `durationSec` | <8min = too hard, >14min = too easy |
| `firstLevelupMs` | Should be 30–45s. >60s = XP too scarce |
| `deathCount` | Track across runs for difficulty curve |
| `waveReached` | Players should reach 60–80% of waves on average |
| `enemyTypes` | All types should appear. Missing = spawn config bug |
