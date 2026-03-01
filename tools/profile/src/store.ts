import { createStore } from 'zustand/vanilla'
import * as t from './types'
import * as profile from '../../../template/src/profile'

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

let totalFrames = 0
let cpuSpikeFrames = 0

export function triggerCpuSpike() { cpuSpikeFrames = 10 }

function burn(ms: number) {
  const t0 = performance.now()
  while (performance.now() - t0 < ms) { /* spin */ }
}

export function tick(dt: number) {
  totalFrames++
  if (__PROFILE__) profile.start('tick')
  const state = gameStore.getState()
  if (state.paused) {
    if (__PROFILE__) profile.stop('tick')
    return
  }
  state.run.elapsed += dt

  if (__PROFILE__) profile.start('tick.enemies')
  if (__PROFILE__) profile.start('tick.enemies.tick')
  const spiking = cpuSpikeFrames > 0
  if (spiking) cpuSpikeFrames--
  burn(spiking ? 35 : 6)
  if (__PROFILE__) profile.stop('tick.enemies.tick')
  if (__PROFILE__) profile.start('tick.enemies.separation')
  burn(2)
  if (__PROFILE__) profile.stop('tick.enemies.separation')
  if (__PROFILE__) profile.start('tick.enemies.contactDamage')
  burn(1.5)
  if (__PROFILE__) profile.stop('tick.enemies.contactDamage')
  if (__PROFILE__) profile.stop('tick.enemies')

  if (__PROFILE__) profile.start('tick.weapons')
  burn(2.5)
  if (__PROFILE__) profile.stop('tick.weapons')

  if (__PROFILE__) profile.start('tick.projectiles')
  burn(1.8)
  if (__PROFILE__) profile.stop('tick.projectiles')

  if (__PROFILE__) profile.start('tick.progression')
  burn(1.5)
  if (__PROFILE__) profile.stop('tick.progression')

  if (__PROFILE__) profile.stop('tick')
  if (__PROFILE__) profile.frame()
}
