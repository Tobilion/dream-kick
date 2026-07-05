# MASTER PROMPT — "Dream Kick": FIFA-Style 3D Football Game (Web)

Copy everything below the line into your AI coding tool.

---

## ROLE

You are a senior game developer and UI engineer. Build a complete, production-quality, browser-based 3D football (soccer) game called **Dream Kick**. The benchmark for gameplay feel is **Dream League Soccer**; the benchmark for UI/UX is **FIFA 20** (as documented on Game UI Database: flat 2.0 design, dark navy backgrounds, tile/card menus, broadcast-style HUD). Do not produce a toy demo — every screen and system listed here must be fully implemented and wired together.

## HARD CONSTRAINTS

1. **No build step.** Vanilla JavaScript ES modules (`<script type="module">`). Runs by serving the folder with any static server. No npm, no bundler, no framework.
2. **Three.js only** as the single third-party library, vendored locally at `vendor/three.module.js` (r160+). No other imports, no CDN calls at runtime.
3. **Zero external assets.** No image files, no emojis as UI graphics, no icon fonts, no Google Fonts. ALL visuals are generated in code:
   - UI icons: inline SVG drawn by a central `icons.js` module (ball, trophy, shirt, whistle, gear, arrows, play, pause).
   - Textures (grass stripes, crowd, kit patterns, ad boards, radar): generated at runtime on `<canvas>` and used as `THREE.CanvasTexture`.
   - Club badges: procedurally drawn SVG/canvas (shield/circle/diamond shapes + kit colors + initials).
   - Player portraits for menus: procedural canvas avatars (skin tone, hair shape/color, kit collar) — stylized, consistent, NOT emojis.
4. **Modular architecture.** No file over ~400 lines. Strict folder layout:
   ```
   index.html            (shell: canvas + UI root only, <100 lines)
   styles/ui.css         (all UI styling, CSS custom properties for theming)
   vendor/three.module.js
   src/main.js           (boot, game loop, screen router)
   src/core/config.js    (ALL tunable constants: physics, AI, camera, timings)
   src/core/math.js      (vec helpers, clamp, lerp, seeded RNG)
   src/core/state.js     (finite state machine: MENU → TEAM_SELECT → MATCH → RESULTS)
   src/core/save.js      (localStorage persistence)
   src/data/teams.js     (20 clubs: names, 3-letter codes, kit home/away colors, overall rating, full 18-man squads with per-player stats)
   src/data/names.js     (realistic player name pools per region)
   src/engine/match.js   (match orchestrator: phases KICKOFF/OPEN_PLAY/THROW_IN/CORNER/GOAL_KICK/GOAL_CELEBRATION/HALF_TIME/FULL_TIME)
   src/engine/ball.js    (3D ball physics)
   src/engine/player.js  (player entity: position, velocity, stamina, stats, actions)
   src/engine/team.js    (formation logic, tactical shape, line shifting)
   src/engine/ai.js      (decision-making: on-ball and off-ball)
   src/engine/goalkeeper.js
   src/engine/rules.js   (boundaries, goals, restarts, offside optional)
   src/render/scene.js   (renderer, lighting, resize, quality autodetect)
   src/render/stadium.js (pitch, goals w/ nets, stands, crowd, floodlights, ad boards)
   src/render/playerMesh.js (articulated low-poly humanoid + animation rig)
   src/render/ballMesh.js
   src/render/camera.js  (broadcast camera w/ smoothing, zoom by play context)
   src/render/effects.js (goal confetti particles, net ripple, kick dust)
   src/input/input.js    (unified action abstraction)
   src/input/keyboard.js
   src/input/touch.js    (virtual joystick + buttons)
   src/ui/screens.js     (menu/team-select/results DOM builders)
   src/ui/hud.js         (scoreboard, radar, indicators, commentary ticker)
   src/ui/icons.js       (inline SVG icon factory)
   ```
