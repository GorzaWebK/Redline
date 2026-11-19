// The autopilot. It drives the racing line at the fastest speed the grip allows
// in each corner, braking in time for the next one. The tests use it to prove
// every track can be driven, and its lap times set the gold medal targets.
// Add ?bot=1 to the URL to watch it drive.

import { CAR, WET_GRIP } from './car.js';
import { SPACING } from './track.js';

const G = 9.81;

/**
 * Target speed (m/s) at every sample of the racing line: corner speed from the
 * line's curvature, then limited by how fast the car can speed up out of a
 * corner and how hard it can brake into the next one.
 */
export function speedProfile(track, grip = 0.9, P = CAR) {
  const N = track.N, curv = track.line.curv, v = new Float64Array(N);
  const mu = P.mu * grip * (track.wet ? WET_GRIP : 1);
  for (let i = 0; i < N; i++) {
    // use the tightest curvature nearby so it's already slow when the corner starts
    let k = 0;
    for (let j = -2; j <= 2; j++) k = Math.max(k, Math.abs(curv[(i + j + N) % N]));
    v[i] = Math.min(P.gears[P.gears.length - 1], Math.sqrt((mu * G) / Math.max(k, 1e-4)));
  }
  const brakeA = mu * G * 0.78;
  // two laps round each way so the start/finish joins up
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < N; k++) {
      const i = k, j = (k + 1) % N;
      const vi = Math.max(v[i], 1);
      const acc = Math.min(P.maxDrive, P.power / vi) / P.mass - (P.drag * vi * vi) / P.mass;
      v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * Math.max(acc, 0) * SPACING));
    }
    for (let k = N - 1; k >= 0; k--) {
      const i = k, j = (k + 1) % N;
      // the tyres share their grip between turning and braking: only brake
      // with what's left over after the cornering at that point
      const lat = v[j] * v[j] * Math.abs(curv[j]);
      const a = Math.max(2.5, Math.sqrt(Math.max(0, (mu * G) ** 2 - lat * lat)) * 0.78);
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * Math.min(brakeA, a) * SPACING));
    }
  }
  return v;
}

export class Bot {
  /** grip: how close to the limit it corners (0.9 = gold medal pace). offset(i): sideways shift from the racing line. */
  constructor(track, grip = 0.9, P = CAR, offset = null) {
    this.track = track;
    this.P = P;
    this.offset = offset;
    this.profile = speedProfile(track, grip, P);
  }

  /** Controls for this step: { throttle, brake, steer }. */
  drive(c) {
    const t = this.track, line = t.line, N = t.N;
    const i = c.loc.i;
    const speed = Math.max(0, c.u);

    // steering: aim at a point on the racing line ahead (pure pursuit)
    const ahead = Math.round((5 + speed * 0.3) / SPACING);
    const j = (i + ahead) % N;
    let tx = line.x[j], tz = line.z[j];
    if (this.offset) { const o = this.offset(j); tx -= t.tz[j] * o; tz += t.tx[j] * o; }
    const dx = tx - c.x, dz = tz - c.z;
    const ch = Math.cos(c.h), sh = Math.sin(c.h);
    const fwd = dx * ch + dz * sh, right = -dx * sh + dz * ch;
    const d2 = Math.max(fwd * fwd + right * right, 1);
    const wheel = Math.atan((this.P.wheelbase * 2 * right) / d2);
    const lock = this.P.maxSteer / (1 + Math.hypot(c.u, c.v) / 22);
    let steer = wheel / lock;
    // facing backwards (after a crash): turn hard towards the track direction
    if (fwd < 0) steer = right >= 0 ? 1 : -1;
    steer = Math.max(-1, Math.min(1, steer));

    // speed: what the profile asks for a little way ahead
    const look = (i + 3 + Math.round(speed * 0.05)) % N;
    const want = this.profile[look] * (this.speedMul || 1);
    let throttle = 0, brake = 0;
    if (speed < want - 0.3) throttle = 1;
    else if (speed > want + 0.8) brake = Math.min(1, (speed - want) / 4);
    else throttle = 0.35;
    return { throttle, brake, steer };
  }
}
