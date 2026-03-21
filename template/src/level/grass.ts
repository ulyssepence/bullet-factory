import * as THREE from 'three'
import { FLOOR, mulberry32 } from './ca'

export type ZoneGrassConfig = {
  density: number
  bladeHeight: number
  bladeHeightVar: number
  bladeWidth: number
  baseColorShift: number
  tipColorShift: number
  windStrength: number
  vertexShader?: string
  fragmentShader?: string
  extraUniforms?: Record<string, { value: any }>
  materialConfig?: Partial<{ blending: number; depthWrite: boolean; transparent: boolean; alphaTest: number }>
}

export type GrassBuildOptions = {
  grid: Uint8Array
  zoneMap: Uint8Array
  worldSize: number
  zonePalettes: THREE.Color[]
  zoneGrassConfigs: (ZoneGrassConfig | null)[]
  seed: number
  windSpeed?: number
  windAngle?: number
}

export type GrassResult = {
  group: THREE.Group
  update: (dt: number) => void
}

export const VERTEX_SHADER = /* glsl */ `
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

export const FRAGMENT_SHADER = /* glsl */ `
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

export function createStarGeometry(): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI) / 3
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const base = i * 4
    const hw = 0.5
    positions.push(
      -hw * cos, 0, -hw * sin,
       hw * cos, 0,  hw * sin,
       hw * cos, 1,  hw * sin,
      -hw * cos, 1, -hw * sin,
    )
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1)
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return geo
}

function scatterZone(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  worldSize: number,
  zone: number,
  density: number,
  seed: number,
) {
  const rng = mulberry32(seed + zone * 9973)
  const offsets: number[] = []
  const rotations: number[] = []
  const scales: number[] = []
  const colorVars: number[] = []

  for (let z = 0; z < worldSize; z++) {
    for (let x = 0; x < worldSize; x++) {
      const idx = z * worldSize + x
      if (grid[idx] !== FLOOR) continue
      if (zoneMap[idx] !== zone) continue

      for (let i = 0; i < density; i++) {
        const ox = (x + rng()) * 1 // cell size = 1
        const oz = (z + rng()) * 1
        offsets.push(ox, 0, oz)
        rotations.push(rng() * Math.PI * 2)
        scales.push(0.6 + rng() * 0.8)
        colorVars.push(rng())
      }
    }
  }

  return { offsets, rotations, scales, colorVars, count: rotations.length }
}

export function build(opts: GrassBuildOptions): GrassResult {
  const {
    grid, zoneMap, worldSize, zonePalettes, zoneGrassConfigs,
    seed, windSpeed = 1.5, windAngle = 45,
  } = opts

  const baseGeo = createStarGeometry()
  const group = new THREE.Group()
  const materials: THREE.ShaderMaterial[] = []

  const windRad = (windAngle * Math.PI) / 180
  const windDir = new THREE.Vector2(Math.cos(windRad), Math.sin(windRad))

  for (let zone = 0; zone < zoneGrassConfigs.length; zone++) {
    const cfg = zoneGrassConfigs[zone]
    if (!cfg) continue

    const palette = zonePalettes[zone] || zonePalettes[0]
    const baseColor = palette.clone().multiplyScalar(cfg.baseColorShift)
    const tipColor = palette.clone().multiplyScalar(cfg.tipColorShift)

    const scattered = scatterZone(grid, zoneMap, worldSize, zone, cfg.density, seed)
    if (scattered.count === 0) continue

    const geo = new THREE.InstancedBufferGeometry()
    geo.index = baseGeo.index
    geo.setAttribute('position', baseGeo.getAttribute('position'))
    geo.setAttribute('uv', baseGeo.getAttribute('uv'))
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(scattered.offsets), 3))
    geo.setAttribute('aRotation', new THREE.InstancedBufferAttribute(new Float32Array(scattered.rotations), 1))
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(new Float32Array(scattered.scales), 1))
    geo.setAttribute('aColorVar', new THREE.InstancedBufferAttribute(new Float32Array(scattered.colorVars), 1))
    geo.instanceCount = scattered.count

    const extras: Record<string, { value: any }> = {}
    if (cfg.extraUniforms) {
      for (const [k, v] of Object.entries(cfg.extraUniforms)) {
        extras[k] = { value: v.value }
      }
    }
    const uniforms: Record<string, { value: any }> = {
      uTime: { value: 0 },
      uBaseColor: { value: baseColor },
      uTipColor: { value: tipColor },
      uColorVariation: { value: 0.5 },
      ...extras,
      uBladeHeight: { value: cfg.bladeHeight },
      uBladeHeightVar: { value: cfg.bladeHeightVar },
      uBladeWidth: { value: cfg.bladeWidth },
      uWindSpeed: { value: windSpeed },
      uWindStrength: { value: cfg.windStrength },
      uWindDirection: { value: windDir },
    }
    const mc = cfg.materialConfig
    const mat = new THREE.ShaderMaterial({
      vertexShader: cfg.vertexShader ?? VERTEX_SHADER,
      fragmentShader: cfg.fragmentShader ?? FRAGMENT_SHADER,
      uniforms,
      side: THREE.DoubleSide,
      alphaTest: mc?.alphaTest ?? 0.1,
      depthWrite: mc?.depthWrite ?? true,
      transparent: mc?.transparent ?? true,
      blending: mc?.blending ?? THREE.NormalBlending,
    })

    materials.push(mat)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    group.add(mesh)
  }

  function update(dt: number) {
    for (const mat of materials) {
      mat.uniforms.uTime.value += dt
    }
  }

  return { group, update }
}

export const PRESETS = {
  meadow: { density: 6, bladeHeight: 0.25, bladeHeightVar: 0.1, bladeWidth: 0.08, baseColorShift: 0.85, tipColorShift: 1.2, windStrength: 0.3 } satisfies ZoneGrassConfig,
  forest: { density: 3, bladeHeight: 0.15, bladeHeightVar: 0.05, bladeWidth: 0.06, baseColorShift: 0.8, tipColorShift: 1.1, windStrength: 0.1 } satisfies ZoneGrassConfig,
  sparse: { density: 1, bladeHeight: 0.12, bladeHeightVar: 0.04, bladeWidth: 0.05, baseColorShift: 0.9, tipColorShift: 1.15, windStrength: 0.5 } satisfies ZoneGrassConfig,
} as const
