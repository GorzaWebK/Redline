// Redline: game loop, camera, HUD and menus.
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource/barlow-condensed/800-italic.css';
import './style.css';
import * as THREE from 'three';
import { TRACKS, THEME_IDS, trackData, medalTimes, medalFor } from './tracks.js';
import { THEMES } from './themes.js';
import { buildWorld } from './world.js';
import { buildCar, PAINTS } from './carModel.js';
import { Effects } from './effects.js';
import { Race } from './race.js';
import { DT } from './car.js';
import { Bot } from './bot.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Music } from './music.js';
import { GhostRecorder, GhostPlayer, encodeGhost, decodeGhost } from './ghost.js';
import { loadSave, storeSave, loadGhost, storeGhost } from './save.js';
import { onlineEnabled, cleanName, submitScore, getLeaderboard, getMyRank, getRecordGhost } from './online.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const BOT = params.has('bot');
const UNLOCK_ALL = params.get('unlock') === 'all';

// phones and tablets with only a touchscreen
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) {
  $('touch').classList.remove('hidden');
  $('menu').classList.add('hidden');
  throw new Error('touch-only device');
}

const save = loadSave();
const settings = save.settings;
const persist = () => storeSave(save);

// ---------- renderer ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
function applyQuality() {
  const q = settings.quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 2 : q === 'medium' ? 1.25 : 1));
  renderer.shadowMap.enabled = q !== 'low';
  renderer.setSize(innerWidth, innerHeight);
}
applyQuality();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.1, 12000);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const input = new Input();
const sound = new Sound();
sound.setEffectsVolume(settings.sfx);
sound.setMusicVolume(settings.music);
sound.setMuted(settings.mute);
const music = new Music(sound);
const effects = new Effects(scene);

const paintOf = (id) => PAINTS.find((p) => p.id === id) || PAINTS[0];
const carModel = buildCar({ color: paintOf(save.paint).color });
carModel.setPaint(paintOf(save.paint).color, paintOf(save.paint).metal);
scene.add(carModel.root);
const ghostModel = buildCar({ ghost: true });
ghostModel.root.visible = false;
scene.add(ghostModel.root);
const recordModel = buildCar({ ghost: true, ghostColor: 0xffd25a });
recordModel.root.visible = false;
scene.add(recordModel.root);
// headlights (night tracks)
const headlight = new THREE.SpotLight(0xfff2d8, 0, 110, 0.55, 0.55, 1.1);
headlight.position.set(2.0, 0.75, 0);
headlight.target.position.set(25, -0.5, 0);
carModel.root.add(headlight, headlight.target);

// ---------- helpers ----------
export function fmt(t) {
  if (!isFinite(t) || t <= 0) return '0:00.000';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
const fmtShort = (t) => (t ? fmt(t) : '--');
const unlocked = (tr) => UNLOCK_ALL || tr.id <= save.unlocked;
const medalColor = { gold: 'var(--gold)', silver: 'var(--silver)', bronze: 'var(--bronze)' };

function medalCounts() {
  let gold = 0, silver = 0, any = 0;
  for (const tr of TRACKS) {
    const m = medalFor(tr, save.best[tr.id]?.time);
    if (!m) continue;
    any++;
    if (m.id !== 'bronze') silver++;
    if (m.id === 'gold') gold++;
  }
  return { gold, silver, any };
}

// paint unlocks
const PAINT_RULES = {
  blue: { any: 1, text: '1 medal' },
  yellow: { any: 3, text: '3 medals' },
  green: { any: 6, text: '6 medals' },
  orange: { any: 10, text: '10 medals' },
  silver: { silver: 5, text: 'Silver or better on 5 tracks' },
  purple: { any: 15, text: '15 medals' },
  teal: { any: 24, text: 'A medal on every track' },
  pink: { gold: 5, text: 'Gold on 5 tracks' },
  gold: { gold: 24, text: 'Gold on every track' },
};
function paintUnlocked(id, c = medalCounts()) {
  const r = PAINT_RULES[id];
  if (!r) return true;
  return (r.any ? c.any >= r.any : true) && (r.silver ? c.silver >= r.silver : true) && (r.gold ? c.gold >= r.gold : true);
}

// ---------- the current track ----------
let cur = null; // { tr, track, world, map }
function loadTrack(tr) {
  if (cur && cur.tr === tr && cur.quality === settings.quality && cur.line === settings.racingLine) return;
  if (cur) { scene.remove(cur.world.group, cur.world.sky); cur.world.dispose(); }
  const track = trackData(tr);
  const world = buildWorld(track, tr.theme, { quality: settings.quality, racingLine: settings.racingLine });
  scene.add(world.group, world.sky);
  scene.fog = world.fog;
  scene.background = new THREE.Color(world.theme.fog);
  effects.clear();
  effects.setNight(world.theme.night);
  headlight.intensity = world.theme.night ? 90 : 0;
  renderer.toneMappingExposure = world.theme.night ? 1.25 : 1.0;
  cur = { tr, track, world, quality: settings.quality, line: settings.racingLine, map: buildMinimap(track) };
  // park the car on the grid
  const r = new Race(track);
  placeCar(r.car);
  world.setStartLights(0);
}

function placeCar(c) {
  carModel.pose(c.x, c.y, c.z, c.h, c.pitch);
  carModel.animate(0, { steer: c.steer });
}

// ---------- minimap ----------
const mapCanvas = $('minimap'), mapCtx = mapCanvas.getContext('2d');
function buildMinimap(t) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < t.N; i++) { minX = Math.min(minX, t.x[i]); maxX = Math.max(maxX, t.x[i]); minZ = Math.min(minZ, t.z[i]); maxZ = Math.max(maxZ, t.z[i]); }
  const size = mapCanvas.width, pad = 16;
  const sc = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const ox = pad + ((size - pad * 2) - (maxX - minX) * sc) / 2, oz = pad + ((size - pad * 2) - (maxZ - minZ) * sc) / 2;
  const tx = (x) => ox + (x - minX) * sc, tz = (z) => oz + (z - minZ) * sc;
  const img = document.createElement('canvas');
  img.width = img.height = size;
  const g = img.getContext('2d');
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i <= t.N; i += 2) { const k = i % t.N; i ? g.lineTo(tx(t.x[k]), tz(t.z[k])) : g.moveTo(tx(t.x[k]), tz(t.z[k])); }
  g.closePath();
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 9; g.stroke();
  g.strokeStyle = 'rgba(240,242,246,0.9)'; g.lineWidth = 4.5; g.stroke();
  // start line
  const nx = -t.tz[0], nz = t.tx[0];
  g.strokeStyle = '#e8322a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(tx(t.x[0] - nx * 14), tz(t.z[0] - nz * 14)); g.lineTo(tx(t.x[0] + nx * 14), tz(t.z[0] + nz * 14)); g.stroke();
  return { img, tx, tz };
}
function drawMinimap(pose, ghostPose, recordPose) {
  const m = cur.map;
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  mapCtx.drawImage(m.img, 0, 0);
  for (const [gp, col] of [[recordPose, '#ffd25a'], [ghostPose, '#5ff0ff']]) {
    if (!gp) continue;
    mapCtx.fillStyle = col;
    mapCtx.beginPath(); mapCtx.arc(m.tx(gp.x), m.tz(gp.z), 4.5, 0, Math.PI * 2); mapCtx.fill();
  }
  const x = m.tx(pose.x), z = m.tz(pose.z), h = pose.h;
  mapCtx.save();
  mapCtx.translate(x, z); mapCtx.rotate(h);
  mapCtx.fillStyle = '#e8322a'; mapCtx.strokeStyle = '#fff'; mapCtx.lineWidth = 1.5;
  mapCtx.beginPath(); mapCtx.moveTo(8, 0); mapCtx.lineTo(-6, 5.5); mapCtx.lineTo(-3, 0); mapCtx.lineTo(-6, -5.5); mapCtx.closePath();
  mapCtx.fill(); mapCtx.stroke();
  mapCtx.restore();
}

