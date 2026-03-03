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

// tle.ivanstanojevic.me — free TLE API with CORS support (no proxy needed)
const BASE_URL = 'https://tle.ivanstanojevic.me/api/tle';

interface TleApiEntry {
  satelliteId: number;
  name: string;
  date: string;
  line1: string;
  line2: string;
}

interface TleApiResponse {
  totalItems: number;
  member: TleApiEntry[];
}

// Cache TLE data (it only updates every ~2 hours)
const cache = new Map<string, { data: SatelliteOMM[]; timestamp: number }>();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Convert TLE API entry to our SatelliteOMM interface */
function toOMM(entry: TleApiEntry): SatelliteOMM {
  const name = entry.name.toUpperCase();
  const isMil =
    name.includes('USA ') ||
    name.includes('NOSS') ||
    name.includes('MILSTAR') ||
    name.includes('AEHF') ||
    name.includes('WGS') ||
    name.includes('SBIRS') ||
    name.includes('MUOS') ||
    name.includes('DSP');

  return {
    OBJECT_NAME: entry.name,
    OBJECT_ID: String(entry.satelliteId),
    EPOCH: entry.date,
    NORAD_CAT_ID: entry.satelliteId,
    CLASSIFICATION_TYPE: isMil ? 'C' : 'U',
    TLE_LINE1: entry.line1,
    TLE_LINE2: entry.line2,
    // These fields aren't used for propagation (satellite.js reads TLE lines directly)
    MEAN_MOTION: 0,
    ECCENTRICITY: 0,
    INCLINATION: 0,
    RA_OF_ASC_NODE: 0,
    ARG_OF_PERICENTER: 0,
    MEAN_ANOMALY: 0,
    EPHEMERIS_TYPE: 0,
    ELEMENT_SET_NO: 0,
    REV_AT_EPOCH: 0,
    BSTAR: 0,
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
  };
}

/**
 * Fetch satellites matching a search query from the TLE API.
 */
async function fetchBySearch(
  query: string,
  pageSize: number = 50
): Promise<SatelliteOMM[]> {
  const cached = cache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${BASE_URL}/?search=${encodeURIComponent(query)}&page_size=${pageSize}&sort=popularity&sort-dir=desc`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`TLE API error: ${resp.status}`);
  const json: TleApiResponse = await resp.json();
  const data = json.member.map(toOMM);

  cache.set(query, { data, timestamp: Date.now() });
  return data;
}

/**
 * Fetch several key satellite groups at once.
 */
export async function fetchKeySatellites(): Promise<SatelliteOMM[]> {
  // Search queries that approximate the old CelesTrak groups
  const searches: [string, number][] = [
    ['ISS', 10],        // Space stations
    ['GPS', 40],        // GPS constellation
    ['STARLINK', 80],   // Visible constellation satellites
    ['IRIDIUM', 30],    // Iridium constellation
    ['COSMOS', 30],     // Russian military/civil
    ['USA', 30],        // US military
    ['NOAA', 10],       // Weather satellites
    ['LANDSAT', 5],     // Earth observation
    ['HUBBLE', 3],      // Iconic satellites
  ];

  const results = await Promise.allSettled(
    searches.map(([query, size]) => fetchBySearch(query, size))
  );

  // Deduplicate by NORAD_CAT_ID
  const seen = new Set<number>();
  const combined: SatelliteOMM[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const sat of result.value) {
      if (!seen.has(sat.NORAD_CAT_ID)) {
        seen.add(sat.NORAD_CAT_ID);
        combined.push(sat);
      }
    }
  }

  console.log(`[Satellites] Fetched ${combined.length} satellites from TLE API`);
  return combined;
}

// Keep the old export for backwards compatibility
export { fetchBySearch as fetchSatelliteGroup };
