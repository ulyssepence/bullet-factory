import { FLOOR, WALL, HAZARD, mulberry32 } from '../../../template/src/level/ca'

export function generateHeightmap(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  zoneHeights: number[],
  seed: number,
): Float32Array {
  const height = new Float32Array(worldSize * worldSize)
  const rng = mulberry32(seed + 77701)

  // Base height per zone
  for (let i = 0; i < grid.length; i++) {
    const zone = zoneMap[i]
    height[i] = zoneHeights[zone] ?? 0
  }

  // Smooth zone boundaries with distance-based blending
  const blendRadius = 6
  const blended = new Float32Array(height)
  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const idx = z * worldSize + x
      const myZone = zoneMap[idx]
      let nearBoundary = false

      for (let dz = -blendRadius; dz <= blendRadius && !nearBoundary; dz++) {
        for (let dx = -blendRadius; dx <= blendRadius && !nearBoundary; dx++) {
          const nx = x + dx, nz = z + dz
          if (nx < 0 || nx >= worldSize || nz < 0 || nz >= worldSize) continue
          if (zoneMap[nz * worldSize + nx] !== myZone) nearBoundary = true
        }
      }
      if (!nearBoundary) continue

      // Average heights in radius, weighted by distance
      let totalWeight = 0
      let totalHeight = 0
      for (let dz = -blendRadius; dz <= blendRadius; dz++) {
        for (let dx = -blendRadius; dx <= blendRadius; dx++) {
          const nx = x + dx, nz = z + dz
          if (nx < 0 || nx >= worldSize || nz < 0 || nz >= worldSize) continue
          const dist = Math.sqrt(dx * dx + dz * dz)
          if (dist > blendRadius) continue
          const w = 1 - dist / blendRadius
          totalWeight += w
          totalHeight += height[nz * worldSize + nx] * w
        }
      }
      if (totalWeight > 0) blended[idx] = totalHeight / totalWeight
    }
  }
  height.set(blended)

  // Add Perlin-ish noise for organic variation
  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const idx = z * worldSize + x
      if (grid[idx] === WALL) continue
      const r = mulberry32(x * 7919 + z * 104729 + seed + 33331)
      height[idx] += (r() - 0.5) * 0.15
    }
  }

  return height
}

export function sampleHeight(heightmap: Float32Array, worldSize: number, wx: number, wz: number): number {
  const gx = Math.max(0, Math.min(worldSize - 1, wx))
  const gz = Math.max(0, Math.min(worldSize - 1, wz))

  const x0 = Math.floor(gx)
  const z0 = Math.floor(gz)
  const x1 = Math.min(worldSize - 1, x0 + 1)
  const z1 = Math.min(worldSize - 1, z0 + 1)

  const fx = gx - x0
  const fz = gz - z0

  const h00 = heightmap[z0 * worldSize + x0]
  const h10 = heightmap[z0 * worldSize + x1]
  const h01 = heightmap[z1 * worldSize + x0]
  const h11 = heightmap[z1 * worldSize + x1]

  return h00 * (1 - fx) * (1 - fz) +
         h10 * fx * (1 - fz) +
         h01 * (1 - fx) * fz +
         h11 * fx * fz
}
