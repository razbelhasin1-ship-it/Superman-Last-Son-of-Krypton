/**
 * Physically based single-scattering atmosphere (Rayleigh + Mie, Nishita-style ray march).
 * The sky radiance for every view direction is baked into a small equirect LUT whenever the sun or
 * the viewer altitude changes noticeably. The sky dome AND the aerial-perspective fog of every
 * material sample that same LUT, so distant geometry fades into exactly the sky colour behind it.
 *
 * Fog is injected into all built-in and custom materials by patching three's fog shader chunks and
 * sharing uniform objects through a global onBeforeCompile hook.
 */
import {
  Color,
  HalfFloatType,
  LinearFilter,
  Material,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  ClampToEdgeWrapping,
  Scene,
  ShaderChunk,
  ShaderMaterial,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
  type IUniform,
} from 'three';
import { T } from '../tuning.ts';

const R_PLANET = 6371e3;
const R_ATMOS = 6471e3;
const BETA_R: [number, number, number] = [5.5e-6, 13.0e-6, 22.4e-6];
const BETA_M = 21e-6;
const H_R = 8e3;
const H_M = 1.2e3;
const G_M = 0.758;
/** Overall sky radiance scale relative to the sun light (tuned against AgX exposure). */
export const SKY_SCALE = 1.2;

/** Shared uniforms injected into every material's shader. */
export const atmoUniforms: Record<string, IUniform> = {
  uAtmoLut: { value: null },
  uAtmoSunDir: { value: new Vector3(0.3, 0.7, 0.3).normalize() },
  uAtmoSunColor: { value: new Color(1, 1, 1) },
  uAtmoFogDensity: { value: T.sky.fogDensity },
  uAtmoFogFalloff: { value: T.sky.fogFalloff },
  uAtmoViewInv: { value: new Matrix4() },
  uAtmoSkyScale: { value: SKY_SCALE },
  uAtmoTime: { value: 0 },
  uAtmoCloudShadow: { value: 0 },
  // Cumulus shadows on everything lit by the sun (coverage map projected along the sun direction).
  uCloudCov: { value: null },
  /** drift x, drift z, deck half-extent, strength (0 = off). */
  uCloudParams: { value: new Vector4(0, 0, 24000, 0) },
  uCloudSun: { value: new Vector3(0, 1, 0) },
  uAtmoNight: { value: 0 },
  // three.js refreshes these for every material with `fog: true`; our chunks ignore them, but custom
  // ShaderMaterials must still own them.
  fogColor: { value: new Color(1, 1, 1) },
  fogNear: { value: 1 },
  fogFar: { value: 2 },
  fogDensity: { value: 0 },
};

export const ATMO_GLSL = /* glsl */ `
uniform sampler2D uAtmoLut;
uniform vec3 uAtmoSunDir;
uniform vec3 uAtmoSunColor;
uniform float uAtmoFogDensity;
uniform float uAtmoFogFalloff;
uniform float uAtmoSkyScale;
uniform float uAtmoNight;
vec2 atmoLutUv(vec3 d) {
  float u = atan(d.x, -d.z) * 0.15915494 + 0.5;
  float e = asin(clamp(d.y, -1.0, 1.0)) * 0.63661977; // [-1, 1]
  float v = 0.5 + 0.5 * sign(e) * sqrt(abs(e));
  return vec2(u, v);
}
vec3 atmoSky(vec3 d) {
  return texture2D(uAtmoLut, atmoLutUv(d)).rgb * uAtmoSkyScale;
}
vec3 atmoApply(vec3 col, vec3 ray, float camY) {
  float dist = length(ray);
  if (dist < 1e-3) return col;
  vec3 dir = ray / dist;
  float k = uAtmoFogFalloff;
  float dh = ray.y;
  float kdh = k * dh;
  float hfac = abs(kdh) > 1e-4 ? (1.0 - exp(-kdh)) / kdh : 1.0;
  float tau = uAtmoFogDensity * exp(-k * max(camY, -50.0)) * dist * hfac;
  float ext = 1.0 - exp(-tau);
  vec3 fogCol = atmoSky(normalize(vec3(dir.x, dir.y * 0.85, dir.z)));
  float sd = max(dot(dir, uAtmoSunDir), 0.0);
  fogCol += uAtmoSunColor * pow(sd, 10.0) * 0.06 * (1.0 - uAtmoNight);
  return mix(col, fogCol, ext);
}
`;

