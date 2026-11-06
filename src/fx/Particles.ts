/**
 * GPU-evaluated ballistic particles: each instance stores its spawn state; position, size and fade
 * are computed in the vertex shader from the age, so the CPU only writes newly spawned particles.
 * One draw call per system. Log-depth and atmosphere fog aware.
 */
import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Texture,
  type IUniform,
} from 'three';
import { injectAtmo } from '../render/atmosphere.ts';

export interface SpawnOpts {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size0: number;
  size1: number;
  color: Color;
  alpha?: number;
  drag?: number;
  gravity?: number;
}

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
uniform float uTime;
uniform float uStretch;
attribute vec4 aP0;
attribute vec4 aV0;
attribute vec4 aSize;
attribute vec4 aColor;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  float age = uTime - aP0.w;
  float life = aV0.w;
  vUv = uv;
  if (age < 0.0 || age > life || life <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec4(0.0);
    return;
  }
  float t = age / life;
  float k = aSize.z;
  float f = k > 0.001 ? (1.0 - exp(-k * age)) / k : age;
  vec3 g = vec3(0.0, -aSize.w, 0.0);
  vec3 p = aP0.xyz + aV0.xyz * f + 0.5 * g * age * age;
  vec3 v = aV0.xyz * exp(-k * age) + g * age;
  float size = mix(aSize.x, aSize.y, sqrt(t));
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vec2 corner = position.xy;
  if (uStretch > 0.0) {
    vec3 vv = (modelViewMatrix * vec4(v, 0.0)).xyz;
    float l = length(vv.xy);
    vec2 dir = l > 1e-4 ? vv.xy / l : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float len = size + l * uStretch;
    mvPosition.xy += dir * corner.y * len + perp * corner.x * size;
  } else {
    float a = aP0.w * 37.0;
    mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
    mvPosition.xy += rot * corner * size;
  }
  gl_Position = projectionMatrix * mvPosition;
  vColor = aColor;
  vColor.a *= smoothstep(0.0, 0.06, t) * (1.0 - t * t);
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex;
uniform float uAdditive;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec4 tex = texture2D(uTex, vUv);
  float a = tex.a * vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb * tex.rgb, a);
  #include <fog_fragment>
  if (uAdditive > 0.5) gl_FragColor.rgb *= gl_FragColor.a;
}
`;

export class ParticleSystem {
  readonly mesh: Mesh;
  private readonly p0: InstancedBufferAttribute;
  private readonly v0: InstancedBufferAttribute;
  private readonly size: InstancedBufferAttribute;
  private readonly color: InstancedBufferAttribute;
  private readonly capacity: number;
  private head = 0;
  private dirtyMin = Infinity;
  private dirtyMax = -1;
  private readonly mat: ShaderMaterial;
  time = 0;

  constructor(capacity: number, texture: Texture, opts: { additive?: boolean; stretch?: number; name?: string } = {}) {
    this.capacity = capacity;
    const quad = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position!);
    geo.setAttribute('uv', quad.attributes.uv!);
    const mk = (n: number) => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.p0 = mk(4);
    this.v0 = mk(4);
    this.size = mk(4);
    this.color = mk(4);
    geo.setAttribute('aP0', this.p0);
    geo.setAttribute('aV0', this.v0);
    geo.setAttribute('aSize', this.size);
    geo.setAttribute('aColor', this.color);
    geo.instanceCount = capacity;
    const uniforms: Record<string, IUniform> = {
      uTime: { value: 0 },
      uStretch: { value: opts.stretch ?? 0 },
      uTex: { value: texture },
      uAdditive: { value: opts.additive ? 1 : 0 },
    };
    injectAtmo(uniforms);
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? AdditiveBlending : NormalBlending,
      fog: true,
    });
    this.mesh = new Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.additive ? 20 : 10;
    this.mesh.name = opts.name ?? 'particles';
  }

  spawn(o: SpawnOpts): void {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    const p = this.p0.array as Float32Array;
    const v = this.v0.array as Float32Array;
    const s = this.size.array as Float32Array;
    const c = this.color.array as Float32Array;
    p[i * 4] = o.x;
    p[i * 4 + 1] = o.y;
    p[i * 4 + 2] = o.z;
    p[i * 4 + 3] = this.time;
    v[i * 4] = o.vx ?? 0;
    v[i * 4 + 1] = o.vy ?? 0;
    v[i * 4 + 2] = o.vz ?? 0;
    v[i * 4 + 3] = o.life;
    s[i * 4] = o.size0;
    s[i * 4 + 1] = o.size1;
    s[i * 4 + 2] = o.drag ?? 0;
    s[i * 4 + 3] = o.gravity ?? 0;
    c[i * 4] = o.color.r;
    c[i * 4 + 1] = o.color.g;
    c[i * 4 + 2] = o.color.b;
    c[i * 4 + 3] = o.alpha ?? 1;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  /** Burst helper: n particles from a point with a velocity generator. */
  burst(n: number, gen: (k: number, out: SpawnOpts) => void, base: SpawnOpts): void {
    const o: SpawnOpts = { ...base };
    for (let k = 0; k < n; k++) {
      Object.assign(o, base);
      gen(k, o);
      this.spawn(o);
    }
  }

  update(time: number): void {
    this.time = time;
    (this.mat.uniforms.uTime as IUniform).value = time;
    if (this.dirtyMax >= 0) {
      for (const a of [this.p0, this.v0, this.size, this.color]) {
        a.clearUpdateRanges();
        a.addUpdateRange(this.dirtyMin * 4, (this.dirtyMax - this.dirtyMin + 1) * 4);
        a.needsUpdate = true;
      }
      this.dirtyMin = Infinity;
      this.dirtyMax = -1;
    }
  }
}

export const tmpV = new Vector3();
