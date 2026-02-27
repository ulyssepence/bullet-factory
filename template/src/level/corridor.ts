import { FLOOR, WALL, neighbors4, mulberry32 } from './ca'
import type { ZoneDef } from './ca'

export type Landmark = { zone: number; x: number; z: number }

export function placeZoneLandmarks(
  grid: Uint8Array, zoneMap: Uint8Array, worldSize: number, zones: ZoneDef[],
  chunkSize?: number, zoneGrid?: number[][], seed: number = 0,
): Landmark[] {
  if (!chunkSize || !zoneGrid) {
    return placeZoneLandmarksLegacy(grid, zoneMap, worldSize, zones)
  }

  const gridChunks = zoneGrid.length
  const landmarks: Landmark[] = []
  const margin = 6 // edgeThickness(5) + 1 so landmarks stay clear of edge border
  const maxShift = chunkSize * 0.35

  for (let cz = 0; cz < gridChunks; cz++) {
    for (let cx = 0; cx < gridChunks; cx++) {
      const zone = zoneGrid[cz][cx]
      const ox = cx * chunkSize
      const oz = cz * chunkSize
      const rng = mulberry32(seed + cx * 7717 + cz * 10193)

      // Find largest FLOOR cluster in this chunk
      const visited = new Uint8Array(grid.length)
      let bestCluster: number[] = []
      for (let lz = margin; lz < chunkSize - margin; lz++) {
        for (let lx = margin; lx < chunkSize - margin; lx++) {
          const i = (oz + lz) * worldSize + (ox + lx)
          if (grid[i] !== FLOOR || visited[i]) continue
          const cluster: number[] = []
          const queue = [i]
          visited[i] = 1
          while (queue.length > 0) {
            const cur = queue.pop()!
            cluster.push(cur)
            for (const n of neighbors4(cur, worldSize)) {
              if (!visited[n] && grid[n] === FLOOR) {
                const nx = n % worldSize, nz = Math.floor(n / worldSize)
                if (nx >= ox + margin && nx < ox + chunkSize - margin &&
                    nz >= oz + margin && nz < oz + chunkSize - margin) {
                  visited[n] = 1
                  queue.push(n)
                }
              }
            }
          }
          if (cluster.length > bestCluster.length) bestCluster = cluster
        }
      }

      let lx: number, lz: number
      if (bestCluster.length >= 5) {
        let sx = 0, sz = 0
        for (const idx of bestCluster) {
          sx += idx % worldSize
          sz += Math.floor(idx / worldSize)
        }
        lx = Math.round(sx / bestCluster.length + (rng() - 0.5) * 2 * maxShift)
        lz = Math.round(sz / bestCluster.length + (rng() - 0.5) * 2 * maxShift)
      } else {
        lx = ox + (chunkSize >> 1) + Math.round((rng() - 0.5) * 2 * maxShift)
        lz = oz + (chunkSize >> 1) + Math.round((rng() - 0.5) * 2 * maxShift)
      }
      lx = Math.max(ox + margin, Math.min(ox + chunkSize - margin - 1, lx))
      lz = Math.max(oz + margin, Math.min(oz + chunkSize - margin - 1, lz))

      // Snap to nearest FLOOR cell so landmark isn't on a wall
      const target = lz * worldSize + lx
      if (grid[target] !== FLOOR) {
        if (bestCluster.length > 0) {
          let bestDist = Infinity, bestIdx = target
          for (const idx of bestCluster) {
            const dx = (idx % worldSize) - lx
            const dz = Math.floor(idx / worldSize) - lz
            const d = dx * dx + dz * dz
            if (d < bestDist) { bestDist = d; bestIdx = idx }
          }
          lx = bestIdx % worldSize
          lz = Math.floor(bestIdx / worldSize)
        } else {
          // Spiral outward to find nearest FLOOR in chunk
          outer: for (let r = 1; r < chunkSize; r++) {
            for (let ddz = -r; ddz <= r; ddz++) {
              for (let ddx = -r; ddx <= r; ddx++) {
                if (Math.abs(ddx) !== r && Math.abs(ddz) !== r) continue
                const nx = lx + ddx, nz = lz + ddz
                if (nx >= ox && nx < ox + chunkSize && nz >= oz && nz < oz + chunkSize &&
                    grid[nz * worldSize + nx] === FLOOR) {
                  lx = nx; lz = nz; break outer
                }
              }
            }
          }
        }
      }

      landmarks.push({ zone, x: lx, z: lz })
    }
  }
  return landmarks
}

