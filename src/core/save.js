/** save.js — localStorage persistence for settings and last selections. */
const KEY = 'dreamkick.v2';

const DEFAULTS = {
  difficulty: 'pro',
  halfLength: 180,
  homeTeam: 0,
  awayTeam: 1,
  sound: true,
  cameraPreset: 'sideline',   // 'sideline' | 'broadcast' | 'topDown' | 'endToEnd'
  cameraDistance: 1.0,        // 0.8 .. 1.3
  results: [], // last 10 results: {home, away, hs, as}
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage full/blocked */ }
}

export function recordResult(save, result) {
  save.results.unshift(result);
  save.results.length = Math.min(save.results.length, 10);
  writeSave(save);
}
