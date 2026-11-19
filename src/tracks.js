// The 24 circuits, in four themed sets of six. Each one is a seed plus a
// difficulty: generateTrack(seed, diff) rebuilds the same layout every time.
// Seeds and gold times live in track-seeds.js, written by scripts/find-seeds.mjs.

import { SEEDS } from './track-seeds.js';
import { generateTrack } from './track.js';

export const THEME_IDS = ['meadow', 'canyon', 'alpine', 'night'];

const NAMES = [
  'Greenway', 'Willow Bend', 'Hayfield Loop', 'Brookside', 'Orchard Rise', 'Thornhill',
  'Dust Bowl', 'Red Mesa', 'Sidewinder', 'Sunscorch', 'Butte Run', 'Rattlesnake Pass',
  'Frostline', 'Pine Hollow', 'Glacier Gate', 'Summit Sprint', 'Avalanche', 'Icefall',
  'Neon Mile', 'Harbour Lights', 'Midnight Ring', 'Overpass', 'Blackout', 'Redline',
];

export const TRACK_COUNT = NAMES.length;

/** Circuits raced in the rain (less grip; gold times are set in the wet too). */
export const WET_TRACKS = new Set([4, 11, 16, 22]);

/** Difficulty 0..1 for track index k. */
export const diffOf = (k) => k / (TRACK_COUNT - 1);

export const TRACKS = NAMES.map((name, k) => ({
  id: k + 1,
  name,
  theme: THEME_IDS[Math.floor(k / 6)],
  diff: diffOf(k),
  wet: WET_TRACKS.has(k + 1),
  seed: SEEDS[k] ? SEEDS[k].seed : 0,
  gold: SEEDS[k] ? SEEDS[k].gold : 0, // seconds, the autopilot's 3-lap time
}));

// silver and bronze are this much slower than gold
export const MEDALS = [
  { id: 'gold', name: 'Gold', mult: 1 },
  { id: 'silver', name: 'Silver', mult: 1.1 },
  { id: 'bronze', name: 'Bronze', mult: 1.25 },
];

export function medalTimes(tr) {
  return MEDALS.map((m) => ({ ...m, time: Math.ceil(tr.gold * m.mult * 10) / 10 }));
}

/** The medal a time earns on a track (or null). */
export function medalFor(tr, time) {
  if (!time || !tr.gold) return null;
  return medalTimes(tr).find((m) => time <= m.time) || null;
}

const cache = new Map();
export function trackData(tr) {
  const key = `${tr.seed}|${tr.diff}|${tr.wet ? 1 : 0}`;
  if (!cache.has(key)) {
    const t = generateTrack(tr.seed, tr.diff);
    if (t) t.wet = !!tr.wet;
    cache.set(key, t);
  }
  return cache.get(key);
}
