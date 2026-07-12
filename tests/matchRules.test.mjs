/**
 * Headless Phase A test — goal attribution, side switching, kickoff restarts.
 * Run from the repo root:  node tests/matchRules.test.mjs
 * Engine modules are DOM-free; no build step needed.
 */
import { Match, MATCH_STATE } from '../src/engine/match.js';
import { checkBoundaries } from '../src/engine/rules.js';
import { CLUBS } from '../src/data/teams.js';
import { CONFIG } from '../src/core/config.js';

const HALF_L = CONFIG.PITCH.LENGTH / 2;
let failures = 0;
const assert = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failures++;
};

const mkMatch = () => new Match({
  homeClub: CLUBS[0], awayClub: CLUBS[1],
  difficulty: 'pro', halfLength: 60, userTeam: 0, seed: 7, events: {},
});

/** Step the sim n frames at 60Hz. */
const step = (m, n) => { for (let i = 0; i < n; i++) m.update(1 / 60, null); };

/** Put the ball into the goal mouth at end (+1|-1) and run boundary check. */
const shootIntoEnd = (m, end) => {
  m.phase = 'OPEN_PLAY';
  m.ball.attached = false;
  m.owner = null;
  m.ball.pos.x = end * (HALF_L + 0.5);
  m.ball.pos.y = 0.5;
  m.ball.pos.z = 0;
  return checkBoundaries(m);
};

/* ---------- 1. first-half attribution ---------- */
{
  const m = mkMatch();
  m.go(MATCH_STATE.KICKOFF);
  step(m, 200); // past kickoff delay into FIRST_HALF

  assert(m.attackingDir(0) === 1 && m.attackingDir(1) === -1, 'H1: home attacks +x, away attacks -x');

  let ev = shootIntoEnd(m, +1);
  assert(ev?.type === 'GOAL' && ev.scoringTeam === 0, 'H1: ball in +x goal credits HOME');

  ev = shootIntoEnd(m, -1);
  assert(ev?.type === 'GOAL' && ev.scoringTeam === 1, 'H1: ball in -x goal credits AWAY');
}

/* ---------- 2. post-goal kickoff: no side switch, conceder restarts, centre spot ---------- */
{
  const m = mkMatch();
  m.go(MATCH_STATE.KICKOFF);
  step(m, 200);

  const dirBefore = m.teams[0].attackDir;
  const ev = shootIntoEnd(m, +1);        // home scores
  m.onGoal(ev.scoringTeam);
  assert(m.score[0] === 1 && m.score[1] === 0, 'post-goal: score 1-0 to home');

  // step frame-by-frame until the KICKOFF state is entered, then inspect it
  let reached = false;
  for (let i = 0; i < 60 * 8 && !reached; i++) {
    m.update(1 / 60, null);
    if (m.state === MATCH_STATE.KICKOFF && m.phase === 'KICKOFF') reached = true;
  }
  assert(reached, 'post-goal: reaches kickoff');
  assert(m.kickoffTeam === 1, 'post-goal: CONCEDING team (away) kicks off');
  assert(m.teams[0].attackDir === dirBefore, 'post-goal: sides did NOT switch');
  assert(Math.abs(m.ball.pos.x) < 0.01 && Math.abs(m.ball.pos.z) < 0.01, 'post-goal: ball at centre spot');
  const clockBefore = m.clock;
  step(m, 200); // through kickoff delay back into open play
  assert(m.teams[0].attackDir === dirBefore, 'post-goal: sides still unchanged after restart');
  assert(m.clock >= clockBefore, 'post-goal: clock NOT reset');
}

/* ---------- 3. second half: sides switch exactly once, attribution flips ---------- */
{
  const m = mkMatch();
  m.go(MATCH_STATE.KICKOFF);
  step(m, 200);
  const h1dir = m.teams[0].attackDir;

  m.clock = m.halfLength + 1;            // force half-time
  step(m, 5);
  assert(m.state === MATCH_STATE.HALF_TIME, 'HT reached');
  m.resumeFromHalfTime();
  step(m, 200);                          // SECOND_HALF → KICKOFF → open play

  assert(m.half === 2, 'H2: half=2');
  assert(m.teams[0].attackDir === -h1dir, 'H2: sides switched at half-time');
  assert(m.attackingDir(0) === -1, 'H2: attackingDir source of truth flipped');
  assert(m.kickoffTeam === 1, 'H2: away kicks off the second half');

  // second-half attribution: home now attacks -x
  let ev = shootIntoEnd(m, -1);
  assert(ev?.type === 'GOAL' && ev.scoringTeam === 0, 'H2: ball in -x goal credits HOME');
  ev = shootIntoEnd(m, +1);
  assert(ev?.type === 'GOAL' && ev.scoringTeam === 1, 'H2: ball in +x goal credits AWAY');

  // a second-half goal must not flip sides or reset the clock
  m.onGoal(1);
  const dir2 = m.teams[0].attackDir;
  m.clock = 30;
  step(m, Math.ceil(CONFIG.MATCH.GOAL_CELEBRATION * 60) + 220);
  assert(m.teams[0].attackDir === dir2, 'H2 post-goal: sides unchanged');
  assert(m.clock >= 30, 'H2 post-goal: clock not reset (was the every-goal side-switch bug)');
  assert(m.kickoffTeam === 0, 'H2 post-goal: conceder (home) kicked off');
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
