// Track generator. A track is a closed loop made from a seed and a difficulty
// (0 = easiest, 1 = hardest). It is stored as evenly spaced samples along the
// centre line (about every SPACING metres), each with a position, height,
// direction, sideways vector and curvature. Everything here is plain maths with
// no drawing code, so the physics, autopilot and tests can use it in Node.
//
// Directions: a heading h points along (cos h, sin h) in the x/z plane. The
// "right" vector of a sample is (-tz, tx): on screen that is the driver's right.
// Positive curvature means the track turns right.

import { CatmullRomCurve3, Vector3 } from 'three';
import { mulberry32 } from './rng.js';

export const SPACING = 2; // metres between centre-line samples
export const RUNOFF = 5.5; // grass between the edge of the road and the wall
export const LAPS = 3;

const TAU = Math.PI * 2;
const wrapAngle = (a) => a - TAU * Math.round(a / TAU);

/** Control points for a classic circuit: a loop round a centre, pinched here and there. */
function classicPoints(rnd, diff) {
  const n = 8 + Math.round(diff * 7) + Math.floor(rnd() * 3);
  const baseR = 150 + diff * 110 + rnd() * 40;
  const varR = 0.22 + 0.33 * diff;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU + (rnd() - 0.5) * (TAU / n) * 0.5;
    let r = baseR * (1 + (rnd() * 2 - 1) * varR);
    if (rnd() < 0.12 + 0.25 * diff) r *= 0.5; // a sharp pinch: makes hairpins
    pts.push(new Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r));
  }
  return pts;
}

/**
 * A Grand Prix circuit, laid out piece by piece like a real one: straights,
 * corners, hairpins, chicanes and fast kinks, in a random order, turning a full
 * circle in all. Two of the straights are then stretched or shortened so the
 * loop closes exactly. Returns { x, z } points every SPACING metres, or null.
 */
