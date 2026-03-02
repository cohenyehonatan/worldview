export interface SatelliteOMM {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE: number;
  CLASSIFICATION_TYPE: string;
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
  TLE_LINE0?: string;
  TLE_LINE1?: string;
  TLE_LINE2?: string;
}

const BASE_URL = 'https://celestrak.org/NORAD/elements/gp.php';

// Cache TLE data (it only updates every ~2 hours)
const cache = new Map<string, { data: SatelliteOMM[]; timestamp: number }>();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Fetch satellite data for a specific group from CelesTrak.
 */
export async function fetchSatelliteGroup(
  group: string
): Promise<SatelliteOMM[]> {
  const cached = cache.get(group);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${BASE_URL}?GROUP=${group}&FORMAT=JSON`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`CelesTrak error: ${resp.status}`);
  const data: SatelliteOMM[] = await resp.json();

  cache.set(group, { data, timestamp: Date.now() });
  return data;
}

/**
 * Fetch several key satellite groups at once.
 */
export async function fetchKeySatellites(): Promise<SatelliteOMM[]> {
  const groups = ['STATIONS', 'MILITARY', 'GPS-OPS', 'VISUAL'];
  const results = await Promise.all(groups.map(fetchSatelliteGroup));
  // Deduplicate by NORAD_CAT_ID
  const seen = new Set<number>();
  const combined: SatelliteOMM[] = [];
  for (const group of results) {
    for (const sat of group) {
      if (!seen.has(sat.NORAD_CAT_ID)) {
        seen.add(sat.NORAD_CAT_ID);
        combined.push(sat);
      }
    }
  }
  return combined;
}
