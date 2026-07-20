/**
 * passingSystem.js — V2 Phase 3 passing (replaces the pass half of actions.js).
 * One code path for user and AI. Exact lead vectors, straight interceptable
 * lines; the ONLY noise is a subtle angle error scaled by passer rating and
 * defender pressure (drawn from match.rng, never from wild randomness).
 */
import { CONFIG } from '../core/config.js';
import { clamp, norm2, dot2 } from '../core/math.js';
import { PSTATE } from './player.js';
import { getMoraleMultiplier } from '../data/teams.js';

const P = CONFIG.PLAYER;
const B = CONFIG.BALL;

export class PassingSystem {
  /** Detach + strike. Shared by passes, shots, clears. Deterministic given args. */
  static strike(match, pl, dir, power, lift, curl, kind) {
    const b = match.ball;
    const d = Math.hypot(pl.pos.x - b.pos.x, pl.pos.z - b.pos.z);
    if (d > P.CONTROL_RADIUS + 1.2) return false;

    pl.act(PSTATE.KICKING, P.KICK_DURATION);
    pl.faceToward(pl.pos.x + dir.x, pl.pos.z + dir.z);

    if (match.owner === pl) match.possessionSystem.release(match, 0.35);
    else { pl.hasBall = false; pl.controlCooldown = 0.35; }

    b.lastTouch = pl;
    b.lastTeam = pl.team;
    b.pos.y = Math.max(b.pos.y, B.RADIUS);
    b.kick(dir, power, lift, curl);

    if (kind === 'shot') {
      match.stats.shots[pl.team]++;
      pl.matchStats.shots++;
      match.events.onKick?.('shot', power / P.SHOT_POWER_MAX);
    } else {
      match.stats.passes[pl.team]++;
      match.events.onKick?.(kind);
    }
    return true;
  }

  /** Defender pressure on `pl` in 0..1 (bodies within 4m). */
  static pressure(match, pl) {
    let pr = 0;
    for (const o of match.teams[1 - pl.team].players) {
      const d = Math.hypot(pl.pos.x - o.pos.x, pl.pos.z - o.pos.z);
      if (d < 4) pr += 1 - d / 4;
    }
    return clamp(pr, 0, 1);
  }

  /**
   * Core pass: exact kick vector to reach `mate`, leading their movement.
   * Ground passes arrive with PASS_ARRIVE_SPEED (linear speed-over-distance
   * decay: v0 = va + k·d). Long balls (>26m) are lofted.
   */
  static passTo(match, pl, mate, through = false) {
    const leadTime = through ? 0.65 : 0.28;
    const tx = mate.pos.x + mate.vel.x * leadTime;
    const tz = mate.pos.z + mate.vel.z * leadTime;
    const d = Math.hypot(tx - pl.pos.x, tz - pl.pos.z);
    let dir = norm2(tx - pl.pos.x, tz - pl.pos.z);

    // subtle noise: ONLY from passer rating + pressure fuzzed by morale
    const pr = this.pressure(match, pl);
    const moraleMult = getMoraleMultiplier(pl.data);
    const maxErr = ((1 - pl.data.pass / 100) * 0.05 + pr * 0.035) * moraleMult; // radians
    const ang = Math.atan2(dir.z, dir.x) + (match.rng() * 2 - 1) * maxErr;
    dir = { x: Math.cos(ang), z: Math.sin(ang) };

    const long = d > 26;
    let power, lift;
    if (long) {
      power = clamp(P.LONG_PASS_SPEED + (d - 26) * 0.25, P.LONG_PASS_SPEED, B.MAX_SPEED * 0.85);
      lift = P.LONG_PASS_LIFT;
    } else {
      // rolling ball: v(x) = v0 - k·x  →  v0 = arrive + k·d
      power = clamp(P.PASS_ARRIVE_SPEED + B.GROUND_FRICTION * d * 0.72, P.PASS_SPEED_MIN, P.PASS_SPEED_MAX + 5);
      lift = 0;
    }

    match.pendingPass = { team: pl.team, receiver: mate, passer: pl };
    return this.strike(match, pl, dir, power, lift, 0, long ? 'longpass' : 'pass');
  }

  /** User pass: pick the best teammate in a cone around the input direction. */
  static userPass(match, pl, charge) {
    const team = match.teams[pl.team];
    const through = charge > 0.55;
    const aim = (Math.abs(pl.moveInput.mag) > 0.2)
      ? norm2(pl.moveInput.x, pl.moveInput.z)
      : { x: Math.cos(pl.facing), z: Math.sin(pl.facing) };

    let best = null, maxScore = -1e9;
    for (const mate of team.players) {
      if (mate === pl || mate.busy) continue;
      const dx = mate.pos.x - pl.pos.x, dz = mate.pos.z - pl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2 || d > (through ? 48 : 30)) continue;
      const dir = norm2(dx, dz);
      const align = dot2(aim.x, aim.z, dir.x, dir.z);
      if (align < 0.15) continue; // outside the cone
      const score = align * 2 - d / 40;
      if (score > maxScore) { maxScore = score; best = mate; }
    }
    if (!best) best = this.bestTarget(match, team, pl)?.mate;
    if (best) this.passTo(match, pl, best, through);
  }

  /** AI passes ride the exact same path. */
  static aiPass(match, pl, mate, through) {
    this.passTo(match, pl, mate, through);
  }

  /** Utility-scored fallback target (openness + lane + progress). */
  static bestTarget(match, team, pl) {
    const opp = match.teams[1 - team.index];
    let best = null;
    for (const mate of team.players) {
      if (mate === pl || mate.busy) continue;
      const d = Math.hypot(mate.pos.x - pl.pos.x, mate.pos.z - pl.pos.z);
      if (d < 4 || d > 42) continue;
      let lane = 99, space = 99;
      for (const o of opp.players) {
        lane = Math.min(lane, segDist(o.pos.x, o.pos.z, pl.pos.x, pl.pos.z, mate.pos.x, mate.pos.z));
        space = Math.min(space, Math.hypot(mate.pos.x - o.pos.x, mate.pos.z - o.pos.z));
      }
      const advance = (mate.pos.x - pl.pos.x) * team.attackDir / 40;
      const score = advance
        + clamp(lane / CONFIG.AI.PASS_OPENNESS_LANE, 0, 1.6) * 0.5
        + clamp(space / 8, 0, 1) * 0.4
        + (d > 30 ? -0.25 : 0);
      if (!best || score > best.score) {
        best = { mate, score, through: advance > 0.28 && space > 6 && mate.data.pos === 'FW' };
      }
    }
    return best;
  }
}

function segDist(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-6) return Math.hypot(px - x1, pz - z1);
  const t = clamp(((px - x1) * dx + (pz - z1) * dz) / l2, 0, 1);
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}
