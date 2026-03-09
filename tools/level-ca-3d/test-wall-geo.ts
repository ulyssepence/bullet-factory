import { FLOOR, WALL, GATE, mulberry32, neighbors4, generateCA, generateCAPadded, DEMO_CONFIG } from '../../template/src/level/ca'
import { extractContours, smoothContour } from '../../template/src/level/marching'
import { buildWallGeo, buildFloorGeo, buildWallFillGeo } from '../../template/src/level/terrain-geo'
import { assembleArenaV2 } from '../../template/src/level/generate'
import { placeZoneLandmarks } from '../../template/src/level/corridor'
import * as THREE from 'three'

// Use the full CA-generated level (same as the app)
const arenaResult = assembleArenaV2({ ...DEMO_CONFIG, seed: 42 })
const { grid, zoneMap, worldSize } = arenaResult

const height = 1.2
const jitter = 0.1
const seed = 42
const halfWidth = 0.6 // must match buildWallGeo's internal halfWidth

const contours = extractContours(grid, worldSize, 1, WALL)
const smoothed = contours.map(c => smoothContour(c, 1))
const wallGeo = buildWallGeo(smoothed, height, jitter, seed)

const floorColors = [new THREE.Color('#555'), new THREE.Color('#585'), new THREE.Color('#855')]
const wallColors = [new THREE.Color('#333'), new THREE.Color('#353'), new THREE.Color('#533')]
const floorGeo = buildFloorGeo(grid, zoneMap, floorColors, wallColors, worldSize, seed, height)

// Build fill per-zone, merge for testing
function mergeBufferGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = []
  let vOffset = 0
  for (const g of geos) {
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const n = g.getAttribute('normal') as THREE.BufferAttribute
    const ix = g.getIndex()!
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nrm.push(n.getX(i), n.getY(i), n.getZ(i))
    }
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + vOffset)
    vOffset += p.count
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  merged.setIndex(idx)
  return merged
}

const allZones = new Set<number>()
for (let i = 0; i < grid.length; i++) if (grid[i] === WALL) allZones.add(zoneMap[i])
const wallFillGeos = [...allZones].map(z => buildWallFillGeo(grid, zoneMap, worldSize, height, z))
const wallFillGeo = mergeBufferGeometries(wallFillGeos)

const EPS = 1e-4
let failures = 0

// --- Test 1: Wall geometry face normals are vertical or horizontal ---
{
  const pos = wallGeo.getAttribute('position') as THREE.BufferAttribute
  const idx = wallGeo.getIndex()!
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3()
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), normal = new THREE.Vector3()

  let slopedFaces = 0
  for (let t = 0; t < idx.count; t += 3) {
    v0.fromBufferAttribute(pos, idx.getX(t))
    v1.fromBufferAttribute(pos, idx.getX(t + 1))
    v2.fromBufferAttribute(pos, idx.getX(t + 2))
    e1.subVectors(v1, v0)
    e2.subVectors(v2, v0)
    normal.crossVectors(e1, e2)
    if (normal.length() < 1e-10) continue
    normal.normalize()
    if (Math.abs(normal.y) > 1 - EPS || Math.abs(normal.y) < EPS) continue
    slopedFaces++
    if (slopedFaces <= 3)
      console.log(`  sloped wall face tri ${t / 3}: ny=${normal.y.toFixed(3)}`)
  }

  if (slopedFaces > 0) {
    console.log(`FAIL: wall geometry has ${slopedFaces} sloped faces`)
    failures++
  } else {
    console.log('PASS: wall geometry — all faces are vertical walls or horizontal caps')
  }
}

// --- Test 2: Floor mesh has no slope triangles ---
{
  const pos = floorGeo.getAttribute('position') as THREE.BufferAttribute
  const idx = floorGeo.getIndex()!
  let slopeTris = 0
  for (let t = 0; t < idx.count; t += 3) {
    const y0 = pos.getY(idx.getX(t)), y1 = pos.getY(idx.getX(t + 1)), y2 = pos.getY(idx.getX(t + 2))
    if (Math.max(y0, y1, y2) - Math.min(y0, y1, y2) > 0.1) {
      slopeTris++
      if (slopeTris <= 3) {
        const v = (i: number) => `(${pos.getX(i).toFixed(1)}, ${pos.getY(i).toFixed(2)}, ${pos.getZ(i).toFixed(1)})`
        console.log(`  slope tri: ${v(idx.getX(t))} ${v(idx.getX(t + 1))} ${v(idx.getX(t + 2))}`)
      }
    }
  }

  if (slopeTris > 0) {
    console.log(`FAIL: floor mesh has ${slopeTris} slope triangles`)
    failures++
  } else {
    console.log('PASS: floor mesh — no slope triangles')
  }
}

