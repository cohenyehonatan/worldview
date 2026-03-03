import type { ShaderPipeline, ViewMode } from '../shaders/pipeline';
import type { HUDOverlay } from '../hud/overlay';
import type { AircraftLayer } from '../layers/aircraft';
import type { SatelliteLayer } from '../layers/satellites';
import type { TrafficLayer } from '../layers/traffic';

export function setupKeyboardControls(
  pipeline: ShaderPipeline,
  hud: HUDOverlay,
  aircraftLayer: AircraftLayer,
  satelliteLayer: SatelliteLayer,
  trafficLayer: TrafficLayer
): void {
  let aircraftVisible = true;
  let satelliteVisible = true;
  let trafficVisible = true;

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      // View modes
      case '1':
        setMode('normal');
        break;
      case '2':
        setMode('nvg');
        break;
      case '3':
        setMode('flir');
        break;
      case '4':
        setMode('crt');
        break;

      // HUD toggle
      case 'h':
      case 'H':
        hud.toggle();
        break;

      // Layer toggles
      case 'a':
      case 'A':
        aircraftVisible = !aircraftVisible;
        aircraftLayer.setVisible(aircraftVisible);
        break;
      case 's':
      case 'S':
        satelliteVisible = !satelliteVisible;
        satelliteLayer.setVisible(satelliteVisible);
        break;
      case 't':
      case 'T':
        trafficVisible = !trafficVisible;
        trafficLayer.setVisible(trafficVisible);
        break;
    }
  });

  function setMode(mode: ViewMode): void {
    pipeline.setMode(mode);
    hud.setMode(mode);
  }
}
