import React from 'react'
import * as meta from './meta'

export interface UpgradeDef {
  id: string
  name: string
  description: string
  maxRank: number
  costs: number[]
}

interface Props {
  metaState: meta.MetaState
  upgrades: UpgradeDef[]
  onPurchase: (id: string) => void
  onPlay: () => void
}

export function MetaScreen({ metaState, upgrades, onPurchase, onPlay }: Props) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: '#111', color: '#fff', fontFamily: 'sans-serif',
    }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>Currency: {metaState.currency}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24, width: 320 }}>
        {upgrades.map(u => {
          const rank = metaState.upgradeRanks[u.id] ?? 0
          const maxed = rank >= u.maxRank
          const cost = maxed ? 0 : u.costs[rank]
          const canBuy = !maxed && metaState.currency >= cost
          return (
            <div key={u.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', background: '#222', borderRadius: 4,
            }}>
              <div>
                <div style={{ fontWeight: 'bold' }}>{u.name} ({rank}/{u.maxRank})</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{u.description}</div>
              </div>
              <button
                disabled={!canBuy}
                onClick={() => onPurchase(u.id)}
                style={{
                  padding: '4px 12px', cursor: canBuy ? 'pointer' : 'default',
                  opacity: canBuy ? 1 : 0.4,
                }}
              >
                {maxed ? 'MAX' : cost}
              </button>
            </div>
          )
        })}
      </div>
      <button
        onClick={onPlay}
        style={{ padding: '12px 32px', fontSize: 18, cursor: 'pointer' }}
      >
        Play Again
      </button>
    </div>
  )
}
