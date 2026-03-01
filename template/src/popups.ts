import React, { useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import * as clock from './clock'

// --- Curves ---

type CurveName = 'rise-fade' | 'pop-shrink' | 'slam'

interface CurveParams {
  lifetime: number
  riseSpeed: number
  scale: (t: number) => number
  opacity: (t: number) => number
}

export const CURVES: Record<CurveName, CurveParams> = {
  'rise-fade': {
    lifetime: 1.0,
    riseSpeed: 2,
    scale: () => 1,
    opacity: t => 1 - t * t,
  },
  'pop-shrink': {
    lifetime: 0.6,
    riseSpeed: 1.5,
    scale: t => {
      if (t < 0.15) return (t / 0.15) * 1.3
      return 1.3 * (1 - ((t - 0.15) / 0.85) ** 0.5)
    },
    opacity: t => t < 0.6 ? 1 : 1 - ((t - 0.6) / 0.4) ** 2,
  },
  'slam': {
    lifetime: 1.2,
    riseSpeed: 0.3,
    scale: t => {
      if (t < 0.1) return (t / 0.1) * 2.0
      if (t < 0.5) return 2.0
      return 2.0 * (1 - ((t - 0.5) / 0.5) ** 2)
    },
    opacity: t => t < 0.65 ? 1 : 1 - ((t - 0.65) / 0.35) ** 2,
  },
}

// --- Icon cache ---

const iconCache: Map<string, HTMLImageElement> = new Map()

export function preloadIcon(name: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (iconCache.has(name)) { resolve(); return }
    const img = new Image()
    img.onload = () => { iconCache.set(name, img); resolve() }
    img.onerror = reject
    img.src = src
  })
}

// --- Pool ---

const CANVAS_W = 512
const CANVAS_H = 128
const POOL_SIZE = 32

interface PopupSlot {
  sprite: THREE.Sprite
  material: THREE.SpriteMaterial
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
  active: boolean
  curve: CurveName
  vizElapsed: number
  originY: number
  aspect: number
  baseH: number
}

let slots: PopupSlot[] = []
let scene: THREE.Scene | null = null

function createSlot(): PopupSlot {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')!

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })

  const sprite = new THREE.Sprite(material)
  sprite.visible = false
  sprite.scale.set(2, 0.5, 1)
  sprite.renderOrder = 999

  return {
    sprite, material, canvas, ctx, texture,
    active: false, curve: 'rise-fade', vizElapsed: 0, originY: 0, aspect: 1, baseH: 0.5,
  }
}

function renderText(slot: PopupSlot, text: string, color: string, fontSize = 48) {
  const { ctx, canvas } = slot
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = `bold ${fontSize}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  slot.aspect = CANVAS_W / CANVAS_H
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 5
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2)
  ctx.fillStyle = color
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  slot.texture.needsUpdate = true
}

function renderIcon(slot: PopupSlot, icon: string, tint?: string) {
  const img = iconCache.get(icon)
  if (!img) return
  const { ctx, canvas } = slot
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const size = CANVAS_H - 16
  const x = (canvas.width - size) / 2
  const y = 8
  ctx.drawImage(img, x, y, size, size)
  if (tint) {
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'source-over'
  }
  slot.aspect = CANVAS_W / CANVAS_H
  slot.texture.needsUpdate = true
}

// --- Public API ---

interface EmitOpts {
  at: [number, number, number]
  text?: string
  icon?: string
  color?: string
  fontSize?: number
  size?: number
}

export function emit(curve: CurveName, opts: EmitOpts) {
  if (!opts.text && !opts.icon) return
  const free = slots.find(s => !s.active)
  if (!free) return

  if (opts.icon) {
    renderIcon(free, opts.icon, opts.color)
  } else {
    renderText(free, opts.text!, opts.color ?? '#ffffff', opts.fontSize)
  }

  free.sprite.position.set(opts.at[0], opts.at[1], opts.at[2])
  free.originY = opts.at[1]
  free.active = true
  free.curve = curve
  free.vizElapsed = 0
  free.sprite.visible = true
  free.material.opacity = 1
  free.baseH = (opts.icon ? 0.8 : 0.5) * (opts.size ?? 1)
  free.sprite.scale.set(free.aspect * free.baseH, free.baseH, 1)
}

// --- React component ---

export function PopupPool() {
  const { scene: s } = useThree()

  useMemo(() => {
    scene = s
    slots = []
    for (let i = 0; i < POOL_SIZE; i++) {
      const slot = createSlot()
      s.add(slot.sprite)
      slots.push(slot)
    }
  }, [s])

  useFrame(() => {
    const { vizDt } = clock.getState()
    for (const slot of slots) {
      if (!slot.active) continue
      slot.vizElapsed += vizDt
      const curve = CURVES[slot.curve]
      const t = Math.min(slot.vizElapsed / curve.lifetime, 1)

      if (t >= 1) {
        slot.active = false
        slot.sprite.visible = false
        continue
      }

      const sc = curve.scale(t)
      slot.sprite.scale.set(slot.aspect * slot.baseH * sc, slot.baseH * sc, 1)
      slot.material.opacity = curve.opacity(t)
      slot.sprite.position.y = slot.originY + slot.vizElapsed * curve.riseSpeed
    }
  })

  useEffect(() => {
    return () => {
      for (const slot of slots) {
        if (scene) scene.remove(slot.sprite)
        slot.material.dispose()
        slot.texture.dispose()
      }
      slots = []
      scene = null
    }
  }, [])

  return null
}