// ---------- race state ----------
let mode = 'menu'; // menu, race, paused, finished
let race = null, bot = null, recorder = null, ghost = null, bestRun = null, watching = false;
let recordGhost = null, recordInfo = null, raceToken = 0;
const recordCache = new Map(); // track id -> promise of the world record ghost (this visit)
function loadRecord(tr) {
  if (!recordCache.has(tr.id)) {
    recordCache.set(tr.id, getRecordGhost(tr.id).catch(() => { recordCache.delete(tr.id); return null; }));
  }
  return recordCache.get(tr.id);
}
let acc = 0, prev = null, lastInput = { throttle: 0, brake: 0, steer: 0 };
let camYaw = 0, camY = 0, shake = 0, lastGear = 1, wrongTime = 0, finishShown = 0;
let countText = '', countUntil = 0, deltaUntil = 0, toastUntil = 0;

function startRace(tr, { watch = false } = {}) {
  if (!tr || !unlocked(tr)) return;
  sound.init();
  loadTrack(tr);
  watching = watch || BOT;
  race = new Race(cur.track);
  bot = watching ? new Bot(cur.track) : null;
  recorder = new GhostRecorder();
  bestRun = save.best[tr.id] || null;
  ghost = null; recordGhost = null; recordInfo = null;
  const token = ++raceToken;
  const gm = settings.ghost;
  const g = gm === 'best' || gm === 'both' ? loadGhost(tr.id) : null;
  if (g) { const f = decodeGhost(g.data); if (f && f.length > 6) ghost = new GhostPlayer(f, cur.track); }
  if ((gm === 'record' || gm === 'both') && onlineEnabled) {
    loadRecord(tr).then((r) => {
      if (token !== raceToken || !r) return;
      const f = decodeGhost(r.data);
      if (!f || f.length <= 6) return;
      recordGhost = new GhostPlayer(f, cur.track);
      recordInfo = r;
      setTarget();
    });
  }
  ghostModel.root.visible = false;
  recordModel.root.visible = false;
  save.last = tr.id;
  mode = 'race';
  acc = 0;
  prev = null;
  shake = 0; lastGear = 1; wrongTime = 0; finishShown = 0;
  camYaw = race.car.h; camY = race.car.y + 2.2;
  effects.clear();
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('lapTotal').textContent = race.laps;
  $('hint').textContent = watching ? 'AUTOPILOT · Esc to stop' : 'C reset car · R restart · V camera · Esc pause';
  $('countdown').textContent = ''; $('countdown').className = '';
  $('delta').className = 'mono';
  setTarget();
  music.play('race');
}

