import { Effect } from 'postprocessing'
import {
  Uniform, WebGLRenderTarget, Vector2, NearestFilter, HalfFloatType,
  OrthographicCamera, PlaneGeometry, Mesh, ShaderMaterial,
  Scene as ThreeScene,
} from 'three'
import type { WebGLRenderer } from 'three'

export const SHADER_PREAMBLE = /* glsl */ `
#ifndef PI
#define PI 3.14159265358979323846
#endif

// ── Sampling ──

vec3 scene(vec2 uv) { return texture2D(inputBuffer, fract(uv)).rgb; }
vec3 prev(vec2 uv) { return texture2D(previousFrame, fract(uv)).rgb; }

// ── Utility ──

float one_minus(float a) { return 1.0 - a; }

float clamp01(float x) { return clamp(x, 0.0, 1.0); }
vec2 clamp01v2(vec2 x) { return clamp(x, vec2(0.0), vec2(1.0)); }
vec3 clamp01v3(vec3 x) { return clamp(x, vec3(0.0), vec3(1.0)); }

float map_range(float value, float min1, float max1, float min2, float max2) {
  return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

float map01(float value, float bottom, float top) {
  return map_range(value, 0.0, 1.0, bottom, top);
}

float floor_to_nearest(float value, float step) {
  return floor(value / step) * step;
}

vec2 floor_to_nearest2(vec2 value, vec2 step) {
  return floor(value / step) * step;
}

vec2 with_u(vec2 uv, float v) { return vec2(v, uv.y); }
vec2 with_v(vec2 uv, float v) { return vec2(uv.x, v); }

// ── Waves ──

float sin01(float value) { return (sin(value) + 1.0) * 0.5; }

float sin01ma(float t, float period_secs, float offset_secs, float m, float a) {
  return sin01((t + offset_secs) / period_secs * 2.0 * PI) * m + a;
}

float stay01(float t, float period_secs, float offset_secs, float power) {
  float wave = sin((t + offset_secs) / period_secs * 2.0 * PI);
  float s = sign(wave);
  return map_range(s - (s * pow(1.0 - abs(wave), power)), -1.0, 1.0, 0.0, 1.0);
}

float stay(float t, float start, float stop, float period_secs, float offset_secs, float power) {
  return stay01(t, period_secs, offset_secs, power) * (stop - start) + start;
}

float triangle(float t) { return 2.0 * abs(fract(t + 0.5) - 0.5); }
float square(float t) { return step(0.5, fract(t)); }

// ── Coordinates ──

vec2 xy_to_r_theta(vec2 xy) {
  return vec2(length(xy), atan(xy.y, xy.x));
}

vec2 r_theta_to_xy(vec2 rt) {
  return vec2(rt.x * cos(rt.y), rt.x * sin(rt.y));
}

vec2 rotate(vec2 v, float radians) {
  float s = sin(radians), c = cos(radians);
  return mat2(c, s, -s, c) * v;
}

vec2 cartesian_to_polar_long_lat(vec3 xyz) {
  float r = length(xyz);
  return vec2(atan(xyz.y, xyz.x), acos(xyz.z / r));
}

vec2 back_to_front_bottom_to_top(vec3 unit_ray) {
  vec2 uv_a = cartesian_to_polar_long_lat(unit_ray);
  uv_a.y = one_minus(uv_a.y / PI);
  vec2 uv_b = cartesian_to_polar_long_lat(unit_ray.xzy);
  uv_b.y = one_minus(uv_b.y / PI);
  return vec2(uv_a.y, uv_b.y);
}

// ── Color ──

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 rainbow_gradient(float t_in) {
  float t = clamp(t_in, 0.0, 1.0);
  float hue = t;
  float h6 = hue * 6.0;
  float i = floor(h6);
  float f = h6 - i;
  float q = 1.0 - f;
  float r2 = f;
  int ii = int(i);
  if (ii == 0) return vec3(1.0, r2, 0.0);
  if (ii == 1) return vec3(q, 1.0, 0.0);
  if (ii == 2) return vec3(0.0, 1.0, r2);
  if (ii == 3) return vec3(0.0, q, 1.0);
  if (ii == 4) return vec3(r2, 0.0, 1.0);
  return vec3(1.0, 0.0, q);
}

vec3 palette(vec3 a, vec3 b, vec3 c, vec3 d, float t) {
  return a + b * cos(6.28318 * (c * t + d));
}

vec3 replace_rgb(vec3 old_color, vec3 new_r, vec3 new_g, vec3 new_b) {
  return new_r * old_color.x + new_g * old_color.y + new_b * old_color.z;
}

vec3 lit(vec3 lightDir, vec3 c, vec3 n) {
  float diff = max(dot(normalize(n), normalize(lightDir)), 0.0);
  return c * (0.2 + 0.8 * diff);
}

// ── SDF ──

float line_sdf(vec2 uv, vec2 a, vec2 b) {
  vec2 pa = uv - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float rect_sdf(vec2 uv, vec2 center, vec2 size) {
  vec2 d = abs(uv - center) - size;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float circle_sdf(vec2 uv, vec2 center, float size) {
  return length(uv - center) - size;
}

float sphere_sdf(vec3 p, float size) { return length(p) - size; }

float triangle_sdf(vec2 p, float size) {
  float k = sqrt(3.0);
  vec2 q = vec2(abs(p.x) - size, p.y + size / k);
  if (q.x + k * q.y > 0.0) q = vec2(q.x - k * q.y, -k * q.x - q.y) / 2.0;
  q.x -= clamp(q.x, -2.0 * size, 0.0);
  return -length(q) * sign(q.y);
}

float box_sdf(vec3 p, vec3 size) {
  vec3 q = abs(p) - size;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float menger_sponge_sdf(vec3 p, int iterations) {
  float bx = box_sdf(p, vec3(1.0));
  float d = bx;
  float s = 2.67;
  for (int i = 0; i < 8; i++) {
    if (i >= iterations) break;
    vec3 a = mod(p * s, 2.0) - 1.0;
    s *= 3.0;
    vec3 r = abs(vec3(1.0) - 3.0 * abs(a));
    float da = max(r.x, r.y);
    float db = max(r.y, r.z);
    float dc = max(r.z, r.x);
    d = max(d, (min(da, min(db, dc)) - 1.0) / s);
  }
  return max(d, box_sdf(p - 0.5, vec3(0.50)));
}

float smin(float a, float b, float k) {
  float res = exp2(-k * a) + exp2(-k * b);
  return -log2(res) / k;
}

// ── Noise ──

float random(vec2 uv) {
  return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453123);
}

float white_noise(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
vec2 white_noise2(vec2 x) { return fract(sin(x * vec2(12.9898, 78.233)) * 43758.5453); }
vec3 white_noise3(vec3 x) { return fract(sin(x * vec3(12.9898, 78.233, 45.164)) * 43758.5453); }

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

// ── Blur ──

vec3 blur_gaussian(vec2 uv, float radius) {
  float sigma = radius / 2.0;
  vec2 pixel_size = 1.0 / resolution;
  vec3 sum = vec3(0.0);
  float weight_sum = 0.0;
  for (float dx = -4.0; dx <= 4.0; dx += 1.0) {
    for (float dy = -4.0; dy <= 4.0; dy += 1.0) {
      if (abs(dx) > radius || abs(dy) > radius) continue;
      float dist_sq = dx * dx + dy * dy;
      float weight = exp(-dist_sq / (2.0 * sigma * sigma));
      sum += texture2D(inputBuffer, uv + vec2(dx, dy) * pixel_size).rgb * weight;
      weight_sum += weight;
    }
  }
  return sum / weight_sum;
}

// ── Blend Modes (float) ──

float blend_darken(float T, float B) { return min(T, B); }
float blend_multiply(float T, float B) { return T * B; }
float blend_screen(float T, float B) { return 1.0 - (1.0 - T) * (1.0 - B); }

float blend_overlay(float T, float B) {
  return T > 0.5 ? 1.0 - (1.0 - 2.0*(T-0.5)) * (1.0 - B) : 2.0*T*B;
}

float blend_soft_light(float T, float B) {
  return B > 0.5 ? 1.0 - (1.0 - T) * (1.0 - (B - 0.5)) : T * (B + 0.5);
}

float blend_hard_light(float T, float B) {
  return B > 0.5 ? 1.0 - (1.0 - T) * (1.0 - 2.0*(B-0.5)) : T * 2.0*B;
}

float blend_color_dodge(float T, float B) {
  return B >= 1.0 ? 1.0 : clamp01(T / (1.0 - B));
}

float blend_color_burn(float T, float B) {
  return B <= 0.0 ? 0.0 : clamp01(1.0 - (1.0 - T) / B);
}

float blend_linear_dodge(float T, float B) { return clamp01(T + B); }
float blend_linear_burn(float T, float B) { return clamp01(T + B - 1.0); }
float blend_lighten(float T, float B) { return max(T, B); }

float blend_vivid_light(float T, float B) {
  if (B > 0.5) {
    float denom = 2.0 * (B - 0.5);
    return denom <= 0.0 ? 0.0 : clamp01(1.0 - (1.0 - T) / denom);
  }
  float denom = 1.0 - 2.0 * B;
  return denom <= 0.0 ? 1.0 : clamp01(T / denom);
}

float blend_linear_light(float T, float B) {
  return B > 0.5 ? clamp01(T + 2.0*(B-0.5)) : clamp01(T + 2.0*B - 1.0);
}

float blend_pin_light(float T, float B) {
  return B > 0.5 ? max(T, 2.0*(B-0.5)) : min(T, 2.0*B);
}

float blend_difference(float T, float B) { return abs(T - B); }
float blend_exclusion(float T, float B) { return clamp01(0.5 - 2.0*(T-0.5)*(B-0.5)); }

// ── Blend Modes (vec3) ──

vec3 blend_darken(vec3 T, vec3 B) { return min(T, B); }
vec3 blend_multiply(vec3 T, vec3 B) { return T * B; }
vec3 blend_screen(vec3 T, vec3 B) { return vec3(blend_screen(T.x,B.x), blend_screen(T.y,B.y), blend_screen(T.z,B.z)); }
vec3 blend_overlay(vec3 T, vec3 B) { return vec3(blend_overlay(T.x,B.x), blend_overlay(T.y,B.y), blend_overlay(T.z,B.z)); }
vec3 blend_soft_light(vec3 T, vec3 B) { return vec3(blend_soft_light(T.x,B.x), blend_soft_light(T.y,B.y), blend_soft_light(T.z,B.z)); }
vec3 blend_hard_light(vec3 T, vec3 B) { return vec3(blend_hard_light(T.x,B.x), blend_hard_light(T.y,B.y), blend_hard_light(T.z,B.z)); }
vec3 blend_color_dodge(vec3 T, vec3 B) { return vec3(blend_color_dodge(T.x,B.x), blend_color_dodge(T.y,B.y), blend_color_dodge(T.z,B.z)); }
vec3 blend_color_burn(vec3 T, vec3 B) { return vec3(blend_color_burn(T.x,B.x), blend_color_burn(T.y,B.y), blend_color_burn(T.z,B.z)); }
vec3 blend_linear_dodge(vec3 T, vec3 B) { return clamp(T + B, 0.0, 1.0); }
vec3 blend_linear_burn(vec3 T, vec3 B) { return clamp(T + B - 1.0, 0.0, 1.0); }
vec3 blend_lighten(vec3 T, vec3 B) { return max(T, B); }
vec3 blend_vivid_light(vec3 T, vec3 B) { return vec3(blend_vivid_light(T.x,B.x), blend_vivid_light(T.y,B.y), blend_vivid_light(T.z,B.z)); }
vec3 blend_linear_light(vec3 T, vec3 B) { return vec3(blend_linear_light(T.x,B.x), blend_linear_light(T.y,B.y), blend_linear_light(T.z,B.z)); }
vec3 blend_pin_light(vec3 T, vec3 B) { return vec3(blend_pin_light(T.x,B.x), blend_pin_light(T.y,B.y), blend_pin_light(T.z,B.z)); }
vec3 blend_difference(vec3 T, vec3 B) { return abs(T - B); }
vec3 blend_exclusion(vec3 T, vec3 B) {
  vec3 h = vec3(0.5);
  return clamp(h - 2.0*(T-h)*(B-h), 0.0, 1.0);
}
`

