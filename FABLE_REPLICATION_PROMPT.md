# Dream Kick — Complete Replication & Evolution Prompt (for Claude Fable)

> Paste everything below the line into a fresh coding agent. It is a self-contained brief to build **Dream Kick** — a browser-based 3D football game — from nothing, matching the reference build feature-for-feature and then surpassing it. It encodes every system, every data model, every tunable, and — most valuably — every bug and pitfall the original build already paid for in blood. Do not repeat those mistakes.

---

## 0. ROLE & MISSION

You are a senior game + UI engineer. Build a complete, production-quality, browser-based **3D football (soccer) game called Dream Kick** — not a toy demo. Every screen and system listed here must be fully implemented and wired together.

Two reference points, held simultaneously:
- **Gameplay feel → Dream League Soccer (DLS 2024).** Low elevated sideline camera (~25–35° pitch angle) showing about a third of the pitch; 3D players clearly readable with shadows; mini-radar bottom-center with all 22 players; virtual joystick bottom-left, A/B/C action buttons bottom-right; fast, light, mobile-first management around the matches — **not Football Manager**.
- **UI/UX → EA/FIFA 20 (FC-style).** Flat 2.0 design, dark navy backgrounds, tile/card menus, broadcast-style HUD, skewed 45° parallelogram edges.

"And better" is a hard requirement, not a nicety: after you match the spec, apply the **Improvements** section. Do not gold-plate before the base game is playable end-to-end.

---

## 1. HARD CONSTRAINTS (do not violate)

1. **No build step.** Vanilla JavaScript ES modules (`<script type="module">`). Runs by serving the folder with any static server. No npm, no bundler, no framework, no TypeScript compile.
2. **Three.js is the ONLY third-party library**, vendored locally at `vendor/three.module.js` (r160+). No other imports, **no CDN calls at runtime**. Import it via a relative path (`../../vendor/three.module.js`) and keep that path stable if you move files.
3. **Zero external assets.** No image files, no emojis as UI graphics, no icon fonts, no web fonts. ALL visuals generated in code:
   - UI icons → inline SVG from a central `icons.js` factory.
   - Textures (grass stripes, crowd, kit patterns, ad boards, radar) → runtime `<canvas>` → `THREE.CanvasTexture`.
   - Club badges → procedural SVG/canvas (shield/circle/diamond + kit colors + initials).
   - Player portraits → procedural canvas avatars (skin tone, hair shape/color, kit collar). Stylized, consistent, **never emojis**.
4. **Modular architecture, no file over ~400 lines.** Game logic lives in **DOM-free modules** under `src/core` and `src/engine` so every system is headless-testable in Node. Rendering and UI read from those modules; they never own game state.
5. **All tunable constants in one file** (`src/core/config.js`) — physics, AI, camera, timings, difficulty. The whole game must be tunable from that one file.
6. **Runs on desktop + mobile browsers.** 60 fps target on desktop; graceful quality scaling on mobile (fewer crowd instances, shadows off if slow). Auto-detect input (keyboard vs touch).
7. **PWA + offline.** `manifest.json` + `sw.js` service worker caching every file including the vendored Three.js. Saves in `localStorage`. **Bump the SW cache name on every change** or stale modules are served (see §10 pitfalls).
8. **All randomness that affects simulation must be seeded** (a `mulberry32`-style `makeRng`). Given the same seed + inputs, a match/season must reproduce identically. This is what makes headless tests possible — treat it as sacred.

---

## 2. ARCHITECTURE & FOLDER LAYOUT

