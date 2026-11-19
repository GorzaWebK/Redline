// Replays: a recorded run (a ghost) played back on a full car and filmed by
// trackside TV cameras, like a broadcast. Cameras stand on poles on the barrier
// line about every 60 m; the director cuts to whichever camera is just ahead of
// the car, and zooms in more the further away the car is.

/** Trackside camera spots: [{ x, y, z, s }] (s = distance along the lap). */
export function tvCameras(track) {
  const out = [];
  const step = Math.round(60 / (track.L / track.N));
  for (let i = 0, k = 0; i < track.N; i += step, k++) {
    // on the outside of the bend if there is one, just beyond the wall
    const side = Math.abs(track.curv[i]) > 1 / 200 ? -Math.sign(track.curv[i]) : k % 2 ? 1 : -1;
    // on a pole on the barrier line: inside the walls the ground is flat, so
    // nothing (hills, grandstands, trees) can get between the camera and the car
    const lat = side * (track.wall - 0.3);
    const x = track.x[i] - track.tz[i] * lat, z = track.z[i] + track.tx[i] * lat;
    out.push({ x, y: track.y[i] + 4.5 + (k % 3) * 1.2, z, s: track.s[i] });
  }
  return out;
}

export class Director {
  constructor(track, cams) { this.track = track; this.cams = cams; this.cur = -1; this.hold = 0; }
  /** Forget the current shot (after skipping through the replay). */
  cut() { this.cur = -1; this.hold = 0; }
  /** The camera to film from for a car at (x, z), distance s along the lap. */
  pick(s, x, z, dt = 0) {
    const L = this.track.L;
    const ahead = (c) => { let d = c.s - s; d -= L * Math.round(d / L); return d; };
    const dist = (c) => Math.hypot(c.x - x, c.z - z);
    this.hold -= dt;
    const curCam = this.cams[this.cur];
    // keep the current shot while it still has a good view (and at least 1.5 s)
    if (curCam && dist(curCam) < 110 && (this.hold > 0 || (ahead(curCam) > -25 && dist(curCam) < 75))) return curCam;
    // otherwise cut to the nearest camera watching the stretch just ahead of the car
    let best = 0, bd = Infinity;
    this.cams.forEach((c, k) => {
      const a = ahead(c);
      if (a < -10 || a > 90) return;
      const d = dist(c) + Math.max(0, a - 30) * 0.5;
      if (d < bd) { bd = d; best = k; }
    });
    if (best !== this.cur) { this.cur = best; this.hold = 1.5; }
    return this.cams[best];
  }
}

/** Field of view (degrees) that keeps a car about the same size on screen. */
export const zoomFov = (dist) => Math.max(10, Math.min(60, (2 * Math.atan(7 / Math.max(dist, 1)) * 180) / Math.PI));
