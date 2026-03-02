import { Effect, BlendFunction } from 'postprocessing';
import * as THREE from 'three';

const fragmentShader = `
uniform float time;
uniform int paletteMode;
uniform float noiseIntensity;
uniform vec2 resolution;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

// Ironbow thermal palette
vec3 ironbow(float t) {
  if (t < 0.25) {
    return mix(vec3(0.0, 0.0, 0.05), vec3(0.1, 0.0, 0.5), t / 0.25);
  } else if (t < 0.5) {
    return mix(vec3(0.1, 0.0, 0.5), vec3(0.8, 0.0, 0.4), (t - 0.25) / 0.25);
  } else if (t < 0.75) {
    return mix(vec3(0.8, 0.0, 0.4), vec3(1.0, 0.6, 0.0), (t - 0.5) / 0.25);
  } else {
    return mix(vec3(1.0, 0.6, 0.0), vec3(1.0, 1.0, 0.8), (t - 0.75) / 0.25);
  }
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float lum = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));

  vec3 thermal;

  if (paletteMode == 0) {
    // White-hot
    thermal = vec3(lum);
  } else if (paletteMode == 1) {
    // Black-hot
    thermal = vec3(1.0 - lum);
  } else {
    // Ironbow
    thermal = ironbow(lum);
  }

  // Add sensor noise
  float noise = rand(uv * 400.0 + time * 50.0) * noiseIntensity;
  thermal += noise;

  // Edge detection (Sobel) for heat signature outlines
  vec2 texel = 1.0 / resolution;
  float tl = dot(texture(inputBuffer, uv + vec2(-texel.x, -texel.y)).rgb, vec3(0.333));
  float tr = dot(texture(inputBuffer, uv + vec2( texel.x, -texel.y)).rgb, vec3(0.333));
  float bl = dot(texture(inputBuffer, uv + vec2(-texel.x,  texel.y)).rgb, vec3(0.333));
  float br = dot(texture(inputBuffer, uv + vec2( texel.x,  texel.y)).rgb, vec3(0.333));
  float l  = dot(texture(inputBuffer, uv + vec2(-texel.x,  0.0)).rgb, vec3(0.333));
  float r  = dot(texture(inputBuffer, uv + vec2( texel.x,  0.0)).rgb, vec3(0.333));
  float t  = dot(texture(inputBuffer, uv + vec2( 0.0, -texel.y)).rgb, vec3(0.333));
  float b  = dot(texture(inputBuffer, uv + vec2( 0.0,  texel.y)).rgb, vec3(0.333));

  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = sqrt(gx * gx + gy * gy);

  thermal += edge * 0.3;

  outputColor = vec4(thermal, inputColor.a);
}
`;

export class ThermalEffect extends Effect {
  constructor() {
    super('ThermalEffect', fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['time', new THREE.Uniform(0.0)],
        ['paletteMode', new THREE.Uniform(2)], // 0=white-hot, 1=black-hot, 2=ironbow
        ['noiseIntensity', new THREE.Uniform(0.04)],
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
