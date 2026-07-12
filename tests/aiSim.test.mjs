/**
 * Headless Phase B acceptance — 10 seeded AI-vs-AI sims must look like football:
 * 0–5 goals/team, both teams register shots, possession 25–75%, no blob
 * clustering (mean outfielder distance from team centroid ≥ 8m).
 * Run from repo root:  node tests/aiSim.test.mjs
 */
import { Match, MATCH_STATE } from '../src/engine/match.js';
import { CLUBS } from '../src/data/teams.js';

const results = [];
for (let seed = 1; seed <= 10; seed++) {
  const m = new Match({
    homeClub: CLUBS[seed % 20], awayClub: CLUBS[(seed + 7) % 20],
    difficulty: 'pro', halfLength: 150, userTeam: 0, seed, events: {}, aiOnly: true,
  });
  m.go(MATCH_STATE.KICKOFF);
  let frames = 0, spreadSamples = 0, spreadSum = 0;
  while (m.state !== MATCH_STATE.FULL_TIME && frames < 60 * 60 * 16) {
    if (m.state === MATCH_STATE.HALF_TIME) m.resumeFromHalfTime();
    m.update(1 / 60, null);
    frames++;
    if (m.phase === 'OPEN_PLAY' && frames % 120 === 0) {
      for (const t of m.teams) {
        const ps = t.players.filter(p => !p.isGK);
        const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length;
        const cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
        spreadSum += ps.reduce((s, p) => s + Math.hypot(p.pos.x - cx, p.pos.z - cz), 0) / ps.length;
        spreadSamples++;
      }
    }
  }
  results.push({
    seed, score: [...m.score], shots: [...m.stats.shots], pos: m.possessionPct(),
    spread: +(spreadSum / spreadSamples).toFixed(1),
    finished: m.state === MATCH_STATE.FULL_TIME,
  });
}

let fails = 0;
const chk = (c, msg) => { if (!c) { fails++; console.log('FAIL: ' + msg); } };
for (const r of results) {
  console.log(JSON.stringify(r));
  chk(r.finished, `seed ${r.seed} did not finish`);
  chk(r.score[0] <= 5 && r.score[1] <= 5, `seed ${r.seed} goals implausible ${r.score}`);
  chk(r.shots[0] >= 1 && r.shots[1] >= 1, `seed ${r.seed} a team registered no shots ${r.shots}`);
  chk(r.pos[0] >= 25 && r.pos[0] <= 75, `seed ${r.seed} possession lopsided ${r.pos}`);
  chk(r.spread >= 8, `seed ${r.seed} spread too low (blob): ${r.spread}`);
}
console.log(fails === 0 ? '\nACCEPTANCE PASSED' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
