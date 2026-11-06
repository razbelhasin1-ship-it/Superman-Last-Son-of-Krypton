/**
 * Camera-centred sky dome: samples the atmosphere LUT, adds a sun disc with bloom-friendly radiance,
 * a moon and a procedural star field at night. Rendered first with no depth test.
 */
import { BackSide, Mesh, ShaderMaterial, SphereGeometry, type IUniform } from 'three';
import { ATMO_GLSL, atmoUniforms } from './atmosphere.ts';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}
`;

const FRAG = /* glsl */ `
${ATMO_GLSL}
uniform float uSunDisc;
uniform float uStarTime;
uniform vec3 uMoonDir;
varying vec3 vDir;
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 stars(vec3 d) {
  vec3 c = vec3(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float scale = layer == 0 ? 180.0 : 420.0;
    vec3 g = d * scale;
    vec3 cell = floor(g);
    float h = hash13(cell + float(layer) * 17.0);
    if (h > 0.985) {
      vec3 ctr = cell + 0.5 + (vec3(hash13(cell + 1.3), hash13(cell + 2.7), hash13(cell + 4.1)) - 0.5) * 0.7;
      float dist = length(g - ctr);
      float tw = 0.75 + 0.25 * sin(uStarTime * (2.0 + h * 9.0) + h * 40.0);
      float b = smoothstep(0.35, 0.0, dist) * (h - 0.985) * 66.0 * tw;
      c += mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.9, 0.75), fract(h * 91.0)) * b;
    }
  }
  return c;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = atmoSky(d);
  float cosA = dot(d, uAtmoSunDir);
  // Sun disc (slightly enlarged for readability) with limb darkening, plus a tight halo.
  float r = 0.0085;
  float disc = smoothstep(cos(r), cos(r * 0.7), cosA);
  col += uAtmoSunColor * disc * 55.0 * uSunDisc;
  col += uAtmoSunColor * pow(max(cosA, 0.0), 900.0) * 3.0 * uSunDisc;
  col += uAtmoSunColor * pow(max(cosA, 0.0), 60.0) * 0.08 * uSunDisc;
  // Night: stars and moon.
  float night = uAtmoNight;
  if (night > 0.001 && d.y > -0.05) {
    col += stars(d) * night * smoothstep(-0.05, 0.15, d.y);
    float m = dot(d, normalize(uMoonDir));
    float moon = smoothstep(cos(0.012), cos(0.0105), m);
    col += vec3(0.85, 0.88, 0.95) * moon * 1.8 * night;
    col += vec3(0.25, 0.3, 0.45) * pow(max(m, 0.0), 300.0) * 0.4 * night;
    col += vec3(0.004, 0.006, 0.014) * night;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export class SkyDome extends Mesh {
  readonly skyMaterial: ShaderMaterial;

  constructor() {
    const uniforms: Record<string, IUniform> = {
      uSunDisc: { value: 1 },
      uStarTime: { value: 0 },
      uMoonDir: { value: atmoUniforms.uAtmoSunDir!.value.clone().negate() },
    };
    for (const k in atmoUniforms) uniforms[k] = atmoUniforms[k] as IUniform;
    const mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    super(new SphereGeometry(1, 48, 24), mat);
    this.skyMaterial = mat;
    this.frustumCulled = false;
    this.renderOrder = -1000;
    this.name = 'SkyDome';
  }

  setTime(t: number): void {
    (this.skyMaterial.uniforms.uStarTime as IUniform).value = t;
  }

  setSunDisc(on: boolean): void {
    (this.skyMaterial.uniforms.uSunDisc as IUniform).value = on ? 1 : 0;
  }
}
