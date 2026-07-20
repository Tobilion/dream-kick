/**
 * shootingSystem.js — V2 Phase 3 shooting (replaces the shot half of actions.js).
 * Power from hold-duration (user) or context (AI); direction toward goal biased
 * by aim input; accuracy is a COMPUTED error from shooter rating, distance,
 * angle and pressure — bounded, drawn from match.rng. No coin-flip physics.
 * One code path for user and AI.
 */
import { CONFIG } from '../core/config.js';
import { clamp, norm2 } from '../core/math.js';
import { PassingSystem } from './passingSystem.js';
import { getMoraleMultiplier } from '../data/teams.js';

const P = CONFIG.PLAYER;
const PITCH = CONFIG.PITCH;

export class ShootingSystem {
  /**
   * @param {number} charge 0..1 shot power
   * @param {number} aimZ -1..1 lateral aim bias (from input z, 0 = center)
   */
  static shoot(match, pl, charge, aimZ = 0) {
    const team = match.teams[pl.team];
    const goalX = team.goalX;

    const power = P.SHOT_POWER_MIN + (P.SHOT_POWER_MAX - P.SHOT_POWER_MIN) * clamp(charge, 0, 1);

    // --- computed error model ---
    const dGoal = Math.hypot(goalX - pl.pos.x, pl.pos.z);
    const angleOff = Math.abs(Math.atan2(pl.pos.z, goalX - pl.pos.x)); // 0 = straight on
    const pressure = PassingSystem.pressure(match, pl);
    const skill = pl.data.shoot / 100;

    const moraleMult = getMoraleMultiplier(pl.data);
    const err =
      (1.05 - skill) *
      (0.5 + charge * 0.7) *                  // harder shots stray more
      (0.6 + clamp(dGoal / 24, 0, 1.4)) *      // distance
      (1 + angleOff * 0.9) *                   // tight angles
      (1 + pressure * 1.1) *                   // bodies closing in
      moraleMult;

    // aim inside the posts, biased by input
    const target = clamp(aimZ, -1, 1) * (PITCH.GOAL_WIDTH / 2 - 0.5);
    const tz = target + (match.rng() * 2 - 1) * err * 3.05; // bounded meters (blowout knob; was 2.9)
    const dir = norm2(goalX - pl.pos.x, tz - pl.pos.z);

    const lift = clamp(charge, 0, 1) * P.SHOT_LIFT_MAX * (0.35 + (1 - skill) * 0.25 + charge * 0.25);
    const curl = clamp(aimZ, -1, 1) * -1.8;

    const ok = PassingSystem.strike(match, pl, dir, power, lift, curl, 'shot');
    if (!ok) return;

    // on-target bookkeeping (straight-line projection)
    const b = match.ball;
    const t = Math.abs((goalX - b.pos.x) / (b.vel.x || 1e-6));
    const zAt = b.pos.z + b.vel.z * t;
    if (Math.abs(zAt) < PITCH.GOAL_WIDTH / 2 + 0.4 && t < 3) match.stats.onTarget[pl.team]++;
  }

  /** User shot: charge from button hold, aim from stick z. */
  static userShoot(match, pl, charge) {
    const aimZ = pl.moveInput.mag > 0.2 ? clamp(pl.moveInput.z, -1, 1) : 0;
    this.shoot(match, pl, charge, aimZ);
  }

  /** AI shot: context charge — closer means more placement, less blast. */
  static aiShoot(match, pl) {
    const team = match.teams[pl.team];
    const dGoal = Math.hypot(team.goalX - pl.pos.x, pl.pos.z);
    const charge = clamp(0.35 + dGoal / 30, 0.35, 0.95);
    // deterministic near-post/far-post choice from position (no dice)
    const aimZ = pl.pos.z > 0 ? -0.55 : 0.55;
    this.shoot(match, pl, charge, aimZ);
  }

  /** Defensive clear: hoof it forward-wide (direction from position, not dice). */
  static clear(match, pl) {
    const team = match.teams[pl.team];
    const wide = pl.pos.z >= 0 ? 1 : -1;
    const dir = norm2(team.attackDir * 0.55, wide * 0.6);
    match.ball.lastTouch = pl;
    match.ball.lastTeam = pl.team;
    PassingSystem.strike(match, pl, dir, 23, 7.5, 0, 'longpass');
  }
}
