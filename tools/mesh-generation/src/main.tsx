import React, { Suspense, useRef, useMemo, useEffect, useState, useCallback, useContext, createContext } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber'
import { OrbitControls, useGLTF, useAnimations, Environment, Grid, Html } from '@react-three/drei'
import * as THREE from 'three'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { applyZoneMaterial, restoreOriginalMaterials } from './zone-classify'
import type { ZoneConfig } from './zone-classify'

interface ModelGroup {
  name: string
  base?: string
  rigged?: string
  walk?: string
  run?: string
  zones?: ZoneConfig
}

type FocusFn = (worldPos: THREE.Vector3) => void
const FocusContext = createContext<FocusFn>(() => {})

function countGeometry(obj: THREE.Object3D) {
  let verts = 0, tris = 0
  obj.traverse(c => {
    const mesh = c as THREE.Mesh
    if (mesh.isMesh && mesh.geometry) {
      const geo = mesh.geometry
      verts += geo.attributes.position?.count ?? 0
      tris += geo.index ? geo.index.count / 3 : (geo.attributes.position?.count ?? 0) / 3
    }
  })
  return { verts, tris: Math.round(tris) }
}

function countBones(obj: THREE.Object3D) {
  let bones = 0
  obj.traverse(c => { if ((c as any).isBone) bones++ })
  return bones
}

function useSkeleton(root: THREE.Object3D, show: boolean) {
  const { scene } = useThree()
  useEffect(() => {
    if (!show) return
    let hasSkin = false
    root.traverse(c => { if ((c as any).isSkinnedMesh) hasSkin = true })
    if (!hasSkin) return
    const helper = new THREE.SkeletonHelper(root)
    scene.add(helper)
    return () => { scene.remove(helper) }
  }, [show, root, scene])
}

function useClickToFocus(groupRef: React.RefObject<THREE.Group>) {
  const focusOn = useContext(FocusContext)
  return useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!groupRef.current) return
    const wp = groupRef.current.getWorldPosition(new THREE.Vector3())
    wp.y += 1
    focusOn(wp)
  }, [focusOn, groupRef])
}

function StaticModel({ url, label, position, showSkeleton, showZones, zones }: {
  url: string; label: string; position: [number, number, number]; showSkeleton: boolean
  showZones: boolean; zones?: ZoneConfig
}) {
  const { scene: gltfScene } = useGLTF(url)
  const cloned = useMemo(() => SkeletonUtils.clone(gltfScene), [gltfScene])
  const ref = useRef<THREE.Group>(null!)
  const groupRef = useRef<THREE.Group>(null!)
  const [info, setInfo] = useState('')
  const handleClick = useClickToFocus(groupRef)
  const bboxRef = useRef<THREE.Box3>(new THREE.Box3())

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(cloned)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      const s = 2 / maxDim
      cloned.scale.setScalar(s)
      const newBox = new THREE.Box3().setFromObject(cloned)
      cloned.position.y = -newBox.min.y
    }
    bboxRef.current.setFromObject(cloned)
    const { verts, tris } = countGeometry(cloned)
    const bones = countBones(cloned)
    setInfo([`${tris} tris`, `${verts} verts`, bones ? `${bones} bones` : ''].filter(Boolean).join('\n'))
  }, [cloned])

  useEffect(() => {
    if (showZones && zones) {
      applyZoneMaterial(cloned, zones, bboxRef.current)
    } else {
      restoreOriginalMaterials(cloned)
    }
  }, [showZones, zones, cloned])

  useSkeleton(cloned, showSkeleton)

  useFrame((_, dt) => { ref.current.rotation.y += dt * 0.3 })

  return (
    <group ref={groupRef} position={position} onClick={handleClick}>
      <primitive ref={ref} object={cloned} />
      <Html position={[0, 6.4, 0]} center>
        <div style={{ color: 'white', background: 'rgba(0,0,0,0.8)', padding: '6px 12px', borderRadius: 4, fontSize: 13, whiteSpace: 'pre', textAlign: 'center', fontFamily: 'monospace', lineHeight: 1.4 }}>
          <div style={{ fontWeight: 'bold' }}>{label}</div>
          <div style={{ color: '#aaa', fontSize: 11 }}>{info}</div>
        </div>
      </Html>
    </group>
  )
}

