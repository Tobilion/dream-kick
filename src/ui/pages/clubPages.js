/**
 * clubPages.js — V5 U3: Transfer Market + Squad promoted from modals to
 * dedicated pages (pageShell). Pure UI over core/transfers.js + data/teams.js.
 * Back (button/Escape) returns to S.career() — which resolves to the season
 * summary automatically when the season is over.
 */
import { CLUBS } from '../../data/teams.js';
import { Toast } from '../components.js';
import { renderPlayerCard, showPlayerInfoPopup } from '../playerCard.js';
import { playerForm, moraleLabelAndColor } from '../../data/teams.js';
import { icon } from '../icons.js';
import {
  ensureMarket, windowOpen, nextWindowWeek, listingPlayer, buyPlayer,
  listForSale, unlist, suggestedFee, MAX_SQUAD,
} from '../../core/transfers.js';
import { pageShell, fmtCoins } from '../hub.js';

/* ---------------- TRANSFER MARKET ---------------- */

export function marketPage(S, career) {
  const m = ensureMarket(career);
  const open = windowOpen(career);
  const me = CLUBS[career.clubId];
  const nw = nextWindowWeek(career);
  const persist = () => localStorage.setItem('dreamkick.v2', JSON.stringify(S.save));

  const shell = pageShell('TRANSFER MARKET', () => S.triggerWipe(() => S.career()),
    `<span style="color:${open ? 'var(--accent)' : '#e05263'}; font-weight:800;">${open ? 'WINDOW OPEN' : `CLOSED · opens ${nw ? 'MD ' + nw : 'end of season'}`}</span>`);

  const render = () => {
    const balance = career.finance?.balance ?? 0;
    shell.content.innerHTML = `
      <div class="panel" style="padding:14px 18px;">
        <div class="career-dash-row"><span>Balance</span><b style="color:${balance < 0 ? '#e05263' : 'var(--accent)'};">${fmtCoins(balance)}</b></div>
        <div class="career-dash-row"><span>Squad size</span><b>${me.squad.length}/${MAX_SQUAD}</b></div>
      </div>
      <div class="panel" style="padding:14px 18px;">
        <div class="section-tag">LISTINGS${open ? '' : ' (READ-ONLY — WINDOW CLOSED)'}</div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${m.listings.map((l, i) => {
            const p = listingPlayer(l);
            if (!p) return '';
            return `<div class="career-dash-row"><span><b>${p.pos}</b> · ${p.name} (${p.overall}) <i class="dim">${CLUBS[l.club].code}, ${p.age}y</i></span>
              <b>${fmtCoins(l.price)} <button class="btn" data-buy="${i}" style="padding:4px 12px; margin-left:6px;" ${!open || balance < l.price || me.squad.length >= MAX_SQUAD ? 'disabled' : ''}>BUY</button></b></div>`;
          }).join('') || '<div class="dim">No listings this window.</div>'}
        </div>
      </div>
      <div class="panel" style="padding:14px 18px;">
        <div class="section-tag">SELL — SALES RESOLVE NEXT MATCHDAY</div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${[...me.squad].sort((a, b) => b.overall - a.overall).map(p => {
            const listed = m.myListings.find(l => l.playerId === p.id);
            return `<div class="career-dash-row" data-row="${p.id}"><span><b>${p.pos}</b> · ${p.name} (${p.overall})</span>
              <b>${listed ? `ask ${fmtCoins(listed.ask)} <button class="btn" data-unlist="${p.id}" style="padding:4px 12px;">CANCEL</button>`
                : `<button class="btn" data-sell="${p.id}" style="padding:4px 12px;">LIST ~${fmtCoins(suggestedFee(p))}</button>`}</b></div>`;
          }).join('')}
        </div>
      </div>
      <div class="panel" style="padding:14px 18px;">
        <div class="section-tag">TRANSFER NEWS</div>
        ${m.news.map(n => `<div class="news-line">S${n.season} MD${n.week} — ${n.text}</div>`).join('') || '<div class="dim">Quiet so far.</div>'}
      </div>`;

    shell.content.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      const err = buyPlayer(career, m.listings[parseInt(b.dataset.buy)]);
      if (err) Toast.show(err, 'error');
      else { Toast.show('Player signed!', 'success'); persist(); }
      render();
    });
    // inline ask-price editor (no prompt() — U5 polish rule)
    shell.content.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => {
      const p = me.squad.find(x => x.id === b.dataset.sell);
      const fee = suggestedFee(p);
      const cell = shell.content.querySelector(`[data-row="${p.id}"] b`);
      cell.innerHTML = `
        <input type="number" class="ask-input" value="${fee}" min="100" step="50" aria-label="Asking price">
        <button class="btn ask-ok" style="padding:4px 12px;">LIST</button>
        <button class="btn ask-no" style="padding:4px 10px;">✕</button>`;
      const input = cell.querySelector('.ask-input');
      input.focus(); input.select();
      const confirm = () => {
        const ask = parseInt(input.value) || 0;
        if (!ask) { render(); return; }
        const err = listForSale(career, p.id, ask);
        if (err) Toast.show(err, 'error'); else {
          persist();
          const ratio = ask / Math.max(1, fee);
          if (ratio > 1.3) Toast.show('Well above value — unlikely to sell.', 'info');
        }
        render();
      };
      cell.querySelector('.ask-ok').onclick = confirm;
      cell.querySelector('.ask-no').onclick = () => render();
      input.onkeydown = e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') { e.stopPropagation(); render(); } };
    });
    shell.content.querySelectorAll('[data-unlist]').forEach(b => b.onclick = () => {
      unlist(career, b.dataset.unlist); persist(); render();
    });
  };
  render();
  persist(); // ensureMarket may have generated a fresh window
  S.show(shell.el);
  S.setupInteractions(shell.el);
}

