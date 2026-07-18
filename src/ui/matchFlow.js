/**
 * matchFlow.js — V2 Phase 4: half-time full menu, match statistics modal,
 * and per-player match ratings (rating chips styled after Sport Sim Pro's
 * PostMatchModal: ≥8 green, ≥7 blue, ≥6 amber, ≥5 orange, below red).
 */
import { drawBadge } from './draw.js';
import { icon } from './icons.js';
import { initMagnetic } from './components.js';

/* Ratings now computed from TRACKED per-player stats in engine/ratings.js
   (cached on match._ratings so UI and season bookkeeping agree). */
export { computeMatchRatings } from '../engine/ratings.js';

export function ratingClass(r) {
  if (r >= 8) return 'r8';
  if (r >= 7) return 'r7';
  if (r >= 6) return 'r6';
  if (r >= 5) return 'r5';
  return 'r4';
}

/* ---------------- match statistics modal ---------------- */

function statBarRow(label, a, b, unit = '') {
  const total = (a + b) || 1;
  const pa = Math.round((a / total) * 100);
  return `
    <div class="mstat-row">
      <div class="mstat-nums"><b>${a}${unit}</b><span>${label}</span><b>${b}${unit}</b></div>
      <div class="mstat-bar"><i style="width:${pa}%"></i><i style="width:${100 - pa}%"></i></div>
    </div>`;
}

/** Full match statistics modal — used from half-time menu AND pause menu. */
export function showMatchStatsModal(match) {
  const s = match.stats;
  const pos = match.possessionPct();
  const passAcc = i => s.passes[i] ? Math.round(100 * s.passOk[i] / s.passes[i]) : 0;
  const [h, a] = match.teams.map(t => t.club);

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop in';
  modal.style.zIndex = '9400';
  modal.innerHTML = `
    <div class="modal-panel" style="max-width: 440px;">
      <div class="modal-header">
        <h2>${icon('trophy', 20)} MATCH STATISTICS</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-content" style="display:flex; flex-direction:column; gap:12px;">
        <div class="mstat-teams"><span>${h.name}</span><span>${a.name}</span></div>
        ${statBarRow('POSSESSION', pos[0], pos[1], '%')}
        ${statBarRow('SHOTS', s.shots[0], s.shots[1])}
        ${statBarRow('ON TARGET', s.onTarget[0], s.onTarget[1])}
        ${statBarRow('PASSES', s.passes[0], s.passes[1])}
        ${statBarRow('PASS ACCURACY', passAcc(0), passAcc(1), '%')}
        ${statBarRow('TACKLES', s.tackles[0], s.tackles[1])}
      </div>
      <div class="modal-actions"><button class="btn primary modal-ok">CLOSE</button></div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('.modal-close').onclick = close;
  modal.querySelector('.modal-ok').onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
}

/* ---------------- half-time full menu ---------------- */

/**
 * DLS/FC-style half-time menu. Stays up until an exit action is chosen.
 * @param {object} match
 * @param {{onTeamMgmt:Function,onSettings:Function,onSimEnd:Function,onForfeit:Function,onContinue:Function,onToast:Function}} h
 */
export function showHalfTimeMenu(match, h) {
  document.getElementById('halfTimeMenu')?.remove();
  const [hc, ac] = match.teams.map(t => t.club);

  const overlay = document.createElement('div');
  overlay.id = 'halfTimeMenu';
  overlay.className = 'htmenu';
  overlay.innerHTML = `
    <div class="htmenu-panel">
      <div class="htmenu-tag">HALF TIME · 45:00</div>
      <div class="htmenu-score">
        <div class="htmenu-team"><canvas id="htmBadgeH" width="52" height="52"></canvas><span>${hc.code}</span></div>
        <div class="htmenu-num">${match.score[0]}<i>–</i>${match.score[1]}</div>
        <div class="htmenu-team"><canvas id="htmBadgeA" width="52" height="52"></canvas><span>${ac.code}</span></div>
      </div>
      <div class="htmenu-grid">
        <button data-act="teamMgmt">👥 TEAM MANAGEMENT</button>
        <button data-act="stats">📊 MATCH STATISTICS</button>
        <button data-act="settings">⚙️ GAME SETTINGS</button>
        <button data-act="replay">🎬 INSTANT REPLAY</button>
        <button data-act="simEnd">⏩ SIM TO END</button>
        <button data-act="forfeit" class="danger">🏳️ FORFEIT</button>
      </div>
      <button class="btn primary big htmenu-continue" data-act="continue">▶ CONTINUE TO 2ND HALF</button>
    </div>`;
  document.body.appendChild(overlay);
  drawBadge(overlay.querySelector('#htmBadgeH'), hc);
  drawBadge(overlay.querySelector('#htmBadgeA'), ac);
  setTimeout(() => overlay.classList.add('in'), 16);

  const closeMenu = () => overlay.remove();

  overlay.querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = () => {
      const act = btn.dataset.act;
      if (act === 'teamMgmt') h.onTeamMgmt();                 // modal stacks above; menu stays
      else if (act === 'stats') showMatchStatsModal(match);
      else if (act === 'settings') h.onSettings();
      else if (act === 'replay') {
        if (h.onReplay) {
          overlay.style.visibility = 'hidden';
          const ok = h.onReplay(() => { overlay.style.visibility = ''; });
          if (ok === false) overlay.style.visibility = '';
        } else h.onToast?.('Instant Replay — coming soon.');
      }
      else if (act === 'simEnd') {
        if (confirm('Simulate the rest of the match?')) { closeMenu(); h.onSimEnd(); }
      } else if (act === 'forfeit') {
        if (confirm('Forfeit the match? This is recorded as a loss.')) { closeMenu(); h.onForfeit(); }
      } else if (act === 'continue') {
        closeMenu(); h.onContinue();
      }
    };
  });
  initMagnetic(overlay.querySelector('.htmenu-continue'));
}

/* ---------------- full-time ratings panel markup ---------------- */

/** Two-column (home/away) rating list HTML for the results screen. */
export function ratingsPanelHTML(match, ratings) {
  const col = (team) => [...team.players]
    .map(p => ({ p, r: ratings.get(p) ?? 6 }))
    .sort((x, y) => y.r - x.r)
    .map(({ p, r }) => `
      <div class="rating-row">
        <span class="rr-name">${(p.data.name || '?').split(' ').pop()}</span>
        <span class="rr-pos">${p.data.pos}</span>
        <span class="rating-chip ${ratingClass(r)}">${r.toFixed(1)}</span>
      </div>`).join('');
  return `
    <div class="panel ratings-panel spotlight-card">
      <div class="section-tag" style="margin-bottom:8px;">PLAYER RATINGS</div>
      <div class="ratings-cols">
        <div><div class="rr-club">${match.teams[0].club.code}</div>${col(match.teams[0])}</div>
        <div><div class="rr-club">${match.teams[1].club.code}</div>${col(match.teams[1])}</div>
      </div>
    </div>`;
}
