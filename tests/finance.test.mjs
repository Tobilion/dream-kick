/**
 * Headless V4 Phase A acceptance — club economy.
 * Run from repo root:  node tests/finance.test.mjs
 */
import { CLUBS, wageOf } from '../src/data/teams.js';
import {
  newCareer, migrateCareer, seasonOver, completeRound, endSeason,
  applyCareerToClubs, leaguePosition, CAREER_VERSION,
} from '../src/core/career.js';
import {
  wageBill, matchdayIncome, startingBalance, seasonPrize, initFinance,
} from '../src/core/finance.js';

let failures = 0;
const assert = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) failures++; };

const CLUB_ID = 2;

/* ---- schema: every player has a wage ---- */
assert(CLUBS.every(c => c.squad.every(p => Number.isFinite(p.wage) && p.wage >= 40)),
  'every player has a finite wage >= 40');
const better = CLUBS[0].squad[10], worse = { ...better, overall: better.overall - 20 };
assert(wageOf(better) > wageOf(worse), 'higher overall → higher wage');

/* ---- new career gets a finance block ---- */
let career = newCareer(CLUB_ID);
assert(career.version === 4, 'CAREER_VERSION is 4');
assert(career.finance.balance === startingBalance(CLUBS[CLUB_ID].rating),
  'starting balance derived from club rating');

/* ---- balance changes every matchday by (income − wages) ---- */
let ok = true;
while (!seasonOver(career)) {
  const before = career.finance.balance;
  const wages = wageBill(CLUBS[CLUB_ID].squad);
  completeRound(career, null);
  const { lastIncome } = career.finance;
  if (career.finance.balance !== before + lastIncome - wages) ok = false;
  if (lastIncome <= 0) ok = false;
}
assert(ok, 'balance moves by exactly (income − wages) on all 19 matchdays');
assert(career.finance.log.length === 12, 'finance log capped at 12 entries');

/* ---- prize money lands at endSeason & carries to next season ---- */
const pos = leaguePosition(career);
const balBefore = career.finance.balance;
const { summary, next } = endSeason(career);
assert(summary.prize === seasonPrize(pos), 'summary prize matches position table');
assert(next.finance.balance === balBefore + summary.prize + (summary.forcedSale?.fee || 0),
  'prize money credited and balance carried into next season');
assert(seasonPrize(1) > seasonPrize(10) && seasonPrize(10) > seasonPrize(20),
  'prize table strictly favors higher finishes');

/* ---- migration from a CAREER_VERSION=3 save ---- */
const v3save = { career: { ...newCareer(CLUB_ID), version: 3 } };
delete v3save.career.finance; delete v3save.career.transfers;
const migrated = migrateCareer(v3save);
assert(migrated.version === 4 && migrated.finance &&
  migrated.finance.balance === startingBalance(CLUBS[CLUB_ID].rating),
  'v3 save migrates in place with a valid starting balance');
assert(migrated.week === v3save.career.week && migrated.clubId === CLUB_ID,
  'v3 migration preserves career progress');

/* ---- forced sale triggers in a contrived negative-balance season ---- */
let broke = newCareer(CLUB_ID);
broke.finance.balance = -50000; // deep in the red
const squadBefore = CLUBS[CLUB_ID].squad.map(p => p.id);
const topValue = [...CLUBS[CLUB_ID].squad].filter(p => p.pos !== 'GK')
  .sort((a, b) => b.marketValue - a.marketValue)[0];
while (!seasonOver(broke)) completeRound(broke, null);
const res = endSeason(broke);
assert(res.summary.forcedSale !== null, 'forced sale triggers when balance negative at season end');
assert(res.summary.forcedSale.player === topValue.name && topValue.pos !== 'GK',
  'forced sale picks highest-value non-GK player');
assert(CLUBS[CLUB_ID].squad.length === 18, 'squad backfilled to 18 after forced sale');
assert(!CLUBS[CLUB_ID].squad.some(p => p.id === topValue.id), 'sold player removed from squad');
const youth = CLUBS[CLUB_ID].squad.find(p => p.id.startsWith('yt_'));
assert(youth && youth.age <= 19, 'backfill is a youth player (age <= 19)');
assert(res.next.transfers.length === 1 && res.next.transfers[0].outId === topValue.id,
  'forced sale recorded in career.transfers for boot replay');

/* ---- boot replay: transfers survive applyCareerToClubs ---- */
// simulate fresh boot: restore original squad member, then replay
const club = CLUBS[CLUB_ID];
const yIdx = club.squad.findIndex(p => p.id === youth.id);
club.squad.splice(yIdx, 1, topValue); // pretend deterministic regen restored him
applyCareerToClubs(res.next);
assert(!club.squad.some(p => p.id === topValue.id) && club.squad.some(p => p.id === youth.id),
  'applyCareerToClubs replays the forced sale onto regenerated CLUBS');
assert(club.squad.length === 18, 'squad still 18 after replay');

/* ---- income model sanity ---- */
assert(matchdayIncome(85, true, 'W', 500) > matchdayIncome(85, true, 'L', 500),
  'win pays more than loss');
assert(matchdayIncome(85, true, 'D', 500) > matchdayIncome(70, true, 'D', 500),
  'bigger club → bigger gate');
assert(matchdayIncome(85, true, 'D', 500) > matchdayIncome(85, false, 'D', 500),
  'home gate > away gate');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
