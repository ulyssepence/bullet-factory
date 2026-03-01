import React, { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gameStore, tick } from '../../../template/src/store'
import * as input from '../../../template/src/input'
import * as audio from '../../../template/src/audio'
import { GrayboxMaterial } from '../../../template/src/graybox-material'
import * as particles from '../../../template/src/particles'
import type { SurfaceStyle } from '../../../template/src/graybox-material'

function Player() {
  const ref = useRef<THREE.Mesh>(null)

  useFrame((_, dt) => {
    const state = gameStore.getState()
    const [mx, mz] = input.getMovement()
    state.player.position[0] += mx * state.player.speed * dt
    state.player.position[2] += mz * state.player.speed * dt
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

function GameLoop() {
  useFrame((_, dt) => tick(dt))
  return null
}

const allStyles: { style: SurfaceStyle; color: string }[] = [
  { style: 'rough', color: '#8b7d6b' },
  { style: 'smooth', color: '#4488ff' },
  { style: 'organic', color: '#4a6741' },
  { style: 'crystalline', color: '#9b59b6' },
  { style: 'metallic', color: '#95a5a6' },
  { style: 'worn', color: '#c0392b' },
  { style: 'wood', color: '#8B6914' },
  { style: 'plank', color: '#A0722A' },
  { style: 'bark', color: '#5C4033' },
  { style: 'grass', color: '#4a7c3f' },
  { style: 'dirt', color: '#8B6F47' },
  { style: 'sand', color: '#C2B280' },
  { style: 'marble', color: '#D4CFC9' },
  { style: 'cobblestone', color: '#808080' },
  { style: 'slate', color: '#6A6A6A' },
  { style: 'gravel', color: '#9E9E9E' },
  { style: 'ice', color: '#A5D8F0' },
  { style: 'obsidian', color: '#1A1A2E' },
  { style: 'brick', color: '#A0522D' },
  { style: 'tile', color: '#E8E4D9' },
  { style: 'carpet', color: '#8B2252' },
  { style: 'moss', color: '#5D8A4E' },
]

function StyleShowcase() {
  const cols = 6
  return (
    <>
      {allStyles.map(({ style, color }, i) => {
        const row = Math.floor(i / cols)
        const col = i % cols
        return (
          <mesh key={style} position={[-5 + col * 2, 0.75, -3 - row * 2.5]}>
            <boxGeometry args={[1.2, 1.5, 1.2]} />
            <GrayboxMaterial color={color} style={style} />
          </mesh>
        )
      })}
    </>
  )
}

const zoomRef = { value: 1 }

function FollowCamera() {
  React.useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomRef.value = Math.max(0.3, Math.min(3, zoomRef.value * (1 + e.deltaY * 0.001)))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  useFrame(({ camera }) => {
    const [px, py, pz] = gameStore.getState().player.position
    const z = zoomRef.value
    camera.position.set(px, py + 12 * z, pz + 6 * z)
    camera.lookAt(px, py, pz - 5)
  })
  return null
}

function App() {
  React.useEffect(() => {
    audio.player.preload(audio.defaultManifest)
  }, [])

  return (
    <Canvas shadows>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />
      <GameLoop />
      <FollowCamera />
      <Ground />
      <Player />
      <StyleShowcase />
      <particles.ParticlePool />
    </Canvas>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
