/**
 * Renderer + post-processing chain. All WebGL-specific code lives under src/render/.
 * Chain: RenderPass (MSAA) → N8AO → [SpeedFx] → [DOF] → Bloom + ToneMapping(AgX) + Grade + Vignette + Grain → SMAA.
 */
import {
  Color,
  DirectionalLight,
  HalfFloatType,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  NoToneMapping,
  Vector3,
  WebGLRenderer,
  type Texture,
  WebGLRenderTarget,
  Fog,
  AmbientLight,
  OrthographicCamera,
  DataUtils,
  type Object3D,
} from 'three';
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type Effect,
  type Pass,
} from 'postprocessing';
import { N8AOPostPass, DepthType } from 'n8ao';
import { Atmosphere, atmoUniforms } from './atmosphere.ts';
import { SkyDome } from './SkyDome.ts';
import { T } from '../tuning.ts';

export type QualityName = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  name: QualityName;
  pixelRatio: number;
  msaa: number;
  ao: boolean;
  aoHalfRes: boolean;
  shadowSize: number;
  bloom: boolean;
  smaa: boolean;
  /** Multiplier for cloud puff count / crowd counts / LOD distances (consumed by world systems). */
  detail: number;
}

export const PRESETS: Record<QualityName, QualityPreset> = {
  low: { name: 'low', pixelRatio: 0.75, msaa: 0, ao: false, aoHalfRes: false, shadowSize: 1024, bloom: true, smaa: true, detail: 0.5 },
  medium: { name: 'medium', pixelRatio: 1, msaa: 0, ao: true, aoHalfRes: false, shadowSize: 2048, bloom: true, smaa: true, detail: 0.75 },
  high: { name: 'high', pixelRatio: 1, msaa: 4, ao: true, aoHalfRes: false, shadowSize: 2048, bloom: true, smaa: true, detail: 1 },
  ultra: { name: 'ultra', pixelRatio: 1.5, msaa: 4, ao: true, aoHalfRes: false, shadowSize: 4096, bloom: true, smaa: true, detail: 1.25 },
};

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  frameMs: number;
}

export class RenderSystem {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly atmosphere: Atmosphere;
  readonly sky: SkyDome;
  readonly sun: DirectionalLight;
  readonly ambient: AmbientLight;
  readonly sunTarget = new Vector3();
  private readonly renderPass: RenderPass;
  private ao: N8AOPostPass | null = null;
  readonly bloom: BloomEffect;
  readonly toneMapping: ToneMappingEffect;
  readonly vignette: VignetteEffect;
  readonly noise: NoiseEffect;
  readonly smaa: SMAAEffect;
  private finalPass: EffectPass;
  private finalEffects: Effect[] = [];
  private smaaPass: EffectPass;
  /** Effects inserted before bloom/tonemapping (speed FX, DOF …), each in its own pass. */
  private preEffects: { key: string; pass: EffectPass }[] = [];
  private pmrem: PMREMGenerator;
  private envRT: WebGLRenderTarget | null = null;
  private envVersion = -1;
  private envCooldown = 0;
  private readonly skyScene = new Scene();
  private readonly envSky: SkyDome;
  quality: QualityPreset;
  width = 1;
  height = 1;
  lastStats: RenderStats = { drawCalls: 0, triangles: 0, frameMs: 0 };

