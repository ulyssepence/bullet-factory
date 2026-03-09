import fc from 'fast-check'
import * as THREE from 'three'
import { FLOOR, WALL, GATE, DEMO_CONFIG } from '../../template/src/level/ca'
import type { ArenaConfig } from '../../template/src/level/ca'
import { extractContours, smoothContour } from '../../template/src/level/marching'
import { assembleArenaV2 } from '../../template/src/level/generate'
import { generateHeightmap } from '../../tools/level-heightmap/src/heightmap'
import { buildWallGeoHM } from '../../tools/level-heightmap/src/terrain-geo-hm'
import { buildWallFillGeoHM } from '../../tools/level-heightmap/src/terrain-geo-hm'

const wallHeight = 1.2
const smoothingPasses = 1
const margin = 6
const zoneHeights = [0, 0.5, -0.3]
const TOLERANCE = 1e-4

function runCheck(seed: number): { failures: number; checked: number } {
  const config: ArenaConfig = { ...DEMO_CONFIG, seed }
  const { grid, zoneMap, worldSize } = assembleArenaV2(config)
  const heightmap = generateHeightmap(grid, zoneMap, worldSize, zoneHeights, seed)

  // --- Build ribbon geos, collect upper vertices ---
  const contours = extractContours(grid, worldSize, 1, WALL)
  const smoothed = contours.map(c => smoothContour(c, smoothingPasses))

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

  // Collect all ribbon upper vertex (x,z) positions from top-cap faces
  const ribbonUpperXZ: [number, number][] = []
  for (const zone of allZones) {
    const zContours = zoneContours.get(zone) || []
    if (zContours.length === 0) continue
    const color = new THREE.Color('#555')
    const geo = buildWallGeoHM(zContours, heightmap, worldSize, wallHeight, 0, seed + zone, color)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute
    const ix = geo.getIndex()!

    // Top cap quads have normal (0,1,0). Each quad = 4 verts, 6 indices.
    // Walk by 6-index groups (quads)
    for (let t = 0; t < ix.count; t += 6) {
      const i0 = ix.getX(t)
      // Check normal of first vertex
      if (Math.abs(nrm.getY(i0) - 1) > 0.01) continue
      // This is a top-cap quad — collect all 4 unique vertices
      const seen = new Set<number>()
      for (let k = 0; k < 6; k++) {
        const vi = ix.getX(t + k)
        if (seen.has(vi)) continue
        seen.add(vi)
        ribbonUpperXZ.push([pos.getX(vi), pos.getZ(vi)])
      }
    }
    geo.dispose()
  }

  // --- Build fill geo, check edge vertices ---
  const wallPalettes = [new THREE.Color('#555'), new THREE.Color('#666'), new THREE.Color('#777')]
  const fillGeo = buildWallFillGeoHM(grid, zoneMap, worldSize, heightmap, wallHeight, wallPalettes, ribbonUpperXZ)
  const fPos = fillGeo.getAttribute('position') as THREE.BufferAttribute
  const fIx = fillGeo.getIndex()!

  const isWall = (x: number, z: number) => {
    if (x < 0 || x >= worldSize || z < 0 || z >= worldSize) return false
    const c = grid[z * worldSize + x]
    return c === WALL || c === GATE
  }

  // Build spatial index for ribbon upper vertices (grid of buckets)
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

  let failures = 0, checked = 0

  // Walk fill quads (6 indices each = 4 unique verts per quad)
  for (let t = 0; t < fIx.count; t += 6) {
    const verts: number[] = []
    for (let k = 0; k < 6; k++) verts.push(fIx.getX(t + k))
    const unique = [...new Set(verts)]

    // Determine which cell this quad belongs to
    let cx = 0, cz = 0
    for (const vi of unique) { cx += fPos.getX(vi); cz += fPos.getZ(vi) }
    cx /= unique.length; cz /= unique.length
    const gx = Math.floor(cx), gz = Math.floor(cz)
    if (gx < margin || gx >= worldSize - margin || gz < margin || gz >= worldSize - margin) continue

    // For each vertex on an exposed edge, check against ribbon upper vertices
    for (const vi of unique) {
      const fx = fPos.getX(vi), fz = fPos.getZ(vi)
      // Is this vertex on an exposed edge?
      const onLeft = Math.abs(fx - gx) < 0.01 && !isWall(gx - 1, gz)
      const onRight = Math.abs(fx - (gx + 1)) < 0.01 && !isWall(gx + 1, gz)
      const onTop = Math.abs(fz - gz) < 0.01 && !isWall(gx, gz - 1)
      const onBottom = Math.abs(fz - (gz + 1)) < 0.01 && !isWall(gx, gz + 1)
      if (!onLeft && !onRight && !onTop && !onBottom) continue

      checked++
      const dist = nearestRibbonDist(fx, fz)
      if (dist > TOLERANCE) {
        failures++
      }
    }
  }

  return { failures, checked }
}

console.log('Running fast-check (HM): fill edge vertices must coincide with ribbon upper vertices...')
console.log('(10 runs, heightmap codepath)\n')

const result = fc.check(
  fc.property(fc.integer({ min: 1, max: 100_000 }), (seed) => {
    const { failures, checked } = runCheck(seed)
    if (failures > 0) {
      console.log(`  seed=${seed}: ${failures}/${checked} fill edge vertices not near any ribbon vertex`)
      return false
    }
    return true
  }),
  { numRuns: 10, verbose: 1 },
)

if (result.failed) {
  console.log(`\nFAIL: found counterexample after ${result.numRuns} runs`)
  process.exit(1)
} else {
  console.log(`PASS: ${result.numRuns} runs, all fill edge vertices coincide with ribbon (HM codepath)`)
  process.exit(0)
}
