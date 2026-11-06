import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { HeroController } from '../src/flight/HeroController.ts';
import { BoxCollisionWorld } from '../src/world/collision.ts';
import { EventBus } from '../src/core/events.ts';
import { FixedLoop } from '../src/core/loop.ts';
import { VirtualPad, emptyFrame, type InputFrame } from '../src/core/input.ts';
import type { GameEventMap } from '../src/contracts.ts';
import { T } from '../src/tuning.ts';

const DT = 1 / 60;

function setup(world = new BoxCollisionWorld()) {
  const events = new EventBus<GameEventMap>();
  const hero = new HeroController(world, events);
  const pad = new VirtualPad();
  const frame: InputFrame = emptyFrame();
  const cam = { yaw: 0, pitch: 0 };
  const step = () => {
    // Mirror Input.sample() edge semantics for the virtual pad.
    const v = pad.frame;
    frame.moveX = v.moveX;
    frame.moveY = v.moveY;
    frame.tierDelta = v.tierDelta;
    frame.held = new Set(v.held);
    frame.pressed = new Set(v.pressed);
    frame.released = new Set(v.released);
    frame.doubleTapped = new Set(v.doubleTapped);
    v.pressed.clear();
    v.released.clear();
    v.doubleTapped.clear();
    v.tierDelta = 0;
    hero.step(frame, cam, DT);
  };
  return { hero, pad, cam, step, events, world };
}

/** Seconds to go from the previous tier's speed to `reachFraction` of tier i, holding W. */
function measureReach(i: number): { time: number; peak: number; target: number } {
  const { hero, pad, step } = setup();
  const prev = T.tiers[i - 1]!.speed;
  const target = T.tiers[i]!.speed;
  hero.spawnFlying(new Vector3(0, 3000, 0), new Vector3(0, 0, -1), prev);
  hero.tier = i === 6 ? 5 : i;
  pad.move(0, 1);
  if (i === 6) pad.hold('overboost');
  let t = 0;
  let reached = -1;
  let peak = 0;
  const limit = T.tiers[i]!.reachTime * 3 + 1;
  while (t < limit) {
    step();
    t += DT;
    peak = Math.max(peak, hero.speed);
    if (reached < 0 && hero.speed >= target * T.flight.reachFraction) reached = t;
    if (i === 6 && t > T.flight.burstMax - 0.05) break; // burst ends by design
  }
  return { time: reached, peak, target };
}

describe('flight integrator — speed tiers', () => {
  for (let i = 1; i < T.tiers.length; i++) {
    const tier = T.tiers[i]!;
    it(`reaches ${tier.name} (${tier.speed} m/s) within ±15% of ${tier.reachTime}s`, () => {
      const r = measureReach(i);
      expect(r.time).toBeGreaterThan(0);
      expect(r.time).toBeGreaterThanOrEqual(tier.reachTime * 0.85);
      expect(r.time).toBeLessThanOrEqual(tier.reachTime * 1.15);
    });
    it(`does not overshoot ${tier.name} by more than 3%`, () => {
      const r = measureReach(i);
      expect(r.peak).toBeLessThanOrEqual(r.target * 1.03);
    });
  }

  it('brakes from cruise to hover in about 0.5 s', () => {
    const { hero, pad, step } = setup();
    hero.spawnFlying(new Vector3(0, 3000, 0), new Vector3(0, 0, -1), 120);
    pad.hold('brake');
    let t = 0;
    while (hero.speed > 2 && t < 5) {
      step();
      t += DT;
    }
    expect(t).toBeGreaterThan(0.4);
    expect(t).toBeLessThan(0.65);
  });

  it('brakes from Mach 1 to hover in about 1.5 s', () => {
    const { hero, pad, step } = setup();
    hero.spawnFlying(new Vector3(0, 3000, 0), new Vector3(0, 0, -1), 343);
    pad.hold('brake');
    let t = 0;
    while (hero.speed > 2 && t < 5) {
      step();
      t += DT;
    }
    expect(t).toBeGreaterThan(1.25);
    expect(t).toBeLessThan(1.75);
  });

  it('emits exactly one sonic boom when crossing Mach 1', () => {
    const { hero, pad, step, events } = setup();
    let booms = 0;
    events.on('sonicBoom', () => booms++);
    hero.spawnFlying(new Vector3(0, 3000, 0), new Vector3(0, 0, -1), 300);
    hero.tier = 4;
    pad.move(0, 1);
    for (let i = 0; i < 240; i++) step();
    expect(hero.speed).toBeGreaterThan(343);
    expect(booms).toBe(1);
  });

  it('limits heading turn rate at cruise to about 90°/s', () => {
    const { hero, pad, cam, step } = setup();
    hero.spawnFlying(new Vector3(0, 3000, 0), new Vector3(0, 0, -1), 120);
    hero.tier = 2;
    pad.move(0, 1);
    cam.yaw = Math.PI / 2; // camera swings to face east
    step();
    const h0 = Math.atan2(hero.dir.x, -hero.dir.z);
    for (let i = 0; i < 30; i++) step();
    const h1 = Math.atan2(hero.dir.x, -hero.dir.z);
    const ratePerSec = ((h1 - h0) / (30 * DT)) * (180 / Math.PI);
    expect(ratePerSec).toBeGreaterThan(70);
    expect(ratePerSec).toBeLessThan(100);
  });
});

