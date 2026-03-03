import * as THREE from 'three';
import { geoToWorld, worldToGeo, getGlobeRadius, getAltitudeMeters } from '../utils/geo';
import { fetchRoads, type RoadSegment, type HighwayClass } from '../data/overpassClient';

const MAX_PARTICLES = 5000;

/** Speed in km/h by highway class */
const SPEED_KMH: Record<HighwayClass, number> = {
  motorway: 120,
  trunk: 80,
  primary: 60,
  secondary: 45,
  tertiary: 35,
};

/** Particle density weight — higher-class roads get more particles */
const DENSITY_WEIGHT: Record<HighwayClass, number> = {
  motorway: 5,
  trunk: 4,
  primary: 3,
  secondary: 2,
  tertiary: 1,
};

/** Color by highway class — brighter for faster roads */
const ROAD_COLORS: Record<HighwayClass, THREE.Color> = {
  motorway: new THREE.Color(0.2, 1.0, 0.3),   // bright green
  trunk: new THREE.Color(0.4, 0.9, 0.2),       // green-yellow
  primary: new THREE.Color(0.7, 0.85, 0.15),   // yellow-green
  secondary: new THREE.Color(0.9, 0.7, 0.1),   // yellow
  tertiary: new THREE.Color(0.9, 0.5, 0.1),    // orange
};

interface Particle {
  roadIndex: number;
  segIndex: number;  // index into the road's coords array (which edge we're on)
  t: number;         // 0..1 fractional progress along current edge
  speed: number;     // km/h
  highway: HighwayClass;
}