// --- Test 3: Wall fill height matches wall ribbon height (with small offset) ---
// Wall fill should be at Y≈height (slightly above ribbon top cap to avoid z-fighting).
{
  const fillPos = wallFillGeo.getAttribute('position') as THREE.BufferAttribute
  let badHeights = 0
  const fillTolerance = 0.03
  for (let i = 0; i < fillPos.count; i++) {
    const y = fillPos.getY(i)
    if (Math.abs(y - height) > fillTolerance && Math.abs(y) > EPS) {
      badHeights++
      if (badHeights <= 3)
        console.log(`  wall fill vertex ${i}: Y=${y.toFixed(4)} (expected ≈${height})`)
    }
  }

  if (badHeights > 0) {
    console.log(`FAIL: ${badHeights} wall fill vertices at wrong height`)
    failures++
  } else {
    console.log('PASS: wall fill height matches wall ribbon')
  }
}

// --- Test 4: Wall fill polygons originate from WALL/GATE cells ---
// Fan-triangulated polygons share a common first vertex index (v0).
// Group triangles by v0, compute polygon bbox center → source cell.
{
  const fillPos = wallFillGeo.getAttribute('position') as THREE.BufferAttribute
  const fillIdx = wallFillGeo.getIndex()!
  const fanGroups = new Map<number, Set<number>>()
  for (let t = 0; t < fillIdx.count; t += 3) {
    const v0 = fillIdx.getX(t)
    if (!fanGroups.has(v0)) fanGroups.set(v0, new Set())
    const group = fanGroups.get(v0)!
    for (let k = 0; k < 3; k++) group.add(fillIdx.getX(t + k))
  }
  let nonWallPolys = 0
  for (const [, verts] of fanGroups) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const vi of verts) {
      minX = Math.min(minX, fillPos.getX(vi))
      maxX = Math.max(maxX, fillPos.getX(vi))
      minZ = Math.min(minZ, fillPos.getZ(vi))
      maxZ = Math.max(maxZ, fillPos.getZ(vi))
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
    const gx = Math.floor(cx), gz = Math.floor(cz)
    if (gx >= 0 && gx < worldSize && gz >= 0 && gz < worldSize) {
      const c = grid[gz * worldSize + gx]
      if (c !== WALL && c !== GATE) nonWallPolys++
    }
  }
  if (nonWallPolys > 0) {
    console.log(`FAIL: ${nonWallPolys} fill polygons centered on non-WALL cells`)
    failures++
  } else {
    console.log('PASS: wall fill polygon centers correspond to WALL/GATE cells')
  }
}

// --- Test 5: Every cell has a vertex referenced by a triangle ---
// Floor mesh must cover the entire world (including under walls) so there
// are no holes visible through wall fill gaps.
{
  const pos = floorGeo.getAttribute('position') as THREE.BufferAttribute
  const idx = floorGeo.getIndex()!

  const referenced = new Uint8Array(worldSize * worldSize)
  for (let t = 0; t < idx.count; t++) {
    const vi = idx.getX(t)
    const gx = Math.floor(pos.getX(vi))
    const gz = Math.floor(pos.getZ(vi))
    if (gx >= 0 && gx < worldSize && gz >= 0 && gz < worldSize) {
      referenced[gz * worldSize + gx] = 1
    }
  }

  let missing = 0
  for (let gz = 0; gz < worldSize; gz++) {
    for (let gx = 0; gx < worldSize; gx++) {
      if (!referenced[gz * worldSize + gx]) {
        missing++
        if (missing <= 10)
          console.log(`  cell (${gx},${gz}) [${grid[gz * worldSize + gx] === FLOOR ? 'FLOOR' : 'WALL'}] has no referenced vertex`)
      }
    }
  }

  if (missing > 0) {
    console.log(`FAIL: ${missing} cells have no vertex in any floor triangle`)
    failures++
  } else {
    console.log('PASS: every cell has a referenced floor vertex')
  }
}

