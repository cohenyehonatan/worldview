# WorldView — Master Plan

> Inspired by the original WorldView by Bilawal Sidhu (ex-Google Maps PM).
> Goal: feature parity and beyond — a real-time geospatial intelligence dashboard
> fusing satellite tracking, flight data, CCTV, traffic, and seismic activity
> against Google's 3D tiles, styled like a classified intelligence system.

---

## Feature Comparison

| # | Feature | Original | Ours | Status |
|---|---------|----------|------|--------|
| 1 | 3D Tiles globe (Google Photorealistic) | Yes | Yes | DONE |
| 2 | Shader modes (CRT, NVG, FLIR) | Yes | Yes | DONE |
| 3 | Shader control panel (sensitivity, pixelation, bloom, sharpen, LUTs) | Yes | No | TODO |
| 4 | Satellite tracking (real-time positions, orbit visualization) | Yes | Yes | DONE |
| 5 | Satellite coverage footprint (cone + ring) | Unknown | Yes | DONE |
| 6 | Satellite color-coding (military/station/default) | Unknown | Yes | DONE |
| 7 | Detection mode (sparse/full labels on tracked objects) | Yes | No | TODO |
| 8 | Live flight data | Yes (OpenSky, ~6.7K) | Yes (ADS-B, ~2K) | DONE (lower count) |
| 9 | Military flight tracking | Yes (color + filter/isolate) | Partial (color only) | PARTIAL |
| 10 | City/landmark jumping (Q/W/E/R/T hotkeys) | Yes | No | TODO |
| 11 | OSM 3D volume centering for POIs | Yes | No | TODO |
| 12 | Street traffic particle system (OSM roads) | Yes | Yes | DONE |
| 13 | Real-time CCTV cameras | Yes (Austin, TX) | Yes (NYC, London, California, global/Windy) | DONE (more sources) |
| 14 | CCTV projected onto 3D building geometry | Yes | No (HUD panel only) | TODO |
| 15 | Camera calibration for CCTV projection | In progress (his words) | No | TODO |
| 16 | Earthquake/seismic activity layer | Yes | No | TODO |
| 17 | Post-processing controls (bloom amount, sharpen, LUTs) | Yes | No (bloom hardcoded for NVG) | TODO |
| 18 | Shot planning / content creation tools | Yes | No | TODO |
| 19 | HUD overlay (heading, altitude, coords, reticle) | Unknown | Yes | DONE |
| 20 | Click-to-inspect panels (aircraft, satellite, CCTV) | Unknown | Yes | DONE |
| 21 | Layer toggle hotkeys (A/S/T/C/H) | Unknown | Yes | DONE |
| 22 | Flight path projection | Unknown | Yes | DONE |

---

## Completed Milestones

### M1: 3D Globe Foundation
- Google Photorealistic 3D Tiles via `3d-tiles-renderer`
- Fallback wireframe globe when no API key
- Orbit controls, dynamic near/far clip planes
- Stars background (fallback mode)

### M2: Shader Pipeline
- `postprocessing` EffectComposer with modular passes
- Night Vision (green phosphor, scan lines, vignette, grain)
- Thermal/FLIR (white-hot, black-hot, ironbow palettes, Sobel edge detection)
- CRT (barrel distortion, chromatic aberration, scan lines, flicker)
- Bloom pass (NVG/FLIR phosphor glow)
- SMAA anti-aliasing
- HUD renders through shader pipeline (effects apply to HUD too)

### M3: HUD Overlay
- Canvas-based HUD rendered as Three.js texture (shader-affected)
- Reticle with crosshair, mil-dots, concentric rings
- Top bar: UTC time, heading, mode indicator
- Side: altitude (terrain-relative when available)
- Bottom: coordinates, data counts (AC/SAT/TFC/CAM), control hints
- Theme colors adapt to active shader mode

### M4: Live Aircraft Layer
- ADS-B Exchange API, viewport-aware fetching
- InstancedMesh cone geometry (up to 2,000 aircraft)
- Interpolated positions between polls (5s interval)
- Military aircraft highlighted in red
- Click-to-inspect panel (callsign, reg, type, ICAO, squawk, alt, speed, heading, V/S, lat/lon)
- Projected flight path (5-min great-circle projection)
- Dynamic scale based on camera altitude

### M5: Satellite Layer
- CelesTrak OMM data (~300 key satellites)
- SGP4/SDP4 propagation via `satellite.js`
- Real-time position updates each frame
- Click to show orbit path (180 points)
- Coverage footprint visualization (filled cone + ring line)
- Color-coded by type: green (stations), red (military/classified), blue (default)
- Info panel: NORAD ID, classification, epoch, altitude, velocity, lat/lon

