/**
 * Orchestrates the main menu backdrop, the Play sequence (5.2) and the handoff to gameplay (5.3).
 * The menu shows the opening shot of the Play sequence, so pressing PLAY flows in with no cut.
 */
import { Quaternion, Vector3 } from 'three';
import type { HeroBody } from '../contracts.ts';
import type { HeroController } from '../flight/HeroController.ts';
import { HIP } from '../flight/HeroController.ts';
import type { HeroVisual } from '../hero/HeroVisual.ts';
import type { CameraRig } from '../camera/CameraRig.ts';
import type { CloudDeck } from '../render/clouds/CloudDeck.ts';
import type { Hud } from '../ui/Hud.ts';
import type { FxDirector } from '../fx/FxDirector.ts';
import type { DofEffect } from '../fx/CinemaEffects.ts';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { InputFrame } from '../core/input.ts';
import { Rng } from '../core/rng.ts';
import { DEG, smoothstep } from '../core/math.ts';
import { LINE, PlaySequence, T_CONTROL, T_DIVE, T_END } from './PlaySequence.ts';

export interface IntroHost {
  hero: HeroController;
  visual: HeroVisual;
  rig: CameraRig;
  clouds: CloudDeck;
  hud: Hud;
  fx: FxDirector;
  dof: DofEffect;
  audio: AudioEngine;
  setDofEnabled(on: boolean): void;
  /** Called once control is handed to the player. */
  onControl(): void;
  subtitlesOn(): boolean;
}

/** Camera looks WNW so the late-morning sun keys the hero from the upper left (spec 5.2). */
const LOOK_HEADING = -70 * DEG;
export const INTRO_FACING = new Vector3(-Math.sin(LOOK_HEADING), 0, Math.cos(LOOK_HEADING)).normalize();
export const INTRO_ANCHOR = new Vector3(-INTRO_FACING.x * 1150, 2100, -INTRO_FACING.z * 1150 - 250);

export class IntroDirector {
  readonly seq: PlaySequence;
  t = 0;
  private skipHold = 0;
  private menuT = 0;
  private handedOff = false;
  private readonly host: IntroHost;
  private readonly prevFeet = new Vector3();
  private readonly prevVel = new Vector3();
  private exhaled = false;
  private whooshed = false;

  constructor(host: IntroHost) {
    this.host = host;
    this.seq = new PlaySequence(INTRO_ANCHOR, INTRO_FACING);
    this.placeClouds();
  }

  /** Hand-placed cumulus banks for the composition + a thin layer to burst through on the dive. */
  private placeClouds(): void {
    const c = this.host.clouds;
    const A = INTRO_ANCHOR;
    c.clearAround(A.x, A.z, 1400);
    const rng = new Rng('intro-clouds');
    const look = INTRO_FACING.clone().negate();
    const right = new Vector3().crossVectors(look, new Vector3(0, 1, 0)).normalize();
    // Keep the line of sight behind the hero clear (the storyboard has open sky below him).
    c.clearWhere((cl) => {
      const dx = cl.cx - A.x;
      const dz = cl.cz - A.z;
      const along = dx * look.x + dz * look.z;
      const side = Math.abs(dx * right.x + dz * right.z);
      return along > 0 && side < along * 0.17 + cl.radius * 0.6;
    });
    const at = (along: number, side: number) => A.clone().addScaledVector(look, along).addScaledVector(right, side);
    // Banks in the lower-left and lower-right corners only (seen through the 20° lens, looking up ≈ 6°):
    // tops a little above the hover altitude, nothing directly behind the hero; thin wisps upper-left.
    for (const [along, side, size, base, h] of [
      [3600, -1500, 1300, 1700, 560],
      [4600, -2300, 1500, 1650, 640],
      [5600, -3000, 1700, 1600, 680],
      [3900, 1500, 1200, 1720, 540],
      [5200, 2400, 1600, 1620, 660],
      [6400, 3300, 1800, 1580, 700],
    ] as const) {
      const p = at(along, side);
      c.addCloud(rng, p.x, base, p.z, size, h, 0.92);
    }
    for (const [along, side, size, y] of [
      [5600, -2500, 900, 2900],
      [6800, -1900, 1100, 3050],
      [7600, -3300, 1200, 3150],
    ] as const) {
      const p = at(along, side);
      c.addCloud(rng, p.x, y, p.z, size, 140, 0.35);
    }
    // The thin layer below the feet: the dive punches through it (≈0.15 s white-out). Small puffs so
    // the layer stays well below the hero and the camera (tops ≈ 120 m under the feet).
    const below = A.clone().addScaledVector(INTRO_FACING, 40);
    for (let gx = -3; gx <= 3; gx++) {
      for (let gz = -3; gz <= 3; gz++) {
        const x = below.x + gx * 120 + rng.range(-30, 30);
        const z = below.z + gz * 120 + rng.range(-30, 30);
        c.addCloud(rng, x, A.y - 260, z, 190, 70, 1);
      }
    }
    c.afterEdit();
  }

