import * as THREE from 'three';
import { geoToWorld } from '../utils/geo';
import {
  fetchAircraft,
  isMilitary,
  type Aircraft,
} from '../data/adsbClient';
import { Poller } from '../data/poller';
import { worldToGeo } from '../utils/geo';

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

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'aircraft-layer';
    scene.add(this.group);

    // Small cone geometry for each aircraft
    const geometry = new THREE.ConeGeometry(0.003, 0.01, 4);
    geometry.rotateX(Math.PI / 2); // Point forward along Z

    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.instancedMesh = new THREE.InstancedMesh(
      geometry,
      material,
      MAX_AIRCRAFT
    );
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.count = 0;
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

  /** Fetch aircraft near the camera's look-at point */
  private async fetchVisible(): Promise<Aircraft[]> {
    // Get the center of the camera's view on the globe
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const raycaster = new THREE.Raycaster(this.camera.position, dir);
    const intersects = raycaster.intersectObjects(
      this.scene.children.filter(
        (c) => c instanceof THREE.Mesh && c !== this.instancedMesh
      )
    );

    let lat = 40.0;
    let lon = -74.0;
    if (intersects.length > 0) {
      const geo = worldToGeo(intersects[0].point);
      lat = geo.lat;
      lon = geo.lon;
    }

    // Adjust radius based on zoom level
    const camDist = this.camera.position.length();
    const radiusNm = Math.min(500, Math.max(50, camDist * 100));

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
