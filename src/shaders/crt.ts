import { Effect, BlendFunction } from 'postprocessing';
import * as THREE from 'three';

const fragmentShader = `
uniform float time;
uniform float curvature;
uniform float scanLineBrightness;
uniform float chromaticAberration;
uniform float noiseAmount;
uniform float flickerAmount;
uniform vec2 resolution;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 barrelDistortion(vec2 uv, float k) {
  vec2 centered = uv - 0.5;
  float r2 = dot(centered, centered);
  vec2 distorted = centered * (1.0 + k * r2);
  return distorted + 0.5;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Barrel distortion (screen curvature)
  vec2 distUv = barrelDistortion(uv, curvature);

  // Discard pixels outside the curved screen
  if (distUv.x < 0.0 || distUv.x > 1.0 || distUv.y < 0.0 || distUv.y > 1.0) {
    outputColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Chromatic aberration
  vec2 dir = distUv - 0.5;
  float cr = texture(inputBuffer, distUv + dir * chromaticAberration).r;
  float cg = texture(inputBuffer, distUv).g;
  float cb = texture(inputBuffer, distUv - dir * chromaticAberration).b;
  vec3 color = vec3(cr, cg, cb);

  // Scan lines
  float scanLine = sin(distUv.y * resolution.y * 3.14159 * 2.0);
  scanLine = scanLine * 0.5 + 0.5;
  color *= mix(1.0, scanLine, scanLineBrightness);

  // Vignette
  float dist = distance(distUv, vec2(0.5));
  float vignette = smoothstep(0.7, 0.35, dist);
  color *= vignette;

  // Static noise
  float noise = rand(distUv + time) * noiseAmount;
  color += noise;

  // Flicker
  float flicker = 1.0 + flickerAmount * sin(time * 25.0);
  color *= flicker;

  // Slight green/amber tint for military CRT
  color *= vec3(0.85, 1.0, 0.75);

  outputColor = vec4(color, 1.0);
}
`;

export class CRTEffect extends Effect {
  constructor() {
    super('CRTEffect', fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['time', new THREE.Uniform(0.0)],
        ['curvature', new THREE.Uniform(0.4)],
        ['scanLineBrightness', new THREE.Uniform(0.25)],
        ['chromaticAberration', new THREE.Uniform(0.003)],
        ['noiseAmount', new THREE.Uniform(0.03)],
        ['flickerAmount', new THREE.Uniform(0.02)],
        ['resolution', new THREE.Uniform(new THREE.Vector2(window.innerWidth, window.innerHeight))],
      ]),
    });
  }

  update(
    _renderer: THREE.WebGLRenderer,
    _inputBuffer: THREE.WebGLRenderTarget,
    deltaTime: number
  ): void {
    this.uniforms.get('time')!.value += deltaTime;
  }

  setResolution(width: number, height: number): void {
    (this.uniforms.get('resolution')!.value as THREE.Vector2).set(width, height);
  }
}
