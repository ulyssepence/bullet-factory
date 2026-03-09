import fc from 'fast-check'
import * as THREE from 'three'
import { FLOOR, WALL, GATE, DEMO_CONFIG } from '../../template/src/level/ca'
import type { ArenaConfig } from '../../template/src/level/ca'
import { extractContours, smoothContour } from '../../template/src/level/marching'
import { buildWallGeo, buildWallFillGeo } from '../../template/src/level/terrain-geo'
import { assembleArenaV2 } from '../../template/src/level/generate'

const height = 1.2
const jitter = 0.1
const margin = 6

function runCheck(seed: number): { overlapCells: number; checkedCells: number } {
  const config: ArenaConfig = { ...DEMO_CONFIG, seed }
  const { grid, zoneMap, worldSize } = assembleArenaV2(config)

  const contours = extractContours(grid, worldSize, 1, WALL)
  const smoothed = contours.map(c => smoothContour(c, 1))

  const zoneContours = new Map<number, Float32Array[]>()
  for (const c of smoothed) {
    const mx = c[0], mz = c[1]
    const gx = Math.floor(mx), gz = Math.floor(mz)
    if (gx < 0 || gx >= worldSize || gz < 0 || gz >= worldSize) continue
    const zone = zoneMap[gz * worldSize + gx]
    if (!zoneContours.has(zone)) zoneContours.set(zone, [])
    zoneContours.get(zone)!.push(c)
  }

  const allZones = new Set<number>([...zoneContours.keys()])
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === WALL || grid[i] === GATE) allZones.add(zoneMap[i])
  }

  const allMeshes: THREE.Mesh[] = []
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })

  for (const zone of allZones) {
    const zContours = zoneContours.get(zone) || []
    if (zContours.length > 0) {
      allMeshes.push(new THREE.Mesh(buildWallGeo(zContours, height, jitter, seed + zone), mat))
    }
    allMeshes.push(new THREE.Mesh(buildWallFillGeo(grid, zoneMap, worldSize, height, zone), mat))
  }

  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  let overlapCells = 0, checkedCells = 0

  for (let z = margin; z < worldSize - margin; z++) {
    for (let x = margin; x < worldSize - margin; x++) {
      const i = z * worldSize + x
      if (grid[i] !== WALL && grid[i] !== GATE) continue
      checkedCells++
      raycaster.set(new THREE.Vector3(x + 0.5, height + 5, z + 0.5), down)
      const hits = raycaster.intersectObjects(allMeshes)
      const topHits = hits.filter(h => {
        if (Math.abs(h.point.y - height) > 0.15) return false
        return h.face && Math.abs(h.face.normal.y) > 0.9
      })
      const yCounts = new Map<number, number>()
      for (const h of topHits) {
        const y = Math.round(h.point.y * 1000)
        yCounts.set(y, (yCounts.get(y) || 0) + 1)
      }
      for (const count of yCounts.values()) {
        if (count > 2) { overlapCells++; break }
      }
    }
  }

  return { overlapCells, checkedCells }
}

console.log('Running fast-check: no same-Y overlapping horizontal quads...')
console.log('(10 runs over random seeds)\n')

const result = fc.check(
  fc.property(fc.integer({ min: 1, max: 100_000 }), (seed) => {
    const { overlapCells, checkedCells } = runCheck(seed)
    if (overlapCells > 0) {
      console.log(`  seed=${seed}: ${overlapCells}/${checkedCells} overlap cells`)
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
  console.log(`PASS: ${result.numRuns} runs, no overlapping horizontal quads`)
  process.exit(0)
}
