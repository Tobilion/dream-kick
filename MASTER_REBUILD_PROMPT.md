# DREAM KICK — MASTER REBUILD PROMPT (v1.0)

You are building **Dream Kick**: a browser-based 3D football game that plays like **Dream League Soccer 2024** and presents like **EA FC's menus**. This document is the complete specification: every feature, the exact architecture, the visual language, the tuning values that are known to work, and — critically — **every bug class already hit in the reference implementation**, so you do not repeat them. Treat the "DRAWBACKS" sections as law: each one cost real debugging time.

Work in phases (Part 8). After each phase: run the app + headless tests, bump the service-worker cache, update CLAUDE.md, stop and report.

---

## PART 0 — Vision

- **Gameplay feel = Dream League Soccer:** pick-up-and-play arcade football. Low elevated sideline camera, chunky readable players, one-tap passing, instant restarts, snappy 2–5 minute halves. Light club management (squad, formation, tactics, transfers) — never Football Manager depth.
- **Presentation = EA FC / FIFA menus:** dark navy UI (#0b0e1a), single accent (#00d4a3), skewed card edges, diagonal screen wipes, spotlight/tilt hover cards, staggered fade-up entrances, bold condensed uppercase type.
- **Platform:** desktop + mobile browsers, PWA installable, fully offline after first load, saves in localStorage.
- **Everything procedural:** zero image/audio/font assets. Badges, kits, portraits, crowd, pitch = runtime canvas textures. Sounds = WebAudio oscillator chimes. The ONLY third-party code is Three.js, vendored locally.

## PART 1 — Stack & architecture (non-negotiable)

- Vanilla JavaScript ES modules. **No npm, no bundler, no TypeScript, no CDN.** Serve statically (`python -m http.server 8000`); ES modules require http(s), file:// will not work.
- Three.js r160+ vendored at `vendor/three.module.js`, imported via relative paths.
- **Folder layout:**
  ```
  index.html            shell only (<100 lines): canvas + #ui + #hudRoot
  styles/ui.css         ALL UI styling, CSS custom properties
  vendor/three.module.js
  src/main.js           boot, fixed-timestep loop, screen-FSM wiring
  src/core/             config.js (EVERY tunable), math.js, state.js, save.js, career.js, finance.js
  src/data/             teams.js (20 clubs, procedural squads), names.js
  src/engine/           match.js (MatchEngine FSM), ballPhysics.js, possessionSystem.js,
                        passingSystem.js, shootingSystem.js, ai.js, goalkeeper.js,
                        rules.js, ratings.js, player.js, team.js
  src/render/           scene.js, stadium.js, playerMesh.js, ballMesh.js, cameraController.js, effects.js
  src/input/            input.js (action abstraction), keyboard.js, touch.js
  src/ui/               screens.js, hud.js, playerCard.js, lineupIntro.js, teamManagement.js,
                        settingsScreen.js, matchFlow.js, components.js, draw.js, icons.js
  tests/                *.test.mjs — plain node scripts, no framework
  sw.js  manifest.json
  ```
- **Hard rules:** every file under ~400 lines. Game logic 100% DOM-free (engine/core modules must import nothing from ui/render) so every system is headless-testable in Node. All tunables live in `core/config.js`. All gameplay randomness comes from a **seeded rng** (mulberry32 `makeRng`) hung on the match (`match.rng`) — never `Math.random()` in engine code.
- **Fixed timestep:** simulate at 60 Hz accumulator inside a rAF render loop. `Match.update(dt, input)` must be callable headless in a bare loop.

**DRAWBACKS already hit — architecture:**
1. **rAF freezes in background tabs.** The sim loop stops when the tab is hidden (fine), but NEVER put game-flow logic (screen transitions, timers that unlock UI) inside `requestAnimationFrame` — a backgrounded tab permanently stalls them. Use `setTimeout` for transition callbacks.
2. **Service-worker cache poisoning.** A fetch-handler that caches everything on first hit WILL serve stale modules after every code change. Bump the `CACHE` name on every change batch, and know that an already-open tab still runs the old SW until a hard refresh (Ctrl+Shift+R). Document this in CLAUDE.md; tell the user every time.
3. **Keep one debug handle:** `window.__match = match` on match start. You will need it for scripted verification.
4. Verify writes when editing large files with tooling — truncated writes/syncs happen; syntax-check (`node --check`) after edits, and keep files small so damage is bounded.

## PART 2 — Match engine

### 2.1 MatchEngine FSM (`engine/match.js`)
States: `PRE_MATCH → (lineup intro) → KICKOFF → FIRST_HALF → HALF_TIME → SECOND_HALF → FULL_TIME`, plus `PAUSED` as an overlay (freeze without losing the underlying state). Pitch sub-phases: `OPEN_PLAY, KICKOFF, THROW_IN, CORNER, GOAL_KICK, FREE_KICK, GOAL_CELEBRATION`.

- Clock advances ONLY during OPEN_PLAY; scaled to 45 display-minutes per half.
- **Single source of truth for direction:** `match.attackingDir(teamIdx)` derived from team index + current half. `syncAttackDirs()` pushes onto teams exactly once, at the real half-time transition. Goal detection, kickoffs, AI, camera, HUD all read this.
- Kickoffs: match start = home; second half = away; **after a goal = the conceding team** (`_nextKickoff`). Every kickoff: ball at exact centre, all 22 reset to formation slots, whistle delay (~1.6s), then the taker passes.

**DRAWBACKS — the three worst bugs in the reference build, all here:**
5. **State-enter side effects re-fire.** `go(SECOND_HALF)` flipped sides and reset the clock on EVERY entry — and post-goal kickoffs re-enter SECOND_HALF. Result: "teams switch sides after every goal" and halves never ended. Guard enter-effects with `prev === HALF_TIME`, or better, derive (don't mutate) direction from `half`.
6. **Never duplicate side/direction booleans across modules.** Goal attribution broke because rules.js read a cached `attackDir` that other code mutated. One derived function, everywhere.
7. **Slot index ≠ array index.** Players carry a formation-slot `idx` that team-management (formation change, position swap) reassigns WITHOUT reordering the players array. Three separate bugs came from indexing `players[i]` with a slot index (kickoff reset scatter, anchor GK check, ratings). Always map slots via `p.idx`, and treat slot 0 as the GK slot.

### 2.2 Ball physics (`engine/ballPhysics.js`)
Deterministic free ball: gravity (−20, slightly gamey), air drag, linear rolling deceleration (v(x) = v0 − k·x — exploit this: pass power = arriveSpeed + k·distance), restitution bounce (0.55), hard MAX_SPEED cap (38), magnus curl ONLY from the explicit kick parameter, decaying. **Zero random impulses: identical kick vector ⇒ identical trajectory, assert this in a test.**
- **Swept (continuous) collision vs players:** segment-vs-point distance each step so fast balls never tunnel; deterministic reflection off the body with speed-dependent damping (fast = block, slow = drops dead for interception pickup). `kickGrace` timer so the kicker can't collide with their own kick.
- `attached` flag: while dribbled the ball is **kinematic** — physics skipped entirely, PossessionSystem places it.

### 2.3 Possession (`engine/possessionSystem.js`)
- Free ball within CONTROL_RADIUS (1.15m) of an eligible player (respect per-player `controlCooldown`) ⇒ **attach**: carried at the feet with a forward dribble offset (0.6m + speed-scaled), moving with the carrier. Dribble speed = 87% of off-ball speed.
- Fast incoming ball ⇒ **first touch**: kill velocity, short control delay scaled by ball speed and the receiver's dribbling attribute, then attach.
- **Possession is lost ONLY via:** an active tackle contest, a pass interception/block, or out-of-play. Overlapping an opponent must NEVER steal the ball.
- **Tackle contest** (one code path for user and AI): attribute-based — tackler `defending` vs carrier `physical×0.55 + dribbling×0.45` — via `match.rng`. Win pops the ball loose toward the tackler; **lose locks the tackler out for 1.5s** (re-tackle cooldown) so possession never flickers.

**DRAWBACK 8:** the naive version ran a tackle roll EVERY FRAME an opponent overlapped the carrier — possession strobed several times a second and dribbling was impossible. Contests must be explicit actions with cooldowns.

### 2.4 Passing (`engine/passingSystem.js`) — one code path for user AND AI
- `strike()` is the single kick entry (passes, shots, clears): detaches, plays kick anim, sets lastTouch, increments stats.
- User pass: pick best teammate in a cone around input direction (fallback: utility-scored best target). Exact lead vector (receiver pos + vel × leadTime). Ground pass power from the linear-decay formula so it *arrives* at a controllable speed; >26m = lofted.
- The ONLY noise: small angle error from passer rating + defender pressure. Straight, interceptable lines.
- Track `pendingPass {team, receiver, passer}` → completion bumps pass-accuracy stats and sets the **assist candidate**.

### 2.5 Shooting (`engine/shootingSystem.js`)
Power from hold-charge (user) or distance context (AI); aim biased inside the posts by stick input; error = computed function of shooter rating, distance, angle, pressure, charge — bounded, via match.rng. Lift from charge. Clears are position-derived (no dice). GK save chance emerges from keeper positioning/reaction/dive vs shot speed & placement.

### 2.6 Goalkeepers (`engine/goalkeeper.js`)
Positioning on the ball-goal line with angle-narrowing; threat prediction (where does the ball cross my x, and when); reaction-time gate scaled by GK rating and difficulty; dive with lateral reach ~7.4m; catch/claim close balls; simple distribution (short to open defender, else clear).

### 2.7 Rules & restarts (`engine/rules.js`)
Boundary detection returns events: GOAL (credit via `attackingDir`), CORNER/GOAL_KICK (by last touch), THROW_IN. Restart flow: taker walks to spot, waits, user-controlled taker restarts on button (auto after 4.5s), AI restarts automatically. Corners are lofted crosses with curl. (Offside: leave a documented hook, don't implement in v1.)

### 2.8 Off-ball & on-ball AI (`engine/ai.js`)
- **On-ball utility scoring** across: shoot / forward pass / safe pass / dribble / clear — executed through the SAME systems as the user. Difficulty `quality` = probability of picking the top-scored option (0.6 / 0.82 / 0.95).
- **Attacking shape:** formation anchors (with team push/drop by ball position + mentality, lateral ball-side shift); forwards make depth runs when the ball is advanced; nearest MF offers a short option; only the single closest teammate chases a loose ball.
- **Defending:** press-rank — rank 0..n press the carrier (pressing-intensity tactic scales n) and attempt tackles in range; the next rank sits goal-side in the most dangerous passing lane; everyone else recovers anchor shape.
- Decision timers per player (~0.12s, staggered, difficulty-scaled).

**DRAWBACKS — AI tuning that WILL bite you:**
9. **Passing always outscores shooting** in naive utility weights → teams finish matches with 0 shots. Damp pass appeal inside shooting range (×0.55) and add an in-box shoot imperative (+0.5). Target in 5-min sims: 2–19 shots per team.
10. **Blob clustering:** if more than one teammate chases loose balls, or pressers are uncapped, the match collapses into a scrum. Enforce chase-rank-0-only and press counts. Metric: mean outfielder distance from team centroid ≥ 8m at all times (~19m healthy).
11. **Blowout control:** every attack/defence tuning change shifts score distributions. Keep a 10-seed AI-vs-AI acceptance test (goals ≤5/team, both teams shoot, possession 25–75%) and re-run it after ANY engine tweak. Levers that worked: shot error spread ×2.9, GK dive reach 7.4.
12. For AI-vs-AI headless sims, support `opts.aiOnly` — otherwise the "user-controlled" player stands still (no input) and silently skews every result 10v11.

## PART 3 — Rendering

- **Camera (`render/cameraController.js`) — THE most important feel decision. Build it FIRST.** Default **Sideline**: off the touchline, height 12 / distance 22 (~28° pitch angle), perspective FOV 50, framing ~⅓ of the pitch so players read as 3D bodies. Damped follow (framerate-independent exp smoothing, never snap) with velocity look-ahead. Presets: Sideline / Broadcast-high (26/40) / Top-Down classic (58) / End-to-End (behind own goal); Camera Distance setting 80–130%. Menu orbit mode for backgrounds. Raycast occlusion: any stadium group between camera and pitch samples gets culled (throttled, ~4Hz) — the camera must NEVER be blocked.
- **Stadium (`render/stadium.js`):** procedural pitch texture (stripes, all markings drawn to canvas), goals with line-segment nets (ripple on goals), animated-texture crowd stands, floodlights, ad boards. **Scene hierarchy:** `Stadium / Pitch / PlayersAndBall / Lighting` as named groups; HUD is DOM, never 3D.
- **Players/ball:** low-poly rigs, kit colors + number textures from canvas, state-driven poses (run/kick/slide/dive/fall/celebrate), ball with rolling rotation + blob shadow. Shadows ON everywhere (PCF, one directional sun) — **shadows are what sell the 3D read**; auto-degrade via an fps probe (<45fps ⇒ shadows off, pixelRatio 1).

**DRAWBACKS — rendering:**
13. **Stand geometry extends TOWARD the pitch from its anchor.** Anchoring stands at boundary+4m put roofs 12m OVER the pitch. Compute each group's real inward extent and anchor so nothing crosses pitch+margin; audit from all four camera presets.
14. Camera occlusion culling and any stadium-side visibility hacks must have ONE owner or they fight each other frame-to-frame.

## PART 4 — UI / screens (EA-FC language)

- **Screen router** (`ui/screens.js`): Menu → Team Select → Pre-match squads → (match) → Results; plus Career screens and How-to-play. Diagonal wipe transition between screens (setTimeout, not rAF — see drawback 1). Glow orbs, spotlight cards, magnetic buttons, scramble-text, count-up counters, procedural chimes (all in `components.js`).
- **HUD** (`ui/hud.js`): scoreboard + clock top-left, pause top-right, bottom-centre **mini-radar with all 22 players + ball**, controlled-player ring + nameplate (world→screen projection), phase banners (KICK OFF / GOAL / HALF TIME), commentary ticker, keyboard hints (desktop), power bar. Touch UI: virtual joystick bottom-left, A/B/C(+sprint) buttons bottom-right, auto-detected via `pointer:coarse`.
- **Controls:** move; A = pass / tackle contextually (hold = lofted/through, or slide when defending); B = shoot / **hold off-ball = pressure the carrier**; C/Q = switch player (auto-switch on possession gain also on); Shift sprint; pause key; camera-cycle key.
- **Pause menu** = same option set everywhere: Resume, Team Management, Match Statistics, Game Settings, Instant Replay (stub), Sim to End (confirm), Forfeit (confirm → recorded loss), Exit.
- **Half-time**: full menu grid (same options, Continue to 2nd Half). **Full-time**: score hero, scorers, animated stat bars (possession/shots/on-target/passes/accuracy/tackles), **player-ratings panel** (both XIs sorted, FotMob-style color chips: ≥8 green, ≥7 blue, ≥6 amber, ≥5 orange, else red), MOTM card with progress ring, Rematch / Exit.
- **Team management** (pre-match, pause, half-time): formation buttons (442/433/4231/352/532) with cards **absolutely positioned at formation slot coordinates** (so switching visibly rearranges), bench list (row-cards), tap-to-select swap/sub flow (5 subs max), mentality (def/bal/att) + pressing (low/mid/high) toggles.
- **Player cards & dossier** (`ui/playerCard.js`): compact card (number chip, canvas portrait, name, pos, OVR) reused across lineup intro / management / squad lists. **Double-tap any card ⇒ dossier modal**: position-colored header, age phase (Prospect→Twilight), OVR + form chip, market value, morale, six attribute bars (color-banded), season stat row, GK bar for keepers.
- **Lineup intro:** skippable broadcast-style pre-match (splash with badges → each XI on a stylized pitch, compact cards).
- **Settings:** DLS-style rows — camera type, camera distance (live %), audio sliders, half length, difficulty, display toggles. Persist everything; apply live mid-match.

**DRAWBACKS — UI (each was a real shipped bug):**
15. **Animated screens default to opacity:0** until an `.in` class lands. ANY dynamically created `.screen`/overlay must add `.in` (next tick) or it renders invisible while its timers still run — the reference build shipped a fully invisible lineup intro that "worked" (game started after 10s) with nothing on screen.
16. **Native dblclick dies when single-click rebuilds the DOM.** Selection handlers that re-render the modal destroy the card before the second click. Implement double-tap manually in the card component: delay onClick ~260ms, second tap cancels it and fires onDblClick (also fixes touch).
17. **Write the modal z-order contract down and follow it:** HT menu 1200 < settings 9000 < team-mgmt 9001 < match-stats 9400 < player dossier 9500 < toasts 9999. The dossier "did nothing" for days because it opened at the default z UNDER team management.
18. **Every card-consuming call site passes a different shape** (engine entity with `.data` vs plain squad object). Make the card/dossier unwrap `p?.data ?? p` — don't chase call sites.
19. CommonMark/CSS gotcha: keep ALL card styling in ui.css classes — the reference shipped completely unstyled cards because `.player-card` CSS simply didn't exist and nobody noticed against the dark theme.

## PART 5 — Data & player model

- **20 fictional clubs** (England/Spain/Germany/France/Italy/Brazil/South America/Africa flavored names, real-ish ratings 75–89, kit color pairs, badge styles). Squads of 18, **deterministically generated** from a per-club seed so "Mersey FC" always has the same players. Region-appropriate procedural names.
- **Player schema (plain object):** `id, name, pos(GK/DF/MF/FW), num, age(18–34), pace, shoot, pass, dribble, defend, physical, gk, skin, hair, morale, overall (position-weighted), marketValue (exponential in overall × age curve peaking ~23), wage, season{apps,goals,assists,tackles,saves,matchRatings[]}`. `form` = last-5 rating average.
- **Attributes must FEED the engine** (else they're decoration): pace→speed, pass→pass noise, shoot→shot error, defend→tackle contests, physical+dribble→shielding, dribble→first-touch, gk→keeper reactions. Verify with a test (92-pace vs 52-pace ⇒ measurably different m/s).
- **Per-player match stats tracked live** (shots at strike, goals+assists at goal — assist = last completed same-team pass to the scorer, invalidated on interception; tackles on contest wins; saves on GK claims). **Match ratings computed from tracked stats** (base 6 + result±, goals 1.2, assists 0.7, shots 0.08, tackles 0.15, saves 0.35, quality factor, small seeded jitter, clean-sheet bonuses; clamp 4.5–10; **cache on the match** so UI and season bookkeeping agree). Fold into `season` at FULL_TIME exactly once (guard flag).

**DRAWBACK 20:** deflected goals bump team shot totals without a player attribution — keep per-player and team stats reconciled (credit the scorer) and assert `Σ player == team` in tests.

## PART 6 — Career mode (DLS-sized) + save

- **Save:** single localStorage key (`dreamkick.v2`), merged over defaults. Settings, last selections, last-10 results, career.
- **Career:** pick a club → 19-round single round-robin (circle method, all 20 clubs, venues alternate by season). League table always **computed from played fixtures** (never stored). Dashboard: standings (W/D/L/GD/Pts, user row highlighted), next fixture (respect home/away), position, last-5 form chips, top scorer, buttons: Play / **Sim fixture** / Squad (dossiers) / Reset.
- User plays real matches (user club always renders as home team; record the result into the fixture's true venue orientation); other 9 fixtures quick-simmed (seeded, rating-based). Simming the user's own fixture attributes goals to the squad so top-scorer races stay alive.
- **Season end:** summary (champion, your position, top scorer) → **player progression**: age-curve deltas (<24 grow ~+1.6, <27 +0.7, <31 −0.2, <34 −0.8, else −1.4, ±seeded jitter; user-club form bonus), ages++, season stats reset → next season, same club.
- **Persistence trick:** squads are regenerated deterministically at boot, so progression must be stored as **per-player-id delta maps** (`playerDev`) + user-club season stats snapshot, re-applied to CLUBS on load. Version the career object (`CAREER_VERSION`) and migrate old shapes — never corrupt a save.

**V4 roadmap (build after core is stable — full spec in V4_EVOLUTION_PROMPT.md if present):** A) club finances (balance, gate receipts, sponsors, wages, prize money); B) transfer market (windows, seeded listings priced off marketValue, AI activity); C) knockout cup interleaved with the league (shootouts on draws); D) two divisions with promotion/relegation; E) training focus + coaches (capped ±2 rating/season). Rules: every save-shape change bumps CAREER_VERSION with migration; Quick Match untouched.