### M6: Traffic Layer
- Overpass API (OSM road network) — viewport-aware bbox queries
- Particle system (up to 5,000 particles) on road segments
- Speed varies by road class (motorway→tertiary: 120→35 km/h)
- Color-coded by road class (green→orange gradient)
- Density-weighted distribution (more particles on major roads)
- Auto-fetches when camera moves significantly, clears when zoomed out

### M7: CCTV Camera Layer
- 4 data sources: NYC TMC (~950), TfL JamCams (~900), Caltrans (~2,900), Windy Webcams (~500)
- ~5,200+ cameras worldwide as cyan dots on globe
- Per-source refresh rates: NYC 2s, TfL/Caltrans 5min, Windy 8min
- Click-to-inspect panel with live image preview, "LIVE" indicator
- Flicker-free image refresh (preserves previous frame during reload)
- Windy token refresh for expiring image URLs
- Vite CORS proxies for all 4 APIs

---

## Upcoming Milestones (Toward Feature Parity)

### M8: Earthquake / Seismic Activity Layer
**What the original has:** Earthquake markers across the globe showing recent seismic activity.

**Data source:** USGS Earthquake Hazards API (free, no auth)
- `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson` — all earthquakes in the last 24h
- Also available: last hour, last 7 days, last 30 days, and by magnitude threshold (1.0+, 2.5+, 4.5+, significant)
- Returns GeoJSON with magnitude, depth, location, time, felt reports

**Implementation:**
- New `src/data/usgsClient.ts` — fetch + parse GeoJSON, normalize to `Earthquake` interface
- New `src/layers/earthquakes.ts` — Points mesh, color/size by magnitude (yellow→orange→red, larger = higher mag)
- Poller with ~5min interval
- Click-to-inspect panel: magnitude, depth, location name, time, felt reports
- Toggle with `E` key
- Pulsing/scaling animation for recent events (< 1hr old)

### M9: Military Flight Isolation / Filtering
**What the original has:** Ability to filter to show ONLY military flights, isolating them from civilian traffic.

**Implementation:**
- Add filter state to `AircraftLayer`: `'all' | 'military' | 'civilian'`
- New hotkey (e.g., `M`) to cycle filter modes
- When filtering, skip non-matching aircraft in `update()` and `pick()`
- HUD indicator showing current filter mode
- Flight count in bottom bar reflects filtered count

### M10: City/Landmark Jumping
**What the original has:** Q/W/E/R/T keys jump between pre-set city landmarks. Camera perfectly centers on the POI using OSM 3D volume data.

**Implementation (two parts):**

**Part A — Basic POI jumping:**
- New `src/data/pois.ts` — curated list of ~50 landmarks with lat/lon/altitude/heading
- Groups of 5 POIs per city, cycled with Q/W/E/R/T
- New `src/ui/poiJumper.ts` — smooth camera animation (TWEEN.js or manual lerp) to target position
- Number keys 5-9 or Shift+1-5 to switch active city group
- HUD indicator showing current city + POI name during transition

**Part B — OSM 3D volume centering (enhancement):**
- Query Overpass for building/landmark polygon by name
- Compute centroid + bounding box of the 3D feature
- Use that as the camera target instead of raw lat/lon
- This ensures camera centers on the actual structure, not a nearby point

### M11: Shader Control Panel
**What the original has:** GUI panel to adjust shader parameters — sensitivity, pixelation, bloom amount, sharpening, LUTs.

**Implementation:**
- New `src/ui/shaderControls.ts` — on-screen control panel (canvas-drawn or HTML overlay)
- Expose existing shader uniforms as adjustable parameters:
  - NVG: `noiseIntensity`, `scanLineIntensity`, `vignetteStrength`, brightness boost
  - FLIR: `paletteMode` (white-hot/black-hot/ironbow), `noiseIntensity`, edge detection strength
  - CRT: `curvature`, `scanLineBrightness`, `chromaticAberration`, `noiseAmount`, `flickerAmount`
  - Bloom: `intensity`, `luminanceThreshold`, `luminanceSmoothing`
- Add new effects:
  - Sharpen pass (unsharp mask or Laplacian)
  - Pixelation pass (downsample + nearest-neighbor upsample)
  - LUT pass (load 3D LUT textures for color grading)
- Toggle panel with `P` or `/` key
- Persist settings to localStorage

### M12: Detection Mode (Labels/Annotations)
**What the original has:** Toggle between "sparse" and "full" detection labels — showing IDs, callsigns, and metadata as floating text labels near tracked objects.

