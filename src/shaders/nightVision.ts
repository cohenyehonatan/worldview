import { Effect, BlendFunction } from 'postprocessing';
import * as THREE from 'three';

const fragmentShader = `
uniform float time;
uniform float noiseIntensity;
uniform float scanLineIntensity;
uniform float vignetteStrength;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Convert to luminance
  float lum = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));

  // Boost brightness (NVG amplifies light)
  lum = clamp(lum * 2.0, 0.0, 1.0);

  // Green phosphor color mapping
  vec3 nvg = vec3(0.1, 1.0, 0.2) * lum;

  // Film grain noise
  float noise = rand(uv * 500.0 + time * 100.0) * noiseIntensity;
  nvg += noise;

  // Scan lines
  float scanLine = sin(uv.y * 800.0) * 0.5 + 0.5;
  scanLine = pow(scanLine, 0.8);
  nvg *= mix(1.0, scanLine, scanLineIntensity);

  // Circular vignette (NVG eyepiece)
  float dist = distance(uv, vec2(0.5));
  float vignette = smoothstep(0.55, 0.25, dist);
  nvg *= mix(1.0, vignette, vignetteStrength);

  outputColor = vec4(nvg, inputColor.a);
}
`;

export class NightVisionEffect extends Effect {
  constructor() {
    super('NightVisionEffect', fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['time', new THREE.Uniform(0.0)],
        ['noiseIntensity', new THREE.Uniform(0.12)],
        ['scanLineIntensity', new THREE.Uniform(0.25)],
        ['vignetteStrength', new THREE.Uniform(0.7)],
      ]),
    });
  }

  update(
    _renderer: THREE.WebGLRenderer,
    _inputBuffer: THREE.WebGLRenderTarget,
    deltaTime: number
  ): void {
    const timeUniform = this.uniforms.get('time')!;
    timeUniform.value += deltaTime;
  }
}
