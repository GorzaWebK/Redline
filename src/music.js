// Generated music, no audio files: one song per setting plus a menu theme.
// In the menu: a calm pad, slow bass and a soft arpeggio. While racing, drums,
// a driving bass and an arpeggio come in as you speed up. Notes are scheduled
// slightly ahead on the audio clock.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// chords: one per bar (MIDI notes); roots: the bass note of each bar;
// arp: which chord note plays on each 16th; bass: which 16ths the bass plays
export const SONGS = {
  menu: { name: 'Garage Lights', bpm: 92, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [50, 53, 57, 60], [52, 55, 59, 62]], roots: [45, 41, 38, 40], arp: [0, 2, 1, 3, 2, 1, 0, 2, 1, 3, 2, 1, 0, 2, 3, 1], bass: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], arpWave: 'triangle', padCut: 700 },
  meadow: { name: 'Green Flag', bpm: 124, chords: [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]], roots: [45, 41, 48, 43], arp: [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 1], bass: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1], arpWave: 'square' },
  canyon: { name: 'Heat Haze', bpm: 116, chords: [[52, 55, 59], [53, 57, 60], [52, 55, 59], [50, 54, 57]], roots: [40, 41, 40, 38], arp: [0, 2, 1, 2, 0, 2, 1, 2, 0, 1, 2, 2, 1, 0, 2, 1], bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0], arpWave: 'triangle', swing: 0.12 },
  alpine: { name: 'Summit', bpm: 132, chords: [[62, 66, 69], [61, 64, 69], [59, 62, 66], [59, 62, 67]], roots: [50, 45, 47, 43], arp: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 2, 1, 0, 1], bass: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1], arpWave: 'sine', octave: 24 },
  night: { name: 'Neon Mile', bpm: 128, chords: [[60, 63, 67], [56, 60, 63], [55, 58, 63], [58, 62, 65]], roots: [48, 44, 51, 46], arp: [0, 1, 2, 1, 2, 1, 0, 1, 0, 1, 2, 1, 2, 1, 0, 2], bass: [1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1], arpWave: 'sawtooth', snare2: true },
  riviera: { name: 'Coastline', bpm: 120, chords: [[53, 57, 60], [50, 53, 57], [58, 62, 65], [60, 64, 67]], roots: [41, 38, 46, 48], arp: [0, 2, 1, 2, 0, 2, 1, 0, 2, 1, 0, 2, 1, 2, 0, 1], bass: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0], arpWave: 'square', swing: 0.08, octave: 12 },
};

export class Music {
  constructor(sound) {
    this.s = sound;
    this.want = null;
    this.playing = null;
    this.intensity = 0;
    this.layers = null;
  }

  /** name: 'menu' or 'race'; theme picks the race song. */
  play(name, theme = 'meadow') { this.want = name === 'race' ? `race:${SONGS[theme] ? theme : 'meadow'}` : 'menu'; }
  get song() { return this.playing && this.playing.startsWith('race:') ? SONGS[this.playing.slice(5)] : SONGS.menu; }
  setIntensity(x) { this.intensity = x; }

  setup() {
    const ctx = this.s.ctx;
    const mk = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.s.musicBus); return g; };
    this.layers = { pad: mk(), bass: mk(), kick: mk(), hat: mk(), snare: mk(), arp: mk() };
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 900;
    this.padFilter.connect(this.layers.pad);
  }

  update() {
    const ctx = this.s.ctx;
    if (!ctx) return;
    if (!this.layers) this.setup();
    const now = ctx.currentTime;
    if (this.playing !== this.want) {
      this.playing = this.want;
      this.next = now + 0.1;
      this.step = 0;
    }
    // layer volumes
    const race = this.playing !== 'menu', i = this.intensity, song = this.song;
    const target = race
      ? { pad: 0.35, bass: 0.55, kick: i > 0.08 ? 0.75 : 0.35, hat: i > 0.3 ? 0.35 : 0, snare: i > 0.55 ? 0.45 : 0, arp: i > 0.2 ? 0.16 + i * 0.1 : 0 }
      : { pad: 0.55, bass: 0.35, kick: 0, hat: 0, snare: 0, arp: 0.08 };
    for (const [k, g] of Object.entries(this.layers)) g.gain.setTargetAtTime(target[k] ?? 0, now, 0.4);
    this.padFilter.frequency.setTargetAtTime(race ? 700 + i * 1600 : song.padCut || 800, now, 0.5);
    const STEP = 60 / song.bpm / 4; // a 16th note
    while (this.next < now + 0.25) {
      // swing: every other 16th a little late
      this.schedule(this.step, this.next + (this.step % 2 ? (song.swing || 0) * STEP : 0), STEP);
      this.next += STEP;
      this.step = (this.step + 1) % 64;
    }
  }

  schedule(step, t, STEP) {
    const bar = Math.floor(step / 16), s = step % 16, song = this.song;
    const chord = song.chords[bar], race = this.playing !== 'menu', up = song.octave ?? 12;
    const note = (j) => midi(chord[song.arp[s] % chord.length] + up);
    if (s === 0) for (const n of chord) this.pad(midi(n), t, STEP * 16);
    if (race) {
      if (song.bass[s]) this.bass(midi(song.roots[bar]) * (s === 7 || s === 15 ? 2 : 1), t, STEP * 0.9);
      if (s % 4 === 0) this.kick(t);
      if (s % 4 === 2) this.hat(t);
      if (s === 4 || s === 12 || (song.snare2 && s === 14 && bar === 3)) this.snare(t);
      this.arp(note(), t, STEP, song.arpWave);
    } else {
      if (song.bass[s]) this.bass(midi(song.roots[bar]), t, STEP * 5);
      if (s % 2 === 0) this.arp(note(), t, STEP * 2, song.arpWave);
    }
  }

  osc(type, freq, t, dur, gain, dest, attack = 0.005) {
    const ctx = this.s.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  pad(f, t, dur) {
    for (const d of [-6, 6]) this.osc('sawtooth', f * Math.pow(2, d / 1200), t, dur, 0.05, this.padFilter, 0.5);
  }
  bass(f, t, dur) {
    const ctx = this.s.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 4;
    lp.connect(this.layers.bass);
    this.osc('sawtooth', f, t, dur, 0.4, lp);
    this.osc('sine', f / 2, t, dur, 0.3, this.layers.bass);
  }
  kick(t) {
    const ctx = this.s.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.layers.kick); o.start(t); o.stop(t + 0.3);
  }
  noise(t, dur, gain, type, freq, dest) {
    const ctx = this.s.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.s.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }
  hat(t) { this.noise(t, 0.05, 0.35, 'highpass', 7500, this.layers.hat); }
  snare(t) { this.noise(t, 0.18, 0.5, 'bandpass', 1900, this.layers.snare); this.osc('triangle', 190, t, 0.1, 0.25, this.layers.snare); }
  arp(f, t, STEP, wave = 'square') { this.osc(wave, f, t, STEP * 1.6, wave === 'sine' || wave === 'triangle' ? 0.2 : 0.12, this.layers.arp); }
}
