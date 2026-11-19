// Online leaderboard tests against the local Firebase emulators.
// Run with: npm run test:online   (starts the emulators, then this file)
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; };

async function rulesTests() {
  const { initializeApp, setLogLevel } = await import('firebase/app');
  setLogLevel('silent'); // the rejected writes below are expected
  const { getAuth, connectAuthEmulator, signInAnonymously } = await import('firebase/auth');
  const db = await import('firebase/database');
  const config = { apiKey: 'demo-key', projectId: 'demo-redline', databaseURL: 'http://127.0.0.1:9000?ns=demo-redline' };
  async function client(name, signIn = true) {
    const app = initializeApp(config, name);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const d = db.getDatabase(app);
    db.connectDatabaseEmulator(d, '127.0.0.1', 9000);
    const uid = signIn ? (await signInAnonymously(auth)).user.uid : null;
    return { d, uid };
  }
  const ok = async (p) => { try { await p; return true; } catch { return false; } };
  const entry = (name, time, lap, extra = {}) => ({ name, time, lap, at: db.serverTimestamp(), ...extra });
  const A = await client('a'), B = await client('b'), anon = await client('anon', false);
  const refA = db.ref(A.d, `redline/scores/t24/${A.uid}`);

  check(await ok(db.set(refA, entry('Alice', 200, 60))), 'rules: a signed-in driver can save a time');
  check(!(await ok(db.set(refA, entry('Alice', 210, 60)))), 'rules: a slower time cannot replace a faster one');
  check(await ok(db.set(refA, entry('Alice', 190, 60))), 'rules: a faster time replaces the old one');
  check(await ok(db.set(refA, entry('Alice B', 190, 60))), 'rules: the same time with a new name is allowed');
  check(!(await ok(db.set(db.ref(A.d, `redline/scores/t24/${B.uid}`), entry('Mallory', 100, 30)))), "rules: you can't write someone else's time");
  check(!(await ok(db.set(db.ref(anon.d, `redline/scores/t24/x`), entry('Anon', 100, 30)))), 'rules: you must be signed in');
  check(!(await ok(db.set(db.ref(B.d, `redline/scores/t25/${B.uid}`), entry('Bob', 100, 30)))), 'rules: only tracks 1-24');
  check(!(await ok(db.set(db.ref(B.d, `redline/scores/t3/${B.uid}`), entry('Bob', 10, 3)))), 'rules: impossibly fast times are refused');
  check(!(await ok(db.set(db.ref(B.d, `redline/scores/t3/${B.uid}`), entry('Bob', 100, 40)))), 'rules: a best lap slower than a third of the race is refused');
  check(!(await ok(db.set(db.ref(B.d, `redline/scores/t3/${B.uid}`), entry('<b>Bob</b>', 100, 30)))), 'rules: names with odd characters are refused');
  check(!(await ok(db.set(db.ref(B.d, `redline/scores/t3/${B.uid}`), entry('Bob', 100, 30, { extra: 1 })))), 'rules: no extra fields');
  check(!(await ok(db.set(db.ref(B.d, `redline/scores/t3/${B.uid}`), { name: 'Bob', time: 100, lap: 30, at: 5 }))), 'rules: the timestamp must be the server time');
  // ghosts must match the time saved in the same write
  check(await ok(db.update(db.ref(B.d, 'redline'), {
    [`scores/t3/${B.uid}`]: entry('Bob', 100, 30),
    [`ghosts/t3/${B.uid}`]: { time: 100, data: 'R1.AAAA', at: db.serverTimestamp() },
  })), 'rules: a time and its ghost can be saved together');
  check(!(await ok(db.set(db.ref(B.d, `redline/ghosts/t3/${B.uid}`), { time: 90, data: 'R1.AAAA', at: db.serverTimestamp() }))), "rules: a ghost has to match the driver's saved time");
  check(!(await ok(db.set(db.ref(B.d, `redline/ghosts/t3/${B.uid}`), { time: 100, data: 'nope', at: db.serverTimestamp() }))), 'rules: ghost data must be a Redline recording');
  check(!(await ok(db.set(db.ref(A.d, `redline/ghosts/t3/${B.uid}`), { time: 100, data: 'R1.AAAA', at: db.serverTimestamp() }))), "rules: you can't replace someone else's ghost");
  check(await ok(db.get(db.ref(anon.d, 'redline/scores/t3'))), 'rules: anyone can read a leaderboard');
  check(!(await ok(db.get(db.ref(anon.d, 'redline')))), "rules: you can't download the whole redline/ tree at once");
  // tidy up so the browser tests start clean (owner token clears everything)
  await fetch('http://127.0.0.1:9000/redline.json?ns=demo-redline', { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
}

async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not start`);
}

async function browserTests() {
  const server = spawn('npx', ['vite', 'preview', '--port', '4180', '--strictPort'], { stdio: 'ignore' });
  try {
    await waitFor('http://127.0.0.1:4180/');
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const URL = 'http://127.0.0.1:4180/?emulator=1&unlock=all';
    async function driver(name, idle) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => check(false, `page error: ${e.message}`));
      await page.goto(URL);
      await page.waitForFunction(() => window.__redline, null, { timeout: 60000 });
      await page.evaluate((n) => { window.__redline.save.name = n; }, name);
      await page.click('#btnPlay');
      await page.evaluate((s) => window.__redline.fastForward(s, false), idle);
      await page.evaluate(() => window.__redline.fastForward(130));
      await page.waitForFunction(() => /World rank/.test(document.getElementById('finOnline').textContent), null, { timeout: 20000 })
        .catch(() => {});
      return page;
    }
    const alice = await driver('Alice', 3.5);
    check(/World rank #1/.test(await alice.textContent('#finOnline')), `first driver is world rank #1 ("${await alice.textContent('#finOnline')}")`);
    await alice.context().close(); // software WebGL is slow: one page at a time
    const bob = await driver('Bob', 6);
    check(/World rank #2/.test(await bob.textContent('#finOnline')), `slower second driver is rank #2 ("${await bob.textContent('#finOnline')}")`);

    await bob.click('#btnFinMenu');
    await bob.click('#btnBoards');
    await bob.waitForSelector('.boardlist .r', { timeout: 15000 }).catch(async () => console.log('boardList:', await bob.textContent('#boardList'), await bob.evaluate(() => window.__lastBoardError)));
    const rows = await bob.$$eval('.boardlist .r', (els) => els.map((e) => e.textContent));
    check(rows.length === 2 && rows[0].includes('Alice') && rows[1].includes('Bob (you)'), `leaderboard lists Alice then Bob: ${JSON.stringify(rows)}`);
    check(/You: #2/.test(await bob.textContent('#boardMe')), 'leaderboard shows your rank');

    // racing the world record ghost
    await bob.click('#boards .back');
    await bob.evaluate(() => { window.__redline.settings.ghost = 'record'; window.__redline.startRace(window.__redline.TRACKS[0]); });
    await bob.waitForFunction(() => window.__redline.recordGhost, null, { timeout: 15000 }).catch(() => {});
    const info = await bob.evaluate(() => window.__redline.recordInfo && { name: window.__redline.recordInfo.name, time: window.__redline.recordInfo.time });
    check(info && info.name === 'Alice', `the world record ghost (Alice's) loads: ${JSON.stringify(info)}`);
    check(/Record/.test(await bob.textContent('#target')), 'the HUD shows the record time');
    await browser.close();
  } finally {
    server.kill();
  }
}

(async () => {
  await rulesTests();
  await browserTests();
  console.log(failures ? `${failures} FAILED` : 'All online tests passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
