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
export const FORMATIONS = {
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
  '4231': [
    { x: 0.04, z: 0 },
    { x: 0.22, z: -0.72 }, { x: 0.18, z: -0.25 }, { x: 0.18, z: 0.25 }, { x: 0.22, z: 0.72 }, // DF
    { x: 0.36, z: -0.3 }, { x: 0.36, z: 0.3 },               // DM
    { x: 0.54, z: -0.65 }, { x: 0.56, z: 0 }, { x: 0.54, z: 0.65 }, // AM
    { x: 0.72, z: 0 }                                         // FW
  ],
  '352': [
    { x: 0.04, z: 0 },
    { x: 0.2, z: -0.45 }, { x: 0.18, z: 0 }, { x: 0.2, z: 0.45 }, // DF
    { x: 0.42, z: -0.75 }, { x: 0.38, z: -0.25 }, { x: 0.38, z: 0.25 }, { x: 0.42, z: 0.75 }, { x: 0.54, z: 0 }, // MF
    { x: 0.68, z: -0.22 }, { x: 0.68, z: 0.22 }               // FW
  ],
  '532': [
    { x: 0.04, z: 0 },
    { x: 0.24, z: -0.76 }, { x: 0.2, z: -0.38 }, { x: 0.18, z: 0 }, { x: 0.2, z: 0.38 }, { x: 0.24, z: 0.76 }, // DF
    { x: 0.44, z: -0.35 }, { x: 0.4, z: 0 }, { x: 0.44, z: 0.35 }, // MF
    { x: 0.68, z: -0.22 }, { x: 0.68, z: 0.22 }               // FW
  ]
};

export class Team {
  /**
   * @param {object} club club data from teams.js
   * @param {number} index 0 home / 1 away
   * @param {string} formation '442' | '433' | '4231' | '352' | '532'
   */
  constructor(club, index, formation = '442') {
    this.club = club;
    this.index = index;
    this.formation = formation;
    this.attackDir = index === 0 ? 1 : -1; // OWNED by match.syncAttackDirs() — never mutate elsewhere
    this.lineup = pickLineup(club, formation);
    this.players = this.lineup.map((p, i) => new PlayerEntity(p, index, i));
    this.gk = this.players[0];
    this.mentality = 'balanced';            // 'defensive' | 'balanced' | 'attacking'
    this.pressingIntensity = 'mid';         // 'low' | 'mid' | 'high'
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
    let mentalityFactor = 1.0;
    if (this.mentality === 'attacking') mentalityFactor = 1.25;
    else if (this.mentality === 'defensive') mentalityFactor = 0.75;

    const push = CONFIG.AI.LINE_DEPTH_SHIFT * mentalityFactor * (inPossession ? 0.55 + 0.45 * ballAdv : 0.25 + 0.55 * ballAdv);
    x += push * dir;

    // slot 0 is always the GK slot (players[i] would be wrong — i is a SLOT
    // index and idx assignments change with formation edits)
    const slotIsGK = i === 0;

    // lateral shift toward ball side
    z += (ballZ - z) * CONFIG.AI.SUPPORT_SHIFT * (slotIsGK ? 0.15 : 1);

    // GK stays near goal
    if (slotIsGK) {
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
    const slots = FORMATIONS[this.formation];
    for (const p of this.players) {
      // use p.idx (slot assignment), NOT array order — formation changes and
      // slot swaps in team management reassign idx without reordering the array
      const t = slots[p.idx] || slots[0];
      const dir = this.attackDir;
      let x = (-HALF_L + t.x * PITCH.LENGTH * 0.86) * dir;
      let z = t.z * HALF_W * 0.85;
      // keep on own half
      if (x * dir > -1.5) x = -1.5 * dir - Math.random() * 2 * dir;
      p.pos.x = x; p.pos.z = z;
      p.vel.x = p.vel.z = 0;
      p.facing = dir > 0 ? 0 : Math.PI;
      p.state = 'normal';
      p.hasBall = false;
      p.setMove(0, 0, 0, false);
    }
    if (kicking) {
      // two most-advanced slots to the center spot
      const fws = [...this.players].filter(p => !p.isGK).sort((a, b) => b.idx - a.idx).slice(0, 2);
      if (fws[0]) { fws[0].pos.x = -0.8 * this.attackDir; fws[0].pos.z = 0.2; }
      if (fws[1]) { fws[1].pos.x = -2.6 * this.attackDir; fws[1].pos.z = -2.2; }
    }
  }

  /** Opponent goal center x for this team. */
  get goalX() { return HALF_L * this.attackDir; }
  get ownGoalX() { return -HALF_L * this.attackDir; }
}
