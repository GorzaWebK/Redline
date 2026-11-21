// The track editor: a top-down map where you place the points a circuit runs
// through. Tap/click on the road line to add a point there, drag points to move
// them, double-click (or press and hold) a point to remove it. Drag empty space
// to pan, scroll/pinch to zoom. The smoothed road is previewed as you go, in
// red with the reason if it can't be built.

import { buildCustom, customTrack, MAX_POINTS } from './community.js';

export class Editor {
  constructor(canvas, onChange) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.onChange = onChange;
    this.def = null;
    this.view = { x: 0, z: 0, scale: 1 }; // metres at the centre, pixels per metre
    this.drag = null;
    this.result = null;
    this.pointers = new Map();
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) { this.drag = { pinch: this.pinchState() }; return; }
      const k = this.hitPoint(p);
      if (k >= 0) {
        this.drag = { point: k, start: p, moved: false };
        clearTimeout(this.holdTimer);
        this.holdTimer = setTimeout(() => { if (this.drag && this.drag.point === k && !this.drag.moved) { this.removePoint(k); this.drag = null; } }, 650);
        return;
      }
      const seg = this.hitSegment(p);
      if (seg >= 0 && this.def.pts.length < MAX_POINTS) {
        const w = this.toWorld(p);
        this.def.pts.splice(seg + 1, 0, [w.x, w.z]);
        this.drag = { point: seg + 1, start: p, moved: true };
        this.changed(false);
        return;
      }
      this.drag = { pan: true, start: p, view: { ...this.view } };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const p = pos(e);
      this.pointers.set(e.pointerId, p);
      const d = this.drag;
      if (!d) return;
      if (d.pinch && this.pointers.size === 2) {
        const now = this.pinchState();
        this.view.scale = Math.max(0.15, Math.min(4, d.pinch.scale * (now.dist / d.pinch.dist)));
        this.draw();
        return;
      }
      if (d.point !== undefined) {
        if (Math.hypot(p.x - d.start.x, p.y - d.start.y) > 4) d.moved = true;
        if (!d.moved) return;
        const w = this.toWorld(p);
        this.def.pts[d.point] = [w.x, w.z];
        this.changed(false);
      } else if (d.pan) {
        this.view.x = d.view.x - (p.x - d.start.x) / this.view.scale;
        this.view.z = d.view.z - (p.y - d.start.y) / this.view.scale;
        this.draw();
      }
    });
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      clearTimeout(this.holdTimer);
      if (this.drag && this.drag.point !== undefined && this.drag.moved) this.changed(true);
      if (this.pointers.size === 0) this.drag = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('dblclick', (e) => { const k = this.hitPoint(pos(e)); if (k >= 0) this.removePoint(k); });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.view.scale = Math.max(0.15, Math.min(4, this.view.scale * Math.exp(-e.deltaY * 0.0012)));
      this.draw();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), scale: this.view.scale };
  }

  /** Start editing a circuit definition (its points are edited in place). */
  open(def) {
    this.def = def;
    this.resize();
    this.fit();
    this.rebuild();
  }

  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    this.cv.width = Math.max(1, Math.round(r.width * dpr));
    this.cv.height = Math.max(1, Math.round(r.height * dpr));
    this.dpr = dpr;
    this.w = r.width; this.h = r.height;
    if (this.def) this.draw();
  }

  /** Zoom to show the whole circuit. */
  fit() {
    const xs = this.def.pts.map((p) => p[0]), zs = this.def.pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    this.view.x = (minX + maxX) / 2; this.view.z = (minZ + maxZ) / 2;
    this.view.scale = Math.min(this.w / (maxX - minX + 160), this.h / (maxZ - minZ + 160));
  }

  toWorld(p) { return { x: this.view.x + (p.x - this.w / 2) / this.view.scale, z: this.view.z + (p.y - this.h / 2) / this.view.scale }; }
  toScreen(x, z) { return { x: this.w / 2 + (x - this.view.x) * this.view.scale, y: this.h / 2 + (z - this.view.z) * this.view.scale }; }

  hitPoint(p) {
    const r = 16;
    let best = -1, bd = r * r;
    this.def.pts.forEach(([x, z], k) => { const s = this.toScreen(x, z), d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2; if (d < bd) { bd = d; best = k; } });
    return best;
  }

  /** The control-polygon segment near a screen point (index of its first point), or -1. */
  hitSegment(p) {
    const pts = this.def.pts, n = pts.length;
    let best = -1, bd = 22 * 22;
    for (let k = 0; k < n; k++) {
      const a = this.toScreen(...pts[k]), b = this.toScreen(...pts[(k + 1) % n]);
      const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2));
      const d = (a.x + vx * t - p.x) ** 2 + (a.y + vy * t - p.y) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  removePoint(k) {
    if (this.def.pts.length <= 4) return;
    this.def.pts.splice(k, 1);
    this.changed(true);
  }

  /** Points moved: preview now (cheaply while dragging), rebuild the road when done. */
  changed(done) {
    this.def.gold = 0; // a changed layout needs checking again
    if (done) this.rebuild(); else { clearTimeout(this.rbTimer); this.rbTimer = setTimeout(() => this.rebuild(), 120); this.draw(); }
    this.onChange?.(done);
  }

  rebuild() {
    this.result = buildCustom(customTrack(this.def));
    this.draw();
    this.onChange?.(true);
  }

  draw() {
    const g = this.ctx, d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = '#16301e';
    g.fillRect(0, 0, this.w, this.h);
    // grid every 100 m
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
    const step = 100, tl = this.toWorld({ x: 0, y: 0 }), br = this.toWorld({ x: this.w, y: this.h });
    for (let x = Math.floor(tl.x / step) * step; x < br.x; x += step) { const s = this.toScreen(x, 0); g.beginPath(); g.moveTo(s.x, 0); g.lineTo(s.x, this.h); g.stroke(); }
    for (let z = Math.floor(tl.z / step) * step; z < br.z; z += step) { const s = this.toScreen(0, z); g.beginPath(); g.moveTo(0, s.y); g.lineTo(this.w, s.y); g.stroke(); }
    const t = this.result && this.result.track;
    if (t) {
      // the road, its kerbs and the start line
      const path = () => { g.beginPath(); for (let i = 0; i <= t.N; i++) { const s = this.toScreen(t.x[i % t.N], t.z[i % t.N]); i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); } };
      g.lineJoin = 'round';
      path(); g.strokeStyle = '#d9d9d9'; g.lineWidth = Math.max(3, (t.halfW * 2 + 1) * this.view.scale); g.stroke();
      path(); g.strokeStyle = '#3a3d44'; g.lineWidth = Math.max(2, t.halfW * 2 * this.view.scale); g.stroke();
      const s0 = this.toScreen(t.x[0], t.z[0]), nx = -t.tz[0], nz = t.tx[0];
      g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(s0.x - nx * t.halfW * this.view.scale, s0.y - nz * t.halfW * this.view.scale); g.lineTo(s0.x + nx * t.halfW * this.view.scale, s0.y + nz * t.halfW * this.view.scale); g.stroke();
      // direction arrows
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 20; i < t.N; i += 60) {
        const s = this.toScreen(t.x[i], t.z[i]), h = Math.atan2(t.tz[i], t.tx[i]);
        g.save(); g.translate(s.x, s.y); g.rotate(h);
        g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -4); g.lineTo(-4, 4); g.closePath(); g.fill();
        g.restore();
      }
    }
    // the points you placed, joined in order
    const pts = this.def.pts;
    g.setLineDash([5, 5]);
    g.strokeStyle = t ? 'rgba(255,210,90,0.5)' : '#ff5a4e'; g.lineWidth = 1.5;
    g.beginPath(); pts.forEach(([x, z], k) => { const s = this.toScreen(x, z); k ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); }); g.closePath(); g.stroke();
    g.setLineDash([]);
    pts.forEach(([x, z], k) => {
      const s = this.toScreen(x, z);
      g.fillStyle = k === 0 ? '#3ddc84' : '#ffd25a';
      g.beginPath(); g.arc(s.x, s.y, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.font = '700 10px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(k + 1), s.x, s.y + 0.5);
    });
    // scale bar
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '12px system-ui'; g.textAlign = 'left';
    g.fillRect(12, this.h - 18, 100 * this.view.scale, 3); g.fillText('100 m', 12, this.h - 26);
  }
}