function placeZoneLandmarksLegacy(
  grid: Uint8Array, zoneMap: Uint8Array, worldSize: number, zones: ZoneDef[],
): Landmark[] {
  const landmarks: Landmark[] = []
  for (let zi = 0; zi < zones.length; zi++) {
    const cells: number[] = []
    for (let i = 0; i < grid.length; i++) {
      if (zoneMap[i] === zi && grid[i] === FLOOR) cells.push(i)
    }
    const visited = new Uint8Array(grid.length)
    let bestCluster: number[] = []
    for (const start of cells) {
      if (visited[start]) continue
      const cluster: number[] = []
      const queue = [start]
      visited[start] = 1
      while (queue.length > 0) {
        const cur = queue.pop()!
        cluster.push(cur)
        for (const n of neighbors4(cur, worldSize)) {
          if (!visited[n] && grid[n] === FLOOR && zoneMap[n] === zi) {
            visited[n] = 1
            queue.push(n)
          }
        }
      }
      if (cluster.length > bestCluster.length) bestCluster = cluster
    }
    if (bestCluster.length >= 15) {
      let sx = 0, sz = 0
      for (const idx of bestCluster) { sx += idx % worldSize; sz += Math.floor(idx / worldSize) }
      landmarks.push({ zone: zi, x: Math.round(sx / bestCluster.length), z: Math.round(sz / bestCluster.length) })
    } else {
      let sx = 0, sz = 0, count = 0
      for (let i = 0; i < zoneMap.length; i++) {
        if (zoneMap[i] === zi) { sx += i % worldSize; sz += Math.floor(i / worldSize); count++ }
      }
      if (count > 0) landmarks.push({ zone: zi, x: Math.round(sx / count), z: Math.round(sz / count) })
    }
  }
  return landmarks
}

function blobRadius(baseRadius: number, theta: number, phases: number[]): number {
  const amp = baseRadius * 0.3
  return baseRadius + amp * (
    Math.sin(3 * theta + phases[0]) * 0.5 +
    Math.sin(7 * theta + phases[1]) * 0.3 +
    Math.sin(13 * theta + phases[2]) * 0.2
  )
}

export function stampVault(
  grid: Uint8Array, worldSize: number, cx: number, cz: number, radius: number,
  edgeThickness: number = 0, entranceAngles?: number[],
): void {
  const rng = mulberry32(cx * 7919 + cz * 104729)
  const phases = [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2]
  const scan = radius + Math.ceil(radius * 0.3) + 2

  for (let dz = -scan; dz <= scan; dz++) {
    for (let dx = -scan; dx <= scan; dx++) {
      const gx = cx + dx, gz = cz + dz
      if (gx < edgeThickness || gx >= worldSize - edgeThickness ||
          gz < edgeThickness || gz >= worldSize - edgeThickness) continue
      const dist = Math.sqrt(dx * dx + dz * dz)
      const theta = Math.atan2(dz, dx)
      const r = blobRadius(radius, theta, phases)
      if (dist <= r) grid[gz * worldSize + gx] = FLOOR
    }
  }

  const angles = entranceAngles ?? [0, Math.PI / 2, Math.PI, Math.PI * 1.5]
  const gapWidth = 3
  for (let dz = -scan; dz <= scan; dz++) {
    for (let dx = -scan; dx <= scan; dx++) {
      const gx = cx + dx, gz = cz + dz
      if (gx < 0 || gx >= worldSize || gz < 0 || gz >= worldSize) continue
      const dist = Math.sqrt(dx * dx + dz * dz)
      const theta = Math.atan2(dz, dx)
      const r = blobRadius(radius, theta, phases)
      if (dist < r - 1 || dist > r + 1) continue
      let nearEntrance = false
      for (const ea of angles) {
        let diff = Math.abs(theta - ea)
        if (diff > Math.PI) diff = 2 * Math.PI - diff
        if (diff < gapWidth / radius) { nearEntrance = true; break }
      }
      if (nearEntrance) continue
      grid[gz * worldSize + gx] = WALL
    }
  }
}

