import * as THREE from 'three'
import { FLOOR, WALL, HAZARD, mulberry32 } from './ca'

export function buildWallGeo(
  contours: Contour[],
  height: number = 1.2,
  jitter: number = 0.1,
  seed: number = 0,
): THREE.BufferGeometry {
  const halfWidth = 0.6
  const allPos: number[] = []
  const allNrm: number[] = []
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
        const m = n - 1
        const prev = (m - 1)
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
    }

    for (let i = 0; i < n - 1; i++) {
      const ox0 = outerX[i], oz0 = outerZ[i]
      const ox1 = outerX[i + 1], oz1 = outerZ[i + 1]
      const ix0 = innerX[i], iz0 = innerZ[i]
      const ix1 = innerX[i + 1], iz1 = innerZ[i + 1]

      // Outer face normal (average perp, pointing outward)
      let fnx = perpXArr[i] + perpXArr[i + 1]
      let fnz = perpZArr[i] + perpZArr[i + 1]
      let fl = Math.sqrt(fnx * fnx + fnz * fnz) || 1
      fnx /= fl; fnz /= fl

      // Outer face
      quad(
        ox0, 0, oz0, ox1, 0, oz1, ox1, height, oz1, ox0, height, oz0,
        fnx, 0, fnz,
      )
      // Inner face
      quad(
        ix1, 0, iz1, ix0, 0, iz0, ix0, height, iz0, ix1, height, iz1,
        -fnx, 0, -fnz,
      )
      // Top cap
      quad(
        ox0, height, oz0, ox1, height, oz1, ix1, height, iz1, ix0, height, iz0,
        0, 1, 0,
      )
    }

    if (!isLoop) {
      // Start cap normal: negative tangent
      let tx = contour[2] - contour[0]
      let tz = contour[3] - contour[1]
      let tl = Math.sqrt(tx * tx + tz * tz) || 1
      quad(
        innerX[0], 0, innerZ[0], outerX[0], 0, outerZ[0],
        outerX[0], height, outerZ[0], innerX[0], height, innerZ[0],
        -tx / tl, 0, -tz / tl,
      )
      // End cap normal: positive tangent
      const last = n - 1
      tx = contour[last * 2] - contour[(last - 1) * 2]
      tz = contour[last * 2 + 1] - contour[(last - 1) * 2 + 1]
      tl = Math.sqrt(tx * tx + tz * tz) || 1
      quad(
        outerX[last], 0, outerZ[last], innerX[last], 0, innerZ[last],
        innerX[last], height, innerZ[last], outerX[last], height, outerZ[last],
        tx / tl, 0, tz / tl,
      )
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(allNrm, 3))
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
      // WALL cells at Y=0 — wall fill + ribbon handle the raised surface.
      // Elevating WALL verts created slope triangles at FLOOR/WALL boundaries.
      const y = cell === HAZARD ? -0.05 : 0

      positions.push((x + 0.5) * cellSize, y, (z + 0.5) * cellSize)
      normals.push(0, 1, 0)

      // Color
      const zone = zoneMap[idx]
      const baseColor = cell === WALL
        ? (wallPalettes[zone] || wallPalettes[0])
        : (zonePalettes[zone] || zonePalettes[0])
      const rng = mulberry32(x * 3571 + z * 7919 + seed)
      const lum = 1.0 + (rng() - 0.5) * 0.3 // ±15%

      let r = baseColor.r * lum
      let g = baseColor.g * lum
      let b = baseColor.b * lum

      // Hazard tint
      if (cell === HAZARD) {
        r = Math.min(1, r * 1.5 + 0.2)
        g *= 0.4
        b *= 0.4
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

  const isWall = (x: number, z: number) =>
    x >= 0 && x < worldSize && z >= 0 && z < worldSize && grid[z * worldSize + x] === WALL

  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const idx = z * worldSize + x
      if (grid[idx] !== WALL || zoneMap[idx] !== zone) continue

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
      if (grid[idx] !== WALL || zoneMap[idx] !== zone) continue
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

export function buildWallFillGeo(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  height: number,
  zone: number,
): THREE.BufferGeometry {
  const pos: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  let v = 0

  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const i = z * worldSize + x
      if (grid[i] !== WALL || zoneMap[i] !== zone) continue
      pos.push(x, height, z, x + 1, height, z, x + 1, height, z + 1, x, height, z + 1)
      nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
      v += 4
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setIndex(idx)
  return geo
}
