/** match.js — match orchestrator: phases, possession, actions, stats. */
import { CONFIG } from '../core/config.js';
import { clamp, dist2, norm2, dot2 } from '../core/math.js';
import { Ball } from './ball.js';
import { Team } from './team.js';
import { PSTATE } from './player.js';
import { updateAI, bestPass } from './ai.js';
import { updateGoalkeepers } from './goalkeeper.js';
import { checkBoundaries, restartBallSpot, restartTaker } from './rules.js';

const P = CONFIG.PLAYER, M = CONFIG.MATCH, PITCH = CONFIG.PITCH;
const HALF_L = PITCH.LENGTH / 2, HALF_W = PITCH.WIDTH / 2;

export class Match {
  /**
   * @param {object} opts {homeClub, awayClub, userTeam, difficulty, halfLength, events}
   * events: {onGoal, onPhase, onRestart, onKick, onCommentary, onFullTime}
   */
  constructor(opts) {
    this.teams = [new Team(opts.homeClub, 0, '442'), new Team(opts.awayClub, 1, '433')];
    this.userTeam = opts.userTeam ?? 0;
    this.diffParams = CONFIG.DIFFICULTY[opts.difficulty || 'pro'];
    this.halfLength = opts.halfLength || 180;
    this.events = opts.events || {};

    this.ball = new Ball();
    this.owner = null;            // player currently dribbling
    this.controlled = null;       // user-controlled player
    this.phase = 'KICKOFF';
    this.phaseT = 0;
    this.half = 1;
    this.clock = 0;               // real seconds elapsed in current half
    this.score = [0, 0];
    this.scorers = [[], []];
    this.paused = false;

    this.stats = {
      possession: [0.0001, 0.0001], shots: [0, 0], onTarget: [0, 0],
      passes: [0, 0], passOk: [0, 0], tackles: [0, 0],
    };
    this.pendingPass = null;      // {team} for pass accuracy tracking
    this.shotCharge = 0; this.passCharge = 0;
    this.restartInfo = null;

    this.setupKickoff(0);
  }

  /* ---------- clock helpers ---------- */
  get matchClockSeconds() {
    const perHalf = M.CLOCK_MINUTES_PER_HALF * 60;
    const frac = clamp(this.clock / this.halfLength, 0, 1);
    return (this.half - 1) * perHalf + frac * perHalf;
  }
  get displayMinute() { return Math.floor(this.matchClockSeconds / 60); }

  /* ---------- phase control ---------- */
  setPhase(phase, info) {
    this.phase = phase; this.phaseT = 0;
    this.events.onPhase?.(phase, info);
  }

  setupKickoff(kickingTeam) {
    this.ball.reset(0, 0);
    this.owner = null;
    this.teams[0].resetPositions(kickingTeam === 0);
    this.teams[1].resetPositions(kickingTeam === 1);
    this.kickoffTeam = kickingTeam;
    this.controlled = this.nearestToBall(this.userTeam, true);
    this.setPhase('KICKOFF');
  }

  setupRestart(event) {
    const spot = restartBallSpot(event, this);
    this.ball.reset(spot.x, spot.z);
    this.owner = null;
    const taker = restartTaker(event, this, spot);
    this.restartInfo = { event, taker, spot };
    if (event.team === this.userTeam || event.team === undefined) {
      this.controlled = taker;
    } else {
      this.controlled = this.nearestToBall(this.userTeam, true);
    }
    this.setPhase(event.type, event);
    this.events.onRestart?.(event);
  }

