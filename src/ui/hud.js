/** hud.js — broadcast scoreboard, radar, power bar, banners, pause overlay. */
import { CONFIG } from '../core/config.js';
import { formatClock } from '../core/math.js';
import { drawBadge } from './draw.js';
import { icon } from './icons.js';

const PITCH = CONFIG.PITCH;

export class Hud {
  /** @param {HTMLElement} root */
  constructor(root, actions) {
    this.root = root;
    this.actions = actions;
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div class="scoreboard">
        <canvas class="sb-badge" width="34" height="34" id="sbBH"></canvas>
        <span class="sb-code" id="sbH"></span>
        <span class="sb-score" id="sbS">0 – 0</span>
        <span class="sb-code" id="sbA"></span>
        <canvas class="sb-badge" width="34" height="34" id="sbBA"></canvas>
        <span class="sb-clock" id="sbClock">00:00</span>
        <i class="sb-underline home" id="sbUH"></i><i class="sb-underline away" id="sbUA"></i>
      </div>
      <button id="pauseBtn">${icon('pause', 18)}</button>
      <canvas id="radar" width="300" height="200"></canvas>
      <div id="powerWrap"><div id="powerBar"></div></div>
      <div id="staminaWrap"><div id="staminaBar"></div></div>
      <div id="namePlate"></div>
      <div id="goalBanner"><span id="goalText">GOAL!</span><span id="goalSub"></span></div>
      <div id="phaseBanner"></div>
      <div id="ticker"></div>
      <div id="kbHints" style="right: 14px; bottom: 14px; left: auto; text-align: right;">
        <span><b>X</b> pass/tackle</span><span><b>C</b> shoot</span><span><b>Shift</b> sprint</span><span><b>Q</b> switch</span>
      </div>
      <div id="pauseOverlay">
        <div class="pause-panel">
          <div class="pause-title">PAUSED</div>
          <button data-act="resume">▶  RESUME</button>
          <button data-act="teamMgmt">👥  TEAM MANAGEMENT</button>
          <button data-act="settings">⚙️  SETTINGS</button>
          <button data-act="simEnd">⏩  SIM TO END</button>
          <button data-act="forfeit">🏳️  FORFEIT MATCH</button>
          <button data-act="quit">✕  EXIT TO MENU</button>
        </div>
      </div>`;
    root.appendChild(this.el);
    this.el.style.display = 'none';

    this.radar = this.el.querySelector('#radar');
    this.rg = this.radar.getContext('2d');
    this.el.querySelector('#pauseBtn').onclick = () => actions.togglePause();
    this.el.querySelectorAll('#pauseOverlay button').forEach(b => {
      b.onclick = () => actions.pauseAction(b.dataset.act);
    });
    this.tickerTimeout = null;
    this.isTouch = matchMedia('(pointer:coarse)').matches;
    if (this.isTouch) {
      this.el.querySelector('#kbHints').style.display = 'none';
    }
    this.idleTime = 0;
  }

  bind(match) {
    this.match = match;
    const [h, a] = match.teams.map(t => t.club);
    this.el.querySelector('#sbH').textContent = h.code;
    this.el.querySelector('#sbA').textContent = a.code;
    drawBadge(this.el.querySelector('#sbBH'), h);
    drawBadge(this.el.querySelector('#sbBA'), a);
    this.el.querySelector('#sbUH').style.background = h.kits.home[0];
    this.el.querySelector('#sbUA').style.background = a.kits.away[0];
    this.show(true);
    this.idleTime = 0;
  }

  show(on) { this.el.style.display = on ? 'block' : 'none'; }

  setPaused(on) { this.el.querySelector('#pauseOverlay').classList.toggle('on', on); }

  goalBanner(scorer, minute, teamName) {
    const b = this.el.querySelector('#goalBanner');
    this.el.querySelector('#goalText').textContent = 'GOAL!';
    this.el.querySelector('#goalSub').textContent = `${scorer} ${minute}' — ${teamName}`;
    b.classList.add('on');
    
    // Flash scoreboard pill
    const sb = this.el.querySelector('.scoreboard');
    sb.classList.add('flash');
    
    setTimeout(() => {
      b.classList.remove('on');
      sb.classList.remove('flash');
    }, 2800);
  }

  phaseBanner(text) {
    const b = this.el.querySelector('#phaseBanner');
    b.textContent = text;
    b.classList.add('on');
    clearTimeout(this._pbT);
    this._pbT = setTimeout(() => b.classList.remove('on'), 1600);
  }