// A* pathfinding on the flat grid
function astar(grid: Uint8Array, worldSize: number, startX: number, startZ: number, endX: number, endZ: number): number[] {
  const start = startZ * worldSize + startX
  const end = endZ * worldSize + endX
  const size = worldSize * worldSize

  const gScore = new Float32Array(size).fill(Infinity)
  const fScore = new Float32Array(size).fill(Infinity)
  const cameFrom = new Int32Array(size).fill(-1)

  gScore[start] = 0
  fScore[start] = Math.hypot(endX - startX, endZ - startZ)

  // Min-heap using array (idx, fScore)
  const open: number[] = [start]
  const inOpen = new Uint8Array(size)
  inOpen[start] = 1

  while (open.length > 0) {
    // Find min fScore in open set (simple linear scan — fine for grid-scale A*)
    let bestI = 0
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestI]]) bestI = i
    }
    const cur = open[bestI]
    open[bestI] = open[open.length - 1]
    open.pop()
    inOpen[cur] = 0

    if (cur === end) break

    const cx = cur % worldSize, cz = Math.floor(cur / worldSize)
    for (const n of neighbors4(cur, worldSize)) {
      const cost = grid[n] === WALL ? 5 : 1
      const tentative = gScore[cur] + cost
      if (tentative < gScore[n]) {
        cameFrom[n] = cur
        gScore[n] = tentative
        const nx = n % worldSize, nz = Math.floor(n / worldSize)
        fScore[n] = tentative + Math.hypot(endX - nx, endZ - nz)
        if (!inOpen[n]) {
          open.push(n)
          inOpen[n] = 1
        }
      }
    }
  }

  // Reconstruct path
  const path: number[] = []
  let cur = end
  while (cur !== -1) {
    path.push(cur)
    cur = cameFrom[cur]
  }
  path.reverse()
  return path[0] === start ? path : []
}

// Hash-based noise: returns 0..1 for any grid coordinate
function cellNoise(x: number, z: number): number {
  let h = (x * 374761393 + z * 668265263 + 1013904223) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return ((h >>> 0) / 4294967296)
}

function stampNoisyCircle(grid: Uint8Array, worldSize: number, cx: number, cz: number, coreRadius: number, fringeRadius: number, edgeThickness: number = 0): void {
  for (let dz = -fringeRadius; dz <= fringeRadius; dz++) {
    for (let dx = -fringeRadius; dx <= fringeRadius; dx++) {
      const gx = cx + dx, gz = cz + dz
      if (gx < edgeThickness || gx >= worldSize - edgeThickness ||
          gz < edgeThickness || gz >= worldSize - edgeThickness) continue
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist <= coreRadius) {
        grid[gz * worldSize + gx] = FLOOR
      } else if (dist <= fringeRadius) {
        const t = (dist - coreRadius) / (fringeRadius - coreRadius)
        if (cellNoise(gx, gz) > t * 0.7) grid[gz * worldSize + gx] = FLOOR
      }
    }
  }
}

export type CorridorEdge = { from: number; to: number; straight?: boolean }