  private body(): HeroBody | undefined {
    return (this.host.visual as unknown as { body?: HeroBody }).body;
  }

  /** Put the hero at the hover point, facing the camera. */
  placeHero(): void {
    const h = this.host.hero;
    h.spawnFlying(INTRO_ANCHOR.clone().setY(INTRO_ANCHOR.y + HIP), INTRO_FACING.clone(), 0);
    h.bodyQ.copy(this.seq.heroQ);
    h.prevBodyQ.copy(this.seq.heroQ);
    h.speed = 0;
    h.vel.set(0, 0, 0);
    this.prevFeet.copy(INTRO_ANCHOR);
    this.host.visual.setPoseOverride('hover');
    this.host.visual.snap(h);
    this.host.rig.mode = 'cinematic';
    this.applyPose(0, 1 / 60, true);
    this.host.rig.initialized = false;
    this.host.rig.step(1 / 60, h);
    this.host.rig.frame(1);
  }

  /** Menu backdrop: a wider pre-roll of the opening shot (hero right of the title), alive. */
  stepMenu(dt: number): void {
    this.menuT += dt;
    this.applyPose(0, dt, false, this.menuT, 1);
  }

  /** 0 = intro framing, 1 = menu pre-roll framing (hero smaller, right of centre). */
  private preroll = 1;
  private prerollT = 0;

  startIntro(fromMenu = true): void {
    this.prerollT = fromMenu ? 1.2 : 0;
    this.t = 0;
    this.handedOff = false;
    this.exhaled = false;
    this.whooshed = false;
    this.skipHold = 0;
  }

  /** Returns true when the intro has finished (control handed over and blend complete). */
  stepIntro(dt: number, input: InputFrame): boolean {
    // Skip: hold Space / Enter / gamepad A for 0.6 s after the first 1.5 s → jump to the handoff.
    const holding = input.held.has('jump') || input.held.has('confirm');
    if (this.t > 1.5 && this.t < T_DIVE && holding) {
      this.skipHold += dt;
      if (this.skipHold >= 0.6) {
        this.t = T_DIVE - 0.2;
        this.skipHold = 0;
      }
    } else this.skipHold = 0;
    if (this.prerollT > 0) {
      // Glide from the menu framing into the opening shot, then start the storyboard timeline.
      this.prerollT = Math.max(0, this.prerollT - dt);
      const k = this.prerollT / 1.2;
      this.applyPose(0, dt, false, this.menuT + (1.2 - this.prerollT), k * k * (3 - 2 * k));
      return false;
    }
    this.t += dt;
    if (!this.handedOff) this.applyPose(this.t, dt, false);
    if (this.t >= 9.0 && !this.exhaled) {
      this.exhaled = true;
      this.host.audio.whoosh(0.08, 0, 1.2); // soft exhale under the line
    }
    if (this.t >= T_DIVE && !this.whooshed) {
      this.whooshed = true;
      this.host.audio.whoosh(0.7, 0, 1.0);
    }
    if (this.t >= T_CONTROL && !this.handedOff) this.handoff();
    if (this.handedOff) {
      const p = this.seq.evaluate(this.t);
      this.host.hud.setFade(p.hudFade);
      this.host.hud.subtitle(null);
    }
    return this.t >= T_END;
  }

