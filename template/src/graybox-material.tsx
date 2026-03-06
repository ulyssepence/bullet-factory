import React, { useMemo } from 'react'
import * as THREE from 'three'

export type SurfaceStyle =
  | 'rough' | 'smooth' | 'organic' | 'crystalline' | 'metallic' | 'worn'
  | 'wood' | 'brick' | 'tile' | 'sand' | 'dirt' | 'grass' | 'marble'
  | 'cobblestone' | 'bark' | 'gravel' | 'carpet' | 'slate' | 'ice' | 'obsidian'
  | 'plank' | 'moss'

interface Props {
  color: string
  style: SurfaceStyle
  scale?: number
  bumpStrength?: number
  side?: THREE.Side
  polygonOffset?: boolean
  polygonOffsetFactor?: number
  polygonOffsetUnits?: number
  vertexColors?: boolean
  noiseTex?: THREE.Texture
}

const NOISE_GLSL = /* glsl */ `
vec3 mod289_3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289_4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289_4(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

// Simplex 3D noise with gradient output for bump mapping
vec4 snoise_grad(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289_3(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  vec4 m2 = m * m;
  vec4 m4 = m2 * m2;

  vec4 pdotx = vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3));

  vec4 dm = -8.0 * m2 * m * pdotx;
  vec3 gradient = 105.0 * (
    dm.x * x0 + m4.x * p0 +
    dm.y * x1 + m4.y * p1 +
    dm.z * x2 + m4.z * p2 +
    dm.w * x3 + m4.w * p3
  );

  float value = 105.0 * dot(m4, pdotx);
  return vec4(gradient, value);
}

float snoise(vec3 v) {
  return snoise_grad(v).w;
}

// Voronoi / cell noise
vec2 voronoi(vec3 p) {
  vec3 b = floor(p);
  vec3 f = fract(p);
  float d1 = 1.0e10;
  float d2 = 1.0e10;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = o + fract(sin(vec3(
      dot(b + o, vec3(127.1, 311.7, 74.7)),
      dot(b + o, vec3(269.5, 183.3, 246.1)),
      dot(b + o, vec3(113.5, 271.9, 124.6))
    )) * 43758.5453) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; }
    else if (d < d2) { d2 = d; }
  }
  return vec2(sqrt(d1), sqrt(d2));
}

// fBm with gradient (2 octaves for perf)
vec4 fbm_grad(vec3 p, int octaves) {
  vec4 sum = vec4(0.0);
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 2; i++) {
    if (i >= octaves) break;
    vec4 n = snoise_grad(p * freq);
    sum += n * amp;
    freq *= 2.0;
    amp *= 0.5;
  }
  return sum;
}

float fbm(vec3 p, int octaves) {
  return fbm_grad(p, octaves).w;
}
`

import type { NoiseType } from './noise-texture'

type StyleConfig = {
  roughness: number
  metalness: number
  octaves: number
  noiseScale: number
  bumpScale: number
  fragmentCode: string
  noiseType: NoiseType
  bakedTexScale: number
  bakedFragmentCode: string
}

function noiseStyle(
  base: Omit<StyleConfig, 'noiseType' | 'bakedTexScale' | 'bakedFragmentCode'>,
  noiseType: NoiseType,
  bakedTexScale: number,
  bakedFragmentCode: string,
): StyleConfig {
  return { ...base, noiseType, bakedTexScale, bakedFragmentCode }
}

const BAKED_SIMPLE = (colorLo: number, colorHi: number, roughMul: number) => /* glsl */ `
  vec3 nd = texture2D(noiseTex, triUV.xz * noiseTexScale).rgb;
  float n = nd.r * 2.0 - 1.0;
  surfaceColor = baseColor * (${colorLo.toFixed(2)} + ${(colorHi - colorLo).toFixed(2)} * n);
  bumpGrad = vec3(nd.g * 2.0 - 1.0, 0.0, nd.b * 2.0 - 1.0);
  roughnessMod = ${roughMul.toFixed(2)} * n;
`

