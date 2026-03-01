export type Vec3 = [number, number, number]

function hash(x: number, y: number, z: number): number {
  return ((Math.sin(x * 12.9898 + y * 78.233 + z * 45.164) * 43758.5453) % 1 + 1) % 1
}

function hashVec3(a: number, b: number, c: number): Vec3 {
  return [hash(a, b, c), hash(a + 1.7, b + 3.1, c + 5.3), hash(a + 7.9, b + 11.3, c + 13.7)]
}

function cosPalette(a: Vec3, b: Vec3, c: Vec3, d: Vec3, t: number): Vec3 {
  return [0, 1, 2].map(i =>
    Math.max(0, Math.min(1, a[i] + b[i] * Math.cos(6.28318 * (c[i] * t + d[i]))))
  ) as Vec3
}

function luminance([r, g, b]: Vec3): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export type OKLab = { L: number; a: number; b: number }
export type OKLCh = { L: number; C: number; h: number }

export function srgbToOklab([r, g, b]: Vec3): OKLab {
  const lin = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  const lr = lin(r), lg = lin(g), lb = lin(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  }
}

export function oklabDistance(a: OKLab, b: OKLab): number {
  return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2)
}

export function oklabToOklch(lab: OKLab): OKLCh {
  const C = Math.sqrt(lab.a ** 2 + lab.b ** 2)
  const h = ((Math.atan2(lab.b, lab.a) * 180 / Math.PI) + 360) % 360
  return { L: lab.L, C, h }
}

function hueDelta(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360
  return d > 180 ? 360 - d : d
}

function contrastRatio(a: Vec3, b: Vec3): number {
  const la = luminance(a) + 0.05
  const lb = luminance(b) + 0.05
  return la > lb ? la / lb : lb / la
}

export function toHex([r, g, b]: Vec3): string {
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

export interface Palette {
  seed: number
  ground: string
  wall: string
  player: string
  accent: string
  enemies: string[]
}

export function generate(seed: number, enemyCount = 3): Palette {
  const offset = seed
  const a = hashVec3(offset, offset, offset)
  const b = hashVec3(offset, 1 - offset, 1 - offset)
  const c = hashVec3(1 - offset, 1 - offset, offset)
  const d = hashVec3(1 - offset, 1 - offset, 1 - offset)

  const sample = (t: number) => cosPalette(a, b, c, d, t)

  const slots = 4 + enemyCount
  const colors = Array.from({ length: slots }, (_, i) => sample(i / slots))

  return {
    seed,
    ground: toHex(colors[0]),
    wall: toHex(colors[1]),
    player: toHex(colors[2]),
    accent: toHex(colors[3]),
    enemies: colors.slice(4).map(toHex),
  }
}

export function generateValid(startSeed = 0, enemyCount = 3, maxAttempts = 5000): Palette | null {
  for (let i = 0; i < maxAttempts; i++) {
    const p = generate(startSeed + i * 0.618, enemyCount)
    const colors = [p.ground, p.wall, p.player, p.accent, ...p.enemies].map(hexToVec3)
    const labs = colors.map(srgbToOklab)
    const lchs = labs.map(oklabToOklch)

    const groundLum = luminance(colors[0])
    if (groundLum > 0.25 || groundLum < 0.03) continue

    if (contrastRatio(colors[2], colors[0]) < 3.5) continue
    if (Math.abs(labs[2].L - labs[0].L) < 0.15) continue

    if (contrastRatio(colors[3], colors[0]) < 3) continue

    const enemiesOk = colors.slice(4).every((e, ei) =>
      contrastRatio(e, colors[0]) > 3 && Math.abs(labs[4 + ei].L - labs[0].L) >= 0.10
    )
    if (!enemiesOk) continue

    if (contrastRatio(colors[1], colors[0]) < 1.5) continue
    if (oklabDistance(labs[1], labs[0]) < 0.15) continue

    if (hueDelta(lchs[2].h, lchs[0].h) < 30) continue

    const allFgIdx = [2, 3, ...Array.from({ length: enemyCount }, (_, k) => 4 + k)]
    let fgOk = true
    for (let a = 0; a < allFgIdx.length && fgOk; a++)
      for (let b = a + 1; b < allFgIdx.length && fgOk; b++)
        if (oklabDistance(labs[allFgIdx[a]], labs[allFgIdx[b]]) < 0.06) fgOk = false
    if (!fgOk) continue

    return { ...p, seed: startSeed + i * 0.618 }
  }
  return null
}

export function hexToVec3(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

function swatch(hex: string, width = 6): string {
  const [r, g, b] = hexToVec3(hex).map(v => Math.round(v * 255))
  return `\x1b[48;2;${r};${g};${b}m${' '.repeat(width)}\x1b[0m`
}

export function preview(p: Palette): string {
  const lines = [
    `  seed: ${p.seed.toFixed(3)}`,
    `  ${swatch(p.ground)} ground  ${p.ground}`,
    `  ${swatch(p.wall)} wall    ${p.wall}`,
    `  ${swatch(p.player)} player  ${p.player}`,
    `  ${swatch(p.accent)} accent  ${p.accent}`,
    ...p.enemies.map((hex, i) =>
      `  ${swatch(hex)} enemy${i + 1}  ${hex}`
    ),
  ]
  return lines.join('\n')
}
