import { FLOOR, mulberry32 } from '../../../template/src/level/ca'
import { sampleHeight } from './heightmap'

export type Entity = {
  x: number
  z: number
  vx: number
  vz: number
  zone: number
}

export function spawnEntities(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  count: number,
  seed: number,
): Entity[] {
  const rng = mulberry32(seed + 99991)
  const entities: Entity[] = []
  let attempts = 0
  while (entities.length < count && attempts < count * 20) {
    attempts++
    const x = Math.floor(rng() * worldSize)
    const z = Math.floor(rng() * worldSize)
    const idx = z * worldSize + x
    if (grid[idx] !== FLOOR) continue
    const angle = rng() * Math.PI * 2
    entities.push({
      x: x + 0.5,
      z: z + 0.5,
      vx: Math.cos(angle) * 2,
      vz: Math.sin(angle) * 2,
      zone: zoneMap[idx],
    })
  }
  return entities
}

export function updateEntities(
  entities: Entity[],
  grid: Uint8Array,
  worldSize: number,
  heightmap: Float32Array,
  speedGrid: Float32Array,
  dt: number,
) {
  for (const e of entities) {
    if (Math.random() < 0.02) {
      const angle = Math.random() * Math.PI * 2
      e.vx = Math.cos(angle) * 2
      e.vz = Math.sin(angle) * 2
    }

    const idx = Math.floor(e.z) * worldSize + Math.floor(e.x)
    const spd = idx >= 0 && idx < speedGrid.length ? speedGrid[idx] : 1

    const nx = e.x + e.vx * spd * dt
    const nz = e.z + e.vz * spd * dt

    const gx = Math.floor(nx)
    const gz = Math.floor(nz)
    if (gx >= 0 && gx < worldSize && gz >= 0 && gz < worldSize) {
      const nIdx = gz * worldSize + gx
      if (grid[nIdx] === FLOOR) {
        e.x = nx
        e.z = nz
        continue
      }
    }

    e.vx = -e.vx + (Math.random() - 0.5) * 2
    e.vz = -e.vz + (Math.random() - 0.5) * 2
  }
}