function setTarget() {
  const tr = cur.tr, best = bestRun?.time;
  const times = medalTimes(tr);
  const have = medalFor(tr, best);
  const next = have ? times[times.findIndex((m) => m.id === have.id) - 1] : times[2];
  const dot = (m) => `<span class="medal" style="background:${medalColor[m.id]}"></span>`;
  $('target').innerHTML = (next
    ? `${dot(next)}${next.name} ${fmt(next.time)}${best ? ` · Best ${fmt(best)}` : ''}`
    : `${dot(have)}Best ${fmt(best)}`)
    + (recordInfo ? `<br><span style="color:var(--gold)">Record ${fmt(recordInfo.time)} · ${recordInfo.me ? 'you' : recordInfo.name.replace(/[<>&]/g, '')}</span>` : '');
}

function toast(text, ms = 1600) {
  $('toast').innerHTML = text;
  $('toast').classList.add('show');
  toastUntil = performance.now() + ms;
}

function handleEvents() {
  for (const e of race.events) {
    if (e.type === 'count') { sound.count(); countText = String(e.n); countUntil = performance.now() + 900; }
    else if (e.type === 'go') { sound.go(); countText = 'GO'; countUntil = performance.now() + 800; cur.world.setStartLights('go'); }
    else if (e.type === 'hit') {
      sound.hit(e.v);
      if (settings.shake) shake = Math.min(1, shake + e.v * 0.06);
      const c = race.car, side = Math.sign(c.loc.lat);
      effects.spark(c.x - c.loc.tz * side * 1.0, c.y + 0.5, c.z + c.loc.tx * side * 1.0, 8 + Math.round(e.v * 2));
    } else if (e.type === 'sector') {
      const best = bestRun?.splits?.[e.n - 1];
      if (best) {
        const d = e.time - best;
        $('delta').textContent = `${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(3)}`;
        $('delta').className = `mono show ${d <= 0 ? 'ahead' : 'behind'}`;
        deltaUntil = performance.now() + 3000;
        sound.sector(d <= 0);
      }
    } else if (e.type === 'lap') {
      sound.lap();
      const id = cur.tr.id;
      const pb = !save.bestLap[id] || e.time < save.bestLap[id];
      const best = bestRun?.splits?.[e.lap * 3 - 1];
      if (best) {
        const d = race.splits[race.splits.length - 1] - best;
        $('delta').textContent = `${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(3)}`;
        $('delta').className = `mono show ${d <= 0 ? 'ahead' : 'behind'}`;
        deltaUntil = performance.now() + 3000;
      }
      toast(`${e.lap === race.laps - 1 ? 'FINAL LAP' : `LAP ${e.lap + 1}`}${pb && !watching ? ' · <span style="color:var(--green)">BEST LAP</span>' : ''}`);
      if (pb && !watching) save.bestLap[id] = e.time;
    } else if (e.type === 'finish') onFinish();
    else if (e.type === 'recover') toast('Car reset', 900);
  }
}

function onFinish() {
  const tr = cur.tr, time = race.time;
  mode = 'finished';
  finishShown = performance.now() + 1300;
  const prevBest = save.best[tr.id];
  const pb = !prevBest || time < prevBest.time - 1e-6;
  const medal = medalFor(tr, time);
  const before = PAINTS.filter((p) => paintUnlocked(p.id)).map((p) => p.id);
  let unlockMsg = '';
  if (!watching) {
    if (pb) {
      save.best[tr.id] = { time, splits: race.splits.map((s) => Math.round(s * 1000) / 1000), laps: race.lapTimes.map((s) => Math.round(s * 1000) / 1000) };
      storeGhost(tr.id, { time, data: encodeGhost(recorder.frames) });
    }
    const lap = race.bestLap;
    if (!save.bestLap[tr.id] || lap < save.bestLap[tr.id]) save.bestLap[tr.id] = lap;
    if (tr.id >= save.unlocked && tr.id < TRACKS.length) {
      save.unlocked = tr.id + 1;
      unlockMsg = `Unlocked: Track ${tr.id + 1}, ${TRACKS[tr.id].name}`;
    }
    save.stats.races++;
    save.stats.laps += race.laps;
    const fresh = PAINTS.filter((p) => paintUnlocked(p.id) && !before.includes(p.id));
    if (fresh.length) unlockMsg += `${unlockMsg ? '<br>' : ''}New paint: ${fresh.map((p) => p.name).join(', ')}`;
    persist();
  }
  sound.finish(!!medal);
  // fill in the finish panel
  $('finTitle').textContent = watching ? 'AUTOPILOT FINISHED' : 'FINISHED';
  $('finMedal').innerHTML = medal ? `<div class="medalbig ${medal.id}">${medal.name.toUpperCase()}</div>` : '<div class="sub">No medal this time</div>';
  $('finTime').textContent = fmt(time);
  const times = medalTimes(tr);
  const nextMedal = medal ? times[times.findIndex((m) => m.id === medal.id) - 1] : times[2];
  let note = '';
  if (!watching && pb && prevBest) note = `<span class="pb">New best!</span> ${(prevBest.time - time).toFixed(3)}s faster`;
  else if (!watching && pb) note = '<span class="pb">First finish!</span>';
  else if (prevBest) note = `Best ${fmt(prevBest.time)} (+${(time - prevBest.time).toFixed(3)})`;
  if (nextMedal) note += `${note ? ' · ' : ''}${nextMedal.name} needs ${fmt(nextMedal.time)}`;
  $('finNote').innerHTML = note;
  const bestLap = Math.min(...race.lapTimes);
  $('finLaps').innerHTML = race.lapTimes.map((l, k) => `<span class="${l === bestLap ? 'pb' : ''}">L${k + 1} ${fmt(l)}</span>`).join('');
  $('finUnlock').innerHTML = unlockMsg;
  $('finOnline').textContent = '';
  if (!watching && onlineEnabled) {
    $('finOnline').textContent = 'Sending your time to the leaderboard…';
    const data = encodeGhost(recorder.frames);
    const mine = raceToken;
    submitScore(tr.id, save.name, time, race.bestLap, data)
      .then(() => getMyRank(tr.id))
      .then((r) => {
        recordCache.delete(tr.id);
        if (mine === raceToken && r) $('finOnline').innerHTML = `World rank <b style="color:var(--text)">#${r.rank}</b> · your online best ${fmt(r.time)}`;
      })
      .catch(() => { if (mine === raceToken) $('finOnline').textContent = 'Leaderboard unavailable right now (your time is saved here).'; });
  }
  const next = TRACKS[tr.id];
  $('btnNext').disabled = !next || !unlocked(next);
}

