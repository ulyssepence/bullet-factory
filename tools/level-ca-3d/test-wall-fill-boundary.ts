import * as THREE from 'three'
import { FLOOR, WALL, GATE, DEMO_CONFIG } from '../../template/src/level/ca'
import { buildWallFillGeo, buildWallGeo, extractRibbonUpperXZ } from '../../template/src/level/terrain-geo'
import { extractContours, smoothContour } from '../../template/src/level/marching'
import { assembleArenaV2 } from '../../template/src/level/generate'

const arenaResult = assembleArenaV2({ ...DEMO_CONFIG, seed: 42 })
const { grid, zoneMap, worldSize } = arenaResult
const height = 1.2
const margin = 6
const TOLERANCE = 1e-4

const isWall = (x: number, z: number) => {
  if (x < 0 || x >= worldSize || z < 0 || z >= worldSize) return false
  const c = grid[z * worldSize + x]
  return c === WALL || c === GATE
}

// Build ribbon geos, collect upper vertices
const contours = extractContours(grid, worldSize, 1, WALL)
const smoothed = contours.map(c => smoothContour(c, 2))

const zoneContours = new Map<number, Float32Array[]>()
for (const c of smoothed) {
  const gx = Math.floor(c[0]), gz = Math.floor(c[1])
  if (gx < 0 || gx >= worldSize || gz < 0 || gz >= worldSize) continue
  const zone = zoneMap[gz * worldSize + gx]
  if (!zoneContours.has(zone)) zoneContours.set(zone, [])
  zoneContours.get(zone)!.push(c)
}

const allZones = new Set<number>([...zoneContours.keys()])
for (let i = 0; i < grid.length; i++) {
  if (grid[i] === WALL || grid[i] === GATE) allZones.add(zoneMap[i])
}

const ribbonUpperXZ: [number, number][] = []
for (const zone of allZones) {
  const zContours = zoneContours.get(zone) || []
  if (zContours.length === 0) continue
  const geo = buildWallGeo(zContours, height, 0.12, 42 + zone)
  ribbonUpperXZ.push(...extractRibbonUpperXZ(geo))
  geo.dispose()
}

// Build fill geos with ribbon snapping
const fillGeos = [...allZones].map(z =>
  buildWallFillGeo(grid, zoneMap, worldSize, height, z, { ribbonUpperXZ })
)

// Build spatial index for ribbon upper vertices
const bucketSize = 2
const buckets = new Map<string, [number, number][]>()
for (const [rx, rz] of ribbonUpperXZ) {
  const bk = `${Math.floor(rx / bucketSize)},${Math.floor(rz / bucketSize)}`
  if (!buckets.has(bk)) buckets.set(bk, [])
  buckets.get(bk)!.push([rx, rz])
}

function nearestRibbonDist(fx: number, fz: number): number {
  const bx = Math.floor(fx / bucketSize)
  const bz = Math.floor(fz / bucketSize)
  let minDist = Infinity
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const pts = buckets.get(`${bx + dx},${bz + dz}`)
      if (!pts) continue
      for (const [rx, rz] of pts) {
        const d = Math.sqrt((fx - rx) ** 2 + (fz - rz) ** 2)
        if (d < minDist) minDist = d
      }
    }
  }
  return minDist
}

let failures = 0
let checked = 0

for (const g of fillGeos) {
  const p = g.getAttribute('position') as THREE.BufferAttribute
  const ix = g.getIndex()!

  for (let t = 0; t < ix.count; t += 6) {
    const verts: number[] = []
    for (let k = 0; k < 6; k++) verts.push(ix.getX(t + k))
    const unique = [...new Set(verts)]

    let cx = 0, cz = 0
    for (const vi of unique) { cx += p.getX(vi); cz += p.getZ(vi) }
    cx /= unique.length; cz /= unique.length
    const gx = Math.floor(cx), gz = Math.floor(cz)
    if (gx < margin || gx >= worldSize - margin || gz < margin || gz >= worldSize - margin) continue

    for (const vi of unique) {
      const fx = p.getX(vi), fz = p.getZ(vi)
      const onLeft = Math.abs(fx - gx) < 0.01 && !isWall(gx - 1, gz)
      const onRight = Math.abs(fx - (gx + 1)) < 0.01 && !isWall(gx + 1, gz)
      const onTop = Math.abs(fz - gz) < 0.01 && !isWall(gx, gz - 1)
      const onBottom = Math.abs(fz - (gz + 1)) < 0.01 && !isWall(gx, gz + 1)
      if (!onLeft && !onRight && !onTop && !onBottom) continue

      checked++
      const dist = nearestRibbonDist(fx, fz)
      if (dist > TOLERANCE) {
        failures++
        if (failures <= 5)
          console.log(`  fill vertex (${fx.toFixed(3)},${fz.toFixed(3)}) dist=${dist.toFixed(4)} from nearest ribbon`)
      }
    }
  }
}

if (failures > 0) {
  console.log(`FAIL: ${failures}/${checked} fill edge vertices not near any ribbon vertex`)
  process.exit(1)
} else {
  console.log(`PASS: all ${checked} fill edge vertices coincide with ribbon vertices (tolerance ${TOLERANCE})`)
  process.exit(0)
}
