/**
 * Headless V4 Phase C acceptance — Dream Cup.
 * Format integrity, calendar interleaving (no double-booked matchday),
 * user-played tie with shootout on a draw, elimination stops cup fixtures
 * while the league continues, exactly one champion, season summary carries
 * the cup result. Run from repo root:  node tests/cup.test.mjs
 */
import { CLUBS } from '../src/data/teams.js';
import {
  newCareer, userFixture, completeRound, seasonOver, endSeason, leagueTable,
  div1Clubs, div2Clubs, divTable,
} from '../src/core/career.js';
import {
  ensureCup, cupDue, userCupTie, playCupRound, autoCup, finishCup, shootout,
  cupFinished, userCupLabel, CUP_WEEKS, CUP_ROUND_NAMES, CUP_PRIZE_WINNER,
} from '../src/core/cup.js';
import { makeRng } from '../src/core/math.js';

let failures = 0;
const assert = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) failures++; };

/* ---------- 1. format ---------- */
{
  const career = newCareer(3);
  const cup = ensureCup(career);
  assert(cup.byes.length === 4 && cup.ties.length === 8, 'R1: 4 byes + 8 ties (16 playing)');
  const all = new Set([...cup.byes, ...cup.ties.flatMap(t => [t.home, t.away])]);
  assert(all.size === 20, 'all 20 clubs enter the cup exactly once');
  const ratings = cup.byes.map(id => CLUBS[id].rating);
  const minBye = Math.min(...ratings);
  const maxRest = Math.max(...cup.ties.flatMap(t => [t.home, t.away]).map(id => CLUBS[id].rating));
  assert(minBye >= maxRest, 'season-1 byes go to the 4 highest-rated clubs');
  assert(!cupDue(career), 'cup not due at week 1');
}

/* ---------- 2. full auto season → one champion, valid round chain ---------- */
{
  const career = newCareer(3);
  while (!seasonOver(career)) completeRound(career, null);
  const cup = finishCup(career);
  assert(cupFinished(cup), 'cup concludes within the season');
  assert(Number.isInteger(cup.champion) && CLUBS[cup.champion], 'exactly one champion crowned');
  assert(cup.rounds.length === 5, '5 rounds archived (R1, R2, QF, SF, Final)');
  const sizes = cup.rounds.map(r => r.ties.length);
  assert(String(sizes) === '8,4,4,2,1', `round tie counts 8/4/4/2/1 (got ${sizes})`);
  assert(cup.rounds.every(r => r.ties.every(t => t.played)), 'every tie resolved');
  assert(cup.rounds.every(r => r.ties.every(t => t.hs !== t.as || (t.pen && t.pen[0] !== t.pen[1]))),
    'no unresolved draws — all level ties have a decisive shootout');
  // determinism
  const c2 = newCareer(3);
  while (!seasonOver(c2)) completeRound(c2, null);
  assert(finishCup(c2).champion === cup.champion, 'cup is deterministic for the same season');
}

/* ---------- 3. calendar interleaving: never double-books ---------- */
{
  const career = newCareer(3);
  let league = 0, cupDays = 0;
  let guard = 0;
  while (!seasonOver(career) && guard++ < 60) {
    const fx = userFixture(career);
    if (fx.cup) {
      const wk = career.week;
      playCupRound(career, { hs: fx.home === 3 ? 2 : 0, as: fx.home === 3 ? 0 : 2 }); // user always wins
      cupDays++;
      assert(career.week === wk, `cup matchday does not consume league week (MD${wk})`);
      const fx2 = userFixture(career);
      assert(!fx2?.cup || fx2 !== fx, 'played cup tie is not offered again');
    } else {
      completeRound(career, null);
      league++;
    }
  }
  assert(league === 18, `all 18 league rounds played (got ${league})`);
  assert(cupDays === 5, `user reached the final playing 5 distinct cup matchdays (got ${cupDays})`);
  const cup = career.cup;
  assert(cup.champion === 3 && userCupLabel(career) === 'WINNERS', 'winning every tie makes the user champion');
}

