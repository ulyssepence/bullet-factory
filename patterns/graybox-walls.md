# Graybox Walls

Render walls as extruded graybox geometry using marching-squares contours, not instanced GLB meshes. This produces walls that respond to lighting, have bump-mapped surface detail, and integrate visually with the floor.

## Pipeline

```
grid (Uint8Array) → extractContours(grid, worldSize, cellSize, WALL)
                  → smoothContour(c, 3) per contour
                  → group by zone via zoneMap
                  → buildWallGeo(contours, height, jitter, seed, opts) per zone  [ribbon — vertical faces]
                  → extractRibbonUpperXZ(ribbonGeo)                              [snap points for caps]
                  → buildWallFillGeo(grid, zoneMap, worldSize, height, zone, opts) per zone  [cap — flat tops]
                  → mergeGeometries(parts)
                  → render with <GrayboxMaterial color="#ffffff" style="slate" vertexColors />
```

## Imports

```ts
import { buildWallGeo, buildWallFillGeo, extractRibbonUpperXZ } from '../../../template/src/level/terrain-geo'
import { extractContours, smoothContour } from '../../../template/src/level/marching'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
```

## Implementation

```tsx
const { wallRibbonGeo, wallFillGeo } = useMemo(() => {
  const rawContours = extractContours(grid, worldSize, 1, WALL)
  const smoothed = rawContours.map(c => smoothContour(c, 3))

  // Collect all wall zones
  const allZones = new Set<number>()
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === WALL) allZones.add(zoneMap[i])
  }

  // Assign contours to zones by sampling the midpoint
  const zoneContours = new Map<number, typeof smoothed>()
  for (const contour of smoothed) {
    const n = contour.length / 2
    const midIdx = Math.floor(n / 2)
    const mx = contour[midIdx * 2], mz = contour[midIdx * 2 + 1]
    const gx = Math.floor(mx), gz = Math.floor(mz)
    const gi = Math.max(0, Math.min(worldSize - 1, gz)) * worldSize
            + Math.max(0, Math.min(worldSize - 1, gx))
    const zone = zoneMap[gi] ?? 0
    if (!zoneContours.has(zone)) zoneContours.set(zone, [])
    zoneContours.get(zone)!.push(contour)
  }

  // Build ribbon (vertical wall faces) per zone
  const ribbonParts: THREE.BufferGeometry[] = []
  const ribbonUpperXZ: [number, number][] = []
  for (const zone of allZones) {
    const contours = zoneContours.get(zone) || []
    if (contours.length === 0) continue
    const zoneColor = ZONE_WALL_PALETTES[zone] || ZONE_WALL_PALETTES[0]
    const rGeo = buildWallGeo(contours, WALL_HEIGHT, 0, seed + zone, {
      color: zoneColor, innerScale: 1.0,
      sampleY: sampleY ?? (() => 0),
    })
    // Use a loop — spread into push() overflows the call stack on large maps
    for (const pt of extractRibbonUpperXZ(rGeo)) ribbonUpperXZ.push(pt)
    ribbonParts.push(rGeo)
  }
  const mergedRibbon = ribbonParts.length > 0
    ? (mergeGeometries(ribbonParts, false) ?? new THREE.BufferGeometry())
    : new THREE.BufferGeometry()
  for (const rp of ribbonParts) rp.dispose()

  // Build fill caps (flat tops) per zone, snapped to ribbon
  const fillParts: THREE.BufferGeometry[] = []
  for (const zone of allZones) {
    const zoneColor = ZONE_WALL_PALETTES[zone] || ZONE_WALL_PALETTES[0]
    fillParts.push(buildWallFillGeo(grid, zoneMap, worldSize, WALL_HEIGHT, zone, {
      color: zoneColor,
      sampleY: sampleY ?? (() => 0),
      ribbonUpperXZ,
    }))
  }
  const mergedFill = fillParts.length > 0
    ? (mergeGeometries(fillParts, false) ?? new THREE.BufferGeometry())
    : new THREE.BufferGeometry()
  for (const fp of fillParts) fp.dispose()

  return { wallRibbonGeo: mergedRibbon, wallFillGeo: mergedFill }
}, [grid, zoneMap, worldSize, seed, sampleY])
```

## Rendering

```tsx
<mesh geometry={wallRibbonGeo} castShadow>
  <GrayboxMaterial color="#ffffff" style="slate" vertexColors />
</mesh>
<mesh geometry={wallFillGeo}>
  <GrayboxMaterial color="#ffffff" style="slate" vertexColors
    polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
</mesh>
```

Use `color="#ffffff"` with `vertexColors` — the per-vertex colors from `buildWallGeo`/`buildWallFillGeo` carry the zone palette colors. The `polygonOffset` on the fill cap prevents z-fighting where the cap meets the ribbon top edge.

## Key gotchas

- **Do not spread `extractRibbonUpperXZ` into `push()`** — large maps produce thousands of points, overflowing the call stack. Use a `for...of` loop instead.
- **`smoothContour(c, 3)`** smooths jagged marching-squares output. 3 passes is a good default.
- **Reference implementation:** `tools/level-heightmap/src/scene.tsx` lines 83-130.
- **Style choice:** `"slate"` works well for stone/castle walls. Other good wall styles: `"brick"`, `"cobblestone"`, `"worn"`.
