/**
 * career.js — V4 Phase D: two divisions with promotion & relegation (DOM-free).
 * Splits 20 clubs into Division 1 (top 10) and Division 2 (bottom 10).
 * Each division runs an 18-round double round-robin (9 opponents × 2).
 * Bottom 2 of Div 1 swap with top 2 of Div 2 at season end.
 * Cup (core/cup.js) remains cross-division — all 20 clubs, unchanged.
 * Persisted inside the existing dreamkick.v2 save under save.career.
 */
import { CLUBS, overallOf, playerForm, wageOf, makeYouthPlayer, pickLineup, valueOf } from '../data/teams.js';
import { makeRng, clamp, irand } from './math.js';
import { initFinance, wageBill, activeCoachWages, applyMatchday, seasonPrize, seasonPrizeDivision, saleFee } from './finance.js';
import { marketTick } from './transfers.js';
import { autoCup, userCupTie, cupDue, playCupRound, finishCup, userCupLabel, ensureCup } from './cup.js';
import { generateSeasonObjectives, ensureBoardState, refreshObjectiveProgress, updateBoardConfidence } from './board.js';

export const CAREER_VERSION = 9;



/* ============================================================
   Division helpers
   ============================================================ */

/**
 * Initial division split at career start (or on first migration):
 * sort all 20 clubs by rating descending; top 10 → Div 1, rest → Div 2.
 */
function defaultDivisions() {
  const sorted = [...CLUBS].sort((a, b) => b.rating - a.rating);
  return {
    div1: sorted.slice(0, 10).map(c => c.id),
    div2: sorted.slice(10).map(c => c.id),
  };
}

/** Return the division (1 or 2) the given club belongs to this season. */
export function divisionOf(career, clubId = career.clubId) {
  if (career.div1?.includes(clubId)) return 1;
  if (career.div2?.includes(clubId)) return 2;
  // fallback for migrated saves mid-transition
  return defaultDivisions().div1.includes(clubId) ? 1 : 2;
}

/** Club IDs in Division 1 for this season. */
export function div1Clubs(career) { return career.div1 || defaultDivisions().div1; }

/** Club IDs in Division 2 for this season. */
export function div2Clubs(career) { return career.div2 || defaultDivisions().div2; }

/* ============================================================
   Fixture generation — double round-robin for 10 clubs (18 rounds)
   ============================================================ */

/**
 * Build 18 rounds for a 10-club division using the circle method.
 * Each club faces each other twice (home + away).
 * @param {number[]} clubIds  array of exactly 10 club IDs
 * @param {number}   seasonNumber
 */
function buildDivRounds(clubIds, seasonNumber) {
  const n = clubIds.length; // must be 10 (even)
  const rounds = [];
  // First half: 9 rounds (each club faces each other once)
  const ids = [...clubIds];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i], b = ids[n - 1 - i];
      const flip = (r + seasonNumber) % 2 === 0;
      pairs.push({ home: flip ? a : b, away: flip ? b : a, played: false, hs: 0, as: 0 });
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop()); // rotate all but ids[0]
  }
  // Second half: reverse fixtures (home ↔ away)
  const firstHalf = rounds.map(round =>
    round.map(f => ({ home: f.away, away: f.home, played: false, hs: 0, as: 0 }))
  );
  return [...rounds, ...firstHalf];
}

/* ============================================================
   Career lifecycle
   ============================================================ */

/**
 * Create a fresh career. div1/div2 optional — defaults to rating-sorted split.
 */
export function newCareer(clubId, seasonNumber = 1, history = [], div1 = null, div2 = null) {
  const divs = div1 && div2 ? { div1, div2 } : defaultDivisions();
  const userDiv = divs.div1.includes(clubId) ? 1 : 2;
  const userDivClubs = userDiv === 1 ? divs.div1 : divs.div2;
  const career = {
    version: CAREER_VERSION,
    clubId,
    season: seasonNumber,
    week: 1,
    rounds: buildDivRounds(userDivClubs, seasonNumber),
    div1: divs.div1,
    div2: divs.div2,
    division: userDiv,
    trainingFocus: 'Youth',
    coaches: { Attacking: false, Defending: false, Fitness: false },
    focusStats: { Attack: 0, Defense: 0, Fitness: 0, Youth: 0 },
    coachStats: { Attacking: 0, Defending: 0, Fitness: 0 },
    history,            // [{season, position, champion, points, division, cupChampion, cupRun}]
    playerDev: {},
    seasonStats: {},
    finance: initFinance(CLUBS[clubId].rating),
    transfers: [],
    ytSeq: 1,
    market: null,
    boardRequest: { lastWeek: 0, cooldown: 4 }, // board fund request state
  };
  ensureBoardState(career);
  return career;
}


