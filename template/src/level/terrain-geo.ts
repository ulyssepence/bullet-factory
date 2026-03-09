import * as THREE from 'three'
import { FLOOR, WALL, HAZARD, GATE, mulberry32 } from './ca'
import type { Contour } from './marching'

export interface WallGeoOpts {
  color?: THREE.Color
  innerScale?: number
  sampleY?: (x: number, z: number) => number
}

export function buildWallGeo(
  contours: Contour[],
  height: number = 1.2,
  jitter: number = 0.1,
  seed: number = 0,
  opts?: WallGeoOpts,
): THREE.BufferGeometry {
  const halfWidth = 0.6
  const innerScale = opts?.innerScale ?? 0.85
  const sampleY = opts?.sampleY ?? (() => 0)
  const cr = opts?.color?.r ?? 1, cg = opts?.color?.g ?? 1, cb = opts?.color?.b ?? 1
  const hasColor = !!opts?.color
  const allPos: number[] = []
  const allNrm: number[] = []
  const allCol: number[] = []
  const allIdx: number[] = []
  let v = 0

  function quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
  ) {
    allPos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz)
    allNrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz)
    if (hasColor) allCol.push(cr, cg, cb, cr, cg, cb, cr, cg, cb, cr, cg, cb)
    allIdx.push(v, v + 1, v + 2, v, v + 2, v + 3)
    v += 4
  }

  for (const contour of contours) {
    const n = contour.length / 2
    if (n < 2) continue

    const rng = mulberry32(seed + Math.round(contour[0] * 100 + contour[1] * 37))

    const isLoop =
      Math.abs(contour[0] - contour[(n - 1) * 2]) < 0.01 &&
      Math.abs(contour[1] - contour[(n - 1) * 2 + 1]) < 0.01

    const perpXArr = new Float32Array(n)
    const perpZArr = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      let tx: number, tz: number
      if (isLoop && (i === 0 || i === n - 1)) {
        const prev = n - 2
        tx = contour[2] - contour[prev * 2]
        tz = contour[3] - contour[prev * 2 + 1]
      } else if (i === 0) {
        tx = contour[2] - contour[0]
        tz = contour[3] - contour[1]
      } else if (i === n - 1) {
        tx = contour[i * 2] - contour[(i - 1) * 2]
        tz = contour[i * 2 + 1] - contour[(i - 1) * 2 + 1]
      } else {
        tx = contour[(i + 1) * 2] - contour[(i - 1) * 2]
        tz = contour[(i + 1) * 2 + 1] - contour[(i - 1) * 2 + 1]
      }
      const len = Math.sqrt(tx * tx + tz * tz) || 1
      perpXArr[i] = -tz / len
      perpZArr[i] = tx / len
    }

    const outerX = new Float32Array(n)
    const outerZ = new Float32Array(n)
    const innerX = new Float32Array(n)
    const innerZ = new Float32Array(n)
    const baseYArr = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const cx = contour[i * 2]
      const cz = contour[i * 2 + 1]
      const px = perpXArr[i] * halfWidth
      const pz = perpZArr[i] * halfWidth
      const jMag = rng() * jitter
      outerX[i] = cx + px + perpXArr[i] * jMag
      outerZ[i] = cz + pz + perpZArr[i] * jMag
      innerX[i] = cx - px * innerScale
      innerZ[i] = cz - pz * innerScale
      baseYArr[i] = sampleY(cx, cz)
    }

    for (let i = 0; i < n - 1; i++) {
      const ox0 = outerX[i], oz0 = outerZ[i]
      const ox1 = outerX[i + 1], oz1 = outerZ[i + 1]
      const ix0 = innerX[i], iz0 = innerZ[i]
      const ix1 = innerX[i + 1], iz1 = innerZ[i + 1]
      const by0 = baseYArr[i], by1 = baseYArr[i + 1]
      const ty0 = by0 + height, ty1 = by1 + height

      let fnx = perpXArr[i] + perpXArr[i + 1]
      let fnz = perpZArr[i] + perpZArr[i + 1]
      let fl = Math.sqrt(fnx * fnx + fnz * fnz) || 1
      fnx /= fl; fnz /= fl

      quad(
        ox0, by0, oz0, ox1, by1, oz1, ox1, ty1, oz1, ox0, ty0, oz0,
        fnx, 0, fnz,
      )
      quad(
        ix1, by1, iz1, ix0, by0, iz0, ix0, ty0, iz0, ix1, ty1, iz1,
        -fnx, 0, -fnz,
      )
      // Top cap
      quad(
        ox0, ty0, oz0, ox1, ty1, oz1, ix1, ty1, iz1, ix0, ty0, iz0,
        0, 1, 0,
      )
    }

    if (!isLoop) {
      const by0 = baseYArr[0], ty0 = by0 + height
      let tx = contour[2] - contour[0]
      let tz = contour[3] - contour[1]
      let tl = Math.sqrt(tx * tx + tz * tz) || 1
      quad(
        innerX[0], by0, innerZ[0], outerX[0], by0, outerZ[0],
        outerX[0], ty0, outerZ[0], innerX[0], ty0, innerZ[0],
        -tx / tl, 0, -tz / tl,
      )
      const last = n - 1
      const byL = baseYArr[last], tyL = byL + height
      tx = contour[last * 2] - contour[(last - 1) * 2]
      tz = contour[last * 2 + 1] - contour[(last - 1) * 2 + 1]
      tl = Math.sqrt(tx * tx + tz * tz) || 1
      quad(
        outerX[last], byL, outerZ[last], innerX[last], byL, innerZ[last],
        innerX[last], tyL, innerZ[last], outerX[last], tyL, outerZ[last],
        tx / tl, 0, tz / tl,
      )
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(allNrm, 3))
  if (hasColor) geo.setAttribute('color', new THREE.Float32BufferAttribute(allCol, 3))
  geo.setIndex(allIdx)
  return geo
}

