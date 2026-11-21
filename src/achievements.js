// Achievements. Most are checked against your save after each race; a few
// (a perfect start, a big drift, photo mode) are awarded the moment they
// happen. Some unlock a paint (see PAINT_RULES in main.js).

export const ACHIEVEMENTS = [
  { id: 'first', name: 'Lights Out', desc: 'Finish your first race' },
  { id: 'medal', name: 'On the Podium', desc: 'Win a medal' },
  { id: 'gold', name: 'Golden', desc: 'Win a gold medal' },
  { id: 'meadow', name: 'Meadow Master', desc: 'Gold on all six Meadow circuits' },
  { id: 'canyon', name: 'Canyon Master', desc: 'Gold on all six Canyon circuits' },
  { id: 'alpine', name: 'Alpine Master', desc: 'Gold on all six Alpine circuits' },
  { id: 'night', name: 'Night Master', desc: 'Gold on all six Night City circuits' },
  { id: 'riviera', name: 'Riviera Master', desc: 'Gold on all six Riviera circuits' },
  { id: 'tour', name: 'Grand Tour', desc: 'Finish all 30 circuits' },
  { id: 'perfect', name: 'Perfectionist', desc: 'Gold on every circuit' },
  { id: 'clean', name: 'Clean Sheet', desc: 'Finish a race without touching a wall or the grass' },
  { id: 'rain', name: 'Rain Master', desc: 'Win gold on a wet circuit' },
  { id: 'drift1', name: 'Sideways', desc: 'Score 1,000 points in one drift' },
  { id: 'drift5', name: 'Smoke Show', desc: 'Score 5,000 points in one drift', reward: 'Carbon paint' },
  { id: 'driftAll', name: 'Tyre Shredder', desc: 'Score 100,000 drift points in total' },
  { id: 'mechanic', name: 'Mechanic', desc: 'Buy all three tuning kits for a car' },
  { id: 'weekly', name: 'Tournament Gold', desc: 'Win gold in a weekly tournament' },
  { id: 'launch', name: 'Lightning Start', desc: 'Nail a perfect launch' },
  { id: 'win', name: 'Chequered Flag', desc: 'Win a race against the AI' },
  { id: 'winHard', name: 'Giant Killer', desc: 'Win a race against Hard AI', reward: 'Neon paint' },
  { id: 'cup', name: 'Champion', desc: 'Win a championship cup' },
  { id: 'cups', name: 'Grand Champion', desc: 'Win all five cups', reward: 'Chrome paint' },
  { id: 'daily', name: 'Daily Driver', desc: 'Finish a daily challenge' },
  { id: 'streak', name: 'Seven Days', desc: 'Play the daily challenge 7 days in a row' },
  { id: 'far', name: 'Long Haul', desc: 'Drive 500 km' },
  { id: 'fast', name: 'Three Hundred', desc: 'Reach 300 km/h' },
  { id: 'cars', name: 'Collector', desc: 'Unlock all four cars' },
  { id: 'photo', name: 'Snapper', desc: 'Take a photo in photo mode' },
];
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/**
 * Achievements earned according to the save. ctx: { save, counts, tracks,
 * medalOf(tr), carsUnlocked } (see main.js). Returns ids, earned or not yet.
 */
export function earnedFromSave(ctx) {
  const { save, counts, tracks, medalOf } = ctx;
  const out = [];
  const golds = (theme) => tracks.filter((t) => t.theme === theme).every((t) => medalOf(t)?.id === 'gold');
  if (save.stats.races > 0) out.push('first');
  if (counts.any > 0) out.push('medal');
  if (counts.gold > 0) out.push('gold');
  for (const th of ['meadow', 'canyon', 'alpine', 'night', 'riviera']) if (golds(th)) out.push(th);
  if (tracks.every((t) => save.best[t.id])) out.push('tour');
  if (counts.gold === tracks.length) out.push('perfect');
  if (tracks.some((t) => t.wet && medalOf(t)?.id === 'gold')) out.push('rain');
  if ((save.stats.driftBest || 0) >= 1000) out.push('drift1');
  if ((save.stats.driftBest || 0) >= 5000) out.push('drift5');
  if (Object.values(save.kits || {}).some((l) => Array.isArray(l) && l.length >= 3)) out.push('mechanic');
  if ((save.weekly && save.weekly.paid) >= 6000) out.push('weekly');
  if ((save.stats.driftTotal || 0) >= 100000) out.push('driftAll');
  if ((save.stats.wins || 0) > 0) out.push('win');
  if ((save.stats.winsHard || 0) > 0) out.push('winHard');
  const cupWins = Object.values(save.trophies || {}).filter((p) => p === 1).length;
  if (cupWins > 0) out.push('cup');
  if (cupWins >= 5) out.push('cups');
  if ((save.daily?.best || 0) >= 1) out.push('daily');
  if ((save.daily?.best || 0) >= 7) out.push('streak');
  if (save.stats.distance >= 500000) out.push('far');
  if ((save.stats.topSpeed || 0) * 3.6 >= 300) out.push('fast');
  if (ctx.carsUnlocked) out.push('cars');
  return out;
}