## PART 7 — Testing protocol (this is what made the reference build converge)

Plain Node scripts in `tests/`, run as `node tests/<name>.test.mjs` — possible ONLY because engine/core are DOM-free. Maintain and re-run ALL of them after every engine change:

1. **Determinism:** identical kick vectors ⇒ byte-identical trajectories over 300 frames.
2. **Match rules (~20 asserts):** goal attribution both ends × both halves; sides flip exactly once at HT; post-goal kickoff = conceder, centre spot, clock preserved; full FSM walk.
3. **AI plausibility (10 seeded AI-vs-AI sims):** finished; goals ≤5/team; both teams ≥1 shot; possession 25–75%; spread ≥8m. This suite is your regression net for ALL tuning.
4. **Player model:** schema fields; pace→speed; Σ per-player stats == scoreboard/team stats; scorer rated above team average; ratings cached; season fold + form.
5. **Career:** fixture coverage (each club once); play-2-real + sim-3; table integrity (pld uniform, pts = 3W+D); serialize→migrate→reload; full season; rollover ages/drifts/resets/persists dev deltas.
6. In-browser passes for UI phases (screens can't be headless): drive with scripted clicks + screenshots; remember drawbacks 1/2 (focused tab for rAF, hard refresh for SW).

## PART 8 — Build order (each phase gated on its acceptance)

1. **Skeleton + menus:** shell, CSS system, screen router + wipes, menu/team-select/settings, save. *Accept:* navigate all screens, settings persist.
2. **Camera + stadium + players render:** sideline camera first, presets + distance, occlusion, shadows, kickoff formation visible. *Accept:* DLS-look kickoff frame; nothing occludes the pitch from any preset.
3. **Ball/possession/passing/shooting** (+ determinism & rules tests). *Accept:* dribble the pitch untouched; string 5+ deliberate passes; possession lost only via tackles/interceptions/out.
4. **Match FSM + rules + GK + HUD/controls** (+ match-rules test). *Accept:* full match start-to-FT with correct restarts and attribution.
5. **AI pass** (+ AI plausibility suite). *Accept:* watchable AI-vs-AI football.
6. **Match-flow menus:** pause/HT/FT with stats, ratings, MOTM; team management + subs; lineup intro; dossier. *Accept:* HT sub + settings change; sim-to-end and forfeit reach coherent FT.
7. **Player model depth + ratings from tracked stats** (+ player-model test).
8. **Career mode** (+ career test).
9. **V4 economy phases** (finances → transfers → cup → divisions → training), one at a time.

## PART 9 — Do-better list (where the reference build stopped short)

- Instant Replay is a stub — consider a ring-buffer of entity transforms for a real replay.
- Offside is a documented hook only.
- `simToEnd` uses a crude minute-loop instead of the real engine headless — unify (run the actual engine fast) so simmed stats match played ones.
- Only 2 formations differ meaningfully in AI behavior; tactics (mentality/pressing) could feed the on-ball utility weights more.
- Sound is minimal chimes; a procedural crowd loop (filtered noise swelling with attack proximity) would add a lot.
- Mobile performance: test the fps probe path on a real low-end device; consider instanced crowd.
- Accessibility: the UI is mouse/touch-first; add focus states and reduced-motion support.

**Final instruction:** keep CLAUDE.md updated after every phase (current state, gotchas — replace stale info, no changelogs), name caches `dreamkick-vX.Y.Z` and bump on every batch, and never mark a phase done without its acceptance test output in the report.
