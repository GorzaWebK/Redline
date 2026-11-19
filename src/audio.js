// Every sound is synthesised with the Web Audio API: no audio files.

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.sfxVolume = 1;
    this.musicVolume = 0.6;
  }

  // Browsers only allow audio after a click or key press.
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVolume;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const loopNoise = () => { const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(); return s; };

    // engine (see buildEngine below)
    this.engine = buildEngine(ctx, this.sfx, this.noise, this.engineProfile);

    // tyre squeal
    this.squealFilter = ctx.createBiquadFilter(); this.squealFilter.type = 'bandpass'; this.squealFilter.frequency.value = 1500; this.squealFilter.Q.value = 9;
    this.squealGain = ctx.createGain(); this.squealGain.gain.value = 0;
    loopNoise().connect(this.squealFilter).connect(this.squealGain).connect(this.sfx);
    // gravel/grass rumble
    this.grassFilter = ctx.createBiquadFilter(); this.grassFilter.type = 'lowpass'; this.grassFilter.frequency.value = 300;
    this.grassGain = ctx.createGain(); this.grassGain.gain.value = 0;
    loopNoise().connect(this.grassFilter).connect(this.grassGain).connect(this.sfx);
    // kerb rumble: low noise pulsed at the rate the kerb stripes pass under the tyres
    this.kerbFilter = ctx.createBiquadFilter(); this.kerbFilter.type = 'lowpass'; this.kerbFilter.frequency.value = 200;
    this.kerbGain = ctx.createGain(); this.kerbGain.gain.value = 0;
    this.kerbAm = ctx.createGain(); this.kerbAm.gain.value = 0.5;
    this.kerbLfo = ctx.createOscillator(); this.kerbLfo.type = 'square'; this.kerbLfo.frequency.value = 10;
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.5;
    this.kerbLfo.connect(lfoDepth).connect(this.kerbAm.gain);
    this.kerbLfo.start();
    loopNoise().connect(this.kerbFilter).connect(this.kerbAm).connect(this.kerbGain).connect(this.sfx);
    // wind
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    loopNoise().connect(this.windFilter).connect(this.windGain).connect(this.sfx);
  }

  /** Switch engine sound (each car has its own; see cars.js). */
  setEngine(profile) {
    this.engineProfile = profile;
    if (!this.ctx) return;
    this.engine.stop();
    this.engine = buildEngine(this.ctx, this.sfx, this.noise, profile);
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05); }
  setEffectsVolume(v) { this.sfxVolume = v; if (this.sfx) this.sfx.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setMusicVolume(v) { this.musicVolume = v; if (this.musicBus) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  /** Called every frame while driving. active = false silences the car (menus). */
  update({ rpm = 1000, throttle = 0, speed = 0, slip = 0, grass = false, kerb = false, active = true }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engine.set(rpm, throttle, active, t);
    const sq = active ? Math.max(0, Math.min(1, (slip - 0.95) * 1.6)) : 0;
    this.squealGain.gain.setTargetAtTime(sq * 0.12 * Math.min(1, speed / 8), t, 0.04);
    this.squealFilter.frequency.setTargetAtTime(1300 + slip * 250, t, 0.1);
    this.grassGain.gain.setTargetAtTime(active && grass ? Math.min(0.35, speed * 0.015) : 0, t, 0.05);
    this.kerbGain.gain.setTargetAtTime(active && kerb && speed > 3 ? Math.min(0.5, 0.15 + speed * 0.01) : 0, t, 0.03);
    this.kerbLfo.frequency.setTargetAtTime(Math.max(2, speed / 2), t, 0.05);
    const w = Math.min(1, speed / 75);
    this.windGain.gain.setTargetAtTime(active ? w * w * 0.25 : 0, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(300 + w * 1200, t, 0.1);
  }

  silence() { this.update({ active: false }); }

  tone({ type = 'sine', freq = 440, to = null, dur = 0.2, gain = 0.3, delay = 0, bus = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noiseBurst({ dur = 0.2, gain = 0.4, freq = 600, q = 1, type = 'lowpass' }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  count() { this.tone({ type: 'square', freq: 660, dur: 0.18, gain: 0.18 }); }
  go() { this.tone({ type: 'square', freq: 1320, dur: 0.5, gain: 0.2 }); }
  hit(v) { this.noiseBurst({ dur: 0.25, gain: Math.min(0.9, 0.2 + v * 0.05), freq: 400 }); this.tone({ type: 'triangle', freq: 90, to: 50, dur: 0.2, gain: Math.min(0.6, v * 0.04) }); }
  shift() { this.noiseBurst({ dur: 0.06, gain: 0.08, freq: 2500, type: 'bandpass', q: 2 }); }
  sector(ahead) { this.tone({ freq: ahead ? 990 : 520, dur: 0.15, gain: 0.12 }); }
  lap() { this.tone({ freq: 784, dur: 0.12, gain: 0.15 }); this.tone({ freq: 1046, dur: 0.25, gain: 0.15, delay: 0.12 }); }
  finish(medal) {
    const notes = medal ? [523, 659, 784, 1046] : [523, 494, 440];
    notes.forEach((n, i) => this.tone({ type: 'triangle', freq: n, dur: 0.3, gain: 0.2, delay: i * 0.13 }));
  }
  click() { this.tone({ freq: 880, dur: 0.05, gain: 0.06 }); }
}

/**
 * The engine: one custom waveform shaped like the exhaust pulses of a
 * four-cylinder engine (firing frequency = revs / 30), a second copy a hair
 * out of tune for body, a half-speed rumble that also wobbles the volume
 * (uneven firing gives the growl), and a little breathy exhaust noise. A
 * low-pass filter opens up as you press the throttle; off the throttle it goes
 * quieter and more muffled. No distortion, so it never gets buzzy.
 * Returns { set(rpm, throttle, active, time) }.
 */
export function buildEngine(ctx, dest, noise, prof = {}) {
  const P = { div: 30, sub: 0.4, wobble: 0.2, bright: 1, body: 160, ...prof };
  const N = 40, real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) {
    // falling harmonics with gentle bumps, like a muffled exhaust pulse
    imag[n] = (Math.exp(-n / 6) * (1 + 0.45 * Math.cos(n * 0.8))) / Math.sqrt(n);
  }
  const wave = ctx.createPeriodicWave(real, imag);

  const out = ctx.createGain(); out.gain.value = 0;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 30;
  const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = P.body; body.Q.value = 0.8; body.gain.value = 5;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6; lp.frequency.value = 600;
  lp.connect(body).connect(hp).connect(out).connect(dest);

  // everything goes through a gain the rumble wobbles
  const wobble = ctx.createGain(); wobble.gain.value = 0.75;
  wobble.connect(lp);

  const main = ctx.createOscillator(); main.setPeriodicWave(wave);
  const second = ctx.createOscillator(); second.setPeriodicWave(wave);
  const sub = ctx.createOscillator(); sub.type = 'sine';
  const am = ctx.createOscillator(); am.type = 'sine';
  const gMain = ctx.createGain(); gMain.gain.value = 0.55;
  const gSecond = ctx.createGain(); gSecond.gain.value = 0.3;
  const gSub = ctx.createGain(); gSub.gain.value = P.sub;
  const amDepth = ctx.createGain(); amDepth.gain.value = P.wobble;
  main.connect(gMain).connect(wobble);
  second.connect(gSecond).connect(wobble);
  sub.connect(gSub).connect(wobble);
  am.connect(amDepth).connect(wobble.gain);

  const hiss = ctx.createBufferSource(); hiss.buffer = noise; hiss.loop = true;
  const hissF = ctx.createBiquadFilter(); hissF.type = 'bandpass'; hissF.Q.value = 1.1;
  const hissG = ctx.createGain(); hissG.gain.value = 0;
  hiss.connect(hissF).connect(hissG).connect(lp);

  for (const o of [main, second, sub, am]) o.start();
  hiss.start();

  return {
    set(rpm, throttle, active, t) {
      const f = Math.max(20, rpm / P.div);
      const k = 0.04;
      main.frequency.setTargetAtTime(f, t, k);
      second.frequency.setTargetAtTime(f * 1.004, t, k);
      sub.frequency.setTargetAtTime(f / 2, t, k);
      am.frequency.setTargetAtTime(f / 2, t, k);
      hissF.frequency.setTargetAtTime(f * 3, t, k);
      lp.frequency.setTargetAtTime(Math.min(3600, Math.max(220, f * (2.2 + throttle * 5) * P.bright)), t, 0.06);
      hissG.gain.setTargetAtTime(active ? 0.02 + throttle * 0.05 : 0, t, 0.08);
      const loud = 0.2 + throttle * 0.16 + Math.min(1, rpm / 8000) * 0.06;
      out.gain.setTargetAtTime(active ? loud : 0, t, 0.08);
    },
    stop() {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => { for (const o of [main, second, sub, am, hiss]) { try { o.stop(); } catch { /* already stopped */ } } out.disconnect(); }, 200);
    },
  };
}
