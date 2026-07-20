/**
 * cup.js — V4 Phase C: knockout Dream Cup running alongside the league (DOM-free).
 * 20 clubs: top-4 seeds get first-round byes, 16 play Round 1 (8 ties);
 * the 12 survivors reduce via a second 4-bye round to 8 → QF → SF → Final.
 * Rounds fall before league matchdays CUP_WEEKS[r]; draws go straight to a
 * seeded penalty shootout. Additive to CAREER_VERSION 4: career.cup is lazy.
 * One-directional import: career.js imports cup.js, never the reverse.
 */
import { CLUBS } from '../data/teams.js';
import { makeRng, clamp } from './math.js';
import { wageBill, applyMatchday } from './finance.js';
import { updateBoardConfidence, refreshObjectiveProgress } from './board.js';


export const CUP_WEEKS = [4, 8, 12, 15, 18]; // round r due before league week CUP_WEEKS[r]
export const CUP_ROUND_NAMES = ['ROUND 1', 'ROUND 2', 'QUARTER-FINAL', 'SEMI-FINAL', 'FINAL'];
export const CUP_PRIZE_WINNER = 8000;
export const CUP_PRIZE_RUNNER_UP = 3000;

/* ---------------- setup ---------------- */

function seedOrder(career) {
  if (Array.isArray(career.cupSeeds) && career.cupSeeds.length === CLUBS.length) {
    return career.cupSeeds.map(Number);
  }
  return [...CLUBS].sort((a, b) => b.rating - a.rating).map(c => c.id);
}

/** Pair entrants (already seed-ordered): best vs worst, higher seed at home. */
function pairTies(entrants) {
  const ties = [];
  for (let i = 0; i < entrants.length / 2; i++) {
    ties.push({
      home: entrants[i], away: entrants[entrants.length - 1 - i],
      played: false, hs: 0, as: 0, pen: null, cup: true,
    });
  }
  return ties;
}

export function ensureCup(career) {
  if (career.cup) return career.cup;
  const seeds = seedOrder(career);
  career.cup = {
    seeds,
    round: 0,                          // 0..4; 5 ⇒ finished
    byes: seeds.slice(0, 4),
    ties: pairTies(seeds.slice(4)),    // 16 → 8 ties
    rounds: [],                        // archive: [{name, ties, byes}]
    champion: null,
    userOut: null,                     // round index the user was knocked out in
  };
  return career.cup;
}

export function cupFinished(cup) { return cup.round >= CUP_ROUND_NAMES.length; }

/** Is the current cup round due to be played (calendar-wise)? */
export function cupDue(career) {
  const cup = ensureCup(career);
  return !cupFinished(cup) && career.week >= CUP_WEEKS[cup.round];
}

/** The user's unplayed tie in the current round, if it is due. Null otherwise. */
export function userCupTie(career) {
  if (!cupDue(career)) return null;
  const me = career.clubId;
  return career.cup.ties.find(t => !t.played && (t.home === me || t.away === me)) || null;
}

/* ---------------- simulation ---------------- */

function quickSim(rng, homeClub, awayClub) {
  const hr = Number.isFinite(homeClub?.rating) ? homeClub.rating : 75;
  const ar = Number.isFinite(awayClub?.rating) ? awayClub.rating : 75;
  const edge = (hr - ar) * 0.06 + 0.25;
  const hExp = clamp(1.35 + edge, 0.3, 3.4);
  const aExp = clamp(1.1 - edge, 0.25, 3.2);
  const draw = (exp) => { let g = 0; for (let i = 0; i < 5; i++) if (rng() < exp / 5) g++; return g; };
  return [draw(hExp), draw(aExp)];
}

/** Seeded shootout: 5 kicks each then sudden death. Returns [homePens, awayPens]. */
export function shootout(rng, homeRating, awayRating) {
  const pc = r => clamp(0.72 + (r - 75) * 0.004, 0.55, 0.9);
  const ph = pc(homeRating), pa = pc(awayRating);
  let h = 0, a = 0;
  for (let k = 0; k < 5; k++) {
    if (rng() < ph) h++;
    if (rng() < pa) a++;
    // early decision (remaining kicks can't level)
    const left = 4 - k;
    if (h > a + left || a > h + left) return [h, a];
  }
  for (let k = 0; k < 30 && h === a; k++) {
    if (rng() < ph) h++;
    if (rng() < pa) a++;
  }
  if (h === a) h++; // hard stop: home edges it
  return [h, a];
}

function tieWinner(t) {
  if (t.hs !== t.as) return t.hs > t.as ? t.home : t.away;
  return t.pen[0] > t.pen[1] ? t.home : t.away;
}

