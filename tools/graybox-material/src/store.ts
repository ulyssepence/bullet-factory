import { createStore } from 'zustand/vanilla'
import * as t from './types'

export const gameStore = createStore<t.GameState>(() => ({
  player: {
    id: 'player',
    position: [0, 0.5, 0],
    health: 100,
    speed: 5,
  },
  paused: false,
  run: { elapsed: 0 },
}))

export function tick(dt: number) {
  const state = gameStore.getState()
  if (state.paused) return
  state.run.elapsed += dt
}
