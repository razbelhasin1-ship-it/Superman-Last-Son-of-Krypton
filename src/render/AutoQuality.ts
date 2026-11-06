/**
 * "Auto" graphics preset (spec 12.1): watches frame time and trades resolution first, then the preset
 * (shadows, AO, MSAA, cloud/crowd detail), with hysteresis so it never oscillates at a steady 60 fps.
 */
import type { QualityName } from './RenderSystem.ts';

const ORDER: QualityName[] = ['low', 'medium', 'high', 'ultra'];

export class AutoQuality {
  preset: QualityName;
  /** Dynamic resolution multiplier (on top of the user's resolution scale). */
  scale = 1;
  readonly minScale = 0.6;
  /** Number of decisions taken (for tests/telemetry). */
  changes = 0;
  private avgMs = 16.7;
  private slowFor = 0;
  private fastFor = 0;
  private cooldown = 0;
  /** Called after every decision. */
  onChange: (preset: QualityName, scale: number) => void = () => {};

  constructor(start: QualityName) {
    this.preset = start === 'ultra' ? 'high' : start;
  }

  /** `dt` = real seconds since the previous rendered frame. */
  update(dt: number): void {
    if (!(dt > 0) || dt > 0.5) return; // tab switches, debugger pauses
    const ms = dt * 1000;
    this.avgMs += (ms - this.avgMs) * Math.min(1, dt * 2.5);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.avgMs > 19.5) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (this.avgMs < 12.5) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else {
      this.slowFor = Math.max(0, this.slowFor - dt);
      this.fastFor = Math.max(0, this.fastFor - dt);
    }
    if (this.cooldown > 0) return;
    if (this.slowFor > 1.2) {
      if (this.scale > this.minScale + 1e-6) this.scale = Math.max(this.minScale, this.scale - 0.1);
      else {
        const i = ORDER.indexOf(this.preset);
        if (i <= 0) return;
        this.preset = ORDER[i - 1]!;
        this.scale = 0.8;
      }
      this.decide(1.5);
    } else if (this.fastFor > 4) {
      if (this.scale < 1 - 1e-6) this.scale = Math.min(1, this.scale + 0.05);
      else {
        const i = ORDER.indexOf(this.preset);
        if (i >= ORDER.indexOf('high')) return;
        this.preset = ORDER[i + 1]!;
        this.scale = 0.85;
      }
      this.decide(2.5);
    }
  }

  private decide(cooldown: number): void {
    this.changes++;
    this.slowFor = 0;
    this.fastFor = 0;
    this.cooldown = cooldown;
    this.onChange(this.preset, this.scale);
  }
}
