/**
 * Gate-1 greybox hero: suit-coloured primitives rigidly attached to the real rig's bones.
 * Readable silhouette (blue suit, red trunks/boots/cape, gold belt, emblem colour block).
 * Replaced by the baked SDF mesh in gate 2 (same rig, same poses).
 */
import {
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Bone,
  Quaternion,
} from 'three';
import { BONES, boneIndex } from './skeleton.ts';

export const SUIT = {
  blue: new Color('#0a3f94'),
  red: new Color('#9a1b1f'),
  gold: new Color('#f2c03a'),
  skin: new Color('#d29b7c'),
  hair: new Color('#15110f'),
  capeRed: new Color('#8c1a22'),
};

export function suitMaterials() {
  return {
    blue: new MeshStandardMaterial({ color: SUIT.blue, roughness: 0.55, metalness: 0.05 }),
    red: new MeshStandardMaterial({ color: SUIT.red, roughness: 0.5, metalness: 0.05 }),
    gold: new MeshStandardMaterial({ color: SUIT.gold, roughness: 0.32, metalness: 0.75 }),
    skin: new MeshStandardMaterial({ color: SUIT.skin, roughness: 0.6, metalness: 0 }),
    hair: new MeshStandardMaterial({ color: SUIT.hair, roughness: 0.45, metalness: 0 }),
  };
}

function head(name: string): Vector3 {
  const h = BONES[boneIndex(name)]!.head;
  return new Vector3(h[0], h[1], h[2]);
}

/** Capsule between two model-space points, expressed in the local frame of `bone`. */
function capsule(a: Vector3, b: Vector3, r: number, boneHead: Vector3): BufferGeometry {
  const len = a.distanceTo(b);
  const g = new CapsuleGeometry(r, Math.max(0.001, len), 6, 12);
  const dir = new Vector3().subVectors(b, a).normalize();
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
  const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5).sub(boneHead);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

function ellipsoid(c: Vector3, rx: number, ry: number, rz: number, boneHead: Vector3): BufferGeometry {
  const g = new SphereGeometry(1, 20, 14);
  g.scale(rx, ry, rz);
  g.translate(c.x - boneHead.x, c.y - boneHead.y, c.z - boneHead.z);
  return g;
}

