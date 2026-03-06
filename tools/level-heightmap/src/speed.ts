import * as THREE from 'three'
import { FLOOR, WALL } from '../../../template/src/level/ca'

export function buildSpeedGrid(
  heightmap: Float32Array,
  grid: Uint8Array,
  worldSize: number,
): Float32Array {
  const speed = new Float32Array(worldSize * worldSize)
  let maxH = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== WALL && heightmap[i] > maxH) maxH = heightmap[i]
  }
  if (maxH === 0) maxH = 1

  for (let i = 0; i < grid.length; i++) {
    speed[i] = grid[i] === WALL ? 0 : 1.0 - 0.3 * (heightmap[i] / maxH)
  }
  return speed
}

export function buildSpeedOverlayGeo(
  speedGrid: Float32Array,
  grid: Uint8Array,
  heightmap: Float32Array,
  worldSize: number,
): THREE.BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  let v = 0

  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const i = z * worldSize + x
      if (grid[i] === WALL) continue

      const y = heightmap[i] + 0.08
      positions.push(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1)

      const s = speedGrid[i]
      let r: number, g: number, b: number
      if (s >= 1.0) {
        const t = Math.min(1, (s - 1.0) / 0.3)
        r = 1 - t; g = 1 - t; b = 1
      } else {
        const t = Math.min(1, (1.0 - s) / 0.3)
        r = 1; g = 1 - t; b = 1 - t
      }
      for (let k = 0; k < 4; k++) colors.push(r, g, b)

      indices.push(v, v + 1, v + 2, v, v + 2, v + 3)
      v += 4
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  return geo
}

export function buildHeightmapOverlayGeo(
  heightmap: Float32Array,
  grid: Uint8Array,
  worldSize: number,
): THREE.BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  let v = 0

  let maxH = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== WALL && heightmap[i] > maxH) maxH = heightmap[i]
  }
  if (maxH === 0) maxH = 1

  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const i = z * worldSize + x
      if (grid[i] === WALL) continue

      const y = heightmap[i] + 0.04
      positions.push(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1)

      const c = heightmap[i] / maxH
      for (let k = 0; k < 4; k++) colors.push(c, c, c)

      indices.push(v, v + 1, v + 2, v, v + 2, v + 3)
      v += 4
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  return geo
}
