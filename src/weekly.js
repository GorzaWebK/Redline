// The weekly tournament: one circuit a week (Monday to Sunday, UTC), the same
// for everyone, driven in one car that everyone has to use (stock, no tuning),
// with its own online leaderboard. It alternates Grand Prix, classic and
// figure-of-eight layouts. Medals pay drift points into your wallet, once per
// medal per week. Like every circuit it's only used once the autopilot has
// driven it cleanly in that car, and that time is the gold medal.

import { hashString, mulberry32 } from './rng.js';
import { generateTrack } from './track.js';
import { THEME_IDS } from './tracks.js';
import { Bot } from './bot.js';
import { simulate } from './race.js';
import { CARS, carById } from './cars.js';

const DAY_MS = 86400000, WEEK_MS = DAY_MS * 7;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKLY_PRIZE = { bronze: 1500, silver: 3000, gold: 6000 }; // drift points

/** ISO week of a date (UTC): { year, week, monday (ms) }. */
function isoWeek(d) {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  const monday = t - dow * DAY_MS;
  const thursday = monday + 3 * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const week = 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / WEEK_MS);
  return { year, week, monday };
}

/** 'YYYY-Www' for the week a date falls in. */
export function weekKey(d = new Date()) {
  const { year, week } = isoWeek(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
/** The board id for a week: 'w202647'. */
export const weeklyId = (key) => `w${key.replace('-W', '')}`;

/** Milliseconds until the next week's circuit (Monday 00:00 UTC). */
export function msToNextWeek(now = Date.now()) {
  const { monday } = isoWeek(new Date(now));
  return monday + WEEK_MS - now;
}

/**
 * A week's circuit, in the same shape as an entry of TRACKS (plus car: the car
 * everyone drives). cached: { seed, gold } from an earlier visit.
 */
export function weeklyDef(key = weekKey(), cached = null) {
  const [y, w] = key.split('-W').map(Number);
  const n = y * 53 + w;
  const rnd = mulberry32(hashString(`redline-weekly-${key}`));
  const style = ['gp', 'classic', 'gp', 'eight'][n % 4];
  const theme = THEME_IDS[n % THEME_IDS.length];
  const car = CARS[Math.floor(rnd() * CARS.length)].id;
  const diff = 0.4 + rnd() * 0.45;
  const wet = rnd() < 0.25;
  // the Monday of that week, for the name
  const jan4 = Date.UTC(y, 0, 4), mon1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
  const mon = new Date(mon1 + (w - 1) * WEEK_MS), sun = new Date(mon.getTime() + 6 * DAY_MS);
  const name = `Weekly · ${mon.getUTCDate()} ${MONTHS[mon.getUTCMonth()]} – ${sun.getUTCDate()} ${MONTHS[sun.getUTCMonth()]}`;
  const def = { id: weeklyId(key), key, name, theme, diff, style, wet, weekly: true, car, seed: 0, gold: 0, golds: {} };
  if (cached && cached.seed && cached.gold) return { ...def, seed: cached.seed, gold: cached.gold, golds: { [car]: cached.gold } };
  const spec = carById(car).spec;
  let seed = hashString(`redline-week-${key}`) % 1000000;
  for (let tries = 0; tries < 600; tries++, seed++) {
    const t = generateTrack(seed, diff, style);
    if (!t || t.L > 2300 || t.L < 900) continue;
    t.wet = wet;
    const bot = new Bot(t, 0.9, spec);
    const race = simulate(t, (c) => bot.drive(c), { spec });
    if (race.state !== 'finished' || race.wallHits || race.grassTime > 0.25) continue;
    const gold = Math.ceil(race.time * 10) / 10;
    return { ...def, seed, gold, golds: { [car]: gold } };
  }
  return null;
}
