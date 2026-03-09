import { FLOOR, WALL, GATE } from './ca'
import type { Gate, GateCondition, DestructibleBarrier } from './ca'

export type { Gate, GateCondition, DestructibleBarrier }

export function createGate(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  zoneA: number,
  zoneB: number,
  condition: GateCondition,
  width: number = 4,
): Gate | null {
  const candidates: number[] = []
  for (let z = 1; z < worldSize - 1; z++) {
    for (let x = 1; x < worldSize - 1; x++) {
      const idx = z * worldSize + x
      if (grid[idx] !== WALL) continue
      const z0 = zoneMap[idx]
      if (z0 !== zoneA && z0 !== zoneB) continue
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz
        if (nx < 0 || nx >= worldSize || nz < 0 || nz >= worldSize) continue
        const nIdx = nz * worldSize + nx
        const z1 = zoneMap[nIdx]
        if ((z0 === zoneA && z1 === zoneB) || (z0 === zoneB && z1 === zoneA)) {
          candidates.push(idx)
          break
        }
      }
    }
  }

  if (candidates.length < width) return null

  const start = Math.floor(candidates.length / 2) - Math.floor(width / 2)
  const cells = candidates.slice(start, start + width)
  for (const cell of cells) {
    grid[cell] = GATE
  }
  return { cells, condition, open: false, zoneA, zoneB }
}

export function checkGate(
  gate: Gate,
  gameState: { elapsed: number; kills: number; bossesKilled: string[] },
): boolean {
  if (gate.open) return true
  const c = gate.condition
  switch (c.type) {
    case 'timer': return gameState.elapsed >= c.seconds
    case 'kills': return gameState.kills >= c.count
    case 'boss': return gameState.bossesKilled.includes(c.bossType)
  }
}

export function openGate(gate: Gate, grid: Uint8Array): void {
  for (const cell of gate.cells) {
    grid[cell] = FLOOR
  }
  gate.open = true
}

export function createDestructibleBarrier(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  zoneA: number,
  zoneB: number,
  health: number,
  width: number = 6,
): DestructibleBarrier | null {
  const candidates: number[] = []
  for (let z = 1; z < worldSize - 1; z++) {
    for (let x = 1; x < worldSize - 1; x++) {
      const idx = z * worldSize + x
      if (grid[idx] !== WALL) continue
      const z0 = zoneMap[idx]
      if (z0 !== zoneA && z0 !== zoneB) continue
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz
        if (nx < 0 || nx >= worldSize || nz < 0 || nz >= worldSize) continue
        const nIdx = nz * worldSize + nx
        const z1 = zoneMap[nIdx]
        if ((z0 === zoneA && z1 === zoneB) || (z0 === zoneB && z1 === zoneA)) {
          candidates.push(idx)
          break
        }
      }
    }
  }

  if (candidates.length < width) return null

  const start = Math.floor(candidates.length / 2) - Math.floor(width / 2)
  const cells = candidates.slice(start, start + width)
  for (const cell of cells) {
    grid[cell] = GATE
  }
  return { cells, health, maxHealth: health, zoneA, zoneB }
}

export function damageBarrier(barrier: DestructibleBarrier, amount: number): boolean {
  barrier.health = Math.max(0, barrier.health - amount)
  return barrier.health <= 0
}

export function destroyBarrier(barrier: DestructibleBarrier, grid: Uint8Array): void {
  for (const cell of barrier.cells) {
    grid[cell] = FLOOR
  }
}
