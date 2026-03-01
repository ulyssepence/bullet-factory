import {
  ArenaConfig, ArenaResult, FLOOR, WALL, HAZARD,
  mulberry32, neighbors4, neighbors8,
  generateCA, generateCAPadded, postProcessCA, stampMotif,
} from './ca'
import * as corridor from './corridor'

export { FLOOR, WALL, HAZARD, DEMO_CONFIG } from './ca'
export type { ArenaConfig, ArenaResult } from './ca'

// Tiny 12x12 grid with one L-shaped wall blob. No border walls.
export function makeDebugArena(seed: number = 42): ArenaResult {
  const worldSize = 12
  const grid = new Uint8Array(worldSize * worldSize).fill(FLOOR)
  const zoneMap = new Uint8Array(worldSize * worldSize)
  const motifMask = new Uint8Array(worldSize * worldSize)

  // L-shaped wall: rows 3-8, cols 3-7, with top-right corner cut out
  for (let z = 3; z <= 8; z++) {
    for (let x = 3; x <= 7; x++) {
      grid[z * worldSize + x] = WALL
    }
  }
  // Cut top-right to make the L (concave corner)
  for (let z = 3; z <= 5; z++) {
    for (let x = 6; x <= 7; x++) {
      grid[z * worldSize + x] = FLOOR
    }
  }

  let floorCount = 0
  for (let i = 0; i < grid.length; i++) if (grid[i] === FLOOR) floorCount++

  return {
    grid, zoneMap, motifMask, worldSize,
    stats: {
      worldSize,
      density: 1 - floorCount / (worldSize * worldSize),
      connected: true,
      motifCells: 0,
      chunkCount: 1,
    },
  }
}