const styleConfigs: Record<SurfaceStyle, StyleConfig> = {
  rough: noiseStyle({
    roughness: 0.85, metalness: 0.0, octaves: 2, noiseScale: 4.0, bumpScale: 0.15,
    fragmentCode: /* glsl */ `
      vec4 ng = fbm_grad(triUV * noiseScale, 2);
      float n = ng.w;
      vec3 grad = ng.xyz;
      surfaceColor = baseColor * (0.93 + 0.07 * n);
      bumpGrad = grad;
      roughnessMod = 0.03 * n;
    `,
  }, 'turbulence', 4.0, BAKED_SIMPLE(0.93, 1.0, 0.03)),

  smooth: noiseStyle({
    roughness: 0.2, metalness: 0.0, octaves: 1, noiseScale: 2.0, bumpScale: 0.05,
    fragmentCode: /* glsl */ `
      vec4 ng = snoise_grad(triUV * noiseScale);
      float n = ng.w;
      surfaceColor = baseColor * (0.97 + 0.03 * n);
      bumpGrad = ng.xyz;
      roughnessMod = 0.01 * n;
    `,
  }, 'perlin', 2.0, BAKED_SIMPLE(0.97, 1.0, 0.01)),

  organic: noiseStyle({
    roughness: 0.6, metalness: 0.0, octaves: 2, noiseScale: 1.5, bumpScale: 0.07,
    fragmentCode: /* glsl */ `
      float warp = snoise(triUV * noiseScale * 0.5) * 0.15;
      vec3 warped = triUV * noiseScale + vec3(warp);
      vec4 ng = fbm_grad(warped, 2);
      float n = ng.w;
      surfaceColor = baseColor * (0.9 + 0.1 * n);
      bumpGrad = ng.xyz;
      roughnessMod = 0.05 * n;
    `,
  }, 'turbulence', 1.5, BAKED_SIMPLE(0.9, 1.0, 0.05)),

  crystalline: noiseStyle({
    roughness: 0.3, metalness: 0.1, octaves: 1, noiseScale: 3.0, bumpScale: 0.1,
    fragmentCode: /* glsl */ `
      vec2 v = voronoi(triUV * noiseScale);
      float edge = v.y - v.x;
      float n = smoothstep(0.0, 0.3, edge);
      surfaceColor = baseColor * (0.88 + 0.12 * n);
      float eps = 0.05;
      float nx = voronoi(triUV * noiseScale + vec3(eps,0,0)).y - voronoi(triUV * noiseScale - vec3(eps,0,0)).y;
      float ny = voronoi(triUV * noiseScale + vec3(0,eps,0)).y - voronoi(triUV * noiseScale - vec3(0,eps,0)).y;
      float nz = voronoi(triUV * noiseScale + vec3(0,0,eps)).y - voronoi(triUV * noiseScale - vec3(0,0,eps)).y;
      bumpGrad = vec3(nx, ny, nz) / (2.0 * eps);
      roughnessMod = -0.1 * (1.0 - n);
    `,
  }, 'voronoi', 3.0, /* glsl */ `
    vec3 nd = texture2D(noiseTex, triUV.xz * noiseTexScale).rgb;
    float n = nd.r;
    surfaceColor = baseColor * (0.88 + 0.12 * n);
    bumpGrad = vec3(nd.g * 2.0 - 1.0, 0.0, nd.b * 2.0 - 1.0);
    roughnessMod = -0.1 * (1.0 - n);
  `),

  metallic: noiseStyle({
    roughness: 0.25, metalness: 0.4, octaves: 1, noiseScale: 8.0, bumpScale: 0.05,
    fragmentCode: /* glsl */ `
      vec3 stretched = triUV * noiseScale * vec3(1.0, 4.0, 1.0);
      vec4 ng = snoise_grad(stretched);
      float n = ng.w;
      surfaceColor = baseColor * (0.96 + 0.04 * n);
      bumpGrad = ng.xyz * vec3(1.0, 0.25, 1.0);
      roughnessMod = 0.03 * n;
    `,
  }, 'perlin', 8.0, BAKED_SIMPLE(0.96, 1.0, 0.03)),

  worn: noiseStyle({
    roughness: 0.7, metalness: 0.2, octaves: 2, noiseScale: 2.5, bumpScale: 0.15,
    fragmentCode: /* glsl */ `
      vec4 ng = fbm_grad(triUV * noiseScale, 2);
      float n = ng.w;
      float scratches = snoise(triUV * noiseScale * 4.0) * 0.5;
      float wear = clamp(n + scratches * 0.3, -1.0, 1.0);
      surfaceColor = baseColor * (0.88 + 0.12 * wear);
      bumpGrad = ng.xyz;
      roughnessMod = 0.1 * wear;
      metalnessMod = -0.1 * (1.0 - smoothstep(-0.2, 0.2, wear));
    `,
  }, 'turbulence', 2.5, /* glsl */ `
    vec3 nd = texture2D(noiseTex, triUV.xz * noiseTexScale).rgb;
    float n = nd.r * 2.0 - 1.0;
    surfaceColor = baseColor * (0.88 + 0.12 * n);
    bumpGrad = vec3(nd.g * 2.0 - 1.0, 0.0, nd.b * 2.0 - 1.0);
    roughnessMod = 0.1 * n;
    metalnessMod = -0.1 * (1.0 - smoothstep(-0.2, 0.2, n));
  `),

  wood: noiseStyle({
    roughness: 0.65, metalness: 0.0, octaves: 1, noiseScale: 2.0, bumpScale: 0.08,
    fragmentCode: /* glsl */ `
      float grain = sin(triUV.x * noiseScale * 10.0 + snoise(triUV * noiseScale) * 2.0);
      grain = grain * 0.5 + 0.5;
      surfaceColor = baseColor * (0.88 + 0.12 * grain);
      bumpGrad = vec3(cos(triUV.x * noiseScale * 10.0) * noiseScale * 10.0, 0.0, 0.0);
      roughnessMod = 0.04 * (1.0 - grain);
    `,
  }, 'perlin', 2.0, BAKED_SIMPLE(0.88, 1.0, 0.04)),

  plank: noiseStyle({
    roughness: 0.7, metalness: 0.0, octaves: 1, noiseScale: 1.0, bumpScale: 0.1,
    fragmentCode: /* glsl */ `
      float boardX = fract(triUV.x * noiseScale * 2.0);
      float boardZ = fract(triUV.z * noiseScale * 0.5);
      float gap = 1.0 - smoothstep(0.0, 0.03, boardX) * smoothstep(0.0, 0.03, 1.0 - boardX);
      float grain = sin(triUV.x * noiseScale * 20.0 + snoise(triUV * noiseScale * 2.0) * 1.5);
      grain = grain * 0.5 + 0.5;
      surfaceColor = baseColor * (0.85 + 0.12 * grain) * (0.7 + 0.3 * gap);
      bumpGrad = vec3(0.0, 0.0, (1.0 - gap) * 2.0);
      roughnessMod = 0.05 * (1.0 - grain);
    `,
  }, 'perlin', 1.0, BAKED_SIMPLE(0.85, 0.97, 0.05)),

  brick: noiseStyle({
    roughness: 0.85, metalness: 0.0, octaves: 1, noiseScale: 2.0, bumpScale: 0.12,
    fragmentCode: /* glsl */ `
      vec2 brickUV = triUV.xz * noiseScale * 2.0;
      float row = floor(brickUV.y);
      brickUV.x += mod(row, 2.0) * 0.5;
      vec2 brick = fract(brickUV);
      float mortarX = 1.0 - smoothstep(0.0, 0.05, brick.x) * smoothstep(0.0, 0.05, 1.0 - brick.x);
      float mortarY = 1.0 - smoothstep(0.0, 0.08, brick.y) * smoothstep(0.0, 0.08, 1.0 - brick.y);
      float mortar = max(mortarX, mortarY);
      float n = snoise(triUV * noiseScale * 4.0) * 0.06;
      surfaceColor = baseColor * (0.85 + 0.12 * (1.0 - mortar) + n);
      bumpGrad = vec3(mortar * 2.0, 0.0, mortar * 2.0);
      roughnessMod = 0.05 * mortar;
    `,
  }, 'perlin', 2.0, BAKED_SIMPLE(0.85, 0.97, 0.05)),

  tile: noiseStyle({
    roughness: 0.15, metalness: 0.0, octaves: 1, noiseScale: 3.0, bumpScale: 0.1,
    fragmentCode: /* glsl */ `
      vec2 tileUV = fract(triUV.xz * noiseScale * 2.0);
      float groutX = 1.0 - smoothstep(0.0, 0.04, tileUV.x) * smoothstep(0.0, 0.04, 1.0 - tileUV.x);
      float groutY = 1.0 - smoothstep(0.0, 0.04, tileUV.y) * smoothstep(0.0, 0.04, 1.0 - tileUV.y);
      float grout = max(groutX, groutY);
      surfaceColor = baseColor * (0.92 + 0.06 * (1.0 - grout));
      bumpGrad = vec3(grout, 0.0, grout);
      roughnessMod = 0.3 * grout;
    `,
  }, 'perlin', 3.0, BAKED_SIMPLE(0.92, 0.98, 0.3)),

  sand: noiseStyle({
    roughness: 0.9, metalness: 0.0, octaves: 2, noiseScale: 12.0, bumpScale: 0.04,
    fragmentCode: /* glsl */ `
      vec4 ng = fbm_grad(triUV * noiseScale, 2);
      float n = ng.w;
      surfaceColor = baseColor * (0.95 + 0.05 * n);
      bumpGrad = ng.xyz;
      roughnessMod = 0.02 * n;
    `,
  }, 'turbulence', 12.0, BAKED_SIMPLE(0.95, 1.0, 0.02)),

  dirt: noiseStyle({
    roughness: 0.9, metalness: 0.0, octaves: 2, noiseScale: 3.0, bumpScale: 0.1,
    fragmentCode: /* glsl */ `
      vec4 ng = fbm_grad(triUV * noiseScale, 2);
      float n = ng.w;
      float clump = smoothstep(-0.2, 0.3, n);
      surfaceColor = baseColor * (0.85 + 0.15 * clump);
      bumpGrad = ng.xyz;
      roughnessMod = 0.05 * clump;
    `,
  }, 'turbulence', 3.0, /* glsl */ `
    vec3 nd = texture2D(noiseTex, triUV.xz * noiseTexScale).rgb;
    float n = nd.r * 2.0 - 1.0;
    float clump = smoothstep(-0.2, 0.3, n);
    surfaceColor = baseColor * (0.85 + 0.15 * clump);
    bumpGrad = vec3(nd.g * 2.0 - 1.0, 0.0, nd.b * 2.0 - 1.0);
    roughnessMod = 0.05 * clump;
  `),

  grass: noiseStyle({
    roughness: 0.8, metalness: 0.0, octaves: 2, noiseScale: 2.0, bumpScale: 0.06,
    fragmentCode: /* glsl */ `
      vec4 ng = fbm_grad(triUV * noiseScale, 2);
      float n = ng.w;
      surfaceColor = baseColor * (0.92 + 0.08 * n);
      bumpGrad = ng.xyz;
      roughnessMod = 0.03 * n;
    `,
  }, 'turbulence', 2.0, BAKED_SIMPLE(0.92, 1.0, 0.03)),

  marble: noiseStyle({
    roughness: 0.1, metalness: 0.0, octaves: 2, noiseScale: 2.0, bumpScale: 0.03,
    fragmentCode: /* glsl */ `
      float turb = fbm(triUV * noiseScale, 2);
      float vein = sin(triUV.x * noiseScale * 6.0 + turb * 4.0);
      vein = vein * 0.5 + 0.5;
      vein = smoothstep(0.3, 0.7, vein);
      surfaceColor = baseColor * (0.88 + 0.12 * vein);
      vec4 ng = fbm_grad(triUV * noiseScale, 2);
      bumpGrad = ng.xyz * vein;
      roughnessMod = 0.03 * (1.0 - vein);
    `,
  }, 'turbulence', 2.0, BAKED_SIMPLE(0.88, 1.0, 0.03)),

  cobblestone: noiseStyle({
    roughness: 0.85, metalness: 0.0, octaves: 1, noiseScale: 3.0, bumpScale: 0.12,
    fragmentCode: /* glsl */ `
      vec2 v = voronoi(triUV * noiseScale);
      float cell = v.x;
      float edge = smoothstep(0.0, 0.15, v.y - v.x);
      surfaceColor = baseColor * (0.82 + 0.15 * edge + 0.03 * snoise(triUV * noiseScale * 5.0));
      float eps = 0.05;
      float nx = voronoi(triUV * noiseScale + vec3(eps,0,0)).x - voronoi(triUV * noiseScale - vec3(eps,0,0)).x;
      float nz = voronoi(triUV * noiseScale + vec3(0,0,eps)).x - voronoi(triUV * noiseScale - vec3(0,0,eps)).x;
      bumpGrad = vec3(nx, 0.0, nz) / (2.0 * eps);
      roughnessMod = 0.05 * (1.0 - edge);
    `,
  }, 'voronoi', 3.0, /* glsl */ `
    vec3 nd = texture2D(noiseTex, triUV.xz * noiseTexScale).rgb;
    float n = nd.r;
    surfaceColor = baseColor * (0.82 + 0.18 * n);
    bumpGrad = vec3(nd.g * 2.0 - 1.0, 0.0, nd.b * 2.0 - 1.0);
    roughnessMod = 0.05 * (1.0 - n);
  `),

  bark: noiseStyle({
    roughness: 0.9, metalness: 0.0, octaves: 2, noiseScale: 3.0, bumpScale: 0.12,
    fragmentCode: /* glsl */ `
      vec3 stretched = triUV * noiseScale * vec3(1.0, 0.3, 1.0);
      vec4 ng = fbm_grad(stretched, 2);
      float n = ng.w;
      float ridge = abs(n);
      surfaceColor = baseColor * (0.85 + 0.15 * ridge);
      bumpGrad = ng.xyz * vec3(1.0, 0.3, 1.0);
      roughnessMod = 0.05 * ridge;
    `,
  }, 'turbulence', 3.0, /* glsl */ `
    vec3 nd = texture2D(noiseTex, triUV.xz * noiseTexScale).rgb;
    float n = nd.r * 2.0 - 1.0;
    float ridge = abs(n);
    surfaceColor = baseColor * (0.85 + 0.15 * ridge);
    bumpGrad = vec3(nd.g * 2.0 - 1.0, 0.0, nd.b * 2.0 - 1.0);
    roughnessMod = 0.05 * ridge;
  `),

  gravel: noiseStyle({
    roughness: 0.95, metalness: 0.0, octaves: 2, noiseScale: 6.0, bumpScale: 0.12,
    fragmentCode: /* glsl */ `
      vec4 ng = fbm_grad(triUV * noiseScale, 2);
      float n = ng.w;
      float chunky = floor(n * 4.0 + 0.5) / 4.0;
      surfaceColor = baseColor * (0.85 + 0.15 * chunky);
      bumpGrad = ng.xyz;
      roughnessMod = 0.05 * abs(chunky);
    `,
  }, 'turbulence', 6.0, /* glsl */ `
    vec3 nd = texture2D(noiseTex, triUV.xz * noiseTexScale).rgb;
    float n = nd.r * 2.0 - 1.0;
    float chunky = floor(n * 4.0 + 0.5) / 4.0;
    surfaceColor = baseColor * (0.85 + 0.15 * chunky);
    bumpGrad = vec3(nd.g * 2.0 - 1.0, 0.0, nd.b * 2.0 - 1.0);
    roughnessMod = 0.05 * abs(chunky);
  `),

  carpet: noiseStyle({
    roughness: 0.95, metalness: 0.0, octaves: 2, noiseScale: 16.0, bumpScale: 0.03,
    fragmentCode: /* glsl */ `
      float warpN = snoise(triUV * noiseScale * 0.1) * 0.3;
      float threadX = sin(triUV.x * noiseScale * 8.0 + warpN) * 0.5 + 0.5;
      float threadZ = sin(triUV.z * noiseScale * 8.0 + warpN) * 0.5 + 0.5;
      float weave = threadX * 0.5 + threadZ * 0.5;
      surfaceColor = baseColor * (0.93 + 0.07 * weave);
      bumpGrad = vec3(cos(triUV.x * noiseScale * 8.0) * 0.5, 0.0, cos(triUV.z * noiseScale * 8.0) * 0.5);
      roughnessMod = 0.02 * weave;
    `,
  }, 'perlin', 16.0, BAKED_SIMPLE(0.93, 1.0, 0.02)),

  slate: noiseStyle({
    roughness: 0.6, metalness: 0.0, octaves: 2, noiseScale: 4.0, bumpScale: 0.08,
    fragmentCode: /* glsl */ `
      float layers = triUV.y * noiseScale * 3.0;
      float layerEdge = fract(layers);
      float flake = smoothstep(0.0, 0.1, layerEdge) * smoothstep(0.0, 0.1, 1.0 - layerEdge);
      float n = snoise(triUV * noiseScale * 3.0) * 0.08;
      surfaceColor = baseColor * (0.9 + 0.08 * flake + n);
      bumpGrad = vec3(0.0, (1.0 - flake) * 3.0, 0.0);
      roughnessMod = 0.1 * (1.0 - flake);
    `,
  }, 'perlin', 4.0, BAKED_SIMPLE(0.9, 0.98, 0.1)),

  ice: noiseStyle({
    roughness: 0.05, metalness: 0.0, octaves: 1, noiseScale: 2.0, bumpScale: 0.04,
    fragmentCode: /* glsl */ `
      vec2 v = voronoi(triUV * noiseScale * 2.0);
      float crack = 1.0 - smoothstep(0.0, 0.08, v.y - v.x);
      float n = snoise(triUV * noiseScale) * 0.03;
      surfaceColor = baseColor * (0.95 + 0.05 * (1.0 - crack) + n);
      float eps = 0.05;
      float nx = voronoi(triUV * noiseScale * 2.0 + vec3(eps,0,0)).x - voronoi(triUV * noiseScale * 2.0 - vec3(eps,0,0)).x;
      float nz = voronoi(triUV * noiseScale * 2.0 + vec3(0,0,eps)).x - voronoi(triUV * noiseScale * 2.0 - vec3(0,0,eps)).x;
      bumpGrad = vec3(nx, 0.0, nz) / (2.0 * eps) * crack;
      roughnessMod = 0.15 * crack;
    `,
  }, 'voronoi', 4.0, /* glsl */ `
    vec3 nd = texture2D(noiseTex, triUV.xz * noiseTexScale).rgb;
    float n = nd.r;
    surfaceColor = baseColor * (0.95 + 0.05 * (1.0 - n));
    bumpGrad = vec3(nd.g * 2.0 - 1.0, 0.0, nd.b * 2.0 - 1.0) * n;
    roughnessMod = 0.15 * n;
  `),

  obsidian: noiseStyle({
    roughness: 0.05, metalness: 0.1, octaves: 1, noiseScale: 3.0, bumpScale: 0.02,
    fragmentCode: /* glsl */ `
      float n = snoise(triUV * noiseScale);
      surfaceColor = baseColor * (0.96 + 0.04 * n);
      vec4 ng = snoise_grad(triUV * noiseScale);
      bumpGrad = ng.xyz;
      roughnessMod = 0.02 * abs(n);
    `,
  }, 'perlin', 3.0, BAKED_SIMPLE(0.96, 1.0, 0.02)),

  moss: noiseStyle({
    roughness: 0.85, metalness: 0.0, octaves: 2, noiseScale: 2.5, bumpScale: 0.08,
    fragmentCode: /* glsl */ `
      vec4 ng = fbm_grad(triUV * noiseScale, 2);
      float n = ng.w;
      float patches = smoothstep(-0.1, 0.2, n);
      surfaceColor = baseColor * (0.85 + 0.15 * patches);
      bumpGrad = ng.xyz;
      roughnessMod = 0.08 * patches;
    `,
  }, 'turbulence', 2.5, /* glsl */ `
    vec3 nd = texture2D(noiseTex, triUV.xz * noiseTexScale).rgb;
    float n = nd.r * 2.0 - 1.0;
    float patches = smoothstep(-0.1, 0.2, n);
    surfaceColor = baseColor * (0.85 + 0.15 * patches);
    bumpGrad = vec3(nd.g * 2.0 - 1.0, 0.0, nd.b * 2.0 - 1.0);
    roughnessMod = 0.08 * patches;
  `),
}

