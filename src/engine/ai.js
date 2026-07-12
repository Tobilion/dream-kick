/**
 * ai.js — V3 Phase B off-ball & on-ball AI (PlayerAI).
 * - Formation-anchored positioning; forwards make depth runs in possession,
 *   everyone recovers shape when defending.
 * - Nearest defender presses the carrier, second-nearest covers the most
 *   dangerous passing lane, the rest hold goal-side shape.
 * - On the ball the AI weighs safe pass / forward pass / dribble / shoot /
 *   clear and executes through the SAME PassingSystem/ShootingSystem as the
 *   user (via match.aiPass/aiShoot/aiClear — one code path, no AI physics).
 * - All randomness comes from match.rng (seeded, reproducible sims).
 * - Difficulty scales decision rate (diff.decision), press count (diff.press)
 *   and decision QUALITY (diff.quality: chance of picking the best option).
 */
import { CONFIG } from '../core/config.js';
import { clamp, dist2, norm2, pointSegDist } from '../core/math.js';
import { PassingSystem } from './passingSystem.js';

const AI = CONFIG.AI, P = CONFIG.PLAYER, PITCH = CONFIG.PITCH;
const HALF_L = PITCH.LENGTH / 2, HALF_W = PITCH.WIDTH / 2;

/** Main per-tick AI driver. Controls every player not controlled by the user. */
export function updateAI(match, dt) {
  const diff = match.diffParams;
  for (const team of match.teams) {
    for (const pl of team.players) {
      if (!match._opts?.aiOnly && pl === match.controlled && match.phase === 'OPEN_PLAY') continue;
      pl.aiTimer -= dt;
      if (pl.aiTimer > 0) continue;
      pl.aiTimer = AI.DECISION_INTERVAL * (0.7 + match.rng() * 0.6) *
        (team.index === match.userTeam ? 1 : diff.decision);
      decide(match, team, pl);
    }
  }
}

function decide(match, team, pl) {
  if (pl.busy || pl.isGK) return; // goalkeeper.js drives keepers

  const owner = match.owner;
  const myBall = owner && owner.team === team.index;

  if (owner === pl) { onBall(match, team, pl); return; }
  if (myBall || (!owner && match.ball.lastTeam === team.index)) {
    offBallAttack(match, team, pl);
  } else {
    offBallDefend(match, team, pl);
  }
}

/* ================= on-ball: utility decision ================= */

function onBall(match, team, pl) {
  const diff = match.diffParams;
  const quality = diff.quality ?? 0.85;
  const goalX = team.goalX;
  const dGoal = dist2(pl.pos.x, pl.pos.z, goalX, 0);
  const pressure = PassingSystem.pressure(match, pl);

  // candidate actions, each scored 0..~2
  const options = [];

  // SHOOT — in range it must genuinely compete with passing, and close to
  // goal it becomes the default (teams were finishing matches with 0 shots)
  const angle = shootAngle(pl, goalX);
  if (dGoal < AI.SHOOT_RANGE) {
    let s = 0.55
      + (pl.data.shoot / 100) * (1 - dGoal / AI.SHOOT_RANGE) * 1.6
      + clamp(angle / 0.6, 0, 0.5)
      - pressure * 0.3;
    if (dGoal < 14) s += 0.5; // inside the box: shoot
    options.push({ score: s, run: () => match.aiShoot(pl) });
  }

  // CLEAR (deep in own third and closed down)
  const ownGoalDist = dist2(pl.pos.x, pl.pos.z, team.ownGoalX, 0);
  if (ownGoalDist < 24) {
    options.push({
      score: 0.35 + pressure * 1.1 + (22 - ownGoalDist) / 30,
      run: () => match.aiClear(pl),
    });
  }

  // PASSES: best forward option and best safe option scored separately
  const passes = scoredPasses(match, team, pl);
  if (passes.forward) {
    // damp pass appeal in shooting range so build-up converts into shots
    const inRange = dGoal < AI.SHOOT_RANGE ? 0.55 : 1;
    options.push({
      score: (0.5 + passes.forward.score + pressure * 0.35) * inRange,
      run: () => match.aiPass(pl, passes.forward.mate, passes.forward.through),
    });
  }
  if (passes.safe) {
    options.push({
      score: 0.35 + passes.safe.score * 0.6 + pressure * 0.55,
      run: () => match.aiPass(pl, passes.safe.mate, false),
    });
  }

  // DRIBBLE
  const dribble = dribbleQuality(match, team, pl);
  options.push({
    score: 0.45 + dribble - pressure * 0.5,
    run: () => {
      const dir = dribbleDirection(match, team, pl);
      pl.setMove(dir.x, dir.z, 1, pressure < 0.4 && pl.stamina > 25);
    },
  });

  options.sort((a, b) => b.score - a.score);
  // decision quality: weaker difficulties sometimes take the 2nd-best option
  const pick = (options.length > 1 && match.rng() > quality) ? options[1] : options[0];
  pick.run();
}

