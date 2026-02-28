import type * as st from './systems/types'

export type EntityId = string
export type EnemyMode = 'chase' | 'wander'

export interface DebugState {
  showFlow: boolean
  showGrid: boolean
  showSeparation: boolean
  separationEnabled: boolean
  enemyMode: EnemyMode
}

export interface GameState {
  player: {
    id: EntityId
    position: [number, number, number]
    health: number
    speed: number
    invulnTimer: number
  }
  enemies: Map<string, st.EnemyState>
  level: { grid: Uint8Array }
  wave: st.WaveDirectorState
  paused: boolean
  run: { elapsed: number }
  debug: DebugState
  wanderTargets: Map<string, [number, number]>
  stats: { fps: number; enemyCount: number }
}
