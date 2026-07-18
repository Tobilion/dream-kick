/**
 * transfers.js — V4 Phase B: transfer market (DOM-free).
 * Patterns from betting-sim src/engine/transferEngine.ts: position-quota
 * balanced listings, price = value × demand noise, players always move to
 * REAL clubs (never deleted silently). DLS-simple: fixed-price buys, seeded
 * probability sells — no auctions. All state in career.market; squad moves
 * recorded in career.transfers (replayed at boot by applyCareerToClubs).
 */
import { CLUBS, valueOf, wageOf, makeYouthPlayer } from '../data/teams.js';
import { makeRng, clamp, irand } from './math.js';
import { saleFee } from './finance.js';

export const MAX_SQUAD = 18;
const QUOTA = { GK: 1, DF: 4, MF: 4, FW: 3 };   // ~12 listings/window
const DEV_KEYS = ['pace', 'shoot', 'pass', 'dribble', 'defend', 'physical'];

/* ---------------- window cadence ---------------- */

/** Open between seasons and every 5th matchday (weeks 5, 10, 15). */
export function windowOpen(career) {
  return career.week > career.rounds.length || career.week % 5 === 0;
}

export function nextWindowWeek(career) {
  if (windowOpen(career)) return career.week;
  const w = Math.ceil(career.week / 5) * 5;
  return w <= career.rounds.length ? w : null; // null ⇒ next window is end of season
}

function windowKey(career) {
  return career.week > career.rounds.length
    ? `s${career.season}e` : `s${career.season}w${career.week}`;
}

/* ---------------- market state & listings ---------------- */

export function ensureMarket(career) {
  if (!career.market) career.market = { window: null, listings: [], myListings: [], news: [] };
  if (windowOpen(career) && career.market.window !== windowKey(career)) openWindow(career);
  return career.market;
}

function marketRng(career, salt = 0) {
  return makeRng(0x7a4f + career.season * 7907 + career.week * 419 + salt);
}

/** Regenerate seeded listings + 2–3 AI transfers for a newly open window. */
function openWindow(career) {
  const m = career.market;
  m.window = windowKey(career);
  const rng = marketRng(career);
  m.listings = [];
  for (const [pos, n] of Object.entries(QUOTA)) {
    const pool = [];
    for (const club of CLUBS) {
      if (club.id === career.clubId) continue;
      for (const p of club.squad) if (p.pos === pos) pool.push({ p, club: club.id });
    }
    for (let k = 0; k < n && pool.length; k++) {
      const pick = pool.splice(irand(rng, 0, pool.length - 1), 1)[0];
      m.listings.push({
        playerId: pick.p.id, club: pick.club,
        price: Math.max(200, Math.round(saleFee(pick.p.marketValue) * (0.85 + rng() * 0.4) / 10) * 10),
      });
    }
  }
  aiWindowActivity(career, rng);
}

export function listingPlayer(l) {
  return CLUBS[l.club].squad.find(p => p.id === l.playerId) || null;
}

/* ---------------- squad-move bookkeeping ---------------- */

/**
 * Snapshot a player WITHOUT his dev deltas. applyCareerToClubs replays
 * transfers FIRST and applies playerDev deltas AFTER — storing the live
 * (dev-applied) attrs would double-apply them on reload.
 */
function baseSnapshot(career, p) {
  const s = JSON.parse(JSON.stringify(p));
  const dev = career.playerDev?.[p.id];
  if (dev) for (const k of DEV_KEYS) s[k] = clamp(s[k] - (dev.d[k] || 0), 40, 99);
  return s;
}

function recordMove(career, clubId, outId, inPlayer) {
  career.transfers = [...(career.transfers || []), { club: clubId, outId, inPlayer }];
}

function news(career, text) {
  const m = ensureMarketRaw(career);
  m.news.unshift({ season: career.season, week: Math.min(career.week, career.rounds.length), text });
  if (m.news.length > 10) m.news.pop();
}

function ensureMarketRaw(career) {
  if (!career.market) career.market = { window: null, listings: [], myListings: [], news: [] };
  return career.market;
}

function backfillYouth(career, club, pos, num) {
  const rng = makeRng(0xbeef + career.season * 331 + (career.ytSeq || 1) * 17);
  const y = makeYouthPlayer(rng, club.region, pos, `yt_s${career.season}_${career.ytSeq || 1}`);
  career.ytSeq = (career.ytSeq || 1) + 1;
  y.num = num;
  return y;
}

/** Move a player into an AI club, replacing its weakest same-pos player. */
function placeAtAIClub(career, buyerClub, player) {
  const samePos = buyerClub.squad.filter(p => p.pos === player.pos);
  const weakest = [...samePos].sort((a, b) => a.overall - b.overall)[0];
  const i = buyerClub.squad.indexOf(weakest);
  player.num = weakest.num;
  buyerClub.squad.splice(i, 1, player);
  recordMove(career, buyerClub.id, weakest.id, baseSnapshot(career, player));
}

/* ---------------- buying ---------------- */

