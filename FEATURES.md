# Football Game — Final Spec (v1)

## Decisions (locked)
- Live playable matches — no simulation mode
- Controls: keyboard on desktop, touch (virtual joystick + buttons) on mobile — auto-detected
- Graphics: 100% code-drawn (canvas/SVG). No image files, no external links. 2D top-down with 2.5D effects (shadows, ball arc, pitch perspective)
- Real player names
- Single-player v1; code structured so online multiplayer can be added later
- Runs on desktop + mobile browsers, responsive
- Offline: PWA — service worker caches game after first visit; saves in localStorage/IndexedDB

## 1. Match Engine
- 11v11, AI teammates & opponents
- Move, pass, shoot, tackle, sprint, switch player
- Ball physics: bounce, arc, spin basics
- Match length options (3/5/10 min halves)
- Difficulty levels
- HUD: score, clock, mini-radar

## 2. Team / Club Management
- Create club: name, code-drawn logo, kit colors
- ~20-player squad with stats (pace, shooting, passing, defending, physical, GK)
- Formations & tactics
- Starting XI + subs

## 3. Career / Progression
- League divisions, promotion/relegation
- Season: fixtures, table, results
- Cup competition
- Training to develop players

## 4. Transfers & Economy
- Coins from matches/objectives
- Transfer market: buy/sell players (real names)

## 5. Stadium & Facilities
- Upgradeable stadium & training facilities

## 6. Meta
- Daily objectives, achievements

## 7. Tech
- HTML5 canvas (likely Phaser or vanilla), single-page app
- PWA: offline play + install-to-home-screen
- Saves: localStorage/IndexedDB

## Phase 2 (later)
- Online accounts + cloud saves
- Async PvP vs other users' teams
- Leaderboards