function shootAngle(pl, goalX) {
  const a1 = Math.atan2(-PITCH.GOAL_WIDTH / 2 - pl.pos.z, goalX - pl.pos.x);
  const a2 = Math.atan2(PITCH.GOAL_WIDTH / 2 - pl.pos.z, goalX - pl.pos.x);
  return Math.abs(a2 - a1);
}

/** Score teammates; return best forward and best safe (non-forward) options. */
function scoredPasses(match, team, pl) {
  const opp = match.teams[1 - team.index];
  let forward = null, safe = null;
  for (const mate of team.players) {
    if (mate === pl || mate.busy || mate.isGK) continue;
    const d = dist2(pl.pos.x, pl.pos.z, mate.pos.x, mate.pos.z);
    if (d < 4 || d > 42) continue;

    let lane = 99, space = 99;
    for (const o of opp.players) {
      lane = Math.min(lane, pointSegDist(o.pos.x, o.pos.z, pl.pos.x, pl.pos.z, mate.pos.x, mate.pos.z));
      space = Math.min(space, dist2(mate.pos.x, mate.pos.z, o.pos.x, o.pos.z));
    }
    const advance = (mate.pos.x - pl.pos.x) * team.attackDir; // meters forward
    const score = clamp(lane / AI.PASS_OPENNESS_LANE, 0, 1.5) * 0.45
      + clamp(space / 9, 0, 1) * 0.4
      + clamp(advance / 40, -0.4, 0.6)
      + (d > 30 ? -0.2 : 0);
    const entry = { mate, score, through: advance > 12 && space > 6 && mate.data.pos === 'FW' };

    if (advance > 3) { if (!forward || score > forward.score) forward = entry; }
    else { if (!safe || score > safe.score) safe = entry; }
  }
  return { forward, safe };
}

function dribbleQuality(match, team, pl) {
  const dir = norm2(team.goalX - pl.pos.x, -pl.pos.z * 0.3);
  const aheadX = pl.pos.x + dir.x * 7, aheadZ = pl.pos.z + dir.z * 7;
  let space = 99;
  for (const o of match.teams[1 - team.index].players) {
    space = Math.min(space, dist2(aheadX, aheadZ, o.pos.x, o.pos.z));
  }
  return clamp(space / 9, 0, 1) * 0.7 + (pl.data.pace / 100) * 0.25;
}

function dribbleDirection(match, team, pl) {
  const target = { x: team.goalX * 0.94, z: clamp(pl.pos.z * 0.6, -HALF_W * 0.7, HALF_W * 0.7) };
  let dx = target.x - pl.pos.x, dz = target.z - pl.pos.z;
  const opp = match.teams[1 - team.index];
  let nearest = null, nd = 6;
  for (const o of opp.players) {
    const d = dist2(pl.pos.x, pl.pos.z, o.pos.x, o.pos.z);
    if (d < nd && (o.pos.x - pl.pos.x) * team.attackDir > -1) { nd = d; nearest = o; }
  }
  if (nearest) {
    const side = Math.sign(pl.pos.z - nearest.pos.z) || (match.rng() < 0.5 ? 1 : -1);
    dz += side * (6 - nd) * 2.2;
  }
  return norm2(dx, dz);
}

/* ================= off-ball: attacking shape & runs ================= */