function exitToMenu() {
  mode = 'menu';
  race = null;
  ghostModel.root.visible = false;
  recordModel.root.visible = false;
  $('hud').classList.add('hidden');
  sound.silence();
  music.play('menu');
  persist();
  showScreen('menu');
}

// ---------- screens ----------
const SCREENS = ['menu', 'tracks', 'garage', 'boards', 'stats', 'settings', 'controls', 'pause', 'finish'];
let backTo = 'menu';
function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  if (id === 'menu') refreshMenu();
  if (id === 'tracks') renderTracks();
  if (id === 'garage') renderGarage();
  if (id === 'stats') renderStats();
  if (id === 'boards') renderBoards();
  if (id === 'settings') loadSettingsUI();
}
for (const b of document.querySelectorAll('.back')) b.addEventListener('click', () => { sound.click(); showScreen(backTo); });

function nextTrack() {
  const firstNoMedal = TRACKS.find((tr) => unlocked(tr) && !medalFor(tr, save.best[tr.id]?.time));
  return firstNoMedal || TRACKS.find((t) => t.id === save.last) || TRACKS[0];
}

function refreshMenu() {
  const tr = nextTrack();
  if (!race && (!cur || cur.tr !== tr)) loadTrack(tr);
  $('nextName').textContent = `Track ${tr.id}: ${tr.name}`;
  $('nextBest').textContent = save.best[tr.id] ? `Best ${fmt(save.best[tr.id].time)}` : THEMES[tr.theme].name;
  const c = medalCounts();
  let b = 0;
  for (const tr2 of TRACKS) if (medalFor(tr2, save.best[tr2.id]?.time)?.id === 'bronze') b++;
  $('medalTotals').innerHTML = `<span><span class="dot gold"></span><b>${c.gold}</b></span><span><span class="dot silver"></span><b>${c.silver - c.gold}</b></span><span><span class="dot bronze"></span><b>${b}</b></span><span>${Math.min(save.unlocked, TRACKS.length)}/${TRACKS.length} tracks unlocked</span>`;
}

function renderTracks() {
  const list = $('trackList');
  list.innerHTML = '';
  for (const theme of THEME_IDS) {
    const th = THEMES[theme];
    const block = document.createElement('div');
    block.className = 'theme-block';
    block.innerHTML = `<div class="theme-head"><h3>${th.name}</h3><span class="sub">${th.blurb}</span></div>`;
    const cards = document.createElement('div');
    cards.className = 'cards';
    for (const tr of TRACKS.filter((t) => t.theme === theme)) {
      const best = save.best[tr.id];
      const m = medalFor(tr, best?.time);
      const len = trackData(tr).L;
      const b = document.createElement('button');
      b.className = `card${unlocked(tr) ? '' : ' locked'}`;
      b.innerHTML = `<span class="stripe" style="background:#${new THREE.Color(th.skyTop).getHexString()}"></span>
        <span class="num">${tr.id}</span><span class="nm">${tr.name}</span>
        <span class="meta">${(len / 1000).toFixed(2)} km · 3 laps</span>
        <span class="bt">${unlocked(tr) ? (best ? fmt(best.time) : 'Not raced') : '🔒 Locked'}</span>
        ${m ? `<span class="md" style="background:${medalColor[m.id]}"></span>` : ''}`;
      b.title = unlocked(tr) ? medalTimes(tr).map((x) => `${x.name} ${fmt(x.time)}`).join('\n') : 'Finish the track before to unlock';
      b.addEventListener('click', () => { if (unlocked(tr)) { sound.click(); startRace(tr); } });
      cards.appendChild(b);
    }
    block.appendChild(cards);
    list.appendChild(block);
  }
  const c = medalCounts();
  $('trackTotals').textContent = `${c.gold} gold · ${c.any} medals of ${TRACKS.length}`;
}

