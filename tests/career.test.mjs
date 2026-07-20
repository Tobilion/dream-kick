/**
 * Headless Phase D acceptance — career mode.
 * Play 2 fixtures (real engine) + sim 3, table integrity, reload persistence,
 * full season → rollover with player progression.
 * Run from repo root:  node tests/career.test.mjs
 */
import { Match, MATCH_STATE } from '../src/engine/match.js';
import { CLUBS } from '../src/data/teams.js';
import {
  newCareer, migrateCareer, seasonOver, userFixture, leagueTable, leaguePosition,
  teamFormLetters, topScorer, totalRounds, completeRound, syncSeasonStats,
  applyCareerToClubs, endSeason, CAREER_VERSION,
} from '../src/core/career.js';

let failures = 0;
const assert = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) failures++; };

const CLUB_ID = 2;
let career = newCareer(CLUB_ID);

assert(totalRounds(career) === 18, '18 rounds (double round-robin of 10)');
const seen = new Set();
for (const r of career.rounds) for (const f of r) {
  if (f.home === CLUB_ID) seen.add(f.away);
  if (f.away === CLUB_ID) seen.add(f.home);
}
assert(seen.size === 9, 'user faces all 9 other clubs in their division');

/* play 2 fixtures with the REAL engine */
for (let i = 0; i < 2; i++) {
  const fx = userFixture(career);
  const opp = CLUBS[fx.home === CLUB_ID ? fx.away : fx.home];
  const m = new Match({ homeClub: CLUBS[CLUB_ID], awayClub: opp, difficulty: 'pro',
    halfLength: 60, userTeam: 0, seed: 100 + i, events: {}, aiOnly: true });
  m.go(MATCH_STATE.KICKOFF);
  let frames = 0;
  while (m.state !== MATCH_STATE.FULL_TIME && frames++ < 60 * 60 * 8) {
    if (m.state === MATCH_STATE.HALF_TIME) m.resumeFromHalfTime();
    m.update(1 / 60, null);
  }
  const iAmHome = fx.home === CLUB_ID;
  completeRound(career, iAmHome ? { hs: m.score[0], as: m.score[1] } : { hs: m.score[1], as: m.score[0] });
  syncSeasonStats(career);
}
assert(career.week === 3, 'week advanced to 3 after playing 2');

/* sim 3 fixtures */
for (let i = 0; i < 3; i++) completeRound(career, null);
syncSeasonStats(career);
assert(career.week === 6, 'week advanced to 6 after simming 3');

/* table integrity */
let table = leagueTable(career);
assert(table.every(r => r.pld === 5), 'every club has played 5');
const ptsOk = table.every(r => r.pts === r.w * 3 + r.d);
assert(ptsOk, 'points = 3W + D for all clubs');
assert(teamFormLetters(career).length === 5, 'form shows last 5');
assert(leaguePosition(career) >= 1 && leaguePosition(career) <= 20, 'user has a league position');

/* reload persistence: serialize → migrate → apply */
const save = { career: JSON.parse(JSON.stringify(career)) };
const reloaded = migrateCareer(save);
assert(reloaded.version === CAREER_VERSION && reloaded.week === 6, 'reload keeps week + version');
applyCareerToClubs(reloaded);
assert(leagueTable(reloaded).every(r => r.pld === 5), 'reload keeps table');
const ts = topScorer(reloaded);
assert(!!ts, 'top scorer resolvable after reload');

/* finish the season + rollover */
while (!seasonOver(reloaded)) completeRound(reloaded, null);
assert(seasonOver(reloaded), 'season completes');
table = leagueTable(reloaded);
assert(table.every(r => r.pld === 18), 'all clubs played 18 at season end');

const youngster = CLUBS.flatMap(c => c.squad).find(p => p.age < 22);
const before = { age: youngster.age, sum: youngster.pace + youngster.shoot + youngster.pass };
const { summary, next } = endSeason(reloaded);
assert(!!summary.champion && summary.position >= 1, `summary: champion=${summary.champion}, pos=${summary.position}`);
assert(next.season === 2 && next.week === 1 && !seasonOver(next), 'next season starts fresh');
assert(youngster.age === before.age + 1, 'players age at season end');
const after = youngster.pace + youngster.shoot + youngster.pass;
assert(after !== before.sum, 'young player attributes drifted');
assert(youngster.season.goals === 0 && youngster.season.apps === 0, 'season stats reset');
assert(Object.keys(next.playerDev).length > 0, 'development deltas persisted for reload');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
