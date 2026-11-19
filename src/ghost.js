// Ghost replays: the car's position and heading recorded 30 times a second
// from the green light, packed into a short text string to save.
import { locate } from './track.js';

export const GHOST_HZ = 30;
const EVERY = 120 / GHOST_HZ; // physics steps per frame

export class GhostRecorder {
  constructor() { this.frames = []; this.n = 0; }
  /** Call once per physics step while racing. */
  add(car) {
    if (this.n++ % EVERY) return;
    const h = Math.atan2(Math.sin(car.h), Math.cos(car.h));
    this.frames.push(car.x, car.z, h);
  }
}

/** Frames -> compact text: 'R1.' + base64 of Int16s (decimetres, 1e-4 radians). */
export function encodeGhost(frames) {
  const a = new Int16Array(frames.length);
  for (let i = 0; i < frames.length; i += 3) {
    a[i] = Math.round(frames[i] * 10);
    a[i + 1] = Math.round(frames[i + 1] * 10);
    a[i + 2] = Math.round(frames[i + 2] * 10000);
  }
  let s = '';
  const bytes = new Uint8Array(a.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'R1.' + btoa(s);
}

export function decodeGhost(str) {
  try {
    const bin = atob(str.startsWith('R1.') ? str.slice(3) : str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const a = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 3) { out[i] = a[i] / 10; out[i + 1] = a[i + 1] / 10; out[i + 2] = a[i + 2] / 10000; }
    return out;
  } catch { return null; }
}

export class GhostPlayer {
  constructor(frames, track) {
    this.f = frames; this.track = track; this.loc = {}; this.hint = -1;
    this.count = frames.length / 3;
  }
  /** Ghost pose at race time `time` (seconds since the green light), or null after it finished. */
  at(time) {
    const p = time * GHOST_HZ;
    const i = Math.floor(p);
    if (i < 0 || i >= this.count - 1) return i >= this.count - 1 ? null : this.pose(0, 0);
    return this.pose(i, p - i);
  }
  pose(i, u) {
    const f = this.f, a = i * 3, b = a + 3;
    const x = f[a] + (f[b] - f[a]) * u, z = f[a + 1] + (f[b + 1] - f[a + 1]) * u;
    let dh = f[b + 2] - f[a + 2];
    dh -= Math.PI * 2 * Math.round(dh / (Math.PI * 2));
    const h = f[a + 2] + dh * u;
    // a big jump (skipping ahead in a replay): search the whole track again
    if (this.lx === undefined || Math.hypot(x - this.lx, z - this.lz) > 30) this.hint = -1;
    this.lx = x; this.lz = z;
    locate(this.track, x, z, this.hint, this.loc);
    this.hint = this.loc.i;
    const speed = Math.hypot(f[b] - f[a], f[b + 1] - f[a + 1]) * GHOST_HZ;
    return { x, z, h, y: this.loc.y, speed, pitch: Math.atan(this.loc.grade * (Math.cos(h) * this.loc.tx + Math.sin(h) * this.loc.tz)) };
  }
}
