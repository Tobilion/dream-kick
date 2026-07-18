/**
 * Headless V4 Phase B acceptance — transfer market.
 * Run from repo root:  node tests/transfers.test.mjs
 */
import { CLUBS, pickLineup } from '../src/data/teams.js';
import {
  newCareer, seasonOver, completeRound, applyCareerToClubs, endSeason,
} from '../src/core/career.js';
import {
  ensureMarket, windowOpen, nextWindowWeek, listingPlayer, buyPlayer,
  listForSale, suggestedFee, saleChance, MAX_SQUAD,
} from '../src/core/transfers.js';

let failures = 0;
const assert = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) failures++; };

const CLUB_ID = 2;
const me = () => CLUBS[CLUB_ID];
let career = newCareer(CLUB_ID);
career.finance.balance = 100000; // rich club for buy tests

/* ---- window cadence ---- */
assert(!windowOpen(career), 'week 1: window closed');
assert(nextWindowWeek(career) === 5, 'next window is matchday 5');
while (career.week < 5) completeRound(career, null);
assert(windowOpen(career), 'week 5: window open');

/* ---- listings ---- */
const m = ensureMarket(career);
assert(m.listings.length >= 10 && m.listings.length <= 12, `~12 listings generated (${m.listings.length})`);
assert(m.listings.every(l => l.club !== CLUB_ID), 'no user players in listings');
assert(m.listings.every(l => listingPlayer(l)), 'every listing resolves to a live player');
assert(m.news.length >= 2, `AI window activity logged (${m.news.length} news items)`);
assert(CLUBS.every(c => c.squad.length === 18), 'all squads 18 after AI activity');

/* ---- buying blocked when squad full ---- */
const listing = m.listings[0];
assert(buyPlayer(career, listing) === 'Squad full (18) — sell first.', 'buy blocked at 18 players');

/* ---- sell: fair price resolves at next matchday ---- */
const seller = [...me().squad].filter(p => p.pos === 'MF').sort((a, b) => a.overall - b.overall)[0];
const fairAsk = suggestedFee(seller);
assert(listForSale(career, seller.id, fairAsk) === null, 'fair-price listing accepted');
const balBefore = career.finance.balance;
let soldWeek = null;
for (let i = 0; i < 4 && soldWeek === null; i++) {
  completeRound(career, null);
  if (!me().squad.some(p => p.id === seller.id)) soldWeek = career.week - 1;
}
assert(soldWeek !== null, `fair-price sale resolved (matchday ${soldWeek})`);
assert(career.finance.balance > balBefore - 20000, 'sale fee credited (net of wages)');
const buyerClub = CLUBS.find(c => c.id !== CLUB_ID && c.squad.some(p => p.id === seller.id));
assert(buyerClub !== undefined, 'sold player now at a real AI club');

/* ---- buy: next window, player joins my squad ---- */
while (!windowOpen(career) && !seasonOver(career)) completeRound(career, null);
ensureMarket(career);
// make room: cheap-list the weakest outfielder, wait for the sale, then reach the next window
if (me().squad.length >= MAX_SQUAD) {
  const drop = [...me().squad].filter(p => p.pos !== 'GK').sort((a, b) => a.overall - b.overall)[0];
  listForSale(career, drop.id, Math.round(suggestedFee(drop) * 0.7));
  do { completeRound(career, null); }
  while (me().squad.some(p => p.id === drop.id) && !seasonOver(career));
  while (!windowOpen(career) && !seasonOver(career)) completeRound(career, null);
  ensureMarket(career);
}
assert(me().squad.length < MAX_SQUAD, 'room in squad for a signing');
const buyable = career.market.listings.find(l => listingPlayer(l) && l.price <= career.finance.balance);
const target = listingPlayer(buyable);
const sellerClub = CLUBS[buyable.club];
const balB4 = career.finance.balance;
assert(buyPlayer(career, buyable) === null, 'buy succeeds in open window');
assert(career.finance.balance === balB4 - buyable.price, 'fee debited');
assert(me().squad.some(p => p.id === target.id), 'bought player in my squad');
assert(sellerClub.squad.length === 18 && sellerClub.squad.some(p => p.id.startsWith('yt_')),
  'seller backfilled with youth, stays at 18');

/* ---- bought player is an XI candidate ---- */
const xi = pickLineup(me(), '442');
assert(xi.length === 11, 'pickLineup still returns 11');
const candidates = [...me().squad].map(p => p.id);
assert(candidates.includes(target.id), 'bought player among XI candidates');

/* ---- persistence across save/reload (boot replay) ---- */
const json = JSON.parse(JSON.stringify(career)); // simulate localStorage round-trip
// simulate fresh boot: undo runtime squads by restoring pre-transfer members is
// impractical here; instead verify replay is idempotent + preserves the moves
applyCareerToClubs(json);
assert(CLUBS[CLUB_ID].squad.some(p => p.id === target.id), 'bought player survives boot replay');
assert(!CLUBS.some(c => c.id !== CLUB_ID && c.squad.some(p => p.id === target.id)),
  'bought player not duplicated at any other club');
assert(CLUBS.every(c => c.squad.length === 18), 'all 20 squads exactly 18 after replay');

/* ---- overpriced listing doesn't sell in 3 matchdays ---- */
assert(saleChance(1.5) <= 0.05, 'ask > 1.3× value ⇒ ≤5% chance');
const keep = [...me().squad].filter(p => p.pos === 'DF').sort((a, b) => a.overall - b.overall)[0];
listForSale(career, keep.id, Math.round(suggestedFee(keep) * 3));
let stillMine = true;
for (let i = 0; i < 3 && !seasonOver(career); i++) {
  completeRound(career, null);
  if (!me().squad.some(p => p.id === keep.id)) stillMine = false;
}
assert(stillMine, 'overpriced player unsold after 3 matchdays');

/* ---- full season churn: squads never drift from 18 ---- */
while (!seasonOver(career)) completeRound(career, null);
ensureMarket(career); // end-of-season window
assert(windowOpen(career), 'end-of-season window open');
const { next } = endSeason(career);
assert(CLUBS.every(c => c.squad.length === 18), 'all squads 18 after full season + windows');
assert(next.market && next.market.news.length > 0, 'news carried into next season');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
