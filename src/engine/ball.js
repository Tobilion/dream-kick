/** ball.js — free-body 3D ball physics with bounce, drag and curl. */
import { CONFIG } from '../core/config.js';
import { len2 } from '../core/math.js';

const B = CONFIG.BALL;

export class Ball {
  constructor() {
    this.pos = { x: 0, y: B.RADIUS, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.spin = 0;               // signed curl (+ curves left of travel)
    /** @type {import('./player.js').PlayerEntity|null} last player to touch */
    this.lastTouch = null;
    this.lastTeam = -1;
  }

  reset(x = 0, z = 0) {
    this.pos.x = x; this.pos.y = B.RADIUS; this.pos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.spin = 0;
  }

  /**
   * Strike the ball.
   * @param {{x:number,z:number}} dir normalized ground direction
   * @param {number} power ground speed m/s
   * @param {number} lift vertical speed m/s
   * @param {number} curl signed spin
   */
  kick(dir, power, lift = 0, curl = 0) {
    this.vel.x = dir.x * power;
    this.vel.z = dir.z * power;
    this.vel.y = lift;
    this.spin = curl;
  }

  get speed() { return len2(this.vel.x, this.vel.z); }
  get airborne() { return this.pos.y > B.RADIUS + 0.04; }

  update(dt) {
    const v = this.vel, p = this.pos;

    // gravity
    v.y += B.GRAVITY * dt;

    // magnus curl: accelerate perpendicular to travel while moving
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

    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;

    // ground bounce
    if (p.y < B.RADIUS) {
      p.y = B.RADIUS;
      if (v.y < -1.2) {
        v.y = -v.y * B.RESTITUTION;
      } else {
        v.y = 0;
      }
    }

    if (!this.airborne && this.speed < B.STOP_SPEED) { v.x = 0; v.z = 0; }
  }
}
