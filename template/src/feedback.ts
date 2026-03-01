import * as clock from './clock'
import * as shake from './shake'
import * as audio from './audio'
import * as particles from './particles'
import * as popups from './popups'
import { gameStore } from './store'

export interface FeedbackProfile {
  shake?: string | { amplitude: number; durationMs: number; direction?: [number, number] }
  hitstop?: number
  flash?: boolean
  particles?: { preset: string; color?: string }
  sound?: string
  popup?: { text?: string; curve?: 'rise-fade' | 'pop-shrink' | 'slam'; color?: string; fontSize?: number }
  maxPerSecond: number
}

const profiles: Record<string, FeedbackProfile> = {
  hit: {
    shake: 'light',
    hitstop: 40,
    particles: { preset: 'burst' },
    sound: 'hit',
    maxPerSecond: 15,
  },
  kill: {
    shake: 'medium',
    hitstop: 60,
    particles: { preset: 'burst' },
    sound: 'hit',
    popup: { curve: 'pop-shrink' },
    maxPerSecond: 10,
  },
  hurt: {
    shake: 'heavy',
    hitstop: 80,
    flash: true,
    sound: 'hurt',
    maxPerSecond: 3,
  },
  levelup: {
    shake: 'medium',
    hitstop: 100,
    particles: { preset: 'radial' },
    sound: 'levelup',
    popup: { text: 'LEVEL UP!', curve: 'slam', fontSize: 64 },
    maxPerSecond: 1,
  },
  boss: {
    shake: 'heavy',
    hitstop: 120,
    flash: true,
    particles: { preset: 'radial' },
    sound: 'hit',
    maxPerSecond: 1,
  },
}

const budgetWindows: Record<string, number[]> = {}

let flashHandler: ((color: string, durationMs: number) => void) | null = null

export function setFlashHandler(fn: (color: string, durationMs: number) => void) {
  flashHandler = fn
}

export function register(name: string, profile: FeedbackProfile) {
  profiles[name] = profile
}

interface EmitOpts {
  at: [number, number, number]
  direction?: [number, number]
  color?: string
  text?: string
  overrides?: Partial<FeedbackProfile>
}

export function emit(profileName: string, opts: EmitOpts) {
  const base = profiles[profileName]
  if (!base) return
  const p = opts.overrides ? { ...base, ...opts.overrides } : base

  const now = performance.now()
  if (!budgetWindows[profileName]) budgetWindows[profileName] = []
  const window = budgetWindows[profileName]
  while (window.length > 0 && now - window[0] > 1000) window.shift()
  if (window.length >= p.maxPerSecond) return
  window.push(now)

  const acc = gameStore.getState().accessibility

  if (p.shake) {
    const cfg = typeof p.shake === 'string'
      ? p.shake
      : { ...p.shake, direction: opts.direction ?? p.shake.direction }
    shake.shake(cfg)
  }

  if (p.hitstop) {
    const dur = acc.reduceHitstop ? p.hitstop * 0.3 : p.hitstop
    clock.hitstop(dur)
  }

  if (p.flash && !acc.disableFlash && flashHandler) {
    flashHandler(opts.color ?? '#ffffff', 80)
  }

  if (p.particles) {
    particles.emit(p.particles.preset, {
      at: opts.at,
      color: opts.color ?? p.particles.color,
    })
  }

  if (p.sound) {
    audio.player.play(p.sound)
  }

  if (p.popup) {
    const text = opts.text ?? p.popup.text
    if (text) {
      popups.emit(p.popup.curve ?? 'rise-fade', {
        at: opts.at,
        text,
        color: opts.color ?? p.popup.color ?? '#ffffff',
        fontSize: p.popup.fontSize,
      })
    }
  }
}

export function reset() {
  for (const key of Object.keys(budgetWindows)) {
    budgetWindows[key] = []
  }
}
