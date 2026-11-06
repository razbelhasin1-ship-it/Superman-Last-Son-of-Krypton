/**
 * Hero readability (spec 12.1): a gentle camera-side fill and a rim/kicker light that only the hero
 * receives, so the silhouette, emblem and cape colour blocks stay legible against sky, glass and night.
 * three.js has no per-object light linking, so this is a material patch: `applyHeroLook(root)` chains a
 * small fragment term into every standard/physical material under the hero (idempotent, keeps any
 * existing onBeforeCompile). `updateHeroLook` feeds the view-space sun direction and night factor.
 */
import { Color, Matrix3, Vector3, type Camera, type IUniform, type Material, type Mesh, type Object3D } from 'three';

export const heroLookUniforms: Record<string, IUniform> = {
  uHeroFill: { value: 0.16 },
  uHeroRim: { value: 0.42 },
  uHeroRimColor: { value: new Color(1.0, 0.95, 0.88) },
  uHeroSunView: { value: new Vector3(0, 1, 0) },
};

const PARS = /* glsl */ `
uniform float uHeroFill;
uniform float uHeroRim;
uniform vec3 uHeroRimColor;
uniform vec3 uHeroSunView;
`;

const TERM = /* glsl */ `
{
  vec3 hN = normalize(normal);
  vec3 hV = normalize(vViewPosition);
  float ndv = clamp(dot(hN, hV), 0.0, 1.0);
  // Camera-side fill: wraps a little so faces turned away still lift out of the shade.
  outgoingLight += diffuseColor.rgb * (0.25 + 0.75 * ndv) * uHeroFill;
  // Rim / kicker: grazing angles, stronger when the sun is behind the hero (backlit).
  float fres = pow(1.0 - ndv, 3.0);
  float back = clamp(0.5 - 0.5 * uHeroSunView.z, 0.0, 1.0);
  outgoingLight += uHeroRimColor * fres * uHeroRim * (0.4 + 0.6 * back);
}
`;

type Patchable = Material & {
  isMeshStandardMaterial?: boolean;
  onBeforeCompile: (shader: { uniforms: Record<string, IUniform>; fragmentShader: string }, renderer: unknown) => void;
};

function patch(m: Patchable): void {
  if (!m.isMeshStandardMaterial || m.userData.heroLook) return;
  m.userData.heroLook = true;
  const own = Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') ? m.onBeforeCompile : null;
  const proto = Object.getPrototypeOf(m) as Patchable;
  m.onBeforeCompile = function (shader, renderer) {
    if (own) own.call(this, shader, renderer);
    else proto.onBeforeCompile.call(this, shader, renderer);
    for (const k in heroLookUniforms) shader.uniforms[k] = heroLookUniforms[k]!;
    if (!shader.fragmentShader.includes('uHeroFill')) {
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${PARS}\nvoid main() {`)
        .replace('#include <opaque_fragment>', `${TERM}\n#include <opaque_fragment>`);
    }
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${prevKey()}|heroLook`;
  m.needsUpdate = true;
}

/** Patch every standard/physical material under `root` (call again after swapping the body). */
export function applyHeroLook(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) patch(m as Patchable);
  });
}

const _m3 = new Matrix3();

/** Per frame: view-space sun direction, night boost (moonlit rim is cooler and a little stronger). */
export function updateHeroLook(camera: Camera, sunDir: Vector3, night: number): void {
  _m3.setFromMatrix4(camera.matrixWorldInverse);
  (heroLookUniforms.uHeroSunView!.value as Vector3).copy(sunDir).applyMatrix3(_m3).normalize();
  heroLookUniforms.uHeroFill!.value = 0.16 + 0.22 * night;
  heroLookUniforms.uHeroRim!.value = 0.42 + 0.25 * night;
  (heroLookUniforms.uHeroRimColor!.value as Color).setRGB(1.0 - 0.3 * night, 0.95 - 0.12 * night, 0.88 + 0.12 * night);
}