/**
 * Compute the length of a road segment edge (between two adjacent coords) in km.
 * Uses the Haversine formula.
 */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class TrafficLayer {
  private group: THREE.Group;
  private camera: THREE.PerspectiveCamera;
  private pointsMesh: THREE.Points | null = null;
  private positions: Float32Array;
  private colors: Float32Array;
  private particles: Particle[] = [];
  private roads: RoadSegment[] = [];
  private lastFetchCenter: { lat: number; lon: number } | null = null;
  private fetching = false;
  private lastTime = 0;
  private particleCount = 0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'traffic-layer';
    scene.add(this.group);

    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
  }

  async start(): Promise<void> {
    this.lastTime = performance.now();
    await this.fetchIfNeeded();
  }

  stop(): void {
    this.roads = [];
    this.particles = [];
    this.particleCount = 0;
    if (this.pointsMesh) {
      this.pointsMesh.geometry.setDrawRange(0, 0);
    }
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  getParticleCount(): number {
    return this.particleCount;
  }

  update(): void {
    const now = performance.now();
    const dtSec = Math.min((now - this.lastTime) / 1000, 0.1); // cap at 100ms
    this.lastTime = now;

    if (this.particles.length === 0) {
      this.fetchIfNeeded();
      return;
    }

    // Check if we should refetch (camera moved significantly)
    this.fetchIfNeeded();

    // Advance particles along their roads
    for (const p of this.particles) {
      const road = this.roads[p.roadIndex];
      if (!road) continue;

      const edgeCount = road.coords.length - 1;
      if (edgeCount <= 0) continue;

      // Length of current edge in km
      const c0 = road.coords[p.segIndex];
      const c1 = road.coords[p.segIndex + 1];
      const edgeLenKm = haversineKm(c0.lat, c0.lon, c1.lat, c1.lon);

      // Advance t: speed (km/h) → km/s → fraction of edge per second
      const edgeLenSafe = Math.max(edgeLenKm, 0.001);
      const dtFraction = ((p.speed / 3600) * dtSec) / edgeLenSafe;
      p.t += dtFraction;

      // Move to next edge if needed
      while (p.t >= 1 && p.segIndex < edgeCount - 1) {
        p.t -= 1;
        p.segIndex++;
      }

      // Wrap around to start of road
      if (p.t >= 1) {
        p.segIndex = 0;
        p.t = 0;
      }
    }

    // Update positions buffer
    this.updatePositions();
  }

  private updatePositions(): void {
    let count = 0;

    for (const p of this.particles) {
      if (count >= MAX_PARTICLES) break;

      const road = this.roads[p.roadIndex];
      if (!road || p.segIndex >= road.coords.length - 1) continue;

      const c0 = road.coords[p.segIndex];
      const c1 = road.coords[p.segIndex + 1];
      const lat = c0.lat + (c1.lat - c0.lat) * p.t;
      const lon = c0.lon + (c1.lon - c0.lon) * p.t;

      // Minimal altitude offset to avoid z-fighting with tile surface
      const pos = geoToWorld(lat, lon, 0.003);

      this.positions[count * 3] = pos.x;
      this.positions[count * 3 + 1] = pos.y;
      this.positions[count * 3 + 2] = pos.z;

      const color = ROAD_COLORS[p.highway];
      this.colors[count * 3] = color.r;
      this.colors[count * 3 + 1] = color.g;
      this.colors[count * 3 + 2] = color.b;

      count++;
    }

    this.particleCount = count;

    if (!this.pointsMesh && count > 0) {
      this.createPointsMesh();
    }

    if (this.pointsMesh) {
      this.pointsMesh.geometry.attributes.position.needsUpdate = true;
      this.pointsMesh.geometry.attributes.color.needsUpdate = true;
      this.pointsMesh.geometry.setDrawRange(0, count);

      // Dynamic point size: proportional to camera altitude for consistent apparent size
      const altitude = getAltitudeMeters(this.camera.position);
      (this.pointsMesh.material as THREE.PointsMaterial).size =
        Math.max(altitude * 0.008, 1);
    }
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

    const material = new THREE.PointsMaterial({
      size: 1, // overridden each frame in updatePositions()
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });

    this.pointsMesh = new THREE.Points(geometry, material);
    this.pointsMesh.frustumCulled = false;
    this.group.add(this.pointsMesh);
  }

  private async fetchIfNeeded(): Promise<void> {
    if (this.fetching) return;

    const globeR = getGlobeRadius();
    const altitudeM = getAltitudeMeters(this.camera.position);
    const altitudeRatio = altitudeM / globeR;

    // Only show traffic when reasonably zoomed in
    if (altitudeRatio > 0.05) {
      // Too far out — clear traffic
      if (this.particles.length > 0) {
        this.particles = [];
        this.particleCount = 0;
        if (this.pointsMesh) {
          this.pointsMesh.geometry.setDrawRange(0, 0);
        }
      }
      return;
    }

    // Find camera look-at point on the globe
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const ray = new THREE.Ray(this.camera.position.clone(), dir);
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), globeR);
    const hit = new THREE.Vector3();

    if (!ray.intersectSphere(sphere, hit)) return;

    const center = worldToGeo(hit);

    // Check if we need to refetch
    if (this.lastFetchCenter) {
      const dLat = Math.abs(center.lat - this.lastFetchCenter.lat);
      const dLon = Math.abs(center.lon - this.lastFetchCenter.lon);
      // Only refetch if moved more than 30% of the bbox size
      const bboxSpan = altitudeRatio * 50; // rough degrees span
      if (dLat < bboxSpan * 0.3 && dLon < bboxSpan * 0.3) return;
    }

    // Compute bbox from altitude
    const halfSpan = Math.max(0.02, Math.min(0.5, altitudeRatio * 30));
    const minLat = center.lat - halfSpan;
    const maxLat = center.lat + halfSpan;
    const minLon = center.lon - halfSpan;
    const maxLon = center.lon + halfSpan;

    this.fetching = true;
    try {
      const roads = await fetchRoads(minLat, minLon, maxLat, maxLon);
      this.roads = roads;
      this.lastFetchCenter = { lat: center.lat, lon: center.lon };
      this.distributeParticles();
      console.log(
        `[Traffic] Loaded ${roads.length} road segments, ${this.particles.length} particles`
      );
    } catch (err) {
      console.warn('[Traffic] Failed to fetch roads:', err);
    } finally {
      this.fetching = false;
    }
  }

  private distributeParticles(): void {
    this.particles = [];
    if (this.roads.length === 0) return;

    // Compute total weight for proportional distribution
    let totalWeight = 0;
    for (const road of this.roads) {
      const edgeCount = road.coords.length - 1;
      totalWeight += edgeCount * DENSITY_WEIGHT[road.highway];
    }

    if (totalWeight === 0) return;

    // Distribute particles proportionally
    for (let ri = 0; ri < this.roads.length; ri++) {
      const road = this.roads[ri];
      const edgeCount = road.coords.length - 1;
      const weight = edgeCount * DENSITY_WEIGHT[road.highway];
      const count = Math.max(1, Math.round((weight / totalWeight) * MAX_PARTICLES));

      for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
        // Random starting position along the road
        const segIndex = Math.floor(Math.random() * edgeCount);
        const t = Math.random();

        this.particles.push({
          roadIndex: ri,
          segIndex,
          t,
          speed: SPEED_KMH[road.highway] * (0.7 + Math.random() * 0.6), // ±30% variation
          highway: road.highway,
        });
      }
    }
  }
}
