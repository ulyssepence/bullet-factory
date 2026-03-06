# Game Architecture

The game state lives outside React in a plain mutable object. React components read from it each frame via `useFrame` but never own it. Events flow up, mutations happen in `tick()`, and the renderer syncs visuals to match.

## Core shape

```
User Input → Events → GameManager.dispatch() → queued
                                                  ↓
                            useFrame calls → GameManager.tick(dt)
                                                  ↓
                                          systems mutate state in place
                                                  ↓
                                          renderer reads state, positions meshes
```

**GameManager** is the single authority over game state. It exposes:
- `dispatch(event)` — any system or component can send events (damage dealt, XP collected, weapon fired, level up choice made). Events are queued and processed during the next `tick()`.
- `tick(dt)` — drains the event queue, then runs each system which mutates `state` in place. Called from the R3F `useFrame` loop.
- `state` — the mutable state object, read directly by renderer components.

Leaf nodes (weapons, enemies, pickups) never mutate state directly. They dispatch events. The game manager processes events during `tick()`, systems apply mutations, and renderer components read the result.

## State representation

State is plain data — no references to Three.js objects, no class instances, no circular refs.

```ts
// Entities are identified by opaque IDs
type EntityId = string

interface GameState {
  player: {
    id: EntityId
    position: [number, number, number]
    health: number
    xp: number
    level: number
    weapons: WeaponState[]
  }
  enemies: Map<EntityId, EnemyState>
  projectiles: Map<EntityId, ProjectileState>
  pickups: Map<EntityId, PickupState>
  wave: WaveDirectorState
  run: RunState
  paused: boolean
}
```

The renderer maintains a separate mapping of `EntityId → Three.js Object3D`. Each frame, renderer components read state directly and position/create/remove objects to match. State is the source of truth; the visual layer syncs to it.

Why IDs instead of refs:
- State is serializable — save/load, replay, and debugging are trivial
- State can be diffed — useful for netcode if multiplayer ever happens
- No dangling references when entities are destroyed

## Suspendable time

Every timer in the game accumulates or de-accumulates seconds as a number in state. No `setTimeout`, no `Date.now()` comparisons, no frame counters.

```ts
interface CooldownTimer {
  remaining: number // seconds until ready, decremented by dt each tick
}

interface DurationTimer {
  elapsed: number   // seconds since started, incremented by dt each tick
  duration: number  // target duration
}
```

In `tick(dt)`:
```ts
if (state.paused) return

for (const weapon of state.player.weapons) {
  weapon.cooldown.remaining = Math.max(0, weapon.cooldown.remaining - dt)
}

state.run.elapsed += dt
```

This makes pause trivial (skip the tick), save/load trivial (serialize the numbers), and slow-mo trivial (scale dt).

## Event types

Events are typed discriminated unions:

```ts
type GameEvent =
  | { type: 'ENEMY_SPAWNED'; enemyId: EntityId; enemyType: string; position: [number, number, number] }
  | { type: 'DAMAGE_DEALT'; sourceId: EntityId; targetId: EntityId; amount: number }
  | { type: 'ENTITY_DIED'; entityId: EntityId }
  | { type: 'XP_COLLECTED'; amount: number }
  | { type: 'LEVEL_UP_CHOICE'; choiceIndex: number }
  | { type: 'WEAPON_FIRED'; weaponId: string }
  // ...
```

## Module structure

```
src/
  game/
    manager.ts        — GameManager class (dispatch, tick, getState)
    types.ts          — GameState, GameEvent, EntityId, all state interfaces
    systems/
      wave-director.ts   — enemy spawning logic
      combat.ts          — damage resolution
      progression.ts     — XP, leveling, upgrades
      movement.ts        — entity movement (player + enemies)
  renderer/
    entity-map.ts     — EntityId → Object3D mapping
    components/        — React components that read state and render
  input/
    input-manager.ts  — unified input abstraction (see input pattern)
```

Each system in `systems/` exports a `tick(state, dt, events)` function that mutates `state` in place. The game manager calls them in order. Systems don't know about Three.js.

## Wiring it together

```tsx
const manager = new GameManager()

function Game() {
  useFrame((_, dt) => {
    manager.tick(dt)
  })

  return (
    <>
      <Level />
      <PlayerRenderer />
      <EnemyPool />
    </>
  )
}

function PlayerRenderer() {
  const ref = useRef<THREE.Mesh>(null)

  useFrame(() => {
    const { position } = manager.state.player
    ref.current!.position.set(...position)
  })

  return <mesh ref={ref}><capsuleGeometry /><meshStandardMaterial /></mesh>
}
```

Renderer components read `manager.state` in `useFrame` and imperatively update mesh transforms. No React re-renders for position changes — React only re-renders when entities are added/removed (which is rare relative to per-frame movement).

