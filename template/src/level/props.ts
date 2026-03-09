import { FLOOR, WALL, GATE, mulberry32 } from './ca'

export type PropData = {
  positions: Float32Array
  scales: Float32Array
  rotations: Float32Array
  count: number
}

export function scatterProps(
  grid: Uint8Array,
  worldSize: number,
  seed: number,
  density: number = 0.3,
): PropData {
  const rng = mulberry32(seed + 99991)
  const positions: number[] = []
  const scales: number[] = []
  const rotations: number[] = []

  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const idx = z * worldSize + x
      if (grid[idx] !== FLOOR) continue

      // Check if adjacent to wall
      let hasWallNeighbor = false
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= worldSize || nz < 0 || nz >= worldSize) continue
        if (grid[nz * worldSize + nx] === WALL || grid[nz * worldSize + nx] === GATE) {
          hasWallNeighbor = true
          break
        }
      }
      if (!hasWallNeighbor) continue

      if (rng() > density) continue

      positions.push(
        (x + 0.5 + (rng() - 0.5) * 0.8),
        0,
        (z + 0.5 + (rng() - 0.5) * 0.8),
      )
      scales.push(0.15 + rng() * 0.25)
      rotations.push(rng() * Math.PI * 2)
    }
  }

  return {
    positions: new Float32Array(positions),
    scales: new Float32Array(scales),
    rotations: new Float32Array(rotations),
    count: scales.length,
  }
}
