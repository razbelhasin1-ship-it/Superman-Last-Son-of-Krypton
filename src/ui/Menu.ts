/**
 * Main menu (spec 5.1): DOM + CSS overlay over the live sky scene. PLAY / CONTROLS / SETTINGS,
 * mouse + keyboard + gamepad navigation, 350 ms eased transitions, settings persisted.
 * Original typographic title (not a film logo); the gold-on-red shield appears once as a motif.
 */
import type { Settings } from './settings.ts';

export interface MenuHooks {
  onPlay(): void;
  onSettingsChanged(s: Settings): void;
  onUiSound?(kind: 'move' | 'select' | 'back'): void;
}

const CSS = `
.mm { position: fixed; inset: 0; z-index: 30; pointer-events: none; font-family: 'Inter Display','Inter','Segoe UI','Helvetica Neue',Arial,sans-serif; color: #fff; }
.mm * { box-sizing: border-box; }
.mm .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(4,16,40,.62) 0%, rgba(4,16,40,.34) 34%, rgba(4,16,40,0) 58%); transition: opacity .35s ease; }
.mm .panel { position: absolute; left: clamp(28px, 7vw, 140px); top: 50%; transform: translateY(-50%); width: min(520px, 80vw);
  pointer-events: auto; transition: opacity .35s cubic-bezier(.2,.7,.2,1), transform .35s cubic-bezier(.2,.7,.2,1), filter .35s ease; }
.mm .panel.hidden { opacity: 0; transform: translate(-24px, -50%); filter: blur(6px); pointer-events: none; }
.mm .brand { display: flex; align-items: center; gap: clamp(10px, 1.2vw, 18px); margin-bottom: clamp(18px, 3.2vh, 42px); }
.mm .shield { width: clamp(38px, 3.6vw, 60px); height: auto; filter: drop-shadow(0 2px 8px rgba(0,0,0,.45)); flex: none; }
.mm h1 { margin: 0; line-height: .9; font-weight: 900; font-style: italic; font-size: clamp(42px, 6.2vw, 108px); letter-spacing: .06em;
  background: linear-gradient(180deg, #fffdf4 0%, #fff3c8 38%, #f5c542 62%, #e19a22 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 3px 0 #8f141c) drop-shadow(0 8px 18px rgba(0,0,0,.45)); }
.mm .sub { margin-top: .55em; font-weight: 300; letter-spacing: .62em; font-size: clamp(11px, 1.05vw, 17px); opacity: .92; padding-left: .2em; }
.mm .sub b { font-weight: 600; color: #f5c542; letter-spacing: .62em; }
.mm .rule { height: 3px; width: clamp(120px, 14vw, 230px); background: linear-gradient(90deg, #c8202b, rgba(200,32,43,0)); margin: clamp(10px,1.4vh,18px) 0 0 .15em; border-radius: 2px; }
.mm nav { display: flex; flex-direction: column; gap: clamp(6px, 1vh, 12px); }
.mm button.mi { all: unset; cursor: pointer; display: flex; align-items: center; gap: 14px; font-weight: 800; letter-spacing: .32em;
  font-size: clamp(15px, 1.45vw, 24px); padding: .55em 1.1em .55em .9em; border-radius: 8px; width: fit-content; color: rgba(255,255,255,.86);
  transition: color .25s ease, background .25s ease, box-shadow .25s ease, transform .25s ease; }
.mm button.mi::before { content: ''; width: 18px; height: 3px; border-radius: 2px; background: rgba(245,197,66,.0); transition: background .25s ease, width .25s ease; }
.mm button.mi.focus, .mm button.mi:hover { color: #fff; background: rgba(255,255,255,.08); box-shadow: 0 0 24px rgba(245,197,66,.28), inset 0 0 0 1px rgba(245,197,66,.45); transform: translateX(6px); }
.mm button.mi.focus::before, .mm button.mi:hover::before { background: #f5c542; width: 26px; }
.mm .foot { position: absolute; left: clamp(28px, 7vw, 140px); bottom: 3.2vh; font-size: 11px; letter-spacing: .14em; opacity: .62; pointer-events: none; }
.mm .hintbar { position: absolute; right: clamp(20px, 4vw, 60px); bottom: 3.2vh; font-size: 12px; letter-spacing: .12em; opacity: .7; }
.mm .card { background: rgba(6,20,48,.72); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: clamp(16px, 2vw, 28px);
  max-height: 76vh; overflow: auto; width: min(640px, 86vw); box-shadow: 0 18px 60px rgba(0,0,0,.35); }
.mm h2 { margin: 0 0 14px; font-size: clamp(16px, 1.4vw, 22px); letter-spacing: .3em; font-weight: 800; color: #f5c542; }
.mm table { width: 100%; border-collapse: collapse; font-size: clamp(11px, .95vw, 14px); }
.mm td, .mm th { padding: 5px 8px; border-bottom: 1px solid rgba(255,255,255,.08); text-align: left; }
.mm th { font-weight: 700; letter-spacing: .12em; opacity: .75; font-size: .85em; }
.mm td:first-child { opacity: .92; }
.mm td kbd { font-family: inherit; font-weight: 700; background: rgba(255,255,255,.1); border-radius: 4px; padding: 1px 6px; }
.mm .row { display: grid; grid-template-columns: 1fr minmax(140px, 46%); align-items: center; gap: 12px; padding: 7px 4px; border-bottom: 1px solid rgba(255,255,255,.07); font-size: clamp(12px, 1vw, 15px); }
.mm .row.focus { background: rgba(245,197,66,.1); border-radius: 6px; }
.mm .row label { letter-spacing: .06em; opacity: .92; }
.mm .row input[type=range] { width: 100%; accent-color: #f5c542; }
.mm .row select { width: 100%; background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.2); border-radius: 6px; padding: 4px 6px; font: inherit; }
.mm .row select option { color: #000; }
.mm .tog { justify-self: start; width: 46px; height: 24px; border-radius: 12px; background: rgba(255,255,255,.18); position: relative; cursor: pointer; transition: background .2s; }
.mm .tog::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .2s; }
.mm .tog.on { background: #d4a72c; }
.mm .tog.on::after { transform: translateX(22px); }
.mm .group { margin: 14px 0 4px; font-size: 11px; letter-spacing: .3em; opacity: .55; font-weight: 700; }
.mm .back { margin-top: 16px; }
.mm.out .panel { opacity: 0; transform: translate(-36px, -50%); filter: blur(8px); }
.mm.out .shade { opacity: 0; }
.mm.out .foot, .mm.out .hintbar { opacity: 0; transition: opacity .35s ease; }
`;

