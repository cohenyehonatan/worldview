import * as THREE from 'three';
import {
  fetchKeySatellites,
  type SatelliteOMM,
} from '../data/celestrakClient';
import {
  createSatRec,
  propagateToDate,
  computeOrbitPath,
} from '../utils/orbits';
import type { SatRec } from 'satellite.js';

interface SatEntry {
  omm: SatelliteOMM;
  satrec: SatRec;
}

const MAX_SATELLITES = 300;

export class SatelliteLayer {
  private group: THREE.Group;
  private satellites: SatEntry[] = [];
  private pointsMesh: THREE.Points | null = null;
  private selectedIndex: number = -1;
  private selectedOrbitLine: THREE.Line | null = null;
  private positions: Float32Array;
  private colors: Float32Array;

  constructor(scene: THREE.Scene) {
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
    this.selectedIndex = -1;
  }

  getSatellites(): SatEntry[] {
    return this.satellites;
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
      size: 0.008,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });

    this.pointsMesh = new THREE.Points(geometry, material);
    this.group.add(this.pointsMesh);
  }

  private updateSelectedOrbit(): void {
    if (this.selectedIndex < 0) return;
    const { satrec } = this.satellites[this.selectedIndex];
    const points = computeOrbitPath(satrec, new Date(), 180);

    if (points.length < 2) return;

    if (this.selectedOrbitLine) {
      this.group.remove(this.selectedOrbitLine);
      this.selectedOrbitLine.geometry.dispose();
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.5,
    });
    this.selectedOrbitLine = new THREE.Line(geometry, material);
    this.group.add(this.selectedOrbitLine);
  }
}