const CLOUD_SHADOW_GLSL = /* glsl */ `
uniform sampler2D uCloudCov;
uniform vec4 uCloudParams;
uniform vec3 uCloudSun;
uniform mat4 uAtmoViewInv;
float atmoCloudShadow(vec3 viewPos) {
  if (uCloudParams.w <= 0.0) return 1.0;
  vec3 wp = (uAtmoViewInv * vec4(viewPos, 1.0)).xyz;
  float dh = 1900.0 - wp.y;
  if (dh <= 0.0) return 1.0;
  vec2 pc = wp.xz + uCloudSun.xz / max(uCloudSun.y, 0.08) * dh - uCloudParams.xy;
  float cov = texture2D(uCloudCov, pc / (2.0 * uCloudParams.z) + 0.5).r;
  return 1.0 - uCloudParams.w * smoothstep(0.1, 0.65, cov);
}
`;

let patched = false;

/** Patch three's fog chunks once so every material with `fog: true` gets aerial perspective. */
export function installAtmosphereChunks(): void {
  if (patched) return;
  patched = true;
  ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vAtmoRay;
  uniform mat4 uAtmoViewInv;
#endif
`;
  ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vAtmoRay = mat3(uAtmoViewInv) * mvPosition.xyz;
#endif
`;
  ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vAtmoRay;
  ${ATMO_GLSL}
#endif
`;
  ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = atmoApply(gl_FragColor.rgb, vAtmoRay, cameraPosition.y);
#endif
`;
  // Cloud shadows: dim the sun (directional light 0..n) under the cumulus deck.
  ShaderChunk.lights_pars_begin = ShaderChunk.lights_pars_begin + CLOUD_SHADOW_GLSL;
  ShaderChunk.lights_fragment_begin = ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= atmoCloudShadow( geometryPosition );',
  );
  // Share the atmosphere uniforms (by reference) with every compiled program.
  const proto = Material.prototype as Material & { onBeforeCompile: (s: { uniforms: Record<string, IUniform> }) => void };
  proto.onBeforeCompile = function (shader: { uniforms: Record<string, IUniform> }) {
    injectAtmo(shader.uniforms);
  };
}

export function injectAtmo(uniforms: Record<string, IUniform>): void {
  for (const k in atmoUniforms) uniforms[k] = atmoUniforms[k] as IUniform;
}

