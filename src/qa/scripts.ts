/**
 * Scripted flights (spec 7.8.2 and the 10-second test 7.8.3). Each script sets up a scenario and
 * then drives a virtual pad + camera aim per fixed step, keyed to script time only.
 */
import { Vector3 } from 'three';
import type { VirtualPad } from '../core/input.ts';
import type { HeroController } from '../flight/HeroController.ts';
import type { CameraRig } from '../camera/CameraRig.ts';
import { MACH1, clamp, wrapAngle } from '../core/math.ts';

export interface ScriptHost {
  hero: HeroController;
  rig: CameraRig;
  pad: VirtualPad;
  setHour(h: number): void;
  spawnGround(p: Vector3, heading: number): void;
  spawnFlying(p: Vector3, dir: Vector3, speed: number): void;
  addCloud(x: number, base: number, z: number, size: number, height: number): void;
  log(msg: string): void;
}

export interface FlightScript {
  name: string;
  duration: number;
  captureHz: number;
  setup(h: ScriptHost): void;
  tick(h: ScriptHost, t: number, dt: number): void;
}

/** Steer the camera aim toward a world point at a limited rate (rad/s). */
function aimAt(h: ScriptHost, target: Vector3, rate: number, dt: number): void {
  const d = new Vector3().subVectors(target, h.hero.pos);
  const yaw = Math.atan2(d.x, -d.z);
  const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  const dy = wrapAngle(yaw - h.rig.yaw);
  h.rig.yaw = wrapAngle(h.rig.yaw + clamp(dy, -rate * dt, rate * dt));
  h.rig.pitch += clamp(pitch - h.rig.pitch, -rate * dt, rate * dt);
}

/** Pitch control toward a target altitude (simple P controller on the camera pitch). */
function holdAltitude(h: ScriptHost, alt: number, maxPitch: number, dt: number): void {
  const err = alt - h.hero.pos.y;
  const want = clamp(err / 250, -maxPitch, maxPitch);
  h.rig.pitch += clamp(want - h.rig.pitch, -1.2 * dt, 1.2 * dt);
}

let boomAt = -1;
let canyonAt = -1;

