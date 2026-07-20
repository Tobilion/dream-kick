/**
 * careerPages.js — V5 U2: dedicated career pages (Fixtures / Table / Finances),
 * each opened from a career-hub tile via pageShell. Pure UI: all data comes
 * from core/career.js + core/finance.js — no computation duplicated here.
 * Every page takes the Screens instance `S`; back always returns to S.career().
 */
import { CLUBS } from '../../data/teams.js';
import { drawBadge } from '../draw.js';
import {
  leagueTable, leaguePosition, teamFormLetters, totalRounds,
  div1Clubs, div2Clubs, divTable, divisionOf, canRequestFunds, requestBoardFunds,
} from '../../core/career.js';
import { initFinance, wageBill, seasonProjection, seasonPrize, activeCoachWages } from '../../core/finance.js';
import {
  ensureCup, cupFinished, userCupLabel, CUP_WEEKS, CUP_ROUND_NAMES,
  CUP_PRIZE_WINNER, CUP_PRIZE_RUNNER_UP,
} from '../../core/cup.js';
import { pageShell, fmtCoins } from '../hub.js';
import { Toast } from '../components.js';

function statusHTML(career) {
  const fin = career.finance || initFinance(CLUBS[career.clubId].rating);
  const div = career.division || divisionOf(career);
  return `<span>S${career.season} · MD ${Math.min(career.week, totalRounds(career))}/${totalRounds(career)} · DIV ${div}</span>
          <b style="color:${fin.balance < 0 ? '#e05263' : 'var(--accent)'};">${fmtCoins(fin.balance)}</b>`;
}

function mount(S, shell) {
  S.show(shell.el);
  S.setupInteractions(shell.el);
  setTimeout(() => {
    shell.el.querySelectorAll('.badge-mini').forEach(c => drawBadge(c, CLUBS[parseInt(c.dataset.club)]));
  }, 50);
}

/* ---------------- FIXTURES ---------------- */

export function fixturesPage(S, career) {
  const shell = pageShell('FIXTURES', () => S.triggerWipe(() => S.career()), statusHTML(career));
  const me = career.clubId;
  shell.content.innerHTML = career.rounds.map((round, ri) => {
    const isCurrent = ri === career.week - 1;
    return `
      <div class="panel fx-round ${isCurrent ? 'fx-current' : ''}">
        <div class="section-tag">MATCHDAY ${ri + 1}${isCurrent ? ' · NEXT' : ''}</div>
        ${round.map(f => {
          const mine = f.home === me || f.away === me;
          const H = CLUBS[f.home], A = CLUBS[f.away];
          return `
            <div class="fx-row ${mine ? 'fx-mine' : ''}">
              <span class="fx-team fx-h">${mine ? `<canvas class="badge-mini" width="18" height="18" data-club="${H.id}"></canvas>` : ''}${H.code}</span>
              <span class="fx-score">${f.played ? `${f.hs} – ${f.as}` : 'v'}</span>
              <span class="fx-team fx-a">${A.code}${mine ? `<canvas class="badge-mini" width="18" height="18" data-club="${A.id}"></canvas>` : ''}</span>
            </div>`;
        }).join('')}
      </div>`;
  }).join('');
  mount(S, shell);
  // jump to the current matchday
  setTimeout(() => shell.el.querySelector('.fx-current')?.scrollIntoView({ block: 'center' }), 120);
}

/* ---------------- LEAGUE TABLE ---------------- */

/**
 * Render one division table as HTML. zone highlights:
 * - Div 1: top 2 = green (cup seeds), bottom 2 = red (relegation)
 * - Div 2: top 2 = green (promotion), bottom 2 = no zone
 */
