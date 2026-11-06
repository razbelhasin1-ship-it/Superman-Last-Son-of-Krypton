/**
 * Game orchestrator: owns the loop, renderer, world, hero, camera, FX, UI and QA hook.
 * Fixed 60 Hz simulation (`step`) + interpolated rendering (`frame`).
 */
import { Matrix4, Vector3 } from 'three';
import type { GameEventMap, PowersHost, PowersSystem, StatsSnapshot, WorldLike } from '../contracts.ts';
import { EventBus } from '../core/events.ts';
import { FixedLoop } from '../core/loop.ts';
import { Input, VirtualPad, emptyFrame, type InputFrame } from '../core/input.ts';
import type { BootParams } from '../core/params.ts';
import { Rng } from '../core/rng.ts';
import { HeroController } from '../flight/HeroController.ts';
import { HeroVisual } from '../hero/HeroVisual.ts';
import { CameraRig } from '../camera/CameraRig.ts';
import { RenderSystem, type QualityName } from '../render/RenderSystem.ts';
import { AutoQuality } from '../render/AutoQuality.ts';
import { atmoUniforms, sunDirectionForHour } from '../render/atmosphere.ts';
import { CloudDeck } from '../render/clouds/CloudDeck.ts';
import { TestGround } from '../world/TestGround.ts';
import { FxDirector } from '../fx/FxDirector.ts';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { Hud } from '../ui/Hud.ts';
import { loadSettings, saveSettings, type Settings } from '../ui/settings.ts';
import { installQaHook, type QaApi, type TeleportTarget } from '../qa/hook.ts';
import { SCRIPTS, resetScriptState, type FlightScript, type ScriptHost } from '../qa/scripts.ts';
import { DebugPanel } from '../debug/DebugPanel.ts';
import { DofEffect, GradeEffect } from '../fx/CinemaEffects.ts';
import { Menu } from '../ui/Menu.ts';
import { MapView } from '../ui/MapView.ts';
import { PhotoPanel, type PhotoValues } from '../ui/PhotoPanel.ts';
import { PhotoMode } from '../camera/PhotoMode.ts';
import { frontPage, type PaperState } from '../ui/headlines.ts';
import { IntroDirector } from '../intro/IntroDirector.ts';
import { T } from '../tuning.ts';
import { clamp, expFactor } from '../core/math.ts';

