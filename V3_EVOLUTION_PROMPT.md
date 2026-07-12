# Dream Kick — V3 Prompt: Remaining Work + Evolution

Read `CLAUDE.md` first. V2 Phases 1–4 are DONE (camera, stadium, ball/possession rebuild, match-flow menus). This prompt covers what remains: critical match-logic bugs, V2 Phase 5 (AI), and evolving the game with patterns from two sibling repos you MUST read before coding:

- `../Sportsim-pro` — player model (`src/types/player.ts`), `src/components/PlayerDossierModal.tsx`, `PlayerCompareModal.tsx`, season/services structure (React+TS — adapt patterns to Dream Kick's vanilla-JS-no-build stack, do NOT import React).
- `../football-tournament-betting-simulator` — `src/utils/careerUtils.ts`, `playerRatingUtils.ts`, `src/components/CareerStats.tsx`.

Before writing any code, list which files you read from each sibling repo and what you're reusing from them.

Work the phases in order. After each phase: run the game (`python -m http.server 8000`), verify the acceptance criteria in-browser, bump the `sw.js` CACHE name, update CLAUDE.md, then stop and report before the next phase.

---

## Phase A — Critical match-logic bugs (fix FIRST)

From my bug tracker ("kickoff error", Major):

1. **Teams switch sides after every goal.** Sides must switch ONLY at half-time. After a goal: conceding team kicks off from the centre spot, both teams reset to their current-half formations, attacking directions unchanged.
2. **Goal attribution is wrong** — "any goal scored anywhere by the other team counts as their goal." Goal detection must credit the team attacking that goal, derived from each team's attacking direction for the current half — a single source of truth in `MatchRules`/`match.js` (e.g. `attackingDir(team, half)`), used by goal detection, kickoff logic, AI, and the HUD score. No duplicated side/direction booleans scattered across modules.
3. **Restarts don't start from the halfway line properly.** Every kickoff (match start, post-goal, second half) must: place ball exactly at centre spot, reset all 22 players via `team.resetPositions` (slot-by-`p.idx`, already fixed — reuse it), give first touch to the correct team, brief whistle/countdown, then play.

**Acceptance:** score 3 goals across both halves (including at least one conceded); score always credits correctly, sides only swap at HT, every restart is a clean centre-spot kickoff. Also write a headless node test that simulates goals in both halves and asserts attribution (engine modules are DOM-free — see CLAUDE.md headless pattern).

## Phase B — Off-ball AI pass (V2 Phase 5, unchanged)

- Formation-anchored positioning; forwards make runs in possession, shape recovery when defending; nearest defender presses the carrier, others cover lanes.
- AI on the ball weighs safe pass / forward pass / dribble / shoot / clear, using the SAME PassingSystem/ShootingSystem as the user (one code path).
- Difficulty scales AI decision quality + reaction time.

**Acceptance:** watching AI vs AI (seeded `match.rng`), teams visibly build up, pass, and shoot without blob clustering; results across 10 headless sims look football-plausible (e.g. 0–5 goals/team, both teams register shots).

## Phase C — Player model & dossier (port from Sportsim-pro)

1. **Upgrade the player data shape** in `src/data/teams.js`/`engine/player.js` toward Sportsim-pro's `Player`: `id, name, position, age, rating, attributes {pace, shooting, passing, dribbling, defending, physical}, stamina, form, morale, goals, assists, matchRatings, marketValue`. Keep it a plain object (no TS). Generate plausible attributes from existing overall ratings.
2. **Attributes must feed the engine:** pace → sprint speed, passing → pass noise, shooting → shot error, defending → tackle contest, physical → shielding, dribbling → control. Replace any remaining single-rating checks in PossessionSystem/PassingSystem/ShootingSystem.
3. **Player Dossier modal** (vanilla-JS port of `PlayerDossierModal.tsx`): full attributes hexagon/bars, season stats, form, market value. Opened by double-tap/click on any player card (team management, lineup intro, ratings screens) — reuse the existing double-tap detection in `renderPlayerCard` and z-order contract (popup 9500).
4. In-match stat tracking per player (goals, assists, shots, tackles, saves) feeding `computeMatchRatings` and accumulating into season stats.

**Acceptance:** every player card opens a dossier with attributes + stats; a fast player is visibly faster in-game; ratings at full-time reflect tracked stats.

## Phase D — Career mode (DLS-style, deliberately small)

A light season wrapper — NOT Football Manager. Reference `careerUtils.ts`/`CareerStats.tsx` for structure and Dream League Soccer for feel:

- New main-menu entry **Career**: pick a club, play a season (each club in `teams.js` once, e.g. 15–19 games), league table with W/D/L/GD/points, next-fixture screen (like the DLS pre-match: both lineups, TEAM / PLAY buttons).
- Between matches: team management (existing screen) + career dashboard (position, form last 5, top scorer, player season stats via dossier).
- Sim any fixture (reuse sim-to-end headless engine) or play it.
- End of season: champions/final-position summary, simple player progression (small rating drift by age + season ratings — pattern from Sportsim-pro `weeklyDevelopment.ts`, simplified), then start next season.
- Persist in the existing localStorage save (`dreamkick.v2`) with save-version migration. Quick Match must keep working unchanged.
- NO transfer market, finances, or multi-division promotion in this version — list them under "future ideas" in FEATURES.md instead of building them.

**Acceptance:** start a career, play 2 fixtures + sim 3, table updates correctly, reload the page and continue the career, finish a season and roll into the next.

---

## Rules (enforce throughout)

- Keep the stack: vanilla ES modules, no npm/build, Three.js vendored, no CDN. Files under ~400 lines; logic separated from UI; tunables in `core/config.js`.
- Bump `sw.js` CACHE name every phase; hard-refresh note applies.
- Update `CLAUDE.md` "Known gotchas / current state" after every phase (replace stale info, don't append a changelog).
- One phase at a time: verify acceptance, report, wait.