```
index.html              shell only: <canvas> + UI root (<100 lines)
styles/ui.css           all UI styling (CSS custom properties for theming)
manifest.json  sw.js    PWA
vendor/three.module.js  the only third-party lib

src/main.js             boot, fixed-timestep game loop, screen router, scene groups
src/core/
  config.js             ALL tunables (physics, AI, camera, timings, difficulty)
  math.js               vec helpers, clamp, lerp, seeded RNG (makeRng, irand)
  state.js              FSM: MENU → TEAM_SELECT → MATCH → RESULTS (+ CAREER)
  save.js               localStorage persistence (key `dreamkick.v2`)
  career.js             DOM-free season engine (round-robin, table, sim, progression)
  finance.js            DOM-free club economy (V4-A)
  transfers.js          DOM-free transfer market (V4-B)
  cup.js                DOM-free knockout cup (V4-C) — or fold into career.js
src/data/
  teams.js              20 clubs, kits, ratings, seeded 18-man squads, pickLineup()
  names.js              realistic name pools per region
src/engine/             (all DOM-free, seeded via match.rng)
  match.js              phase orchestrator (the match FSM + tick loop)
  ballPhysics.js        deterministic 3D ball (gravity/friction/bounce/curl/cap)
  possessionSystem.js   kinematic dribble attach + tackle/interception loss
  passingSystem.js      cone select, exact lead vectors, single strike() entry
  shootingSystem.js     computed shot error model (AI + user share it)
  ai.js                 on-ball utility scoring + off-ball roles
  goalkeeper.js         positioning, dive, claim/parry, distribution
  team.js               formation shape, anchors, resetPositions, line shifting
  rules.js              boundaries, goals, restarts, (offside hook)
  ratings.js            FotMob-style per-player match ratings + season fold
  player.js             player entity wrapper (position, velocity, stamina, matchStats)
src/render/
  scene.js              renderer, lighting, resize, quality autodetect
  stadium.js            pitch, goals+nets, stands, crowd, floodlights, ad boards
  cameraController.js   DLS-style camera (sideline/broadcast/topDown/endToEnd)
  playerMesh.js         articulated low-poly humanoid + procedural animation rig
  ballMesh.js           icosahedron + pentagon canvas texture + blob shadow
  effects.js            goal confetti, net ripple, kick dust, camera shake
src/input/
  input.js              unified action abstraction
  keyboard.js  touch.js virtual joystick + buttons
src/ui/
  screens.js            menu / team-select / results / career DOM builders
  hud.js                scoreboard, radar, name-plate, commentary, pause menu
  matchFlow.js          half-time / full-time menus, stats modal, ratings panel
  teamManagement.js     formation, XI, subs, tactics
  playerCard.js         player card + dossier modal (double-tap detect)
  lineupIntro.js        pre-match lineup reveal
  settingsScreen.js     camera/sound/quality settings
  components.js draw.js  shared UI + canvas-drawing helpers
  icons.js              inline SVG icon factory
tests/                  headless node tests (*.test.mjs) — engine imported directly
```

**Conventions:** `camelCase` functions, `SCREAMING_SNAKE` constants, JSDoc on public APIs, movement always in units/second (never per-frame), no dead code / no TODO stubs. Fixed-timestep accumulator loop (60 Hz sim) decoupled from render.

---

## 3. VISUAL DESIGN — FC/FIFA 20 LANGUAGE

- **Palette:** bg near-black navy `#0b0e1a`; panel navy `#141a2e`; accent electric teal-green `#00d4a3`; secondary `#3d6bff`; warning `#ff4d6d`; text `#f2f5ff`; dim `#8a93b5`. Subtle canvas-generated diagonal/halftone backdrop texture.
- **Typography:** system font stack, tight letter-spacing; oversized condensed-feel headings via `font-stretch`/scale transforms; tabular numerals for scores/clock.
- **Menus:** full-screen dark screens, large heading top-left, horizontal **tile cards** with hover/focus glow, sharp **45° skewed edge** accents (FIFA parallelogram motif), 200ms slide+fade transitions.
- **Team select:** two-column VS layout — each side shows procedural badge, club name, SVG star rating, overall, canvas kit preview. Center "VS" skewed divider. Segmented controls for Difficulty (Amateur/Pro/Legend) and half length (2/3/5 min).
- **HUD (broadcast):** top-left pill scoreboard `[badge] HOME 2 – 1 AWAY [badge] | 67:42`, skewed left edge, kit-color accent underline. Bottom-center canvas **radar** (pitch outline, colored dots per team, white ball dot, ring on controlled player). Contextual button hints bottom-right (desktop key glyphs; hidden on mobile). 3D-projected DOM name-plate above controlled player. Full-width skewed **GOAL** ribbon with scorer + minute.
- **Pause menu:** dark blur overlay, vertical list (Resume/Restart/Camera/Sound/Quit) with left accent bar on focused row.
- **Results:** final-score hero panel, stats table (possession %, shots, on target, passes, tackles), man-of-the-match card with procedural portrait, Rematch / Main Menu tiles.
- **Consistent UI components:** `.player-card` (+ `.compact` / `.rowcard` variants), section-tags, rating chips (r8 green … r4 red), dossier modal. Reuse everywhere.

