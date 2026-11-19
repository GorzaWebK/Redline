import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, trackData } from '../src/tracks.js';
import { Bot } from '../src/bot.js';
import { Race } from '../src/race.js';
import { DT, CAR } from '../src/car.js';
import { CARS } from '../src/cars.js';
import { DriftScore } from '../src/drift.js';
import { dailyDef, bumpStreak, dailyId } from '../src/daily.js';
import { packSave, unpackSave, mergeSaves, parseCode, formatCode, newAccountCode } from '../src/account.js';
import { earnedFromSave, ACHIEVEMENTS } from '../src/achievements.js';

const run = (race, drive) => { while (race.state !== 'finished' && race.tick < 120 * 500) race.step(drive(race.car)); return race; };

test('every car can drive a circuit cleanly with the autopilot', () => {
  const t = trackData(TRACKS[5]);
  for (const car of CARS) {
    const bot = new Bot(t, 0.9, car.spec);
    const r = run(new Race(t, { spec: car.spec }), (c) => bot.drive(c));
    assert.equal(r.state, 'finished', car.id);
    assert.ok(r.time < TRACKS[5].gold * 1.08, `${car.id} ${r.time}`);
  }
});

test('race mode: five rivals, a grid start, positions, and everyone finishes', () => {
  const t = trackData(TRACKS[2]);
  const r = new Race(t, { rivals: { level: 'normal', seed: 1 } });
  assert.equal(r.allCars.length, 6);
  assert.equal(r.position, 6); // you start at the back
  const me = new Bot(t, 0.9);
  run(r, (c) => me.drive(c));
  assert.equal(r.state, 'finished');
  assert.ok(r.position >= 1 && r.position <= 6);
  assert.equal(r.order.length, 6);
  // the rivals keep driving after you finish
  for (let k = 0; k < 120 * 30; k++) r.step({ throttle: 0, brake: 0, steer: 0 });
  assert.ok(r.field.cars.every((x) => x.finished > 0), 'all rivals finish');
});

test('rivals on easy are slower than on hard', () => {
  const t = trackData(TRACKS[8]);
  const finish = (level) => {
    const r = new Race(t, { rivals: { level, seed: 2 } });
    while (r.tick < 120 * 400 && r.field.cars.some((x) => !x.finished)) r.step({ throttle: 0, brake: 1, steer: 0 });
    return Math.min(...r.field.cars.map((x) => x.finished || 999));
  };
  assert.ok(finish('easy') > finish('hard') + 2);
});

test('launch control: revs in the green zone give a boost, too many give wheelspin', () => {
  const t = trackData(TRACKS[0]);
  const launch = (target) => {
    const r = new Race(t, { launch: true });
    // hold the revs near the target during the countdown by tapping the throttle
    while (r.state === 'countdown') r.step({ throttle: r.car.rpm < target ? 1 : 0, brake: 0, steer: 0 });
    return r.launchQuality;
  };
  assert.equal(launch(CAR.revMax * 0.7), 'perfect');
  assert.equal(launch(CAR.revMax * 1.2), 'spin');
  const quick = (q) => { const r = new Race(t, { launch: true }); while (r.state === 'countdown') r.step({ throttle: r.car.rpm < (q ? CAR.revMax * 0.7 : CAR.revMax * 1.2) ? 1 : 0 }); for (let k = 0; k < 120 * 2; k++) r.step({ throttle: 1 }); return r.car.u; };
  assert.ok(quick(true) > quick(false) + 1, 'a perfect launch is quicker off the line');
});

test('drift scoring: sideways builds a chain with a multiplier; a wall hit loses it', () => {
  const d = new DriftScore();
  const car = { u: 20, v: 9, onGrass: false, drift: 0.42 };
  for (let k = 0; k < 120 * 3; k++) d.step(car, DT);
  assert.ok(d.chain > 500 && d.mult >= 2, `${d.chain} x${d.mult}`);
  const straight = { u: 25, v: 0, onGrass: false, drift: 0 };
  for (let k = 0; k < 120 * 1.5; k++) d.step(straight, DT);
  assert.ok(d.total > 500 && d.chain === 0, 'banked after the drift ends');
  for (let k = 0; k < 120; k++) d.step(car, DT);
  d.step(car, DT, true);
  assert.equal(d.chain, 0);
  assert.equal(d.events[0].type, 'lost');
});

test('sector times add up to the race time', () => {
  const t = trackData(TRACKS[1]);
  const bot = new Bot(t);
  const r = run(new Race(t), (c) => bot.drive(c));
  assert.equal(r.sectorTimes.length, 9);
  const sum = r.sectorTimes.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - r.time) < 1e-6);
});

test('daily challenge: same circuit for everyone on a day, different the next, streaks', () => {
  const a = dailyDef('2026-12-01'), b = dailyDef('2026-12-01'), c = dailyDef('2026-12-02');
  assert.equal(a.seed, b.seed);
  assert.notEqual(a.seed, c.seed);
  assert.equal(a.id, dailyId('2026-12-01'));
  assert.ok(a.gold > 40);
  let st = bumpStreak({}, '2026-12-01');
  st = bumpStreak(st, '2026-12-02');
  assert.equal(st.streak, 2);
  st = bumpStreak(st, '2026-12-04');
  assert.equal(st.streak, 1);
  assert.equal(st.best, 2);
});

test('account codes and save merging', () => {
  const code = newAccountCode();
  assert.equal(parseCode(formatCode(code).toLowerCase()), code);
  assert.equal(parseCode('nope'), null);
  const a = { best: { 1: { time: 80 } }, bestLap: { 1: 25 }, unlocked: 3, stats: { races: 5, distance: 1000 }, achievements: { first: 'x' }, name: 'A', profileAt: 1, trophies: { meadow: 2 } };
  const b = { best: { 1: { time: 78 }, 2: { time: 90 } }, bestLap: { 1: 26 }, unlocked: 5, stats: { races: 2, distance: 5000 }, achievements: { gold: 'y' }, name: 'B', profileAt: 2, trophies: { meadow: 1 } };
  const m = mergeSaves(a, unpackSave(packSave(b)));
  assert.equal(m.best[1].time, 78);
  assert.equal(m.best[2].time, 90);
  assert.equal(m.bestLap[1], 25);
  assert.equal(m.unlocked, 5);
  assert.equal(m.stats.distance, 5000);
  assert.equal(m.stats.races, 5);
  assert.deepEqual(Object.keys(m.achievements).sort(), ['first', 'gold']);
  assert.equal(m.name, 'B');
  assert.equal(m.trophies.meadow, 1);
});

test('achievements from the save', () => {
  const save = { stats: { races: 1, distance: 600000, driftBest: 6000, driftTotal: 10, wins: 1, topSpeed: 90 }, best: {}, trophies: { meadow: 1 }, daily: { best: 7 } };
  const got = earnedFromSave({ save, counts: { any: 0, gold: 0 }, tracks: TRACKS, medalOf: () => null, carsUnlocked: false });
  for (const id of ['first', 'far', 'drift1', 'drift5', 'win', 'cup', 'daily', 'streak', 'fast']) assert.ok(got.includes(id), id);
  assert.ok(!got.includes('gold'));
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
});
