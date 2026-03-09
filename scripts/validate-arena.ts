import { FLOOR, WALL, GATE, neighbors4 } from '../template/src/level/ca'
import type { ArenaConfig, ArenaResult } from '../template/src/level/ca'

type ValidationError = { check: string; message: string }

export function validateArena(result: ArenaResult, config: ArenaConfig): ValidationError[] {
  const errors: ValidationError[] = []
  const { grid, zoneMap, worldSize } = result
  const { zoneGrid, zones } = config

  // 1. Connectivity — flood-fill from spawn reaches all FLOOR cells
  const spawnIdx = findFirstFloor(grid, worldSize)
  if (spawnIdx < 0) {
    errors.push({ check: 'connectivity', message: 'No FLOOR cells found' })
    return errors
  }

  const reachable = new Uint8Array(grid.length)
  const queue = [spawnIdx]
  reachable[spawnIdx] = 1
  let reachCount = 1
  while (queue.length > 0) {
    const cur = queue.pop()!
    for (const n of neighbors4(cur, worldSize)) {
      if (!reachable[n] && grid[n] === FLOOR) {
        reachable[n] = 1
        reachCount++
        queue.push(n)
      }
    }
  }

  let totalFloor = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === FLOOR) totalFloor++
  }

  if (reachCount < totalFloor * 0.95) {
    errors.push({
      check: 'connectivity',
      message: `Only ${reachCount}/${totalFloor} floor cells reachable from spawn (${(reachCount / totalFloor * 100).toFixed(1)}%)`,
    })
  }

  // 2. Graph-map consistency — every graph edge = spatial adjacency on zone map
  const gridChunks = zoneGrid.length
  const adjacentZonePairs = new Set<string>()
  for (let cz = 0; cz < gridChunks; cz++) {
    for (let cx = 0; cx < gridChunks; cx++) {
      const z = zoneGrid[cz][cx]
      if (cx + 1 < gridChunks && zoneGrid[cz][cx + 1] !== z) {
        adjacentZonePairs.add(pairKey(z, zoneGrid[cz][cx + 1]))
      }
      if (cz + 1 < gridChunks && zoneGrid[cz + 1][cx] !== z) {
        adjacentZonePairs.add(pairKey(z, zoneGrid[cz + 1][cx]))
      }
    }
  }

  for (const b of config.boundaries) {
    const key = pairKey(b.zoneA, b.zoneB)
    if (!adjacentZonePairs.has(key)) {
      errors.push({
        check: 'graph-map-consistency',
        message: `Boundary ${b.zoneA}-${b.zoneB} (${b.type}) has no spatial adjacency in zone map`,
      })
    }
  }

  // 2b. Unintended adjacencies — spatially adjacent zone pairs not declared as boundaries
  const declaredPairs = new Set(config.boundaries.map(b => pairKey(b.zoneA, b.zoneB)))
  for (const pair of adjacentZonePairs) {
    if (!declaredPairs.has(pair)) {
      errors.push({
        check: 'unintended-adjacency',
        message: `Zones ${pair} are spatially adjacent but have no declared boundary`,
      })
    }
  }

  // 2c. Loop traversal — verify loopPath is walkable on actual grid
  if (config.loopPath && config.loopPath.length > 1) {
    for (let li = 0; li < config.loopPath.length - 1; li++) {
      const zA = config.loopPath[li]
      const zB = config.loopPath[li + 1]
      const startIdx = findFirstFloorInZone(grid, zoneMap, worldSize, zA)
      const goalIdx = findFirstFloorInZone(grid, zoneMap, worldSize, zB)
      if (startIdx < 0 || goalIdx < 0) {
        errors.push({
          check: 'loop-traversal',
          message: `Loop leg ${zA}->${zB}: no FLOOR cell in zone ${startIdx < 0 ? zA : zB}`,
        })
        continue
      }
      if (!bfsReachable(grid, worldSize, startIdx, goalIdx)) {
        errors.push({
          check: 'loop-traversal',
          message: `Loop leg ${zA}->${zB}: no path from zone ${zA} to zone ${zB}`,
        })
      }
    }
  }

  // 2d. Gate edge warning — no gates declared at all
  if ((!result.gates || result.gates.length === 0) && (!config.gateConfigs || config.gateConfigs.length === 0)) {
    errors.push({
      check: 'gate-warning',
      message: 'No gates declared — verify soft power gates are intentional',
    })
  }

  // 3. Navigable width — erode FLOOR by 1 cell, check connectivity holds
  const eroded = new Uint8Array(grid.length)
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== FLOOR) { eroded[i] = WALL; continue }
    let hasWallNeighbor = false
    for (const n of neighbors4(i, worldSize)) {
      if (grid[n] !== FLOOR) { hasWallNeighbor = true; break }
    }
    eroded[i] = hasWallNeighbor ? WALL : FLOOR
  }

  const erodedSpawn = findFirstFloor(eroded, worldSize)
  if (erodedSpawn >= 0) {
    const eReachable = new Uint8Array(grid.length)
    const eQueue = [erodedSpawn]
    eReachable[erodedSpawn] = 1
    let eCount = 1
    while (eQueue.length > 0) {
      const cur = eQueue.pop()!
      for (const n of neighbors4(cur, worldSize)) {
        if (!eReachable[n] && eroded[n] === FLOOR) {
          eReachable[n] = 1
          eCount++
          eQueue.push(n)
        }
      }
    }
    let eTotal = 0
    for (let i = 0; i < eroded.length; i++) {
      if (eroded[i] === FLOOR) eTotal++
    }
    if (eTotal > 0 && eCount < eTotal * 0.8) {
      errors.push({
        check: 'navigable-width',
        message: `Eroded map connectivity: only ${eCount}/${eTotal} cells connected (narrow passages may block)`,
      })
    }
  }

  // 4. Gate achievability
  if (result.gates) {
    for (const gate of result.gates) {
      const c = gate.condition
      if (c.type === 'timer' && c.seconds > 600) {
        errors.push({ check: 'gate-achievability', message: `Timer gate ${c.seconds}s exceeds 10min run duration` })
      }
      if (c.type === 'kills' && c.count > 5000) {
        errors.push({ check: 'gate-achievability', message: `Kill gate ${c.count} is unreasonably high` })
      }
    }
  }

  // 5. Traverse time estimate — full loop < 120s at base speed 5
  const chunkSize = config.chunkSize
  const totalCells = worldSize
  const estimatedDiagonal = totalCells * Math.SQRT2
  const baseSpeed = 5
  const estimatedTime = estimatedDiagonal / baseSpeed
  if (estimatedTime > 120) {
    errors.push({
      check: 'traverse-time',
      message: `Estimated traverse time ${estimatedTime.toFixed(0)}s exceeds 120s limit (worldSize=${worldSize})`,
    })
  }

  return errors
}

