/**
 * Box-based collision world: terrain height function + Y-rotated boxes in a uniform XZ grid.
 * Swept-sphere queries are exact against the radius-expanded box (slab test), so the hero never
 * tunnels, even at 6,000 m/s (100 m per step).
 */
import { Vector3 } from 'three';
import type { BoxCollider, CollisionWorld, SurfaceKind, SweepHit } from '../contracts.ts';

const CELL = 64;

export interface TerrainFn {
  height(x: number, z: number): number;
  water(x: number, z: number): boolean;
}

const FLAT: TerrainFn = { height: () => 0, water: () => false };

export class BoxCollisionWorld implements CollisionWorld {
  readonly boxes: BoxCollider[] = [];
  private cos: number[] = [];
  private sin: number[] = [];
  private grid = new Map<number, number[]>();
  private stamp: Uint32Array = new Uint32Array(1024);
  private stampId = 1;
  waterLevel = -1.2;
  private terrain: TerrainFn;

  constructor(terrain: TerrainFn = FLAT) {
    this.terrain = terrain;
  }

  setTerrain(t: TerrainFn): void {
    this.terrain = t;
  }

  groundHeight(x: number, z: number): number {
    return this.terrain.height(x, z);
  }

  isWater(x: number, z: number): boolean {
    return this.terrain.water(x, z);
  }

  /** Surface the hero can stand/hover over: water surface or terrain. */
  surfaceHeight(x: number, z: number): number {
    return this.terrain.water(x, z) ? this.waterLevel : this.terrain.height(x, z);
  }

  clear(): void {
    this.boxes.length = 0;
    this.cos.length = 0;
    this.sin.length = 0;
    this.grid.clear();
  }

