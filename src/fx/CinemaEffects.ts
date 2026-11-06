/**
 * Cinematic post effects:
 *  - DofEffect: physically-motivated background/foreground blur from log depth, 36-tap golden-angle
 *    gather with occlusion-aware weights (the sharp hero never bleeds into the blurred sky).
 *  - GradeEffect: lift/gamma/gain, saturation and warm-highlight / cool-shadow split toning.
 */
import { Effect, EffectAttribute } from 'postprocessing';
import { Uniform, Vector3 } from 'three';

const DOF_FRAG = /* glsl */ `
uniform float uFocusDist;
uniform float uFocusRange;
uniform float uMaxBlur;
uniform float uAmount;
uniform float uNearBlur;

float distFromDepth(float d) { return exp2(d * log2(cameraFar + 1.0)) - 1.0; }

float coc(float dist) {
  float far = smoothstep(uFocusDist + uFocusRange * 0.5, uFocusDist + uFocusRange * 4.0, dist);
  float near = (1.0 - smoothstep(uFocusDist * 0.35, uFocusDist - uFocusRange * 0.5, dist)) * uNearBlur;
  return max(far, near) * uMaxBlur;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  if (uAmount <= 0.001) { outputColor = inputColor; return; }
  float dist = distFromDepth(depth);
  float c0 = coc(dist) * uAmount;
  if (c0 < 0.0004) { outputColor = inputColor; return; }
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  const int N = 36;
  for (int i = 0; i < N; i++) {
    float r = sqrt((float(i) + 0.5) / float(N));
    float a = float(i) * 2.39996323;
    vec2 o = vec2(cos(a), sin(a)) * r * c0;
    o.x /= aspect;
    vec2 suv = uv + o;
    float sd = distFromDepth(texture2D(depthBuffer, suv).r);
    float sc = coc(sd) * uAmount;
    // Nearer (sharper) samples only contribute if their own blur reaches this pixel.
    float w = sd < dist - 1.0 ? smoothstep(0.0, 1.0, sc / max(c0 * r, 1e-5)) : 1.0;
    acc += texture2D(inputBuffer, suv).rgb * w;
    wsum += w;
  }
  vec3 col = wsum > 0.0 ? acc / wsum : inputColor.rgb;
  outputColor = vec4(col, inputColor.a);
}
`;

export class DofEffect extends Effect {
  constructor() {
    super('DofEffect', DOF_FRAG, {
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['uFocusDist', new Uniform(10)],
        ['uFocusRange', new Uniform(3)],
        ['uMaxBlur', new Uniform(0.012)],
        ['uAmount', new Uniform(0)],
        ['uNearBlur', new Uniform(0)],
      ]),
    });
  }
  set(name: 'uFocusDist' | 'uFocusRange' | 'uMaxBlur' | 'uAmount' | 'uNearBlur', v: number): void {
    (this.uniforms.get(name) as Uniform<number>).value = v;
  }
  get amount(): number {
    return (this.uniforms.get('uAmount') as Uniform<number>).value;
  }
}

const GRADE_FRAG = /* glsl */ `
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSat;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uSplit;
uniform float uContrast;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, 0.0);
  c = c * uGain + uLift * (1.0 - c);
  c = pow(max(c, 0.0), 1.0 / uGamma);
  c = (c - 0.5) * uContrast + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  float hi = smoothstep(0.35, 0.95, l);
  c *= mix(uShadowTint, uHighTint, hi) * uSplit + (1.0 - uSplit);
  outputColor = vec4(max(c, 0.0), inputColor.a);
}
`;

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAG, {
      uniforms: new Map<string, Uniform>([
        ['uLift', new Uniform(new Vector3(0.012, 0.014, 0.022))],
        ['uGamma', new Uniform(new Vector3(1.0, 1.0, 1.0))],
        ['uGain', new Uniform(new Vector3(1.03, 1.0, 0.97))],
        ['uSat', new Uniform(1.04)],
        ['uShadowTint', new Uniform(new Vector3(0.94, 0.98, 1.08))],
        ['uHighTint', new Uniform(new Vector3(1.05, 1.0, 0.94))],
        ['uSplit', new Uniform(0.5)],
        ['uContrast', new Uniform(1.04)],
      ]),
    });
  }
  setNumber(name: 'uSat' | 'uSplit' | 'uContrast', v: number): void {
    (this.uniforms.get(name) as Uniform<number>).value = v;
  }
}
