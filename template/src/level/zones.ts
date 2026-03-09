import type { ZoneDef } from './ca'

export function getZoneAtCell(
  zoneMap: Uint8Array,
  worldSize: number,
  wx: number,
  wz: number,
): number {
  const gx = Math.max(0, Math.min(worldSize - 1, Math.floor(wx)))
  const gz = Math.max(0, Math.min(worldSize - 1, Math.floor(wz)))
  return zoneMap[gz * worldSize + gx]
}

export function getEnemyPool(zones: ZoneDef[], zoneId: number): string[] {
  return zones[zoneId]?.enemyPool ?? []
}

export function getSpeedAt(
  speedGrid: Float32Array,
  worldSize: number,
  wx: number,
  wz: number,
): number {
  const gx = Math.max(0, Math.min(worldSize - 1, wx))
  const gz = Math.max(0, Math.min(worldSize - 1, wz))

  const x0 = Math.floor(gx)
  const z0 = Math.floor(gz)
  const x1 = Math.min(worldSize - 1, x0 + 1)
  const z1 = Math.min(worldSize - 1, z0 + 1)

  const fx = gx - x0
  const fz = gz - z0

  const s00 = speedGrid[z0 * worldSize + x0]
  const s10 = speedGrid[z0 * worldSize + x1]
  const s01 = speedGrid[z1 * worldSize + x0]
  const s11 = speedGrid[z1 * worldSize + x1]

  return s00 * (1 - fx) * (1 - fz) +
         s10 * fx * (1 - fz) +
         s01 * (1 - fx) * fz +
         s11 * fx * fz
}
