/** goalkeeper.js — GK positioning, shot reaction, dives, distribution. */
import { CONFIG } from '../core/config.js';
import { clamp, dist2, norm2 } from '../core/math.js';
import { PSTATE } from './player.js';

const AI = CONFIG.AI, PITCH = CONFIG.PITCH, P = CONFIG.PLAYER;
const HALF_L = PITCH.LENGTH / 2;

/** Drive both goalkeepers every tick. */
export function updateGoalkeepers(match, dt) {
  for (const team of match.teams) {
    const gk = team.gk;
    if (gk.busy && gk.state !== PSTATE.NORMAL) continue;
    if (match.owner === gk) { distribute(match, team, gk); continue; }
    positionKeeper(match, team, gk);
    maybeDive(match, team, gk, dt);
  }
}

function positionKeeper(match, team, gk) {
  const ball = match.ball;
  const goalX = team.ownGoalX;
  const dir = team.attackDir;

  // stand on the line between ball and goal center, a few meters off the line
  const toBall = norm2(ball.pos.x - goalX, ball.pos.z - 0);
  const ballDist = dist2(ball.pos.x, ball.pos.z, goalX, 0);
  // come out to narrow the angle when the ball is close
  const out = clamp(9 - ballDist * 0.18, 1.2, 6.5);

  let tx = goalX + toBall.x * out;
  let tz = toBall.z * out * 1.6;
  tz = clamp(tz, -PITCH.GOAL_WIDTH / 2 - 1.5, PITCH.GOAL_WIDTH / 2 + 1.5);
  // never cross halfway or leave the box area
  tx = dir > 0 ? clamp(tx, -HALF_L + 0.8, -HALF_L + PITCH.BOX_LENGTH)
               : clamp(tx, HALF_L - PITCH.BOX_LENGTH, HALF_L - 0.8);

  const d = dist2(gk.pos.x, gk.pos.z, tx, tz);
  if (d > 0.4) {
    const mdir = norm2(tx - gk.pos.x, tz - gk.pos.z);
    gk.setMove(mdir.x, mdir.z, clamp(d / 3, 0.3, 1), d > 6);
  } else {
    gk.setMove(0, 0, 0, false);
    gk.faceToward(ball.pos.x, ball.pos.z);
  }
}

function maybeDive(match, team, gk, dt) {
  const ball = match.ball;
  const goalX = team.ownGoalX;
  const diff = match.diffParams;

  // is the ball a threat: moving toward our goal, fast, within range?
  const toGoal = (goalX - ball.pos.x) * Math.sign(ball.vel.x || 1);
  const approaching = Math.sign(ball.vel.x) === Math.sign(goalX - ball.pos.x) && Math.abs(ball.vel.x) > 6;
  const ballDist = dist2(ball.pos.x, ball.pos.z, gk.pos.x, gk.pos.z);
  if (!approaching || ballDist > AI.GK_DIST_RANGE) { gk.reactT = 0; return; }

  // predict z where ball crosses keeper's x
  const t = Math.abs((gk.pos.x - ball.pos.x) / (ball.vel.x || 1e-6));
  if (t > 1.4) return;
  const crossZ = ball.pos.z + ball.vel.z * t;
  const crossY = Math.max(0, ball.pos.y + ball.vel.y * t + 0.5 * CONFIG.BALL.GRAVITY * t * t);

  // ignore balls sailing wide/high
  if (Math.abs(crossZ) > PITCH.GOAL_WIDTH / 2 + 2.2 || crossY > PITCH.GOAL_HEIGHT + 1.4) return;

  // reaction time gate
  const reactNeeded = AI.GK_REACTION_BASE * diff.gkReact * (100 / Math.max(40, gk.data.gk));
  gk.reactT = (gk.reactT || 0) + dt;
  if (gk.reactT < reactNeeded) return;

  const dz = crossZ - gk.pos.z;
  if (Math.abs(dz) < 0.7 && ballDist < 2.2) {
    // catch/claim
    match.gkClaim(gk);
    return;
  }
  if (Math.abs(dz) < 7.4) {
    gk.act(PSTATE.DIVING, P.GK_DIVE_DURATION, norm2(0, Math.sign(dz)));
    gk.diveSave = { z: crossZ, power: match.ball.speed };
    gk.reactT = 0;
  }
}

function distribute(match, team, gk) {
  // simple: after a short hold, throw to the widest open defender, else kick long
  gk.holdT = (gk.holdT || 0) + 1 / 60;
  if (gk.holdT < 0.9) { gk.setMove(0, 0, 0, false); return; }
  gk.holdT = 0;

  const opp = match.teams[1 - team.index];
  let best = null, bestScore = -1;
  for (const mate of team.players) {
    if (mate === gk) continue;
    let space = 99;
    for (const o of opp.players) space = Math.min(space, dist2(mate.pos.x, mate.pos.z, o.pos.x, o.pos.z));
    const d = dist2(gk.pos.x, gk.pos.z, mate.pos.x, mate.pos.z);
    if (d < 8 || d > 46) continue;
    const score = space + (mate.data.pos === 'DF' ? 4 : 0);
    if (score > bestScore) { bestScore = score; best = mate; }
  }
  if (best && bestScore > 7) {
    match.aiPass(gk, best, false, 0.05);
  } else {
    match.aiClear(gk);
  }
}