/** Migrate any older career shape to V5. */
export function migrateCareer(save) {
  const c = save.career;
  if (!c || c.clubId === null || c.clubId === undefined) {
    save.career = { version: CAREER_VERSION, clubId: null };
    return save.career;
  }
  c.clubId = Number(c.clubId);

  if (c.version === 3) {
    c.version = 4;
    c.finance = initFinance(CLUBS[c.clubId].rating);
    c.transfers = [];
    c.ytSeq = 1;
  }

  if (c.version === 4) {
    // Assign divisions from current table standing (top 10 → Div 1).
    // If rounds haven't been played yet we use the rating-sorted default.
    const divs = defaultDivisions();
    // Refine by table if we have played fixtures.
    const playedAny = (c.rounds || []).some(r => r.some(f => f.played));
    if (playedAny) {
      // Build a temporary table from v4 rounds to rank all 20 clubs.
      const rows = new Map(CLUBS.map(cl => [cl.id, { id: cl.id, pts: 0, gd: 0, gf: 0 }]));
      for (const round of (c.rounds || [])) {
        for (const f of round) {
          if (!f.played) continue;
          const H = rows.get(f.home), A = rows.get(f.away);
          if (!H || !A) continue;
          H.gf += f.hs; H.ga = (H.ga || 0) + f.as; A.gf += f.as; A.ga = (A.ga || 0) + f.hs;
          if (f.hs > f.as) { H.pts += 3; }
          else if (f.as > f.hs) { A.pts += 3; }
          else { H.pts++; A.pts++; }
          H.gd = H.gf - (H.ga || 0); A.gd = A.gf - (A.ga || 0);
        }
      }
      const sorted = [...rows.values()].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
      divs.div1 = sorted.slice(0, 10).map(r => r.id);
      divs.div2 = sorted.slice(10).map(r => r.id);
    }
    c.div1 = divs.div1;
    c.div2 = divs.div2;
    c.division = divs.div1.includes(c.clubId) ? 1 : 2;
    // Rebuild rounds as double-RR for the user's division.
    // Keep the season/week so the user's progress is preserved, but swap rounds format.
    const userDivClubs = c.division === 1 ? c.div1 : c.div2;
    const newRounds = buildDivRounds(userDivClubs, c.season || 1);
    // Copy over played results from old rounds where matching fixtures exist.
    for (const round of (c.rounds || [])) {
      for (const f of round) {
        if (!f.played) continue;
        // Find a matching slot in the new rounds.
        for (const newRound of newRounds) {
          const slot = newRound.find(nf =>
            !nf.played &&
            ((nf.home === f.home && nf.away === f.away) ||
             (nf.home === f.away && nf.away === f.home))
          );
          if (slot) {
            slot.home = f.home; slot.away = f.away;
            slot.hs = f.hs; slot.as = f.as; slot.played = true;
            break;
          }
        }
      }
    }
    c.rounds = newRounds;
    c.version = 5;
    // Ensure V4 fields still present.
    if (!c.transfers) c.transfers = [];
    if (!c.ytSeq) c.ytSeq = 1;
    if (!c.finance) c.finance = initFinance(CLUBS[c.clubId].rating);
  }

  if (c.version === 5) {
    c.trainingFocus = 'Youth';
    c.coaches = { Attacking: false, Defending: false, Fitness: false };
    c.focusStats = { Attack: 0, Defense: 0, Fitness: 0, Youth: 0 };
    c.coachStats = { Attacking: 0, Defending: 0, Fitness: 0 };
    c.version = 6;
  }

  if (c.version === 6) {
    // L1: AI club season stats now persisted — no schema keys added yet;
    // existing seasonStats only covered user club so AI players have no entry.
    // applyCareerToClubs will default-initialise them gracefully on load.
    c.version = 7;
    backfillHistoricalStats(c);
  }

  if (c.version === 7) {
    // L1b: board fund request state
    if (!c.boardRequest) c.boardRequest = { lastWeek: 0, cooldown: 4 };
    c.version = 8;
  }

  if (c.version === 8) {
    ensureBoardState(c);
    c.version = 9;
  }

  if (c.version !== CAREER_VERSION) {
    // Pre-v3 or unknown → full reset.
    save.career = newCareer(c.clubId, 1, []);
  }
  return save.career;
}


export function totalRounds(career) { return career.rounds.length; } // 18 in V5
export function seasonOver(career) { return career.week > career.rounds.length; }

/**
 * Next user fixture: due cup tie takes priority (cup.js, unchanged),
 * otherwise this week's league fixture within the user's division.
 */
export function userFixture(career) {
  if (seasonOver(career)) return null;
  autoCup(career);
  const ct = userCupTie(career);
  if (ct) return ct;
  const round = career.rounds[career.week - 1];
  return round.find(f => f.home === career.clubId || f.away === career.clubId) || null;
}

