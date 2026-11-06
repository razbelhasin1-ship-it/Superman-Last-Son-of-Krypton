/**
 * Sun FX (spec 12.1): crepuscular "god rays" when the sun sits behind towers or clouds, plus a subtle
 * lens flare (starburst, anamorphic streak, ghosts along the optical axis). HDR, before tone mapping.
 * Rays: a radial march toward the sun accumulating bright *sky* pixels (towers write depth and block;
 * clouds don't, but their dark bodies fail the brightness test, so shafts appear through gaps).
 * Visibility comes from the CPU (collision sweep + cloud density), so there are no per-pixel taps.
 */
import { Effect, EffectAttribute } from 'postprocessing';
import { Uniform, Vector2, Vector3 } from 'three';

const FRAG = /* glsl */ `
uniform vec2 uSunUv;
uniform float uSunOn;
uniform float uSunVis;
uniform vec3 uSunCol;
uniform float uRays;
uniform float uFlare;
uniform float uSkyDist;

float sfxDist(float d) { return exp2(d * log2(cameraFar + 1.0)) - 1.0; }

vec3 ghost(vec2 uv, vec2 c, float r, vec3 tint) {
  vec2 d = (uv - c) * vec2(aspect, 1.0);
  float l = length(d);
  float disc = smoothstep(r, r * 0.55, l) * (0.55 + 0.45 * smoothstep(r * 0.4, r, l));
  return tint * disc;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  if (uSunOn <= 0.001) { outputColor = inputColor; return; }
  vec3 col = inputColor.rgb;
  vec2 toSun = uSunUv - uv;
  float sunDist = length(toSun * vec2(aspect, 1.0));
  // God rays (skip pixels too far from the sun to receive any).
  if (uRays > 0.001 && sunDist < 1.6) {
    const int N = 36;
    vec2 st = toSun / float(N);
    vec2 p = uv;
    float decay = 1.0;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < N; i++) {
      p += st;
      if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) { decay *= 0.96; continue; }
      float sky = step(uSkyDist, sfxDist(texture2D(depthBuffer, p).r));
      vec3 c = min(texture2D(inputBuffer, p).rgb, vec3(12.0));
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Occlusion mask: only the sun-bright sky close to the sun emits; towers, cloud bodies and the
      // ordinary sky block it, so the radial blur turns the gaps into shafts.
      float near = exp(-length((p - uSunUv) * vec2(aspect, 1.0)) * 7.0);
      acc += c * sky * smoothstep(3.0, 9.0, lum) * near * decay;
      decay *= 0.965;
    }
    float fall = exp(-sunDist * 2.2);
    col += acc / float(N) * uRays * 0.9 * fall;
  }
  // Lens flare (only when the sun itself is visible).
  if (uFlare > 0.001 && uSunVis > 0.01) {
    vec2 d = (uv - uSunUv) * vec2(aspect, 1.0);
    float r = length(d);
    float ang = atan(d.y, d.x);
    float star = pow(abs(cos(ang * 3.0 + 0.4)), 60.0) * exp(-r * 7.0) + pow(abs(cos(ang * 2.0 + 1.1)), 90.0) * exp(-r * 10.0) * 0.6;
    float streak = exp(-abs(d.y) * 120.0) * exp(-abs(d.x) * 2.6) * 0.35;
    float glow = exp(-r * 18.0) * 0.6;
    vec3 f = uSunCol * (star * 0.9 + streak + glow);
    // Ghosts mirrored through the centre.
    vec2 axis = vec2(0.5) - uSunUv;
    f += ghost(uv, uSunUv + axis * 0.55, 0.035, vec3(0.30, 0.22, 0.10));
    f += ghost(uv, uSunUv + axis * 1.20, 0.07, vec3(0.10, 0.16, 0.28));
    f += ghost(uv, uSunUv + axis * 1.55, 0.022, vec3(0.28, 0.12, 0.30));
    f += ghost(uv, uSunUv + axis * 2.10, 0.12, vec3(0.06, 0.12, 0.10));
    col += f * uFlare * uSunVis;
  }
  outputColor = vec4(col, inputColor.a);
}
`;

export class SunFxEffect extends Effect {
  constructor() {
    super('SunFxEffect', FRAG, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['uSunUv', new Uniform(new Vector2(0.5, 0.5))],
        ['uSunOn', new Uniform(0)],
        ['uSunVis', new Uniform(0)],
        ['uSunCol', new Uniform(new Vector3(1, 1, 1))],
        ['uRays', new Uniform(0.55)],
        ['uFlare', new Uniform(0.3)],
        ['uSkyDist', new Uniform(30000)],
      ]),
    });
  }

  set(name: 'uSunOn' | 'uSunVis' | 'uRays' | 'uFlare' | 'uSkyDist', v: number): void {
    (this.uniforms.get(name) as Uniform<number>).value = v;
  }

  setSun(uv: Vector2, col: Vector3): void {
    (this.uniforms.get('uSunUv') as Uniform<Vector2>).value.copy(uv);
    (this.uniforms.get('uSunCol') as Uniform<Vector3>).value.copy(col);
  }
}
