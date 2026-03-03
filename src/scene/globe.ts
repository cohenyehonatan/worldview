import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import {
  GoogleCloudAuthPlugin,
  GLTFExtensionsPlugin,
  TilesFadePlugin,
  TileCompressionPlugin,
} from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { EARTH_RADIUS } from '../utils/geo';

const GOOGLE_TILES_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';

export interface GlobeResult {
  tilesRenderer: TilesRenderer | null;
  /** Fallback sphere mesh if no API key */
  fallbackMesh: THREE.Mesh | null;
}

/**
 * Create the globe. If a Google Maps API key is available, loads photorealistic
 * 3D Tiles. Otherwise falls back to a procedural textured sphere.
 */
export function createGlobe(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer
): GlobeResult {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  if (apiKey && apiKey !== 'YOUR_KEY_HERE') {
    return createGoogleTiles(scene, camera, renderer, apiKey);
  }

  console.warn(
    '[Globe] No Google API key found — using procedural globe. Set VITE_GOOGLE_MAPS_API_KEY in .env'
  );
  return { tilesRenderer: null, fallbackMesh: createProceduralGlobe(scene) };
}

function createGoogleTiles(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  apiKey: string
): GlobeResult {
  const tilesRenderer = new TilesRenderer(GOOGLE_TILES_URL);

  // Draco decoder for compressed geometry
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://unpkg.com/three@0.183.2/examples/jsm/libs/draco/gltf/');

  // KTX2 transcoder for compressed textures
  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath('https://unpkg.com/three@0.183.2/examples/jsm/libs/basis/');
  ktx2Loader.detectSupport(renderer);

  // Plugins — order matters: extensions must be registered before auth triggers loading
  tilesRenderer.registerPlugin(new GLTFExtensionsPlugin({
    dracoLoader,
    ktxLoader: ktx2Loader,
  }));
  tilesRenderer.registerPlugin(
    new GoogleCloudAuthPlugin({
      apiToken: apiKey,
      autoRefreshToken: true,
    })
  );
  tilesRenderer.registerPlugin(new TilesFadePlugin());
  tilesRenderer.registerPlugin(new TileCompressionPlugin());

  // Camera & resolution
  tilesRenderer.setCamera(camera);
  tilesRenderer.setResolutionFromRenderer(camera, renderer);

  scene.add(tilesRenderer.group);

  tilesRenderer.addEventListener('load-error', (ev: unknown) => {
    const { url, error } = ev as { url: string; error: Error };
    console.warn('[3D Tiles] Load error:', url, error.message);
  });

  tilesRenderer.addEventListener('load-root-tileset', () => {
    console.log('[3D Tiles] Root tileset loaded');
  });

  return { tilesRenderer, fallbackMesh: null };
}

// ---- Fallback procedural globe (same as before) ----

function createProceduralGlobe(scene: THREE.Scene): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 128, 64);

  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a3a2a';
  drawContinents(ctx, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(0, 255, 100, 0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 36; i++) {
    const x = (i / 36) * canvas.width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const y = (i / 18) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshPhongMaterial({
    map: texture,
    specular: new THREE.Color(0x222244),
    shininess: 15,
  });

  const globe = new THREE.Mesh(geometry, material);
  scene.add(globe);

  // Atmospheric glow
  const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.015, 64, 32);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
        gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
  });
  scene.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial));

  return globe;
}

function drawContinents(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const toXY = (lat: number, lon: number): [number, number] => [
    ((lon + 180) / 360) * w,
    ((90 - lat) / 180) * h,
  ];
  const drawLandmass = (points: [number, number][]) => {
    ctx.beginPath();
    const [sx, sy] = toXY(points[0][0], points[0][1]);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < points.length; i++) {
      const [px, py] = toXY(points[i][0], points[i][1]);
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  };

  drawLandmass([[70,-165],[72,-130],[68,-90],[60,-65],[48,-55],[30,-80],[25,-80],[25,-100],[20,-105],[15,-90],[15,-85],[30,-115],[48,-125],[55,-130],[60,-145],[65,-168]]);
  drawLandmass([[12,-75],[10,-60],[5,-50],[-5,-35],[-15,-40],[-23,-43],[-35,-55],[-45,-65],[-55,-68],[-55,-75],[-40,-73],[-18,-70],[-5,-80],[5,-77]]);
  drawLandmass([[70,-10],[72,30],[65,40],[55,40],[50,30],[45,30],[38,25],[36,-5],[43,-10],[48,-5],[55,5],[58,-5]]);
  drawLandmass([[37,-10],[35,10],[30,32],[10,42],[0,42],[-10,40],[-25,35],[-35,20],[-35,18],[-20,12],[-5,10],[5,-5],[10,-17],[15,-17],[25,-15],[35,-5]]);
  drawLandmass([[72,40],[75,100],[72,140],[65,170],[55,135],[45,130],[35,130],[22,115],[10,105],[0,100],[8,80],[25,65],[30,50],[35,35],[42,28],[45,30],[55,40],[65,40]]);
  drawLandmass([[-12,130],[-12,140],[-18,148],[-28,153],[-35,150],[-38,145],[-35,115],[-22,114],[-12,125]]);
}
