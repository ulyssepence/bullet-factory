import * as THREE from 'three'
import { WALL, GATE, DEMO_CONFIG } from '../../template/src/level/ca'
import { buildWallFillGeo } from '../../template/src/level/terrain-geo'
import { assembleArenaV2 } from '../../template/src/level/generate'

// Fill quads must face UPWARD (normal.y > 0) so they're visible from the
// gameplay camera. FrontSide raycast from above: if the winding is wrong
// (downward-facing), rays won't hit anything.

const arenaResult = assembleArenaV2({ ...DEMO_CONFIG, seed: 42 })
const { grid, zoneMap, worldSize } = arenaResult
const height = 1.2
const margin = 6

const allZones = new Set<number>()
for (let i = 0; i < grid.length; i++) {
  if (grid[i] === WALL || grid[i] === GATE) allZones.add(zoneMap[i])
}

const fillGeos = [...allZones].map(z => buildWallFillGeo(grid, zoneMap, worldSize, height, z))
const mat = new THREE.MeshBasicMaterial({ side: THREE.FrontSide })
const meshes = fillGeos.map(g => new THREE.Mesh(g, mat))

const raycaster = new THREE.Raycaster()
const down = new THREE.Vector3(0, -1, 0)
let checked = 0
let hits = 0

for (let z = margin; z < worldSize - margin; z++) {
  for (let x = margin; x < worldSize - margin; x++) {
    const i = z * worldSize + x
    if (grid[i] !== WALL && grid[i] !== GATE) continue
    checked++
    raycaster.set(new THREE.Vector3(x + 0.5, height + 1, z + 0.5), down)
    for (const mesh of meshes) {
      if (raycaster.intersectObject(mesh).length > 0) {
        hits++
        break
      }
    }
  }
}

const hitPct = checked > 0 ? hits / checked : 0
if (hitPct < 0.95) {
  console.log(`FAIL: FrontSide raycast hits only ${hits}/${checked} wall cells (${(hitPct * 100).toFixed(1)}%) — fill quads face wrong direction`)
  process.exit(1)
} else {
  console.log(`PASS: FrontSide raycast hits ${hits}/${checked} wall cells (${(hitPct * 100).toFixed(1)}%)`)
  process.exit(0)
}
