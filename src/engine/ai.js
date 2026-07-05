/** ai.js — on-ball and off-ball decision making (utility scoring). */
import { CONFIG } from '../core/config.js';
import { clamp, dist2, norm2, pointSegDist } from '../core/math.js';
import { PSTATE } from './player.js';

const AI = CONFIG.AI, P = CONFIG.PLAYER, PITCH = CONFIG.PITCH;
const HALF_L = PITCH.LENGTH / 2, HALF_W = PITCH.WIDTH / 2;

/** Main per-tick AI driver. Controls every player not controlled by the user. */
export function updateAI(match, dt) {
  const diff = match.diffParams;
  for (const team of match.teams) {
    for (const pl of team.players) {
      if (pl === match.controlled && match.phase === 'OPEN_PLAY') continue;
      pl.aiTimer -= dt;
      if (pl.aiTimer > 0) continue;
      pl.aiTimer = AI.DECISION_INTERVAL * (0.7 + Math.random() * 0.6) *
        (team.index === match.userTeam ? 1 : diff.decision);
      decide(match, team, pl);
    }
  }
}

function decide(match, team, pl) {
  if (pl.busy) return;
  if (pl.isGK) return; // goalkeeper.js drives keepers

  const ball = match.ball;
  const owner = match.owner;
  const myBall = owner && owner.team === team.index;
  const iAmOwner = owner === pl;

  if (iAmOwner) { onBall(match, team, pl); return; }

  if (myBall || (!owner && ball.lastTeam === team.index)) {
    offBallAttack(match, team, pl);
  } else {
    offBallDefend(match, team, pl);
  }
}

/* ---------------- on-ball ---------------- */

function onBall(match, team, pl) {
  const diff = match.diffParams;
  const goalX = team.goalX;
  const dGoal = dist2(pl.pos.x, pl.pos.z, goalX, 0);
  const opp = match.teams[1 - team.index];

  // pressure from nearest opponent
  let pressure = 99;
  for (const o of opp.players) pressure = Math.min(pressure, dist2(pl.pos.x, pl.pos.z, o.pos.x, o.pos.z));

  // 1) shoot?
  const angle = shootAngle(pl, goalX);
  if (dGoal < AI.SHOOT_RANGE && angle > AI.SHOOT_ANGLE_MIN * (dGoal / 12)) {
    const q = (pl.data.shoot / 100) * (1 - dGoal / (AI.SHOOT_RANGE * 1.4));
    if (Math.random() < q * 1.15) { match.aiShoot(pl); return; }
  }

  // 2) clear if deep & pressured
  const ownGoalDist = dist2(pl.pos.x, pl.pos.z, team.ownGoalX, 0);
  if (ownGoalDist < 22 && pressure < AI.CLEAR_PRESSURE_DIST) {
    match.aiClear(pl); return;
  }

  // 3) best pass vs dribble
  const pass = bestPass(match, team, pl);
  const dribbleScore = dribbleQuality(match, team, pl) + (pressure > 4 ? 0.25 : -0.2);
  if (pass && pass.score > dribbleScore + 0.12) {
    match.aiPass(pl, pass.mate, pass.through, diff.passNoise);
    return;
  }

  // 4) dribble toward goal, avoiding nearest opponent
  const dir = dribbleDirection(match, team, pl);
  pl.setMove(dir.x, dir.z, 1, pressure > 3.4 && pl.stamina > 25);
}

function shootAngle(pl, goalX) {
  const a1 = Math.atan2(-CONFIG.PITCH.GOAL_WIDTH / 2 - pl.pos.z, goalX - pl.pos.x);
  const a2 = Math.atan2(CONFIG.PITCH.GOAL_WIDTH / 2 - pl.pos.z, goalX - pl.pos.x);
  return Math.abs(a2 - a1);
}

/** Score every teammate as a pass option. */
export function bestPass(match, team, pl) {
  const opp = match.teams[1 - team.index];
  let best = null;
  for (const mate of team.players) {
    if (mate === pl || mate.busy) continue;
    const d = dist2(pl.pos.x, pl.pos.z, mate.pos.x, mate.pos.z);
    if (d < 4 || d > 42) continue;

    // openness: nearest opponent to the passing lane
    let lane = 99;
    for (const o of opp.players) {
      lane = Math.min(lane, pointSegDist(o.pos.x, o.pos.z, pl.pos.x, pl.pos.z, mate.pos.x, mate.pos.z));
    }
    // receiver space
    let space = 99;
    for (const o of opp.players) space = Math.min(space, dist2(mate.pos.x, mate.pos.z, o.pos.x, o.pos.z));

    const advance = (mate.pos.x - pl.pos.x) * team.attackDir / 40; // forward progress
    const laneScore = clamp(lane / AI.PASS_OPENNESS_LANE, 0, 1.6) * 0.5;
    const spaceScore = clamp(space / 8, 0, 1) * 0.4;
    const distPenalty = d > 30 ? -0.25 : 0;
    const score = advance + laneScore + spaceScore + distPenalty;

    if (!best || score > best.score) {
      best = { mate, score, through: advance > 0.28 && space > 6 && mate.data.pos === 'FW' };
    }
  }
  return best;
}