export function buildFloorGeo(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  zonePalettes: THREE.Color[],
  wallPalettes: THREE.Color[],
  worldSize: number,
  seed: number,
  height: number = 1.2,
  heightmap?: Float32Array,
  hazardColor?: THREE.Color,
): THREE.BufferGeometry {
  const cellSize = 1
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  // One vertex per cell corner → (worldSize+1)×(worldSize+1)
  // But simpler: one vertex per cell center, quad per cell
  // Even simpler: plane grid worldSize×worldSize vertices
  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const idx = z * worldSize + x
      const cell = grid[idx]
      const baseY = heightmap ? heightmap[idx] : 0
      const y = cell === HAZARD ? baseY - 0.05 : baseY

      positions.push((x + 0.5) * cellSize, y, (z + 0.5) * cellSize)
      normals.push(0, 1, 0)

      // Color
      const zone = zoneMap[idx]
      const baseColor = (cell === WALL || cell === GATE)
        ? (wallPalettes[zone] || wallPalettes[0])
        : (zonePalettes[zone] || zonePalettes[0])
      const rng = mulberry32(x * 3571 + z * 7919 + seed)
      const lum = 1.0 + (rng() - 0.5) * 0.3 // ±15%

      let r = baseColor.r * lum
      let g = baseColor.g * lum
      let b = baseColor.b * lum

      // Hazard tint
      if (cell === HAZARD) {
        if (hazardColor) {
          r = r * 0.4 + hazardColor.r * 0.6
          g = g * 0.4 + hazardColor.g * 0.6
          b = b * 0.4 + hazardColor.b * 0.6
        } else {
          r = Math.min(1, r * 1.5 + 0.2)
          g *= 0.4
          b *= 0.4
        }
      }

      // Gate tint — reddish-brown to distinguish from regular walls
      if (cell === GATE) {
        r = Math.min(1, r * 1.2 + 0.15)
        g *= 0.6
        b *= 0.5
      }

      // Zone boundary blending
      let nearOtherZone = -1
      let minDist = 4
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nx >= worldSize || nz < 0 || nz >= worldSize) continue
          const nZone = zoneMap[nz * worldSize + nx]
          if (nZone !== zone) {
            const dist = Math.abs(dx) + Math.abs(dz)
            if (dist < minDist) {
              minDist = dist
              nearOtherZone = nZone
            }
          }
        }
      }
      if (nearOtherZone >= 0 && nearOtherZone < zonePalettes.length) {
        const otherColor = zonePalettes[nearOtherZone]
        const t = (1 - minDist / 4) * (rng() * 0.5 + 0.25) // noise-warped lerp
        r = r * (1 - t) + otherColor.r * lum * t
        g = g * (1 - t) + otherColor.g * lum * t
        b = b * (1 - t) + otherColor.b * lum * t
      }

      colors.push(Math.min(1, r), Math.min(1, g), Math.min(1, b))
    }
  }

  // Triangulate grid — emit all quads (wall interiors need floor as fallback
  // under wall fill gaps)
  for (let z = 0; z < worldSize - 1; z++) {
    for (let x = 0; x < worldSize - 1; x++) {
      const i00 = z * worldSize + x
      const i10 = i00 + 1
      const i01 = i00 + worldSize
      const i11 = i01 + 1
      indices.push(i00, i01, i10)
      indices.push(i10, i01, i11)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

// Wall cap with overhang: extends cap quads past the ribbon edge at exposed
// WALL boundaries so the cap visually covers the ribbon band. Used by
// tool-level-ca-3d-1 where the ribbon has no built-in top cap.
export function buildWallCapGeo(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  zone: number,
  worldSize: number,
  height: number,
): THREE.BufferGeometry {
  const capY = height + 0.05
  const overhang = 0.7
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  let vertCount = 0

  const isWall = (x: number, z: number) => {
    if (x < 0 || x >= worldSize || z < 0 || z >= worldSize) return false
    const c = grid[z * worldSize + x]
    return c === WALL || c === GATE
  }

  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const idx = z * worldSize + x
      if ((grid[idx] !== WALL && grid[idx] !== GATE) || zoneMap[idx] !== zone) continue

      let x0 = x, x1 = x + 1, z0 = z, z1 = z + 1
      if (!isWall(x - 1, z)) x0 -= overhang
      if (!isWall(x + 1, z)) x1 += overhang
      if (!isWall(x, z - 1)) z0 -= overhang
      if (!isWall(x, z + 1)) z1 += overhang

      positions.push(x0, capY, z0, x1, capY, z0, x1, capY, z1, x0, capY, z1)
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
      indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3)
      vertCount += 4
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setIndex(indices)
  return geo
}

// Non-indexed wall roof: per-zone flat quads at wall top, slightly above
// ribbon height. Used by tool-level-ca-3d-2 where the ribbon emits its own
// top cap but a separate roof mesh is needed for material separation.
export function buildWallRoofGeo(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  zone: number,
  height: number = 1.2,
): THREE.BufferGeometry {
  const topY = height + 0.02
  const positions: number[] = []
  const normals: number[] = []

  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const idx = z * worldSize + x
      if ((grid[idx] !== WALL && grid[idx] !== GATE) || zoneMap[idx] !== zone) continue
      positions.push(x, topY, z, x + 1, topY, z, x + 1, topY, z + 1)
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0)
      positions.push(x, topY, z, x + 1, topY, z + 1, x, topY, z + 1)
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return geo
}