describe('flight integrator — determinism', () => {
  function runWithFrames(frameTimes: () => number): number[] {
    const { hero, pad, cam, step } = setup();
    hero.spawnFlying(new Vector3(0, 400, 0), new Vector3(0, 0, -1), 0);
    let n = 0;
    let snapshot: number[] = [];
    const loop = new FixedLoop(
      () => {
        // Scripted input keyed by step index, never by wall time.
        if (n === 0) pad.move(0, 1);
        if (n === 60) cam.yaw = 0.8;
        if (n === 120) pad.hold('overboost');
        if (n === 200) pad.release('overboost');
        if (n === 240) pad.hold('brake');
        step();
        n++;
        if (n === 300) snapshot = [hero.pos.x, hero.pos.y, hero.pos.z, hero.speed, hero.dir.x, hero.dir.z];
      },
      () => {},
    );
    while (n < 300) loop.frame(frameTimes());
    return snapshot;
  }

  it('produces identical state at 30, 60, 144 fps and jittered frame times', () => {
    const a = runWithFrames(() => 1 / 30);
    const b = runWithFrames(() => 1 / 60);
    const c = runWithFrames(() => 1 / 144);
    let s = 12345;
    const d = runWithFrames(() => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return 0.004 + (s / 2147483648) * 0.03;
    });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(d).toEqual(a);
  });
});

describe('flight integrator — swept collision', () => {
  it('never tunnels through a 1 m thick wall at 6,000 m/s', () => {
    for (let k = 0; k < 25; k++) {
      const world = new BoxCollisionWorld();
      const wallZ = -400 - k * 7.3; // vary phase relative to the 100 m step
      world.addBox({ cx: 0, cy: 3000, cz: wallZ, hx: 300, hy: 3000, hz: 0.5, yaw: 0, kind: 'solid' });
      const { hero, pad, step } = setup(world);
      hero.spawnFlying(new Vector3(0, 3000, 0), new Vector3(0, 0, -1), 6000);
      hero.tier = 5;
      pad.move(0, 1);
      pad.hold('overboost');
      for (let i = 0; i < 60; i++) {
        step();
        expect(hero.pos.z).toBeGreaterThan(wallZ + 0.5);
      }
    }
  });

  it('never tunnels through a 1 m thick rotated wall at 6,000 m/s', () => {
    const world = new BoxCollisionWorld();
    // Wide enough that sliding along it at burst speed cannot reach its end within the 1 s window.
    world.addBox({ cx: 0, cy: 3000, cz: -900, hx: 30000, hy: 3000, hz: 0.5, yaw: 0.6, kind: 'glass' });
    const { hero, pad, step } = setup(world);
    hero.spawnFlying(new Vector3(0, 3000, 0), new Vector3(0, 0, -1), 6000);
    hero.tier = 5;
    pad.move(0, 1);
    pad.hold('overboost');
    const n = new Vector3(Math.sin(0.6), 0, Math.cos(0.6)); // wall normal (local +Z rotated by yaw)
    const c = new Vector3(0, 3000, -900);
    const side0 = Math.sign(new Vector3().subVectors(hero.pos, c).dot(n));
    for (let i = 0; i < 60; i++) {
      step();
      const side = Math.sign(new Vector3().subVectors(hero.pos, c).dot(n));
      expect(side).toBe(side0);
    }
  });

  it('lands on the ground instead of passing through it in a power dive', () => {
    const { hero, pad, step } = setup();
    hero.spawnFlying(new Vector3(0, 300, 0), new Vector3(0, -1, 0), 900);
    hero.tier = 4;
    pad.move(0, 1);
    for (let i = 0; i < 120; i++) {
      step();
      expect(hero.pos.y).toBeGreaterThan(-0.01);
    }
    expect(hero.mode === 'landing' || hero.mode === 'ground').toBe(true);
  });
});