function offBallAttack(match, team, pl) {
  const ball = match.ball;
  const anchor = team.anchor(pl.idx, ball.pos.x, ball.pos.z, true);

  // loose ball nearby? only the single closest teammate chases
  if (!match.owner) {
    const d = dist2(pl.pos.x, pl.pos.z, ball.pos.x, ball.pos.z);
    if (d < 12 && teamRankToBall(team, pl, ball) === 0) { chase(pl, ball, true); return; }
  }

  // forwards make depth runs beyond the line when the ball is advanced
  if (pl.data.pos === 'FW' && (ball.pos.x * team.attackDir) > 6) {
    anchor.x += AI.RUN_BEYOND * team.attackDir * 0.7;
    anchor.x = clamp(anchor.x, -HALF_L + 1, HALF_L - 1);
  }

  // the nearest midfielder offers a short support option toward the carrier
  if (match.owner && pl.data.pos === 'MF' && teamRankToBall(team, pl, ball) === 0) {
    anchor.x = (anchor.x + ball.pos.x - 6 * team.attackDir) / 2;
    anchor.z = (anchor.z + ball.pos.z) / 2;
  }

  seek(pl, anchor.x, anchor.z, 0.9, false);
}

/* ================= off-ball: press, cover, recover ================= */

function offBallDefend(match, team, pl) {
  const ball = match.ball;
  const diff = match.diffParams;
  const ballDist = dist2(pl.pos.x, pl.pos.z, ball.pos.x, ball.pos.z);
  const rank = teamRankToBall(team, pl, ball);

  const pressMult = team.pressingIntensity === 'high' ? 1.35 : team.pressingIntensity === 'low' ? 0.7 : 1;
  const pressers = Math.max(1, Math.round(AI.PRESSERS * pressMult *
    (team.index === match.userTeam ? 1 : diff.press)));

  // 1) presser(s): close down the carrier, tackle in range
  if (rank < pressers && ballDist < AI.PRESS_RADIUS * pressMult) {
    chase(pl, ball, ballDist < 12);
    const owner = match.owner;
    if (owner && owner.team !== team.index && ballDist < P.TACKLE_RANGE * 1.1 && !pl.busy) {
      match.aiTackle(pl); // contest w/ re-tackle cooldown lives in PossessionSystem
    }
    return;
  }

  // 2) lane coverer: next-closest sits in the most dangerous passing lane
  if (rank === pressers && match.owner && ballDist < AI.PRESS_RADIUS * 1.4) {
    const danger = mostDangerousTarget(match, team);
    if (danger) {
      // stand goal-side on the carrier→target line
      const mx = ball.pos.x + (danger.pos.x - ball.pos.x) * 0.45;
      const mz = ball.pos.z + (danger.pos.z - ball.pos.z) * 0.45;
      seek(pl, mx, mz, 1, ballDist > 14);
      return;
    }
  }

  // 3) everyone else recovers defensive shape (anchor is already goal-side)
  const anchor = team.anchor(pl.idx, ball.pos.x, ball.pos.z, false);
  seek(pl, anchor.x, anchor.z, 0.85, ballDist < 20 && pl.stamina > 40);
}

/** Opponent most likely to receive a dangerous pass: most advanced with space. */
function mostDangerousTarget(match, team) {
  const opp = match.teams[1 - team.index];
  let best = null, bs = -1e9;
  for (const o of opp.players) {
    if (o === match.owner || o.isGK) continue;
    const advance = o.pos.x * opp.attackDir;
    let space = 99;
    for (const d of team.players) space = Math.min(space, dist2(o.pos.x, o.pos.z, d.pos.x, d.pos.z));
    const s = advance / HALF_L + clamp(space / 10, 0, 1) * 0.6;
    if (s > bs) { bs = s; best = o; }
  }
  return best;
}

/* ================= shared helpers ================= */

function teamRankToBall(team, pl, ball) {
  const d0 = dist2(pl.pos.x, pl.pos.z, ball.pos.x, ball.pos.z);
  let rank = 0;
  for (const o of team.players) {
    if (o === pl || o.isGK || o.busy) continue;
    if (dist2(o.pos.x, o.pos.z, ball.pos.x, ball.pos.z) < d0) rank++;
  }
  return rank;
}

function chase(pl, ball, sprint) {
  const tx = ball.pos.x + ball.vel.x * 0.25;
  const tz = ball.pos.z + ball.vel.z * 0.25;
  const dir = norm2(tx - pl.pos.x, tz - pl.pos.z);
  pl.setMove(dir.x, dir.z, 1, sprint && pl.stamina > 15);
}

function seek(pl, x, z, mag, sprint) {
  const d = dist2(pl.pos.x, pl.pos.z, x, z);
  if (d < 1.2) { pl.setMove(0, 0, 0, false); return; }
  const dir = norm2(x - pl.pos.x, z - pl.pos.z);
  pl.setMove(dir.x, dir.z, clamp(d / 6, 0.35, 1) * mag, sprint && d > 10);
}
