// Tyre smoke, skid marks and sparks from wall hits.
import * as THREE from 'three';

const MAX_SMOKE = 260;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // smoke: points with their own size and fade
    this.smoke = [];
    const g = new THREE.BufferGeometry();
    this.sPos = new Float32Array(MAX_SMOKE * 3);
    this.sSize = new Float32Array(MAX_SMOKE);
    this.sAlpha = new Float32Array(MAX_SMOKE);
    g.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.sSize, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.sAlpha, 1));
    this.smokeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { color: { value: new THREE.Color(0xdedede) }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; varying float vA; uniform float scale;
        void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard; gl_FragColor = vec4(color, vA * (1.0 - r * 4.0)); }`,
    });
    this.smokePts = new THREE.Points(g, this.smokeMat);
    this.smokePts.layers.set(1); // the main camera sees layer 1; the rear-view mirror doesn't
    this.amount = 1; // smoke density (phones use less)
    this.smokePts.frustumCulled = false;
    scene.add(this.smokePts);

    // skid marks: a ring buffer of quads
    this.maxSkid = 1600;
    this.kPos = new Float32Array(this.maxSkid * 4 * 3);
    this.kAlpha = new Float32Array(this.maxSkid * 4);
    const idx = [];
    for (let i = 0; i < this.maxSkid; i++) { const o = i * 4; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    const kg = new THREE.BufferGeometry();
    kg.setAttribute('position', new THREE.BufferAttribute(this.kPos, 3));
    kg.setAttribute('alpha', new THREE.BufferAttribute(this.kAlpha, 1));
    kg.setIndex(idx);
    this.skidGeo = kg;
    this.skidMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide,
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.06,0.06,0.07, vA); }',
    });
    this.skids = new THREE.Mesh(kg, this.skidMat);
    this.skids.frustumCulled = false;
    this.skids.renderOrder = 1;
    scene.add(this.skids);
    this.kNext = 0;
    this.lastMark = [null, null];

    // sparks
    this.sparks = [];
    this.sparkGeo = new THREE.BufferGeometry();
    this.spPos = new Float32Array(120 * 3);
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.spPos, 3));
    this.sparkPts = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({ color: 0xffc860, size: 0.18, transparent: true }));
    this.sparkPts.frustumCulled = false;
    scene.add(this.sparkPts);
  }

  /** Rain: streaks falling around the camera (on = wet track). */
  setRain(on, night = false) {
    if (!this.rain) {
      const n = 1400, pos = new Float32Array(n * 6);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d4e4, transparent: true, opacity: 0.35 }));
      this.rain.frustumCulled = false;
      this.rainDrops = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 60, y: Math.random() * 30, z: (Math.random() - 0.5) * 60 }));
      this.scene.add(this.rain);
    }
    this.rain.visible = on;
    this.rain.material.color.setHex(night ? 0x8a96b0 : 0xc8d4e4);
  }

  /** Move the rain with the camera (call each frame while it's raining). */
  updateRain(dt, cam) {
    if (!this.rain || !this.rain.visible) return;
    const pos = this.rain.geometry.attributes.position.array;
    let k = 0;
    for (const d of this.rainDrops) {
      d.y -= 22 * dt;
      if (d.y < -2) { d.y = 28 + Math.random() * 4; d.x = (Math.random() - 0.5) * 60; d.z = (Math.random() - 0.5) * 60; }
      const x = cam.x + d.x, y = cam.y + d.y - 6, z = cam.z + d.z;
      pos[k++] = x; pos[k++] = y; pos[k++] = z;
      pos[k++] = x; pos[k++] = y + 0.9; pos[k++] = z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  setNight(night) { this.smokeMat.uniforms.color.value.setHex(night ? 0x8a8f9c : 0xdedede); }

  puff(x, y, z, vx, vz, strength) {
    if (this.smoke.length >= MAX_SMOKE) this.smoke.shift();
    this.smoke.push({ x, y, z, vx: vx * 0.2 + (Math.random() - 0.5) * 0.6, vy: 0.3 + Math.random() * 0.4, vz: vz * 0.2 + (Math.random() - 0.5) * 0.6, age: 0, life: 0.6 + Math.random() * 0.45, s: 0.45 + strength * 0.35 });
  }

  /** A skid mark segment for wheel w (0 = rear left, 1 = rear right), or a break in it. */
  mark(w, x, y, z, hx, hz, strength) {
    const last = this.lastMark[w];
    if (strength <= 0) { this.lastMark[w] = null; return; }
    const cur = { x, y: y + 0.07, z, hx, hz, a: Math.min(0.55, strength * 0.45) };
    if (last && Math.hypot(x - last.x, z - last.z) > 0.25) {
      if (Math.hypot(x - last.x, z - last.z) < 4) {
        const k = this.kNext; this.kNext = (k + 1) % this.maxSkid;
        const w2 = 0.14;
        const put = (o, p, sgn) => {
          // sideways from the car's heading
          this.kPos[o] = p.x - p.hz * w2 * sgn; this.kPos[o + 1] = p.y; this.kPos[o + 2] = p.z + p.hx * w2 * sgn;
        };
        put(k * 12, last, -1); put(k * 12 + 3, last, 1); put(k * 12 + 6, cur, -1); put(k * 12 + 9, cur, 1);
        this.kAlpha[k * 4] = this.kAlpha[k * 4 + 1] = last.a;
        this.kAlpha[k * 4 + 2] = this.kAlpha[k * 4 + 3] = cur.a;
        this.skidGeo.attributes.position.needsUpdate = true;
        this.skidGeo.attributes.alpha.needsUpdate = true;
      }
      this.lastMark[w] = cur;
    } else if (!last) this.lastMark[w] = cur;
  }

  spark(x, y, z, n = 14) {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= 120) this.sparks.shift();
      this.sparks.push({ x, y, z, vx: (Math.random() - 0.5) * 9, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 9, life: 0.4 + Math.random() * 0.3 });
    }
  }

  clear() {
    this.smoke.length = 0; this.sparks.length = 0;
    this.kAlpha.fill(0); this.skidGeo.attributes.alpha.needsUpdate = true;
    this.lastMark = [null, null];
  }

  update(dt) {
    let n = 0;
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i];
      p.age += dt;
      if (p.age > p.life) { this.smoke.splice(i, 1); continue; }
    }
    for (const p of this.smoke) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 0.97; p.vz *= 0.97;
      const f = p.age / p.life;
      this.sPos[n * 3] = p.x; this.sPos[n * 3 + 1] = p.y; this.sPos[n * 3 + 2] = p.z;
      this.sSize[n] = p.s * (1 + f * 1.6);
      this.sAlpha[n] = 0.16 * this.amount * (1 - f) * (1 - f);
      n++;
    }
    for (let i = n; i < MAX_SMOKE; i++) this.sAlpha[i] = 0;
    const g = this.smokePts.geometry;
    g.attributes.position.needsUpdate = g.attributes.size.needsUpdate = g.attributes.alpha.needsUpdate = true;
    g.setDrawRange(0, Math.max(n, 1));

    let m = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) { const s = this.sparks[i]; s.life -= dt; if (s.life <= 0) this.sparks.splice(i, 1); }
    for (const s of this.sparks) {
      s.vy -= 15 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      this.spPos[m * 3] = s.x; this.spPos[m * 3 + 1] = s.y; this.spPos[m * 3 + 2] = s.z; m++;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.setDrawRange(0, m);
  }
}
