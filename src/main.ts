import * as THREE from 'three';
import { createGlobe } from './scene/globe';
import { setupLighting } from './scene/lighting';
import { setupCamera } from './scene/camera';
import { ShaderPipeline } from './shaders/pipeline';
import { AircraftLayer } from './layers/aircraft';
import { SatelliteLayer } from './layers/satellites';
import { HUDOverlay } from './hud/overlay';
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

  // Stars background
  addStars(scene);

  // --- Camera & Controls ---
  const { camera, controls } = setupCamera(renderer);

  // --- Globe ---
  createGlobe(scene);

  // --- Lighting ---
  setupLighting(scene);

  // --- Shader Pipeline ---
  const pipeline = new ShaderPipeline(renderer, scene, camera);

  // Handle resize
  window.addEventListener('resize', () => {
    pipeline.setSize(window.innerWidth, window.innerHeight);
  });

  // --- HUD ---
  const hud = new HUDOverlay();

  // --- Data Layers ---
  const aircraftLayer = new AircraftLayer(scene, camera);
  const satelliteLayer = new SatelliteLayer(scene);

  // Start data feeds
  aircraftLayer.start();
  satelliteLayer.load();

  // --- Keyboard Controls ---
  setupKeyboardControls(pipeline, hud, aircraftLayer, satelliteLayer);

  // --- Animation Loop ---
  function animate() {
    requestAnimationFrame(animate);

    controls.update();
    aircraftLayer.update();
    satelliteLayer.update();
    hud.update(
      camera,
      aircraftLayer.getAircraftData().length,
      satelliteLayer.getSatellites().length
    );

    pipeline.render();
  }

  animate();

  console.log(
    '%c[WorldView] Initialized',
    'color: #00ff66; font-weight: bold;'
  );
  console.log(
    '%cControls: [1] Normal [2] NVG [3] FLIR [4] CRT [H] Toggle HUD',
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
