/**
 * Ground interaction FX (spec 7.4): radial shockwave rings, cracked-pavement decals, craters with
 * a raised rim and tumbling debris chunks.
 */
import {
  CircleGeometry,
  Color,
  DodecahedronGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Euler,
  RingGeometry,
  ShaderMaterial,
  Vector3,
  type Group,
  type IUniform,
} from 'three';
import { crackTexture } from './textures.ts';
import { injectAtmo } from '../render/atmosphere.ts';
import { Rng } from '../core/rng.ts';

const RING_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;
const RING_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform float uAlpha;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  // RingGeometry uv: radial position encoded in length from centre
  float r = length(vUv - 0.5) * 2.0;
  float edge = smoothstep(0.86, 0.985, r) * (1.0 - smoothstep(0.985, 1.0, r));
  float fill = smoothstep(0.55, 0.98, r) * 0.35;
  float a = (edge + fill) * uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  #include <fog_fragment>
}
`;

interface Timed {
  mesh: Mesh;
  t: number;
  dur: number;
  update: (k: number, m: Mesh) => void;
}

interface Chunk {
  p: Vector3;
  v: Vector3;
  rot: Quaternion;
  spin: Vector3;
  s: number;
  rest: boolean;
}

export class GroundFx {
  private readonly parent: Group;
  private readonly items: Timed[] = [];
  private readonly ringGeo = new RingGeometry(0.0, 1, 72, 1);
  private readonly chunks: Chunk[] = [];
  private readonly debris: InstancedMesh;
  private readonly rng = new Rng('groundfx');
  private readonly m4 = new Matrix4();
  private debrisHead = 0;

  constructor(parent: Group) {
    this.parent = parent;
    this.ringGeo.rotateX(-Math.PI / 2);
    const dGeo = new DodecahedronGeometry(1, 0);
    this.debris = new InstancedMesh(dGeo, new MeshStandardMaterial({ color: 0x6b6560, roughness: 0.95 }), 240);
    this.debris.castShadow = true;
    this.debris.frustumCulled = false;
    for (let i = 0; i < 240; i++) {
      this.debris.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
      this.chunks.push({ p: new Vector3(), v: new Vector3(), rot: new Quaternion(), spin: new Vector3(), s: 0, rest: true });
    }
    parent.add(this.debris);
  }

  shockRing(pos: Vector3, radius: number, dur: number, color = new Color(0.95, 0.92, 0.85)): void {
    const u: Record<string, IUniform> = { uAlpha: { value: 1 }, uColor: { value: color } };
    injectAtmo(u);
    const mat = new ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      uniforms: u,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
    });
    const mesh = new Mesh(this.ringGeo, mat);
    mesh.position.set(pos.x, pos.y + 0.15, pos.z);
    mesh.renderOrder = 12;
    this.parent.add(mesh);
    this.items.push({
      mesh,
      t: 0,
      dur,
      update: (k, m) => {
        const e = 1 - Math.pow(1 - k, 2.4);
        const r = 0.5 + radius * e;
        m.scale.set(r, 1, r);
        ((m.material as ShaderMaterial).uniforms.uAlpha as IUniform).value = (1 - k) * 0.9;
      },
    });
  }

  crackDecal(pos: Vector3, radius: number, seed: number, life = 30): void {
    const mat = new MeshStandardMaterial({
      map: crackTexture(seed),
      transparent: true,
      depthWrite: false,
      roughness: 1,
      color: 0xffffff,
    });
    const mesh = new Mesh(new PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2), mat);
    mesh.position.set(pos.x, pos.y + 0.05, pos.z);
    mesh.rotation.y = seed * 1.7;
    mesh.receiveShadow = true;
    mesh.renderOrder = 5;
    this.parent.add(mesh);
    this.items.push({
      mesh,
      t: 0,
      dur: life,
      update: (k, m) => {
        (m.material as MeshStandardMaterial).opacity = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
      },
    });
  }

  crater(pos: Vector3, radius: number, seed: number): void {
    // Dark bowl (radial gradient fakes depth) + raised rocky rim + debris.
    const bowlMat = new ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        #include <logdepthbuf_pars_fragment>
        uniform float uAlpha;
        varying vec2 vUv;
        void main() {
          #include <logdepthbuf_fragment>
          float r = length(vUv - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.75, r) * uAlpha;
          vec3 c = mix(vec3(0.16, 0.14, 0.12), vec3(0.36, 0.33, 0.29), smoothstep(0.05, 0.95, r));
          gl_FragColor = vec4(c, a);
          #include <fog_fragment>
        }`,
      uniforms: (() => {
        const u: Record<string, IUniform> = { uAlpha: { value: 1 } };
        injectAtmo(u);
        return u;
      })(),
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const bowl = new Mesh(new CircleGeometry(radius, 48).rotateX(-Math.PI / 2), bowlMat);
    bowl.position.set(pos.x, pos.y + 0.07, pos.z);
    bowl.renderOrder = 6;
    this.parent.add(bowl);
    // Jagged rubble rim: a ring of broken slabs and rocks (instanced), not a smooth torus.
    const rng = new Rng(`crater-${seed}`);
    const nRocks = Math.round(30 + radius * 4);
    const rocks = new InstancedMesh(
      new DodecahedronGeometry(1, 0),
      new MeshStandardMaterial({ color: 0x6f6a63, roughness: 1, flatShading: true }),
      nRocks,
    );
    const m4 = new Matrix4();
    const q = new Quaternion();
    for (let i = 0; i < nRocks; i++) {
      const a = (i / nRocks) * Math.PI * 2 + rng.range(-0.08, 0.08);
      const rr = radius * rng.range(0.82, 1.12);
      const sz = radius * rng.range(0.05, 0.13);
      q.setFromEuler(new Euler(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)));
      m4.compose(
        new Vector3(pos.x + Math.cos(a) * rr, pos.y + sz * 0.25, pos.z + Math.sin(a) * rr),
        q,
        new Vector3(sz * rng.range(1, 1.8), sz * rng.range(0.4, 0.8), sz * rng.range(0.8, 1.4)),
      );
      rocks.setMatrixAt(i, m4);
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    const rim = rocks as unknown as Mesh;
    this.parent.add(rim);
    this.crackDecal(pos, radius * 2.2, seed + 1, 45);
    for (const m of [bowl, rim]) {
      this.items.push({
        mesh: m,
        t: 0,
        dur: 45,
        update: (k, mm) => {
          if (k > 0.85) mm.scale.setScalar(Math.max(0.001, 1 - (k - 0.85) / 0.15));
        },
      });
    }
    this.debrisBurst(pos, Math.round(24 + radius * 2.5), 16 + radius * 2.2, 0.12 + radius * 0.018);
  }

  debrisBurst(pos: Vector3, n: number, speed: number, size: number): void {
    for (let k = 0; k < n; k++) {
      const c = this.chunks[this.debrisHead]!;
      this.debrisHead = (this.debrisHead + 1) % this.chunks.length;
      const a = this.rng.range(0, Math.PI * 2);
      const up = this.rng.range(0.4, 1.0);
      const sp = speed * this.rng.range(0.4, 1.1);
      c.p.set(pos.x + Math.cos(a) * 0.8, pos.y + 0.3, pos.z + Math.sin(a) * 0.8);
      c.v.set(Math.cos(a) * sp * (1 - up * 0.6), sp * up, Math.sin(a) * sp * (1 - up * 0.6));
      c.rot.identity();
      c.spin.set(this.rng.range(-8, 8), this.rng.range(-8, 8), this.rng.range(-8, 8));
      c.s = size * this.rng.range(0.4, 1.4);
      c.rest = false;
    }
  }

  update(dt: number, groundAt: (x: number, z: number) => number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      it.t += dt;
      const k = it.t / it.dur;
      if (k >= 1) {
        this.parent.remove(it.mesh);
        (it.mesh.material as MeshStandardMaterial).dispose();
        this.items.splice(i, 1);
        continue;
      }
      it.update(k, it.mesh);
    }
    let any = false;
    const q = new Quaternion();
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i]!;
      if (c.s <= 0) continue;
      any = true;
      if (!c.rest) {
        c.v.y -= 22 * dt;
        c.p.addScaledVector(c.v, dt);
        q.setFromAxisAngle(c.spin.clone().normalize(), c.spin.length() * dt);
        c.rot.premultiply(q);
        const g = groundAt(c.p.x, c.p.z) + c.s * 0.6;
        if (c.p.y < g) {
          c.p.y = g;
          if (Math.abs(c.v.y) < 3) {
            c.rest = true;
          } else {
            c.v.y *= -0.3;
            c.v.x *= 0.6;
            c.v.z *= 0.6;
            c.spin.multiplyScalar(0.5);
          }
        }
      }
      this.m4.compose(c.p, c.rot, new Vector3(c.s, c.s * 0.8, c.s));
      this.debris.setMatrixAt(i, this.m4);
    }
    if (any) this.debris.instanceMatrix.needsUpdate = true;
  }
}
