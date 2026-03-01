import { createStore } from 'zustand/vanilla'
import type { GameState } from './types'
import type { EnemyState } from '../../../template/src/systems/types'
import * as grid from '../../../template/src/systems/grid'
import * as nav from '../../../template/src/systems/navigation'
import * as spatial from '../../../template/src/systems/spatial'
import * as enemies from '../../../template/src/systems/enemies'
import { generateCA, WALL, FLOOR } from '../../../template/src/level/ca'
import * as profile from '../../../template/src/profile'

export const WORLD_SIZE = 64
export const CELL_SIZE = 2

const levelGrid = generateCA(WORLD_SIZE, 0.12, 3, 42)

for (let i = 0; i < WORLD_SIZE; i++) {
  levelGrid[i] = WALL
  levelGrid[(WORLD_SIZE - 1) * WORLD_SIZE + i] = WALL
  levelGrid[i * WORLD_SIZE] = WALL
  levelGrid[i * WORLD_SIZE + WORLD_SIZE - 1] = WALL
}

const center = WORLD_SIZE >> 1
for (let dz = -4; dz <= 4; dz++)
  for (let dx = -4; dx <= 4; dx++)
    levelGrid[(center + dz) * WORLD_SIZE + (center + dx)] = FLOOR

export { levelGrid }

export const navState = nav.createNavigationState(WORLD_SIZE, WORLD_SIZE * WORLD_SIZE)
const navConfig: nav.NavigationConfig = {
  maxFlowDepth: 200,
  flowRecomputeDist: 1,
  losRange: 10,
}

export const hash = spatial.createSpatialHash<EnemyState>({
  cellSize: CELL_SIZE,
  worldSize: WORLD_SIZE,
})

const enemyConfig: enemies.EnemyConfig = {
  worldSize: WORLD_SIZE,
  despawnDist: 999,
  spawnRadius: 15,
  losRange: 10,
  contactInvuln: 1,
  separationForce: 8,
}

let nextId = 0
function genId(): string { return `e${nextId++}` }

function randomFloorPos(): [number, number, number] | null {
  for (let i = 0; i < 100; i++) {
    const x = 1 + Math.floor(Math.random() * (WORLD_SIZE - 2))
    const z = 1 + Math.floor(Math.random() * (WORLD_SIZE - 2))
    if (levelGrid[z * WORLD_SIZE + x] === FLOOR)
      return [x + 0.5, 0.4, z + 0.5]
  }
  return null
}

const initialEnemies = new Map<string, EnemyState>()
const initialTargets = new Map<string, [number, number]>()
for (let i = 0; i < 200; i++) {
  const pos = randomFloorPos()
  if (!pos) continue
  const id = genId()
  initialEnemies.set(id, {
    id, type: 'basic', position: pos,
    health: 10, maxHealth: 10,
    speed: 3, damage: 1, size: 0.8, xpValue: 1,
  })
  const t = randomFloorPos()
  if (t) initialTargets.set(id, [t[0], t[2]])
}

export const gameStore = createStore<GameState>(() => ({
  player: {
    id: 'player',
    position: [center + 0.5, 0.5, center + 0.5],
    health: 100, speed: 6, invulnTimer: 0,
  },
  enemies: initialEnemies,
  level: { grid: levelGrid },
  wave: { waveIndex: 0, waveElapsed: 0, accumulators: [], complete: true },
  paused: false,
  run: { elapsed: 0 },
  debug: {
    showFlow: false, showGrid: false, showSeparation: false,
    separationEnabled: true, enemyMode: 'chase',
  },
  wanderTargets: initialTargets,
  stats: { fps: 60, enemyCount: initialEnemies.size },
}))

let fpsFrames = 0
let fpsAccum = 0

export function tick(dt: number) {
  if (__PROFILE__) profile.start('tick')
  const state = gameStore.getState()
  if (state.paused) { if (__PROFILE__) profile.stop('tick'); return }
  state.run.elapsed += dt

  fpsAccum += dt
  fpsFrames++
  if (fpsAccum >= 0.5) {
    state.stats.fps = Math.round(fpsFrames / fpsAccum)
    fpsFrames = 0; fpsAccum = 0
  }

  nav.recomputeFlow(navState, state.player.position, levelGrid, navConfig)

  if (state.debug.enemyMode === 'chase') {
    enemies.tickEnemies(state, dt, navState, enemyConfig)
  } else {
    tickWander(state, dt)
  }

  hash.rebuild(state.enemies.values(), e => e.position)

  if (state.debug.separationEnabled) {
    enemies.tickSeparation(state, dt, hash, enemyConfig)
  }

  state.stats.enemyCount = state.enemies.size
  if (__PROFILE__) profile.stop('tick')
  if (__PROFILE__) profile.frame()
}

function tickWander(state: GameState, dt: number) {
  for (const [id, enemy] of state.enemies) {
    let target = state.wanderTargets.get(id)
    if (!target) {
      const p = randomFloorPos()
      if (p) { target = [p[0], p[2]]; state.wanderTargets.set(id, target) }
      else continue
    }
    const dx = target[0] - enemy.position[0]
    const dz = target[1] - enemy.position[2]
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < 1.5) {
      const p = randomFloorPos()
      if (p) state.wanderTargets.set(id, [p[0], p[2]])
      continue
    }
    const mx = dx / dist, mz = dz / dist
    const speed = enemy.speed * dt
    const nx = enemy.position[0] + mx * speed
    const nz = enemy.position[2] + mz * speed
    if (grid.isFloor(levelGrid, nx, nz, WORLD_SIZE)) {
      enemy.position[0] = nx; enemy.position[2] = nz
    } else if (grid.isFloor(levelGrid, nx, enemy.position[2], WORLD_SIZE)) {
      enemy.position[0] = nx
    } else if (grid.isFloor(levelGrid, enemy.position[0], nz, WORLD_SIZE)) {
      enemy.position[2] = nz
    }
  }
}

export function spawnEnemies(count: number) {
  const state = gameStore.getState()
  for (let i = 0; i < count; i++) {
    const pos = randomFloorPos()
    if (!pos) continue
    const id = genId()
    state.enemies.set(id, {
      id, type: 'basic', position: pos,
      health: 10, maxHealth: 10,
      speed: 3, damage: 1, size: 0.8, xpValue: 1,
    })
    const t = randomFloorPos()
    if (t) state.wanderTargets.set(id, [t[0], t[2]])
  }
}

export function removeEnemies(count: number) {
  const state = gameStore.getState()
  let removed = 0
  for (const id of state.enemies.keys()) {
    if (removed >= count) break
    state.enemies.delete(id)
    state.wanderTargets.delete(id)
    removed++
  }
}
