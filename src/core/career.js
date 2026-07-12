/**
 * career.js — V3 Phase D: light DLS-style season wrapper (DOM-free).
 * Single round-robin (19 rounds, circle method), league table computed from
 * played fixtures, seeded quick-sim for AI fixtures, end-of-season player
 * progression (age curves from Sportsim-pro weeklyDevelopment, simplified).
 * Persisted inside the existing dreamkick.v2 save under save.career.
 */
import { CLUBS, overallOf, playerForm } from '../data/teams.js';
import { makeRng, clamp, irand } from './math.js';

export const CAREER_VERSION = 3;

/* ---------------- fixtures: circle-method round robin ---------------- */

/** 19 rounds × 10 pairings covering all 20 clubs once each. */
function buildRounds(seasonNumber) {
  const n = CLUBS.length;              // 20 (even)
  const ids = CLUBS.map(c => c.id);
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i], b = ids[n - 1 - i];
      // alternate venue by round + season so home/away varies
      const flip = (r + seasonNumber) % 2 === 0;
      pairs.push({ home: flip ? a : b, away: flip ? b : a, played: false, hs: 0, as: 0 });
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop()); // rotate all but ids[0]
  }
  return rounds;
}

/* ---------------- career lifecycle ---------------- */

export function newCareer(clubId, seasonNumber = 1, history = []) {
  return {
    version: CAREER_VERSION,
    clubId,
    season: seasonNumber,
    week: 1,                       // 1-based round index; > rounds.length ⇒ season over
    rounds: buildRounds(seasonNumber),
    history,                       // [{season, position, champion, points}]
    playerDev: {},                 // playerId → {age, d:{pace,shoot,pass,dribble,defend,physical}}
    seasonStats: {},               // playerId → {apps,goals,assists,tackles,saves,ratings[]} (user club)
  };
}

/** Migrate any pre-V3 career shape (old: {clubId, week, stats[]}). */
export function migrateCareer(save) {
  const c = save.career;
  if (!c || c.clubId === null || c.clubId === undefined) {
    save.career = { version: CAREER_VERSION, clubId: null };
    return save.career;
  }
  if (c.version !== CAREER_VERSION) {
    save.career = newCareer(c.clubId, 1, []);
  }
  return save.career;
}

export function totalRounds(career) { return career.rounds.length; }
export function seasonOver(career) { return career.week > career.rounds.length; }

export function userFixture(career) {
  if (seasonOver(career)) return null;
  const round = career.rounds[career.week - 1];
  return round.find(f => f.home === career.clubId || f.away === career.clubId) || null;
}

/* ---------------- table & form ---------------- */

export function leagueTable(career) {
  const rows = new Map(CLUBS.map(c => [c.id, { id: c.id, pld: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }]));
  for (const round of career.rounds) {
    for (const f of round) {
      if (!f.played) continue;
      const H = rows.get(f.home), A = rows.get(f.away);
      H.pld++; A.pld++;
      H.gf += f.hs; H.ga += f.as; A.gf += f.as; A.ga += f.hs;
      if (f.hs > f.as) { H.w++; H.pts += 3; A.l++; }
      else if (f.hs < f.as) { A.w++; A.pts += 3; H.l++; }
      else { H.d++; A.d++; H.pts++; A.pts++; }
    }
  }
  const arr = [...rows.values()];
  for (const r of arr) r.gd = r.gf - r.ga;
  arr.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return arr;
}

export function leaguePosition(career, clubId = career.clubId) {
  return leagueTable(career).findIndex(r => r.id === clubId) + 1;
}