For entity pools (enemies, projectiles), the renderer maintains a fixed pool of meshes and assigns them to active entity IDs each frame, avoiding React mount/unmount overhead. See instanced rendering in the R3F research doc for the many-entity case.

## Object pooling

Enemies and projectiles spawn and despawn constantly. Allocating new objects per spawn causes GC pauses. Use a pool:

```ts
interface Pool<T> {
  active: T[]
  inactive: T[]
  create: () => T
}

function acquire<T>(pool: Pool<T>): T {
  const obj = pool.inactive.pop() ?? pool.create()
  pool.active.push(obj)
  return obj
}

function release<T>(pool: Pool<T>, obj: T) {
  const idx = pool.active.indexOf(obj)
  if (idx >= 0) {
    pool.active[idx] = pool.active[pool.active.length - 1]
    pool.active.pop()
  }
  pool.inactive.push(obj)
}
```

One pool per entity type (enemies, projectiles, XP gems, floating numbers). On "kill", reset the entity's state and `release()` it — don't delete it. On "spawn", `acquire()` and overwrite fields. Pre-warm pools at game start (e.g. 200 enemies, 100 projectiles) to avoid allocation during gameplay.

For the Three.js side: pair each pool entry with an `InstancedMesh` index. On release, move the instance's matrix off-screen (or set scale to 0). On acquire, set its matrix to the spawn position. This avoids creating/destroying Three.js objects entirely.

## Shared systems (`template/src/systems/`)

Reusable runtime gameplay systems live in `template/src/systems/`. Games import them directly (not copied). Each system is logic-only — no Three.js, no audio. Games wire side effects via callback parameters.

| System | Import | Key exports |
|--------|--------|-------------|
| `systems/types` | `import * as st from '../../../template/src/systems/types'` | `EntityId`, `EnemyState`, `WeaponState`, `ProjectileState`, `PickupState`, `PlayerChange`, `WeaponDef`, `UpgradeSequence` |
| `systems/grid` | `import * as grid from '../../../template/src/systems/grid'` | `wrapCoord`, `gridIdx`, `shortestWrapped`, `isFloor` |
| `systems/spatial` | `import * as spatial from '../../../template/src/systems/spatial'` | `createSpatialHash` — factory, no module-level state |
| `systems/collision` | `import * as collision from '../../../template/src/systems/collision'` | `resolvePlayerCollision`, `wrapPosition` |
| `systems/navigation` | `import * as navigation from '../../../template/src/systems/navigation'` | `createNavigationState`, `recomputeFlow`, `getFlowDir`, `hasLOS` |
| `systems/enemies` | `import * as enemies from '../../../template/src/systems/enemies'` | `initWaveState`, `tickWaves`, `tickEnemies`, `tickSeparation`, `tickContactDamage` |
| `systems/combat` | `import * as combat from '../../../template/src/systems/combat'` | `tickWeapons`, `tickProjectiles`, `tickPickups`, `spawnPickup`, `findNearestEnemy` |
| `systems/progression` | `import * as progression from '../../../template/src/systems/progression'` | `xpToNext`, `selectChoices`, `applyChange`, `weaponFromDef` |

**Design rules:**
- Systems declare their own state interfaces (e.g. `EnemyTickState`). Games satisfy them structurally — no monolithic `GameState` import.
- No module-level mutable state. Factory functions (`createNavigationState`, `createSpatialHash`) return state objects.
- All constants parameterized via config objects. No hardcoded magic numbers.
- Entity ID generation via `genId: () => string` parameter — games provide from their seeded PRNG.

## HUD update pattern

The game tick mutates state in place (see above). Zustand uses `Object.is` to detect changes, so same-reference mutations are invisible to `useSyncExternalStore` subscribers. This means React HUD components driven by Zustand will show stale values.

**Rule:** HUD elements that display per-frame values (HP, XP, timer, kills) must read state directly via `requestAnimationFrame` + DOM manipulation (refs + `.style` updates), not via React re-renders. This is the same approach used by screen-flash overlays in generated games — direct DOM manipulation bypassing React.

Example:

    function HealthBar() {
      const barRef = useRef<HTMLDivElement>(null)
      useEffect(() => {
        let raf: number
        const tick = () => {
          const { hp, maxHp } = gameStore.getState().player
          if (barRef.current) barRef.current.style.width = `${(hp / maxHp) * 100}%`
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
      }, [])
      return <div ref={barRef} className="health-bar" />
    }

Zustand `useStore()` is fine for infrequent state (pause, game-over, menu screens) — just not for values that change every tick.

## Why not ECS?

Miniplex and bitECS are available (see R3F research doc), but for a generated game the mutable-state-with-systems pattern is simpler to produce correctly. An LLM generating code against a typed `GameState` interface has a clear contract. ECS requires understanding archetypes, queries, and system ordering — more surface area for generation errors. If performance becomes an issue (thousands of entities), the state shape is already data-oriented enough to migrate the hot paths to bitECS without rewriting the game logic.