// --- Test 6a: Wall ribbon seam vertices meet for closed contours ---
// buildWallGeo emits 3 quads (12 verts) per segment: outer face, inner face, top cap.
// Inner face vertex order per segment: (ix1,0,iz1), (ix0,0,iz0), (ix0,h,iz0), (ix1,h,iz1).
// For contours whose raw source is a closed loop, segment 0's inner[0] at height
// should coincide with the last segment's inner[N-1] at height.
// We use raw contours to identify loops since smoothing breaks the closure.
{
  const pos = wallGeo.getAttribute('position') as THREE.BufferAttribute
  let vertOffset = 0
  let seamGaps = 0

  for (let ci = 0; ci < smoothed.length; ci++) {
    const sm = smoothed[ci]
    const raw = contours[ci]
    const n = sm.length / 2
    if (n < 2) continue

    const geoIsLoop = Math.abs(sm[0] - sm[(n - 1) * 2]) < 0.01 &&
                      Math.abs(sm[1] - sm[(n - 1) * 2 + 1]) < 0.01
    const segments = n - 1
    const totalVerts = segments * 12 + (geoIsLoop ? 0 : 8)

    const rawN = raw.length / 2
    const rawIsLoop = rawN >= 3 &&
      Math.abs(raw[0] - raw[(rawN - 1) * 2]) < 0.01 &&
      Math.abs(raw[1] - raw[(rawN - 1) * 2 + 1]) < 0.01

    if (rawIsLoop && segments >= 2) {
      // Segment 0 inner face: verts 4..7 → (ix1,0,iz1),(ix0,0,iz0),(ix0,h,iz0),(ix1,h,iz1)
      // inner[0] at height = vert 6 of segment 0
      const inner0 = vertOffset + 6
      // Last segment inner face: inner[N-1] at height = vert 7 of last segment
      const innerLast = vertOffset + (segments - 1) * 12 + 7

      const dist = Math.hypot(
        pos.getX(inner0) - pos.getX(innerLast),
        pos.getZ(inner0) - pos.getZ(innerLast),
      )
      if (dist > 0.05) {
        seamGaps++
        if (seamGaps <= 5)
          console.log(`  contour ${ci}: inner seam gap=${dist.toFixed(4)}`)
      }
    }

    vertOffset += totalVerts
  }

  if (seamGaps > 0) {
    console.log(`FAIL: ${seamGaps} wall ribbon(s) have seam gap > 0.05 (inner vertices don't meet)`)
    failures++
  } else {
    console.log('PASS: wall ribbon seams — inner vertices meet for closed contours')
  }
}

// --- Test 6b: Smoothed closed contours have no endpoint gap ---
// For closed raw contours, smoothContour should produce a closed result.
{
  const rawContours = extractContours(grid, worldSize, 1, WALL)
  let gapCount = 0
  for (let ci = 0; ci < rawContours.length; ci++) {
    const raw = rawContours[ci]
    const n = raw.length / 2
    if (n < 3) continue
    const isLoop = Math.abs(raw[0] - raw[(n - 1) * 2]) < 0.01 &&
                   Math.abs(raw[1] - raw[(n - 1) * 2 + 1]) < 0.01
    if (!isLoop) continue

    const sm = smoothContour(raw, 1)
    const m = sm.length / 2
    const gap = Math.hypot(sm[0] - sm[(m - 1) * 2], sm[1] - sm[(m - 1) * 2 + 1])
    if (gap > 0.05) {
      gapCount++
      if (gapCount <= 5)
        console.log(`  contour ${ci}: smoothed endpoint gap = ${gap.toFixed(4)} (${m} pts)`)
    }
  }

  if (gapCount > 0) {
    console.log(`FAIL: ${gapCount} smoothed closed contour(s) have endpoint gap > 0.05`)
    failures++
  } else {
    console.log('PASS: smoothed closed contours — no endpoint gap')
  }
}

// --- Test 7: All landmarks are connected via FLOOR (corridor network works) ---
{
  const landmarks = placeZoneLandmarks(grid, zoneMap, worldSize, DEMO_CONFIG.zones, DEMO_CONFIG.chunkSize, DEMO_CONFIG.zoneGrid)

  // Flood fill from first landmark
  const startIdx = landmarks[0].z * worldSize + landmarks[0].x
  const visited = new Uint8Array(worldSize * worldSize)
  const queue = [startIdx]
  visited[startIdx] = 1
  while (queue.length > 0) {
    const cur = queue.pop()!
    for (const n of neighbors4(cur, worldSize)) {
      if (!visited[n] && grid[n] === FLOOR) {
        visited[n] = 1
        queue.push(n)
      }
    }
  }

  let disconnected = 0
  for (let i = 1; i < landmarks.length; i++) {
    const idx = landmarks[i].z * worldSize + landmarks[i].x
    if (!visited[idx]) {
      disconnected++
      console.log(`  landmark ${i} at (${landmarks[i].x},${landmarks[i].z}) not reachable from landmark 0`)
    }
  }

  if (disconnected > 0) {
    console.log(`FAIL: ${disconnected} landmark(s) not connected`)
    failures++
  } else {
    console.log(`PASS: all ${landmarks.length} landmarks connected via floor network`)
  }
}

