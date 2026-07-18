# Dream Kick — V4 Prompt: Club Economy, Transfers, Cup & Divisions

Read `CLAUDE.md` first. V2 (match experience) and V3 (match-logic fixes, AI, player model, career season) are DONE. This prompt turns the single-season career into a living club game: money, transfers, a cup, promotion/relegation, and training — the "Future ideas" list in `FEATURES.md`, built in dependency order. Dream League Soccer remains the feel reference: light, fast, mobile-friendly management — NOT Football Manager.

Two sibling repos you MUST read before coding (list which files you read and what you're reusing before writing any code):

- `../football-tournament-betting-simulator` — `src/engine/transferEngine.ts` (listing generation, valuation, AI clubs buying/selling), `src/utils/careerUtils.ts` (career records), `src/components/TransferMarket.tsx` (market UI shape).
- `../Sportsim-pro` — `src/features/finances/` (engine.ts + types: wage bills, sponsor income, balance projection), `src/features/transfer-market/`, `src/engine/weeklyDevelopment.ts` (coach specialty multipliers — already partially used in V3 progression), `src/services/training*` if present.

Existing V3 foundations to build on (do not reinvent): `core/career.js` (round-robin season, `completeRound`, `endSeason`, `playerDev` persistence, `CAREER_VERSION`), player schema with `marketValue`/`age`/`season` stats (`data/teams.js`), dossier modal (`ui/playerCard.js`), headless test pattern (`tests/*.test.mjs`, engine modules are DOM-free).

Work the phases in order. After each phase: run the headless tests (new + all regressions), bump the `sw.js` CACHE name, update `CLAUDE.md` (replace stale info), then STOP and report before the next phase.

---

## Phase A — Club economy foundation

New DOM-free module `core/finance.js`, persisted inside `save.career` (bump `CAREER_VERSION` to 4 with migration that grants a sensible starting balance based on club rating).

1. **Balance & income:** club balance in coins. Income per completed fixture: base gate receipts scaled by club rating + result bonus (W > D > L) + a flat weekly sponsor payment. Prize money at season end by final position (winner ≫ mid-table).
2. **Wages:** each player gets a wage derived from `overall` + `age` (add `wage` to the player schema next to `marketValue`). Total wage bill deducted every matchday in `completeRound`.
3. **Budget rules:** balance can go negative only transiently; if negative at season end, forced sale of the highest-value non-GK player (with a news-style toast). No loans/interest — keep it DLS-simple.
4. **UI:** career dashboard gains a FINANCES panel: balance, weekly wage bill, last matchday income, season projection. Plain rows, existing panel styling.

**Acceptance (tests/finance.test.mjs):** simulate a full season headless; balance changes every matchday by (income − wages); prize money lands at `endSeason`; migration from a CAREER_VERSION=3 save yields a valid balance; forced-sale rule triggers in a contrived negative-balance season.

## Phase B — Transfer market

New DOM-free module `core/transfers.js` (patterns from betting-sim `transferEngine.ts`), UI modal from the career dashboard.

1. **Window:** market open between seasons and every 5th matchday (transfer "windows" DLS-style). Outside windows the UI shows the market read-only.
2. **Listings:** each window, generate a seeded list of ~12 players from other clubs (mix of positions/ages/ratings), priced from `marketValue` ± demand noise. Buying: pay fee, player moves into your squad (max 18 → must sell first if full), seller club's squad backfills with a regenerated youth player so squads never shrink.
3. **Selling:** list any of your players; sale resolves at next matchday with probability by price vs value (ask > 1.3× value rarely sells). Fee credited to balance.
4. **AI activity:** 2–3 seeded AI-club transfers per window (log them in a small "transfer news" feed) so the league feels alive. AI clubs may also bid for your listed players.
5. **Engine integration:** bought players play in matches immediately (squad → `pickLineup`); sold players are gone. `playerDev`/season-stats persistence must follow the player's `id` across clubs.

**Acceptance (tests/transfers.test.mjs):** buy a player headless → appears in next match's XI candidates and persists across save/reload; sell at fair price → fee lands; overpriced listing doesn't sell in 3 matchdays; squad sizes for all 20 clubs remain 18 after any number of windows; Quick Match unaffected.

## Phase C — Cup competition

Extend `core/career.js` (or new `core/cup.js`) with a knockout cup running alongside the league, DLS Diamond-Cup-style.

1. **Format:** 20 clubs → 4 byes decided by last season's table (season 1: rating), 16 play a first round; then R16→QF→SF→Final. Cup rounds are interleaved into the season calendar every ~4 matchdays (extend the fixture list; `userFixture` must return whichever competition's fixture is next).
2. **Rules:** knockout with no replays; draws go straight to a seeded penalty shootout (quick-sim; if the user plays the match, sim the shootout after full-time and show the result on the FT screen).
3. **User plays or sims** cup fixtures exactly like league ones; AI ties quick-simmed. Cup winner gets prize money (Phase A) and a trophy entry in `career.history`.
4. **UI:** a CUP panel on the dashboard: bracket-ish list of current-round ties + your next tie; champion shown in the season summary.

