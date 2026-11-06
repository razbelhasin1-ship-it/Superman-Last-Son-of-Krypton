/**
 * FX director: turns gameplay events + per-frame hero state into visuals, audio and camera feel
 * (spec 7.4, 7.6). Owns particle systems, wind streaks, sonic-boom and ground FX, and drives the
 * SpeedFx post uniforms.
 */
import { Color, Group, PerspectiveCamera, Vector2, Vector3, Vector4 } from 'three';
import type { GameEventMap } from '../contracts.ts';
import type { EventBus } from '../core/events.ts';
import type { HeroController } from '../flight/HeroController.ts';
import type { CameraRig } from '../camera/CameraRig.ts';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { HeroVisual } from '../hero/HeroVisual.ts';
import type { CloudDeck } from '../render/clouds/CloudDeck.ts';
import type { BoxCollisionWorld } from '../world/collision.ts';
import { ParticleSystem } from './Particles.ts';
import { softTexture, sparkTexture, shardTexture } from './textures.ts';
import { WindStreaks } from './WindStreaks.ts';
import { SonicBoomFx } from './SonicBoomFx.ts';
import { GroundFx } from './GroundFx.ts';
import { SpeedFxEffect } from './SpeedFxEffect.ts';
import { Rng } from '../core/rng.ts';
import { clamp, expFactor, lerp, smoothstep, MACH1 } from '../core/math.ts';
import { T } from '../tuning.ts';
import type { Settings } from '../ui/settings.ts';

interface ScreenShock {
  pos: Vector3;
  t: number;
  dur: number;
  r1: number;
  strength: number;
}

const DUST = new Color(0.62, 0.56, 0.48);
const SPRAY = new Color(0.92, 0.96, 1.0);
const MIST = new Color(1, 1, 1);
const SPARK = new Color(1.0, 0.75, 0.4);

export class FxDirector {
  readonly group = new Group();
  readonly dust: ParticleSystem;
  readonly mist: ParticleSystem;
  readonly sparks: ParticleSystem;
  readonly shards: ParticleSystem;
  readonly streaks: WindStreaks;
  readonly boom: SonicBoomFx;
  readonly ground: GroundFx;
  readonly speedFx: SpeedFxEffect;
  private readonly rng = new Rng('fx');
  private time = 0;
  private shocks: ScreenShock[] = [];
  private streakFlick = 0;
  private mistLevel = 0;
  private wasInCloud = false;
  private flash = 0;
  private tunnel = 0;
  private surfaceAcc = 0;
  private hoverDustAcc = 0;
  private boomTip = false;
  private prevHeroY = 0;
  private readonly hero: HeroController;
  private readonly rig: CameraRig;
  private readonly audio: AudioEngine;
  private readonly visual: HeroVisual;
  private readonly world: BoxCollisionWorld;
  clouds: CloudDeck | null = null;
  /** Scripted mist (intro cloud burst) combined with the measured cloud density. */
  introMist = 0;
  private punchArmed = false;
  settings: Settings;
  onHint: (id: string, text: string) => void = () => {};
  onCollateral: (amount: number, reason: string) => void = () => {};

  constructor(
    events: EventBus<GameEventMap>,
    hero: HeroController,
    rig: CameraRig,
    audio: AudioEngine,
    visual: HeroVisual,
    world: BoxCollisionWorld,
    settings: Settings,
  ) {
    this.hero = hero;
    this.rig = rig;
    this.audio = audio;
    this.visual = visual;
    this.world = world;
    this.settings = settings;
    this.group.name = 'fx';
    this.dust = new ParticleSystem(4000, softTexture(), { name: 'dust' });
    this.mist = new ParticleSystem(3000, softTexture(), { name: 'mist' });
    this.sparks = new ParticleSystem(1500, sparkTexture(), { additive: true, stretch: 0.022, name: 'sparks' });
    this.shards = new ParticleSystem(1200, shardTexture(), { name: 'shards' });
    for (const p of [this.dust, this.mist, this.sparks, this.shards]) this.group.add(p.mesh);
    this.streaks = new WindStreaks(T.fx.windQuads);
    this.group.add(this.streaks.mesh);
    this.boom = new SonicBoomFx(this.group);
    this.ground = new GroundFx(this.group);
    this.speedFx = new SpeedFxEffect();
    this.bind(events);
  }

