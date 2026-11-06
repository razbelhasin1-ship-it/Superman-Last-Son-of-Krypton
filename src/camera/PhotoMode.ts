/**
 * Photo mode (spec 7.5, key P): the world freezes, a free camera flies around the hero.
 * WASD move · Space / C up / down · Shift fast · drag (left or right mouse) to look · wheel = FOV.
 * Drives the rig through its cinematic override so interpolation and shake code stay in one place.
 */
import { Vector3 } from 'three';
import type { InputFrame } from '../core/input.ts';
import type { CollisionWorld } from '../contracts.ts';
import type { CameraRig } from './CameraRig.ts';
import { clamp } from '../core/math.ts';

export class PhotoMode {
  readonly pos = new Vector3();
  yaw = 0;
  pitch = 0;
  roll = 0;
  fov = 50;
  /** Depth of field: 0 = off … 1 = strong. */
  aperture = 0.45;
  autoFocus = true;
  focusDist = 12;
  maxRadius = 450;
  private readonly anchor = new Vector3();
  private readonly focusTarget = new Vector3();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private dx = 0;
  private dy = 0;
  private wheel = 0;
  private active = false;
  private readonly world: CollisionWorld;

  constructor(canvas: HTMLCanvasElement, world: CollisionWorld) {
    this.world = world;
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.active || !this.dragging) return;
      this.dx += e.clientX - this.lastX;
      this.dy += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: false },
    );
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Start from the current camera pose, around the hero at `heroPos`. */
  enter(camPos: Vector3, camDir: Vector3, fov: number, heroPos: Vector3): void {
    this.active = true;
    this.pos.copy(camPos);
    this.yaw = Math.atan2(camDir.x, -camDir.z);
    this.pitch = Math.asin(clamp(camDir.y, -1, 1));
    this.roll = 0;
    this.fov = clamp(fov, 15, 100);
    this.anchor.copy(heroPos);
    this.focusTarget.copy(heroPos);
    this.dx = this.dy = this.wheel = 0;
  }

  exit(): void {
    this.active = false;
    this.dragging = false;
  }

  get dir(): Vector3 {
    const cp = Math.cos(this.pitch);
    return new Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  /** Distance used for depth of field (the hero when auto-focusing). */
  get focus(): number {
    return this.autoFocus ? Math.max(0.5, this.pos.distanceTo(this.focusTarget)) : this.focusDist;
  }

  step(dt: number, input: InputFrame): void {
    // Look (drag). ~0.25° per pixel.
    this.yaw += this.dx * 0.0045;
    this.pitch = clamp(this.pitch - this.dy * 0.0045, -1.52, 1.52);
    this.dx = this.dy = 0;
    if (this.wheel !== 0) {
      this.fov = clamp(this.fov * Math.pow(1.08, this.wheel), 12, 100);
      this.wheel = 0;
    }
    const fast = input.held.has('overboost');
    const up = (input.held.has('jump') ? 1 : 0) - (input.held.has('crouch') ? 1 : 0);
    const speed = fast ? 40 : 7;
    const fwd = this.dir;
    const right = new Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    this.pos
      .addScaledVector(fwd, input.moveY * speed * dt)
      .addScaledVector(right, input.moveX * speed * dt)
      .addScaledVector(new Vector3(0, 1, 0), up * speed * dt);
    // Stay near the frozen hero and above the ground.
    const off = this.pos.clone().sub(this.anchor);
    if (off.length() > this.maxRadius) this.pos.copy(this.anchor).addScaledVector(off.normalize(), this.maxRadius);
    const ground = this.world.supportHeight(this.pos.x, this.pos.z, this.pos.y + 1) + 0.3;
    if (this.pos.y < ground) this.pos.y = ground;
  }

  apply(rig: CameraRig): void {
    rig.mode = 'cinematic';
    rig.cine.pos.copy(this.pos);
    rig.cine.target.copy(this.pos).add(this.dir);
    rig.cine.fov = this.fov;
    rig.cine.roll = this.roll;
  }
}
