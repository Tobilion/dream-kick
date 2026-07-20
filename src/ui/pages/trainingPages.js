/**
 * trainingPages.js — V4 Phase E: Training & Coaching page.
 * Pure UI to select weekly training focus and hire/fire specialty coaches.
 * Persists changes directly in save.career and writes to localStorage.
 */
import { CLUBS } from '../../data/teams.js';
import { Toast } from '../components.js';
import { pageShell, fmtCoins } from '../hub.js';
import { activeCoachWages } from '../../core/finance.js';

export function trainingPage(S, career) {
  const me = CLUBS[career.clubId];
  const persist = () => localStorage.setItem('dreamkick.v2', JSON.stringify(S.save));

  const shell = pageShell('TRAINING & COACHES', () => S.triggerWipe(() => S.career()),
    `<span>S${career.season} · MD ${career.week}</span>`);

  const render = () => {
    const focus = career.trainingFocus || 'Youth';
    const coaches = career.coaches || { Attacking: false, Defending: false, Fitness: false };
    const balance = career.finance?.balance ?? 0;
    const weeklyCoachWage = activeCoachWages(coaches);

    shell.content.innerHTML = `
      <div class="panel" style="padding:14px 18px;">
        <div class="career-dash-row"><span>Club Balance</span><b style="color:${balance < 0 ? '#e05263' : 'var(--accent)'};">${fmtCoins(balance)}</b></div>
        <div class="career-dash-row"><span>Coaches Wages</span><b style="color:#fb7185;">−${fmtCoins(weeklyCoachWage)}/matchday</b></div>
      </div>

      <div class="panel" style="padding:14px 18px;">
        <div class="section-tag">WEEKLY TRAINING FOCUS (ATTRIBUTES GROW AT SEASON END)</div>
        <div class="focus-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-top:8px;">
          ${[
            { name: 'Attack', desc: 'Boosts Shooting & Dribbling stats. Nudges FW/MF in-season ratings.', amp: 'Attacking Coach' },
            { name: 'Defense', desc: 'Boosts Defending & Physical stats. Nudges DF/GK in-season ratings.', amp: 'Defending Coach' },
            { name: 'Fitness', desc: 'Boosts Pace & Physical stats. Nudges all players in-season ratings.', amp: 'Fitness Coach' },
            { name: 'Youth', desc: 'Boosts overall growth for players aged under 22.', amp: 'Youth Coach' }
          ].map(f => {
            const active = focus === f.name;
            const coachActive = f.name !== 'Youth' && coaches[f.name + 'ing'];
            return `
              <div class="focus-card spotlight-card ${active ? 'focus-active' : ''}" data-focus="${f.name}" style="padding:12px; border-radius:6px; cursor:pointer; border: 2px solid ${active ? 'var(--accent)' : 'transparent'}; background:${active ? 'rgba(0,212,163,0.06)' : 'var(--surface)'}; display:flex; flex-direction:column; justify-content:space-between; transition:all 0.2s;">
                <div style="font-weight:900; font-size:14px; color:${active ? 'var(--accent)' : 'white'};">${f.name.toUpperCase()}</div>
                <div class="dim" style="font-size:10px; margin-top:4px; line-height:1.2; min-height:36px;">${f.desc}</div>
                ${coachActive ? `<div style="font-size:9px; color:var(--accent); font-weight:800; margin-top:6px; letter-spacing:0.04em;">AMPLIFIED BY COACH</div>` : ''}
              </div>`;
          }).join('')}
        </div>
      </div>

      <div class="panel" style="padding:14px 18px;">
        <div class="section-tag">HIRE SPECIALTY COACHES (AMPLIFY MATCHING FOCUS W/ WAGE WEYLY)</div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
          ${[
            { type: 'Attacking', name: 'Attacking Coach', cost: 150, matches: 'Attack Focus' },
            { type: 'Defending', name: 'Defending Coach', cost: 150, matches: 'Defense Focus' },
            { type: 'Fitness', name: 'Fitness Coach', cost: 150, matches: 'Fitness Focus' }
          ].map(c => {
            const hired = coaches[c.type];
            return `
              <div class="career-dash-row" style="padding:10px 14px; background:var(--surface); border-radius:6px;">
                <div style="display:flex; flex-direction:column;">
                  <span style="font-weight:800; font-size:13px; color:${hired ? 'var(--accent)' : 'white'};">${c.name}</span>
                  <span class="dim" style="font-size:10px; margin-top:2px;">Wage: ${fmtCoins(c.cost)}/matchday · Amplifies ${c.matches}</span>
                </div>
                <b>
                  ${hired
                    ? `<span style="font-size:11px; color:var(--accent); margin-right:12px; font-weight:800;">ACTIVE</span>
                       <button class="btn" data-fire="${c.type}" style="padding:4px 12px; font-weight:800; background:#e05263; color:white; border-color:#e05263;">FIRE</button>`
                    : `<button class="btn primary" data-hire="${c.type}" style="padding:4px 12px; font-weight:800;" ${balance < c.cost ? 'disabled' : ''}>HIRE</button>`
                  }
                </b>
              </div>`;
          }).join('')}
        </div>
      </div>`;

    // Bind Focus card click handlers
    shell.content.querySelectorAll('[data-focus]').forEach(card => {
      card.onclick = () => {
        const nextFocus = card.dataset.focus;
        career.trainingFocus = nextFocus;
        persist();
        Toast.show(`Training focus set to ${nextFocus}!`, 'success');
        render();
      };
    });

    // Bind Hire click handlers
    shell.content.querySelectorAll('[data-hire]').forEach(b => {
      b.onclick = () => {
        const type = b.dataset.hire;
        if (!career.coaches) {
          career.coaches = { Attacking: false, Defending: false, Fitness: false };
        }
        career.coaches[type] = true;
        persist();
        Toast.show(`${type} Coach hired! Wage -150 coins/week active.`, 'success');
        render();
      };
    });

    // Bind Fire click handlers
    shell.content.querySelectorAll('[data-fire]').forEach(b => {
      b.onclick = () => {
        const type = b.dataset.fire;
        if (career.coaches) {
          career.coaches[type] = false;
        }
        persist();
        Toast.show(`${type} Coach fired. wages stopped.`, 'info');
        render();
      };
    });
  };

  render();
  S.show(shell.el);
  if (S.setupInteractions) S.setupInteractions(shell.el);
}
