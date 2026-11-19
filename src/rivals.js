// AI rivals for race mode: five computer drivers on a staggered grid, each with
// its own pace, line and paint. They follow the racing line (shifted a little
// each, so they don't queue nose to tail), move over to pass a slower car, and
// bump into each other (and you) through simple car-to-car collisions.
// Plain logic, no drawing: runs in Node for the tests.

import { makeCar, stepCar, DT } from './car.js';
import { Bot } from './bot.js';
import { locate } from './track.js';

export const RIVALS = [
  { name: 'Kade Mercer', color: 0x1f5fd6 },
  { name: 'Rosa Vance', color: 0xf2c418 },
  { name: 'Tomi Hale', color: 0x1d9a5a },
  { name: 'Ines Duarte', color: 0xeef0f2 },
  { name: 'Ozzy Kwan', color: 0xff7a1a },
];

// each level's drivers: how close to the grip limit they corner (the gold
// medal autopilot is 0.9) and how much of the speed they'd manage they use
export const AI_LEVELS = {
  easy: { grip: [0.85, 0.84, 0.83, 0.82, 0.81], pace: [0.93, 0.92, 0.91, 0.9, 0.89] },
  normal: { grip: [0.88, 0.875, 0.87, 0.86, 0.855], pace: [0.975, 0.965, 0.96, 0.95, 0.945] },
  hard: { grip: [0.9, 0.9, 0.895, 0.89, 0.885], pace: [1, 0.995, 0.99, 0.985, 0.98] },
};

/** Grid slot k (0 = pole): metres behind the line and to the side. */
export function gridSlot(k) {
  return { back: 8 + Math.floor(k / 2) * 9 + (k % 2) * 4.5, lat: k % 2 ? 2.4 : -2.4 };
}

const CAR_R = 1.0, CAR_HALF = 1.15; // each car is two circles: front and back

export class Field {
  constructor(track, spec, { level = 'normal', laps = 3, seed = 1 } = {}) {
    this.track = track;
    this.laps = laps;
    const L = AI_LEVELS[level] || AI_LEVELS.normal, grips = L.grip;
    const N = track.N;
    this.cars = RIVALS.map((r, k) => {
      const slot = gridSlot(k);
      const car = makeCar(track, 0, slot.back, spec, slot.lat);
      // each driver has its own sideways shift from the racing line, which drifts along the lap
      const ph = (seed * 7 + k * 2.1) % (Math.PI * 2), f = 2 + ((seed + k) % 3);
      const lim = track.halfW - 1.3;
      const rival = { ...r, k, car, grip: grips[k], avoid: 0, progress: car.loc.s - track.L, lastS: car.loc.s, lap: 0, finished: 0 };
      rival.bot = new Bot(track, grips[k], spec, (j) => {
        const base = track.line.off[j];
        const o = Math.sin((j / N) * Math.PI * 2 * f + ph) * 1.1 + rival.avoid;
        return Math.max(-lim, Math.min(lim, base + o)) - base;
      });
      rival.bot.speedMul = L.pace[k];
      return rival;
    });
  }

  /** Move every rival one step. all = every car in the race, the player's included. */
  step(all, time, started) {
    const t = this.track;
    for (const r of this.cars) {
      const c = r.car;
      if (!started) { continue; }
      let inp;
      if (r.finished) inp = { throttle: 0, brake: 0.3, steer: r.bot.drive(c).steer };
      else {
        // traffic: a car just ahead and in the way? move over, and ease off if closing fast
        let ahead = null, best = 14;
        for (const o of all) {
          if (o === c) continue;
          const dx = o.x - c.x, dz = o.z - c.z;
          const fwd = dx * Math.cos(c.h) + dz * Math.sin(c.h);
          const side = -dx * Math.sin(c.h) + dz * Math.cos(c.h);
          if (fwd > 0 && fwd < best && Math.abs(side) < 2.6) { best = fwd; ahead = { side, fwd, o }; }
        }
        const want = ahead ? (ahead.side > 0 ? -2.3 : 2.3) : 0;
        r.avoid += (want - r.avoid) * Math.min(1, 1.5 * DT);
        inp = r.bot.drive(c);
        if (ahead && ahead.fwd < 6 && c.u > ahead.o.u + 1.5) { inp.throttle = 0; inp.brake = Math.max(inp.brake, 0.25); }
      }
      stepCar(c, t, inp, DT);
      // progress round the lap
      let ds = c.loc.s - r.lastS;
      if (ds > t.L / 2) ds -= t.L; else if (ds < -t.L / 2) ds += t.L;
      r.lastS = c.loc.s;
      r.progress += ds;
      if (!r.finished && r.progress >= this.laps * t.L) r.finished = time;
      r.lap = Math.max(0, Math.min(this.laps - 1, Math.floor(r.progress / t.L)));
    }
  }
}

/**
 * Car-to-car contact: each car is two circles; overlapping cars are pushed apart
 * and trade some speed along the line between them. Returns the hardest bump
 * involving `watch` (the player's car), in m/s.
 */
export function collide(cars, track, watch = null) {
  let hardest = 0;
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const A = cars[i], B = cars[j];
    if (Math.abs(A.x - B.x) > 6 || Math.abs(A.z - B.z) > 6) continue;
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const ax = A.x + Math.cos(A.h) * CAR_HALF * sa, az = A.z + Math.sin(A.h) * CAR_HALF * sa;
      const bx = B.x + Math.cos(B.h) * CAR_HALF * sb, bz = B.z + Math.sin(B.h) * CAR_HALF * sb;
      let nx = ax - bx, nz = az - bz;
      const d = Math.hypot(nx, nz);
      if (d >= CAR_R * 2 || d < 1e-6) continue;
      nx /= d; nz /= d;
      const push = (CAR_R * 2 - d) / 2;
      A.x += nx * push; A.z += nz * push;
      B.x -= nx * push; B.z -= nz * push;
      // world velocities
      const va = worldVel(A), vb = worldVel(B);
      const rel = (va.x - vb.x) * nx + (va.z - vb.z) * nz;
      if (rel < 0) {
        const ma = A.P.mass, mb = B.P.mass, e = 0.25;
        const jimp = (-(1 + e) * rel) / (1 / ma + 1 / mb);
        setWorldVel(A, va.x + (jimp / ma) * nx, va.z + (jimp / ma) * nz);
        setWorldVel(B, vb.x - (jimp / mb) * nx, vb.z - (jimp / mb) * nz);
        // a knock at the front or back turns the car a little
        A.r += sa * 0.25 * (-rel) * (nx * -Math.sin(A.h) + nz * Math.cos(A.h)) * 0.12;
        B.r -= sb * 0.25 * (-rel) * (nx * -Math.sin(B.h) + nz * Math.cos(B.h)) * 0.12;
        if (watch && (A === watch || B === watch)) hardest = Math.max(hardest, -rel);
      }
      locate(track, A.x, A.z, A.hint, A.loc); A.hint = A.loc.i;
      locate(track, B.x, B.z, B.hint, B.loc); B.hint = B.loc.i;
    }
  }
  return hardest;
}

function worldVel(c) {
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  return { x: c.u * ch - c.v * sh, z: c.u * sh + c.v * ch };
}
function setWorldVel(c, x, z) {
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  c.u = x * ch + z * sh;
  c.v = -x * sh + z * ch;
}

/** Positions (1 = leading): finished cars by finishing time, the rest by distance covered. */
export function standings(entries) {
  return entries.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finished - b.finished;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
}