/**
 * Resolve the CURRENT cup round: the user's tie takes `userResult`
 * ({hs,as} in home/away order) when given, everything else is quick-simmed.
 * Draws (including the user's) resolve by seeded shootout. Advances the round,
 * crowns the champion after the final and credits user prize money.
 * Returns {roundName, userTie|null, finished, champion}.
 */
export function playCupRound(career, userResult = null, attributeCallback = null) {
  const cup = ensureCup(career);
  if (cupFinished(cup)) return null;
  const rng = makeRng(0xc0b + (Number(career.season) || 1) * 733 + cup.round * 97);
  const me = career.clubId;
  let userTie = null;

  for (const t of cup.ties) {
    if (t.played) continue;
    const isUser = t.home === me || t.away === me;
    if (isUser && userResult) { t.hs = userResult.hs; t.as = userResult.as; }
    else [t.hs, t.as] = quickSim(rng, CLUBS[t.home], CLUBS[t.away]);
    if (t.hs === t.as) t.pen = shootout(rng, CLUBS[t.home].rating, CLUBS[t.away].rating);
    t.played = true;
    if (isUser) userTie = t;

    if (attributeCallback) {
      attributeCallback(t, isUser && userResult !== null);
    }
  }

  // user finance: a played/simmed cup tie is a matchday (income − wages)
  if (userTie && career.finance) {
    const isHome = userTie.home === me;
    applyMatchday(career.finance, {
      week: career.week,
      rating: CLUBS[me].rating,
      isHome,
      result: tieWinner(userTie) === me ? 'W' : 'L',
      wages: wageBill(CLUBS[me].squad),
    });
  }
  if (userTie && tieWinner(userTie) !== me) cup.userOut = cup.round;

  if (userTie) {
    const won = tieWinner(userTie) === me;
    const exited = !won;
    updateBoardConfidence(career, 'cup', { outcome: won ? 'W' : 'L', exited });
    refreshObjectiveProgress(career);
  }

  const winners = cup.ties.map(tieWinner);

  cup.rounds.push({ name: CUP_ROUND_NAMES[cup.round], ties: cup.ties, byes: cup.byes });
  const roundName = CUP_ROUND_NAMES[cup.round];
  cup.round++;

  if (cup.round >= CUP_ROUND_NAMES.length) {
    cup.champion = winners[0];
    cup.ties = []; cup.byes = [];
    if (career.finance) {
      if (cup.champion === me) career.finance.balance += CUP_PRIZE_WINNER;
      else if (cup.userOut === CUP_ROUND_NAMES.length - 1) career.finance.balance += CUP_PRIZE_RUNNER_UP;
    }
    if (career.market?.news) {
      career.market.news.unshift({ week: career.week, text: `${CLUBS[cup.champion].name} win the Dream Cup!` });
    }
  } else {
    // next round entrants: winners + byes, seed order; a 12-club round re-byes the top 4
    const order = new Map(cup.seeds.map((id, i) => [id, i]));
    const entrants = [...winners, ...cup.byes].sort((a, b) => order.get(a) - order.get(b));
    if (entrants.length === 12) {
      cup.byes = entrants.slice(0, 4);
      cup.ties = pairTies(entrants.slice(4));
    } else {
      cup.byes = [];
      cup.ties = pairTies(entrants);
    }
  }
  return { roundName, userTie, finished: cupFinished(cup), champion: cup.champion };
}

/**
 * Auto-resolve every due round the user is NOT playing in (eliminated, or on a
 * bye). Stops at a round with a pending user tie — that's a user matchday.
 */
export function autoCup(career, attributeCallback = null) {
  let guard = 0;
  while (cupDue(career) && !userCupTie(career) && guard++ < 8) playCupRound(career, null, attributeCallback);
}

/** Force the cup to a conclusion (season-end safety). */
export function finishCup(career, attributeCallback = null) {
  const cup = ensureCup(career);
  let guard = 0;
  while (!cupFinished(cup) && guard++ < 8) playCupRound(career, null, attributeCallback);
  return cup;
}


/** User's cup run label for summaries. */
export function userCupLabel(career) {
  const cup = ensureCup(career);
  if (cup.champion === career.clubId) return 'WINNERS';
  if (cup.userOut === CUP_ROUND_NAMES.length - 1) return 'RUNNERS-UP';
  if (cup.userOut !== null) return `OUT IN ${CUP_ROUND_NAMES[cup.userOut]}`;
  return cupFinished(cup) ? '—' : CUP_ROUND_NAMES[cup.round];
}