function gpPath(rnd, diff) {
  const D = Math.PI / 180;
  // pick turns one at a time until the full circle is nearly used up, then a
  // final corner of whatever is left closes it
  const turns = [];
  let left = Math.PI * 2;
  for (let k = 0; k < 14; k++) {
    const roll = rnd();
    let t;
    if (roll < 0.2 + diff * 0.1) t = { ang: (165 + rnd() * 20) * D, r: 17 + rnd() * 5 }; // hairpin
    else if (roll < 0.45) { const a = (28 + rnd() * 12) * D, r = 24 + rnd() * 8; t = { chicane: [[a, r], [-2 * a, r], [a, r]], ang: 0 }; }
    else if (roll < 0.58) t = { ang: (rnd() < 0.5 ? -1 : 1) * (22 + rnd() * 25) * D, r: 70 + rnd() * 70 }; // fast kink
    else t = { ang: (50 + rnd() * 70) * D * (rnd() < 0.2 ? -1 : 1), r: 26 + rnd() * 40 }; // corner
    if (left - t.ang < 40 * D) break; // would leave too little for the last corner
    turns.push(t);
    left -= t.ang;
    if (turns.length >= 6 && left < 200 * D && rnd() < 0.5) break;
  }
  if (turns.length < 5 || left < 35 * D || left > 200 * D) return null;
  turns.push(left > 150 * D ? { ang: left, r: 18 + rnd() * 4 } : { ang: left, r: 28 + rnd() * 30 });
  // pieces: a straight before every turn
  const pieces = [];
  for (const t of turns) {
    pieces.push({ len: 60 + rnd() * 200 });
    if (t.chicane) for (const [a, r] of t.chicane) pieces.push({ ang: a, r });
    else pieces.push({ ang: t.ang, r: t.r });
  }
  // where does it end up? (straights' headings, and the gap left to close)
  let h = 0, x = 0, z = 0;
  const dirs = [];
  for (const p of pieces) {
    if (p.len !== undefined) { dirs.push([Math.cos(h), Math.sin(h)]); x += Math.cos(h) * p.len; z += Math.sin(h) * p.len; }
    else {
      const sg = Math.sign(p.ang), cx = x - Math.sin(h) * p.r * sg, cz = z + Math.cos(h) * p.r * sg;
      h += p.ang;
      x = cx + Math.sin(h) * p.r * sg; z = cz - Math.cos(h) * p.r * sg;
      dirs.push(null);
    }
  }
  // stretch two straights (i, j) so the loop closes: a d_i + b d_j = -(x, z)
  const straights = pieces.map((p, k) => (p.len !== undefined ? k : -1)).filter((k) => k >= 0);
  let bestPair = null, bestScore = Infinity;
  for (const i of straights) for (const j of straights) {
    if (j <= i) continue;
    const [ax, az] = dirs[i], [bx, bz] = dirs[j];
    const det = ax * bz - az * bx;
    if (Math.abs(det) < 0.3) continue;
    const da = (-x * bz + z * bx) / det, db = (-ax * z + az * x) / det;
    const li = pieces[i].len + da, lj = pieces[j].len + db;
    if (li < 40 || lj < 40 || li > 650 || lj > 650) continue;
    const score = Math.abs(da) + Math.abs(db);
    if (score < bestScore) { bestScore = score; bestPair = [i, li, j, lj]; }
  }
  if (!bestPair) return null;
  pieces[bestPair[0]].len = bestPair[1];
  pieces[bestPair[2]].len = bestPair[3];
  // walk the pieces, dropping a point every SPACING metres
  const px = [], pz = [];
  h = 0; x = 0; z = 0;
  let carry = 0;
  for (const p of pieces) {
    if (p.len !== undefined) {
      let d = carry;
      for (; d < p.len; d += SPACING) { px.push(x + Math.cos(h) * d); pz.push(z + Math.sin(h) * d); }
      carry = d - p.len;
      x += Math.cos(h) * p.len; z += Math.sin(h) * p.len;
    } else {
      const sg = Math.sign(p.ang), cx = x - Math.sin(h) * p.r * sg, cz = z + Math.cos(h) * p.r * sg;
      const arc = Math.abs(p.ang) * p.r;
      let d = carry;
      for (; d < arc; d += SPACING) {
        const hh = h + (d / p.r) * sg;
        px.push(cx + Math.sin(hh) * p.r * sg); pz.push(cz - Math.cos(hh) * p.r * sg);
      }
      carry = d - arc;
      h += p.ang;
      x = cx + Math.sin(h) * p.r * sg; z = cz - Math.cos(h) * p.r * sg;
    }
  }
  if (Math.hypot(x, z) > 1) return null;
  if (rnd() < 0.5) for (let k = 0; k < pz.length; k++) pz[k] = -pz[k]; // mirror: turn the other way round
  return { x: px, z: pz };
}

/** Control points for a figure of eight (a lemniscate, roughed up a little). */
function eightPoints(rnd, diff) {
  const A = 230 + diff * 60 + rnd() * 30, B = A * (0.5 + rnd() * 0.15);
  const pts = [];
  const m = 14;
  for (let k = 0; k < m; k++) {
    const u = (k / m) * TAU;
    const wob = 1 + (rnd() - 0.5) * 0.12;
    pts.push(new Vector3(A * Math.cos(u) * wob, 0, B * Math.sin(u) * Math.cos(u) * 2 * wob));
  }
  return pts;
}

/**
 * Try to build a track. Returns null if this seed doesn't make a good one.
 * style: 'classic' (the original 24 circuits), 'gp' (Grand Prix: long
 * straights, chicanes and hairpins) or 'eight' (a figure of eight with a bridge).
 */
