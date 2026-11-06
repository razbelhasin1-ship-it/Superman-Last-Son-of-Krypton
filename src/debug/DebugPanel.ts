/**
 * `?debug` live tuning panel (lil-gui), grouped by system. Mirrors every value in src/tuning.ts
 * so feel numbers can be tuned while flying. F1 toggles visibility.
 */
import GUI from 'lil-gui';
import { T } from '../tuning.ts';

type Num = Record<string, unknown>;

export class DebugPanel {
  readonly gui: GUI;
  private statsEl: HTMLDivElement;

  constructor(extra?: (gui: GUI) => void) {
    this.gui = new GUI({ title: 'SUPERMAN · tuning', width: 320 });
    this.gui.close();
    this.addGroup('Speed tiers', null);
    this.addGroup('Flight', T.flight as unknown as Num);
    this.addGroup('Ground', T.ground as unknown as Num);
    this.addGroup('Takeoff', T.takeoff as unknown as Num);
    this.addGroup('Leap', T.leap as unknown as Num);
    this.addGroup('Landing', T.landing as unknown as Num);
    this.addGroup('Camera', T.camera as unknown as Num);
    this.addGroup('Cape', T.cape as unknown as Num);
    this.addGroup('FX', T.fx as unknown as Num);
    this.addGroup('Sky', T.sky as unknown as Num);
    extra?.(this.gui);
    this.statsEl = document.createElement('div');
    this.statsEl.style.cssText =
      'position:fixed;left:8px;top:8px;z-index:50;font:12px/1.35 monospace;color:#fff;background:rgba(0,0,0,.45);padding:6px 8px;border-radius:4px;white-space:pre;pointer-events:none';
    document.body.appendChild(this.statsEl);
  }

  private addGroup(name: string, obj: Num | null): void {
    const f = this.gui.addFolder(name);
    f.close();
    if (name === 'Speed tiers') {
      for (const tier of T.tiers) {
        const tf = f.addFolder(tier.name);
        tf.add(tier, 'speed', 0, 8000, 1);
        tf.add(tier, 'k', 0.1, 20, 0.01);
        tf.add(tier, 'fov', 30, 130, 0.5);
        tf.add(tier, 'dist', 2, 30, 0.1);
        tf.close();
      }
      return;
    }
    if (!obj) return;
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (typeof v === 'number') {
        const mag = Math.abs(v);
        const max = mag === 0 ? 1 : mag < 0.01 ? mag * 10 : mag < 1 ? 1 : mag * 4;
        const step = mag === 0 ? 0.01 : mag < 0.01 ? mag / 100 : mag < 1 ? 0.001 : mag < 10 ? 0.01 : 1;
        f.add(obj, key, Math.min(0, v * 4), max, step);
      } else if (typeof v === 'boolean') {
        f.add(obj, key);
      }
    }
  }

  setStats(text: string): void {
    this.statsEl.textContent = text;
  }

  toggle(): void {
    const hidden = this.gui.domElement.style.display === 'none';
    this.gui.domElement.style.display = hidden ? '' : 'none';
    this.statsEl.style.display = hidden ? '' : 'none';
  }
}