export function carveCorridors(
  grid: Uint8Array, worldSize: number, landmarks: Landmark[], edges: CorridorEdge[], seed: number,
  edgeThickness: number = 0,
): void {
  const rng = mulberry32(seed + 31337)
  for (const edge of edges) {
    const a = landmarks[edge.from], b = landmarks[edge.to]
    if (!a || !b) continue

    if (edge.straight) {
      // Simple L-shaped hallway: go horizontal then vertical
      const midX = b.x, midZ = a.z
      const path1 = astar(grid, worldSize,
        Math.max(0, Math.min(worldSize - 1, a.x)), Math.max(0, Math.min(worldSize - 1, a.z)),
        Math.max(0, Math.min(worldSize - 1, midX)), Math.max(0, Math.min(worldSize - 1, midZ)))
      const path2 = astar(grid, worldSize,
        Math.max(0, Math.min(worldSize - 1, midX)), Math.max(0, Math.min(worldSize - 1, midZ)),
        Math.max(0, Math.min(worldSize - 1, b.x)), Math.max(0, Math.min(worldSize - 1, b.z)))
      for (const idx of [...path1, ...path2]) {
        const gx = idx % worldSize, gz = Math.floor(idx / worldSize)
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = gx + dx, nz = gz + dz
            if (nx < edgeThickness || nx >= worldSize - edgeThickness ||
                nz < edgeThickness || nz >= worldSize - edgeThickness) continue
            if (nx >= 0 && nx < worldSize && nz >= 0 && nz < worldSize)
              grid[nz * worldSize + nx] = FLOOR
          }
        }
      }
      continue
    }

    const dx = b.x - a.x, dz = b.z - a.z
    const dist = Math.hypot(dx, dz)
    const perpX = -dz / (dist || 1), perpZ = dx / (dist || 1)
    const wpCount = 3 + Math.floor(rng() * 3)
    const points = [{ x: a.x, z: a.z }]
    for (let i = 1; i <= wpCount; i++) {
      const t = i / (wpCount + 1)
      const offset = (rng() - 0.5) * dist * 0.6
      points.push({
        x: Math.round(a.x + dx * t + perpX * offset),
        z: Math.round(a.z + dz * t + perpZ * offset),
      })
    }
    points.push({ x: b.x, z: b.z })
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i], q = points[i + 1]
      const px = Math.max(0, Math.min(worldSize - 1, p.x))
      const pz = Math.max(0, Math.min(worldSize - 1, p.z))
      const qx = Math.max(0, Math.min(worldSize - 1, q.x))
      const qz = Math.max(0, Math.min(worldSize - 1, q.z))
      const path = astar(grid, worldSize, px, pz, qx, qz)
      for (const idx of path) {
        stampNoisyCircle(grid, worldSize, idx % worldSize, Math.floor(idx / worldSize), 3, 6, edgeThickness)
      }
    }
  }
}

