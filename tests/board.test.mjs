/**
 * board.test.mjs — V6 Phase L3 acceptance tests.
 *
 * Verifies:
 *  1. Overachieving raises confidence to Delighted and pays a board bonus at season end.
 *  2. Tanking every match hits Ultimatum confidence level and triggers the sacked path.
 *  3. Board confidence is bounded strictly within [0, 100].
 *  4. Migrations gracefully initialize board state lazily for old careers.
 *
 * Run from repo root: node tests/board.test.mjs
 */
import { CLUBS } from '../src/data/teams.js';
import {
  newCareer, completeRound, syncSeasonStats, endSeason, migrateCareer, userFixture
} from '../src/core/career.js';
import {
  ensureBoardState,
  getConfidenceLabel,
  getConfidenceColor,
  updateBoardConfidence
} from '../src/core/board.js';

let failures = 0;
const assert = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) failures++; };

const CLUB_ID = 0; // London Reds (top rated, starts in Div 1)

/* 1. Migration keeps existing careers & initializes board lazily */
{
  const fakeV7 = {
    career: {
      version: 7,
      clubId: CLUB_ID,
      season: 1,
      week: 1,
      rounds: [],
      history: [],
      playerDev: {},
      seasonStats: {},
      finance: { balance: 5000, sponsor: 500, lastIncome: 0, lastWages: 0, log: [] },
      transfers: [],
      ytSeq: 1,
      market: null,
      boardRequest: { lastWeek: 0, cooldown: 4 }
    }
  };

  const migrated = migrateCareer(fakeV7);
  assert(migrated.version === 9, `Migration bumps version directly to 9 (got ${migrated.version})`);
  assert(migrated.board !== undefined, 'Migration generates board state lazily');
  assert(migrated.board.confidence === 60, 'Initial confidence defaults to 60');
  assert(migrated.board.objectives.length === 2, 'Two board objectives generated (league + cup)');
}

/* 2. Confidence never leaves [0, 100] */
{
  const career = newCareer(CLUB_ID);
  ensureBoardState(career);
  
  career.board.confidence = 98;
  updateBoardConfidence(career, 'league', { outcome: 'W', opponentId: 1 });
  assert(career.board.confidence <= 100, `Confidence capped at 100 (got ${career.board.confidence})`);

  career.board.confidence = 2;
  updateBoardConfidence(career, 'league', { outcome: 'L', opponentId: 1 });
  assert(career.board.confidence >= 0, `Confidence clamped at 0 (got ${career.board.confidence})`);
}

/* 3. Overachieving raises confidence and pays bonus */
{
  const career = newCareer(CLUB_ID);
  
  for (let w = 1; w <= 18; w++) {
    const fx = userFixture(career);
    const isHome = fx.home === career.clubId;
    completeRound(career, isHome ? { hs: 3, as: 0 } : { hs: 0, as: 3 });
  }

  assert(career.board.confidence >= 80, `Overachieving raises confidence to Delighted (got ${career.board.confidence}%)`);
  assert(getConfidenceLabel(career.board.confidence) === 'Delighted', `Confidence label is Delighted (got ${getConfidenceLabel(career.board.confidence)})`);

  const initialBalance = career.finance.balance;
  const { summary, next } = endSeason(career);

  assert(summary.boardBonus > 0, `Board bonus paid out (got ${summary.boardBonus} coins)`);
  assert(next.finance.balance > initialBalance, 'Next season balance is higher due to prizes & bonuses');
  assert(!summary.sacked, 'Manager was not sacked');
}

/* 4. Tanking every match hits Ultimatum and triggers the sack path */
{
  const career = newCareer(CLUB_ID);
  
  for (let w = 1; w <= 18; w++) {
    const fx = userFixture(career);
    const isHome = fx.home === career.clubId;
    completeRound(career, isHome ? { hs: 0, as: 3 } : { hs: 3, as: 0 });
  }

  assert(career.board.confidence < 25, `Tanking lowers confidence to Ultimatum (got ${career.board.confidence}%)`);
  assert(getConfidenceLabel(career.board.confidence) === 'Ultimatum', 'Confidence level is Ultimatum');

  const { summary, next } = endSeason(career);

  assert(summary.sacked, 'Manager was successfully sacked');
  assert(next.clubId === null, 'Next clubId is null to trigger team select');
  assert(next.sackedRestart, 'Next sackedRestart flag is set to true');
  assert(next.history.length === 1, 'Manager career history is preserved');
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
