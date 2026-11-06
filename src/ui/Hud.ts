/**
 * Flight HUD (spec 12.2). DOM overlay, clean, fades when idle:
 * speed (km/h + Mach) with the throttle tier, altitude, burst meter, compass bar with landmark ticks and
 * incident markers, district banner, landmark discovery popup, Hope / Collateral indicators,
 * contextual hints that retire once shown, subtitles. Vision overlays and the adaptive crosshair belong
 * to the powers HUD layer (src/powers/hud.ts); the map is `MapView`.
 */
import { T } from '../tuning.ts';

const CSS = `
.hud { position: fixed; inset: 0; pointer-events: none; color: #fff; font-family: 'Segoe UI','Helvetica Neue',Arial,sans-serif;
  text-shadow: 0 1px 3px rgba(0,0,0,.55); transition: opacity .5s ease; }
.hud .idlefade { transition: opacity 1.2s ease; }
.hud .spd { position: absolute; right: 3.2vw; bottom: 5.5vh; text-align: right; }
.hud .spd .v { font-size: clamp(22px, 3.1vw, 46px); font-weight: 700; letter-spacing: .02em; font-variant-numeric: tabular-nums; }
.hud .spd .u { font-size: clamp(10px, .9vw, 14px); opacity: .8; margin-left: .3em; }
.hud .spd .m { font-size: clamp(12px, 1.1vw, 17px); opacity: .9; font-variant-numeric: tabular-nums; }
.hud .tier { display: flex; gap: 4px; justify-content: flex-end; margin-top: 6px; }
.hud .tier i { width: 18px; height: 5px; border-radius: 2px; background: rgba(255,255,255,.22); }
.hud .tier i.on { background: #f5c542; box-shadow: 0 0 8px rgba(245,197,66,.8); }
.hud .tier i.ob { background: #ff6a3d; box-shadow: 0 0 10px rgba(255,106,61,.9); }
.hud .tname { font-size: clamp(10px, .85vw, 13px); letter-spacing: .25em; opacity: .85; margin-top: 4px; }
.hud .alt { position: absolute; left: 3.2vw; bottom: 5.5vh; font-variant-numeric: tabular-nums; }
.hud .alt .v { font-size: clamp(16px, 1.8vw, 26px); font-weight: 600; }
.hud .alt .u { font-size: clamp(10px, .85vw, 13px); opacity: .8; letter-spacing: .2em; }
.hud .hint { position: absolute; left: 50%; top: 15%; transform: translateX(-50%); font-size: clamp(13px, 1.25vw, 19px);
  padding: .45em 1em; border-radius: 6px; background: rgba(5,20,45,.38); backdrop-filter: blur(3px); opacity: 0; transition: opacity .4s ease; white-space: nowrap; }
.hud .hint.show { opacity: 1; }
.subtitle { position: fixed; left: 50%; bottom: 5.6vh; transform: translateX(-50%); font-size: 2.2vh; color: #fff; z-index: 25;
  font-family: 'Inter','Segoe UI','Helvetica Neue',Arial,sans-serif; font-weight: 500; letter-spacing: .01em; pointer-events: none;
  text-shadow: 0 0 6px rgba(0,0,0,.55), 0 1px 2px rgba(0,0,0,.7); opacity: 0; white-space: nowrap; }
.hud .burst { position: absolute; right: 3.2vw; bottom: calc(5.5vh + clamp(70px, 7vw, 110px)); width: 120px; height: 3px; background: rgba(255,255,255,.18); border-radius: 2px; overflow: hidden; }
.hud .burst b { display: block; height: 100%; background: #ff6a3d; width: 0%; }
.hud .cross { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.7); opacity: .0; transition: opacity .3s; }

/* Compass bar */
.hud .compass { position: absolute; left: 50%; top: 2.6vh; width: min(46vw, 760px); height: 34px; transform: translateX(-50%);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent); mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent); }
.hud .compass .rail { position: absolute; left: 0; right: 0; top: 17px; height: 1px; background: rgba(255,255,255,.35); }
.hud .compass .tk { position: absolute; top: 12px; width: 1px; height: 10px; background: rgba(255,255,255,.55); }
.hud .compass .tk.minor { top: 14px; height: 6px; background: rgba(255,255,255,.35); }
.hud .compass .lb { position: absolute; top: -1px; transform: translateX(-50%); font-size: 12px; font-weight: 700; letter-spacing: .12em; }
.hud .compass .lb.card { color: #f5c542; font-size: 13px; }
.hud .compass .mk { position: absolute; top: 9px; transform: translateX(-50%); width: 9px; height: 9px; }
.hud .compass .mk i { display: block; width: 7px; height: 7px; margin: 1px; transform: rotate(45deg); background: #f5c542; box-shadow: 0 0 6px rgba(245,197,66,.8); }
.hud .compass .mk.inc i { background: #ff4b3a; box-shadow: 0 0 8px rgba(255,75,58,.9); animation: hudpulse 1s ease-in-out infinite; }
.hud .compass .mk.obj i { background: #7fd3ff; box-shadow: 0 0 8px rgba(127,211,255,.9); }
.hud .compass .mk span { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); font-size: 10px; letter-spacing: .08em; white-space: nowrap; opacity: 0; transition: opacity .25s; }
.hud .compass .mk.near span { opacity: .9; }
.hud .compass .caret { position: absolute; left: 50%; top: 24px; width: 0; height: 0; margin-left: -4px; border: 4px solid transparent; border-bottom-color: #fff; }
@keyframes hudpulse { 0%,100% { transform: rotate(45deg) scale(1); } 50% { transform: rotate(45deg) scale(1.35); } }

/* Hope / collateral */
.hud .meters { position: absolute; right: 3.2vw; top: 2.6vh; display: flex; gap: 14px; font-size: 12px; letter-spacing: .14em; font-weight: 700; }
.hud .meters .m { display: flex; align-items: center; gap: 6px; opacity: .85; transition: transform .25s ease, opacity .25s; }
.hud .meters .m.bump { transform: scale(1.18); opacity: 1; }
.hud .meters .m svg { width: 14px; height: 14px; }
.hud .meters .hope b { color: #f5c542; }
.hud .meters .coll b { color: #ff8a6a; }
.hud .meters b { font-size: 14px; font-variant-numeric: tabular-nums; }
.hud .float { position: absolute; right: 3.2vw; top: calc(2.6vh + 22px); font-size: 12px; font-weight: 700; opacity: 0; transition: opacity .3s, transform 1.2s ease-out; }

/* District banner */
.hud .banner { position: absolute; left: 50%; top: 24vh; transform: translate(-50%, 0); text-align: center; opacity: 0; transition: opacity .6s ease, letter-spacing 1.4s ease;
  padding: 18px 70px 16px; background: radial-gradient(ellipse at center, rgba(4,16,40,.42) 0%, rgba(4,16,40,.22) 45%, rgba(4,16,40,0) 72%);
  text-shadow: 0 1px 3px rgba(0,0,0,.7), 0 0 18px rgba(0,0,0,.35); }
.hud .banner.show { opacity: 1; }
.hud .banner .t { font-size: clamp(20px, 2.4vw, 38px); font-weight: 800; letter-spacing: .5em; padding-left: .5em; }
.hud .banner.show .t { letter-spacing: .38em; }
.hud .banner .s { margin-top: .4em; font-size: clamp(11px, 1vw, 15px); letter-spacing: .45em; opacity: .85; padding-left: .45em; color: #f5c542; }
.hud .banner .ln { height: 2px; margin: .6em auto 0; width: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.85), transparent); transition: width 1s ease; }
.hud .banner.show .ln { width: 100%; }

/* Discovery popup */
.hud .disc { position: absolute; left: 3.2vw; top: 30vh; max-width: min(360px, 40vw); padding: 12px 16px 14px; border-left: 3px solid #f5c542;
  background: linear-gradient(90deg, rgba(5,20,45,.55), rgba(5,20,45,0)); opacity: 0; transform: translateX(-16px); transition: opacity .5s ease, transform .5s ease; }
.hud .disc.show { opacity: 1; transform: none; }
.hud .disc .k { font-size: 10px; letter-spacing: .32em; color: #f5c542; font-weight: 700; }
.hud .disc .n { font-size: clamp(16px, 1.5vw, 23px); font-weight: 800; letter-spacing: .06em; margin-top: 3px; }
.hud .disc .b { font-size: 12.5px; opacity: .88; margin-top: 4px; line-height: 1.35; }
.hud .disc .c { font-size: 10px; letter-spacing: .2em; opacity: .65; margin-top: 6px; }
`;

