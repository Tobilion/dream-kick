/**
 * teams.js — 20 clubs with kits, ratings and procedurally generated 18-man squads.
 * Squads are deterministic (seeded) so a club always has the same players.
 */
import { makeRng, irand, clamp } from '../core/math.js';
import { buildName } from './names.js';

/** [name, code, region, rating, homePrimary, homeSecondary, awayPrimary, awaySecondary, badgeStyle] */
const CLUB_DEFS = [
  ['London Reds',      'LRD', 'england',      86, '#d3122e', '#ffffff', '#f2f2f2', '#d3122e', 0],
  ['Manchester Blues', 'MCB', 'england',      88, '#5cb3ff', '#ffffff', '#1b1b30', '#5cb3ff', 1],
  ['Mersey FC',        'MSY', 'england',      87, '#c8102e', '#f6eb61', '#0b3d2e', '#ffffff', 2],
  ['North London',     'NLD', 'england',      85, '#ef0107', '#ffffff', '#0a0a0a', '#ffd700', 3],
  ['Madrid Blancos',   'MDB', 'spain',        89, '#ffffff', '#febe10', '#2d2a6e', '#ffffff', 4],
  ['Catalunya FC',     'CAT', 'spain',        87, '#a50044', '#004d98', '#f5e04a', '#a50044', 0],
  ['Sevilla Rojo',     'SVR', 'spain',        80, '#f43333', '#ffffff', '#0f0f0f', '#f43333', 1],
  ['Bavaria Munchen',  'BAV', 'germany',      88, '#dc052d', '#ffffff', '#1a1a2e', '#e8e8e8', 2],
  ['Ruhr Gelb',        'RGB', 'germany',      83, '#fde100', '#0a0a0a', '#0a0a0a', '#fde100', 3],
  ['Paris Etoile',     'PSE', 'france',       87, '#004170', '#da291c', '#ffffff', '#004170', 4],
  ['Marseille Bleu',   'MRB', 'france',       79, '#e8f4ff', '#009add', '#009add', '#ffffff', 0],
  ['Milano Rossoneri', 'MRN', 'italy',        84, '#fb090b', '#0a0a0a', '#ffffff', '#fb090b', 1],
  ['Torino Bianco',    'TRB', 'italy',        85, '#f8f8f8', '#0a0a0a', '#2c2c54', '#f8f8f8', 2],
  ['Napoli Azzurro',   'NAP', 'italy',        83, '#12a0d7', '#ffffff', '#12233d', '#12a0d7', 3],
  ['Rio Ouro',         'RIO', 'brazil',       82, '#fedf00', '#009c3b', '#009c3b', '#fedf00', 4],
  ['Santos Praia',     'SNT', 'brazil',       78, '#ffffff', '#0a0a0a', '#0a0a0a', '#ffffff', 0],
  ['Buenos Celeste',   'BAC', 'southamerica', 82, '#75aadb', '#ffffff', '#22223a', '#75aadb', 1],
  ['Cairo Eagles',     'CAI', 'africa',       77, '#c40c2e', '#ffffff', '#f0f0f0', '#c40c2e', 2],
  ['Lagos Thunder',    'LGT', 'africa',       76, '#008751', '#ffffff', '#ffffff', '#008751', 3],
  ['Dakar Lions',      'DKL', 'africa',       75, '#00853f', '#fdef42', '#fdef42', '#00853f', 4],
];

