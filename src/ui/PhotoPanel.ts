/**
 * Photo-mode panel: FOV, roll, depth of field (auto-focus on the hero or manual distance), time of day,
 * colour filter, hide-UI. Plain DOM, bottom of the screen, never blocks the view centre.
 */
export type PhotoFilter = 'natural' | 'golden' | 'noir' | 'vivid' | 'comic';

export interface PhotoValues {
  fov: number;
  roll: number;
  aperture: number;
  autoFocus: boolean;
  focusDist: number;
  hour: number;
  filter: PhotoFilter;
}

export interface PhotoPanelHooks {
  onChange(v: PhotoValues): void;
  onExit(): void;
}

const CSS = `
.photo { position: fixed; left: 50%; bottom: 2.6vh; transform: translateX(-50%); z-index: 28; color: #fff; display: none;
  font-family: 'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size: 12px; letter-spacing: .06em; }
.photo.show { display: block; }
.photo .box { display: grid; grid-template-columns: repeat(4, minmax(120px, 170px)); gap: 8px 18px; padding: 12px 16px 10px;
  background: rgba(6,20,48,.62); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
.photo label { display: block; opacity: .8; font-size: 10.5px; letter-spacing: .18em; margin-bottom: 3px; }
.photo label span { float: right; opacity: .9; letter-spacing: .04em; }
.photo input[type=range] { width: 100%; accent-color: #f5c542; }
.photo select { width: 100%; background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.2); border-radius: 6px; padding: 3px 5px; font: inherit; }
.photo select option { color: #000; }
.photo .chk { display: flex; align-items: center; gap: 6px; margin-top: 6px; cursor: pointer; }
.photo .title { position: absolute; left: 0; right: 0; top: -26px; text-align: center; font-weight: 800; letter-spacing: .4em; font-size: 12px; color: #f5c542;
  text-shadow: 0 1px 3px rgba(0,0,0,.6); }
.photo .keys { margin-top: 8px; text-align: center; opacity: .72; font-size: 11px; letter-spacing: .08em; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
.photo.bare .box, .photo.bare .title, .photo.bare .keys { display: none; }
`;

export class PhotoPanel {
  readonly el: HTMLDivElement;
  private readonly hooks: PhotoPanelHooks;
  readonly values: PhotoValues = { fov: 50, roll: 0, aperture: 0.45, autoFocus: true, focusDist: 12, hour: 10.5, filter: 'natural' };
  private inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};
  private outs: Record<string, HTMLSpanElement> = {};
  private visible = false;
  private bare = false;

  constructor(parent: HTMLElement, hooks: PhotoPanelHooks) {
    this.hooks = hooks;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.className = 'photo';
    this.el.innerHTML = `<div class="title">PHOTO MODE</div><div class="box">
      ${this.slider('fov', 'FIELD OF VIEW', 12, 100, 1)}
      ${this.slider('roll', 'ROLL', -35, 35, 1)}
      ${this.slider('aperture', 'DEPTH OF FIELD', 0, 1, 0.01)}
      <div>${this.sliderInner('focusDist', 'FOCUS', 0, 1, 0.001)}<label class="chk"><input type="checkbox" data-k="autoFocus"> AUTO-FOCUS ON HERO</label></div>
      ${this.slider('hour', 'TIME OF DAY', 0, 23.99, 0.05)}
      <div><label>FILTER</label><select data-k="filter">
        <option value="natural">NATURAL</option><option value="golden">GOLDEN</option><option value="vivid">VIVID</option>
        <option value="comic">COMIC</option><option value="noir">NOIR</option></select></div>
      </div>
      <div class="keys">WASD MOVE · SPACE / C UP / DOWN · SHIFT FAST · DRAG TO LOOK · WHEEL ZOOM · H HIDE PANEL · P / ESC EXIT</div>`;
    parent.appendChild(this.el);
    for (const el of this.el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]')) {
      const k = el.dataset.k!;
      this.inputs[k] = el;
      const out = this.el.querySelector<HTMLSpanElement>(`span[data-o="${k}"]`);
      if (out) this.outs[k] = out;
      el.addEventListener('input', () => this.read());
      el.addEventListener('change', () => this.read());
      // Keep WASD for the camera, not the focused control.
      el.addEventListener('keydown', (e) => {
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC'].includes((e as KeyboardEvent).code)) (e.target as HTMLElement).blur();
      });
    }
    window.addEventListener('keydown', (e) => {
      if (!this.visible) return;
      if (e.code === 'KeyH') this.setBare(!this.bare);
    });
  }

  private sliderInner(k: string, label: string, min: number, max: number, step: number): string {
    return `<label>${label}<span data-o="${k}"></span></label><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}">`;
  }

  private slider(k: string, label: string, min: number, max: number, step: number): string {
    return `<div>${this.sliderInner(k, label, min, max, step)}</div>`;
  }

  /** Focus slider is logarithmic 0.5 m … 2 km. */
  private static focusToSlider(d: number): number {
    return Math.log(d / 0.5) / Math.log(4000);
  }

  private static sliderToFocus(s: number): number {
    return 0.5 * Math.pow(4000, s);
  }

  private read(): void {
    const v = this.values;
    const num = (k: string) => Number((this.inputs[k] as HTMLInputElement).value);
    v.fov = num('fov');
    v.roll = num('roll');
    v.aperture = num('aperture');
    v.focusDist = PhotoPanel.sliderToFocus(num('focusDist'));
    v.hour = num('hour');
    v.autoFocus = (this.inputs.autoFocus as HTMLInputElement).checked;
    v.filter = (this.inputs.filter as HTMLSelectElement).value as PhotoFilter;
    this.paintOuts();
    this.hooks.onChange(v);
  }

  private paintOuts(): void {
    const v = this.values;
    const h = Math.floor(v.hour);
    const m = Math.floor((v.hour - h) * 60);
    const set = (k: string, t: string) => {
      if (this.outs[k]) this.outs[k]!.textContent = t;
    };
    set('fov', `${Math.round(v.fov)}°`);
    set('roll', `${Math.round(v.roll)}°`);
    set('aperture', v.aperture < 0.01 ? 'OFF' : `${Math.round(v.aperture * 100)}%`);
    set('focusDist', v.autoFocus ? 'AUTO' : v.focusDist < 100 ? `${v.focusDist.toFixed(1)} m` : `${Math.round(v.focusDist)} m`);
    set('hour', `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }

  /** Push values (e.g. from the camera on entry) into the controls. */
  sync(v: Partial<PhotoValues>): void {
    Object.assign(this.values, v);
    const x = this.values;
    (this.inputs.fov as HTMLInputElement).value = String(x.fov);
    (this.inputs.roll as HTMLInputElement).value = String(x.roll);
    (this.inputs.aperture as HTMLInputElement).value = String(x.aperture);
    (this.inputs.focusDist as HTMLInputElement).value = String(PhotoPanel.focusToSlider(x.focusDist));
    (this.inputs.hour as HTMLInputElement).value = String(x.hour);
    (this.inputs.autoFocus as HTMLInputElement).checked = x.autoFocus;
    (this.inputs.filter as HTMLSelectElement).value = x.filter;
    this.paintOuts();
  }

  setBare(b: boolean): void {
    this.bare = b;
    this.el.classList.toggle('bare', b);
  }

  show(): void {
    this.visible = true;
    this.setBare(false);
    this.el.classList.add('show');
  }

  hide(): void {
    this.visible = false;
    this.el.classList.remove('show');
  }

  get isVisible(): boolean {
    return this.visible;
  }
}
