import { createStore } from 'zustand/vanilla'
import * as t from './types'
import * as profile from './profile'

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
  if (__PROFILE__) profile.start('tick')
  const state = gameStore.getState()
  if (state.paused) {
    if (__PROFILE__) profile.stop('tick')
    return
  }
  state.run.elapsed += dt
  if (__PROFILE__) profile.stop('tick')
  if (__PROFILE__) profile.frame()
}
