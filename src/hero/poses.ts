/**
 * Pose library (spec 6.5). Limb directions are in chest space: +X hero's left, +Y up (toward the
 * head — "forward" in prone flight), +Z front (chest). Angles in degrees.
 */
import type { PoseSpec, V3 } from './pose.ts';

const mirror = (d: V3): V3 => [-d[0], d[1], d[2]];

const relaxedL: V3 = [0.16, -0.985, 0.03];

export const POSES: Record<string, PoseSpec> = {
  idle: {
    spine: { pitch: 1 },
    head: { pitch: -2 },
    armL: { dir: relaxedL, elbow: 12, fist: 0.5, pron: 5 },
    armR: { dir: mirror(relaxedL), elbow: 12, fist: 0.5, pron: 5 },
    legL: { abd: 4, knee: 3, rot: -4 },
    legR: { abd: 4, knee: 3, rot: -4 },
  },
  /** Fists on hips, chest out — the classic stance. */
  heroic: {
    spine: { pitch: -5 },
    neck: { pitch: -3 },
    head: { pitch: -4, yaw: 6 },
    armL: { dir: [0.74, -0.6, -0.3], twist: 70, elbow: 112, fist: 1, pron: 20, wristFlex: -15, clavUp: 4 },
    armR: { dir: [-0.74, -0.6, -0.3], twist: 70, elbow: 112, fist: 1, pron: 20, wristFlex: -15, clavUp: 4 },
    legL: { abd: 9, knee: 2, rot: -8 },
    legR: { abd: 9, knee: 2, rot: -8 },
  },
  crouch: {
    pelvis: { offset: [0, -0.18, -0.02] },
    spine: { pitch: 18 },
    head: { pitch: -12 },
    armL: { dir: [0.25, -0.86, 0.38], elbow: 30, fist: 0.8 },
    armR: { dir: [-0.25, -0.86, 0.38], elbow: 30, fist: 0.8 },
    legL: { flex: 42, abd: 6, knee: 74, ankle: -24 },
    legR: { flex: 42, abd: 6, knee: 74, ankle: -24 },
  },
  /** Deep coiled charge for power launch / super-leap. */
  charge: {
    pelvis: { offset: [0, -0.36, -0.05], pitch: 10 },
    spine: { pitch: 34 },
    neck: { pitch: -18 },
    head: { pitch: -22 },
    armL: { dir: [0.38, -0.66, -0.62], elbow: 40, fist: 1, clavUp: 6 },
    armR: { dir: [-0.38, -0.66, -0.62], elbow: 40, fist: 1, clavUp: 6 },
    legL: { flex: 72, abd: 10, knee: 118, ankle: -38 },
    legR: { flex: 72, abd: 10, knee: 118, ankle: -38 },
  },
  /** Hover: upright, arms relaxed, fists loosely closed, legs together, toes pointing down. */
  hover: {
    spine: { pitch: 0 },
    head: { pitch: -2 },
    armL: { dir: [0.13, -0.99, 0.03], elbow: 9, fist: 0.62, pron: 8 },
    armR: { dir: [-0.13, -0.99, 0.03], elbow: 9, fist: 0.62, pron: 8 },
    legL: { abd: -1, knee: 5, ankle: 36, rot: 2 },
    legR: { abd: -1, knee: 9, ankle: 38, rot: 2 },
  },
  glide: {
    spine: { pitch: -6 },
    neck: { pitch: -10 },
    head: { pitch: -18 },
    armL: { dir: [0.4, -0.8, -0.44], elbow: 16, fist: 0.45 },
    armR: { dir: [-0.4, -0.8, -0.44], elbow: 16, fist: 0.45 },
    legL: { knee: 10, ankle: 48 },
    legR: { knee: 18, ankle: 50, flex: -4 },
  },
  /** Cruise: one fist forward (right), the other arm along the body. */
  cruise: {
    spine: { pitch: -8 },
    neck: { pitch: -24 },
    head: { pitch: -46 },
    armR: { dir: [-0.12, 0.965, 0.23], elbow: 6, fist: 1, pron: 0, clavUp: 10 },
    armL: { dir: [0.16, -0.975, -0.15], elbow: 12, fist: 0.85, pron: 10 },
    legL: { knee: 4, ankle: 58, abd: 0 },
    legR: { knee: 12, ankle: 58, flex: -3, abd: -1 },
  },
  /** Dash and above: both fists forward, legs together, toes pointed. */
  dash: {
    spine: { pitch: -10 },
    neck: { pitch: -26 },
    head: { pitch: -42 },
    armR: { dir: [-0.07, 0.97, 0.24], elbow: 4, fist: 1, clavUp: 16 },
    armL: { dir: [0.07, 0.97, 0.24], elbow: 4, fist: 1, clavUp: 16 },
    legL: { knee: 2, ankle: 64, abd: -2 },
    legR: { knee: 3, ankle: 64, abd: -2 },
  },
  supersonic: {
    spine: { pitch: -12 },
    neck: { pitch: -28 },
    head: { pitch: -40 },
    armR: { dir: [-0.035, 0.985, 0.17], elbow: 2, fist: 1, clavUp: 22 },
    armL: { dir: [0.035, 0.985, 0.17], elbow: 2, fist: 1, clavUp: 22 },
    legL: { knee: 0, ankle: 70, abd: -3 },
    legR: { knee: 0, ankle: 70, abd: -3 },
  },
  /** Brake flare: chest up, arms spread forward and down, legs swing forward. */
  brake: {
    spine: { pitch: -16 },
    neck: { pitch: 6 },
    head: { pitch: 6 },
    armL: { dir: [0.75, -0.3, 0.6], elbow: 22, fist: 0.1, spread: 0.6, clavUp: 6 },
    armR: { dir: [-0.75, -0.3, 0.6], elbow: 22, fist: 0.1, spread: 0.6, clavUp: 6 },
    legL: { flex: 38, knee: 26, ankle: 8, abd: 5 },
    legR: { flex: 24, knee: 40, ankle: 12, abd: 5 },
  },
  /** Just after a launch: one fist punching skyward. */
  launch: {
    spine: { pitch: -4 },
    head: { pitch: -10 },
    armR: { dir: [-0.08, 0.99, 0.1], elbow: 2, fist: 1, clavUp: 14 },
    armL: { dir: [0.18, -0.97, -0.12], elbow: 10, fist: 0.9 },
    legL: { knee: 4, ankle: 52 },
    legR: { knee: 22, ankle: 52, flex: 8 },
  },
  leapUp: {
    spine: { pitch: -6 },
    head: { pitch: -14 },
    armR: { dir: [-0.15, 0.95, 0.25], elbow: 10, fist: 1, clavUp: 10 },
    armL: { dir: [0.35, -0.85, -0.4], elbow: 18, fist: 0.8 },
    legL: { knee: 10, ankle: 40, flex: -8 },
    legR: { knee: 55, ankle: 35, flex: 25 },
  },
  fall: {
    spine: { pitch: 8 },
    head: { pitch: -10 },
    armL: { dir: [0.78, -0.22, 0.25], elbow: 25, fist: 0.4, spread: 0.3 },
    armR: { dir: [-0.78, -0.22, 0.25], elbow: 25, fist: 0.4, spread: 0.3 },
    legL: { flex: 18, knee: 30, ankle: 10 },
    legR: { flex: 8, knee: 45, ankle: 15 },
  },
  /** Three-point hero landing: right knee and right fist down, left foot planted, left arm back. */
  heroLanding: {
    pelvis: { offset: [0, -0.5, -0.06], pitch: 8 },
    spine: { pitch: 38, yaw: -6 },
    neck: { pitch: -20 },
    head: { pitch: -24 },
    armR: { dir: [-0.12, -0.72, 0.68], elbow: 6, fist: 1, clavFwd: 8 },
    armL: { dir: [0.62, -0.2, -0.76], elbow: 18, fist: 0.15, spread: 0.4 },
    legL: { flex: 88, abd: 10, knee: 98, ankle: -20 },
    legR: { flex: 6, abd: 4, knee: 122, ankle: 30, toe: 30 },
  },
  softLand: {
    pelvis: { offset: [0, -0.08, 0] },
    spine: { pitch: 8 },
    armL: { dir: [0.3, -0.92, 0.2], elbow: 18, fist: 0.5 },
    armR: { dir: [-0.3, -0.92, 0.2], elbow: 18, fist: 0.5 },
    legL: { flex: 22, knee: 34, ankle: -14, abd: 5 },
    legR: { flex: 22, knee: 34, ankle: -14, abd: 5 },
  },
};

