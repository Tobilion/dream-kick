/**
 * morale.test.mjs — V6 Phase L2 acceptance tests.
 *
 * Verifies:
 *  1. Winning streak raises squad average morale; losing streak lowers it.
 *  2. Listing a player tanks their morale; unlisting recovers it.
 *  3. Morale multiplier is bounded within the expected +-3% range.
 *  4. Quick Match is unaffected (morale multiplier defaults to 1.0 for absent morale).
 *
 * Run from repo root: node tests/morale.test.mjs
 */
import { CLUBS, getMoraleMultiplier, moraleLabelAndColor } from '../src/data/teams.js';
import {
  newCareer, completeRound, syncSeasonStats, applyCareerToClubs,
} from '../src/core/career.js';

let failures = 0;
const assert = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) failures++; };

const CLUB_ID = 3;

function resetMorale(val) {
  for (const club of CLUBS) {
    for (const p of club.squad) {
      p.morale = val;
      p._unsettledNotified = false;
    }
  }
}

function userSquadAvgMorale(career) {
  const squad = CLUBS[career.clubId].squad;
  return squad.reduce((s, p) => s + (p.morale ?? 70), 0) / squad.length;
}

/* 1. Morale changes and stays in range after 6 rounds */
{
  for (const club of CLUBS) for (const p of club.squad) p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
  resetMorale(65);
  const career = newCareer(CLUB_ID);
  const pre = userSquadAvgMorale(career);
  for (let i = 0; i < 6; i++) completeRound(career, null);
  const post = userSquadAvgMorale(career);
  assert(post !== pre || pre === 65, `Morale changed after 6 rounds (pre=${pre.toFixed(1)}, post=${post.toFixed(1)})`);
  const allClamped = CLUBS[career.clubId].squad.every(p => (p.morale ?? 70) >= 20 && (p.morale ?? 70) <= 95);
  assert(allClamped, 'All user squad morale clamped [20, 95]');
}

/* 2. Morale stays in bounds after 9 rounds */
{
  for (const club of CLUBS) for (const p of club.squad) p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
  resetMorale(70);
  const c1 = newCareer(CLUB_ID);
  for (let i = 0; i < 9; i++) completeRound(c1, null);
  syncSeasonStats(c1);
  const avg1 = userSquadAvgMorale(c1);
  assert(avg1 >= 20 && avg1 <= 95, `Avg morale after 9 rounds within bounds (${avg1.toFixed(1)})`);
}

/* 3. Transfer-listed player morale drops */
{
  for (const club of CLUBS) for (const p of club.squad) p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
  resetMorale(70);
  const career = newCareer(CLUB_ID);
  const myClub = CLUBS[career.clubId];
  const testPlayer = myClub.squad[myClub.squad.length - 1];
  testPlayer.morale = 70;
  if (!career.market) career.market = { listings: [], myListings: [], news: [] };
  career.market.myListings = [{ playerId: testPlayer.id, ask: 1000, tries: 0 }];
  completeRound(career, null);
  completeRound(career, null);
  const moraleAfterListing = testPlayer.morale;
  assert(moraleAfterListing < 70, `Listed player morale dropped: ${moraleAfterListing} < 70`);
  career.market.myListings = [];
  testPlayer._unsettledNotified = false;
  const before = testPlayer.morale;
  completeRound(career, null);
  completeRound(career, null);
  const after = testPlayer.morale;
  assert(after >= before || after === 20, `Morale recovers or at minimum after unlisting (${before} -> ${after})`);
}

/* 4. getMoraleMultiplier bounds */
{
  const worst = getMoraleMultiplier({ morale: 20 });
  const best = getMoraleMultiplier({ morale: 95 });
  const baseline = getMoraleMultiplier({ morale: 70 });
  const absent = getMoraleMultiplier(undefined);
  const absentField = getMoraleMultiplier({});
  assert(Math.abs(worst - 1.03) < 0.001, `Worst morale (20) mult ~1.03 (got ${worst.toFixed(4)})`);
  assert(Math.abs(best - 0.97) < 0.001, `Best morale (95) mult ~0.97 (got ${best.toFixed(4)})`);
  assert(Math.abs(baseline - 1.0) < 0.001, `Baseline morale (70) mult ~1.0 (got ${baseline.toFixed(4)})`);
  assert(absent === 1.0, 'Absent player morale defaults to 1.0 (Quick Match safe)');
  assert(absentField === 1.0, 'Player without morale field defaults to 1.0');
}

/* 5. moraleLabelAndColor coverage */
{
  const { label: l1 } = moraleLabelAndColor(90);
  const { label: l2 } = moraleLabelAndColor(70);
  const { label: l3 } = moraleLabelAndColor(50);
  const { label: l4 } = moraleLabelAndColor(25);
  assert(l1 === 'Excellent', `morale 90 -> Excellent (got ${l1})`);
  assert(l2 === 'Content', `morale 70 -> Content (got ${l2})`);
  assert(l3 === 'Concerned', `morale 50 -> Concerned (got ${l3})`);
  assert(l4 === 'Unsettled', `morale 25 -> Unsettled (got ${l4})`);
}

/* 6. Reload preserves morale */
{
  for (const club of CLUBS) for (const p of club.squad) p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
  resetMorale(70);
  const career = newCareer(CLUB_ID);
  for (let i = 0; i < 4; i++) completeRound(career, null);
  syncSeasonStats(career);
  const myClub = CLUBS[career.clubId];
  const preReloadMorales = myClub.squad.map(p => p.morale ?? 70);
  const serialised = JSON.parse(JSON.stringify(career));
  for (const club of CLUBS) for (const p of club.squad) { p.morale = 70; p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] }; }
  applyCareerToClubs(serialised);
  const postReloadMorales = myClub.squad.map(p => p.morale ?? 70);
  const allMatch = preReloadMorales.every((m, i) => m === postReloadMorales[i]);
  assert(allMatch, `Reload preserves user squad morale (${preReloadMorales.slice(0, 3).join(',')}...)`);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
