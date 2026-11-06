/**
 * Procedural pose description → per-bone local quaternions.
 * Limbs are posed by *aim* (where the upper arm / thigh points) plus hinge angles, so authoring stays
 * intuitive despite the A-pose rest. Angles are degrees. Chest space: +X = hero's left, +Y up, +Z front.
 */
import { Quaternion, Vector3, Euler } from 'three';
import { BONES, BONE_COUNT, boneIndex } from './skeleton.ts';

export type V3 = [number, number, number];

export interface ArmSpec {
  /** Upper-arm direction in chest space (need not be normalised). */
  dir: V3;
  /** Rotation of the upper arm about its own axis (deg); positive = external rotation. */
  twist?: number;
  elbow?: number;
  /** Forearm pronation/supination (deg). */
  pron?: number;
  wristFlex?: number;
  wristDev?: number;
  /** 0 = flat open hand, 1 = tight fist. */
  fist?: number;
  /** Finger spread 0..1 (flat-blade hands keep 0). */
  spread?: number;
  thumb?: number;
  clavUp?: number;
  clavFwd?: number;
}

export interface LegSpec {
  /** Hip flexion (deg, + = leg forward). */
  flex?: number;
  /** Abduction (deg, + = outward). */
  abd?: number;
  /** Internal(+)/external rotation (deg). */
  rot?: number;
  knee?: number;
  /** Ankle plantar-flexion (deg, + = toes down). */
  ankle?: number;
  toe?: number;
}

export interface Rot3 {
  pitch?: number;
  yaw?: number;
  roll?: number;
}

export interface PoseSpec {
  pelvis?: Rot3 & { offset?: V3 };
  spine?: Rot3;
  neck?: Rot3;
  head?: Rot3;
  jaw?: number;
  armL?: ArmSpec;
  armR?: ArmSpec;
  legL?: LegSpec;
  legR?: LegSpec;
}

/** Evaluated pose: local quaternion per bone + root (pelvis) offset. */
export interface PoseData {
  q: Float32Array; // BONE_COUNT * 4 (x, y, z, w)
  offset: Float32Array; // 3
}

export function makePoseData(): PoseData {
  const q = new Float32Array(BONE_COUNT * 4);
  for (let i = 0; i < BONE_COUNT; i++) q[i * 4 + 3] = 1;
  return { q, offset: new Float32Array(3) };
}

const D = Math.PI / 180;
const _q = new Quaternion();
const _q2 = new Quaternion();
const _q3 = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const _v2 = new Vector3();
const _axis = new Vector3();

const IDX = {
  pelvis: boneIndex('pelvis'),
  spine: [boneIndex('spine01'), boneIndex('spine02'), boneIndex('spine03'), boneIndex('spine04')],
  neck: boneIndex('neck'),
  head: boneIndex('head'),
  jaw: boneIndex('jaw'),
};
const SPINE_SHARE = [0.18, 0.24, 0.3, 0.28];

function restDir(from: string, to: string): Vector3 {
  const a = BONES[boneIndex(from)]!.head;
  const b = BONES[boneIndex(to)]!.head;
  return new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
}

interface ArmRig {
  clav: number;
  upper: number;
  upperTwist: number;
  fore: number;
  foreTwist: number;
  hand: number;
  sx: number;
  rest: Vector3;
  hinge: Vector3;
  palmN: Vector3;
  curlAxis: Vector3;
  fingers: number[][];
  thumb: number[];
  thumbAxis: Vector3;
  fingerZ: number[];
}

function armRig(side: 'L' | 'R'): ArmRig {
  const sx = side === 'L' ? 1 : -1;
  const rest = restDir(`upperarm_${side}`, `forearm_${side}`);
  const hinge = new Vector3(rest.y, -rest.x, 0).normalize(); // cross(rest, +Z)
  // Palm faces the thigh at rest: perpendicular to the arm, toward the body, in the frontal plane.
  const palmN = new Vector3(-sx * Math.abs(rest.y), -Math.abs(rest.x), 0).normalize();
  const curlAxis = new Vector3().crossVectors(rest, palmN).normalize();
  const fingers = ['index', 'middle', 'ring', 'pinky'].map((f) => [1, 2, 3].map((k) => boneIndex(`${f}${k}_${side}`)));
  const thumb = [1, 2, 3].map((k) => boneIndex(`thumb${k}_${side}`));
  const thumbDir = restDir(`thumb1_${side}`, `thumb2_${side}`);
  const thumbAxis = new Vector3().crossVectors(thumbDir, palmN).normalize();
  return {
    clav: boneIndex(`clavicle_${side}`),
    upper: boneIndex(`upperarm_${side}`),
    upperTwist: boneIndex(`upperarm_twist_${side}`),
    fore: boneIndex(`forearm_${side}`),
    foreTwist: boneIndex(`forearm_twist_${side}`),
    hand: boneIndex(`hand_${side}`),
    sx,
    rest,
    hinge,
    palmN,
    curlAxis,
    fingers,
    thumb,
    thumbAxis,
    fingerZ: [0.026, 0.008, -0.01, -0.027],
  };
}

