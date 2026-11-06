/**
 * Game orchestrator: owns the loop, renderer, world, hero, camera, FX, UI and QA hook.
 * Fixed 60 Hz simulation (`step`) + interpolated rendering (`frame`).
 */
import { Vector3 } from 'three';
import type { GameEventMap, StatsSnapshot } from '../contracts.ts';
import { EventBus } from '../core/events.ts';
import { FixedLoop } from '../core/loop.ts';
import { Input, emptyFrame, type InputFrame } from '../core/input.ts';
import type { BootParams } from '../core/params.ts';
import { HeroController } from '../flight/HeroController.ts';
import { RenderSystem, type QualityName } from '../render/RenderSystem.ts';
import { sunDirectionForHour } from '../render/atmosphere.ts';
import { TestGround, type WorldLike } from '../world/TestGround.ts';
import { installQaHook, type QaApi, type TeleportTarget } from '../qa/hook.ts';
import { DebugPanel } from '../debug/DebugPanel.ts';
import { T } from '../tuning.ts';

export class Game {
  readonly params: BootParams;
  readonly events = new EventBus<GameEventMap>();
  readonly input: Input;
  readonly render: RenderSystem;
  readonly loop: FixedLoop;
  readonly world: WorldLike;
  readonly hero: HeroController;
  readonly ui: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly frameIn: InputFrame = emptyFrame();
  readonly camAim = { yaw: 0, pitch: 0 };
  hour = T.sky.hour;
  time = 0;
  private debug: DebugPanel | null = null;
  private lastFrameTime = 0;
  private fps = 60;
  private readyResolve!: () => void;
  readonly ready: Promise<void>;
  private readonly sunDir = new Vector3();
  private qaErrors: string[] = [];

  constructor(canvas: HTMLCanvasElement, ui: HTMLDivElement, params: BootParams) {
    this.canvas = canvas;
    this.ui = ui;
    this.params = params;
    this.ready = new Promise((r) => (this.readyResolve = r));
    const quality: QualityName = params.quality && params.quality !== 'auto' ? params.quality : 'high';
    this.render = new RenderSystem(canvas, quality, { preserveDrawingBuffer: params.qa });
    this.input = new Input(canvas);
    this.world = new TestGround(params.seed);
    this.render.scene.add(this.world.group);
    this.hero = new HeroController(this.world.collision, this.events);
    this.hero.spawnGround(new Vector3(0, 0, 0), 0);
    this.loop = new FixedLoop(
      (dt) => this.step(dt),
      (alpha, frameDt) => this.frame(alpha, frameDt),
    );
    if (params.debug) this.debug = new DebugPanel();
    this.installQa();
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  async start(): Promise<void> {
    this.time = 0;
    this.updateLighting(0);
    // Warm up: compile shaders and bake the sky before the first visible frame.
    this.render.renderer.compile(this.render.scene, this.render.camera);
    this.frame(0, 1 / 60);
    this.readyResolve();
    if (!this.params.qa) {
      this.lastFrameTime = performance.now();
      const tick = (now: number) => {
        const dt = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
        this.loop.frame(dt);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  private onResize(): void {
    this.render.resize(window.innerWidth, window.innerHeight);
  }

  private step(dt: number): void {
    this.time += dt;
    this.input.sample(dt, this.frameIn);
    this.hero.step(this.frameIn, this.camAim, dt);
    if (T.sky.timeFlows && !this.params.qa) this.hour = (this.hour + dt * (24 / (T.sky.dayMinutes * 60))) % 24;
  }

  private updateLighting(dt: number): void {
    sunDirectionForHour(this.hour, this.sunDir);
    const cam = this.render.camera.position;
    this.render.updateLighting(this.sunDir, this.hero.pos, Math.max(0, cam.y), dt);
  }

  private frame(_alpha: number, frameDt: number): void {
    const cam = this.render.camera;
    // Gate-0 placeholder view: look north up the street canyon from behind the spawn.
    cam.position.set(0, 28, 70);
    cam.lookAt(0, 60, -600);
    cam.fov = 62;
    cam.updateProjectionMatrix();
    this.world.update(cam.position, this.hero.pos, this.hero.vel, frameDt, this.time);
    this.updateLighting(frameDt);
    this.render.render(frameDt);
    if (this.debug) {
      const s = this.render.lastStats;
      this.debug.setStats(`fps ${this.fps.toFixed(0)}  calls ${s.drawCalls}  tris ${(s.triangles / 1e6).toFixed(2)}M`);
    }
  }

  stats(): StatsSnapshot {
    const s = this.render.lastStats;
    return {
      drawCalls: s.drawCalls,
      triangles: s.triangles,
      frameMs: s.frameMs,
      activeChunks: this.world.activeChunks(),
      fps: this.fps,
      heroSpeed: this.hero.speed,
      heroAlt: this.hero.altitude,
      tier: this.hero.effTier,
    };
  }

  private installQa(): void {
    const game = this;
    const api: QaApi = {
      ready: this.ready,
      whenStreamed: () => Promise.resolve(),
      advance(seconds: number) {
        game.loop.advance(seconds);
      },
      renderFrame() {
        game.frame(0, 1 / 60);
      },
      stats: () => game.stats(),
      setTime(hour: number) {
        game.hour = hour;
        game.render.atmosphere.dirty = true;
      },
      setWeather(_name: string) {},
      setThrottle(tier: number) {
        game.hero.tier = Math.max(0, Math.min(5, tier));
      },
      setHeroState(_name: string) {},
      teleport(target: string | TeleportTarget) {
        if (typeof target === 'string') return;
        game.hero.spawnFlying(new Vector3(target.x, target.y, target.z), new Vector3(0, 0, -1), 0);
        if (target.yaw !== undefined) game.camAim.yaw = target.yaw;
        if (target.pitch !== undefined) game.camAim.pitch = target.pitch;
      },
      runScript: () => ({ duration: 0, captureHz: 5 }),
      scriptDone: () => true,
      scriptNames: () => [],
      scriptLog: () => [],
      errors: this.qaErrors,
      _render: this.render,
    };
    installQaHook(api);
  }
}
