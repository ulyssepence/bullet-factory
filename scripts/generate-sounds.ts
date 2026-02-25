import * as fs from 'fs'
import * as path from 'path'

const outDir = path.resolve('template/static/audio')
fs.mkdirSync(outDir, { recursive: true })

const SAMPLE_RATE = 22050

function writeWav(filename: string, samples: Float32Array) {
  const numSamples = samples.length
  const buffer = Buffer.alloc(44 + numSamples * 2)

  // WAV header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + numSamples * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // chunk size
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
  buffer.writeUInt16LE(2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write('data', 36)
  buffer.writeUInt32LE(numSamples * 2, 40)

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }

  fs.writeFileSync(path.join(outDir, filename), buffer)
  console.log(`  ${filename} (${buffer.length} bytes)`)
}

function envelope(t: number, attack: number, decay: number, duration: number): number {
  if (t < attack) return t / attack
  if (t > duration - decay) return (duration - t) / decay
  return 1
}

// hit.wav — short white noise burst, 100ms
function genHit() {
  const dur = 0.1
  const n = Math.floor(SAMPLE_RATE * dur)
  const s = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    s[i] = (Math.random() * 2 - 1) * 0.6 * envelope(t, 0.005, 0.05, dur)
  }
  writeWav('hit.wav', s)
}

// death.wav — descending tone, 200ms
function genDeath() {
  const dur = 0.2
  const n = Math.floor(SAMPLE_RATE * dur)
  const s = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const freq = 400 - 300 * (t / dur)
    s[i] = Math.sin(2 * Math.PI * freq * t) * 0.5 * envelope(t, 0.005, 0.1, dur)
  }
  writeWav('death.wav', s)
}

// hurt.wav — low thud, 150ms
function genHurt() {
  const dur = 0.15
  const n = Math.floor(SAMPLE_RATE * dur)
  const s = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const freq = 80 - 40 * (t / dur)
    s[i] = Math.sin(2 * Math.PI * freq * t) * 0.7 * envelope(t, 0.005, 0.1, dur)
  }
  writeWav('hurt.wav', s)
}

// pickup.wav — ascending ding, 100ms
function genPickup() {
  const dur = 0.1
  const n = Math.floor(SAMPLE_RATE * dur)
  const s = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const freq = 600 + 800 * (t / dur)
    s[i] = Math.sin(2 * Math.PI * freq * t) * 0.4 * envelope(t, 0.005, 0.05, dur)
  }
  writeWav('pickup.wav', s)
}

// levelup.wav — two-tone ascending chime, 300ms
function genLevelup() {
  const dur = 0.3
  const n = Math.floor(SAMPLE_RATE * dur)
  const s = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const freq = t < 0.15 ? 523 : 784 // C5 then G5
    s[i] = Math.sin(2 * Math.PI * freq * t) * 0.4 * envelope(t, 0.01, 0.1, dur)
  }
  writeWav('levelup.wav', s)
}

// shoot.wav — short click/pop, 80ms
function genShoot() {
  const dur = 0.08
  const n = Math.floor(SAMPLE_RATE * dur)
  const s = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const freq = 1200 - 1000 * (t / dur)
    s[i] = Math.sin(2 * Math.PI * freq * t) * 0.3 * envelope(t, 0.002, 0.04, dur)
  }
  writeWav('shoot.wav', s)
}

// ambient.wav — low drone loop, ~2s
function genAmbient() {
  const dur = 2
  const n = Math.floor(SAMPLE_RATE * dur)
  const s = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const base = Math.sin(2 * Math.PI * 55 * t) * 0.15
    const harmonic = Math.sin(2 * Math.PI * 82.5 * t) * 0.08
    const lfo = 1 + 0.3 * Math.sin(2 * Math.PI * 0.2 * t)
    s[i] = (base + harmonic) * lfo
  }
  writeWav('ambient.wav', s)
}

console.log('Generating placeholder sounds...')
genHit()
genDeath()
genHurt()
genPickup()
genLevelup()
genShoot()
genAmbient()
console.log('Done.')
