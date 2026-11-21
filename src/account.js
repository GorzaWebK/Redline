// Account codes. Your progress (best times, medals, unlocks, trophies,
// achievements, stats, name, car and paint) is stored online under a secret
// 16-character code. Paste the code into Redline in another browser to carry
// on there. The code works like a password: anyone who has it can use the account.
//
// Saving from two computers is fine: saves are merged (fastest times, every
// unlock, the highest stats, the newest name, car and paint).

export const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O, 1/I
const CODE_LEN = 16;

export function newAccountCode() {
  const bytes = new Uint8Array(CODE_LEN);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < CODE_LEN; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/** "ABCD-EFGH-JKLM-NPQR" */
export const formatCode = (code) => code.match(/.{1,4}/g).join('-');

/** The bare code from what someone typed (dashes, spaces and case don't matter), or null. */
export function parseCode(text) {
  const c = String(text ?? '').toUpperCase().replace(/[\s-]/g, '');
  return c.length === CODE_LEN && [...c].every((ch) => CODE_CHARS.includes(ch)) ? c : null;
}

const KEYS = ['name', 'best', 'bestLap', 'bestSectors', 'raceBest', 'carBest', 'medals', 'earned', 'spent', 'kits', 'setup', 'unlocked', 'paint', 'car', 'stats', 'achievements', 'trophies', 'daily', 'profileAt'];

/** The parts of a save that travel with an account, as text. */
export function packSave(save) {
  const out = {};
  for (const k of KEYS) if (save[k] !== undefined) out[k] = save[k];
  return 'RS1.' + JSON.stringify(out);
}

export function unpackSave(text) {
  if (typeof text !== 'string' || !text.startsWith('RS1.')) return null;
  try {
    const v = JSON.parse(text.slice(4));
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});

/** Combine two saves (a = this browser, b = from the account). Returns a new save object (only account keys). */
export function mergeSaves(a, b) {
  b = obj(b);
  const out = {};
  // best runs: the faster one wins, whole record
  out.best = { ...obj(a.best) };
  for (const [id, r] of Object.entries(obj(b.best))) {
    if (!r || num(r.time) === null) continue;
    if (!out.best[id] || r.time < out.best[id].time) out.best[id] = r;
  }
  const minMap = (x, y) => {
    const m = { ...obj(x) };
    for (const [k, v] of Object.entries(obj(y))) if (num(v) !== null && (m[k] === undefined || v < m[k])) m[k] = v;
    return m;
  };
  out.bestLap = minMap(a.bestLap, b.bestLap);
  out.raceBest = minMap(a.raceBest, b.raceBest);
  out.trophies = minMap(a.trophies, b.trophies);
  out.bestSectors = { ...obj(a.bestSectors) };
  for (const [id, secs] of Object.entries(obj(b.bestSectors))) {
    if (!Array.isArray(secs)) continue;
    const mine = out.bestSectors[id] || [];
    out.bestSectors[id] = [0, 1, 2].map((i) => {
      const x = num(mine[i]), y = num(secs[i]);
      return x === null ? y : y === null ? x : Math.min(x, y);
    });
  }
  out.carBest = {};
  for (const src of [obj(a.carBest), obj(b.carBest)]) for (const [id, m] of Object.entries(src)) out.carBest[id] = minMap(out.carBest[id], m);
  const RANK = { gold: 3, silver: 2, bronze: 1 };
  out.medals = { ...obj(a.medals) };
  for (const [id, m] of Object.entries(obj(b.medals))) if ((RANK[m] || 0) > (RANK[out.medals[id]] || 0)) out.medals[id] = m;
  // the drift wallet: both totals only ever grow, so the larger of each is right
  out.earned = Math.max(num(a.earned) || 0, num(b.earned) || 0);
  out.spent = Math.max(num(a.spent) || 0, num(b.spent) || 0);
  out.kits = { ...obj(a.kits) };
  for (const [car, list] of Object.entries(obj(b.kits))) if (Array.isArray(list)) out.kits[car] = [...new Set([...(out.kits[car] || []), ...list])];
  out.setup = { ...obj(b.setup), ...obj(a.setup) };
  out.unlocked = Math.max(num(a.unlocked) || 1, num(b.unlocked) || 1);
  out.achievements = { ...obj(b.achievements), ...obj(a.achievements) };
  out.stats = { ...obj(a.stats) };
  for (const [k, v] of Object.entries(obj(b.stats))) if (num(v) !== null) out.stats[k] = Math.max(num(out.stats[k]) || 0, v);
  const da = obj(a.daily), db = obj(b.daily);
  out.daily = { last: (da.last || '') > (db.last || '') ? da.last : db.last, streak: Math.max(da.streak || 0, db.streak || 0), best: Math.max(da.best || 0, db.best || 0) };
  // name, car and paint: whichever was changed most recently
  const newer = (num(b.profileAt) || 0) >= (num(a.profileAt) || 0) ? b : a; // a tie goes to the account
  for (const k of ['name', 'paint', 'car']) out[k] = newer[k] ?? a[k] ?? b[k];
  out.profileAt = Math.max(num(a.profileAt) || 0, num(b.profileAt) || 0);
  return out;
}
