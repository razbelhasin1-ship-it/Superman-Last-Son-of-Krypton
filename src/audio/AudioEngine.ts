/**
 * Procedural Web Audio engine (spec 12.3): no samples. Buses: master (limiter) → music, sfx,
 * ambience, ui. Unlocked on the Play click. Hero SFX are synthesised from noise and oscillators.
 */

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  amb!: GainNode;
  ui!: GainNode;
  private noiseBuf!: AudioBuffer;
  private wind: { src: AudioBufferSourceNode; bp: BiquadFilterNode; lp: BiquadFilterNode; g: GainNode; rumble: GainNode } | null = null;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  volumes = { master: 0.8, music: 0.6, sfx: 0.9 };
  muted = false;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state !== 'running') void this.ctx.resume();
      return;
    }
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.connect(limiter).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.amb = ctx.createGain();
    this.ui = ctx.createGain();
    for (const b of [this.sfx, this.music, this.amb, this.ui]) b.connect(this.master);
    // Noise buffer (2 s pink-ish).
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const w = (seed / 0x7fffffff) * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    // Synthesised street reverb IR.
    this.reverb = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const w = (seed / 0x7fffffff) * 2 - 1;
        ch[i] = w * Math.pow(1 - i / irLen, 3.2) * (i < 200 ? i / 200 : 1);
      }
    }
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.0;
    this.reverbSend.connect(this.reverb).connect(this.sfx);
    this.applyVolumes();
    this.startWind();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.05);
    this.music.gain.setTargetAtTime(this.volumes.music, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(this.volumes.sfx * 0.8, t, 0.05);
  }

  private noise(loop = true): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    s.loopStart = Math.random() * 1.5;
    return s;
  }

  private startWind(): void {
    const ctx = this.ctx!;
    const src = this.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400;
    bp.Q.value = 0.6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(lp).connect(g).connect(this.sfx);
    // Low supersonic rumble layer.
    const r = this.noise();
    const rl = ctx.createBiquadFilter();
    rl.type = 'lowpass';
    rl.frequency.value = 90;
    const rumble = ctx.createGain();
    rumble.gain.value = 0;
    r.connect(rl).connect(rumble).connect(this.sfx);
    src.start();
    r.start();
    this.wind = { src, bp, lp, g, rumble };
  }

  /** Continuous wind mapped to speed (m/s), plus the street reverb amount (0..1). */
  setFlight(speed: number, inCloud: number, streetiness: number): void {
    if (!this.ctx || !this.wind) return;
    const t = this.ctx.currentTime;
    const s = Math.max(0, speed);
    const lvl = Math.min(1, Math.log10(1 + s / 4) / 2.4);
    this.wind.g.gain.setTargetAtTime(0.02 + lvl * 0.5 + inCloud * 0.15, t, 0.08);
    this.wind.bp.frequency.setTargetAtTime(220 + Math.min(2600, s * 3.2), t, 0.1);
    this.wind.bp.Q.value = 0.5 + Math.min(1.2, s / 800);
    this.wind.rumble.gain.setTargetAtTime(Math.min(0.5, Math.max(0, (s - 300) / 2000)), t, 0.2);
    this.reverbSend.gain.setTargetAtTime(streetiness * 0.35, t, 0.3);
  }

  /** Layered sonic boom: sub thump, crack, rumble tail. */
  boom(delay = 0.12, strength = 1): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    // Sub thump.
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t0);
    o.frequency.exponentialRampToValueAtTime(28, t0 + 0.7);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(0.9 * strength, t0 + 0.012);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    o.connect(og).connect(this.sfx);
    o.start(t0);
    o.stop(t0 + 1);
    // Crack.
    const n = this.noise(false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(0.7 * strength, t0 + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    n.connect(hp).connect(ng).connect(this.sfx);
    n.start(t0, Math.random());
    n.stop(t0 + 0.2);
    // Rumble tail.
    const r = this.noise(false);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t0);
    lp.frequency.exponentialRampToValueAtTime(60, t0 + 2.2);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t0);
    rg.gain.exponentialRampToValueAtTime(0.5 * strength, t0 + 0.05);
    rg.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
    r.connect(lp).connect(rg).connect(this.sfx);
    r.start(t0, Math.random());
    r.stop(t0 + 2.5);
  }

  /** Near-miss whoosh with a Doppler-like downward sweep. pan: −1 left … 1 right. */
  whoosh(intensity = 1, pan = 0, duration = 0.45): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const n = this.noise(false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(2600, t0);
    bp.frequency.exponentialRampToValueAtTime(380, t0 + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5 * intensity, t0 + duration * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(pan, t0);
    p.pan.linearRampToValueAtTime(-pan * 0.5, t0 + duration);
    n.connect(bp).connect(g).connect(p).connect(this.sfx);
    p.connect(this.reverbSend);
    n.start(t0, Math.random());
    n.stop(t0 + duration + 0.05);
  }

  /** Heavy impact / takeoff / landing thump. */
  thump(strength = 1, pitch = 1): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110 * pitch, t0);
    o.frequency.exponentialRampToValueAtTime(35 * pitch, t0 + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.8 * strength, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.connect(g).connect(this.sfx);
    o.start(t0);
    o.stop(t0 + 0.55);
    const n = this.noise(false);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(0.5 * strength, t0 + 0.005);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    n.connect(lp).connect(ng).connect(this.sfx);
    n.connect(this.reverbSend);
    n.start(t0, Math.random());
    n.stop(t0 + 0.45);
  }

  /** Glass shatter: bright noise burst + inharmonic chimes. */
  shatter(strength = 1): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const n = this.noise(false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5 * strength, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    n.connect(hp).connect(g).connect(this.sfx);
    n.start(t0, Math.random());
    n.stop(t0 + 0.7);
    for (let k = 0; k < 7; k++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f = 2200 + Math.random() * 4200;
      o.frequency.value = f;
      const og = ctx.createGain();
      const ts = t0 + Math.random() * 0.35;
      og.gain.setValueAtTime(0.0001, ts);
      og.gain.exponentialRampToValueAtTime(0.06 * strength, ts + 0.002);
      og.gain.exponentialRampToValueAtTime(0.0001, ts + 0.3 + Math.random() * 0.5);
      o.connect(og).connect(this.sfx);
      o.start(ts);
      o.stop(ts + 0.9);
    }
  }

  /** Metallic scrape (sparks). */
  scrape(strength = 0.5): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const n = this.noise(false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3400 + Math.random() * 1500;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.3 * strength, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    n.connect(bp).connect(g).connect(this.sfx);
    n.start(t0, Math.random());
    n.stop(t0 + 0.2);
  }

  /** Cape flutter crack. */
  capeCrack(strength = 0.6): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const n = this.noise(false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.35 * strength, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    n.connect(bp).connect(g).connect(this.sfx);
    n.start(t0, Math.random());
    n.stop(t0 + 0.12);
  }
}
