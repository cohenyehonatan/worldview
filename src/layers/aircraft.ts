import * as THREE from 'three';
import { geoToWorld, worldToGeo, getGlobeRadius, getAltitudeMeters } from '../utils/geo';
import {
  fetchAircraft,
  isMilitary,
  type Aircraft,
} from '../data/adsbClient';
import { Poller } from '../data/poller';

const MAX_AIRCRAFT = 2000;
const FEET_TO_KM = 0.0003048;

export class AircraftLayer {
  private instancedMesh: THREE.InstancedMesh;
  private poller: Poller<Aircraft[]>;
  private aircraftData: Aircraft[] = [];
  private prevPositions: Map<string, THREE.Vector3> = new Map();
  private targetPositions: Map<string, THREE.Vector3> = new Map();
  private lastUpdateTime = 0;
  private pollIntervalMs = 5000;
  private group: THREE.Group;

  // Colors
  private civilianColor = new THREE.Color(0xcccccc);
  private militaryColor = new THREE.Color(0xff3333);

  private camera: THREE.PerspectiveCamera;

  // Flight path state
  private flightPathLine: THREE.Line | null = null;
  private selectedHex: string | null = null;
  private lastFlightPathUpdate = 0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'aircraft-layer';
    scene.add(this.group);

    // Unit-sized cone — scaled per-instance based on camera altitude
    const geometry = new THREE.ConeGeometry(0.3, 1.0, 4);
    geometry.rotateX(Math.PI / 2); // Point forward along Z

    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.instancedMesh = new THREE.InstancedMesh(
      geometry,
      material,
      MAX_AIRCRAFT
    );
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.count = 0;
    // Disable frustum culling — Three.js computes the bounding sphere from the
    // base geometry (a tiny cone at the origin), not from instance positions,
    // so the entire mesh gets culled as the camera orbits the globe.
    this.instancedMesh.frustumCulled = false;
    this.group.add(this.instancedMesh);

