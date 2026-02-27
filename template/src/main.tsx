import React, { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gameStore, tick } from './store'
import * as input from './input'
import * as audio from './audio'
import { GrayboxMaterial } from './graybox-material'
import * as particles from './particles'

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

function FollowCamera() {
  useFrame(({ camera }) => {
    const [px, py, pz] = gameStore.getState().player.position
    camera.position.set(px, py + 10, pz + 8)
    camera.lookAt(px, py, pz)
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
      <particles.ParticlePool />
    </Canvas>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
