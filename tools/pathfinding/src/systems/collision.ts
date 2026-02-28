import * as grid from './grid'

export function resolvePlayerCollision(
  current: [number, number, number],
  candidate: [number, number, number],
  levelGrid: Uint8Array,
  worldSize: number,
  playerRadius: number,
): [number, number, number] {
  if (!collidesWithWalls(candidate[0], candidate[2], levelGrid, worldSize, playerRadius))
    return candidate
  if (!collidesWithWalls(candidate[0], current[2], levelGrid, worldSize, playerRadius))
    return [candidate[0], candidate[1], current[2]]
  if (!collidesWithWalls(current[0], candidate[2], levelGrid, worldSize, playerRadius))
    return [current[0], candidate[1], candidate[2]]
  return [current[0], candidate[1], current[2]]
}

function collidesWithWalls(
  x: number, z: number,
  levelGrid: Uint8Array, worldSize: number, playerRadius: number,
): boolean {
  const x0 = x - playerRadius
  const x1 = x + playerRadius
  const z0 = z - playerRadius
  const z1 = z + playerRadius
  return !grid.isFloor(levelGrid, x0, z0, worldSize)
    || !grid.isFloor(levelGrid, x1, z0, worldSize)
    || !grid.isFloor(levelGrid, x0, z1, worldSize)
    || !grid.isFloor(levelGrid, x1, z1, worldSize)
}

export function wrapPosition(pos: [number, number, number], worldSize: number): [number, number, number] {
  return [
    grid.wrapCoord(pos[0], worldSize),
    pos[1],
    grid.wrapCoord(pos[2], worldSize),
  ]
}
