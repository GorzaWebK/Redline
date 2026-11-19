// Every sound is synthesised with the Web Audio API: no audio files.
// The engine is a few oscillators at the firing frequency of a four-cylinder
// engine (revs / 30), roughened by a wave shaper and opened up by throttle.

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

    // engine
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 900; this.engFilter.Q.value = 2;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.5); }
    shaper.curve = curve;
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    mix.connect(shaper).connect(this.engFilter).connect(this.engGain).connect(this.sfx);
    this.oscs = [
      { o: ctx.createOscillator(), type: 'sawtooth', mult: 1, g: 0.5 },
      { o: ctx.createOscillator(), type: 'square', mult: 0.5, g: 0.35 },
      { o: ctx.createOscillator(), type: 'sawtooth', mult: 2.01, g: 0.12 },
      { o: ctx.createOscillator(), type: 'triangle', mult: 0.25, g: 0.4 },
    ];
    for (const s of this.oscs) {
      s.o.type = s.type; s.o.frequency.value = 40 * s.mult;
      const g = ctx.createGain(); g.gain.value = s.g;
      s.o.connect(g).connect(mix); s.o.start();
    }
    // a little rasp from noise that follows the revs
    this.raspFilter = ctx.createBiquadFilter(); this.raspFilter.type = 'bandpass'; this.raspFilter.Q.value = 3;
    this.raspGain = ctx.createGain(); this.raspGain.gain.value = 0;
    loopNoise().connect(this.raspFilter).connect(this.raspGain).connect(this.engFilter);

    // tyre squeal
    this.squealFilter = ctx.createBiquadFilter(); this.squealFilter.type = 'bandpass'; this.squealFilter.frequency.value = 1500; this.squealFilter.Q.value = 9;
    this.squealGain = ctx.createGain(); this.squealGain.gain.value = 0;
    loopNoise().connect(this.squealFilter).connect(this.squealGain).connect(this.sfx);
    // gravel/grass rumble
    this.grassFilter = ctx.createBiquadFilter(); this.grassFilter.type = 'lowpass'; this.grassFilter.frequency.value = 300;
    this.grassGain = ctx.createGain(); this.grassGain.gain.value = 0;
    loopNoise().connect(this.grassFilter).connect(this.grassGain).connect(this.sfx);
    // wind
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    loopNoise().connect(this.windFilter).connect(this.windGain).connect(this.sfx);
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05); }
  setEffectsVolume(v) { this.sfxVolume = v; if (this.sfx) this.sfx.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setMusicVolume(v) { this.musicVolume = v; if (this.musicBus) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  /** Called every frame while driving. active = false silences the car (menus). */
  update({ rpm = 1000, throttle = 0, speed = 0, slip = 0, grass = false, active = true }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = rpm / 30;
    for (const s of this.oscs) s.o.frequency.setTargetAtTime(f * s.mult, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(500 + throttle * 1800 + rpm * 0.15, t, 0.05);
    this.raspFilter.frequency.setTargetAtTime(f * 4, t, 0.05);
    this.raspGain.gain.setTargetAtTime(active ? 0.05 + throttle * 0.12 : 0, t, 0.05);
    this.engGain.gain.setTargetAtTime(active ? 0.16 + throttle * 0.14 : 0, t, 0.06);
    const sq = active ? Math.max(0, Math.min(1, (slip - 0.75) * 2.2)) : 0;
    this.squealGain.gain.setTargetAtTime(sq * 0.12 * Math.min(1, speed / 8), t, 0.04);
    this.squealFilter.frequency.setTargetAtTime(1300 + slip * 250, t, 0.1);
    this.grassGain.gain.setTargetAtTime(active && grass ? Math.min(0.35, speed * 0.015) : 0, t, 0.05);
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