export function assembleArenaV2(config: ArenaConfig): ArenaResult {
  const { zoneGrid, zones, boundaries, corridors, chunkSize, caIterations, seed } = config
  const gridChunks = zoneGrid.length
  const worldSize = gridChunks * chunkSize
  const grid = new Uint8Array(worldSize * worldSize)
  const zoneMap = new Uint8Array(worldSize * worldSize)
  const motifMask = new Uint8Array(worldSize * worldSize)

  const masterRng = mulberry32(seed)

  for (let cz = 0; cz < gridChunks; cz++) {
    for (let cx = 0; cx < gridChunks; cx++) {
      const zoneIdx = zoneGrid[cz][cx]
      const zone = zones[zoneIdx]
      const chunkSeed = (masterRng() * 0xffffffff) | 0
      const chunkRng = mulberry32(chunkSeed)

      const ox = cx * chunkSize
      const oz = cz * chunkSize
      for (let lz = 0; lz < chunkSize; lz++) {
        for (let lx = 0; lx < chunkSize; lx++) {
          zoneMap[(oz + lz) * worldSize + (ox + lx)] = zoneIdx
        }
      }

      const chunk = generateCAPadded(chunkSize, zone.density, caIterations, (chunkSeed) | 0)

      // Copy chunk into world grid
      for (let lz = 0; lz < chunkSize; lz++) {
        for (let lx = 0; lx < chunkSize; lx++) {
          grid[(oz + lz) * worldSize + (ox + lx)] = chunk[lz * chunkSize + lx]
        }
      }

      // Stamp motif
      if (zone.motifs.length > 0) {
        const motif = zone.motifs[Math.floor(chunkRng() * zone.motifs.length)]
        const motifW = motif[0].length
        const motifH = motif.length
        const centerX = ox + ((chunkSize - motifW) >> 1)
        const centerZ = oz + ((chunkSize - motifH) >> 1)
        const offsetX = Math.floor(chunkRng() * 9) - 4
        const offsetZ = Math.floor(chunkRng() * 9) - 4
        const mx = centerX + offsetX
        const mz = centerZ + offsetZ
        if (mx >= ox + 2 && mx + motifW <= ox + chunkSize - 2 &&
            mz >= oz + 2 && mz + motifH <= oz + chunkSize - 2) {
          stampMotif(grid, worldSize, motif, mx, mz, motifMask)
        }
      }
    }
  }

  // No corridor clearing — border flood fill handles connectivity

  // Boundary overlays (same as original)
  for (const b of boundaries) {
    for (let cz = 0; cz < gridChunks; cz++) {
      for (let cx = 0; cx < gridChunks; cx++) {
        const thisZone = zoneGrid[cz][cx]
        if (thisZone !== b.zoneA && thisZone !== b.zoneB) continue
        const adjacentToOther = (
          [[cz - 1, cx], [cz + 1, cx], [cz, cx - 1], [cz, cx + 1]] as [number, number][]
        ).some(([nz, nx]) =>
          nz >= 0 && nz < gridChunks && nx >= 0 && nx < gridChunks &&
          zoneGrid[nz][nx] !== thisZone &&
          (zoneGrid[nz][nx] === b.zoneA || zoneGrid[nz][nx] === b.zoneB)
        )
        if (!adjacentToOther) continue

        const ox = cx * chunkSize
        const oz = cz * chunkSize

        if (b.type === 'dense') {
          const zone = zones[thisZone]
          const denseSeed = (seed + cz * 100 + cx) | 0
          const denseChunk = generateCA(chunkSize, zone.density * 1.5, caIterations, denseSeed)
          postProcessCA(denseChunk, chunkSize)
          for (let lz = 0; lz < chunkSize; lz++) {
            for (let lx = 0; lx < chunkSize; lx++) {
              const idx = (oz + lz) * worldSize + (ox + lx)
              if (!motifMask[idx]) {
                grid[idx] = denseChunk[lz * chunkSize + lx]
              }
            }
          }
        } else if (b.type === 'river' || b.type === 'hazard') {
          const bRng = mulberry32(seed + cz * 50 + cx)
          for (const [nz, nx] of [[cz - 1, cx], [cz + 1, cx], [cz, cx - 1], [cz, cx + 1]] as [number, number][]) {
            if (nz < 0 || nz >= gridChunks || nx < 0 || nx >= gridChunks) continue
            const neighborZone = zoneGrid[nz][nx]
            if (neighborZone === thisZone) continue
            if (neighborZone !== b.zoneA && neighborZone !== b.zoneB) continue

            const isVertical = nz === cz
            const isNeg = nx < cx || nz < cz
            for (let i = 0; i < chunkSize; i++) {
              if (b.type === 'river' && Math.floor(bRng() * 8) === 0) continue
              let gx: number, gz: number
              if (isVertical) {
                gx = isNeg ? ox : ox + chunkSize - 1
                gz = oz + i
              } else {
                gx = ox + i
                gz = isNeg ? oz : oz + chunkSize - 1
              }
              const idx = gz * worldSize + gx
              if (!motifMask[idx]) grid[idx] = HAZARD
            }
          }
        }
      }
    }
  }

  // World-edge wall border (thick so contours close before the grid edge)
  const edgeThickness = 5
  const carveMargin = 2 // corridors/vaults may carve up to 2 cells from edge (keeps outermost wall intact)
  for (let t = 0; t < edgeThickness; t++) {
    for (let i = 0; i < worldSize; i++) {
      grid[t * worldSize + i] = WALL                           // top rows
      grid[(worldSize - 1 - t) * worldSize + i] = WALL        // bottom rows
      grid[i * worldSize + t] = WALL                           // left cols
      grid[i * worldSize + worldSize - 1 - t] = WALL          // right cols
    }
  }

  // Global flood fill — keep largest connected FLOOR component
  // Runs before corridors so corridors carve into final terrain and can't be severed
  const visited = new Uint8Array(worldSize * worldSize)
  let largestComponent: number[] = []

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== FLOOR || visited[i]) continue
    const component: number[] = []
    const queue = [i]
    visited[i] = 1
    while (queue.length > 0) {
      const cur = queue.pop()!
      component.push(cur)
      for (const n of neighbors4(cur, worldSize)) {
        if (!visited[n] && grid[n] === FLOOR) {
          visited[n] = 1
          queue.push(n)
        }
      }
    }
    if (component.length > largestComponent.length) {
      largestComponent = component
    }
  }

  let totalFloor = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === FLOOR) totalFloor++
  }

  const keep = new Uint8Array(grid.length)
  for (const idx of largestComponent) keep[idx] = 1
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === FLOOR && !keep[i]) grid[i] = WALL
  }
  const connected = totalFloor === 0 || largestComponent.length / totalFloor > 0.95

  // Corridor pipeline (after flood fill so corridors persist)
  // One landmark per chunk, connected to grid-adjacent neighbors
  const landmarks = corridor.placeZoneLandmarks(grid, zoneMap, worldSize, zones, chunkSize, zoneGrid, seed)

  // MST + 30% extra edges (fewer than full grid-adjacency, but guaranteed connected)
  const edgeRng = mulberry32(seed + 55331)
  const chunkEdges = corridor.buildMSTEdges(landmarks, 1.3, edgeRng, gridChunks)

  // Compute entrance angles per landmark from actual corridor edges
  const entranceAnglesPerLandmark: number[][] = landmarks.map(() => [])
  for (const e of chunkEdges) {
    const a = landmarks[e.from], b = landmarks[e.to]
    if (!a || !b) continue
    entranceAnglesPerLandmark[e.from].push(Math.atan2(b.z - a.z, b.x - a.x))
    entranceAnglesPerLandmark[e.to].push(Math.atan2(a.z - b.z, a.x - b.x))
  }
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i]
    const angles = entranceAnglesPerLandmark[i]
    corridor.stampVault(grid, worldSize, lm.x, lm.z, 12, carveMargin, angles.length > 0 ? angles : undefined)
  }
  corridor.carveCorridors(grid, worldSize, landmarks, chunkEdges, seed, carveMargin)
  corridor.connectOrphanCaves(grid, worldSize)

  // Noise-warped zone boundaries
  const maxWarp = chunkSize >> 3 // 4 cells
  const zoneBuf = new Uint8Array(zoneMap)
  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const idx = z * worldSize + x
      const myZone = zoneMap[idx]
      let nearBoundary = false
      for (let dz = -maxWarp; dz <= maxWarp && !nearBoundary; dz++) {
        for (let dx = -maxWarp; dx <= maxWarp && !nearBoundary; dx++) {
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nx >= worldSize || nz < 0 || nz >= worldSize) continue
          if (zoneMap[nz * worldSize + nx] !== myZone) nearBoundary = true
        }
      }
      if (!nearBoundary) continue

      const h = mulberry32(x * 7919 + z * 104729 + seed)
      const dispX = Math.floor((h() - 0.5) * 2 * maxWarp)
      const dispZ = Math.floor((h() - 0.5) * 2 * maxWarp)
      const srcX = Math.max(0, Math.min(worldSize - 1, x + dispX))
      const srcZ = Math.max(0, Math.min(worldSize - 1, z + dispZ))
      zoneBuf[idx] = zoneMap[srcZ * worldSize + srcX]
    }
  }
  zoneMap.set(zoneBuf)

  // Reassign WALL cell zones from nearest FLOOR neighbor (BFS)
  // so wall colors match their visual neighborhood, not chunk origin
  const wallQueue: number[] = []
  const wallVisited = new Uint8Array(grid.length)
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === FLOOR) {
      wallVisited[i] = 1
      for (const n of neighbors4(i, worldSize)) {
        if (grid[n] !== FLOOR && !wallVisited[n]) {
          wallVisited[n] = 1
          zoneMap[n] = zoneMap[i]
          wallQueue.push(n)
        }
      }
    }
  }
  while (wallQueue.length > 0) {
    const cur = wallQueue.shift()!
    for (const n of neighbors4(cur, worldSize)) {
      if (!wallVisited[n]) {
        wallVisited[n] = 1
        zoneMap[n] = zoneMap[cur]
        wallQueue.push(n)
      }
    }
  }

  if (config.spawnPoint) {
    const [cx, cz] = config.spawnPoint
    const r = 4
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue
        const idx = (cz + dz) * worldSize + (cx + dx)
        if (idx >= 0 && idx < grid.length) grid[idx] = FLOOR
      }
    }
  }

  let floorCount = 0
  let motifCells = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === FLOOR) floorCount++
    if (motifMask[i]) motifCells++
  }

  return {
    grid,
    zoneMap,
    motifMask,
    worldSize,
    stats: {
      worldSize,
      density: 1 - floorCount / (worldSize * worldSize),
      connected,
      motifCells,
      chunkCount: gridChunks * gridChunks,
    },
  }
}
