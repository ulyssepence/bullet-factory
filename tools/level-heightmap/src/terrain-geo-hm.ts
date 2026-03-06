import * as THREE from 'three'
import { FLOOR, WALL, HAZARD, mulberry32 } from '../../../template/src/level/ca'
import type { Contour } from '../../../template/src/level/marching'
import { sampleHeight } from './heightmap'

export function buildWallGeoHM(
  contours: Contour[],
  heightmap: Float32Array,
  worldSize: number,
  height: number = 1.2,
  jitter: number = 0,
  seed: number = 0,
  color?: THREE.Color,
): THREE.BufferGeometry {
  const halfWidth = 0.6
  const allPos: number[] = []
  const allNrm: number[] = []
  const allCol: number[] = []
  const allIdx: number[] = []
  let v = 0
  const cr = color?.r ?? 1, cg = color?.g ?? 1, cb = color?.b ?? 1

  function quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
  ) {
    allPos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz)
    allNrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz)
    allCol.push(cr, cg, cb, cr, cg, cb, cr, cg, cb, cr, cg, cb)
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
    const baseY = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const cx = contour[i * 2]
      const cz = contour[i * 2 + 1]
      const px = perpXArr[i] * halfWidth
      const pz = perpZArr[i] * halfWidth
      const jMag = rng() * jitter
      outerX[i] = cx + px + perpXArr[i] * jMag
      outerZ[i] = cz + pz + perpZArr[i] * jMag
      innerX[i] = cx - px
      innerZ[i] = cz - pz
      baseY[i] = sampleHeight(heightmap, worldSize, cx, cz)
    }

    for (let i = 0; i < n - 1; i++) {
      const ox0 = outerX[i], oz0 = outerZ[i]
      const ox1 = outerX[i + 1], oz1 = outerZ[i + 1]
      const ix0 = innerX[i], iz0 = innerZ[i]
      const ix1 = innerX[i + 1], iz1 = innerZ[i + 1]
      const by0 = baseY[i], by1 = baseY[i + 1]
      const ty0 = by0 + height, ty1 = by1 + height

      let fnx = perpXArr[i] + perpXArr[i + 1]
      let fnz = perpZArr[i] + perpZArr[i + 1]
      const fl = Math.sqrt(fnx * fnx + fnz * fnz) || 1
      fnx /= fl; fnz /= fl

      quad(
        ox0, by0, oz0, ox1, by1, oz1, ox1, ty1, oz1, ox0, ty0, oz0,
        fnx, 0, fnz,
      )
      quad(
        ix1, by1, iz1, ix0, by0, iz0, ix0, ty0, iz0, ix1, ty1, iz1,
        -fnx, 0, -fnz,
      )
      quad(
        ox0, ty0, oz0, ox1, ty1, oz1, ix1, ty1, iz1, ix0, ty0, iz0,
        0, 1, 0,
      )
    }

    if (!isLoop) {
      const by0 = baseY[0], ty0 = by0 + height
      let tx = contour[2] - contour[0]
      let tz = contour[3] - contour[1]
      let tl = Math.sqrt(tx * tx + tz * tz) || 1
      quad(
        innerX[0], by0, innerZ[0], outerX[0], by0, outerZ[0],
        outerX[0], ty0, outerZ[0], innerX[0], ty0, innerZ[0],
        -tx / tl, 0, -tz / tl,
      )
      const last = n - 1
      const byL = baseY[last], tyL = byL + height
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
  if (color) geo.setAttribute('color', new THREE.Float32BufferAttribute(allCol, 3))
  geo.setIndex(allIdx)
  return geo
}

export function buildFloorGeoHM(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  zonePalettes: THREE.Color[],
  wallPalettes: THREE.Color[],
  worldSize: number,
  seed: number,
  heightmap: Float32Array,
): THREE.BufferGeometry {
  const cellSize = 1
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const idx = z * worldSize + x
      const cell = grid[idx]
      const y = cell === HAZARD ? heightmap[idx] - 0.05 : heightmap[idx]

      positions.push((x + 0.5) * cellSize, y, (z + 0.5) * cellSize)
      normals.push(0, 1, 0)

      const zone = zoneMap[idx]
      const baseColor = cell === WALL
        ? (wallPalettes[zone] || wallPalettes[0])
        : (zonePalettes[zone] || zonePalettes[0])
      const rng = mulberry32(x * 3571 + z * 7919 + seed)
      const lum = 1.0 + (rng() - 0.5) * 0.3

      let r = baseColor.r * lum
      let g = baseColor.g * lum
      let b = baseColor.b * lum

      if (cell === HAZARD) {
        r = Math.min(1, r * 1.5 + 0.2)
        g *= 0.4
        b *= 0.4
      }

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
        const t = (1 - minDist / 4) * (rng() * 0.5 + 0.25)
        r = r * (1 - t) + otherColor.r * lum * t
        g = g * (1 - t) + otherColor.g * lum * t
        b = b * (1 - t) + otherColor.b * lum * t
      }

      colors.push(Math.min(1, r), Math.min(1, g), Math.min(1, b))
    }
  }

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

export function buildWallFillGeoHM(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  heightmap: Float32Array,
  wallHeight: number,
  wallPalettes: THREE.Color[],
): THREE.BufferGeometry {
  const pos: number[] = []
  const nrm: number[] = []
  const col: number[] = []
  const idx: number[] = []
  let v = 0

  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const i = z * worldSize + x
      if (grid[i] !== WALL) continue
      const zone = zoneMap[i]
      const c = wallPalettes[zone] || wallPalettes[0]
      const y00 = sampleHeight(heightmap, worldSize, x, z) + wallHeight
      const y10 = sampleHeight(heightmap, worldSize, x + 1, z) + wallHeight
      const y11 = sampleHeight(heightmap, worldSize, x + 1, z + 1) + wallHeight
      const y01 = sampleHeight(heightmap, worldSize, x, z + 1) + wallHeight
      pos.push(x, y00, z, x + 1, y10, z, x + 1, y11, z + 1, x, y01, z + 1)
      nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
      col.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b)
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2)
      v += 4
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}
