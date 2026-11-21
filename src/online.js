import { ONLINE_CONFIG } from './online-config.js';

// Online leaderboards: Firebase Realtime Database + anonymous sign-in, on the
// shared project. Everything lives under redline/:
//   redline/scores/<board>/<pid> = { name, time, lap, car, at }  one best per player per board
//   redline/ghosts/<board>/<pid> = { time, data, at }            the recording of that best
//   redline/accounts/<code> = { pid, save, at }                  account codes (account.js)
//   redline/members/<pid>/<uid> = code                           browsers that joined an account
// A board is t1..t30 for the circuits or d20261119 for a day's daily challenge.
// Each also has one board per car: t5_hyper is the Apex V10's board on track 5.
// The security rules only let you write your own entries and only improve your time.
//
// ?emulator=1 talks to local Firebase emulators instead (for testing).

const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const useEmulator = params.has('emulator');
const forcedOffline = typeof window !== 'undefined' && window.__REDLINE_OFFLINE === true;
export const onlineEnabled = useEmulator || (!!ONLINE_CONFIG && !forcedOffline);

const TIMEOUT_MS = 8000;
let connecting = null;

function withTimeout(promise, what) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), TIMEOUT_MS)),
  ]);
}

/** Driver names: letters, digits, spaces, _ . - and at most 16 characters (the database checks this too). */
export function cleanName(name) {
  const n = String(name ?? '').replace(/[^A-Za-z0-9 _.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return n || 'Driver';
}

const board = (trackId, car = null) => (typeof trackId === 'number' ? `t${trackId}` : String(trackId)) + (car ? `_${car}` : '');

async function connect() {
  if (!onlineEnabled) throw new Error('Online is switched off');
  if (connecting) return connecting;
  connecting = (async () => {
    const [{ initializeApp }, authMod, dbMod] = await Promise.all([
      import('firebase/app'), import('firebase/auth'), import('firebase/database'),
    ]);
    const config = useEmulator
      ? { apiKey: 'demo-key', projectId: 'demo-redline', databaseURL: 'http://127.0.0.1:9000?ns=demo-redline' }
      : ONLINE_CONFIG;
    const app = initializeApp(config, 'redline');
    const auth = authMod.getAuth(app);
    const db = dbMod.getDatabase(app);
    if (useEmulator) {
      authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      dbMod.connectDatabaseEmulator(db, '127.0.0.1', 9000);
    }
    const cred = await withTimeout(authMod.signInAnonymously(auth), 'Signing in');
    return { db, uid: cred.user.uid, ...dbMod };
  })();
  try { return await connecting; } catch (e) { connecting = null; throw e; }
}

export async function myUid() { return (await connect()).uid; }

// --- accounts -------------------------------------------------------------
// Times are saved under your account id ("pid"): this browser's sign-in id,
// or with an account code, the account's id (this browser joins the account
// first, which the rules check before letting it save there).
let account = null, joined = null;
export function setAccount(a) { account = a && a.code && a.pid ? { code: a.code, pid: a.pid } : null; }

async function ident() {
  const f = await connect();
  if (!account || account.pid === f.uid) return { ...f, pid: f.uid };
  if (joined !== account.code) {
    try {
      await withTimeout(f.set(f.ref(f.db, `redline/members/${account.pid}/${f.uid}`), account.code), 'Joining your account');
      joined = account.code;
    } catch { return { ...f, pid: f.uid }; }
  }
  return { ...f, pid: account.pid };
}

/** A new account holding `save` (text from packSave). Returns { code, pid }. */
export async function createAccount(code, save) {
  const f = await connect();
  await withTimeout(f.set(f.ref(f.db, `redline/accounts/${code}`), { pid: f.uid, save, at: f.serverTimestamp() }), 'Creating your account');
  return { code, pid: f.uid };
}
/** { pid, save } for a code, or null. */
export async function fetchAccount(code) {
  const f = await connect();
  const v = (await withTimeout(f.get(f.ref(f.db, `redline/accounts/${code}`)), 'Loading the account')).val();
  return v && typeof v.pid === 'string' && typeof v.save === 'string' ? { pid: v.pid, save: v.save } : null;
}
export async function writeAccount(code, save) {
  const f = await connect();
  const cur = (await withTimeout(f.get(f.ref(f.db, `redline/accounts/${code}/pid`)), 'Loading the account')).val();
  await withTimeout(f.set(f.ref(f.db, `redline/accounts/${code}`), { pid: cur || f.uid, save, at: f.serverTimestamp() }), 'Saving to your account');
}

/**
 * Submit a finished race. Saved only if it beats your online best (or your name
 * changed). A new best uploads its ghost in the same write. Returns { saved, best }.
 */
export async function submitScore(trackId, name, time, lap, ghost = null, car = 'gt') {
  const f = await ident();
  const clean = cleanName(name);
  const ids = [board(trackId), board(trackId, car)]; // the overall board and this car's board
  const currents = await Promise.all(ids.map((id) => withTimeout(f.get(f.ref(f.db, `redline/scores/${id}/${f.pid}`)), 'Loading your time').then((x) => x.val())));
  const up = {};
  let best = time, saved = false;
  ids.forEach((id, k) => {
    const current = currents[k];
    if (k === 0 && current) best = Math.min(best, current.time);
    if (current && current.time <= time && current.name === clean) return;
    const improved = !current || time < current.time;
    up[`scores/${id}/${f.pid}`] = improved
      ? { name: clean, time, lap, car, at: f.serverTimestamp() }
      : { name: clean, time: current.time, lap: current.lap, car: current.car || car, at: f.serverTimestamp() };
    if (improved && ghost) up[`ghosts/${id}/${f.pid}`] = { time, data: ghost, at: f.serverTimestamp() };
    saved = true;
  });
  if (saved) await withTimeout(f.update(f.ref(f.db, 'redline'), up), 'Saving your time');
  return { saved, best };
}

/** Top `count` times on a track: [{ uid, name, time, lap, me }], fastest first. */
export async function getLeaderboard(trackId, count = 10, car = null) {
  const f = await ident();
  const q = f.query(f.ref(f.db, `redline/scores/${board(trackId, car)}`), f.orderByChild('time'), f.limitToFirst(count));
  const snap = await withTimeout(f.get(q), 'Loading the leaderboard');
  const out = [];
  snap.forEach((c) => { const v = c.val(); out.push({ uid: c.key, name: v.name, time: v.time, lap: v.lap, car: v.car || 'gt', me: c.key === f.pid }); });
  return out.sort((a, b) => a.time - b.time);
}

/** Your entry and world position on a track: { time, lap, rank } or null. */
export async function getMyRank(trackId, car = null) {
  const f = await ident();
  const id = board(trackId, car);
  const mine = (await withTimeout(f.get(f.ref(f.db, `redline/scores/${id}/${f.pid}`)), 'Loading your time')).val();
  if (!mine) return null;
  const q = f.query(f.ref(f.db, `redline/scores/${id}`), f.orderByChild('time'), f.endAt(mine.time), f.limitToFirst(2000));
  const snap = await withTimeout(f.get(q), 'Loading your rank');
  let ahead = 0;
  snap.forEach((c) => { if (c.val().time < mine.time) ahead++; });
  return { time: mine.time, lap: mine.lap, rank: ahead + 1 };
}

/** The world record's ghost on a track: { name, time, data } or null. */
export async function getRecordGhost(trackId, car = null) {
  const top = await getLeaderboard(trackId, 1, car);
  if (!top.length) return null;
  const f = await connect();
  const g = (await withTimeout(f.get(f.ref(f.db, `redline/ghosts/${board(trackId, car)}/${top[0].uid}`)), 'Loading the record ghost')).val();
  if (!g || typeof g.data !== 'string') return null;
  return { name: top[0].name, time: g.time, data: g.data, me: top[0].me, car: top[0].car };
}

// ---------- community circuits ----------
//   redline/community/<id> = { name, author, pts, theme, width, hills, gold, uid, at, likes }
//   redline/votes/<id>/<uid> = true   (one like each; likes goes up by exactly one with it)

/** Share a circuit drawn in the editor (it must have a gold time from the autopilot). */
export async function publishTrack(def, author) {
  const f = await connect();
  const entry = {
    name: cleanName(def.name || 'Untitled'), author: cleanName(author), pts: def.ptsText, theme: def.theme,
    width: def.width, hills: Math.round((def.hills ?? 0.5) * 100) / 100, gold: def.gold, uid: f.uid, at: f.serverTimestamp(), likes: 0,
  };
  await withTimeout(f.set(f.ref(f.db, `redline/community/${def.id}`), entry), 'Publishing your circuit');
  return true;
}

/** Shared circuits: order 'new' (newest first) or 'top' (most liked first). */
export async function listCommunity(order = 'new', count = 24) {
  const f = await connect();
  const q = f.query(f.ref(f.db, 'redline/community'), f.orderByChild(order === 'top' ? 'likes' : 'at'), f.limitToLast(count));
  const snap = await withTimeout(f.get(q), 'Loading community circuits');
  const out = [];
  snap.forEach((c) => { const v = c.val(); if (v && typeof v.pts === 'string') out.push({ id: c.key, ...v, mine: v.uid === f.uid }); });
  return out.reverse();
}

/** Like a circuit (once). Returns the new like count. */
export async function likeTrack(id) {
  const f = await connect();
  const cur = (await withTimeout(f.get(f.ref(f.db, `redline/community/${id}/likes`)), 'Liking')).val() || 0;
  await withTimeout(f.update(f.ref(f.db, 'redline'), { [`votes/${id}/${f.uid}`]: true, [`community/${id}/likes`]: cur + 1 }), 'Liking');
  return cur + 1;
}

/** Take down one of your own circuits. */
export async function deleteTrack(id) {
  const f = await connect();
  await withTimeout(f.set(f.ref(f.db, `redline/community/${id}`), null), 'Removing your circuit');
}
