/** Procedural FX textures (canvas-generated, cached). */
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { Rng } from '../core/rng.ts';

const cache = new Map<string, CanvasTexture>();

function make(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, srgb = true): CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new CanvasTexture(c);
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  if (srgb) t.colorSpace = SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Soft round puff with a slightly broken, cauliflower edge (smoke, dust, mist, spray). */
export function softTexture(): CanvasTexture {
  return make('soft', 128, (g, s) => {
    const img = g.createImageData(s, s);
    const rng = new Rng('soft');
    const blobs = Array.from({ length: 9 }, () => ({ x: rng.range(0.3, 0.7), y: rng.range(0.3, 0.7), r: rng.range(0.16, 0.3) }));
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / s;
        const v = y / s;
        let d = 0;
        for (const b of blobs) {
          const dd = Math.hypot(u - b.x, v - b.y) / b.r;
          d = Math.max(d, Math.max(0, 1 - dd * dd));
        }
        const r = Math.hypot(u - 0.5, v - 0.5) * 2;
        const a = Math.min(1, d * 1.2) * Math.max(0, 1 - r * r);
        const i = (y * s + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
  });
}

/** Bright spark: hot core + glow. */
export function sparkTexture(): CanvasTexture {
  return make('spark', 64, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,240,200,0.9)');
    grd.addColorStop(0.5, 'rgba(255,180,90,0.25)');
    grd.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
}

/** Angular glass/debris shard silhouette. */
export function shardTexture(): CanvasTexture {
  return make('shard', 64, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    g.moveTo(s * 0.5, s * 0.05);
    g.lineTo(s * 0.85, s * 0.55);
    g.lineTo(s * 0.55, s * 0.95);
    g.lineTo(s * 0.18, s * 0.6);
    g.closePath();
    g.fill();
  });
}

/** Radial ground cracks (dark lines on transparent) for impact decals. */
export function crackTexture(seed: number): CanvasTexture {
  return make(`crack${seed % 4}`, 512, (g, s) => {
    const rng = new Rng(seed % 4);
    g.clearRect(0, 0, s, s);
    g.strokeStyle = 'rgba(20,18,16,0.95)';
    g.lineCap = 'round';
    const cx = s / 2;
    const cy = s / 2;
    // central crush
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, s * 0.14);
    grd.addColorStop(0, 'rgba(35,30,26,0.85)');
    grd.addColorStop(1, 'rgba(35,30,26,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, s * 0.14, 0, Math.PI * 2);
    g.fill();
    const arms = rng.int(9, 14);
    for (let a = 0; a < arms; a++) {
      let ang = (a / arms) * Math.PI * 2 + rng.range(-0.2, 0.2);
      let x = cx;
      let y = cy;
      let w = rng.range(4, 7);
      const len = rng.range(0.28, 0.48) * s;
      let travelled = 0;
      g.beginPath();
      g.moveTo(x, y);
      while (travelled < len) {
        const step = rng.range(8, 20);
        ang += rng.range(-0.35, 0.35);
        x += Math.cos(ang) * step;
        y += Math.sin(ang) * step;
        travelled += step;
        g.lineWidth = w;
        g.lineTo(x, y);
        g.stroke();
        g.beginPath();
        g.moveTo(x, y);
        w *= 0.9;
        if (rng.chance(0.18)) {
          // branch
          const ba = ang + rng.pick([-1, 1]) * rng.range(0.5, 1.1);
          let bx = x;
          let by = y;
          g.save();
          g.lineWidth = w * 0.6;
          g.beginPath();
          g.moveTo(bx, by);
          for (let k = 0; k < 4; k++) {
            bx += Math.cos(ba + rng.range(-0.3, 0.3)) * rng.range(6, 14);
            by += Math.sin(ba + rng.range(-0.3, 0.3)) * rng.range(6, 14);
            g.lineTo(bx, by);
          }
          g.stroke();
          g.restore();
          g.beginPath();
          g.moveTo(x, y);
        }
      }
    }
    // concentric fracture ring
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(20,18,16,0.55)';
    g.beginPath();
    for (let k = 0; k <= 40; k++) {
      const t = (k / 40) * Math.PI * 2;
      const r = s * (0.2 + rng.range(-0.015, 0.015));
      if (k === 0) g.moveTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
      else g.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
    }
    g.stroke();
  });
}