const HOPE_SVG = `<svg viewBox="0 0 16 16"><g fill="#f5c542"><circle cx="8" cy="8" r="3.2"/>${[0, 45, 90, 135, 180, 225, 270, 315]
  .map((a) => `<rect x="7.4" y="0.6" width="1.2" height="3" transform="rotate(${a} 8 8)"/>`)
  .join('')}</g></svg>`;
const COLL_SVG = `<svg viewBox="0 0 16 16"><path d="M2 3 L7 7 L5 9 L10 12 L9 14 L14 13" fill="none" stroke="#ff8a6a" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

export interface CompassMarker {
  id: string;
  x: number;
  z: number;
  kind: 'landmark' | 'incident' | 'objective';
  label?: string;
}

const CARDINALS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

export class Hud {
  readonly el: HTMLDivElement;
  private spdV: HTMLSpanElement;
  private machV: HTMLDivElement;
  private tierEls: HTMLElement[] = [];
  private tname: HTMLDivElement;
  private altV: HTMLSpanElement;
  private hintEl: HTMLDivElement;
  private subEl: HTMLDivElement;
  private burstBar: HTMLElement;
  private hintTimer = 0;
  private shownHints = new Set<string>();
  visible = true;
  private fade = 1;
  // Compass
  private compassEl: HTMLDivElement;
  private compassTicks: { el: HTMLElement; deg: number }[] = [];
  private markers = new Map<string, { m: CompassMarker; el: HTMLDivElement }>();
  // Meters
  private hopeEl: HTMLElement;
  private collEl: HTMLElement;
  private hopeV: HTMLElement;
  private collV: HTMLElement;
  private floatEl: HTMLDivElement;
  private shownHope = -1;
  private shownColl = -1;
  private bumpT = 0;
  // Banner / discovery
  private bannerEl: HTMLDivElement;
  private bannerT = 0;
  private discEl: HTMLDivElement;
  private discT = 0;
  private discQueue: { name: string; blurb: string; count: number; total: number }[] = [];
  // Idle fade
  private idleEls: HTMLElement[] = [];
  private idleLevel = 1;

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="alt idlefade"><span class="v">0</span><div class="u">ALT · M</div></div>
      <div class="spd idlefade"><span class="v">0</span><span class="u">KM/H</span><div class="m">MACH 0.00</div>
        <div class="tier">${T.tiers.map(() => '<i></i>').join('')}</div><div class="tname">CRUISE</div></div>
      <div class="burst idlefade"><b></b></div>
      <div class="cross"></div>
      <div class="compass idlefade"><div class="rail"></div><div class="caret"></div></div>
      <div class="meters idlefade"><div class="m hope">${HOPE_SVG}<span>HOPE</span><b>0</b></div><div class="m coll">${COLL_SVG}<span>COLLATERAL</span><b>0</b></div></div>
      <div class="float"></div>
      <div class="banner"><div class="t"></div><div class="s"></div><div class="ln"></div></div>
      <div class="disc"><div class="k">LANDMARK DISCOVERED</div><div class="n"></div><div class="b"></div><div class="c"></div></div>
      <div class="hint"></div>`;
    parent.appendChild(this.el);
    this.subEl = document.createElement('div');
    this.subEl.className = 'subtitle';
    parent.appendChild(this.subEl);
    this.spdV = this.el.querySelector('.spd .v')!;
    this.machV = this.el.querySelector('.spd .m')!;
    this.tierEls = [...this.el.querySelectorAll<HTMLElement>('.tier i')];
    this.tname = this.el.querySelector('.tname')!;
    this.altV = this.el.querySelector('.alt .v')!;
    this.hintEl = this.el.querySelector('.hint')!;
    this.burstBar = this.el.querySelector('.burst b')!;
    this.compassEl = this.el.querySelector('.compass')!;
    this.hopeEl = this.el.querySelector('.meters .hope')!;
    this.collEl = this.el.querySelector('.meters .coll')!;
    this.hopeV = this.hopeEl.querySelector('b')!;
    this.collV = this.collEl.querySelector('b')!;
    this.floatEl = this.el.querySelector('.float')!;
    this.bannerEl = this.el.querySelector('.banner')!;
    this.discEl = this.el.querySelector('.disc')!;
    this.idleEls = [...this.el.querySelectorAll<HTMLElement>('.idlefade')];
    for (let d = 0; d < 360; d += 15) {
      const tk = document.createElement('div');
      tk.className = d % 45 === 0 ? 'tk' : 'tk minor';
      this.compassEl.appendChild(tk);
      this.compassTicks.push({ el: tk, deg: d });
      if (CARDINALS[d]) {
        const lb = document.createElement('div');
        lb.className = d % 90 === 0 ? 'lb card' : 'lb';
        lb.textContent = CARDINALS[d]!;
        this.compassEl.appendChild(lb);
        this.compassTicks.push({ el: lb, deg: d });
      }
    }
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.el.style.opacity = v ? String(this.fade) : '0';
  }

  /** Fade factor 0..1 (intro handoff). */
  setFade(f: number): void {
    this.fade = f;
    if (this.visible) this.el.style.opacity = String(f);
  }

  update(dt: number, speed: number, tier: number, selected: number, alt: number, burstFrac: number, cooldown: number): void {
    this.spdV.textContent = Math.round(speed * 3.6).toLocaleString('en-US');
    this.machV.textContent = `MACH ${(speed / 343).toFixed(2)}`;
    this.tierEls.forEach((e, i) => {
      e.className = i <= selected ? 'on' : i <= tier ? 'ob' : '';
    });
    this.tname.textContent = T.tiers[Math.min(tier, T.tiers.length - 1)]!.name;
    this.altV.textContent = Math.round(Math.max(0, alt)).toLocaleString('en-US');
    this.burstBar.style.width = `${Math.round((cooldown > 0 ? 1 - cooldown / T.flight.burstCooldown : 1 - burstFrac) * 100)}%`;
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintEl.classList.remove('show');
    }
    if (this.bumpT > 0) {
      this.bumpT -= dt;
      if (this.bumpT <= 0) {
        this.hopeEl.classList.remove('bump');
        this.collEl.classList.remove('bump');
        this.floatEl.style.opacity = '0';
      }
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.bannerEl.classList.remove('show');
    }
    if (this.discT > 0) {
      this.discT -= dt;
      if (this.discT <= 0) this.discEl.classList.remove('show');
    } else if (this.discQueue.length && this.discT <= -0.6) {
      const d = this.discQueue.shift()!;
      this.showDiscovery(d.name, d.blurb, d.count, d.total);
    } else this.discT -= dt;
  }

  /** Idle fade (spec 12.2: clean, fades when idle): 1 = full HUD, 0 = idle. */
  setIdle(idle01: number): void {
    const target = idle01 > 0.5 ? 0.22 : 1;
    if (Math.abs(target - this.idleLevel) < 0.01) return;
    this.idleLevel = target;
    for (const e of this.idleEls) e.style.opacity = String(target);
  }

  // ───────────────────────────────────────────── compass

  setCompassMarker(m: CompassMarker | null, id?: string): void {
    const key = m ? m.id : id!;
    const cur = this.markers.get(key);
    if (!m) {
      cur?.el.remove();
      this.markers.delete(key);
      return;
    }
    if (cur) {
      cur.m = m;
      return;
    }
    const el = document.createElement('div');
    el.className = `mk ${m.kind === 'incident' ? 'inc' : m.kind === 'objective' ? 'obj' : ''}`;
    el.innerHTML = `<i></i><span></span>`;
    (el.querySelector('span') as HTMLSpanElement).textContent = m.label ?? '';
    this.compassEl.appendChild(el);
    this.markers.set(key, { m, el });
  }

  clearCompassMarkers(kind?: CompassMarker['kind']): void {
    for (const [k, v] of this.markers) {
      if (!kind || v.m.kind === kind) {
        v.el.remove();
        this.markers.delete(k);
      }
    }
  }

  /** `yaw` 0 = north (−Z), + = clockwise (east). Visible span ±75°. */
  updateCompass(yaw: number, heroX: number, heroZ: number): void {
    const w = this.compassEl.clientWidth || 600;
    const span = 75;
    const yawDeg = (yaw * 180) / Math.PI;
    const place = (deg: number): number | null => {
      let d = deg - yawDeg;
      d = ((((d + 180) % 360) + 360) % 360) - 180;
      if (Math.abs(d) > span) return null;
      return w / 2 + (d / span) * (w / 2);
    };
    for (const t of this.compassTicks) {
      const x = place(t.deg);
      if (x === null) t.el.style.display = 'none';
      else {
        t.el.style.display = '';
        t.el.style.left = `${x}px`;
      }
    }
    for (const { m, el } of this.markers.values()) {
      const dx = m.x - heroX;
      const dz = m.z - heroZ;
      const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
      const x = place(bearing);
      if (x === null) el.style.display = 'none';
      else {
        el.style.display = '';
        el.style.left = `${x}px`;
        el.classList.toggle('near', Math.abs(x - w / 2) < w * 0.12);
        const dist = Math.hypot(dx, dz);
        const span = el.querySelector('span') as HTMLSpanElement;
        const label = `${m.label ?? ''}${m.label ? ' · ' : ''}${dist > 950 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`}`;
        if (span.textContent !== label) span.textContent = label;
      }
    }
  }

  // ───────────────────────────────────────────── hope / collateral

  setMeters(hope: number, collateral: number): void {
    const h = Math.round(hope);
    const c = Math.round(collateral);
    if (h !== this.shownHope) {
      if (this.shownHope >= 0 && h > this.shownHope) this.bump(this.hopeEl, `+${h - this.shownHope} HOPE`, '#f5c542');
      this.shownHope = h;
      this.hopeV.textContent = String(h);
    }
    if (c !== this.shownColl) {
      if (this.shownColl >= 0 && c > this.shownColl) this.bump(this.collEl, `+${c - this.shownColl} COLLATERAL`, '#ff8a6a');
      this.shownColl = c;
      this.collV.textContent = String(c);
    }
  }

  private bump(el: HTMLElement, text: string, color: string): void {
    el.classList.add('bump');
    this.floatEl.textContent = text;
    this.floatEl.style.color = color;
    this.floatEl.style.opacity = '1';
    this.bumpT = 1.4;
  }

  // ───────────────────────────────────────────── banner / discovery

  /** District banner on entry ("UPTOWN — LAFAYETTE"). */
  banner(title: string, sub = '', seconds = 3.6): void {
    (this.bannerEl.querySelector('.t') as HTMLDivElement).textContent = title.toUpperCase();
    (this.bannerEl.querySelector('.s') as HTMLDivElement).textContent = sub.toUpperCase();
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    this.bannerT = seconds;
  }

  /** Landmark discovery popup (queued if one is showing). */
  discovery(name: string, blurb: string, count: number, total: number): void {
    if (this.discT > 0) this.discQueue.push({ name, blurb, count, total });
    else this.showDiscovery(name, blurb, count, total);
  }

  private showDiscovery(name: string, blurb: string, count: number, total: number): void {
    (this.discEl.querySelector('.n') as HTMLDivElement).textContent = name;
    (this.discEl.querySelector('.b') as HTMLDivElement).textContent = blurb;
    (this.discEl.querySelector('.c') as HTMLDivElement).textContent = total > 0 ? `${count} / ${total} LANDMARKS` : '';
    this.discEl.classList.add('show');
    this.discT = 4.5;
  }

  // ───────────────────────────────────────────── hints / subtitles

  hint(id: string, text: string, seconds = 4, once = true): void {
    if (once && this.shownHints.has(id)) return;
    this.shownHints.add(id);
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    this.hintTimer = seconds;
  }

  /** Subtitle with explicit opacity (0 hides). Independent of the HUD fade. */
  subtitle(text: string | null, opacity = 1): void {
    if (text && opacity > 0.001) {
      if (this.subEl.textContent !== text) this.subEl.textContent = text;
      this.subEl.style.opacity = String(opacity);
    } else this.subEl.style.opacity = '0';
  }
}