  private bind(ev: EventBus<GameEventMap>): void {
    ev.on('tierChange', ({ from, to }) => {
      if (to > from) {
        this.rig.kickFov();
        if (to >= 3) this.visual.cape.crack(0.5 + (to - 3) * 0.2);
      }
    });
    ev.on('overboost', ({ active }) => {
      if (active && this.hero.mode === 'flight' && this.hero.speed > 30) {
        this.visual.cape.crack(0.7);
        this.audio.capeCrack(0.6);
      }
    });
    ev.on('sonicBoom', ({ pos, dir, altitude }) => {
      this.visual.cape.crack(1.3);
      this.boom.ring(pos, dir, 1.5, 70, 0.9);
      this.boom.ring(pos.clone().addScaledVector(dir, -6), dir, 1, 45, 0.7);
      this.screenShock(pos, 0.75, 0.9, 1.0);
      this.rig.addTrauma(0.45);
      this.audio.boom(T.fx.boomAudioDelay, 1);
      this.flash = 1;
      // Vapour burst around the hero.
      this.mist.burst(
        40,
        (k, o) => {
          const a = (k / 40) * Math.PI * 2;
          const side = new Vector3().crossVectors(dir, new Vector3(0, 1, 0));
          if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
          side.normalize();
          const up = new Vector3().crossVectors(side, dir).normalize();
          const r = side.multiplyScalar(Math.cos(a)).add(up.multiplyScalar(Math.sin(a)));
          o.x = pos.x + r.x * 1.5;
          o.y = pos.y + r.y * 1.5;
          o.z = pos.z + r.z * 1.5;
          o.vx = r.x * 30;
          o.vy = r.y * 30;
          o.vz = r.z * 30;
        },
        { x: 0, y: 0, z: 0, life: 0.9, size0: 2, size1: 9, color: MIST, alpha: 0.5, drag: 3 },
      );
      // A vertical power launch throws its shock cone skyward: no collateral for that.
      const vertical = dir.y > 0.8;
      if (altitude < 300 && !this.settings.safeBoom && !vertical) {
        this.onCollateral(0.6, 'boom');
        if (!this.boomTip) {
          this.boomTip = true;
          this.onHint('boom', 'Gain altitude before going supersonic');
        }
      }
    });
    ev.on('takeoff', ({ kind, pos, charge }) => {
      if (kind === 'lift') {
        this.dustRing(pos, 14, 9, 1.2, 0.5);
        this.audio.thump(0.25, 1.4);
      } else if (kind === 'runup') {
        this.dustRing(pos, 20, 16, 1.6, 0.6);
        this.audio.thump(0.4, 1.2);
      } else {
        const c = charge;
        this.ground.shockRing(pos, 20 + 55 * c, 0.9 + 0.5 * c);
        this.ground.crackDecal(pos, 2.5 + 4.5 * c, Math.round(this.time * 7));
        this.ground.debrisBurst(pos, Math.round(8 + 22 * c), 14 + 20 * c, 0.1 + 0.1 * c);
        this.dustRing(pos, 50 + 70 * c, 22 + 40 * c, 3 + 3 * c, 0.85);
        this.rig.whipUp(0.6 + 0.6 * c);
        this.rig.addTrauma(0.35 + 0.4 * c);
        this.screenShock(pos, 0.45, 0.7, 0.6 + 0.6 * c);
        this.audio.thump(0.9 + 0.3 * c, 0.7);
        this.visual.cape.crack(1);
      }
    });
    ev.on('leap', ({ pos, charge }) => {
      this.dustRing(pos, 16 + 30 * charge, 10 + 18 * charge, 1.5 + 2 * charge, 0.6);
      if (charge > 0.4) this.ground.crackDecal(pos, 1.5 + 2 * charge, Math.round(this.time * 13));
      this.audio.thump(0.4 + 0.4 * charge, 1.1);
    });
    ev.on('landing', ({ kind, pos, speed }) => {
      if (kind === 'soft') {
        this.dustRing(pos, 10, 5, 1, 0.35);
        this.audio.thump(0.2, 1.6);
        return;
      }
      if (kind === 'hero') {
        this.ground.shockRing(pos, 28, 0.8);
        this.ground.crackDecal(pos, 4.5, Math.round(this.time * 11));
        this.dustRing(pos, 60, 26, 3.5, 0.8);
        this.ground.debrisBurst(pos, 12, 14, 0.12);
        this.rig.addTrauma(0.65);
        this.screenShock(pos, 0.35, 0.6, 0.5);
        this.audio.thump(1, 0.8);
      } else {
        const r = lerp(T.landing.craterMin, T.landing.craterMax, clamp((speed - 150) / 750, 0, 1));
        this.ground.crater(pos, r, Math.round(this.time * 17));
        this.ground.shockRing(pos, 80, 1.2);
        this.dustRing(pos, 120, 45, 7, 0.95);
        this.rig.addTrauma(1);
        this.screenShock(pos, 0.6, 0.9, 1);
        this.audio.thump(1.2, 0.55);
        this.audio.boom(0, 0.5);
        this.onCollateral(0.4, 'crater');
      }
    });
    ev.on('brake', ({ speed, pos, dir }) => {
      if (speed > 300) {
        this.boom.ring(pos.clone().addScaledVector(dir, 3), dir, 1, 30, 0.6);
        this.screenShock(pos.clone().addScaledVector(dir, 3), 0.4, 0.5, 0.6);
        this.audio.whoosh(0.8, 0, 0.6);
      }
      if (this.hero.altitude < 25) {
        const g = new Vector3(pos.x, this.world.supportHeight(pos.x, pos.z, pos.y), pos.z);
        this.dustRing(g, 30, 18, 3, 0.6);
      }
    });
    ev.on('scrape', ({ pos, normal, speed }) => {
      const t = new Vector3().copy(this.hero.vel).normalize();
      this.sparks.burst(
        Math.min(30, 6 + Math.round(speed / 20)),
        (_k, o) => {
          o.vx = t.x * speed * 0.3 + normal.x * this.rng.range(2, 12) + this.rng.range(-6, 6);
          o.vy = t.y * speed * 0.3 + normal.y * this.rng.range(2, 12) + this.rng.range(-2, 8);
          o.vz = t.z * speed * 0.3 + normal.z * this.rng.range(2, 12) + this.rng.range(-6, 6);
        },
        { x: pos.x, y: pos.y, z: pos.z, life: 0.45, size0: 0.08, size1: 0.03, color: SPARK, alpha: 1, drag: 1.5, gravity: 9.8 },
      );
      this.rig.addTrauma(0.12);
      this.audio.scrape(Math.min(1, speed / 300));
    });
    ev.on('impact', ({ pos, normal, speed, kind }) => {
      if (kind === 'glass' && speed > T.flight.glassShatterSpeed) {
        this.shards.burst(
          90,
          (_k, o) => {
            o.vx = -normal.x * this.rng.range(5, 25) + this.rng.range(-12, 12);
            o.vy = this.rng.range(-4, 14);
            o.vz = -normal.z * this.rng.range(5, 25) + this.rng.range(-12, 12);
            o.size0 = this.rng.range(0.15, 0.6);
            o.size1 = o.size0;
          },
          { x: pos.x, y: pos.y, z: pos.z, life: 2.2, size0: 0.3, size1: 0.3, color: new Color(0.75, 0.88, 1.0), alpha: 0.85, drag: 0.4, gravity: 12 },
        );
        this.audio.shatter(1);
        this.onCollateral(0.3, 'glass');
      } else if (kind !== 'water') {
        this.dust.burst(
          24,
          (_k, o) => {
            o.vx = normal.x * this.rng.range(3, 12) + this.rng.range(-5, 5);
            o.vy = normal.y * this.rng.range(3, 12) + this.rng.range(0, 6);
            o.vz = normal.z * this.rng.range(3, 12) + this.rng.range(-5, 5);
          },
          { x: pos.x, y: pos.y, z: pos.z, life: 1.6, size0: 1, size1: 5, color: DUST, alpha: 0.6, drag: 2.5 },
        );
      } else {
        this.splash(pos, speed);
      }
      this.audio.thump(Math.min(1, speed / 200), 1);
    });
    ev.on('nearMiss', ({ pos, speed }) => {
      this.streakFlick = Math.min(1, this.streakFlick + 0.5);
      this.rig.addTrauma(0.08);
      const camRight = new Vector3(1, 0, 0).applyQuaternion(this.rig.camera.quaternion);
      const rel = new Vector3().subVectors(pos, this.rig.camera.position);
      const pan = clamp(rel.dot(camRight) / Math.max(1, rel.length()), -1, 1);
      this.audio.whoosh(Math.min(1, 0.4 + speed / 500), pan, clamp(9 / Math.sqrt(speed), 0.2, 0.6));
    });
    ev.on('barrelRoll', () => this.audio.whoosh(0.35, 0, 0.5));
  }

