import * as THREE from 'three'
import { FLOOR, WALL, GATE, DEMO_CONFIG } from '../../template/src/level/ca'
import { buildWallFillGeo } from '../../template/src/level/terrain-geo'
import { assembleArenaV2 } from '../../template/src/level/generate'

// Test: every wall cell center must be covered by a fill quad.
// Raycast down at (x+0.5, z+0.5) — if no hit, the fill has a hole.

const arenaResult = assembleArenaV2({ ...DEMO_CONFIG, seed: 42 })
const { grid, zoneMap, worldSize } = arenaResult
const height = 1.2
const margin = 6

const allZones = new Set<number>()
for (let i = 0; i < grid.length; i++) {
  if (grid[i] === WALL || grid[i] === GATE) allZones.add(zoneMap[i])
}

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = []
  let vOff = 0
  for (const g of geos) {
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const n = g.getAttribute('normal') as THREE.BufferAttribute
    const ix = g.getIndex()!
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nrm.push(n.getX(i), n.getY(i), n.getZ(i))
    }
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + vOff)
    vOff += p.count
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  merged.setIndex(idx)
  return merged
}

const fillGeos = [...allZones].map(z => buildWallFillGeo(grid, zoneMap, worldSize, height, z))
const fillMesh = new THREE.Mesh(mergeGeos(fillGeos), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))

const raycaster = new THREE.Raycaster()
const down = new THREE.Vector3(0, -1, 0)
let uncovered = 0
let checked = 0

for (let z = margin; z < worldSize - margin; z++) {
  for (let x = margin; x < worldSize - margin; x++) {
    const i = z * worldSize + x
    if (grid[i] !== WALL && grid[i] !== GATE) continue
    checked++
    raycaster.set(new THREE.Vector3(x + 0.5, height + 5, z + 0.5), down)
    const hits = raycaster.intersectObject(fillMesh)
    const fillHits = hits.filter(h => Math.abs(h.point.y - height) < 0.15)
    if (fillHits.length === 0) {
      uncovered++
      if (uncovered <= 5) {
        // Check neighbors to understand why
        const l = x > 0 ? grid[z * worldSize + (x - 1)] : -1
        const r = x < worldSize - 1 ? grid[z * worldSize + (x + 1)] : -1
        const u = z > 0 ? grid[(z - 1) * worldSize + x] : -1
        const d = z < worldSize - 1 ? grid[(z + 1) * worldSize + x] : -1
        const nbrs = `L=${l} R=${r} U=${u} D=${d}`
        console.log(`  uncovered wall cell (${x},${z}): neighbors [${nbrs}]`)
      }
    }
  }
}

if (uncovered > 0) {
  console.log(`FAIL: ${uncovered}/${checked} wall cells have no fill quad covering their center`)
  process.exit(1)
} else {
  console.log(`PASS: all ${checked} wall cell centers covered by fill`)
  process.exit(0)
}
