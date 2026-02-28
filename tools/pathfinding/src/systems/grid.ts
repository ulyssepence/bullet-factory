export function wrapCoord(v: number, worldSize: number): number {
  return ((v % worldSize) + worldSize) % worldSize
}

export function gridIdx(x: number, z: number, worldSize: number): number {
  const gx = ((Math.floor(x) % worldSize) + worldSize) % worldSize
  const gz = ((Math.floor(z) % worldSize) + worldSize) % worldSize
  return gz * worldSize + gx
}

export function shortestWrapped(target: number, source: number, worldSize: number): number {
  let d = target - source
  const half = worldSize / 2
  if (d > half) d -= worldSize
  if (d < -half) d += worldSize
  return d
}

export function isFloor(grid: Uint8Array, x: number, z: number, worldSize: number): boolean {
  return grid[gridIdx(x, z, worldSize)] === 0
}
