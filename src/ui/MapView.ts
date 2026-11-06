/**
 * Full map (spec 12.2, key M): a top-down "satellite" render of the live world with landmark names,
 * district labels, discovered state, incident markers and the hero arrow. Wheel zooms around the
 * cursor, drag pans, M / Esc closes. North (−Z) is up.
 */
import type { DistrictInfo, LandmarkInfo } from '../contracts.ts';

export interface MapExtent {
  cx: number;
  cz: number;
  half: number;
}

export interface MapData {
  landmarks: readonly LandmarkInfo[];
  districts: readonly DistrictInfo[];
  discovered: ReadonlySet<string>;
  hero: { x: number; z: number; heading: number };
  incidents: { id: string; x: number; z: number; label: string }[];
}

const CSS = `
.mapv { position: fixed; inset: 0; z-index: 32; display: none; background: radial-gradient(ellipse at center, rgba(4,14,32,.86), rgba(2,8,20,.96));
  font-family: 'Segoe UI','Helvetica Neue',Arial,sans-serif; color: #fff; user-select: none; }
.mapv.show { display: block; }
.mapv .vp { position: absolute; left: 50%; top: 52%; width: min(86vh, 92vw); height: min(86vh, 92vw); transform: translate(-50%, -50%); overflow: hidden;
  border-radius: 10px; box-shadow: 0 20px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.12); cursor: grab; background: #0b2238; }
.mapv .vp.drag { cursor: grabbing; }
.mapv .world { position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform-origin: 0 0; }
.mapv canvas { width: 100%; height: 100%; display: block; filter: saturate(1.08) contrast(1.04); }
.mapv .lay { position: absolute; inset: 0; pointer-events: none; }
.mapv .dist { position: absolute; transform: translate(-50%, -50%); font-size: 11px; letter-spacing: .38em; font-weight: 800; color: rgba(255,255,255,.55);
  text-shadow: 0 1px 4px rgba(0,0,0,.8); white-space: nowrap; }
.mapv .lm { position: absolute; transform: translate(-50%, -50%); }
.mapv .lm i { display: block; width: 8px; height: 8px; transform: rotate(45deg); background: rgba(255,255,255,.35); border: 1px solid rgba(255,255,255,.7); margin: auto; }
.mapv .lm.found i { background: #f5c542; border-color: #fff3c8; box-shadow: 0 0 8px rgba(245,197,66,.8); }
.mapv .lm span { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); font-size: 10.5px; white-space: nowrap; letter-spacing: .04em;
  text-shadow: 0 1px 3px rgba(0,0,0,.95), 0 0 6px rgba(0,0,0,.6); }
.mapv .lm:not(.found) span { opacity: .75; font-style: italic; }
.mapv .inc { position: absolute; transform: translate(-50%, -50%); width: 14px; height: 14px; border-radius: 50%; background: #ff4b3a; box-shadow: 0 0 12px #ff4b3a; animation: mappulse 1s ease-in-out infinite; }
.mapv .hero { position: absolute; width: 0; height: 0; }
.mapv .hero svg { position: absolute; left: -11px; top: -11px; width: 22px; height: 22px; filter: drop-shadow(0 0 6px rgba(0,0,0,.8)); }
.mapv .hdr { position: absolute; left: 50%; top: 2.4vh; transform: translateX(-50%); text-align: center; }
.mapv .hdr b { display: block; font-size: 18px; letter-spacing: .5em; color: #f5c542; font-weight: 800; padding-left: .5em; }
.mapv .hdr span { font-size: 11px; letter-spacing: .22em; opacity: .7; }
.mapv .compassrose { position: absolute; right: 2.5vw; top: 3vh; font-size: 12px; font-weight: 800; letter-spacing: .2em; opacity: .8; }
@keyframes mappulse { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.4); } }
`;

