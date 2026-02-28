import React, { useRef, useMemo, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useControls } from 'leva'
import * as THREE from 'three'

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

function buildStarGeometry(instanceCount: number, areaSize: number, noiseScale: number, densityFalloff: number) {
  const basePositions: number[] = []
  const baseUvs: number[] = []
  const baseIndices: number[] = []

  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI) / 3
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const base = i * 4
    const hw = 0.5
    basePositions.push(
      -hw * cos, 0, -hw * sin,
       hw * cos, 0,  hw * sin,
       hw * cos, 1,  hw * sin,
      -hw * cos, 1, -hw * sin,
    )
    baseUvs.push(0, 0, 1, 0, 1, 1, 0, 1)
    baseIndices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(basePositions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(baseUvs, 2))
  geo.setIndex(baseIndices)

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

const vertexShader = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aRotation;
  attribute float aScale;
  attribute float aColorVar;

  varying vec2 vUv;
  varying float vColorVar;

  uniform float uTime;
  uniform float uWindSpeed;
  uniform float uWindStrength;
  uniform vec2 uWindDirection;
  uniform float uBladeHeight;
  uniform float uBladeHeightVar;

  void main() {
    vUv = uv;
    vColorVar = aColorVar;

    float h = uBladeHeight + uBladeHeightVar * (aColorVar * 2.0 - 1.0);
    vec3 pos = position;
    pos.y *= h * aScale;

    float c = cos(aRotation);
    float s = sin(aRotation);
    vec3 rotated = vec3(
      pos.x * c - pos.z * s,
      pos.y,
      pos.x * s + pos.z * c
    );

    vec3 worldPos = rotated + aOffset;

    vec2 windDir = normalize(uWindDirection);
    float windPhase = dot(worldPos.xz, windDir) * 0.4;
    float t = uTime * uWindSpeed;
    float wind = sin(t * 1.975 + windPhase) * 0.4
               + sin(t * 0.793 + windPhase * 1.3) * 0.3
               + sin(t * 0.375 + windPhase * 0.7) * 0.2
               + sin(t * 3.1 + windPhase * 2.1) * 0.1;

    float bendFactor = uv.y * uv.y;
    worldPos.x += wind * uWindStrength * bendFactor * windDir.x * h;
    worldPos.z += wind * uWindStrength * bendFactor * windDir.y * h;
    worldPos.y -= abs(wind) * uWindStrength * bendFactor * 0.08 * h;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying float vColorVar;

  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uColorVariation;
  uniform float uBladeWidth;

  void main() {
    float x = vUv.x;
    float y = vUv.y;

    float numBlades = 4.0;
    float bladeSpace = 1.0 / numBlades;
    float localX = mod(x, bladeSpace) / bladeSpace;

    float bladeIdx = floor(x * numBlades);
    float seed = fract(sin(bladeIdx * 127.1 + 311.7) * 43758.5453);
    float xOffset = (seed - 0.5) * 0.3;
    localX = localX - 0.5 + xOffset;

    float taper = 1.0 - y;
    float widthScale = uBladeWidth * 12.0;
    float halfWidth = taper * widthScale * 0.5;

    if (abs(localX) > halfWidth) discard;

    float heightSeed = fract(sin(bladeIdx * 93.17) * 24831.1);
    float bladeMaxH = 0.5 + heightSeed * 0.5;
    if (y > bladeMaxH) discard;

    float normalizedY = y / bladeMaxH;
    vec3 varTint = vec3(
      fract(sin(vColorVar * 127.1) * 43758.5),
      fract(sin(vColorVar * 269.5) * 18732.3),
      fract(sin(vColorVar * 419.2) * 95124.7)
    );
    varTint = (varTint - 0.5) * uColorVariation * 0.3;

    vec3 base = uBaseColor + varTint;
    vec3 tip = uTipColor + varTint;
    vec3 color = mix(base, tip, normalizedY);

    float edgeSoft = smoothstep(halfWidth, halfWidth * 0.5, abs(localX));
    float ao = smoothstep(0.0, 0.15, y);

    gl_FragColor = vec4(color * (0.5 + ao * 0.5), edgeSoft);
  }
`

function GrassField() {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const controls = useControls({
    density: { value: 20000, min: 1000, max: 100000, step: 1000 },
    areaSize: { value: 50, min: 10, max: 200, step: 5 },
    baseColor: '#3a7d3a',
    tipColor: '#7ec850',
    colorVariation: { value: 0.3, min: 0, max: 1, step: 0.01 },
    bladeHeight: { value: 0.55, min: 0.1, max: 2.0, step: 0.05 },
    bladeHeightVar: { value: 0.25, min: 0, max: 1, step: 0.05 },
    bladeWidth: { value: 0.08, min: 0.02, max: 0.3, step: 0.01 },
    windSpeed: { value: 1.5, min: 0, max: 5, step: 0.1 },
    windStrength: { value: 0.4, min: 0, max: 1, step: 0.01 },
    windAngle: { value: 45, min: 0, max: 360, step: 1 },
    noiseScale: { value: 0.15, min: 0.01, max: 1, step: 0.01 },
    densityFalloff: { value: 0.3, min: 0, max: 1, step: 0.01 },
  })

  const geometry = useMemo(
    () => buildStarGeometry(controls.density, controls.areaSize, controls.noiseScale, controls.densityFalloff),
    [controls.density, controls.areaSize, controls.noiseScale, controls.densityFalloff],
  )

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uBaseColor: { value: new THREE.Color(controls.baseColor) },
    uTipColor: { value: new THREE.Color(controls.tipColor) },
    uColorVariation: { value: controls.colorVariation },
    uBladeHeight: { value: controls.bladeHeight },
    uBladeHeightVar: { value: controls.bladeHeightVar },
    uBladeWidth: { value: controls.bladeWidth },
    uWindSpeed: { value: controls.windSpeed },
    uWindStrength: { value: controls.windStrength },
    uWindDirection: { value: new THREE.Vector2(Math.cos(controls.windAngle * Math.PI / 180), Math.sin(controls.windAngle * Math.PI / 180)) },
  }), [])

  useEffect(() => {
    const mat = matRef.current
    if (!mat) return
    mat.uniforms.uBaseColor.value.set(controls.baseColor)
    mat.uniforms.uTipColor.value.set(controls.tipColor)
    mat.uniforms.uColorVariation.value = controls.colorVariation
    mat.uniforms.uBladeHeight.value = controls.bladeHeight
    mat.uniforms.uBladeHeightVar.value = controls.bladeHeightVar
    mat.uniforms.uBladeWidth.value = controls.bladeWidth
    mat.uniforms.uWindSpeed.value = controls.windSpeed
    mat.uniforms.uWindStrength.value = controls.windStrength
    const rad = (controls.windAngle * Math.PI) / 180
    mat.uniforms.uWindDirection.value.set(Math.cos(rad), Math.sin(rad))
  }, [controls.baseColor, controls.tipColor, controls.colorVariation, controls.bladeHeight, controls.bladeHeightVar, controls.bladeWidth, controls.windSpeed, controls.windStrength, controls.windAngle])

  useFrame((_, delta) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value += delta
    }
  })

  const groundSize = controls.areaSize * 1.5

  return (
    <>
      <mesh ref={meshRef} frustumCulled={false}>
        <primitive object={geometry} attach="geometry" />
        <shaderMaterial
          ref={matRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          side={THREE.DoubleSide}
          transparent
          depthWrite
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial color="#2d5a1e" />
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
