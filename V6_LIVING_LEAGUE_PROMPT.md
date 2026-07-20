# Dream Kick — V6 Prompt: The Living League

Read `CLAUDE.md` first. V2–V5 are done (match experience, AI, player model,
career, economy, transfers, hub-tile UI). **V4 phases C (cup), D (divisions)
and E (training/coaches) run BEFORE this prompt** unless the user reorders.
V6 makes the league feel inhabited: stat races, a board watching you, morale,
fatigue/injuries, scouting — and finally fouls. DLS-light throughout: one
number where FM would use ten.

Sibling references you MUST read before each phase (list what you read):

- `../Sportsim-pro/src/features/board-objectives/` — engine.ts
  (`generateSeasonObjectives`, `refreshObjectiveProgress`,
  `evalObjectivesForConfidence`, `adjustConfidence`) + types.ts
  (`CONFIDENCE_THRESHOLDS`, label/color helpers). Port the SHAPE, simplify
  the numbers.
- `../football-tournament-betting-simulator/src/types.ts` — `injured`,
  `injuryRecoveryMatches`, `injuredRounds` fields; `transferEngine.ts`
  `moraleFactor` (morale → value multiplier).
- `../Sportsim-pro` STATS screens (leaderboards across all clubs) and SCOUT
  tab for UI shape — reuse dream-kick's hub.js primitives, not their React.

Existing foundations (do not reinvent): seeded `quickSim` +
`attributeSimGoals` in `core/career.js`; `p.morale` already in the player
schema (currently UNUSED); per-match `entity.matchStats` + `engine/ratings.js`;
in-match stamina in `engine/player.js` (resets per match); `career.transfers`
replay; hub.js `hubTile`/`pageShell`; CAREER_VERSION migrations.

Rules (all phases): DOM-free logic in `src/core`/`src/engine`, headless test
per phase (`tests/*.test.mjs`) + ALL regressions, seeded rng only (`makeRng`),
CAREER_VERSION bump with in-place migration for every save-shape change,
`sw.js` CACHE bump + ASSETS update, CLAUDE.md update, files <400 lines,
hub tiles/pages via hub.js, no emojis, STOP and report after each phase.

---

## Phase L1 — League-wide stat leaderboards

Today only the user's squad gets goal attribution; AI fixtures have scores
but no scorers, so there is no Golden Boot race.

1. **Attribution:** in `completeRound`, after each AI-vs-AI quickSim, attribute
   goals (and ~0.7 assists per goal) to the involved clubs' squads with the
   round's seeded rng — weight FW 60 / MF 30 / DF 10, bias toward higher
   `shoot`. Apps +1 for all starters. Reuse/extend `attributeSimGoals`.
2. **Persistence:** AI club season stats must survive reload. Extend
   `syncSeasonStats`/`applyCareerToClubs` to cover ALL clubs (store compact:
   playerId → {apps,goals,assists} only; user club keeps full stats).
3. **UI:** LEADERBOARDS tile on the career hub → page with two panels
   (TOP SCORERS / TOP ASSISTS, top 10, club badge + code, user-club players
   highlighted). Golden Boot winner named in the season summary.

**Acceptance (tests/leaderboards.test.mjs):** full headless season → total
attributed goals == total fixture goals across all 20 clubs; leaderboard
deterministic for a fixed seed; reload (applyCareerToClubs) preserves AI
stats; user-club attribution unchanged from V3 behavior.

## Phase L2 — Morale that matters

`p.morale` (55–90 at gen) finally gets read and written.

1. **Drivers (career only, applied in `completeRound`/match fold):** result
   (W +4 team-wide, L −3), played & rated ≥7.5 → +3, benched all match → −2,
   transfer-listed → −6 while listed. Clamp 20–95. Slow drift toward 65
   (+/−1 per matchday).
2. **Effects (small, capped):** match performance — morale maps to ±3% on
   pass/shoot error and first-touch time via a single multiplier in the
   engine (read from `p.data.morale`, default 1.0 when absent so Quick Match
   is unaffected); market value — `valueOf` × (0.92 + morale/100 × 0.16)
   (betting-sim moraleFactor shape); form bonus in endSeason already exists —
   morale ≥80 adds +0.3 to the form bonus, ≤35 subtracts 0.3.
3. **UI:** morale chip in the dossier + squad page (icon + color band);
   toast when a player drops below 35 ("unsettled").

**Acceptance (tests/morale.test.mjs):** seeded season — winning streak raises
squad average morale, losing streak lowers it; listed player's morale drops
and recovers after unlisting; two identical seeded matches with morale 90 vs
30 squads → measurable but bounded stat gap (shots/pass accuracy within ±10%);
Quick Match (no career) byte-identical to before (morale multiplier 1.0).

## Phase L3 — Board objectives & confidence

Port of Sportsim-pro board-objectives, DLS-light.

