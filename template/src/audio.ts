let ctx: AudioContext | null = null
const buffers: Record<string, AudioBuffer> = {}
const lastPlayed: Record<string, number> = {}

function getContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export async function preload(manifest: Record<string, string>) {
  const ac = getContext()
  await Promise.all(
    Object.entries(manifest).map(async ([name, url]) => {
      const res = await fetch(url)
      buffers[name] = await ac.decodeAudioData(await res.arrayBuffer())
    }),
  )
}

export function play(name: string, volume = 1) {
  const ac = getContext()
  const buf = buffers[name]
  if (!buf) return

  const now = ac.currentTime
  if (now - (lastPlayed[name] ?? 0) < 0.05) return
  lastPlayed[name] = now

  const src = ac.createBufferSource()
  src.buffer = buf
  const gain = ac.createGain()
  gain.gain.value = volume
  src.connect(gain).connect(ac.destination)
  src.start()
}

export const defaultManifest: Record<string, string> = {
  hit: 'audio/hit.wav',
  death: 'audio/death.wav',
  hurt: 'audio/hurt.wav',
  pickup: 'audio/pickup.wav',
  levelup: 'audio/levelup.wav',
  shoot: 'audio/shoot.wav',
  ambient: 'audio/ambient.wav',
}