5. **Runs on desktop and mobile browsers**, 60 fps target on desktop, graceful quality scaling on mobile (fewer crowd instances, no shadows). PWA: keep `manifest.json` + `sw.js` caching every file.

## VISUAL DESIGN — FIFA 20 LANGUAGE (per Game UI Database reference)

- **Palette:** near-black navy `#0b0e1a` backgrounds, panel navy `#141a2e`, electric accent `#00d4a3` (teal-green), secondary accent `#3d6bff`, warning `#ff4d6d`, text `#f2f5ff`, dim `#8a93b5`. Subtle diagonal-line/halftone canvas-generated backdrop texture.
- **Typography:** system font stack with tight letter-spacing; oversized condensed-feel headings via `font-stretch`/scale transforms; tabular numerals for scores/clock.
- **Menus:** full-screen dark screens with a large heading top-left, horizontal **tile cards** (mode select) with hover/focus glow, sharp 45° skewed edge accents on cards and buttons (FIFA's slanted parallelogram motif), smooth 200ms slide+fade transitions between screens.
- **Team select:** two-column versus layout — each side shows procedural club badge, club name, star rating (SVG stars), overall, and a kit preview (canvas-drawn shirt in kit colors). Center "VS" divider with skewed divider bar. Difficulty selector (Amateur/Pro/Legend) and half-length selector (2/3/5 min) as segmented controls.
- **HUD (broadcast style):** top-left pill scoreboard: `[badge] HOME 2 - 1 AWAY [badge] | 67:42`, skewed left edge, accent underline in each team's kit color. Bottom-center **radar minimap** (canvas): pitch outline, colored dots per team, white dot ball, highlight ring on controlled player. Contextual button hints bottom-right (desktop: key glyphs; mobile: hidden). Player name-plate above controlled player (3D-projected DOM label). Goal banner: full-width skewed ribbon sliding in with "GOAL — scorer name, minute".
- **Pause menu:** dark blur overlay, vertical list menu (Resume / Restart / Camera / Sound / Quit) FIFA-style with left accent bar on the focused row.
- **Results screen:** final score hero panel, match stats table (possession %, shots, shots on target, passes, tackles), man-of-the-match card with procedural portrait, "Rematch" and "Main Menu" tile buttons.

## 3D WORLD

- **Pitch:** 105×68 units, canvas-texture grass with alternating mow stripes, correct white markings (halfway line, center circle, boxes, penalty spots, arcs, corner quadrants) drawn into the texture. Goals with posts, crossbar, and a **visible net** (wireframe/line segments) that ripples on goal via vertex displacement.
- **Stadium:** low-poly rectangular stands on 4 sides with a canvas "crowd" texture (thousands of random colored pixel dots, animated by cycling 2–3 texture frames), 4 corner floodlight towers with emissive lamps, canvas-textured ad boards around the pitch perimeter showing fictional brand names.
- **Players:** articulated low-poly humanoids built from primitives in a hierarchy: pelvis → torso (kit color + canvas number decal on back) → head (skin tone) + hair cap; upper/lower arms; upper/lower legs with hinge animation; boots. Animations driven procedurally in code: idle sway, walk, run cycle (arm/leg counter-swing scaled by speed), sprint lean, kick (wind-up + follow-through), slide tackle (body low, leg extended), GK dive (lateral pose), celebration (arms up jump), knocked-down + get-up. Blend between poses with lerp, no animation files.
- **Ball:** icosahedron with canvas pentagon-panel texture, rolls (rotation matches velocity), casts blob shadow.
- **Lighting:** hemisphere + one directional light; directional shadows on desktop only; **blob shadows** (dark transparent discs) under all players/ball always.
- **Camera:** elevated broadcast side view following ball with smoothed lerp and look-ahead in ball-travel direction; slight zoom-out when ball airborne/long ball, zoom-in near goals; brief celebration orbit cam on goals; camera shake ≤120ms on hard shots.

## GAMEPLAY LOGIC (Dream League Soccer feel)

- **11v11**, fixed timestep simulation (60 Hz) decoupled from render; match clock scaled to chosen half length; halftime switches ends.
- **Ball physics:** gravity, ground friction, air drag, restitution bounce, curl (Magnus-lite) on driven shots; ball is a free body — possession means the ball is nudged ahead of the dribbler each touch (touch spacing scales with sprint), interceptable by anyone.
- **User controls** (unified action layer):
  - Move: WASD/arrows or virtual joystick (analog magnitude on touch).
  - **Pass (A / X key / PASS button):** ground pass to best teammate in facing cone, power by distance, leads the receiver's run.
  - **Long ball/cross (hold Pass):** lofted pass with arc.
  - **Shoot (S / C key / SHOOT button):** power from hold duration (power bar UI above player), elevation and curl from hold time + movement direction; low driven vs rising shot.
  - **Sprint (Shift / SPRINT button):** drains stamina bar; stamina regens when jogging.
  - **Switch player (Q / SWITCH button):** cursor to teammate nearest ball with directional bias; auto-switch on interception.
  - **Tackle (D / X when defending):** standing tackle in range; hold = slide tackle (commit animation, brief recovery lockout; fouls → free kick, simplified).
- **AI (per-player utility scores, evaluated ~10 Hz, staggered):**
  - On-ball AI: score options {dribble toward goal, pass to open teammate (openness = passing-lane clearance + receiver advancement), through ball, shoot (distance/angle gated by shooting stat), clear if under pressure in own box}.
  - Off-ball attack: run to formation anchor blended toward ball-side overload; forwards make depth runs beyond last defender; fullbacks overlap.
  - Off-ball defense: compact block — two nearest defenders press ball-carrier, others man-mark zone, defensive line steps up/drops with ball position.
  - **Goalkeepers:** positioning on ball-goal line, narrow angle when attacker closes, react-dive to shots (reaction time & dive speed from GK stat), catch vs parry by shot power, distribute (throw to near fullback / kick long) after claim.
  - Difficulty scales: AI decision frequency, pass accuracy noise, GK reaction, press aggression.
- **Rules:** goals (net ripple, banner, celebration phase, kickoff restart), throw-ins, corners, goal kicks — all with proper ball placement, taker walk-to, and brief pre-take pause; simplified fouls → direct free kick; no offside in v1 (leave a documented hook in `rules.js`).
- **Match stats tracked** live for results screen: possession, shots, on target, pass counts/accuracy, tackles, scorer list with minutes.
- **Player stats matter:** pace → max speed/accel; shooting → shot power/accuracy; passing → pass accuracy/lead quality; defending → tackle range/success; physical → stamina pool + shielding; GK → reactions/dive.

## CODE QUALITY REQUIREMENTS

- Every module exports a small, documented API; no globals except a single injected `Game` context object.
- `config.js` holds every magic number, grouped and commented — the whole game must be tunable from one file.
- Fixed-timestep accumulator loop; all movement in units/second (never per-frame).
- JSDoc on public functions; consistent naming (`camelCase` functions, `SCREAMING_SNAKE` constants).
- Defensive quality autodetect: measure fps for 2s, drop shadow/crowd quality tiers if below 45 fps.
- No dead code, no TODO stubs — everything listed above must work.

## ACCEPTANCE CHECKLIST (verify before finishing)

- [ ] Loads with zero console errors from a static server, offline after first load (SW caches all files incl. vendor).
- [ ] Menu → team select → kickoff in under 4 clicks; all transitions animated.
- [ ] Full match playable start to finish with halftime and full-time results screen showing real tracked stats.
- [ ] Goals, throw-ins, corners, goal kicks all restart correctly; score/clock/radar always accurate.
- [ ] 3D players visibly animate: run cycles, kicks, slides, GK dives, goal celebration.
- [ ] Touch controls fully playable on a phone-sized viewport; keyboard fully playable on desktop.
- [ ] No emoji anywhere in UI; every icon/badge/texture is code-generated; no network requests at runtime.
