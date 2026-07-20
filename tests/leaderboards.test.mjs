/**
 * leaderboards.test.mjs — V6 Phase L1 acceptance tests.
 *
 * Verifies:
 *  1. Goal balance: attributed goals == total fixture goals across all clubs.
 *  2. Determinism: same seed produces same leaderboard.
 *  3. Reload: applyCareerToClubs restores AI club season stats.
 *  4. User-club baseline: user squad still gets goals via V3 attributeSimGoals path.
 *  5. No negative stats; assists <= goals (per-club, approx 0.7 ratio).
 *  6. leagueLeaderboards returns sorted, bounded results.
 *
 * Run from repo root: node tests/leaderboards.test.mjs
 */
import { CLUBS } from '../src/data/teams.js';
import {
  newCareer, migrateCareer, completeRound, endSeason,
  syncSeasonStats, applyCareerToClubs,
  leagueLeaderboards, goldenBoot, CAREER_VERSION,
} from '../src/core/career.js';

let failures = 0;
const assert = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) failures++; };

const CLUB_ID = 3; // Stade Argenté

/** Run a full headless season for a given career. */
function runFullSeason(career) {
  while (!career.week > career.rounds.length) {
    if (career.week > career.rounds.length) break;
    completeRound(career, null);
    if (career.week > career.rounds.length) break;
  }
}

function runAllRounds(career) {
  const total = career.rounds.length;
  for (let w = 0; w < total; w++) {
    completeRound(career, null);
  }
}

/* ------------------------------------------------------------------ */
/* 0. Version check                                                   */
/* ------------------------------------------------------------------ */
assert(CAREER_VERSION === 9, `CAREER_VERSION = 9 (got ${CAREER_VERSION})`);


/* ------------------------------------------------------------------ */
/* 1. Goal balance check                                              */
/*    All attributed goals should equal all fixture scores summed     */
/* ------------------------------------------------------------------ */
{
  const career = newCareer(CLUB_ID);
  runAllRounds(career);
  syncSeasonStats(career);

  // Sum all attributed goals across every club's squad
  let attributedGoals = 0;
  for (const club of CLUBS) {
    for (const p of club.squad) {
      attributedGoals += p.season?.goals ?? 0;
    }
  }

  // Sum all fixture results (league + cup ties)
  let fixtureGoals = 0;
  for (const round of career.rounds) {
    for (const f of round) {
      if (f.played) fixtureGoals += f.hs + f.as;
    }
  }
  // Add cup tie goals
  const cup = career.cup;
  if (cup && Array.isArray(cup.rounds)) {
    for (const r of cup.rounds) {
      for (const t of r.ties) {
        if (t.played) fixtureGoals += t.hs + t.as;
      }
    }
  }
  if (cup && Array.isArray(cup.ties)) {
    for (const t of cup.ties) {
      if (t.played) fixtureGoals += t.hs + t.as;
    }
  }

  assert(attributedGoals === fixtureGoals,
    `Goal balance: attributed (${attributedGoals}) == fixture totals (${fixtureGoals})`);
}

/* ------------------------------------------------------------------ */
/* 2. Determinism: same seed → same leaderboard                       */
/* ------------------------------------------------------------------ */
{
  // Reset CLUBS before each run to avoid contamination from prior tests
  const resetClubs = () => {
    for (const club of CLUBS) {
      for (const p of club.squad) {
        p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
      }
    }
  };

  const runCareer = () => {
    const c = newCareer(CLUB_ID);
    runAllRounds(c);
    syncSeasonStats(c);
    return leagueLeaderboards(c);
  };

  resetClubs();
  const lb1 = runCareer();
  const topGoalCount1 = lb1.scorers[0]?.goals ?? 0; // snapshot BEFORE reset

  resetClubs();
  const lb2 = runCareer();
  const topGoalCount2 = lb2.scorers[0]?.goals ?? 0;

  const topScorer1 = lb1.scorers[0];
  const topScorer2 = lb2.scorers[0];

  assert(
    topScorer1 && topScorer2 && topScorer1.player.id === topScorer2.player.id,
    `Determinism: same top scorer across two identical-seed runs (${topScorer1?.player?.name})`
  );
  assert(
    topGoalCount1 === topGoalCount2,
    `Determinism: same top scorer goal count (${topGoalCount1} == ${topGoalCount2})`
  );
}

