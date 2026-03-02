import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EARTH_RADIUS } from '../utils/geo';

export function setupCamera(
  renderer: THREE.WebGLRenderer
): { camera: THREE.PerspectiveCamera; controls: OrbitControls } {
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.001,
    100
  );
  camera.position.set(0, 0, 3);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = EARTH_RADIUS * 1.05;
  controls.maxDistance = EARTH_RADIUS * 10;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 1.0;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { camera, controls };
}