  private handoff(): void {
    this.handedOff = true;
    const h = this.host.hero;
    const p = this.seq.evaluate(this.t);
    const vel = this.prevVel.clone();
    const speed = Math.max(120, vel.length());
    const dir = vel.lengthSq() > 1 ? vel.clone().normalize() : new Vector3(INTRO_FACING.x * 0.5, -0.86, INTRO_FACING.z * 0.5).normalize();
    const pos = p.heroFeet.clone().setY(p.heroFeet.y + HIP);
    h.spawnFlying(pos, dir, speed);
    h.tier = 2;
    this.host.visual.setPoseOverride(null);
    this.host.visual.lookYaw = 0;
    this.host.visual.lookPitch = 0;
    this.host.visual.jaw = 0;
    this.host.rig.blendToChase(T_END - T_CONTROL, h);
    this.host.setDofEnabled(false);
    this.host.onControl();
    this.host.hud.hint('pullup', 'Pull up — S / Space to level out', 5);
  }

  /** Drive hero, visual and camera from the timeline at time t. */
  private applyPose(t: number, dt: number, snap: boolean, actT = t, preroll = 0): void {
    const H = this.host;
    const p = this.seq.evaluate(t);
    if (preroll > 0) {
      // Menu framing: pull back and shift the hero right of the title column.
      const look = this.seq.facing.clone().negate();
      const right = new Vector3().crossVectors(look, new Vector3(0, 1, 0)).normalize();
      p.camPos.addScaledVector(this.seq.facing, 5 * preroll).addScaledVector(right, -2.4 * preroll);
      p.camTarget.addScaledVector(right, -2.4 * preroll);
    }
    this.preroll = preroll;
    const h = H.hero;
    // Hero placement (scripted; the flight model is not stepped during the intro).
    h.prevBodyQ.copy(h.bodyQ);
    h.prevPos.copy(h.pos);
    const lean = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), p.heroLean);
    h.bodyQ.copy(this.seq.heroQ).multiply(lean);
    h.pos.copy(p.heroFeet).setY(p.heroFeet.y + HIP);
    const v = p.heroFeet.clone().sub(this.prevFeet).divideScalar(Math.max(dt, 1e-4));
    if (snap) v.set(0, 0, 0);
    this.prevFeet.copy(p.heroFeet);
    // The cape reads the hero velocity as relative wind: use the breeze while hovering.
    if (t < T_DIVE) h.vel.copy(p.breeze).negate();
    else h.vel.copy(v);
    h.accel.subVectors(h.vel, this.prevVel).divideScalar(Math.max(dt, 1e-4));
    if (h.accel.length() > 400) h.accel.setLength(400);
    this.prevVel.copy(h.vel);
    h.speed = t < T_DIVE ? 0 : v.length();
    h.mode = 'flight';
    H.visual.setPoseOverride(t < T_DIVE ? 'hover' : 'dash');
    H.visual.lookYaw = p.headYaw;
    H.visual.lookPitch = p.headPitch;
    H.visual.jaw = p.jaw;
    H.visual.breathAmp = p.breathAmp;
    H.visual.breathRate = 0.22 + 0.05 * Math.sin(actT * 0.13);
    const body = this.body();
    body?.setBlink(Math.max(p.eyesClosed, p.blink));
    body?.setGaze(p.gazeYaw, p.gazePitch);
    body?.setSmile(p.smile);
    H.visual.step(h, dt);
    // Camera.
    const rig = H.rig;
    rig.mode = 'cinematic';
    rig.cine.pos.copy(p.camPos);
    rig.cine.target.copy(p.camTarget);
    rig.cine.fov = p.fov;
    rig.cine.roll = p.roll;
    rig.step(dt, h);
    // DOF + subtitle + mist.
    H.setDofEnabled(p.dof > 0.001);
    H.dof.set('uAmount', p.dof);
    H.dof.set('uFocusDist', p.focusDist);
    H.dof.set('uFocusRange', Math.max(0.6, p.focusDist * 0.35));
    H.dof.set('uMaxBlur', 0.016);
    H.hud.subtitle(H.subtitlesOn() ? LINE : null, p.subtitle);
    H.hud.setFade(0);
    H.fx.introMist = p.mist;
    void smoothstep;
  }
}