export function extractRibbonUpperXZ(
  ribbonGeo: THREE.BufferGeometry,
): [number, number][] {
  const pos = ribbonGeo.getAttribute('position') as THREE.BufferAttribute
  const nrm = ribbonGeo.getAttribute('normal') as THREE.BufferAttribute
  const ix = ribbonGeo.getIndex()
  if (!ix || pos.count === 0) return []

  const result: [number, number][] = []
  const seen = new Set<number>()
  for (let t = 0; t < ix.count; t += 6) {
    const i0 = ix.getX(t)
    if (Math.abs(nrm.getY(i0) - 1) > 0.01) continue
    for (let k = 0; k < 6; k++) {
      const vi = ix.getX(t + k)
      if (seen.has(vi)) continue
      seen.add(vi)
      result.push([pos.getX(vi), pos.getZ(vi)])
    }
  }
  return result
}

export interface WallFillOpts {
  color?: THREE.Color
  sampleY?: (x: number, z: number) => number
  ribbonUpperXZ?: [number, number][]
}

export function buildWallFillGeoMerged(
  grid: Uint8Array, zoneMap: Uint8Array, worldSize: number,
  height: number, zoneCount: number,
  opts?: Omit<WallFillOpts, 'color'> & { colors?: THREE.Color[] },
): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = []
  let vOff = 0
  for (let z = 0; z < zoneCount; z++) {
    const g = buildWallFillGeo(grid, zoneMap, worldSize, height, z, {
      sampleY: opts?.sampleY,
      ribbonUpperXZ: opts?.ribbonUpperXZ,
      color: opts?.colors?.[z],
    })
    if (!g.index || g.index.count === 0) { g.dispose(); continue }
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const n = g.getAttribute('normal') as THREE.BufferAttribute
    const c = g.getAttribute('color') as THREE.BufferAttribute | null
    const ix = g.getIndex()!
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nrm.push(n.getX(i), n.getY(i), n.getZ(i))
      if (c) col.push(c.getX(i), c.getY(i), c.getZ(i))
    }
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + vOff)
    vOff += p.count
    g.dispose()
  }
  if (vOff === 0) return new THREE.BufferGeometry()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  if (col.length > 0) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  return geo
}

