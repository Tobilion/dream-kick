/** match.js — MatchEngine: FSM states, fixed game loop, rules, stats, settings hooks.
 *  V2 Phase 3: drives BallPhysics / PossessionSystem / PassingSystem / ShootingSystem. */
import { CONFIG } from '../core/config.js';
import { clamp, dist2, norm2, makeRng } from '../core/math.js';
import { BallPhysics } from './ballPhysics.js';
import { Team } from './team.js';
import { PSTATE } from './player.js';
import { updateAI } from './ai.js';
import { updateGoalkeepers } from './goalkeeper.js';
import { checkBoundaries, restartBallSpot, restartTaker } from './rules.js';
import { PossessionSystem } from './possessionSystem.js';
import { PassingSystem } from './passingSystem.js';
import { ShootingSystem } from './shootingSystem.js';
import { foldSeasonStats } from './ratings.js';

const M = CONFIG.MATCH;
const P = CONFIG.PLAYER;
const PITCH = CONFIG.PITCH;
const HALF_L = PITCH.LENGTH / 2;
const HALF_W = PITCH.WIDTH / 2;

export const MATCH_STATE = {
  PRE_MATCH: 'PRE_MATCH',
  LINEUP_INTRO: 'LINEUP_INTRO',
  KICKOFF: 'KICKOFF',
  FIRST_HALF: 'FIRST_HALF',
  HALF_TIME: 'HALF_TIME',
  SECOND_HALF: 'SECOND_HALF',
  FULL_TIME: 'FULL_TIME',
  PAUSED: 'PAUSED'
};

export class Match {
  constructor(opts) {
    this.teams = [
      new Team(opts.homeClub, 0, opts.homeClub.formation || '442'), 
      new Team(opts.awayClub, 1, opts.awayClub.formation || '433')
    ];
    this.userTeam = opts.userTeam ?? 0;
    this.diffParams = CONFIG.DIFFICULTY[opts.difficulty || 'pro'];
    this.halfLength = opts.halfLength || 180;
    this.events = opts.events || {};

    this.ball = new BallPhysics();
    this.rng = makeRng(opts.seed ?? ((Date.now() & 0xffffff) ^ 0x9e3779));
    // determinism: no Math.random anywhere in the sim — reseed per-player AI
    // stagger and give teams the match rng for positioning jitter
    for (const t of this.teams) {
      t.rng = this.rng;
      for (const p of t.players) p.aiTimer = this.rng() * 0.2;
    }
    this.owner = null;
    this._nextKickoff = null; // set after a goal: conceding team kicks off
    this.controlled = null;
    
    this.state = MATCH_STATE.PRE_MATCH;
    this.phase = 'OPEN_PLAY'; // pitch sub-phase (OPEN_PLAY, THROW_IN, etc.)
    this.phaseT = 0;
    this.half = 1;
    this.clock = 0;
    this.score = [0, 0];
    this.scorers = [[], []];
    this.paused = false;

    this.stats = {
      possession: [0.0001, 0.0001], shots: [0, 0], onTarget: [0, 0],
      passes: [0, 0], passOk: [0, 0], tackles: [0, 0],
    };
    this.pendingPass = null;
    this.shotCharge = 0; 
    this.passCharge = 0;
    this.restartInfo = null;
    this._resumeFromHalf = false;

    this.possessionSystem = new PossessionSystem();
    this._opts = opts;
    this.syncAttackDirs(); // directions always derive from attackingDir()

    // Start in PRE_MATCH state
    this.go(MATCH_STATE.PRE_MATCH);
  }

  /**
   * SINGLE SOURCE OF TRUTH for attacking direction (V3 Phase A).
   * Derived from team index + current half; everything else (goal detection,
   * kickoffs, AI, camera) must read this — never keep its own side boolean.
   * Home (0) attacks +x in the first half.
   */
  attackingDir(teamIdx) {
    return (teamIdx === 0 ? 1 : -1) * (this.half === 1 ? 1 : -1);
  }

  /** Push the derived directions onto the Team objects (idempotent). */
  syncAttackDirs() {
    for (const t of this.teams) t.attackDir = this.attackingDir(t.index);
  }

  get matchClockSeconds() {
    const perHalf = M.CLOCK_MINUTES_PER_HALF * 60;
    const frac = clamp(this.clock / this.halfLength, 0, 1);
    return (this.half - 1) * perHalf + frac * perHalf;
  }
  get displayMinute() { return Math.floor(this.matchClockSeconds / 60); }

