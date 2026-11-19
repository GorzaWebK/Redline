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
  h: 0.32, // centre of mass height (weight transfer)
  inertia: 1750,
  cornerF: 95000, // tyre cornering stiffness, N per radian
  cornerR: 115000,
  mu: 1.55, // grip on tarmac
  muGrass: 0.68,
  power: 185000, // W
  maxDrive: 10500, // N, traction-limited launch
  brake: 17500, // N total
  brakeFront: 0.7,
  rearGrip: 1.1, // rear tyres grip a little more than the fronts: stable, slightly understeery
  drag: 0.44, // N per (m/s)^2
  roll: 14, // N per m/s
  grassDrag: 120, // extra N per m/s on grass (top speed on grass is about 130 km/h)
  maxSteer: 0.52, // radians at walking pace
  halfWidth: 0.95,
  driftTurn: 9, // m/s^2 of extra turn a slide gives (momentum swung round towards the nose)
  driftScrub: 0.5, // share of speed lost per second at 40+ degrees sideways
  driftHold: 0.3, // drift angle (radians, ~17 degrees) held with a little steering into the corner
  driftRange: 0.14, // full steering into the corner adds this much (~25 degrees in all)
  reverseDelay: 0.3, // seconds stopped with the brake held before it reverses
  handbrakeGrip: 0.42, // rear grip with the handbrake on
  reverseSpeed: 11,
  revMax: 8000, // engine revs at the top of each gear (sound and HUD)
  // gear changes (for the engine sound and the HUD; the drive force itself is
  // a smooth power curve): top speed in m/s of each gear
  gears: [0, 15, 26, 37, 48, 59, 80],
};
CAR.wheelbase = CAR.a + CAR.b;
export const GEARS = CAR.gears;
export const WET_GRIP = 0.8; // grip on a wet track compared with dry

/** A car's physics: the GT's numbers with some replaced. */
export function makeSpec(over = {}) {
  const P = { ...CAR, ...over };
  P.wheelbase = P.a + P.b;
  return P;
}

