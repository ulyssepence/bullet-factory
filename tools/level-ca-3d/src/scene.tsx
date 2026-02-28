import React, { useMemo, useEffect, useRef, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { ArenaResult, WALL, HAZARD } from '../../../template/src/level/generate'
import type { ZoneDef } from '../../../template/src/level/ca'
import { extractContours, smoothContour } from '../../../template/src/level/marching'
import { buildWallGeo, buildFloorGeo, buildWallFillGeo } from '../../../template/src/level/terrain-geo'
import { scatterProps } from '../../../template/src/level/props'
import { GrayboxMaterial, SurfaceStyle } from '../../../template/src/graybox-material'

export type ZonePalette = {
  floor: string
  wallColor: string
  wallStyle: SurfaceStyle
}

const DEFAULT_PALETTES: ZonePalette[] = [
  { floor: '#2a3a4a', wallColor: '#5a6a7a', wallStyle: 'slate' },
  { floor: '#2a4a2a', wallColor: '#4a6a3a', wallStyle: 'moss' },
  { floor: '#4a3a2a', wallColor: '#7a6a4a', wallStyle: 'rough' },
]

function WallMesh({ geo, color, style, polygonOffsetFactor, polygonOffsetUnits }: {
  geo: THREE.BufferGeometry; color: string; style: SurfaceStyle
  polygonOffsetFactor?: number; polygonOffsetUnits?: number
}) {
  const ref = useRef<THREE.Mesh>(null!)
  useLayoutEffect(() => {
    if (ref.current?.material) {
      (ref.current.material as THREE.Material).side = THREE.DoubleSide
    }
  })
  const usePO = polygonOffsetFactor != null
  return (
    <mesh ref={ref} geometry={geo} castShadow receiveShadow>
      <GrayboxMaterial color={color} style={style}
        polygonOffset={usePO} polygonOffsetFactor={polygonOffsetFactor} polygonOffsetUnits={polygonOffsetUnits} />
    </mesh>
  )
}

export function TerrainScene({
  result,
  palettes = DEFAULT_PALETTES,
  seed = 0,
  showGrid = false,
  zones,
  smoothingOverride,
}: {
  result: ArenaResult
  palettes?: ZonePalette[]
  seed?: number
  showGrid?: boolean
  zones?: ZoneDef[]
  smoothingOverride?: number
}) {
  const { grid, zoneMap, worldSize } = result
  const cellSize = 1

  const { floorGeo, wallGeos, propData } = useMemo(() => {
    const floorColors = palettes.map(p => new THREE.Color(p.floor))
    const wallColors = palettes.map(p => new THREE.Color(p.wallColor))
    const fg = buildFloorGeo(grid, zoneMap, floorColors, wallColors, worldSize, seed)

    // Extract wall contours on full grid
    const rawContours = extractContours(grid, worldSize, cellSize, WALL)

    // Group raw contours by zone (based on midpoint), then smooth per-zone
    const zoneContours: Map<number, Float32Array[]> = new Map()
    for (const c of rawContours) {
      if (c.length < 4) continue
      const midIdx = Math.floor(c.length / 4) * 2
      const mx = c[midIdx]
      const mz = c[midIdx + 1]
      const gx = Math.min(worldSize - 1, Math.max(0, Math.floor(mx / cellSize)))
      const gz = Math.min(worldSize - 1, Math.max(0, Math.floor(mz / cellSize)))
      const zone = zoneMap[gz * worldSize + gx]
      const passes = smoothingOverride ?? zones?.[zone]?.smoothingPasses ?? 2
      const smoothed = smoothContour(c, passes)
      if (!zoneContours.has(zone)) zoneContours.set(zone, [])
      zoneContours.get(zone)!.push(smoothed)
    }

    const wg: { zone: number; geo: THREE.BufferGeometry; fillGeo: THREE.BufferGeometry }[] = []
    const allZones = new Set<number>([...zoneContours.keys()])
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === WALL) allZones.add(zoneMap[i])
    }
    for (const zone of allZones) {
      const contours = zoneContours.get(zone) || []
      const geo = contours.length > 0 ? buildWallGeo(contours, 1.2, 0.12, seed + zone) : new THREE.BufferGeometry()
      const fillGeo = buildWallFillGeo(grid, zoneMap, worldSize, 1.2, zone)
      wg.push({ zone, geo, fillGeo })
    }

    const pd = scatterProps(grid, worldSize, seed)

    return { floorGeo: fg, wallGeos: wg, propData: pd }
  }, [grid, zoneMap, worldSize, seed, palettes, zones, smoothingOverride])

  // Cleanup
  const prevGeos = useRef<THREE.BufferGeometry[]>([])
  useEffect(() => {
    const geos = [floorGeo, ...wallGeos.flatMap(w => [w.geo, w.fillGeo])]
    return () => { for (const g of geos) g.dispose() }
  }, [floorGeo, wallGeos])

  // Props instanced mesh
  const propsRef = useRef<THREE.InstancedMesh>(null!)
  useEffect(() => {
    if (!propsRef.current) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    for (let i = 0; i < propData.count; i++) {
      p.set(propData.positions[i * 3], propData.positions[i * 3 + 1], propData.positions[i * 3 + 2])
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), propData.rotations[i])
      const sc = propData.scales[i]
      s.set(sc, sc, sc)
      m.compose(p, q, s)
      propsRef.current.setMatrixAt(i, m)
    }
    propsRef.current.instanceMatrix.needsUpdate = true
  }, [propData])

  return (
    <group>
      {/* Floor */}
      <mesh geometry={floorGeo} receiveShadow>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide}
          polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
      </mesh>

      {/* Walls per zone */}
      {wallGeos.map(({ zone, geo, fillGeo }) => {
        const p = palettes[zone] || palettes[0]
        return (
          <group key={zone}>
            <WallMesh geo={geo} color={p.wallColor} style={p.wallStyle} />
            <WallMesh geo={fillGeo} color={p.wallColor} style={p.wallStyle} polygonOffsetFactor={1} polygonOffsetUnits={1} />
          </group>
        )
      })}

      {/* Props */}
      {propData.count > 0 && (
        <instancedMesh ref={propsRef} args={[undefined, undefined, propData.count]} castShadow frustumCulled={false}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.9} />
        </instancedMesh>
      )}

      {/* Debug grid overlay */}
      {showGrid && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={(() => {
                const lines = (worldSize + 1) * 2
                return lines * 2
              })()}
              array={(() => {
                const pts: number[] = []
                const s = worldSize * cellSize
                for (let i = 0; i <= worldSize; i++) {
                  const p = i * cellSize
                  pts.push(p, 0.01, 0, p, 0.01, s) // vertical
                  pts.push(0, 0.01, p, s, 0.01, p) // horizontal
                }
                return new Float32Array(pts)
              })()}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#ffffff" opacity={0.1} transparent />
        </lineSegments>
      )}

      {/* Lighting — very bright for debug */}
      <ambientLight intensity={2.0} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={2.0}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
    </group>
  )
}
