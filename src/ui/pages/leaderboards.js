/**
 * leaderboards.js — V6 Phase L1: League-wide stat leaderboards page.
 * Shows Top-10 scorers and top-10 assisters across all 20 clubs.
 * User-club players are highlighted.
 */
import { CLUBS } from '../../data/teams.js';
import { pageShell } from '../hub.js';
import { icon } from '../icons.js';
import { leagueLeaderboards } from '../../core/career.js';

/** Map club id → club code string, fast lookup. */
function clubCode(clubId) {
  return CLUBS[clubId]?.code ?? '???';
}

function leaderRow(rank, entry, statKey) {
  const p = entry.player;
  const myClub = entry.isUser;
  const statVal = entry[statKey] ?? 0;
  return `
    <div class="lb-row${myClub ? ' lb-mine' : ''}" style="
      display:flex; align-items:center; gap:10px;
      padding:9px 12px; border-radius:6px;
      background:${myClub ? 'rgba(0,212,163,0.08)' : 'transparent'};
      border-left:3px solid ${myClub ? 'var(--accent)' : 'transparent'};
      transition:background 0.2s;
    ">
      <span style="width:22px; text-align:right; font-size:12px; color:${rank <= 3 ? 'var(--accent)' : 'var(--muted)'}; font-weight:800;">${rank}</span>
      <span style="flex:1; font-weight:${myClub ? '800' : '500'}; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${p.name}
      </span>
      <span class="dim" style="font-size:11px; letter-spacing:0.04em;">${clubCode(entry.clubId)}</span>
      <span style="min-width:28px; text-align:right; font-size:15px; font-weight:900; color:${myClub ? 'var(--accent)' : 'white'};">
        ${statVal}
      </span>
    </div>`;
}

function buildPanel(title, entries, statKey, emptyMsg) {
  const rows = entries.length
    ? entries.map((e, i) => leaderRow(i + 1, e, statKey)).join('')
    : `<div class="dim" style="padding:16px 12px; font-size:13px;">${emptyMsg}</div>`;
  return `
    <div class="panel" style="padding:14px 18px; flex:1 1 280px;">
      <div class="section-tag" style="margin-bottom:8px;">${title}</div>
      <div class="lb-list" style="display:flex; flex-direction:column; gap:2px;">
        ${rows}
      </div>
    </div>`;
}

export function leaderboardPage(S, career) {
  const shell = pageShell('LEADERBOARDS', () => S.triggerWipe(() => S.career()),
    `<span>S${career.season} · MD ${career.week}</span>`);

  const { scorers, assisters } = leagueLeaderboards(career);

  const noGoals = 'No goals scored yet — play some matchdays!';
  const noAssists = 'No assists recorded yet — play some matchdays!';

  shell.content.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:14px; align-items:flex-start;">
      ${buildPanel(`${icon('ball', 14)} TOP SCORERS`, scorers, 'goals', noGoals)}
      ${buildPanel(`${icon('star', 14)} TOP ASSISTS`, assisters, 'assists', noAssists)}
    </div>
    <div class="dim" style="margin-top:12px; font-size:11px; padding:0 4px;">
      Stats accumulated across all Division fixtures. Highlighted rows = your club.
    </div>`;

  S.show(shell.el);
  if (S.setupInteractions) S.setupInteractions(shell.el);
}