function AnimatedModel({ modelUrl, animUrl, label, position, showSkeleton, showZones, zones }: {
  modelUrl: string; animUrl: string; label: string; position: [number, number, number]; showSkeleton: boolean
  showZones: boolean; zones?: ZoneConfig
}) {
  const { scene: gltfScene } = useGLTF(modelUrl)
  const { animations } = useGLTF(animUrl)
  const cloned = useMemo(() => SkeletonUtils.clone(gltfScene), [gltfScene])
  const ref = useRef<THREE.Group>(null!)
  const groupRef = useRef<THREE.Group>(null!)
  const { actions } = useAnimations(animations, ref)
  const [info, setInfo] = useState('')
  const handleClick = useClickToFocus(groupRef)
  const bboxRef = useRef<THREE.Box3>(new THREE.Box3())

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(cloned)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      const s = 2 / maxDim
      cloned.scale.setScalar(s)
      const newBox = new THREE.Box3().setFromObject(cloned)
      cloned.position.y = -newBox.min.y
    }
    bboxRef.current.setFromObject(cloned)
    const { verts, tris } = countGeometry(cloned)
    const bones = countBones(cloned)
    setInfo([`${tris} tris`, `${verts} verts`, bones ? `${bones} bones` : ''].filter(Boolean).join('\n'))
  }, [cloned])

  useEffect(() => {
    const first = Object.values(actions)[0]
    if (first) first.reset().fadeIn(0.2).play()
    return () => { Object.values(actions).forEach(a => a?.stop()) }
  }, [actions])

  useEffect(() => {
    if (showZones && zones) {
      applyZoneMaterial(cloned, zones, bboxRef.current)
    } else {
      restoreOriginalMaterials(cloned)
    }
  }, [showZones, zones, cloned])

  useSkeleton(cloned, showSkeleton)

  useFrame((_, dt) => { ref.current.rotation.y += dt * 0.3 })

  return (
    <group ref={groupRef} position={position} onClick={handleClick}>
      <primitive ref={ref} object={cloned} />
      <Html position={[0, 6.4, 0]} center>
        <div style={{ color: 'white', background: 'rgba(0,0,0,0.8)', padding: '6px 12px', borderRadius: 4, fontSize: 13, whiteSpace: 'pre', textAlign: 'center', fontFamily: 'monospace', lineHeight: 1.4 }}>
          <div style={{ fontWeight: 'bold' }}>{label}</div>
          <div style={{ color: '#aaa', fontSize: 11 }}>{info}</div>
        </div>
      </Html>
    </group>
  )
}

const COL_SPACING = 3.5
const ROW_SPACING = 5

function RowView({ group, z, showSkeleton, showZones, colOffset }: {
  group: ModelGroup; z: number; showSkeleton: boolean; showZones: boolean; colOffset: number
}) {
  const modelUrl = group.rigged ? `/models/${group.rigged}` : group.base ? `/models/${group.base}` : null
  if (!modelUrl) return null

  const slots: React.ReactNode[] = []
  let col = 0

  if (group.base && group.rigged) {
    slots.push(
      <StaticModel key="base" url={`/models/${group.base}`} label="Original" position={[col * COL_SPACING - colOffset, 0, 0]} showSkeleton={false} showZones={showZones} zones={group.zones} />
    )
  }
  col++

  slots.push(
    <StaticModel key="idle" url={modelUrl} label={group.name} position={[col * COL_SPACING - colOffset, 0, 0]} showSkeleton={showSkeleton} showZones={showZones} zones={group.zones} />
  )
  col++

  if (group.walk) {
    slots.push(
      <AnimatedModel key="walk" modelUrl={modelUrl} animUrl={`/models/${group.walk}`} label="Walk" position={[col * COL_SPACING - colOffset, 0, 0]} showSkeleton={showSkeleton} showZones={showZones} zones={group.zones} />
    )
  }
  col++

  if (group.run) {
    slots.push(
      <AnimatedModel key="run" modelUrl={modelUrl} animUrl={`/models/${group.run}`} label="Run" position={[col * COL_SPACING - colOffset, 0, 0]} showSkeleton={showSkeleton} showZones={showZones} zones={group.zones} />
    )
  }

  return <group position={[0, 0, z]}>{slots}</group>
}

interface Tween {
  fromPos: THREE.Vector3
  toPos: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  t: number
}

