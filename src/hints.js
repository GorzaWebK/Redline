// Driving hints for the first circuits (Settings → Driving hints): a BRAKE
// prompt when you're coming into a corner too fast, and a one-off tip to try a
// drift on the first tight corner.
import { SPACING } from './track.js';

export class Hints {
  constructor(track, profile) {
    this.track = track;
    this.profile = profile;
    this.driftTipShown = false;
    this.text = '';
    this.until = 0;
  }

  /** Call each frame; returns the hint to show (or ''). now = seconds. */
  update(c, now) {
    const t = this.track, N = t.N, i = c.loc.i, speed = Math.hypot(c.u, c.v);
    // coming in too fast: the speed you'll need within the next ~45 m is a lot lower than now
    let need = Infinity;
    for (let k = 4; k < 45 / SPACING; k += 2) need = Math.min(need, this.profile[(i + k) % N]);
    if (speed > need + 7 && speed > 12) { this.text = 'BRAKE'; this.until = now + 0.4; }
    else if (!this.driftTipShown && speed > 14) {
      // a tight corner a little way ahead: suggest a drift once
      for (let k = 10; k < 60 / SPACING; k += 2) {
        if (Math.abs(t.curv[(i + k) % N]) > 1 / 32) { this.driftTipShown = true; this.text = 'Tight corner ahead: tap SPACE to drift through it'; this.until = now + 3.5; break; }
      }
    }
    return now < this.until ? this.text : '';
  }
}
