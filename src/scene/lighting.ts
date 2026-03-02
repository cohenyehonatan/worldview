import * as THREE from 'three';

export function setupLighting(scene: THREE.Scene): void {
  // Ambient light for base visibility
  const ambient = new THREE.AmbientLight(0x334466, 0.6);
  scene.add(ambient);

  // Directional "sun" light
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(5, 3, 5);
  scene.add(sun);

  // Subtle fill light from the opposite side
  const fill = new THREE.DirectionalLight(0x4466aa, 0.3);
  fill.position.set(-3, -1, -3);
  scene.add(fill);
}