export function buildMSTEdges(
  landmarks: Landmark[], extraFactor: number, rng: () => number, gridChunks: number,
): CorridorEdge[] {
  const n = landmarks.length

  // Build candidate edges: grid-adjacent chunks only
  const candidates: { from: number; to: number; dist: number }[] = []
  for (let i = 0; i < n; i++) {
    const cx1 = i % gridChunks, cz1 = Math.floor(i / gridChunks)
    for (let j = i + 1; j < n; j++) {
      const cx2 = j % gridChunks, cz2 = Math.floor(j / gridChunks)
      const dcx = Math.abs(cx1 - cx2), dcz = Math.abs(cz1 - cz2)
      if (dcx + dcz !== 1) continue // grid-adjacent only
      const dx = landmarks[j].x - landmarks[i].x
      const dz = landmarks[j].z - landmarks[i].z
      candidates.push({ from: i, to: j, dist: Math.sqrt(dx * dx + dz * dz) })
    }
  }
  candidates.sort((a, b) => a.dist - b.dist)

  // Union-find
  const parent = new Int32Array(n)
  const rank = new Uint8Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] }
    return x
  }
  function union(a: number, b: number): boolean {
    a = find(a); b = find(b)
    if (a === b) return false
    if (rank[a] < rank[b]) { const t = a; a = b; b = t }
    parent[b] = a
    if (rank[a] === rank[b]) rank[a]++
    return true
  }

  // Kruskal's MST
  const edges: CorridorEdge[] = []
  const target = Math.ceil((n - 1) * extraFactor)
  const remaining: typeof candidates = []

  for (const c of candidates) {
    if (union(c.from, c.to)) {
      edges.push({ from: c.from, to: c.to })
    } else {
      remaining.push(c)
    }
  }

  // Add extra edges (already sorted by distance)
  for (const c of remaining) {
    if (edges.length >= target) break
    edges.push({ from: c.from, to: c.to })
  }

  // Mark straight on perimeter edges
  for (const e of edges) {
    const cx1 = e.from % gridChunks, cz1 = Math.floor(e.from / gridChunks)
    const cx2 = e.to % gridChunks, cz2 = Math.floor(e.to / gridChunks)
    const perim1 = cx1 === 0 || cx1 === gridChunks - 1 || cz1 === 0 || cz1 === gridChunks - 1
    const perim2 = cx2 === 0 || cx2 === gridChunks - 1 || cz2 === 0 || cz2 === gridChunks - 1
    if (perim1 && perim2 && rng() < 0.3) e.straight = true
  }

  return edges
}

export function connectOrphanCaves(grid: Uint8Array, worldSize: number): void {
  const size = worldSize * worldSize
  const componentId = new Int32Array(size).fill(-1)
  const components: number[][] = []

  for (let i = 0; i < size; i++) {
    if (grid[i] !== FLOOR || componentId[i] !== -1) continue
    const id = components.length
    const cluster: number[] = []
    const queue = [i]
    componentId[i] = id
    while (queue.length > 0) {
      const cur = queue.pop()!
      cluster.push(cur)
      for (const n of neighbors4(cur, worldSize)) {
        if (componentId[n] === -1 && grid[n] === FLOOR) {
          componentId[n] = id
          queue.push(n)
        }
      }
    }
    components.push(cluster)
  }

  if (components.length <= 1) return

  // Find the largest component
  let mainIdx = 0
  for (let i = 1; i < components.length; i++) {
    if (components[i].length > components[mainIdx].length) mainIdx = i
  }

  // Build a set of all cells in the main component for fast lookup
  const mainSet = new Uint8Array(size)
  for (const idx of components[mainIdx]) mainSet[idx] = 1

  for (let ci = 0; ci < components.length; ci++) {
    if (ci === mainIdx || components[ci].length < 5) continue

    // Find closest pair between this component and main
    let bestDist = Infinity, bestFrom = 0, bestTo = 0
    for (const idx of components[ci]) {
      const ax = idx % worldSize, az = Math.floor(idx / worldSize)
      // Sample main component (checking every cell is O(n*m), so sample)
      for (let si = 0; si < components[mainIdx].length; si += Math.max(1, Math.floor(components[mainIdx].length / 200))) {
        const midx = components[mainIdx][si]
        const bx = midx % worldSize, bz = Math.floor(midx / worldSize)
        const d = Math.abs(ax - bx) + Math.abs(az - bz)
        if (d < bestDist) {
          bestDist = d
          bestFrom = idx
          bestTo = midx
        }
      }
    }

    // Carve straight-line tunnel between bestFrom and bestTo
    const ax = bestFrom % worldSize, az = Math.floor(bestFrom / worldSize)
    const bx = bestTo % worldSize, bz = Math.floor(bestTo / worldSize)
    const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az))
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps
      const cx = Math.round(ax + (bx - ax) * t)
      const cz = Math.round(az + (bz - az) * t)
      stampNoisyCircle(grid, worldSize, cx, cz, 2, 5)
    }
  }
}
