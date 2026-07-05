/** touch.js — virtual analog joystick + action buttons for mobile. */
export class TouchPad {
  /** @param {object} raw shared raw input object */
  constructor(raw, enabled) {
    this.raw = raw;
    this.root = document.createElement('div');
    this.root.id = 'touchUI';
    this.root.innerHTML = `
      <div id="joyZone">
        <div id="joyBase"><div id="joyKnob"></div></div>
      </div>
      <button class="tbtn" id="tbPass">PASS</button>
      <button class="tbtn" id="tbShoot">SHOOT</button>
      <button class="tbtn" id="tbSprint">SPR</button>
      <button class="tbtn" id="tbSwitch">SW</button>
      <button class="tbtn small" id="tbPause">II</button>`;
    document.body.appendChild(this.root);
    this.root.style.display = 'none';
    if (!enabled) return;

    this.zone = this.root.querySelector('#joyZone');
    this.base = this.root.querySelector('#joyBase');
    this.knob = this.root.querySelector('#joyKnob');
    this.joyId = null; this.origin = { x: 0, y: 0 };

    this.zone.addEventListener('touchstart', e => this.joyStart(e), { passive: false });
    this.zone.addEventListener('touchmove', e => this.joyMove(e), { passive: false });
    this.zone.addEventListener('touchend', e => this.joyEnd(e));
    this.zone.addEventListener('touchcancel', e => this.joyEnd(e));

    const bind = (id, prop) => {
      const el = this.root.querySelector(id);
      el.addEventListener('touchstart', e => { e.preventDefault(); raw[prop] = true; el.classList.add('on'); }, { passive: false });
      el.addEventListener('touchend', () => { raw[prop] = false; el.classList.remove('on'); });
      el.addEventListener('touchcancel', () => { raw[prop] = false; el.classList.remove('on'); });
    };
    bind('#tbPass', 'pass');
    bind('#tbShoot', 'shoot');
    bind('#tbSprint', 'sprint');
    bind('#tbSwitch', 'switch');
    bind('#tbPause', 'pause');
  }

  show(on) { this.root.style.display = on ? 'block' : 'none'; }

  joyStart(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    this.joyId = t.identifier;
    this.origin = { x: t.clientX, y: t.clientY };
    this.base.style.display = 'block';
    this.base.style.left = (t.clientX - 55) + 'px';
    this.base.style.top = (t.clientY - 55) + 'px';
    this.knob.style.transform = 'translate(29px,29px)';
  }

  joyMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== this.joyId) continue;
      let dx = t.clientX - this.origin.x, dy = t.clientY - this.origin.y;
      const d = Math.hypot(dx, dy), max = 52;
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      this.knob.style.transform = `translate(${29 + dx}px,${29 + dy}px)`;
      const mag = Math.min(1, d / max);
      const l = d || 1;
      // screen up = -z in world
      this.raw.moveX = dx / l * (mag > 0 ? 1 : 0);
      this.raw.moveZ = dy / l * (mag > 0 ? 1 : 0);
      this.raw.mag = mag;
    }
  }

  joyEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== this.joyId) continue;
      this.joyId = null;
      this.base.style.display = 'none';
      this.raw.moveX = 0; this.raw.moveZ = 0; this.raw.mag = 0;
    }
  }
}
