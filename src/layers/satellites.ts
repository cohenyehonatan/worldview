import * as THREE from 'three';
import {
  fetchKeySatellites,
  type SatelliteOMM,
} from '../data/celestrakClient';
import {
  createSatRec,
  propagateToDate,
  computeOrbitPath,
  type SatPosition,
} from '../utils/orbits';
import { geoToWorld, getGlobeRadius } from '../utils/geo';
import type { SatRec } from 'satellite.js';

export interface SatEntry {
  omm: SatelliteOMM;
  satrec: SatRec;
}

const MAX_SATELLITES = 300;

export class SatelliteLayer {
  private group: THREE.Group;
  private camera: THREE.PerspectiveCamera;
  private satellites: SatEntry[] = [];
  private pointsMesh: THREE.Points | null = null;
  private selectedIndex: number = -1;
  private selectedOrbitLine: THREE.Line | null = null;
  private footprintGroup: THREE.Group | null = null;
  private lastFootprintUpdate = 0;
  private positions: Float32Array;
  private colors: Float32Array;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'satellite-layer';
    scene.add(this.group);
    this.positions = new Float32Array(MAX_SATELLITES * 3);
    this.colors = new Float32Array(MAX_SATELLITES * 3);
  }

  async load(): Promise<void> {
    try {
      const omms = await fetchKeySatellites();
      this.satellites = [];

      for (const omm of omms) {
        if (this.satellites.length >= MAX_SATELLITES) break;
        const satrec = createSatRec(omm);
        if (satrec) {
          this.satellites.push({ omm, satrec });
        }
      }

      this.createPointsMesh();
      console.log(`[Satellites] Loaded ${this.satellites.length} satellites`);
    } catch (err) {
      console.warn('[Satellites] Failed to load:', err);
    }
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /** Update satellite positions to current time */
  update(): void {
    if (!this.pointsMesh || this.satellites.length === 0) return;

    const now = new Date();
    const stationColor = new THREE.Color(0x00ff88);
    const militaryColor = new THREE.Color(0xff4444);
    const defaultColor = new THREE.Color(0x6688ff);

    for (let i = 0; i < this.satellites.length; i++) {
      const { omm, satrec } = this.satellites[i];
      const pos = propagateToDate(satrec, now);

      if (pos) {
        this.positions[i * 3] = pos.position.x;
        this.positions[i * 3 + 1] = pos.position.y;
        this.positions[i * 3 + 2] = pos.position.z;

        // Color by type
        let color = defaultColor;
        const name = omm.OBJECT_NAME.toUpperCase();
        if (name.includes('ISS') || name.includes('STATION')) {
          color = stationColor;
        } else if (omm.CLASSIFICATION_TYPE !== 'U') {
          color = militaryColor;
        }
        this.colors[i * 3] = color.r;
        this.colors[i * 3 + 1] = color.g;
        this.colors[i * 3 + 2] = color.b;
      }
    }

    const geom = this.pointsMesh.geometry;
    geom.attributes.position.needsUpdate = true;
    geom.attributes.color.needsUpdate = true;

    // Update selected orbit line if any
    if (this.selectedIndex >= 0) {
      this.updateSelectedOrbit();
    }
  }

  /** Show orbit path for a specific satellite */
  showOrbit(index: number): void {
    this.clearOrbit();
    if (index < 0 || index >= this.satellites.length) return;

    this.selectedIndex = index;
    this.updateSelectedOrbit();
  }

  clearOrbit(): void {
    if (this.selectedOrbitLine) {
      this.group.remove(this.selectedOrbitLine);
      this.selectedOrbitLine.geometry.dispose();
      this.selectedOrbitLine = null;
    }
    this.clearFootprint();
    this.selectedIndex = -1;
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  getSatellites(): SatEntry[] {
    return this.satellites;
  }

  /** Get live propagated position for a satellite by index */
  getSatPosition(index: number): SatPosition | null {
    if (index < 0 || index >= this.satellites.length) return null;
    return propagateToDate(this.satellites[index].satrec, new Date());
  }

  /**
   * Pick the nearest satellite to a screen-space click point.
   * Returns the SatEntry and its index if within threshold, else null.
   */
  pick(
    ndcX: number,
    ndcY: number,
    canvasWidth: number,
    canvasHeight: number,
    thresholdPx: number = 40
  ): { entry: SatEntry; index: number } | null {
    if (this.satellites.length === 0) return null;

    const projected = new THREE.Vector3();
    let bestDist = Infinity;
    let bestIndex = -1;

    for (let i = 0; i < this.satellites.length; i++) {
      const wx = this.positions[i * 3];
      const wy = this.positions[i * 3 + 1];
      const wz = this.positions[i * 3 + 2];

      // Skip uninitialized positions
      if (wx === 0 && wy === 0 && wz === 0) continue;

      projected.set(wx, wy, wz).project(this.camera);

      // Skip points behind the camera
      if (projected.z > 1) continue;

      const screenX = (projected.x * 0.5 + 0.5) * canvasWidth;
      const screenY = (-projected.y * 0.5 + 0.5) * canvasHeight;

      const clickX = (ndcX * 0.5 + 0.5) * canvasWidth;
      const clickY = (-ndcY * 0.5 + 0.5) * canvasHeight;

      const dx = screenX - clickX;
      const dy = screenY - clickY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestDist <= thresholdPx) {
      return { entry: this.satellites[bestIndex], index: bestIndex };
    }
    return null;
  }

  private createPointsMesh(): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage
      )
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.colors, 3).setUsage(
        THREE.DynamicDrawUsage
      )
    );
    geometry.setDrawRange(0, this.satellites.length);

    const material = new THREE.PointsMaterial({
      size: 0.008 * getGlobeRadius(),
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });

    this.pointsMesh = new THREE.Points(geometry, material);
    this.pointsMesh.frustumCulled = false;
    this.group.add(this.pointsMesh);
  }

  private updateSelectedOrbit(): void {
    if (this.selectedIndex < 0) return;
    const { omm, satrec } = this.satellites[this.selectedIndex];
    const points = computeOrbitPath(satrec, new Date(), 180);

    if (points.length < 2) return;

    if (this.selectedOrbitLine) {
      this.group.remove(this.selectedOrbitLine);
      this.selectedOrbitLine.geometry.dispose();
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: this.getSatColor(omm),
      transparent: true,
      opacity: 0.5,
    });
    this.selectedOrbitLine = new THREE.Line(geometry, material);
    this.group.add(this.selectedOrbitLine);

    this.updateFootprint();
  }

  private clearFootprint(): void {
    if (this.footprintGroup) {
      this.footprintGroup.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry.dispose();
        }
      });
      this.group.remove(this.footprintGroup);
      this.footprintGroup = null;
    }
  }

  /** Get the display color for a satellite based on its type */
  private getSatColor(omm: SatelliteOMM): THREE.Color {
    const name = omm.OBJECT_NAME.toUpperCase();
    if (name.includes('ISS') || name.includes('STATION')) {
      return new THREE.Color(0x00ff88);
    } else if (omm.CLASSIFICATION_TYPE !== 'U') {
      return new THREE.Color(0xff4444);
    }
    return new THREE.Color(0x6688ff);
  }

  private updateFootprint(): void {
    if (this.selectedIndex < 0) return;

    // Throttle to every 2 seconds
    const now = performance.now();
    if (this.footprintGroup && now - this.lastFootprintUpdate < 2000) return;
    this.lastFootprintUpdate = now;

    this.clearFootprint();

    const { omm } = this.satellites[this.selectedIndex];
    const pos = this.getSatPosition(this.selectedIndex);
    if (!pos) return;

    const R = 6371; // Earth radius in km
    const h = pos.altitudeKm;
    if (h <= 0) return;

    const color = this.getSatColor(omm);

    // Earth-central half-angle of coverage circle
    const alpha = Math.acos(R / (R + h));

    // Generate ring points via great-circle projection
    const numRingPoints = 72;
    const lat1 = THREE.MathUtils.degToRad(pos.lat);
    const lon1 = THREE.MathUtils.degToRad(pos.lon);
    const ringPoints: THREE.Vector3[] = [];

    for (let i = 0; i <= numRingPoints; i++) {
      const bearing = (i / numRingPoints) * Math.PI * 2;

      const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(alpha) +
        Math.cos(lat1) * Math.sin(alpha) * Math.cos(bearing)
      );
      const lon2 = lon1 + Math.atan2(
        Math.sin(bearing) * Math.sin(alpha) * Math.cos(lat1),
        Math.cos(alpha) - Math.sin(lat1) * Math.sin(lat2)
      );

      const latDeg = THREE.MathUtils.radToDeg(lat2);
      const lonDeg = THREE.MathUtils.radToDeg(lon2);
      // Tiny altitude offset so ring sits above globe/tile surface
      ringPoints.push(geoToWorld(latDeg, lonDeg, 0.5));
    }

    if (ringPoints.length < 2) return;

    this.footprintGroup = new THREE.Group();
    this.footprintGroup.name = 'satellite-footprint';

    // Ring line (closed loop)
    const ringGeometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ringMaterial = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
    });
    const ringLine = new THREE.Line(ringGeometry, ringMaterial);
    ringLine.frustumCulled = false;
    this.footprintGroup.add(ringLine);

    // Filled cone mesh: triangle fan from satellite apex to ring base
    const satWorldPos = pos.position;
    const coneVerts: number[] = [];
    for (let i = 0; i < numRingPoints; i++) {
      // Triangle: satellite → ring[i] → ring[i+1]
      coneVerts.push(
        satWorldPos.x, satWorldPos.y, satWorldPos.z,
        ringPoints[i].x, ringPoints[i].y, ringPoints[i].z,
        ringPoints[i + 1].x, ringPoints[i + 1].y, ringPoints[i + 1].z
      );
    }

    if (coneVerts.length > 0) {
      const coneGeometry = new THREE.BufferGeometry();
      coneGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(coneVerts, 3)
      );
      coneGeometry.computeVertexNormals();
      const coneMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const coneMesh = new THREE.Mesh(coneGeometry, coneMaterial);
      coneMesh.frustumCulled = false;
      this.footprintGroup.add(coneMesh);
    }

    this.group.add(this.footprintGroup);
  }
}
