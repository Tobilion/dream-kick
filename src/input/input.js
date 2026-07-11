/** input.js — unified action abstraction over keyboard + touch. */
import { Keyboard } from './keyboard.js';
import { TouchPad } from './touch.js';

export class Input {
  constructor() {
    this.raw = {
      moveX: 0, moveZ: 0, mag: 0, sprint: false,
      pass: false, shoot: false, switch: false, pause: false, cycleCam: false,
    };
    this.state = {
      moveX: 0, moveZ: 0, mag: 0, sprint: false,
      passHeld: false, passReleased: false,
      shootHeld: false, shootReleased: false,
      switchPressed: false, pausePressed: false, cycleCamPressed: false,
    };
    this._prev = { pass: false, shoot: false, switch: false, pause: false, cycleCam: false };

    this.keyboard = new Keyboard(this.raw);
    this.isTouch = matchMedia('(pointer:coarse)').matches;
    this.touch = new TouchPad(this.raw, this.isTouch);
  }

  showTouchUI(on) { this.touch.show(on && this.isTouch); }

  /** call once per fixed tick; computes edge events */
  update() {
    const r = this.raw, s = this.state, p = this._prev;
    s.moveX = r.moveX; s.moveZ = r.moveZ; s.mag = r.mag; s.sprint = r.sprint;
    s.passHeld = r.pass;
    s.passReleased = p.pass && !r.pass;
    s.shootHeld = r.shoot;
    s.shootReleased = p.shoot && !r.shoot;
    s.switchPressed = !p.switch && r.switch;
    s.pausePressed = !p.pause && r.pause;
    s.cycleCamPressed = !p.cycleCam && r.cycleCam;
    p.pass = r.pass; p.shoot = r.shoot; p.switch = r.switch; p.pause = r.pause; p.cycleCam = r.cycleCam;
  }
}
