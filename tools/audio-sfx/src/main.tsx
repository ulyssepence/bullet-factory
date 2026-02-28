import React, { useState, useRef, useCallback, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

interface SoundEntry {
  category: string
  filename: string
  path: string
}

const SOUNDS: SoundEntry[] = [
  { category: 'generated', filename: 'ambient.wav', path: 'audio/ambient.wav' },
  { category: 'generated', filename: 'death.wav', path: 'audio/death.wav' },
  { category: 'generated', filename: 'hit.wav', path: 'audio/hit.wav' },
  { category: 'generated', filename: 'hurt.wav', path: 'audio/hurt.wav' },
  { category: 'generated', filename: 'levelup.wav', path: 'audio/levelup.wav' },
  { category: 'generated', filename: 'pickup.wav', path: 'audio/pickup.wav' },
  { category: 'generated', filename: 'shoot.wav', path: 'audio/shoot.wav' },
  ...['carpet', 'concrete', 'grass', 'snow', 'wood'].flatMap(s =>
    Array.from({ length: 5 }, (_, i) => ({ category: 'footstep', filename: `footstep_${s}_00${i}.ogg`, path: `audio/footstep/footstep_${s}_00${i}.ogg` }))
  ),
  ...Array.from({ length: 10 }, (_, i) => ({ category: 'footstep', filename: `footstep0${i}.ogg`, path: `audio/footstep/footstep0${i}.ogg` })),
  ...([ 'Bell_heavy', 'Generic_light', 'Glass_heavy', 'Glass_light', 'Glass_medium',
    'Metal_heavy', 'Metal_light', 'Metal_medium', 'Mining', 'Plank_medium',
    'Plate_heavy', 'Plate_light', 'Plate_medium', 'Punch_heavy', 'Punch_medium',
    'Soft_heavy', 'Soft_medium', 'Tin_medium', 'Wood_heavy', 'Wood_light', 'Wood_medium',
  ] as const).flatMap(t =>
    Array.from({ length: 5 }, (_, i) => ({ category: 'impact', filename: `impact${t}_00${i}.ogg`, path: `audio/impact/impact${t}_00${i}.ogg` }))
  ),
  ...Array.from({ length: 5 }, (_, i) => ({ category: 'powerup', filename: `phaseJump${i+1}.ogg`, path: `audio/powerup/phaseJump${i+1}.ogg` })),
  ...Array.from({ length: 3 }, (_, i) => ({ category: 'powerup', filename: `phaserDown${i+1}.ogg`, path: `audio/powerup/phaserDown${i+1}.ogg` })),
  ...Array.from({ length: 7 }, (_, i) => ({ category: 'powerup', filename: `phaserUp${i+1}.ogg`, path: `audio/powerup/phaserUp${i+1}.ogg` })),
  ...Array.from({ length: 12 }, (_, i) => ({ category: 'powerup', filename: `powerUp${i+1}.ogg`, path: `audio/powerup/powerUp${i+1}.ogg` })),
  ...['beltHandle1','beltHandle2','bookClose','bookFlip1','bookFlip2','bookFlip3','bookOpen',
    'bookPlace1','bookPlace2','bookPlace3','cloth1','cloth2','cloth3','cloth4','clothBelt',
    'clothBelt2','creak1','creak2','creak3','doorClose_1','doorClose_2','doorClose_3',
    'doorClose_4','doorOpen_1','doorOpen_2','dropLeather','handleCoins','handleCoins2',
    'handleSmallLeather','handleSmallLeather2','metalClick','metalLatch','metalPot1',
    'metalPot2','metalPot3',
  ].map(f => ({ category: 'rpg', filename: `${f}.ogg`, path: `audio/rpg/${f}.ogg` })),
  ...['highDown','highUp','lowDown','lowRandom','lowThreeTone','pepSound1','pepSound2',
    'pepSound3','pepSound4','pepSound5','spaceTrash1','spaceTrash2','spaceTrash3',
    'spaceTrash4','spaceTrash5','threeTone1','threeTone2','tone1','twoTone1','twoTone2',
  ].map(f => ({ category: 'tone', filename: `${f}.ogg`, path: `audio/tone/${f}.ogg` })),
  ...['back_001','back_002','back_003','back_004','bong_001','click_001','click_002','click_003',
    'click_004','click_005','click1','click2','click3','click4','click5','close_001','close_002',
    'close_003','close_004','confirmation_001','confirmation_002','confirmation_003','confirmation_004',
    'drop_001','drop_002','drop_003','drop_004','error_001','error_002','error_003','error_004',
    'error_005','error_006','error_007','error_008','glass_001','glass_002','glass_003','glass_004',
    'glass_005','glass_006','glitch_001','glitch_002','glitch_003','glitch_004','maximize_001',
    'maximize_002','maximize_003','maximize_004','maximize_005','maximize_006','maximize_007',
    'maximize_008','maximize_009','minimize_001','minimize_002','minimize_003','minimize_004',
    'minimize_005','minimize_006','minimize_007','minimize_008','minimize_009','mouseclick1',
    'mouserelease1','open_001','open_002','open_003','open_004','pluck_001','pluck_002',
    'question_001','question_002','question_003','question_004','rollover1','rollover2','rollover3',
    'rollover4','rollover5','rollover6','scratch_001','scratch_002','scratch_003','scratch_004',
    'scratch_005','scroll_001','scroll_002','scroll_003','scroll_004','scroll_005','select_001',
    'select_002','select_003','select_004','select_005','select_006','select_007','select_008',
    'switch_001','switch_002','switch_003','switch_004','switch_005','switch_006','switch_007',
    ...Array.from({ length: 38 }, (_, i) => `switch${i+1}`),
    'tick_001','tick_002','tick_004','toggle_001','toggle_002','toggle_003','toggle_004',
  ].map(f => ({ category: 'ui', filename: `${f}.ogg`, path: `audio/ui/${f}.ogg` })),
  ...['chop','drawKnife1','drawKnife2','drawKnife3','knifeSlice','knifeSlice2','laser1','laser2',
    'laser3','laser4','laser5','laser6','laser7','laser8','laser9','zap1','zap2',
    'zapThreeToneDown','zapThreeToneUp','zapTwoTone','zapTwoTone2',
  ].map(f => ({ category: 'weapon', filename: `${f}.ogg`, path: `audio/weapon/${f}.ogg` })),
]

const CATEGORIES = [...new Set(SOUNDS.map(s => s.category))].sort()

const GAME_EVENTS = [
  'hit', 'death', 'hurt', 'pickup', 'levelup', 'shoot',
  'dash', 'block', 'coin', 'menuClick', 'menuHover',
] as const
type GameEvent = typeof GAME_EVENTS[number]

let audioCtx: AudioContext | null = null
function getCtx() {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

const bufferCache = new Map<string, AudioBuffer>()

async function playSound(path: string): Promise<AudioBufferSourceNode | null> {
  const ctx = getCtx()
  if (ctx.state === 'suspended') await ctx.resume()
  let buf = bufferCache.get(path)
  if (!buf) {
    try {
      const res = await fetch(path)
      buf = await ctx.decodeAudioData(await res.arrayBuffer())
      bufferCache.set(path, buf)
    } catch { return null }
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
  return src
}

function SoundRow({ sound, playing, onPlay, onAssign, assignMode }: {
  sound: SoundEntry; playing: string | null; onPlay: (p: string) => void
  onAssign: ((p: string) => void) | null; assignMode: boolean
}) {
  const isPlaying = playing === sound.path
  return (
    <div
      className={`sound-row ${isPlaying ? 'playing' : ''} ${assignMode ? 'assign-mode' : ''}`}
      onClick={() => assignMode && onAssign ? onAssign(sound.path) : onPlay(sound.path)}
    >
      <button className="play-btn" onClick={e => { e.stopPropagation(); onPlay(sound.path) }}>
        {isPlaying ? '\u25A0' : '\u25B6'}
      </button>
      <span className="sound-name">{sound.filename}</span>
      {assignMode && <span className="assign-hint">click to assign</span>}
    </div>
  )
}

function App() {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(CATEGORIES))
  const [playing, setPlaying] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [assigningEvent, setAssigningEvent] = useState<GameEvent | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)

  const handlePlay = useCallback(async (path: string) => {
    if (sourceRef.current) { try { sourceRef.current.stop() } catch {} }
    setPlaying(path)
    const src = await playSound(path)
    sourceRef.current = src
    if (src) src.onended = () => setPlaying(p => p === path ? null : p)
  }, [])

  const handleAssign = useCallback((path: string) => {
    if (!assigningEvent) return
    setMapping(m => ({ ...m, [assigningEvent]: path }))
    setAssigningEvent(null)
  }, [assigningEvent])

  const toggleCategory = (cat: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const exportMapping = () => {
    const blob = new Blob([JSON.stringify(mapping, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'sound-mapping.json'
    a.click()
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setAssigningEvent(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const filtered = search
    ? SOUNDS.filter(s => s.filename.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase()))
    : SOUNDS

  const byCategory = new Map<string, SoundEntry[]>()
  for (const s of filtered) {
    const arr = byCategory.get(s.category) || []
    arr.push(s)
    byCategory.set(s.category, arr)
  }

  return (
    <div className="app">
      <header>
        <h1>SFX Audition Tool</h1>
        <input type="text" placeholder="Search sounds..." value={search} onChange={e => setSearch(e.target.value)} className="search" />
      </header>
      <div className="panels">
        <div className="left">
          <h2>Sound Library ({filtered.length})</h2>
          {[...byCategory.entries()].map(([cat, sounds]) => (
            <div key={cat} className="category">
              <div className="cat-header" onClick={() => toggleCategory(cat)}>
                <span className="chevron">{expanded.has(cat) ? '\u25BE' : '\u25B8'}</span>
                <span className="cat-name">{cat}</span>
                <span className="cat-count">{sounds.length}</span>
              </div>
              {expanded.has(cat) && (
                <div className="cat-sounds">
                  {sounds.map(s => (
                    <SoundRow key={s.path} sound={s} playing={playing} onPlay={handlePlay}
                      onAssign={assigningEvent ? handleAssign : null} assignMode={!!assigningEvent} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="right">
          <h2>Event Mapping</h2>
          {assigningEvent && (
            <div className="assign-banner">
              Assigning: <strong>{assigningEvent}</strong>
              <button onClick={() => setAssigningEvent(null)}>cancel</button>
            </div>
          )}
          <div className="events">
            {GAME_EVENTS.map(evt => {
              const assigned = mapping[evt]
              return (
                <div key={evt} className={`event-row ${assigningEvent === evt ? 'active' : ''}`}>
                  <span className="event-name">{evt}</span>
                  <span className="event-sound" title={assigned || 'unassigned'}>{assigned ? assigned.split('/').pop() : '\u2014'}</span>
                  <button className="play-btn" disabled={!assigned} onClick={() => assigned && handlePlay(assigned)}>{'\u25B6'}</button>
                  <button className="assign-btn" onClick={() => setAssigningEvent(assigningEvent === evt ? null : evt)}>
                    {assigningEvent === evt ? '\u2715' : '\u2397'}
                  </button>
                  {assigned && <button className="clear-btn" onClick={() => setMapping(m => { const n = { ...m }; delete n[evt]; return n })}>{'\u2715'}</button>}
                </div>
              )
            })}
          </div>
          <button className="export-btn" onClick={exportMapping} disabled={Object.keys(mapping).length === 0}>
            Export Mapping JSON
          </button>
        </div>
      </div>
    </div>
  )
}

const style = document.createElement('style')
style.textContent = `
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; font-family: -apple-system, system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; }
.app { height: 100%; display: flex; flex-direction: column; }
header { padding: 12px 16px; display: flex; align-items: center; gap: 16px; background: #16213e; border-bottom: 1px solid #0f3460; }
h1 { font-size: 18px; white-space: nowrap; color: #e94560; }
h2 { font-size: 14px; padding: 8px 0; color: #aaa; text-transform: uppercase; letter-spacing: 1px; }
.search { flex: 1; padding: 8px 12px; border: 1px solid #0f3460; border-radius: 4px; background: #1a1a2e; color: #e0e0e0; font-size: 14px; outline: none; }
.search:focus { border-color: #e94560; }
.panels { flex: 1; display: flex; overflow: hidden; }
.left { flex: 1; overflow-y: auto; padding: 8px 12px; border-right: 1px solid #0f3460; }
.right { width: 340px; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; }
.category { margin-bottom: 2px; }
.cat-header { display: flex; align-items: center; gap: 6px; padding: 6px 8px; cursor: pointer; border-radius: 4px; user-select: none; }
.cat-header:hover { background: #16213e; }
.chevron { width: 12px; font-size: 12px; color: #888; }
.cat-name { font-weight: 600; font-size: 13px; }
.cat-count { font-size: 11px; color: #666; margin-left: auto; }
.cat-sounds { margin-left: 18px; }
.sound-row { display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 13px; }
.sound-row:hover { background: #16213e; }
.sound-row.playing { background: #0f3460; }
.sound-row.assign-mode { cursor: crosshair; }
.sound-row.assign-mode:hover { background: #1b4332; }
.assign-hint { margin-left: auto; font-size: 10px; color: #52b788; }
.play-btn { background: none; border: none; color: #e94560; cursor: pointer; font-size: 11px; width: 20px; padding: 2px; }
.play-btn:disabled { color: #444; cursor: default; }
.event-row { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 4px; border: 1px solid #0f3460; margin-bottom: 4px; }
.event-row.active { border-color: #52b788; background: #1b4332; }
.event-name { font-weight: 600; font-size: 13px; width: 90px; }
.event-sound { flex: 1; font-size: 12px; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.assign-btn, .clear-btn { background: none; border: 1px solid #333; color: #aaa; cursor: pointer; border-radius: 3px; font-size: 12px; padding: 2px 6px; }
.assign-btn:hover { border-color: #52b788; color: #52b788; }
.clear-btn { color: #e94560; border-color: transparent; }
.assign-banner { background: #1b4332; padding: 8px 12px; border-radius: 4px; margin-bottom: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.assign-banner button { background: none; border: 1px solid #52b788; color: #52b788; border-radius: 3px; cursor: pointer; padding: 2px 8px; }
.export-btn { margin-top: auto; padding: 10px; background: #e94560; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; }
.export-btn:disabled { background: #444; cursor: default; }
.export-btn:hover:not(:disabled) { background: #ff6b6b; }
`
document.head.appendChild(style)

createRoot(document.getElementById('root')!).render(<App />)
