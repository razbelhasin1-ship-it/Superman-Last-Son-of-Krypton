import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { PlaySequence, introDistance, introTargetHeight, T_CONTROL } from '../src/intro/PlaySequence.ts';

const FOV = 20;
const frameH = (d: number) => 2 * d * Math.tan(((FOV / 2) * Math.PI) / 180);

describe('Play sequence timeline (spec 5.2)', () => {
  it('holds the wide shot until 2.5 s with the hero ≈ 40 % of frame height', () => {
    expect(introDistance(0)).toBeCloseTo(13, 3);
    const share = 1.91 / frameH(introDistance(0));
    expect(share).toBeGreaterThan(0.36);
    expect(share).toBeLessThan(0.46);
    expect(introDistance(2.5)).toBeGreaterThan(12);
  });

  it('frames the full body at ≈ 70 % at 4.0 s and head + upper chest from 9.0 s', () => {
    expect(1.91 / frameH(introDistance(4.0))).toBeGreaterThan(0.62);
    expect(1.91 / frameH(introDistance(4.0))).toBeLessThan(0.78);
    const h9 = frameH(introDistance(9.0));
    expect(h9).toBeGreaterThan(0.5); // head + upper chest ≈ 0.6–0.7 m
    expect(h9).toBeLessThan(0.75);
    // Emblem (≈ 1.40 m) sits in the lower part of the frame at 9 s.
    const center = introTargetHeight(introDistance(9.0));
    expect(center - h9 / 2).toBeLessThan(1.42);
    expect(center + h9 / 2).toBeGreaterThan(1.91);
  });

  it('dollies in monotonically (never pulls back) between 2.5 and 8.5 s', () => {
    let prev = introDistance(2.5);
    for (let t = 2.5; t <= 8.5; t += 0.05) {
      const d = introDistance(t);
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      prev = d;
    }
  });

  it('closes the eyes 6.0–7.3 s, fades the subtitle in over 0.25 s at 9.0 s, hands over at 13.4 s', () => {
    const seq = new PlaySequence(new Vector3(0, 2000, 0), new Vector3(0, 0, 1));
    expect(seq.evaluate(5.5).eyesClosed).toBe(0);
    expect(seq.evaluate(6.6).eyesClosed).toBe(1);
    expect(seq.evaluate(7.6).eyesClosed).toBe(0);
    expect(seq.evaluate(8.95).subtitle).toBe(0);
    expect(seq.evaluate(9.12).subtitle).toBeGreaterThan(0.2);
    expect(seq.evaluate(9.12).subtitle).toBeLessThan(0.95);
    expect(seq.evaluate(9.3).subtitle).toBe(1);
    expect(seq.evaluate(11.0).subtitle).toBe(1);
    expect(seq.evaluate(T_CONTROL - 0.01).controlBlend).toBe(0);
    expect(seq.evaluate(14.2).controlBlend).toBeGreaterThan(0);
    // Lips move with the line.
    let jaw = 0;
    for (let t = 9.0; t < 10.9; t += 0.02) jaw = Math.max(jaw, seq.evaluate(t).jaw);
    expect(jaw).toBeGreaterThan(0.5);
    expect(seq.evaluate(8.0).jaw).toBe(0);
  });
});
