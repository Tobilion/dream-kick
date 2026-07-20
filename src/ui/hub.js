/**
 * hub.js — V5 U1: hub-and-tile primitives (DLS/FIFA-20 "boxes, not stacks").
 * hubTile → one tappable box; hubGrid → responsive mosaic; pageShell →
 * dedicated page wrapper with a back strip. All motion CSS-driven and gated
 * by prefers-reduced-motion (styles/ui.css).
 */
import { icon } from './icons.js';

/** 12500 → "12.5k" (coins). Shared by hubs and pages. */
export function fmtCoins(n) {
  return Math.abs(n) >= 10000 ? `${Math.round(n / 100) / 10}k` : `${n}`;
}

/**
 * @param {object} o
 * @param {string} o.icon     icon() name
 * @param {string} o.title    tile label (short, uppercase)
 * @param {string} [o.sub]    one-line subtitle
 * @param {'hero'|'wide'|'square'} [o.size]
 * @param {boolean} [o.accent] teal primary tile — max ONE per hub
 * @param {string} [o.badge]  small corner chip text (e.g. "OPEN")
 * @param {string} [o.liveHTML] live-data area markup (form chips, scores…)
 * @param {Function} o.onOpen
 * @returns {HTMLButtonElement}
 */
export function hubTile(o) {
  const b = document.createElement('button');
  b.className = `hubtile ht-${o.size || 'square'}${o.accent ? ' ht-accent' : ''}`;
  b.innerHTML = `
    <span class="ht-chev">${icon('chevR', 14)}</span>
    ${o.badge ? `<span class="ht-badge">${o.badge}</span>` : ''}
    <span class="ht-icon">${icon(o.icon, o.size === 'hero' ? 34 : 24)}</span>
    <span class="ht-title">${o.title}</span>
    ${o.sub ? `<span class="ht-sub">${o.sub}</span>` : ''}
    ${o.liveHTML ? `<span class="ht-live">${o.liveHTML}</span>` : ''}`;
  b.onclick = () => o.onOpen?.();
  return b;
}

/** @param {Array} tiles hubTile() elements @returns {HTMLDivElement} */
export function hubGrid(tiles) {
  const g = document.createElement('div');
  g.className = 'hubgrid';
  tiles.forEach((t, i) => { t.style.setProperty('--ht-i', i); g.appendChild(t); });
  return g;
}

/**
 * Dedicated page wrapper: thin header strip (≥44px back target, title,
 * optional right-side status), single scroll context, Escape = back.
 * @returns {{el: HTMLElement, content: HTMLElement}}
 */
export function pageShell(title, onBack, statusHTML = '') {
  const el = document.createElement('div');
  el.className = 'screen page-screen';
  el.innerHTML = `
    <div class="page-strip">
      <button class="page-back" aria-label="Back">${icon('arrowL', 18)}</button>
      <div class="page-title">${title}</div>
      <div class="page-status">${statusHTML}</div>
    </div>
    <div class="page-content"></div>`;
  el.querySelector('.page-back').onclick = () => onBack();
  const esc = e => {
    if (e.key !== 'Escape') return;
    if (!document.body.contains(el)) { window.removeEventListener('keydown', esc); return; }
    window.removeEventListener('keydown', esc);
    onBack();
  };
  window.addEventListener('keydown', esc);
  return { el, content: el.querySelector('.page-content') };
}
