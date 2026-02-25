type Vec3 = [number, number, number]

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

function contrastRatio(a: Vec3, b: Vec3): number {
  const la = luminance(a) + 0.05
  const lb = luminance(b) + 0.05
  return la > lb ? la / lb : lb / la
}

function toHex([r, g, b]: Vec3): string {
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

export function generateValid(startSeed = 0, enemyCount = 3, maxAttempts = 500): Palette | null {
  for (let i = 0; i < maxAttempts; i++) {
    const p = generate(startSeed + i * 0.618, enemyCount)
    const colors = [p.ground, p.wall, p.player, p.accent, ...p.enemies].map(hexToVec3)

    const groundLum = luminance(colors[0])
    if (groundLum > 0.25 || groundLum < 0.03) continue

    const playerVsGround = contrastRatio(colors[2], colors[0])
    if (playerVsGround < 3.5) continue

    const accentVsGround = contrastRatio(colors[3], colors[0])
    if (accentVsGround < 3) continue

    const enemiesOk = colors.slice(4).every(e => contrastRatio(e, colors[0]) > 3)
    if (!enemiesOk) continue

    const wallVsGround = contrastRatio(colors[1], colors[0])
    if (wallVsGround < 1.5) continue

    const allFg = [colors[2], colors[3], ...colors.slice(4)]
    const fgSpread = allFg.every((a, i) =>
      allFg.every((b, j) => i >= j || colorDistance(a, b) > 0.2)
    )
    if (!fgSpread) continue

    return { ...p, seed: startSeed + i * 0.618 }
  }
  return null
}

function colorDistance(a: Vec3, b: Vec3): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

function hexToVec3(hex: string): Vec3 {
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
