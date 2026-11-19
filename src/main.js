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
import { CARS, carById, CAR_RULES } from './cars.js';
import { Effects } from './effects.js';
import { Race } from './race.js';
import { DT } from './car.js';
import { Bot, speedProfile } from './bot.js';
import { RIVALS } from './rivals.js';
import { DriftScore } from './drift.js';
import { ACHIEVEMENTS, ACH_BY_ID, earnedFromSave } from './achievements.js';
import { dayKey, dailyDef, msToNextDay, bumpStreak } from './daily.js';
import { newAccountCode, formatCode, parseCode, packSave, unpackSave, mergeSaves } from './account.js';
import { tvCameras, Director, zoomFov } from './replay.js';
import { Hints } from './hints.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Music } from './music.js';
import { GhostRecorder, GhostPlayer, encodeGhost, decodeGhost } from './ghost.js';
import { loadSave, storeSave, loadGhost, storeGhost } from './save.js';
import {
  onlineEnabled, cleanName, submitScore, getLeaderboard, getMyRank, getRecordGhost,
  setAccount, createAccount, fetchAccount, writeAccount,
} from './online.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const BOT = params.has('bot');
const UNLOCK_ALL = params.get('unlock') === 'all';

// phones and tablets: touch controls, lighter graphics by default
const TOUCH = params.has('touch') || matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(any-pointer: fine)').matches);
document.body.classList.toggle('touch', TOUCH);

const save = loadSave();
const settings = save.settings;
if (TOUCH && !settings.touchInit) {
  settings.quality = 'low';
  settings.mirror = 'off';
  settings.touchInit = true;
}
let cloudTimer = 0;
function persist() {
  storeSave(save);
  // account code: save online a few seconds after anything changes
  if (save.account && onlineEnabled) {
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => { writeAccount(save.account.code, packSave(save)).catch(() => {}); }, 4000);
  }
}

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
const mirrorCam = new THREE.PerspectiveCamera(55, 3.4, 0.5, 2000);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const input = new Input();
input.autoGas = settings.autoGas;
input.tiltOn = settings.steer === 'tilt';
input.tiltInvert = settings.tiltInvert;
// touch buttons
for (const [id, key] of [['tLeft', 'left'], ['tRight', 'right'], ['tGas', 'gas'], ['tBrake', 'brake'], ['tDrift', 'drift']]) input.bindTouch($(id), key);
for (const [id, fn] of [['tPause', () => { if (mode === 'race' && !watching) pause(); else if (watching) exitToMenu(); }], ['tReset', () => { if (mode === 'race' && !watching) race.recover(); }], ['tCam', () => input.handlers.key('KeyV')]]) {
  $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); sound.init(); fn(); });
}
if (TOUCH) $('ltKey').textContent = 'GAS';

/** Fullscreen and landscape for races on a phone (where the browser allows it). */
function goFullscreen() {
  if (!TOUCH || !settings.fullscreen || document.fullscreenElement) return;
  const el = document.documentElement;
  const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
  Promise.resolve(p).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}
/** Phones held upright: ask to turn sideways (and pause a race). */
function checkOrientation() {
  const upright = TOUCH && innerHeight > innerWidth * 1.05;
  const racing = mode === 'race' || mode === 'paused' || mode === 'replay' || mode === 'photo' || mode === 'finished';
  $('rotate').classList.toggle('hidden', !(upright && racing));
  if (upright && mode === 'race' && !watching && race && race.state !== 'finished') pause();
}
addEventListener('resize', checkOrientation);
addEventListener('orientationchange', () => setTimeout(checkOrientation, 200));
const sound = new Sound();
sound.setEffectsVolume(settings.sfx);
sound.setMusicVolume(settings.music);
sound.setMuted(settings.mute);
const music = new Music(sound);
const effects = new Effects(scene);

const paintOf = (id) => PAINTS.find((p) => p.id === id) || PAINTS[0];
let carModel = null, carDef = null;
const ghostModel = buildCar({ ghost: true });
ghostModel.root.visible = false;
scene.add(ghostModel.root);
const recordModel = buildCar({ ghost: true, ghostColor: 0xffd25a });
recordModel.root.visible = false;
scene.add(recordModel.root);
// headlights (night and rain)
const headlight = new THREE.SpotLight(0xfff2d8, 0, 110, 0.55, 0.55, 1.1);
headlight.position.set(2.0, 0.75, 0);
headlight.target.position.set(25, -0.5, 0);

/** Switch to a car: its model, paint, headlights and engine sound. */
function useCar(id) {
  const def = carById(id);
  const at = carModel ? { p: carModel.root.position.clone(), r: carModel.root.rotation.clone() } : null;
  if (carModel) { carModel.root.remove(headlight, headlight.target); scene.remove(carModel.root); carModel.dispose(); }
  const paint = paintOf(save.paint);
  carModel = buildCar({ kind: def.model, color: paint.color });
  carModel.setPaint(paint.color, paint.metal);
  carModel.root.add(headlight, headlight.target);
  if (at) { carModel.root.position.copy(at.p); carModel.root.rotation.copy(at.r); }
  scene.add(carModel.root);
  sound.setEngine(def.engine);
  carDef = def;
}
useCar(save.car || 'gt');

