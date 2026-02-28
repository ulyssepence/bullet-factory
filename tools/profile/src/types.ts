export type EntityId = string

export interface PlayerState {
  id: EntityId
  position: [number, number, number]
  health: number
  speed: number
}

export interface GameState {
  player: PlayerState
  paused: boolean
  run: {
    elapsed: number
  }
}