export function generateTrack(seed, diff = 0.5, style = 'classic', custom = null) {
  const rnd = mulberry32(seed);
  let x, z;
  if (style === 'custom') {
    // a circuit drawn in the track editor: its points, in the order drawn
    const pts = (custom && custom.pts) || [];
    if (pts.length < 4) { generateTrack.why = 'few'; return null; }
    const curve = new CatmullRomCurve3(pts.map(([px, pz]) => new Vector3(px, 0, pz)), true, 'centripetal');
    const count = Math.round(curve.getLength() / SPACING);
    if (count < 150) { generateTrack.why = 'short'; return null; }
    if (count > 1500) { generateTrack.why = 'long'; return null; }
    const raw = curve.getSpacedPoints(count).slice(0, count);
    x = raw.map((p) => p.x); z = raw.map((p) => p.z);
  } else if (style === 'gp') {
    const path = gpPath(rnd, diff);
    if (!path) { generateTrack.why = 'noclose'; return null; }
    ({ x, z } = path);
  } else {
    const pts = style === 'eight' ? eightPoints(rnd, diff) : classicPoints(rnd, diff);
    const curve = new CatmullRomCurve3(pts, true, 'centripetal');
    const count = Math.round(curve.getLength() / SPACING);
    const raw = curve.getSpacedPoints(count).slice(0, count);
    x = raw.map((p) => p.x); z = raw.map((p) => p.z);
    if (rnd() < 0.5) { x.reverse(); z.reverse(); }
  }

  const halfW = style === 'custom' ? ({ narrow: 4.8, normal: 5.6, wide: 6.6 }[custom.width] || 5.6) : 6 - diff * 1.2; // road half width
  const minR = style === 'gp' || style === 'custom' ? 14 : 28 - 14 * diff; // tightest corner allowed (radius, metres)
  // smooth until no corner is tighter than minR (or give up); Grand Prix
  // circuits are built from real arcs, so they only get a light touch
  let curv;
  for (let pass = 0; ; pass++) {
    if (style === 'gp' || style === 'custom') smooth(x, z, pass === 0 ? 2 : 1, 1);
    else smooth(x, z, 3, pass < 4 ? 2 : 5);
    curv = curvature(x, z);
    let worst = 0;
    for (const k of curv) worst = Math.max(worst, Math.abs(k));
    if (worst <= 1 / minR) break;
    if (pass > 40) { generateTrack.why = "curve"; return null; }
  }

  // a figure of eight: where does it cross itself?
  const N = x.length;
  let cross = null;
  if (style === 'eight') {
    let bd = Infinity;
    for (let i = 0; i < N; i += 2) for (let j = i + Math.floor(N / 4); j < i + Math.floor((3 * N) / 4) && j < N; j += 2) {
      const d = (x[i] - x[j]) ** 2 + (z[i] - z[j]) ** 2;
      if (d < bd) { bd = d; cross = { i, j }; }
    }
    if (!cross || bd > 30) { generateTrack.why = 'nocross'; return null; }
  }
  // start on the straightest stretch: least turning in the 80 m before and 40 m after
  let best = 0, bestSum = Infinity;
  for (let i = 0; i < N; i += 2) {
    if (cross && Math.min(...[cross.i, cross.j].map((c) => Math.min(Math.abs(i - c), N - Math.abs(i - c)))) < 60) continue; // never start under the bridge
    let sum = 0;
    for (let j = -40; j <= 20; j++) sum += Math.abs(curv[(i + j + N) % N]);
    if (sum < bestSum) { bestSum = sum; best = i; }
  }
  x = rotate(x, best); z = rotate(z, best);
  if (cross) cross = { i: (cross.i - best + N) % N, j: (cross.j - best + N) % N };

  const t = build(x, z, halfW);
  if (cross) t.bridge = { x: (t.x[cross.i] + t.x[cross.j]) / 2, z: (t.z[cross.i] + t.z[cross.j]) / 2, iUp: cross.i, iDown: cross.j, r: 48 };
  if (!clearOfItself(t)) { generateTrack.why = "overlap"; return null; }

  // hills: a few smooth waves that close up over the lap
  const amp = style === 'custom' ? (custom.hills ?? 0.5) * 10 : 1.5 + diff * 9;
  const p1 = rnd() * TAU, p2 = rnd() * TAU, p3 = rnd() * TAU;
  const wave = (s) => {
    const u = (s / t.L) * TAU;
    return (Math.sin(u + p1) + 0.5 * Math.sin(2 * u + p2) + 0.3 * Math.sin(3 * u + p3)) / 1.8;
  };
  let maxGrade = 0;
  const y0 = wave(0);
  const raw2 = t.s.map((s) => wave(s) - y0);
  for (let i = 0; i < N; i++) {
    const g = Math.abs(raw2[(i + 1) % N] - raw2[i]) / SPACING;
    maxGrade = Math.max(maxGrade, g);
  }
  const scale = Math.min(amp, 0.07 / Math.max(maxGrade, 1e-6));
  for (let i = 0; i < N; i++) t.y[i] = raw2[i] * scale;
  if (t.bridge) {
    // one branch climbs over the other: a long, gentle wave that peaks on the
    // bridge and bottoms out underneath it (9.6 m apart at the crossing)
    const sUp = t.s[t.bridge.iUp];
    for (let i = 0; i < N; i++) t.y[i] = 4.8 * Math.cos(((t.s[i] - sUp) / t.L) * TAU) - 4.8 * Math.cos((-sUp / t.L) * TAU);
    if (t.y[t.bridge.iUp] - t.y[t.bridge.iDown] < 8) { generateTrack.why = 'lowbridge'; return null; }
  }
  for (let i = 0; i < N; i++) t.grade[i] = (t.y[(i + 1) % N] - t.y[(i - 1 + N) % N]) / (t.s[1] * 2);

  t.seed = seed;
  t.diff = diff;
  t.line = racingLine(t);
  t.kerb = kerbMap(t);
  return t;
}