/* ============================================================
   Table & form helpers
   ============================================================ */

/**
 * Compute a league table for an arbitrary set of club IDs using the
 * career's fixture records. Used for both divisions.
 */
export function divTable(career, clubIds) {
  const set = new Set(clubIds);
  const rows = new Map(clubIds.map(id => [id, { id, pld: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }]));
  for (const round of career.rounds) {
    for (const f of round) {
      if (!f.played) continue;
      if (!set.has(f.home) || !set.has(f.away)) continue;
      const H = rows.get(f.home), A = rows.get(f.away);
      if (!H || !A) continue;
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

/** The user's division table (convenience wrapper). */
export function leagueTable(career) {
  const ids = career.division === 2 ? div2Clubs(career) : div1Clubs(career);
  return divTable(career, ids);
}

export function leaguePosition(career, clubId = career.clubId) {
  return leagueTable(career).findIndex(r => r.id === clubId) + 1;
}

/** Last-n W/D/L for a club, oldest first. */
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

/* ============================================================
   Playing / simming a round
   ============================================================ */

function quickSim(rng, homeClub, awayClub) {
  const hr = Number.isFinite(homeClub?.rating) ? homeClub.rating : 75;
  const ar = Number.isFinite(awayClub?.rating) ? awayClub.rating : 75;
  const edge = (hr - ar) * 0.06 + 0.25;
  const hExp = clamp(1.35 + edge, 0.3, 3.4);
  const aExp = clamp(1.1 - edge, 0.25, 3.2);
  const draw = (exp) => { let g = 0; for (let i = 0; i < 5; i++) if (rng() < exp / 5) g++; return g; };
  return [draw(hExp), draw(aExp)];
}

/**
 * Complete the current round: record the user's result (or quick-sim it when
 * `userResult` is null), sim the other four division fixtures, advance week.
 * @param {{hs:number, as:number}|null} userResult
 */
export function completeRound(career, userResult = null) {
  if (seasonOver(career)) return;
  // Resolve any due cup rounds first.
  let cupGuard = 0;
  while (cupDue(career) && cupGuard++ < 8) {
    playCupRound(career, null, (t, isManual) => attributeCupTieStats(career, t, isManual));
  }

  // V4 Phase E: Track active focus stats and coach stats
  if (!career.focusStats) {
    career.focusStats = { Attack: 0, Defense: 0, Fitness: 0, Youth: 0 };
  }
  if (!career.coachStats) {
    career.coachStats = { Attacking: 0, Defending: 0, Fitness: 0 };
  }
  const currentFocus = career.trainingFocus || 'Youth';
  career.focusStats[currentFocus] = (career.focusStats[currentFocus] || 0) + 1;
  if (career.coaches) {
    for (const key of ['Attacking', 'Defending', 'Fitness']) {
      if (career.coaches[key]) {
        career.coachStats[key] = (career.coachStats[key] || 0) + 1;
      }
    }
  }

  const rng = makeRng(0xca3e + (Number(career.season) || 1) * 971 + (Number(career.week) || 1) * 131);
  const round = career.rounds[career.week - 1];
  for (const f of round) {
    if (f.played) continue;
    const isUser = f.home === career.clubId || f.away === career.clubId;
    const oppId  = isUser ? (f.home === career.clubId ? f.away : f.home) : null;
    if (isUser && userResult) {
      f.hs = userResult.hs; f.as = userResult.as;
      // Real match: user goals are folded by foldSeasonStats in ratings.js.
      // Attribute opponent club's goals (missed without this).
      const oppGoals = f.home === career.clubId ? f.as : f.hs;
      attributeSimClubStats(oppId, oppGoals, rng);
    } else {
      [f.hs, f.as] = quickSim(rng, CLUBS[f.home], CLUBS[f.away]);
      if (isUser) {
        // V3 path for user club goals (unchanged behaviour)
        attributeSimGoals(career, rng, f);
        // Attribute opponent's goals too (L1 addition)
        const oppGoals = f.home === career.clubId ? f.as : f.hs;
        attributeSimClubStats(oppId, oppGoals, rng);
      } else {
        // AI-vs-AI: attribute goals + assists to both squads
        attributeSimClubStats(f.home, f.hs, rng);
        attributeSimClubStats(f.away, f.as, rng);
      }
    }
    f.played = true;
  }
  // Finance: income − wages for the user's fixture.
  const uf = round.find(f => f.home === career.clubId || f.away === career.clubId);
  if (career.finance && uf) {
    const isHome = uf.home === career.clubId;
    const gs = isHome ? uf.hs : uf.as, gc = isHome ? uf.as : uf.hs;
    const cWages = activeCoachWages(career.coaches);
    applyMatchday(career.finance, {
      week: career.week,
      rating: CLUBS[career.clubId].rating,
      isHome,
      result: gs > gc ? 'W' : gs < gc ? 'L' : 'D',
      wages: wageBill(CLUBS[career.clubId].squad) + cWages,
    });
    // L3: update board confidence for league match
    const outcome = gs > gc ? 'W' : gs < gc ? 'L' : 'D';
    const opponentId = uf.home === career.clubId ? uf.away : uf.home;
    updateBoardConfidence(career, 'league', { outcome, opponentId });
  }
  // --- Morale Drivers (V6 Phase L2) ---

  if (uf) {
    for (const f of round) {
      if (!f.played) continue;
      for (const clubId of [f.home, f.away]) {
        const club = CLUBS[clubId];
        const isUser = clubId === career.clubId;
        const starters = pickLineup(club, club.formation || '442');

        const isHome = f.home === clubId;
        const gs = isHome ? f.hs : f.as;
        const gc = isHome ? f.as : f.hs;
        const outcome = gs > gc ? 'W' : gs < gc ? 'L' : 'D';
        const resultChange = outcome === 'W' ? 4 : outcome === 'L' ? -3 : 0;

        for (const p of club.squad) {
          if (p.morale === undefined) p.morale = 70;
          let delta = 0;

          // 1. Result: W +4, L -3, D 0
          delta += resultChange;

          // 2. Played & rated >= 7.5 (manual matches) OR benched
          const played = starters.some(s => s.id === p.id);
          if (played) {
            // For manual matches, check rating
            if (userResult !== null && (isUser || clubId === (uf.home === career.clubId ? uf.away : uf.home))) {
              const ratings = p.season?.matchRatings || [];
              const lastRating = ratings[ratings.length - 1];
              if (lastRating >= 7.5) delta += 3;
            }
          } else {
            // Benched all match
            delta -= 2;
          }

          // 3. Transfer-listed (user club only)
          if (isUser) {
            const isListed = career.market?.myListings?.some(l => l.playerId === p.id) ?? false;
            if (isListed) delta -= 6;
          }

          // 4. Slow drift toward 65 (+/-1)
          if (p.morale > 65) delta -= 1;
          else if (p.morale < 65) delta += 1;

          // Apply and clamp
          p.morale = clamp(p.morale + delta, 20, 95);

          // Track unsettled state for notification/news
          if (isUser && p.morale < 35 && !p._unsettledNotified) {
            p._unsettledNotified = true;
            if (career.market?.news) {
              career.market.news.unshift({
                week: career.week,
                text: `⚠️ UNSETTLED: ${p.name} is unhappy (Morale: ${p.morale}).`
              });
            }
          } else if (p.morale >= 35) {
            p._unsettledNotified = false;
          }
        }
      }
    }
  }
  career.week++;

  autoCup(career, (t, isManual) => attributeCupTieStats(career, t, isManual));
  marketTick(career);
  
  // L3: refresh objectives progress
  refreshObjectiveProgress(career);
}


/** V3 behaviour preserved + L1 assist attribution for user club. */
function attributeSimGoals(career, rng, f) {
  const mine = f.home === career.clubId ? f.hs : f.as;
  const squad = CLUBS[career.clubId].squad;
  const starters = pickLineup(CLUBS[career.clubId], CLUBS[career.clubId].formation || '442');
  const attackers = starters.filter(p => p.pos === 'FW' || p.pos === 'MF');
  if (!attackers.length) { for (const p of squad) p.season.apps++; return; }
  for (let g = 0; g < mine; g++) {
    const scorer = attackers[irand(rng, 0, attackers.length - 1)];
    scorer.season.goals++;
    // ~70% assist chance from a different attacker/midfielder
    if (rng() < 0.7) {
      const assistPool = starters.filter(p => p.pos !== 'GK' && p.id !== scorer.id);
      if (assistPool.length) {
        const assister = assistPool[irand(rng, 0, assistPool.length - 1)];
        assister.season.assists++;
      }
    }
  }
  for (const p of starters) p.season.apps++;
}

/**
 * L1: Attribute goals + assists to an AI club's starting XI.
 * Weight: FW 60 / MF 30 / DF 10, biased by shoot (for goals) or pass (for assists).
 * ~70% chance of assist per goal.
 */
function attributeSimClubStats(clubId, goals, rng) {
  const club = CLUBS[clubId];
  const starters = pickLineup(club, club.formation || '442');
  // Apps +1 for all starters
  for (const p of starters) p.season.apps++;
  if (goals <= 0) return;

  const eligible = starters.filter(p => p.pos !== 'GK');
  if (!eligible.length) return;

  // Build weighted scorer pool (shoot-biased)
  const scoreW = eligible.map(p => {
    const posW = p.pos === 'FW' ? 60 : p.pos === 'MF' ? 30 : 10;
    return posW * ((p.shoot || 60) / 100);
  });
  const totalSW = scoreW.reduce((a, b) => a + b, 0);

  const pickWeighted = (players, weights, total) => {
    let r = rng() * total, sum = 0;
    for (let i = 0; i < players.length; i++) {
      sum += weights[i];
      if (r <= sum) return players[i];
    }
    return players[players.length - 1];
  };

  for (let g = 0; g < goals; g++) {
    const scorer = pickWeighted(eligible, scoreW, totalSW);
    scorer.season.goals++;

    // ~70% chance of recording an assist
    if (rng() < 0.7) {
      const assistPool = starters.filter(p => p.pos !== 'GK' && p.id !== scorer.id);
      if (assistPool.length) {
        const assistW = assistPool.map(p => {
          const posW = p.pos === 'MF' ? 60 : p.pos === 'FW' ? 30 : 10;
          return posW * ((p.pass || 60) / 100);
        });
        const totalAW = assistW.reduce((a, b) => a + b, 0);
        const assister = pickWeighted(assistPool, assistW, totalAW);
        assister.season.assists++;
      }
    }
  }
}

/* ============================================================
   Season-stats persistence
   ============================================================ */

export function syncSeasonStats(career) {
  const out = {};
  for (const club of CLUBS) {
    const isMe = club.id === career.clubId;
    for (const p of club.squad) {
      if (isMe) {
        // User club: full stats including matchRatings, plus morale
        out[p.id] = { ...p.season, matchRatings: p.season.matchRatings.slice(-10), morale: p.morale };
      } else {
        // AI club: compact — apps/goals/assists and morale
        out[p.id] = {
          apps:    p.season?.apps    ?? 0,
          goals:   p.season?.goals   ?? 0,
          assists: p.season?.assists ?? 0,
          morale:  p.morale,
        };
      }
    }
  }
  career.seasonStats = out;
}

export function applyCareerToClubs(career) {
  if (!career || career.clubId === null || !career.version) return;
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
  // Restore season stats for all clubs (user: full; AI: compact)
  for (const club of CLUBS) {
    const isMe = club.id === career.clubId;
    for (const p of club.squad) {
      const sn = career.seasonStats?.[p.id];
      if (sn) {
        if (isMe) {
          p.season = { ...p.season, ...sn, matchRatings: sn.matchRatings || [] };
          p.morale = sn.morale ?? p.morale ?? 70;
        } else {
          // Re-inflate compact AI stats; keep full shape for pickLineup / overallOf
          p.season = {
            apps: sn.apps || 0,
            goals: sn.goals || 0,
            assists: sn.assists || 0,
            tackles: 0,
            saves: 0,
            matchRatings: [],
          };
          p.morale = sn.morale ?? p.morale ?? 70;
        }
      } else {
        // No stored stats yet (first season, new career or pre-L1 save) — reset to defaults
        p.season = {
          apps: 0, goals: 0, assists: 0,
          tackles: 0, saves: 0, matchRatings: [],
        };
        // morale is kept as generated/defined on the player
      }
      // Recalculate values post-load
      p.marketValue = valueOf(p);
      p.wage = wageOf(p);
    }
  }
}

export function topScorer(career) {
  const squad = CLUBS[career.clubId].squad;
  return [...squad].sort((a, b) => b.season.goals - a.season.goals)[0];
}

/**
 * L1: Returns { scorers, assisters } — top-10 each, sorted descending.
 * Each entry: { player, clubId, isUser, goals|assists }.
 */
export function leagueLeaderboards(career) {
  const all = [];
  for (const club of CLUBS) {
    for (const p of club.squad) {
      all.push({ player: p, clubId: club.id, isUser: club.id === career.clubId });
    }
  }
  const scorers = [...all]
    .filter(e => (e.player.season?.goals ?? 0) > 0)
    .sort((a, b) => b.player.season.goals - a.player.season.goals)
    .slice(0, 10)
    .map(e => ({ ...e, goals: e.player.season.goals }));
  const assisters = [...all]
    .filter(e => (e.player.season?.assists ?? 0) > 0)
    .sort((a, b) => b.player.season.assists - a.player.season.assists)
    .slice(0, 10)
    .map(e => ({ ...e, assists: e.player.season.assists }));
  return { scorers, assisters };
}

/** L1: Player with most goals across all clubs this season. */
export function goldenBoot(career) {
  let best = null;
  for (const club of CLUBS) {
    for (const p of club.squad) {
      if (!best || (p.season?.goals ?? 0) > (best.player.season?.goals ?? 0)) {
        best = { player: p, clubId: club.id };
      }
    }
  }
  return best;
}

/* ============================================================
   End of season: promotion, relegation, progression
   ============================================================ */

/**
 * Close the season: compute promotion/relegation, apply prize money,
 * player progression, and roll into a fresh season.
 * Returns { summary, next }.
 */
export function endSeason(career) {
  const cup = finishCup(career, (t, isManual) => attributeCupTieStats(career, t, isManual)); // safety: always concludes cup

  // ---- Both division tables ----
  const d1ids = div1Clubs(career);
  const d2ids = div2Clubs(career);
  const d1table = divTable(career, d1ids);
  const d2table = divTable(career, d2ids);

  // ---- Promotion / relegation (bottom 2 of Div1 ↔ top 2 of Div2) ----
  const SWAP_COUNT = 2;
  const relegated = d1table.slice(-SWAP_COUNT).map(r => r.id); // bottom 2 of Div 1
  const promoted  = d2table.slice(0, SWAP_COUNT).map(r => r.id); // top 2 of Div 2

  const nextDiv1 = [...d1ids.filter(id => !relegated.includes(id)), ...promoted];
  const nextDiv2 = [...d2ids.filter(id => !promoted.includes(id)),  ...relegated];

  // ---- User's result ----
  const userTable = career.division === 1 ? d1table : d2table;
  const myPos = userTable.findIndex(r => r.id === career.clubId) + 1;
  const myPts = userTable.find(r => r.id === career.clubId)?.pts ?? 0;

  // Determine champion: top of user's division table (or Div 1 if Div 2 user)
  const champId = d1table[0].id;

  // Division change for user next season
  let divisionChange = null;
  if (career.division === 1 && relegated.includes(career.clubId)) divisionChange = 'relegated';
  if (career.division === 2 && promoted.includes(career.clubId)) divisionChange = 'promoted';
  const nextDivision = divisionChange === 'relegated' ? 2 : divisionChange === 'promoted' ? 1 : career.division;

  // L3: Board objectives evaluation at season end
  ensureBoardState(career);
  refreshObjectiveProgress(career);

  // Set the league objective status based on final position
  const leagueObj = career.board?.objectives.find(o => o.type === 'league_position');
  if (leagueObj && leagueObj.status === 'active') {
    leagueObj.status = myPos <= leagueObj.target ? 'achieved' : 'failed';
  }

  // Calculate board confidence changes & reward payouts
  let boardBonusPaid = 0;
  if (career.board) {
    for (const obj of career.board.objectives) {
      if (obj.status === 'achieved') {
        career.board.confidence = Math.min(100, career.board.confidence + (obj.type === 'league_position' ? 25 : 15));
        boardBonusPaid += obj.reward;
      } else if (obj.status === 'failed') {
        career.board.confidence = Math.max(0, career.board.confidence - (obj.type === 'league_position' ? 25 : 10));
      }
    }
  }

  const summary = {
    season: career.season,
    champion: CLUBS[champId].name,
    position: myPos,
    points: myPts,
    division: career.division,
    divisionChange,
    topScorer: topScorer(career),
    cup: { champion: CLUBS[cup.champion].name, userRun: userCupLabel(career) },
  };

  // ---- Finance: prize money + board bonuses + forced sale ----
  const fin = career.finance || initFinance(CLUBS[career.clubId].rating);
  summary.prize = seasonPrizeDivision(myPos, career.division);
  fin.balance += summary.prize + boardBonusPaid;
  summary.boardBonus = boardBonusPaid;
  summary.forcedSale = null;
  if (fin.balance < 0) summary.forcedSale = forceSale(career, fin);

  const isSacked = career.board && career.board.confidence < 25;
  summary.sacked = isSacked;

  const history = [...(career.history || []), {
    season: summary.season, position: summary.position,
    champion: summary.champion, points: summary.points,
    division: summary.division, divisionChange,
    cupChampion: summary.cup.champion, cupRun: summary.cup.userRun,
    sacked: isSacked,
  }];



  // ---- Player progression (age curve, weeklyDevelopment.ts pattern) ----
  const rng = makeRng(0xdeb + career.season * 7919);
  const dev = { ...(career.playerDev || {}) };
  for (const club of CLUBS) {
    for (const p of club.squad) {
      const growth =
        p.age < 24 ? 1.6 :
        p.age < 27 ? 0.7 :
        p.age < 31 ? -0.2 :
        p.age < 34 ? -0.8 : -1.4;
      let formBonus = 0;
      if (club.id === career.clubId) {
        const f = playerForm(p);
        if (f >= 7.2) formBonus = 0.8;
        else if (f > 0 && f < 5.8) formBonus = -0.4;
        // L2: morale nudges the form bonus
        const morale = p.morale ?? 70;
        if (morale >= 80) formBonus += 0.3;
        else if (morale <= 35) formBonus -= 0.3;
      }

      // V4 Phase E: Training & Coach growth effects (user club only)
      let focusBonus = { pace: 0, shoot: 0, pass: 0, dribble: 0, defend: 0, physical: 0 };
      if (club.id === career.clubId && career.focusStats) {
        const totalWks = totalRounds(career); // 18 weeks
        // 1. Attack focus: affects shoot & dribble
        const attFraction = (career.focusStats.Attack || 0) / totalWks;
        const attCoachAmp = 1.0 + (career.coachStats?.Attacking || 0) / totalWks;
        focusBonus.shoot += attFraction * 2.0 * attCoachAmp;
        focusBonus.dribble += attFraction * 2.0 * attCoachAmp;

        // 2. Defense focus: affects defend & physical
        const defFraction = (career.focusStats.Defense || 0) / totalWks;
        const defCoachAmp = 1.0 + (career.coachStats?.Defending || 0) / totalWks;
        focusBonus.defend += defFraction * 2.0 * defCoachAmp;
        focusBonus.physical += defFraction * 2.0 * defCoachAmp;

        // 3. Fitness focus: affects pace & physical
        const fitFraction = (career.focusStats.Fitness || 0) / totalWks;
        const fitCoachAmp = 1.0 + (career.coachStats?.Fitness || 0) / totalWks;
        focusBonus.pace += fitFraction * 2.0 * fitCoachAmp;
        focusBonus.physical += fitFraction * 2.0 * fitCoachAmp;

        // 4. Youth focus: boosts growth rate of all attributes for young players
        if (p.age < 22) {
          const youthFraction = (career.focusStats.Youth || 0) / totalWks;
          for (const k of Object.keys(focusBonus)) {
            focusBonus[k] += youthFraction * 2.0;
          }
        }
      }

      const d = dev[p.id]?.d || { pace: 0, shoot: 0, pass: 0, dribble: 0, defend: 0, physical: 0 };
      const baseD = { ...d };

      // Calculate base progression (without training focus/coaches)
      const baseP = { pos: p.pos };
      for (const k of Object.keys(d)) {
        const deltaBase = Math.round(growth + formBonus + (rng() * 2 - 1) * 1.2);
        baseP[k] = clamp(p[k] - (baseD[k] || 0) + (baseD[k] || 0) + deltaBase, 40, 99);
      }
      const baseOverall = overallOf(baseP);

      // Calculate actual progression (with training focus/coaches)
      for (const k of Object.keys(d)) {
        const fBonus = focusBonus[k] || 0;
        const delta = Math.round(growth + formBonus + fBonus + (rng() * 2 - 1) * 1.2);
        d[k] = clamp(d[k] + delta, -20, 25);
        p[k] = clamp(p[k] + delta, 40, 99);
      }
      p.overall = overallOf(p);

      // Cap training focus growth to +2 overall rating points relative to base
      if (p.overall - baseOverall > 2) {
        const excess = p.overall - baseOverall - 2;
        for (const k of Object.keys(d)) {
          const deltaFocus = d[k] - baseD[k];
          if (deltaFocus > 0) {
            const reduce = Math.min(deltaFocus, Math.round(excess));
            d[k] -= reduce;
            p[k] = clamp(p[k] - reduce, 40, 99);
          }
        }
        p.overall = overallOf(p);
      }

      p.age++;
      p.wage = wageOf(p);
      p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
      dev[p.id] = { age: p.age, d };
    }
  }

  // ---- Build next season career ----
  // Cup seeds: full 20-club ranking (both divisions merged by points) for giant-killing seeding.
  const allRows = [...d1table, ...d2table].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  const cupSeeds = allRows.map(r => r.id);

  const next = newCareer(career.clubId, career.season + 1, history, nextDiv1, nextDiv2);
  if (isSacked) {
    next.clubId = null;
    next.sackedRestart = true;
    next.board = null;
  } else {
    // Generate new objectives for the next season, resetting confidence to 60 or keeping ending confidence.
    // Let's keep the ending confidence to carry over the manager's reputation.
    if (next.board) {
      next.board.confidence = career.board ? career.board.confidence : 60;
    }
  }

  next.playerDev = dev;
  next.finance = { ...fin, lastIncome: 0, lastWages: 0, log: [] };
  next.transfers = career.transfers || [];
  next.ytSeq = career.ytSeq || 1;
  next.cupSeeds = cupSeeds;
  next.trainingFocus = career.trainingFocus || 'Youth';
  next.coaches = { ...(career.coaches || { Attacking: false, Defending: false, Fitness: false }) };
  next.market = career.market
    ? { window: null, listings: [], myListings: [], news: career.market.news }
    : null;

  return { summary, next };
}


/**
 * Budget rule: negative balance at season end forces the sale of the
 * highest-value non-GK player. Squad backfilled with a youth player.
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

/* ============================================================
   Board fund requests (L1b)
   ============================================================ */

/**
 * canRequestFunds: true if enough matchdays have passed since last request.
 * Max 3 requests per season; cooldown = 4 matchdays between requests.
 */
export function canRequestFunds(career) {
  const br = career.boardRequest || { lastWeek: 0, cooldown: 4 };
  const seasonRequestCount = br.seasonCount ?? 0;
  if (seasonRequestCount >= 3) return false;           // cap per season
  return (career.week - br.lastWeek) >= (br.cooldown || 4);
}

/**
 * requestBoardFunds: grant coins if the proposal is approved.
 * Higher amount = lower probability.
 * Returns { approved: boolean, chance: number, roll: number } or null if blocked.
 */
export function requestBoardFunds(career, amount) {
  if (!canRequestFunds(career)) return null;

  // Probability by amount
  let chance = 50;
  if (amount <= 500) chance = 95;
  else if (amount <= 1000) chance = 80;
  else if (amount <= 2000) chance = 60;
  else chance = 35;

  // Boost chance based on league standing: top 3 gets +10%, bottom 2 gets -15%
  const pos = leaguePosition(career);
  if (pos <= 3) chance = Math.min(99, chance + 10);
  else if (pos >= 9) chance = Math.max(5, chance - 15);

  const rng = makeRng(0xb0a1d + career.season * 97 + career.week * 13 + amount);
  const roll = Math.floor(rng() * 100) + 1;

  if (!career.boardRequest) career.boardRequest = { lastWeek: 0, cooldown: 4 };
  career.boardRequest.lastWeek = career.week;
  career.boardRequest.seasonCount = (career.boardRequest.seasonCount ?? 0) + 1;

  const approved = roll <= chance;
  if (approved) {
    const fin = career.finance || initFinance(CLUBS[career.clubId].rating);
    fin.balance += amount;
  }

  return { approved, chance, roll };
}

/**
 * Historical stats back-filler. Runs during save migration to reconstruct
 * realistic apps/goals/assists for already-played matches.
 */
export function backfillHistoricalStats(career) {
  // Reset all squad season stats first to prevent double-counting
  for (const club of CLUBS) {
    for (const p of club.squad) {
      p.season = { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] };
    }
  }

  // Seeded RNG
  const rng = makeRng(0xbac1f111 + career.season * 31);

  // 1. Replay user division league matches already played
  for (let w = 0; w < career.week - 1; w++) {
    if (w >= career.rounds.length) break;
    const round = career.rounds[w];
    for (const f of round) {
      if (!f.played) continue;
      const isUser = f.home === career.clubId || f.away === career.clubId;
      const oppId = isUser ? (f.home === career.clubId ? f.away : f.home) : null;
      if (isUser) {
        // Opponent stats. (User stats are backfilled by loading their saved stats, but let's attribute opponent).
        const oppGoals = f.home === career.clubId ? f.as : f.hs;
        attributeSimClubStats(oppId, oppGoals, rng);
      } else {
        attributeSimClubStats(f.home, f.hs, rng);
        attributeSimClubStats(f.away, f.as, rng);
      }
    }
  }

  // 2. Replay cup ties already played
  if (career.cup && Array.isArray(career.cup.rounds)) {
    for (const r of career.cup.rounds) {
      for (const t of r.ties) {
        if (!t.played) continue;
        const isUser = t.home === career.clubId || t.away === career.clubId;
        const oppId = isUser ? (t.home === career.clubId ? t.away : t.home) : null;
        if (isUser) {
          const oppGoals = t.home === career.clubId ? t.as : t.hs;
          attributeSimClubStats(oppId, oppGoals, rng);
        } else {
          attributeSimClubStats(t.home, t.hs, rng);
          attributeSimClubStats(t.away, t.as, rng);
        }
      }
    }
  }

  // Sync to career.seasonStats immediately so it saves
  syncSeasonStats(career);
}

/**
 * Attributes stats for simulated cup matches.
 */
export function attributeCupTieStats(career, t, isManual) {
  const cup = ensureCup(career);
  const rng = makeRng(0xc0b + (Number(career.season) || 1) * 733 + cup.round * 97);
  const isUser = t.home === career.clubId || t.away === career.clubId;
  const oppId  = isUser ? (t.home === career.clubId ? t.away : t.home) : null;
  if (isUser) {
    if (!isManual) {
      attributeSimGoals(career, rng, t);
      const oppGoals = t.home === career.clubId ? t.as : t.hs;
      attributeSimClubStats(oppId, oppGoals, rng);
    }
  } else {
    attributeSimClubStats(t.home, t.hs, rng);
    attributeSimClubStats(t.away, t.as, rng);
  }
}