/* ---------- 4. drawn user tie resolves via shootout + prize money ---------- */
{
  const career = newCareer(3);
  while (!userCupTie(career)) completeRound(career, null);
  const balBefore = career.finance.balance;
  const res = playCupRound(career, { hs: 1, as: 1 });
  assert(res.userTie.pen && res.userTie.pen[0] !== res.userTie.pen[1], 'drawn user tie decided on penalties');
  assert(career.finance.balance !== balBefore, 'cup matchday moves the balance (income − wages)');
  // direct shootout sanity
  const [h, a] = shootout(makeRng(42), 80, 74);
  assert(h !== a && h >= 0 && a >= 0, 'shootout always returns a winner');
}

/* ---------- 5. elimination stops cup fixtures, league continues ---------- */
{
  const career = newCareer(3);
  let sawCupAfterOut = false, out = false;
  let guard = 0;
  while (!seasonOver(career) && guard++ < 60) {
    const fx = userFixture(career);
    if (fx.cup) {
      if (out) sawCupAfterOut = true;
      playCupRound(career, { hs: fx.home === 3 ? 0 : 3, as: fx.home === 3 ? 3 : 0 }); // user always loses
      out = true;
    } else completeRound(career, null);
  }
  assert(out && !sawCupAfterOut, 'after elimination the user gets no more cup fixtures');
  assert(seasonOver(career), 'league season still completes after cup elimination');
  const cup = finishCup(career);
  assert(cup.champion !== 3 && Number.isInteger(cup.champion), 'someone else lifts the cup');
  assert(userCupLabel(career).startsWith('OUT IN') || userCupLabel(career) === 'RUNNERS-UP',
    `elimination label is meaningful (${userCupLabel(career)})`);
}

/* ---------- 6. season summary + next-season seeding ---------- */
{
  const career = newCareer(3);
  while (!seasonOver(career)) completeRound(career, null);
  const d1ids = div1Clubs(career);
  const d2ids = div2Clubs(career);
  const d1table = divTable(career, d1ids);
  const d2table = divTable(career, d2ids);
  const allRows = [...d1table, ...d2table].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  const expectedSeeds = allRows.map(r => r.id);
  const { summary, next } = endSeason(career);
  assert(summary.cup && typeof summary.cup.champion === 'string', 'season summary includes cup champion');
  assert(typeof summary.cup.userRun === 'string' && summary.cup.userRun.length > 0, 'summary includes user cup run');
  const h = next.history[next.history.length - 1];
  assert(h.cupChampion === summary.cup.champion, 'history records the cup trophy');
  assert(String(next.cupSeeds) === String(expectedSeeds), 'next-season cup seeds = merged divisions table by points');
  const cup2 = ensureCup(next);
  assert(String(cup2.byes) === String(next.cupSeeds.slice(0, 4)), 'season-2 byes = last season top 4');
}

/* ---------- 7. winner prize credited ---------- */
{
  const career = newCareer(3);
  let guard = 0;
  let balBeforeFinal = null;
  while (!seasonOver(career) && guard++ < 60) {
    const fx = userFixture(career);
    if (fx.cup) {
      const isFinal = career.cup.round === CUP_ROUND_NAMES.length - 1;
      if (isFinal) balBeforeFinal = career.finance.balance;
      playCupRound(career, { hs: fx.home === 3 ? 2 : 0, as: fx.home === 3 ? 0 : 2 });
      if (isFinal) {
        const net = career.finance.log[career.finance.log.length - 1];
        const expected = balBeforeFinal + (net.income - net.wages) + CUP_PRIZE_WINNER;
        assert(career.finance.balance === expected, 'cup winner prize credited on top of final matchday net');
      }
    } else completeRound(career, null);
  }
  assert(balBeforeFinal !== null, 'user reached the final');
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
