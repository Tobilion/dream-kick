/**
 * training.test.mjs — V4 Phase E acceptance tests.
 * Test focus selector growth increases, coach hire/fire wages impact,
 * form nudges in computed match ratings, and maximum focus growth caps.
 * Run from repo root:  node tests/training.test.mjs
 */
import { CLUBS } from '../src/data/teams.js';
import { Match, MATCH_STATE } from '../src/engine/match.js';
import {
  newCareer, migrateCareer, seasonOver, completeRound, endSeason,
  applyCareerToClubs, div1Clubs, div2Clubs, CAREER_VERSION
} from '../src/core/career.js';
import { activeCoachWages, wageBill } from '../src/core/finance.js';
import { computeMatchRatings } from '../src/engine/ratings.js';

let failures = 0;
const assert = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) { failures++; } };

const CLUB_ID = 2; // Rio Ouro

/* ------------------------------------------------------------------ */
/* 1. Coach Wages Hire/Fire Finance Check                            */
/* ------------------------------------------------------------------ */
{
  const career = newCareer(CLUB_ID);
  assert(career.version === CAREER_VERSION, `CAREER_VERSION = ${CAREER_VERSION}`);
  assert(career.coaches.Attacking === false && career.coaches.Defending === false && career.coaches.Fitness === false,
    'new career starts with no coaches hired');
  assert(activeCoachWages(career.coaches) === 0, 'coach wages = 0 initially');

  // Hire 1 coach
  career.coaches.Attacking = true;
  assert(activeCoachWages(career.coaches) === 150, 'wages = 150 after hiring 1 coach');

  // Hire 2 coaches
  career.coaches.Fitness = true;
  assert(activeCoachWages(career.coaches) === 300, 'wages = 300 after hiring 2 coaches');

  // Fire 1 coach
  career.coaches.Attacking = false;
  assert(activeCoachWages(career.coaches) === 150, 'wages = 150 after firing 1 coach');

  // Fire all coaches
  career.coaches.Fitness = false;
  assert(activeCoachWages(career.coaches) === 0, 'wages = 0 after firing all coaches');
}

/* ------------------------------------------------------------------ */
/* 2. CompleteRound Coach Wage Deduction                              */
/* ------------------------------------------------------------------ */
{
  const career = newCareer(CLUB_ID);
  const baseWages = wageBill(CLUBS[CLUB_ID].squad);

  // Hire Defending coach (wage = 150)
  career.coaches.Defending = true;
  career.trainingFocus = 'Defense';

  const balanceBefore = career.finance.balance;
  completeRound(career, null); // simulates 1 round

  // Check ledger entry
  const entry = career.finance.log[career.finance.log.length - 1];
  assert(entry.wages === baseWages + 150, 'wages recorded in ledger includes base + coach wage (150)');
  assert(career.finance.balance === balanceBefore + entry.income - (baseWages + 150),
    'career balance deducted correctly with coach wages');

  // Fire coach and verify wages go back to base
  career.coaches.Defending = false;
  const balanceBefore2 = career.finance.balance;
  completeRound(career, null);
  const entry2 = career.finance.log[career.finance.log.length - 1];
  assert(entry2.wages === baseWages, 'wages recorded in ledger goes back to base after firing coach');
  assert(career.finance.balance === balanceBefore2 + entry2.income - baseWages,
    'career balance deducted correctly without coach wages');
}

