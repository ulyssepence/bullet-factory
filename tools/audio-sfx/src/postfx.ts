import { Effect } from 'postprocessing'
import { Uniform } from 'three'

const fragment = /* glsl */ `
uniform float time;
uniform vec2 resolution;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 st = uv;

  // --- UV stage ---
  // Add UV effects here (modify st before sampling)

  // --- Sample ---
  vec3 color = texture2D(inputBuffer, st).rgb;

  // --- Color stage ---
  // Add color effects here (modify color after sampling)

  // Default: vignette darken
  float vig = 1.0 - smoothstep(0.4, 0.8, length(st - 0.5));
  color *= mix(0.5, 1.0, vig);

  outputColor = vec4(color, 1.0);
}
`

export class GamePostFX extends Effect {
  constructor() {
    super('GamePostFX', fragment, {
      uniforms: new Map([
        ['time', new Uniform(0)],
        ['resolution', new Uniform([window.innerWidth, window.innerHeight])],
      ]),
    })
  }

  update(_renderer: unknown, _inputBuffer: unknown, deltaTime: number) {
    (this.uniforms.get('time')!.value as number) += deltaTime
  }
}
