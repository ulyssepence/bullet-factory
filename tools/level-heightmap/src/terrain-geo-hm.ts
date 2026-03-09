import * as THREE from 'three'
import { FLOOR, WALL, GATE, HAZARD, mulberry32 } from '../../../template/src/level/ca'
import type { Contour } from '../../../template/src/level/marching'
import { buildWallGeo, buildWallFillGeo } from '../../../template/src/level/terrain-geo'
import type { WallGeoOpts, WallFillOpts } from '../../../template/src/level/terrain-geo'
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
  return buildWallGeo(contours, height, jitter, seed, {
    color,
    innerScale: 1.0,
    sampleY: (x, z) => sampleHeight(heightmap, worldSize, x, z),
  })
}

export function buildWallFillGeoHM(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  heightmap: Float32Array,
  wallHeight: number,
  wallPalettes: THREE.Color[],
  ribbonUpperXZ?: [number, number][],
): THREE.BufferGeometry {
  const allZones = new Set<number>()
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === WALL || grid[i] === GATE) allZones.add(zoneMap[i])
  }
  const sy = (x: number, z: number) => sampleHeight(heightmap, worldSize, x, z)

  const parts: THREE.BufferGeometry[] = []
  for (const zone of allZones) {
    parts.push(buildWallFillGeo(grid, zoneMap, worldSize, wallHeight, zone, {
      color: wallPalettes[zone] || wallPalettes[0],
      sampleY: sy,
      ribbonUpperXZ,
    }))
  }

  if (parts.length === 0) return new THREE.BufferGeometry()
  if (parts.length === 1) return parts[0]

  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = []
  let vOff = 0
  for (const g of parts) {
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const n = g.getAttribute('normal') as THREE.BufferAttribute
    const c = g.getAttribute('color') as THREE.BufferAttribute
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
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  if (col.length > 0) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
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
