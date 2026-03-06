import React, { useMemo, useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FLOOR, WALL } from '../../../template/src/level/ca'
import type { ArenaResult } from '../../../template/src/level/generate'
import { extractContours, smoothContour } from '../../../template/src/level/marching'
import { scatterProps } from '../../../template/src/level/props'
import { GrayboxMaterial, getStyleConfig } from '../../../template/src/graybox-material'
import { bakeNoiseTexture } from '../../../template/src/noise-texture'
import { buildFloorGeoHM, buildWallGeoHM, buildWallFillGeoHM } from './terrain-geo-hm'
import { sampleHeight } from './heightmap'
import { buildSpeedOverlayGeo, buildHeightmapOverlayGeo } from './speed'
import { openGate } from './gate'
import type { Gate } from './gate'
import { spawnEntities, updateEntities } from './entities'
import type { Entity } from './entities'
import * as profile from '../../../template/src/profile'

const PALETTES = [
  { floor: '#2a3a4a', wallColor: '#5a6a7a' },
  { floor: '#2a4a2a', wallColor: '#4a6a3a' },
  { floor: '#4a3a2a', wallColor: '#7a6a4a' },
]

const ZONE_COLORS = [new THREE.Color('#4a8acc'), new THREE.Color('#4acc6a'), new THREE.Color('#cc8a4a')]