export const SCRIPTS: FlightScript[] = [
  {
    name: 'takeoff-lift',
    duration: 5,
    captureHz: 5,
    setup(h) {
      h.spawnGround(new Vector3(0, 0, 30), 0);
      h.rig.yaw = 0.35;
      h.rig.pitch = -0.08;
      h.hero.tier = 1;
    },
    tick(h, t) {
      if (Math.abs(t - 0.6) < 1e-6) h.pad.tap('jump');
      if (t >= 1.8 && t < 1.8 + 1 / 60) {
        h.pad.move(0, 1);
        h.rig.pitch = 0.32;
      }
      if (t >= 4.2 && t < 4.2 + 1 / 60) h.pad.move(0, 0);
    },
  },
  {
    name: 'power-launch',
    duration: 6,
    captureHz: 5,
    setup(h) {
      h.addCloud(60, 1520, -120, 1300, 800);
      h.spawnGround(new Vector3(40, 0, 80), 0);
      h.rig.yaw = 0.25;
      h.rig.pitch = -0.05;
      h.hero.tier = 2;
    },
    tick(h, t, dt) {
      if (Math.abs(t - 0.3) < 1e-6) h.pad.hold('jump');
      if (Math.abs(t - 1.6) < 1e-6) {
        h.pad.release('jump');
        h.log(`release charge at t=${t.toFixed(2)}`);
      }
      if (t > 1.6) h.rig.pitch = Math.min(0.42, h.rig.pitch + 0.45 * dt);
      if (h.hero.pos.y > 1500 && canyonAt < 0) {
        canyonAt = t;
        h.log(`reached cloud deck (1500 m) at t=${t.toFixed(2)}s`);
      }
    },
  },
  {
    name: 'canyon-cruise',
    duration: 8,
    captureHz: 5,
    setup(h) {
      h.spawnFlying(new Vector3(0, 70, -330), new Vector3(0, 0, -1), 120);
      h.hero.tier = 2;
      h.rig.yaw = 0;
      h.rig.pitch = -0.04;
      h.pad.move(0, 1);
    },
    tick(h, t, dt) {
      h.rig.yaw = 0.06 * Math.sin(t * 1.3);
      holdAltitude(h, 70 + 20 * Math.sin(t * 0.8), 0.25, dt);
    },
  },
  {
    name: 'supersonic-3000',
    duration: 6,
    captureHz: 5,
    setup(h) {
      boomAt = -1;
      h.spawnFlying(new Vector3(-600, 3000, 3000), new Vector3(0, 0, -1), 300);
      h.hero.tier = 4;
      h.rig.yaw = 0.15;
      h.rig.pitch = -0.1;
      h.pad.move(0, 1);
    },
    tick(h, t) {
      if (boomAt < 0 && h.hero.speed >= MACH1) {
        boomAt = t;
        h.log(`Mach 1 at t=${t.toFixed(2)}s`);
      }
    },
  },
  {
    name: 'supersonic-200',
    duration: 6,
    captureHz: 5,
    setup(h) {
      boomAt = -1;
      h.spawnFlying(new Vector3(0, 200, 900), new Vector3(0, 0, -1), 300);
      h.hero.tier = 4;
      h.rig.yaw = 0;
      h.rig.pitch = -0.06;
      h.pad.move(0, 1);
    },
    tick(h, t, dt) {
      holdAltitude(h, 200, 0.2, dt);
      if (boomAt < 0 && h.hero.speed >= MACH1) {
        boomAt = t;
        h.log(`Mach 1 at t=${t.toFixed(2)}s, altitude ${h.hero.pos.y.toFixed(0)} m`);
      }
    },
  },
  {
    name: 'brake-mach2',
    duration: 4.4,
    captureHz: 5,
    setup(h) {
      canyonAt = -1;
      h.spawnFlying(new Vector3(-2500, 1000, 0), new Vector3(0, 0, -1), 686);
      h.hero.tier = 4;
      h.rig.yaw = 0.2;
      h.rig.pitch = -0.05;
    },
    tick(h, t) {
      if (Math.abs(t - 0.4) < 1e-6) h.pad.hold('brake');
      if (h.hero.speed < 2 && canyonAt < 0 && t > 0.4) {
        canyonAt = t;
        h.log(`hover reached ${(t - 0.4).toFixed(2)}s after braking from Mach 2`);
      }
    },
  },
  {
    name: 'dive-landing',
    duration: 8,
    captureHz: 5,
    setup(h) {
      canyonAt = -1;
      h.spawnFlying(new Vector3(260, 900, 520), new Vector3(0, 0, -1), 120);
      h.hero.tier = 2;
      h.rig.yaw = 0;
      h.rig.pitch = -0.3;
      h.pad.move(0, 1);
    },
    tick(h, t, dt) {
      if (Math.abs(t - 0.5) < 1e-6) h.pad.doubleTap('crouch');
      if (t > 0.5) h.rig.pitch = Math.max(-1.0, h.rig.pitch - 0.8 * dt);
      if (h.hero.mode === 'landing' && canyonAt < 0) {
        canyonAt = t;
        h.pad.move(0, 0);
        h.log(`landing (${h.hero.landingKind}) at t=${t.toFixed(2)}s, impact ${h.hero.landingSpeed.toFixed(0)} m/s`);
        h.rig.pitch = -0.25;
      }
    },
  },
  {
    name: 'cloud-flythrough',
    duration: 9,
    captureHz: 5,
    setup(h) {
      h.addCloud(0, 1550, -2600, 900, 850);
      h.spawnFlying(new Vector3(0, 1250, 0), new Vector3(0, 0.2, -1).normalize(), 300);
      h.hero.tier = 3;
      h.rig.yaw = 0;
      h.rig.pitch = 0.2;
      h.pad.move(0, 1);
    },
    tick(h, t, dt) {
      aimAt(h, new Vector3(0, 3600, -3000), 0.7, dt);
      if (h.hero.pos.y > 2550 && canyonAt < 0) {
        canyonAt = t;
        h.log(`broke out of the deck at t=${t.toFixed(2)}s`);
      }
    },
  },
  {
    name: 'ten-second',
    duration: 10,
    captureHz: 5,
    setup(h) {
      boomAt = -1;
      canyonAt = -1;
      // Control handoff: diving at ~1,800 m just south of the skyline.
      h.spawnFlying(new Vector3(0, 1800, 350), new Vector3(0, -0.85, -0.53).normalize(), 90);
      h.hero.tier = 3;
      h.rig.yaw = 0;
      h.rig.pitch = -0.95;
      h.pad.move(0, 1);
    },
    tick(h, t, dt) {
      const z = h.hero.pos.z;
      if (z > -420 && h.hero.pos.y > 200) {
        // Dive toward the canyon mouth (x = 0, z ≈ −480, ~120 m up).
        aimAt(h, new Vector3(0, 115, -520), 1.6, dt);
      } else {
        h.rig.yaw += wrapAngle(0 - h.rig.yaw) * Math.min(1, 6 * dt);
        holdAltitude(h, 115, 0.35, dt);
      }
      if (canyonAt < 0 && z < -520 && h.hero.pos.y < 330) {
        canyonAt = t;
        h.log(`entered the tower canyon at t=${t.toFixed(2)}s, ${h.hero.speed.toFixed(0)} m/s (tier ${h.hero.effTier})`);
      }
      // Thread the canyon at DASH for ~1.5 s, then overboost through Mach 1.
      if (canyonAt > 0 && t > canyonAt + 1.5) h.pad.hold('overboost');
      if (boomAt < 0 && h.hero.speed >= MACH1) {
        boomAt = t;
        h.log(`crossed Mach 1 at t=${t.toFixed(2)}s, altitude ${h.hero.pos.y.toFixed(0)} m`);
      }
    },
  },
];

export function resetScriptState(): void {
  boomAt = -1;
  canyonAt = -1;
}
