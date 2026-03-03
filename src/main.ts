import * as THREE from 'three';
import { createGlobe } from './scene/globe';
import { setupLighting } from './scene/lighting';
import { setupCamera, updateClipPlanes } from './scene/camera';
import { setTilesMode } from './utils/geo';
import { ShaderPipeline } from './shaders/pipeline';
import { AircraftLayer } from './layers/aircraft';
import { SatelliteLayer } from './layers/satellites';
import { TrafficLayer } from './layers/traffic';
import { HUDOverlay } from './hud/overlay';
import { CCTVLayer } from './layers/cctv';
import { setupKeyboardControls } from './ui/controls';

async function init() {
  // --- Renderer ---
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.getElementById('app')!.appendChild(renderer.domElement);

  // --- Scene ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000810);

  // --- Temporary camera for globe setup ---
  const tempCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1e8);

  // --- Globe (3D Tiles or fallback) ---
  const { tilesRenderer } = createGlobe(scene, tempCamera, renderer);
  const useTiles = tilesRenderer !== null;
  setTilesMode(useTiles);

  // --- Camera & Controls (depends on whether tiles are available) ---
  const { camera, updateControls } = setupCamera(renderer, tilesRenderer);

  // If tiles renderer exists, re-register the real camera
  if (tilesRenderer) {
    tilesRenderer.deleteCamera(tempCamera);
    tilesRenderer.setCamera(camera);
    tilesRenderer.setResolutionFromRenderer(camera, renderer);
  }

  // Stars background (only for fallback — tiles have their own sky)
  if (!useTiles) {
    addStars(scene);
  }

  // --- Lighting ---
  setupLighting(scene);

  // --- HUD (canvas-based, rendered in-scene) ---
  const hud = new HUDOverlay();

  // --- Shader Pipeline ---
  const pipeline = new ShaderPipeline(renderer, scene, camera);
  pipeline.setHUDScene(hud.hudScene, hud.hudCamera);

  // Handle resize
  window.addEventListener('resize', () => {
    pipeline.setSize(window.innerWidth, window.innerHeight);
    if (tilesRenderer) {
      tilesRenderer.setResolutionFromRenderer(camera, renderer);
    }
  });

  // --- Data Layers ---
  const aircraftLayer = new AircraftLayer(scene, camera);
  const satelliteLayer = new SatelliteLayer(scene, camera);
  const trafficLayer = new TrafficLayer(scene, camera);
  const cctvLayer = new CCTVLayer(scene, camera);

  // Start data feeds
  aircraftLayer.start();
  satelliteLayer.load();
  trafficLayer.start();
  cctvLayer.start();

  // --- Click to select aircraft or satellite ---
  renderer.domElement.addEventListener('click', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    // Try aircraft first
    const ac = aircraftLayer.pick(ndcX, ndcY, rect.width, rect.height);
    if (ac) {
      hud.showAircraft(ac);
      aircraftLayer.showFlightPath(ac);
      satelliteLayer.clearOrbit();
      return;
    }

    // Try satellite second
    const sat = satelliteLayer.pick(ndcX, ndcY, rect.width, rect.height);
    if (sat) {
      hud.showSatellite(sat.entry, sat.index);
      satelliteLayer.showOrbit(sat.index);
      aircraftLayer.clearFlightPath();
      return;
    }

    // Try CCTV third
    const cam = cctvLayer.pick(ndcX, ndcY, rect.width, rect.height);
    if (cam) {
      hud.showCamera(cam);
      aircraftLayer.clearFlightPath();
      satelliteLayer.clearOrbit();
      return;
    }

    // Clicked empty space — close everything
    hud.closeAircraft();
    hud.closeSatellite();
    hud.closeCamera();
    satelliteLayer.clearOrbit();
    aircraftLayer.clearFlightPath();
  });

  // --- Keyboard Controls ---
  setupKeyboardControls(pipeline, hud, aircraftLayer, satelliteLayer, trafficLayer, cctvLayer);

  // --- Terrain altitude raycasting ---
  const terrainRaycaster = new THREE.Raycaster();
  const earthCenter = new THREE.Vector3(0, 0, 0);
  let cachedTerrainAltM: number | null = null;
  let lastRaycastTime = 0;

  function computeTerrainAltitude(): number | null {
    if (!tilesRenderer) return null;

    const now = performance.now();
    if (now - lastRaycastTime < 200) return cachedTerrainAltM;
    lastRaycastTime = now;

    // Cast ray from camera toward earth center
    const dir = earthCenter.clone().sub(camera.position).normalize();
    terrainRaycaster.set(camera.position, dir);

    const intersects = terrainRaycaster.intersectObject(tilesRenderer.group, true);
    if (intersects.length > 0) {
      cachedTerrainAltM = intersects[0].distance;
    }

    return cachedTerrainAltM;
  }

  // --- Animation Loop ---
  function animate() {
    requestAnimationFrame(animate);

    updateControls();
    updateClipPlanes(camera);

    if (tilesRenderer) {
      camera.updateMatrixWorld();
      tilesRenderer.update();
    }

    aircraftLayer.update();
    hud.updateAircraftData(aircraftLayer.getAircraftData());
    aircraftLayer.updateFlightPath(aircraftLayer.getAircraftData());
    satelliteLayer.update();
    trafficLayer.update();
    cctvLayer.update();

    // Feed live satellite position to HUD panel
    const satIdx = hud.getSelectedSatelliteIndex();
    if (satIdx >= 0) {
      hud.updateSatellitePosition(satelliteLayer.getSatPosition(satIdx));
    }

    // Sync orbit/path with panel state (handles Escape cleanup)
    if (!hud.isSatellitePanelOpen() && satelliteLayer.getSelectedIndex() >= 0) {
      satelliteLayer.clearOrbit();
    }
    if (!hud.isAircraftPanelOpen()) {
      aircraftLayer.clearFlightPath();
    }

    const terrainAltM = computeTerrainAltitude();
    hud.update(
      camera,
      aircraftLayer.getAircraftData().length,
      satelliteLayer.getSatellites().length,
      trafficLayer.getParticleCount(),
      terrainAltM,
      cctvLayer.getCameras().length
    );

    pipeline.render();
  }

  animate();

  console.log(
    '%c[WorldView] Initialized' + (useTiles ? ' with Google 3D Tiles' : ' (fallback mode)'),
    'color: #00ff66; font-weight: bold;'
  );
  console.log(
    '%cControls: [1] Normal [2] NVG [3] FLIR [4] CRT [H] HUD [C] CCTV',
    'color: #888;'
  );
}

function addStars(scene: THREE.Scene): void {
  const starsGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(3000 * 3);

  for (let i = 0; i < 3000; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 50 + Math.random() * 50;

    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = r * Math.cos(phi);
  }

  starsGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(starPositions, 3)
  );

  const starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.1,
    transparent: true,
    opacity: 0.8,
  });

  scene.add(new THREE.Points(starsGeometry, starsMaterial));
}

init();
