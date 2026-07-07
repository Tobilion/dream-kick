/** screens.js — FIFA-style menu, team select, pre-match lineup, career mode, and results (DOM). */
import { CLUBS, pickLineup } from '../data/teams.js';
import { CONFIG } from '../core/config.js';
import { icon, stars } from './icons.js';
import { drawBadge, drawKit, drawPortrait } from './draw.js';
import { 
  initSpotlight, 
  initTilt, 
  initMagnetic, 
  scramble, 
  createGlowOrbs, 
  createProgressRing, 
  animateCounter,
  Toast 
} from './components.js';

let audioCtx = null;

function playChime(freq, type = 'sine', duration = 0.25, vol = 0.03) {
  if (window.__soundDisabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration - 0.02);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function playHoverSound() { playChime(587.33, 'sine', 0.15, 0.02); }
function playSelectSound() {
  playChime(523.25, 'triangle', 0.2, 0.04);
  setTimeout(() => playChime(783.99, 'triangle', 0.3, 0.04), 60);
}

const TIPS = [
  "TIP: Hold PASS button for a lofted long ball/cross.",
  "TIP: Hold SPRINT (Shift) to run faster, but watch your player's stamina!",
  "TIP: Switch players early using Q to position your defenders.",
  "TIP: Charge up SHOOT (C) inside the box for a powerful strike.",
  "TIP: Slide tackles commit you fully, but they are great for stopping breaks.",
  "TIP: Goalkeepers react faster on lower difficulty levels.",
  "TIP: Tap PASS when defending to perform a standing tackle."
];

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
    window.__soundDisabled = !save.sound;
    
    // Initialize career state if needed
    if (!this.save.career) {
      this.save.career = {
        clubId: null,
        week: 1,
        stats: CLUBS.map(c => ({ id: c.id, pld: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }))
      };
    }
  }

  clear() { this.root.innerHTML = ''; this.root.className = ''; }

  show(el) {
    this.clear();
    this.root.appendChild(el);
    createGlowOrbs(this.root);
    requestAnimationFrame(() => el.classList.add('in'));
  }

  hide() { this.clear(); }

  /** Diagonal Screen Wipe transition (signature moment #1) */
  triggerWipe(callback) {
    playSelectSound();
    const wipe = document.createElement('div');
    wipe.className = 'screen-wipe';
    document.body.appendChild(wipe);
    
    requestAnimationFrame(() => {
      wipe.classList.add('active');
      setTimeout(() => { if (callback) callback(); }, 150);
      setTimeout(() => { wipe.remove(); }, 350);
    });
  }

  setupInteractions(el) {
    el.querySelectorAll('.spotlight-card').forEach(c => initSpotlight(c));
    el.querySelectorAll('.tilt-card').forEach(c => initTilt(c, 8));
    el.querySelectorAll('.magnetic-btn').forEach(b => initMagnetic(b));
    el.querySelectorAll('button, .tile, .nav-item').forEach(btn => {
      btn.addEventListener('mouseenter', () => playHoverSound());
    });
  }

  /* ---------------- main menu ---------------- */
  menu() {
    const el = document.createElement('div');
    el.className = 'screen menu-screen';
    const last = this.save.results[0];
    
    el.innerHTML = `
      <div class="menu-head">
        <div class="brand">${icon('ball', 34)}<span id="scrambleBrand">DREAM<b>KICK</b></span></div>
        <div class="brand-sub">FOOTBALL ${new Date().getFullYear()}</div>
      </div>
      <div class="tile-row">
        <button class="tile primary spotlight-card tilt-card" data-act="play">
          <div class="tile-icon">${icon('play', 40)}</div>
          <div class="tile-title">KICK OFF</div>
          <div class="tile-sub">Quick match · 11v11</div>
        </button>
        <button class="tile spotlight-card tilt-card" data-act="career">
          <div class="tile-icon">${icon('trophy', 40)}</div>
          <div class="tile-title">CLASSIC CAREER</div>
          <div class="tile-sub">Lead your club to glory</div>
        </button>
        <button class="tile spotlight-card tilt-card" data-act="how">
          <div class="tile-icon">${icon('whistle', 40)}</div>
          <div class="tile-title">HOW TO PLAY</div>
          <div class="tile-sub">Controls & tips</div>
        </button>
      </div>
      ${last ? `<div class="last-result">LAST MATCH&ensp;<b>${last.home}</b> ${last.hs} – ${last.as} <b>${last.away}</b></div>` : ''}
      
      <button class="music-toggle-btn" id="soundBtn" title="Toggle Sound">
        ${icon(this.save.sound ? 'gear' : 'restart', 20)}
        <span style="font-size: 11px; font-weight:700; margin-left: 6px;">SOUND: ${this.save.sound ? 'ON' : 'OFF'}</span>
      </button>

      <div class="menu-foot" id="menuTicker">TIP: Hold SPRINT (Shift) to run faster!</div>`;
    
    // Brand scramble animation
    setTimeout(() => {
      const brandSpan = el.querySelector('#scrambleBrand');
      scramble(brandSpan, "DREAM<b>KICK</b>", 900);
    }, 100);

    // Tips rotation
    let tipIdx = 0;
    const ticker = el.querySelector('#menuTicker');
    const tipInterval = setInterval(() => {
      if (!document.body.contains(ticker)) {
        clearInterval(tipInterval);
        return;
      }
      ticker.style.opacity = 0;
      setTimeout(() => {
        tipIdx = (tipIdx + 1) % TIPS.length;
        ticker.textContent = TIPS[tipIdx];
        ticker.style.opacity = 1;
      }, 300);
    }, 6000);

    el.querySelector('[data-act=play]').onclick = () => this.triggerWipe(() => this.teamSelect());
    el.querySelector('[data-act=how]').onclick = () => this.triggerWipe(() => this.howTo());
    el.querySelector('[data-act=career]').onclick = () => this.triggerWipe(() => this.career());
    
    const soundBtn = el.querySelector('#soundBtn');
    soundBtn.onclick = () => {
      this.save.sound = !this.save.sound;
      window.__soundDisabled = !this.save.sound;
      soundBtn.innerHTML = `
        ${icon(this.save.sound ? 'gear' : 'restart', 20)}
        <span style="font-size: 11px; font-weight:700; margin-left: 6px;">SOUND: ${this.save.sound ? 'ON' : 'OFF'}</span>
      `;
      localStorage.setItem('dreamkick.v2', JSON.stringify(this.save));
      Toast.show(`Sound effects ${this.save.sound ? 'enabled' : 'disabled'}.`, 'info');
      playSelectSound();
    };

    this.show(el);
    this.setupInteractions(el);
  }

  /* ---------------- how to play ---------------- */
  howTo() {
    const el = document.createElement('div');
    el.className = 'screen how-screen';
    el.innerHTML = `
      <div class="screen-title">${icon('whistle', 26)} HOW TO PLAY</div>
      <div class="panel spotlight-card">
        <div class="how-grid">
          <div><span class="key">W A S D</span> / <span class="key">Arrows</span></div><div>Move player</div>
          <div><span class="key">X</span> / <span class="key">Space</span></div><div>Pass · hold for long ball · tackle in defence</div>
          <div><span class="key">C</span> / <span class="key">Z</span></div><div>Shoot — hold to charge power</div>
          <div><span class="key">Shift</span></div><div>Sprint (drains stamina)</div>
          <div><span class="key">Q</span></div><div>Switch player</div>
          <div><span class="key">Esc</span> / <span class="key">P</span></div><div>Pause</div>
        </div>
        <p class="dim" style="margin-top: 18px;">On mobile: left thumb virtual joystick to move, right-side buttons for PASS / SHOOT / SPRINT / SW.</p>
        <p class="dim">Your controlled player has a ring under him and a name plate. The radar at the bottom shows everyone.</p>
      </div>
      <button class="btn back magnetic-btn">${icon('arrowL', 16)} BACK</button>`;
    el.querySelector('.back').onclick = () => this.triggerWipe(() => this.menu());
    this.show(el);
    this.setupInteractions(el);
  }

  /* ---------------- team select ---------------- */
  teamSelect() {
    const el = document.createElement('div');
    el.className = 'screen select-screen';
    el.innerHTML = `
      <div class="screen-title">${icon('shirt', 26)} SELECT TEAMS</div>
      <div class="vs-wrap">
        <div class="team-col stagger-1" id="colHome"></div>
        <div class="vs-divider"><span>VS</span></div>
        <div class="team-col stagger-2" id="colAway"></div>
      </div>
      <div class="match-opts stagger-3">
        <div class="opt-group">
          <div class="opt-label">DIFFICULTY</div>
          <div class="seg" id="segDiff"></div>
        </div>
        <div class="opt-group">
          <div class="opt-label">HALF LENGTH</div>
          <div class="seg" id="segHalf"></div>
        </div>
      </div>
      <div class="select-actions stagger-4">
        <button class="btn back magnetic-btn">${icon('arrowL', 16)} BACK</button>
        <button class="btn primary big magnetic-btn" id="startBtn">${icon('play', 18)} START MATCH</button>
      </div>`;

    const renderCol = (colId, key) => {
      const col = el.querySelector(colId);
      const club = CLUBS[this.sel[key]];
      col.innerHTML = `
        <button class="chev left">${icon('arrowL', 22)}</button>
        <div class="team-card spotlight-card">
          <canvas class="badge" width="140" height="140"></canvas>
          <div class="team-name">${club.name}</div>
          <div class="team-meta">${stars(club.stars)}<span class="ovr">${club.rating}</span></div>
          <canvas class="kit" width="110" height="110"></canvas>
          <div class="kit-label">${key === 'home' ? 'HOME KIT' : 'AWAY KIT'}</div>
        </div>
        <button class="chev right">${icon('arrowR', 22)}</button>`;
      
      drawBadge(col.querySelector('.badge'), club);
      drawKit(col.querySelector('.kit'), key === 'home' ? club.kits.home : club.kits.away);
      
      col.querySelector('.left').onclick = () => {
        this.cycle(key, -1);
        renderCol(colId, key);
        playSelectSound();
        initSpotlight(col.querySelector('.team-card'));
      };
      col.querySelector('.right').onclick = () => {
        this.cycle(key, 1);
        renderCol(colId, key);
        playSelectSound();
        initSpotlight(col.querySelector('.team-card'));
      };
      col.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('mouseenter', () => playHoverSound());
      });
      initSpotlight(col.querySelector('.team-card'));
    };

    renderCol('#colHome', 'home');
    renderCol('#colAway', 'away');

    const segD = el.querySelector('#segDiff');
    for (const [k, d] of Object.entries(CONFIG.DIFFICULTY)) {
      const b = document.createElement('button');
      b.textContent = d.label.toUpperCase();
      b.className = this.sel.difficulty === k ? 'on' : '';
      b.onclick = () => {
        this.sel.difficulty = k;
        [...segD.children].forEach(c => c.className = '');
        b.className = 'on';
        playSelectSound();
      };
      segD.appendChild(b);
    }
    const segH = el.querySelector('#segHalf');
    for (const secs of CONFIG.MATCH.HALF_OPTIONS) {
      const b = document.createElement('button');
      b.textContent = `${Math.round(secs / 60)} MIN`;
      b.className = this.sel.half === secs ? 'on' : '';
      b.onclick = () => {
        this.sel.half = secs;
        [...segH.children].forEach(c => c.className = '');
        b.className = 'on';
        playSelectSound();
      };
      segH.appendChild(b);
    }

    el.querySelector('.back').onclick = () => this.triggerWipe(() => this.menu());
    el.querySelector('#startBtn').onclick = () => {
      if (this.sel.home === this.sel.away) this.sel.away = (this.sel.away + 1) % CLUBS.length;
      const opts = {
        homeClub: CLUBS[this.sel.home], 
        awayClub: CLUBS[this.sel.away],
        difficulty: this.sel.difficulty, 
        halfLength: this.sel.half,
      };
      this.triggerWipe(() => this.preMatch(opts));
    };

    this.show(el);
    this.setupInteractions(el);
  }

  cycle(key, dir) {
    this.sel[key] = (this.sel[key] + dir + CLUBS.length) % CLUBS.length;
    if (this.sel.home === this.sel.away) this.sel[key] = (this.sel[key] + dir + CLUBS.length) % CLUBS.length;
  }

  /* ---------------- pre-match lineup splash ---------------- */
  preMatch(opts) {
    const el = document.createElement('div');
    el.className = 'screen prematch-screen';
    
    const hClub = opts.homeClub;
    const aClub = opts.awayClub;
    
    const hXI = pickLineup(hClub, '442');
    const aXI = pickLineup(aClub, '442');
    
    el.innerHTML = `
      <div class="screen-title">${icon('shirt', 26)} PRE-MATCH LINEUPS</div>
      
      <div style="display: flex; gap: 24px; width: 100%; max-width: 900px; justify-content: center; align-items: stretch; margin-top: 10px;">
        <!-- Home Team Column -->
        <div class="team-card spotlight-card stagger-1" style="flex: 1; padding: 20px;">
          <canvas id="pmBadgeH" width="80" height="80"></canvas>
          <div class="team-name" style="font-size: 18px; margin: 6px 0;">${hClub.name}</div>
          <div class="team-meta" style="margin-bottom: 12px;">${stars(hClub.stars)} <span class="ovr">${hClub.rating} OVR</span></div>
          
          <div style="width: 100%; display: flex; flex-direction: column; gap: 6px;">
            ${hXI.slice(0, 11).map((p, idx) => `
              <div style="display: flex; justify-content: space-between; background: var(--surface-2); padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; transform: translateY(15px); opacity: 0; animation: fadeUpIn 0.3s forwards ${idx * 60}ms;">
                <span>${p.num}. ${p.name}</span>
                <span style="color: var(--accent);">${p.pos} (${p.overall})</span>
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- VS center divider -->
        <div class="vs-divider" style="display: flex; flex-direction: column; justify-content: center; gap: 20px;">
          <span style="font-size: 24px; padding: 12px 18px;">VS</span>
        </div>
        
        <!-- Away Team Column -->
        <div class="team-card spotlight-card stagger-2" style="flex: 1; padding: 20px;">
          <canvas id="pmBadgeA" width="80" height="80"></canvas>
          <div class="team-name" style="font-size: 18px; margin: 6px 0;">${aClub.name}</div>
          <div class="team-meta" style="margin-bottom: 12px;">${stars(aClub.stars)} <span class="ovr" style="color: var(--accent-2);">${aClub.rating} OVR</span></div>
          
          <div style="width: 100%; display: flex; flex-direction: column; gap: 6px;">
            ${aXI.slice(0, 11).map((p, idx) => `
              <div style="display: flex; justify-content: space-between; background: var(--surface-2); padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; transform: translateY(15px); opacity: 0; animation: fadeUpIn 0.3s forwards ${idx * 60}ms;">
                <span>${p.num}. ${p.name}</span>
                <span style="color: var(--accent-2);">${p.pos} (${p.overall})</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      
      <div class="select-actions stagger-3" style="margin-top: 14px;">
        <button class="btn back magnetic-btn" id="pmBackBtn">${icon('arrowL', 16)} CANCEL</button>
        <button class="btn primary big magnetic-btn" id="pmKickOffBtn">${icon('play', 18)} KICK OFF</button>
      </div>
    `;
    
    drawBadge(el.querySelector('#pmBadgeH'), hClub);
    drawBadge(el.querySelector('#pmBadgeA'), aClub);
    
    el.querySelector('#pmBackBtn').onclick = () => this.triggerWipe(() => {
      if (opts.isCareer) this.career();
      else this.teamSelect();
    });
    
    el.querySelector('#pmKickOffBtn').onclick = () => {
      Toast.show("Match loading...", "success");
      this.triggerWipe(() => this.actions.startMatch(opts));
    };
    
    this.show(el);
    this.setupInteractions(el);
  }

  /* ---------------- results ---------------- */
  results(match) {
    const el = document.createElement('div');
    el.className = 'screen results-screen';
    const [h, a] = match.teams.map(t => t.club);
    const pos = match.possessionPct();
    const s = match.stats;
    const passAcc = i => s.passes[i] ? Math.round(100 * s.passOk[i] / s.passes[i]) : 0;

    // man of the match
    const winIdx = match.score[0] >= match.score[1] ? 0 : 1;
    const motmName = match.scorers[winIdx][0]?.name;
    const motm = match.teams[winIdx].lineup.find(p => p.name === motmName) ||
      [...match.teams[winIdx].lineup].sort((x, y) => y.overall - x.overall)[0];

    const scorerList = i => match.scorers[i].map(sc => `<div class="scorer">${sc.name} ${sc.minute}'</div>`).join('') || '<div class="scorer dim">—</div>';

    el.innerHTML = `
      <div class="screen-title">${icon('trophy', 26)} FULL TIME</div>
      <div class="score-hero stagger-1">
        <div class="sh-team"><canvas width="90" height="90" id="rbH"></canvas><span>${h.name}</span></div>
        <div class="sh-score">${match.score[0]}<i>–</i>${match.score[1]}</div>
        <div class="sh-team"><canvas width="90" height="90" id="rbA"></canvas><span>${a.name}</span></div>
      </div>
      <div class="scorers-row stagger-2"><div>${scorerList(0)}</div><div>${scorerList(1)}</div></div>
      <div class="panel stats-panel spotlight-card stagger-3">
        ${statRow('POSSESSION %', pos[0], pos[1])}
        ${statRow('SHOTS', s.shots[0], s.shots[1])}
        ${statRow('ON TARGET', s.onTarget[0], s.onTarget[1])}
        ${statRow('PASSES', s.passes[0], s.passes[1])}
        ${statRow('PASS ACCURACY %', passAcc(0), passAcc(1))}
        ${statRow('TACKLES', s.tackles[0], s.tackles[1])}
      </div>
      <div class="motm-card spotlight-card stagger-4">
        <canvas width="86" height="86" id="motmP"></canvas>
        <div style="flex: 1;">
          <div class="motm-tag">MAN OF THE MATCH</div>
          <div class="motm-name">${motm.name}</div>
          <div class="dim" style="margin-top: 2px;">${match.teams[winIdx].club.name} · ${motm.pos} · OVR ${motm.overall}</div>
        </div>
        <div class="motm-ring-wrap">
          <svg id="motmRing"></svg>
          <div class="motm-val" data-counter="${motm.overall}">0</div>
        </div>
      </div>
      <div class="select-actions stagger-5">
        <button class="btn back magnetic-btn" id="homeBtn">${icon('home', 16)} MAIN MENU</button>
        <button class="btn primary big magnetic-btn" id="rematchBtn">${icon('restart', 16)} REMATCH</button>
      </div>`;
      
    drawBadge(el.querySelector('#rbH'), h);
    drawBadge(el.querySelector('#rbA'), a);
    drawPortrait(el.querySelector('#motmP'), motm, match.teams[winIdx].club.kits.home);
    
    // Progress ring for MOTM OVR rating
    setTimeout(() => {
      createProgressRing(el.querySelector('#motmRing'), motm.overall, 60, 6);
      const motmVal = el.querySelector('.motm-val');
      animateCounter(motmVal);
    }, 100);

    // animate stats bars width
    setTimeout(() => {
      el.querySelectorAll('.stat-bar').forEach(bar => {
        const i1 = bar.children[0];
        const i2 = bar.children[1];
        i1.style.width = i1.dataset.width;
        i2.style.width = i2.dataset.width;
      });
    }, 200);

    el.querySelector('#homeBtn').onclick = () => this.triggerWipe(() => {
      if (match._opts.isCareer) this.career();
      else this.actions.toMenu();
    });
    el.querySelector('#rematchBtn').onclick = () => this.triggerWipe(() => {
      this.actions.startMatch(match._opts);
    });

    this.show(el);
    this.setupInteractions(el);
  }

  /* ---------------- career / classic mode ---------------- */
  career() {
    const el = document.createElement('div');
    el.className = 'screen career-screen';
    
    // 1. Choose club phase if not set
    if (this.save.career.clubId === null) {
      el.innerHTML = `
        <div class="screen-title">${icon('trophy', 26)} CAREER MODE — CHOOSE YOUR CLUB</div>
        <div style="font-size: 14px; color: var(--muted); text-align: center; max-width: 500px;" class="stagger-1">
          Select a club to lead through the divisions. Perform well to earn points and stay at the top.
        </div>
        <div class="tile-row stagger-2" style="max-height: 50vh; overflow-y: auto; max-width: 800px; justify-content: center;">
          ${CLUBS.map(c => `
            <button class="tile spotlight-card tilt-card select-club-tile" data-club="${c.id}" style="padding: 16px; width: 170px;">
              <canvas class="badge-canvas" width="60" height="60" style="display: block; margin: 0 auto 10px;"></canvas>
              <div class="team-name" style="font-size: 13px;">${c.name}</div>
              <div class="team-meta" style="justify-content: center; margin-top: 4px;">
                <span class="ovr">${c.rating} OVR</span>
              </div>
            </button>
          `).join('')}
        </div>
        <button class="btn back magnetic-btn stagger-3" id="careerChooseBackBtn">${icon('arrowL', 16)} BACK</button>
      `;
      
      // Draw club badges
      setTimeout(() => {
        el.querySelectorAll('.select-club-tile').forEach(tile => {
          const clubId = parseInt(tile.dataset.club);
          const canvas = tile.querySelector('.badge-canvas');
          drawBadge(canvas, CLUBS[clubId]);
          tile.onclick = () => {
            this.save.career.clubId = clubId;
            this.save.career.week = 1;
            // reset stats
            this.save.career.stats = CLUBS.map(c => ({ id: c.id, pld: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
            localStorage.setItem('dreamkick.v2', JSON.stringify(this.save));
            Toast.show(`Signed contract with ${CLUBS[clubId].name}!`, 'success');
            this.triggerWipe(() => this.career());
          };
        });
      }, 50);
      
      el.querySelector('#careerChooseBackBtn').onclick = () => this.triggerWipe(() => this.menu());
      this.show(el);
      this.setupInteractions(el);
      return;
    }

    // 2. Main career screen dashboard
    const myClub = CLUBS[this.save.career.clubId];
    
    // Sort standings by points, goal diff, goals for
    const sortedStats = [...this.save.career.stats].sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const diffA = a.gf - a.ga;
      const diffB = b.gf - b.ga;
      if (diffB !== diffA) return diffB - diffA;
      return b.gf - a.gf;
    });
    
    // Determine opponent for the week (fixtures rotation)
    // We match each club systematically. For week W, my club plays a opponent.
    const oppId = (this.save.career.clubId + this.save.career.week) % CLUBS.length;
    const opponent = CLUBS[oppId === this.save.career.clubId ? (oppId + 1) % CLUBS.length : oppId];
    
    el.innerHTML = `
      <div class="screen-title">${icon('trophy', 26)} CAREER MODE — WEEK ${this.save.career.week}</div>
      
      <div class="career-layout">
        <!-- Standings Table -->
        <div class="panel career-table-panel spotlight-card stagger-1" style="max-height: 480px; overflow-y: auto;">
          <div class="section-tag">LEAGUE STANDINGS</div>
          <table class="career-table">
            <thead>
              <tr>
                <th>#</th>
                <th>CLUB</th>
                <th style="text-align: center;">PLD</th>
                <th style="text-align: center;">GD</th>
                <th style="text-align: center; color: var(--accent);">PTS</th>
              </tr>
            </thead>
            <tbody>
              ${sortedStats.map((st, idx) => {
                const club = CLUBS[st.id];
                const isMe = club.id === myClub.id;
                const gd = st.gf - st.ga;
                return `
                  <tr class="${isMe ? 'my-club' : ''} stagger-${Math.min(5, Math.floor(idx/3)+1)}">
                    <td>${idx + 1}</td>
                    <td>
                      <canvas class="badge-mini" width="22" height="22" data-club="${club.id}"></canvas>
                      ${club.name}
                    </td>
                    <td style="text-align: center; font-variant-numeric: tabular-nums;">${st.pld}</td>
                    <td style="text-align: center; font-variant-numeric: tabular-nums;">${gd > 0 ? '+' : ''}${gd}</td>
                    <td style="text-align: center; font-variant-numeric: tabular-nums; font-weight: 800;">${st.pts}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        
        <!-- Fixture / Side Panel -->
        <div class="career-side-panel">
          <div class="panel spotlight-card stagger-2" style="padding: 16px;">
            <div class="section-tag">NEXT MATCH</div>
            <div class="fixture-snap-card" style="border: none; box-shadow: none; padding: 10px 0 0 0;">
              <div class="fixture-teams-row">
                <div class="fixture-team-item">
                  <canvas id="fixBadgeMe" width="56" height="56"></canvas>
                  <div>${myClub.code}</div>
                </div>
                <div class="fixture-vs">VS</div>
                <div class="fixture-team-item">
                  <canvas id="fixBadgeOpp" width="56" height="56"></canvas>
                  <div>${opponent.code}</div>
                </div>
              </div>
              <div class="fixture-info" style="margin-top: 10px; text-align: center;">
                WEEK ${this.save.career.week} · vs ${opponent.name}
              </div>
            </div>
          </div>
          
          <div class="panel spotlight-card stagger-3" style="padding: 16px; display: flex; flex-direction: column; gap: 10px;">
            <div class="section-tag">OPTIONS</div>
            <button class="btn primary magnetic-btn" id="careerPlayBtn" style="width: 100%; justify-content: center;">
              ${icon('play', 18)} PLAY MATCH
            </button>
            <button class="btn magnetic-btn" id="careerResetBtn" style="width: 100%; justify-content: center; border-color: var(--warn); color: var(--warn);">
              RESET CAREER
            </button>
          </div>
        </div>
      </div>
      
      <div class="select-actions stagger-4" style="margin-top: 10px;">
        <button class="btn back magnetic-btn" id="careerMenuBtn">${icon('home', 16)} MAIN MENU</button>
      </div>
    `;
    
    // Draw mini badges
    setTimeout(() => {
      el.querySelectorAll('.badge-mini').forEach(c => {
        const clubId = parseInt(c.dataset.club);
        drawBadge(c, CLUBS[clubId]);
      });
      drawBadge(el.querySelector('#fixBadgeMe'), myClub);
      drawBadge(el.querySelector('#fixBadgeOpp'), opponent);
    }, 50);
    
    el.querySelector('#careerMenuBtn').onclick = () => this.triggerWipe(() => this.menu());
    
    el.querySelector('#careerPlayBtn').onclick = () => {
      const opts = {
        homeClub: myClub,
        awayClub: opponent,
        difficulty: this.sel.difficulty,
        halfLength: this.sel.half,
        isCareer: true
      };
      this.triggerWipe(() => this.preMatch(opts));
    };
    
    el.querySelector('#careerResetBtn').onclick = () => {
      if (confirm("Are you sure you want to reset your career progress?")) {
        this.save.career.clubId = null;
        this.save.career.week = 1;
        this.save.career.stats = CLUBS.map(c => ({ id: c.id, pld: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
        localStorage.setItem('dreamkick.v2', JSON.stringify(this.save));
        Toast.show("Career progress reset.", "error");
        this.triggerWipe(() => this.career());
      }
    };
    
    this.show(el);
    this.setupInteractions(el);
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
        <div class="stat-bar">
          <i data-width="${hw}%" style="width: 0%"></i>
          <i data-width="${100 - hw}%" style="width: 0%"></i>
        </div>
      </div>
      <span class="sv">${av}</span>
    </div>`;
}
