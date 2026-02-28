import React, { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import * as particles from './particles'
import * as popups from './popups'

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

function PopupStation({ curve, x, text, color, icon }: { curve: string; x: number; text?: string; color: string; icon?: string }) {
  const timerRef = useRef(0)

  useFrame((_, dt) => {
    timerRef.current += dt
    if (timerRef.current > 2.5) {
      timerRef.current = 0
      popups.emit(curve as any, { at: [x, 0.5, -4], text, icon, color })
    }
  })

  return (
    <mesh position={[x, 0.01, -4]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.8, 16]} />
      <meshStandardMaterial color="#2a2a2a" />
    </mesh>
  )
}

function OneshotStation({ name, x, color }: { name: string; x: number; color: string }) {
  const timerRef = useRef(0)

  useFrame((_, dt) => {
    timerRef.current += dt
    if (timerRef.current > 2) {
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

function Scene({ onPresetChange }: { onPresetChange: (i: number) => void }) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 10, 5]} intensity={0.6} />
      <OrbitControls />

      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 20]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {/* One-shots: burst, radial */}
      <OneshotStation name="burst" x={-6} color={COLORS[0]} />
      <OneshotStation name="radial" x={-2} color={COLORS[1]} />

      {/* Persistent: aura (also good for campfire/torches) */}
      <mesh position={[2, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.8, 16]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <particles.ParticleEffect preset="aura" position={[2, 0.5, 0]} color={COLORS[2]} />

      {/* Persistent: sparkle */}
      <mesh position={[6, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.8, 16]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <particles.ParticleEffect preset="sparkle" position={[6, 0.5, 0]} color={COLORS[3]} />

      {/* Rain: camera-following volume */}
      <particles.ParticleEffect preset="rain" position={[0, 8, 0]} color="#aabbff" />

      {/* Popups: three curves + icons */}
      <IconLoader />
      <PopupStation curve="rise-fade" x={-6} text="-25" color="#ff4444" />
      <PopupStation curve="pop-shrink" x={-2} text="DEAD" color="#ffaa00" />
      <PopupStation curve="slam" x={2} text="LEVEL UP!" color="#44ff44" />
      <PopupStation curve="pop-shrink" x={6} icon="skull" color="#ff4444" />
      <PopupStation curve="slam" x={10} icon="star" color="#ffdd00" />

      <ClickEmitter onPresetChange={onPresetChange} />
      <particles.ParticlePool />
      <popups.PopupPool />
    </>
  )
}

function Overlay({ activeIndex }: { activeIndex: number }) {
  const labels = [
    { name: 'burst', x: '20%' },
    { name: 'radial', x: '35%' },
    { name: 'aura', x: '55%' },
    { name: 'sparkle', x: '75%' },
  ]

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
      <div style={{ position: 'absolute', top: 10, right: 16, color: '#556', fontSize: 12 }}>
        rain (follows camera)
      </div>
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
  const [activeIndex, setActiveIndex] = React.useState(0)

  return (
    <>
      <Canvas camera={{ position: [0, 12, 14], fov: 50 }} style={{ background: '#0a0a15' }}>
        <Scene onPresetChange={setActiveIndex} />
      </Canvas>
      <Overlay activeIndex={activeIndex} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
