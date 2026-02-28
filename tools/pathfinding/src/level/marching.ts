import { WALL, HAZARD } from './ca'

export type Contour = Float32Array // [x0, z0, x1, z1, ...]

// Marching squares 16-case lookup: each case → 0-2 edge pairs
// Edge encoding: 0=top, 1=right, 2=bottom, 3=left
// Edge midpoints for a cell at (cx, cz) with cellSize:
//   top:    (cx + 0.5, cz)
//   right:  (cx + 1,   cz + 0.5)
//   bottom: (cx + 0.5, cz + 1)
//   left:   (cx,       cz + 0.5)
// Bit layout: (TL<<3)|(TR<<2)|(BR<<1)|BL
// For each case, edges with a crossing (one endpoint solid, one not) are paired.
// Edge 0=top(TL-TR), 1=right(TR-BR), 2=bottom(BL-BR), 3=left(TL-BL)
const CASES: number[][][] = [
  [],                   //  0: 0000 - none
  [[3, 2]],             //  1: 0001 - BL
  [[2, 1]],             //  2: 0010 - BR
  [[3, 1]],             //  3: 0011 - BL+BR
  [[0, 1]],             //  4: 0100 - TR
  [[0, 1], [2, 3]],    //  5: 0101 - TR+BL (saddle)
  [[0, 2]],             //  6: 0110 - TR+BR
  [[0, 3]],             //  7: 0111 - TR+BR+BL (only TL empty)
  [[0, 3]],             //  8: 1000 - TL
  [[0, 2]],             //  9: 1001 - TL+BL
  [[0, 3], [2, 1]],    // 10: 1010 - TL+BR (saddle)
  [[0, 1]],             // 11: 1011 - TL+BR+BL (only TR empty)
  [[1, 3]],             // 12: 1100 - TL+TR
  [[1, 2]],             // 13: 1101 - TL+TR+BL (only BR empty)
  [[2, 3]],             // 14: 1110 - TL+TR+BR (only BL empty)
  [],                   // 15: 1111 - all
]

function edgeMidpoint(edge: number, cx: number, cz: number, cellSize: number): [number, number] {
  switch (edge) {
    case 0: return [(cx + 0.5) * cellSize, cz * cellSize]
    case 1: return [(cx + 1) * cellSize, (cz + 0.5) * cellSize]
    case 2: return [(cx + 0.5) * cellSize, (cz + 1) * cellSize]
    case 3: return [cx * cellSize, (cz + 0.5) * cellSize]
    default: return [0, 0]
  }
}

type Segment = { x0: number; z0: number; x1: number; z1: number }

function isSolid(cell: number, targetType: number): boolean {
  if (targetType === WALL) return cell === WALL
  return cell === targetType
}

function sampleSolid(grid: Uint8Array, worldSize: number, x: number, z: number, cellType: number): number {
  if (x < 0 || x >= worldSize || z < 0 || z >= worldSize) return 0
  return isSolid(grid[z * worldSize + x], cellType) ? 1 : 0
}

