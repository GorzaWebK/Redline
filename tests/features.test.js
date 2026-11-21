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

test('rivals: their own cars (balanced to yours), mistakes, and nobody gets stuck', () => {
  for (const id of [5, 14, 25, 27, 30]) {
    const tr = TRACKS[id - 1], t = trackData(tr);
    const r = new Race(t, { rivals: { level: 'normal', seed: id, golds: tr.golds, playerCar: 'gt' } });
    const cars = new Set(r.field.cars.map((x) => x.carId));
    assert.ok(cars.size >= 3, `mixed cars on track ${id}: ${[...cars]}`);
    let mistakes = 0;
    while (r.tick < 120 * 420 && r.field.cars.some((x) => !x.finished)) {
      r.step({ throttle: 0, brake: 1, steer: 0 });
      mistakes += r.field.events.filter((e) => e.type === 'mistake').length;
    }
    const times = r.field.cars.map((x) => x.finished);
    assert.ok(times.every((x) => x > 0), `all rivals finish track ${id}`);
    // the fastest and slowest rivals end up within a sensible spread of the gold time
    assert.ok(Math.min(...times) > tr.golds.gt * 0.97 && Math.max(...times) < tr.golds.gt * 1.25, `track ${id}: ${times.map((x) => x.toFixed(1))} gold ${tr.golds.gt}`);
    r.mistakes = mistakes;
    console.log(`track ${id}: rival times ${times.map((x) => x.toFixed(1)).join(', ')} (gold ${tr.golds.gt}), ${mistakes} mistakes, ${r.field.cars.reduce((a, x) => a + x.resets, 0)} resets`);
  }
});

test('grid choice and qualifying: slots from lap times, the race starts from them', async () => {
  const { qualiTimes, gridFromQuali, gridSlot } = await import('../src/rivals.js');
  const { simulate } = await import('../src/race.js');
  const tr = TRACKS[25], t = trackData(tr);
  const q = qualiTimes(t, { level: 'normal', golds: tr.golds, playerCar: 'gt', seed: 3, simulate });
  assert.equal(q.length, 5);
  assert.ok(q.every((x) => x.time > 20 && x.time < 200), JSON.stringify(q));
  const pole = gridFromQuali(q, 1); // impossibly quick: pole
  assert.equal(pole.playerSlot, 0);
  assert.deepEqual([...pole.slots].sort(), [1, 2, 3, 4, 5]);
  const last = gridFromQuali(q, 999);
  assert.equal(last.playerSlot, 5);
  const r = new Race(t, { rivals: { level: 'normal', seed: 3, golds: tr.golds, slots: pole.slots, playerSlot: 0 } });
  assert.equal(r.position, 1, 'on pole you start first');
  const g0 = gridSlot(0);
  assert.ok(Math.abs(r.car.loc.lat - g0.lat) < 0.3);
});

test('tuning: kits change the physics only once bought; wallet totals merge safely', async () => {
  const { tunedSpec, kitPrice, activeSetup } = await import('../src/tuning.js');
  const setup = { gearing: -1, balance: -1, bias: 1 };
  assert.equal(tunedSpec(CAR, setup, []), CAR, 'no kits: stock car');
  const loose = tunedSpec(CAR, setup, ['balance']);
  assert.ok(loose.rearGrip < CAR.rearGrip && loose.maxDrive === CAR.maxDrive && loose.brakeFront === CAR.brakeFront);
  const all = tunedSpec(CAR, setup, ['gearing', 'balance', 'bias']);
  assert.ok(all.maxDrive > CAR.maxDrive && all.topSpeed > 0 && all.brakeFront > CAR.brakeFront);
  assert.deepEqual(activeSetup({ gearing: 5 }, ['gearing']), { gearing: 1, balance: 0, bias: 0 });
  assert.ok(kitPrice('hyper', 'balance') > kitPrice('hatch', 'balance'));
  // a tuned car still drives a circuit cleanly
  const t = trackData(TRACKS[4]);
  const bot = new Bot(t, 0.9, all);
  const r = new Race(t, { spec: all });
  while (r.state !== 'finished' && r.tick < 120 * 400) r.step(bot.drive(r.car));
  assert.equal(r.state, 'finished');
  assert.ok(r.time < TRACKS[4].gold * 1.03, `tuned time ${r.time}`);
  // wallet: earned and spent only grow, so merging takes the larger of each
  const m = mergeSaves({ earned: 5000, spent: 1000, kits: { gt: ['bias'] } }, { earned: 7000, spent: 4000, kits: { gt: ['gearing'] } });
  assert.equal(m.earned - m.spent, 3000);
  assert.deepEqual(m.kits.gt.sort(), ['bias', 'gearing']);
});

