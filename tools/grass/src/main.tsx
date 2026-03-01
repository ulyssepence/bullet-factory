import React, { useRef, useMemo, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useControls, folder, button } from 'leva'
import * as THREE from 'three'
import * as grass from '../../../template/src/level/grass'
import { variants, type ShaderVariant } from './shaders'

function hash(x: number, y: number): number {
  let n = x * 374761393 + y * 668265263
  n = (n ^ (n >> 13)) * 1274126177
  n = n ^ (n >> 16)
  return (n & 0x7fffffff) / 0x7fffffff
}

function valueNoise(x: number, z: number, scale: number): number {
  const sx = x * scale
  const sz = z * scale
  const ix = Math.floor(sx)
  const iz = Math.floor(sz)
  const fx = sx - ix
  const fz = sz - iz
  const tx = fx * fx * (3 - 2 * fx)
  const tz = fz * fz * (3 - 2 * fz)
  const v00 = hash(ix, iz)
  const v10 = hash(ix + 1, iz)
  const v01 = hash(ix, iz + 1)
  const v11 = hash(ix + 1, iz + 1)
  return v00 * (1 - tx) * (1 - tz) + v10 * tx * (1 - tz) + v01 * (1 - tx) * tz + v11 * tx * tz
}

function buildInstancedGeometry(instanceCount: number, areaSize: number, noiseScale: number, densityFalloff: number) {
  const baseGeo = grass.createStarGeometry()

  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute('position', baseGeo.getAttribute('position'))
  geo.setAttribute('uv', baseGeo.getAttribute('uv'))
  geo.index = baseGeo.index

  const offsets = new Float32Array(instanceCount * 3)
  const rotations = new Float32Array(instanceCount)
  const scales = new Float32Array(instanceCount)
  const colorVars = new Float32Array(instanceCount)
  const half = areaSize / 2

  let placed = 0
  let attempts = 0
  while (placed < instanceCount && attempts < instanceCount * 20) {
    attempts++
    const x = (Math.random() - 0.5) * areaSize
    const z = (Math.random() - 0.5) * areaSize
    const dist = Math.sqrt(x * x + z * z) / half
    const centerWeight = 1 - dist * densityFalloff
    if (centerWeight < 0 || Math.random() > centerWeight) continue
    const nv = valueNoise(x, z, noiseScale)
    if (Math.random() > nv * 0.8 + 0.2) continue
    offsets[placed * 3] = x
    offsets[placed * 3 + 1] = 0
    offsets[placed * 3 + 2] = z
    rotations[placed] = Math.random() * Math.PI * 2
    scales[placed] = 0.6 + Math.random() * 0.8
    colorVars[placed] = Math.random()
    placed++
  }

  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets.subarray(0, placed * 3), 3))
  geo.setAttribute('aRotation', new THREE.InstancedBufferAttribute(rotations.subarray(0, placed), 1))
  geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales.subarray(0, placed), 1))
  geo.setAttribute('aColorVar', new THREE.InstancedBufferAttribute(colorVars.subarray(0, placed), 1))
  geo.instanceCount = placed

  return geo
}

const variantKeys = Object.keys(variants)
const variantOptions = Object.fromEntries(variantKeys.map(k => [variants[k].label, k]))

