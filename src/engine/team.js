/** team.js — formation shape, anchors, tactical line shifting. */
import { CONFIG } from '../core/config.js';
import { clamp } from '../core/math.js';
import { PlayerEntity } from './player.js';
import { pickLineup } from '../data/teams.js';

const PITCH = CONFIG.PITCH;
const HALF_L = PITCH.LENGTH / 2, HALF_W = PITCH.WIDTH / 2;

/**
 * Formation templates in normalized coords:
 * x: 0 = own goal line, 1 = opponent goal line; z: -1..1 across width.
 */
const FORMATIONS = {
  '442': [
    { x: 0.04, z: 0 },                                       // GK
    { x: 0.22, z: -0.72 }, { x: 0.18, z: -0.25 }, { x: 0.18, z: 0.25 }, { x: 0.22, z: 0.72 }, // DF
    { x: 0.46, z: -0.68 }, { x: 0.42, z: -0.22 }, { x: 0.42, z: 0.22 }, { x: 0.46, z: 0.68 }, // MF
    { x: 0.68, z: -0.2 }, { x: 0.68, z: 0.2 },               // FW
  ],
  '433': [
    { x: 0.04, z: 0 },
    { x: 0.22, z: -0.72 }, { x: 0.18, z: -0.25 }, { x: 0.18, z: 0.25 }, { x: 0.22, z: 0.72 },
    { x: 0.42, z: -0.4 }, { x: 0.38, z: 0 }, { x: 0.42, z: 0.4 },
    { x: 0.68, z: -0.6 }, { x: 0.72, z: 0 }, { x: 0.68, z: 0.6 },
  ],
};

export class Team {
  /**
   * @param {object} club club data from teams.js
   * @param {number} index 0 home / 1 away
   * @param {string} formation '442' | '433'
   */
  constructor(club, index, formation = '442') {
    this.club = club;
    this.index = index;
    this.formation = formation;
    this.attackDir = index === 0 ? 1 : -1; // flipped at halftime
    this.lineup = pickLineup(club, formation);
    this.players = this.lineup.map((p, i) => new PlayerEntity(p, index, i));
    this.gk = this.players[0];
  }

  /** World-space anchor for formation slot i given tactical context. */
  anchor(i, ballX, ballZ, inPossession) {
    const t = FORMATIONS[this.formation][i];
    const dir = this.attackDir;

    // base position from own goal line
    let x = (-HALF_L + t.x * PITCH.LENGTH) * dir;
    let z = t.z * HALF_W * 0.92;

    // whole-team push/drop with ball position
    const ballAdv = clamp(ballX * dir / HALF_L, -1, 1); // -1 deep in our half .. 1 at their goal
    const push = CONFIG.AI.LINE_DEPTH_SHIFT * (inPossession ? 0.55 + 0.45 * ballAdv : 0.25 + 0.55 * ballAdv);
    x += push * dir;

    // lateral shift toward ball side
    z += (ballZ - z) * CONFIG.AI.SUPPORT_SHIFT * (this.players[i].isGK ? 0.15 : 1);

    // GK stays near goal
    if (this.players[i].isGK) {
      x = (-HALF_L + 2.5) * dir;
      z = clamp(ballZ * 0.12, -5, 5);
    }

    return {
      x: clamp(x, -HALF_L + 1, HALF_L - 1),
      z: clamp(z, -HALF_W + 1, HALF_W - 1),
    };
  }

  /** Place all players in formation (kickoff), optionally on own half only. */
  resetPositions(kicking) {
    for (let i = 0; i < this.players.length; i++) {
      const t = FORMATIONS[this.formation][i];
      const dir = this.attackDir;
      let x = (-HALF_L + t.x * PITCH.LENGTH * 0.86) * dir;
      let z = t.z * HALF_W * 0.85;
      // keep on own half
      if (x * dir > -1.5) x = -1.5 * dir - Math.random() * 2 * dir;
      const p = this.players[i];
      p.pos.x = x; p.pos.z = z;
      p.vel.x = p.vel.z = 0;
      p.facing = dir > 0 ? 0 : Math.PI;
      p.state = 'normal';
    }
    if (kicking) {
      // two forwards to the center spot
      const fws = this.players.slice(-2);
      fws[0].pos.x = -0.8 * this.attackDir; fws[0].pos.z = 0.2;
      if (fws[1]) { fws[1].pos.x = -2.6 * this.attackDir; fws[1].pos.z = -2.2; }
    }
  }

  /** Opponent goal center x for this team. */
  get goalX() { return HALF_L * this.attackDir; }
  get ownGoalX() { return -HALF_L * this.attackDir; }
}
