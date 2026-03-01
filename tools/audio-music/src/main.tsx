import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import * as audio from '../../../template/src/audio'

const tracks = {
  'gameplay': 'audio/music/gameplay.ogg',
  'boss-fight': 'audio/music/boss-fight.ogg',
  'death': 'audio/music/death.ogg',
  'victory': 'audio/music/victory.ogg',
}

const trackLabels: Record<string, string> = {
  'gameplay': 'Gameplay',
  'boss-fight': 'Boss Fight',
  'death': 'Death',
  'victory': 'Victory',
}

const TRACK_COLORS: Record<string, string> = {
  'gameplay': '#4488ff',
  'boss-fight': '#ff4444',
  'death': '#aa44ff',
  'victory': '#ffcc00',
}

function App() {
  const [currentTrack, setCurrentTrack] = useState<string | null>(null)
  const [gains, setGains] = useState<Record<string, number>>({})
  const [fadeDuration, setFadeDuration] = useState(3)
  const [volume, setVolume] = useState(0.7)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const gainNodes = useRef<Map<string, GainNode>>(new Map())

  useEffect(() => {
    const id = window.setInterval(() => {
      const cur = (audio.player as any).current as { name: string; gain: GainNode } | null
      if (cur) gainNodes.current.set(cur.name, cur.gain)
      setCurrentTrack(cur?.name ?? null)
      const g: Record<string, number> = {}
      for (const [name, node] of gainNodes.current) {
        const v = node.gain.value
        if (v > 0.001) g[name] = v
        else if (name !== cur?.name) gainNodes.current.delete(name)
      }
      setGains(g)
    }, 50)
    return () => clearInterval(id)
  }, [])

  const init = useCallback(async () => {
    setLoading(true)
    audio.player.musicVolume = volume
    await audio.player.preload(tracks)
    setReady(true)
    setLoading(false)
  }, [volume])

  const play = (name: string) => audio.player.playMusic(name, { fade: fadeDuration, loop: true })
  const stop = () => audio.player.stopMusic(fadeDuration)

  useEffect(() => { audio.player.musicVolume = volume }, [volume])

  return (
    <div style={{
      fontFamily: 'system-ui, sans-serif',
      background: '#1a1a2e',
      color: '#eee',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
    }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#88f' }}>Music Fade Test</h1>
      <p style={{ fontSize: 13, opacity: 0.4 }}>CC0 tracks from OpenGameArt</p>

      {!ready ? (
        <button onClick={init} disabled={loading} style={btnStyle('#4488ff')}>
          {loading ? 'Loading tracks...' : 'Click to load & init'}
        </button>
      ) : (
        <>
          <div style={{ fontSize: 14, opacity: 0.6 }}>
            Now playing: <strong>{currentTrack ? trackLabels[currentTrack] : 'nothing'}</strong>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.keys(tracks).map(name => {
              const g = gains[name] ?? 0
              const fill = Math.min(g / volume, 1)
              const color = TRACK_COLORS[name] ?? '#4f4'
              return (
                <button key={name} onClick={() => play(name)} style={{
                  ...btnStyle('#333'),
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${fill * 100}%`,
                    background: color,
                    opacity: 0.35,
                    transition: 'width 0.08s linear',
                  }} />
                  <span style={{ position: 'relative', zIndex: 1 }}>{trackLabels[name]}</span>
                </button>
              )
            })}
            <button onClick={stop} style={btnStyle('#663333')}>Stop</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              Fade: {fadeDuration.toFixed(1)}s
              <input type="range" min="0" max="8" step="0.1" value={fadeDuration}
                onChange={e => setFadeDuration(parseFloat(e.target.value))} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              Volume: {(volume * 100).toFixed(0)}%
              <input type="range" min="0" max="1" step="0.01" value={volume}
                onChange={e => setVolume(parseFloat(e.target.value))} />
            </label>
          </div>

          <div style={{ fontSize: 12, opacity: 0.3, maxWidth: 360, textAlign: 'center', marginTop: 16 }}>
            Click a different track while one is playing to test crossfade.
          </div>
        </>
      )}
    </div>
  )
}

const btnStyle = (bg: string): React.CSSProperties => ({
  background: bg,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '10px 20px',
  fontSize: 14,
  cursor: 'pointer',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  width: 220,
})

createRoot(document.getElementById('root')!).render(<App />)
