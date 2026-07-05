/** icons.js — inline SVG icon factory. No emojis, no icon fonts. */

const PATHS = {
  ball: `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M12 6.5l3.4 2.5-1.3 4h-4.2l-1.3-4z" fill="currentColor"/>
    <path d="M12 2v4.5M5 5.5l3.6 3.5M19 5.5l-3.6 3.5M4 15l3.9-2M20 15l-3.9-2M8.5 21l1.4-4M15.5 21l-1.4-4"
      stroke="currentColor" stroke-width="1.3" fill="none"/>`,
  trophy: `<path d="M7 4h10v5a5 5 0 01-10 0V4z" fill="none" stroke="currentColor" stroke-width="1.7"/>
    <path d="M7 5H4a3 3 0 003 4M17 5h3a3 3 0 01-3 4M12 14v3M8 20h8M10 17h4v3h-4z"
      stroke="currentColor" stroke-width="1.7" fill="none"/>`,
  shirt: `<path d="M8 4l4 2 4-2 4 4-2.5 2.5L16 9v11H8V9l-1.5 1.5L4 8z"
    fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>`,
  gear: `<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/>
    <path d="M12 2.8v3M12 18.2v3M21.2 12h-3M5.8 12h-3M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1M18.5 18.5l-2.1-2.1M7.6 7.6L5.5 5.5"
      stroke="currentColor" stroke-width="1.7"/>`,
  play: `<path d="M7 4.5l13 7.5-13 7.5z" fill="currentColor"/>`,
  pause: `<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>`,
  arrowL: `<path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  arrowR: `<path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  star: `<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor"/>`,
  starOff: `<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"
    fill="none" stroke="currentColor" stroke-width="1.4"/>`,
  whistle: `<path d="M3 10h10a4.5 4.5 0 11-4.4 5.6L3 13z" fill="none" stroke="currentColor" stroke-width="1.7"/>
    <path d="M9 10V7M13 10l1.5-2.5M16 4v2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`,
  home: `<path d="M4 11l8-7 8 7v9h-5v-6h-6v6H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`,
  restart: `<path d="M4 12a8 8 0 108-8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v6l-4-3z" fill="currentColor"/>`,
};

/**
 * @param {keyof typeof PATHS} name
 * @param {number} size px
 * @returns {string} svg markup, colored via currentColor
 */
export function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

/** star rating row 1..5 */
export function stars(n, size = 14) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += icon(i <= n ? 'star' : 'starOff', size);
  return `<span class="stars">${s}</span>`;
}
