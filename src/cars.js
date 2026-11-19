// The four cars. Each has its own physics (a few of the GT's numbers replaced),
// body shape and engine sound. Medal times are set with the GT; the others are
// quicker in some places and slower in others.
import { makeSpec, CAR } from './car.js';

export const CARS = [
  {
    id: 'gt', name: 'Redline GT', blurb: 'The all-rounder: quick, stable and easy to drift.',
    spec: CAR,
    model: 'gt',
    engine: { div: 30, sub: 0.4, wobble: 0.2, bright: 1, body: 160 },
    stats: { speed: 3, accel: 3, grip: 3, drift: 3 },
  },
  {
    id: 'hatch', name: 'Pocket Rocket', blurb: 'A light hatchback: slower on the straights, but brakes late and turns in like a go-kart.',
    spec: makeSpec({
      mass: 960, a: 1.15, b: 1.25, inertia: 1250, power: 128000, maxDrive: 9000, brake: 15500,
      mu: 1.66, rearGrip: 1.12, drag: 0.42, maxSteer: 0.58, cornerF: 90000, cornerR: 110000,
      revMax: 8800, gears: [0, 14, 23, 32, 42, 52, 67], driftHold: 0.26,
    }),
    model: 'hatch',
    engine: { div: 30, sub: 0.25, wobble: 0.12, bright: 1.5, body: 230 },
    stats: { speed: 2, accel: 2, grip: 5, drift: 2 },
  },
  {
    id: 'muscle', name: 'Thunderbolt', blurb: 'A big V8 muscle car: huge power and a loose rear end. Built for long, smoky drifts.',
    spec: makeSpec({
      mass: 1460, a: 1.35, b: 1.45, inertia: 2350, power: 262000, maxDrive: 12800, brake: 18500,
      mu: 1.47, rearGrip: 1.03, drag: 0.5, cornerF: 100000, cornerR: 112000, driftTurn: 10.5,
      driftHold: 0.36, driftRange: 0.16, driftScrub: 0.4, revMax: 6500, gears: [0, 17, 29, 41, 53, 65, 81],
    }),
    model: 'muscle',
    engine: { div: 15, sub: 0.6, wobble: 0.38, bright: 0.75, body: 110 },
    stats: { speed: 4, accel: 4, grip: 2, drift: 5 },
  },
  {
    id: 'hyper', name: 'Apex V10', blurb: 'A hypercar with a screaming V10: the fastest thing here, and the hardest to tame.',
    spec: makeSpec({
      mass: 1240, a: 1.35, b: 1.3, inertia: 1700, power: 335000, maxDrive: 13600, brake: 21500,
      mu: 1.72, rearGrip: 1.08, drag: 0.38, cornerF: 110000, cornerR: 130000,
      revMax: 9200, gears: [0, 20, 34, 48, 62, 77, 96],
    }),
    model: 'hyper',
    engine: { div: 12, sub: 0.3, wobble: 0.15, bright: 1.35, body: 200 },
    stats: { speed: 5, accel: 5, grip: 4, drift: 3 },
  },
];

export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];

/** What it takes to unlock each car (checked against medal counts and trophies). */
export const CAR_RULES = {
  muscle: { any: 8, text: '8 medals' },
  hyper: { gold: 12, text: 'Gold on 12 tracks' },
};
