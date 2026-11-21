// Picks a seed for each circuit: one that makes a valid track that the autopilot
// can drive cleanly (no wall hits, no grass), and records gold medal times: the
// autopilot's 3-lap time in each car. Writes src/track-seeds.js. A circuit
// keeps its current seed (and so its layout) whenever that seed still passes.
// Rerun after changing the track generator, the cars or the autopilot:  npm run seeds
import { writeFileSync } from 'node:fs';
import { generateTrack } from '../src/track.js';
import { Bot } from '../src/bot.js';
import { simulate } from '../src/race.js';
import { TRACK_SPECS } from '../src/tracks.js';
import { CARS } from '../src/cars.js';
import { hashString } from '../src/rng.js';
import { SEEDS } from '../src/track-seeds.js';

const ceil1 = (t) => Math.ceil(t * 10) / 10;
const out = [];
TRACK_SPECS.forEach((sp, k) => {
  const keep = SEEDS[k] && SEEDS[k].seed;
  let seed = keep || hashString(`redline-${k}`) % 1000000, tries = 0;
  for (;; seed = tries === 0 && keep ? hashString(`redline-${k}`) % 1000000 : seed + 1, tries++) {
    const t = generateTrack(seed, sp.diff, sp.style);
    if (!t) continue;
    t.wet = sp.wet; // rainy circuits: the gold time is set in the wet
    // keep lap lengths in a sensible band
    const want = sp.style === 'classic' ? 900 + sp.diff * 900 : 1500;
    if (Math.abs(t.L - want) > (sp.style === 'classic' ? 250 : 550)) continue;
    const bot = new Bot(t);
    const race = simulate(t, (c) => bot.drive(c));
    if (race.state !== 'finished' || race.wallHits || race.grassTime > 0.25) continue;
    // each car's gold: the autopilot's clean 3-lap time in that car (it backs off a
    // little on circuits where it can't stay on the road at full attack)
    const golds = {};
    let clean = true;
    for (const car of CARS) {
      let time = 0;
      for (const grip of [0.9, 0.86, 0.82, 0.78]) {
        const b2 = new Bot(t, grip, car.spec);
        const r2 = simulate(t, (c) => b2.drive(c), { spec: car.spec });
        if (r2.state === 'finished' && !r2.wallHits && r2.grassTime <= 0.6) { time = r2.time; break; }
      }
      if (!time) { clean = false; break; }
      golds[car.id] = ceil1(time);
    }
    if (!clean && !keep) continue; // new circuits must suit every car
    if (!clean) for (const car of CARS) golds[car.id] = golds[car.id] || ceil1(race.time);
    out.push({ seed, gold: ceil1(race.time), golds });
    console.log(`track ${k + 1} (${sp.style}): seed ${seed} length ${Math.round(t.L)} m, gold ${ceil1(race.time)}s, by car ${JSON.stringify(golds)} (${tries} tries)`);
    break;
  }
});
writeFileSync(new URL('../src/track-seeds.js', import.meta.url),
  `// Written by scripts/find-seeds.mjs: a checked seed and the autopilot's 3-lap time per circuit (gold: Redline GT; golds: each car).\nexport const SEEDS = [\n${out.map((o) => `  ${JSON.stringify(o)},`).join('\n')}\n];\n`);