// ---------- helpers ----------
export function fmt(t) {
  if (!isFinite(t) || t <= 0) return '0:00.000';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
const fmtShort = (t) => (t ? fmt(t) : '--');
const fmtPts = (n) => Math.round(n).toLocaleString('en-GB');
const esc = (t) => String(t).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const isDaily = (tr) => !!tr.daily;
const unlocked = () => true; // every circuit is open from the start
const medalColor = { gold: 'var(--gold)', silver: 'var(--silver)', bronze: 'var(--bronze)' };
function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${s}`;
}

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

// unlocks
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
  carbon: { ach: 'drift5', text: 'Achievement: Smoke Show' },
  neon: { ach: 'winHard', text: 'Achievement: Giant Killer' },
  chrome: { ach: 'cups', text: 'Achievement: Grand Champion' },
};
function ruleMet(r, c, strict = false) {
  if (!r || (UNLOCK_ALL && !strict)) return true;
  if (r.ach) return !!save.achievements[r.ach];
  return (r.any ? c.any >= r.any : true) && (r.silver ? c.silver >= r.silver : true) && (r.gold ? c.gold >= r.gold : true);
}
const carUnlocked = (id, c = medalCounts()) => ruleMet(CAR_RULES[id], c);
const paintUnlocked = (id, c = medalCounts()) => ruleMet(PAINT_RULES[id], c);

// ---------- achievements ----------
const achQueue = [];
let achUntil = 0;
function award(id) {
  if (save.achievements[id] || !ACH_BY_ID[id]) return;
  save.achievements[id] = dayKey();
  achQueue.push(ACH_BY_ID[id]);
  persist();
}
function checkAchievements() {
  const ctx = {
    save, counts: medalCounts(), tracks: TRACKS, medalOf: (t) => medalFor(t, save.best[t.id]?.time),
    carsUnlocked: CARS.every((c) => ruleMet(CAR_RULES[c.id], medalCounts(), true)),
  };
  for (const id of earnedFromSave(ctx)) award(id);
}
function showAchievements(now) {
  if (now < achUntil) return;
  const a = achQueue.shift();
  if (!a) { $('achPop').classList.add('hidden'); return; }
  $('achName').textContent = a.name;
  $('achDesc').textContent = a.desc + (a.reward ? ` · Unlocks: ${a.reward}` : '');
  $('achPop').classList.remove('hidden');
  sound.tone({ type: 'triangle', freq: 880, dur: 0.15, gain: 0.12 });
  sound.tone({ type: 'triangle', freq: 1320, dur: 0.3, gain: 0.12, delay: 0.12 });
  achUntil = now + 3600;
}

// ---------- the current track ----------
let cur = null; // { tr, track, world, map, cams }
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
  effects.setRain(!!track.wet, world.theme.night);
  headlight.intensity = world.theme.night || track.wet ? 90 : 0;
  renderer.toneMappingExposure = world.theme.night ? 1.25 : 1.0;
  cur = { tr, track, world, quality: settings.quality, line: settings.racingLine, map: buildMinimap(track), cams: tvCameras(track, world.heightAt) };
  // park the car on the grid
  const r = new Race(track, { spec: carDef.spec });
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
  const nx = -t.tz[0], nz = t.tx[0];
  g.strokeStyle = '#e8322a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(tx(t.x[0] - nx * 14), tz(t.z[0] - nz * 14)); g.lineTo(tx(t.x[0] + nx * 14), tz(t.z[0] + nz * 14)); g.stroke();
  return { img, tx, tz };
}
function drawMinimap(pose, dots) {
  const m = cur.map;
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  mapCtx.drawImage(m.img, 0, 0);
  for (const [p, col] of dots) {
    if (!p) continue;
    mapCtx.fillStyle = col;
    mapCtx.beginPath(); mapCtx.arc(m.tx(p.x), m.tz(p.z), 4.5, 0, Math.PI * 2); mapCtx.fill();
  }
  const x = m.tx(pose.x), z = m.tz(pose.z);
  mapCtx.save();
  mapCtx.translate(x, z); mapCtx.rotate(pose.h);
  mapCtx.fillStyle = '#e8322a'; mapCtx.strokeStyle = '#fff'; mapCtx.lineWidth = 1.5;
  mapCtx.beginPath(); mapCtx.moveTo(8, 0); mapCtx.lineTo(-6, 5.5); mapCtx.lineTo(-3, 0); mapCtx.lineTo(-6, -5.5); mapCtx.closePath();
  mapCtx.fill(); mapCtx.stroke();
  mapCtx.restore();
}

// ---------- name tags (rivals and the world record ghost) ----------
const tagEls = [];
function setTags(list) {
  while (tagEls.length < list.length) { const el = document.createElement('div'); el.className = 'ntag'; $('tags').appendChild(el); tagEls.push(el); }
  const v = new THREE.Vector3();
  tagEls.forEach((el, k) => {
    const t = list[k];
    if (!t) { el.style.display = 'none'; return; }
    v.set(t.x, t.y + 1.9, t.z);
    const dist = v.distanceTo(camera.position);
    v.project(camera);
    if (v.z > 1 || dist > 110 || dist < 4) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
    el.style.color = t.color;
    el.style.opacity = String(Math.max(0.35, 1 - dist / 140));
    if (el.dataset.text !== t.html) { el.innerHTML = t.html; el.dataset.text = t.html; }
  });
}

// ---------- race state ----------
let mode = 'menu'; // menu, race, paused, finished, replay, photo
let race = null, bot = null, recorder = null, ghost = null, bestRun = null, watching = false;
let sess = { kind: 'trial' }; // kind: trial, race, cup, daily
let recordGhost = null, recordInfo = null, raceToken = 0;
let drift = null, hints = null, rivalModels = [], prevRivals = [];
const recordCache = new Map(); // board id -> promise of the world record ghost (this visit)
function loadRecord(tr) {
  if (!recordCache.has(tr.id)) {
    recordCache.set(tr.id, getRecordGhost(tr.id).catch(() => { recordCache.delete(tr.id); return null; }));
  }
  return recordCache.get(tr.id);
}
let acc = 0, prev = null, lastInput = { throttle: 0, brake: 0, steer: 0 };
let camYaw = 0, camY = 0, shake = 0, lastGear = 1, wrongTime = 0, finishShown = 0;
let countText = '', countUntil = 0, deltaUntil = 0, toastUntil = 0, driftFlashUntil = 0, kerbRumbleAt = 0;

const withRivals = () => sess.kind === 'race' || sess.kind === 'cup';

function buildRivalModels() {
  for (const m of rivalModels) { scene.remove(m.root); m.dispose(); }
  rivalModels = withRivals() ? RIVALS.map((r) => { const m = buildCar({ kind: carDef.model, color: r.color }); scene.add(m.root); return m; }) : [];
  prevRivals = [];
}

/** Start a race. kind: 'trial' (time trial), 'race' (against the AI), 'cup' (a championship round), 'daily'. */
function startRace(tr, { watch = false, kind = 'trial' } = {}) {
  if (!tr || !unlocked(tr)) return;
  sound.init();
  goFullscreen();
  input.centreTilt();
  sess = { kind, tr };
  loadTrack(tr);
  watching = (watch || BOT) && kind === 'trial';
  const rivals = withRivals() ? { level: settings.aiLevel, seed: (sess.kind === 'cup' && save.cup ? save.cup.round : 0) + (typeof tr.id === 'number' ? tr.id : 1) } : null;
  race = new Race(cur.track, { spec: carDef.spec, rivals, launch: !watching });
  bot = watching ? new Bot(cur.track, 0.9, carDef.spec) : null;
  recorder = new GhostRecorder();
  drift = new DriftScore();
  hints = settings.hints && !watching && typeof tr.id === 'number' && tr.id <= 3 ? new Hints(cur.track, speedProfile(cur.track, 0.9, carDef.spec)) : null;
  bestRun = save.best[tr.id] || null;
  ghost = null; recordGhost = null; recordInfo = null;
  const token = ++raceToken;
  const gm = withRivals() ? 'off' : settings.ghost;
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
  buildRivalModels();
  ghostModel.root.visible = false;
  recordModel.root.visible = false;
  if (typeof tr.id === 'number') save.last = tr.id;
  mode = 'race';
  acc = 0;
  prev = null;
  shake = 0; lastGear = 1; wrongTime = 0; finishShown = 0;
  camYaw = race.car.h; camY = race.car.y + 2.2;
  effects.clear();
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('lapTotal').textContent = race.laps;
  $('posLine').classList.toggle('hidden', !withRivals());
  $('posTotal').textContent = race.allCars.length;
  $('hint').textContent = watching ? 'AUTOPILOT · Esc to stop' : 'C reset car · R restart · V camera · Esc pause';
  $('countdown').textContent = ''; $('countdown').className = '';
  $('delta').className = 'mono';
  $('driftTotal').classList.add('hidden');
  setTarget();
  music.play('race');
}

function setTarget() {
  const tr = cur.tr;
  if (withRivals()) {
    const lvl = { easy: 'Easy', normal: 'Normal', hard: 'Hard' }[settings.aiLevel];
    $('target').innerHTML = sess.kind === 'cup' && save.cup
      ? `${THEMES[save.cup.theme].name} Cup · Race ${save.cup.round + 1} of 6 · ${lvl} AI`
      : `Race · ${lvl} AI${save.raceBest[tr.id] ? ` · Best finish ${ordinal(save.raceBest[tr.id])}` : ''}`;
    return;
  }
  const best = bestRun?.time;
  const times = medalTimes(tr);
  const have = medalFor(tr, best);
  const next = have ? times[times.findIndex((m) => m.id === have.id) - 1] : times[2];
  const dot = (m) => `<span class="medal" style="background:${medalColor[m.id]}"></span>`;
  $('target').innerHTML = (isDaily(tr) ? `${esc(tr.name)} · ` : '') + (next
    ? `${dot(next)}${next.name} ${fmt(next.time)}${best ? ` · Best ${fmt(best)}` : ''}`
    : `${dot(have)}Best ${fmt(best)}`)
    + (recordInfo ? `<br><span style="color:var(--gold)">Record ${fmt(recordInfo.time)} · ${recordInfo.me ? 'you' : esc(recordInfo.name)}</span>` : '');
}

function toast(text, ms = 1600) {
  $('toast').innerHTML = text;
  $('toast').classList.add('show');
  toastUntil = performance.now() + ms;
}

/** Sector colour: purple = your fastest ever, green = faster than on your best run, yellow = slower. */
function sectorColour(n, st) {
  const id = cur.tr.id, s = (n - 1) % 3;
  const best = save.bestSectors[id]?.[s];
  let pbRun = null;
  if (bestRun?.splits?.[n - 1] !== undefined) pbRun = bestRun.splits[n - 1] - (n > 1 ? bestRun.splits[n - 2] : 0);
  const col = best === undefined || best === null || st < best - 1e-6 ? 'purple' : pbRun !== null && st < pbRun ? 'green' : 'yellow';
  if (!watching && (best === undefined || best === null || st < best)) {
    save.bestSectors[id] = save.bestSectors[id] || [];
    save.bestSectors[id][s] = Math.round(st * 1000) / 1000;
  }
  return col;
}

function showDelta(n) {
  const st = race.sectorTimes[n - 1];
  const col = sectorColour(n, st);
  const best = bestRun?.splits?.[n - 1];
  let text;
  if (best !== undefined && !withRivals()) {
    const d = race.splits[n - 1] - best;
    text = `${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(3)}`;
  } else text = `S${((n - 1) % 3) + 1} ${st.toFixed(3)}`;
  $('delta').textContent = text;
  $('delta').className = `mono show ${col}`;
  deltaUntil = performance.now() + 3000;
  sound.sector(col !== 'yellow');
}

function handleEvents() {
  for (const e of race.events) {
    if (e.type === 'count') { sound.count(); countText = String(e.n); countUntil = performance.now() + 900; }
    else if (e.type === 'go') { sound.go(); countText = 'GO'; countUntil = performance.now() + 800; cur.world.setStartLights('go'); }
    else if (e.type === 'launch') {
      const msg = { perfect: '<span style="color:var(--green)">PERFECT START!</span>', good: 'GOOD START', spin: '<span style="color:#ff5a4e">WHEELSPIN!</span>', bog: '<span style="color:#ffcf33">BOGGED DOWN</span>' }[e.q];
      toast(msg, 1400);
      if (e.q === 'perfect') award('launch');
    } else if (e.type === 'hit' || e.type === 'bump') {
      const v = e.type === 'bump' ? e.v * 0.6 : e.v;
      sound.hit(v);
      if (settings.shake) shake = Math.min(1, shake + v * 0.06);
      if (settings.rumble) input.rumble(Math.min(1, v * 0.1), 200);
      if (e.type === 'hit') {
        const c = race.car, side = Math.sign(c.loc.lat);
        effects.spark(c.x - c.loc.tz * side * 1.0, c.y + 0.5, c.z + c.loc.tx * side * 1.0, 8 + Math.round(e.v * 2));
      }
    } else if (e.type === 'sector') {
      showDelta(e.n);
    } else if (e.type === 'lap') {
      sound.lap();
      showDelta(race.splits.length);
      const id = cur.tr.id;
      const pb = !save.bestLap[id] || e.time < save.bestLap[id];
      toast(`${e.lap === race.laps - 1 ? 'FINAL LAP' : `LAP ${e.lap + 1}`}${pb && !watching ? ' · <span style="color:var(--green)">BEST LAP</span>' : ''}`);
      if (pb && !watching) save.bestLap[id] = e.time;
    } else if (e.type === 'finish') onFinish();
    else if (e.type === 'recover') toast('Car reset', 900);
  }
}

function driftEvents() {
  for (const e of drift.events) {
    $('driftPts').textContent = (e.type === 'banked' ? '+' : '') + fmtPts(e.pts);
    $('driftBox').className = e.type;
    $('driftMult').textContent = e.type === 'banked' ? 'DRIFT BANKED' : 'DRIFT LOST';
    driftFlashUntil = performance.now() + 1200;
    if (e.type === 'banked') {
      if (!watching && e.pts >= 1000) award('drift1');
      if (!watching && e.pts >= 5000) award('drift5');
      sound.tone({ type: 'triangle', freq: 660, dur: 0.12, gain: 0.1 });
    } else sound.tone({ type: 'sawtooth', freq: 180, to: 90, dur: 0.25, gain: 0.08 });
  }
}

/** Finishing order for the results: [{ pos, name, color, me, time, est }] */
function resultsTable() {
  const L = race.track.L * race.laps;
  return race.order.map((e, k) => {
    let time = e.finished || 0, est = false;
    if (!time) { // not over the line yet: estimate from their average speed
      const t = race.time2 || race.time;
      time = t + Math.max(0, L - e.progress) / Math.max(8, e.progress / Math.max(t, 1));
      est = true;
    }
    return { pos: k + 1, name: e.me ? save.name : e.name, color: e.me ? paintOf(save.paint).color : e.color, me: !!e.me, time, est };
  });
}

function onFinish() {
  const tr = cur.tr, time = race.time, kind = sess.kind;
  mode = 'finished';
  finishShown = performance.now() + 1300;
  drift.finish();
  driftEvents();
  const prevBest = save.best[tr.id];
  const timed = kind === 'trial' || kind === 'daily';
  const pb = timed && (!prevBest || time < prevBest.time - 1e-6);
  const medal = timed ? medalFor(tr, time) : null;
  const position = withRivals() ? race.position : 0;
  const before = PAINTS.filter((p) => paintUnlocked(p.id)).map((p) => p.id);
  const carsBefore = CARS.filter((c) => carUnlocked(c.id)).map((c) => c.id);
  let unlockMsg = '';
  if (!watching) {
    if (pb) {
      save.best[tr.id] = { time, splits: race.splits.map((s) => Math.round(s * 1000) / 1000), laps: race.lapTimes.map((s) => Math.round(s * 1000) / 1000) };
      storeGhost(tr.id, { time, data: encodeGhost(recorder.frames) });
    }
    const lap = race.bestLap;
    if (!save.bestLap[tr.id] || lap < save.bestLap[tr.id]) save.bestLap[tr.id] = lap;
    const st = save.stats;
    st.races++;
    st.laps += race.laps;
    st.driftTotal = (st.driftTotal || 0) + drift.total;
    st.driftBest = Math.max(st.driftBest || 0, drift.best);
    if (withRivals()) {
      if (!save.raceBest[tr.id] || position < save.raceBest[tr.id]) save.raceBest[tr.id] = position;
      if (position === 1) { st.wins = (st.wins || 0) + 1; if (settings.aiLevel === 'hard') st.winsHard = (st.winsHard || 0) + 1; }
    }
    if (race.wallHits === 0 && race.grassTime < 0.05 && race.resets === 0) award('clean');
    if (kind === 'daily') save.daily = bumpStreak(save.daily, tr.key);
    if (kind === 'cup' && save.cup) cupScoreRound();
    checkAchievements();
    const fresh = PAINTS.filter((p) => paintUnlocked(p.id) && !before.includes(p.id));
    if (fresh.length) unlockMsg += `${unlockMsg ? '<br>' : ''}New paint: ${fresh.map((p) => p.name).join(', ')}`;
    const freshCars = CARS.filter((c) => carUnlocked(c.id) && !carsBefore.includes(c.id));
    if (freshCars.length) unlockMsg += `${unlockMsg ? '<br>' : ''}New car: ${freshCars.map((c) => c.name).join(', ')}`;
    persist();
  }
  sound.finish(withRivals() ? position <= 3 : !!medal);
  // fill in the finish panel
  const posMedal = withRivals() ? [null, 'gold', 'silver', 'bronze'][position] : null;
  $('finTitle').textContent = watching ? 'AUTOPILOT FINISHED' : withRivals() ? `FINISHED ${ordinal(position).toUpperCase()}` : 'FINISHED';
  if (withRivals()) {
    $('finMedal').innerHTML = posMedal ? `<div class="medalbig ${posMedal}">${ordinal(position).toUpperCase()}</div>` : `<div class="sub">${ordinal(position)} place</div>`;
  } else {
    $('finMedal').innerHTML = medal ? `<div class="medalbig ${medal.id}">${medal.name.toUpperCase()}</div>` : '<div class="sub">No medal this time</div>';
  }
  $('finTime').textContent = fmt(time);
  let note = '';
  if (timed) {
    const times = medalTimes(tr);
    const nextMedal = medal ? times[times.findIndex((m) => m.id === medal.id) - 1] : times[2];
    if (!watching && pb && prevBest) note = `<span class="pb">New best!</span> ${(prevBest.time - time).toFixed(3)}s faster`;
    else if (!watching && pb) note = '<span class="pb">First finish!</span>';
    else if (prevBest) note = `Best ${fmt(prevBest.time)} (+${(time - prevBest.time).toFixed(3)})`;
    if (nextMedal) note += `${note ? ' · ' : ''}${nextMedal.name} needs ${fmt(nextMedal.time)}`;
    if (kind === 'daily' && !watching) note += ` · Daily streak ${save.daily.streak || 1}`;
  }
  $('finNote').innerHTML = note;
  const bestLap = Math.min(...race.lapTimes);
  $('finLaps').innerHTML = race.lapTimes.map((l, k) => `<span class="${l === bestLap ? 'pb' : ''}">L${k + 1} ${fmt(l)}</span>`).join('');
  const bs = save.bestSectors[tr.id];
  $('finSectors').innerHTML = bs && bs.length === 3 && bs.every((x) => x) ? `Theoretical best lap (your best sectors added up): <b>${fmt(bs[0] + bs[1] + bs[2])}</b>` : '';
  $('finTable').innerHTML = withRivals()
    ? resultsTable().map((r) => `<div class="r${r.me ? ' me' : ''}"><span>${r.pos}</span><span><span class="sw" style="background:${hex(r.color)}"></span>${esc(r.name)}</span><span class="t">${r.est ? '~' : ''}${fmt(r.time)}</span></div>`).join('')
    : '';
  $('finDrift').innerHTML = drift.total > 0 ? `Drift score <b>${fmtPts(drift.total)}</b> · best drift ${fmtPts(drift.best)}` : '';
  $('finUnlock').innerHTML = unlockMsg;
  $('finOnline').textContent = '';
  if (!watching && timed && onlineEnabled) {
    $('finOnline').textContent = 'Sending your time to the leaderboard…';
    const data = encodeGhost(recorder.frames);
    const mine = raceToken;
    submitScore(tr.id, save.name, time, race.bestLap, data, carDef.id)
      .then(() => getMyRank(tr.id))
      .then((r) => {
        recordCache.delete(tr.id);
        if (mine === raceToken && r) $('finOnline').innerHTML = `World rank <b style="color:var(--text)">#${r.rank}</b> · your online best ${fmt(r.time)}`;
      })
      .catch(() => { if (mine === raceToken) $('finOnline').textContent = 'Leaderboard unavailable right now (your time is saved here).'; });
  }
  // next button: next track, cup standings, or none for the daily
  const next = typeof tr.id === 'number' ? TRACKS[tr.id] : null;
  if (kind === 'cup') { $('btnNext').disabled = false; $('btnNext').innerHTML = 'Standings <kbd>N</kbd>'; }
  else { $('btnNext').disabled = !next || !unlocked(next) || kind === 'daily'; $('btnNext').innerHTML = 'Next track <kbd>N</kbd>'; }
  $('btnRetry').classList.toggle('hidden', kind === 'cup');
}

