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
import { computeMatchRatings, ratingsPanelHTML } from './matchFlow.js';
import {
  CAREER_VERSION, newCareer, seasonOver, userFixture, leagueTable, leaguePosition,
  teamFormLetters, topScorer, totalRounds, completeRound, syncSeasonStats, endSeason,
  divisionOf, leagueLeaderboards, goldenBoot, applyCareerToClubs,
} from '../core/career.js';
import { initFinance, wageBill, seasonProjection } from '../core/finance.js';
import { hubTile, hubGrid, fmtCoins } from './hub.js';
import { fixturesPage, tablePage, financesPage, cupPage } from './pages/careerPages.js';
import { ensureCup, cupFinished, userCupLabel, playCupRound, CUP_ROUND_NAMES, CUP_WEEKS } from '../core/cup.js';
import { marketPage, squadPage } from './pages/clubPages.js';
import { trainingPage } from './pages/trainingPages.js';
import { leaderboardPage } from './pages/leaderboards.js';
import { howToPlayPage } from './pages/howToPlay.js';
import { boardPage } from './pages/boardPage.js';
import { windowOpen, nextWindowWeek } from '../core/transfers.js';
import { getConfidenceLabel, getConfidenceColor, ensureBoardState } from '../core/board.js';


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

export const TIPS = [
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
    
    // career init/migration is handled by migrateCareer() in main.js at boot
    if (!this.save.career) this.save.career = { version: CAREER_VERSION, clubId: null };
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
    
    // setTimeout (not rAF) so transitions still complete in a backgrounded tab
    setTimeout(() => {
      wipe.classList.add('active');
      setTimeout(() => { if (callback) callback(); }, 150);
      setTimeout(() => { wipe.remove(); }, 350);
    }, 16);
  }

  setupInteractions(el) {
    el.querySelectorAll('.spotlight-card').forEach(c => initSpotlight(c));
    el.querySelectorAll('.tilt-card').forEach(c => initTilt(c, 8));
    el.querySelectorAll('.magnetic-btn').forEach(b => initMagnetic(b));
    el.querySelectorAll('button, .tile, .nav-item').forEach(btn => {
      btn.addEventListener('mouseenter', () => playHoverSound());
    });
  }

  /* ---------------- main menu: V5 U1 home hub ---------------- */
  menu() {
    const el = document.createElement('div');
    el.className = 'screen menu-screen hub-screen';
    const last = this.save.results[0];
    const career = this.save.career;
    const hasCareer = career && career.clubId !== null && career.version;
    const club = hasCareer ? CLUBS[career.clubId] : null;
    const marketOpen = hasCareer && !!career.rounds && windowOpen(career);
    const headline = career?.market?.news?.[0]?.text;

    el.innerHTML = `
      <div class="menu-head">
        <div class="brand">${icon('ball', 34)}<span id="scrambleBrand">DREAM<b>KICK</b></span></div>
        <div class="brand-sub">FOOTBALL ${new Date().getFullYear()}</div>
      </div>
      <div id="homeHub"></div>
      <button class="music-toggle-btn" id="soundBtn" title="Toggle Sound">
        ${icon(this.save.sound ? 'sound' : 'soundOff', 20)}
        <span style="font-size: 11px; font-weight:700; margin-left: 6px;">SOUND: ${this.save.sound ? 'ON' : 'OFF'}</span>
      </button>
      <div class="menu-foot" id="menuTicker">TIP: Hold SPRINT (Shift) to run faster!</div>`;

    const careerLive = hasCareer && club
      ? `<b>${club.name}</b> · S${career.season || 1}${career.rounds ? ` · MD ${Math.min(career.week, career.rounds.length)}/${career.rounds.length}` : ''}
         ${career.rounds ? `<span class="form-chips" style="margin-left:8px;">${teamFormLetters(career).map(f => `<i class="fc-${f}">${f}</i>`).join('')}</span>` : ''}`
      : 'Start your journey';
    const tiles = [
      hubTile({ icon: 'play', title: 'KICK OFF', sub: 'Quick match · 11v11', size: 'hero', accent: true,
        liveHTML: last ? `LAST&ensp;<b>${last.home}</b> ${last.hs}–${last.as} <b>${last.away}</b>` : '',
        onOpen: () => this.triggerWipe(() => this.teamSelect()) }),
      hubTile({ icon: 'trophy', title: 'CAREER', sub: 'Lead your club to glory', size: 'wide',
        liveHTML: careerLive, onOpen: () => this.triggerWipe(() => this.career()) }),
      hubTile({ icon: 'swap', title: 'TRANSFERS', sub: hasCareer ? 'Market & listings' : 'Needs a career',
        badge: marketOpen ? 'OPEN' : '', onOpen: () => {
          if (!hasCareer || !career.rounds) { Toast.show('Start a career first.', 'info'); return; }
          this.triggerWipe(() => marketPage(this, career));
        } }),
      hubTile({ icon: 'news', title: 'CLUB NEWS', sub: headline ? '' : 'No headlines yet',
        liveHTML: headline ? `<span class="dim">${headline}</span>` : '',
        onOpen: () => {
          if (!hasCareer || !career.rounds) { Toast.show('Start a career first.', 'info'); return; }
          this.triggerWipe(() => marketPage(this, career));
        } }),
      hubTile({ icon: 'question', title: 'HOW TO PLAY', sub: 'Controls & tips',
        onOpen: () => this.triggerWipe(() => howToPlayPage(this)) }),
      hubTile({ icon: 'gear', title: 'SETTINGS', sub: 'Camera · difficulty · sound',
        onOpen: () => this.actions.openSettings() }),
    ];
    el.querySelector('#homeHub').replaceWith(hubGrid(tiles));

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

    const soundBtn = el.querySelector('#soundBtn');
    soundBtn.onclick = () => {
      this.save.sound = !this.save.sound;
      window.__soundDisabled = !this.save.sound;
      soundBtn.innerHTML = `
        ${icon(this.save.sound ? 'sound' : 'soundOff', 20)}
        <span style="font-size: 11px; font-weight:700; margin-left: 6px;">SOUND: ${this.save.sound ? 'ON' : 'OFF'}</span>
      `;
      localStorage.setItem('dreamkick.v2', JSON.stringify(this.save));
      Toast.show(`Sound effects ${this.save.sound ? 'enabled' : 'disabled'}.`, 'info');
      playSelectSound();
    };

    this.show(el);
    this.setupInteractions(el);
  }

  /* how to play: promoted to ui/pages/howToPlay.js (V5 U4) */

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

    // per-player match ratings (Sport Sim-style); MOTM = top-rated of winning team
    const ratings = computeMatchRatings(match);
    const winIdx = match.score[0] >= match.score[1] ? 0 : 1;
    const motmEntity = [...match.teams[winIdx].players]
      .sort((x, y) => (ratings.get(y) || 0) - (ratings.get(x) || 0))[0];
    const motm = motmEntity.data;
    const motmRating = ratings.get(motmEntity) || 6;

    const scorerList = i => match.scorers[i].map(sc => `<div class="scorer">${sc.name} ${sc.minute}'</div>`).join('') || '<div class="scorer dim">—</div>';

    el.innerHTML = `
      <div class="screen-title">${icon('trophy', 26)} FULL TIME</div>
      <div class="score-hero stagger-1">
        <div class="sh-team"><canvas width="90" height="90" id="rbH"></canvas><span>${h.name}</span></div>
        <div class="sh-score">${match.score[0]}<i>–</i>${match.score[1]}</div>
        <div class="sh-team"><canvas width="90" height="90" id="rbA"></canvas><span>${a.name}</span></div>
      </div>
      <div class="scorers-row stagger-2"><div>${scorerList(0)}</div><div>${scorerList(1)}</div></div>
      ${match._cupNote ? `<div class="stagger-2" style="text-align:center; font-weight:800; color:var(--accent); letter-spacing:0.06em;">${icon('trophy', 14)} DREAM CUP — ${match._cupNote}</div>` : ''}
      <div class="results-grid stagger-3">
        <div class="panel stats-panel spotlight-card" style="max-width:none;">
          <div class="section-tag" style="margin-bottom:8px;">MATCH STATS</div>
          ${statRow('POSSESSION %', pos[0], pos[1])}
          ${statRow('SHOTS', s.shots[0], s.shots[1])}
          ${statRow('ON TARGET', s.onTarget[0], s.onTarget[1])}
          ${statRow('PASSES', s.passes[0], s.passes[1])}
          ${statRow('PASS ACCURACY %', passAcc(0), passAcc(1))}
          ${statRow('TACKLES', s.tackles[0], s.tackles[1])}
        </div>
        <div style="display:flex; flex-direction:column; gap:14px; min-width:0;">
          <div class="motm-card spotlight-card">
            <canvas width="86" height="86" id="motmP"></canvas>
            <div style="flex: 1; min-width:0;">
              <div class="motm-tag">MAN OF THE MATCH</div>
              <div class="motm-name">${motm.name}</div>
              <div class="dim" style="margin-top: 2px;">${match.teams[winIdx].club.name} · ${motm.pos} · Match rating ${motmRating.toFixed(1)}</div>
            </div>
            <div class="motm-ring-wrap">
              <svg id="motmRing"></svg>
              <div class="motm-val" data-counter="${motm.overall}">0</div>
            </div>
          </div>
          ${ratingsPanelHTML(match, ratings)}
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

  /* half-time overlay: RETIRED (V2 Phase 4) — replaced by showHalfTimeMenu in ui/matchFlow.js */

  /* ---------------- career / classic mode ---------------- */

  career() {
    const el = document.createElement('div');
    el.className = 'screen career-screen hub-screen';
    
    // 1. Choose club phase if not set
    if (this.save.career.clubId === null) {
      const isSacked = this.save.career.sackedRestart;
      const sortedClubs = [...CLUBS].sort((a, b) => b.rating - a.rating);
      const bottom10 = sortedClubs.slice(10);
      const listClubs = isSacked ? bottom10 : CLUBS;

      el.innerHTML = `
        <div class="screen-title">${icon('trophy', 26)} ${isSacked ? 'RESTART CAREER — SELECT NEW CLUB' : 'CAREER MODE — CHOOSE YOUR CLUB'}</div>
        <div style="font-size: 14px; color: var(--muted); text-align: center; max-width: 500px;" class="stagger-1">
          ${isSacked 
            ? 'Following your dismissal, you must rebuild your manager reputation. Sign with a bottom-half club to restart.' 
            : 'Select a club to lead through the divisions. Perform well to earn points and stay at the top.'
          }
        </div>
        <div class="tile-row stagger-2" style="max-height: 50vh; overflow-y: auto; max-width: 800px; justify-content: center;">
          ${listClubs.map(c => `
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
            const history = this.save.career.history || [];
            const season = this.save.career.season || 1;
            
            // Build new career, preserving season and history
            this.save.career = newCareer(clubId, season, history);
            this.save.career.sackedRestart = false;
            
            applyCareerToClubs(this.save.career);
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


    // 2. Season over → summary + roll into next season
    const career = this.save.career;
    if (seasonOver(career)) { this.seasonSummary(el, career); return; }

    // 3. Main career dashboard
    const myClub = CLUBS[career.clubId];
    ensureBoardState(career);

    // L3: Show board confidence change toast
    if (career.board && career.board.lastDelta !== undefined && career.board.lastDelta !== 0) {
      const delta = career.board.lastDelta;
      career.board.lastDelta = 0;
      const label = getConfidenceLabel(career.board.confidence);
      const isPositive = delta > 0;
      const type = isPositive ? 'success' : 'error';
      const arrow = isPositive ? '▲' : '▼';
      Toast.show(`Board Confidence: ${career.board.confidence}% (${isPositive ? '+' : ''}${delta}% ${arrow} — ${label})`, type, 3500);
    }

    // L2: Fire unsettled Toast for any user-squad player whose morale just dipped below 35
    for (const p of myClub.squad) {
      if ((p.morale ?? 70) < 35 && !p._moraleAlertShown) {
        p._moraleAlertShown = true;
        Toast.show(`UNSETTLED: ${p.name} is unhappy (Morale: ${p.morale})`, 'error', 4000);
      } else if ((p.morale ?? 70) >= 35) {
        p._moraleAlertShown = false;
      }
    }


    const table = leagueTable(career);
    const pos = leaguePosition(career);
    const form = teamFormLetters(career);
    const scorer = topScorer(career);
    const fx = userFixture(career);
    const opponent = CLUBS[fx.home === career.clubId ? fx.away : fx.home];
    const atHome = fx.home === career.clubId;
    const fin = career.finance || initFinance(myClub.rating);
    const wages = wageBill(myClub.squad);
    const projection = seasonProjection(fin, totalRounds(career) - career.week + 1, pos);


    const news = (career.market?.news || []).slice(0, 4);
    el.innerHTML = `
      <div class="career-hero stagger-1">
        <div class="ch-club">
          <canvas id="chBadge" width="54" height="54"></canvas>
          <div>
            <div class="ch-name">${myClub.name.toUpperCase()}</div>
            <div class="ch-sub">SEASON ${career.season} · MATCHDAY ${career.week}/${totalRounds(career)} · DIVISION ${career.division || divisionOf(career)}</div>
          </div>
        </div>
        <div class="ch-stats">
          <div class="ch-stat"><b>${pos}${['st','nd','rd'][pos-1] || 'th'}</b><span>POSITION</span></div>
          <div class="ch-stat"><b>${table.find(r => r.id === myClub.id)?.pts ?? 0}</b><span>POINTS</span></div>
          <div class="ch-stat"><b style="color:${fin.balance < 0 ? '#e05263' : 'var(--accent)'};">${fmtCoins(fin.balance)}</b><span>BUDGET</span></div>
          <div class="ch-stat"><b>${Math.round(myClub.squad.reduce((s, p) => s + p.overall, 0) / myClub.squad.length)}</b><span>SQUAD OVR</span></div>
        </div>
      </div>

      <div id="careerHub"></div>

      <div class="select-actions stagger-5" style="margin-top: 4px;">
        <button class="btn back magnetic-btn" id="careerMenuBtn">${icon('home', 16)} MAIN MENU</button>
      </div>
    `;

    // ---- V5 U2: career hub tiles (boxes → dedicated pages) ----
    const miniIdx = table.findIndex(r => r.id === myClub.id);
    const slice = table.slice(Math.max(0, Math.min(miniIdx - 1, table.length - 3)), Math.max(3, miniIdx + 2));
    const miniTable = slice.map(r => {
      const p = table.indexOf(r) + 1;
      return `<span class="mini-row ${r.id === myClub.id ? 'mine' : ''}"><i>${p}</i> ${CLUBS[r.id].code} <b>${r.pts}</b></span>`;
    }).join('');
    const next3 = [];
    for (let w = career.week; w <= career.rounds.length && next3.length < 3; w++) {
      const f = career.rounds[w - 1].find(x => x.home === myClub.id || x.away === myClub.id);
      if (f) next3.push(`<span class="dim">MD${w}</span> ${f.home === myClub.id ? 'vs ' + CLUBS[f.away].code : '@ ' + CLUBS[f.home].code}`);
    }
    const tiles = [
      hubTile({ icon: 'play', title: fx.cup ? 'NEXT MATCH · DREAM CUP' : 'NEXT MATCH', size: 'hero', accent: true,
        sub: fx.cup
          ? `CUP ${CUP_ROUND_NAMES[ensureCup(career).round]} · ${atHome ? 'HOME vs' : 'AWAY @'} ${opponent.name}`
          : `MATCHDAY ${career.week} · ${atHome ? 'HOME vs' : 'AWAY @'} ${opponent.name}`,
        liveHTML: `<span class="nm-badges"><canvas id="nmMe" width="44" height="44"></canvas><b>VS</b><canvas id="nmOpp" width="44" height="44"></canvas></span>`,
        onOpen: () => this.triggerWipe(() => this.preMatch({
          homeClub: myClub, awayClub: opponent,
          difficulty: this.sel.difficulty, halfLength: this.sel.half, isCareer: true,
          trainingFocus: career.trainingFocus || 'Youth',
          coaches: career.coaches || {},
        })) }),
      hubTile({ icon: 'tablelist', title: 'LEAGUE TABLE', size: 'wide',
        sub: `You are ${pos}${['st','nd','rd'][pos-1] || 'th'} · ${form.map(f => f).join(' ') || 'no games yet'}`,
        liveHTML: `<span class="mini-table">${miniTable}</span>`,
        onOpen: () => this.triggerWipe(() => tablePage(this, career)) }),
      hubTile({ icon: 'calendar', title: 'FIXTURES', sub: `${totalRounds(career) - career.week + 1} rounds left`,
        liveHTML: next3.join('<br>'),
        onOpen: () => this.triggerWipe(() => fixturesPage(this, career)) }),
      hubTile({ icon: 'trophy', title: 'DREAM CUP',
        sub: (() => {
          const cup = ensureCup(career);
          if (cupFinished(cup)) return `${CLUBS[cup.champion].code} champions · You: ${userCupLabel(career)}`;
          if (cup.userOut !== null) return userCupLabel(career);
          return `${CUP_ROUND_NAMES[cup.round]} · MD ${CUP_WEEKS[cup.round]}`;
        })(),
        badge: fx.cup ? 'NEXT' : '',
        onOpen: () => this.triggerWipe(() => cupPage(this, career)) }),
      hubTile({ icon: 'coins', title: 'FINANCES',
        sub: `Net ${fin.lastIncome ? fmtCoins(fin.lastIncome - fin.lastWages) : '—'} last MD`,
        liveHTML: `<b style="font-size:16px; color:${fin.balance < 0 ? '#e05263' : 'var(--accent)'};">${fmtCoins(fin.balance)}</b>`,
        onOpen: () => this.triggerWipe(() => financesPage(this, career)) }),
      hubTile({ icon: 'swap', title: 'TRANSFERS', sub: windowOpen(career) ? 'Window open' : `Opens MD ${nextWindowWeek(career) ?? 'end of season'}`,
        badge: windowOpen(career) ? 'OPEN' : '', onOpen: () => this.triggerWipe(() => marketPage(this, career)) }),
      hubTile({ icon: 'users', title: 'SQUAD', sub: `${myClub.squad.length} players`,
        liveHTML: `<b>OVR ${Math.round(myClub.squad.reduce((s, p) => s + p.overall, 0) / myClub.squad.length)}</b>${scorer.season.goals > 0 ? ` · ${scorer.name.split(' ').pop()} ${scorer.season.goals}g` : ''}`,
        onOpen: () => this.triggerWipe(() => squadPage(this, myClub)) }),
      hubTile({ icon: 'chart', title: 'TRAINING', sub: `Focus: ${career.trainingFocus || 'Youth'}`,
        liveHTML: `<b>${Object.values(career.coaches || {}).filter(Boolean).length} Active Coaches</b>`,
        onOpen: () => this.triggerWipe(() => trainingPage(this, career)) }),
      hubTile({ icon: 'star', title: 'LEADERBOARDS',
        sub: (() => { const gb = goldenBoot(career); return gb && (gb.player.season?.goals ?? 0) > 0 ? `Golden Boot: ${gb.player.name.split(' ').pop()} ${gb.player.season.goals}g` : 'No goals yet'; })(),
        onOpen: () => this.triggerWipe(() => leaderboardPage(this, career)) }),
      hubTile({ icon: 'briefcase', title: 'BOARDROOM',
        sub: (() => {
          ensureBoardState(career);
          const conf = career.board?.confidence ?? 60;
          return `Confidence: ${conf}% (${getConfidenceLabel(conf)})`;
        })(),
        liveHTML: (() => {
          ensureBoardState(career);
          const conf = career.board?.confidence ?? 60;
          const col = getConfidenceColor(conf);
          const delta = career.board?.lastDelta ?? 0;
          const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '▶';
          const deltaCol = delta > 0 ? '#00d4a3' : delta < 0 ? '#e05263' : 'var(--muted)';
          return `<span style="font-weight:800; color:${col};">${getConfidenceLabel(conf).toUpperCase()}</span>
                  ${delta !== 0 ? `<span style="font-size:10px; color:${deltaCol}; margin-left:6px;">${arrow} ${Math.abs(delta)}%</span>` : ''}`;
        })(),
        onOpen: () => this.triggerWipe(() => boardPage(this, career)) }),
      hubTile({ icon: 'news', title: 'CLUB NEWS', size: 'wide', sub: news.length ? '' : 'No headlines yet',

        liveHTML: news.slice(0, 2).map(n => `<span class="dim">MD${n.week} — ${n.text}</span>`).join('<br>'),
        onOpen: () => this.triggerWipe(() => marketPage(this, career)) }),
      hubTile({ icon: 'restart', title: 'SIM FIXTURE', sub: 'Quick-sim this matchday',
        onOpen: () => {
          if (fx.cup) playCupRound(career, null); // sim the due cup tie, not the league round
          else completeRound(career, null);
          syncSeasonStats(career);
          localStorage.setItem('dreamkick.v2', JSON.stringify(this.save));
          Toast.show(fx.cup ? 'Cup tie simulated.' : 'Matchday simulated.', 'success');
          this.triggerWipe(() => this.career());
        } }),
    ];
    el.querySelector('#careerHub').replaceWith(hubGrid(tiles));

    setTimeout(() => {
      drawBadge(el.querySelector('#chBadge'), myClub);
      drawBadge(el.querySelector('#nmMe'), atHome ? myClub : opponent);
      drawBadge(el.querySelector('#nmOpp'), atHome ? opponent : myClub);
    }, 50);

    el.querySelector('#careerMenuBtn').onclick = () => this.triggerWipe(() => this.menu());
    // career RESET moved to Settings → DATA (V5 U4)

    this.show(el);
    this.setupInteractions(el);
  }

  /** End-of-season summary → progression → next season. */
  seasonSummary(el, career) {
    const table = leagueTable(career);
    const champion = CLUBS[table[0].id];
    const myPos = leaguePosition(career);
    const scorer = topScorer(career);
    const userDiv = career.division || divisionOf(career);

    // Call endSeason once to evaluate objectives and determine if sacked
    const { summary, next } = endSeason(career);

    // Promotion / relegation / sacked banner
    let divBanner = '';
    if (summary.sacked) {
      divBanner = `<div class="div-banner div-relegated" style="margin-top:10px; padding:8px 14px; border-radius:6px; background:rgba(224,82,99,0.18); color:#e05263; font-weight:800; letter-spacing:0.06em;">SACKED BY THE BOARD</div>`;
    } else if (userDiv === 1 && myPos >= 9) {
      divBanner = `<div class="div-banner div-relegated" style="margin-top:10px; padding:8px 14px; border-radius:6px; background:rgba(224,82,99,0.18); color:#e05263; font-weight:800; letter-spacing:0.06em;">RELEGATED TO DIVISION 2</div>`;
    } else if (userDiv === 2 && myPos <= 2) {
      divBanner = `<div class="div-banner div-promoted" style="margin-top:10px; padding:8px 14px; border-radius:6px; background:rgba(0,212,163,0.18); color:var(--accent); font-weight:800; letter-spacing:0.06em;">PROMOTED TO DIVISION 1!</div>`;
    } else {
      divBanner = `<div style="margin-top:10px; color:var(--muted); font-size:12px;">Division ${userDiv} next season.</div>`;
    }

    const nextBtnText = summary.sacked ? 'FIND NEW CLUB' : `START SEASON ${next.season}`;
    const nextBtnIcon = summary.sacked ? 'users' : 'restart';

    el.innerHTML = `
      <div class="screen-title">${icon('trophy', 26)} SEASON ${career.season} COMPLETE</div>
      <div class="panel spotlight-card stagger-1" style="padding: 26px 34px; text-align:center; max-width: 440px;">
        <canvas id="champBadge" width="72" height="72"></canvas>
        <div class="section-tag" style="margin-top:10px;">DIVISION 1 CHAMPIONS</div>
        <div style="font-size:22px; font-weight:900;">${champion.name}</div>
        <div class="dim" style="margin-top:12px;">
          ${summary.sacked 
            ? `Your contract has been terminated. The board was dissatisfied with your performance (Confidence: ${career.board?.confidence ?? 0}%).`
            : `You finished <b>${myPos}${['st','nd','rd'][myPos-1] || 'th'}</b> in Division ${userDiv} with ${table.find(r => r.id === career.clubId)?.pts ?? 0} points.`
          }
        </div>
        <div class="dim" style="margin-top:4px;">Top scorer: ${scorer.name} (${scorer.season.goals})</div>
        ${(() => { const gb = goldenBoot(career); const gbClub = gb ? CLUBS[gb.clubId] : null; return gb && (gb.player.season?.goals ?? 0) > 0 ? `<div class="dim" style="margin-top:2px;">${icon('star', 12)} <b>Golden Boot:</b> ${gb.player.name} (${gbClub?.code ?? ''}) &mdash; ${gb.player.season.goals} goals</div>` : ''; })()}
        <div class="dim" style="margin-top:4px;">${icon('trophy', 12)} Dream Cup: <b>${(() => { const c = ensureCup(career); return c.champion !== null ? CLUBS[c.champion].name : 'in progress'; })()}</b> · You: ${userCupLabel(career)}</div>
        
        <div style="margin-top: 12px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 6px; font-size: 12px; text-align: left;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Season Prize Money:</span><b style="color:var(--accent);">+${fmtCoins(summary.prize)}</b></div>
          ${summary.boardBonus > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Board Objectives Bonus:</span><b style="color:#00d4a3;">+${fmtCoins(summary.boardBonus)}</b></div>` : ''}
          <div style="display:flex; justify-content:space-between;"><span>Final Board Confidence:</span><b style="color:${getConfidenceColor(career.board?.confidence ?? 60)};">${career.board?.confidence ?? 60}%</b></div>
        </div>

        ${divBanner}
        <div class="dim" style="margin-top:10px; font-size:11px;">Players develop over the summer — young talents grow, veterans decline.</div>
      </div>
      <div class="select-actions stagger-2">
        <button class="btn back magnetic-btn" id="ssMenuBtn">${icon('home', 16)} MAIN MENU</button>
        ${summary.sacked ? '' : `<button class="btn magnetic-btn" id="ssMarketBtn">${icon('swap', 16)} TRANSFERS</button>`}
        <button class="btn primary big magnetic-btn" id="ssNextBtn">${icon(nextBtnIcon, 16)} ${nextBtnText}</button>
      </div>`;
    setTimeout(() => drawBadge(el.querySelector('#champBadge'), champion), 50);
    el.querySelector('#ssMenuBtn').onclick = () => this.triggerWipe(() => this.menu());
    if (!summary.sacked) {
      el.querySelector('#ssMarketBtn').onclick = () => this.triggerWipe(() => marketPage(this, career));
    }
    el.querySelector('#ssNextBtn').onclick = () => {
      this.save.career = next;
      localStorage.setItem('dreamkick.v2', JSON.stringify(this.save));
      
      if (summary.sacked) {
        Toast.show('You have been sacked! Choose a new bottom-half club to restart.', 'error', 6000);
      } else {
        if (summary.forcedSale) {
          Toast.show(`CLUB NEWS: ${summary.forcedSale.player} sold for ${summary.forcedSale.fee} coins to balance the books. Youth prospect ${summary.forcedSale.youth} promoted.`, 'error');
        }
        if (summary.divisionChange === 'promoted') {
          Toast.show(`PROMOTED! Welcome to Division 1, Season ${next.season}! Prize: +${summary.prize} coins.`, 'success');
        } else if (summary.divisionChange === 'relegated') {
          Toast.show(`Relegated to Division 2. Bounce back in Season ${next.season}! Prize: +${summary.prize} coins.`, 'error');
        } else {
          Toast.show(`Season ${next.season} begins! Prize money: +${summary.prize} coins.`, 'success');
        }
      }
      this.triggerWipe(() => this.career());
    };
    this.show(el);
    this.setupInteractions(el);
  }


  /* Transfer market + squad: promoted to dedicated pages in V5 U3 —
     see ui/pages/clubPages.js (marketPage, squadPage). */
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
