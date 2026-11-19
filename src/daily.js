// The daily challenge: a new circuit every day (UTC), the same for everyone.
// Its seed comes from the date; the difficulty, setting and weather change
// from day to day. Like the main circuits, a day's layout is only used once the
// autopilot has driven it cleanly, and its time is the gold medal.

import { hashString, mulberry32 } from './rng.js';
import { generateTrack } from './track.js';
import { THEME_IDS } from './tracks.js';
import { Bot } from './bot.js';
import { simulate } from './race.js';

const DAY_MS = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' for a date (UTC). */
export function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
/** Days since 1 Jan 2026 (UTC), for rotating themes. */
const dayNumber = (key) => Math.floor((Date.parse(`${key}T00:00:00Z`) - Date.parse('2026-01-01T00:00:00Z')) / DAY_MS);

/** Milliseconds until the next daily circuit. */
export function msToNextDay(now = Date.now()) {
  return DAY_MS - (now % DAY_MS);
}

/** The board id used for a day's online leaderboard and best time: 'd20261119'. */
export const dailyId = (key) => `d${key.replace(/-/g, '')}`;

/**
 * A day's circuit, in the same shape as an entry of TRACKS.
 * cached: { seed, gold } from an earlier visit (skips the autopilot check).
 */
export function dailyDef(key = dayKey(), cached = null) {
  const n = dayNumber(key);
  const rnd = mulberry32(hashString(`redline-daily-${key}`));
  const diff = 0.2 + rnd() * 0.6;
  const theme = THEME_IDS[((n % 4) + 4) % 4];
  const wet = rnd() < 0.2;
  const [, m, d] = key.split('-').map(Number);
  const def = { id: dailyId(key), key, name: `Daily · ${d} ${MONTHS[m - 1]}`, theme, diff, wet, daily: true, seed: 0, gold: 0 };
  if (cached && cached.seed && cached.gold) return { ...def, seed: cached.seed, gold: cached.gold };
  let seed = hashString(`redline-day-${key}`) % 1000000;
  for (let tries = 0; tries < 400; tries++, seed++) {
    const t = generateTrack(seed, diff);
    if (!t || t.L > 1800) continue;
    t.wet = wet;
    const bot = new Bot(t);
    const race = simulate(t, (c) => bot.drive(c));
    if (race.state !== 'finished' || race.wallHits || race.grassTime > 0.25) continue;
    return { ...def, seed, gold: Math.ceil(race.time * 10) / 10 };
  }
  return null;
}

/** Update a streak record { last, streak, best } after finishing day `key`. */
export function bumpStreak(st = {}, key = dayKey()) {
  if (st.last === key) return st;
  const yesterday = dayKey(new Date(Date.parse(`${key}T00:00:00Z`) - DAY_MS));
  const streak = st.last === yesterday ? (st.streak || 0) + 1 : 1;
  return { last: key, streak, best: Math.max(st.best || 0, streak) };
}