const LUT_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform float uViewerAlt;
uniform float uSunI;
varying vec2 vUv;
const float PI = 3.14159265;
const float RP = ${R_PLANET.toFixed(1)};
const float RA = ${R_ATMOS.toFixed(1)};
const vec3 BR = vec3(${BETA_R.map((b) => b.toExponential(3)).join(',')});
const float BM = ${BETA_M.toExponential(3)};
const float HR = ${H_R.toFixed(1)};
const float HM = ${H_M.toFixed(1)};
const float GM = ${G_M};
// Numerically stable ray/sphere intersection (sphere at the planet centre). Works in float32 at
// planetary scale: c is formed from the altitude difference and the near root is rationalised.
vec2 rs(vec3 ro, vec3 rd, float r) {
  float r0 = length(ro);
  float b = dot(ro, rd);
  float c = (r0 - r) * (r0 + r);
  float d = b * b - c;
  if (d < 0.0) return vec2(1e12, -1e12);
  float sq = sqrt(d);
  float q = b >= 0.0 ? -b - sq : -b + sq;
  if (abs(q) < 1e-6) return vec2(0.0, 0.0);
  float t0 = q;
  float t1 = c / q;
  return vec2(min(t0, t1), max(t0, t1));
}
vec3 scatter(vec3 rd) {
  vec3 ro = vec3(0.0, RP + uViewerAlt, 0.0);
  vec2 pa = rs(ro, rd, RA);
  float tEnd = pa.y;
  vec2 pg = rs(ro, rd, RP);
  // Downward rays: keep integrating haze for at least 25 km (density clamped at sea level) so the
  // horizon haze continues smoothly below the horizon — this is the aerial-perspective colour.
  if (pg.x > 0.0) tEnd = min(tEnd, max(pg.x, 25000.0));
  float tStart = max(pa.x, 0.0);
  if (tEnd <= tStart) return vec3(0.0);
  const int N = 24;
  const int M = 8;
  float seg = (tEnd - tStart) / float(N);
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  float odR = 0.0;
  float odM = 0.0;
  float mu = dot(rd, uSunDir);
  float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g2 = GM * GM;
  float phM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * GM * mu, 1.5));
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * (tStart + seg * (float(i) + 0.5));
    float h = max(length(p) - RP, 0.0);
    float dR = exp(-h / HR) * seg;
    float dM = exp(-h / HM) * seg;
    odR += dR;
    odM += dM;
    vec2 lg = rs(p, uSunDir, RP);
    if (lg.x > 0.0) continue;
    vec2 la = rs(p, uSunDir, RA);
    float lseg = la.y / float(M);
    float lR = 0.0;
    float lM = 0.0;
    for (int j = 0; j < M; j++) {
      vec3 q = p + uSunDir * (lseg * (float(j) + 0.5));
      float hq = max(length(q) - RP, 0.0);
      lR += exp(-hq / HR) * lseg;
      lM += exp(-hq / HM) * lseg;
    }
    vec3 att = exp(-(BR * (odR + lR) + BM * 1.1 * (odM + lM)));
    sumR += dR * att;
    sumM += dM * att;
  }
  return uSunI * (sumR * BR * phR + sumM * BM * phM);
}
void main() {
  float az = (vUv.x - 0.5) * 2.0 * PI;
  float s = (vUv.y - 0.5) * 2.0;
  float e = sign(s) * s * s * (PI * 0.5);
  vec3 rd = vec3(sin(az) * cos(e), sin(e), -cos(az) * cos(e));
  vec3 c = scatter(rd);
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  gl_FragColor = vec4(c, 1.0);
}
`;

const LUT_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class Atmosphere {
  readonly lut: WebGLRenderTarget;
  private readonly quadScene = new Scene();
  private readonly quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mat: ShaderMaterial;
  readonly sunDir = new Vector3(0.3, 0.7, 0.3).normalize();
  readonly sunColor = new Color(1, 1, 1);
  readonly skyZenith = new Color();
  readonly skyHorizon = new Color();
  private lastSun = new Vector3(0, -2, 0);
  private lastAlt = -1e9;
  dirty = true;
  /** Incremented each bake so consumers (env map) can refresh. */
  version = 0;

  constructor() {
    installAtmosphereChunks();
    this.lut = new WebGLRenderTarget(256, 128, {
      type: HalfFloatType,
      magFilter: LinearFilter,
      minFilter: LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
    this.lut.texture.wrapS = RepeatWrapping;
    this.lut.texture.wrapT = ClampToEdgeWrapping;
    this.mat = new ShaderMaterial({
      vertexShader: LUT_VERT,
      fragmentShader: LUT_FRAG,
      uniforms: {
        uSunDir: { value: this.sunDir },
        uViewerAlt: { value: 0 },
        uSunI: { value: 22 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene.add(new Mesh(new PlaneGeometry(2, 2), this.mat));
    atmoUniforms.uAtmoLut!.value = this.lut.texture;
  }

  setSun(dir: Vector3): void {
    this.sunDir.copy(dir).normalize();
  }

  /** Re-bake the LUT if the sun or viewer altitude moved enough. Returns true if baked. */
  update(renderer: WebGLRenderer, viewerAlt: number, force = false): boolean {
    const alt = Math.max(2, Math.min(viewerAlt, 12000));
    const moved = this.lastSun.angleTo(this.sunDir) > 0.0035;
    const altMoved = Math.abs(alt - this.lastAlt) > 350;
    if (!force && !this.dirty && !moved && !altMoved) return false;
    this.dirty = false;
    this.lastSun.copy(this.sunDir);
    this.lastAlt = alt;
    (this.mat.uniforms.uViewerAlt as IUniform).value = alt;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.lut);
    renderer.render(this.quadScene, this.quadCam);
    renderer.setRenderTarget(prev);
    this.computeCpuColors(alt);
    atmoUniforms.uAtmoSunDir!.value.copy(this.sunDir);
    atmoUniforms.uAtmoSunColor!.value.copy(this.sunColor);
    atmoUniforms.uAtmoNight!.value = 1 - smooth(-0.12, 0.08, this.sunDir.y);
    this.version++;
    return true;
  }

  /** CPU evaluation of sun transmittance (for the directional light) and sky tones (hemisphere). */
  private computeCpuColors(alt: number): void {
    const sun = this.sunDir;
    const ro = new Vector3(0, R_PLANET + alt, 0);
    const od = opticalDepth(ro, sun, 32);
    const tr = (i: number) => Math.exp(-((BETA_R[i] as number) * od.r + BETA_M * 1.1 * od.m));
    const horizonFade = smooth(-0.06, 0.04, sun.y);
    this.sunColor.setRGB(tr(0) * horizonFade, tr(1) * horizonFade, tr(2) * horizonFade);
    const z = scatterCpu(ro, new Vector3(0, 1, 0), sun);
    this.skyZenith.setRGB(z[0] * SKY_SCALE, z[1] * SKY_SCALE, z[2] * SKY_SCALE);
    const hzDir = new Vector3(-sun.x, 0.05, -sun.z);
    if (hzDir.lengthSq() < 1e-6) hzDir.set(1, 0.05, 0);
    const h = scatterCpu(ro, hzDir.normalize(), sun);
    this.skyHorizon.setRGB(h[0] * SKY_SCALE, h[1] * SKY_SCALE, h[2] * SKY_SCALE);
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function raySphere(ro: Vector3, rd: Vector3, r: number): [number, number] {
  const r0 = ro.length();
  const b = ro.dot(rd);
  const c = (r0 - r) * (r0 + r);
  const d = b * b - c;
  if (d < 0) return [1e12, -1e12];
  const s = Math.sqrt(d);
  const q = b >= 0 ? -b - s : -b + s;
  if (Math.abs(q) < 1e-9) return [0, 0];
  const t0 = q;
  const t1 = c / q;
  return [Math.min(t0, t1), Math.max(t0, t1)];
}

function opticalDepth(ro: Vector3, rd: Vector3, n: number): { r: number; m: number } {
  const [, t1] = raySphere(ro, rd, R_ATMOS);
  const [g0] = raySphere(ro, rd, R_PLANET);
  let end = t1;
  if (g0 > 0) end = Math.min(end, g0 + 30000); // through the limb at sunset: long but finite path
  const seg = end / n;
  let r = 0;
  let m = 0;
  const p = new Vector3();
  for (let i = 0; i < n; i++) {
    p.copy(ro).addScaledVector(rd, seg * (i + 0.5));
    const h = Math.max(0, p.length() - R_PLANET);
    r += Math.exp(-h / H_R) * seg;
    m += Math.exp(-h / H_M) * seg;
  }
  return { r, m };
}

export function scatterCpu(ro: Vector3, rd: Vector3, sun: Vector3): [number, number, number] {
  const N = 16;
  const M = 6;
  const [a0, a1] = raySphere(ro, rd, R_ATMOS);
  const [g0] = raySphere(ro, rd, R_PLANET);
  let tEnd = a1;
  if (g0 > 0) tEnd = Math.min(tEnd, g0);
  const tStart = Math.max(a0, 0);
  const seg = (tEnd - tStart) / N;
  const mu = rd.dot(sun);
  const phR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const g2 = G_M * G_M;
  const phM = ((3 / (8 * Math.PI)) * ((1 - g2) * (1 + mu * mu))) / ((2 + g2) * Math.pow(1 + g2 - 2 * G_M * mu, 1.5));
  let odR = 0;
  let odM = 0;
  const sumR = [0, 0, 0];
  const sumM = [0, 0, 0];
  const p = new Vector3();
  const q = new Vector3();
  for (let i = 0; i < N; i++) {
    p.copy(ro).addScaledVector(rd, tStart + seg * (i + 0.5));
    const h = Math.max(0, p.length() - R_PLANET);
    const dR = Math.exp(-h / H_R) * seg;
    const dM = Math.exp(-h / H_M) * seg;
    odR += dR;
    odM += dM;
    const [lg] = raySphere(p, sun, R_PLANET);
    if (lg > 0) continue;
    const [, la] = raySphere(p, sun, R_ATMOS);
    const lseg = la / M;
    let lR = 0;
    let lM = 0;
    for (let j = 0; j < M; j++) {
      q.copy(p).addScaledVector(sun, lseg * (j + 0.5));
      const hq = Math.max(0, q.length() - R_PLANET);
      lR += Math.exp(-hq / H_R) * lseg;
      lM += Math.exp(-hq / H_M) * lseg;
    }
    for (let c = 0; c < 3; c++) {
      const att = Math.exp(-((BETA_R[c] as number) * (odR + lR) + BETA_M * 1.1 * (odM + lM)));
      sumR[c] = (sumR[c] as number) + dR * att;
      sumM[c] = (sumM[c] as number) + dM * att;
    }
  }
  const I = 22;
  return [0, 1, 2].map((c) => I * ((sumR[c] as number) * (BETA_R[c] as number) * phR + (sumM[c] as number) * BETA_M * phM)) as [
    number,
    number,
    number,
  ];
}

/**
 * Sun direction for a time of day (equinox, latitude ≈ 40.7° N).
 * World axes: +X east, +Y up, −Z north (so +Z is south).
 */
export function sunDirectionForHour(hour: number, out = new Vector3()): Vector3 {
  const lat = 40.7 * (Math.PI / 180);
  const H = (hour - 12) * 15 * (Math.PI / 180);
  const sinEl = Math.cos(lat) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  // Azimuth measured from south toward west for positive H.
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat));
  const cosEl = Math.cos(el);
  // south = +Z, west = −X
  out.set(-Math.sin(az) * cosEl, Math.sin(el), Math.cos(az) * cosEl);
  return out.normalize();
}