interface LegRig {
  thigh: number;
  calf: number;
  foot: number;
  toe: number;
  sx: number;
}

function legRig(side: 'L' | 'R'): LegRig {
  return {
    thigh: boneIndex(`thigh_${side}`),
    calf: boneIndex(`calf_${side}`),
    foot: boneIndex(`foot_${side}`),
    toe: boneIndex(`toe_${side}`),
    sx: side === 'L' ? 1 : -1,
  };
}

const ARM_L = armRig('L');
const ARM_R = armRig('R');
const LEG_L = legRig('L');
const LEG_R = legRig('R');

function put(out: Float32Array, i: number, q: Quaternion): void {
  out[i * 4] = q.x;
  out[i * 4 + 1] = q.y;
  out[i * 4 + 2] = q.z;
  out[i * 4 + 3] = q.w;
}

function euler(r: Rot3 | undefined, scale = 1): Quaternion {
  if (!r) return _q.identity();
  _e.set((r.pitch ?? 0) * D * scale, (r.yaw ?? 0) * D * scale, (r.roll ?? 0) * D * scale, 'YXZ');
  return _q.setFromEuler(_e);
}

function evalArm(rig: ArmRig, a: ArmSpec | undefined, out: Float32Array): void {
  const spec: ArmSpec = a ?? { dir: [rig.sx * 0.17, -0.985, 0.02] };
  // Clavicle: shrug (raise outer end) and protraction.
  const cu = (spec.clavUp ?? 0) * D;
  const cf = (spec.clavFwd ?? 0) * D;
  const qClav = new Quaternion().setFromAxisAngle(_axis.set(0, 0, 1), rig.sx * cu);
  qClav.premultiply(_q2.setFromAxisAngle(_axis.set(0, 1, 0), -rig.sx * cf));
  put(out, rig.clav, qClav);

  // Upper arm: swing rest → target, plus twist about the rest axis (applied first).
  _v.set(spec.dir[0], spec.dir[1], spec.dir[2]).normalize();
  const swing = new Quaternion().setFromUnitVectors(rig.rest, _v);
  const twist = _q3.setFromAxisAngle(rig.rest, rig.sx * (spec.twist ?? 0) * D);
  const R = swing.multiply(twist);
  const local = qClav.clone().invert().multiply(R);
  put(out, rig.upper, local);
  // Twist helper: half of the twist, about the rest axis.
  put(out, rig.upperTwist, _q.setFromAxisAngle(rig.rest, -rig.sx * (spec.twist ?? 0) * D * 0.5));

  // Elbow hinge (+ = flexion, forearm toward the front).
  const elbow = Math.max(0, spec.elbow ?? 8);
  put(out, rig.fore, _q.setFromAxisAngle(rig.hinge, elbow * D));
  const pron = (spec.pron ?? 0) * D * rig.sx;
  put(out, rig.foreTwist, _q.setFromAxisAngle(rig.rest, pron * 0.5));

  // Hand: pronation about the forearm axis, then wrist flexion/deviation.
  const qh = new Quaternion().setFromAxisAngle(rig.rest, pron);
  qh.multiply(_q.setFromAxisAngle(rig.curlAxis, (spec.wristFlex ?? 0) * D));
  qh.multiply(_q.setFromAxisAngle(rig.palmN, (spec.wristDev ?? 0) * D * rig.sx));
  put(out, rig.hand, qh);

  // Fingers.
  const fist = spec.fist ?? 0.35;
  const spread = spec.spread ?? 0;
  const maxCurl = [72, 98, 64];
  rig.fingers.forEach((chain, fi) => {
    const zoff = rig.fingerZ[fi] as number;
    chain.forEach((bi, k) => {
      const curl = fist * (maxCurl[k] as number) * (1 + (fi === 3 ? 0.08 : 0)) * D;
      _q.setFromAxisAngle(rig.curlAxis, curl);
      if (k === 0 && spread !== 0) _q.premultiply(_q2.setFromAxisAngle(rig.palmN, -zoff * spread * 9));
      put(out, bi, _q);
    });
  });
  const thumb = spec.thumb ?? fist * 0.85;
  const tAngles = [24, 32, 30];
  rig.thumb.forEach((bi, k) => {
    put(out, bi, _q.setFromAxisAngle(rig.thumbAxis, thumb * (tAngles[k] as number) * D));
  });
}