  nearestToBall(teamIdx, excludeGK) {
    let best = null, bd = 1e9;
    for (const p of this.teams[teamIdx].players) {
      if (excludeGK && p.isGK) continue;
      const d = dist2(p.pos.x, p.pos.z, this.ball.pos.x, this.ball.pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /* ---------- main update (fixed dt) ---------- */
  update(dt, input) {
    if (this.paused) return;
    this.phaseT += dt;

    switch (this.phase) {
      case 'KICKOFF':
        if (this.phaseT >= M.KICKOFF_DELAY) {
          const t = this.teams[this.kickoffTeam];
          const taker = this.nearestToBall(this.kickoffTeam, true);
          const mate = bestPass(this, t, taker);
          this.ball.lastTouch = taker; this.ball.lastTeam = this.kickoffTeam;
          if (mate) this.aiPass(taker, mate.mate, false, 0.05);
          else this.ball.kick(norm2(-t.attackDir, 0.3), 9, 0, 0);
          this.setPhase('OPEN_PLAY');
        }
        break;

      case 'THROW_IN': case 'CORNER': case 'GOAL_KICK': case 'FREE_KICK':
        this.updateRestart(dt, input);
        break;

      case 'GOAL_CELEBRATION':
        if (this.phaseT >= M.GOAL_CELEBRATION) {
          for (const t of this.teams) for (const p of t.players) if (p.state === PSTATE.CELEBRATE) p.state = PSTATE.NORMAL;
          this.setupKickoff(1 - this.lastScoringTeam);
        }
        break;

      case 'HALF_TIME':
        if (this.phaseT >= M.HALFTIME_PAUSE) {
          this.half = 2; this.clock = 0;
          for (const t of this.teams) t.attackDir *= -1;
          this.setupKickoff(1); // away kicks off 2nd half
        }
        break;

      case 'FULL_TIME':
        return;

      case 'OPEN_PLAY':
        this.updateOpenPlay(dt, input);
        break;
    }

    if (this.phase === 'OPEN_PLAY' || this.phase === 'GOAL_CELEBRATION') {
      this.ball.update(dt);
    }
    for (const t of this.teams) for (const p of t.players) p.update(dt);
    this.keepInBoundsPlayers();

    if (this.phase === 'OPEN_PLAY') {
      this.clock += dt;
      if (this.clock >= this.halfLength) {
        if (this.half === 1) { this.setPhase('HALF_TIME'); this.events.onCommentary?.('Half time!'); }
        else { this.setPhase('FULL_TIME'); this.events.onFullTime?.(); }
      }
    }
  }

  updateOpenPlay(dt, input) {
    this.applyUserInput(dt, input);
    updateAI(this, dt);
    updateGoalkeepers(this, dt);
    this.updatePossession(dt);
    const ev = checkBoundaries(this);
    if (ev) {
      if (ev.type === 'GOAL') this.onGoal(ev.scoringTeam);
      else this.setupRestart(ev);
    }
    if (this.owner) this.stats.possession[this.owner.team] += dt;
  }

  updateRestart(dt, input) {
    const { taker, spot, event } = this.restartInfo;
    const d = dist2(taker.pos.x, taker.pos.z, spot.x, spot.z);
    if (d > 1.1) {
      const dir = norm2(spot.x - taker.pos.x, spot.z - taker.pos.z);
      taker.setMove(dir.x, dir.z, 0.8, d > 8);
    } else {
      taker.setMove(0, 0, 0, false);
      taker.faceToward(this.teams[taker.team].goalX, 0);
      if (this.phaseT >= M.RESTART_DELAY) {
        const isUser = taker.team === this.userTeam;
        if (isUser && this.controlled === taker) {
          if (input?.passReleased || input?.shootReleased || this.phaseT > 4.5) {
            this.takeRestart(taker, event);
          }
        } else if (this.phaseT >= M.RESTART_DELAY + 0.55) {
          this.takeRestart(taker, event);
        }
      }
    }
    updateAI(this, dt);
  }

  takeRestart(taker, event) {
    this.ball.lastTouch = taker; this.ball.lastTeam = taker.team;
    const team = this.teams[taker.team];
    const mate = bestPass(this, team, taker);
    if (event.type === 'CORNER') {
      const dir = norm2(team.goalX - taker.pos.x, -taker.pos.z * 0.85);
      this.ball.kick(dir, 19, 7.5, Math.sign(taker.pos.z) * 3.2);
      this.events.onKick?.('cross');
    } else if (mate) {
      this.aiPass(taker, mate.mate, false, 0.06);
    } else {
      this.ball.kick(norm2(team.attackDir, 0), 14, 4, 0);
    }
    this.setPhase('OPEN_PLAY');
  }

  onGoal(scoringTeam) {
    this.score[scoringTeam]++;
    this.lastScoringTeam = scoringTeam;
    const scorer = this.ball.lastTouch && this.ball.lastTouch.team === scoringTeam
      ? this.ball.lastTouch : this.teams[scoringTeam].players[9];
    this.scorers[scoringTeam].push({ name: scorer.data.name, minute: this.displayMinute || 1 });
    // a goal always counts as a shot on target (covers deflections/own-half punts)
    this.stats.onTarget[scoringTeam]++;
    if (this.stats.onTarget[scoringTeam] > this.stats.shots[scoringTeam]) {
      this.stats.shots[scoringTeam] = this.stats.onTarget[scoringTeam];
    }
    for (const p of this.teams[scoringTeam].players) p.act(PSTATE.CELEBRATE, M.GOAL_CELEBRATION);
    this.setPhase('GOAL_CELEBRATION');
    this.events.onGoal?.(scoringTeam, scorer, this.displayMinute || 1);
  }

  /* ---------- possession / touches ---------- */
  updatePossession(dt) {
    const b = this.ball;
    if (b.pos.y > 1.6) { this.owner = null; }

    let taker = null, bd = 1e9;
    for (const t of this.teams) {
      for (const p of t.players) {
        if (!p.canPlay || p.controlCooldown > 0) continue;
        const d = dist2(p.pos.x, p.pos.z, b.pos.x, b.pos.z);
        const reach = P.CONTROL_RADIUS + (p.isGK ? 0.5 : 0);
        if (d < reach && b.pos.y < 1.6 && d < bd) { bd = d; taker = p; }
      }
    }

    if (taker) {
      const stealing = this.owner && this.owner !== taker && this.owner.team !== taker.team;
      if (!this.owner || this.owner === taker || stealing) {
        if (stealing) this.stats.tackles[taker.team]++;
        this.owner = taker;
        b.lastTouch = taker; b.lastTeam = taker.team;
        b.spin = 0;
        const sp = taker.speed;
        if (sp > 0.8) {
          const dir = norm2(taker.vel.x, taker.vel.z);
          const spacing = P.TOUCH_SPACING * (taker.sprinting ? P.SPRINT_TOUCH_MULT : 1);
          b.kick(dir, sp + spacing, 0, 0);
          taker.controlCooldown = 0.16;
        } else {
          b.vel.x *= 0.2; b.vel.z *= 0.2;
        }
        // auto-switch cursor on interception by user team
        if (M.AUTO_SWITCH && taker.team === this.userTeam && this.phase === 'OPEN_PLAY') {
          if (!this.controlled || !this.controlledHasBall()) this.controlled = taker;
        }
        // pass completion stat
        if (this.pendingPass) {
          if (taker.team === this.pendingPass.team) this.stats.passOk[this.pendingPass.team]++;
          this.pendingPass = null;
        }
      }
    } else if (this.owner) {
      const d = dist2(this.owner.pos.x, this.owner.pos.z, b.pos.x, b.pos.z);
      if (d > P.CONTROL_RADIUS + 2.4) this.owner = null;
    }
  }

  controlledHasBall() { return this.owner && this.owner === this.controlled; }

  /* ---------- user input ---------- */
  applyUserInput(dt, input) {
    if (!input) return;
    const pl = this.controlled;
    if (!pl || pl.team !== this.userTeam) { this.controlled = this.nearestToBall(this.userTeam, true); return; }

    if (input.switchPressed) this.switchPlayer();

    if (!pl.busy) pl.setMove(input.moveX, input.moveZ, input.mag, input.sprint);

    const hasBall = this.controlledHasBall();

    if (input.shootHeld && hasBall) this.shotCharge = clamp(this.shotCharge + dt / P.SHOT_CHARGE_TIME, 0, 1);
    if (input.passHeld && hasBall) this.passCharge = clamp(this.passCharge + dt / 0.7, 0, 1);

    if (input.shootReleased) {
      if (hasBall && !pl.busy) this.userShoot(pl, this.shotCharge);
      this.shotCharge = 0;
    }
    if (input.passReleased) {
      if (hasBall && !pl.busy) this.userPass(pl, this.passCharge);
      else if (!hasBall && !pl.busy) this.userTackle(pl, this.passCharge > 0.45);
      this.passCharge = 0;
    }
    if (!input.shootHeld && !input.shootReleased) this.shotCharge = 0;
  }

  switchPlayer() {
    const team = this.teams[this.userTeam];
    let best = null, bd = 1e9;
    for (const p of team.players) {
      if (p === this.controlled || p.isGK) continue;
      const d = dist2(p.pos.x, p.pos.z, this.ball.pos.x, this.ball.pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) this.controlled = best;
  }

  userPass(pl, charge) {
    const team = this.teams[pl.team];
    const long = charge > 0.55;
    const aim = (Math.abs(pl.moveInput.mag) > 0.2)
      ? norm2(pl.moveInput.x, pl.moveInput.z)
      : { x: Math.cos(pl.facing), z: Math.sin(pl.facing) };
    let best = null, bs = -1e9;
    for (const mate of team.players) {
      if (mate === pl) continue;
      const dx = mate.pos.x - pl.pos.x, dz = mate.pos.z - pl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2 || d > (long ? 48 : 30)) continue;
      const dir = norm2(dx, dz);
      const align = dot2(aim.x, aim.z, dir.x, dir.z);
      if (align < 0.1) continue;
      const score = align * 2 - d / 40;
      if (score > bs) { bs = score; best = mate; }
    }
    if (!best) best = bestPass(this, team, pl)?.mate;
    if (!best) return;
    this.aiPass(pl, best, long, 0.04, true);
  }

  userShoot(pl, charge) {
    const team = this.teams[pl.team];
    const power = P.SHOT_POWER_MIN + (P.SHOT_POWER_MAX - P.SHOT_POWER_MIN) * charge;
    const acc = pl.data.shoot / 100;
    const aimZ = clamp((pl.moveInput.mag > 0.2 ? pl.moveInput.z : 0) * (PITCH.GOAL_WIDTH / 2 + 1.5), -PITCH.GOAL_WIDTH / 2 - 1, PITCH.GOAL_WIDTH / 2 + 1);
    const err = (1 - acc) * (0.6 + charge * 0.9);
    const tz = aimZ + (Math.random() * 2 - 1) * err * 3.5;
    const dir = norm2(team.goalX - pl.pos.x, tz - pl.pos.z);
    const lift = charge * P.SHOT_LIFT_MAX * (0.35 + Math.random() * 0.5);
    const curl = (pl.moveInput.z || 0) * -2.2;
    this.strike(pl, dir, power, lift, curl, 'shot');
  }

  userTackle(pl, slide) {
    if (slide) {
      const dir = pl.moveInput.mag > 0.2 ? norm2(pl.moveInput.x, pl.moveInput.z)
        : { x: Math.cos(pl.facing), z: Math.sin(pl.facing) };
      pl.act(PSTATE.SLIDING, P.SLIDE_DURATION, dir);
      this.trySlideWin(pl);
    } else {
      this.tryStandingTackle(pl);
    }
  }

  /* ---------- shared action helpers ---------- */
  strike(pl, dir, power, lift, curl, kind) {
    if (dist2(pl.pos.x, pl.pos.z, this.ball.pos.x, this.ball.pos.z) > P.CONTROL_RADIUS + 1.2) return;
    pl.act(PSTATE.KICKING, P.KICK_DURATION);
    pl.faceToward(pl.pos.x + dir.x, pl.pos.z + dir.z);
    pl.controlCooldown = 0.3;
    this.owner = null;
    this.ball.lastTouch = pl; this.ball.lastTeam = pl.team;
    this.ball.pos.y = Math.max(this.ball.pos.y, CONFIG.BALL.RADIUS);
    this.ball.kick(dir, power, lift, curl);
    if (kind === 'shot') {
      this.stats.shots[pl.team]++;
      const team = this.teams[pl.team];
      const t = Math.abs((team.goalX - this.ball.pos.x) / (this.ball.vel.x || 1e-6));
      const zAt = this.ball.pos.z + this.ball.vel.z * t;
      if (Math.abs(zAt) < PITCH.GOAL_WIDTH / 2 + 0.4 && t < 3) this.stats.onTarget[pl.team]++;
      this.events.onKick?.('shot', power / P.SHOT_POWER_MAX);
    } else {
      this.stats.passes[pl.team]++;
      this.events.onKick?.(kind);
    }
  }

  aiPass(pl, mate, through, noise, isUser = false) {
    const lead = through ? 6.5 : 2.2;
    const tx = mate.pos.x + mate.vel.x * 0.4 + (through ? this.teams[pl.team].attackDir * lead : 0);
    const tz = mate.pos.z + mate.vel.z * 0.4;
    const d = dist2(pl.pos.x, pl.pos.z, tx, tz);
    let dir = norm2(tx - pl.pos.x, tz - pl.pos.z);
    const n = noise * (isUser ? 0.5 : 1) * (1 - pl.data.pass / 130);
    const ang = Math.atan2(dir.z, dir.x) + (Math.random() * 2 - 1) * n;
    dir = { x: Math.cos(ang), z: Math.sin(ang) };
    const long = d > 26;
    const power = long ? P.LONG_PASS_SPEED : clamp(P.PASS_SPEED_MIN + d * 0.42, P.PASS_SPEED_MIN, P.PASS_SPEED_MAX);
    const lift = long ? P.LONG_PASS_LIFT : 0;
    this.pendingPass = { team: pl.team };
    this.strike(pl, dir, power, lift, 0, long ? 'longpass' : 'pass');
  }

  aiShoot(pl) {
    const team = this.teams[pl.team];
    const d = dist2(pl.pos.x, pl.pos.z, team.goalX, 0);
    const charge = clamp(d / 26, 0.45, 1);
    const acc = pl.data.shoot / 100;
    const tz = (Math.random() * 2 - 1) * (PITCH.GOAL_WIDTH / 2) * (1.35 - acc * 0.5);
    const dir = norm2(team.goalX - pl.pos.x, tz - pl.pos.z);
    this.strike(pl, dir, P.SHOT_POWER_MIN + (P.SHOT_POWER_MAX - P.SHOT_POWER_MIN) * charge,
      charge * P.SHOT_LIFT_MAX * (0.3 + Math.random() * 0.45), (Math.random() * 2 - 1) * 1.6, 'shot');
  }

  aiClear(pl) {
    const team = this.teams[pl.team];
    const dir = norm2(team.attackDir, (Math.random() * 2 - 1) * 0.7);
    this.strike(pl, dir, 24, 8.5, 0, 'clear');
  }

  aiTackle(pl) {
    if (Math.random() < 0.5) this.tryStandingTackle(pl);
    else {
      const dir = norm2(this.ball.pos.x - pl.pos.x, this.ball.pos.z - pl.pos.z);
      pl.act(PSTATE.SLIDING, P.SLIDE_DURATION, dir);
      this.trySlideWin(pl);
    }
  }

  tryStandingTackle(pl) {
    const owner = this.owner;
    if (!owner || owner.team === pl.team) return;
    const d = dist2(pl.pos.x, pl.pos.z, this.ball.pos.x, this.ball.pos.z);
    if (d > P.TACKLE_RANGE) return;
    const win = 0.45 + (pl.data.defend - owner.data.physical) / 200;
    if (Math.random() < win) {
      this.stats.tackles[pl.team]++;
      this.owner = null;
      this.ball.lastTouch = pl; this.ball.lastTeam = pl.team;
      const dir = norm2(pl.pos.x - owner.pos.x, pl.pos.z - owner.pos.z);
      this.ball.kick(dir, 5.5, 0, 0);
      this.events.onCommentary?.(`${pl.data.name} wins it back!`);
    }
  }

  trySlideWin(pl) {
    const owner = this.owner;
    const d = dist2(pl.pos.x, pl.pos.z, this.ball.pos.x, this.ball.pos.z);
    if (d < P.SLIDE_RANGE) {
      const win = owner && owner.team !== pl.team ? 0.55 + (pl.data.defend - 60) / 220 : 0.75;
      if (Math.random() < win) {
        this.stats.tackles[pl.team]++;
        if (owner && owner.team !== pl.team) owner.act(PSTATE.FALLEN, P.FALL_DURATION);
        this.owner = null;
        this.ball.lastTouch = pl; this.ball.lastTeam = pl.team;
        this.ball.kick(norm2(pl.slideDir.x, pl.slideDir.z), 8, 0.5, 0);
      } else if (owner && owner.team !== pl.team) {
        this.events.onCommentary?.('Foul! Free kick.');
        this.setupRestart({ type: 'FREE_KICK', team: owner.team, x: this.ball.pos.x, z: this.ball.pos.z });
      }
    }
  }

  gkClaim(gk) {
    this.owner = gk;
    this.ball.lastTouch = gk; this.ball.lastTeam = gk.team;
    this.ball.reset(gk.pos.x, gk.pos.z);
    this.ball.pos.y = 1.0;
    gk.holdT = 0;
    this.events.onCommentary?.(`Great save by ${gk.data.name}!`);
  }

  keepInBoundsPlayers() {
    for (const t of this.teams) {
      for (const p of t.players) {
        p.pos.x = clamp(p.pos.x, -HALF_L - 2, HALF_L + 2);
        p.pos.z = clamp(p.pos.z, -HALF_W - 2, HALF_W + 2);
      }
    }
  }

  /** possession percentages for HUD/results */
  possessionPct() {
    const tot = this.stats.possession[0] + this.stats.possession[1];
    const h = Math.round((this.stats.possession[0] / tot) * 100);
    return [h, 100 - h];
  }
}
