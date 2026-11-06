/**
 * Hero visual: rig + body + cape, driven by the HeroController state through a procedural pose
 * graph (state → pose weights → blended target → per-bone springs → procedural layers).
 */
import { Bone, Group, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import type { HeroController } from '../flight/HeroController.ts';
import { HIP } from '../flight/HeroController.ts';
import { BONES, BONE_COUNT, PARENT_INDEX, boneIndex } from './skeleton.ts';
import { POSES, gaitPose } from './poses.ts';
import { PoseSprings, addRotation, blendPoses, evaluatePose, makePoseData, type PoseData } from './pose.ts';
import { Cape } from './Cape.ts';
import { buildGreybox } from './GreyboxBody.ts';
import { clamp01, expFactor, smoothstep, DEG, lerp } from '../core/math.ts';
import { T } from '../tuning.ts';

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();

export type PoseOverride = { name: string; weight: number } | null;

export class HeroVisual {
  /** World-placed root (at the hero's centre of mass). */
  readonly root = new Group();
  /** Model space (origin at the feet). */
  readonly model = new Group();
  readonly bones: Bone[] = [];
  readonly cape: Cape;
  private readonly library = new Map<string, PoseData>();
  private readonly weights = new Map<string, number>();
  private readonly gait = makePoseData();
  private readonly target = makePoseData();
  readonly springs = new PoseSprings();
  private gaitPhase = 0;
  private time = 0;
  private idleTime = 0;
  /** Bone matrices in model space (updated each step). */
  readonly boneModel: Matrix4[] = [];
  private readonly restInv: Matrix4[] = [];
  private readonly prevPos = new Vector3();
  private readonly curPos = new Vector3();
  private readonly prevQ = new Quaternion();
  private readonly curQ = new Quaternion();
  private bobOffset = 0;
  /** Gallery / cinematic override: force one pose. */
  override: PoseOverride = null;
  /** Extra additive layers set by the game (look target in model space, jaw, eyes). */
  lookYaw = 0;
  lookPitch = 0;
  jaw = 0;
  breathRate = 0.25;
  breathAmp = 1;
  gravityOn = 1;

  constructor() {
    this.root.name = 'hero';
    this.root.add(this.model);
    this.model.position.set(0, -HIP, 0);
    // Build the bone hierarchy (rest orientations identity).
    for (let i = 0; i < BONE_COUNT; i++) {
      const b = new Bone();
      b.name = BONES[i]!.name;
      const h = BONES[i]!.head;
      const p = PARENT_INDEX[i]!;
      if (p >= 0) {
        const ph = BONES[p]!.head;
        b.position.set(h[0] - ph[0], h[1] - ph[1], h[2] - ph[2]);
        this.bones[p]!.add(b);
      } else {
        b.position.set(h[0], h[1], h[2]);
        this.model.add(b);
      }
      this.bones.push(b);
      this.boneModel.push(new Matrix4());
      this.restInv.push(new Matrix4().makeTranslation(-h[0], -h[1], -h[2]));
    }
    buildGreybox(this.bones);
    for (const [name, spec] of Object.entries(POSES)) this.library.set(name, evaluatePose(spec));
    this.setSpringFrequencies();
    this.cape = new Cape();
    this.model.add(this.cape.mesh);
    this.springs.snap(this.library.get('idle')!);
    this.applyToBones(this.springs.cur);
    this.updateCapsules();
  }

  get object(): Object3D {
    return this.root;
  }

  private setSpringFrequencies(): void {
    const w = this.springs.omega;
    for (let i = 0; i < BONE_COUNT; i++) {
      const n = BONES[i]!.name;
      if (n.startsWith('spine') || n === 'pelvis') w[i] = 13;
      else if (n === 'neck' || n === 'head') w[i] = 15;
      else if (n.startsWith('thigh') || n.startsWith('calf')) w[i] = 10; // legs lag the torso
      else if (n.startsWith('foot') || n.startsWith('toe')) w[i] = 12;
      else if (n.includes('arm') || n.startsWith('clav')) w[i] = 15;
      else if (n.startsWith('hand')) w[i] = 18;
      else w[i] = 26; // fingers, face
    }
  }

  /** Hard reset (teleport): snap pose and re-hang the cape. */
  snap(hero: HeroController): void {
    this.prevPos.copy(hero.pos);
    this.curPos.copy(hero.pos);
    this.prevQ.copy(hero.bodyQ);
    this.curQ.copy(hero.bodyQ);
    this.computeTargets(hero, 0);
    this.springs.snap(this.target);
    this.applyToBones(this.springs.cur);
    this.cape.reset(this.boneModel[boneIndex('spine04')]!.clone().multiply(this.restInv[boneIndex('spine04')]!));
  }

  private setW(name: string, target: number, k: number, dt: number): void {
    const cur = this.weights.get(name) ?? 0;
    this.weights.set(name, cur + (target - cur) * expFactor(k, dt));
  }

  private computeTargets(hero: HeroController, dt: number): void {
    const want: Record<string, number> = {};
    const s = hero.speed;
    let gaitW = 0;
    let gaitRun = 0;
    if (this.override) {
      want[this.override.name] = 1;
    } else {
      switch (hero.mode) {
        case 'ground': {
          const gs = hero.groundSpeed;
          if (hero.crouching) want.crouch = 1;
          else if (gs > 0.25) {
            gaitW = smoothstep(0.25, 1.2, gs);
            gaitRun = gs < T.ground.runSpeed ? clamp01((gs - 2.2) / 4) : 1 + clamp01((gs - T.ground.runSpeed) / 20);
            want.idle = 1 - gaitW;
          } else if (this.idleTime > 5) want.heroic = 1;
          else want.idle = 1;
          break;
        }
        case 'takeoff':
          want.charge = 0.55;
          want.crouch = 0.45;
          break;
        case 'launchCharge':
          want.charge = 0.5 + 0.5 * hero.launchCharge01;
          want.crouch = 0.5 - 0.5 * hero.launchCharge01;
          break;
        case 'leapCharge':
          want.charge = 0.5 + 0.5 * hero.leapCharge01;
          want.crouch = 0.5 - 0.5 * hero.leapCharge01;
          break;
        case 'airborne':
          if (hero.vel.y > 2) want.leapUp = 1;
          else want.fall = 1;
          break;
        case 'landing':
          if (hero.landingKind === 'soft') want.softLand = 1;
          else want.heroLanding = 1;
          break;
        case 'flight': {
          if (hero.braking && s > 3) {
            want.brake = 1;
          } else if (hero.diving) {
            want.dash = 1;
          } else if (hero.dir.y > 0.75 && s > 25) {
            want.launch = 1;
          } else {
            const g = smoothstep(4, 30, s);
            const c = smoothstep(32, 110, s);
            const d = smoothstep(110, 320, s);
            const ss = smoothstep(330, 900, s);
            want.hover = 1 - g;
            want.glide = g * (1 - c);
            want.cruise = c * (1 - d);
            want.dash = d * (1 - ss);
            want.supersonic = ss;
          }
          break;
        }
      }
    }
    for (const name of this.library.keys()) {
      if (dt === 0) this.weights.set(name, want[name] ?? 0);
      else this.setW(name, want[name] ?? 0, 7, dt);
    }

    // Gait phase advance.
    if (gaitW > 0) {
      const gs = hero.groundSpeed;
      const cyclesPerSec = gs < 3 ? gs / 2.3 : gs < 9 ? 0.8 + gs / 10 : Math.min(2.6, 1.4 + gs / 40);
      this.gaitPhase = (this.gaitPhase + cyclesPerSec * dt) % 1;
      evaluatePose(gaitPose(this.gaitPhase, gaitRun), this.gait);
    }
    const items: { pose: PoseData; w: number }[] = [];
    for (const [name, pose] of this.library) {
      const w = this.weights.get(name) ?? 0;
      if (w > 1e-3) items.push({ pose, w });
    }
    if (gaitW > 1e-3) items.push({ pose: this.gait, w: gaitW });
    blendPoses(items, this.target);
  }

  /** Fixed-step update. */
  step(hero: HeroController, dt: number): void {
    this.time += dt;
    this.prevPos.copy(this.curPos);
    this.prevQ.copy(this.curQ);
    this.curPos.copy(hero.pos);
    this.curQ.copy(hero.bodyQ);
    if (hero.mode === 'ground' && hero.groundSpeed < 0.25 && !hero.crouching) this.idleTime += dt;
    else this.idleTime = 0;

    this.computeTargets(hero, dt);
    // Springs stiffen at speed (fast poses must hold their line) and soften in hover.
    const stiff = 1 + smoothstep(100, 1000, hero.speed) * 0.5;
    this.springs.step(this.target, dt, stiff);

    // Procedural layers on top of the sprung pose.
    const pose = this.springs.cur;
    const layered = this.layered;
    layered.q.set(pose.q);
    layered.offset.set(pose.offset);
    const breath = Math.sin(this.time * Math.PI * 2 * this.breathRate) * this.breathAmp;
    addRotation(layered, boneIndex('spine03'), [1, 0, 0], -0.012 * breath);
    addRotation(layered, boneIndex('spine04'), [1, 0, 0], -0.016 * breath);
    addRotation(layered, boneIndex('clavicle_L'), [0, 0, 1], 0.01 * breath);
    addRotation(layered, boneIndex('clavicle_R'), [0, 0, 1], -0.01 * breath);
    // Leg lag on banks: legs trail the torso roll a little.
    const bankVel = hero.bank.v;
    addRotation(layered, boneIndex('thigh_L'), [0, 0, 1], clamp(-bankVel * 0.06, -0.15, 0.15));
    addRotation(layered, boneIndex('thigh_R'), [0, 0, 1], clamp(-bankVel * 0.06, -0.15, 0.15));
    // Look-at layer (head/neck).
    addRotation(layered, boneIndex('neck'), [0, 1, 0], this.lookYaw * 0.35);
    addRotation(layered, boneIndex('head'), [0, 1, 0], this.lookYaw * 0.65);
    addRotation(layered, boneIndex('head'), [1, 0, 0], -this.lookPitch * 0.7);
    if (this.jaw > 0) addRotation(layered, boneIndex('jaw'), [1, 0, 0], this.jaw * 14 * DEG);
    this.applyToBones(layered);

    // Hover bob (visual only).
    const hoverish = hero.mode === 'flight' ? 1 - smoothstep(2, 8, hero.speed) : 0;
    this.bobOffset = Math.sin(this.time * Math.PI * 2 * T.flight.bobHz) * T.flight.bobAmp * hoverish;

    // Cape.
    this.updateCapsules();
    const si = boneIndex('spine04');
    const chest = _m.copy(this.boneModel[si]!).multiply(this.restInv[si]!);
    const grav = hero.mode === 'flight' ? 1 - smoothstep(30, 120, hero.speed) * 0.5 : 1;
    this.cape.step(dt, chest, hero.bodyQ, hero.prevBodyQ, hero.vel, hero.accel, grav * this.gravityOn);
  }

  private readonly layered = makePoseData();

  private applyToBones(pose: PoseData): void {
    for (let i = 0; i < BONE_COUNT; i++) {
      const o = i * 4;
      this.bones[i]!.quaternion.set(pose.q[o]!, pose.q[o + 1]!, pose.q[o + 2]!, pose.q[o + 3]!);
    }
    const pelvis = this.bones[boneIndex('pelvis')]!;
    const ph = BONES[boneIndex('pelvis')]!.head;
    pelvis.position.set(ph[0] + pose.offset[0]!, ph[1] + pose.offset[1]!, ph[2] + pose.offset[2]!);
    // Model-space matrices.
    for (let i = 0; i < BONE_COUNT; i++) {
      const b = this.bones[i]!;
      b.updateMatrix();
      const p = PARENT_INDEX[i]!;
      if (p < 0) this.boneModel[i]!.copy(b.matrix);
      else this.boneModel[i]!.multiplyMatrices(this.boneModel[p]!, b.matrix);
    }
  }

  private capPoint(name: string, out: Vector3): Vector3 {
    const i = boneIndex(name);
    return out.setFromMatrixPosition(this.boneModel[i]!);
  }

  private updateCapsules(): void {
    const caps = this.cape.capsules;
    if (caps.length === 0) {
      for (let k = 0; k < 11; k++) caps.push({ a: new Vector3(), b: new Vector3(), r: 0.1 });
    }
    const set = (k: number, a: string, b: string, r: number, ao = 0, bo = 0) => {
      const c = caps[k]!;
      this.capPoint(a, c.a);
      this.capPoint(b, c.b);
      if (ao) c.a.y += ao;
      if (bo) c.b.y += bo;
      c.r = r;
    };
    set(0, 'pelvis', 'spine03', 0.15);
    set(1, 'spine03', 'neck', 0.165);
    set(2, 'neck', 'head', 0.07);
    set(3, 'upperarm_L', 'forearm_L', 0.065);
    set(4, 'upperarm_R', 'forearm_R', 0.065);
    set(5, 'forearm_L', 'hand_L', 0.05);
    set(6, 'forearm_R', 'hand_R', 0.05);
    set(7, 'thigh_L', 'calf_L', 0.09);
    set(8, 'thigh_R', 'calf_R', 0.09);
    set(9, 'calf_L', 'foot_L', 0.065);
    set(10, 'calf_R', 'foot_R', 0.065);
    // Push the torso capsules slightly back so the cape clears the shoulder blades.
    caps[1]!.a.z -= 0.02;
    caps[1]!.b.z -= 0.02;
  }

  /** Render-time interpolation of the root transform. */
  frame(alpha: number): void {
    this.root.position.lerpVectors(this.prevPos, this.curPos, alpha);
    this.root.quaternion.slerpQuaternions(this.prevQ, this.curQ, alpha);
    this.model.position.set(0, -HIP + this.bobOffset, 0);
    this.root.updateMatrixWorld(true);
  }

  /** World position of a bone (after frame()). */
  boneWorld(name: string, out: Vector3): Vector3 {
    return out.setFromMatrixPosition(this.bones[boneIndex(name)]!.matrixWorld);
  }

  setPoseOverride(name: string | null): void {
    this.override = name ? { name, weight: 1 } : null;
  }

  get poseNames(): string[] {
    return [...this.library.keys()];
  }

  /** Smoothly reduce look-at to zero. */
  relaxLook(dt: number): void {
    this.lookYaw = lerp(this.lookYaw, 0, expFactor(4, dt));
    this.lookPitch = lerp(this.lookPitch, 0, expFactor(4, dt));
  }
}

function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

void _q;
void _v;
