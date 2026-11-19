import { ONLINE_CONFIG } from './online-config.js';

// Online leaderboards: Firebase Realtime Database + anonymous sign-in, on the
// shared project. Everything lives under redline/:
//   redline/scores/t<N>/<uid> = { name, time, lap, at }   one best per player per track
//   redline/ghosts/t<N>/<uid> = { time, data, at }         the recording of that best
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

const board = (trackId) => `t${trackId}`;

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

/**
 * Submit a finished race. Saved only if it beats your online best (or your name
 * changed). A new best uploads its ghost in the same write. Returns { saved, best }.
 */
export async function submitScore(trackId, name, time, lap, ghost = null) {
  const f = await connect();
  const id = board(trackId);
  const mine = f.ref(f.db, `redline/scores/${id}/${f.uid}`);
  const current = (await withTimeout(f.get(mine), 'Loading your time')).val();
  const clean = cleanName(name);
  if (current && current.time <= time && current.name === clean) return { saved: false, best: current.time };
  const improved = !current || time < current.time;
  const entry = improved
    ? { name: clean, time, lap, at: f.serverTimestamp() }
    : { name: clean, time: current.time, lap: current.lap, at: f.serverTimestamp() };
  if (improved && ghost) {
    await withTimeout(f.update(f.ref(f.db, 'redline'), {
      [`scores/${id}/${f.uid}`]: entry,
      [`ghosts/${id}/${f.uid}`]: { time, data: ghost, at: f.serverTimestamp() },
    }), 'Saving your time');
  } else {
    await withTimeout(f.set(mine, entry), 'Saving your time');
  }
  return { saved: true, best: entry.time };
}

/** Top `count` times on a track: [{ uid, name, time, lap, me }], fastest first. */
export async function getLeaderboard(trackId, count = 10) {
  const f = await connect();
  const q = f.query(f.ref(f.db, `redline/scores/${board(trackId)}`), f.orderByChild('time'), f.limitToFirst(count));
  const snap = await withTimeout(f.get(q), 'Loading the leaderboard');
  const out = [];
  snap.forEach((c) => { const v = c.val(); out.push({ uid: c.key, name: v.name, time: v.time, lap: v.lap, me: c.key === f.uid }); });
  return out.sort((a, b) => a.time - b.time);
}

/** Your entry and world position on a track: { time, lap, rank } or null. */
export async function getMyRank(trackId) {
  const f = await connect();
  const id = board(trackId);
  const mine = (await withTimeout(f.get(f.ref(f.db, `redline/scores/${id}/${f.uid}`)), 'Loading your time')).val();
  if (!mine) return null;
  const q = f.query(f.ref(f.db, `redline/scores/${id}`), f.orderByChild('time'), f.endAt(mine.time), f.limitToFirst(2000));
  const snap = await withTimeout(f.get(q), 'Loading your rank');
  let ahead = 0;
  snap.forEach((c) => { if (c.val().time < mine.time) ahead++; });
  return { time: mine.time, lap: mine.lap, rank: ahead + 1 };
}

/** The world record's ghost on a track: { name, time, data } or null. */
export async function getRecordGhost(trackId) {
  const top = await getLeaderboard(trackId, 1);
  if (!top.length) return null;
  const f = await connect();
  const g = (await withTimeout(f.get(f.ref(f.db, `redline/ghosts/${board(trackId)}/${top[0].uid}`)), 'Loading the record ghost')).val();
  if (!g || typeof g.data !== 'string') return null;
  return { name: top[0].name, time: g.time, data: g.data, me: top[0].me };
}
