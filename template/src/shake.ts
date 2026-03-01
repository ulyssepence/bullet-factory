const DECAY_RATE = 5

interface ShakeConfig {
  amplitude: number
  durationMs: number
  direction?: [number, number]
}

const TIERS: Record<string, ShakeConfig> = {
  light:  { amplitude: 0.1, durationMs: 150 },
  medium: { amplitude: 0.3, durationMs: 300 },
  heavy:  { amplitude: 0.6, durationMs: 500 },
}

let trauma = 0
let elapsed = 0
let dirBias: [number, number] = [0, 0]
let offsetX = 0
let offsetY = 0

export function shake(config: ShakeConfig | string) {
  const c = typeof config === 'string' ? TIERS[config] ?? TIERS.medium : config
  const t = c.amplitude
  trauma = Math.min(trauma + t, 1)
  elapsed = 0
  if (c.direction) {
    const len = Math.sqrt(c.direction[0] ** 2 + c.direction[1] ** 2) || 1
    dirBias = [c.direction[0] / len, c.direction[1] / len]
  } else {
    dirBias = [0, 0]
  }
}

export function tick(vizDt: number, reduceShake: boolean) {
  if (trauma <= 0) {
    offsetX = 0
    offsetY = 0
    return
  }

  elapsed += vizDt
  trauma = Math.max(0, trauma * Math.exp(-DECAY_RATE * vizDt))

  const mag = trauma * trauma
  const scale = reduceShake ? 0.2 : 1
  const t = elapsed * 37

  const noiseX = Math.sin(t * 1.0) + Math.sin(t * 2.3) * 0.5 + Math.sin(t * 4.7) * 0.25
  const noiseY = Math.cos(t * 1.3) + Math.cos(t * 2.7) * 0.5 + Math.cos(t * 5.1) * 0.25

  const nx = noiseX / 1.75
  const ny = noiseY / 1.75

  if (dirBias[0] !== 0 || dirBias[1] !== 0) {
    offsetX = (0.3 * nx + 0.7 * dirBias[0]) * mag * scale
    offsetY = (0.3 * ny + 0.7 * dirBias[1]) * mag * scale
  } else {
    offsetX = nx * mag * scale
    offsetY = ny * mag * scale
  }
}

export function getOffset(): [number, number] {
  return [offsetX, offsetY]
}

export function reset() {
  trauma = 0
  elapsed = 0
  dirBias = [0, 0]
  offsetX = 0
  offsetY = 0
}