export const SHADER_UNIFORMS = /* glsl */ `
uniform float time;
uniform vec2 resolution;
uniform vec2 mouse;
uniform int frame;
uniform sampler2D previousFrame;
`

export function wrapFragment(body: string): string {
  return `${SHADER_UNIFORMS}\n${SHADER_PREAMBLE}\nvoid mainImage(const in vec4 inputColor, const in vec2 UV, out vec4 outputColor) {\nvec2 uv = UV;\nvec3 color = scene(uv).rgb;\n${body}\noutputColor = vec4(color, 1.0);\n}\n`
}

export const DEFAULT_BODY = /* glsl */ `float vig = 1.0 - smoothstep(0.4, 0.8, length(uv - 0.5));
color *= mix(0.5, 1.0, vig);`

export const PREAMBLE_LINE_COUNT = (SHADER_UNIFORMS + '\n' + SHADER_PREAMBLE + '\nvoid mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {\n').split('\n').length

const defaultFragment = wrapFragment(DEFAULT_BODY)

let mousePos = [0, 0]
if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', (e) => {
    mousePos = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight]
  })
}

const blitVert = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }'
const blitFrag = 'uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSrc, vUv); }'

let blitScene: ThreeScene | null = null
let blitCamera: OrthographicCamera | null = null
let blitMaterial: ShaderMaterial | null = null

