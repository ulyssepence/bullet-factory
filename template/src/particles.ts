import React, { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// --- Preset definitions ---

export interface PresetParams {
  count: number
  poolSize: number
  velocity: [number, number, number]
  velocitySpread: [number, number, number]
  gravity: number
  lifetimeMin: number
  lifetimeMax: number
  sizeMin: number
  sizeMax: number
  sizeScale: number
  opacity: number
  alphaCap: number
  loop: boolean
  spread: [number, number, number]
  followCamera?: boolean
}

export const PRESETS: Record<string, PresetParams> = {
  burst: {
    count: 80, poolSize: 256,
    velocity: [0, 3, 0], velocitySpread: [4, 2, 4],
    gravity: -6, lifetimeMin: 0.2, lifetimeMax: 0.8,
    sizeMin: 0.08, sizeMax: 0.2, sizeScale: 1,
    opacity: 1, alphaCap: 0.4, loop: false, spread: [0, 0, 0],
  },
  radial: {
    count: 60, poolSize: 16,
    velocity: [0, 1, 0], velocitySpread: [3, 0.5, 3],
    gravity: -1, lifetimeMin: 0.5, lifetimeMax: 1.0,
    sizeMin: 0.06, sizeMax: 0.15, sizeScale: 1,
    opacity: 0.9, alphaCap: 0.4, loop: false, spread: [0, 0, 0],
  },
  aura: {
    count: 40, poolSize: 16,
    velocity: [0, 0.8, 0], velocitySpread: [0.3, 0.3, 0.3],
    gravity: 0, lifetimeMin: 0.8, lifetimeMax: 1.5,
    sizeMin: 0.05, sizeMax: 0.15, sizeScale: 1,
    opacity: 0.6, alphaCap: 1.0, loop: true, spread: [0.5, 0.2, 0.5],
  },
  sparkle: {
    count: 15, poolSize: 24,
    velocity: [0, 0.3, 0], velocitySpread: [0.2, 0.2, 0.2],
    gravity: 0, lifetimeMin: 0.6, lifetimeMax: 1.2,
    sizeMin: 0.03, sizeMax: 0.08, sizeScale: 1,
    opacity: 0.9, alphaCap: 1.0, loop: true, spread: [0.6, 0.4, 0.6],
  },
  rain: {
    count: 300, poolSize: 2,
    velocity: [0, -6, 0], velocitySpread: [0.3, 0.5, 0.3],
    gravity: 0, lifetimeMin: 1.0, lifetimeMax: 2.0,
    sizeMin: 0.1, sizeMax: 0.2, sizeScale: 1,
    opacity: 0.8, alphaCap: 1.0, loop: true, spread: [12, 8, 12],
    followCamera: true,
  },
}

// --- Shaders ---

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uStartTime;
uniform vec3 uOrigin;
uniform vec3 uSpread;
uniform vec3 uVelocity;
uniform vec3 uVelocitySpread;
uniform float uGravity;
uniform float uLifetimeMin;
uniform float uLifetimeMax;
uniform float uSizeMin;
uniform float uSizeMax;
uniform float uSizeScale;
uniform float uOpacity;
uniform float uLoop;
uniform float uWrap;
uniform vec3 uCameraPos;

attribute float aSeed;
attribute vec3 aVelocityOffset;
attribute float aSizeOffset;
attribute float aLifetimeOffset;
attribute float aStartOffset;

varying float vAlpha;
varying float vSeed;

void main() {
  float lifetime = mix(uLifetimeMin, uLifetimeMax, aLifetimeOffset);
  float totalElapsed = uTime - uStartTime;

  float startDelay = aStartOffset * lifetime * uLoop;
  float particleTime = totalElapsed - startDelay;

  float age;
  if (uLoop > 0.5) {
    age = mod(particleTime, lifetime);
    if (particleTime < 0.0) age = lifetime;
  } else {
    age = clamp(particleTime, 0.0, lifetime);
  }

  float t = age / lifetime;

  vec3 vel = uVelocity + aVelocityOffset * uVelocitySpread;
  vec3 spawnOffset = aVelocityOffset * uSpread;
  vec3 pos = uOrigin + spawnOffset + vel * age + vec3(0.0, 0.5 * uGravity * age * age, 0.0);

  if (uWrap > 0.5) {
    vec3 extent = uSpread * 0.5;
    vec3 rel = pos - uCameraPos;
    pos = uCameraPos + mod(rel + extent, 2.0 * extent) - extent;
  }

  float size = mix(uSizeMin, uSizeMax, aSizeOffset) * uSizeScale;
  size *= 1.0 - t * t;

  float alpha = uOpacity;
  alpha *= smoothstep(0.0, 0.1, t) * (1.0 - t * t);

  if (uLoop < 0.5 && particleTime > lifetime) {
    alpha = 0.0;
    size = 0.0;
  }
  if (totalElapsed < 0.0) {
    alpha = 0.0;
    size = 0.0;
  }

  vAlpha = alpha;
  vSeed = aSeed;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = size * uSizeScale * (300.0 / -mvPos.z);
  gl_Position = projectionMatrix * mvPos;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uLoop;
uniform float uOpacity;
uniform float uAlphaCap;

varying float vAlpha;
varying float vSeed;

void main() {
  if (vAlpha < 0.001) discard;

  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);

  float circle = 1.0 - smoothstep(0.3, 0.5, dist);

  float sparkle = 1.0;
  if (uOpacity < 0.95 && uLoop > 0.5) {
    float phase = vSeed * 6.283 + vSeed * 20.0;
    sparkle = 0.5 + 0.5 * sin(phase);
  }

  float alpha = min(vAlpha * circle * sparkle, uAlphaCap);
  if (alpha < 0.001) discard;

  gl_FragColor = vec4(uColor, alpha);
}
`

// --- Pool management ---

interface PoolSlot {
  points: THREE.Points
  material: THREE.ShaderMaterial
  inUse: boolean
  preset: string
  startTime: number
  maxLifetime: number
  origin: THREE.Vector3
}

interface PresetPool {
  slots: PoolSlot[]
}

let pools: Map<string, PresetPool> = new Map()
let clock: THREE.Clock | null = null
let scene: THREE.Scene | null = null
let cameraRef: THREE.Camera | null = null

function getTime(): number {
  return clock ? clock.getElapsedTime() : 0
}

function createSlot(presetName: string): PoolSlot {
  const preset = PRESETS[presetName]
  const count = preset.count

  const geometry = new THREE.BufferGeometry()
  const seeds = new Float32Array(count)
  const velOffsets = new Float32Array(count * 3)
  const sizeOffsets = new Float32Array(count)
  const lifetimeOffsets = new Float32Array(count)
  const startOffsets = new Float32Array(count)
  const positions = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    seeds[i] = Math.random()
    velOffsets[i * 3] = Math.random() - 0.5
    velOffsets[i * 3 + 1] = Math.random() - 0.5
    velOffsets[i * 3 + 2] = Math.random() - 0.5
    sizeOffsets[i] = Math.random()
    lifetimeOffsets[i] = Math.random()
    startOffsets[i] = Math.random()
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geometry.setAttribute('aVelocityOffset', new THREE.BufferAttribute(velOffsets, 3))
  geometry.setAttribute('aSizeOffset', new THREE.BufferAttribute(sizeOffsets, 1))
  geometry.setAttribute('aLifetimeOffset', new THREE.BufferAttribute(lifetimeOffsets, 1))
  geometry.setAttribute('aStartOffset', new THREE.BufferAttribute(startOffsets, 1))

  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000)

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uStartTime: { value: 0 },
      uOrigin: { value: new THREE.Vector3() },
      uSpread: { value: new THREE.Vector3() },
      uVelocity: { value: new THREE.Vector3() },
      uVelocitySpread: { value: new THREE.Vector3() },
      uGravity: { value: 0 },
      uLifetimeMin: { value: 0 },
      uLifetimeMax: { value: 0 },
      uSizeMin: { value: 0 },
      uSizeMax: { value: 0 },
      uSizeScale: { value: 1 },
      uColor: { value: new THREE.Color() },
      uOpacity: { value: 1 },
      uAlphaCap: { value: 1 },
      uLoop: { value: 0 },
      uWrap: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.visible = false

  return {
    points,
    material,
    inUse: false,
    preset: presetName,
    startTime: 0,
    maxLifetime: preset.lifetimeMax,
    origin: new THREE.Vector3(),
  }
}

function applyPreset(slot: PoolSlot, presetName: string, origin: [number, number, number], color: string) {
  const p = PRESETS[presetName]
  const u = slot.material.uniforms
  const now = getTime()

  u.uStartTime.value = now
  u.uOrigin.value.set(...origin)
  u.uSpread.value.set(...p.spread)
  u.uVelocity.value.set(...p.velocity)
  u.uVelocitySpread.value.set(...p.velocitySpread)
  u.uGravity.value = p.gravity
  u.uLifetimeMin.value = p.lifetimeMin
  u.uLifetimeMax.value = p.lifetimeMax
  u.uSizeMin.value = p.sizeMin
  u.uSizeMax.value = p.sizeMax
  u.uSizeScale.value = p.sizeScale
  u.uColor.value.set(color)
  u.uOpacity.value = p.opacity
  u.uAlphaCap.value = p.alphaCap
  u.uLoop.value = p.loop ? 1 : 0
  u.uWrap.value = (p.followCamera && p.spread.every(s => s > 0)) ? 1 : 0

  slot.inUse = true
  slot.preset = presetName
  slot.startTime = now
  slot.maxLifetime = p.lifetimeMax
  slot.origin.set(...origin)
  slot.points.visible = true
}

function acquireSlot(presetName: string): PoolSlot | null {
  const pool = pools.get(presetName)
  if (!pool) return null
  for (const slot of pool.slots) {
    if (!slot.inUse) return slot
  }
  return null
}

function releaseSlot(slot: PoolSlot) {
  slot.inUse = false
  slot.points.visible = false
}

// --- Public API ---

export function emit(preset: string, opts: { at: [number, number, number]; color?: string }) {
  const slot = acquireSlot(preset)
  if (!slot) return
  applyPreset(slot, preset, opts.at, opts.color ?? '#ffffff')
}

interface PersistentHandle {
  update(origin: [number, number, number]): void
  release(): void
}

function checkout(preset: string, origin: [number, number, number], color: string): PersistentHandle | null {
  const slot = acquireSlot(preset)
  if (!slot) return null
  applyPreset(slot, preset, origin, color)
  return {
    update(newOrigin: [number, number, number]) {
      slot.material.uniforms.uOrigin.value.set(...newOrigin)
    },
    release() {
      releaseSlot(slot)
    },
  }
}

// --- React components ---

export function ParticlePool() {
  const { scene: s, clock: c, camera } = useThree()

  useMemo(() => {
    scene = s
    clock = c
    cameraRef = camera
    pools.clear()
    for (const [name, preset] of Object.entries(PRESETS)) {
      const pool: PresetPool = { slots: [] }
      for (let i = 0; i < preset.poolSize; i++) {
        const slot = createSlot(name)
        s.add(slot.points)
        pool.slots.push(slot)
      }
      pools.set(name, pool)
    }
  }, [s, c, camera])

  useFrame(() => {
    const now = getTime()
    cameraRef = camera
    for (const [presetName, pool] of pools) {
      const preset = PRESETS[presetName]
      for (const slot of pool.slots) {
        slot.material.uniforms.uTime.value = now
        if (slot.inUse && preset.followCamera && cameraRef) {
          const cp = cameraRef.position
          slot.material.uniforms.uCameraPos.value.set(cp.x, cp.y, cp.z)
        }
        if (slot.inUse && !preset.loop) {
          if (now - slot.startTime > slot.maxLifetime + 0.1) {
            releaseSlot(slot)
          }
        }
      }
    }
  })

  useEffect(() => {
    return () => {
      for (const [, pool] of pools) {
        for (const slot of pool.slots) {
          if (scene) scene.remove(slot.points)
          slot.points.geometry.dispose()
          slot.material.dispose()
        }
      }
      pools.clear()
      scene = null
      clock = null
      cameraRef = null
    }
  }, [])

  return null
}

export interface ParticleEffectProps {
  preset: string
  position: [number, number, number]
  color?: string
}

export function ParticleEffect({ preset, position, color = '#ffffff' }: ParticleEffectProps) {
  const handleRef = useRef<PersistentHandle | null>(null)

  useEffect(() => {
    handleRef.current = checkout(preset, position, color)
    return () => {
      handleRef.current?.release()
      handleRef.current = null
    }
  }, [preset, color])

  useFrame(() => {
    handleRef.current?.update(position)
  })

  return null
}
