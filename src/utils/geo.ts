import * as THREE from 'three';
import { WGS84_ELLIPSOID } from '3d-tiles-renderer';

// ---- Fallback mode: unit sphere ----
export const EARTH_RADIUS = 1.0;
export const EARTH_RADIUS_KM = 6371;

// ---- 3D Tiles mode: real WGS-84 meters ----
export const WGS84_RADIUS = 6378137; // meters (semi-major axis)

/** Whether we're in 3D Tiles mode (real meters) or fallback mode (unit sphere) */
let tilesMode = false;

export function setTilesMode(enabled: boolean): void {
  tilesMode = enabled;
}

export function isTilesMode(): boolean {
  return tilesMode;
}

// Reusable target objects (avoid allocations in hot path)
const _target = new THREE.Vector3();
const _carto = { lat: 0, lon: 0, height: 0 };

/**
 * Convert geodetic coordinates (lat, lon, altitude) to a Three.js Vector3.
 * In fallback mode: unit sphere. In tiles mode: WGS-84 ellipsoid (meters).
 */
export function geoToWorld(
  latDeg: number,
  lonDeg: number,
  altitudeKm: number = 0
): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);

  if (tilesMode) {
    const altM = altitudeKm * 1000;
    WGS84_ELLIPSOID.getCartographicToPosition(lat, lon, altM, _target);
    return _target.clone();
  }

  const r = EARTH_RADIUS + (altitudeKm / EARTH_RADIUS_KM) * EARTH_RADIUS;
  return new THREE.Vector3(
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.sin(lat),
    r * Math.cos(lat) * Math.sin(lon)
  );
}

/**
 * Convert a Three.js Vector3 back to geodetic coordinates.
 */
export function worldToGeo(pos: THREE.Vector3): {
  lat: number;
  lon: number;
  altitudeKm: number;
} {
  if (tilesMode) {
    WGS84_ELLIPSOID.getPositionToCartographic(pos, _carto);
    return {
      lat: THREE.MathUtils.radToDeg(_carto.lat),
      lon: THREE.MathUtils.radToDeg(_carto.lon),
      altitudeKm: _carto.height / 1000,
    };
  }

  const r = pos.length();
  const lat = THREE.MathUtils.radToDeg(Math.asin(pos.y / r));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(pos.z, pos.x));
  const altitudeKm = ((r - EARTH_RADIUS) / EARTH_RADIUS) * EARTH_RADIUS_KM;
  return { lat, lon, altitudeKm };
}

/**
 * Get the effective globe radius in scene units for the current mode.
 */
export function getGlobeRadius(): number {
  return tilesMode ? WGS84_RADIUS : EARTH_RADIUS;
}

/**
 * Get altitude above the surface in meters for a world-space position.
 * Uses proper ellipsoid math in tiles mode.
 */
export function getAltitudeMeters(pos: THREE.Vector3): number {
  if (tilesMode) {
    return WGS84_ELLIPSOID.getPositionElevation(pos);
  }
  return (pos.length() - EARTH_RADIUS) * EARTH_RADIUS_KM * 1000;
}
