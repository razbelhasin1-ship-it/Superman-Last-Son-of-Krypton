/**
 * Camera rig (spec 7.5): third-person spring arm with shoulder offset, look-ahead, tier-driven FOV
 * and distance, FOV kick on tier changes, acceleration lag (the hero surges away on boost and the
 * camera pulls in on brake), launch dip/whip, swept collision, partial roll and trauma shake.
 * The arm is smoothed *relative to the hero*, so it never lags behind at 6,000 m/s.
 */
import { PerspectiveCamera, Quaternion, Vector3, Euler } from 'three';
import type { CollisionWorld, SweepHit } from '../contracts.ts';
import type { HeroController } from '../flight/HeroController.ts';
import { DEG, Spring1, Spring3, clamp, expFactor, interpTable, noise1, smoothstep, wrapAngle } from '../core/math.ts';
import { T } from '../tuning.ts';

export type CameraMode = 'chase' | 'cinematic' | 'firstPerson' | 'photo';

const UP = new Vector3(0, 1, 0);
const _v = new Vector3();
const _v2 = new Vector3();
const _e = new Euler(0, 0, 0, 'YXZ');

export class CameraRig {
  readonly camera: PerspectiveCamera;
  mode: CameraMode = 'chase';
  /** Aim (owned by the rig; mouse/gamepad modify it). Yaw 0 = north (−Z), + = right. */
  yaw = 0;
  pitch = -0.12;
  /** Smoothed aim used for the view (rotation lag). */
  private viewYaw = 0;
  private viewPitch = -0.12;
  private readonly offset = new Spring3();
  private readonly accelLag = new Spring3();
  private readonly fov = new Spring1(T.tiers[0]!.fov);
  private readonly dist = new Spring1(T.tiers[0]!.dist);
  private fovKick = 0;
  private trauma = 0;
  private shakeT = 0;
  private allowedDist = 50;
  private whip = 0;
  private roll = 0;
  shoulderSide = 1;
  reducedShake = false;
  stableHorizon = false;
  userFovOffset = 0;
  /** Extra zoom factor for telescopic vision (1 = none). */
  zoom = 1;
  // Interpolation state.
  private readonly prevPos = new Vector3();
  private readonly curPos = new Vector3();
  private readonly prevQ = new Quaternion();
  private readonly curQ = new Quaternion();
  private prevFov = 62;
  private curFov = 62;
  private readonly hit: SweepHit = { t: 0, point: new Vector3(), normal: new Vector3(), kind: 'none', id: -1 };
  /** Cinematic overrides. */
  readonly cine = { pos: new Vector3(), target: new Vector3(), fov: 20, roll: 0 };
  /** Blend from a frozen pose into the chase camera (intro handoff). */
  private blendT = 1;
  private blendDur = 1;
  private readonly blendPos = new Vector3();
  private readonly blendQ = new Quaternion();
  private blendFov = 60;
  private readonly world: CollisionWorld;
  initialized = false;

  constructor(camera: PerspectiveCamera, world: CollisionWorld) {
    this.camera = camera;
    this.world = world;
  }

