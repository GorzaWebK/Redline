// Picks a seed for each circuit: one that makes a valid track that the autopilot
// can drive cleanly (no wall hits, no grass), and records its 3-lap time as the
// gold medal time. Writes src/track-seeds.js. Rerun after changing the track
// generator, the car or the autopilot:  npm run seeds
import { writeFileSync } from 'node:fs';
import { generateTrack } from '../src/track.js';
import { Bot } from '../src/bot.js';
import { simulate } from '../src/race.js';
import { TRACK_COUNT, diffOf } from '../src/tracks.js';
import { hashString } from '../src/rng.js';

const out = [];
for (let k = 0; k < TRACK_COUNT; k++) {
  const diff = diffOf(k);
  let seed = hashString(`redline-${k}`) % 1000000, tries = 0;
  for (;; seed++, tries++) {
    const t = generateTrack(seed, diff);
    if (!t) continue;
    // keep lap lengths in a sensible band for the difficulty
    const want = 900 + diff * 900;
    if (Math.abs(t.L - want) > 250) continue;
    const bot = new Bot(t);
    const race = simulate(t, (c) => bot.drive(c));
    if (race.state !== 'finished' || race.wallHits || race.grassTime > 0.25) continue;
    const gold = Math.ceil(race.time * 10) / 10;
    out.push({ seed, gold });
    console.log(`track ${k + 1}: seed ${seed} length ${Math.round(t.L)} m, gold ${gold}s (${tries} tries)`);
    break;
  }
}
writeFileSync(new URL('../src/track-seeds.js', import.meta.url),
  `// Written by scripts/find-seeds.mjs: a checked seed and the autopilot's 3-lap time per circuit.\nexport const SEEDS = ${JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n  {').replace('[{', '[\n  {').replace('}]', '},\n]')};\n`);
