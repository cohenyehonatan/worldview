import * as THREE from 'three';

// Earth radius in the scene (arbitrary units — we use 1.0 for the globe radius)
export const EARTH_RADIUS = 1.0;
// Real Earth radius in km
export const EARTH_RADIUS_KM = 6371;

/**
 * Convert geodetic coordinates (lat, lon, altitude) to a Three.js Vector3.
 * Latitude and longitude in degrees, altitude in km above Earth surface.
 */
export function geoToWorld(
  latDeg: number,
  lonDeg: number,
  altitudeKm: number = 0
): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  const r = EARTH_RADIUS + (altitudeKm / EARTH_RADIUS_KM) * EARTH_RADIUS;

  return new THREE.Vector3(
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.sin(lat),
    r * Math.cos(lat) * Math.sin(lon)
  );
}

/**
 * Convert a Three.js Vector3 back to geodetic coordinates.
 * Returns { lat, lon, altitudeKm } with lat/lon in degrees.
 */
export function worldToGeo(pos: THREE.Vector3): {
  lat: number;
  lon: number;
  altitudeKm: number;
} {
  const r = pos.length();
  const lat = THREE.MathUtils.radToDeg(Math.asin(pos.y / r));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(pos.z, pos.x));
  const altitudeKm = ((r - EARTH_RADIUS) / EARTH_RADIUS) * EARTH_RADIUS_KM;
  return { lat, lon, altitudeKm };
}
