export type EntityId = string
export type GamePhase = 'menu' | 'playing' | 'dead' | 'victory' | 'meta'

export interface PlayerState {
  id: EntityId
  position: [number, number, number]
  facing: number
  health: number
  speed: number
}

export interface AccessibilitySettings {
  reduceShake: boolean
  disableFlash: boolean
  reduceHitstop: boolean
}

export interface RunTelemetry {
  sessionStartMs: number
  firstLevelupMs: number | null
  deathCount: number
  waveReached: number
  enemyTypesEncountered: Record<string, true>
}

export interface GameState {
  phase: GamePhase
  player: PlayerState
  paused: boolean
  run: {
    elapsed: number
  }
  accessibility: AccessibilitySettings
  telemetry: RunTelemetry | null
}
