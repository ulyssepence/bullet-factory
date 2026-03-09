import * as t from './types'
import * as grid from './grid'
import * as nav from './navigation'
import type { NavigationState } from './navigation'
import type { SpatialHash } from './spatial'
import type { ZoneDef } from '../level/ca'
import { getZoneAtCell, getEnemyPool, getSpeedAt } from '../level/zones'

export interface EnemyConfig {
  worldSize: number
  despawnDist: number
  spawnRadius: number
  losRange: number
  contactInvuln: number
  separationForce: number
}

export interface EnemyDef {
  type: string
  health: number
  speed: number
  damage: number
  size: number
  xpValue: number
}

export interface WaveDef {
  duration: number
  spawns: { enemyType: string; count: number }[]
}

export interface EnemyTickState {
  player: { position: [number, number, number]; health: number; invulnTimer: number }
  enemies: Map<string, t.EnemyState>
  level: {
    grid: Uint8Array
    zoneMap?: Uint8Array
    speedGrid?: Float32Array
    zones?: ZoneDef[]
  }
  wave: t.WaveDirectorState
}

export interface ContactDamageCallbacks {
  onPlayerHit?: (damage: number) => void
}

export function initWaveState(waves: WaveDef[]): t.WaveDirectorState {
  const first = waves[0]
  return {
    waveIndex: 0,
    waveElapsed: 0,
    accumulators: first
      ? first.spawns.map(s => ({ enemyType: s.enemyType, count: s.count, spawned: 0 }))
      : [],
    complete: !first,
  }
}

export function tickWaves(
  state: EnemyTickState,
  dt: number,
  waves: WaveDef[],
  enemyDefs: EnemyDef[],
  genId: () => string,
  config: EnemyConfig,
): void {
  const dir = state.wave
  if (dir.complete) return
  const wave = waves[dir.waveIndex]
  if (!wave) { dir.complete = true; return }

  dir.waveElapsed += dt
  const progress = Math.min(dir.waveElapsed / wave.duration, 1)

  const { zoneMap, zones } = state.level

  for (const acc of dir.accumulators) {
    const target = Math.floor(progress * acc.count)
    while (acc.spawned < target) {
      let pos: [number, number, number] | null = null
      let chosenType = acc.enemyType

      for (let attempt = 0; attempt < 5; attempt++) {
        pos = spawnPosition(state.player.position, state.level.grid, config.worldSize, config.spawnRadius)
        if (!pos) continue

        if (zoneMap && zones) {
          const zone = getZoneAtCell(zoneMap, config.worldSize, pos[0], pos[2])
          const pool = getEnemyPool(zones, zone)
          if (pool.length > 0 && !pool.includes(acc.enemyType)) {
            chosenType = pool[Math.floor(Math.random() * pool.length)]
          }
        }
        break
      }

      if (!pos) { acc.spawned++; continue }
      const def = enemyDefs.find(e => e.type === chosenType)
      if (!def) { acc.spawned++; continue }
      const id = genId()
      state.enemies.set(id, {
        id, type: def.type, position: pos,
        health: def.health, maxHealth: def.health,
        speed: def.speed, damage: def.damage, size: def.size, xpValue: def.xpValue,
      })
      acc.spawned++
    }
  }

  if (dir.waveElapsed >= wave.duration) {
    dir.waveIndex++
    if (dir.waveIndex < waves.length) {
      const next = waves[dir.waveIndex]
      dir.waveElapsed = 0
      dir.accumulators = next.spawns.map(s => ({ enemyType: s.enemyType, count: s.count, spawned: 0 }))
    } else {
      dir.complete = true
    }
  }
}

export function spawnPosition(
  playerPos: [number, number, number],
  levelGrid: Uint8Array,
  worldSize: number,
  spawnRadius: number,
): [number, number, number] | null {
  const angle = Math.random() * Math.PI * 2
  for (let attempt = 0; attempt < 10; attempt++) {
    const r = spawnRadius + Math.random() * 5
    const x = playerPos[0] + Math.cos(angle + attempt * 0.6) * r
    const z = playerPos[2] + Math.sin(angle + attempt * 0.6) * r
    if (grid.isFloor(levelGrid, x, z, worldSize)) {
      return [grid.wrapCoord(x, worldSize), 0.5, grid.wrapCoord(z, worldSize)]
    }
  }
  return null
}

