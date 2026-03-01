import { Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Color } from 'three'
import type { WebGLRenderer, WebGLRenderTarget } from 'three'

export type FogConfig = {
  colorNear: string
  colorFar: string
  start: number
  end: number
  intensity: number
  noiseScale: number
}

export const DEFAULTS: FogConfig = {
  colorNear: '#1a0830',
  colorFar: '#0a0418',
  start: 5,
  end: 30,
  intensity: 0.4,
  noiseScale: 8,
}

const fragment = /* glsl */ `
uniform vec3 uColorNear;
uniform vec3 uColorFar;
uniform float uStart;
uniform float uEnd;
uniform float uIntensity;
uniform float uNoiseScale;
uniform float uTime;

float fogNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float viewZ = getViewZ(depth);
  float linearDepth = -viewZ;
  float fogFactor = smoothstep(uStart, uEnd, linearDepth);
  vec3 fogColor = mix(uColorNear, uColorFar, fogFactor);
  float n = 0.85 + 0.15 * fogNoise(uv * uNoiseScale + vec2(uTime * 0.3, uTime * 0.2));
  float fog = fogFactor * n * uIntensity;
  outputColor = vec4(mix(inputColor.rgb, fogColor, fog), inputColor.a);
}
`

export class FogEffect extends Effect {
  constructor(config: FogConfig = DEFAULTS) {
    super('FogEffect', fragment, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['uColorNear', new Uniform(new Color(config.colorNear))],
        ['uColorFar', new Uniform(new Color(config.colorFar))],
        ['uStart', new Uniform(config.start)],
        ['uEnd', new Uniform(config.end)],
        ['uIntensity', new Uniform(config.intensity)],
        ['uNoiseScale', new Uniform(config.noiseScale)],
        ['uTime', new Uniform(0)],
      ]),
    })
  }

  setConfig(config: FogConfig) {
    ;(this.uniforms.get('uColorNear')!.value as Color).set(config.colorNear)
    ;(this.uniforms.get('uColorFar')!.value as Color).set(config.colorFar)
    this.uniforms.get('uStart')!.value = config.start
    this.uniforms.get('uEnd')!.value = config.end
    this.uniforms.get('uIntensity')!.value = config.intensity
    this.uniforms.get('uNoiseScale')!.value = config.noiseScale
  }

  update(_renderer: WebGLRenderer, _inputBuffer: WebGLRenderTarget, deltaTime: number) {
    this.uniforms.get('uTime')!.value += deltaTime
  }
}
