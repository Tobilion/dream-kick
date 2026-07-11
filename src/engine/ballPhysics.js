/**
 * ballPhysics.js — V2 Phase 3 deterministic ball (replaces retired ball.js).
 * Gravity, rolling deceleration, restitution bounce, capped speed.
 * NO random impulses anywhere: identical kick vectors → identical paths.
 * Continuous collision vs players (swept segment) so the ball never tunnels.
 * While `attached` (dribbling) the ball is kinematic — PossessionSystem places it.
 */
import { CONFIG } from '../core/config.js';
import { len2, pointSegDist, clamp } from '../core/math.js';

const B = CONFIG.BALL;
const PL = CONFIG.PLAYER;
const CONTACT_R = PL.RADIUS + B.RADIUS;

export class BallPhysics {
  constructor() {
    this.pos = { x: 0, y: B.RADIUS, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.spin = 0;                // signed curl, set ONLY by kick()
    this.attached = false;        // true while carried by a dribbler
    this.kickGrace = 0;           // kicker immunity timer
    /** @type {import('./player.js').PlayerEntity|null} */
    this.lastTouch = null;
    this.lastTeam = -1;
    /** set when a body blocks/intercepts the ball this frame */
    this.blockedBy = null;
  }

  reset(x = 0, z = 0) {
    this.pos.x = x; this.pos.y = B.RADIUS; this.pos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.spin = 0;
    this.attached = false;
    this.kickGrace = 0;
    this.blockedBy = null;
  }

  /**
   * Strike the ball. Fully deterministic: same args → same trajectory.
   * @param {{x:number,z:number}} dir normalized ground direction
   * @param {number} power ground speed m/s (capped)
   * @param {number} lift vertical speed m/s
   * @param {number} curl signed spin
   */
  kick(dir, power, lift = 0, curl = 0) {
    const p = Math.min(power, B.MAX_SPEED);
    this.vel.x = dir.x * p;
    this.vel.z = dir.z * p;
    this.vel.y = lift;
    this.spin = curl;
    this.attached = false;
    this.kickGrace = B.KICK_GRACE;
  }

  get speed() { return len2(this.vel.x, this.vel.z); }
  get airborne() { return this.pos.y > B.RADIUS + 0.04; }

  /**
   * @param {number} dt
   * @param {import('./player.js').PlayerEntity[]} [players] all outfield bodies for swept collision
   */
  update(dt, players = null) {
    this.blockedBy = null;
    if (this.kickGrace > 0) this.kickGrace -= dt;
    if (this.attached) return; // kinematic: PossessionSystem owns position

    const v = this.vel, p = this.pos;

    // gravity
    v.y += B.GRAVITY * dt;

    // magnus curl — deterministic, decays
    const sp = this.speed;
    if (Math.abs(this.spin) > 0.01 && sp > 2) {
      const nx = v.x / sp, nz = v.z / sp;
      const a = B.MAGNUS * this.spin * dt;
      v.x += -nz * a;
      v.z += nx * a;
      this.spin -= this.spin * B.SPIN_DECAY * dt;
    }

    // drag / rolling friction
    const k = this.airborne ? B.AIR_DRAG : B.GROUND_FRICTION;
    const f = Math.max(0, 1 - k * dt);
    v.x *= f; v.z *= f;

    // speed cap
    const gs = this.speed;
    if (gs > B.MAX_SPEED) { v.x *= B.MAX_SPEED / gs; v.z *= B.MAX_SPEED / gs; }

    // integrate with swept player collision (continuous — no tunneling)
    const x0 = p.x, z0 = p.z;
    const x1 = p.x + v.x * dt, z1 = p.z + v.z * dt;

    let hit = null;
    if (players && p.y < 1.5 && gs > 1.5) {
      let bestT = 1e9;
      for (const pl of players) {
        if (pl === this.lastTouch && this.kickGrace > 0) continue; // kicker immunity
        if (pl.controlCooldown > 0) continue;
        const d = pointSegDist(pl.pos.x, pl.pos.z, x0, z0, x1, z1);
        if (d < CONTACT_R) {
          // approximate contact order by projection along travel
          const t = (pl.pos.x - x0) * v.x + (pl.pos.z - z0) * v.z;
          if (t < bestT) { bestT = t; hit = pl; }
        }
      }
    }

    if (hit) {
      // deterministic deflection off the body: reflect about contact normal
      let nx = x0 - hit.pos.x, nz = z0 - hit.pos.z;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl; nz /= nl;
      const dot = v.x * nx + v.z * nz;
      const damp = gs > 18 ? B.BLOCK_DAMP_FAST : B.BLOCK_DAMP_SLOW;
      v.x = (v.x - 2 * dot * nx) * damp;
      v.z = (v.z - 2 * dot * nz) * damp;
      v.y = Math.min(v.y, 2);
      p.x = hit.pos.x + nx * (CONTACT_R + 0.02);
      p.z = hit.pos.z + nz * (CONTACT_R + 0.02);
      this.blockedBy = hit;
      this.lastTouch = hit;
      this.lastTeam = hit.team;
    } else {
      p.x = x1; p.z = z1;
    }
    p.y += v.y * dt;

    // ground bounce (pitch collision)
    if (p.y < B.RADIUS) {
      p.y = B.RADIUS;
      if (v.y < -1.2) v.y = -v.y * B.RESTITUTION;
      else v.y = 0;
    }

    if (!this.airborne && this.speed < B.STOP_SPEED) { v.x = 0; v.z = 0; }
  }
}