/** positions per squad: index → role */
const SQUAD_SHAPE = ['GK', 'GK', 'DF', 'DF', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW', 'FW'];

function statFor(rng, base, primary) {
  // primary stats sit near club rating; secondary stats a bit below
  const spread = primary ? 6 : 14;
  return clamp(Math.round(base - (primary ? 0 : 6) + (rng() * 2 - 1) * spread), 42, 96);
}

let _playerSeq = 1;

/**
 * Player schema (V3 Phase C — modeled on Sportsim-pro types/player.ts, kept
 * as a plain object). Attribute six-pack: pace, shoot(ing), pass(ing),
 * dribble/dribbling, defend(ing), physical. `season` accumulates across
 * matches; `form` = last-5 match-ratings average (0 until played).
 */
function makePlayer(rng, region, used, pos, num, rating) {
  const p = {
    id: `pl_${_playerSeq++}`,
    name: buildName(rng, region, used),
    pos, num,
    age: irand(rng, 18, 34),
    pace: statFor(rng, rating, pos === 'FW'),
    shoot: statFor(rng, rating, pos === 'FW'),
    pass: statFor(rng, rating, pos === 'MF'),
    dribble: statFor(rng, rating, pos === 'FW' || pos === 'MF'),
    defend: statFor(rng, rating, pos === 'DF'),
    physical: statFor(rng, rating, pos === 'DF'),
    gk: pos === 'GK' ? statFor(rng, rating, true) : irand(rng, 20, 35),
    skin: irand(rng, 0, 4),
    hair: irand(rng, 0, 5),
    morale: irand(rng, 55, 90),
    season: { apps: 0, goals: 0, assists: 0, tackles: 0, saves: 0, matchRatings: [] },
  };
  if (pos === 'GK') { p.pace = clamp(p.pace - 12, 40, 80); }
  p.overall = overallOf(p);
  p.marketValue = valueOf(p);
  p.wage = wageOf(p);
  return p;
}

/** Market value in €m: overall + youth premium (peaks ~23, tails off past 30). */
export function valueOf(p) {
  const ageFactor = p.age <= 23 ? 1.35 - (23 - p.age) * 0.03 : clamp(1.35 - (p.age - 23) * 0.09, 0.25, 1.35);
  return Math.round(Math.pow(1.11, p.overall - 60) * 2.2 * ageFactor * 10) / 10;
}

/** Weekly wage in coins, from overall + age (V4 Phase A). */
export function wageOf(p) {
  const ageF = p.age <= 23 ? 0.8 : p.age <= 29 ? 1.0 : 1.15;
  return Math.max(40, Math.round(((p.overall - 40) * 4 * ageF) / 5) * 5);
}

/**
 * Regenerated youth player (backfill after a sale so squads never shrink).
 * Pass a unique `id` (e.g. `yt_s2_3`) — runtime ids must not collide with the
 * deterministic boot-time `pl_N` sequence.
 */
export function makeYouthPlayer(rng, region, pos, id) {
  const p = makePlayer(rng, region, new Set(), pos, 19, 62);
  p.age = irand(rng, 17, 19);
  p.overall = overallOf(p);
  p.marketValue = valueOf(p);
  p.wage = wageOf(p);
  if (id) p.id = id;
  return p;
}

/** Form = average of last 5 match ratings (0 if none yet). */
export function playerForm(p) {
  const r = p.season?.matchRatings?.slice(-5) || [];
  return r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : 0;
}

export function overallOf(p) {
  if (p.pos === 'GK') return Math.round(p.gk * 0.75 + p.physical * 0.15 + p.pass * 0.1);
  const w = {
    DF: [0.18, 0.06, 0.16, 0.38, 0.22],
    MF: [0.18, 0.18, 0.36, 0.14, 0.14],
    FW: [0.26, 0.38, 0.16, 0.04, 0.16],
  }[p.pos];
  return Math.round(p.pace * w[0] + p.shoot * w[1] + p.pass * w[2] + p.defend * w[3] + p.physical * w[4]);
}

function buildClub(def, index) {
  const [name, code, region, rating, hp, hs, ap, as, badgeStyle] = def;
  const rng = makeRng(0xd00d + index * 7919);
  const used = new Set();
  const squad = SQUAD_SHAPE.map((pos, i) => makePlayer(rng, region, used, pos, i + 1, rating));
  // shirt numbers: keeper 1, spread the rest
  const nums = [1, 13, 2, 3, 4, 5, 12, 15, 6, 8, 10, 14, 16, 18, 7, 9, 11, 17];
  squad.forEach((p, i) => { p.num = nums[i]; });
  return {
    id: index, name, code, region, rating, badgeStyle,
    kits: { home: [hp, hs], away: [ap, as] },
    squad,
    stars: clamp(Math.round((rating - 68) / 5), 1, 5),
  };
}

export const CLUBS = CLUB_DEFS.map(buildClub);

/**
 * Choose the starting XI for a formation (GK,4 DF,4 MF,2 FW for 4-4-2;
 * GK,4 DF,3 MF,3 FW for 4-3-3), best overall first.
 */
export function pickLineup(club, formation) {
  let want = { GK: 1, DF: 4, MF: 4, FW: 2 };
  if (formation === '433') want = { GK: 1, DF: 4, MF: 3, FW: 3 };
  else if (formation === '4231') want = { GK: 1, DF: 4, MF: 5, FW: 1 };
  else if (formation === '352') want = { GK: 1, DF: 3, MF: 5, FW: 2 };
  else if (formation === '532') want = { GK: 1, DF: 5, MF: 3, FW: 2 };

  const byPos = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of club.squad) byPos[p.pos].push(p);
  for (const k of Object.keys(byPos)) byPos[k].sort((a, b) => b.overall - a.overall);
  const xi = [];
  for (const pos of ['GK', 'DF', 'MF', 'FW']) xi.push(...byPos[pos].slice(0, want[pos]));
  return xi;
}
