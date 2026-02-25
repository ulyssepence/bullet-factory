# Spawn Waves

Data-driven wave spawning. A level defines a sequence of waves, each wave defines what enemies to spawn and over how long. The runtime distributes spawns evenly across the wave duration using accumulator math — no interval timers.

## Data types

```ts
interface WaveSpawn {
  enemyType: EnemyType
  count: number
}

interface Wave {
  duration: number    // seconds
  spawns: WaveSpawn[]
}

interface LevelWaves {
  waves: Wave[]
}
```

A `LevelWaves` is a complete level definition. Drop it in a `levels/` module or inline it in the game config.

## Runtime state

```ts
interface SpawnAccumulator {
  enemyType: EnemyType
  count: number       // total to spawn this wave
  spawned: number     // how many have been spawned so far
}

interface WaveDirectorState {
  waveIndex: number
  waveElapsed: number
  accumulators: SpawnAccumulator[]
  complete: boolean
}
```

When a new wave starts, build `accumulators` from the wave's `spawns` array (copy `enemyType` and `count`, set `spawned` to 0). Reset `waveElapsed` to 0.

## System tick

```ts
function tickWaveDirector(state: GameState, dt: number, level: LevelWaves): GameEvent[] {
  const dir = state.wave
  if (dir.complete) return []

  const wave = level.waves[dir.waveIndex]
  if (!wave) { dir.complete = true; return [] }

  dir.waveElapsed += dt
  const progress = Math.min(dir.waveElapsed / wave.duration, 1)
  const events: GameEvent[] = []

  for (const acc of dir.accumulators) {
    const target = Math.floor(progress * acc.count)
    while (acc.spawned < target) {
      const position = spawnPosition(state)
      events.push({
        type: 'ENEMY_SPAWNED',
        enemyId: genId(),
        enemyType: acc.enemyType,
        position
      })
      acc.spawned++
    }
  }

  if (dir.waveElapsed >= wave.duration) {
    dir.waveIndex++
    if (dir.waveIndex < level.waves.length) {
      const next = level.waves[dir.waveIndex]
      dir.waveElapsed = 0
      dir.accumulators = next.spawns.map(s => ({
        enemyType: s.enemyType,
        count: s.count,
        spawned: 0
      }))
    } else {
      dir.complete = true
    }
  }

  return events
}
```

The key line is `Math.floor(progress * acc.count)`. At 50% through a wave that should spawn 20 walkers, `target` is 10. If only 8 have spawned, the loop spawns 2 more. This naturally spreads spawns across the wave and self-corrects if frames are dropped.

## Spawn positioning

Place enemies outside the player's view but inside the arena, on walkable cells. See `patterns/level-generation.md` for the collision grid and chunk activation ring.

Pick a random position on the perimeter of the active chunk ring, then verify it's a floor cell in the collision grid. If it's a wall, try adjacent cells. After 5 failed attempts, pick a random floor cell on the ring border.

```ts
function spawnPosition(state: GameState, collisionGrid: Uint8Array, gridWidth: number): [number, number, number] {
  const angle = Math.random() * Math.PI * 2
  const radius = 18
  const p = state.player.position
  for (let attempt = 0; attempt < 5; attempt++) {
    const x = p.x + Math.cos(angle + attempt * 0.3) * radius
    const z = p.z + Math.sin(angle + attempt * 0.3) * radius
    const cellX = Math.floor(x) % gridWidth
    const cellZ = Math.floor(z) % gridWidth
    if (collisionGrid[cellZ * gridWidth + cellX] === 0) {
      return [x, 0, z]
    }
  }
  // Fallback: find any floor cell on the ring perimeter
  return findFloorCellOnPerimeter(state, collisionGrid, gridWidth)
}
```

## Example level

```ts
const level: LevelWaves = {
  waves: [
    {
      duration: 30,
      spawns: [
        { enemyType: 'walker', count: 15 }
      ]
    },
    {
      duration: 45,
      spawns: [
        { enemyType: 'walker', count: 25 },
        { enemyType: 'runner', count: 8 }
      ]
    },
    {
      duration: 60,
      spawns: [
        { enemyType: 'walker', count: 30 },
        { enemyType: 'runner', count: 15 },
        { enemyType: 'tank', count: 4 }
      ]
    }
  ]
}
```

## Migration note

The existing `WaveDirector` interface in `types.ts` (timer-based with `spawnTimer` and `baseSpawnCount`) should be replaced with `WaveDirectorState` when implementing this pattern. The `wave` field on `GameState` changes shape from `WaveDirector` to `WaveDirectorState`.