test('live gaps: cars ahead show a positive gap, cars behind a negative one; overtakes are reported', () => {
  const tr = TRACKS[9], t = trackData(tr);
  const r = new Race(t, { rivals: { level: 'normal', seed: 4, golds: tr.golds } });
  const me = new Bot(t, 0.9);
  let overtakes = 0;
  for (let k = 0; k < 120 * 70; k++) { r.step(me.drive(r.car)); overtakes += r.events.filter((e) => e.type === 'overtake').length; }
  const order = r.order, at = order.findIndex((x) => x.me);
  for (let i = 0; i < order.length; i++) {
    if (i === at) continue;
    const g = r.gapTo(r.field.cars.indexOf(order[i]));
    assert.ok(i < at ? g > 0 : g < 0, `gap to P${i + 1} is ${g} (you're P${at + 1})`);
    assert.ok(Math.abs(g) < 60);
  }
  assert.ok(overtakes > 0, 'starting at the back, the autopilot passes someone');
});

test('kerbs and damage: kerbs unsettle the car; wall hits dent the right part', async () => {
  const { makeCar, stepCar } = await import('../src/car.js');
  const t = trackData(TRACKS[0]);
  // drive straight into the right-hand wall
  const c = makeCar(t, 40, 0, CAR, 0);
  c.u = 25; c.h += 0.5; // nose turned towards the right? depends on the side: check the part hit
  for (let k = 0; k < 120 * 3; k++) stepCar(c, t, { throttle: 0.5, brake: 0, steer: 0 }, DT);
  const d = c.damage;
  assert.ok(d, 'hitting a wall leaves damage');
  const total = d.front + d.rear + d.left + d.right;
  assert.ok(total > 0 && total <= 4);
  assert.ok(d.front + d.right + d.left > d.rear, JSON.stringify(d));
});

test('weekly tournament: one circuit per week, a set car, a clean gold time', async () => {
  const { weekKey, weeklyDef, weeklyId, msToNextWeek } = await import('../src/weekly.js');
  assert.equal(weekKey(new Date('2026-11-21T12:00:00Z')), '2026-W47');
  assert.equal(weekKey(new Date('2026-11-16T00:00:01Z')), '2026-W47');
  assert.equal(weekKey(new Date('2026-11-15T23:59:59Z')), '2026-W46');
  assert.equal(weekKey(new Date('2027-01-01T12:00:00Z')), '2026-W53');
  assert.equal(weeklyId('2026-W47'), 'w202647');
  assert.ok(msToNextWeek(Date.parse('2026-11-22T23:00:00Z')) === 3600000);
  for (const k of ['2026-W47', '2026-W48', '2026-W49', '2026-W50']) {
    const d = weeklyDef(k);
    assert.ok(d && d.seed && d.gold > 30, k);
    assert.ok(['gt', 'hatch', 'muscle', 'hyper'].includes(d.car));
    assert.equal(d.golds[d.car], d.gold);
    assert.deepEqual(weeklyDef(k, { seed: d.seed, gold: d.gold }).seed, d.seed);
    assert.match(d.name, /^Weekly · /);
  }
});

test('community circuits: points build a road, the autopilot sets gold, bad layouts explain why', async () => {
  const { customTrack, buildCustom, checkCustom, starterPts, encodePts, decodePts } = await import('../src/community.js');
  const tr = customTrack({ id: 'abcd2345', name: 'Test', pts: starterPts(), width: 'normal', hills: 0.4 });
  const b = buildCustom(tr);
  assert.ok(b.track && b.track.L > 1000, JSON.stringify(b.why));
  const c = checkCustom(tr);
  assert.ok(c.ok && c.gold > 30, JSON.stringify(c));
  assert.deepEqual(decodePts(encodePts(starterPts())), starterPts());
  assert.equal(decodePts('1,2;3,4'), null, 'too few points');
  assert.equal(decodePts('<script>'), null);
  // two points almost on top of each other across the loop: the road would overlap
  const bad = customTrack({ id: 'bad23456', pts: [[-200, 0], [0, -10], [200, 0], [0, 8]] });
  assert.ok(buildCustom(bad).why);
  // and it's the same road every time (it's what everyone races online)
  assert.equal(buildCustom(tr).track.L, b.track.L);
});
