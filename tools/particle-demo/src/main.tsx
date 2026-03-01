import React, { useRef, useState, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import * as particles from '../../../template/src/particles'
import * as popups from '../../../template/src/popups'
import * as clock from '../../../template/src/clock'
import * as fog from '../../../template/src/fog'

const SKULL_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="28" r="22" fill="white"/><circle cx="22" cy="24" r="7" fill="black"/><circle cx="42" cy="24" r="7" fill="black"/><path d="M26 38 L28 48 L32 44 L36 48 L38 38" fill="white" stroke="black" stroke-width="1"/></svg>')}`
const STAR_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><polygon points="32,4 40,24 62,26 46,40 50,62 32,50 14,62 18,40 2,26 24,24" fill="white"/></svg>')}`

const COLORS = ['#ff4444', '#4488ff', '#ffaa00', '#44ffff', '#ff44ff']

const CURSOR_PRESETS = [
  { name: 'burst', color: COLORS[0] },
  { name: 'radial', color: COLORS[1] },
  { name: 'aura', color: COLORS[2] },
  { name: 'sparkle', color: COLORS[3] },
  { name: 'rain', color: COLORS[4] },
]

let activePresetIndex = 0

function PopupStation({ curve, x, text, color, icon, size }: { curve: string; x: number; text?: string; color: string; icon?: string; size?: number }) {
  const timerRef = useRef(0)

  useFrame((_, dt) => {
    timerRef.current += dt
    if (timerRef.current > 1.75) {
      timerRef.current = 0
      popups.emit(curve as any, { at: [x, 0.5, -2.8], text, icon, color, size })
    }
  })

  return (
    <mesh position={[x, 0.01, -2.8]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.8, 16]} />
      <meshStandardMaterial color="#2a2a2a" />
    </mesh>
  )
}

function OneshotStation({ name, x, color }: { name: string; x: number; color: string }) {
  const timerRef = useRef(0)

  useFrame((_, dt) => {
    timerRef.current += dt
    if (timerRef.current > 1.4) {
      timerRef.current = 0
      particles.emit(name, { at: [x, 0.5, 0], color })
    }
  })

  return (
    <mesh position={[x, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.8, 16]} />
      <meshStandardMaterial color="#333" />
    </mesh>
  )
}

function ClickEmitter({ onPresetChange }: { onPresetChange: (i: number) => void }) {
  const { camera, gl } = useThree()
  const raycaster = useRef(new THREE.Raycaster())
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))

  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      raycaster.current.setFromCamera(ndc, camera)
      const hit = new THREE.Vector3()
      raycaster.current.ray.intersectPlane(plane.current, hit)
      if (hit) {
        const p = CURSOR_PRESETS[activePresetIndex]
        particles.emit(p.name, { at: [hit.x, 0.2, hit.z], color: p.color })
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      const n = parseInt(e.key)
      if (n >= 1 && n <= CURSOR_PRESETS.length) {
        activePresetIndex = n - 1
        onPresetChange(n - 1)
      }
    }
    gl.domElement.addEventListener('click', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      gl.domElement.removeEventListener('click', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [camera, gl, onPresetChange])

  return null
}

function IconLoader() {
  React.useEffect(() => {
    popups.preloadIcon('skull', SKULL_SVG)
    popups.preloadIcon('star', STAR_SVG)
  }, [])
  return null
}

function FogPass({ config }: { config: fog.FogConfig }) {
  const effect = useMemo(() => new fog.FogEffect(config), [])
  React.useEffect(() => { effect.setConfig(config) }, [config, effect])
  return <primitive object={effect} />
}

function Scene({ onPresetChange, fogEnabled, fogConfig, rainEnabled }: {
  onPresetChange: (i: number) => void
  fogEnabled: boolean
  fogConfig: fog.FogConfig
  rainEnabled: boolean
}) {
  useFrame((_, dt) => clock.tick(dt))
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 10, 5]} intensity={0.6} />
      <OrbitControls />

      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 20]} />
        <meshStandardMaterial color="#d0d4de" />
      </mesh>

      <OneshotStation name="burst" x={-2.94} color={COLORS[0]} />
      <OneshotStation name="radial" x={-0.98} color={COLORS[1]} />

      <mesh position={[0.98, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.8, 16]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <particles.ParticleEffect preset="aura" position={[0.98, 0.5, 0]} color={COLORS[2]} />

      <mesh position={[2.94, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.8, 16]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <particles.ParticleEffect preset="sparkle" position={[2.94, 0.5, 0]} color={COLORS[3]} />

      {rainEnabled && <particles.ParticleEffect preset="rain" position={[0, 8, 0]} color="#aabbff" />}

      <IconLoader />
      <PopupStation curve="rise-fade" x={-3.92} text="-25" color="#ff4444" size={2} />
      <PopupStation curve="pop-shrink" x={-1.96} text="DEAD" color="#ffaa00" size={2} />
      <PopupStation curve="slam" x={0} text="LEVEL UP!" color="#44ff44" />
      <PopupStation curve="pop-shrink" x={1.96} icon="skull" color="#ff4444" />
      <PopupStation curve="slam" x={3.92} icon="star" color="#ffdd00" />

      <ClickEmitter onPresetChange={onPresetChange} />
      <particles.ParticlePool />
      <popups.PopupPool />

      {fogEnabled && (
        <EffectComposer>
          <FogPass config={fogConfig} />
        </EffectComposer>
      )}
    </>
  )
}

