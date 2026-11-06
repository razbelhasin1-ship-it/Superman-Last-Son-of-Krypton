/**
 * Speed-sensation post effect (spec 7.6, screen-space layer):
 *  - shock-ring refraction (sonic boom, brake shock, thunderclap)
 *  - camera motion blur from log-depth reprojection (hero masked out) merged with
 *    radial zoom streaks toward the vanishing point → one directional blur, N samples
 *  - edge chromatic aberration, tunnel vision for burst, desaturation (focus), heat shimmer
 *  - cloud mist whiteout with streaks
 */
import { Effect, EffectAttribute } from 'postprocessing';
import { Matrix4, Uniform, Vector2, Vector3, Vector4, type Camera, type PerspectiveCamera } from 'three';

const FRAG = /* glsl */ `
uniform float uStreak;
uniform vec2 uCenter;
uniform float uCA;
uniform float uBlur;
uniform float uMist;
uniform vec3 uMistColor;
uniform vec4 uShock;
uniform vec4 uShock2;
uniform mat4 uPrevViewProj;
uniform mat4 uCamWorld;
uniform vec2 uProj;
uniform float uHeroDist;
uniform float uTunnel;
uniform float uDesat;
uniform float uFxTime;
uniform float uHeat;
uniform vec2 uHeroUv;
uniform vec2 uWakeDir;
uniform float uWake;

float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 ringOffset(vec2 uv, vec4 sh) {
  if (sh.w <= 0.0005) return vec2(0.0);
  vec2 d = uv - sh.xy;
  d.x *= aspect;
  float r = length(d);
  float x = (r - sh.z) / (0.018 + sh.z * 0.08);
  float ring = exp(-x * x);
  vec2 n = d / max(r, 1e-4);
  n.x /= aspect;
  return -n * ring * sh.w * 0.03;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 suv = uv + ringOffset(uv, uShock) + ringOffset(uv, uShock2);
  // Heat shimmer (heat vision overload, explosions).
  if (uHeat > 0.0) {
    float n1 = sin(uv.y * 90.0 + uFxTime * 13.0) * sin(uv.x * 70.0 - uFxTime * 9.0);
    suv += vec2(n1, n1 * 0.7) * 0.0025 * uHeat;
  }
  // Supersonic wake: ripples trailing the hero on screen.
  if (uWake > 0.0) {
    vec2 rel = (uv - uHeroUv) * vec2(aspect, 1.0);
    float along = dot(rel, uWakeDir);
    if (along > 0.0) {
      float across = length(rel - uWakeDir * along);
      float width = 0.0015 + along * 0.02;
      float m = smoothstep(0.0, 0.05, along) * exp(-across * across / width) * exp(-along * 3.0);
      suv += uWakeDir * sin(along * 140.0 - uFxTime * 40.0) * m * uWake * 0.006;
    }
  }

  if (any(isnan(suv)) || any(isinf(suv))) suv = uv;
  // Reproject for camera motion blur (log depth → view distance).
  float dist = exp2(depth * log2(cameraFar + 1.0)) - 1.0;
  vec2 ndc = uv * 2.0 - 1.0;
  vec3 viewPos = vec3(ndc.x * dist / uProj.x, ndc.y * dist / uProj.y, -dist);
  vec4 world = uCamWorld * vec4(viewPos, 1.0);
  vec4 prevClip = uPrevViewProj * world;
  vec2 prevUv = prevClip.w > 1e-3 ? prevClip.xy / prevClip.w * 0.5 + 0.5 : uv;
  float heroMask = smoothstep(uHeroDist + 2.5, uHeroDist + 12.0, dist);
  vec2 vel = (uv - prevUv) * uBlur * heroMask;
  float vl = length(vel);
  if (vl > 0.05) vel *= 0.05 / vl;

  // Radial streaks toward the vanishing point.
  vec2 rd = suv - uCenter;
  float rlen = length(rd * vec2(aspect, 1.0));
  float edge = smoothstep(0.08, 0.75, rlen);
  vel += rd * uStreak * 0.085 * edge * mix(1.0, heroMask, 0.85);

  vec3 col = vec3(0.0);
  float jitter = h12(uv * 913.0 + uFxTime) - 0.5;
  const int N = 10;
  float vlen = length(vel);
  if (vlen > 0.0006) {
    for (int i = 0; i < N; i++) {
      float t = (float(i) + 0.5 + jitter * 0.8) / float(N) - 0.5;
      col += texture2D(inputBuffer, suv - vel * t).rgb;
    }
    col /= float(N);
  } else {
    col = texture2D(inputBuffer, suv).rgb;
  }

  // Chromatic aberration at the frame edges.
  if (uCA > 0.0) {
    vec2 ca = rd * uCA * edge;
    float r = texture2D(inputBuffer, suv - ca).r;
    float b = texture2D(inputBuffer, suv + ca).b;
    col.r = mix(col.r, r, 0.75);
    col.b = mix(col.b, b, 0.75);
  }

  // Burst tunnel vision: darken + desaturate the periphery.
  if (uTunnel > 0.0) {
    float tv = smoothstep(0.25, 0.85, rlen) * uTunnel;
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(l) * vec3(0.75, 0.85, 1.05), tv * 0.65);
    col *= 1.0 - tv * 0.55;
  }
  if (uDesat > 0.0) {
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(l) * vec3(0.92, 0.97, 1.08), uDesat);
  }

  // Cloud mist: soft whiteout with streaks flowing outward.
  if (uMist > 0.0) {
    float a = atan(rd.y, rd.x * aspect);
    float streak = h12(vec2(floor(a * 60.0), 0.0));
    float flow = fract(rlen * 3.0 - uFxTime * (1.5 + streak * 2.0));
    float st = smoothstep(0.6, 1.0, streak) * smoothstep(0.0, 0.3, flow) * (1.0 - flow);
    float m = clamp(uMist * (0.75 + 0.25 * rlen) + st * uMist * 0.35, 0.0, 1.0);
    col = mix(col, uMistColor, m);
  }
  outputColor = vec4(col, inputColor.a);
}
`;