export function extractContours(
  grid: Uint8Array,
  worldSize: number,
  cellSize: number,
  cellType: number,
): Contour[] {
  const segments: Segment[] = []

  // Start at -1 so OOB cells (non-solid) create contours at the grid edge
  for (let z = -1; z < worldSize; z++) {
    for (let x = -1; x < worldSize; x++) {
      const tl = sampleSolid(grid, worldSize, x, z, cellType)
      const tr = sampleSolid(grid, worldSize, x + 1, z, cellType)
      const br = sampleSolid(grid, worldSize, x + 1, z + 1, cellType)
      const bl = sampleSolid(grid, worldSize, x, z + 1, cellType)
      const caseIdx = (tl << 3) | (tr << 2) | (br << 1) | bl

      for (const [e0, e1] of CASES[caseIdx]) {
        const [x0, z0] = edgeMidpoint(e0, x, z, cellSize)
        const [x1, z1] = edgeMidpoint(e1, x, z, cellSize)
        segments.push({ x0, z0, x1, z1 })
      }
    }
  }

  // Chain segments into polylines
  const EPS = cellSize * 0.01
  const used = new Uint8Array(segments.length)
  const contours: Contour[] = []

  // Build spatial index: map rounded endpoint → segment indices
  const endpointMap = new Map<string, number[]>()
  function key(x: number, z: number): string {
    return `${Math.round(x / EPS)},${Math.round(z / EPS)}`
  }
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    const k0 = key(s.x0, s.z0)
    const k1 = key(s.x1, s.z1)
    let arr = endpointMap.get(k0)
    if (!arr) { arr = []; endpointMap.set(k0, arr) }
    arr.push(i)
    arr = endpointMap.get(k1)
    if (!arr) { arr = []; endpointMap.set(k1, arr) }
    arr.push(i)
  }

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue
    used[i] = 1
    const s = segments[i]
    const points: number[] = [s.x0, s.z0, s.x1, s.z1]

    // Extend forward from end
    let searching = true
    while (searching) {
      searching = false
      const endX = points[points.length - 2]
      const endZ = points[points.length - 1]
      const k = key(endX, endZ)
      const candidates = endpointMap.get(k)
      if (!candidates) break
      for (const j of candidates) {
        if (used[j]) continue
        const t = segments[j]
        const dk0 = key(t.x0, t.z0)
        const dk1 = key(t.x1, t.z1)
        if (dk0 === k) {
          used[j] = 1
          points.push(t.x1, t.z1)
          searching = true
          break
        } else if (dk1 === k) {
          used[j] = 1
          points.push(t.x0, t.z0)
          searching = true
          break
        }
      }
    }

    // Extend backward from start
    searching = true
    while (searching) {
      searching = false
      const startX = points[0]
      const startZ = points[1]
      const k = key(startX, startZ)
      const candidates = endpointMap.get(k)
      if (!candidates) break
      for (const j of candidates) {
        if (used[j]) continue
        const t = segments[j]
        const dk0 = key(t.x0, t.z0)
        const dk1 = key(t.x1, t.z1)
        if (dk0 === k) {
          used[j] = 1
          points.unshift(t.x1, t.z1)
          searching = true
          break
        } else if (dk1 === k) {
          used[j] = 1
          points.unshift(t.x0, t.z0)
          searching = true
          break
        }
      }
    }

    if (points.length >= 4) {
      contours.push(new Float32Array(points))
    }
  }

  return contours
}

export function smoothContour(contour: Contour, passes: number = 1): Contour {
  let pts = contour
  for (let p = 0; p < passes; p++) {
    const n = pts.length / 2
    if (n < 3) return pts
    const out: number[] = []
    const dx = pts[0] - pts[(n - 1) * 2]
    const dz = pts[1] - pts[(n - 1) * 2 + 1]
    const isLoop = Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01
    if (isLoop) {
      const m = n - 1
      for (let i = 0; i < m; i++) {
        const next = (i + 1) % m
        const x0 = pts[i * 2], z0 = pts[i * 2 + 1]
        const x1 = pts[next * 2], z1 = pts[next * 2 + 1]
        out.push(0.75 * x0 + 0.25 * x1, 0.75 * z0 + 0.25 * z1)
        out.push(0.25 * x0 + 0.75 * x1, 0.25 * z0 + 0.75 * z1)
      }
      out.push(out[0], out[1])
    } else {
      for (let i = 0; i < n - 1; i++) {
        const x0 = pts[i * 2], z0 = pts[i * 2 + 1]
        const x1 = pts[(i + 1) * 2], z1 = pts[(i + 1) * 2 + 1]
        out.push(0.75 * x0 + 0.25 * x1, 0.75 * z0 + 0.25 * z1)
        out.push(0.25 * x0 + 0.75 * x1, 0.25 * z0 + 0.75 * z1)
      }
      out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1])
    }
    pts = new Float32Array(out)
  }
  return pts
}
