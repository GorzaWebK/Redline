// Community circuits: drawn in the track editor, checked by the autopilot,
// then shared online for everyone to race (each with its own leaderboard).
// A circuit is a list of points (metres) that the track builder turns into a
// smooth road, plus a name, setting, road width and how hilly it is.
// Plain logic (no drawing): runs in Node for the tests.

import { generateTrack } from './track.js';
import { Bot } from './bot.js';
import { simulate } from './race.js';
import { hashString } from './rng.js';

export const MAX_POINTS = 40;
export const WHY = {
  few: 'Add at least 4 points.',
  short: 'Too short: a lap needs to be at least 450 m. Spread the points out.',
  long: 'Too long: keep a lap under about 4.5 km.',
  curve: 'Some corners are too tight to smooth out. Move those points further apart.',
  overlap: 'Parts of the road are too close together (or cross). Keep them apart.',
};

const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
export function newTrackId() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return s;
}

/** Points as compact text ('x,z;x,z;...', whole metres) and back. */
export const encodePts = (pts) => pts.map(([x, z]) => `${Math.round(x)},${Math.round(z)}`).join(';');
export function decodePts(text) {
  if (typeof text !== 'string' || !/^-?\d+,-?\d+(;-?\d+,-?\d+){3,39}$/.test(text)) return null;
  return text.split(';').map((p) => p.split(',').map(Number));
}

/**
 * A community circuit in the same shape as an entry of TRACKS.
 * def: { id, name, author, theme, width, hills, pts, gold, published }.
 */
export function customTrack(def) {
  return {
    id: `u${def.id}`, cid: def.id, name: def.name || 'Untitled', author: def.author || '', theme: def.theme || 'meadow',
    style: 'custom', diff: 0.5, wet: false, community: true, published: !!def.published,
    width: def.width || 'normal', hills: def.hills ?? 0.5, pts: def.pts,
    seed: hashString(`redline-custom-${def.id}`) % 1000000,
    gold: def.gold || 0, golds: {}, likes: def.likes || 0, at: def.at || 0,
  };
}

/** Build the road for a circuit: { track } or { why: a reason it can't be built }. */
export function buildCustom(tr) {
  const t = generateTrack(tr.seed, tr.diff, 'custom', tr);
  return t ? { track: t } : { why: WHY[generateTrack.why] || 'This layout does not work.' };
}

/**
 * The autopilot drives 3 laps: a clean run sets the gold time (needed to
 * publish). Returns { ok, gold } or { ok: false, why }.
 */
export function checkCustom(tr) {
  const b = buildCustom(tr);
  if (!b.track) return { ok: false, why: b.why };
  const bot = new Bot(b.track);
  const race = simulate(b.track, (c) => bot.drive(c), { maxTime: 900 });
  if (race.state !== 'finished') return { ok: false, why: 'The autopilot could not finish a lap. Check for very tight spots.' };
  if (race.wallHits || race.grassTime > 0.5) return { ok: false, why: 'The autopilot could not get round cleanly. Ease the tightest corners.' };
  return { ok: true, gold: Math.ceil(race.time * 10) / 10 };
}

/** A starting layout for a new circuit: a rounded rectangle with a kink. */
export function starterPts() {
  return [[-220, -110], [0, -150], [220, -110], [270, 0], [220, 110], [60, 90], [-60, 150], [-220, 110], [-270, 0]];
}
