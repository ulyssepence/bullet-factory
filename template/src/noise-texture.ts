import * as THREE from 'three'

export type NoiseType = 'perlin' | 'value' | 'voronoi' | 'turbulence'

const NOISE_GLSL = /* glsl */ `
float random(vec2 uv) {
  return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453123);
}

float simple_noise_value(vec2 uv) {
  vec2 i = floor(uv);
  vec2 f = fract(uv);
  f = f * f * (3.0 - 2.0 * f);
  float r0 = random(i);
  float r1 = random(i + vec2(1.0, 0.0));
  float r2 = random(i + vec2(0.0, 1.0));
  float r3 = random(i + vec2(1.0, 1.0));
  return mix(mix(r0, r1, f.x), mix(r2, r3, f.x), f.y);
}

float simple_noise(vec2 uv) {
  float t = 0.0;
  for (int i = 0; i < 3; i++) {
    float freq = pow(2.0, float(i));
    float amp = pow(0.5, float(3 - i));
    t += simple_noise_value(uv / freq) * amp;
  }
  return t;
}

float voronoi_noise(vec2 uv) {
  vec2 indexUV = floor(uv);
  vec2 fractUV = fract(uv);
  float minDist = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      float rnd = random(indexUV + neighbor);
      vec2 point = vec2(rnd, rnd);
      vec2 diff = neighbor + point - fractUV;
      minDist = min(minDist, length(diff));
    }
  }
  return minDist;
}

vec4 perlin_noise_permute(vec4 x) {
  return mod((34.0 * x + 1.0) * x, 289.0);
}

vec2 perlin_noise_fade(vec2 t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float perlin_noise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod(Pi, 289.0);
  vec4 ix = Pi.xzxz, iy = Pi.yyww;
  vec4 fx = Pf.xzxz, fy = Pf.yyww;
  vec4 i = perlin_noise_permute(perlin_noise_permute(ix) + iy);
  vec4 gx = 2.0 * fract(i * 0.0243902) - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = 1.79284291400159 - 0.85373472095314 * vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = perlin_noise_fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y) * 0.5 + 0.5;
}

float turbulence_noise(vec2 uv, float octaves) {
  float result = 0.0, frequency = 1.0, amplitude = 0.5;
  int oct = int(octaves);
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    result += perlin_noise(uv * frequency) * amplitude;
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return result;
}

float eval_noise(vec2 p, int noiseType, float octaves) {
  if (noiseType == 0) return perlin_noise(p);
  if (noiseType == 1) return simple_noise(p);
  if (noiseType == 2) return voronoi_noise(p);
  return turbulence_noise(p, octaves);
}
`

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const BAKE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 scale;
uniform vec2 offset;
uniform int noiseType;
uniform float octaves;

${NOISE_GLSL}

void main() {
  vec2 p = vUv * scale + offset;
  float eps = 0.5;

  float val = eval_noise(p, noiseType, octaves);
  float dx = eval_noise(p + vec2(eps, 0.0), noiseType, octaves)
           - eval_noise(p - vec2(eps, 0.0), noiseType, octaves);
  float dz = eval_noise(p + vec2(0.0, eps), noiseType, octaves)
           - eval_noise(p - vec2(0.0, eps), noiseType, octaves);

  // Pack: R=value, G=dx gradient, B=dz gradient (remapped to 0..1)
  gl_FragColor = vec4(val, dx * 0.5 + 0.5, dz * 0.5 + 0.5, 1.0);
}
`

const NOISE_TYPE_MAP: Record<NoiseType, number> = {
  perlin: 0,
  value: 1,
  voronoi: 2,
  turbulence: 3,
}

let _scene: THREE.Scene | null = null
let _camera: THREE.OrthographicCamera | null = null
let _material: THREE.ShaderMaterial | null = null

function ensureBakeSetup() {
  if (_scene) return
  _camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  _material = new THREE.ShaderMaterial({
    uniforms: {
      scale: { value: new THREE.Vector2(8, 8) },
      offset: { value: new THREE.Vector2(0, 0) },
      noiseType: { value: 0 },
      octaves: { value: 2 },
    },
    vertexShader: BAKE_VERT,
    fragmentShader: BAKE_FRAG,
    depthTest: false,
    depthWrite: false,
  })
  _scene = new THREE.Scene()
  _scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), _material))
}

export function bakeNoiseTexture(
  renderer: THREE.WebGLRenderer,
  opts: {
    width?: number
    height?: number
    noise: NoiseType
    scale: [number, number]
    offset?: [number, number]
    octaves?: number
  },
): THREE.Texture {
  ensureBakeSetup()

  const w = opts.width ?? 256
  const h = opts.height ?? 256

  _material!.uniforms.scale.value.set(opts.scale[0], opts.scale[1])
  _material!.uniforms.offset.value.set(opts.offset?.[0] ?? 0, opts.offset?.[1] ?? 0)
  _material!.uniforms.noiseType.value = NOISE_TYPE_MAP[opts.noise]
  _material!.uniforms.octaves.value = opts.octaves ?? 2

  const rt = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  })

  const saved = renderer.getRenderTarget()
  renderer.setRenderTarget(rt)
  renderer.render(_scene!, _camera!)

  const pixels = new Uint8Array(w * h * 4)
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixels)
  renderer.setRenderTarget(saved)
  rt.dispose()

  const tex = new THREE.DataTexture(pixels, w, h, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}