function renderGarage() {
  const c = medalCounts();
  const list = $('paintList');
  list.innerHTML = '';
  for (const p of PAINTS) {
    const ok = paintUnlocked(p.id, c);
    const b = document.createElement('button');
    b.className = `paint${save.paint === p.id ? ' on' : ''}${ok ? '' : ' locked'}`;
    b.innerHTML = `<span class="sw" style="background:#${p.color.toString(16).padStart(6, '0')}"></span>${p.name}<span class="req">${ok ? (save.paint === p.id ? 'Selected' : '') : '🔒 ' + PAINT_RULES[p.id].text}</span>`;
    b.addEventListener('click', () => {
      if (!ok) return;
      sound.click();
      save.paint = p.id;
      carModel.setPaint(p.color, p.metal);
      persist();
      renderGarage();
    });
    list.appendChild(b);
  }
}

let boardTrack = 1, boardToken = 0;
const esc = (t) => String(t).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
function renderBoards() {
  $('nameInput').value = save.name;
  const tr = TRACKS[boardTrack - 1];
  $('boardTitle').innerHTML = `${tr.id}. ${tr.name}<span class="sub">${THEMES[tr.theme].name} · your best here ${fmtShort(save.best[tr.id]?.time)}</span>`;
  $('boardMe').textContent = '';
  if (!onlineEnabled) { $('boardList').innerHTML = '<div class="sub">Online leaderboards are switched off.</div>'; return; }
  $('boardList').innerHTML = '<div class="sub">Loading…</div>';
  const token = ++boardToken;
  Promise.all([getLeaderboard(tr.id, 10), getMyRank(tr.id)]).then(([rows, me]) => {
    if (token !== boardToken) return;
    $('boardList').innerHTML = rows.length
      ? rows.map((r, k) => `<div class="r${r.me ? ' me' : ''}"><span>#${k + 1}</span><span>${esc(r.name)}${r.me ? ' (you)' : ''}</span><span class="l">best lap ${fmt(r.lap)}</span><span class="t">${fmt(r.time)}</span></div>`).join('')
      : '<div class="sub">No times yet. Be the first!</div>';
    $('boardMe').textContent = me ? `You: #${me.rank} with ${fmt(me.time)}` : 'You have no online time on this track yet.';
  }).catch((e) => { window.__lastBoardError = String(e); if (token === boardToken) $('boardList').innerHTML = '<div class="sub">Couldn\'t reach the leaderboard. Check your connection and try again.</div>'; });
}
$('boardPrev').addEventListener('click', () => { boardTrack = (boardTrack + TRACKS.length - 2) % TRACKS.length + 1; renderBoards(); });
$('boardNext').addEventListener('click', () => { boardTrack = boardTrack % TRACKS.length + 1; renderBoards(); });
$('nameInput').addEventListener('change', (e) => {
  save.name = cleanName(e.target.value);
  e.target.value = save.name;
  persist();
});
$('nameInput').addEventListener('keydown', (e) => e.stopPropagation());

function renderStats() {
  const s = save.stats, c = medalCounts();
  const hrs = s.time / 3600;
  const rows = [
    ['Races finished', s.races],
    ['Laps completed', s.laps],
    ['Distance driven', `${(s.distance / 1000).toFixed(1)} km`],
    ['Time driving', hrs >= 1 ? `${hrs.toFixed(1)} h` : `${Math.round(s.time / 60)} min`],
    ['Top speed', `${Math.round((s.topSpeed || 0) * (settings.units === 'mph' ? 2.237 : 3.6))} ${settings.units === 'mph' ? 'mph' : 'km/h'}`],
    ['Wall hits', s.hits || 0],
    ['Gold medals', c.gold],
    ['Silver or better', c.silver],
    ['Medals', `${c.any} / ${TRACKS.length}`],
    ['Tracks unlocked', `${Math.min(save.unlocked, TRACKS.length)} / ${TRACKS.length}`],
  ];
  $('statList').innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
}

// settings UI
function loadSettingsUI() {
  $('setQuality').value = settings.quality;
  $('setCamera').value = settings.camera;
  $('setUnits').value = settings.units;
  $('setFov').value = settings.fov; $('fovVal').textContent = settings.fov;
  $('setLine').checked = settings.racingLine;
  $('setGhost').value = settings.ghost;
  $('setShake').checked = settings.shake;
  $('setSfx').value = settings.sfx;
  $('setMusic').value = settings.music;
  $('setMute').checked = settings.mute;
  $('setFps').checked = settings.fps;
}
function bindSetting(id, key, kind, after) {
  $(id).addEventListener(kind === 'check' ? 'change' : 'input', (e) => {
    const el = e.target;
    settings[key] = kind === 'check' ? el.checked : kind === 'num' ? Number(el.value) : el.value;
    after?.();
    persist();
  });
}
const rebuildWorld = () => { if (cur) { const tr = cur.tr; cur.quality = null; loadTrack(tr); if (race) placeCar(race.car); } };
bindSetting('setQuality', 'quality', 'select', () => { applyQuality(); rebuildWorld(); });
bindSetting('setCamera', 'camera', 'select');
bindSetting('setUnits', 'units', 'select');
bindSetting('setFov', 'fov', 'num', () => { $('fovVal').textContent = settings.fov; });
bindSetting('setLine', 'racingLine', 'check', rebuildWorld);
bindSetting('setGhost', 'ghost', 'select');
bindSetting('setShake', 'shake', 'check');
bindSetting('setSfx', 'sfx', 'num', () => sound.setEffectsVolume(settings.sfx));
bindSetting('setMusic', 'music', 'num', () => sound.setMusicVolume(settings.music));
bindSetting('setMute', 'mute', 'check', () => sound.setMuted(settings.mute));
bindSetting('setFps', 'fps', 'check');

