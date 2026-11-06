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
  type WebGLRenderTarget,
  Fog,
  AmbientLight,
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
    this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: T.fx.vignetteBase });
    this.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    this.noise.blendMode.opacity.value = 0.045;
    this.smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
    this.finalPass = new EffectPass(this.camera, this.bloom, this.toneMapping, this.vignette, this.noise);
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
    const lightDir = night > 0.5 ? sunDir.clone().negate() : sunDir;
    if (lightDir.y < 0.05) lightDir.setY(0.05).normalize();
    this.sun.position.copy(focus).addScaledVector(lightDir, 1500);
    this.sun.target.position.copy(focus);
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

  dispose(): void {
    this.composer.dispose();
    this.renderer.dispose();
  }
}