export class SpeedFxEffect extends Effect {
  private readonly prevViewProj = new Matrix4();
  private readonly curViewProj = new Matrix4();
  private first = true;

  constructor() {
    super('SpeedFxEffect', FRAG, {
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['uStreak', new Uniform(0)],
        ['uCenter', new Uniform(new Vector2(0.5, 0.5))],
        ['uCA', new Uniform(0)],
        ['uBlur', new Uniform(0)],
        ['uMist', new Uniform(0)],
        ['uMistColor', new Uniform(new Vector3(1, 1, 1))],
        ['uShock', new Uniform(new Vector4(0.5, 0.5, 0, 0))],
        ['uShock2', new Uniform(new Vector4(0.5, 0.5, 0, 0))],
        ['uPrevViewProj', new Uniform(new Matrix4())],
        ['uCamWorld', new Uniform(new Matrix4())],
        ['uProj', new Uniform(new Vector2(1, 1))],
        ['uHeroDist', new Uniform(8)],
        ['uTunnel', new Uniform(0)],
        ['uDesat', new Uniform(0)],
        ['uFxTime', new Uniform(0)],
        ['uHeat', new Uniform(0)],
        ['uHeroUv', new Uniform(new Vector2(0.5, 0.5))],
        ['uWakeDir', new Uniform(new Vector2(0, -1))],
        ['uWake', new Uniform(0)],
      ]),
    });
  }

  u<T>(name: string): Uniform<T> {
    return this.uniforms.get(name) as Uniform<T>;
  }

  /**
   * Feed camera matrices. `prevViewProj` should be the view-projection 1/60 s ago (sim step),
   * so blur length is frame-rate independent.
   */
  setCamera(camera: Camera, prevViewProj: Matrix4 | null): void {
    const cam = camera as PerspectiveCamera;
    this.curViewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    (this.u<Matrix4>('uCamWorld').value as Matrix4).copy(cam.matrixWorld);
    (this.u<Vector2>('uProj').value as Vector2).set(cam.projectionMatrix.elements[0]!, cam.projectionMatrix.elements[5]!);
    const pv = this.u<Matrix4>('uPrevViewProj').value as Matrix4;
    if (prevViewProj) pv.copy(prevViewProj);
    else if (this.first) pv.copy(this.curViewProj);
    else pv.copy(this.prevViewProj);
    this.prevViewProj.copy(this.curViewProj);
    this.first = false;
  }

  set(name: string, value: number): void {
    (this.uniforms.get(name) as Uniform<number>).value = value;
  }
}
