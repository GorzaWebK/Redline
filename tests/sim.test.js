import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, trackData, medalFor } from '../src/tracks.js';
import { Bot } from '../src/bot.js';
import { Race, simulate } from '../src/race.js';
import { generateTrack } from '../src/track.js';

test('every circuit builds and the autopilot drives it cleanly in its gold time', () => {
  assert.equal(TRACKS.length, 30);
  for (const tr of TRACKS) {
    const t = trackData(tr);
    assert.ok(t, `track ${tr.id} builds`);
    const bot = new Bot(t);
    const race = simulate(t, (c) => bot.drive(c));
    assert.equal(race.state, 'finished', `track ${tr.id} finished`);
    assert.equal(race.wallHits, 0, `track ${tr.id} no wall hits`);
    assert.ok(Math.abs(race.time - tr.gold) < 0.11, `track ${tr.id}: ${race.time} vs gold ${tr.gold}`);
    assert.equal(race.lapTimes.length, 3);
    assert.equal(medalFor(tr, race.time).id, 'gold');
  }
});

test('the same seed always gives the same track and the same run', () => {
  const a = generateTrack(TRACKS[5].seed, TRACKS[5].diff), b = generateTrack(TRACKS[5].seed, TRACKS[5].diff);
  assert.deepEqual(a.x, b.x);
  const run = () => { const bot = new Bot(a); return simulate(a, (c) => bot.drive(c)).time; };
  assert.equal(run(), run());
});

test('driving backwards over the line does not count laps', () => {
  const t = trackData(TRACKS[0]);
  const race = new Race(t);
  for (let k = 0; k < 120 * 40; k++) race.step({ throttle: 0, brake: 1, steer: 0 });
  assert.equal(race.lap, 0);
  assert.ok(race.progress < 0);
});

test('the car stays still during the countdown and recover puts it back on the road', () => {
  const t = trackData(TRACKS[3]);
  const race = new Race(t);
  const x0 = race.car.x;
  for (let k = 0; k < 120 * 2.9; k++) race.step({ throttle: 1, brake: 0, steer: 1 });
  assert.equal(race.state, 'countdown');
  assert.equal(race.car.x, x0);
  for (let k = 0; k < 120 * 6; k++) race.step({ throttle: 1, brake: 0, steer: 1 }); // into the wall
  race.recover();
  assert.ok(Math.abs(race.car.loc.lat) < 0.5);
  assert.equal(race.car.u, 0);
});