  ticker(text) {
    const t = this.el.querySelector('#ticker');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this.tickerTimeout);
    this.tickerTimeout = setTimeout(() => t.classList.remove('on'), 2600);
  }

  /** per-frame refresh */
  update(match, camera3, rendererSize, dt = 1/60) {
    this.el.querySelector('#sbS').textContent = `${match.score[0]} – ${match.score[1]}`;
    this.el.querySelector('#sbClock').textContent = formatClock(match.matchClockSeconds);

    // power bar
    const charge = Math.max(match.shotCharge, match.passCharge);
    const pw = this.el.querySelector('#powerWrap');
    pw.style.opacity = charge > 0.02 ? 1 : 0;
    this.el.querySelector('#powerBar').style.width = `${Math.round(charge * 100)}%`;

    // stamina bar positioned under the radar (updated via staminaWrap styling in css)
    const c = match.controlled;
    if (c) {
      const bar = this.el.querySelector('#staminaBar');
      bar.style.width = `${Math.round(c.stamina)}%`;
      bar.style.background = c.stamina < 25 ? 'var(--warn)' : 'var(--accent)';
      
      // Idle check for control hints
      if (Math.abs(c.vel.x) > 0.1 || Math.abs(c.vel.z) > 0.1) {
        this.idleTime = 0;
      } else {
        this.idleTime += dt;
      }
    } else {
      this.idleTime += dt;
    }

    // Keyboard hints fading
    const hints = this.el.querySelector('#kbHints');
    if (hints && !this.isTouch) {
      if (match.paused || this.idleTime < 4) {
        hints.style.opacity = '1';
        hints.style.transition = 'opacity 0.3s';
      } else {
        hints.style.opacity = '0';
        hints.style.transition = 'opacity 0.8s';
      }
    }

    // name plate above controlled player
    const np = this.el.querySelector('#namePlate');
    if (c && camera3) {
      const p = project({ x: c.pos.x, y: 2.2, z: c.pos.z }, camera3, rendererSize);
      if (p) {
        np.style.display = 'block';
        np.style.left = `${p.x}px`; np.style.top = `${p.y}px`;
        if (np.textContent !== c.data.name) np.textContent = c.data.name;
      } else np.style.display = 'none';
    }

    this.drawRadar(match);
  }

  drawRadar(match) {
    const g = this.rg, W = this.radar.width, H = this.radar.height;
    g.clearRect(0, 0, W, H);
    
    // Dark modern card style radar base
    g.fillStyle = 'rgba(18,21,28,0.85)';
    roundRect(g, 0, 0, W, H, 16); g.fill();
    
    // Border
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1.5;
    g.stroke();
    
    const pad = 12;
    const sx = (W - pad * 2) / PITCH.LENGTH, sz = (H - pad * 2) / PITCH.WIDTH;
    const X = x => pad + (x + PITCH.LENGTH / 2) * sx;
    const Z = z => pad + (z + PITCH.WIDTH / 2) * sz;
    
    // Field markings
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1;
    g.strokeRect(X(-PITCH.LENGTH / 2), Z(-PITCH.WIDTH / 2), PITCH.LENGTH * sx, PITCH.WIDTH * sz);
    g.beginPath(); g.moveTo(X(0), Z(-PITCH.WIDTH / 2)); g.lineTo(X(0), Z(PITCH.WIDTH / 2)); g.stroke();
    g.beginPath(); g.arc(X(0), Z(0), 9.15 * sx, 0, Math.PI * 2); g.stroke();

    for (const team of match.teams) {
      g.fillStyle = team.club.kits[team.index === 0 ? 'home' : 'away'][0];
      for (const p of team.players) {
        g.beginPath(); g.arc(X(p.pos.x), Z(p.pos.z), 3, 0, Math.PI * 2); g.fill();
      }
    }
    const c = match.controlled;
    if (c) {
      g.strokeStyle = '#ffffff'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(X(c.pos.x), Z(c.pos.z), 5.4, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(X(match.ball.pos.x), Z(match.ball.pos.z), 2.4, 0, Math.PI * 2); g.fill();
  }
}

/** world→screen projection; main.js installs window.__projectPoint with the live camera. */
function project(v, camera, size) {
  return window.__projectPoint ? window.__projectPoint(v.x, v.y, v.z, size) : null;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
