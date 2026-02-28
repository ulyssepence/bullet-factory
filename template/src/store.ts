import { createStore } from 'zustand/vanilla'
import * as t from './types'
import * as profile from './profile'

export const gameStore = createStore<t.GameState>(() => ({
  phase: 'menu',
  player: {
    id: 'player',
    position: [0, 0.5, 0],
    facing: 0,
    health: 100,
    speed: 5,
  },
  paused: false,
  run: { elapsed: 0 },
}))

export function startRun() {
  gameStore.setState(s => ({
    phase: 'playing' as const,
    player: { ...s.player, position: [0, 0.5, 0] as [number, number, number], facing: 0 },
    paused: false,
    run: { elapsed: 0 },
  }))
}

export function endRun(outcome: 'dead' | 'victory') {
  gameStore.setState({ phase: outcome })
}

export function showMeta() {
  gameStore.setState({ phase: 'meta' })
}

export function returnToMenu() {
  gameStore.setState({ phase: 'menu' })
}

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