  private dustRing(pos: Vector3, n: number, speed: number, size: number, alpha: number): void {
    this.dust.burst(
      n,
      (k, o) => {
        const a = (k / n) * Math.PI * 2 + this.rng.range(-0.1, 0.1);
        const sp = speed * this.rng.range(0.6, 1.1);
        o.x = pos.x + Math.cos(a) * 0.6;
        o.y = pos.y + 0.3;
        o.z = pos.z + Math.sin(a) * 0.6;
        o.vx = Math.cos(a) * sp;
        o.vy = this.rng.range(0.5, 3);
        o.vz = Math.sin(a) * sp;
        o.size0 = size * 0.6;
        o.size1 = size * this.rng.range(2.5, 4);
      },
      { x: 0, y: 0, z: 0, life: 2.4, size0: 1, size1: 4, color: DUST, alpha, drag: 1.8 },
    );
  }

  private splash(pos: Vector3, speed: number): void {
    this.mist.burst(
      50,
      (_k, o) => {
        o.vx = this.rng.range(-1, 1) * speed * 0.15;
        o.vy = this.rng.range(4, 18);
        o.vz = this.rng.range(-1, 1) * speed * 0.15;
      },
      { x: pos.x, y: pos.y, z: pos.z, life: 1.8, size0: 1, size1: 6, color: SPRAY, alpha: 0.7, drag: 1.2, gravity: 9.8 },
    );
  }