export function TerrainScene({
  result,
  heightmap,
  speedGrid,
  seed = 0,
  showGrid = false,
  showSpeed = false,
  showHeightmap = false,
  smoothingOverride,
  landmarkPos,
  gate,
  gateTimer = 10,
  onGateOpen,
  entityCount = 20,
  chestTimer = 15,
  rebuildKey = 0,
}: {
  result: ArenaResult
  heightmap: Float32Array
  speedGrid: Float32Array
  seed?: number
  showGrid?: boolean
  showSpeed?: boolean
  showHeightmap?: boolean
  smoothingOverride?: number
  landmarkPos?: [number, number]
  gate: Gate | null
  gateTimer?: number
  onGateOpen?: () => void
  entityCount?: number
  chestTimer?: number
  rebuildKey?: number
}) {
  const { grid, zoneMap, worldSize } = result
  const cellSize = 1
  const gl = useThree(s => s.gl)
  useEffect(() => { if (__PROFILE__) profile.renderer(gl) }, [gl])

  const noiseTex = useMemo(() => {
    const cfg = getStyleConfig('slate')
    return bakeNoiseTexture(gl, {
      noise: cfg.noiseType,
      scale: [cfg.bakedTexScale, cfg.bakedTexScale],
      octaves: cfg.octaves,
      width: 256,
      height: 256,
    })
  }, [gl])

  const { floorGeo, wallRibbonGeo, wallFillGeo, propData } = useMemo(() => {
    const floorColors = PALETTES.map(p => new THREE.Color(p.floor))
    const wallColors = PALETTES.map(p => new THREE.Color(p.wallColor))
    const fg = buildFloorGeoHM(grid, zoneMap, floorColors, wallColors, worldSize, seed, heightmap)

    const rawContours = extractContours(grid, worldSize, cellSize, WALL)

    const zoneContours: Map<number, Float32Array[]> = new Map()
    for (const c of rawContours) {
      if (c.length < 4) continue
      const midIdx = Math.floor(c.length / 4) * 2
      const mx = c[midIdx]
      const mz = c[midIdx + 1]
      const gx = Math.min(worldSize - 1, Math.max(0, Math.floor(mx / cellSize)))
      const gz = Math.min(worldSize - 1, Math.max(0, Math.floor(mz / cellSize)))
      const zone = zoneMap[gz * worldSize + gx]
      const passes = smoothingOverride ?? 2
      const smoothed = smoothContour(c, passes)
      if (!zoneContours.has(zone)) zoneContours.set(zone, [])
      zoneContours.get(zone)!.push(smoothed)
    }

    const allZones = new Set<number>([...zoneContours.keys()])
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === WALL) allZones.add(zoneMap[i])
    }

    const ribbonParts: THREE.BufferGeometry[] = []
    for (const zone of allZones) {
      const contours = zoneContours.get(zone) || []
      if (contours.length === 0) continue
      const zoneColor = wallColors[zone] || wallColors[0]
      ribbonParts.push(buildWallGeoHM(contours, heightmap, worldSize, 1.2, 0, seed + zone, zoneColor))
    }
    const mergedRibbon = ribbonParts.length > 0
      ? mergeGeometries(ribbonParts, false)!
      : new THREE.BufferGeometry()
    for (const p of ribbonParts) p.dispose()

    const mergedFill = buildWallFillGeoHM(grid, zoneMap, worldSize, heightmap, 1.2, wallColors)

    const pd = scatterProps(grid, worldSize, seed)
    for (let i = 0; i < pd.count; i++) {
      pd.positions[i * 3 + 1] = sampleHeight(
        heightmap, worldSize, pd.positions[i * 3], pd.positions[i * 3 + 2],
      )
    }

    return { floorGeo: fg, wallRibbonGeo: mergedRibbon, wallFillGeo: mergedFill, propData: pd }
  }, [grid, zoneMap, worldSize, seed, heightmap, smoothingOverride, rebuildKey])

  useEffect(() => {
    return () => { floorGeo.dispose(); wallRibbonGeo.dispose(); wallFillGeo.dispose() }
  }, [floorGeo, wallRibbonGeo, wallFillGeo])

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

  // Speed overlay
  const speedOverlayGeo = useMemo(
    () => showSpeed ? buildSpeedOverlayGeo(speedGrid, grid, heightmap, worldSize) : null,
    [showSpeed, speedGrid, grid, heightmap, worldSize, rebuildKey],
  )
  useEffect(() => {
    return () => { speedOverlayGeo?.dispose() }
  }, [speedOverlayGeo])

  const heightmapOverlayGeo = useMemo(
    () => showHeightmap ? buildHeightmapOverlayGeo(heightmap, grid, worldSize) : null,
    [showHeightmap, heightmap, grid, worldSize, rebuildKey],
  )
  useEffect(() => {
    return () => { heightmapOverlayGeo?.dispose() }
  }, [heightmapOverlayGeo])

  // Gate timer
  const gateElapsed = useRef(0)
  const [gateOpen, setGateOpen] = useState(false)
  useEffect(() => { gateElapsed.current = 0; setGateOpen(false) }, [seed])

  // Gate cell positions for rendering
  const gateCellPositions = useMemo(() => {
    if (!gate || gate.open) return []
    return gate.cells.map(idx => {
      const x = idx % worldSize
      const z = Math.floor(idx / worldSize)
      return [x + 0.5, sampleHeight(heightmap, worldSize, x + 0.5, z + 0.5) + 0.6, z + 0.5] as [number, number, number]
    })
  }, [gate, heightmap, worldSize, rebuildKey])

  // Entities
  const entitiesRef = useRef<Entity[]>([])
  const entityMeshRef = useRef<THREE.InstancedMesh>(null!)
  useEffect(() => {
    entitiesRef.current = spawnEntities(grid, zoneMap, worldSize, entityCount, seed)
  }, [grid, zoneMap, worldSize, entityCount, seed, rebuildKey])

  // Chest state
  const chestElapsed = useRef(0)
  const [chestVisible, setChestVisible] = useState(false)
  const chestRef = useRef<THREE.Mesh>(null!)
  useEffect(() => { chestElapsed.current = 0; setChestVisible(false) }, [seed])

  // Find a floor cell in zone 1 for chest placement
  const chestPos = useMemo(() => {
    for (let z = worldSize / 4; z < worldSize * 3 / 4; z++) {
      for (let x = worldSize / 4; x < worldSize * 3 / 4; x++) {
        const idx = z * worldSize + x
        if (grid[idx] === FLOOR && zoneMap[idx] === 1) {
          return [x + 0.5, sampleHeight(heightmap, worldSize, x + 0.5, z + 0.5), z + 0.5] as [number, number, number]
        }
      }
    }
    return null
  }, [grid, zoneMap, heightmap, worldSize, rebuildKey])

  const entityMatrix = useRef(new THREE.Matrix4())

  // Animation loop
  useFrame((_, dt) => {
    if (__PROFILE__) profile.start('frame')
    const clampedDt = Math.min(dt, 0.05)

    // Gate timer
    if (gate && !gate.open && !gateOpen) {
      gateElapsed.current += clampedDt
      if (gateElapsed.current >= gateTimer) {
        openGate(gate, grid)
        setGateOpen(true)
        onGateOpen?.()
      }
    }

    // Entities
    if (__PROFILE__) profile.start('frame.entities')
    updateEntities(entitiesRef.current, grid, worldSize, heightmap, speedGrid, clampedDt)
    if (entityMeshRef.current) {
      const m = entityMatrix.current
      const entities = entitiesRef.current
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i]
        const y = sampleHeight(heightmap, worldSize, e.x, e.z) + 0.3
        m.makeTranslation(e.x, y, e.z)
        entityMeshRef.current.setMatrixAt(i, m)
        entityMeshRef.current.setColorAt(i, ZONE_COLORS[e.zone] || ZONE_COLORS[0])
      }
      entityMeshRef.current.instanceMatrix.needsUpdate = true
      if (entityMeshRef.current.instanceColor) entityMeshRef.current.instanceColor.needsUpdate = true
    }
    if (__PROFILE__) profile.stop('frame.entities')

    // Chest
    if (!chestVisible) {
      chestElapsed.current += clampedDt
      if (chestElapsed.current >= chestTimer) setChestVisible(true)
    }
    if (chestRef.current && chestVisible) {
      const mat = chestRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = Math.sin(chestElapsed.current * 3) * 0.3 + 0.3
    }

    if (__PROFILE__) profile.stop('frame')
    if (__PROFILE__) profile.frame()
  })

  return (
    <group>
      <mesh geometry={floorGeo} receiveShadow>
        <meshStandardMaterial vertexColors
          polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
      </mesh>

      <mesh geometry={wallRibbonGeo} castShadow receiveShadow>
        <GrayboxMaterial color="#ffffff" style="slate" vertexColors noiseTex={noiseTex} />
      </mesh>
      <mesh geometry={wallFillGeo} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.9}
          polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
      </mesh>

      {propData.count > 0 && (
        <instancedMesh ref={propsRef} args={[undefined, undefined, propData.count]} castShadow frustumCulled={false}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.9} />
        </instancedMesh>
      )}

      {/* Gate meshes */}
      {!gateOpen && gateCellPositions.map((pos, i) => (
        <mesh key={`gate-${i}`} position={pos} castShadow>
          <boxGeometry args={[0.9, 1.2, 0.9]} />
          <meshStandardMaterial color="#cc3333" emissive="#cc3333" emissiveIntensity={0.2} roughness={0.7} />
        </mesh>
      ))}

      {/* Speed overlay */}
      {speedOverlayGeo && (
        <mesh geometry={speedOverlayGeo}>
          <meshBasicMaterial vertexColors transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Heightmap overlay */}
      {heightmapOverlayGeo && (
        <mesh geometry={heightmapOverlayGeo}>
          <meshBasicMaterial vertexColors transparent opacity={0.25} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Entities */}
      {entityCount > 0 && (
        <instancedMesh ref={entityMeshRef} args={[undefined, undefined, Math.max(1, entityCount)]} frustumCulled={false}>
          <capsuleGeometry args={[0.2, 0.4, 4, 8]} />
          <meshStandardMaterial roughness={0.6} />
        </instancedMesh>
      )}

      {/* Chest */}
      {chestPos && (
        <mesh ref={chestRef} position={[chestPos[0], chestPos[1] + 0.3, chestPos[2]]} visible={chestVisible} castShadow>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshStandardMaterial color="#ffd700" emissive="#ffa500" emissiveIntensity={0.3} roughness={0.4} />
        </mesh>
      )}

      {showGrid && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={((worldSize + 1) * 2) * 2}
              array={(() => {
                const pts: number[] = []
                const s = worldSize * cellSize
                for (let i = 0; i <= worldSize; i++) {
                  const p = i * cellSize
                  pts.push(p, 0.01, 0, p, 0.01, s)
                  pts.push(0, 0.01, p, s, 0.01, p)
                }
                return new Float32Array(pts)
              })()}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#ffffff" opacity={0.1} transparent />
        </lineSegments>
      )}

      {landmarkPos && (() => {
        const lx = landmarkPos[0], lz = landmarkPos[1]
        const ly = sampleHeight(heightmap, worldSize, lx, lz)
        return (
          <group position={[lx, ly, lz]}>
            <mesh position={[0, 0.25, 0]} castShadow>
              <cylinderGeometry args={[2, 2, 0.5, 16]} />
              <meshStandardMaterial color="#8a7a5a" roughness={0.8} />
            </mesh>
            <mesh position={[0, 2.5, 0]} castShadow>
              <coneGeometry args={[1.5, 4, 16]} />
              <meshStandardMaterial color="#c8a84a" emissive="#c8a84a" emissiveIntensity={0.3} roughness={0.6} />
            </mesh>
          </group>
        )
      })()}

      <ambientLight intensity={2.0} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={2.0}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />
    </group>
  )
}