/* ------------------------------------------------------------------ */
/* 3. In-Season Match Rating Form Nudges                              */
/* ------------------------------------------------------------------ */
{
  const hClub = CLUBS[CLUB_ID];
  const aClub = CLUBS[0];

  // Test Case A: No focus (control)
  const mControl = new Match({
    homeClub: hClub, awayClub: aClub, difficulty: 'pro',
    halfLength: 60, userTeam: 0, seed: 100, events: {}, aiOnly: true,
    isCareer: true, trainingFocus: 'Defense', coaches: {}
  });
  mControl.go(MATCH_STATE.KICKOFF);
  // Sim a single tick to allow ratings computation
  mControl.update(1/60, null);
  const ratingsControl = computeMatchRatings(mControl);

  // Test Case B: Attack focus (should nudge FWs/MFs)
  const mAttack = new Match({
    homeClub: hClub, awayClub: aClub, difficulty: 'pro',
    halfLength: 60, userTeam: 0, seed: 100, events: {}, aiOnly: true,
    isCareer: true, trainingFocus: 'Attack', coaches: {}
  });
  mAttack.go(MATCH_STATE.KICKOFF);
  mAttack.update(1/60, null);
  const ratingsAttack = computeMatchRatings(mAttack);

  // Test Case C: Attack focus + Attacking Coach (should nudge FWs/MFs more)
  const mAttackCoach = new Match({
    homeClub: hClub, awayClub: aClub, difficulty: 'pro',
    halfLength: 60, userTeam: 0, seed: 100, events: {}, aiOnly: true,
    isCareer: true, trainingFocus: 'Attack', coaches: { Attacking: true }
  });
  mAttackCoach.go(MATCH_STATE.KICKOFF);
  mAttackCoach.update(1/60, null);
  const ratingsAttackCoach = computeMatchRatings(mAttackCoach);

  // Compare home team FW players ratings (user team)
  const homeFWControl = [...ratingsControl.keys()].find(p => p.data.pos === 'FW' && p.team === 0);
  const homeFWAttack = [...ratingsAttack.keys()].find(p => p.data.id === homeFWControl.data.id);
  const homeFWAttackCoach = [...ratingsAttackCoach.keys()].find(p => p.data.id === homeFWControl.data.id);

  const rControl = ratingsControl.get(homeFWControl);
  const rAttack = ratingsAttack.get(homeFWAttack);
  const rAttackCoach = ratingsAttackCoach.get(homeFWAttackCoach);

  assert(rAttack > rControl, `FW match rating boosted by Attack Focus (Focus: ${rAttack} vs Control: ${rControl})`);
  assert(rAttackCoach > rAttack, `FW match rating boosted higher with Attacking Coach (Coach: ${rAttackCoach} vs Focus: ${rAttack})`);
}

/* ------------------------------------------------------------------ */
/* 4. Attribute Growth Comparison & progression caps                  */
/* ------------------------------------------------------------------ */
{
  // Seeded career with Youth Focus (baseline)
  const careerBase = newCareer(CLUB_ID);
  careerBase.trainingFocus = 'Youth';
  for (let w = 0; w < 18; w++) {
    completeRound(careerBase, null);
  }
  const baseResult = endSeason(careerBase);
  const baseNext = baseResult.next;

  // Seeded career with Attack Focus + Attacking Coach
  const careerFocus = newCareer(CLUB_ID);
  careerFocus.trainingFocus = 'Attack';
  careerFocus.coaches.Attacking = true;
  for (let w = 0; w < 18; w++) {
    completeRound(careerFocus, null);
  }
  const focusResult = endSeason(careerFocus);
  const focusNext = focusResult.next;

  // Compare FW / MF players progression
  const baseDevs = baseNext.playerDev;
  const focusDevs = focusNext.playerDev;

  const userClub = CLUBS[CLUB_ID];
  const fwPlayers = userClub.squad.filter(p => p.pos === 'FW');

  let shootDiffCount = 0;
  let cappedCorrectly = true;

  for (const p of fwPlayers) {
    const baseDev = baseDevs[p.id]?.d?.shoot ?? 0;
    const focusDev = focusDevs[p.id]?.d?.shoot ?? 0;

    if (focusDev > baseDev) shootDiffCount++;

    // Cap assertion: Focus progression overall gain vs base progression overall gain must be <= 2
    const baseP = { pos: p.pos, pace: p.pace, shoot: p.shoot, pass: p.pass, dribble: p.dribble, defend: p.defend, physical: p.physical };
    const focusP = { pos: p.pos, pace: p.pace, shoot: p.shoot, pass: p.pass, dribble: p.dribble, defend: p.defend, physical: p.physical };

    for (const k of ['pace', 'shoot', 'pass', 'dribble', 'defend', 'physical']) {
      baseP[k] = baseP[k] + (baseDevs[p.id]?.d?.[k] ?? 0);
      focusP[k] = focusP[k] + (focusDevs[p.id]?.d?.[k] ?? 0);
    }

    const oBase = baseNext.playerDev[p.id]?.overall ?? 75; // Or recalculate overallOf
    // In career.js we calculate overallOf(p) at summer end. Let's verify overall cap
    const focusP_overall = focusNext.playerDev[p.id]?.overall ?? 0;
    const baseP_overall = baseNext.playerDev[p.id]?.overall ?? 0;

    // Difference due to focus must be at most +2 overall points
    if (focusP_overall - baseP_overall > 2) {
      cappedCorrectly = false;
    }
  }

  assert(shootDiffCount > 0, `Forwards show higher shooting growth with Attacking Coach + Attack Focus (${shootDiffCount} players)`);
  assert(cappedCorrectly, 'Max overall growth from focus is correctly capped at <= +2 rating points');
}

/* ------------------------------------------------------------------ */
console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
