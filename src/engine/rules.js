/** rules.js — boundaries, goals, restart setup. (Offside hook documented below.) */
import { CONFIG } from '../core/config.js';
import { clamp } from '../core/math.js';

const PITCH = CONFIG.PITCH;
const HALF_L = PITCH.LENGTH / 2, HALF_W = PITCH.WIDTH / 2;

/**
 * Check ball vs boundaries. Returns an event object or null.
 * Events: {type:'GOAL', scoringTeam} | {type:'THROW_IN', team, x, z}
 *       | {type:'CORNER', team, x, z} | {type:'GOAL_KICK', team}
 */
export function checkBoundaries(match) {
  const b = match.ball;
  const { x, y, z } = b.pos;

  // over a goal line?
  if (Math.abs(x) > HALF_L + CONFIG.BALL.RADIUS) {
    // Which team attacks THIS end — from the single source of truth
    // (match.attackingDir), never from cached side booleans.
    const attackerOfEnd = match.attackingDir(0) === Math.sign(x) ? 0 : 1;
    const inMouthZ = Math.abs(z) < PITCH.GOAL_WIDTH / 2;
    const underBar = y < PITCH.GOAL_HEIGHT;
    if (inMouthZ && underBar && Math.abs(x) < HALF_L + PITCH.GOAL_DEPTH) {
      return { type: 'GOAL', scoringTeam: attackerOfEnd };
    }
    // out for corner or goal kick — depends on who touched last
    const defendingTeam = 1 - attackerOfEnd;
    if (b.lastTeam === defendingTeam) {
      return { type: 'CORNER', team: 1 - defendingTeam, x: Math.sign(x) * (HALF_L - 0.5), z: Math.sign(z || 1) * (HALF_W - 0.5) };
    }
    return { type: 'GOAL_KICK', team: defendingTeam };
  }

  // over a touchline?
  if (Math.abs(z) > HALF_W + CONFIG.BALL.RADIUS) {
    const team = b.lastTeam >= 0 ? 1 - b.lastTeam : 0;
    return { type: 'THROW_IN', team, x: clamp(x, -HALF_L + 1, HALF_L - 1), z: Math.sign(z) * (HALF_W - 0.3) };
  }

  return null;
}

/** Ball placement for each restart type. */
export function restartBallSpot(event, match) {
  switch (event.type) {
    case 'THROW_IN': return { x: event.x, z: event.z };
    case 'CORNER': return { x: event.x, z: event.z };
    case 'GOAL_KICK': {
      const team = match.teams[event.team];
      const dir = team.attackDir;
      return { x: -dir * (HALF_L - PITCH.SMALL_BOX_LENGTH), z: 0 };
    }
    case 'FREE_KICK': return { x: event.x, z: event.z };
    case 'KICKOFF':
    default: return { x: 0, z: 0 };
  }
}

/**
 * Pick the restart taker: nearest non-GK of the restarting team
 * (GK for goal kicks).
 */
export function restartTaker(event, match, spot) {
  const team = match.teams[event.team ?? event.scoringTeam ?? 0];
  if (event.type === 'GOAL_KICK') return team.gk;
  let best = null, bd = 1e9;
  for (const p of team.players) {
    if (p.isGK) continue;
    const d = Math.hypot(p.pos.x - spot.x, p.pos.z - spot.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/*
 * OFFSIDE HOOK (v2): call `isOffside(match, passer, receiver)` at the moment a
 * pass is struck; store flagged receivers and award an indirect free kick in
 * checkBoundaries-style event {type:'FREE_KICK', team, x, z} when they touch
 * the ball. Requires: second-last defender x-position per team — available via
 * match.teams[t].players sorted by (pos.x * -attackDir).
 */