function blit(renderer: WebGLRenderer, src: WebGLRenderTarget, dst: WebGLRenderTarget) {
  if (!blitScene) {
    blitCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    blitMaterial = new ShaderMaterial({
      uniforms: { tSrc: { value: null } },
      vertexShader: blitVert,
      fragmentShader: blitFrag,
      depthTest: false,
      depthWrite: false,
    })
    blitScene = new ThreeScene()
    blitScene.add(new Mesh(new PlaneGeometry(2, 2), blitMaterial))
  }
  blitMaterial!.uniforms.tSrc.value = src.texture
  const saved = renderer.getRenderTarget()
  renderer.setRenderTarget(dst)
  renderer.render(blitScene, blitCamera!)
  renderer.setRenderTarget(saved)
}

export class GamePostFX extends Effect {
  private fbA: WebGLRenderTarget | null = null
  private fbB: WebGLRenderTarget | null = null
  private fbCurrent = false
  private frameCount = 0
  private lastWidth = 0
  private lastHeight = 0

  constructor(body?: string) {
    super('GamePostFX', body ? wrapFragment(body) : defaultFragment, {
      uniforms: new Map([
        ['time', new Uniform(0)],
        ['resolution', new Uniform(new Vector2(
          typeof window !== 'undefined' ? window.innerWidth : 1,
          typeof window !== 'undefined' ? window.innerHeight : 1,
        ))],
        ['mouse', new Uniform(new Vector2(0, 0))],
        ['frame', new Uniform(0)],
        ['previousFrame', new Uniform(null)],
      ]),
    })
  }