function DraggablePanel({ children, initialX = 16, initialY = 64 }: {
  children: React.ReactNode
  initialX?: number
  initialY?: number
}) {
  const [pos, setPos] = useState({ x: initialX, y: initialY })
  const dragging = useRef<{ ox: number; oy: number } | null>(null)

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({ x: e.clientX - dragging.current.ox, y: e.clientY - dragging.current.oy })
    }
    const onUp = () => { dragging.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div style={{
      position: 'absolute', left: pos.x, top: pos.y, color: '#ccc', fontSize: 12,
      pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
      background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: 6,
      userSelect: 'none',
    }}>
      <div
        style={{ cursor: 'grab', fontSize: 10, color: '#777', marginBottom: 2, textAlign: 'center' }}
        onMouseDown={e => { dragging.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y } }}
      >
        ≡ drag
      </div>
      {children}
    </div>
  )
}

function Overlay({ activeIndex, fogEnabled, onFogToggle, fogConfig, onFogConfig, rainEnabled, onRainToggle }: {
  activeIndex: number
  fogEnabled: boolean
  onFogToggle: () => void
  fogConfig: fog.FogConfig
  onFogConfig: (c: fog.FogConfig) => void
  rainEnabled: boolean
  onRainToggle: () => void
}) {
  const labels = [
    { name: 'burst', x: '20%' },
    { name: 'radial', x: '35%' },
    { name: 'aura', x: '55%' },
    { name: 'sparkle', x: '75%' },
  ]

  const sliderStyle: React.CSSProperties = { width: 80, accentColor: '#888' }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      pointerEvents: 'none', fontFamily: 'monospace',
    }}>
      <div style={{ position: 'absolute', top: 16, left: 16, color: '#fff', fontSize: 14 }}>
        Press 1-{CURSOR_PRESETS.length} to select, click to emit: <span style={{ color: CURSOR_PRESETS[activeIndex].color }}>{CURSOR_PRESETS[activeIndex].name}</span>
      </div>
      <div style={{ position: 'absolute', top: 36, left: 16, color: '#556', fontSize: 12 }}>
        Drag to orbit, scroll to zoom
      </div>

      <DraggablePanel>
        <label style={{ cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={rainEnabled} onChange={onRainToggle} style={{ marginRight: 6 }} />
          Rain
        </label>
        <label style={{ cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={fogEnabled} onChange={onFogToggle} style={{ marginRight: 6 }} />
          Fog
        </label>
        {fogEnabled && <>
          <label>near <input type="color" value={fogConfig.colorNear} onChange={e => onFogConfig({ ...fogConfig, colorNear: e.target.value })} /></label>
          <label>far <input type="color" value={fogConfig.colorFar} onChange={e => onFogConfig({ ...fogConfig, colorFar: e.target.value })} /></label>
          <label>start <input type="range" min={0} max={50} step={0.5} value={fogConfig.start} onChange={e => onFogConfig({ ...fogConfig, start: +e.target.value })} style={sliderStyle} /> {fogConfig.start.toFixed(1)}</label>
          <label>end <input type="range" min={1} max={100} step={0.5} value={fogConfig.end} onChange={e => onFogConfig({ ...fogConfig, end: +e.target.value })} style={sliderStyle} /> {fogConfig.end.toFixed(1)}</label>
          <label>intensity <input type="range" min={0} max={1} step={0.01} value={fogConfig.intensity} onChange={e => onFogConfig({ ...fogConfig, intensity: +e.target.value })} style={sliderStyle} /> {fogConfig.intensity.toFixed(2)}</label>
          <label>noise <input type="range" min={0} max={20} step={0.5} value={fogConfig.noiseScale} onChange={e => onFogConfig({ ...fogConfig, noiseScale: +e.target.value })} style={sliderStyle} /> {fogConfig.noiseScale.toFixed(1)}</label>
        </>}
      </DraggablePanel>

      {labels.map((l, i) => (
        <div key={l.name} style={{
          position: 'absolute', bottom: 24, left: l.x, transform: 'translateX(-50%)',
          color: i === activeIndex ? CURSOR_PRESETS[i].color : '#aaa',
          fontSize: 13, textAlign: 'center',
        }}>
          [{i + 1}] {l.name}
        </div>
      ))}
      <div style={{
        position: 'absolute', bottom: 24, right: 16,
        color: activeIndex === 4 ? CURSOR_PRESETS[4].color : '#556',
        fontSize: 13,
      }}>
        [5] rain
      </div>
      <div style={{ position: 'absolute', bottom: 48, left: 16, color: '#777', fontSize: 12 }}>
        popups (back row): rise-fade · pop-shrink · slam
      </div>
    </div>
  )
}

function App() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [fogEnabled, setFogEnabled] = useState(false)
  const [fogConfig, setFogConfig] = useState<fog.FogConfig>({ ...fog.DEFAULTS })
  const [rainEnabled, setRainEnabled] = useState(true)

  return (
    <>
      <Canvas camera={{ position: [0, 12, 14], fov: 50 }} style={{ background: '#b8c4d8' }}>
        <Scene onPresetChange={setActiveIndex} fogEnabled={fogEnabled} fogConfig={fogConfig} rainEnabled={rainEnabled} />
      </Canvas>
      <Overlay
        activeIndex={activeIndex}
        fogEnabled={fogEnabled}
        onFogToggle={() => setFogEnabled(e => !e)}
        fogConfig={fogConfig}
        onFogConfig={setFogConfig}
        rainEnabled={rainEnabled}
        onRainToggle={() => setRainEnabled(e => !e)}
      />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
