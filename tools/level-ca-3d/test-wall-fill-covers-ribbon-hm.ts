import fc from 'fast-check'
import * as THREE from 'three'
import { FLOOR, WALL, GATE, DEMO_CONFIG } from '../../template/src/level/ca'
import type { ArenaConfig } from '../../template/src/level/ca'
import { extractContours, smoothContour } from '../../template/src/level/marching'
import { assembleArenaV2 } from '../../template/src/level/generate'
import { generateHeightmap } from '../../tools/level-heightmap/src/heightmap'
import { buildWallGeoHM, buildWallFillGeoHM } from '../../tools/level-heightmap/src/terrain-geo-hm'

const wallHeight = 1.2
const jitter = 0.0
const margin = 6
const zoneHeights = [0, 0.5, -0.3]
const wallPalettes = [new THREE.Color('#333'), new THREE.Color('#353'), new THREE.Color('#533')]

const MAX_EXPOSED_PCT = 0

function runCheck(seed: number): { exposed: number; checked: number } {
  const config: ArenaConfig = { ...DEMO_CONFIG, seed }
  const { grid, zoneMap, worldSize } = assembleArenaV2(config)
  const heightmap = generateHeightmap(grid, zoneMap, worldSize, zoneHeights, seed)

  const isWall = (x: number, z: number) => {
    if (x < 0 || x >= worldSize || z < 0 || z >= worldSize) return false
    const c = grid[z * worldSize + x]
    return c === WALL || c === GATE
  }

  const contours = extractContours(grid, worldSize, 1, WALL)
  const smoothed = contours.map(c => smoothContour(c, 1))

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

  const mat = new THREE.MeshBasicMaterial({ side: THREE.FrontSide })
  const ribbonMeshes: THREE.Mesh[] = []

  for (const zone of allZones) {
    const zContours = zoneContours.get(zone) || []
    if (zContours.length > 0) {
      const color = wallPalettes[zone] || wallPalettes[0]
      ribbonMeshes.push(new THREE.Mesh(
        buildWallGeoHM(zContours, heightmap, worldSize, wallHeight, jitter, seed + zone, color),
        mat,
      ))
    }
  }

  const fillGeo = buildWallFillGeoHM(grid, zoneMap, worldSize, heightmap, wallHeight, wallPalettes)
  const fillMesh = new THREE.Mesh(fillGeo, mat)

  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  let checked = 0, exposed = 0

  for (let z = margin; z < worldSize - margin; z++) {
    for (let x = margin; x < worldSize - margin; x++) {
      if (!isWall(x, z)) continue

      const samples: [number, number][] = []
      if (!isWall(x + 1, z)) for (let t = 0.2; t <= 0.8; t += 0.3) samples.push([x + 0.9, z + t])
      if (!isWall(x - 1, z)) for (let t = 0.2; t <= 0.8; t += 0.3) samples.push([x + 0.1, z + t])
      if (!isWall(x, z + 1)) for (let t = 0.2; t <= 0.8; t += 0.3) samples.push([x + t, z + 0.9])
      if (!isWall(x, z - 1)) for (let t = 0.2; t <= 0.8; t += 0.3) samples.push([x + t, z + 0.1])

      for (const [sx, sz] of samples) {
        checked++
        const baseY = heightmap[z * worldSize + x] || 0
        raycaster.set(new THREE.Vector3(sx, baseY + wallHeight + 1, sz), down)
        const fillHit = raycaster.intersectObject(fillMesh).length > 0
        if (fillHit) {
          const ribbonHits = ribbonMeshes.flatMap(m => raycaster.intersectObject(m))
          const hasRibbonCap = ribbonHits.some(h =>
            h.face && Math.abs(h.face.normal.y) > 0.9 &&
            Math.abs(h.point.y - (baseY + wallHeight)) < 0.15
          )
          if (!hasRibbonCap) exposed++
        }
      }
    }
  }

  return { exposed, checked }
}

console.log('Running fast-check (HM): fill must have ribbon cap below it at exposed edges...')
console.log(`(10 runs, threshold ${(MAX_EXPOSED_PCT * 100).toFixed(0)}%, heightmap codepath)\n`)

const result = fc.check(
  fc.property(fc.integer({ min: 1, max: 100_000 }), (seed) => {
    const { exposed, checked } = runCheck(seed)
    const pct = checked > 0 ? exposed / checked : 0
    if (pct > MAX_EXPOSED_PCT) {
      console.log(`  seed=${seed}: ${exposed}/${checked} exposed (${(pct * 100).toFixed(1)}%)`)
      return false
    }
    return true
  }),
  { numRuns: 10, verbose: 1 },
)

if (result.failed) {
  console.log(`FAIL: found counterexample after ${result.numRuns} runs`)
  process.exit(1)
} else {
  console.log(`PASS: ${result.numRuns} runs, exposure within threshold (HM codepath)`)
  process.exit(0)
}