  /** Per-frame look input (radians). */
  addLook(dx: number, dy: number): void {
    if (this.mode === 'cinematic') return;
    this.yaw = wrapAngle(this.yaw + dx);
    this.pitch = clamp(this.pitch + dy, T.camera.pitchMinDeg * DEG, T.camera.pitchMaxDeg * DEG);
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  kickFov(deg = T.camera.fovKick): void {
    this.fovKick = Math.max(this.fovKick, deg);
  }

  whipUp(amount: number): void {
    this.whip = Math.max(this.whip, amount);
  }

  snapBehind(hero: HeroController): void {
    this.viewYaw = this.yaw;
    this.viewPitch = this.pitch;
    this.offset.set(0, 0, 0);
    this.accelLag.set(0, 0, 0);
    const s = hero.speed;
    this.fov.reset(this.fovForSpeed(s));
    this.dist.reset(this.distForSpeed(s));
    this.allowedDist = 50;
    this.initialized = false;
  }

  /** Switch to chase, blending from the current camera pose over `seconds`. */
  blendToChase(seconds: number, hero: HeroController): void {
    this.blendPos.copy(this.curPos);
    this.blendQ.copy(this.curQ);
    this.blendFov = this.curFov;
    this.mode = 'chase';
    this.blendT = 0;
    this.blendDur = Math.max(0.01, seconds);
    // Point the aim along the camera's current view so the chase arm starts close to it.
    const d = new Vector3(0, 0, -1).applyQuaternion(this.curQ);
    this.yaw = Math.atan2(d.x, -d.z);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
    this.viewYaw = this.yaw;
    this.viewPitch = this.pitch;
    this.fov.reset(this.fovForSpeed(hero.speed));
    this.dist.reset(this.distForSpeed(hero.speed));
    this.offset.set(this.blendPos.x - hero.pos.x, this.blendPos.y - hero.pos.y, this.blendPos.z - hero.pos.z);
  }

  /** Run the arm once with no smoothing so the first rendered frame is already framed. */
  prime(hero: HeroController): void {
    this.initialized = false;
    this.step(1 / 60, hero);
    this.initialized = false;
    this.step(1 / 60, hero);
    this.frame(1);
  }

  private fovForSpeed(s: number): number {
    const sp = T.tiers.map((t, i) => (i === 0 ? 0 : t.speed));
    return interpTable(sp, T.tiers.map((t) => t.fov), s);
  }

  private distForSpeed(s: number): number {
    const sp = T.tiers.map((t, i) => (i === 0 ? 0 : t.speed));
    return interpTable(sp, T.tiers.map((t) => t.dist), s);
  }

  /** Fixed-step update. */
  step(dt: number, hero: HeroController): void {
    const C = T.camera;
    this.prevPos.copy(this.curPos);
    this.prevQ.copy(this.curQ);
    this.prevFov = this.curFov;
    this.shakeT += dt;
    this.trauma = Math.max(0, this.trauma - C.shakeDecay * dt * (0.4 + this.trauma));
    this.fovKick *= 1 - expFactor(3 / C.fovKickDecay, dt);
    this.whip *= 1 - expFactor(3.2, dt);

    if (this.mode === 'cinematic') {
      this.curPos.copy(this.cine.pos);
      _v.subVectors(this.cine.target, this.cine.pos).normalize();
      lookQuat(_v, this.cine.roll, this.curQ);
      this.curFov = this.cine.fov;
      if (!this.initialized) this.syncPrev();
      return;
    }

    // Rotation lag on the aim.
    const rotK = 1 / C.rotLag;
    this.viewYaw += wrapAngle(this.yaw - this.viewYaw) * expFactor(rotK, dt);
    this.viewPitch += (this.pitch - this.viewPitch) * expFactor(rotK, dt);
    const vp = clamp(this.viewPitch + this.whip * 0.35, C.pitchMinDeg * DEG, C.pitchMaxDeg * DEG);
    const cp = Math.cos(vp);
    const fwd = _v.set(Math.sin(this.viewYaw) * cp, Math.sin(vp), -Math.cos(this.viewYaw) * cp);
    const right = _v2.set(Math.cos(this.viewYaw), 0, Math.sin(this.viewYaw));

    if (this.mode === 'firstPerson') {
      this.curPos.copy(hero.pos).addScaledVector(UP, 0.78 * hero.upright).addScaledVector(fwd, 0.15);
      lookQuat(fwd, 0, this.curQ);
      this.curFov = clamp(62 / this.zoom + this.userFovOffset, 1.2, 100);
      if (!this.initialized) this.syncPrev();
      return;
    }

    // Speed-driven FOV/distance with springs; charge dips and narrows.
    const s = hero.speed;
    const charge = Math.max(hero.launchCharge01, hero.leapCharge01);
    const tFov = this.fovForSpeed(s) - charge * T.takeoff.chargeFovDrop;
    let tDist = this.distForSpeed(s);
    if (hero.mode === 'ground') tDist = Math.min(tDist, 5.2);
    if (hero.braking) tDist *= 0.86;
    this.fov.step(tFov, 5, dt);
    this.dist.step(tDist, 4, dt);

    // Acceleration lag: hero surges away on boost, camera closes in on brake.
    const aLag = C.accelLag;
    let lx = -hero.accel.x * aLag;
    let ly = -hero.accel.y * aLag;
    let lz = -hero.accel.z * aLag;
    const ll = Math.hypot(lx, ly, lz);
    if (ll > C.accelLagMax) {
      lx *= C.accelLagMax / ll;
      ly *= C.accelLagMax / ll;
      lz *= C.accelLagMax / ll;
    }
    this.accelLag.step(lx, ly, lz, C.accelLagOmega, dt);

    // Pivot (relative to the hero): height + shoulder + look-ahead + charge dip.
    const la = Math.min(C.lookAheadMax, s * C.lookAhead);
    const lookAhead = hero.vel.lengthSq() > 1e-6 ? _v2.clone().copy(hero.vel).normalize().multiplyScalar(la) : new Vector3();
    const shoulder = C.shoulder * this.shoulderSide * (1 - smoothstep(200, 1500, s) * 0.6);
    // Look-ahead steers where the camera *aims* (below); the arm itself stays anchored on the hero.
    // Height is applied along the camera's own up axis, so the hero sits in the lower-middle of the
    // frame and a cape streaming straight back stays below the line of sight at any pitch.
    const camUp = new Vector3().crossVectors(right, fwd).normalize();
    const prone = 1 - hero.upright;
    const hUp = (hero.mode === 'ground' ? 0.95 : 1.0 + prone * (C.proneHeight - 0.35)) + this.dist.x * 0.075 - charge * 0.7;
    const px = right.x * shoulder + camUp.x * hUp;
    const py = right.y * shoulder + camUp.y * hUp + (hero.mode === 'ground' ? C.heightOffset * 0.25 : 0);
    const pz = right.z * shoulder + camUp.z * hUp;
    // Desired arm.
    const dist = this.dist.x;
    const tx = px - fwd.x * dist + this.accelLag.x;
    const ty = py - fwd.y * dist + this.accelLag.y;
    const tz = pz - fwd.z * dist + this.accelLag.z;
    if (!this.initialized) this.offset.set(tx, ty, tz);
    const posK = 1 / C.posLag;
    this.offset.step(tx, ty, tz, posK, dt);

    // Collision: sweep from the pivot (≈ hero) to the desired camera position.
    const pivot = new Vector3(hero.pos.x + px * 0.3, hero.pos.y + py * 0.6, hero.pos.z + pz * 0.3);
    const desired = new Vector3(hero.pos.x + this.offset.x, hero.pos.y + this.offset.y, hero.pos.z + this.offset.z);
    const armLen = pivot.distanceTo(desired);
    let allowed = armLen;
    if (armLen > 0.05 && this.world.sweepSphere(pivot, desired, C.collisionRadius, this.hit)) {
      allowed = Math.max(0.6, armLen * this.hit.t - 0.05);
    }
    const k = allowed < this.allowedDist ? C.pushInK : C.pullOutK;
    this.allowedDist += (allowed - this.allowedDist) * expFactor(k, dt);
    if (this.allowedDist > allowed) this.allowedDist = allowed; // never cut through geometry
    const useLen = Math.min(armLen, this.allowedDist);
    const camPos = this.curPos.copy(pivot);
    if (armLen > 1e-4) camPos.addScaledVector(desired.sub(pivot).divideScalar(armLen), useLen);
    // Keep above terrain/water.
    const ground = this.world.supportHeight(camPos.x, camPos.z, camPos.y + 1) + 0.6;
    if (camPos.y < ground) camPos.y = ground;

    // Orientation: look along the aim; roll a share of the hero's bank.
    const rollTarget = this.stableHorizon ? 0 : -(hero.bank.x + hero.rollAngle * 0.25) * C.rollFactor;
    this.roll += (rollTarget - this.roll) * expFactor(8, dt);
    // Aim: along the view direction, nudged toward where the hero is heading (look-ahead).
    const aimPoint = new Vector3(
      hero.pos.x + px + fwd.x * 40 + lookAhead.x,
      hero.pos.y + py * 0.6 + fwd.y * 40 + lookAhead.y,
      hero.pos.z + pz + fwd.z * 40 + lookAhead.z,
    );
    const lookDir = aimPoint.sub(camPos).normalize();
    lookQuat(lookDir, this.roll, this.curQ);
    this.curFov = clamp(this.fov.x + this.fovKick + this.userFovOffset, 20, 130) / this.zoom;
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
      const e = smoothstep(0, 1, this.blendT);
      this.curPos.lerpVectors(this.blendPos, this.curPos.clone(), e);
      this.curQ.slerpQuaternions(this.blendQ, this.curQ.clone(), e);
      this.curFov = this.blendFov + (this.curFov - this.blendFov) * e;
    }
    if (!this.initialized) this.syncPrev();
  }

