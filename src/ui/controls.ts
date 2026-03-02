import type { ShaderPipeline, ViewMode } from '../shaders/pipeline';
import type { HUDOverlay } from '../hud/overlay';
import type { AircraftLayer } from '../layers/aircraft';
import type { SatelliteLayer } from '../layers/satellites';

export function setupKeyboardControls(
  pipeline: ShaderPipeline,
  hud: HUDOverlay,
  _aircraftLayer: AircraftLayer,
  _satelliteLayer: SatelliteLayer
): void {
  window.addEventListener('keydown', (e) => {
    switch (e.key) {
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
      case 'h':
      case 'H':
        hud.toggle();
        break;
    }
  });

  function setMode(mode: ViewMode): void {
    pipeline.setMode(mode);
    hud.setMode(mode);
  }
}