function nextAfterFinish() {
  if (sess.kind === 'cup') { showStandings(); return; }
  const n = typeof cur.tr.id === 'number' ? TRACKS[cur.tr.id] : null;
  if (n && unlocked(n) && sess.kind !== 'daily') startRace(n, { watch: watching, kind: sess.kind });
}

function clearRaceView() {
  ghostModel.root.visible = false;
  recordModel.root.visible = false;
  for (const m of rivalModels) m.root.visible = false;
  setTags([]);
  $('hud').classList.add('hidden');
  $('replayHud').classList.add('hidden');
  $('photoHud').classList.add('hidden');
  $('mirrorFrame').classList.add('hidden');
}
function exitToMenu() {
  mode = 'menu';
  $('rotate').classList.add('hidden');
  race = null;
  clearRaceView();
  sound.silence();
  music.play('menu');
  persist();
  showScreen('menu');
}

// ---------- championship ----------
const CUP_POINTS = [10, 8, 6, 4, 2, 1];
const cupTracks = (theme) => TRACKS.filter((t) => t.theme === theme);
const cupOpen = (theme) => cupTracks(theme).every(unlocked);

function startCup(theme) {
  const points = { You: 0 };
  for (const r of RIVALS) points[r.name] = 0;
  save.cup = { theme, round: 0, points };
  persist();
  startRace(cupTracks(theme)[0], { kind: 'cup' });
}
function cupScoreRound() {
  const c = save.cup;
  race.order.forEach((e, k) => { c.points[e.me ? 'You' : e.name] += CUP_POINTS[k] || 0; });
  c.round++;
}
function cupTable() {
  return Object.entries(save.cup.points).sort((a, b) => b[1] - a[1]).map(([name, pts], k) => ({ pos: k + 1, name, pts, me: name === 'You' }));
}
function showStandings() {
  const c = save.cup;
  if (!c) { exitToMenu(); return; }
  mode = 'menu';
  race = null;
  clearRaceView();
  sound.silence();
  music.play('menu');
  const table = cupTable();
  const done = c.round >= 6;
  $('stTitle').textContent = `${THEMES[c.theme].name} Cup`;
  $('stSub').textContent = done ? 'Final standings' : `After race ${c.round} of 6 · next: ${cupTracks(c.theme)[c.round].name}`;
  $('stTable').innerHTML = table.map((r) => {
    const col = r.me ? paintOf(save.paint).color : RIVALS.find((x) => x.name === r.name).color;
    return `<div class="r${r.me ? ' me' : ''}"><span>${r.pos}</span><span><span class="sw" style="background:${hex(col)}"></span>${r.me ? esc(save.name) : r.name}</span><span class="t">${r.pts} pts</span></div>`;
  }).join('');
  if (done) {
    const pos = table.findIndex((r) => r.me) + 1;
    if (!save.trophies[c.theme] || pos < save.trophies[c.theme]) save.trophies[c.theme] = pos;
    $('stTrophy').textContent = pos <= 3 ? ['🏆 CHAMPION!', '🥈 Runner-up', '🥉 Third overall'][pos - 1] : `${ordinal(pos)} overall`;
    save.cup = null;
    checkAchievements();
    persist();
    $('btnCupNext').textContent = 'Done';
  } else {
    $('stTrophy').textContent = '';
    $('btnCupNext').textContent = `Race ${c.round + 1}: ${cupTracks(c.theme)[c.round].name}`;
  }
  showScreen('standings');
}
function renderCups() {
  const list = $('cupList');
  list.innerHTML = '';
  for (const theme of THEME_IDS) {
    const th = THEMES[theme], open = cupOpen(theme), t = save.trophies[theme];
    const inProgress = save.cup && save.cup.theme === theme;
    const b = document.createElement('button');
    b.className = `cup${open ? '' : ' locked'}`;
    b.innerHTML = `<span class="tro">${t === 1 ? '🏆' : t === 2 ? '🥈' : t === 3 ? '🥉' : '🏁'}</span><span class="cn">${th.name} Cup</span>
      <span class="cs">${cupTracks(theme).map((x) => x.name).join(', ')}</span>
      <span class="ct">${!open ? '🔒 Locked' : inProgress ? `Continue: race ${save.cup.round + 1} of 6` : t ? `Best: ${ordinal(t)}` : 'Not raced'}</span>`;
    b.addEventListener('click', () => {
      if (!open) return;
      sound.click();
      if (inProgress) startRace(cupTracks(theme)[save.cup.round], { kind: 'cup' });
      else startCup(theme);
    });
    list.appendChild(b);
  }
}