/** Which samples have kerbs: the corners (and a little either side). */
export function kerbMap(t) {
  const out = new Uint8Array(t.N);
  for (let i = 0; i < t.N; i++) if (Math.abs(t.curv[i]) > 1 / 75) for (let k = -6; k <= 6; k++) out[(i + k + t.N) % t.N] = 1;
  return out;
}

function smooth(x, z, passes, k = 1) {
  const N = x.length;
  for (let p = 0; p < passes; p++) {
    const nx = x.slice(), nz = z.slice();
    for (let i = 0; i < N; i++) {
      const a = (i - k + N) % N, b = (i + k) % N;
      nx[i] = x[i] * 0.5 + (x[a] + x[b]) * 0.25;
      nz[i] = z[i] * 0.5 + (z[a] + z[b]) * 0.25;
    }
    for (let i = 0; i < N; i++) { x[i] = nx[i]; z[i] = nz[i]; }
  }
}

/** Signed curvature at each sample, measured over a few samples either side. */
export function curvature(x, z, k = 3) {
  const N = x.length, out = new Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - k + N) % N, b = (i + k) % N;
    const h1 = Math.atan2(z[i] - z[a], x[i] - x[a]);
    const h2 = Math.atan2(z[b] - z[i], x[b] - x[i]);
    const d = Math.hypot(x[i] - x[a], z[i] - z[a]) + Math.hypot(x[b] - x[i], z[b] - z[i]);
    out[i] = wrapAngle(h2 - h1) / (d / 2);
  }
  return out;
}

const rotate = (arr, k) => arr.slice(k).concat(arr.slice(0, k));

/** Fill in arc length, directions and curvature for centre-line points. */
function build(x, z, halfW) {
  const N = x.length;
  const s = new Array(N), tx = new Array(N), tz = new Array(N);
  let acc = 0;
  for (let i = 0; i < N; i++) {
    s[i] = acc;
    const j = (i + 1) % N;
    acc += Math.hypot(x[j] - x[i], z[j] - z[i]);
  }
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    const dx = x[b] - x[a], dz = z[b] - z[a], l = Math.hypot(dx, dz);
    tx[i] = dx / l; tz[i] = dz / l;
  }
  return {
    N, x, z, s, tx, tz, L: acc, halfW, wall: halfW + RUNOFF,
    y: new Array(N).fill(0), grade: new Array(N).fill(0), curv: curvature(x, z),
  };
}

/** No two parts of the track (far apart along the lap) may come close enough to share walls. */
function clearOfItself(t) {
  const need = 2 * t.wall + 10, need2 = need * need;
  const gap = Math.ceil((t.wall * 3 + 40) / SPACING);
  const B = t.bridge, near = (k) => B && Math.hypot(t.x[k] - B.x, t.z[k] - B.z) < B.r;
  for (let i = 0; i < t.N; i += 2) {
    for (let j = i + gap; j < t.N; j += 2) {
      if (t.N - j + i < gap) break;
      const dx = t.x[i] - t.x[j], dz = t.z[i] - t.z[j];
      if (dx * dx + dz * dz < need2 && !(near(i) && near(j))) return false; // (except where the bridge crosses)
    }
  }
  return true;
}