  addBox(b: BoxCollider): number {
    const id = this.boxes.length;
    this.boxes.push(b);
    this.cos.push(Math.cos(b.yaw));
    this.sin.push(Math.sin(b.yaw));
    const r = Math.hypot(b.hx, b.hz);
    const x0 = Math.floor((b.cx - r) / CELL);
    const x1 = Math.floor((b.cx + r) / CELL);
    const z0 = Math.floor((b.cz - r) / CELL);
    const z1 = Math.floor((b.cz + r) / CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const key = cellKey(gx, gz);
        let list = this.grid.get(key);
        if (!list) {
          list = [];
          this.grid.set(key, list);
        }
        list.push(id);
      }
    }
    if (this.stamp.length < this.boxes.length) {
      const s = new Uint32Array(this.boxes.length * 2);
      s.set(this.stamp);
      this.stamp = s;
    }
    return id;
  }

  /** Remove boxes whose tag starts with prefix (streaming unload). Rebuilds the grid. */
  removeTagged(prefix: string): void {
    const keep = this.boxes.filter((b) => !(b.tag && b.tag.startsWith(prefix)));
    this.clear();
    for (const b of keep) this.addBox(b);
  }

  private candidates(x0: number, z0: number, x1: number, z1: number, pad: number, out: number[]): void {
    out.length = 0;
    this.stampId++;
    if (this.stampId === 0xffffffff) {
      this.stamp.fill(0);
      this.stampId = 1;
    }
    const gx0 = Math.floor((Math.min(x0, x1) - pad) / CELL);
    const gx1 = Math.floor((Math.max(x0, x1) + pad) / CELL);
    const gz0 = Math.floor((Math.min(z0, z1) - pad) / CELL);
    const gz1 = Math.floor((Math.max(z0, z1) + pad) / CELL);
    // For long segments, walk cells along the segment instead of the full bounding rectangle.
    const span = (gx1 - gx0 + 1) * (gz1 - gz0 + 1);
    if (span > 64) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.ceil(len / (CELL * 0.5)) + 1;
      const pc = Math.ceil(pad / CELL) + 1;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const cx = Math.floor((x0 + (x1 - x0) * t) / CELL);
        const cz = Math.floor((z0 + (z1 - z0) * t) / CELL);
        for (let dx = -pc; dx <= pc; dx++) for (let dz = -pc; dz <= pc; dz++) this.collect(cx + dx, cz + dz, out);
      }
      return;
    }
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) this.collect(gx, gz, out);
  }

  private collect(gx: number, gz: number, out: number[]): void {
    const list = this.grid.get(cellKey(gx, gz));
    if (!list) return;
    for (const id of list) {
      if (this.stamp[id] !== this.stampId) {
        this.stamp[id] = this.stampId;
        out.push(id);
      }
    }
  }

  private scratch: number[] = [];

  sweepSphere(from: Vector3, to: Vector3, radius: number, out: SweepHit): boolean {
    let bestT = Infinity;
    let bestId = -2;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let kind: SurfaceKind = 'none';

    // Terrain / water: treat the surface as a horizontal plane at the local height (sampled at both ends).
    const g0 = this.surfaceHeight(from.x, from.z);
    const g1 = this.surfaceHeight(to.x, to.z);
    const y0 = from.y - radius - g0;
    const y1 = to.y - radius - g1;
    if (y0 >= -1e-4 && y1 < 0) {
      const t = y0 / (y0 - y1);
      if (t < bestT) {
        bestT = t;
        bestId = -1;
        nx = 0;
        ny = 1;
        nz = 0;
        kind = this.isWater(to.x, to.z) ? 'water' : 'ground';
      }
    }

    const ids = this.scratch;
    this.candidates(from.x, from.z, to.x, to.z, radius + 1, ids);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    for (const id of ids) {
      const b = this.boxes[id]!;
      const c = this.cos[id]!;
      const s = this.sin[id]!;
      // Into box-local space (rotate by −yaw about Y).
      const ox = from.x - b.cx;
      const oz = from.z - b.cz;
      const lx = c * ox - s * oz;
      const lz = s * ox + c * oz;
      const ly = from.y - b.cy;
      const ldx = c * dx - s * dz;
      const ldz = s * dx + c * dz;
      const ldy = dy;
      const ex = b.hx + radius;
      const ey = b.hy + radius;
      const ez = b.hz + radius;
      let tmin = 0;
      let tmax = 1;
      let axis = -1;
      let sign = 0;
      let inside = true;
      // Slab test per axis.
      const slabs: [number, number, number][] = [
        [lx, ldx, ex],
        [ly, ldy, ey],
        [lz, ldz, ez],
      ];
      let miss = false;
      for (let a = 0; a < 3; a++) {
        const [o, d, e] = slabs[a]!;
        if (o < -e || o > e) inside = false;
        if (Math.abs(d) < 1e-12) {
          if (o < -e || o > e) {
            miss = true;
            break;
          }
          continue;
        }
        const inv = 1 / d;
        let t1 = (-e - o) * inv;
        let t2 = (e - o) * inv;
        let sgn = -1;
        if (t1 > t2) {
          const tt = t1;
          t1 = t2;
          t2 = tt;
          sgn = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          axis = a;
          sign = sgn;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) {
          miss = true;
          break;
        }
      }
      if (miss) continue;
      if (inside) {
        // Started inside (e.g. after a numeric slip): push out along the shallowest axis.
        const px = ex - Math.abs(lx);
        const py = ey - Math.abs(ly);
        const pz = ez - Math.abs(lz);
        if (px <= py && px <= pz) {
          axis = 0;
          sign = Math.sign(lx) || 1;
        } else if (py <= pz) {
          axis = 1;
          sign = Math.sign(ly) || 1;
        } else {
          axis = 2;
          sign = Math.sign(lz) || 1;
        }
        // Only report if moving deeper into the box along that axis.
        const along = axis === 0 ? ldx : axis === 1 ? ldy : ldz;
        if (along * sign >= 0) continue;
        tmin = 0;
      }
      if (axis < 0) continue;
      if (tmin < bestT) {
        bestT = tmin;
        bestId = id;
        // Local normal → world (rotate by +yaw).
        let lnx = 0;
        let lny = 0;
        let lnz = 0;
        if (axis === 0) lnx = sign;
        else if (axis === 1) lny = sign;
        else lnz = sign;
        nx = c * lnx + s * lnz;
        ny = lny;
        nz = -s * lnx + c * lnz;
        kind = b.kind;
      }
    }

    if (bestId === -2) return false;
    const t = Math.max(0, bestT);
    out.t = t;
    // Back off slightly so the next query starts outside the surface.
    const len = Math.hypot(dx, dy, dz);
    const back = len > 1e-9 ? Math.min(t, 0.01 / len) : 0;
    out.point.set(from.x + dx * (t - back), from.y + dy * (t - back), from.z + dz * (t - back));
    out.normal.set(nx, ny, nz);
    out.kind = kind;
    out.id = bestId;
    return true;
  }

  nearestDistance(p: Vector3, maxDist: number, outPoint?: Vector3): number {
    const ids = this.scratch;
    this.candidates(p.x, p.z, p.x, p.z, maxDist, ids);
    let best = Infinity;
    for (const id of ids) {
      const b = this.boxes[id]!;
      const c = this.cos[id]!;
      const s = this.sin[id]!;
      const ox = p.x - b.cx;
      const oz = p.z - b.cz;
      const lx = c * ox - s * oz;
      const lz = s * ox + c * oz;
      const ly = p.y - b.cy;
      const qx = Math.max(-b.hx, Math.min(b.hx, lx));
      const qy = Math.max(-b.hy, Math.min(b.hy, ly));
      const qz = Math.max(-b.hz, Math.min(b.hz, lz));
      const d = Math.hypot(lx - qx, ly - qy, lz - qz);
      if (d < best && d <= maxDist) {
        best = d;
        if (outPoint) {
          // back to world
          outPoint.set(b.cx + c * qx + s * qz, b.cy + qy, b.cz - s * qx + c * qz);
        }
      }
    }
    return best;
  }

  supportHeight(x: number, z: number, maxY: number): number {
    const ids = this.scratch;
    this.candidates(x, z, x, z, 0, ids);
    let h = this.surfaceHeight(x, z);
    for (const id of ids) {
      const b = this.boxes[id]!;
      const top = b.cy + b.hy;
      if (top > maxY || top <= h) continue;
      const c = this.cos[id]!;
      const s = this.sin[id]!;
      const ox = x - b.cx;
      const oz = z - b.cz;
      const lx = c * ox - s * oz;
      const lz = s * ox + c * oz;
      if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz) h = top;
    }
    return h;
  }

  /** Highest box top under (x, z) within the column, or terrain height. */
  topHeight(x: number, z: number): number {
    const ids = this.scratch;
    this.candidates(x, z, x, z, 0, ids);
    let h = this.surfaceHeight(x, z);
    for (const id of ids) {
      const b = this.boxes[id]!;
      const c = this.cos[id]!;
      const s = this.sin[id]!;
      const ox = x - b.cx;
      const oz = z - b.cz;
      const lx = c * ox - s * oz;
      const lz = s * ox + c * oz;
      if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz) h = Math.max(h, b.cy + b.hy);
    }
    return h;
  }
}

function cellKey(gx: number, gz: number): number {
  return ((gx + 32768) & 0xffff) * 65536 + ((gz + 32768) & 0xffff);
}
