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

// ───────────────────────────────────────────────────────────── world (owned by src/world/)

export type CityTier = 'UPTOWN' | 'MIDTOWN' | 'DOWNTOWN' | 'ISLAND';

export interface DistrictInfo {
  slug: string;
  name: string;
  tier: CityTier;
  /** Representative centre (x, z). */
  x: number;
  z: number;
}

export interface LandmarkInfo {
  slug: string;
  name: string;
  district: string;
  tier: CityTier;
  x: number;
  z: number;
  /** Approximate height of the landmark's top (m) — for the QA photo tour and discovery radius. */
  height: number;
  /** Radius used for "discovered" HUD popups. */
  radius: number;
  /** Suggested approach pose for screenshots: camera position + target. */
  view?: { from: [number, number, number]; to: [number, number, number] };
}

/**
 * Anything the game can fly around in: the gate-1 test ground or the full city.
 * `update` streams chunks / selects LODs around the camera and animates world shaders.
 */
export interface WorldLike {
  readonly group: Object3D;
  readonly collision: CollisionWorld & {
    addBox(b: BoxCollider): number;
    removeTagged(prefix: string): void;
    readonly waterLevel: number;
  };
  update(camPos: Vector3, heroPos: Vector3, heroVel: Vector3, dt: number, time: number): void;
  activeChunks(): number;
  /** Optional richer API (the city implements these). */
  readonly landmarks?: readonly LandmarkInfo[];
  readonly districts?: readonly DistrictInfo[];
  districtAt?(x: number, z: number): DistrictInfo | null;
  /** 0 = day … 1 = night (window lights, street lights, neon). */
  setNight?(night: number): void;
  /** Resolves once everything around `p` (radius r) is generated and uploaded. */
  whenStreamed?(p: Vector3, r: number): Promise<void>;
  /** Hero spawn on the ground for `?play` without intro. */
  readonly spawn?: Vector3;
}

// ───────────────────────────────────────────────────────────── hero body (owned by src/hero/)

/** The skinned, baked hero body bound to the HeroVisual rig (gate 2 replaces the greybox). */
export interface HeroBody {
  readonly object: Object3D;
  /** 0 = open … 1 = closed. */
  setBlink(v: number): void;
  /** 0..1 heat-vision glow in the eyes (also lights face/chest). */
  setEyeGlow(v: number, color?: [number, number, number]): void;
  /** Gaze offset in radians (eye saccades / look-at), relative to the head. */
  setGaze(yaw: number, pitch: number): void;
  /** 0..1 subtle smile (cinematic acting). */
  setSmile(v: number): void;
  /** Emblem glow (solar charge 0..1). */
  setEmblemGlow(v: number): void;
  dispose(): void;
}

// ───────────────────────────────────────────────────────────── audio (owned by src/audio/)

export type MusicState = 'silent' | 'menu' | 'intro' | 'hover' | 'flight' | 'speed' | 'incident' | 'triumph';

// ───────────────────────────────────────────────────────────── powers (owned by src/powers/, src/physics/)

/**
 * What the game hands the powers module. Concrete types are imported structurally to keep this file
 * dependency-free; see src/game/Game.ts for the implementation.
 */
export interface PowersHost {
  /** HeroController (src/flight/HeroController.ts). */
  readonly hero: unknown;
  /** HeroVisual (src/hero/HeroVisual.ts): registerPose / setActionPose / addPostPoseHook / boneWorld. */
  readonly visual: unknown;
  /** CameraRig (src/camera/CameraRig.ts): mode 'firstPerson', zoom, addTrauma, kickFov. */
  readonly rig: unknown;
  readonly camera: Camera;
  readonly scene: Scene;
  readonly events: unknown;
  /** The active world (test ground or city). */
  readonly world: WorldLike;
  /** FxDirector (src/fx/FxDirector.ts): particle systems, speedFx, ground FX, screenShock. */
  readonly fx: unknown;
  /** AudioEngine (src/audio/AudioEngine.ts). */
  readonly audio: unknown;
  /** Hud (src/ui/Hud.ts). */
  readonly hud: unknown;
  /** Slow the world (focus: 0.15, power wheel: 0.2) while the hero keeps full speed. */
  setWorldTimeScale(scale: number): void;
  /** Simulation time (s). */
  time(): number;
  /** Raise hope (kindness, saves) or collateral (careless damage). */
  addHope(amount: number, reason: string): void;
  addCollateral(amount: number, reason: string): void;
}

export interface PowersSystem {
  /** Fixed step at real (hero) time; `worldDt` is scaled by focus. Input is the current frame. */
  step(dt: number, worldDt: number, input: unknown): void;
  /** Per rendered frame (visuals, HUD). */
  frame(dt: number): void;
  /** 0..1 solar charge (powers overboost, heat-vision overload, focus). */
  readonly solarCharge: number;
  /** Name of the active vision mode, if any ('xray' | 'telescope' | 'scan' | 'hearing' | null). */
  readonly vision: string | null;
  dispose?(): void;
}