/**
 * Procedural gait. phase ∈ [0, 1) per full cycle (two steps). `run` 0 = walk, 1 = run, 2 = sprint.
 */
export function gaitPose(phase: number, run: number): PoseSpec {
  const t = phase * Math.PI * 2;
  const s = Math.sin(t);
  const c = Math.cos(t);
  const r = Math.min(run, 1);
  const sp = Math.max(0, run - 1);
  const thighAmp = 24 + 20 * r + 8 * sp;
  const kneeBase = 6 + 10 * r;
  const kneeSwing = 38 + 52 * r + 20 * sp;
  const armAmp = 18 + 26 * r + 12 * sp;
  const elbow = 14 + 66 * r + 10 * sp;
  const lean = 2 + 8 * r + 16 * sp;
  // Knee flexes most mid-swing (when the thigh is moving forward).
  const kneeL = kneeBase + kneeSwing * Math.max(0, Math.sin(t + 0.9)) ** 1.5;
  const kneeR = kneeBase + kneeSwing * Math.max(0, Math.sin(t + Math.PI + 0.9)) ** 1.5;
  const bob = -0.02 * (1 + r) * Math.abs(c);
  return {
    pelvis: { offset: [0, bob - 0.03 * r, 0], yaw: 6 * s * (1 - 0.3 * r), roll: 3 * c },
    spine: { pitch: lean, yaw: -9 * s * (1 - 0.3 * r), roll: -2 * c },
    neck: { pitch: -lean * 0.4 },
    head: { pitch: -lean * 0.3, yaw: 3 * s },
    legL: { flex: thighAmp * s + 4 * r, knee: kneeL, ankle: -6 + 18 * Math.max(0, -s), abd: 2 },
    legR: { flex: -thighAmp * s + 4 * r, knee: kneeR, ankle: -6 + 18 * Math.max(0, s), abd: 2 },
    armL: {
      dir: [0.14, -Math.cos(armAmp * -s * (Math.PI / 180)), Math.sin(armAmp * -s * (Math.PI / 180))],
      elbow: elbow + 10 * Math.max(0, -s),
      fist: 0.55 + 0.45 * r,
      pron: 10,
    },
    armR: {
      dir: [-0.14, -Math.cos(armAmp * s * (Math.PI / 180)), Math.sin(armAmp * s * (Math.PI / 180))],
      elbow: elbow + 10 * Math.max(0, s),
      fist: 0.55 + 0.45 * r,
      pron: 10,
    },
  };
}

export const POSE_NAMES = Object.keys(POSES);
