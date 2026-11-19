// Car physics: a "bicycle model" (one front and one rear wheel pair) with tyre
// grip that builds with slip angle and then levels off, weight shifting under
// braking and acceleration, engine power, brakes, drag and road slope. It runs on
// a fixed 120 Hz step in the x/z plane; the car's height comes from the road.
// No drawing code, so it runs the same in Node (tests, autopilot) and the browser.

import { locate } from './track.js';

export const DT = 1 / 120;
const G = 9.81;

export const CAR = {
  mass: 1150,
  a: 1.3, // centre of mass to front axle (m)
  b: 1.3, // centre of mass to rear axle
  h: 0.4, // centre of mass height (weight transfer)
  inertia: 1750,
  cornerF: 95000, // tyre cornering stiffness, N per radian
  cornerR: 115000,
  mu: 1.55, // grip on tarmac
  muGrass: 0.95,
  power: 185000, // W
  maxDrive: 10500, // N, traction-limited launch
  brake: 17500, // N total
  brakeFront: 0.7,
  rearGrip: 1.1, // rear tyres grip a little more than the fronts: stable, slightly understeery
  drag: 0.44, // N per (m/s)^2
  roll: 14, // N per m/s
  grassDrag: 260, // extra N per m/s on grass
  maxSteer: 0.52, // radians at walking pace
  halfWidth: 0.95,
  driftTurn: 9, // m/s^2 of extra turn a slide gives (momentum swung round towards the nose)
  driftScrub: 0.14, // share of speed lost per second while fully sideways
  handbrakeGrip: 0.42, // rear grip with the handbrake on
  reverseSpeed: 11,
};
CAR.wheelbase = CAR.a + CAR.b;

// gear changes (for the engine sound and the HUD; the drive force itself is a
// smooth power curve): top speed in m/s of each gear
export const GEARS = [0, 15, 26, 37, 48, 59, 80];

/** A fresh car state at sample i of the track, facing along it. */
export function makeCar(track, i = 0, back = 0) {
  const x = track.x[i] - track.tx[i] * back, z = track.z[i] - track.tz[i] * back;
  const c = {
    x, z, y: track.y[i], h: Math.atan2(track.tz[i], track.tx[i]),
    u: 0, v: 0, r: 0, // forward speed, sideways speed (+ right), yaw rate
    steer: 0, // current front wheel angle
    ax: 0, // last forward acceleration (weight transfer)
    loc: {}, hint: -1,
    onGrass: false, slipF: 0, slipR: 0, // tyre slip 0..1+ (sound, smoke)
    hit: 0, // strength of the last wall hit this step (m/s)
    gear: 1, rpm: 1000,
    pitch: 0,
  };
  locate(track, c.x, c.z, -1, c.loc);
  c.hint = c.loc.i;
  return c;
}

// tyre lateral force: rises with slip angle, peaks, then falls off a little
function tyre(alpha, stiff, maxF) {
  if (maxF <= 0) return 0;
  const B = stiff / (1.4 * maxF);
  return -maxF * Math.sin(1.4 * Math.atan(B * alpha));
}

/**
 * Advance the car one step. input = { throttle 0..1, brake 0..1, steer -1..1 (+ right) }.
 * Steering input is turned into a wheel angle that eases in, and allows less lock
 * at speed, so keyboard steering stays precise.
 */
