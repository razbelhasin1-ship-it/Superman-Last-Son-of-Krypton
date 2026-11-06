/** Small, allocation-free math helpers shared by gameplay, camera and animation. */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const MACH1 = 343;

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, x: number): number {
  return a === b ? 0 : (x - a) / (b - a);
}

export function remap(x: number, a0: number, a1: number, b0: number, b1: number): number {
  return lerp(b0, b1, clamp01(invLerp(a0, a1, x)));
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function smootherstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Frame-rate independent exponential approach factor: 1 − e^(−k·dt). */
export function expFactor(k: number, dt: number): number {
  return 1 - Math.exp(-k * dt);
}

/** Exponential approach of x toward target with rate k. */
export function damp(x: number, target: number, k: number, dt: number): number {
  return x + (target - x) * expFactor(k, dt);
}

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export function dampAngle(a: number, target: number, k: number, dt: number): number {
  return a + wrapAngle(target - a) * expFactor(k, dt);
}

/** Move a toward b by at most maxDelta. */
export function approach(a: number, b: number, maxDelta: number): number {
  return a < b ? Math.min(a + maxDelta, b) : Math.max(a - maxDelta, b);
}

/**
 * Critically damped spring (scalar). `omega` = angular frequency (rad/s); higher = stiffer.
 * Exact integration (no overshoot, stable for any dt).
 */
export class Spring1 {
  x: number;
  v = 0;
  constructor(x = 0) {
    this.x = x;
  }
  step(target: number, omega: number, dt: number): number {
    const exp = Math.exp(-omega * dt);
    const change = this.x - target;
    const temp = (this.v + omega * change) * dt;
    this.v = (this.v - omega * temp) * exp;
    this.x = target + (change + temp) * exp;
    return this.x;
  }
  reset(x: number): void {
    this.x = x;
    this.v = 0;
  }
}

/** Critically damped spring for 3-vectors stored as plain numbers. */
export class Spring3 {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  set(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = this.vy = this.vz = 0;
  }
  step(tx: number, ty: number, tz: number, omega: number, dt: number): void {
    const exp = Math.exp(-omega * dt);
    let c = this.x - tx;
    let t = (this.vx + omega * c) * dt;
    this.vx = (this.vx - omega * t) * exp;
    this.x = tx + (c + t) * exp;
    c = this.y - ty;
    t = (this.vy + omega * c) * dt;
    this.vy = (this.vy - omega * t) * exp;
    this.y = ty + (c + t) * exp;
    c = this.z - tz;
    t = (this.vz + omega * c) * dt;
    this.vz = (this.vz - omega * t) * exp;
    this.z = tz + (c + t) * exp;
  }
}

/** CSS cubic-bezier(x1, y1, x2, y2) easing evaluated at x ∈ [0, 1]. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const dsx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = sx(t) - x;
    if (Math.abs(err) < 1e-6) break;
    const d = dsx(t);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  // Bisection fallback for robustness.
  if (sx(t) - x > 1e-4 || x - sx(t) > 1e-4) {
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
  }
  return ((ay * t + by) * t + cy) * t;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

export function easeInCubic(t: number): number {
  const c = clamp01(t);
  return c * c * c;
}

/** Piecewise-linear interpolation of y over sorted x knots. */
export function interpTable(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (n === 0) return 0;
  if (x <= (xs[0] as number)) return ys[0] as number;
  if (x >= (xs[n - 1] as number)) return ys[n - 1] as number;
  for (let i = 1; i < n; i++) {
    const x1 = xs[i] as number;
    if (x <= x1) {
      const x0 = xs[i - 1] as number;
      return lerp(ys[i - 1] as number, ys[i] as number, (x - x0) / (x1 - x0));
    }
  }
  return ys[n - 1] as number;
}

/** 1D gradient-ish noise for camera shake / flutter, deterministic, smooth, [-1, 1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const g = (n: number) => {
    let h = (n * 374761393 + seed * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h & 0xffff) / 0x8000 - 1) as number;
  };
  const a = g(i) * f;
  const b = g(i + 1) * (f - 1);
  const u = f * f * (3 - 2 * f);
  return (a + (b - a) * u) * 2;
}
