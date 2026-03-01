import React, { useRef, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { gameStore, tick, triggerCpuSpike } from './store'
import * as input from '../../../template/src/input'
import { GrayboxMaterial } from '../../../template/src/graybox-material'
import * as profile from '../../../template/src/profile'

function Player() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const state = gameStore.getState()
    const [mx, mz] = input.getMovement()
    state.player.position[0] += mx * state.player.speed * 0.016
    state.player.position[2] += mz * state.player.speed * 0.016
    ref.current!.position.set(...state.player.position)
  })
  return (
    <mesh ref={ref} position={[0, 0.5, 0]}>
      <capsuleGeometry args={[0.3, 0.8, 4, 8]} />
      <GrayboxMaterial color="#4488ff" style="smooth" />
    </mesh>
  )
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[50, 50]} />
      <GrayboxMaterial color="#334433" style="organic" />
    </mesh>
  )
}

function MeshSpam({ count }: { count: number }) {
  const meshes = useMemo(() => {
    const arr: THREE.Vector3[] = []
    for (let i = 0; i < count; i++) {
      arr.push(new THREE.Vector3(
        (Math.random() - 0.5) * 40,
        0.5,
        (Math.random() - 0.5) * 40,
      ))
    }
    return arr
  }, [count])

  return (
    <>
      {meshes.map((pos, i) => (
        <mesh key={i} position={pos}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <GrayboxMaterial color="#ff4444" style="rough" />
        </mesh>
      ))}
    </>
  )
}

const gpuSpikeState = { frames: 0 }
function triggerGpuSpike() { gpuSpikeState.frames = 10 }

function GpuSpike() {
  const [active, setActive] = useState(false)

  useFrame(() => {
    if (gpuSpikeState.frames > 0) {
      gpuSpikeState.frames--
      if (!active) setActive(true)
    } else if (active) {
      setActive(false)
    }
  })

  if (!active) return null
  return (
    <>
      {Array.from({ length: 200 }, (_, i) => (
        <mesh key={i} position={[(Math.sin(i * 7.3) * 25), 1 + (i % 5), (Math.cos(i * 5.1) * 25)]}>
          <sphereGeometry args={[3, 128, 128]} />
          <meshStandardMaterial color="#ff8800" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  )
}

function SpikePanel() {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ dragging: false, ox: 0, oy: 0 })

  const onDown = (e: React.MouseEvent) => {
    dragRef.current = { dragging: true, ox: e.clientX - panelRef.current!.offsetLeft, oy: e.clientY - panelRef.current!.offsetTop }
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d.dragging || !panelRef.current) return
      panelRef.current.style.left = `${e.clientX - d.ox}px`
      panelRef.current.style.top = `${e.clientY - d.oy}px`
    }
    const onUp = () => { dragRef.current.dragging = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const [pressed, setPressed] = useState<string | null>(null)
  const btn = (bg: string, id: string): React.CSSProperties => ({
    padding: '6px 14px', background: pressed === id ? '#222' : bg, color: '#fff', border: 'none',
    borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600,
    transform: pressed === id ? 'scale(0.95)' : 'none',
    transition: 'transform 0.05s, background 0.05s',
  })
  const fire = (id: string, fn: () => void) => ({
    onMouseDown: () => setPressed(id),
    onMouseUp: () => setPressed(null),
    onMouseLeave: () => setPressed(null),
    onClick: fn,
  })

  useEffect(() => {
    if (!panelRef.current) return
    panelRef.current.style.left = `${window.innerWidth - panelRef.current.offsetWidth - 16}px`
    panelRef.current.style.top = `${window.innerHeight - panelRef.current.offsetHeight - 16}px`
  }, [])

  return (
    <div ref={panelRef} style={{
      position: 'fixed', left: 0, top: 0,
      background: 'rgba(0,0,0,0.85)', color: '#eee', padding: 12,
      borderRadius: 6, fontFamily: 'monospace', fontSize: 13, zIndex: 20,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div onMouseDown={onDown} style={{ cursor: 'grab', fontWeight: 'bold', fontSize: 12, color: '#999', userSelect: 'none' }}>
        Spike Triggers
      </div>
      <button style={btn('#cc4444', 'cpu')} {...fire('cpu', triggerCpuSpike)}>CPU Spike</button>
      <button style={btn('#cc8800', 'gpu')} {...fire('gpu', triggerGpuSpike)}>GPU Spike</button>
      <button style={btn('#884488', 'both')} {...fire('both', () => { triggerCpuSpike(); triggerGpuSpike() })}>Both</button>
    </div>
  )
}

function GameLoop() {
  const gl = useThree(s => s.gl)
  useEffect(() => { if (__PROFILE__) profile.renderer(gl) }, [gl])
  useFrame((_, dt) => tick(dt))
  return null
}

function FollowCamera() {
  useFrame(({ camera }) => {
    const [px, py, pz] = gameStore.getState().player.position
    camera.position.set(px, py + 10, pz + 8)
    camera.lookAt(px, py, pz)
  })
  return null
}

function App() {
  return (
    <>
      <Canvas shadows>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />
        <GameLoop />
        <FollowCamera />
        <Ground />
        <Player />
        <MeshSpam count={600} />
        <GpuSpike />
      </Canvas>
      <SpikePanel />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
