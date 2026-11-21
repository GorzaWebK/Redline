// AI rivals for race mode: five computer drivers on a staggered grid. Each has
// a personality (how often they make mistakes, how hard they attack and how
// they defend) and a car of their own. They follow the racing line (shifted a
// little each, so they don't queue nose to tail), pick the inside of the next
// corner to pass, cover the inside when someone is close behind, sometimes
// brake too late, run wide or hesitate, and bump into each other (and you)
// through simple car-to-car collisions. A rival who gets stuck is put back on
// the road. Plain logic, no drawing: runs in Node for the tests.

import { makeCar, stepCar, DT, bruise } from './car.js';
import { Bot } from './bot.js';
import { locate } from './track.js';
import { carById } from './cars.js';
import { mulberry32 } from './rng.js';

// mistakes: how error-prone (1 = often); attack: how close they follow before
// backing off and how hard they go for gaps; defend: how much they cover the inside
export const RIVALS = [
  { name: 'Kade Mercer', color: 0x1f5fd6, car: 'gt', style: 'Racer', mistakes: 0.5, attack: 0.8, defend: 0.7 },
  { name: 'Rosa Vance', color: 0xf2c418, car: 'hatch', style: 'Smooth', mistakes: 0.15, attack: 0.4, defend: 0.4 },
  { name: 'Tomi Hale', color: 0x1d9a5a, car: 'gt', style: 'Rookie', mistakes: 1, attack: 0.3, defend: 0.1 },
  { name: 'Ines Duarte', color: 0xeef0f2, car: 'hyper', style: 'Defender', mistakes: 0.35, attack: 0.5, defend: 1 },
  { name: 'Ozzy Kwan', color: 0xff7a1a, car: 'muscle', style: 'Wild', mistakes: 0.9, attack: 1, defend: 0.5 },
];

// each level's drivers: how close to the grip limit they corner (the gold
// medal autopilot is 0.9), how much of the speed they'd manage they use, and
// how often they make mistakes
export const AI_LEVELS = {
  easy: { grip: [0.85, 0.84, 0.83, 0.82, 0.81], pace: [0.93, 0.92, 0.91, 0.9, 0.89], err: 1.6 },
  normal: { grip: [0.88, 0.875, 0.87, 0.86, 0.855], pace: [0.975, 0.965, 0.96, 0.95, 0.945], err: 1 },
  hard: { grip: [0.9, 0.9, 0.895, 0.89, 0.885], pace: [1, 0.995, 0.99, 0.985, 0.98], err: 0.5 },
};

/** Grid slot k (0 = pole): metres behind the line and to the side. */
export function gridSlot(k) {
  return { back: 8 + Math.floor(k / 2) * 9 + (k % 2) * 4.5, lat: k % 2 ? 2.4 : -2.4 };
}

/**
 * Which car a rival drives: their own, unless it would be slower than yours on
 * this circuit (then they drive yours), and how much a quicker car holds back
 * in the corners so that the AI level means the same whatever the cars.
 */
export function rivalCar(r, playerCar = 'gt', golds = null) {
  if (!golds || !golds[r.car] || !golds[playerCar]) return { car: playerCar, pace: 1 };
  if (golds[r.car] > golds[playerCar] * 1.01) return { car: playerCar, pace: 1 };
  return { car: r.car, pace: Math.min(1, Math.pow(golds[r.car] / golds[playerCar], 1.5)) };
}

/**
 * Qualifying: each rival's time for one lap on their own from a standing start
 * (the same lap you drive in qualifying), with a little seeded variation.
 */
export function qualiTimes(track, { level = 'normal', golds = null, playerCar = 'gt', seed = 1, simulate } = {}) {
  const L = AI_LEVELS[level] || AI_LEVELS.normal;
  return RIVALS.map((r, k) => {
    const pick = golds ? rivalCar(r, playerCar, golds) : { car: playerCar, pace: 1 };
    const spec = carById(pick.car).spec;
    const bot = new Bot(track, L.grip[k], spec);
    bot.speedMul = L.pace[k] * pick.pace;
    const race = simulate(track, (c) => bot.drive(c), { laps: 1, spec, maxTime: 400 });
    const rnd = mulberry32((seed * 31337 + k * 7) >>> 0);
    const noise = 1 + (rnd() - 0.5) * 0.012 + rnd() * 0.01 * r.mistakes * L.err;
    return { k, name: r.name, car: pick.car, time: race.time * noise };
  });
}