// buttons
const click = (id, fn) => $(id).addEventListener('click', () => { sound.init(); sound.click(); fn(); });
click('btnPlay', () => startRace(nextTrack()));
click('btnTracks', () => { backTo = 'menu'; showScreen('tracks'); });
click('btnGarage', () => { backTo = 'menu'; showScreen('garage'); });
click('btnStats', () => { backTo = 'menu'; showScreen('stats'); });
click('btnBoards', () => { backTo = 'menu'; boardTrack = save.last || (cur && cur.tr.id) || 1; showScreen('boards'); });
click('btnSettings', () => { backTo = 'menu'; showScreen('settings'); });
click('btnControls', () => { backTo = 'menu'; showScreen('controls'); });
$('btnWatch').addEventListener('click', (e) => { e.preventDefault(); sound.init(); startRace(nextTrack(), { watch: true }); });
click('btnResume', resume);
click('btnRestart', () => startRace(cur.tr, { watch: watching }));
click('btnPauseSettings', () => { backTo = 'pause'; showScreen('settings'); });
click('btnPauseMenu', exitToMenu);
click('btnRetry', () => startRace(cur.tr, { watch: watching }));
click('btnNext', () => { const n = TRACKS[cur.tr.id]; if (n && unlocked(n)) startRace(n, { watch: watching }); });
click('btnFinMenu', exitToMenu);

function pause() {
  mode = 'paused';
  sound.silence();
  backTo = 'pause';
  showScreen('pause');
}
function resume() {
  if (mode !== 'paused') return;
  // settings may have changed the racing line or quality: world already rebuilt
  mode = 'race';
  acc = 0;
  showScreen(null);
}

const CAMERAS = ['chase', 'far', 'hood', 'bumper'];
input.handlers.key = (code) => {
  sound.init();
  if (mode === 'race') {
    if (code === 'Escape') { if (watching) exitToMenu(); else pause(); }
    else if (code === 'KeyR') startRace(cur.tr, { watch: watching });
    else if (code === 'KeyC' && !watching) race.recover();
    else if (code === 'KeyV') { settings.camera = CAMERAS[(CAMERAS.indexOf(settings.camera) + 1) % CAMERAS.length]; persist(); }
    else if (code === 'KeyL') { settings.racingLine = !settings.racingLine; rebuildWorld(); persist(); toast(`Racing line ${settings.racingLine ? 'on' : 'off'}`, 900); }
    else if (code === 'KeyG') {
      const order = ['best', 'record', 'both', 'off'];
      settings.ghost = order[(order.indexOf(settings.ghost) + 1) % order.length];
      persist();
      toast(`Ghost: ${{ best: 'your best', record: 'world record', both: 'both', off: 'off' }[settings.ghost]}`, 1100);
      if ((settings.ghost === 'record' || settings.ghost === 'both') && !recordGhost && onlineEnabled) {
        const token = raceToken, tr = cur.tr;
        loadRecord(tr).then((r) => { if (token === raceToken && r) { const f = decodeGhost(r.data); if (f) { recordGhost = new GhostPlayer(f, cur.track); recordInfo = r; setTarget(); } } });
      }
      if ((settings.ghost === 'best' || settings.ghost === 'both') && !ghost) {
        const g = loadGhost(cur.tr.id);
        if (g) { const f = decodeGhost(g.data); if (f) ghost = new GhostPlayer(f, cur.track); }
      }
    }
    else if (code === 'KeyM') { settings.mute = !settings.mute; sound.setMuted(settings.mute); persist(); }
  } else if (mode === 'paused') {
    if (code === 'Escape' && $('pause').classList.contains('hidden') === false) resume();
    else if (code === 'Escape') showScreen('pause');
  } else if (mode === 'finished') {
    if (code === 'KeyR') startRace(cur.tr, { watch: watching });
    else if ((code === 'KeyN' || code === 'Enter') && !$('btnNext').disabled) startRace(TRACKS[cur.tr.id], { watch: watching });
    else if (code === 'Escape') exitToMenu();
  } else if (mode === 'menu') {
    const open = SCREENS.find((s) => !$(s).classList.contains('hidden'));
    if (code === 'Escape' && open && open !== 'menu') showScreen('menu');
    else if (code === 'Enter' && open === 'menu') startRace(nextTrack());
  }
};