function evalLeg(rig: LegRig, l: LegSpec | undefined, out: Float32Array): void {
  const s: LegSpec = l ?? {};
  const q = new Quaternion().setFromAxisAngle(_axis.set(1, 0, 0), -(s.flex ?? 0) * D);
  q.multiply(_q.setFromAxisAngle(_axis.set(0, 0, 1), rig.sx * (s.abd ?? 0) * D));
  q.multiply(_q.setFromAxisAngle(_axis.set(0, 1, 0), -rig.sx * (s.rot ?? 0) * D));
  put(out, rig.thigh, q);
  put(out, rig.calf, _q.setFromAxisAngle(_axis.set(1, 0, 0), Math.max(0, s.knee ?? 0) * D));
  put(out, rig.foot, _q.setFromAxisAngle(_axis.set(1, 0, 0), (s.ankle ?? 0) * D));
  put(out, rig.toe, _q.setFromAxisAngle(_axis.set(1, 0, 0), -(s.toe ?? 0) * D));
}

/** Evaluate a pose spec into local bone quaternions. */
export function evaluatePose(spec: PoseSpec, out: PoseData = makePoseData()): PoseData {
  const q = out.q;
  for (let i = 0; i < BONE_COUNT; i++) {
    q[i * 4] = 0;
    q[i * 4 + 1] = 0;
    q[i * 4 + 2] = 0;
    q[i * 4 + 3] = 1;
  }
  put(q, IDX.pelvis, euler(spec.pelvis));
  const off = spec.pelvis?.offset ?? [0, 0, 0];
  out.offset[0] = off[0];
  out.offset[1] = off[1];
  out.offset[2] = off[2];
  for (let k = 0; k < 4; k++) put(q, IDX.spine[k] as number, euler(spec.spine, SPINE_SHARE[k] as number));
  put(q, IDX.neck, euler(spec.neck));
  put(q, IDX.head, euler(spec.head));
  put(q, IDX.jaw, _q.setFromAxisAngle(_axis.set(1, 0, 0), (spec.jaw ?? 0) * D));
  evalArm(ARM_L, spec.armL, q);
  evalArm(ARM_R, spec.armR, q);
  evalLeg(LEG_L, spec.legL, q);
  evalLeg(LEG_R, spec.legR, q);
  return out;
}

/** Accumulate weighted poses with hemisphere-aligned nlerp. */
export function blendPoses(items: readonly { pose: PoseData; w: number }[], out: PoseData): PoseData {
  const q = out.q;
  q.fill(0);
  out.offset.fill(0);
  let total = 0;
  for (const it of items) total += it.w;
  if (total <= 1e-6) {
    for (let i = 0; i < BONE_COUNT; i++) q[i * 4 + 3] = 1;
    return out;
  }
  for (const it of items) {
    if (it.w <= 1e-5) continue;
    const w = it.w / total;
    const src = it.pose.q;
    for (let i = 0; i < BONE_COUNT; i++) {
      const o = i * 4;
      const dot = q[o]! * src[o]! + q[o + 1]! * src[o + 1]! + q[o + 2]! * src[o + 2]! + q[o + 3]! * src[o + 3]!;
      const s = dot < 0 ? -w : w;
      q[o] = q[o]! + src[o]! * s;
      q[o + 1] = q[o + 1]! + src[o + 1]! * s;
      q[o + 2] = q[o + 2]! + src[o + 2]! * s;
      q[o + 3] = q[o + 3]! + src[o + 3]! * s;
    }
    out.offset[0] = out.offset[0]! + it.pose.offset[0]! * w;
    out.offset[1] = out.offset[1]! + it.pose.offset[1]! * w;
    out.offset[2] = out.offset[2]! + it.pose.offset[2]! * w;
  }
  for (let i = 0; i < BONE_COUNT; i++) {
    const o = i * 4;
    const l = Math.hypot(q[o]!, q[o + 1]!, q[o + 2]!, q[o + 3]!) || 1;
    q[o] = q[o]! / l;
    q[o + 1] = q[o + 1]! / l;
    q[o + 2] = q[o + 2]! / l;
    q[o + 3] = q[o + 3]! / l;
  }
  return out;
}

