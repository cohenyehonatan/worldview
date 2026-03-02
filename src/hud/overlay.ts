import * as THREE from 'three';
import { worldToGeo } from '../utils/geo';
import type { ViewMode } from '../shaders/pipeline';
import './styles.css';

export class HUDOverlay {
  private container: HTMLDivElement;
  private headingEl: HTMLDivElement;
  private altitudeEl: HTMLDivElement;
  private coordsEl: HTMLDivElement;
  private modeEl: HTMLDivElement;
  private timeEl: HTMLDivElement;
  private dataEl: HTMLDivElement;
  private visible = true;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'hud-overlay';
    this.container.innerHTML = `
      <!-- Targeting Reticle -->
      <div id="hud-reticle">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(0,255,100,0.5)" stroke-width="1"/>
          <circle cx="60" cy="60" r="25" fill="none" stroke="rgba(0,255,100,0.3)" stroke-width="0.5"/>
          <line x1="0" y1="60" x2="45" y2="60" stroke="rgba(0,255,100,0.7)" stroke-width="1.5"/>
          <line x1="75" y1="60" x2="120" y2="60" stroke="rgba(0,255,100,0.7)" stroke-width="1.5"/>
          <line x1="60" y1="0" x2="60" y2="45" stroke="rgba(0,255,100,0.7)" stroke-width="1.5"/>
          <line x1="60" y1="75" x2="60" y2="120" stroke="rgba(0,255,100,0.7)" stroke-width="1.5"/>
          <!-- Mil-dots -->
          <circle cx="60" cy="38" r="2" fill="rgba(0,255,100,0.5)"/>
          <circle cx="60" cy="82" r="2" fill="rgba(0,255,100,0.5)"/>
          <circle cx="38" cy="60" r="2" fill="rgba(0,255,100,0.5)"/>
          <circle cx="82" cy="60" r="2" fill="rgba(0,255,100,0.5)"/>
        </svg>
      </div>
      <div id="hud-heading">HDG ---</div>
      <div id="hud-altitude">ALT ---</div>
      <div id="hud-speed"></div>
      <div id="hud-coords">---.------N ---.------E</div>
      <div id="hud-mode">NORMAL</div>
      <div id="hud-time">UTC --:--:--</div>
      <div id="hud-data"></div>
      <div id="hud-controls">
        [1] NORMAL [2] NVG [3] FLIR [4] CRT<br>
        [H] TOGGLE HUD
      </div>
    `;
    document.body.appendChild(this.container);

    this.headingEl = this.container.querySelector('#hud-heading')!;
    this.altitudeEl = this.container.querySelector('#hud-altitude')!;
    this.coordsEl = this.container.querySelector('#hud-coords')!;
    this.modeEl = this.container.querySelector('#hud-mode')!;
    this.timeEl = this.container.querySelector('#hud-time')!;
    this.dataEl = this.container.querySelector('#hud-data')!;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? '' : 'none';
  }

  setMode(mode: ViewMode): void {
    this.modeEl.textContent = mode.toUpperCase();

    // Update color scheme based on mode
    this.container.classList.remove('hud-flir', 'hud-crt');
    if (mode === 'flir') {
      this.container.classList.add('hud-flir');
    } else if (mode === 'crt') {
      this.container.classList.add('hud-crt');
    }
  }

  update(
    camera: THREE.PerspectiveCamera,
    aircraftCount: number,
    satelliteCount: number
  ): void {
    if (!this.visible) return;

    // Camera geodetic position
    const geo = worldToGeo(camera.position);

    // Heading from camera forward vector
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const heading =
      (THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x)) + 360) % 360;

    // Altitude
    const altStr =
      geo.altitudeKm > 1000
        ? `${(geo.altitudeKm / 1000).toFixed(1)}k km`
        : `${geo.altitudeKm.toFixed(0)} km`;

    // Coordinates
    const latDir = geo.lat >= 0 ? 'N' : 'S';
    const lonDir = geo.lon >= 0 ? 'E' : 'W';

    // UTC time
    const now = new Date();
    const utc = now.toISOString().slice(11, 19);

    this.headingEl.textContent = `HDG ${heading.toFixed(0).padStart(3, '0')}`;
    this.altitudeEl.textContent = `ALT ${altStr}`;
    this.coordsEl.textContent =
      `${Math.abs(geo.lat).toFixed(4)}${latDir} ${Math.abs(geo.lon).toFixed(4)}${lonDir}`;
    this.timeEl.textContent = `UTC ${utc}`;
    this.dataEl.textContent =
      `AC: ${aircraftCount} | SAT: ${satelliteCount}`;
  }
}
