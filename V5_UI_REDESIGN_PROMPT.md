# Dream Kick — V5 Prompt: Hub-Tile UI Redesign ("Boxes, not stacks")

Read `CLAUDE.md` first. V2–V4B are done. This prompt replaces the current
stacked-panel/vertical-list navigation with a **hub-and-tile architecture** like
Dream League Soccer 2024 and EA FC/FIFA 20: every major area is a tappable BOX
in a grid; tapping a box opens a DEDICATED PAGE for that area. No screen may be
a single tall column of stacked panels.

## References (studied — follow these, not memory)

1. **FIFA 20 (gameuidatabase.com/gameData.php?id=178, "Mode & Screen Select" +
   "Settings: Menu" screens):** a mosaic of rectangular tiles in 2 rows; ONE
   accent-colored tile marks the primary action (PLAY); every tile = icon +
   short label + optional sub-line; settings itself is a tile grid
   (Customise Controls / Game Settings / Video Calibration / …). Skewed edges,
   flat surfaces, strong typography.
2. **DLS 2024 home (user screenshots):** unequal-size card groups — one hero
   card (CAREER: club badge, stars, league position, next round), medium cards
   (Scenario, Dream Draft, Live), and a bottom row of small square cards
   (Challenges / Team / Transfers / My Club). Cards show LIVE data (form chips
   W/W/L, countdowns, badges) so the hub itself feels alive. Header is a thin
   strip with currencies/status; `>>` chevrons signal "this opens a page".
3. **ui-ux-pro-max skill (design-system run + pre-delivery checklist), key
   rules to enforce:** min touch target 44×44px with 8px+ gaps; NO emoji as
   icons (SVG only — extend `src/ui/icons.js`; the current 💱/👥/⏩ buttons
   violate this); press feedback scale 0.97→1.0 in 150–300ms; grid-stagger
   entrance (each 60ms, scale 0.92→1, y 16→0, back.out-style ease — CSS only,
   no GSAP dependency); respect `prefers-reduced-motion`; contrast ≥4.5:1 for
   text on tiles; predictable back behavior on EVERY page; avoid pure #000
   surfaces; focus states for keyboard.

## Keep

- Stack: vanilla ES modules, no build, no npm, Three.js vendored, zero external
  assets (NO Google Fonts import — keep the system font stack), files <400 lines.
- Identity: navy `#0b0e1a` bg, accent `#00d4a3`, skewed card/button edges,
  procedural badges/portraits. This is a REorganization + polish, not a rebrand.
- All existing logic modules untouched: engine/, core/ (career, finance,
  transfers). This prompt is UI-layer only (`src/ui/`, `styles/`).

## New primitives (build once, reuse everywhere)

In `src/ui/hub.js` + CSS in `styles/ui.css`:

- `hubTile({icon, title, sub, size, accent, badge, onOpen, liveHTML})` →
  a box. Sizes: `hero` (2×2), `wide` (2×1), `square` (1×1). `accent:true` =
  teal-filled primary tile (max ONE per hub). `liveHTML` = small live-data area
  (form chips, balance, countdown, next-opponent badge). Chevron `»` top-right.
- `hubGrid(tiles)` → responsive CSS grid: 4 columns desktop, 2 on <720px;
  hero spans 2×2. Grid-stagger entrance.
- `pageShell(title, backTarget)` → dedicated page wrapper: thin header strip
  (back chevron ≥44px, page title, right-side status: budget in career pages),
  content area, single scroll context. Back ALWAYS returns to the hub it came
  from (wire Escape key too).

## Screens (rebuild in this order)

### 1. HOME hub (replaces main menu)
Tiles: **KICK OFF** (hero, accent — quick match, shows last-match score line),
**CAREER** (wide — club badge, "S2 · MD 7/19", position + form chips),
**TRANSFERS** (square, shows •OPEN when window open — deep-links into career
market page), **HOW TO PLAY** (square), **SETTINGS** (square), **CLUB NEWS**
(square, latest headline). Bottom strip: version + sound toggle (existing).