function divTableHTML(career, clubIds, divNum) {
  const table = divTable(career, clubIds);
  const n = table.length;
  const rows = table.map((st, idx) => {
    const club = CLUBS[st.id];
    const isMe = club.id === career.clubId;
    const form = teamFormLetters(career, st.id, 5);
    let zone = '';
    if (divNum === 1) {
      if (idx === 0) zone = 'pos-1';
      else if (idx < 4) zone = 'pos-top';
      else if (idx >= n - 2) zone = 'pos-drop'; // relegation bottom 2
    } else {
      if (idx < 2) zone = 'pos-top'; // promotion top 2
    }
    return `
      <tr class="${isMe ? 'my-club' : ''} pos-row ${zone}">
        <td><span class="pos-pill">${idx + 1}</span></td>
        <td><canvas class="badge-mini" width="22" height="22" data-club="${club.id}"></canvas>${club.name}</td>
        <td style="text-align:center;">${st.pld}</td>
        <td style="text-align:center;">${st.w}</td>
        <td style="text-align:center;">${st.d}</td>
        <td style="text-align:center;">${st.l}</td>
        <td style="text-align:center;">${st.gd > 0 ? '+' : ''}${st.gd}</td>
        <td style="text-align:center; font-weight:800;">${st.pts}</td>
        <td><span class="form-chips">${form.map(f => `<i class="fc-${f}">${f}</i>`).join('') || '<i class="dim">—</i>'}</span></td>
      </tr>`;
  }).join('');
  return `
    <div class="section-tag" style="margin: 14px 0 6px;">DIVISION ${divNum}</div>
    <table class="career-table">
      <thead><tr>
        <th>#</th><th>CLUB</th>
        <th style="text-align:center;">PLD</th><th style="text-align:center;">W</th>
        <th style="text-align:center;">D</th><th style="text-align:center;">L</th>
        <th style="text-align:center;">GD</th>
        <th style="text-align:center; color:var(--accent);">PTS</th>
        <th>FORM</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * Full standings: both division tables (user's division first).
 * Falls back to single table if div1/div2 not present on career.
 */
export function standingsTableHTML(career) {
  const d1 = div1Clubs(career);
  const d2 = div2Clubs(career);
  const userDiv = career.division || divisionOf(career);
  if (userDiv === 2) {
    return divTableHTML(career, d2, 2) + divTableHTML(career, d1, 1);
  }
  return divTableHTML(career, d1, 1) + divTableHTML(career, d2, 2);
}

export function tablePage(S, career) {
  const shell = pageShell('LEAGUE TABLE', () => S.triggerWipe(() => S.career()), statusHTML(career));
  shell.content.innerHTML = `<div class="panel" style="padding:14px 18px;">${standingsTableHTML(career)}</div>`;
  mount(S, shell);
}

/* ---------------- FINANCES ---------------- */

export function financesPage(S, career) {
  const club = CLUBS[career.clubId];
  const fin = career.finance || initFinance(club.rating);
  const wages = wageBill(club.squad) + activeCoachWages(career.coaches);
  const pos = leaguePosition(career);
  const projection = seasonProjection(fin, totalRounds(career) - career.week + 1, pos);
  const shell = pageShell('FINANCES', () => S.triggerWipe(() => S.career()), statusHTML(career));
  shell.content.innerHTML = `
    <div class="fin-hero panel">
      <div>
        <div class="section-tag">CLUB BALANCE</div>
        <div class="fin-big" style="color:${fin.balance < 0 ? '#e05263' : 'var(--accent)'};">${fmtCoins(fin.balance)}</div>
      </div>
      <div class="ch-stats">
        <div class="ch-stat"><b>−${fmtCoins(wages)}</b><span>WEEKLY WAGES</span></div>
        <div class="ch-stat"><b>+${fmtCoins(fin.sponsor || 0)}</b><span>SPONSOR / MD</span></div>
        <div class="ch-stat"><b>${fmtCoins(projection)}</b><span>PROJECTION</span></div>
      </div>
    </div>
    <div class="panel" style="padding:14px 18px;">
      <div class="section-tag">MATCHDAY LEDGER (LAST ${fin.log.length || 0})</div>
      ${fin.log.length ? [...fin.log].reverse().map(l => `
        <div class="career-dash-row">
          <span>Matchday ${l.week}</span>
          <b><i style="color:var(--accent); font-style:normal;">+${fmtCoins(l.income)}</i>
             &ensp;<i style="color:#fb7185; font-style:normal;">−${fmtCoins(l.wages)}</i>
             &ensp;= ${fmtCoins(l.income - l.wages)}</b>
        </div>`).join('') : '<div class="dim">No matchdays played yet this season.</div>'}
    </div>
    
    <div class="panel" style="padding:14px 18px;">
      <div class="section-tag">BOARDROOM: APPLY FOR CAPITAL FUNDS</div>
      <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 10px;">
        <div class="dim" style="font-size: 11px; line-height: 1.4;">
          Submit a proposal to the board of directors for additional capital injection. 
          Approval odds decline for larger sums and low league positions.
          <br>
          <span style="color:var(--accent); font-weight:800;">Cooldown: 4 matchdays. Max 3 applications per season.</span>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
          ${[500, 1000, 2000, 4000].map(amt => {
            const possible = canRequestFunds(career);
            return `
              <button class="btn primary magnetic-btn" data-req-amount="${amt}" style="flex: 1; padding: 10px 4px; font-weight: 900; font-size: 12px; min-width: 60px;" ${!possible ? 'disabled' : ''}>
                +${amt}
              </button>
            `;
          }).join('')}
        </div>
        <div id="boardReqStatus" class="dim" style="font-size: 11px; margin-top: 4px; font-style: italic; color: #fbbf24;">
          ${(() => {
            const br = career.boardRequest || { lastWeek: 0, cooldown: 4 };
            const seasonRequestCount = br.seasonCount ?? 0;
            if (seasonRequestCount >= 3) {
              return "Status: Maxed out (3/3 proposals submitted this season). Ready next season.";
            }
            const nextWeekAvail = br.lastWeek + 4;
            if (career.week < nextWeekAvail) {
              return `Status: Board reviewing prior actions. Available Matchday ${nextWeekAvail} (Week ${nextWeekAvail - career.week} left).`;
            }
            return `Status: Proposal window open. (Used ${seasonRequestCount}/3 this season)`;
          })()}
        </div>
      </div>
    </div>

    <div class="panel" style="padding:14px 18px;">
      <div class="section-tag">SEASON PRIZE MONEY (BY FINAL POSITION)</div>
      ${[1, 2, 3, 4, 10, 20].map(p => `
        <div class="career-dash-row"><span>${p}${['st','nd','rd'][p-1] || 'th'} place</span>
        <b>${fmtCoins(seasonPrize(p))}</b></div>`).join('')}
    </div>`;
    
  shell.content.querySelectorAll('[data-req-amount]').forEach(btn => {
    btn.onclick = () => {
      const amt = parseInt(btn.dataset.reqAmount);
      const res = requestBoardFunds(career, amt);
      if (!res) {
        Toast.show("Proposal window is closed (cooldown active/season max reached).", "error");
        return;
      }
      localStorage.setItem('dreamkick.v2', JSON.stringify(S.save));
      if (res.approved) {
        Toast.show(`BOARD DECREE: Capital injection of +${amt} coins approved!`, "success");
      } else {
        Toast.show(`PROPOSAL DENIED: Requested +${amt} coins rejected (Chance: ${res.chance}%, Rolled: ${res.roll}%).`, "error");
      }
      // Re-render financesPage
      financesPage(S, career);
    };
  });
  
  mount(S, shell);
}

/* ---------------- DREAM CUP (V4 Phase C) ---------------- */

function cupTieRow(t, me) {
  const H = CLUBS[t.home], A = CLUBS[t.away];
  const mine = t.home === me || t.away === me;
  const score = t.played
    ? `${t.hs} – ${t.as}${t.pen ? `<i class="dim" style="font-style:normal;"> (${t.pen[0]}–${t.pen[1]}p)</i>` : ''}`
    : 'v';
  return `
    <div class="fx-row ${mine ? 'fx-mine' : ''}">
      <span class="fx-team fx-h"><canvas class="badge-mini" width="18" height="18" data-club="${H.id}"></canvas>${H.code}</span>
      <span class="fx-score">${score}</span>
      <span class="fx-team fx-a">${A.code}<canvas class="badge-mini" width="18" height="18" data-club="${A.id}"></canvas></span>
    </div>`;
}

export function cupPage(S, career) {
  const cup = ensureCup(career);
  const me = career.clubId;
  const shell = pageShell('DREAM CUP', () => S.triggerWipe(() => S.career()), statusHTML(career));
  const status = cupFinished(cup)
    ? `CHAMPIONS: <b>${CLUBS[cup.champion].name}</b> · Your run: ${userCupLabel(career)}`
    : `${CUP_ROUND_NAMES[cup.round]} · played before MD ${CUP_WEEKS[cup.round]} · Your run: ${userCupLabel(career)}`;
  const currentRound = !cupFinished(cup) ? `
    <div class="panel fx-round fx-current">
      <div class="section-tag">${CUP_ROUND_NAMES[cup.round]} · NEXT</div>
      ${cup.ties.map(t => cupTieRow(t, me)).join('')}
      ${cup.byes.length ? `<div class="dim" style="margin-top:6px; font-size:11px;">BYES: ${cup.byes.map(id => CLUBS[id].code).join(' · ')}</div>` : ''}
    </div>` : '';
  const archive = [...cup.rounds].reverse().map(r => `
    <div class="panel fx-round">
      <div class="section-tag">${r.name}</div>
      ${r.ties.map(t => cupTieRow(t, me)).join('')}
      ${r.byes?.length ? `<div class="dim" style="margin-top:6px; font-size:11px;">BYES: ${r.byes.map(id => CLUBS[id].code).join(' · ')}</div>` : ''}
    </div>`).join('');
  shell.content.innerHTML = `
    <div class="panel" style="padding:12px 18px;"><div class="dim">${status}</div></div>
    ${currentRound}${archive}
    <div class="panel" style="padding:14px 18px;">
      <div class="section-tag">PRIZE MONEY</div>
      <div class="career-dash-row"><span>Winners</span><b>${fmtCoins(CUP_PRIZE_WINNER)}</b></div>
      <div class="career-dash-row"><span>Runners-up</span><b>${fmtCoins(CUP_PRIZE_RUNNER_UP)}</b></div>
    </div>`;
  mount(S, shell);
}