**Acceptance (tests/cup.test.mjs):** full season headless produces exactly one cup champion; the user's elimination stops their cup fixtures but league continues; a drawn user tie resolves via shootout; calendar never double-books a matchday; season summary includes cup result.

## Phase D — Two divisions with promotion & relegation

1. **Structure:** split the 20 clubs into Division 1 and Division 2 (top 10 by rating at career start). League season becomes 18 rounds (9 opponents × 2, home & away — adjust `buildRounds` for a double round-robin of 10).
2. **Season end:** bottom 2 of Div 1 swap with top 2 of Div 2. The user follows their club. Division shown on dashboard + summary; prize money scales by division.
3. **Cup stays cross-division** (all 20 clubs) — giant-killing is the fun.
4. **Migration:** CAREER_VERSION 5; existing careers map to the correct division by current table position (top 10 → Div 1).

**Acceptance (tests/divisions.test.mjs):** two 10-club tables, 18 fixtures each, correct swap at season end across 3 consecutive headless seasons; user club followed through relegation and promotion; cup still includes all 20.

## Phase E — Training & coaches (light)

1. **Training focus:** user picks ONE focus per week from the dashboard (Attack / Defense / Fitness / Youth). Focus adds a small bonus to the relevant attributes in the next `endSeason` progression AND a tiny in-season form nudge (cap it — no stat treadmill).
2. **Coaches:** 3 hireable coach slots (Attacking / Defending / Fitness), costing wages (Phase A), each amplifying the matching focus using the specialty-multiplier idea from `weeklyDevelopment.ts`. Hire/fire from a simple dashboard modal.
3. Keep numbers conservative: total training effect ≤ ±2 rating points per season per player.

**Acceptance (tests/training.test.mjs):** identical seeded seasons with and without an Attacking coach + Attack focus show higher (but capped) shooting/dribbling growth; coach wages hit the balance; firing a coach stops both the wage and the bonus.

---

## Rules (enforce throughout)

- Keep the stack: vanilla ES modules, no npm/no build, Three.js vendored, zero external assets. Files under ~400 lines; game logic in DOM-free modules under `src/core`/`src/engine` so every phase is headless-testable; UI reads from those modules.
- Every save-shape change bumps `CAREER_VERSION` with a migration — never corrupt an existing career. Quick Match must keep working unchanged after every phase.
- All new randomness through seeded rngs (`makeRng`) — headless tests must be reproducible.
- Reuse the existing UI language: panels, section-tags, rowcards, dossier, rating chips, z-order contract (documented in CLAUDE.md).
- Bump `sw.js` CACHE + add any new files to its ASSETS list each phase; note the hard-refresh requirement when reporting.
- One phase at a time: verify acceptance headless, update CLAUDE.md, report, wait for go-ahead.
