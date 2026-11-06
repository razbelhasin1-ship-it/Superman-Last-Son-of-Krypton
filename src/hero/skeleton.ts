/**
 * The hero rig: 65 bones in a relaxed A-pose. Model space: metres, origin on the ground between the
 * feet, facing +Z, up +Y, the character's left = +X. Height 1.91 m (≈ 7.5 heads).
 * Every bone's rest orientation is identity, so local rotations are expressed in model-space axes.
 * Shared by the runtime (pose graph) and the Node bake script (skinning weights).
 */

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Head (joint) position in model space at rest. */
  head: [number, number, number];
  /** Optional radius used for greybox capsules and skin-weight falloff. */
  radius?: number;
}

export const HERO_HEIGHT = 1.91;
const A_POSE_DEG = 42; // arm angle below horizontal at rest
const ca = Math.cos((A_POSE_DEG * Math.PI) / 180);
const sa = Math.sin((A_POSE_DEG * Math.PI) / 180);
export const UPPER_ARM = 0.315;
export const FOREARM = 0.275;

function add(a: [number, number, number], b: [number, number, number], s = 1): [number, number, number] {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}

function buildBones(): BoneDef[] {
  const bones: BoneDef[] = [
    { name: 'root', parent: null, head: [0, 0, 0] },
    { name: 'pelvis', parent: 'root', head: [0, 0.98, 0], radius: 0.15 },
    { name: 'spine01', parent: 'pelvis', head: [0, 1.06, -0.012], radius: 0.14 },
    { name: 'spine02', parent: 'spine01', head: [0, 1.18, -0.018], radius: 0.14 },
    { name: 'spine03', parent: 'spine02', head: [0, 1.3, -0.012], radius: 0.16 },
    { name: 'spine04', parent: 'spine03', head: [0, 1.42, 0.0], radius: 0.17 },
    { name: 'neck', parent: 'spine04', head: [0, 1.595, -0.02], radius: 0.06 },
    { name: 'head', parent: 'neck', head: [0, 1.685, -0.005], radius: 0.1 },
    { name: 'jaw', parent: 'head', head: [0, 1.72, 0.035], radius: 0.05 },
    { name: 'eye_L', parent: 'head', head: [0.0325, 1.785, 0.083], radius: 0.012 },
    { name: 'eye_R', parent: 'head', head: [-0.0325, 1.785, 0.083], radius: 0.012 },
    { name: 'lid_L', parent: 'head', head: [0.0325, 1.785, 0.083], radius: 0.013 },
    { name: 'lid_R', parent: 'head', head: [-0.0325, 1.785, 0.083], radius: 0.013 },
    { name: 'brow_L', parent: 'head', head: [0.034, 1.812, 0.098], radius: 0.015 },
    { name: 'brow_R', parent: 'head', head: [-0.034, 1.812, 0.098], radius: 0.015 },
  ];

  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const dir: [number, number, number] = [sx * ca, -sa, 0];
    const shoulder: [number, number, number] = [sx * 0.205, 1.535, -0.025];
    const elbow = add(shoulder, dir, UPPER_ARM);
    const wrist = add(elbow, dir, FOREARM);
    bones.push(
      { name: `clavicle_${side}`, parent: 'spine04', head: [sx * 0.025, 1.525, 0.035], radius: 0.05 },
      { name: `upperarm_${side}`, parent: `clavicle_${side}`, head: shoulder, radius: 0.06 },
      { name: `upperarm_twist_${side}`, parent: `upperarm_${side}`, head: add(shoulder, dir, UPPER_ARM * 0.5), radius: 0.055 },
      { name: `forearm_${side}`, parent: `upperarm_${side}`, head: elbow, radius: 0.047 },
      { name: `forearm_twist_${side}`, parent: `forearm_${side}`, head: add(elbow, dir, FOREARM * 0.55), radius: 0.04 },
      { name: `hand_${side}`, parent: `forearm_${side}`, head: wrist, radius: 0.035 },
    );
    // Fingers: palm faces the thigh at rest. Spread along Z (front/back of the hand).
    const palmBase = add(wrist, dir, 0.085);
    const fingers: [string, number, number[]][] = [
      ['index', 0.026, [0.046, 0.027, 0.021]],
      ['middle', 0.008, [0.05, 0.031, 0.023]],
      ['ring', -0.01, [0.047, 0.029, 0.021]],
      ['pinky', -0.027, [0.037, 0.022, 0.018]],
    ];
    for (const [fname, zoff, lens] of fingers) {
      let p = add(palmBase, [0, 0, zoff]);
      if (fname === 'pinky') p = add(p, dir, -0.008);
      if (fname === 'middle') p = add(p, dir, 0.004);
      let parent = `hand_${side}`;
      for (let k = 0; k < 3; k++) {
        const name = `${fname}${k + 1}_${side}`;
        bones.push({ name, parent, head: p, radius: 0.0095 - k * 0.0012 });
        p = add(p, dir, lens[k] as number);
        parent = name;
      }
    }
    // Thumb: from the base of the palm, angled forward (+Z) and along the hand.
    const tdir: [number, number, number] = [dir[0] * 0.55, dir[1] * 0.55, 0.62];
    const tl = Math.hypot(tdir[0], tdir[1], tdir[2]);
    const tn: [number, number, number] = [tdir[0] / tl, tdir[1] / tl, tdir[2] / tl];
    let tp = add(add(wrist, dir, 0.022), [-sx * 0.012, 0, 0.018]);
    let tparent = `hand_${side}`;
    const tlens = [0.04, 0.032, 0.026];
    for (let k = 0; k < 3; k++) {
      const name = `thumb${k + 1}_${side}`;
      bones.push({ name, parent: tparent, head: tp, radius: 0.011 - k * 0.0012 });
      tp = add(tp, tn, tlens[k] as number);
      tparent = name;
    }
  }

  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    bones.push(
      { name: `thigh_${side}`, parent: 'pelvis', head: [sx * 0.096, 0.975, 0.0], radius: 0.085 },
      { name: `calf_${side}`, parent: `thigh_${side}`, head: [sx * 0.104, 0.525, 0.008], radius: 0.06 },
      { name: `foot_${side}`, parent: `calf_${side}`, head: [sx * 0.11, 0.088, -0.022], radius: 0.045 },
      { name: `toe_${side}`, parent: `foot_${side}`, head: [sx * 0.115, 0.024, 0.118], radius: 0.035 },
    );
  }
  return bones;
}

