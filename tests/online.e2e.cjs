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
  check(!(await ok(db.set(db.ref(B.d, `redline/scores/t31/${B.uid}`), entry('Bob', 100, 30)))), 'rules: only tracks 1-30');
  check(await ok(db.set(db.ref(B.d, `redline/scores/t30/${B.uid}`), entry('Bob', 100, 30))), 'rules: track 30 (Riviera) has a board');
  check(await ok(db.set(db.ref(B.d, `redline/scores/t30_hyper/${B.uid}`), entry('Bob', 100, 30, { car: 'hyper' }))), 'rules: per-car boards (t30_hyper)');
  check(!(await ok(db.set(db.ref(B.d, `redline/scores/t29_hyper/${B.uid}`), entry('Bob', 100, 30, { car: 'gt' })))), "rules: a car's board only takes that car");
  check(!(await ok(db.set(db.ref(B.d, `redline/scores/t29_tank/${B.uid}`), entry('Bob', 100, 30, { car: 'gt' })))), 'rules: no boards for made-up cars');
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
  // daily boards and the car field
  check(await ok(db.set(db.ref(A.d, `redline/scores/d20261119/${A.uid}`), entry('Alice', 100, 30, { car: 'hyper' }))), 'rules: daily boards (d20261119) accept times, with the car');
  check(!(await ok(db.set(db.ref(A.d, `redline/scores/d20261340/${A.uid}`), entry('Alice', 100, 30)))), 'rules: not a real date');
  check(!(await ok(db.set(db.ref(A.d, `redline/scores/t5/${A.uid}`), entry('Alice', 100, 30, { car: 'tank' })))), 'rules: only real cars');
  // accounts: a code holds a save; another browser can join it and save times under it
  const code = 'ABCDEFGHJKLMNPQR';
  check(await ok(db.set(db.ref(A.d, `redline/accounts/${code}`), { pid: A.uid, save: 'RS1.{}', at: db.serverTimestamp() })), 'rules: make an account');
  check(!(await ok(db.set(db.ref(B.d, `redline/accounts/${code}`), { pid: B.uid, save: 'RS1.{}', at: db.serverTimestamp() }))), "rules: you can't take over someone's account id");
  check(!(await ok(db.set(db.ref(A.d, `redline/accounts/abc`), { pid: A.uid, save: 'RS1.{}', at: db.serverTimestamp() }))), 'rules: codes must look like codes');
  check(!(await ok(db.set(db.ref(B.d, `redline/scores/t7/${A.uid}`), entry('Alice', 100, 30)))), "rules: without joining, you can't save under the account");
  check(await ok(db.set(db.ref(B.d, `redline/members/${A.uid}/${B.uid}`), code)), 'rules: a browser with the code can join the account');
  check(!(await ok(db.set(db.ref(B.d, `redline/members/${A.uid}/${B.uid}`), 'ZZZZZZZZZZZZZZZZ'))), 'rules: joining needs the right code');
  check(await ok(db.set(db.ref(B.d, `redline/scores/t7/${A.uid}`), entry('Alice', 100, 30))), 'rules: after joining, it can save times under the account');
  // community circuits: publish, like once, only the author can take it down
  const trk = (uid, extra = {}) => ({ name: 'My Loop', author: 'Alice', pts: '-220,-110;0,-150;220,-110;270,0;220,110;-220,110', theme: 'riviera', width: 'normal', hills: 0.4, gold: 95.5, uid, at: db.serverTimestamp(), likes: 0, ...extra });
  check(await ok(db.set(db.ref(A.d, 'redline/community/abcd2345'), trk(A.uid))), 'rules: publish a community circuit');
  check(!(await ok(db.set(db.ref(B.d, 'redline/community/abcd2345'), trk(B.uid)))), "rules: you can't overwrite someone's circuit");
  check(!(await ok(db.set(db.ref(B.d, 'redline/community/zzzz2345'), trk(A.uid)))), 'rules: a circuit must be published under your own id');
  check(!(await ok(db.set(db.ref(B.d, 'redline/community/zzzz2346'), trk(B.uid, { pts: '<script>' })))), 'rules: circuit points must be points');
  check(!(await ok(db.set(db.ref(B.d, 'redline/community/zzzz2347'), trk(B.uid, { likes: 99 })))), 'rules: a new circuit starts with no likes');
  check(!(await ok(db.set(db.ref(B.d, 'redline/community/ZZ'), trk(B.uid)))), 'rules: circuit ids look like ids');
  const like = (who) => db.update(db.ref(who.d, 'redline'), { [`votes/abcd2345/${who.uid}`]: true, 'community/abcd2345/likes': 1 });
  check(await ok(like(B)), 'rules: like a circuit (vote + one more like)');
  check(!(await ok(db.update(db.ref(B.d, 'redline'), { [`votes/abcd2345/${B.uid}`]: true, 'community/abcd2345/likes': 2 }))), "rules: you can't like twice");
  check(!(await ok(db.set(db.ref(B.d, 'redline/community/abcd2345/likes'), 50))), "rules: likes can't be set by hand");
  check(!(await ok(db.set(db.ref(B.d, 'redline/community/abcd2345/name'), 'Hacked'))), "rules: you can't rename someone's circuit");
  check(await ok(db.get(db.ref(anon.d, 'redline/community'))), 'rules: anyone can browse community circuits');
  check(!(await ok(db.set(db.ref(B.d, 'redline/community/abcd2345'), null))), "rules: you can't delete someone else's circuit");
  check(await ok(db.set(db.ref(B.d, `redline/scores/uabcd2345/${B.uid}`), entry('Bob', 100, 30))), 'rules: community circuits have leaderboards');
  check(await ok(db.set(db.ref(A.d, 'redline/community/abcd2345'), null)), 'rules: the author can take their circuit down');
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
    await bob.evaluate(() => window.__redline.fastForward(5, false)); // wait on the line: the ghost drives off ahead
    await bob.waitForTimeout(1500);
    const tags = await bob.$$eval('.ntag', (els) => els.filter((e) => e.style.display !== 'none').map((e) => e.textContent));
    check(tags.some((t) => /WR\s*Alice/.test(t)), `a name tag floats over the world record ghost: ${JSON.stringify(tags)}`);

    // account codes: Bob makes a code; a new browser uses it and gets Bob's progress
    await bob.keyboard.press('Escape'); await bob.click('#btnPauseMenu');
    await bob.click('#btnStats'); await bob.click('#profTabs button[data-tab=acctBox]');
    await bob.click('#btnAcctMake');
    await bob.waitForFunction(() => window.__redline.save.account, null, { timeout: 15000 }).catch(() => {});
    const code = await bob.textContent('#acctCode');
    check(/^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}$/.test(code), `an account code is made (${code})`);
    const bobBest = await bob.evaluate(() => window.__redline.save.best[1].time);
    await bob.waitForTimeout(5000); // the account saves a few seconds after changes
    await bob.context().close();
    const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const carl = await ctx3.newPage();
    await carl.goto(URL);
    await carl.waitForFunction(() => window.__redline, null, { timeout: 60000 });
    await carl.click('#btnStats'); await carl.click('#profTabs button[data-tab=acctBox]');
    await carl.fill('#acctInput', code.toLowerCase());
    await carl.click('#btnAcctUse');
    await carl.waitForFunction(() => window.__redline.save.best[1], null, { timeout: 15000 }).catch(() => {});
    const got = await carl.evaluate(() => ({ best: window.__redline.save.best[1] && window.__redline.save.best[1].time, name: window.__redline.save.name }));
    check(got.best === bobBest && got.name === 'Bob', `another browser loads the account: ${JSON.stringify(got)}`);

    // community circuits: Carl draws one, the autopilot checks it, he publishes it
    await carl.click('#acctBox .back, #stats .back').catch(() => carl.evaluate(() => document.querySelector('#stats .back').click()));
    await carl.click('#btnTracks');
    await carl.click('#trackTabs button[data-mode=community]');
    await carl.click('#trackList .card');
    await carl.fill('#edName', 'Carls Loop'); await carl.press('#edName', 'Enter'); await carl.locator('#edName').dispatchEvent('change');
    await carl.click('#edCheck');
    await carl.waitForFunction(() => /ready to publish/.test(document.getElementById('edStatus').textContent), null, { timeout: 20000 }).catch(() => {});
    await carl.click('#edPublish');
    await carl.waitForFunction(() => /Published/.test(document.getElementById('edStatus').textContent), null, { timeout: 15000 }).catch(() => {});
    check(/Published/.test(await carl.textContent('#edStatus')), `a circuit is published from the editor ("${await carl.textContent('#edStatus')}")`);
    await carl.context().close();
    // Dana finds it under Newest and likes it
    const ctx4 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const dana = await ctx4.newPage();
    dana.on('pageerror', (e) => check(false, `page error: ${e.message}`));
    await dana.goto(URL);
    await dana.waitForFunction(() => window.__redline, null, { timeout: 60000 });
    await dana.click('#btnTracks');
    await dana.click('#trackTabs button[data-mode=community]');
    await dana.waitForSelector('#trackList .theme-block:nth-child(2) .card', { timeout: 15000 }).catch(() => {});
    const shared = await dana.$$eval('#trackList .theme-block:nth-child(2) .card', (els) => els.map((e) => e.textContent));
    check(shared.some((t) => t.includes('Carls Loop') && t.includes('by Bob')), `another player sees it under Newest: ${JSON.stringify(shared)}`);
    await dana.click('#trackList .theme-block:nth-child(2) .card .like');
    await dana.waitForFunction(() => /👍 1/.test(document.querySelector('#trackList .theme-block:nth-child(2) .card .like').textContent), null, { timeout: 10000 }).catch(() => {});
    check(/👍 1/.test(await dana.textContent('#trackList .theme-block:nth-child(2) .card .like')), 'they can like it');
    await dana.click('#trackList .theme-block:nth-child(2) .card .nm');
    await dana.waitForFunction(() => window.__redline.mode === 'race', null, { timeout: 15000 }).catch(() => {});
    check(await dana.evaluate(() => window.__redline.cur.tr.name === 'Carls Loop' && window.__redline.mode === 'race'), 'and race it');
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
