import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import * as audio from '../../../template/src/audio'

const tracks = {
  'morning-rain': 'audio/music/morning-rain.mp3',
  'four-loop': 'audio/music/four-loop.mp3',
  'tempo': 'audio/music/tempo.mp3',
}

const trackLabels: Record<string, string> = {
  'morning-rain': 'Morning Rain (lofi)',
  'four-loop': 'Four Loop (puzzle)',
  'tempo': 'Tempo (upbeat)',
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 10, height: 10, borderRadius: '50%',
      background: active ? '#4f4' : '#444',
      marginRight: 8,
      boxShadow: active ? '0 0 6px #4f4' : 'none',
      transition: 'all 0.3s',
    }} />
  )
}

function App() {
  const [currentTrack, setCurrentTrack] = useState<string | null>(null)
  const [fadeDuration, setFadeDuration] = useState(3)
  const [volume, setVolume] = useState(0.7)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => {
      setCurrentTrack(audio.player.currentTrack)
    }, 100)
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
            {Object.keys(tracks).map(name => (
              <button key={name} onClick={() => play(name)} style={btnStyle(currentTrack === name ? '#336633' : '#444')}>
                <StatusDot active={currentTrack === name} />
                {trackLabels[name]}
              </button>
            ))}
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
