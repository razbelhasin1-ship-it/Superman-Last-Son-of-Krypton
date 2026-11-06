/**
 * The hero's physical state and movement model: ground, takeoffs, super-leap, flight tiers, brake,
 * power-dive, barrel roll, burst, swept collision and landings (spec 7.1–7.4, 7.7).
 *
 * Pure simulation: no rendering, no wall-clock time. Stepped at a fixed 60 Hz.
 * Coordinates: Y up, −Z north. `pos` is the hero's centre of mass (≈ hip height when standing).
 */
import { Quaternion, Vector3 } from 'three';
import type { CollisionWorld, GameEventMap, LandingKind, SweepHit } from '../contracts.ts';
import type { EventBus } from '../core/events.ts';
import type { InputFrame } from '../core/input.ts';
import { DEG, MACH1, clamp, clamp01, expFactor, interpTable, lerp, smoothstep, wrapAngle, Spring1 } from '../core/math.ts';
import { T } from '../tuning.ts';

export type HeroMode = 'ground' | 'takeoff' | 'launchCharge' | 'leapCharge' | 'airborne' | 'flight' | 'landing';

export interface CameraAim {
  yaw: number;
  pitch: number;
}

/** Height of the centre of mass above the soles when standing. */
export const HIP = 1.0;
const UP = new Vector3(0, 1, 0);
const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _axis = new Vector3();

export class HeroController {
  readonly pos = new Vector3(0, HIP, 0);
  readonly vel = new Vector3();
  readonly prevPos = new Vector3(0, HIP, 0);
  /** Acceleration measured over the last step (world, m/s²). */
  readonly accel = new Vector3();
  /** Unit flight direction (velocity direction while flying). */
  readonly dir = new Vector3(0, 0, -1);
  /** Smoothed body orientation (model faces local +Z, head local +Y, left local +X). */
  readonly bodyQ = new Quaternion();
  readonly prevBodyQ = new Quaternion();

  speed = 0;
  mode: HeroMode = 'ground';
  modeTime = 0;
  /** Selected throttle tier (0..5); `effTier` includes overboost / burst (0..6). */
  tier = T.flight.defaultTier;
  effTier = T.flight.defaultTier;
  overboost = false;
  burstTime = 0;
  burstCooldown = 0;
  braking = false;
  private brakeLatch = false;
  diving = false;
  /** Barrel roll progress (−1 = inactive) and direction. */
  rollT = -1;
  rollDir = 0;
  rollAngle = 0;
  /** Charges, 0..1 for camera / FX. */
  launchCharge01 = 0;
  leapCharge01 = 0;
  private charge = 0;
  private jumpPending = false;
  private jumpHold = 0;
  private launchTimer = 0;
  /** Seconds left in the post-launch phase (power launch momentum). */
  postLaunch = 0;
  /** Charge (0..1) of the most recent power launch. */
  lastLaunchCharge = 0;
  private autoRise = 0;
  landingKind: LandingKind = 'soft';
  landingSpeed = 0;
  private landingDuration = 0.3;
  sprinting = false;
  crouching = false;
  groundSpeed = 0;
  /** Seconds since the last throttle input — used by the HUD and visual idle. */
  idleTime = 0;
  /** Distance/time counters (for HUD and tests). */
  distance = 0;

  // Orientation springs.
  heading = 0;
  private headingV = 0;
  readonly lean = new Spring1(0);
  readonly bank = new Spring1(0);
  private prevDirHeading = 0;
  yawRate = 0;
  flightPitch = 0;
  /** Speed the pilot is asking for (drives lean anticipation). */
  intentSpeed = 0;

  private boomArmed = true;
  private nearMissCooldown = 0;
  private scrapeCooldown = 0;
  private readonly hit: SweepHit = { t: 0, point: new Vector3(), normal: new Vector3(), kind: 'none', id: -1 };
  private readonly prevVel = new Vector3();
  autoCruise = T.flight.autoCruise;
  /** Speed cap from carried objects (strength system); Infinity when free. */
  speedCap = Infinity;
  /** Multiplier on flight speed (kryptonite etc.). */
  speedScale = 1;

  private readonly world: CollisionWorld;
  private readonly events: EventBus<GameEventMap>;

  constructor(world: CollisionWorld, events: EventBus<GameEventMap>) {
    this.world = world;
    this.events = events;
    this.updateBodyQuat(0);
    this.prevBodyQ.copy(this.bodyQ);
  }

  // ───────────────────────────────────────────────────────────── spawning / QA

  spawnGround(p: Vector3, heading = 0): void {
    this.pos.copy(p);
    this.pos.y = this.world.supportHeight(p.x, p.z, p.y + 2) + HIP;
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.intentSpeed = 0;
    this.heading = heading;
    this.headingV = 0;
    this.lean.reset(0);
    this.bank.reset(0);
    this.setMode('ground');
    this.syncPrev();
  }