export type GameState = 'boot' | 'menu' | 'intro' | 'play' | 'paused' | 'photo' | 'gallery';

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
  /** Every hope/collateral change, for the results card and the Daily Planet. */
  readonly deeds: { t: number; kind: 'hope' | 'collateral'; amount: number; reason: string }[] = [];
  /** World time runs slower than the hero's during focus / the power wheel. */
  worldTimeScale = 1;
  private worldTimeTarget = 1;
  worldTime = 0;
  powers: PowersSystem | null = null;
  readonly run = { topSpeed: 0, distance: 0, booms: 0, flightTime: 0 };
  private readonly discovered = new Set<string>();
  private districtSlug = '';
  private districtCandidate = '';
  private districtHold = 0;
  private worldCheckT = 0;
  private lastHudTime = 0;
  private lastFxTime = 0;
  readonly dof = new DofEffect();
  readonly grade = new GradeEffect();
  readonly menu: Menu | null;
  readonly intro: IntroDirector;
  readonly pauseMenu: Menu;
  readonly photo: PhotoMode;
  readonly photoPanel: PhotoPanel;
  readonly mapView: MapView;
  /** Results of finished incidents, newest first (the life module reports them). */
  readonly incidentLog: { headline: string; saved: number }[] = [];
  private mapFrom: 'play' | 'paused' = 'play';
  private readonly aimBeforePhoto = { yaw: 0, pitch: 0 };
  /** Ignore the pause key briefly after leaving a menu (the Esc that closed it is still queued). */
  private menuCooldown = 0;
  private hudWasVisible = true;
  day = 1;
  /** Present when the graphics preset is "auto" (spec 12.1 quality scaler). */
  readonly autoQuality: AutoQuality | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    ui: HTMLDivElement,
    params: BootParams,
    ext: { settings?: Settings; menu?: Menu | null } = {},
  ) {
    this.canvas = canvas;
    this.ui = ui;
    this.params = params;
    this.settings = ext.settings ?? loadSettings();
    this.ready = new Promise((r) => (this.readyResolve = r));
    const q = params.quality ?? (this.settings.graphics === 'auto' ? 'high' : this.settings.graphics);
    const quality: QualityName = q === 'auto' ? 'high' : q;
    this.render = new RenderSystem(canvas, quality, { preserveDrawingBuffer: params.qa });
    if (this.settings.graphics === 'auto' && !params.quality && !params.qa) {
      const aq = new AutoQuality(quality);
      aq.onChange = (preset) => {
        if (preset !== this.render.quality.name) this.render.setQuality(preset);
        this.onResize();
      };
      this.autoQuality = aq;
    }
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
    this.render.addPreEffect('dof', this.dof);
    this.render.setPreEffectEnabled('dof', false);
    this.render.addGrade(this.grade);

    this.hud = new Hud(ui);
    this.fx.onHint = (id, text) => this.hud.hint(id, text, 5);
    this.fx.onCollateral = (a, reason) => this.addCollateral(a, reason ?? 'boom');
    this.events.on('sonicBoom', () => this.run.booms++);
    this.intro = new IntroDirector({
      hero: this.hero,
      visual: this.visual,
      rig: this.rig,
      clouds: this.clouds,
      hud: this.hud,
      fx: this.fx,
      dof: this.dof,
      audio: this.audio,
      setDofEnabled: (on) => this.render.setPreEffectEnabled('dof', on),
      onControl: () => {
        this.input.virtual = null;
        this.input.enabled = true;
      },
      subtitlesOn: () => this.settings.subtitles,
    });
    this.menu = ext.menu !== undefined ? ext.menu : null;
    this.pauseMenu = this.menu ?? new Menu(ui, this.settings, { onPlay: () => this.beginIntro(), onSettingsChanged: () => this.saveSettings() });
    this.pauseMenu.setHooks({
      onResume: () => this.resume(),
      onPhoto: () => this.enterPhoto(),
      onMap: () => this.openMap('paused'),
      onQuit: () => this.quitToTitle(),
    });
    this.photo = new PhotoMode(canvas, this.world.collision);
    this.photoPanel = new PhotoPanel(ui, { onChange: (v) => this.applyPhotoValues(v), onExit: () => this.exitPhoto() });
    this.mapView = new MapView(ui);
    this.mapView.onClose = () => this.onMapClosed();
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'play' && !this.params.qa) this.pause();
    });
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
    // Graphics preset / resolution changes apply live.
    const g = this.settings.graphics;
    if (g !== 'auto' && g !== this.render.quality.name) this.render.setQuality(g);
    this.onResize();
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
    const p = this.params;
    if (p.play || (p.qa && !p.menu && !p.intro)) {
      this.state = 'play';
      this.hud.setFade(1);
      this.rig.step(1 / 60, this.hero);
      this.rig.frame(1);
    } else {
      this.intro.placeHero();
      this.hud.setFade(0);
      if (p.intro) this.beginIntro();
      else {
        this.state = 'menu';
        if (this.menu && !this.menu.isVisible) this.menu.show();
        this.input.enabled = false;
      }
    }
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
        if (this.state === 'play' || this.state === 'intro') this.autoQuality?.update(dt);
        this.loop.frame(dt);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  /** PLAY pressed (or ?intro): run the Play sequence from its first frame. */
  beginIntro(): void {
    this.audio.unlock();
    if (!this.params.qa) this.input.requestPointerLock();
    const fromMenu = this.state === 'menu';
    this.state = 'intro';
    this.intro.startIntro(fromMenu);
    this.input.enabled = true;
    this.input.virtual = null;
  }

  private onResize(): void {
    this.render.resize(window.innerWidth, window.innerHeight, this.settings.resolutionScale * (this.autoQuality?.scale ?? 1));
  }

  // ───────────────────────────────────────────────────────────── simulation step

  private step(dt: number): void {
    if (this.state === 'paused') {
      this.input.sample(dt, this.frameIn);
      return;
    }
    if (this.state === 'photo') {
      this.input.sample(dt, this.frameIn);
      if (this.frameIn.pressed.has('photo') || this.frameIn.pressed.has('pause')) {
        this.exitPhoto();
        return;
      }
      this.photo.step(dt, this.frameIn);
      this.photo.apply(this.rig);
      this.rig.step(dt, this.hero);
      return;
    }
    if (this.hitstop > 0) {
      // Hit-stop: freeze the world and the hero for a couple of frames; the camera keeps shaking.
      this.hitstop--;
      return;
    }
    this.time += dt;
    this.worldTimeScale += (this.worldTimeTarget - this.worldTimeScale) * expFactor(14, dt);
    const wdt = dt * this.worldTimeScale;
    this.worldTime += wdt;
    if (this.script) {
      const t = this.scriptSteps * dt;
      this.script.tick(this.scriptHost, t, dt);
      this.scriptSteps++;
    }
    this.input.sample(dt, this.frameIn);
    if (this.state === 'menu') {
      this.intro.stepMenu(dt);
      this.fx.step(dt);
      return;
    }
    if (this.state === 'intro') {
      const done = this.intro.stepIntro(dt, this.frameIn);
      if (this.intro.t >= 13.4) {
        // Control is live during the blend.
        this.hero.step(this.frameIn, this.rig, dt);
        this.visual.step(this.hero, dt);
        this.rig.step(dt, this.hero);
      }
      this.prevViewProj.copy(this.stepViewProj);
      this.stepViewProjFromRig();
      this.havePrevVP = true;
      this.fx.step(dt);
      if (done) this.state = 'play';
      return;
    }
    if (this.menuCooldown > 0) this.menuCooldown -= dt;
    if (this.state === 'play' && !this.script) {
      const f = this.frameIn.pressed;
      if (f.has('pause') && this.menuCooldown <= 0) return this.pause();
      if (f.has('photo')) return this.enterPhoto();
      if (f.has('map')) return this.openMap('play');
    }
    if (this.state === 'play') {
      this.hero.step(this.frameIn, this.rig, dt);
      this.powers?.step(dt, wdt, this.frameIn);
      this.run.topSpeed = Math.max(this.run.topSpeed, this.hero.speed);
      if (this.hero.mode !== 'ground') {
        this.run.distance += this.hero.speed * dt;
        this.run.flightTime += dt;
      }
    }
    this.visual.step(this.hero, dt);
    this.rig.step(dt, this.hero);
    // View-projection one step ago (for frame-rate independent motion blur).
    this.prevViewProj.copy(this.stepViewProj);
    this.stepViewProjFromRig();
    this.havePrevVP = true;
    this.fx.step(dt);
    if (T.sky.timeFlows && !this.params.qa) {
      const h = this.hour + wdt * (24 / (T.sky.dayMinutes * 60));
      if (h >= 24) this.day++;
      this.hour = h % 24;
    }
    if (this.hero.mode === 'flight' && this.hero.dir.y < -0.5 && this.hero.speed > 60 && this.hero.altitude > 400) {
      this.hud.hint('pullup', 'Pull up — S / Space to level out', 4);
    }
  }

  /** Forget the previous camera (teleports/cuts) so motion blur doesn't smear across the cut. */
  resetMotionHistory(): void {
    this.stepViewProjFromRig();
    this.prevViewProj.copy(this.stepViewProj);
    this.havePrevVP = true;
    this.lastFxTime = this.worldTime;
    this.lastHudTime = this.time;
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
    if ((this.state === 'play' || (this.state === 'intro' && this.intro.t >= 13.4)) && !this.script) {
      const look = this.input.consumeLook(frameDt, T.camera.padYawRate, T.camera.padPitchRate, T.camera.mouseSensitivity);
      this.rig.addLook(look.dx, look.dy);
    }
    this.visual.frame(alpha);
    this.rig.frame(alpha);
    const cam = this.render.camera;
    this.world.update(cam.position, this.hero.pos, this.hero.vel, frameDt * this.worldTimeScale, this.worldTime);
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
    // Particles and other world FX follow *world* time (they hang in the air during focus).
    const fxDt = clamp(this.worldTime - this.lastFxTime, 0, 0.5);
    this.lastFxTime = this.worldTime;
    const hudDt = clamp(this.time - this.lastHudTime, 0, 0.5);
    this.lastHudTime = this.time;
    this.fx.frame(fxDt, cam, this.havePrevVP ? this.prevViewProj : null, night);
    this.powers?.frame(hudDt);
    this.render.sky.setTime(this.time);
    if (this.state === 'photo') this.photoDof();
    this.render.vignette.darkness = T.fx.vignetteBase + T.fx.vignetteSpeed * Math.min(1, this.hero.speed / 2400);
    this.render.render(frameDt);
    if (this.state === 'play' || this.state === 'intro') {
      this.hud.update(
        hudDt,
        this.hero.speed,
        this.hero.effTier,
        this.hero.tier,
        this.hero.altitude,
        this.hero.burstTime / T.flight.burstMax,
        this.hero.burstCooldown,
      );
      this.hud.updateCompass(this.rig.yaw, this.hero.pos.x, this.hero.pos.z);
      this.hud.setMeters(this.hope, this.collateral);
      this.hud.setIdle(this.state === 'play' && this.hero.idleTime > T.hud.idleFadeAfter ? 1 : 0);
      if (this.state === 'play') this.checkPlaces(hudDt);
    }
    if (this.debug) {
      const s = this.render.lastStats;
      this.debug.setStats(
        `fps ${this.fps.toFixed(0)}  calls ${s.drawCalls}  tris ${(s.triangles / 1e6).toFixed(2)}M\n` +
          `mode ${this.hero.mode}  ${(this.hero.speed * 3.6).toFixed(0)} km/h  tier ${this.hero.effTier}  alt ${this.hero.altitude.toFixed(0)} m\n` +
          `clouds ${this.clouds.visibleCount}  mist ${this.fx.mist01.toFixed(2)}`,
      );
    }
  }

  // ───────────────────────────────────────────────────────────── pause · photo · map

  paperState(): PaperState {
    return {
      day: this.day,
      hour: this.hour,
      hope: this.hope,
      collateral: this.collateral,
      saves: this.incidentLog.reduce((n, i) => n + i.saved, 0),
      booms: this.run.booms,
      topSpeed: this.run.topSpeed,
      distanceKm: this.run.distance / 1000,
      discoveries: this.discovered.size,
      incidents: this.incidentLog,
    };
  }

  private hideHud(): void {
    this.hudWasVisible = this.hud.visible;
    this.hud.setVisible(false);
  }

  private restoreHud(): void {
    this.hud.setVisible(this.hudWasVisible);
  }

  /** Blurred, frozen game behind the pause menu / map. */
  private setBackdropBlur(on: boolean): void {
    this.render.setPreEffectEnabled('dof', on);
    if (on) {
      this.dof.set('uFocusDist', 0.3);
      this.dof.set('uFocusRange', 0.1);
      this.dof.set('uMaxBlur', 0.006);
      this.dof.set('uNearBlur', 0);
      this.dof.set('uAmount', 1);
    }
  }

  pause(): void {
    if (this.state !== 'play' && this.state !== 'paused') return;
    const wasPlaying = this.state === 'play';
    this.state = 'paused';
    this.input.enabled = false;
    this.input.releaseAll();
    if (document.pointerLockElement) document.exitPointerLock();
    if (wasPlaying) this.hideHud();
    this.setBackdropBlur(true);
    this.pauseMenu.showPause({ page: frontPage(this.paperState(), this.params.seed), hope: this.hope, collateral: this.collateral });
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.pauseMenu.hide();
    this.state = 'play';
    this.setBackdropBlur(false);
    this.restoreHud();
    this.input.releaseAll();
    this.input.clearPending();
    this.input.enabled = true;
    this.menuCooldown = 0.3;
    if (!this.params.qa) this.input.requestPointerLock();
  }

  enterPhoto(): void {
    if (this.state !== 'play' && this.state !== 'paused') return;
    if (this.state === 'play') this.hideHud();
    this.pauseMenu.hide();
    this.state = 'photo';
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.releaseAll();
    this.input.enabled = true;
    this.aimBeforePhoto.yaw = this.rig.yaw;
    this.aimBeforePhoto.pitch = this.rig.pitch;
    const cam = this.render.camera;
    const dir = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.photo.enter(cam.position, dir, cam.fov, this.visual.root.position);
    this.photoPanel.sync({ fov: this.photo.fov, roll: 0, hour: this.hour, autoFocus: true, aperture: this.photo.aperture, filter: 'natural' });
    this.photoPanel.show();
    this.render.setPreEffectEnabled('dof', true);
  }

  exitPhoto(): void {
    if (this.state !== 'photo') return;
    this.photo.exit();
    this.photoPanel.hide();
    this.grade.applyFilter('natural');
    this.render.setPreEffectEnabled('dof', false);
    this.state = 'play';
    this.rig.blendToChase(0.45, this.hero);
    // Back to the aim the player had, not wherever the photo camera looked.
    this.rig.yaw = this.aimBeforePhoto.yaw;
    this.rig.pitch = this.aimBeforePhoto.pitch;
    this.restoreHud();
    this.input.releaseAll();
    this.input.clearPending();
    this.menuCooldown = 0.3;
    if (!this.params.qa) this.input.requestPointerLock();
  }

  private applyPhotoValues(v: PhotoValues): void {
    this.photo.fov = v.fov;
    this.photo.roll = (v.roll * Math.PI) / 180;
    this.photo.aperture = v.aperture;
    this.photo.autoFocus = v.autoFocus;
    this.photo.focusDist = v.focusDist;
    if (Math.abs(v.hour - this.hour) > 1e-3) {
      this.hour = v.hour;
      this.render.atmosphere.dirty = true;
    }
    this.grade.applyFilter(v.filter);
  }

  private photoDof(): void {
    const f = this.photo.focus;
    const a = this.photo.aperture;
    this.dof.set('uFocusDist', f);
    this.dof.set('uFocusRange', Math.max(0.5, f * 0.12));
    this.dof.set('uMaxBlur', 0.014 * a);
    this.dof.set('uNearBlur', 0.7);
    this.dof.set('uAmount', a > 0.01 ? 1 : 0);
  }

  /** Map extent: the whole city incl. Stryker's Island (spec 9.1). */
  private static readonly MAP = { cx: 700, cz: 0, half: 6400 };

  openMap(from: 'play' | 'paused'): void {
    if (from === 'play') {
      if (this.state !== 'play') return;
      this.state = 'paused';
      this.hideHud();
      this.input.enabled = false;
      this.input.releaseAll();
      if (document.pointerLockElement) document.exitPointerLock();
    }
    this.mapFrom = from;
    this.pauseMenu.hide();
    this.setBackdropBlur(true);
    const m = Game.MAP;
    const px = Math.min(1600, Math.min(window.innerWidth, window.innerHeight) * Math.min(2, window.devicePixelRatio || 1));
    const img = this.render.renderTopDown(m.cx, m.cz, m.half, px, [this.clouds.mesh, this.fx.group, this.visual.root]);
    this.mapView.show(img, m, {
      landmarks: this.world.landmarks ?? [],
      districts: this.world.districts ?? [],
      discovered: this.discovered,
      hero: { x: this.hero.pos.x, z: this.hero.pos.z, heading: this.hero.heading },
      incidents: [],
    });
  }

  private onMapClosed(): void {
    if (this.mapFrom === 'paused') this.pause();
    else this.resume();
  }

  quitToTitle(): void {
    this.pauseMenu.hide();
    this.mapView.close();
    this.photo.exit();
    this.photoPanel.hide();
    this.setBackdropBlur(false);
    this.grade.applyFilter('natural');
    this.worldTimeTarget = this.worldTimeScale = 1;
    this.hud.setFade(0);
    this.restoreHud();
    this.input.enabled = false;
    this.input.releaseAll();
    if (document.pointerLockElement) document.exitPointerLock();
    this.intro.placeHero();
    this.state = 'menu';
    this.pauseMenu.show();
  }

  // ───────────────────────────────────────────────────────────── powers host

  /** Slow the world (focus 0.15, power wheel 0.2); the hero keeps full speed. Eased, never snaps. */
  setWorldTimeScale(scale: number): void {
    this.worldTimeTarget = clamp(scale, 0.02, 1);
  }

  addHope(amount: number, reason: string): void {
    if (!(amount > 0)) return;
    this.hope += amount;
    this.deeds.push({ t: this.time, kind: 'hope', amount, reason });
  }

  addCollateral(amount: number, reason: string): void {
    if (!(amount > 0)) return;
    this.collateral += amount;
    this.deeds.push({ t: this.time, kind: 'collateral', amount, reason });
  }

  /** The adapter handed to `createPowers(host)` (src/powers/). */
  get powersHost(): PowersHost {
    const g = this;
    return {
      hero: g.hero,
      visual: g.visual,
      rig: g.rig,
      camera: g.render.camera,
      scene: g.render.scene,
      events: g.events,
      world: g.world,
      fx: g.fx,
      audio: g.audio,
      hud: g.hud,
      setWorldTimeScale: (s) => g.setWorldTimeScale(s),
      time: () => g.time,
      addHope: (a, r) => g.addHope(a, r),
      addCollateral: (a, r) => g.addCollateral(a, r),
    };
  }

  attachPowers(system: PowersSystem): void {
    this.powers?.dispose?.();
    this.powers = system;
  }

  // ───────────────────────────────────────────────────────────── places (discovery, districts, compass)

  private checkPlaces(dt: number): void {
    this.worldCheckT -= dt;
    if (this.worldCheckT > 0) return;
    this.worldCheckT = 0.25;
    const h = this.hero.pos;
    const lms = this.world.landmarks;
    if (lms && lms.length) {
      // Discovery: inside the landmark's radius (or above it within its height + 150 m).
      for (const lm of lms) {
        if (this.discovered.has(lm.slug)) continue;
        const d = Math.hypot(h.x - lm.x, h.z - lm.z);
        if (d < lm.radius && h.y < lm.height + 400) {
          this.discovered.add(lm.slug);
          this.hud.discovery(lm.name, lm.blurb ?? '', this.discovered.size, lms.length);
          this.audio.whoosh(0.25, 0, 0.5);
        }
      }
      // Compass: the eight nearest undiscovered landmarks.
      const near = lms
        .filter((l) => !this.discovered.has(l.slug))
        .map((l) => ({ l, d: Math.hypot(h.x - l.x, h.z - l.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 8);
      this.hud.clearCompassMarkers('landmark');
      for (const { l } of near) this.hud.setCompassMarker({ id: `lm:${l.slug}`, x: l.x, z: l.z, kind: 'landmark', label: l.name });
    }
    const dist = this.world.districtAt?.(h.x, h.z) ?? null;
    const slug = dist?.slug ?? '';
    if (slug !== this.districtCandidate) {
      this.districtCandidate = slug;
      this.districtHold = 0;
    } else this.districtHold += 0.25;
    if (dist && slug !== this.districtSlug && this.districtHold >= 0.75 && this.hero.altitude < 1200) {
      this.districtSlug = slug;
      this.hud.banner(`${dist.tier} — ${dist.name}`);
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
      clearClouds: (x, z, r) => g.clouds.clearAround(x, z, r),
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
