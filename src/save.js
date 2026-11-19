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
    settings,
    stats: { races: 0, distance: 0, time: 0, laps: 0, ...(s.stats || {}) },
  };
}

export function storeSave(save) { write(KEY, save); }
export const loadGhost = (id) => read(`redline-ghost-${id}`, null);
export const storeGhost = (id, data) => write(`redline-ghost-${id}`, data);
