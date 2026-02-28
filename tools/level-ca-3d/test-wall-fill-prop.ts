import fc from 'fast-check'
import * as THREE from 'three'
import { FLOOR, WALL, DEMO_CONFIG } from '../../template/src/level/ca'
import type { ArenaConfig } from '../../template/src/level/ca'
import { buildWallFillGeo } from '../../template/src/level/terrain-geo'
import { assembleArenaV2 } from '../../template/src/level/generate'

function buildFill(
  grid: Uint8Array, zoneMap: Uint8Array, worldSize: number, height: number,
): THREE.BufferGeometry[] {
  const zones = new Set<number>()
  for (let i = 0; i < grid.length; i++) if (grid[i] === WALL) zones.add(zoneMap[i])
  return [...zones].map(z => buildWallFillGeo(grid, zoneMap, worldSize, height, z))
}

function checkFloorNotCovered(
  grid: Uint8Array, worldSize: number, fillGeos: THREE.BufferGeometry[], height: number,
): { floorHits: number; floorTotal: number } {
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const meshes = fillGeos.map(g => new THREE.Mesh(g, mat))
  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)

  // Sample interior floor cells (skip border)
  const margin = 6
  let floorHits = 0, floorTotal = 0
  for (let y = margin; y < worldSize - margin; y++) {
    for (let x = margin; x < worldSize - margin; x++) {
      if (grid[y * worldSize + x] !== FLOOR) continue
      floorTotal++
      raycaster.set(new THREE.Vector3(x + 0.5, height + 1, y + 0.5), down)
      for (const mesh of meshes) {
        if (raycaster.intersectObject(mesh).length > 0) {
          floorHits++
          break
        }
      }
    }
  }
  for (const g of fillGeos) g.dispose()
  return { floorHits, floorTotal }
}

const arbConfig = fc.record({
  seed: fc.integer({ min: 1, max: 100_000 }),
  density0: fc.double({ min: 0.40, max: 0.70, noNaN: true }),
  density1: fc.double({ min: 0.40, max: 0.70, noNaN: true }),
  density2: fc.double({ min: 0.40, max: 0.70, noNaN: true }),
})

const height = 1.2

function makeConfig(seed: number, d0: number, d1: number, d2: number): ArenaConfig {
  return {
    ...DEMO_CONFIG,
    seed,
    zones: DEMO_CONFIG.zones.map((z, i) => ({ ...z, density: [d0, d1, d2][i] })),
  }
}

console.log('Running fast-check: wall fill must not cover interior floor cells...')
console.log('(10 runs, per-zone fill matching scene.tsx, DoubleSide raycast)\n')

const result = fc.check(
  fc.property(arbConfig, ({ seed, density0, density1, density2 }) => {
    const config = makeConfig(seed, density0, density1, density2)
    const { grid, zoneMap, worldSize } = assembleArenaV2(config)
    const fillGeos = buildFill(grid, zoneMap, worldSize, height)
    const { floorHits, floorTotal } = checkFloorNotCovered(grid, worldSize, fillGeos, height)

    const pct = floorTotal > 0 ? floorHits / floorTotal : 0
    if (pct > 0.02) return false
    return true
  }),
  { numRuns: 10, verbose: 1 },
)

if (result.failed) {
  const c = (result as any).counterexample?.[0]
  console.log(`FAIL: found counterexample after ${result.numRuns} runs`)
  if (c) {
    console.log(`  seed=${c.seed} densities=[${c.density0.toFixed(3)}, ${c.density1.toFixed(3)}, ${c.density2.toFixed(3)}]`)
    const config = makeConfig(c.seed, c.density0, c.density1, c.density2)
    const { grid, zoneMap, worldSize } = assembleArenaV2(config)
    const fillGeos = buildFill(grid, zoneMap, worldSize, height)
    const { floorHits, floorTotal } = checkFloorNotCovered(grid, worldSize, fillGeos, height)
    console.log(`  floor hits: ${floorHits}/${floorTotal} (${(floorHits/floorTotal*100).toFixed(1)}%)`)
  }
  process.exit(1)
} else {
  console.log(`PASS: ${result.numRuns} runs, no floor coverage violations`)
  process.exit(0)
}
