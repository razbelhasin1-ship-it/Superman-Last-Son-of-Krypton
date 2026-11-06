/**
 * 600–1,500 camera-space wind-streak quads (spec 7.6). Seeds wrap inside a box around the camera,
 * so streaks are world-fixed until they wrap; each is stretched along the relative wind.
 */
import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type IUniform,
} from 'three';
import { Rng } from '../core/rng.ts';
import { injectAtmo } from '../render/atmosphere.ts';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uCamPos;
uniform vec3 uDir;
uniform float uLen;
uniform float uWidth;
uniform float uBox;
attribute vec4 aSeed;
varying float vA;
varying vec2 vUv;
void main() {
  vec3 rel = mod(aSeed.xyz * uBox - uCamPos, uBox) - uBox * 0.5;
  vec3 p = uCamPos + rel;
  vec3 along = uDir * uLen * (0.4 + aSeed.w);
  vec3 toCam = normalize(cameraPosition - p);
  vec3 side = cross(normalize(along + 1e-5), toCam);
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
  float a = position.y + 0.5;
  vec3 wp = p + along * a + side * position.x * uWidth * (0.5 + aSeed.w);
  float d = length(rel);
  vA = smoothstep(uBox * 0.5, uBox * 0.3, d) * smoothstep(3.0, 9.0, d) * (0.4 + 0.6 * aSeed.w);
  vUv = vec2(position.x + 0.5, a);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uAlpha;
uniform vec3 uColor;
varying float vA;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float along = sin(vUv.y * 3.14159);
  float a = across * across * along * vA * uAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

export class WindStreaks {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;

  constructor(count: number, seed = 7) {
    const quad = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position!);
    const seeds = new Float32Array(count * 4);
    const rng = new Rng(seed);
    for (let i = 0; i < count * 4; i++) seeds[i] = rng.next();
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    const uniforms: Record<string, IUniform> = {
      uCamPos: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uLen: { value: 4 },
      uWidth: { value: 0.03 },
      uBox: { value: 70 },
      uAlpha: { value: 0 },
      uColor: { value: new Vector3(0.9, 0.95, 1.0) },
    };
    injectAtmo(uniforms);
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.mesh = new Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 30;
    this.mesh.name = 'windStreaks';
  }

  update(camPos: Vector3, relWind: Vector3, speed: number, intensity: number, night: number): void {
    const u = this.mat.uniforms;
    (u.uCamPos!.value as Vector3).copy(camPos);
    if (relWind.lengthSq() > 1e-8) (u.uDir!.value as Vector3).copy(relWind).normalize();
    u.uLen!.value = Math.min(60, 0.6 + speed * 0.028);
    u.uWidth!.value = 0.025 + Math.min(0.08, speed * 0.00004);
    u.uBox!.value = speed > 900 ? 160 : 80;
    u.uAlpha!.value = intensity * (1 - night * 0.6);
    this.mesh.visible = intensity > 0.002;
  }
}
