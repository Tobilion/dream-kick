/**
 * settingsPage.js — V5 U4: FIFA-20-style settings as a tile grid, not a list.
 * Section tiles (AUDIO / CAMERA / MATCH RULES / DISPLAY / DATA) select a
 * focused panel below. Every control persists IMMEDIATELY (DLS-style, no
 * OK button) and applies live to the camera. The in-match settings modal
 * (settingsScreen.js) is unchanged — this page is the home-hub entry.
 * Career RESET lives here now (DATA), demoted from the career hub.
 */
import { icon } from '../icons.js';
import { Toast } from '../components.js';
import { CAMERA_PRESETS, PRESET_LABELS, migratePreset } from '../../render/cameraController.js';
import { CAREER_VERSION } from '../../core/career.js';
import { pageShell } from '../hub.js';

const SECTIONS = [
  { id: 'audio',   icon: 'sound',     title: 'AUDIO',       sub: 'Volumes & mute' },
  { id: 'camera',  icon: 'gear',      title: 'CAMERA',      sub: 'Type & distance' },
  { id: 'match',   icon: 'whistle',   title: 'MATCH RULES', sub: 'Half length · difficulty' },
  { id: 'display', icon: 'tablelist', title: 'DISPLAY',     sub: 'Nameplates · effects' },
  { id: 'data',    icon: 'restart',   title: 'DATA',        sub: 'Reset & storage' },
];