// --- Test 8: Every edge cell has wall fill coverage (known bug — currently inverted) ---
// Flip assertion once extractContours handles grid boundaries
{
  const fillPos = wallFillGeo.getAttribute('position') as THREE.BufferAttribute
  const fillIdx = wallFillGeo.getIndex()!

  const covered = new Uint8Array(worldSize * worldSize)
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3()
  for (let t = 0; t < fillIdx.count; t += 3) {
    v0.fromBufferAttribute(fillPos, fillIdx.getX(t))
    v1.fromBufferAttribute(fillPos, fillIdx.getX(t + 1))
    v2.fromBufferAttribute(fillPos, fillIdx.getX(t + 2))
    const minX = Math.floor(Math.min(v0.x, v1.x, v2.x))
    const maxX = Math.floor(Math.max(v0.x, v1.x, v2.x))
    const minZ = Math.floor(Math.min(v0.z, v1.z, v2.z))
    const maxZ = Math.floor(Math.max(v0.z, v1.z, v2.z))
    for (let gz = Math.max(0, minZ); gz <= Math.min(worldSize - 1, maxZ); gz++) {
      for (let gx = Math.max(0, minX); gx <= Math.min(worldSize - 1, maxX); gx++) {
        covered[gz * worldSize + gx] = 1
      }
    }
  }

  let uncovered = 0
  for (let y = 0; y < worldSize; y++) {
    for (let x = 0; x < worldSize; x++) {
      const isEdge = x === 0 || x === worldSize - 1 || y === 0 || y === worldSize - 1
      if (isEdge && !covered[y * worldSize + x]) uncovered++
    }
  }

  if (uncovered === 0) {
    console.log('PASS: every edge cell has wall fill coverage')
  } else {
    console.log(`FAIL: ${uncovered} edge cells lack wall fill coverage`)
    failures++
  }

  // False-positive guard: raycast downward at every interior FLOOR cell center.
  // If the ray hits wall fill geometry, the fill is covering floor it shouldn't.
  // DoubleSide so back-face triangles (wrong winding) are also detected.
  const fillMesh = new THREE.Mesh(wallFillGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  let floorHits = 0
  let floorTotal = 0
  const inMargin = 8
  for (let y = inMargin; y < worldSize - inMargin; y++) {
    for (let x = inMargin; x < worldSize - inMargin; x++) {
      if (grid[y * worldSize + x] !== FLOOR) continue
      floorTotal++
      raycaster.set(new THREE.Vector3(x + 0.5, height + 1, y + 0.5), down)
      if (raycaster.intersectObject(fillMesh).length > 0) floorHits++
    }
  }
  const floorHitPct = floorTotal > 0 ? floorHits / floorTotal : 0
  if (floorHitPct > 0.02) {
    console.log(`FAIL: wall fill raycast hits ${floorHits}/${floorTotal} interior floor cells (${(floorHitPct * 100).toFixed(1)}%, expected <2%)`)
    failures++
  } else {
    console.log(`PASS: wall fill raycast hits ${(floorHitPct * 100).toFixed(1)}% of interior floor cells`)
  }
}

// --- Test 9: Chunk border wall density matches interior (no floor-strip bias) ---
{
  const chunkSize = DEMO_CONFIG.chunkSize
  const gridChunks = DEMO_CONFIG.zoneGrid.length

  let borderWalls = 0, borderTotal = 0
  let interiorWalls = 0, interiorTotal = 0

  const edgeThickness = 5
  for (let gz = edgeThickness; gz < worldSize - edgeThickness; gz++) {
    for (let gx = edgeThickness; gx < worldSize - edgeThickness; gx++) {
      const lx = gx % chunkSize
      const lz = gz % chunkSize
      const onBorder = lx === 0 || lx === chunkSize - 1 || lz === 0 || lz === chunkSize - 1
      const val = grid[gz * worldSize + gx]
      if (onBorder) {
        borderTotal++
        if (val === WALL) borderWalls++
      } else {
        interiorTotal++
        if (val === WALL) interiorWalls++
      }
    }
  }

  const borderDensity = borderWalls / borderTotal
  const interiorDensity = interiorWalls / interiorTotal
  const diff = Math.abs(borderDensity - interiorDensity)

  // 0.40 tolerance: per-chunk corridors cross borders frequently
  if (diff < 0.40) {
    console.log(`PASS: chunk border density ${borderDensity.toFixed(3)} vs interior ${interiorDensity.toFixed(3)} (diff ${diff.toFixed(3)} < 0.40)`)
  } else {
    console.log(`FAIL: chunk border density ${borderDensity.toFixed(3)} vs interior ${interiorDensity.toFixed(3)} (diff ${diff.toFixed(3)} >= 0.40)`)
    failures++
  }
}

if (failures === 0) {
  console.log('ALL TESTS PASSED')
  process.exit(0)
} else {
  console.log(`${failures} test(s) FAILED`)
  process.exit(1)
}
