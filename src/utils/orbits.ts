import * as satellite from 'satellite.js';
import * as THREE from 'three';
import { EARTH_RADIUS, EARTH_RADIUS_KM } from './geo';
import type { SatelliteOMM } from '../data/celestrakClient';

export interface SatPosition {
  position: THREE.Vector3;
  lat: number;
  lon: number;
  altitudeKm: number;
  velocityKmS: number;
}

/**
 * Create a satellite record from OMM JSON data.
 */
export function createSatRec(omm: SatelliteOMM): satellite.SatRec | null {
  if (!omm.TLE_LINE1 || !omm.TLE_LINE2) return null;
  try {
    return satellite.twoline2satrec(omm.TLE_LINE1, omm.TLE_LINE2);
  } catch {
    return null;
  }
}

/**
 * Propagate a satellite to a given time and return its 3D position.
 */
export function propagateToDate(
  satrec: satellite.SatRec,
  date: Date
): SatPosition | null {
  const posVel = satellite.propagate(satrec, date);
  if (
    !posVel ||
    typeof posVel.position === 'boolean' ||
    !posVel.position ||
    typeof posVel.velocity === 'boolean' ||
    !posVel.velocity
  ) {
    return null;
  }

  const gmst = satellite.gstime(date);
  const posEci = posVel.position;
  const geo = satellite.eciToGeodetic(posEci, gmst);

  const latDeg = satellite.degreesLat(geo.latitude);
  const lonDeg = satellite.degreesLong(geo.longitude);
  const altKm = geo.height;

  // Convert to scene coordinates
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  const r = EARTH_RADIUS + (altKm / EARTH_RADIUS_KM) * EARTH_RADIUS;

  const position = new THREE.Vector3(
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.sin(lat),
    r * Math.cos(lat) * Math.sin(lon)
  );

  const vel = posVel.velocity;
  const velocityKmS = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);

  return { position, lat: latDeg, lon: lonDeg, altitudeKm: altKm, velocityKmS };
}

/**
 * Compute a full orbit path as an array of Vector3 points.
 */
export function computeOrbitPath(
  satrec: satellite.SatRec,
  date: Date,
  numPoints: number = 180
): THREE.Vector3[] {
  // Orbital period in minutes: 1440 / meanMotion (rev/day)
  const meanMotion = satrec.no * (1440 / (2 * Math.PI)); // rad/min -> rev/day
  const periodMinutes = 1440 / meanMotion;

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = new Date(
      date.getTime() + (i / numPoints) * periodMinutes * 60 * 1000
    );
    const pos = propagateToDate(satrec, t);
    if (pos) points.push(pos.position);
  }
  return points;
}
