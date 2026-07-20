/**
 * finance.js — V4 Phase A: club economy (DOM-free).
 * Modeled on Sportsim-pro src/features/finances (engine.ts + types.ts):
 * matchday gate scaled by club rating + result bonus, flat sponsor payment,
 * weekly wage bill, position-keyed season prize table. Kept DLS-simple:
 * coins (integers), small rolling log instead of a full ledger, no loans.
 * Persisted inside save.career.finance (CAREER_VERSION 4).
 */
import { wageOf } from '../data/teams.js';

/* ---------------- wages ---------------- */

export function wageBill(squad) {
  return squad.reduce((s, p) => s + (p.wage ?? wageOf(p)), 0);
}

/** Weekly wage cost for hired coaches (150 coins each). */
export function activeCoachWages(coaches) {
  if (!coaches) return 0;
  let count = 0;
  if (coaches.Attacking) count++;
  if (coaches.Defending) count++;
  if (coaches.Fitness) count++;
  return count * 150;
}

/* ---------------- balance & income ---------------- */

export function startingBalance(rating) {
  return 5000 + Math.max(0, rating - 68) * 400;
}

export function sponsorPayment(rating) {
  return 500 + Math.max(0, rating - 68) * 20;
}

export function initFinance(rating) {
  return {
    balance: startingBalance(rating),
    sponsor: sponsorPayment(rating),
    lastIncome: 0,
    lastWages: 0,
    log: [],               // rolling [{week, income, wages}] (max 12)
  };
}

/** Income for one completed fixture. result: 'W'|'D'|'L'. */
export function matchdayIncome(rating, isHome, result, sponsor) {
  const gate = Math.round(((rating - 50) * 90 * (isHome ? 1 : 0.45)) / 5) * 5;
  const bonus = result === 'W' ? 800 : result === 'D' ? 300 : 0;
  return gate + bonus + sponsor;
}

/** Apply one matchday: balance += income − wages. Returns the net change. */
export function applyMatchday(fin, { week, rating, isHome, result, wages }) {
  const income = matchdayIncome(rating, isHome, result, fin.sponsor);
  fin.balance += income - wages;
  fin.lastIncome = income;
  fin.lastWages = wages;
  fin.log.push({ week, income, wages });
  if (fin.log.length > 12) fin.log.shift();
  return income - wages;
}

/* ---------------- season prize money ---------------- */

const PRIZES = [20000, 12000, 8000, 5000, 3500, 2500, 2000, 1600, 1300, 1100];

export function seasonPrize(position) {
  return PRIZES[position - 1] ?? Math.max(400, 1100 - (position - 10) * 70);
}

/** Division 2 prizes are 60% of Div 1 equivalents. */
const DIV2_PRIZE_FACTOR = 0.6;

/**
 * Prize money scaled by division (V4 Phase D).
 * @param {number} position  1-based finish position within the division
 * @param {number} division  1 or 2
 */
export function seasonPrizeDivision(position, division) {
  const base = seasonPrize(position);
  return division === 2 ? Math.round(base * DIV2_PRIZE_FACTOR) : base;
}

/* ---------------- projection & sale fee ---------------- */

/** Naive season projection: balance + rounds left × last net matchday. */
export function seasonProjection(fin, roundsLeft, position) {
  const net = fin.lastIncome - fin.lastWages;
  return Math.round(fin.balance + roundsLeft * net + seasonPrize(position));
}

/** Sale fee in coins from marketValue (€m). */
export function saleFee(marketValue) {
  return Math.round(marketValue * 800);
}