  private ensureFeedbackTargets(w: number, h: number) {
    if (this.fbA && this.lastWidth === w && this.lastHeight === h) return
    this.fbA?.dispose()
    this.fbB?.dispose()
    const opts = { minFilter: NearestFilter, magFilter: NearestFilter, type: HalfFloatType }
    this.fbA = new WebGLRenderTarget(w, h, opts)
    this.fbB = new WebGLRenderTarget(w, h, opts)
    this.lastWidth = w
    this.lastHeight = h
  }

  setBody(body: string) {
    this.setFragmentShader(wrapFragment(body))
    this.setChanged()
  }

  update(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget, deltaTime: number) {
    const t = this.uniforms.get('time')!
    t.value = (t.value as number) + deltaTime
    ;(this.uniforms.get('resolution')!.value as Vector2).set(inputBuffer.width, inputBuffer.height)
    ;(this.uniforms.get('mouse')!.value as Vector2).set(mousePos[0], mousePos[1])
    this.uniforms.get('frame')!.value = this.frameCount++

    this.ensureFeedbackTargets(inputBuffer.width, inputBuffer.height)
    const prevTarget = this.fbCurrent ? this.fbB! : this.fbA!
    const currTarget = this.fbCurrent ? this.fbA! : this.fbB!
    this.uniforms.get('previousFrame')!.value = prevTarget.texture

    blit(renderer, inputBuffer, currTarget)
    this.fbCurrent = !this.fbCurrent
  }

  dispose() {
    this.fbA?.dispose()
    this.fbB?.dispose()
    super.dispose()
  }
}
