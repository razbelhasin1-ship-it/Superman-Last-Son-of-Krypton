/**
 * The cape: a Verlet cloth (spec 6.4), simulated in the hero's model space so it stays stable at any
 * speed. Relative wind saturates; body rotation and acceleration are fed in as (partial) fictitious
 * forces so the cape lags turns, flares on brakes and lifts on takeoff. Speed impulses travel down
 * the cloth as a visible "crack" wave.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import { T } from '../tuning.ts';
import { clamp, smoothstep } from '../core/math.ts';

interface Capsule {
  a: Vector3;
  b: Vector3;
  r: number;
}

const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();

export class Cape {
  readonly mesh: Mesh;
  readonly cols: number;
  readonly rows: number;
  /** Particle positions (model space) — current and previous. */
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  /** Rest pin positions relative to the chest bone (model space at rest). */
  private readonly pinRest: Float32Array;
  private readonly pinWeight: Float32Array;
  /** Draped rest shape (model space at rest) for the soft shape-matching force. */
  private readonly restShape: Float32Array;
  private readonly constraints: Int32Array;
  private readonly restLen: Float32Array;
  private readonly stiff: Float32Array;
  private readonly normals: Float32Array;
  readonly capsules: Capsule[] = [];
  private time = 0;
  private waves: { t: number; strength: number }[] = [];
  private readonly geo: BufferGeometry;
  private readonly upCols: number;
  private readonly upRows: number;
  private readonly upPos: Float32Array;
  private readonly upNorm: Float32Array;
  /** Wind used last step (model space, saturated), exposed for debug. */
  readonly wind = new Vector3();

  constructor() {
    const C = T.cape;
    this.cols = C.cols;
    this.rows = C.rows;
    const n = this.cols * this.rows;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.normals = new Float32Array(n * 3);
    this.pinRest = new Float32Array(n * 3);
    this.pinWeight = new Float32Array(n);

    // Rest layout: an arc around the back of the shoulders, hanging straight down and flaring.
    for (let r = 0; r < this.rows; r++) {
      const v = r / (this.rows - 1);
      const width = C.topWidth + (C.bottomWidth - C.topWidth) * Math.pow(v, 0.85);
      const y = 1.545 - v * C.length;
      for (let c = 0; c < this.cols; c++) {
        const u = c / (this.cols - 1) - 0.5; // −0.5 (left) … 0.5 (right)
        const i = r * this.cols + c;
        // Hero's left is +X: column 0 at +X.
        const x = -u * width;
        // Curve around the back; deeper at the top centre (around the neck), flatter lower.
        const curve = (1 - 4 * u * u) * (0.07 * (1 - v) + 0.02);
        const z = -0.075 - curve - v * 0.06;
        this.pos[i * 3] = x;
        this.pos[i * 3 + 1] = y;
        this.pos[i * 3 + 2] = z;
        if (r === 0) {
          // Top edge: pinned over the shoulders (outer columns sit on top of the shoulders).
          const shoulderLift = Math.abs(u) > 0.3 ? (Math.abs(u) - 0.3) * 0.15 : 0;
          this.pinRest[i * 3] = x * 1.02;
          this.pinRest[i * 3 + 1] = 1.548 - shoulderLift;
          this.pinRest[i * 3 + 2] = -0.055 - curve * 0.9 + Math.abs(u) * 0.06;
          this.pinWeight[i] = 1;
        } else if (r === 1) {
          // Upper back: partially pinned so the cape hugs the shoulder blades.
          this.pinRest[i * 3] = x;
          this.pinRest[i * 3 + 1] = y;
          this.pinRest[i * 3 + 2] = -0.13 - (1 - 4 * u * u) * 0.025;
          this.pinWeight[i] = 0.55;
        }
      }
    }
    this.prev.set(this.pos);
    this.restShape = new Float32Array(this.pos);

    // Constraints: structural (h, v), shear (diagonals), bend (skip one).
    const cons: number[] = [];
    const stiff: number[] = [];
    const add = (a: number, b: number, s: number) => {
      cons.push(a, b);
      stiff.push(s);
    };
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        if (c + 1 < this.cols) add(i, i + 1, 1);
        if (r + 1 < this.rows) add(i, i + this.cols, 1);
        if (c + 1 < this.cols && r + 1 < this.rows) {
          add(i, i + this.cols + 1, C.shearStiffness);
          add(i + 1, i + this.cols, C.shearStiffness);
        }
        if (c + 2 < this.cols) add(i, i + 2, C.bendStiffness);
        if (r + 2 < this.rows) add(i, i + 2 * this.cols, C.bendStiffness * 1.4);
      }
    }
    this.constraints = new Int32Array(cons);
    this.stiff = new Float32Array(stiff);
    this.restLen = new Float32Array(stiff.length);
    for (let k = 0; k < this.restLen.length; k++) {
      const a = this.constraints[k * 2]!;
      const b = this.constraints[k * 2 + 1]!;
      this.restLen[k] = Math.hypot(
        this.pos[a * 3]! - this.pos[b * 3]!,
        this.pos[a * 3 + 1]! - this.pos[b * 3 + 1]!,
        this.pos[a * 3 + 2]! - this.pos[b * 3 + 2]!,
      );
    }

    // Render geometry: 2× bicubic upsample.
    this.upCols = this.cols * 2 - 1;
    this.upRows = this.rows * 2 - 1;
    const un = this.upCols * this.upRows;
    this.upPos = new Float32Array(un * 3);
    this.upNorm = new Float32Array(un * 3);
    const uv = new Float32Array(un * 2);
    for (let r = 0; r < this.upRows; r++) {
      for (let c = 0; c < this.upCols; c++) {
        const i = r * this.upCols + c;
        uv[i * 2] = c / (this.upCols - 1);
        uv[i * 2 + 1] = 1 - r / (this.upRows - 1);
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < this.upRows - 1; r++) {
      for (let c = 0; c < this.upCols - 1; c++) {
        const a = r * this.upCols + c;
        const b = a + 1;
        const d = a + this.upCols;
        const e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(this.upPos, 3));
    this.geo.setAttribute('normal', new BufferAttribute(this.upNorm, 3));
    this.geo.setAttribute('uv', new BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    const mat = new MeshPhysicalMaterial({
      color: new Color('#8c1a22'),
      roughness: 0.72,
      metalness: 0,
      sheen: 1,
      sheenColor: new Color('#c4404a'),
      sheenRoughness: 0.5,
      side: DoubleSide,
      normalMap: makeCapeNormalMap(),
      normalScale: new Vector2(0.55, 0.55),
    });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.name = 'cape';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.updateGeometry();
  }

  /** Queue a crack wave travelling down the cape. */
  crack(strength: number): void {
    this.waves.push({ t: 0, strength });
  }

  /** Teleport/reset: re-hang the cape around the current pins. */
  reset(chest: Matrix4): void {
    const n = this.cols * this.rows;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / this.cols);
      const v = r / (this.rows - 1);
      _v.set(this.pinRest[(i % this.cols) * 3]!, 1.545 - v * T.cape.length, -0.12 - v * 0.06);
      _v.applyMatrix4(chest);
      this.pos[i * 3] = _v.x;
      this.pos[i * 3 + 1] = _v.y;
      this.pos[i * 3 + 2] = _v.z;
    }
    this.prev.set(this.pos);
  }

  /**
   * Step the cloth.
   * @param chest   chest bone matrix relative to its rest (model space), moves the pins
   * @param bodyQ   current body orientation (world), prevBodyQ previous step
   * @param velWorld hero velocity (world), accWorld acceleration (world)
   */
  step(
    dt: number,
    chest: Matrix4,
    bodyQ: Quaternion,
    prevBodyQ: Quaternion,
    velWorld: Vector3,
    accWorld: Vector3,
    gravityOn: number,
  ): void {
    const C = T.cape;
    this.time += dt;
    const n = this.cols * this.rows;
    const invQ = _q.copy(bodyQ).invert();
    const speed = velWorld.length();

    // 1) Rotation inertia: keep particles partially world-fixed when the body rotates.
    const dq = new Quaternion().copy(invQ).multiply(prevBodyQ); // prev model → current model
    if (Math.abs(dq.w) < 0.999999) {
      const part = new Quaternion().slerp(dq, C.rotationInertia);
      const pivot = _v2.set(0, 1.0, 0);
      for (let i = 0; i < n; i++) {
        if (this.pinWeight[i]! >= 1) continue;
        for (const arr of [this.pos, this.prev]) {
          _v.set(arr[i * 3]! - pivot.x, arr[i * 3 + 1]! - pivot.y, arr[i * 3 + 2]! - pivot.z).applyQuaternion(part);
          arr[i * 3] = _v.x + pivot.x;
          arr[i * 3 + 1] = _v.y + pivot.y;
          arr[i * 3 + 2] = _v.z + pivot.z;
        }
      }
    }

    // 2) External accelerations in model space.
    const g = _v.set(0, -C.gravity * gravityOn, 0).applyQuaternion(invQ);
    const gx = g.x;
    const gy = g.y;
    const gz = g.z;
    const acc = new Vector3().copy(accWorld).applyQuaternion(invQ).multiplyScalar(-C.accelInertia);
    const al = acc.length();
    if (al > C.accelMax) acc.multiplyScalar(C.accelMax / al);
    // Relative wind (model space), saturated magnitude.
    const windMag = Math.min(speed, C.windSat);
    const wind = this.wind.copy(velWorld).applyQuaternion(invQ).negate();
    if (speed > 1e-4) wind.multiplyScalar(windMag / speed);
    const fast = smoothstep(30, 400, speed);
    const flutterAmp = C.flutterAmp * (0.15 + 0.85 * smoothstep(8, 1200, speed)) * (0.35 + 0.65 * fast);
    const flutterFreq = C.flutterFreqMin + (C.flutterFreqMax - C.flutterFreqMin) * smoothstep(40, 2400, speed);
    const t = this.time;
    // Gentle idle breeze in hover so the cape is never dead.
    const breeze = 1 - smoothstep(4, 20, speed);
    const shapeK = C.shapeStiffness * (1 - smoothstep(60, 600, speed) * 0.8);

    this.computeNormals();
    const damp = C.damping;
    const dt2 = dt * dt;
    for (let i = 0; i < n; i++) {
      if (this.pinWeight[i]! >= 1) continue;
      const r = Math.floor(i / this.cols);
      const c = i % this.cols;
      const v = r / (this.rows - 1);
      const o = i * 3;
      const px = this.pos[o]!;
      const py = this.pos[o + 1]!;
      const pz = this.pos[o + 2]!;
      const vx = (px - this.prev[o]!) / dt;
      const vy = (py - this.prev[o + 1]!) / dt;
      const vz = (pz - this.prev[o + 2]!) / dt;
      const nx = this.normals[o]!;
      const ny = this.normals[o + 1]!;
      const nz = this.normals[o + 2]!;
      // Air relative to the particle.
      let rx = wind.x - vx;
      let ry = wind.y - vy;
      let rz = wind.z - vz;
      if (breeze > 0) {
        rx += breeze * 1.2 * Math.sin(t * 0.7 + v * 2.0);
        rz += breeze * (-0.9 + 0.6 * Math.sin(t * 0.43 + c * 0.3));
      }
      const rn = rx * nx + ry * ny + rz * nz;
      let ax = gx + acc.x + C.windTangentCoef * 10 * rx + C.windNormalCoef * 10 * rn * nx;
      let ay = gy + acc.y + C.windTangentCoef * 10 * ry + C.windNormalCoef * 10 * rn * ny;
      let az = gz + acc.z + C.windTangentCoef * 10 * rz + C.windNormalCoef * 10 * rn * nz;
      // Soft shape matching toward the draped rest pose (keeps the cape centred on the back; fades
      // at speed where the wind takes over). Only the lateral (x) and depth (z) components.
      if (shapeK > 0) {
        _v.set(this.restShape[o]!, this.restShape[o + 1]!, this.restShape[o + 2]!).applyMatrix4(chest);
        ax += (_v.x - px) * shapeK * 1.6;
        az += (_v.z - pz) * shapeK * (1 - fast * 0.7);
        ay += (_v.y - py) * shapeK * 0.25 * (1 - fast);
      }
      // Flutter: travelling noise wave along the normal, stronger toward the free edge.
      const edge = v * (0.6 + 0.4 * Math.abs(c / (this.cols - 1) - 0.5) * 2);
      const ph = t * flutterFreq * Math.PI * 2 - v * 9.0 + Math.sin(c * 0.9 + t * 3.1) * 0.8;
      const f = flutterAmp * edge * (Math.sin(ph) + 0.45 * Math.sin(ph * 1.93 + c * 0.6));
      ax += nx * f;
      ay += ny * f;
      az += nz * f;
      // Crack waves.
      for (const w of this.waves) {
        const front = w.t * C.waveSpeed;
        const d = (v - front) / 0.12;
        const k = Math.exp(-d * d) * w.strength * C.waveStrength * 180;
        ax += nx * k;
        ay += ny * k;
        az += nz * k;
      }
      // Verlet integrate.
      this.prev[o] = px;
      this.prev[o + 1] = py;
      this.prev[o + 2] = pz;
      this.pos[o] = px + (px - (px - vx * dt)) * damp + ax * dt2;
      this.pos[o + 1] = py + (py - (py - vy * dt)) * damp + ay * dt2;
      this.pos[o + 2] = pz + (pz - (pz - vz * dt)) * damp + az * dt2;
    }
    for (const w of this.waves) w.t += dt;
    this.waves = this.waves.filter((w) => w.t * C.waveSpeed < 1.4);

    // 3) Constraints + pins + collisions.
    for (let it = 0; it < C.iterations; it++) {
      this.applyPins(chest);
      const cons = this.constraints;
      for (let k = 0; k < this.restLen.length; k++) {
        const a = cons[k * 2]! * 3;
        const b = cons[k * 2 + 1]! * 3;
        const dx = this.pos[b]! - this.pos[a]!;
        const dy = this.pos[b + 1]! - this.pos[a + 1]!;
        const dz = this.pos[b + 2]! - this.pos[a + 2]!;
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const rest = this.restLen[k]!;
        // Bend/shear only resist compression weakly; structural is inextensible-ish.
        const diff = ((d - rest) / d) * this.stiff[k]!;
        const wa = 1 - this.pinWeight[a / 3]!;
        const wb = 1 - this.pinWeight[b / 3]!;
        const sum = wa + wb;
        if (sum < 1e-6) continue;
        const ka = (wa / sum) * diff;
        const kb = (wb / sum) * diff;
        this.pos[a] = this.pos[a]! + dx * ka;
        this.pos[a + 1] = this.pos[a + 1]! + dy * ka;
        this.pos[a + 2] = this.pos[a + 2]! + dz * ka;
        this.pos[b] = this.pos[b]! - dx * kb;
        this.pos[b + 1] = this.pos[b + 1]! - dy * kb;
        this.pos[b + 2] = this.pos[b + 2]! - dz * kb;
      }
      if (it % 2 === 1 || it === C.iterations - 1) this.collide();
    }
    this.applyPins(chest);
    this.updateGeometry();
  }

  private applyPins(chest: Matrix4): void {
    const n = this.cols * this.rows;
    for (let i = 0; i < n; i++) {
      const w = this.pinWeight[i]!;
      if (w <= 0) continue;
      _v.set(this.pinRest[i * 3]!, this.pinRest[i * 3 + 1]!, this.pinRest[i * 3 + 2]!).applyMatrix4(chest);
      const o = i * 3;
      this.pos[o] = this.pos[o]! + (_v.x - this.pos[o]!) * w;
      this.pos[o + 1] = this.pos[o + 1]! + (_v.y - this.pos[o + 1]!) * w;
      this.pos[o + 2] = this.pos[o + 2]! + (_v.z - this.pos[o + 2]!) * w;
      if (w >= 1) {
        this.prev[o] = this.pos[o]!;
        this.prev[o + 1] = this.pos[o + 1]!;
        this.prev[o + 2] = this.pos[o + 2]!;
      }
    }
  }

  private collide(): void {
    const n = this.cols * this.rows;
    const margin = T.cape.collisionMargin;
    for (const cap of this.capsules) {
      const ax = cap.a.x;
      const ay = cap.a.y;
      const az = cap.a.z;
      const bx = cap.b.x - ax;
      const by = cap.b.y - ay;
      const bz = cap.b.z - az;
      const bb = bx * bx + by * by + bz * bz || 1e-9;
      const R = cap.r + margin;
      for (let i = 0; i < n; i++) {
        if (this.pinWeight[i]! >= 1) continue;
        const o = i * 3;
        const px = this.pos[o]! - ax;
        const py = this.pos[o + 1]! - ay;
        const pz = this.pos[o + 2]! - az;
        const tt = clamp((px * bx + py * by + pz * bz) / bb, 0, 1);
        const dx = px - bx * tt;
        const dy = py - by * tt;
        const dz = pz - bz * tt;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1e-6;
          const k = (R - d) / d;
          this.pos[o] = this.pos[o]! + dx * k;
          this.pos[o + 1] = this.pos[o + 1]! + dy * k;
          this.pos[o + 2] = this.pos[o + 2]! + dz * k;
        }
      }
    }
  }

  private computeNormals(): void {
    const C = this.cols;
    const R = this.rows;
    const p = this.pos;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        const l = r * C + Math.max(0, c - 1);
        const rr = r * C + Math.min(C - 1, c + 1);
        const u = Math.max(0, r - 1) * C + c;
        const d = Math.min(R - 1, r + 1) * C + c;
        const tx = p[rr * 3]! - p[l * 3]!;
        const ty = p[rr * 3 + 1]! - p[l * 3 + 1]!;
        const tz = p[rr * 3 + 2]! - p[l * 3 + 2]!;
        const sx = p[d * 3]! - p[u * 3]!;
        const sy = p[d * 3 + 1]! - p[u * 3 + 1]!;
        const sz = p[d * 3 + 2]! - p[u * 3 + 2]!;
        // Outward (away from the back) normal.
        let nx = ty * sz - tz * sy;
        let ny = tz * sx - tx * sz;
        let nz = tx * sy - ty * sx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        this.normals[i * 3] = nx;
        this.normals[i * 3 + 1] = ny;
        this.normals[i * 3 + 2] = nz;
      }
    }
  }

  private updateGeometry(): void {
    const C = this.cols;
    const R = this.rows;
    const UC = this.upCols;
    const UR = this.upRows;
    const p = this.pos;
    const get = (r: number, c: number, k: number) => p[(clamp(r, 0, R - 1) * C + clamp(c, 0, C - 1)) * 3 + k]!;
    const cr = (a: number, b: number, c: number, d: number, t: number) =>
      0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    const tmp = new Float32Array(4);
    for (let ur = 0; ur < UR; ur++) {
      const fr = ur / 2;
      const r1 = Math.floor(fr);
      const tr = fr - r1;
      for (let uc = 0; uc < UC; uc++) {
        const fc = uc / 2;
        const c1 = Math.floor(fc);
        const tc = fc - c1;
        const o = (ur * UC + uc) * 3;
        for (let k = 0; k < 3; k++) {
          for (let j = -1; j <= 2; j++) {
            tmp[j + 1] = cr(get(r1 + j, c1 - 1, k), get(r1 + j, c1, k), get(r1 + j, c1 + 1, k), get(r1 + j, c1 + 2, k), tc);
          }
          this.upPos[o + k] = cr(tmp[0]!, tmp[1]!, tmp[2]!, tmp[3]!, tr);
        }
      }
    }
    // Normals on the upsampled grid.
    const P = this.upPos;
    for (let r = 0; r < UR; r++) {
      for (let c = 0; c < UC; c++) {
        const i = r * UC + c;
        const l = r * UC + Math.max(0, c - 1);
        const rr = r * UC + Math.min(UC - 1, c + 1);
        const u = Math.max(0, r - 1) * UC + c;
        const d = Math.min(UR - 1, r + 1) * UC + c;
        const tx = P[rr * 3]! - P[l * 3]!;
        const ty = P[rr * 3 + 1]! - P[l * 3 + 1]!;
        const tz = P[rr * 3 + 2]! - P[l * 3 + 2]!;
        const sx = P[d * 3]! - P[u * 3]!;
        const sy = P[d * 3 + 1]! - P[u * 3 + 1]!;
        const sz = P[d * 3 + 2]! - P[u * 3 + 2]!;
        let nx = ty * sz - tz * sy;
        let ny = tz * sx - tx * sz;
        let nz = tx * sy - ty * sx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        this.upNorm[i * 3] = -nx;
        this.upNorm[i * 3 + 1] = -ny;
        this.upNorm[i * 3 + 2] = -nz;
      }
    }
    (this.geo.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geo.attributes.normal as BufferAttribute).needsUpdate = true;
    this.geo.computeBoundingSphere();
    void _m;
  }
}

/** Procedural fabric normal map: fine twill weave + soft vertical folds. */
function makeCapeNormalMap(): CanvasTexture {
  const S = 256;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) return new CanvasTexture(null as unknown as HTMLCanvasElement);
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(S, S);
  const h = (x: number, y: number) => {
    const weave = Math.sin((x + y) * 0.8) * 0.5 + Math.sin((x - y) * 0.8 + 1.3) * 0.25;
    const folds = Math.sin((x / S) * Math.PI * 6 + Math.sin((y / S) * Math.PI * 2) * 1.2) * 6;
    return weave * 0.9 + folds;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const nx = -dx * 0.25;
      const ny = -dy * 0.25;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(3, 5);
  tex.colorSpace = '' as never;
  void SRGBColorSpace;
  return tex;
}