function CameraRig({ children }: { children: React.ReactNode }) {
  const controlsRef = useRef<any>(null!)
  const tweenRef = useRef<Tween | null>(null)

  const focusOn = useCallback((worldPos: THREE.Vector3) => {
    const controls = controlsRef.current
    if (!controls) return
    const dir = controls.object.position.clone().sub(controls.target).normalize()
    tweenRef.current = {
      fromPos: controls.object.position.clone(),
      toPos: worldPos.clone().add(dir.multiplyScalar(5)),
      fromTarget: controls.target.clone(),
      toTarget: worldPos.clone(),
      t: 0,
    }
  }, [])

  useFrame((_, dt) => {
    const tw = tweenRef.current
    if (!tw) return
    tw.t = Math.min(tw.t + dt * 2.5, 1)
    const ease = 1 - Math.pow(1 - tw.t, 3)
    controlsRef.current.object.position.lerpVectors(tw.fromPos, tw.toPos, ease)
    controlsRef.current.target.lerpVectors(tw.fromTarget, tw.toTarget, ease)
    controlsRef.current.update()
    if (tw.t >= 1) tweenRef.current = null
  })

  return (
    <FocusContext.Provider value={focusOn}>
      <OrbitControls
        ref={controlsRef}
        enableDamping
        onStart={() => { tweenRef.current = null }}
      />
      {children}
    </FocusContext.Provider>
  )
}

function ZoneLegend({ zones }: { zones: ZoneConfig }) {
  return (
    <div style={{ fontSize: 11 }}>
      {zones.zones.map(z => (
        <div key={z.name} style={{ display: 'flex', alignItems: 'center', gap: 5, lineHeight: 1.6 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: z.debugColor, flexShrink: 0 }} />
          <span>{z.name}</span>
        </div>
      ))}
      {zones.fallback && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, lineHeight: 1.6 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: zones.fallback.debugColor, flexShrink: 0 }} />
          <span style={{ color: '#888' }}>fallback</span>
        </div>
      )}
    </div>
  )
}

function Panel({ showSkeleton, onToggleSkeleton, showZones, onToggleZones, zones }: {
  showSkeleton: boolean; onToggleSkeleton: () => void
  showZones: boolean; onToggleZones: () => void; zones?: ZoneConfig
}) {
  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 10, pointerEvents: 'auto',
      background: 'rgba(0,0,0,0.7)', color: '#ccc', padding: '12px 16px',
      font: '13px/1.6 monospace', borderRadius: 6, userSelect: 'none',
    }}>
      <label style={{ cursor: 'pointer', display: 'block' }}>
        <input type="checkbox" checked={showSkeleton} onChange={onToggleSkeleton} style={{ marginRight: 6 }} />
        Skeleton
      </label>
      <label style={{ cursor: zones ? 'pointer' : 'default', display: 'block', opacity: zones ? 1 : 0.4 }}>
        <input type="checkbox" checked={showZones} onChange={onToggleZones} disabled={!zones} style={{ marginRight: 6 }} />
        Zones
      </label>
      {showZones && zones && (
        <div style={{ marginTop: 6, borderTop: '1px solid #555', paddingTop: 6 }}>
          <ZoneLegend zones={zones} />
          <div style={{ color: '#666', fontSize: 9, marginTop: 4 }}>Bind-pose classification</div>
        </div>
      )}
    </div>
  )
}

function App() {
  const [groups, setGroups] = useState<ModelGroup[]>([])
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [showZones, setShowZones] = useState(false)

  useEffect(() => {
    fetch('/models/manifest.json')
      .then(r => r.json())
      .then(setGroups)
      .catch(() => setGroups([]))
  }, [])

  const firstZones = groups.find(g => g.zones)?.zones
  const maxCols = 4
  const colOffset = (maxCols - 1) * COL_SPACING / 2
  const rowOffset = (groups.length - 1) * ROW_SPACING / 2

  return (
    <>
      <Panel
        showSkeleton={showSkeleton} onToggleSkeleton={() => setShowSkeleton(s => !s)}
        showZones={showZones} onToggleZones={() => setShowZones(s => !s)} zones={firstZones}
      />
      <Canvas camera={{ position: [0, 4, 12 + groups.length * 2], fov: 50 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <CameraRig>
          <Suspense fallback={null}>
            {groups.map((group, i) => (
              <RowView
                key={group.name}
                group={group}
                z={i * ROW_SPACING - rowOffset}
                showSkeleton={showSkeleton}
                showZones={showZones}
                colOffset={colOffset}
              />
            ))}
          </Suspense>
        </CameraRig>
        <Grid
          args={[30, 30]}
          cellSize={0.5}
          cellColor="#444"
          sectionSize={2}
          sectionColor="#888"
          fadeDistance={20}
          position={[0, -0.01, 0]}
        />
        <Environment preset="city" />
      </Canvas>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
