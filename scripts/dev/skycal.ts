// Dev tool: print sky radiance vs. sunlit white for calibrating SKY_SCALE (run: node scripts/dev/skycal.ts)
import { Vector3 } from 'three';
import { sunDirectionForHour, scatterCpu, SKY_SCALE } from '../../src/render/atmosphere.ts';
const lum = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
const ro = new Vector3(0, 6371e3 + 50, 0);
for (const h of [7, 10.5, 12, 17.5, 18.5]) {
  const s = sunDirectionForHour(h);
  const z = scatterCpu(ro, new Vector3(0, 1, 0), s);
  const hz = scatterCpu(ro, new Vector3(-s.x, 0.04, -s.z).normalize(), s);
  const hs = scatterCpu(ro, new Vector3(s.x, 0.04, s.z).normalize(), s);
  console.log(`h=${h} elev=${(Math.asin(s.y) * 57.3).toFixed(1)} sun=${s.toArray().map((v) => v.toFixed(2))}`,
    `zenithRaw=${z.map((v) => v.toFixed(3))} L=${lum(z).toFixed(3)} scaled=${(lum(z) * SKY_SCALE).toFixed(3)}`,
    `horizAway L=${(lum(hz) * SKY_SCALE).toFixed(3)} horizSun L=${(lum(hs) * SKY_SCALE).toFixed(3)}`);
}
