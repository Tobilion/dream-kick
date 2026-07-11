/** keyboard.js — WASD/arrows + action keys writing into the shared raw input. */
export class Keyboard {
  /** @param {object} raw shared raw input object from Input */
  constructor(raw) {
    this.raw = raw;
    this.keys = new Set();
    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.apply();
    });
    addEventListener('keyup', e => { this.keys.delete(e.code); this.apply(); });
    addEventListener('blur', () => { this.keys.clear(); this.apply(); });
  }

  apply() {
    const k = this.keys, r = this.raw;
    // NOTE: screen-space mapping — camera looks down -z, so up = -z.
    let x = 0, z = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    const l = Math.hypot(x, z) || 1;
    r.moveX = x / l; r.moveZ = z / l;
    r.mag = (x || z) ? 1 : 0;
    r.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    r.pass = k.has('KeyX') || k.has('Space');
    r.shoot = k.has('KeyC') || k.has('KeyZ');
    r.switch = k.has('KeyQ') || k.has('Tab');
    r.pause = k.has('Escape') || k.has('KeyP');
    r.cycleCam = k.has('KeyF') || k.has('KeyR');
  }
}
