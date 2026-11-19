// Builds the 3D world for a track: road, kerbs, grass run-off, walls, start
// gantry, grandstand, terrain, scenery, sky and light. Everything is generated
// from the track data and the theme, so no models or images are loaded.

import * as THREE from 'three';
import { THEMES } from './themes.js';
import * as TX from './textures.js';
import { mulberry32 } from './rng.js';
import { speedProfile } from './bot.js';
import { CAR } from './car.js';

// ---- small value-noise helper for hills ----
function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f, seed + i * 17); f *= 2.03; amp *= 0.5; }
  return s / 0.9375;
}
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildWorld(track, themeId, { quality = 'high', racingLine = false } = {}) {
  const th = THEMES[themeId] || THEMES.meadow;
  const t = track, N = t.N, hw = t.halfW, wall = t.wall;
  const group = new THREE.Group();
  const rnd = mulberry32(t.seed ^ 0x5eed);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  // a point beside the centre line: sample i, sideways offset lat, height dy
  const P = (i, lat, dy) => [t.x[i] - t.tz[i] * lat, t.y[i] + dy, t.z[i] + t.tx[i] * lat];

  /** A ribbon along the track through sample list `list` (may run past N to wrap). */
  function strip(list, fn, vScale, mat, { colors = null } = {}) {
    const pos = [], uv = [], idx = [], col = [];
    list.forEach((i, k) => {
      const ii = i % N, s = t.s[ii] + Math.floor(i / N) * t.L;
      const [a, b] = fn(ii);
      pos.push(...a, ...b);
      uv.push(0, s / vScale, 1, s / vScale);
      if (colors) { const c = colors(ii); col.push(...c, ...c); }
      if (k > 0) { const o = (k - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    });
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    group.add(m);
    return m;
  }
  const loop = Array.from({ length: N + 1 }, (_, i) => i);

  // ---- road, run-off, kerbs, walls ----
  const roadMat = keep(new THREE.MeshStandardMaterial({ map: keep(TX.asphaltTexture(th.night)), roughness: 0.92, metalness: 0 }));
  const road = strip(loop, (i) => [P(i, -hw, 0.03), P(i, hw, 0.03)], 14, roadMat);
  road.receiveShadow = true;

  const vergeTex = keep(TX.groundTexture(th.ground[0], th.ground[1], themeId === 'alpine' ? 'snow' : 'grass'));
  const vergeMat = keep(new THREE.MeshLambertMaterial({ map: vergeTex }));
  strip(loop, (i) => [P(i, -wall - 0.6, -0.02), P(i, -hw, -0.02)], 6, vergeMat).receiveShadow = true;
  strip(loop, (i) => [P(i, hw, -0.02), P(i, wall + 0.6, -0.02)], 6, vergeMat).receiveShadow = true;

  // kerbs on the corners
  const kerbMat = keep(new THREE.MeshLambertMaterial({ map: keep(TX.kerbTexture(th.kerb[0], th.kerb[1])) }));
  const corner = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (Math.abs(t.curv[i]) > 1 / 75) for (let k = -6; k <= 6; k++) corner[(i + k + N) % N] = 1;
  let startAt = 0;
  while (startAt < N && corner[startAt]) startAt++; // begin the scan on a straight
  for (let k = 0; k < N; k++) {
    const i = (startAt + k) % N;
    if (!corner[i] || (k > 0 && corner[(i - 1 + N) % N])) continue;
    const list = [];
    let j = startAt + k;
    while (corner[j % N] && list.length < N) list.push(j++);
    list.push(j);
    if (list.length < 3) continue;
    strip(list, (ii) => [P(ii, -hw - 1.0, 0.05), P(ii, -hw + 0.25, 0.05)], 4, kerbMat);
    strip(list, (ii) => [P(ii, hw - 0.25, 0.05), P(ii, hw + 1.0, 0.05)], 4, kerbMat);
  }

  const wallMat = keep(new THREE.MeshLambertMaterial({ map: keep(TX.wallTexture(th.wall[0], th.wall[1])), side: THREE.DoubleSide }));
  for (const sg of [-1, 1]) strip(loop, (i) => [P(i, sg * wall, -0.7), P(i, sg * wall, 1.0)], 6, wallMat).castShadow = true;

  // racing line guide: green = flat out, yellow = turning, red = braking
  if (racingLine) {
    const prof = speedProfile(t);
    const lineMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const colorAt = (i) => {
      const braking = prof[(i + 6) % N] < prof[i] - 0.6;
      if (braking) return [0.95, 0.15, 0.1];
      const k = Math.abs(t.line.curv[i]);
      const cornerSpeed = Math.sqrt((CAR.mu * 0.9 * 9.81) / Math.max(k, 1e-4));
      return cornerSpeed < prof[i] + 3 ? [1, 0.82, 0.1] : [0.2, 0.9, 0.35];
    };
    const off = t.line.off;
    strip(loop, (i) => [P(i, off[i] - 0.25, 0.06), P(i, off[i] + 0.25, 0.06)], 10, lineMat, { colors: colorAt }).renderOrder = 1;
  }

  // start/finish line
  {
    const f = [t.tx[0], t.tz[0]];
    const a = P(0, -hw, 0.055), b = P(0, hw, 0.055);
    const g = keep(new THREE.BufferGeometry());
    const pos = [a[0], a[1], a[2], b[0], b[1], b[2], a[0] + f[0] * 1.6, a[1], a[2] + f[1] * 1.6, b[0] + f[0] * 1.6, b[1], b[2] + f[1] * 1.6];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    g.setIndex([0, 1, 2, 1, 3, 2]);
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ map: keep(TX.checkerTexture()) }))));
  }

  // ---- start gantry with the countdown lights ----
  const at = (i) => { // a group sitting on sample i: local x forward, z right
    const o = new THREE.Group();
    o.position.set(t.x[i], t.y[i], t.z[i]);
    o.rotation.y = -Math.atan2(t.tz[i], t.tx[i]);
    group.add(o);
    return o;
  };
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.6, metalness: 0.4 }));
  const gantry = at(0);
  const span = hw + 1.4;
  for (const sg of [-1, 1]) {
    const p = new THREE.Mesh(keep(new THREE.BoxGeometry(0.6, 7, 0.6)), metal);
    p.position.set(0, 3.5, sg * span); p.castShadow = true; gantry.add(p);
  }
  const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(0.8, 1.1, span * 2 + 0.6)), metal);
  beam.position.set(0, 6.6, 0); beam.castShadow = true; gantry.add(beam);
  const banner = new THREE.Mesh(keep(new THREE.PlaneGeometry(span * 2, span * 2 / 8)), keep(new THREE.MeshBasicMaterial({ map: keep(TX.bannerTexture('REDLINE')) })));
  banner.rotation.y = -Math.PI / 2; banner.position.set(-0.42, 7.65, 0);
  banner.scale.set(1, 1.2, 1);
  gantry.add(banner);
  const lights = [];
  for (let k = 0; k < 5; k++) {
    const m = new THREE.Mesh(keep(new THREE.SphereGeometry(0.32, 12, 8)), new THREE.MeshBasicMaterial({ color: 0x220808 }));
    m.position.set(-0.45, 6.6, (k - 2) * 1.1);
    gantry.add(m);
    lights.push(m);
  }
  /** Countdown lights: n = how many red lights are on (0..5), or 'go' for green, or 'off'. */
  function setStartLights(n) {
    lights.forEach((m, k) => {
      m.material.color.setHex(n === 'go' ? 0x30ff60 : typeof n === 'number' && k < n ? 0xff2a1a : 0x220808);
    });
  }

  // ---- grandstand beside the start ----
  {
    const side = 1;
    const back = Math.round(30 / 2); // starts 30 m before the line
    const stand = at((N - back) % N);
    const len = 64, depth = 11;
    const crowd = keep(TX.crowdTexture());
    crowd.repeat.set(5, 1);
    const slope = new THREE.Mesh(keep(new THREE.PlaneGeometry(len, Math.hypot(depth, 7))), keep(new THREE.MeshLambertMaterial({ map: crowd })));
    slope.rotation.x = -Math.PI / 2 + Math.atan2(7, depth);
    // tilt the plane so it rises away from the track
    slope.rotation.order = 'YXZ';
    slope.rotation.set(-Math.PI / 2 + Math.atan2(7, depth), side > 0 ? Math.PI : 0, 0);
    slope.position.set(len / 2, 1 + 3.5, side * (wall + 3 + depth / 2));
    stand.add(slope);
    const backWall = new THREE.Mesh(keep(new THREE.BoxGeometry(len, 9, 0.5)), keep(new THREE.MeshLambertMaterial({ color: 0x59606c })));
    backWall.position.set(len / 2, 4.5, side * (wall + 3 + depth + 0.3));
    stand.add(backWall);
    const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(len + 2, 0.4, depth + 3)), keep(new THREE.MeshLambertMaterial({ color: 0xd8dde4 })));
    roof.position.set(len / 2, 11, side * (wall + 2 + depth / 2));
    roof.castShadow = true;
    stand.add(roof);
    for (let k = 0; k <= 4; k++) {
      const post = new THREE.Mesh(keep(new THREE.BoxGeometry(0.4, 11, 0.4)), metal);
      post.position.set((k / 4) * len, 5.5, side * (wall + 2));
      stand.add(post);
    }
  }

  // ---- terrain ----
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, t.x[i]); maxX = Math.max(maxX, t.x[i]);
    minZ = Math.min(minZ, t.z[i]); maxZ = Math.max(maxZ, t.z[i]);
  }
  const pad = 420, cell = quality === 'low' ? 14 : quality === 'medium' ? 10 : 8;
  const x0 = minX - pad, z0 = minZ - pad;
  const nx = Math.ceil((maxX - minX + pad * 2) / cell), nz = Math.ceil((maxZ - minZ + pad * 2) / cell);
  const H = new Float32Array((nx + 1) * (nz + 1)), D = new Float32Array((nx + 1) * (nz + 1));
  const seed = t.seed % 9973;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell;
    let bi = 0, bd = Infinity;
    for (let k = 0; k < N; k += 3) {
      const dx = x - t.x[k], dz = z - t.z[k], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bi = k; }
    }
    for (let k = -3; k <= 3; k++) {
      const kk = (bi + k + N) % N, dx = x - t.x[kk], dz = z - t.z[kk], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bi = kk; }
    }
    const d = Math.sqrt(bd);
    let h = t.y[bi] - 0.45;
    const k = smoothstep(wall + 2, wall + 110, d);
    if (k > 0) {
      let hill = fbm(x / 190, z / 190, seed) * 34 * th.hill + fbm(x / 60, z / 60, seed + 5, 3) * 5;
      if (themeId === 'canyon') hill += smoothstep(0.52, 0.6, fbm(x / 260, z / 260, seed + 9)) * 38; // mesas
      if (themeId === 'alpine') hill += Math.pow(fbm(x / 320, z / 320, seed + 3), 2) * 90;
      h += k * (hill - 6 * th.hill);
      h = Math.max(h, t.y[bi] - 3);
    }
    H[j * (nx + 1) + i] = h;
    D[j * (nx + 1) + i] = d;
  }
  const grid = (A, x, z) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell;
    const i = Math.max(0, Math.min(nx - 1, Math.floor(fx))), j = Math.max(0, Math.min(nz - 1, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
    const r = nx + 1;
    return (A[j * r + i] * (1 - u) + A[j * r + i + 1] * u) * (1 - v) + (A[(j + 1) * r + i] * (1 - u) + A[(j + 1) * r + i + 1] * u) * v;
  };
  const heightAt = (x, z) => grid(H, x, z);
  const distAt = (x, z) => grid(D, x, z);
  {
    const g = keep(new THREE.PlaneGeometry(nx * cell, nz * cell, nx, nz));
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, uv = g.attributes.uv, col = [];
    const cx = x0 + (nx * cell) / 2, cz = z0 + (nz * cell) / 2;
    const rock = new THREE.Color(themeId === 'alpine' ? 0x8a8f9a : themeId === 'canyon' ? 0xa04a30 : 0x6f7a5a);
    const base = new THREE.Color(1, 1, 1);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k) + cx, z = pos.getZ(k) + cz;
      // PlaneGeometry rows run from -z to +z after the rotation
      const i = Math.round((x - x0) / cell), j = Math.round((z - z0) / cell);
      const h = H[j * (nx + 1) + i];
      pos.setXYZ(k, x, h, z);
      uv.setXY(k, x / 14, z / 14);
      // steep or high ground shows rock
      const hl = (i > 0 && i < nx) ? Math.abs(H[j * (nx + 1) + i + 1] - H[j * (nx + 1) + i - 1]) / (2 * cell) : 0;
      const n = 0.88 + vnoise(x / 30, z / 30, seed + 1) * 0.2;
      const c = base.clone().multiplyScalar(n).lerp(rock, smoothstep(0.35, 0.8, hl));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ map: vergeTex, vertexColors: true })));
    ground.receiveShadow = true;
    group.add(ground);
  }

  // ---- distant mountains ----
  {
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const R = Math.max(maxX - minX, maxZ - minZ) / 2 + pad + 500;
    const seg = 160, pos = [], idx = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const hgt = (60 + fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10, seed + 21) * 260) * (themeId === 'alpine' ? 1.8 : themeId === 'night' ? 0.6 : 1);
      pos.push(cx + Math.cos(a) * R, -40, cz + Math.sin(a) * R, cx + Math.cos(a) * R * 1.08, hgt, cz + Math.sin(a) * R * 1.08);
      if (k < seg) { const o = k * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const c = new THREE.Color(th.mountains).lerp(new THREE.Color(th.skyBottom), 0.35);
    group.add(new THREE.Mesh(g, keep(new THREE.MeshBasicMaterial({ color: c, fog: false, side: THREE.DoubleSide }))));
  }

  // ---- scenery ----
  const propCount = quality === 'low' ? 220 : quality === 'medium' ? 450 : 750;
  const spots = [];
  for (let tries = 0; spots.length < propCount && tries < propCount * 12; tries++) {
    const x = x0 + rnd() * nx * cell, z = z0 + rnd() * nz * cell;
    const d = distAt(x, z);
    const size = th.props === 'city' ? 12 + rnd() * 22 : 0; // building width
    const min = th.props === 'city' ? wall + 16 + size * 0.95 : wall + 7;
    if (d < min) continue;
    // denser near the track, where you can see it
    if (rnd() > 1.15 - d / 500) continue;
    spots.push([x, heightAt(x, z), z, rnd(), size]);
  }
  const dummy = new THREE.Object3D();
  function instanced(geo, mat, list, place) {
    const m = new THREE.InstancedMesh(keep(geo), mat, list.length);
    list.forEach((s, k) => {
      dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      place(dummy, s, k); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix);
    });
    m.castShadow = true;
    group.add(m);
    return m;
  }
  const lam = (c, extra) => keep(new THREE.MeshLambertMaterial({ color: c, ...extra }));
  if (th.props === 'trees') {
    const trunk = new THREE.CylinderGeometry(0.22, 0.32, 2.6, 6).translate(0, 1.3, 0);
    const leaf = new THREE.IcosahedronGeometry(2.3, 0).translate(0, 3.8, 0);
    const scale = (s) => 0.8 + s[3] * 0.9;
    instanced(trunk, lam(0x6b4a2e), spots, (o, s) => { o.position.set(s[0], s[1], s[2]); o.scale.setScalar(scale(s)); o.rotation.set(0, s[3] * 6, 0); });
    const leaves = instanced(leaf, lam(0xffffff), spots, (o, s) => { o.position.set(s[0], s[1], s[2]); o.scale.set(scale(s), scale(s) * (0.9 + s[3] * 0.5), scale(s)); o.rotation.set(0, s[3] * 6, 0); });
    const cA = new THREE.Color(0x3f8a34), cB = new THREE.Color(0x6aa83a);
    spots.forEach((s, k) => leaves.setColorAt(k, cA.clone().lerp(cB, (s[3] * 7) % 1)));
  } else if (th.props === 'pines') {
    const trunk = new THREE.CylinderGeometry(0.2, 0.28, 2, 6).translate(0, 1, 0);
    const cone = new THREE.ConeGeometry(2.1, 5.5, 7).translate(0, 4.4, 0);
    const snow = new THREE.ConeGeometry(1.1, 2.2, 7).translate(0, 6.6, 0);
    const sc = (s) => 0.8 + s[3] * 1.1;
    const place = (o, s) => { o.position.set(s[0], s[1], s[2]); o.scale.setScalar(sc(s)); o.rotation.set(0, s[3] * 6, 0); };
    instanced(trunk, lam(0x5a3e28), spots, place);
    instanced(cone, lam(0x2b5a40), spots, place);
    instanced(snow, lam(0xf4f8ff), spots, place);
  } else if (th.props === 'desert') {
    const cacti = spots.filter((s) => s[3] < 0.55), rocks = spots.filter((s) => s[3] >= 0.55);
    const body = new THREE.CylinderGeometry(0.35, 0.4, 4, 8).translate(0, 2, 0);
    const arm = new THREE.CylinderGeometry(0.22, 0.22, 0.9, 6).rotateZ(Math.PI / 2).translate(0.75, 2.3, 0);
    const armUp = new THREE.CylinderGeometry(0.22, 0.22, 1.3, 6).translate(1.15, 2.9, 0);
    const place = (o, s) => { o.position.set(s[0], s[1], s[2]); o.scale.setScalar(0.8 + s[3]); o.rotation.set(0, s[3] * 40, 0); };
    const green = lam(0x4f7f3a);
    instanced(body, green, cacti, place);
    instanced(arm, green, cacti, place);
    instanced(armUp, green, cacti, place);
    instanced(new THREE.DodecahedronGeometry(1.6, 0), lam(0xa8583a), rocks, (o, s) => {
      o.position.set(s[0], s[1] + 0.4, s[2]); o.scale.set(1 + s[3] * 2.5, 0.6 + s[3], 1 + s[3] * 1.8); o.rotation.set(s[3] * 3, s[3] * 9, 0);
    });
  } else if (th.props === 'city') {
    const wtex = keep(TX.windowTexture());
    const side = keep(new THREE.MeshLambertMaterial({ color: 0x1a2030, emissive: 0xffffff, emissiveMap: wtex, emissiveIntensity: 0.9, map: wtex }));
    const roof = keep(new THREE.MeshLambertMaterial({ color: 0x141826 }));
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    // windows on the walls, plain roofs (box faces: +x, -x, +y, -y, +z, -z)
    instanced(box, [side, side, roof, roof, side, side], spots, (o, s) => {
      const w = s[4], hgt = 14 + Math.pow(s[3], 2) * 90;
      o.position.set(s[0], s[1] - 1, s[2]); o.scale.set(w, hgt, w * (0.7 + ((s[3] * 13) % 0.6))); o.rotation.set(0, Math.round(s[3] * 4) * 0.4, 0);
    });
  }

  // street lamps (night only), with pools of light on the road
  if (th.night) {
    const lamps = [];
    for (let i = 0; i < N; i += 14) lamps.push([i, (i / 14) % 2 ? 1 : -1]);
    const pole = new THREE.CylinderGeometry(0.12, 0.16, 8, 6).translate(0, 4, 0);
    const head = new THREE.BoxGeometry(1.6, 0.25, 0.6).translate(0, 8, 0);
    const placeLamp = (o, [i, sg]) => {
      const p = P(i, sg * (wall + 1.2), 0);
      o.position.set(p[0], p[1], p[2]);
      o.rotation.set(0, -Math.atan2(t.tz[i], t.tx[i]) + (sg > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
    };
    instanced(pole, metal, lamps, placeLamp);
    const headM = instanced(head.translate(0.7, 0, 0), keep(new THREE.MeshBasicMaterial({ color: 0xffe2a8 })), lamps, placeLamp);
    headM.castShadow = false;
    const glow = keep(new THREE.MeshBasicMaterial({ map: keep(TX.glowTexture()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const disc = keep(new THREE.PlaneGeometry(22, 22).rotateX(-Math.PI / 2));
    const pools = new THREE.InstancedMesh(disc, glow, lamps.length);
    lamps.forEach(([i, sg], k) => {
      const p = P(i, sg * (hw - 1), 0.08);
      dummy.position.set(p[0], p[1], p[2]); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      pools.setMatrixAt(k, dummy.matrix);
    });
    pools.renderOrder = 2;
    group.add(pools);
  }

  // ---- sky ----
  const sunDir = new THREE.Vector3(...th.sunDir).normalize();
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(5000, 32, 16)), keep(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(th.skyTop) }, bottom: { value: new THREE.Color(th.skyBottom) },
      glow: { value: new THREE.Color(th.sunGlow) }, sun: { value: sunDir },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 glow; uniform vec3 sun; varying vec3 vDir;
      void main(){ float h = max(vDir.y, 0.0); vec3 c = mix(bottom, top, pow(h, 0.55));
        float s = max(dot(normalize(vDir), sun), 0.0);
        c += glow * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.35);
        gl_FragColor = vec4(c, 1.0); }`,
  })));
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  if (th.night) {
    const sp = [];
    const r2 = mulberry32(99);
    for (let k = 0; k < 1500; k++) {
      const a = r2() * Math.PI * 2, y = 0.08 + r2() * 0.92, r = Math.sqrt(1 - y * y);
      sp.push(Math.cos(a) * r * 4500, y * 4500, Math.sin(a) * r * 4500);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(g, keep(new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })));
    sky.add(stars);
  }

  // ---- light ----
  const hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiInt);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(th.sun, th.sunInt);
  const shadows = quality !== 'low';
  sun.castShadow = shadows;
  if (shadows) {
    const sz = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(sz, sz);
    const c = sun.shadow.camera;
    c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 400;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
  }
  group.add(sun, sun.target);

  /** Keep the sun's shadow box around the car. */
  function update(focus) {
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(sunDir, 200);
  }

  return {
    group, sky, theme: th, update, setStartLights, heightAt, distAt,
    fog: new THREE.Fog(th.fog, th.fogNear, th.fogFar),
    dispose() {
      for (const d of disposables) d.dispose?.();
      group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.material && o.material.isMeshBasicMaterial && lights.includes(o)) o.material.dispose(); });
    },
  };
}