export function tickEnemies(
  state: EnemyTickState,
  dt: number,
  navState: NavigationState,
  config: EnemyConfig,
): void {
  const playerPos = state.player.position
  const levelGrid = state.level.grid
  const ws = config.worldSize

  for (const [id, enemy] of state.enemies) {
    const dx = grid.shortestWrapped(playerPos[0], enemy.position[0], ws)
    const dz = grid.shortestWrapped(playerPos[2], enemy.position[2], ws)
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist > config.despawnDist) { state.enemies.delete(id); continue }

    let mx = 0, mz = 0

    if (dist > 0.3 && dist < config.losRange &&
        nav.hasLOS(levelGrid, ws, enemy.position[0], enemy.position[2], playerPos[0], playerPos[2])) {
      mx = dx / dist; mz = dz / dist
    } else if (dist > 0.3) {
      const [fdx, fdz] = nav.getFlowDir(navState, Math.floor(enemy.position[0]), Math.floor(enemy.position[2]))
      if (fdx !== 0 || fdz !== 0) {
        const flen = Math.sqrt(fdx * fdx + fdz * fdz)
        mx = fdx / flen; mz = fdz / flen
      } else {
        mx = dx / dist; mz = dz / dist
      }
    }

    const speedMod = state.level.speedGrid
      ? getSpeedAt(state.level.speedGrid, ws, enemy.position[0], enemy.position[2])
      : 1
    const speed = enemy.speed * speedMod * dt
    const nx = enemy.position[0] + mx * speed
    const nz = enemy.position[2] + mz * speed

    if (grid.isFloor(levelGrid, nx, nz, ws)) {
      enemy.position[0] = grid.wrapCoord(nx, ws)
      enemy.position[2] = grid.wrapCoord(nz, ws)
    } else if (grid.isFloor(levelGrid, nx, enemy.position[2], ws)) {
      enemy.position[0] = grid.wrapCoord(nx, ws)
    } else if (grid.isFloor(levelGrid, enemy.position[0], nz, ws)) {
      enemy.position[2] = grid.wrapCoord(nz, ws)
    }
  }
}

export function tickSeparation(
  state: EnemyTickState,
  dt: number,
  hash: SpatialHash<t.EnemyState>,
  config: EnemyConfig,
): void {
  const levelGrid = state.level.grid
  const ws = config.worldSize

  for (const enemy of state.enemies.values()) {
    let px = 0, pz = 0

    hash.forEachNeighbor(enemy.position[0], enemy.position[2], (other) => {
      if (other === enemy) return
      const ex = grid.shortestWrapped(enemy.position[0], other.position[0], ws)
      const ez = grid.shortestWrapped(enemy.position[2], other.position[2], ws)
      const d = Math.sqrt(ex * ex + ez * ez)
      const minD = (enemy.size + other.size) * 0.4
      if (d < minD && d > 0.01) {
        const overlap = minD - d
        px += (ex / d) * overlap
        pz += (ez / d) * overlap
      }
    })

    if (px !== 0 || pz !== 0) {
      const nx = enemy.position[0] + px * config.separationForce * dt
      const nz = enemy.position[2] + pz * config.separationForce * dt
      if (grid.isFloor(levelGrid, nx, nz, ws)) {
        enemy.position[0] = grid.wrapCoord(nx, ws)
        enemy.position[2] = grid.wrapCoord(nz, ws)
      }
    }
  }
}

export function tickContactDamage(
  state: EnemyTickState,
  dt: number,
  config: EnemyConfig,
  callbacks?: ContactDamageCallbacks,
): void {
  if (state.player.invulnTimer > 0) {
    state.player.invulnTimer = Math.max(0, state.player.invulnTimer - dt)
    return
  }
  const pp = state.player.position
  const ws = config.worldSize
  for (const enemy of state.enemies.values()) {
    const dx = grid.shortestWrapped(enemy.position[0], pp[0], ws)
    const dz = grid.shortestWrapped(enemy.position[2], pp[2], ws)
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < enemy.size * 0.5 + 0.3) {
      state.player.health -= enemy.damage
      state.player.invulnTimer = config.contactInvuln
      callbacks?.onPlayerHit?.(enemy.damage)
      break
    }
  }
}