// ---------- camera ----------
const tmpV = new THREE.Vector3();
let fovNow = settings.fov;
function chaseCamera(dt, p, speed, vx, vz) {
  const cam = settings.camera;
  const fx = Math.cos(p.h), fz = Math.sin(p.h);
  if (cam === 'hood' || cam === 'bumper') {
    const [fwd, up] = cam === 'hood' ? [0.25, 1.36] : [2.3, 0.62];
    const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    camera.position.set(p.x + fx * fwd * cp, p.y + up + fwd * sp, p.z + fz * fwd * cp);
    camera.lookAt(p.x + fx * 40 * cp, p.y + up - 0.6 + 40 * sp, p.z + fz * 40 * cp);
    carModel.root.visible = cam !== 'hood' ? false : true;
    carModel.body.visible = cam === 'hood';
  } else {
    carModel.root.visible = true; carModel.body.visible = true;
    // follow mostly the nose, a little the direction of travel (shows slides)
    let want = p.h;
    if (speed > 4) {
      const travel = Math.atan2(vz, vx);
      let d = travel - p.h; d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
      if (Math.abs(d) < 1.2) want = p.h + d * 0.35;
    }
    let dy = want - camYaw; dy -= Math.PI * 2 * Math.round(dy / (Math.PI * 2));
    camYaw += dy * (1 - Math.exp(-dt * 7));
    const [dist, hgt] = cam === 'far' ? [9.6, 3.4] : [6.4, 2.2];
    const d = dist + Math.min(1.4, speed * 0.02);
    const cx = p.x - Math.cos(camYaw) * d, cz = p.z - Math.sin(camYaw) * d;
    const ground = cur.track ? p.y : 0;
    camY += (ground + hgt - camY) * (1 - Math.exp(-dt * 6));
    camera.position.set(cx, camY, cz);
    camera.lookAt(p.x + Math.cos(camYaw) * 4, p.y + 1.0, p.z + Math.sin(camYaw) * 4);
  }
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * shake * 0.35;
    shake *= Math.exp(-dt * 7);
  }
  const fov = settings.fov + Math.min(14, speed * 0.17);
  fovNow += (fov - fovNow) * Math.min(1, dt * 4);
  if (Math.abs(camera.fov - fovNow) > 0.01) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
}

let orbit = 0;
function menuCamera(dt) {
  if (!cur) return;
  carModel.root.visible = true; carModel.body.visible = true;
  orbit += dt * 0.12;
  const p = carModel.root.position;
  const garage = !$('garage').classList.contains('hidden');
  const r = garage ? 6.8 : 9.5, hgt = garage ? 1.9 : 2.8;
  camera.position.set(p.x + Math.cos(orbit) * r, p.y + hgt, p.z + Math.sin(orbit) * r);
  tmpV.set(p.x, p.y + 0.7, p.z);
  camera.lookAt(tmpV);
  // shift the car to the right of the screen, away from the menu panel
  camera.translateX(garage ? -2.2 : -3.2);
  if (camera.fov !== settings.fov) { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
  fovNow = settings.fov;
  cur.world.update(p);
}

// ---------- main loop ----------
let last = performance.now(), fpsT = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.pollPad();

  if ((mode === 'race' || mode === 'finished') && race) {
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 24) {
      const c = race.car;
      prev = { x: c.x, y: c.y, z: c.z, h: c.h, pitch: c.pitch };
      const inp = mode === 'finished' ? { throttle: 0, brake: 0.3, steer: 0 } : bot ? bot.drive(c) : input.read();
      lastInput = inp;
      race.step(inp);
      if (race.state === 'racing' && !watching) {
        recorder.add(c);
        const sp = Math.abs(c.u);
        save.stats.distance += sp * DT;
        save.stats.time += DT;
        if (sp > (save.stats.topSpeed || 0)) save.stats.topSpeed = sp;
        if (c.hit > 2) save.stats.hits = (save.stats.hits || 0) + 1;
      } else if (race.state === 'racing') recorder.add(c);
      handleEvents();
      acc -= DT;
      steps++;
    }
    if (steps >= 24) acc = 0;
    const c = race.car;
    const a = prev ? acc / DT : 1;
    const P0 = prev || c;
    const pose = {
      x: P0.x + (c.x - P0.x) * a, y: P0.y + (c.y - P0.y) * a, z: P0.z + (c.z - P0.z) * a,
      h: P0.h + (c.h - P0.h) * a, pitch: P0.pitch + (c.pitch - P0.pitch) * a,
    };
    carModel.pose(pose.x, pose.y, pose.z, pose.h, pose.pitch);
    const speed = Math.hypot(c.u, c.v);
    const braking = lastInput.brake > 0 && c.u > 0.5;
    carModel.animate(dt, { steer: c.steer, speed: c.u, latAcc: c.u * c.r, longAcc: c.ax, braking });
    const ch = Math.cos(c.h), sh = Math.sin(c.h);
    const vx = c.u * ch - c.v * sh, vz = c.u * sh + c.v * ch;

    // ghosts: your best (cyan) and the world record (gold)
    const gm = settings.ghost;
    const gp = showGhost(ghostModel, gm === 'best' || gm === 'both' ? ghost : null, c, dt);
    const rp = showGhost(recordModel, gm === 'record' || gm === 'both' ? recordGhost : null, c, dt);

    // tyre smoke and skid marks
    const slide = Math.max(c.slipR - 0.95, c.slipF - 1.05);
    for (let w = 0; w < 2; w++) {
      const side = w ? 0.86 : -0.86;
      const wx = c.x - ch * 1.3 - sh * side, wz = c.z - sh * 1.3 + ch * side;
      const strength = c.onGrass ? 0 : Math.max(0, Math.min(1, slide * 2.5)) * Math.min(1, speed / 6);
      effects.mark(w, wx, c.y, wz, ch, sh, strength);
      if (strength > 0.15 && Math.random() < strength) effects.puff(wx, c.y + 0.3, wz, vx, vz, strength);
      if (c.onGrass && speed > 6 && Math.random() < 0.35) effects.puff(wx, c.y + 0.2, wz, vx, vz, 0.2);
    }
    effects.update(dt);

    chaseCamera(dt, pose, speed, vx, vz);
    cur.world.update(carModel.root.position);

    // countdown lights: one more red light every 0.6 s, then green
    if (race.state === 'countdown') cur.world.setStartLights(Math.min(5, Math.floor((3 - race.countdownLeft) / 0.6) + 1));

    // sound
    if (c.gear !== lastGear && race.state === 'racing') { sound.shift(); lastGear = c.gear; }
    sound.update({ rpm: c.rpm, throttle: mode === 'finished' ? 0 : lastInput.throttle, speed, slip: Math.max(c.slipR, c.slipF * 0.9), grass: c.onGrass, active: mode !== 'paused' });
    music.setIntensity(Math.min(1, speed / 60));

    // wrong way
    const along = ch * c.loc.tx + sh * c.loc.tz;
    if (race.state === 'racing' && along < -0.3 && speed > 3) wrongTime += dt; else wrongTime = 0;
    $('wrongway').classList.toggle('hidden', wrongTime < 1);

    updateHud(c, speed, gp, rp, pose);
    if (mode === 'finished' && finishShown && now > finishShown) { finishShown = 0; showScreen('finish'); $('hud').classList.add('hidden'); }
  } else if (mode === 'paused' && race) {
    // frozen; keep the picture
  } else {
    menuCamera(dt);
    effects.update(dt);
  }
  music.update(dt);

  if (settings.fps) {
    fpsN++; fpsT += dt;
    if (fpsT > 0.5) { $('fps').textContent = `${Math.round(fpsN / fpsT)} fps`; fpsN = 0; fpsT = 0; }
  }
  $('fps').classList.toggle('hidden', !settings.fps || mode === 'menu');
  renderer.render(scene, camera);
}

