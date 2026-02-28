import React, { useRef, useEffect, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { gameStore, tick } from './store'
import * as input from './input'
import { GrayboxMaterial } from './graybox-material'
import * as profile from './profile'

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
    <Canvas shadows>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />
      <GameLoop />
      <FollowCamera />
      <Ground />
      <Player />
      <MeshSpam count={300} />
    </Canvas>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