/* ---------------- SQUAD ---------------- */

export function squadPage(S, club) {
  const avg = Math.round(club.squad.reduce((s, p) => s + p.overall, 0) / club.squad.length);
  const shell = pageShell(`SQUAD — ${club.name.toUpperCase()}`,
    () => S.triggerWipe(() => S.career()),
    `<span>${club.squad.length} players</span><b style="color:var(--accent);">OVR ${avg}</b>`);

  for (const pos of ['GK', 'DF', 'MF', 'FW']) {
    const group = [...club.squad].filter(p => p.pos === pos).sort((a, b) => b.overall - a.overall);
    if (!group.length) continue;
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.padding = '12px 16px';
    panel.innerHTML = `<div class="section-tag">${{ GK: 'GOALKEEPERS', DF: 'DEFENDERS', MF: 'MIDFIELDERS', FW: 'FORWARDS' }[pos]}</div>
      <div class="squad-grid"></div>`;
    const grid = panel.querySelector('.squad-grid');
    group.forEach(p => {
      const card = renderPlayerCard(p, club.kits.home, {
        className: 'rowcard',
        onClick: () => showPlayerInfoPopup(p, club.kits.home),
        onDblClick: () => showPlayerInfoPopup(p, club.kits.home),
      });
      const form = playerForm(p);
      if (form > 0) {
        const chip = document.createElement('span');
        chip.className = 'squad-form-chip';
        chip.textContent = form.toFixed(1);
        card.appendChild(chip);
      }
      // Morale chip
      const morale = p.morale ?? 70;
      const mc = moraleLabelAndColor(morale);
      const mChip = document.createElement('span');
      mChip.className = 'squad-morale-chip';
      mChip.style.color = mc.color;
      mChip.style.background = mc.color.startsWith('var') ? 'rgba(0,212,163,0.12)' : `${mc.color}1c`;
      mChip.innerHTML = `${icon('star', 10)} ${morale}`;
      card.appendChild(mChip);
      grid.appendChild(card);
    });
    shell.content.appendChild(panel);
  }
  S.show(shell.el);
  S.setupInteractions(shell.el);
}