**Implementation:**
- New `src/hud/labels.ts` — billboard text labels rendered near data points
- Two modes: sparse (selected/nearest only) and full (all visible objects)
- Label content varies by layer:
  - Aircraft: callsign + altitude
  - Satellites: NORAD ID + name
  - CCTV: camera name
  - Earthquakes: magnitude + location
- Toggle with `D` key (off → sparse → full → off)
- Labels rendered in HUD canvas, projected from 3D world positions
- Occlusion: skip labels behind the globe
- Density management: skip overlapping labels in full mode

### M13: CCTV 3D Projection (Stretch Goal)
**What the original has:** Camera feed projected onto 3D building geometry in the scene, not just shown in a HUD panel. He mentions working on a calibration system for this.

**Implementation (complex):**
- For each camera, define a projection frustum (FOV, aspect, orientation)
- Use `THREE.ShaderMaterial` with projective texture mapping
- Project the camera image onto nearby 3D tile geometry
- Camera calibration UI: user drops correspondence points to align image → 3D
- This is the most technically challenging feature — may require:
  - Perspective-n-Point (PnP) solver for camera pose estimation
  - Custom shader for projective texturing onto tile meshes
  - Per-camera calibration data stored in JSON

### M14: Post-Processing Controls (Stretch Goal)
**What the original has:** Ability to add bloom, sharpen, LUTs as content creation tools.

**Implementation:**
- Extend M11 shader controls with a "content creation" mode
- Saveable presets (export/import JSON)
- Screen recording integration hint (MediaRecorder API)
- Filmstrip/timeline for scripting camera movements

---

## Priority Order

**High priority (core feature parity):**
1. M8 — Earthquake layer (straightforward, fills a visible gap)
2. M9 — Military flight filtering (small change, big impact)
3. M10A — City/landmark jumping (key UX feature from original)
4. M11 — Shader control panel (mentioned prominently in video)
5. M12 — Detection mode / labels (major visual feature)

**Medium priority (polish + unique features):**
6. M10B — OSM volume centering (enhancement to jumping)
7. M14 — Post-processing controls

**Lower priority (stretch goals):**
8. M13 — CCTV 3D projection (technically complex, original still WIP)

---

## Architecture Notes

```
src/
├── data/           # API clients (normalized interfaces, caching, polling)
│   ├── adsbClient.ts       # ADS-B Exchange (aircraft)
│   ├── cctvClient.ts       # NYC TMC + TfL + Caltrans + Windy (cameras)
│   ├── celestrakClient.ts  # CelesTrak (satellites)
│   ├── overpassClient.ts   # OSM Overpass (roads)
│   ├── poller.ts           # Generic poll-and-callback utility
│   └── usgsClient.ts       # [M8] USGS earthquakes
├── layers/         # Three.js visual layers (Points/InstancedMesh)
│   ├── aircraft.ts
│   ├── cctv.ts
│   ├── earthquakes.ts      # [M8]
│   ├── satellites.ts
│   └── traffic.ts
├── hud/            # Canvas-based HUD overlay
│   ├── overlay.ts
│   ├── labels.ts           # [M12] floating detection labels
│   └── styles.css
├── shaders/        # Post-processing effects
│   ├── pipeline.ts
│   ├── nightVision.ts
│   ├── thermal.ts
│   ├── crt.ts
│   ├── sharpen.ts          # [M11]
│   └── pixelate.ts         # [M11]
├── scene/          # Scene setup (globe, camera, lighting)
│   ├── globe.ts
│   ├── camera.ts
│   └── lighting.ts
├── ui/             # User interaction
│   ├── controls.ts         # Keyboard handlers
│   ├── shaderControls.ts   # [M11] GUI panel
│   └── poiJumper.ts        # [M10] city/landmark navigation
├── utils/          # Shared utilities
│   ├── geo.ts
│   ├── interpolation.ts
│   └── orbits.ts
└── main.ts         # Entry point, wiring
```

---

## What We Have That the Original Doesn't (or Didn't Show)

- **4 CCTV sources** vs his 1 (Austin, TX) — we cover NYC, London, California, and global webcams
- **Satellite coverage footprint** — filled cone + ring showing ground coverage area
- **Per-satellite color-coded orbits** — orbit line and footprint match satellite type
- **Rich HUD overlay** — reticle, heading, altitude (terrain-relative), data counts, mode-adaptive theming
- **Click-to-inspect panels** for all layer types with detailed telemetry
- **Flight path projection** — 5-minute great-circle forward projection for aircraft
- **Terrain-relative altitude** — raycasts against 3D tiles for accurate altitude above ground
