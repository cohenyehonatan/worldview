import * as THREE from 'three';
import { worldToGeo } from '../utils/geo';
import type { ViewMode } from '../shaders/pipeline';
import type { Aircraft } from '../data/adsbClient';
import { isMilitary } from '../data/adsbClient';
import type { SatEntry } from '../layers/satellites';
import type { SatPosition } from '../utils/orbits';
import './styles.css';

/**
 * HUD rendered onto a canvas texture inside the Three.js scene,
 * so post-processing shaders (NVG, FLIR, CRT) apply to it.
 */
export class HUDOverlay {
  // The 2D canvas we draw the HUD onto
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;

  // The Three.js objects: a separate scene + ortho camera + fullscreen quad
  readonly hudScene: THREE.Scene;
  readonly hudCamera: THREE.OrthographicCamera;

  private visible = true;
  private mode: ViewMode = 'normal';

  // Cached data for drawing
  private headingVal = 0;
  private altitudeStr = '---';
  private coordsStr = '---';
  private utcStr = '--:--:--';
  private acCount = 0;
  private satCount = 0;
  private tfcCount = 0;

  // Aircraft panel state
  private selectedAircraft: Aircraft | null = null;

  // Satellite panel state
  private selectedSatellite: { entry: SatEntry; index: number } | null = null;
  private selectedSatPosition: SatPosition | null = null;

  constructor() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(geometry, material);

    this.hudScene = new THREE.Scene();
    this.hudScene.add(quad);