/** Grid slots from qualifying: you and the rivals, fastest on pole. */
export function gridFromQuali(rivalTimes, myTime) {
  const all = [...rivalTimes.map((r) => ({ k: r.k, time: r.time })), { k: -1, time: myTime }].sort((a, b) => a.time - b.time);
  const slots = [];
  let playerSlot = 5;
  all.forEach((e, pos) => { if (e.k < 0) playerSlot = pos; else slots[e.k] = pos; });
  return { slots, playerSlot };
}

const CAR_R = 1.0, CAR_HALF = 1.15; // each car is two circles: front and back

export class Field {
  /**
   * order: which rival starts in which grid slot (default: as listed); slot 5
   * is the player's unless `playerSlot` says otherwise. golds/playerCar: the
   * circuit's gold times per car and the player's car, to pick and balance cars.
   */
  constructor(track, spec, { level = 'normal', laps = 3, seed = 1, golds = null, playerCar = 'gt', slots = null } = {}) {
    this.track = track;
    this.laps = laps;
    this.events = [];
    const L = AI_LEVELS[level] || AI_LEVELS.normal, grips = L.grip;
    this.level = L;
    const N = track.N;
    this.cars = RIVALS.map((r, k) => {
      const slot = gridSlot(slots ? slots[k] : k);
      // without the circuit's gold times (tests), everyone drives the player's car
      const pick = golds ? rivalCar(r, playerCar, golds) : { car: playerCar, pace: 1 };
      const carId = pick.car;
      const cspec = golds || !spec ? carById(carId).spec : spec;
      const car = makeCar(track, 0, slot.back, cspec, slot.lat);
      // each driver has its own sideways shift from the racing line, which drifts along the lap
      const ph = (seed * 7 + k * 2.1) % (Math.PI * 2), f = 2 + ((seed + k) % 3);
      const lim = track.halfW - 1.3;
      const rival = {
        ...r, k, carId, car, grip: grips[k], avoid: 0, progress: car.loc.s - track.L, lastS: car.loc.s, lap: 0, finished: 0,
        rnd: mulberry32((seed * 7919 + k * 104729) >>> 0), mistake: null, plan: null, wide: 0, stuck: 0, resets: 0,
      };
      rival.bot = new Bot(track, grips[k], cspec, (j) => {
        const base = track.line.off[j];
        const o = Math.sin((j / N) * Math.PI * 2 * f + ph) * 1.1 + rival.avoid + rival.wide;
        return Math.max(-lim, Math.min(lim, base + o)) - base;
      });
      rival.pace = L.pace[k] * pick.pace;
      rival.bot.speedMul = rival.pace;
      this.planMistake(rival, 0);
      return rival;
    });
  }

  /** Maybe schedule a mistake somewhere on lap `lap` (a braking zone, usually). */
  planMistake(r, lap) {
    const t = this.track, N = t.N;
    r.plan = null;
    if (r.rnd() > Math.min(0.9, 0.32 * r.mistakes * this.level.err)) return;
    let i = Math.floor(r.rnd() * N);
    const prof = r.bot.profile;
    for (let k = 0; k < N; k++, i = (i + 1) % N) if (prof[(i + 25) % N] < prof[i] - 6) break; // the next braking zone
    const kinds = ['late', 'late', 'wide', 'lift'];
    r.plan = { at: lap * t.L + t.s[i], kind: kinds[Math.floor(r.rnd() * kinds.length)] };
  }

  /** Put a stuck rival back on the road, facing the right way. */
  recover(r) {
    const t = this.track, c = r.car, i = c.loc.i;
    const fresh = makeCar(t, i, 0, c.P, Math.max(-2, Math.min(2, c.loc.lat * 0.5)));
    Object.assign(c, { x: fresh.x, z: fresh.z, y: fresh.y, h: fresh.h, u: 4, v: 0, r: 0, steer: 0, gear: 1 });
    locate(t, c.x, c.z, i, c.loc);
    c.hint = c.loc.i;
    r.stuck = 0; r.resets++; r.mistake = null; r.wide = 0;
  }

