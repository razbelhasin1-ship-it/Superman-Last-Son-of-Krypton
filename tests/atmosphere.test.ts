import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { scatterCpu, sunDirectionForHour } from '../src/render/atmosphere.ts';

describe('atmosphere scattering', () => {
  it('stays finite for every direction and viewer altitude, including exactly at the surface', () => {
    const sun = sunDirectionForHour(10.5);
    for (const alt of [0, 2, 50, 1800, 12000]) {
      const ro = new Vector3(0, 6371e3 + alt, 0);
      for (let el = -89; el <= 89; el += 11) {
        for (let az = 0; az < 360; az += 45) {
          const e = (el * Math.PI) / 180;
          const a = (az * Math.PI) / 180;
          const rd = new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
          const c = scatterCpu(ro, rd, sun);
          for (const v of c) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it('puts the noon sun high in the southern sky and below the horizon at midnight', () => {
    const noon = sunDirectionForHour(12);
    expect(noon.y).toBeGreaterThan(0.7);
    expect(noon.z).toBeGreaterThan(0.5); // +Z is south
    expect(sunDirectionForHour(0).y).toBeLessThan(0);
    const morning = sunDirectionForHour(9);
    expect(morning.x).toBeGreaterThan(0); // east (+X) in the morning
  });
});