  /** Project a world point to a screen-space refraction ring. */
  screenShock(pos: Vector3, dur: number, r1: number, strength: number): void {
    this.shocks.push({ pos: pos.clone(), t: 0, dur, r1, strength });
    if (this.shocks.length > 2) this.shocks.shift();
  }

  /** Vapour-cone amount: a pulse on every Mach 1 crossing (either direction) + pre-boom build-up. */
  private coneTimer = 10;
  private prevSpeed = 0;
  cone = 0;

  /** Fixed-step: surface interaction spawns (rate-based, deterministic). */
  step(dt: number): void {
    this.time += dt;
    const h = this.hero;
    const s = h.speed;
    const crossed = (this.prevSpeed < MACH1 && s >= MACH1) || (this.prevSpeed >= MACH1 && s < MACH1);
    if (crossed && h.mode === 'flight') this.coneTimer = 0;
    this.coneTimer += dt;
    const pulse = this.coneTimer < 0.65 ? smoothstep(0, 0.06, this.coneTimer) * (1 - smoothstep(0.25, 0.65, this.coneTimer)) : 0;
    const accelerating = s > this.prevSpeed + 0.05;
    const build = accelerating ? 0.35 * smoothstep(322, MACH1, s) * (s < MACH1 ? 1 : 0) : 0;
    this.cone = Math.max(pulse, build);
    this.prevSpeed = s;
    // Low over water: V spray wake + mist. Low over ground: dust and leaves.
    if (h.mode === 'flight' && s > 18) {
      const surf = this.world.supportHeight(h.pos.x, h.pos.z, h.pos.y);
      const height = h.pos.y - surf;
      if (height < T.fx.surfaceFxHeight) {
        const k = (1 - height / T.fx.surfaceFxHeight) * smoothstep(18, 120, s);
        this.surfaceAcc += dt * 140 * k;
        const water = this.world.isWater(h.pos.x, h.pos.z);
        const back = new Vector3(-h.vel.x, 0, -h.vel.z);
        if (back.lengthSq() > 1e-4) back.normalize();
        const side = new Vector3(-back.z, 0, back.x);
        while (this.surfaceAcc >= 1) {
          this.surfaceAcc -= 1;
          const sgn = this.rng.chance(0.5) ? 1 : -1;
          const spread = Math.min(30, s * 0.18);
          if (water) {
            this.mist.spawn({
              x: h.pos.x + this.rng.range(-1, 1),
              y: surf + 0.2,
              z: h.pos.z + this.rng.range(-1, 1),
              vx: side.x * sgn * spread + back.x * s * 0.08,
              vy: this.rng.range(3, 10) + s * 0.02,
              vz: side.z * sgn * spread + back.z * s * 0.08,
              life: 1.6,
              size0: 0.6,
              size1: 3 + s * 0.012,
              color: SPRAY,
              alpha: 0.55,
              drag: 1.6,
              gravity: 9.8,
            });
          } else {
            const leaf = this.rng.chance(0.2);
            this.dust.spawn({
              x: h.pos.x + this.rng.range(-2, 2),
              y: surf + 0.3,
              z: h.pos.z + this.rng.range(-2, 2),
              vx: side.x * sgn * spread * 0.5 + back.x * s * 0.12 + this.rng.range(-3, 3),
              vy: this.rng.range(1, 5),
              vz: side.z * sgn * spread * 0.5 + back.z * s * 0.12 + this.rng.range(-3, 3),
              life: leaf ? 2.5 : 1.8,
              size0: leaf ? 0.12 : 1.2,
              size1: leaf ? 0.12 : 5,
              color: leaf ? new Color(0.3, 0.42, 0.12) : DUST,
              alpha: leaf ? 0.9 : 0.4,
              drag: 1.4,
              gravity: leaf ? 1.5 : 0,
            });
          }
        }
      }
    }
    // Hover downwash dust when hovering near the ground.
    if (h.mode === 'flight' && s < 10) {
      const surf = this.world.supportHeight(h.pos.x, h.pos.z, h.pos.y);
      const height = h.pos.y - surf;
      if (height < 5) {
        this.hoverDustAcc += dt * 25 * (1 - height / 5);
        while (this.hoverDustAcc >= 1) {
          this.hoverDustAcc -= 1;
          const a = this.rng.range(0, Math.PI * 2);
          this.dust.spawn({
            x: h.pos.x,
            y: surf + 0.2,
            z: h.pos.z,
            vx: Math.cos(a) * 6,
            vy: 0.6,
            vz: Math.sin(a) * 6,
            life: 1.5,
            size0: 0.6,
            size1: 2.5,
            color: DUST,
            alpha: 0.25,
            drag: 2,
          });
        }
      }
    }
  }