  go(state) {
    // Pause is an overlay: freeze/unfreeze without changing underlying state
    if (state === MATCH_STATE.PAUSED) {
      this._prevState = this.state;
      this.state = MATCH_STATE.PAUSED;
      this.paused = true;
      this.events.onStateChange?.(state);
      return;
    }
    if (state === 'UNPAUSE') {
      this.state = this._prevState || MATCH_STATE.FIRST_HALF;
      this.paused = false;
      this.events.onStateChange?.(this.state);
      return;
    }

    const prev = this.state;
    this.state = state;
    this.phaseT = 0;
    this.events.onStateChange?.(state);

    if (state === MATCH_STATE.KICKOFF) {
      // Kicker: after a goal the CONCEDING team kicks off; otherwise home
      // starts the 1st half and away starts the 2nd.
      const kicker = this._nextKickoff ?? (this.half === 1 ? 0 : 1);
      this._nextKickoff = null;
      this.setupKickoff(kicker);
    } else if (state === MATCH_STATE.HALF_TIME) {
      this.events.onCommentary?.('Half time!');
      this.events.onPhase?.('HALF_TIME');
      // UI overlay (shown by main.js onStateChange) will call startSecondHalf()
    } else if (state === MATCH_STATE.SECOND_HALF) {
      // Sides switch ONLY on the real half-time transition. Post-goal kickoffs
      // re-enter SECOND_HALF too — they must NOT flip sides or reset the clock
      // (this was the "teams switch sides after every goal" bug).
      if (prev === MATCH_STATE.HALF_TIME) {
        this.half = 2;
        this.clock = 0;
        this.syncAttackDirs();
      }
    } else if (state === MATCH_STATE.FULL_TIME) {
      foldSeasonStats(this); // per-player match stats → season totals + form
      this.events.onFullTime?.();
    }
  }

  setupKickoff(kickingTeam) {
    this.ball.reset(0, 0);
    this.owner = null;
    this.teams[0].resetPositions(kickingTeam === 0);
    this.teams[1].resetPositions(kickingTeam === 1);
    this.kickoffTeam = kickingTeam;
    this.controlled = this.nearestToBall(this.userTeam, true);
    this.phase = 'KICKOFF';
  }