function showGhost(model, player, c, dt) {
  const gp = player && race.state !== 'countdown' ? player.at(race.time) : null;
  if (!gp) { model.root.visible = false; return null; }
  model.root.visible = true;
  model.pose(gp.x, gp.y, gp.z, gp.h, gp.pitch);
  model.animate(dt, { speed: gp.speed });
  // fade out when it's right on top of you
  const near = Math.hypot(gp.x - c.x, gp.z - c.z);
  model.root.traverse((o) => { if (o.isMesh) o.material.opacity = Math.min(0.32, near * 0.05); });
  return gp;
}

function updateHud(c, speed, gp, rp, pose) {
  const now = performance.now();
  $('timer').textContent = fmt(race.time);
  $('lapNum').textContent = Math.min(race.lap + 1, race.laps);
  $('lapTime').textContent = fmt(race.state === 'finished' ? race.lapTimes[race.lapTimes.length - 1] : race.lapTime);
  const bl = Math.min(save.bestLap[cur.tr.id] || Infinity, race.bestLap || Infinity);
  $('bestLap').textContent = `Best lap ${isFinite(bl) ? fmt(bl) : '--'}`;
  const bestThis = race.lapTimes.length ? Math.min(...race.lapTimes) : 0;
  $('lapList').innerHTML = race.lapTimes.map((l, k) => `<div class="${l === bestThis ? 'pb' : ''}">L${k + 1} ${fmt(l)}</div>`).join('');
  const k = settings.units === 'mph' ? 2.237 : 3.6;
  $('speed').textContent = Math.round(Math.abs(c.u) * k);
  $('unit').textContent = settings.units === 'mph' ? 'MPH' : 'KM/H';
  $('gear').textContent = c.u < -0.5 ? 'R' : race.state === 'countdown' ? 'N' : c.gear;
  $('rpmFill').style.width = `${Math.max(0, Math.min(1, (c.rpm - 900) / 7300)) * 100}%`;
  if (countText && now < countUntil) {
    $('countdown').textContent = countText;
    $('countdown').className = countText === 'GO' ? 'go' : '';
  } else $('countdown').textContent = '';
  if (now > deltaUntil) $('delta').classList.remove('show');
  if (now > toastUntil) $('toast').classList.remove('show');
  drawMinimap(pose, gp, rp);
}

// ---------- start ----------
showScreen('menu');
music.play('menu');
const direct = Number(params.get('track'));
if (direct && TRACKS[direct - 1] && unlocked(TRACKS[direct - 1])) startRace(TRACKS[direct - 1]);
else if (BOT) startRace(nextTrack(), { watch: true });
// start music/audio on the first interaction
addEventListener('pointerdown', () => sound.init(), { once: true });
requestAnimationFrame(frame);

// for tests
window.__redline = {
  scene, camera, get race() { return race; }, get mode() { return mode; }, get recordInfo() { return recordInfo; }, get recordGhost() { return recordGhost; }, save, startRace, TRACKS, settings,
  /** Run the physics ahead by `sec` seconds (the autopilot drives if it's on). */
  fastForward(sec, auto = true) {
    const driver = bot || (auto ? new Bot(cur.track) : null);
    for (let k = 0; k < sec / DT && race && mode !== 'menu'; k++) {
      const c = race.car;
      prev = null;
      race.step(mode === 'finished' ? { throttle: 0, brake: 0.3, steer: 0 } : driver ? driver.drive(c) : { throttle: 0, brake: 0, steer: 0 });
      if (race.state === 'racing') recorder.add(c);
      handleEvents();
    }
  },
};