  /** Per-frame: post uniforms, streaks, cones, rings, mist. */
  frame(dt: number, camera: PerspectiveCamera, prevViewProj: import('three').Matrix4 | null, night: number): void {
    const h = this.hero;
    const s = h.speed;
    for (const p of [this.dust, this.mist, this.sparks, this.shards]) p.update(this.time);
    this.boom.update(dt, this.time, this.visual.root.position, h.vel, this.cone);
    this.ground.update(dt, (x, z) => this.world.supportHeight(x, z, 1e5));
    const relWind = new Vector3().copy(h.vel).negate();
    const streakI = smoothstep(35, 260, s) * (0.55 + 0.45 * smoothstep(260, 2400, s));
    this.streaks.update(camera.position, relWind, s, streakI, night);

    // Power launch punching through the cloud deck: horizontal shock ring + mist ring + hole.
    this.clouds?.tickHole(dt);
    if (h.postLaunch > 0 && h.vel.y > 250 && h.lastLaunchCharge >= T.takeoff.punchCharge) {
      // The shock front runs ~0.35 s ahead of the hero, so the hole is already open when he arrives.
      const deck = T.fx.cloudBase - 100;
      const lead = h.vel.y * 0.35;
      if (this.prevHeroY + lead < deck && h.pos.y + lead >= deck) {
        this.cloudPunch(h.pos.clone().setY(T.fx.cloudBase + 150));
        this.punchArmed = true;
      }
      // Breaking out of the top: the cinematic burst (the hole keeps the mist below the in-cloud threshold).
      const top = T.fx.cloudTop - 350;
      if (this.punchArmed && this.prevHeroY < top && h.pos.y >= top) {
        this.punchArmed = false;
        this.flash = Math.max(this.flash, 0.55);
        this.cloudBurst(camera, h.vel);
        this.audio.whoosh(0.9, 0, 0.8);
      }
    } else this.punchArmed = false;
    this.prevHeroY = h.pos.y;

    // Cloud mist + burst.
    const dens = this.clouds ? this.clouds.densityAt(camera.position) : 0;
    this.mistLevel += (dens - this.mistLevel) * expFactor(dens > this.mistLevel ? 10 : 4, dt);
    const inCloud = this.mistLevel > 0.22;
    if (this.wasInCloud && !inCloud) {
      const upward = h.vel.y > 5;
      if (upward && s > 60) {
        this.flash = Math.max(this.flash, 0.7);
        this.cloudBurst(camera, h.vel);
        this.audio.whoosh(0.9, 0, 0.8);
      }
    }
    if (!this.wasInCloud && inCloud) this.audio.whoosh(0.4, 0, 0.6);
    this.wasInCloud = inCloud;

    // Speed effect uniforms.
    const fx = this.speedFx;
    this.streakFlick *= 1 - expFactor(6, dt);
    const burst = h.effTier >= 6 ? 1 : 0;
    this.tunnel += (burst - this.tunnel) * expFactor(4, dt);
    fx.set('uStreak', clamp(smoothstep(T.fx.streakStart, T.fx.streakFull, s) * 0.9 + this.streakFlick * 0.35 + this.tunnel * 0.4, 0, 1.4));
    fx.set('uCA', T.fx.caMax * smoothstep(200, 2400, s) + this.tunnel * 0.006);
    const blurScale = this.settings.reducedMotionBlur ? 0.25 : 1;
    fx.set('uBlur', T.fx.motionBlurStrength * smoothstep(15, 260, s) * blurScale);
    fx.set('uTunnel', this.tunnel);
    fx.set('uMist', clamp(Math.max(this.mistLevel * 1.15, this.introMist) + this.flash * 0.22, 0, 0.97));
    fx.set('uFxTime', this.time);
    this.flash *= 1 - expFactor(4, dt);
    fx.set('uHeroDist', camera.position.distanceTo(this.visual.root.position));
    // Vanishing point.
    const center = fx.u<Vector2>('uCenter').value as Vector2;
    if (s > 1) {
      const ahead = new Vector3().copy(camera.position).addScaledVector(h.vel, 10 / s * 50);
      ahead.project(camera);
      if (ahead.z < 1) center.set(clamp(ahead.x * 0.5 + 0.5, -0.5, 1.5), clamp(ahead.y * 0.5 + 0.5, -0.5, 1.5));
    }
    // Shock rings in screen space.
    const sh = [fx.u<Vector4>('uShock').value as Vector4, fx.u<Vector4>('uShock2').value as Vector4];
    sh[0]!.w = 0;
    sh[1]!.w = 0;
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const k = this.shocks[i]!;
      k.t += dt;
      if (k.t > k.dur) {
        this.shocks.splice(i, 1);
        continue;
      }
      // Only shocks in front of the camera and reasonably near distort the screen.
      const viewPos = k.pos.clone().applyMatrix4(camera.matrixWorldInverse);
      const dist = viewPos.length();
      const inFront = viewPos.z < -1;
      const near = 1 - smoothstep(150, 900, dist);
      const p = k.pos.clone().project(camera);
      const e = k.t / k.dur;
      const slot = sh[Math.min(i, 1)]!;
      const onScreen = Math.abs(p.x) < 1.6 && Math.abs(p.y) < 1.6;
      slot.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, k.r1 * (1 - Math.pow(1 - e, 2.5)), inFront && onScreen ? k.strength * (1 - e) * near : 0);
    }
    // Supersonic wake behind the hero (screen space).
    const wake = smoothstep(MACH1, 700, s);
    fx.set('uWake', wake);
    if (wake > 0) {
      const hp = this.visual.root.position.clone().project(camera);
      (fx.u<Vector2>('uHeroUv').value as Vector2).set(hp.x * 0.5 + 0.5, hp.y * 0.5 + 0.5);
      // Screen direction of the trailing wake: the velocity in view space (never project a point
      // that may lie behind the camera).
      const vv = h.vel.clone().negate().applyQuaternion(camera.quaternion.clone().invert());
      const wd = new Vector2(vv.x, vv.y);
      if (wd.lengthSq() > 1e-8) (fx.u<Vector2>('uWakeDir').value as Vector2).copy(wd.normalize());
    }
    fx.setCamera(camera, prevViewProj);
    this.audio.setFlight(s, this.mistLevel, 0);
  }

  get mist01(): number {
    return this.mistLevel;
  }

  private cloudPunch(p: Vector3): void {
    this.clouds?.punch(p.x, p.z, 420, 7);
    this.boom.ring(p, new Vector3(0, 1, 0), 10, 520, 2.2);
    this.boom.ring(p.clone().setY(p.y + 60), new Vector3(0, 1, 0), 6, 380, 1.8);
    this.mist.burst(
      90,
      (k, o) => {
        const a = (k / 90) * Math.PI * 2;
        const r = this.rng.range(20, 60);
        o.x = p.x + Math.cos(a) * r;
        o.y = p.y + this.rng.range(-40, 40);
        o.z = p.z + Math.sin(a) * r;
        const sp = this.rng.range(110, 190);
        o.vx = Math.cos(a) * sp;
        o.vy = this.rng.range(-8, 18);
        o.vz = Math.sin(a) * sp;
        o.size0 = this.rng.range(25, 50);
        o.size1 = o.size0 * 3.2;
      },
      { x: 0, y: 0, z: 0, life: 3.5, size0: 30, size1: 90, color: MIST, alpha: 0.75, drag: 0.9 },
    );
    this.audio.boom(0.05, 0.7);
    this.rig.addTrauma(0.3);
  }

  private cloudBurst(camera: PerspectiveCamera, vel: Vector3): void {
    const p = camera.position;
    const d = vel.clone().normalize();
    this.mist.burst(
      60,
      (_k, o) => {
        const a = this.rng.range(0, Math.PI * 2);
        const r = this.rng.range(6, 30);
        const side = new Vector3(Math.cos(a), 0, Math.sin(a));
        o.x = p.x + side.x * r - d.x * 15;
        o.y = p.y - 10 + this.rng.range(-5, 5);
        o.z = p.z + side.z * r - d.z * 15;
        o.vx = side.x * 25;
        o.vy = this.rng.range(-5, 10);
        o.vz = side.z * 25;
        o.size0 = this.rng.range(8, 20);
        o.size1 = o.size0 * 3;
      },
      { x: 0, y: 0, z: 0, life: 1.6, size0: 10, size1: 30, color: MIST, alpha: 0.6, drag: 1.2 },
    );
  }
}
