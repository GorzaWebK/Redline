// A time trial: countdown, laps, sector splits and the finish. Plain logic, no
// drawing, stepped at the physics rate so a run is the same on any computer.
//
// Progress is measured as distance driven along the lap (it goes down if you
// drive backwards), so a lap only counts when you've really gone all the way
// round. The car starts a few metres behind the line.

import { DT, makeCar, stepCar, CAR } from './car.js';
import { LAPS, SPACING, locate } from './track.js';
import { Field, collide, gridSlot, standings } from './rivals.js';

export const COUNTDOWN = 3; // seconds
export const SECTORS = 3;
const START_BACK = 8; // metres behind the line

export class Race {
  /**
   * rivals: null for a time trial, or { level, seed } to race five AI drivers
   * from a grid (you start at the back). launch: true to use launch control.
   */
  constructor(track, { laps = LAPS, spec = undefined, rivals = null, launch = false } = {}) {
    this.track = track;
    this.laps = laps;
    this.spec = spec || CAR;
    this.rivalOpts = rivals;
    this.launch = launch;
    this.reset();
  }

  reset() {
    const t = this.track;
    const back = Math.round(START_BACK / SPACING);
    if (this.rivalOpts) {
      const slot = gridSlot(5);
      this.car = makeCar(t, 0, slot.back, this.spec, slot.lat);
      this.field = new Field(t, this.spec, { ...this.rivalOpts, laps: this.laps });
    } else {
      this.car = makeCar(t, (t.N - back) % t.N, 0, this.spec);
      this.field = null;
    }
    this.state = 'countdown';
    this.tick = 0; // steps since the start of the countdown
    this.time = 0; // race time, seconds
    this.progress = this.car.loc.s - t.L; // just under 0
    this.lastS = this.car.loc.s;
    this.lap = 0; // laps completed
    this.lapStart = 0;
    this.lapTimes = [];
    this.sector = 0; // sectors completed this lap
    this.splits = []; // race time at every sector crossed, in order
    this.sectorTimes = []; // how long each sector took, in order (sector k of lap l is index l * 3 + k)
    this.events = []; // things that happened this step, for sound and HUD
    this.resets = 0;
    this.wallHits = 0;
    this.grassTime = 0;
    this.bumps = 0;
    this.launchQuality = null; // 'perfect', 'good', 'spin' or 'bog'
  }

  /** Every car in the race (yours first). */
  get allCars() { return this.field ? [this.car, ...this.field.cars.map((r) => r.car)] : [this.car]; }

  /** Race order: [{ me, name, progress, finished }], leader first. */
  get order() {
    const me = { me: true, name: 'You', progress: this.progress, finished: this.state === 'finished' ? this.time : 0, car: this.car };
    return this.field ? standings([me, ...this.field.cars]) : [me];
  }
  get position() { return this.order.findIndex((e) => e.me) + 1; }

  /** Launch control band (revs) for the green light. */
  get launchBand() { const m = this.spec.revMax; return [m * 0.6, m * 0.8]; }

  get countdownLeft() { return Math.max(0, COUNTDOWN - this.tick * DT); }
  get lapTime() { return this.state === 'racing' ? this.time - this.lapStart : 0; }
  get bestLap() { return this.lapTimes.length ? Math.min(...this.lapTimes) : 0; }

