import React, { useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { derive, shiftHueAndLuminance, type DerivedPalette } from '../../../template/src/palette-derive'
import type { Palette } from '../../../template/src/palette'

type Config = {
  slug: string
  currentPalette: Palette
  candidates: Palette[]
  enemyNames: string[]
}

declare const __CONFIG__: Config

const config = typeof __CONFIG__ !== 'undefined'
  ? __CONFIG__
  : (window as any).__CONFIG__ as Config

function derivedPreview(p: Palette) {
  return derive(p, config.enemyNames)
}

const ROLES = ['ground', 'wall', 'player', 'accent'] as const
type Role = typeof ROLES[number] | `enemy-${number}`

function paletteColors(p: Palette): { role: string; color: string }[] {
  return [
    ...ROLES.map(r => ({ role: r, color: p[r] })),
    ...p.enemies.map((c, i) => ({ role: `enemy-${i}`, color: c })),
  ]
}

function setColor(p: Palette, role: string, hex: string): Palette {
  if (role === 'ground') return { ...p, ground: hex }
  if (role === 'wall') return { ...p, wall: hex }
  if (role === 'player') return { ...p, player: hex }
  if (role === 'accent') return { ...p, accent: hex }
  const m = role.match(/^enemy-(\d+)$/)
  if (m) {
    const enemies = [...p.enemies]
    enemies[parseInt(m[1])] = hex
    return { ...p, enemies }
  }
  return p
}

function Swatch({ color, size = 32, onClick, selected, label }: {
  color: string; size?: number; onClick?: () => void; selected?: boolean; label?: string
}) {
  return (
    <div
      onClick={onClick}
      title={`${label ?? ''} ${color}`}
      style={{
        width: size, height: size, background: color, borderRadius: 4,
        border: selected ? '2px solid #fff' : '2px solid transparent',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: selected ? '0 0 0 1px #000, 0 0 8px rgba(255,255,255,0.4)' : undefined,
      }}
    />
  )
}

function GradientBar({ from, to, width = 60, height = 12 }: {
  from: string; to: string; width?: number; height?: number
}) {
  return (
    <div style={{
      width, height, borderRadius: 3,
      background: `linear-gradient(90deg, ${from}, ${to})`,
    }} />
  )
}

function PaletteCard({ palette, onClick, isSelected, enemyNames }: {
  palette: Palette; onClick: () => void; isSelected: boolean; enemyNames: string[]
}) {
  const d = derivedPreview(palette)
  const colors = paletteColors(palette)
  return (
    <div
      onClick={onClick}
      style={{
        padding: 8, borderRadius: 8, cursor: 'pointer',
        background: isSelected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
        border: isSelected ? '2px solid #fff' : '2px solid transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {colors.map(c => (
          <Swatch key={c.role} color={c.color} size={24} label={c.role} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <GradientBar from={d.grassBase} to={d.grassTip} width={40} height={8} />
        {d.zoneFloors.map((c, i) => (
          <div key={i} style={{ width: 12, height: 8, background: c, borderRadius: 2 }} />
        ))}
        <div style={{ width: 16, height: 8, background: d.uiBackground, borderRadius: 2 }} />
      </div>
      <div style={{ fontSize: 9, color: '#666', marginTop: 4 }}>
        seed {palette.seed.toFixed(2)}
      </div>
    </div>
  )
}

function ColorEditor({ palette, role, onReplace }: {
  palette: Palette; role: string; onReplace: (hex: string) => void
}) {
  const current = paletteColors(palette).find(c => c.role === role)?.color ?? '#000'
  const variants: string[] = []
  for (let dh = -40; dh <= 40; dh += 10) {
    for (let dl = -0.15; dl <= 0.15; dl += 0.05) {
      if (dh === 0 && dl === 0) continue
      variants.push(shiftHueAndLuminance(current, dh, dl))
    }
  }
  const unique = [...new Set(variants)]

  return (
    <div style={{ padding: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>
        Replace <span style={{ color: '#fff' }}>{role}</span>
        <Swatch color={current} size={20} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {unique.map(hex => (
          <Swatch key={hex} color={hex} size={28} onClick={() => onReplace(hex)} />
        ))}
      </div>
    </div>
  )
}

function App() {
  const [current, setCurrent] = useState<Palette>(config.currentPalette)
  const [candidates, setCandidates] = useState<Palette[]>(config.candidates)
  const [editRole, setEditRole] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  const d = derivedPreview(current)

  const handleApply = useCallback(async () => {
    setSaving(true)
    setSaved(false)
    await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palette: current, enemyNames: config.enemyNames }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [current])

  const handleRandomize = useCallback(async () => {
    setLoading(true)
    const startSeed = Math.random() * 10000
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 50, startSeed, enemyCount: config.enemyNames.length }),
    })
    const data = await res.json()
    setCandidates(data.candidates)
    setLoading(false)
  }, [])

  return (
    <div style={{
      minHeight: '100vh', background: '#1a1a1a', color: '#eee',
      fontFamily: 'system-ui, sans-serif', padding: 24,
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Palette Picker</h1>
          <span style={{ color: '#666' }}>{config.slug}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleApply}
            disabled={saving}
            style={{
              padding: '8px 24px', fontSize: 14, cursor: 'pointer',
              background: '#2a7', color: '#fff', border: 'none', borderRadius: 6,
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving...' : saved ? 'Saved' : 'Apply Palette'}
          </button>
          <button
            onClick={handleRandomize}
            disabled={loading}
            style={{
              padding: '8px 24px', fontSize: 14, cursor: 'pointer',
              background: '#444', color: '#fff', border: 'none', borderRadius: 6,
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Generating...' : 'Randomize More'}
          </button>
        </div>

        {/* Current palette */}
        <div style={{
          display: 'flex', gap: 16, alignItems: 'flex-start',
          marginBottom: 24, padding: 16,
          background: 'rgba(255,255,255,0.04)', borderRadius: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Current palette</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {paletteColors(current).map(c => (
                <div key={c.role} style={{ textAlign: 'center' }}>
                  <Swatch
                    color={c.color} size={40}
                    onClick={() => setEditRole(editRole === c.role ? null : c.role)}
                    selected={editRole === c.role}
                    label={c.role}
                  />
                  <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
                    {c.role.replace('enemy-', 'e')}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid #333', paddingLeft: 16 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Derived</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#666', width: 60 }}>grass</span>
              <GradientBar from={d.grassBase} to={d.grassTip} width={80} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#666', width: 60 }}>zone floors</span>
              {d.zoneFloors.map((c, i) => (
                <div key={i} style={{ width: 20, height: 14, background: c, borderRadius: 2 }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#666', width: 60 }}>zone walls</span>
              {d.zoneWalls.map((c, i) => (
                <div key={i} style={{ width: 20, height: 14, background: c, borderRadius: 2 }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#666', width: 60 }}>ui</span>
              <div style={{
                width: 40, height: 14, background: d.uiBackground, borderRadius: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, color: d.uiText,
              }}>
                text
              </div>
              <div style={{ width: 20, height: 14, background: d.sceneBackground, borderRadius: 2 }} />
            </div>
          </div>
        </div>

        {/* Color editor */}
        {editRole && (
          <div style={{ marginBottom: 24 }}>
            <ColorEditor
              palette={current}
              role={editRole}
              onReplace={hex => {
                setCurrent(setColor(current, editRole, hex))
                setEditRole(null)
              }}
            />
          </div>
        )}

        {/* Candidate grid */}
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
          {candidates.length} candidates — click to select
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 8,
        }}>
          {candidates.map((p, i) => (
            <PaletteCard
              key={`${p.seed}-${i}`}
              palette={p}
              onClick={() => setCurrent(p)}
              isSelected={p.seed === current.seed}
              enemyNames={config.enemyNames}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
