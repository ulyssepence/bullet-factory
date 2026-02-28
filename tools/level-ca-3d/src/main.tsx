import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { assembleArenaV2, DEMO_CONFIG, ArenaResult, ArenaConfig, makeDebugArena } from '../../../template/src/level/generate'
import { TerrainScene } from './scene'

function App() {
  const [seed, setSeed] = useState(42)
  const [densityScale, setDensityScale] = useState(1.0)
  const [iterations, setIterations] = useState(DEMO_CONFIG.caIterations)
  const [showGrid, setShowGrid] = useState(true)
  const [smoothingPasses, setSmoothingPasses] = useState(2)
  const [result, setResult] = useState<ArenaResult | null>(null)

  const currentZones = useMemo(
    () => DEMO_CONFIG.zones.map(z => ({ ...z, density: z.density * densityScale })),
    [densityScale],
  )

  const generate = useCallback(() => {
    setResult(assembleArenaV2({
      ...DEMO_CONFIG,
      seed,
      caIterations: iterations,
      zones: currentZones,
    }))
  }, [seed, currentZones, iterations])

  useEffect(() => { generate() }, [generate])

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

  const center = result ? result.worldSize / 2 : 6

  return (
    <>
      <Canvas
        shadows
        camera={{ position: [center, center * 1.2, center + center * 0.8], fov: 50, near: 0.1, far: 500 }}
        style={{ width: '100vw', height: '100vh', background: '#556' }}
      >
        <OrbitControls target={[center, 0.6, center]} />
        {result && <TerrainScene result={result} seed={seed} showGrid={showGrid} zones={currentZones} smoothingOverride={smoothingPasses} />}
      </Canvas>

      <div style={{
        position: 'fixed', top: 12, left: 12,
        background: 'rgba(0,0,0,0.8)', color: '#eee', padding: 12,
        borderRadius: 6, fontFamily: 'monospace', fontSize: 13,
        display: 'flex', flexDirection: 'column', gap: 8,
        zIndex: 10,
      }}>
        <label>
          Seed{' '}
          <input
            type="number" value={seed}
            onChange={e => setSeed(parseInt(e.target.value) || 0)}
            style={{ width: 70, background: '#222', color: '#eee', border: '1px solid #555', padding: '2px 4px' }}
          />
        </label>
        <label>
          Density ×{densityScale.toFixed(2)}{' '}
          <input
            type="range" min="0.5" max="2.0" step="0.05" value={densityScale}
            onChange={e => setDensityScale(parseFloat(e.target.value))}
          />
        </label>
        <label>
          CA Iterations {iterations}{' '}
          <input
            type="range" min="1" max="10" step="1" value={iterations}
            onChange={e => setIterations(parseInt(e.target.value))}
          />
        </label>
        <label>
          Smoothing Passes {smoothingPasses}{' '}
          <input
            type="range" min="0" max="5" step="1" value={smoothingPasses}
            onChange={e => setSmoothingPasses(parseInt(e.target.value))}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox" checked={showGrid}
            onChange={e => setShowGrid(e.target.checked)}
          />
          Show grid
        </label>
        <button
          onClick={() => setSeed(s => s + 1)}
          style={{ padding: '4px 8px', background: '#444', color: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Generate
        </button>
        <div style={{ fontSize: 11, color: '#999' }}>Space = next seed</div>
      </div>

      {result?.stats && (
        <div style={{
          position: 'fixed', top: 12, right: 12,
          background: 'rgba(0,0,0,0.8)', color: '#ccc', padding: 12,
          borderRadius: 6, fontFamily: 'monospace', fontSize: 12,
          lineHeight: 1.6, zIndex: 10,
        }}>
          <div>World: {result.stats.worldSize}x{result.stats.worldSize}</div>
          <div>Density: {(result.stats.density * 100).toFixed(1)}%</div>
          <div>Connected: {result.stats.connected ? '\u2713' : '\u2717'}</div>
          <div>Motif cells: {result.stats.motifCells}</div>
          <div>Chunks: {result.stats.chunkCount}</div>
        </div>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
