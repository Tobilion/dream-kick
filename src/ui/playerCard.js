/** playerCard.js — renders player cards and player info popups, reusing shapes from Sport Sim / Bet Simulator. */
import { drawPortrait } from './draw.js';
import { initSpotlight } from './components.js';

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
  
  if (options.onClick) {
    card.style.cursor = 'pointer';
    card.onclick = (e) => options.onClick(player, e);
  }

  return card;
}

/** Show player info modal. */
export function showPlayerInfoPopup(player, kitColors) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop in';
  
  modal.innerHTML = `
    <div class="modal-panel" style="max-width: 360px;">
      <div class="modal-header">
        <h2>PLAYER CARD</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-content" style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
        <canvas id="popupAvatar" width="100" height="100" style="border-radius: 8px; border: 1.5px solid var(--border);"></canvas>
        <div style="text-align: center;">
          <h3 style="font-size: 20px; font-weight: 900;">${player.name}</h3>
          <p style="color: var(--accent); font-weight: 700; font-size: 13px;">${player.pos} · Number ${player.num} · OVR ${player.overall}</p>
        </div>
        <div style="width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
          <div style="background: var(--surface-2); padding: 8px 12px; border-radius: 6px;">Pace: <b>${player.pace}</b></div>
          <div style="background: var(--surface-2); padding: 8px 12px; border-radius: 6px;">Shooting: <b>${player.shoot}</b></div>
          <div style="background: var(--surface-2); padding: 8px 12px; border-radius: 6px;">Passing: <b>${player.pass}</b></div>
          <div style="background: var(--surface-2); padding: 8px 12px; border-radius: 6px;">Defending: <b>${player.defend}</b></div>
          <div style="background: var(--surface-2); padding: 8px 12px; border-radius: 6px;">Physical: <b>${player.physical}</b></div>
          <div style="background: var(--surface-2); padding: 8px 12px; border-radius: 6px;">Goalkeeping: <b>${player.gk}</b></div>
        </div>
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
  modal.querySelector('.modal-close').onclick = close;
  modal.querySelector('.modal-ok').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
}
