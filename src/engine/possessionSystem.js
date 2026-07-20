/**
 * possessionSystem.js — V2 Phase 3 possession & dribbling (replaces possession.js).
 *
 * Rules (per V2_REINVENTION_PROMPT):
 * - Within CONTROL_RADIUS of a free ball, a player ATTACHES it: carried
 *   kinematically at the feet with a forward dribble offset. Not a physics body.
 * - Possession is lost ONLY via: a tackle contest (attribute-based, with a
 *   re-tackle cooldown so it never flickers), a pass interception / block,
 *   or the ball going out of play. Overlapping an opponent NEVER steals it.
 * - Receivers take a brief first touch (control delay) before full attachment.
 */
import { CONFIG } from '../core/config.js';
import { dist2, norm2, clamp } from '../core/math.js';
import { PSTATE } from './player.js';
import { getMoraleMultiplier } from '../data/teams.js';

const P = CONFIG.PLAYER;
const B = CONFIG.BALL;

export class PossessionSystem {
  update(match, dt) {
    const b = match.ball;

    // decay per-player tackle lockouts & first-touch timers
    for (const team of match.teams) {
      for (const p of team.players) {
        if (p.tackleCooldownT > 0) p.tackleCooldownT -= dt;
        if (p.firstTouchT > 0) p.firstTouchT -= dt;
      }
    }

    if (match.owner) {
      this.carry(match, dt);
      return;
    }

    // ---- free ball: pickup / interception ----
    if (b.pos.y > 1.6) return; // too high to control

    let nearest = null, minDist = 1e9;
    for (const team of match.teams) {
      for (const p of team.players) {
        if (!p.canPlay || p.controlCooldown > 0) continue;
        const d = dist2(p.pos.x, p.pos.z, b.pos.x, b.pos.z);
        const reach = P.CONTROL_RADIUS + (p.isGK ? 0.6 : 0);
        if (d < reach && d < minDist) { minDist = d; nearest = p; }
      }
    }
    if (!nearest) return;

    // fast incoming ball → first touch: kill most of its speed, brief delay.
    // Better dribblers control it faster (dribbling → control).
    const incoming = b.speed;
    if (incoming > 7 && nearest.firstTouchT <= 0) {
      const control = 1.3 - ((nearest.data.dribble ?? 65) / 100) * 0.6;
      const moraleMult = getMoraleMultiplier(nearest.data);
      nearest.firstTouchT = P.FIRST_TOUCH_TIME * clamp(incoming / 14, 0.7, 1.6) * control * moraleMult;
      const dir = norm2(b.vel.x, b.vel.z);
      b.vel.x = dir.x * 1.6; b.vel.z = dir.z * 1.6; b.vel.y = 0;
      b.spin = 0;
      b.lastTouch = nearest; b.lastTeam = nearest.team;
      return; // attach on a following tick, after the touch settles
    }
    if (nearest.firstTouchT > 0) return; // still controlling

    this.attach(match, nearest);
  }

  /** Give `player` the ball (clean pickup, first touch done). */
  attach(match, player) {
    const b = match.ball;
    match.owner = player;
    player.hasBall = true;
    b.attached = true;
    b.spin = 0;
    b.vel.x = b.vel.y = b.vel.z = 0;
    b.lastTouch = player;
    b.lastTeam = player.team;

    // pass completion tracking (+ assist candidate for goal attribution)
    if (match.pendingPass) {
      if (player.team === match.pendingPass.team) {
        match.stats.passOk[player.team]++;
        const passer = match.pendingPass.passer;
        if (passer && passer !== player) {
          match._assistCandidate = { passer, receiver: player };
        }
      } else {
        match._assistCandidate = null; // intercepted
      }
      match.pendingPass = null;
    }

    // auto-switch cursor for the user team
    if (CONFIG.MATCH.AUTO_SWITCH && player.team === match.userTeam && match.phase === 'OPEN_PLAY') {
      if (!match.controlled || !match.controlled.hasBall) match.controlled = player;
    }
  }

  /** Kinematic carry: ball rides at the owner's feet with a forward offset. */
  carry(match) {
    const owner = match.owner;
    const b = match.ball;
    if (!owner.canPlay) {
      // owner got fouled/fell — ball becomes free where it is
      this.release(match, 0);
      return;
    }
    b.attached = true;
    const lead = P.DRIBBLE_OFFSET + clamp(owner.speed / owner.maxSpeed, 0, 1) * 0.35;
    b.pos.x = owner.pos.x + Math.cos(owner.facing) * lead;
    b.pos.z = owner.pos.z + Math.sin(owner.facing) * lead;
    b.pos.y = B.RADIUS;
    b.vel.x = owner.vel.x; b.vel.z = owner.vel.z; b.vel.y = 0;
  }

  /** Detach the ball from the current owner (pass/shot/tackle pop). */
  release(match, ownerCooldown = 0.35) {
    const owner = match.owner;
    if (!owner) return;
    owner.hasBall = false;
    owner.controlCooldown = ownerCooldown;
    match.owner = null;
    match.ball.attached = false;
  }

  /**
   * Active tackle contest — the ONLY way an opponent takes the ball off a
   * dribbler. Attribute-based (defending vs physical+dribble pace), with a
   * RETACKLE_COOLDOWN lockout on failure so possession never flickers.
   * @returns {boolean} tackle won
   */
  attemptTackle(match, tackler) {
    const owner = match.owner;
    if (!owner || owner.team === tackler.team) return false;
    if (tackler.tackleCooldownT > 0) return false;

    const d = dist2(tackler.pos.x, tackler.pos.z, match.ball.pos.x, match.ball.pos.z);
    if (d > P.TACKLE_RANGE) return false;

    // defending → tackle contest; physical + dribbling → shielding the ball
    const def = tackler.data.defend;
    const shield = owner.data.physical * 0.55 + (owner.data.dribble ?? owner.data.pace) * 0.45;
    const winP = clamp(0.42 + (def - shield) / 150, 0.15, 0.85);

    if (match.rng() < winP) {
      // won: ball pops loose toward the tackler (deterministic direction)
      match.stats.tackles[tackler.team]++;
      tackler.matchStats.tackles++;
      const dir = norm2(tackler.pos.x - owner.pos.x, tackler.pos.z - owner.pos.z);
      this.release(match, 0.6);
      match.ball.lastTouch = tackler;
      match.ball.lastTeam = tackler.team;
      match.ball.kick(dir, 4.5, 0, 0);
      tackler.controlCooldown = 0.1; // can collect almost immediately
      match.events.onCommentary?.(`${tackler.data.name} wins it with a tackle!`);
      return true;
    }

    // lost: locked out — can't spam-tackle the same carrier
    tackler.tackleCooldownT = P.RETACKLE_COOLDOWN;
    return false;
  }
}
