import { isMilitary, type Aircraft } from '../data/adsbClient';

export class AircraftPanel {
  private el: HTMLDivElement;
  private selected: Aircraft | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'aircraft-panel';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  show(ac: Aircraft): void {
    this.selected = ac;
    this.render();
    this.el.style.display = 'block';
  }

  close(): void {
    this.selected = null;
    this.el.style.display = 'none';
  }

  isOpen(): boolean {
    return this.selected !== null;
  }

  getSelected(): Aircraft | null {
    return this.selected;
  }

  updateWith(aircraft: Aircraft[]): void {
    if (!this.selected) return;
    const updated = aircraft.find((ac) => ac.hex === this.selected!.hex);
    if (updated) {
      this.selected = updated;
      this.render();
    } else {
      this.close();
    }
  }

  private render(): void {
    const ac = this.selected;
    if (!ac) return;

    const callsign = (ac.flight || '').trim() || '---';
    const reg = ac.r || '---';
    const typeCode = ac.t || '---';
    const mil = isMilitary(ac);
    const altFt = ac.alt_baro ?? ac.alt_geom ?? 0;
    const altStr = typeof altFt === 'number' ? altFt.toLocaleString() : String(altFt);
    const gs = ac.gs != null ? `${ac.gs.toFixed(0)} kts` : '---';
    const track = ac.track != null ? `${ac.track.toFixed(0)}` : '---';
    const vRate = ac.baro_rate != null ? `${ac.baro_rate > 0 ? '+' : ''}${ac.baro_rate.toFixed(0)} ft/min` : '---';
    const squawk = ac.squawk || '---';
    const lat = ac.lat?.toFixed(4) ?? '---';
    const lon = ac.lon?.toFixed(4) ?? '---';

    const tagClass = mil ? 'panel-tag-mil' : 'panel-tag-civ';
    const tagLabel = mil ? 'MIL' : 'CIV';

    this.el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span class="panel-callsign">${callsign}</span>
        <span class="panel-tag ${tagClass}">${tagLabel}</span>
      </div>
      <div class="panel-section" style="margin-top:0;">
        <div class="panel-grid">
          <span class="panel-label">REG</span><span>${reg}</span>
          <span class="panel-label">TYPE</span><span>${typeCode}</span>
          <span class="panel-label">ICAO</span><span style="text-transform:uppercase;">${ac.hex}</span>
          <span class="panel-label">SQUAWK</span><span>${squawk}</span>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-grid">
          <span class="panel-label">ALT</span><span>${altStr} ft</span>
          <span class="panel-label">GS</span><span>${gs}</span>
          <span class="panel-label">HDG</span><span>${track}&deg;</span>
          <span class="panel-label">VS</span><span>${vRate}</span>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-grid">
          <span class="panel-label">LAT</span><span>${lat}</span>
          <span class="panel-label">LON</span><span>${lon}</span>
        </div>
      </div>
      <div class="panel-footer">ESC to close</div>
    `;
  }
}
