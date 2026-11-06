/**
 * The Play sequence (spec 5.2) and handoff to gameplay (5.3).
 *
 * Camera keys are calibrated against reference/play-sequence-storyboard.png (FOV 20°):
 *   0 s 42 % of frame (13 m) · 4.0 s full body 71 % (7.6 m) · 5.5 s ankles-up (5.5 m)
 *   6.5 s waist-up (3.4 m) · 7.5 s belt-up (2.6 m) · 9–11 s head + upper chest (1.8 m)
 * The dolly runs 2.5 → 8.5 s through a monotone cubic (eased at both ends); the look target rises so
 * the face stays in the upper third. Acting beats: eyes closed 6.0–7.3 with one slow breath, eyes open
 * and a small head turn toward frame-right 7.3–8.5, held with micro-motion and one blink, the line at
 * 9.0 s ("Let's see what today brings.") with a jaw envelope, a small smile at 11.6 s, then the dive
 * through the cloud layer that reveals the city and hands control over at 13.4 s.
 */
import { Quaternion, Vector3 } from 'three';
import { clamp01, cubicBezier, lerp, smoothstep, DEG, noise1 } from '../core/math.ts';

export const LINE = "Let's see what today brings.";
export const T_DIVE = 12.4;
export const T_CONTROL = 13.4;
export const T_END = 15.0;

/** Fritsch–Carlson monotone cubic through (xs, ys). */
export function monotoneCubic(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  m[0] = 0; // eased start
  m[n - 1] = 0; // eased end
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1]! * d[i]! <= 0) m[i] = 0;
    else {
      const w1 = 2 * (xs[i + 1]! - xs[i]!) + (xs[i]! - xs[i - 1]!);
      const w2 = xs[i + 1]! - xs[i]! + 2 * (xs[i]! - xs[i - 1]!);
      m[i] = (w1 + w2) / (w1 / d[i - 1]! + w2 / d[i]!);
    }
  }
  return (x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let i = 0;
    while (x > xs[i + 1]!) i++;
    const h = xs[i + 1]! - xs[i]!;
    const t = (x - xs[i]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i]! + (t3 - 2 * t2 + t) * h * m[i]! + (-2 * t3 + 3 * t2) * ys[i + 1]! + (t3 - t2) * h * m[i + 1]!
    );
  };
}

/** Camera distance (m) to the hero over time. */
export const introDistance = monotoneCubic(
  [0, 2.5, 4.0, 5.5, 6.5, 7.5, 8.5, 12.4],
  [13.0, 12.4, 7.6, 5.5, 3.4, 2.55, 1.82, 1.8],
);

/** Look-target height above the hero's feet for a camera distance. */
export function introTargetHeight(dist: number): number {
  return Math.max(0.98, 1.97 - 0.1764 * dist);
}

export interface IntroPose {
  /** Camera position + look target (world). */
  camPos: Vector3;
  camTarget: Vector3;
  fov: number;
  roll: number;
  /** Background depth-of-field 0..1. */
  dof: number;
  focusDist: number;
  /** Hero acting. */
  eyesClosed: number;
  blink: number;
  headYaw: number;
  headPitch: number;
  gazeYaw: number;
  gazePitch: number;
  jaw: number;
  smile: number;
  breathAmp: number;
  /** Breeze (world velocity of the air) for the cape. */
  breeze: Vector3;
  subtitle: number;
  /** Hero placement during the scripted part (feet position, facing quaternion, lean). */
  heroFeet: Vector3;
  heroLean: number;
  heroFall: number;
  mist: number;
  hudFade: number;
  controlBlend: number;
}

/**
 * Pure timeline: maps time → camera/hero/effects state. `anchor` is the hero's feet at the hover
 * point, `facing` the unit horizontal vector from the hero toward the camera.
 */
export class PlaySequence {
  readonly anchor: Vector3;
  readonly facing: Vector3;
  private readonly right: Vector3;
  readonly heroQ = new Quaternion();
  readonly pose: IntroPose;