  spawnFlying(p: Vector3, dir: Vector3, speed: number): void {
    this.pos.copy(p);
    this.dir.copy(dir).normalize();
    this.speed = speed;
    this.intentSpeed = speed;
    this.vel.copy(this.dir).multiplyScalar(speed);
    this.prevVel.copy(this.vel);
    this.boomArmed = speed < MACH1;
    if (Math.hypot(this.dir.x, this.dir.z) > 0.2) this.heading = Math.atan2(this.dir.x, -this.dir.z);
    this.prevDirHeading = this.heading;
    this.headingV = 0;
    const s = speed;
    this.flightPitch = Math.asin(clamp(this.dir.y, -1, 1));
    this.lean.reset(this.targetFlightLean(s));
    this.bank.reset(0);
    this.setMode('flight');
    this.syncPrev();
  }

  private syncPrev(): void {
    this.prevPos.copy(this.pos);
    this.updateBodyQuat(0);
    this.prevBodyQ.copy(this.bodyQ);
  }

  private setMode(m: HeroMode): void {
    this.mode = m;
    this.modeTime = 0;
    if (m !== 'flight') {
      this.diving = false;
      this.braking = false;
    }
  }

  get altitude(): number {
    return this.pos.y - this.world.groundHeight(this.pos.x, this.pos.z);
  }

  get mach(): number {
    return this.speed / MACH1;
  }

  /** 0..1 bell through the transonic band (vapour cone). */
  get transonic(): number {
    const F = T.flight;
    const s = this.speed;
    return smoothstep(F.transonicLo, MACH1, s) * (1 - smoothstep(MACH1 + 8, F.transonicHi, s));
  }

  /** 0 when prone/horizontal, 1 when upright. */
  get upright(): number {
    return clamp01(Math.cos(this.lean.x));
  }

  // ───────────────────────────────────────────────────────────── main step

  step(input: InputFrame, cam: CameraAim, dt: number): void {
    this.prevPos.copy(this.pos);
    this.prevBodyQ.copy(this.bodyQ);
    this.prevVel.copy(this.vel);
    this.modeTime += dt;
    this.nearMissCooldown -= dt;
    this.scrapeCooldown -= dt;
    if (this.burstCooldown > 0) this.burstCooldown = Math.max(0, this.burstCooldown - dt);

    // Throttle tier selection works in every mode.
    if (input.tierDelta !== 0) {
      this.tier = clamp(this.tier + Math.sign(input.tierDelta), 0, 5);
    }

    switch (this.mode) {
      case 'ground':
        this.stepGround(input, cam, dt);
        break;
      case 'takeoff':
        this.stepTakeoff(cam, dt);
        break;
      case 'launchCharge':
        this.stepLaunchCharge(input, cam, dt);
        break;
      case 'leapCharge':
        this.stepLeapCharge(input, cam, dt);
        break;
      case 'airborne':
        this.stepAirborne(input, cam, dt);
        break;
      case 'flight':
        this.stepFlight(input, cam, dt);
        break;
      case 'landing':
        this.stepLanding(input, dt);
        break;
    }

    if (this.mode !== 'flight') {
      this.speed = this.vel.length();
      const prevEff = this.effTier;
      this.effTier = this.tier;
      if (prevEff !== this.effTier) this.events.emit('tierChange', { from: prevEff, to: this.effTier });
    }
    this.accel.subVectors(this.vel, this.prevVel).divideScalar(dt);
    this.distance += this.pos.distanceTo(this.prevPos);

    // Mach 1 crossing (with hysteresis so jitter can't re-trigger it).
    if (this.speed >= MACH1 && this.boomArmed) {
      this.boomArmed = false;
      this.events.emit('sonicBoom', {
        pos: this.pos.clone(),
        dir: this.dir.clone(),
        speed: this.speed,
        altitude: this.altitude,
      });
      this.events.emit('hitstop', { frames: T.fx.boomHitstopFrames });
    } else if (this.speed < MACH1 - 15) {
      this.boomArmed = true;
    }

    this.updateOrientation(input, cam, dt);
  }

  // ───────────────────────────────────────────────────────────── ground

