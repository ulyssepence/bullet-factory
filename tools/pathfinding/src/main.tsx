import React, { useRef, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  gameStore, tick, spawnEnemies, removeEnemies,
  navState, levelGrid, hash, WORLD_SIZE, CELL_SIZE,
} from './store'
import * as input from '../../../template/src/input'
import * as grid from '../../../template/src/systems/grid'
import * as profile from '../../../template/src/profile'

const _obj = new THREE.Object3D()

function GameLoop() {
  const gl = useThree(s => s.gl)
  useEffect(() => { if (__PROFILE__) profile.renderer(gl) }, [gl])
  useFrame((_, rawDt) => tick(Math.min(rawDt, 0.05)))
  return null
}

function FollowCamera() {
  useFrame(({ camera }) => {
    const [px, py, pz] = gameStore.getState().player.position
    camera.position.set(px, py + 18, pz + 14)
    camera.lookAt(px, py, pz)
  })
  return null
}

function Player() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const state = gameStore.getState()
    const [mx, mz] = input.getMovement()
    const speed = state.player.speed * dt
    const nx = state.player.position[0] + mx * speed
    const nz = state.player.position[2] + mz * speed
    if (grid.isFloor(levelGrid, nx, nz, WORLD_SIZE)) {
      state.player.position[0] = nx
      state.player.position[2] = nz
    } else if (grid.isFloor(levelGrid, nx, state.player.position[2], WORLD_SIZE)) {
      state.player.position[0] = nx
    } else if (grid.isFloor(levelGrid, state.player.position[0], nz, WORLD_SIZE)) {
      state.player.position[2] = nz
    }
    ref.current!.position.set(...state.player.position)
  })
  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.6, 1.0, 0.6]} />
      <meshStandardMaterial color="#4488ff" emissive="#2244aa" emissiveIntensity={0.3} />
    </mesh>
  )
}