function dribbleQuality(match, team, pl) {
  // more attractive with space ahead
  const dir = norm2(team.goalX - pl.pos.x, -pl.pos.z * 0.3);
  const aheadX = pl.pos.x + dir.x * 7, aheadZ = pl.pos.z + dir.z * 7;
  let space = 99;
  for (const o of match.teams[1 - team.index].players) {
    space = Math.min(space, dist2(aheadX, aheadZ, o.pos.x, o.pos.z));
  }
  return clamp(space / 9, 0, 1) * 0.75 + (pl.data.pace / 100) * 0.25;
}

function dribbleDirection(match, team, pl) {
  const target = { x: team.goalX * 0.94, z: clamp(pl.pos.z * 0.6, -HALF_W * 0.7, HALF_W * 0.7) };
  let dx = target.x - pl.pos.x, dz = target.z - pl.pos.z;
  // steer around the closest opponent in front
  const opp = match.teams[1 - team.index];
  let nearest = null, nd = 6;
  for (const o of opp.players) {
    const d = dist2(pl.pos.x, pl.pos.z, o.pos.x, o.pos.z);
    if (d < nd && (o.pos.x - pl.pos.x) * team.attackDir > -1) { nd = d; nearest = o; }
  }
  if (nearest) {
    const side = Math.sign(pl.pos.z - nearest.pos.z) || (Math.random() < 0.5 ? 1 : -1);
    dz += side * (6 - nd) * 2.2;
  }
  return norm2(dx, dz);
}

/* ---------------- off-ball ---------------- */

function offBallAttack(match, team, pl) {
  const ball = match.ball;
  const anchor = team.anchor(pl.idx, ball.pos.x, ball.pos.z, true);

  // strikers make depth runs when ball is advanced
  if (pl.data.pos === 'FW' && (ball.pos.x * team.attackDir) > 8) {
    anchor.x += AI.RUN_BEYOND * team.attackDir * 0.6;
  }
  // loose ball nearby? chase it
  if (!match.owner) {
    const d = dist2(pl.pos.x, pl.pos.z, ball.pos.x, ball.pos.z);
    if (d < 10 && isClosestOfTeam(team, pl, ball)) { chase(pl, ball, true); return; }
  }
  seek(pl, anchor.x, anchor.z, 0.9, false);
}

function offBallDefend(match, team, pl) {
  const ball = match.ball;
  const diff = match.diffParams;
  const ballDist = dist2(pl.pos.x, pl.pos.z, ball.pos.x, ball.pos.z);

  // pressers: N closest defenders press the ball
  const rank = pressRank(team, pl, ball);
  const pressers = team.index === match.userTeam ? AI.PRESSERS : Math.round(AI.PRESSERS * diff.press);
  if (rank < Math.max(1, pressers) && ballDist < AI.PRESS_RADIUS) {
    chase(pl, ball, ballDist < 12);
    // attempt tackle when close to the owner
    const owner = match.owner;
    if (owner && owner.team !== team.index && ballDist < P.TACKLE_RANGE * 1.1 && !pl.busy) {
      match.aiTackle(pl);
    }
    return;
  }

  // otherwise hold defensive shape (goal-side of anchor)
  const anchor = team.anchor(pl.idx, ball.pos.x, ball.pos.z, false);
  seek(pl, anchor.x, anchor.z, 0.85, false);
}

function pressRank(team, pl, ball) {
  const d0 = dist2(pl.pos.x, pl.pos.z, ball.pos.x, ball.pos.z);
  let rank = 0;
  for (const o of team.players) {
    if (o === pl || o.isGK || o.busy) continue;
    if (dist2(o.pos.x, o.pos.z, ball.pos.x, ball.pos.z) < d0) rank++;
  }
  return rank;
}

function isClosestOfTeam(team, pl, ball) {
  return pressRank(team, pl, ball) === 0;
}

function chase(pl, ball, sprint) {
  // aim slightly ahead of the rolling ball
  const tx = ball.pos.x + ball.vel.x * 0.25;
  const tz = ball.pos.z + ball.vel.z * 0.25;
  const dir = norm2(tx - pl.pos.x, tz - pl.pos.z);
  pl.setMove(dir.x, dir.z, 1, sprint && pl.stamina > 15);
}

function seek(pl, x, z, mag, sprint) {
  const d = dist2(pl.pos.x, pl.pos.z, x, z);
  if (d < 1.2) { pl.setMove(0, 0, 0, false); return; }
  const dir = norm2(x - pl.pos.x, z - pl.pos.z);
  pl.setMove(dir.x, dir.z, clamp(d / 6, 0.35, 1) * mag, sprint && d > 14);
}
