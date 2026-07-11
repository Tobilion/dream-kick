/** lineupIntro.js — skippable broadcast-style pre-match lineups intro. */
import { renderPlayerCard } from './playerCard.js';
import { drawBadge } from './draw.js';
import { icon } from './icons.js';

export class LineupIntro {
  /**
   * @param {HTMLElement} root UI container
   * @param {object} match match simulation instance
   * @param {Function} onComplete callback when intro finishes or is skipped
   */
  constructor(root, match, onComplete) {
    this.root = root;
    this.match = match;
    this.onComplete = onComplete;
    this.skipped = false;
    this.timer = null;
    
    this.el = document.createElement('div');
    this.el.className = 'screen lineup-intro-screen';
    this.el.style.zIndex = '999';
    this.el.style.background = 'rgba(7,9,18,0.96)';
    this.el.style.backdropFilter = 'blur(10px)';

    this.root.appendChild(this.el);
    // .screen defaults to opacity:0 — must add .in or the whole intro is invisible
    requestAnimationFrame(() => this.el.classList.add('in'));
    
    this.startIntro();
  }

  startIntro() {
    // Esc / Space to skip
    this.keyHandler = (e) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        this.skip();
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    // Stage 1: Match Splash (3 seconds)
    this.showSplash();
  }

  showSplash() {
    const [h, a] = this.match.teams;
    this.el.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 30px;">
        <div class="section-tag stagger-1">BROADCAST PRESENTATION</div>
        <div style="display: flex; align-items: center; gap: clamp(14px, 6vw, 60px);" class="stagger-2">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
            <canvas id="splashBadgeH" width="120" height="120"></canvas>
            <h2 style="font-size: 26px; font-weight: 900;">${h.club.name}</h2>
          </div>
          <div style="font-size: 30px; font-weight: 900; color: var(--accent); background: var(--surface-2); padding: 12px 18px; transform: skewX(-12deg);">VS</div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
            <canvas id="splashBadgeA" width="120" height="120"></canvas>
            <h2 style="font-size: 26px; font-weight: 900;">${a.club.name}</h2>
          </div>
        </div>
        <div class="dim stagger-3" style="font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">
          ${this.match._opts.isCareer ? 'CLASSIC CAREER MODE' : 'EXHIBITION MATCH'} · ${h.club.stars} STAR MATCHUP
        </div>
        <button class="btn primary skip-btn" style="position: absolute; bottom: 30px; right: 30px;">
          SKIP INTRO (SPACE)
        </button>
      </div>
    `;

    drawBadge(this.el.querySelector('#splashBadgeH'), h.club);
    drawBadge(this.el.querySelector('#splashBadgeA'), a.club);
    
    this.el.querySelector('.skip-btn').onclick = () => this.skip();

    this.timer = setTimeout(() => {
      this.showTeamIntro(0); // Show home team lineup
    }, 2500);
  }

  showTeamIntro(teamIdx) {
    if (this.skipped) return;
    const team = this.match.teams[teamIdx];
    const kitColors = team.club.kits.home;
    
    this.el.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 14px; width: 100%; max-width: 900px; margin: 0 auto; padding: 16px; box-sizing: border-box;">
        <div style="display: flex; align-items: center; gap: 16px; width: 100%; border-bottom: 2px solid var(--border); padding-bottom: 12px;">
          <canvas id="introBadge" width="56" height="56"></canvas>
          <div>
            <div class="section-tag">STARTING XI</div>
            <h2 style="font-size: 24px; font-weight: 900; text-transform: uppercase;">${team.club.name}</h2>
          </div>
          <div style="margin-left: auto; background: var(--accent); color: #000; font-weight: 900; padding: 6px 12px; border-radius: 4px; font-size: 13px;">
            FORMATION: ${team.formation}
          </div>
        </div>
        
        <!-- Stylized Pitch Lineup Visualizer (compact cards so all 11 always fit) -->
        <div id="introPitch" style="position: relative; width: 100%; height: clamp(320px, 54vh, 500px); background: rgba(0, 0, 0, 0.25); border: 2px solid var(--border); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-around; padding: 12px;">
          <!-- Attackers Row -->
          <div class="lineup-row" data-row="FW" style="display: flex; justify-content: center; gap: clamp(10px, 3vw, 34px); width: 100%;"></div>
          <!-- Midfielders Row -->
          <div class="lineup-row" data-row="MF" style="display: flex; justify-content: center; gap: clamp(10px, 3vw, 34px); width: 100%;"></div>
          <!-- Defenders Row -->
          <div class="lineup-row" data-row="DF" style="display: flex; justify-content: center; gap: clamp(10px, 3vw, 34px); width: 100%;"></div>
          <!-- Goalkeeper Row -->
          <div class="lineup-row" data-row="GK" style="display: flex; justify-content: center; width: 100%;"></div>
        </div>

        <button class="btn primary skip-btn" style="position: absolute; bottom: 30px; right: 30px;">
          SKIP INTRO (SPACE)
        </button>
      </div>
    `;

    drawBadge(this.el.querySelector('#introBadge'), team.club);
    this.el.querySelector('.skip-btn').onclick = () => this.skip();

    // Populate players row-by-row with animation delay
    const gkRow = this.el.querySelector('.lineup-row[data-row=GK]');
    const dfRow = this.el.querySelector('.lineup-row[data-row=DF]');
    const mfRow = this.el.querySelector('.lineup-row[data-row=MF]');
    const fwRow = this.el.querySelector('.lineup-row[data-row=FW]');

    team.players.forEach((p, idx) => {
      // Never let a card render failure block kickoff (finish() is timer-driven).
      try {
        let targetRow = dfRow;
        if (p.isGK) targetRow = gkRow;
        else if (p.data.pos === 'MF') targetRow = mfRow;
        else if (p.data.pos === 'FW') targetRow = fwRow;

        const pCard = renderPlayerCard(p, kitColors, { className: `compact intro-card stagger-${Math.min(5, Math.floor(idx/2)+1)}` });
        targetRow.appendChild(pCard);
      } catch (err) {
        console.warn('lineupIntro: card render failed for', p?.data?.name, err);
      }
    });

    this.timer = setTimeout(() => {
      if (teamIdx === 0) {
        this.showTeamIntro(1); // Transition to away team
      } else {
        this.finish(); // Finish intro
      }
    }, 3800);
  }

  skip() {
    this.skipped = true;
    this.finish();
  }

  finish() {
    clearTimeout(this.timer);
    window.removeEventListener('keydown', this.keyHandler);
    this.el.remove();
    if (this.onComplete) this.onComplete();
  }
}