1. **One objective per season**, generated at `newCareer`/season roll from
   club rating rank: top-4 club → "finish top 2"; mid → "finish top 10";
   low → "avoid relegation zone" (D-aware once V4-D lands; pre-D: "finish
   above 15th"). Plus one soft objective: "reach cup QF" (if V4-C landed).
2. **Confidence 0–100** (start 60): moves after every matchday from position
   vs target trajectory (±2) and last-5 form (±1); big win/loss vs top club
   ±3. Thresholds from Sportsim types: ≥80 Delighted / ≥60 Content / ≥40
   Concerned / <40 Ultimatum. Below 25 at season end (or objective badly
   missed) → SACKED: career ends with a history entry; offer restart at a
   bottom-half club (keep manager history — see L6 hook).
3. **Money:** objective met → board bonus at endSeason (scale with club
   rating, ~30–50% of position prize). Uses existing finance module.
4. **UI:** BOARDROOM tile on career hub (confidence meter + objective +
   trajectory arrow) → small page; confidence delta toast after each
   matchday sim; sack/bonus drama on the season summary.

**Acceptance (tests/board.test.mjs):** seeded seasons — overachieving raises
confidence to Delighted + pays bonus; tanking every match hits Ultimatum and
triggers the sack path; confidence never leaves [0,100]; migration keeps
existing careers (objective generated lazily).

## Phase L4 — Fatigue & injuries

Stamina stops resetting between career matchdays.

1. **Fatigue:** add `p.fitness` 0–100 (default 100). Playing a match costs
   ~18±5 (seeded, minus `physical`/100 × 6); resting a matchday restores 30;
   SIM FIXTURE counts as playing for starters. Fitness <70 scales match
   stamina cap and pace proportionally (engine reads it like morale — default
   100 when absent).
2. **Injuries:** seeded chance per played match, base 2.5%, doubled under
   fitness 60. Injury = `p.injuredFor` (1–4 matchdays, weighted 1–2), player
   excluded from `pickLineup` and transfer listings while out; auto-heals in
   `completeRound`. News line + toast. (Physio coach from V4-E, if present,
   −1 matchday and −30% chance — wire the hook, guard if E not landed.)
3. **UI:** fitness bar + red cross on squad page/dossier; NEXT MATCH tile
   warns "2 injured"; lineup intro skips injured players.

**Acceptance (tests/fitness.test.mjs):** seeded season — rotated squad ends
fitter than an unrotated one; injured player absent from XI candidates until
healed then returns; injury counts plausible over 3 seasons (2–12 per club
season); Quick Match unaffected (fitness/injury ignored outside career).

## Phase L5 — Scouting-lite

1. Transfer listings hide exact attributes by default: show pos/age/club and
   a coarse star band (overall ±4 fuzzed with the window's seed). SCOUT
   button per listing (fee ~3% of price, min 100) reveals the true dossier
   for that window and marks the listing "scouted" (persisted in
   `career.market`).
2. AI never needs scouting (unchanged). Buying unscouted is allowed — risk.
3. **UI:** lock glyph → revealed rows on marketPage; scouting spend appears
   in the finance ledger as a line item.

**Acceptance (tests/scouting.test.mjs):** unscouted listing shows fuzzed band
(deterministic per seed, true value within band); scouting debits the fee,
reveals, persists across reload; fuzz never misleads by >±4 overall.

## Phase L6 — Fouls, cards & suspensions (engine phase — LAST, riskiest)

The engine currently has free-kick phases but no fouls: tackles are never
punished.

1. **Foul model:** on a FAILED tackle contest where the tackler arrives late
   (contact after ball is past / while target shielding), seeded foul chance
   scaled by closing speed + `defend` rating. Slide-type commits (V2 tackle
   lockout state) foul more. Result: FREE_KICK restart at the spot (phase
   already exists) or PENALTY when inside the box (new phase: single shooter
   vs GK reusing ShootingSystem/goalkeeper dive — also the base V4-C
   shootouts can share).
2. **Cards:** seeded yellow on cynical fouls (high speed or last man),
   second yellow / straight red (rare, ~1 in 25 fouls) → team plays with 10
   (entity removed from team.players active set; AI shape must cope — reuse
   press-rank logic). Card events into commentary ticker + match stats.
3. **Suspensions (career):** red or 2 accumulated yellows across matchdays →
   1-matchday ban, excluded from pickLineup like injuries; stored on
   `p.season.cards`; cleared at season end.
4. **Balance guard:** target 0–4 fouls per team per match, <0.3 reds per
   match across 10 seeded sims — extend aiSim plausibility asserts so this
   cannot regress silently.

**Acceptance (tests/fouls.test.mjs):** 10 seeded AI sims — foul/card rates in
the target bands, play always restarts correctly (no stuck phases, clock
sane), 10-man team finishes matches; penalty awarded+convertible in a
contrived box-foul scenario; suspension sits out exactly one matchday;
matchRules + aiSim regressions stay green.

---

## Order & save versions

L1 → L2 → L3 → L4 → L5 → L6. Expected CAREER_VERSION bumps: L1 (all-club
season stats), L3 (board state), L4 (fitness/injuredFor), L5 (scouted flags)
— each with in-place migration; L2/L6 ride existing shapes (morale is already
in the schema; cards live in p.season). If V4 C/D/E have not run yet, guard
every cross-reference (cup objective, physio hook, division-aware targets)
behind existence checks so V6 phases stay independently shippable.