function GrassField() {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const groundRef = useRef<THREE.MeshStandardMaterial>(null)

  const [activeVariant, setActiveVariant] = useState('grass')
  const variant = variants[activeVariant]

  const { variantSelect, ...shared } = useControls({
    variantSelect: { value: 'grass', options: variantOptions, label: 'Shader' },
    density: { value: 20000, min: 1000, max: 100000, step: 1000 },
    areaSize: { value: 50, min: 10, max: 200, step: 5 },
    baseColor: variant.sharedDefaults?.baseColor ?? '#3a7d3a',
    tipColor: variant.sharedDefaults?.tipColor ?? '#7ec850',
    colorVariation: { value: 0.3, min: 0, max: 1, step: 0.01 },
    bladeHeight: { value: variant.sharedDefaults?.bladeHeight ?? 0.55, min: 0.1, max: 2.0, step: 0.05 },
    bladeHeightVar: { value: variant.sharedDefaults?.bladeHeightVar ?? 0.25, min: 0, max: 1, step: 0.05 },
    bladeWidth: { value: variant.sharedDefaults?.bladeWidth ?? 0.08, min: 0.02, max: 0.3, step: 0.01 },
    windSpeed: { value: variant.sharedDefaults?.windSpeed ?? 1.5, min: 0, max: 5, step: 0.1 },
    windStrength: { value: variant.sharedDefaults?.windStrength ?? 0.4, min: 0, max: 1, step: 0.01 },
    windAngle: { value: 45, min: 0, max: 360, step: 1 },
    noiseScale: { value: 0.15, min: 0.01, max: 1, step: 0.01 },
    densityFalloff: { value: 0.3, min: 0, max: 1, step: 0.01 },
  })

  const variantControls = useControls(
    variant.label,
    Object.fromEntries(
      Object.entries(variant.controls).map(([k, v]) => [k, v])
    ),
    [activeVariant],
  )

  useEffect(() => {
    if (variantSelect !== activeVariant) {
      setActiveVariant(variantSelect)
    }
  }, [variantSelect])

  const geometry = useMemo(
    () => buildInstancedGeometry(shared.density, shared.areaSize, shared.noiseScale, shared.densityFalloff),
    [shared.density, shared.areaSize, shared.noiseScale, shared.densityFalloff],
  )

  const materialKey = activeVariant

  const uniforms = useMemo(() => {
    const base: Record<string, { value: any }> = {
      uTime: { value: 0 },
      uBaseColor: { value: new THREE.Color(shared.baseColor) },
      uTipColor: { value: new THREE.Color(shared.tipColor) },
      uColorVariation: { value: shared.colorVariation },
      uBladeHeight: { value: shared.bladeHeight },
      uBladeHeightVar: { value: shared.bladeHeightVar },
      uBladeWidth: { value: shared.bladeWidth },
      uWindSpeed: { value: shared.windSpeed },
      uWindStrength: { value: shared.windStrength },
      uWindDirection: { value: new THREE.Vector2(Math.cos(shared.windAngle * Math.PI / 180), Math.sin(shared.windAngle * Math.PI / 180)) },
    }
    for (const [k, v] of Object.entries(variant.controls)) {
      const uniformName = 'u' + k.charAt(0).toUpperCase() + k.slice(1)
      base[uniformName] = { value: v.value }
    }
    if (variant.uniforms) {
      for (const [k, v] of Object.entries(variant.uniforms)) {
        base[k] = { value: v.value }
      }
    }
    return base
  }, [materialKey])

  useEffect(() => {
    const mat = matRef.current
    if (!mat) return
    mat.uniforms.uBaseColor.value.set(shared.baseColor)
    mat.uniforms.uTipColor.value.set(shared.tipColor)
    mat.uniforms.uColorVariation.value = shared.colorVariation
    mat.uniforms.uBladeHeight.value = shared.bladeHeight
    mat.uniforms.uBladeHeightVar.value = shared.bladeHeightVar
    mat.uniforms.uBladeWidth.value = shared.bladeWidth
    mat.uniforms.uWindSpeed.value = shared.windSpeed
    mat.uniforms.uWindStrength.value = shared.windStrength
    const rad = (shared.windAngle * Math.PI) / 180
    mat.uniforms.uWindDirection.value.set(Math.cos(rad), Math.sin(rad))
  }, [shared.baseColor, shared.tipColor, shared.colorVariation, shared.bladeHeight, shared.bladeHeightVar, shared.bladeWidth, shared.windSpeed, shared.windStrength, shared.windAngle])

  useEffect(() => {
    const mat = matRef.current
    if (!mat) return
    for (const [k, v] of Object.entries(variantControls)) {
      const uniformName = 'u' + k.charAt(0).toUpperCase() + k.slice(1)
      if (mat.uniforms[uniformName]) {
        mat.uniforms[uniformName].value = v
      }
    }
  }, [variantControls])

  useEffect(() => {
    if (groundRef.current && variant.groundColor) {
      groundRef.current.color.set(variant.groundColor)
    }
  }, [activeVariant])

  useFrame((_, delta) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value += delta
    }
  })

  const groundSize = shared.areaSize * 1.5
  const mc = variant.materialConfig

  return (
    <>
      <mesh ref={meshRef} frustumCulled={false}>
        <primitive object={geometry} attach="geometry" />
        <shaderMaterial
          key={materialKey}
          ref={matRef}
          vertexShader={variant.vertex}
          fragmentShader={variant.fragment}
          uniforms={uniforms}
          side={THREE.DoubleSide}
          transparent={mc?.transparent ?? true}
          depthWrite={mc?.depthWrite ?? true}
          blending={mc?.blending ?? THREE.NormalBlending}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial ref={groundRef} color={variant.groundColor ?? '#2d5a1e'} />
      </mesh>
    </>
  )
}

function App() {
  return (
    <Canvas
      camera={{ position: [15, 10, 15], fov: 55, near: 0.1, far: 500 }}
      gl={{ antialias: true }}
      style={{ background: '#87CEEB' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} />
      <GrassField />
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.05} />
    </Canvas>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