/** Last-n W/D/L for a club, oldest first (formUtils.ts pattern). */
export function teamFormLetters(career, clubId = career.clubId, n = 5) {
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

/* ---------------- playing / simming a round ---------------- */

function quickSim(rng, homeClub, awayClub) {
  const edge = (homeClub.rating - awayClub.rating) * 0.06 + 0.25; // home advantage
  const hExp = clamp(1.35 + edge, 0.3, 3.4);
  const aExp = clamp(1.1 - edge, 0.25, 3.2);
  const draw = (exp) => { // crude poisson-ish
    let g = 0;
    for (let i = 0; i < 5; i++) if (rng() < exp / 5) g++;
    return g;
  };
  return [draw(hExp), draw(aExp)];
}

/**
 * Complete the current round: record the user's result (or quick-sim it when
 * `userResult` is null), sim the other nine fixtures, advance the week.
 * @param {{hs:number, as:number}|null} userResult goals in the USER fixture's home/away order
 */
export function completeRound(career, userResult = null) {
  if (seasonOver(career)) return;
  const rng = makeRng(0xca3e + career.season * 971 + career.week * 131);
  const round = career.rounds[career.week - 1];
  for (const f of round) {
    if (f.played) continue;
    const isUser = f.home === career.clubId || f.away === career.clubId;
    if (isUser && userResult) {
      f.hs = userResult.hs; f.as = userResult.as;
    } else {
      [f.hs, f.as] = quickSim(rng, CLUBS[f.home], CLUBS[f.away]);
      // simmed USER fixture: attribute goals to squad so top-scorer stays alive
      if (isUser) attributeSimGoals(career, rng, f);
    }
    f.played = true;
  }
  career.week++;
}

function attributeSimGoals(career, rng, f) {
  const mine = f.home === career.clubId ? f.hs : f.as;
  const squad = CLUBS[career.clubId].squad;
  const attackers = squad.filter(p => p.pos === 'FW' || p.pos === 'MF');
  for (let g = 0; g < mine; g++) {
    const p = attackers[irand(rng, 0, attackers.length - 1)];
    p.season.goals++;
  }
  for (const p of squad) p.season.apps++;
}

/* ---------------- user-club season stats persistence ---------------- */

/** Snapshot the user club's per-player season stats into the career object. */
export function syncSeasonStats(career) {
  const out = {};
  for (const p of CLUBS[career.clubId].squad) {
    out[p.id] = { ...p.season, matchRatings: p.season.matchRatings.slice(-10) };
  }
  career.seasonStats = out;
}

/** Re-apply persisted career state onto the deterministic CLUBS data (boot). */
export function applyCareerToClubs(career) {
  if (!career || career.clubId === null || !career.version) return;
  // player development deltas (all clubs)
  for (const club of CLUBS) {
    for (const p of club.squad) {
      const dev = career.playerDev?.[p.id];
      if (dev) {
        p.age = dev.age;
        for (const k of ['pace', 'shoot', 'pass', 'dribble', 'defend', 'physical']) {
          p[k] = clamp(p[k] + (dev.d[k] || 0), 40, 99);
        }
        p.overall = overallOf(p);
      }
    }
  }
  // user club season stats
  for (const p of CLUBS[career.clubId].squad) {
    const sn = career.seasonStats?.[p.id];
    if (sn) p.season = { ...p.season, ...sn, matchRatings: sn.matchRatings || [] };
  }
}

export function topScorer(career) {
  const squad = CLUBS[career.clubId].squad;
  return [...squad].sort((a, b) => b.season.goals - a.season.goals)[0];
}

/* ---------------- end of season ---------------- */

/**
 * Close the season: history entry + player progression (age curves), then
 * roll into a fresh season with the same club. Returns the summary.
 */
export function endSeason(career) {
  const table = leagueTable(career);
  const summary = {
    season: career.season,
    champion: CLUBS[table[0].id].name,
    position: leaguePosition(career),
    points: table.find(r => r.id === career.clubId)?.pts ?? 0,
    topScorer: topScorer(career),
  };
  const history = [...(career.history || []), {
    season: summary.season, position: summary.position,
    champion: summary.champion, points: summary.points,
  }];

  // ---- player progression (weeklyDevelopment.ts age curve, simplified) ----
  const rng = makeRng(0xdeb + career.season * 7919);
  const dev = { ...(career.playerDev || {}) };
  for (const club of CLUBS) {
    for (const p of club.squad) {
      const growth =
        p.age < 24 ? 1.6 :
        p.age < 27 ? 0.7 :
        p.age < 31 ? -0.2 :
        p.age < 34 ? -0.8 : -1.4;
      // user club: season form nudges development (avg rating > 7 grows more)
      let formBonus = 0;
      if (club.id === career.clubId) {
        const f = playerForm(p);
        if (f >= 7.2) formBonus = 0.8;
        else if (f > 0 && f < 5.8) formBonus = -0.4;
      }
      const d = dev[p.id]?.d || { pace: 0, shoot: 0, pass: 0, dribble: 0, defend: 0, physical: 0 };
      for (const k of Object.keys(d)) {
        const delta = Math.round(growth + formBonus + (rng() * 2 - 1) * 1.2);
        d[k] = clamp(d[k] + delta, -20, 25);
        p[k] = clamp(p[k] + delta, 40, 99);
      }
      p.age++;
      p.overall = overallOf(p);
      p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
      dev[p.id] = { age: p.age, d };
    }
  }

  const next = newCareer(career.clubId, career.season + 1, history);
  next.playerDev = dev;
  return { summary, next };
}