const SHIELD_SVG = `
<svg class="shield" viewBox="0 0 120 96" aria-hidden="true">
  <defs><linearGradient id="mmg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a3"/><stop offset=".55" stop-color="#f5c542"/><stop offset="1" stop-color="#cf8a1d"/></linearGradient></defs>
  <path d="M27 4 H93 L116 30 L60 92 L4 30 Z" fill="url(#mmg)"/>
  <path d="M30 10 H90 L108 30 L60 83 L12 30 Z" fill="#b5121b"/>
  <path d="M44 19 H86 Q90 19 92 22 L97 28 H58 Q48 28 46 33 L44 37 Q41 30 41 25 Q41 19 44 19 Z" fill="url(#mmg)"/>
  <path d="M24 38 H71 Q78 38 79 44 L80 47 Q80 54 72 58 L56 70 L60 62 Q62 57 56 55 L38 51 Q30 49 27 44 Z" fill="url(#mmg)" opacity=".0"/>
  <path d="M23 36 L64 42 Q74 44 72 52 Q70 58 62 62 L59 64 L66 52 Q67 48 60 47 L27 41 Z" fill="url(#mmg)"/>
</svg>`;

type Screen = 'main' | 'controls' | 'settings';

const CONTROLS: [string, string, string][] = [
  ['Look / steer', 'Mouse', 'Right stick'],
  ['Thrust forward / back', '<kbd>W</kbd> / <kbd>S</kbd>', 'Left stick Y'],
  ['Strafe · bank', '<kbd>A</kbd> / <kbd>D</kbd>', 'Left stick X'],
  ['Barrel roll', 'Double-tap <kbd>A</kbd> / <kbd>D</kbd>', '—'],
  ['Take off (tap) · power launch (hold) · ascend', '<kbd>Space</kbd>', 'A'],
  ['Super-leap (crouch + Space; hold to charge)', '<kbd>C</kbd> + <kbd>Space</kbd>', 'B + A'],
  ['Descend · crouch · power-dive (double-tap)', '<kbd>C</kbd> or <kbd>Ctrl</kbd>', 'B'],
  ['Throttle tier up / down', 'Mouse wheel', 'D-pad ↑ / ↓'],
  ['Overboost (+1 tier while held)', '<kbd>Shift</kbd>', 'Left trigger'],
  ['Hover-brake', '<kbd>R</kbd>', 'Y'],
  ['Punch · hold & release to throw', 'Left mouse', 'Right trigger'],
  ['Grab · carry · interact', '<kbd>E</kbd>', 'X'],
  ['Heat vision (hold)', 'Right mouse', 'Right bumper'],
  ['Freeze breath (hold)', '<kbd>F</kbd>', 'Power wheel → hold LB'],
  ['Super breath (hold)', '<kbd>G</kbd>', 'Power wheel → hold LB'],
  ['X-ray vision (toggle)', '<kbd>X</kbd>', 'Power wheel'],
  ['Telescopic vision (hold, wheel zooms)', '<kbd>Z</kbd>', 'Power wheel'],
  ['Super hearing (hold)', '<kbd>H</kbd>', 'Power wheel'],
  ['Scan / microscopic vision (toggle)', '<kbd>V</kbd>', 'Power wheel'],
  ['Super-speed focus (hold)', '<kbd>Q</kbd>', 'Power wheel'],
  ['Power wheel (slows time to 0.2×)', '—', 'Right stick click'],
  ['Map · pause · photo mode · debug', '<kbd>M</kbd> · <kbd>Esc</kbd> · <kbd>P</kbd> · <kbd>F1</kbd>', 'View · Menu · — · —'],
  ['Hide HUD', '<kbd>U</kbd>', '—'],
];

