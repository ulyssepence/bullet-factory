import { hexToVec3, toHex, srgbToOklab, oklabToOklch } from './palette'
import type { Vec3, OKLab, OKLCh } from './palette'

export interface DerivedPalette {
  ground: string
  wall: string
  player: string
  accent: string
  enemies: Record<string, string>
  zoneFloors: string[]
  zoneWalls: string[]
  grassBase: string
  grassTip: string
  sceneBackground: string
  uiBackground: string
  uiText: string
  xpColor: string
  healthPickup: string
  magnetPickup: string
}

function oklchToOklab(lch: OKLCh): OKLab {
  const hRad = lch.h * Math.PI / 180
  return { L: lch.L, a: lch.C * Math.cos(hRad), b: lch.C * Math.sin(hRad) }
}

function oklabToSrgb(lab: OKLab): Vec3 {
  const l = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b
  const m = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b
  const s = lab.L - 0.0894841775 * lab.a - 1.2914855480 * lab.b

  const l3 = l * l * l, m3 = m * m * m, s3 = s * s * s

  const r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const b = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3

  const gamma = (v: number) => v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return [
    Math.max(0, Math.min(1, gamma(r))),
    Math.max(0, Math.min(1, gamma(g))),
    Math.max(0, Math.min(1, gamma(b))),
  ]
}

export function shiftLuminance(hex: string, deltaL: number): string {
  const lab = srgbToOklab(hexToVec3(hex))
  lab.L = Math.max(0, Math.min(1, lab.L + deltaL))
  return toHex(oklabToSrgb(lab))
}

export function shiftHueAndLuminance(hex: string, deltaH: number, deltaL: number): string {
  const lch = oklabToOklch(srgbToOklab(hexToVec3(hex)))
  lch.h = (lch.h + deltaH + 360) % 360
  lch.L = Math.max(0, Math.min(1, lch.L + deltaL))
  return toHex(oklabToSrgb(oklchToOklab(lch)))
}

type SpecPalette = { ground: string; wall: string; player: string; accent: string; enemy: Record<string, string> }
type GenPalette = { ground: string; wall: string; player: string; accent: string; enemies: string[] }

export function derive(
  palette: SpecPalette | GenPalette,
  enemyNames?: string[],
): DerivedPalette {
  let enemies: Record<string, string>
  if ('enemy' in palette && typeof palette.enemy === 'object' && !Array.isArray(palette.enemy)) {
    enemies = palette.enemy
  } else {
    const arr = (palette as GenPalette).enemies
    const names = enemyNames ?? arr.map((_, i) => `enemy_${i}`)
    enemies = {}
    for (let i = 0; i < names.length; i++) {
      enemies[names[i]] = arr[i] ?? arr[0]
    }
  }

  const zoneFloors = [
    palette.ground,
    shiftHueAndLuminance(palette.ground, 12, 0.03),
    shiftHueAndLuminance(palette.ground, -10, -0.03),
  ]

  const zoneWalls = [
    palette.wall,
    shiftHueAndLuminance(palette.wall, 15, 0.04),
    shiftHueAndLuminance(palette.wall, -12, -0.03),
  ]

  const groundLab = srgbToOklab(hexToVec3(palette.ground))
  const uiText = groundLab.L > 0.5 ? '#111111' : '#f0f0f0'

  return {
    ground: palette.ground,
    wall: palette.wall,
    player: palette.player,
    accent: palette.accent,
    enemies,
    zoneFloors,
    zoneWalls,
    grassBase: shiftLuminance(palette.ground, -0.08),
    grassTip: shiftLuminance(palette.ground, 0.12),
    sceneBackground: shiftLuminance(palette.ground, -0.25),
    uiBackground: shiftLuminance(palette.ground, -0.35),
    uiText,
    xpColor: palette.accent,
    healthPickup: '#e84040',
    magnetPickup: '#f0d020',
  }
}
