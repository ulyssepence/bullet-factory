import React, { useState, useEffect, useMemo, useRef, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { assembleArenaV2, DEMO_CONFIG } from '../../../template/src/level/generate'
import type { ArenaResult } from '../../../template/src/level/generate'
import { generateHeightmap } from './heightmap'
import { carveLandmarkClearing, findLandmarkPosition } from './landmark'
import { createGate } from './gate'
import type { Gate } from './gate'
import { buildSpeedGrid } from './speed'
import { TerrainScene } from './scene'

function Panel({ title, children, style }: { title: string; children: ReactNode; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{
      position: 'fixed',
      background: 'rgba(0,0,0,0.8)', color: '#eee', padding: open ? 12 : '6px 12px',
      borderRadius: 6, fontFamily: 'monospace', fontSize: 13, zIndex: 10,
      ...style,
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ fontSize: 10 }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontWeight: 'bold', fontSize: 12 }}>{title}</span>
      </div>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>{children}</div>}
    </div>
  )
}

function Slider({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void
  min: number; max: number; step: number
}) {
  return (
    <label>
      {label} {value.toFixed(step < 1 ? 1 : 0)}{' '}
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} />
    </label>
  )
}

function App() {
  const [seed, setSeed] = useState(42)
  const [zoneHeights, setZoneHeights] = useState([0, 1.5, 3.0])
  const [showGrid, setShowGrid] = useState(false)
  const [showSpeed, setShowSpeed] = useState(false)
  const [showHeightmap, setShowHeightmap] = useState(false)
  const [smoothingPasses, setSmoothingPasses] = useState(1)
  const [gateTimer, setGateTimer] = useState(10)
  const [entityCount, setEntityCount] = useState(20)
  const [chestTimer, setChestTimer] = useState(15)
  const [rebuildKey, setRebuildKey] = useState(0)
  const gateRef = useRef<Gate | null>(null)

  const [landmarkXZ, setLandmarkXZ] = useState<[number, number]>([0, 0])

  const result = useMemo(() => {
    const r = assembleArenaV2({ ...DEMO_CONFIG, seed })
    const lm = findLandmarkPosition(r.grid, r.zoneMap, r.worldSize, 2)
    carveLandmarkClearing(r.grid, r.worldSize, lm.x, lm.z, 6)
    setLandmarkXZ([lm.x, lm.z])
    gateRef.current = createGate(r.grid, r.zoneMap, r.worldSize, 4)
    setRebuildKey(0)
    return r
  }, [seed])

  const heightmap = useMemo(
    () => generateHeightmap(result.grid, result.zoneMap, result.worldSize, zoneHeights, seed),
    [result, zoneHeights, seed],
  )

  const speedGrid = useMemo(
    () => buildSpeedGrid(heightmap, result.grid, result.worldSize),
    [heightmap, result],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        setSeed(s => s + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setZoneHeight = (i: number, v: number) =>
    setZoneHeights(h => { const n = [...h]; n[i] = v; return n })

  const center = result.worldSize / 2

  return (
    <>
      <Canvas
        shadows={false}
        camera={{ position: [center, center * 1.2, center + center * 0.8], fov: 50, near: 0.1, far: 500 }}
        style={{ width: '100vw', height: '100vh', background: '#556' }}
      >
        <OrbitControls target={[center, 0.6, center]} enableDamping={false} />
        <TerrainScene
          result={result}
          heightmap={heightmap}
          speedGrid={speedGrid}
          seed={seed}
          showGrid={showGrid}
          showSpeed={showSpeed}
          showHeightmap={showHeightmap}
          smoothingOverride={smoothingPasses}
          landmarkPos={landmarkXZ}
          gate={gateRef.current}
          gateTimer={gateTimer}
          onGateOpen={() => {}}
          entityCount={entityCount}
          chestTimer={chestTimer}
          rebuildKey={rebuildKey}
        />
      </Canvas>

      <Panel title="Controls" style={{ top: 12, left: 12 }}>
        <label>
          Seed{' '}
          <input type="number" value={seed}
            onChange={e => setSeed(parseInt(e.target.value) || 0)}
            style={{ width: 70, background: '#222', color: '#eee', border: '1px solid #555', padding: '2px 4px' }}
          />
        </label>
        <Slider label="Zone 0 height" value={zoneHeights[0]} onChange={v => setZoneHeight(0, v)} min={0} max={4} step={0.1} />
        <Slider label="Zone 1 height" value={zoneHeights[1]} onChange={v => setZoneHeight(1, v)} min={0} max={4} step={0.1} />
        <Slider label="Zone 2 height" value={zoneHeights[2]} onChange={v => setZoneHeight(2, v)} min={0} max={4} step={0.1} />
        <Slider label="Smoothing" value={smoothingPasses} onChange={v => setSmoothingPasses(v)} min={0} max={5} step={1} />
        <Slider label="Gate timer" value={gateTimer} onChange={v => setGateTimer(v)} min={5} max={30} step={1} />
        <Slider label="Entities" value={entityCount} onChange={v => setEntityCount(v)} min={0} max={50} step={1} />
        <Slider label="Chest timer" value={chestTimer} onChange={v => setChestTimer(v)} min={5} max={30} step={1} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
          Show grid
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showSpeed} onChange={e => setShowSpeed(e.target.checked)} />
          Show speed
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showHeightmap} onChange={e => setShowHeightmap(e.target.checked)} />
          Show heightmap
        </label>
        <button
          onClick={() => setSeed(s => s + 1)}
          style={{ padding: '4px 8px', background: '#444', color: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Generate
        </button>
        <div style={{ fontSize: 11, color: '#999' }}>Space = next seed</div>
      </Panel>

      {result.stats && (
        <Panel title="Stats" style={{ top: 12, right: 12 }}>
          <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.6 }}>
            <div>World: {result.stats.worldSize}x{result.stats.worldSize}</div>
            <div>Density: {(result.stats.density * 100).toFixed(1)}%</div>
            <div>Connected: {result.stats.connected ? '\u2713' : '\u2717'}</div>
            <div>Heights: [{zoneHeights.map(h => h.toFixed(1)).join(', ')}]</div>
          </div>
        </Panel>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
