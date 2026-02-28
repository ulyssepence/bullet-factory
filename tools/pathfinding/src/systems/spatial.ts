export interface SpatialHashConfig {
  cellSize: number
  worldSize: number
}

export interface SpatialHash<T> {
  rebuild(items: Iterable<T>, getPos: (item: T) => [number, number, number]): void
  forEachNeighbor(x: number, z: number, cb: (item: T) => void): void
}

export function createSpatialHash<T>(config: SpatialHashConfig): SpatialHash<T> {
  const { cellSize, worldSize } = config
  const hashW = Math.ceil(worldSize / cellSize)
  const buckets = new Map<number, T[]>()

  function hashKey(x: number, z: number): number {
    return ((Math.floor(x / cellSize) % hashW + hashW) % hashW) * hashW +
           ((Math.floor(z / cellSize) % hashW + hashW) % hashW)
  }

  return {
    rebuild(items, getPos) {
      buckets.clear()
      for (const item of items) {
        const pos = getPos(item)
        const k = hashKey(pos[0], pos[2])
        let b = buckets.get(k)
        if (!b) { b = []; buckets.set(k, b) }
        b.push(item)
      }
    },

    forEachNeighbor(x, z, cb) {
      const cx = Math.floor(x / cellSize)
      const cz = Math.floor(z / cellSize)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const k = ((cx + dx + hashW) % hashW) * hashW + ((cz + dz + hashW) % hashW)
          const b = buckets.get(k)
          if (b) for (const item of b) cb(item)
        }
      }
    },
  }
}
