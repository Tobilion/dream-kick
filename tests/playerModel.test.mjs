/**
 * Headless Phase C acceptance — player model, tracked stats, ratings, pace.
 * Run from repo root:  node tests/playerModel.test.mjs
 */
import { Match, MATCH_STATE } from '../src/engine/match.js';
import { CLUBS, playerForm } from '../src/data/teams.js';
import { computeMatchRatings } from '../src/engine/ratings.js';
import { PlayerEntity } from '../src/engine/player.js';

let failures = 0;
const assert = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) failures++; };

/* 1. schema */
const p0 = CLUBS[0].squad[0];
assert(typeof p0.id === 'string' && p0.id.startsWith('pl_'), 'players have ids');
assert(p0.age >= 18 && p0.age <= 34, 'players have age');
assert(typeof p0.dribble === 'number', 'players have dribbling attribute');
assert(typeof p0.marketValue === 'number' && p0.marketValue > 0, 'players have market value');
assert(p0.season && p0.season.matchRatings.length === 0, 'players have season stats container');
assert(typeof p0.morale === 'number', 'players have morale');

/* 2. pace feeds the engine: faster attribute → faster max speed */
const fast = new PlayerEntity({ ...p0, pace: 92 }, 0, 1);
const slow = new PlayerEntity({ ...p0, pace: 52 }, 0, 2);
assert(fast.maxSpeed > slow.maxSpeed * 1.15, `pace → speed (${fast.maxSpeed.toFixed(1)} vs ${slow.maxSpeed.toFixed(1)} m/s)`);

/* 3. full sim: tracked stats feed ratings + season totals */
const m = new Match({ homeClub: CLUBS[3], awayClub: CLUBS[10], difficulty: 'pro',
  halfLength: 150, userTeam: 0, seed: 9, events: {}, aiOnly: true });
m.go(MATCH_STATE.KICKOFF);
let frames = 0;
while (m.state !== MATCH_STATE.FULL_TIME && frames++ < 60 * 60 * 16) {
  if (m.state === MATCH_STATE.HALF_TIME) m.resumeFromHalfTime();
  m.update(1 / 60, null);
}
assert(m.state === MATCH_STATE.FULL_TIME, 'sim finished');

const all = m.allPlayers();
const totGoals = all.reduce((s, p) => s + p.matchStats.goals, 0);
const totShots = all.reduce((s, p) => s + p.matchStats.shots, 0);
const totTackles = all.reduce((s, p) => s + p.matchStats.tackles, 0);
assert(totGoals === m.score[0] + m.score[1], `per-player goals (${totGoals}) match scoreboard (${m.score})`);
assert(totShots === m.stats.shots[0] + m.stats.shots[1], `per-player shots (${totShots}) match team stats`);
assert(totTackles === m.stats.tackles[0] + m.stats.tackles[1], 'per-player tackles match team stats');

const ratings = computeMatchRatings(m);
assert(ratings.size === 22, 'all 22 players rated');
const scorer = all.find(p => p.matchStats.goals > 0);
if (scorer) {
  const teamAvg = m.teams[scorer.team].players
    .reduce((s, p) => s + ratings.get(p), 0) / 11;
  assert(ratings.get(scorer) > teamAvg, `scorer rated above team average (${ratings.get(scorer)} > ${teamAvg.toFixed(1)})`);
}
assert(computeMatchRatings(m) === ratings, 'ratings cached (UI and season agree)');

const anyPlayer = all[5];
assert(anyPlayer.data.season.apps === 1, 'season apps incremented at full-time');
assert(anyPlayer.data.season.matchRatings.length === 1, 'season match rating recorded');
assert(playerForm(anyPlayer.data) === anyPlayer.data.season.matchRatings[0], 'form = avg of last ratings');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
