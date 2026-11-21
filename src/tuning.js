// Car tuning, bought with drift points. Every drift point you bank in a race
// goes into your wallet; spend them on tuning kits for each car. A kit unlocks
// one setting (a slider from -1 to 1, 0 = as it left the factory):
//   gearbox:      short (quicker out of slow corners, lower top speed) .. long
//   grip balance: loose rear (turns in sharply, easy to drift) .. planted rear
//   brake bias:   rear (the car rotates under braking) .. front (stable)
// Plain logic: tunedSpec() turns a car's physics into the tuned version.

import { makeSpec } from './car.js';

export const KITS = [
  { id: 'gearing', name: 'Gearbox', price: 30000, low: 'Short', high: 'Long', desc: 'Short gears pull harder out of slow corners; long gears give a higher top speed.' },
  { id: 'balance', name: 'Grip balance', price: 40000, low: 'Loose rear', high: 'Planted rear', desc: 'A loose rear turns in sharply and drifts easily; a planted rear is stable but pushes wide.' },
  { id: 'bias', name: 'Brake bias', price: 20000, low: 'Rear', high: 'Front', desc: 'Rear bias helps the car rotate as you brake into a corner; front bias keeps it straight.' },
];

// faster cars cost more to tune
const CAR_PRICE = { gt: 1, hatch: 0.8, muscle: 1.2, hyper: 1.5 };
export const kitPrice = (car, kit) => Math.round((KITS.find((k) => k.id === kit).price * (CAR_PRICE[car] || 1)) / 500) * 500;

// one-click setups (only the kits you own are changed)
export const PRESETS = [
  { id: 'stock', name: 'Stock', setup: { gearing: 0, balance: 0, bias: 0 } },
  { id: 'grip', name: 'Grip', setup: { gearing: -0.3, balance: 0.6, bias: 0.4 } },
  { id: 'drift', name: 'Drift', setup: { gearing: -0.6, balance: -0.9, bias: -0.6 } },
  { id: 'speed', name: 'Top speed', setup: { gearing: 1, balance: 0.3, bias: 0.2 } },
];

const clamp = (x) => Math.max(-1, Math.min(1, Number(x) || 0));

/** The settings that apply: only kits you own count. */
export function activeSetup(setup = {}, kits = []) {
  const out = { gearing: 0, balance: 0, bias: 0 };
  for (const k of kits || []) if (k in out) out[k] = clamp(setup && setup[k]);
  return out;
}

/** A car's physics with a setup applied (setup values -1..1). */
export function tunedSpec(base, setup = {}, kits = []) {
  const s = activeSetup(setup, kits);
  if (!s.gearing && !s.balance && !s.bias) return base;
  const g = s.gearing, b = s.balance, br = s.bias;
  return makeSpec({
    ...base,
    maxDrive: base.maxDrive * (1 - 0.12 * g),
    gears: base.gears.map((v) => v * (1 + 0.12 * g)),
    // short gears: more pull at low speed, less near the top, and a rev limiter;
    // long gears: the other way round
    gearShift: 0.1 * g,
    gearRef: base.gears[base.gears.length - 1] * 0.9,
    topSpeed: g < 0 ? base.gears[base.gears.length - 1] * (1 + 0.12 * g) * 0.94 : 0,
    rearGrip: base.rearGrip + 0.1 * b,
    cornerF: base.cornerF * (1 - 0.06 * b),
    brakeFront: base.brakeFront + 0.08 * br,
    driftHold: base.driftHold + 0.05 * Math.max(0, -b),
  });
}