    // Set up polling
    this.poller = new Poller<Aircraft[]>(
      () => this.fetchVisible(),
      (data) => this.onAircraftData(data),
      this.pollIntervalMs
    );
  }

  async start(): Promise<void> {
    await this.poller.start();
  }

  stop(): void {
    this.poller.stop();
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /** Update interpolated positions each frame */
  update(): void {
    const now = performance.now();
    const t = Math.min(
      1,
      (now - this.lastUpdateTime) / this.pollIntervalMs
    );

    // Dynamic scale: proportional to camera altitude for consistent apparent size
    const altitude = getAltitudeMeters(this.camera.position);
    const scale = Math.max(altitude * 0.005, 0.5);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    let count = 0;
    for (
      let i = 0;
      i < this.aircraftData.length && count < MAX_AIRCRAFT;
      i++
    ) {
      const ac = this.aircraftData[i];
      const target = this.targetPositions.get(ac.hex);
      const prev = this.prevPositions.get(ac.hex);

      if (!target) continue;

      // Interpolate position
      const pos = prev
        ? new THREE.Vector3().lerpVectors(prev, target, t)
        : target.clone();

      dummy.position.copy(pos);
      dummy.scale.setScalar(scale);

      // Orient cone in direction of travel
      if (ac.track != null) {
        const trackRad = THREE.MathUtils.degToRad(ac.track);
        // Point the cone along the heading on the globe surface
        dummy.lookAt(0, 0, 0); // Face center of earth
        dummy.rotateY(trackRad);
      } else {
        dummy.lookAt(0, 0, 0);
      }

      dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(count, dummy.matrix);

      // Color: red for military, white for civilian
      color.copy(isMilitary(ac) ? this.militaryColor : this.civilianColor);
      this.instancedMesh.setColorAt(count, color);

      count++;
    }

    this.instancedMesh.count = count;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor)
      this.instancedMesh.instanceColor.needsUpdate = true;
  }

  getAircraftData(): Aircraft[] {
    return this.aircraftData;
  }

  /**
   * Pick the nearest aircraft to a screen-space click point.
   * Returns the Aircraft if one is within `thresholdPx` pixels, else null.
   */
  pick(
    ndcX: number,
    ndcY: number,
    canvasWidth: number,
    canvasHeight: number,
    thresholdPx: number = 30
  ): Aircraft | null {
    if (!this.group.visible || this.aircraftData.length === 0) return null;

    const projected = new THREE.Vector3();
    let bestDist = Infinity;
    let bestAc: Aircraft | null = null;

    for (const ac of this.aircraftData) {
      const worldPos = this.targetPositions.get(ac.hex);
      if (!worldPos) continue;

      // Project world position to NDC (-1 to 1)
      projected.copy(worldPos).project(this.camera);

      // Skip points behind the camera
      if (projected.z > 1) continue;

      // Convert NDC to pixels
      const screenX = (projected.x * 0.5 + 0.5) * canvasWidth;
      const screenY = (-projected.y * 0.5 + 0.5) * canvasHeight;

      // Click position in pixels
      const clickX = (ndcX * 0.5 + 0.5) * canvasWidth;
      const clickY = (-ndcY * 0.5 + 0.5) * canvasHeight;

      const dx = screenX - clickX;
      const dy = screenY - clickY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < bestDist) {
        bestDist = dist;
        bestAc = ac;
      }
    }

    return bestDist <= thresholdPx ? bestAc : null;
  }

  /** Show a projected flight path line for the given aircraft */
  showFlightPath(ac: Aircraft): void {
    this.clearFlightPath();
    if (ac.lat == null || ac.lon == null || ac.gs == null || ac.track == null) return;

    this.selectedHex = ac.hex;
    this.lastFlightPathUpdate = performance.now();

    const altKm = ((ac.alt_baro || ac.alt_geom || 10000) * FEET_TO_KM);
    const speedKmPerMin = (ac.gs * 1.852) / 60; // knots → km/min
    const durationMin = 5;
    const numPoints = 30;
    const headingRad = THREE.MathUtils.degToRad(ac.track);

    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= numPoints; i++) {
      const distKm = (i / numPoints) * speedKmPerMin * durationMin;
      const { lat, lon } = this.projectForward(ac.lat, ac.lon, headingRad, distKm);
      points.push(geoToWorld(lat, lon, altKm));
    }

    if (points.length < 2) return;

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.5,
    });
    this.flightPathLine = new THREE.Line(geometry, material);
    this.flightPathLine.frustumCulled = false;
    this.group.add(this.flightPathLine);
  }

  clearFlightPath(): void {
    if (this.flightPathLine) {
      this.group.remove(this.flightPathLine);
      this.flightPathLine.geometry.dispose();
      this.flightPathLine = null;
    }
    this.selectedHex = null;
  }

  /** Re-project flight path periodically as the aircraft moves */
  updateFlightPath(aircraft: Aircraft[]): void {
    if (!this.selectedHex) return;
    const now = performance.now();
    if (now - this.lastFlightPathUpdate < 1000) return;

    const ac = aircraft.find(a => a.hex === this.selectedHex);
    if (ac) {
      this.showFlightPath(ac);
    } else {
      this.clearFlightPath();
    }
  }

  /** Great-circle forward projection */
  private projectForward(
    latDeg: number,
    lonDeg: number,
    bearingRad: number,
    distKm: number
  ): { lat: number; lon: number } {
    const R = 6371;
    const lat1 = THREE.MathUtils.degToRad(latDeg);
    const lon1 = THREE.MathUtils.degToRad(lonDeg);
    const angDist = distKm / R;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angDist) +
      Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearingRad)
    );
    const lon2 = lon1 + Math.atan2(
      Math.sin(bearingRad) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    );

    return {
      lat: THREE.MathUtils.radToDeg(lat2),
      lon: THREE.MathUtils.radToDeg(lon2),
    };
  }

  /** Fetch aircraft near the camera's look-at point */
  private async fetchVisible(): Promise<Aircraft[]> {
    const globeR = getGlobeRadius();

    // Ray-sphere intersection to find where the camera is looking on the globe
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const ray = new THREE.Ray(this.camera.position.clone(), dir);
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), globeR);
    const hit = new THREE.Vector3();

    let lat = 40.0;
    let lon = -74.0;
    if (ray.intersectSphere(sphere, hit)) {
      const geo = worldToGeo(hit);
      lat = geo.lat;
      lon = geo.lon;
    }

    // Radius based on altitude ratio (uses ellipsoid-correct altitude)
    const altitudeM = getAltitudeMeters(this.camera.position);
    const altitudeRatio = altitudeM / globeR;
    const radiusNm = Math.min(500, Math.max(50, altitudeRatio * 300));

    return fetchAircraft(lat, lon, radiusNm);
  }

  private onAircraftData(data: Aircraft[]): void {
    // Store previous target positions as prev
    this.prevPositions = new Map(this.targetPositions);

    // Compute new target positions
    this.targetPositions.clear();
    for (const ac of data) {
      const altKm = (ac.alt_baro || ac.alt_geom || 10000) * FEET_TO_KM;
      const pos = geoToWorld(ac.lat, ac.lon, altKm);
      this.targetPositions.set(ac.hex, pos);
    }

    this.aircraftData = data;
    this.lastUpdateTime = performance.now();
  }
}
