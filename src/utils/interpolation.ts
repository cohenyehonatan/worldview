import * as THREE from 'three';

/**
 * Smoothly interpolate between two positions over time.
 * Returns a function that gives the interpolated position for a given t (0-1).
 */
export function lerpPosition(
  from: THREE.Vector3,
  to: THREE.Vector3,
  t: number
): THREE.Vector3 {
  return new THREE.Vector3().lerpVectors(from, to, Math.min(1, Math.max(0, t)));
}

/**
 * Interpolate an angle (in radians) taking the shortest path.
 */
export function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  // Wrap to [-PI, PI]
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return from + diff * t;
}
