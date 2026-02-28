import React, { Suspense, useRef, useMemo, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF, useAnimations, Environment, Grid, Html } from '@react-three/drei'
import * as THREE from 'three'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'

function StaticModel({ url, scale = 1, position = [0, 0, 0] as [number, number, number] }: { url: string; scale?: number; position?: [number, number, number] }) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => scene.clone(true), [scene])
  const ref = useRef<THREE.Group>(null!)

  useFrame((_, dt) => {
    ref.current.rotation.y += dt * 0.3
  })

  return <primitive ref={ref} object={cloned} scale={scale} position={position} />
}

function AnimatedModel({ url, scale = 1, position = [0, 0, 0] as [number, number, number] }: { url: string; scale?: number; position?: [number, number, number] }) {
  const { scene, animations } = useGLTF(url)
  const cloned = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const ref = useRef<THREE.Group>(null!)
  const { actions } = useAnimations(animations, ref)

  useEffect(() => {
    const first = Object.values(actions)[0]
    if (first) {
      first.reset().fadeIn(0.2).play()
    }
  }, [actions])

  useFrame((_, dt) => {
    ref.current.rotation.y += dt * 0.3
  })

  return <primitive ref={ref} object={cloned} scale={scale} position={position} />
}

function Label({ position, text }: { position: [number, number, number]; text: string }) {
  return (
    <Html position={position} center>
      <div style={{ color: 'white', background: 'rgba(0,0,0,0.7)', padding: '4px 10px', borderRadius: 4, fontSize: 14, whiteSpace: 'nowrap' }}>
        {text}
      </div>
    </Html>
  )
}

function App() {
  return (
    <Canvas camera={{ position: [0, 2, 8], fov: 50 }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <Suspense fallback={null}>
        <StaticModel url="/models/cowboy-bot.glb" scale={1} position={[-3, 0, 0]} />
        <Label position={[-3, 3, 0]} text="Original (8.7 MB)" />
        <StaticModel url="/models/cowboy-bot-remeshed.glb" scale={1} position={[0, 0, 0]} />
        <Label position={[0, 3, 0]} text="Remeshed 4k (174 KB)" />
        <AnimatedModel url="/models/cowboy-bot-walking.glb" scale={1} position={[3, 0, 0]} />
        <Label position={[3, 3, 0]} text="Walking anim (305 KB)" />
        <StaticModel url="/models/bandit-runner-lowpoly.glb" scale={1} position={[6, 0, 0]} />
        <Label position={[6, 3, 0]} text="Lowpoly native (180 KB)" />
      </Suspense>
      <Grid
        args={[14, 14]}
        cellSize={0.5}
        cellColor="#444"
        sectionSize={2}
        sectionColor="#888"
        fadeDistance={12}
        position={[0, -0.01, 0]}
      />
      <OrbitControls />
      <Environment preset="city" />
    </Canvas>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
