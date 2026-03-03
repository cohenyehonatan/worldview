export interface CCTVCamera {
  id: string;
  name: string;
  lat: number;
  lon: number;
  imageUrl: string;
  source: 'tfl' | 'caltrans';
}

// Cache combined results (camera positions rarely change)
let cache: { data: CCTVCamera[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
    fetchTflCameras(),
    fetchCaltransCameras(),
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