/**
 * The racing line: a sideways offset per sample (metres, + = right) that
 * straightens the track out as much as the road allows. Found by repeatedly
 * pulling each point towards the middle of its neighbours, first with far
 * neighbours (long, sweeping changes) and then near ones (detail).
 */
function racingLine(t) {
  const N = t.N, lim = t.halfW - 1.3;
  const o = new Float64Array(N);
  for (const step of [32, 16, 8, 4, 2, 1]) {
    for (let it = 0; it < 120; it++) {
      for (let i = 0; i < N; i++) {
        const a = (i - step + N) % N, b = (i + step) % N;
        const ax = t.x[a] - t.tz[a] * o[a], az = t.z[a] + t.tx[a] * o[a];
        const bx = t.x[b] - t.tz[b] * o[b], bz = t.z[b] + t.tx[b] * o[b];
        const px = t.x[i] - t.tz[i] * o[i], pz = t.z[i] + t.tx[i] * o[i];
        const mx = (ax + bx) / 2 - px, mz = (az + bz) / 2 - pz;
        o[i] += 0.8 * (mx * -t.tz[i] + mz * t.tx[i]);
        if (o[i] > lim) o[i] = lim; else if (o[i] < -lim) o[i] = -lim;
      }
    }
  }
  const lx = new Array(N), lz = new Array(N);
  for (let i = 0; i < N; i++) { lx[i] = t.x[i] - t.tz[i] * o[i]; lz[i] = t.z[i] + t.tx[i] * o[i]; }
  return { off: Array.from(o), x: lx, z: lz, curv: curvature(lx, lz, 4) };
}

/**
 * Where a point is relative to the track. `hint` is the sample it was near last
 * time (searches only around it), or -1 to search the whole track.
 * Returns { i, s, lat, y, grade, tx, tz }: nearest sample, distance along the
 * lap, sideways offset (+ = right of centre), road height and direction there.
 */
export function locate(t, x, z, hint = -1, out = {}) {
  const N = t.N;
  let bi = 0, bd = Infinity;
  if (hint < 0) {
    for (let i = 0; i < N; i++) {
      const dx = x - t.x[i], dz = z - t.z[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bi = i; }
    }
  } else {
    for (let k = -40; k <= 40; k++) {
      const i = (hint + k + N) % N;
      const dx = x - t.x[i], dz = z - t.z[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bi = i; }
    }
  }
  // project onto the segment ahead or behind, whichever the point is beside
  const i = bi, j = (i + 1) % N;
  let along = (x - t.x[i]) * t.tx[i] + (z - t.z[i]) * t.tz[i];
  let a = i, b = j;
  if (along < 0) { a = (i - 1 + N) % N; b = i; }
  const sx = t.x[b] - t.x[a], sz = t.z[b] - t.z[a], sl = Math.hypot(sx, sz);
  let f = ((x - t.x[a]) * sx + (z - t.z[a]) * sz) / (sl * sl);
  f = Math.max(0, Math.min(1, f));
  const txi = t.tx[a] + (t.tx[b] - t.tx[a]) * f, tzi = t.tz[a] + (t.tz[b] - t.tz[a]) * f;
  const tl = Math.hypot(txi, tzi);
  const cx = t.x[a] + sx * f, cz = t.z[a] + sz * f;
  out.i = bi;
  let s = t.s[a] + sl * f;
  if (s >= t.L) s -= t.L;
  out.s = s;
  out.lat = (x - cx) * (-tzi / tl) + (z - cz) * (txi / tl);
  out.y = t.y[a] + (t.y[b] - t.y[a]) * f;
  out.grade = t.grade[a] + (t.grade[b] - t.grade[a]) * f;
  out.tx = txi / tl;
  out.tz = tzi / tl;
  return out;
}

/** Heading angle of the track at sample i. */
export const headingAt = (t, i) => Math.atan2(t.tz[i], t.tx[i]);