  /** Move every rival one step. all = every car in the race, the player's included. */
  step(all, time, started) {
    const t = this.track, N = t.N;
    this.events.length = 0;
    for (const r of this.cars) {
      const c = r.car;
      if (!started) { continue; }
      let inp;
      if (r.finished) inp = { throttle: 0, brake: 0.3, steer: r.bot.drive(c).steer };
      else {
        // mistakes: start one at its planned spot, then let it play out
        if (r.plan && r.progress >= r.plan.at) {
          r.mistake = { kind: r.plan.kind, left: r.plan.kind === 'wide' ? 2.2 : r.plan.kind === 'late' ? 1.6 : 1.1 };
          this.events.push({ type: 'mistake', name: r.name, kind: r.plan.kind });
          r.plan = null;
        }
        if (r.mistake) { r.mistake.left -= DT; if (r.mistake.left <= 0) r.mistake = null; }
        const m = r.mistake;
        r.bot.speedMul = r.pace * (m && m.kind === 'late' ? 1.13 : 1);
        // which way the road turns next (+1 = towards the left side): the inside
        const i0 = c.loc.i, i1 = (i0 + 22) % N;
        const turn = Math.sign(t.tx[i0] * t.tz[i1] - t.tz[i0] * t.tx[i1]);
        const wideWant = m && m.kind === 'wide' ? -(turn || 1) * 2.6 : 0;
        r.wide += (wideWant - r.wide) * Math.min(1, 1.2 * DT);
        // traffic: a car just ahead and in the way? go for the inside of the next
        // corner (or the outside if they're covering it), and ease off if closing fast
        let ahead = null, behind = null, best = 14, bestB = 12;
        for (const o of all) {
          if (o === c || Math.abs((o.y || 0) - (c.y || 0)) > 2) continue;
          const dx = o.x - c.x, dz = o.z - c.z;
          const fwd = dx * Math.cos(c.h) + dz * Math.sin(c.h);
          const side = -dx * Math.sin(c.h) + dz * Math.cos(c.h);
          if (fwd > 0 && fwd < best && Math.abs(side) < 2.6) { best = fwd; ahead = { side, fwd, o }; }
          if (fwd < 0 && -fwd < bestB && Math.abs(side) < 4 && o.u > c.u - 0.5) { bestB = -fwd; behind = { side, o }; }
        }
        let want = 0;
        if (ahead) {
          const inside = turn || (ahead.side > 0 ? -1 : 1);
          want = Math.sign(ahead.side) === inside && Math.abs(ahead.side) > 0.8 ? -inside * 2.3 : inside * 2.3;
        } else if (behind && r.defend > 0) {
          // someone's close behind: cover the side they're on
          want = Math.sign(behind.side || turn || 1) * 1.6 * r.defend;
        }
        r.avoid += (want - r.avoid) * Math.min(1, (1 + r.attack) * DT);
        inp = r.bot.drive(c);
        if (m && m.kind === 'lift') inp.throttle = Math.min(inp.throttle, 0.25);
        const gap = 6.5 - r.attack * 2.5;
        if (ahead && ahead.fwd < gap && c.u > ahead.o.u + 1.5) { inp.throttle = 0; inp.brake = Math.max(inp.brake, 0.25); }
      }
      stepCar(c, t, inp, DT);
      // stuck (in a wall, spun on the grass)? back on the road after a moment
      if (!r.finished) {
        r.stuck = c.u < 2 ? r.stuck + DT : Math.max(0, r.stuck - DT);
        if (r.stuck > 2.5) this.recover(r);
      }
      // progress round the lap
      let ds = c.loc.s - r.lastS;
      if (ds > t.L / 2) ds -= t.L; else if (ds < -t.L / 2) ds += t.L;
      r.lastS = c.loc.s;
      r.progress += ds;
      if (!r.finished && r.progress >= this.laps * t.L) r.finished = time;
      const lap = Math.max(0, Math.min(this.laps - 1, Math.floor(r.progress / t.L)));
      if (lap > r.lap && !r.finished) this.planMistake(r, lap);
      r.lap = lap;
    }
  }
}

/** Slipstream: each car's draft (0..1) from a car close ahead in line with it. */
export function slipstream(cars) {
  for (const c of cars) {
    let d = 0;
    if (c.u > 15) for (const o of cars) {
      if (o === c || Math.abs((o.y || 0) - (c.y || 0)) > 2) continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      const fwd = dx * Math.cos(c.h) + dz * Math.sin(c.h);
      const side = -dx * Math.sin(c.h) + dz * Math.cos(c.h);
      if (fwd > 3 && fwd < 28 && Math.abs(side) < 1.8) d = Math.max(d, (1 - fwd / 28) * (1 - Math.abs(side) / 1.8));
    }
    c.draft = (c.draft || 0) + (d - (c.draft || 0)) * 0.05;
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
    if (Math.abs((A.y || 0) - (B.y || 0)) > 2) continue; // one on a bridge, one under it
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
        bruise(A, sa > 0 ? 'front' : 'rear', -rel * 0.8);
        bruise(B, sb > 0 ? 'front' : 'rear', -rel * 0.8);
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
