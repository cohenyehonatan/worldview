import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GlobeControls } from '3d-tiles-renderer';
import type { TilesRenderer } from '3d-tiles-renderer';
import { getGlobeRadius, isTilesMode, EARTH_RADIUS } from '../utils/geo';

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls | GlobeControls;
  updateControls: () => void;
}

/**
 * Set up camera with OrbitControls (fallback mode) or GlobeControls (3D Tiles).
 */
export function setupCamera(
  renderer: THREE.WebGLRenderer,
  tilesRenderer: TilesRenderer | null
): CameraRig {
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    1,
    1e8
  );

  let controls: OrbitControls | GlobeControls;
  let updateControls: () => void;

  if (tilesRenderer) {
    // 3D Tiles mode: use GlobeControls
    // ECEF coords: X → (0°N, 0°E), Y → (0°N, 90°E), Z → North Pole
    camera.position.set(3 * 6378137, 0, 0);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.near = 1;
    camera.far = 1e8;

    const globeControls = new GlobeControls(
      tilesRenderer.group,
      camera,
      renderer.domElement,
      tilesRenderer,
    );
    globeControls.enableDamping = true;
    // Keep north up when zoomed in (property exists at runtime but missing from .d.ts)
    (globeControls as any).autoAdjustCameraRotation = true;

    // Maximum latitude the camera can orbit to (radians)
    const MAX_LAT = 85 * (Math.PI / 180);

    controls = globeControls;
    updateControls = () => {
      globeControls.update();

      // --- Enforce north-up at all zoom levels ---
      // autoAdjustCameraRotation only works in "near" mode; this covers far mode too.
      // Get current look direction, then rotate the camera around it so that
      // geographic north (ECEF +Z) projects upward on screen.
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const north = new THREE.Vector3(0, 0, 1);
      const desiredUp = north.clone().addScaledVector(forward, -north.dot(forward));
      if (desiredUp.lengthSq() > 0.001) {
        desiredUp.normalize();
        camera.up.copy(desiredUp);
        const target = camera.position.clone().add(forward);
        camera.lookAt(target);
      }

      // --- Clamp camera latitude to prevent orbiting over the poles ---
      const r = camera.position.length();
      const lat = Math.asin(THREE.MathUtils.clamp(camera.position.z / r, -1, 1));
      if (Math.abs(lat) > MAX_LAT) {
        const clampedLat = Math.sign(lat) * MAX_LAT;
        const lon = Math.atan2(camera.position.y, camera.position.x);
        camera.position.set(
          r * Math.cos(clampedLat) * Math.cos(lon),
          r * Math.cos(clampedLat) * Math.sin(lon),
          r * Math.sin(clampedLat)
        );
        // Re-orient after moving
        camera.up.set(0, 0, 1);
        camera.lookAt(0, 0, 0);
      }
    };
  } else {
    // Fallback: unit sphere with OrbitControls
    camera.position.set(0, 0, 3);
    camera.near = 0.001;
    camera.far = 100;

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.minDistance = EARTH_RADIUS * 1.001;
    orbitControls.maxDistance = EARTH_RADIUS * 10;
    orbitControls.rotateSpeed = 0.5;
    orbitControls.zoomSpeed = 1.0;

    controls = orbitControls;
    updateControls = () => {
      orbitControls.update();
    };
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { camera, controls, updateControls };
}

/**
 * Dynamically adjust near/far planes based on camera distance from the globe.
 */
export function updateClipPlanes(camera: THREE.PerspectiveCamera): void {
  if (isTilesMode()) {
    // GlobeControls handles clip planes internally
    return;
  }

  const globeR = getGlobeRadius();
  const altitude = camera.position.length() - globeR;
  camera.near = Math.max(altitude * 0.01, 0.0000001);
  camera.far = Math.max(camera.position.length() * 10, 100);
  camera.updateProjectionMatrix();
}
