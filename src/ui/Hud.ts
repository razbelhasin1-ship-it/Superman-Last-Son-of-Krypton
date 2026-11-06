/**
 * Flight HUD (spec 12.2, gate-1 subset): speed in km/h and Mach with the throttle tier, altitude,
 * burst/solar meters, contextual hints and subtitles. DOM overlay; fades when idle.
 */
import { T } from '../tuning.ts';

const CSS = `
.hud { position: fixed; inset: 0; pointer-events: none; color: #fff; font-family: 'Segoe UI','Helvetica Neue',Arial,sans-serif;
  text-shadow: 0 1px 3px rgba(0,0,0,.55); transition: opacity .5s ease; }
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
.hud .hint { position: absolute; left: 50%; top: 66%; transform: translateX(-50%); font-size: clamp(13px, 1.25vw, 19px);
  padding: .45em 1em; border-radius: 6px; background: rgba(5,20,45,.38); backdrop-filter: blur(3px); opacity: 0; transition: opacity .4s ease; white-space: nowrap; }
.hud .hint.show { opacity: 1; }
.subtitle { position: fixed; left: 50%; bottom: 5.6vh; transform: translateX(-50%); font-size: 2.2vh; color: #fff; z-index: 25;
  font-family: 'Inter','Segoe UI','Helvetica Neue',Arial,sans-serif; font-weight: 500; letter-spacing: .01em; pointer-events: none;
  text-shadow: 0 0 6px rgba(0,0,0,.55), 0 1px 2px rgba(0,0,0,.7); opacity: 0; white-space: nowrap; }
.hud .burst { position: absolute; right: 3.2vw; bottom: calc(5.5vh + clamp(70px, 7vw, 110px)); width: 120px; height: 3px; background: rgba(255,255,255,.18); border-radius: 2px; overflow: hidden; }
.hud .burst b { display: block; height: 100%; background: #ff6a3d; width: 0%; }
.hud .cross { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.7); opacity: .0; transition: opacity .3s; }
`;

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

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="alt"><span class="v">0</span><div class="u">ALT · M</div></div>
      <div class="spd"><span class="v">0</span><span class="u">KM/H</span><div class="m">MACH 0.00</div>
        <div class="tier">${T.tiers.map(() => '<i></i>').join('')}</div><div class="tname">CRUISE</div></div>
      <div class="burst"><b></b></div>
      <div class="cross"></div>
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
  }

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
