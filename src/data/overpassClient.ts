const BASE_URL = '/api/overpass/api/interpreter';

export interface RoadCoord {
  lat: number;
  lon: number;
}

export type HighwayClass =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary';

export interface RoadSegment {
  id: number;
  highway: HighwayClass;
  coords: RoadCoord[];
}

// Cache: bbox key → road segments
const cache = new Map<string, { data: RoadSegment[]; time: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function bboxKey(
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number
): string {
  return `${minLat.toFixed(3)},${minLon.toFixed(3)},${maxLat.toFixed(3)},${maxLon.toFixed(3)}`;
}

const HIGHWAY_CLASSES = new Set<string>([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
]);

export async function fetchRoads(
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number
): Promise<RoadSegment[]> {
  const key = bboxKey(minLat, minLon, maxLat, maxLon);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.data;
  }

  const query = `[out:json][timeout:25];way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${minLat},${minLon},${maxLat},${maxLon});out geom;`;

  const resp = await fetch(BASE_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!resp.ok) {
    throw new Error(`Overpass API error: ${resp.status}`);
  }

  const json = await resp.json();
  const segments: RoadSegment[] = [];

  for (const el of json.elements || []) {
    if (el.type !== 'way' || !el.geometry || !el.tags?.highway) continue;
    if (!HIGHWAY_CLASSES.has(el.tags.highway)) continue;

    const coords: RoadCoord[] = el.geometry.map(
      (node: { lat: number; lon: number }) => ({
        lat: node.lat,
        lon: node.lon,
      })
    );

    if (coords.length >= 2) {
      segments.push({
        id: el.id,
        highway: el.tags.highway as HighwayClass,
        coords,
      });
    }
  }

  cache.set(key, { data: segments, time: Date.now() });
  return segments;
}