  private syncPrev(): void {
    this.prevPos.copy(this.curPos);
    this.prevQ.copy(this.curQ);
    this.prevFov = this.curFov;
    this.initialized = true;
  }

  /** Render-time interpolation + shake. */
  frame(alpha: number): void {
    const C = T.camera;
    const cam = this.camera;
    cam.position.lerpVectors(this.prevPos, this.curPos, alpha);
    cam.quaternion.slerpQuaternions(this.prevQ, this.curQ, alpha);
    const fov = this.prevFov + (this.curFov - this.prevFov) * alpha;
    const shake = this.trauma * this.trauma * (this.reducedShake ? 0.3 : 1);
    if (shake > 1e-4) {
      const t = this.shakeT * C.shakeFreq;
      _e.set(
        noise1(t, 1) * C.shakeMaxDeg * DEG * shake,
        noise1(t, 2) * C.shakeMaxDeg * DEG * shake,
        noise1(t, 3) * C.shakeMaxDeg * DEG * shake * 0.6,
        'YXZ',
      );
      cam.quaternion.multiply(new Quaternion().setFromEuler(_e));
      cam.position.x += noise1(t, 4) * C.shakeMaxPos * shake;
      cam.position.y += noise1(t, 5) * C.shakeMaxPos * shake;
    }
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  get currentFov(): number {
    return this.curFov;
  }
}

/** Quaternion for a camera looking along `dir` (−Z forward) with roll about the view axis. */
export function lookQuat(dir: Vector3, roll: number, out: Quaternion): Quaternion {
  const d = dir.clone().normalize();
  const yaw = Math.atan2(d.x, -d.z);
  const pitch = Math.asin(clamp(d.y, -1, 1));
  _e.set(pitch, -yaw, roll, 'YXZ');
  return out.setFromEuler(_e);
}
