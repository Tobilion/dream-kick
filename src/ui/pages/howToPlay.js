/**
 * howToPlay.js — V5 U4: rebuilt How to Play. Three tabs-as-tiles
 * (BASICS / ATTACKING / DEFENDING), illustrated rows with key glyphs for
 * keyboard AND touch, rotating tip footer. No paragraphs-of-text.
 */
import { icon } from '../icons.js';
import { pageShell } from '../hub.js';
import { TIPS } from '../screens.js';

const key = k => `<span class="key">${k}</span>`;
const touch = t => `<span class="key key-touch">${t}</span>`;

const TABS = {
  basics: {
    title: 'BASICS', icon: 'ball',
    rows: [
      { k: `${key('W A S D')} ${key('Arrows')}`, t: touch('Left joystick'), a: 'Move player', d: 'Your player has a teal ring and a name plate.' },
      { k: key('Shift'), t: touch('SPRINT'), a: 'Sprint', d: 'Faster runs — drains the stamina bar, so use in bursts.' },
      { k: key('Q'), t: touch('SW'), a: 'Switch player', d: 'Cursor jumps to the teammate closest to the ball. Switch early to set your shape.' },
      { k: `${key('Esc')} ${key('P')}`, t: touch('❚❚'), a: 'Pause', d: 'Team management, stats, replay, settings — all in the pause menu.' },
    ],
  },
  attacking: {
    title: 'ATTACKING', icon: 'play',
    rows: [
      { k: `${key('X')} ${key('Space')}`, t: touch('PASS'), a: 'Pass', d: 'Tap for a ground pass to the best teammate in your aim cone.' },
      { k: `${key('X')} <i class="dim">hold</i>`, t: `${touch('PASS')} <i class="dim">hold</i>`, a: 'Long ball / cross', d: 'Hold to loft it — great for switching wings or crossing into the box.' },
      { k: `${key('C')} ${key('Z')}`, t: touch('SHOOT'), a: 'Shoot', d: 'Hold to charge the power meter — release near the top for a rocket. Harder shots stray more.' },
      { k: `${key('W A S D')} <i class="dim">while shooting</i>`, t: touch('Joystick + SHOOT'), a: 'Aim', d: 'Your movement direction biases shot placement inside the posts.' },
    ],
  },
  defending: {
    title: 'DEFENDING', icon: 'whistle',
    rows: [
      { k: `${key('X')} <i class="dim">tap</i>`, t: `${touch('PASS')} <i class="dim">tap</i>`, a: 'Standing tackle', d: 'Win the ball cleanly when touch-tight. Failed tackles lock you out for a moment.' },
      { k: `${key('C')} <i class="dim">in defence</i>`, t: touch('SHOOT'), a: 'Slide tackle / clear', d: 'Commits you fully — brilliant for stopping breaks, ugly when mistimed. Near your box it clears the ball.' },
      { k: key('Q'), t: touch('SW'), a: 'Switch to presser', d: 'AI teammates press and cover lanes; switch to the defender best placed to challenge.' },
      { k: `<i class="dim">Positioning</i>`, t: `<i class="dim">Positioning</i>`, a: 'Contain', d: 'Jockey between the ball and your goal — forcing a bad pass beats a lunge.' },
    ],
  },
};

export function howToPlayPage(S) {
  const shell = pageShell('HOW TO PLAY', () => S.triggerWipe(() => S.menu()));
  shell.content.innerHTML = `
    <div class="set-tiles" id="howTabs"></div>
    <div class="panel" id="howPanel" style="padding:16px 20px;"></div>
    <div class="menu-foot" id="howTip" style="position:static; text-align:center;">${TIPS[0]}</div>`;

  const tabsEl = shell.content.querySelector('#howTabs');
  const panel = shell.content.querySelector('#howPanel');

  const renderTab = (id) => {
    tabsEl.querySelectorAll('.set-tile').forEach(t => t.classList.toggle('on', t.dataset.id === id));
    const tab = TABS[id];
    panel.innerHTML = `
      <div class="section-tag">${tab.title}</div>
      ${tab.rows.map(r => `
        <div class="how-row">
          <div class="how-keys"><div>${r.k}</div><div class="how-touch">${r.t}</div></div>
          <div class="how-what"><b>${r.a}</b><span class="dim">${r.d}</span></div>
        </div>`).join('')}`;
  };

  for (const [id, tab] of Object.entries(TABS)) {
    const t = document.createElement('button');
    t.className = 'set-tile';
    t.dataset.id = id;
    t.innerHTML = `<span class="ht-icon">${icon(tab.icon, 22)}</span><span class="ht-title">${tab.title}</span>`;
    t.onclick = () => renderTab(id);
    tabsEl.appendChild(t);
  }
  renderTab('basics');

  // rotating tip footer
  let ti = 0;
  const tipEl = shell.content.querySelector('#howTip');
  const iv = setInterval(() => {
    if (!document.body.contains(tipEl)) { clearInterval(iv); return; }
    ti = (ti + 1) % TIPS.length;
    tipEl.style.opacity = 0;
    setTimeout(() => { tipEl.textContent = TIPS[ti]; tipEl.style.opacity = 1; }, 300);
  }, 5000);

  S.show(shell.el);
  S.setupInteractions(shell.el);
}
