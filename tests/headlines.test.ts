import { describe, expect, it } from 'vitest';
import { frontPage, type PaperState } from '../src/ui/headlines.ts';

const base: PaperState = {
  day: 1,
  hour: 14.5,
  hope: 0,
  collateral: 0,
  saves: 0,
  booms: 0,
  topSpeed: 0,
  distanceKm: 0,
  discoveries: 0,
  incidents: [],
};

describe('Daily Planet front page', () => {
  it('is deterministic for a given state and seed', () => {
    expect(frontPage(base, 7)).toEqual(frontPage(base, 7));
  });

  it('leads with the mystery of the flier before anything has happened', () => {
    const p = frontPage(base, 1);
    expect(p.headline.length).toBeGreaterThan(8);
    expect(p.tone).toBe('mystery');
  });

  it('turns celebratory with hope and cautious with heavy collateral', () => {
    const hopeful = frontPage({ ...base, hope: 40, saves: 6 }, 3);
    const careless = frontPage({ ...base, hope: 4, collateral: 30, booms: 9 }, 3);
    expect(hopeful.tone).toBe('hopeful');
    expect(careless.tone).toBe('cautious');
    expect(careless.headline).not.toBe(hopeful.headline);
  });

  it('leads with the latest incident headline when there is one', () => {
    const p = frontPage({ ...base, hope: 10, saves: 1, incidents: [{ headline: 'BUS SNATCHED FROM BRIDGE EDGE', saved: 31 }] }, 2);
    expect(p.headline).toBe('BUS SNATCHED FROM BRIDGE EDGE');
  });

  it('writes a dateline with the in-game time', () => {
    expect(frontPage(base, 1).dateline).toContain('2:30 PM');
  });
});