function findFirstFloor(grid: Uint8Array, worldSize: number): number {
  const center = Math.floor(worldSize / 2)
  const idx = center * worldSize + center
  if (grid[idx] === FLOOR) return idx
  for (let r = 1; r < worldSize; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue
        const x = center + dx, z = center + dz
        if (x < 0 || x >= worldSize || z < 0 || z >= worldSize) continue
        const i = z * worldSize + x
        if (grid[i] === FLOOR) return i
      }
    }
  }
  return -1
}

function findFirstFloorInZone(grid: Uint8Array, zoneMap: Uint8Array, worldSize: number, zone: number): number {
  const center = Math.floor(worldSize / 2)
  for (let r = 0; r < worldSize; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue
        const x = center + dx, z = center + dz
        if (x < 0 || x >= worldSize || z < 0 || z >= worldSize) continue
        const i = z * worldSize + x
        if (grid[i] === FLOOR && zoneMap[i] === zone) return i
      }
    }
  }
  return -1
}

function bfsReachable(grid: Uint8Array, worldSize: number, start: number, goal: number): boolean {
  const visited = new Uint8Array(grid.length)
  const queue = [start]
  visited[start] = 1
  while (queue.length > 0) {
    const cur = queue.pop()!
    if (cur === goal) return true
    for (const n of neighbors4(cur, worldSize)) {
      if (!visited[n] && grid[n] === FLOOR) {
        visited[n] = 1
        queue.push(n)
      }
    }
  }
  return false
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

if (require.main === module) {
  console.log('validate-arena.ts: import and call validateArena(result, config) programmatically')
  console.log('Returns ValidationError[] — empty array means all checks pass')
}
