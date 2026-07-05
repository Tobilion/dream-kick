/** screens.js — FIFA-style menu, team select and results screens (DOM). */
import { CLUBS } from '../data/teams.js';
import { CONFIG } from '../core/config.js';
import { icon, stars } from './icons.js';
import { drawBadge, drawKit, drawPortrait } from './draw.js';

export class Screens {
  /**
   * @param {HTMLElement} root
   * @param {object} save persisted settings
   * @param {{startMatch:Function, toMenu:Function}} actions
   */
  constructor(root, save, actions) {
    this.root = root;
    this.save = save;
    this.actions = actions;
    this.sel = { home: save.homeTeam ?? 0, away: save.awayTeam ?? 1, difficulty: save.difficulty, half: save.halfLength };
  }

  clear() { this.root.innerHTML = ''; this.root.className = ''; }

  show(el) {
    this.clear();
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
  }

  hide() { this.clear(); }

  /* ---------------- main menu ---------------- */
  menu() {
    const el = document.createElement('div');
    el.className = 'screen menu-screen';
    const last = this.save.results[0];
    el.innerHTML = `
      <div class="menu-head">
        <div class="brand">${icon('ball', 34)}<span>DREAM<b>KICK</b></span></div>
        <div class="brand-sub">FOOTBALL ${new Date().getFullYear()}</div>
      </div>
      <div class="tile-row">
        <button class="tile primary" data-act="play">
          <div class="tile-icon">${icon('play', 40)}</div>
          <div class="tile-title">KICK OFF</div>
          <div class="tile-sub">Quick match · 11v11</div>
        </button>
        <button class="tile" data-act="how">
          <div class="tile-icon">${icon('whistle', 40)}</div>
          <div class="tile-title">HOW TO PLAY</div>
          <div class="tile-sub">Controls & tips</div>
        </button>
        <button class="tile" data-act="legacy">
          <div class="tile-icon">${icon('trophy', 40)}</div>
          <div class="tile-title">CLASSIC MODE</div>
          <div class="tile-sub">Original 2D career</div>
        </button>
      </div>
      ${last ? `<div class="last-result">LAST MATCH&ensp;<b>${last.home}</b> ${last.hs} – ${last.as} <b>${last.away}</b></div>` : ''}
      <div class="menu-foot">100% code-drawn · works offline · keyboard & touch</div>`;
    el.querySelector('[data-act=play]').onclick = () => this.teamSelect();
    el.querySelector('[data-act=how]').onclick = () => this.howTo();
    el.querySelector('[data-act=legacy]').onclick = () => { location.href = 'legacy_v1.html'; };
    this.show(el);
  }

  /* ---------------- how to play ---------------- */
  howTo() {
    const el = document.createElement('div');
    el.className = 'screen how-screen';
    el.innerHTML = `
      <div class="screen-title">${icon('whistle', 26)} HOW TO PLAY</div>
      <div class="panel">
        <div class="how-grid">
          <div><span class="key">W A S D</span> / <span class="key">Arrows</span></div><div>Move player</div>
          <div><span class="key">X</span> / <span class="key">Space</span></div><div>Pass · hold for long ball · tackle in defence (hold = slide)</div>
          <div><span class="key">C</span> / <span class="key">Z</span></div><div>Shoot — hold to charge power</div>
          <div><span class="key">Shift</span></div><div>Sprint (drains stamina)</div>
          <div><span class="key">Q</span></div><div>Switch player</div>
          <div><span class="key">Esc</span> / <span class="key">P</span></div><div>Pause</div>
        </div>
        <p class="dim">On mobile: left thumb joystick to move, right-side buttons for PASS / SHOOT / SPRINT / SW.</p>
        <p class="dim">Your controlled player has a ring under him and a name plate. The radar at the bottom shows everyone.</p>
      </div>
      <button class="btn back">${icon('arrowL', 16)} BACK</button>`;
    el.querySelector('.back').onclick = () => this.menu();
    this.show(el);
  }

