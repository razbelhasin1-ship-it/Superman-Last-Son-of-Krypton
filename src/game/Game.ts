/**
 * Game orchestrator: owns the loop, renderer, world, hero, camera, FX, UI and QA hook.
 * Fixed 60 Hz simulation (`step`) + interpolated rendering (`frame`).
 */
import { Matrix4, Vector3 } from 'three';
import type { GameEventMap, StatsSnapshot } from '../contracts.ts';
import { EventBus } from '../core/events.ts';
import { FixedLoop } from '../core/loop.ts';
import { Input, VirtualPad, emptyFrame, type InputFrame } from '../core/input.ts';
import type { BootParams } from '../core/params.ts';
import { Rng } from '../core/rng.ts';
import { HeroController } from '../flight/HeroController.ts';
import { HeroVisual } from '../hero/HeroVisual.ts';
import { CameraRig } from '../camera/CameraRig.ts';
import { RenderSystem, type QualityName } from '../render/RenderSystem.ts';
import { atmoUniforms, sunDirectionForHour } from '../render/atmosphere.ts';
import { CloudDeck } from '../render/clouds/CloudDeck.ts';
import { TestGround, type WorldLike } from '../world/TestGround.ts';
import { FxDirector } from '../fx/FxDirector.ts';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { Hud } from '../ui/Hud.ts';
import { loadSettings, saveSettings, type Settings } from '../ui/settings.ts';
import { installQaHook, type QaApi, type TeleportTarget } from '../qa/hook.ts';
import { SCRIPTS, resetScriptState, type FlightScript, type ScriptHost } from '../qa/scripts.ts';
import { DebugPanel } from '../debug/DebugPanel.ts';
import { T } from '../tuning.ts';

export type GameState = 'boot' | 'menu' | 'intro' | 'play' | 'paused' | 'gallery';

