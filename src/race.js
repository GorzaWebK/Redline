// A time trial: countdown, laps, sector splits and the finish. Plain logic, no
// drawing, stepped at the physics rate so a run is the same on any computer.
//
// Progress is measured as distance driven along the lap (it goes down if you
// drive backwards), so a lap only counts when you've really gone all the way
// round. The car starts a few metres behind the line.

import { DT, makeCar, stepCar } from './car.js';
import { LAPS, SPACING, locate } from './track.js';

export const COUNTDOWN = 3; // seconds
export const SECTORS = 3;
const START_BACK = 8; // metres behind the line

export class Race {
  constructor(track, { laps = LAPS } = {}) {
    this.track = track;
    this.laps = laps;
    this.reset();
  }

  reset() {
    const t = this.track;
    const back = Math.round(START_BACK / SPACING);
    this.car = makeCar(t, (t.N - back) % t.N);
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
    this.events = []; // things that happened this step, for sound and HUD
    this.resets = 0;
    this.wallHits = 0;
    this.grassTime = 0;
  }

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
      // the car stays put; the wheels still turn and the engine revs
      const want = Math.max(-1, Math.min(1, input.steer || 0)) * 0.52;
      c.steer += Math.max(-0.02, Math.min(0.02, want - c.steer));
      c.rpm += (1100 + (input.throttle || 0) * 6000 - c.rpm) * 0.15;
      return;
    }
    if (this.state === 'finished') {
      stepCar(c, t, { throttle: 0, brake: 0.4, steer: 0 }, DT);
      return;
    }

    this.time += DT;
    stepCar(c, t, input, DT);
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

  /** Put the car back in the middle of the road, pointing the right way (the clock keeps running). */
  recover() {
    if (this.state !== 'racing') return;
    const t = this.track, c = this.car;
    const i = c.loc.i;
    const fresh = makeCar(t, i);
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
