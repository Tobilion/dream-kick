# Dream Kick — V2 Gameplay Reinvention Prompt (post-overhaul bugfix + rebuild)

Paste everything below into your coding agent.

---

## Context

You are working on **Dream Kick**, a 3D football game (keep the existing stack and UI shell). A previous overhaul added a pause menu, settings, camera presets, and a match state machine, but the core experience is still broken. This pass is a **targeted reinvention of the match experience**, using **Dream League Soccer 2024 (DLS)** as the explicit visual and gameplay reference. Do not patch the old ball/camera code — where instructed, **rebuild from scratch**.

Reference: DLS's in-match view is a **low elevated sideline camera (~25–35° pitch angle)** showing about a third of the pitch, players clearly readable as 3D figures with shadows, a mini-radar at bottom-center showing all 22 players, a virtual joystick bottom-left, and action buttons (A/B/C style) bottom-right. That is the target feel.

Work in the order given. Verify each phase runs before starting the next.

---

## Phase 1 — Camera rebuild (do this FIRST; it is the root cause of "gameplay looks bad")

Delete/retire the current top-down default. Build a new `CameraController`:

- **Default "Sideline" camera (DLS-style):** positioned off the sideline, elevated, pitched at ~25–35°, following the ball with damped smoothing (spring/lerp — never snap) and a look-ahead offset in the direction of play. Frame roughly a third of the pitch so players are large enough to read as 3D bodies with visible depth.
- Perspective camera with a sensible FOV (~45–55°). Player models must cast shadows onto the pitch — shadows are what sell the 3D read.
- Settings expose: **Camera Type** (Sideline / Broadcast-high / Top-Down classic / End-to-End) and **Camera Distance** (e.g. 80–130% zoom), exactly like DLS's Game settings rows.
- Camera must never be occluded: if any stadium mesh comes between camera and pitch, fade or cull it.

**Acceptance:** at kickoff on the default camera you can clearly see player limbs/bodies in 3D, the ball on the ground with a shadow, and roughly a third of the pitch; changing Camera Type + Distance in settings visibly works and persists.

## Phase 2 — Stadium/rendering fixes

- The stadium roof still blocks the right side and the left crowd geometry intrudes onto the pitch. Fix model placement/scale so **all stadium and crowd geometry sits strictly outside the pitch + a margin**, and audit from every camera preset.
- Clean scene hierarchy: `Stadium` / `Pitch` / `PlayersAndBall` / `Lighting`, HUD as a 2D overlay layer.

**Acceptance:** from all four camera presets, nothing ever overlaps or obscures any part of the pitch.

## Phase 3 — Ball physics & possession rebuild (from scratch)

Throw away the current ball-movement code. The complaint: the ball moves randomly, players can't retain it, passes/kicks are unpredictable. Rebuild as separate modules (`BallPhysics`, `PossessionSystem`, `PassingSystem`, `ShootingSystem`) driven by a `MatchEngine` loop:

**BallPhysics**
- Deterministic 3D ball: gravity, ground friction/rolling deceleration, restitution bounce, capped max speed. NO random impulses anywhere. Given the same kick vector, the ball must travel the same path every time. Continuous collision so it never tunnels through players/pitch.

**PossessionSystem (dribbling & retention)**
- When the nearest player is within `CONTROL_RADIUS`, the ball becomes **attached**: it is kinematically carried at the player's feet with a small forward dribble offset, moving with them. It is NOT a free physics body while dribbled.
- Possession is lost ONLY via: a completed tackle contest (attribute-based: defending vs dribbling/strength, with a 1–2s re-tackle cooldown so possession never flickers), an interception of a pass in flight, or the ball going out of play. Overlapping an opponent must never steal the ball.
- Dribble speed = ~85–90% of off-ball sprint speed.

**PassingSystem**
- Pass button: pick the best teammate in a cone around the input direction, compute an exact kick vector to reach them (leading their movement), detach ball, apply vector. The ball travels in a straight, interceptable line — no randomness. Small accuracy noise may scale ONLY with passer rating + pressure, and must be subtle.
- Receiver takes a brief first touch (short control delay), then the ball attaches to them.

**ShootingSystem**
- Shot power from hold-duration or context; direction toward goal biased by aim input; accuracy modified by shooter rating, distance, angle, defender pressure. GK save chance from shot speed/placement vs GK rating. Again: computed outcomes, no coin-flip physics.

**Controls (DLS-style, keep current input scheme but map to):** move (joystick/keys), A = pass/tackle contextually, B = shoot/pressure, C = switch player (auto-switch to nearest also on).

**Acceptance:** you can dribble the length of the pitch untouched; string 5+ passes deliberately; opponents only win the ball via tackles/interceptions; identical kicks produce identical trajectories.

## Phase 4 — Match flow: half-time and full-time as full menus

Half-time and full-time currently offer only continue/end. Rebuild both on top of the match FSM (`… FIRST_HALF → HALF_TIME → SECOND_HALF → FULL_TIME`, `PAUSED` overlay):

- **Half-time screen (DLS/FC-style pause layout):** score header + clock, then a button grid: **Team Management**, **Match Statistics** (possession %, shots, on target, passes), **Game Settings**, **Instant Replay (optional/stub)**, **Sim to End**, **Forfeit** (confirm → recorded loss), **Continue to 2nd Half**. Teams switch sides; second-half kickoff must reset formations to centre reliably.
- **Full-time screen:** final score, stats, simple player ratings (reuse player-card components), then Rematch / Exit.
- The in-match pause menu must offer the same set (Resume instead of Continue). Any menu entered from half-time or pause returns to the correct state without breaking the sim.

**Acceptance:** play a full match making a sub + settings change at half-time; second half kicks off correctly; sim-to-end and forfeit both reach a coherent full-time screen.

## Phase 5 — Off-ball AI sanity pass

With the new possession/passing systems, retune AI so matches look like football:
- Formation-anchored positioning; forwards make runs in possession, everyone recovers shape when defending; nearest defender presses the carrier, others cover lanes.
- AI on the ball weighs: safe pass / forward pass / dribble / shoot / clear — using the SAME PassingSystem/ShootingSystem as the user (one code path, no separate AI physics).

**Acceptance:** watching AI vs AI (sim with rendering on), teams visibly build up, pass, and shoot without clustering into a blob.

---

## Architecture rules (unchanged, enforce)

- Modules: `MatchEngine`, `BallPhysics`, `PossessionSystem`, `PassingSystem`, `ShootingSystem`, `PlayerAI`, `TeamTactics`, `MatchRules`, `CameraController`, plus UI components per screen. Each file under ~400 lines. Gameplay logic fully separated from rendering/UI. No god-file.
- Do not change the main-menu UI look. Settings persist (existing persistence mechanism).
- After each phase, run the app and the type-check/build before moving on.

## Overall acceptance criteria

1. Default camera is the DLS-style sideline view; players read clearly as 3D; camera type + distance adjustable and persistent; pitch never obstructed.
2. Ball behavior is deterministic and controllable: reliable dribbling, retention, aimed passes, sensible shots.
3. Half-time and full-time present full menus (management, stats, settings, sim, forfeit) and all restarts work.
4. Code is modular per the named systems.