  /** One physics step. input = { throttle, brake, steer }. */
  step(input) {
    this.events.length = 0;
    this.tick++;
    const c = this.car, t = this.track;
    if (this.state === 'countdown') {
      const before = Math.ceil(COUNTDOWN - (this.tick - 1) * DT);
      const left = COUNTDOWN - this.tick * DT;
      if (Math.ceil(left) !== before && left > 0) this.events.push({ type: 'count', n: Math.ceil(left) });
      if (left <= 0) {
        this.state = 'racing';
        this.events.push({ type: 'go' });
      }
      // the car stays put; the wheels still turn and the engine revs (the revs
      // climb while you hold the throttle and fall when you let go: launch control)
      const want = Math.max(-1, Math.min(1, input.steer || 0)) * 0.52;
      c.steer += Math.max(-0.02, Math.min(0.02, want - c.steer));
      c.rpm = Math.max(1000, Math.min(this.spec.revMax, c.rpm + ((input.throttle || 0) > 0.1 ? 5200 : -3800) * DT));
      if (left <= 0 && this.launch) this.judgeLaunch();
      return;
    }
    if (this.state === 'finished') {
      stepCar(c, t, { throttle: 0, brake: 0.4, steer: 0 }, DT);
      if (this.field) { this.time2 = (this.time2 || this.time) + DT; this.field.step(this.allCars, this.time2, true); collide(this.allCars, t, c); }
      return;
    }

    this.time += DT;
    stepCar(c, t, input, DT);
    if (this.field) {
      this.field.step(this.allCars, this.time, true);
      const bump = collide(this.allCars, t, c);
      if (bump > 1.5) { this.bumps++; this.events.push({ type: 'bump', v: bump }); }
    }
    if (c.hit > 2) { this.wallHits++; this.events.push({ type: 'hit', v: c.hit }); }
    if (c.onGrass) this.grassTime += DT;

    let ds = c.loc.s - this.lastS;
    if (ds > t.L / 2) ds -= t.L; else if (ds < -t.L / 2) ds += t.L;
    this.lastS = c.loc.s;
    this.progress += ds;

    // sectors and laps
    while (true) {
      const next = this.lap * t.L + ((this.sector + 1) / SECTORS) * t.L;
      if (this.progress < next) break;
      this.sector++;
      // exact moment of crossing, between this step and the last
      const frac = ds > 0 ? Math.min(1, (this.progress - next) / ds) : 0;
      const when = this.time - frac * DT;
      this.splits.push(when);
      const n = this.splits.length;
      this.sectorTimes.push(when - (n > 1 ? this.splits[n - 2] : 0));
      if (this.sector === SECTORS) {
        const lapTime = when - this.lapStart;
        this.lapTimes.push(lapTime);
        this.lap++;
        this.sector = 0;
        this.lapStart = when;
        if (this.lap >= this.laps) {
          this.state = 'finished';
          this.time = when;
          this.events.push({ type: 'finish', time: when });
          break;
        }
        this.events.push({ type: 'lap', lap: this.lap, time: lapTime });
      } else {
        this.events.push({ type: 'sector', n: this.splits.length, time: when });
      }
    }
  }

  /** At the green light: how well did you launch? Revs in the band = a boost; too high = wheelspin; too low = bog. */
  judgeLaunch() {
    const c = this.car, [lo, hi] = this.launchBand, rpm = c.rpm, m = this.spec.revMax;
    let q;
    if (rpm >= lo && rpm <= hi) { q = (rpm >= lo + (hi - lo) * 0.25 && rpm <= hi - (hi - lo) * 0.25) ? 'perfect' : 'good'; }
    else q = rpm > hi ? 'spin' : 'bog';
    const effect = { perfect: [1.3, 1.6], good: [1.15, 1.2], spin: [0.6, 1.0], bog: [0.75, 0.7] }[q];
    if (rpm < m * 0.2) { this.launchQuality = null; return; } // didn't touch the throttle: an ordinary start
    c.launchMul = effect[0]; c.launchT = effect[1];
    this.launchQuality = q;
    this.events.push({ type: 'launch', q });
  }

  /** Put the car back in the middle of the road, pointing the right way (the clock keeps running). */
  recover() {
    if (this.state !== 'racing') return;
    const t = this.track, c = this.car;
    const i = c.loc.i;
    const fresh = makeCar(t, i, 0, this.spec);
    Object.assign(c, { x: fresh.x, z: fresh.z, y: fresh.y, h: fresh.h, u: 0, v: 0, r: 0, steer: 0, ax: 0, gear: 1 });
    locate(t, c.x, c.z, i, c.loc);
    c.hint = c.loc.i;
    this.resets++;
    this.events.push({ type: 'recover' });
  }
}

/** Drive a whole race with a controller (e.g. the autopilot). Returns the race. */
export function simulate(track, drive, { laps = LAPS, maxTime = 600 } = {}) {
  const race = new Race(track, { laps });
  const limit = (maxTime + COUNTDOWN) / DT;
  while (race.state !== 'finished' && race.tick < limit) race.step(drive(race.car, race));
  return race;
}
