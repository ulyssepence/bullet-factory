export class Player {
  private ctx: AudioContext | null = null
  private buffers: Record<string, AudioBuffer> = {}
  private lastPlayed: Record<string, number> = {}
  private current: { name: string; source: AudioBufferSourceNode; gain: GainNode } | null = null

  get currentTrack(): string | null { return this.current?.name ?? null }
  get contextState(): AudioContextState | null { return this.ctx?.state ?? null }

  musicVolume = 1
  sfxVolume = 1

  private getContext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  async preload(manifest: Record<string, string>) {
    const ac = this.getContext()
    await Promise.all(
      Object.entries(manifest).map(async ([name, url]) => {
        const res = await fetch(url)
        this.buffers[name] = await ac.decodeAudioData(await res.arrayBuffer())
      }),
    )
  }

  play(name: string, volume = 1) {
    const ac = this.getContext()

    const baseName = name.replace(/_\d+$/, '')
    const variants = Object.keys(this.buffers).filter(k => k === baseName || k.match(new RegExp(`^${baseName}_\\d+$`)))
    const picked = variants.length > 0 ? variants[Math.floor(Math.random() * variants.length)] : name

    const buf = this.buffers[picked]
    if (!buf) return
    const now = ac.currentTime
    if (now - (this.lastPlayed[baseName] ?? 0) < 0.05) return
    this.lastPlayed[baseName] = now
    const src = ac.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = 0.9 + Math.random() * 0.2
    const gain = ac.createGain()
    const dbVariation = (Math.random() * 4 - 2)
    gain.gain.value = volume * this.sfxVolume * Math.pow(10, dbVariation / 20)
    src.connect(gain).connect(ac.destination)
    src.start()
  }

  playMusic(name: string, opts: { fade?: number; loop?: boolean } = {}) {
    const { fade = 3, loop = true } = opts
    if (this.current?.name === name) return
    const ac = this.getContext()
    const buf = this.buffers[name]
    if (!buf) return
    const now = ac.currentTime

    if (this.current) {
      const old = this.current
      old.gain.gain.cancelScheduledValues(now)
      old.gain.gain.setValueAtTime(old.gain.gain.value, now)
      old.gain.gain.linearRampToValueAtTime(0, now + fade)
      old.source.stop(now + fade)
      old.source.onended = () => old.source.disconnect()
    }

    const source = ac.createBufferSource()
    source.buffer = buf
    source.loop = loop
    const gain = ac.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(this.musicVolume, now + fade)
    source.connect(gain).connect(ac.destination)
    source.start()

    if (loop) {
      this.current = { name, source, gain }
    } else {
      this.current = null
      source.onended = () => source.disconnect()
    }
  }

  stopMusic(fade = 2) {
    if (!this.current) return
    const ac = this.getContext()
    const now = ac.currentTime
    const old = this.current
    old.gain.gain.cancelScheduledValues(now)
    old.gain.gain.setValueAtTime(old.gain.gain.value, now)
    old.gain.gain.linearRampToValueAtTime(0, now + fade)
    old.source.stop(now + fade)
    old.source.onended = () => old.source.disconnect()
    this.current = null
  }
}

export const player = new Player()
;(window as any).__audioPlayer = player

export const defaultManifest: Record<string, string> = {
  hit: 'audio/hit.wav',
  death: 'audio/death.wav',
  hurt: 'audio/hurt.wav',
  pickup: 'audio/pickup.wav',
  levelup: 'audio/levelup.wav',
  shoot: 'audio/shoot.wav',
  ambient: 'audio/ambient.wav',
}
