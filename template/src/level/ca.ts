export const FLOOR = 0
export const WALL = 1
export const HAZARD = 2

export type ZoneDef = {
  density: number
  motifs: string[][]
  hue: number
}

export type BoundaryDef = {
  zoneA: number
  zoneB: number
  type: 'dense' | 'river' | 'hazard'
}

export type ArenaConfig = {
  zoneGrid: number[][]
  zones: ZoneDef[]
  boundaries: BoundaryDef[]
  corridors?: { from: number; to: number }[]
  chunkSize: number
  caIterations: number
  seed: number
}

export type ArenaResult = {
  grid: Uint8Array
  zoneMap: Uint8Array
  motifMask: Uint8Array
  worldSize: number
  stats: {
    worldSize: number
    density: number
    connected: boolean
    motifCells: number
    chunkCount: number
  }
}

export function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function neighbors4(idx: number, size: number): number[] {
  const x = idx % size
  const y = (idx / size) | 0
  const out: number[] = []
  if (y > 0) out.push(idx - size)
  if (y < size - 1) out.push(idx + size)
  if (x > 0) out.push(idx - 1)
  if (x < size - 1) out.push(idx + 1)
  return out
}

export function neighbors8(idx: number, size: number): number[] {
  const x = idx % size
  const y = (idx / size) | 0
  const out: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        out.push(ny * size + nx)
      }
    }
  }
  return out
}

export function generateCA(size: number, density: number, iterations: number, seed: number): Uint8Array {
  const rng = mulberry32(seed)
  const grid = new Uint8Array(size * size)
  // density (0.12-0.25) → initial wall probability for B5678/S45678
  // ~45% initial fill gives nice caves; scale density into that range
  const wallProb = 0.30 + density * 0.8
  for (let i = 0; i < grid.length; i++) {
    grid[i] = rng() < wallProb ? WALL : FLOOR
  }
  const buf = new Uint8Array(size * size)
  for (let iter = 0; iter < iterations; iter++) {
    buf.set(grid)
    for (let i = 0; i < grid.length; i++) {
      const ns = neighbors8(i, size)
      let walls = 0
      for (const n of ns) walls += buf[n] === WALL ? 1 : 0
      // B5678/S45678
      if (buf[i] === WALL) {
        grid[i] = walls >= 4 ? WALL : FLOOR
      } else {
        grid[i] = walls >= 5 ? WALL : FLOOR
      }
    }
  }
  return grid
}

export function generateCAPadded(size: number, density: number, iterations: number, seed: number): Uint8Array {
  const pad = 2
  const padded = size + pad * 2
  const full = generateCA(padded, density, iterations, seed)
  const cropped = new Uint8Array(size * size)
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      cropped[z * size + x] = full[(z + pad) * padded + (x + pad)]
    }
  }
  return cropped
}

export function postProcessCA(grid: Uint8Array, size: number): boolean {
  // Clear borders so chunks can connect at edges
  for (let i = 0; i < size; i++) {
    grid[i] = FLOOR                        // top row
    grid[(size - 1) * size + i] = FLOOR    // bottom row
    grid[i * size] = FLOOR                 // left col
    grid[i * size + size - 1] = FLOOR      // right col
  }

  // Density check only — no per-chunk flood fill (global fill handles connectivity)
  let floorCount = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === FLOOR) floorCount++
  }
  const ratio = floorCount / grid.length
  return ratio >= 0.20 && ratio <= 0.80
}

export function stampMotif(
  grid: Uint8Array,
  gridSize: number,
  motif: string[],
  x: number,
  z: number,
  motifMask: Uint8Array,
): void {
  for (let row = 0; row < motif.length; row++) {
    for (let col = 0; col < motif[row].length; col++) {
      const gx = x + col
      const gz = z + row
      if (gx < 0 || gx >= gridSize || gz < 0 || gz >= gridSize) continue
      const idx = gz * gridSize + gx
      const ch = motif[row][col]
      if (ch === '#') {
        grid[idx] = WALL
        motifMask[idx] = 1
      } else if (ch === '.') {
        grid[idx] = FLOOR
        motifMask[idx] = 1
      }
    }
  }
}

