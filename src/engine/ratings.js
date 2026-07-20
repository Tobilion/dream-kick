/**
 * ratings.js — per-player match ratings from TRACKED stats (V3 Phase C).
 * FotMob-style, patterned on betting-sim playerRatingUtils.ts +
 * Sportsim-pro postMatch.ts: events + result + small deterministic variance.
 * Engine module (DOM-free) so match.js can fold ratings into season stats.
 */
import { clamp } from '../core/math.js';

/**
 * @returns {Map<PlayerEntity, number>} rating 4.5..10, 1 decimal.
 * Cached on match._ratings so UI and season bookkeeping agree.
 */
export function computeMatchRatings(match) {
  if (match._ratings) return match._ratings;

  const ratings = new Map();
  const diff = match.score[0] - match.score[1];

  for (const team of match.teams) {
    const tdiff = team.index === 0 ? diff : -diff;
    const cleanSheet = match.score[1 - team.index] === 0;
    for (const p of team.players) {
      const s = p.matchStats;
      let formNudge = 0;
      if (match._opts?.isCareer && match._opts.trainingFocus && team.index === 0) {
        const focus = match._opts.trainingFocus;
        const coaches = match._opts.coaches || {};
        let matchesFocus = false;
        if (focus === 'Attack' && (p.data.pos === 'FW' || p.data.pos === 'MF')) {
          matchesFocus = true;
        } else if (focus === 'Defense' && (p.data.pos === 'DF' || p.isGK)) {
          matchesFocus = true;
        } else if (focus === 'Fitness') {
          matchesFocus = true;
        } else if (focus === 'Youth' && p.data.age < 22) {
          matchesFocus = true;
        }
        if (matchesFocus) {
          const coachActive = coaches[focus] || (focus === 'Defense' && coaches.Defending) || (focus === 'Attack' && coaches.Attacking);
          formNudge = coachActive ? 0.25 : 0.15;
        }
      }
      let r = 6.0
        + tdiff * 0.2
        + s.goals * 1.2
        + s.assists * 0.7
        + s.shots * 0.08
        + s.tackles * 0.15
        + s.saves * 0.35
        + (p.data.overall - 78) / 40
        + (match.rng() - 0.5) * 0.5
        + formNudge;
      if (p.isGK && cleanSheet) r += 0.7;
      if ((p.data.pos === 'DF' || p.isGK) && cleanSheet) r += 0.3;
      ratings.set(p, Math.round(clamp(r, 4.5, 10) * 10) / 10);
    }
  }
  match._ratings = ratings;
  return ratings;
}

/** Fold a finished match's tracked stats + ratings into season totals (once). */
export function foldSeasonStats(match) {
  if (match._seasonFolded) return;
  match._seasonFolded = true;
  const ratings = computeMatchRatings(match);
  for (const team of match.teams) {
    for (const p of team.players) {
      const sn = p.data.season;
      if (!sn) continue;
      sn.apps++;
      sn.goals += p.matchStats.goals;
      sn.assists += p.matchStats.assists;
      sn.tackles += p.matchStats.tackles;
      sn.saves += p.matchStats.saves;
      sn.matchRatings.push(ratings.get(p) ?? 6);
      if (sn.matchRatings.length > 60) sn.matchRatings.shift();
    }
  }
}
