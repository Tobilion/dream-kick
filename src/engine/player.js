/** player.js — player entity: movement, stamina, action states. */
import { CONFIG } from '../core/config.js';
import { clamp, len2, norm2, angleLerp, damp } from '../core/math.js';

const P = CONFIG.PLAYER;

/** Action states — renderer maps these to poses. */
export const PSTATE = {
  NORMAL: 'normal',
  KICKING: 'kicking',
  SLIDING: 'sliding',
  RECOVER: 'recover',
  FALLEN: 'fallen',
  DIVING: 'diving',
  CELEBRATE: 'celebrate',
};

export class PlayerEntity {
  /**
   * @param {object} data squad player data (stats, name, num)
   * @param {number} teamIndex 0 home / 1 away
   * @param {number} squadIndex index within starting XI
   */
  constructor(data, teamIndex, squadIndex) {
    this.data = data;
    this.team = teamIndex;
    this.idx = squadIndex;
    this.isGK = data.pos === 'GK';

    this.pos = { x: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.facing = 0;                 // radians, 0 = +x
    this.moveInput = { x: 0, z: 0, mag: 0 };
    this.sprinting = false;
    this.stamina = P.STAMINA_MAX;

    this.state = PSTATE.NORMAL;
    this.stateTimer = 0;
    this.slideDir = { x: 1, z: 0 };
    this.diveDir = { x: 0, z: 0 };

    this.home = { x: 0, z: 0 };      // formation anchor (updated by team)
    this.aiTimer = 0.1; // stagger set from match.rng after construction (determinism)
    this.controlCooldown = 0;        // can't re-take touch immediately after kicking
    this.hasBall = false;            // tracks possession for dribbling speed reduction
    this.firstTouchT = 0;            // control delay when receiving a pass (PossessionSystem)
    this.tackleCooldownT = 0;        // re-tackle lockout after a failed tackle
    // per-match stat line (V3 Phase C) — feeds match ratings + season stats
    this.matchStats = { goals: 0, assists: 0, shots: 0, onTarget: 0, tackles: 0, saves: 0 };
  }

  get maxSpeed() {
    let s = P.BASE_SPEED + P.PACE_SPEED_SPAN * ((this.data.pace - 50) / 50);
    if (this.sprinting && this.stamina > 0) s *= P.SPRINT_MULT;
    if (this.stamina < 20) s *= P.TIRED_SPEED_PENALTY;
    if (this.hasBall) s *= P.DRIBBLE_SPEED_MULT; // dribbling ~87% of off-ball speed
    return s;
  }

  get busy() { return this.state !== PSTATE.NORMAL; }
  /** can the player currently take a touch / act on the ball */
  get canPlay() {
    return this.state === PSTATE.NORMAL ||
      (this.state === PSTATE.SLIDING && this.stateTimer < P.SLIDE_DURATION);
  }

  setMove(x, z, mag, sprint) {
    this.moveInput.x = x; this.moveInput.z = z;
    this.moveInput.mag = clamp(mag, 0, 1);
    this.sprinting = sprint && mag > 0.3;
  }

  /** Enter a timed action state. */
  act(state, duration, dir) {
    this.state = state;
    this.stateTimer = 0;
    this.stateDuration = duration;
    if (dir) {
      if (state === PSTATE.SLIDING) this.slideDir = { ...dir };
      if (state === PSTATE.DIVING) this.diveDir = { ...dir };
    }
  }

  update(dt) {
    // action state timers
    if (this.state !== PSTATE.NORMAL) {
      this.stateTimer += dt;
      if (this.state === PSTATE.SLIDING) {
        // carried by slide momentum
        this.vel.x = this.slideDir.x * P.SLIDE_SPEED * (1 - this.stateTimer / P.SLIDE_DURATION);
        this.vel.z = this.slideDir.z * P.SLIDE_SPEED * (1 - this.stateTimer / P.SLIDE_DURATION);
        if (this.stateTimer >= P.SLIDE_DURATION) this.act(PSTATE.RECOVER, P.SLIDE_RECOVERY);
      } else if (this.state === PSTATE.DIVING) {
        this.vel.x = this.diveDir.x * P.GK_DIVE_SPEED * (1 - this.stateTimer / P.GK_DIVE_DURATION);
        this.vel.z = this.diveDir.z * P.GK_DIVE_SPEED * (1 - this.stateTimer / P.GK_DIVE_DURATION);
        if (this.stateTimer >= P.GK_DIVE_DURATION) this.act(PSTATE.RECOVER, 0.5);
      } else if (this.stateTimer >= (this.stateDuration || 0.4)) {
        this.state = PSTATE.NORMAL;
      }
      if (this.state === PSTATE.RECOVER || this.state === PSTATE.FALLEN ||
          this.state === PSTATE.KICKING || this.state === PSTATE.CELEBRATE) {
        // decelerate during non-moving states
        const f = Math.max(0, 1 - 8 * dt);
        this.vel.x *= f; this.vel.z *= f;
      }
    } else {
      // normal locomotion: accelerate toward desired velocity
      const want = this.moveInput.mag * this.maxSpeed;
      const dir = norm2(this.moveInput.x, this.moveInput.z);
      const tx = dir.x * want, tz = dir.z * want;
      const k = damp(P.ACCEL / Math.max(1, this.maxSpeed), dt) * 2.2;
      this.vel.x += (tx - this.vel.x) * clamp(k, 0, 1);
      this.vel.z += (tz - this.vel.z) * clamp(k, 0, 1);

      // face travel direction
      const sp = len2(this.vel.x, this.vel.z);
      if (sp > 0.4) {
        this.facing = angleLerp(this.facing, Math.atan2(this.vel.z, this.vel.x), damp(P.TURN_RATE, dt));
      }
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // stamina
    if (this.sprinting && this.moveInput.mag > 0.3 && this.state === PSTATE.NORMAL) {
      this.stamina = clamp(this.stamina - P.SPRINT_DRAIN * dt, 0, P.STAMINA_MAX);
    } else {
      this.stamina = clamp(this.stamina + P.STAMINA_REGEN * dt, 0, P.STAMINA_MAX);
    }

    if (this.controlCooldown > 0) this.controlCooldown -= dt;
  }

  get speed() { return len2(this.vel.x, this.vel.z); }

  faceToward(x, z) {
    this.facing = Math.atan2(z - this.pos.z, x - this.pos.x);
  }
}
