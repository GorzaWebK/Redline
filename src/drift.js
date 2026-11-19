// Drift scoring. While the car is properly sideways (over ~10 degrees) on
// tarmac, points pour in: more angle and more speed = more points. Keep a
// drift going and the multiplier climbs (x2 after 2 s, up to x5). Link drifts
// together with less than 1.2 s of grip between them to keep the chain alive.
// Running wide onto the grass banks the chain; hitting a wall loses it.

const MIN_ANGLE = 0.17; // radians
const LINK = 1.2; // seconds of grip allowed between linked drifts

export class DriftScore {
  constructor() {
    this.total = 0; // banked this race
    this.best = 0; // biggest single chain this race
    this.chain = 0; // the chain being built
    this.mult = 1;
    this.chainTime = 0; // seconds spent sideways in this chain
    this.gap = 0;
    this.active = false;
    this.events = [];
  }

  /** Call every physics step. hit = hit a wall this step. */
  step(c, dt, hit = false) {
    this.events.length = 0;
    const speed = Math.hypot(c.u, c.v);
    const ang = c.drift || 0;
    if (hit && this.active) { this.lose(); return; }
    const sideways = ang > MIN_ANGLE && speed > 9 && c.u > 0 && !c.onGrass;
    if (sideways) {
      this.active = true;
      this.gap = 0;
      this.chainTime += dt;
      this.mult = Math.min(5, 1 + Math.floor(this.chainTime / 2));
      const deg = (ang * 180) / Math.PI;
      this.chain += Math.min(45, deg - 8) * speed * dt * 0.6 * this.mult;
    } else if (this.active) {
      this.gap += dt;
      if (this.gap > LINK || c.onGrass) this.bank();
    }
  }

  bank() {
    const pts = Math.round(this.chain);
    if (pts > 0) {
      this.total += pts;
      this.best = Math.max(this.best, pts);
      this.events.push({ type: 'banked', pts });
    }
    this.reset();
  }

  lose() {
    const pts = Math.round(this.chain);
    if (pts > 0) this.events.push({ type: 'lost', pts });
    this.reset();
  }

  reset() { this.chain = 0; this.mult = 1; this.chainTime = 0; this.gap = 0; this.active = false; }

  /** Bank whatever is running (end of the race). */
  finish() { if (this.active) this.bank(); }
}