// ---------- daily challenge ----------
function todaysDaily() {
  const key = dayKey();
  const def = dailyDef(key, save.dailyCache[key]);
  if (def && !save.dailyCache[key]) { save.dailyCache = { [key]: { seed: def.seed, gold: def.gold } }; persist(); }
  return def;
}
function refreshDailyButton() {
  const def = todaysDaily();
  if (!def) { $('dailySub').textContent = 'Not available today'; return; }
  const ms = msToNextDay(), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  const best = save.best[def.id];
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  const streak = save.daily.last === def.key || save.daily.last === yesterday ? save.daily.streak || 0 : 0;
  $('dailySub').textContent = `${THEMES[def.theme].name}${def.wet ? ' · rain' : ''} · ${(trackData(def).L / 1000).toFixed(2)} km · ${best ? `best ${fmt(best.time)}` : 'not raced yet'} · new one in ${h}h ${m}m${streak ? ` · streak ${streak}` : ''}`;
}

// ---------- screens ----------
const SCREENS = ['menu', 'tracks', 'garage', 'boards', 'stats', 'settings', 'controls', 'pause', 'finish', 'cups', 'standings'];
let backTo = 'menu';
function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  if (id === 'menu') refreshMenu();
  if (id === 'tracks') renderTracks();
  if (id === 'garage') renderGarage();
  if (id === 'stats') renderStats();
  if (id === 'boards') renderBoards();
  if (id === 'settings') loadSettingsUI();
  if (id === 'cups') renderCups();
}
for (const b of document.querySelectorAll('.back')) b.addEventListener('click', () => { sound.click(); showScreen(backTo); });

function nextTrack() {
  const firstNoMedal = TRACKS.find((tr) => unlocked(tr) && !medalFor(tr, save.best[tr.id]?.time));
  return firstNoMedal || TRACKS.find((t) => t.id === save.last) || TRACKS[0];
}

function refreshMenu() {
  const tr = nextTrack();
  if (!race && (!cur || cur.tr !== tr)) loadTrack(tr);
  $('nextName').textContent = `Track ${tr.id}: ${tr.name}${tr.wet ? ' (rain)' : ''}`;
  $('nextBest').textContent = save.best[tr.id] ? `Best ${fmt(save.best[tr.id].time)}` : THEMES[tr.theme].name;
  const c = medalCounts();
  let b = 0;
  for (const tr2 of TRACKS) if (medalFor(tr2, save.best[tr2.id]?.time)?.id === 'bronze') b++;
  $('medalTotals').innerHTML = `<span><span class="dot gold"></span><b>${c.gold}</b></span><span><span class="dot silver"></span><b>${c.silver - c.gold}</b></span><span><span class="dot bronze"></span><b>${b}</b></span><span>${TRACKS.filter((t) => save.best[t.id]).length}/${TRACKS.length} tracks finished</span>`;
  refreshDailyButton();
  checkAchievements();
}

let trackMode = 'trial';
for (const b of document.querySelectorAll('#trackTabs button')) b.addEventListener('click', () => { sound.click(); trackMode = b.dataset.mode; renderTracks(); });
function renderTracks() {
  for (const b of document.querySelectorAll('#trackTabs button')) b.classList.toggle('on', b.dataset.mode === trackMode);
  $('aiNote').textContent = trackMode === 'race' ? `Five AI rivals (${settings.aiLevel}; change it in Settings). Finish in the top three for a podium.` : '';
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
      const best = save.best[tr.id], rb = save.raceBest[tr.id];
      const m = trackMode === 'race' ? (rb && rb <= 3 ? { id: ['gold', 'silver', 'bronze'][rb - 1] } : null) : medalFor(tr, best?.time);
      const len = trackData(tr).L;
      const b = document.createElement('button');
      b.className = `card${unlocked(tr) ? '' : ' locked'}`;
      const status = trackMode === 'race' ? (rb ? `Best finish ${ordinal(rb)}` : 'Not raced') : (best ? fmt(best.time) : 'Not raced');
      b.innerHTML = `<span class="stripe" style="background:#${new THREE.Color(th.skyTop).getHexString()}"></span>
        <span class="num">${tr.id}</span><span class="nm">${tr.name}</span>
        <span class="meta">${(len / 1000).toFixed(2)} km · 3 laps${tr.wet ? ' · rain' : ''}</span>
        <span class="bt">${unlocked(tr) ? status : '🔒 Locked'}</span>
        ${m ? `<span class="md" style="background:${medalColor[m.id]}"></span>` : ''}`;
      b.title = medalTimes(tr).map((x) => `${x.name} ${fmt(x.time)}`).join('\n');
      b.addEventListener('click', () => { if (unlocked(tr)) { sound.click(); startRace(tr, { kind: trackMode }); } });
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
  const cars = $('carList');
  cars.innerHTML = '';
  for (const def of CARS) {
    const ok = carUnlocked(def.id, c);
    const b = document.createElement('button');
    b.className = `carpick${carDef.id === def.id ? ' on' : ''}${ok ? '' : ' locked'}`;
    const bar = (n) => `<span class="bar">${'<i></i>'.repeat(n)}${'<i class="off"></i>'.repeat(5 - n)}</span>`;
    b.innerHTML = `<span class="cn">${def.name}</span><span class="cb">${ok ? def.blurb : '🔒 ' + CAR_RULES[def.id].text}</span>
      <span class="stats"><span>Speed ${bar(def.stats.speed)}</span><span>Accel ${bar(def.stats.accel)}</span><span>Grip ${bar(def.stats.grip)}</span><span>Drift ${bar(def.stats.drift)}</span></span>`;
    b.addEventListener('click', () => {
      if (!ok) return;
      sound.click();
      save.car = def.id;
      save.profileAt = Date.now();
      useCar(def.id);
      persist();
      renderGarage();
    });
    cars.appendChild(b);
  }
  const list = $('paintList');
  list.innerHTML = '';
  for (const p of PAINTS) {
    const ok = paintUnlocked(p.id, c);
    const b = document.createElement('button');
    b.className = `paint${save.paint === p.id ? ' on' : ''}${ok ? '' : ' locked'}`;
    b.innerHTML = `<span class="sw" style="background:${hex(p.color)}"></span>${p.name}<span class="req">${ok ? (save.paint === p.id ? 'Selected' : '') : '🔒 ' + PAINT_RULES[p.id].text}</span>`;
    b.addEventListener('click', () => {
      if (!ok) return;
      sound.click();
      save.paint = p.id;
      save.profileAt = Date.now();
      carModel.setPaint(p.color, p.metal);
      persist();
      renderGarage();
    });
    list.appendChild(b);
  }
}

