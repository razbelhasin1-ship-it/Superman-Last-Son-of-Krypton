/** Helpers for patching built-in materials while keeping the shared atmosphere uniforms. */
import type { Material, WebGLProgramParametersWithUniforms } from 'three';
import { injectAtmo } from './atmosphere.ts';

export type ShaderPatch = (shader: WebGLProgramParametersWithUniforms) => void;

export function patchMaterial<M extends Material>(mat: M, cacheKey: string, fn: ShaderPatch): M {
  mat.onBeforeCompile = (shader) => {
    injectAtmo(shader.uniforms);
    fn(shader);
  };
  mat.customProgramCacheKey = () => cacheKey;
  return mat;
}

/** GLSL: cheap hash / value noise / fbm helpers shared by procedural surfaces. */
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm2(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
// Anti-aliased grid line mask: 1 on the line, 0 elsewhere.
float gridLine(float coord, float spacing, float halfWidth) {
  float c = coord / spacing;
  float d = abs(fract(c - 0.5) - 0.5) * spacing;
  float w = fwidth(coord) * 1.2;
  float fade = 1.0 - smoothstep(spacing * 0.08, spacing * 0.35, w);
  return (1.0 - smoothstep(halfWidth, halfWidth + w, d)) * fade;
}
`;
