/**
 * replay.js — instant replay (V4 polish). A ring buffer of the last ~8s of
 * entity positions, played back at half speed by writing positions straight
 * onto the (paused) match entities so the existing meshes/camera/HUD pipeline
 * renders it with zero extra render code. Entities are snapshotted before and
 * restored after, so the sim resumes exactly where it paused.
 */

const FPS = 60;

export class ReplayRecorder {
  constructor(match, seconds = 8) {
    this.match = match;
    this.max = seconds * FPS;
    this.frames = [];
  }

  /** Call once per fixed sim step while the match is live. */
  capture() {
    const m = this.match;
    const f = new Float32Array(4 + m.teams[0].players.length * 3 + m.teams[1].players.length * 3);
    let i = 0;
    f[i++] = m.ball.pos.x; f[i++] = m.ball.pos.y; f[i++] = m.ball.pos.z;
    f[i++] = m.clock;
    for (const t of m.teams) for (const p of t.players) {
      f[i++] = p.pos.x; f[i++] = p.pos.z; f[i++] = p.facing;
    }
    this.frames.push(f);
    if (this.frames.length > this.max) this.frames.shift();
  }

  get length() { return this.frames.length; }
  clear() { this.frames.length = 0; }
}

export class ReplayPlayer {
  /**
   * @param {ReplayRecorder} rec
   * @param {Function} onDone called after entity state is restored
   */
  constructor(rec, onDone) {
    this.rec = rec;
    this.onDone = onDone;
    this.playing = false;
    this.t = 0;
    this.speed = 0.5; // slow-mo
  }

  start() {
    if (this.rec.length < FPS) return false; // nothing worth replaying
    const m = this.rec.match;
    // snapshot live entity state
    this._snap = {
      ball: { ...m.ball.pos },
      ballVel: { ...m.ball.vel },
      players: [],
    };
    for (const t of m.teams) for (const p of t.players) {
      this._snap.players.push({ p, x: p.pos.x, z: p.pos.z, facing: p.facing });
    }
    this.t = 0;
    this.playing = true;
    return true;
  }

  /** Advance playback; call at render rate. */
  step(dt) {
    if (!this.playing) return;
    this.t += dt * FPS * this.speed;
    const frames = this.rec.frames;
    const i0 = Math.floor(this.t);
    if (i0 >= frames.length - 1) { this.stop(); return; }
    const a = frames[i0], b = frames[i0 + 1], k = this.t - i0;
    const lerp = (x, y) => x + (y - x) * k;
    const m = this.rec.match;
    m.ball.pos.x = lerp(a[0], b[0]);
    m.ball.pos.y = lerp(a[1], b[1]);
    m.ball.pos.z = lerp(a[2], b[2]);
    let j = 4, idx = 0;
    for (const t of m.teams) for (const p of t.players) {
      p.pos.x = lerp(a[j], b[j]); j++;
      p.pos.z = lerp(a[j], b[j]); j++;
      p.facing = b[j]; j++;
      idx++;
    }
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    // restore live state
    const m = this.rec.match;
    Object.assign(m.ball.pos, this._snap.ball);
    Object.assign(m.ball.vel, this._snap.ballVel);
    for (const s of this._snap.players) {
      s.p.pos.x = s.x; s.p.pos.z = s.z; s.p.facing = s.facing;
    }
    this.onDone?.();
  }
}