export function buildWallFillGeo(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  height: number,
  zone: number,
  opts?: WallFillOpts,
): THREE.BufferGeometry {
  const sampleY = opts?.sampleY ?? (() => 0)
  const hasColor = !!opts?.color
  const cr = opts?.color?.r ?? 0, cg = opts?.color?.g ?? 0, cb = opts?.color?.b ?? 0
  const ribbonXZ = opts?.ribbonUpperXZ
  const pos: number[] = []
  const nrm: number[] = []
  const col: number[] = []
  const idx: number[] = []
  let v = 0

  const isWallCell = (cx: number, cz: number) => {
    if (cx < 0 || cx >= worldSize || cz < 0 || cz >= worldSize) return false
    const c = grid[cz * worldSize + cx]
    return c === WALL || c === GATE
  }

  // Build spatial index for ribbon upper vertices
  let buckets: Map<string, [number, number][]> | null = null
  if (ribbonXZ && ribbonXZ.length > 0) {
    buckets = new Map()
    const bs = 2
    for (const [rx, rz] of ribbonXZ) {
      const bk = `${Math.floor(rx / bs)},${Math.floor(rz / bs)}`
      if (!buckets.has(bk)) buckets.set(bk, [])
      buckets.get(bk)!.push([rx, rz])
    }
  }

  function snapCorner(px: number, pz: number): [number, number] {
    if (!buckets) return [px, pz]
    const bs = 2
    const bx = Math.floor(px / bs), bz = Math.floor(pz / bs)
    let bestX = px, bestZ = pz, bestDist = Infinity
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const pts = buckets.get(`${bx + dx},${bz + dz}`)
        if (!pts) continue
        for (const [rx, rz] of pts) {
          const d = (px - rx) ** 2 + (pz - rz) ** 2
          if (d < bestDist) { bestDist = d; bestX = rx; bestZ = rz }
        }
      }
    }
    return [bestX, bestZ]
  }

  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const i = z * worldSize + x
      if ((grid[i] !== WALL && grid[i] !== GATE) || zoneMap[i] !== zone) continue

      const corners: [number, number][] = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]]
      for (const [cx, cz] of corners) {
        let px = cx, pz = cz
        if (buckets) {
          // Corner is exposed if any cell sharing it is floor/OOB
          const exposed =
            !isWallCell(cx - 1, cz - 1) || !isWallCell(cx, cz - 1) ||
            !isWallCell(cx - 1, cz) || !isWallCell(cx, cz)
          if (exposed) [px, pz] = snapCorner(cx, cz)
        }
        pos.push(px, sampleY(px, pz) + height + 0.02, pz)
        nrm.push(0, 1, 0)
        if (hasColor) col.push(cr, cg, cb)
      }
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2)
      v += 4
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  if (hasColor) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  return geo
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
