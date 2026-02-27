# Game Juice

Code-only effects that make graybox games feel alive. No assets required — just math, timing, and transforms. Pick what fits the moment. These are suggestions, not requirements.

## Impact

Things that make hits and kills feel powerful.

**Hit-stop (frame freeze)** — Pause game time for 40-80ms on a significant hit. Scale duration with damage. The single most impactful juice technique.
```ts
// In tick(): skip dt accumulation for hitStop.remaining frames
state.hitStop = { remaining: 0.06 } // 60ms
```

**Screen shake** — Displace camera by random offset that decays exponentially. Use for damage taken, big kills, explosions. Trauma-based: set trauma 0-1, shake magnitude = trauma², decay trauma over time.
```ts
const shake = trauma * trauma * maxOffset
camera.position.x += (Math.random() * 2 - 1) * shake
camera.position.y += (Math.random() * 2 - 1) * shake
trauma *= 0.92 // decay per frame
```

**Damage flash** — Tint the hit entity white for 1-2 frames, then back. On `meshStandardMaterial`, set `emissive` to white briefly. Or toggle a `hit` uniform in GrayboxMaterial.

**Knockback** — Push enemies away from damage source. Apply an impulse velocity that decays over ~0.15s. Feels terrible without it.

**Damage numbers** — Floating HTML overlays or drei `<Text>` that drift upward and fade. Randomize x-offset slightly so stacked hits don't overlap. Scale font size with damage.

**Death burst** — Scale entity to 1.3x over 50ms then to 0 over 100ms before despawning. Combine with `particles.emit('burst')`.

**Kill streak flash** — Brief full-screen white overlay (opacity 0.1→0, 100ms) when killing 5+ enemies in <1s.

## Motion

Things that make movement feel responsive and fluid.

**Squash and stretch** — Scale player mesh: compress on direction change (0.85x, 1.15y for 50ms), stretch on acceleration (1.15x, 0.85y). Subtle — keep within ±15%.

**Camera lead** — Offset camera slightly in movement direction so you see more of what's ahead. Lerp the offset, don't snap.

**Speed lines** — When player moves fast, emit faint streaks from screen edges toward center. Use a simple particle strip or post-processing UV offset.

**Dash ghost** — On dash/dodge, leave 2-3 transparent copies of the player mesh at previous positions, fading over 0.2s.

**Landing impact** — If there's any vertical movement (jumps, ledges), briefly compress y-scale and emit a ground dust ring on landing.

**Turn snap** — Rotate entity model to face movement direction with a fast lerp (~0.2s), not instant. Gives weight.

## Feedback

Things that communicate state changes clearly.

**XP magnet acceleration** — XP gems don't just drift toward player linearly. Start slow, accelerate quadratically. The "sucking in" feel.
```ts
const dist = vec3.distance(gem.position, player.position)
const t = 1 - dist / magnetRadius
gem.speed = baseSpeed + t * t * maxSpeed // quadratic ramp
```

**Level-up flash** — Full-screen radial burst (white→transparent, 200ms) + brief time slowdown (0.3x for 300ms) + `particles.emit('radial')`. Makes leveling feel like an event.

**Health pulse** — When health <30%, pulse the health bar or screen vignette red at heartbeat rate (~1.2Hz). Intensity increases as health drops.

**Invincibility flash** — During i-frames, alternate entity visibility every 60ms (3 on, 3 off at 60fps). Classic and instantly readable.

**Pickup anticipation** — Scale gems/pickups with a gentle sine bob (±10%, 2Hz) and rotate slowly. They should look alive and collectible.

**Weapon ready pulse** — Brief scale bump (1.0→1.1→1.0, 80ms) on weapon icon when cooldown finishes. "I'm ready."

## Atmosphere

Things that set mood without requiring art.

**Ambient particles** — `<ParticleEffect preset="sparkle">` or `preset="rain"` floating in the scene. Match to theme: falling leaves, embers, snow, dust motes.

**Dynamic vignette** — Darken screen edges more when health is low, lighten when safe. Driven by health %, lerped.

**Camera zoom** — Gradually zoom out as enemy count increases (more threats = wider view). Zoom in during calm moments. Lerp smoothly.

**Color drain** — Desaturate the scene when health drops below 20%. Post-processing: lerp saturation toward 0.
```glsl
float sat = mix(0.2, 1.0, smoothstep(0.0, 0.3, healthPct));
color = mix(vec3(dot(color, vec3(0.299, 0.587, 0.114))), color, sat);
```

**Heartbeat camera** — At low health, add subtle rhythmic zoom pulse to camera FOV. 1-2 degree oscillation at ~1.2Hz.

**Time dilation on big events** — Slow to 0.3x for 200-400ms on boss spawn, last enemy of a wave, near-death survival. Makes moments memorable.

## Combinations

Some moments deserve multiple effects stacked. Use restraint elsewhere.

| Moment | Stack |
|--------|-------|
| Enemy killed | Knockback + death burst + damage number + particles |
| Player hit | Damage flash + screen shake + knockback + hit-stop |
| Level up | Time slow + radial flash + particles + camera zoom pulse |
| Boss spawn | Time slow + screen shake + camera zoom out + ambient change |
| Near death | Health pulse + vignette + color drain + heartbeat camera |
| Big AoE hit | Hit-stop (longer) + screen shake (bigger) + kill streak flash |

## Guidelines

- **Layer 2-3 effects per event, not 6.** Restraint makes the moments that DO stack feel special.
- **Scale with significance.** A trash mob death gets knockback + burst. A boss death gets the full stack.
- **Everything lerps.** No instant snaps — ease in/out on every value change. `lerp(current, target, 1 - Math.pow(0.001, dt))` for frame-rate-independent smoothing.
- **Test without juice first.** If the game doesn't work without juice, juice won't save it. Add feel after function.
- **Mobile budget.** Screen shake and particles are cheap. Post-processing effects (color drain, dynamic vignette) cost fill rate. Profile on mobile.