    // Ortho camera that maps [-1,1] to the screen
    this.hudCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });

    // Escape closes panels
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.selectedAircraft = null;
        this.selectedSatellite = null;
        this.selectedSatPosition = null;
      }
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.hudScene.visible = this.visible;
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
  }

  // ---- Aircraft panel ----

  showAircraft(ac: Aircraft): void {
    this.selectedAircraft = ac;
    this.selectedSatellite = null; // mutually exclusive
    this.selectedSatPosition = null;
  }

  closeAircraft(): void {
    this.selectedAircraft = null;
  }

  isAircraftPanelOpen(): boolean {
    return this.selectedAircraft !== null;
  }

  /** Update with fresh aircraft list (keeps selected panel in sync) */
  updateAircraftData(aircraft: Aircraft[]): void {
    if (!this.selectedAircraft) return;
    const updated = aircraft.find((a) => a.hex === this.selectedAircraft!.hex);
    if (updated) {
      this.selectedAircraft = updated;
    } else {
      this.selectedAircraft = null;
    }
  }

  // ---- Satellite panel ----

  showSatellite(entry: SatEntry, index: number): void {
    this.selectedSatellite = { entry, index };
    this.selectedSatPosition = null;
    this.selectedAircraft = null; // mutually exclusive
  }

  closeSatellite(): void {
    this.selectedSatellite = null;
    this.selectedSatPosition = null;
  }

  isSatellitePanelOpen(): boolean {
    return this.selectedSatellite !== null;
  }

  getSelectedSatelliteIndex(): number {
    return this.selectedSatellite?.index ?? -1;
  }

  updateSatellitePosition(pos: SatPosition | null): void {
    this.selectedSatPosition = pos;
  }

  // ---- Update ----

  update(
    camera: THREE.PerspectiveCamera,
    aircraftCount: number,
    satelliteCount: number,
    trafficCount: number = 0,
    terrainAltitudeM: number | null = null
  ): void {
    // Compute values
    const geo = worldToGeo(camera.position);

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    this.headingVal =
      (THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x)) + 360) % 360;

    // Prefer terrain-relative altitude (from raycasting) over ellipsoid altitude
    const altM = terrainAltitudeM != null
      ? Math.max(0, terrainAltitudeM)
      : Math.max(0, geo.altitudeKm * 1000);
    const altKm = altM / 1000;

    if (altKm >= 1000) {
      this.altitudeStr = `${(altKm / 1000).toFixed(1)}k km`;
    } else if (altKm >= 1) {
      this.altitudeStr = `${altKm.toFixed(1)} km`;
    } else if (altM >= 1) {
      this.altitudeStr = `${altM.toFixed(1)} m`;
    } else {
      this.altitudeStr = `${(altM * 100).toFixed(0)} cm`;
    }

    const latDir = geo.lat >= 0 ? 'N' : 'S';
    const lonDir = geo.lon >= 0 ? 'E' : 'W';
    this.coordsStr = `${Math.abs(geo.lat).toFixed(4)}${latDir}  ${Math.abs(geo.lon).toFixed(4)}${lonDir}`;

    this.utcStr = new Date().toISOString().slice(11, 19);
    this.acCount = aircraftCount;
    this.satCount = satelliteCount;
    this.tfcCount = trafficCount;

    // Redraw
    this.draw();
    this.texture.needsUpdate = true;
  }

  // ---- Theme colors ----

  private getColor(): string {
    switch (this.mode) {
      case 'nvg':    return 'rgba(0,255,100,0.85)';
      case 'flir':   return 'rgba(255,255,255,0.85)';
      case 'crt':    return 'rgba(255,180,50,0.85)';
      default:       return 'rgba(0,255,100,0.85)';
    }
  }

  private getDimColor(): string {
    switch (this.mode) {
      case 'nvg':    return 'rgba(0,255,100,0.4)';
      case 'flir':   return 'rgba(255,255,255,0.3)';
      case 'crt':    return 'rgba(255,180,50,0.3)';
      default:       return 'rgba(0,255,100,0.4)';
    }
  }

  private getFaintColor(): string {
    switch (this.mode) {
      case 'nvg':    return 'rgba(0,255,100,0.15)';
      case 'flir':   return 'rgba(255,255,255,0.15)';
      case 'crt':    return 'rgba(255,180,50,0.15)';
      default:       return 'rgba(0,255,100,0.15)';
    }
  }

  private getBgColor(): string {
    switch (this.mode) {
      case 'flir':   return 'rgba(0,0,0,0.85)';
      case 'crt':    return 'rgba(8,4,0,0.85)';
      default:       return 'rgba(0,8,16,0.85)';
    }
  }

  private getAccentColor(): string {
    return '#ff4444';
  }

  // ---- Drawing ----

  private draw(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const color = this.getColor();
    const dimColor = this.getDimColor();

    ctx.clearRect(0, 0, w, h);
    if (!this.visible) return;

    ctx.save();

    // -- Reticle --
    const cx = w / 2;
    const cy = h / 2;

    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 50, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 25, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    // Crosshair lines
    ctx.beginPath();
    ctx.moveTo(cx - 60, cy); ctx.lineTo(cx - 15, cy);
    ctx.moveTo(cx + 15, cy); ctx.lineTo(cx + 60, cy);
    ctx.moveTo(cx, cy - 60); ctx.lineTo(cx, cy - 15);
    ctx.moveTo(cx, cy + 15); ctx.lineTo(cx, cy + 60);
    ctx.stroke();

    // Mil-dots
    ctx.fillStyle = dimColor;
    for (const [dx, dy] of [[0, -22], [0, 22], [-22, 0], [22, 0]]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // -- Text elements --

    // Dark backdrop behind top bar for legibility
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, w, 30);

    ctx.fillStyle = color;
    ctx.textBaseline = 'top';

    // Heading (top center)
    ctx.font = '16px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`HDG ${this.headingVal.toFixed(0).padStart(3, '0')}`, cx, 8);

    // Mode (top right)
    ctx.font = '14px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(this.mode.toUpperCase(), w - 20, 8);

    // Time (top left)
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`UTC ${this.utcStr}`, 20, 8);

    // Altitude (right, vertical center) — with backdrop
    const altText = `ALT ${this.altitudeStr}`;
    ctx.font = '14px "Courier New", monospace';
    const altMetrics = ctx.measureText(altText);
    const altPadX = 10;
    const altPadY = 6;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(
      w - 20 - altMetrics.width - altPadX,
      cy - 7 - altPadY,
      altMetrics.width + altPadX * 2,
      14 + altPadY * 2
    );
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(altText, w - 20, cy);

    // Coords (bottom center)
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(this.coordsStr, cx, h - 12);

    // Dark backdrop behind bottom bar for legibility
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, h - 28, w, 28);

    // Data counts (bottom left)
    ctx.font = '11px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.fillText(`AC: ${this.acCount}  SAT: ${this.satCount}  TFC: ${this.tfcCount}`, 20, h - 10);

    // Controls hint (bottom right)
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = dimColor;
    ctx.fillText('[1-4] Mode  [H] HUD  [A] AC  [S] SAT  [T] TFC', w - 20, h - 10);

    // -- Info panels (mutually exclusive) --
    if (this.selectedAircraft) {
      this.drawAircraftPanel();
    } else if (this.selectedSatellite) {
      this.drawSatellitePanel();
    }

    ctx.restore();
  }

  private drawAircraftPanel(): void {
    const ac = this.selectedAircraft!;
    const accent = this.getAccentColor();
    const color = this.getColor();
    const mil = isMilitary(ac);

    const callsign = (ac.flight || '').trim() || '---';
    const reg = ac.r || '---';
    const typeCode = ac.t || '---';
    const altFt = ac.alt_baro ?? ac.alt_geom ?? 0;
    const altStr = typeof altFt === 'number' ? altFt.toLocaleString() : String(altFt);
    const gs = ac.gs != null ? `${ac.gs.toFixed(0)} kts` : '---';
    const track = ac.track != null ? `${ac.track.toFixed(0)}` : '---';
    const vRate = ac.baro_rate != null
      ? `${ac.baro_rate > 0 ? '+' : ''}${ac.baro_rate.toFixed(0)} ft/min`
      : '---';
    const squawk = ac.squawk || '---';
    const lat = ac.lat?.toFixed(4) ?? '---';
    const lon = ac.lon?.toFixed(4) ?? '---';

    const rows: ([string, string] | null)[] = [
      null,
      ['REG', reg],
      ['TYPE', typeCode],
      ['ICAO', ac.hex.toUpperCase()],
      ['SQUAWK', squawk],
      null,
      ['ALT', `${altStr} ft`],
      ['GS', gs],
      ['HDG', `${track}\u00B0`],
      ['VS', vRate],
      null,
      ['LAT', lat],
      ['LON', lon],
    ];

    this.drawInfoPanel(callsign, mil ? 'MIL' : 'CIV', mil ? accent : color, rows);
  }

  private drawSatellitePanel(): void {
    const sat = this.selectedSatellite!;
    const color = this.getColor();
    const accent = this.getAccentColor();

    const name = sat.entry.omm.OBJECT_NAME || '---';
    const noradId = String(sat.entry.omm.NORAD_CAT_ID);
    const isClassified = sat.entry.omm.CLASSIFICATION_TYPE !== 'U';
    const epoch = sat.entry.omm.EPOCH
      ? sat.entry.omm.EPOCH.slice(0, 10)
      : '---';

    const pos = this.selectedSatPosition;
    const altKm = pos ? `${pos.altitudeKm.toFixed(1)} km` : '---';
    const velKmS = pos ? `${pos.velocityKmS.toFixed(2)} km/s` : '---';
    const lat = pos ? pos.lat.toFixed(4) : '---';
    const lon = pos ? pos.lon.toFixed(4) : '---';

    const rows: ([string, string] | null)[] = [
      null, // header row
      ['NORAD', noradId],
      ['CLASS', isClassified ? 'CLASSIFIED' : 'UNCLASSIFIED'],
      ['EPOCH', epoch],
      null, // separator
      ['ALT', altKm],
      ['VEL', velKmS],
      null, // separator
      ['LAT', lat],
      ['LON', lon],
    ];

    this.drawInfoPanel(name, isClassified ? 'MIL' : 'SAT', isClassified ? accent : color, rows);
  }

  /** Shared panel drawing for both aircraft and satellite info */
  private drawInfoPanel(
    title: string,
    tagLabel: string,
    tagColor: string,
    rows: ([string, string] | null)[]
  ): void {
    const { ctx } = this;
    const color = this.getColor();
    const dimColor = this.getDimColor();
    const faintColor = this.getFaintColor();
    const bgColor = this.getBgColor();

    const px = 20;
    const py = 55;
    const pw = 280;
    const lineH = 20;
    const pad = 14;

    const ph = pad * 2 + rows.length * lineH + 10;

    // Background
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = faintColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 4);
    ctx.fill();
    ctx.stroke();

    let y = py + pad;

    // Header: title + tag
    ctx.font = 'bold 15px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(title, px + pad, y);

    // Tag badge
    ctx.font = '10px "Courier New", monospace';
    const tagW = ctx.measureText(tagLabel).width + 10;
    const tagX = px + pw - pad - tagW;
    ctx.strokeStyle = tagColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(tagX, y, tagW, 16);
    ctx.fillStyle = tagColor;
    ctx.textAlign = 'center';
    ctx.fillText(tagLabel, tagX + tagW / 2, y + 3);

    y += lineH;

    // Data rows
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'left';

    for (const row of rows.slice(1)) {
      if (row === null) {
        // Separator line
        ctx.strokeStyle = faintColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + pad, y + lineH / 2);
        ctx.lineTo(px + pw - pad, y + lineH / 2);
        ctx.stroke();
        y += lineH * 0.5;
        continue;
      }
      const [label, value] = row;
      ctx.fillStyle = dimColor;
      ctx.fillText(label, px + pad, y);
      ctx.fillStyle = color;
      ctx.fillText(value, px + pad + 90, y);
      y += lineH;
    }

    // Footer
    ctx.font = '10px "Courier New", monospace';
    ctx.fillStyle = dimColor;
    ctx.textAlign = 'right';
    ctx.fillText('ESC to close', px + pw - pad, y + 4);
  }
}