const HERO_SVG = `<svg viewBox="0 0 22 22"><path d="M11 1 L19 20 L11 15 L3 20 Z" fill="#c8202b" stroke="#ffe08a" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

export class MapView {
  readonly el: HTMLDivElement;
  private vp: HTMLDivElement;
  private worldEl: HTMLDivElement;
  private lay: HTMLDivElement;
  private canvasHost: HTMLDivElement;
  private open = false;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private extent: MapExtent = { cx: 0, cz: 0, half: 6000 };
  onClose: () => void = () => {};

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.className = 'mapv';
    this.el.innerHTML = `<div class="hdr"><b>METROPOLIS</b><span>WHEEL ZOOM · DRAG PAN · M / ESC CLOSE</span></div><div class="compassrose">▲ N</div>
      <div class="vp"><div class="world"><div class="cv"></div><div class="lay"></div></div></div>`;
    parent.appendChild(this.el);
    this.vp = this.el.querySelector('.vp')!;
    this.worldEl = this.el.querySelector('.world')!;
    this.lay = this.el.querySelector('.lay')!;
    this.canvasHost = this.el.querySelector('.cv')!;
    this.vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.vp.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const z0 = this.zoom;
      const z1 = Math.min(6, Math.max(1, z0 * Math.pow(1.15, -Math.sign(e.deltaY))));
      // Keep the point under the cursor fixed.
      this.panX = mx - ((mx - this.panX) * z1) / z0;
      this.panY = my - ((my - this.panY) * z1) / z0;
      this.zoom = z1;
      this.applyTransform();
    }, { passive: false });
    this.vp.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.vp.classList.add('drag');
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
      this.vp.classList.remove('drag');
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.panX += e.clientX - this.lastX;
      this.panY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.applyTransform();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'KeyM' || e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  private applyTransform(): void {
    const size = this.vp.clientWidth || 800;
    // Clamp so the map always covers the viewport.
    const min = size - size * this.zoom;
    this.panX = Math.min(0, Math.max(min, this.panX));
    this.panY = Math.min(0, Math.max(min, this.panY));
    this.worldEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    // Keep labels a constant size while zooming.
    for (const el of this.lay.children) (el as HTMLElement).style.scale = String(1 / this.zoom);
  }

  /** World (x, z) → percentage position on the map. */
  private pct(x: number, z: number): [number, number] {
    const e = this.extent;
    return [((x - (e.cx - e.half)) / (2 * e.half)) * 100, ((z - (e.cz - e.half)) / (2 * e.half)) * 100];
  }

  show(image: HTMLCanvasElement, extent: MapExtent, data: MapData): void {
    this.extent = extent;
    this.canvasHost.replaceChildren(image);
    const parts: string[] = [];
    for (const d of data.districts) {
      const [px, py] = this.pct(d.x, d.z);
      parts.push(`<div class="dist" style="left:${px}%;top:${py}%">${d.name.toUpperCase()}</div>`);
    }
    for (const l of data.landmarks) {
      const [px, py] = this.pct(l.x, l.z);
      const found = data.discovered.has(l.slug);
      parts.push(`<div class="lm${found ? ' found' : ''}" style="left:${px}%;top:${py}%"><i></i><span>${l.name.replace(/[<>&]/g, "")}</span></div>`);
    }
    for (const i of data.incidents) {
      const [px, py] = this.pct(i.x, i.z);
      parts.push(`<div class="inc" title="${i.label}" style="left:${px}%;top:${py}%"></div>`);
    }
    const [hx, hy] = this.pct(data.hero.x, data.hero.z);
    parts.push(`<div class="hero" style="left:${hx}%;top:${hy}%;rotate:${(data.hero.heading * 180) / Math.PI}deg">${HERO_SVG}</div>`);
    this.lay.innerHTML = parts.join('');
    this.open = true;
    this.el.classList.add('show');
    // Start zoomed in a little around the hero.
    const size = this.vp.clientWidth || 800;
    this.zoom = 1.6;
    this.panX = size / 2 - (hx / 100) * size * this.zoom;
    this.panY = size / 2 - (hy / 100) * size * this.zoom;
    this.applyTransform();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('show');
    this.onClose();
  }
}
