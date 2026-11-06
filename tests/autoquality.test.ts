import { describe, expect, it } from 'vitest';
import { AutoQuality } from '../src/render/AutoQuality.ts';

function run(q: AutoQuality, ms: number, seconds: number): void {
  const dt = ms / 1000;
  for (let t = 0; t < seconds; t += dt) q.update(dt);
}

describe('auto quality scaler', () => {
  it('lowers resolution scale first when frames are slow', () => {
    const q = new AutoQuality('high');
    run(q, 26, 3);
    expect(q.scale).toBeLessThan(1);
    expect(q.preset).toBe('high');
  });

  it('drops the preset only once resolution is at its floor', () => {
    const q = new AutoQuality('high');
    run(q, 40, 30);
    expect(q.scale).toBeCloseTo(q.minScale, 5);
    expect(['medium', 'low']).toContain(q.preset);
  });

  it('recovers resolution when there is headroom, without oscillating at 60 fps', () => {
    const q = new AutoQuality('high');
    run(q, 26, 3);
    const lowered = q.scale;
    run(q, 9, 20);
    expect(q.scale).toBeGreaterThan(lowered);
    const changesBefore = q.changes;
    run(q, 16.7, 30);
    expect(q.changes).toBe(changesBefore);
  });

  it('never climbs above high on its own', () => {
    const q = new AutoQuality('medium');
    run(q, 6, 120);
    expect(q.preset).toBe('high');
    expect(q.scale).toBe(1);
  });
});