export function getStyleConfig(style: SurfaceStyle) {
  return styleConfigs[style] ?? styleConfigs.rough
}

function makeShader(style: SurfaceStyle, baked: boolean = false) {
  const cfg = styleConfigs[style] ?? styleConfigs.rough
  const useBaked = baked && cfg.bakedFragmentCode
  return {
    uniforms: {
      baseColor: { value: new THREE.Color('#888888') },
      noiseScale: { value: cfg.noiseScale },
      bumpStrength: { value: cfg.bumpScale },
    },
    vertexPreamble: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
    `,
    vertexMain: /* glsl */ `
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    `,
    fragmentPreamble: useBaked
      ? /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        uniform vec3 baseColor;
        uniform float noiseScale;
        uniform float bumpStrength;
        uniform sampler2D noiseTex;
        uniform float noiseTexScale;
      `
      : /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        uniform vec3 baseColor;
        uniform float noiseScale;
        uniform float bumpStrength;
        ${NOISE_GLSL}
      `,
    fragmentCode: useBaked ? cfg.bakedFragmentCode : cfg.fragmentCode,
    roughness: cfg.roughness,
    metalness: cfg.metalness,
    baked: useBaked,
  }
}

export function createGrayboxMaterial(color: string, style: SurfaceStyle, opts: { scale?: number; side?: THREE.Side; noiseTex?: THREE.Texture } = {}): THREE.MeshStandardMaterial {
  const baked = !!opts.noiseTex
  const shader = makeShader(style, baked)
  const cfg = styleConfigs[style] ?? styleConfigs.rough
  const baseColor = new THREE.Color(color)
  const sc = opts.scale ?? 1.0
  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: shader.roughness,
    metalness: shader.metalness,
    ...(opts.side != null && { side: opts.side }),
  })
  material.onBeforeCompile = (s) => {
    s.uniforms.baseColor = { value: baseColor }
    s.uniforms.noiseScale = { value: shader.uniforms.noiseScale.value * sc }
    s.uniforms.bumpStrength = { value: shader.uniforms.bumpStrength.value }
    if (baked) {
      s.uniforms.noiseTex = { value: opts.noiseTex }
      s.uniforms.noiseTexScale = { value: cfg.bakedTexScale * sc }
    }
    s.vertexShader = s.vertexShader.replace(
      '#include <common>',
      `#include <common>\n${shader.vertexPreamble}`,
    )
    s.vertexShader = s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n${shader.vertexMain}`,
    )
    s.fragmentShader = s.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${shader.fragmentPreamble}\nfloat gb_roughnessMod = 0.0;\nfloat gb_metalnessMod = 0.0;`,
    )
    s.fragmentShader = s.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        normal = normalize((viewMatrix * vec4(vWorldNormal, 0.0)).xyz);
        vec3 blend = abs(vWorldNormal);
        blend = pow(blend, vec3(4.0));
        blend /= (blend.x + blend.y + blend.z);
        vec3 triUV = vWorldPos.yzx * blend.x + vWorldPos.xzy * blend.y + vWorldPos.xyz * blend.z;
        vec3 surfaceColor = baseColor;
        vec3 bumpGrad = vec3(0.0);
        float roughnessMod = 0.0;
        float metalnessMod = 0.0;
        ${shader.fragmentCode}
        gb_roughnessMod = roughnessMod;
        gb_metalnessMod = metalnessMod;
        diffuseColor.rgb = surfaceColor;
        float gradLen = length(bumpGrad);
        if (gradLen > 1.0) bumpGrad /= gradLen;
        vec3 surfTangent = normalize(cross(vWorldNormal, vec3(0.0, 1.0, 0.001)));
        vec3 surfBitangent = cross(vWorldNormal, surfTangent);
        normal = normalize(normal
          - bumpStrength * (bumpGrad.x * surfTangent + bumpGrad.y * vWorldNormal + bumpGrad.z * surfBitangent));
      }`,
    )
    s.fragmentShader = s.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + gb_roughnessMod, 0.0, 1.0);`,
    )
    s.fragmentShader = s.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
      metalnessFactor = clamp(metalnessFactor + gb_metalnessMod, 0.0, 1.0);`,
    )
  }
  material.customProgramCacheKey = () => `graybox-${style}${baked ? '-baked' : ''}`
  return material
}

export function GrayboxMaterial({ color, style, scale = 1.0, bumpStrength, side, polygonOffset, polygonOffsetFactor, polygonOffsetUnits, vertexColors = false, noiseTex }: Props) {
  const mat = useMemo(() => {
    const baked = !!noiseTex
    const shader = makeShader(style, baked)
    const cfg = styleConfigs[style] ?? styleConfigs.rough
    const baseColor = new THREE.Color(color)
    const bStr = bumpStrength ?? shader.uniforms.bumpStrength.value

    const material = new THREE.MeshStandardMaterial({
      color: vertexColors ? 0xffffff : baseColor,
      roughness: shader.roughness,
      metalness: shader.metalness,
      vertexColors,
      ...(side != null && { side }),
      ...(polygonOffset != null && { polygonOffset }),
      ...(polygonOffsetFactor != null && { polygonOffsetFactor }),
      ...(polygonOffsetUnits != null && { polygonOffsetUnits }),
    })

    material.onBeforeCompile = (s) => {
      s.uniforms.baseColor = { value: baseColor }
      s.uniforms.noiseScale = { value: shader.uniforms.noiseScale.value * scale }
      s.uniforms.bumpStrength = { value: bStr }
      if (baked) {
        s.uniforms.noiseTex = { value: noiseTex }
        s.uniforms.noiseTexScale = { value: cfg.bakedTexScale * scale }
      }

      s.vertexShader = s.vertexShader.replace(
        '#include <common>',
        `#include <common>
        ${shader.vertexPreamble}`
      )
      s.vertexShader = s.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${shader.vertexMain}`
      )

      s.fragmentShader = s.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        ${shader.fragmentPreamble}
        float gb_roughnessMod = 0.0;
        float gb_metalnessMod = 0.0;`
      )

      s.fragmentShader = s.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          normal = normalize((viewMatrix * vec4(vWorldNormal, 0.0)).xyz);

          vec3 blend = abs(vWorldNormal);
          blend = pow(blend, vec3(4.0));
          blend /= (blend.x + blend.y + blend.z);

          vec3 triUV = vWorldPos.yzx * blend.x + vWorldPos.xzy * blend.y + vWorldPos.xyz * blend.z;

          vec3 surfaceColor = ${vertexColors ? 'diffuseColor.rgb' : 'baseColor'};
          vec3 bumpGrad = vec3(0.0);
          float roughnessMod = 0.0;
          float metalnessMod = 0.0;

          ${vertexColors ? shader.fragmentCode.replace(/baseColor/g, 'diffuseColor.rgb') : shader.fragmentCode}

          gb_roughnessMod = roughnessMod;
          gb_metalnessMod = metalnessMod;
          diffuseColor.rgb = surfaceColor;

          float gradLen = length(bumpGrad);
          if (gradLen > 1.0) bumpGrad /= gradLen;
          vec3 surfTangent = normalize(cross(vWorldNormal, vec3(0.0, 1.0, 0.001)));
          vec3 surfBitangent = cross(vWorldNormal, surfTangent);
          normal = normalize(normal
            - bumpStrength * (bumpGrad.x * surfTangent + bumpGrad.y * vWorldNormal + bumpGrad.z * surfBitangent));
        }`
      )

      s.fragmentShader = s.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + gb_roughnessMod, 0.0, 1.0);`
      )

      s.fragmentShader = s.fragmentShader.replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = clamp(metalnessFactor + gb_metalnessMod, 0.0, 1.0);`
      )
    }

    material.customProgramCacheKey = () => `graybox-${style}${vertexColors ? '-vc' : ''}${baked ? '-baked' : ''}`
    return material
  }, [color, style, scale, bumpStrength, vertexColors, noiseTex])

  return <primitive object={mat} attach="material" />
}
