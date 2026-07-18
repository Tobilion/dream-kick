/**
 * career.js — V3 Phase D: light DLS-style season wrapper (DOM-free).
 * Single round-robin (19 rounds, circle method), league table computed from
 * played fixtures, seeded quick-sim for AI fixtures, end-of-season player
 * progression (age curves from Sportsim-pro weeklyDevelopment, simplified).
 * Persisted inside the existing dreamkick.v2 save under save.career.
 */
import { CLUBS, overallOf, playerForm, wageOf, makeYouthPlayer } from '../data/teams.js';
import { makeRng, clamp, irand } from './math.js';
import { initFinance, wageBill, applyMatchday, seasonPrize, saleFee } from './finance.js';
import { marketTick } from './transfers.js';

export const CAREER_VERSION = 4;

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
    finance: initFinance(CLUBS[clubId].rating), // V4 Phase A
    transfers: [],                 // [{club, outId, inPlayer}] — replayed onto CLUBS at boot
    ytSeq: 1,                      // youth-id counter (runtime ids must not collide with pl_N)
    market: null,                  // V4 Phase B: lazily created by ensureMarket()
  };
}

/** Migrate any older career shape. V3→V4 upgrades in place (adds finance). */
export function migrateCareer(save) {
  const c = save.career;
  if (!c || c.clubId === null || c.clubId === undefined) {
    save.career = { version: CAREER_VERSION, clubId: null };
    return save.career;
  }
  c.clubId = Number(c.clubId); // old saves could hold a string id → breaks === checks
  if (c.version === 3) {
    c.version = 4;
    c.finance = initFinance(CLUBS[c.clubId].rating);
    c.transfers = [];
    c.ytSeq = 1;
  } else if (c.version !== CAREER_VERSION) {
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
  // defensive: a NaN rating would make every rng() comparison false → all 0-0
  const hr = Number.isFinite(homeClub?.rating) ? homeClub.rating : 75;
  const ar = Number.isFinite(awayClub?.rating) ? awayClub.rating : 75;
  const edge = (hr - ar) * 0.06 + 0.25; // home advantage
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
  const rng = makeRng(0xca3e + (Number(career.season) || 1) * 971 + (Number(career.week) || 1) * 131);
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
  // ---- finance: income − wages for the user's fixture (V4 Phase A) ----
  const uf = round.find(f => f.home === career.clubId || f.away === career.clubId);
  if (career.finance && uf) {
    const isHome = uf.home === career.clubId;
    const gs = isHome ? uf.hs : uf.as, gc = isHome ? uf.as : uf.hs;
    applyMatchday(career.finance, {
      week: career.week,
      rating: CLUBS[career.clubId].rating,
      isHome,
      result: gs > gc ? 'W' : gs < gc ? 'L' : 'D',
      wages: wageBill(CLUBS[career.clubId].squad),
    });
  }
  career.week++;
  marketTick(career); // V4 Phase B: resolve my sale listings, academy backfill post-window
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
  // squad changes (sales / transfers) — replay BEFORE dev deltas.
  // Shapes: {outId, inPlayer} swap · {outId, inPlayer:null} remove · {outId:null, inPlayer} append
  for (const t of career.transfers || []) {
    const club = CLUBS[t.club];
    const dupe = t.inPlayer && club.squad.some(p => p.id === t.inPlayer.id);
    const clone = t.inPlayer
      ? { ...t.inPlayer, season: { ...t.inPlayer.season, matchRatings: [...(t.inPlayer.season.matchRatings || [])] } }
      : null;
    if (t.outId === null) {
      if (!dupe && clone) club.squad.push(clone);
      continue;
    }
    const i = club.squad.findIndex(p => p.id === t.outId);
    if (i < 0) continue;
    if (clone && !dupe) club.squad.splice(i, 1, clone);
    else if (!clone) club.squad.splice(i, 1);
  }
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
      p.wage = wageOf(p);
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

  // ---- finance: prize money + forced sale if still negative (V4 Phase A) ----
  const fin = career.finance || initFinance(CLUBS[career.clubId].rating);
  summary.prize = seasonPrize(summary.position);
  fin.balance += summary.prize;
  summary.forcedSale = null;
  if (fin.balance < 0) summary.forcedSale = forceSale(career, fin);
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
      p.wage = wageOf(p);
      p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
      dev[p.id] = { age: p.age, d };
    }
  }

  const next = newCareer(career.clubId, career.season + 1, history);
  next.playerDev = dev;
  next.finance = { ...fin, lastIncome: 0, lastWages: 0, log: [] };
  next.transfers = career.transfers || [];
  next.ytSeq = career.ytSeq || 1;
  next.market = career.market
    ? { window: null, listings: [], myListings: [], news: career.market.news }
    : null;
  return { summary, next };
}

/**
 * Budget rule: negative balance at season end forces the sale of the
 * highest-value non-GK player. Backfilled with a regenerated youth player so
 * the squad never shrinks. Recorded in career.transfers (replayed at boot).
 */
export function forceSale(career, fin = career.finance) {
  const club = CLUBS[career.clubId];
  const sellable = club.squad.filter(p => p.pos !== 'GK');
  const out = [...sellable].sort((a, b) => b.marketValue - a.marketValue)[0];
  if (!out) return null;
  const fee = saleFee(out.marketValue);
  const rng = makeRng(0xf05a + career.season * 331 + (career.ytSeq || 1) * 17);
  const youth = makeYouthPlayer(rng, club.region, out.pos, `yt_s${career.season}_${career.ytSeq || 1}`);
  career.ytSeq = (career.ytSeq || 1) + 1;
  youth.num = out.num;
  const i = club.squad.indexOf(out);
  club.squad.splice(i, 1, youth);
  career.transfers = [...(career.transfers || []), { club: club.id, outId: out.id, inPlayer: youth }];
  fin.balance += fee;
  return { player: out.name, pos: out.pos, fee, youth: youth.name };
}
