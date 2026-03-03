export interface Aircraft {
  hex: string;
  flight: string;
  lat: number;
  lon: number;
  alt_baro: number; // feet
  alt_geom: number; // feet
  gs: number; // ground speed in knots
  track: number; // heading in degrees
  baro_rate: number;
  squawk: string;
  category: string;
  type: string;
  dbFlags: number; // bit 0 = military
  seen: number;
  r: string; // registration
  t: string; // aircraft type code
}

interface AdsbResponse {
  ac: Aircraft[];
  msg: string;
  now: number;
  total: number;
}

// Proxied through Vite dev server to avoid CORS issues
const BASE_URL = '/api/adsb/v2';

/**
 * Fetch aircraft near a lat/lon within a radius (nautical miles).
 */
export async function fetchAircraft(
  lat: number,
  lon: number,
  radiusNm: number = 250
): Promise<Aircraft[]> {
  const url = `${BASE_URL}/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${radiusNm}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`adsb.lol error: ${resp.status}`);
  const data: AdsbResponse = await resp.json();
  // Filter out aircraft without position data
  return (data.ac || []).filter((ac) => ac.lat != null && ac.lon != null);
}

/**
 * Fetch only military aircraft worldwide.
 */
export async function fetchMilitaryAircraft(): Promise<Aircraft[]> {
  const url = `${BASE_URL}/mil`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`adsb.lol military error: ${resp.status}`);
  const data: AdsbResponse = await resp.json();
  return (data.ac || []).filter((ac) => ac.lat != null && ac.lon != null);
}

/** Check if an aircraft is military based on dbFlags */
export function isMilitary(ac: Aircraft): boolean {
  return (ac.dbFlags & 1) === 1;
}
