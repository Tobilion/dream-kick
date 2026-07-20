/** playerCard.js — player cards + Player Dossier modal (vanilla port of
 *  Sportsim-pro PlayerDossierModal.tsx / PlayerCompareModal.tsx patterns). */
import { drawPortrait } from './draw.js';
import { initSpotlight } from './components.js';
import { playerForm, moraleLabelAndColor } from '../data/teams.js';
import { icon } from './icons.js';

/** Render a polished card representation of a player.
 *  Accepts either an engine Player (with .data) or a plain squad data object. */
export function renderPlayerCard(player, kitColors, options = {}) {
  const d = player?.data ?? player;
  const card = document.createElement('div');
  card.className = `player-card spotlight-card ${options.className || ''}`;
  card.dataset.playerId = d.num;

  card.innerHTML = `
    <div class="card-num" style="background: ${kitColors[0]}; color: ${kitColors[1] || '#fff'}">${d.num}</div>
    <canvas class="card-avatar" width="54" height="54"></canvas>
    <div class="card-info">
      <div class="card-name">${(d.name || '?').split(' ').pop()}</div>
      <div class="card-stats-row">
        <span class="card-pos">${d.pos}</span>
        <span class="card-rating">OVR ${d.overall}</span>
      </div>
    </div>
  `;

  // Draw portrait
  const canvas = card.querySelector('.card-avatar');
  setTimeout(() => drawPortrait(canvas, d, kitColors), 10);
  
  initSpotlight(card);

  // Unified tap handling. Single-click actions (select/sub) often REBUILD the
  // parent view, destroying this element — which killed native ondblclick
  // (the 2nd click landed on a brand-new node). So we detect double-tap
  // ourselves: delay onClick briefly; a 2nd tap within the window cancels it
  // and fires onDblClick instead. Also works on touch, where dblclick doesn't.
  if (options.onClick || options.onDblClick) {
    card.style.cursor = 'pointer';
    let pending = null;
    card.onclick = (e) => {
      if (!options.onDblClick) { options.onClick?.(player, e); return; }
      if (pending) {
        clearTimeout(pending);
        pending = null;
        options.onDblClick(player, e);
      } else {
        pending = setTimeout(() => {
          pending = null;
          options.onClick?.(player, e);
        }, 260);
      }
    };
  }

  return card;
}

/** Age phase label (Sportsim-pro dossier pattern). */
function agePhase(age) {
  if (age < 20) return 'Prospect';
  if (age < 24) return 'Rising Star';
  if (age < 28) return 'Prime';
  if (age < 32) return 'Veteran';
  return 'Twilight';
}

function attrBar(label, v) {
  const cls = v >= 85 ? 'hi' : v >= 70 ? 'mid' : 'lo';
  return `
    <div class="dossier-attr">
      <span class="da-label">${label}</span>
      <div class="da-bar"><i class="${cls}" style="width:${v}%"></i></div>
      <span class="da-val">${v}</span>
    </div>`;
}

/**
 * Player Dossier modal (V3 Phase C). Accepts engine Player or plain data.
 * Full attributes, season stats, form, market value.
 */
export function showPlayerInfoPopup(playerOrEntity, kitColors) {
  const player = playerOrEntity?.data ?? playerOrEntity;
  const sn = player.season || { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
  const form = playerForm(player);
  const formCls = form >= 7.5 ? 'hi' : form >= 6.5 ? 'mid' : form > 0 ? 'lo' : '';
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop in';
  // must stack ABOVE team-management/settings modals (they use 9001+)
  modal.style.zIndex = '9500';

  modal.innerHTML = `
    <div class="modal-panel dossier" style="max-width: 420px;">
      <div class="dossier-head">
        <canvas id="popupAvatar" width="72" height="72"></canvas>
        <div class="dh-main">
          <h3>${player.name}</h3>
          <div class="dh-tags">
            <span class="dh-pos pos-${player.pos}">${player.pos}</span>
            <span class="dh-meta">#${player.num} · Age ${player.age ?? '—'} · ${agePhase(player.age ?? 26)}</span>
          </div>
          <div class="dh-tags" style="margin-top:4px;">
            <span class="dh-meta">Market value <b>€${player.marketValue ?? '—'}m</b></span>
            ${(() => {
              const mc = moraleLabelAndColor(player.morale ?? 70);
              return `
                <span class="dh-meta" style="display:inline-flex; align-items:center; gap:4px; padding:2px 6px; border-radius:4px; background:${mc.color}1c; color:${mc.color}; font-weight:800; font-size:11px; margin-left:4px; transform:skewX(-1.2deg);">
                  ${icon('star', 10)} ${mc.label} (${player.morale ?? 70})
                </span>`;
            })()}
          </div>
        </div>
        <div class="dh-ovr">
          <div class="dh-ovr-num">${player.overall}</div>
          <div class="dh-ovr-lbl">OVR</div>
          ${form ? `<div class="dh-form ${formCls}">FORM ${form.toFixed(1)}</div>` : ''}
        </div>
      </div>

      <div class="dossier-section">ATTRIBUTES</div>
      ${attrBar('Pace', player.pace)}
      ${attrBar('Shooting', player.shoot)}
      ${attrBar('Passing', player.pass)}
      ${attrBar('Dribbling', player.dribble ?? '—')}
      ${attrBar('Defending', player.defend)}
      ${attrBar('Physical', player.physical)}
      ${player.pos === 'GK' ? attrBar('Goalkeeping', player.gk) : ''}

      <div class="dossier-section">SEASON</div>
      <div class="dossier-stats">
        <div><b>${sn.apps}</b><span>Apps</span></div>
        <div><b>${sn.goals}</b><span>Goals</span></div>
        <div><b>${sn.assists}</b><span>Assists</span></div>
        <div><b>${player.pos === 'GK' ? sn.saves : sn.tackles}</b><span>${player.pos === 'GK' ? 'Saves' : 'Tackles'}</span></div>
        <div><b>${form ? form.toFixed(1) : '—'}</b><span>Avg rating</span></div>
      </div>

      <div class="modal-actions">
        <button class="btn primary modal-ok">CLOSE</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const canvas = modal.querySelector('#popupAvatar');
  drawPortrait(canvas, player, kitColors);

  const close = () => modal.remove();
  modal.querySelector('.modal-ok').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
}