export class Game {
  readonly params: BootParams;
  readonly events = new EventBus<GameEventMap>();
  readonly input: Input;
  readonly render: RenderSystem;
  readonly loop: FixedLoop;
  readonly world: WorldLike;
  readonly hero: HeroController;
  readonly visual: HeroVisual;
  readonly rig: CameraRig;
  readonly fx: FxDirector;
  readonly clouds: CloudDeck;
  readonly audio = new AudioEngine();
  readonly hud: Hud;
  readonly settings: Settings;
  readonly ui: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly frameIn: InputFrame = emptyFrame();
  state: GameState = 'boot';
  hour = T.sky.hour;
  time = 0;
  private debug: DebugPanel | null = null;
  private lastFrameTime = 0;
  private fps = 60;
  private readyResolve!: () => void;
  readonly ready: Promise<void>;
  private readonly sunDir = new Vector3();
  private qaErrors: string[] = [];
  private hitstop = 0;
  private readonly prevViewProj = new Matrix4();
  private readonly stepViewProj = new Matrix4();
  private havePrevVP = false;
  // QA scripting
  private readonly pad = new VirtualPad();
  private script: FlightScript | null = null;
  private scriptSteps = 0;
  private scriptLogLines: string[] = [];
  collateral = 0;
  hope = 0;
  private lastFxTime = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLDivElement, params: BootParams) {
    this.canvas = canvas;
    this.ui = ui;
    this.params = params;
    this.settings = loadSettings();
    this.ready = new Promise((r) => (this.readyResolve = r));
    const q = params.quality ?? (this.settings.graphics === 'auto' ? 'high' : this.settings.graphics);
    const quality: QualityName = q === 'auto' ? 'high' : q;
    this.render = new RenderSystem(canvas, quality, { preserveDrawingBuffer: params.qa });
    this.input = new Input(canvas);
    this.input.invertY = this.settings.invertY;
    this.input.sensitivity = this.settings.mouseSensitivity;
    this.world = new TestGround(params.seed);
    this.render.scene.add(this.world.group);

    this.hero = new HeroController(this.world.collision, this.events);
    this.hero.autoCruise = this.settings.autoCruise;
    this.visual = new HeroVisual();
    this.render.scene.add(this.visual.root);
    this.rig = new CameraRig(this.render.camera, this.world.collision);
    this.applyComfort();

    this.clouds = new CloudDeck(params.seed, { detail: this.render.quality.detail });
    this.render.scene.add(this.clouds.mesh);

    this.fx = new FxDirector(this.events, this.hero, this.rig, this.audio, this.visual, this.world.collision, this.settings);
    this.fx.clouds = this.clouds;
    this.render.scene.add(this.fx.group);
    this.render.addPreEffect('speed', this.fx.speedFx);

    this.hud = new Hud(ui);
    this.fx.onHint = (id, text) => this.hud.hint(id, text, 5);
    this.fx.onCollateral = (a) => (this.collateral += a);
    this.events.on('hitstop', ({ frames }) => (this.hitstop = Math.max(this.hitstop, frames)));
    this.events.on('shake', ({ amount }) => this.rig.addTrauma(amount));

    this.loop = new FixedLoop(
      (dt) => this.step(dt),
      (alpha, frameDt) => this.frame(alpha, frameDt),
    );
    if (params.debug) this.debug = new DebugPanel();
    this.installQa();
    window.addEventListener('resize', () => this.onResize());
    canvas.addEventListener('click', () => {
      this.audio.unlock();
      if (this.state === 'play') this.input.requestPointerLock();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') this.debug?.toggle();
      if (e.code === 'KeyU') this.hud.setVisible(!this.hud.visible);
    });
    this.onResize();
    this.spawnDefault();
  }

  private applyComfort(): void {
    this.rig.reducedShake = this.settings.reducedShake;
    this.rig.stableHorizon = this.settings.stableHorizon;
    this.rig.userFovOffset = this.settings.fovOffset;
  }

  saveSettings(): void {
    saveSettings(this.settings);
    this.input.invertY = this.settings.invertY;
    this.input.sensitivity = this.settings.mouseSensitivity;
    this.hero.autoCruise = this.settings.autoCruise;
    this.applyComfort();
    this.audio.volumes = { master: this.settings.masterVolume, music: this.settings.musicVolume, sfx: this.settings.sfxVolume };
    this.audio.applyVolumes();
  }

  private spawnDefault(): void {
    this.hero.spawnGround(new Vector3(0, 0, 30), 0);
    this.rig.yaw = 0;
    this.rig.pitch = -0.12;
    this.visual.snap(this.hero);
    this.rig.snapBehind(this.hero);
  }

  async start(): Promise<void> {
    this.time = 0;
    this.state = 'play';
    this.updateLighting(0);
    this.rig.step(1 / 60, this.hero);
    this.rig.frame(1);
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
    this.render.resize(window.innerWidth, window.innerHeight, this.settings.resolutionScale);
  }

  // ───────────────────────────────────────────────────────────── simulation step

  private step(dt: number): void {
    if (this.hitstop > 0) {
      // Hit-stop: freeze the world and the hero for a couple of frames; the camera keeps shaking.
      this.hitstop--;
      return;
    }
    this.time += dt;
    if (this.script) {
      const t = this.scriptSteps * dt;
      this.script.tick(this.scriptHost, t, dt);
      this.scriptSteps++;
    }
    this.input.sample(dt, this.frameIn);
    if (this.state === 'play') {
      if (this.frameIn.pressed.has('pause') && !this.params.qa) {
        /* menu arrives in gate 2 */
      }
      this.hero.step(this.frameIn, this.rig, dt);
    }
    this.visual.step(this.hero, dt);
    this.rig.step(dt, this.hero);
    // View-projection one step ago (for frame-rate independent motion blur).
    this.prevViewProj.copy(this.stepViewProj);
    this.stepViewProjFromRig();
    this.havePrevVP = true;
    this.fx.step(dt);
    if (T.sky.timeFlows && !this.params.qa) this.hour = (this.hour + dt * (24 / (T.sky.dayMinutes * 60))) % 24;
    if (this.hero.mode === 'flight' && this.hero.dir.y < -0.5 && this.hero.speed > 60 && this.hero.altitude > 400) {
      this.hud.hint('pullup', 'Pull up — S / Space to level out', 4);
    }
  }

  /** Forget the previous camera (teleports/cuts) so motion blur doesn't smear across the cut. */
  resetMotionHistory(): void {
    this.stepViewProjFromRig();
    this.prevViewProj.copy(this.stepViewProj);
    this.havePrevVP = true;
    this.lastFxTime = this.time;
  }

  private stepViewProjFromRig(): void {
    const cam = this.render.camera;
    // Approximate: use the rig's current (un-interpolated) state.
    this.rig.frame(1);
    cam.updateMatrixWorld();
    this.stepViewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  }

  private updateLighting(dt: number): void {
    sunDirectionForHour(this.hour, this.sunDir);
    const cam = this.render.camera.position;
    this.render.updateLighting(this.sunDir, this.visual.root.position, Math.max(0, cam.y), dt);
  }

  // ───────────────────────────────────────────────────────────── render frame

  private frame(alpha: number, frameDt: number): void {
    if (this.state === 'play' && !this.script) {
      const look = this.input.consumeLook(frameDt, T.camera.padYawRate, T.camera.padPitchRate, T.camera.mouseSensitivity);
      this.rig.addLook(look.dx, look.dy);
    }
    this.visual.frame(alpha);
    this.rig.frame(alpha);
    const cam = this.render.camera;
    this.world.update(cam.position, this.hero.pos, this.hero.vel, frameDt, this.time);
    this.updateLighting(frameDt);
    const night = atmoUniforms.uAtmoNight!.value as number;
    const a = this.render.atmosphere;
    this.clouds.update(
      cam,
      this.sunDir,
      new Vector3(a.sunColor.r, a.sunColor.g, a.sunColor.b).multiplyScalar(T.sky.sunIntensity / Math.PI),
      new Vector3(a.skyZenith.r, a.skyZenith.g, a.skyZenith.b),
      new Vector3(a.skyHorizon.r, a.skyHorizon.g, a.skyHorizon.b).multiplyScalar(0.55),
      night,
    );
    // FX timers advance by *simulation* time since the last rendered frame (identical in real-time
    // play; correct under virtual-time QA where many steps elapse between renders).
    const fxDt = Math.max(0, Math.min(0.5, this.time - this.lastFxTime));
    this.lastFxTime = this.time;
    this.fx.frame(fxDt, cam, this.havePrevVP ? this.prevViewProj : null, night);
    this.render.sky.setTime(this.time);
    this.render.vignette.darkness = T.fx.vignetteBase + T.fx.vignetteSpeed * Math.min(1, this.hero.speed / 2400);
    this.render.render(frameDt);
    this.hud.update(
      fxDt,
      this.hero.speed,
      this.hero.effTier,
      this.hero.tier,
      this.hero.altitude,
      this.hero.burstTime / T.flight.burstMax,
      this.hero.burstCooldown,
    );
    if (this.debug) {
      const s = this.render.lastStats;
      this.debug.setStats(
        `fps ${this.fps.toFixed(0)}  calls ${s.drawCalls}  tris ${(s.triangles / 1e6).toFixed(2)}M\n` +
          `mode ${this.hero.mode}  ${(this.hero.speed * 3.6).toFixed(0)} km/h  tier ${this.hero.effTier}  alt ${this.hero.altitude.toFixed(0)} m\n` +
          `clouds ${this.clouds.visibleCount}  mist ${this.fx.mist01.toFixed(2)}`,
      );
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

  // ───────────────────────────────────────────────────────────── QA

  private get scriptHost(): ScriptHost {
    const g = this;
    return {
      hero: g.hero,
      rig: g.rig,
      pad: g.pad,
      setHour: (h) => {
        g.hour = h;
        g.render.atmosphere.dirty = true;
      },
      spawnGround: (p, heading) => {
        g.hero.spawnGround(p, heading);
        g.visual.snap(g.hero);
        g.rig.snapBehind(g.hero);
        g.rig.prime(g.hero);
        g.resetMotionHistory();
      },
      spawnFlying: (p, dir, speed) => {
        g.hero.spawnFlying(p, dir, speed);
        g.visual.snap(g.hero);
        g.rig.snapBehind(g.hero);
        g.rig.prime(g.hero);
        g.resetMotionHistory();
      },
      addCloud: (x, base, z, size, height) => {
        g.clouds.addCloud(new Rng(`script-cloud-${x}-${z}`), x, base, z, size, height, 1);
        g.clouds.afterEdit();
      },
      log: (msg) => g.scriptLogLines.push(msg),
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
      setHeroState(name: string) {
        const p = game.hero.pos.clone();
        const tiers: Record<string, number> = { hover: 0, glide: 1, cruise: 2, dash: 3, supersonic: 4, bullet: 5 };
        if (name === 'ground') game.scriptHost.spawnGround(p, game.rig.yaw);
        else if (name in tiers) {
          const t = tiers[name]!;
          game.hero.tier = t;
          game.scriptHost.spawnFlying(p, new Vector3(Math.sin(game.rig.yaw), 0, -Math.cos(game.rig.yaw)), T.tiers[t]!.speed);
          game.pad.move(0, t > 0 ? 1 : 0);
          game.input.virtual = game.pad.frame;
        }
      },
      teleport(target: string | TeleportTarget) {
        if (typeof target === 'string') return;
        if (target.yaw !== undefined) game.rig.yaw = target.yaw;
        if (target.pitch !== undefined) game.rig.pitch = target.pitch;
        game.scriptHost.spawnFlying(new Vector3(target.x, target.y, target.z), new Vector3(Math.sin(game.rig.yaw), 0, -Math.cos(game.rig.yaw)), 0);
      },
      runScript(name: string) {
        const s = SCRIPTS.find((x) => x.name === name);
        if (!s) throw new Error(`unknown script ${name}`);
        resetScriptState();
        game.pad.clear();
        game.input.virtual = game.pad.frame;
        game.scriptLogLines = [];
        game.script = s;
        game.scriptSteps = 0;
        game.hitstop = 0;
        s.setup(game.scriptHost);
        game.rig.prime(game.hero);
        game.resetMotionHistory();
        game.input.virtual = game.pad.frame;
        return { duration: s.duration, captureHz: s.captureHz };
      },
      scriptDone: () => !game.script || game.scriptSteps * game.loop.dt >= game.script.duration,
      scriptNames: () => SCRIPTS.map((s) => s.name),
      scriptLog: () => [...game.scriptLogLines],
      errors: this.qaErrors,
      _render: this.render,
      _game: this,
    };
    installQaHook(api);
  }
}
