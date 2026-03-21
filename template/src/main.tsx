import React, { useRef, useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { gameStore, tick, startRun, endRun, showMeta } from './store'
import * as input from './input'
import * as audio from './audio'
import * as clock from './clock'
import * as shake from './shake'
import * as feedback from './feedback'
import { GrayboxMaterial } from './graybox-material'
import * as particles from './particles'
import * as meta from './meta'
import { MetaScreen } from './meta-screen'
import * as profile from './profile'
import * as palDerive from './palette-derive'

const PALETTE = {
  ground: '#334433',
  wall: '#445544',
  player: '#4488ff',
  accent: '#ffdd44',
  enemies: [] as string[],
}
const derived = palDerive.derive(PALETTE, [])

function usePhase() {
  return useSyncExternalStore(
    gameStore.subscribe,
    () => gameStore.getState().phase,
  )
}

function Player() {
  const ref = useRef<THREE.Mesh>(null)

  useFrame((_, dt) => {
    const state = gameStore.getState()
    // Block movement when level-up or shrine UI is active
    const blocked = state.levelUpActive || state.shrineActive
    const [rmx, rmz] = input.getMovement()
    const mx = blocked ? 0 : rmx
    const mz = blocked ? 0 : rmz
    state.player.position[0] += mx * state.player.speed * dt
    state.player.position[2] += mz * state.player.speed * dt
    if (mx !== 0 || mz !== 0) {
      const target = Math.atan2(mx, mz)
      let delta = target - state.player.facing
      if (delta > Math.PI) delta -= 2 * Math.PI
      if (delta < -Math.PI) delta += 2 * Math.PI
      state.player.facing += delta * Math.min(1, 15 * dt)
    }
    ref.current!.rotation.y = state.player.facing
    ref.current!.position.set(...state.player.position)
  })

  return (
    <mesh ref={ref} position={[0, 0.5, 0]}>
      <capsuleGeometry args={[0.3, 0.8, 4, 8]} />
      <GrayboxMaterial color={PALETTE.player} style="smooth" />
    </mesh>
  )
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[50, 50]} />
      <GrayboxMaterial color={PALETTE.ground} style="organic" />
    </mesh>
  )
}

function GameLoop() {
  const gl = useThree(s => s.gl)
  useEffect(() => { if (__PROFILE__) profile.renderer(gl) }, [gl])
  useFrame((_, dt) => {
    clock.tick(dt)
    const { simDt, vizDt } = clock.getState()
    tick(simDt)
    const acc = gameStore.getState().accessibility
    shake.tick(vizDt, acc.reduceShake)
  })
  return null
}

let cameraDistance = 0.7

function FollowCamera() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      cameraDistance = Math.max(0.4, Math.min(1.5, cameraDistance + e.deltaY * 0.001))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  useFrame(({ camera }) => {
    const [px, py, pz] = gameStore.getState().player.position
    const [sx, sy] = shake.getOffset()
    const d = cameraDistance
    camera.position.set(px + sx, py + 10 * d + sy, pz + 8 * d)
    camera.lookAt(px, py, pz)
  })
  return null
}

function MenuScreen() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: derived.uiBackground, color: derived.uiText, fontFamily: 'sans-serif',
    }}>
      <button
        onClick={() => { feedback.reset(); shake.reset(); clock.reset(); startRun() }}
        style={{ padding: '16px 48px', fontSize: 24, cursor: 'pointer' }}
      >
        Play
      </button>
    </div>
  )
}

function OutcomeOverlay({ outcome }: { outcome: 'dead' | 'victory' }) {
  const [runCurrency] = useState(0)

  function handleContinue() {
    const s = meta.addCurrency(meta.load(), runCurrency)
    meta.save(s)
    showMeta()
  }

  return (
    <div
      onClick={handleContinue}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.85)', color: '#fff', fontFamily: 'sans-serif',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>
        {outcome === 'victory' ? 'Victory' : 'Defeated'}
      </div>
      <div style={{ fontSize: 16, opacity: 0.6 }}>
        +{runCurrency} currency
      </div>
      <div style={{ fontSize: 14, opacity: 0.4, marginTop: 24 }}>
        Click to continue
      </div>
    </div>
  )
}

function MetaWrapper() {
  const [metaState, setMetaState] = useState(meta.load)

  function handlePurchase(_id: string) {
    // LLM wires actual upgrade defs per game
  }

  function handlePlay() {
    feedback.reset(); shake.reset(); clock.reset()
    startRun()
  }

  return (
    <MetaScreen
      metaState={metaState}
      upgrades={[]}
      onPurchase={handlePurchase}
      onPlay={handlePlay}
    />
  )
}

function App() {
  const phase = usePhase()

  useEffect(() => {
    audio.player.preload(audio.defaultManifest)
  }, [])

  if (phase === 'menu') return <MenuScreen />
  if (phase === 'meta') return <MetaWrapper />

  return (
    <>
      <Canvas shadows>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />
        <GameLoop />
        <FollowCamera />
        <Ground />
        <Player />
        <particles.ParticlePool />
      </Canvas>
      {(phase === 'dead' || phase === 'victory') && (
        <OutcomeOverlay outcome={phase} />
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