---

## 4. THE 3D WORLD

- **Pitch:** 105×68 units, canvas grass with alternating mow stripes, correct white markings (halfway line, center circle, boxes, penalty spots, arcs, corner quads) drawn into the texture. Goals with posts/crossbar/**visible net** (line segments) that ripples on goal via vertex displacement.
- **Stadium:** low-poly rectangular stands on 4 sides, canvas crowd texture (thousands of random colored dots, animated by cycling 2–3 frames), 4 corner floodlight towers with emissive lamps, canvas ad boards with fictional brands. **All stadium/crowd geometry strictly outside the pitch + margin** (see pitfall §10).
- **Players:** articulated low-poly humanoids from primitives (pelvis → torso w/ number decal → head + hair; upper/lower arms; upper/lower legs w/ hinge; boots). **Procedural** animation only (no clip files): idle sway, walk, run cycle (counter-swing scaled by speed), sprint lean, kick wind-up+follow-through, slide tackle, GK dive, celebration jump, knocked-down + get-up. Blend poses with lerp. (Note: three r160 `CapsuleGeometry` exists, but don't rely on r142+-only features if targeting r128 fallback — build from Cylinder/Sphere primitives.)
- **Ball:** icosahedron + canvas pentagon-panel texture, rolls (rotation matches velocity), casts a blob shadow.
- **Lighting:** hemisphere + one directional light; directional shadows on desktop (and touch if fps allows); **blob shadows** (dark transparent discs) under all players + ball always — shadows are what sell the 3D read.
- **Scene hierarchy (clean, enforced):** `Stadium` / `Pitch` / `PlayersAndBall` / `Lighting`, HUD as a 2D overlay layer. Clear players via `playersGroup.clear()` between matches.

---

## 5. MATCH ENGINE — the deterministic core

The match is a phase FSM ticked at fixed 60 Hz. Phases: `KICKOFF / OPEN_PLAY / THROW_IN / CORNER / GOAL_KICK / GOAL_CELEBRATION / FIRST_HALF / HALF_TIME / SECOND_HALF / FULL_TIME`, with a `PAUSED` overlay. Match has a seeded `match.rng` (`opts.seed` for reproducible sims); `opts.aiOnly` disables the user cursor for AI-vs-AI sims.

Rebuild the ball/possession/passing/shooting as **four separate deterministic modules** — do not use ad-hoc per-frame ball hacks:

**BallPhysics** — deterministic 3D ball: gravity, ground rolling friction, restitution bounce, air drag, Magnus-lite curl **derived only from the kick argument** (no random impulses anywhere), hard `MAX_SPEED` cap, continuous/swept collision so it never tunnels through players or pitch, `KICK_GRACE` window so the kicker can't immediately re-collide with its own kick. Same kick vector ⇒ identical path, every time.

**PossessionSystem** — when the nearest player is within `CONTROL_RADIUS`, the ball becomes **attached**: kinematically carried at the feet with a small forward dribble offset, moving with the player (NOT a free physics body while dribbled). Dribble speed ≈ 85–90% of off-ball sprint. Possession is lost **only** via: (a) a completed **tackle contest** (attribute-based: defender defend/physical vs carrier dribble/physical, with a 1.5 s re-tackle lockout so possession never flickers), (b) **interception** of a pass in flight, or (c) ball out of play. Merely overlapping an opponent must never steal the ball.

**PassingSystem** — pass button picks the best teammate in a cone around input direction, computes an exact kick vector leading the receiver's run, detaches the ball, applies vector. Straight, interceptable line. Accuracy noise scales **only** with passer rating + pressure, and is subtle. `strike()` is the single kick entry point for both pass and shot. Receiver takes a brief first touch (`FIRST_TOUCH_TIME`) before attaching. Set `match._assistCandidate` on completion for assist attribution.

**ShootingSystem** — power from hold-duration/context; direction toward goal biased by aim input; **computed** error from shooter shoot rating, distance, angle, defender pressure (no coin-flip physics). AI and user share one code path (`match.aiShoot` / `aiPass` / `aiClear` route into the same systems). Balance notes from the original: damp pass options inside `SHOOT_RANGE` (×0.55) and boost shooting < 14 m or teams finish with 0 shots; `SHOOT_RANGE = 28`; shot jitter ≈ 2.9; GK dive reach ≈ 7.4.

**Direction / sides — single source of truth (critical):** `match.attackingDir(teamIdx)` derives from team index + current half. `match.syncAttackDirs()` pushes onto teams; `team.attackDir` must **never** be mutated anywhere else. Goal/corner attribution in `rules.js` reads `match.attackingDir(0)`. **Sides switch ends ONLY at half-time**, never after a goal.

**Restarts:** every kickoff (match start, post-goal, second half) places the ball exactly on the centre spot, resets all 22 via `team.resetPositions` (maps formation slots by **`p.idx`**, not array order), gives first touch to the correct team (post-goal → the **conceding** team via `match._nextKickoff`), brief whistle/countdown, then play. Throw-ins, corners, goal kicks all place the ball correctly with a taker walk-to and brief pre-take pause. Simplified fouls → direct free kick. **No offside in v1**, but leave a documented hook in `rules.js`.

**Live match stats:** possession %, shots, shots on target, pass counts/accuracy, tackles, scorer list with minutes. Per-player `matchStats` (strike/tackle/gkClaim/onGoal incl. assists) feed `ratings.js`.

**Controls (unified action layer, DLS mapping):**
- Move: WASD/arrows or analog virtual joystick.
- **A = Pass / Tackle** contextually (ground pass by distance, leads receiver; hold = lofted long ball/cross).
- **B = Shoot / Pressure** (power bar above player from hold duration; low driven vs rising from hold + movement).
- **C = Switch player** (cursor to teammate nearest ball with directional bias; auto-switch on interception).
- **Sprint** (drains stamina, regens jogging); **slide tackle** (commit animation + recovery lockout).

---

## 6. AI

- **On-ball:** utility scoring over {shoot, forward pass, safe pass, dribble toward goal, clear under pressure} — all executed via the shared Passing/Shooting/Clear systems (one code path with the user, never separate AI physics). All AI randomness through `match.rng`.
- **Off-ball attack:** run to formation anchor blended toward ball-side overload (`SUPPORT_SHIFT`); forwards make depth runs beyond the last defender (`RUN_BEYOND`); nearest MF supports the carrier; fullbacks overlap.
- **Off-ball defense:** press-rank defenders — rank 0 presses + tackles, rank `PRESSERS` covers the most dangerous lane, the rest recover anchor shape; defensive line steps up/drops with ball x (`LINE_DEPTH_SHIFT`).
- **Goalkeeper:** position on ball-goal line, narrow the angle as an attacker closes, react-dive (reaction from GK stat + difficulty), catch vs parry by shot power, distribute (throw to near fullback / long kick) after claim.
- **Difficulty scales:** `decision` (interval), `press` (presser count), `quality` (chance of picking the best-scored option), `gkReact`. Note `team.anchor(i, …)` treats `i` as a **slot** index (slot 0 = GK) — do not index `players[i]` there.

**Acceptance:** AI-vs-AI (seeded) teams visibly build up, pass, and shoot without clustering into a blob; across ~10 headless sims results look football-plausible (0–5 goals/team, both teams register shots).

---

## 7. CAMERA (rebuild first — it's the root cause of "looks bad")

`CameraController` is the live camera; retire any top-down default.
- **Default "Sideline" (DLS):** off the sideline, elevated, pitched ~25–35°, damped spring/lerp follow (never snap) with look-ahead in direction of play, framing ~1/3 of the pitch so players read as 3D bodies. Perspective FOV ~50°.
- **Presets:** `sideline | broadcast | topDown | endToEnd`. **Distance** setting 0.8–1.3 (80–130%). Both persist (`save.cameraPreset` / `save.cameraDistance`; migrate legacy names).
- **Occlusion:** raycast-cull/fade any stand between camera and pitch — the camera **owns** stand visibility; `stadium.js` must NOT toggle `stand.visible`.
- Brief celebration orbit cam on goals; camera shake ≤ 120 ms on hard shots.

---

## 8. MANAGEMENT, CAREER & LIVING-CLUB SYSTEMS

Build in dependency order; each layer is a DOM-free module with a headless test and a save-version migration.

**Team management:** create/pick club (name, procedural badge, kit colors), 18-man squad, formations (`442 / 433 / 4231 / 352 / 532` via `pickLineup`), starting XI + subs (bench swap + counter), tactics. Team-management pitch positions cards **absolutely** from `FORMATIONS[team.formation][p.idx]` so formation switches visibly rearrange.

**Player model & dossier:** the player schema (see §9) with a six-pack of attributes feeding the engine (pace→speed, pass→pass noise, shoot→shot error, defend→tackle contest, physical+dribble→shielding, dribble→first-touch). `playerForm()` = last-5 match-ratings average. Double-tap/click any player card → **dossier modal** (attribute bars/hexagon, season stats, form chip, market value; z-index 9500).

**Career (DLS-light, not FM):** main-menu **Career** entry → pick club → season. `core/career.js`: circle-method 19-round round-robin; `leagueTable()` **computed** from played fixtures (never stored); seeded `quickSim` for AI fixtures; `completeRound(career, userResult|null)` (null = sim the user's too, with goal attribution to the squad); `syncSeasonStats`; `applyCareerToClubs` at boot (re-applies progression deltas to the deterministically regenerated CLUBS); `endSeason` (summary + age-curve progression: <24 grow, 27+ plateau, 31+ decline, user-club form bonus; deltas persisted in `career.playerDev`). `migrateCareer` bumps `CAREER_VERSION`. Dashboard: position, last-5 form chips, top scorer, SIM/PLAY fixture, squad modal. Career matches always render the user as `teams[0]` but respect the fixture's real venue when recording.

**V4 living-club layers (in order):**
- **A — Finance (`core/finance.js`):** club balance in coins; per-fixture gate receipts scaled by rating + result bonus + weekly sponsor; season-end prize money by position; per-player `wage` from overall + age, wage bill deducted every matchday; balance may go transiently negative, forced highest-value non-GK sale if negative at season end. Dashboard FINANCES panel.
- **B — Transfers (`core/transfers.js`):** windows between seasons + every 5th matchday; ~12 seeded listings priced from `marketValue` ± demand noise; buy (fee, squad max 18, seller backfills a youth so squads never shrink); sell (resolves next matchday by price-vs-value probability); 2–3 seeded AI transfers per window in a news feed; `playerDev`/season stats follow player `id` across clubs; bought players immediately eligible in `pickLineup`.
- **C — Cup (`core/cup.js`):** 20 clubs, 4 byes by last table, R16→QF→SF→Final interleaved every ~4 matchdays; draws → seeded penalty shootout; user plays or sims; winner gets prize money + `career.history` trophy; CUP bracket panel.
- **D — Divisions:** Division 1 / 2 (top 10 by rating), 18-round double round-robin per division, bottom-2/top-2 swap at season end, cup stays cross-division.
- **E — Training & coaches (light):** one weekly focus (Attack/Defense/Fitness/Youth) with a small capped bonus; 3 hireable coach slots costing wages, amplifying the matching focus; total training effect ≤ ±2 rating points/season/player.

**Meta:** daily objectives, achievements, coins from matches/objectives.

---

## 9. DATA MODELS (copy these shapes)

**Player** (plain object, seeded, deterministic per club):
```
id: 'pl_<seq>', name, pos ('GK'|'DF'|'MF'|'FW'), num, age (18–34),
pace, shoot, pass, dribble, defend, physical, gk   // 42–96, primary near club rating
skin (0–4), hair (0–5), morale (55–90),
overall  // weighted by position (GK: gk .75/phys .15/pass .10; outfield per-pos weights)
marketValue (€m)  // pow(1.11, overall-60)*2.2*ageFactor, youth premium peaks ~23
wage             // V4-A, from overall + age
season: { apps, goals, assists, tackles, saves, matchRatings: [] }
```
`playerForm(p)` = avg of last 5 `matchRatings` (0 if none).

**Club:** `{ id, name, code (3-letter), region, rating, badgeStyle (0–4), kits:{home:[p,s], away:[p,s]}, squad (18), stars (1–5) }`. 20 clubs across england/spain/germany/france/italy/brazil/southamerica/africa. Squad shape: `2 GK, 6 DF, 6 MF, 4 FW`. Squads seeded (`makeRng(0xd00d + index*7919)`) so a club always has the same players.

**Config tunables** (single file — reproduce with these representative values, tune later):
- PITCH `105×68`, GOAL `7.32×2.44`, BOX `16.5×40.32`, PENALTY_SPOT `11`, MARGIN `6`.
- BALL: GRAVITY `-20`, AIR_DRAG `0.18`, GROUND_FRICTION `1.4`, RESTITUTION `0.55`, MAGNUS `5.2`, MAX_SPEED `38`, KICK_GRACE `0.25`.
- PLAYER: BASE_SPEED `6.2` (@pace 50), PACE_SPEED_SPAN `2.6`, SPRINT_MULT `1.38`, CONTROL_RADIUS `1.15`, DRIBBLE_SPEED_MULT `0.87`, FIRST_TOUCH_TIME `0.22`, RETACKLE_COOLDOWN `1.5`, TACKLE_RANGE `1.5`, SLIDE_RANGE `2.6`, SHOT_CHARGE_TIME `0.85`, GK_DIVE_SPEED `8.5`.
- AI: DECISION_INTERVAL `0.12`, PRESSERS `2`, PRESS_RADIUS `26`, SHOOT_RANGE `28`, LINE_DEPTH_SHIFT `14`, RUN_BEYOND `8`, GK_REACTION_BASE `0.26`.
- DIFFICULTY: amateur `{quality .6, gkReact 1.5, press .7, decision 1.6}`, pro `{.82, 1.0, 1.0, 1.0}`, legend `{.95, .72, 1.35, .7}`.
- CAMERA: FOV `50`, DIST `0.8–1.3`, SIDELINE `{h12,d22}`, BROADCAST `{h26,d40}`, TOPDOWN `{h58}`, END_TO_END `{h20,behind16}`.
- MATCH: HALF_OPTIONS `[120,180,300]`, CLOCK_MINUTES_PER_HALF `45`, GOAL_CELEBRATION `3.4`, AUTO_SWITCH `true`.

---

## 10. DRAWBACKS & PITFALLS TO WATCH FOR (hard-won — avoid every one)

These are the actual bugs the reference build hit. Treat this as a pre-flight checklist.

1. **Sides switching after every goal.** Root cause: re-entering the second-half state on every post-goal kickoff flipped attack direction + reset the clock. Guard the flip to `prev === HALF_TIME` only. Direction must have a single derived source of truth (`match.attackingDir`), never scattered booleans.
2. **Wrong goal attribution** — "any goal anywhere counts for the other team." Detect goals by the team attacking that goal, derived from `attackingDir` for the current half. One function, read by goal detection, kickoff, AI, and the HUD.
3. **Ball feels random / uncontrollable.** Never apply random impulses. Ball is a free body only when not dribbled; while dribbled it's kinematically attached. Deterministic physics; identical kicks ⇒ identical paths.
4. **Possession flicker** (ball ping-pongs between players on overlap). Possession is lost only via tackle-contest / interception / out-of-play, with a re-tackle lockout. Overlap alone never steals.
5. **`p.idx` vs array-order bugs.** `resetPositions`, `team.anchor(i,…)` (slot index, slot 0 = GK), and formation card placement all key off `p.idx`, which is reassigned by formation changes/slot swaps. Indexing `players[i]` there scatters players — second-half kickoff and formation switches were both broken by this.
6. **rAF stalls in a backgrounded tab freeze everything** — including screen transitions. Drive the sim with rAF but use `setTimeout` for screen wipes/navigation (the original `triggerWipe` froze on rAF).
7. **Stadium geometry over the pitch.** Stand local geometry extends ~16 m inward; anchor stands at `boundary + 16.5` and audit from all four camera presets. Nothing may ever overlap the pitch.
8. **Invisible screens / lineup intro.** `.screen` CSS defaults to `opacity:0` until `.in` is added — every screen must add `.in`. Player cards need actual CSS or they render invisibly.
9. **Kickoff hang from a render crash.** A crash inside `renderPlayerCard` (`p.name.split` on undefined) aborted the intro before `match.go(KICKOFF)`, leaving an idle pitch with no HUD. Callers pass either engine `Player` wrappers (`p.data` holds name/pos/num) or plain data — unwrap `player?.data ?? player`.
10. **Double-tap eaten by modal rebuilds.** A single-click handler that rebuilds the modal destroys the card before the native dblclick's second click. Do custom double-tap detection (~260 ms window, delay onClick, cancel on onDblClick).
11. **Modal z-order contract** (enforce): HT menu 1200 < settings 9000 < team-mgmt 9001 < stats 9400 < player popup 9500 < toasts 9999. The player popup was rendering under team management because it had no z-index.
12. **Service worker serves stale modules.** Bump the `sw.js` CACHE name on every file change and add new files to the ASSETS list; an already-open tab still needs a hard refresh (Ctrl+Shift+R) after a bump.
13. **AI produces 0 shots** unless pass options are damped inside shoot range (×0.55) and shooting is boosted < 14 m. Blowouts need GK dive-reach / shot-jitter tuning after any shielding change.
14. **Save corruption on schema change.** Every save-shape change bumps `CAREER_VERSION` with a migration; never corrupt an existing career. Quick Match must keep working unchanged after every phase.
15. **file:// won't run ES modules** — must be served over http(s). Document this.
16. **(Original tooling quirk, informational):** the reference dev environment's sandbox mount sometimes served stale/truncated copies of freshly edited files, breaking headless tests. If you see phantom syntax errors, re-read from source. Not a game bug — just don't chase ghosts.

---

## 11. BUILD ORDER (do not skip ahead)

1. **Shell + scene + camera.** index.html, scene.js, stadium.js, cameraController.js — DLS sideline view, shadows, occlusion. *Gate: at kickoff you clearly see 3D player bodies, ball with shadow, ~1/3 pitch; camera type + distance change and persist.*
2. **Stadium/hierarchy.** Everything outside the pitch, clean `Stadium/Pitch/PlayersAndBall/Lighting` hierarchy. *Gate: nothing obscures the pitch from any preset.*
3. **Ball/possession/passing/shooting rebuild.** The four deterministic modules + seeded `match.rng`. *Gate: dribble the pitch untouched, string 5+ deliberate passes, identical kicks ⇒ identical trajectories, loss only via tackle/interception/out.*
4. **Match flow menus.** FSM `FIRST_HALF→HALF_TIME→SECOND_HALF→FULL_TIME` + `PAUSED`; half-time & full-time full menus (Team Management, Match Statistics, Settings, Instant Replay stub, Sim to End, Forfeit, Continue); pause menu mirrors the set. *Gate: play a full match, sub + settings at HT, second half kicks off correctly, sim/forfeit reach a coherent FT screen.*
5. **AI sanity pass.** Off-ball shape + on-ball utility via shared systems. *Gate: AI-vs-AI looks like football.*
6. **Match-logic bug fixes.** Sides/attribution/restarts per §10 (1,2,5). Headless test asserting attribution across both halves.
7. **Player model & dossier.** Six-pack attributes feeding the engine, dossier modal, per-player match stats → ratings → season fold.
8. **Career season.** `core/career.js` round-robin, table, sim/play, progression, migration.
9. **V4 living club** — Finance → Transfers → Cup → Divisions → Training, each headless-tested with a `CAREER_VERSION` migration; bump SW cache each phase.

After each phase: run it (`python -m http.server 8000`), verify the gate, run headless tests + regressions, bump SW cache, update your own `CLAUDE.md`-style notes, then continue.

---

## 12. HEADLESS TESTING (mandatory)

Engine/core modules are DOM-free, so import them directly in Node (`tests/*.test.mjs`, run with `node tests/x.test.mjs`). Cover at minimum: match-rules goal attribution across both halves; seeded AI-sim plausibility (10 sims); player-model attribute→engine effects; career round-robin + table + progression; and each V4 phase's acceptance. All sims seeded and reproducible.

---

## 13. ACCEPTANCE CHECKLIST (verify before calling it done)

- [ ] Loads with **zero console errors** from a static server; works offline after first load (SW caches all files incl. vendor).
- [ ] Menu → team select → kickoff in under 4 clicks; all transitions animated.
- [ ] Full match start→finish with half-time and full-time results showing **real tracked stats**.
- [ ] Goals, throw-ins, corners, goal kicks restart correctly; score/clock/radar always accurate; **sides swap only at HT**; goals credited correctly.
- [ ] 3D players visibly animate: run cycles, kicks, slides, GK dives, celebration.
- [ ] Touch fully playable on a phone viewport; keyboard fully playable on desktop.
- [ ] No emoji anywhere; every icon/badge/texture code-generated; **no runtime network requests**.
- [ ] Dribble the pitch untouched; 5+ deliberate passes; identical kicks ⇒ identical trajectories.
- [ ] Career: start, play + sim fixtures, table updates, reload and continue, finish a season → next.
- [ ] Every player card opens a dossier; a fast player is visibly faster in game.
- [ ] Headless tests pass, all seeded and reproducible.

---

## 14. "AND BETTER" — go beyond the reference build

Apply only after the base game is playable end-to-end. Each item must preserve the hard constraints (no build step, Three.js only, zero external assets, headless-testable logic, seeded RNG).

**Gameplay depth**
- **Skill moves & set-piece control:** a light skill-move input (feint/step-over) affecting the dribble/tackle contest; aimed free kicks and penalties as a proper mini-interaction rather than an auto-sim.
- **Real offside** (activate the documented `rules.js` hook) as an optional toggle, with an assistant-flag animation.
- **Momentum/form on the pitch:** morale/form nudging in-match attribute rolls slightly, surfaced subtly (no stat treadmill).
- **Weather & time-of-day** (canvas-driven: rain particles + wetter/faster ball friction, dusk floodlight bloom) — pure code, seeded per fixture.

**Feel & polish**
- **Replay system** (record the deterministic input/seed stream, not video — cheap because the sim is reproducible) turning the "Instant Replay stub" into a real goal replay with the celebration orbit cam.
- **Procedural commentary ticker** driven by match events; **crowd audio** synthesized with the Web Audio API (no asset files) reacting to shots/goals.
- **Dynamic camera cuts** on set pieces and goals.

**Management depth (still DLS-light)**
- **Objectives/achievements** with coin rewards feeding Finance; **daily/seasonal challenges**.
- **Youth academy** producing regens tied to the Training focus; **player growth stories** in the news feed.
- **Club identity:** editable badge/kit editor (procedural, canvas), stadium tier upgrades that visibly change the 3D stands and gate receipts.
- **Standings/records screen** (all-time top scorers, trophies) via the seeded career history.

**Tech & UX**
- **Accessibility:** colorblind-safe kit-clash detection (auto-swap to away kit when home kits clash), remappable controls, larger-text option.
- **Performance:** instanced crowd meshes, LOD player models at distance, an explicit low/medium/high quality tier beyond the fps auto-probe.
- **Cloud-save-ready** save layer (keep it local, but shape the save so a future sync is a drop-in) and an export/import-save button.
- **Reduced-motion** setting that shortens transitions and disables camera shake.

Keep every addition tunable from `config.js`, seeded where it touches simulation, and covered by a headless test where it touches `core`/`engine`.
