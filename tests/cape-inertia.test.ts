import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { Cape } from '../src/hero/Cape.ts';

/** Body orientation as HeroController builds it: yaw (model faces +Z) then forward lean about local X. */
function bodyQuat(heading: number, lean: number): Quaternion {
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI - heading);
  return q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), lean));
}

function bottomMid(c: Cape): Vector3 {
  const i = ((c.rows - 1) * c.cols + Math.floor(c.cols / 2)) * 3;
  return new Vector3(c.pos[i], c.pos[i + 1], c.pos[i + 2]);
}

describe('cape inertia', () => {
  const dt = 1 / 60;
  const chest = new Matrix4();
  const q = bodyQuat(0, (60 * Math.PI) / 180);
  const pitch = (18 * Math.PI) / 180;
  const vel = new Vector3(0, Math.sin(pitch), -Math.cos(pitch)).multiplyScalar(40);

  function settle(c: Cape): void {
    c.reset(chest);
    for (let i = 0; i < 90; i++) c.step(dt, chest, q, q, vel, new Vector3(), 1);
  }

  it('keeps streaming back when the flight path bends hard at cruise speed (no flip over the head)', () => {
    const c = new Cape();
    settle(c);
    // Levelling out of a climb: ≈ −9 g perpendicular to the velocity for 0.4 s.
    const turn = new Vector3(0, -89, -29);
    let maxY = -Infinity;
    for (let i = 0; i < 24; i++) {
      c.step(dt, chest, q, q, vel, turn, 1);
      maxY = Math.max(maxY, bottomMid(c).y);
    }
    // The pins sit at y ≈ 1.54 (model space); the free edge must stay well below the shoulders.
    expect(maxY).toBeLessThan(1.0);
  });

  it('still flares forward under a hard brake (deceleration along the velocity)', () => {
    const c = new Cape();
    settle(c);
    const zBefore = bottomMid(c).z;
    const brake = vel.clone().normalize().multiplyScalar(-150);
    for (let i = 0; i < 18; i++) c.step(dt, chest, q, q, vel, brake, 1);
    // Model +Z is the hero's front: the free edge swings toward it.
    expect(bottomMid(c).z).toBeGreaterThan(zBefore + 0.1);
  });
});
