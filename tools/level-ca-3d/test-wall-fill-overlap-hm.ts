import fc from 'fast-check'
import * as THREE from 'three'
import { FLOOR, WALL, GATE, DEMO_CONFIG } from '../../template/src/level/ca'
import type { ArenaConfig } from '../../template/src/level/ca'
import { assembleArenaV2 } from '../../template/src/level/generate'
import { generateHeightmap } from '../../tools/level-heightmap/src/heightmap'
import { buildWallFillGeoHM } from '../../tools/level-heightmap/src/terrain-geo-hm'

const wallHeight = 1.2
const margin = 6
const zoneHeights = [0, 0.5, -0.3]

function runCheck(seed: number): { overlapCells: number; checkedCells: number } {
  const config: ArenaConfig = { ...DEMO_CONFIG, seed }
  const { grid, zoneMap, worldSize } = assembleArenaV2(config)
  const heightmap = generateHeightmap(grid, zoneMap, worldSize, zoneHeights, seed)

  const wallPalettes = [new THREE.Color('#555'), new THREE.Color('#666'), new THREE.Color('#777')]
  const fillGeo = buildWallFillGeoHM(grid, zoneMap, worldSize, heightmap, wallHeight, wallPalettes)
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const fillMesh = new THREE.Mesh(fillGeo, mat)

  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  let overlapCells = 0, checkedCells = 0

  for (let z = margin; z < worldSize - margin; z++) {
    for (let x = margin; x < worldSize - margin; x++) {
      const i = z * worldSize + x
      if (grid[i] !== WALL && grid[i] !== GATE) continue
      checkedCells++

      const baseY = heightmap[i] || 0
      raycaster.set(new THREE.Vector3(x + 0.5, baseY + wallHeight + 1, z + 0.5), down)
      const hits = raycaster.intersectObject(fillMesh)
      const capHits = hits.filter(h => {
        if (!h.face || Math.abs(h.face.normal.y) <= 0.9) return false
        return Math.abs(h.point.y - (baseY + wallHeight + 0.02)) < 0.15
      })
      // DoubleSide + indexed quad = 2 triangle intersections per cell
      if (capHits.length !== 2) overlapCells++
    }
  }

  return { overlapCells, checkedCells }
}

console.log('Running fast-check (HM): exactly 1 fill cap hit per wall cell...')
console.log('(10 runs, raycast fill-only check, heightmap codepath)\n')

const result = fc.check(
  fc.property(fc.integer({ min: 1, max: 100_000 }), (seed) => {
    const { overlapCells, checkedCells } = runCheck(seed)
    if (overlapCells > 0) {
      console.log(`  seed=${seed}: ${overlapCells}/${checkedCells} cells without exactly 1 fill cap`)
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
  console.log(`PASS: ${result.numRuns} runs, exactly 1 fill cap per wall cell (HM codepath)`)
  process.exit(0)
}
