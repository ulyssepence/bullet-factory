const MAX_DT = 0.1
const HITSTOP_VIZ_SCALE = 0.05

let simDt = 0
let vizDt = 0
let vizScale = 1
let hitstopEnd = 0

export function tick(rawDt: number) {
  const dt = Math.min(rawDt, MAX_DT)
  const now = performance.now()
  simDt = dt

  if (now < hitstopEnd) {
    vizScale = HITSTOP_VIZ_SCALE
    vizDt = dt * HITSTOP_VIZ_SCALE
  } else {
    vizScale = 1
    vizDt = dt
  }
}

export function hitstop(durationMs: number) {
  const end = performance.now() + durationMs
  hitstopEnd = Math.max(hitstopEnd, end)
}

export function getState() {
  return { simDt, vizDt, vizScale }
}

export function reset() {
  simDt = 0
  vizDt = 0
  vizScale = 1
  hitstopEnd = 0
}
