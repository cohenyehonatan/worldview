import * as THREE from 'three';
import { geoToWorld, getGlobeRadius, getAltitudeMeters } from '../utils/geo';
import { fetchAllCameras, type CCTVCamera } from '../data/cctvClient';
import { Poller } from '../data/poller';

const MAX_CAMERAS = 3500;

export class CCTVLayer {
  private group: THREE.Group;
  private camera: THREE.PerspectiveCamera;
  private cameras: CCTVCamera[] = [];
  private pointsMesh: THREE.Points | null = null;
  private positions: Float32Array;
  private colors: Float32Array;
  private poller: Poller<CCTVCamera[]>;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'cctv-layer';
    scene.add(this.group);
    this.positions = new Float32Array(MAX_CAMERAS * 3);
    this.colors = new Float32Array(MAX_CAMERAS * 3);

    this.poller = new Poller<CCTVCamera[]>(
      () => fetchAllCameras(),
      (data) => this.onCameraData(data),
      300000 // 5 minutes — camera positions are static
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

  update(): void {
    if (!this.pointsMesh) return;
    const altitude = getAltitudeMeters(this.camera.position);
    (this.pointsMesh.material as THREE.PointsMaterial).size = Math.max(
      altitude * 0.006,
      0.8
    );
  }

  getCameras(): CCTVCamera[] {
    return this.cameras;
  }

  pick(
    ndcX: number,
    ndcY: number,
    canvasWidth: number,
    canvasHeight: number,
    thresholdPx: number = 30
  ): CCTVCamera | null {
    if (this.cameras.length === 0) return null;

    const projected = new THREE.Vector3();
    let bestDist = Infinity;
    let bestCam: CCTVCamera | null = null;

    for (let i = 0; i < this.cameras.length; i++) {
      const wx = this.positions[i * 3];
      const wy = this.positions[i * 3 + 1];
      const wz = this.positions[i * 3 + 2];
      if (wx === 0 && wy === 0 && wz === 0) continue;

      projected.set(wx, wy, wz).project(this.camera);
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
        bestCam = this.cameras[i];
      }
    }

    return bestDist <= thresholdPx ? bestCam : null;
  }

  private onCameraData(data: CCTVCamera[]): void {
    this.cameras = data;

    const cyan = new THREE.Color(0.0, 0.85, 1.0);

    for (let i = 0; i < data.length && i < MAX_CAMERAS; i++) {
      const cam = data[i];
      const pos = geoToWorld(cam.lat, cam.lon, 0.005);
      this.positions[i * 3] = pos.x;
      this.positions[i * 3 + 1] = pos.y;
      this.positions[i * 3 + 2] = pos.z;
      this.colors[i * 3] = cyan.r;
      this.colors[i * 3 + 1] = cyan.g;
      this.colors[i * 3 + 2] = cyan.b;
    }

    if (!this.pointsMesh) {
      this.createPointsMesh();
    }

    const geom = this.pointsMesh!.geometry;
    geom.setDrawRange(0, Math.min(data.length, MAX_CAMERAS));
    geom.attributes.position.needsUpdate = true;
    geom.attributes.color.needsUpdate = true;
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
    geometry.setDrawRange(0, this.cameras.length);

    const material = new THREE.PointsMaterial({
      size: 0.006 * getGlobeRadius(),
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });

    this.pointsMesh = new THREE.Points(geometry, material);
    this.pointsMesh.frustumCulled = false;
    this.group.add(this.pointsMesh);
  }
}