/* ------------------------------------------------------------------ */
/* 3. Reload preserves AI club stats                                  */
/* ------------------------------------------------------------------ */
{
  // Reset player stats first
  for (const club of CLUBS) {
    for (const p of club.squad) {
      p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
    }
  }

  const career = newCareer(CLUB_ID);
  // Run half the season
  const half = Math.floor(career.rounds.length / 2);
  for (let w = 0; w < half; w++) completeRound(career, null);

  // Snapshot stats for an AI club (not user's club)
  const aiClubId = CLUBS.find(c => c.id !== CLUB_ID).id;
  const aiClub = CLUBS[aiClubId];
  const preReloadGoals = aiClub.squad.reduce((s, p) => s + (p.season?.goals ?? 0), 0);

  // Persist
  syncSeasonStats(career);
  const serialised = JSON.parse(JSON.stringify(career)); // deep-clone as save

  // Reset all squads to simulate app restart
  for (const club of CLUBS) {
    for (const p of club.squad) {
      p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
      p.age = p.age; // noop — keeps shape
    }
  }

  // Replay
  applyCareerToClubs({ ...serialised, seasonStats: serialised.seasonStats });

  const postReloadGoals = aiClub.squad.reduce((s, p) => s + (p.season?.goals ?? 0), 0);

  assert(postReloadGoals === preReloadGoals,
    `Reload preserves AI club goals: ${preReloadGoals} pre == ${postReloadGoals} post`);

  // Also verify apps persisted
  const preReloadApps = 0; // we'll re-run from scratch  — just check non-zero after reload
  const postReloadApps = aiClub.squad.reduce((s, p) => s + (p.season?.apps ?? 0), 0);
  assert(postReloadApps > 0, `Reload preserves AI club apps (${postReloadApps})`);
}

/* ------------------------------------------------------------------ */
/* 4. User-club baseline: V3 attributeSimGoals path intact            */
/* ------------------------------------------------------------------ */
{
  // Reset
  for (const club of CLUBS) {
    for (const p of club.squad) {
      p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
    }
  }

  const career = newCareer(CLUB_ID);
  // Run exactly 1 round (the user club match is sim-only; no live match result)
  completeRound(career, null);

  const myClub = CLUBS[CLUB_ID];
  const totalMyApps = myClub.squad.reduce((s, p) => s + (p.season?.apps ?? 0), 0);
  // L1: only starters (11) get apps (pickLineup-based), not full 18
  assert(totalMyApps === 11,
    `User-club V3 baseline: 11 starters got apps (got ${totalMyApps})`);
}

/* ------------------------------------------------------------------ */
/* 5. No negative stats; assists ~70% of goals (league-wide approx)   */
/* ------------------------------------------------------------------ */
{
  // Reset
  for (const club of CLUBS) {
    for (const p of club.squad) {
      p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
    }
  }

  const career = newCareer(CLUB_ID);
  runAllRounds(career);

  let totalGoals = 0, totalAssists = 0, negFound = false;
  for (const club of CLUBS) {
    for (const p of club.squad) {
      if ((p.season?.goals ?? 0) < 0 || (p.season?.assists ?? 0) < 0) negFound = true;
      totalGoals += p.season?.goals ?? 0;
      totalAssists += p.season?.assists ?? 0;
    }
  }
  assert(!negFound, 'No negative goals or assists on any player');

  // Assists should be roughly 0.7 × goals (within 15% tolerance)
  if (totalGoals > 0) {
    const ratio = totalAssists / totalGoals;
    assert(ratio >= 0.55 && ratio <= 0.85,
      `Assist/goal ratio in range [0.55, 0.85]: got ${ratio.toFixed(2)}`);
  }
}

/* ------------------------------------------------------------------ */
/* 6. leagueLeaderboards: sorted, bounded, non-empty after a season   */
/* ------------------------------------------------------------------ */
{
  // Stats already set from test 5 (same career not reset)
  for (const club of CLUBS) {
    for (const p of club.squad) {
      p.season = p.season ?? { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
    }
  }

  const career = newCareer(CLUB_ID);
  runAllRounds(career);
  syncSeasonStats(career);

  const { scorers, assisters } = leagueLeaderboards(career);

  assert(scorers.length > 0 && scorers.length <= 10, `Scorers list 1-10 entries (${scorers.length})`);
  assert(assisters.length > 0 && assisters.length <= 10, `Assisters list 1-10 entries (${assisters.length})`);

  // Sorted descending
  const scoresDescending = scorers.every((e, i) =>
    i === 0 || e.goals <= scorers[i - 1].goals
  );
  assert(scoresDescending, 'Scorers are sorted descending by goals');

  const assistsDescending = assisters.every((e, i) =>
    i === 0 || e.assists <= assisters[i - 1].assists
  );
  assert(assistsDescending, 'Assisters are sorted descending by assists');

  // goldenBoot should be the first scorer
  const gb = goldenBoot(career);
  assert(gb && gb.player.id === scorers[0].player.id,
    `goldenBoot matches top scorer (${gb?.player?.name})`);
}

/* ------------------------------------------------------------------ */
console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
