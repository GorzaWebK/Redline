// Textures drawn on canvases at start-up: no image files.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

function canvasTex(w, h, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

function speckle(g, w, h, n, colors, size, rnd) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rnd() * colors.length) | 0];
    const s = size * (0.5 + rnd());
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

/** Tarmac: u runs across the road (white edge lines at both sides), v along it. */
export function asphaltTexture(night) {
  const rnd = mulberry32(7);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = night ? '#3a3d44' : '#4a4d53';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, ['#3d4046', '#55585e', '#45484e', '#5e6167'], 2, rnd);
    // faint tyre-worn bands where cars drive
    g.fillStyle = 'rgba(20,20,24,0.10)';
    g.fillRect(w * 0.3, 0, w * 0.12, h);
    g.fillRect(w * 0.58, 0, w * 0.12, h);
    // edge lines
    g.fillStyle = '#ecece6';
    g.fillRect(w * 0.012, 0, w * 0.022, h);
    g.fillRect(w * 0.966, 0, w * 0.022, h);
  });
}

/** Red-and-white (or theme coloured) kerb stripes along v. */
export function kerbTexture(a, b) {
  return canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = hex(a); g.fillRect(0, 0, w, h / 2);
    g.fillStyle = hex(b); g.fillRect(0, h / 2, w, h / 2);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, w * 0.15, h);
  });
}

/** Grass, sand or snow, depending on the theme colours. */
export function groundTexture(c1, c2, kind) {
  const rnd = mulberry32(11);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex(c1); g.fillRect(0, 0, w, h);
    const col = new THREE.Color(c1), col2 = new THREE.Color(c2);
    const shades = [];
    for (let i = 0; i < 6; i++) {
      const m = col.clone().lerp(col2, i / 5).offsetHSL(0, 0, (rnd() - 0.5) * 0.06);
      shades.push('#' + m.getHexString());
    }
    speckle(g, w, h, kind === 'snow' ? 2500 : 7000, shades, kind === 'snow' ? 3 : 2, rnd);
  });
}

/** Barrier: u runs up the wall, v along it; blocks of two colours with seams. */
export function wallTexture(a, b) {
  return canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = hex(a); g.fillRect(0, 0, w, h / 2);
    g.fillStyle = hex(b); g.fillRect(0, h / 2, w, h / 2);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, w, 3); g.fillRect(0, h / 2, w, 3);
    g.fillRect(0, 0, 8, h);
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(w - 5, 0, 5, h);
  });
}

/** Soft round pool of light (night street lamps), drawn additively on the road. */
export function glowTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,214,150,0.7)');
    gr.addColorStop(0.5, 'rgba(255,190,120,0.25)');
    gr.addColorStop(1, 'rgba(255,180,100,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { repeat: false });
}

export function checkerTexture() {
  return canvasTex(128, 32, (g, w, h) => {
    const n = 16, m = 4, cw = w / n, ch = h / m;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
      g.fillRect(i * cw, j * ch, cw, ch);
    }
  }, { repeat: false });
}

/** Crowd in the grandstand: rows of coloured dots. */
export function crowdTexture() {
  const rnd = mulberry32(5);
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#3a3f4a'; g.fillRect(0, 0, w, h);
    const cols = ['#e44', '#fd4', '#4af', '#fff', '#4d6', '#f8a', '#222', '#f93'];
    for (let row = 0; row < 8; row++) for (let i = 0; i < 40; i++) {
      if (rnd() < 0.15) continue;
      g.fillStyle = cols[(rnd() * cols.length) | 0];
      g.beginPath();
      g.arc(i * 6.4 + 3 + rnd() * 1.5, row * 16 + 6, 2.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d9a982';
      g.fillRect(i * 6.4 + 1.8, row * 16 + 1, 2.6, 2.6);
    }
  });
}

/** Lit office windows for the night city's buildings. */
export function windowTexture() {
  const rnd = mulberry32(9);
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#0c0f18'; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 12) for (let x = 4; x < w; x += 10) {
      const r = rnd();
      g.fillStyle = r < 0.45 ? '#ffd890' : r < 0.55 ? '#9fd4ff' : '#141a28';
      g.fillRect(x, y, 6, 7);
    }
  });
}

/** Text banner for the start gantry. */
export function bannerTexture(text) {
  return canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#14161c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8322a'; g.fillRect(0, h - 8, w, 8);
    g.font = '800 40px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f4f4f4';
    g.fillText(text, w / 2, h / 2 - 2);
  }, { repeat: false });
}
