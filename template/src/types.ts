export type EntityId = string
export type GamePhase = 'menu' | 'playing' | 'dead' | 'victory' | 'meta'

export interface PlayerState {
  id: EntityId
  position: [number, number, number]
  facing: number
  health: number
  speed: number
}

export interface GameState {
  phase: GamePhase
  player: PlayerState
  paused: boolean
  run: {
    elapsed: number
  }
}