  constructor(canvas: HTMLCanvasElement, quality: QualityName, opts: { preserveDrawingBuffer?: boolean } = {}) {
    this.quality = PRESETS[quality];
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.info.autoReset = false;

    this.camera = new PerspectiveCamera(72, 16 / 9, T.camera.near, T.camera.far);
    this.atmosphere = new Atmosphere();
    this.sky = new SkyDome();
    this.scene.add(this.sky);
    // Fog object enables USE_FOG; colour/density are ignored by the patched atmosphere chunks.
    this.scene.fog = new Fog(0xffffff, 1, 2);

    this.sun = new DirectionalLight(0xffffff, T.sky.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.needsUpdate = true;
    this.sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.left = -60;
    sc.right = 60;
    sc.top = 60;
    sc.bottom = -60;
    sc.near = 1;
    sc.far = 3000;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.ambient = new AmbientLight(0xffffff, 0.0);
    this.scene.add(this.ambient);

    // Env-map sky (no sun disc: the directional light provides the specular sun).
    this.envSky = new SkyDome();
    this.envSky.setSunDisc(false);
    this.skyScene.add(this.envSky);
    this.pmrem = new PMREMGenerator(this.renderer);

    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: HalfFloatType,
      multisampling: this.quality.msaa,
    });
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 1.1,
      luminanceSmoothing: 0.25,
      intensity: 0.85,
      radius: 0.72,
      levels: 7,
    });
    this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: T.fx.vignetteBase });
    this.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    this.noise.blendMode.opacity.value = 0.045;
    this.smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
    this.finalPass = new EffectPass(this.camera, this.bloom, this.toneMapping, this.vignette, this.noise);
    this.finalEffects = [this.bloom, this.toneMapping, this.vignette, this.noise];
    this.smaaPass = new EffectPass(this.camera, this.smaa);
    this.rebuildChain();
  }

  /** Effects that need their own pass before bloom/tonemapping (e.g. speed FX, DOF). */
  addPreEffect(key: string, ...effects: Effect[]): EffectPass {
    const pass = new EffectPass(this.camera, ...effects);
    this.preEffects.push({ key, pass });
    this.rebuildChain();
    return pass;
  }

  /** Colour grade after tone mapping (inside the final pass). */
  addGrade(effect: Effect): void {
    this.finalEffects = [this.bloom, this.toneMapping, effect, this.vignette, this.noise];
    this.finalPass.dispose();
    this.finalPass = new EffectPass(this.camera, ...this.finalEffects);
    this.rebuildChain();
  }

  setPreEffectEnabled(key: string, enabled: boolean): void {
    for (const p of this.preEffects) if (p.key === key) p.pass.enabled = enabled;
  }

  private rebuildChain(): void {
    for (const p of [...this.composer.passes]) {
      if (p !== this.renderPass) this.composer.removePass(p);
    }
    if (this.quality.ao) {
      if (!this.ao) {
        this.ao = new N8AOPostPass(this.scene, this.camera, Math.max(1, this.width), Math.max(1, this.height));
        const c = this.ao.configuration;
        c.depthBufferType = DepthType.Log;
        c.gammaCorrection = false;
        c.aoRadius = 4;
        c.distanceFalloff = 1.2;
        c.intensity = 2.2;
        c.aoSamples = 12;
        c.denoiseSamples = 6;
        c.denoiseRadius = 10;
        // depthBufferType is not watched by n8ao's config proxy: rebuild its passes explicitly.
        this.ao.configureSampleDependentPasses();
        this.ao.configureEffectCompositer(DepthType.Log);
      }
      // n8ao 2.0.1's half-res MRT shim is incompatible with three r187 (DECISIONS.md): always full-res.
      this.ao.configuration.halfRes = false;
      this.composer.addPass(this.ao as unknown as Pass);
    }
    for (const p of this.preEffects) this.composer.addPass(p.pass);
    this.composer.addPass(this.finalPass);
    if (this.quality.smaa) this.composer.addPass(this.smaaPass);
  }

  setQuality(name: QualityName): void {
    this.quality = PRESETS[name];
    this.composer.multisampling = this.quality.msaa;
    this.sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as never;
    this.sun.shadow.needsUpdate = true;
    this.shadowHalf = -1;
    this.rebuildChain();
    this.resize(this.width, this.height);
  }

  /** Configure AO for close-up (hero) vs. city scale. */
  setAoScale(radius: number, falloff: number, intensity: number): void {
    if (!this.ao) return;
    this.ao.configuration.aoRadius = radius;
    this.ao.configuration.distanceFalloff = falloff;
    this.ao.configuration.intensity = intensity;
  }

  resize(w: number, h: number, scale = 1): void {
    this.width = Math.max(1, Math.floor(w));
    this.height = Math.max(1, Math.floor(h));
    const pr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2) * this.quality.pixelRatio * scale;
    this.renderer.setPixelRatio(Math.max(0.35, Math.min(pr, 2)));
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  /** Update sun light, atmosphere LUT and env map. `focus` = where the shadow frustum centres. */
  // Shadow cache state (far mode re-renders only when the view really moved).
  private readonly shadowCentre = new Vector3();
  private shadowHalf = 60;
  private readonly shadowSun = new Vector3();

  /**
   * Sun shadow frustum (spec 12.1 "out to ≈ 3 km"): one map whose coverage grows with the viewer's
   * altitude — ±60 m of crisp hero shadow near the ground, up to ±1.6 km of tower shadows from high up.
   * Centred ahead of the camera, snapped to shadow texels (no shimmer) and cached: far-mode maps are only
   * re-rendered when the centre, size or sun moved enough to matter.
   */
  private updateShadowFrustum(lightDir: Vector3, focus: Vector3, viewerAlt: number): void {
    const sh = this.sun.shadow;
    const size = sh.mapSize.x;
    const half = Math.min(1600, Math.max(60, 60 + Math.max(0, viewerAlt - 20) * 1.8));
    // Far mode: centre where the camera's view ray meets the ground (clamped inside the box).
    const dir = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const fwd = new Vector3(dir.x, 0, dir.z);
    const hl = fwd.length();
    if (hl > 1e-6) fwd.divideScalar(hl);
    let centre: Vector3;
    if (half <= 120) centre = focus.clone();
    else {
      const ahead = dir.y < -0.05 ? Math.min(half * 0.85, viewerAlt * (hl / -dir.y)) : half * 0.7;
      const cp = this.camera.position;
      centre = new Vector3(cp.x, focus.y - viewerAlt * 0.5, cp.z).addScaledVector(fwd, ahead);
      centre.y = Math.max(0, cp.y - viewerAlt);
    }
    // Light-space basis; snap the centre to whole texels.
    const L = lightDir.clone().normalize();
    const right = new Vector3().crossVectors(L, Math.abs(L.y) > 0.99 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)).normalize();
    const up = new Vector3().crossVectors(right, L).normalize();
    const texel = (2 * half) / size;
    const cr = Math.round(centre.dot(right) / texel) * texel;
    const cu = Math.round(centre.dot(up) / texel) * texel;
    const cl = centre.dot(L);
    centre.copy(right).multiplyScalar(cr).addScaledVector(up, cu).addScaledVector(L, cl);
    const near = half <= 120;
    const moved = centre.distanceTo(this.shadowCentre);
    const resized = Math.abs(half - this.shadowHalf) / this.shadowHalf;
    const sunMoved = L.angleTo(this.shadowSun);
    const needs = near || moved > half * 0.04 || resized > 0.06 || sunMoved > 0.001;
    if (!needs) return;
    this.shadowCentre.copy(centre);
    this.shadowHalf = half;
    this.shadowSun.copy(L);
    const reach = half + 1500;
    this.sun.position.copy(centre).addScaledVector(L, reach);
    this.sun.target.position.copy(centre);
    this.sun.target.updateMatrixWorld();
    const sc = sh.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = reach * 2;
    sc.updateProjectionMatrix();
    sh.normalBias = Math.max(0.04, texel * 0.9);
    sh.bias = near ? -0.0004 : -0.0002;
    sh.needsUpdate = true;
  }

  updateLighting(sunDir: Vector3, focus: Vector3, viewerAlt: number, dt: number): void {
    this.atmosphere.setSun(sunDir);
    const baked = this.atmosphere.update(this.renderer, viewerAlt);
    const a = this.atmosphere;
    const night = atmoUniforms.uAtmoNight!.value as number;
    this.sun.color.copy(a.sunColor);
    this.sun.intensity = T.sky.sunIntensity * (1 - night * 0.98);
    // Moonlight keeps nights readable.
    if (night > 0.5) {
      this.sun.color.setRGB(0.55, 0.62, 0.85);
      this.sun.intensity = 0.25 * night;
    }
    const lightDir = (night > 0.5 ? sunDir.clone().negate() : sunDir.clone());
    if (lightDir.y < 0.05) lightDir.setY(0.05).normalize();
    this.updateShadowFrustum(lightDir, focus, viewerAlt);
    this.sunTarget.copy(focus);
    this.ambient.color.setRGB(0.02, 0.025, 0.04);
    this.ambient.intensity = night;

    this.envCooldown -= dt;
    if ((baked || this.envVersion < 0) && (this.envCooldown <= 0 || this.envVersion < 0)) {
      this.refreshEnv();
    }
  }

  refreshEnv(): void {
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.skyScene, 0, 0.1, 1000);
    this.scene.environment = this.envRT.texture as Texture;
    this.scene.environmentIntensity = 1.0;
    old?.dispose();
    this.envVersion = this.atmosphere.version;
    this.envCooldown = 1.5;
  }

  /** Background colour helper for UI that wants to match the sky. */
  horizonColor(out: Color): Color {
    return out.copy(this.atmosphere.skyHorizon);
  }

  render(dt: number): void {
    const t0 = performance.now();
    const viewInv = atmoUniforms.uAtmoViewInv!.value;
    this.camera.updateMatrixWorld();
    viewInv.copy(this.camera.matrixWorld);
    this.renderer.info.reset();
    this.composer.render(dt);
    this.lastStats = {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      frameMs: performance.now() - t0,
    };
  }

  /**
   * Top-down orthographic "satellite" render of the scene for the map (north up). Renders linear HDR to a
   * half-float target and tone-maps on the CPU, so no material recompiles; fog, sky and `hide` objects
   * are switched off for the shot.
   */
  renderTopDown(cx: number, cz: number, half: number, size: number, hide: Object3D[]): HTMLCanvasElement {
    const px = Math.max(256, Math.min(2048, Math.floor(size)));
    const rt = new WebGLRenderTarget(px, px, { type: HalfFloatType, samples: 4, depthBuffer: true });
    const cam = new OrthographicCamera(-half, half, half, -half, 100, 20000);
    cam.position.set(cx, 9000, cz);
    cam.up.set(0, 0, -1);
    cam.lookAt(cx, 0, cz);
    cam.updateMatrixWorld();
    const fog = atmoUniforms.uAtmoFogDensity!.value as number;
    atmoUniforms.uAtmoFogDensity!.value = 0;
    const was = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const skyWas = this.sky.visible;
    this.sky.visible = false;
    const bg = this.scene.background;
    this.scene.background = null;
    const r = this.renderer;
    const prevClear = r.getClearColor(new Color());
    const prevAlpha = r.getClearAlpha();
    r.setClearColor(new Color(0.03, 0.09, 0.15), 1);
    r.setRenderTarget(rt);
    r.clear();
    r.render(this.scene, cam);
    const buf = new Uint16Array(px * px * 4);
    r.readRenderTargetPixels(rt, 0, 0, px, px, buf);
    r.setRenderTarget(null);
    r.setClearColor(prevClear, prevAlpha);
    this.scene.background = bg;
    this.sky.visible = skyWas;
    hide.forEach((o, i) => (o.visible = was[i]!));
    atmoUniforms.uAtmoFogDensity!.value = fog;
    rt.dispose();
    // ACES (Narkowicz) + sRGB, flipped to image rows.
    const out = document.createElement('canvas');
    out.width = out.height = px;
    const ctx = out.getContext('2d')!;
    const img = ctx.createImageData(px, px);
    const d = img.data;
    const exposure = 0.9;
    const tm = (x: number) => {
      const v = Math.max(0, x * exposure);
      const a = (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14);
      const c = Math.min(1, Math.max(0, a));
      return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
    };
    for (let y = 0; y < px; y++) {
      const src = (px - 1 - y) * px * 4;
      const dst = y * px * 4;
      for (let x = 0; x < px; x++) {
        const s = src + x * 4;
        const o = dst + x * 4;
        d[o] = tm(DataUtils.fromHalfFloat(buf[s]!));
        d[o + 1] = tm(DataUtils.fromHalfFloat(buf[s + 1]!));
        d[o + 2] = tm(DataUtils.fromHalfFloat(buf[s + 2]!));
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return out;
  }

  dispose(): void {
    this.composer.dispose();
    this.renderer.dispose();
  }
}