export function settingsPage(S, cam) {
  const save = S.save;
  const persist = () => localStorage.setItem('dreamkick.v2', JSON.stringify(save));
  const shell = pageShell('SETTINGS', () => S.triggerWipe(() => S.menu()),
    '<span class="dim">Changes save instantly</span>');

  shell.content.innerHTML = `
    <div class="set-tiles"></div>
    <div class="panel" id="setPanel" style="padding:16px 20px;"></div>`;
  const tilesEl = shell.content.querySelector('.set-tiles');
  const panel = shell.content.querySelector('#setPanel');

  const row = (label, control) => `
    <div class="career-dash-row" style="min-height:44px;"><span>${label}</span><b>${control}</b></div>`;

  const renderSection = (id) => {
    tilesEl.querySelectorAll('.set-tile').forEach(t => t.classList.toggle('on', t.dataset.id === id));
    if (id === 'audio') {
      panel.innerHTML = `
        <div class="section-tag">AUDIO</div>
        ${row('Sound effects', `<input type="checkbox" id="sSound" ${save.sound ? 'checked' : ''} style="width:20px;height:20px;cursor:pointer;">`)}
        ${row('Master volume', `<input type="range" id="sMaster" min="0" max="100" value="${save.audioMaster ?? 80}">`)}
        ${row('Crowd', `<input type="range" id="sCrowd" min="0" max="100" value="${save.audioCrowd ?? 70}">`)}
        ${row('Whistle & kicks', `<input type="range" id="sSfx" min="0" max="100" value="${save.audioSfx ?? 80}">`)}`;
      panel.querySelector('#sSound').onchange = e => { save.sound = e.target.checked; window.__soundDisabled = !save.sound; persist(); };
      panel.querySelector('#sMaster').oninput = e => { save.audioMaster = +e.target.value; persist(); };
      panel.querySelector('#sCrowd').oninput = e => { save.audioCrowd = +e.target.value; persist(); };
      panel.querySelector('#sSfx').oninput = e => { save.audioSfx = +e.target.value; persist(); };
    } else if (id === 'camera') {
      const preset = migratePreset(cam?.preset || save.cameraPreset);
      const dist = Math.round((cam?.distance || save.cameraDistance || 1) * 100);
      panel.innerHTML = `
        <div class="section-tag">CAMERA</div>
        ${row('Camera type', `<select id="sCamP" class="btn" style="padding:8px 12px; transform:none;">${CAMERA_PRESETS.map(p => `<option value="${p}" ${preset === p ? 'selected' : ''}>${PRESET_LABELS[p]}</option>`).join('')}</select>`)}
        ${row('Distance <span id="sCamDL" class="dim">(' + dist + '%)</span>', `<input type="range" id="sCamD" min="80" max="130" value="${dist}">`)}`;
      panel.querySelector('#sCamP').onchange = e => {
        save.cameraPreset = e.target.value;
        if (cam) cam.preset = e.target.value;
        persist();
      };
      panel.querySelector('#sCamD').oninput = e => {
        save.cameraDistance = +e.target.value / 100;
        if (cam) cam.setDistance(save.cameraDistance);
        panel.querySelector('#sCamDL').textContent = `(${e.target.value}%)`;
        persist();
      };
    } else if (id === 'match') {
      panel.innerHTML = `
        <div class="section-tag">MATCH RULES</div>
        ${row('Half length', `<select id="sLen" class="btn" style="padding:8px 12px; transform:none;">
          ${[[120, '2 Mins'], [240, '4 Mins'], [360, '6 Mins']].map(([v, l]) => `<option value="${v}" ${save.halfLength === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
        ${row('Difficulty', `<select id="sDif" class="btn" style="padding:8px 12px; transform:none;">
          ${['amateur', 'pro', 'legend'].map(d => `<option value="${d}" ${save.difficulty === d ? 'selected' : ''}>${d[0].toUpperCase() + d.slice(1)}</option>`).join('')}</select>`)}
        <p class="dim" style="margin-top:10px; font-size:11.5px;">Applies to Quick Match and career matches started after the change.</p>`;
      panel.querySelector('#sLen').onchange = e => { save.halfLength = +e.target.value; persist(); };
      panel.querySelector('#sDif').onchange = e => { save.difficulty = e.target.value; persist(); };
    } else if (id === 'display') {
      panel.innerHTML = `
        <div class="section-tag">DISPLAY</div>
        ${row('Player nameplates', `<input type="checkbox" id="sNames" ${save.showPlayerNames !== false ? 'checked' : ''} style="width:20px;height:20px;cursor:pointer;">`)}
        ${row('Ball shadow trail', `<input type="checkbox" id="sTrail" ${save.showBallTrail !== false ? 'checked' : ''} style="width:20px;height:20px;cursor:pointer;">`)}`;
      panel.querySelector('#sNames').onchange = e => { save.showPlayerNames = e.target.checked; persist(); };
      panel.querySelector('#sTrail').onchange = e => { save.showBallTrail = e.target.checked; persist(); };
    } else if (id === 'data') {
      const hasCareer = save.career && save.career.clubId !== null;
      panel.innerHTML = `
        <div class="section-tag">DATA</div>
        ${row('Career progress', `<button class="btn" id="sReset" style="border-color:#e05263; color:#e05263; padding:8px 14px;" ${hasCareer ? '' : 'disabled'}>RESET CAREER</button>`)}
        ${row('Everything (settings, results, career)', `<button class="btn" id="sWipe" style="border-color:#e05263; color:#e05263; padding:8px 14px;">CLEAR ALL DATA</button>`)}
        <p class="dim" style="margin-top:10px; font-size:11.5px;">Resets cannot be undone. Quick Match is unaffected by career resets.</p>`;
      panel.querySelector('#sReset').onclick = () => {
        if (!confirm('Reset your career progress? This cannot be undone.')) return;
        save.career = { version: CAREER_VERSION, clubId: null };
        persist();
        Toast.show('Career progress reset.', 'error');
        renderSection('data');
      };
      panel.querySelector('#sWipe').onclick = () => {
        if (!confirm('Clear ALL saved data (career, results, settings)?')) return;
        localStorage.removeItem('dreamkick.v2');
        Toast.show('All data cleared — reloading.', 'error');
        setTimeout(() => location.reload(), 700);
      };
    }
  };

  for (const s of SECTIONS) {
    const t = document.createElement('button');
    t.className = 'set-tile';
    t.dataset.id = s.id;
    t.innerHTML = `<span class="ht-icon">${icon(s.icon, 22)}</span>
      <span class="ht-title">${s.title}</span><span class="ht-sub">${s.sub}</span>`;
    t.onclick = () => renderSection(s.id);
    tilesEl.appendChild(t);
  }
  renderSection('audio');

  S.show(shell.el);
  S.setupInteractions(shell.el);
}