export class Menu {
  readonly el: HTMLDivElement;
  private screen: Screen = 'main';
  private focusIdx = 0;
  private panels: Record<Screen, HTMLDivElement>;
  private visible = false;
  private readonly settings: Settings;
  private readonly hooks: MenuHooks;
  private padPrev: boolean[] = [];
  private padAxisLatch = 0;
  private rafId = 0;

  constructor(parent: HTMLElement, settings: Settings, hooks: MenuHooks) {
    this.settings = settings;
    this.hooks = hooks;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.className = 'mm out';
    this.el.innerHTML = `<div class="shade"></div>
      <div class="foot">A NON-COMMERCIAL FAN PROJECT · ORIGINAL PROCEDURAL ASSETS</div>
      <div class="hintbar">↑ ↓ SELECT · ENTER CONFIRM · ESC BACK</div>`;
    const main = document.createElement('div');
    main.className = 'panel';
    main.innerHTML = `
      <div class="brand">${SHIELD_SVG}<div><h1>SUPERMAN</h1><div class="rule"></div></div></div>
      <div class="sub" style="margin:-.4em 0 clamp(26px,4.5vh,56px)"><b>METROPOLIS</b></div>
      <nav>
        <button class="mi" data-act="play">PLAY</button>
        <button class="mi" data-act="controls">CONTROLS</button>
        <button class="mi" data-act="settings">SETTINGS</button>
      </nav>`;
    const controls = document.createElement('div');
    controls.className = 'panel hidden';
    controls.innerHTML = `<div class="card"><h2>CONTROLS</h2>
      <table><tr><th>ACTION</th><th>KEYBOARD + MOUSE</th><th>GAMEPAD</th></tr>
      ${CONTROLS.map(([a, k, g]) => `<tr><td>${a}</td><td>${k}</td><td>${g}</td></tr>`).join('')}</table>
      <p style="font-size:12px;opacity:.7;margin:12px 0 0">Flight assist “auto-cruise” (hold the current tier without W) is in Settings.</p>
      <nav class="back"><button class="mi" data-act="back">BACK</button></nav></div>`;
    const settingsP = document.createElement('div');
    settingsP.className = 'panel hidden';
    settingsP.innerHTML = `<div class="card"><h2>SETTINGS</h2><div class="rows"></div>
      <nav class="back"><button class="mi" data-act="back">BACK</button></nav></div>`;
    this.el.append(main, controls, settingsP);
    this.panels = { main, controls, settings: settingsP };
    parent.appendChild(this.el);
    this.buildSettings(settingsP.querySelector('.rows') as HTMLDivElement);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button.mi') as HTMLButtonElement | null;
      if (b) this.activate(b.dataset.act ?? '');
    });
    this.el.addEventListener('mousemove', (e) => {
      const b = (e.target as HTMLElement).closest('button.mi') as HTMLButtonElement | null;
      if (!b) return;
      const items = this.items();
      const i = items.indexOf(b);
      if (i >= 0 && i !== this.focusIdx) {
        this.focusIdx = i;
        this.paintFocus();
        this.hooks.onUiSound?.('move');
      }
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private buildSettings(rows: HTMLDivElement): void {
    const s = this.settings;
    const save = () => this.hooks.onSettingsChanged(s);
    const group = (t: string) => {
      const g = document.createElement('div');
      g.className = 'group';
      g.textContent = t;
      rows.appendChild(g);
    };
    const slider = (label: string, key: keyof Settings, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const r = document.createElement('div');
      r.className = 'row';
      r.innerHTML = `<label>${label} <span style="opacity:.6"></span></label><input type="range" min="${min}" max="${max}" step="${step}">`;
      const input = r.querySelector('input') as HTMLInputElement;
      const out = r.querySelector('span') as HTMLSpanElement;
      input.value = String(s[key]);
      out.textContent = fmt(Number(s[key]));
      input.addEventListener('input', () => {
        (s as unknown as Record<string, unknown>)[key] = Number(input.value);
        out.textContent = fmt(Number(input.value));
        save();
      });
      rows.appendChild(r);
    };
    const toggle = (label: string, key: keyof Settings) => {
      const r = document.createElement('div');
      r.className = 'row';
      r.innerHTML = `<label>${label}</label><div class="tog" role="switch" tabindex="0"></div>`;
      const t = r.querySelector('.tog') as HTMLDivElement;
      const paint = () => t.classList.toggle('on', Boolean(s[key]));
      paint();
      t.addEventListener('click', () => {
        (s as unknown as Record<string, unknown>)[key] = !s[key];
        paint();
        save();
        this.hooks.onUiSound?.('select');
      });
      rows.appendChild(r);
    };
    const select = (label: string, key: keyof Settings, options: string[]) => {
      const r = document.createElement('div');
      r.className = 'row';
      r.innerHTML = `<label>${label}</label><select>${options.map((o) => `<option value="${o}">${o.toUpperCase()}</option>`).join('')}</select>`;
      const sel = r.querySelector('select') as HTMLSelectElement;
      sel.value = String(s[key]);
      sel.addEventListener('change', () => {
        (s as unknown as Record<string, unknown>)[key] = sel.value;
        save();
      });
      rows.appendChild(r);
    };
    group('GRAPHICS');
    select('Graphics preset', 'graphics', ['auto', 'low', 'medium', 'high', 'ultra']);
    slider('Resolution scale', 'resolutionScale', 0.5, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    slider('Field of view', 'fovOffset', -10, 15, 1, (v) => `${v > 0 ? '+' : ''}${v}°`);
    group('CONTROLS');
    slider('Mouse sensitivity', 'mouseSensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2));
    toggle('Invert Y', 'invertY');
    toggle('Auto-cruise flight assist', 'autoCruise');
    group('AUDIO');
    slider('Master volume', 'masterVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}`);
    slider('Music volume', 'musicVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}`);
    slider('Effects volume', 'sfxVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}`);
    toggle('Text-to-speech for spoken lines', 'tts');
    group('COMFORT & ACCESSIBILITY');
    toggle('Reduced camera shake', 'reducedShake');
    toggle('Reduced motion blur', 'reducedMotionBlur');
    toggle('Stable-horizon camera', 'stableHorizon');
    toggle('Subtitles', 'subtitles');
    toggle('Safe sonic booms (no collateral)', 'safeBoom');
  }

  private items(): HTMLButtonElement[] {
    return [...this.panels[this.screen].querySelectorAll<HTMLButtonElement>('button.mi')];
  }

  private paintFocus(): void {
    this.items().forEach((b, i) => b.classList.toggle('focus', i === this.focusIdx));
  }

  private go(screen: Screen): void {
    this.panels[this.screen].classList.add('hidden');
    this.screen = screen;
    this.panels[screen].classList.remove('hidden');
    this.focusIdx = 0;
    this.paintFocus();
  }

  private activate(act: string): void {
    if (!this.visible) return;
    if (act === 'play') {
      this.hooks.onUiSound?.('select');
      this.hide();
      this.hooks.onPlay();
    } else if (act === 'controls' || act === 'settings') {
      this.hooks.onUiSound?.('select');
      this.go(act);
    } else if (act === 'back') {
      this.hooks.onUiSound?.('back');
      this.go('main');
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.visible) return;
    const items = this.items();
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      this.focusIdx = (this.focusIdx + 1) % items.length;
      this.paintFocus();
      this.hooks.onUiSound?.('move');
      e.preventDefault();
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      this.focusIdx = (this.focusIdx - 1 + items.length) % items.length;
      this.paintFocus();
      this.hooks.onUiSound?.('move');
      e.preventDefault();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      const b = items[this.focusIdx];
      if (b && document.activeElement?.tagName !== 'SELECT') {
        this.activate(b.dataset.act ?? '');
        e.preventDefault();
      }
    } else if (e.code === 'Escape' || e.code === 'Backspace') {
      if (this.screen !== 'main') this.activate('back');
    }
  }

  private pollPad = (): void => {
    this.rafId = requestAnimationFrame(this.pollPad);
    if (!this.visible || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pad = [...navigator.getGamepads()].find((p) => p && p.connected);
    if (!pad) return;
    const btn = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => btn[i] && !this.padPrev[i];
    const items = this.items();
    const ay = pad.axes[1] ?? 0;
    const axisDir = ay > 0.6 ? 1 : ay < -0.6 ? -1 : 0;
    if (axisDir !== 0 && this.padAxisLatch === 0) {
      this.focusIdx = (this.focusIdx + axisDir + items.length) % items.length;
      this.paintFocus();
      this.hooks.onUiSound?.('move');
    }
    this.padAxisLatch = axisDir;
    if (edge(13)) {
      this.focusIdx = (this.focusIdx + 1) % items.length;
      this.paintFocus();
    }
    if (edge(12)) {
      this.focusIdx = (this.focusIdx - 1 + items.length) % items.length;
      this.paintFocus();
    }
    if (edge(0)) this.activate(items[this.focusIdx]?.dataset.act ?? '');
    if (edge(1) && this.screen !== 'main') this.activate('back');
    this.padPrev = btn;
  };

  show(): void {
    this.visible = true;
    this.go('main');
    this.el.classList.remove('out');
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.pollPad);
  }

  hide(): void {
    this.visible = false;
    this.el.classList.add('out');
    cancelAnimationFrame(this.rafId);
  }

  get isVisible(): boolean {
    return this.visible;
  }
}
