/**
 * Sonic boom visuals (spec 7.6): Prandtl–Glauert vapour cone through the transonic band and an
 * expanding shock-ring torus on the boom (the refraction ring is drawn by SpeedFxEffect).
 */
import {
  AdditiveBlending,
  ConeGeometry,
  DoubleSide,
  Mesh,
  NormalBlending,
  Quaternion,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
  type Group,
  type IUniform,
} from 'three';
import { injectAtmo } from '../render/atmosphere.ts';
import { NOISE_GLSL } from '../render/materials.ts';

const CONE_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

const CONE_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
uniform float uAmount;
uniform float uTime;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  #include <logdepthbuf_fragment>
  float axial = vUv.y; // 0 = base (behind), 1 = apex (front)
  float n = fbm2(vec2(vUv.x * 9.0, axial * 3.0 - uTime * 6.0));
  float rim = pow(1.0 - abs(dot(vN, vV)), 1.4);
  float band = smoothstep(0.05, 0.45, axial) * smoothstep(1.0, 0.75, axial);
  float a = uAmount * band * (0.35 + 0.65 * rim) * smoothstep(0.25, 0.75, n) * 0.85;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(1.0, 1.0, 1.02) * 1.6, a);
}
`;

const RING_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uAlpha;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  #include <logdepthbuf_fragment>
  float rim = pow(1.0 - abs(dot(vN, vV)), 2.0);
  float a = uAlpha * (0.25 + rim);
  gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * a * 1.4, a);
}
`;

interface Ring {
  mesh: Mesh;
  t: number;
  dur: number;
  r0: number;
  r1: number;
}

export class SonicBoomFx {
  readonly cone: Mesh;
  private readonly coneMat: ShaderMaterial;
  private readonly rings: Ring[] = [];
  private readonly ringGeo = new TorusGeometry(1, 0.035, 8, 96);
  private readonly parent: Group;

  constructor(parent: Group) {
    this.parent = parent;
    const geo = new ConeGeometry(1, 1, 40, 6, true);
    const u: Record<string, IUniform> = { uAmount: { value: 0 }, uTime: { value: 0 } };
    injectAtmo(u);
    this.coneMat = new ShaderMaterial({
      vertexShader: CONE_VERT,
      fragmentShader: CONE_FRAG,
      uniforms: u,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: NormalBlending,
    });
    this.cone = new Mesh(geo, this.coneMat);
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 15;
    this.cone.visible = false;
    parent.add(this.cone);
  }

  /** Spawn an expanding shock ring at `pos`, perpendicular to `dir`. */
  ring(pos: Vector3, dir: Vector3, r0: number, r1: number, dur: number): void {
    const u: Record<string, IUniform> = { uAlpha: { value: 1 } };
    injectAtmo(u);
    const mat = new ShaderMaterial({
      vertexShader: CONE_VERT,
      fragmentShader: RING_FRAG,
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    const mesh = new Mesh(this.ringGeo, mat);
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), dir.clone().normalize());
    mesh.frustumCulled = false;
    mesh.renderOrder = 16;
    this.parent.add(mesh);
    this.rings.push({ mesh, t: 0, dur, r0, r1 });
  }

  update(dt: number, time: number, heroPos: Vector3, vel: Vector3, transonic: number): void {
    const speed = vel.length();
    this.cone.visible = transonic > 0.01 && speed > 1;
    if (this.cone.visible) {
      const d = vel.clone().divideScalar(speed);
      // Apex just ahead of the hero's fists; the collar opens backward around the body.
      this.cone.position.copy(heroPos).addScaledVector(d, 0.6);
      this.cone.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d));
      const s = 1 + transonic * 0.6;
      this.cone.scale.set(2.4 * s, 4.6 * s, 2.4 * s);
      (this.coneMat.uniforms.uAmount as IUniform).value = transonic;
      (this.coneMat.uniforms.uTime as IUniform).value = time;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        this.parent.remove(r.mesh);
        (r.mesh.material as ShaderMaterial).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      const rad = r.r0 + (r.r1 - r.r0) * e;
      r.mesh.scale.set(rad, rad, rad * 0.6 + 1);
      ((r.mesh.material as ShaderMaterial).uniforms.uAlpha as IUniform).value = (1 - k) * (1 - k) * 0.9;
    }
  }
}