### 2. CAREER hub (replaces the dashboard column layout)
Header strip: badge + club name + "SEASON n · MATCHDAY w/19" + budget.
Tiles: **NEXT MATCH** (hero, accent — both badges, venue, MD number; tap =
pre-match/PLAY), **LEAGUE TABLE** (wide — mini 3-row slice around your club),
**FIXTURES** (square — next 3 fixtures list), **FINANCES** (square — balance
big number + weekly net), **TRANSFERS** (square — window state + listings
count), **SQUAD** (square — OVR + best XI count), **CLUB NEWS** (wide — last
2 headlines), **SIM FIXTURE** (square, secondary action), **RESET** stays but
demoted into the Settings page, not the hub.

### 3. Dedicated pages (each opened from its tile, each using pageShell)
- **FIXTURES page** (new): full 19-round list grouped by matchday, your
  fixture highlighted, played scores shown, upcoming opponents with badges.
- **TABLE page**: the existing standings table, full width, zebra +
  pos-pill coloring (already built) — plus a "form" column (last-5 chips).
- **FINANCES page**: balance hero number, income/wages last-12 log as rows
  (from `career.finance.log`), projection, prize table preview.
- **TRANSFERS page**: promote the existing market modal content to a full
  page with the same three sections (listings / sell / news).
- **SQUAD page**: promote squad modal to a page; keep dossier popup.
- All pages keep working data-wiring from screens.js — move markup, not logic.

### 4. SETTINGS page (FIFA-style tile grid, from Home)
Tile grid, not a list: **CONTROLS**, **CAMERA**, **AUDIO**, **MATCH RULES**
(difficulty/half length), **DATA** (reset career, clear save). Each opens a
small focused panel. Reuse existing settings logic from settingsScreen.js.

### 5. HOW TO PLAY page (improve, don't just restyle)
Three tabs-as-tiles: **BASICS** (move/sprint/switch), **ATTACKING** (pass,
through-ball, shoot w/ charge meter explanation), **DEFENDING** (tackle,
contain). Each = illustrated card rows using inline SVG glyphs of the actual
keys/buttons (keyboard AND touch), not paragraphs. Add a "TIP" footer line
that rotates through existing loading tips.

## Rules

- Max ONE accent tile per hub; every tile ≥44px targets; SVG icons only (add
  to `icons.js`: finance/coins, fixtures/calendar, transfers/swap, squad/users,
  news, settings-gear exists?, question, table/list, play).
- Every page reachable in ≤2 taps from its hub; back (and Escape) always
  returns to the hub; browser history not required.
- Live data on tiles must come from existing modules (career/finance/transfers)
  — never duplicate computation in the UI.
- One scroll context per screen (no nested scrolling panels).
- Entrance: grid stagger ≤450ms total; press: scale .97; hover: subtle lift;
  all gated by `prefers-reduced-motion`.
- Keep `screens.js` under 400 lines by extracting: `hub.js`, `pages/careerPages.js`
  (fixtures/table/finances), `pages/howToPlay.js`, `pages/settingsPage.js` —
  update `sw.js` ASSETS + bump CACHE each phase.
- After each phase: verify in browser (hard refresh), run all headless tests
  (UI-only changes must not break them), update CLAUDE.md, STOP and report.

## Phases

- **Phase U1:** hub primitives + HOME hub (menu becomes tile mosaic).
- **Phase U2:** CAREER hub + Fixtures/Table/Finances pages.
- **Phase U3:** Transfers + Squad promoted to pages; tile deep-links.
- **Phase U4:** Settings tile-grid page + How to Play rebuild.
- **Phase U5:** polish pass with the skill's pre-delivery checklist (touch
  targets, contrast, reduced-motion, focus states, icon audit — no emojis left).

Acceptance for the whole prompt: nowhere in the app is primary navigation a
vertical stack of panels; every major area is a box that opens a page; Quick
Match, career flow, and all V2–V4 features work unchanged.
