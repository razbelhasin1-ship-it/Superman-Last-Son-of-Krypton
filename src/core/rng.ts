/**
 * Seeded, deterministic random numbers. Never use Math.random() in world or gameplay code:
 * the same seed must produce the same city so screenshots are comparable across runs.
 */

/** FNV-1a 32-bit string hash. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Integer avalanche mix (lowbias32). */
export function mix32(x: number): number {
  x = x >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Deterministic hash of integer coordinates + seed → uint32. */
export function hash3i(x: number, y: number, z: number, seed: number): number {
  let h = mix32(seed ^ 0x9e3779b9);
  h = mix32(h ^ Math.imul(x | 0, 0x27d4eb2d));
  h = mix32(h ^ Math.imul(y | 0, 0x165667b1));
  h = mix32(h ^ Math.imul(z | 0, 0x61c88647));
  return h;
}

/** Hash → float in [0, 1). */
export function hashFloat(x: number, y: number, z: number, seed: number): number {
  return hash3i(x, y, z, seed) / 4294967296;
}

export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = (typeof seed === 'string' ? hashString(seed) : mix32(seed >>> 0)) || 0x6d2b79f5;
  }

  /** mulberry32 → [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Integer in [a, b] inclusive. */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)] as T;
  }

  /** Weighted pick; weights need not sum to 1. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i] ?? 0;
      if (r <= 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }

  /** Standard normal via Box–Muller. */
  gauss(): number {
    const u = Math.max(1e-12, this.next());
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Independent child stream derived from this seed and a label. */
  fork(label: string): Rng {
    return new Rng(mix32(this.state ^ hashString(label)));
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = t;
    }
    return arr;
  }
}

/** 2D value noise with smooth interpolation, deterministic per seed. Returns [-1, 1]. */
export function valueNoise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hashFloat(xi, yi, 0, seed);
  const b = hashFloat(xi + 1, yi, 0, seed);
  const c = hashFloat(xi, yi + 1, 0, seed);
  const d = hashFloat(xi + 1, yi + 1, 0, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** Fractal value noise, [-1, 1]. */
export function fbm2(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
