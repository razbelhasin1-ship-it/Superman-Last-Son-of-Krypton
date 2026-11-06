/**
 * Cumulus deck at 1,500–2,500 m (spec 12.1): clusters of lit billboard puffs. Each puff is shaded
 * as a soft sphere (fake normal from the quad), darker toward the cloud base, with a forward-scatter
 * silver lining. Clusters are sorted back-to-front each time the view changes; puffs fade out as the
 * camera enters them, and `densityAt()` drives the screen-space mist instead.
 */
import {
  CanvasTexture,
  DynamicDrawUsage,
  Frustum,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  Sphere,
  Vector4,
  ShaderMaterial,
  Vector3,
  type IUniform,
  type PerspectiveCamera,
} from 'three';
import { Rng, fbm2 } from '../../core/rng.ts';
import { injectAtmo } from '../atmosphere.ts';

export interface Puff {
  x: number;
  y: number;
  z: number;
  r: number;
  shade: number;
}

export interface Cloud {
  cx: number;
  cy: number;
  cz: number;
  base: number;
  top: number;
  radius: number;
  puffs: Puff[];
  density: number;
}

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec4 aPuff;   // xyz centre, radius
attribute vec4 aCloud;  // base, top, shade, density
uniform vec3 uCamPos;
uniform vec4 uHole;     // x, z, radius, strength — a punched hole (power launch)
varying vec2 vUv;
varying float vH;
varying float vShade;
varying float vAlpha;
varying vec3 vCenterDir;
void main() {
  vUv = uv;
  vec3 c = aPuff.xyz;
  float r = aPuff.w;
  vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
  float dist = length(c - uCamPos);
  // Fade as the camera enters the puff (mist takes over) and at the far edge of the deck.
  float inside = smoothstep(r * 0.55, r * 1.15, dist);
  vAlpha = aCloud.w * inside * (1.0 - smoothstep(30000.0, 42000.0, dist));
  if (uHole.w > 0.0) {
    float hd = length(c.xz - uHole.xy);
    vAlpha *= 1.0 - uHole.w * (1.0 - smoothstep(uHole.z * 0.6, uHole.z * 1.15, hd));
  }
  mvPosition.xy += position.xy * r * 2.3;
  // Pull the quad a bit toward the camera so it sits in front of the sphere's centre plane.
  mvPosition.xyz += normalize(-mvPosition.xyz) * r * 0.35 * inside;
  gl_Position = projectionMatrix * mvPosition;
  vH = clamp((c.y - aCloud.x) / max(aCloud.y - aCloud.x, 1.0), 0.0, 1.0);
  vShade = aCloud.z;
  vCenterDir = normalize(c - uCamPos);
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex;
uniform mat4 uViewInv;
uniform vec3 uSunDir2;
uniform vec3 uSunCol;
uniform vec3 uSkyTop;
uniform vec3 uSkyLow;
uniform float uNightK;
varying vec2 vUv;
varying float vH;
varying float vShade;
varying float vAlpha;
varying vec3 vCenterDir;
void main() {
  #include <logdepthbuf_fragment>
  vec4 tex = texture2D(uTex, vUv);
  float a = tex.a * vAlpha;
  if (a < 0.004) discard;
  vec2 q = vUv * 2.0 - 1.0;
  float z = sqrt(max(0.0, 1.0 - dot(q, q)));
  vec3 nV = normalize(vec3(q * 1.1, z));
  vec3 n = normalize(mat3(uViewInv) * nV);
  float h = clamp(vH + q.y * 0.18, 0.0, 1.0);
  float sunDot = dot(n, uSunDir2);
  float selfShadow = mix(0.38, 1.0, smoothstep(0.0, 0.85, h));
  float direct = smoothstep(-0.35, 0.9, sunDot) * selfShadow;
  // Ambient: sky above, darker bounce below; flat cloud bases go blue-grey.
  vec3 amb = mix(uSkyLow, uSkyTop, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
  amb *= mix(0.62, 1.0, h);
  vec3 col = uSunCol * direct * 1.05 + amb * 1.15;
  // Internal variation + soft edges.
  col *= 0.86 + 0.28 * tex.r + vShade * 0.06;
  // Silver lining: forward scattering at thin edges when looking toward the sun.
  float toSun = max(dot(vCenterDir, uSunDir2), 0.0);
  col += uSunCol * pow(toSun, 6.0) * (1.0 - tex.a) * 1.4 * (1.0 - uNightK);
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}
`;

function makeCloudTexture(): CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S - 0.5;
      const v = y / S - 0.5;
      const r = Math.hypot(u, v) * 2;
      const n = fbm2(x / 22, y / 22, 11, 4) * 0.5 + 0.5;
      const n2 = fbm2(x / 9 + 40, y / 9, 13, 3) * 0.5 + 0.5;
      const edge = 1 - smooth(0.45 + n * 0.35, 1.0, r);
      const a = Math.max(0, Math.min(1, edge * (0.75 + n2 * 0.4)));
      const i = (y * S + x) * 4;
      img.data[i] = Math.round(n2 * 255);
      img.data[i + 1] = Math.round(n * 255);
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  return t;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export class CloudDeck {
  readonly mesh: Mesh;
  readonly clouds: Cloud[] = [];
  private readonly mat: ShaderMaterial;
  private readonly aPuff: InstancedBufferAttribute;
  private readonly aCloud: InstancedBufferAttribute;
  private readonly geo: InstancedBufferGeometry;
  private capacity: number;
  private lastCam = new Vector3(1e9, 0, 0);
  private lastDir = new Vector3();
  private readonly frustum = new Frustum();
  private readonly sphere = new Sphere();
  private readonly m4 = new Matrix4();
  private grid = new Map<number, number[]>();
  private readonly cell = 2000;
  visibleCount = 0;
  private hole = { x: 0, z: 0, r: 0, t: -1, dur: 1 };

  /** Punch an expanding hole through the deck (power launch). */
  punch(x: number, z: number, radius: number, dur = 6): void {
    this.hole = { x, z, r: radius, t: 0, dur };
  }

  tickHole(dt: number): void {
    const h = this.hole;
    const u = (this.mat.uniforms.uHole!.value as Vector4);
    if (h.t < 0) {
      u.w = 0;
      return;
    }
    h.t += dt;
    const k = h.t / h.dur;
    if (k >= 1) {
      h.t = -1;
      u.w = 0;
      return;
    }
    const open = Math.min(1, h.t / 0.35);
    u.set(h.x, h.z, h.r * (0.35 + 0.65 * open), k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
  }

  constructor(seed: number, opts: { extent?: number; detail?: number } = {}) {
    const rng = new Rng(seed).fork('clouds');
    const extent = opts.extent ?? 24000;
    const detail = opts.detail ?? 1;
    const cellSize = 950 / Math.sqrt(Math.max(0.3, detail));
    for (let gx = -extent; gx < extent; gx += cellSize) {
      for (let gz = -extent; gz < extent; gz += cellSize) {
        const n = fbm2(gx / 7000, gz / 7000, seed + 5, 3);
        if (n < -0.05) continue;
        if (!rng.chance(0.55 + n * 0.5)) continue;
        const x = gx + rng.range(0.15, 0.85) * cellSize;
        const z = gz + rng.range(0.15, 0.85) * cellSize;
        const size = rng.range(260, 760) * (0.8 + n * 0.6);
        const base = 1500 + rng.range(0, 260) + n * 120;
        const height = Math.min(2500 - base, size * rng.range(0.55, 1.05));
        this.addCloud(rng, x, base, z, size, height, 1);
      }
    }
    this.capacity = this.clouds.reduce((s, c) => s + c.puffs.length, 0) + 600;
    const quad = new PlaneGeometry(1, 1);
    this.geo = new InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position!);
    this.geo.setAttribute('uv', quad.attributes.uv!);
    this.aPuff = new InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
    this.aCloud = new InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
    this.aPuff.setUsage(DynamicDrawUsage);
    this.aCloud.setUsage(DynamicDrawUsage);
    this.geo.setAttribute('aPuff', this.aPuff);
    this.geo.setAttribute('aCloud', this.aCloud);
    this.geo.instanceCount = 0;
    const uniforms: Record<string, IUniform> = {
      uTex: { value: makeCloudTexture() },
      uViewInv: { value: new Matrix4() },
      uSunDir2: { value: new Vector3(0, 1, 0) },
      uSunCol: { value: new Vector3(1, 1, 1) },
      uSkyTop: { value: new Vector3(0.3, 0.4, 0.6) },
      uSkyLow: { value: new Vector3(0.25, 0.27, 0.3) },
      uCamPos: { value: new Vector3() },
      uHole: { value: new Vector4(0, 0, 0, 0) },
      uNightK: { value: 0 },
    };
    injectAtmo(uniforms);
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      fog: true,
    });
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.name = 'clouds';
    this.rebuildGrid();
  }

  /** Add a cumulus cluster (also used for hand-placed cinematic banks). */
  addCloud(rng: Rng, x: number, base: number, z: number, size: number, height: number, density: number): Cloud {
    const puffs: Puff[] = [];
    const nBase = Math.round(5 + size / 120);
    for (let i = 0; i < nBase; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * size * 0.5;
      const r = rng.range(0.22, 0.36) * size;
      puffs.push({ x: x + Math.cos(a) * d, y: base + r * 0.42, z: z + Math.sin(a) * d * 0.8, r, shade: rng.next() });
    }
    const nMid = Math.round(3 + size / 200);
    for (let i = 0; i < nMid; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * size * 0.32;
      const r = rng.range(0.24, 0.34) * size;
      puffs.push({ x: x + Math.cos(a) * d, y: base + height * rng.range(0.38, 0.62), z: z + Math.sin(a) * d * 0.8, r, shade: rng.next() });
    }
    const nTop = rng.int(1, 3);
    for (let i = 0; i < nTop; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.next() * size * 0.15;
      const r = rng.range(0.2, 0.3) * size;
      puffs.push({ x: x + Math.cos(a) * d, y: base + height - r * 0.55, z: z + Math.sin(a) * d, r, shade: rng.next() });
    }
    const cloud: Cloud = { cx: x, cy: base + height * 0.5, cz: z, base, top: base + height, radius: size * 0.75 + height * 0.5, puffs, density };
    this.clouds.push(cloud);
    return cloud;
  }

  /** Remove all clouds whose centre is inside a radius (e.g. clear the sky for cinematics). */
  clearAround(x: number, z: number, radius: number): void {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i]!;
      if (Math.hypot(c.cx - x, c.cz - z) < radius) this.clouds.splice(i, 1);
    }
    this.afterEdit();
  }

  afterEdit(): void {
    const need = this.clouds.reduce((s, c) => s + c.puffs.length, 0);
    if (need > this.capacity) {
      // Grow buffers.
      this.capacity = need + 600;
      const p = new InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
      const c = new InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
      p.setUsage(DynamicDrawUsage);
      c.setUsage(DynamicDrawUsage);
      this.geo.setAttribute('aPuff', p);
      this.geo.setAttribute('aCloud', c);
      (this as unknown as { aPuff: InstancedBufferAttribute }).aPuff = p;
      (this as unknown as { aCloud: InstancedBufferAttribute }).aCloud = c;
    }
    this.rebuildGrid();
    this.lastCam.set(1e9, 0, 0);
  }

  private rebuildGrid(): void {
    this.grid.clear();
    this.clouds.forEach((c, i) => {
      const r = c.radius;
      for (let gx = Math.floor((c.cx - r) / this.cell); gx <= Math.floor((c.cx + r) / this.cell); gx++) {
        for (let gz = Math.floor((c.cz - r) / this.cell); gz <= Math.floor((c.cz + r) / this.cell); gz++) {
          const k = gx * 73856093 + gz * 19349663;
          let l = this.grid.get(k);
          if (!l) {
            l = [];
            this.grid.set(k, l);
          }
          l.push(i);
        }
      }
    });
  }

  /** Cloud density (0..1) at a point — drives the in-cloud mist and the burst-out event. */
  densityAt(p: Vector3): number {
    if (p.y < 1200 || p.y > 2900) {
      // Fast reject outside the deck band (cinematic banks may be elsewhere: check grid anyway).
    }
    const k = Math.floor(p.x / this.cell) * 73856093 + Math.floor(p.z / this.cell) * 19349663;
    const list = this.grid.get(k);
    if (!list) return 0;
    let d = 0;
    for (const ci of list) {
      const c = this.clouds[ci]!;
      if (p.y < c.base - 200 || p.y > c.top + 200) continue;
      for (const pf of c.puffs) {
        const dd = Math.hypot(p.x - pf.x, (p.y - pf.y) * 1.2, p.z - pf.z) / pf.r;
        if (dd < 1) d = Math.max(d, (1 - dd) * (1 - dd) * 1.6 * c.density);
      }
    }
    return Math.min(1, d);
  }

  update(camera: PerspectiveCamera, sunDir: Vector3, sunCol: Vector3, skyTop: Vector3, skyLow: Vector3, night: number): void {
    const u = this.mat.uniforms;
    (u.uViewInv!.value as Matrix4).copy(camera.matrixWorld);
    (u.uSunDir2!.value as Vector3).copy(sunDir);
    (u.uSunCol!.value as Vector3).copy(sunCol);
    (u.uSkyTop!.value as Vector3).copy(skyTop);
    (u.uSkyLow!.value as Vector3).copy(skyLow);
    (u.uCamPos!.value as Vector3).copy(camera.position);
    u.uNightK!.value = night;
    const dir = new Vector3();
    camera.getWorldDirection(dir);
    const moved = this.lastCam.distanceTo(camera.position) > 15 || this.lastDir.angleTo(dir) > 0.03;
    if (!moved) return;
    this.lastCam.copy(camera.position);
    this.lastDir.copy(dir);
    this.m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m4);
    const cam = camera.position;
    const vis: { c: Cloud; d: number }[] = [];
    for (const c of this.clouds) {
      this.sphere.center.set(c.cx, c.cy, c.cz);
      this.sphere.radius = c.radius * 1.4;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      const d = Math.hypot(c.cx - cam.x, c.cy - cam.y, c.cz - cam.z);
      if (d > 44000) continue;
      vis.push({ c, d });
    }
    vis.sort((a, b) => b.d - a.d);
    const P = this.aPuff.array as Float32Array;
    const Cc = this.aCloud.array as Float32Array;
    let n = 0;
    const order: { p: Puff; d: number }[] = [];
    for (const { c, d } of vis) {
      order.length = 0;
      // Far clouds: drop small puffs.
      const minR = d > 18000 ? c.radius * 0.28 : 0;
      for (const p of c.puffs) {
        if (p.r < minR) continue;
        order.push({ p, d: (p.x - cam.x) * dir.x + (p.y - cam.y) * dir.y + (p.z - cam.z) * dir.z });
      }
      order.sort((a, b) => b.d - a.d);
      for (const { p } of order) {
        if (n >= this.capacity) break;
        P[n * 4] = p.x;
        P[n * 4 + 1] = p.y;
        P[n * 4 + 2] = p.z;
        P[n * 4 + 3] = p.r;
        Cc[n * 4] = c.base;
        Cc[n * 4 + 1] = c.top;
        Cc[n * 4 + 2] = p.shade;
        Cc[n * 4 + 3] = c.density;
        n++;
      }
    }
    this.visibleCount = n;
    this.geo.instanceCount = n;
    this.aPuff.clearUpdateRanges();
    this.aCloud.clearUpdateRanges();
    this.aPuff.addUpdateRange(0, n * 4);
    this.aCloud.addUpdateRange(0, n * 4);
    this.aPuff.needsUpdate = true;
    this.aCloud.needsUpdate = true;
  }
}
