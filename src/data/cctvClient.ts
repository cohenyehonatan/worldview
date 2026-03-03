export interface CCTVCamera {
  id: string;
  name: string;
  lat: number;
  lon: number;
  imageUrl: string;
  source: 'nyctmc' | 'tfl' | 'caltrans' | 'windy';
  /** Windy webcam numeric ID (for token refresh) */
  windyId?: number;
}

/** Source-specific refresh intervals in ms */
export const SOURCE_REFRESH_MS: Record<CCTVCamera['source'], number> = {
  nyctmc: 2000,             // ~2s real-time
  tfl: 5 * 60 * 1000,      // ~5 min
  caltrans: 5 * 60 * 1000, // ~3-20 min
  windy: 8 * 60 * 1000,    // image tokens expire at 10 min, refresh at 8
};

// Cache combined results (camera positions rarely change)
let cache: { data: CCTVCamera[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---- Windy Webcams (Global, ~50k cameras) ----

const WINDY_API_KEY = import.meta.env.VITE_WINDY_API_KEY as string | undefined;
const WINDY_BASE = 'https://api.windy.com/webcams/api/v3/webcams';

async function fetchWindyCameras(): Promise<CCTVCamera[]> {
  if (!WINDY_API_KEY) return [];

  const headers = { 'x-windy-api-key': WINDY_API_KEY };
  const pageSize = 50;
  const maxPages = 10; // 500 cameras global

  const fetches = Array.from({ length: maxPages }, (_, i) =>
    fetch(
      `${WINDY_BASE}?include=images,location&limit=${pageSize}&offset=${i * pageSize}`,
      { headers }
    ).then((r) => {
      if (!r.ok) throw new Error(`Windy: ${r.status}`);
      return r.json();
    })
  );

  const results = await Promise.allSettled(fetches);
  const cameras: CCTVCamera[] = [];

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const webcams = result.value.webcams || result.value || [];
    if (!Array.isArray(webcams)) continue;
    for (const wc of webcams) {
      if (wc.status !== 'active') continue;
      const imageUrl = wc.images?.current?.preview;
      if (!imageUrl || !wc.location) continue;

      cameras.push({
        id: `windy-${wc.webcamId}`,
        name: wc.title || 'Windy Webcam',
        lat: wc.location.latitude,
        lon: wc.location.longitude,
        imageUrl,
        source: 'windy',
        windyId: wc.webcamId,
      });
    }
  }
  return cameras;
}

/** Re-fetch a fresh image URL for a Windy camera (tokens expire after 10 min) */
export async function refreshWindyImageUrl(
  webcamId: number
): Promise<string | null> {
  if (!WINDY_API_KEY) return null;
  try {
    const resp = await fetch(`${WINDY_BASE}/${webcamId}?include=images`, {
      headers: { 'x-windy-api-key': WINDY_API_KEY },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.images?.current?.preview ?? null;
  } catch {
    return null;
  }
}

// ---- NYC TMC (New York City, ~2s refresh) ----

interface NycTmcCamera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  isOnline: string;
  imageUrl: string;
}

async function fetchNycTmcCameras(): Promise<CCTVCamera[]> {
  const resp = await fetch('/api/nyctmc/api/cameras');
  if (!resp.ok) throw new Error(`NYC TMC API error: ${resp.status}`);
  const entries: NycTmcCamera[] = await resp.json();

  const cameras: CCTVCamera[] = [];
  for (const entry of entries) {
    if (entry.isOnline !== 'true') continue;
    if (!entry.latitude || !entry.longitude) continue;

    cameras.push({
      id: `nyctmc-${entry.id}`,
      name: entry.name || 'NYC Camera',
      lat: entry.latitude,
      lon: entry.longitude,
      // Proxy the image URL through our Vite dev server
      imageUrl: `/api/nyctmc/api/cameras/${entry.id}/image`,
      source: 'nyctmc',
    });
  }
  return cameras;
}

// ---- TfL JamCams (London) ----

interface TflPlace {
  id: string;
  commonName: string;
  lat: number;
  lon: number;
  additionalProperties: { key: string; value: string }[];
}

async function fetchTflCameras(): Promise<CCTVCamera[]> {
  const resp = await fetch('/api/tfl/Place/Type/JamCam');
  if (!resp.ok) throw new Error(`TfL API error: ${resp.status}`);
  const places: TflPlace[] = await resp.json();

  const cameras: CCTVCamera[] = [];
  for (const place of places) {
    const imageUrl = place.additionalProperties?.find(
      (p) => p.key === 'imageUrl'
    )?.value;
    if (!imageUrl || !place.lat || !place.lon) continue;

    cameras.push({
      id: place.id,
      name: place.commonName || 'TfL Camera',
      lat: place.lat,
      lon: place.lon,
      imageUrl,
      source: 'tfl',
    });
  }
  return cameras;
}

// ---- Caltrans CCTV (California) ----

interface CaltransCamera {
  cctv: {
    location: {
      latitude: string;
      longitude: string;
      locationName: string;
      district: string;
      route: string;
    };
    inService: string;
    imageData: {
      static?: {
        currentImageURL: string;
      };
    };
  };
}

interface CaltransResponse {
  data: Record<string, CaltransCamera>;
}

async function fetchCaltransCameras(): Promise<CCTVCamera[]> {
  // Fetch all 12 Caltrans districts in parallel
  const districts = Array.from({ length: 12 }, (_, i) => i + 1);
  const results = await Promise.allSettled(
    districts.map(async (d) => {
      const dd = String(d).padStart(2, '0');
      const resp = await fetch(
        `/api/caltrans/data/d${d}/cctv/cctvStatusD${dd}.json`
      );
      if (!resp.ok) throw new Error(`Caltrans D${d}: ${resp.status}`);
      const json: CaltransResponse = await resp.json();
      return json;
    })
  );

  const cameras: CCTVCamera[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const entries = Object.values(result.value.data || {});
    for (const entry of entries) {
      try {
        const loc = entry.cctv?.location;
        const imgData = entry.cctv?.imageData?.static;
        if (!loc || !imgData?.currentImageURL) continue;
        if (entry.cctv.inService !== 'true') continue;

        const lat = parseFloat(loc.latitude);
        const lon = parseFloat(loc.longitude);
        if (isNaN(lat) || isNaN(lon)) continue;

        cameras.push({
          id: `caltrans-d${loc.district}-${loc.route}-${lat.toFixed(4)}`,
          name: loc.locationName || `Caltrans ${loc.route}`,
          lat,
          lon,
          imageUrl: imgData.currentImageURL,
          source: 'caltrans',
        });
      } catch {
        // Skip malformed entries
      }
    }
  }
  return cameras;
}

// ---- Combined fetch ----

export async function fetchAllCameras(): Promise<CCTVCamera[]> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  const results = await Promise.allSettled([
    fetchNycTmcCameras(),
    fetchTflCameras(),
    fetchCaltransCameras(),
    fetchWindyCameras(),
  ]);

  const combined: CCTVCamera[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const cam of result.value) {
      if (!seen.has(cam.id)) {
        seen.add(cam.id);
        combined.push(cam);
      }
    }
  }

  cache = { data: combined, timestamp: Date.now() };
  console.log(`[CCTV] Fetched ${combined.length} cameras`);
  return combined;
}
