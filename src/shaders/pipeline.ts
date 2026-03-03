import * as THREE from 'three';
import {
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  BloomEffect,
} from 'postprocessing';
import { NightVisionEffect } from './nightVision';
import { ThermalEffect } from './thermal';
import { CRTEffect } from './crt';

export type ViewMode = 'normal' | 'nvg' | 'flir' | 'crt';

export class ShaderPipeline {
  private composer: EffectComposer;
  private nvgPass: EffectPass;
  private flirPass: EffectPass;
  private crtPass: EffectPass;
  private bloomPass: EffectPass;
  private thermalEffect: ThermalEffect;
  private crtEffect: CRTEffect;
  private currentMode: ViewMode = 'normal';

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ) {
    this.composer = new EffectComposer(renderer);

    // Pass 1: Render the main 3D scene
    this.composer.addPass(new RenderPass(scene, camera));

    // Bloom (used with NVG for phosphor glow)
    const bloomEffect = new BloomEffect({
      intensity: 0.5,
      luminanceThreshold: 0.6,
      luminanceSmoothing: 0.3,
    });
    this.bloomPass = new EffectPass(camera, bloomEffect);
    this.bloomPass.enabled = false;
    this.composer.addPass(this.bloomPass);

    // Night Vision
    const nvgEffect = new NightVisionEffect();
    this.nvgPass = new EffectPass(camera, nvgEffect);
    this.nvgPass.enabled = false;
    this.composer.addPass(this.nvgPass);

    // Thermal / FLIR
    this.thermalEffect = new ThermalEffect();
    this.flirPass = new EffectPass(camera, this.thermalEffect);
    this.flirPass.enabled = false;
    this.composer.addPass(this.flirPass);

    // CRT
    this.crtEffect = new CRTEffect();
    this.crtPass = new EffectPass(camera, this.crtEffect);
    this.crtPass.enabled = false;
    this.composer.addPass(this.crtPass);

    // Anti-aliasing (final pass)
    const smaaEffect = new SMAAEffect({ preset: SMAAPreset.MEDIUM });
    this.composer.addPass(new EffectPass(camera, smaaEffect));
  }

  /**
   * Insert the HUD render pass right after the main scene render
   * but before any effect passes, so shaders apply to the HUD too.
   */
  setHUDScene(hudScene: THREE.Scene, hudCamera: THREE.OrthographicCamera): void {
    const hudPass = new RenderPass(hudScene, hudCamera);
    hudPass.clear = false; // Composite on top, don't clear the main scene
    // Insert at index 1 (right after the main RenderPass)
    this.composer.removePass(this.composer.passes[1]);
    // We need to rebuild the pass list with the HUD pass at index 1
    const passes = [...this.composer.passes];
    // Remove all passes
    while (this.composer.passes.length > 0) {
      this.composer.removePass(this.composer.passes[0]);
    }
    // Re-add: main scene, then HUD, then the rest
    this.composer.addPass(passes[0]); // main RenderPass
    this.composer.addPass(hudPass);
    for (let i = 1; i < passes.length; i++) {
      this.composer.addPass(passes[i]);
    }
  }

  setMode(mode: ViewMode): void {
    this.currentMode = mode;

    // Disable all effect passes
    this.bloomPass.enabled = false;
    this.nvgPass.enabled = false;
    this.flirPass.enabled = false;
    this.crtPass.enabled = false;

    // Enable the selected mode
    switch (mode) {
      case 'nvg':
        this.bloomPass.enabled = true;
        this.nvgPass.enabled = true;
        break;
      case 'flir':
        this.bloomPass.enabled = true;
        this.flirPass.enabled = true;
        break;
      case 'crt':
        this.crtPass.enabled = true;
        break;
      case 'normal':
        break;
    }
  }

  getMode(): ViewMode {
    return this.currentMode;
  }

  render(): void {
    this.composer.render();
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.thermalEffect.setResolution(width, height);
    this.crtEffect.setResolution(width, height);
  }
}