  private camBasis(cam: CameraAim): { fwd: Vector3; right: Vector3; fwdH: Vector3 } {
    const cp = Math.cos(cam.pitch);
    const fwd = new Vector3(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
    const right = new Vector3(Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
    const fwdH = new Vector3(Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    return { fwd, right, fwdH };
  }

  private stepGround(input: InputFrame, cam: CameraAim, dt: number): void {
    const G = T.ground;
    const { right, fwdH } = this.camBasis(cam);
    this.crouching = input.held.has('crouch');
    const wishX = fwdH.x * input.moveY + right.x * input.moveX;
    const wishZ = fwdH.z * input.moveY + right.z * input.moveX;
    const mag = Math.min(1, Math.hypot(wishX, wishZ));
    this.sprinting = input.held.has('overboost') && input.moveY > 0.2 && !this.crouching;

    // ── Space semantics (DECISIONS.md): crouch+Space = super-leap, sprint+Space = run-up takeoff,
    //    tap = hover-lift, hold = power-launch charge.
    if (input.pressed.has('jump')) {
      if (this.crouching) {
        this.charge = 0;
        this.setMode('leapCharge');
        return;
      }
      if (this.sprinting && this.groundSpeed > 12) {
        this.runupTakeoff(fwdH);
        return;
      }
      this.jumpPending = true;
      this.jumpHold = 0;
    }
    if (this.jumpPending) {
      if (input.held.has('jump')) {
        this.jumpHold += dt;
        if (this.jumpHold >= T.takeoff.holdThreshold) {
          this.jumpPending = false;
          this.charge = this.jumpHold;
          this.setMode('launchCharge');
          return;
        }
      } else {
        this.jumpPending = false;
        this.setMode('takeoff');
        this.events.emit('takeoff', { kind: 'lift', pos: this.feet(), charge: 0 });
        return;
      }
    }

    let target = 0;
    if (mag > 0.01) {
      if (this.crouching) target = G.crouchSpeed;
      else if (this.sprinting) target = G.sprintSpeed;
      else target = input.usingGamepad && mag < 0.6 ? G.walkSpeed : G.runSpeed;
    }
    const k = this.sprinting ? G.sprintAccelK : G.accelK;
    const f = expFactor(k, dt);
    const tx = mag > 0.01 ? (wishX / mag) * target * mag : 0;
    const tz = mag > 0.01 ? (wishZ / mag) * target * mag : 0;
    this.vel.x += (tx - this.vel.x) * f;
    this.vel.z += (tz - this.vel.z) * f;
    this.vel.y = 0;
    this.groundSpeed = Math.hypot(this.vel.x, this.vel.z);

    // Horizontal move with wall sliding.
    this.slideMove(this.vel.x * dt, 0, this.vel.z * dt, 0.45, HIP - 0.5);

    // Stand on the highest support below the knees.
    const support = this.world.supportHeight(this.pos.x, this.pos.z, this.pos.y - HIP + 0.6);
    if (this.world.isWater(this.pos.x, this.pos.z)) {
      // Superman doesn't wade: rise into a hover above the water.
      this.spawnHover();
      return;
    }
    if (support < this.pos.y - HIP - 0.6) {
      // Walked off a ledge.
      this.setMode('airborne');
      return;
    }
    this.pos.y = support + HIP;
  }

  private spawnHover(): void {
    this.setMode('flight');
    this.speed = 0;
    this.vel.set(0, 0, 0);
    this.autoRise = 0.4;
  }

  private feet(): Vector3 {
    return new Vector3(this.pos.x, this.pos.y - HIP, this.pos.z);
  }

  private runupTakeoff(fwdH: Vector3): void {
    const s = Math.max(this.groundSpeed, 20);
    this.dir.set(fwdH.x, 0.22, fwdH.z).normalize();
    this.speed = s;
    this.vel.copy(this.dir).multiplyScalar(s);
    this.setMode('flight');
    this.events.emit('takeoff', { kind: 'runup', pos: this.feet(), charge: 0 });
  }

  private stepTakeoff(cam: CameraAim, dt: number): void {
    this.vel.set(0, 0, 0);
    if (this.modeTime >= T.takeoff.anticipation) {
      this.setMode('flight');
      this.dir.set(0, 1, 0);
      this.speed = T.takeoff.liftSpeed * 0.6;
      this.vel.set(0, this.speed, 0);
      this.autoRise = 0.55;
      void cam;
      void dt;
    }
  }

  private stepLaunchCharge(input: InputFrame, cam: CameraAim, dt: number): void {
    const TK = T.takeoff;
    this.vel.set(0, 0, 0);
    if (input.pressed.has('crouch')) {
      this.launchCharge01 = 0;
      this.setMode('ground');
      return;
    }
    if (input.held.has('jump')) {
      this.charge = Math.min(TK.chargeMax, this.charge + dt);
      this.launchCharge01 = clamp01((this.charge - TK.holdThreshold) / (TK.chargeMax - TK.holdThreshold));
      return;
    }
    // Release → explosive launch.
    const c = this.launchCharge01;
    const { fwdH } = this.camBasis(cam);
    this.dir.set(fwdH.x * 0.06, 1, fwdH.z * 0.06).normalize();
    this.speed = lerp(TK.launchSpeedMin, TK.launchSpeedMax, c);
    this.vel.copy(this.dir).multiplyScalar(this.speed);
    this.launchTimer = lerp(TK.launchHoldMin, TK.launchHoldMax, c);
    this.postLaunch = 3;
    this.lastLaunchCharge = c;
    this.setMode('flight');
    this.events.emit('takeoff', { kind: 'launch', pos: this.feet(), charge: c });
    this.events.emit('shake', { amount: 0.5 + c * 0.6 });
    this.launchCharge01 = 0;
  }

  private stepLeapCharge(input: InputFrame, cam: CameraAim, dt: number): void {
    const L = T.leap;
    this.vel.set(0, 0, 0);
    if (input.held.has('jump')) {
      this.charge = Math.min(L.chargeMax, this.charge + dt);
      this.leapCharge01 = clamp01(this.charge / L.chargeMax);
      return;
    }
    // Release → leap.
    const c = this.charge;
    let apex: number;
    let horiz: number;
    const { fwdH } = this.camBasis(cam);
    if (c < 0.15) {
      apex = L.hopHeight;
      horiz = Math.max(this.groundSpeed, 4);
    } else {
      apex = lerp(L.minApex, L.maxApex, clamp01((c - 0.15) / (L.chargeMax - 0.15)));
      const vy = Math.sqrt(2 * L.gravity * apex);
      const tApex = vy / L.gravity;
      horiz = (L.distanceRatio * apex) / (2 * tApex);
    }
    const vy = Math.sqrt(2 * L.gravity * apex);
    this.vel.set(fwdH.x * horiz, vy, fwdH.z * horiz);
    this.setMode('airborne');
    this.events.emit('leap', { pos: this.feet(), apex, charge: this.leapCharge01 });
    this.leapCharge01 = 0;
  }

  // ───────────────────────────────────────────────────────────── ballistic (leap / fall)

  private stepAirborne(input: InputFrame, cam: CameraAim, dt: number): void {
    const L = T.leap;
    if (input.pressed.has('jump') && this.modeTime > 0.2) {
      // Transition into flight, keeping momentum ("press Space at the apex").
      const s = this.vel.length();
      if (s > 0.5) this.dir.copy(this.vel).normalize();
      if (Math.abs(this.dir.y) > 0.9) {
        const { fwdH } = this.camBasis(cam);
        this.dir.copy(fwdH);
      }
      this.speed = s;
      this.setMode('flight');
      return;
    }
    const { right, fwdH } = this.camBasis(cam);
    const ax = (fwdH.x * input.moveY + right.x * input.moveX) * 10;
    const az = (fwdH.z * input.moveY + right.z * input.moveX) * 10;
    const hs0 = Math.hypot(this.vel.x, this.vel.z);
    this.vel.x += ax * dt;
    this.vel.z += az * dt;
    const hs1 = Math.hypot(this.vel.x, this.vel.z);
    const cap = Math.max(hs0, 16);
    if (hs1 > cap) {
      this.vel.x *= cap / hs1;
      this.vel.z *= cap / hs1;
    }
    this.vel.y -= L.gravity * dt;
    const terminal = 72;
    if (this.vel.y < -terminal) this.vel.y = -terminal;
    this.collideMove(dt, false);
  }

  // ───────────────────────────────────────────────────────────── flight

  private targetFlightLean(s: number): number {
    const F = T.flight;
    const leanAngle = F.leanMaxDeg * DEG * smoothstep(F.leanStart, F.leanEnd, s);
    const prone = smoothstep(F.proneStart, F.proneFull, s);
    return lerp(leanAngle, Math.PI / 2 - this.flightPitch, prone);
  }

  private stepFlight(input: InputFrame, cam: CameraAim, dt: number): void {
    const F = T.flight;
    const tiers = T.tiers;
    const { fwd, right, fwdH } = this.camBasis(cam);
    const jumpHeld = input.held.has('jump');
    const crouchHeld = input.held.has('crouch');

    // Power-dive (double-tap crouch).
    if (input.doubleTapped.has('crouch') && !this.diving && this.modeTime > 0.15) {
      this.diving = true;
      this.events.emit('dive', { active: true });
    }
    if (this.diving && (input.pressed.has('jump') || input.held.has('brake') || input.moveY < -0.1)) {
      this.diving = false;
      this.events.emit('dive', { active: false });
    }

    // Barrel roll (double-tap strafe).
    if (this.rollT < 0 && this.speed > 4) {
      if (input.doubleTapped.has('left')) this.startRoll(-1);
      else if (input.doubleTapped.has('right')) this.startRoll(1);
    }

    // Brake: R anywhere, or S while moving.
    const sBrake = input.moveY < -0.1 && (this.speed > 10 || this.brakeLatch);
    const wantBrake = input.held.has('brake') || sBrake;
    if (wantBrake && !this.braking && this.speed > 15) {
      this.events.emit('brake', { speed: this.speed, pos: this.pos.clone(), dir: this.dir.clone() });
    }
    this.braking = wantBrake && this.speed > 0.05;
    if (sBrake) this.brakeLatch = true;
    if (input.moveY >= -0.1) this.brakeLatch = false;
    if (this.braking) {
      this.diving = false;
      this.launchTimer = 0;
    }

    // Effective tier: overboost adds one; tier 6 (burst) is time-limited with a cooldown.
    const wasOver = this.overboost;
    this.overboost = input.held.has('overboost');
    if (this.overboost !== wasOver) this.events.emit('overboost', { active: this.overboost });
    let eff = this.tier + (this.overboost ? 1 : 0);
    if (eff >= 6) {
      if (this.burstCooldown > 0 || this.burstTime >= F.burstMax) eff = 5;
    }
    const prevEff = this.effTier;
    if (eff === 6) {
      if (this.burstTime === 0) this.events.emit('burst', { active: true });
      this.burstTime += dt;
      if (this.burstTime >= F.burstMax) {
        this.endBurst();
        eff = 5;
      }
    } else if (this.burstTime > 0) {
      this.endBurst();
    }
    this.effTier = eff;
    if (prevEff !== eff) this.events.emit('tierChange', { from: prevEff, to: eff });

    // Desired direction in camera space.
    const sf = smoothstep(40, 340, this.speed);
    const ws = lerp(F.strafeWeightLow, F.strafeWeightHigh, sf);
    const wv = lerp(1, F.verticalWeightHigh, sf);
    const vert = (jumpHeld ? 1 : 0) - (crouchHeld ? 1 : 0);
    let thrust = Math.max(0, input.moveY);
    if (this.autoCruise && input.moveY >= 0 && !this.braking && this.idleTime > 0) thrust = Math.max(thrust, 1);
    const D = _v.set(0, 0, 0);
    D.addScaledVector(fwd, thrust);
    D.addScaledVector(right, input.moveX * ws);
    D.addScaledVector(UP, vert * wv);
    if (input.moveY < -0.1 && !this.braking && !this.brakeLatch) D.addScaledVector(fwd, input.moveY);
    if (this.autoRise > 0) {
      this.autoRise -= dt;
      if (D.lengthSq() < 1e-4) D.copy(UP);
    }
    if (this.diving) {
      const p = F.divePitchDeg * DEG;
      D.set(fwdH.x * Math.cos(p), Math.sin(p), fwdH.z * Math.cos(p));
      thrust = 1;
    }
    const dLen = D.length();
    const hasInput = dLen > 0.01;
    if (thrust > 0.01 || hasInput) this.idleTime = 0;
    else this.idleTime += dt;

    // Speed.
    const capSpeed = Math.min(this.speedCap, Infinity);
    const prevSpeed = this.speed;
    if (this.braking) {
      const decel = Math.min(F.brakeAccel + F.brakeAccelPerSpeed * this.speed, F.brakeK * this.speed);
      this.speed = Math.max(0, this.speed - decel * dt);
      this.launchTimer = 0;
    } else if (this.launchTimer > 0) {
      this.launchTimer -= dt;
      // A full-charge launch punches all the way through the cloud deck before it eases off.
      const TK = T.takeoff;
      if (this.launchTimer <= 0 && this.lastLaunchCharge >= TK.punchCharge && this.vel.y > 0 && this.pos.y < TK.punchThroughAlt) {
        this.launchTimer = dt;
      }
    } else if (this.diving) {
      const gain = F.diveAccel * Math.max(0, -this.dir.y);
      const floor = tiers[Math.min(eff, 4)]!.speed;
      this.speed = Math.min(F.diveMaxSpeed, Math.max(this.speed + gain * dt, Math.min(floor, this.speed + 400 * dt)));
    } else if (hasInput) {
      const tierV = tiers[eff]!.speed * this.speedScale;
      let vT: number;
      if (thrust > 0.01) vT = tierV * Math.min(1, dLen);
      else if (this.autoRise > 0) vT = T.takeoff.liftSpeed;
      else vT = Math.min(tierV, 25) * Math.min(1, dLen);
      vT = Math.min(vT, capSpeed);
      this.intentSpeed = vT;
      let k: number;
      if (vT > this.speed) k = tiers[eff]!.k;
      else k = this.postLaunch > 0 ? T.takeoff.launchDecayK : F.tierDownK;
      this.speed += (vT - this.speed) * expFactor(k, dt);
    } else {
      const k = this.postLaunch > 0 ? T.takeoff.launchDecayK : F.coastK;
      this.speed += (0 - this.speed) * expFactor(k, dt);
      if (this.speed < 0.02) this.speed = 0;
    }
    if (!hasInput || this.braking || this.diving || this.launchTimer > 0) this.intentSpeed = this.speed;
    if (this.postLaunch > 0) this.postLaunch -= dt;
    void prevSpeed;

    // Direction: rate-limited rotation toward the desired direction (long arcs at speed).
    if (hasInput && !this.braking && this.launchTimer <= 0) {
      D.divideScalar(dLen);
      if (this.speed < 0.5) {
        this.dir.copy(D);
      } else {
        const maxTurn = interpTable(F.turnSpeeds, F.turnRates, this.speed) * DEG * dt;
        rotateToward(this.dir, D, maxTurn);
      }
    }

    this.vel.copy(this.dir).multiplyScalar(this.speed);

    // Barrel-roll dodge: lateral offset during the roll.
    if (this.rollT >= 0) {
      this.rollT += dt / F.rollDuration;
      if (this.rollT >= 1) {
        this.rollT = -1;
        this.rollAngle = 0;
      } else {
        const side = _v2.crossVectors(this.dir, UP);
        if (side.lengthSq() < 1e-4) side.copy(right);
        side.normalize();
        const s = Math.sin(Math.PI * this.rollT) * F.rollDodgeSpeed * this.rollDir;
        this.vel.addScaledVector(side, s);
        const e = this.rollT;
        this.rollAngle = this.rollDir * Math.PI * 2 * (e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2);
      }
    }

    this.collideMove(dt, true);

    // Ground skim: keep a little air under the body when flying fast and low.
    if (this.mode === 'flight' && this.speed > 20 && this.dir.y < 0.25) {
      const surf = this.world.supportHeight(this.pos.x, this.pos.z, this.pos.y);
      const min = surf + F.skimHeight;
      if (this.pos.y < min) this.pos.y += (min - this.pos.y) * expFactor(10, dt);
    }

    // Near-miss detection.
    if (this.mode === 'flight' && this.speed > T.fx.nearMissMinSpeed && this.nearMissCooldown <= 0) {
      const d = this.world.nearestDistance(this.pos, T.fx.nearMissDist, _v2);
      if (d < T.fx.nearMissDist && d > 0.2) {
        this.nearMissCooldown = 0.35;
        this.events.emit('nearMiss', { pos: _v2.clone(), speed: this.speed, dist: d });
      }
    }

    if (this.pos.y > 15000) this.pos.y = 15000;
  }

  private endBurst(): void {
    const F = T.flight;
    this.burstCooldown = F.burstCooldown * Math.max(0.25, this.burstTime / F.burstMax);
    this.burstTime = 0;
    this.events.emit('burst', { active: false });
  }

  private startRoll(dir: number): void {
    this.rollT = 0;
    this.rollDir = dir;
    this.events.emit('barrelRoll', { dir });
  }

  // ───────────────────────────────────────────────────────────── collision response

  /** Move by vel·dt with swept collision. Handles landings, slides and frontal impacts. */
  private collideMove(dt: number, flying: boolean): void {
    const F = T.flight;
    const R = F.radius;
    const hit = this.hit;
    let mx = this.vel.x * dt;
    let my = this.vel.y * dt;
    let mz = this.vel.z * dt;
    const off = (HIP - R) * (flying ? this.upright : 1);
    const from = _v2;
    const to = new Vector3();
    for (let iter = 0; iter < 4; iter++) {
      from.set(this.pos.x, this.pos.y - off, this.pos.z);
      to.set(from.x + mx, from.y + my, from.z + mz);
      if (!this.world.sweepSphere(from, to, R, hit)) {
        this.pos.set(to.x, to.y + off, to.z);
        return;
      }
      this.pos.set(hit.point.x, hit.point.y + off, hit.point.z);
      const rem = 1 - hit.t;
      mx *= rem;
      my *= rem;
      mz *= rem;
      const n = hit.normal;
      const speed = this.vel.length();
      const vn = -this.vel.dot(n);
      if (vn <= 1e-6 || speed < 1e-6) continue;
      const sinInc = vn / speed;
      const floorLike = n.y > 0.7;

      if (floorLike && hit.kind === 'water') {
        // Never land in water: skim / hover above it.
        if (vn > 25) this.events.emit('impact', { pos: hit.point.clone(), normal: n.clone(), speed: vn, kind: 'water', id: hit.id });
        this.vel.addScaledVector(n, vn);
        const d = mx * n.x + my * n.y + mz * n.z;
        mx -= n.x * d;
        my -= n.y * d;
        mz -= n.z * d;
        if (this.mode !== 'flight') {
          this.setMode('flight');
          this.dir.copy(this.vel).normalize();
        }
        this.speed = this.vel.length();
        if (this.speed > 1e-4) this.dir.copy(this.vel).divideScalar(this.speed);
        continue;
      }

      if (floorLike && (sinInc > Math.sin(F.glancingDeg * DEG) || speed < 20)) {
        this.land(vn, n);
        return;
      }

      if (sinInc < Math.sin(F.glancingDeg * DEG)) {
        // Glancing: slide along the surface.
        this.vel.addScaledVector(n, vn);
        const d = mx * n.x + my * n.y + mz * n.z;
        mx -= n.x * d;
        my -= n.y * d;
        mz -= n.z * d;
        if (this.scrapeCooldown <= 0 && speed > 15) {
          this.scrapeCooldown = 0.08;
          this.events.emit('scrape', { pos: hit.point.clone(), normal: n.clone(), speed });
        }
        if (this.mode === 'flight') {
          this.speed = this.vel.length();
          if (this.speed > 1e-4) this.dir.copy(this.vel).divideScalar(this.speed);
        }
        continue;
      }

      // Frontal contact: stop with a small rebound. Glass shatters above the threshold.
      this.events.emit('impact', { pos: hit.point.clone(), normal: n.clone(), speed: vn, kind: hit.kind, id: hit.id });
      if (vn > 30) this.events.emit('shake', { amount: Math.min(1, vn / 400) });
      const tangential = _v.copy(this.vel).addScaledVector(n, vn).multiplyScalar(0.2);
      this.vel.copy(tangential).addScaledVector(n, Math.min(5, vn * 0.04));
      if (this.mode === 'flight') {
        this.speed = this.vel.length();
        if (this.speed > 1e-4) this.dir.copy(this.vel).divideScalar(this.speed);
        this.diving = false;
        this.launchTimer = 0;
      } else if (this.mode === 'airborne') {
        // keep falling
      }
      // Move out by the rebound only.
      mx = this.vel.x * dt * rem;
      my = this.vel.y * dt * rem;
      mz = this.vel.z * dt * rem;
    }
  }

  private land(vn: number, n: Vector3): void {
    const Ld = T.landing;
    const kind: LandingKind = vn >= Ld.craterSpeed ? 'crater' : vn >= Ld.heroSpeed ? 'hero' : 'soft';
    const surf = this.world.supportHeight(this.pos.x, this.pos.z, this.pos.y + 0.5);
    this.pos.y = surf + HIP;
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.landingKind = kind;
    this.landingSpeed = vn;
    this.landingDuration = kind === 'soft' ? Ld.softRecover : kind === 'hero' ? Ld.heroRecover : Ld.heroRecover + 0.3;
    this.setMode('landing');
    this.rollT = -1;
    this.rollAngle = 0;
    this.events.emit('landing', { kind, pos: this.feet(), speed: vn, normal: n.clone() });
    if (kind !== 'soft') this.events.emit('shake', { amount: kind === 'crater' ? 1 : 0.6 });
  }

  private stepLanding(input: InputFrame, dt: number): void {
    this.vel.set(0, 0, 0);
    void dt;
    if (this.modeTime > 0.35 && input.pressed.has('jump')) {
      this.setMode('ground');
      this.jumpPending = true;
      this.jumpHold = 0;
      return;
    }
    if (this.modeTime >= this.landingDuration) this.setMode('ground');
  }

  /** Horizontal ground move with simple wall sliding (sphere at given height above the feet). */
  private slideMove(mx: number, my: number, mz: number, radius: number, heightAboveFeet: number): void {
    const hit = this.hit;
    const from = new Vector3();
    const to = new Vector3();
    const base = this.pos.y - HIP + heightAboveFeet + radius;
    for (let iter = 0; iter < 3; iter++) {
      from.set(this.pos.x, base, this.pos.z);
      to.set(from.x + mx, base + my, from.z + mz);
      if (!this.world.sweepSphere(from, to, radius, hit) || hit.id < 0 || hit.normal.y > 0.7) {
        this.pos.x += mx;
        this.pos.z += mz;
        return;
      }
      this.pos.x = hit.point.x;
      this.pos.z = hit.point.z;
      const rem = 1 - hit.t;
      mx *= rem;
      mz *= rem;
      const n = hit.normal;
      const d = mx * n.x + mz * n.z;
      mx -= n.x * d;
      mz -= n.z * d;
      const vd = this.vel.x * n.x + this.vel.z * n.z;
      if (vd < 0) {
        this.vel.x -= n.x * vd;
        this.vel.z -= n.z * vd;
      }
    }
  }

  // ───────────────────────────────────────────────────────────── orientation

  private updateOrientation(input: InputFrame, cam: CameraAim, dt: number): void {
    const F = T.flight;
    let targetHeading = this.heading;
    let targetLean = 0;
    let targetBank = 0;
    let headingOmega = 12;

    if (this.mode === 'flight') {
      const s = this.speed;
      const horiz = Math.hypot(this.dir.x, this.dir.z);
      this.flightPitch = Math.asin(clamp(this.dir.y, -1, 1));
      const dirHeading = horiz > 0.2 ? Math.atan2(this.dir.x, -this.dir.z) : this.heading;
      const w = smoothstep(4, 12, s);
      const camHeading = cam.yaw;
      targetHeading = w > 0.5 ? dirHeading : camHeading;
      if (w > 0 && w < 1) targetHeading = this.heading + wrapAngle(dirHeading - this.heading) * w + wrapAngle(camHeading - this.heading) * (1 - w) * 0.5;
      headingOmega = lerp(8, 14, w);
      // The body leans into intended acceleration before the speed arrives (anticipation, not lag).
      targetLean = this.targetFlightLean(Math.max(s, Math.min(this.intentSpeed, s + F.leanLeadSpeed)));
      if (this.braking) targetLean = lerp(targetLean, 12 * DEG, smoothstep(0, 40, s));
      if (this.launchTimer > 0) targetLean = Math.PI / 2 - this.flightPitch;

      // Yaw rate of the flight direction → bank.
      if (s > 4 && horiz > 0.3) {
        const rate = wrapAngle(dirHeading - this.prevDirHeading) / dt;
        this.yawRate += (rate - this.yawRate) * expFactor(12, dt);
        this.prevDirHeading = dirHeading;
      } else {
        this.yawRate *= 1 - expFactor(6, dt);
        this.prevDirHeading = dirHeading;
      }
      const sfB = smoothstep(4, 60, s);
      targetBank = clamp(F.bankGain * this.yawRate * sfB, -F.bankMaxDeg * DEG, F.bankMaxDeg * DEG);
      // Hover strafe tilt.
      targetBank += input.moveX * 9 * DEG * (1 - sfB);
    } else if (this.mode === 'ground') {
      if (this.groundSpeed > 0.4) targetHeading = Math.atan2(this.vel.x, -this.vel.z);
      targetLean = this.sprinting ? 16 * DEG : this.crouching ? 6 * DEG : 0;
      headingOmega = this.sprinting ? 9 : 14;
      this.yawRate = 0;
    } else if (this.mode === 'airborne') {
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > 1) targetHeading = Math.atan2(this.vel.x, -this.vel.z);
      targetLean = this.vel.y > 0 ? 6 * DEG : 14 * DEG;
      headingOmega = 6;
    } else if (this.mode === 'launchCharge' || this.mode === 'leapCharge') {
      targetHeading = cam.yaw;
      targetLean = 10 * DEG;
    } else if (this.mode === 'landing') {
      targetLean = this.landingKind === 'soft' ? 0 : 20 * DEG;
      headingOmega = 4;
    }

    // Heading: angle-wrapped critically damped spring (exact integration, never snaps).
    const err = wrapAngle(targetHeading - this.heading);
    const exp = Math.exp(-headingOmega * dt);
    const change = -err;
    const temp = (this.headingV + headingOmega * change) * dt;
    this.headingV = (this.headingV - headingOmega * temp) * exp;
    this.heading = wrapAngle(this.heading + err + (change + temp) * exp);

    this.lean.step(targetLean, this.mode === 'flight' ? F.bodyOmega : 12, dt);
    this.bank.step(targetBank, F.bankOmega, dt);
    this.updateBodyQuat(dt);
  }

  private updateBodyQuat(_dt: number): void {
    // yaw (model faces +Z; heading 0 = north = −Z) · lean (about local +X) · roll (about long axis)
    _q.setFromAxisAngle(UP, Math.PI - this.heading);
    _q2.setFromAxisAngle(_axis.set(1, 0, 0), this.lean.x);
    _q.multiply(_q2);
    const prone = clamp01(Math.sin(clamp(this.lean.x, 0, Math.PI)));
    _axis.set(0, prone, 1 - prone).normalize();
    _q2.setFromAxisAngle(_axis, -(this.bank.x + this.rollAngle));
    this.bodyQ.copy(_q.multiply(_q2));
  }
}

/** Rotate unit vector `v` toward unit vector `target` by at most `maxAngle` radians (in place). */
export function rotateToward(v: Vector3, target: Vector3, maxAngle: number): void {
  const d = clamp(v.dot(target), -1, 1);
  const ang = Math.acos(d);
  if (ang <= maxAngle || ang < 1e-6) {
    v.copy(target);
    return;
  }
  _axis.crossVectors(v, target);
  if (_axis.lengthSq() < 1e-10) {
    // Opposite vectors: pick any perpendicular axis (prefer turning about world up).
    _axis.set(0, 1, 0);
    if (Math.abs(v.y) > 0.9) _axis.set(1, 0, 0);
    _axis.cross(v);
  }
  _axis.normalize();
  _q.setFromAxisAngle(_axis, maxAngle);
  v.applyQuaternion(_q).normalize();
}
