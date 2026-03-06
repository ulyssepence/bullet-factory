import { FLOOR, WALL } from '../../../template/src/level/ca'

export type Gate = {
  cells: number[]
  open: boolean
  timer: number
}

export function createGate(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  width: number = 4,
): Gate | null {
  const candidates: number[] = []
  for (let z = 1; z < worldSize - 1; z++) {
    for (let x = 1; x < worldSize - 1; x++) {
      const idx = z * worldSize + x
      if (grid[idx] !== WALL) continue
      const z0 = zoneMap[idx]
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz
        if (nx < 0 || nx >= worldSize || nz < 0 || nz >= worldSize) continue
        const nIdx = nz * worldSize + nx
        const z1 = zoneMap[nIdx]
        if ((z0 === 0 && z1 === 1) || (z0 === 1 && z1 === 0)) {
          candidates.push(idx)
          break
        }
      }
    }
  }

  if (candidates.length < width) return null

  const start = Math.floor(candidates.length / 2) - Math.floor(width / 2)
  const cells = candidates.slice(start, start + width)
  return { cells, open: false, timer: 0 }
}

export function openGate(gate: Gate, grid: Uint8Array) {
  for (const cell of gate.cells) {
    grid[cell] = FLOOR
  }
  gate.open = true
}