/** A fresh car state at sample i of the track, facing along it (lat = metres to the right). */
export function makeCar(track, i = 0, back = 0, spec = CAR, lat = 0) {
  const x = track.x[i] - track.tx[i] * back - track.tz[i] * lat, z = track.z[i] - track.tz[i] * back + track.tx[i] * lat;
  const c = {
    P: spec,
    launchT: 0, launchMul: 1, // launch control boost (or bog) after the start
    onKerb: false,
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
  const P = c.P || CAR;
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
  const al = Math.abs(loc.lat);
  c.onKerb = !!(track.kerb && track.kerb[loc.i]) && al > track.halfW - 0.35 && al < track.halfW + 1.0;
  const mu = (c.onGrass ? P.muGrass : P.mu) * (track.wet ? WET_GRIP : 1);

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
  // reverse only after sitting still with the brake held for a moment, so
  // braking hard to a stop never sends you backwards by surprise
  if (brake > 0 && throttle === 0 && Math.abs(c.u) < 0.6) c.stopT = (c.stopT || 0) + dt;
  else if (c.u > -0.3) c.stopT = 0;
  if (brake > 0 && throttle === 0 && c.u < 0.6 && c.stopT > P.reverseDelay) {
    // reversing
    if (c.u > -P.reverseSpeed) drive = -brake * P.maxDrive * 0.45;
  } else {
    drive = throttle * Math.min(P.maxDrive, P.power / Math.max(Math.abs(c.u), 1));
    if (c.launchT > 0) { drive *= c.launchMul; c.launchT -= dt; }
    if (c.u < -0.3 && throttle > 0) { drive = 0; brakeF = throttle * P.brake * P.brakeFront; brakeR = throttle * P.brake * (1 - P.brakeFront); }
    if (brake > 0) {
      brakeF = brake * P.brake * P.brakeFront;
      brakeR = brake * P.brake * (1 - P.brakeFront);
    }
  }
  const sgn = c.u >= 0 ? 1 : -1;
  // brakes can't do more than stop the car this step
  const stopF = (Math.abs(c.u) * P.mass) / dt;
  // ABS with cornering control: each axle only brakes with the grip its tyres
  // have left after cornering, so braking into a corner slows you without
  // throwing the car sideways (always at least 35% of full braking)
  const room = (fy, cap) => cap * Math.sqrt(Math.max(0.35 * 0.35, 0.92 * 0.92 - Math.min(1, (fy / Math.max(cap, 1)) ** 2)));
  const muR0 = mu * P.rearGrip;
  brakeF = Math.min(brakeF, room(c.fyF || 0, mu * Ff));
  brakeR = Math.min(brakeR, room(c.fyR || 0, muR0 * Fr) * 0.85);
  // if the rear is near its limit, ease all braking: hard braking moves weight
  // off the rear and would let it step out
  const rearUse = Math.abs(c.fyR || 0) / Math.max(1, muR0 * Fr);
  if (rearUse > 0.8) { const ease = Math.max(0.7, 1 - (rearUse - 0.8) * 1.0); brakeF *= ease; brakeR *= ease * 0.8; }
  let fxF = -sgn * Math.min(brakeF, stopF * P.brakeFront);
  let fxR = drive - sgn * Math.min(brakeR, stopF * (1 - P.brakeFront));
  // tyres can't push harder than their grip
  fxF = Math.max(-mu * Ff, Math.min(mu * Ff, fxF));
  // traction control: drive never uses more than 75% of the rear grip, so
  // flooring it out of a corner can't spin the car
  const muR = muR0 * (handbrake ? P.handbrakeGrip : 1);
  if (handbrake) fxR = -sgn * Math.min(muR * Fr * 0.9, stopF * 0.4); // rear wheels locked
  // traction control keeps the drive under 75% of the rear grip, so flooring it
  // can't spin you, but it lets go once you're already sliding, so the throttle
  // can hold a drift
  const slideAng = c.u > 6 ? Math.abs(Math.atan2(c.v, c.u)) : 0;
  const drifting = Math.max(0, Math.min(1, (slideAng - 0.22) / 0.12)); // 0 below ~13 degrees, 1 above ~19
  const tc = c.launchT > 0 && c.launchMul > 1 ? 0.9 : 0.75 + 0.2 * drifting; // a perfect launch uses more grip
  fxR = Math.max(-muR * Fr, Math.min(tc * muR * Fr, fxR));

  // slip angles (with a floor on speed so standing still is calm)
  const ue = Math.max(Math.abs(c.u), 3);
  const alphaF = Math.atan2(c.v + P.a * c.r, ue) - delta * sgn;
  const alphaR = Math.atan2(c.v - P.b * c.r, ue);
  const latMaxF = Math.sqrt(Math.max(0, (mu * Ff) ** 2 - fxF * fxF));
  let latMaxR = Math.sqrt(Math.max(0, (muR * Fr) ** 2 - fxR * fxR));
  // mid-slide, the throttle spins the rear tyres and keeps them loose (hold a
  // drift with throttle and countersteer; lift off and the grip comes back)
  if (drifting > 0 && throttle > 0) latMaxR *= 1 - 0.38 * throttle * drifting;
  const fyF = tyre(alphaF, P.cornerF, latMaxF);
  const fyR = tyre(alphaR, P.cornerR, latMaxR);
  c.slipF = Math.abs(alphaF) * P.cornerF / Math.max(1, mu * Ff) / 1.4;
  c.slipR = Math.abs(alphaR) * P.cornerR / Math.max(1, muR * Fr) / 1.4;
  if (fxR > 0.74 * muR * Fr && throttle > 0.5 && Math.abs(c.u) < 12) c.slipR = Math.max(c.slipR, 1.1); // wheelspin off the line
  if (c.launchT > 0 && c.launchMul < 1 && throttle > 0) c.slipR = Math.max(c.slipR, 1.6); // a botched launch: wheelspin

  // resistances and slope
  let resist = -P.drag * c.u * Math.abs(c.u) - P.roll * c.u;
  if (c.onGrass) resist -= P.grassDrag * c.u;
  const fwdGrade = loc.grade * (Math.cos(c.h) * loc.tx + Math.sin(c.h) * loc.tz);
  resist -= P.mass * G * fwdGrade;

  const cosD = Math.cos(delta), sinD = Math.sin(delta);
  const fx = fxR + fxF * cosD - fyF * sinD + resist;
  const fy = fyR + fyF * cosD + fxF * sinD;
  let torque = P.a * (fyF * cosD + fxF * sinD) - P.b * fyR;
  c.fyF = fyF; c.fyR = fyR;
  // drift control: once the car is properly sideways (over ~8 degrees) and
  // you're on the throttle, it holds the slide for you while you keep steering
  // into the corner (more steering = a deeper drift). Centre the steering,
  // countersteer or lift off and the car straightens up and grips again.
  const B = c.u > 6 ? Math.abs(Math.atan2(c.v, c.u)) : 0;
  const bSign = Math.sign(c.v) || 1;
  const dB = (B - (c.prevB || 0)) / dt;
  c.prevB = B;
  const hold = Math.max(0, Math.min(1, (B - 0.14) / 0.08)) * (throttle > 0 ? 1 : handbrake ? 0.6 : 0) * (c.onGrass ? 0.5 : 1);
  c.driftHold = hold;

  // stability control: if the car is rotating faster than the steering asks
  // for and the rear is sliding, gently hold it back (off while the handbrake is
  // on or drift control is holding a slide, so you can drift on purpose)
  const rWant = (c.u * Math.tan(delta)) / P.wheelbase;
  const over = c.r - rWant;
  if (!handbrake && hold < 0.5 && c.slipR > 0.75 && Math.abs(c.r) > Math.abs(rWant) && Math.sign(over) === Math.sign(c.r) && c.u > 5) {
    torque -= Math.max(-9000, Math.min(9000, over * 26000));
  }
  // spin guard: past ~50 degrees sideways and still rotating further, damp the
  // rotation (even with the handbrake on), so a big slide stays a slide
  const slideNow = Math.atan2(c.v, Math.max(Math.abs(c.u), 0.5));
  if (Math.abs(slideNow) > 0.7 && Math.sign(c.r) === -Math.sign(slideNow) && c.u > 3) {
    torque -= Math.max(-26000, Math.min(26000, c.r * 45000 * Math.min(1, (Math.abs(slideNow) - 0.7) / 0.3)));
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
      // scrub grows with the square of the slide angle: a tidy drift can be held
      // on the throttle, a wild sideways slide costs a lot of speed
      const ns = sp * (1 - P.driftScrub * amt * Math.min(1, (Math.abs(b) / 0.7) ** 2) * dt);
      c.u = ns * Math.cos(nb);
      c.v = ns * Math.sin(nb);
    }
  }
  // drift control (see above): turn the nose towards the chosen slide angle
  // without touching the car's momentum, and let the nose follow the path
  if (hold > 0 && c.u > 2) {
    const b = Math.atan2(c.v, c.u);
    const into = -Math.sign(b) * Math.max(-1, Math.min(1, input.steer || 0)); // +1 = steering into the corner
    const holding = into > 0.05;
    const target = holding ? Math.sign(b) * (P.driftHold + P.driftRange * into) : 0;
    // straightening (no steering) eases out; countersteering snaps back quicker
    const rate = holding ? 5 : into < -0.05 ? 4 : 2.2;
    const dh = -(target - b) * Math.min(1, rate * dt) * hold; // new slide = old + (target - old) * share
    const cs = Math.cos(dh), sn = Math.sin(dh);
    const u0 = c.u, v0 = c.v;
    c.h += dh;
    c.u = u0 * cs + v0 * sn;
    c.v = -u0 * sn + v0 * cs;
    const velDir = c.h + Math.atan2(c.v, c.u);
    if (c.prevVelDir !== undefined) {
      let w = (velDir - c.prevVelDir) / dt; w -= 0; // rate the path is turning
      if (Math.abs(w) < 6) c.r += (w - c.r) * Math.min(1, 8 * dt) * hold;
    }
  }
  c.prevVelDir = c.h + Math.atan2(c.v, c.u);
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
  const fwd = Math.abs(c.u), gears = P.gears;
  while (c.gear < gears.length - 1 && fwd > gears[c.gear] * 0.97) c.gear++;
  while (c.gear > 1 && fwd < gears[c.gear - 1] * 0.8) c.gear--;
  const lo = c.gear === 1 ? 0 : gears[c.gear - 1] * 0.7, hi = gears[c.gear];
  const target2 = 1100 + Math.max(0, Math.min(1, (fwd - lo) / (hi - lo))) * (P.revMax - 1100) + (throttle && fwd < 3 ? 1800 * throttle : 0);
  c.rpm += (target2 - c.rpm) * 0.25;
  return c;
}

/** Speed in m/s. */
export const speedOf = (c) => Math.hypot(c.u, c.v);