  /* ---------------- team select ---------------- */
  teamSelect() {
    const el = document.createElement('div');
    el.className = 'screen select-screen';
    el.innerHTML = `
      <div class="screen-title">${icon('shirt', 26)} SELECT TEAMS</div>
      <div class="vs-wrap">
        <div class="team-col" id="colHome"></div>
        <div class="vs-divider"><span>VS</span></div>
        <div class="team-col" id="colAway"></div>
      </div>
      <div class="match-opts">
        <div class="opt-group">
          <div class="opt-label">DIFFICULTY</div>
          <div class="seg" id="segDiff"></div>
        </div>
        <div class="opt-group">
          <div class="opt-label">HALF LENGTH</div>
          <div class="seg" id="segHalf"></div>
        </div>
      </div>
      <div class="select-actions">
        <button class="btn back">${icon('arrowL', 16)} BACK</button>
        <button class="btn primary big" id="startBtn">${icon('play', 18)} START MATCH</button>
      </div>`;

    const renderCol = (colId, key) => {
      const col = el.querySelector(colId);
      const club = CLUBS[this.sel[key]];
      col.innerHTML = `
        <button class="chev left">${icon('arrowL', 22)}</button>
        <div class="team-card">
          <canvas class="badge" width="140" height="140"></canvas>
          <div class="team-name">${club.name}</div>
          <div class="team-meta">${stars(club.stars)}<span class="ovr">${club.rating}</span></div>
          <canvas class="kit" width="110" height="110"></canvas>
          <div class="kit-label">${key === 'home' ? 'HOME KIT' : 'AWAY KIT'}</div>
        </div>
        <button class="chev right">${icon('arrowR', 22)}</button>`;
      drawBadge(col.querySelector('.badge'), club);
      drawKit(col.querySelector('.kit'), key === 'home' ? club.kits.home : club.kits.away);
      col.querySelector('.left').onclick = () => { this.cycle(key, -1); renderCol(colId, key); };
      col.querySelector('.right').onclick = () => { this.cycle(key, 1); renderCol(colId, key); };
    };
    renderCol('#colHome', 'home');
    renderCol('#colAway', 'away');

    // difficulty segments
    const segD = el.querySelector('#segDiff');
    for (const [k, d] of Object.entries(CONFIG.DIFFICULTY)) {
      const b = document.createElement('button');
      b.textContent = d.label.toUpperCase();
      b.className = this.sel.difficulty === k ? 'on' : '';
      b.onclick = () => { this.sel.difficulty = k; [...segD.children].forEach(c => c.className = ''); b.className = 'on'; };
      segD.appendChild(b);
    }
    const segH = el.querySelector('#segHalf');
    for (const secs of CONFIG.MATCH.HALF_OPTIONS) {
      const b = document.createElement('button');
      b.textContent = `${Math.round(secs / 60)} MIN`;
      b.className = this.sel.half === secs ? 'on' : '';
      b.onclick = () => { this.sel.half = secs; [...segH.children].forEach(c => c.className = ''); b.className = 'on'; };
      segH.appendChild(b);
    }

    el.querySelector('.back').onclick = () => this.menu();
    el.querySelector('#startBtn').onclick = () => {
      if (this.sel.home === this.sel.away) this.sel.away = (this.sel.away + 1) % CLUBS.length;
      this.actions.startMatch({
        homeClub: CLUBS[this.sel.home], awayClub: CLUBS[this.sel.away],
        difficulty: this.sel.difficulty, halfLength: this.sel.half,
      });
    };
    this.show(el);
  }

  cycle(key, dir) {
    this.sel[key] = (this.sel[key] + dir + CLUBS.length) % CLUBS.length;
    if (this.sel.home === this.sel.away) this.sel[key] = (this.sel[key] + dir + CLUBS.length) % CLUBS.length;
  }

  /* ---------------- results ---------------- */
  results(match) {
    const el = document.createElement('div');
    el.className = 'screen results-screen';
    const [h, a] = match.teams.map(t => t.club);
    const pos = match.possessionPct();
    const s = match.stats;
    const passAcc = i => s.passes[i] ? Math.round(100 * s.passOk[i] / s.passes[i]) : 0;

    // man of the match: top scorer of winning side, else best-rated involved
    const winIdx = match.score[0] >= match.score[1] ? 0 : 1;
    const motmName = match.scorers[winIdx][0]?.name;
    const motm = match.teams[winIdx].lineup.find(p => p.name === motmName) ||
      [...match.teams[winIdx].lineup].sort((x, y) => y.overall - x.overall)[0];

    const scorerList = i => match.scorers[i].map(sc => `<div class="scorer">${sc.name} ${sc.minute}'</div>`).join('') || '<div class="scorer dim">—</div>';

    el.innerHTML = `
      <div class="screen-title">${icon('trophy', 26)} FULL TIME</div>
      <div class="score-hero">
        <div class="sh-team"><canvas width="90" height="90" id="rbH"></canvas><span>${h.name}</span></div>
        <div class="sh-score">${match.score[0]}<i>–</i>${match.score[1]}</div>
        <div class="sh-team"><canvas width="90" height="90" id="rbA"></canvas><span>${a.name}</span></div>
      </div>
      <div class="scorers-row"><div>${scorerList(0)}</div><div>${scorerList(1)}</div></div>
      <div class="panel stats-panel">
        ${statRow('POSSESSION %', pos[0], pos[1])}
        ${statRow('SHOTS', s.shots[0], s.shots[1])}
        ${statRow('ON TARGET', s.onTarget[0], s.onTarget[1])}
        ${statRow('PASSES', s.passes[0], s.passes[1])}
        ${statRow('PASS ACCURACY %', passAcc(0), passAcc(1))}
        ${statRow('TACKLES', s.tackles[0], s.tackles[1])}
      </div>
      <div class="motm-card">
        <canvas width="86" height="86" id="motmP"></canvas>
        <div>
          <div class="motm-tag">MAN OF THE MATCH</div>
          <div class="motm-name">${motm.name}</div>
          <div class="dim">${match.teams[winIdx].club.name} · ${motm.pos} · OVR ${motm.overall}</div>
        </div>
      </div>
      <div class="select-actions">
        <button class="btn" id="homeBtn">${icon('home', 16)} MAIN MENU</button>
        <button class="btn primary big" id="rematchBtn">${icon('restart', 16)} REMATCH</button>
      </div>`;
    drawBadge(el.querySelector('#rbH'), h);
    drawBadge(el.querySelector('#rbA'), a);
    drawPortrait(el.querySelector('#motmP'), motm, match.teams[winIdx].club.kits.home);
    el.querySelector('#homeBtn').onclick = () => this.actions.toMenu();
    el.querySelector('#rematchBtn').onclick = () => this.actions.startMatch({
      homeClub: h, awayClub: a, difficulty: this.sel.difficulty, halfLength: this.sel.half,
    });
    this.show(el);
  }
}

function statRow(label, hv, av) {
  const tot = (hv + av) || 1;
  const hw = Math.round((hv / tot) * 100);
  return `
    <div class="stat-row">
      <span class="sv">${hv}</span>
      <div class="stat-mid">
        <div class="stat-label">${label}</div>
        <div class="stat-bar"><i style="width:${hw}%"></i><i style="width:${100 - hw}%"></i></div>
      </div>
      <span class="sv">${av}</span>
    </div>`;
}
