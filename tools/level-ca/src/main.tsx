import React, { useRef, useEffect, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import * as ca from '../../../template/src/level/ca'

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [seed, setSeed] = useState(42)
  const [densityScale, setDensityScale] = useState(1.0)
  const [iterations, setIterations] = useState(4)
  const [result, setResult] = useState<ca.ArenaResult | null>(null)

  const generate = useCallback(() => {
    const config: ca.ArenaConfig = {
      ...ca.DEMO_CONFIG,
      seed,
      caIterations: iterations,
      zones: ca.DEMO_CONFIG.zones.map(z => ({
        ...z,
        density: z.density * densityScale,
      })),
    }
    setResult(ca.assembleArena(config))
  }, [seed, densityScale, iterations])

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

  useEffect(() => {
    if (!result || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const { grid, zoneMap, motifMask, worldSize } = result
    const zones = ca.DEMO_CONFIG.zones

    const dpr = window.devicePixelRatio || 1
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cellSize = Math.floor(Math.min(vw, vh) / worldSize)
    const canvasW = cellSize * worldSize
    const canvasH = cellSize * worldSize

    canvas.width = canvasW * dpr
    canvas.height = canvasH * dpr
    canvas.style.width = canvasW + 'px'
    canvas.style.height = canvasH + 'px'
    ctx.scale(dpr, dpr)

    // Draw cells
    for (let z = 0; z < worldSize; z++) {
      for (let x = 0; x < worldSize; x++) {
        const idx = z * worldSize + x
        const cell = grid[idx]
        const zone = zones[zoneMap[idx]]
        const isMotif = motifMask[idx] === 1

        let color: string
        if (cell === ca.HAZARD) {
          const l = isMotif ? 43 : 35
          color = `hsl(0,70%,${l}%)`
        } else if (cell === ca.WALL) {
          const l = isMotif ? 73 : 65
          color = `hsl(${zone.hue},40%,${l}%)`
        } else {
          const l = isMotif ? 26 : 18
          color = `hsl(${zone.hue},50%,${l}%)`
        }

        ctx.fillStyle = color
        ctx.fillRect(x * cellSize, z * cellSize, cellSize, cellSize)

        if (isMotif && cellSize >= 3) {
          ctx.strokeStyle = 'rgba(255,255,255,0.15)'
          ctx.lineWidth = 1
          ctx.strokeRect(x * cellSize + 0.5, z * cellSize + 0.5, cellSize - 1, cellSize - 1)
        }
      }
    }

    // Zone boundary lines
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    for (let z = 0; z < worldSize; z++) {
      for (let x = 0; x < worldSize; x++) {
        const idx = z * worldSize + x
        const zn = zoneMap[idx]
        if (x < worldSize - 1 && zoneMap[idx + 1] !== zn) {
          ctx.beginPath()
          ctx.moveTo((x + 1) * cellSize, z * cellSize)
          ctx.lineTo((x + 1) * cellSize, (z + 1) * cellSize)
          ctx.stroke()
        }
        if (z < worldSize - 1 && zoneMap[idx + worldSize] !== zn) {
          ctx.beginPath()
          ctx.moveTo(x * cellSize, (z + 1) * cellSize)
          ctx.lineTo((x + 1) * cellSize, (z + 1) * cellSize)
          ctx.stroke()
        }
      }
    }

    // Chunk grid
    const cs = ca.DEMO_CONFIG.chunkSize
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let i = 1; i < worldSize / cs; i++) {
      ctx.beginPath()
      ctx.moveTo(i * cs * cellSize, 0)
      ctx.lineTo(i * cs * cellSize, canvasH)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * cs * cellSize)
      ctx.lineTo(canvasW, i * cs * cellSize)
      ctx.stroke()
    }
  }, [result])

  const stats = result?.stats

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', margin: '0 auto', background: '#111' }}
      />

      <div style={{
        position: 'fixed', top: 12, left: 12,
        background: 'rgba(0,0,0,0.8)', color: '#eee', padding: 12,
        borderRadius: 6, fontFamily: 'monospace', fontSize: 13,
        display: 'flex', flexDirection: 'column', gap: 8,
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
        <button
          onClick={generate}
          style={{ padding: '4px 8px', background: '#444', color: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Generate
        </button>
        <div style={{ fontSize: 11, color: '#999' }}>Space = next seed</div>
      </div>

      {stats && (
        <div style={{
          position: 'fixed', top: 12, right: 12,
          background: 'rgba(0,0,0,0.8)', color: '#ccc', padding: 12,
          borderRadius: 6, fontFamily: 'monospace', fontSize: 12,
          lineHeight: 1.6,
        }}>
          <div>World: {stats.worldSize}×{stats.worldSize}</div>
          <div>Density: {(stats.density * 100).toFixed(1)}%</div>
          <div>Connected: {stats.connected ? '\u2713' : '\u2717'}</div>
          <div>Motif cells: {stats.motifCells}</div>
          <div>Chunks: {stats.chunkCount}</div>
        </div>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
