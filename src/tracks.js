// The 30 circuits, in five themed sets of six. Each one is a seed, a difficulty
// and a style: generateTrack(seed, diff, style) rebuilds the same layout every
// time. The first 24 are 'classic' loops; the six Riviera circuits are Grand
// Prix layouts (long straights, chicanes, hairpins) and figures of eight.
// Seeds and gold times (one per car) live in track-seeds.js, written by
// scripts/find-seeds.mjs.

import { SEEDS } from './track-seeds.js';
import { generateTrack } from './track.js';

export const THEME_IDS = ['meadow', 'canyon', 'alpine', 'night', 'riviera'];

const NAMES = [
  'Greenway', 'Willow Bend', 'Hayfield Loop', 'Brookside', 'Orchard Rise', 'Thornhill',
  'Dust Bowl', 'Red Mesa', 'Sidewinder', 'Sunscorch', 'Butte Run', 'Rattlesnake Pass',
  'Frostline', 'Pine Hollow', 'Glacier Gate', 'Summit Sprint', 'Avalanche', 'Icefall',
  'Neon Mile', 'Harbour Lights', 'Midnight Ring', 'Overpass', 'Blackout', 'Redline',
];

// the Riviera set: Grand Prix circuits and figures of eight with a bridge
const GP = [
  { name: 'Esplanade', diff: 0.35, style: 'gp' },
  { name: 'Twin Hairpins', diff: 0.5, style: 'gp' },
  { name: 'Crossover', diff: 0.5, style: 'eight' },
  { name: 'Long Straight', diff: 0.7, style: 'gp' },
  { name: 'Cliffside', diff: 0.85, style: 'gp' },
  { name: 'Bridgeworks', diff: 0.9, style: 'eight' },
];

export const CLASSIC_COUNT = NAMES.length;
export const TRACK_COUNT = NAMES.length + GP.length;

/** Circuits raced in the rain (less grip; gold times are set in the wet too). */
export const WET_TRACKS = new Set([4, 11, 16, 22]);

/** Difficulty 0..1 for classic track index k. */
export const diffOf = (k) => k / (CLASSIC_COUNT - 1);

/** What each circuit is, before its seed is known (find-seeds.mjs uses this). */
export const TRACK_SPECS = [
  ...NAMES.map((name, k) => ({ name, theme: THEME_IDS[Math.floor(k / 6)], diff: diffOf(k), style: 'classic', wet: WET_TRACKS.has(k + 1) })),
  ...GP.map((g) => ({ ...g, theme: 'riviera', wet: false })),
];

export const TRACKS = TRACK_SPECS.map((sp, k) => ({
  id: k + 1,
  ...sp,
  seed: SEEDS[k] ? SEEDS[k].seed : 0,
  gold: SEEDS[k] ? SEEDS[k].gold : 0, // seconds: the autopilot's 3-lap time in the Redline GT
  golds: SEEDS[k] ? SEEDS[k].golds || {} : {}, // per car
}));

// silver and bronze are this much slower than gold
export const MEDALS = [
  { id: 'gold', name: 'Gold', mult: 1 },
  { id: 'silver', name: 'Silver', mult: 1.1 },
  { id: 'bronze', name: 'Bronze', mult: 1.25 },
];

/** The gold time for a car on a track (each car has its own; the GT's if unknown). */
export const goldFor = (tr, car = 'gt') => (tr.golds && tr.golds[car]) || tr.gold;

export function medalTimes(tr, car = 'gt') {
  const g = goldFor(tr, car);
  return MEDALS.map((m) => ({ ...m, time: Math.ceil(g * m.mult * 10) / 10 }));
}

/** The medal a time earns on a track in a car (or null). */
export function medalFor(tr, time, car = 'gt') {
  if (!time || !goldFor(tr, car)) return null;
  return medalTimes(tr, car).find((m) => time <= m.time) || null;
}

export const MEDAL_RANK = { gold: 3, silver: 2, bronze: 1 };

const cache = new Map();
export function trackData(tr) {
  const key = `${tr.seed}|${tr.diff}|${tr.wet ? 1 : 0}|${tr.style || 'classic'}` + (tr.style === 'custom' ? `|${tr.width}|${tr.hills}|${JSON.stringify(tr.pts)}` : '');
  if (!cache.has(key)) {
    const t = generateTrack(tr.seed, tr.diff, tr.style || 'classic', tr);
    if (t) t.wet = !!tr.wet;
    cache.set(key, t);
  }
  return cache.get(key);
}