export function buildGreybox(bones: Bone[]): Mesh[] {
  const m = suitMaterials();
  const meshes: Mesh[] = [];
  const attach = (boneName: string, geo: BufferGeometry, mat: MeshStandardMaterial) => {
    const mesh = new Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bones[boneIndex(boneName)]!.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const H = (n: string) => head(n);

  // Head, hair and forehead curl.
  const hh = H('head');
  attach('head', ellipsoid(new Vector3(0, 1.79, 0.012), 0.094, 0.118, 0.106, hh), m.skin);
  attach('head', ellipsoid(new Vector3(0, 1.832, -0.012), 0.099, 0.09, 0.105, hh), m.hair);
  const curl = new TorusGeometry(0.014, 0.005, 6, 10, Math.PI * 1.5);
  curl.rotateY(Math.PI / 2);
  curl.translate(0.012 - hh.x, 1.858 - hh.y, 0.098 - hh.z);
  attach('head', curl, m.hair);
  attach('jaw', ellipsoid(new Vector3(0, 1.705, 0.05), 0.06, 0.04, 0.06, H('jaw')), m.skin);
  // Neck with the suit's collar band.
  attach('neck', capsule(new Vector3(0, 1.57, -0.01), new Vector3(0, 1.7, 0.0), 0.058, H('neck')), m.skin);
  const collar = new TorusGeometry(0.068, 0.009, 6, 24);
  collar.rotateX(Math.PI / 2 + 0.25);
  collar.translate(0 - H('spine04').x, 1.575 - H('spine04').y, 0.0 - H('spine04').z);
  attach('spine04', collar, m.blue);

  // Torso.
  const s4 = H('spine04');
  attach('spine04', ellipsoid(new Vector3(0, 1.42, 0.005), 0.205, 0.165, 0.13, s4), m.blue);
  attach('spine04', ellipsoid(new Vector3(0.08, 1.4, 0.06), 0.095, 0.075, 0.07, s4), m.blue);
  attach('spine04', ellipsoid(new Vector3(-0.08, 1.4, 0.06), 0.095, 0.075, 0.07, s4), m.blue);
  attach('spine04', ellipsoid(new Vector3(0, 1.48, -0.04), 0.19, 0.11, 0.11, s4), m.blue);
  // Collar stand of the cape, over the shoulders.
  const stand = new TorusGeometry(0.11, 0.022, 6, 20, Math.PI * 1.1);
  stand.rotateX(Math.PI / 2);
  stand.rotateY(Math.PI * 0.95);
  stand.scale(1.65, 1, 0.9);
  stand.translate(0 - s4.x, 1.56 - s4.y, -0.05 - s4.z);
  attach('spine04', stand, new MeshStandardMaterial({ color: SUIT.capeRed, roughness: 0.7 }));
  const s3 = H('spine03');
  attach('spine03', ellipsoid(new Vector3(0, 1.29, 0.0), 0.175, 0.13, 0.118, s3), m.blue);
  const s2 = H('spine02');
  attach('spine02', ellipsoid(new Vector3(0, 1.17, 0.0), 0.152, 0.11, 0.108, s2), m.blue);
  const s1 = H('spine01');
  attach('spine01', ellipsoid(new Vector3(0, 1.075, -0.004), 0.155, 0.075, 0.11, s1), m.blue);
  // Belt (gold) and trunks (red).
  const belt = new CylinderGeometry(1, 1, 0.052, 28, 1, true);
  belt.scale(0.161, 1, 0.117);
  belt.translate(0 - s1.x, 1.048 - s1.y, -0.004 - s1.z);
  attach('spine01', belt, m.gold);
  const pv = H('pelvis');
  attach('pelvis', ellipsoid(new Vector3(0, 0.975, -0.008), 0.165, 0.095, 0.118, pv), m.red);

  // Emblem block on the chest (placeholder colours; traced emblem arrives in gate 2).
  const sh = new Shape();
  sh.moveTo(-0.072, 0.052);
  sh.lineTo(0.072, 0.052);
  sh.lineTo(0.11, 0.018);
  sh.lineTo(0.0, -0.085);
  sh.lineTo(-0.11, 0.018);
  sh.closePath();
  const emb = new ShapeGeometry(sh);
  emb.rotateX(-0.12);
  emb.translate(0 - s4.x, 1.405 - s4.y, 0.137 - s4.z);
  attach('spine04', emb, m.red);
  const s1g = new Shape();
  s1g.moveTo(-0.03, 0.04);
  s1g.lineTo(0.064, 0.04);
  s1g.lineTo(0.088, 0.016);
  s1g.lineTo(-0.02, 0.012);
  s1g.closePath();
  const g1 = new ShapeGeometry(s1g);
  g1.rotateX(-0.12);
  g1.translate(0 - s4.x, 1.405 - s4.y, 0.1395 - s4.z);
  attach('spine04', g1, m.gold);
  const s2g = new Shape();
  s2g.moveTo(-0.088, 0.012);
  s2g.lineTo(0.02, -0.012);
  s2g.lineTo(-0.01, -0.05);
  s2g.closePath();
  const g2 = new ShapeGeometry(s2g);
  g2.rotateX(-0.12);
  g2.translate(0 - s4.x, 1.405 - s4.y, 0.1395 - s4.z);
  attach('spine04', g2, m.gold);

  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const sh0 = H(`upperarm_${side}`);
    const el = H(`forearm_${side}`);
    const wr = H(`hand_${side}`);
    // Deltoid + upper arm + forearm.
    attach(`clavicle_${side}`, ellipsoid(new Vector3(sx * 0.19, 1.515, -0.015), 0.085, 0.075, 0.08, H(`clavicle_${side}`)), m.blue);
    attach(`upperarm_${side}`, capsule(sh0, el, 0.056, sh0), m.blue);
    attach(`upperarm_${side}`, ellipsoid(sh0.clone().lerp(el, 0.45).add(new Vector3(0, 0, 0.012)), 0.05, 0.065, 0.055, sh0), m.blue);
    attach(`forearm_${side}`, capsule(el, wr, 0.044, el), m.blue);
    // Hand: palm + fingers.
    const handDir = new Vector3().subVectors(wr, el).normalize();
    const palmC = wr.clone().addScaledVector(handDir, 0.045);
    attach(`hand_${side}`, ellipsoid(palmC, 0.042, 0.042, 0.042, wr).scale(0.75, 1.0, 1.15), m.skin);
    for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
      for (let k = 1; k <= 3; k++) {
        const bn = `${f}${k}_${side}`;
        const a = H(bn);
        const next = k < 3 ? H(`${f}${k + 1}_${side}`) : a.clone().addScaledVector(handDir, f === 'thumb' ? 0.022 : 0.018);
        const r = f === 'thumb' ? 0.0105 - k * 0.001 : 0.0088 - k * 0.0008;
        attach(bn, capsule(a, next, r, a), m.skin);
      }
    }
    // Leg: thigh (blue), calf (blue then red boot), boot cuff, foot.
    const hip = H(`thigh_${side}`);
    const knee = H(`calf_${side}`);
    const ankle = H(`foot_${side}`);
    const toe = H(`toe_${side}`);
    attach(`thigh_${side}`, capsule(hip.clone().add(new Vector3(sx * 0.01, 0, 0)), knee, 0.085, hip), m.blue);
    attach(`thigh_${side}`, ellipsoid(hip.clone().lerp(knee, 0.35).add(new Vector3(0, 0, 0.02)), 0.075, 0.13, 0.072, hip), m.blue);
    const midCalf = knee.clone().lerp(ankle, 0.42);
    attach(`calf_${side}`, capsule(knee, midCalf, 0.062, knee), m.blue);
    attach(`calf_${side}`, capsule(midCalf, ankle, 0.056, knee), m.red);
    const cuff = new CylinderGeometry(0.07, 0.064, 0.05, 16, 1, false);
    cuff.translate(midCalf.x - knee.x, midCalf.y - knee.y + 0.01, midCalf.z - knee.z);
    attach(`calf_${side}`, cuff, m.red);
    attach(`foot_${side}`, capsule(ankle.clone().add(new Vector3(0, -0.02, -0.03)), toe.clone().add(new Vector3(0, 0, 0.02)), 0.045, ankle), m.red);
  }
  return meshes;
}