/** Returns null on success, or an error string. */
export function buyPlayer(career, listing) {
  const m = ensureMarket(career);
  if (!windowOpen(career)) return 'Transfer window closed.';
  const me = CLUBS[career.clubId];
  if (me.squad.length >= MAX_SQUAD) return 'Squad full (18) — sell first.';
  if (career.finance.balance < listing.price) return 'Not enough funds.';
  const seller = CLUBS[listing.club];
  const i = seller.squad.findIndex(p => p.id === listing.playerId);
  if (i < 0) return 'Player no longer available.';
  const player = seller.squad[i];

  career.finance.balance -= listing.price;
  const youth = backfillYouth(career, seller, player.pos, player.num);
  seller.squad.splice(i, 1, youth);                       // seller never shrinks
  me.squad.push(player);
  recordMove(career, seller.id, player.id, youth);
  recordMove(career, me.id, null, baseSnapshot(career, player)); // in-only append
  m.listings = m.listings.filter(l => l !== listing);
  news(career, `You signed ${player.name} from ${seller.name} for ${listing.price}.`);
  return null;
}

/* ---------------- selling ---------------- */

export function listForSale(career, playerId, ask) {
  const m = ensureMarketRaw(career);
  if (m.myListings.some(l => l.playerId === playerId)) return 'Already listed.';
  if (CLUBS[career.clubId].squad.length <= 14) return 'Squad too small to sell.';
  m.myListings.push({ playerId, ask: Math.round(ask), tries: 0 });
  return null;
}

export function unlist(career, playerId) {
  const m = ensureMarketRaw(career);
  m.myListings = m.myListings.filter(l => l.playerId !== playerId);
}

export function suggestedFee(p) { return saleFee(p.marketValue); }

/** Sale probability from ask/value ratio (ask > 1.3× value rarely sells). */
export function saleChance(ratio) {
  return ratio <= 0.8 ? 0.95 : ratio <= 1.0 ? 0.8 : ratio <= 1.15 ? 0.5 : ratio <= 1.3 ? 0.25 : 0.05;
}

/** Resolve my listings at a matchday. Returns array of sale events. */
function resolveSales(career, rng) {
  const m = ensureMarketRaw(career);
  const me = CLUBS[career.clubId];
  const sold = [];
  for (const l of [...m.myListings]) {
    const i = me.squad.findIndex(p => p.id === l.playerId);
    if (i < 0) { unlist(career, l.playerId); continue; }
    const p = me.squad[i];
    l.tries++;
    const ratio = l.ask / Math.max(1, suggestedFee(p));
    if (rng() < saleChance(ratio)) {
      const buyers = CLUBS.filter(c => c.id !== career.clubId);
      const buyer = buyers[irand(rng, 0, buyers.length - 1)];
      me.squad.splice(i, 1);
      recordMove(career, me.id, p.id, null);              // out-only removal
      placeAtAIClub(career, buyer, p);
      career.finance.balance += l.ask;
      unlist(career, l.playerId);
      news(career, `${p.name} sold to ${buyer.name} for ${l.ask}.`);
      sold.push({ player: p.name, fee: l.ask, to: buyer.name });
    }
  }
  return sold;
}

/* ---------------- AI league activity ---------------- */

function aiWindowActivity(career, rng) {
  const n = irand(rng, 2, 3);
  for (let k = 0; k < n; k++) {
    const ai = CLUBS.filter(c => c.id !== career.clubId);
    const from = ai[irand(rng, 0, ai.length - 1)];
    const others = ai.filter(c => c.id !== from.id);
    const to = others[irand(rng, 0, others.length - 1)];
    const movers = from.squad.filter(p => p.pos !== 'GK');
    const player = movers[irand(rng, 0, movers.length - 1)];
    const fee = Math.round(saleFee(player.marketValue) * (0.9 + rng() * 0.3) / 10) * 10;
    const i = from.squad.indexOf(player);
    const youth = backfillYouth(career, from, player.pos, player.num);
    from.squad.splice(i, 1, youth);
    recordMove(career, from.id, player.id, youth);
    placeAtAIClub(career, to, player);
    news(career, `${player.name}: ${from.name} → ${to.name} (${fee}).`);
  }
}

/* ---------------- matchday hook (called from completeRound) ---------------- */

export function marketTick(career) {
  const m = ensureMarketRaw(career);
  const rng = marketRng(career, 0x51);
  const sold = resolveSales(career, rng);
  // season over with a hole in the squad → academy promotion back to 18
  // (mid-season holes stay open so the user can buy at the next window)
  if (career.week > career.rounds.length) {
    const me = CLUBS[career.clubId];
    while (me.squad.length < MAX_SQUAD) {
      const pos = me.squad.filter(p => p.pos === 'FW').length < 3 ? 'FW'
        : me.squad.filter(p => p.pos === 'MF').length < 5 ? 'MF' : 'DF';
      const y = backfillYouth(career, me, pos, 19 + me.squad.length);
      me.squad.push(y);
      recordMove(career, me.id, null, y);
      news(career, `Academy: ${y.name} promoted to the first team.`);
    }
  }
  return sold;
}