/**
 * Per-bone critically damped rotational springs: the visible skeleton chases the blended target
 * pose so transitions never snap. Semi-implicit integration on the rotation-vector error.
 */
export class PoseSprings {
  readonly cur: PoseData = makePoseData();
  private readonly vel = new Float32Array(BONE_COUNT * 3);
  private readonly offV = new Float32Array(3);
  /** Angular frequency per bone (rad/s). */
  readonly omega = new Float32Array(BONE_COUNT).fill(16);
  private initialized = false;

  step(target: PoseData, dt: number, globalScale = 1): void {
    const cur = this.cur.q;
    const tq = target.q;
    if (!this.initialized) {
      cur.set(tq);
      this.cur.offset.set(target.offset);
      this.initialized = true;
      return;
    }
    const qc = _q;
    const qt = _q2;
    for (let i = 0; i < BONE_COUNT; i++) {
      const o = i * 4;
      qc.set(cur[o]!, cur[o + 1]!, cur[o + 2]!, cur[o + 3]!);
      qt.set(tq[o]!, tq[o + 1]!, tq[o + 2]!, tq[o + 3]!);
      // error = qt * qc^-1 (shortest arc)
      _q3.copy(qc).invert().premultiply(qt);
      if (_q3.w < 0) {
        _q3.x = -_q3.x;
        _q3.y = -_q3.y;
        _q3.z = -_q3.z;
        _q3.w = -_q3.w;
      }
      const sinHalf = Math.hypot(_q3.x, _q3.y, _q3.z);
      let ex = 0;
      let ey = 0;
      let ez = 0;
      if (sinHalf > 1e-7) {
        const ang = 2 * Math.atan2(sinHalf, _q3.w);
        const k = ang / sinHalf;
        ex = _q3.x * k;
        ey = _q3.y * k;
        ez = _q3.z * k;
      }
      const w = this.omega[i]! * globalScale;
      const vo = i * 3;
      let vx = this.vel[vo]!;
      let vy = this.vel[vo + 1]!;
      let vz = this.vel[vo + 2]!;
      // Exact-ish critically damped step (stable for w*dt up to ~1.5).
      const h = Math.min(dt, 1.2 / Math.max(w, 1e-3));
      vx += (w * w * ex - 2 * w * vx) * h;
      vy += (w * w * ey - 2 * w * vy) * h;
      vz += (w * w * ez - 2 * w * vz) * h;
      this.vel[vo] = vx;
      this.vel[vo + 1] = vy;
      this.vel[vo + 2] = vz;
      const ang = Math.hypot(vx, vy, vz) * dt;
      if (ang > 1e-9) {
        _axis.set(vx, vy, vz).normalize();
        _q3.setFromAxisAngle(_axis, ang);
        qc.premultiply(_q3).normalize();
      }
      cur[o] = qc.x;
      cur[o + 1] = qc.y;
      cur[o + 2] = qc.z;
      cur[o + 3] = qc.w;
    }
    // Pelvis offset spring.
    const wo = 14 * globalScale;
    for (let k = 0; k < 3; k++) {
      const e = target.offset[k]! - this.cur.offset[k]!;
      this.offV[k] = this.offV[k]! + (wo * wo * e - 2 * wo * this.offV[k]!) * dt;
      this.cur.offset[k] = this.cur.offset[k]! + this.offV[k]! * dt;
    }
  }

  snap(target: PoseData): void {
    this.cur.q.set(target.q);
    this.cur.offset.set(target.offset);
    this.vel.fill(0);
    this.offV.fill(0);
    this.initialized = true;
  }
}

/** Apply an additive rotation (axis in the bone's local rest axes) to a bone in a pose. */
export function addRotation(pose: PoseData, bone: number, axis: V3, angleRad: number): void {
  const o = bone * 4;
  _q.set(pose.q[o]!, pose.q[o + 1]!, pose.q[o + 2]!, pose.q[o + 3]!);
  _v2.set(axis[0], axis[1], axis[2]).normalize();
  _q2.setFromAxisAngle(_v2, angleRad);
  _q.multiply(_q2);
  pose.q[o] = _q.x;
  pose.q[o + 1] = _q.y;
  pose.q[o + 2] = _q.z;
  pose.q[o + 3] = _q.w;
}