function Level() {
  const wallRef = useRef<THREE.InstancedMesh>(null)
  const wallPositions = useMemo(() => {
    const pos: [number, number, number][] = []
    for (let z = 0; z < WORLD_SIZE; z++)
      for (let x = 0; x < WORLD_SIZE; x++)
        if (levelGrid[z * WORLD_SIZE + x] === 1)
          pos.push([x + 0.5, 0.5, z + 0.5])
    return pos
  }, [])

  useEffect(() => {
    const mesh = wallRef.current!
    for (let i = 0; i < wallPositions.length; i++) {
      _obj.position.set(...wallPositions[i])
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [wallPositions])

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WORLD_SIZE / 2, 0, WORLD_SIZE / 2]}>
        <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
        <meshStandardMaterial color="#2a3a2a" />
      </mesh>
      <instancedMesh ref={wallRef} args={[undefined, undefined, wallPositions.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#556677" />
      </instancedMesh>
    </>
  )
}

function EnemyPool() {
  const MAX = 2000
  const ref = useRef<THREE.InstancedMesh>(null)
  useFrame(() => {
    const { enemies } = gameStore.getState()
    const mesh = ref.current!
    let i = 0
    for (const enemy of enemies.values()) {
      if (i >= MAX) break
      _obj.position.set(...enemy.position)
      _obj.scale.setScalar(enemy.size * 0.5)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      i++
    }
    mesh.count = i
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial color="#ee4444" />
    </instancedMesh>
  )
}

function FlowFieldOverlay() {
  const ref = useRef<THREE.LineSegments>(null)
  const lastGen = useRef(0)
  const { positions, geom } = useMemo(() => {
    const pos = new Float32Array(WORLD_SIZE * WORLD_SIZE * 2 * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setDrawRange(0, 0)
    return { positions: pos, geom: g }
  }, [])

  useFrame(() => {
    const { debug } = gameStore.getState()
    if (!debug.showFlow) { ref.current!.visible = false; return }
    ref.current!.visible = true
    if (navState.flowGeneration === lastGen.current) return
    lastGen.current = navState.flowGeneration

    let vi = 0
    for (let z = 0; z < WORLD_SIZE; z++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        const idx = z * WORLD_SIZE + x
        if (navState.flowGen[idx] !== navState.flowGeneration) continue
        const fdx = navState.flowDirs[idx * 2]
        const fdz = navState.flowDirs[idx * 2 + 1]
        if (fdx === 0 && fdz === 0) continue
        const cx = x + 0.5, cz = z + 0.5
        positions[vi++] = cx; positions[vi++] = 0.15; positions[vi++] = cz
        positions[vi++] = cx + fdx * 0.35; positions[vi++] = 0.15; positions[vi++] = cz + fdz * 0.35
      }
    }
    geom.getAttribute('position').needsUpdate = true
    geom.setDrawRange(0, vi / 3)
  })

  return (
    <lineSegments ref={ref} geometry={geom} visible={false} frustumCulled={false}>
      <lineBasicMaterial color="#00ff88" opacity={0.5} transparent depthTest={false} />
    </lineSegments>
  )
}

function SpatialGridOverlay() {
  const ref = useRef<THREE.LineSegments>(null)
  const geom = useMemo(() => {
    const verts: number[] = []
    const n = Math.ceil(WORLD_SIZE / CELL_SIZE)
    for (let i = 0; i <= n; i++) {
      const v = i * CELL_SIZE
      verts.push(v, 0.08, 0, v, 0.08, WORLD_SIZE)
      verts.push(0, 0.08, v, WORLD_SIZE, 0.08, v)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    return g
  }, [])
  useFrame(() => { ref.current!.visible = gameStore.getState().debug.showGrid })
  return (
    <lineSegments ref={ref} geometry={geom} visible={false} frustumCulled={false}>
      <lineBasicMaterial color="#ffffff" opacity={0.12} transparent depthTest={false} />
    </lineSegments>
  )
}

function SeparationOverlay() {
  const ref = useRef<THREE.LineSegments>(null)
  const MAX = 2000
  const { positions, geom } = useMemo(() => {
    const pos = new Float32Array(MAX * 2 * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setDrawRange(0, 0)
    return { positions: pos, geom: g }
  }, [])

  useFrame(() => {
    const { debug, enemies } = gameStore.getState()
    if (!debug.showSeparation || !debug.separationEnabled) {
      ref.current!.visible = false; return
    }
    ref.current!.visible = true
    let vi = 0
    for (const enemy of enemies.values()) {
      if (vi >= MAX * 6) break
      let px = 0, pz = 0
      hash.forEachNeighbor(enemy.position[0], enemy.position[2], (other: any) => {
        if (other === enemy) return
        const ex = grid.shortestWrapped(enemy.position[0], other.position[0], WORLD_SIZE)
        const ez = grid.shortestWrapped(enemy.position[2], other.position[2], WORLD_SIZE)
        const d = Math.sqrt(ex * ex + ez * ez)
        const minD = (enemy.size + other.size) * 0.4
        if (d < minD && d > 0.01) {
          const overlap = minD - d
          px += (ex / d) * overlap
          pz += (ez / d) * overlap
        }
      })
      if (px !== 0 || pz !== 0) {
        const len = Math.sqrt(px * px + pz * pz)
        positions[vi++] = enemy.position[0]
        positions[vi++] = 0.6
        positions[vi++] = enemy.position[2]
        positions[vi++] = enemy.position[0] + (px / len) * Math.min(len * 2, 0.8)
        positions[vi++] = 0.6
        positions[vi++] = enemy.position[2] + (pz / len) * Math.min(len * 2, 0.8)
      }
    }
    geom.getAttribute('position').needsUpdate = true
    geom.setDrawRange(0, vi / 3)
  })

  return (
    <lineSegments ref={ref} geometry={geom} frustumCulled={false}>
      <lineBasicMaterial color="#ffff00" opacity={0.7} transparent depthTest={false} />
    </lineSegments>
  )
}

function HUD() {
  const [hud, setHud] = useState({
    fps: 60, count: 200,
    showFlow: false, showGrid: false, showSep: false,
    sepOn: true, mode: 'chase' as 'chase' | 'wander',
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const { stats, debug } = gameStore.getState()
      setHud({
        fps: stats.fps, count: stats.enemyCount,
        showFlow: debug.showFlow, showGrid: debug.showGrid,
        showSep: debug.showSeparation,
        sepOn: debug.separationEnabled, mode: debug.enemyMode,
      })
    }, 150)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const { debug } = gameStore.getState()
      switch (e.code) {
        case 'KeyF': debug.showFlow = !debug.showFlow; break
        case 'KeyG': debug.showGrid = !debug.showGrid; break
        case 'KeyV': debug.showSeparation = !debug.showSeparation; break
        case 'KeyT': debug.separationEnabled = !debug.separationEnabled; break
        case 'KeyM': debug.enemyMode = debug.enemyMode === 'chase' ? 'wander' : 'chase'; break
        case 'Equal': case 'NumpadAdd': spawnEnemies(10); break
        case 'Minus': case 'NumpadSubtract': removeEnemies(10); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const dot = (on: boolean): React.CSSProperties => ({
    display: 'inline-block', width: 8, height: 8, borderRadius: 4,
    backgroundColor: on ? '#0f0' : '#555', marginLeft: 4, verticalAlign: 'middle',
  })
  const btn: React.CSSProperties = {
    display: 'inline-block', padding: '2px 8px',
    background: 'rgba(255,255,255,0.15)', borderRadius: 3,
    cursor: 'pointer', marginRight: 4, userSelect: 'none',
  }

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, padding: 12,
      color: '#fff', fontFamily: 'monospace', fontSize: 13,
      textShadow: '1px 1px 2px #000', pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 16, marginBottom: 6 }}>
        FPS: {hud.fps} | Enemies: {hud.count}
      </div>
      <div style={{ opacity: 0.8, lineHeight: '1.8' }}>
        [F] Flow<span style={dot(hud.showFlow)} />{' \u00a0'}
        [G] Grid<span style={dot(hud.showGrid)} />{' \u00a0'}
        [V] Sep.viz<span style={dot(hud.showSep)} />
        <br />
        [T] Separation<span style={dot(hud.sepOn)} />{' \u00a0'}
        [M] Mode: {hud.mode}
        <br />
        <span style={{ pointerEvents: 'auto' }}>
          <span style={btn} onClick={() => spawnEnemies(10)}>[+] Add 10</span>
          <span style={btn} onClick={() => removeEnemies(10)}>[-] Remove 10</span>
          <span style={{ ...btn, marginLeft: 8 }}
            onClick={() => {
              const d = gameStore.getState().debug
              d.enemyMode = d.enemyMode === 'chase' ? 'wander' : 'chase'
            }}>
            Toggle mode
          </span>
        </span>
      </div>
    </div>
  )
}

function App() {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas>
        <color attach="background" args={['#1a1a2e']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 20, 10]} intensity={0.7} />
        <GameLoop />
        <FollowCamera />
        <Level />
        <Player />
        <EnemyPool />
        <FlowFieldOverlay />
        <SpatialGridOverlay />
        <SeparationOverlay />
      </Canvas>
      <HUD />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
