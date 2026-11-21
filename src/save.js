// Everything saved in this browser: best times, unlocks, paint and settings.
// Ghost recordings are kept under their own keys so the main save stays small.
const KEY = 'redline-save-v1';

export const DEFAULT_SETTINGS = {
  quality: 'high', // high, medium, low
  camera: 'chase', // chase, far, hood, bumper
  units: 'kmh', // kmh, mph
  racingLine: true,
  ghost: 'best', // off, best, record, both
  shake: true,
  fov: 70,
  sfx: 1,
  music: 0.5,
  mute: false,
  fps: false,
  aiLevel: 'normal', // easy, normal, hard
  grid: 'back', // races: back, random or qualify
  laps: 3, // races against the AI: 1, 3 or 5 laps
  weather: 'default', // races against the AI: default (the circuit's own), dry, rain or later (rain arrives mid-race)
  tod: 'day', // races against the AI: day, sunset or night
  keys: {}, // your own keys: { action: key code } (see input.js)
  dynRes: true, // lower the resolution when the frame rate drops
  colorBlind: false, // symbols on sector times, blue/orange instead of green/red
  mirror: 'races', // races, always, off
  hints: true,
  rumble: true,
  steer: 'buttons', // touch: buttons or tilt
  tiltInvert: false,
  autoGas: false, // touch: accelerate unless braking
  fullscreen: true, // touch: go fullscreen (landscape) for races
  touchInit: false, // phone-friendly defaults applied
};

function read(key, fallback) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}

export function loadSave() {
  const s = read(KEY, {});
  const settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  if (typeof settings.ghost === 'boolean') settings.ghost = settings.ghost ? 'best' : 'off';
  return {
    name: s.name || `Driver ${1000 + Math.floor(Math.random() * 9000)}`,
    best: s.best || {}, // track id -> { time, lap, splits, laps }
    bestLap: s.bestLap || {}, // track id -> best single lap
    unlocked: Math.max(1, s.unlocked || 1),
    paint: s.paint || 'red',
    car: s.car || 'gt',
    settings,
    stats: { races: 0, distance: 0, time: 0, laps: 0, ...(s.stats || {}) },
    bestSectors: s.bestSectors || {}, // track id -> [sector 1, 2, 3] fastest ever
    raceBest: s.raceBest || {}, // track id -> best finishing position against the AI
    carBest: s.carBest || {}, // track id -> { car id: best time in that car }
    medals: s.medals || null, // track id -> best medal won in any car ('gold', 'silver', 'bronze')
    earned: s.earned ?? (s.stats && s.stats.driftTotal) ?? 0, // drift points banked into the wallet, ever (older saves start with every drift point scored so far)
    spent: s.spent || 0, // drift points spent in the tuning shop, ever (wallet = earned - spent)
    kits: s.kits || {}, // car id -> [tuning kits bought]
    setup: s.setup || {}, // car id -> { gearing, balance, bias } slider positions, -1..1
    achievements: s.achievements || {}, // id -> date earned
    trophies: s.trophies || {}, // theme -> best championship finish (1 = won)
    cup: s.cup || null, // championship in progress
    daily: s.daily || {}, // { last, streak, best }
    dailyCache: s.dailyCache || {}, // day -> { seed, gold }
    weekly: s.weekly || {}, // { key, paid }: this week's prize paid so far
    weeklyCache: s.weeklyCache || {}, // week -> { seed, gold }
    account: s.account || null, // { code, pid }
    profileAt: s.profileAt || 0,
    last: s.last,
  };
}

export function storeSave(save) { write(KEY, save); }
export const loadGhost = (id) => read(`redline-ghost-${id}`, null);
export const storeGhost = (id, data) => write(`redline-ghost-${id}`, data);
// circuits you've drawn in the track editor
export const loadMyTracks = () => { const v = read('redline-mytracks', []); return Array.isArray(v) ? v : []; };
export const storeMyTracks = (list) => write('redline-mytracks', list);