  setupRestart(event) {
    const spot = restartBallSpot(event, this);
    this.ball.reset(spot.x, spot.z);
    this.owner = null;
    const taker = restartTaker(event, this, spot);
    this.restartInfo = { event, taker, spot };
    this.controlled = (event.team === this.userTeam || event.team === undefined) 
      ? taker : this.nearestToBall(this.userTeam, true);
    this.phase = event.type;
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

  update(dt, input) {
    if (this.state === MATCH_STATE.PAUSED || this.paused) return;
    this.phaseT += dt;

    // Tick entity logic & simulation elements
    if (this.state === MATCH_STATE.KICKOFF) {
      if (this.phaseT >= M.KICKOFF_DELAY) {
        const t = this.teams[this.kickoffTeam];
        const taker = this.nearestToBall(this.kickoffTeam, true);
        const mate = PassingSystem.bestTarget(this, t, taker);
        this.ball.lastTouch = taker;
        this.ball.lastTeam = this.kickoffTeam;
        if (mate) {
          PassingSystem.aiPass(this, taker, mate.mate, false);
        } else {
          this.ball.kick(norm2(-t.attackDir, 0.3), 9, 0, 0);
        }
        this.phase = 'OPEN_PLAY';
        this.go(this.half === 1 ? MATCH_STATE.FIRST_HALF : MATCH_STATE.SECOND_HALF);
      }
    } else if (this.state === MATCH_STATE.HALF_TIME) {
      // Wait for overlay callback (resumeFromHalfTime) to start second half
      if (this._resumeFromHalf) {
        this._resumeFromHalf = false;
        this.go(MATCH_STATE.SECOND_HALF);
        this.go(MATCH_STATE.KICKOFF);
      }
    } else if (this.state === MATCH_STATE.FIRST_HALF || this.state === MATCH_STATE.SECOND_HALF) {
      if (this.phase === 'THROW_IN' || this.phase === 'CORNER' || this.phase === 'GOAL_KICK' || this.phase === 'FREE_KICK') {
        this.updateRestart(dt, input);
      } else if (this.phase === 'OPEN_PLAY') {
        this.updateOpenPlay(dt, input);
        this.clock += dt;
        if (this.clock >= this.halfLength) {
          if (this.half === 1) this.go(MATCH_STATE.HALF_TIME);
          else this.go(MATCH_STATE.FULL_TIME);
        }
      } else if (this.phase === 'GOAL_CELEBRATION') {
        if (this.phaseT >= M.GOAL_CELEBRATION) {
          for (const t of this.teams) {
            for (const p of t.players) {
              if (p.state === PSTATE.CELEBRATE) p.state = PSTATE.NORMAL;
            }
          }
          this.go(MATCH_STATE.KICKOFF);
        }
      }
    }

    // Only simulate entities during active match states
    if (this.state === MATCH_STATE.KICKOFF || this.state === MATCH_STATE.FIRST_HALF ||
        this.state === MATCH_STATE.SECOND_HALF || this.state === MATCH_STATE.HALF_TIME) {
      if (this.phase === 'OPEN_PLAY' || this.phase === 'GOAL_CELEBRATION') {
        this.ball.update(dt, this.allPlayers());
      }
      for (const t of this.teams) {
        for (const p of t.players) p.update(dt);
      }
      this.keepInBoundsPlayers();
    }
  }

  allPlayers() {
    return [...this.teams[0].players, ...this.teams[1].players];
  }

  updateOpenPlay(dt, input) {
    this.applyUserInput(dt, input);
    updateAI(this, dt);
    updateGoalkeepers(this, dt);
    this.possessionSystem.update(this, dt);
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
    this.ball.lastTouch = taker;
    this.ball.lastTeam = taker.team;
    const team = this.teams[taker.team];
    const mate = PassingSystem.bestTarget(this, team, taker);
    if (event.type === 'CORNER') {
      const dir = norm2(team.goalX - taker.pos.x, -taker.pos.z * 0.85);
      this.ball.kick(dir, 19, 7.5, Math.sign(taker.pos.z) * 3.2);
      this.events.onKick?.('cross');
    } else if (mate) {
      PassingSystem.aiPass(this, taker, mate.mate, false);
    } else {
      this.ball.kick(norm2(team.attackDir, 0), 14, 4, 0);
    }
    this.phase = 'OPEN_PLAY';
  }

  onGoal(scoringTeam) {
    this.score[scoringTeam]++;
    this.lastScoringTeam = scoringTeam;
    this._nextKickoff = 1 - scoringTeam; // conceding team restarts
    const scorer = this.ball.lastTouch && this.ball.lastTouch.team === scoringTeam
      ? this.ball.lastTouch : this.teams[scoringTeam].players[9];
    this.scorers[scoringTeam].push({ name: scorer.data.name, minute: this.displayMinute || 1 });

    // per-player stat line: goal + assist (last completed same-team pass to the scorer)
    scorer.matchStats.goals++;
    const ac = this._assistCandidate;
    if (ac && ac.receiver === scorer && ac.passer.team === scoringTeam && ac.passer !== scorer) {
      ac.passer.matchStats.assists++;
    }
    this._assistCandidate = null;
    this.stats.onTarget[scoringTeam]++;
    if (this.stats.onTarget[scoringTeam] > this.stats.shots[scoringTeam]) {
      // goal without a recorded strike (deflection etc.) — credit the scorer
      this.stats.shots[scoringTeam] = this.stats.onTarget[scoringTeam];
      scorer.matchStats.shots++;
    }
    for (const p of this.teams[scoringTeam].players) p.act(PSTATE.CELEBRATE, M.GOAL_CELEBRATION);
    this.phase = 'GOAL_CELEBRATION';
    this.events.onGoal?.(scoringTeam, scorer, this.displayMinute || 1);
  }

  applyUserInput(dt, input) {
    if (this._opts?.aiOnly) return; // AI-vs-AI sims: no user cursor
    if (!input) return;
    const pl = this.controlled;
    if (!pl || pl.team !== this.userTeam) { 
      this.controlled = this.nearestToBall(this.userTeam, true); 
      return; 
    }

    if (input.switchPressed) this.switchPlayer();
    if (!pl.busy) pl.setMove(input.moveX, input.moveZ, input.mag, input.sprint);

    const hasBall = pl.hasBall;

    // B off the ball = pressure: close down the carrier (DLS-style)
    if (input.shootHeld && !hasBall && !pl.busy && this.owner && this.owner.team !== pl.team) {
      const dir = norm2(this.ball.pos.x - pl.pos.x, this.ball.pos.z - pl.pos.z);
      pl.setMove(dir.x, dir.z, 1, true);
    }

    if (input.shootHeld && hasBall) this.shotCharge = clamp(this.shotCharge + dt / P.SHOT_CHARGE_TIME, 0, 1);
    if (input.passHeld && hasBall) this.passCharge = clamp(this.passCharge + dt / 0.7, 0, 1);

    if (input.shootReleased) {
      if (hasBall && !pl.busy) ShootingSystem.userShoot(this, pl, this.shotCharge);
      this.shotCharge = 0;
    }
    if (input.passReleased) {
      if (hasBall && !pl.busy) PassingSystem.userPass(this, pl, this.passCharge);
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

  tryStandingTackle(pl) {
    // Delegated to PossessionSystem — the single tackle-contest code path.
    this.possessionSystem.attemptTackle(this, pl);
  }

  trySlideWin(pl) {
    const owner = this.owner;
    if (pl.tackleCooldownT > 0) return;
    const d = dist2(pl.pos.x, pl.pos.z, this.ball.pos.x, this.ball.pos.z);
    if (d >= P.SLIDE_RANGE) return;

    if (owner && owner.team !== pl.team) {
      const win = clamp(0.5 + (pl.data.defend - owner.data.physical) / 180, 0.2, 0.85);
      if (this.rng() < win) {
        this.stats.tackles[pl.team]++;
        owner.act(PSTATE.FALLEN, P.FALL_DURATION);
        this.possessionSystem.release(this, 0.6);
        this.ball.lastTouch = pl;
        this.ball.lastTeam = pl.team;
        this.ball.kick(norm2(pl.slideDir.x, pl.slideDir.z), 8, 0.5, 0);
        pl.controlCooldown = 0.25;
      } else {
        pl.tackleCooldownT = P.RETACKLE_COOLDOWN;
        this.events.onCommentary?.('Foul! Free kick.');
        this.setupRestart({ type: 'FREE_KICK', team: owner.team, x: this.ball.pos.x, z: this.ball.pos.z });
      }
    } else if (!owner) {
      // sliding at a loose ball just knocks it on
      this.ball.lastTouch = pl;
      this.ball.lastTeam = pl.team;
      this.ball.kick(norm2(pl.slideDir.x, pl.slideDir.z), 8, 0.5, 0);
      pl.controlCooldown = 0.25;
    }
  }

  /* ---------------- AI action delegates (same systems as the user) ---------------- */

  aiPass(pl, mate, through) {
    PassingSystem.aiPass(this, pl, mate, through);
  }

  aiShoot(pl) {
    ShootingSystem.aiShoot(this, pl);
  }

  aiClear(pl) {
    ShootingSystem.clear(this, pl);
  }

  aiTackle(pl) {
    this.possessionSystem.attemptTackle(this, pl);
  }

  gkClaim(gk) {
    gk.matchStats.saves++;
    this.owner = gk;
    gk.hasBall = true;
    this.ball.lastTouch = gk; 
    this.ball.lastTeam = gk.team;
    this.ball.reset(gk.pos.x, gk.pos.z);
    this.ball.pos.y = 1.0;
    gk.holdT = 0;
    this.events.onCommentary?.(`Great save by ${gk.data.name}!`);
  }

  resumeFromHalfTime() {
    if (this.state === MATCH_STATE.HALF_TIME) this._resumeFromHalf = true;
  }

  simToEnd() {
    const remainingTime = this.halfLength * (3 - this.half) - this.clock;
    const minutesRemaining = Math.max(1, Math.round((remainingTime / this.halfLength) * 45));
    const hClub = this.teams[0].club;
    const aClub = this.teams[1].club;
    
    for (let m = 0; m < minutesRemaining; m++) {
      const hp = 0.015 + (hClub.rating - aClub.rating) * 0.001;
      const ap = 0.015 + (aClub.rating - hClub.rating) * 0.001;
      const minute = Math.min(90, this.displayMinute + m);
      if (this.rng() < hp) {
        this.score[0]++;
        const scorer = this.teams[0].players[Math.floor(this.rng() * 11)];
        this.scorers[0].push({ name: scorer.data.name, minute });
      }
      if (this.rng() < ap) {
        this.score[1]++;
        const scorer = this.teams[1].players[Math.floor(this.rng() * 11)];
        this.scorers[1].push({ name: scorer.data.name, minute });
      }
    }

    for (let i = 0; i < 2; i++) {
      this.stats.passes[i] += Math.round(minutesRemaining * (4 + this.rng() * 3));
      this.stats.passOk[i] += Math.round(this.stats.passes[i] * (0.65 + this.rng() * 0.15));
      this.stats.tackles[i] += Math.round(minutesRemaining * (1.2 + this.rng() * 1.5));
      this.stats.shots[i] += Math.round(minutesRemaining * (0.15 + this.rng() * 0.2));
    }
    
    this.half = 2;
    this.clock = this.halfLength;
    this.go(MATCH_STATE.FULL_TIME);
  }

  forfeit() {
    this.score[1] = Math.max(3, this.score[1]);
    this.score[0] = 0;
    this.half = 2;
    this.clock = this.halfLength;
    this.go(MATCH_STATE.FULL_TIME);
  }

  keepInBoundsPlayers() {
    for (const t of this.teams) {
      for (const p of t.players) {
        p.pos.x = clamp(p.pos.x, -HALF_L - 2, HALF_L + 2);
        p.pos.z = clamp(p.pos.z, -HALF_W - 2, HALF_W + 2);
      }
    }
  }

  possessionPct() {
    const tot = this.stats.possession[0] + this.stats.possession[1];
    const h = Math.round((this.stats.possession[0] / tot) * 100);
    return [h, 100 - h];
  }
}