  constructor(anchor: Vector3, facing: Vector3) {
    this.anchor = anchor.clone();
    this.facing = facing.clone().setY(0).normalize();
    // Camera's right (screen right) when looking at the hero: cross(look, up) with look = −facing.
    const look = this.facing.clone().negate();
    this.right = new Vector3().crossVectors(look, new Vector3(0, 1, 0)).normalize();
    // Hero faces the camera: model +Z → facing.
    this.heroQ.setFromUnitVectors(new Vector3(0, 0, 1), this.facing);
    this.pose = {
      camPos: new Vector3(),
      camTarget: new Vector3(),
      fov: 20,
      roll: 0,
      dof: 0,
      focusDist: 13,
      eyesClosed: 0,
      blink: 0,
      headYaw: 0,
      headPitch: 0,
      gazeYaw: 0,
      gazePitch: 0,
      jaw: 0,
      smile: 0,
      breathAmp: 1,
      breeze: new Vector3(),
      subtitle: 0,
      heroFeet: this.anchor.clone(),
      heroLean: 0,
      heroFall: 0,
      mist: 0,
      hudFade: 0,
      controlBlend: 0,
    };
  }

  /** Evaluate the timeline at time t (seconds since Play). */
  evaluate(t: number): IntroPose {
    const p = this.pose;
    const A = this.anchor;
    // ── Hero: hover bob is applied by the visual; here only acting.
    // Eyes closed 6.0–7.3 (with soft lid transitions); one natural blink ≈ 10.3 s.
    p.eyesClosed = smoothstep(5.85, 6.15, t) * (1 - smoothstep(7.2, 7.45, t));
    const blinkT = t - 10.3;
    p.blink = blinkT > 0 && blinkT < 0.16 ? Math.sin((blinkT / 0.16) * Math.PI) : 0;
    // One slow breath while the eyes are closed; gentle breathing otherwise.
    p.breathAmp = 1 + 1.6 * smoothstep(6.0, 6.4, t) * (1 - smoothstep(7.0, 7.4, t));
    // Head turn toward frame-right (the hero's left = +yaw) and a slight tilt after the eyes open.
    const turn = smoothstep(7.3, 8.4, t);
    const micro = smoothstep(8.5, 9.0, t);
    p.headYaw = (7 * turn + micro * 1.2 * noise1(t * 0.35, 3)) * DEG;
    p.headPitch = (-2.5 * turn + micro * 0.8 * noise1(t * 0.3, 7) - 4 * smoothstep(11.6, 12.3, t)) * DEG;
    p.gazeYaw = (9 * turn) * DEG;
    p.gazePitch = (-2 * turn - 5 * smoothstep(11.6, 12.2, t)) * DEG;
    // The line at 9.0 s: six syllables, jaw open/close envelope.
    p.jaw = 0;
    const syl = [9.05, 9.3, 9.55, 9.9, 10.2, 10.55];
    for (const s0 of syl) {
      const u = (t - s0) / 0.24;
      if (u > 0 && u < 1) p.jaw = Math.max(p.jaw, Math.sin(u * Math.PI) * 0.75);
    }
    p.subtitle = smoothstep(9.0, 9.25, t) * (1 - smoothstep(T_DIVE + 0.2, T_DIVE + 0.6, t));
    p.smile = smoothstep(11.5, 12.1, t) * 0.6 + smoothstep(10.6, 11.0, t) * 0.15 * (1 - smoothstep(11.5, 11.6, t));
    // Breeze: slow pendulum drifting toward frame-left around 1.75–2.5 s, then settling; rising wind at 11.6+.
    const sway = Math.sin(t * 0.9) * 0.6 + smoothstep(1.4, 2.4, t) * (1 - smoothstep(3.2, 5.5, t)) * 2.2;
    const rise = smoothstep(11.6, 12.4, t) * 5;
    // Air moving toward frame-left = −right (world).
    p.breeze.copy(this.right).multiplyScalar(-sway * 0.9).addScaledVector(this.facing, -0.6 - rise * 0.4);
    p.breeze.y = -0.2 + rise * 0.5;

    // ── Camera.
    const dist = introDistance(Math.min(t, T_DIVE));
    const targetY = introTargetHeight(dist);
    // Faint handheld drift (< 1 cm) once held.
    const held = smoothstep(8.4, 8.9, t);
    const drift = new Vector3(noise1(t * 0.5, 11) * 0.006, noise1(t * 0.45, 12) * 0.005, 0).multiplyScalar(held);
    // A touch of lateral offset in the close-up: face slightly left of centre (head turned frame-right).
    const lateral = -0.035 * smoothstep(7.0, 9.0, t);
    const target = new Vector3(A.x, A.y + targetY, A.z).addScaledVector(this.right, -lateral);
    // Slightly low, heroic angle: the camera looks up ≈ 6° at him (blue sky behind, banks low).
    const camPos = target.clone().addScaledVector(this.facing, dist).add(drift);
    camPos.y -= dist * Math.tan(6 * DEG);
    p.camPos.copy(camPos);
    p.camTarget.copy(target);
    p.fov = 20;
    p.roll = 0;
    p.focusDist = dist;
    // Background softens from 2.5 s, fully out of focus by 7.3–8.5.
    p.dof = smoothstep(2.6, 5.5, t) * 0.55 + smoothstep(5.5, 8.0, t) * 0.45;
    p.heroFeet.copy(A);
    p.heroLean = 0;
    p.heroFall = 0;
    p.mist = 0;
    p.hudFade = 0;
    p.controlBlend = 0;

    // ── Handoff dive (12.4 → 13.4) and control blend (13.4 → 15).
    if (t > T_DIVE) {
      const u = t - T_DIVE;
      // The hero pitches forward (toward the camera side he faces) and drops out of frame.
      p.heroLean = Math.min(1.75, Math.pow(u / 0.55, 1.6) * 1.75);
      // Accelerates hard (≈ 40 g) to 240 m/s within 0.6 s, then holds.
      const fall = u < 0.6 ? 0.5 * 400 * u * u : 72 + 240 * (u - 0.6);
      p.heroFall = fall;
      p.heroFeet.set(A.x, A.y - fall, A.z).addScaledVector(this.facing, u * u * 18);
      // Camera whips down and swings behind: over 0.6 s move from the front to above-behind.
      const w = clamp01(u / 0.65);
      const e = cubicBezier(0.3, 0, 0.2, 1, w);
      const heroC = p.heroFeet.clone().setY(p.heroFeet.y + 1.0);
      const front = target.clone().addScaledVector(this.facing, dist).setY(target.y - fall * 0.35);
      const behind = heroC.clone().addScaledVector(this.facing, -7).setY(heroC.y + 6.5);
      p.camPos.lerpVectors(front, behind, e);
      const lookFront = heroC.clone();
      const lookDown = heroC.clone().addScaledVector(this.facing, 30).setY(heroC.y - 60);
      p.camTarget.lerpVectors(lookFront, lookDown, e);
      p.fov = lerp(20, 72, e);
      p.dof = lerp(p.dof, 0, e);
      p.focusDist = p.camPos.distanceTo(heroC);
      // Cloud burst: 0.15 s white-out as the camera crosses the cloud layer + mist streaks around it.
      // White-out while the lens crosses the thin layer ≈ 140–230 m below the hover point.
      const camDrop = A.y - p.camPos.y;
      p.mist = smoothstep(120, 150, camDrop) * (1 - smoothstep(205, 240, camDrop));
      p.subtitle *= 1 - e;
    }
    if (t > T_CONTROL) {
      const c = clamp01((t - T_CONTROL) / (T_END - T_CONTROL));
      p.controlBlend = smoothstep(0, 1, c);
      p.hudFade = smoothstep(0.1, 0.9, c);
    }
    return p;
  }
}
