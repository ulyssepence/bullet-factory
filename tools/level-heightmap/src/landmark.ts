import { FLOOR, WALL } from '../../../template/src/level/ca'

export function carveLandmarkClearing(
  grid: Uint8Array,
  worldSize: number,
  cx: number,
  cz: number,
  radius: number,
) {
  const r2 = radius * radius
  for (let z = Math.max(0, Math.floor(cz - radius)); z <= Math.min(worldSize - 1, Math.ceil(cz + radius)); z++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(worldSize - 1, Math.ceil(cx + radius)); x++) {
      const dx = x - cx, dz = z - cz
      if (dx * dx + dz * dz <= r2) {
        grid[z * worldSize + x] = FLOOR
      }
    }
  }
}

export function findLandmarkPosition(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  preferredZone: number,
): { x: number; z: number } {
  const fallback = { x: worldSize / 2, z: worldSize / 2 }

  const zonesToTry = [preferredZone]
  for (let z = 0; z < 3; z++) {
    if (z !== preferredZone) zonesToTry.push(z)
  }

  for (const zone of zonesToTry) {
    const region = largestFloorRegion(grid, zoneMap, worldSize, zone)
    if (region.length > 0) {
      let sx = 0, sz = 0
      for (const idx of region) {
        sx += idx % worldSize
        sz += Math.floor(idx / worldSize)
      }
      return { x: sx / region.length + 0.5, z: sz / region.length + 0.5 }
    }
  }

  return fallback
}

function largestFloorRegion(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  zone: number,
): number[] {
  const visited = new Uint8Array(grid.length)
  let best: number[] = []

  for (let i = 0; i < grid.length; i++) {
    if (visited[i] || grid[i] === WALL || zoneMap[i] !== zone) continue

    const region: number[] = []
    const stack = [i]
    visited[i] = 1
    while (stack.length > 0) {
      const idx = stack.pop()!
      region.push(idx)
      const x = idx % worldSize
      const z = Math.floor(idx / worldSize)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz
        if (nx < 0 || nx >= worldSize || nz < 0 || nz >= worldSize) continue
        const ni = nz * worldSize + nx
        if (!visited[ni] && grid[ni] !== WALL && zoneMap[ni] === zone) {
          visited[ni] = 1
          stack.push(ni)
        }
      }
    }

    if (region.length > best.length) best = region
  }

  return best
}