// leaderboards: index 0 = today's daily challenge, 1..24 = the circuits
let boardTrack = 1, boardToken = 0, boardDef = null;
function renderBoards() {
  $('nameInput').value = save.name;
  const tr = boardTrack === 0 ? todaysDaily() : TRACKS[boardTrack - 1];
  boardDef = tr;
  if (!tr) return;
  $('boardTitle').innerHTML = `${isDaily(tr) ? '' : `${tr.id}. `}${esc(tr.name)}<span class="sub">${THEMES[tr.theme].name}${tr.wet ? ' · rain' : ''} · your best here ${fmtShort(save.best[tr.id]?.time)}</span>`;
  $('boardMe').textContent = '';
  $('btnWatchWR').classList.add('hidden');
  if (!onlineEnabled) { $('boardList').innerHTML = '<div class="sub">Online leaderboards are switched off.</div>'; return; }
  $('boardList').innerHTML = '<div class="sub">Loading…</div>';
  const token = ++boardToken;
  Promise.all([getLeaderboard(tr.id, 10), getMyRank(tr.id)]).then(([rows, me]) => {
    if (token !== boardToken) return;
    $('boardList').innerHTML = rows.length
      ? rows.map((r, k) => `<div class="r${r.me ? ' me' : ''}"><span>#${k + 1}</span><span>${esc(r.name)}${r.me ? ' (you)' : ''}</span><span class="l">${carById(r.car).name} · best lap ${fmt(r.lap)}</span><span class="t">${fmt(r.time)}</span></div>`).join('')
      : '<div class="sub">No times yet. Be the first!</div>';
    $('boardMe').textContent = me ? `You: #${me.rank} with ${fmt(me.time)}` : 'You have no online time here yet.';
    $('btnWatchWR').classList.toggle('hidden', !rows.length);
  }).catch((e) => { window.__lastBoardError = String(e); if (token === boardToken) $('boardList').innerHTML = '<div class="sub">Couldn\'t reach the leaderboard. Check your connection and try again.</div>'; });
}
$('boardPrev').addEventListener('click', () => { boardTrack = (boardTrack + TRACKS.length) % (TRACKS.length + 1); renderBoards(); });
$('boardNext').addEventListener('click', () => { boardTrack = (boardTrack + 1) % (TRACKS.length + 1); renderBoards(); });
$('nameInput').addEventListener('change', (e) => {
  save.name = cleanName(e.target.value);
  save.profileAt = Date.now();
  e.target.value = save.name;
  persist();
});
$('nameInput').addEventListener('keydown', (e) => e.stopPropagation());
$('btnWatchWR').addEventListener('click', () => {
  sound.click();
  const tr = boardDef;
  $('btnWatchWR').textContent = 'Loading…';
  getRecordGhost(tr.id).then((r) => {
    $('btnWatchWR').textContent = 'Watch the world record';
    const f = r && decodeGhost(r.data);
    if (f && f.length > 6) startReplay(tr, f, `World record · ${r.name} · ${fmt(r.time)}`, 'boards');
  }).catch(() => { $('btnWatchWR').textContent = 'Watch the world record'; });
});