export function assembleArena(config: ArenaConfig): ArenaResult {
  const { zoneGrid, zones, boundaries, chunkSize, caIterations, seed } = config
  const gridChunks = zoneGrid.length
  const worldSize = gridChunks * chunkSize
  const grid = new Uint8Array(worldSize * worldSize)
  const zoneMap = new Uint8Array(worldSize * worldSize)
  const motifMask = new Uint8Array(worldSize * worldSize)

  const masterRng = mulberry32(seed)

  // Generate each chunk
  for (let cz = 0; cz < gridChunks; cz++) {
    for (let cx = 0; cx < gridChunks; cx++) {
      const zoneIdx = zoneGrid[cz][cx]
      const zone = zones[zoneIdx]
      const chunkSeed = (masterRng() * 0xffffffff) | 0
      const chunkRng = mulberry32(chunkSeed)

      // Fill zone map for this chunk
      const ox = cx * chunkSize
      const oz = cz * chunkSize
      for (let lz = 0; lz < chunkSize; lz++) {
        for (let lx = 0; lx < chunkSize; lx++) {
          zoneMap[(oz + lz) * worldSize + (ox + lx)] = zoneIdx
        }
      }

      // Generate CA with retries
      let chunk: Uint8Array | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        const attemptSeed = (chunkSeed + attempt * 7919) | 0
        const candidate = generateCA(chunkSize, zone.density, caIterations, attemptSeed)
        if (postProcessCA(candidate, chunkSize)) {
          chunk = candidate
          break
        }
      }
      if (!chunk) {
        chunk = generateCA(chunkSize, zone.density, caIterations, chunkSeed)
        postProcessCA(chunk, chunkSize)
      }

      // Copy chunk into world grid
      for (let lz = 0; lz < chunkSize; lz++) {
        for (let lx = 0; lx < chunkSize; lx++) {
          grid[(oz + lz) * worldSize + (ox + lx)] = chunk[lz * chunkSize + lx]
        }
      }

      // Stamp motif at chunk center with random offset
      if (zone.motifs.length > 0) {
        const motif = zone.motifs[Math.floor(chunkRng() * zone.motifs.length)]
        const motifW = motif[0].length
        const motifH = motif.length
        const centerX = ox + ((chunkSize - motifW) >> 1)
        const centerZ = oz + ((chunkSize - motifH) >> 1)
        const offsetX = Math.floor(chunkRng() * 9) - 4
        const offsetZ = Math.floor(chunkRng() * 9) - 4
        let mx = centerX + offsetX
        let mz = centerZ + offsetZ
        // Skip if motif would be within 2 cells of chunk border
        if (mx >= ox + 2 && mx + motifW <= ox + chunkSize - 2 &&
            mz >= oz + 2 && mz + motifH <= oz + chunkSize - 2) {
          stampMotif(grid, worldSize, motif, mx, mz, motifMask)
        }
      }
    }
  }

  // Clear corridors along chunk borders for inter-chunk connectivity
  for (let cz = 0; cz < gridChunks; cz++) {
    for (let cx = 0; cx < gridChunks; cx++) {
      const ox = cx * chunkSize
      const oz = cz * chunkSize
      const mid = chunkSize >> 1
      const corridorW = 3
      // Right border → connect to right neighbor
      if (cx < gridChunks - 1) {
        for (let d = -corridorW; d <= corridorW; d++) {
          const gz = oz + mid + d
          if (gz < 0 || gz >= worldSize) continue
          grid[gz * worldSize + (ox + chunkSize - 1)] = FLOOR
          grid[gz * worldSize + (ox + chunkSize)] = FLOOR
        }
      }
      // Bottom border → connect to bottom neighbor
      if (cz < gridChunks - 1) {
        for (let d = -corridorW; d <= corridorW; d++) {
          const gx = ox + mid + d
          if (gx < 0 || gx >= worldSize) continue
          grid[(oz + chunkSize - 1) * worldSize + gx] = FLOOR
          grid[(oz + chunkSize) * worldSize + gx] = FLOOR
        }
      }
    }
  }

  // Apply boundary overlays
  for (const b of boundaries) {
    for (let cz = 0; cz < gridChunks; cz++) {
      for (let cx = 0; cx < gridChunks; cx++) {
        const thisZone = zoneGrid[cz][cx]
        if (thisZone !== b.zoneA && thisZone !== b.zoneB) continue

        // Check if this chunk is adjacent to the other zone
        const adjacentToOther = [
          [cz - 1, cx], [cz + 1, cx], [cz, cx - 1], [cz, cx + 1],
        ].some(([nz, nx]) =>
          nz >= 0 && nz < gridChunks && nx >= 0 && nx < gridChunks &&
          zoneGrid[nz][nx] !== thisZone &&
          (zoneGrid[nz][nx] === b.zoneA || zoneGrid[nz][nx] === b.zoneB)
        )
        if (!adjacentToOther) continue

        const ox = cx * chunkSize
        const oz = cz * chunkSize

        if (b.type === 'dense') {
          // Re-generate border chunk at 1.5× density
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
        } else if (b.type === 'river') {
          // HAZARD strip along the boundary edge with ford gaps
          const bRng = mulberry32(seed + cz * 50 + cx)
          for (let cz2 = 0; cz2 < gridChunks; cz2++) {
            for (let cx2 = 0; cx2 < gridChunks; cx2++) {
              if (zoneGrid[cz2][cx2] !== b.zoneA && zoneGrid[cz2][cx2] !== b.zoneB) continue
            }
          }
          // Place hazard strip along chunk edges facing the other zone
          for (const [nz, nx] of [[cz - 1, cx], [cz + 1, cx], [cz, cx - 1], [cz, cx + 1]] as [number, number][]) {
            if (nz < 0 || nz >= gridChunks || nx < 0 || nx >= gridChunks) continue
            const neighborZone = zoneGrid[nz][nx]
            if (neighborZone === thisZone) continue
            if (neighborZone !== b.zoneA && neighborZone !== b.zoneB) continue

            const isVertical = nz === cz
            const isNeg = nx < cx || nz < cz
            for (let i = 0; i < chunkSize; i++) {
              // Ford gap every ~8 cells
              if (Math.floor(bRng() * 8) === 0) continue
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
        } else if (b.type === 'hazard') {
          // HAZARD cells along edge
          for (const [nz, nx] of [[cz - 1, cx], [cz + 1, cx], [cz, cx - 1], [cz, cx + 1]] as [number, number][]) {
            if (nz < 0 || nz >= gridChunks || nx < 0 || nx >= gridChunks) continue
            if (zoneGrid[nz][nx] === thisZone) continue
            if (zoneGrid[nz][nx] !== b.zoneA && zoneGrid[nz][nx] !== b.zoneB) continue

            const isVertical = nz === cz
            const isNeg = nx < cx || nz < cz
            for (let i = 0; i < chunkSize; i++) {
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

  // Global flood fill — keep largest connected FLOOR component
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

  // Count total floor before culling
  let totalFloor = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === FLOOR) totalFloor++
  }

  const keep = new Uint8Array(grid.length)
  for (const idx of largestComponent) keep[idx] = 1
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === FLOOR && !keep[i]) grid[i] = WALL
  }
  // Connected if largest component had >95% of all floor
  const connected = totalFloor === 0 || largestComponent.length / totalFloor > 0.95

  // Stats
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

// --- Motifs ---

const MOTIF_CHOKEPOINT = [
  '........',
  '.######.',
  '.#....#.',
  '........',
  '........',
  '.#....#.',
  '.######.',
  '........',
]

const MOTIF_CLEARING = [
  '........',
  '........',
  '........',
  '...##...',
  '...##...',
  '........',
  '........',
  '........',
]

const MOTIF_COVER = [
  '........',
  '.#..#...',
  '........',
  '...#..#.',
  '.#..#...',
  '........',
  '...#..#.',
  '........',
]

// --- Demo Config ---

export const DEMO_CONFIG: ArenaConfig = {
  zoneGrid: [
    [0, 0, 1, 1],
    [0, 2, 2, 1],
    [0, 2, 2, 1],
    [0, 0, 1, 1],
  ],
  zones: [
    { density: 0.56, hue: 200, motifs: [MOTIF_CHOKEPOINT] },
    { density: 0.62, hue: 120, motifs: [MOTIF_CLEARING] },
    { density: 0.50, hue: 40,  motifs: [MOTIF_COVER] },
  ],
  boundaries: [],
  corridors: [
    { from: 0, to: 1 },
    { from: 0, to: 2 },
    { from: 1, to: 2 },
  ],
  chunkSize: 32,
  caIterations: 2,
  seed: 42,
}