export function stepCar(c, track, input, dt = DT) {
  const P = CAR;
  const speed = Math.hypot(c.u, c.v);

  // steering: target lock shrinks with speed; the wheels turn at a limited rate
  const lock = P.maxSteer / (1 + speed / 22);
  const target = Math.max(-1, Math.min(1, input.steer || 0)) * lock;
  const rate = (Math.abs(target) < Math.abs(c.steer) || target * c.steer < 0 ? 4.5 : 2.6) * P.maxSteer;
  const d = target - c.steer;
  c.steer += Math.max(-rate * dt, Math.min(rate * dt, d));
  const delta = c.steer;

  const loc = c.loc;
  c.onGrass = Math.abs(loc.lat) > track.halfW + 0.4;
  const mu = c.onGrass ? P.muGrass : P.mu;

  // weight on each axle, shifting with acceleration
  const W = P.mass * G;
  const shift = (P.mass * c.ax * P.h) / P.wheelbase;
  const Ff = Math.max(0.15 * W, (W * P.b) / P.wheelbase - shift);
  const Fr = Math.max(0.15 * W, (W * P.a) / P.wheelbase + shift);

  // driver input -> forces along the car
  const throttle = Math.max(0, Math.min(1, input.throttle || 0));
  const brake = Math.max(0, Math.min(1, input.brake || 0));
  const handbrake = !!input.handbrake && Math.abs(c.u) > 2;
  let drive = 0, brakeF = 0, brakeR = 0;
  if (brake > 0 && c.u < 0.6 && throttle === 0) {
    // reversing
    if (c.u > -P.reverseSpeed) drive = -brake * P.maxDrive * 0.45;
  } else {
    drive = throttle * Math.min(P.maxDrive, P.power / Math.max(Math.abs(c.u), 1));
    if (c.u < -0.3 && throttle > 0) { drive = 0; brakeF = throttle * P.brake * P.brakeFront; brakeR = throttle * P.brake * (1 - P.brakeFront); }
    if (brake > 0) {
      brakeF = brake * P.brake * P.brakeFront;
      brakeR = brake * P.brake * (1 - P.brakeFront);
    }
  }
  const sgn = c.u >= 0 ? 1 : -1;
  // brakes can't do more than stop the car this step
  const stopF = (Math.abs(c.u) * P.mass) / dt;
  let fxF = -sgn * Math.min(brakeF, stopF * P.brakeFront);
  let fxR = drive - sgn * Math.min(brakeR, stopF * (1 - P.brakeFront));
  // tyres can't push harder than their grip
  fxF = Math.max(-mu * Ff, Math.min(mu * Ff, fxF));
  // traction control: drive never uses more than 75% of the rear grip, so
  // flooring it out of a corner can't spin the car
  const muR = mu * P.rearGrip * (handbrake ? P.handbrakeGrip : 1);
  if (handbrake) fxR = -sgn * Math.min(muR * Fr * 0.9, stopF * 0.4); // rear wheels locked
  fxR = Math.max(-muR * Fr, Math.min(0.75 * muR * Fr, fxR));

  // slip angles (with a floor on speed so standing still is calm)
  const ue = Math.max(Math.abs(c.u), 3);
  const alphaF = Math.atan2(c.v + P.a * c.r, ue) - delta * sgn;
  const alphaR = Math.atan2(c.v - P.b * c.r, ue);
  const latMaxF = Math.sqrt(Math.max(0, (mu * Ff) ** 2 - fxF * fxF));
  const latMaxR = Math.sqrt(Math.max(0, (muR * Fr) ** 2 - fxR * fxR));
  const fyF = tyre(alphaF, P.cornerF, latMaxF);
  const fyR = tyre(alphaR, P.cornerR, latMaxR);
  c.slipF = Math.abs(alphaF) * P.cornerF / Math.max(1, mu * Ff) / 1.4;
  c.slipR = Math.abs(alphaR) * P.cornerR / Math.max(1, muR * Fr) / 1.4;
  if (fxR > 0.74 * muR * Fr && throttle > 0.5 && Math.abs(c.u) < 12) c.slipR = Math.max(c.slipR, 1.1); // wheelspin off the line

  // resistances and slope
  let resist = -P.drag * c.u * Math.abs(c.u) - P.roll * c.u;
  if (c.onGrass) resist -= P.grassDrag * c.u;
  const fwdGrade = loc.grade * (Math.cos(c.h) * loc.tx + Math.sin(c.h) * loc.tz);
  resist -= P.mass * G * fwdGrade;

  const cosD = Math.cos(delta), sinD = Math.sin(delta);
  const fx = fxR + fxF * cosD - fyF * sinD + resist;
  const fy = fyR + fyF * cosD + fxF * sinD;
  let torque = P.a * (fyF * cosD + fxF * sinD) - P.b * fyR;
  // stability control: if the car is rotating faster than the steering asks
  // for and the rear is sliding, gently hold it back (off while the handbrake is
  // on, so you can kick the rear out on purpose)
  const rWant = (c.u * Math.tan(delta)) / P.wheelbase;
  const over = c.r - rWant;
  if (!handbrake && c.slipR > 0.75 && Math.abs(c.r) > Math.abs(rWant) && Math.sign(over) === Math.sign(c.r) && c.u > 5) {
    torque -= Math.max(-9000, Math.min(9000, over * 26000));
  }

  const du = fx / P.mass + c.v * c.r;
  const dv = fy / P.mass - c.u * c.r;
  c.u += du * dt;
  c.v += dv * dt;
  c.r += (torque / P.inertia) * dt;
  c.ax = c.ax + (fx / P.mass - c.ax) * 0.2;

  // drifting: while the car is sliding, its momentum swings round towards where
  // the nose points (a slide carries you through the corner instead of straight
  // on), losing a little speed to tyre scrub
  const sp = Math.hypot(c.u, c.v);
  if (sp > 6 && c.u > 2) {
    const b = Math.atan2(c.v, c.u);
    const amt = Math.max(0, Math.min(1, (Math.abs(b) - 0.09) / 0.12)) * (c.onGrass ? 0.4 : 1);
    if (amt > 0) {
      const turn = Math.min(Math.abs(b), ((P.driftTurn * amt) / sp) * dt);
      const nb = b - Math.sign(b) * turn;
      const ns = sp * (1 - P.driftScrub * amt * Math.min(1, Math.abs(b) / 0.6) * dt);
      c.u = ns * Math.cos(nb);
      c.v = ns * Math.sin(nb);
    }
  }
  c.drift = Math.abs(Math.atan2(c.v, Math.max(Math.abs(c.u), 1)));

  // almost stopped with nothing pressed: settle completely
  if (Math.abs(c.u) < 0.25 && throttle === 0 && brake === 0) {
    c.u *= 0.9; c.v *= 0.8; c.r *= 0.8;
  }
  if (speed < 2) { c.v *= 0.95; c.r *= 0.95; }

  c.h += c.r * dt;
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  c.x += (c.u * ch - c.v * sh) * dt;
  c.z += (c.u * sh + c.v * ch) * dt;

  // where are we on the track now? walls stop us leaving it
  locate(track, c.x, c.z, c.hint, loc);
  c.hint = loc.i;
  c.hit = 0;
  const lim = track.wall - P.halfWidth;
  if (Math.abs(loc.lat) > lim) {
    const side = Math.sign(loc.lat);
    const nx = -loc.tz * side, nz = loc.tx * side; // outward normal
    const over = Math.abs(loc.lat) - lim;
    c.x -= nx * over; c.z -= nz * over;
    // world velocity, split into into-the-wall and along-the-wall parts
    let wx = c.u * ch - c.v * sh, wz = c.u * sh + c.v * ch;
    const vn = wx * nx + wz * nz;
    if (vn > 0) {
      c.hit = vn;
      wx -= vn * nx * 1.3; wz -= vn * nz * 1.3; // a little bounce
      const scrub = Math.max(0.55, 1 - vn * 0.035);
      wx *= scrub; wz *= scrub;
      c.u = wx * ch + wz * sh;
      c.v = -wx * sh + wz * ch;
      c.r *= 0.5;
      // turn the nose along the wall a bit
      const along = Math.atan2(loc.tz, loc.tx), fwd = c.u >= 0 ? along : along + Math.PI;
      let dh = fwd - c.h; dh -= Math.PI * 2 * Math.round(dh / (Math.PI * 2));
      if (Math.abs(dh) < 1.2) c.h += dh * Math.min(0.5, vn * 0.03);
    }
    locate(track, c.x, c.z, c.hint, loc);
  }
  c.y = loc.y;
  c.pitch = Math.atan(loc.grade * (Math.cos(c.h) * loc.tx + Math.sin(c.h) * loc.tz));

  // gear and engine revs (sound and HUD)
  const fwd = Math.abs(c.u);
  while (c.gear < GEARS.length - 1 && fwd > GEARS[c.gear] * 0.97) c.gear++;
  while (c.gear > 1 && fwd < GEARS[c.gear - 1] * 0.8) c.gear--;
  const lo = c.gear === 1 ? 0 : GEARS[c.gear - 1] * 0.7, hi = GEARS[c.gear];
  const target2 = 1100 + Math.max(0, Math.min(1, (fwd - lo) / (hi - lo))) * 6900 + (throttle && fwd < 3 ? 1800 * throttle : 0);
  c.rpm += (target2 - c.rpm) * 0.25;
  return c;
}

/** Speed in m/s. */
export const speedOf = (c) => Math.hypot(c.u, c.v);
