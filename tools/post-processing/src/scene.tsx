import React, { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { assembleArenaV2, DEMO_CONFIG, WALL } from '../../../template/src/level/generate'
import { extractContours, smoothContour } from '../../../template/src/level/marching'
import { buildWallGeo, buildFloorGeo, buildWallFillGeo } from '../../../template/src/level/terrain-geo'
import * as grass from '../../../template/src/level/grass'

const SEED = 42

const ZONE_PALETTES: THREE.Color[] = [
  new THREE.Color('#2a3a4a'),
  new THREE.Color('#2a4a2a'),
  new THREE.Color('#4a3a2a'),
]

const WALL_COLORS = ['#5a6a7a', '#4a6a3a', '#7a6a4a']

const ALIEN_GRASS: grass.ZoneGrassConfig = {
  density: 5,
  bladeHeight: 0.4,
  bladeHeightVar: 0.15,
  bladeWidth: 0.07,
  baseColorShift: 0.6,
  tipColorShift: 1.8,
  windStrength: 0.5,
}

export function Scene() {
  const result = useMemo(() => assembleArenaV2({ ...DEMO_CONFIG, seed: SEED }), [])
  const { grid, zoneMap, worldSize } = result
  const center = worldSize / 2

  const { floorGeo, wallGeos } = useMemo(() => {
    const floorColors = ZONE_PALETTES
    const wallColors = ZONE_PALETTES.map((_, i) => new THREE.Color(WALL_COLORS[i]))
    const fg = buildFloorGeo(grid, zoneMap, floorColors, wallColors, worldSize, SEED)

    const rawContours = extractContours(grid, worldSize, 1, WALL)
    const zoneContours: Map<number, Float32Array[]> = new Map()
    for (const c of rawContours) {
      if (c.length < 4) continue
      const midIdx = Math.floor(c.length / 4) * 2
      const gx = Math.min(worldSize - 1, Math.max(0, Math.floor(c[midIdx])))
      const gz = Math.min(worldSize - 1, Math.max(0, Math.floor(c[midIdx + 1])))
      const zone = zoneMap[gz * worldSize + gx]
      const smoothed = smoothContour(c, 2)
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
      const geo = contours.length > 0 ? buildWallGeo(contours, 1.2, 0.12, SEED + zone) : new THREE.BufferGeometry()
      const fillGeo = buildWallFillGeo(grid, zoneMap, worldSize, 1.2, zone)
      wg.push({ zone, geo, fillGeo })
    }

    return { floorGeo: fg, wallGeos: wg }
  }, [grid, zoneMap, worldSize])

  const alienPalettes = useMemo(() => [
    new THREE.Color('#1a0033'),
    new THREE.Color('#1a0033'),
    new THREE.Color('#1a0033'),
  ], [])

  const grassResult = useMemo(() => {
    const configs: (grass.ZoneGrassConfig | null)[] = DEMO_CONFIG.zones.map(() => ALIEN_GRASS)
    return grass.build({
      grid, zoneMap, worldSize,
      zonePalettes: [new THREE.Color('#6b00b3'), new THREE.Color('#00aa88'), new THREE.Color('#9933ff')],
      zoneGrassConfigs: configs,
      seed: SEED,
      windSpeed: 2.5,
      windAngle: 30,
    })
  }, [grid, zoneMap, worldSize])

  const grassRef = useRef<THREE.Group>(null!)

  useEffect(() => {
    if (grassRef.current) {
      grassRef.current.add(grassResult.group)
      return () => { grassRef.current?.remove(grassResult.group) }
    }
  }, [grassResult])

  useFrame((_, dt) => {
    grassResult.update(dt)
  })

  useEffect(() => {
    return () => {
      floorGeo.dispose()
      for (const w of wallGeos) { w.geo.dispose(); w.fillGeo.dispose() }
    }
  }, [floorGeo, wallGeos])

  return (
    <group>
      <mesh geometry={floorGeo} receiveShadow>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide}
          polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
      </mesh>

      {wallGeos.map(({ zone, geo, fillGeo }) => (
        <group key={zone}>
          <mesh geometry={geo} castShadow receiveShadow>
            <meshStandardMaterial color={WALL_COLORS[zone] || WALL_COLORS[0]} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={fillGeo} castShadow receiveShadow>
            <meshStandardMaterial color={WALL_COLORS[zone] || WALL_COLORS[0]} side={THREE.DoubleSide}
              polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
          </mesh>
        </group>
      ))}

      <group ref={grassRef} />

      <ambientLight intensity={1.5} />
      <directionalLight
        position={[center, 20, center]}
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