export const BONES: readonly BoneDef[] = buildBones();
export const BONE_COUNT = BONES.length;
export const BONE_INDEX: Readonly<Record<string, number>> = Object.fromEntries(BONES.map((b, i) => [b.name, i]));
export const PARENT_INDEX: readonly number[] = BONES.map((b) => (b.parent ? (BONE_INDEX[b.parent] as number) : -1));

/** Tail (end point) per bone: first child's head, or an extrapolation for leaves. */
export const BONE_TAILS: readonly [number, number, number][] = BONES.map((b, i) => {
  const kids = BONES.filter((c) => c.parent === b.name && !c.name.includes('twist') && !c.name.startsWith('eye') && !c.name.startsWith('lid') && !c.name.startsWith('brow') && !c.name.startsWith('jaw') && !c.name.startsWith('clavicle') && !c.name.startsWith('thigh'));
  const named: Record<string, string> = {
    pelvis: 'spine01',
    spine04: 'neck',
    hand_L: 'middle1_L',
    hand_R: 'middle1_R',
  };
  const target = named[b.name] ?? kids[0]?.name;
  if (target) return BONES[BONE_INDEX[target] as number]!.head;
  // Leaves: extend along the parent direction.
  const p = PARENT_INDEX[i] as number;
  if (p < 0) return [b.head[0], b.head[1] + 0.1, b.head[2]];
  const ph = BONES[p]!.head;
  const d = [b.head[0] - ph[0], b.head[1] - ph[1], b.head[2] - ph[2]];
  const l = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
  const len = b.name === 'head' ? 0.22 : b.name.startsWith('toe') ? 0.06 : b.name === 'jaw' ? 0.09 : 0.02;
  return [b.head[0] + (d[0]! / l) * len, b.head[1] + (d[1]! / l) * len, b.head[2] + (d[2]! / l) * len];
});

export function boneIndex(name: string): number {
  const i = BONE_INDEX[name];
  if (i === undefined) throw new Error(`unknown bone ${name}`);
  return i;
}
