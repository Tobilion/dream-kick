import { CLUBS } from '../data/teams.js';
import { clamp } from './math.js';

export const CONFIDENCE_THRESHOLDS = {
  DELIGHTED: 80,
  CONTENT: 60,
  CONCERNED: 40,
  ULTIMATUM: 25,
};

export function getConfidenceLabel(confidence) {
  if (confidence >= CONFIDENCE_THRESHOLDS.DELIGHTED) return 'Delighted';
  if (confidence >= CONFIDENCE_THRESHOLDS.CONTENT) return 'Content';
  if (confidence >= CONFIDENCE_THRESHOLDS.CONCERNED) return 'Concerned';
  return 'Ultimatum';
}

export function getConfidenceColor(confidence) {
  if (confidence >= CONFIDENCE_THRESHOLDS.DELIGHTED) return '#00d4a3';
  if (confidence >= CONFIDENCE_THRESHOLDS.CONTENT) return 'var(--accent, #00d4a3)';
  if (confidence >= CONFIDENCE_THRESHOLDS.CONCERNED) return '#f39c12';
  return '#e05263';
}

export function generateSeasonObjectives(club, career) {
  const userDiv = career.division || 1;
  
  // Graceful fallback for div1/div2 if not set (migration safety)
  const div1 = career.div1 || [...CLUBS].sort((a, b) => b.rating - a.rating).slice(0, 10).map(c => c.id);
  const div2 = career.div2 || [...CLUBS].sort((a, b) => b.rating - a.rating).slice(10).map(c => c.id);
  const userDivClubs = userDiv === 1 ? div1 : div2;
  
  const sorted = [...userDivClubs]
    .map(id => CLUBS[id])
    .sort((a, b) => b.rating - a.rating);
  const rank = sorted.findIndex(c => c.id === club.id) + 1;


  let leagueTarget = 6;
  let leagueDesc = '';
  let leagueReward = 2000;

  if (userDiv === 1) {
    if (rank <= 4) {
      leagueTarget = 2;
      leagueDesc = 'Finish in the top 2 of Division 1';
      leagueReward = 6000;
    } else if (rank <= 8) {
      leagueTarget = 6;
      leagueDesc = 'Finish in the top 6 of Division 1';
      leagueReward = 3000;
    } else {
      leagueTarget = 8;
      leagueDesc = 'Avoid relegation (finish in the top 8 of Division 1)';
      leagueReward = 1500;
    }
  } else {
    if (rank <= 3) {
      leagueTarget = 2;
      leagueDesc = 'Earn promotion (finish in the top 2 of Division 2)';
      leagueReward = 4000;
    } else if (rank <= 8) {
      leagueTarget = 6;
      leagueDesc = 'Finish in the top 6 of Division 2';
      leagueReward = 2000;
    } else {
      leagueTarget = 8;
      leagueDesc = 'Avoid bottom (finish in the top 8 of Division 2)';
      leagueReward = 1000;
    }
  }

  const cupTarget = (userDiv === 1 && rank <= 4) ? 2 : 1;
  const cupDesc = cupTarget === 2
    ? 'Reach the Quarter-Finals of the Dream Cup'
    : 'Reach the Round of 16 of the Dream Cup';
  const cupReward = cupTarget === 2 ? 2500 : 1000;

  return {
    confidence: career.board?.confidence ?? 60,
    objectives: [
      {
        id: 'league',
        type: 'league_position',
        target: leagueTarget,
        description: leagueDesc,
        reward: leagueReward,
        status: 'active'
      },
      {
        id: 'cup',
        type: 'cup_round',
        target: cupTarget,
        description: cupDesc,
        reward: cupReward,
        status: 'active'
      }
    ],
    lastDelta: 0
  };
}

export function ensureBoardState(career) {
  if (!career.board && career.clubId !== null && career.clubId !== undefined) {
    const club = CLUBS[career.clubId];
    career.board = generateSeasonObjectives(club, career);
  }
}


export function refreshObjectiveProgress(career) {
  ensureBoardState(career);
  const cupObj = career.board.objectives.find(o => o.type === 'cup_round');
  if (cupObj && cupObj.status === 'active') {
    const cup = career.cup;
    if (cup) {
      if (cup.champion === career.clubId) {
        cupObj.status = 'achieved';
      } else if (cup.userOut !== null) {
        if (cup.userOut >= cupObj.target) {
          cupObj.status = 'achieved';
        } else {
          cupObj.status = 'failed';
        }
      }
    }
  }
}

export function updateBoardConfidence(career, matchType, details) {
  ensureBoardState(career);
  let delta = 0;

  if (matchType === 'league') {
    const { outcome, opponentId } = details;

    const leagueObj = career.board.objectives.find(o => o.type === 'league_position');
    if (leagueObj) {
      const sortedTable = divTable(career, career.division === 2 ? career.div2 : career.div1);
      const pos = sortedTable.findIndex(r => r.id === career.clubId) + 1;
      
      if (pos <= leagueObj.target) {
        delta += 2;
      } else {
        delta -= 2;
      }

      const oppPos = sortedTable.findIndex(r => r.id === opponentId) + 1;
      if (outcome === 'W') {
        if (oppPos <= 3) {
          delta += 3;
        } else {
          delta += 1;
        }
      } else if (outcome === 'L') {
        if (oppPos >= 8) {
          delta -= 3;
        } else {
          delta -= 1;
        }
      }
    }

    const form = teamFormLetters(career, career.clubId, 5);
    const wins = form.filter(f => f === 'W').length;
    const losses = form.filter(f => f === 'L').length;
    if (wins >= 3) {
      delta += 1;
    } else if (losses >= 3) {
      delta -= 1;
    }

  } else if (matchType === 'cup') {
    const { outcome, exited } = details;
    if (exited) {
      delta -= 5;
    } else if (outcome === 'W') {
      delta += 2;
    }
  }

  const oldConf = career.board.confidence;
  career.board.confidence = clamp(career.board.confidence + delta, 0, 100);
  const actualDelta = career.board.confidence - oldConf;
  career.board.lastDelta = actualDelta;
  return actualDelta;
}

function divTable(career, clubIds) {
  const rows = new Map(clubIds.map(id => [id, { id, pld: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  for (const round of career.rounds) {
    for (const f of round) {
      if (!f.played || !rows.has(f.home) || !rows.has(f.away)) continue;
      const H = rows.get(f.home), A = rows.get(f.away);
      H.pld++; A.pld++; H.gf += f.hs; H.ga += f.as; A.gf += f.as; A.ga += f.hs;
      if (f.hs > f.as) { H.w++; A.l++; H.pts += 3; }
      else if (f.as > f.hs) { A.w++; H.l++; A.pts += 3; }
      else { H.d++; A.d++; H.pts++; A.pts++; }
    }
  }
  const arr = [...rows.values()];
  for (const r of arr) r.gd = r.gf - r.ga;
  arr.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return arr;
}

function teamFormLetters(career, clubId, n = 5) {
  const results = [];
  for (const round of career.rounds) {
    for (const f of round) {
      if (!f.played || (f.home !== clubId && f.away !== clubId)) continue;
      const gs = f.home === clubId ? f.hs : f.as;
      const gc = f.home === clubId ? f.as : f.hs;
      results.push(gs > gc ? 'W' : gs < gc ? 'L' : 'D');
    }
  }
  return results.slice(-n);
}