// profile: stats, achievements, account
let profTab = 'statList';
for (const b of document.querySelectorAll('#profTabs button')) b.addEventListener('click', () => { sound.click(); profTab = b.dataset.tab; renderStats(); });
function renderStats() {
  for (const b of document.querySelectorAll('#profTabs button')) b.classList.toggle('on', b.dataset.tab === profTab);
  for (const id of ['statList', 'achList', 'acctBox']) $(id).classList.toggle('hidden', id !== profTab);
  const s = save.stats, c = medalCounts();
  const hrs = s.time / 3600;
  const trophies = Object.values(save.trophies).filter((p) => p === 1).length;
  const rows = [
    ['Races finished', s.races],
    ['Race wins against the AI', s.wins || 0],
    ['Championship cups won', `${trophies} / 4`],
    ['Laps completed', s.laps],
    ['Distance driven', `${(s.distance / 1000).toFixed(1)} km`],
    ['Time driving', hrs >= 1 ? `${hrs.toFixed(1)} h` : `${Math.round(s.time / 60)} min`],
    ['Top speed', `${Math.round((s.topSpeed || 0) * (settings.units === 'mph' ? 2.237 : 3.6))} ${settings.units === 'mph' ? 'mph' : 'km/h'}`],
    ['Total drift points', fmtPts(s.driftTotal || 0)],
    ['Best single drift', fmtPts(s.driftBest || 0)],
    ['Wall hits', s.hits || 0],
    ['Gold medals', c.gold],
    ['Medals', `${c.any} / ${TRACKS.length}`],
    ['Daily streak (best)', `${save.daily.streak || 0} (${save.daily.best || 0})`],
    ['Tracks finished', `${TRACKS.filter((t) => save.best[t.id]).length} / ${TRACKS.length}`],
  ];
  $('statList').innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
  const got = Object.keys(save.achievements).length;
  $('achList').innerHTML = `<div class="sub">${got} of ${ACHIEVEMENTS.length} earned</div>` + ACHIEVEMENTS.map((a) => {
    const on = !!save.achievements[a.id];
    return `<div class="ach${on ? '' : ' off'}"><span class="ic">${on ? '🏅' : '🔒'}</span><span><b>${a.name}</b>${a.desc}${a.reward ? ` <span class="rw">· ${a.reward}</span>` : ''}</span><span class="sub">${on ? save.achievements[a.id] : ''}</span></div>`;
  }).join('');
  $('acctCode').textContent = save.account ? formatCode(save.account.code) : 'No code yet';
  $('btnAcctMake').classList.toggle('hidden', !!save.account);
  $('btnAcctCopy').classList.toggle('hidden', !save.account);
}
$('acctInput').addEventListener('keydown', (e) => e.stopPropagation());
$('btnAcctMake').addEventListener('click', () => {
  sound.click();
  if (!onlineEnabled) { $('acctMsg').textContent = 'Online is switched off.'; return; }
  $('acctMsg').textContent = 'Making your code…';
  createAccount(newAccountCode(), packSave(save)).then((a) => {
    save.account = a; setAccount(a); persist();
    $('acctMsg').textContent = 'Done! Write it down somewhere safe.';
    renderStats();
  }).catch(() => { $('acctMsg').textContent = 'Couldn\'t reach the server. Try again later.'; });
});
$('btnAcctCopy').addEventListener('click', () => {
  sound.click();
  navigator.clipboard?.writeText(formatCode(save.account.code)).then(() => { $('acctMsg').textContent = 'Copied.'; }, () => {});
});
$('btnAcctUse').addEventListener('click', () => {
  sound.click();
  const code = parseCode($('acctInput').value);
  if (!code) { $('acctMsg').textContent = 'That doesn\'t look like a code (16 letters and numbers).'; return; }
  $('acctMsg').textContent = 'Loading…';
  fetchAccount(code).then((remote) => {
    if (!remote) { $('acctMsg').textContent = 'No account with that code.'; return; }
    joinAccount(code, remote);
    $('acctMsg').textContent = 'Account loaded: your progress is merged and saves to this code from now on.';
    renderStats();
  }).catch(() => { $('acctMsg').textContent = 'Couldn\'t reach the server. Try again later.'; });
});
function joinAccount(code, remote) {
  Object.assign(save, mergeSaves(save, unpackSave(remote.save)));
  save.account = { code, pid: remote.pid };
  setAccount(save.account);
  if (save.car && carById(save.car).id !== carDef.id) useCar(save.car);
  carModel.setPaint(paintOf(save.paint).color, paintOf(save.paint).metal);
  persist();
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
  $('setAi').value = settings.aiLevel;
  $('setMirror').value = settings.mirror;
  $('setHints').checked = settings.hints;
  $('setRumble').checked = settings.rumble;
  $('setSteer').value = settings.steer;
  $('setTiltInv').checked = settings.tiltInvert;
  $('setAutoGas').checked = settings.autoGas;
  $('setFull').checked = settings.fullscreen;
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
bindSetting('setAi', 'aiLevel', 'select');
bindSetting('setMirror', 'mirror', 'select');
bindSetting('setHints', 'hints', 'check');
bindSetting('setRumble', 'rumble', 'check');
bindSetting('setSteer', 'steer', 'select', () => {
  if (settings.steer === 'tilt') {
    input.askTilt().then((ok) => {
      if (!ok) { settings.steer = 'buttons'; $('setSteer').value = 'buttons'; persist(); }
      input.tiltOn = settings.steer === 'tilt';
    });
  } else input.tiltOn = false;
});
bindSetting('setTiltInv', 'tiltInvert', 'check', () => { input.tiltInvert = settings.tiltInvert; });
bindSetting('setAutoGas', 'autoGas', 'check', () => { input.autoGas = settings.autoGas; });
bindSetting('setFull', 'fullscreen', 'check');

// buttons
const click = (id, fn) => $(id).addEventListener('click', () => { sound.init(); sound.click(); fn(); });
click('btnPlay', () => startRace(nextTrack()));
click('btnRaceMode', () => { backTo = 'menu'; trackMode = 'race'; showScreen('tracks'); });
click('btnCups', () => { backTo = 'menu'; showScreen('cups'); });
click('btnDaily', () => { const d = todaysDaily(); if (d) startRace(d, { kind: 'daily' }); });
click('btnTracks', () => { backTo = 'menu'; trackMode = 'trial'; showScreen('tracks'); });
click('btnGarage', () => { backTo = 'menu'; showScreen('garage'); });
click('btnStats', () => { backTo = 'menu'; showScreen('stats'); });
click('btnBoards', () => { backTo = 'menu'; boardTrack = save.last || 1; showScreen('boards'); });
click('btnSettings', () => { backTo = 'menu'; showScreen('settings'); });
click('btnControls', () => { backTo = 'menu'; showScreen('controls'); });
$('btnWatch').addEventListener('click', (e) => { e.preventDefault(); sound.init(); startRace(nextTrack(), { watch: true }); });
click('btnResume', resume);
click('btnRestart', () => startRace(cur.tr, { watch: watching, kind: sess.kind === 'cup' ? 'race' : sess.kind }));
click('btnPhoto', startPhoto);
click('btnPauseSettings', () => { backTo = 'pause'; showScreen('settings'); });
click('btnPauseMenu', exitToMenu);
click('btnRetry', () => startRace(cur.tr, { watch: watching, kind: sess.kind }));
click('btnReplay', () => { if (recorder && recorder.frames.length > 6) startReplay(cur.tr, recorder.frames.slice(), watching ? 'Autopilot replay' : 'Your run', 'finish'); });
click('btnNext', nextAfterFinish);
click('btnFinMenu', exitToMenu);
click('btnCupNext', () => { if (save.cup) startRace(cupTracks(save.cup.theme)[save.cup.round], { kind: 'cup' }); else exitToMenu(); });
click('btnCupQuit', exitToMenu);

function pause() {
  mode = 'paused';
  sound.silence();
  backTo = 'pause';
  // restarting a championship round isn't allowed (it would let you re-roll a bad result)
  $('btnRestart').classList.toggle('hidden', sess.kind === 'cup');
  showScreen('pause');
}
function resume() {
  if (mode !== 'paused') return;
  if (TOUCH && innerHeight > innerWidth * 1.05) { checkOrientation(); return; }
  input.centreTilt();
  mode = 'race';
  acc = 0;
  showScreen(null);
}

// ---------- replays ----------
let rp = null; // { player, t, speed, paused, camMode, director, title, back, dur }
function startReplay(tr, frames, title, back) {
  loadTrack(tr);
  const player = new GhostPlayer(frames, cur.track);
  rp = { player, t: 0, speed: 1, paused: false, camMode: 'tv', director: new Director(cur.track, cur.cams), title, back, dur: player.count / 30 };
  mode = 'replay';
  showScreen(null);
  clearRaceView();
  $('replayHud').classList.remove('hidden');
  $('rpTitle').textContent = title;
  $('rpPlay').textContent = 'Pause'; $('rpSpeed').textContent = '1x';
  sound.silence();
}
function endReplay() {
  $('replayHud').classList.add('hidden');
  const back = rp.back;
  rp = null;
  if (back === 'finish' && race) { mode = 'finished'; showScreen('finish'); }
  else { mode = 'menu'; race = null; backTo = 'menu'; showScreen(back || 'menu'); }
}
function replayFrame(dt) {
  if (!rp.paused) rp.t = Math.min(rp.dur, rp.t + dt * rp.speed);
  const p = rp.player.at(Math.min(rp.t, rp.dur - 0.05)) || rp.player.pose(rp.player.count - 2, 1);
  carModel.pose(p.x, p.y, p.z, p.h, p.pitch);
  carModel.animate(dt, { speed: rp.paused ? 0 : p.speed * rp.speed });
  carModel.root.visible = true; carModel.body.visible = true;
  if (rp.camMode === 'tv') {
    const cam = rp.director.pick(rp.player.loc.s, p.x, p.z, dt * rp.speed);
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(p.x, p.y + 0.8, p.z);
    const fov = zoomFov(Math.hypot(cam.x - p.x, cam.y - p.y, cam.z - p.z));
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 6);
    camera.updateProjectionMatrix();
  } else {
    chaseCamera(dt, p, p.speed, Math.cos(p.h) * p.speed, Math.sin(p.h) * p.speed);
  }
  cur.world.update(carModel.root.position);
  effects.updateRain(dt, camera.position);
  $('rpTime').textContent = `${fmt(rp.t)} / ${fmt(rp.dur)}${rp.paused ? ' · PAUSED' : rp.speed !== 1 ? ` · ${rp.speed}x` : ''}`;
}

