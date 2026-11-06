/**
 * Module contracts shared between the main agent (flight, camera, integration) and subsystem
 * owners (hero/, world/, powers/, life/, audio/, qa/). Keep these small and stable.
 */
import type { Vector3, Object3D, Camera, Scene, WebGLRenderer } from 'three';

// ───────────────────────────────────────────────────────────── collision / world queries

export type SurfaceKind = 'ground' | 'solid' | 'glass' | 'water' | 'none';

export interface SweepHit {
  /** Fraction along the swept segment (0..1) at first contact. */
  t: number;
  /** Sphere centre at contact. */
  point: Vector3;
  /** Surface normal at contact (unit). */
  normal: Vector3;
  kind: SurfaceKind;
  /** Collider id (−1 for terrain). */
  id: number;
}

export interface BoxCollider {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  /** Rotation about +Y (radians). */
  yaw: number;
  kind: SurfaceKind;
  /** Optional tag (landmark slug, building id, …). */
  tag?: string;
}

export interface CollisionWorld {
  readonly waterLevel: number;
  /** Terrain height (not roofs) at x, z. */
  groundHeight(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  /** Earliest contact of a sphere swept from `from` to `to`. Returns false when clear. */
  sweepSphere(from: Vector3, to: Vector3, radius: number, out: SweepHit): boolean;
  /** Distance from p to the nearest collider surface within maxDist (Infinity if none). */
  nearestDistance(p: Vector3, maxDist: number, outPoint?: Vector3): number;
  /** Highest walkable surface (terrain, water or a box top) at x, z that is at or below maxY. */
  supportHeight(x: number, z: number, maxY: number): number;
}

/** Physics impulse API shared by every power (spec 8). */
export interface ForceField {
  applyForce(origin: Vector3, direction: Vector3, strength: number, falloff: number): void;
}

// ───────────────────────────────────────────────────────────── gameplay events

export type LandingKind = 'soft' | 'hero' | 'crater';
export type TakeoffKind = 'lift' | 'launch' | 'runup';

export interface GameEventMap {
  tierChange: { from: number; to: number };
  sonicBoom: { pos: Vector3; dir: Vector3; speed: number; altitude: number };
  takeoff: { kind: TakeoffKind; pos: Vector3; charge: number };
  leap: { pos: Vector3; apex: number; charge: number };
  landing: { kind: LandingKind; pos: Vector3; speed: number; normal: Vector3 };
  brake: { speed: number; pos: Vector3; dir: Vector3 };
  scrape: { pos: Vector3; normal: Vector3; speed: number };
  impact: { pos: Vector3; normal: Vector3; speed: number; kind: SurfaceKind; id: number };
  nearMiss: { pos: Vector3; speed: number; dist: number };
  burst: { active: boolean };
  overboost: { active: boolean };
  barrelRoll: { dir: number };
  dive: { active: boolean };
  cloud: { inside: boolean; upward: boolean; speed: number };
  hitstop: { frames: number };
  shake: { amount: number };
  hint: { text: string; id: string };
}

// ───────────────────────────────────────────────────────────── systems

export interface FrameContext {
  dt: number;
  time: number;
  camera: Camera;
  scene: Scene;
}

/** A system that is stepped at the fixed simulation rate and/or once per rendered frame. */
export interface GameSystem {
  step?(dt: number): void;
  frame?(ctx: FrameContext): void;
  dispose?(): void;
}

export interface RenderContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
}

export interface HeroPoseSource {
  /** Root transform target for the hero visual (world). */
  readonly root: Object3D;
}

export interface StatsSnapshot {
  drawCalls: number;
  triangles: number;
  frameMs: number;
  activeChunks: number;
  fps: number;
  heroSpeed: number;
  heroAlt: number;
  tier: number;
}