// ---------- photo mode ----------
let photo = null; // { yaw, pitch, dist, tx, ty, tz, drag }
function startPhoto() {
  if (!race) return;
  const c = race.car;
  photo = { yaw: c.h + Math.PI + 0.6, pitch: 0.25, dist: 7, tx: c.x, ty: c.y + 0.8, tz: c.z, drag: null };
  mode = 'photo';
  showScreen(null);
  $('hud').classList.add('hidden');
  setTags([]);
  $('photoHud').classList.remove('hidden');
}
function endPhoto() {
  photo = null;
  $('photoHud').classList.add('hidden');
  mode = 'paused';
  showScreen('pause');
}
function photoFrame(dt) {
  const k = input.keys, sp = 8 * dt;
  const fx = -Math.cos(photo.yaw), fz = -Math.sin(photo.yaw);
  if (k.has('KeyW')) { photo.tx += fx * sp; photo.tz += fz * sp; }
  if (k.has('KeyS')) { photo.tx -= fx * sp; photo.tz -= fz * sp; }
  if (k.has('KeyA')) { photo.tx += fz * sp; photo.tz -= fx * sp; }
  if (k.has('KeyD')) { photo.tx -= fz * sp; photo.tz += fx * sp; }
  if (k.has('KeyQ')) photo.ty -= sp;
  if (k.has('KeyE')) photo.ty += sp;
  const cp = Math.cos(photo.pitch);
  camera.position.set(photo.tx + Math.cos(photo.yaw) * cp * photo.dist, photo.ty + Math.sin(photo.pitch) * photo.dist, photo.tz + Math.sin(photo.yaw) * cp * photo.dist);
  camera.lookAt(photo.tx, photo.ty, photo.tz);
  if (camera.fov !== settings.fov) { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
}
function savePhoto() {
  renderer.render(scene, camera);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `redline-${dayKey()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
  award('photo');
  sound.tone({ type: 'square', freq: 1800, dur: 0.05, gain: 0.08 });
}
canvas.addEventListener('pointerdown', (e) => { if (photo) photo.drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { if (photo) photo.drag = null; });
addEventListener('pointermove', (e) => {
  if (!photo || !photo.drag) return;
  photo.yaw += (e.clientX - photo.drag.x) * 0.006;
  photo.pitch = Math.max(-0.2, Math.min(1.4, photo.pitch + (e.clientY - photo.drag.y) * 0.005));
  photo.drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('wheel', (e) => { if (photo) photo.dist = Math.max(2, Math.min(40, photo.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });
// photo mode and replay buttons (touch screens)
const tapBtn = (id, fn) => $(id).addEventListener('click', () => { sound.init(); fn(); });
tapBtn('phIn', () => { if (photo) photo.dist = Math.max(2, photo.dist * 0.8); });
tapBtn('phOut', () => { if (photo) photo.dist = Math.min(40, photo.dist * 1.25); });
tapBtn('phUp', () => { if (photo) photo.ty += 0.8; });
tapBtn('phDown', () => { if (photo) photo.ty -= 0.8; });
tapBtn('phSave', () => { if (photo) savePhoto(); });
tapBtn('phBack', () => { if (photo) endPhoto(); });
tapBtn('rpBack', () => { if (rp) endReplay(); });
tapBtn('rpPrev', () => { if (rp) input.handlers.key('ArrowLeft'); });
tapBtn('rpNext', () => { if (rp) input.handlers.key('ArrowRight'); });
tapBtn('rpPlay', () => { if (rp) { rp.paused = !rp.paused; $('rpPlay').textContent = rp.paused ? 'Play' : 'Pause'; } });
tapBtn('rpSpeed', () => { if (rp) { rp.speed = rp.speed === 1 ? 2 : rp.speed === 2 ? 0.5 : 1; $('rpSpeed').textContent = `${rp.speed}x`; } });
tapBtn('rpCam', () => { if (rp) rp.camMode = rp.camMode === 'tv' ? 'chase' : 'tv'; });

// ---------- keys ----------
const CAMERAS = ['chase', 'far', 'hood', 'bumper'];
input.handlers.key = (code) => {
  sound.init();
  if (mode === 'race') {
    if (code === 'Escape') { if (watching) exitToMenu(); else pause(); }
    else if (code === 'KeyR' && sess.kind !== 'cup') startRace(cur.tr, { watch: watching, kind: sess.kind });
    else if (code === 'KeyC' && !watching) race.recover();
    else if (code === 'KeyV') { settings.camera = CAMERAS[(CAMERAS.indexOf(settings.camera) + 1) % CAMERAS.length]; persist(); }
    else if (code === 'KeyL') { settings.racingLine = !settings.racingLine; rebuildWorld(); persist(); toast(`Racing line ${settings.racingLine ? 'on' : 'off'}`, 900); }
    else if (code === 'KeyG' && !withRivals()) {
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
    if (code === 'Escape' && !$('pause').classList.contains('hidden')) resume();
    else if (code === 'Escape') showScreen('pause');
  } else if (mode === 'finished') {
    if (code === 'KeyR' && sess.kind !== 'cup') startRace(cur.tr, { watch: watching, kind: sess.kind });
    else if ((code === 'KeyN' || code === 'Enter') && !$('btnNext').disabled) nextAfterFinish();
    else if (code === 'KeyP') $('btnReplay').click();
    else if (code === 'Escape') exitToMenu();
  } else if (mode === 'replay') {
    if (code === 'Escape') endReplay();
    else if (code === 'Space') rp.paused = !rp.paused;
    else if (code === 'ArrowLeft') { rp.t = Math.max(0, rp.t - 5); rp.director.cut(); }
    else if (code === 'ArrowRight') { rp.t = Math.min(rp.dur, rp.t + 5); rp.director.cut(); }
    else if (code === 'Digit1') rp.speed = 0.5;
    else if (code === 'Digit2') rp.speed = 1;
    else if (code === 'Digit3') rp.speed = 2;
    else if (code === 'KeyC') rp.camMode = rp.camMode === 'tv' ? 'chase' : 'tv';
  } else if (mode === 'photo') {
    if (code === 'Escape') endPhoto();
    else if (code === 'Enter') savePhoto();
  } else if (mode === 'menu') {
    const open = SCREENS.find((s) => !$(s).classList.contains('hidden'));
    if (code === 'Escape' && open && open !== 'menu' && open !== 'standings') showScreen('menu');
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
    carModel.root.visible = cam === 'hood';
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
    camY += (p.y + hgt - camY) * (1 - Math.exp(-dt * 6));
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
  effects.updateRain(dt, camera.position);
}

// ---------- rear-view mirror ----------
const mirrorOn = () => race && settings.camera !== 'hood' && (settings.mirror === 'always' || (settings.mirror === 'races' && withRivals()));
function renderMirror(pose) {
  const w = Math.round(Math.min(380, innerWidth * 0.3)), h = Math.round(w / 3.4), x = Math.round((innerWidth - w) / 2), top = 15;
  const ch = Math.cos(pose.h), sh = Math.sin(pose.h);
  mirrorCam.position.set(pose.x + ch * 0.2, pose.y + 1.35, pose.z + sh * 0.2);
  mirrorCam.lookAt(pose.x - ch * 30, pose.y + 0.6, pose.z - sh * 30);
  const wasVisible = carModel.root.visible;
  carModel.root.visible = false;
  renderer.setScissorTest(true);
  renderer.setScissor(x, innerHeight - top - h, w, h);
  renderer.setViewport(x, innerHeight - top - h, w, h);
  renderer.render(scene, mirrorCam);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  carModel.root.visible = wasVisible;
  const f = $('mirrorFrame').style;
  f.width = `${w}px`; f.height = `${h}px`; f.top = `${top - 3}px`;
}

// ---------- main loop ----------
let last = performance.now(), fpsT = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.pollPad();
  let pose = null;

  if ((mode === 'race' || mode === 'finished') && race) {
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 24) {
      const c = race.car;
      prev = { x: c.x, y: c.y, z: c.z, h: c.h, pitch: c.pitch };
      if (race.field) prevRivals = race.field.cars.map((r) => ({ x: r.car.x, y: r.car.y, z: r.car.z, h: r.car.h, pitch: r.car.pitch }));
      const inp = mode === 'finished' ? { throttle: 0, brake: 0.3, steer: 0 } : bot ? bot.drive(c) : input.read();
      lastInput = inp;
      race.step(inp);
      if (race.state === 'racing') {
        recorder.add(c);
        drift.step(c, DT, c.hit > 2);
        driftEvents();
        if (!watching) {
          const sp = Math.abs(c.u);
          save.stats.distance += sp * DT;
          save.stats.time += DT;
          if (sp > (save.stats.topSpeed || 0)) save.stats.topSpeed = sp;
          if (c.hit > 2) save.stats.hits = (save.stats.hits || 0) + 1;
        }
      }
      handleEvents();
      acc -= DT;
      steps++;
      if (mode !== 'race' && mode !== 'finished') break;
    }
    if (steps >= 24) acc = 0;
  }
  if ((mode === 'race' || mode === 'finished') && race) {
    const c = race.car;
    const a = prev ? acc / DT : 1;
    const lerp = (P0, P1) => ({
      x: P0.x + (P1.x - P0.x) * a, y: P0.y + (P1.y - P0.y) * a, z: P0.z + (P1.z - P0.z) * a,
      h: P0.h + (P1.h - P0.h) * a, pitch: P0.pitch + (P1.pitch - P0.pitch) * a,
    });
    pose = lerp(prev || c, c);
    carModel.pose(pose.x, pose.y, pose.z, pose.h, pose.pitch);
    const speed = Math.hypot(c.u, c.v);
    const braking = lastInput.brake > 0 && c.u > 0.5;
    carModel.animate(dt, { steer: c.steer, speed: c.u, latAcc: c.u * c.r, longAcc: c.ax, braking });
    const ch = Math.cos(c.h), sh = Math.sin(c.h);
    const vx = c.u * ch - c.v * sh, vz = c.u * sh + c.v * ch;

    // rivals
    const tags = [], dots = [];
    if (race.field) {
      const order = race.order;
      race.field.cars.forEach((r, k) => {
        const m = rivalModels[k];
        if (!m) return;
        const rc = r.car, rpz = lerp(prevRivals[k] || rc, rc);
        m.root.visible = true;
        m.pose(rpz.x, rpz.y, rpz.z, rpz.h, rpz.pitch);
        m.animate(dt, { steer: rc.steer, speed: rc.u, latAcc: rc.u * rc.r, longAcc: rc.ax, braking: rc.ax < -3 });
        const pos = order.indexOf(r) + 1;
        tags.push({ x: rpz.x, y: rpz.y, z: rpz.z, color: hex(r.color), html: `<span class="tp">P${pos}</span>${r.name}` });
        dots.push([rpz, hex(r.color)]);
      });
    }

    // ghosts: your best (cyan) and the world record (gold)
    const gm = withRivals() ? 'off' : settings.ghost;
    const gp = showGhost(ghostModel, gm === 'best' || gm === 'both' ? ghost : null, c, dt);
    const rpG = showGhost(recordModel, gm === 'record' || gm === 'both' ? recordGhost : null, c, dt);
    if (rpG && recordInfo && !recordInfo.me) tags.push({ x: rpG.x, y: rpG.y, z: rpG.z, color: '#ffd25a', html: `<span class="tp">WR</span>${esc(recordInfo.name)} · ${fmt(recordInfo.time)}` });
    dots.push([gp, '#5ff0ff'], [rpG, '#ffd25a']);

    // tyre smoke, skid marks and spray
    const slide = Math.max(c.slipR - 1.3, c.slipF - 1.5, (c.drift || 0) > 0.12 ? (c.drift - 0.08) * 3 : 0);
    for (let w = 0; w < 2; w++) {
      const side = w ? 0.86 : -0.86;
      const wx = c.x - ch * 1.3 - sh * side, wz = c.z - sh * 1.3 + ch * side;
      const strength = c.onGrass ? 0 : Math.max(0, Math.min(1, slide * 2.5)) * Math.min(1, speed / 6);
      effects.mark(w, wx, c.y, wz, ch, sh, cur.track.wet ? strength * 0.4 : strength);
      if (strength > 0.15 && Math.random() < strength) effects.puff(wx, c.y + 0.3, wz, vx, vz, strength);
      if (c.onGrass && speed > 6 && Math.random() < 0.35) effects.puff(wx, c.y + 0.2, wz, vx, vz, 0.2);
      if (cur.track.wet && speed > 14 && Math.random() < Math.min(0.7, speed / 60)) effects.puff(wx, c.y + 0.25, wz, vx * 0.3, vz * 0.3, 0.15);
    }
    effects.update(dt);

    // kerbs: rumble (sound, a little camera judder, gamepad)
    if (c.onKerb && speed > 6 && race.state === 'racing') {
      if (settings.shake) shake = Math.max(shake, 0.06);
      if (settings.rumble && now > kerbRumbleAt) { input.rumble(0.3, 70); kerbRumbleAt = now + 90; }
    }

    chaseCamera(dt, pose, speed, vx, vz);
    cur.world.update(carModel.root.position);
    effects.updateRain(dt, camera.position);
    if (mode === 'race' || finishShown) setTags(tags);

    // countdown lights: one more red light every 0.6 s, then green
    if (race.state === 'countdown') cur.world.setStartLights(Math.min(5, Math.floor((3 - race.countdownLeft) / 0.6) + 1));

    // sound
    if (c.gear !== lastGear && race.state === 'racing') { sound.shift(); lastGear = c.gear; }
    sound.update({ rpm: c.rpm, throttle: mode === 'finished' ? 0 : race.state === 'countdown' ? Math.min(1, c.rpm / carDef.spec.revMax) : lastInput.throttle, speed, slip: Math.max(c.slipR, c.slipF * 0.9), grass: c.onGrass, kerb: c.onKerb, active: true });
    music.setIntensity(Math.min(1, speed / 60));

    // wrong way
    const along = ch * c.loc.tx + sh * c.loc.tz;
    if (race.state === 'racing' && along < -0.3 && speed > 3) wrongTime += dt; else wrongTime = 0;
    $('wrongway').classList.toggle('hidden', wrongTime < 1);

    updateHud(c, speed, pose, dots);
    if (mode === 'finished' && finishShown && now > finishShown) { finishShown = 0; showScreen('finish'); $('hud').classList.add('hidden'); setTags([]); }
  } else if (mode === 'replay' && rp) {
    replayFrame(dt);
  } else if (mode === 'photo' && photo) {
    photoFrame(dt);
    effects.updateRain(dt, camera.position);
  } else if (mode === 'paused' && race) {
    // frozen; keep the picture
  } else {
    menuCamera(dt);
    effects.update(dt);
  }
  music.update(dt);
  showAchievements(now);

  if (settings.fps) {
    fpsN++; fpsT += dt;
    if (fpsT > 0.5) { $('fps').textContent = `${Math.round(fpsN / fpsT)} fps`; fpsN = 0; fpsT = 0; }
  }
  $('fps').classList.toggle('hidden', !settings.fps || mode === 'menu');
  renderer.render(scene, camera);
  $('touchUI').classList.toggle('hidden', !(TOUCH && mode === 'race' && !watching));
  const mir = mode === 'race' && pose && mirrorOn();
  if (mir) renderMirror(pose);
  $('mirrorFrame').classList.toggle('hidden', !mir);
  document.querySelector('.hud-top').classList.toggle('mirror', !!mir);
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

function updateHud(c, speed, pose, dots) {
  const now = performance.now();
  $('timer').textContent = fmt(race.time);
  $('lapNum').textContent = Math.min(race.lap + 1, race.laps);
  $('lapTime').textContent = fmt(race.state === 'finished' ? race.lapTimes[race.lapTimes.length - 1] : race.lapTime);
  const bl = Math.min(save.bestLap[cur.tr.id] || Infinity, race.bestLap || Infinity);
  $('bestLap').textContent = `Best lap ${isFinite(bl) ? fmt(bl) : '--'}`;
  const bestThis = race.lapTimes.length ? Math.min(...race.lapTimes) : 0;
  $('lapList').innerHTML = race.lapTimes.map((l, k) => `<div class="${l === bestThis ? 'pb' : ''}">L${k + 1} ${fmt(l)}</div>`).join('');
  if (withRivals()) $('posNum').textContent = race.position;
  const k = settings.units === 'mph' ? 2.237 : 3.6;
  $('speed').textContent = Math.round(Math.abs(c.u) * k);
  $('unit').textContent = settings.units === 'mph' ? 'MPH' : 'KM/H';
  $('gear').textContent = c.u < -0.5 ? 'R' : race.state === 'countdown' ? 'N' : c.gear;
  const revMax = carDef.spec.revMax;
  $('rpmFill').style.width = `${Math.max(0, Math.min(1, c.rpm / revMax)) * 100}%`;
  // launch control: the green zone on the rev bar during the countdown
  const counting = race.state === 'countdown' && race.launch;
  $('rpmZone').classList.toggle('hidden', !counting);
  $('launchTip').classList.toggle('hidden', !counting || race.tick * DT < 0.6);
  if (counting) {
    const [lo, hi] = race.launchBand;
    $('rpmZone').style.left = `${(lo / revMax) * 100}%`;
    $('rpmZone').style.width = `${((hi - lo) / revMax) * 100}%`;
  }
  if (countText && now < countUntil) {
    $('countdown').textContent = countText;
    $('countdown').className = countText === 'GO' ? 'go' : '';
  } else $('countdown').textContent = '';
  if (now > deltaUntil) $('delta').classList.remove('show');
  if (now > toastUntil) $('toast').classList.remove('show');
  // drift score
  if (drift.active && drift.chain >= 1) {
    $('driftBox').className = '';
    $('driftPts').textContent = fmtPts(drift.chain);
    $('driftMult').textContent = drift.mult > 1 ? `DRIFT ×${drift.mult}` : 'DRIFT';
    driftFlashUntil = now + 400;
  }
  $('driftBox').classList.toggle('hidden', now > driftFlashUntil);
  if (drift.total > 0) { $('driftTotal').classList.remove('hidden'); $('driftTotal').textContent = `Drift ${fmtPts(drift.total)}`; }
  // hints
  const hint = hints && race.state === 'racing' ? hints.update(c, now / 1000) : '';
  $('hintBig').classList.toggle('hidden', !hint);
  if (hint) { $('hintBig').textContent = hint; $('hintBig').className = hint === 'BRAKE' ? '' : 'tip'; }
  drawMinimap(pose, dots);
}

// ---------- start ----------
showScreen('menu');
music.play('menu');
if (save.account && onlineEnabled) {
  setAccount(save.account);
  // pick up progress made on other computers
  fetchAccount(save.account.code).then((r) => { if (r) { joinAccount(save.account.code, r); if (mode === 'menu') refreshMenu(); } }).catch(() => {});
}
const direct = Number(params.get('track'));
if (direct && TRACKS[direct - 1] && unlocked(TRACKS[direct - 1])) startRace(TRACKS[direct - 1], { kind: params.get('mode') === 'race' ? 'race' : 'trial' });
else if (params.has('daily')) { const d = todaysDaily(); if (d) startRace(d, { kind: 'daily' }); }
else if (BOT) startRace(nextTrack(), { watch: true });
// start music/audio on the first interaction
addEventListener('pointerdown', () => sound.init(), { once: true });
requestAnimationFrame(frame);

// for tests
window.__redline = {
  scene, camera, save, settings, TRACKS,
  get race() { return race; }, get mode() { return mode; }, get recordInfo() { return recordInfo; }, get recordGhost() { return recordGhost; },
  get drift() { return drift; }, get sess() { return sess; }, get rp() { return rp; }, get cur() { return cur; },
  startRace, startCup, todaysDaily, award, inputRead: () => input.read(),
  /** Run the physics ahead by `sec` seconds (the autopilot drives if it's on). */
  fastForward(sec, auto = true) {
    const driver = bot || (auto ? new Bot(cur.track, 0.9, carDef.spec) : null);
    for (let k = 0; k < sec / DT && race && (mode === 'race' || mode === 'finished'); k++) {
      const c = race.car;
      prev = null; prevRivals = [];
      race.step(mode === 'finished' ? { throttle: 0, brake: 0.3, steer: 0 } : driver ? driver.drive(c) : { throttle: 0, brake: 0, steer: 0 });
      if (race.state === 'racing') { recorder.add(c); drift.step(c, DT, c.hit > 2); driftEvents(); }
      handleEvents();
    }
  },
};
